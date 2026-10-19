"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  accountGroup,
  accountTypeLabel,
  ACCOUNT_TYPE_KEYS,
  crossesSign,
  takesValuations,
  toStoredBalance,
} from "@/lib/accounts";
import { adjustmentFor, beforeOpening } from "@/lib/balances";
import { formatDate } from "@/lib/date";
import { accountPath } from "@/lib/investments";
import { prisma } from "@/lib/db";
import { dayField, formString, moneyField } from "@/lib/forms";
import { formatMoney, toCents } from "@/lib/money";
import { logActivity } from "@/lib/queries";
import { requireUserToChange } from "@/lib/session";

export interface FormState {
  error?: string;
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
  opening: moneyField("The opening balance", { allowNegative: true }),
  openingDate: dayField,
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => v || null),
});

export async function saveAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUserToChange();

  const parsed = accountSchema.safeParse({
    name: formString(formData, "name"),
    type: formString(formData, "type"),
    institution: formString(formData, "institution"),
    ownerMemberId: formString(formData, "ownerMemberId"),
    opening: formString(formData, "opening"),
    openingDate: formString(formData, "openingDate"),
    notes: formString(formData, "notes"),
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

  const id = formString(formData, "accountId");
  let savedId: string;
  if (id) {
    const existing = await prisma.account.findUnique({
      where: { id },
      include: { _count: { select: { valuations: true } } },
    });
    if (!existing) return { error: "This account no longer exists." };

    if (crossesSign(existing.type, v.type) && existing._count.valuations > 0) {
      return {
        error: `This account has value updates recorded as ${accountTypeLabel(existing.type).toLowerCase()} figures. Delete them first, or add a new account of the other type.`,
      };
    }

    // Moving the start date later would leave existing entries dated before it, and the new
    // opening balance would count them a second time.
    const earliest = await earliestActivity(id);
    if (earliest && beforeOpening(earliest, { openingDate: v.openingDate })) {
      return {
        error: `This account has entries or value updates from ${formatDate(earliest)}, so tracking cannot start after that. Pick ${formatDate(earliest)} or earlier.`,
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
  redirect(`${accountPath({ id: savedId, type: v.type })}?saved=1`);
}

/** The date of the earliest live entry or value update on an account, if any. */
async function earliestActivity(accountId: string): Promise<Date | null> {
  const [txn, valuation] = await Promise.all([
    prisma.transaction.findFirst({
      where: { deletedAt: null, OR: [{ accountId }, { toAccountId: accountId }] },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.valuation.findFirst({ where: { accountId }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const dates = [txn?.date, valuation?.date].filter((d): d is Date => Boolean(d));
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}

/** The refusal for a value update or adjustment dated before the account was being tracked. */
function beforeOpeningMessage(account: { name: string; openingDate: Date }): string {
  return (
    `${account.name} is tracked from ${formatDate(account.openingDate)}. Pick that date or ` +
    `later, or move the account's start date back first.`
  );
}

const valuationSchema = z.object({
  accountId: z.string().min(1),
  date: dayField,
  value: moneyField("The value", { required: true }),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

/** Record what an investment is worth, or a liability is owed, on a date. */
export async function addValuation(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUserToChange();

  const parsed = valuationSchema.safeParse({
    accountId: formString(formData, "accountId"),
    date: formString(formData, "date"),
    value: formString(formData, "value"),
    note: formString(formData, "note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };
  const v = parsed.data;

  const account = await prisma.account.findUnique({ where: { id: v.accountId } });
  if (!account) return { error: "This account no longer exists." };
  if (!takesValuations(account.type)) {
    return { error: "Bank and cash accounts are corrected with Adjust balance instead." };
  }
  // A value from before tracking started would replace the opening value as the basis of
  // "worth now" and quietly drop it.
  if (beforeOpening(v.date, account)) return { error: beforeOpeningMessage(account) };

  const stored = toStoredBalance(account.type, v.value);
  await prisma.valuation.create({
    data: { accountId: account.id, date: v.date, valueCents: toCents(stored), note: v.note },
  });
  await logActivity("VALUATION", `updated ${account.name} to ${formatMoney(v.value)}`);

  revalidatePath("/", "layout");
  redirect(`${accountPath(account)}?valued=1`);
}

export async function deleteValuation(formData: FormData): Promise<void> {
  await requireUserToChange();
  const id = formString(formData, "valuationId");
  const accountId = formString(formData, "accountId");
  const existing = id ? await prisma.valuation.findUnique({ where: { id }, include: { account: true } }) : null;
  // Already gone — a double click, or deleted in another tab. Say so rather than reloading
  // the page as if something had happened.
  if (!existing) redirect(accountId ? `/accounts/${accountId}?unvalued=missing` : "/accounts");

  await prisma.valuation.delete({ where: { id } });
  await logActivity("VALUATION", `removed a value update from ${existing.account.name}`);

  revalidatePath("/", "layout");
  redirect(`${accountPath(existing.account)}?unvalued=1`);
}

const adjustSchema = z.object({
  accountId: z.string().min(1),
  date: dayField,
  balance: moneyField("The balance", { allowNegative: true, required: true }),
});

/**
 * Bring a bank or cash balance in line with what the bank says, by posting the difference as
 * an ADJUSTMENT dated on the day given. The difference is visible in the account's history
 * rather than buried in an edited opening balance, and it never counts as income or expense.
 */
export async function adjustBalance(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUserToChange();

  const parsed = adjustSchema.safeParse({
    accountId: formString(formData, "accountId"),
    date: formString(formData, "date"),
    balance: formString(formData, "balance"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };
  const v = parsed.data;

  const account = await prisma.account.findUnique({ where: { id: v.accountId } });
  if (!account) return { error: "This account no longer exists." };
  if (takesValuations(account.type)) {
    return { error: "Investments, cards and loans take Update value instead." };
  }
  // Before the opening date the book balance leaves the opening out, so the difference would
  // absorb it — and from the opening date on it would be counted a second time.
  if (beforeOpening(v.date, account)) return { error: beforeOpeningMessage(account) };

  const txns = await prisma.transaction.findMany({
    where: { deletedAt: null, OR: [{ accountId: account.id }, { toAccountId: account.id }] },
    select: { kind: true, amountCents: true, accountId: true, toAccountId: true, date: true },
  });
  const { book, diff } = adjustmentFor(account, txns, v.date, v.balance);
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
