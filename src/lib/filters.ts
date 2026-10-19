import type { Prisma } from "@prisma/client";

import type { TxnKind } from "./txn";

/**
 * Which entries a list, total or export covers. Pure — no database — so the rules every
 * figure depends on (deleted entries never count, Shared means no member) are tested directly.
 */

/** `memberId: "shared"` in a URL means entries with no member. A cuid can never equal it. */
export const SHARED = "shared";

export interface TxnFilter {
  from?: Date;
  to?: Date;
  /** Only these kinds. An empty list matches nothing, rather than silently meaning "all". */
  kinds?: TxnKind[];
  /** Entries that touch this account, from either side of a transfer. */
  accountId?: string;
  categoryId?: string;
  memberId?: string;
  search?: string;
}

export function whereFromFilter(filter: TxnFilter): Prisma.TransactionWhereInput {
  // Soft-deleted entries are excluded here, once, for every query built from a filter.
  const where: Prisma.TransactionWhereInput = { deletedAt: null };
  if (filter.from || filter.to) {
    where.date = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
  }
  if (filter.kinds) where.kind = { in: filter.kinds };
  if (filter.accountId) {
    where.OR = [{ accountId: filter.accountId }, { toAccountId: filter.accountId }];
  }
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.memberId) where.memberId = filter.memberId === SHARED ? null : filter.memberId;
  return where;
}
