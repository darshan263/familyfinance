/**
 * Checks on the balance engine and the guards around it. Run with `npm test`.
 *
 * The engine: what each kind of entry does to which account, book value versus current
 * value for investments, liabilities, net worth and its history. The guards: what a submitted
 * entry is allowed to be, the money boundary, dates, report periods, the sign-in throttle and
 * redirect targets.
 *
 * Run with `--conditions=react-server` so `server-only` modules can be imported; everything
 * here is a pure library, with no database or request in sight.
 */

import assert from "node:assert/strict";

import ExcelJS from "exceljs";

import { readFileSync } from "node:fs";

import {
  accountGroup,
  ACCOUNT_TYPES,
  crossesSign,
  toEnteredBalance,
  toStoredBalance,
} from "../src/lib/accounts";
import { safeNext } from "../src/lib/auth";
import {
  adjustmentFor,
  beforeOpening,
  bucketMonthly,
  computePositions,
  gainPercent,
  netWorthSeries,
  runningBalances,
  sumNetWorth,
  type AccountLite,
  type TxnLite,
  type ValuationLite,
} from "../src/lib/balances";
import { csvCell, toCsv } from "../src/lib/csv";
import { endOfDay, monthsBetween, parseDay } from "../src/lib/date";
import { SHARED, whereFromFilter } from "../src/lib/filters";
import { moneyField } from "../src/lib/forms";
import { accountPath, INVESTMENT_TYPES, pickFundingAccount, summariseInvestments } from "../src/lib/investments";
import { formatMoney, MAX_AMOUNT_CENTS, parseAmount, sumToPaise, toPaise } from "../src/lib/money";
import { fyLabel, fyStartYear, periodBounds, resolvePeriod } from "../src/lib/period";
import { DEFAULT_RANGE, rangeBounds, resolveRange } from "../src/lib/range";
import { hit, memoryStore, reset } from "../src/lib/rate-limit";
import { isReportable, readTxnForm, signedEffects, txnColumns } from "../src/lib/txn";
import { buildWorkbook, toRupees } from "../src/lib/workbook";

type Case =
  | { kind: "section"; label: string }
  | { kind: "test"; name: string; fn: () => void | Promise<void> };

const cases: Case[] = [];
let passed = 0;

function section(label: string) {
  cases.push({ kind: "section", label });
}

function test(name: string, fn: () => void | Promise<void>) {
  cases.push({ kind: "test", name, fn });
}

async function run() {
  for (const c of cases) {
    if (c.kind === "section") {
      console.log(`\n${c.label}`);
      continue;
    }
    try {
      await c.fn();
      passed++;
      console.log(`  ok   ${c.name}`);
    } catch (err) {
      console.error(`  FAIL ${c.name}`);
      console.error(`       ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${process.exitCode ? "SOME CHECKS FAILED" : `All ${passed} checks passed.`}\n`);
}

const rupees = (n: number) => Math.round(n * 100);
const day = (s: string) => parseDay(s, "midday")!;

const SAVINGS: AccountLite = {
  id: "sav",
  type: "SAVINGS",
  openingBalanceCents: rupees(50_000),
  openingDate: day("2026-01-01"),
};
const CARD: AccountLite = {
  id: "card",
  type: "CREDIT_CARD",
  openingBalanceCents: 0,
  openingDate: day("2026-01-01"),
};
const FUND: AccountLite = {
  id: "mf",
  type: "MUTUAL_FUND",
  openingBalanceCents: rupees(1_00_000),
  openingDate: day("2026-01-01"),
};
const ALL = [SAVINGS, CARD, FUND];

function income(id: string, accountId: string, amount: number, date: string): TxnLite & { id: string } {
  return { id, kind: "INCOME", amountCents: rupees(amount), accountId, toAccountId: null, date: day(date) };
}
function expense(id: string, accountId: string, amount: number, date: string): TxnLite & { id: string } {
  return { id, kind: "EXPENSE", amountCents: rupees(amount), accountId, toAccountId: null, date: day(date) };
}
function transfer(
  id: string,
  from: string,
  to: string,
  amount: number,
  date: string,
): TxnLite & { id: string } {
  return { id, kind: "TRANSFER", amountCents: rupees(amount), accountId: from, toAccountId: to, date: day(date) };
}

/** A valuation; `recordedAt` defaults to its own date, to break same-date ties explicitly. */
function val(accountId: string, date: string, valueCents: number, recordedAt?: Date): ValuationLite {
  return { accountId, date: day(date), valueCents, createdAt: recordedAt ?? day(date) };
}

const NOW = endOfDay(day("2026-10-18"));

function positionsAt(txns: TxnLite[], valuations: ValuationLite[] = [], asOf = NOW) {
  const positions = computePositions(ALL, txns, valuations, asOf);
  return { positions, nw: sumNetWorth(ALL, positions) };
}

// --------------------------------------------------------------------------------------
section("What each kind of entry does");

test("income adds to the account it lands in", () => {
  assert.deepEqual(signedEffects(income("t", "sav", 100, "2026-02-01")), [
    { accountId: "sav", deltaCents: 10000 },
  ]);
});

test("an expense takes from the account it was paid from", () => {
  assert.deepEqual(signedEffects(expense("t", "sav", 100, "2026-02-01")), [
    { accountId: "sav", deltaCents: -10000 },
  ]);
});

test("a transfer moves money and creates or destroys none", () => {
  const effects = signedEffects(transfer("t", "sav", "mf", 100, "2026-02-01"));
  assert.equal(effects.reduce((a, e) => a + e.deltaCents, 0), 0);
  assert.deepEqual(effects, [
    { accountId: "sav", deltaCents: -10000 },
    { accountId: "mf", deltaCents: 10000 },
  ]);
});

test("an adjustment applies its own sign", () => {
  const t = { kind: "ADJUSTMENT", amountCents: -2500, accountId: "sav", toAccountId: null };
  assert.deepEqual(signedEffects(t), [{ accountId: "sav", deltaCents: -2500 }]);
});

test("an unknown kind is refused rather than moving nothing", () => {
  assert.throws(() => signedEffects({ kind: "REFUND", amountCents: 1, accountId: "a", toAccountId: null }));
});

test("a transfer with no destination is refused", () => {
  assert.throws(() => signedEffects({ kind: "TRANSFER", amountCents: 1, accountId: "a", toAccountId: null }));
});

test("only income and expense are reportable", () => {
  assert.deepEqual(
    ["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"].map(isReportable),
    [true, true, false, false],
  );
});

// --------------------------------------------------------------------------------------
section("Balances and net worth");

test("a bank balance is opening plus flows", () => {
  const { positions } = positionsAt([
    income("a", "sav", 80_000, "2026-02-01"),
    expense("b", "sav", 12_000, "2026-02-03"),
  ]);
  const p = positions.get("sav")!;
  assert.equal(p.book, rupees(1_18_000));
  assert.equal(p.current, p.book, "bank accounts are worth their balance");
  assert.equal(p.gain, 0);
});

test("a SIP is a transfer: net worth unchanged", () => {
  const before = positionsAt([]).nw.total;
  const after = positionsAt([transfer("sip", "sav", "mf", 10_000, "2026-03-05")]).nw.total;
  assert.equal(after, before);
});

test("a card expense is owed, and paying the bill clears it without counting twice", () => {
  const spent = positionsAt([expense("e", "card", 4_000, "2026-03-10")]);
  assert.equal(spent.positions.get("card")!.current, -rupees(4_000), "the card now owes 4,000");
  assert.equal(spent.nw.liabilities, -rupees(4_000));
  assert.equal(spent.nw.total, rupees(1_50_000 - 4_000));

  const paid = positionsAt([
    expense("e", "card", 4_000, "2026-03-10"),
    transfer("bill", "sav", "card", 4_000, "2026-04-02"),
  ]);
  assert.equal(paid.positions.get("card")!.current, 0, "the bill clears the card");
  assert.equal(paid.nw.total, spent.nw.total, "paying the bill does not change net worth");
});

test("an investment with no valuation is worth what went in", () => {
  const { positions } = positionsAt([transfer("sip", "sav", "mf", 10_000, "2026-03-05")]);
  const p = positions.get("mf")!;
  assert.equal(p.book, rupees(1_10_000));
  assert.equal(p.current, p.book);
  assert.equal(p.valuedAt, null);
});

test("current value is the latest valuation plus later SIPs; gain is current minus book", () => {
  const txns = [
    transfer("sip1", "sav", "mf", 10_000, "2026-03-05"),
    transfer("sip2", "sav", "mf", 10_000, "2026-04-05"),
    transfer("sip3", "sav", "mf", 10_000, "2026-05-05"),
  ];
  const valuations: ValuationLite[] = [
    val("mf", "2026-03-31", rupees(1_15_000)),
    val("mf", "2026-04-30", rupees(1_28_000)),
  ];
  const p = positionsAt(txns, valuations).positions.get("mf")!;
  assert.equal(p.book, rupees(1_30_000), "opening 1,00,000 plus three SIPs");
  assert.equal(p.current, rupees(1_38_000), "April's 1,28,000 plus May's SIP");
  assert.equal(p.gain, rupees(8_000));
  assert.equal(p.valuedAt?.getTime(), day("2026-04-30").getTime());
});

test("a valuation includes entries dated the same day", () => {
  const p = positionsAt(
    [transfer("sip", "sav", "mf", 10_000, "2026-04-30")],
    [val("mf", "2026-04-30", rupees(1_12_000))],
  ).positions.get("mf")!;
  assert.equal(p.current, rupees(1_12_000), "the same-day SIP is not added on top");
});

test("valuations are ignored on bank accounts", () => {
  const p = positionsAt([], [val("sav", "2026-02-01", 1)]).positions.get("sav")!;
  assert.equal(p.current, rupees(50_000));
});

test("a liability valuation sets what is owed", () => {
  const loan: AccountLite = {
    id: "loan",
    type: "LOAN",
    openingBalanceCents: -rupees(5_00_000),
    openingDate: day("2026-01-01"),
  };
  const positions = computePositions(
    [loan],
    [],
    [val("loan", "2026-06-30", -rupees(4_60_000))],
    NOW,
  );
  const nw = sumNetWorth([loan], positions);
  assert.equal(nw.liabilities, -rupees(4_60_000));
  assert.equal(nw.total, -rupees(4_60_000));
});

test("deleted entries count nowhere", () => {
  const live = positionsAt([income("a", "sav", 1_000, "2026-02-01")]).nw.total;
  const withDeleted = positionsAt([
    income("a", "sav", 1_000, "2026-02-01"),
    { ...expense("b", "sav", 999, "2026-02-02"), deletedAt: new Date() },
  ]).nw.total;
  assert.equal(withDeleted, live);
});

test("entries after the as-of date and accounts not yet opened do not count", () => {
  const jan = endOfDay(day("2025-12-31"));
  const { nw } = positionsAt([income("a", "sav", 1_000, "2026-11-01")], [], jan);
  assert.equal(nw.total, 0, "nothing was open at the end of 2025");
  const today = positionsAt([income("a", "sav", 1_000, "2026-11-01")]).nw.total;
  assert.equal(today, rupees(1_50_000), "a future-dated entry waits for its date");
});

test("net worth splits into liquid, investments and liabilities", () => {
  const { nw } = positionsAt(
    [expense("e", "card", 2_000, "2026-03-01")],
    [val("mf", "2026-06-30", rupees(1_05_000))],
  );
  assert.equal(nw.liquid, rupees(50_000));
  assert.equal(nw.investments, rupees(1_05_000));
  assert.equal(nw.investedCost, rupees(1_00_000));
  assert.equal(nw.liabilities, -rupees(2_000));
  assert.equal(nw.total, nw.liquid + nw.investments + nw.liabilities);
});

test("the net-worth series is right at every month end", () => {
  const txns = [
    income("sal", "sav", 80_000, "2026-02-01"),
    transfer("sip", "sav", "mf", 10_000, "2026-03-05"),
    expense("e", "card", 3_000, "2026-03-20"),
  ];
  // Dated between two points, so March and April must differ by exactly the fund's gain.
  const valuations: ValuationLite[] = [val("mf", "2026-04-15", rupees(1_13_000))];
  const points = monthsBetween(day("2026-01-01"), day("2026-04-01")).map((m) => m.end);
  const totals = netWorthSeries(ALL, txns, valuations, points).map((w) => w.total);
  assert.deepEqual(totals, [
    rupees(1_50_000), // January: the three opening balances
    rupees(2_30_000), // February: plus salary
    rupees(2_27_000), // March: the SIP moves money, the card spend is owed
    rupees(2_30_000), // April: the fund is valued 3,000 above the 1,10,000 put in
  ]);
});

test("running balances: transfers in and out, deleted entries skipped, ending at book", () => {
  const txns = [
    income("a", "sav", 1_000, "2026-02-01"),
    transfer("b", "sav", "mf", 300, "2026-02-02"),
    { ...expense("x", "sav", 999, "2026-02-02"), deletedAt: new Date() },
    transfer("c", "mf", "sav", 50, "2026-02-03"),
    expense("d", "sav", 200, "2026-02-04"),
  ];
  const running = runningBalances(SAVINGS, txns);
  assert.equal(running.get("a"), rupees(51_000));
  assert.equal(running.get("b"), rupees(50_700));
  assert.equal(running.has("x"), false, "a deleted entry has no balance");
  assert.equal(running.get("c"), rupees(50_750), "money coming back from the fund adds");
  assert.equal(running.get("d"), rupees(50_550));
  assert.equal(running.get("d"), positionsAt(txns).positions.get("sav")!.book);
});

test("an account with no entries has no running balances, and its book is the opening", () => {
  assert.equal(runningBalances(SAVINGS, []).size, 0);
  assert.equal(positionsAt([]).positions.get("sav")!.book, SAVINGS.openingBalanceCents);
});

test("two valuations on the same date: the one recorded last wins, in any order", () => {
  const typo = val("mf", "2026-04-30", rupees(12_00_000), new Date(2026, 4, 1, 9, 0));
  const fixed = val("mf", "2026-04-30", rupees(1_20_000), new Date(2026, 4, 1, 9, 5));
  for (const order of [[typo, fixed], [fixed, typo]]) {
    const p = positionsAt([], order).positions.get("mf")!;
    assert.equal(p.current, rupees(1_20_000), "the correction, whichever way round they come");
  }
});

test("a valuation then later flows: spends add to a card's debt, redemptions leave a fund", () => {
  const card = positionsAt(
    [expense("late", "card", 500, "2026-07-10")],
    [val("card", "2026-06-30", -rupees(2_000))],
  ).positions.get("card")!;
  assert.equal(card.current, -rupees(2_500));
  assert.equal(card.valuedAt?.getTime(), day("2026-06-30").getTime());

  const fund = positionsAt(
    [transfer("redeem", "mf", "sav", 20_000, "2026-07-10")],
    [val("mf", "2026-06-30", rupees(1_25_000))],
  ).positions.get("mf")!;
  assert.equal(fund.current, rupees(1_05_000));
});

test("gain as a percentage: none for debts, none before a valuation, signed otherwise", () => {
  const p = (book: number, gain: number, valued = true) => ({
    book,
    current: book + gain,
    gain,
    valuedAt: valued ? new Date() : null,
  });
  assert.equal(gainPercent(p(1000, 100)), "+10.0%");
  assert.equal(gainPercent(p(1000, -50)), "-5.0%");
  assert.equal(gainPercent(p(1000, 100, false)), null);
  assert.equal(gainPercent(p(-5000, 100)), null, "a percentage of a debt means nothing");
});

// --------------------------------------------------------------------------------------
section("Opening dates");

test("an entry before the opening date is caught, compared by calendar day", () => {
  assert.equal(beforeOpening(day("2025-12-31"), SAVINGS), true);
  assert.equal(beforeOpening(day("2026-01-01"), SAVINGS), false, "the opening day itself is fine");
  assert.equal(
    beforeOpening(new Date(2026, 0, 1, 0, 5), SAVINGS),
    false,
    "just after midnight on the opening day is still that day, though before the stored midday",
  );
});

test("the double count the guard exists to prevent", () => {
  // Set up on 1 Jan with ₹50,000, which already reflects December's spending. An entry dated
  // in December would come off a second time: this is what saving one would do.
  const backfilled = positionsAt([expense("dec", "sav", 1_000, "2025-12-28")]);
  assert.equal(backfilled.positions.get("sav")!.book, rupees(49_000));
  assert.equal(beforeOpening(day("2025-12-28"), SAVINGS), true, "so the server refuses it");
});

test("a balance adjustment is the gap to the bank's figure at the end of that day", () => {
  const txns = [
    income("in", "sav", 1_000, "2026-03-01"),
    transfer("back", "mf", "sav", 500, "2026-03-05"),
    expense("same-day", "sav", 200, "2026-03-05"),
    expense("later", "sav", 9_999, "2026-03-20"),
  ];
  const r = adjustmentFor(SAVINGS, txns, day("2026-03-05"), rupees(51_000));
  assert.equal(r.book, rupees(51_300), "opening, income, transfer in and the same-day spend; not later ones");
  assert.equal(r.diff, -rupees(300));
  assert.equal(adjustmentFor(SAVINGS, txns, day("2026-03-05"), rupees(51_300)).diff, 0);
  assert.equal(
    adjustmentFor(SAVINGS, [], day("2026-03-05"), -rupees(2_000)).diff,
    -rupees(52_000),
    "an overdrawn account can be adjusted to a negative balance",
  );
});

// --------------------------------------------------------------------------------------
section("Investments");

const bank = (id: string, isActive = true) => ({ id, type: "SAVINGS", isActive });

test("investing defaults to the account the last investment came from", () => {
  const accounts = [bank("hdfc"), bank("sbi"), { id: "mf", type: "MUTUAL_FUND", isActive: true }];
  assert.equal(pickFundingAccount(accounts, "sbi"), "sbi");
});

test("…otherwise the first open bank or cash account, never a closed one or an investment", () => {
  const accounts = [
    { id: "mf", type: "MUTUAL_FUND", isActive: true },
    bank("old", false),
    { id: "card", type: "CREDIT_CARD", isActive: true },
    bank("hdfc"),
  ];
  assert.equal(pickFundingAccount(accounts, null), "hdfc");
  assert.equal(pickFundingAccount(accounts, "old"), "hdfc", "last used, but closed since");
  assert.equal(pickFundingAccount(accounts, "mf"), "hdfc", "money does not come from another fund");
  assert.equal(pickFundingAccount([{ id: "mf", type: "MUTUAL_FUND", isActive: true }], null), null);
});

test("an existing holding deducts nothing; investing more moves money and keeps net worth", () => {
  // Added as "already held": opening = invested so far, valued on the same day.
  const held: AccountLite = { id: "ppfas", type: "MUTUAL_FUND", openingBalanceCents: rupees(2_00_000), openingDate: day("2026-06-01") };
  const accounts = [SAVINGS, held];
  const valuations = [val("ppfas", "2026-06-01", rupees(2_30_000))];
  const before = sumNetWorth(accounts, computePositions(accounts, [], valuations, NOW));
  assert.equal(computePositions(accounts, [], valuations, NOW).get("sav")!.book, rupees(50_000), "the bank is untouched");
  assert.equal(before.total, rupees(50_000 + 2_30_000));

  const sip = transfer("sip", "sav", "ppfas", 10_000, "2026-07-05");
  const positions = computePositions(accounts, [sip], valuations, NOW);
  assert.equal(positions.get("sav")!.book, rupees(40_000), "the SIP came out of the bank");
  assert.equal(positions.get("ppfas")!.current, rupees(2_40_000), "and went into the fund on top of its value");
  assert.equal(sumNetWorth(accounts, positions).total, before.total, "investing does not change net worth");
});

test("the investments summary adds up, with gain as a share of what went in", () => {
  const fd: AccountLite = { id: "fd", type: "FD", openingBalanceCents: rupees(1_00_000), openingDate: day("2026-01-01") };
  const accounts = [SAVINGS, FUND, fd];
  const positions = computePositions(accounts, [], [val("mf", "2026-06-30", rupees(1_20_000))], NOW);
  const s = summariseInvestments(accounts, positions);
  assert.equal(s.count, 2, "the savings account is not an investment");
  assert.equal(s.invested, rupees(2_00_000));
  assert.equal(s.current, rupees(2_20_000));
  assert.equal(s.gain, rupees(20_000));
  assert.equal(s.gainRatio, 0.1);
  assert.deepEqual(s.byType.map((t) => t.label), ["Mutual fund", "Fixed deposit"], "largest first");
});

test("investments have their own pages; other accounts keep theirs", () => {
  assert.equal(accountPath({ id: "x", type: "PPF" }), "/investments/x");
  assert.equal(accountPath({ id: "y", type: "SAVINGS" }), "/accounts/y");
  assert.equal(accountPath({ id: "z", type: "LOAN" }), "/accounts/z");
  assert.ok(INVESTMENT_TYPES.includes("GOLD") && !INVESTMENT_TYPES.includes("SAVINGS" as never));
});

test("money moved into an investment must be more than zero; a value may be blank only where optional", () => {
  const positive = moneyField("The amount", { positive: true });
  assert.equal(positive.safeParse("0").success, false);
  assert.equal(positive.safeParse("").success, false);
  assert.equal(positive.safeParse("1,500").data, 150000);
  const optional = moneyField("The current value");
  assert.equal(optional.safeParse("").data, 0, "blank current value means none given");
  assert.equal(optional.safeParse("-5").success, false);
});

// --------------------------------------------------------------------------------------
section("Filters and monthly totals");

test("every filter excludes deleted entries", () => {
  assert.deepEqual(whereFromFilter({}), { deletedAt: null });
  assert.equal(whereFromFilter({ kinds: ["INCOME"], memberId: "m1" }).deletedAt, null);
});

test("Shared means no member, not a member called shared", () => {
  assert.equal(whereFromFilter({ memberId: SHARED }).memberId, null);
  assert.equal(whereFromFilter({ memberId: "cm123" }).memberId, "cm123");
});

test("an account filter matches either side of a transfer", () => {
  assert.deepEqual(whereFromFilter({ accountId: "sav" }).OR, [
    { accountId: "sav" },
    { toAccountId: "sav" },
  ]);
});

test("an empty list of kinds matches nothing, not everything", () => {
  assert.deepEqual(whereFromFilter({ kinds: [] }).kind, { in: [] });
  assert.equal(whereFromFilter({}).kind, undefined);
});

test("monthly totals ignore transfers and adjustments and keep month ends in their month", () => {
  const months = monthsBetween(day("2026-03-01"), day("2026-04-01"));
  const rows = [
    { kind: "INCOME", amountCents: 100, date: day("2026-03-31") },
    { kind: "EXPENSE", amountCents: 40, date: day("2026-03-31") },
    { kind: "TRANSFER", amountCents: 9_999, date: day("2026-03-15") },
    { kind: "ADJUSTMENT", amountCents: -777, date: day("2026-04-02") },
    { kind: "EXPENSE", amountCents: 5, date: day("2026-04-01") },
  ];
  assert.deepEqual(
    bucketMonthly(rows, months).map(({ income, expense }) => ({ income, expense })),
    [
      { income: 100, expense: 40 },
      { income: 0, expense: 5 },
    ],
  );
});

// --------------------------------------------------------------------------------------
section("The entry form");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return readTxnForm(fd);
}

const goodExpense = {
  kind: "EXPENSE",
  amount: "1,250.50",
  date: "2026-10-01",
  description: "Groceries",
  accountId: "sav",
  categoryId: "cat",
  memberId: "",
};

test("a valid expense parses, in paise, Shared when no member is picked", () => {
  const r = form(goodExpense);
  assert.ok(r.success);
  const cols = txnColumns(r.data);
  assert.equal(cols.amountCents, 125050);
  assert.equal(cols.memberId, null);
  assert.equal(cols.toAccountId, null);
});

test("income without a category is refused", () => {
  const r = form({ ...goodExpense, kind: "INCOME", categoryId: "" });
  assert.equal(r.success, false);
});

test("a transfer to the same account is refused", () => {
  const r = form({ ...goodExpense, kind: "TRANSFER", toAccountId: "sav" });
  assert.equal(r.success, false);
  assert.match(r.error!.issues[0].message, /different account/);
});

test("a transfer clears any category sent with it", () => {
  const r = form({ ...goodExpense, kind: "TRANSFER", toAccountId: "mf" });
  assert.ok(r.success);
  const cols = txnColumns(r.data);
  assert.equal(cols.categoryId, null);
  assert.equal(cols.toAccountId, "mf");
});

test("adjustments cannot be posted through the entry form", () => {
  assert.equal(form({ ...goodExpense, kind: "ADJUSTMENT" }).success, false);
});

test("zero, negative, garbage and fractional-paisa amounts are refused", () => {
  for (const amount of ["0", "-5", "abc", "", "1.005", "1e3"]) {
    assert.equal(form({ ...goodExpense, amount }).success, false, `amount ${JSON.stringify(amount)}`);
  }
});

test("the largest allowed amount is accepted, and one paisa more is refused", () => {
  const max = (MAX_AMOUNT_CENTS / 100).toFixed(2);
  assert.ok(form({ ...goodExpense, amount: max }).success, `${max} is the limit`);
  const over = (MAX_AMOUNT_CENTS / 100).toFixed(0) + ".01";
  assert.equal(form({ ...goodExpense, amount: over }).success, false);
});

test("an impossible date is refused", () => {
  assert.equal(form({ ...goodExpense, date: "2026-02-30" }).success, false);
});

// --------------------------------------------------------------------------------------
section("Accounts");

test("account types fall into the right group", () => {
  assert.equal(accountGroup("SAVINGS"), "LIQUID");
  assert.equal(accountGroup("PPF"), "INVESTMENT");
  assert.equal(accountGroup("CREDIT_CARD"), "LIABILITY");
});

test("an amount owed is entered positive and stored negative, and round-trips", () => {
  assert.equal(toStoredBalance("LOAN", 500), -500);
  assert.equal(toStoredBalance("CREDIT_CARD", 500), -500);
  assert.equal(toEnteredBalance("LOAN", toStoredBalance("LOAN", 500)), 500);
  assert.equal(toStoredBalance("SAVINGS", 500), 500);
});

test("an unknown account type is an error, not a bank account", () => {
  assert.throws(() => accountGroup("TIMESHARE"), /Unknown account type/);
});

test("changing type between owned and owed is detected; within a side is not", () => {
  assert.equal(crossesSign("SAVINGS", "LOAN"), true);
  assert.equal(crossesSign("CREDIT_CARD", "MUTUAL_FUND"), true);
  assert.equal(crossesSign("MUTUAL_FUND", "FD"), false);
  assert.equal(crossesSign("LOAN", "CREDIT_CARD"), false);
});

test("the database allows exactly the account types the app knows", () => {
  const sql = readFileSync(new URL("../prisma/constraints.sql", import.meta.url), "utf8");
  const listed = sql.match(/"Account_type_check"\s+check \(type in \(([^)]*)\)/)?.[1];
  assert.ok(listed, "constraints.sql has the account type check");
  const inSql = [...listed!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(inSql, ACCOUNT_TYPES.map((t) => t.key).sort());
});

// --------------------------------------------------------------------------------------
section("Money, dates and periods");

test("amounts parse to paise and format the Indian way", () => {
  assert.equal(parseAmount("₹1,23,456.78"), 12345678);
  assert.equal(formatMoney(12345678), "₹1,23,456.78");
  assert.equal(formatMoney(-500), "-₹5.00");
});

test("amounts parse from the digits, never through a float", () => {
  assert.equal(parseAmount(".5"), 50);
  assert.equal(parseAmount("5."), 500);
  assert.equal(parseAmount("0.29"), 29, "0.29 * 100 is 28.999… as a float");
  assert.equal(parseAmount("-250"), -25000);
  assert.equal(parseAmount("1.005"), null, "no fractions of a paisa");
  for (const bad of ["1e3", "--5", "1.2.3", ".", "-", ""]) {
    assert.equal(parseAmount(bad), null, JSON.stringify(bad));
  }
});

test("dates: leap years, padding and the end of a day", () => {
  assert.ok(parseDay("2028-02-29"));
  assert.equal(parseDay("2026-02-29"), undefined);
  assert.equal(parseDay("2026-4-1"), undefined);
  const end = parseDay("2026-03-31", "end")!;
  assert.deepEqual([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()], [23, 59, 59, 999]);
});

test("aggregates arrive as bigint and are converted, not trusted", () => {
  assert.equal(sumToPaise(BigInt(500)), 500);
  assert.equal(sumToPaise(null), 0);
  assert.throws(() => toPaise(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(2)));
});

test("the financial year runs April to March", () => {
  assert.equal(fyStartYear(day("2026-03-31")), 2025);
  assert.equal(fyStartYear(day("2026-04-01")), 2026);
  assert.equal(fyLabel(2026), "FY 2026-27");
  const fy = periodBounds("fy", day("2026-10-18"));
  assert.equal(fy.from!.getTime(), new Date(2026, 3, 1).getTime());
  assert.equal(
    fy.to!.getTime(),
    new Date(2027, 2, 31, 23, 59, 59, 999).getTime(),
    "the last instant of 31 March, so an entry stored at midday that day is inside",
  );
});

test("early in the calendar year, this FY started last April", () => {
  const feb = day("2026-02-15");
  assert.equal(periodBounds("fy", feb).from!.getTime(), new Date(2025, 3, 1).getTime());
  assert.equal(periodBounds("lastfy", feb).from!.getTime(), new Date(2024, 3, 1).getTime());
  const twelve = periodBounds("12m", feb);
  assert.equal(twelve.from!.getTime(), new Date(2025, 2, 1).getTime(), "March last year to February");
});

test("a report with only one date given is open at the other end", () => {
  const since = resolvePeriod({ from: "2026-01-01" });
  assert.equal(since.to, undefined);
  assert.match(since.label, /^since/);
  const upTo = resolvePeriod({ to: "2026-01-31" });
  assert.equal(upTo.from, undefined);
  assert.match(upTo.label, /^up to/);
});

test("transaction windows: day counts, month-end clamping, January's last month, defaults", () => {
  const at = day("2026-08-31");
  assert.equal(rangeBounds("10d", at).from!.getTime(), new Date(2026, 7, 22).getTime(), "today counts as one of the ten");
  assert.equal(rangeBounds("6m", at).from!.getTime(), new Date(2026, 1, 28).getTime(), "31 Aug minus six months is 28 Feb");
  const jan = rangeBounds("lastmonth", day("2026-01-10"));
  assert.equal(jan.from!.getTime(), new Date(2025, 11, 1).getTime());
  assert.equal(jan.to!.getTime(), new Date(2025, 11, 31, 23, 59, 59, 999).getTime());
  const unknown = resolveRange({ range: "fortnight" }, at);
  assert.equal(unknown.key, DEFAULT_RANGE);
  assert.equal(unknown.implicit, true);
  const badFrom = resolveRange({ range: "1y", from: "not-a-date" }, at);
  assert.equal(badFrom.key, "1y", "an unreadable date counts as absent");
});

test("explicit report dates beat a preset; bad ones are reported back", () => {
  const r = resolvePeriod({ period: "fy", from: "2026-01-01", to: "2026-13-45" });
  assert.equal(r.key, null);
  assert.equal(r.from!.getMonth(), 0);
  assert.deepEqual(r.unusable, ["2026-13-45"]);
});

test("months between two dates are inclusive at both ends", () => {
  const m = monthsBetween(day("2025-11-15"), day("2026-02-03"));
  assert.equal(m.length, 4);
  assert.equal(m[0].start.getMonth(), 10);
  assert.equal(m[3].start.getMonth(), 1);
});

// --------------------------------------------------------------------------------------
section("Export");

test("CSV quotes what needs quoting and defuses formulas", () => {
  assert.equal(csvCell('He said "hi", then left'), '"He said ""hi"", then left"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell(-12.5), "-12.5", "numbers are written as numbers");
  assert.equal(toCsv([["a", "b"], [1, null]]), "a,b\r\n1,\r\n");
});

test("CSV: a formula that also needs quoting, a dash, and a note over two lines", () => {
  assert.equal(csvCell("=a,b"), `"'=a,b"`);
  assert.equal(csvCell("-refund"), "'-refund");
  assert.equal(csvCell("line one\nline two"), '"line one\nline two"');
});

test("the workbook carries real numbers and the period in its summary", async () => {
  const wb = buildWorkbook({
    periodLabel: "October 2026",
    entries: [
      {
        date: day("2026-10-01"),
        kind: "Expense",
        description: "=SUM(A1)",
        category: "Groceries",
        account: "HDFC",
        toAccount: "",
        member: "Shared",
        amount: toRupees(125050),
        notes: "",
      },
    ],
    totals: { income: toRupees(0), expense: toRupees(125050) },
    expenseByCategory: [{ name: "Groceries", amount: toRupees(125050) }],
    incomeByCategory: [],
    expenseByMember: [{ name: "Shared", amount: toRupees(125050) }],
    accounts: [],
  });
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf as ArrayBuffer);
  const sheet = back.getWorksheet("Entries")!;
  assert.equal(sheet.getRow(2).getCell(8).value, 1250.5);
  assert.equal(sheet.getRow(2).getCell(3).value, "=SUM(A1)", "a description is text, never a formula");
  assert.ok(back.getWorksheet("Summary"));
});

// --------------------------------------------------------------------------------------
section("Sign-in guards");

test("the throttle blocks after the limit and says how long to wait", async () => {
  const store = memoryStore();
  const opts = { limit: 3, windowMs: 60_000 };
  for (let i = 0; i < 3; i++) assert.ok((await hit(store, "k", opts)).ok);
  const blocked = await hit(store, "k", opts);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60, `waits ${blocked.retryAfter}s`);
});

test("the throttle: keys are separate, a reset clears one, and a window runs out", async () => {
  const store = memoryStore();
  const opts = { limit: 1, windowMs: 1 };
  assert.ok((await hit(store, "a", opts)).ok);
  assert.ok((await hit(store, "b", opts)).ok, "another key has its own budget");
  await reset(store, "a");
  assert.ok((await hit(store, "a", opts)).ok, "a reset starts the key again");
  await new Promise((r) => setTimeout(r, 5));
  assert.ok((await hit(store, "b", opts)).ok, "an expired window counts from zero");
});

test("redirects after sign-in stay on this site", () => {
  assert.equal(safeNext("/accounts"), "/accounts");
  assert.equal(safeNext("/transactions?range=1y&q=rent"), "/transactions?range=1y&q=rent");
  assert.equal(safeNext("//evil.example.com"), "/");
  assert.equal(safeNext("https://evil.example.com"), "/");
  assert.equal(safeNext("/\\evil.example.com"), "/");
  assert.equal(safeNext("accounts"), "/");
});

test("redirects: tabs and line breaks cannot smuggle in another site", () => {
  // URL parsers drop these characters, so each of these would otherwise become
  // //evil.example.com — another site — after passing a prefix check.
  for (const sneaky of ["/\t/evil.example.com", "/\n/evil.example.com", "/\r/evil.example.com", "/%09/x"]) {
    const out = safeNext(sneaky);
    assert.equal(new URL(out, "https://home.example").host, "home.example", `${JSON.stringify(sneaky)} -> ${out}`);
  }
});

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
