/**
 * Deep Agents Virtual Filesystem Example
 *
 * This example demonstrates using 3 different storage backends with a Deep Agent:
 *
 * 1. SQL Database (SQLiteBackend) - For persistent memories at /memories/
 * 2. Box (BoxBackend) - For documentation at /docs/
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
import { MemorySaver } from "@langchain/langgraph";
import { SQLiteBackend } from "./backends/sqlite-backend";
import { BoxBackend, DEFAULT_BOX_FOLDER_NAME } from "./backends/box-backend";

// Configuration from environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BOX_DEVELOPER_TOKEN = process.env.BOX_DEVELOPER_TOKEN;

if (!BOX_DEVELOPER_TOKEN) {
  console.error("Error: BOX_DEVELOPER_TOKEN environment variable is required");
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

/**
 * Create a CompositeBackend factory that routes to different storage systems.
 * The BoxBackend must be initialized (with ensureRootFolder) before calling this.
 *
 * Path routing:
 * - /workspace/  → FilesystemBackend (local disk, for output files)
 * - /memories/   → SQLiteBackend (database, for user data & history)
 * - /docs/       → BoxBackend (Box, for company documentation)
 * - default      → StateBackend (ephemeral, for scratch space)
 */
function createCompositeBackendFactory(boxBackend: BoxBackend): BackendFactory {
  return (stateAndStore) => {
    const workspaceBackend = new FilesystemBackend({
      rootDir: "./workspace",
      virtualMode: true,
    });

    const sqliteBackend = new SQLiteBackend({
      dbPath: "./data/memories.db",
    });

    return new CompositeBackend(new StateBackend(stateAndStore), {
      "/workspace/": workspaceBackend,
      "/memories/": sqliteBackend,
      "/docs/": boxBackend,
    });
  };
}

/**
 * System prompt that explains the virtual filesystem to the agent
 */
const systemPrompt = `You are a helpful AI sales assistant with access to a virtual filesystem.

## Available Data Sources

### /docs/ (Box - Company Documentation)
Contains company information, product details, pricing, and compliance docs.
Organized by company: /docs/acme-corp/, /docs/nexus-health/, /docs/greenleaf-analytics/, /docs/edutech-pro/

### /memories/ (SQLite Database - Customer Data)
Contains customer profiles and conversation history:
- /users/{name}.json → User profile from users table
- /history/{name}.md → Conversation history from conversations table

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

  // Initialize Box backend and find/create the docs folder
  const boxBackend = new BoxBackend({
    developerToken: BOX_DEVELOPER_TOKEN!,
  });
  await boxBackend.ensureRootFolder(DEFAULT_BOX_FOLDER_NAME);
  await boxBackend.warmCache();

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
    backend: createCompositeBackendFactory(boxBackend),
    checkpointer,
    systemPrompt,
  });

  const threadId = "demo-thread-" + Date.now();

  console.log("🚀 Deep Agent Virtual Filesystem Demo\n");
  console.log("Data sources:");
  console.log(`  📄 /docs/      → Box "${DEFAULT_BOX_FOLDER_NAME}" folder (company documentation)`);
  console.log("  🧠 /memories/  → SQLite (customer data)");
  console.log(`  📁 /workspace/ → Local filesystem (output, then uploaded to Box "${DEFAULT_BOX_FOLDER_NAME}" folder)\n`);
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
6. Write the proposal to /workspace/sarah-chen-proposal.md (it will also be uploaded to Box)

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
    const proposalContent = await proposalFile.text();
    console.log(proposalContent);

    // Upload the proposal to Box
    console.log("\n" + "=".repeat(60));
    console.log("\n📦 FILE UPLOAD:\n");
    console.log("=".repeat(60) + "\n");

    console.log(`Uploading sarah-chen-proposal.md to Box...`);
    const uploadResult = await boxBackend.upsertFile(
      "/sarah-chen-proposal.md",
      proposalContent
    );
    if (!uploadResult.error) {
      console.log(
        `✅ Successfully written to "${DEFAULT_BOX_FOLDER_NAME}" in Box (folder ID: ${boxBackend.getRootFolderId()})`
      );
    } else {
      console.error(`❌ Failed to upload to Box: ${uploadResult.error}`);
    }
  } catch (error) {
    console.error("Error running agent:", error);
  }
}

// Run the main function
main().catch(console.error);
