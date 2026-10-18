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

/** Ten tries per account, and per source address where one can be trusted, every 15 minutes. */
const THROTTLE = { limit: 10, windowMs: 15 * 60 * 1000 };

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

  const address = await clientAddress();
  const keys = [`login:email:${email}`];
  if (address) keys.push(`login:ip:${address}`);

  for (const key of keys) {
    const check = await hit(dbStore, key, THROTTLE);
    if (!check.ok) return { error: waitMessage(check.retryAfter) };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Hash even when the account is missing, so a wrong email and a wrong password take
  // the same amount of time and the form cannot be used to discover the address.
  const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) return { error: "Wrong email or password" };

  for (const key of keys) await reset(dbStore, key);

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

  // The cookie is already set, so the sign-in has happened whatever follows. A failure
  // writing the audit row must not strand someone who is, in fact, signed in.
  try {
    await logActivity("AUTH", "signed in");
  } catch (err) {
    console.error("[familyfinance] could not record the sign-in:", err);
  }

  redirect(next);
}
