import { describe, expect, it } from "vitest";
import { applyParamUpdates, serializeParams } from "@/shared/lib/url-params";

describe("applyParamUpdates + serializeParams", () => {
  it("writes keys in the shared order, whatever order they were set in", () => {
    const params = applyParamUpdates("", { q: "mo", tf: "1h", tab: "locked", pad: "pons", chain: "sol" });
    expect(serializeParams(params)).toBe("?chain=sol&pad=pons&tab=locked&tf=1h&q=mo");
  });

  it("removes keys set to null or an empty string", () => {
    const params = applyParamUpdates("?chain=sol&q=mo", { chain: null, q: "" });
    expect(serializeParams(params)).toBe("");
  });

  it("keeps unknown keys after the known ones", () => {
    const params = applyParamUpdates("?utm=x", { tab: "gainers" });
    expect(serializeParams(params)).toBe("?tab=gainers&utm=x");
  });
});
