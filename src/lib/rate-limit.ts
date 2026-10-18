/**
 * The sign-in throttle: fixed windows, counted per key.
 *
 * The decision logic lives here and is pure. *Where* the counters live is the store's
 * problem, because that differs by deployment:
 *
 *  - one long-lived process (a VPS, a container) can hold them in memory
 *  - serverless gives every function instance its own memory and discards instances, so a
 *    counter there throttles nobody — those deployments need the database store in
 *    `rate-limit-db.ts`
 *
 * Counting an attempt has to be atomic, so that is the store's job too: `bump` drops an
 * expired window, records one attempt and reports the result, all as one step.
 */

export interface RateLimitWindow {
  count: number;
  /** Epoch ms at which this window stops counting. */
  resetAt: number;
}

export interface RateLimitStore {
  /** Atomically expire, count one attempt against `key`, and return the window it landed in. */
  bump(key: string, windowMs: number, now: number): Promise<RateLimitWindow>;
  /** Forget a key entirely — used after a success, so good logins cost nothing later. */
  clear(key: string): Promise<void>;
}

export interface RateLimitResult {
  ok: boolean;
  /** Whole seconds until the caller may try again. Zero when `ok`. */
  retryAfter: number;
}

export interface RateLimitOptions {
  /** Attempts allowed inside one window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Count one attempt. Returns `ok: false` once `limit` attempts have been made inside
 * `windowMs`, with how long the caller has to wait.
 *
 * Options are named, not positional: `limit` and `windowMs` are both numbers, and swapping
 * them silently sets the limit to several hundred thousand.
 */
export async function hit(
  store: RateLimitStore,
  key: string,
  { limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  const window = await store.bump(key, windowMs, now);

  if (window.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

export async function reset(store: RateLimitStore, key: string): Promise<void> {
  await store.clear(key);
}

/**
 * Counters in process memory. Correct for a single long-lived server, and what the tests
 * run against. Restarting loses every counter, and two processes each keep their own.
 */
export function memoryStore(options: { maxKeys?: number } = {}) {
  const maxKeys = options.maxKeys ?? 5_000;
  const windows = new Map<string, RateLimitWindow>();
  let evictionWarned = false;

  /** Drop dead windows; if that is not enough, drop the ones closest to expiring. */
  function evict(now: number): void {
    for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
    if (windows.size <= maxKeys) return;

    const byExpiry = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of byExpiry.slice(0, windows.size - maxKeys)) windows.delete(key);

    if (!evictionWarned) {
      evictionWarned = true;
      console.warn(
        `[familyfinance] sign-in throttle is tracking more than ${maxKeys} live keys and is ` +
          `now evicting them. That is far more than normal use — someone is probably guessing.`,
      );
    }
  }

  return {
    async bump(key: string, windowMs: number, now: number): Promise<RateLimitWindow> {
      const existing = windows.get(key);
      const window =
        !existing || existing.resetAt <= now
          ? { count: 1, resetAt: now + windowMs }
          : { count: existing.count + 1, resetAt: existing.resetAt };

      windows.set(key, window);
      // After the insert, not before, so the map is never left above the cap.
      if (windows.size > maxKeys) evict(now);
      return window;
    },
    async clear(key: string): Promise<void> {
      windows.delete(key);
    },
    /** Test seam. */
    size: () => windows.size,
    /** Test seam. */
    reset: () => {
      windows.clear();
      evictionWarned = false;
    },
  };
}
