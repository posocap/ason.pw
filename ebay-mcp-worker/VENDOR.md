# Vendored upstream

`src/vendor/` is [YosefHayim/ebay-mcp](https://github.com/YosefHayim/ebay-mcp) **v1.18.0** (MIT, see
`LICENSE.upstream`), copied from `src/{api,auth,config,mcp,schemas,tools,types,utils}` with the
Workers patches below. Everything else (CLI, setup wizard, Express/HTTP server, OAuth-server
middleware, skills, MCP Apps UI) was not copied.

## Patches

| File | Change |
|---|---|
| `utils/logger.ts` | winston/fs → console logger (same exports; level from `EBAY_LOG_LEVEL`) |
| `utils/version.ts` | no package.json read, no update-notifier; pinned `1.18.0` |
| `utils/localMedia.ts` | local-file loading removed; type-only stub kept |
| `config/environment.ts` | no dotenv/fs; scope tables imported from `data/*.json`; no icon files |
| `config/toolFamilies.ts` | dropped `node:process` import (global `process.env`, populated by `nodejs_compat`) |
| `auth/credentialSession.ts` | `.env` store removed; pluggable `CredentialStore` (`read`/`write`/`clear`) + `setDefaultCredentialStore` |
| `auth/oauth.ts` | `initialize()` reads the store (store wins over seed secret), **lazy** refresh instead of eager; refresh always persists both tokens; app tokens in-memory only; `invalidateAccessToken()` + `clearPersistedTokens()` |
| `api/client.ts` | 401 path invalidates the rejected access token before refresh-and-retry |
| `mcp/runtime.ts`, `mcp/toolGating.ts` | `enabledTools` / `onEnabledToolsChange` options so the dynamic-mode enabled set can be persisted; `enable/disable_ebay_tools` await the persist hook |
| `mcp/uiBridge.ts` | replaced by a no-op (no MCP Apps UI) |
| `tools/categories/media.ts`, `feed.ts` | removed 6 filesystem tools: `ebay_upload_images`, `ebay_upload_video`, `ebay_upload_document`, `ebay_upload_post_order_document`, `ebay_attach_media_to_inventory_item`, `ebay_upload_feed_task_file` |
| `tools/categories/tokenManagement.ts` | `ebay_clear_tokens` also clears the Durable Object; `.env` wording updated |
| removed | `mcp/httpTransport.ts`, `auth/{oauthMiddleware,oauthHelper,oauthMetadata,tokenVerifier*}.ts`, `config/{credentialFile,mediaAccess}.ts`, `utils/{envParser,cliOutput,cliUi,llmClientDetector,localFeedFiles}.ts` |

To upgrade: re-copy the directories from the new tag and re-apply the table above.
