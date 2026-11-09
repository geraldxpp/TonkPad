import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import type { TokenDetail } from "@/shared/types/token-detail";
import { TokenLive } from "../TokenLive";
import { jsonResponse, LIVE_ADDRESS, liveDetail, OTHER_ADDRESS } from "./live.fixture";

vi.mock("../TokenView", () => ({
  TokenView: ({ detail }: { detail: TokenDetail }) => <div data-testid="token">{detail.token.name}: {detail.token.address}</div>,
}));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const tick = () => act(() => vi.advanceTimersByTimeAsync(4_000));

it("uses server data initially and recovers a failed refresh without discarding it", async () => {
  const refreshed = liveDetail();
  refreshed.token.name = "Updated live token";
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(jsonResponse(refreshed));
  vi.stubGlobal("fetch", fetchMock);
  render(<TokenLive address={LIVE_ADDRESS} initial={{ status: "ok", detail: liveDetail() }} />);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByTestId("token")).toHaveTextContent(LIVE_ADDRESS);

  await tick();
  expect(screen.getByRole("status")).toHaveTextContent(en.token.live.stale);
  expect(screen.getByTestId("token")).toHaveTextContent("Live token");
  await tick();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByTestId("token")).toHaveTextContent("Updated live token");
});

it("recovers from an initial worker outage by immediately fetching the selected address", async () => {
  const fetchMock = vi.fn(async () => jsonResponse(liveDetail()));
  vi.stubGlobal("fetch", fetchMock);
  render(<TokenLive address={LIVE_ADDRESS} initial={{ status: "unavailable" }} />);
  expect(screen.getByRole("status")).toHaveTextContent(en.token.live.failed);
  await act(async () => {});
  expect(screen.getByTestId("token")).toHaveTextContent(LIVE_ADDRESS);
  expect(fetchMock).toHaveBeenCalledWith(`/api/live/token/${LIVE_ADDRESS}`, expect.objectContaining({ cache: "no-store" }));
});

it("distinguishes a missing token from a temporary failure and can recover", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({}, 404)).mockResolvedValueOnce(jsonResponse(liveDetail())));
  render(<TokenLive address={LIVE_ADDRESS} initial={{ status: "ok", detail: liveDetail() }} />);
  await tick();
  expect(screen.queryByTestId("token")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(en.token.live.notFound);
  await tick();
  expect(screen.getByTestId("token")).toHaveTextContent(LIVE_ADDRESS);
});

it("does not accept another token's data during a refresh", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(liveDetail(OTHER_ADDRESS))));
  render(<TokenLive address={LIVE_ADDRESS} initial={{ status: "ok", detail: liveDetail() }} />);
  await tick();
  expect(screen.getByRole("status")).toHaveTextContent(en.token.live.stale);
  expect(screen.getByTestId("token")).toHaveTextContent(LIVE_ADDRESS);
  expect(screen.getByTestId("token")).not.toHaveTextContent(OTHER_ADDRESS);
});

it("ignores the previous address's late response after navigating", async () => {
  let resolveOld: (response: Response) => void = () => {};
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce(jsonResponse(liveDetail(OTHER_ADDRESS)));
  vi.stubGlobal("fetch", fetchMock);
  const { rerender } = render(<TokenLive address={LIVE_ADDRESS} initial={{ status: "unavailable" }} />);
  rerender(<TokenLive address={OTHER_ADDRESS} initial={{ status: "unavailable" }} />);
  await act(async () => {});
  expect(screen.getByTestId("token")).toHaveTextContent(OTHER_ADDRESS);
  await act(async () => { resolveOld(jsonResponse(liveDetail())); });
  expect(screen.getByTestId("token")).toHaveTextContent(OTHER_ADDRESS);
  expect(screen.getByTestId("token")).not.toHaveTextContent(LIVE_ADDRESS);
});

it("pauses timed polling while hidden and refreshes when visible again", async () => {
  const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const fetchMock = vi.fn(async () => jsonResponse(liveDetail()));
  vi.stubGlobal("fetch", fetchMock);
  render(<TokenLive address={LIVE_ADDRESS} initial={{ status: "ok", detail: liveDetail() }} />);
  await tick();
  expect(fetchMock).not.toHaveBeenCalled();
  visible.mockReturnValue("visible");
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
