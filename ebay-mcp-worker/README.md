# eBay MCP Worker

Deploys the eBay community MCP server ([YosefHayim/ebay-mcp](https://github.com/YosefHayim/ebay-mcp)
v1.18.0, vendored in `src/vendor`, see [VENDOR.md](VENDOR.md)) to Cloudflare Workers. Read **and** write
tools are preserved. Nothing here deploys anything or creates credentials on its own; every step
below needs you (or your shell) to run it.

## Layout

```
wrangler.jsonc        Worker config (vars, Durable Object, migration v1, previews block)
src/worker.ts         fetch handler: /health, /mcp (Bearer auth, stateless Streamable HTTP)
src/token-do.ts       TokenStore Durable Object (tokens + dynamic-mode enabled set)
src/credential-store.ts  Durable Object-backed CredentialStore for the vendored OAuth client
src/vendor/           patched upstream v1.18.0
test/mcp-smoke.mjs    smoke test
```

## Prerequisites

- Node.js ≥ 20 and npm
- A Cloudflare account (Workers Free works for testing; see the CPU note below, the $5/mo paid plan is recommended)
- An eBay developer account: https://developer.ebay.com/

```bash
cd ebay-mcp-worker
npm install
```

## 1. Cloudflare login

```bash
npx wrangler login
```

Headless / CI: create an API token with **Workers: Edit** at https://dash.cloudflare.com/profile/api-tokens
and `export CLOUDFLARE_API_TOKEN=<token>`.

## 2. eBay developer app

1. https://developer.ebay.com/my/keys → create (or reuse) an app keyset.
   - **App ID** → `EBAY_CLIENT_ID`
   - **Cert ID** → `EBAY_CLIENT_SECRET`
   - **Dev ID** is not needed.
2. **RuName** (redirect name for user consent): https://developer.ebay.com/my/auth → User Tokens → your RuName
   (looks like `YourApp-YourApp-abc-def-ghi`). Goes in `EBAY_REDIRECT_URI`; it is a RuName, **not** a URL.
3. **Scopes:** the Worker defaults to eBay's full published scope tables (`src/vendor/data/`). A keyset is
   only granted a subset, and eBay rejects the whole authorization request with `invalid_scope` if it
   names a scope the keyset never received. If yours is limited, copy the exact list from your keyset page
   and set it as `EBAY_OAUTH_SCOPES` (space- or comma-separated).

### Sandbox vs production

- `EBAY_ENVIRONMENT=sandbox` (default in `wrangler.jsonc`): sandbox keyset + sandbox user tokens.
- Production: create a **production** keyset, set `EBAY_ENVIRONMENT=production`, and obtain a
  **production** refresh token (step 3). Sandbox and production tokens are not interchangeable.

## 3. Obtain a user refresh token (one-time, on your own machine)

The consent flow cannot run inside the Worker. Easiest: upstream's setup wizard.

```bash
# Anywhere outside this project directory:
git clone https://github.com/YosefHayim/ebay-mcp
cd ebay-mcp
git checkout v1.18.0
npm install
npm run setup
```

The wizard asks for App ID, Cert ID, RuName and environment, opens the consent URL, and writes tokens to a
local `.env`. Copy `EBAY_USER_REFRESH_TOKEN` from it, that is the only value the Worker needs.

**Manual alternative** (no wizard): open the consent URL

```
https://auth.sandbox.ebay.com/oauth2/authorize?client_id=<App ID>&redirect_uri=<RuName>&response_type=code&scope=<scopes, %20-joined>
```

(Production: `https://auth.ebay.com/oauth2/authorize`.) Approve, copy `code` from the redirect, then:

```bash
curl -X POST https://api.sandbox.ebay.com/identity/v1/oauth2/token \
  -u "<App ID>:<Cert ID>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=<code>&redirect_uri=<RuName>"
```

(Production: `https://api.ebay.com/identity/v1/oauth2/token`.) Copy `refresh_token` from the response.

## 4. Set the Worker secrets

```bash
# Static Bearer token protecting /mcp: any long random string, e.g. `openssl rand -hex 32`
npx wrangler secret put MCP_AUTH_TOKEN

npx wrangler secret put EBAY_CLIENT_ID
npx wrangler secret put EBAY_CLIENT_SECRET

# Seed refresh token from step 3 (the Durable Object takes over after the first refresh)
npx wrangler secret put EBAY_USER_REFRESH_TOKEN

# Optional: your RuName (needed for ebay_get_oauth_url)
npx wrangler secret put EBAY_REDIRECT_URI
```

## 5. Deploy

```bash
npx wrangler deploy
```

First deploy creates the `TokenStore` Durable Object (SQLite-backed, migration `v1`). Output ends with your
Worker URL, e.g. `https://ebay-mcp-worker.<your-subdomain>.workers.dev`.

```bash
curl https://ebay-mcp-worker.<your-subdomain>.workers.dev/health
# {"status":"healthy","service":"ebay-mcp-worker","tools":378,...}
```

## 6. Connect a client

- **Endpoint:** `https://ebay-mcp-worker.<your-subdomain>.workers.dev/mcp`
- **Transport:** Streamable HTTP, **stateless** (no session IDs; JSON responses, POST only)
- **Auth header:** `Authorization: Bearer <MCP_AUTH_TOKEN>`

```bash
claude mcp add --transport http ebay-mcp \
  https://ebay-mcp-worker.<your-subdomain>.workers.dev/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

The server starts in dynamic mode: only `list_ebay_tools`, `enable_ebay_tools`, `disable_ebay_tools` are
visible; the client enables the tools it needs by name. The enabled set is stored in the Durable Object, so
it survives restarts and reconnects. Because the transport is stateless there is no
`tools/list_changed` push: after `enable_ebay_tools`, re-list tools (or reconnect) to see them.

## How tokens work

- **User tokens:** on cold start the Worker loads tokens from the Durable Object if it holds a refresh token
  (the DO wins), otherwise seeds from the `EBAY_USER_REFRESH_TOKEN` secret. Access tokens refresh lazily:
  only when expired, or after a 401 from eBay (the rejected token is invalidated, refreshed, and the request
  retried once). Refreshed tokens are written back to the Durable Object, never to a file.
- **App tokens** (client-credentials, for public reads) are minted on demand and cached in memory per isolate.
- **Re-authorizing:** run step 3 again, then call `ebay_set_user_tokens` from your MCP client, or
  `ebay_clear_tokens` (clears the DO) and `wrangler secret put EBAY_USER_REFRESH_TOKEN`. Note a still-set
  secret re-seeds after a clear; `wrangler secret delete EBAY_USER_REFRESH_TOKEN` to stay cleared.
- **Access-token freshness heuristic:** the DO records when tokens were last written; on cold start an access
  token written < 2h ago is treated as valid (eBay user tokens live 2h). Anything older is refreshed on first
  use. A stale token costs at most one failed request + retry.

## Local development / testing

```bash
cp .dev.vars.example .dev.vars   # fill in real values; never commit .dev.vars
npx wrangler dev --port 8787
MCP_URL=http://127.0.0.1:8787/mcp MCP_AUTH_TOKEN=<value from .dev.vars> npm run smoke
npm run typecheck
```

Quote values containing `#` in `.dev.vars` (e.g. `EBAY_USER_REFRESH_TOKEN="v^1.1#..."`), otherwise
everything after `#` is parsed as a comment.

`npm run smoke` verifies auth, initialize, dynamic-mode discovery, enable/disable persistence across
requests and clients, masked credential display, and a real eBay API call (which fails cleanly with an
eBay auth error when the credentials are dummies).

## Configuration reference

| Setting | Where | Default | Notes |
|---|---|---|---|
| `MCP_AUTH_TOKEN` | secret | (required) | Static Bearer token for `/mcp`. Worker 503s without it. |
| `EBAY_CLIENT_ID` | secret | none | eBay App ID |
| `EBAY_CLIENT_SECRET` | secret | none | eBay Cert ID |
| `EBAY_USER_REFRESH_TOKEN` | secret | none | Seed refresh token (step 3) |
| `EBAY_REDIRECT_URI` | secret/var | none | eBay RuName |
| `EBAY_ENVIRONMENT` | var | `sandbox` | `sandbox` \| `production` |
| `EBAY_MARKETPLACE_ID` | var | `EBAY_US` | REST marketplace, e.g. `EBAY_DE` |
| `EBAY_MCP_TOOLS` | var | `dynamic` | `dynamic` \| `all` \| comma-separated families |
| `EBAY_READ_ONLY` | var | `false` | `true` = read-only tools only |
| `EBAY_OAUTH_SCOPES` | var | full tables | Space/comma-separated scope list |
| `EBAY_MCP_API_BASE_URL` | var | none | Proxy base URL for eBay traffic |
| `EBAY_MCP_DISABLE_AUTH_HEADER` | var | none | `true` = proxy supplies auth |
| `EBAY_SITE_ID` | var | none | Trading API site override (usually unneeded) |
| `EBAY_LOG_LEVEL` | var | `info` | `error`…`debug` |

`wrangler.jsonc` also has a `previews` block (vars + Durable Object binding) for `wrangler preview`, since
preview bindings are not inherited.

## Notes and limits

- **Free-tier CPU:** Workers Free allows 10ms CPU per request. Each MCP request rebuilds the server (378
  tools registered per request); locally this measured ~50ms wall warm (~170ms cold), the CPU portion is
  unmeasured and may exceed 10ms. If you see CPU-limit errors, use the $5/mo Workers Paid plan. Bundle is
  ~5.0 MiB / ~881 KiB gzipped (under the 3 MiB gzip free-plan limit).
- **One global enabled set:** dynamic-mode enable state lives once in the Durable Object, shared by all
  clients. Fine for a single user; not per-client isolation.
- **No local-file media uploads:** the five file-based media tools and the feed-file upload tool are removed
  (no filesystem on Workers). The seven URL-based media tools are kept.
- **No MCP Apps UI:** every tool returns plain JSON text.
- **Multi-isolate staleness:** each isolate caches the API facade in memory; a token refreshed by one isolate
  is picked up by others on their next 401 refresh-and-retry. A newly seeded refresh token is picked up on
  isolate recycle.
- **`/health` `tools`** is the registry size (378), independent of `EBAY_READ_ONLY` / dynamic gating.
