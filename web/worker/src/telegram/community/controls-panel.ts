import type { BudgetStatus } from "../claude/types";
import type { Button, InlineKeyboard, View } from "../types";
import { type AdminRight, type ChatId, type ChatSettings, STRICTNESS_LEVELS, type Strictness } from "./types";
import type { CommunityDictionary } from "./words";

/** What a control changes: a group's settings, its raid mode, or (for every group at once) the AI switch. */
export type Change =
  | { kind: "paused"; on: boolean }
  | { kind: "proactive"; on: boolean }
  | { kind: "strictness"; level: Strictness }
  | { kind: "raid"; on: boolean }
  | { kind: "ai"; on: boolean };

/** Owners change modes and AI; admins with Ban users start and end raid mode. */
export const rightFor = (change: Change): AdminRight => (change.kind === "raid" ? "restrict" : "owner");

/** A control command as the pipeline hands it over: its name and what follows it. */
export type Command = { name: string; arg: string };

/** The commands a group's admins send there, and the right each needs. */
export const GROUP_COMMANDS: ReadonlyMap<string, AdminRight> = new Map<string, AdminRight>([
  ["status", "any"], ["mod", "any"],
  ["pause", "owner"], ["resume", "owner"], ["proactive", "owner"], ["strict", "owner"], ["forget", "owner"],
  ["raid", "restrict"], ["trust", "restrict"], ["untrust", "restrict"], ["trusted", "restrict"],
]);
/** The commands the admin chat takes. */
export const ADMIN_CHAT_COMMANDS: ReadonlySet<string> = new Set(["mod", "status", "forget", "ai"]);

/** Each panel button's action word (p:<chat>:<action>) and the change it makes. */
const ACTIONS: ReadonlyMap<string, Change> = new Map<string, Change>([
  ["pause", { kind: "paused", on: true }],
  ["resume", { kind: "paused", on: false }],
  ["pron", { kind: "proactive", on: true }],
  ["proff", { kind: "proactive", on: false }],
  ...STRICTNESS_LEVELS.map((level): [string, Change] => [level, { kind: "strictness", level }]),
  ["raidon", { kind: "raid", on: true }],
  ["raidoff", { kind: "raid", on: false }],
  ["aion", { kind: "ai", on: true }],
  ["aioff", { kind: "ai", on: false }],
]);

const PANEL_DATA = /^p:(-\d{1,20}):([a-z]{1,10})$/;

/** A panel press's group and change, or null for data no panel button carries. */
export function parsePanel(data: string): { chat: ChatId; change: Change } | null {
  const match = PANEL_DATA.exec(data);
  const chat = match ? Number(match[1]) : NaN;
  const change = match ? ACTIONS.get(match[2]) : undefined;
  return change && Number.isSafeInteger(chat) ? { chat, change } : null;
}

/** "on" or "off" after a command, else null. */
export function onOff(arg: string): boolean | null {
  const word = arg.trim().toLowerCase();
  return word === "on" ? true : word === "off" ? false : null;
}

/** A strictness level after /strict, else null. */
export function levelOf(arg: string): Strictness | null {
  const word = arg.trim().toLowerCase();
  return STRICTNESS_LEVELS.find((level) => level === word) ?? null;
}

/** The change a group command asks for, or null (another command, or a value it doesn't know). */
export function changeOf(cmd: { name: string; arg: string }): Change | null {
  if (cmd.name === "pause" || cmd.name === "resume") return { kind: "paused", on: cmd.name === "pause" };
  if (cmd.name === "strict") {
    const level = levelOf(cmd.arg);
    return level ? { kind: "strictness", level } : null;
  }
  if (cmd.name !== "proactive" && cmd.name !== "raid") return null;
  const on = onOff(cmd.arg);
  return on === null ? null : { kind: cmd.name, on };
}

/**
 * The AI switch as the panel shows it: off after an owner's /ai off or a
 * billing or missing-model stop (only /ai on lifts those), on otherwise
 * (the day's cap and the error breaker pass by themselves); null when no
 * model call can run at all.
 */
export function aiSwitch(status: BudgetStatus | null): boolean | null {
  if (!status || status.reason === "off") return null;
  return status.reason !== "admin" && status.reason !== "billing" && status.reason !== "not_found";
}

/** The parts of a group's state the panel shows; ai is null when no model call can run at all. */
export interface PanelState {
  settings: ChatSettings;
  raid: boolean;
  /** Whether the AI switch is on (an owner's /ai off, or a billing or missing-model stop, turns it off). */
  ai: boolean | null;
}

/**
 * The /mod panel's buttons for one group: each switch offers the change it
 * can make now, and the four levels mark the current one.
 */
export function panelKeyboard(chat: ChatId, state: PanelState, words: CommunityDictionary): InlineKeyboard {
  const b = words.admin.buttons;
  const button = (text: string, action: string): Button => ({ text, callback_data: `p:${chat}:${action}` });
  const level = (l: Strictness) => button(l === state.settings.strictness ? `• ${words.admin.levels[l]}` : words.admin.levels[l], l);
  const switches = [state.raid ? button(b.raidOff, "raidoff") : button(b.raidOn, "raidon")];
  if (state.ai !== null) switches.push(state.ai ? button(b.aiOff, "aioff") : button(b.aiOn, "aion"));
  return {
    inline_keyboard: [
      [state.settings.paused ? button(b.resume, "resume") : button(b.pause, "pause"), state.settings.proactive ? button(b.proactiveOff, "proff") : button(b.proactiveOn, "pron")],
      [level("observe"), level("relaxed")],
      [level("normal"), level("strict")],
      switches,
    ],
  };
}

/** The /mod panel: a group's status view with its switches below. */
export function panelView(chat: ChatId, status: View, state: PanelState, words: CommunityDictionary): View {
  const rows = [...(status.keyboard?.inline_keyboard ?? []), ...panelKeyboard(chat, state, words).inline_keyboard];
  return { text: status.text, keyboard: { inline_keyboard: rows } };
}
