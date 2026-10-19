import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { IconPlus } from "@/components/Icons";
import { Money } from "@/components/Money";
import { PageHeader, Stat } from "@/components/PageHeader";
import { accountTypeLabel } from "@/lib/accounts";
import { gainPercent } from "@/lib/balances";
import { formatDateCompact } from "@/lib/date";
import { isInvestment, summariseInvestments } from "@/lib/investments";
import { getPositions } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  await requireUser();
  const { accounts, positions } = await getPositions();
  const investments = accounts.filter((a) => isInvestment(a.type));
  const summary = summariseInvestments(investments, positions);
  const open = investments.filter((a) => a.isActive);
  const closed = investments.filter((a) => !a.isActive);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Investments"
        subtitle="What you have put in, what it is worth now, and the difference."
        actions={
          <Link href="/investments/new" className="btn btn-primary">
            <IconPlus size={16} />
            Add investment
          </Link>
        }
      />

      {investments.length === 0 ? (
        <div className="card p-8 text-sm">
          <p className="font-medium">No investments yet.</p>
          <p className="mt-1" style={{ color: "var(--text-muted)" }}>
            Add the mutual funds, stocks, FDs, PPF and anything else you already hold, with what
            you have put in so far. From then on, every SIP or top-up comes out of a bank account.
          </p>
          <Link href="/investments/new" className="btn btn-primary mt-4">
            Add your first investment
          </Link>
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="Worth now">
              <Money cents={summary.current} whole />
            </Stat>
            <Stat label="Put in">
              <Money cents={summary.invested} whole />
            </Stat>
            <Stat
              label="Gain"
              hint={
                summary.gainRatio !== null
                  ? `${summary.gainRatio >= 0 ? "+" : ""}${(summary.gainRatio * 100).toFixed(1)}% on what went in`
                  : undefined
              }
            >
              <Money cents={summary.gain} tone="auto" sign whole />
            </Stat>
          </section>

          <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-3">
              {open.map((a) => {
                const p = positions.get(a.id)!;
                const pct = gainPercent(p);
                return (
                  <Link
                    key={a.id}
                    href={`/investments/${a.id}`}
                    className="card flex flex-wrap items-center gap-4 p-4 transition-shadow hover:shadow-[var(--shadow-md)] sm:flex-nowrap"
                  >
                    <Avatar name={a.owner?.name ?? null} color={a.owner?.color} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{a.name}</span>
                      <span className="block truncate text-xs" style={{ color: "var(--text-faint)" }}>
                        {accountTypeLabel(a.type)}
                        {a.institution ? ` · ${a.institution}` : ""}
                        {p.valuedAt ? ` · valued ${formatDateCompact(p.valuedAt)}` : " · not valued yet"}
                      </span>
                    </span>
                    <span className="grid grid-cols-3 gap-4 text-right sm:w-[22rem]">
                      <span>
                        <span className="block text-xs" style={{ color: "var(--text-faint)" }}>Put in</span>
                        <Money cents={p.book} whole className="text-sm" />
                      </span>
                      <span>
                        <span className="block text-xs" style={{ color: "var(--text-faint)" }}>Worth now</span>
                        <Money cents={p.current} whole className="text-sm font-semibold" />
                      </span>
                      <span>
                        <span className="block text-xs" style={{ color: "var(--text-faint)" }}>Gain</span>
                        <Money cents={p.gain} tone="auto" sign whole className="text-sm" />
                        {pct && (
                          <span className="block text-xs" style={{ color: "var(--text-faint)" }}>{pct}</span>
                        )}
                      </span>
                    </span>
                  </Link>
                );
              })}

              {closed.length > 0 && (
                <details className="card p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    Closed ({closed.length})
                  </summary>
                  <div className="divide-line mt-3">
                    {closed.map((a) => (
                      <Link key={a.id} href={`/investments/${a.id}`} className="flex justify-between gap-3 py-2 text-sm">
                        <span>{a.name}</span>
                        <Money cents={positions.get(a.id)!.current} whole />
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="card min-w-0 self-start p-5">
              <CategoryBars
                title="By kind"
                slices={summary.byType.map((t) => ({ name: t.label, cents: t.cents }))}
                emptyLabel="Nothing is worth anything yet."
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
