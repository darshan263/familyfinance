import { formatDate, readDayParam } from "./date";

/**
 * The quick date ranges on the Transactions page.
 *
 * The page opens on the last 30 days rather than every entry ever made, because "what happened
 * recently" is the question almost every visit is asking, and because the list gets longer
 * every week while that question does not. Everything older is one chip away.
 *
 * The window is never applied silently: the chip row says which one is in force and the
 * heading names it in prose. A list that quietly hides entries is how someone concludes the
 * app lost them.
 */
export type RangeKey = "10d" | "30d" | "lastmonth" | "6m" | "1y" | "all";

/** What the page shows when nothing in the URL asks for anything else. */
export const DEFAULT_RANGE: RangeKey = "30d";

/** In the order they appear in the chip row, narrowest first. */
export const RANGES: { key: RangeKey; label: string; hint: string }[] = [
  { key: "10d", label: "10 days", hint: "The last 10 days, today included" },
  { key: "30d", label: "30 days", hint: "The last 30 days, today included" },
  { key: "lastmonth", label: "Last month", hint: "The whole of the previous calendar month" },
  { key: "6m", label: "6 months", hint: "The last six months" },
  { key: "1y", label: "1 year", hint: "The last twelve months" },
  { key: "all", label: "All time", hint: "Every entry ever recorded" },
];

export function isRangeKey(value: string | null | undefined): value is RangeKey {
  return RANGES.some((r) => r.key === value);
}

/** `n` days before `d`, at the first instant of that day. */
function daysBefore(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
}

/**
 * `n` months before `d`, at the first instant of that day, with the day-of-month clamped to
 * the length of the target month.
 *
 * Without the clamp, `new Date(y, m - 6, 31)` rolls forward into the following month, so six
 * months back from 31 August would start on 3 March and quietly drop the last days of
 * February from a window that claimed to include them.
 */
function monthsBefore(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() - n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}

/**
 * The dates a preset covers.
 *
 * The rolling windows deliberately leave `to` open. They mean "since then", not "between
 * these two dates", and bounding them at today would make an entry dated next week vanish
 * the moment it was saved. "Last month" is a calendar window, so it is bounded at both ends
 * by definition.
 */
export function rangeBounds(key: RangeKey, now = new Date()): { from?: Date; to?: Date } {
  switch (key) {
    case "10d":
      return { from: daysBefore(now, 9) };
    case "30d":
      return { from: daysBefore(now, 29) };
    case "lastmonth":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case "6m":
      return { from: monthsBefore(now, 6) };
    case "1y":
      return { from: monthsBefore(now, 12) };
    case "all":
      return {};
  }
}

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" });

function presetLabel(key: RangeKey, from: Date | undefined): string {
  switch (key) {
    case "10d":
      return "last 10 days";
    case "30d":
      return "last 30 days";
    case "lastmonth":
      return from ? monthName.format(from) : "last month";
    case "6m":
      return "last 6 months";
    case "1y":
      return "last year";
    case "all":
      return "all time";
  }
}

function customLabel(from: Date | undefined, to: Date | undefined): string {
  if (from && to) return `${formatDate(from)} to ${formatDate(to)}`;
  if (from) return `since ${formatDate(from)}`;
  return `up to ${formatDate(to!)}`;
}

export interface ResolvedRange {
  /** The preset in force, or null when explicit from/to dates are driving the list. */
  key: RangeKey | null;
  from?: Date;
  to?: Date;
  /** The window in prose, for the heading: "last 10 days", "September 2026", "all time". */
  label: string;
  /** True when nothing in the URL asked for this window — it is the default. */
  implicit: boolean;
}

/**
 * Work out which window the list should show, from whatever is in the URL.
 *
 * Explicit dates beat a preset. Picking a chip drops any dates, but the filter form keeps the
 * current preset in a hidden field, so submitting dates sends both. The dates win, because
 * typing a range is the more deliberate act of the two.
 *
 * A date that is present but unparseable counts as absent here; the Transactions page
 * reports it separately rather than letting it take the list down.
 */
export function resolveRange(
  params: { range?: string | null; from?: string | null; to?: string | null },
  now = new Date(),
): ResolvedRange {
  const from = readDayParam(params.from);
  const to = readDayParam(params.to, "end");

  if (from.date || to.date) {
    return {
      key: null,
      from: from.date,
      to: to.date,
      label: customLabel(from.date, to.date),
      implicit: false,
    };
  }

  const key: RangeKey = isRangeKey(params.range) ? params.range : DEFAULT_RANGE;
  const bounds = rangeBounds(key, now);
  return {
    key,
    ...bounds,
    label: presetLabel(key, bounds.from),
    implicit: !isRangeKey(params.range),
  };
}
