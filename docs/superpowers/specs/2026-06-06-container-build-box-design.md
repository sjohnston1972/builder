# Container Build Box for Forge — Design

**Date:** 2026-06-06
**Status:** Approved (design); pending implementation plan
**Author:** brainstormed with Claude

## Summary

Add a second deploy path to Forge so chatted-into-existence sites can use **real frontend
frameworks** (React/Vue/Svelte + npm dependencies + Tailwind) that require an `npm install` +
build step. A Forge-owned **Cloudflare Container** acts as an ephemeral, credential-free
**build box**: it receives project source, runs the build, and returns the built `dist/`. The
existing single-file Worker path is left completely intact; the framework path is purely additive.

Built sites are served as a **Worker + static-assets binding**: the static `dist/` is served via
the assets binding, and the Worker can still run a `fetch` handler for `/api/*` routes with the
injected `ANTHROPIC_API_KEY`. Sites remain on `<name>.clydeford.net`, so the existing
custom-domain attach + SSL-readiness polling apply unchanged.

## Goals

- Forge can build and deploy framework apps (default stack: **React + Vite + Tailwind**) from chat.
- The fast single-file Worker path stays unchanged for simple sites (no container cost/latency).
- Framework sites keep server-side API capability (`ANTHROPIC_API_KEY` available to a Worker entry).
- Build credentials never enter the container (untrusted npm packages run there).
- Iterative rebuilds (the common Forge refinement loop) are fast via warm containers + a cache.

## Non-goals

- Running forged apps *as* long-lived containers (a different idea; this is build-time only).
- Per-site bespoke container images (Cloudflare Containers are statically declared; we use one image).
- Built-in autoscaling (not offered by the platform yet).

## Prerequisites / feasibility (verified 2026-06-06)

- Docker 28.5.2 installed, daemon running. ✅
- wrangler 4.97.0 (Containers-capable). ✅
- Authenticated via `CLOUDFLARE_API_TOKEN`, account `5bdc4d7840e522355b86631e6b8fac2b`. ✅
- `wrangler containers list` responds cleanly (feature accessible, not blocked). ✅
- **Residual risk:** Workers Paid plan is required for Containers and could not be confirmed via
  the available token perms. **Mitigation:** the first implementation step is a real container
  deploy, so an access/plan block surfaces immediately rather than after deep investment.

## Architecture

Two deploy paths, chosen by Claude per request:

```
                    ┌─ simple site ──▶ deploy_worker  ──▶ deploySite()              (existing, ~1s)
 chat turn ─▶ DO ──▤
 (SiteSession)      └─ framework ────▶ deploy_project ──▶ build → deployProject()   (new, ~10-40s)
                                                            │
                                              ┌─────────────▼──────────────┐
                                              │  BuildBox container         │
                                              │  (Forge-owned, 1 image)     │
                                              │  Node + npm + build server  │
                                              │  cache-only R2 binding      │
                                              │  NO CF token / Anthropic key │
                                              └─────────────────────────────┘
```

### Invariants

1. The container is a **pure build function**: project files in → built assets + logs out.
2. The container is **fully credential-free** — it receives no Workers bindings at all (a container
   is a plain Linux process; bindings are a Workers-only concept). All credentialed work
   (`CF_API_TOKEN`, `ANTHROPIC_API_KEY`, deploys) stays in the trusted DO.
3. The existing `deploy_worker` / `deploySite()` path is unchanged. Frameworks are additive.
4. Built sites are Workers on `<name>.clydeford.net` → existing custom-domain + SSL polling reused.

### Warm-build routing & caching

- A site's builds route to a BuildBox instance **keyed by site name** (`BUILD_BOX.getByName(name)`),
  so repeated edits in one chat session reuse a warm container with `node_modules` still on disk.
  `sleepAfter` ≈ 10m keeps it warm during an active session. This covers the common Forge case
  (repeated refinement within a session) with zero extra infrastructure.
- **Note on cross-sleep caching:** a Cloudflare Container is a plain Linux process and does **not**
  receive Workers bindings (no in-container R2/KV). Persisting `node_modules` across container sleeps
  would require either DO-mediated tarball shipping over the DO↔container channel (heavy — a
  `node_modules` tarball can be tens–hundreds of MB, potentially slower than reinstalling) or giving
  the container R2 S3 credentials (violates the credential-free invariant). It is therefore
  **deferred** as a future enhancement, not part of v1. v1 relies on warm-instance caching only.

## Components

### 1. `BuildBox` container class (new)

- A `Container`-extending Durable Object class declared in `wrangler.toml`, backed by a Docker
  image: a slim Node base + a small HTTP **build server** listening on a port the Container proxies.
- Bindings: **none** (fully credential-free; see invariant 2).
- `sleepAfter` ≈ `"10m"`.
- Build server endpoint `POST /build`:
  - Request: `{ files: [{path, content}], installCommand, buildCommand, outputDir }`.
  - Behavior: write files to a per-site work dir → run install (stream logs) → run build (stream
    logs) → read `outputDir` recursively → return assets + logs. `node_modules` persists on the
    container's ephemeral disk between rebuilds while the instance is warm.
  - Response: streamed NDJSON — `{"type":"log","line":...}` per output line, terminating with
    `{"type":"result","ok":true,"assets":[{path,contentBase64,contentType}]}` or
    `{"type":"result","ok":false,"error":...}`.
  - Limits: build timeout (~120s), max total input size, max file count, max output size.

### 2. `SiteSession` DO (existing — orchestrator/brain)

- Gains a branch in the turn loop for the new `deploy_project` event from `streamTurn`:
  1. emit `building_project` SSE event;
  2. get BuildBox stub `env.BUILD_BOX.idFromName(name)`;
  3. POST files to the container `/build`, forwarding streamed `build_log` SSE events to the client;
  4. on `ok:false` → emit `build_failed` (with logs), persist the error, leave previous version live,
     and record the failure in conversation history so Claude can fix it next turn;
  5. on `ok:true` → call `deployProject(env, name, workerEntry, assets)`;
  6. `waitUntilLive(url)` → emit `deployed` (reuses existing SSL-readiness polling).
- Continues to own all credentialed work; keeps `status` tracking + mobile-recovery semantics.
  Build logs/last error are persisted so a reconnecting client sees the outcome.

### 3. `deploy.ts` — `deployProject()` (new function; `deploySite()` untouched)

Workers Assets upload flow:
1. `POST /accounts/:id/workers/scripts/:name/assets-upload-session` with manifest
   `{ [path]: { hash, size } }` → returns a `jwt` and the buckets of file hashes to upload.
2. Upload the missing files (multipart, base64) with the jwt.
3. `PUT /accounts/:id/workers/scripts/:name` with metadata:
   - `main_module`: the Claude-supplied `workerEntry`, or a default stub that serves assets
     (`env.ASSETS.fetch(request)` fallback);
   - `assets`: `{ jwt, config: { not_found_handling: "single-page-application" } }`;
   - `compatibility_date`, `compatibility_flags: ["nodejs_compat"]`;
   - `bindings`: `ASSETS` (assets binding) + `ANTHROPIC_API_KEY` secret (as today).
4. Attach custom domain — **reuse** the existing code path from `deploySite()` (refactor the shared
   domain-attach into a helper so both paths use it).

### 4. Anthropic tool/prompt changes (`prompts.ts`, `anthropic.ts`)

- New tool `deploy_project` with the input schema described in Architecture.
- `TurnEvent` gains `{ type: "deploy_project", explanation, files, installCommand, buildCommand,
  outputDir, workerEntry }`; `streamTurn` yields it on that tool_use.
- System prompt additions: when to use each path; the default stack (React + Vite + Tailwind);
  the contract (build must emit static output to `outputDir`; API routes go in `workerEntry` and may
  use `env.ANTHROPIC_API_KEY`); fixed Node version / available tooling from the image.

### 5. UI changes (`ui.ts`)

- Handle new SSE events: `building_project` (status pill + build line), `build_log` (append to an
  expandable build-log view in the deploy line), `build_failed` (error styling + logs, like the
  existing error bubble). `deployed` unchanged (reuses the SSL "almost live" messaging).
- History rendering shows a build failed/succeeded marker so reconnecting clients see the outcome.

## Data flow (framework path)

```
client ──chat──▶ index.ts ──▶ SiteSession.fetch (turn)
   │                                  │
   │            streamTurn ──text──▶  │ ──SSE text──▶ client
   │            streamTurn ──deploy_project──▶
   │                                  │ ──SSE building_project──▶ client
   │                                  │ ──POST /build {files}──▶ BuildBox
   │                                  │ ◀──streamed logs────────  │ (install+build)
   │ ◀──SSE build_log (each line)─────│                            │
   │                                  │ ◀──{ok, assets}──────────  │
   │                                  │ ──deployProject(assets)──▶ CF Assets+Worker API
   │                                  │ ──waitUntilLive(url)
   │ ◀──SSE deployed──────────────────│
```

## Error handling

- **npm install / build failure:** stream logs, emit `build_failed`, keep previous deploy live,
  persist error + logs, append failure to conversation so Claude can self-correct next turn.
- **Container start / build timeout (~120s):** treated as build failure with a timeout message.
- **Oversized input/output / too many files:** rejected by the build server with a clear error.
- **Assets upload / PUT failure:** surfaced like existing CF API errors (`cf()` throws message).
- **Client disconnect mid-build:** build continues server-side (existing pattern); status stays
  `building`; reconnecting client polls and sees persisted outcome.

## Testing strategy

- **Unit:** `deployProject` assets-upload sequence (mock `fetch`, assert session→upload→PUT order +
  manifest hashing); `SiteSession` `deploy_project` branch (mock BuildBox stub + anthropic — assert
  files routed, assets passed to deploy, status transitions, `build_failed` path); build-server pure
  helpers (file write, manifest, output collection) in Node.
- **Integration (Docker-gated):** real container build of a known React+Vite fixture via
  `wrangler dev`; assert `dist/` produced and returned.
- **E2E (Playwright + screenshot-verify):** forge a React site through the live UI; assert it builds
  and the preview renders. (Matches repo convention + the "verify UI with screenshots" practice.)
- **Access confirmation:** step 1 of the plan is a real container deploy.

## Risks & open questions

- **Workers Paid confirmation** — resolved by the step-1 real deploy.
- **Container egress for `npm install`** — confirm the container can reach the npm registry.
- **Build cost** — warm containers bill for active time; `sleepAfter` bounds it. Acceptable for
  personal use; revisit if usage grows.
- **DO↔container payload size** — project source travels as JSON; cap sizes. `node_modules` is never
  shipped over the channel (it lives on the container's ephemeral disk).
- **Cross-sleep dep cache** — deferred (see "Warm-build routing & caching"); v1 reinstalls on a cold
  container. Acceptable since warm instances cover the in-session refine loop.
- **Image size vs cold start** — keep the Node image slim to stay near the 1–3s cold-start range.
- **Worker script size limit** — not a concern: the JS bundle is served as an *asset*, not part of
  the Worker script.

## Sequencing note (for the implementation plan)

Although v1 is full-featured, the plan should order work so a **working end-to-end slice lands
early**: (1) real container deploy (access check) → (2) minimal build server + `deploy_project` for a
single React+Vite fixture end-to-end → then layer on caching, multi-framework prompt fluency,
streamed logs, error-recovery polish, and tests. Build order, not scope reduction.
