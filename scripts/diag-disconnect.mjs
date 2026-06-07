// Repro: send a CHANGE to an existing site, disconnect mid-build (like mobile
// backgrounding), then poll /history to see if the build completes server-side.
// Usage: APP_PASSWORD=... node scripts/diag-disconnect.mjs
const BASE = process.env.BASE || "https://builder.clydeford.net";
const PASS = process.env.APP_PASSWORD;
const NAME = process.env.SITE || "markdown";
if (!PASS) { console.error("APP_PASSWORD not set"); process.exit(2); }
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";

const login = await fetch(BASE + "/login", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "password=" + encodeURIComponent(PASS), redirect: "manual",
});
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
if (!cookie.startsWith("builder_session=")) { console.error("login failed", login.status); process.exit(1); }
console.log(`[${el()}] logged in`);

// baseline state
const before = await fetch(`${BASE}/api/sites/${NAME}/history`, { headers: { cookie } }).then(r => r.json());
console.log(`[${el()}] baseline: status=${before.status} url=${before.url} msgs=${before.messages?.length}`);

// Send a change; abort the connection once the build is underway.
const abort = new AbortController();
let disconnectedAt = null, sawBuild = false;
(async () => {
  try {
    const res = await fetch(`${BASE}/api/sites/${NAME}/chat`, {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ message: "Small change: make the 'Markdown Studio' heading text teal." }),
      signal: abort.signal,
    });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i).split("\n").find(l => l.startsWith("data:")); buf = buf.slice(i + 2);
        if (!line) continue; let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (["building_project", "build_log", "deploying"].includes(ev.type) && !sawBuild) {
          sawBuild = true; disconnectedAt = el();
          console.log(`[${el()}] build started (${ev.type}) -> DISCONNECTING now (simulating mobile background)`);
          abort.abort();
        }
      }
    }
  } catch (e) { if (e.name !== "AbortError") console.log(`[${el()}] stream err: ${e.message}`); }
})();

// Poll history independently for up to 6 minutes; watch for status -> idle.
const deadline = Date.now() + 360_000;
let done = false;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 8000));
  if (!sawBuild) continue; // wait until we've disconnected
  let h; try { h = await fetch(`${BASE}/api/sites/${NAME}/history`, { headers: { cookie } }).then(r => r.json()); } catch { continue; }
  console.log(`[${el()}] poll: status=${h.status} url=${h.url} msgs=${h.messages?.length}`);
  if (h.status === "idle") { console.log(`[${el()}] ✅ build COMPLETED server-side after disconnect (idle reached)`); done = true; break; }
}
if (!done) console.log(`[${el()}] ❌ status NEVER returned to idle within 6 min after disconnect — build did NOT complete server-side`);
console.log(`disconnected at ~${disconnectedAt}; total ${el()}`);
process.exit(0);
