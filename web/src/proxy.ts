import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, localizePath } from "@/shared/i18n/config";

/**
 * Language routing. Every page lives under app/[lang]:
 * - English is served at the unprefixed URLs (/, /live) by rewriting to /en/….
 * - Other languages keep their prefix (/es, /es/live).
 * - An unprefixed URL sends someone who picked another language (the
 *   tonkpad-lang cookie) to that language's version.
 * Unknown paths fall through to app/[lang]/[...rest], the translated 404.
 *
 * Prefixed paths, /en/… included, always pass straight through: Next can run
 * the proxy again on a rewritten URL, so it must leave /en/… alone (a redirect
 * from /en/… back to /… would loop).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isLocale(pathname.split("/")[1])) return NextResponse.next();

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved) && saved !== DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = localizePath(saved, pathname);
    return NextResponse.redirect(url);
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except the API, Next internals, the token art in public/tokens
  // and the app icons. Add new public/ folders here so they are not localised.
  matcher: ["/((?!api/|_next/|__nextjs|_vercel/|tokens/|launchpads/|icon\\.png|apple-icon\\.png).*)"],
};
