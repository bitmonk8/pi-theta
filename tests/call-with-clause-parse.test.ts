// RFC 0009 (V21a-T) — call-site `with { cwd }` GRAMMAR + AST.
//
// Spec: docs/rfcs/0009-per-call-subagent-cwd.md §Proposal 1 (Surface and
// grammar); grammar.md #call-site-with-clause; invocation.md #options-surface;
// code-registry-parse.md rows `with-clause-unknown-key` /
// `with-clause-in-process-callee`. Seam sheet §1, §2, §3.6(b), matrix rows
// 14-16, V1, V11, V12, and the `.thetalib` parse-time arm.
//
// RED SIGNATURE AT HEAD (one line): the parser recognises `with` ONLY as an
// ordinary identifier (no `CallWithClause` production exists), so a written
// `<call> with { cwd: <expr> }` parses as TWO statements — the bare call
// UNCHANGED, then a SEPARATE junk statement: an object-literal expression
// typed `with` (`theta/parse/unresolved-named-type`, because `with` names no
// declared schema). Every "the clause attaches" / "no diagnostic for an empty
// clause" / "the code fires" assertion below reds against that junk-split
// shape instead.
//
// Driven directly through the real parser (`parseThetaDocument`), inline
// template-literal sources, mirroring `tests/subagent-fn.test.ts`'s harness.

import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}

const FM = ["---", "mode: subagent", "---"].join("\n") + "\n";

const UNRESOLVED_NAMED_TYPE = "theta/parse/unresolved-named-type";
const UNKNOWN_KEY_CODE = "theta/parse/with-clause-unknown-key";
const IN_PROCESS_CALLEE_CODE = "theta/parse/with-clause-in-process-callee";

// ===========================================================================
// Row 16 — AST shape: the clause attaches to the call node, spanning it.
// ===========================================================================

describe("RFC 0009 parse — row 16: a call-site `with { cwd }` clause attaches to the call/invoke node", () => {
  it("`step(1) with { cwd: \"a\" }` produces ONE statement whose call node carries `withClause` (RED — parses as two junk statements today)", () => {
    const doc = parse(FM + 'let x = step(1) with { cwd: "a" }\n@`hi`\n');
    // RED at HEAD: `with` is recognised nowhere near the call, so the source
    // splits into a `let` statement (the bare call) and a SEPARATE `expr`
    // statement (the junk `with { ... }` object literal) — two statements
    // where the future grammar produces one.
    expect(
      doc.body.statements.length,
      `RED: at HEAD the clause does not attach — the source splits into ` +
        `${doc.body.statements.length} statements instead of the one the ` +
        `attached clause implies. statements: ${JSON.stringify(doc.body.statements.map((s) => s.kind))}`,
    ).toBe(1);
    const letStmt = doc.body.statements[0] as unknown as { init: { withClause?: unknown } };
    expect(letStmt.init.withClause, "RED: the call node carries no `withClause` at HEAD").toBeDefined();
  });
});

// ===========================================================================
// Row 14 — negative recognition positions (guard: unaffected before/after).
// ===========================================================================

describe("RFC 0009 parse — row 14: `with` is NOT recognised at a method-call / result-ctor / post-`?` position (guard)", () => {
  it("method call `t.m(a) with { ... }` — `with` stays an ordinary identifier, no clause node anywhere (green guard)", () => {
    const doc = parse(FM + 'let y = "a".trim() with { cwd: "x" }\n@`hi`\n');
    const letStmt = doc.body.statements[0] as unknown as { init: unknown };
    expect((letStmt.init as { withClause?: unknown }).withClause).toBeUndefined();
  });

  it("result-ctor `Ok(x) with { ... }` — not a recognition position, no clause node (green guard)", () => {
    const doc = parse(FM + 'let y = Ok(1) with { cwd: "x" }\n@`hi`\n');
    const letStmt = doc.body.statements[0] as unknown as { init: unknown };
    expect((letStmt.init as { withClause?: unknown }).withClause).toBeUndefined();
  });
});

// ===========================================================================
// Row 12c — a clause-free call is unaffected (guard).
// ===========================================================================

describe("RFC 0009 parse — row 12c: a clause-free call parses exactly as before (guard)", () => {
  it("`step(1)` alone carries no `withClause` and produces no with-clause diagnostic (green guard)", () => {
    const doc = parse(FM + "let x = step(1)\n@`hi`\n");
    const letStmt = doc.body.statements[0] as unknown as { init: unknown };
    expect((letStmt.init as { withClause?: unknown }).withClause).toBeUndefined();
    expect(codesOf(doc)).not.toContain(UNKNOWN_KEY_CODE);
    expect(codesOf(doc)).not.toContain(IN_PROCESS_CALLEE_CODE);
  });
});

// ===========================================================================
// Row 15 — declaration-site clause is untouched (guard).
// ===========================================================================

describe("RFC 0009 parse — row 15: the declaration-site `subagent fn f() with { junk }` keeps its own frontmatter-shaped warning (guard)", () => {
  it("an unknown declaration-site `with` key stays theta/load/unknown-frontmatter-field, never the new parse-error code (green guard)", () => {
    const doc = parse(FM + "subagent fn step() with { junk: 1 } { 1 }\n@`hi`\n");
    expect(codesOf(doc)).toContain("theta/load/unknown-frontmatter-field");
    expect(codesOf(doc)).not.toContain(UNKNOWN_KEY_CODE);
  });
});

// ===========================================================================
// V1 — unknown key, `.theta`-host alone-firing half.
// ===========================================================================

describe("RFC 0009 parse — V1: an unknown call-site clause key draws theta/parse/with-clause-unknown-key", () => {
  it("`f(1) with { cwdd: t }` draws the unknown-key code (RED — no such code exists yet; today it is `unresolved-named-type`)", () => {
    const doc = parse(FM + 'let x = step(1) with { cwdd: "a" }\n@`hi`\n');
    expect(
      codesOf(doc),
      `RED at HEAD: got ${JSON.stringify(codesOf(doc))} instead of the unknown-key code`,
    ).toContain(UNKNOWN_KEY_CODE);
  });
});

// ===========================================================================
// V11 — duplicate `cwd` keys parse without error (both recorded, source order).
// ===========================================================================

describe("RFC 0009 parse — V11: duplicate `cwd` keys in one clause both parse, no diagnostic", () => {
  it("`with { cwd: a, cwd: b }` parses as ONE clause with TWO `cwd` fields, no error (RED — today it is two junk statements + unresolved-named-type)", () => {
    const doc = parse(FM + 'let x = step(1) with { cwd: "a", cwd: "b" }\n@`hi`\n');
    expect(doc.body.statements.length, "RED: the source splits into junk statements at HEAD").toBe(1);
    const letStmt = doc.body.statements[0] as unknown as {
      init: { withClause?: { fields: readonly { key: string }[] } };
    };
    const fields = letStmt.init.withClause?.fields ?? [];
    expect(fields.filter((f) => f.key === "cwd")).toHaveLength(2);
    expect(codesOf(doc)).not.toContain(UNRESOLVED_NAMED_TYPE);
  });
});

// ===========================================================================
// V12 — an empty clause `with { }` is a tolerant no-op: no diagnostic.
// ===========================================================================

describe("RFC 0009 parse — V12: an empty clause `with { }` is a no-op (no diagnostic, absent-clause semantics)", () => {
  it("`step(1) with { }` produces no with-clause-shaped diagnostic (RED — today `unresolved-named-type` fires for the junk `with` object)", () => {
    const doc = parse(FM + "let x = step(1) with { }\n@`hi`\n");
    expect(
      codesOf(doc),
      `RED at HEAD: got ${JSON.stringify(codesOf(doc))}, expected no with-clause-shaped diagnostic`,
    ).not.toContain(UNRESOLVED_NAMED_TYPE);
  });
});

// ===========================================================================
// finding-1: an enum reference INSIDE a call-site clause value is judged by
// the same variant-access rule as everywhere else (schemas.md #Variant
// access) — the clause walk must reach it via the "call" arm's
// `callWithClauseValues` inclusion (seam sheet §1 walker obligation). RED
// SIGNATURE (this cell only): red iff the walker that reaches `Enum.Variant`
// member checks does NOT recurse into `withClause.fields[*].value` for a
// `case "call"` node — the analyst's parallel walkExpr call-arm fix is what
// wires that recursion; until it lands in this tree, `doc.diagnostics`
// carries no `unknown-variant` code and this assertion reds. Per the task:
// note this cell red iff the fix has not yet landed in the working tree.
// ===========================================================================

describe("RFC 0009 parse — finding-1: an unknown enum variant inside a call-site clause value draws theta/parse/unknown-variant", () => {
  it("`step(1) with { cwd: Sev.Bogus }` draws theta/parse/unknown-variant for the clause value's `Sev.Bogus` reference", () => {
    const src =
      FM + "enum Sev { Info, Warn, Error }\n" + 'let x = step(1) with { cwd: Sev.Bogus }\n@`hi`\n';
    const doc = parse(src);
    expect(
      codesOf(doc),
      `expected theta/parse/unknown-variant among ${JSON.stringify(codesOf(doc))} — red iff the clause-value walk does not reach the enum-variant check (analyst's walkExpr call-arm fix not yet landed)`,
    ).toContain("theta/parse/unknown-variant");
  });
});

// ===========================================================================
// finding-6: postfix ordering — the clause attaches BEFORE any other postfix
// (grammar.md #call-site-with-clause), so a trailing `?` wraps the
// clause-bearing call, while a `?` BEFORE the clause leaves `with` an
// ordinary identifier (the recognition hook never runs post-postfix). A
// cross-line clause never attaches (statement-separator boundary).
// ===========================================================================

describe("RFC 0009 parse — finding-6: `with` clause attachment vs. postfix `?` ordering (row 14/16)", () => {
  it("`f(a) with { cwd: t }?` parses as try(call-with-clause): the `?` wraps a `try` node whose operand is the clause-bearing call", () => {
    const doc = parse(FM + 'let x = step(1) with { cwd: "a" }?\n@`hi`\n');
    expect(doc.body.statements.length, `expected one statement, got ${JSON.stringify(doc.body.statements.map((s) => s.kind))}`).toBe(1);
    const letStmt = doc.body.statements[0] as unknown as {
      init: { kind: string; operand?: { kind: string; withClause?: unknown } };
    };
    expect(letStmt.init.kind, "the postfix `?` produces a `try` node wrapping the call").toBe("try");
    expect(letStmt.init.operand?.kind, "the try's operand is the call node").toBe("call");
    expect(
      letStmt.init.operand?.withClause,
      "the clause attaches to the call node UNDER the try, not to the try itself",
    ).toBeDefined();
  });

  it("`f(a)? with { cwd: t }` — the `?` runs first (inside the postfix loop), so the recognition hook never sees a call node; `with` stays an ordinary identifier and NO withClause attaches anywhere", () => {
    const doc = parse(FM + 'let x = step(1)? with { cwd: "a" }\n@`hi`\n');
    // Actual observed parse: after `?` the node is `try(call)`; the hook that
    // recognises `with` runs ONCE, between parsePrimary and the postfix loop,
    // on the bare call node parsePrimary produced — by the time `?` has
    // applied, that recognition position is already past, so `with` is an
    // ordinary identifier at the statement layer and the source splits
    // exactly as an unmodified `with`-less input would (statement-sep
    // boundary at end of line, or a junk-object-literal split, depending on
    // what the trailing `{ ... }` parses as at the statement layer).
    const letStmt = doc.body.statements[0] as unknown as {
      init: { kind: string; operand?: { kind: string; withClause?: unknown }; withClause?: unknown };
    };
    expect(letStmt.init.kind, "the `?` still produces a try node over the bare call").toBe("try");
    expect(
      letStmt.init.operand?.withClause,
      "no withClause ever attaches to the try's operand call node",
    ).toBeUndefined();
    expect((letStmt.init as { withClause?: unknown }).withClause, "no withClause attaches to the try node either").toBeUndefined();
    expect(codesOf(doc)).not.toContain(UNKNOWN_KEY_CODE);
    expect(codesOf(doc)).not.toContain(IN_PROCESS_CALLEE_CODE);
  });

  it("cross-line: a clause on the line AFTER the call does not attach — the lexer's statement separator ends the statement before `with` is reached", () => {
    const doc = parse(FM + 'let x = step(1)\nwith { cwd: "a" }\n@`hi`\n');
    const letStmt = doc.body.statements[0] as unknown as { init: { withClause?: unknown } };
    expect(
      letStmt.init.withClause,
      "a clause on the following source line must NOT attach — the statement separator ends the `let` statement first",
    ).toBeUndefined();
  });
});

// ===========================================================================
// The `.thetalib` parse-time arm (par. 3.6(b)) + its V1 co-fire.
// ===========================================================================

describe("RFC 0009 parse — .thetalib parse-time arm: every clause-bearing bare-ident call in a lib fn body draws with-clause-in-process-callee at the library's OWN parse", () => {
  it("a clause-bearing call inside a .thetalib `fn` body draws the code (RED — no such code exists yet)", () => {
    const doc = parse('fn helper(a) {\n  let x = other(1) with { cwd: "a" }\n  x\n}\n', "lib.thetalib");
    expect(
      codesOf(doc),
      `RED at HEAD: got ${JSON.stringify(codesOf(doc))} instead of the in-process-callee code`,
    ).toContain(IN_PROCESS_CALLEE_CODE);
  });

  it("V1 co-fire on a .thetalib host: an unknown key ALSO draws with-clause-in-process-callee beside it (both parse-time) (RED)", () => {
    const doc = parse('fn helper(a) {\n  let x = other(1) with { cwdd: "a" }\n  x\n}\n', "lib.thetalib");
    const codes = codesOf(doc);
    expect(codes, `RED: got ${JSON.stringify(codes)}`).toContain(UNKNOWN_KEY_CODE);
    expect(codes, `RED: got ${JSON.stringify(codes)}`).toContain(IN_PROCESS_CALLEE_CODE);
  });
});
