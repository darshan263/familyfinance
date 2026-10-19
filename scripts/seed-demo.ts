/**
 * A demo household with six months of realistic entries, for looking around before real use.
 * Run with `npm run seed:demo`. Refuses to touch a database that has already been set up.
 *
 * Sign in as demo@example.com / familyfinance. That password is printed here and in the
 * README, so never run this against the database you will use for real money.
 */

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { seedCategoryRows } from "../src/lib/categories";

const prisma = new PrismaClient();

const paise = (rupees: number) => BigInt(Math.round(rupees * 100));
/** Midday local time, the same as dates entered through the app. */
const on = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0);

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.error(
      "This database has already been set up; the demo would mix into it. Point DATABASE_URL " +
        "at an empty database, or wipe this one with `npx prisma db push --force-reset`.",
    );
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1, 12);

  await prisma.user.create({
    data: { email: "demo@example.com", passwordHash: await bcrypt.hash("familyfinance", 10) },
  });
  await prisma.setting.create({ data: { key: "household.name", value: "The Demo Household" } });
  await prisma.category.createMany({ data: seedCategoryRows() });

  const ravi = await prisma.member.create({ data: { name: "Ravi", color: "indigo" } });
  const priya = await prisma.member.create({ data: { name: "Priya", color: "rose" } });

  const acct = (name: string, type: string, opening: number, owner?: string, institution?: string, sort = 0) =>
    prisma.account.create({
      data: {
        name,
        type,
        institution,
        ownerMemberId: owner,
        openingBalanceCents: paise(opening),
        openingDate: start,
        sort,
      },
    });

  const hdfc = await acct("HDFC Savings", "SAVINGS", 1_85_000, ravi.id, "HDFC Bank", 10);
  const sbi = await acct("SBI Savings", "SAVINGS", 92_000, priya.id, "SBI", 20);
  const cash = await acct("Cash at home", "CASH", 8_000, undefined, undefined, 30);
  const mf = await acct("Parag Parikh Flexi Cap", "MUTUAL_FUND", 2_40_000, ravi.id, "PPFAS", 40);
  const ppf = await acct("PPF", "PPF", 3_10_000, priya.id, "SBI", 50);
  const fd = await acct("FD — 1 year", "FD", 1_00_000, undefined, "HDFC Bank", 60);
  const card = await acct("Amazon Pay ICICI card", "CREDIT_CARD", -12_400, ravi.id, "ICICI", 70);
  const loan = await acct("Car loan", "LOAN", -4_20_000, undefined, "HDFC Bank", 80);

  const cats = new Map((await prisma.category.findMany()).map((c) => [c.name, c.id]));
  const cat = (name: string) => {
    const id = cats.get(name);
    if (!id) throw new Error(`No category ${name}`);
    return id;
  };

  type Entry = {
    kind: string;
    amount: number;
    date: Date;
    description: string;
    accountId: string;
    toAccountId?: string;
    category?: string;
    memberId?: string;
  };
  const entries: Entry[] = [];

  for (let i = 0; i < 6; i++) {
    const y = start.getFullYear();
    const m = start.getMonth() + i;
    const isCurrent = i === 5;
    const upTo = isCurrent ? now.getDate() : 31;
    const add = (d: number, e: Omit<Entry, "date">) => {
      if (d <= upTo) entries.push({ ...e, date: on(y, m, d) });
    };

    add(1, { kind: "INCOME", amount: 1_42_000, description: "Salary", accountId: hdfc.id, category: "Salary", memberId: ravi.id });
    add(1, { kind: "INCOME", amount: 96_500, description: "Salary", accountId: sbi.id, category: "Salary", memberId: priya.id });
    add(2, { kind: "EXPENSE", amount: 32_000, description: "House rent", accountId: hdfc.id, category: "Rent" });
    add(3, { kind: "TRANSFER", amount: 15_000, description: "Monthly SIP", accountId: hdfc.id, toAccountId: mf.id, memberId: ravi.id });
    add(5, { kind: "EXPENSE", amount: 18_450, description: "Car loan EMI (interest part)", accountId: hdfc.id, category: "EMI & loan interest" });
    add(5, { kind: "TRANSFER", amount: 9_800, description: "Car loan EMI (principal part)", accountId: hdfc.id, toAccountId: loan.id });
    add(6, { kind: "TRANSFER", amount: 10_000, description: "Cash withdrawal", accountId: sbi.id, toAccountId: cash.id });
    add(7, { kind: "EXPENSE", amount: 3_200 + (i % 3) * 450, description: "Electricity bill", accountId: sbi.id, category: "Utilities & bills" });
    add(8, { kind: "EXPENSE", amount: 6_000, description: "Maid salary", accountId: cash.id, category: "Household help" });
    add(9, { kind: "EXPENSE", amount: 4_850 + i * 120, description: "BigBasket order", accountId: card.id, category: "Groceries" });
    add(12, { kind: "EXPENSE", amount: 1_299, description: "Broadband + OTT", accountId: card.id, category: "Subscriptions" });
    add(14, { kind: "EXPENSE", amount: 2_400 + i * 90, description: "Petrol", accountId: card.id, category: "Fuel & transport", memberId: ravi.id });
    add(15, { kind: "TRANSFER", amount: 5_000, description: "PPF contribution", accountId: sbi.id, toAccountId: ppf.id, memberId: priya.id });
    add(16, { kind: "EXPENSE", amount: 1_850, description: "Dinner out", accountId: card.id, category: "Dining & food delivery" });
    add(18, { kind: "EXPENSE", amount: 5_620 + i * 75, description: "DMart groceries", accountId: sbi.id, category: "Groceries" });
    add(20, { kind: "EXPENSE", amount: 2_999 + (i % 2) * 1_500, description: "Clothes", accountId: card.id, category: "Shopping", memberId: priya.id });
    add(21, { kind: "TRANSFER", amount: 0, description: "Card bill", accountId: hdfc.id, toAccountId: card.id });
    add(23, { kind: "EXPENSE", amount: 800 + (i % 4) * 350, description: "Pharmacy", accountId: cash.id, category: "Medical & health" });
    add(26, { kind: "EXPENSE", amount: 1_150, description: "Swiggy", accountId: card.id, category: "Dining & food delivery", memberId: ravi.id });
    if (i === 2) add(10, { kind: "EXPENSE", amount: 24_000, description: "Goa trip flights", accountId: card.id, category: "Travel" });
    if (i === 3) add(28, { kind: "INCOME", amount: 2_150, description: "Savings interest", accountId: hdfc.id, category: "Interest" });
    if (i === 4) add(11, { kind: "EXPENSE", amount: 18_500, description: "Health insurance renewal", accountId: hdfc.id, category: "Insurance" });
    if (i === 4) add(25, { kind: "INCOME", amount: 35_000, description: "Freelance design project", accountId: sbi.id, category: "Freelance", memberId: priya.id });
  }

  // Pay off the card each month: last month's opening plus spends since, rounded, so the card
  // never runs away. Computed here rather than typed, so the demo stays self-consistent.
  let owed = 12_400;
  for (const e of entries.sort((a, b) => a.date.getTime() - b.date.getTime())) {
    if (e.accountId === card.id && e.kind === "EXPENSE") owed += e.amount;
    if (e.description === "Card bill") {
      e.amount = owed;
      owed = 0;
    }
  }

  await prisma.transaction.createMany({
    data: entries
      .filter((e) => e.amount > 0)
      .map((e) => ({
        kind: e.kind,
        amountCents: paise(e.amount),
        date: e.date,
        description: e.description,
        accountId: e.accountId,
        toAccountId: e.toAccountId ?? null,
        categoryId: e.category ? cat(e.category) : null,
        memberId: e.memberId ?? null,
      })),
  });

  // Statement values: the fund ahead of what went in, the loan per the lender.
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 12);
  const twoMonthsBack = new Date(now.getFullYear(), now.getMonth() - 2, 0, 12);
  await prisma.valuation.createMany({
    data: [
      { accountId: mf.id, date: twoMonthsBack, valueCents: paise(2_96_400), note: "CAS statement" },
      { accountId: mf.id, date: lastMonthEnd, valueCents: paise(3_18_900), note: "CAS statement" },
      { accountId: fd.id, date: lastMonthEnd, valueCents: paise(1_03_650), note: "accrued interest" },
      { accountId: loan.id, date: lastMonthEnd, valueCents: paise(-3_79_200), note: "loan statement" },
    ],
  });

  console.log(`Demo household created with ${entries.length} entries.`);
  console.log("Sign in as demo@example.com with the password familyfinance.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
