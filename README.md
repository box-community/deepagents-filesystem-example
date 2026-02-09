# Deep Agents Virtual Filesystem Example

This example demonstrates how to use **Deep Agents** with multiple storage backends, showcasing the power of virtual filesystems for AI agents.

## Overview

The agent acts as a sales assistant that can:
- Read company documentation from **Box**
- Access customer profiles and conversation history from **SQLite**
- Generate personalized proposals to the **local filesystem**

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your Anthropic API key and Box Developer Token

# 3. Seed the data (uploads to Box and SQLite)
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
│ Box Backend   │ │ SQLite        │ │ Filesystem    │
│               │ │ Backend       │ │ Backend       │
│               │ │               │ │               │
│ Company docs  │ │ User profiles │ │ Generated     │
│ Pricing info  │ │ Conv history  │ │ proposals     │
└───────────────┘ └───────────────┘ └───────────────┘
```

## Seed Data

### Company Documentation (`./box-docs/`)

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
| `bun run seed` | Upload seed data to Box and SQLite |
| `bun run start` | Run the agent demo |

## Environment Variables

Create a `.env` file:

```bash
ANTHROPIC_API_KEY=your-anthropic-key

# Box Developer Token (generate from Box Developer Console → Configuration → Developer Token)
BOX_DEVELOPER_TOKEN=your-developer-token
```

For production use with Client Credentials Grant (CCG):

```bash
BOX_CLIENT_ID=your-box-client-id
BOX_CLIENT_SECRET=your-box-client-secret
BOX_USER_ID=your-box-user-id
# or BOX_ENTERPRISE_ID=your-box-enterprise-id
```

## Project Structure

```
deepagent-filesystem-example/
├── backends/
│   ├── sqlite-backend.ts   # SQLite → Virtual filesystem
│   └── box-backend.ts      # Box implementation
├── box-docs/               # Seed data for Box
│   ├── acme-corp/
│   ├── nexus-health/
│   ├── greenleaf-analytics/
│   └── edutech-pro/
├── workspace/             # Agent output (gitignored)
├── data/                  # SQLite database (gitignored)
│   └── memories.db        # Users + conversations tables
├── seed.ts               # Seed script (loads data into DB + Box)
├── index.ts              # Main agent demo
└── .env.example          # Example environment variables
```

## How It Works

1. **Seeding**: `bun run seed` uploads files from `./box-docs/` to a `deep-agents-docs` folder in your Box account, and inserts structured data into SQLite tables (`users`, `conversations`).

2. **Virtual Filesystem**: The `SQLiteBackend` synthesizes files from database queries:
   - `ls /memories/users/` → Queries `SELECT slug FROM users` → Returns `sarah-chen.json`, etc.
   - `read /memories/users/sarah-chen.json` → Queries user data → Returns formatted JSON
   - `read /memories/history/sarah-chen.md` → Joins `users` + `conversations` → Returns Markdown

3. **Agent Execution**: The agent uses filesystem tools (`ls`, `read_file`) which route to backends based on path:
   - `/docs/*` → Box (real files stored in your Box account)
   - `/memories/*` → SQLite (virtual files from database)
   - `/workspace/*` → Local filesystem (output)

4. **Output**: The agent writes the generated proposal to `/workspace/`.

## Customization

### Add a New Company

1. Create a folder in `./box-docs/your-company/`
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
