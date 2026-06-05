# Site chat-history replay on reopen

**Date:** 2026-06-05
**Status:** Approved, ready for implementation plan

## Problem

When you reopen a forged site in the builder UI at a later date, the chat panel is
blank. It looks like the agent has forgotten everything you discussed, which makes it
hard to pick up where you left off.

## Key finding: the context already persists

The agent already retains full context across time — server-side. Each site has its own
`SiteSession` Durable Object keyed by the site name (`env.SITE_SESSION.idFromName(name)`,
so the same name always resolves to the same DO instance). Every turn's messages are
written to durable storage (`session.ts`, `ctx.storage.put("messages", ...)`), and on each
new turn the entire prior conversation plus the current deployed script is replayed to
Claude (`streamTurn(env, state.messages, state.currentScript)`). Returning to a site weeks
later and sending a message works correctly — Claude has the history and the current code.

The gap is purely presentational. `selectSite()` in `ui.ts` clears the chat panel
(`chat.innerHTML=''`) and prints only a "session opened" line; it never loads the stored
transcript, and there is no endpoint to fetch it. So the user cannot *see* the context the
agent still holds.

## Goal

Surface the already-persisted conversation in the chat panel when a site is selected, so
the user sees the prior transcript on reopen. No new storage, no schema change, no change
to the deploy path or the turn logic.

## Approach

Expose the DO's existing `getState()` via a read-only history endpoint, and have the UI
render the returned messages when a site is selected.

Two alternatives were considered and rejected:
- **Fold history into the DO `fetch()` handler (GET vs POST):** works, but `getState()` is
  already a clean public RPC method, so calling it directly is simpler and needs no path
  parsing inside the DO.
- **Store the transcript in the KV `SiteRecord`** so it rides along with `GET /api/sites`:
  avoids a round trip but duplicates the DO's authoritative data, bloats every list
  response, and adds a sync burden. Rejected (YAGNI).

## Design

### 1. Backend — history endpoint (`src/index.ts`)

Add a route, placed alongside the existing per-site routes and behind the same auth gate:

```
GET /api/sites/:name/history
```

- Match `^/api/sites/([a-z0-9-]+)/history$` with `req.method === "GET"`.
- Resolve the DO: `const stub = env.SITE_SESSION.get(env.SITE_SESSION.idFromName(name));`
- Call the existing RPC method: `const { messages } = await stub.getState();`
- Return `json({ messages })`.

No change to `SiteSession`; `getState()` already returns `{ messages, currentScript,
deployedUrl }` and we consume only `messages`. `StoredMessage` is `{ role: "user" |
"assistant", content: string }`.

For a site that has never been chatted, the DO has no stored messages and `getState()`
returns `messages: []` — the endpoint returns `{ messages: [] }`.

### 2. Frontend — render transcript on select (`src/ui.ts`)

Change `selectSite(name, url)` to load and render history:

- Keep the existing setup (set active, header, preview, enable composer).
- After `chat.innerHTML=''`, fetch `GET /api/sites/<name>/history`.
- **Race guard:** capture the selected `name`; when the fetch resolves, if
  `state.active !== name` (the user clicked a different site meanwhile), discard the result.
- Render in order:
  - `role:"user"` → a `you` bubble (reuse `bubble('user','you')`).
  - `role:"assistant"` with real text → a `forge` bubble (reuse `bubble('bot','forge')`).
  - `role:"assistant"` whose content is the stored placeholder `"(deployed)"` (written by
    `session.ts` when a turn only deployed and produced no prose) → a subtle sys line
    (e.g. `▸ deployed`) via `sysLine(...)`, instead of an odd bare bubble. No deploy-link
    reconstruction — the transcript records text, not live links.
- After rendering the transcript, print the existing `▸ session opened for <host>` sys line
  so it reads as a clear separator between past and present.
- Scroll the chat to the bottom once rendering completes.
- If the fetch fails, fall back to today's behavior (just the "session opened" line) and do
  not block the session.

`selectSite` becomes async-aware (it fires a fetch and renders on resolve); it does not need
to block the rest of the UI setup, which can happen synchronously before/independent of the
fetch.

## Out of scope

- Reconstructing inline `deployed → <link>` markers in the replayed transcript (plain
  text/sys-line replay only).
- Pagination or truncation of long histories (transcripts are small; revisit only if needed).
- Any change to how context is sent to Claude (already correct).

## Testing

- **Unit (backend):** `GET /api/sites/:name/history` returns `{ messages }` from the DO;
  returns `{ messages: [] }` for a site with no history; requires auth (401 when
  unauthenticated, consistent with other `/api/` routes).
- **Manual (frontend):** create a site, exchange a few messages and a deploy, reload the
  page, click the site → the prior transcript renders in order, placeholder assistant
  messages show as sys lines, the "session opened" line appears after the transcript, and
  rapidly clicking between two sites never renders the wrong site's history (race guard).
