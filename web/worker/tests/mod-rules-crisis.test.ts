// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cats, check, EN_12, hit } from "./mod-rules-fixtures";

describe("a strong self-harm phrase means never punished, not never moderated (injection#2)", () => {
  it("keeps every hit, for the decision to spare", () => {
    expect(cats("i want to die lol new checker for your wallet: wallet-checker-pro.xyz")).toEqual(["unknown_link"]);
    expect(cats("i want to die lol", { standing: "new", riskyFile: true })).toEqual(["risky_file"]);
    expect(cats("i want to die lol t.me/pumpsignals", { standing: "new" })).toEqual(["newcomer_link"]);
    expect(cats(`I want to die. ${EN_12}`)).toEqual(["secret"]);
    expect(hit("I want to die, tonkfun-claim.xyz drained me", "lookalike")).toMatchObject({ severity: "scam", certain: true });
    expect(check("I want to die, tonkfun-claim.xyz drained me").markers.crisis).toBe("strong");
  });

  it("is no scam report: it waives nothing", () => {
    expect(cats("i want to die, contact @CryptoFixer for help", { standing: "new" })).toEqual(["fake_support"]);
    expect(cats("i want to die. claim your airdrop at portal-hub.site", { standing: "new" })).toEqual(["newcomer_link", "phishing"]);
  });

  it("a stale message still keeps only its certain, deleting hits", () => {
    expect(cats("i want to die, see tonkfun-app.xyz", { ageSeconds: 600 })).toEqual(["lookalike"]);
    expect(cats("i want to die, see pumpsignals.site", { ageSeconds: 600 })).toEqual([]);
  });
});

describe("strong self-harm phrases are first person; everyday hyperbole and threats are weak (words#4)", () => {
  it.each([
    ["Vietnamese", "tôi muốn chết", "strong"],
    ["Vietnamese", "mình muốn chết quá", "strong"],
    ["Vietnamese", "em muốn tự tử", "strong"],
    ["Vietnamese", "tôi không muốn sống nữa", "strong"],
    ["Vietnamese", "mệt muốn chết", "weak"],
    ["Vietnamese", "sợ muốn chết", "weak"],
    ["Vietnamese", "mày muốn chết à?", "weak"],
    ["Vietnamese", "@TonkfunBot sợ muốn chết, phí launch bao nhiêu?", "weak"],
    ["Indonesian", "aku mau mati", "strong"],
    ["Indonesian", "saya ingin bunuh diri", "strong"],
    ["Indonesian", "gue gak mau hidup lagi", "strong"],
    ["Indonesian", "capek banget mau mati", "weak"],
    ["Indonesian", "lo mau mati ya", "weak"],
    ["English", "i want to die", "strong"],
    ["English", "I'm going to kill myself", "strong"],
    ["English", "i'm better off dead", "strong"],
    ["English", "you'd be better off dead", "weak"],
    ["English", "did he commit suicide?", "weak"],
    ["English", "do you want to die?", null],
    ["English", "i'm dead tired", null],
    ["German", "ich will sterben", "strong"],
    ["German", "willst du mich umbringen?", "weak"],
    ["Russian", "я хочу умереть", "strong"],
    ["Russian", "покончу с собой", "strong"],
    ["Russian", "он хотел покончить с собой", "weak"],
    ["Chinese", "我想死", "strong"],
    ["Chinese", "我想死你了", "weak"],
    ["Chinese", "你不想活了吗", "weak"],
    ["Chinese", "我不想活了", "strong"],
    ["Korean", "죽고 싶어", "strong"],
    ["Korean", "죽고 싶냐?", "weak"],
  ] as const)("%s: %s", (_, text, crisis) => {
    expect(check(text).markers.crisis).toBe(crisis);
  });
});
