// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Nothing reaches Anthropic but the bot's own client
 * (prompts/15-community-agent.md, Tests): only claude/client.ts, its test
 * and the owner's offline eval runner may load @anthropic-ai/sdk at run time.
 * Every other source, test and eval file may import its types only
 * (`import type`), and every model call goes through the ClaudeClient
 * interface, which tests fake.
 */

const WORKER = fileURLToPath(new URL("..", import.meta.url));
const ALLOWED = new Set(["src/telegram/claude/client.ts", "tests/claude-client.test.ts", "evals/agent/run.ts"]);
const SDK = String.raw`["']@anthropic-ai\/sdk(?:\/[^"']*)?["']`;

/** Statements and calls that load the SDK at run time; `import type` and `export type` load nothing. */
const VALUE_LOADS: readonly RegExp[] = [
  // import X from, import { A } from, import * as X from (and `import { type A }`, which can still load the module).
  new RegExp(String.raw`(?:^|[\n;])\s*import\s+(?!type[\s{*])[^;]*?\bfrom\s*${SDK}`, "g"),
  // A bare `import "…"`, for its side effects.
  new RegExp(String.raw`(?:^|[\n;])\s*import\s*${SDK}`, "g"),
  // Re-exports: export { A } from, export * from.
  new RegExp(String.raw`(?:^|[\n;])\s*export\s+(?!type[\s{*])[^;]*?\bfrom\s*${SDK}`, "g"),
  // import("…") outside a type position, and require("…").
  new RegExp(String.raw`(?<!typeof\s*)\bimport\s*\(\s*${SDK}`, "g"),
  new RegExp(String.raw`\brequire\s*\(\s*${SDK}`, "g"),
];

/** Every TypeScript file under a folder of the worker, as a path relative to the worker with forward slashes. */
function filesIn(folder: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) out.push(relative(WORKER, path).split(sep).join("/"));
    }
  };
  walk(join(WORKER, folder));
  return out;
}

const loadsSdk = (text: string) => VALUE_LOADS.some((pattern) => new RegExp(pattern.source, pattern.flags).test(text));

describe("only the bot's own client reaches Anthropic", () => {
  const files = ["src", "tests", "evals"].flatMap(filesIn);

  it("finds the worker's sources, tests and evals", () => {
    expect(files).toContain("src/telegram/claude/client.ts");
    expect(files).toContain("tests/claude-client.test.ts");
    expect(files.some((f) => f.startsWith("evals/"))).toBe(true);
  });

  it("tells a value import from a type import", () => {
    // The module's name is put together here, so this file's own examples don't count as imports.
    const sdk = ["@anthropic-ai", "sdk"].join("/");
    expect(loadsSdk(`import Anthropic, { APIError } from "${sdk}";`)).toBe(true);
    expect(loadsSdk(`import {\n  APIError,\n} from '${sdk}';`)).toBe(true);
    expect(loadsSdk(`import { type Message } from "${sdk}";`)).toBe(true);
    expect(loadsSdk(`import "${sdk}";`)).toBe(true);
    expect(loadsSdk(`export * from "${sdk}/resources";`)).toBe(true);
    expect(loadsSdk(`const loaded = await import("${sdk}");`)).toBe(true);
    expect(loadsSdk(`const loaded = require("${sdk}");`)).toBe(true);
    expect(loadsSdk(`import type Anthropic from "${sdk}";`)).toBe(false);
    expect(loadsSdk(`import type { Message } from "${sdk}/resources";`)).toBe(false);
    expect(loadsSdk(`export type { Message } from "${sdk}";`)).toBe(false);
    expect(loadsSdk(`type Loaded = typeof import("${sdk}");`)).toBe(false);
    expect(loadsSdk(`import { describe } from "vitest";\nimport type Anthropic from "${sdk}";`)).toBe(false);
  });

  it("lets only claude/client.ts, its test and the eval runner load the SDK", () => {
    const loading = files.filter((file) => loadsSdk(readFileSync(join(WORKER, file), "utf8")));
    expect(loading.filter((file) => !ALLOWED.has(file))).toEqual([]);
    expect(loading).toContain("src/telegram/claude/client.ts");
  });

  it("runs the client's own test in Node, where the SDK is supported", () => {
    const head = readFileSync(join(WORKER, "tests/claude-client.test.ts"), "utf8").split("\n")[0];
    expect(head.trim()).toBe("// @vitest-environment node");
  });
});
