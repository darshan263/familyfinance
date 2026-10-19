import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { toDateInput } from "@/lib/date";
import { getMembers } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { AccountForm } from "../AccountForm";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  await requireUser();
  const members = await getMembers();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Add account"
        subtitle={
          <>
            A bank account, cash, a credit card or a loan. Adding a mutual fund, stocks, an FD or
            PPF?{" "}
            <Link className="link" href="/investments/new">
              Add it under Investments
            </Link>
            .
          </>
        }
      />
      <AccountForm
        groups={["LIQUID", "LIABILITY"]}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        today={toDateInput(new Date())}
      />
    </div>
  );
}
