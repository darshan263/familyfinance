/**
 * Runs once when a server instance starts, before it handles any request.
 *
 * Every date in the app — what "today" is, where a month ends, the default on the entry
 * form — is worked out in the server's local time zone. Vercel's is UTC, which for an Indian
 * household is 5½ hours behind: between midnight and 5:30 am the app would still think it
 * was yesterday, and a month would end at 5:30 am on the 1st. Node re-reads `TZ` when it is
 * assigned, so setting it here fixes the clock for everything that follows.
 *
 * `APP_TIMEZONE` overrides it for a household elsewhere. (Vercel reserves `TZ` itself, which
 * is why this is not simply an environment variable.)
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";
  }
}
