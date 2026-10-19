import { z } from "zod";

import { parseDay } from "./date";
import { MAX_AMOUNT_CENTS, parseAmount } from "./money";

/**
 * Field parsers shared by the account and investment forms. (They cannot live in an actions
 * file: a "use server" module may only export server actions.)
 */

/** A `yyyy-mm-dd` date, stored at local midday so it cannot slip a day across time zones. */
export const dayField = z.string().transform((value, ctx) => {
  const date = parseDay(value, "midday");
  if (!date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pick a valid date" });
    return z.NEVER;
  }
  return date;
});

/**
 * An amount as typed, in paise. `allowNegative` is for an overdrawn bank account. A blank
 * opening balance reasonably means zero; a blank value update, adjustment or investment is a
 * mistake rather than a claim that something is worth nothing, so those pass `required`.
 * `positive` additionally refuses zero, for money that has to actually move.
 */
export function moneyField(
  label: string,
  { allowNegative = false, required = false, positive = false } = {},
) {
  return z.string().transform((value, ctx) => {
    if ((required || positive) && value.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is needed` });
      return z.NEVER;
    }
    const cents = value.trim() === "" ? 0 : parseAmount(value);
    if (cents === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} should be a number like 25000, with at most two decimal places`,
      });
      return z.NEVER;
    }
    if (!allowNegative && cents < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} cannot be negative` });
      return z.NEVER;
    }
    if (positive && cents <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be more than zero` });
      return z.NEVER;
    }
    if (Math.abs(cents) > MAX_AMOUNT_CENTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is too large` });
      return z.NEVER;
    }
    return cents;
  });
}

/** Optional free text: trimmed, capped, and null when empty. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
}

/** A string field from a form, or "" when absent. */
export function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
