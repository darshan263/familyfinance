import { PageHeader } from "@/components/PageHeader";
import { toDateInput } from "@/lib/date";
import { getMembers } from "@/lib/queries";
import { AccountForm } from "../AccountForm";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const members = await getMembers();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add account"
        subtitle="A bank account, cash, an investment, a credit card or a loan."
      />
      <AccountForm
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        today={toDateInput(new Date())}
      />
    </div>
  );
}
