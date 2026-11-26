// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nameRisk } from "../src/telegram/mod/names";
import { cats, hit } from "./mod-rules-fixtures";

const ADMINS = [{ name: "Alex Admin", username: "alex_admin" }];
const risk = (name: string, tag: string | null = null) => nameRisk({ name, username: null, tag, admins: ADMINS, bot: ["TonkfunBot"] });
const sender = (name: string, tag: string | null) => ({ name, username: "sam_doe", tag });

describe("role words that are names or ordinary words (abuse#13)", () => {
  it.each(["지원", "Resmi", "CS", "Tonkfun支持者", "TonkfunSupporter", "Tonkfun Supporter", "Dev"])("leaves %s alone", (name) => {
    expect(risk(name)).toBeNull();
  });

  it.each(["Support", "고객센터", "Help Desk", "Tonkfun 지원", "Tonkfun Resmi", "Tonkfun CS", "Tonkfun 支持"])("still catches %s", (name) => {
    expect(risk(name)).toBe("impersonation");
  });
});

describe("member tags set by admins (abuse#13)", () => {
  it.each(["Mod", "Team", "Support"])("a tag %s is read like a name while members may edit their own", (tag) => {
    expect(hit("gm", "impersonation", { sender: sender("Sam", tag), tagsByAdmins: false })).toBeDefined();
    // rules#12: until getChat has answered, a tag is the admins' word.
    expect(hit("gm", "impersonation", { sender: sender("Sam", tag) })).toBeUndefined();
  });

  it.each(["Mod", "Team", "Support", "t.me/whatever"])("a tag %s is the admins' word when members can't edit theirs", (tag) => {
    expect(cats("gm", { sender: sender("Sam", tag), tagsByAdmins: true })).toEqual([]);
  });

  it("still reads the name itself", () => {
    expect(cats("gm", { sender: sender("Tonkfun Support", "Mod"), tagsByAdmins: true })).toEqual(["impersonation"]);
  });
});

describe("the brand split or misspelt beside a role (abuse#15)", () => {
  it.each(["T.onkfun Support", "To nkfun Support", "Tonkfun Suport", "T-o-n-k-f-u-n Admin", "Tomkfun Support", "Tonfkun Admin", "T0nk.pad Team"])("catches %s", (name) => {
    expect(risk(name)).toBe("impersonation");
  });

  it.each(["Tonka Fun Support", "ThinkFun Support", "Monkey Fun Support", "Tonkatsu Support", "Stonks Dev", "T. Onken Support"])("leaves %s alone", (name) => {
    expect(risk(name)).toBeNull();
  });

  it("checks a split brand in the tag too", () => {
    expect(risk("Sam", "T.onkfun Support")).toBe("impersonation");
  });
});
