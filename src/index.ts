import type { Env, SiteRecord } from "./types";
import { appPage, loginPage, landingPage } from "./ui";
import {
  checkPassword,
  signSession,
  verifySession,
  readCookie,
  cookieHeader,
  clearCookieHeader,
} from "./auth";
import { sanitizeName, isValidName } from "./names";
import { deleteSite } from "./deploy";

export { SiteSession } from "./session";
export { BuildBox } from "./buildbox";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

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
      if (req.method === "GET") {
        return new Response(loginPage(), { headers: { "content-type": "text/html" } });
      }
      const form = await req.formData();
      if (checkPassword(String(form.get("password") ?? ""), env.APP_PASSWORD)) {
        const token = await signSession(env.SESSION_SECRET);
        return new Response(null, {
          status: 302,
          headers: { location: "/", "set-cookie": cookieHeader(token) },
        });
      }
      return new Response(loginPage("Wrong password"), {
        status: 401,
        headers: { "content-type": "text/html" },
      });
    }

    if (path === "/logout") {
      return new Response(null, {
        status: 302,
        headers: { location: "/", "set-cookie": clearCookieHeader() },
      });
    }

    // Public landing page for logged-out visitors; the app itself once authed.
    if (path === "/") {
      const html = (await authed(req, env)) ? appPage() : landingPage();
      return new Response(html, { headers: { "content-type": "text/html" } });
    }

    const ok = await authed(req, env);
    if (!ok) {
      if (path.startsWith("/api/")) return json({ error: "unauthorized" }, 401);
      return new Response(null, { status: 302, headers: { location: "/login" } });
    }

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
      if (await env.SITES.get(`site:${name}`)) {
        return json({ error: "Name already taken" }, 409);
      }
      const rec: SiteRecord = {
        name,
        url: `https://${name}.${env.SITE_ZONE}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await env.SITES.put(`site:${name}`, JSON.stringify(rec));
      return json(rec);
    }

    const histMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)\/history$/);
    if (histMatch && req.method === "GET") {
      const name = histMatch[1];
      const id = env.SITE_SESSION.idFromName(name);
      const { messages, status, deployedUrl } = await env.SITE_SESSION.get(id).getState();
      return json({ messages, status, url: deployedUrl });
    }

    const chatMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)\/chat$/);
    if (chatMatch && req.method === "POST") {
      const name = chatMatch[1];
      const { message } = await req.json<{ message: string }>();
      const id = env.SITE_SESSION.idFromName(name);
      const stub = env.SITE_SESSION.get(id);
      const res = await stub.fetch("https://do/turn", {
        method: "POST",
        body: JSON.stringify({ name, message }),
      });
      const rec = await env.SITES.get<SiteRecord>(`site:${name}`, "json");
      if (rec) {
        rec.updatedAt = Date.now();
        await env.SITES.put(`site:${name}`, JSON.stringify(rec));
      }
      return new Response(res.body, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      });
    }

    const delMatch = path.match(/^\/api\/sites\/([a-z0-9-]+)$/);
    if (delMatch && req.method === "DELETE") {
      const name = delMatch[1];
      await deleteSite(env, name);
      // Wipe the Durable Object's stored conversation + script.
      await env.SITE_SESSION.get(env.SITE_SESSION.idFromName(name)).clear();
      await env.SITES.delete(`site:${name}`);
      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
