import { type BudgetStatus, LANES, TRIAGE_MODEL } from "../claude/types";
import { escapeHtml as esc, fill, safeText } from "../text";
import type { View } from "../types";
import type { ChatSettings, CounterKey } from "./types";
import type { CommunityDictionary } from "./words";

/** The queues /status shows (agent/jobs.ts): answers, and Haiku's checks. */
export type QueueName = "answers" | "checks";

export interface StatusInput {
  /** The group's title, as getChat gave it (cleaned here). */
  title: string;
  /** Today's counters (records.counts). */
  counts: Record<CounterKey, number>;
  /** The AI budget's state, or null when AI can't run here at all. */
  budget: BudgetStatus | null;
  settings: ChatSettings;
  /** The knowledge pack's health (PackSource.health()): read for `local` and `site` (hash prefixes), `match` and `contact`. */
  knowledge: Record<string, unknown> | null;
  /** The bot's own rights in the group, or null when Telegram can't say. */
  rights: { delete: boolean; restrict: boolean } | null;
  /** Jobs waiting in each queue (JobQueue.stats().waiting); a queue left out isn't shown. */
  queues: Partial<Record<QueueName, number>>;
  /** The model answers run on (TELEGRAM_AI_ANSWER_MODEL), shown with the checks' under the budget while AI can run; left out, neither is shown. */
  answerModel?: string;
  /** Now (ms): raid mode is on while settings.raidUntil is later. Without it, any raidUntil above 0 reads as on. */
  now?: number;
}

/** Today's numbers in three groups, in the order the team reads them. */
const SECTIONS: ReadonlyArray<{ label: "answers" | "moderation" | "members"; keys: readonly CounterKey[] }> = [
  { label: "answers", keys: ["answers", "proactive", "private", "refused", "escalated", "crisis"] },
  { label: "moderation", keys: ["removed", "warned", "muted", "banned", "held", "reports", "appeals"] },
  { label: "members", keys: ["checked", "passed", "kicked"] },
];

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const usd = (n: number) => USD.format(Number.isFinite(n) ? n : 0);
const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0).toLocaleString("en-US");
/** "13:05 UTC". */
const utcTime = (ms: number) => `${new Date(ms).toISOString().slice(11, 16)} UTC`;
/** A figure after its label in the bot's words ("Direct answers 3"). */
const figure = (text: string, value: string) => `${esc(text)} ${value}`;
/** The contact's state after its name, as code: the dictionaries have no words for it. */
const named = (key: string, value: string) => `<code>${esc(key)}</code> ${value}`;
/** A model ID, as code: names of models aren't translated. */
const code = (value: string) => `<code>${esc(value)}</code>`;
const label = (text: string) => `<b>${esc(text)}</b>`;
/** Each queue's label: the answers' section word, and the checks' lane word. */
const QUEUES: ReadonlyArray<{ key: QueueName; label: (w: CommunityDictionary) => string }> = [
  { key: "answers", label: (w) => w.admin.status.answers },
  { key: "checks", label: (w) => w.admin.lanes.triage },
];
/** A hash prefix as the pack's health gives it, or null. */
const hashOf = (value: unknown) => (typeof value === "string" && /^[0-9a-f]{4,64}$/i.test(value) ? value : null);

/** Why every model call is off, in the bot's words where it has them, and until when for a pause that ends by itself. */
function offReason(b: BudgetStatus, w: CommunityDictionary): string | null {
  const until = b.until !== null && Number.isFinite(b.until) ? ` (${utcTime(b.until)})` : "";
  if (b.reason === "cap") return fill(w.admin.budget.cap, { cap: esc(usd(b.capUsd)) }) + until;
  if (b.reason === "circuit") return esc(w.admin.budget.circuit) + until;
  // A ramp limit's wait (Anthropic's retry-after) and a refused key's hour refuse every call until they end.
  if (b.reason === "ramp") return esc(w.admin.budget.ramp) + until;
  if (b.reason === "auth") return esc(w.admin.budget.auth) + until;
  if (b.reason === "billing") return esc(w.admin.budget.billing);
  if (b.reason === "not_found") return esc(w.admin.budget.notFound);
  return null;
}

/**
 * The day's spend against the cap, AI on or off and why, then each lane
 * against its cap, then the models answers and checks run on: model IDs as
 * code, after the queues' words for answers and checks.
 */
function budgetLines(b: BudgetStatus | null, w: CommunityDictionary, answerModel: string | undefined): string[] {
  const head = label(w.admin.status.budget);
  if (!b) return [`${head}: ${esc(w.admin.buttons.aiOff)}`];
  const state = b.on ? [esc(w.admin.buttons.aiOn)] : [esc(w.admin.buttons.aiOff), offReason(b, w)];
  const lanes = LANES.map((lane) => figure(w.admin.lanes[lane], `${usd(b.lanes[lane]?.spentUsd ?? 0)} / ${usd(b.lanes[lane]?.capUsd ?? 0)}`));
  const lines = [`${head}: ${[`${usd(b.spentUsd)} / ${usd(b.capUsd)}`, ...state].filter(Boolean).join(" · ")}`, lanes.join(" · ")];
  if (answerModel) lines.push(`${figure(w.admin.status.answers, code(answerModel))} · ${figure(w.admin.lanes.triage, code(TRIAGE_MODEL))}`);
  return lines;
}

/** The strictness, raid mode, unprompted answers and whether answers are paused. */
function modeLine(s: ChatSettings, now: number, w: CommunityDictionary): string {
  const b = w.admin.buttons;
  const raid = s.raidUntil > now ? `${esc(b.raidOn)} (${utcTime(s.raidUntil)})` : esc(b.raidOff);
  const parts = [esc(w.admin.levels[s.strictness] ?? s.strictness), raid, esc(s.proactive ? b.proactiveOn : b.proactiveOff)];
  if (s.paused) parts.push(esc(w.answer.paused));
  return `${label(w.admin.status.mode)}: ${parts.join(" · ")}`;
}

/** The worker's and the site's pack hashes, a warning when they differ, and the Security contact's state. */
function knowledgeLine(k: Record<string, unknown> | null, w: CommunityDictionary): string {
  const parts: string[] = [];
  for (const hash of [hashOf(k?.local), hashOf(k?.site)]) if (hash) parts.push(`<code>${hash}</code>`);
  if (k?.match === false) parts.push(esc(w.admin.knowledge.stale));
  const contact = k?.contact;
  if (contact === "set" || contact === "none" || contact === "unknown") parts.push(named("contact", esc(contact)));
  if (contact === "none") parts.push(esc(w.admin.setup.contact));
  return `${label(w.admin.status.knowledge)}: ${parts.length > 0 ? parts.join(" · ") : "?"}`;
}

/** The two rights the bot needs, and a warning naming the group when one is missing. */
function rightsLine(r: StatusInput["rights"], group: string, w: CommunityDictionary): string {
  if (!r) return `${label(w.admin.status.rights)}: ?`;
  const parts = [r.delete ? esc(w.admin.buttons.delete) : null, r.restrict ? esc(w.admin.buttons.ban) : null];
  if (!r.delete || !r.restrict) parts.push(fill(w.admin.rights.missing, { group: group || "?" }));
  return `${label(w.admin.status.rights)}: ${parts.filter(Boolean).join(" · ")}`;
}

/**
 * /status for one group, for the admin chat only (the public /health shows
 * none of it): today's answers, refusals and cases sent; what moderation
 * removed, warned, muted and banned; the new-member checks; AI spending per
 * lane against its cap, whether AI is on and why not, and the models answers
 * and checks run on; the mode and raid mode; the knowledge match and the
 * Security contact; the bot's rights; and the queues. The group's title is
 * cleaned; everything else is the bot's words and numbers, but for the
 * contact's state, the pack's hashes and the model IDs.
 */
export function statusView(input: StatusInput, words: CommunityDictionary): View {
  const w = words.admin.status;
  const group = safeText(input.title, 64);
  const lines = [group ? `${label(w.title)} · ${group}` : label(w.title)];
  for (const section of SECTIONS) {
    const figures = section.keys.map((key) => figure(words.admin.counters[key], count(input.counts[key])));
    lines.push(`${label(w[section.label])}: ${figures.join(" · ")}`);
  }
  lines.push(...budgetLines(input.budget, words, input.answerModel));
  lines.push(modeLine(input.settings, input.now ?? 0, words));
  lines.push(knowledgeLine(input.knowledge, words));
  lines.push(rightsLine(input.rights, group, words));
  const queues = QUEUES.filter((q) => input.queues[q.key] !== undefined).map((q) => figure(q.label(words), count(input.queues[q.key])));
  if (queues.length > 0) lines.push(`${label(w.queues)}: ${queues.join(" · ")}`);
  return { text: lines.join("\n") };
}
