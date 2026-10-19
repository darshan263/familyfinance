import { formatMoney } from "@/lib/money";

export interface CategorySlice {
  name: string;
  cents: number;
}

/**
 * Magnitude for a single series, so one hue carries it: the bar length is the encoding
 * and lightness steps only separate neighbouring rows. Sorted largest first, with the
 * value written beside every bar — no legend needed, the title names the series.
 */
export function CategoryBars({
  title,
  slices,
  emptyLabel,
}: {
  title: string;
  slices: CategorySlice[];
  emptyLabel: string;
}) {
  const total = slices.reduce((a, s) => a + s.cents, 0);
  const peak = Math.max(1, ...slices.map((s) => s.cents));

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg">{title}</h2>
        <span className="tnum text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          {formatMoney(total)}
        </span>
      </figcaption>

      {slices.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--text-faint)" }}>
          {emptyLabel}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {slices.map((s, i) => {
            const pct = total > 0 ? (s.cents / total) * 100 : 0;
            return (
              <div key={s.name} title={`${s.name}: ${formatMoney(s.cents)} (${pct.toFixed(1)}%)`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate">{s.name}</span>
                  <span className="tnum shrink-0" style={{ color: "var(--text-muted)" }}>
                    {formatMoney(s.cents)}
                    <span className="ml-1.5" style={{ color: "var(--text-faint)" }}>
                      {pct.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg-sunken)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(s.cents / peak) * 100}%`,
                      background: "var(--chart-seq)",
                      // Later rows fade slightly, reinforcing the sort without new hues.
                      opacity: 1 - Math.min(0.55, i * 0.07),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </figure>
  );
}
