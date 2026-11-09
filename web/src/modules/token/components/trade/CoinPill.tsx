import type { ChainId } from "@/shared/types/chain";
import { ChainMark } from "@/shared/ui/ChainMark";
import { TokenArt } from "@/shared/ui/TokenArt";

type CoinPillProps =
  | { kind: "chain"; chain: ChainId; label: string }
  | { kind: "token"; art: string; ticker: string; label: string };

/** The unit beside an amount: the chain's coin with its mark, or the token with its art. */
export function CoinPill(props: CoinPillProps) {
  return (
    <span className="inline-flex h-9 flex-none items-center gap-1.5 rounded-[18px] border border-line-strong bg-input pr-3 pl-1.5 text-[14px] font-semibold">
      {props.kind === "chain" ? (
        <ChainMark chain={props.chain} size={22} letterSize={10} decorative />
      ) : (
        <TokenArt src={props.art} label={props.ticker} size={22} className="size-[22px] rounded-[7px]" />
      )}
      {props.label}
    </span>
  );
}
