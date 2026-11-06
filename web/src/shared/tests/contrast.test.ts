import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

/** The hex tokens declared in the first block whose selector starts with `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector}`);
  const open = css.indexOf("{", start);
  const body = css.slice(open + 1, css.indexOf("}", open));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
}

type Rgb = [number, number, number];

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color` at `alpha` over `base`, like bg-pos/12 on a white card. */
const tint = (color: Rgb, alpha: number, base: Rgb): Rgb => color.map((c, i) => c * alpha + base[i] * (1 - alpha)) as Rgb;

const dark = tokens(":root,");
const light = { ...dark, ...tokens(':root[data-theme="light"] {') };

describe.each([
  ["dark", dark],
  ["light", light],
])("%s theme text contrast", (_name, t) => {
  it.each(["text", "text-2", "text-3"])("--%s keeps 4.5:1 on every surface", (fg) => {
    for (const bg of ["bg", "bg-deep", "surface", "raised"]) {
      expect(contrast(rgb(t[fg]), rgb(t[bg])), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("light theme colours", () => {
  const surface = rgb(light.surface);

  it.each(["accent-text", "pos", "neg", "warn", "gold", "agent", "cyan"])("--%s keeps 4.5:1 on the page and cards", (fg) => {
    for (const bg of ["bg", "surface", "raised"]) {
      expect(contrast(rgb(light[fg]), rgb(light[bg])), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["locked", "locked", 0.14],
    ["agent", "agent", 0.14],
    ["gold", "gold", 0.14],
    ["accent-text", "accent", 0.14],
    ["gold", "accent", 0.16],
    ["pos", "pos", 0.12],
    ["warn", "warn", 0.13],
    ["neg", "neg", 0.12],
  ] as const)("badge and pill text --%s on --%s at %s keeps 4.5:1", (fg, fill, alpha) => {
    expect(contrast(rgb(light[fg]), tint(rgb(light[fill]), alpha, surface))).toBeGreaterThanOrEqual(4.5);
  });

  it("button labels keep 4.5:1", () => {
    expect(contrast(rgb(light["on-cta"]), rgb(light.cta))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(light["on-pos"]), rgb(light.pos))).toBeGreaterThanOrEqual(4.5);
  });
});
