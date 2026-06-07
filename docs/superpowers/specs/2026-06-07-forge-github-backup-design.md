# Back Up Every Forge's Source to GitHub — Design

**Date:** 2026-06-07
**Status:** Approved (design); pending implementation plan
**Author:** brainstormed with Claude

## Summary

Mirror the source code of every forged site into the user's GitHub, **one private repo per
forge** (`forge-<name>`), kept current automatically. Each time a forge is (re)built and
deployed via chat, the worker also commits that forge's latest source to its repo as a single
snapshot commit. A one-time backfill seeds the 9 forges that already exist. GitHub is a pure
**mirror** of what the `SiteSession` Durable Object already stores — it is never a source of
truth, and a GitHub failure can never break a deploy.

## Goals

- Every forge's complete current source is recoverable from GitHub.
- Stays current hands-off: every chat-driven deploy commits the new source.
- The 9 existing forges are backed up immediately via a one-time backfill.
- One private repo per forge, named `forge-<name>`, auto-created on first backup.
- Backup is **best-effort**: it never fails, slows, or blocks a deploy or chat turn.

## Non-goals

- Two-way sync. GitHub is a mirror; edits in GitHub do not flow back into forges.
- Backing up the builder app itself (already in `sjohnston1972/builder`).
- Committing chat history or build logs (source only; the DO retains history separately).
- Per-commit diff fidelity / preserving intermediate states. Each deploy = one snapshot commit
  reflecting the current file set (the forge model already regenerates the full source each turn).

## Prerequisite (from the user)

A GitHub **PAT** stored as the worker secret `GITHUB_TOKEN`:

- Fine-grained: *Administration: read/write* (to create repos) + *Contents: read/write*, scoped
  to the account that will own the repos; or
- Classic: `repo` scope (full control of private repos, includes creation).

The user generates it; Claude sets it via `wrangler secret put GITHUB_TOKEN` and runs the
backfill. Repo owner defaults to the authenticated user (`sjohnston1972`); an optional
`GITHUB_OWNER` worker var supports an org later.

## Where the code comes from

Each forge's complete source already lives at rest in its `SiteSession` DO `script` key
(`src/session.ts`):

- **Simple forge** → a single `index.mjs` string.
- **Framework forge** → `JSON.stringify({ files: [...] })` (e.g. `package.json`, `src/...`).

A `reconstructFiles(script)` step normalizes either form into a `{ path, content }[]` file set.
The exact framework file shape (`ev.files`) is confirmed against `src/session.ts` /
`src/buildclient.ts` during implementation before the reconstruction is finalized.

## Architecture

One sync path, two triggers:

```
 chat turn ─▶ SiteSession DO ─▶ deploy succeeds, persists new script+url
                                   └─▶ syncToGitHub()  ─┐
                                                        ├─▶ src/github.ts
 backfill script ─▶ POST /api/sites/:name/backup ──────▶ SiteSession.syncToGitHub()
   (loops all 9, authed by APP_PASSWORD)                  └─▶ syncForgeToGitHub(env, name, files, url)
                                                                ├─ ensure repo forge-<name> (private)
                                                                └─ snapshot commit via Git Data API
```

### `src/github.ts` (new, testable behind an injectable `fetch`)

`syncForgeToGitHub(env, name, files, url)`:

1. **Ensure repo:** `GET /repos/<owner>/forge-<name>`; on 404, `POST /user/repos`
   `{ name: "forge-<name>", private: true, auto_init: false }`.
2. **Snapshot commit (Git Data API):** create a blob per file → create a tree → create a commit
   → update (or create, for a brand-new empty repo) `refs/heads/main`. One commit per deploy.
   - New empty repo: tree has no `base_tree`, commit has no parents, then `POST` the ref.
   - Existing repo: parent = current `main` tip; tree built fresh (full snapshot, not a patch).
3. **README:** if the file set has no top-level `README.md`, add a generated one (forge name +
   live URL + "auto-backed-up by forge" note) so repos are browsable without clobbering.
4. Commit message: `forge: <name> @ <ISO timestamp>`; author/committer name `forge`.

### `SiteSession.syncToGitHub()` (new DO method)

Reads its own `script` + `url`, runs `reconstructFiles`, calls `syncForgeToGitHub`. Wrapped so
any throw is caught and logged. Called (a) internally right after a successful deploy persists
the new `script`+`url`, and (b) by the backup endpoint. Single implementation, two callers (DRY).

### `POST /api/sites/:name/backup` (new, authed endpoint in `src/index.ts`)

Behind the existing auth gate. Resolves the site's `SiteSession` stub and calls
`syncToGitHub()`, returning `{ ok, repo }` or `{ ok:false, error }`. Used by the backfill script;
also handy for manual re-backup.

### `scripts/backfill-forges-to-github.mjs` (new, one-time)

Logs in with `APP_PASSWORD` (from `.env`, per project convention), `GET /api/sites`, then
`POST /api/sites/:name/backup` for each. Reports per-forge result. Holds **no** GitHub token —
the worker uses its `GITHUB_TOKEN` secret.

## Error handling

- Auto-sync on deploy is **best-effort**: `syncToGitHub()` swallows and logs all errors; the
  deploy and chat turn always succeed regardless of GitHub state.
- The backup endpoint surfaces errors in its JSON response (so the backfill script can report
  which forges failed and be safely re-run — the sync is idempotent: re-running just makes a new
  snapshot commit, or none if unchanged).
- Repo creation races / "name exists" are treated as success (ensure-exists semantics).

## Testing

Unit tests (mocked `fetch`, no network):

- `reconstructFiles`: simple `index.mjs` string vs framework `{files:[...]}` JSON → correct
  `{path,content}[]`; injects README only when absent.
- `syncForgeToGitHub`: repo-exists (skip create) vs 404 (create); new-empty-repo first-commit
  path (no parent/base_tree, ref created) vs existing-repo path (parent tip, ref updated);
  asserts the blob/tree/commit request payloads.
- Endpoint auth: `POST /api/sites/:name/backup` rejects unauthed (401), accepts authed.

Live verification once the token is set: run the backfill, confirm 9 private `forge-*` repos
exist with the expected files, then edit one forge via chat and confirm a fresh auto-commit lands.

## Rollout

1. Implement `github.ts` + reconstruction + unit tests (no secret needed).
2. Wire `SiteSession.syncToGitHub()` + the post-deploy hook + the backup endpoint.
3. User provides the PAT → set `GITHUB_TOKEN` secret → `wrangler deploy`.
4. Run backfill for the 9 existing forges; verify.
5. Edit one forge via chat; verify the auto-commit.
