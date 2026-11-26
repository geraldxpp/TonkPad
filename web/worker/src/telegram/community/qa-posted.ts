import { askLine, askTrigger } from "../agent/triggers";
import { type PendingAsk, pairingOf } from "../inline-pending";
import type { TgMessage } from "../types";
import type { PipelineDeps } from "./pipeline";
import type { Moderated } from "./pipeline-mod";
import type { AnswerHook } from "./pipeline-triage";
import type { Who } from "./pipeline-who";
import { excerptOf } from "./qa-reply";
import type { RuleCategory } from "./types";

/**
 * Inline mode's Ask post in a community group (prompts/15-community-agent.md,
 * Inline Ask): the fixed line the Ask result posts as the member's own
 * message, via the bot ("Asked TonkFun a question.", agent/triggers-via.ts
 * askLine). The pipeline moderates it as any message; its own text never
 * goes to Haiku's check, and it is never a question by itself. The router
 * pairs a person's own post with the question chosen for it in a supergroup
 * (inline-pending.ts), and once that comes the post is /ask with that
 * question: the rules read the question only for the markers Haiku's check
 * goes by, never to act on it (nobody else saw it); where the pipeline runs
 * a check for a question to the bot, it reads the question, and its verdict
 * acts on the post as it would on an /ask message, whose alerts quote the
 * question (masked) as they quote one; the answer replies to the post. A
 * question that never came gets the note that says to use /ask. A forward
 * of a post pairs with nothing, so it is only moderated.
 */

type PostDeps = Pick<PipelineDeps, "me" | "labels" | "moderation" | "triage" | "qa" | "now" | "log">;

/** Never in an alert's excerpt, as for any message (pipeline-mod.ts NO_EXCERPT). */
const NO_EXCERPT: ReadonlySet<RuleCategory> = new Set<RuleCategory>(["secret", "secret_probable", "security_report", "contact_info"]);

/** The post as the rules' markers and Haiku's check read it: the member's own words (no via_bot, none of Telegram's marks); its ID, chat, author and reply stay. */
const asQuestion = (m: TgMessage, question: string): TgMessage => ({ ...m, text: question, entities: undefined, caption: undefined, caption_entities: undefined, via_bot: undefined });

export function createAskPosts(deps: PostDeps) {
  /** The post, paired: /ask with its question, checked where the pipeline checks a question to the bot; the note when none came. */
  function paired(m: TgMessage, who: Who, moderated: Moderated | null, ask: PendingAsk | null): void {
    if (ask === null) return void deps.qa.onLost(m);
    const me = deps.me();
    const t = me ? askTrigger(m, me, deps.labels, ask.question) : null;
    if (!t) return;
    const q = asQuestion(m, t.question);
    const result = deps.moderation.check(q, who, deps.now());
    // Someone at risk: the crisis reply, paced as in the group, and never a punishment.
    if (result.markers.crisis === "strong") return deps.triage.crisis(q, who);
    const answer: AnswerHook = { run: (checked) => void deps.qa.onTrigger(m, t, checked), busy: () => void deps.qa.onBusy(m, t) };
    // An admin's question is never checked, and is answered at once.
    if (moderated === null) return answer.run(null);
    const excerpt = result.hits.some((h) => NO_EXCERPT.has(h.category)) ? "" : (excerptOf(t.question) ?? "");
    deps.triage.check({ ...moderated, target: { ...moderated.target, excerpt }, m: q, who, result, answer });
  }

  return {
    /** Inline mode's Ask line (via the bot, forwarded or not): its own text goes to no check, and it asks nothing by itself. */
    is: (m: TgMessage): boolean => askLine(m, deps.me()),

    /** After the post's moderation, when it still stands: its question once the router's pairing brings it, or the note. Nothing waits on it. */
    after(m: TgMessage, who: Who, moderated: Moderated | null): void {
      const pairing = pairingOf(m);
      if (!pairing || moderated?.removed === true || who.user === null) return;
      void pairing.then((ask) => paired(m, who, moderated, ask)).catch(() => deps.log("an Ask post wasn't answered"));
    },
  };
}
