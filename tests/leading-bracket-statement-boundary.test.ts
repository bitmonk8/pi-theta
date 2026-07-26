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
  type Block,
  type Expr,
  type FnDecl,
  type LetStmt,
  type MatchExpr,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";

// Bug 0006 regression — a leading-`[` line begins a new statement
// (docs/bugs/0006-leading-bracket-glued-as-index-access.md, Option 1).
//
// Spec: grammar.md §Blocks (`ThetaBody ::= Stmt* Expr?` — a trailing
// array-literal expression is a legal block tail), §"Statement termination &
// newline continuation" (a leading `[` is NOT a continuation trigger; no
// documented rule joins a next-line `[` to the previous statement), and
// §"match arm body" (`MatchArm ::= Pattern "=>" ArmBody`, `ArmBody ::= Expr |
// BlockExpr`). Rule under test: index access (expressions.md §"Index
// access") must OPEN ON THE SAME LINE as its receiver's end — a `[` that
// begins a line begins a new statement.
//
// The defect: `BodyParser.parsePostfix` (src/parser/theta-document.ts)
// consumed any `[` after a complete expression as index access with no
// same-line check, and inside any block (`fn` / control-flow body — bracket
// depth > 0) the lexer's `collapseContinuations` had already swallowed the
// newline, so a next-line array literal glued onto the previous statement's
// trailing expression: `let a = "x"` ⧵n `["a", a]` mis-parsed as `"x"["a"`
// and fired `theta/parse/non-indexable-receiver` plus a stray-token cascade
// (`theta/parse/unsupported-feature`: stray ',' / stray ']'). The same
// consumption site glued comma-less `match` arms (`[] => "E"` ⧵n `["a"] =>
// "A"` parsed `"E"["a"]`).
//
// The regression tests pin the fixed parse of exactly those shapes (zero
// diagnostics, `let` initialisers of kind "string" / "ident" where the glue
// produced "index", the block-tail array present, three `match` arms); the
// CONTROL tests pin the neighbouring behaviour the same-line rule must not
// disturb (same-line index access, open-bracket spill continuation, the
// bind-then-return workaround).

// --- seam doubles ---------------------------------------------------------

function recordingDeps(): {
  deps: ParseThetaDocumentDeps;
  delivered: Diagnostic[][];
} {
  const delivered: Diagnostic[][] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      if ("diagnostics" in message.details) {
        delivered.push([...message.details.diagnostics]);
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

/**
 * A block's trailing expression under the parser's dual encoding: the
 * promoted `tail`, or the final `ExprStmt`'s expression. The two encodings
 * are runtime-equivalent by design (src/runtime/statement-executor.ts — "the
 * executor's final value [is] invariant to the tail-vs-`expr`-statement
 * encoding"), and a fn-body trailing expression lands as an `ExprStmt` (the
 * block-internal `stmt-sep` is swallowed, so tail promotion's `lineStart`
 * never fires). Asserting through this helper keeps the tests pinned to what
 * bug 0006 is about — the array literal is a STANDALONE trailing expression,
 * not postfix on its predecessor — without over-pinning which encoding the
 * parser picks.
 */
function trailingExpr(block: Block): Expr | null {
  if (block.tail !== null) {
    return block.tail;
  }
  const last = block.statements[block.statements.length - 1];
  return last !== undefined && last.kind === "expr" ? last.expr : null;
}

/** The single `FnDecl` of the parsed document. */
function onlyFn(doc: ThetaDocument): FnDecl {
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn");
  expect(fn, "the fn declaration parses into the body").toBeDefined();
  return fn as FnDecl;
}

/** The `let` statements of a block, in order. */
function letsOf(block: Block): LetStmt[] {
  return block.statements.filter((s): s is LetStmt => s.kind === "let");
}

// --------------------------------------------------------------------------
// Regression pins — the shapes the gluing mis-parsed
// --------------------------------------------------------------------------

describe("bug 0006 regression — a leading-[ line begins a new statement", () => {
  // The bug doc's primary reproduction: an array literal in fn-body
  // tail-expression position, on the line after a completed `let`.
  const fnTailArray = [
    "fn f(): array<string> {",
    '  let a = "x"',
    '  ["a", a]',
    "}",
  ].join("\n");

  it("(i) fn-body tail array after a completed let: no non-indexable-receiver, no stray-token cascade", () => {
    // grammar.md §Blocks: the array literal is a legal block tail. The glue
    // read `"x"["a"` as index access and fired
    // `theta/parse/non-indexable-receiver` ("indexed access requires an
    // array<T> or object receiver; got string") plus stray ',' / stray ']'
    // `theta/parse/unsupported-feature` errors two lines from the real
    // construct. The fixed parse is diagnostic-free, matching the workaround
    // control (v) — the identical fn shape with the array bound first.
    const doc = parse(fnTailArray);
    expect(diagnosticLines(doc)).toEqual([]);
  });

  it("(i) fn-body tail array after a completed let: the let keeps its string initialiser and the array is the trailing expression", () => {
    // Fixed shape: `let a = "x"` is one statement (init kind "string" — NOT
    // an "index" node reading `"x"["a"`), and the two-element array literal
    // is the body's trailing expression (FN-5 final value).
    const doc = parse(fnTailArray);
    const fn = onlyFn(doc);

    const lets = letsOf(fn.body);
    expect(lets.length).toBe(1);
    expect(lets[0]?.name).toBe("a");
    expect(lets[0]?.init?.kind).toBe("string");

    const tail = trailingExpr(fn.body);
    expect(tail?.kind).toBe("array");
    if (tail?.kind === "array") {
      expect(tail.elements.length).toBe(2);
      expect(tail.elements.map((e) => e.kind)).toEqual(["string", "ident"]);
    }
  });

  it("(iii) cross-line receiver: `let y = arr` then a next-line `[0]` tail — y binds the ident, the array is a new statement", () => {
    // The silent variant: the receiver IS indexable (`arr` is an array), so
    // the glue produced NO diagnostic — `y` just wrongly bound `arr[0]`
    // (init kind "index") and the fn lost its tail. Under the same-line rule
    // the `[0]` that begins a line begins a new statement: `y` binds the
    // identifier reference and the one-element array literal is the fn's
    // legal tail (fn returns array<integer>, so `[0]` is a realistic tail
    // value).
    const doc = parse(
      [
        "fn g(): array<integer> {",
        "  let arr = [1, 2]",
        "  let y = arr",
        "  [0]",
        "}",
      ].join("\n"),
    );
    // The glued parse was diagnostic-free too — the regression signal here
    // is the AST shape, not diagnostics (that silence is exactly why the
    // glue was dangerous).
    expect(diagnosticLines(doc)).toEqual([]);

    const fn = onlyFn(doc);
    const lets = letsOf(fn.body);
    expect(lets.length).toBe(2);
    const y = lets.find((l) => l.name === "y");
    expect(y?.init?.kind).toBe("ident");
    if (y?.init?.kind === "ident") {
      expect(y.init.name).toBe("arr");
    }

    const tail = trailingExpr(fn.body);
    expect(tail?.kind).toBe("array");
    if (tail?.kind === "array") {
      expect(tail.elements.length).toBe(1);
      expect(tail.elements[0]?.kind).toBe("number");
    }
  });

  it("(iv) comma-less match arms with leading-[ array patterns parse as three arms, not a glued index", () => {
    // grammar.md §"match arm body": `MatchArm ::= Pattern "=>" ArmBody`; the
    // arm comma is optional (newline-separated arms are in circulation).
    // `parsePostfix` glued the next arm's array pattern onto the previous
    // arm's body — `[] => "E"` ⧵n `["a"] => "A"` parsed `"E"["a"]` — firing
    // `theta/parse/non-indexable-receiver` and shredding the arm list
    // (4 arms: one with an "index" body, one bodiless wildcard). Under the
    // same-line rule the leading-`[` line starts the next arm's pattern and
    // the parse is diagnostic-free (the scrutinee is bound first, so nothing
    // else is in play).
    const doc = parse(
      [
        'let xs = ["a"]',
        "let r = match xs {",
        '  [] => "E"',
        '  ["a"] => "A"',
        '  _ => "other"',
        "}",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    const r = letsOf(doc.body).find((l) => l.name === "r");
    const m = r?.init as MatchExpr | undefined;
    expect(m?.kind).toBe("match");
    expect(m?.arms.length).toBe(3);
    expect(m?.arms.map((a) => a.pattern.kind)).toEqual([
      "array",
      "array",
      "wildcard",
    ]);
    // Every arm body is its own string literal — none glued into an index.
    expect(m?.arms.map((a) => a.body.kind)).toEqual([
      "string",
      "string",
      "string",
    ]);
  });
});

// --------------------------------------------------------------------------
// Controls — behaviour the same-line rule must not disturb
// --------------------------------------------------------------------------

describe("bug 0006 regression — controls: same-line and continuation index access keep parsing", () => {
  it("(ii) same-line index access still parses as an index node", () => {
    // expressions.md §"Index access": `arr[0]` with the `[` on the
    // receiver's line is ordinary postfix index access. The same-line rule
    // must not disturb it.
    const doc = parse(['let arr = ["a", "b"]', "let x = arr[0]"].join("\n"));
    expect(diagnosticLines(doc)).toEqual([]);

    const x = letsOf(doc.body).find((l) => l.name === "x");
    expect(x?.init?.kind).toBe("index");
    if (x?.init?.kind === "index") {
      expect(x.init.target.kind).toBe("ident");
      expect(x.init.index.kind).toBe("number");
    }
  });

  it("(ii) same-line index access inside a fn body still parses as an index node", () => {
    // The fix site (parsePostfix) runs identically inside blocks — the
    // same-line form must keep working where the bug bit.
    const doc = parse(
      [
        "fn pick(): string {",
        '  let arr = ["a", "b"]',
        "  let x = arr[0]",
        "  x",
        "}",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    const fn = onlyFn(doc);
    const x = letsOf(fn.body).find((l) => l.name === "x");
    expect(x?.init?.kind).toBe("index");
  });

  it("(open-bracket spill) an index whose `[` opens on the receiver's line may spill its index to later lines", () => {
    // grammar.md §"Statement termination & newline continuation": an open
    // `[` swallows newlines until its `]` — open-bracket continuation. The
    // same-line rule keys on the LINE THE `[` OPENS ON, so this form (the
    // `[` on the receiver's line, the index expression spilled) must keep
    // parsing as index access.
    const doc = parse(
      ['let arr = ["a", "b"]', "let x = arr[", "  0", "]"].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    const x = letsOf(doc.body).find((l) => l.name === "x");
    expect(x?.init?.kind).toBe("index");
    if (x?.init?.kind === "index") {
      expect(x.init.index.kind).toBe("number");
    }
  });

  it("(v) the bind-then-return workaround keeps parsing: array bound to a let, identifier tail", () => {
    // The workaround in circulation (bug doc §Reproduction): binding the
    // array first and returning the binding always parsed with zero
    // diagnostics — the fix must not regress it.
    const doc = parse(
      [
        "fn h(): array<string> {",
        '  let a = "x"',
        '  let out = ["a", a]',
        "  out",
        "}",
      ].join("\n"),
    );
    expect(diagnosticLines(doc)).toEqual([]);

    const fn = onlyFn(doc);
    const out = letsOf(fn.body).find((l) => l.name === "out");
    expect(out?.init?.kind).toBe("array");

    const tail = trailingExpr(fn.body);
    expect(tail?.kind).toBe("ident");
    if (tail?.kind === "ident") {
      expect(tail.name).toBe("out");
    }
  });
});
