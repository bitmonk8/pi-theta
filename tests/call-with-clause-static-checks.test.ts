// RFC 0009 (V21a-T) — call-site `with { cwd }` STATIC CHECKS.
//
// Spec: docs/rfcs/0009-per-call-subagent-cwd.md §Proposal 2 (Mode gating),
// §Proposal 3(c)/(3.6) (default-reject classification); invocation.md
// #options-surface, INV-8; code-registry-parse.md rows
// `with-clause-prompt-mode-callee` / `with-clause-pi-tool` /
// `with-clause-in-process-callee`. Seam sheet §3.3, §3.6, matrix rows
// 6, 9, 12a/12b/12d, 13a-13d.
//
// RED SIGNATURE AT HEAD (one line): `checkInvokeStaticResolution` reads no
// `withClause` field anywhere (the RFC 0009 emission sites of seam sheet §3.3
// are unimplemented), so every "diagnostics contains <with-clause code>"
// assertion below reds on an empty/short diagnostics array.
//
// Driven directly at the UNIT level (`checkInvokeStaticResolution`, hand-built
// `ThetaCompositionInput` + a hand-built `CallableSetSnapshot` three-way
// classifying `theta` / `pi-tool` / MISS), mirroring
// `tests/b0362-case-variant-invoke-cycle-edge.test.ts`'s direct-drive pattern.
// One COMPOSITION-level cell (13d) uses `discoverAndComposeFixtures` per the
// sheet's explicit "pinned at the COMPOSITION level" instruction.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  buildInvokeGraph,
  checkInvokeStaticResolution,
  type CalleeArity,
} from "../src/extension/invoke-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import type { Expr, InvokeExpr, ThetaBody } from "../src/parser/theta-document";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { resolve as resolvePath } from "node:path";
import { R, strExpr, withClause, type FakeCallWithClause } from "./helpers/call-with-clause-harness";
import { FakeFileSystem } from "./helpers/fake-file-system";

/** Host-native resolution of `./callee.theta` against the CALLER's directory (`/thetadir`, since `resolveCalleeAbsolute` resolves relative to `dirname(callerPath)`, not the fake fs `cwd`; windows prepends the current drive) — the exact path `resolveCalleeAbsolute` (invoke-static-checks.ts) produces, normalised to forward slashes. */
const RESOLVED_CALLEE = resolvePath("/thetadir", "./callee.theta").replace(/\\/g, "/");
const RESOLVED_THETA_ROOT = resolvePath("/thetadir").replace(/\\/g, "/");

const WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE = "theta/parse/with-clause-prompt-mode-callee";
const WITH_CLAUSE_PI_TOOL_CODE = "theta/parse/with-clause-pi-tool";
const WITH_CLAUSE_IN_PROCESS_CALLEE_CODE = "theta/parse/with-clause-in-process-callee";
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";

/** A bare-ident `CallExpr`, optionally carrying a cast `withClause`, as a `let` init (lands in `collectCallSites().callExprs`). */
function letCall(name: string, callee: string, clause?: FakeCallWithClause) {
  const call = { kind: "call", callee, args: [], range: R(), withClause: clause } as unknown as Expr;
  return { kind: "let", name, mutable: false, annotation: null, init: call, range: R() };
}

function bodyOf(...stmts: ReturnType<typeof letCall>[]): ThetaBody {
  return { statements: stmts as unknown as ThetaBody["statements"], tail: null };
}

const EMPTY_GRAPH = { edges: new Map([["caller", []]]), unresolvable: new Set<string>() };

const noArityResolution = (): Promise<CalleeArity | undefined> => Promise.resolve(undefined);

async function checkBody(
  body: ThetaBody,
  callableSet: CallableSetSnapshot | undefined,
): Promise<string[]> {
  const input: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/thetadir/caller.theta",
    frontmatter: {} as unknown as ParsedFrontmatter,
    body,
  };
  const deps = {
    fs: new FakeFileSystem({ homedir: "/home/u", cwd: "/theta", files: {}, dirs: {} }),
    activeRoots: ["/theta"],
    graph: EMPTY_GRAPH,
    resolveCalleeArity: noArityResolution,
    ...(callableSet !== undefined ? { callableSet } : {}),
  };
  const diags = await checkInvokeStaticResolution(input, deps);
  return diags.map((d) => d.code);
}

/** A frozen callable set classifying `helper` as a `.theta` callee (kind theta) and `read` as a Pi tool. */
function mixedCallableSet(): CallableSetSnapshot {
  return {
    entries: new Map<
      string,
      { kind: "theta" | "pi-tool"; mode?: "subagent" | "prompt"; calleePath?: string; callee?: unknown; toolDefinition?: unknown }
    >([
      ["helper", { kind: "theta", mode: "subagent", calleePath: "./helper.theta", callee: undefined }],
      ["read", { kind: "pi-tool", toolDefinition: {} }],
    ]) as unknown as CallableSetSnapshot["entries"],
  } as unknown as CallableSetSnapshot;
}

// ===========================================================================
// Row 9 — a clause on a Pi-tool call.
// ===========================================================================

describe("RFC 0009 static checks — row 9: with-clause-pi-tool", () => {
  it("a clause on a callable-set Pi-tool entry draws theta/parse/with-clause-pi-tool (RED)", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "read", withClause(strExpr("a")))), mixedCallableSet());
    expect(codes).toContain(WITH_CLAUSE_PI_TOOL_CODE);
  });

  it("negative: a clause-free Pi-tool call draws nothing (green control)", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "read")), mixedCallableSet());
    expect(codes).not.toContain(WITH_CLAUSE_PI_TOOL_CODE);
    expect(codes).not.toContain(WITH_CLAUSE_IN_PROCESS_CALLEE_CODE);
  });
});

// ===========================================================================
// Rows 12a/12b/12d, 13a-13c — the DEFAULT-REJECT classification arm.
// ===========================================================================

describe("RFC 0009 static checks — rows 12a-13c: every non-.theta-callable bare-ident callee under a clause draws with-clause-in-process-callee", () => {
  it("12a: same-file callee (a subagent fn / plain fn — indistinguishable to the callable-set MISS) draws the code (RED)", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "step", withClause(strExpr("a")))), mixedCallableSet());
    expect(codes).toContain(WITH_CLAUSE_IN_PROCESS_CALLEE_CODE);
  });

  it("12b/13b: an imported .thetalib fn callee (declared directly OR reached through a re-export chain) draws the code — no fn-kind or chain resolution (RED)", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "lib_fn", withClause(strExpr("a")))), mixedCallableSet());
    expect(codes).toContain(WITH_CLAUSE_IN_PROCESS_CALLEE_CODE);
  });

  it("13c: a resolved non-fn ident (a builtin name such as `string`) still draws the code — no callee taxonomy (RED)", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "string", withClause(strExpr("a")))), mixedCallableSet());
    expect(codes).toContain(WITH_CLAUSE_IN_PROCESS_CALLEE_CODE);
  });

  it("negative: a clause on a callable-set `theta`-kind entry draws NEITHER rejection code (the mode gate owns it) (green control)", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "helper", withClause(strExpr("a")))), mixedCallableSet());
    expect(codes).not.toContain(WITH_CLAUSE_IN_PROCESS_CALLEE_CODE);
    expect(codes).not.toContain(WITH_CLAUSE_PI_TOOL_CODE);
  });

  it("negative: no callableSet (undefined) skips the classification loop entirely — moot, nothing registers (green control)", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "ghost", withClause(strExpr("a")))), undefined);
    expect(codes).not.toContain(WITH_CLAUSE_IN_PROCESS_CALLEE_CODE);
  });
});

// ===========================================================================
// Row 6 — invoke(...) + clause + statically-resolvable prompt-mode callee.
// ===========================================================================

describe("RFC 0009 static checks — row 6: invoke(...) with a clause on a statically-resolvable prompt-mode callee", () => {
  it("draws theta/parse/with-clause-prompt-mode-callee (RED)", async () => {
    const invoke = {
      kind: "invoke",
      path: "./callee.theta",
      returnSchema: null,
      args: [],
      range: R(),
      withClause: withClause(strExpr("a")),
    } as unknown as InvokeExpr;
    const body: ThetaBody = {
      statements: [{ kind: "invoke", invoke, range: R() } as unknown as ThetaBody["statements"][number]],
      tail: null,
    };
    const promptArity = (): Promise<CalleeArity | undefined> =>
      Promise.resolve({ requiredCount: 0, totalCount: 0, fields: [], mode: "prompt" } as unknown as CalleeArity);
    const input: ThetaCompositionInput = {
      slashName: "caller",
      sourcePath: "/thetadir/caller.theta",
      frontmatter: {} as unknown as ParsedFrontmatter,
      body,
    };
    const diags = await checkInvokeStaticResolution(input, {
      fs: new FakeFileSystem({
        homedir: "/home/u",
        cwd: "/theta",
        files: { [RESOLVED_CALLEE]: "theta", [RESOLVED_THETA_ROOT]: "" },
        dirs: { [RESOLVED_THETA_ROOT]: [] },
      }),
      activeRoots: [RESOLVED_THETA_ROOT],
      graph: EMPTY_GRAPH,
      resolveCalleeArity: promptArity,
    });
    expect(diags.map((d) => d.code)).toContain(WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE);
  });
});

// ===========================================================================
// Row 13d (COMPOSITION-level precedence pin): an unresolved callee under a
// clause draws theta/parse/unknown-identifier ALONE — never doubled by
// with-clause-in-process-callee, whose classifying loop never reaches an
// input the parse-time refusal already un-registered.
// ===========================================================================

describe("RFC 0009 static checks — row 13d: unknown-identifier precedence over the classification loop (composition-level)", () => {
  let workspaceDir: string;

  afterEach(() => {
    if (workspaceDir !== undefined) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("`ghost(1) with { cwd: t }` (ghost bound nowhere) registers theta/parse/unknown-identifier and NEVER with-clause-in-process-callee (finding-3: the parser change HAS landed — repaired to spell the real clause syntax)", async () => {
    workspaceDir = mkdtempSync(join(tmpdir(), "rfc0009-13d-"));
    const thetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
    writeFileSync(
      join(thetaDir, "ghostcall.theta"),
      ["---", "mode: subagent", "---", 'let _ = ghost(1) with { cwd: "sub" }', "@`hi`"].join("\n"),
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
      cwd: workspaceDir,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: {
        notify: (message: string): void => {
          notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;
    const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
    expect(fixtures.map((f) => f.slashName)).not.toContain("ghostcall");
    expect(notifications.some((n) => n.includes("unknown identifier 'ghost'"))).toBe(true);
    expect(notifications.some((n) => n.includes("is not applicable to 'ghost'"))).toBe(false);
  });
});
