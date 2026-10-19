"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/queries";
import { hit, reset } from "@/lib/rate-limit";
import { dbStore } from "@/lib/rate-limit-db";
import { startSession } from "@/lib/session";

export interface LoginState {
  error?: string;
}

const MINUTES = 60 * 1000;

/**
 * Sign-in limits. There is only one login, so a limit keyed on the email alone is a switch
 * anyone who knows the address can flip: ten wrong guesses and the household is locked out.
 * Where the client's address can be trusted, the tight limit is per email *and* address, so it
 * only ever stops the person guessing; a per-address limit stops one machine spraying; and a
 * generous per-email limit remains as the backstop against guesses spread over many machines.
 * Without a trustworthy address there is nothing to tell people apart, so the email gets the
 * tight limit.
 */
function throttles(email: string, address: string | null) {
  if (!address) return [{ key: `login:email:${email}`, limit: 10, windowMs: 15 * MINUTES }];
  return [
    { key: `login:pair:${email}|${address}`, limit: 10, windowMs: 15 * MINUTES },
    { key: `login:ip:${address}`, limit: 30, windowMs: 15 * MINUTES },
    { key: `login:email:${email}`, limit: 200, windowMs: 60 * MINUTES },
  ];
}

let proxyWarned = false;

/**
 * The client's address, or null when there is no way to know it.
 *
 * `x-forwarded-for` is only a header. With a reverse proxy in front that sets it, it is the
 * client's address; without one, it is whatever the client typed. Set
 * `TRUST_PROXY_HEADER=true` only when something in front of the app actually sets it.
 * Returning null rather than a placeholder keeps every visitor out of one shared bucket.
 */
async function clientAddress(): Promise<string | null> {
  if (process.env.TRUST_PROXY_HEADER !== "true") {
    if (!proxyWarned) {
      proxyWarned = true;
      console.warn(
        "[familyfinance] TRUST_PROXY_HEADER is not set, so sign-in is throttled per account " +
          "only. Set it to \"true\" when running behind a reverse proxy that sets " +
          "x-forwarded-for.",
      );
    }
    return null;
  }
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}

function waitMessage(seconds: number): string {
  const mins = Math.ceil(seconds / 60);
  return `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (!email || !password) return { error: "Enter your email and password" };

  const limits = throttles(email, await clientAddress());
  for (const { key, limit, windowMs } of limits) {
    const check = await hit(dbStore, key, { limit, windowMs });
    if (!check.ok) return { error: waitMessage(check.retryAfter) };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Hash even when the account is missing, so a wrong email and a wrong password take
  // the same amount of time and the form cannot be used to discover the address.
  const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) return { error: "Wrong email or password" };

  for (const { key } of limits) await reset(dbStore, key);

  try {
    await startSession(user);
  } catch (err) {
    // Almost always AUTH_SECRET missing or too short; `secretKey()` says exactly what to do.
    console.error("[familyfinance] could not start a session:", err);
    return {
      error:
        err instanceof Error && /AUTH_SECRET/.test(err.message)
          ? "Sign-in is not configured yet: AUTH_SECRET is missing or too short. Set it in .env and restart."
          : "Could not start your session. Please try again.",
    };
  }

  // Best-effort (see logActivity): the cookie is already set, so the sign-in has happened.
  await logActivity("AUTH", "signed in");

  redirect(next);
}
