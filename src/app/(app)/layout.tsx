import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { getHouseholdName } from "@/lib/queries";
import { needsSetup, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (await needsSetup()) redirect("/setup");

  const user = await requireUser();
  const householdName = await getHouseholdName();

  return (
    <AppShell householdName={householdName} email={user.email}>
      {children}
    </AppShell>
  );
}
