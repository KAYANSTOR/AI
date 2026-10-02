import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = process.env.CODECRAFT_REPO || "KAYANSTOR/AI";
const DEFAULT_BRANCH = process.env.CODECRAFT_BRANCH || "main";
const CODECRAFT_BASE_URL = "https://www.codecraftapi.com/v1";
const DEFAULT_MODEL = process.env.CODECRAFT_DEFAULT_MODEL || "claude-opus-4.8";
const MCP_PROTOCOL_VERSION = "2025-06-18";

const toolDefinitions = [
  {
    name: "codecraft_list_models",
    description: "List active CodeCraft models, capabilities, context windows, and pricing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "codecraft_model_info",
    description: "Get detailed information for one exact CodeCraft model ID.",
    inputSchema: {
      type: "object",
      properties: { model_id: { type: "string", minLength: 1 } },
      required: ["model_id"],
      additionalProperties: false,
    },
  },
  {
    name: "codecraft_chat",
    description: "Send a controlled chat request to CodeCraft without repository side effects.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", minLength: 1 },
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["system", "user", "assistant", "tool"] },
              content: { type: "string" },
              tool_call_id: { type: "string" },
            },
            required: ["role", "content"],
            additionalProperties: false,
          },
        },
        temperature: { type: "number", minimum: 0, maximum: 2 },
        max_tokens: { type: "integer", minimum: 2048, maximum: 32768 },
      },
      required: ["model", "messages"],
      additionalProperties: false,
    },
  },
  {
    name: "codecraft_execute_task",
    description:
      "Autonomous coding task runner. CodeCraft inspects the configured GitHub repository, edits real files through GitHub Contents API, and verifies resulting CI status. Use this for actual implementation work, not hypothetical code generation.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", minLength: 1 },
        model: { type: "string", minLength: 1 },
        branch: { type: "string", minLength: 1 },
        max_steps: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["task"],
      additionalProperties: false,
    },
  },
];

const execTaskSchema = z.object({
  task: z.string().min(1),
  model: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  max_steps: z.number().int().min(1).max(20).optional(),
});

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    ...extra,
  };
}

function responseJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: corsHeaders({ "Cache-Control": "no-store" }),
  });
}

function errorResult(id: string | number | null, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

function authorized(request: NextRequest) {
  const expected = process.env.CODECRAFT_MCP_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${expected}`;
}

function requireConfig(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function codecraftFetch(endpoint: string, init: RequestInit = {}) {
  const key = requireConfig("CODECRAFT_API_KEY");
  const res = await fetch(`${CODECRAFT_BASE_URL}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`CodeCraft API ${res.status}: ${text.slice(0, 2000)}`);
  }

  return text ? JSON.parse(text) : null;
}

function githubHeaders() {
  const token = requireConfig("GITHUB_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function githubPath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function githubFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      ...githubHeaders(),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const message =
      typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`GitHub API ${res.status}: ${message.slice(0, 2000)}`);
  }

  return body;
}

async function listModels() {
  const data = await codecraftFetch("/models");
  return {
    default_model: DEFAULT_MODEL,
    total: Array.isArray(data?.data) ? data.data.length : 0,
    models: (data?.data || []).map((model: Record<string, unknown>) => ({
      id: model.id,
      name: model.name,
      description: model.description || "",
      context_window: model.context_window || model.context_length,
      capabilities: model.capabilities || [],
      pricing: model.pricing || {},
    })),
  };
}

async function modelInfo(modelId: string) {
  return await codecraftFetch(`/models/${encodeURIComponent(modelId)}`);
}

async function readFile(path: string, ref: string) {
  const data = await githubFetch(
    `/repos/${REPO}/contents/${githubPath(path)}?ref=${encodeURIComponent(ref)}`
  );

  if (!data || Array.isArray(data) || data.type !== "file") {
    throw new Error(`Path is not a regular file: ${path}`);
  }

  const content = Buffer.from(String(data.content || "").replace(/\\n/g, ""), "base64").toString("utf8");
  const maxChars = 250000;

  return {
    path,
    ref,
    sha: data.sha,
    size: data.size,
    truncated: content.length > maxChars,
    content: content.slice(0, maxChars),
  };
}

async function listDirectory(path: string, ref: string) {
  const suffix = path ? `/${githubPath(path)}` : "";
  const data = await githubFetch(
    `/repos/${REPO}/contents${suffix}?ref=${encodeURIComponent(ref)}`
  );

  if (!Array.isArray(data)) {
    throw new Error(`Path is not a directory: ${path || "/"}`);
  }

  return data.map((item: Record<string, unknown>) => ({
    name: item.name,
    path: item.path,
    type: item.type,
    size: item.size,
  }));
}

async function searchCode(query: string) {
  const q = `${query} repo:${REPO}`;
  const data = await githubFetch(`/search/code?q=${encodeURIComponent(q)}&per_page=20`);
  return {
    total_count: data.total_count || 0,
    results: (data.items || []).map((item: Record<string, unknown>) => ({
      path: item.path,
      name: item.name,
      url: item.html_url,
      sha: item.sha,
    })),
  };
}

async function writeFile(path: string, content: string, message: string, branch: string) {
  if (content.length > 900000) {
    throw new Error("Refusing to write a file larger than 900 KB through this endpoint.");
  }

  let currentSha: string | undefined;
  try {
    const current = await githubFetch(
      `/repos/${REPO}/contents/${githubPath(path)}?ref=${encodeURIComponent(branch)}`
    );
    if (Array.isArray(current) || current.type !== "file") {
      throw new Error(`Target is not a regular file: ${path}`);
    }
    currentSha = current.sha;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (!messageText.startsWith("GitHub API 404")) throw error;
  }

  const payload: Record<string, unknown> = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };

  if (currentSha) payload.sha = currentSha;

  const result = await githubFetch(
    `/repos/${REPO}/contents/${githubPath(path)}`,
    { method: "PUT", body: JSON.stringify(payload) }
  );

  return {
    path,
    branch,
    commit_sha: result?.commit?.sha,
    content_sha: result?.content?.sha,
    action: currentSha ? "updated" : "created",
  };
}

async function recentCiRuns(branch: string) {
  const data = await githubFetch(
    `/repos/${REPO}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=10`
  );
  return (data.workflow_runs || []).map((run: Record<string, unknown>) => ({
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    head_branch: run.head_branch,
    head_sha: run.head_sha,
    created_at: run.created_at,
    updated_at: run.updated_at,
    html_url: run.html_url,
  }));
}

async function recentJobs(runId: number) {
  const data = await githubFetch(
    `/repos/${REPO}/actions/runs/${runId}/jobs?per_page=50`
  );
  return (data.jobs || []).map((job: Record<string, unknown>) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    started_at: job.started_at,
    completed_at: job.completed_at,
    html_url: job.html_url,
  }));
}

const repoTools = [
  {
    type: "function",
    function: {
      name: "repo_list_directory",
      description: "List a real directory in the configured GitHub repository.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, ref: { type: "string" } },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repo_read_file",
      description: "Read a real text file from the configured GitHub repository.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, ref: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repo_search_code",
      description: "Search actual source code in the configured GitHub repository.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", minLength: 1 } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repo_write_file",
      description:
        "Write or update one real UTF-8 text file in the configured GitHub repository. Every write creates a Git commit.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", minLength: 1 },
          content: { type: "string" },
          message: { type: "string", minLength: 1 },
          branch: { type: "string", minLength: 1 },
        },
        required: ["path", "content", "message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repo_recent_ci_runs",
      description: "Inspect recent GitHub Actions runs for the configured branch.",
      parameters: {
        type: "object",
        properties: { branch: { type: "string" } },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "repo_ci_jobs",
      description: "Inspect jobs for a specific GitHub Actions run.",
      parameters: {
        type: "object",
        properties: { run_id: { type: "integer" } },
        required: ["run_id"],
        additionalProperties: false,
      },
    },
  },
];

async function runRepoTool(name: string, args: Record<string, unknown>, branch: string) {
  switch (name) {
    case "repo_list_directory":
      return listDirectory(String(args.path || ""), String(args.ref || branch));
    case "repo_read_file":
      return readFile(String(args.path), String(args.ref || branch));
    case "repo_search_code":
      return searchCode(String(args.query));
    case "repo_write_file":
      return writeFile(
        String(args.path),
        String(args.content),
        String(args.message),
        String(args.branch || branch)
      );
    case "repo_recent_ci_runs":
      return recentCiRuns(String(args.branch || branch));
    case "repo_ci_jobs":
      return recentJobs(Number(args.run_id));
    default:
      throw new Error(`Unknown repository tool: ${name}`);
  }
}

async function executeTask(input: unknown) {
  const parsed = execTaskSchema.parse(input);
  const branch = parsed.branch || DEFAULT_BRANCH;
  const model = parsed.model || DEFAULT_MODEL;
  const maxSteps = parsed.max_steps || 12;

  const system = [
    "You are the autonomous senior coding agent for the configured GitHub repository.",
    `Repository: ${REPO}`,
    `Working branch: ${branch}`,
    "",
    "You must work from actual repository state, not assumptions.",
    "Start by inspecting the relevant directory/files and searching the codebase before making changes.",
    "Use existing architecture and conventions. Do not invent dummy data or unrelated abstractions.",
    "Fix root causes rather than applying superficial patches.",
    "Do not create scripts merely to perform the requested operation.",
    "Keep the change focused on the user's task.",
    "When implementation is complete, inspect recent CI runs and relevant jobs.",
    "If CI exposes a failure related to your change, diagnose it from repository evidence and repair it.",
    "Every repository write is a real GitHub commit; preserve existing work and avoid destructive rewrites.",
    "Finish with a concise factual summary of files changed, commits created, and verification status.",
  ].join("\n");

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    { role: "user", content: parsed.task },
  ];

  const commits: string[] = [];
  const changedFiles = new Set<string>();

  for (let step = 0; step < maxSteps; step += 1) {
    const response = await codecraftFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model,
        messages,
        tools: repoTools,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 8192,
      }),
    });

    const message = response?.choices?.[0]?.message;
    if (!message) throw new Error("CodeCraft returned no assistant message.");

    messages.push(message);

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) {
      return {
        repository: REPO,
        branch,
        model,
        steps: step + 1,
        commits,
        changed_files: [...changedFiles],
        final: message.content || "",
      };
    }

    for (const call of calls) {
      const callName = call?.function?.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call?.function?.arguments || "{}");
      } catch {
        throw new Error(`Invalid tool arguments returned for ${callName}`);
      }

      let result: unknown;
      try {
        result = await runRepoTool(callName, args, branch);
        if (callName === "repo_write_file") {
          const filePath = String(args.path);
          changedFiles.add(filePath);
          if ((result as Record<string, unknown>)?.commit_sha) {
            commits.push(String((result as Record<string, unknown>).commit_sha));
          }
        }
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : String(error),
        };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    repository: REPO,
    branch,
    model,
    steps: maxSteps,
    commits,
    changed_files: [...changedFiles],
    final:
      "The agent reached the configured step limit before producing a final response. Inspect the latest commits and CI runs before continuing.",
  };
}

async function dispatchTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "codecraft_list_models":
      return listModels();

    case "codecraft_model_info": {
      const modelId = z.string().min(1).parse(args.model_id);
      return modelInfo(modelId);
    }

    case "codecraft_chat": {
      const model = z.string().min(1).parse(args.model);
      const messages = z.array(
        z.object({
          role: z.enum(["system", "user", "assistant", "tool"]),
          content: z.string(),
          tool_call_id: z.string().optional(),
        })
      ).parse(args.messages);
      const temperature = z.number().min(0).max(2).optional().parse(args.temperature);
      const maxTokens = z.number().int().min(2048).max(32768).optional().parse(args.max_tokens);

      return codecraftFetch("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });
    }

    case "codecraft_execute_task":
      return executeTask(args);

    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return responseJson({ error: "Unauthorized" }, 401);
  }
  return responseJson({
    name: "codecraft-api",
    status: "ok",
    protocol_version: MCP_PROTOCOL_VERSION,
    repository: REPO,
    default_model: DEFAULT_MODEL,
  });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return responseJson({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseJson(errorResult(null, -32700, "Invalid JSON"), 400);
  }

  if (!body || typeof body !== "object") {
    return responseJson(errorResult(null, -32600, "Invalid JSON-RPC request"), 400);
  }

  const requestBody = body as Record<string, unknown>;
  const id = (requestBody.id as string | number | null | undefined) ?? null;
  const method = requestBody.method;

  try {
    if (typeof method !== "string") {
      return responseJson(errorResult(id, -32600, "Missing JSON-RPC method"), 400);
    }

    if (method.startsWith("notifications/")) {
      return new NextResponse(null, { status: 204, headers: corsHeaders() });
    }

    if (method === "ping") {
      return responseJson({ jsonrpc: "2.0", id, result: {} });
    }

    if (method === "initialize") {
      const requestedVersion =
        typeof (requestBody.params as Record<string, unknown> | undefined)?.protocolVersion === "string"
          ? String((requestBody.params as Record<string, unknown>).protocolVersion)
          : MCP_PROTOCOL_VERSION;

      const supported = new Set(["2025-06-18", "2025-03-26", MCP_PROTOCOL_VERSION]);
      const protocolVersion = supported.has(requestedVersion)
        ? requestedVersion
        : MCP_PROTOCOL_VERSION;

      return responseJson({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: {
            name: "codecraft-api",
            version: "1.0.0",
          },
          instructions:
            "CodeCraft autonomous coding bridge for the configured GitHub repository.",
        },
      });
    }

    if (method === "tools/list") {
      return responseJson({
        jsonrpc: "2.0",
        id,
        result: { tools: toolDefinitions },
      });
    }

    if (method === "tools/call") {
      const params = (requestBody.params || {}) as Record<string, unknown>;
      const name = z.string().min(1).parse(params.name);
      const args = (params.arguments || {}) as Record<string, unknown>;
      const result = await dispatchTool(name, args);

      return responseJson({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
        },
      });
    }

    return responseJson(errorResult(id, -32601, `Method not found: ${method}`), 404);
  } catch (error) {
    return responseJson(
      errorResult(
        id,
        -32603,
        error instanceof Error ? error.message : String(error)
      ),
      500
    );
  }
}
