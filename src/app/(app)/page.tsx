import Link from "next/link";

import { CategoryBars } from "@/components/charts/CategoryBars";
import { MonthlyFlow } from "@/components/charts/MonthlyFlow";
import { NetWorthTrend } from "@/components/charts/NetWorthTrend";
import { Money } from "@/components/Money";
import { PageHeader, Stat } from "@/components/PageHeader";
import { TxnRow } from "@/components/TxnRow";
import { netWorthSeries } from "@/lib/balances";
import { endOfMonth, formatMonth, lastMonths, startOfMonth } from "@/lib/date";
import {
  getHouseholdName,
  getPositions,
  getTransactions,
  monthlyIncomeExpense,
  sumByCategory,
  sumByMember,
  sumIncomeExpense,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const monthLong = new Intl.DateTimeFormat("en-IN", { month: "long" });

export default async function DashboardPage() {
  const now = new Date();
  const thisMonth = { from: startOfMonth(now), to: endOfMonth(now) };
  const months = lastMonths(12, now);

  const [name, positions, totals, categories, byMember, flow, recent] = await Promise.all([
    getHouseholdName(),
    getPositions(),
    sumIncomeExpense(thisMonth),
    sumByCategory("EXPENSE", thisMonth),
    sumByMember("EXPENSE", thisMonth),
    monthlyIncomeExpense(months),
    getTransactions({}, 8),
  ]);

  const { netWorth: nw, accounts, txns, valuations, accountsLite } = positions;
  // The trend starts at the month the first account was opened: before that the household's
  // money was not being tracked, and a run of zeros would read as having had nothing.
  const firstOpened = Math.min(...accounts.map((a) => startOfMonth(a.openingDate).getTime()));
  const trendMonths = months.filter((m) => m.end.getTime() >= firstOpened);
  // Month ends, except the current month, which is "today" so it matches the figures above.
  const points = trendMonths.map((m, i) => (i === trendMonths.length - 1 ? positions.asOf : m.end));
  const series = netWorthSeries(accountsLite, txns, valuations, points).map((w, i) => ({
    label: formatMonth(trendMonths[i].start),
    ...w,
  }));

  const saved = totals.income - totals.expense;
  const rate = totals.income > 0 ? Math.round((saved / totals.income) * 100) : null;
  const gain = nw.investments - nw.investedCost;

  if (accounts.length === 0) {
    return (
      <div>
        <PageHeader title={name} />
        <div className="card p-8 text-sm">
          <p className="font-medium">Start by adding where your money is.</p>
          <p className="mt-1" style={{ color: "var(--text-muted)" }}>
            Bank accounts, cash, investments, credit cards and loans. Then record income and
            expenses against them.
          </p>
          <Link href="/accounts/new" className="btn btn-primary mt-4">
            Add an account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={name} subtitle={`${monthLong.format(now)} at a glance`} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net worth" hint="everything owned, less everything owed">
          <Money cents={nw.total} tone={nw.total < 0 ? "debit" : "plain"} />
        </Stat>
        <Stat label="Bank & cash">
          <Money cents={nw.liquid} />
        </Stat>
        <Stat
          label="Investments"
          hint={
            gain !== 0 ? (
              <>
                <Money cents={gain} tone="auto" sign /> on <Money cents={nw.investedCost} /> put in
              </>
            ) : undefined
          }
        >
          <Money cents={nw.investments} />
        </Stat>
        <Stat label="Owed on cards & loans">
          <Money cents={-nw.liabilities} />
        </Stat>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Income in ${monthLong.format(now)}`}>
          <Money cents={totals.income} tone="credit" />
        </Stat>
        <Stat label={`Spent in ${monthLong.format(now)}`}>
          <Money cents={totals.expense} />
        </Stat>
        <Stat
          label="Saved"
          hint={rate !== null ? `${rate}% of income` : "no income recorded this month yet"}
        >
          <Money cents={saved} tone="auto" sign />
        </Stat>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card min-w-0 p-5">
          {series.length > 1 ? (
            <NetWorthTrend data={series} />
          ) : (
            <>
              <h2 className="text-base font-semibold">Net worth</h2>
              <p className="mt-6 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                The trend appears once there is more than one month to compare.
              </p>
            </>
          )}
        </div>
        <div className="card min-w-0 p-5">
          <MonthlyFlow
            data={flow.map((m) => ({ label: formatMonth(m.start), income: m.income, expense: m.expense }))}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card min-w-0 p-5">
          <CategoryBars
            title="Spending by category this month"
            slices={categories}
            emptyLabel="No spending recorded this month yet."
          />
        </div>
        <div className="card min-w-0 p-5">
          <CategoryBars
            title="Spending by member this month"
            slices={byMember}
            emptyLabel="No spending recorded this month yet."
          />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-base font-semibold">Recent entries</h2>
          <Link href="/transactions" className="link text-sm">
            All transactions
          </Link>
        </div>
        <div className="card overflow-hidden">
          {recent.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: "var(--text-faint)" }}>
              Nothing recorded yet.{" "}
              <Link className="link" href="/transactions/new">
                Add the first entry
              </Link>
              .
            </p>
          ) : (
            <div className="divide-line">
              {recent.map((t) => (
                <TxnRow key={t.id} t={t} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
