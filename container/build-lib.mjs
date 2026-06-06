import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve, relative, extname } from "node:path";

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain",
  ".map": "application/json", ".wasm": "application/wasm",
};

export function contentType(p) {
  return TYPES[extname(p).toLowerCase()] || "application/octet-stream";
}

export async function writeFiles(root, files) {
  for (const f of files) {
    const target = resolve(root, f.path);
    if (!target.startsWith(resolve(root))) throw new Error(`unsafe path: ${f.path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.content, "utf8");
  }
}

export async function collectAssets(distDir) {
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      const buf = await readFile(full);
      const rel = "/" + relative(distDir, full).split("\\").join("/");
      out.push({ path: rel, contentBase64: buf.toString("base64"), contentType: contentType(rel) });
    }
  }
  await walk(distDir);
  return out;
}
