# Forged-site access control (Google MFA) — Design

**Date:** 2026-06-03
**Status:** PARKED — design approved in direction; not implemented. Blocked on an
Access-scoped Cloudflare API token (see Prerequisites).

## Summary

Protect every site forged by `builder.clydeford.net` behind **Cloudflare Access**
using **Google as the identity provider** (real MFA, enforced by Google). Each
forged site gets its **own reusable Access policy** named `<name>-auth` carrying a
**per-site Google-email allow-list**, plus the **MFA requirement copied from the
existing reusable "mfa" policy**. Owners manage each site's allowed emails from the
builder UI.

## Decisions

| Decision | Choice |
|----------|--------|
| Auth mechanism | Cloudflare Access, **Google IdP**, real MFA |
| MFA source | Copy the `require` (MFA) rules from the existing reusable **"mfa"** policy |
| Allow-list scope | **Per-site** — one policy per site named `<name>-auth` |
| Email + MFA semantics | Both live in the **same** `<name>-auth` policy (so they are ANDed) |
| Owner lockout safety | Auto-seed `OWNER_EMAIL` (default `stevie.johnston@gmail.com`) on every site |
| Builder app itself | Stays password-gated (out of scope here — only "creations" are protected) |

## Why one policy per site (not the shared "mfa" policy alone)

Within a single Access policy, `include` (any match) is ANDed with `require` (all
match). **Across** policies on an app, an allow is granted if the user satisfies
**any** allow policy. So attaching a permissive "mfa" policy (`include: everyone`,
`require: mfa`) *alongside* a per-site email policy would let anyone-with-MFA in,
bypassing the email restriction. Therefore each site needs **one** policy that
contains both `include: [emails]` **and** `require: [mfa]`. We reuse the "mfa"
policy only as the **source of the `require` rules**, copied into `<name>-auth`.

## Architecture

```
Site create / deploy ──► ensureSiteAccess(name, emails)
                           ├─ read base "mfa" policy → copy its `require` (MFA) rules
                           ├─ upsert reusable policy "<name>-auth"
                           │     decision: allow
                           │     include:  [ {email}, ... ]   (per-site allow-list)
                           │     require:  [ ...MFA rules copied from "mfa" ]
                           └─ upsert Access application
                                 name:    "<name>"
                                 domain:  "<name>.clydeford.net"
                                 type:    self_hosted
                                 policies: [ "<name>-auth" policy id ]

Site delete ──► removeSiteAccess(name): delete app, then delete "<name>-auth" policy
Add/remove email ──► update "<name>-auth" policy `include` list
```

## Components

- **`src/access.ts`** (new)
  - `ensureSiteAccess(env, name, emails): Promise<{appId, policyId}>` — upsert the
    `<name>-auth` policy and the Access application; idempotent.
  - `removeSiteAccess(env, name): Promise<void>` — delete the app then the policy
    (best-effort, swallow not-found).
  - `getMfaRequireRules(env): Promise<unknown[]>` — read the base **"mfa"** reusable
    policy (by name or `MFA_POLICY_ID`) and return its `require` array; cache per
    isolate.
- **`src/types.ts`** — `SiteRecord` gains `allowedEmails: string[]`,
  `accessPolicyId?: string`, `accessAppId?: string`.
- **`src/index.ts`** — new routes:
  - `POST /api/sites/:name/emails` `{ email }` → validate email, add to record +
    `ensureSiteAccess`, return updated record.
  - `DELETE /api/sites/:name/emails` `{ email }` → remove + `ensureSiteAccess`.
  - On `POST /api/sites` (create) and after each deploy: call `ensureSiteAccess`
    with `allowedEmails` (seeded with `OWNER_EMAIL`).
  - On `DELETE /api/sites/:name`: also call `removeSiteAccess`.
- **`src/ui.ts`** — per-site **🔒 access** panel: list allowed emails, add/remove,
  show locked state. Protected sites swap the preview iframe for an **"open in new
  tab"** button (see UX wrinkle).
- **`wrangler.toml`** — add var `OWNER_EMAIL`; optional var `MFA_POLICY_ID` (else
  look the base policy up by name "mfa").

## Cloudflare Access API surface (to confirm against live API when building)

- List/read reusable policies: `GET /accounts/{acct}/access/policies`
  (find the base "mfa" policy; read its `require`).
- Create/update reusable policy: `POST` / `PUT /accounts/{acct}/access/policies[/{id}]`
  with `{ name: "<name>-auth", decision: "allow", include: [{ email: { email } }...],
  require: [ ...copied MFA rules ] }`.
- Create/update application: `POST` / `PUT /accounts/{acct}/access/apps[/{id}]`
  with `{ name, domain: "<name>.clydeford.net", type: "self_hosted",
  session_duration, policies: [ policyId ] }`.
- Delete application / policy: `DELETE …/access/apps/{id}` and `…/access/policies/{id}`.

> Exact field names (e.g. how the MFA `require` rule is encoded, whether policies
> attach by id vs inline) must be verified against the live API once the scoped
> token exists — do not hard-code unverified shapes.

## Prerequisites (owner action — blockers)

1. **Zero Trust + Google IdP** configured in the Cloudflare dashboard so "Sign in
   with Google" works and MFA is enforced by Google. (The existing "mfa" policy
   implies Zero Trust is on; the Google IdP specifically must be confirmed.)
2. **Access-scoped API token.** Update `CF_API_TOKEN` (keep its Workers Scripts +
   Routes/Custom Domains perms) to also include:
   - *Account · Access: Apps and Policies · Edit*
   - *Account · Access: Organizations, IdP and Groups · Read*
   The current token returns `10000 Authentication error` on every `/access/*`
   endpoint, so implementation cannot deploy or be verified live until this is done.
3. Confirm/seed the base **"mfa"** policy id or rely on lookup by name.

## Known UX wrinkle

Once a site is Access-protected, loading it in the **builder's preview iframe** will
show the Google login wall (cross-origin + Access), not the site. Mitigation:
detect "protected" sites and replace the iframe with an **"open in new tab"** action
(the owner authenticates once via Google, then the site loads normally).

## Error handling

- Email validation before any Access call; reject non-emails.
- Access API failures surface as a clear error in the UI; the KV record is only
  updated after a successful `ensureSiteAccess` (avoid drift between the allow-list
  shown and what Access enforces).
- Teardown is best-effort: a failed app/policy delete is logged but never blocks
  site deletion.

## Testing

- TDD with the Access API mocked at the `fetch` level (same pattern as
  `deploy.test.ts`):
  - `ensureSiteAccess` builds a `<name>-auth` policy with `include` = the emails and
    `require` = the rules returned by `getMfaRequireRules`.
  - The Access application payload carries `domain: "<name>.clydeford.net"` and
    references the policy id.
  - `removeSiteAccess` deletes app then policy.
  - `getMfaRequireRules` finds the base "mfa" policy and returns its `require`.
- Endpoint tests (`SELF.fetch` + stubbed global `fetch`) for add/remove email.
- **Live verification is blocked** until the Access-scoped token exists.

## Out of scope (YAGNI)

- Protecting `builder.clydeford.net` itself (stays password-gated).
- Group-based or org-wide allow-lists (per-site only).
- Wildcard single-app `*.clydeford.net` protection (per-site apps are simpler and
  avoid gating the builder).
- Non-Google IdPs / one-time-PIN fallback.

## Resume checklist

1. Owner supplies an Access-scoped `CF_API_TOKEN` and confirms the Google IdP.
2. Probe `/access/policies` to capture the base "mfa" policy's id + `require` shape.
3. `writing-plans` → implement `src/access.ts` (TDD) → wire routes + UI → live verify
   on one throwaway site → confirm Google-MFA wall + email allow-list both work.
