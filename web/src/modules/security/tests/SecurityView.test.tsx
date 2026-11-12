import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { de } from "@/shared/i18n/dictionaries/de";
import { en } from "@/shared/i18n/dictionaries/en";
import type { SecurityData } from "../data/get-security-data";
import { FROZEN_AT, FROZEN_SOURCES } from "../lib/frozen-build";
import { SecurityView } from "../SecurityView";

const UNSET: SecurityData = {
  contact: null,
  rewards: { critical: null, high: null, medium: null, low: null },
  addresses: { state: "pending" },
  sources: FROZEN_SOURCES,
  frozenAt: FROZEN_AT,
};

const EXPLORER = "https://robinhoodchain.blockscout.com/address";
const LAUNCHPAD = "0x7a4c000000000000000000000000000000000001";
const MIGRATOR = "0x7a4c000000000000000000000000000000000002";

const region = (name: string) => screen.getByRole("region", { name });

describe("SecurityView", () => {
  it("shows the five sections, in the brief's order", () => {
    render(<SecurityView s={en.security} data={UNSET} />);
    expect(screen.getByRole("heading", { level: 1, name: "Found a flaw? Tell us first." })).toBeInTheDocument();
    expect(screen.getAllByRole("region").map((section) => section.getAttribute("aria-labelledby"))).toEqual([
      "security-report-title",
      "security-scope-title",
      "security-rules-title",
      "security-rewards-title",
      "security-checked-title",
    ]);
  });

  it("before anything is set: contact coming soon, nothing deployed, every reward decided case by case", () => {
    render(<SecurityView s={en.security} data={UNSET} />);
    const report = region("Report a vulnerability");
    expect(within(report).getByText("Coming soon")).toBeInTheDocument();
    expect(within(report).queryByRole("link")).toBeNull();
    expect(within(report).getByText("We reply within 48 hours, keep you posted while we fix it, and tell you when it's done.")).toBeInTheDocument();

    const scope = region("Scope");
    expect(within(scope).getAllByText("Not deployed yet")).toHaveLength(3);
    expect(within(scope).queryByRole("link")).toBeNull();
    expect(within(scope).getByText("Frozen 2026-11-11")).toBeInTheDocument();
    for (const source of FROZEN_SOURCES) {
      expect(within(scope).getByText(source.sha256)).toBeInTheDocument();
      expect(within(scope).getByText(source.file)).toBeInTheDocument();
    }
    expect(within(scope).getByText("TonkpadRobinhood · TonkToken · TonkTokenFactory")).toBeInTheDocument();
    expect(within(scope).getByText("Third-party services, such as Uniswap, wallets and bridges. Report those to their own teams.")).toBeInTheDocument();

    const rewards = region("Rewards");
    expect(within(rewards).getAllByText("Decided case by case")).toHaveLength(4);
    expect(within(rewards).queryByText(/Up to/)).toBeNull();
  });

  it("lists what was checked, with no outside-audit warning", () => {
    render(<SecurityView s={en.security} data={UNSET} />);
    const checked = region("What was checked");
    expect(within(checked).queryByRole("note")).toBeNull();
    const items = within(checked).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toHaveLength(7);
    for (const tool of ["Slither", "Aderyn", "Foundry", "Medusa", "Halmos"]) expect(items.join(" ")).toContain(tool);
  });

  it("keeps the rules and the safe harbour", () => {
    render(<SecurityView s={en.security} data={UNSET} />);
    const rules = region("Rules");
    expect(within(rules).getByText("Never test against mainnet funds that aren't yours. Use a fork, the testnet or your own wallets.")).toBeInTheDocument();
    expect(within(rules).getByRole("heading", { name: "Safe harbour" })).toBeInTheDocument();
  });

  it("links an email contact, the deployed contracts and the owner's amounts once set", () => {
    const data: SecurityData = {
      ...UNSET,
      contact: { kind: "email", text: "security@example.com", href: "mailto:security@example.com" },
      rewards: { critical: "$50,000", high: null, medium: null, low: "$500" },
      addresses: {
        state: "deployed",
        launchpad: { address: LAUNCHPAD, url: `${EXPLORER}/${LAUNCHPAD}` },
        migrator: { address: MIGRATOR, url: `${EXPLORER}/${MIGRATOR}` },
      },
    };
    render(<SecurityView s={en.security} data={data} />);
    const contact = within(region("Report a vulnerability")).getByRole("link", { name: "security@example.com" });
    expect(contact).toHaveAttribute("href", "mailto:security@example.com");
    expect(contact).not.toHaveAttribute("target");

    const scope = region("Scope");
    for (const address of [LAUNCHPAD, MIGRATOR]) {
      const link = within(scope).getByRole("link", { name: address });
      expect(link).toHaveAttribute("href", `${EXPLORER}/${address}`);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    // The guard has no setting of its own: the migrator names it.
    expect(within(scope).getByText("initializationGuard()")).toBeInTheDocument();
    expect(within(scope).queryByText("Not deployed yet")).toBeNull();

    const rewards = region("Rewards");
    expect(within(rewards).getByText("Up to $50,000")).toBeInTheDocument();
    expect(within(rewards).getByText("Up to $500")).toBeInTheDocument();
    expect(within(rewards).getAllByText("Decided case by case")).toHaveLength(2);
  });

  it("opens a link contact in a new tab", () => {
    render(<SecurityView s={en.security} data={{ ...UNSET, contact: { kind: "link", text: "example.com/security", href: "https://example.com/security" } }} />);
    const link = within(region("Report a vulnerability")).getByRole("link", { name: "example.com/security" });
    expect(link).toHaveAttribute("href", "https://example.com/security");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("on the testnet site, points to the mainnet site rather than name testnet contracts", () => {
    render(<SecurityView s={en.security} data={{ ...UNSET, addresses: { state: "elsewhere" } }} />);
    const scope = region("Scope");
    expect(within(scope).getAllByText("Listed on the mainnet site")).toHaveLength(3);
    expect(within(scope).queryByText("Not deployed yet")).toBeNull();
  });

  it("speaks the page's language", () => {
    render(<SecurityView s={de.security} data={UNSET} />);
    expect(screen.getByRole("heading", { level: 1, name: "Eine Lücke gefunden? Sag es uns zuerst." })).toBeInTheDocument();
    expect(within(region("Umfang")).getAllByText("Noch nicht deployt")).toHaveLength(3);
    expect(within(region("Belohnungen")).getAllByText("Wird im Einzelfall entschieden")).toHaveLength(4);
  });
});
