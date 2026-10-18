import Link from "next/link";
import { notFound } from "next/navigation";

import { IconTrash } from "@/components/Icons";
import { Money } from "@/components/Money";
import { PageHeader } from "@/components/PageHeader";
import { formatDate, toDateInput } from "@/lib/date";
import { prisma } from "@/lib/db";
import { centsToInput } from "@/lib/money";
import type { FormKind } from "@/lib/txn";
import { deleteTransaction } from "../actions";
import { getFormOptions } from "../form-options";
import { TxnForm } from "../TxnForm";

export const dynamic = "force-dynamic";

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const txn = await prisma.transaction.findUnique({ where: { id }, include: { account: true } });
  if (!txn || txn.deletedAt) notFound();

  const deleteForm = (
    <form action={deleteTransaction} className="mt-4">
      <input type="hidden" name="entryId" value={txn.id} />
      <button type="submit" className="btn btn-danger btn-sm">
        <IconTrash size={15} />
        Delete this entry
      </button>
    </form>
  );

  if (txn.kind === "ADJUSTMENT") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Balance adjustment" />
        <div className="card p-5 text-sm">
          <p>
            <Money cents={txn.amountCents} tone="auto" sign className="font-semibold" /> on{" "}
            <Link className="link" href={`/accounts/${txn.accountId}`}>
              {txn.account.name}
            </Link>
            , {formatDate(txn.date)}.
          </p>
          <p className="mt-2" style={{ color: "var(--text-muted)" }}>
            {txn.description}. Adjustments correct a balance to match the bank and cannot be
            edited. Delete it and adjust the balance again from the account page if it was wrong.
          </p>
        </div>
        {deleteForm}
      </div>
    );
  }

  const options = await getFormOptions();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit entry" />
      <TxnForm
        defaultKind={txn.kind as FormKind}
        today={toDateInput(new Date())}
        initial={{
          id: txn.id,
          kind: txn.kind as FormKind,
          amount: centsToInput(txn.amountCents),
          date: toDateInput(txn.date),
          description: txn.description,
          notes: txn.notes ?? "",
          accountId: txn.accountId,
          toAccountId: txn.toAccountId ?? "",
          categoryId: txn.categoryId ?? "",
          memberId: txn.memberId ?? "",
        }}
        {...options}
      />
      {deleteForm}
    </div>
  );
}
