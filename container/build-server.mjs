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
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`build-server listening on ${PORT}`);
});
