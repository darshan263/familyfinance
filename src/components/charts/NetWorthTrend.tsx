"use client";

import { useState } from "react";

import { formatMoney, formatMoneyShort } from "@/lib/money";

export interface WorthPoint {
  label: string;
  total: number;
  liquid: number;
  investments: number;
  liabilities: number;
}

/**
 * Net worth at each month end. One series, so one hue, a 2px line over a faint area, and no
 * legend: the title names it. Hovering a month shows its breakdown in a fixed slot above the
 * plot, with a crosshair and marker on the line.
 *
 * The SVG is stretched to the container (`preserveAspectRatio="none"`) with a non-scaling
 * stroke, so the line stays 2px at any width; everything with text in it is HTML, which a
 * stretched SVG would distort.
 */
export function NetWorthTrend({ data }: { data: WorthPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const values = data.map((d) => d.total);
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);
  const span = hi - lo || 1;
  const W = 100;
  const H = 100;
  const x = (i: number) => (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W);
  const step = data.length === 1 ? W : W / (data.length - 1);
  const y = (v: number) => H - ((v - lo) / span) * H;

  const line = data.map((d, i) => `${x(i)},${y(d.total)}`).join(" ");
  const area = `${x(0)},${y(lo)} ${line} ${x(data.length - 1)},${y(lo)}`;

  const active = hover === null ? data[data.length - 1] : data[hover];
  const first = data[0];
  const change = active && first ? active.total - first.total : 0;

  return (
    <figure className="m-0">
      <figcaption className="mb-1">
        <h2 className="text-base font-semibold">Net worth</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
          Month ends, last {data.length} months
        </p>
      </figcaption>

      <div className="mb-3 flex min-h-12 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
        {active && (
          <>
            <span className="font-semibold">{active.label}</span>
            <span className="tnum text-sm font-semibold">{formatMoney(active.total)}</span>
            <span className="tnum" style={{ color: "var(--text-muted)" }}>
              bank & cash {formatMoneyShort(active.liquid)} · investments{" "}
              {formatMoneyShort(active.investments)} · owed {formatMoneyShort(-active.liabilities)}
            </span>
            {hover !== null && hover > 0 && (
              <span className="tnum" style={{ color: "var(--text-muted)" }}>
                {change >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(change))} since {first.label}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <div
          className="tnum flex w-12 shrink-0 flex-col justify-between text-right text-[0.625rem]"
          style={{ color: "var(--text-faint)" }}
        >
          <span>{formatMoneyShort(hi)}</span>
          <span>{formatMoneyShort(lo)}</span>
        </div>

        <div className="relative h-40 flex-1" onMouseLeave={() => setHover(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            {lo < 0 && (
              <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
            <polygon points={area} fill="var(--chart-seq)" opacity={0.08} />
            <polyline
              points={line}
              fill="none"
              stroke="var(--chart-seq)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {hover !== null && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 w-px"
                style={{ left: `${x(hover)}%`, background: "var(--border-strong)" }}
              />
              <div
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${x(hover)}%`,
                  top: `${y(data[hover].total)}%`,
                  background: "var(--chart-seq)",
                  boxShadow: "0 0 0 2px var(--bg-elevated)",
                }}
              />
            </>
          )}

          {/* Hit targets: one full-height column per month, centred on its point. */}
          <div className="absolute inset-0">
            {data.map((d, i) => (
              <div
                key={d.label}
                className="absolute inset-y-0"
                style={{ left: `${x(i) - step / 2}%`, width: `${step}%` }}
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: net worth ${formatMoney(d.total)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex justify-between pl-14 text-[0.625rem]" style={{ color: "var(--text-faint)" }}>
        <span>{first?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </figure>
  );
}
