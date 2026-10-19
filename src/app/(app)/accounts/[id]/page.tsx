import Link from "next/link";
import { notFound } from "next/navigation";

import { IconTrash } from "@/components/Icons";
import { Money } from "@/components/Money";
import { Notice } from "@/components/Notice";
import { PageHeader, Stat } from "@/components/PageHeader";
import { TxnRow } from "@/components/TxnRow";
import { accountGroup, accountTypeLabel, takesValuations, toEnteredBalance } from "@/lib/accounts";
import { computePositions, gainPercent, runningBalances } from "@/lib/balances";
import { endOfDay, formatDate, toDateInput } from "@/lib/date";
import { prisma } from "@/lib/db";
import { centsToInput, formatMoney } from "@/lib/money";
import { getMembers } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { deleteValuation } from "../actions";
import { AccountForm } from "../AccountForm";
import { AdjustForm, ValuationForm } from "../BalanceForms";

export const dynamic = "force-dynamic";

/** What the small figure under each history entry is, by group. */
const RUNNING_LABEL = {
  LIQUID: "running balance",
  INVESTMENT: "amount put in so far",
  LIABILITY: "amount owed by entries",
} as const;

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; valued?: string; unvalued?: string; adjusted?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { owner: true, valuations: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } },
  });
  if (!account) notFound();

  const [txns, members] = await Promise.all([
    prisma.transaction.findMany({
      where: { deletedAt: null, OR: [{ accountId: id }, { toAccountId: id }] },
      include: { account: true, toAccount: true, category: true, member: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    getMembers(true),
  ]);

  const group = accountGroup(account.type);
  const today = toDateInput(new Date());
  const position = computePositions([account], txns, account.valuations, endOfDay()).get(account.id)!;
  const running = runningBalances(account, txns);
  const newestFirst = [...txns].reverse();
  const futureCount = txns.filter((t) => t.date > endOfDay()).length;
  const pct = gainPercent(position);

  return (
    <div>
      <PageHeader
        title={account.name}
        subtitle={
          <>
            {accountTypeLabel(account.type)}
            {account.institution ? ` · ${account.institution}` : ""} · {account.owner?.name ?? "Joint"}
            {!account.isActive && " · closed"}
          </>
        }
        actions={
          <Link href="/accounts" className="btn btn-secondary">
            All accounts
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        {sp.saved === "1" && <Notice tone="ok">Account saved.</Notice>}
        {sp.valued === "1" && <Notice tone="ok">Value updated.</Notice>}
        {sp.unvalued === "1" && <Notice tone="ok">Value update removed.</Notice>}
        {sp.unvalued === "missing" && (
          <Notice tone="warn">That value update was already removed. Nothing changed.</Notice>
        )}
        {sp.adjusted === "1" && (
          <Notice tone="ok">Balance adjusted. The difference is in the history below and is not counted as income or expense.</Notice>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {group === "LIQUID" && (
          <Stat label="Balance today">
            <Money cents={position.current} tone={position.current < 0 ? "debit" : "plain"} />
          </Stat>
        )}
        {group === "INVESTMENT" && (
          <>
            <Stat label="Worth now" hint={position.valuedAt ? `valued ${formatDate(position.valuedAt)}, plus anything added since` : "no value update yet, so this is what went in"}>
              <Money cents={position.current} />
            </Stat>
            <Stat label="Put in" hint="opening value plus money moved in, less money taken out">
              <Money cents={position.book} />
            </Stat>
            <Stat label="Gain" hint={pct ?? undefined}>
              <Money cents={position.gain} tone="auto" sign />
            </Stat>
          </>
        )}
        {group === "LIABILITY" && (
          <Stat label="Owed today" hint={position.valuedAt ? `per the statement of ${formatDate(position.valuedAt)}, plus entries since` : undefined}>
            <Money cents={-position.current} />
          </Stat>
        )}
      </div>

      <section className="card mb-6 p-5">
        {takesValuations(account.type) ? (
          <>
            <h2 className="mb-1 text-lg">
              {group === "LIABILITY" ? "Update what is owed" : "Update value"}
            </h2>
            <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
              {group === "LIABILITY"
                ? "From the card or loan statement. Entries after this date are added on top."
                : "From your statement, app or CAS. Entries after this date are added on top, so a SIP made after the statement still counts."}
            </p>
            <ValuationForm accountId={account.id} today={today} owed={group === "LIABILITY"} />

            {account.valuations.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">Value history</h3>
                <div className="divide-line rounded-xl border">
                  {account.valuations.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-28 shrink-0" style={{ color: "var(--text-muted)" }}>
                        {formatDate(v.date)}
                      </span>
                      <span className="tnum flex-1 font-medium">
                        {formatMoney(toEnteredBalance(account.type, v.valueCents))}
                        {v.note && (
                          <span className="ml-2 font-normal" style={{ color: "var(--text-faint)" }}>
                            {v.note}
                          </span>
                        )}
                      </span>
                      <form action={deleteValuation}>
                        <input type="hidden" name="valuationId" value={v.id} />
                        <input type="hidden" name="accountId" value={account.id} />
                        <button className="btn btn-ghost btn-sm" type="submit" aria-label="Remove this value update">
                          <IconTrash size={15} />
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="mb-1 text-lg">Adjust balance</h2>
            <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
              If this does not match the bank, enter what the bank shows. The difference is
              recorded as an adjustment, not as income or spending.
            </p>
            <AdjustForm accountId={account.id} today={today} />
          </>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-lg">History</h2>
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            Opening {formatMoney(toEnteredBalance(account.type, account.openingBalanceCents))}
            {group === "LIABILITY" ? " owed" : ""} on {formatDate(account.openingDate)} ·{" "}
            {RUNNING_LABEL[group]} under each entry
          </span>
        </div>
        {group !== "LIQUID" && account.valuations.length > 0 && (
          <p className="mb-2 px-1 text-xs" style={{ color: "var(--text-muted)" }}>
            The figures under each entry follow the entries alone. Value updates are not applied
            to them, so they can differ from the {group === "LIABILITY" ? "amount owed" : "value"}{" "}
            shown above, which uses the latest update.
          </p>
        )}
        {futureCount > 0 && (
          <p className="mb-2 px-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {futureCount} future-dated {futureCount === 1 ? "entry is" : "entries are"} listed but
            not yet counted in today&apos;s figures.
          </p>
        )}
        <div className="card overflow-hidden">
          {newestFirst.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: "var(--text-faint)" }}>
              No entries on this account yet.
            </p>
          ) : (
            <div className="divide-line list-long">
              {newestFirst.map((t) => (
                <TxnRow
                  key={t.id}
                  t={t}
                  balance={running.has(t.id) ? toEnteredBalance(account.type, running.get(t.id)!) : undefined}
                  viewingAccountId={account.id}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <details className="card p-5">
        <summary className="cursor-pointer text-base font-semibold">Edit account</summary>
        <div className="mt-4">
          <AccountForm
            members={members.map((m) => ({ id: m.id, name: m.name }))}
            today={today}
            initial={{
              id: account.id,
              name: account.name,
              type: account.type,
              institution: account.institution ?? "",
              ownerMemberId: account.ownerMemberId ?? "",
              opening: centsToInput(toEnteredBalance(account.type, account.openingBalanceCents)),
              openingDate: toDateInput(account.openingDate),
              notes: account.notes ?? "",
              isActive: account.isActive,
            }}
          />
        </div>
      </details>
    </div>
  );
}
