import "server-only";

import { getAccounts, getCategories, getMembers } from "@/lib/queries";
import type { FormAccount, FormCategory, FormMember } from "./TxnForm";

/** Everything the entry form offers, inactive items included so old entries still edit. */
export async function getFormOptions(): Promise<{
  accounts: FormAccount[];
  categories: FormCategory[];
  members: FormMember[];
}> {
  const [accounts, categories, members] = await Promise.all([
    getAccounts(true),
    getCategories({ includeInactive: true }),
    getMembers(true),
  ]);
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, isActive: a.isActive })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, isActive: c.isActive })),
    members: members.map((m) => ({ id: m.id, name: m.name, isActive: m.isActive })),
  };
}
