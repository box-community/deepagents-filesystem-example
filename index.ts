/**
 * Deep Agents Virtual Filesystem Example
 *
 * This example demonstrates using 3 different storage backends with a Deep Agent:
 *
 * 1. SQL Database (SQLiteBackend) - For persistent memories at /memories/
 * 2. S3-compatible Storage (S3Backend) - For documentation at /docs/
 * 3. Local Filesystem (FilesystemBackend) - For workspace files at /workspace/
 *
 * Before running, seed the data with: bun run seed
 */

import { ChatAnthropic } from "@langchain/anthropic";
import {
  createDeepAgent,
  CompositeBackend,
  FilesystemBackend,
  StateBackend,
  type BackendFactory,
} from "deepagents";
import { SQLiteBackend } from "./backends/sqlite-backend";
import { S3Backend } from "./backends/s3-backend";
import { MemorySaver } from "@langchain/langgraph";

// Configuration from environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const S3_BUCKET = process.env.AWS_S3_BUCKET;
const S3_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;

if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
  console.error(
    "Error: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_S3_BUCKET are required"
  );
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

/**
 * Create a CompositeBackend that routes to different storage systems
 *
 * Path routing:
 * - /workspace/  → FilesystemBackend (local disk, for output files)
 * - /memories/   → SQLiteBackend (database, for user data & history)
 * - /docs/       → S3Backend (object storage, for company documentation)
 * - default      → StateBackend (ephemeral, for scratch space)
 */
const createCompositeBackend: BackendFactory = (stateAndStore) => {
  const workspaceBackend = new FilesystemBackend({
    rootDir: "./workspace",
    virtualMode: true,
  });

  const sqliteBackend = new SQLiteBackend({
    dbPath: "./data/memories.db",
  });

  const s3Backend = new S3Backend({
    bucket: S3_BUCKET,
    prefix: "docs",
    forcePathStyle: false,
    clientConfig: {
      region: "us-west-2",
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
    },
  });

  return new CompositeBackend(new StateBackend(stateAndStore), {
    "/workspace/": workspaceBackend,
    "/memories/": sqliteBackend,
    "/docs/": s3Backend,
  });
};

/**
 * System prompt that explains the virtual filesystem to the agent
 */
const systemPrompt = `You are a helpful AI sales assistant with access to a virtual filesystem.

## Available Data Sources

### /docs/ (S3 Storage - Company Documentation)
Contains company information, product details, pricing, and compliance docs.
Organized by company: /docs/acme-corp/, /docs/nexus-health/, /docs/greenleaf-analytics/, /docs/edutech-pro/

### /memories/ (SQLite Database - Customer Data)
Contains customer profiles and conversation history:
- /memories/users/ - Customer profiles (JSON)
- /memories/history/ - Conversation history (Markdown)

### /workspace/ (Local Filesystem - Output)
Use this to write generated proposals, reports, and other output files.

## Your Task
When asked to generate a proposal or report:
1. First explore what's available: ls the directories to see companies and users
2. Read the relevant customer profile and conversation history
3. Read the matching company documentation
4. Create a personalized proposal based on all this context
5. Write the output to /workspace/

Always personalize content based on the customer's profile, history, and specific needs.`;

/**
 * Main function to run the agent
 */
async function main() {
  // Ensure workspace directory exists
  await Bun.write("./workspace/.gitkeep", "");

  // Create the model
  const model = new ChatAnthropic({
    model: "claude-opus-4-5",
    temperature: 0,
  });

  // Create checkpointer for conversation persistence
  const checkpointer = new MemorySaver();

  // Create the deep agent with composite backend
  const agent = createDeepAgent({
    model,
    backend: createCompositeBackend,
    checkpointer,
    systemPrompt,
  });

  const threadId = "demo-thread-" + Date.now();

  console.log("🚀 Deep Agent Virtual Filesystem Demo\n");
  console.log("Data sources:");
  console.log("  📄 /docs/      → S3 (company documentation)");
  console.log("  🧠 /memories/  → SQLite (customer data)");
  console.log("  📁 /workspace/ → Filesystem (output)\n");
  console.log("=".repeat(60) + "\n");

  // The prompt asks the agent to explore and generate a proposal
  const prompt = `Generate a personalized sales proposal for Sarah Chen.

Steps:
1. First, list what's available in /docs/ and /memories/ to understand the data
2. Read Sarah Chen's profile from /memories/users/
3. Read her conversation history from /memories/history/
4. Based on her profile, find the matching company documentation in /docs/
5. Create a compelling, personalized proposal that:
   - Addresses her by name and role
   - References her team size and specific interests
   - Acknowledges her previous conversations and concerns
   - Recommends appropriate products and pricing
   - Addresses any objections from the history
6. Write the proposal to /workspace/sarah-chen-proposal.md

Make it professional and persuasive!`;

  console.log("📝 User Request:\n");
  console.log(prompt);
  console.log("\n" + "-".repeat(60) + "\n");
  console.log("🤖 Agent working...\n");

  try {
    const result = await agent.invoke(
      { messages: [{ role: "user", content: prompt }] },
      {
        configurable: { thread_id: threadId },
        recursionLimit: 100,
      }
    );

    // Get the last message (agent's response)
    const lastMessage = result.messages.at(-1);
    if (lastMessage) {
      console.log("Agent Response:\n");
      console.log(lastMessage.content);
    }

    // Read and display the generated proposal
    console.log("\n" + "=".repeat(60));
    console.log("\n📄 GENERATED PROPOSAL:\n");
    console.log("=".repeat(60) + "\n");

    const proposalFile = Bun.file("./workspace/sarah-chen-proposal.md");
    if (await proposalFile.exists()) {
      const proposalContent = await proposalFile.text();
      console.log(proposalContent);
    } else {
      console.log("(Proposal file not found - checking workspace...)");
      const { readdirSync } = await import("fs");
      const files = readdirSync("./workspace").filter((f) => f !== ".gitkeep");
      if (files.length > 0) {
        console.log("\nFiles in /workspace/:", files);
        // Try to read the first markdown file
        const mdFile = files.find((f) => f.endsWith(".md"));
        if (mdFile) {
          const content = await Bun.file(`./workspace/${mdFile}`).text();
          console.log(`\nContents of ${mdFile}:\n`);
          console.log(content);
        }
      }
    }
  } catch (error) {
    console.error("Error running agent:", error);
  }
}

// Run the main function
main().catch(console.error);
