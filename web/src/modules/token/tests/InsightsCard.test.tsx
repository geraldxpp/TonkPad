import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import { InsightsCard } from "../components/InsightsCard";
import { CrewCard } from "../components/mission/CrewCard";
import { StatsStrip } from "../components/StatsStrip";
import { GHOSTY } from "../data/ghosty.mock";
import { liveDetail } from "./live.fixture";

const wrap = (node: ReactNode) => render(<I18nProvider lang="en" messages={en}>{node}</I18nProvider>);

it("shows the dev lock, its vest and the vesting progress when there is one", () => {
  wrap(<InsightsCard detail={GHOSTY} />);
  const card = screen.getByRole("region", { name: en.token.insights.title });
  expect(within(card).getByText("80% dev locked")).toBeVisible();
  expect(within(card).getByText("180-day vest")).toBeVisible();
  expect(within(card).getByRole("progressbar", { name: en.token.tele.devLock })).toBeVisible();
  expect(within(card).getByText("Mission score 94 / 100")).toBeInTheDocument();
});

it("says no lock for a mock token that has none", () => {
  wrap(<InsightsCard detail={{ ...GHOSTY, devLock: null }} />);
  expect(screen.getByText(en.token.insights.noLock)).toBeVisible();
  expect(screen.getByText(en.token.insights.canMove)).toBeVisible();
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

it("treats a live token's missing lock data as unknown rather than unlocked", () => {
  wrap(<InsightsCard detail={liveDetail()} />);
  expect(screen.getByText(en.token.insights.lockUnknown)).toBeVisible();
  expect(screen.queryByText(en.token.insights.noLock)).not.toBeInTheDocument();
  expect(screen.queryByText(en.token.insights.canMove)).not.toBeInTheDocument();
});

it("shows what the crew has been paid and the last 14 days", () => {
  if (!GHOSTY.crew) throw new Error("Ghosty pays its crew");
  wrap(<CrewCard crew={GHOSTY.crew} />);
  expect(screen.getByRole("heading", { name: en.token.crew.title })).toBeVisible();
  expect(screen.getByText("$14,280")).toBeVisible();
  expect(screen.getByRole("img", { name: en.token.tele.payouts })).toBeVisible();
});

it("keeps a live token's missing market figures to the short note", () => {
  wrap(<StatsStrip detail={liveDetail()} />);
  const stats = screen.getByRole("region", { name: en.token.stats.label });
  expect(within(stats).getByText(en.token.marketCap)).toBeVisible();
  expect(within(stats).queryByText(en.token.stats.devLocked)).not.toBeInTheDocument();
});
