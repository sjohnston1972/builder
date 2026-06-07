import type { Env } from "./types";

// Mirror a forge's current source into a private GitHub repo (one repo per forge,
// named forge-<name>). GitHub is a one-way mirror of what the SiteSession DO already
// stores: every deploy commits a full snapshot of the current file set. The HTTP layer
// is injectable so the logic is unit-testable without a network.

export interface ForgeFile {
  path: string;
  content: string;
}

type FetchImpl = typeof fetch;

const API = "https://api.github.com";

// The forge's `script` storage value is EITHER a framework bundle (JSON `{files:[...]}`)
// or a single simple-worker source string. Normalize both into a file set.
export function reconstructFiles(script: string): ForgeFile[] {
  try {
    const parsed = JSON.parse(script);
    if (parsed && Array.isArray(parsed.files)) {
      return parsed.files.map((f: ForgeFile) => ({ path: f.path, content: f.content }));
    }
  } catch {
    /* not JSON → a simple worker script */
  }
  return [{ path: "index.mjs", content: script }];
}

// Add a browsable README pointing at the live site, but never clobber one the forge ships.
export function ensureReadme(files: ForgeFile[], name: string, url: string): ForgeFile[] {
  if (files.some((f) => f.path.toLowerCase() === "readme.md")) return files;
  const content =
    `# ${name}\n\n` +
    `Auto-backed-up by [forge](https://builder.clydeford.net) — a source mirror of this ` +
    `site's current build.\n\n` +
    `- **Live site:** ${url}\n\n` +
    `> Do not edit here; the contents are overwritten on each deploy.\n`;
  return [...files, { path: "README.md", content }];
}

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "forge-backup",
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json",
  };
}

// base64 of the UTF-8 bytes — robust for any text/emoji content the forge may hold.
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function gh(
  fetchImpl: FetchImpl,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  okStatuses: number[] = [200, 201],
): Promise<any> {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!okStatuses.includes(res.status)) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

// Commit the forge's current source as a single full-snapshot commit. Creates the private
// repo on first run. Returns the owner/repo slug and the new commit sha.
export async function syncForgeToGitHub(
  env: Env,
  name: string,
  script: string,
  url: string,
  fetchImpl: FetchImpl = fetch,
): Promise<{ repo: string; commit: string }> {
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");

  const owner = env.GITHUB_OWNER || (await gh(fetchImpl, token, "GET", "/user")).login;
  const isOrg = !!env.GITHUB_OWNER;
  const repo = `forge-${name}`;
  const base = `/repos/${owner}/${repo}`;

  // 1. Ensure the repo exists (private).
  const probe = await fetchImpl(`${API}${base}`, { headers: headers(token) });
  if (probe.status === 404) {
    const createPath = isOrg ? `/orgs/${owner}/repos` : `/user/repos`;
    await gh(fetchImpl, token, "POST", createPath, {
      name: repo,
      private: true,
      auto_init: false,
      description: `Source mirror of the "${name}" forge — ${url}`,
    });
  } else if (probe.status !== 200) {
    const text = await probe.text().catch(() => "");
    throw new Error(`GitHub GET ${base} → ${probe.status}: ${text.slice(0, 300)}`);
  }

  // 2. Resolve the current main tip. A brand-new / empty repo has no commits yet, and the
  //    Git Data API refuses to create blobs in an empty repo ("Git Repository is empty").
  //    So bootstrap an initial commit via the Contents API first — that DOES work on an
  //    empty repo and creates the main branch — then build the real snapshot on top of it.
  let parent: string;
  const refRes = await fetchImpl(`${API}${base}/git/ref/heads/main`, { headers: headers(token) });
  if (refRes.status === 200) {
    parent = ((await refRes.json()) as any).object.sha;
  } else if (refRes.status === 404 || refRes.status === 409) {
    const boot = await gh(fetchImpl, token, "PUT", `${base}/contents/README.md`, {
      message: `forge: initialize ${name}`,
      content: toBase64(`# ${name}\n`),
      branch: "main",
    });
    parent = boot.commit.sha;
  } else {
    const text = await refRes.text().catch(() => "");
    throw new Error(`GitHub GET ${base}/git/ref/heads/main → ${refRes.status}: ${text.slice(0, 300)}`);
  }

  // 3. Build the file set, one blob each.
  const files = ensureReadme(reconstructFiles(script), name, url);
  const tree = [];
  for (const f of files) {
    const blob = await gh(fetchImpl, token, "POST", `${base}/git/blobs`, {
      content: toBase64(f.content),
      encoding: "base64",
    });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  // 4. Fresh tree with NO base_tree, so the commit is an exact mirror (handles deletions).
  const newTree = await gh(fetchImpl, token, "POST", `${base}/git/trees`, { tree });

  // 5. Commit on top of the current (or just-bootstrapped) main tip.
  const now = new Date().toISOString();
  const commit = await gh(fetchImpl, token, "POST", `${base}/git/commits`, {
    message: `forge: ${name} @ ${now}`,
    tree: newTree.sha,
    parents: [parent],
    author: { name: "forge", email: "forge@clydeford.net", date: now },
    committer: { name: "forge", email: "forge@clydeford.net", date: now },
  });

  // 6. Point main at the new commit.
  await gh(fetchImpl, token, "PATCH", `${base}/git/refs/heads/main`, { sha: commit.sha, force: false });

  return { repo: `${owner}/${repo}`, commit: commit.sha };
}
