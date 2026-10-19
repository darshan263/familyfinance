import { accountGroup, accountTypeLabel, toEnteredBalance } from "@/lib/accounts";
import { toCsv } from "@/lib/csv";
import { readDayParam, toDateInput } from "@/lib/date";
import {
  getPositions,
  getTransactions,
  sumByCategory,
  sumByMember,
  sumIncomeExpense,
  type TxnFilter,
} from "@/lib/queries";
import { isRangeKey, resolveRange } from "@/lib/range";
import { requireUser } from "@/lib/session";
import { isTxnKind, KIND_LABELS, type TxnKind } from "@/lib/txn";
import { buildWorkbook, toRupees, type EntryRow } from "@/lib/workbook";

export const dynamic = "force-dynamic";

/** `familyfinance-2026-04-01-to-2027-03-31.xlsx`, or `familyfinance-all-to-<today>.csv`. */
function exportFilename(from: Date | undefined, to: Date | undefined, ext: string): string {
  const start = from ? toDateInput(from) : "all";
  const end = to ? toDateInput(to) : toDateInput(new Date());
  return `familyfinance-${start}-to-${end}.${ext}`;
}

export async function GET(request: Request) {
  await requireUser();

  const sp = new URL(request.url).searchParams;
  const format = sp.get("format") === "csv" ? "csv" : "xlsx";

  const from = readDayParam(sp.get("from"));
  const to = readDayParam(sp.get("to"), "end");

  // Refuse rather than widen. Dropping an unusable date here would quietly turn "this
  // quarter" into every entry ever made, in a file whose name says nothing about it.
  const unusable = [
    from.given && !from.date ? `from=${from.raw}` : null,
    to.given && !to.date ? `to=${to.raw}` : null,
  ].filter(Boolean);
  if (unusable.length > 0) {
    return new Response(
      `Not exporting: ${unusable.join(" and ")} ${unusable.length > 1 ? "are" : "is"} not a ` +
        `date in yyyy-mm-dd form. Fix the range and try again; exporting without it would ` +
        `have given you every entry rather than the ones you asked for.`,
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // The same rule for a preset or kind this code does not know: ignored, either would widen
  // the export — an unknown kind to every kind, an unknown window to the default one.
  const rangeParam = sp.get("range");
  const kind = sp.get("kind");
  const unknown = [
    rangeParam && !isRangeKey(rangeParam) ? `range=${rangeParam}` : null,
    kind && !isTxnKind(kind) ? `kind=${kind}` : null,
  ].filter(Boolean);
  if (unknown.length > 0) {
    return new Response(
      `Not exporting: ${unknown.join(" and ")} ${unknown.length > 1 ? "are" : "is"} not ` +
        `something this export understands, and ignoring it would have widened what you get.`,
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // Same resolution as the Transactions page, so Export means what is on screen.
  const range = resolveRange({ range: rangeParam, from: sp.get("from"), to: sp.get("to") });
  const filter: TxnFilter = {
    from: range.from,
    to: range.to,
    kinds: kind && isTxnKind(kind) ? [kind] : undefined,
    accountId: sp.get("account") || undefined,
    categoryId: sp.get("category") || undefined,
    memberId: sp.get("member") || undefined,
    search: sp.get("q") || undefined,
  };

  const txns = (await getTransactions(filter)).reverse();
  const entries: EntryRow[] = txns.map((t) => ({
    date: t.date,
    kind: KIND_LABELS[t.kind as TxnKind] ?? t.kind,
    description: t.description,
    category: t.category?.name ?? "",
    account: t.account.name,
    toAccount: t.toAccount?.name ?? "",
    member: t.member?.name ?? "Shared",
    amount: toRupees(t.amountCents),
    notes: t.notes ?? "",
  }));
  const filename = exportFilename(range.from, range.to, format);

  if (format === "csv") {
    const header = ["Date", "Type", "Description", "Category", "Account", "To account", "Member", "Amount", "Notes"];
    const body = entries.map((e) => [
      toDateInput(e.date),
      e.kind,
      e.description,
      e.category,
      e.account,
      e.toAccount,
      e.member,
      e.amount,
      e.notes,
    ]);
    // The byte-order mark makes Excel read the file as UTF-8, so ₹ and non-English names survive.
    return new Response("﻿" + toCsv([header, ...body]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // The summary covers the period, not the other filters: it answers "how did we do", and a
  // summary of only the entries matching a search would be a strange thing to hand anyone.
  const period = { from: range.from, to: range.to };
  const [totals, expenseCats, incomeCats, expenseMembers, positions] = await Promise.all([
    sumIncomeExpense(period),
    sumByCategory("EXPENSE", period),
    sumByCategory("INCOME", period),
    sumByMember("EXPENSE", period),
    getPositions(),
  ]);
  const named = (slices: { name: string; cents: number }[]) =>
    slices.map((s) => ({ name: s.name, amount: toRupees(s.cents) }));

  const workbook = buildWorkbook({
    periodLabel: range.label,
    entries,
    totals: { income: toRupees(totals.income), expense: toRupees(totals.expense) },
    expenseByCategory: named(expenseCats),
    incomeByCategory: named(incomeCats),
    expenseByMember: named(expenseMembers),
    accounts: positions.accounts.map((a) => {
      const p = positions.positions.get(a.id)!;
      // Owed amounts read positive, as everywhere else in the app.
      const shown = (v: number) => toRupees(toEnteredBalance(a.type, v));
      return {
        name: a.name + (a.isActive ? "" : " (closed)"),
        type: accountTypeLabel(a.type),
        owner: a.owner?.name ?? "Joint",
        book: shown(p.book),
        current: shown(p.current),
        gain: accountGroup(a.type) === "INVESTMENT" ? toRupees(p.gain) : toRupees(0),
      };
    }),
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
