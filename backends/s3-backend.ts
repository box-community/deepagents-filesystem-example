/**
 * S3 Backend for Deep Agents Virtual Filesystem
 *
 * This backend stores files in an S3-compatible bucket.
 * Great for cloud storage, large file support, and integration with AWS services.
 *
 * Supports any S3-compatible storage:
 * - AWS S3
 * - MinIO
 * - Cloudflare R2
 * - DigitalOcean Spaces
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type {
  BackendProtocol,
  FileData,
  FileInfo,
  GrepMatch,
  WriteResult,
  EditResult,
} from "deepagents";
import { minimatch } from "minimatch";

export interface S3BackendOptions {
  /** S3 bucket name */
  bucket: string;
  /** Optional prefix for all keys (acts like a root directory) */
  prefix?: string;
  /** S3 client configuration */
  clientConfig?: S3ClientConfig;
  /** S3 endpoint for non-AWS S3-compatible services (e.g., MinIO) */
  endpoint?: string;
  /** Force path-style addressing (required for MinIO) */
  forcePathStyle?: boolean;
}

export class S3Backend implements BackendProtocol {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(options: S3BackendOptions) {
    this.bucket = options.bucket;
    this.prefix = options.prefix || "";

    // Configure S3 client
    const clientConfig: S3ClientConfig = {
      ...options.clientConfig,
    };

    if (options.endpoint) {
      clientConfig.endpoint = options.endpoint;
    }

    if (options.forcePathStyle) {
      clientConfig.forcePathStyle = true;
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Convert virtual path to S3 key
   */
  private pathToKey(path: string): string {
    // Remove leading slash and normalize
    let key = path.startsWith("/") ? path.slice(1) : path;
    if (this.prefix) {
      key = this.prefix + "/" + key;
    }
    return key;
  }

  /**
   * Convert S3 key to virtual path
   */
  private keyToPath(key: string): string {
    let path = key;
    if (this.prefix && path.startsWith(this.prefix + "/")) {
      path = path.slice(this.prefix.length + 1);
    }
    return "/" + path;
  }

  /**
   * List files and directories at the given path
   */
  async lsInfo(path: string): Promise<FileInfo[]> {
    const prefix = this.pathToKey(path);
    const delimiter = "/";

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix === "" ? undefined : prefix.endsWith("/") ? prefix : prefix + "/",
      Delimiter: delimiter,
    });

    try {
      const response = await this.client.send(command);
      const results: FileInfo[] = [];

      // Add directories (CommonPrefixes)
      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (prefix.Prefix) {
            results.push({
              path: this.keyToPath(prefix.Prefix.slice(0, -1)), // Remove trailing /
              is_dir: true,
              size: 0,
            });
          }
        }
      }

      // Add files
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && !obj.Key.endsWith("/")) {
            results.push({
              path: this.keyToPath(obj.Key),
              is_dir: false,
              size: obj.Size || 0,
              modified_at: obj.LastModified?.toISOString() || undefined,
            });
          }
        }
      }

      return results.sort((a, b) => a.path.localeCompare(b.path));
    } catch (error) {
      console.error("S3 ls error:", error);
      return [];
    }
  }

  /**
   * Read file content with optional offset and limit
   */
  async read(
    filePath: string,
    offset: number = 0,
    limit: number = 2000
  ): Promise<string> {
    const key = this.pathToKey(filePath);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      const content = await response.Body?.transformToString();

      if (!content) {
        return `Error: File '${filePath}' is empty or unreadable`;
      }

      const lines = content.split("\n");
      const selectedLines = lines.slice(offset, offset + limit);

      // Format with line numbers
      return selectedLines
        .map((line, idx) => `${String(offset + idx + 1).padStart(6)}|${line}`)
        .join("\n");
    } catch (error: any) {
      if (error.name === "NoSuchKey") {
        return `Error: File '${filePath}' not found`;
      }
      return `Error reading file: ${error.message}`;
    }
  }

  /**
   * Read raw file data including metadata
   */
  async readRaw(filePath: string): Promise<FileData> {
    const key = this.pathToKey(filePath);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      const content = await response.Body?.transformToString();

      const now = new Date().toISOString();
      const lastModified = response.LastModified?.toISOString() || now;

      if (!content) {
        return {
          content: [`Error: File '${filePath}' is empty or unreadable`],
          created_at: lastModified,
          modified_at: lastModified,
        };
      }

      return {
        content: content.split("\n"),
        created_at: lastModified, // S3 doesn't track creation time separately
        modified_at: lastModified,
      };
    } catch (error: any) {
      const now = new Date().toISOString();
      if (error.name === "NoSuchKey") {
        return {
          content: [`Error: File '${filePath}' not found`],
          created_at: now,
          modified_at: now,
        };
      }
      return {
        content: [`Error reading file: ${error.message}`],
        created_at: now,
        modified_at: now,
      };
    }
  }

  /**
   * Write a new file (fails if file exists)
   */
  async write(filePath: string, content: string): Promise<WriteResult> {
    const key = this.pathToKey(filePath);

    // Check if file already exists
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      // File exists
      return {
        error: `Error: File '${filePath}' already exists. Use edit to modify existing files.`,
        path: filePath,
        filesUpdate: null,
      };
    } catch (error: any) {
      if (error.name !== "NotFound") {
        // Unexpected error
        return {
          error: `Error checking file existence: ${error.message}`,
          path: filePath,
          filesUpdate: null,
        };
      }
    }

    // File doesn't exist, create it
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: content,
          ContentType: this.getContentType(filePath),
        })
      );

      return {
        error: undefined,
        path: filePath,
        filesUpdate: null,
      };
    } catch (error: any) {
      return {
        error: `Error writing file: ${error.message}`,
        path: filePath,
        filesUpdate: null,
      };
    }
  }

  /**
   * Edit an existing file by replacing old_string with new_string
   */
  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll: boolean = false
  ): Promise<EditResult> {
    const key = this.pathToKey(filePath);

    // Read existing content
    let content: string;
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      content = (await response.Body?.transformToString()) || "";
    } catch (error: any) {
      if (error.name === "NoSuchKey") {
        return {
          error: `Error: File '${filePath}' not found`,
          path: filePath,
          filesUpdate: null,
          occurrences: 0,
        };
      }
      return {
        error: `Error reading file: ${error.message}`,
        path: filePath,
        filesUpdate: null,
        occurrences: 0,
      };
    }

    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      return {
        error: `Error: '${oldString}' not found in file`,
        path: filePath,
        filesUpdate: null,
        occurrences: 0,
      };
    }

    if (!replaceAll && occurrences > 1) {
      return {
        error: `Error: '${oldString}' found ${occurrences} times. Use replaceAll=true to replace all occurrences, or provide more context for a unique match.`,
        path: filePath,
        filesUpdate: null,
        occurrences,
      };
    }

    const newContent = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    // Write updated content
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: newContent,
          ContentType: this.getContentType(filePath),
        })
      );

      return {
        error: undefined,
        path: filePath,
        filesUpdate: null,
        occurrences: replaceAll ? occurrences : 1,
      };
    } catch (error: any) {
      return {
        error: `Error writing file: ${error.message}`,
        path: filePath,
        filesUpdate: null,
        occurrences: 0,
      };
    }
  }

  /**
   * Search for a pattern in files
   */
  async grepRaw(
    pattern: string,
    path?: string,
    glob?: string
  ): Promise<GrepMatch[] | string> {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return `Invalid regex pattern: ${pattern}`;
    }

    // List all files under path
    const prefix = path ? this.pathToKey(path) : this.prefix;

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix || undefined,
    });

    try {
      const response = await this.client.send(command);
      const matches: GrepMatch[] = [];

      if (!response.Contents) {
        return matches;
      }

      // Process files (limit to prevent timeout)
      const filesToProcess = response.Contents.slice(0, 100);

      for (const obj of filesToProcess) {
        if (!obj.Key || obj.Key.endsWith("/")) continue;

        const virtualPath = this.keyToPath(obj.Key);

        // Apply glob filter
        if (glob && !minimatch(virtualPath, glob)) {
          continue;
        }

        // Read file content
        try {
          const getCommand = new GetObjectCommand({
            Bucket: this.bucket,
            Key: obj.Key,
          });
          const response = await this.client.send(getCommand);
          const content = await response.Body?.transformToString();

          if (content) {
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                matches.push({
                  path: virtualPath,
                  line: i + 1,
                  text: lines[i],
                });
              }
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return matches;
    } catch (error: any) {
      return `Error searching files: ${error.message}`;
    }
  }

  /**
   * Find files matching a glob pattern
   */
  async globInfo(pattern: string, path: string = "/"): Promise<FileInfo[]> {
    const prefix = this.pathToKey(path);

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix || undefined,
    });

    try {
      const response = await this.client.send(command);
      const results: FileInfo[] = [];

      if (!response.Contents) {
        return results;
      }

      for (const obj of response.Contents) {
        if (!obj.Key) continue;

        const virtualPath = this.keyToPath(obj.Key);

        if (minimatch(virtualPath, pattern)) {
          results.push({
            path: virtualPath,
            is_dir: obj.Key.endsWith("/"),
            size: obj.Size || 0,
            modified_at: obj.LastModified?.toISOString() || undefined,
          });
        }
      }

      return results;
    } catch (error) {
      console.error("S3 glob error:", error);
      return [];
    }
  }

  /**
   * Delete a file
   */
  async delete(filePath: string): Promise<boolean> {
    const key = this.pathToKey(filePath);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      txt: "text/plain",
      md: "text/markdown",
      json: "application/json",
      js: "application/javascript",
      ts: "application/typescript",
      html: "text/html",
      css: "text/css",
      yaml: "text/yaml",
      yml: "text/yaml",
      xml: "application/xml",
    };
    return contentTypes[ext || ""] || "text/plain";
  }
}
