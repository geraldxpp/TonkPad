import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { AppShell } from "@/modules/shell/components/AppShell";
import { getShellData } from "@/modules/shell/data/get-shell-data";
import { pageTitle, SITE_NAME } from "@/modules/shell/lib/meta";
import { THEME_COLORS, THEME_SCRIPT } from "@/modules/shell/lib/theme";
import { htmlLang, isLocale, LOCALES } from "@/shared/i18n/config";
import { DICTIONARIES } from "@/shared/i18n/dictionaries";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import { getI18n } from "@/shared/i18n/server";
import "@/styles/globals.css";

// Only Latin is preloaded; Cyrillic, Vietnamese and Latin Extended load on demand.
// Chinese, Japanese and Korean use the system's CJK fonts.
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

/** Every language is prerendered. */
export async function generateStaticParams() {
  return LOCALES.map(({ code }) => ({ lang: code }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: SITE_NAME, template: pageTitle("%s") },
    description: t.meta.description,
  };
}

export const viewport: Viewport = {
  // Lets the phone tab bar pad itself for the iPhone home indicator.
  viewportFit: "cover",
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const shell = await getShellData();
  return (
    // Dark by default; THEME_SCRIPT swaps in a saved light theme before the first paint.
    <html
      lang={htmlLang(lang)}
      data-theme="dark"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content={THEME_COLORS.dark} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <I18nProvider lang={lang} messages={DICTIONARIES[lang]}>
          <AppShell data={shell}>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
