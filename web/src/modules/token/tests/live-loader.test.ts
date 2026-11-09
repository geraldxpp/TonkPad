import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLiveTokenData } from "../data/get-live-token-data";
import { isTokenAddress } from "../lib/live-token";
import { jsonResponse, LIVE_ADDRESS, liveDetail, OTHER_ADDRESS, SOL_ADDRESS } from "./live.fixture";

beforeEach(() => { vi.stubEnv("WORKER_URL", "https://worker.example/"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("live address validation", () => {
  it("accepts EVM and 32-byte Solana addresses", () => {
    for (const address of [LIVE_ADDRESS, SOL_ADDRESS, "1".repeat(32)]) expect(isTokenAddress(address)).toBe(true);
  });

  it("rejects mock tickers, path/query injection and invalid Solana byte lengths", () => {
    for (const address of ["GHOST", `${LIVE_ADDRESS}?q=x`, `${LIVE_ADDRESS}/other`, "../overview", "%2e%2e", "0".repeat(44), "z".repeat(44), "1".repeat(33)]) {
      expect(isTokenAddress(address)).toBe(false);
    }
  });
});

describe("getLiveTokenData", () => {
  it("fetches the real address with a server-only credential, even when its ticker matches a mock", async () => {
    vi.stubEnv("WORKER_TOKEN", "private-worker-token");
    const detail = liveDetail();
    const fetchMock = vi.fn(async () => jsonResponse(detail));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getLiveTokenData(LIVE_ADDRESS)).toEqual({ status: "ok", detail });
    expect(fetchMock).toHaveBeenCalledWith(`https://worker.example/v1/token/${LIVE_ADDRESS}`, expect.objectContaining({
      headers: { "x-worker-token": "private-worker-token" }, cache: "no-store",
    }));
  });

  it("does not contact the worker for invalid addresses or return mock data", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getLiveTokenData("GHOST")).toEqual({ status: "not-found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distinguishes a worker 404 from a network or upstream failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({}, 404)).mockResolvedValueOnce(jsonResponse({}, 503)).mockRejectedValueOnce(new Error("offline")));
    expect(await getLiveTokenData(LIVE_ADDRESS)).toEqual({ status: "not-found" });
    expect(await getLiveTokenData(LIVE_ADDRESS)).toEqual({ status: "unavailable" });
    expect(await getLiveTokenData(LIVE_ADDRESS)).toEqual({ status: "unavailable" });
  });

  it("rejects malformed responses or another token's payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse(liveDetail(OTHER_ADDRESS))));
    expect(await getLiveTokenData(LIVE_ADDRESS)).toEqual({ status: "unavailable" });
    expect(await getLiveTokenData(LIVE_ADDRESS)).toEqual({ status: "unavailable" });
  });

  it("returns unavailable without fetching when the worker is not configured", async () => {
    vi.stubEnv("WORKER_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getLiveTokenData(LIVE_ADDRESS)).toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
