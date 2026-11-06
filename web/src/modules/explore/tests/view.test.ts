import { describe, expect, it } from "vitest";
import { applyParamUpdates, serializeParams } from "@/shared/lib/url-params";
import { DEFAULT_VIEW, parseView, RESET_PATCH, viewUpdates } from "../lib/view";

const parse = (search: string) => parseView(new URLSearchParams(search));

describe("parseView", () => {
  it("falls back to the defaults", () => {
    expect(parse("")).toEqual(DEFAULT_VIEW);
    expect(DEFAULT_VIEW).toEqual({ chain: "all", pad: "all", tab: "trending", tf: "24h", q: "" });
  });

  it("reads every param from the prompt's example URL", () => {
    expect(parse("?chain=sol&pad=pons&tab=locked&tf=1h&q=mo")).toEqual({
      chain: "sol",
      pad: "pons",
      tab: "locked",
      tf: "1h",
      q: "mo",
    });
  });

  it("ignores unknown values", () => {
    expect(parse("?chain=eth&pad=nope&tab=hot&tf=7d")).toEqual(DEFAULT_VIEW);
  });
});

describe("viewUpdates", () => {
  it("drops defaults from the URL", () => {
    expect(viewUpdates({ chain: "all", tab: "trending", tf: "24h", q: "", pad: "all" })).toEqual({
      chain: null,
      tab: null,
      tf: null,
      q: null,
      pad: null,
    });
  });

  it("round-trips the example URL in the shared key order", () => {
    const view = parse("?q=mo&tf=1h&tab=locked&pad=pons&chain=sol");
    const search = serializeParams(applyParamUpdates("", viewUpdates(view)));
    expect(search).toBe("?chain=sol&pad=pons&tab=locked&tf=1h&q=mo");
    expect(parse(search)).toEqual(view);
  });

  it("Reset filters returns to Trending, all launchpads, all chains and an empty search", () => {
    const search = serializeParams(applyParamUpdates("?chain=sol&pad=pons&tab=locked&tf=1h&q=mo", viewUpdates(RESET_PATCH)));
    expect(search).toBe("?tf=1h");
    expect(parse(search)).toEqual({ ...DEFAULT_VIEW, tf: "1h" });
  });
});
