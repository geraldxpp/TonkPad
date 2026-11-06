import Link from "next/link";
import { getI18n } from "@/shared/i18n/server";
import { Logo } from "./Logo";

/** Logo and wordmark at the start of the phone top bar (the rail holds the logo on desktop). */
export async function MobileBrand() {
  const { t, href } = await getI18n();
  return (
    <Link href={href("/")} aria-label={t.nav.home} className="mr-auto flex items-center gap-2 rounded-full max-[374px]:gap-1.5 md:hidden">
      <Logo size={32} />
      <span className="font-display text-[19px] leading-6 font-extrabold tracking-[-0.02em] max-[374px]:text-[17px] max-[359px]:hidden">
        Tonkpad
      </span>
    </Link>
  );
}
