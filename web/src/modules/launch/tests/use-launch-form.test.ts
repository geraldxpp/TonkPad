import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { type CurveSettings, WEI } from "@/shared/tonk/curve";
import { parseEthInput } from "@/shared/tonk/format";
import { useLaunchForm } from "../hooks/useLaunchForm";
import { draftKey, restoreDraft } from "../lib/draft";
import { type LaunchForm } from "../lib/form";
import { launchRequest } from "../lib/request";
import { launchView } from "../lib/view";

const eth = (text: string) => parseEthInput(text) ?? BigInt(0);
/** The live mainnet launchpad: a 0.005 ETH fee and a 1 ETH virtual reserve. */
const LIVE: CurveSettings = { launchFee: eth("0.005"), virtualEth: eth("1"), virtualTokens: BigInt(1_073_000_000) * WEI };

const open = () => renderHook(() => useLaunchForm(LIVE, 4663)).result;
const set = (state: ReturnType<typeof open>, changes: [keyof LaunchForm, unknown, Partial<LaunchForm>?][]) => {
  for (const [key, value, also] of changes) act(() => state.current.set(key, value as never, also));
};
/** What the launch would be built from right now. */
const built = (state: ReturnType<typeof open>) => launchRequest(state.current.form, launchView(state.current.form, LIVE), "0x0000000000000000000000000000000000000001");

beforeEach(() => localStorage.clear());

describe("the Creator Studio's form while values are typed and picked", () => {
  it("opens on round presets: 0.04 ETH at the live 1 ETH reserve", () => {
    expect(open().current.form.devBuy).toBe("0.04");
  });

  it("never loses the time-lock or Creator Rewards to a length typed on the way, whatever is clicked next", () => {
    const state = open();
    set(state, [["lock", "time"], ["creator", 200]]);
    // "12" on the way to "120": held back while it lasts, and said so.
    set(state, [["days", 12]]);
    expect(state.current.form).toMatchObject({ lock: "time", days: 12, creator: 200 });
    expect(built(state)).toMatchObject({ lock: "time", days: 12, creatorBps: 50 });
    expect(state.current.notices).toEqual([{ key: "creatorTier", bps: 50 }]);
    // Then a day preset, Linear vesting or Crew: the 2% applies again at once.
    set(state, [["days", 90]]);
    expect(built(state)).toMatchObject({ lock: "time", days: 90, creatorBps: 200 });
    expect(state.current.notices).toEqual([]);
    set(state, [["days", 12], ["lock", "linear"]]);
    expect(built(state)).toMatchObject({ lock: "linear", creatorBps: 200 });
    set(state, [["lock", "time"], ["crew", 150]]);
    expect(built(state)).toMatchObject({ lock: "time", days: 12, crewBps: 150, creatorBps: 50 });
    expect(state.current.notices).toEqual([{ key: "creatorTier", bps: 50 }]);
  });

  it("keeps the chosen lock while a dev buy is typed or cleared, and a preset clicked after it keeps it too", () => {
    const state = open();
    set(state, [["lock", "time"], ["creator", 200]]);
    for (const text of ["", "0", "0.", "0.0"]) set(state, [["devBuy", text]]);
    expect(built(state)).toMatchObject({ lock: "none", creatorBps: 50 });
    expect(state.current.notices.map((notice) => notice.key)).toEqual(["noBuy", "creatorTier"]);
    set(state, [["devBuy", "0.08"]]);
    expect(built(state)).toMatchObject({ devBuy: eth("0.08").toString(), lock: "time", creatorBps: 200 });
    expect(state.current.notices).toEqual([]);
  });

  it("treats the None preset as a choice: no dev buy and no lock, which a later amount doesn't bring back", () => {
    const state = open();
    set(state, [["lock", "time"], ["devBuy", "0", { lock: "none" }], ["devBuy", "0.08"]]);
    expect(state.current.form).toMatchObject({ devBuy: "0.08", lock: "none" });
    expect(built(state)).toMatchObject({ lock: "none", creatorBps: 50 });
    // Creator Rewards stay held while there's no lock, and the notice says so for as long as it lasts.
    expect(state.current.notices).toEqual([{ key: "creatorTier", bps: 50 }]);
  });

  it("holds Creator Rewards back while Crew fills the pool, says so for as long as it lasts, and gives them back", () => {
    const state = open();
    // Crew 4% leaves no room in the 4% pool: Creator Rewards are held at 0, and the notice says so.
    set(state, [["crew", 400]]);
    expect(built(state)).toMatchObject({ crewBps: 400, creatorBps: 0 });
    expect(state.current.notices).toEqual([{ key: "creatorPool", bps: 0 }]);
    set(state, [["name", "W"]]);
    expect(state.current.notices).toEqual([{ key: "creatorPool", bps: 0 }]);
    set(state, [["crew", 200]]);
    expect(built(state)).toMatchObject({ crewBps: 200, creatorBps: 100 });
    expect(state.current.notices).toEqual([]);
    // A Creator choice that doesn't fit lowers Crew instead, and the last change's notice says so.
    set(state, [["creator", 400]]);
    expect(built(state)).toMatchObject({ crewBps: 0, creatorBps: 400 });
    expect(state.current.notices).toEqual([{ key: "crewPool", bps: 0 }]);
  });

  it("brings a draft saved mid-typing back inside 7–365 days, and still calls it saved", () => {
    expect(restoreDraft(JSON.stringify({ lock: "time", days: 0 }), LIVE)?.days).toBe(7);
    localStorage.setItem(draftKey(4663), JSON.stringify({ lock: "time", days: 400 }));
    const state = open();
    expect(state.current.form.days).toBe(365);
    expect(state.current.draft).toBe("saved");
  });
});
