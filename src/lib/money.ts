/**
 * All money in FamilyFinance is stored and computed as integer paise. Floats only ever
 * appear at the edges: parsing what a human typed, and formatting for display.
 */

export const CURRENCY_SYMBOL = "\u20B9";

/**
 * Largest amount a single entry can hold, in paise: \u20B91,000 crore.
 *
 * The database itself is not the constraint \u2014 the money columns are 64-bit `BigInt`, good
 * for about \u20B9922 crore crore. The real bound is that the app computes in `number`, which is
 * exact only up to 2^53 paise (about \u20B990 lakh crore). Capping one entry at 1/9007th of that
 * leaves room for nine thousand maximum-size entries before any *total* could reach the
 * edge, so every sum in the app stays exact by construction.
 *
 * This is the limit quoted to the user, checked up front by the `amount` field of `txnSchema`
 * (lib/txn.ts) and the `money` parser in accounts/actions.ts. `toPaise` is the backstop at
 * the real edge, for anything that gets past them.
 */
export const MAX_AMOUNT_CENTS = 1_000_00_00_00_000;

/**
 * Read a money value out of the database. Integer `number` is exact to 2^53, and every
 * amount is capped far below that, so this should never fail \u2014 but a ledger that quietly
 * rounds someone's money is worse than one that stops, so it checks rather than assumes.
 */
export function toPaise(value: bigint | number): number {
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(n)) {
    throw new Error(
      `Money value ${value} is too large to compute with exactly. The ledger has been left untouched.`,
    );
  }
  return n;
}

/** Write a money value to the database, which holds paise as 64-bit integers. */
export function toCents(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Refusing to store ${value}, which is not a whole number of paise.`);
  }
  return BigInt(value);
}

/**
 * Read a money total out of a Prisma aggregate (`_sum`, `groupBy`).
 *
 * Use this for every aggregate over a money column, and never trust the declared type. The
 * client extension in `lib/db.ts` converts money on *model* reads only; Prisma still
 * rewrites the aggregate's type to match, so `_sum.amountCents` is typed `number` while a
 * `bigint` comes back at runtime. Arithmetic on it then throws "Cannot mix BigInt and other
 * types" — or, worse, `Math.abs` fails inside a formatter deep in a page render.
 *
 * Takes `unknown` on purpose: accepting the lying type would let the mistake through.
 */
export function sumToPaise(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint" || typeof value === "number") return toPaise(value);
  throw new Error(`Expected a money total, got ${typeof value}.`);
}

/**
 * Parse "1,234.5" / "₹1234" / "-250" into paise. Returns null if it is not an amount.
 *
 * Built from the digits rather than through a float: `Number("1.005") * 100` is 100.49999…,
 * which would round a typed paisa away without a word. A third decimal place is refused for
 * the same reason: there is no such thing as a fraction of a paisa to keep.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s,\u20B9]/g, "");
  const m = cleaned.match(/^(-?)(\d*)(?:\.(\d{0,2}))?$/);
  if (!m || (m[2] === "" && !m[3])) return null;
  const paise = Number(m[2] || "0") * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) return null;
  return m[1] && paise !== 0 ? -paise : paise;
}

/** Paise -> a plain editable decimal string, e.g. 123456 -> "1234.56". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

const inr = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format paise as ₹1,23,456.78 (Indian digit grouping). */
export function formatMoney(cents: number, opts: { sign?: boolean; whole?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const body = opts.whole ? inrWhole.format(Math.round(abs / 100)) : inr.format(abs / 100);
  const sign = cents < 0 ? "-" : opts.sign && cents > 0 ? "+" : "";
  return `${sign}${CURRENCY_SYMBOL}${body}`;
}

/** Short form for dense chart labels: ₹1.2L, ₹45.0K, ₹320. */
export function formatMoneyShort(cents: number): string {
  const rupees = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (rupees >= 1_00_00_000) return `${sign}${CURRENCY_SYMBOL}${(rupees / 1_00_00_000).toFixed(1)}Cr`;
  if (rupees >= 1_00_000) return `${sign}${CURRENCY_SYMBOL}${(rupees / 1_00_000).toFixed(1)}L`;
  if (rupees >= 1_000) return `${sign}${CURRENCY_SYMBOL}${(rupees / 1_000).toFixed(1)}K`;
  return `${sign}${CURRENCY_SYMBOL}${inrWhole.format(Math.round(rupees))}`;
}
