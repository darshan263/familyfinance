import ExcelJS from "exceljs";

/**
 * The exported workbook. Separate from the route handler so it can be tested: a route
 * module's exports are validated by Next.js, so this cannot live beside the `GET`.
 *
 * Money is written in rupees as real numbers, so Excel can sum it without guessing at text.
 * A description beginning with `=` is simply a string here: an xlsx cell is a formula only if
 * it is written as one.
 */

export interface EntryRow {
  date: Date;
  kind: string;
  description: string;
  category: string;
  account: string;
  toAccount: string;
  member: string;
  amount: number;
  notes: string;
}

export interface NamedAmount {
  name: string;
  amount: number;
}

export interface AccountRow {
  name: string;
  type: string;
  owner: string;
  book: number;
  current: number;
  gain: number;
}

export interface WorkbookInput {
  /** What the export covers: "October 2026", "FY 2026-27", "all time". */
  periodLabel: string;
  entries: EntryRow[];
  totals: { income: number; expense: number };
  expenseByCategory: NamedAmount[];
  incomeByCategory: NamedAmount[];
  expenseByMember: NamedAmount[];
  /** Positions today, not at the end of the period. */
  accounts: AccountRow[];
}

const MONEY = "#,##0.00";
const SIGNED = "#,##0.00;[Red]-#,##0.00";
const DATE = "yyyy-mm-dd";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
}

function section(sheet: ExcelJS.Worksheet, title: string, rows: NamedAmount[]) {
  sheet.addRow([]);
  styleHeader(sheet.addRow([title, "Amount"]));
  if (rows.length === 0) {
    sheet.addRow(["Nothing in this period"]).font = { italic: true, color: { argb: "FF767676" } };
    return;
  }
  for (const r of rows) sheet.addRow([r.name, r.amount]).getCell(2).numFmt = MONEY;
}

export function buildWorkbook(input: WorkbookInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FamilyFinance";
  wb.created = new Date();

  // ---------------------------------------------------------------- Entries ----
  const entries = wb.addWorksheet("Entries", { views: [{ state: "frozen", ySplit: 1 }] });
  entries.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Type", key: "kind", width: 18 },
    { header: "Description", key: "description", width: 34 },
    { header: "Category", key: "category", width: 22 },
    { header: "Account", key: "account", width: 20 },
    { header: "To account", key: "toAccount", width: 20 },
    { header: "Member", key: "member", width: 14 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  styleHeader(entries.getRow(1));

  for (const e of input.entries) {
    const row = entries.addRow([
      e.date,
      e.kind,
      e.description,
      e.category,
      e.account,
      e.toAccount,
      e.member,
      e.amount,
      e.notes,
    ]);
    row.getCell(1).numFmt = DATE;
    // Signed only for balance adjustments, so the red is only ever a correction downwards.
    row.getCell(8).numFmt = SIGNED;
  }

  if (input.entries.length > 0) {
    entries.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
  }

  // ---------------------------------------------------------------- Summary ----
  const summary = wb.addWorksheet("Summary");
  // Widths one by one: assigning `columns` would write a header row this sheet does not want.
  summary.getColumn(1).width = 34;
  summary.getColumn(2).width = 18;

  const title = summary.addRow([`Summary · ${input.periodLabel}`]);
  title.font = { bold: true, size: 12 };
  const note = summary.addRow([
    "Income and expense only. Transfers between your own accounts (SIPs, card bills, FD " +
      "bookings) and balance adjustments move money you already had, so they are not counted.",
  ]);
  note.font = { italic: true, size: 9, color: { argb: "FF767676" } };

  summary.addRow([]);
  styleHeader(summary.addRow(["Totals", "Amount"]));
  const { income, expense } = input.totals;
  for (const [label, value, fmt] of [
    ["Income", income, MONEY],
    ["Expense", expense, MONEY],
    ["Saved (income − expense)", income - expense, SIGNED],
  ] as const) {
    summary.addRow([label, value]).getCell(2).numFmt = fmt;
  }
  if (income > 0) {
    const rate = summary.addRow(["Savings rate", (income - expense) / income]);
    rate.getCell(2).numFmt = "0.0%";
  }

  section(summary, "Expense by category", input.expenseByCategory);
  section(summary, "Income by category", input.incomeByCategory);
  section(summary, "Expense by member", input.expenseByMember);

  // --------------------------------------------------------------- Accounts ----
  const accounts = wb.addWorksheet("Accounts today");
  accounts.columns = [
    { header: "Account", key: "name", width: 26 },
    { header: "Type", key: "type", width: 20 },
    { header: "Owner", key: "owner", width: 14 },
    { header: "Put in (book)", key: "book", width: 16 },
    { header: "Worth now", key: "current", width: 16 },
    { header: "Gain", key: "gain", width: 14 },
  ];
  styleHeader(accounts.getRow(1));
  for (const a of input.accounts) {
    const row = accounts.addRow([a.name, a.type, a.owner, a.book, a.current, a.gain]);
    for (const c of [4, 5, 6]) row.getCell(c).numFmt = SIGNED;
  }

  return wb;
}
