import Link from "next/link";

import { CategoryBars } from "@/components/charts/CategoryBars";
import { MonthlyFlow } from "@/components/charts/MonthlyFlow";
import { IconDownload } from "@/components/Icons";
import { Money } from "@/components/Money";
import { Notice } from "@/components/Notice";
import { PageHeader, Stat } from "@/components/PageHeader";
import { accountGroup, accountTypeLabel } from "@/lib/accounts";
import { gainPercent } from "@/lib/balances";
import { formatDate, formatMonth, monthsBetween, toDateInput } from "@/lib/date";
import { PERIODS, resolvePeriod } from "@/lib/period";
import {
  getEarliestEntryDate,
  getPositions,
  monthlyIncomeExpense,
  sumByCategory,
  sumByMember,
  sumIncomeExpense,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Past two years of bars, the chart stops being readable; the totals still cover it all. */
const MAX_MONTHS = 24;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const filter = { from: period.from, to: period.to };

  const [totals, expenseCats, incomeCats, expenseMembers, incomeMembers, earliest, positions] =
    await Promise.all([
      sumIncomeExpense(filter),
      sumByCategory("EXPENSE", filter),
      sumByCategory("INCOME", filter),
      sumByMember("EXPENSE", filter),
      sumByMember("INCOME", filter),
      getEarliestEntryDate(),
      getPositions(),
    ]);

  const chartFrom = period.from ?? earliest ?? new Date();
  const chartTo = period.to && period.to < new Date() ? period.to : new Date();
  const allMonths = chartFrom <= chartTo ? monthsBetween(chartFrom, chartTo) : [];
  const months = allMonths.slice(-MAX_MONTHS);
  const flow = await monthlyIncomeExpense(months);

  const saved = totals.income - totals.expense;
  const rate = totals.income > 0 ? Math.round((saved / totals.income) * 100) : null;

  // Export exactly this period, by explicit dates, so the file names its own range.
  const exportParams = new URLSearchParams();
  if (period.from) exportParams.set("from", toDateInput(period.from));
  if (period.to) exportParams.set("to", toDateInput(period.to));
  if (!period.from && !period.to) exportParams.set("range", "all");

  const investments = positions.accounts.filter((a) => accountGroup(a.type) === "INVESTMENT");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        subtitle={<>Income and spending for {period.label}</>}
        actions={
          <>
            <a className="btn btn-secondary" href={`/api/export?format=xlsx&${exportParams}`}>
              <IconDownload size={16} />
              Export Excel
            </a>
            <a className="btn btn-secondary" href={`/api/export?format=csv&${exportParams}`}>
              Export CSV
            </a>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/reports?period=${p.key}`}
              className="chip"
              style={period.key === p.key ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input name="from" type="date" className="input w-auto" defaultValue={sp.from ?? ""} aria-label="From date" />
          <span className="text-sm" style={{ color: "var(--text-faint)" }}>
            to
          </span>
          <input name="to" type="date" className="input w-auto" defaultValue={sp.to ?? ""} aria-label="To date" />
          <button className="btn btn-secondary btn-sm" type="submit">
            Show
          </button>
        </form>
        {period.unusable.length > 0 && (
          <Notice tone="warn">
            {period.unusable.map((u) => `“${u}”`).join(" and ")} could not be read as a date and was
            ignored.
          </Notice>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Income">
          <Money cents={totals.income} tone="credit" />
        </Stat>
        <Stat label="Expense">
          <Money cents={totals.expense} />
        </Stat>
        <Stat label="Saved">
          <Money cents={saved} tone="auto" sign />
        </Stat>
        <Stat label="Savings rate" hint="saved as a share of income">
          {rate !== null ? `${rate}%` : "—"}
        </Stat>
      </section>

      {months.length > 1 && (
        <div className="card min-w-0 p-5">
          <MonthlyFlow
            data={flow.map((m) => ({ label: formatMonth(m.start), income: m.income, expense: m.expense }))}
          />
          {allMonths.length > months.length && (
            <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
              The chart shows the latest {MAX_MONTHS} months; the totals cover the whole period.
            </p>
          )}
        </div>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card min-w-0 p-5">
          <CategoryBars title="Expense by category" slices={expenseCats} emptyLabel="No expenses in this period." />
        </div>
        <div className="card min-w-0 p-5">
          <CategoryBars title="Income by category" slices={incomeCats} emptyLabel="No income in this period." />
        </div>
        <div className="card min-w-0 p-5">
          <CategoryBars title="Expense by member" slices={expenseMembers} emptyLabel="No expenses in this period." />
        </div>
        <div className="card min-w-0 p-5">
          <CategoryBars title="Income by member" slices={incomeMembers} emptyLabel="No income in this period." />
        </div>
      </section>

      <section>
        <div className="mb-2 px-1">
          <h2 className="text-base font-semibold">Investments today</h2>
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            As of today, whatever period is picked above.
          </p>
        </div>
        <div className="card overflow-x-auto">
          {investments.length === 0 ? (
            <p className="p-6 text-center text-sm" style={{ color: "var(--text-faint)" }}>
              No investment accounts yet.
            </p>
          ) : (
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 text-right font-medium">Put in</th>
                  <th className="px-4 py-2.5 text-right font-medium">Worth now</th>
                  <th className="px-4 py-2.5 text-right font-medium">Gain</th>
                  <th className="px-4 py-2.5 font-medium">Last valued</th>
                </tr>
              </thead>
              <tbody className="divide-line">
                {investments.map((a) => {
                  const p = positions.positions.get(a.id)!;
                  const pct = gainPercent(p);
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-2.5">
                        <Link className="link" href={`/accounts/${a.id}`}>
                          {a.name}
                        </Link>
                        <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
                          {accountTypeLabel(a.type)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Money cents={p.book} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Money cents={p.current} className="font-medium" />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Money cents={p.gain} tone="auto" sign />
                        {pct && (
                          <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
                            {pct}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                        {p.valuedAt ? formatDate(p.valuedAt) : "never"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
