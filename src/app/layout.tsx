import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

// Self-hosted by next/font at build time: no request to Google from a visitor's browser.
const body = DM_Sans({ subsets: ["latin"], variable: "--ff-body", display: "swap" });
const display = Fraunces({
  subsets: ["latin"],
  variable: "--ff-display",
  display: "swap",
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: "FamilyFinance",
  description: "The household's accounts, investments, income and spending in one place",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#171513" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
