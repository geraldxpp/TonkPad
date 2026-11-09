import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/live/token/[address]/route";
import { jsonResponse, LIVE_ADDRESS, liveDetail } from "./live.fixture";

beforeEach(() => { vi.stubEnv("WORKER_URL", "https://worker.example"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = (address = LIVE_ADDRESS) => GET(new Request(`https://tonkpad.example/api/live/token/${address}?path=/overview`), { params: Promise.resolve({ address }) });

it("proxies the selected token without forwarding query parameters or exposing worker credentials", async () => {
  vi.stubEnv("WORKER_TOKEN", "private-worker-token");
  const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(liveDetail()));
  vi.stubGlobal("fetch", fetchMock);
  const response = await request();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(liveDetail());
  expect(response.headers.get("x-worker-token")).toBeNull();
  expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://worker.example/v1/token/${LIVE_ADDRESS}`);
});

it("preserves not-found and unavailable as distinct responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({}, 404)).mockRejectedValueOnce(new Error("private worker diagnostics")));
  expect((await request()).status).toBe(404);
  const failed = await request();
  expect(failed.status).toBe(502);
  expect(failed.headers.get("cache-control")).toBe("no-store");
  expect(await failed.json()).toEqual({ error: "live data unavailable" });
});

it("rejects an injected address without fetching", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect((await request(`${LIVE_ADDRESS}/../overview`)).status).toBe(404);
  expect(fetchMock).not.toHaveBeenCalled();
});
