"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

/**
 * Errors on the pages outside the signed-in app — `/login` and `/setup`.
 *
 * The likeliest cause here is configuration rather than data: a missing or too-short
 * `AUTH_SECRET` makes `signSession` throw, and the database being unreachable breaks the
 * `needsSetup` check both pages start with.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel error={error} reset={reset} scope="public" />;
}
