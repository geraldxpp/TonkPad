import { clip, visibleText } from "../text";
import { isQuestion, wordCount } from "./mod/rules-scan";
import { findSecret } from "./mod/secrets";
import { findAddress } from "./text";

/**
 * Whether an inline query gets inline mode's Ask result (inline.ts), and the
 * question it stands for. Ask never posts what anyone typed: it posts a
 * fixed line in the asker's language ("Asked TonkFun a question."), and the
 * question reaches the bot alone, through Telegram's chosen_inline_result
 * (inline-pending.ts), to be answered as /ask answers it, after the same
 * checks. A query is a question when it reads as one (a question mark or a
 * question word in the 12 languages: mod/rules-scan.ts isQuestion) or has 3
 * words or more, and holds a letter or a digit; never a token address,
 * whose card answers it. Ask isn't offered, and the results' button says to
 * use /ask, for a query Telegram cut (it sends 256 characters at most) or
 * one holding a recovery phrase or a private key (mod/secrets.ts
 * findSecret), which the bot never keeps.
 */

/** A question is at most 600 characters, as an answer takes it (community/qa-reply.ts MAX_QUESTION). */
export const ASK_CHARS = 600;
/** Telegram cuts an inline query at 256 characters: a query this long may not be the whole question. */
const CUT = 256;
/** Words that make a query a question without a question mark or word. */
const ASK_WORDS = 3;

/** The question Ask stands for, or why there is none: "unsafe" (the button says to use /ask) or "none" (no question; the usual help). */
export type Asked = { question: string } | { refused: "unsafe" | "none" };

const UNSAFE: Asked = { refused: "unsafe" };
const NONE: Asked = { refused: "none" };

/** The question a query asks (visible text, at most 600 characters), or why Ask isn't offered for it (see the file's note). */
export function askQuestion(query: unknown): Asked {
  const typed = typeof query === "string" ? query : "";
  const question = clip(visibleText(typed), ASK_CHARS);
  if (!/[\p{L}\p{N}]/u.test(question) || findAddress(question) !== null) return NONE;
  if (!isQuestion(typed) && !isQuestion(question) && wordCount(question) < ASK_WORDS) return NONE;
  if (typed.length >= CUT || findSecret(typed) !== null || findSecret(question) !== null) return UNSAFE;
  return { question };
}
