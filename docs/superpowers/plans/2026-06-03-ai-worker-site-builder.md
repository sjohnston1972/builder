# AI Worker Site Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `builder.clydeford.net` — a Cloudflare Worker hosting an AI chat assistant (Claude) that generates single-file Cloudflare Workers and deploys them live to `<name>.clydeford.net`.

**Architecture:** One host Worker (`builder`) serves a password-gated chat UI, holds per-site conversation state in a `SiteSession` Durable Object, calls Claude (via the Anthropic SDK with prompt caching) using a single `deploy_worker` tool, and on tool use deploys the generated script to its own subdomain via the Cloudflare API.

**Tech Stack:** TypeScript, Cloudflare Workers + Durable Objects + KV, Wrangler 4, `@anthropic-ai/sdk`, Vitest + `@cloudflare/vitest-pool-workers`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `wrangler.toml` | Project + build + test + deploy config |
| `.dev.vars` | Local secrets (gitignored) |
| `src/types.ts` | `Env` binding interface + shared types (`SiteRecord`, `StoredMessage`) |
| `src/names.ts` | `sanitizeName`, `isValidName` (pure) |
| `src/auth.ts` | `signSession`, `verifySession`, `checkPassword`, cookie helpers (WebCrypto HMAC) |
| `src/deploy.ts` | `deploySite` (script upload + custom-domain attach via CF API) |
| `src/prompts.ts` | System prompt + `deploy_worker` tool schema |
| `src/anthropic.ts` | `streamTurn` — calls Claude, yields text/tool events |
| `src/session.ts` | `SiteSession` Durable Object — per-site state + turn orchestration |
| `src/ui.ts` | `loginPage()`, `appPage()` HTML |
| `src/index.ts` | Router + auth gate + `/api/*` endpoints |
| `tests/*.test.ts` | Unit + integration tests |

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.toml`, `vitest.config.ts`, `.dev.vars`, `src/types.ts`, `src/index.ts`, `tests/smoke.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "builder",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.1"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.40",
    "@cloudflare/workers-types": "^4.20241218.0",
    "typescript": "^5.7.2",
    "vitest": "2.1.8",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `wrangler.toml`**

```toml
name = "builder"
main = "src/index.ts"
compatibility_date = "2025-05-01"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "builder.clydeford.net", custom_domain = true }
]

[vars]
CF_ACCOUNT_ID = "5bdc4d7840e522355b86631e6b8fac2b"
ZONE_ID = "68c212a7f233ee505d871e816da19600"
SITE_ZONE = "clydeford.net"

[[durable_objects.bindings]]
name = "SITE_SESSION"
class_name = "SiteSession"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SiteSession"]

[[kv_namespaces]]
binding = "SITES"
id = "PLACEHOLDER_REPLACE_AFTER_KV_CREATE"
```

- [ ] **Step 4: Create `.dev.vars`** (gitignored — fill from `.env` during setup)

```
CF_API_TOKEN=replace-me
ANTHROPIC_API_KEY=replace-me
APP_PASSWORD=replace-me
SESSION_SECRET=replace-me-with-long-random-string
```

- [ ] **Step 5: Create `src/types.ts`**

```ts
import type { SiteSession } from "./session";

export interface Env {
  SITE_SESSION: DurableObjectNamespace<SiteSession>;
  SITES: KVNamespace;
  CF_ACCOUNT_ID: string;
  ZONE_ID: string;
  SITE_ZONE: string;
  CF_API_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SiteRecord {
  name: string;
  url: string;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 6: Create minimal `src/index.ts`**

```ts
import type { Env } from "./types";
export { SiteSession } from "./session";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return new Response("ok");
  },
} satisfies ExportedHandler<Env>;
```

(Temporary `src/session.ts` stub so the export resolves — replaced in Task 6.)

```ts
// src/session.ts (stub)
import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";
export class SiteSession extends DurableObject<Env> {}
```

- [ ] **Step 7: Create `vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            CF_API_TOKEN: "test-token",
            ANTHROPIC_API_KEY: "test-anthropic",
            APP_PASSWORD: "test-pass",
            SESSION_SECRET: "test-secret-0123456789",
          },
        },
      },
    },
  },
});
```

- [ ] **Step 8: Create `tests/smoke.test.ts`**

```ts
import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("worker responds", async () => {
  const res = await SELF.fetch("https://builder.clydeford.net/healthz");
  expect(res.status).toBe(200);
});
```

Add a `/healthz` route to `src/index.ts`:

```ts
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return new Response("ok");
```

- [ ] **Step 9: Install + run**

Run: `npm install && npx vitest run tests/smoke.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: scaffold builder worker project"
```

---

## Task 2: Site name sanitization

**Files:** Create `src/names.ts`, `tests/names.test.ts`

- [ ] **Step 1: Write failing test `tests/names.test.ts`**

```ts
import { expect, test } from "vitest";
import { sanitizeName, isValidName } from "../src/names";

test("sanitizes to a valid dns/worker label", () => {
  expect(sanitizeName("My Cool Site!")).toBe("my-cool-site");
  expect(sanitizeName("  Hello__World  ")).toBe("hello-world");
  expect(sanitizeName("a.b.c")).toBe("a-b-c");
});

test("validates labels", () => {
  expect(isValidName("good-name")).toBe(true);
  expect(isValidName("builder")).toBe(false); // reserved
  expect(isValidName("")).toBe(false);
  expect(isValidName("-bad")).toBe(false);
  expect(isValidName("a".repeat(64))).toBe(false); // too long
  expect(isValidName("UPPER")).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run tests/names.test.ts`)

- [ ] **Step 3: Implement `src/names.ts`**

```ts
const RESERVED = new Set(["builder", "www", "api", "admin"]);

export function sanitizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function isValidName(name: string): boolean {
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) return false;
  if (RESERVED.has(name)) return false;
  return true;
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: site name sanitization"`

---

## Task 3: Auth — password + signed session cookie

**Files:** Create `src/auth.ts`, `tests/auth.test.ts`

- [ ] **Step 1: Write failing test `tests/auth.test.ts`**

```ts
import { expect, test } from "vitest";
import { signSession, verifySession, checkPassword } from "../src/auth";

const SECRET = "test-secret-0123456789";

test("round-trips a signed session", async () => {
  const token = await signSession(SECRET);
  expect(await verifySession(token, SECRET)).toBe(true);
});

test("rejects tampered or wrong-secret tokens", async () => {
  const token = await signSession(SECRET);
  expect(await verifySession(token + "x", SECRET)).toBe(false);
  expect(await verifySession(token, "other-secret")).toBe(false);
  expect(await verifySession("", SECRET)).toBe(false);
});

test("checkPassword compares constant-time-ish", () => {
  expect(checkPassword("hunter2", "hunter2")).toBe(true);
  expect(checkPassword("nope", "hunter2")).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/auth.ts`** (WebCrypto HMAC-SHA256; token = `payload.sig`)

```ts
const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function signSession(secret: string): Promise<string> {
  const payload = `auth.${Date.now()}`;
  const sig = await hmac(secret, payload);
  return `${btoa(payload)}.${sig}`;
}

export async function verifySession(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  let payload: string;
  try { payload = atob(parts[0]); } catch { return false; }
  const expected = await hmac(secret, payload);
  return timingSafeEqual(parts[1], expected);
}

export function checkPassword(given: string, actual: string): boolean {
  return timingSafeEqual(given, actual);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export const COOKIE = "builder_session";

export function cookieHeader(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

export function readCookie(req: Request): string | null {
  const raw = req.headers.get("Cookie") || "";
  const m = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat: password auth + signed session cookie"`

---

## Task 4: Cloudflare deploy client

**Files:** Create `src/deploy.ts`, `tests/deploy.test.ts`

Deploys a single-file module Worker, then attaches the custom domain. Uses
multipart upload: a `metadata` JSON part (`main_module`, `compatibility_date`) plus
the script file part.

- [ ] **Step 1: Write failing test `tests/deploy.test.ts`** (mock `fetch`)

```ts
import { afterEach, expect, test, vi } from "vitest";
import { deploySite } from "../src/deploy";

const env = {
  CF_ACCOUNT_ID: "acct1", ZONE_ID: "zone1", SITE_ZONE: "clydeford.net",
  CF_API_TOKEN: "tok",
} as any;

afterEach(() => vi.restoreAllMocks());

test("uploads script then attaches domain, returns url", async () => {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response(JSON.stringify({ success: true, result: {} }), {
      headers: { "content-type": "application/json" },
    });
  }));

  const url = await deploySite(env, "mysite", "export default {fetch(){return new Response('hi')}}");

  expect(url).toBe("https://mysite.clydeford.net");
  expect(calls[0].url).toContain("/accounts/acct1/workers/scripts/mysite");
  expect(calls[0].method).toBe("PUT");
  expect(calls[1].url).toContain("/accounts/acct1/workers/domains");
});

test("throws with Cloudflare error message on failure", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ success: false, errors: [{ message: "Uncaught SyntaxError" }] }),
      { status: 400, headers: { "content-type": "application/json" } }),
  ));
  await expect(deploySite(env, "mysite", "bad code")).rejects.toThrow("Uncaught SyntaxError");
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/deploy.ts`**

```ts
import type { Env } from "./types";

const API = "https://api.cloudflare.com/client/v4";
const COMPAT_DATE = "2025-05-01";

async function cf(env: Env, path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, ...(init.headers || {}) },
  });
  const body = await res.json<any>().catch(() => ({}));
  if (!res.ok || !body.success) {
    const msg = body?.errors?.[0]?.message || `CF API ${res.status}`;
    throw new Error(msg);
  }
  return body.result;
}

export async function deploySite(env: Env, name: string, script: string): Promise<string> {
  const form = new FormData();
  form.set("metadata", new Blob([JSON.stringify({
    main_module: "index.mjs",
    compatibility_date: COMPAT_DATE,
    compatibility_flags: ["nodejs_compat"],
  })], { type: "application/json" }));
  form.set("index.mjs", new Blob([script], { type: "application/javascript+module" }), "index.mjs");

  await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${name}`, {
    method: "PUT", body: form,
  });

  await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/domains`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      zone_id: env.ZONE_ID,
      hostname: `${name}.${env.SITE_ZONE}`,
      service: name,
      environment: "production",
    }),
  }).catch((e) => {
    // Domain may already be attached from a prior deploy — ignore "already exists".
    if (!/already|exists|duplicate/i.test(String(e.message))) throw e;
  });

  return `https://${name}.${env.SITE_ZONE}`;
}

export async function deleteSite(env: Env, name: string): Promise<void> {
  await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${name}`, { method: "DELETE" })
    .catch(() => {});
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat: cloudflare deploy client"`

---

## Task 5: Prompts + Anthropic streaming client

**Files:** Create `src/prompts.ts`, `src/anthropic.ts`, `tests/anthropic.test.ts`

- [ ] **Step 1: Create `src/prompts.ts`**

```ts
export const MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `You are an expert Cloudflare Workers engineer inside a website builder.
You build COMPLETE, SINGLE-FILE Cloudflare Workers that serve a website.

Rules for every site you build:
- One file only. ES module syntax: \`export default { async fetch(request, env, ctx) { ... } }\`.
- Return full HTML documents with inline CSS and JS. Make them attractive and responsive.
- No external build steps, no npm imports, no KV/D1 bindings (none are configured).
- Handle the request path yourself if multiple pages/endpoints are needed.

Conversation flow:
- Discuss briefly with the user, then when you have something to ship, CALL the deploy_worker tool.
- The 'script' argument must be the ENTIRE worker file, ready to deploy as-is.
- After deploying, summarize what you built in one or two sentences.
- When the user asks for changes, edit the current script and deploy again.`;

export const DEPLOY_TOOL = {
  name: "deploy_worker",
  description: "Deploy the single-file Cloudflare Worker script live to the user's subdomain.",
  input_schema: {
    type: "object" as const,
    properties: {
      explanation: { type: "string", description: "One sentence on what changed." },
      script: { type: "string", description: "The complete single-file Worker module source." },
    },
    required: ["explanation", "script"],
  },
};
```

- [ ] **Step 2: Write failing test `tests/anthropic.test.ts`**

Mocks the Anthropic SDK by stubbing `fetch` with a canned SSE stream containing a
text delta and a `deploy_worker` tool use.

```ts
import { expect, test, vi, afterEach } from "vitest";
import { streamTurn } from "../src/anthropic";

afterEach(() => vi.restoreAllMocks());

function sse(lines: string[]): Response {
  const body = lines.map((l) => `event: ${l}\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

test("yields text then tool deploy event", async () => {
  // Minimal canned Anthropic SSE: message_start, text delta, tool_use, stop.
  const chunks = [
    `event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[],"model":"x","stop_reason":null,"usage":{"input_tokens":1,"output_tokens":1}}}\n\n`,
    `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Building"}}\n\n`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`,
    `event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"deploy_worker","input":{}}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"explanation\\":\\"hi\\",\\"script\\":\\"export default{}\\"}"}}\n\n`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n`,
    `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":2}}\n\n`,
    `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
  ];
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(chunks.join(""), { headers: { "content-type": "text/event-stream" } }),
  ));

  const env = { ANTHROPIC_API_KEY: "k" } as any;
  const events: any[] = [];
  for await (const ev of streamTurn(env, [{ role: "user", content: "make a site" }], null)) {
    events.push(ev);
  }
  const text = events.filter((e) => e.type === "text").map((e) => e.text).join("");
  const deploy = events.find((e) => e.type === "deploy");
  expect(text).toContain("Building");
  expect(deploy.explanation).toBe("hi");
  expect(deploy.script).toContain("export default");
});
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement `src/anthropic.ts`** using the SDK's streaming events

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { Env, StoredMessage } from "./types";
import { MODEL, SYSTEM_PROMPT, DEPLOY_TOOL } from "./prompts";

export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "deploy"; explanation: string; script: string };

export async function* streamTurn(
  env: Env,
  history: StoredMessage[],
  currentScript: string | null,
): AsyncGenerator<TurnEvent> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const system = [
    { type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } },
  ];
  if (currentScript) {
    system.push({
      type: "text" as const,
      text: `CURRENT DEPLOYED SCRIPT:\n\n${currentScript}`,
      cache_control: { type: "ephemeral" as const },
    });
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    system,
    tools: [DEPLOY_TOOL],
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }

  const final = await stream.finalMessage();
  for (const block of final.content) {
    if (block.type === "tool_use" && block.name === "deploy_worker") {
      const input = block.input as { explanation: string; script: string };
      yield { type: "deploy", explanation: input.explanation, script: input.script };
    }
  }
}
```

> Note: the SDK reads `globalThis.fetch`, so the test's `vi.stubGlobal("fetch", …)`
> feeds the canned SSE stream. If the SDK version ignores the global, set
> `new Anthropic({ apiKey, fetch: globalThis.fetch })`. Consult the **claude-api**
> skill when implementing this task for current SDK + caching specifics.

- [ ] **Step 5: Run — expect PASS** (adjust the fetch wiring per the note if needed)
- [ ] **Step 6: Commit** — `git commit -am "feat: anthropic streaming turn with deploy tool"`

---

## Task 6: SiteSession Durable Object

**Files:** Replace `src/session.ts`, create `tests/session.test.ts`

The DO stores `messages`, `currentScript`, `deployedUrl` in SQLite-backed storage.
`POST` to it with a user message runs a turn: stream Claude text out as SSE, and on
a `deploy` event call `deploySite`, persist, and emit a `deployed` SSE event.

- [ ] **Step 1: Write failing test `tests/session.test.ts`** using `runInDurableObject`

```ts
import { env, runInDurableObject } from "cloudflare:test";
import { expect, test, vi, afterEach } from "vitest";
import { SiteSession } from "../src/session";

afterEach(() => vi.restoreAllMocks());

test("turn streams text and deploys, persisting url", async () => {
  // Mock the anthropic stream + the CF deploy fetch.
  vi.mock("../src/anthropic", () => ({
    async *streamTurn() {
      yield { type: "text", text: "Building your site. " };
      yield { type: "deploy", explanation: "init", script: "export default {fetch(){return new Response('hi')}}" };
    },
  }));
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ success: true, result: {} }), {
      headers: { "content-type": "application/json" },
    }),
  ));

  const id = env.SITE_SESSION.idFromName("mysite");
  const stub = env.SITE_SESSION.get(id);

  const res = await stub.fetch("https://do/turn", {
    method: "POST",
    body: JSON.stringify({ name: "mysite", message: "make a hello site" }),
  });
  const text = await res.text();
  expect(text).toContain("Building your site");
  expect(text).toContain("mysite.clydeford.net");

  await runInDurableObject(stub, async (instance: SiteSession) => {
    const state = await instance.getState();
    expect(state.deployedUrl).toBe("https://mysite.clydeford.net");
    expect(state.messages.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/session.ts`**

```ts
import { DurableObject } from "cloudflare:workers";
import type { Env, StoredMessage } from "./types";
import { streamTurn } from "./anthropic";
import { deploySite } from "./deploy";

interface State {
  messages: StoredMessage[];
  currentScript: string | null;
  deployedUrl: string | null;
}

export class SiteSession extends DurableObject<Env> {
  async getState(): Promise<State> {
    return {
      messages: (await this.ctx.storage.get<StoredMessage[]>("messages")) ?? [],
      currentScript: (await this.ctx.storage.get<string>("script")) ?? null,
      deployedUrl: (await this.ctx.storage.get<string>("url")) ?? null,
    };
  }

  async fetch(req: Request): Promise<Response> {
    const { name, message } = await req.json<{ name: string; message: string }>();
    const state = await this.getState();
    state.messages.push({ role: "user", content: message });

    const env = this.env;
    const ctx = this.ctx;
    const self = this;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        let assistantText = "";
        try {
          for await (const ev of streamTurn(env, state.messages, state.currentScript)) {
            if (ev.type === "text") {
              assistantText += ev.text;
              send({ type: "text", text: ev.text });
            } else if (ev.type === "deploy") {
              send({ type: "deploying" });
              const url = await deploySite(env, name, ev.script);
              state.currentScript = ev.script;
              state.deployedUrl = url;
              await ctx.storage.put("script", ev.script);
              await ctx.storage.put("url", url);
              send({ type: "deployed", url, explanation: ev.explanation });
            }
          }
          state.messages.push({ role: "assistant", content: assistantText || "(deployed)" });
          await ctx.storage.put("messages", state.messages);
        } catch (err: any) {
          send({ type: "error", message: String(err?.message ?? err) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }
}
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat: SiteSession durable object turn orchestration"`

---

## Task 7: Router, auth gate, and API endpoints

**Files:** Replace `src/index.ts`, create `tests/api.test.ts`

Routes:
- `GET /healthz` → ok
- `GET /login`, `POST /login` (password form → cookie)
- `GET /` → app page (auth required, else redirect to `/login`)
- `GET /api/sites` → JSON list from KV
- `POST /api/sites` → `{ name }` create (validate, ensure unique), returns record
- `POST /api/sites/:name/chat` → `{ message }` proxied to the DO, returns SSE
- `DELETE /api/sites/:name` → delete worker + KV record

- [ ] **Step 1: Write failing test `tests/api.test.ts`**

```ts
import { SELF, env } from "cloudflare:test";
import { expect, test } from "vitest";

async function login(): Promise<string> {
  const res = await SELF.fetch("https://builder.clydeford.net/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "password=test-pass",
    redirect: "manual",
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

test("unauthed root redirects to login", async () => {
  const res = await SELF.fetch("https://builder.clydeford.net/", { redirect: "manual" });
  expect(res.status).toBe(302);
  expect(res.headers.get("location")).toBe("/login");
});

test("login then create + list site", async () => {
  const cookie = await login();
  const create = await SELF.fetch("https://builder.clydeford.net/api/sites", {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Test Site" }),
  });
  expect(create.status).toBe(200);
  const rec = await create.json<any>();
  expect(rec.name).toBe("test-site");

  const list = await SELF.fetch("https://builder.clydeford.net/api/sites", { headers: { cookie } });
  const sites = await list.json<any[]>();
  expect(sites.some((s) => s.name === "test-site")).toBe(true);
});

test("rejects reserved name", async () => {
  const cookie = await login();
  const res = await SELF.fetch("https://builder.clydeford.net/api/sites", {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "builder" }),
  });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/index.ts`**

```ts
import type { Env, SiteRecord } from "./types";
import { appPage, loginPage } from "./ui";
import { checkPassword, signSession, verifySession, readCookie, cookieHeader } from "./auth";
import { sanitizeName, isValidName } from "./names";
import { deleteSite } from "./deploy";

export { SiteSession } from "./session";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function authed(req: Request, env: Env): Promise<boolean> {
  const token = readCookie(req);
  return !!token && (await verifySession(token, env.SESSION_SECRET));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/healthz") return new Response("ok");

    if (path === "/login") {
      if (req.method === "GET") return new Response(loginPage(), { headers: { "content-type": "text/html" } });
      const form = await req.formData();
      if (checkPassword(String(form.get("password") ?? ""), env.APP_PASSWORD)) {
        const token = await signSession(env.SESSION_SECRET);
        return new Response(null, { status: 302, headers: { location: "/", "set-cookie": cookieHeader(token) } });
      }
      return new Response(loginPage("Wrong password"), { status: 401, headers: { "content-type": "text/html" } });
    }

    const ok = await authed(req, env);
    if (!ok) {
      if (path.startsWith("/api/")) return json({ error: "unauthorized" }, 401);
      return new Response(null, { status: 302, headers: { location: "/login" } });
    }

    if (path === "/") return new Response(appPage(), { headers: { "content-type": "text/html" } });

    if (path === "/api/sites" && req.method === "GET") {
      const list = await env.SITES.list({ prefix: "site:" });
      const records = await Promise.all(
        list.keys.map((k) => env.SITES.get<SiteRecord>(k.name, "json")),
      );
      return json(records.filter(Boolean));
    }

    if (path === "/api/sites" && req.method === "POST") {
      const { name: raw } = await req.json<{ name: string }>();
      const name = sanitizeName(raw ?? "");
      if (!isValidName(name)) return json({ error: "Invalid or reserved name" }, 400);
      if (await env.SITES.get(`site:${name}`)) return json({ error: "Name already taken" }, 409);
      const rec: SiteRecord = {
        name, url: `https://${name}.${env.SITE_ZONE}`, createdAt: Date.now(), updatedAt: Date.now(),
      };
      await env.SITES.put(`site:${name}`, JSON.stringify(rec));
      return json(rec);
    }

    const chatMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)\/chat$/);
    if (chatMatch && req.method === "POST") {
      const name = chatMatch[1];
      const { message } = await req.json<{ message: string }>();
      const id = env.SITE_SESSION.idFromName(name);
      const stub = env.SITE_SESSION.get(id);
      const res = await stub.fetch("https://do/turn", {
        method: "POST", body: JSON.stringify({ name, message }),
      });
      // Touch updatedAt
      const rec = await env.SITES.get<SiteRecord>(`site:${name}`, "json");
      if (rec) { rec.updatedAt = Date.now(); await env.SITES.put(`site:${name}`, JSON.stringify(rec)); }
      return new Response(res.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
    }

    const delMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)$/);
    if (delMatch && req.method === "DELETE") {
      const name = delMatch[1];
      await deleteSite(env, name);
      await env.SITES.delete(`site:${name}`);
      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat: router, auth gate, sites API"`

---

## Task 8: UI (login + app pages)

**Files:** Create `src/ui.ts`, `tests/ui.test.ts`. Polish visuals with the
**frontend-design** skill during implementation.

The app page is a single-page chat client: left sidebar (sites list + "New site"
form with name field; delete buttons), center chat (messages + input), right live
preview iframe. Talks to the API; consumes the chat SSE stream and updates the
preview iframe `src` to the deployed URL on a `deployed` event.

- [ ] **Step 1: Write failing test `tests/ui.test.ts`**

```ts
import { expect, test } from "vitest";
import { loginPage, appPage } from "../src/ui";

test("login page has a password field", () => {
  expect(loginPage()).toContain('name="password"');
});
test("login page shows error when provided", () => {
  expect(loginPage("Wrong password")).toContain("Wrong password");
});
test("app page has chat + preview + new-site form", () => {
  const html = appPage();
  expect(html).toContain("id=\"chat\"");
  expect(html).toContain("id=\"preview\"");
  expect(html).toContain("id=\"new-site\"");
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/ui.ts`**

Create `loginPage(error?: string)` and `appPage()` returning full HTML strings.
The app page embeds vanilla JS that:
- `GET /api/sites` to render the sidebar;
- "New site" form → `POST /api/sites`, then selects it;
- on send → `POST /api/sites/:name/chat`, read the `ReadableStream`, parse `data:`
  SSE lines, append text deltas to the active assistant bubble, show a "deploying…"
  pill on `deploying`, and set `preview.src = url + "?t=" + Date.now()` on `deployed`;
- delete button → `DELETE /api/sites/:name`.

Use the **frontend-design** skill to generate the actual markup/CSS/JS to a high
visual standard; the three `id` anchors above (`chat`, `preview`, `new-site`) must
exist to satisfy the test. Keep it a single inlined HTML string (no external assets).

- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `git commit -am "feat: builder chat UI"`

---

## Task 9: Typecheck, local run, and deploy setup

**Files:** Create `README.md`, `.gitignore` (verify)

- [ ] **Step 1: Typecheck** — `npm run typecheck` → fix any errors. Expected: clean.
- [ ] **Step 2: Full test run** — `npx vitest run` → all green.

- [ ] **Step 3: Create KV namespace + capture id**

```bash
npx wrangler kv namespace create SITES
# Copy the returned id into wrangler.toml [[kv_namespaces]] id.
```

- [ ] **Step 4: Set secrets** (values come from `.env` + new ones)

```bash
npx wrangler secret put CF_API_TOKEN       # from .env CLOUDFLARE_API_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY  # your Anthropic key
npx wrangler secret put APP_PASSWORD       # chosen password
npx wrangler secret put SESSION_SECRET     # long random string
```

- [ ] **Step 5: Confirm CF token scopes** — token needs **Workers Scripts:Edit**,
  **Workers Routes/Custom Domains:Edit**, and **Zone:Read** on `clydeford.net`. If
  the existing token is narrower, mint a new one and update the secret.

- [ ] **Step 6: Local smoke** — `npx wrangler dev` and hit `http://localhost:8787`,
  log in, create a site, send "build a hello world page", confirm a `deployed`
  event arrives. (Real Claude + real CF deploy — costs apply.)

- [ ] **Step 7: Deploy host worker** — `npx wrangler deploy`. Confirm
  `builder.clydeford.net` resolves and serves the login page.

- [ ] **Step 8: End-to-end** — through the live site, build + deploy a child site,
  visit `https://<name>.clydeford.net` (allow ~10–60s for SSL on first deploy).

- [ ] **Step 9: Write `README.md`** documenting setup, secrets, token scopes, and
  the deploy commands above. Commit — `git commit -am "docs: setup + deploy readme"`.

---

## Self-Review notes

- **Spec coverage:** auth (T3), single-tool Claude generation (T5), deploy to
  `<name>.clydeford.net` (T4), conversational DO state (T6), sidebar + name + spec +
  delete (T7/T8), error feedback into chat (T6 `error` event; CF compile errors
  surface via `deploySite` throw → caught → `error` SSE). Custom-domain host route
  (T1 wrangler.toml). All covered.
- **Types:** `Env`, `StoredMessage`, `SiteRecord` defined in T1 and used consistently;
  `streamTurn` event shape (`text`/`deploy`) matches DO consumer in T6; `deploySite`
  signature matches caller in T6.
- **Placeholders:** UI markup (T8) intentionally delegated to the frontend-design
  skill but constrained by a test asserting required DOM ids — acceptable, not a
  silent gap.
