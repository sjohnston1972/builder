import type { Env } from "./types";
export { SiteSession } from "./session";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return new Response("ok");
    return new Response("ok");
  },
} satisfies ExportedHandler<Env>;
