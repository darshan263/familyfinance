import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { IconPlus } from "@/components/Icons";
import { Money } from "@/components/Money";
import { PageHeader, Stat } from "@/components/PageHeader";
import { accountGroup, accountTypeLabel, ACCOUNT_GROUPS, GROUP_LABELS, type AccountGroup } from "@/lib/accounts";
import { gainPercent, type Position } from "@/lib/balances";
import { formatDateCompact } from "@/lib/date";
import { getPositions } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

function PositionCell({ group, p }: { group: AccountGroup; p: Position }) {
  if (group === "LIABILITY") {
    return (
      <span className="text-right">
        <Money cents={-p.current} className="block font-semibold" />
        <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
          {p.current < 0 ? "owed" : p.current > 0 ? "in credit" : "nothing owed"}
        </span>
      </span>
    );
  }
  if (group === "INVESTMENT") {
    const pct = gainPercent(p);
    return (
      <span className="text-right">
        <Money cents={p.current} className="block font-semibold" />
        <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
          {p.valuedAt ? (
            <>
              <Money cents={p.gain} tone="auto" sign /> {pct && `(${pct})`}
            </>
          ) : (
            "not valued yet"
          )}
        </span>
      </span>
    );
  }
  return <Money cents={p.current} tone={p.current < 0 ? "debit" : "plain"} className="text-right font-semibold" />;
}

export default async function AccountsPage() {
  await requireUser();
  const { accounts, positions, netWorth } = await getPositions();

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Where the household's money is, what it is worth, and what is owed."
        actions={
          <Link href="/accounts/new" className="btn btn-primary">
            <IconPlus size={16} />
            Add account
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net worth">
          <Money cents={netWorth.total} tone={netWorth.total < 0 ? "debit" : "plain"} />
        </Stat>
        <Stat label="Bank & cash">
          <Money cents={netWorth.liquid} />
        </Stat>
        <Stat
          label="Investments"
          hint={
            netWorth.investedCost !== netWorth.investments ? (
              <>
                put in <Money cents={netWorth.investedCost} />
              </>
            ) : undefined
          }
        >
          <Money cents={netWorth.investments} />
        </Stat>
        <Stat label="Owed (cards & loans)">
          <Money cents={-netWorth.liabilities} />
        </Stat>
      </div>

      {accounts.length === 0 && (
        <div className="card p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No accounts yet. Add your bank accounts, cash, investments and any cards or loans.
        </div>
      )}

      <div className="flex flex-col gap-6">
        {ACCOUNT_GROUPS.map((group) => {
          const list = accounts.filter((a) => accountGroup(a.type) === group);
          if (list.length === 0) return null;
          const total = list.reduce((s, a) => s + (positions.get(a.id)?.current ?? 0), 0);
          return (
            <section key={group}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-lg">{GROUP_LABELS[group]}</h2>
                <Money
                  cents={group === "LIABILITY" ? -total : total}
                  className="text-sm font-medium"
                />
              </div>
              <div className="card divide-line overflow-hidden">
                {list.map((a) => {
                  const p = positions.get(a.id)!;
                  return (
                    <Link
                      key={a.id}
                      href={`/accounts/${a.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
                      style={a.isActive ? undefined : { opacity: 0.6 }}
                    >
                      <Avatar name={a.owner?.name ?? null} color={a.owner?.color} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {a.name}
                          {!a.isActive && <span className="chip ml-2">closed</span>}
                        </span>
                        <span className="block truncate text-xs" style={{ color: "var(--text-faint)" }}>
                          {accountTypeLabel(a.type)}
                          {a.institution ? ` · ${a.institution}` : ""}
                          {p.valuedAt ? ` · valued ${formatDateCompact(p.valuedAt)}` : ""}
                        </span>
                      </span>
                      <PositionCell group={group} p={p} />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
