import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS architectural-check module, no type declarations.
import { findModuleLevelMutableBindings } from "../tools/arch-checks/no-module-level-mutable.js";
// @ts-expect-error — JS flat-config module, no type declarations.
import eslintConfig from "../eslint.config.js";
import { tsFiles } from "./helpers/ts-files";

// H2a — cross-cutting lint and architectural gates. These assertions ARE the
// lint + architectural surface "wired into npm test": they run theta's
// bespoke ESLint rules (via the same eslint.config.js CI uses) and the
// module-level-mutable architectural scan against controlled fixtures, and
// against the real `src/**` production tree. Each block cites the
// conventions.md cross-cutting rule it operationalises.

const linter = new Linter();

// Lint a fixture string as though it lived at `filename` (relative to repo
// root), through theta's real flat config. Returns the ESLint messages.
function lint(code: string, filename: string): Linter.LintMessage[] {
  return linter.verify(code, eslintConfig as Linter.Config[], { filename });
}

function ruleIds(messages: Linter.LintMessage[]): (string | null)[] {
  return messages.map((m) => m.ruleId);
}

describe("H2a — no-broad-catch (Convention: Specific exception types only)", () => {
  it("flags `catch (e: unknown)` with no allow comment in src/**", () => {
    const code = [
      "export function f(): void {",
      "  try {",
      "    g();",
      "  } catch (e: unknown) {",
      "    h(e);",
      "  }",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/broad-catch-bad.ts");
    expect(ruleIds(messages)).toContain("theta-local/no-broad-catch");
  });

  it("passes an exempt site whose same-line `// allow-broad-catch:` cites an admitted token (cka-<n> / REQ-ID / theta-code / pi-sdk-boundary)", () => {
    // Four admitted token forms, one per exempt-site shape the widened gate
    // predicate accepts; each is on the catch's own source line.
    const code = [
      "export function a(): void {",
      "  try { p(); } catch (e: unknown) { q(e); } // allow-broad-catch: pi-sdk-boundary — Specific exception types only",
      "}",
      "export function b(): void {",
      "  try { p(); } catch (e: unknown) { q(e); } // allow-broad-catch: PIC-3 — pi-integration-contract.md",
      "}",
      "export function c(): void {",
      "  try { p(); } catch (e: unknown) { q(e); } // allow-broad-catch: cka-7 — coverage-matrix.md",
      "}",
      "export function d(): void {",
      "  try { p(); } catch (e: unknown) { q(e); } // allow-broad-catch: theta/host/session-shutdown-reason-unknown — unknown-reason-rule.md",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/broad-catch-ok.ts");
    expect(messages.filter((m) => m.ruleId === "theta-local/no-broad-catch")).toHaveLength(0);
  });

  it("flags bare `catch (e)` and `catch (e: any)`; allows a specific subtype binding", () => {
    const bad = [
      "export function f(): void {",
      "  try { g(); } catch (e) { h(e); }",
      "  try { g(); } catch (e: any) { h(e); }",
      "}",
    ].join("\n");
    const badMsgs = lint(bad, "src/fixtures/broad-catch-forms.ts");
    expect(
      badMsgs.filter((m) => m.ruleId === "theta-local/no-broad-catch"),
    ).toHaveLength(2);
  });
});

describe("H2a — no-unguarded-promise-combinator (Convention: Sequential by default)", () => {
  it("flags `Promise.all` in src/** with no allow comment", () => {
    const code = [
      "export async function f(): Promise<void> {",
      "  await Promise.all([g(), h()]);",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/promise-all-bad.ts");
    expect(ruleIds(messages)).toContain("theta-local/no-unguarded-promise-combinator");
  });

  it("passes `Promise.all` whose line carries a `// allow:` comment", () => {
    const code = [
      "export async function f(): Promise<void> {",
      "  await Promise.all([g(), h()]); // allow: cka-12 — coverage-matrix.md",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/promise-all-ok.ts");
    expect(
      messages.filter((m) => m.ruleId === "theta-local/no-unguarded-promise-combinator"),
    ).toHaveLength(0);
  });

  it("leaves `**/*.test.ts` unrestricted (Promise.all allowed, no exemption comment needed)", () => {
    const code = [
      "export async function f(): Promise<void> {",
      "  await Promise.all([g(), h()]);",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/promise-all.test.ts");
    expect(
      messages.filter((m) => m.ruleId === "theta-local/no-unguarded-promise-combinator"),
    ).toHaveLength(0);
  });
});

describe("H2a — no-blocking-sync (Convention: Sequential by default — blocking runtime)", () => {
  it("flags a blocking `fs.readFileSync` call in src/** with no allow-sync comment", () => {
    const code = [
      "import * as fs from 'node:fs';",
      "export function f(p: string): string {",
      "  return fs.readFileSync(p, 'utf8');",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/readfilesync-bad.ts");
    expect(ruleIds(messages)).toContain("theta-local/no-blocking-sync");
  });

  it("flags a bare `execSync` identifier call in src/**", () => {
    const code = [
      "import { execSync } from 'node:child_process';",
      "export function f(): Buffer {",
      "  return execSync('ls');",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/execsync-bad.ts");
    expect(ruleIds(messages)).toContain("theta-local/no-blocking-sync");
  });

  it("passes the same call with a same-line `// allow-sync: <reason>` comment", () => {
    const code = [
      "import * as fs from 'node:fs';",
      "export function f(p: string): string {",
      "  return fs.readFileSync(p, 'utf8'); // allow-sync: synchronous read at module-load seam",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/readfilesync-ok.ts");
    expect(
      messages.filter((m) => m.ruleId === "theta-local/no-blocking-sync"),
    ).toHaveLength(0);
  });

  it("leaves `**/*.test.ts` unrestricted (readFileSync/execSync allowed, no comment needed)", () => {
    const code = [
      "import * as fs from 'node:fs';",
      "export function f(p: string): string {",
      "  return fs.readFileSync(p, 'utf8');",
      "}",
    ].join("\n");
    const messages = lint(code, "src/fixtures/readfilesync.test.ts");
    expect(
      messages.filter((m) => m.ruleId === "theta-local/no-blocking-sync"),
    ).toHaveLength(0);
  });
});

describe("H2a — module-level-mutable architectural test (Convention: No globals, statics, singletons)", () => {
  it("flags a top-level `let` binding", () => {
    const v = findModuleLevelMutableBindings("let counter = 0;\n") as { kind: string }[];
    expect(v.map((x) => x.kind)).toContain("let");
  });

  it("flags a top-level `var` binding", () => {
    const v = findModuleLevelMutableBindings("var registry;\n") as { kind: string }[];
    expect(v.map((x) => x.kind)).toContain("var");
  });

  it("flags a top-level `const` whose initializer is a mutable object literal", () => {
    const v = findModuleLevelMutableBindings("export const cache = {};\n");
    expect(v).toHaveLength(1);
    expect(v[0]?.kind).toBe("const");
  });

  it("flags a top-level `const` whose initializer is a mutable array literal", () => {
    const v = findModuleLevelMutableBindings("const items = [1, 2, 3];\n");
    expect(v).toHaveLength(1);
  });

  it("does NOT flag a top-level immutable `const` primitive or a const inside a function/class", () => {
    const code = [
      "const PIN = '~0.75.5';",
      "export function make(): { n: number } {",
      "  const local = { n: 1 };", // inside a function — out of scope
      "  return local;",
      "}",
      "class C {",
      "  run(): void {",
      "    const buf = [];", // inside a method — out of scope
      "    buf.push(1);",
      "  }",
      "}",
    ].join("\n");
    expect(findModuleLevelMutableBindings(code)).toHaveLength(0);
  });
});

describe("H2a — gates hold over the real production tree", () => {
  const srcRoot = fileURLToPath(new URL("../src", import.meta.url));

  it("no src/** production file declares a module-level mutable binding", () => {
    for (const file of tsFiles(srcRoot)) {
      const violations = findModuleLevelMutableBindings(readFileSync(file, "utf8"));
      expect(violations, `${file} has module-level mutable bindings`).toHaveLength(0);
    }
  });
});
