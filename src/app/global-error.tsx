"use client";

import { ErrorPanel } from "@/components/ErrorPanel";

import "./globals.css";

/**
 * The last resort: an error in the root layout itself, which the boundaries below it cannot
 * catch. This replaces the whole document, so it has to supply its own `<html>` and `<body>`
 * — and import the stylesheet, since the root layout that normally does so is what failed.
 *
 * Reaching this means something is wrong with the deployment rather than with a page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorPanel error={error} reset={reset} scope="root" />
      </body>
    </html>
  );
}
