import { expect, test } from "@playwright/test";
import { openExplore } from "./helpers";

interface Stop {
  label: string;
  ring: boolean;
}

/** Tabs through the page and records whether each stop shows the 2 px focus ring. */
test("every Tab stop shows the focus ring, and the key controls are all reachable", async ({ page }) => {
  await openExplore(page);
  const stops: Stop[] = [];
  for (let i = 0; i < 160; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // The search input draws its ring on the surrounding label.
      const target = el.matches("input[type=search]") ? (el.closest("label") as HTMLElement) : el;
      const s = getComputedStyle(target);
      const ring = s.outlineStyle === "solid" && s.outlineWidth === "2px" && s.outlineColor === "rgb(36, 219, 234)";
      const label = el.getAttribute("aria-label") ?? el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ?? el.tagName;
      return { label: `${el.tagName.toLowerCase()}:${label}`, ring };
    });
    if (!stop) break;
    if (stops.length && stop.label === stops[0].label) break; // wrapped around
    stops.push(stop);
  }

  const missingRing = stops.filter((s) => !s.ring).map((s) => s.label);
  expect(missingRing).toEqual([]);

  const labels = stops.map((s) => s.label).join("\n");
  for (const expected of [
    "a:tonkfun.fun home",
    "a:Explore",
    "input:",
    "div:Live ticker",
    "All Chains", // the pill's text also holds its aria-hidden S/R marks
    "button:Alerts",
    "button:Connect wallet",
    "a:Explore the market",
    "a:Launch a token",
    "button:View all",
    "button:Previous",
    "a:Ghosty, market cap $58.2K, +412.6% in 24h",
    "button:Trending",
    "button:24h",
    "Moonshot304",
    "a:Open TIDE",
    "button:Load more",
    "summary:Launch radar",
    "a:Terms",
  ]) {
    expect(labels).toContain(expected);
  }
  // Only the selected list tab is in the Tab order (the others are reached with the arrows).
  expect(stops.filter((s) => s.label === "button:New pairs")).toHaveLength(0);
});

test("list tabs work from the keyboard", async ({ page }) => {
  await openExplore(page);
  await page.getByRole("tab", { name: "Trending" }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Locked Missions" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Locked Missions" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Showing 4 of 8,412 tokens · refreshes every 4s")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Smart money" })).toHaveAttribute("aria-selected", "true");
});

test("chips and toggles work with Enter and Space", async ({ page }) => {
  await openExplore(page);
  await page.getByRole("button", { name: /^Bags/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Bags/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Showing 1 of 8,412 tokens · refreshes every 4s")).toBeVisible();

  await page.getByRole("group", { name: "Timeframe" }).getByRole("button", { name: "6h" }).focus();
  await page.keyboard.press(" ");
  await expect(page.getByRole("group", { name: "Timeframe" }).getByRole("button", { name: "6h" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
