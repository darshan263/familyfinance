import { endOfMonth, formatDate, readDayParam, startOfMonth } from "./date";

/**
 * The periods on the Reports page. Unlike the rolling windows on Transactions, these are
 * calendar periods, bounded at both ends, because a report compares like with like: a month,
 * a financial year.
 *
 * The financial year is India's, April to March, since that is the year tax, Form 16 and
 * most investment statements are reckoned in.
 */
export type PeriodKey = "month" | "lastmonth" | "fy" | "lastfy" | "12m" | "all";

export const DEFAULT_PERIOD: PeriodKey = "month";

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "12m", label: "Last 12 months" },
  { key: "fy", label: "This FY" },
  { key: "lastfy", label: "Last FY" },
  { key: "all", label: "All time" },
];

export function isPeriodKey(value: string | null | undefined): value is PeriodKey {
  return PERIODS.some((p) => p.key === value);
}

/** The year a financial year starts in: FY 2026-27 starts in April 2026. */
export function fyStartYear(d: Date): number {
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

export function periodBounds(
  key: PeriodKey,
  now = new Date(),
): { from?: Date; to?: Date; label: string } {
  switch (key) {
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now), label: monthName.format(now) };
    case "lastmonth": {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev), label: monthName.format(prev) };
    }
    case "12m": {
      const first = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return { from: first, to: endOfMonth(now), label: "the last 12 months" };
    }
    case "fy": {
      const y = fyStartYear(now);
      return {
        from: new Date(y, 3, 1),
        to: new Date(y + 1, 2, 31, 23, 59, 59, 999),
        label: fyLabel(y),
      };
    }
    case "lastfy": {
      const y = fyStartYear(now) - 1;
      return {
        from: new Date(y, 3, 1),
        to: new Date(y + 1, 2, 31, 23, 59, 59, 999),
        label: fyLabel(y),
      };
    }
    case "all":
      return { label: "all time" };
  }
}

export interface ResolvedPeriod {
  /** The preset in force, or null when explicit dates are. */
  key: PeriodKey | null;
  from?: Date;
  to?: Date;
  label: string;
  /** Dates that were given but could not be read, quoted back so the page can say so. */
  unusable: string[];
}

/** Explicit dates win over a preset, as on the Transactions page. */
export function resolvePeriod(
  params: { period?: string | null; from?: string | null; to?: string | null },
  now = new Date(),
): ResolvedPeriod {
  const from = readDayParam(params.from);
  const to = readDayParam(params.to, "end");
  const unusable = [from, to].filter((p) => p.given && !p.date).map((p) => p.raw ?? "");

  if (from.date || to.date) {
    const label =
      from.date && to.date
        ? `${formatDate(from.date)} to ${formatDate(to.date)}`
        : from.date
          ? `since ${formatDate(from.date)}`
          : `up to ${formatDate(to.date!)}`;
    return { key: null, from: from.date, to: to.date, label, unusable };
  }

  const key = isPeriodKey(params.period) ? params.period : DEFAULT_PERIOD;
  return { key, ...periodBounds(key, now), unusable };
}
