import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { AgentChat } from "../components/mission/AgentChat";
import { GHOSTY } from "../data/ghosty.mock";

it("quick questions answer from the token facts and clear an unfinished draft", () => {
  render(
    <AgentChat
      agent="Captain Boo"
      art=""
      ticker="GHOST"
      facts={{
        name: "Ghosty",
        curvePct: 84,
        holders: 1_204,
        priceUsd: GHOSTY.priceUsd!,
        devLock: GHOSTY.devLock,
        crew: GHOSTY.crew,
        lockStarted: "Oct 18",
      }}
    />,
  );
  const input = screen.getByRole("textbox", { name: "Ask Captain Boo" });
  fireEvent.change(input, { target: { value: "unfinished question" } });
  fireEvent.click(screen.getByRole("button", { name: "How much has the crew earned?" }));

  const log = within(screen.getByRole("log", { name: "Chat with Captain Boo" }));
  expect(log.getByText("How much has the crew earned?")).toBeVisible();
  expect(log.getByText(/^The crew has pocketed \$14,280 so far\./)).toBeVisible();
  expect(log.queryByText("unfinished question")).not.toBeInTheDocument();
  expect(input).toHaveValue("");
});
