import { Bot, Crown, Flame, GraduationCap, Lock, Zap } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export type BadgeKind = "locked" | "crew" | "agent" | "hot" | "og" | "new" | "graduated";

interface BadgeProps {
  kind: BadgeKind;
  /** Crew fee share, e.g. "2%". Only used by the crew badge. */
  value?: string;
  /** "card" uses the slightly stronger fills from the token-card art. */
  tone?: "default" | "card";
  /** "compact" is the tighter right padding used in table rows. */
  density?: "comfortable" | "compact";
}

const BORDERED = {
  locked: {
    default: "text-locked bg-[rgba(20,208,143,0.14)] border-[rgba(20,208,143,0.38)]",
    card: "text-locked bg-[rgba(20,208,143,0.16)] border-[rgba(20,208,143,0.42)]",
  },
  crew: {
    default: "text-gold bg-[rgba(140,123,255,0.16)] border-[rgba(244,197,83,0.38)]",
    card: "text-gold bg-[rgba(140,123,255,0.2)] border-[rgba(244,197,83,0.42)]",
  },
  agent: {
    default: "text-agent bg-[rgba(90,169,255,0.14)] border-[rgba(90,169,255,0.38)]",
    card: "text-agent bg-[rgba(90,169,255,0.16)] border-[rgba(90,169,255,0.42)]",
  },
} as const;

const BASE = "inline-flex items-center rounded-md py-0.5 pl-[5px] text-[11px] font-semibold whitespace-nowrap";

export function Badge({ kind, value, tone = "default", density = "comfortable" }: BadgeProps) {
  const right = density === "compact" ? "pr-1.5" : "pr-[7px]";

  switch (kind) {
    case "hot":
      return (
        <span title="Hot" className="inline-flex rounded-md bg-[rgba(255,122,69,0.14)] px-1 py-0.5 text-hot">
          <Flame size={12} fill="currentColor" stroke="none" role="img" aria-label="Hot" />
        </span>
      );
    case "og":
      return (
        <span className={cn(BASE, right, "gap-[3px] bg-[rgba(244,197,83,0.14)] text-gold")}>
          <Crown size={11} fill="currentColor" stroke="none" />
          OG
        </span>
      );
    case "new":
      return (
        <span className={cn(BASE, right, "gap-[3px] bg-[rgba(140,123,255,0.14)] text-accent-text")}>
          <Zap size={11} fill="currentColor" stroke="none" />
          New
        </span>
      );
    case "graduated":
      return (
        <span className={cn(BASE, "gap-1 pr-[7px] bg-[rgba(244,197,83,0.14)] text-gold")}>
          <GraduationCap size={12} strokeWidth={2.2} />
          Graduated
        </span>
      );
    case "locked":
      return (
        <span className={cn(BASE, right, "gap-1 border", BORDERED.locked[tone])}>
          <Lock size={11} strokeWidth={2.6} />
          Locked
        </span>
      );
    case "crew":
      return (
        <span className={cn(BASE, right, "gap-1 border", BORDERED.crew[tone])}>
          <Zap size={11} fill="currentColor" stroke="none" />
          Crew {value}
        </span>
      );
    case "agent":
      return (
        <span className={cn(BASE, right, "gap-1 border", BORDERED.agent[tone])}>
          <Bot size={11} strokeWidth={2.4} />
          Agent
        </span>
      );
  }
}
