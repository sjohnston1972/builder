// Minimal placeholder UI — replaced with a polished version in Task 8.
export function loginPage(error?: string): string {
  return `<!doctype html><html><body>
    <form method="POST" action="/login">
      <input name="password" type="password" />
      <button>Log in</button>
    </form>
    ${error ? `<p>${error}</p>` : ""}
  </body></html>`;
}

export function appPage(): string {
  return `<!doctype html><html><body>
    <div id="new-site"></div>
    <div id="chat"></div>
    <iframe id="preview"></iframe>
  </body></html>`;
}
