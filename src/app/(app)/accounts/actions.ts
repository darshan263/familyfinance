"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  accountGroup,
  accountTypeLabel,
  ACCOUNT_TYPE_KEYS,
  takesValuations,
  toStoredBalance,
} from "@/lib/accounts";
import { computePositions } from "@/lib/balances";
import { endOfDay, parseDay } from "@/lib/date";
import { prisma } from "@/lib/db";
import { formatMoney, MAX_AMOUNT_CENTS, parseAmount, toCents } from "@/lib/money";
import { logActivity } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export interface FormState {
  error?: string;
}

const day = z.string().transform((value, ctx) => {
  const date = parseDay(value, "midday");
  if (!date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick a valid date" });
    return z.NEVER;
  }
  return date;
});

/** A balance or value as typed. `allowNegative` is for an overdrawn bank account. */
function money(label: string, { allowNegative = false } = {}) {
  return z.string().transform((value, ctx) => {
    const cents = value.trim() === "" ? 0 : parseAmount(value);
    if (cents === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} should be a number, like 25000` });
      return z.NEVER;
    }
    if (!allowNegative && cents < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} cannot be negative` });
      return z.NEVER;
    }
    if (Math.abs(cents) > MAX_AMOUNT_CENTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is too large` });
      return z.NEVER;
    }
    return cents;
  });
}

const accountSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name").max(60),
  type: z.enum(ACCOUNT_TYPE_KEYS, { message: "Pick a type" }),
  institution: z
    .string()
    .trim()
    .max(60)
    .transform((v) => v || null),
  ownerMemberId: z.string().transform((v) => v || null),
  opening: money("The opening balance", { allowNegative: true }),
  openingDate: day,
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => v || null),
});

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function saveAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  const parsed = accountSchema.safeParse({
    name: str(formData, "name"),
    type: str(formData, "type"),
    institution: str(formData, "institution"),
    ownerMemberId: str(formData, "ownerMemberId"),
    opening: str(formData, "opening"),
    openingDate: str(formData, "openingDate"),
    notes: str(formData, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };
  const v = parsed.data;

  if (accountGroup(v.type) !== "LIQUID" && v.opening < 0) {
    return {
      error:
        accountGroup(v.type) === "LIABILITY"
          ? "Enter what you owe as a positive number."
          : "An investment's opening value cannot be negative.",
    };
  }

  if (v.ownerMemberId && !(await prisma.member.findUnique({ where: { id: v.ownerMemberId } }))) {
    return { error: "That member no longer exists. Reload and pick again." };
  }

  const data = {
    name: v.name,
    type: v.type,
    institution: v.institution,
    ownerMemberId: v.ownerMemberId,
    openingBalanceCents: toCents(toStoredBalance(v.type, v.opening)),
    openingDate: v.openingDate,
    notes: v.notes,
  };

  const id = str(formData, "accountId");
  let savedId: string;
  if (id) {
    const existing = await prisma.account.findUnique({
      where: { id },
      include: { _count: { select: { valuations: true } } },
    });
    if (!existing) return { error: "This account no longer exists." };

    // Valuations are stored in the sign of the group they were taken in. Moving an account
    // between "owned" and "owed" would silently flip what they mean.
    const crossesSign =
      (accountGroup(existing.type) === "LIABILITY") !== (accountGroup(v.type) === "LIABILITY");
    if (crossesSign && existing._count.valuations > 0) {
      return {
        error: `This account has value updates recorded as ${accountTypeLabel(existing.type).toLowerCase()} figures. Delete them first, or add a new account of the other type.`,
      };
    }

    await prisma.account.update({
      where: { id },
      data: { ...data, isActive: formData.get("isActive") === "on" },
    });
    await logActivity("ACCOUNT", `edited account ${v.name}`);
    savedId = id;
  } else {
    const last = await prisma.account.aggregate({ _max: { sort: true } });
    const created = await prisma.account.create({ data: { ...data, sort: (last._max.sort ?? 0) + 10 } });
    await logActivity("ACCOUNT", `added account ${v.name}`);
    savedId = created.id;
  }

  revalidatePath("/", "layout");
  redirect(`/accounts/${savedId}?saved=1`);
}

const valuationSchema = z.object({
  accountId: z.string().min(1),
  date: day,
  value: money("The value"),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

/** Record what an investment is worth, or a liability is owed, on a date. */
export async function addValuation(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  const parsed = valuationSchema.safeParse({
    accountId: str(formData, "accountId"),
    date: str(formData, "date"),
    value: str(formData, "value"),
    note: str(formData, "note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };
  const v = parsed.data;

  const account = await prisma.account.findUnique({ where: { id: v.accountId } });
  if (!account) return { error: "This account no longer exists." };
  if (!takesValuations(account.type)) {
    return { error: "Bank and cash accounts are corrected with Adjust balance instead." };
  }

  const stored = toStoredBalance(account.type, v.value);
  await prisma.valuation.create({
    data: { accountId: account.id, date: v.date, valueCents: toCents(stored), note: v.note },
  });
  await logActivity("VALUATION", `updated ${account.name} to ${formatMoney(v.value)}`);

  revalidatePath("/", "layout");
  redirect(`/accounts/${account.id}?valued=1`);
}

export async function deleteValuation(formData: FormData): Promise<void> {
  await requireUser();
  const id = str(formData, "valuationId");
  const accountId = str(formData, "accountId");
  const existing = id ? await prisma.valuation.findUnique({ where: { id }, include: { account: true } }) : null;
  if (!existing) redirect(accountId ? `/accounts/${accountId}` : "/accounts");

  await prisma.valuation.delete({ where: { id } });
  await logActivity("VALUATION", `removed a value update from ${existing.account.name}`);

  revalidatePath("/", "layout");
  redirect(`/accounts/${existing.accountId}?unvalued=1`);
}

const adjustSchema = z.object({
  accountId: z.string().min(1),
  date: day,
  balance: money("The balance", { allowNegative: true }),
});

/**
 * Bring a bank or cash balance in line with what the bank says, by posting the difference as
 * an ADJUSTMENT dated on the day given. The difference is visible in the account's history
 * rather than buried in an edited opening balance, and it never counts as income or expense.
 */
export async function adjustBalance(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();

  const parsed = adjustSchema.safeParse({
    accountId: str(formData, "accountId"),
    date: str(formData, "date"),
    balance: str(formData, "balance"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };
  const v = parsed.data;

  const account = await prisma.account.findUnique({ where: { id: v.accountId } });
  if (!account) return { error: "This account no longer exists." };
  if (takesValuations(account.type)) {
    return { error: "Investments, cards and loans take Update value instead." };
  }

  const txns = await prisma.transaction.findMany({
    where: { deletedAt: null, OR: [{ accountId: account.id }, { toAccountId: account.id }] },
    select: { kind: true, amountCents: true, accountId: true, toAccountId: true, date: true },
  });
  const book = computePositions([account], txns, [], endOfDay(v.date)).get(account.id)!.book;
  const diff = v.balance - book;
  if (diff === 0) return { error: `${account.name} already shows ${formatMoney(book)} on that date. Nothing to adjust.` };

  await prisma.transaction.create({
    data: {
      kind: "ADJUSTMENT",
      amountCents: toCents(diff),
      date: v.date,
      description: `Balance set to ${formatMoney(v.balance)}`,
      accountId: account.id,
    },
  });
  await logActivity("ACCOUNT", `adjusted ${account.name} by ${formatMoney(diff, { sign: true })}`);

  revalidatePath("/", "layout");
  redirect(`/accounts/${account.id}?adjusted=1`);
}
