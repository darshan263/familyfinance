import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@prisma/client";

import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./auth";

/**
 * The signed-in user, re-read from the database so a changed password takes effect at once.
 *
 * Cached per request, so the layout and the page calling it costs one query, not two. Both
 * have to call it: Next does not re-render a shared layout when moving between pages, so a
 * check that lives only in the layout is skipped on every in-app navigation.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySession(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;
  // A password change bumps tokenVersion, which retires every cookie signed before it —
  // otherwise a 30-day session would outlive the credential it proves.
  if (payload.ver !== user.tokenVersion) return null;
  return user;
});

/** Call at the top of every signed-in page, not only the layout (see `getCurrentUser`). */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The same check for a server action or route that changes something. A signed-out visitor
 * here was in the middle of saving, so they are told it did not happen rather than dropped on
 * a blank sign-in page wondering where their entry went.
 */
export async function requireUserToChange(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=unsaved");
  return user;
}

export async function startSession(user: User): Promise<void> {
  const token = await signSession({
    sub: user.id,
    name: user.email,
    email: user.email,
    ver: user.tokenVersion,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** True before the first-run wizard has been completed. */
export async function needsSetup(): Promise<boolean> {
  return (await prisma.user.count()) === 0;
}
