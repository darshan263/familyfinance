export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.875rem] leading-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-faint)" }}>
        {label}
      </p>
      <p className="figure mt-1.5 text-[1.6rem] leading-tight">{children}</p>
      {hint && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
