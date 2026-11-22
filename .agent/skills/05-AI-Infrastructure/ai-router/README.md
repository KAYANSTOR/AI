# AI Router CLI

A BYOK, CLI-first, local-only AI router that pools the free daily quotas of
multiple AI providers (Groq, Cerebras, Mistral, Gemini, Cloudflare Workers AI)
behind a single command-line tool, with health/quota tracking, circuit-breaking,
and automatic failover.

> Status: V1 MVP.

## Install

```bash
pip install -e .
```

## Commands

Run `ai-router --help` to list all commands. The CLI exposes the following
top-level commands (plus the `config` group):

| Command | Description |
| --- | --- |
| `ai-router config` | Manage provider credentials and models (group). |
| `ai-router chat` | Start an interactive chat session routed across configured providers. |
| `ai-router providers` | Show which providers are supported and which are configured. |
| `ai-router status` | Combined health + quota snapshot for every provider/model. |
| `ai-router health` | Detailed health view: status, consecutive failures, latency, breaker. |
| `ai-router quota` | Detailed quota/rate-limit view per provider/model. |
| `ai-router metrics` | Read-only totals and per-provider request/fallback metrics. |
| `ai-router serve` | Start a local-only OpenAI-compatible HTTP server (post-V1 web layer). |

### `ai-router config`

Manage provider credentials and models. Supported providers:
`groq`, `cerebras`, `mistral`, `gemini`, `cloudflare`.

```bash
# Interactively add/overwrite a provider (API key is hidden on input).
# Cloudflare additionally prompts for an Account ID.
ai-router config add groq
ai-router config add cloudflare

# List configured providers with masked API keys.
ai-router config list

# Remove a provider's configuration.
ai-router config remove groq
```

### `ai-router chat`

Start an interactive chat session. Requests are routed across the configured,
eligible providers with automatic failover. Type your message and press Enter;
send an empty line or `Ctrl+C` to exit.

```bash
ai-router chat
```

### `ai-router providers`

Show all supported providers and whether each is configured locally, with the
configured model name.

```bash
ai-router providers
```

Example output:

```
Provider    Supported  Configured  Model
----------------------------------------------------
groq        yes        yes         openai/gpt-oss-120b
cerebras    yes        no
mistral     yes        yes         mistral-small-latest
gemini      yes        yes         gemini-3.6-flash
cloudflare  yes        no
```

### `ai-router status`

Combined health + quota snapshot for every configured provider/model.

```bash
ai-router status
```

### `ai-router health`

Detailed health view: health score, health status, consecutive failures,
average latency, and circuit-breaker state.

```bash
ai-router health
```

### `ai-router quota`

Detailed quota/rate-limit view per provider/model: quota status, whether quota
is available, requests/tokens used today, and any retry/reset times.

```bash
ai-router quota
```

### `ai-router metrics`

Read-only request metrics: total requests, successes, failures, and fallback
events, both as totals and broken down per provider. This command never mutates
provider state.

```bash
ai-router metrics
```

### `ai-router serve`

Start a local-only OpenAI-compatible HTTP server. It exposes the router's
`route()` core over HTTP so any OpenAI-compatible client (e.g. LangChain's
`ChatOpenAI`) can use the pooled providers as a drop-in backend.

```bash
# Bind to 127.0.0.1:8080 (default). Keep it local-only.
ai-router serve

# Custom port (e.g. to match a client's base_url).
ai-router serve --port 8081
```

Endpoints (all bind to `127.0.0.1` only — no remote access, no auth):

- `POST /v1/chat/completions` (alias: `POST /chat/completions`)
- `GET /v1/models` (alias: `GET /models`)
- `GET /healthz`

Example — drive the router from LangChain:

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(base_url="http://127.0.0.1:8080", api_key="not-needed")
print(llm.invoke("Hello! Explain what an API is in simple words."))
```

> The server is local-only by design (AGENTS.md §8): it must never be exposed
> beyond `127.0.0.1`.

## How it works

- **Provider selection** filters eligible (configured + healthy + available)
  providers, then picks one uniformly at random.
- **Failover** retries the next eligible provider on recoverable errors
  (e.g. `429`, `503`, timeouts, connection errors), respecting the circuit
  breaker and quota state.
- **State** (health, quota, breaker, metrics) is persisted locally to
  `state.json` (git-ignored). Conversation history is in-memory only.

## Disclaimer

You are responsible for complying with each provider's terms of service. This
tool stores API keys in plaintext `config.json` (git-ignored).
