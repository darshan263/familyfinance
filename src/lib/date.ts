/** Date helpers. Everything is in the server's local zone, which src/instrumentation.ts pins
 *  to India time (or APP_TIMEZONE) when the server starts. */

/** Where in the day a parsed `yyyy-mm-dd` should land. */
type DayEdge = "start" | "end" | "midday";

const TIME_OF_DAY: Record<DayEdge, string> = {
  start: "00:00:00",
  end: "23:59:59.999",
  // Stored dates sit at local midday so they cannot slip a day across time zones.
  midday: "12:00:00",
};

/**
 * Parse a `yyyy-mm-dd` string into a Date, or undefined if it is missing or not a real
 * date. The shape check alone is not enough: "2026-02-30" matches it and JavaScript rolls
 * it forward to 2 March, so the only reliable test is whether the parsed date formats back
 * to what was given.
 */
export function parseDay(
  value: string | null | undefined,
  edge: DayEdge = "start",
): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T${TIME_OF_DAY[edge]}`);
  if (Number.isNaN(d.getTime())) return undefined;
  return toDateInput(d) === value ? d : undefined;
}

/**
 * A date query parameter, keeping "absent" and "present but unusable" apart.
 *
 * `date` is declared on every branch so a caller that only wants the value can read it
 * without narrowing; `given` and `raw` are there for the callers that need to react to a bad
 * one.
 */
export type DayParam =
  | { given: false; date?: undefined; raw?: undefined }
  | { given: true; date: Date; raw?: undefined }
  | { given: true; date?: undefined; raw: string };

/**
 * Read a `yyyy-mm-dd` query parameter, reporting whether it was given at all. Callers decide
 * what an unusable value means: the Transactions page says so and carries on, the export
 * refuses, because silently widening an export is how the wrong numbers reach an accountant.
 */
export function readDayParam(
  value: string | null | undefined,
  edge: "start" | "end" = "start",
): DayParam {
  if (value === null || value === undefined || value === "") return { given: false };
  const date = parseDay(value, edge);
  return date ? { given: true, date } : { given: true, date: undefined, raw: value };
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayShortFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" });

export function formatDate(d: Date): string {
  return dayFmt.format(d);
}

/** Omits the year for dates in the current year, which is most of them. */
export function formatDateCompact(d: Date): string {
  return d.getFullYear() === new Date().getFullYear() ? dayShortFmt.format(d) : dayFmt.format(d);
}

export function formatMonth(d: Date): string {
  return monthFmt.format(d);
}

export function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateCompact(d);
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** The last `count` months as [start, end] pairs, oldest first. */
export function lastMonths(count: number, from = new Date()): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const anchor = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push({ start: startOfMonth(anchor), end: endOfMonth(anchor) });
  }
  return out;
}

export function endOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** The months from `from` to `to` inclusive as [start, end] pairs, oldest first. */
export function monthsBetween(from: Date, to: Date): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  let anchor = startOfMonth(from);
  while (anchor <= to) {
    out.push({ start: anchor, end: endOfMonth(anchor) });
    anchor = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  }
  return out;
}
