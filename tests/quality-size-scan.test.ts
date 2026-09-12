// Tests for tools/quality/size-scan.mjs (D9 mechanical pre-scan). Mirrors
// tests/quality-store.test.ts's harness shape: a scratch fixture tree under
// QUALITY_STORE_ROOT (env DI — size-scan.mjs's ROOT constant is computed the
// same way store.mjs's is), the CLI spawned as a child process for `map` /
// `loc`, plus a direct `import()` of the module (file:// URL, Windows-safe)
// for hostLoc/bandForFile/bandForFn where a bare integer/throw is the
// simplest observable.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCAN = fileURLToPath(new URL("../tools/quality/size-scan.mjs", import.meta.url));
const SCAN_URL = pathToFileURL(SCAN).href;

function runScan(root: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCAN, ...args], {
    encoding: "utf8",
    env: { ...process.env, QUALITY_STORE_ROOT: root },
  });
}

function writeFile(root: string, relPath: string, content: string): void {
  const abs = join(root, ...relPath.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function writeManifest(root: string, relPath: string, files: string[]): string {
  writeFile(root, relPath, files.join("\n") + "\n");
  return relPath;
}

/** Exactly n lines, trailing newline (countLines(file) == n, wc -l semantics). */
function makeFileOfLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `// line ${i + 1}`).join("\n") + "\n";
}

function bodyStatements(n: number, tag: string): string {
  return Array.from({ length: n }, (_, i) => `    const ${tag}${i} = ${i};`).join("\n");
}

/**
 * A file totalLines long containing exactly one arrow function `target` of
 * fnLines LOC (header line + (fnLines-2) body statements + closer line),
 * padded with comment lines before it to totalLines (700 by default, so the
 * file sits in the zone band and the section carries a file line too).
 */
function buildFileWithFunction(fnLines: number, totalLines = 700): string {
  const bodyCount = fnLines - 2;
  const fnText = ["export const target = () => {", bodyStatements(bodyCount, "v"), "};"].join("\n");
  const fnLineCount = fnText.split("\n").length;
  const padBefore = totalLines - fnLineCount;
  const padLines = Array.from({ length: padBefore }, (_, i) => `// pad ${i}`).join("\n");
  return padLines + "\n" + fnText + "\n";
}

describe("tools/quality/size-scan.mjs (scratch fixture tree via QUALITY_STORE_ROOT)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "qscan-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------- bands

  it.each([
    [599, "exempt"],
    [600, "zone"],
    [999, "zone"],
    [1000, "justify"],
    [1999, "justify"],
    [2000, "strong"],
  ])("file band boundary: %i lines -> band %s", (n, expected) => {
    writeFile(root, "src/f.ts", makeFileOfLines(n));
    const manifest = writeManifest(root, "manifest.txt", ["src/f.ts"]);
    const r = runScan(root, ["map", "--files", manifest]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`src/f.ts \u2014 ${n} LOC \u2014 band ${expected} \u2014`);
  });

  it.each([
    [59, null],
    [60, "zone"],
    [99, "zone"],
    [100, "justify"],
    [199, "justify"],
    [200, "strong"],
  ])("function band boundary: %i LOC -> band %s", (n, expected) => {
    writeFile(root, "src/g.ts", buildFileWithFunction(n));
    const manifest = writeManifest(root, "manifest.txt", ["src/g.ts"]);
    const r = runScan(root, ["map", "--files", manifest]);
    expect(r.status).toBe(0);
    if (expected === null) {
      expect(r.stdout).not.toContain("#target \u2014");
    } else {
      expect(r.stdout).toMatch(new RegExp(`src/g\\.ts#target \u2014 \\d+-\\d+ \u2014 ${n} LOC \u2014 band ${expected}`));
    }
  });

  // ---------------------------------------------------------------- exempt files

  it("function bands are independent of the file band: an exempt-band file still lists its over-threshold function", () => {
    // 300-line file (exempt) carrying one 120-LOC arrow function (justify).
    writeFile(root, "src/g.ts", buildFileWithFunction(120, 300));
    const manifest = writeManifest(root, "manifest.txt", ["src/g.ts"]);
    const r = runScan(root, ["map", "--files", manifest]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("breakdown: exempt \u2014 placement review only");
    expect(r.stdout).toMatch(/src\/g\.ts#target \u2014 \d+-\d+ \u2014 120 LOC \u2014 band justify/);
  });

  it("an exempt-band file with no long function says 'placement review only' and lists nothing else", () => {
    writeFile(root, "src/small.ts", makeFileOfLines(40) + "export function tiny() { return 1; }\n");
    const manifest = writeManifest(root, "manifest.txt", ["src/small.ts"]);
    const r = runScan(root, ["map", "--files", manifest]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("breakdown: exempt \u2014 placement review only");
    const section = r.stdout.slice(r.stdout.indexOf("over threshold:"));
    // Nothing follows the sentence for this (only) file's section but the
    // trailing newline the map appends.
    expect(section.trim()).toBe("over threshold:\nbreakdown: exempt \u2014 placement review only");
  });

  // ---------------------------------------------------------------- exemption annotations

  it("exemption annotation includes the growth percentage (D9: prefixed key)", () => {
    writeFile(root, "src/big.ts", makeFileOfLines(700));
    const manifest = writeManifest(root, "manifest.txt", ["src/big.ts"]);
    writeFile(
      root,
      "quality/exemptions.json",
      JSON.stringify({
        "D9:src/big.ts": { loc: 500, reason: "spec-cited invariant, see BNDR-3", date: "2026-01-01", finding: "quality/issues/PTQ-0001-x.md", class: "breakdown" },
      }) + "\n",
    );
    const r = runScan(root, ["map", "--files", manifest, "--exemptions", "quality/exemptions.json"]);
    expect(r.status).toBe(0);
    // growth = (700-500)/500*100 = 40%
    expect(r.stdout).toContain(
      "EXEMPT (human-ruled 2026-01-01: spec-cited invariant, see BNDR-3; LOC then 500, now 700, growth 40%)",
    );
  });

  it("a D8: entry on the same host is NOT annotated — map --exemptions reads D9: entries only", () => {
    writeFile(root, "src/big.ts", makeFileOfLines(700));
    const manifest = writeManifest(root, "manifest.txt", ["src/big.ts"]);
    writeFile(
      root,
      "quality/exemptions.json",
      JSON.stringify({
        "D8:src/big.ts": { loc: 500, reason: "overbuilt, ratified simpler shape declined", date: "2026-01-01", finding: "quality/issues/PTQ-0002-y.md", class: "overbuilt" },
      }) + "\n",
    );
    const r = runScan(root, ["map", "--files", manifest, "--exemptions", "quality/exemptions.json"]);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain("EXEMPT");
    expect(r.stdout).toContain("breakdown: zone — no presumption");
  });

  // ---------------------------------------------------------------- importers

  it("importer counts: named, type-only, namespace and export…from imports all credit the target", () => {
    writeFile(
      root,
      "src/lib/target.ts",
      ["export function namedTarget() {", "  return 1;", "}", "export type TypeTarget = string;", ""].join("\n"),
    );
    writeFile(root, "src/consumer/named.ts", 'import { namedTarget } from "../lib/target.js";\nnamedTarget();\n');
    writeFile(
      root,
      "tests/consumer.test.ts",
      'import type { TypeTarget } from "../src/lib/target.js";\nexport const x: TypeTarget = "y";\n',
    );
    writeFile(root, "src/consumer2/ns.ts", 'import * as ns from "../lib/target.js";\nns.namedTarget();\n');
    writeFile(root, "src/consumer3/reexport.ts", 'export { namedTarget } from "../lib/target.js";\n');

    const manifest = writeManifest(root, "manifest.txt", ["src/lib/target.ts"]);
    const r = runScan(root, ["map", "--files", manifest]);
    expect(r.status).toBe(0);
    // named.ts (named), ns.ts (namespace - credits every export), reexport.ts (export…from) = 3 src, 0 tests.
    expect(r.stdout).toMatch(/\| .* \| function \| namedTarget \| yes \| 3\/0 \|/);
    // consumer.test.ts (type-only, tests) + ns.ts (namespace, src) = 1 src, 1 tests.
    expect(r.stdout).toMatch(/\| .* \| type \| TypeTarget \| yes \| 1\/1 \|/);
  });

  // ---------------------------------------------------------------- CRLF

  it("a CRLF file counts lines like an LF file", () => {
    const lf = makeFileOfLines(650);
    const crlf = lf.replaceAll("\n", "\r\n");
    writeFile(root, "src/lf.ts", lf);
    writeFile(root, "src/crlf.ts", crlf);
    const lfR = runScan(root, ["loc", "--host", "src/lf.ts"]);
    const crlfR = runScan(root, ["loc", "--host", "src/crlf.ts"]);
    expect(lfR.status).toBe(0);
    expect(crlfR.status).toBe(0);
    expect(crlfR.stdout).toBe(lfR.stdout);
    expect(lfR.stdout.trim()).toBe("650");
  });

  // ---------------------------------------------------------------- determinism

  it("map output is byte-identical across two runs", () => {
    writeFile(root, "src/lib/target.ts", "export function namedTarget() {\n  return 1;\n}\n");
    writeFile(root, "src/consumer/named.ts", 'import { namedTarget } from "../lib/target.js";\nnamedTarget();\n');
    const manifest = writeManifest(root, "manifest.txt", ["src/lib/target.ts"]);
    const r1 = runScan(root, ["map", "--files", manifest]);
    const r2 = runScan(root, ["map", "--files", manifest]);
    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(r1.stdout).toBe(r2.stdout);
  });

  // ---------------------------------------------------------------- hostLoc / function kinds (direct import)

  it("hostLoc addresses every function kind, nested functions, and leaves an overload signature unmeasured", async () => {
    const mod = await import(SCAN_URL);
    const n = 10; // body statement count -> LOC = n + 2 = 12 for the simple wrapper shape
    const src = [
      "export function topFn() {",
      "  function helper() {",
      bodyStatements(n, "h"),
      "  }",
      "  return helper();",
      "}",
      "",
      "export const topArrow = () => {",
      bodyStatements(n, "a"),
      "};",
      "",
      "class Widget {",
      "  member() {",
      bodyStatements(n, "m"),
      "  }",
      "  static stat() {",
      bodyStatements(n, "s"),
      "  }",
      "  get size() {",
      bodyStatements(n, "gg"),
      "    return 1;",
      "  }",
      "  set size(v: number) {",
      bodyStatements(n, "ss"),
      "  }",
      "  constructor() {",
      bodyStatements(n, "c"),
      "  }",
      "  calc = () => {",
      bodyStatements(n, "p"),
      "  };",
      "}",
      "",
      "const handlers = {",
      "  parse() {",
      bodyStatements(n, "hp"),
      "  },",
      "  build: () => {",
      bodyStatements(n, "hb"),
      "  },",
      "};",
      "",
      "function calcOverload(a: number): number;",
      "function calcOverload(a: string): string;",
      "function calcOverload(a: any): any {",
      bodyStatements(n, "o"),
      "  return a;",
      "}",
      "",
      "export const fnExpr = function () {",
      bodyStatements(n, "fe"),
      "};",
      "",
      "export default function () {",
      bodyStatements(n, "d"),
      "}",
      "",
    ].join("\n");
    writeFile(root, "src/kinds.ts", src);

    // Nested: measured separately AND counted inside the parent — topFn spans
    // its own two lines, the helper's n + 2, and the `return helper();` line.
    expect(mod.hostLoc(root, "src/kinds.ts#topFn.helper")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#topFn")).toBe(n + 2 + 3);
    expect(mod.hostLoc(root, "src/kinds.ts#fnExpr")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#default")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#topArrow")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#Widget.member")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#Widget.static stat")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#Widget.get size")).toBe(n + 3); // + the extra "return 1;" line
    expect(mod.hostLoc(root, "src/kinds.ts#Widget.set size")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#Widget.constructor")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#Widget.calc")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#handlers.parse")).toBe(n + 2);
    expect(mod.hostLoc(root, "src/kinds.ts#handlers.build")).toBe(n + 2);
    // The overload's two signatures have no body and are not measured: only
    // the implementation counts, and it is not ambiguous (exactly one span).
    expect(mod.hostLoc(root, "src/kinds.ts#calcOverload")).toBe(n + 3); // + the "return a;" line
  });

  it("hostLoc for a whole file returns its LOC (no #fn)", () => {
    writeFile(root, "src/plain.ts", makeFileOfLines(123));
    const r = runScan(root, ["loc", "--host", "src/plain.ts"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("123");
  });

  it("hostLoc for a top-level function", async () => {
    const mod = await import(SCAN_URL);
    writeFile(root, "src/top.ts", "export function foo() {\n  return 1;\n  return 2;\n}\n");
    expect(mod.hostLoc(root, "src/top.ts#foo")).toBe(4);
  });

  it("hostLoc throws naming candidates for an unknown host", async () => {
    const mod = await import(SCAN_URL);
    writeFile(root, "src/known.ts", "export function foo() {\n  return 1;\n}\n");
    let threw: unknown;
    try {
      mod.hostLoc(root, "src/known.ts#bar");
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(Error);
    expect((threw as Error).message).toContain("unknown host");
    expect((threw as Error).message).toContain("foo");
  });

  it("hostLoc throws the same way for an ambiguous host (duplicate object key)", async () => {
    const mod = await import(SCAN_URL);
    writeFile(
      root,
      "src/dup.ts",
      ["const dup = {", "  same() {", "    return 1;", "  },", "  same() {", "    return 2;", "  },", "};", ""].join("\n"),
    );
    let threw: unknown;
    try {
      mod.hostLoc(root, "src/dup.ts#dup.same");
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(Error);
    expect((threw as Error).message).toContain("ambiguous host");
  });
});
