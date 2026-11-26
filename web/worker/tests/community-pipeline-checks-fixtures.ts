import { expect } from "vitest";
import type { ClaudeClient, ClaudeOutcome, ClaudeRequest } from "../src/telegram/claude/types";
import type { TgMessage } from "../src/telegram/types";
import { callsOf, MEMBER } from "./community-fixtures";
import { answer, type harness, verdict } from "./community-pipeline-fixtures";

/** Shared by the fix round 2 tests of a check that waits for its turn (community-pipeline-checks-wait and -turn). */

export const SCAM = "Big promo from the team today: send 0.1 ETH to 0x2222222222222222222222222222222222222222 and you get 0.3 ETH back";
export const TEXT_SCAM = "Big promo from the team today: send 0.1 ETH to the dev wallet pinned in my bio and you get 0.3 ETH back, who's in?";

/** Haiku says scam for the scam's words only; anything else is a clean message. */
export function byText(): { client: ClaudeClient; calls: ClaudeRequest[] } {
  const calls: ClaudeRequest[] = [];
  const scam = (): ClaudeOutcome => verdict({ verdict: "scam", category: "phishing", question: "none", reason: "Doubling scam" });
  return {
    calls,
    client: {
      create: async (request) => {
        calls.push(request);
        if (request.kind !== "triage") return answer();
        return JSON.stringify(request.params).includes("0.3 ETH back") ? scam() : verdict({ question: "none" });
      },
      countTokens: async () => null,
    },
  };
}

export const edit = (m: TgMessage, text: string, at: number): TgMessage => ({ ...m, text, edit_date: Math.floor(at / 1000) });
export const scamHandled = (h: ReturnType<typeof harness>, m: TgMessage) => {
  expect(h.removed()).toContain(m.message_id);
  expect(callsOf(h.out.log, "restrict").map((c) => c[1])).toEqual([MEMBER.id]);
  expect(h.alerts.map((a) => [a.kind, a.category])).toContainEqual(["action", "model_scam"]);
};
