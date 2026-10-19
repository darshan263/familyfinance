import { z } from "zod";

import { parseDay } from "./date";
import { MAX_AMOUNT_CENTS, formatMoney, parseAmount } from "./money";

/**
 * What an entry is allowed to be, and what it does to balances.
 *
 * `signedEffects` is the only place in the app that knows which kind moves which account in
 * which direction. Balances, net worth, account history and the tests all go through it.
 */

export const TXN_KINDS = ["EXPENSE", "INCOME", "TRANSFER", "ADJUSTMENT"] as const;
export type TxnKind = (typeof TXN_KINDS)[number];

/** The kinds a person picks on the entry form. Adjustments come from an account's page. */
export const FORM_KINDS = ["EXPENSE", "INCOME", "TRANSFER"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export function isTxnKind(value: string | null | undefined): value is TxnKind {
  return TXN_KINDS.includes(value as TxnKind);
}

export const KIND_LABELS: Record<TxnKind, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
  TRANSFER: "Transfer",
  ADJUSTMENT: "Balance adjustment",
};

/**
 * Whether an entry counts as money earned or spent. Transfers and adjustments move or
 * correct money the household already had, so counting them would inflate both sides — a
 * ₹10,000 SIP is not ₹10,000 of spending.
 */
export function isReportable(kind: string): kind is "EXPENSE" | "INCOME" {
  return kind === "EXPENSE" || kind === "INCOME";
}

export interface TxnMovement {
  kind: string;
  amountCents: number;
  accountId: string;
  toAccountId: string | null;
}

export interface Effect {
  accountId: string;
  deltaCents: number;
}

/** What one entry does to each account it touches, from the household's point of view. */
export function signedEffects(t: TxnMovement): Effect[] {
  switch (t.kind) {
    case "INCOME":
      return [{ accountId: t.accountId, deltaCents: t.amountCents }];
    case "EXPENSE":
      return [{ accountId: t.accountId, deltaCents: -t.amountCents }];
    case "TRANSFER":
      if (!t.toAccountId) throw new Error("A transfer has no destination account.");
      return [
        { accountId: t.accountId, deltaCents: -t.amountCents },
        { accountId: t.toAccountId, deltaCents: t.amountCents },
      ];
    case "ADJUSTMENT":
      return [{ accountId: t.accountId, deltaCents: t.amountCents }];
    default:
      // A kind this code does not know would silently move nothing, and every balance built
      // on it would be wrong without saying so.
      throw new Error(`Unknown entry kind "${t.kind}".`);
  }
}

// --------------------------------------------------------------------------------------
// The entry form
// --------------------------------------------------------------------------------------

const amount = z
  .string()
  .transform((value, ctx) => {
    const cents = parseAmount(value);
    if (cents === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter an amount, like 1250 or 1,250.50 (at most two decimal places)" });
      return z.NEVER;
    }
    if (cents <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The amount must be more than zero" });
      return z.NEVER;
    }
    if (cents > MAX_AMOUNT_CENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A single entry can be at most ${formatMoney(MAX_AMOUNT_CENTS, { whole: true })}`,
      });
      return z.NEVER;
    }
    return cents;
  });

const day = z.string().transform((value, ctx) => {
  // Stored at local midday so the date cannot slip across a time-zone boundary.
  const date = parseDay(value, "midday");
  if (!date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick a valid date" });
    return z.NEVER;
  }
  return date;
});

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const base = {
  amount,
  date: day,
  description: z.string().trim().min(1, "Add a short description").max(120),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
  accountId: z.string().trim().min(1, "Pick an account"),
  memberId: optionalId,
};

export const txnSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("EXPENSE"),
      ...base,
      categoryId: z.string().trim().min(1, "Pick a category"),
    }),
    z.object({
      kind: z.literal("INCOME"),
      ...base,
      categoryId: z.string().trim().min(1, "Pick a category"),
    }),
    z.object({
      kind: z.literal("TRANSFER"),
      ...base,
      toAccountId: z.string().trim().min(1, "Pick the account the money went to"),
    }),
  ])
  .superRefine((v, ctx) => {
    if (v.kind === "TRANSFER" && v.toAccountId === v.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toAccountId"],
        message: "A transfer has to go to a different account",
      });
    }
  });

export type TxnInput = z.output<typeof txnSchema>;

/** Read the entry form. Fields that do not belong to the chosen kind are ignored. */
export function readTxnForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return txnSchema.safeParse({
    kind: get("kind"),
    amount: get("amount") ?? "",
    date: get("date") ?? "",
    description: get("description") ?? "",
    notes: get("notes"),
    accountId: get("accountId") ?? "",
    toAccountId: get("toAccountId") ?? "",
    categoryId: get("categoryId") ?? "",
    memberId: get("memberId"),
  });
}

/** The columns an entry writes, with the fields its kind does not use cleared. */
export function txnColumns(input: TxnInput) {
  return {
    kind: input.kind,
    amountCents: input.amount,
    date: input.date,
    description: input.description,
    notes: input.notes,
    accountId: input.accountId,
    toAccountId: input.kind === "TRANSFER" ? input.toAccountId : null,
    categoryId: input.kind === "TRANSFER" ? null : input.categoryId,
    memberId: input.memberId,
  };
}
