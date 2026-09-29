#!/usr/bin/env node
/**
 * CodeCraft API - MCP Server
 * Integrates CodeCraft API models into Antigravity IDE
 * API Key: stored in CODECRAFT_API_KEY environment variable
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
  "List all available AI models on CodeCraft API (GPT, Claude, Gemini, Grok, DeepSeek, etc.)",
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
      pricing_per_1k_tokens: m.pricing?.input_per_1k || 0,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ total: formatted.length, models: formatted }, null, 2),
        },
      ],
    };
  }
);

// ─── Tool 2: Chat Completion ──────────────────────────────────────────────────
server.tool(
  "codecraft_chat",
  "Send a chat message to any CodeCraft API model and get a response. Use for code generation, explanation, debugging, or any AI task.",
  {
    model: z.string().describe(
      "Model ID to use. Examples: claude-opus-5.5, gpt-5.5-pro, gemini-3.7-flash, deepseek-v4-pro-0813, grok-4.6"
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
    max_tokens: z.number().optional().default(4096).describe(
      "Maximum tokens to generate. Default: 4096"
    ),
    system_prompt: z.string().optional().describe(
      "Optional system prompt to prepend (overrides any existing system message)"
    ),
  },
  async ({ model, messages, temperature, max_tokens, system_prompt }) => {
    let finalMessages = [...messages];

    if (system_prompt) {
      finalMessages = finalMessages.filter((m) => m.role !== "system");
      finalMessages.unshift({ role: "system", content: system_prompt });
    }

    const body = {
      model,
      messages: finalMessages,
      temperature,
      max_tokens,
    };

    const data = await codecraftFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
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
          text: `\n\n---\n📊 **Usage**: ${usage.prompt_tokens || 0} input tokens | ${usage.completion_tokens || 0} output tokens | Model: \`${model}\``,
        },
      ],
    };
  }
);

// ─── Tool 3: Code Assistant ───────────────────────────────────────────────────
server.tool(
  "codecraft_code_assist",
  "Specialized code assistant using CodeCraft API. Perfect for: writing code, debugging, refactoring, explaining code, generating tests, or reviewing code.",
  {
    task: z.enum([
      "write",
      "debug",
      "refactor",
      "explain",
      "test",
      "review",
      "complete",
    ]).describe("Type of coding task"),
    code: z.string().optional().describe("Existing code to work with (for debug/refactor/explain/test/review)"),
    instruction: z.string().describe("What you want the AI to do"),
    language: z.string().optional().describe("Programming language (e.g., Python, JavaScript, TypeScript, etc.)"),
    model: z.string().optional().default("claude-opus-5.5").describe(
      "Model to use. Default: claude-opus-5.5 (best for coding)"
    ),
  },
  async ({ task, code, instruction, language, model }) => {
    const taskPrompts = {
      write: "You are an expert software engineer. Write clean, well-documented, production-ready code.",
      debug: "You are a debugging expert. Analyze the code carefully, identify all bugs and issues, and provide fixed code with clear explanations.",
      refactor: "You are a code quality expert. Refactor the code to be cleaner, more efficient, and follow best practices. Explain all changes made.",
      explain: "You are a code teacher. Explain the code clearly and thoroughly, covering what it does, how it works, and any important concepts.",
      test: "You are a testing expert. Write comprehensive unit tests covering all edge cases and scenarios.",
      review: "You are a senior code reviewer. Review the code for bugs, security issues, performance problems, and style improvements.",
      complete: "You are an expert programmer. Complete the code intelligently based on the context and patterns you see.",
    };

    const systemPrompt = taskPrompts[task];
    const langContext = language ? `\nProgramming Language: ${language}` : "";
    const codeContext = code ? `\n\nCode:\n\`\`\`${language || ""}\n${code}\n\`\`\`` : "";

    const userMessage = `${instruction}${langContext}${codeContext}`;

    const body = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: task === "write" || task === "complete" ? 0.3 : 0.5,
      max_tokens: 8192,
    };

    const data = await codecraftFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
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
  "Get detailed information about a specific CodeCraft API model",
  {
    model_id: z.string().describe("Model ID to get info about (e.g., claude-opus-5.5)"),
  },
  async ({ model_id }) => {
    const data = await codecraftFetch(`/models/${model_id}`);

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
  console.error("🛠️  Available tools: codecraft_list_models, codecraft_chat, codecraft_code_assist, codecraft_model_info");
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
