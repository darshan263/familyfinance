import { redirect } from "next/navigation";

import { toDateInput } from "@/lib/date";
import { needsSetup } from "@/lib/session";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-16">
      <header className="mb-8">
        <span
          className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          ₹
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Set up FamilyFinance</h1>
        <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
          One place for the household&apos;s money: what is in each account, what it is worth,
          what comes in and where it goes.
        </p>
      </header>

      <SetupForm today={toDateInput(new Date())} />
    </div>
  );
}
