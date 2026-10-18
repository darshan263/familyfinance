/**
 * A one-line result banner, for telling someone what just happened after a redirect.
 *
 * Server actions here finish by redirecting, which loses any state they might have returned.
 * The outcome travels as a query parameter instead and gets rendered on arrival — otherwise
 * saving, settling up and deleting all complete in silence, and "did that work?" is only
 * answerable by hunting through the list.
 */
export function Notice({
  tone,
  children,
}: {
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  const ok = tone === "ok";
  return (
    <p
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: ok ? "var(--credit-soft)" : "var(--debit-soft)",
        color: ok ? "var(--credit)" : "var(--debit)",
      }}
      role="status"
    >
      {children}
    </p>
  );
}
