import Link from "next/link";

import { formatDateCompact } from "@/lib/date";
import { formatMoney } from "@/lib/money";
import { Avatar } from "./Avatar";
import { IconSwap } from "./Icons";

export interface TxnRowData {
  id: string;
  kind: string;
  description: string;
  date: Date;
  amountCents: number;
  account: { id: string; name: string };
  toAccount: { id: string; name: string } | null;
  category: { name: string } | null;
  member: { name: string; color: string } | null;
}

/**
 * One entry in a list. Income reads +, expense −, a transfer has no sign because it is
 * neither, and an adjustment shows its own sign. `balance` is the figure shown under the
 * amount on an account's own page.
 *
 * `viewingAccountId` turns a transfer into + or − from that account's side.
 */
export function TxnRow({
  t,
  balance,
  viewingAccountId,
}: {
  t: TxnRowData;
  balance?: number;
  viewingAccountId?: string;
}) {
  let amountText: string;
  let color = "var(--text)";
  if (t.kind === "INCOME") {
    amountText = `+${formatMoney(t.amountCents)}`;
    color = "var(--credit)";
  } else if (t.kind === "EXPENSE") {
    amountText = `−${formatMoney(t.amountCents)}`;
  } else if (t.kind === "ADJUSTMENT") {
    amountText = formatMoney(t.amountCents, { sign: true });
    color = "var(--text-muted)";
  } else if (viewingAccountId) {
    const incoming = t.toAccount?.id === viewingAccountId;
    amountText = `${incoming ? "+" : "−"}${formatMoney(t.amountCents)}`;
    color = "var(--text-muted)";
  } else {
    amountText = formatMoney(t.amountCents);
    color = "var(--text-muted)";
  }

  const detail =
    t.kind === "TRANSFER"
      ? `${t.account.name} → ${t.toAccount?.name ?? "?"}`
      : t.kind === "ADJUSTMENT"
        ? `Balance adjustment · ${t.account.name}`
        : `${t.category?.name ?? "Uncategorised"} · ${t.account.name}`;

  return (
    <Link
      href={`/transactions/${t.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]"
    >
      {t.kind === "TRANSFER" || t.kind === "ADJUSTMENT" ? (
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--neutral-soft)", color: "var(--text-muted)" }}
          title={t.kind === "TRANSFER" ? "Transfer" : "Adjustment"}
        >
          <IconSwap size={15} />
        </span>
      ) : (
        <Avatar name={t.member?.name ?? null} color={t.member?.color} />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{t.description}</span>
        <span className="block truncate text-xs" style={{ color: "var(--text-faint)" }}>
          {formatDateCompact(t.date)} · {detail}
          {t.kind === "TRANSFER" && t.member ? ` · ${t.member.name}` : ""}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="tnum block text-sm font-semibold" style={{ color }}>
          {amountText}
        </span>
        {balance !== undefined && (
          <span className="tnum block text-xs" style={{ color: "var(--text-faint)" }}>
            {formatMoney(balance)}
          </span>
        )}
      </span>
    </Link>
  );
}
