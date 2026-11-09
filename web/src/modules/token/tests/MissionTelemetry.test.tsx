import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import { MissionTelemetry } from "../components/mission/MissionTelemetry";
import { GHOSTY } from "../data/ghosty.mock";

function renderTelemetry(props: ComponentProps<typeof MissionTelemetry>) {
  return render(
    <I18nProvider lang="en" messages={en}>
      <MissionTelemetry {...props} />
    </I18nProvider>,
  );
}

it("does not claim on-chain verification when no telemetry is available", () => {
  renderTelemetry({ devLock: null, crew: null });
  expect(screen.getByText(en.token.agent.noLock)).toBeVisible();
  expect(screen.queryByText(en.token.tele.verified)).not.toBeInTheDocument();
  expect(screen.queryByText(en.token.tele.crew)).not.toBeInTheDocument();
});

it("shows available crew telemetry and its verification badge", () => {
  renderTelemetry({ devLock: null, crew: GHOSTY.crew });
  expect(screen.getByText(en.token.tele.verified)).toBeVisible();
  expect(screen.getByText("$14,280")).toBeVisible();
  expect(screen.getByRole("img", { name: en.token.tele.payouts })).toBeVisible();
});

it("treats missing live lock data as unknown rather than unlocked", () => {
  renderTelemetry({ devLock: null, crew: null, live: true });
  expect(screen.getByText(en.token.live.unknownLock)).toBeVisible();
  expect(screen.queryByText(en.token.agent.noLock)).not.toBeInTheDocument();
  expect(screen.queryByText(en.token.tele.verified)).not.toBeInTheDocument();
});
