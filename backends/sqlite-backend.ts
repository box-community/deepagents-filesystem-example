/**
 * SQLite Backend for Deep Agents Virtual Filesystem
 *
 * This backend stores files in a SQLite database using Bun's built-in SQLite driver.
 * Great for persistent storage with full SQL querying capabilities.
 */
import { Database } from "bun:sqlite";
import type {
  BackendProtocol,
  FileData,
  FileInfo,
  GrepMatch,
  WriteResult,
  EditResult,
} from "deepagents";
import { minimatch } from "minimatch";

export interface SQLiteBackendOptions {
  /** Path to the SQLite database file */
  dbPath: string;
  /** Optional namespace for multi-tenancy */
  namespace?: string;
}

export class SQLiteBackend implements BackendProtocol {
  private db: Database;
  private namespace: string;

  constructor(options: SQLiteBackendOptions) {
    this.db = new Database(options.dbPath, { create: true });
    this.namespace = options.namespace || "default";
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        namespace TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        is_dir INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        modified_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(namespace, path)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_files_namespace_path
      ON files(namespace, path)
    `);
  }

  /**
   * Normalize path to ensure it starts with /
   */
  private normalizePath(path: string): string {
    if (!path.startsWith("/")) {
      path = "/" + path;
    }
    // Remove trailing slash unless it's the root
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return path;
  }

  /**
   * List files and directories at the given path
   */
  lsInfo(path: string): FileInfo[] {
    path = this.normalizePath(path);

    // For root, list all top-level entries
    const prefix = path === "/" ? "/" : path + "/";

    const stmt = this.db.prepare(`
      SELECT path, is_dir, size, modified_at
      FROM files
      WHERE namespace = ? AND (
        path LIKE ? AND path NOT LIKE ?
      )
      ORDER BY path
    `);

    // Match direct children only
    const directChildPattern = prefix === "/" ? "/%" : prefix + "%";
    const excludeNested =
      prefix === "/" ? "/%/%" : prefix + "%/%";

    const rows = stmt.all(
      this.namespace,
      directChildPattern,
      excludeNested
    ) as Array<{
      path: string;
      is_dir: number;
      size: number;
      modified_at: string;
    }>;

    return rows.map((row) => ({
      path: row.path,
      isDir: Boolean(row.is_dir),
      size: row.size,
      modifiedAt: new Date(row.modified_at),
    }));
  }

  /**
   * Read file content with optional offset and limit
   */
  read(filePath: string, offset: number = 0, limit: number = 2000): string {
    filePath = this.normalizePath(filePath);

    const stmt = this.db.prepare(`
      SELECT content, is_dir FROM files
      WHERE namespace = ? AND path = ?
    `);

    const row = stmt.get(this.namespace, filePath) as {
      content: string;
      is_dir: number;
    } | null;

    if (!row) {
      return `Error: File '${filePath}' not found`;
    }

    if (row.is_dir) {
      return `Error: '${filePath}' is a directory`;
    }

    const lines = row.content.split("\n");
    const selectedLines = lines.slice(offset, offset + limit);

    // Format with line numbers
    return selectedLines
      .map((line, idx) => `${String(offset + idx + 1).padStart(6)}|${line}`)
      .join("\n");
  }

  /**
   * Read raw file data including metadata
   */
  readRaw(filePath: string): FileData {
    filePath = this.normalizePath(filePath);

    const stmt = this.db.prepare(`
      SELECT content, is_dir, created_at, modified_at FROM files
      WHERE namespace = ? AND path = ?
    `);

    const row = stmt.get(this.namespace, filePath) as {
      content: string;
      is_dir: number;
      created_at: string;
      modified_at: string;
    } | null;

    if (!row) {
      return {
        content: [`Error: File '${filePath}' not found`],
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
      };
    }

    if (row.is_dir) {
      return {
        content: [`Error: '${filePath}' is a directory`],
        created_at: row.created_at,
        modified_at: row.modified_at,
      };
    }

    return {
      content: row.content.split("\n"),
      created_at: row.created_at,
      modified_at: row.modified_at,
    };
  }

  /**
   * Write a new file (fails if file exists)
   */
  write(filePath: string, content: string): WriteResult {
    filePath = this.normalizePath(filePath);

    // Check if file already exists
    const existsStmt = this.db.prepare(`
      SELECT 1 FROM files WHERE namespace = ? AND path = ?
    `);

    if (existsStmt.get(this.namespace, filePath)) {
      return {
        error: `Error: File '${filePath}' already exists. Use edit to modify existing files.`,
        path: filePath,
        filesUpdate: null,
      };
    }

    // Ensure parent directories exist
    this.ensureParentDirectories(filePath);

    const stmt = this.db.prepare(`
      INSERT INTO files (namespace, path, content, is_dir, size, modified_at)
      VALUES (?, ?, ?, 0, ?, datetime('now'))
    `);

    try {
      stmt.run(this.namespace, filePath, content, content.length);
      return {
        error: undefined,
        path: filePath,
        filesUpdate: null, // External backend, not state-based
      };
    } catch (error) {
      return {
        error: `Error writing file: ${error}`,
        path: filePath,
        filesUpdate: null,
      };
    }
  }

  /**
   * Edit an existing file by replacing old_string with new_string
   */
  edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll: boolean = false
  ): EditResult {
    filePath = this.normalizePath(filePath);

    const stmt = this.db.prepare(`
      SELECT content FROM files
      WHERE namespace = ? AND path = ? AND is_dir = 0
    `);

    const row = stmt.get(this.namespace, filePath) as { content: string } | null;

    if (!row) {
      return {
        error: `Error: File '${filePath}' not found`,
        path: filePath,
        filesUpdate: null,
        occurrences: 0,
      };
    }

    const content = row.content;
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

    const updateStmt = this.db.prepare(`
      UPDATE files
      SET content = ?, size = ?, modified_at = datetime('now')
      WHERE namespace = ? AND path = ?
    `);

    updateStmt.run(newContent, newContent.length, this.namespace, filePath);

    return {
      error: undefined,
      path: filePath,
      filesUpdate: null,
      occurrences: replaceAll ? occurrences : 1,
    };
  }

  /**
   * Search for a pattern in files
   */
  grepRaw(
    pattern: string,
    path?: string,
    glob?: string
  ): GrepMatch[] | string {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return `Invalid regex pattern: ${pattern}`;
    }

    const basePath = path ? this.normalizePath(path) : "/";

    const stmt = this.db.prepare(`
      SELECT path, content FROM files
      WHERE namespace = ? AND path LIKE ? AND is_dir = 0
    `);

    const rows = stmt.all(this.namespace, basePath + "%") as Array<{
      path: string;
      content: string;
    }>;

    const matches: GrepMatch[] = [];

    for (const row of rows) {
      // Apply glob filter if provided
      if (glob && !minimatch(row.path, glob)) {
        continue;
      }

      const lines = row.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            path: row.path,
            line: i + 1,
            text: lines[i],
          });
        }
      }
    }

    return matches;
  }

  /**
   * Find files matching a glob pattern
   */
  globInfo(pattern: string, path: string = "/"): FileInfo[] {
    path = this.normalizePath(path);

    const stmt = this.db.prepare(`
      SELECT path, is_dir, size, modified_at FROM files
      WHERE namespace = ? AND path LIKE ?
    `);

    const rows = stmt.all(this.namespace, path + "%") as Array<{
      path: string;
      is_dir: number;
      size: number;
      modified_at: string;
    }>;

    return rows
      .filter((row) => minimatch(row.path, pattern))
      .map((row) => ({
        path: row.path,
        isDir: Boolean(row.is_dir),
        size: row.size,
        modifiedAt: new Date(row.modified_at),
      }));
  }

  /**
   * Ensure parent directories exist for a file path
   */
  private ensureParentDirectories(filePath: string): void {
    const parts = filePath.split("/").filter(Boolean);
    let currentPath = "";

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += "/" + parts[i];

      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO files (namespace, path, content, is_dir, size)
        VALUES (?, ?, '', 1, 0)
      `);

      stmt.run(this.namespace, currentPath);
    }
  }

  /**
   * Delete a file (useful for cleanup)
   */
  delete(filePath: string): boolean {
    filePath = this.normalizePath(filePath);

    const stmt = this.db.prepare(`
      DELETE FROM files WHERE namespace = ? AND path = ?
    `);

    const result = stmt.run(this.namespace, filePath);
    return result.changes > 0;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
