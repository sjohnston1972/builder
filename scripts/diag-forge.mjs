// Diagnostic: forge a React+Vite site via the API and log every SSE event with
// elapsed time, to measure real per-phase build duration on the live container.
// Usage: APP_PASSWORD=... node scripts/diag-forge.mjs
const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
if (!PASS) { console.error("APP_PASSWORD not set"); process.exit(2); }

const name = "diag-react-" + Math.random().toString(36).slice(2, 7);
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";

// 1) Login, capture session cookie.
const login = await fetch(BASE + "/login", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "password=" + encodeURIComponent(PASS),
  redirect: "manual",
});
const setCookie = login.headers.get("set-cookie") || "";
const cookie = setCookie.split(";")[0];
if (!cookie.startsWith("builder_session=")) { console.error("login failed:", login.status); process.exit(1); }
console.log(`[${el()}] logged in`);

// 2) Create the site record.
const create = await fetch(BASE + "/api/sites", {
  method: "POST", headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ name }),
});
console.log(`[${el()}] created site ${name} → ${create.status}`);

// 3) Forge: stream the chat SSE, log each event with elapsed time.
const spec =
  "Build a counter web app using React with Vite as a real multi-file project " +
  "(package.json with react + vite and a build step, plus src/ files) — NOT a single-file worker. " +
  "Heading 'Forge Counter', a number starting at 0, and an 'Increment' button.";

let deployedUrl = null, buildLogs = 0, lastLog = "";
try {
  const res = await fetch(BASE + "/api/sites/" + name + "/chat", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message: spec }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.type === "build_log") { buildLogs++; lastLog = ev.line; if (buildLogs % 20 === 0) console.log(`[${el()}] …${buildLogs} build-log lines (last: ${ev.line.slice(0, 80)})`); }
      else if (ev.type === "text") { /* model prose, skip */ }
      else {
        console.log(`[${el()}] EVENT ${ev.type}${ev.error ? " error=" + ev.error : ""}${ev.url ? " url=" + ev.url : ""}${ev.provisioning !== undefined ? " provisioning=" + ev.provisioning : ""}`);
        if (ev.type === "deployed") deployedUrl = ev.url;
      }
    }
  }
  console.log(`[${el()}] stream ended (${buildLogs} build-log lines total; last: ${lastLog.slice(0, 100)})`);
} catch (e) {
  console.log(`[${el()}] stream error: ${e.message}`);
}

// 4) Confirm final state via history.
const hist = await fetch(BASE + "/api/sites/" + name + "/history", { headers: { cookie } }).then((r) => r.json()).catch(() => ({}));
console.log(`[${el()}] history: status=${hist.status} url=${hist.url}`);

// 5) If deployed, probe the live site.
const url = deployedUrl || hist.url;
if (url) {
  for (let i = 0; i < 18; i++) {
    try { const r = await fetch(url); const body = await r.text(); if (r.status < 500) { console.log(`[${el()}] live site ${r.status}; React markers: ${/Forge Counter|Increment|id="root"/i.test(body)}`); break; } } catch { /* SSL not ready */ }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// 6) Clean up.
const del = await fetch(BASE + "/api/sites/" + name, { method: "DELETE", headers: { cookie } });
console.log(`[${el()}] cleanup DELETE → ${del.status}`);
console.log("DONE:", JSON.stringify({ name, url, buildLogs, totalSeconds: ((Date.now() - t0) / 1000).toFixed(1) }));
