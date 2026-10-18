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

import { accountGroup, toEnteredBalance, toStoredBalance } from "../src/lib/accounts";
import { safeNext } from "../src/lib/auth";
import {
  computePositions,
  netWorthSeries,
  runningBalances,
  sumNetWorth,
  type AccountLite,
  type TxnLite,
  type ValuationLite,
} from "../src/lib/balances";
import { csvCell, toCsv } from "../src/lib/csv";
import { endOfDay, monthsBetween, parseDay } from "../src/lib/date";
import { formatMoney, MAX_AMOUNT_CENTS, parseAmount, sumToPaise, toPaise } from "../src/lib/money";
import { fyLabel, fyStartYear, periodBounds, resolvePeriod } from "../src/lib/period";
import { hit, memoryStore } from "../src/lib/rate-limit";
import { isReportable, readTxnForm, signedEffects, txnColumns } from "../src/lib/txn";
import { buildWorkbook } from "../src/lib/workbook";

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
    { accountId: "mf", date: day("2026-03-31"), valueCents: rupees(1_15_000) },
    { accountId: "mf", date: day("2026-04-30"), valueCents: rupees(1_28_000) },
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
    [{ accountId: "mf", date: day("2026-04-30"), valueCents: rupees(1_12_000) }],
  ).positions.get("mf")!;
  assert.equal(p.current, rupees(1_12_000), "the same-day SIP is not added on top");
});

test("valuations are ignored on bank accounts", () => {
  const p = positionsAt([], [{ accountId: "sav", date: day("2026-02-01"), valueCents: 1 }]).positions.get("sav")!;
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
    [{ accountId: "loan", date: day("2026-06-30"), valueCents: -rupees(4_60_000) }],
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
    [{ accountId: "mf", date: day("2026-06-30"), valueCents: rupees(1_05_000) }],
  );
  assert.equal(nw.liquid, rupees(50_000));
  assert.equal(nw.investments, rupees(1_05_000));
  assert.equal(nw.investedCost, rupees(1_00_000));
  assert.equal(nw.liabilities, -rupees(2_000));
  assert.equal(nw.total, nw.liquid + nw.investments + nw.liabilities);
});

test("the net-worth series agrees with a direct computation at each point", () => {
  const txns = [
    income("sal", "sav", 80_000, "2026-02-01"),
    transfer("sip", "sav", "mf", 10_000, "2026-03-05"),
    expense("e", "card", 3_000, "2026-03-20"),
  ];
  const valuations: ValuationLite[] = [{ accountId: "mf", date: day("2026-03-31"), valueCents: rupees(1_13_000) }];
  const points = monthsBetween(day("2026-01-01"), day("2026-04-01")).map((m) => m.end);
  const series = netWorthSeries(ALL, txns, valuations, points);
  assert.equal(series.length, 4);
  points.forEach((p, i) => {
    const direct = sumNetWorth(ALL, computePositions(ALL, txns, valuations, p));
    assert.deepEqual(series[i], direct);
  });
  assert.equal(series[0].total, rupees(1_50_000));
  assert.equal(series[2].total, rupees(1_50_000 + 80_000 - 10_000 - 3_000 + 1_13_000 - 1_00_000));
});

test("running balances end at the book balance", () => {
  const txns = [
    income("a", "sav", 1_000, "2026-02-01"),
    transfer("b", "sav", "mf", 300, "2026-02-02"),
    expense("c", "sav", 200, "2026-02-03"),
  ];
  const running = runningBalances(SAVINGS, txns);
  assert.equal(running.get("a"), rupees(51_000));
  assert.equal(running.get("b"), rupees(50_700));
  assert.equal(running.get("c"), rupees(50_500));
  assert.equal(running.get("c"), positionsAt(txns).positions.get("sav")!.book);
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

test("zero, negative, garbage and oversized amounts are refused", () => {
  for (const amount of ["0", "-5", "abc", "", String(MAX_AMOUNT_CENTS)]) {
    assert.equal(form({ ...goodExpense, amount }).success, false, `amount ${JSON.stringify(amount)}`);
  }
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
  assert.equal(toEnteredBalance("LOAN", toStoredBalance("LOAN", 500)), 500);
  assert.equal(toStoredBalance("SAVINGS", 500), 500);
});

// --------------------------------------------------------------------------------------
section("Money, dates and periods");

test("amounts parse to paise and format the Indian way", () => {
  assert.equal(parseAmount("₹1,23,456.78"), 12345678);
  assert.equal(formatMoney(12345678), "₹1,23,456.78");
  assert.equal(formatMoney(-500), "-₹5.00");
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
  assert.equal(fy.from!.getMonth(), 3);
  assert.equal(fy.to!.getFullYear(), 2027);
  assert.equal(fy.to!.getMonth(), 2);
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
        amount: 1250.5,
        notes: "",
      },
    ],
    totals: { income: 0, expense: 1250.5 },
    expenseByCategory: [{ name: "Groceries", amount: 1250.5 }],
    incomeByCategory: [],
    expenseByMember: [{ name: "Shared", amount: 1250.5 }],
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
  assert.ok(blocked.retryAfter > 0);
});

test("redirects after sign-in stay on this site", () => {
  assert.equal(safeNext("/accounts"), "/accounts");
  assert.equal(safeNext("//evil.example.com"), "/");
  assert.equal(safeNext("https://evil.example.com"), "/");
  assert.equal(safeNext("/\\evil.example.com"), "/");
});

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
