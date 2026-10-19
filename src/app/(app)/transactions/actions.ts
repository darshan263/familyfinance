"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { beforeOpening } from "@/lib/balances";
import { formatDate } from "@/lib/date";
import { prisma } from "@/lib/db";
import { formatMoney, toCents } from "@/lib/money";
import { logActivity } from "@/lib/queries";
import { requireUserToChange } from "@/lib/session";
import { KIND_LABELS, readTxnForm, txnColumns, type TxnInput } from "@/lib/txn";

export interface SaveState {
  error?: string;
}

/**
 * The form only offers what exists, but a form is only a suggestion: check every id it sent
 * actually names something, and that a category belongs to the kind of entry it is on.
 *
 * Also refuse an entry dated before an account started being tracked. That account's opening
 * balance already includes everything before its opening date, so the entry would be counted
 * twice — and back-filling the days before setup is the first thing most people try.
 */
async function checkReferences(input: TxnInput): Promise<string | null> {
  const ids = [input.accountId, input.kind === "TRANSFER" ? input.toAccountId : null].filter(
    (id): id is string => Boolean(id),
  );
  const accounts = await prisma.account.findMany({ where: { id: { in: ids } } });
  if (accounts.length !== new Set(ids).size) return "That account no longer exists. Reload and pick again.";

  const early = accounts.find((a) => beforeOpening(input.date, a));
  if (early) {
    return (
      `${early.name} is tracked from ${formatDate(early.openingDate)}, and its opening balance ` +
      `already includes anything earlier. To record this entry, first move the account's ` +
      `start date back (and set the balance it had then) on its Accounts page.`
    );
  }

  if (input.kind !== "TRANSFER") {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) return "That category no longer exists. Reload and pick again.";
    if (category.kind !== input.kind) {
      return `${category.name} is an ${category.kind.toLowerCase()} category, not ${input.kind.toLowerCase()}.`;
    }
  }

  if (input.memberId && !(await prisma.member.findUnique({ where: { id: input.memberId } }))) {
    return "That member no longer exists. Reload and pick again.";
  }
  return null;
}

export async function saveTransaction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireUserToChange();

  const parsed = readTxnForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the entry" };
  const input = parsed.data;

  const problem = await checkReferences(input);
  if (problem) return { error: problem };

  const cols = txnColumns(input);
  const data = { ...cols, amountCents: toCents(cols.amountCents) };
  const summary = `${KIND_LABELS[input.kind].toLowerCase()} ${input.description} (${formatMoney(input.amount)})`;

  const entryId = String(formData.get("entryId") ?? "");
  if (entryId) {
    const existing = await prisma.transaction.findUnique({ where: { id: entryId } });
    if (!existing || existing.deletedAt) return { error: "This entry has been deleted." };
    if (existing.kind === "ADJUSTMENT") return { error: "Balance adjustments cannot be edited." };
    await prisma.transaction.update({ where: { id: entryId }, data });
    await logActivity("UPDATE", `edited ${summary}`);
  } else {
    await prisma.transaction.create({ data });
    await logActivity("CREATE", `added ${summary}`);
  }

  revalidatePath("/", "layout");

  if (!entryId && formData.get("another") === "1") {
    redirect(`/transactions/new?kind=${input.kind}&saved=1`);
  }
  redirect(`/transactions?saved=1`);
}

/**
 * Soft delete. The id travels in its own hidden field: a submit button's `name` is
 * commandeered by React for the action id, so an id carried there never arrives.
 */
export async function deleteTransaction(formData: FormData): Promise<void> {
  await requireUserToChange();

  const id = String(formData.get("entryId") ?? "");
  if (!id) redirect("/transactions?deleted=failed");

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) redirect("/transactions?deleted=missing");

  await prisma.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  await logActivity(
    "DELETE",
    `deleted ${KIND_LABELS[existing.kind as keyof typeof KIND_LABELS]?.toLowerCase() ?? "entry"} ${existing.description} (${formatMoney(existing.amountCents)})`,
  );

  revalidatePath("/", "layout");
  redirect("/transactions?deleted=1");
}
