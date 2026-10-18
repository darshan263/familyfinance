"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  IconChart,
  IconHome,
  IconList,
  IconLogout,
  IconPlus,
  IconSettings,
  IconUsers,
  IconWallet,
  IconX,
} from "./Icons";

const NAV = [
  { href: "/", label: "Dashboard", Icon: IconHome },
  { href: "/transactions", label: "Transactions", Icon: IconList },
  { href: "/accounts", label: "Accounts", Icon: IconWallet },
  { href: "/reports", label: "Reports", Icon: IconChart },
  { href: "/members", label: "Members", Icon: IconUsers },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

interface Props {
  householdName: string;
  email: string;
  children: React.ReactNode;
}

export function AppShell({ householdName, email, children }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const navLinks = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors"
            style={{
              background: active ? "var(--accent-soft)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebarBody = (
    <div className="flex h-full flex-col gap-5 p-4">
      <Link href="/" className="flex items-center gap-2.5 px-1">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-base font-bold"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          ₹
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[0.9375rem] leading-tight font-semibold">
            {householdName}
          </span>
          <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
            FamilyFinance
          </span>
        </span>
      </Link>

      <Link href="/transactions/new" className="btn btn-primary w-full">
        <IconPlus size={16} />
        Add entry
      </Link>

      {navLinks}

      <div className="mt-auto">
        <div
          className="flex items-center gap-2.5 rounded-[10px] p-2"
          style={{ background: "var(--bg-sunken)" }}
        >
          <span className="min-w-0 flex-1 px-1">
            <span className="block text-xs" style={{ color: "var(--text-faint)" }}>
              Signed in as
            </span>
            <span className="block truncate text-sm font-medium">{email}</span>
          </span>
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-ghost btn-sm" title="Sign out" type="submit">
              <IconLogout size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside
        className="hidden w-60 shrink-0 border-r lg:block"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div className="sticky top-0 h-screen">{sidebarBody}</div>
      </aside>

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-2.5 lg:hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="flex-1 truncate text-[0.9375rem] font-semibold">{householdName}</span>
        <Link href="/transactions/new" className="btn btn-primary btn-sm">
          <IconPlus size={15} />
          Add
        </Link>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0"
            style={{ background: "rgb(0 0 0 / 0.5)" }}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 w-[17rem] shadow-lg"
            style={{ background: "var(--bg-elevated)" }}
          >
            <button
              className="btn btn-ghost btn-sm absolute top-3 right-3"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              <IconX size={18} />
            </button>
            {sidebarBody}
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
