import { type Ask, counterChat, excerptOf, linkOf, personOf, type QaCtx, standIn } from "./qa-reply";

/**
 * A refused or cut-off answer (split from qa-answer.ts): the fixed line, the
 * asker's 10-minute pause, and at a second refusal within 10 minutes one
 * alert to the team.
 */

/** Whether this refusal is the asker's second within 10 minutes: the alert goes out once. */
function secondRefusal(a: Ask, ctx: QaCtx, now: number): boolean {
  const user = String(a.user.id);
  return !ctx.refusals.first(user, now) && ctx.refusals.first(`${user}:alerted`, now);
}

/**
 * A refusal or a max_tokens stop: the fixed line and the asker's 10-minute
 * pause. A second refusal within 10 minutes sends one alert; a max_tokens
 * stop (long thinking, not a refusal) never counts toward it.
 */
export async function stopped(a: Ask, reason: "refusal" | "max_tokens", ctx: QaCtx): Promise<void> {
  const now = ctx.now();
  const counted = counterChat(a, ctx);
  if (counted !== null) ctx.records.count(counted, "refused", now);
  ctx.limits.coolDown(a.user.id, now);
  if (reason === "refusal" && secondRefusal(a, ctx, now)) {
    // A private chat reaches the team only by the member's choice: the alert names nobody.
    const group = a.where === "group";
    ctx.alerts?.alert({
      chat: group ? a.chat.id : null, kind: "refusals", category: null, member: group ? personOf(a.user) : null, excerpt: group ? excerptOf(a.question) : null,
      link: linkOf(a), done: null, aiGuess: null, undo: null, messageId: group ? a.messageId : null, routine: true, urgent: false,
    });
  }
  await standIn(a, "refused", ctx);
}
