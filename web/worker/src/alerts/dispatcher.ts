import { type Alert, RANK, type Severity } from "./alert";
import { type Channel, split } from "./deliver";

/** What the dispatcher remembers across restarts. */
export interface DispatchState {
  /** One-off alerts already sent: key → when (ms), kept two weeks so a re-read block never repeats one. */
  sent: Record<string, number>;
  /** Conditions in force: when each began and was last sent. */
  active: Record<string, { since: number; lastSent: number; title: string; severity: Severity }>;
  lastAlertAt: number | null;
}

export const emptyDispatchState = (): DispatchState => ({ sent: {}, active: {}, lastAlertAt: null });

export interface DispatchOptions {
  /** "tonkfun.fun · Robinhood Chain". */
  header: string;
  repeatMs: number;
  /** Log every alert but send nothing. */
  dryRun: boolean;
  log: (line: string) => void;
  now: () => number;
}

const ICON: Record<Severity | "resolved", string> = { critical: "🔴", warning: "🟠", info: "🔵", resolved: "✅" };
const KEEP_SENT_MS = 14 * 24 * 3_600_000;
/** At most this many alerts go in one cycle's message; the rest are logged. */
const MAX_PER_CYCLE = 25;
const MAX_OUTBOX = 50;

interface Outgoing {
  rank: number;
  severity: Severity | "resolved";
  text: string;
  logLine: string;
}

const minutes = (ms: number) => (ms < 90 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${(ms / 3_600_000).toFixed(1)} h`);

/**
 * Sends alerts without repeating them: a one-off alert once per key; a
 * condition when it starts, again every repeat interval while it lasts, and a
 * resolution once a check finds it gone. Each cycle's alerts go out as one
 * message per channel, most severe first; a channel that fails keeps its
 * messages and retries them next cycle.
 */
export class Dispatcher {
  private readonly outbox = new Map<string, string[]>();
  private readonly lastFailureLog = new Map<string, number>();

  constructor(
    private readonly channels: readonly Channel[],
    private readonly options: DispatchOptions,
    public state: DispatchState = emptyDispatchState(),
  ) {}

  /** `evaluated` names the conditions checked this cycle: any of them in force but not raised again is resolved. */
  async dispatch(alerts: readonly Alert[], evaluated: readonly string[], block: number | null): Promise<void> {
    const now = this.options.now();
    const outgoing: Outgoing[] = [];
    const raised = new Set<string>();
    const render = (alert: Alert, prefix = "") => ({
      rank: RANK[alert.severity],
      severity: alert.severity,
      text: [`${ICON[alert.severity]} ${prefix}${alert.title}`, ...alert.lines].join("\n"),
      logLine: `${alert.severity.toUpperCase()} ${prefix}${alert.title}: ${alert.lines.join(" ")}`,
    });
    for (const alert of alerts) {
      if (alert.condition) {
        raised.add(alert.key);
        const active = this.state.active[alert.key];
        if (!active) {
          this.state.active[alert.key] = { since: now, lastSent: now, title: alert.title, severity: alert.severity };
          outgoing.push(render(alert));
        } else if (now - active.lastSent >= this.options.repeatMs) {
          active.lastSent = now;
          outgoing.push(render(alert, `Still (${minutes(now - active.since)}): `));
        }
      } else if (this.state.sent[alert.key] === undefined) {
        this.state.sent[alert.key] = now;
        outgoing.push(render(alert));
      }
    }
    for (const key of evaluated) {
      const active = this.state.active[key];
      if (!active || raised.has(key)) continue;
      delete this.state.active[key];
      const text = `${ICON.resolved} Resolved: ${active.title} (after ${minutes(now - active.since)})`;
      outgoing.push({ rank: 3, severity: "resolved", text, logLine: `RESOLVED ${active.title}` });
    }
    for (const [key, at] of Object.entries(this.state.sent)) if (now - at > KEEP_SENT_MS) delete this.state.sent[key];
    if (outgoing.length > 0) {
      this.state.lastAlertAt = now;
      this.queue(outgoing, block);
    }
    await this.flush();
  }

  private queue(outgoing: Outgoing[], block: number | null): void {
    const sorted = [...outgoing].sort((a, b) => a.rank - b.rank);
    for (const item of sorted) this.options.log(item.logLine);
    if (this.options.dryRun || this.channels.length === 0) return;
    const shown = sorted.slice(0, MAX_PER_CYCLE);
    const top = sorted[0].severity;
    const header = `${ICON[top]} ${this.options.header}${block !== null ? ` · block ${block}` : ""}`;
    const more = sorted.length > shown.length ? [`…and ${sorted.length - shown.length} more in the worker's log.`] : [];
    const message = [header, ...shown.map((item) => item.text), ...more].join("\n\n");
    for (const channel of this.channels) {
      const pending = [...(this.outbox.get(channel.name) ?? []), ...split(message, channel.maxLength)];
      if (pending.length > MAX_OUTBOX) this.options.log(`${channel.name}: ${pending.length - MAX_OUTBOX} unsent messages dropped`);
      this.outbox.set(channel.name, pending.slice(-MAX_OUTBOX));
    }
  }

  /** Sends what each channel has waiting, in order; stops at a channel's first failure and keeps the rest for next time. */
  async flush(): Promise<void> {
    for (const channel of this.channels) {
      const pending = this.outbox.get(channel.name) ?? [];
      while (pending.length > 0) {
        try {
          await channel.send(pending[0]);
          pending.shift();
        } catch (error) {
          const now = this.options.now();
          if (now - (this.lastFailureLog.get(channel.name) ?? 0) >= 60_000) {
            this.lastFailureLog.set(channel.name, now);
            this.options.log(`${channel.name} failed (${pending.length} waiting): ${error instanceof Error ? error.message : "unknown error"}`);
          }
          break;
        }
      }
      this.outbox.set(channel.name, pending);
    }
  }

  /** Messages still waiting to go out, for /health. */
  waiting(): number {
    return [...this.outbox.values()].reduce((sum, list) => sum + list.length, 0);
  }
}
