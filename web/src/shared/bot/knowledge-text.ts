import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * How the knowledge pack is written: plain text in tagged blocks, so the
 * model can tell where each fact comes from ("[docs.fees] Fees"). Empty
 * lines are dropped, so a missing message never leaves a stray marker.
 */

/** The message at a dotted path ("docs.fees.title"), or "" where there is none. */
export function textAt(t: Dictionary, path: string): string {
  let node: unknown = t;
  for (const part of path.split(".")) {
    node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  return typeof node === "string" ? node : "";
}

/** A block: "[tag] heading", then its lines. */
export function block(tag: string, heading: string, lines: readonly string[]): string {
  return [`[${tag}] ${heading}`, ...lines.filter((line) => line.trim() !== "")].join("\n");
}

/** "Fees:", but "Which routes?" and "One final look." keep their own stop. */
const labelled = (name: string) => (/[.?!:]$/.test(name) ? name : `${name}:`);

/** A heading inside a block: "Fees:". */
export const sub = (title: string) => (title ? labelled(title) : "");

/** A list item: "- text". */
export const item = (text: string) => (text ? `- ${text}` : "");

/** A term beside its meaning: "- Time-lock: Everything unlocks at the end." */
export const term = (name: string, text: string) => (name && text ? `- ${labelled(name)} ${text}` : "");

/** "a, b and c". */
export const listed = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
