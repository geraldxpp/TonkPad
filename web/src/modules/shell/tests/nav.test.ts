import { describe, expect, it } from "vitest";
import { activeNavId, MAIN_NAV } from "../lib/nav";

describe("activeNavId", () => {
  it.each([
    ["/", "explore"],
    ["/live", "live"],
    ["/bridge", "bridge"],
    ["/portfolio", "portfolio"],
    ["/launch", "launch"],
    ["/docs", "docs"],
  ])("%s highlights %s", (path, id) => {
    expect(activeNavId(path)).toBe(id);
  });

  it("highlights nothing on token pages", () => {
    expect(activeNavId("/token/GHOST")).toBeNull();
  });

  it("keeps the rail order from the design", () => {
    expect(MAIN_NAV.map((item) => item.label)).toEqual([
      "Explore",
      "Live",
      "Bridge",
      "Portfolio",
      "Alerts",
      "Launch",
      "Docs",
    ]);
  });
});
