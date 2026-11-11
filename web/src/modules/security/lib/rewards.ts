export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low"];

/** Each severity's reward as the owner set it, or null until it is set ("Decided case by case"). */
export type Rewards = Record<Severity, string | null>;

/** Longer than this is not an amount, and counts as unset. */
const MAX_LENGTH = 40;

/** An amount as the owner wrote it ("$25,000", "5 ETH"), on one line; blank counts as unset. */
export function parseAmount(value: string | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text && text.length <= MAX_LENGTH ? text : null;
}

/** This build's rewards, from NEXT_PUBLIC_BOUNTY_*: never a made-up amount. */
export function bountyRewards(): Rewards {
  return {
    critical: parseAmount(process.env.NEXT_PUBLIC_BOUNTY_CRITICAL),
    high: parseAmount(process.env.NEXT_PUBLIC_BOUNTY_HIGH),
    medium: parseAmount(process.env.NEXT_PUBLIC_BOUNTY_MEDIUM),
    low: parseAmount(process.env.NEXT_PUBLIC_BOUNTY_LOW),
  };
}
