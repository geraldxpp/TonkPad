import { expect, type Page, test } from "@playwright/test";
import { openExplore, pauseCarousel } from "./helpers";

interface AnimationInfo {
  name: string;
  duration: number;
  delay: number;
  iterations: number;
  easing: string;
  start: number | null;
  state: string;
}

function animations(page: Page): Promise<AnimationInfo[]> {
  return page.evaluate(() =>
    document.getAnimations().flatMap((a) => {
      if (!(a instanceof CSSAnimation)) return [];
      const timing = a.effect?.getComputedTiming();
      return [
        {
          name: a.animationName,
          duration: Number(timing?.duration),
          delay: Number(timing?.delay),
          iterations: Number(timing?.iterations),
          easing: String(a.effect?.getTiming().easing),
          start: typeof a.startTime === "number" ? a.startTime : null,
          state: a.playState,
        },
      ];
    }),
  );
}

test.describe("with motion", () => {
  test.beforeEach(async ({ page }) => {
    await openExplore(page);
    await page.waitForTimeout(300);
  });

  test("the sweep turns once every 6 s; the live dots pulse every 2 s", async ({ page }) => {
    const all = await animations(page);
    const sweep = all.filter((a) => a.name === "tk-sweep");
    expect(sweep).toHaveLength(1);
    expect(sweep[0]).toMatchObject({ duration: 6000, iterations: Infinity, state: "running" });
    expect(all.filter((a) => a.name === "tk-pulse")).toHaveLength(2);
    expect(all.find((a) => a.name === "tk-pulse")?.duration).toBe(2000);
  });

  test("every blip pings on the sweep's clock, delayed until the edge reaches it", async ({ page }) => {
    const all = await animations(page);
    const sweepStart = all.find((a) => a.name === "tk-sweep")?.start;
    const pings = all.filter((a) => a.name === "tk-ping");
    expect(pings).toHaveLength(7);
    expect(pings.map((p) => Math.round(p.delay)).sort((a, b) => a - b)).toEqual([533, 1167, 1867, 2917, 4167, 4967, 5767]);
    for (const a of all.filter((x) => ["tk-ping", "tk-blip", "tk-fill"].includes(x.name))) {
      expect(a.start).toBe(sweepStart);
      expect(a.duration).toBe(6000);
    }
  });

  test("both countdowns count down together with the sweep", async ({ page }) => {
    const read = () =>
      page.locator("[data-testid=sweep-countdown]").evaluateAll((els) => els.map((el) => el.textContent));
    const first = await read();
    expect(first).toHaveLength(2);
    expect(first[0]).toBe(first[1]);
    expect(first[0]).toMatch(/^0:0[1-6]$/);
    await expect.poll(read, { timeout: 2500 }).not.toEqual(first);
    const next = await read();
    expect(next[0]).toBe(next[1]);
  });

  test("the ticker tape is a 40 s marquee that pauses on hover and focus", async ({ page }) => {
    const state = () => page.evaluate(() => document.getAnimations().find((a) => a instanceof CSSAnimation && a.animationName === "tk-marquee")?.playState);
    const tape = page.getByRole("marquee", { name: "Live ticker" });
    expect((await animations(page)).find((a) => a.name === "tk-marquee")?.duration).toBe(40000);
    expect(await state()).toBe("running");
    await tape.hover();
    await expect.poll(state).toBe("paused");
    await page.mouse.move(700, 600);
    await expect.poll(state).toBe("running");
    await tape.focus();
    await expect.poll(state).toBe("paused");
  });

  test("token cards lift 4 px with a violet ring on hover", async ({ page }) => {
    const card = page.getByRole("link", { name: /^Ghosty, market cap/ });
    await pauseCarousel(page);
    await card.hover();
    await page.waitForTimeout(300);
    const style = await card.evaluate((el) => ({ transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow }));
    expect(style.transform).toBe("matrix(1, 0, 0, 1, 0, -4)");
    expect(style.shadow).toContain("rgba(61, 142, 240, 0.75) 0px 0px 0px 1.5px");
  });

  test("table rows turn the raised colour on hover", async ({ page }) => {
    const row = page.getByRole("table", { name: "Tokens" }).getByRole("row").nth(1);
    await row.hover();
    await expect.poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(21, 24, 28)");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("switches every animation off and shows the static countdown", async ({ page }) => {
    await openExplore(page);
    expect(await animations(page)).toEqual([]);
    await expect(page.getByText("0:04", { exact: true })).toHaveCount(2);
    await expect(page.getByTestId("sweep-countdown").first()).toBeHidden();
    const sweep = await page.getByTestId("radar-sweep").evaluate((el) => getComputedStyle(el).transform);
    expect(sweep).toBe("none"); // the wedge sits still at its start angle
  });

  test("cards no longer animate on hover", async ({ page }) => {
    await openExplore(page);
    const card = page.getByRole("link", { name: /^Ghosty, market cap/ });
    expect(await card.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  });
});
