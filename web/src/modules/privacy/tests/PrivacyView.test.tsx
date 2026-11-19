import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { localizePath } from "@/shared/i18n/config";
import { DICTIONARIES } from "@/shared/i18n/dictionaries";
import { en } from "@/shared/i18n/dictionaries/en";
import { PrivacyView } from "../PrivacyView";

const href = (path: string) => path;
const region = (name: string) => screen.getByRole("region", { name });

describe("PrivacyView", () => {
  it("names the bot and its handle, and when the policy last changed", () => {
    render(<PrivacyView p={en.privacy} href={href} updated="19 November 2026" />);
    expect(screen.getByRole("heading", { level: 1, name: "The bot keeps nothing about you." })).toBeInTheDocument();
    expect(screen.getByText("How TonkFun, tonkfun.fun's bot on Telegram (@TonkfunBot), handles what you send it.")).toBeInTheDocument();
    expect(screen.getByText("Last updated 19 November 2026")).toBeInTheDocument();
  });

  it("shows the six sections in order, each a named region", () => {
    render(<PrivacyView p={en.privacy} href={href} updated="19 November 2026" />);
    expect(screen.getAllByRole("region").map((section) => section.getAttribute("aria-labelledby"))).toEqual([
      "privacy-reads-title",
      "privacy-keeps-title",
      "privacy-never-title",
      "privacy-channel-title",
      "privacy-telegram-title",
      "privacy-questions-title",
    ]);
    expect(within(region("What it reads")).getByText(/When you type @TonkfunBot in any chat/)).toBeInTheDocument();
    expect(within(region("What it keeps")).getByText(/It saves no chat history, no Telegram IDs, no wallet addresses and no settings\./)).toBeInTheDocument();
    expect(within(region("What it never does")).getByText(/Ask for your seed phrase, private keys or passwords\./)).toBeInTheDocument();
  });

  it("links Telegram's own policy in a new tab, and the Security page in the page's language", () => {
    render(<PrivacyView p={en.privacy} href={(path) => localizePath("es", path)} updated="19 de noviembre de 2026" />);
    const telegram = within(region("Telegram")).getByRole("link", { name: "Telegram's privacy policy" });
    expect(telegram).toHaveAttribute("href", "https://telegram.org/privacy");
    expect(telegram).toHaveAttribute("target", "_blank");
    expect(telegram).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(region("Questions")).getByRole("link", { name: "Open the Security page" })).toHaveAttribute("href", "/es/security");
  });

  it("fills every placeholder in every language", () => {
    for (const [code, t] of Object.entries(DICTIONARIES)) {
      const { container, unmount } = render(<PrivacyView p={t.privacy} href={href} updated="1" />);
      expect(container.textContent, code).not.toMatch(/\{\w+\}/);
      expect(container.textContent, code).toContain("@TonkfunBot");
      unmount();
    }
  });
});
