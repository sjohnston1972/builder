# Container Build Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an additive `deploy_project` path so Forge can build npm/Vite framework sites (default React+Vite+Tailwind) in a credential-free Cloudflare Container and deploy the result as a Worker + static-assets binding.

**Architecture:** Claude chooses `deploy_worker` (existing single-file path, untouched) or `deploy_project` (new). For `deploy_project`, the `SiteSession` DO routes the project source to a Forge-owned `BuildBox` container, which runs `npm install && npm run build` and streams logs + returns `dist/`. The DO (which alone holds credentials) then uploads the assets and PUTs the Worker via Cloudflare's REST API, reusing the existing custom-domain attach + SSL-readiness polling.

**Tech Stack:** Cloudflare Workers + Durable Objects + Containers (`@cloudflare/containers`), Workers Static Assets REST API, Node build server in a Docker image, TypeScript, vitest (`@cloudflare/vitest-pool-workers`), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-06-container-build-box-design.md`

**Sequencing:** Phases land a working end-to-end slice early (access check → minimal build → deploy), then layer on prompt fluency, log streaming polish, error recovery, and tests.

---

## File Structure

**Create:**
- `container/Dockerfile` — slim Node image running the build server.
- `container/build-server.mjs` — plain-Node HTTP server; `POST /build` runs install+build, streams NDJSON.
- `container/package.json` — pins the build server's own (zero) deps + node version marker.
- `src/buildbox.ts` — `BuildBox` Container class (extends `@cloudflare/containers` `Container`).
- `src/assets.ts` — pure helpers: asset hashing, manifest building, `uploadAssets()` (REST upload flow).
- `tests/assets.test.ts` — unit tests for hashing/manifest/upload sequence.
- `tests/buildserver.test.ts` — unit tests for the build server's pure helpers (run under node).
- `container/fixtures/react-vite/` — a known-good minimal React+Vite project used by the integration test.
- `tests/integration/build.test.ts` — Docker-gated real container build.
- `tests/e2e/forge-framework.spec.ts` — Playwright E2E with screenshot.

**Modify:**
- `package.json` — add `@cloudflare/containers` dependency.
- `wrangler.toml` — add `[[containers]]`, BuildBox DO binding + migration.
- `src/types.ts` — add `BUILD_BOX` binding; build event/result types.
- `src/prompts.ts` — add `DEPLOY_PROJECT_TOOL`; extend `SYSTEM_PROMPT`.
- `src/anthropic.ts` — yield `deploy_project` turn event.
- `src/deploy.ts` — extract `attachDomain()`; add `deployProject()`.
- `src/session.ts` — handle the `deploy_project` event (route to BuildBox, stream logs, deploy).
- `src/ui.ts` — handle `building_project`, `build_log`, `build_failed` SSE events.
- `src/index.ts` — re-export `BuildBox` for the Workers runtime.

---

## Phase 0 — Access confirmation & scaffolding

### Task 1: Stand up a minimal BuildBox container and confirm it deploys

This is the access check. If the account lacks Containers/Workers Paid, it fails HERE, cheaply.

**Files:**
- Create: `container/Dockerfile`, `container/build-server.mjs`, `container/package.json`, `src/buildbox.ts`
- Modify: `package.json`, `wrangler.toml`, `src/types.ts`, `src/index.ts`

- [ ] **Step 1: Add the container dependency**

Run: `npm install @cloudflare/containers`
Expected: `package.json` gains `@cloudflare/containers` under dependencies; install succeeds.

- [ ] **Step 2: Create the build server skeleton with a health endpoint**

Create `container/build-server.mjs`:

```js
import { createServer } from "node:http";

const PORT = process.env.PORT || 8080;

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`build-server listening on ${PORT}`);
});
```

Create `container/package.json`:

```json
{
  "name": "forge-build-server",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" }
}
```

- [ ] **Step 3: Create the Dockerfile**

Create `container/Dockerfile`:

```dockerfile
FROM node:22-slim
WORKDIR /srv
COPY package.json ./
COPY build-server.mjs ./
EXPOSE 8080
CMD ["node", "build-server.mjs"]
```

- [ ] **Step 4: Define the BuildBox class**

Create `src/buildbox.ts`:

```ts
import { Container } from "@cloudflare/containers";
import type { Env } from "./types";

export class BuildBox extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "10m";
}
```

- [ ] **Step 5: Wire bindings into types and the Worker entry**

Modify `src/types.ts` — add to `Env`:

```ts
  BUILD_BOX: DurableObjectNamespace<import("./buildbox").BuildBox>;
```

Modify `src/index.ts` — add alongside the existing `SiteSession` re-export:

```ts
export { BuildBox } from "./buildbox";
```

- [ ] **Step 6: Declare the container in wrangler.toml**

Append to `wrangler.toml`:

```toml
[[containers]]
class_name = "BuildBox"
image = "./container/Dockerfile"
max_instances = 5

[[durable_objects.bindings]]
name = "BUILD_BOX"
class_name = "BuildBox"

[[migrations]]
tag = "v2"
new_sqlite_classes = ["BuildBox"]
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 8: Deploy and confirm the container builds & ships (ACCESS CHECK)**

Run: `npx wrangler deploy`
Expected: wrangler builds the Docker image, pushes it, and deploys the Worker without a plan/permission error. If it errors with a Containers/paid-plan message, STOP and report — this is the gating prerequisite.

- [ ] **Step 9: Confirm the container responds**

Add a temporary route in `src/index.ts` (inside `fetch`, before the 404) ONLY to verify, then remove after:

```ts
    if (path === "/__buildbox_health") {
      const c = env.BUILD_BOX.getByName("healthcheck");
      return c.fetch(new Request("http://c/health"));
    }
```

Run: `npx wrangler deploy` then `curl https://builder.clydeford.net/__buildbox_health`
Expected: `ok`. Then remove the temporary route.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json wrangler.toml container/ src/buildbox.ts src/types.ts src/index.ts
git commit -m "feat: scaffold BuildBox container (access check passes, health endpoint live)"
```

---

## Phase 1 — Build server `/build`

### Task 2: Build-server pure helpers (write files, collect output)

**Files:**
- Modify: `container/build-server.mjs`
- Test: `tests/buildserver.test.ts`

These helpers are exported from a module so they can be unit-tested under node without Docker.

- [ ] **Step 1: Write failing tests for the helpers**

Create `tests/buildserver.test.ts`:

```ts
import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFiles, collectAssets, contentType } from "../container/build-server.mjs";

let dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "bb-")); dirs.push(d); return d; };
afterEach(() => { dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })); });

test("writeFiles writes nested files safely under root", async () => {
  const root = tmp();
  await writeFiles(root, [
    { path: "package.json", content: "{}" },
    { path: "src/main.tsx", content: "x" },
  ]);
  expect(readFileSync(join(root, "package.json"), "utf8")).toBe("{}");
  expect(readFileSync(join(root, "src/main.tsx"), "utf8")).toBe("x");
});

test("writeFiles rejects path traversal", async () => {
  const root = tmp();
  await expect(writeFiles(root, [{ path: "../escape.txt", content: "x" }])).rejects.toThrow(/path/i);
});

test("collectAssets returns base64 + content type for every file", async () => {
  const root = tmp();
  await writeFiles(root, [
    { path: "dist/index.html", content: "<h1>hi</h1>" },
    { path: "dist/assets/app.js", content: "console.log(1)" },
  ]);
  const assets = await collectAssets(join(root, "dist"));
  const html = assets.find((a) => a.path === "/index.html");
  const js = assets.find((a) => a.path === "/assets/app.js");
  expect(Buffer.from(html.contentBase64, "base64").toString()).toBe("<h1>hi</h1>");
  expect(html.contentType).toBe("text/html");
  expect(js.contentType).toBe("text/javascript");
});

test("contentType maps common extensions", () => {
  expect(contentType("a.css")).toBe("text/css");
  expect(contentType("a.svg")).toBe("image/svg+xml");
  expect(contentType("a.unknown")).toBe("application/octet-stream");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/buildserver.test.ts`
Expected: FAIL — exports `writeFiles`/`collectAssets`/`contentType` do not exist.

- [ ] **Step 3: Implement the helpers**

Edit `container/build-server.mjs` — add above the server, and export them:

```js
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve, relative, extname } from "node:path";

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain",
  ".map": "application/json", ".wasm": "application/wasm",
};

export function contentType(p) {
  return TYPES[extname(p).toLowerCase()] || "application/octet-stream";
}

export async function writeFiles(root, files) {
  for (const f of files) {
    const target = resolve(root, f.path);
    if (!target.startsWith(resolve(root))) throw new Error(`unsafe path: ${f.path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.content, "utf8");
  }
}

export async function collectAssets(distDir) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      const buf = await readFile(full);
      const rel = "/" + relative(distDir, full).split("\\").join("/");
      out.push({ path: rel, contentBase64: buf.toString("base64"), contentType: contentType(rel) });
    }
  }
  await walk(distDir);
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/buildserver.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add container/build-server.mjs tests/buildserver.test.ts
git commit -m "feat: build-server file-write + asset-collection helpers"
```

### Task 3: Build-server `/build` endpoint with NDJSON streaming

**Files:**
- Modify: `container/build-server.mjs`

No unit test here (it spawns processes — covered by the Docker-gated integration test in Task 12). Keep the logic thin and delegate to the tested helpers.

- [ ] **Step 1: Implement `/build`**

Edit `container/build-server.mjs` — replace the request handler body with:

```js
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const WORK = "/srv/work";
const BUILD_TIMEOUT_MS = 120_000;

function runStreaming(cmd, args, cwd, onLine) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, CI: "1" } });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, BUILD_TIMEOUT_MS);
    let buf = "";
    const feed = (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("close", (code) => { clearTimeout(timer); if (buf) onLine(buf); resolve(code); });
    child.on("error", (e) => { clearTimeout(timer); onLine(`spawn error: ${e.message}`); resolve(1); });
  });
}

async function handleBuild(req, res) {
  const body = JSON.parse(await readBody(req));
  const {
    files, siteName,
    installCommand = "npm install --no-audit --no-fund",
    buildCommand = "npm run build",
    outputDir = "dist",
  } = body;

  res.writeHead(200, { "content-type": "application/x-ndjson" });
  const emit = (obj) => res.write(JSON.stringify(obj) + "\n");
  const log = (line) => emit({ type: "log", line });

  // Per-site work dir; node_modules persists across rebuilds while the instance is warm.
  const root = join(WORK, (siteName || "site").replace(/[^a-z0-9-]/gi, "_"));
  try {
    await rm(join(root, outputDir), { recursive: true, force: true });
    await writeFiles(root, files);

    log("$ " + installCommand);
    const [iCmd, ...iArgs] = installCommand.split(" ");
    const iCode = await runStreaming(iCmd, iArgs, root, log);
    if (iCode !== 0) { emit({ type: "result", ok: false, error: `install failed (exit ${iCode})` }); return res.end(); }

    log("$ " + buildCommand);
    const [bCmd, ...bArgs] = buildCommand.split(" ");
    const bCode = await runStreaming(bCmd, bArgs, root, log);
    if (bCode !== 0) { emit({ type: "result", ok: false, error: `build failed (exit ${bCode})` }); return res.end(); }

    const assets = await collectAssets(join(root, outputDir));
    if (!assets.length) { emit({ type: "result", ok: false, error: `no files in ${outputDir}/` }); return res.end(); }
    emit({ type: "result", ok: true, assets });
    res.end();
  } catch (e) {
    emit({ type: "result", ok: false, error: String(e?.message ?? e) });
    res.end();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); req.on("error", reject);
  });
}
```

Update the server's request router to dispatch `POST /build` to `handleBuild`, keep `GET /health`.

- [ ] **Step 2: Build the image locally to confirm it compiles**

Run: `docker build -t forge-buildbox ./container`
Expected: image builds successfully.

- [ ] **Step 3: Smoke-test the container locally**

Run:
```bash
docker run -d -p 8080:8080 --name bb forge-buildbox && sleep 1 && curl localhost:8080/health && docker rm -f bb
```
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add container/build-server.mjs
git commit -m "feat: build-server /build runs install+build, streams NDJSON logs + assets"
```

---

## Phase 2 — Assets upload flow (`src/assets.ts`)

### Task 4: Asset hashing + manifest

**Files:**
- Create: `src/assets.ts`, `tests/assets.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/assets.test.ts`:

```ts
import { expect, test, vi, afterEach } from "vitest";
import { hashAsset, buildManifest } from "../src/assets";

afterEach(() => vi.restoreAllMocks());

test("hashAsset returns a 32-hex-char hash", async () => {
  const h = await hashAsset(new TextEncoder().encode("hello"));
  expect(h).toMatch(/^[0-9a-f]{32}$/);
});

test("buildManifest maps each asset path to hash + byte size", async () => {
  const assets = [
    { path: "/index.html", contentBase64: Buffer.from("<h1>hi</h1>").toString("base64"), contentType: "text/html" },
  ];
  const { manifest, byHash } = await buildManifest(assets);
  expect(Object.keys(manifest)).toEqual(["/index.html"]);
  expect(manifest["/index.html"].size).toBe("<h1>hi</h1>".length);
  expect(manifest["/index.html"].hash).toMatch(/^[0-9a-f]{32}$/);
  // byHash lets the uploader find the bytes when CF asks for a given hash.
  expect(byHash.get(manifest["/index.html"].hash)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/assets.test.ts`
Expected: FAIL — module `../src/assets` not found.

- [ ] **Step 3: Implement hashing + manifest**

Create `src/assets.ts`:

```ts
export interface BuiltAsset {
  path: string;          // leading-slash path, e.g. "/index.html"
  contentBase64: string;
  contentType: string;
}

// Cloudflare expects a 32-hex-character hash of the file contents.
export async function hashAsset(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32);
}

export interface ManifestEntry { hash: string; size: number }

export async function buildManifest(
  assets: BuiltAsset[],
): Promise<{ manifest: Record<string, ManifestEntry>; byHash: Map<string, BuiltAsset> }> {
  const manifest: Record<string, ManifestEntry> = {};
  const byHash = new Map<string, BuiltAsset>();
  for (const a of assets) {
    const bytes = Uint8Array.from(atob(a.contentBase64), (c) => c.charCodeAt(0));
    const hash = await hashAsset(bytes);
    manifest[a.path] = { hash, size: bytes.length };
    byHash.set(hash, a);
  }
  return { manifest, byHash };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/assets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/assets.ts tests/assets.test.ts
git commit -m "feat: asset hashing + manifest builder"
```

### Task 5: `uploadAssets()` — session → upload buckets → completion token

**Files:**
- Modify: `src/assets.ts`, `tests/assets.test.ts`

- [ ] **Step 1: Write failing test for the upload sequence**

Add to `tests/assets.test.ts`:

```ts
import { uploadAssets } from "../src/assets";

test("uploadAssets registers manifest, uploads buckets, returns completion jwt", async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: any, init: any) => {
    const url = String(input);
    calls.push(`${init?.method} ${url}`);
    if (url.includes("/assets-upload-session")) {
      return new Response(JSON.stringify({
        success: true,
        result: { jwt: "UPLOAD_JWT", buckets: [["HASHPLACEHOLDER"]] },
      }), { headers: { "content-type": "application/json" } });
    }
    if (url.includes("/workers/assets/upload")) {
      return new Response(JSON.stringify({ success: true, result: { jwt: "COMPLETION_JWT" } }),
        { headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: false }), { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const assets = [{ path: "/index.html", contentBase64: btoa("hi"), contentType: "text/html" }];
  const env = { CF_ACCOUNT_ID: "acct1", CF_API_TOKEN: "tok" } as any;
  const jwt = await uploadAssets(env, "mysite", assets);

  expect(jwt).toBe("COMPLETION_JWT");
  expect(calls[0]).toContain("POST");
  expect(calls[0]).toContain("/workers/scripts/mysite/assets-upload-session");
  expect(calls.some((c) => c.includes("/workers/assets/upload"))).toBe(true);
});

test("uploadAssets returns the session jwt directly when no buckets need upload", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ success: true, result: { jwt: "ONLY_JWT", buckets: [] } }),
      { headers: { "content-type": "application/json" } })));
  const env = { CF_ACCOUNT_ID: "a", CF_API_TOKEN: "t" } as any;
  const jwt = await uploadAssets(env, "s", []);
  expect(jwt).toBe("ONLY_JWT");
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/assets.test.ts`
Expected: FAIL — `uploadAssets` not exported.

- [ ] **Step 3: Implement `uploadAssets`**

Add to `src/assets.ts`:

```ts
import type { Env } from "./types";

const API = "https://api.cloudflare.com/client/v4";

async function cfJson(env: Env, path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, ...(init.headers || {}) },
  });
  const body = await (res.json() as Promise<any>).catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body?.errors?.[0]?.message || `CF API ${res.status}`);
  return body.result;
}

// Runs the 3-phase Workers Assets upload and returns the completion JWT for the script PUT.
export async function uploadAssets(env: Env, name: string, assets: BuiltAsset[]): Promise<string> {
  const { manifest, byHash } = await buildManifest(assets);

  const session = await cfJson(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${name}/assets-upload-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manifest }),
  });

  const buckets: string[][] = session.buckets ?? [];
  if (buckets.length === 0) return session.jwt; // nothing to upload; session jwt is the completion token

  let completion = session.jwt;
  for (const bucket of buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const a = byHash.get(hash);
      if (!a) continue;
      // base64=true on the endpoint: send the already-base64 content as the part body.
      form.set(hash, new Blob([a.contentBase64], { type: a.contentType }), hash);
    }
    const res = await fetch(`${API}/accounts/${env.CF_ACCOUNT_ID}/workers/assets/upload?base64=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.jwt}` },
      body: form,
    });
    const body = await (res.json() as Promise<any>).catch(() => ({}));
    if (!res.ok || !body.success) throw new Error(body?.errors?.[0]?.message || `asset upload ${res.status}`);
    if (body.result?.jwt) completion = body.result.jwt; // final bucket returns the completion token
  }
  return completion;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/assets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/assets.ts tests/assets.test.ts
git commit -m "feat: uploadAssets implements the Workers Assets REST upload flow"
```

---

## Phase 3 — `deployProject()` (`src/deploy.ts`)

### Task 6: Extract a shared `attachDomain()` helper

**Files:**
- Modify: `src/deploy.ts`
- Test: `tests/deploy.test.ts`

- [ ] **Step 1: Write a test asserting deploySite still attaches the domain (regression guard)**

This behavior is already covered by the existing "uploads script then attaches domain" test. Confirm it still passes after refactor — no new test needed; the refactor must keep `deploySite` behavior identical.

- [ ] **Step 2: Refactor the domain-attach block into a helper**

Edit `src/deploy.ts` — replace the inline domain PUT inside `deploySite` with a call to a new exported helper, and define it:

```ts
export async function attachDomain(env: Env, name: string): Promise<void> {
  await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/domains`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      zone_id: env.ZONE_ID,
      hostname: `${name}.${env.SITE_ZONE}`,
      service: name,
      environment: "production",
    }),
  }).catch((e: Error) => {
    if (!/already|exists|duplicate/i.test(String(e.message))) throw e;
  });
}
```

In `deploySite`, replace the existing `await cf(... /workers/domains ...)` block with `await attachDomain(env, name);`.

- [ ] **Step 3: Run deploy tests**

Run: `npx vitest run tests/deploy.test.ts`
Expected: PASS (all existing tests still green).

- [ ] **Step 4: Commit**

```bash
git add src/deploy.ts
git commit -m "refactor: extract attachDomain() shared by both deploy paths"
```

### Task 7: `deployProject()`

**Files:**
- Modify: `src/deploy.ts`, `tests/deploy.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/deploy.test.ts`:

```ts
import { deployProject } from "../src/deploy";

test("deployProject uploads assets, PUTs script with assets binding, attaches domain", async () => {
  const calls: { url: string; method: string; metadata?: any }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
    const url = String(input);
    const rec: any = { url, method: init?.method };
    if (url.includes("/assets-upload-session"))
      return new Response(JSON.stringify({ success: true, result: { jwt: "J", buckets: [] } }),
        { headers: { "content-type": "application/json" } });
    if (init?.method === "PUT" && url.includes("/workers/scripts/mysite")) {
      rec.metadata = JSON.parse(await (init.body.get("metadata") as Blob).text());
    }
    calls.push(rec);
    return new Response(JSON.stringify({ success: true, result: {} }),
      { headers: { "content-type": "application/json" } });
  }));

  const url = await deployProject(
    env, "mysite",
    "export default { fetch(req, env) { return env.ASSETS.fetch(req); } }",
    [{ path: "/index.html", contentBase64: btoa("<h1>hi</h1>"), contentType: "text/html" }],
  );

  expect(url).toBe("https://mysite.clydeford.net");
  const put = calls.find((c) => c.method === "PUT" && c.url.includes("/workers/scripts/mysite"));
  expect(put?.metadata.assets.jwt).toBe("J");
  expect(put?.metadata.assets.config.not_found_handling).toBe("single-page-application");
  expect(put?.metadata.bindings.some((b: any) => b.type === "assets" && b.name === "ASSETS")).toBe(true);
  expect(calls.some((c) => c.url.includes("/workers/domains"))).toBe(true);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/deploy.test.ts`
Expected: FAIL — `deployProject` not exported.

- [ ] **Step 3: Implement `deployProject`**

Add to `src/deploy.ts` (import the helper at top: `import { uploadAssets, type BuiltAsset } from "./assets";`):

```ts
export async function deployProject(
  env: Env,
  name: string,
  workerScript: string,
  assets: BuiltAsset[],
): Promise<string> {
  const completionJwt = await uploadAssets(env, name, assets);

  const metadata: Record<string, unknown> = {
    main_module: "index.mjs",
    compatibility_date: COMPAT_DATE,
    compatibility_flags: ["nodejs_compat"],
    assets: {
      jwt: completionJwt,
      config: { html_handling: "auto-trailing-slash", not_found_handling: "single-page-application" },
    },
    bindings: [
      { type: "assets", name: "ASSETS" },
      ...(env.ANTHROPIC_API_KEY
        ? [{ type: "secret_text", name: "ANTHROPIC_API_KEY", text: env.ANTHROPIC_API_KEY }]
        : []),
    ],
  };

  const form = new FormData();
  form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.set("index.mjs", new Blob([workerScript], { type: "application/javascript+module" }), "index.mjs");

  await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${name}`, { method: "PUT", body: form });
  await attachDomain(env, name);
  return `https://${name}.${env.SITE_ZONE}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/deploy.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/deploy.ts tests/deploy.test.ts
git commit -m "feat: deployProject deploys a Worker + static assets binding"
```

---

## Phase 4 — Tool contract & prompt

### Task 8: Add `deploy_project` tool and extend the system prompt

**Files:**
- Modify: `src/prompts.ts`

- [ ] **Step 1: Add the tool definition**

Append to `src/prompts.ts`:

```ts
export const DEPLOY_PROJECT_TOOL = {
  name: "deploy_project",
  description:
    "Build and deploy a multi-file framework project (npm dependencies + a build step, e.g. React+Vite). " +
    "Use this when the site needs a framework, npm packages, or a bundler. For a simple single-file site, use deploy_worker instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      explanation: { type: "string", description: "One sentence on what changed." },
      files: {
        type: "array",
        description: "Every source file of the project, including package.json, vite.config, index.html, and src/**.",
        items: {
          type: "object" as const,
          properties: {
            path: { type: "string", description: "Repo-relative path, e.g. src/App.tsx" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
      installCommand: { type: "string", description: "Default: npm install --no-audit --no-fund" },
      buildCommand: { type: "string", description: "Default: npm run build" },
      outputDir: { type: "string", description: "Build output directory. Default: dist" },
      workerEntry: {
        type: "string",
        description:
          "Optional path of a file (already included in files[]) to use as the Worker module for /api routes. " +
          "It receives env.ANTHROPIC_API_KEY and env.ASSETS. Omit for a pure static site.",
      },
    },
    required: ["explanation", "files"],
  },
};
```

- [ ] **Step 2: Extend the system prompt**

Edit `src/prompts.ts` — replace the "Conversation flow" section's first bullet and add a framework section before it:

```ts
// (insert before "Conversation flow:")
`Two ways to ship:
- deploy_worker — a single self-contained Worker file. Use for simple sites (landing pages,
  small tools, single-file AI chatbots). Fast: no build step.
- deploy_project — a multi-file project that needs a build (npm dependencies, a framework, a
  bundler). DEFAULT STACK: React + Vite + Tailwind. Provide every file in files[], including a
  package.json with the build script. The build runs in a Node 22 container (npm install, then
  npm run build) and the outputDir (default dist) is served as static assets.
  - For server/API routes, add a Worker entry file and pass its path as workerEntry; it receives
    env.ANTHROPIC_API_KEY and env.ASSETS (call env.ASSETS.fetch(request) to serve the SPA).
  - Choose deploy_project ONLY when a build is genuinely needed; otherwise prefer deploy_worker.`
```

Note: `env.ANTHROPIC_API_KEY` usage guidance (the canonical Anthropic call block) already applies to `workerEntry` files too.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/prompts.ts
git commit -m "feat: deploy_project tool + framework guidance in system prompt"
```

### Task 9: Emit the `deploy_project` event from `streamTurn`

**Files:**
- Modify: `src/anthropic.ts`, `tests/anthropic.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/anthropic.test.ts` a test that stubs a stream whose final message contains a `deploy_project` tool_use and asserts `streamTurn` yields a `deploy_project` event with `files`. (Mirror the existing anthropic test's stubbing style; assert `event.type === "deploy_project"` and `event.files.length`.)

```ts
test("yields deploy_project event from a deploy_project tool_use", async () => {
  // Stub client.messages.stream to async-iterate no text and finalMessage() with a tool_use block.
  // (Follow the existing test's mocking approach for Anthropic.)
  // Expected yielded event:
  //   { type: "deploy_project", explanation, files, installCommand, buildCommand, outputDir, workerEntry }
});
```

Fill in the body using the same mock mechanism the existing `tests/anthropic.test.ts` already uses for `deploy_worker`.

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/anthropic.test.ts`
Expected: FAIL — no `deploy_project` event yielded.

- [ ] **Step 3: Extend the event type and loop**

Edit `src/anthropic.ts`:

```ts
export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "deploy"; explanation: string; script: string }
  | {
      type: "deploy_project";
      explanation: string;
      files: { path: string; content: string }[];
      installCommand?: string;
      buildCommand?: string;
      outputDir?: string;
      workerEntry?: string;
    };
```

Add `DEPLOY_PROJECT_TOOL` to the imports and to `tools: [DEPLOY_TOOL, DEPLOY_PROJECT_TOOL]`. In the final-message loop, add:

```ts
    if (block.type === "tool_use" && block.name === "deploy_project") {
      const i = block.input as any;
      yield {
        type: "deploy_project",
        explanation: i.explanation,
        files: i.files,
        installCommand: i.installCommand,
        buildCommand: i.buildCommand,
        outputDir: i.outputDir,
        workerEntry: i.workerEntry,
      };
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/anthropic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/anthropic.ts tests/anthropic.test.ts
git commit -m "feat: streamTurn yields deploy_project events"
```

---

## Phase 5 — DO orchestration (`src/session.ts`)

### Task 10: Build-job client (DO → container, parse NDJSON)

**Files:**
- Create: `src/buildclient.ts`, `tests/buildclient.test.ts`

Isolating the container call + NDJSON parsing into a pure function keeps `session.ts` thin and testable.

- [ ] **Step 1: Write failing test**

Create `tests/buildclient.test.ts`:

```ts
import { expect, test } from "vitest";
import { runBuild } from "../src/buildclient";

function ndjsonResponse(lines: object[]): Response {
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
}

test("runBuild streams log lines and returns the final result", async () => {
  const stub = { fetch: async () => ndjsonResponse([
    { type: "log", line: "npm install" },
    { type: "log", line: "vite build" },
    { type: "result", ok: true, assets: [{ path: "/index.html", contentBase64: "aGk=", contentType: "text/html" }] },
  ]) };
  const logs: string[] = [];
  const result = await runBuild(stub as any, { siteName: "s", files: [] }, (line) => logs.push(line));
  expect(logs).toEqual(["npm install", "vite build"]);
  expect(result.ok).toBe(true);
  expect(result.assets?.[0].path).toBe("/index.html");
});

test("runBuild surfaces a failed result", async () => {
  const stub = { fetch: async () => ndjsonResponse([
    { type: "log", line: "boom" },
    { type: "result", ok: false, error: "build failed (exit 1)" },
  ]) };
  const result = await runBuild(stub as any, { siteName: "s", files: [] }, () => {});
  expect(result.ok).toBe(false);
  expect(result.error).toContain("build failed");
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/buildclient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `runBuild`**

Create `src/buildclient.ts`:

```ts
import type { BuiltAsset } from "./assets";

export interface BuildRequest {
  siteName: string;
  files: { path: string; content: string }[];
  installCommand?: string;
  buildCommand?: string;
  outputDir?: string;
}

export interface BuildResult { ok: boolean; assets?: BuiltAsset[]; error?: string }

interface ContainerStub { fetch(req: Request): Promise<Response> }

// POST the project to the container's /build and parse the NDJSON stream:
// each {type:"log"} line is forwarded via onLog; the terminating {type:"result"} is returned.
export async function runBuild(
  container: ContainerStub,
  req: BuildRequest,
  onLog: (line: string) => void,
): Promise<BuildResult> {
  const res = await container.fetch(
    new Request("http://buildbox/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }),
  );
  if (!res.body) return { ok: false, error: `build server returned ${res.status}` };

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let result: BuildResult = { ok: false, error: "build server closed without a result" };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let ev: any;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === "log") onLog(ev.line);
      else if (ev.type === "result") result = { ok: ev.ok, assets: ev.assets, error: ev.error };
    }
  }
  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/buildclient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/buildclient.ts tests/buildclient.test.ts
git commit -m "feat: runBuild — DO->container build client with NDJSON parsing"
```

### Task 11: Wire the `deploy_project` branch into `SiteSession`

**Files:**
- Modify: `src/session.ts`, `tests/session.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/session.test.ts` a test using a `deploy_project`-yielding anthropic mock and a stubbed `BUILD_BOX` whose container returns an NDJSON success, asserting: SSE text contains the deployed URL, `getState().deployedUrl` is set, and a `build_failed` path leaves `deployedUrl` unchanged. Use the existing `runInDurableObject` style. Mock the container by stubbing `env.BUILD_BOX.getByName` to return an object whose `.fetch` yields an NDJSON success stream, and stub global `fetch` for the CF deploy calls (assets-session/upload/PUT/domains all `{success:true}`).

```ts
test("deploy_project builds in the container then deploys assets", async () => {
  vi.doMock("../src/anthropic", () => ({
    async *streamTurn() {
      yield { type: "text", text: "Building a React app. " };
      yield { type: "deploy_project", explanation: "init",
        files: [{ path: "package.json", content: "{}" }], workerEntry: undefined };
    },
  }));
  // stub BUILD_BOX.getByName(...).fetch -> NDJSON {result ok, assets:[index.html]}
  // stub global fetch -> all CF calls success
  // POST a turn, assert SSE contains mysite.clydeford.net and state.deployedUrl set.
});
```

(Complete the stubs following the existing `session.test.ts` patterns for `vi.stubGlobal` and the mocked anthropic module.)

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/session.test.ts`
Expected: FAIL — `deploy_project` events are ignored (no deploy happens).

- [ ] **Step 3: Implement the branch**

Edit `src/session.ts`:

- Add imports: `import { deploySite, deployProject, waitUntilLive } from "./deploy";` and `import { runBuild } from "./buildclient";`.
- Inside the `for await (const ev of streamTurn(...))` loop, after the existing `deploy` branch, add:

```ts
            } else if (ev.type === "deploy_project") {
              send({ type: "building_project" });
              const container = env.BUILD_BOX.getByName(name);
              const result = await runBuild(
                container,
                {
                  siteName: name,
                  files: ev.files,
                  installCommand: ev.installCommand,
                  buildCommand: ev.buildCommand,
                  outputDir: ev.outputDir,
                },
                (line) => send({ type: "build_log", line }),
              );
              if (!result.ok || !result.assets) {
                send({ type: "build_failed", error: result.error ?? "build failed" });
                // Record the failure so the model can fix it next turn; keep previous deploy live.
                assistantText += `\n[build failed: ${result.error ?? "unknown"}]`;
                continue;
              }
              const workerScript = ev.workerEntry
                ? (ev.files.find((f) => f.path === ev.workerEntry)?.content ?? DEFAULT_ASSETS_WORKER)
                : DEFAULT_ASSETS_WORKER;
              const url = await deployProject(env, name, workerScript, result.assets);
              state.currentScript = JSON.stringify({ files: ev.files });
              state.deployedUrl = url;
              await ctx.storage.put("script", state.currentScript);
              await ctx.storage.put("url", url);
              const live = await waitUntilLive(url, { onPending: () => send({ type: "provisioning" }) });
              send({ type: "deployed", url, explanation: ev.explanation, provisioning: !live });
            }
```

- Add a module-level default Worker (above the class):

```ts
// Default Worker module when the project has no custom workerEntry: serve the built SPA.
const DEFAULT_ASSETS_WORKER =
  `export default { fetch(request, env) { return env.ASSETS.fetch(request); } };`;
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Full test run + typecheck**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/session.ts tests/session.test.ts
git commit -m "feat: SiteSession deploy_project branch — build then deploy assets"
```

---

## Phase 6 — UI

### Task 12: Handle the new SSE events in the client

**Files:**
- Modify: `src/ui.ts`, `tests/ui.test.ts`

- [ ] **Step 1: Write/extend a UI test**

Add to `tests/ui.test.ts` an assertion that `appPage()` HTML contains handlers for the new event types (string checks for `'building_project'`, `'build_log'`, `'build_failed'`), mirroring how the existing UI test asserts on page content.

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/ui.test.ts`
Expected: FAIL — strings absent.

- [ ] **Step 3: Add CSS for a build-log view**

In the `appPage()` `<style>` block, after the `.announce` rules, add:

```css
  .buildlog{align-self:flex-start;max-width:min(94%,560px);background:#0a0b0e;border:1px solid var(--line);
    border-radius:12px;padding:10px 12px;font-family:var(--mono);font-size:11px;line-height:1.5;
    color:var(--muted);white-space:pre-wrap;max-height:220px;overflow:auto}
  .buildlog.fail{border-color:var(--err);color:var(--err)}
```

- [ ] **Step 4: Handle the events in `APP_JS`**

In the `handle(ev)` function in `src/ui.ts`, add branches alongside the existing ones:

```js
          else if(ev.type==='building_project'){
            stopVerbs(); setPill('work','building');
            if(!window.__bl){
              window.__bl=document.createElement('div'); window.__bl.className='buildlog';
              chat.appendChild(window.__bl);
            }
            window.__bl.textContent='Building project…\\n';
            chat.scrollTop=chat.scrollHeight;
          }
          else if(ev.type==='build_log'){
            if(window.__bl){ window.__bl.textContent+=ev.line+'\\n'; window.__bl.scrollTop=window.__bl.scrollHeight; }
          }
          else if(ev.type==='build_failed'){
            setPill('','error');
            if(window.__bl){ window.__bl.className='buildlog fail'; window.__bl.textContent+='\\n▲ '+ev.error+'\\n'; }
            window.__bl=null;
          }
```

In the `deployed` branch, clear the reference: add `window.__bl=null;` at its end so a later build starts a fresh log.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/ui.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui.ts tests/ui.test.ts
git commit -m "feat: UI renders build-log stream + build_failed state"
```

---

## Phase 7 — Integration & E2E

### Task 13: Docker-gated integration build of a React+Vite fixture

**Files:**
- Create: `container/fixtures/react-vite/` (package.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx)
- Create: `tests/integration/build.test.ts`

- [ ] **Step 1: Create the fixture**

Create a minimal React+Vite project under `container/fixtures/react-vite/` with a `package.json` (react, react-dom, vite, @vitejs/plugin-react; `"build": "vite build"`), `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` rendering `<h1>Forge fixture</h1>`.

- [ ] **Step 2: Write the integration test (skipped unless Docker is present)**

Create `tests/integration/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

const hasDocker = (() => { try { execFileSync("docker", ["info"], { stdio: "ignore" }); return true; } catch { return false; } })();

describe.runIf(hasDocker)("container build (integration)", () => {
  it("builds the react-vite fixture and serves /build assets", async () => {
    execFileSync("docker", ["build", "-t", "forge-buildbox-test", "./container"], { stdio: "inherit" });
    // Run the container, POST the fixture files to /build, assert NDJSON result.ok with an index.html asset.
    // (Use docker run -p, read fixture files from disk into the files[] payload, fetch localhost:<port>/build.)
  }, 180_000);
});
```

Complete the body: start `docker run -d -p 8123:8080`, read every fixture file into `{path, content}`, POST to `http://localhost:8123/build`, parse NDJSON, assert `result.ok === true` and an asset with `path === "/index.html"`, then `docker rm -f`.

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run tests/integration/build.test.ts`
Expected: PASS (builds the fixture in the container, returns assets).

- [ ] **Step 4: Commit**

```bash
git add container/fixtures tests/integration
git commit -m "test: Docker-gated integration build of a React+Vite fixture"
```

### Task 14: Deploy and E2E-verify a real framework site

**Files:**
- Create: `tests/e2e/forge-framework.spec.ts`

- [ ] **Step 1: Deploy the full app**

Run: `npx wrangler deploy`
Expected: builds the container image, deploys the Worker, succeeds.

- [ ] **Step 2: Write the Playwright E2E with a screenshot**

Create `tests/e2e/forge-framework.spec.ts` following the repo's existing Playwright conventions (the repo already uses Playwright per `shots/` history): log in with `APP_PASSWORD`, create a site, send a brief like "Build a React + Vite counter app", wait for the `deployed`/announce state, open the site, assert the React app rendered, and capture a screenshot to `shots/framework-build.png`.

- [ ] **Step 3: Run the E2E**

Run: `npx playwright test tests/e2e/forge-framework.spec.ts`
Expected: PASS; screenshot saved. Visually confirm the screenshot shows the built React app (per the "verify UI with screenshots" practice).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e
git commit -m "test: E2E forge a React+Vite site end-to-end (screenshot-verified)"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** §Architecture→Tasks 1,10,11; §Components BuildBox→Tasks 1,2,3; SiteSession branch→Task 11; deployProject→Tasks 6,7; tool/prompt→Tasks 8,9; UI→Task 12; warm routing (`getByName`)→Task 11; §Data flow→Tasks 10,11; §Error handling (build_failed keeps prev live, feeds back to model, timeout)→Tasks 3,11; §Testing (unit/integration/e2e)→Tasks 2,4,5,6,7,9,10,11,12,13,14; §Prereq access check→Task 1. No gaps.
- **Deferred per spec:** cross-sleep R2 dep cache (explicitly out of v1). Not a task — intentional.
- **Type consistency:** `BuiltAsset` defined in `src/assets.ts` (Task 4), reused by `buildclient.ts` (Task 10) and `deploy.ts` (Task 7). `runBuild`/`BuildResult`/`BuildRequest` consistent across Tasks 10–11. `deployProject(env, name, workerScript, assets)` signature identical in Tasks 7 and 11. SSE event names (`building_project`/`build_log`/`build_failed`/`provisioning`/`deployed`) match between `session.ts` (Task 11) and `ui.ts` (Task 12). `env.BUILD_BOX.getByName(name)` consistent (Tasks 1, 11).
- **Placeholders:** Tasks 9, 11, 13, 14 reference "follow the existing test/Playwright pattern" for test *bodies* that depend on repo-specific mocking already present — these are deliberate pointers to existing patterns, not missing implementation code; all production code is fully specified.
