import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type {
  SystemNoteChannelDeps,
  SystemNoteSender,
} from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type FnDecl,
  type LetStmt,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";

// Bug 0005 regression — `subagent fn` return-type annotations
// (docs/bugs/0005-subagent-fn-return-annotation-misparse.md, Option 1: fix
// all three symptoms under the Ok-payload reading).
//
// Spec: grammar.md §"`fn` declarations" (`FnDecl ::= SubagentMod? "fn" Ident
// "(" FnParams? ")" (":" ReturnType)? WithClause? FnBody` — the return
// annotation and the `with` clause are BOTH admitted on a `subagent fn`, in
// that order), grammar.md §"Statement termination & newline continuation"
// ("The `?` trigger is the **ternary head only**; the postfix
// error-propagation `?` … is a complete-expression terminator … and never
// continues"), and functions.md FN-3/FN-6 (the return type of a `subagent fn`
// is inferred from the body tail by the same rule as an annotation-less `fn`
// and validated at the subagent boundary; the body's failure channel is the
// boundary `Err`, so a body `?` sits in the same position as a subagent-mode
// `.theta` body's top-level `?`, where it is legal).
//
// The defect cluster, three ways the `(":" ReturnType)?` slot misbehaves:
//
//   (a) `): T with { … }` — `parseType` (src/parser/theta-document.ts) does
//       not stop at the contextual keyword `with`, so the annotation lands on
//       the AST as the concatenated source `stringwith`, the `with` braces
//       parse as the fn BODY, and the real body becomes stray top-level
//       statements: `theta/parse/unknown-identifier: unknown identifier
//       'system'` plus a stray-`:` / bare-object-literal cascade.
//
//   (b) After ANY statement whose line ends in postfix `?`, an ANNOTATED
//       `subagent fn` is not recognised as a declaration. Two-step boundary
//       leak: the lexer's trailing-trigger set (`trailingTriggers`,
//       src/lexer/lexer.ts) includes `?` unconditionally, so the newline
//       after a postfix `?` is swallowed as a would-be ternary continuation;
//       the parser's `isTernaryHead` scan then reads forward for a depth-0
//       `:` before the next separator and — the separator gone — finds the
//       NEXT declaration's return-annotation `:`. The `?` is classified as a
//       ternary head, `subagent` is consumed as the consequent
//       (`theta/parse/unknown-identifier: unknown identifier 'subagent'`),
//       and the modifier is silently dropped. Blank lines do not protect
//       (continuation crosses blank lines). Without the annotation no
//       depth-0 `:` precedes the body block, so the scan answers postfix and
//       the decl parses — which is why the shipped examples sidestep it.
//
//   (c) With the annotation, the body's `?` fires
//       `theta/parse/question-outside-result-fn` (`checkQuestionScope`,
//       src/parser/match-result.ts; scope built by `walkFn` in
//       src/parser/type-layer-checks.ts): the check treats the annotation as
//       a plain-`fn` return type. Under FN-6 the coherent reading of `): T`
//       on a `subagent fn` is "T is the Ok payload" — matching `invoke<T>`
//       and the annotation-less inference — so a `subagent fn` body is a
//       Result scope for the `?` check regardless of annotation, and
//       annotating a function with exactly its inferred type must not change
//       body legality.
//
// The regression pins assert the FIXED behaviour of exactly the bug-doc
// repros (red on 0.13.0, for the documented reasons); the CONTROL pins hold the
// neighbouring behaviour the fix must not disturb — the un-annotated escape
// hatch, the real ternary continuation forms (both trailing- and leading-`?`
// verified parsing today), and the plain-`fn` question-scope check.

// --- seam doubles ---------------------------------------------------------

function recordingDeps(): {
  deps: ParseThetaDocumentDeps;
  delivered: Diagnostic[][];
} {
  const delivered: Diagnostic[][] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      if ("diagnostics" in message.details!) {
        delivered.push([...message.details!.diagnostics]);
      }
    },
  };
  const systemNote: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  // A trivially-resolving `model:` matcher — the frontmatter model hook is not
  // under test here.
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { deps: { systemNote, modelMatcher }, delivered };
}

/** Parse a UTF-8 `.theta` source string into a {@link ThetaDocument}. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const { deps } = recordingDeps();
  const source: ThetaSource = {
    path,
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, deps);
}

// --- assertion helpers ----------------------------------------------------

/** `code: message` render of the document's diagnostics, for diff-friendly emptiness assertions. */
function diagnosticLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.code}: ${d.message}`);
}

/** The document's diagnostic codes (for presence/absence-of-code assertions). */
function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => d.code);
}

/** The single `FnDecl` of the parsed document. */
function onlyFn(doc: ThetaDocument): FnDecl {
  const fns = doc.body.statements.filter((s): s is FnDecl => s.kind === "fn");
  expect(fns.length, "exactly one fn declaration parses into the body").toBe(1);
  return fns[0] as FnDecl;
}

/** The `key` names of a fn's `with { … }` clause, `[]` when absent. */
function withKeys(fn: FnDecl): string[] {
  return (fn.withClause ?? []).map((f) => f.key);
}

/** The top-level `let` statements of the document, in order. */
function topLets(doc: ThetaDocument): LetStmt[] {
  return doc.body.statements.filter((s): s is LetStmt => s.kind === "let");
}

// The annotated body every cell shares: a `@`-query with postfix `?`, then
// the binding as the tail — the exact shape from the bug doc's repros.
const annotatedHelper = [
  "subagent fn helper(a: string): string {",
  "  let rep = @`Echo ${a}`?",
  "  rep",
  "}",
];

// --------------------------------------------------------------------------
// Regression pins — the bug-doc repros, asserting the FIXED behaviour
// --------------------------------------------------------------------------

describe("bug 0005 regression — `subagent fn` return annotation with `with` clause (symptom a)", () => {
  // The bug doc's (a) repro: annotation AND `with` clause together.
  const annotatedWith = [
    'subagent fn s(a: string): string with { system: "terse" } {',
    "  let v = @`Echo ${a}`?",
    "  v",
    "}",
  ].join("\n");

  it("(1) `): string with { … }` parses with zero diagnostics — no unknown-identifier 'system' cascade", () => {
    // grammar.md §"`fn` declarations": `(":" ReturnType)? WithClause?` are
    // consecutive optional slots. The broken parse consumed `with` into the
    // type (`stringwith`), took the `with` braces as the body, and fired
    // `unknown identifier 'system'` + stray-`:` + bare-object-literal +
    // backtick-in-value-position through what was left.
    const doc = parse(annotatedWith);
    expect(diagnosticLines(doc)).toEqual([]);
  });

  it("(1) `): string with { … }` parses as ONE FnDecl: returnType exactly 'string', withClause key 'system', real body intact", () => {
    // Fixed shape: the type stops at `with`, the clause lands on
    // `withClause`, and the braces after the clause are the body — the real
    // body must NOT spill into stray top-level statements (the broken parse
    // produced ['fn', 'expr']).
    const doc = parse(annotatedWith);
    expect(doc.body.statements.map((s) => s.kind)).toEqual(["fn"]);

    const fn = onlyFn(doc);
    expect(fn.name).toBe("s");
    expect(fn.params).toEqual([{ name: "a", type: "string" }]);
    expect(fn.returnType, "the annotation is 'string', not 'stringwith'").toBe(
      "string",
    );
    expect(fn.subagent).toBe(true);
    expect(withKeys(fn)).toEqual(["system"]);

    // The REAL body (let + tail) parsed as the body, not the with-braces.
    const bodyLets = fn.body.statements.filter(
      (s): s is LetStmt => s.kind === "let",
    );
    expect(bodyLets.map((l) => l.name)).toEqual(["v"]);
  });
});

describe("bug 0005 regression — annotated `subagent fn` after a postfix-`?` statement (symptom b)", () => {
  it("(2) bug-doc repro: after `invoke<string>(…)?` the annotated decl is recognised — no unknown-identifier 'subagent'", () => {
    // grammar.md §"Statement termination & newline continuation": the postfix
    // `?` is a complete-expression terminator and never continues. The leak
    // classified it as a ternary head, consumed `subagent` as the consequent
    // (`unknown identifier 'subagent'`), and dropped the modifier.
    // (An unresolved invoke callee path produces no diagnostics at the
    // `parseThetaDocument` surface — load resolution is a separate pass — so
    // zero total diagnostics is the fixed expectation.)
    const doc = parse(
      [
        'let x = "x"',
        'let child_ack = invoke<string>("./worker.theta", x)?',
        ...annotatedHelper,
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    // Three top-level statements; the boundary after the `?` held, so
    // `child_ack` binds the postfix-`?` form (kind "try"), not a ternary.
    expect(doc.body.statements.map((s) => s.kind)).toEqual([
      "let",
      "let",
      "fn",
    ]);
    const childAck = topLets(doc).find((l) => l.name === "child_ack");
    expect(childAck?.init?.kind).toBe("try");

    const fn = onlyFn(doc);
    expect(fn.subagent, "the `subagent` modifier is kept, not dropped").toBe(
      true,
    );
    expect(fn.returnType).toBe("string");
  });

  it("(2) matrix row: after non-generic `invoke(…)?` the annotated decl is recognised — the generic argument is incidental", () => {
    // The bug doc's control matrix row: `non-generic invoke(…)? | : string |
    // unknown identifier 'subagent' + (c)` — the Analysis calls the generic
    // argument incidental, so the keyword loss (and its fix) must hold with
    // the `<string>` dropped. Same fixed expectation as the generic cell
    // above.
    const doc = parse(
      [
        'let x = "x"',
        'let child_ack = invoke("./worker.theta", x)?',
        ...annotatedHelper,
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    // Three top-level statements; the boundary after the `?` held, so
    // `child_ack` binds the postfix-`?` form (kind "try"), not a ternary.
    expect(doc.body.statements.map((s) => s.kind)).toEqual([
      "let",
      "let",
      "fn",
    ]);
    const childAck = topLets(doc).find((l) => l.name === "child_ack");
    expect(childAck?.init?.kind).toBe("try");

    const fn = onlyFn(doc);
    expect(fn.subagent, "the `subagent` modifier is kept, not dropped").toBe(
      true,
    );
    expect(fn.returnType).toBe("string");
  });

  it("(3) plain-query trigger: after `let v = @`…`?` the annotated decl is recognised", () => {
    // The bug doc's control matrix: the generic argument is incidental — a
    // plain query ending in postfix `?` triggers the same keyword loss.
    const doc = parse(["let v = @`ping`?", ...annotatedHelper].join("\n"));
    expect(codesOf(doc)).not.toContain("theta/parse/unknown-identifier");
    expect(diagnosticLines(doc)).toEqual([]);

    const fn = onlyFn(doc);
    expect(fn.subagent).toBe(true);
    expect(fn.returnType).toBe("string");
  });

  it("(4) blank-line variant: a blank line between the `?` statement and the decl does not protect — the decl must still be recognised", () => {
    // grammar.md: "Blank lines do not break a continuation" — so the blank
    // line must NOT be relied on as a boundary; the fix has to stop the
    // continuation at the postfix `?` itself.
    const doc = parse(
      ["let v = @`ping`?", "", ...annotatedHelper].join("\n"),
    );
    expect(codesOf(doc)).not.toContain("theta/parse/unknown-identifier");
    expect(diagnosticLines(doc)).toEqual([]);

    const fn = onlyFn(doc);
    expect(fn.subagent).toBe(true);
    expect(fn.returnType).toBe("string");
  });
});

describe("bug 0005 regression — body `?` under an explicit annotation (symptom c)", () => {
  it("(5) `subagent fn …: string` with a body `?` parses with zero diagnostics — no question-outside-result-fn", () => {
    // functions.md FN-6: the body's failure channel is the boundary `Err`
    // (the same position as a subagent-mode `.theta` body, where top-level
    // `?` is legal), and `): T` reads as "T is the Ok payload". Annotating
    // with exactly the inferred type must not change body legality — today
    // dropping `: string` makes the identical body parse and run.
    const doc = parse(annotatedHelper.join("\n"));
    expect(codesOf(doc)).not.toContain(
      "theta/parse/question-outside-result-fn",
    );
    expect(diagnosticLines(doc)).toEqual([]);

    const fn = onlyFn(doc);
    expect(fn.subagent).toBe(true);
    expect(fn.returnType).toBe("string");
  });
});

// --------------------------------------------------------------------------
// Controls — neighbouring behaviour the fix must not disturb (green today)
// --------------------------------------------------------------------------

describe("bug 0005 regression — controls: boundary, continuation and question-scope neighbours", () => {
  it("(6) no-trailing-`?` control: after `invoke<string>(…)` WITHOUT `?`, the annotated decl is recognised (keyword recognition only)", () => {
    // The bug doc's control matrix: dropping only the trailing `?` clears the
    // keyword loss — this cell exhibits only symptom (c), whose fixed
    // behaviour cell (5) owns. Pinned here: recognition (no
    // unknown-identifier 'subagent'; modifier kept) — green today and after.
    const doc = parse(
      [
        'let x = "x"',
        'let child_ack = invoke<string>("./worker.theta", x)',
        ...annotatedHelper,
      ].join("\n"),
    );
    expect(codesOf(doc)).not.toContain("theta/parse/unknown-identifier");

    const fn = onlyFn(doc);
    expect(fn.subagent).toBe(true);
    expect(fn.returnType).toBe("string");
  });

  it("(7) un-annotated escape hatch: a `subagent fn` WITHOUT the annotation after a `?`-ending statement keeps parsing clean", () => {
    // Without the annotation no depth-0 `:` precedes the body block, so the
    // ternary-head scan answers postfix and the decl parses — the workaround
    // the shipped examples use. The fix must not regress it.
    const doc = parse(
      [
        "let v = @`ping`?",
        "subagent fn helper(a: string) {",
        "  let rep = @`Echo ${a}`?",
        "  rep",
        "}",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    // The boundary held: `v` binds the postfix-`?` form, and the decl kept
    // its modifier with no annotation recorded.
    expect(topLets(doc)[0]?.init?.kind).toBe("try");
    const fn = onlyFn(doc);
    expect(fn.subagent).toBe(true);
    expect(fn.returnType).toBeNull();
  });

  it("(8) real ternary continuation, trailing form: `true ?` at line end continues into `\"a\" : \"b\"` as one statement", () => {
    // grammar.md continuation-trigger table: a trailing `?` AS TERNARY HEAD
    // is a documented trigger. The fix must keep joining this form (verified
    // parsing today) while refusing the postfix-`?` form.
    const doc = parse(["let t = true ?", '  "a" : "b"', "t"].join("\n"));
    expect(diagnosticLines(doc)).toEqual([]);

    const t = topLets(doc).find((l) => l.name === "t");
    expect(t?.init?.kind).toBe("ternary");
  });

  it("(8) real ternary continuation, leading form: a next line beginning `? \"a\" : \"b\"` continues the previous statement", () => {
    // grammar.md continuation-trigger table: a LEADING binary/ternary
    // operator on the next non-blank line is also a trigger (verified
    // parsing today).
    const doc = parse(
      ["let cond = true", "let t = cond", '  ? "a" : "b"', "t"].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    expect(doc.body.statements.filter((s) => s.kind === "let").length).toBe(2);
    const t = topLets(doc).find((l) => l.name === "t");
    expect(t?.init?.kind).toBe("ternary");
  });

  it("(9) plain fn scope check stays: `fn f(…): string` with a body `?` still fires question-outside-result-fn", () => {
    // The (c) fix is scoped to `subagent fn` bodies (FN-6's boundary-Err
    // reading). A PLAIN fn annotated with a non-Result type keeps rejecting
    // body `?` — its failure channel really is its return type.
    const doc = parse(
      [
        "fn f(a: string): string {",
        "  let v = @`Echo ${a}`?",
        "  v",
        "}",
      ].join("\n"),
    );
    expect(codesOf(doc)).toContain("theta/parse/question-outside-result-fn");
  });

  it("(10) plain fn with a Result annotation: `fn f(…): Result<string, QueryError>` accepts a body `?` (verified today)", () => {
    // `isResultAnnotation` (src/parser/type-layer-checks.ts) marks a
    // `Result<…>` annotation result-compatible, so the body `?` is in scope.
    // Verified parsing clean today; pinned so the (c) rework of the scope
    // check cannot lose the plain-fn Result arm.
    const doc = parse(
      [
        "fn f(a: string): Result<string, QueryError> {",
        "  let v = @`Echo ${a}`?",
        "  v",
        "}",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// Stage-2 additions — the (c) fix's annotation-vs-inferred-Ok-payload
// validation. Under the Ok-payload reading, `): T` on a `subagent fn` is the
// `invoke<T>` analogue (FN-6 equates the subagent-fn boundary with `invoke`),
// so the annotation is validated against the FN-3-inferred Ok payload through
// the existing invoke typed-return machinery and its existing code
// (`theta/parse/invoke-return-type-mismatch`) — firing only on a DEFINITE
// mismatch (a statically-unresolvable payload defers to the runtime AJV
// boundary net, exactly like an unresolvable `invoke<Schema>` operand).
// --------------------------------------------------------------------------

describe("bug 0005 fix — `subagent fn` annotation validated against the inferred Ok payload (symptom c)", () => {
  it("(11) definite mismatch: `subagent fn f(): number` with a string-literal tail fires invoke-return-type-mismatch — a diagnostic, not a crash", () => {
    // The inferred Ok payload (a string literal, statically resolvable) is
    // not `⊑ number`, so the boundary check fires the reused invoke
    // typed-return code — and ONLY it: no question-outside-result-fn, no
    // parse cascade.
    const doc = parse(
      ["subagent fn f(): number {", '  "abc"', "}"].join("\n"),
    );
    expect(codesOf(doc)).toEqual(["theta/parse/invoke-return-type-mismatch"]);
  });

  it("(12) statically-unresolvable payload: a bare-query tail under `): string` fires NO mismatch", () => {
    // A query result classifies as an unresolved `named` reference past the
    // parser's static view (`typeOf` / `questionOperandKind` treat it as
    // deferred), so the `⊑` relation answers "unknown" and the check stays
    // silent — the runtime AJV boundary check is the net, never a parse-time
    // false positive.
    const doc = parse(
      ["subagent fn f(a: string): string {", "  @`Echo ${a}`?", "}"].join(
        "\n",
      ),
    );
    expect(diagnosticLines(doc)).toEqual([]);
  });

  it("(13) exact-match happy path: `subagent fn f(): string` with a string-literal tail and a body `?` — zero diagnostics", () => {
    // The inferred Ok payload (string) matches the annotation exactly, and
    // the body `?` is admissible under the (c) fix's Result scope — the
    // fully-annotated form of the FN-6 idiom parses clean end to end.
    const doc = parse(
      [
        "subagent fn f(a: string): string {",
        "  let rep = @`Echo ${a}`?",
        '  "ok"',
        "}",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);
  });
});
