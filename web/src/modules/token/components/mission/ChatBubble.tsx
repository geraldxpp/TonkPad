import { cn } from "@/shared/lib/cn";
import type { ChatMessage, ChipTone } from "../../lib/agent";

/** The export's chip tones, mapped to theme tokens (its blue "holders" chip is the accent here). */
const TONE: Record<ChipTone, string> = {
  lock: "border-locked/38 bg-locked/14 text-locked",
  crew: "border-gold/38 bg-accent/16 text-gold",
  holders: "border-accent/38 bg-accent/14 text-accent-text",
  price: "border-cyan/35 bg-cyan/12 text-cyan",
  plain: "border-line-strong bg-input text-text-2",
};

/** One message: who said it, then its text and fact chips. */
export function ChatBubble({ message, who }: { message: ChatMessage; who: string }) {
  const agent = message.from === "agent";
  return (
    <div className={cn("tk-in flex min-w-0 max-w-[88%] flex-col gap-1", agent ? "self-start" : "self-end")}>
      <span className={cn("text-[11px] text-text-3", agent ? "self-start" : "self-end")}>{who}</span>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 border px-3 py-2.5 text-[13px] leading-[19px]",
          agent ? "rounded-[4px_14px_14px_14px] border-line bg-raised" : "rounded-[14px_4px_14px_14px] border-accent/40 bg-accent/16",
        )}
      >
        {message.parts.map((part, i) =>
          part.kind === "text" ? (
            <span key={i} className="min-w-0 max-w-full [overflow-wrap:anywhere]">{part.text}</span>
          ) : (
            <span key={i} className={cn("inline-flex max-w-full items-center rounded-[7px] border px-2 py-0.5 font-mono text-[11px] leading-4 font-medium [overflow-wrap:anywhere]", TONE[part.tone])}>
              {part.text}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
