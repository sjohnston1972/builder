# AI Worker Site Builder — Design

**Date:** 2026-06-03
**Status:** Approved (pending spec review)

## Summary

A Cloudflare Worker hosted at `builder.clydeford.net` that provides a web-based AI
coding assistant. The assistant chats with the user and generates **single-file
Cloudflare Workers**, deploying each one live to its own `<name>.clydeford.net`
subdomain via the Cloudflare API. The user chooses each site's **name** (which
becomes the subdomain + Worker script name) and describes its **spec** in chat,
then refines it conversationally across messages.

## Decisions

| Decision | Choice |
|----------|--------|
| Build output | Generate **and** live-deploy to Cloudflare |
| AI model | Anthropic Claude (with prompt caching) |
| Generated site scope | Single-file Workers (HTML/CSS/JS/API inline) |
| Iteration | Conversational; per-site state in a Durable Object |
| Access control | Single shared password (Worker secret) |
| Host domain | `builder.clydeford.net` (custom domain on host Worker) |
| Generated site domains | `<name>.clydeford.net` (per-site custom domains) |
| Each site is... | Its **own independent Worker** (not a multi-tenant router) |

## Environment facts (verified)

- Zone `clydeford.net` is **active**: zone id `68c212a7f233ee505d871e816da19600`,
  account id `5bdc4d7840e522355b86631e6b8fac2b`, Free plan.
- Worker Custom Domains auto-issue a per-hostname TLS cert even on the Free plan,
  so `<name>.clydeford.net` sites need no extra certificate setup.
- `.env` already holds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Architecture

```
Browser ──► builder Worker (builder.clydeford.net)
              ├─ Auth (password → HMAC-signed cookie)
              ├─ Static chat UI (chat panel + live-preview iframe + sites sidebar)
              ├─ SiteSession Durable Object  (per site: history + current script + status)
              ├─ Anthropic client (Claude + prompt caching + deploy_worker tool)
              ├─ Deploy client (CF API) ──► child Worker @ <name>.clydeford.net
              └─ SITES KV (index of created sites for the sidebar)
```

The agent core uses **Approach A — single-tool generator**: Claude chats normally
and, when ready to ship, calls one tool `deploy_worker({ explanation, script })`.
The host Worker deploys that script. On each turn Claude sees the current script
(prompt-cached) so it can edit incrementally.

## Components

- **`src/index.ts`** — HTTP router + auth gate. Routes: `GET /` (UI), `GET/POST
  /login`, `GET /api/sites` (list), `POST /api/sites` (create), `POST
  /api/sites/:name/chat` (SSE chat turn), `DELETE /api/sites/:name`.
- **`src/auth.ts`** — verifies `APP_PASSWORD`; issues/validates an HMAC-signed
  (`SESSION_SECRET`) session cookie.
- **`src/session.ts`** — `SiteSession` Durable Object, id = `idFromName(siteName)`.
  Stores `messages[]`, `currentScript`, `deployStatus`, `deployedUrl`. Executes a
  chat turn: append user message, call Claude, stream text, run deploy on tool call,
  persist.
- **`src/anthropic.ts`** — Claude Messages API client. Prompt caching on the system
  prompt + tool definitions + prior script. Defines the `deploy_worker` tool.
- **`src/prompts.ts`** — system prompt instructing Claude to build single-file
  Cloudflare Workers and to call `deploy_worker` when ready.
- **`src/deploy.ts`** — Cloudflare deploy client (see Deploy mechanics).
- **`src/ui/`** — chat UI assets (chat panel, live-preview iframe, sites sidebar
  with a delete button). Polished later with the frontend-design skill.

## Data flow (one chat turn)

1. User logs in → receives signed session cookie.
2. "New site": user supplies a **name** and an initial **spec**. Name is sanitized
   to a valid DNS label / Worker script name (lowercase, alphanumeric + hyphen).
   The reserved name `builder` and any existing-site collision are rejected.
3. Message → `POST /api/sites/:name/chat` (SSE) → routed to that site's DO.
4. DO calls Claude with system prompt + tools + history + current script (cached),
   streaming Claude's reply text to the UI.
5. When Claude calls `deploy_worker`, the DO runs the deploy client:
   - `PUT /accounts/{acct}/workers/scripts/{name}` — multipart module upload of the
     single file (`metadata.main_module` + `index.mjs`, with a `compatibility_date`).
   - `PUT /accounts/{acct}/workers/domains` — attach `<name>.clydeford.net`
     (`zone_id = 68c212a7…`, `service = <name>`, `environment = production`).
     Idempotent: domain attach only needed on first deploy.
   - returns `https://<name>.clydeford.net`.
6. DO saves the script + URL, updates the SITES KV index, streams a `deployed`
   event → UI refreshes the preview iframe (showing a "provisioning…" state until
   SSL is ready, ~10–60s on first deploy).

## Secrets & config (host Worker)

Stored as Worker **secrets**: `CF_API_TOKEN`, `ANTHROPIC_API_KEY`, `APP_PASSWORD`,
`SESSION_SECRET`. Stored as plain **vars**: `CF_ACCOUNT_ID`, `ZONE_ID`.

The `CF_API_TOKEN` must have **Workers Scripts:Edit**, **Workers Custom
Domains/Routes edit**, and the relevant **Zone** scope. Setup docs will note this.

`wrangler.toml` declares: worker name `builder`, custom domain
`builder.clydeford.net`, the `SiteSession` Durable Object binding + migration, the
`SITES` KV binding, and the plain vars.

## Error handling

- **Cloudflare script-compile errors** — captured from the API response and fed back
  into the chat as a system/tool-result message so Claude can fix the script next turn.
- **Name collision / invalid name** — rejected at create time with a clear message.
- **Auth failure** — redirect to `/login`.
- **Anthropic rate limit / API error** — surfaced as a chat error message; turn can
  be retried.
- **Custom-domain attach failure** (e.g. cert pending) — site still deploys; UI shows
  "SSL provisioning, the URL may take a minute".

## Testing

- TypeScript + Wrangler. Tests via `vitest` + `@cloudflare/vitest-pool-workers`
  (Miniflare).
- Mock the Anthropic and Cloudflare APIs (fetch-level mocks).
- TDD focus: deploy-client request payloads (script upload + domain attach),
  `deploy_worker` tool-call parsing, name sanitization, cookie signing/verification.
- One integration smoke test: login → create site → mocked chat turn → mocked
  deploy → assert stored URL + KV index entry.

## Out of scope (YAGNI)

- Multi-file sites, static asset bundles, KV/D1 provisioning for generated sites.
- Multi-user accounts / per-user isolation (single shared password only).
- Multi-tenant dispatch router (each site is its own real Worker instead).
- Autonomous multi-tool agent loop (single `deploy_worker` tool only).
