const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function signSession(secret: string): Promise<string> {
  const payload = `auth.${Date.now()}`;
  const sig = await hmac(secret, payload);
  return `${btoa(payload)}.${sig}`;
}

export async function verifySession(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  let payload: string;
  try {
    payload = atob(parts[0]);
  } catch {
    return false;
  }
  const expected = await hmac(secret, payload);
  return timingSafeEqual(parts[1], expected);
}

export function checkPassword(given: string, actual: string): boolean {
  return timingSafeEqual(given, actual);
}

// Accept `given` if it matches ANY configured password. Unset/empty entries are
// skipped so an undefined secret can never become a blank-password bypass. Checks
// every candidate (no short-circuit) to keep timing independent of which one matched.
export function checkAnyPassword(
  given: string,
  actuals: (string | undefined)[],
): boolean {
  let ok = false;
  for (const actual of actuals) {
    if (actual && checkPassword(given, actual)) ok = true;
  }
  return ok;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export const COOKIE = "builder_session";

export function cookieHeader(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

export function clearCookieHeader(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(req: Request): string | null {
  const raw = req.headers.get("Cookie") || "";
  const m = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}
