import type { Env } from "./types";

const API = "https://api.cloudflare.com/client/v4";
const COMPAT_DATE = "2025-04-17";

async function cf(env: Env, path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, ...(init.headers || {}) },
  });
  const body = await (res.json() as Promise<any>).catch(() => ({}));
  if (!res.ok || !body.success) {
    const msg = body?.errors?.[0]?.message || `CF API ${res.status}`;
    throw new Error(msg);
  }
  return body.result;
}

export async function deploySite(env: Env, name: string, script: string): Promise<string> {
  const metadata: Record<string, unknown> = {
    main_module: "index.mjs",
    compatibility_date: COMPAT_DATE,
    compatibility_flags: ["nodejs_compat"],
  };
  // Make the user's Anthropic key available to generated sites as
  // env.ANTHROPIC_API_KEY, so they can build AI-powered features.
  if (env.ANTHROPIC_API_KEY) {
    metadata.bindings = [
      { type: "secret_text", name: "ANTHROPIC_API_KEY", text: env.ANTHROPIC_API_KEY },
    ];
  }

  const form = new FormData();
  form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.set(
    "index.mjs",
    new Blob([script], { type: "application/javascript+module" }),
    "index.mjs",
  );

  await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${name}`, {
    method: "PUT",
    body: form,
  });

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
    // Domain may already be attached from a prior deploy — ignore "already exists".
    if (!/already|exists|duplicate/i.test(String(e.message))) throw e;
  });

  return `https://${name}.${env.SITE_ZONE}`;
}

// When a subdomain is first attached, Cloudflare provisions an edge TLS
// certificate for it — anywhere from a few seconds to a couple of minutes.
// Until that finishes the URL fails the TLS handshake (fetch throws) or the
// edge returns an SSL error (5xx). Poll the URL so the "live" signal we hand
// the client is truthful, rather than optimistically firing the instant the
// API accepts the deploy. `onPending` fires once, after the first miss, so the
// UI can show a "provisioning…" state only when the site isn't already live
// (i.e. genuine first deploys — redeploys pass the first check instantly).
export async function waitUntilLive(
  url: string,
  opts: { budgetMs?: number; intervalMs?: number; onPending?: () => void } = {},
): Promise<boolean> {
  const { budgetMs = 90_000, intervalMs = 3_000, onPending } = opts;
  const deadline = Date.now() + budgetMs;
  let notifiedPending = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET", headers: { "cache-control": "no-cache" } });
      // Any normal app response (even a 404) means TLS + routing are up.
      // Cloudflare's own "cert not ready" errors surface as 5xx (521–526).
      if (res.status < 500) return true;
    } catch {
      // TLS handshake / DNS not ready yet — keep waiting.
    }
    if (!notifiedPending) {
      notifiedPending = true;
      onPending?.();
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function deleteSite(env: Env, name: string): Promise<void> {
  const hostname = `${name}.${env.SITE_ZONE}`;

  // 1. Remove the custom domain binding (DNS record + edge cert).
  try {
    const domains = await cf(
      env,
      `/accounts/${env.CF_ACCOUNT_ID}/workers/domains?zone_id=${env.ZONE_ID}&hostname=${hostname}`,
      { method: "GET" },
    );
    const domain = Array.isArray(domains)
      ? domains.find((d: any) => d.hostname === hostname) ?? domains[0]
      : null;
    if (domain?.id) {
      await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/domains/${domain.id}`, {
        method: "DELETE",
      });
    }
  } catch {
    // No domain attached (or already removed) — keep going.
  }

  // 2. Delete the worker script itself.
  await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${name}`, {
    method: "DELETE",
  }).catch(() => {});
}
