"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

/**
 * Errors inside the signed-in app. This boundary sits below `(app)/layout.tsx`, so the
 * sidebar and navigation stay put and only the page area is replaced — someone can get to
 * Transactions and check what actually happened.
 *
 * This is also where a lazily-computed money field lands if it throws: the client extension
 * in `lib/db.ts` converts BigInt columns on first property access, which can be during
 * render, well after the query a `try`/`catch` would have wrapped.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel error={error} reset={reset} scope="app" />;
}
