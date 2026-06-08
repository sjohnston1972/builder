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
  opts: { timeoutMs?: number } = {},
): Promise<BuildResult> {
  // Hard overall cap so a stalled container (a stream that stays open but stops
  // emitting) can never hang the turn — and thus the site's status — forever.
  const timeoutMs = opts.timeoutMs ?? 480_000; // 8 min
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
  const res = await container.fetch(
    new Request("http://buildbox/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: ac.signal,
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
  // Flush a final line that arrived without a trailing newline, so a result on the
  // last line is never dropped if the stream ends mid-buffer.
  const tail = buf.trim();
  if (tail) {
    try {
      const ev: any = JSON.parse(tail);
      if (ev.type === "log") onLog(ev.line);
      else if (ev.type === "result") result = { ok: ev.ok, assets: ev.assets, error: ev.error };
    } catch {
      /* ignore a trailing partial/garbage line */
    }
  }
  return result;
  } catch (e: any) {
    return { ok: false, error: ac.signal.aborted ? `build timed out after ${timeoutMs / 1000}s` : String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

export interface ProbeResult {
  live: boolean;
  status: number;
  ms: number;
  attempts: number;
}

// Ask the container to probe a deployed URL over real external HTTPS until it answers or
// the budget expires. The container streams a single {pending} after the first miss
// (forwarded via onPending) then a terminating {result}. Throws on transport failure so
// the caller can fall back to an in-runtime check.
export async function probeLive(
  container: ContainerStub,
  url: string,
  opts: { onPending?: () => void; budgetMs?: number } = {},
): Promise<ProbeResult> {
  const budgetMs = opts.budgetMs ?? 150_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), budgetMs + 30_000); // hard cap past the probe budget
  try {
    const res = await container.fetch(
      new Request("http://buildbox/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, budgetMs }),
        signal: ac.signal,
      }),
    );
    if (!res.body) throw new Error(`probe server returned ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let result: ProbeResult = { live: false, status: 0, ms: 0, attempts: 0 };
    const handle = (line: string) => {
      let ev: any;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === "pending") opts.onPending?.();
      else if (ev.type === "result") result = { live: !!ev.live, status: ev.status ?? 0, ms: ev.ms ?? 0, attempts: ev.attempts ?? 0 };
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handle(line);
      }
    }
    if (buf.trim()) handle(buf.trim());
    return result;
  } finally {
    clearTimeout(timer);
  }
}
