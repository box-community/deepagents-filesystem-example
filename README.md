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

### Customer Data (`./memories/`)

| Customer | Role | Company | Industry |
|----------|------|---------|----------|
| Sarah Chen | Engineering Manager | TechStartup Inc | SaaS |
| Marcus Johnson | CTO | City General Hospital | Healthcare |
| Elena Rodriguez | Sustainability Director | SustainableCo | Manufacturing |
| David Kim | Director of Online Learning | West Coast CC | Education |
| Priya Sharma | VP of Engineering | FinTech Innovations | Finance |

Each customer has a profile JSON and conversation history Markdown file.

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
│   ├── sqlite-backend.ts   # SQLite implementation
│   └── s3-backend.ts       # S3 implementation
├── s3/                     # Seed data for S3
│   ├── acme-corp/
│   ├── nexus-health/
│   ├── greenleaf-analytics/
│   └── edutech-pro/
├── memories/               # Seed data for SQLite
│   ├── users/             # Customer profiles
│   └── history/           # Conversation histories
├── workspace/             # Agent output (gitignored)
├── data/                  # SQLite database (gitignored)
├── seed.ts               # Seed script
├── index.ts              # Main agent demo
└── demo-backends.ts      # Backend test script
```

## How It Works

1. **Seeding**: `bun run seed` reads files from `./s3/` and `./memories/` and uploads them to S3 and SQLite respectively.

2. **Agent Execution**: The agent receives a prompt to generate a proposal for a specific customer.

3. **Data Access**: The agent uses filesystem tools (`ls`, `read_file`, `write_file`) which route to different backends based on path:
   - `/docs/*` → S3
   - `/memories/*` → SQLite
   - `/workspace/*` → Local filesystem

4. **Output**: The agent writes the generated proposal to `/workspace/`.

## Customization

### Add a New Company

1. Create a folder in `./s3/your-company/`
2. Add markdown files (company-info.md, pricing.md, etc.)
3. Run `bun run seed`

### Add a New Customer

1. Create `./memories/users/customer-name.json`
2. Create `./memories/history/customer-name-history.md`
3. Run `bun run seed`

## License

MIT
