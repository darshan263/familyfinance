import "server-only";

import { prisma } from "./db";
import type { RateLimitStore, RateLimitWindow } from "./rate-limit";

/**
 * Throttle counters kept in the database, so they survive a deployment that has no single
 * long-lived process. On Vercel every function instance has its own memory and instances are
 * discarded constantly, which makes an in-process counter worthless — this is what makes the
 * sign-in limit real there.
 *
 * The cost is two round trips per sign-in attempt. At this app's scale that is nothing, and
 * it only happens on the login path.
 */
export const dbStore: RateLimitStore = {
  async bump(key, windowMs, now): Promise<RateLimitWindow> {
    const at = new Date(now);

    // Clear the window first if it has run out, so the upsert below starts a fresh one.
    // Scoped to this key and conditional on the time, so it cannot disturb a live window.
    await prisma.rateLimit.deleteMany({ where: { key, resetAt: { lte: at } } });

    // `increment` is applied by the database, so two simultaneous attempts cannot both read
    // the same count and write the same value back.
    const row = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, resetAt: new Date(now + windowMs) },
      update: { count: { increment: 1 } },
    });

    return { count: row.count, resetAt: row.resetAt.getTime() };
  },

  async clear(key): Promise<void> {
    await prisma.rateLimit.deleteMany({ where: { key } });
  },
};

/**
 * Drop windows that have run out. Nothing depends on this — an expired row is ignored and
 * then replaced — but without it the table grows by one row per key that is never seen
 * again. Cheap to call occasionally; safe to never call.
 */
export async function sweepRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lte: new Date() } },
  });
  return count;
}
