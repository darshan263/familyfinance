import { redirect } from "next/navigation";

import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { safeNext } from "@/lib/auth";
import { getHouseholdName } from "@/lib/queries";
import { getCurrentUser, needsSetup } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  if (await needsSetup()) redirect("/setup");
  if (await getCurrentUser()) redirect("/");

  const { next, reason } = await searchParams;
  const householdName = await getHouseholdName();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <span className="mb-5 flex justify-center">
            <Logo size={56} />
          </span>
          <h1 className="text-[1.75rem] leading-tight">{householdName}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Sign in to FamilyFinance
          </p>
        </header>

        {reason === "unsaved" && (
          <div className="mb-4">
            <Notice tone="warn">
              You were signed out — perhaps the password was changed on another device — so your
              last change was not saved. Sign in and make it again.
            </Notice>
          </div>
        )}

        <LoginForm next={safeNext(next)} />
      </div>
    </div>
  );
}
