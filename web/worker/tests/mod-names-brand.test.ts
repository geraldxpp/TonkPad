// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nameRisk } from "../src/telegram/mod/names";
import { cats } from "./mod-rules-fixtures";

const ADMINS = [{ name: "Alex Admin", username: "alex_admin" }];
const risk = (name: string, tag: string | null = null) => nameRisk({ name, username: null, tag, admins: ADMINS, bot: ["TonkfunBot"] });

/** rules#11: other launchpads, TON and words one letter from the brand are not the brand. */
describe("one edit from the brand, but not the brand (rules#11)", () => {
  it.each(["Bonk Fun Team", "TONPad Dev", "Ton Pad Support", "TON Fun Team", "Tank Fun Support", "Monk Fun Admin", "Tone Pad Dev", "Stonks Fun Team", "Pump Fun Support", "Pons Team"])(
    "leaves %s alone",
    (name) => {
      expect(risk(name)).toBeNull();
    },
  );

  it.each(["Tonkfun Support", "T.onkfun Support", "Tomkfun Support", "Tonfkun Admin", "Toonkfun Team", "Tonkfum Admin", "Tonkpaad Support", "T0nk.pad Team"])("still catches %s", (name) => {
    expect(risk(name)).toBe("impersonation");
  });
});

describe("a given name that is also a role word, beside the ticker (rules#11)", () => {
  it.each(["김지원 $TONK", "지원 | $TONK", "Dev Patel $TONK", "Resmi | $TONK", "Tonkfun 김지원"])("leaves %s alone", (name) => {
    expect(risk(name)).toBeNull();
  });

  it.each(["김지원 $TONK Support", "지원 | $TONK 관리자", "Dev Patel $TONK Admin", "Tonkfun 지원", "Tonkfun Dev", "$TONK Support"])("still catches %s", (name) => {
    expect(risk(name)).toBe("impersonation");
  });
});

/** rules#12: until getChat says members may edit their own tags, a tag is the admins' word. */
describe("member tags before getChat answers (rules#12)", () => {
  const sender = { name: "Sam", username: "sam_doe", tag: "Mod" };

  it("an unknown answer reads the tag as set by admins", () => {
    expect(cats("gm", { sender })).toEqual([]);
    expect(cats("gm", { sender, tagsByAdmins: undefined })).toEqual([]);
    expect(cats("gm", { sender, tagsByAdmins: true })).toEqual([]);
  });

  it("a tag members may edit is read like a name", () => {
    expect(cats("gm", { sender, tagsByAdmins: false })).toEqual(["impersonation"]);
  });
});
