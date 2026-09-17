// RFC 0011 (V24a-T) — S3 parse-layer RED tests: the isolated-body check
// (`theta/parse/session-tool-in-isolated-body`, seam sheet §5.3, C4 ruling).
//
// Contract: `.localpi/tmp/rfc-0011-seam-sheet.md` §5.1 (lexical layer,
// unchanged, pinned — a `tools:` entry's presented name is already a callable
// at parse time regardless of load-time resolution success), §5.3 (the
// isolated-body check lives in `checkLexicalCallSites`, threaded via an
// `insideParFor` flag), §5.5 behaviour matrix (I1-I10 cells). Background:
// docs/rfcs/0011-session-control-tools.md §6.
//
// RED SIGNATURE AT HEAD (one line): `checkLexicalCallSites`
// (`src/parser/theta-document.ts`) threads no `insideParFor` flag and knows
// no `runtimeTools` map — its `par-for` arm descends into the body exactly as
// any other block, so no call site anywhere ever draws
// `theta/parse/session-tool-in-isolated-body`. Every "the code fires" cell
// below reds against an empty/short diagnostics array; the "the code does NOT
// fire" (guard) cells are already true today for the SAME reason and are
// included as green controls, unaffected by this change.
//
// This file is the DIAG-2 asserting home for the full code string
// `theta/parse/session-tool-in-isolated-body` (I1-I4).
//
// No P-cells are placed at parse (§5.2's arity/type checks and §5.4's return-
// type flow are compose-pass / type-layer, owned by
// `tests/session-control-static-checks.test.ts`); this file covers I1-I10
// alone.
//
// Method: mirrors `tests/call-with-clause-parse.test.ts` / `tests/par-for.test.ts`'s
// `parseThetaDocument` + inline template-literal-source harness.
import { parseDeps as makeDeps } from "./helpers/e2e-s1";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";

/** DIAG-2 asserting home for `theta/parse/session-tool-in-isolated-body` (I1-I4 below). */
const SESSION_TOOL_IN_ISOLATED_BODY_CODE = "theta/parse/session-tool-in-isolated-body";
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";
const SHADOWED_CALLABLE_CALL_CODE = "theta/parse/shadowed-callable-call";
const NESTED_FN_CODE = "theta/parse/nested-fn";

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}

/** Frontmatter fence declaring `mode: subagent` and the given `tools:` entries (short form). */
function fm(tools?: string): string {
  const lines = ["---", "mode: subagent"];
  if (tools !== undefined) {
    lines.push(`tools: ${tools}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

// ===========================================================================
// I1-I4 — the code fires for all three tools, renamed entries, and a nested
// block inside the body.
// ===========================================================================

describe("RFC 0011 §5.3/§5.5 — I1: a declared runtime tool called directly in a par-for body draws the isolated-body code", () => {
  it("I1: `par for … { compact() }` (declared) draws theta/parse/session-tool-in-isolated-body, exact message", () => {
    const src = fm("compact") + ["let r = par for x in [1] {", "  compact()", "}", "r", ""].join("\n");
    const doc = parse(src);
    const codes = doc.diagnostics.map((d) => d.code);
    const dg = doc.diagnostics.find((d) => d.code === SESSION_TOOL_IN_ISOLATED_BODY_CODE);
    expect(dg, `RED: expected ${SESSION_TOOL_IN_ISOLATED_BODY_CODE} among ${JSON.stringify(codes)}`).toBeDefined();
    expect(dg?.message).toBe(
      "'compact' addresses the enclosing conversation and is not available inside a par for body",
    );
  });
});

describe("RFC 0011 §5.5 — I2: a RENAMED entry called inside the body renders the PRESENTED spelling", () => {
  it("I2: `compact as c` declared; `par for … { c() }` fires the code, message renders 'c'", () => {
    const src = fm("compact as c") + ["let r = par for x in [1] {", "  c()", "}", "r", ""].join("\n");
    const codes = codesOf(src);
    expect(
      codes,
      `RED: expected ${SESSION_TOOL_IN_ISOLATED_BODY_CODE} among ${JSON.stringify(codes)}`,
    ).toContain(SESSION_TOOL_IN_ISOLATED_BODY_CODE);
    const dg = parse(src).diagnostics.find((d) => d.code === SESSION_TOOL_IN_ISOLATED_BODY_CODE);
    expect(dg?.message).toBe("'c' addresses the enclosing conversation and is not available inside a par for body");
  });
});

describe("RFC 0011 §5.5 — I3: a NESTED block expression inside the body is still reached", () => {
  // The nested block sits at a `let`-initialiser site: theta recognises `{`
  // as a block expression only there and at `match`-arm bodies (bug 0082);
  // in statement position `{ context_usage() }` parses as an object literal.
  it("I3: `par for \u2026 { if cond { let u = { context_usage() } } }` fires (nested-block reach)", () => {
    const src =
      fm("context_usage") +
      [
        "let r = par for x in [1] {",
        "  if x == 1 {",
        "    let u = { context_usage() }",
        "    0",
        "  } else {",
        "    0",
        "  }",
        "}",
        "r",
        "",
      ].join("\n");
    const codes = codesOf(src);
    expect(
      codes,
      `RED: expected ${SESSION_TOOL_IN_ISOLATED_BODY_CODE} among ${JSON.stringify(codes)}`,
    ).toContain(SESSION_TOOL_IN_ISOLATED_BODY_CODE);
  });
});

describe("RFC 0011 §5.5 — I4: every one of the three tools fires the same rule", () => {
  it("I4: `session_name(\"x\")` inside a par-for body fires the code", () => {
    const src = fm("session_name") + ["let r = par for x in [1] {", '  session_name("x")', "}", "r", ""].join("\n");
    const codes = codesOf(src);
    expect(
      codes,
      `RED: expected ${SESSION_TOOL_IN_ISOLATED_BODY_CODE} among ${JSON.stringify(codes)}`,
    ).toContain(SESSION_TOOL_IN_ISOLATED_BODY_CODE);
  });
});

// ===========================================================================
// I5/I6 — exempt surfaces (plain `fn` body, `subagent fn` body). Both are RED
// under the sheet's C4 ruling (the flag resets false into a `fn` body, and a
// `subagent fn` body runs in its own child session, FN-6/D2 admission) —
// asserting a NEGATIVE (no such diagnostic) is trivially true TODAY because
// the check does not exist at all yet, so these two cells are declared GREEN
// CONTROLS: they must stay true once the feature lands, and they are NOT
// discriminating cells on their own (see the file header's guard-cell note).
// ===========================================================================

describe("RFC 0011 §5.5 — I5: a plain-fn body called from OUTSIDE any par-for is admitted (green control)", () => {
  it("I5: top-level `fn h() { compact() }`, `h()` called outside a par-for — no isolated-body code", () => {
    const src =
      fm("compact") + ["fn h() {", "  compact()", "}", "let r = h()", "r", ""].join("\n");
    const codes = codesOf(src);
    expect(codes).not.toContain(SESSION_TOOL_IN_ISOLATED_BODY_CODE);
  });
});

describe("RFC 0011 §5.5 — I6: a `subagent fn` body is exempt (its own child session, FN-6/D2) (green control)", () => {
  it("I6: `subagent fn s() { compact() }` (declared) — no isolated-body code", () => {
    const src = fm("compact") + ["subagent fn s() {", "  compact()", "}", 'let r = s("x")', "r", ""].join("\n");
    const codes = codesOf(src);
    expect(codes).not.toContain(SESSION_TOOL_IN_ISOLATED_BODY_CODE);
  });
});

// ===========================================================================
// I7 — an undeclared, unbound callee inside a par-for body: unknown-identifier
// ALONE, never doubled by the isolated-body code (already true today; a
// regression pin for the check's precedence discipline).
// ===========================================================================

describe("RFC 0011 §5.5 — I7: an unbound name inside a par-for body draws unknown-identifier ALONE (green control)", () => {
  it("I7: `par for … { ghost() }`, ghost bound nowhere — unknown-identifier, never isolated-body", () => {
    const src = fm() + ["let r = par for x in [1] {", "  ghost()", "}", "r", ""].join("\n");
    const codes = codesOf(src);
    expect(codes).toContain(UNKNOWN_IDENTIFIER_CODE);
    expect(codes).not.toContain(SESSION_TOOL_IN_ISOLATED_BODY_CODE);
  });
});

// ===========================================================================
// I8 — a local shadow of a runtime-tool name keeps the existing shadowed-
// callable-call verdict ALONE (precedence: arm-1 local wins resolution).
// ===========================================================================

describe("RFC 0011 §5.5 — I8: a local shadow of a runtime-tool name keeps shadowed-callable-call ALONE (green control)", () => {
  it("I8: `let compact = 1` then `par for … { compact() }` with `tools: compact` — shadowed-callable-call, never isolated-body", () => {
    const src =
      fm("compact") + ["let compact = 1", "let r = par for x in [1] {", "  compact()", "}", "r", ""].join("\n");
    const codes = codesOf(src);
    expect(codes).toContain(SHADOWED_CALLABLE_CALL_CODE);
    expect(
      codes,
      `RED-adjacent guard: isolated-body must never co-fire with the shadow verdict, got ${JSON.stringify(codes)}`,
    ).not.toContain(SESSION_TOOL_IN_ISOLATED_BODY_CODE);
  });
});

// ===========================================================================
// I9 — a `fn` declared INSIDE a par-for body is not grammatical at all
// (FN-1 nested-fn); the isolated-body flag never meets a fn declaration on a
// parse-clean document (already true today, unrelated machinery).
// ===========================================================================

describe("RFC 0011 §5.5 — I9: a `fn` declared inside a par-for body is theta/parse/nested-fn, not an isolated-body interaction (green control)", () => {
  it("I9: `fn` nested directly in a par-for body draws theta/parse/nested-fn", () => {
    const src =
      fm("compact") +
      ["let r = par for x in [1] {", "  fn inner() { compact() }", "  inner()", "}", "r", ""].join("\n");
    const codes = codesOf(src);
    expect(codes).toContain(NESTED_FN_CODE);
  });
});

// ===========================================================================
// I10 — an undeclared theta (no `tools:` at all): the frontmatter-derived
// runtime-tool map is empty, so a bare `compact()` call inside a par-for body
// is judged as an ordinary unresolved identifier, never the isolated-body
// code (already true today; the isolated-body rule cannot fire without a
// `tools:` entry to classify the callee as a runtime tool).
// ===========================================================================

describe("RFC 0011 §5.5 — I10: an undeclared theta's par-for body call is unknown-identifier alone (green control)", () => {
  it("I10: no `tools:` field; `par for … { compact() }` — unknown-identifier, never isolated-body", () => {
    const src = fm() + ["let r = par for x in [1] {", "  compact()", "}", "r", ""].join("\n");
    const codes = codesOf(src);
    expect(codes).toContain(UNKNOWN_IDENTIFIER_CODE);
    expect(codes).not.toContain(SESSION_TOOL_IN_ISOLATED_BODY_CODE);
  });
});
