import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { ANTHROPIC_RETENTION_URL, BOT, operatorName } from "./lib/bot";

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
/** A paragraph that opens a new group of points within a section. */
const LEAD = "m-0 mt-4 text-[13px] leading-5 text-text-2";
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

function Paras({ items }: { items: readonly string[] }) {
  return items.map((item) => (
    <p key={item} className={PARA}>
      {item}
    </p>
  ));
}

/** A page on another site, opened in a new tab. */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${LINK} inline-flex items-center gap-0.5`}>
      {children}
      <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
    </a>
  );
}

/**
 * The privacy policy of tonkfun.fun's Telegram bot, the page BotFather links
 * to: what it reads, what goes to the AI (Claude, by Anthropic), the little it
 * keeps and for how long, what it never does, your choices and rights, the
 * channel, Telegram's own policy, and where to ask. One reading column.
 */
export function PrivacyView({ p, href, updated }: PrivacyViewProps) {
  const names = { bot: BOT.name, handle: BOT.handle };
  const { reads, ai, keeps, never, rights } = p;
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
        <Section id="privacy-reads" title={reads.title}>
          <p className={PARA}>{reads.intro}</p>
          <DotList items={[reads.private, reads.community, reads.groups, fmt(reads.inline, names), reads.buttons]} />
          <p className={PARA}>{reads.profile}</p>
        </Section>
        <Section id="privacy-ai" title={ai.title}>
          <Paras items={[ai.who, ai.sent, ai.code]} />
          <p className={PARA}>
            {ai.retention} <ExternalLink href={ANTHROPIC_RETENTION_URL}>{ai.link}</ExternalLink>
          </p>
          <Paras items={[ai.secrets, ai.wrong, ai.decisions]} />
        </Section>
        <Section id="privacy-keeps" title={keeps.title}>
          <p className="m-0 mt-2.5 text-[14px] leading-[21px] font-medium text-text">{keeps.nothing}</p>
          <DotList items={[keeps.memory, keeps.wallet]} />
          <p className={LEAD}>{keeps.communityIntro}</p>
          <DotList items={[keeps.warnings, keeps.newcomers, keeps.checks, keeps.trusted, keeps.reviews, keeps.cleanup]} />
          <Paras items={[keeps.left, keeps.admins, keeps.counts]} />
        </Section>
        <Section id="privacy-never" title={never.title}>
          <DotList items={[never.keys, never.sign, never.dm]} />
          <p className="m-0 mt-4 flex gap-2 rounded-xl border border-line bg-raised/40 px-4 py-3.5 text-[13px] leading-5 text-text-2">
            <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none text-accent-text" />
            <span className="min-w-0">{never.site}</span>
          </p>
        </Section>
        <Section id="privacy-rights" title={rights.title}>
          <Paras items={[fmt(rights.who, { operator: operatorName(rights.team) }), rights.why, rights.recipients, rights.choose, rights.ask]} />
        </Section>
        <Section id="privacy-channel" title={p.channel.title}>
          <p className={PARA}>{p.channel.body}</p>
        </Section>
        <Section id="privacy-telegram" title={p.telegram.title}>
          <p className={PARA}>
            {p.telegram.body} <ExternalLink href="https://telegram.org/privacy">{p.telegram.link}</ExternalLink>
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
