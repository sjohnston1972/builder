# forge — AI Cloudflare Worker site builder

`builder.clydeford.net` is a Cloudflare Worker hosting an AI coding assistant
(Claude Opus 4.8). You chat with it, and it generates **single-file Cloudflare
Workers** and deploys each one live to its own `<name>.clydeford.net` subdomain.

- Pick a **name** (→ subdomain + Worker script name) and describe the **spec**.
- Claude builds it, calls its `deploy_worker` tool, and the host Worker ships it
  to the Cloudflare API.
- Refine conversationally; each site's chat + current script live in a
  `SiteSession` Durable Object. Sites are indexed in a `SITES` KV namespace.
- Access is gated by a single shared password.

## Architecture

```
Browser ──► builder Worker (builder.clydeford.net)
              ├─ Auth (password → HMAC-signed cookie)        src/auth.ts
              ├─ Router + sites API                          src/index.ts
              ├─ Chat UI (sidebar + chat + live preview)     src/ui.ts
              ├─ SiteSession Durable Object                  src/session.ts
              ├─ Anthropic client (Claude + deploy tool)     src/anthropic.ts
              └─ Deploy client (CF API) ──► <name>.clydeford.net   src/deploy.ts
```

## Prerequisites

- Node 18+ and npm.
- The `clydeford.net` zone active on your Cloudflare account (verified:
  account `5bdc4d7840e522355b86631e6b8fac2b`, zone `68c212a7f233ee505d871e816da19600`).
- A Cloudflare API token with **Workers Scripts: Edit**, **Workers Routes/Custom
  Domains: Edit**, and **Zone: Read** on `clydeford.net`.
- An Anthropic API key (`ANTHROPIC_API_KEY`).

## Local development

1. Install deps: `npm install`
2. Fill `.dev.vars` (gitignored) with real values:

   ```
   CF_API_TOKEN=<your Cloudflare API token>      # from .env CLOUDFLARE_API_TOKEN
   ANTHROPIC_API_KEY=<your Anthropic key>
   APP_PASSWORD=<choose a password>
   SESSION_SECRET=<long random string>
   ```

3. Create the KV namespace and paste the returned id into `wrangler.toml`
   (`[[kv_namespaces]] id = "..."`):

   ```
   npx wrangler kv namespace create SITES
   ```

4. Run: `npm run dev` → open the printed `http://localhost:8787`, log in, create a
   site, and send a build request. (Local dev still deploys **real** child Workers
   and calls Claude — costs apply.)

## Tests & typecheck

```
npm test          # vitest (Anthropic + Cloudflare APIs are mocked)
npm run typecheck # tsc --noEmit
```

> Note: this repo lives in a path containing a space (`agent builder`). That is
> only compatible with `@cloudflare/vitest-pool-workers` 0.8.x + vitest 3.1.x
> (pinned in `package.json`); newer/older pairings break on the space.

## Deploy

1. Ensure the KV id is set in `wrangler.toml` (step 3 above).
2. Set the production secrets:

   ```
   npx wrangler secret put CF_API_TOKEN        # from .env CLOUDFLARE_API_TOKEN
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put APP_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```

3. Deploy the host Worker (binds `builder.clydeford.net` as a custom domain):

   ```
   npx wrangler deploy
   ```

4. Visit `https://builder.clydeford.net`, log in, and forge a site. The first
   deploy of each `<name>.clydeford.net` provisions a TLS cert (~10–60s), so the
   live preview may show a brief "provisioning" state before it loads.

## Configuration reference

| Binding | Type | Where |
|---|---|---|
| `SITE_SESSION` | Durable Object | `wrangler.toml` (sqlite migration `v1`) |
| `SITES` | KV namespace | `wrangler.toml` |
| `CF_ACCOUNT_ID`, `ZONE_ID`, `SITE_ZONE` | vars | `wrangler.toml` |
| `CF_API_TOKEN`, `ANTHROPIC_API_KEY`, `APP_PASSWORD`, `SESSION_SECRET` | secrets | `wrangler secret put` / `.dev.vars` |

Generated sites are single-file module Workers; no KV/D1 bindings are provisioned
for them (by design — see `docs/superpowers/specs/`).
