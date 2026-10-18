/**
 * Check the environment before deploying. Run with `npm run check:env`.
 *
 * Connection strings fail in a small number of specific ways, and the errors they produce
 * are unhelpful — "Authentication failed" covers a wrong password, an unencoded character in
 * it, and the wrong username format for the pooler, which are three different fixes. This
 * separates them.
 *
 * Never prints a password. Hosts and usernames are shown because they are the parts you need
 * to see to spot a mistake.
 */

import { PrismaClient } from "@prisma/client";

type Level = "ok" | "warn" | "fail";
const results: { level: Level; text: string }[] = [];
const say = (level: Level, text: string) => results.push({ level, text });

/** Characters that change the meaning of a URL and must be percent-encoded in a password. */
const NEEDS_ENCODING = /[@#/?:[\]&=+$,% ]/g;

function checkUrl(name: string, raw: string | undefined, expect: "pooled" | "direct") {
  if (!raw) return say("fail", `${name} is not set.`);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return say("fail", `${name} is not a valid URL. An unencoded character in the password is the usual cause.`);
  }

  const password = decodeURIComponent(url.password ?? "");
  if (!password) say("fail", `${name} has no password.`);
  if (/YOUR|PASSWORD|REPLACE|\[|\]/i.test(password)) {
    say("fail", `${name} still contains the template password text.`);
  }

  // A password copied in raw, containing one of these, silently truncates the URL.
  const unsafe = [...new Set(password.match(NEEDS_ENCODING) ?? [])];
  if (unsafe.length > 0 && url.password === password) {
    say(
      "fail",
      `${name} has ${JSON.stringify(unsafe)} in the password and it is not percent-encoded. ` +
        `Encode it, or the URL parses as something else entirely.`,
    );
  }

  // The project ref is in the host for Supabase's direct endpoint, and in the username
  // (postgres.<ref>) for both poolers.
  const ref =
    raw.match(/db\.([a-z0-9]+)\.supabase\.co/)?.[1] ??
    url.username.match(/^postgres\.([a-z0-9]+)$/)?.[1];

  if (expect === "pooled") {
    if (url.port !== "6543") {
      say("warn", `${name} is on port ${url.port || "(default)"}; Supabase's transaction pooler is 6543.`);
    }
    if (!/pgbouncer=true/.test(url.search)) {
      say(
        "fail",
        `${name} is missing ?pgbouncer=true. Without it Prisma uses prepared statements, ` +
          `which a transaction pooler cannot support — it works until it suddenly does not.`,
      );
    }
    if (/supabase/.test(url.hostname) && !url.username.includes(".")) {
      say(
        "fail",
        `${name} username is "${url.username}". Supabase's pooler needs "postgres.<project-ref>", ` +
          `not plain "postgres".`,
      );
    }
  } else {
    if (url.port !== "5432") {
      say("warn", `${name} is on port ${url.port || "(default)"}; the session pooler is 5432.`);
    }
    if (/^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
      say(
        "warn",
        `${name} uses Supabase's direct host, which resolves to IPv6 only. If db push cannot ` +
          `reach it, switch to the session pooler: same pooler host as DATABASE_URL, port 5432.`,
      );
    }
    if (/pgbouncer=true/.test(url.search)) {
      say("fail", `${name} has pgbouncer=true. It is for schema changes and must not go through the transaction pooler.`);
    }
  }

  say("ok", `${name}: ${url.username}@${url.hostname}:${url.port}${url.search}`);
  return ref;
}

async function probe(name: string, url: string | undefined) {
  if (!url) return;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const rows = await prisma.$queryRawUnsafe<{ db: string }[]>("select current_database() as db");
    say("ok", `${name} connected (database "${rows[0].db}").`);
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    // Strip anything URL-shaped; it carries the password.
    const clean = message.replace(/postgres(ql)?:\/\/\S+/g, "<url>");
    if (/Authentication failed/i.test(clean)) {
      say(
        "fail",
        `${name} refused the credentials. The password is wrong, or was reset since it was copied. ` +
          `Supabase shows it once — reset it under Settings → Database if it was not saved.`,
      );
    } else if (/Can't reach|ECONNREFUSED|ENOTFOUND|timed out/i.test(clean)) {
      say("fail", `${name} could not be reached. The project may still be provisioning, or the host is wrong.`);
    } else {
      say("fail", `${name} failed: ${clean.split("\n").filter(Boolean).slice(-1)[0]?.slice(0, 160)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  const { DATABASE_URL, DIRECT_URL, AUTH_SECRET, CRON_SECRET, TRUST_PROXY_HEADER } = process.env;

  const poolRef = checkUrl("DATABASE_URL", DATABASE_URL, "pooled");
  const directRef = checkUrl("DIRECT_URL", DIRECT_URL, "direct");

  if (poolRef && directRef && poolRef !== directRef) {
    say("fail", "The two URLs point at different Supabase projects.");
  }

  if (!AUTH_SECRET || AUTH_SECRET.length < 32) {
    say("fail", "AUTH_SECRET is missing or shorter than 32 characters.");
  } else if (/change-me|placeholder/i.test(AUTH_SECRET)) {
    say("fail", "AUTH_SECRET is still a placeholder.");
  } else {
    say("ok", `AUTH_SECRET set (${AUTH_SECRET.length} chars).`);
  }

  if (!CRON_SECRET || CRON_SECRET.length < 32) {
    say("warn", "CRON_SECRET is missing or short. /api/cron refuses to run without it.");
  } else {
    say("ok", `CRON_SECRET set (${CRON_SECRET.length} chars).`);
  }

  say(
    TRUST_PROXY_HEADER === "true" ? "ok" : "warn",
    TRUST_PROXY_HEADER === "true"
      ? "TRUST_PROXY_HEADER=true — correct behind Vercel or any reverse proxy."
      : "TRUST_PROXY_HEADER is not true, so sign-in is throttled per account only.",
  );

  await probe("DIRECT_URL", DIRECT_URL);
  await probe("DATABASE_URL", DATABASE_URL);

  const icon = { ok: "  ok  ", warn: " warn ", fail: " FAIL " };
  console.log("");
  for (const r of results) console.log(`${icon[r.level]} ${r.text}`);

  const failed = results.filter((r) => r.level === "fail").length;
  const warned = results.filter((r) => r.level === "warn").length;
  console.log(
    `\n${failed ? `${failed} problem(s) to fix` : "Ready to deploy"}${warned ? `, ${warned} warning(s)` : ""}.\n`,
  );
  if (failed) process.exitCode = 1;
})();
