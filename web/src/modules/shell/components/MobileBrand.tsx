import Link from "next/link";
import { Logo } from "./Logo";

/** Logo and wordmark at the start of the phone top bar (the rail holds the logo on desktop). */
export function MobileBrand() {
  return (
    <Link href="/" aria-label="Tonkpad.fun home" className="mr-auto flex items-center gap-2 rounded-full md:hidden">
      <Logo size={32} />
      <span className="font-display text-[19px] leading-6 font-extrabold tracking-[-0.02em] max-[359px]:hidden">
        Tonkpad
      </span>
    </Link>
  );
}
