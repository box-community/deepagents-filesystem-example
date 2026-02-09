# Deep Agents Developer Tutorial - Video Script

## Duration: ~15-20 minutes

---

## INTRO & HOOK (0:00 - 2:00)

**[On camera, casual setup]**

In the last videos we looked at how you can build agents with LangChain. We covered the basics—giving an LLM access to tools, letting it decide when to call them, and chaining together multiple steps.

Those approaches work great for simpler workflows. But what happens when you need your agent to handle *complex, multi-step tasks*? Tasks that require planning, managing large amounts of context, or delegating work to specialized subagents?

**[Cut to screen share showing a simple agent struggling]**

You've probably seen this: you give your agent a complex task, it starts strong, then... it loses track. The context window fills up. It forgets what it was doing. It hallucinates file paths. And suddenly your "intelligent assistant" is anything but.

**[Back on camera]**

This is where the line between a *demo agent* and a *production agent* becomes crystal clear.

For simpler agents, `create_agent` or a custom LangGraph workflow is totally fine. But for complex tasks that require planning, context isolation, and persistent memory—you need something more.

**[Pause for emphasis]**

That's where **Deep Agents** comes in.

Deep Agents is a standalone library built on LangGraph—inspired by applications like Claude Code, Deep Research, and Manus. It gives your agents the ability to:
- **Plan and decompose tasks** before executing
- **Manage large context** through filesystem tools
- **Spawn subagents** for context isolation
- **Persist memory** across conversations

Let's break down exactly how it works.

---

## THE AGENT HARNESS CONCEPT (1:30 - 3:00)

**[Screen share: diagram showing basic agent vs. harnessed agent]**

This is where **agent harnesses** come in.

Think of a harness as the scaffolding around your agent that turns it from a tool-calling loop into something that actually behaves like a senior engineer.

A harness provides:
- **Structure** for how the agent thinks and plans
- **Isolation** so it doesn't corrupt your system or its own context
- **Patterns** for handling complexity that the raw LLM doesn't have

And today, I want to show you **Deep Agents**—LangChain's official agent harness.

**[Show terminal: `npm install deepagents`]**

```bash
npm install deepagents
```

Deep Agents is built on LangGraph, works with any LangChain chat model—Claude, GPT-4, Gemini, even local models through Ollama—and it's TypeScript-first with full type inference.

But what makes it special isn't the package itself. It's the four architectural patterns it implements.

---

## PATTERN 1: PLANNING TOOL (3:00 - 5:30)

**[Screen share: code example]**

Let's start with the first pattern: **The Planning Tool**.

Here's what shallow agents do:
1. Receive task
2. Call tools
3. Hope for the best

That's it. No planning. No tracking. Just vibes.

**[Show code snippet]**

Deep Agents ships with a built-in `write_todos` tool. Watch what happens when we give it a complex task:

```typescript
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent({
  model: chatModel,
});

await agent.invoke({
  messages: [
    { role: "user", content: "Refactor the authentication module to use JWT tokens instead of sessions" }
  ]
});
```

**[Show agent output with planning visible]**

See that? Before doing *anything*, the agent:
1. Decomposes the task into concrete steps
2. Writes them as todos
3. Tracks progress as it works
4. Adapts when things change

This is how senior engineers work. They don't just start typing—they think first.

**[On camera briefly]**

The planning tool isn't just about organization. It's about *context management*. Instead of trying to hold the entire task in the context window, the agent externalizes its plan. It can always look back at what it was doing.

---

## PATTERN 2: SUBAGENT SPAWNING (5:30 - 8:00)

**[Screen share: diagram of main agent and subagent]**

Pattern two: **Subagent Spawning**.

Here's a scenario. Your agent is researching a topic. It needs to go deep on one subtask—maybe analyzing a complex codebase, or reading through documentation.

But here's the problem: that deep dive *pollutes your main context window*.

Every token of exploration, every failed path, every detail—it all piles up. And suddenly your main agent can't think clearly anymore because its context is full of noise.

**[Show code example]**

```typescript
// The main agent can spawn isolated subagents
const subagentResult = await agent.spawnSubagent({
  task: "Analyze the authentication flow in the legacy codebase",
  returnSummary: true
});

// Main agent continues with clean context
// Only the summary comes back
```

**[Animation showing context isolation]**

The subagent goes deep. It explores. It makes mistakes. It finds what it needs.

Then it returns just a *summary* to the main agent.

Clean context. Better reasoning. The main agent can continue its work without drowning in details.

**[On camera]**

This is huge for complex tasks. You're essentially giving your agent the ability to "focus" on something without losing sight of the bigger picture.

---

## PATTERN 3: SANDBOXED FILESYSTEM (8:00 - 11:00)

**[Screen share: filesystem diagram]**

Pattern three is where things get really interesting: **The Sandboxed Filesystem**.

Let me paint a picture of the problem:

Context windows overflow. RAG is noisy—you retrieve ten documents and maybe two are relevant. And you definitely can't just run `exec()` with untrusted code on your server.

**[Show the filesystem tools]**

Deep Agents gives your agent an isolated sandbox with real filesystem operations:

- `ls` - list directories
- `read_file` - read file contents
- `write_file` - create or overwrite files
- `edit_file` - surgical edits with find/replace
- `grep` - search file contents
- `glob` - pattern matching for files

**[Show example usage]**

```typescript
// The agent can work with files naturally
agent.writeFile("/workspace/plan.md", "# Project Plan\n...");
agent.readFile("/workspace/src/auth.ts");
agent.grep("TODO", "/workspace/");
```

Full filesystem power. Zero risk to your actual system.

**[Transition to virtual filesystem concept]**

But here's where Deep Agents does something clever that most other tools don't...

---

## THE VIRTUAL FILESYSTEM ADVANTAGE (11:00 - 14:00)

**[Screen share: architecture diagram]**

Most coding agents—Cursor, Claude Code, Devin—they write to your *real* disk. When the agent creates `plan.md`, you get an actual file on your machine.

Deep Agents takes a different approach. It uses a **virtual filesystem**.

Same interface. The agent still uses `ls`, `read`, `write`, `grep`. But underneath? The storage is pluggable.

**[Show CompositeBackend code]**

```typescript
import { CompositeBackend, StateBackend, StoreBackend } from "deepagents/backends";

const backend = (rt) => CompositeBackend({
  default: StateBackend(rt),           // Ephemeral workspace (in-memory)
  routes: {
    "/memories/": StoreBackend(rt),    // Postgres (persistent user data)
    "/docs/": BoxBackend(),              // Box (company documentation)
  }
});
```

**[Animate the routing]**

Now when the agent operates:
- `/workspace/plan.md` goes to memory—ephemeral, per-conversation
- `/memories/preferences.txt` goes to Postgres—persistent, survives restarts
- `/docs/api_reference.md` comes from Box—your company knowledge base

The agent just sees *one filesystem*. It has no idea files are living in three different places.

**[On camera]**

Why does this matter?

**[Back to screen, bullet points appearing]**

**Multi-tenancy without containers.** With real filesystems, 1000 concurrent users means 1000 containers. With virtual filesystems? One application, the database handles isolation.

**Programmatic hooks.** Want to validate JSON before writing? Enforce read-only paths? Add audit logging? With virtual backends, it's just Python or TypeScript wrappers. With real filesystems, you're writing kernel modules.

**Semantic search.** Index files as they're written, search by *meaning* not just keywords.

**[Show hook example]**

```typescript
class ValidatingBackend implements BackendProtocol {
  write(filePath: string, content: string) {
    // Validate JSON files
    if (filePath.endsWith(".json")) {
      JSON.parse(content); // Throws if invalid
    }
    
    // Enforce read-only docs
    if (filePath.startsWith("/docs/")) {
      throw new Error("Cannot write to /docs/");
    }
    
    return this.inner.write(filePath, content);
  }
}
```

This is production-grade control over your agent's file operations.

---

## PATTERN 4: DETAILED SYSTEM PROMPTS (14:00 - 15:30)

**[On camera]**

The fourth pattern is something people often overlook: **Detailed System Prompts**.

The prompt isn't just "you are a helpful assistant." That's... almost useless for production agents.

**[Screen share: showing prompt structure]**

Deep Agents ships with battle-tested prompts—inspired by Claude Code—that serve as your agent's *operating manual*:

- **When to plan** - "If the task has more than 3 steps, write todos first"
- **How to delegate** - "For deep research, spawn a subagent"
- **What to write to files** - "Store context you'll need later in /workspace/"
- **How to recover from errors** - "If a tool fails, explain why and try an alternative"

**[Show actual prompt snippet]**

The behavior becomes explicit, debuggable, and app-specific.

You're not hoping the LLM figures out the right behavior. You're *telling it* how to behave in your system.

---

## PUTTING IT ALL TOGETHER (15:30 - 17:00)

**[Screen share: complete example]**

Let's see all four patterns working together:

```typescript
import { createDeepAgent } from "deepagents";
import { CompositeBackend, StateBackend, StoreBackend } from "deepagents/backends";
import { AsyncPostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-store-postgres";

// Persistence layer
const checkpointer = AsyncPostgresSaver.fromConnString(process.env.DB_URL);
const store = PostgresStore.fromConnString(process.env.DB_URL);

// Virtual filesystem with multiple backends
const backend = (rt) => CompositeBackend({
  default: StateBackend(rt),
  routes: {
    "/memories/": StoreBackend(rt),
  }
});

// Create the agent with all patterns enabled
const agent = createDeepAgent({
  model: chatModel,          // Any LangChain model
  backend,                   // Virtual filesystem
  checkpointer,              // Conversation persistence
  store,                     // Cross-conversation memory
});

// Run it
const result = await agent.invoke({
  messages: [
    { role: "user", content: "Build a REST API for user management" }
  ]
}, {
  configurable: { thread_id: "user-123" }
});
```

**[On camera]**

The agent will:
1. **Plan** the task using the planning tool
2. **Spawn subagents** for complex subtasks
3. **Work in a sandbox** where files are isolated and persistent
4. **Follow your system prompt** for consistent, predictable behavior

That's a production agent. Not a demo.

---

## WHEN TO USE WHAT (17:00 - 18:30)

**[Screen share: comparison table]**

Quick note on when to use virtual vs. real filesystems:

| Use Real Filesystems When: | Use Virtual Filesystems When: |
|---------------------------|------------------------------|
| Running tests, linters, git | Multi-tenant web apps |
| Working with existing codebases | Mixing Postgres + Box + APIs |
| Need `npm install`, `cargo build` | Need validation & permissions |
| Single-user local development | Serverless deployment |

**[On camera]**

The key question: *Do you need to run bash, Python, or git against the files?*

If yes, real filesystems. If no, virtual filesystems will significantly simplify your architecture.

---

## OUTRO & CTA (18:30 - 19:30)

**[On camera]**

That's Deep Agents—LangChain's agent harness that takes you from demo to production.

Four patterns:
1. **Planning Tool** - Think before acting
2. **Subagent Spawning** - Divide and conquer without context pollution
3. **Sandboxed Filesystem** - Full power, zero risk
4. **Detailed System Prompts** - Explicit, debuggable behavior

Get started with:

```bash
npm install deepagents
```

**[Show links on screen]**

I'll link the documentation and the blog post about virtual filesystems in the description.

In the next video, we'll build a complete multi-tenant agent application from scratch. Make sure you're subscribed so you don't miss it.

See you then.

---

## B-ROLL & VISUAL NOTES

- **0:00-1:30**: Casual talking head, then screen share of a failing agent
- **1:30-3:00**: Animated diagram comparing basic vs. harnessed agent
- **3:00-5:30**: Code editor with planning tool example, agent output visible
- **5:30-8:00**: Diagram showing main agent → subagent → summary flow
- **8:00-11:00**: Terminal showing filesystem operations
- **11:00-14:00**: Architecture diagram of CompositeBackend routing
- **14:00-15:30**: System prompt snippets in code editor
- **15:30-17:00**: Full code example in editor
- **17:00-18:30**: Side-by-side comparison table
- **18:30-19:30**: Talking head with text overlays for key points

---

## TIMESTAMPS (for video description)

```
0:00 - Intro & Hook
1:30 - What are Agent Harnesses?
3:00 - Pattern 1: Planning Tool
5:30 - Pattern 2: Subagent Spawning
8:00 - Pattern 3: Sandboxed Filesystem
11:00 - Virtual Filesystem Deep Dive
14:00 - Pattern 4: Detailed System Prompts
15:30 - Complete Example
17:00 - When to Use Real vs Virtual Filesystems
18:30 - Outro & Next Steps
```

---

## VIDEO DESCRIPTION TEMPLATE

```
Learn how to build production-ready AI agents with Deep Agents, LangChain's official agent harness.

In this tutorial, we cover:
✅ Why basic agents fail at complex tasks
✅ The 4 architectural patterns that make agents production-ready
✅ How virtual filesystems enable multi-tenant agent applications
✅ Complete code examples you can use today

📦 Install: npm install deepagents

🔗 Links:
- Deep Agents Docs: https://docs.langchain.com/oss/python/deepagents/
- Virtual Filesystem Blog Post: [LINK]
- GitHub: [LINK]

#AI #LangChain #Agents #TypeScript #Programming
```
