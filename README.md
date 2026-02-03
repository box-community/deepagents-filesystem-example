# Deep Agents Virtual Filesystem Example

This example demonstrates how to use **Deep Agents** with multiple storage backends, showcasing the power of virtual filesystems for AI agents.

## Overview

The agent acts as a sales assistant that can:
- Read company documentation from **S3**
- Access customer profiles and conversation history from **SQLite**
- Generate personalized proposals to the **local filesystem**

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# 3. Seed the data (uploads to S3 and SQLite)
bun run seed

# 4. Run the agent
bun run start
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Deep Agent                              │
│                  (AI Sales Assistant)                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   CompositeBackend                           │
│                    (Path Router)                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ /docs/        │ │ /memories/    │ │ /workspace/   │
│               │ │               │ │               │
│ S3 Backend    │ │ SQLite        │ │ Filesystem    │
│               │ │ Backend       │ │ Backend       │
│               │ │               │ │               │
│ Company docs  │ │ User profiles │ │ Generated     │
│ Pricing info  │ │ Conv history  │ │ proposals     │
└───────────────┘ └───────────────┘ └───────────────┘
```

## Seed Data

### Company Documentation (`./s3/`)

| Company | Files |
|---------|-------|
| Acme Corp | company-info.md, pricing.md, integrations.md |
| Nexus Health | company-info.md, pricing.md, compliance.md |
| GreenLeaf Analytics | company-info.md, pricing.md |
| EduTech Pro | company-info.md, pricing.md |

### Customer Data (SQLite Database)

Customer data is stored in a **proper relational database** with `users` and `conversations` tables. The `SQLiteBackend` synthesizes a virtual filesystem from the database:

| Customer | Role | Company | Industry | Conversations |
|----------|------|---------|----------|---------------|
| Sarah Chen | Engineering Manager | TechStartup Inc | SaaS | 4 |
| Marcus Johnson | CTO | City General Hospital | Healthcare | 4 |
| Elena Rodriguez | Sustainability Director | SustainableCo | Manufacturing | 4 |
| David Kim | Director of Online Learning | West Coast CC | Education | 4 |
| Priya Sharma | VP of Engineering | FinTech Innovations | Finance | 5 |

**Virtual file mapping:**
- `/memories/users/{name}.json` → Generated from `users` table
- `/memories/history/{name}.md` → Generated from `conversations` table

## Scripts

| Command | Description |
|---------|-------------|
| `bun run seed` | Upload seed data to S3 and SQLite |
| `bun run start` | Run the agent demo |
| `bun run demo` | Test backends without API key |

## Environment Variables

Create a `.env` file:

```bash
ANTHROPIC_API_KEY=your-anthropic-key

# S3 Configuration
AWS_S3_ENDPOINT=https://s3.us-west-2.amazonaws.com
AWS_S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Project Structure

```
deepagent-sandbox-example/
├── backends/
│   ├── sqlite-backend.ts   # SQLite → Virtual filesystem
│   └── s3-backend.ts       # S3 implementation
├── s3/                     # Seed data for S3
│   ├── acme-corp/
│   ├── nexus-health/
│   ├── greenleaf-analytics/
│   └── edutech-pro/
├── workspace/             # Agent output (gitignored)
├── data/                  # SQLite database (gitignored)
│   └── memories.db        # Users + conversations tables
├── seed.ts               # Seed script (loads data into DB + S3)
├── index.ts              # Main agent demo
└── demo-backends.ts      # Backend test script
```

## How It Works

1. **Seeding**: `bun run seed` uploads files from `./s3/` to S3, and inserts structured data into SQLite tables (`users`, `conversations`).

2. **Virtual Filesystem**: The `SQLiteBackend` synthesizes files from database queries:
   - `ls /memories/users/` → Queries `SELECT slug FROM users` → Returns `sarah-chen.json`, etc.
   - `read /memories/users/sarah-chen.json` → Queries user data → Returns formatted JSON
   - `read /memories/history/sarah-chen.md` → Joins `users` + `conversations` → Returns Markdown

3. **Agent Execution**: The agent uses filesystem tools (`ls`, `read_file`) which route to backends based on path:
   - `/docs/*` → S3 (real files)
   - `/memories/*` → SQLite (virtual files from database)
   - `/workspace/*` → Local filesystem (output)

4. **Output**: The agent writes the generated proposal to `/workspace/`.

## Customization

### Add a New Company

1. Create a folder in `./s3/your-company/`
2. Add markdown files (company-info.md, pricing.md, etc.)
3. Run `bun run seed`

### Add a New Customer

Add a new user object to the `USERS` array in `seed.ts`:

```typescript
{
  slug: "new-customer",
  name: "New Customer",
  email: "new@example.com",
  role: "CTO",
  company: "Example Corp",
  industry: "Tech",
  team_size: 20,
  interests: ["automation"],
  current_tools: ["GitHub"],
  budget: "enterprise",
  decision_timeline: "Q1 2025",
  requirements: null,
  conversations: [
    {
      date: "2024-03-01",
      title: "Initial Call",
      notes: ["Discussed requirements", "Very interested"],
    },
  ],
}
```

Then run `bun run seed`.

## License

MIT
