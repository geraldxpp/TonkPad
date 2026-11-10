import type { ChainId } from "@/shared/types/chain";
import { ChainMark } from "@/shared/ui/ChainMark";
import { TokenArt } from "@/shared/ui/TokenArt";

type CoinPillProps =
  | { kind: "chain"; chain: ChainId; label: string }
  | { kind: "token"; art: string; ticker: string; label: string };

/** The unit beside an amount: the chain's coin with its mark, or the token with its art. */
export function CoinPill(props: CoinPillProps) {
  return (
    <span className="inline-flex h-8 flex-none items-center gap-1.5 rounded-lg border border-line bg-raised pr-2.5 pl-1.5 font-mono text-[12px] font-semibold">
      {props.kind === "chain" ? (
        <ChainMark chain={props.chain} size={18} letterSize={9} decorative />
      ) : (
        <TokenArt src={props.art} label={props.ticker} size={18} className="size-[18px] rounded-[5px]" />
      )}
      {props.label}
    </span>
  );
}
