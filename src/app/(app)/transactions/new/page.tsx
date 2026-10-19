import Link from "next/link";

import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { toDateInput } from "@/lib/date";
import { requireUser } from "@/lib/session";
import { FORM_KINDS, type FormKind } from "@/lib/txn";
import { getFormOptions } from "../form-options";
import { TxnForm } from "../TxnForm";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; saved?: string }>;
}) {
  await requireUser();
  const { kind, saved } = await searchParams;
  const options = await getFormOptions();
  const defaultKind: FormKind = FORM_KINDS.includes(kind as FormKind) ? (kind as FormKind) : "EXPENSE";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add entry" subtitle="Income, an expense, or money moved between your accounts." />

      {saved === "1" && (
        <div className="mb-4">
          <Notice tone="ok">Saved. Add the next one below.</Notice>
        </div>
      )}

      {options.accounts.filter((a) => a.isActive).length === 0 ? (
        <div className="card p-6 text-sm">
          <p>Entries move money in and out of accounts, so add an account first.</p>
          <Link href="/accounts/new" className="btn btn-primary mt-4">
            Add an account
          </Link>
        </div>
      ) : (
        <TxnForm defaultKind={defaultKind} today={toDateInput(new Date())} {...options} />
      )}
    </div>
  );
}
