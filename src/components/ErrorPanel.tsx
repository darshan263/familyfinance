"use client";

import { useEffect } from "react";

/**
 * What someone sees when a page fails to render.
 *
 * The important part is the digest. Next.js hashes a server-side error, logs the real stack
 * under that hash, and sends only the hash to the browser. Showing it is what turns "it broke"
 * into something an operator can actually find in the logs — without it, a report is
 * unactionable and the stack trace might as well not exist.
 *
 * The wording is deliberately careful. A render failure means this page could not be drawn.
 * It says nothing about whether a save went through, so this must not claim the ledger is
 * fine, and must not claim anything was lost either. Entries are written by server actions,
 * which report their own outcome; the honest instruction is to go and look.
 */
export function ErrorPanel({
  error,
  reset,
  scope,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  /** Where this boundary sits, so the copy can be specific about what to check. */
  scope: "app" | "public" | "root";
}) {
  useEffect(() => {
    // Server errors are already logged with their digest; this covers the client half and
    // puts something in the browser console for whoever is looking.
    console.error("[familyfinance] render failed:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg p-6">
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>

        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {scope === "root"
            ? "FamilyFinance could not start up properly."
            : "This page could not be displayed."}
        </p>

        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          {scope === "public"
            ? "Nothing about your account has changed. Try again in a moment."
            : "This does not tell us whether a save went through. If you were adding or " +
              "editing an entry, open Transactions and check whether it is there before " +
              "entering it again."}
        </p>

        {error.digest && (
          <div
            className="mt-4 rounded-xl px-4 py-3"
            style={{ background: "var(--bg-sunken)" }}
          >
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              Quote this reference when reporting it — it is how the full error is found in
              the server logs.
            </p>
            <code className="tnum mt-1 block font-mono text-sm break-all">{error.digest}</code>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {reset && (
            <button className="btn btn-primary" onClick={reset} type="button">
              Try again
            </button>
          )}
          <a className="btn btn-secondary" href={scope === "public" ? "/login" : "/"}>
            {scope === "public" ? "Back to sign in" : "Back to the dashboard"}
          </a>
        </div>
      </div>
    </div>
  );
}
