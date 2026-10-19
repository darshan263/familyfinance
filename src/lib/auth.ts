import { SignJWT, jwtVerify } from "jose";

/**
 * Edge-safe half of auth: signing and verifying the session token. Deliberately free of
 * Prisma and bcrypt so `middleware.ts` (which runs on the edge runtime) can import it.
 */

export const SESSION_COOKIE = "familyfinance_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  sub: string;
  name: string;
  email: string;
  /** User.tokenVersion at signing time. A mismatch retires the session. */
  ver: number;
}

/** Stands in for this site when resolving a path, so anything that escapes it is visible. */
const PROBE_ORIGIN = "http://same-site.invalid";

/**
 * Where to send someone after they sign in: a path on this site, or "/".
 *
 * Checking the string's prefix is not enough. Browsers and Next's own redirect resolve the
 * value as a URL, and the URL parser drops tabs and line breaks first, so `/<tab>/evil.com`
 * passes a `startsWith("//")` test and then lands on evil.com. So: refuse control characters
 * and backslashes outright, resolve the value the way a browser would, and keep it only if it
 * is still on this site. What comes back is the resolved path, never the raw input.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== PROBE_ORIGIN) return "/";
  return url.pathname + url.search + url.hash;
}

/** The shortest AUTH_SECRET accepted. `npm run check:env` holds deployments to the same. */
export const MIN_SECRET_LENGTH = 32;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random string in .env before signing in.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ name: payload.name, email: payload.email, ver: payload.ver })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  // Deliberately outside the try. A missing or too-short AUTH_SECRET is a configuration
  // fault, not a bad token, and `secretKey()` throws a message saying exactly what to do.
  // Catching it here would turn the likeliest production misconfiguration into an endless
  // silent bounce back to /login with nothing anywhere explaining why.
  const key = secretKey();

  try {
    const { payload } = await jwtVerify(token, key);
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      ver: Number(payload.ver ?? 0),
    };
  } catch {
    return null;
  }
}
