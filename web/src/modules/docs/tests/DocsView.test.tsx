import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { localizePath } from "@/shared/i18n/config";
import { de } from "@/shared/i18n/dictionaries/de";
import { en } from "@/shared/i18n/dictionaries/en";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import { FAQ } from "../components/FaqCard";
import { type DocsData, getDocsData } from "../data/get-docs-data";
import { DocsView } from "../DocsView";
import { MAINNET_RECORD } from "../lib/contracts";
import { DOC_SECTIONS } from "../lib/sections";

const href = (path: string) => path;
const region = (name: string) => screen.getByRole("region", { name });
const figure = (key: string) => document.querySelector(`[data-figure="${key}"]`)?.textContent ?? null;

async function demo(overrides: Partial<DocsData> = {}): Promise<DocsData> {
  return { ...(await getDocsData("mock")), ...overrides };
}

describe("DocsView", () => {
  it("shows the ten sections in the brief's order, each an anchor named by its heading", async () => {
    render(<DocsView t={en} href={href} data={await demo()} />);
    expect(screen.getByRole("heading", { level: 1, name: "How tonkfun.fun works." })).toBeInTheDocument();
    const sections = screen.getAllByRole("region");
    expect(sections.map((section) => section.id)).toEqual([...DOC_SECTIONS]);
    expect(sections.map((section) => section.getAttribute("aria-labelledby"))).toEqual(DOC_SECTIONS.map((id) => `${id}-title`));
    for (const id of DOC_SECTIONS) expect(region(en.docs[id].title)).toBeInTheDocument();
  });

  it("lists every section in the table of contents, as a link to its anchor", async () => {
    render(<DocsView t={en} href={href} data={await demo()} />);
    const [toc] = screen.getAllByRole("navigation", { name: "On this page", hidden: true });
    const links = within(toc).getAllByRole("link", { hidden: true });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(DOC_SECTIONS.map((id) => `#${id}`));
    expect(links.map((link) => link.textContent)).toEqual(DOC_SECTIONS.map((id) => en.docs[id].title));
  });

  it("states the contract's rules: the supply split, the tax, the Crew minimum, the locks and the pause", async () => {
    render(<DocsView t={en} href={href} data={await demo()} />);
    expect(within(region("The bonding curve")).getByText(/800 million are sold on the curve, and 200 million are kept back/)).toBeInTheDocument();
    expect(within(region("Fees")).getByText("Above 0.5%, the lock must also hold at least 10 million tokens: 1% of supply.")).toBeInTheDocument();
    expect(within(region("The launch-block tax")).getByText(/every buy pays a 99% tax.*Only the dev buy made inside the launch transaction is exempt/)).toBeInTheDocument();
    expect(within(region("The launch-block tax")).getByText(/The tax is burned/)).toBeInTheDocument();
    expect(within(region("Crew Rewards")).getByText(/No Crew fee is charged until eligible holders own at least 10 million tokens/)).toBeInTheDocument();
    expect(within(region("Crew Rewards")).getByText(/it goes to tonkfun.fun's treasury instead/)).toBeInTheDocument();
    expect(within(region("Locks")).getByText(/never shorter/)).toBeInTheDocument();
    expect(within(region("Locks")).getByText(/what has already unlocked stays claimable, and only what hasn't vests again/)).toBeInTheDocument();
    expect(within(region("Safety")).getByText(/Selling to the curve always stays open/)).toBeInTheDocument();
  });

  it("explains the three score levels and every badge with the app's own badges", async () => {
    render(<DocsView t={en} href={href} data={await demo()} />);
    const score = region("Mission score and badges");
    for (const level of ["Safe", "Caution", "Risky"]) expect(within(score).getByText(level)).toBeInTheDocument();
    expect(within(score).getByText("75 and up: the checks turned up little to worry about.")).toBeInTheDocument();
    for (const badge of ["Locked", "Crew 2%", "Agent", "New", "Graduated", "Verified RWA", "Block-0 Shield"]) expect(within(score).getByText(badge)).toBeInTheDocument();
    expect(within(score).getByRole("img", { name: "Hot" })).toBeInTheDocument();
  });

  it("says plainly there was no outside audit, links to the Security page, and names the Safe account", async () => {
    render(<DocsView t={en} href={(path) => localizePath("de", path)} data={await demo()} />);
    const safety = region("Safety");
    expect(within(safety).getByRole("note")).toHaveTextContent("Beta: there has been no outside audit.");
    expect(within(safety).getByRole("link", { name: "What was checked, and how to report a flaw: the Security page" })).toHaveAttribute("href", "/de/security");
    expect(within(safety).getByText(/owned by the team's Safe account/)).toBeInTheDocument();
  });

  it("links each mainnet contract to its verified source on Blockscout, and the Safe to its page", async () => {
    render(<DocsView t={en} href={href} data={await demo()} />);
    const safety = region("Safety");
    const explorer = "https://robinhoodchain.blockscout.com/address";
    for (const id of ["launchpad", "migrator", "guard", "tokenFactory"] as const) {
      const link = within(safety).getByRole("link", { name: MAINNET_RECORD[id] });
      expect(link).toHaveAttribute("href", `${explorer}/${MAINNET_RECORD[id]}?tab=contract`);
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(within(safety).getByRole("link", { name: MAINNET_RECORD.safe })).toHaveAttribute("href", `${explorer}/${MAINNET_RECORD.safe}`);
  });

  it("shows the demo's figures from its settings, and says they're a demo", async () => {
    render(<DocsView t={en} href={href} data={await demo()} />);
    expect(figure("fee")).toBe("0.005 ETH");
    expect(figure("reserves")).toBe("1 ETH and 1,073,000,000 tokens, virtual");
    expect(figure("startCap")).toBe("0.93 ETH");
    expect(figure("graduation")).toBe("After about 2.93 ETH net into the curveAt a market cap of about 14.4 ETH");
    expect(figure("status")).toBe("Open");
    expect(screen.getAllByText("Demo figures, not read from a chain.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/≈ \$/)).toBeNull();
  });

  it("without a launchpad, every figure says it is unavailable, and nothing stands in for one", async () => {
    render(<DocsView t={en} href={href} data={await getDocsData("off")} />);
    for (const key of ["fee", "reserves", "startCap", "graduation", "status", "reserveNow", "maxCurve"]) expect(figure(key)).toBe("Unavailable right now");
    expect(screen.queryByText(/0\.005/)).toBeNull();
    expect(screen.getAllByText("No launchpad is connected on this site, so these figures are unavailable.").length).toBeGreaterThan(0);
  });

  it("answers ten FAQ questions", async () => {
    render(<DocsView t={en} href={href} data={await demo()} />);
    const faq = region("FAQ");
    expect(FAQ).toHaveLength(10);
    for (const id of FAQ) {
      expect(within(faq).getByText(en.docs.faq.questions[id])).toBeInTheDocument();
      expect(within(faq).getByText(en.docs.faq.answers[id])).toBeInTheDocument();
    }
  });

  it("notes invite-only launches and the testnet site only where they apply", async () => {
    const { unmount } = render(<DocsView t={en} href={href} data={await demo()} />);
    expect(screen.queryByText(/invite-only/)).toBeNull();
    expect(screen.queryByText(/This is the testnet site/)).toBeNull();
    unmount();
    render(<DocsView t={en} href={href} data={await demo({ inviteOnly: true, mode: "testnet" })} />);
    expect(screen.getByText("Launch is invite-only for now: only invited creators can launch from this site.")).toBeInTheDocument();
    expect(screen.getByText(/This is the testnet site/)).toBeInTheDocument();
  });

  it("reads in German, its figures and badges included", async () => {
    render(
      <I18nProvider lang="de" messages={de}>
        <DocsView t={de} href={(path) => localizePath("de", path)} data={await demo()} />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "So funktioniert tonkfun.fun." })).toBeInTheDocument();
    expect(region("Gebühren")).toBeInTheDocument();
    expect(figure("reserves")).toBe("1 ETH und 1,073,000,000 Token, virtuell");
    expect(screen.getAllByText("Gesperrt").length).toBeGreaterThan(0);
  });
});
