// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Alert } from "../src/alerts/alert";
import { type Channel, ping, redactor, split, telegramChannel, webhookChannel } from "../src/alerts/deliver";
import { Dispatcher } from "../src/alerts/dispatcher";

const MIN = 60_000;

function setup(options: { dryRun?: boolean; channels?: number } = {}) {
  let now = 1_000_000;
  const sent: Array<{ channel: string; text: string }> = [];
  const logs: string[] = [];
  let failing: string | null = null;
  const channel = (name: string, maxLength: number): Channel => ({
    name,
    maxLength,
    send: async (text) => {
      if (failing === name) throw new Error(`${name} down`);
      sent.push({ channel: name, text });
    },
  });
  const channels = [channel("telegram", 4096), channel("webhook", 2000)].slice(0, options.channels ?? 2);
  const dispatcher = new Dispatcher(channels, { header: "tonkfun.fun · Robinhood Chain", repeatMs: 30 * MIN, dryRun: options.dryRun ?? false, log: (line) => logs.push(line), now: () => now });
  return { dispatcher, sent, logs, advance: (ms: number) => (now += ms), fail: (name: string | null) => (failing = name) };
}

const event = (key: string, severity: Alert["severity"] = "warning"): Alert => ({ key, severity, title: `Title ${key}`, lines: ["line one", "line two"] });
const condition = (key: string): Alert => ({ key, severity: "critical", condition: true, title: "Launchpad is short of ETH", lines: ["Short by 1 ETH."] });

describe("the dispatcher", () => {
  it("sends a one-off alert once, however often it is raised", async () => {
    const { dispatcher, sent } = setup({ channels: 1 });
    await dispatcher.dispatch([event("owner:0x1:0")], [], 10);
    await dispatcher.dispatch([event("owner:0x1:0")], [], 11);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe("🟠 tonkfun.fun · Robinhood Chain · block 10\n\n🟠 Title owner:0x1:0\nline one\nline two");
  });

  it("repeats a condition every interval while it lasts, and resolves it once a check finds it gone", async () => {
    const { dispatcher, sent, advance } = setup({ channels: 1 });
    await dispatcher.dispatch([condition("solvency:launchpad")], ["solvency:launchpad"], 1);
    advance(10 * MIN);
    await dispatcher.dispatch([condition("solvency:launchpad")], ["solvency:launchpad"], 2);
    // Not checked this cycle: it stays in force.
    await dispatcher.dispatch([], [], 3);
    advance(25 * MIN);
    await dispatcher.dispatch([condition("solvency:launchpad")], ["solvency:launchpad"], 4);
    advance(5 * MIN);
    await dispatcher.dispatch([], ["solvency:launchpad"], 5);
    expect(sent.map((s) => s.text.split("\n\n")[1])).toEqual([
      "🔴 Launchpad is short of ETH\nShort by 1 ETH.",
      "🔴 Still (35 min): Launchpad is short of ETH\nShort by 1 ETH.",
      "✅ Resolved: Launchpad is short of ETH (after 40 min)",
    ]);
    expect(dispatcher.state.active).toEqual({});
  });

  it("puts the most severe first, in one message per cycle, with the rest logged past 25", async () => {
    const { dispatcher, sent, logs } = setup({ channels: 1 });
    const many = Array.from({ length: 28 }, (_, i) => event(`e${i}`, i === 27 ? "critical" : "info"));
    await dispatcher.dispatch(many, [], 7);
    expect(sent).toHaveLength(1);
    const parts = sent[0].text.split("\n\n");
    expect(parts[0]).toBe("🔴 tonkfun.fun · Robinhood Chain · block 7");
    expect(parts[1]).toBe("🔴 Title e27\nline one\nline two");
    expect(parts.at(-1)).toBe("…and 3 more in the worker's log.");
    expect(logs).toHaveLength(28);
  });

  it("only logs in a dry run, and sends nothing", async () => {
    const { dispatcher, sent, logs } = setup({ dryRun: true });
    await dispatcher.dispatch([event("x", "critical")], [], 1);
    expect(sent).toEqual([]);
    expect(logs).toEqual(["CRITICAL Title x: line one line two"]);
    expect(dispatcher.state.lastAlertAt).not.toBeNull();
  });

  it("keeps a failed channel's messages and sends them next time, without holding up the other", async () => {
    const { dispatcher, sent, logs, fail } = setup();
    fail("webhook");
    await dispatcher.dispatch([event("a")], [], 1);
    expect(sent.map((s) => s.channel)).toEqual(["telegram"]);
    expect(dispatcher.waiting()).toBe(1);
    expect(logs.at(-1)).toBe("webhook failed (1 waiting): webhook down");
    fail(null);
    await dispatcher.dispatch([], [], 2);
    expect(sent.map((s) => s.channel)).toEqual(["telegram", "webhook"]);
    expect(dispatcher.waiting()).toBe(0);
  });
});

describe("delivery", () => {
  const recorder = (status = 200, body: unknown = { ok: true }) => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      // Discord answers 204 No Content, which carries no body.
      return new Response(status === 204 ? null : JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { requests, fetchFn };
  };

  it("sends Telegram plain text to the one chat, without link previews", async () => {
    const { requests, fetchFn } = recorder();
    await telegramChannel("123:SECRET", "-100777", fetchFn).send("🔴 hello <b>@everyone</b>");
    expect(requests[0].url).toBe("https://api.telegram.org/bot123:SECRET/sendMessage");
    expect(JSON.parse(String(requests[0].init.body))).toEqual({ chat_id: "-100777", text: "🔴 hello <b>@everyone</b>", disable_web_page_preview: true });
  });

  it("reports a refusal or an unreachable channel without the token or the URL", async () => {
    const refused = recorder(400, { ok: false, description: "Bad Request: chat not found" });
    await expect(telegramChannel("123:SECRET", "1", refused.fetchFn).send("x")).rejects.toThrow("telegram HTTP 400: Bad Request: chat not found");
    const throwing = (async (url: string) => {
      throw new Error(`connect failed to ${url}`);
    }) as unknown as typeof fetch;
    const error = await telegramChannel("123:SECRET", "1", throwing).send("x").catch((e: Error) => e);
    expect(String(error)).not.toContain("SECRET");
    const hook = await webhookChannel("https://discord.com/api/webhooks/1/SECRET", throwing).send("x").catch((e: Error) => e);
    expect(String(hook)).toBe("DeliveryFailure: webhook unreachable");
  });

  it("sends a Discord-compatible webhook with every mention turned off", async () => {
    const { requests, fetchFn } = recorder(204, {});
    await webhookChannel("https://discord.com/api/webhooks/1/SECRET", fetchFn).send("text");
    expect(JSON.parse(String(requests[0].init.body))).toEqual({ content: "text", allowed_mentions: { parse: [] } });
  });

  it("pings the dead man's switch, redacts secrets and splits long messages at line breaks", async () => {
    const { requests, fetchFn } = recorder();
    await ping("https://hc-ping.com/abc-123", fetchFn);
    expect(requests[0].init.method).toBe("GET");
    expect(redactor(["123:SECRET", "https://rpc/key"])("failed at https://rpc/key with 123:SECRET")).toBe("failed at (hidden) with (hidden)");
    expect(split("aaaa\nbbbb\ncc", 9)).toEqual(["aaaa\nbbbb", "cc"]);
    expect(split("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
});
