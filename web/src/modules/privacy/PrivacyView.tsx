import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { BOT } from "./lib/bot";

/** The page's messages, handed down from the page's getI18n(). */
export type PrivacyMessages = Dictionary["privacy"];

interface PrivacyViewProps {
  p: PrivacyMessages;
  /** Adds the language prefix to an app path. */
  href: (path: string) => string;
  /** When the policy last changed, already in the page's language. */
  updated: string;
}

const PARA = "m-0 mt-2.5 text-[13px] leading-5 text-text-2";
const LINK = "rounded font-medium text-accent-text hover:underline";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h2 id={`${id}-title`} className="font-display text-[18px] font-bold tracking-[-0.5px]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DotList({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-[13px] leading-5 text-text-2">
          <span aria-hidden="true" className="mt-2 size-1 flex-none rounded-full bg-text-3" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The privacy policy of tonkfun.fun's Telegram bot, the page BotFather links
 * to: what it reads, that it keeps nothing about anyone, what it never does,
 * the channel, Telegram's own policy, and where to ask. One reading column.
 */
export function PrivacyView({ p, href, updated }: PrivacyViewProps) {
  const names = { bot: BOT.name, handle: BOT.handle };
  return (
    <div className="mx-auto flex w-full max-w-[760px] min-w-0 flex-col">
      <header className="mb-[30px] max-[599px]:mb-[22px]">
        <div className="mb-2.5 flex items-center gap-2 text-[10px] font-semibold tracking-[1.7px] text-accent-text uppercase">
          <span aria-hidden="true" className="block h-px w-[22px] bg-accent" />
          {p.eyebrow}
        </div>
        <h1 className="font-display text-[38px] leading-[1.1] font-extrabold tracking-[-1.6px] max-[599px]:text-[28px] max-[599px]:tracking-[-1.1px]">{p.title}</h1>
        <p className="m-0 mt-[9px] max-w-[640px] text-[13px] leading-5 text-text-2">{fmt(p.subtitle, names)}</p>
        <p className="m-0 mt-1.5 text-[12px] leading-[18px] text-text-3">{fmt(p.updated, { date: updated })}</p>
      </header>
      <article className="flex min-w-0 flex-col gap-6 rounded-2xl border border-line bg-surface p-[22px] max-lg:p-[18px]">
        <Section id="privacy-reads" title={p.reads.title}>
          <p className={PARA}>{p.reads.intro}</p>
          <DotList items={[p.reads.private, p.reads.groups, fmt(p.reads.inline, names), p.reads.buttons]} />
          <p className={PARA}>{p.reads.profile}</p>
        </Section>
        <Section id="privacy-keeps" title={p.keeps.title}>
          <p className="m-0 mt-2.5 text-[14px] leading-[21px] font-medium text-text">{p.keeps.nothing}</p>
          <DotList items={[p.keeps.memory, p.keeps.wallet]} />
        </Section>
        <Section id="privacy-never" title={p.never.title}>
          <DotList items={[p.never.keys, p.never.sign]} />
          <p className="m-0 mt-4 flex gap-2 rounded-xl border border-line bg-raised/40 px-4 py-3.5 text-[13px] leading-5 text-text-2">
            <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none text-accent-text" />
            <span className="min-w-0">{p.never.site}</span>
          </p>
        </Section>
        <Section id="privacy-channel" title={p.channel.title}>
          <p className={PARA}>{p.channel.body}</p>
        </Section>
        <Section id="privacy-telegram" title={p.telegram.title}>
          <p className={PARA}>
            {p.telegram.body}{" "}
            <a href="https://telegram.org/privacy" target="_blank" rel="noopener noreferrer" className={`${LINK} inline-flex items-center gap-0.5`}>
              {p.telegram.link}
              <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
            </a>
          </p>
        </Section>
        <Section id="privacy-questions" title={p.questions.title}>
          <p className={PARA}>
            {p.questions.body}{" "}
            <Link href={href("/security")} className={LINK}>
              {p.questions.link}
            </Link>
          </p>
        </Section>
      </article>
    </div>
  );
}
