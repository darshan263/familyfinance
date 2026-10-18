/** Fixed avatar palette. Keys are stored on Member.color so colours survive renames. */
export const MEMBER_COLORS = [
  "indigo",
  "emerald",
  "amber",
  "rose",
  "sky",
  "violet",
  "teal",
  "orange",
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number];

export function swatch(color: string) {
  const key = (MEMBER_COLORS as readonly string[]).includes(color) ? color : "indigo";
  return {
    bg: `var(--c-${key}-bg)`,
    fg: `var(--c-${key}-fg)`,
    solid: `var(--c-${key}-fg)`,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
