import { ArrowUpRight } from "lucide-react";
import type { DocsContract } from "../lib/contracts";
import type { DocsMessages } from "./ui";

/** The mainnet contracts and their owner, each linked to its verified source (the Safe to its page) on Blockscout. */
export function ContractList({ d, contracts }: { d: DocsMessages; contracts: readonly DocsContract[] }) {
  const s = d.safety;
  return (
    <dl className="m-0 mt-3 flex flex-col gap-2.5">
      {contracts.map((contract) => (
        <div key={contract.id} className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[12px] leading-5 max-[599px]:grid-cols-1">
          <dt className="text-text-3">{s[contract.id]}</dt>
          <dd className="m-0 min-w-0">
            <a href={contract.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 rounded font-mono text-accent-text hover:underline">
              {/* Where a phone can't fit it on one line, two even halves rather than one stray character. */}
              <span className="min-w-0 break-all max-[599px]:w-[21ch]">{contract.address}</span>
              <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" className="mt-[3px] flex-none" />
            </a>
          </dd>
        </div>
      ))}
    </dl>
  );
}
