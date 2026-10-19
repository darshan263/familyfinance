import { accountGroup, type AccountGroup } from "./accounts";
import { signedEffects, type TxnMovement } from "./txn";

/**
 * The balance engine: what every account holds or is worth, and what that adds up to.
 * Pure — no database, no clock — so every figure the app shows can be checked by a test.
 *
 * Two numbers per account:
 *
 *  - **book**: the opening balance plus every entry that touched the account. For a bank
 *    account that is the balance. For an investment it is the money put in, net of money
 *    taken out.
 *  - **current**: what it is worth. For bank and cash, the same as book. For investments and
 *    liabilities, the latest Valuation on or before the date, plus every entry dated after
 *    that valuation (a SIP made after the last statement is still money in the fund). With no
 *    valuation yet, current is book.
 *
 * Net worth is the sum of current values; liabilities are negative, so they subtract.
 *
 * Entries dated after `asOf` are not counted. Callers asking "what is there now" pass the
 * end of today, so an entry dated today counts and one dated next week waits for its date.
 *
 * The opening balance is the balance *on* the opening date, so it already contains everything
 * that happened before. An entry dated earlier would be counted twice; the server actions
 * refuse them (see `beforeOpening`), and the engine relies on that rather than second-guessing.
 */

export interface AccountLite {
  id: string;
  type: string;
  /** Signed: assets positive, money owed negative. */
  openingBalanceCents: number;
  openingDate: Date;
}

export interface TxnLite extends TxnMovement {
  date: Date;
  deletedAt?: Date | null;
}

export interface ValuationLite {
  accountId: string;
  date: Date;
  /** Same sign convention as the opening balance. */
  valueCents: number;
  /** When it was recorded. Breaks a tie between two valuations on the same date. */
  createdAt: Date;
}

export interface Position {
  book: number;
  current: number;
  /** current − book. Always zero for bank and cash. */
  gain: number;
  /** Date of the valuation `current` rests on, or null when it is the book figure. */
  valuedAt: Date | null;
}

interface Flow {
  date: number;
  delta: number;
}

/** Every account's flows, from the live entries only. */
function flowsByAccount(txns: TxnLite[]): Map<string, Flow[]> {
  const out = new Map<string, Flow[]>();
  for (const t of txns) {
    if (t.deletedAt) continue;
    for (const e of signedEffects(t)) {
      const list = out.get(e.accountId) ?? [];
      list.push({ date: t.date.getTime(), delta: e.deltaCents });
      out.set(e.accountId, list);
    }
  }
  return out;
}

function valuationsByAccount(valuations: ValuationLite[]): Map<string, ValuationLite[]> {
  const out = new Map<string, ValuationLite[]>();
  for (const v of valuations) {
    const list = out.get(v.accountId) ?? [];
    list.push(v);
    out.set(v.accountId, list);
  }
  return out;
}

function laterValuation(a: ValuationLite, b: ValuationLite): boolean {
  const byDate = a.date.getTime() - b.date.getTime();
  return byDate !== 0 ? byDate > 0 : a.createdAt.getTime() > b.createdAt.getTime();
}

/**
 * Whether `date` falls on a day before the account's opening date, compared as calendar days
 * so the time of day either was stored at cannot matter.
 */
export function beforeOpening(date: Date, account: { openingDate: Date }): boolean {
  const day = (d: Date) => d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
  return day(date) < day(account.openingDate);
}

function positionOf(
  account: AccountLite,
  flows: Flow[],
  valuations: ValuationLite[],
  asOf: number,
): Position {
  const opening = account.openingDate.getTime() <= asOf ? account.openingBalanceCents : 0;

  let book = opening;
  for (const f of flows) if (f.date <= asOf) book += f.delta;

  if (accountGroup(account.type) === "LIQUID") {
    return { book, current: book, gain: 0, valuedAt: null };
  }

  // The latest valuation on or before asOf. Two on the same date (a typo corrected the same
  // day) are settled by which was recorded last, never by the order the caller passed them in:
  // pages load valuations in different orders, and they must all agree.
  let latest: ValuationLite | null = null;
  for (const v of valuations) {
    if (v.date.getTime() > asOf) continue;
    if (!latest || laterValuation(v, latest)) latest = v;
  }

  if (!latest) return { book, current: book, gain: 0, valuedAt: null };

  // A valuation already includes everything dated on or before it; only later flows add.
  const since = latest.date.getTime();
  let current = latest.valueCents;
  for (const f of flows) if (f.date > since && f.date <= asOf) current += f.delta;

  return { book, current, gain: current - book, valuedAt: latest.date };
}

/** Every account's position on `asOf`. */
export function computePositions(
  accounts: AccountLite[],
  txns: TxnLite[],
  valuations: ValuationLite[],
  asOf: Date,
): Map<string, Position> {
  const flows = flowsByAccount(txns);
  const vals = valuationsByAccount(valuations);
  const at = asOf.getTime();
  const out = new Map<string, Position>();
  for (const a of accounts) {
    out.set(a.id, positionOf(a, flows.get(a.id) ?? [], vals.get(a.id) ?? [], at));
  }
  return out;
}

export interface NetWorth {
  /** Bank, cash and wallets. */
  liquid: number;
  /** Investments at current value. */
  investments: number;
  /** Investments at book value: what went in. */
  investedCost: number;
  /** Credit cards and loans. Zero or negative. */
  liabilities: number;
  total: number;
}

export function emptyNetWorth(): NetWorth {
  return { liquid: 0, investments: 0, investedCost: 0, liabilities: 0, total: 0 };
}

export function sumNetWorth(
  accounts: { id: string; type: string }[],
  positions: Map<string, Position>,
): NetWorth {
  const nw = emptyNetWorth();
  for (const a of accounts) {
    const p = positions.get(a.id);
    if (!p) continue;
    const group: AccountGroup = accountGroup(a.type);
    if (group === "LIQUID") nw.liquid += p.current;
    else if (group === "INVESTMENT") {
      nw.investments += p.current;
      nw.investedCost += p.book;
    } else nw.liabilities += p.current;
    nw.total += p.current;
  }
  return nw;
}

/** Net worth at each of `points`, e.g. month ends, for the trend chart. */
export function netWorthSeries(
  accounts: AccountLite[],
  txns: TxnLite[],
  valuations: ValuationLite[],
  points: Date[],
): NetWorth[] {
  const flows = flowsByAccount(txns);
  const vals = valuationsByAccount(valuations);
  return points.map((point) => {
    const at = point.getTime();
    const positions = new Map<string, Position>();
    for (const a of accounts) {
      positions.set(a.id, positionOf(a, flows.get(a.id) ?? [], vals.get(a.id) ?? [], at));
    }
    return sumNetWorth(accounts, positions);
  });
}

/**
 * One account's book balance after each of its entries, for the history on its page.
 *
 * `txns` must already be in date order, oldest first. It starts from the opening balance,
 * which is safe because no entry is allowed to predate it. The figure after the last entry
 * dated on or before a day equals `computePositions(…, endOfDay(that day)).book`.
 */
export function runningBalances(
  account: AccountLite,
  txns: (TxnLite & { id: string })[],
): Map<string, number> {
  const out = new Map<string, number>();
  let balance = account.openingBalanceCents;
  for (const t of txns) {
    if (t.deletedAt) continue;
    for (const e of signedEffects(t)) if (e.accountId === account.id) balance += e.deltaCents;
    out.set(t.id, balance);
  }
  return out;
}

/**
 * The adjustment that brings a bank or cash account to `target` on `date`: the difference
 * between what the bank says and the book balance at the end of that day. Zero means it
 * already matches. Entries dated later are not part of it; they still apply on top.
 */
export function adjustmentFor(
  account: AccountLite,
  txns: TxnLite[],
  date: Date,
  target: number,
): { book: number; diff: number } {
  const endOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  const book = computePositions([account], txns, [], endOfThatDay).get(account.id)!.book;
  return { book, diff: target - book };
}

/**
 * Income and expense per month, from rows that may include any kind: transfers and
 * adjustments are skipped here as well as by the query, so widening the query can never turn
 * a SIP into spending.
 */
export function bucketMonthly(
  rows: { kind: string; amountCents: number; date: Date }[],
  months: { start: Date; end: Date }[],
): { start: Date; income: number; expense: number }[] {
  return months.map(({ start, end }) => {
    let income = 0;
    let expense = 0;
    for (const r of rows) {
      if (r.date < start || r.date > end) continue;
      if (r.kind === "INCOME") income += r.amountCents;
      else if (r.kind === "EXPENSE") expense += r.amountCents;
    }
    return { start, income, expense };
  });
}

/**
 * Gain as a percentage of what went in, e.g. "+8.3%". Null until there is a valuation, and
 * whenever what went in is zero or less — which includes every card and loan, where a
 * percentage of a debt would mean nothing.
 */
export function gainPercent(p: Position): string | null {
  if (p.book <= 0 || p.valuedAt === null) return null;
  const pct = (p.gain / p.book) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
