import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildKnowledge, KNOWLEDGE_SECTIONS } from "@/shared/bot/knowledge";
import { en } from "@/shared/i18n/dictionaries/en";
import { figureStrings } from "@/shared/tonk/figures";
import type { TonkSettingsJson } from "@/shared/tonk/types";
import type { DocsData } from "../data/get-docs-data";
import { DocsView } from "../DocsView";
import { mainnetContracts } from "../lib/contracts";
import { type FigureKey, figureText } from "../lib/figure-text";
import { docsFigures } from "../lib/figures";
import type { DocsLiveValue } from "../lib/live";
import { DOC_SECTIONS } from "../lib/sections";

// The shell's live data: the ETH price mainnet counts dollars at.
const shell = vi.hoisted(() => ({ value: { live: true, data: { status: { ethUsd: 3000 } }, failed: false } }));
vi.mock("@/modules/shell/live/ShellLive", () => ({ useShellLive: () => shell.value }));

/** The Docs page on the mainnet site, Launch open to everyone: what the bot's knowledge is written from. */
const MAINNET: DocsData = { source: "live", mode: "mainnet", chainName: "Robinhood Chain", unit: "ETH", settings: null, inviteOnly: false, contracts: mainnetContracts() };

/** What the deployed launchpad answers on /api/tonk/settings. */
const READ: TonkSettingsJson = { chainId: 4663, launchFee: "5000000000000000", virtualEth: "1000000000000000000", virtualTokens: "1073000000000000000000000000", paused: false, gasPrice: "10000000", readAt: 1 };

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

/** Every text the page shows, but the live figures' values and the table of contents, which repeats the section titles. */
function pageTexts(): string[] {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    if (text && !node.parentElement?.closest("[data-figure], nav, summary")) texts.push(text);
  }
  return texts;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the bot's knowledge and the Docs page", () => {
  it("has the page's sections, in the page's order", () => {
    expect([...KNOWLEDGE_SECTIONS]).toEqual([...DOC_SECTIONS]);
  });

  it("holds every sentence the page shows on mainnet, but the live figures' values", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(READ)));
    render(createElement(DocsView, { t: en, href: (path: string) => path, data: MAINNET }));
    await waitFor(() => expect(document.querySelector('[data-figure="fee"]')?.textContent).toBe("0.005 ETH≈ $15.00"));
    const { core } = buildKnowledge();
    const texts = pageTexts();
    expect(texts.length).toBeGreaterThan(150);
    expect(texts.filter((text) => !core.includes(text))).toEqual([]);
  });

  it("gives the bot's launchpad_figures the very strings the page shows", () => {
    const figures = docsFigures(READ);
    if (!figures) throw new Error("no figures");
    const live: DocsLiveValue = { figures, pending: false, source: "live", chainName: "Robinhood Chain", unit: "ETH", usd: 3000 };
    const page = (key: FigureKey) => figureText(key, live, en.docs.figures);
    const bot = figureStrings(figures, 3000, "ETH");
    expect(bot).toEqual({
      launchFee: page("fee").value,
      startReserves: page("reserves").value,
      startCap: page("startCap").value,
      graduation: page("graduation").value,
      graduationCap: page("graduation").detail,
      paused: false,
      usd: { launchFee: page("fee").usd, startCap: page("startCap").usd, graduationCap: page("graduation").usd },
    });
  });
});
