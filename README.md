# Bitbucket MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes **Bitbucket Data Center/Server** and **Bitbucket Cloud** as tools. Use it from AI assistants (e.g. Cursor, Claude Desktop) to list PRs, view diffs, create PRs, add comments, and approve/unapprove pull requests. The backend (Server or Cloud) is chosen by env config; both use the same tools and domain types under a single **backend interface** for easy maintenance.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [Using with MCP Clients](#using-with-mcp-clients)
- [Available Tools](#available-tools)
- [Troubleshooting](#troubleshooting)

**Architecture:** Server and Cloud are abstracted behind a single **`IBitbucketBackend`** interface in `src/types.ts`. Implementations live in `src/backends/server.ts` (Data Center/Server) and `src/backends/cloud.ts` (Bitbucket Cloud); `getBitbucketBackend()` in `src/backends/index.ts` returns the correct one from config. All tools in `src/index.ts` call only the interface, so adding or changing a backend does not touch the MCP tools.

---

## Prerequisites

- **[Bun](https://bun.sh/)** (v1.0+). Install with:

  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

- Either:
  - **Bitbucket Data Center / Server** (e.g. `https://source.opswat.com`), or
  - **Bitbucket Cloud** (use `https://bitbucket.org` as base URL).
- A **personal access token** (or app password / API token) with at least:
  - **Pull requests**: Read, Write (for listing, creating, approving, commenting)
  - **Repositories**: Read (for project/repo and diff access)

---

## Installation

1. **Clone or download** this repository:

   ```bash
   git clone <repository-url>
   cd bitbucket-mcp
   ```

2. **Install dependencies** with Bun:

   ```bash
   bun install
   ```

3. **Configure environment variables** (see [Configuration](#configuration)).

---

## Configuration

The server reads configuration from environment variables. You must set at least the base URL and a token. The same env vars work for both **Server** and **Cloud**; the backend is chosen automatically or via `BITBUCKET_API_TYPE`.

| Variable | Required | Description |
|----------|----------|-------------|
| `BITBUCKET_BASE_URL` | Yes* | Base URL (no trailing slash). **Server**: required, e.g. `https://source.opswat.com`. **Cloud**: optional; when `BITBUCKET_API_TYPE=cloud`, defaults to `https://api.bitbucket.org/2.0`. |
| `BITBUCKET_API_TYPE` | No | `server` or `cloud`. If unset, inferred from `BITBUCKET_BASE_URL` (contains `bitbucket.org` → cloud). With `cloud`, you can omit `BITBUCKET_BASE_URL`. |
| `BITBUCKET_TOKEN` | Yes* | Personal access token or app password (Server) / API token (Cloud). Prefer not putting secrets in env in production. |
| `BITBUCKET_TOKEN_FILE` | Yes* | Path to a file containing the token (one line, no newline). Overrides `BITBUCKET_TOKEN` if set. |
| `BITBUCKET_EMAIL` | Cloud only* | **Required for Cloud API tokens** (from id.atlassian.com). Your Atlassian account email; used with the token for Basic auth. See [Using API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/). |

\* One of `BITBUCKET_TOKEN` or `BITBUCKET_TOKEN_FILE` must be set. For Cloud with API tokens, `BITBUCKET_EMAIL` is also required.

### Example: Using a token file (recommended)

```bash
echo -n "YOUR_PERSONAL_ACCESS_TOKEN" > ~/.bitbucket-token
chmod 600 ~/.bitbucket-token
export BITBUCKET_BASE_URL="https://bitbucket.mycompany.com"
export BITBUCKET_TOKEN_FILE="$HOME/.bitbucket-token"
```

### Example: Using environment variables

```bash
export BITBUCKET_BASE_URL="https://bitbucket.mycompany.com"
export BITBUCKET_TOKEN="your_token_here"
```

### Example: Bitbucket Cloud (API tokens from id.atlassian.com)

With `BITBUCKET_API_TYPE=cloud`, you can omit `BITBUCKET_BASE_URL`; the Cloud API URL is used by default. API tokens require Basic auth (email + token).

```bash
export BITBUCKET_API_TYPE=cloud
export BITBUCKET_EMAIL="you@example.com"   # Atlassian account email
export BITBUCKET_TOKEN_FILE="$HOME/.bitbucket-token"
```

---

## Running the Server

The server communicates over **stdio** (stdin/stdout). Do not run it interactively; MCP clients start it as a subprocess.

- **Start once** (for testing that it boots):

  ```bash
  bun run start
  ```

  It will wait for JSON-RPC messages on stdin. Press Ctrl+C to exit.

- **Development** (auto-restart on file changes):

  ```bash
  bun run dev
  ```

---

## Using with MCP Clients

### Cursor

1. Open **Cursor Settings** → **MCP** (or edit your MCP config file).
2. Add a new MCP server entry for `bitbucket-mcp`. Example config (exact location may vary by Cursor version):

   ```json
   {
     "mcpServers": {
       "bitbucket": {
         "command": "bun",
         "args": ["run", "start"],
         "cwd": "/path/to/bitbucket-mcp",
         "env": {
           "BITBUCKET_BASE_URL": "https://bitbucket.mycompany.com",
           "BITBUCKET_TOKEN_FILE": "/home/you/.bitbucket-token"
         }
       }
     }
   }
   ```

3. Replace `cwd` with the absolute path to this repo and adjust `env` to match your setup.
4. Restart Cursor or reload MCP so it spawns the server. You can then ask the AI to use Bitbucket (e.g. “List open PRs in project PROJ, repo my-repo”).

### Claude Desktop

In your Claude Desktop MCP config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "bun",
      "args": ["run", "start"],
      "cwd": "/path/to/bitbucket-mcp",
      "env": {
        "BITBUCKET_BASE_URL": "https://bitbucket.mycompany.com",
        "BITBUCKET_TOKEN_FILE": "/home/you/.bitbucket-token"
      }
    }
  }
}
```

Again, set `cwd` and `env` to your environment. Restart Claude Desktop after saving.

### Other MCP clients

Any client that supports **stdio** transport can run this server: use `command` = `bun`, `args` = `["run", "start"]`, and set `cwd` and `env` so the process sees `BITBUCKET_BASE_URL` and one of `BITBUCKET_TOKEN` or `BITBUCKET_TOKEN_FILE`.

---

## Available Tools

All tools require a **project key** and **repository slug** (e.g. project `PROJ`, repo `my-repo`). Pull request tools also need a **PR id** (integer).

| Tool | Description |
|------|-------------|
| `list_pull_requests` | List PRs with optional filters: state (OPEN, MERGED, DECLINED, ALL), author, pagination (limit, start). |
| `get_pull_request` | Get full details of one PR (title, description, state, author, reviewers, branches, dates, link). |
| `get_pull_request_diff` | Get the unified diff of a PR (optional context lines). |
| `get_pull_request_activities` | Get activity stream (comments, approvals, etc.) for a PR. |
| `create_pull_request` | Create a PR (title, description, fromBranch, toBranch, optional reviewers). |
| `add_pr_comment` | Add a comment to a PR; optionally anchor to a file/line for inline comments. |
| `approve_pull_request` | Approve a PR (requires your Bitbucket username/slug). |
| `unapprove_pull_request` | Remove your approval from a PR. |

### Example prompts (for the AI using this MCP)

- “List open pull requests in project **PROJ** repo **my-repo**.”
- “Show me the diff for PR **42** in **PROJ** / **my-repo**.”
- “What are the latest activities on PR **42** in **PROJ** / **my-repo**?”
- “Create a pull request in **PROJ** / **my-repo** from branch **feature/xyz** to **main** with title ‘Add feature xyz’.”
- “Add a comment to PR **42** in **PROJ** / **my-repo**: ‘LGTM’.”
- “Approve PR **42** in **PROJ** / **my-repo** as user **jdoe**.”

---

## Troubleshooting

### “Missing BITBUCKET_BASE_URL” or “Missing Bitbucket token”

- Ensure the MCP process sees the env vars. When running via Cursor/Claude, set them in the server’s `env` block; they are not inherited from your shell unless the client passes them.

### “Bitbucket API … -> 401”

- Token is wrong or expired. Regenerate a personal access token in Bitbucket and update `BITBUCKET_TOKEN` or the file pointed to by `BITBUCKET_TOKEN_FILE`.
- Ensure the token has **Pull requests** (and **Repositories** if you use diffs) permissions.

### “Bitbucket API … -> 403”

- The token user does not have permission for that project/repo or action. Check project/repo permissions and token scope.

### “Bitbucket API … -> 404”

- Check that **project key** and **repo slug** are correct (case-sensitive). Use the project key (e.g. `PROJ`), not the project name.

### Server exits immediately or client says “connection failed”

- Run `bun run start` in a terminal from the repo directory with the same env vars; fix any “Missing …” or module errors.
- Ensure `cwd` in the MCP config points to the repo root (where `package.json` and `src/` live) and that `bun` is on the client’s `PATH`.

### Wrong backend or 404

- The server supports both **Data Center/Server** and **Cloud**. Set `BITBUCKET_BASE_URL` and, if needed, `BITBUCKET_API_TYPE=server` or `BITBUCKET_API_TYPE=cloud`. For Cloud, use project/workspace and repo slug as in the Bitbucket URL (e.g. workspace `myteam`, repo `my-repo`).

---

## License

This project is in the **public domain**. See [UNLICENSED](UNLICENSED) for the full text.
