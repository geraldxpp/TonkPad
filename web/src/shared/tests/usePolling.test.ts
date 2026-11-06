import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePolling } from "../live/usePolling";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("usePolling", () => {
  it("skips the first fetch when the server already rendered that URL", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePolling("/api/a", { v: 1 }, 4_000, "/api/a"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ data: { v: 1 }, loading: false, error: false });
  });

  it("loads a new URL at once and reports loading until it answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ v: 2 })));
    const { result } = renderHook(() => usePolling<{ v: number } | null>("/api/b", null, 4_000));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current).toEqual({ data: { v: 2 }, loading: false, error: false }));
  });

  it("keeps the last good data when a refresh fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "down" }, 502)));
    const { result } = renderHook(() => usePolling<{ v: number } | null>("/api/c", { v: 1 }, 4_000));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toEqual({ v: 1 });
  });

  it("refreshes on its interval and stops when switched off", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse({ v: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = renderHook(({ url }) => usePolling(url, { v: 0 }, 4_000, "/api/d"), {
      initialProps: { url: "/api/d" as string | null },
    });
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rerender({ url: null });
    await act(() => vi.advanceTimersByTimeAsync(12_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
