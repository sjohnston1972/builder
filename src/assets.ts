import type { Env } from "./types";

export interface BuiltAsset {
  path: string;          // leading-slash path, e.g. "/index.html"
  contentBase64: string;
  contentType: string;
}

// Cloudflare expects a 32-hex-character hash of the file contents.
export async function hashAsset(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 32);
}

export interface ManifestEntry { hash: string; size: number }

export async function buildManifest(
  assets: BuiltAsset[],
): Promise<{ manifest: Record<string, ManifestEntry>; byHash: Map<string, BuiltAsset> }> {
  const manifest: Record<string, ManifestEntry> = {};
  const byHash = new Map<string, BuiltAsset>();
  for (const a of assets) {
    const bytes = Uint8Array.from(atob(a.contentBase64), (c) => c.charCodeAt(0));
    const hash = await hashAsset(bytes);
    manifest[a.path] = { hash, size: bytes.length };
    byHash.set(hash, a);
  }
  return { manifest, byHash };
}

const API = "https://api.cloudflare.com/client/v4";

async function cfJson(env: Env, path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, ...(init.headers || {}) },
  });
  const body = await (res.json() as Promise<any>).catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body?.errors?.[0]?.message || `CF API ${res.status}`);
  return body.result;
}

// Runs the 3-phase Workers Assets upload and returns the completion JWT for the script PUT.
export async function uploadAssets(env: Env, name: string, assets: BuiltAsset[]): Promise<string> {
  const { manifest, byHash } = await buildManifest(assets);

  const session = await cfJson(env, `/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${name}/assets-upload-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manifest }),
  });

  const buckets: string[][] = session.buckets ?? [];
  if (buckets.length === 0) return session.jwt; // nothing to upload; session jwt is the completion token

  let completion = session.jwt;
  for (const bucket of buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const a = byHash.get(hash);
      if (!a) continue;
      form.set(hash, new Blob([a.contentBase64], { type: a.contentType }), hash);
    }
    // All bucket uploads authenticate with the manifest/session JWT (not a rolling
    // per-bucket token) — this is what lets wrangler upload buckets in parallel. The
    // completion JWT returned after uploads is only for the final script PUT.
    const res = await fetch(`${API}/accounts/${env.CF_ACCOUNT_ID}/workers/assets/upload?base64=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.jwt}` },
      body: form,
    });
    const body = await (res.json() as Promise<any>).catch(() => ({}));
    if (!res.ok || !body.success) throw new Error(body?.errors?.[0]?.message || `asset upload ${res.status}`);
    if (body.result?.jwt) completion = body.result.jwt;
  }
  return completion;
}
