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
  const form = new FormData();
  form.set(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          main_module: "index.mjs",
          compatibility_date: COMPAT_DATE,
          compatibility_flags: ["nodejs_compat"],
        }),
      ],
      { type: "application/json" },
    ),
  );
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

export async function deleteSite(env: Env, name: string): Promise<void> {
  await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${name}`, {
    method: "DELETE",
  }).catch(() => {});
}
