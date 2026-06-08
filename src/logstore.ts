import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

export type LogLevel = "info" | "error";

export interface LogEntry {
  ts: number; // epoch ms
  site: string;
  level: LogLevel;
  stage: string; // turn | model | deploy | build | provision | deployed | github | error | status
  msg: string;
}

export interface LogQuery {
  site?: string;
  level?: LogLevel | "all";
  q?: string;
  limit?: number;
}

const MAX = 600; // ring-buffer cap: keep the most recent entries, drop the oldest

// Singleton append-only log for every forge process. Stored as per-entry keys (e:<seq>)
// so large build-output entries never collide on the 128 KB single-value limit, and
// pruning the oldest is a direct delete (no full scan/value load on the hot append path).
export class LogStore extends DurableObject<Env> {
  private pad(n: number): string {
    return String(n).padStart(15, "0");
  }

  async append(entry: LogEntry): Promise<void> {
    const head = (await this.ctx.storage.get<number>("head")) ?? 0;
    let tail = (await this.ctx.storage.get<number>("tail")) ?? 0;
    await this.ctx.storage.put(`e:${this.pad(head)}`, entry);
    const nextHead = head + 1;
    while (nextHead - tail > MAX) {
      await this.ctx.storage.delete(`e:${this.pad(tail)}`);
      tail++;
    }
    await this.ctx.storage.put("head", nextHead);
    await this.ctx.storage.put("tail", tail);
  }

  async query(opts: LogQuery = {}): Promise<LogEntry[]> {
    const map = await this.ctx.storage.list<LogEntry>({
      prefix: "e:",
      reverse: true, // newest first (keys sort ascending by seq)
      limit: 1000,
    });
    let out = [...map.values()];
    if (opts.site) out = out.filter((e) => e.site === opts.site);
    if (opts.level && opts.level !== "all") out = out.filter((e) => e.level === opts.level);
    if (opts.q) {
      const ql = opts.q.toLowerCase();
      out = out.filter((e) => `${e.site} ${e.stage} ${e.level} ${e.msg}`.toLowerCase().includes(ql));
    }
    return out.slice(0, opts.limit ?? 500);
  }

  async sites(): Promise<string[]> {
    const map = await this.ctx.storage.list<LogEntry>({ prefix: "e:", limit: 1000 });
    return [...new Set([...map.values()].map((e) => e.site))].sort();
  }
}

// Best-effort: append a forge event to the singleton log. Logging must NEVER break a
// build, so all failures are swallowed.
export async function logEvent(
  env: Env,
  site: string,
  level: LogLevel,
  stage: string,
  msg: string,
): Promise<void> {
  try {
    const id = env.LOG_STORE.idFromName("global");
    await env.LOG_STORE.get(id).append({
      ts: Date.now(),
      site,
      level,
      stage,
      msg: String(msg).slice(0, 16000),
    });
  } catch {
    /* swallow — logging is best-effort */
  }
}
