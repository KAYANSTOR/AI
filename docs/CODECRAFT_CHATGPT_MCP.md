# CodeCraft Remote MCP for ChatGPT

The repository now exposes a remote MCP endpoint at:

`/api/mcp`

The endpoint is implemented inside `apps/web/src/app/mcp/route.ts` and runs statelessly over HTTP.

## Architecture

```
ChatGPT custom MCP app
        |
        v
FrontDesk AI /api/mcp
        |
        +--> CodeCraft API (/v1/chat/completions)
        |
        +--> GitHub API (configured repository)
                 |
                 +--> read/search source
                 +--> write real files
                 +--> observe GitHub Actions
```

The `codecraft_execute_task` MCP tool is the autonomous implementation path. It gives CodeCraft a controlled set of repository tools and loops tool calls back into CodeCraft until the task is complete or the configured step limit is reached.

## Required Vercel environment variables

Set these as encrypted server-side variables in the `frontdesk-ai` Vercel project:

- `CODECRAFT_API_KEY`: CodeCraft Bearer API key.
- `CODECRAFT_MCP_TOKEN`: a separate strong bearer token used by ChatGPT to authenticate to this MCP endpoint.
- `GITHUB_TOKEN`: GitHub token with the minimum repository read/write permissions required to modify `KAYANSTOR/AI` and inspect Actions.
- `CODECRAFT_REPO`: `KAYANSTOR/AI`.
- `CODECRAFT_BRANCH`: `main`.
- `CODECRAFT_DEFAULT_MODEL`: `claude-opus-4.8` unless changed after checking `/v1/models`.

Never place any of these secrets in Git, frontend code, logs, or MCP request arguments.

## MCP tools

### `codecraft_execute_task`

The implementation tool. It:

1. Receives the user's task.
2. Reads/searches the actual repository before editing.
3. Gives CodeCraft repository tools for reading, searching, writing, and CI inspection.
4. Applies real file changes through GitHub.
5. Feeds tool results back to CodeCraft.
6. Returns the final agent report with commits, changed files, and verification status.

### `codecraft_chat`

A non-mutating direct CodeCraft request.

### `codecraft_list_models`

Lists active CodeCraft models and capabilities.

### `codecraft_model_info`

Returns details for an exact CodeCraft model ID.

## ChatGPT connection

Open ChatGPT on the web, enable Developer Mode where the account/workspace supports custom MCP apps, create a custom app, and point it at the deployed HTTPS endpoint:

`https://<production-domain>/api/mcp`

Use bearer-token authentication with the value of `CODECRAFT_MCP_TOKEN`, then scan the tools.

ChatGPT's current documentation states that custom MCP apps are configured from the web UI; mobile does not support MCP apps. Full write/modify MCP support is currently rolling out to Business and Enterprise/Edu, while Pro supports custom MCP connections with read/fetch permissions. Free accounts do not currently have the custom write-capable MCP workflow.

## Security

The CodeCraft API key and the ChatGPT MCP token are intentionally separate.

The repository previously contained a CodeCraft secret in `mcp_config.json`. That secret has been removed from the current branch. Because Git history can retain old committed secrets, rotate/revoke that key in CodeCraft before using the remote deployment.

## Current limitation

The connected Vercel app available to this ChatGPT session exposes deployment/project inspection but does not expose environment-variable write operations. Therefore the code and deployment path are prepared, while the encrypted Vercel variables must be set through Vercel's dashboard/API credentials that have environment-variable write access.

## After environment configuration

Verify the deployment exposes `/api/mcp` and then add the endpoint as a custom MCP app in ChatGPT. Once connected, a normal user request can be routed to `codecraft_execute_task` without copying a prompt into another tool.
