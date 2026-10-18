"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MEMBER_COLORS } from "@/lib/colors";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/queries";
import { requireUser } from "@/lib/session";

/** Outcomes travel back as a query parameter, since every action here ends in a redirect. */
function back(outcome: string): never {
  revalidatePath("/", "layout");
  redirect(`/members?${outcome}`);
}

function readName(formData: FormData): string | null {
  const name = String(formData.get("name") ?? "").trim();
  return name && name.length <= 40 ? name : null;
}

async function nameTaken(name: string, exceptId?: string) {
  const all = await prisma.member.findMany({ select: { id: true, name: true } });
  return all.some((m) => m.id !== exceptId && m.name.toLowerCase() === name.toLowerCase());
}

export async function addMember(formData: FormData): Promise<void> {
  await requireUser();
  const name = readName(formData);
  if (!name) back("error=name");
  if (await nameTaken(name)) back("error=taken");

  const count = await prisma.member.count();
  await prisma.member.create({ data: { name, color: MEMBER_COLORS[count % MEMBER_COLORS.length] } });
  await logActivity("MEMBER", `added member ${name}`);
  back("saved=1");
}

export async function updateMember(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("memberId") ?? "");
  const existing = id ? await prisma.member.findUnique({ where: { id } }) : null;
  if (!existing) back("error=missing");

  const name = readName(formData);
  if (!name) back("error=name");
  if (await nameTaken(name, id)) back("error=taken");

  const colorInput = String(formData.get("color") ?? "");
  const color = (MEMBER_COLORS as readonly string[]).includes(colorInput) ? colorInput : existing.color;

  await prisma.member.update({ where: { id }, data: { name, color } });
  if (existing.name !== name) await logActivity("MEMBER", `renamed ${existing.name} to ${name}`);
  back("saved=1");
}

/** Deactivate rather than delete: their old entries keep saying whose they were. */
export async function toggleMember(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("memberId") ?? "");
  const existing = id ? await prisma.member.findUnique({ where: { id } }) : null;
  if (!existing) back("error=missing");

  await prisma.member.update({ where: { id }, data: { isActive: !existing.isActive } });
  await logActivity("MEMBER", `${existing.isActive ? "deactivated" : "reactivated"} ${existing.name}`);
  back("saved=1");
}
