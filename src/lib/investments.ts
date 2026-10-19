import { accountGroup, accountTypeLabel, ACCOUNT_TYPES } from "./accounts";
import type { Position } from "./balances";

/**
 * The Investments section. An investment is an account in the INVESTMENT group, so balances,
 * valuations, net worth and the export all treat it like any other account; this module only
 * adds the investment-shaped view of it and the defaults its forms need. Pure, so tested.
 */

export const INVESTMENT_TYPES = ACCOUNT_TYPES.filter((t) => t.group === "INVESTMENT").map((t) => t.key);

export function isInvestment(type: string): boolean {
  return accountGroup(type) === "INVESTMENT";
}

/** Where an account's own page lives: investments have theirs in the Investments section. */
export function accountPath(account: { id: string; type: string }): string {
  return isInvestment(account.type) ? `/investments/${account.id}` : `/accounts/${account.id}`;
}

/**
 * The account a new investment is paid from, before anyone picks: the one the last
 * investment was paid from, while it is still an open bank or cash account, otherwise the
 * first open bank or cash account. Null when there is none to offer.
 */
export function pickFundingAccount(
  accounts: { id: string; type: string; isActive: boolean }[],
  lastUsedId: string | null,
): string | null {
  const usable = accounts.filter((a) => a.isActive && accountGroup(a.type) === "LIQUID");
  if (lastUsedId && usable.some((a) => a.id === lastUsedId)) return lastUsedId;
  return usable[0]?.id ?? null;
}

export interface InvestmentSummary {
  count: number;
  /** What went in, net of what came out. */
  invested: number;
  /** What it is all worth, by the latest value updates. */
  current: number;
  gain: number;
  /** Gain as a share of what went in, or null when nothing has gone in. */
  gainRatio: number | null;
  /** Current value by investment type, largest first. */
  byType: { type: string; label: string; cents: number }[];
}

export function summariseInvestments(
  accounts: { id: string; type: string }[],
  positions: Map<string, Position>,
): InvestmentSummary {
  let invested = 0;
  let current = 0;
  let count = 0;
  const byType = new Map<string, number>();
  for (const a of accounts) {
    if (!isInvestment(a.type)) continue;
    const p = positions.get(a.id);
    if (!p) continue;
    count++;
    invested += p.book;
    current += p.current;
    byType.set(a.type, (byType.get(a.type) ?? 0) + p.current);
  }
  return {
    count,
    invested,
    current,
    gain: current - invested,
    gainRatio: invested > 0 ? (current - invested) / invested : null,
    byType: [...byType]
      .map(([type, cents]) => ({ type, label: accountTypeLabel(type), cents }))
      .filter((t) => t.cents !== 0)
      .sort((a, b) => b.cents - a.cents),
  };
}

export interface InvestmentGroup<A> {
  type: string;
  label: string;
  items: A[];
  invested: number;
  current: number;
  gain: number;
  /** Gain as a share of what went in, or null when nothing has gone in. */
  gainRatio: number | null;
}

/**
 * Holdings grouped by kind, for the collapsed view: groups with the most money in them first,
 * and the biggest holdings first within each. Accounts that are not investments are skipped.
 */
export function groupInvestments<A extends { id: string; type: string }>(
  accounts: A[],
  positions: Map<string, Position>,
): InvestmentGroup<A>[] {
  const groups = new Map<string, InvestmentGroup<A>>();
  for (const a of accounts) {
    const p = positions.get(a.id);
    if (!p || !isInvestment(a.type)) continue;
    const g = groups.get(a.type) ?? {
      type: a.type,
      label: accountTypeLabel(a.type),
      items: [],
      invested: 0,
      current: 0,
      gain: 0,
      gainRatio: null,
    };
    g.items.push(a);
    g.invested += p.book;
    g.current += p.current;
    groups.set(a.type, g);
  }
  const worth = (a: A) => positions.get(a.id)!.current;
  return [...groups.values()]
    .map((g) => ({
      ...g,
      items: [...g.items].sort((x, y) => worth(y) - worth(x)),
      gain: g.current - g.invested,
      gainRatio: g.invested > 0 ? (g.current - g.invested) / g.invested : null,
    }))
    .sort((x, y) => y.current - x.current);
}

/** "+8.3%" from a ratio, or null. */
export function formatRatio(ratio: number | null): string | null {
  if (ratio === null) return null;
  return `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(1)}%`;
}
