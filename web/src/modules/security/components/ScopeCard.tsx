import { ArrowUpRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { fmt } from "@/shared/i18n/config";
import type { FrozenSource, ScopeId } from "../lib/frozen-build";
import type { ScopeAddresses } from "../lib/scope";
import { DotList, SecurityCard, type SecurityMessages, SubHeading } from "./SecurityCard";

interface ScopeCardProps {
  s: SecurityMessages;
  sources: readonly FrozenSource[];
  addresses: ScopeAddresses;
  frozenAt: string;
}

/** A label beside its value; stacked on phones. */
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 text-[12px] leading-5 max-[599px]:grid-cols-1">
      <dt className="text-text-3">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}

/** Text with every "SHA-256" kept on one line, rather than broken at its hyphen. */
function KeepTogether({ text, term }: { text: string; term: string }) {
  return text.split(term).map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? <span className="whitespace-nowrap">{term}</span> : null}
      {part}
    </Fragment>
  ));
}

/** The contract's address, linked to the explorer once deployed; the guard's is whatever the migrator names. */
function Address({ s, id, addresses }: { s: SecurityMessages; id: ScopeId; addresses: ScopeAddresses }) {
  if (addresses.state !== "deployed") {
    return <span className="text-text-3">{addresses.state === "elsewhere" ? s.scope.elsewhere : s.scope.notDeployed}</span>;
  }
  if (id === "guard") {
    return (
      <span className="text-text-2">
        {s.scope.guardFrom} <code className="font-mono [overflow-wrap:anywhere]">initializationGuard()</code>
      </span>
    );
  }
  const { address, url } = addresses[id];
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 rounded font-mono text-accent-text hover:underline">
      {/* Where a phone can't fit it on one line, two even halves rather than one stray character. */}
      <span className="min-w-0 break-all max-[599px]:w-[21ch]">{address}</span>
      <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" className="mt-[3px] flex-none" />
    </a>
  );
}

/** 2. Scope: the three frozen contracts with their addresses and source hashes, then what is out of scope. */
export function ScopeCard({ s, sources, addresses, frozenAt }: ScopeCardProps) {
  const sc = s.scope;
  const frozen = <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] font-medium text-text-3">{fmt(sc.frozen, { date: frozenAt })}</span>;
  return (
    <SecurityCard id="security-scope" title={sc.title} aside={frozen}>
      <p className="m-0 mt-2 text-[13px] leading-5 text-text-2">
        <KeepTogether text={sc.intro} term="SHA-256" />
      </p>
      <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
        {sources.map((source) => (
          <li key={source.id} className="rounded-xl border border-line bg-raised/40 p-4 max-[599px]:p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h3 className="text-[13px] font-semibold">{sc[source.id]}</h3>
              <code className="font-mono text-[11px] text-text-3 [overflow-wrap:anywhere]">{source.file}</code>
            </div>
            <dl className="m-0 mt-3 flex flex-col gap-2">
              <Row label={sc.contracts}>
                <span className="font-mono text-text-2 [overflow-wrap:anywhere]">{source.contracts.join(" · ")}</span>
              </Row>
              <Row label={sc.address}>
                <Address s={s} id={source.id} addresses={addresses} />
              </Row>
              <Row label={<KeepTogether text={sc.hash} term="SHA-256" />}>
                {/* Two even lines of 32 at any width (one text node, so it copies whole). */}
                <code className="block w-[32ch] max-w-full font-mono text-text-2 break-all">{source.sha256}</code>
              </Row>
            </dl>
          </li>
        ))}
      </ul>
      <SubHeading>{sc.outTitle}</SubHeading>
      <DotList items={[sc.hosting, sc.thirdParty, sc.social]} />
    </SecurityCard>
  );
}
