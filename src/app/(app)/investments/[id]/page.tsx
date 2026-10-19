import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { IconTrash } from "@/components/Icons";
import { Money } from "@/components/Money";
import { Notice } from "@/components/Notice";
import { PageHeader, Stat } from "@/components/PageHeader";
import { TxnRow } from "@/components/TxnRow";
import { accountGroup, accountTypeLabel } from "@/lib/accounts";
import { computePositions, gainPercent, runningBalances } from "@/lib/balances";
import { endOfDay, formatDate, toDateInput } from "@/lib/date";
import { prisma } from "@/lib/db";
import { isInvestment } from "@/lib/investments";
import { centsToInput, formatMoney } from "@/lib/money";
import { getAccounts, getDefaultFundingAccountId, getMembers } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { deleteValuation } from "../../accounts/actions";
import { AccountForm } from "../../accounts/AccountForm";
import { ValuationForm } from "../../accounts/BalanceForms";
import { MoveMoneyForm } from "../MoveMoneyForm";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  "added:existing": { tone: "ok", text: "Investment added. Nothing was taken from any bank account." },
  "added:new": { tone: "ok", text: "Investment added, and the amount was taken from the account you picked." },
  "moved:in": { tone: "ok", text: "Invested. The bank balance went down by the same amount; your net worth did not change." },
  "moved:out": { tone: "ok", text: "Withdrawn into the bank account." },
  "valued:1": { tone: "ok", text: "Value updated." },
  "unvalued:1": { tone: "ok", text: "Value update removed." },
  "unvalued:missing": { tone: "warn", text: "That value update was already removed. Nothing changed." },
  "saved:1": { tone: "ok", text: "Details saved." },
};

export default async function InvestmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { owner: true, valuations: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } },
  });
  if (!account) notFound();
  if (!isInvestment(account.type)) redirect(`/accounts/${id}`);

  const [txns, members, accounts, defaultBankId] = await Promise.all([
    prisma.transaction.findMany({
      where: { deletedAt: null, OR: [{ accountId: id }, { toAccountId: id }] },
      include: { account: true, toAccount: true, category: true, member: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    getMembers(true),
    getAccounts(),
    getDefaultFundingAccountId(),
  ]);

  const today = toDateInput(new Date());
  const p = computePositions([account], txns, account.valuations, endOfDay()).get(id)!;
  const pct = gainPercent(p);
  const putInSoFar = runningBalances(account, txns);
  const bankAccounts = accounts
    .filter((a) => accountGroup(a.type) === "LIQUID")
    .map((a) => ({ id: a.id, name: a.name }));
  const notices = Object.entries(sp)
    .map(([k, v]) => NOTICES[`${k}:${v}`])
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
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
          <Link href="/investments" className="btn btn-secondary">
            All investments
          </Link>
        }
      />

      {notices.length > 0 && (
        <div className="flex flex-col gap-3">
          {notices.map((n) => (
            <Notice key={n.text} tone={n.tone}>
              {n.text}
            </Notice>
          ))}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Worth now"
          hint={p.valuedAt ? `valued ${formatDate(p.valuedAt)}, plus money added since` : "no value update yet, so this is what went in"}
        >
          <Money cents={p.current} />
        </Stat>
        <Stat label="Put in" hint="invested, less anything withdrawn">
          <Money cents={p.book} />
        </Stat>
        <Stat label="Gain" hint={pct ?? undefined}>
          <Money cents={p.gain} tone="auto" sign />
        </Stat>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-1 text-lg">Invest or withdraw</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
            A SIP or top-up comes out of a bank account; a withdrawal goes back into one.
          </p>
          {bankAccounts.length === 0 ? (
            <p className="text-sm">
              Add a bank or cash account first, so there is somewhere for the money to come from.{" "}
              <Link className="link" href="/accounts/new">Add an account</Link>
            </p>
          ) : (
            <MoveMoneyForm
              investmentId={id}
              bankAccounts={bankAccounts}
              defaultBankId={defaultBankId}
              today={today}
              canInvest={account.isActive}
            />
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-1 text-lg">Update value</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
            From your statement, app or CAS. Anything invested after this date is added on top.
          </p>
          <ValuationForm accountId={id} today={today} owed={false} />

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
                      {formatMoney(v.valueCents)}
                      {v.note && (
                        <span className="ml-2 font-normal" style={{ color: "var(--text-faint)" }}>
                          {v.note}
                        </span>
                      )}
                    </span>
                    <form action={deleteValuation}>
                      <input type="hidden" name="valuationId" value={v.id} />
                      <input type="hidden" name="accountId" value={id} />
                      <button className="btn btn-ghost btn-sm" type="submit" aria-label="Remove this value update">
                        <IconTrash size={15} />
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-lg">Money in and out</h2>
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            {formatMoney(account.openingBalanceCents)} already invested on {formatDate(account.openingDate)} ·
            total put in so far under each entry
          </span>
        </div>
        <div className="card overflow-hidden">
          {txns.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: "var(--text-faint)" }}>
              Nothing invested or withdrawn since tracking started.
            </p>
          ) : (
            <div className="divide-line list-long">
              {[...txns].reverse().map((t) => (
                <TxnRow key={t.id} t={t} balance={putInSoFar.get(t.id)} viewingAccountId={id} />
              ))}
            </div>
          )}
        </div>
      </section>

      <details className="card p-5">
        <summary className="cursor-pointer text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Edit details
        </summary>
        <div className="mt-4">
          <AccountForm
            groups={["INVESTMENT"]}
            members={members.map((m) => ({ id: m.id, name: m.name }))}
            today={today}
            initial={{
              id: account.id,
              name: account.name,
              type: account.type,
              institution: account.institution ?? "",
              ownerMemberId: account.ownerMemberId ?? "",
              opening: centsToInput(account.openingBalanceCents),
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
