import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/shared/ui/Button";

interface LaterPanelProps {
  title: string;
  children?: ReactNode;
}

/** Placeholder for screens that arrive in later modules. */
export function LaterPanel({ title, children }: LaterPanelProps) {
  return (
    <section
      aria-labelledby="later-title"
      className="flex max-w-[640px] flex-col items-start gap-4 rounded-[20px] border border-line bg-surface p-8 shadow-panel"
    >
      <span className="rounded-full border border-line bg-raised px-3 py-1 text-[12px] font-semibold text-accent-text">
        Coming in a later module
      </span>
      <h1 id="later-title" className="font-display text-[32px] leading-9 font-bold tracking-[-0.015em]">
        {title}
      </h1>
      <p className="text-[15px] leading-6 text-text-2">
        {children ?? "This screen is designed and will be built in a later module."}
      </p>
      <Link href="/" className={buttonClasses("secondary", "sm")}>
        Back to Explore
      </Link>
    </section>
  );
}
