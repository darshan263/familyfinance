import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";

import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./auth";

/** The signed-in user, re-read from the database so a changed password takes effect at once. */
export async function getCurrentUser(): Promise<User | null> {
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
}

/** Use in any page or action that must not render for a signed-out visitor. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
