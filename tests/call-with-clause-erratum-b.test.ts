// RFC 0009 Erratum B (RFC 0012 §10, D3) — `subagent fn` calls rejoin the
// clause-bearing call surfaces.
//
// Under RFC 0012 §10 a `subagent fn` body runs in a spawned child process of
// the calling theta, so a call-site `with { cwd }` on a `subagent fn` call
// addresses a real child working directory (INV-8's rationale) and the
// Errata A/A′ default-reject arm no longer applies to it. Three static
// surfaces change, each pinned here against its own seam:
//
//   1. `checkWithClauseDefaultReject` (`checkInvokeStaticResolution`,
//      src/extension/invoke-static-checks.ts): a same-file top-level
//      `subagent fn` callee is admitted; a same-file plain `fn` (or an
//      undeclared name) still draws `theta/parse/with-clause-in-process-callee`.
//      An IMPORTED local name is deferred — its fn kind is the declaring
//      library's fact.
//   2. `checkImportedWithClauseCallees` (the deferred half, run by the compose
//      pass once the import has materialised): an imported `subagent fn` is
//      admitted; an imported plain `fn` draws the code at the clause range.
//   3. `checkThetaLibCallWithClauses` (the `.thetalib` parse-time arm,
//      src/parser/theta-document.ts): a lib-body call naming one of the lib's
//      OWN top-level `subagent fn`s is admitted; a lib-body call on an imported
//      name stays refused at the lib's own parse (the lib's own import is not
//      materialised at parse time, so the recorded posture is refusal there).
//
// The composition-level cell runs the deferred check through
// `discoverAndComposeFixtures`: a `.theta` importing a `.thetalib` `subagent fn`
// and calling it under a clause registers; the same shape over a plain `fn`
// is un-registered with the code's own Message.
//
// Spec: code-registry-parse.md row `with-clause-in-process-callee` (Trigger:
// the three legal surfaces); invocation.md INV-8; RFC 0009 erratum log
// "Erratum B".

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaFixture } from "../src/extension/factory";
import {
  checkImportedWithClauseCallees,
  checkInvokeStaticResolution,
  type CalleeArity,
} from "../src/extension/invoke-static-checks";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ThetaSource } from "../src/lexer/lexer";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type FnDecl, type ThetaDocument } from "../src/parser/theta-document";
import type { MaterializedImport } from "../src/runtime/lexical-environment";
import { finishWorkspace, type ComposeWorkspace } from "./helpers/compose-workspace-harness";
import { parseDeps } from "./helpers/e2e-s1";
import { FakeFileSystem } from "./helpers/fake-file-system";

const IN_PROCESS_CALLEE_CODE = "theta/parse/with-clause-in-process-callee";
const FM = ["---", "mode: subagent", "---"].join("\n") + "\n";

function parse(src: string, path = "/thetadir/caller.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

function codesOf(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

/** A callable set with one unrelated `.theta` entry, so the default-reject loop runs (it is skipped when the set is absent). */
function callableSetWithHelper(): CallableSetSnapshot {
  return {
    entries: new Map([
      ["helper", { kind: "theta", mode: "subagent", calleePath: "./helper.theta" }],
    ]) as unknown as CallableSetSnapshot["entries"],
  } as unknown as CallableSetSnapshot;
}

const noArityResolution = (): Promise<CalleeArity | undefined> => Promise.resolve(undefined);

/** Run the load-pass static checks over a REAL parsed `.theta` body (its own `fn` / `import` declarations included). */
async function loadPassCodes(src: string): Promise<string[]> {
  const doc = parse(FM + src);
  expect(codesOf(doc.diagnostics), "fixture: the caller parses clean").toEqual([]);
  const input: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const diags = await checkInvokeStaticResolution(input, {
    fs: new FakeFileSystem({ homedir: "/home/u", cwd: "/theta", files: {}, dirs: {} }),
    activeRoots: ["/theta"],
    graph: { edges: new Map([["caller", []]]), unresolvable: new Set<string>() },
    resolveCalleeArity: noArityResolution,
    callableSet: callableSetWithHelper(),
  });
  return codesOf(diags);
}

// ===========================================================================
// 1. The same-file arm of the default-reject classification.
// ===========================================================================

describe("Erratum B — checkWithClauseDefaultReject: a same-file `subagent fn` callee is a clause-bearing surface", () => {
  it("`step(\"a\") with { cwd: \"sub\" }` on a same-file top-level `subagent fn step` draws NO with-clause-in-process-callee", async () => {
    const codes = await loadPassCodes(
      ['subagent fn step(x: string) {', "  x", "}", 'let r = step("a") with { cwd: "sub" }', "@`hi`", ""].join("\n"),
    );
    expect(codes).not.toContain(IN_PROCESS_CALLEE_CODE);
  });

  it("the same call on a same-file PLAIN `fn step` still draws the code (the in-process surface is unchanged)", async () => {
    const codes = await loadPassCodes(
      ["fn step(x: string) {", "  x", "}", 'let r = step("a") with { cwd: "sub" }', "@`hi`", ""].join("\n"),
    );
    expect(codes).toContain(IN_PROCESS_CALLEE_CODE);
  });

  it("an IMPORTED local name under a clause is deferred by the load pass (no code from checkInvokeStaticResolution) — the materialisation check judges it", async () => {
    const codes = await loadPassCodes(
      ['import { lib_fn } from "./lib.thetalib"', 'let r = lib_fn("a") with { cwd: "sub" }', "@`hi`", ""].join("\n"),
    );
    expect(codes).not.toContain(IN_PROCESS_CALLEE_CODE);
  });
});

// ===========================================================================
// 2. The deferred imported-name check.
// ===========================================================================

/** Parse a `.thetalib` and lift its named top-level `fn` as a materialised import. */
function materialisedFn(libSrc: string, name: string, local = name): MaterializedImport {
  const lib = parse(libSrc, "/thetadir/lib.thetalib");
  expect(codesOf(lib.diagnostics), "fixture: the lib parses clean").toEqual([]);
  const fn = lib.body.statements.find((s): s is FnDecl => s.kind === "fn" && s.name === name);
  if (fn === undefined) {
    throw new Error(`fixture: the lib must declare fn ${name}`);
  }
  return {
    name: local,
    kind: "fn",
    fn,
    moduleScope: { body: lib.body, imports: [], enums: [], residence: "/thetadir/lib.thetalib" },
  };
}

describe("Erratum B — checkImportedWithClauseCallees: an imported `subagent fn` is admitted once the import materialises", () => {
  const CALLER = [
    'import { lib_fn } from "./lib.thetalib"',
    'let r = lib_fn("a") with { cwd: "sub" }',
    "@`hi`",
    "",
  ].join("\n");

  it("an imported `subagent fn` callee draws nothing", () => {
    const doc = parse(FM + CALLER);
    const imported = materialisedFn(["subagent fn lib_fn(x: string) {", "  x", "}", ""].join("\n"), "lib_fn");
    const diags = checkImportedWithClauseCallees("/thetadir/caller.theta", doc.body, [imported], callableSetWithHelper());
    expect(codesOf(diags)).toEqual([]);
  });

  it("an imported PLAIN `fn` callee draws with-clause-in-process-callee, ranged over the clause and naming the local callee", () => {
    const doc = parse(FM + CALLER);
    const imported = materialisedFn(["fn lib_fn(x: string) {", "  x", "}", ""].join("\n"), "lib_fn");
    const diags = checkImportedWithClauseCallees("/thetadir/caller.theta", doc.body, [imported], callableSetWithHelper());
    expect(codesOf(diags)).toEqual([IN_PROCESS_CALLEE_CODE]);
    expect(diags[0]!.message).toContain("'lib_fn'");
    const call = (doc.body.statements[1] as unknown as { init: { withClause: { range: unknown } } }).init;
    expect(diags[0]!.range).toEqual(call.withClause.range);
  });

  it("an `as`-aliased imported `subagent fn` is judged under its LOCAL name", () => {
    const src = [
      'import { lib_fn as remote } from "./lib.thetalib"',
      'let r = remote("a") with { cwd: "sub" }',
      "@`hi`",
      "",
    ].join("\n");
    const doc = parse(FM + src);
    const imported = materialisedFn(["subagent fn lib_fn(x: string) {", "  x", "}", ""].join("\n"), "lib_fn", "remote");
    expect(codesOf(checkImportedWithClauseCallees("/thetadir/caller.theta", doc.body, [imported], callableSetWithHelper()))).toEqual([]);
    const plain = materialisedFn(["fn lib_fn(x: string) {", "  x", "}", ""].join("\n"), "lib_fn", "remote");
    expect(codesOf(checkImportedWithClauseCallees("/thetadir/caller.theta", doc.body, [plain], callableSetWithHelper()))).toEqual([
      IN_PROCESS_CALLEE_CODE,
    ]);
  });

  it("a clause-free imported call and a non-imported callee are outside this check's scope", () => {
    const src = ['import { lib_fn } from "./lib.thetalib"', 'let r = lib_fn("a")', 'let s = other("b") with { cwd: "sub" }', "@`hi`", ""].join("\n");
    const doc = parse(FM + src);
    // `other` is not an import; the load-pass default-reject arm owns it.
    const imported = materialisedFn(["fn lib_fn(x: string) {", "  x", "}", ""].join("\n"), "lib_fn");
    expect(codesOf(checkImportedWithClauseCallees("/thetadir/caller.theta", doc.body, [imported], callableSetWithHelper()))).toEqual([]);
  });
});

// ===========================================================================
// 3. The `.thetalib` parse-time arm.
// ===========================================================================

describe("Erratum B — the .thetalib parse-time arm admits a lib-body call on one of the lib's OWN top-level `subagent fn`s", () => {
  it("`fn helper(a) { sib(a) with { cwd: \"a\" } }` beside `subagent fn sib` draws NO with-clause-in-process-callee at the lib's parse", () => {
    const doc = parse(
      ["subagent fn sib(x: string) {", "  x", "}", "fn helper(a: string) {", '  let x = sib(a) with { cwd: "a" }', "  x", "}", ""].join("\n"),
      "/thetadir/lib.thetalib",
    );
    expect(codesOf(doc.diagnostics)).not.toContain(IN_PROCESS_CALLEE_CODE);
  });

  it("the same lib-body call on a sibling PLAIN `fn` still draws the code", () => {
    const doc = parse(
      ["fn sib(x: string) {", "  x", "}", "fn helper(a: string) {", '  let x = sib(a) with { cwd: "a" }', "  x", "}", ""].join("\n"),
      "/thetadir/lib.thetalib",
    );
    expect(codesOf(doc.diagnostics)).toContain(IN_PROCESS_CALLEE_CODE);
  });

  it("a lib-body call on an IMPORTED name under a clause stays refused at the lib's own parse (the recorded lib-side posture)", () => {
    const doc = parse(
      ['import { other } from "./other.thetalib"', "fn helper(a: string) {", '  let x = other(a) with { cwd: "a" }', "  x", "}", ""].join("\n"),
      "/thetadir/lib.thetalib",
    );
    expect(codesOf(doc.diagnostics)).toContain(IN_PROCESS_CALLEE_CODE);
  });
});

// ===========================================================================
// 4. Composition level — the deferred check runs after import materialisation.
// ===========================================================================

describe("Erratum B — composition level: the deferred imported-callee check gates registration", () => {
  let workspace: ComposeWorkspace | undefined;

  afterEach(() => {
    workspace?.dispose();
  });

  async function compose(libBody: string): Promise<{ readonly slugs: string[]; readonly notifications: string[] }> {
    const cwd = mkdtempSync(join(tmpdir(), "rfc0009-erratum-b-"));
    const thetaDir = join(cwd, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    workspace = finishWorkspace(cwd);
    writeFileSync(join(thetaDir, "lib.thetalib"), libBody, "utf8");
    writeFileSync(
      join(thetaDir, "caller.theta"),
      ["---", "mode: subagent", "---", 'import { lib_fn } from "./lib.thetalib"', 'let r = lib_fn("a") with { cwd: "sub" }', "@`hi ${r}`", ""].join("\n"),
      "utf8",
    );
    const notifications: string[] = [];
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (): void => {},
      sendUserMessage: (): void => {},
      getActiveTools: (): readonly string[] => [],
      setActiveTools: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace.cwd,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: {
        notify: (message: string): void => {
          notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;
    const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
    return { slugs: fixtures.map((f) => f.slashName), notifications };
  }

  it("a `.theta` calling an imported `.thetalib` `subagent fn` under `with { cwd }` REGISTERS", async () => {
    const outcome = await compose(["subagent fn lib_fn(x: string) {", "  x", "}", ""].join("\n"));
    expect(outcome.slugs, `notifications: ${JSON.stringify(outcome.notifications)}`).toContain("caller");
    expect(outcome.notifications.some((n) => n.includes("is not applicable to 'lib_fn'"))).toBe(false);
  });

  it("the same shape over an imported PLAIN `fn` is un-registered with the with-clause-in-process-callee Message", async () => {
    const outcome = await compose(["fn lib_fn(x: string) {", "  x", "}", ""].join("\n"));
    expect(outcome.slugs).not.toContain("caller");
    expect(
      outcome.notifications.some((n) => n.includes("is not applicable to 'lib_fn'")),
      `notifications: ${JSON.stringify(outcome.notifications)}`,
    ).toBe(true);
  });
});
