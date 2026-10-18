import type { SVGProps } from "react";

/** Inline 24px stroke icons. Bundled rather than pulled from an icon package so the
 *  set stays small and every glyph matches the same 1.7 stroke weight. */

type Props = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: Props) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.8V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.8" />
    <path d="M9.5 21v-6h5v6" />
  </Base>
);

export const IconList = (p: Props) => (
  <Base {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1.2" />
    <circle cx="3.5" cy="12" r="1.2" />
    <circle cx="3.5" cy="18" r="1.2" />
  </Base>
);

export const IconScale = (p: Props) => (
  <Base {...p}>
    <path d="M12 3v18M7 21h10" />
    <path d="M5 7h14" />
    <path d="M6.5 7 3.5 13.5h6L6.5 7Z" />
    <path d="M17.5 7l-3 6.5h6L17.5 7Z" />
  </Base>
);

export const IconUsers = (p: Props) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
    <path d="M16.5 5.6a3.2 3.2 0 0 1 0 6.1" />
    <path d="M17.8 14.4A6.2 6.2 0 0 1 21.6 20" />
  </Base>
);

export const IconChart = (p: Props) => (
  <Base {...p}>
    <path d="M3 3v17a1 1 0 0 0 1 1h17" />
    <path d="M7.5 16.5v-4M12 16.5v-8M16.5 16.5v-5.5M21 16.5v-10" />
  </Base>
);

export const IconSettings = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9.1 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9.1a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 8.88 4.8h.02A1.6 1.6 0 0 0 9.9 3.3V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77v.02a1.6 1.6 0 0 0 1.47.97H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5.97Z" />
  </Base>
);

export const IconPlus = (p: Props) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconLogout = (p: Props) => (
  <Base {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l-5-5 5-5" />
    <path d="M5 12h11" />
  </Base>
);

export const IconArrowRight = (p: Props) => (
  <Base {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </Base>
);

export const IconCheck = (p: Props) => (
  <Base {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 7" />
  </Base>
);

export const IconTrash = (p: Props) => (
  <Base {...p}>
    <path d="M3.5 6h17M8.5 6V4.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V6" />
    <path d="M5.5 6l.9 13.1a1 1 0 0 0 1 .9h9.2a1 1 0 0 0 1-.9L18.5 6" />
    <path d="M10 10.5v6M14 10.5v6" />
  </Base>
);

export const IconPencil = (p: Props) => (
  <Base {...p}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M14.5 6.5l3 3" />
  </Base>
);

export const IconSearch = (p: Props) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Base>
);

export const IconBuilding = (p: Props) => (
  <Base {...p}>
    <path d="M4 21V5.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V21" />
    <path d="M14 10h5a1 1 0 0 1 1 1v10" />
    <path d="M2.5 21h19" />
    <path d="M7 8.5h4M7 12.5h4M7 16.5h4M17 14.5h0M17 18h0" />
  </Base>
);

export const IconTrendUp = (p: Props) => (
  <Base {...p}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Base>
);

export const IconTrendDown = (p: Props) => (
  <Base {...p}>
    <path d="M3 7l6 6 4-4 8 8" />
    <path d="M15 17h6v-6" />
  </Base>
);

export const IconWallet = (p: Props) => (
  <Base {...p}>
    <path d="M20 8V6.5a1.5 1.5 0 0 0-1.5-1.5H5.2A2.2 2.2 0 0 0 3 7.2V18a2 2 0 0 0 2 2h13.5a1.5 1.5 0 0 0 1.5-1.5V16" />
    <path d="M3 7.2A2.2 2.2 0 0 0 5.2 9.4H20a1 1 0 0 1 1 1v3.2a1 1 0 0 1-1 1h-3.5a2.9 2.9 0 0 1 0-5.8" />
  </Base>
);

export const IconSwap = (p: Props) => (
  <Base {...p}>
    <path d="M7 4 3.5 7.5 7 11" />
    <path d="M3.5 7.5H17a3.5 3.5 0 0 1 0 7h-1" />
    <path d="M17 20l3.5-3.5L17 13" />
  </Base>
);

export const IconX = (p: Props) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconDownload = (p: Props) => (
  <Base {...p}>
    <path d="M12 3v12" />
    <path d="M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 19.5h16" />
  </Base>
);

export const IconFilter = (p: Props) => (
  <Base {...p}>
    <path d="M3.5 5.5h17l-6.6 7.7V20l-3.8-2v-5.3L3.5 5.5Z" />
  </Base>
);
