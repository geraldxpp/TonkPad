import { clip } from "../../text";
import { modelText } from "../agent/mask";
import { type Me, repliedTo } from "../agent/triggers";
import { textOf } from "./pipeline-mod-input";
import type { TriageJob } from "./pipeline-triage";
import type { TriageInput } from "./types";

/** What goes to Haiku: the first 1,000 characters, masked. */
const CHECK_CHARS = 1_000;

/**
 * What Haiku's check reads about one message (mod/triage.ts): its visible
 * words, masked, and the flags code works out, never IDs, names or
 * usernames. What Telegram marked as a phone number or an e-mail address is
 * hidden on the text its offsets count in, before anything else changes it.
 */
export function triageInput(job: TriageJob, me: Me | null): TriageInput {
  const { m, who, result } = job;
  const { text, entities } = textOf(m);
  return {
    text: clip(modelText(text, entities), CHECK_CHARS),
    edited: m.edit_date !== undefined,
    forwarded: m.forward_origin !== undefined && m.forward_origin !== null,
    standing: who.standing === "admin" ? "member" : who.standing,
    domains: result.markers.domains,
    handles: result.markers.handles,
    addresses: result.markers.addresses.length,
    replyToBot: me !== null && repliedTo(m)?.from?.id === me.id,
    appLang: who.lang,
  };
}
