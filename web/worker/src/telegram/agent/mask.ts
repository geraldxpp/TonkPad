import { visibleText } from "../../text";
import { MASK, maskForModel } from "../mod/secrets";
import type { TgMessage, TgMessageEntity } from "../types";
import { spanOf, wordsOf } from "./triggers-reply";

/**
 * A member's words as they go to Claude (prompts/15-community-agent.md,
 * Privacy). What Telegram marked as a phone number or an e-mail address is
 * hidden first, on the text its UTF-16 offsets count in (mod/secrets.ts
 * maskForModel with the message's entities), then maskForModel's own
 * patterns run again on the visible text. A question cut out of a message
 * (its mention of the bot or /ask taken out, or the message /ask replied to)
 * no longer matches those offsets: the marked text itself is hidden in it.
 */

/** A message's own words for the model: Telegram's marks on `raw` as given, then the patterns on its visible text. */
export function modelText(raw: string, entities: readonly TgMessageEntity[]): string {
  return maskForModel(visibleText(maskForModel(raw, entities)));
}

/** What Telegram marked as a phone number or an e-mail address in these messages' words (text, else caption), as written and as visibleText reads it; longest first. */
export function markedContacts(...messages: ReadonlyArray<TgMessage | null | undefined>): string[] {
  const found = new Set<string>();
  for (const m of messages) {
    if (!m) continue;
    const { text, entities } = wordsOf(m);
    for (const entity of entities) {
      const span = spanOf(entity, "phone_number", text) ?? spanOf(entity, "email", text);
      if (!span) continue;
      const raw = text.slice(span[0], span[1]);
      for (const form of [raw, visibleText(raw)]) if (form.trim() !== "") found.add(form);
    }
  }
  return [...found].sort((a, b) => b.length - a.length);
}

/** `text` with every marked contact replaced by the mask wherever it stands; nothing else changes. */
export function hideMarked(text: string, marked: readonly string[] = []): string {
  let out = text;
  for (const contact of marked) out = out.split(contact).join(MASK);
  return out;
}

/** Text cut out of a message, for the model: its marked contacts hidden, then maskForModel. */
export const maskedQuestion = (text: string, marked: readonly string[] = []): string => maskForModel(hideMarked(text, marked));
