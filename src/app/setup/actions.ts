"use server";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { accountTypeLabel, isAccountType, toStoredBalance } from "@/lib/accounts";
import { seedCategoryRows } from "@/lib/categories";
import { MEMBER_COLORS } from "@/lib/colors";
import { parseDay } from "@/lib/date";
import { prisma } from "@/lib/db";
import { MAX_AMOUNT_CENTS, parseAmount, toCents } from "@/lib/money";
import { SETTING_KEYS } from "@/lib/queries";
import { needsSetup, startSession } from "@/lib/session";

export interface SetupState {
  error?: string;
}

const loginSchema = z.object({
  householdName: z.string().trim().min(1, "Give the household a name").max(60),
  email: z.string().trim().toLowerCase().email("That does not look like an email address"),
  password: z.string().min(10, "Use a password of at least 10 characters"),
});

/** Thrown inside the setup transaction when someone else got there first. */
class AlreadySetUp extends Error {}

export async function completeSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  if (!(await needsSetup())) return { error: "This has already been set up. Sign in instead." };

  const login = loginSchema.safeParse({
    householdName: formData.get("householdName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!login.success) return { error: login.error.issues[0]?.message ?? "Check the details" };
  if (formData.get("confirm") !== login.data.password) return { error: "The two passwords do not match" };

  const memberNames = formData
    .getAll("memberName")
    .map((n) => String(n).trim())
    .filter(Boolean);
  if (memberNames.some((n) => n.length > 40)) return { error: "Member names can be at most 40 characters" };
  if (new Set(memberNames.map((n) => n.toLowerCase())).size !== memberNames.length) {
    return { error: "Two members have the same name" };
  }

  const startDate = parseDay(String(formData.get("startDate") ?? ""), "midday");
  if (!startDate) return { error: "Pick the date your balances are as of" };

  const names = formData.getAll("accountName").map(String);
  const types = formData.getAll("accountType").map(String);
  const balances = formData.getAll("accountBalance").map(String);

  const accounts: { name: string; type: string; openingBalanceCents: bigint }[] = [];
  for (const [i, raw] of names.entries()) {
    const name = raw.trim();
    const balanceText = (balances[i] ?? "").trim();
    if (!name && !balanceText) continue;
    if (!name) return { error: "Every account with a balance needs a name" };
    if (name.length > 60) return { error: "Account names can be at most 60 characters" };
    const type = types[i] ?? "";
    if (!isAccountType(type)) return { error: `Pick a type for ${name}` };
    const cents = balanceText ? parseAmount(balanceText) : 0;
    if (cents === null || cents < 0) {
      return { error: `The balance for ${name} should be a number like 25000 (for a ${accountTypeLabel(type).toLowerCase()}, what you have or owe).` };
    }
    if (cents > MAX_AMOUNT_CENTS) return { error: `The balance for ${name} is too large` };
    accounts.push({ name, type, openingBalanceCents: toCents(toStoredBalance(type, cents)) });
  }

  const passwordHash = await bcrypt.hash(login.data.password, 10);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction, for a second submission that arrives after the first
      // has committed. Two truly simultaneous ones both pass this; the unique constraints
      // stop the second (see the catch below).
      if ((await tx.user.count()) > 0) throw new AlreadySetUp();

      const created = await tx.user.create({
        data: { email: login.data.email, passwordHash },
      });

      for (const [i, name] of memberNames.entries()) {
        await tx.member.create({ data: { name, color: MEMBER_COLORS[i % MEMBER_COLORS.length] } });
      }

      for (const [i, a] of accounts.entries()) {
        await tx.account.create({ data: { ...a, openingDate: startDate, sort: i * 10 } });
      }

      await tx.category.createMany({ data: seedCategoryRows() });
      await tx.setting.create({
        data: { key: SETTING_KEYS.householdName, value: login.data.householdName },
      });
      await tx.activity.create({ data: { action: "SETTINGS", summary: "set up the household" } });

      return created;
    });
  } catch (err) {
    // The count above does not lock anything, so two simultaneous first runs can both pass it;
    // what actually stops the second is a unique constraint (the setting key, the categories)
    // failing inside the same transaction. Both mean the same thing to the person waiting.
    const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
    if (err instanceof AlreadySetUp || duplicate) {
      return { error: "This has already been set up. Sign in instead." };
    }
    throw err;
  }

  await startSession(user);
  redirect("/");
}
