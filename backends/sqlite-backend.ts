/**
 * SQLite Backend for Deep Agents Virtual Filesystem
 *
 * This backend presents a relational database as a virtual filesystem.
 * Data is stored in proper database tables, but exposed to the agent
 * as files (JSON for profiles, Markdown for history).
 *
 * Virtual file structure:
 * - /users/{name}.json → User profile from users table
 * - /history/{name}.md → Conversation history from conversations table
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

export interface SQLiteBackendOptions {
  /** Path to the SQLite database file */
  dbPath: string;
}

interface User {
  id: number;
  slug: string;
  name: string;
  email: string;
  role: string;
  company: string;
  industry: string;
  team_size: number;
  interests: string; // JSON array
  current_tools: string; // JSON array
  budget: string;
  decision_timeline: string;
  requirements: string | null; // JSON array
  created_at: string;
  updated_at: string;
}

interface Conversation {
  id: number;
  user_id: number;
  date: string;
  title: string;
  notes: string; // JSON array of bullet points
  created_at: string;
}

export class SQLiteBackend implements BackendProtocol {
  private db: Database;

  constructor(options: SQLiteBackendOptions) {
    this.db = new Database(options.dbPath, { create: true });
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Users table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        company TEXT NOT NULL,
        industry TEXT NOT NULL,
        team_size INTEGER NOT NULL,
        interests TEXT NOT NULL DEFAULT '[]',
        current_tools TEXT NOT NULL DEFAULT '[]',
        budget TEXT NOT NULL,
        decision_timeline TEXT NOT NULL,
        requirements TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Conversations table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_slug ON users(slug)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)`);
  }

  /**
   * Convert a name to a slug (filename)
   */
  private nameToSlug(name: string): string {
    return name.toLowerCase().replace(/\s+/g, "-");
  }

  /**
   * Convert a slug back to extract user info
   */
  private slugToPath(slug: string, type: "user" | "history"): string {
    if (type === "user") {
      return `/users/${slug}.json`;
    }
    return `/history/${slug}.md`;
  }

  /**
   * Parse a virtual path to determine what data to fetch
   */
  private parsePath(path: string): { type: "user" | "history" | "root" | "dir"; slug?: string } | null {
    if (path === "/" || path === "") {
      return { type: "root" };
    }
    if (path === "/users" || path === "/users/") {
      return { type: "dir" };
    }
    if (path === "/history" || path === "/history/") {
      return { type: "dir" };
    }

    const userMatch = path.match(/^\/users\/([^/]+)\.json$/);
    if (userMatch) {
      return { type: "user", slug: userMatch[1] };
    }

    const historyMatch = path.match(/^\/history\/([^/]+)\.md$/);
    if (historyMatch) {
      return { type: "history", slug: historyMatch[1] };
    }

    return null;
  }

  /**
   * Generate JSON content for a user profile
   */
  private userToJson(user: User): string {
    return JSON.stringify(
      {
        id: user.slug,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company,
        industry: user.industry,
        team_size: user.team_size,
        interests: JSON.parse(user.interests),
        current_tools: JSON.parse(user.current_tools),
        budget: user.budget,
        decision_timeline: user.decision_timeline,
        requirements: user.requirements ? JSON.parse(user.requirements) : undefined,
      },
      null,
      2
    );
  }

  /**
   * Generate Markdown content for conversation history
   */
  private conversationsToMarkdown(userName: string, conversations: Conversation[]): string {
    let md = `# Conversation History: ${userName}\n`;

    for (const conv of conversations) {
      md += `\n## ${conv.date} - ${conv.title}\n`;
      const notes = JSON.parse(conv.notes) as string[];
      for (const note of notes) {
        md += `- ${note}\n`;
      }
    }

    return md;
  }

  /**
   * List files and directories at the given path
   */
  lsInfo(path: string): FileInfo[] {
    const parsed = this.parsePath(path);
    if (!parsed) return [];

    if (parsed.type === "root") {
      return [
        { path: "/users/", is_dir: true, size: 0 },
        { path: "/history/", is_dir: true, size: 0 },
      ];
    }

    // List all users as files
    const users = this.db.prepare("SELECT slug, name, updated_at FROM users ORDER BY name").all() as User[];

    if (path === "/users" || path === "/users/") {
      return users.map((u) => ({
        path: `/users/${u.slug}.json`,
        is_dir: false,
        size: 0,
        modified_at: u.updated_at,
      }));
    }

    if (path === "/history" || path === "/history/") {
      return users.map((u) => ({
        path: `/history/${u.slug}.md`,
        is_dir: false,
        size: 0,
        modified_at: u.updated_at,
      }));
    }

    return [];
  }

  /**
   * Read file content with optional offset and limit
   */
  read(filePath: string, offset: number = 0, limit: number = 2000): string {
    const parsed = this.parsePath(filePath);
    if (!parsed || !parsed.slug) {
      return `Error: File '${filePath}' not found`;
    }

    let content: string;

    if (parsed.type === "user") {
      const user = this.db
        .prepare("SELECT * FROM users WHERE slug = ?")
        .get(parsed.slug) as User | null;
      if (!user) {
        return `Error: User '${parsed.slug}' not found`;
      }
      content = this.userToJson(user);
    } else if (parsed.type === "history") {
      const user = this.db
        .prepare("SELECT * FROM users WHERE slug = ?")
        .get(parsed.slug) as User | null;
      if (!user) {
        return `Error: User '${parsed.slug}' not found`;
      }
      const conversations = this.db
        .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY date")
        .all(user.id) as Conversation[];
      content = this.conversationsToMarkdown(user.name, conversations);
    } else {
      return `Error: File '${filePath}' not found`;
    }

    const lines = content.split("\n");
    const selectedLines = lines.slice(offset, offset + limit);

    return selectedLines
      .map((line, idx) => `${String(offset + idx + 1).padStart(6)}|${line}`)
      .join("\n");
  }

  /**
   * Read raw file data including metadata
   */
  readRaw(filePath: string): FileData {
    const parsed = this.parsePath(filePath);
    const now = new Date().toISOString();

    if (!parsed || !parsed.slug) {
      return {
        content: [`Error: File '${filePath}' not found`],
        created_at: now,
        modified_at: now,
      };
    }

    let content: string;
    let timestamps = { created_at: now, modified_at: now };

    if (parsed.type === "user") {
      const user = this.db
        .prepare("SELECT * FROM users WHERE slug = ?")
        .get(parsed.slug) as User | null;
      if (!user) {
        return {
          content: [`Error: User '${parsed.slug}' not found`],
          created_at: now,
          modified_at: now,
        };
      }
      content = this.userToJson(user);
      timestamps = { created_at: user.created_at, modified_at: user.updated_at };
    } else if (parsed.type === "history") {
      const user = this.db
        .prepare("SELECT * FROM users WHERE slug = ?")
        .get(parsed.slug) as User | null;
      if (!user) {
        return {
          content: [`Error: User '${parsed.slug}' not found`],
          created_at: now,
          modified_at: now,
        };
      }
      const conversations = this.db
        .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY date")
        .all(user.id) as Conversation[];
      content = this.conversationsToMarkdown(user.name, conversations);
      timestamps = { created_at: user.created_at, modified_at: user.updated_at };
    } else {
      return {
        content: [`Error: File '${filePath}' not found`],
        created_at: now,
        modified_at: now,
      };
    }

    return {
      content: content.split("\n"),
      created_at: timestamps.created_at,
      modified_at: timestamps.modified_at,
    };
  }

  /**
   * Write is not supported for this read-heavy demo
   * In a real app, you'd parse the JSON/Markdown and update the database
   */
  write(filePath: string, _content: string): WriteResult {
    return {
      error: `Error: Direct file writes not supported. Use database operations instead.`,
      path: filePath,
      filesUpdate: null,
    };
  }

  /**
   * Edit is not supported for this read-heavy demo
   */
  edit(
    filePath: string,
    _oldString: string,
    _newString: string,
    _replaceAll: boolean = false
  ): EditResult {
    return {
      error: `Error: Direct file edits not supported. Use database operations instead.`,
      path: filePath,
      filesUpdate: null,
      occurrences: 0,
    };
  }

  /**
   * Search for a pattern in synthesized files
   */
  grepRaw(pattern: string, _path?: string, _glob?: string): GrepMatch[] | string {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      return `Invalid regex pattern: ${pattern}`;
    }

    const matches: GrepMatch[] = [];
    const users = this.db.prepare("SELECT * FROM users ORDER BY name").all() as User[];

    for (const user of users) {
      // Search user profiles
      const userJson = this.userToJson(user);
      const userLines = userJson.split("\n");
      for (let i = 0; i < userLines.length; i++) {
        if (regex.test(userLines[i])) {
          matches.push({
            path: `/users/${user.slug}.json`,
            line: i + 1,
            text: userLines[i],
          });
        }
      }

      // Search conversation history
      const conversations = this.db
        .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY date")
        .all(user.id) as Conversation[];
      const historyMd = this.conversationsToMarkdown(user.name, conversations);
      const historyLines = historyMd.split("\n");
      for (let i = 0; i < historyLines.length; i++) {
        if (regex.test(historyLines[i])) {
          matches.push({
            path: `/history/${user.slug}.md`,
            line: i + 1,
            text: historyLines[i],
          });
        }
      }
    }

    return matches;
  }

  /**
   * Find files matching a glob pattern
   */
  globInfo(pattern: string, _path: string = "/"): FileInfo[] {
    const allFiles: FileInfo[] = [];
    const users = this.db.prepare("SELECT slug, updated_at FROM users").all() as User[];

    for (const user of users) {
      allFiles.push({
        path: `/users/${user.slug}.json`,
        is_dir: false,
        size: 0,
        modified_at: new Date(user.updated_at).toISOString(),
      });
      allFiles.push({
        path: `/history/${user.slug}.md`,
        is_dir: false,
        size: 0,
        modified_at: new Date(user.updated_at).toISOString(),
      });
    }

    // Simple glob matching
    const regexPattern = pattern
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, ".");

    const regex = new RegExp(`^${regexPattern}$`);
    return allFiles.filter((f) => regex.test(f.path));
  }

  // ============================================================================
  // Database Operations (for seeding and direct access)
  // ============================================================================

  /**
   * Insert or update a user
   */
  upsertUser(user: Omit<User, "id" | "created_at" | "updated_at">): number {
    const existing = this.db
      .prepare("SELECT id FROM users WHERE slug = ?")
      .get(user.slug) as { id: number } | null;

    if (existing) {
      this.db.prepare(`
        UPDATE users SET
          name = ?, email = ?, role = ?, company = ?, industry = ?,
          team_size = ?, interests = ?, current_tools = ?, budget = ?,
          decision_timeline = ?, requirements = ?, updated_at = datetime('now')
        WHERE slug = ?
      `).run(
        user.name, user.email, user.role, user.company, user.industry,
        user.team_size, user.interests, user.current_tools, user.budget,
        user.decision_timeline, user.requirements, user.slug
      );
      return existing.id;
    }

    const result = this.db.prepare(`
      INSERT INTO users (slug, name, email, role, company, industry, team_size,
        interests, current_tools, budget, decision_timeline, requirements)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.slug, user.name, user.email, user.role, user.company, user.industry,
      user.team_size, user.interests, user.current_tools, user.budget,
      user.decision_timeline, user.requirements
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Add a conversation for a user
   */
  addConversation(userSlug: string, conv: { date: string; title: string; notes: string[] }): void {
    const user = this.db
      .prepare("SELECT id FROM users WHERE slug = ?")
      .get(userSlug) as { id: number } | null;

    if (!user) {
      throw new Error(`User '${userSlug}' not found`);
    }

    // Delete existing conversation for this date to allow re-seeding
    this.db.prepare("DELETE FROM conversations WHERE user_id = ? AND date = ?").run(user.id, conv.date);

    this.db.prepare(`
      INSERT INTO conversations (user_id, date, title, notes)
      VALUES (?, ?, ?, ?)
    `).run(user.id, conv.date, conv.title, JSON.stringify(conv.notes));
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.db.run("DELETE FROM conversations");
    this.db.run("DELETE FROM users");
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
