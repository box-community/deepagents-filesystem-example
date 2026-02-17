# LangChain Deep Agents Filesystem Backend Example (Box Implementation)

This example demonstrates how to implement LangChain [Deep Agents](https://docs.langchain.com/oss/python/deepagents/overview) storage [backends](https://docs.langchain.com/oss/javascript/deepagents/backends), showcasing how virtual filesystems allow agents to route operations across Box, SQLite, and the local filesystem.

## Demo

![Box Deep Agents Demo](./assets/demo.gif)

Running `bun run seed` populates Box with sample documents.
Running `bun run start` generates a personalized proposal and uploads it back to Box.

## Overview

The agent acts as a sales assistant that can:
- Read company documentation from **Box**
- Access customer profiles and conversation history from **SQLite**
- Generate personalized proposals to the **local filesystem**

## Prerequisites

Before you begin, make sure you have the following:

### 1. Bun runtime

This project uses [Bun](https://bun.sh) as its JavaScript/TypeScript runtime.

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

### 2. Anthropic API key

You need an API key from [Anthropic](https://console.anthropic.com/) to power the agent.

1. Sign up or log in at <https://console.anthropic.com/>
2. Navigate to **API Keys**
3. Click **Create Key** and copy the value (starts with `sk-ant-...`)

### 3. Box Developer Token

The project uses Box as a cloud document store. You'll need a free Box developer account and a Developer Token.

1. Sign up for a free account at <http://account.box.com/developer/signup>
2. Go to the [Box Developer Console](https://app.box.com/developers/console)
3. Click **Create New App** (choose *Custom App* with *Server Authentication (Client Credentials Grant)*)
4. Once the app is created, go to the app's **Configuration** tab
5. Under **Application Scopes**, make sure **"Write all files and folders stored in Box"** is enabled (the seed script needs this to create folders and upload files)
6. Scroll down to **Developer Token** and click **Generate Developer Token**
7. Copy the token — it is valid for **60 minutes**. You can regenerate it any time from the same page.

> **Note:** Developer Tokens are meant for local development and expire after 60 minutes. If the agent fails with an auth error, generate a fresh token.

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Set up environment variables
cp .env.example .env
# Then open .env and fill in your keys (see below)

# 3. Seed the data (uploads docs to Box and populates SQLite)
bun run seed

# 4. Run the agent
bun run start
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
# Anthropic API Key (required for agent)
ANTHROPIC_API_KEY=

# Box Developer Token (simplest — great for development)
# Generate from: Box Developer Console → your app → Configuration → Developer Token
# Tokens expire after 60 minutes.
BOX_DEVELOPER_TOKEN=
```

That's all you need to get started.

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
| `bun run seed` | Upload seed data to Box and populate SQLite |
| `bun run start` | Run the agent demo |

## Project Structure

```
deepagent-filesystem-example/
├── backends/
│   ├── index.ts            # Backend exports
│   ├── box-backend.ts      # Box cloud storage backend
│   └── sqlite-backend.ts   # SQLite → virtual filesystem backend
├── box-docs/               # Seed data for Box
│   ├── acme-corp/
│   ├── nexus-health/
│   ├── greenleaf-analytics/
│   └── edutech-pro/
├── workspace/              # Agent output (gitignored)
├── data/                   # SQLite database (gitignored)
│   └── memories.db
├── seed.ts                 # Seed script (loads data into Box + SQLite)
├── index.ts                # Main agent demo
├── .env.example            # Example environment variables
└── package.json
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

## Filesystem Operations → Box API Mapping

The Deep Agent interacts with a virtual filesystem using standard
operations like:

- `ls`
- `read_file`
- `write_file`

It does **not** call the Box API directly.

Instead, the `BoxBackend` translates filesystem operations into Box API
calls behind the scenes.

### `/docs/*` → Box Backend

| Filesystem Operation        | What the Agent Does        | Box API Endpoint               |
|----------------------------|----------------------------|--------------------------------|
| `ls /docs/`                | List directory contents    | `GET /folders/:id/items`       |
| `read /docs/file.md`       | Read file contents         | `GET /files/:id/content`       |
| `write /docs/file.md`      | Create new file            | `POST /files/content`          |
| `write` (existing file)    | Upload new version         | `POST /files/:id/content`      |


### Example: Read File

When the agent runs:

```
read_file("/docs/pricing.md")
```

The backend:

1. Resolves the virtual path to a Box file ID
2. Calls `GET /files/:id/content`
3. Returns the file contents to the agent

The agent never sees file IDs or API calls — only file contents.

### Example: Versioned Write

If the agent writes to an existing file, the backend uploads a new
version:

```
POST /files/:id/content
```

This ensures agent-generated artifacts automatically inherit:

-  Version history
-  Permission enforcement
-  Auditability

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

## Attribution

Based on the [original work](https://github.com/christian-bromann/deepagents-filesystem-example) by [Christian Bromann](https://github.com/christian-bromann).

## License

MIT
