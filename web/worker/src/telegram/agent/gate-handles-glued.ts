/**
 * Lowercase support-style usernames in an answer (answers#11), for
 * gate-handles.ts: a role word glued to another word ("supportdesk",
 * "solanasupport", "cryptohelpdesk", "walletrecovery") standing right where
 * people are sent to a username: after "DM", "message", "contact" or "write
 * to", or before "on Telegram". Plain words with a role word in them stay
 * ("admins", "helpline", "teammates", "Telegram Desktop"), and so does a
 * role word alone ("Message MetaMask support only through their site").
 */

/** Role words a fake support account is named with. */
const ROLE = /support|admin|help|desk|team|official|staff|service|recovery|agent/g;
/** What turns a role word into a plain word when it follows it ("helpline", "services", "teammates", "desktop"). */
const PLAIN_ENDING = /^(?:s|es|ed|er|ers|ing|ings|ive|ful|fully|less|line|lines|mate|mates|work|top|tops|ly|ally|ation|ations|istrator|istrators|istration|ister|isters|cy|ies)$/;
/** Where people are sent to a username, just before it. */
const SENT_TO = /(?:^|[^\p{L}\p{N}_])(?:dms?|pms?|messages?|msg|contact|contacting|text|ping|write to|reach out to|reach|ask|e-?mail|mail|telegram|tg)\s+$/iu;
/** The same just after it ("supportdesk on Telegram", "walletrecovery in DM"). */
const SENT_ON = /^\s+(?:(?:on|via|in|at|through|over)\s+)?(?:telegram|tg|discord|whatsapp|dms?|pms?|inbox)(?![\p{L}\p{N}_])/iu;

/** Whether a word of plain letters is a role word glued to another word, not a plain word built on one. */
export function gluedRole(word: string): boolean {
  const lower = word.toLowerCase();
  if (!/^[a-z]+$/.test(lower)) return false;
  for (const m of lower.matchAll(ROLE)) {
    const before = lower.slice(0, m.index);
    const after = lower.slice(m.index + m[0].length);
    if (before.length >= 3 || (after.length >= 3 && !PLAIN_ENDING.test(after))) return true;
  }
  return false;
}

/** Whether the word at [start, end) of `text` stands where people are sent to a username. */
export function sentTo(text: string, start: number, end: number): boolean {
  return SENT_TO.test(text.slice(Math.max(0, start - 40), start)) || SENT_ON.test(text.slice(end, end + 40));
}
