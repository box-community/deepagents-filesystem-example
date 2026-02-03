/**
 * Seed Script for Deep Agents Virtual Filesystem
 *
 * This script loads seed data into the storage backends:
 * - S3: Company documentation from ./s3/
 * - SQLite: User profiles and conversation history from ./memories/
 *
 * Run with: bun run seed
 */

import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { S3Backend } from "./backends/s3-backend";
import { SQLiteBackend } from "./backends/sqlite-backend";

// Configuration from environment
const S3_BUCKET = process.env.AWS_S3_BUCKET;
const S3_ENDPOINT = process.env.AWS_S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_ENDPOINT || !S3_BUCKET) {
  console.error(
    "Error: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_ENDPOINT, and AWS_S3_BUCKET are required"
  );
  process.exit(1);
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Seed S3 with company documentation
 */
async function seedS3() {
  console.log("\n☁️  Seeding S3 with company documentation...\n");

  const s3Backend = new S3Backend({
    bucket: S3_BUCKET!,
    prefix: "docs",
    endpoint: S3_ENDPOINT!,
    forcePathStyle: false,
    clientConfig: {
      region: "us-west-2",
      credentials: {
        accessKeyId: S3_ACCESS_KEY!,
        secretAccessKey: S3_SECRET_KEY!,
      },
    },
  });

  const s3Dir = "./s3";
  let successCount = 0;
  let errorCount = 0;

  try {
    const files = getAllFiles(s3Dir);

    for (const filePath of files) {
      const relativePath = "/" + relative(s3Dir, filePath);
      const content = await Bun.file(filePath).text();

      // Delete first to allow re-seeding
      await s3Backend.delete(relativePath);
      const result = await s3Backend.write(relativePath, content);

      if (result.error) {
        console.log(`  ❌ ${relativePath}: ${result.error}`);
        errorCount++;
      } else {
        console.log(`  ✅ ${relativePath}`);
        successCount++;
      }
    }
  } catch (error: any) {
    console.error(`  Error reading s3 directory: ${error.message}`);
  }

  console.log(`\n  Total: ${successCount} succeeded, ${errorCount} failed`);
}

/**
 * Seed SQLite with user profiles and conversation history
 */
async function seedSQLite() {
  console.log("\n🗃️  Seeding SQLite with user data...\n");

  // Ensure data directory exists
  Bun.write("./data/.gitkeep", "");

  const sqliteBackend = new SQLiteBackend({
    dbPath: "./data/memories.db",
    namespace: "agent-memories",
  });

  const memoriesDir = "./memories";
  let successCount = 0;
  let errorCount = 0;

  try {
    const files = getAllFiles(memoriesDir);

    for (const filePath of files) {
      const relativePath = "/" + relative(memoriesDir, filePath);
      const content = Bun.file(filePath).text();

      // Delete first to allow re-seeding
      sqliteBackend.delete(relativePath);
      const result = sqliteBackend.write(relativePath, await content);

      if (result.error) {
        console.log(`  ❌ ${relativePath}: ${result.error}`);
        errorCount++;
      } else {
        console.log(`  ✅ ${relativePath}`);
        successCount++;
      }
    }
  } catch (error: any) {
    console.error(`  Error reading memories directory: ${error.message}`);
  }

  sqliteBackend.close();
  console.log(`\n  Total: ${successCount} succeeded, ${errorCount} failed`);
}

/**
 * Main seed function
 */
async function main() {
  console.log("🌱 Deep Agents Seed Script");
  console.log("=".repeat(50));

  // Seed S3
  await seedS3();

  // Seed SQLite
  await seedSQLite();

  console.log("\n" + "=".repeat(50));
  console.log("✅ Seeding complete!\n");
  console.log("You can now run the agent with: bun run start");
}

main().catch(console.error);
