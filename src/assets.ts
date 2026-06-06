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
