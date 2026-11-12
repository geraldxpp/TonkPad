import { expect, test } from "@playwright/test";
import { openExplore, pauseCarousel } from "./helpers";

test("rail: Docs opens the docs page", async ({ page }) => {
  await openExplore(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Docs" }).click();
  await expect(page).toHaveURL("/docs");
  await expect(page.getByRole("heading", { level: 1, name: "How tonkfun.fun works." })).toBeVisible();
  await expect(page.getByText("Coming in a later module")).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Docs" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Explore" })).not.toHaveAttribute("aria-current", "page");
});

test("rail: Bridge opens the bridge screen", async ({ page }) => {
  await openExplore(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Bridge" }).click();
  await expect(page).toHaveURL("/bridge");
  await expect(page.getByRole("heading", { level: 1, name: "Your assets. More places." })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Bridge" })).toHaveAttribute("aria-current", "page");
});

test("rail: Portfolio opens the portfolio screen", async ({ page }) => {
  await openExplore(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Portfolio" }).click();
  await expect(page).toHaveURL("/portfolio");
  await expect(page.getByRole("heading", { level: 1, name: "A little more perspective." })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Portfolio" })).toHaveAttribute("aria-current", "page");
});

test("rail: Launch opens the Creator Studio", async ({ page }) => {
  await openExplore(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Launch" }).click();
  await expect(page).toHaveURL("/launch");
  await expect(page.getByRole("heading", { level: 1, name: "Launch a mission." })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Launch" })).toHaveAttribute("aria-current", "page");
});

test("rail: Swap opens the swap screen", async ({ page }) => {
  await openExplore(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Swap" }).click();
  await expect(page).toHaveURL("/swap");
  await expect(page.getByRole("heading", { level: 1, name: "Swap. Simple as that." })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Swap" })).toHaveAttribute("aria-current", "page");
});

test("Explore is the active rail item on /", async ({ page }) => {
  await openExplore(page);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Explore" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "Alerts, 3 new" })).toBeVisible();
});

test("token cards and table names link to /token/<TICKER>", async ({ page }) => {
  await openExplore(page);
  await pauseCarousel(page);
  await page.getByRole("link", { name: /^Orbit, market cap/ }).click();
  await expect(page).toHaveURL("/token/ORB");
  await expect(page.getByRole("heading", { level: 1, name: "Orbit" })).toBeVisible();

  await openExplore(page);
  await page.getByRole("table", { name: "Tokens" }).getByRole("link", { name: "Sol Cat" }).click();
  await expect(page).toHaveURL("/token/SCAT");
  await expect(page.getByRole("heading", { level: 1, name: "Sol Cat" })).toBeVisible();
});

test("the status bar links go to their placeholder pages", async ({ page }) => {
  await openExplore(page);
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible();
});
