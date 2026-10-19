import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { IconPlus } from "@/components/Icons";
import { Money } from "@/components/Money";
import { Notice } from "@/components/Notice";
import { PageHeader, Stat } from "@/components/PageHeader";
import { accountTypeLabel } from "@/lib/accounts";
import { gainPercent } from "@/lib/balances";
import { formatDateCompact } from "@/lib/date";
import { SHARED } from "@/lib/filters";
import { formatRatio, groupInvestments, isInvestment, summariseInvestments } from "@/lib/investments";
import { getPositions } from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { kind?: string; member?: string; open?: string };

/**
 * Investments, grouped by kind and collapsed: each group's header carries its totals, and the
 * holdings show only when it is opened. Quick filters narrow by kind and by whose it is. They
 * live in the URL, like the Transactions filters, so back, refresh and bookmarks keep them.
 */
export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser();
  const sp = await searchParams;
  const { accounts, positions } = await getPositions();
  const all = accounts.filter((a) => isInvestment(a.type));

  // Owner filter first: the kind chips then count what is left for that person.
  const owners = new Map<string, { id: string; name: string }>();
  for (const a of all) if (a.owner) owners.set(a.owner.id, { id: a.owner.id, name: a.owner.name });
  const hasJoint = all.some((a) => !a.ownerMemberId);
  const memberOk = !sp.member || sp.member === SHARED || owners.has(sp.member);
  const member = memberOk ? sp.member : undefined;
  const byMember = all.filter((a) =>
    !member ? true : member === SHARED ? !a.ownerMemberId : a.ownerMemberId === member,
  );

  const kindsHere = [...new Set(byMember.map((a) => a.type))];
  const kindOk = !sp.kind || kindsHere.includes(sp.kind) || all.some((a) => a.type === sp.kind);
  const kind = kindOk ? sp.kind : undefined;
  const shown = byMember.filter((a) => !kind || a.type === kind);

  const summary = summariseInvestments(shown, positions);
  const groups = groupInvestments(shown.filter((a) => a.isActive), positions);
  const closed = shown.filter((a) => !a.isActive);
  // Open everything when asked, when a kind is picked, or when there is only one group anyway.
  const expandAll = sp.open === "all" || Boolean(kind) || groups.length === 1;

  const href = (patch: Params) => {
    const p = new URLSearchParams();
    const next = { kind, member, open: sp.open, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/investments?${qs}` : "/investments";
  };
  const chipCount = (type: string) => byMember.filter((a) => a.type === type).length;

  const chip = (label: string, to: string, on: boolean, count?: number) => (
    <Link
      key={label}
      href={to}
      className="chip"
      style={on ? { background: "var(--accent)", color: "var(--accent-text)" } : undefined}
      aria-current={on ? "true" : undefined}
    >
      {label}
      {count !== undefined && <span style={{ opacity: 0.7 }}>{count}</span>}
    </Link>
  );

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

      {all.length === 0 ? (
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
          {(!memberOk || !kindOk) && (
            <Notice tone="warn">
              That filter no longer matches any investment (it may have been closed or deleted),
              so it was left out.
            </Notice>
          )}

          <section className="flex flex-col gap-2.5" aria-label="Quick filters">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold" style={{ color: "var(--text-faint)" }}>
                Kind
              </span>
              {chip("All", href({ kind: undefined }), !kind, byMember.length)}
              {kindsHere
                .sort((a, b) => accountTypeLabel(a).localeCompare(accountTypeLabel(b)))
                .map((t) => chip(accountTypeLabel(t), href({ kind: t }), kind === t, chipCount(t)))}
            </div>
            {owners.size + (hasJoint ? 1 : 0) > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold" style={{ color: "var(--text-faint)" }}>
                  Belongs to
                </span>
                {chip("Everyone", href({ member: undefined, kind: undefined }), !member)}
                {[...owners.values()].map((o) =>
                  chip(o.name, href({ member: o.id, kind: undefined }), member === o.id),
                )}
                {hasJoint && chip("Joint", href({ member: SHARED, kind: undefined }), member === SHARED)}
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="Worth now" hint={kind || member ? `${shown.length} of ${all.length} investments` : undefined}>
              <Money cents={summary.current} whole />
            </Stat>
            <Stat label="Put in">
              <Money cents={summary.invested} whole />
            </Stat>
            <Stat
              label="Gain"
              hint={summary.gainRatio !== null ? `${formatRatio(summary.gainRatio)} on what went in` : undefined}
            >
              <Money cents={summary.gain} tone="auto" sign whole />
            </Stat>
          </section>

          <section className={kind ? "" : "grid gap-6 lg:grid-cols-[2fr_1fr]"}>
            <div className="flex flex-col gap-3">
              {groups.length > 1 && (
                <div className="flex justify-end">
                  <Link
                    href={href({ open: sp.open === "all" ? undefined : "all" })}
                    className="text-xs font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {sp.open === "all" ? "Collapse all" : "Expand all"}
                  </Link>
                </div>
              )}

              {groups.length === 0 && closed.length === 0 && (
                <p className="card p-6 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                  Nothing matches these filters.
                </p>
              )}

              {groups.map((g) => (
                <details key={g.type} className="group card overflow-hidden" open={expandAll}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 hover:bg-[var(--bg-hover)] sm:flex-nowrap [&::-webkit-details-marker]:hidden">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="shrink-0 transition-transform group-open:rotate-90"
                      style={{ color: "var(--text-faint)" }}
                      aria-hidden="true"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="figure block text-lg leading-tight">{g.label}</span>
                      <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
                        {g.items.length} {g.items.length === 1 ? "holding" : "holdings"}
                      </span>
                    </span>
                    <Figures invested={g.invested} current={g.current} gain={g.gain} pct={g.gain !== 0 ? formatRatio(g.gainRatio) : null} bold />
                  </summary>

                  <div className="divide-line border-t">
                    {g.items.map((a) => {
                      const p = positions.get(a.id)!;
                      return (
                        <Link
                          key={a.id}
                          href={`/investments/${a.id}`}
                          className="flex flex-wrap items-center gap-3 py-3 pr-4 pl-11 transition-colors hover:bg-[var(--bg-hover)] sm:flex-nowrap"
                        >
                          <Avatar name={a.owner?.name ?? null} color={a.owner?.color} size={30} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{a.name}</span>
                            <span className="block truncate text-xs" style={{ color: "var(--text-faint)" }}>
                              {a.institution ? `${a.institution} · ` : ""}
                              {p.valuedAt ? `valued ${formatDateCompact(p.valuedAt)}` : "not valued yet"}
                            </span>
                          </span>
                          <Figures invested={p.book} current={p.current} gain={p.gain} pct={gainPercent(p)} />
                        </Link>
                      );
                    })}
                  </div>
                </details>
              ))}

              {closed.length > 0 && (
                <details className="group card overflow-hidden">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform group-open:rotate-90" style={{ color: "var(--text-faint)" }} aria-hidden="true">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    Closed ({closed.length})
                  </summary>
                  <div className="divide-line border-t">
                    {closed.map((a) => (
                      <Link key={a.id} href={`/investments/${a.id}`} className="flex justify-between gap-3 py-2.5 pr-4 pl-11 text-sm hover:bg-[var(--bg-hover)]">
                        <span>
                          {a.name}
                          <span className="ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
                            {accountTypeLabel(a.type)}
                          </span>
                        </span>
                        <Money cents={positions.get(a.id)!.current} whole />
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {!kind && (
              <div className="card min-w-0 self-start p-5">
                <CategoryBars
                  title="By kind"
                  slices={summary.byType.map((t) => ({ name: t.label, cents: t.cents }))}
                  emptyLabel="Nothing is worth anything yet."
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Put in · worth now · gain, right-aligned, the same for a group header and a holding. */
function Figures({
  invested,
  current,
  gain,
  pct,
  bold = false,
}: {
  invested: number;
  current: number;
  gain: number;
  pct: string | null;
  bold?: boolean;
}) {
  const label = (text: string) => (
    <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
      {text}
    </span>
  );
  return (
    <span className="grid w-full grid-cols-3 gap-4 text-right sm:w-[22rem]">
      <span>
        {label("Put in")}
        <Money cents={invested} whole className="text-sm" />
      </span>
      <span>
        {label("Worth now")}
        <Money cents={current} whole className={`text-sm ${bold ? "font-bold" : "font-semibold"}`} />
      </span>
      <span>
        {label("Gain")}
        <Money cents={gain} tone="auto" sign whole className="text-sm" />
        {pct && (
          <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
            {pct}
          </span>
        )}
      </span>
    </span>
  );
}
