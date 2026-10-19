import Link from "next/link";

import { IconDownload, IconPlus } from "@/components/Icons";
import { Money } from "@/components/Money";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { TxnRow } from "@/components/TxnRow";
import { readDayParam } from "@/lib/date";
import { getAccounts, getCategories, getMembers, getTransactions, SHARED } from "@/lib/queries";
import { RANGES, resolveRange } from "@/lib/range";
import { isTxnKind, KIND_LABELS, TXN_KINDS } from "@/lib/txn";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Several months of a household's entries in one window; past it the page says so. */
const SHOW_AT_MOST = 500;

type Params = {
  range?: string;
  from?: string;
  to?: string;
  kind?: string;
  account?: string;
  category?: string;
  member?: string;
  q?: string;
  saved?: string;
  deleted?: string;
};

const FILTER_KEYS = ["kind", "account", "category", "member", "q"] as const;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser();
  const sp = await searchParams;
  const range = resolveRange(sp);

  const [accounts, categories, members] = await Promise.all([
    getAccounts(true),
    getCategories({ includeInactive: true }),
    getMembers(true),
  ]);

  // A filter naming something that no longer exists (an old bookmark, a deleted category) is
  // dropped and reported, the same as a bad date. Applied, it would empty the list while the
  // dropdown, unable to show the value, read "All" — the list would look broken.
  const known = {
    kind: (v: string) => isTxnKind(v),
    account: (v: string) => accounts.some((a) => a.id === v),
    category: (v: string) => categories.some((c) => c.id === v),
    member: (v: string) => v === SHARED || members.some((m) => m.id === v),
  };
  const ignored: string[] = [];
  const active: Partial<Record<(typeof FILTER_KEYS)[number], string>> = {};
  for (const k of FILTER_KEYS) {
    const v = sp[k];
    if (!v) continue;
    if (k !== "q" && !known[k](v)) ignored.push(k);
    else active[k] = v;
  }
  const kind = active.kind && isTxnKind(active.kind) ? active.kind : undefined;

  const all = await getTransactions({
    from: range.from,
    to: range.to,
    kinds: kind ? [kind] : undefined,
    accountId: active.account,
    categoryId: active.category,
    memberId: active.member,
    search: active.q,
  });

  const shown = all.slice(0, SHOW_AT_MOST);
  const income = all.filter((t) => t.kind === "INCOME").reduce((a, t) => a + t.amountCents, 0);
  const expense = all.filter((t) => t.kind === "EXPENSE").reduce((a, t) => a + t.amountCents, 0);

  const badDates = [readDayParam(sp.from), readDayParam(sp.to, "end")]
    .filter((p) => p.given && !p.date)
    .map((p) => `“${p.raw}”`);

  // The current filters without the window, for the chip links; with it, for export.
  const filters = new URLSearchParams();
  for (const k of FILTER_KEYS) if (active[k]) filters.set(k, active[k]!);
  const chipHref = (key: string) => {
    const p = new URLSearchParams(filters);
    p.set("range", key);
    return `/transactions?${p}`;
  };
  const exportParams = new URLSearchParams(filters);
  if (range.key) exportParams.set("range", range.key);
  if (range.from && !range.key) exportParams.set("from", sp.from!);
  if (range.to && !range.key) exportParams.set("to", sp.to!);

  const anyFilter = FILTER_KEYS.some((k) => sp[k]);

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={
          <>
            {all.length} {all.length === 1 ? "entry" : "entries"} · {range.label}
            {range.implicit && " (the default window; pick another below)"}
          </>
        }
        actions={
          <>
            <a className="btn btn-secondary" href={`/api/export?format=xlsx&${exportParams}`}>
              <IconDownload size={16} />
              Excel
            </a>
            <a className="btn btn-secondary" href={`/api/export?format=csv&${exportParams}`}>
              CSV
            </a>
            <Link className="btn btn-primary" href="/transactions/new">
              <IconPlus size={16} />
              Add entry
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        {sp.saved === "1" && <Notice tone="ok">Saved.</Notice>}
        {sp.deleted === "1" && <Notice tone="ok">Deleted. It no longer counts towards any balance or report.</Notice>}
        {sp.deleted === "missing" && <Notice tone="warn">That entry was already deleted.</Notice>}
        {sp.deleted === "failed" && <Notice tone="warn">Nothing was deleted: the request did not say which entry.</Notice>}
        {ignored.length > 0 && (
          <Notice tone="warn">
            The {ignored.join(" and ")} filter in this link no longer matches anything (it may have
            been deleted), so it was left out.
          </Notice>
        )}
        {badDates.length > 0 && (
          <Notice tone="warn">
            {badDates.join(" and ")} {badDates.length > 1 ? "are not dates" : "is not a date"}, so it was
            ignored and the list shows {range.label}.
          </Notice>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {RANGES.map((r) => {
          const on = range.key === r.key;
          return (
            <Link
              key={r.key}
              href={chipHref(r.key)}
              title={r.hint}
              className="chip"
              style={on ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      <form method="get" className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {range.key && <input type="hidden" name="range" value={range.key} />}
        <select name="kind" className="select" defaultValue={kind ?? ""} aria-label="Kind">
          <option value="">All kinds</option>
          {TXN_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <select name="account" className="select" defaultValue={active.account ?? ""} aria-label="Account">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.isActive ? "" : " (closed)"}
            </option>
          ))}
        </select>
        <select name="category" className="select" defaultValue={active.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {(["EXPENSE", "INCOME"] as const).map((k) => (
            <optgroup key={k} label={KIND_LABELS[k]}>
              {categories
                .filter((c) => c.kind === k)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select name="member" className="select" defaultValue={active.member ?? ""} aria-label="Member">
          <option value="">Everyone</option>
          <option value={SHARED}>Shared only</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input name="q" className="input sm:col-span-2" placeholder="Search description, notes, category…" defaultValue={sp.q ?? ""} />
        <div className="flex gap-2 sm:col-span-2">
          <input name="from" type="date" className="input" defaultValue={sp.from ?? ""} aria-label="From date" />
          <input name="to" type="date" className="input" defaultValue={sp.to ?? ""} aria-label="To date" />
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="btn btn-primary btn-sm">
            Apply filters
          </button>
          {(anyFilter || sp.from || sp.to) && (
            <Link href="/transactions" className="btn btn-ghost btn-sm">
              Clear all
            </Link>
          )}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Income <Money cents={income} tone="credit" className="font-semibold" />
        </span>
        <span>
          Expense <Money cents={expense} className="font-semibold" />
        </span>
        <span style={{ color: "var(--text-faint)" }}>Transfers are listed but counted in neither.</span>
      </div>

      <div className="card overflow-hidden">
        {shown.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--text-faint)" }}>
            No entries match. Try a wider window or clear the filters.
          </p>
        ) : (
          <div className="divide-line list-long">
            {shown.map((t) => (
              <TxnRow key={t.id} t={t} viewingAccountId={active.account} />
            ))}
          </div>
        )}
      </div>
      {all.length > shown.length && (
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          Showing the latest {SHOW_AT_MOST} of {all.length}. The totals above cover all of them;
          narrow the window to see the rest, or export.
        </p>
      )}
    </div>
  );
}
