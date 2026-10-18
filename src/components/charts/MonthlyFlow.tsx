"use client";

import { useState } from "react";

import { formatMoney, formatMoneyShort } from "@/lib/money";

export interface MonthPoint {
  label: string;
  income: number;
  expense: number;
}

/**
 * Money in and money out, month by month.
 *
 * Income rises above the baseline and expense falls below it, so the two series are told
 * apart by POSITION rather than by colour. That matters: the app's green/credit and
 * red/debit pair sits at a CVD separation of ~5 Delta E, well under the safe threshold, so
 * a red-green viewer could not distinguish them on colour alone. Up versus down is
 * unambiguous for everyone, and the colours merely reinforce it.
 */
export function MonthlyFlow({
  data,
  title = "Money in and out",
  aboveLabel = "Income",
  belowLabel = "Expense",
}: {
  data: MonthPoint[];
  /** Defaults describe the household; callers can relabel all three. */
  title?: string;
  aboveLabel?: string;
  belowLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const peak = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const active = hover === null ? null : data[hover];

  const totals = data.reduce(
    (a, d) => ({ income: a.income + d.income, expense: a.expense + d.expense }),
    { income: 0, expense: 0 },
  );
  const net = totals.income - totals.expense;

  return (
    <figure className="m-0">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
            Last {data.length} months · net{" "}
            <span
              className="tnum font-semibold"
              style={{ color: net >= 0 ? "var(--credit)" : "var(--debit)" }}
            >
              {net >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(net))}
            </span>
          </p>
        </div>

        {/* A legend is always present for two series. */}
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: "var(--chart-in)" }}
            />
            <span style={{ color: "var(--text-muted)" }}>{aboveLabel} (above)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: "var(--chart-out)" }}
            />
            <span style={{ color: "var(--text-muted)" }}>{belowLabel} (below)</span>
          </span>
        </div>
      </figcaption>

      {/* Hover readout, held in a fixed-height slot so the chart never jumps. */}
      <div className="mb-2 flex h-9 items-center">
        {active ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
            <span className="font-semibold">{active.label}</span>
            <span className="tnum" style={{ color: "var(--chart-in)" }}>
              {aboveLabel.toLowerCase()} {formatMoney(active.income)}
            </span>
            <span className="tnum" style={{ color: "var(--chart-out)" }}>
              {belowLabel.toLowerCase()} {formatMoney(active.expense)}
            </span>
            <span className="tnum" style={{ color: "var(--text-muted)" }}>
              net {active.income - active.expense >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(active.income - active.expense))}
            </span>
          </div>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            Hover a month for the exact figures.
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto pb-1" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => {
          const on = hover === i;
          return (
            <div
              key={d.label}
              className="flex min-w-[2.1rem] flex-1 cursor-default flex-col rounded-lg py-1 transition-colors"
              style={{ background: on ? "var(--bg-hover)" : "transparent" }}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              role="img"
              aria-label={`${d.label}: ${aboveLabel} ${formatMoney(d.income)}, ${belowLabel} ${formatMoney(d.expense)}`}
            >
              {/* Income, growing up from the baseline */}
              <div className="flex h-[70px] flex-col justify-end px-[3px]">
                <div
                  className="rounded-t-[4px]"
                  style={{
                    height: `${(d.income / peak) * 100}%`,
                    background: "var(--chart-in)",
                    opacity: hover === null || on ? 1 : 0.45,
                    minHeight: d.income > 0 ? 2 : 0,
                    transition: "opacity 0.12s ease",
                  }}
                />
              </div>

              {/* The zero line. The 2px gap keeps the two fills from touching. */}
              <div className="my-[1px] h-px" style={{ background: "var(--border-strong)" }} />

              {/* Expense, growing down */}
              <div className="flex h-[70px] flex-col px-[3px]">
                <div
                  className="rounded-b-[4px]"
                  style={{
                    height: `${(d.expense / peak) * 100}%`,
                    background: "var(--chart-out)",
                    opacity: hover === null || on ? 1 : 0.45,
                    minHeight: d.expense > 0 ? 2 : 0,
                    transition: "opacity 0.12s ease",
                  }}
                />
              </div>

              <span
                className="mt-1.5 text-center text-[0.625rem] leading-tight whitespace-nowrap"
                style={{ color: on ? "var(--text)" : "var(--text-faint)" }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[0.6875rem]" style={{ color: "var(--text-faint)" }}>
        Tallest bar = {formatMoneyShort(peak)}
      </p>
    </figure>
  );
}
