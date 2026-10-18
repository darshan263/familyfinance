import "server-only";

import type { Prisma } from "@prisma/client";

import {
  computePositions,
  sumNetWorth,
  type AccountLite,
  type TxnLite,
  type ValuationLite,
} from "./balances";
import { endOfDay } from "./date";
import { prisma } from "./db";
import { sumToPaise } from "./money";
import type { TxnKind } from "./txn";

export const SETTING_KEYS = {
  householdName: "household.name",
} as const;

export async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getHouseholdName(): Promise<string> {
  return getSetting(SETTING_KEYS.householdName, "Our Home");
}

export async function getMembers(includeInactive = false) {
  return prisma.member.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAccounts(includeInactive = false) {
  return prisma.account.findMany({
    where: includeInactive ? {} : { isActive: true },
    include: { owner: true },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
  });
}

export type AccountWithOwner = Awaited<ReturnType<typeof getAccounts>>[number];

export async function getCategories(opts: { kind?: "EXPENSE" | "INCOME"; includeInactive?: boolean } = {}) {
  return prisma.category.findMany({
    where: {
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ kind: "asc" }, { sort: "asc" }, { name: "asc" }],
  });
}

/** `memberId: "shared"` means entries with no member. */
export const SHARED = "shared";

export interface TxnFilter {
  from?: Date;
  to?: Date;
  kinds?: TxnKind[];
  /** Entries that touch this account, from either side of a transfer. */
  accountId?: string;
  categoryId?: string;
  memberId?: string;
  search?: string;
}

function whereFromFilter(filter: TxnFilter): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { deletedAt: null };
  if (filter.from || filter.to) {
    where.date = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }
  if (filter.kinds?.length) where.kind = { in: filter.kinds };
  if (filter.accountId) {
    where.OR = [{ accountId: filter.accountId }, { toAccountId: filter.accountId }];
  }
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.memberId) where.memberId = filter.memberId === SHARED ? null : filter.memberId;
  return where;
}

/**
 * Text search runs here rather than in the query. Postgres `contains` is case-sensitive
 * without a provider-specific mode, and searching should also match the category and account
 * names, which live on other tables. A household's entries in any sensible range are few
 * enough that this costs nothing.
 */
function matchesSearch(
  t: {
    description: string;
    notes: string | null;
    category: { name: string } | null;
    account: { name: string };
    toAccount: { name: string } | null;
    member: { name: string } | null;
  },
  needle: string,
): boolean {
  return [t.description, t.notes, t.category?.name, t.account.name, t.toAccount?.name, t.member?.name]
    .filter((s): s is string => Boolean(s))
    .some((s) => s.toLowerCase().includes(needle));
}

export async function getTransactions(filter: TxnFilter = {}, take?: number) {
  const rows = await prisma.transaction.findMany({
    where: whereFromFilter(filter),
    include: { account: true, toAccount: true, category: true, member: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const needle = filter.search?.trim().toLowerCase();
  const matched = needle ? rows.filter((t) => matchesSearch(t, needle)) : rows;
  return take ? matched.slice(0, take) : matched;
}

export type TxnWithDetail = Awaited<ReturnType<typeof getTransactions>>[number];

/** Everything the balance engine needs, for every account, live entries only. */
export async function getLedgerInputs() {
  const [accounts, txns, valuations] = await Promise.all([
    prisma.account.findMany({
      include: { owner: true },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    }),
    prisma.transaction.findMany({
      where: { deletedAt: null },
      select: { kind: true, amountCents: true, accountId: true, toAccountId: true, date: true },
    }),
    prisma.valuation.findMany({
      select: { accountId: true, date: true, valueCents: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const accountsLite: AccountLite[] = accounts;
  const txnsLite: TxnLite[] = txns;
  const valuationsLite: ValuationLite[] = valuations;
  return { accounts, accountsLite, txns: txnsLite, valuations: valuationsLite };
}

/** Every account's position today, and the net worth they add up to. */
export async function getPositions(asOf = endOfDay()) {
  const inputs = await getLedgerInputs();
  const positions = computePositions(inputs.accountsLite, inputs.txns, inputs.valuations, asOf);
  return { ...inputs, asOf, positions, netWorth: sumNetWorth(inputs.accounts, positions) };
}

/** Income and expense totals for a filter. Transfers and adjustments never count. */
export async function sumIncomeExpense(filter: Omit<TxnFilter, "kinds" | "search"> = {}) {
  const groups = await prisma.transaction.groupBy({
    by: ["kind"],
    where: whereFromFilter({ ...filter, kinds: ["INCOME", "EXPENSE"] }),
    _sum: { amountCents: true },
  });
  const total = (kind: string) => sumToPaise(groups.find((g) => g.kind === kind)?._sum.amountCents);
  return { income: total("INCOME"), expense: total("EXPENSE") };
}

export interface Slice {
  id: string | null;
  name: string;
  cents: number;
  color?: string;
}

/** Totals for one kind, by category, largest first. */
export async function sumByCategory(
  kind: "INCOME" | "EXPENSE",
  filter: Omit<TxnFilter, "kinds" | "search"> = {},
): Promise<Slice[]> {
  const [groups, categories] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: whereFromFilter({ ...filter, kinds: [kind] }),
      _sum: { amountCents: true },
    }),
    prisma.category.findMany(),
  ]);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return groups
    .map((g) => ({
      id: g.categoryId,
      name: g.categoryId ? (names.get(g.categoryId) ?? "Unknown") : "Uncategorised",
      cents: sumToPaise(g._sum.amountCents),
    }))
    .filter((s) => s.cents !== 0)
    .sort((a, b) => b.cents - a.cents);
}

/** Totals for one kind, by member, with Shared as its own row. */
export async function sumByMember(
  kind: "INCOME" | "EXPENSE",
  filter: Omit<TxnFilter, "kinds" | "search"> = {},
): Promise<Slice[]> {
  const [groups, members] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["memberId"],
      where: whereFromFilter({ ...filter, kinds: [kind] }),
      _sum: { amountCents: true },
    }),
    prisma.member.findMany(),
  ]);
  const byId = new Map(members.map((m) => [m.id, m]));
  return groups
    .map((g) => {
      const m = g.memberId ? byId.get(g.memberId) : undefined;
      return {
        id: g.memberId,
        name: g.memberId ? (m?.name ?? "Unknown") : "Shared",
        color: m?.color,
        cents: sumToPaise(g._sum.amountCents),
      };
    })
    .filter((s) => s.cents !== 0)
    .sort((a, b) => b.cents - a.cents);
}

/** Income and expense per month, for the bar chart. */
export async function monthlyIncomeExpense(months: { start: Date; end: Date }[]) {
  if (months.length === 0) return [];
  const rows = await prisma.transaction.findMany({
    where: whereFromFilter({
      from: months[0].start,
      to: months[months.length - 1].end,
      kinds: ["INCOME", "EXPENSE"],
    }),
    select: { kind: true, amountCents: true, date: true },
  });
  return months.map(({ start, end }) => {
    let income = 0;
    let expense = 0;
    for (const r of rows) {
      if (r.date < start || r.date > end) continue;
      if (r.kind === "INCOME") income += r.amountCents;
      else expense += r.amountCents;
    }
    return { start, income, expense };
  });
}

export async function getEarliestEntryDate(): Promise<Date | null> {
  const row = await prisma.transaction.findFirst({
    where: { deletedAt: null },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  return row?.date ?? null;
}

export async function logActivity(action: string, summary: string) {
  await prisma.activity.create({ data: { action, summary } });
}

export async function getRecentActivity(take = 20) {
  return prisma.activity.findMany({ orderBy: { createdAt: "desc" }, take });
}
