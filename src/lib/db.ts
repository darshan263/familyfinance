import { PrismaClient } from "@prisma/client";

import { toPaise } from "./money";

/**
 * The money columns are `BigInt` in the database, because a 32-bit column would cap a single
 * amount at ₹2.14 crore. The rest of the app works in plain `number`, which is exact for
 * integers up to 2^53 — far above anything a household will hold, and the only type that
 * `JSON.stringify`, `Intl.NumberFormat` and ordinary arithmetic all accept without ceremony.
 *
 * This extension converts those columns on the way out, with `toPaise` refusing anything
 * that would lose precision. Writes still take `bigint` — see `toCents` in `money.ts`.
 *
 * Two things it does **not** do:
 *
 *  - **Aggregates are not covered.** `result` extensions apply to model reads only, but
 *    Prisma still rewrites the aggregate's declared type to match, so `_sum.amountCents` is
 *    typed `number` and returns a `bigint`. Every `groupBy`/`aggregate` over money must go
 *    through `sumToPaise` — the types will not catch you.
 *  - **`compute` runs lazily**, at first property access rather than when the query
 *    resolves. A `try`/`catch` around the query will not catch a throw from `toPaise`.
 */
function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  }).$extends({
    result: {
      account: {
        openingBalanceCents: {
          needs: { openingBalanceCents: true },
          compute: (a) => toPaise(a.openingBalanceCents),
        },
      },
      transaction: {
        amountCents: { needs: { amountCents: true }, compute: (t) => toPaise(t.amountCents) },
      },
      valuation: {
        valueCents: { needs: { valueCents: true }, compute: (v) => toPaise(v.valueCents) },
      },
    },
  });
}

export type Db = ReturnType<typeof createPrismaClient>;

// The dev server hot-reloads modules; without this the process leaks a new connection
// pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const prisma: Db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
