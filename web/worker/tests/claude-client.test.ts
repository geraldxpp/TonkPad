// @vitest-environment node
import { APIUserAbortError } from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createClaudeClient, failureOf } from "../src/telegram/claude/client";
import { type ClaudeFailure, type ClaudeRequest, TRIAGE_MODEL } from "../src/telegram/claude/types";
import { claudeMessage, textBlock } from "./community-fixtures-claude";

const KEY = "sk-ant-api03-test-key-0123456789";
const QUESTION = "MEMBER QUESTION: what is the launch fee?";

const request = (timeoutMs = 5_000): ClaudeRequest => ({
  kind: "answer",
  lane: "group",
  params: { model: TRIAGE_MODEL, max_tokens: 400, messages: [{ role: "user", content: QUESTION }] },
  timeoutMs,
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test_42", ...headers } });

/** An error body as the API sends it; the message is the API's own words, which must never reach a log. */
const apiError = (type: string, message: string, code?: string) => ({
  type: "error",
  error: { type, message, ...(code ? { details: { error_code: code } } : {}) },
  request_id: "req_test_42",
});

/** A client over a fake fetch that answers every call with `respond`, recording the calls and the log. */
function setup(respond: (url: string, init: RequestInit | undefined) => Promise<Response>) {
  const lines: string[] = [];
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => respond(String(input instanceof Request ? input.url : input), init));
  const client = createClaudeClient({ apiKey: KEY, log: (line) => void lines.push(line), fetch });
  return { client, fetch, lines };
}

describe("createClaudeClient", () => {
  it("refuses to start under Vitest without a fake fetch", () => {
    expect(() => createClaudeClient({ apiKey: KEY, log: () => undefined })).toThrow(/fake fetch/);
  });

  it("returns the message with its usage, from api.anthropic.com, logging metadata only", async () => {
    const message = claudeMessage({
      content: [textBlock("ANSWER TEXT: the fee is on the Docs page.")],
      stop_reason: "end_turn",
      usage: { input_tokens: 1_300, cache_read_input_tokens: 17_500, cache_creation_input_tokens: 0, output_tokens: 812 },
    });
    const { client, fetch, lines } = setup(async () => json(200, message));
    const outcome = await client.create(request());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.message.usage).toMatchObject({ input_tokens: 1_300, cache_read_input_tokens: 17_500, output_tokens: 812 });
    expect(outcome.message.content.find((b) => b.type === "text")).toMatchObject({ text: "ANSWER TEXT: the fee is on the Docs page." });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe("https://api.anthropic.com/v1/messages");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^claude answer group: end_turn, in 1300, cache read 17500, cache write 0, out 812, \d+ ms, req_test_42$/);
  });

  it("logs a refusal's category, never its explanation", async () => {
    const message = claudeMessage({
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: "EXPLANATION ABOUT THE MEMBER'S TEXT" },
    });
    const { client, lines } = setup(async () => json(200, message));
    const outcome = await client.create(request());
    expect(outcome.ok && outcome.message.stop_reason).toBe("refusal");
    expect(lines[0]).toContain("refusal (cyber)");
    expect(lines.join("\n")).not.toContain("EXPLANATION");
  });

  const cases: Array<[string, number, unknown, Record<string, string>, ClaudeFailure, string, number | null]> = [
    ["a bad request", 400, apiError("invalid_request_error", "messages: roles must alternate"), {}, "bad_request", "invalid_request_error", null],
    ["the workspace's spend limit", 400, apiError("invalid_request_error", "You have reached your specified workspace API usage limits."), {}, "billing", "invalid_request_error", null],
    ["an unscoped key", 400, apiError("invalid_request_error", "This API key is not scoped to a workspace."), {}, "auth", "invalid_request_error", null],
    ["a refused key", 401, apiError("authentication_error", "invalid x-api-key"), {}, "auth", "authentication_error", null],
    ["no credit", 402, apiError("billing_error", "Your credit balance is too low."), {}, "billing", "billing_error", null],
    ["no permission", 403, apiError("permission_error", "Not allowed."), {}, "auth", "permission_error", null],
    ["a missing model", 404, apiError("not_found_error", "model: claude-haiku-5-5"), {}, "not_found", "not_found_error", null],
    ["a request too large", 413, apiError("request_too_large", "Request exceeds the maximum size."), {}, "bad_request", "request_too_large", null],
    ["a rate limit", 429, apiError("rate_limit_error", "Number of requests has exceeded your rate limit."), { "retry-after": "7" }, "rate_limited", "rate_limit_error", 7_000],
    ["the tier's spend cap", 429, apiError("rate_limit_error", "You have reached your monthly spend cap.", "enforced_spend_limit_reached"), {}, "billing", "rate_limit_error", null],
    ["a ramp limit", 429, apiError("rate_limit_error", "Usage is growing too fast.", "ramp_limit_exceeded"), { "retry-after": "12" }, "ramp", "rate_limit_error", 12_000],
    ["a server error", 500, apiError("api_error", "Internal server error."), {}, "server", "api_error", null],
    ["an overload", 529, apiError("overloaded_error", "Overloaded."), {}, "overloaded", "overloaded_error", null],
  ];

  it.each(cases)("maps %s to its failure and keeps the API's type", async (_name, status, body, headers, failure, type, retryAfterMs) => {
    const { client, fetch, lines } = setup(async () => json(status, body, headers));
    const outcome = await client.create(request());
    expect(outcome).toEqual({ ok: false, failure, type, status, retryAfterMs });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`claude answer group: ${failure} ${status} ${type}`);
    expect(lines[0]).toContain("req_test_42");
    const message = (body as { error: { message: string } }).error.message;
    expect(lines[0]).not.toContain(message);
    expect(lines[0]).not.toContain("MEMBER QUESTION");
    expect(lines[0]).not.toContain(KEY);
  });

  it("times out once, without a retry, when the request's own timeout passes", async () => {
    const { client, fetch, lines } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    const outcome = await client.create(request(50));
    expect(outcome).toEqual({ ok: false, failure: "timeout", type: null, status: null, retryAfterMs: null });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(lines[0]).toMatch(/^claude answer group: timeout, \d+ ms, \?$/);
  });

  it("gives up on a reply whose body stalls after its headers arrived", async () => {
    // The SDK's own timer stops at the headers; the client's abort signal, 2 s later, ends the read (as a real fetch would).
    const { client, fetch } = setup(async (_url, init) => {
      const signal = init?.signal;
      const body = new ReadableStream({ start: (c) => signal?.addEventListener("abort", () => c.error(signal.reason), { once: true }) });
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    });
    expect(await client.create(request(20))).toEqual({ ok: false, failure: "timeout", type: null, status: null, retryAfterMs: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  }, 10_000);

  it("reports a dropped connection as a network failure, once", async () => {
    const { client, fetch } = setup(async () => Promise.reject(new TypeError("fetch failed: connect ECONNREFUSED")));
    expect(await client.create(request())).toEqual({ ok: false, failure: "network", type: null, status: null, retryAfterMs: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  /** A system error as Node gives it (a code on the Error), wrapped as fetch wraps it. */
  const fetchFailed = (code: string | null, message = "connect failed") => new TypeError("fetch failed", { cause: Object.assign(new Error(message), code ? { code } : {}) });

  it.each(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_SSL_WRONG_VERSION_NUMBER", "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE"])(
    "marks a connection that failed with %s before the request was written as unsent",
    async (code) => {
      const { client, fetch, lines } = setup(async () => Promise.reject(fetchFailed(code)));
      expect(await client.create(request())).toEqual({ ok: false, failure: "network", type: "unsent", status: null, retryAfterMs: null });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(lines[0]).toMatch(/^claude answer group: network unsent, \d+ ms, \?$/);
    },
  );

  it("marks refused connections to every address as unsent, as Node aggregates them", async () => {
    const refused = (address: string) => Object.assign(new Error(`connect ECONNREFUSED ${address}:443`), { code: "ECONNREFUSED" });
    const all = Object.assign(new AggregateError([refused("192.0.2.1"), refused("2001:db8::1")], ""), { code: "ECONNREFUSED" });
    const { client } = setup(async () => Promise.reject(new TypeError("fetch failed", { cause: all })));
    expect(await client.create(request())).toMatchObject({ failure: "network", type: "unsent" });
  });

  it.each([["ECONNRESET"], ["UND_ERR_SOCKET"], ["EPIPE"], ["ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC"], [null]])("keeps a connection that failed with %s as one that may have been sent", async (code) => {
    const { client } = setup(async () => Promise.reject(fetchFailed(code, "socket hang up")));
    expect(await client.create(request())).toEqual({ ok: false, failure: "network", type: null, status: null, retryAfterMs: null });
  });

  it("treats a reply that isn't a message as unknown", async () => {
    const { client } = setup(async () => new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect(await client.create(request())).toEqual({ ok: false, failure: "unknown", type: null, status: null, retryAfterMs: null });
  });

  it("counts tokens, or returns null when the count fails", async () => {
    const counted = setup(async () => json(200, { input_tokens: 15_234 }));
    expect(await counted.client.countTokens({ model: TRIAGE_MODEL, messages: [{ role: "user", content: QUESTION }] })).toBe(15_234);
    const failed = setup(async () => json(500, apiError("api_error", "Internal server error.")));
    expect(await failed.client.countTokens({ model: TRIAGE_MODEL, messages: [{ role: "user", content: QUESTION }] })).toBeNull();
    expect([...counted.lines, ...failed.lines].join("\n")).not.toContain("MEMBER QUESTION");
  });
});

describe("failureOf", () => {
  it("calls an abort by the client's own deadline a timeout", () => {
    const timeout = { failure: "timeout", type: null, status: null, retryAfterMs: null };
    expect(failureOf(new APIUserAbortError())).toEqual(timeout);
    expect(failureOf(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toEqual(timeout);
    expect(failureOf(new DOMException("This operation was aborted", "AbortError"))).toEqual(timeout);
  });

  it("calls anything that isn't the SDK's error unknown", () => {
    for (const error of [new Error("boom"), "boom", null, undefined, { status: 429 }]) {
      expect(failureOf(error)).toEqual({ failure: "unknown", type: null, status: null, retryAfterMs: null });
    }
  });
});
