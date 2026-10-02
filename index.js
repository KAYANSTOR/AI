#!/usr/bin/env node
/**
 * CodeCraft API - MCP Server
 * Integrates CodeCraft API models into Antigravity IDE
 * Secrets are read only from environment variables.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.CODECRAFT_API_KEY;
if (!API_KEY) {
  console.error("CODECRAFT_API_KEY is not set. Export it in the environment; it is never stored in the repository.");
  process.exit(1);
}

const BASE_URL = "https://codecraftapi.com/v1";
const DEFAULT_MODEL = process.env.CODECRAFT_DEFAULT_MODEL || "claude-opus-4.8";

// ─── Helper: Fetch from CodeCraft API ────────────────────────────────────────
async function codecraftFetch(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CodeCraft API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// ─── Create MCP Server ────────────────────────────────────────────────────────
const server = new McpServer({
  name: "codecraft-api",
  version: "1.0.0",
});

// ─── Tool 1: List Available Models ───────────────────────────────────────────
server.tool(
  "codecraft_list_models",
  "List all available AI models on CodeCraft API, including capabilities and pricing.",
  {},
  async () => {
    const data = await codecraftFetch("/models");
    const models = data.data || [];

    const formatted = models.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description || "",
      context_window: m.context_window || m.context_length,
      capabilities: m.capabilities || [],
      pricing: m.pricing || {},
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              total: formatted.length,
              default_model: DEFAULT_MODEL,
              models: formatted,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ─── Tool 2: Chat Completion ──────────────────────────────────────────────────
server.tool(
  "codecraft_chat",
  "Send a chat message to any CodeCraft API model for code generation, explanation, debugging, analysis, or other AI tasks.",
  {
    model: z.string().describe(
      "Exact model ID from codecraft_list_models. Example currently documented by CodeCraft: claude-opus-4.8"
    ),
    messages: z.array(
      z.object({
        role: z.enum(["system", "user", "assistant"]).describe("Message role"),
        content: z.string().describe("Message content"),
      })
    ).describe("Conversation messages array"),
    temperature: z.number().min(0).max(2).optional().default(0.7).describe(
      "Creativity level (0=deterministic, 2=very creative). Default: 0.7"
    ),
    max_tokens: z.number().positive().optional().default(4096).describe(
      "Maximum output tokens. Default: 4096"
    ),
    system_prompt: z.string().optional().describe(
      "Optional replacement system prompt"
    ),
  },
  async ({ model, messages, temperature, max_tokens, system_prompt }) => {
    let finalMessages = [...messages];

    if (system_prompt) {
      finalMessages = finalMessages.filter((m) => m.role !== "system");
      finalMessages.unshift({ role: "system", content: system_prompt });
    }

    const data = await codecraftFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature,
        max_tokens,
      }),
    });

    const choice = data.choices?.[0];
    const content = choice?.message?.content || "";
    const usage = data.usage || {};

    return {
      content: [
        {
          type: "text",
          text: content,
        },
        {
          type: "text",
          text: `\n\n---\n📊 **Usage**: ${usage.prompt_tokens || 0} input | ${usage.completion_tokens || 0} output | Model: \`${model}\``,
        },
      ],
    };
  }
);

// ─── Tool 3: Code Assistant ───────────────────────────────────────────────────
server.tool(
  "codecraft_code_assist",
  "Specialized coding assistant for writing, debugging, refactoring, explaining, testing, reviewing, and completing code.",
  {
    task: z.enum([
      "write",
      "debug",
      "refactor",
      "explain",
      "test",
      "review",
      "complete",
    ]).describe("Coding task type"),
    code: z.string().optional().describe(
      "Existing code for debug/refactor/explain/test/review tasks"
    ),
    instruction: z.string().describe("Exact task or requirement"),
    language: z.string().optional().describe(
      "Programming language, such as TypeScript, JavaScript, Python, SQL, Dart, etc."
    ),
    model: z.string().optional().default(DEFAULT_MODEL).describe(
      "Exact CodeCraft model ID. Defaults to CODECRAFT_DEFAULT_MODEL or claude-opus-4.8."
    ),
  },
  async ({ task, code, instruction, language, model }) => {
    const taskPrompts = {
      write: "You are an expert software engineer. Write clean, production-ready code with correct edge cases.",
      debug: "You are a senior debugging engineer. Find root causes, not symptoms. Explain the cause and provide the corrected implementation.",
      refactor: "You are a senior software engineer. Refactor for correctness, maintainability, performance, and clarity without changing intended behavior.",
      explain: "You are an expert code teacher. Explain behavior, control flow, dependencies, risks, and important implementation details.",
      test: "You are a testing expert. Produce comprehensive tests for happy paths, edge cases, regressions, failures, and security-sensitive behavior.",
      review: "You are a senior code reviewer. Look for correctness bugs, security issues, race conditions, performance problems, missing tests, and architectural regressions.",
      complete: "You are an expert programmer. Complete the implementation using the existing architecture and conventions; do not invent unrelated abstractions.",
    };

    const languageContext = language ? `\nProgramming Language: ${language}` : "";
    const codeContext = code
      ? `\n\nCode:\n\`\`\`${language || ""}\n${code}\n\`\`\``
      : "";

    const data = await codecraftFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: taskPrompts[task] },
          { role: "user", content: `${instruction}${languageContext}${codeContext}` },
        ],
        temperature: task === "write" || task === "complete" ? 0.2 : 0.4,
        max_tokens: 8192,
      }),
    });

    const content = data.choices?.[0]?.message?.content || "";
    const usage = data.usage || {};

    return {
      content: [
        {
          type: "text",
          text: content,
        },
        {
          type: "text",
          text: `\n\n---\n🤖 **Task**: ${task} | **Model**: \`${model}\` | **Tokens**: ${usage.total_tokens || 0}`,
        },
      ],
    };
  }
);

// ─── Tool 4: Get Model Info ───────────────────────────────────────────────────
server.tool(
  "codecraft_model_info",
  "Get detailed information about a specific CodeCraft model.",
  {
    model_id: z.string().describe("Exact model ID returned by codecraft_list_models"),
  },
  async ({ model_id }) => {
    const data = await codecraftFetch(`/models/${encodeURIComponent(model_id)}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

// ─── Start Server ─────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ CodeCraft API MCP Server is running...");
  console.error(`🔗 Connected to: ${BASE_URL}`);
  console.error("🛠️  Tools: codecraft_list_models, codecraft_chat, codecraft_code_assist, codecraft_model_info");
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
