import Anthropic, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "@anthropic-ai/sdk";
import { neverSent } from "./client-unsent";
import { type ClaudeClient, type ClaudeFailure, UNSENT } from "./types";

/** Anthropic's API, pinned: a stray ANTHROPIC_BASE_URL must never send the key or members' text anywhere else. */
const API = "https://api.anthropic.com";
/** A request's timeout when the caller's isn't a number, and the eval's token counts. */
const DEFAULT_TIMEOUT_MS = 20_000;
/** At most the SDK's own default, 10 minutes (a timer past Node's limit would fire at once). */
const MAX_TIMEOUT_MS = 600_000;
/**
 * The SDK's own timeout stops once the response headers arrive, so a stalled
 * body could hold a request (and its queue slot) until the socket gives up.
 * Each call also passes this much later an abort signal, which the SDK keeps
 * listening until the body is read.
 */
const BODY_SLACK_MS = 2_000;

/** An API value as logged: a short word, never free text. */
const word = (v: unknown) => (typeof v === "string" && /^[\w.:-]{1,80}$/.test(v) ? v : "?");
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "?");

/** Seconds or an HTTP date, as ms from now; null when absent, past or unreadable. */
function retryAfter(headers: Headers | undefined): number | null {
  const value = headers?.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms) : null;
}

function byStatus(status: number | null, type: string | null, code: string | null, message: string | null): ClaudeFailure {
  if (status === 400) {
    // Two 400s carry no code: a workspace's own spend limit, and a key not scoped to a workspace. Matched by prefix only, never logged.
    if (message?.startsWith("You have reached your specified")) return "billing";
    if (message?.startsWith("This API key is not scoped to a workspace")) return "auth";
    return "bad_request";
  }
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "billing";
  if (status === 404) return "not_found";
  if (status === 413) return "bad_request";
  if (status === 429) {
    if (code === "enforced_spend_limit_reached" || code === "contract_spend_limit_reached") return "billing";
    return code === "ramp_limit_exceeded" ? "ramp" : "rate_limited";
  }
  if (status === 529 || type === "overloaded_error") return "overloaded";
  return status !== null && status >= 500 ? "server" : "unknown";
}

/**
 * Why a request failed, from the SDK's typed errors, most specific first
 * (APIConnectionTimeoutError is an APIConnectionError, which is an
 * APIError): a timeout, the network, then the HTTP status and Anthropic's
 * error code. `type` is the API's error type (such as "rate_limit_error"),
 * never its message; for a network failure it is "unsent" when the
 * connection failed before any of the request was written
 * (claude/client-unsent.ts), so the budget releases its reservation.
 */
export function failureOf(error: unknown): { failure: ClaudeFailure; type: string | null; status: number | null; retryAfterMs: number | null } {
  // Our own abort signal (a body that stalled past the timeout) surfaces as the SDK's abort error, or as the signal's reason.
  if (error instanceof APIUserAbortError || isAbort(error)) return { failure: "timeout", type: null, status: null, retryAfterMs: null };
  if (error instanceof APIConnectionTimeoutError) return { failure: "timeout", type: null, status: null, retryAfterMs: null };
  if (error instanceof APIConnectionError) return { failure: "network", type: neverSent(error.cause) ? UNSENT : null, status: null, retryAfterMs: null };
  if (!(error instanceof APIError)) return { failure: "unknown", type: null, status: null, retryAfterMs: null };
  const status = typeof error.status === "number" ? error.status : null;
  const type = error.type ?? null;
  return { failure: byStatus(status, type, error.errorCode, error.apiMessage), type, status, retryAfterMs: retryAfter(error.headers) };
}

/** An abort by a signal: AbortSignal.timeout rejects with a TimeoutError, an aborted read with an AbortError. */
const isAbort = (error: unknown) => error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

/** A reply the code can read: content blocks and usage. Anything else (a proxy's page, an empty body) is a failure. */
const isMessage = (m: unknown): m is Anthropic.Message =>
  typeof m === "object" && m !== null && Array.isArray((m as { content?: unknown }).content) && typeof (m as { usage?: unknown }).usage === "object" && (m as { usage?: unknown }).usage !== null;

/**
 * The bot's only door to Anthropic's Messages API, and the only file that
 * imports the SDK as a value. The SDK never retries (each attempt is the
 * caller's, reserved and charged), never logs (its debug level prints
 * bodies), sends no telemetry and always calls api.anthropic.com. Calls
 * never reject: errors come back as failures. Each call logs one line of
 * metadata (kind, lane, stop reason, a refusal's category, token counts,
 * time and request ID), never content, the API's error messages or the key.
 * Under Vitest it refuses to start without a fake fetch, so no test can
 * reach the network.
 */
export function createClaudeClient(options: { apiKey: string; log: (line: string) => void; fetch?: typeof fetch }): ClaudeClient {
  if (process.env.VITEST && !options.fetch) throw new Error("createClaudeClient: tests must pass a fake fetch");
  const client = new Anthropic({ apiKey: options.apiKey, baseURL: API, maxRetries: 0, logLevel: "off", openTelemetry: false, fetch: options.fetch });
  const log = (line: string) => {
    try {
      options.log(line);
    } catch {
      // A log line that fails never fails the call.
    }
  };

  return {
    async create(request) {
      const started = Date.now();
      const head = `claude ${word(request.kind)} ${word(request.lane)}`;
      const timeout = Number.isFinite(request.timeoutMs) ? Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(request.timeoutMs))) : DEFAULT_TIMEOUT_MS;
      try {
        const message = await client.messages.create(request.params, { timeout, maxRetries: 0, signal: AbortSignal.timeout(timeout + BODY_SLACK_MS) });
        const ms = Date.now() - started;
        if (!isMessage(message)) {
          log(`${head}: unknown (unreadable reply), ${ms} ms`);
          return { ok: false, failure: "unknown", type: null, status: null, retryAfterMs: null };
        }
        const u = message.usage;
        const why = message.stop_reason === "refusal" ? ` (${word(message.stop_details?.category ?? "uncategorized")})` : "";
        const tokens = `in ${count(u.input_tokens)}, cache read ${count(u.cache_read_input_tokens)}, cache write ${count(u.cache_creation_input_tokens)}, out ${count(u.output_tokens)}`;
        log(`${head}: ${word(message.stop_reason)}${why}, ${tokens}, ${ms} ms, ${word(message._request_id)}`);
        return { ok: true, message };
      } catch (error) {
        const failed = failureOf(error);
        const id = error instanceof APIError ? word(error.requestID) : "?";
        const status = failed.status === null ? "" : ` ${failed.status}`;
        log(`${head}: ${failed.failure}${status}${failed.type ? ` ${word(failed.type)}` : ""}, ${Date.now() - started} ms, ${id}`);
        return { ok: false, ...failed };
      }
    },

    async countTokens(params) {
      const started = Date.now();
      try {
        const counted = await client.messages.countTokens(params, { timeout: DEFAULT_TIMEOUT_MS, maxRetries: 0, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS + BODY_SLACK_MS) });
        const tokens = typeof counted?.input_tokens === "number" && Number.isFinite(counted.input_tokens) ? counted.input_tokens : null;
        log(`claude count_tokens: ${count(tokens)} tokens, ${Date.now() - started} ms`);
        return tokens;
      } catch (error) {
        log(`claude count_tokens: ${failureOf(error).failure}, ${Date.now() - started} ms`);
        return null;
      }
    },
  };
}
