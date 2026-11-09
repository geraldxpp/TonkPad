import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import type { TokenDetail } from "@/shared/types/token-detail";
import { StatsStrip } from "../components/StatsStrip";
import { GHOSTY } from "../data/ghosty.mock";
import { liveDetail } from "./live.fixture";

function devLockedCell(detail: TokenDetail) {
  render(
    <I18nProvider lang="en" messages={en}>
      <StatsStrip detail={detail} />
    </I18nProvider>,
  );
  const label = screen.getByText(en.token.stats.devLocked);
  return within(label.parentElement as HTMLElement);
}

it("keeps a live token's unknown dev lock to the short note the other stats use", () => {
  const cell = devLockedCell(liveDetail());
  expect(cell.getByText("—")).toBeVisible();
  expect(cell.getByText(en.token.live.unavailable)).toBeVisible();
  expect(screen.queryByText(en.token.live.unknownLock)).not.toBeInTheDocument();
});

it("shows the lock and its vest when there is one", () => {
  expect(devLockedCell(GHOSTY).getByText("180-day vest")).toBeVisible();
});

it("says no lock for a mock token that has none", () => {
  expect(devLockedCell({ ...GHOSTY, devLock: null }).getByText(en.token.stats.noLock)).toBeVisible();
});
