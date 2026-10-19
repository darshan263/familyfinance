import { PageHeader } from "@/components/PageHeader";
import { accountGroup } from "@/lib/accounts";
import { toDateInput } from "@/lib/date";
import { getAccounts, getDefaultFundingAccountId, getMembers } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { NewInvestmentForm } from "../NewInvestmentForm";

export const dynamic = "force-dynamic";

export default async function NewInvestmentPage() {
  await requireUser();
  const [members, accounts, defaultFromId] = await Promise.all([
    getMembers(),
    getAccounts(),
    getDefaultFundingAccountId(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add investment" subtitle="Something you already hold, or something you are buying now." />
      <NewInvestmentForm
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        bankAccounts={accounts
          .filter((a) => accountGroup(a.type) === "LIQUID")
          .map((a) => ({ id: a.id, name: a.name }))}
        defaultFromId={defaultFromId}
        today={toDateInput(new Date())}
      />
    </div>
  );
}
