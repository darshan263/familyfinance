"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { logActivity, setSetting, SETTING_KEYS } from "@/lib/queries";
import { requireUser, startSession } from "@/lib/session";

function back(outcome: string): never {
  revalidatePath("/", "layout");
  redirect(`/settings?${outcome}`);
}

export async function renameHousehold(formData: FormData): Promise<void> {
  await requireUser();
  const name = String(formData.get("householdName") ?? "").trim();
  if (!name || name.length > 60) back("error=household");
  await setSetting(SETTING_KEYS.householdName, name);
  await logActivity("SETTINGS", `renamed the household to ${name}`);
  back("saved=household");
}

export interface PasswordState {
  error?: string;
  ok?: boolean;
}

/**
 * Change the login. Bumping tokenVersion signs out every other session at once, including on
 * a phone left signed in somewhere; this one gets a fresh cookie so it stays signed in.
 */
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "The current password is wrong." };
  if (next.length < 10) return { error: "Use a new password of at least 10 characters." };
  if (next !== confirm) return { error: "The two new passwords do not match." };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10), tokenVersion: { increment: 1 } },
  });
  await startSession(updated);
  await logActivity("AUTH", "changed the password");
  return { ok: true };
}

export async function addCategory(formData: FormData): Promise<void> {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  if (!name || name.length > 40 || (kind !== "EXPENSE" && kind !== "INCOME")) back("error=category");

  const clash = await prisma.category.findFirst({ where: { kind, name: { equals: name } } });
  if (clash) back("error=categoryTaken");

  const last = await prisma.category.aggregate({ where: { kind }, _max: { sort: true } });
  await prisma.category.create({ data: { name, kind, sort: (last._max.sort ?? 0) + 10 } });
  await logActivity("CATEGORY", `added ${kind.toLowerCase()} category ${name}`);
  back("saved=category");
}

export async function renameCategory(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const existing = id ? await prisma.category.findUnique({ where: { id } }) : null;
  if (!existing) back("error=missing");
  if (!name || name.length > 40) back("error=category");
  if (name === existing.name) back("saved=category");

  const clash = await prisma.category.findFirst({ where: { kind: existing.kind, name, NOT: { id } } });
  if (clash) back("error=categoryTaken");

  await prisma.category.update({ where: { id }, data: { name } });
  await logActivity("CATEGORY", `renamed category ${existing.name} to ${name}`);
  back("saved=category");
}

/**
 * Archive a category that has entries; delete one that has none. Deleting a used category
 * would leave its entries "Uncategorised" and quietly reshape every past report.
 */
export async function removeCategory(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("categoryId") ?? "");
  const existing = id
    ? await prisma.category.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } })
    : null;
  if (!existing) back("error=missing");

  if (existing._count.transactions > 0) {
    await prisma.category.update({ where: { id }, data: { isActive: !existing.isActive } });
    await logActivity("CATEGORY", `${existing.isActive ? "archived" : "restored"} category ${existing.name}`);
    back(existing.isActive ? "saved=archived" : "saved=category");
  }

  await prisma.category.delete({ where: { id } });
  await logActivity("CATEGORY", `deleted unused category ${existing.name}`);
  back("saved=deleted");
}
