// Tests for tools/quality/clone-scan.mjs (D4 mechanical clone-group pre-scan,
// quality-loop-d4-d8-design.md §1.5). Mirrors tests/quality-size-scan.test.ts's
// harness shape: a scratch fixture tree under QUALITY_STORE_ROOT (env DI —
// clone-scan.mjs's ROOT constant is computed the same way size-scan.mjs's
// is), the CLI spawned as a child process for `map` / `groups`, plus a
// direct `import()` of the module (file:// URL, Windows-safe) for
// cloneGroups/MIN_TOKENS where the group/occurrence data is the simplest
// observable.
//
// Every fixture below is built so the expected clone-group boundaries are
// exact and predictable: shared blocks use `const cN = N;`-style statements
// (5 tokens each: keyword, identifier, "=", literal, ";"), and non-shared
// separators use structurally distinct tokens (a different keyword or a
// different token count) so extension cannot bleed past the intended span.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCAN = fileURLToPath(new URL("../tools/quality/clone-scan.mjs", import.meta.url));
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

/** n statements of `const <prefix><i> = <i>;` (5 tokens each), one per line. */
function constBlock(n: number, prefix = "c", startAt = 0): string {
  return Array.from({ length: n }, (_, i) => `const ${prefix}${startAt + i} = ${startAt + i};`).join("\n");
}

describe("tools/quality/clone-scan.mjs (scratch fixture tree via QUALITY_STORE_ROOT)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "qclone-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("MIN_TOKENS is exported and equals 60 (design §1.5)", async () => {
    const mod = await import(SCAN_URL);
    expect(mod.MIN_TOKENS).toBe(60);
  });

  it("exact copy across two files (default MIN_TOKENS=60): one group, two occurrences, verdict identical", async () => {
    const mod = await import(SCAN_URL);
    const body = constBlock(12) + "\n"; // 12 * 5 = 60 tokens exactly
    writeFile(root, "src/a.ts", body);
    writeFile(root, "src/b.ts", body);
    const { groups } = mod.cloneGroups(root, {});
    expect(groups.length).toBe(1);
    const g = groups[0];
    expect(g.id).toBe("G001");
    expect(g.tokenCount).toBe(60);
    expect(g.verdict).toBe("identical");
    expect(g.occurrences).toEqual([
      { path: "src/a.ts", line: 1, endLine: 12 },
      { path: "src/b.ts", line: 1, endLine: 12 },
    ]);
  });

  it("renamed copy: verdict 'renamed-only (k)' with k asserted (one differing identifier per statement)", async () => {
    const mod = await import(SCAN_URL);
    writeFile(root, "src/a.ts", constBlock(12, "c") + "\n");
    writeFile(root, "src/b.ts", constBlock(12, "x") + "\n"); // same shape, renamed identifiers
    const { groups } = mod.cloneGroups(root, {});
    expect(groups.length).toBe(1);
    // One declaration-name identifier differs per statement: 12 differing positions.
    expect(groups[0].verdict).toBe("renamed-only (12)");
    expect(groups[0].tokenCount).toBe(60);
  });

  it("a block below MIN_TOKENS produces no group", async () => {
    const mod = await import(SCAN_URL);
    const body = constBlock(6) + "\n"; // 30 tokens < default 60
    writeFile(root, "src/a.ts", body);
    writeFile(root, "src/b.ts", body);
    const { groups } = mod.cloneGroups(root, {});
    expect(groups).toEqual([]);
  });

  // Both fixtures below use hand-written, mutually distinct statement shapes
  // (not the mechanical constBlock() repeats) deliberately: identifiers and
  // literals normalise away ($id / $lit), so repeating one shape (e.g.
  // `const cN = N;`) over and over is itself internally periodic and clones
  // against ANY other block of the same shape — which is correct scanner
  // behaviour, but makes a *targeted* two-group/three-group fixture unusable.
  // Structurally distinct statements (different keywords/punctuation) avoid
  // that self-similarity so the intended clone boundaries are exact.
  const DIVERSE_BEFORE = [
    "const a = 1;",
    "if (a) { b(); }",
    "while (a) { c(); }",
    "for (let i = 0; i < a; i++) { d(); }",
    "switch (a) { case 1: e(); break; }",
    "try { f(); } catch (err) { g(err); }",
  ];
  const DIVERSE_AFTER = [
    "function h() { return a + 1; }",
    "const arr = [1, 2, 3];",
    "const obj = { x: 1, y: 2 };",
    "export default a;",
    "import { z } from \"./z\";",
    "type T = string | number;",
  ];

  it("one changed statement mid-block in a long clone: two groups + one drift hint naming both spans (quoting the gap lines raw)", async () => {
    const mod = await import(SCAN_URL);
    // The divergent block differs from its very first token (const vs let,
    // if vs while, ...) on every line but both files end their divergent
    // block in a bare ";" — the one token every JS/TS statement shares, so a
    // single trailing ";" mechanically (and correctly) counts as agreeing;
    // the fixture uses a 3-line divergent block so the reported gap still
    // shows the two REAL differing lines even after that single-token edge.
    const divA = ["const flag2 = compute();", "if (flag2) { run(); }", 'throw new RangeError("x");'];
    const divB = ["let other = fetchAll();", "while (other) { proceed(); }", "return null;"];
    const a = [...DIVERSE_BEFORE, ...divA, ...DIVERSE_AFTER, ""].join("\n");
    const b = [...DIVERSE_BEFORE, ...divB, ...DIVERSE_AFTER, ""].join("\n");
    writeFile(root, "src/a.ts", a);
    writeFile(root, "src/b.ts", b);
    const { groups, driftHints } = mod.cloneGroups(root, { minTokens: 15 });

    expect(groups.length).toBe(2);
    const beforeGroup = groups.find((g: any) => g.occurrences[0].line === 1);
    const afterGroup = groups.find((g: any) => g.occurrences[0].line === 9);
    expect(beforeGroup).toBeDefined();
    expect(afterGroup).toBeDefined();
    expect(beforeGroup.verdict).toBe("identical");
    expect(afterGroup.verdict).toBe("identical");
    expect(beforeGroup.occurrences).toEqual([
      { path: "src/a.ts", line: 1, endLine: 6 },
      { path: "src/b.ts", line: 1, endLine: 6 },
    ]);
    expect(afterGroup.occurrences).toEqual([
      { path: "src/a.ts", line: 9, endLine: 15 },
      { path: "src/b.ts", line: 9, endLine: 15 },
    ]);

    expect(driftHints.length).toBe(1);
    const hint = driftHints[0];
    expect(hint).toContain(`${beforeGroup.id} + ${afterGroup.id}`);
    expect(hint).toContain("src/a.ts:7-8");
    expect(hint).toContain("src/b.ts:7-8");
    expect(hint).toContain(JSON.stringify(["const flag2 = compute();", "if (flag2) { run(); }"]));
    expect(hint).toContain(JSON.stringify(["let other = fetchAll();", "while (other) { proceed(); }"]));
  });

  it("a three-way share inside a longer two-way run: two groups with the expected occurrence sets and no third", async () => {
    const mod = await import(SCAN_URL);
    const stmts = [...DIVERSE_BEFORE, ...DIVERSE_AFTER];
    writeFile(root, "src/a.ts", stmts.join("\n") + "\n");
    writeFile(root, "src/b.ts", stmts.join("\n") + "\n");
    // A third file copies a contiguous sub-range spanning the second half of
    // DIVERSE_BEFORE and the first half of DIVERSE_AFTER (lines 5-8 of a/b).
    writeFile(root, "src/c.ts", stmts.slice(4, 8).join("\n") + "\n");

    const { groups } = mod.cloneGroups(root, { minTokens: 15 });
    expect(groups.length).toBe(2);

    const fullGroup = groups.find((g: any) => g.occurrences.length === 2);
    const innerGroup = groups.find((g: any) => g.occurrences.length === 3);
    expect(fullGroup).toBeDefined();
    expect(innerGroup).toBeDefined();

    expect(fullGroup.occurrences).toEqual([
      { path: "src/a.ts", line: 1, endLine: 12 },
      { path: "src/b.ts", line: 1, endLine: 12 },
    ]);
    expect(innerGroup.occurrences).toEqual([
      { path: "src/a.ts", line: 5, endLine: 8 },
      { path: "src/b.ts", line: 5, endLine: 8 },
      { path: "src/c.ts", line: 1, endLine: 4 },
    ]);
    // The inner (3-way) group is strictly shorter than the outer (2-way) one,
    // and no third group sneaks in with some other occurrence-set mix.
    expect(innerGroup.tokenCount).toBeLessThan(fullGroup.tokenCount);
  });

  it("periodic code: overlapping windows within one file collapse to the earlier occurrence; a second non-overlapping copy elsewhere keeps the group (collapsed count asserted)", async () => {
    const mod = await import(SCAN_URL);
    // Three repeats of a 5-token unit inside one file: a 10-token window at
    // position 0 and at position 5 are literally the same two-unit content
    // (periodic), so they seed one anchor set and OVERLAP (0-9 vs 5-14).
    writeFile(root, "src/periodic.ts", "const p = 1;\nconst p = 1;\nconst p = 1;\n");
    // A second, non-overlapping copy of the same two-unit (10-token) content,
    // entirely on its own — this is what keeps the group at >=2 occurrences.
    writeFile(root, "src/twin.ts", "const p = 1;\nconst p = 1;\n");

    const { groups } = mod.cloneGroups(root, { minTokens: 10 });
    expect(groups.length).toBe(1);
    const g = groups[0];
    expect(g.tokenCount).toBe(10);
    // Collapsed: only the EARLIER of periodic.ts's two overlapping candidate
    // positions (line 1) survives, plus twin.ts's separate occurrence.
    expect(g.occurrences).toEqual([
      { path: "src/periodic.ts", line: 1, endLine: 2 },
      { path: "src/twin.ts", line: 1, endLine: 2 },
    ]);
  });

  it("two non-overlapping copies within ONE file: one group, two occurrences", async () => {
    const mod = await import(SCAN_URL);
    const block = constBlock(4); // 20 tokens
    const text = [block, "doOther();", block, ""].join("\n");
    writeFile(root, "src/z.ts", text);

    const { groups } = mod.cloneGroups(root, { minTokens: 20 });
    expect(groups.length).toBe(1);
    expect(groups[0].tokenCount).toBe(20);
    expect(groups[0].occurrences).toEqual([
      { path: "src/z.ts", line: 1, endLine: 4 },
      { path: "src/z.ts", line: 6, endLine: 9 },
    ]);
  });

  it("tests/** is never scanned: a clone with its only sibling under tests/ produces no group", async () => {
    const mod = await import(SCAN_URL);
    const body = constBlock(12) + "\n";
    writeFile(root, "src/lonely.ts", body);
    writeFile(root, "tests/twin.test.ts", body); // would clone with src/lonely.ts if scanned
    const { groups } = mod.cloneGroups(root, {});
    expect(groups).toEqual([]);
  });

  it("map --files lists partners outside the shard and prints '(no clone groups)' for an untouched file", () => {
    const body = constBlock(12) + "\n";
    writeFile(root, "src/a.ts", body);
    writeFile(root, "src/b.ts", body);
    writeFile(root, "src/lonely.ts", "export const nothing = 1;\n");
    const manifest = writeManifest(root, "manifest.txt", ["src/a.ts", "src/lonely.ts"]);

    const r = runScan(root, ["map", "--files", manifest]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## src/a.ts");
    // b.ts is outside the shard manifest but is still named as a's clone partner.
    expect(r.stdout).toMatch(/G001.*src\/a\.ts:1-12, src\/b\.ts:1-12/);
    expect(r.stdout).toContain("## src/lonely.ts");
    const lonelySection = r.stdout.slice(r.stdout.indexOf("## src/lonely.ts"));
    expect(lonelySection).toContain("(no clone groups)");
  });

  it("CLI 'groups' output is byte-identical across two runs", () => {
    const body = constBlock(12) + "\n";
    writeFile(root, "src/a.ts", body);
    writeFile(root, "src/b.ts", body);
    const r1 = runScan(root, ["groups"]);
    const r2 = runScan(root, ["groups"]);
    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(r1.stdout).toBe(r2.stdout);
    expect(r1.stdout).toContain("G001");
  });

  it("a CRLF fixture produces the same group (tokenCount, verdict, line span) as its LF twin", () => {
    // The CRLF pair must form a group DISTINCT from the LF pair (different
    // statement shape), or both pairs collapse into one group and the line
    // comparison below compares a line with itself. Prefixing a leading
    // statement changes the CRLF copies' shape too, so a CRLF line
    // miscount would surface as a span mismatch after normalisation.
    const lfBody = constBlock(12) + "\n";
    const crlfBody = ("export let crlfMarker = 0;\n" + Array.from({ length: 12 }, (_, i) => `if (crlfMarker > ${i}) { crlfMarker += ${i}; }`).join("\n") + "\n").replaceAll("\n", "\r\n");
    writeFile(root, "src/lf_a.ts", lfBody);
    writeFile(root, "src/lf_b.ts", lfBody);
    writeFile(root, "src/crlf_a.ts", crlfBody);
    writeFile(root, "src/crlf_b.ts", crlfBody);
    // LF twin of the CRLF pair, so the spans can be compared like for like.
    writeFile(root, "src/lfTwin_a.ts", crlfBody.replaceAll("\r\n", "\n"));
    writeFile(root, "src/lfTwin_b.ts", crlfBody.replaceAll("\r\n", "\n"));

    const r = runScan(root, ["groups"]);
    expect(r.status).toBe(0);
    const lines = r.stdout.split("\n");
    const crlfLine = lines.find((l) => l.includes("src/crlf_a.ts"));
    const twinLine = lines.find((l) => l.includes("src/lfTwin_a.ts"));
    const lfLine = lines.find((l) => l.includes("src/lf_a.ts"));
    expect(crlfLine).toBeDefined();
    expect(twinLine).toBeDefined();
    expect(lfLine).toBeDefined();
    // Two distinct groups: the CRLF pair is not the LF constBlock pair.
    expect(crlfLine).not.toBe(lfLine);
    // Same shape (tokens, verdict, line span) as its LF twin once the id and file names are stripped.
    const strip = (l: string) => l.replace(/^- G\d+ /, "- G? ").replace(/src\/(crlf|lfTwin)_(a|b)\.ts/g, "src/X.ts");
    expect(strip(crlfLine!)).toBe(strip(twinLine!));
    // 13 physical lines on both sides: CRLF terminators count like LF ones.
    expect(crlfLine!).toMatch(/src\/crlf_a\.ts:1-13\b/);
  });
});
