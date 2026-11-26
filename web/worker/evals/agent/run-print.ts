import type { Button } from "../../src/telegram/types";
import type { Grade } from "./grade";
import type { AnswerRun, ModerationRun } from "./run-cases";
import { type CallRecord, percentile, totals } from "./run-meter";

/**
 * What the eval prints (run.ts): every answer and verdict in full for a
 * human read, then a pass or fail table per section, then usage, cost,
 * latency and tokens. Everything goes to stdout; nothing is kept.
 */

export const count = (n: number) => Math.round(n).toLocaleString("en-US");
export const dollars = (usd: number) => `$${usd < 0.1 ? usd.toFixed(4) : usd.toFixed(2)}`;
const seconds = (ms: number | null) => (ms === null ? "-" : `${(ms / 1000).toFixed(1)} s`);
const clipped = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const indent = (text: string) => text.split("\n").map((line) => `    ${line}`).join("\n");
const status = (g: Grade) => (g.pass ? "PASS" : "FAIL");

const buttonLine = (b: Button) => ("url" in b ? `[${b.text}] ${b.url}` : `[${b.text}] (button ${b.callback_data})`);

/** One answer: the question, what the model returned, what members would see, and every failure. */
export function printAnswer(run: AnswerRun): void {
  const { c, result, view, check, grade } = run;
  const t = totals(run.calls);
  const requests = `${t.requests} request${t.requests === 1 ? "" : "s"}`;
  const head = `--- ${c.id} [${c.lang} · ${c.chat} · ${c.mode}] ${status(grade)} · ${seconds(run.ms)} · ${requests} · out ${count(t.output)} (thinking ${count(t.thinking)}) · ${dollars(t.usd)}`;
  const lines = [head, `Q: ${c.question}`];
  if (c.earlierAnswer) lines.push(`(replying to the bot's earlier answer: ${c.earlierAnswer})`);
  if (check !== undefined) lines.push(check ? `Check: ${check.verdict} · ${check.category} · question ${check.question} · needs ${check.needs_human} · ${check.language}` : "Check: no verdict");
  if (result.kind === "answer") {
    const o = result.output;
    lines.push(`Model: language ${o.language} · answered ${o.answered} · escalate ${o.escalate} · links ${o.links.join(", ") || "none"} · token ${o.token || "-"}`);
    lines.push(`Reply: ${o.reply || "(empty)"}`);
    if (o.admin_note) lines.push(`Note for the team: ${o.admin_note}`);
    if (run.gated?.blocked) lines.push(`Gate: blocked (${run.gated.blocked})`);
  } else lines.push(`Model: ${result.kind} (${result.reason})`);
  if (view) {
    lines.push("Shown:", indent(view.text));
    for (const b of view.keyboard?.inline_keyboard.flat() ?? []) lines.push(`    ${buttonLine(b)}`);
  }
  for (const failure of grade.failures) lines.push(`  - ${failure}`);
  console.log(`${lines.join("\n")}\n`);
}

/** One verdict: the message, the verdict as Haiku gave it, and every failure. */
export function printVerdict(run: ModerationRun): void {
  const { c, verdict, grade } = run;
  const input = c.input;
  const what = verdict ? `${verdict.verdict} · ${verdict.category} · question ${verdict.question} · needs ${verdict.needs_human} · ${verdict.language}` : "no verdict";
  const lines = [`${status(grade)} ${c.id} [${input.appLang} · ${input.standing}${input.forwarded ? " · forwarded" : ""}] ${what} · ${seconds(run.ms)}`, `    "${clipped(input.text, 100)}"`];
  if (verdict?.reason) lines.push(`    AI's guess: ${verdict.reason}`);
  for (const failure of grade.failures) lines.push(`  - ${failure}`);
  console.log(lines.join("\n"));
}

/** The pass or fail table: one line per case, with its failures cut to a line. */
export function printTable(title: string, grades: readonly Grade[]): void {
  const passed = grades.filter((g) => g.pass).length;
  const width = Math.max(...grades.map((g) => g.id.length), 4);
  console.log(`\n${title}: ${passed} of ${grades.length} passed`);
  for (const g of grades) console.log(`  ${status(g)}  ${g.id.padEnd(width)}  ${g.failures.length > 0 ? clipped(g.failures.join("; "), 110) : ""}`.trimEnd());
}

export interface SectionStats {
  title: string;
  grades: Grade[];
  /** Each case's own time: an answer's, or a check's. */
  times: number[];
  calls: CallRecord[];
  blocked: number;
  /** How many answers the averages are over. */
  answers: number;
}

/** One summary line per section: passes, gate blocks, refusals, p50 and p95, output and thinking tokens per answer, cost. */
export function printSummary(sections: readonly SectionStats[]): void {
  console.log("\nSummary (latency: each answer, or each check; tokens: per case)");
  const width = Math.max(...sections.map((s) => s.title.length));
  for (const s of sections) {
    const t = totals(s.calls);
    const per = Math.max(1, s.answers);
    const parts = [
      `${s.grades.filter((g) => g.pass).length}/${s.grades.length} passed`,
      `blocked ${s.blocked}`,
      `refused ${t.refusals}`,
      `failed calls ${t.failures}`,
      `p50 ${seconds(percentile(s.times, 50))}`,
      `p95 ${seconds(percentile(s.times, 95))}`,
      `out ${count(t.output / per)} (thinking ${count(t.thinking / per)})`,
      dollars(t.usd),
    ];
    console.log(`  ${s.title.padEnd(width)}  ${parts.join(" · ")}`);
  }
}

/** Every call's usage together, and its cost from usage. */
export function printUsage(calls: readonly CallRecord[]): void {
  const t = totals(calls);
  console.log(
    `\nUsage: ${count(t.requests)} requests · input ${count(t.input)} · cache read ${count(t.cacheRead)} · cache write ${count(t.cacheWrite)} · output ${count(t.output)} (thinking ${count(t.thinking)})`,
  );
  console.log(`Cost from usage: ${dollars(t.usd)}`);
}
