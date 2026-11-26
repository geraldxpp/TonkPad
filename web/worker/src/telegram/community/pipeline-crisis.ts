import { clip, visibleText } from "../../text";
import { topicOf } from "../agent/triggers";
import { maskForModel } from "../mod/secrets";
import type { TgMessage } from "../types";
import { messageLink } from "./alerts";
import { createOnce } from "./hold";
import { textOf } from "./pipeline-mod-input";
import type { Who } from "./pipeline-who";
import type { AdminAlert, AlertSink, ChatId, Records } from "./types";
import type { CommunityDictionary } from "./words";

/**
 * Someone at risk in a group (prompts/15-community-agent.md, Human
 * attention), paced so a self-harm phrase pasted under spam can't flood the
 * group or the admin chat. Each member once per 10 minutes. The public
 * crisis reply, which sends its own urgent alert, goes out at most once per
 * group every 5 minutes; past that the reply goes to the poster alone (best
 * effort), with an urgent alert of its own. At most 3 urgent crisis alerts
 * a minute per group: the rest are folded into one urgent summary, sent a
 * minute after the first of them.
 */

export interface CrisisGateDeps {
  /** The public crisis reply with its urgent alert (qa.crisis). */
  reply: (m: TgMessage) => Promise<void>;
  /** The same reply to the poster alone (an ephemeral message), best effort; without it the quiet path sends only the alert. */
  copy?: (m: TgMessage) => void;
  alerts: AlertSink;
  records: Records;
  /** The admins' words, for the summary's line. */
  adminWords: () => CommunityDictionary;
  now: () => number;
}

export interface CrisisGate {
  crisis(m: TgMessage, who: Who): void;
  /** Sends the summaries that are due. */
  tick(now: number): void;
  prune(now: number): void;
}

const MINUTE = 60_000;
/** The public reply, at most once per group in this long. */
const PUBLIC_GAP_MS = 5 * MINUTE;
/** Urgent crisis alerts per group per minute; the rest are summed up. */
const ALERTS_PER_MINUTE = 3;
/** Each member once in this long, as the reply itself is paced. */
const MEMBER_MS = 10 * MINUTE;
const EXCERPT = 300;

interface Group {
  publicAt: number;
  /** When the last urgent alerts went out (ms), at most a minute back. */
  alerts: number[];
  /** Alerts folded into the coming summary, and when the first was. */
  folded: number;
  foldedAt: number;
}

export function createCrisisGate(deps: CrisisGateDeps): CrisisGate {
  const members = createOnce(MEMBER_MS);
  const groups = new Map<ChatId, Group>();
  const groupOf = (chat: ChatId): Group => {
    const known = groups.get(chat);
    if (known) return known;
    const fresh: Group = { publicAt: Number.NEGATIVE_INFINITY, alerts: [], folded: 0, foldedAt: 0 };
    groups.set(chat, fresh);
    return fresh;
  };

  /** The urgent alert the public reply would have sent: the member, a short cleaned excerpt and a link to the message. */
  function alertOf(m: TgMessage, who: Who): AdminAlert {
    const thread = topicOf(m);
    const excerpt = clip(maskForModel(visibleText(textOf(m).text)), EXCERPT).trim();
    return {
      chat: m.chat.id, kind: "crisis", category: "crisis", member: who.user !== null ? { id: who.user, name: who.name, username: who.username, since: null } : null,
      excerpt: excerpt || null, link: messageLink(m.chat, m.message_id, thread), done: null, aiGuess: null, undo: null, messageId: m.message_id, routine: false, urgent: true,
    };
  }

  function summary(chat: ChatId, g: Group): void {
    const w = deps.adminWords().admin;
    deps.alerts.alert({
      chat, kind: "crisis", category: null, member: null, excerpt: null, link: null, done: `${w.counters.crisis}: ${g.folded}`,
      aiGuess: null, undo: null, messageId: null, routine: false, urgent: true,
    });
    g.folded = 0;
    g.foldedAt = 0;
  }

  function flush(now: number): void {
    for (const [chat, g] of groups) if (g.folded > 0 && now - g.foldedAt >= MINUTE) summary(chat, g);
  }

  return {
    crisis(m, who) {
      try {
        const now = deps.now();
        const chat = m.chat.id;
        const author = who.user ?? who.senderChat;
        if (author === null || !members.first(`${chat}:${author}`, now)) return;
        flush(now);
        const g = groupOf(chat);
        g.alerts = g.alerts.filter((at) => now - at < MINUTE);
        if (now - g.publicAt >= PUBLIC_GAP_MS) {
          // The public reply sends its own alert, which counts toward the three.
          g.publicAt = now;
          g.alerts.push(now);
          void deps.reply(m).catch(() => undefined);
          return;
        }
        deps.copy?.(m);
        deps.records.count(chat, "crisis", now);
        deps.records.count(chat, "escalated", now);
        if (g.alerts.length < ALERTS_PER_MINUTE) {
          g.alerts.push(now);
          deps.alerts.alert(alertOf(m, who));
          return;
        }
        if (g.folded === 0) g.foldedAt = now;
        g.folded += 1;
      } catch {
        // A crisis reply must never break the moderation that raised it.
      }
    },

    tick: flush,

    prune(now) {
      members.prune(now);
      for (const [chat, g] of groups) {
        if (g.folded === 0 && now - g.publicAt >= PUBLIC_GAP_MS && g.alerts.every((at) => now - at >= MINUTE)) groups.delete(chat);
      }
    },
  };
}
