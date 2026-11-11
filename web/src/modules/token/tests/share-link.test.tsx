import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { HeaderActions } from "../components/HeaderActions";

const TOKEN = { address: "0x688f55969D15769596B4560c9EC5880cF3a3aADE", name: "Claude Round One Lock", ticker: "CR1LOCK" };
const HASH = `0x${"85".repeat(32)}`;

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  window.history.replaceState(null, "", "/");
});

describe("the token page's Share", () => {
  it("shares the view without the sharer's own transaction in flight (campaign round 1)", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    window.history.replaceState(null, "", `/token/${TOKEN.address}?tf=1h&tx=${HASH}&action=extend:${HASH}`);
    render(<HeaderActions token={TOKEN} links={{ website: null, community: null }} />);
    fireEvent.click(screen.getByRole("button", { name: en.token.share }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({ title: "Claude Round One Lock ($CR1LOCK)", url: `${window.location.origin}/token/${TOKEN.address}?tf=1h` });
  });
});
