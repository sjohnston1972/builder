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
  // Wipe all stored chat history + script for this site (used on delete).
  async clear(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

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
    const encoder = new TextEncoder();

    // If the client navigates away (mobile app-switch, tab close), the response
    // stream is cancelled. We keep building and persisting regardless — `send`
    // becomes a no-op once the client is gone — so the deploy completes and the
    // conversation is saved. The user sees the result when they reopen the site.
    let clientGone = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => {
          if (clientGone) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            clientGone = true;
          }
        };
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
          try {
            controller.close();
          } catch {
            /* already closed by client cancel */
          }
        }
      },
      cancel() {
        clientGone = true; // stop streaming, but the build above runs to completion
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }
}
