/**
 * Account types and the three groups they fall into.
 *
 * The group is derived from the type, never stored, so an account cannot be "a mutual fund
 * that counts as cash". It decides three things:
 *
 *  - LIQUID accounts (bank, cash, wallet) hold a balance that is simply opening + flows. When
 *    the bank disagrees, the fix is an ADJUSTMENT entry, so the correction is visible in the
 *    account's history.
 *  - INVESTMENT accounts also track what they are actually worth, through Valuations. What went
 *    in and what it is worth now are different numbers, and the gap is the gain.
 *  - LIABILITY accounts (credit card, loan) hold a negative balance: money owed. They take
 *    Valuations too, because a loan's outstanding principal is what the lender's statement
 *    says, not something the household can reconstruct from EMIs.
 */

export const ACCOUNT_GROUPS = ["LIQUID", "INVESTMENT", "LIABILITY"] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];

export const ACCOUNT_TYPES = [
  { key: "SAVINGS", label: "Savings account", group: "LIQUID" },
  { key: "CURRENT", label: "Current account", group: "LIQUID" },
  { key: "CASH", label: "Cash", group: "LIQUID" },
  { key: "WALLET", label: "Wallet / UPI balance", group: "LIQUID" },
  { key: "FD", label: "Fixed deposit", group: "INVESTMENT" },
  { key: "RD", label: "Recurring deposit", group: "INVESTMENT" },
  { key: "MUTUAL_FUND", label: "Mutual fund", group: "INVESTMENT" },
  { key: "STOCKS", label: "Stocks / demat", group: "INVESTMENT" },
  { key: "PPF", label: "PPF", group: "INVESTMENT" },
  { key: "EPF", label: "EPF", group: "INVESTMENT" },
  { key: "NPS", label: "NPS", group: "INVESTMENT" },
  { key: "GOLD", label: "Gold", group: "INVESTMENT" },
  { key: "OTHER_ASSET", label: "Other asset", group: "INVESTMENT" },
  { key: "CREDIT_CARD", label: "Credit card", group: "LIABILITY" },
  { key: "LOAN", label: "Loan", group: "LIABILITY" },
] as const satisfies readonly { key: string; label: string; group: AccountGroup }[];

export type AccountType = (typeof ACCOUNT_TYPES)[number]["key"];

export const ACCOUNT_TYPE_KEYS = ACCOUNT_TYPES.map((t) => t.key) as [AccountType, ...AccountType[]];

export function isAccountType(value: string): value is AccountType {
  return ACCOUNT_TYPES.some((t) => t.key === value);
}

/** The group for a stored type. An unknown type is treated as liquid: the plainest reading. */
export function accountGroup(type: string): AccountGroup {
  return ACCOUNT_TYPES.find((t) => t.key === type)?.group ?? "LIQUID";
}

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPES.find((t) => t.key === type)?.label ?? type;
}

export const GROUP_LABELS: Record<AccountGroup, string> = {
  LIQUID: "Bank & cash",
  INVESTMENT: "Investments",
  LIABILITY: "Credit cards & loans",
};

/** Whether an account takes "Update value" snapshots rather than balance adjustments. */
export function takesValuations(type: string): boolean {
  return accountGroup(type) !== "LIQUID";
}

/**
 * Liabilities are stored negative but people think of them as a positive amount owed. These
 * two convert at the form boundary, so the sign convention never reaches a human.
 */
export function toStoredBalance(type: string, entered: number): number {
  return accountGroup(type) === "LIABILITY" ? -entered : entered;
}

export function toEnteredBalance(type: string, stored: number): number {
  return accountGroup(type) === "LIABILITY" ? -stored : stored;
}
