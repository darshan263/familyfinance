import { prisma } from "@/lib/db";
import { sweepRateLimits } from "@/lib/rate-limit-db";

/**
 * Scheduled housekeeping, daily (see vercel.json). Two small jobs:
 *
 *  1. **Drop expired sign-in throttle rows**, which otherwise accumulate one per key never
 *     seen again.
 *  2. **Touch the database.** Supabase pauses a free project after about a week of
 *     inactivity, and the first request after a pause fails or hangs while it wakes. A daily
 *     query keeps the project marked active through a quiet fortnight.
 *
 * Outside the session gate (see `middleware.ts`) because the scheduler has no cookie, so it
 * carries its own secret instead.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Fail closed. Without a secret configured this would be an unauthenticated endpoint that
  // touches the database.
  if (!secret) {
    console.error("[familyfinance] /api/cron called but CRON_SECRET is not set — refusing.");
    return new Response("Not configured", { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const sweptRateLimitRows = await sweepRateLimits();
    // The keep-alive. Reading a real table is what registers as activity.
    const accounts = await prisma.account.count();

    console.log(
      `[familyfinance] cron: swept ${sweptRateLimitRows} expired throttle row(s), ${accounts} account(s) present.`,
    );
    return Response.json({ ok: true, sweptRateLimitRows, accounts });
  } catch (err) {
    // A failing keep-alive is how the database quietly goes to sleep, so make it visible.
    console.error("[familyfinance] cron failed:", err);
    return new Response("Cron failed", { status: 500 });
  }
}
