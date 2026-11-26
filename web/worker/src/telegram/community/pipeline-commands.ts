import type { Locale } from "@/shared/i18n/config";
import { LINK_PATHS } from "../agent/render";
import { type Me, topicOf } from "../agent/triggers";
import { type Command, parseCommand } from "../commands";
import { escapeHtml as esc } from "../text";
import type { TgMessage } from "../types";
import { createOnce } from "./hold";
import type { CommunityOut } from "./out";
import type { CommunityDictionary } from "./words";

/**
 * Commands in a community group and in the admin chat, for messages that
 * survived the rules (prompts/15-community-agent.md, Admin controls and
 * Human attention). /ask is a trigger (agent/triggers.ts); /rules shows the
 * group's rules; /report goes to the admins; the admin commands go to the
 * controls; /check and /help stay module 14's. The admin chat's messages go
 * only to the controls: never to the rules or the AI.
 */

export interface CommandDeps {
  out: CommunityOut;
  me: () => Me | null;
  reports: { onGroupReport(m: TgMessage, reason: string): Promise<void> };
  /** The admin controls, or null without an admin chat. */
  controls: { onCommand(m: TgMessage, cmd: Command): Promise<boolean> } | null;
  words: (lang: Locale) => CommunityDictionary;
  /** /rules is public: in the group's language. */
  groupLang: Locale;
  site: string;
  now: () => number;
}

/** What a message was: no command for this bot ("none"), /ask (a trigger), handled here, or left to module 14 ("pass"). */
export type Routed = "none" | "ask" | "handled" | "pass";

/** /rules is shown once per 2 minutes per group, and deleted after 10. */
const RULES_GAP_MS = 2 * 60_000;
const RULES_KEEP_MS = 10 * 60_000;
const RULE_LINES = ["ai", "spam", "links", "dm", "advice", "report"] as const;
/** Module 14's own group commands. */
const MODULE_14: ReadonlySet<string> = new Set(["check", "help", "start"]);

const wordsOf = (m: TgMessage) => (typeof m.text === "string" ? m.text : typeof m.caption === "string" ? m.caption : "");

/** A command for this bot, whichever of its usernames it names; "other" when it names another bot; null for none. */
export function commandFor(m: TgMessage, me: Me | null): Command | "other" | null {
  const names = (me?.usernames ?? []).map((u) => u.replace(/^@/, "")).filter(Boolean);
  let found: Command | "other" | null = null;
  for (const name of names.length > 0 ? names : [null]) {
    found = parseCommand(wordsOf(m), name);
    if (found !== "other") return found;
  }
  return found;
}

export function createCommands(deps: CommandDeps): {
  group(m: TgMessage): Promise<Routed>;
  adminChat(m: TgMessage, stale: boolean): Promise<"handled" | "pass">;
  prune(now: number): void;
} {
  const shown = createOnce(RULES_GAP_MS);

  /** The group's rules, with Privacy and Docs buttons (unprefixed: everyone reads them in their own language). */
  async function rules(m: TgMessage): Promise<void> {
    const chat = m.chat.id;
    if (!shown.first(String(chat), deps.now())) return;
    const w = deps.words(deps.groupLang);
    const html = [`<b>${esc(w.rules.title)}</b>`, ...RULE_LINES.map((key) => esc(w.rules[key]))].join("\n");
    const keyboard = { inline_keyboard: [[{ text: w.links.privacy, url: `${deps.site}${LINK_PATHS.privacy}` }, { text: w.links.docs, url: `${deps.site}${LINK_PATHS.docs}` }]] };
    const id = await deps.out.send(chat, html, { kind: "notice", replyTo: m.message_id, thread: topicOf(m), keyboard });
    if (id !== null) deps.out.removeLater(chat, id, RULES_KEEP_MS);
  }

  return {
    async group(m) {
      const cmd = commandFor(m, deps.me());
      if (cmd === null) return "none";
      if (cmd === "other") return "pass";
      if (cmd.name === "ask") return "ask";
      if (cmd.name === "rules") {
        // Not awaited: a notice may wait for the group's message budget, and updates never wait on Telegram.
        void rules(m).catch(() => undefined);
        return "handled";
      }
      if (cmd.name === "report") {
        // Only reports that survived the rules reach here; report.ts counts each one it sends.
        void deps.reports.onGroupReport(m, cmd.arg);
        return "handled";
      }
      if (MODULE_14.has(cmd.name) || !deps.controls) return "pass";
      return (await deps.controls.onCommand(m, cmd)) ? "handled" : "pass";
    },

    async adminChat(m, stale) {
      // The controls don't check a command's age: one sent while the worker was down is left to module 14, which drops it.
      if (stale) return "pass";
      const cmd = commandFor(m, deps.me());
      if (cmd === null || cmd === "other") return "handled";
      if (!deps.controls) return "pass";
      return (await deps.controls.onCommand(m, cmd)) ? "handled" : "pass";
    },

    prune: (now) => shown.prune(now),
  };
}
