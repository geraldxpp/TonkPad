// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ANSWER_FIELDS, ANSWER_SCHEMA, parseAnswer } from "../src/telegram/agent/schema";
import { LINK_KEYS } from "../src/telegram/agent/types";
import { ESCALATIONS } from "../src/telegram/community/types";
import { answerJson, SOL_MINT, WHOA } from "./agent-answer-fixtures";

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema; enum?: string[] };

/** Every object in a schema, nested ones included. */
function objects(schema: Schema): Schema[] {
  const inner = [...Object.values(schema.properties ?? {}), ...(schema.items ? [schema.items] : [])].flatMap(objects);
  return schema.type === "object" ? [schema, ...inner] : inner;
}

const parsed = (value: unknown, lang: "en" | "es" = "en") => parseAnswer(JSON.stringify(value), lang);

describe("ANSWER_SCHEMA", () => {
  it("closes every object and requires every field, in the fields' order", () => {
    const schema = ANSWER_SCHEMA as Schema;
    for (const object of objects(schema)) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties ?? {}));
    }
    expect(Object.keys(schema.properties ?? {})).toEqual([...ANSWER_FIELDS]);
    expect(Object.isFrozen(ANSWER_SCHEMA)).toBe(true);
  });

  it("offers only the site's languages, the known link keys and the escalations", () => {
    const p = (ANSWER_SCHEMA as Schema).properties ?? {};
    expect(p.language.enum).toEqual(["en", "es", "pt", "fr", "de", "ru", "tr", "zh", "ja", "ko", "vi", "id"]);
    expect(p.links.items?.enum).toEqual([...LINK_KEYS]);
    expect(p.escalate.enum).toEqual(["none", ...ESCALATIONS]);
    expect(JSON.stringify(ANSWER_SCHEMA)).not.toMatch(/maxLength|maxItems|minimum|maximum/);
  });
});

describe("parseAnswer", () => {
  it("reads an answer exactly as the schema gives it", () => {
    expect(parsed(answerJson())).toEqual(answerJson());
    const escalated = answerJson({ escalate: "lost_funds", admin_note: "Says a buy in the launch block lost most of its ETH", answered: false });
    expect(parsed(escalated)).toEqual(escalated);
  });

  it("falls back to the asker's language for one the site doesn't have", () => {
    expect(parsed(answerJson({ language: "it" as "en" }), "es")?.language).toBe("es");
    expect(parsed({ ...answerJson(), language: null }, "es")?.language).toBe("es");
  });

  it("keeps at most 3 known link keys, each once, in order", () => {
    const links = ["https://evil.xyz", "docs_fees", "docs_fees", "launches", 7, "referral", "docs"];
    expect(parsed({ ...answerJson(), links })?.links).toEqual(["docs_fees", "launches", "referral"]);
  });

  it("keeps a token only when it is one address (EVM lower-cased), else blanks it", () => {
    expect(parsed(answerJson({ token: WHOA.toUpperCase().replace("0X", "0x") }))?.token).toBe(WHOA);
    expect(parsed(answerJson({ token: ` ${SOL_MINT} ` }))?.token).toBe(SOL_MINT);
    for (const token of ["WHOA", `${WHOA} and more`, "https://evil.xyz", "0x123"]) expect(parsed(answerJson({ token }))?.token).toBe("");
  });

  it("cuts the reply to 1,200 characters and the admin note to one line of 200", () => {
    const out = parsed(answerJson({ reply: `  ${"a".repeat(1_500)}  `, admin_note: `line one\nline two ${"b".repeat(300)}` }));
    expect(out?.reply).toHaveLength(1_200);
    expect(out?.admin_note).toHaveLength(200);
    expect(out?.admin_note.startsWith("line one line two")).toBe(true);
  });

  it("refuses anything off the schema: bad JSON, a missing or extra field, a wrong type, an unknown escalation", () => {
    const { escalate: _escalate, ...missing } = answerJson();
    const bad = [
      "not json",
      JSON.stringify(answerJson()).slice(0, 40),
      "[]",
      "null",
      JSON.stringify(missing),
      JSON.stringify({ ...answerJson(), extra: 1 }),
      JSON.stringify({ ...answerJson(), answered: "yes" }),
      JSON.stringify({ ...answerJson(), reply: 5 }),
      JSON.stringify({ ...answerJson(), links: "docs" }),
      JSON.stringify({ ...answerJson(), escalate: "everything" }),
      JSON.stringify({ ...answerJson(), admin_note: null }),
    ];
    expect(_escalate).toBe("none");
    for (const text of bad) expect(parseAnswer(text, "en"), text).toBeNull();
  });
});
