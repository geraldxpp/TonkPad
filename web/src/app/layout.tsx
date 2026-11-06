import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/modules/shell/components/AppShell";
import { getShellData } from "@/modules/shell/data/get-shell-data";
import "@/styles/globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bricolage",
  display: "swap",
});

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Tonkpad.fun", template: "%s — Tonkpad.fun" },
  description:
    "Every new token across Solana and Robinhood Chain — safety-scored, fee-sharing, and one tap from your wallet.",
};

export const viewport: Viewport = {
  themeColor: "#07080D",
  colorScheme: "dark",
  // Lets the phone tab bar pad itself for the iPhone home indicator.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const shell = await getShellData();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <AppShell data={shell}>{children}</AppShell>
      </body>
    </html>
  );
}
