import type Anthropic from "@anthropic-ai/sdk";
import { isLocale } from "@/shared/i18n/config";
import { clip, visibleText } from "../../text";
import { MAX_REQUEST_CHARS, worstCaseUsd } from "../claude/prices";
import { type Budget, type ClaudeClient, type ClaudeOutcome, TRIAGE_MODEL } from "../claude/types";
import { type AllowList, type OfficialAccounts, type RuleCategory, type RuleResult, type Standing, TRIAGE_CATEGORIES, type TriageInput, type TriageVerdict } from "../community/types";
import { NEEDS_HUMAN, QUESTIONS, TRIAGE_SCHEMA, triageSystem, triageUserContent, VERDICT_FIELDS, VERDICTS } from "./triage-prompt";

/**
 * Haiku's check (prompts/15-community-agent.md, Haiku's check): which
 * messages the rules can't settle go to Claude Haiku 5.5, the one request
 * that classifies one of them, and the verdict read back. Every failure,
 * refusal or odd reply comes back as null, the caller's fail-closed case:
 * the rules' decision stands.
 */

/** Fixed per call type: changing thinking or effort would invalidate the cache. Thinking off is accepted at effort low on Haiku 5.5. */
export const TRIAGE_SETTINGS: { readonly maxTokens: 400; readonly effort: "low"; readonly timeoutMs: 10000 } = Object.freeze({
  maxTokens: 400,
  effort: "low",
  timeoutMs: 10_000,
} as const);

/**
 * Settled by the rules, so never sent: secrets and flaw reports (never sent
 * anywhere), scam reports (code warns and alerts) and messages removed for
 * a phone number or e-mail address (personal details stay here).
 */
const SETTLED: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["secret", "secret_probable", "security_report", "scam_report", "contact_info"]);

/**
 * Whether a message goes to Haiku's check. Never an admin's, never one a
 * certain rule settled, and in raid mode never one with a link. A strong
 * self-harm phrase gets the crisis reply from code: such a message goes only
 * for its unknown links, so a phrase pasted under spam can't pass it
 * unchecked (the verdict may delete it, never punish). Otherwise: questions,
 * handles, addresses, unknown links (kept or removed: Haiku decides the
 * offence and the alert), help, DM or report words, weak self-harm signs,
 * and a new member's message of 3 words or more. Trusted members' only for
 * questions, help words, weak self-harm signs and their unknown links.
 * Chit-chat with none of these never leaves the worker.
 */
export function shouldTriage(result: RuleResult, standing: Standing, options: { raid: boolean; removedLink: boolean }): boolean {
  if (standing === "admin") return false;
  const m = result.markers;
  if (result.hits.some((h) => h.certain || SETTLED.has(h.category))) return false;
  const unknownLink = m.unknownLinks > 0 || options.removedLink;
  if (options.raid && (unknownLink || m.domains.length > 0)) return false;
  if (m.crisis === "strong") return unknownLink;
  const asking = m.question || m.helpWords || m.crisis === "weak";
  if (standing === "trusted") return asking || unknownLink;
  return asking || unknownLink || m.handles > 0 || m.addresses.length > 0 || m.dmWords || m.reportWords || (standing === "new" && m.words >= 3);
}

const MAX_REASON = 120;
const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);
const isLanguage = (value: unknown): value is TriageVerdict["language"] => value === "other" || (typeof value === "string" && isLocale(value));
/** The model's reason on one line: line breaks become spaces, invisible and direction marks go, at most 120 characters. */
const oneLine = (text: string) => clip(visibleText(text), MAX_REASON).trimEnd();

/** The verdict from the model's text: JSON with exactly the schema's fields and valid values, or null. */
export function parseVerdict(text: string): TriageVerdict | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const fields = raw as Record<string, unknown>;
  const keys = Object.keys(fields);
  if (keys.length !== VERDICT_FIELDS.length || !VERDICT_FIELDS.every((field) => keys.includes(field))) return null;
  const { verdict, category, question, needs_human, dm_scam_mention, language, reason } = fields;
  if (!oneOf(VERDICTS, verdict) || !oneOf(TRIAGE_CATEGORIES, category) || !oneOf(QUESTIONS, question) || !oneOf(NEEDS_HUMAN, needs_human)) return null;
  if (typeof dm_scam_mention !== "boolean" || !isLanguage(language) || typeof reason !== "string") return null;
  return { verdict, category, question, needs_human, dm_scam_mention, language, reason: oneLine(reason) };
}

export interface TriageDeps {
  client: ClaudeClient;
  budget: Budget;
  official: OfficialAccounts;
  allow: AllowList;
  now: () => number;
}

/** The pseudonymous code's shape (claude/user-code.ts): nothing else, such as a raw ID, is ever sent as metadata.user_id. */
const USER_CODE = /^[0-9a-f]{32}$/;

/** The request: no tools, no sampling parameters, no prefill and no fallbacks; the system prompt cached for an hour. */
function triageParams(input: TriageInput, deps: TriageDeps, userCode: string | null): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: TRIAGE_MODEL,
    max_tokens: TRIAGE_SETTINGS.maxTokens,
    thinking: { type: "disabled" },
    output_config: { effort: TRIAGE_SETTINGS.effort, format: { type: "json_schema", schema: TRIAGE_SCHEMA } },
    system: [{ type: "text", text: triageSystem(deps.official, deps.allow), cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: triageUserContent(input) }],
    ...(userCode !== null && USER_CODE.test(userCode) ? { metadata: { user_id: userCode } } : {}),
  };
}

/**
 * How long a check may take in all: a little past the request's own timeout,
 * since the SDK's timer stops once the reply's headers arrive, and a stalled
 * body must never hold a check (its queue slot, its reservation, and in
 * relaxed mode an unknown link kept up) for good.
 */
export const TRIAGE_DEADLINE_MS = TRIAGE_SETTINGS.timeoutMs + 2_000;

const failure = (kind: "timeout" | "unknown"): ClaudeOutcome => ({ ok: false, failure: kind, type: null, status: null, retryAfterMs: null });

/** One request, never retried. The client never rejects; one that does counts as an unknown failure, and one past the deadline as a timeout (both may have been billed). */
async function send(client: ClaudeClient, params: Anthropic.MessageCreateParamsNonStreaming): Promise<ClaudeOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<ClaudeOutcome>((resolve) => {
    timer = setTimeout(() => resolve(failure("timeout")), TRIAGE_DEADLINE_MS);
  });
  try {
    return await Promise.race([client.create({ kind: "triage", lane: "triage", params, timeoutMs: TRIAGE_SETTINGS.timeoutMs }), late]);
  } catch {
    return failure("unknown");
  } finally {
    clearTimeout(timer);
  }
}

/** The stop reason first: a refusal is counted, and only a finished reply is read, by its first text block (thinking blocks may come first). */
function verdictOf(message: Anthropic.Message, budget: Budget): TriageVerdict | null {
  if (message.stop_reason === "refusal") {
    budget.refused("triage");
    return null;
  }
  if (message.stop_reason !== "end_turn") return null;
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return block ? parseVerdict(block.text) : null;
}

/**
 * Classifies one message: reserves the request's worst case in the triage
 * lane, sends it (10 s, no retry, given up for good after 12 s), charges its
 * real cost from usage, and reads the verdict. Null when the lane or the day
 * has no room, the request would be too long, the call fails (counted toward
 * the checks' own breaker; a request never sent is released), the model
 * refuses (counted) or stops early, or the reply
 * isn't a valid verdict. It never rejects. The text was masked by the caller
 * and is masked again; nothing is logged here.
 */
export async function triageMessage(input: TriageInput, deps: TriageDeps, userCode: string | null): Promise<TriageVerdict | null> {
  try {
    const params = triageParams(input, deps, userCode);
    const chars = JSON.stringify(params).length;
    if (chars > MAX_REQUEST_CHARS) return null;
    const ticket = deps.budget.reserve("triage", worstCaseUsd(chars, TRIAGE_SETTINGS.maxTokens, TRIAGE_MODEL), deps.now(), TRIAGE_MODEL);
    if (!ticket) return null;
    const outcome = await send(deps.client, params);
    try {
      // The checks' own breaker: a ramp limit here makes checks wait, never answers.
      if (!outcome.ok) deps.budget.failed(outcome.failure, outcome.retryAfterMs, deps.now(), "triage");
    } finally {
      // Settled whatever happens, so a reservation never stays held against the day; one never sent (the client's "unsent") is released.
      deps.budget.commit(ticket, outcome.ok ? outcome.message.usage : null, outcome.ok ? null : outcome.failure, deps.now(), outcome.ok ? null : outcome.type);
    }
    return outcome.ok ? verdictOf(outcome.message, deps.budget) : null;
  } catch {
    // Anything unexpected is the caller's fail-closed case, never a crash.
    return null;
  }
}
