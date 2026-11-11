import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  fmt,
  htmlLang,
  isLocale,
  localeCookie,
  LOCALES,
  localizePath,
  plural,
  splitLocale,
  switchLocaleUrl,
} from "@/shared/i18n/config";
import { DICTIONARIES } from "@/shared/i18n/dictionaries";
import { en } from "@/shared/i18n/dictionaries/en";

/** Every leaf as [path, value], e.g. ["nav.explore", "Explore"]. */
function leaves(node: object, prefix = ""): Array<[string, string]> {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("dictionaries", () => {
  const english = new Map(leaves(en));

  it("covers every supported language", () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual(LOCALES.map((l) => l.code).sort());
  });

  it.each(LOCALES.map((l) => l.code))("%s has exactly the English keys", (code) => {
    expect(leaves(DICTIONARIES[code]).map(([path]) => path).sort()).toEqual([...english.keys()].sort());
  });

  it.each(LOCALES.map((l) => l.code))("%s keeps every {placeholder} and leaves nothing empty", (code) => {
    for (const [path, value] of leaves(DICTIONARIES[code])) {
      expect(value.trim(), `${code} ${path}`).not.toBe("");
      expect(placeholders(value), `${code} ${path}`).toEqual(placeholders(english.get(path) ?? ""));
    }
  });

  it("translates the screen, not just the English fallback", () => {
    for (const { code } of LOCALES) {
      if (code === DEFAULT_LOCALE) continue;
      expect(DICTIONARIES[code].hero.subtitle, code).not.toBe(en.hero.subtitle);
      expect(DICTIONARIES[code].nav.explore, code).not.toBe(en.nav.explore);
    }
  });
});

describe("locale paths", () => {
  it("keeps English unprefixed and prefixes the rest", () => {
    expect(localizePath("en", "/live")).toBe("/live");
    expect(localizePath("es", "/")).toBe("/es");
    expect(localizePath("ja", "/token/GHOST")).toBe("/ja/token/GHOST");
  });

  it.each([
    ["/", "en", "/"],
    ["/live", "en", "/live"],
    ["/en/live", "en", "/live"],
    ["/de", "de", "/"],
    ["/de/token/GHOST", "de", "/token/GHOST"],
    ["/design", "en", "/design"],
  ])("splits %s into %s + %s", (pathname, locale, path) => {
    expect(splitLocale(pathname)).toEqual({ locale, path });
  });

  it("swaps the language and keeps the query and hash", () => {
    const location = { pathname: "/es/live", search: "?tab=new&q=moon", hash: "#top" };
    expect(switchLocaleUrl("fr", location)).toBe("/fr/live?tab=new&q=moon#top");
    expect(switchLocaleUrl("en", location)).toBe("/live?tab=new&q=moon#top");
    expect(switchLocaleUrl("ko", { pathname: "/", search: "", hash: "" })).toBe("/ko");
  });

  it("recognises only supported languages", () => {
    expect(isLocale("pt")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(htmlLang("zh")).toBe("zh-CN");
    expect(localeCookie("vi")).toBe("tonkpad-lang=vi; path=/; max-age=31536000; samesite=lax");
  });
});

describe("fmt", () => {
  it("fills placeholders and leaves unknown ones alone", () => {
    expect(fmt("Buy {name}", { name: "Ghosty" })).toBe("Buy Ghosty");
    expect(fmt("{shown} of {total}", { shown: 10, total: "8,412" })).toBe("10 of 8,412");
    expect(fmt("Hi {who}", {})).toBe("Hi {who}");
  });
});

describe("plural", () => {
  it("takes each language's form for the count: 1 sell, 2 sells, and Russian's three (campaign round 1)", () => {
    expect([1, 2].map((n) => plural("en", en.token.activity.sells, n))).toEqual(["1 sell", "2 sells"]);
    expect([1, 3, 5, 21].map((n) => plural("ru", DICTIONARIES.ru.token.activity.sells, n))).toEqual(["1 продажа", "3 продажи", "5 продаж", "21 продажа"]);
    expect([1, 2].map((n) => plural("de", DICTIONARIES.de.token.activity.buys, n))).toEqual(["1 Kauf", "2 Käufe"]);
    expect(plural("en", en.token.stats.txns, 1284, "1,284")).toBe("1,284 txns");
    expect(plural("ja", DICTIONARIES.ja.token.activity.buys, 1)).toBe("買い 1");
  });
});
