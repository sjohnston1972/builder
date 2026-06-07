import { expect, test, describe } from "vitest";
import { reconstructFiles, ensureReadme, syncForgeToGitHub } from "../src/github";

describe("reconstructFiles", () => {
  test("simple forge: raw worker JS becomes a single index.mjs", () => {
    const script = `export default { fetch() { return new Response("hi"); } };`;
    expect(reconstructFiles(script)).toEqual([{ path: "index.mjs", content: script }]);
  });

  test("framework forge: {files:[...]} JSON is expanded to its file set", () => {
    const files = [
      { path: "package.json", content: `{"name":"x"}` },
      { path: "src/App.tsx", content: "export default () => null;" },
    ];
    const script = JSON.stringify({ files });
    expect(reconstructFiles(script)).toEqual(files);
  });

  test("JSON that is not a forge file bundle is treated as a single simple script", () => {
    // A simple worker whose body happens to be valid JSON must NOT be mistaken for a bundle.
    const script = `{"this":"is just data, not a {files} bundle"}`;
    expect(reconstructFiles(script)).toEqual([{ path: "index.mjs", content: script }]);
  });
});

describe("ensureReadme", () => {
  const files = [{ path: "index.mjs", content: "x" }];

  test("adds a README mentioning the live URL when none exists", () => {
    const out = ensureReadme(files, "demo", "https://demo.clydeford.net");
    const readme = out.find((f) => f.path === "README.md");
    expect(readme).toBeTruthy();
    expect(readme!.content).toContain("demo");
    expect(readme!.content).toContain("https://demo.clydeford.net");
  });

  test("does not clobber a README the forge already ships", () => {
    const withReadme = [...files, { path: "README.md", content: "MINE" }];
    const out = ensureReadme(withReadme, "demo", "https://demo.clydeford.net");
    expect(out.filter((f) => f.path.toLowerCase() === "readme.md")).toHaveLength(1);
    expect(out.find((f) => f.path === "README.md")!.content).toBe("MINE");
  });
});

// A tiny scriptable mock of the GitHub REST surface syncForgeToGitHub uses.
// Each handler matches METHOD + a path substring and returns {status, body}.
function mockGitHub(opts: { repoExists: boolean; mainRefExists: boolean }) {
  const calls: { method: string; url: string; body: any }[] = [];
  const fetchImpl = async (url: string, init: any = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const reply = (status: number, obj: unknown) =>
      new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

    if (url.endsWith("/user")) return reply(200, { login: "octocat" });
    if (method === "GET" && /\/repos\/octocat\/forge-demo$/.test(url))
      return opts.repoExists ? reply(200, { name: "forge-demo" }) : reply(404, { message: "Not Found" });
    if (method === "POST" && url.endsWith("/user/repos"))
      return reply(201, { name: body.name, private: body.private, full_name: `octocat/${body.name}` });
    if (method === "GET" && url.includes("/git/ref/heads/main"))
      return opts.mainRefExists ? reply(200, { object: { sha: "PARENT" } }) : reply(404, { message: "Not Found" });
    // Contents API bootstrap used to seed an empty repo's first commit.
    if (method === "PUT" && url.includes("/contents/README.md"))
      return reply(201, { commit: { sha: "BOOT" } });
    if (method === "POST" && url.includes("/git/blobs"))
      return reply(201, { sha: "blob-" + body.content.slice(0, 6) });
    if (method === "POST" && url.includes("/git/trees")) return reply(201, { sha: "TREE" });
    if (method === "POST" && url.includes("/git/commits")) return reply(201, { sha: "COMMIT" });
    if (method === "PATCH" && url.includes("/git/refs/heads/main")) return reply(200, { ref: "main" });
    if (method === "POST" && url.includes("/git/refs")) return reply(201, { ref: "main" });
    return reply(500, { message: "unexpected call: " + method + " " + url });
  };
  return { fetchImpl, calls };
}

const ENV = { GITHUB_TOKEN: "tkn" } as any;

describe("syncForgeToGitHub", () => {
  test("creates the repo when missing and bootstraps an empty repo before snapshotting", async () => {
    const { fetchImpl, calls } = mockGitHub({ repoExists: false, mainRefExists: false });
    const out = await syncForgeToGitHub(
      ENV,
      "demo",
      `export default {};`,
      "https://demo.clydeford.net",
      fetchImpl as any,
    );
    expect(out.repo).toBe("octocat/forge-demo");

    // Repo was created, privately.
    const create = calls.find((c) => c.method === "POST" && c.url.endsWith("/user/repos"));
    expect(create?.body).toMatchObject({ name: "forge-demo", private: true });

    // The empty repo is bootstrapped via the Contents API (Git Data API can't seed it),
    // then the snapshot commit is parented on that bootstrap commit and main is patched.
    expect(calls.some((c) => c.method === "PUT" && c.url.includes("/contents/README.md"))).toBe(true);
    const commit = calls.find((c) => c.method === "POST" && c.url.includes("/git/commits"));
    expect(commit?.body.parents).toEqual(["BOOT"]);
    expect(calls.some((c) => c.method === "PATCH" && c.url.includes("/git/refs/heads/main"))).toBe(true);
  });

  test("reuses an existing repo and commits onto main (parented, ref patched)", async () => {
    const { fetchImpl, calls } = mockGitHub({ repoExists: true, mainRefExists: true });
    await syncForgeToGitHub(ENV, "demo", `export default {};`, "https://demo.clydeford.net", fetchImpl as any);

    // No repo creation.
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/user/repos"))).toBe(false);
    // Commit is parented on the existing tip and the ref is PATCHed (not created).
    const commit = calls.find((c) => c.method === "POST" && c.url.includes("/git/commits"));
    expect(commit?.body.parents).toEqual(["PARENT"]);
    expect(calls.some((c) => c.method === "PATCH" && c.url.includes("/git/refs/heads/main"))).toBe(true);
  });

  test("commits a blob per file for a framework bundle (+ injected README)", async () => {
    const { fetchImpl, calls } = mockGitHub({ repoExists: true, mainRefExists: true });
    const bundle = JSON.stringify({
      files: [
        { path: "package.json", content: "{}" },
        { path: "src/App.tsx", content: "x" },
      ],
    });
    await syncForgeToGitHub(ENV, "demo", bundle, "https://demo.clydeford.net", fetchImpl as any);
    const blobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
    expect(blobs.length).toBe(3); // 2 source files + generated README
    const tree = calls.find((c) => c.method === "POST" && c.url.includes("/git/trees"));
    const paths = tree!.body.tree.map((t: any) => t.path).sort();
    expect(paths).toEqual(["README.md", "package.json", "src/App.tsx"]);
  });

  test("throws when no token is configured (so callers can treat it as best-effort)", async () => {
    const { fetchImpl } = mockGitHub({ repoExists: true, mainRefExists: true });
    await expect(
      syncForgeToGitHub({} as any, "demo", "x", "https://demo.clydeford.net", fetchImpl as any),
    ).rejects.toThrow(/token/i);
  });
});
