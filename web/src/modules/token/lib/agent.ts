/**
 * The token's mission agent (Captain Boo on Ghosty): scripted answers built
 * from the token's own data, no AI service. A question is routed by keyword
 * to lock, crew or brief; anything else gets the "other" answer.
 */
import type { Dictionary } from "@/shared/i18n/dictionaries";
import { fmt } from "@/shared/i18n/config";
import { formatInteger, formatPrice, formatUsd, formatUsdCompact } from "@/shared/lib/format";
import type { CrewRewards, DevLock } from "@/shared/types/token-detail";

type AgentStrings = Dictionary["token"]["agent"];

export type ChipTone = "lock" | "crew" | "holders" | "price" | "plain";
export type Part = { kind: "text"; text: string } | { kind: "chip"; text: string; tone: ChipTone };
export type Topic = "lock" | "crew" | "brief" | "other";

export interface ChatMessage {
  id: number;
  from: "agent" | "user";
  parts: Part[];
}

/** What the agent knows. */
export interface AgentFacts {
  name: string;
  /** Bonding-curve progress in percent, or null once graduated. */
  curvePct: number | null;
  holders: number | null;
  priceUsd: number;
  devLock: DevLock | null;
  crew: CrewRewards | null;
  /** The lock's start date, already formatted ("Oct 18"). */
  lockStarted: string;
}

const text = (value: string): Part => ({ kind: "text", text: value });
const chip = (value: string, tone: ChipTone): Part => ({ kind: "chip", text: value, tone });

/** The first matching keyword list wins, in the export's order: lock, crew, brief. */
export function routeQuestion(question: string, a: Pick<AgentStrings, "kLock" | "kCrew" | "kBrief">): Topic {
  const low = question.toLowerCase();
  const hits = (list: string) => list.split("|").some((word) => word && low.includes(word.toLowerCase()));
  if (hits(a.kLock)) return "lock";
  if (hits(a.kCrew)) return "crew";
  if (hits(a.kBrief)) return "brief";
  return "other";
}

function chips(f: AgentFacts, a: AgentStrings) {
  const lock = f.devLock;
  return {
    curve: f.curvePct === null ? [] : [chip(fmt(a.cCurve, { pct: f.curvePct }), "price")],
    crew: f.crew ? [chip(fmt(a.cCrew, { usd: formatUsdCompact(f.crew.paidUsd) }), "crew")] : [],
    holders: f.holders === null ? [] : [chip(fmt(a.cHolders, { count: formatInteger(f.holders) }), "holders")],
    lockLeft: lock ? [chip(fmt(a.cLockLeft, { pct: Math.round(lock.share * 100), days: lock.vestDays - lock.elapsedDays }), "lock")] : [],
  };
}

/** The opening message. */
export function welcome(f: AgentFacts, a: AgentStrings): Part[] {
  const c = chips(f, a);
  const line =
    f.curvePct === null
      ? fmt(a.welcomeGraduated, { name: f.name })
      : fmt(f.crew ? a.welcome : a.welcomeCurve, { name: f.name, curve: f.curvePct });
  return [text(line), ...c.curve, ...c.crew, ...c.holders];
}

/** The answer to the opening exchange's "Is the dev wallet locked?", in the export's shorter form. */
export function firstLockReply(f: AgentFacts, a: AgentStrings): Part[] {
  const lock = f.devLock;
  if (!lock) return [text(a.noLock)];
  const pct = Math.round(lock.share * 100);
  return [text(fmt(a.lockFirst, { pct, days: lock.vestDays })), ...chips(f, a).lockLeft, chip(fmt(a.cLockContract, { address: lock.contract }), "plain")];
}

/** The answer to a question on one topic. */
export function reply(topic: Topic, f: AgentFacts, a: AgentStrings): Part[] {
  const c = chips(f, a);
  const lock = f.devLock;
  const crew = f.crew;
  switch (topic) {
    case "lock":
      if (!lock) return [text(a.noLock)];
      return [
        text(fmt(a.lock, { pct: Math.round(lock.share * 100), days: lock.vestDays, date: f.lockStarted, next: lock.nextUnlockDays })),
        ...c.lockLeft,
        chip(fmt(a.cNext, { days: lock.nextUnlockDays }), "lock"),
      ];
    case "crew":
      if (!crew) return [text(a.noCrew)];
      return [
        text(fmt(a.crew, { usd: formatUsd(crew.paidUsd, 0), pct: crew.sharePct })),
        ...c.crew,
        chip(fmt(a.cFee, { pct: crew.sharePct }), "crew"),
        chip(fmt(a.cPayout, { seconds: crew.lastPayoutSeconds }), "plain"),
      ];
    case "brief":
      return [
        text(f.curvePct !== null && crew ? a.brief : a.briefStatus),
        chip(fmt(a.cPrice, { price: formatPrice(f.priceUsd) }), "price"),
        ...c.holders,
        ...c.curve,
        ...(lock ? [chip(fmt(a.cLock, { pct: Math.round(lock.share * 100) }), "lock")] : []),
      ];
    case "other":
      return [text(a.other), ...c.holders];
  }
}

/** The conversation the export opens with: the welcome, then "Is the dev wallet locked?" and its answer. */
export function openingMessages(f: AgentFacts, a: AgentStrings): ChatMessage[] {
  return [
    { id: 1, from: "agent", parts: welcome(f, a) },
    { id: 2, from: "user", parts: [text(a.qLock)] },
    { id: 3, from: "agent", parts: firstLockReply(f, a) },
  ];
}
