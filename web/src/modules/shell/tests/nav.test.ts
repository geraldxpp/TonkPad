import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { activeNavId, MAIN_NAV, UTILITY_NAV } from "../lib/nav";

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

  it.each([
    ["/es", "explore"],
    ["/es/live", "live"],
    ["/ja/docs", "docs"],
    // The prerendered English pages are rendered at /en/…, then served at /….
    ["/en", "explore"],
    ["/en/bridge", "bridge"],
  ])("matches localised path %s to %s", (path, id) => {
    expect(activeNavId(path)).toBe(id);
  });

  it("highlights nothing on token pages", () => {
    expect(activeNavId("/token/GHOST")).toBeNull();
    expect(activeNavId("/de/token/GHOST")).toBeNull();
  });

  it("keeps the rail order from the design", () => {
    expect(MAIN_NAV.map((item) => en.nav[item.id])).toEqual([
      "Explore",
      "Live",
      "Bridge",
      "Portfolio",
      "Alerts",
      "Launch",
      "Docs",
    ]);
  });

  it("gives the phone tab bar seven tabs (Alerts moves to the bell, Theme to the More sheet)", () => {
    const phoneTabs = [...MAIN_NAV, ...UTILITY_NAV].filter((item) => !item.hideOnMobile).map((item) => en.nav[item.id]);
    expect(phoneTabs).toEqual(["Explore", "Live", "Bridge", "Portfolio", "Launch", "Docs", "More"]);
  });
});
