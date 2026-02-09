/**
 * Custom Backend Implementations for Deep Agents Virtual Filesystem
 *
 * This module exports custom storage backends that implement the BackendProtocol:
 * - SQLiteBackend: Stores files in a SQLite database (sync API)
 * - BoxBackend: Stores files in Box via the Box Platform API (async API)
 */

export { SQLiteBackend, type SQLiteBackendOptions } from "./sqlite-backend";
export { BoxBackend, type BoxBackendOptions } from "./box-backend";
