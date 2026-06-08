import { writeFiles, collectAssets, cleanWorkDir, parseCommand } from "./build-lib.mjs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { join } from "node:path";

const PORT = process.env.PORT || 8080;

const WORK = "/srv/work";
const BUILD_TIMEOUT_MS = 240_000; // per command; generous headroom for large dep trees

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
  res.writeHead(200, { "content-type": "application/x-ndjson" });
  const emit = (obj) => res.write(JSON.stringify(obj) + "\n");
  const log = (line) => emit({ type: "log", line });

  try {
    const body = JSON.parse(await readBody(req));
    const {
      files, siteName,
      installCommand = "npm install --no-audit --no-fund",
      buildCommand = "npm run build",
      outputDir = "dist",
    } = body;

    // Single-session assumption: one build at a time per site (no concurrent /build for the same siteName).
    const root = join(WORK, (siteName || "site").replace(/[^a-z0-9-]/gi, "_"));

    let iParts, bParts;
    try { iParts = parseCommand(installCommand); bParts = parseCommand(buildCommand); }
    catch (e) { emit({ type: "result", ok: false, error: String(e.message) }); return res.end(); }

    await cleanWorkDir(root);
    await writeFiles(root, files);

    log("$ " + installCommand);
    const iCode = await runStreaming(iParts[0], iParts.slice(1), root, log);
    if (iCode !== 0) { emit({ type: "result", ok: false, error: `install failed (exit ${iCode})` }); return res.end(); }

    log("$ " + buildCommand);
    const bCode = await runStreaming(bParts[0], bParts.slice(1), root, log);
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

// Liveness/SSL probe from inside the container: a real external HTTPS request (public
// DNS + TLS handshake + cert validation), authoritative in a way a same-zone Workers
// subrequest is not. Polls until the site answers (any <500) or the budget expires,
// streaming a single {pending} after the first miss so the worker can show "provisioning".
async function handleProbe(req, res) {
  res.writeHead(200, { "content-type": "application/x-ndjson" });
  const emit = (obj) => res.write(JSON.stringify(obj) + "\n");
  try {
    const { url, budgetMs = 150_000, intervalMs = 3_000 } = JSON.parse(await readBody(req));
    if (!url) { emit({ type: "result", live: false, status: 0, attempts: 0, ms: 0, error: "no url" }); return res.end(); }
    const start = Date.now();
    const deadline = start + budgetMs;
    let notified = false, attempts = 0, lastStatus = 0;
    while (Date.now() < deadline) {
      attempts++;
      let status = 0, ok = false;
      try {
        const r = await fetch(url, {
          method: "GET",
          redirect: "manual",
          headers: { "cache-control": "no-cache" },
          signal: AbortSignal.timeout(10_000),
        });
        status = r.status; lastStatus = status;
        ok = status < 500; // a real app response (even 404) means TLS + routing are up
      } catch { /* TLS handshake / DNS not ready yet */ }
      if (ok) { emit({ type: "result", live: true, status, attempts, ms: Date.now() - start }); return res.end(); }
      if (!notified) { notified = true; emit({ type: "pending", status, attempts }); }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    emit({ type: "result", live: false, status: lastStatus, attempts, ms: Date.now() - start });
    res.end();
  } catch (e) {
    emit({ type: "result", live: false, status: 0, attempts: 0, ms: 0, error: String(e?.message ?? e) });
    res.end();
  }
}

const MAX_BODY_BYTES = 25 * 1024 * 1024;
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ""; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error("request body too large")); req.destroy(); return; }
      d += c;
    });
    req.on("end", () => resolve(d));
    req.on("error", reject);
  });
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.method === "POST" && req.url === "/build") {
    handleBuild(req, res).catch((e) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
      }
      res.end(String(e?.message ?? e));
    });
    return;
  }
  if (req.method === "POST" && req.url === "/probe") {
    handleProbe(req, res).catch((e) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e?.message ?? e));
    });
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`build-server listening on ${PORT}`);
});
