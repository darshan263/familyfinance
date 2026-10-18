import { formatMoney } from "@/lib/money";

interface Props {
  cents: number;
  /** auto: green when positive, red when negative. */
  tone?: "auto" | "plain" | "credit" | "debit";
  sign?: boolean;
  /** Print the magnitude only. Use where a nearby word already says the direction. */
  magnitude?: boolean;
  whole?: boolean;
  className?: string;
}

export function Money({
  cents,
  tone = "plain",
  sign = false,
  magnitude = false,
  whole = false,
  className = "",
}: Props) {
  let color: string | undefined;
  if (tone === "auto") color = cents > 0 ? "var(--credit)" : cents < 0 ? "var(--debit)" : undefined;
  else if (tone === "credit") color = "var(--credit)";
  else if (tone === "debit") color = "var(--debit)";

  return (
    <span className={`tnum ${className}`} style={color ? { color } : undefined}>
      {formatMoney(magnitude ? Math.abs(cents) : cents, { sign, whole })}
    </span>
  );
}
