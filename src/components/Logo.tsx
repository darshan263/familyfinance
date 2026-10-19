/**
 * The FamilyFinance mark: a house on a teal tile, with a terracotta door. Drawn inline so
 * it follows the theme tokens; `src/app/icon.svg` is the same drawing with fixed colours
 * for the browser tab.
 */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: "var(--accent)",
        boxShadow: "var(--shadow-sm)",
      }}
      aria-hidden="true"
    >
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24" fill="none">
        <path
          d="M3.5 11.2 12 4.5l8.5 6.7"
          stroke="var(--accent-text)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 9.6V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.6"
          stroke="var(--accent-text)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="10" y="13.5" width="4" height="6.5" rx="1.2" fill="var(--warm)" />
      </svg>
    </span>
  );
}
