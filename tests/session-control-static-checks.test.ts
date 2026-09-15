// RFC 0011 (V24a-T) — S3 compose-pass RED tests: fixed-signature arity/type
// checks over a runtime-tool call site (seam sheet §5.2), the with-clause
// default-reject fallthrough (§3.2 row 1), and the C6 return-type flow
// (§5.4/matrix P8/P9).
//
// Contract: `.localpi/tmp/rfc-0011-seam-sheet.md` §3.2 (`.kind` consumer
// table row 1), §5.2 (`checkRuntimeToolCallSurface`, a sibling of
// `checkThetaCallableCallSurface`), §0 C6 (return-type flow realisation),
// §5.5 behaviour matrix (P1-P10 cells; I-cells are `tests/session-control-parse.test.ts`'s).
//
// RED SIGNATURE AT HEAD (one line, arity/type): no `kind === "runtime-tool"`
// classification loop exists anywhere in `checkInvokeStaticResolution` (the
// existing `.theta`-callable arm skips non-`"theta"` kinds; the Pi-tool
// disjointness arm skips non-`"pi-tool"` kinds) — a hand-built call site whose
// frozen entry carries `kind: "runtime-tool"` is invisible to every arity/type
// check, so every "diagnostics contains <arity/type code>" assertion below
// reds against an EMPTY diagnostics array. RED SIGNATURE (return-type flow):
// `StaticTypeInferenceDeps` carries no `runtimeToolSuccessTypes` map and
// `checkTypeLayer` takes no fourth parameter, so a runtime-tool call's `try`
// unwrap never resolves past the deferred `"named"` nominal — a provable
// misuse on the unwrapped member never draws its ordering diagnostic.
//
// Driven directly at the UNIT level (`checkInvokeStaticResolution`, hand-built
// `ThetaCompositionInput` + a hand-built `CallableSetSnapshot` carrying
// `kind: "runtime-tool"` entries via a structural cast — mirroring
// `tests/call-with-clause-static-checks.test.ts`'s `mixedCallableSet()`) for
// P1-P7/P10, and `parseThetaDocument` with real `tools:` frontmatter (the C6
// realisation threads `runtimeToolSuccessTypes` from `frontmatter.tools`
// straight into the PARSE-time type layer) for P8/P9.

import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { checkInvokeStaticResolution, type CalleeArity } from "../src/extension/invoke-static-checks";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import type { Expr, ThetaBody } from "../src/parser/theta-document";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { R, strExpr, withClause } from "./helpers/call-with-clause-harness";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import { parseThetaDocument, type ParseThetaDocumentDeps, type ThetaDocument } from "../src/parser/theta-document";

const TOOL_ARG_TYPE_MISMATCH_CODE = "theta/parse/tool-arg-type-mismatch";
const ARITY_TOO_MANY_CODE = "theta/parse/invoke-arity-too-many";
const ARITY_TOO_FEW_CODE = "theta/parse/invoke-arity-too-few";
const WITH_CLAUSE_IN_PROCESS_CALLEE_CODE = "theta/parse/with-clause-in-process-callee";
const NON_ORDERABLE_OPERANDS_CODE = "theta/parse/non-orderable-operands";

// ===========================================================================
// Part A — arity/type/with-clause cells (P1-P7, P10). Unit-level direct drive.
// ===========================================================================

/** A bare-ident `CallExpr` over a runtime-tool entry, with the given args. */
function letCall(name: string, callee: string, args: readonly Expr[], clause?: ReturnType<typeof withClause>) {
  const call = { kind: "call", callee, args, range: R(), withClause: clause } as unknown as Expr;
  return { kind: "let", name, mutable: false, annotation: null, init: call, range: R() };
}

function bodyOf(...stmts: ReturnType<typeof letCall>[]): ThetaBody {
  return { statements: stmts as unknown as ThetaBody["statements"], tail: null };
}

/** A `NumberExpr` integer literal. */
function intExpr(text: string): Expr {
  return { kind: "number", text, numericType: "integer", range: R() } as unknown as Expr;
}

/** A bare `{ field: value }` object-literal argument (`typeName: null`). */
function objExpr(fields: readonly { readonly name: string; readonly value: Expr }[]): Expr {
  return { kind: "object", typeName: null, fields, range: R() } as unknown as Expr;
}

const EMPTY_GRAPH = { edges: new Map([["caller", []]]), unresolvable: new Set<string>() };
const noArityResolution = (): Promise<CalleeArity | undefined> => Promise.resolve(undefined);

/** A frozen callable set classifying the three RFC 0011 names as `kind: "runtime-tool"`
 * via a structural cast (the future `ResolvedRuntimeTool` union member does not
 * exist on `ResolvedCallable` yet — mirrors `mixedCallableSet()` in
 * `tests/call-with-clause-static-checks.test.ts`). */
function runtimeToolCallableSet(): CallableSetSnapshot {
  return {
    entries: new Map<string, { kind: "runtime-tool"; name: string }>([
      ["compact", { kind: "runtime-tool", name: "compact" }],
      ["c", { kind: "runtime-tool", name: "compact" }],
      ["context_usage", { kind: "runtime-tool", name: "context_usage" }],
      ["session_name", { kind: "runtime-tool", name: "session_name" }],
    ]) as unknown as CallableSetSnapshot["entries"],
  } as unknown as CallableSetSnapshot;
}

async function checkBody(body: ThetaBody, callableSet: CallableSetSnapshot | undefined): Promise<string[]> {
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

describe("RFC 0011 §5.2 — P1: default-partition arity is admitted (green control)", () => {
  it("P1: `compact()` and `compact(\"x\")` (required 0, total 1) draw no arity/type diagnostic", async () => {
    const codesA = await checkBody(bodyOf(letCall("x", "compact", [])), runtimeToolCallableSet());
    const codesB = await checkBody(bodyOf(letCall("x", "compact", [strExpr("x")])), runtimeToolCallableSet());
    expect(codesA).not.toContain(ARITY_TOO_FEW_CODE);
    expect(codesA).not.toContain(ARITY_TOO_MANY_CODE);
    expect(codesB).not.toContain(ARITY_TOO_FEW_CODE);
    expect(codesB).not.toContain(ARITY_TOO_MANY_CODE);
  });
});

describe("RFC 0011 §5.2 — P2: a non-string literal argument draws tool-arg-type-mismatch", () => {
  it("P2: `compact(1)` draws theta/parse/tool-arg-type-mismatch, exact message", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "compact", [intExpr("1")])), runtimeToolCallableSet());
    expect(
      codes,
      `RED: no runtime-tool classification loop exists yet; got ${JSON.stringify(codes)}`,
    ).toContain(TOOL_ARG_TYPE_MISMATCH_CODE);
  });
});

describe("RFC 0011 §5.2 — P3: too many positional arguments over compact's 0/1 signature", () => {
  it("P3: `compact(\"a\", \"b\")` draws theta/parse/invoke-arity-too-many", async () => {
    const codes = await checkBody(
      bodyOf(letCall("x", "compact", [strExpr("a"), strExpr("b")])),
      runtimeToolCallableSet(),
    );
    expect(codes, `RED: got ${JSON.stringify(codes)}`).toContain(ARITY_TOO_MANY_CODE);
  });
});

describe("RFC 0011 §5.2 — P4: context_usage's 0/0 signature rejects any argument as too-many", () => {
  it("P4: `context_usage(\"x\")` draws theta/parse/invoke-arity-too-many", async () => {
    const codes = await checkBody(
      bodyOf(letCall("x", "context_usage", [strExpr("x")])),
      runtimeToolCallableSet(),
    );
    expect(codes, `RED: got ${JSON.stringify(codes)}`).toContain(ARITY_TOO_MANY_CODE);
  });
});

describe("RFC 0011 §5.2 — P5: session_name's 1/1 signature rejects zero arguments as too-few", () => {
  it("P5: `session_name()` draws theta/parse/invoke-arity-too-few", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "session_name", [])), runtimeToolCallableSet());
    expect(codes, `RED: got ${JSON.stringify(codes)}`).toContain(ARITY_TOO_FEW_CODE);
  });
});

describe("RFC 0011 §5.2 — P6: an object-literal argument is withheld from statics (the runtime net's own concern)", () => {
  it("P6: `compact({ instructions: \"x\" })` draws NO parse-time type-mismatch code (provable-only statics withhold object literals)", async () => {
    const codes = await checkBody(
      bodyOf(letCall("x", "compact", [objExpr([{ name: "instructions", value: strExpr("x") }])])),
      runtimeToolCallableSet(),
    );
    expect(codes).not.toContain(TOOL_ARG_TYPE_MISMATCH_CODE);
  });
});

describe("RFC 0011 §5.2 — P7: a RENAMED entry's diagnostic renders the presented (call-site) spelling", () => {
  it("P7: `compact as c` declared; `c(1)` draws tool-arg-type-mismatch naming 'c'", async () => {
    const codes = await checkBody(bodyOf(letCall("x", "c", [intExpr("1")])), runtimeToolCallableSet());
    expect(
      codes,
      `RED: got ${JSON.stringify(codes)}`,
    ).toContain(TOOL_ARG_TYPE_MISMATCH_CODE);
  });
});

describe("RFC 0011 §3.2 row 1 — P10: a call-site `with` clause on a runtime tool falls through to the default-reject arm (green control — zero code change)", () => {
  it("P10: `compact(\"x\") with { cwd: \"d\" }` draws theta/parse/with-clause-in-process-callee", async () => {
    const codes = await checkBody(
      bodyOf(letCall("x", "compact", [strExpr("x")], withClause(strExpr("d")))),
      runtimeToolCallableSet(),
    );
    expect(codes).toContain(WITH_CLAUSE_IN_PROCESS_CALLEE_CODE);
  });
});

// ===========================================================================
// Part B — the C6 return-type flow (P8/P9), realised at PARSE time
// (`checkTypeLayer` derives `runtimeToolSuccessTypes` straight from
// `frontmatter.tools`; §0 C6). Driven through the real whole-file parser with
// inline template-literal sources.
// ===========================================================================

function makeParseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parseSrc(src: string): ThetaDocument {
  const source: ThetaSource = { path: "test.theta", bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeParseDeps());
}

function fm(tools: string): string {
  return ["---", "mode: subagent", `tools: ${tools}`, "---", ""].join("\n");
}

describe("RFC 0011 §0 C6 / §5.5 — P8: context_usage's try-unwrap flows a real structural type", () => {
  it("P8: `let usage = context_usage()?` then `usage.percent > 60` is admitted (no false diagnostic) — green control (deferral already admits it today)", () => {
    const src = fm("context_usage") + ["let usage = context_usage()?", "usage.percent > 60", ""].join("\n");
    const codes = parseSrc(src).diagnostics.map((d) => d.code);
    expect(codes).not.toContain(NON_ORDERABLE_OPERANDS_CODE);
  });

  it("P8: `usage.percent > \"x\"` (a provable misuse of the NOW-typed `number` member) draws the ordering diagnostic", () => {
    const src = fm("context_usage") + ["let usage = context_usage()?", 'usage.percent > "x"', ""].join("\n");
    const codes = parseSrc(src).diagnostics.map((d) => d.code);
    expect(
      codes,
      `RED: no runtimeToolSuccessTypes flow exists yet, so 'usage.percent' stays an unresolvable deferred nominal and this misuse draws nothing. Got ${JSON.stringify(codes)}`,
    ).toContain(NON_ORDERABLE_OPERANDS_CODE);
  });

  it("P8: an un-`?`'d `let r = compact(\"x\")` then `r.summary` defers — no false type (green control)", () => {
    const src = fm("compact") + ["let r = compact(\"x\")", "r.summary", ""].join("\n");
    const codes = parseSrc(src).diagnostics.map((d) => d.code);
    // Deferral: no diagnostic claims a type for `r` at all (a "named" nominal
    // on the un-`?`'d Result, per C6 — never a false structural claim).
    expect(codes).not.toContain(NON_ORDERABLE_OPERANDS_CODE);
  });
});

describe("RFC 0011 §0 C6 / §5.5 — P9: session_name's try-unwrap flows the `string` success type", () => {
  it("P9: `let n = session_name(\"x\")?` then a provable string-member misuse (`n > 60`) draws the ordering diagnostic", () => {
    const src = fm("session_name") + ['let n = session_name("x")?', "n > 60", ""].join("\n");
    const codes = parseSrc(src).diagnostics.map((d) => d.code);
    expect(
      codes,
      `RED: no runtimeToolSuccessTypes flow exists yet, so 'n' stays deferred. Got ${JSON.stringify(codes)}`,
    ).toContain(NON_ORDERABLE_OPERANDS_CODE);
  });
});
