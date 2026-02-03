/**
 * Custom Backend Implementations for Deep Agents Virtual Filesystem
 *
 * This module exports custom storage backends that implement the BackendProtocol:
 * - SQLiteBackend: Stores files in a SQLite database (sync API)
 * - S3Backend: Stores files in an S3-compatible bucket (async API)
 */

export { SQLiteBackend, type SQLiteBackendOptions } from "./sqlite-backend";
export { S3Backend, type S3BackendOptions } from "./s3-backend";
