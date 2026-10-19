"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { accountGroup, accountTypeLabel } from "@/lib/accounts";
import { beforeOpening } from "@/lib/balances";
import { formatDate } from "@/lib/date";
import { prisma } from "@/lib/db";
import { dayField, formString, moneyField, optionalText } from "@/lib/forms";
import { INVESTMENT_TYPES, isInvestment } from "@/lib/investments";
import { formatMoney, toCents } from "@/lib/money";
import { logActivity } from "@/lib/queries";
import { requireUserToChange } from "@/lib/session";

export interface FormState {
  error?: string;
}

type Account = { id: string; name: string; type: string; openingDate: Date; isActive: boolean };

/** The refusal for money moved on a day before one of the two accounts was being tracked. */
function startedLater(account: Account): string {
  return (
    `${account.name} is tracked from ${formatDate(account.openingDate)}, so nothing can move ` +
    `in or out of it before then. Pick a later date, or move its start date back first.`
  );
}

/** A bank or cash account that money can come from or go to. */
async function bankAccount(id: string): Promise<Account | string> {
  if (!id) return "Pick the bank or cash account.";
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) return "That account no longer exists. Reload and pick again.";
  if (accountGroup(account.type) !== "LIQUID") {
    return `${account.name} is not a bank or cash account. Pick the one the money actually moves through.`;
  }
  return account;
}

async function investmentAccount(id: string): Promise<Account | string> {
  const account = id ? await prisma.account.findUnique({ where: { id } }) : null;
  if (!account || !isInvestment(account.type)) return "That investment no longer exists. Reload and try again.";
  return account;
}

const holdingSchema = z.object({
  name: z.string().trim().min(1, "Give the investment a name").max(60),
  type: z.enum(INVESTMENT_TYPES as [string, ...string[]], { message: "Pick what kind of investment it is" }),
  institution: optionalText(60),
  ownerMemberId: z.string().transform((v) => v || null),
  notes: optionalText(1000),
});

const existingSchema = z.object({
  invested: moneyField("The amount invested so far", { positive: true }),
  current: moneyField("The current value"),
  asOf: dayField,
});

const purchaseSchema = z.object({
  amount: moneyField("The amount", { positive: true }),
  date: dayField,
  fromAccountId: z.string(),
});

/**
 * Add an investment, one of two ways:
 *
 *  - **existing**: something already held. Its opening balance is what has gone in so far, as
 *    of a date; nothing is taken from any account, because that money left the bank long ago
 *    and is already reflected in the bank balance. A current value, if given, is recorded as a
 *    value update on the same date, so the gain shows straight away.
 *  - **new**: bought now. The investment starts at zero on the purchase date and the money
 *    moves in as a transfer from the chosen bank account, so the bank balance drops by it and
 *    net worth does not change.
 */
export async function addInvestment(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUserToChange();

  const mode = formString(formData, "mode");
  if (mode !== "existing" && mode !== "new") return { error: "Choose whether you already hold this or are buying it now." };

  const holding = holdingSchema.safeParse({
    name: formString(formData, "name"),
    type: formString(formData, "type"),
    institution: formString(formData, "institution"),
    ownerMemberId: formString(formData, "ownerMemberId"),
    notes: formString(formData, "notes"),
  });
  if (!holding.success) return { error: holding.error.issues[0]?.message ?? "Check the details" };
  const h = holding.data;

  if (h.ownerMemberId && !(await prisma.member.findUnique({ where: { id: h.ownerMemberId } }))) {
    return { error: "That member no longer exists. Reload and pick again." };
  }
  const sort = ((await prisma.account.aggregate({ _max: { sort: true } }))._max.sort ?? 0) + 10;
  const base = { name: h.name, type: h.type, institution: h.institution, ownerMemberId: h.ownerMemberId, notes: h.notes, sort };

  let id: string;
  if (mode === "existing") {
    const parsed = existingSchema.safeParse({
      invested: formString(formData, "invested"),
      current: formString(formData, "current"),
      asOf: formString(formData, "asOf"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the amounts" };
    const v = parsed.data;

    id = await prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: { ...base, openingBalanceCents: toCents(v.invested), openingDate: v.asOf },
      });
      if (v.current > 0 && v.current !== v.invested) {
        await tx.valuation.create({
          data: { accountId: created.id, date: v.asOf, valueCents: toCents(v.current), note: "value when added" },
        });
      }
      return created.id;
    });
    await logActivity("ACCOUNT", `added existing investment ${h.name} (${formatMoney(v.invested)} invested)`);
  } else {
    const parsed = purchaseSchema.safeParse({
      amount: formString(formData, "amount"),
      date: formString(formData, "date"),
      fromAccountId: formString(formData, "fromAccountId"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the amount" };
    const v = parsed.data;

    const from = await bankAccount(v.fromAccountId);
    if (typeof from === "string") return { error: from };
    if (beforeOpening(v.date, from)) return { error: startedLater(from) };

    id = await prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: { ...base, openingBalanceCents: BigInt(0), openingDate: v.date },
      });
      await tx.transaction.create({
        data: {
          kind: "TRANSFER",
          amountCents: toCents(v.amount),
          date: v.date,
          description: `Invested in ${h.name}`,
          accountId: from.id,
          toAccountId: created.id,
          memberId: h.ownerMemberId,
        },
      });
      return created.id;
    });
    await logActivity("CREATE", `invested ${formatMoney(v.amount)} in new ${accountTypeLabel(h.type).toLowerCase()} ${h.name}, from ${from.name}`);
  }

  revalidatePath("/", "layout");
  redirect(`/investments/${id}?added=${mode}`);
}

const moveSchema = z.object({
  investmentId: z.string(),
  bankAccountId: z.string(),
  amount: moneyField("The amount", { positive: true }),
  date: dayField,
  note: optionalText(120),
});

/**
 * Money between a bank account and an investment, either way: `direction` "in" is investing
 * more (a SIP or a top-up) and "out" is withdrawing or redeeming. Always a transfer, so it is
 * never counted as income or spending, and net worth moves only when the value does.
 */
export async function moveInvestmentMoney(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUserToChange();

  const direction = formString(formData, "direction");
  if (direction !== "in" && direction !== "out") return { error: "Choose invest or withdraw." };

  const parsed = moveSchema.safeParse({
    investmentId: formString(formData, "investmentId"),
    bankAccountId: formString(formData, "bankAccountId"),
    amount: formString(formData, "amount"),
    date: formString(formData, "date"),
    note: formString(formData, "note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details" };
  const v = parsed.data;

  const investment = await investmentAccount(v.investmentId);
  if (typeof investment === "string") return { error: investment };
  const bank = await bankAccount(v.bankAccountId);
  if (typeof bank === "string") return { error: bank };
  for (const a of [investment, bank]) if (beforeOpening(v.date, a)) return { error: startedLater(a) };
  // Withdrawing what is left of a closed investment is fine; putting new money in is not.
  if (direction === "in" && !investment.isActive) return { error: `${investment.name} is closed. Reopen it under Edit details first.` };
  if (!bank.isActive) return { error: `${bank.name} is closed. Pick an open account.` };

  const owner = await prisma.account.findUnique({ where: { id: investment.id }, select: { ownerMemberId: true } });
  const investing = direction === "in";
  await prisma.transaction.create({
    data: {
      kind: "TRANSFER",
      amountCents: toCents(v.amount),
      date: v.date,
      description: v.note ?? (investing ? `Invested in ${investment.name}` : `Withdrawn from ${investment.name}`),
      accountId: investing ? bank.id : investment.id,
      toAccountId: investing ? investment.id : bank.id,
      memberId: owner?.ownerMemberId ?? null,
    },
  });
  await logActivity(
    "CREATE",
    investing
      ? `invested ${formatMoney(v.amount)} in ${investment.name} from ${bank.name}`
      : `withdrew ${formatMoney(v.amount)} from ${investment.name} to ${bank.name}`,
  );

  revalidatePath("/", "layout");
  redirect(`/investments/${investment.id}?moved=${direction}`);
}
