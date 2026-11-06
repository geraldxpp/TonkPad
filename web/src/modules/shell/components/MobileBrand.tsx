import Link from "next/link";
import { getI18n } from "@/shared/i18n/server";
import { Logo } from "./Logo";

/**
 * The logo at the start of the phone top bar (the rail holds it on desktop).
 * The wordmark only joins it from 640 px, leaving room for the language and
 * theme buttons on phones.
 */
export async function MobileBrand() {
  const { t, href } = await getI18n();
  return (
    <Link href={href("/")} aria-label={t.nav.home} className="mr-auto flex items-center gap-2 rounded-full md:hidden">
      <Logo size={32} />
      <span className="hidden font-display text-[19px] leading-6 font-extrabold tracking-[-0.02em] sm:inline">
        Tonkpad
      </span>
    </Link>
  );
}
