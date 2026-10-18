import { initials, swatch } from "@/lib/colors";
import { IconUsers } from "./Icons";

interface Props {
  /** Null for a Shared entry, which gets a group glyph instead of initials. */
  name: string | null;
  color?: string | null;
  size?: number;
}

/** Round member badge. */
export function Avatar({ name, color, size = 28 }: Props) {
  const s = swatch(color ?? "indigo");
  const shared = name === null;

  return (
    <span
      title={name ?? "Shared"}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none"
      style={{
        width: size,
        height: size,
        background: shared ? "var(--neutral-soft)" : s.bg,
        color: shared ? "var(--text-muted)" : s.fg,
        fontSize: Math.max(10, Math.round(size * 0.38)),
      }}
    >
      {shared ? <IconUsers size={Math.round(size * 0.55)} /> : initials(name)}
    </span>
  );
}
