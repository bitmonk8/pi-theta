import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ThetaDocument,
  type ThetaBody,
  type Expr,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import {
  StaticTypeInferencePass,
  type StaticTypeInferenceDeps,
} from "../src/parser/static-type-inference";
import {
  checkCompatible,
  displayType,
  type CompatType,
  type TypeEnv,
} from "../src/parser/type-compat";
import {
  executeBody,
  type CheckpointDescriptor,
  type ExecuteBodyDeps,
  type StatementEvalHost,
} from "../src/runtime/statement-executor";
import {
  buildEnvironment,
  type LexicalEnvironment,
} from "../src/runtime/lexical-environment";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { OperationResult } from "../src/runtime/cancellation-core";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import { isResultValue, type ThetaValue } from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import { HostFatal, IndexOutOfBoundsPanic } from "../src/runtime/runtime-panics";

// ===========================================================================
// RFC 0003 (`par for`) — test-first (RED) obligation suite.
// ===========================================================================
//
// Feature spec (normative):
//   - control-flow.md §"Parallel fan-out — `par for`" (anchor #par-for),
//     CTRL-2 (scheduling & width throttle), CTRL-3 (value & ordering),
//     CTRL-4 (body restrictions), CTRL-5 (run-to-completion & cancellation).
//   - grammar.md §Blocks (`ParForExpr` / `MaxClause` / `ParForBody`), §"Contextual
//     keywords" (`par` recognised only before `for`).
//   - errors-and-results.md ERR-20 (anchor #err-20) — the `par for` iteration
//     boundary is a panic-downgrade point.
//   - hard-ceilings.md §"`par for` width throttle" (anchor #par-for-width-throttle),
//     NOCEIL-5 — the throttle is NOT a routing-class ceiling.
//   - diagnostics.md — `theta/parse/par-query-in-body`,
//     `theta/parse/par-shared-mutation`, `theta/parse/par-break-continue`.
//   - RFC: rfcs/0003-parallel-fanout.md.
//
// Discipline: this suite is written BEFORE the implementation. `par for` is
// absent from src/ today, so every test here is expected to be RED for the
// "feature-not-implemented" reason (a `par for` source mis-parses to an
// identifier `par` followed by a plain `for` statement, produces no `par-for`
// AST node, emits none of the four body-restriction diagnostics, and is not
// fanned-out at runtime). The paired implementation stage turns them green.
//
// One test is a deliberate NON-REGRESSION GUARD that is GREEN both now and
// post-implementation (an identifier named `par` used away from `for` must keep
// parsing); it is labelled as such.
//
// All tests drive the real, stable public surfaces only — `parseThetaDocument`
// (never throws; aggregates diagnostics), `StaticTypeInferencePass` (read-only),
// and `executeBody` (the tree-walking driver). No src/ module is modified. Where
// a runtime observation needs a hook the current executor does not yet route
// through (concurrency width, child-diagnostic drain), the test is written
// against the intended observable behaviour and the required hook is documented
// in a comment and in the handoff notes.

// --- Assumed `par for` AST node shape (implementer must honour) ------------
//
// Grammar: `ParForExpr ::= "par" "for" Ident "in" Expr MaxClause? ParForBody`.
// This suite assumes the parser lowers a `par for` to an expression node:
//
//   { kind: "par-for",
//     variable: string,        // the loop `Ident`
//     iterand: Expr,           // the `array<T>` expression after `in`
//     max: Expr | null,        // the `MaxClause` operand, or null when absent
//     body: Block,             // the `ParForBody` (Stmt* Expr?)
//     range: SourceRange }
//
// and that this node is a member of the `Expr` union. Assertions below match on
// `kind === "par-for"` and read `.variable` / `.iterand` / `.max` / `.body`.

// --- parse harness ---------------------------------------------------------

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}

// --- generic AST search ----------------------------------------------------

interface KindedNode {
  readonly kind: string;
  readonly [key: string]: unknown;
}

/**
 * Collect every AST object of the given `kind` anywhere under `root` (a deep
 * own-enumerable-property walk). Used to locate the assumed `par-for` node
 * regardless of where it sits (let-RHS, expression statement, tail, nested).
 */
function collectByKind(root: unknown, kind: string): KindedNode[] {
  const out: KindedNode[] = [];
  const seen = new Set<unknown>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.kind === "string" && obj.kind === kind) {
      out.push(obj as KindedNode);
    }
    for (const key of Object.keys(obj)) {
      visit(obj[key]);
    }
  };
  visit(root);
  return out;
}

/** All `par-for` nodes in a parsed body. */
function parForNodes(body: ThetaBody): KindedNode[] {
  return collectByKind(body, "par-for");
}

// ===========================================================================
// LEXER / PARSER — `par` contextual keyword (grammar.md §"Contextual keywords")
// ===========================================================================

describe("RFC-0003 par-for — `par` is a contextual keyword", () => {
  // NON-REGRESSION GUARD (green now AND post-implementation): `par` is not a
  // reserved keyword, so an identifier named `par` used away from `for` keeps
  // parsing. This must not regress when the contextual keyword lands.
  it("grammar#contextual-keywords: an identifier named `par` parses when not before `for` (guard — green now)", () => {
    const codes = codesOf(["let par = 1", "let n = par + 1", "n"].join("\n"));
    expect(
      codes,
      "an identifier named `par` used away from `for` must keep parsing (no reserved-keyword / unknown-identifier error)",
    ).not.toContain("theta/parse/reserved-keyword-as-identifier");
    expect(codes).not.toContain("theta/parse/unknown-identifier");
    expect(codes).toEqual([]);
  });

  it("grammar#contextual-keywords: `par for …` is recognised as the par-for form, not `par` + `for` (RED — feature absent)", () => {
    // Recognised as one construct: no `par` identifier resolution error, and a
    // `par-for` node is produced. Today `par` parses as a free identifier
    // (theta/parse/unknown-identifier) and `for` as a separate statement.
    const doc = parse("par for x in [1, 2, 3] { x }");
    expect(
      doc.diagnostics.map((d) => d.code),
      "`par` immediately before `for` is the contextual keyword, not a free identifier",
    ).not.toContain("theta/parse/unknown-identifier");
    expect(
      parForNodes(doc.body).length,
      "`par for …` lowers to a single `par-for` expression node",
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// PARSER — `par for` is a value-producing EXPRESSION (grammar.md §Blocks)
// ===========================================================================

describe("RFC-0003 par-for — parses as a value-producing expression", () => {
  it("grammar#blocks: `par for` is admissible as the RHS of a `let` (RED — feature absent)", () => {
    const doc = parse("let reviews = par for f in [1, 2, 3] { f }\nreviews");
    const lets = collectByKind(doc.body, "let");
    const withParForInit = lets.filter(
      (s) =>
        s.init !== null &&
        typeof s.init === "object" &&
        (s.init as KindedNode).kind === "par-for",
    );
    expect(
      withParForInit.length,
      "a `par for` expression is the initialiser of `let reviews = par for …`",
    ).toBe(1);
  });

  it("grammar#blocks: `par for` stands alone as a discarded-value expression statement (RED — feature absent)", () => {
    const doc = parse("par for f in [1, 2, 3] { f }");
    const exprStmts = collectByKind(doc.body, "expr");
    const parForStmts = exprStmts.filter(
      (s) =>
        typeof s.expr === "object" &&
        (s.expr as KindedNode).kind === "par-for",
    );
    expect(
      parForStmts.length,
      "a standalone `par for` is legal as an expression statement (value discarded)",
    ).toBe(1);
  });

  it("grammar#blocks: the `par-for` node carries the loop variable, iterand and body (RED — feature absent)", () => {
    const doc = parse("let r = par for item in [10, 20] { item }\nr");
    const [node] = parForNodes(doc.body);
    expect(node, "a `par-for` node is produced").toBeDefined();
    expect(node?.variable, "the loop `Ident` is captured").toBe("item");
    expect(
      (node?.iterand as KindedNode | undefined)?.kind,
      "the iterand expression after `in` is captured (an array literal here)",
    ).toBe("array");
    expect(
      (node?.body as { statements?: unknown; tail?: unknown } | undefined) !==
        undefined,
      "the ParForBody block is captured",
    ).toBe(true);
  });
});

// ===========================================================================
// PARSER — `max` clause (grammar.md `MaxClause ::= "max" Expr`)
// ===========================================================================

describe("RFC-0003 par-for — `max` clause", () => {
  it("grammar#MaxClause: `max <literal>` parses; the node records a max operand (RED — feature absent)", () => {
    const doc = parse("let r = par for f in [1, 2, 3] max 8 { f }\nr");
    const [node] = parForNodes(doc.body);
    expect(node, "a `par-for` node with a `max` clause is produced").toBeDefined();
    expect(node?.max, "the `max` operand is captured (not null)").not.toBeNull();
    expect(node?.max, "the `max` operand is present").toBeDefined();
  });

  it("grammar#MaxClause / RFC-0003: `max` accepts a non-literal integer expression `max n + 1` (RED — feature absent)", () => {
    // RFC 0003 inherits RFC 0002's posture: `max` admits any integer-typed
    // expression, not only a literal.
    const doc = parse(
      ["let n = 4", "let r = par for f in [1, 2, 3] max n + 1 { f }", "r"].join(
        "\n",
      ),
    );
    const [node] = parForNodes(doc.body);
    expect(node, "a `par-for` node with a computed `max` is produced").toBeDefined();
    expect(
      (node?.max as KindedNode | undefined)?.kind,
      "a non-literal `max` operand parses as its expression (a binary `+` here)",
    ).toBe("binary");
  });

  it("CTRL-2 / grammar#MaxClause: a non-integer `max` operand routes to the integer-narrowing diagnostic (RED — feature absent)", () => {
    // control-flow.md CTRL-2 / grammar.md §Loops: a `number`-typed `max` operand
    // triggers `theta/parse/integer-narrowing`, as in any integer position.
    const codes = codesOf("let r = par for f in [1, 2, 3] max 2.5 { f }\nr");
    expect(
      codes,
      "a fractional `max` operand narrows to the existing integer-narrowing diagnostic",
    ).toContain("theta/parse/integer-narrowing");
  });
});

// ===========================================================================
// PARSER — iterand contract + body-restriction diagnostics (CTRL-4)
// ===========================================================================

describe("RFC-0003 par-for — iterand contract (reused from `for`)", () => {
  it("grammar#non-array-iterand: a non-array `par for` iterand is theta/parse/non-array-iterand (RED — feature absent)", () => {
    // `par for` reuses the `for` iterand contract unchanged (control-flow.md
    // §par-for): a non-array iterand is theta/parse/non-array-iterand, and it is
    // NOT a free-identifier `par` (no unknown-identifier for `par`).
    const codes = codesOf("let r = par for f in 5 { f }\nr");
    expect(codes, "a non-array `par for` iterand fires non-array-iterand").toContain(
      "theta/parse/non-array-iterand",
    );
    expect(
      codes,
      "`par` before `for` is the contextual keyword, not a free identifier",
    ).not.toContain("theta/parse/unknown-identifier");
  });
});

describe("RFC-0003 par-for — body restrictions (CTRL-4)", () => {
  it("theta/parse/par-query-in-body: an `@`-query against the enclosing conversation in the body (RED — feature absent)", () => {
    // CTRL-4: a conversation is a linear transcript; concurrent `@` queries have
    // no defined interleaving, so a body `@`…`` is a parse error.
    const codes = codesOf(
      ["let r = par for f in [1, 2, 3] {", "  @`Summarise ${f}.`?", "}", "r"].join(
        "\n",
      ),
    );
    expect(codes).toContain("theta/parse/par-query-in-body");
  });

  it("theta/parse/par-shared-mutation: assignment to an outer `let mut` inside the body (RED — feature absent)", () => {
    // CTRL-4: outer bindings are readable, but assignment to a `let mut`
    // declared outside the body is a parse error.
    const codes = codesOf(
      [
        "let mut total = 0",
        "let r = par for f in [1, 2, 3] {",
        "  total = total + f",
        "  f",
        "}",
        "r",
      ].join("\n"),
    );
    expect(codes).toContain("theta/parse/par-shared-mutation");
  });

  it("theta/parse/par-break-continue: `break` inside the body (RED — feature absent)", () => {
    // CTRL-4: `break` / `continue` have no defined meaning under concurrent
    // scheduling.
    const codes = codesOf(
      ["par for f in [1, 2, 3] {", "  break", "}"].join("\n"),
    );
    expect(codes).toContain("theta/parse/par-break-continue");
  });

  it("theta/parse/par-break-continue: `continue` inside the body (RED — feature absent)", () => {
    const codes = codesOf(
      ["par for f in [1, 2, 3] {", "  continue", "}"].join("\n"),
    );
    expect(codes).toContain("theta/parse/par-break-continue");
  });
});

// ===========================================================================
// PARSER — the parse-phase structural walk reaches a `par for` (bug 0118)
// ===========================================================================
//
// RULE: `walkExpr` (src/parser/theta-document.ts:7350) has a `par-for` arm, so
// a `par for`'s iterand, `max` operand and body are visited and every check
// that walk owns judges that subtree on the same terms as any other block —
// FN-1's placement clause (`theta/parse/nested-fn`), FN-1's second clause
// (`theta/parse/function-as-value`), RET-3 (`theta/parse/unreachable-code`),
// the `let`-binding form check, the annotation type-expression check, the
// object-literal and enum-variant checks, and the `@`-query template checks.
// WHY: FN-1 (docs/spec_topics/functions.md:20) is unconditional — "`fn`
// declarations are top-level only … Nested function definitions surface as
// `theta/parse/nested-fn`" — and the registry Trigger
// (docs/spec_topics/diagnostics/code-registry-parse.md:86) reads "`fn`
// declaration nested inside another `fn` body or a block", of which a `par for`
// body is one. The same reasoning carries every other check the walk owns:
// each judges the source it is handed, and a `par for` body is source
// (docs/bugs/0118-nested-fn-result-return-defers-to-runtime-panic.md §Fix (a),
// §Expected behaviour — "the checks the same walk owns fire in that subtree on
// the same terms as everywhere else").
//
// Every cell pins the WHOLE unfiltered `doc.diagnostics` array as an ordered
// `severity code` list, so a second copy of a code the parser's own CTRL-4 scan
// already emits reds here rather than passing on an "at least one" match
// (§Fix (b)). Where a body construct draws TWO codes, both are pinned: each is
// factually true of the source it judges, and both are error severity, so
// registration is blocked either way.
//
// The one suppression the arm takes is `inLoop: true`, and only because a
// `par for` IS a loop: `theta/parse/break-outside-loop` (and its `continue`
// twin) would be factually FALSE of a `break` in that body, which CTRL-4
// already refuses as `theta/parse/par-break-continue`.
//
// The SECOND walk over this subtree is the scope-tracking identifier-resolution
// walk — `walkIdentExpr` (symbol at src/parser/theta-document.ts:5434), driven
// by `checkUnknownIdentifiers` (`:5279`) through `walkIdentBlock` (`:5339`) and
// `walkIdentStmt` (`:5354`). Bug 0118 §Fix (c) took arrangement 2 ("the
// structural walk alone"), so at that fix no `par-for` arm existed there and no
// identifier-resolution code was drawn in this subtree. Bug 0224 owes that arm:
// its iterand / `max` / body traversal makes both of the walk's refusals
// (`theta/parse/unknown-identifier`, `theta/parse/type-as-value`) reachable
// inside a `par for`, so cell (r2) below asserts BOTH codes and the bug-0224
// group pins every newly-reached emission.
//
// Each newly-reachable family below is paired with a TOP-LEVEL real-parse
// CONTROL: the control proves the code belongs to the check, so the body cell's
// verdict is attributable to the walk's reach and nothing else.

/**
 * The live registry, read from the spec corpus — the DIAG-4 message oracle for
 * this group (the same source, and the same reader, the production emitters'
 * messages are transcribed from).
 */
const BUG_0118_REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as readonly { readonly code: string; readonly message: string }[];

const NESTED_FN = "theta/parse/nested-fn";
const FUNCTION_AS_VALUE = "theta/parse/function-as-value";
const UNREACHABLE_CODE = "theta/parse/unreachable-code";
const LET_WITHOUT_INITIALISER = "theta/parse/let-without-initialiser";
const PAR_BREAK_CONTINUE = "theta/parse/par-break-continue";
const PAR_QUERY_IN_BODY = "theta/parse/par-query-in-body";
const DISCARDED_QUERY_RESULT = "theta/parse/discarded-query-result";
const ANNOTATION_TYPE_NOT_EXPRESSION = "theta/parse/annotation-type-not-expression";
const UNRESOLVED_NAMED_TYPE = "theta/parse/unresolved-named-type";
const BARE_OBJECT_LITERAL = "theta/parse/bare-object-literal";
const UNKNOWN_VARIANT = "theta/parse/unknown-variant";
const UNSUPPORTED_FEATURE = "theta/parse/unsupported-feature";
const BARE_RETURN_IN_NON_VOID = "theta/parse/bare-return-in-non-void";
/**
 * The two refusals the scope-tracking identifier-resolution walk owns
 * (`emitUnknownIdentifier`, src/parser/theta-document.ts:5303 — the single
 * sink). Bug 0224 gives `walkIdentExpr` (`:5434`) its `par-for` arm, which is
 * what brings them into this subtree at all; before that arm both were silent
 * everywhere inside a `par for`.
 */
const UNKNOWN_IDENTIFIER = "theta/parse/unknown-identifier";
const TYPE_AS_VALUE = "theta/parse/type-as-value";
/** The two codes bug 0224's H3 row requires to stay UNCHANGED, with their counts. */
const SHADOWED_CALLABLE_CALL = "theta/parse/shadowed-callable-call";
/** The TYPE layer's own iterand verdict, which reaches a `par for` by another traversal. */
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";

/**
 * The registered Message for `code` (DIAG-4), with each `<placeholder>` key of
 * `bindings` substituted. A missing row fails LOUDLY: the Message column is
 * this group's only message oracle, so its absence is a harness failure, never a
 * skip. The three RFC-0003 legacy `theta/parse/par-*` codes are registered on
 * docs/reference/diagnostics.md:118,:120 instead of under
 * docs/spec_topics/diagnostics/ (recorded at docs/reference/diagnostics.md:312),
 * so they are unreachable through this oracle and the cells that pin them assert
 * their exact COUNTS rather than their messages. The fourth `par-*` code,
 * `theta/parse/par-return-in-body`, is the exception: it carries a sharded row
 * on code-registry-parse.md and so IS reachable through this oracle.
 */
function registryMessageFor(
  code: string,
  bindings: Readonly<Record<string, string>> = {},
): string {
  const template = registryMessage(BUG_0118_REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no registry row for ${code} in docs/spec_topics/diagnostics/ — the DIAG-4 Message column is this group's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  let message = template;
  for (const [placeholder, value] of Object.entries(bindings)) {
    message = message.replace(placeholder, value);
  }
  return message;
}

/** The whole unfiltered diagnostics array as an ordered `severity code` list. */
function diagShapeOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}`);
}

/** Every message carried by a diagnostic of `code`, in emission order. */
function messagesFor(src: string, code: string): string[] {
  return parse(src)
    .diagnostics.filter((d: Diagnostic) => d.code === code)
    .map((d: Diagnostic) => d.message);
}

/** A compact rendering of a source's diagnostics for failure messages. */
function showDiags(src: string): string {
  const diags = parse(src).diagnostics;
  return diags.length === 0
    ? "[] (NO DIAGNOSTIC OF ANY SEVERITY — the source loads clean)"
    : diags.map((d) => `${d.severity} ${d.code}: ${d.message}`).join("; ");
}

describe("bug 0118 — FN-1 reaches a `fn` declared under a `par for` (structural walk)", () => {
  it("(r1) FN-1: a `fn` declared directly in a `par for` body is theta/parse/nested-fn", () => {
    // FN-1 admits `fn` at the top level only, and a `par for` body is a block —
    // the registry Trigger's own words (code-registry-parse.md:86).
    const src = [
      "let xs = par for i in [1, 2] {",
      "  fn mk(): integer { 1 }",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 finding (2)): FN-1 is unconditional, so this declaration is refused at load; the whole diagnostics array is exactly that one refusal. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${NESTED_FN}`]);
    expect(
      messagesFor(src, NESTED_FN),
      "DIAG-4: the expected message is READ from the registry's Message column, never copied prose",
    ).toEqual([registryMessageFor(NESTED_FN)]);
  });

  it("(r2) FN-1: calling the nested `fn` in the body ALSO draws unknown-identifier (bug 0224)", () => {
    // Bug 0118 §Fix (c) stated the choice in its own words: "Either widen both
    // in one commit with both sets of counts pinned, or widen the structural
    // walk alone and record the ident walk's omission as a scoped residual". It
    // took the second, and its *Residuals* item 2 recorded the omission. Bug
    // 0224 is that residual's repair: with `walkIdentExpr`
    // (src/parser/theta-document.ts:5434) carrying a `par-for` arm, the body
    // block IS walked, and `mk` is declared only by a declaration FN-1 refuses
    // — `collectFns` stays top-level-only (bug 0118 §Fix (d)/(e)) — so the
    // callee resolves through no arm of expressions.md:44–:49 and draws
    // `theta/parse/unknown-identifier` beside the refusal. The SECOND code is
    // owed, not incidental.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  fn mk(): integer { 1 }",
      "  let r = mk()",
      "  r",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (a) + bug 0224 §Fix (d)2): ONE refusal for the declaration, and the identifier-resolution code for the call the identifier walk now reaches. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${NESTED_FN}`, `error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "DIAG-4: the expected message is READ from the registry's Message column, with `<name>` bound to the refused nested `fn`",
    ).toEqual([registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "mk" })]);
  });

  it("(r3) §Fix (b): a body `@`-query keeps exactly ONE par-query-in-body beside the refusals", () => {
    // The walk's `query` arm reaches this template and CTRL-4's own scan
    // (theta-document.ts:4593–4601) also refuses it, so the pair must not become
    // a double emission of the same code.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  fn mk(): integer { 1 }",
      "  let r = mk()",
      "  let _ = @`x${r}`",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (a)/(b)): the refusal is added, CTRL-4's query refusal stays SINGLE. The middle entry is bug 0224's — the same mechanism as (r2): the widened identifier walk reaches the call of the FN-1-refused \`mk\`. Observed: ${showDiags(src)}`,
    ).toEqual([
      `error ${NESTED_FN}`,
      `error ${UNKNOWN_IDENTIFIER}`,
      `error ${PAR_QUERY_IN_BODY}`,
    ]);
    expect(
      diagShapeOf(src).filter((s) => s === `error ${PAR_QUERY_IN_BODY}`),
      "(r3)'s PRIMARY subject is unmoved: CTRL-4's own body scan and the structural walk's `query` arm still yield exactly ONE par-query-in-body, not a double emission",
    ).toHaveLength(1);
  });

  it("(r4) FN-1: a `fn` in a plain `for` block INSIDE the `par for` body is refused", () => {
    // The hole is the `par-for` node itself, not the depth: an inner block form
    // the walk already covers is still unreached while its `par for` ancestor is.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  for j in [3] {",
      "    fn mk(): integer { 1 }",
      "  }",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118): FN-1 refuses the declaration at any depth under a \`par for\`. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${NESTED_FN}`]);
    expect(
      messagesFor(src, NESTED_FN),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(NESTED_FN)]);
  });

  it("(r5) FN-1: a `par for` nested in a top-level `fn` body carries the refusal too", () => {
    // The enclosing scope already has `topLevel: false`; the refusal is owed for
    // the `par for` body regardless of where the `par for` itself sits.
    const src = [
      "fn outer(): integer {",
      "  let xs = par for i in [1, 2] {",
      "    fn mk(): integer { 1 }",
      "    1",
      "  }",
      "  1",
      "}",
      "let n = outer()",
      "n",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118): nesting the \`par for\` deeper does not excuse the declaration. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${NESTED_FN}`]);
  });

  it("(r7) FN-1 second clause: a `fn` name bound to a `let` in the body is theta/parse/function-as-value", () => {
    // Same walk, same arm (`ident`): theta 1.0 has no first-class functions, so
    // the value position is refused inside a `par for` body as anywhere else.
    const src = [
      "fn f(): integer { 1 }",
      "let xs = par for i in [1, 2] {",
      "  let g = f",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118, traversal-gap row): FN-1's second clause is owned by the same walk, so it must fire in this subtree. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${FUNCTION_AS_VALUE}`]);
    expect(
      messagesFor(src, FUNCTION_AS_VALUE),
      "DIAG-4: message read from the registry's Message column, with the row's `<name>` bound to the referenced `fn`",
    ).toEqual([registryMessageFor(FUNCTION_AS_VALUE, { "<name>": "f" })]);
  });

  it("(r7-control) FN-1 second clause: the identical `let g = f` at the TOP LEVEL already fires", () => {
    // The control direction of (r7): the check itself is correct and total over
    // its input, so this cell isolates (r7)'s verdict to the walk's reach and not
    // to the check.
    const src = ["fn f(): integer { 1 }", "let g = f", "1"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: the top-level placement is already refused, so (r7)'s red is the walk's reach and not the check. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${FUNCTION_AS_VALUE}`]);
    expect(
      messagesFor(src, FUNCTION_AS_VALUE),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(FUNCTION_AS_VALUE, { "<name>": "f" })]);
  });

  it("(r8) RET-3: code after `return` inside a `fn` under a `par for` body warns unreachable-code", () => {
    // The refusal and the warning are both owed: the declaration is refused, and
    // the walk descends its body on the same terms it does everywhere else.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  fn mk(): integer {",
      "    return 1",
      "    let z = 2",
      "    z",
      "  }",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118, traversal-gap row): RET-3 is owned by the same walk. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${NESTED_FN}`, `warning ${UNREACHABLE_CODE}`]);
    expect(
      messagesFor(src, UNREACHABLE_CODE),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(UNREACHABLE_CODE)]);
  });

  it("(r8-control) RET-3: code after `return` inside a TOP-LEVEL `fn` warns unreachable-code", () => {
    // The control direction of (r8) (§Fix (g) pairs each traversal-gap row with a
    // top-level control): RET-3's check is correct and total over its input, so
    // this cell attributes (r8)'s warning to the check and (r8)'s reach to the
    // walk. No `par for` here — and therefore no `theta/parse/nested-fn`, since
    // the `fn` is at the only placement FN-1 admits.
    const src = [
      "fn f(): integer {",
      "  return 1",
      "  let z = 2",
      "  z",
      "}",
      "let n = f()",
      "n",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: RET-3 already warns at the top-level placement, so (r8)'s warning is the check's and its reach is the walk's. Observed: ${showDiags(src)}`,
    ).toEqual([`warning ${UNREACHABLE_CODE}`]);
    expect(
      messagesFor(src, UNREACHABLE_CODE),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(UNREACHABLE_CODE)]);
  });

  it("(r9) FN-1 second clause: a `fn` name in the ITERAND is theta/parse/function-as-value", () => {
    // §Fix (a): the iterand is walked in the ENCLOSING scope, so a value-position
    // function name there is refused exactly as it is outside the loop.
    const src = [
      "fn f(): integer { 1 }",
      "let xs = par for i in [f] { 1 }",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118): the iterand is one of the par-for node's three walked limbs, and it is walked in the ENCLOSING scope. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${FUNCTION_AS_VALUE}`]);
    expect(
      messagesFor(src, FUNCTION_AS_VALUE),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(FUNCTION_AS_VALUE, { "<name>": "f" })]);
  });

  it("(r15) FN-1 second clause: a `fn` name as the `max` operand is theta/parse/function-as-value", () => {
    // §Fix (a) walks the `max` operand in the enclosing scope too — the third
    // limb of the `par-for` node, alongside the iterand and the body.
    const src = [
      "fn f(): integer { 1 }",
      "let xs = par for i in [1, 2] max f { 1 }",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118): the \`max\` operand is the third walked limb of the par-for node, walked in the ENCLOSING scope. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${FUNCTION_AS_VALUE}`]);
    expect(
      messagesFor(src, FUNCTION_AS_VALUE),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(FUNCTION_AS_VALUE, { "<name>": "f" })]);
  });

  it("(r14) the `let`-binding form check reaches the body: an initialiser-less `let`", () => {
    // `checkLetBinding` runs from `walkStatement`'s `let` arm, which the body's
    // statements reach through `walkBlock`, so an initialiser-less binding is
    // refused inside a `par for` body on the same terms as anywhere else.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  let y",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (b)): the \`let\`-form check is owned by this walk and the body's statements are walked. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${LET_WITHOUT_INITIALISER}`]);
    expect(
      messagesFor(src, LET_WITHOUT_INITIALISER),
      "DIAG-4: message read from the registry's Message column, with `<name>` bound to the binding",
    ).toEqual([registryMessageFor(LET_WITHOUT_INITIALISER, { "<name>": "y" })]);
  });
});

describe("bug 0118 — the walk adds NOTHING to the rows CTRL-4's own scan judges", () => {
  // These cells pin the counts on rows the parser's own CTRL-4 scan already
  // judged, and they are the reason `inLoop: true` is the arm's scope: with
  // `inLoop: false`, `checkBreakStatement` would add a second, factually wrong
  // diagnostic (`theta/parse/break-outside-loop` / its `continue` twin) beside
  // CTRL-4's own refusal. The exact counts below red if that scope is flipped.

  it("(r10) CTRL-4: `break` in the body draws EXACTLY ONE par-break-continue", () => {
    const src = ["par for i in [1, 2] {", "  break", "}"].join("\n");
    expect(
      diagShapeOf(src),
      `bug 0118 §Fix (a), \`inLoop: true\`: the body is a loop body for the walk's purposes, so CTRL-4's refusal stands alone. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${PAR_BREAK_CONTINUE}`]);
  });

  it("(r11) CTRL-4: `continue` in the body draws EXACTLY ONE par-break-continue", () => {
    const src = ["par for i in [1, 2] {", "  continue", "}"].join("\n");
    expect(
      diagShapeOf(src),
      `bug 0118 §Fix (a), \`inLoop: true\`: the \`continue\` twin of (r10). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${PAR_BREAK_CONTINUE}`]);
  });

  it("(r12) §Fix (b): a `?`-propagating `@`-query statement in the body stays EXACTLY ONE par-query-in-body", () => {
    // A `@`...`?` line is a `try` over a `query` EXPRESSION, not a `QueryStmt`,
    // so QRY-19's discarded-result check does not judge it at all (that shape is
    // cell (r18)'s). What this cell pins is the count: the walk's `query` arm
    // reaches the same template CTRL-4's own scan already refused, and adds no
    // second copy of that code.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  @`hi ${i}`?",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `bug 0118 §Fix (b): the walk's \`query\` arm adds no second copy of CTRL-4's refusal. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${PAR_QUERY_IN_BODY}`]);
  });

  it("(r17) §Fix (b): a BOUND body query stays EXACTLY ONE par-query-in-body", () => {
    const src = [
      "let xs = par for i in [1, 2] {",
      "  let q = @`hi`?",
      "  q",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `bug 0118 §Fix (b): the bound form of (r12) — one refusal, from CTRL-4's expression arm. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${PAR_QUERY_IN_BODY}`]);
  });

  it("(r13) CONTROL: a legal `par for` keeps loading with ZERO diagnostics", () => {
    // The false-positive gate for the whole group: a body that declares no `fn`,
    // uses no function name as a value and carries no query draws nothing.
    const src = ["let xs = par for i in [1, 2] { i }", "xs"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL (bug 0118 §Expected behaviour): "Nothing changes for a legal \`par for\`". Observed: ${showDiags(src)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// PARSER — the rest of the walk's check family inside a `par for` body
// ===========================================================================
//
// One cell per family the `par-for` arm brings into the subtree beyond FN-1 and
// RET-3, each paired with a TOP-LEVEL real-parse control on the same construct.
// The pairing is what makes each verdict attributable: the control shows the
// code belongs to the check, so the body cell shows the reach belongs to the
// walk (§Fix (g)'s pairing discipline, applied to §Fix (b)'s named families).
//
// Where a body construct draws TWO codes — CTRL-4's own refusal plus the code
// the walk's own check contributes — both are pinned rather than one suppressed.
// Each is factually true of the source it judges: CTRL-4 judges the presence of
// an enclosing-conversation query in the body, and the walk's check judges the
// construct's own shape. Both are error severity, so `hasLoadParseError` blocks
// registration either way and neither is load-bearing on its own.

describe("bug 0118 — the rest of the walk's family fires in a `par for` body, each with a control", () => {
  it("(r18) QRY-19: a bare `@`-query STATEMENT in the body draws par-query-in-body AND discarded-query-result", () => {
    // A `@`...`` line with no `?` and no `let _ =` parses to a `QueryStmt`, which
    // is `checkDiscardedQueryResult`'s input (unlike (r12)'s `?` form, a `try`
    // over a query EXPRESSION). Two codes, and two is the count: the query is in
    // a `par for` body (CTRL-4) and its `Result` is dropped without
    // acknowledgement (QRY-19). They are different codes at different rules, not
    // a doubling of one.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  @`hi`",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (b)): CTRL-4's refusal plus QRY-19's, in that order, and nothing else. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${PAR_QUERY_IN_BODY}`, `error ${DISCARDED_QUERY_RESULT}`]);
    expect(
      messagesFor(src, DISCARDED_QUERY_RESULT),
      "DIAG-4: message read from the registry's Message column. `theta/parse/par-query-in-body` has no row under docs/spec_topics/diagnostics/ (it is registered on docs/reference/diagnostics.md:118), so only its count is pinned above",
    ).toEqual([registryMessageFor(DISCARDED_QUERY_RESULT)]);
  });

  it("(r18-control) QRY-19: the identical bare `@`-query statement at the TOP LEVEL draws discarded-query-result alone", () => {
    const src = ["@`hi`", "1"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: QRY-19's check is the code's owner; outside a \`par for\` body CTRL-4 has nothing to say. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${DISCARDED_QUERY_RESULT}`]);
    expect(
      messagesFor(src, DISCARDED_QUERY_RESULT),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(DISCARDED_QUERY_RESULT)]);
  });

  it("(r19) the annotation type-expression check reaches a body `let`", () => {
    // §Fix (b)'s named "type-expression parse check the arm performs for
    // annotations": `walkStatement`'s `let` arm judges the WHOLE captured
    // annotation against the `Type` grammar
    // (docs/spec_topics/diagnostics/code-registry-parse.md:95), one diagnostic
    // per offending annotation, naming its binder.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  let y: 1 + = 1",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (b)): the annotation check judges a body annotation on the same terms as a top-level one. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${ANNOTATION_TYPE_NOT_EXPRESSION}`]);
    expect(
      messagesFor(src, ANNOTATION_TYPE_NOT_EXPRESSION),
      "DIAG-4: message read from the registry's Message column, with `<name>` bound to the binder",
    ).toEqual([registryMessageFor(ANNOTATION_TYPE_NOT_EXPRESSION, { "<name>": "y" })]);
  });

  it("(r19-control) the annotation type-expression check at the TOP LEVEL", () => {
    const src = ["let y: 1 + = 1", "y"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: the same annotation at the top level draws the same single refusal, so (r19)'s verdict is the check's. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${ANNOTATION_TYPE_NOT_EXPRESSION}`]);
    expect(
      messagesFor(src, ANNOTATION_TYPE_NOT_EXPRESSION),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(ANNOTATION_TYPE_NOT_EXPRESSION, { "<name>": "y" })]);
  });

  it("(r20) the `query` arm's ascription checks reach a body `@<T>` — par-query-in-body AND unresolved-named-type", () => {
    // The `query` arm resolves an author-written `@<T>` ascription against the
    // file's declarations (code-registry-parse.md:99). Two codes, both true: the
    // query is in a `par for` body, and `Missing` names no declaration.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  let q = @<Missing>`hi`?",
      "  q",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (b)): CTRL-4's refusal plus the ascription's, in that order. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${PAR_QUERY_IN_BODY}`, `error ${UNRESOLVED_NAMED_TYPE}`]);
    expect(
      messagesFor(src, UNRESOLVED_NAMED_TYPE),
      "DIAG-4: message read from the registry's Message column, with `<name>` bound to the unresolved type. `theta/parse/par-query-in-body` is registered on docs/reference/diagnostics.md:118 only, so its count alone is pinned above",
    ).toEqual([registryMessageFor(UNRESOLVED_NAMED_TYPE, { "<name>": "Missing" })]);
  });

  it("(r20-control) the `@<T>` ascription check at the TOP LEVEL draws unresolved-named-type alone", () => {
    const src = ["let q = @<Missing>`hi`?", "q"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: the ascription check owns the code; outside a \`par for\` body CTRL-4 has nothing to say. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNRESOLVED_NAMED_TYPE}`]);
    expect(
      messagesFor(src, UNRESOLVED_NAMED_TYPE),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(UNRESOLVED_NAMED_TYPE, { "<name>": "Missing" })]);
  });

  it("(r21) the object-literal check reaches a body `let` initialiser", () => {
    // `checkObjectExpr` runs from `walkExpr`'s `object` arm: a bare
    // `{ field: expr }` outside the two documented carve-outs is refused
    // (code-registry-parse.md:48), inside a `par for` body as anywhere else.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  let o = { a: 1 }",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (b)): the object-literal check is owned by this walk. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${BARE_OBJECT_LITERAL}`]);
    expect(
      messagesFor(src, BARE_OBJECT_LITERAL),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(BARE_OBJECT_LITERAL)]);
  });

  it("(r21-control) the object-literal check at the TOP LEVEL", () => {
    const src = ["let o = { a: 1 }", "1"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: the same literal at the top level draws the same single refusal. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${BARE_OBJECT_LITERAL}`]);
    expect(
      messagesFor(src, BARE_OBJECT_LITERAL),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(BARE_OBJECT_LITERAL)]);
  });

  it("(r22) the enum-variant check reaches a body `Enum.Variant`", () => {
    // `walkExpr`'s `member` arm resolves `Enum.Variant` against the declared
    // variants (code-registry-parse.md:98). The variant names here are
    // incidental fixture data for the unknown-variant lookup under test, not
    // its subject; `Good`/`Bad` (not `Ok`/`Bad`) because bug 0153 reserves
    // `Ok` from every identifier position, including this one.
    const src = [
      "enum Status { Good, Bad }",
      "let xs = par for i in [1, 2] {",
      "  let s = Status.Nope",
      "  1",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (b)): the variant check is owned by this walk. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_VARIANT}`]);
    expect(
      messagesFor(src, UNKNOWN_VARIANT),
      "DIAG-4: message read from the registry's Message column, with `<variant>` and `<enum>` bound",
    ).toEqual([
      registryMessageFor(UNKNOWN_VARIANT, { "<variant>": "Nope", "<enum>": "Status" }),
    ]);
  });

  it("(r22-control) the enum-variant check at the TOP LEVEL", () => {
    // Same incidental rename as (r22)'s fixture: `Good`/`Bad`, not `Ok`/`Bad`.
    const src = ["enum Status { Good, Bad }", "let s = Status.Nope", "1"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: the same reference at the top level draws the same single refusal. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_VARIANT}`]);
    expect(
      messagesFor(src, UNKNOWN_VARIANT),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([
      registryMessageFor(UNKNOWN_VARIANT, { "<variant>": "Nope", "<enum>": "Status" }),
    ]);
  });

  it("(r23) checkQueryTemplateInterpolations reaches a body `@`-query: `match` inside `${...}`", () => {
    // docs/spec_topics/expressions.md:40 — "Query templates (`@`...``) and
    // `match` inside `${...}`" are both unsupported, so template evaluation stays
    // code-only and never silently fires a model turn. Two codes, both true: the
    // query is in a `par for` body, and its interpolation carries a forbidden
    // form.
    const src = [
      "let xs = par for i in [1, 2] {",
      "  let q = @`hi ${match i { _ => 1 }}`?",
      "  q",
      "}",
      "xs",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0118 §Fix (b)): CTRL-4's refusal plus the interpolation-form refusal, in that order. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${PAR_QUERY_IN_BODY}`, `error ${UNSUPPORTED_FEATURE}`]);
    expect(
      messagesFor(src, UNSUPPORTED_FEATURE),
      "DIAG-4: message read from the registry's Message column, with `<construct>` bound to the forbidden form. `theta/parse/par-query-in-body` is registered on docs/reference/diagnostics.md:118 only, so its count alone is pinned above",
    ).toEqual([
      registryMessageFor(UNSUPPORTED_FEATURE, {
        "<construct>": "match inside ${...} interpolation",
      }),
    ]);
  });

  it("(r23-control) checkQueryTemplateInterpolations at the TOP LEVEL draws unsupported-feature alone", () => {
    const src = ["let q = @`hi ${match 1 { _ => 1 }}`?", "q"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: the interpolation-form check owns the code; outside a \`par for\` body CTRL-4 has nothing to say. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNSUPPORTED_FEATURE}`]);
    expect(
      messagesFor(src, UNSUPPORTED_FEATURE),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([
      registryMessageFor(UNSUPPORTED_FEATURE, {
        "<construct>": "match inside ${...} interpolation",
      }),
    ]);
  });
});

// ===========================================================================
// PARSER — the RET family's disposition inside a `par for` body
// ===========================================================================
//
// RULE (bug 0223, §Fix route (a) — ENUMERATE-AND-REFUSE): CTRL-4
// (docs/spec_topics/control-flow.md:76) now names `return` as a fourth `par for`
// body restriction, so a `return` ANYWHERE under a `par for` body is REFUSED at
// load with `theta/parse/par-return-in-body` (Sev `E`, phase `parse`). The
// refusal is at EVERY body depth — `loopDepth` is deliberately NOT consulted,
// unlike the neighbouring `break` / `continue` arm's `loopDepth === 0` gate
// (src/parser/theta-document.ts:4707) — because a `return` at depth > 0 does not
// stay inside the inner loop: it crosses it and is consumed at the `par for`
// boundary (bug 0223 §Reproduction K). The bare form is in class too, so the
// body's own rule, not the enclosing annotation, decides it.
//
// WHY the enclosing-scope inheritance nonetheless still shows through: bug
// 0118's `par-for` walk arm is unchanged (it hands the body
// `{ ...scope, inLoop: true, topLevel: false }`, so `voidReturn` INHERITS —
// src/parser/theta-document.ts:7757), and route (a) withholds nothing. RET-2's
// `theta/parse/bare-return-in-non-void` and RET-3's
// `theta/parse/unreachable-code` therefore FIRE BESIDE the refusal rather than
// being suppressed as derived verdicts — which is why (r24) / (r25) below carry
// TWO codes and (r26) / (r27) / (r28), previously silent, now carry exactly one.
// The parse-time CTRL-4 body scan (`emitParForBodyDiagnostics`,
// src/parser/theta-document.ts:4653) runs before the post-parse structural
// walk, so the refusal is FIRST in every mixed cell.
//
// THE FOLD KNOWLEDGE, RESTATED RATHER THAN DELETED (this group's original
// countervailing fact, still true): at run, a `return` in the body yields the
// ITERATION's value, not the enclosing function's — `runParForIteration`
// (symbol at src/runtime/statement-executor.ts:1256) folds
// `flow.kind === "return"` into `makeOk(flow.value)` — this fix splits that
// case out of `case "normal"`'s arm into its OWN arm with the identical body
// (`:1316-1320`; the shared-arm shape this describes was the pre-fix state).
// Route (a) does NOT remove that arm: it makes it UNREACHABLE from a fresh
// load and keeps it as a DEFENSIVE fold, exactly as `case "break"` /
// `case "continue"` beside it already are (`:1274-1277`, whose comment names
// the parser gate). The fold's element values
// — and the plain-`for` contrast that exits instead — are locked by
// tests/par-for-body-return-refusal.test.ts's DEFENSIVE-FOLD group, which is
// green both before and after this refusal landed; do not read the cells below
// as evidence that the fold changed.
//
// The spec question this group formerly declared undecided ("whether CTRL-4
// should enumerate `return` at all") is now decided — by bug 0223, route (a).
// This group pins the refusal in BOTH directions: the refused rows here, and the
// controls (r24-control) … (r26-control), which show the RET-family codes still
// belong to their own checks outside a `par for` body.

describe("bug 0118/0223 — a `return` in a `par for` body is refused by CTRL-4, with the enclosing scope's RET-2 verdict still firing beside the bare form", () => {
  it("(r24) a bare `return` in a TOP-LEVEL `par for` body draws par-return-in-body AND bare-return-in-non-void", () => {
    // A theta body is a non-`void` scope (RET-2), and the body inherits it.
    // The `return` here is genuinely bare: a statement on the following line
    // would be absorbed as its operand by newline continuation.
    //
    // FLIPPED by bug 0223 route (a): the body's own refusal now fires FIRST
    // (parse-time CTRL-4 scan), and RET-2's inherited verdict is NOT withheld
    // beside it. Range-exact form of this row: cell (c2) of
    // tests/par-for-body-return-refusal.test.ts.
    const src = ["let xs = par for i in [1, 2] {", "  return", "}", "xs"].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0223 route (a) + bug 0118): the body refuses the \`return\` outright, and the inherited non-void RET-2 verdict still fires beside it. Observed: ${showDiags(src)}`,
    ).toEqual([`error theta/parse/par-return-in-body`, `error ${BARE_RETURN_IN_NON_VOID}`]);
    expect(
      messagesFor(src, BARE_RETURN_IN_NON_VOID),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(BARE_RETURN_IN_NON_VOID)]);
  });

  it("(r24-control) a bare `return` directly in the TOP-LEVEL theta body draws the same code", () => {
    const src = ["return"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: RET-2's check owns the code at the enclosing scope, so (r24) inherits a verdict rather than inventing one. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${BARE_RETURN_IN_NON_VOID}`]);
    expect(
      messagesFor(src, BARE_RETURN_IN_NON_VOID),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(BARE_RETURN_IN_NON_VOID)]);
  });

  it("(r25) a bare `return` in a `par for` body inside a NON-VOID `fn` draws par-return-in-body AND bare-return-in-non-void", () => {
    // FLIPPED by bug 0223 route (a): same pair as (r24), with the non-void
    // verdict supplied by the enclosing `fn`'s annotation instead of the theta
    // body's. The refusal does not depend on that annotation.
    const src = [
      "fn outer(): integer {",
      "  let xs = par for i in [1, 2] {",
      "    return",
      "  }",
      "  1",
      "}",
      "let n = outer()",
      "n",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0223 route (a) + bug 0118): the body refuses the \`return\`, and the enclosing \`fn\`'s non-void annotation still reaches the body beside it. Observed: ${showDiags(src)}`,
    ).toEqual([`error theta/parse/par-return-in-body`, `error ${BARE_RETURN_IN_NON_VOID}`]);
    expect(
      messagesFor(src, BARE_RETURN_IN_NON_VOID),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(BARE_RETURN_IN_NON_VOID)]);
  });

  it("(r25-control) a bare `return` directly in a NON-VOID `fn` body draws the same code", () => {
    const src = ["fn outer(): integer {", "  return", "}", "let n = outer()", "n"].join(
      "\n",
    );
    expect(
      diagShapeOf(src),
      `CONTROL: the code is RET-2's at the \`fn\` scope; (r25) shows the \`par for\` body inherits that scope. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${BARE_RETURN_IN_NON_VOID}`]);
  });

  it("(r26) a bare `return` in a `par for` body inside a `fn(): void` draws par-return-in-body ALONE", () => {
    // The other direction of the inheritance, unchanged: `voidReturn` is
    // inherited, so RET-2 has nothing to say here (`checkBareReturn` returns
    // `undefined` for a `void` enclosing annotation, src/parser/functions.ts:379)
    // — exactly as it has nothing to say directly in that `fn` ((r26-control)).
    //
    // FLIPPED by bug 0223 route (a) from `[]` to one code: this is now the
    // CLEANEST bare-form row, because the only diagnostic in it is the body's
    // own refusal. It no longer relies on the (r24) / (r25) pair to distinguish
    // an inherited silence from an unwalked body — a `walkExpr` that never
    // descended a `par for` would still be silent, but the CTRL-4 body scan is
    // a different traversal and it speaks here.
    const src = [
      "fn outer(): void {",
      "  let xs = par for i in [1, 2] {",
      "    return",
      "  }",
      "}",
      "outer()",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0223 route (a) + bug 0118): the body refuses the \`return\`; a \`void\` enclosing annotation is still inherited, so NO bare-return refusal joins it. Observed: ${showDiags(src)}`,
    ).toEqual([`error theta/parse/par-return-in-body`]);
  });

  it("(r26-control) a bare `return` directly in a `fn(): void` body is SILENT on that code", () => {
    const src = ["fn outer(): void {", "  return", "}", "outer()"].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: RET-2 admits a bare \`return\` in a \`void\` \`fn\`, which is the verdict (r26) inherits. Observed: ${showDiags(src)}`,
    ).toEqual([]);
  });

  it("(r27) a `return <value>` in a `par for` body inside a `fn(): void` draws par-return-in-body and nothing on the RET family", () => {
    // A `return` WITH an operand takes `walkStatement`'s other branch: the
    // operand is walked and no bare-return question is asked, so the whole RET
    // family stays silent in both enclosing shapes ((r27), (r28)).
    //
    // FLIPPED by bug 0223 route (a) from `[]` to one code: the refusal is on the
    // STATEMENT, so it is indifferent to whether the `return` carries an
    // operand — while RET-2's question, which the operand form never asks,
    // remains unasked. The two halves are now separable in one cell.
    const src = [
      "fn outer(): void {",
      "  let xs = par for i in [1, 2] {",
      "    return 1",
      "  }",
      "}",
      "outer()",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0223 route (a) + bug 0118): the body refuses the valued \`return\`, and that valued form still asks no bare-return question. Observed: ${showDiags(src)}`,
    ).toEqual([`error theta/parse/par-return-in-body`]);
  });

  it("(r28) a `return <value>` in a `par for` body inside a NON-VOID `fn` draws par-return-in-body and nothing on the RET family", () => {
    // FLIPPED by bug 0223 route (a) from `[]` to one code: the non-void twin of
    // (r27). Both enclosing annotations yield the same single refusal, which is
    // what "the body's own rule decides" means.
    const src = [
      "fn outer(): integer {",
      "  let xs = par for i in [1, 2] {",
      "    return 1",
      "  }",
      "  1",
      "}",
      "let n = outer()",
      "n",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0223 route (a) + bug 0118): the non-void twin of (r27) — the refusal is identical in both enclosing shapes and the RET family stays silent for the valued form. Observed: ${showDiags(src)}`,
    ).toEqual([`error theta/parse/par-return-in-body`]);
  });
});

// ===========================================================================
// PARSER — identifier resolution DESCENDS a `par for` (bug 0224)
// ===========================================================================
//
// RULE: `walkIdentExpr` (symbol at src/parser/theta-document.ts:5434), the
// recursion `checkUnknownIdentifiers` (`:5279`) drives through
// `walkIdentBlock` (`:5339`) and `walkIdentStmt` (`:5354`), has a `par-for`
// arm, so a `par for`'s iterand, its `max` width operand and its whole body
// are visited and BOTH refusals that walk owns —
// `theta/parse/unknown-identifier` and `theta/parse/type-as-value`, both pushed
// by the single sink `emitUnknownIdentifier` (`:5303`) — judge that subtree on
// the same terms as any other block.
//
// WHY: docs/spec_topics/expressions.md:44–:49 states identifier resolution as
// FOUR arms and `:51` states the two refusals for a name matching none of them,
// with no exemption for any construct; the registered *Trigger* for
// `theta/parse/unknown-identifier`
// (docs/spec_topics/diagnostics/code-registry-parse.md:66) is positional —
// "Bare identifier in call or value position resolves to nothing in scope" —
// and a `par for` body, its iterand and its `max` operand are such positions.
// Before bug 0224 the node fell into `walkIdentExpr`'s `default` arm
// (`:5518–:5520`), whose own comment enumerates "number / string / bool / null
// / query", so the drop happened AT THE NODE and no deeper mechanism of the
// walk ran — which is why a nested plain `for`, a `match` arm and a nested
// `par for` inside the body were silent too
// (docs/bugs/0224-identifier-walk-never-descends-par-for.md §Reproduction).
//
// SCOPE: the iterand and the `max` operand are walked in the ENCLOSING scope;
// the body is walked with a copy of that scope carrying the per-iteration
// variable — the shape `walkIdentStmt`'s `case "for"` (`:5389–:5395`) and
// `walkCallSiteExpr`'s `case "par-for"` (`:6353–:6364`, binding at `:6362`)
// already use, and what CTRL-4 (docs/spec_topics/control-flow.md:76) states
// ("Outer bindings and the loop variable are readable"). A `par for` body is
// NOT closure-free, so `walkIdentStmt`'s `fn` reseeding from the roots
// (`:5396–:5405`) is deliberately not the model.
//
// Every cell pins the WHOLE unfiltered `doc.diagnostics` array as an ordered
// `severity code` list, so neither an extra diagnostic, nor a missing one, nor
// a right diagnostic in the wrong order can hide inside a containment check;
// each family is paired with a real-parse CONTROL at a position the walk
// already reached before bug 0224 (top level, or the plain-`for` spelling),
// which is what attributes a body cell's verdict to the arm's reach rather
// than to the check. Emission ORDER is load-bearing (iterand, then `max`, then
// body) and is asserted by (q-order).

/**
 * Every diagnostic as `code @ startLine:startCol-endLine:endCol`, in report
 * order. A range-less diagnostic fails LOUDLY naming the code: this helper's
 * whole purpose is the range, so an absent one is a harness failure rather than
 * a row that silently degrades to a code-only comparison.
 */
function diagRangesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => {
    const range = d.range;
    if (range === undefined) {
      throw new Error(
        `harness: diagnostic ${d.code} carries no range, but this assertion is ABOUT the range (bug 0224 §Expected behaviour: "at the identifier's own range")`,
      );
    }
    return `${d.code} @ ${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`;
  });
}

describe("bug 0224 — the identifier walk descends a `par for` (unknown-identifier)", () => {
  it("(q-A1) an undeclared name as the `par for` body's tail draws unknown-identifier ONCE, at its own range", () => {
    // §Reproduction row A1, the in-class row: one word of difference from the
    // plain-`for` control below, and before bug 0224 that word was the whole
    // reach gap.
    const src = "let a = par for i in [1, 2] { Zzz }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction A1): the body is a block and a name matching no resolution arm is refused there as anywhere else. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "DIAG-4: the expected message is READ from the registry's Message column, never copied prose",
    ).toEqual([registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Zzz" })]);
    expect(
      diagRangesOf(src),
      "§Expected behaviour: the diagnostic is ranged at the IDENTIFIER, not at the enclosing `par for` or `let`",
    ).toEqual([`${UNKNOWN_IDENTIFIER} @ 1:31-1:34`]);
  });

  it("(q-A1-control) CONTROL: the same body under a plain `for`, and the same name at the TOP LEVEL", () => {
    // §Reproduction rows A2 and A3. The check itself is correct and total over
    // its input at both already-reached positions, so (q-A1)'s verdict is
    // attributable to the arm's reach and to nothing else.
    const plainFor = "for i in [1, 2] { Zzz }\n1";
    expect(
      diagShapeOf(plainFor),
      `CONTROL (§Reproduction A2): \`walkIdentStmt\`'s \`case "for"\` already descends the body. Observed: ${showDiags(plainFor)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    const topLevel = "let a = Zzz\na";
    expect(
      diagShapeOf(topLevel),
      `CONTROL (§Reproduction A3): the top-level \`let\` initialiser is a position the walk has always reached. Observed: ${showDiags(topLevel)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      [...messagesFor(plainFor, UNKNOWN_IDENTIFIER), ...messagesFor(topLevel, UNKNOWN_IDENTIFIER)],
      "DIAG-4: both controls carry the registry's own Message, so (q-A1) is compared against a live oracle",
    ).toEqual([
      registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Zzz" }),
      registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Zzz" }),
    ]);
  });

  it("(q-C1) an undeclared CALLEE in the body draws unknown-identifier", () => {
    // §Reproduction row C1. The `call` arm passes site `"call"`, which is the
    // position `theta/parse/unknown-identifier`'s *Trigger* names first; before
    // bug 0224 this became an `Err(invoke_infra, cause:"internal_error")` at run
    // whose message blamed bug 0003's parse-time shape gate (§Reproduction R3).
    const src = "let a = par for i in [1, 2] { zzz(1) }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction C1): the callee resolves through no arm of expressions.md:44–:49. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "zzz" })]);
  });

  it("(q-C1-control) CONTROL: the identical undeclared call at the TOP LEVEL already fires", () => {
    // §Reproduction row C2.
    const src = "let a = zzz(1)\na";
    expect(
      diagShapeOf(src),
      `CONTROL (§Reproduction C2): the call position is already refused outside the loop. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
  });

  it("(q-H4) a MEMBER receiver in the body draws unknown-identifier for the receiver", () => {
    // §Reproduction row H4. The receiver is a resolution site; `.f` is not.
    // Before the arm this became that element's `Err(invoke_infra,
    // cause:"panic")` "null member access: .f" — a message naming the access
    // and not the receiver's spelling (§Reproduction R6).
    const src = "let a = par for i in [1, 2] { Zzz.f }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction H4). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "DIAG-4: message read from the registry's Message column — the RECEIVER's name, not the field's",
    ).toEqual([registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Zzz" })]);
  });

  it("(q-H4-control) CONTROL: the identical member read at the TOP LEVEL already fires", () => {
    const src = "let a = Zzz.f\na";
    expect(
      diagShapeOf(src),
      `CONTROL: the member arm already judges a receiver outside the loop. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
  });

  it("(q-H5) a METHOD receiver in the body draws unknown-identifier for the receiver", () => {
    // §Reproduction row H5.
    const src = "let a = par for i in [1, 2] { Zzz.len() }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction H5). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Zzz" })]);
  });

  it("(q-H5-control) CONTROL: the identical method receiver at the TOP LEVEL already fires", () => {
    const src = "let a = Zzz.len()\na";
    expect(
      diagShapeOf(src),
      `CONTROL: the method-call arm already judges a receiver outside the loop. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
  });

  it("(q-H6) a nested plain `for` INSIDE the body is judged too", () => {
    // §Reproduction row H6, and the reason §Actual behaviour calls the absence
    // TOTAL rather than partial: the drop happened at the `par-for` node, so an
    // inner block form the walk already covered was unreached while its `par
    // for` ancestor was.
    const src = [
      "let a = par for i in [1, 2] {",
      "  for j in [1] { Zzz }",
      "  1",
      "}",
      "a",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction H6): the hole was the \`par-for\` node itself, not the depth. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      diagRangesOf(src),
      "the diagnostic is ranged at the identifier inside the NESTED block",
    ).toEqual([`${UNKNOWN_IDENTIFIER} @ 2:18-2:21`]);
  });

  it("(q-H7) a `match` ARM inside the body is judged too", () => {
    // §Reproduction row H7.
    const src = "let a = par for i in [1, 2] { match i { _ => Zzz } }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction H7). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Zzz" })]);
  });

  it("(q-H7-control) CONTROL: the identical `match` arm at the TOP LEVEL already fires", () => {
    const src = "let a = match 1 { _ => Zzz }\na";
    expect(
      diagShapeOf(src),
      `CONTROL: a \`match\` arm is a position the walk already reached. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
  });

  it("(q-H12) a `par for` NESTED in a `par for` body is judged too", () => {
    // §Reproduction row H12: the arm is recursive through `walkIdentExpr`, so
    // the inner construct is reached by the same case that reaches the outer.
    const src = "let a = par for i in [1] { par for j in [1] { Zzz } }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction H12). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
  });

  it("(q-H10) the `max` WIDTH OPERAND is judged in the enclosing scope", () => {
    // §Reproduction row H10. The `max` operand is the arm's second limb and is
    // walked in the ENCLOSING scope, so the per-iteration variable does not
    // cover it.
    const src = "let a = par for i in [1, 2] max Yyy { i }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction H10). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Yyy" })]);
  });

  it("(q-H11) an ITERAND ELEMENT is judged in the enclosing scope", () => {
    // §Reproduction row H11 — the arm's first limb, walked before the body.
    const src = "let a = par for i in [Zzz] { i }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction H11). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Zzz" })]);
  });

  it("(q-order) EMISSION ORDER is load-bearing: iterand, then `max`, then body", () => {
    // §Fix (a): "Order is load-bearing and asserted: iterand, then `max`, then
    // body, matching `walkExpr`'s arm". Three undeclared names, one per limb,
    // so the ordered message list IS the traversal order.
    const src = "let a = par for i in [Aaa] max Bbb { Ccc }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Fix (a)): one refusal per limb, three in all. Observed: ${showDiags(src)}`,
    ).toEqual([
      `error ${UNKNOWN_IDENTIFIER}`,
      `error ${UNKNOWN_IDENTIFIER}`,
      `error ${UNKNOWN_IDENTIFIER}`,
    ]);
    expect(
      messagesFor(src, UNKNOWN_IDENTIFIER),
      "the ORDER is the arm's traversal order: iterand (`Aaa`), then `max` (`Bbb`), then body (`Ccc`) — a body-first or max-first arm reds here",
    ).toEqual([
      registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Aaa" }),
      registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Bbb" }),
      registryMessageFor(UNKNOWN_IDENTIFIER, { "<name>": "Ccc" }),
    ]);
  });
});

describe("bug 0224 — the identifier walk descends a `par for` (type-as-value)", () => {
  it("(q-B1) a declared `schema` name as the body's TAIL is theta/parse/type-as-value", () => {
    // §Reproduction row B1. Bug 0140's own three-way rule decides this at
    // `emitUnknownIdentifier` (src/parser/theta-document.ts:5303): a name in
    // `typeOnlyNames` at a `"value"` site is `theta/parse/type-as-value`. No
    // new emitter and no new code — bug 0224 adds reach only.
    const src = "schema P { a: number }\nlet a = par for i in [1, 2] { P }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction B1). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${TYPE_AS_VALUE}`]);
    expect(
      messagesFor(src, TYPE_AS_VALUE),
      "DIAG-4: message read from the registry's Message column, `<name>` bound to the declaration",
    ).toEqual([registryMessageFor(TYPE_AS_VALUE, { "<name>": "P" })]);
  });

  it("(q-B1-control) CONTROL: the same declared name at the TOP LEVEL and under a plain `for`", () => {
    // §Reproduction rows B2 and B3.
    const topLevel = "schema P { a: number }\nlet a = P\na";
    expect(
      diagShapeOf(topLevel),
      `CONTROL (§Reproduction B2). Observed: ${showDiags(topLevel)}`,
    ).toEqual([`error ${TYPE_AS_VALUE}`]);
    const plainFor = "schema P { a: number }\nfor i in [1, 2] { P }\n1";
    expect(
      diagShapeOf(plainFor),
      `CONTROL (§Reproduction B3): the plain-\`for\` spelling of the same body. Observed: ${showDiags(plainFor)}`,
    ).toEqual([`error ${TYPE_AS_VALUE}`]);
  });

  it("(q-B4) a declared `enum` name in the body is theta/parse/type-as-value", () => {
    // §Reproduction row B4: the silence was symmetric across BOTH codes,
    // because both are pushed by the one sink the arm never reached.
    const src = "enum E { A }\nlet a = par for i in [1, 2] { E }\na";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction B4). Observed: ${showDiags(src)}`,
    ).toEqual([`error ${TYPE_AS_VALUE}`]);
    expect(
      messagesFor(src, TYPE_AS_VALUE),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([registryMessageFor(TYPE_AS_VALUE, { "<name>": "E" })]);
  });

  it("(q-discarded) the `discarded` site kind holds inside the body, BOTH ways", () => {
    // §Fix (b) requires this MEASURED, not assumed. `emitUnknownIdentifier`'s
    // `site` parameter leaves a `typeOnlyNames` name silent at a DISCARDED
    // expression-statement position (the no-op class of bugs 0033 / 0042,
    // pinned by bug 0140's cell g5) — and `walkIdentStmt`'s `case "expr"`
    // (src/parser/theta-document.ts:5425) is the only site that passes
    // `"discarded"`. A `par for` body's TAIL is not discarded: it is the element
    // value CTRL-3 collects (docs/spec_topics/control-flow.md:74), and
    // `walkIdentBlock` (`:5350`) walks a tail with the default `"value"` site.
    // MEASURED: the tail refuses, the non-tail statement stays silent.
    const tail = "schema P { a: number }\nlet a = par for i in [1, 2] { P }\na";
    expect(
      diagShapeOf(tail),
      `TAIL is the element value CTRL-3 collects, so it is a VALUE site and refuses. Observed: ${showDiags(tail)}`,
    ).toEqual([`error ${TYPE_AS_VALUE}`]);
    const nonTail = [
      "schema P { a: number }",
      "let a = par for i in [1, 2] {",
      "  P",
      "  1",
      "}",
      "a",
    ].join("\n");
    expect(
      diagShapeOf(nonTail),
      `NON-TAIL: the same bare declared name as a discarded expression STATEMENT of the body stays silent — bug 0140's g5 licence is position-shaped and carries into the newly-reached block unchanged, which is what keeps this fix reach-only. Observed: ${showDiags(nonTail)}`,
    ).toEqual([]);
    const undeclaredNonTail = [
      "let a = par for i in [1, 2] {",
      "  Zzz",
      "  1",
      "}",
      "a",
    ].join("\n");
    expect(
      diagShapeOf(undeclaredNonTail),
      `CONTRAST: the licence is CODE-specific, not a position-wide exemption — an UNDECLARED name at the same discarded position is still refused. Observed: ${showDiags(undeclaredNonTail)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`]);
  });
});

describe("bug 0224 — nothing else in the `par for` subtree moves", () => {
  it("(q-H8) CONTROL: the per-iteration VARIABLE keeps resolving — the body stays `[]`", () => {
    // §Reproduction row H8, the control that constrains the fix. The loop
    // variable is resolution arm (1) (expressions.md:46, and `:53` names the
    // `par for` variable among the locals it binds), so the body scope must be
    // a COPY of the enclosing scope with the variable ADDED — an arm that
    // reseeded from `walkCtx.roots` (the `fn` shape) would red here.
    const src = "let a = par for i in [1, 2] { i }\na";
    expect(
      diagShapeOf(src),
      `CONTROL (bug 0224 §Reproduction H8): reading the per-iteration variable draws nothing. Observed: ${showDiags(src)}`,
    ).toEqual([]);
  });

  it("(q-scope) CONTROL: a body `let` resolves for later reads, and a `match` binder inside its arm", () => {
    // §Expected behaviour: "A name a `let` inside the body binds resolves for
    // the reads that follow it, and a `match` pattern binding resolves inside
    // its arm — the same block-local accumulation
    // `checkUnknownIdentifiers`' doc comment states for every other block".
    const bodyLet = [
      "let a = par for i in [1, 2] {",
      "  let n = i",
      "  n",
      "}",
      "a",
    ].join("\n");
    expect(
      diagShapeOf(bodyLet),
      `CONTROL: \`walkIdentStmt\`'s \`let\` arm accumulates into the body's own scope copy. Observed: ${showDiags(bodyLet)}`,
    ).toEqual([]);
    const matchBinder = "let a = par for i in [1, 2] { match i { n => n } }\na";
    expect(
      diagShapeOf(matchBinder),
      `CONTROL: \`collectPatternBindings\` seeds the arm scope inside the newly-reached body. Observed: ${showDiags(matchBinder)}`,
    ).toEqual([]);
  });

  it("(q-H1) UNCHANGED: a `fn` name in the body stays EXACTLY ONE function-as-value", () => {
    // §Reproduction row H1 / §Expected behaviour: bug 0118's landed structural
    // arm already judges this name in this position, and the widened identifier
    // walk must not add a second verdict — a `fn` name is in
    // `IdentWalkContext.roots`, so `emitUnknownIdentifier`'s scope test answers
    // for it before either refusal can.
    const src = "fn f(): number { 1 }\nlet a = par for i in [1, 2] { f }\na";
    expect(
      diagShapeOf(src),
      `CONTROL (bug 0224 §Reproduction H1): count is EXACTLY one, and the code is the structural walk's. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${FUNCTION_AS_VALUE}`]);
    expect(
      messagesFor(src, FUNCTION_AS_VALUE),
      "DIAG-4: message read from the registry's Message column, unmoved",
    ).toEqual([registryMessageFor(FUNCTION_AS_VALUE, { "<name>": "f" })]);
  });

  it("(q-H2) UNCHANGED: `Enum.Zz` in the body stays EXACTLY ONE unknown-variant", () => {
    // §Reproduction row H2. The identifier walk's `member` arm LICENSES a
    // declared-enum receiver (`IdentWalkContext.declaredEnums`, bug 0140's
    // landed shape), so the newly-reached receiver draws no `type-as-value`
    // beside the variant verdict.
    const src = "enum E { A }\nlet a = par for i in [1, 2] { E.Zz }\na";
    expect(
      diagShapeOf(src),
      `CONTROL (bug 0224 §Reproduction H2): the \`Enum.Variant\` receiver licence carries into the newly-reached body. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_VARIANT}`]);
    expect(
      messagesFor(src, UNKNOWN_VARIANT),
      "DIAG-4: message read from the registry's Message column",
    ).toEqual([
      registryMessageFor(UNKNOWN_VARIANT, { "<variant>": "Zz", "<enum>": "E" }),
    ]);
  });

  it("(q-H3) UNCHANGED: the shadowed-callable pair keeps its codes, counts and ranges — no `(code, range)` doubles", () => {
    // §Reproduction row H3 and §Fix (b)'s named question: "State per code whether
    // a newly-reached position produces one diagnostic or two for the same
    // `(code, range)` pair — H3's `shadowed-callable-call` is the row to check
    // first, since its own walk already judges the same name in the same
    // position".
    //
    // MEASURED ANSWER: NO pair doubles. `walkCallSiteExpr`'s own `par-for` arm
    // (src/parser/theta-document.ts:6353–:6364) binds the per-iteration
    // variable at `:6362` and emits the shadow verdict; the identifier walk's
    // newly-reached arm binds the SAME variable into the body scope, so
    // `emitUnknownIdentifier`'s unconditional scope test (`:5312`) returns
    // before either of its refusals can push. The two walks therefore judge the
    // same name to different ends without colliding.
    const src = [
      "---",
      "mode: prompt",
      "tools:",
      "  - read",
      "---",
      'let a = par for read in [1, 2] { read({ path: "x" }) }',
      "a",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL (bug 0224 §Reproduction H3): exactly the two codes the call-site walk already drew. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${SHADOWED_CALLABLE_CALL}`, `error ${BARE_OBJECT_LITERAL}`]);
    const ranges = diagRangesOf(src);
    expect(
      new Set(ranges).size,
      `§Fix (b)'s doubling question, asserted: every \`(code, range)\` pair is DISTINCT, so no newly-reached position produced a second copy of a code its own walk already emitted. Observed: ${JSON.stringify(ranges)}`,
    ).toBe(ranges.length);
  });

  it("(q-H3-control) CONTROL: the plain-`for` spelling draws the identical pair", () => {
    const src = [
      "---",
      "mode: prompt",
      "tools:",
      "  - read",
      "---",
      'for read in [1, 2] { read({ path: "x" }) }',
      "1",
    ].join("\n");
    expect(
      diagShapeOf(src),
      `CONTROL: the call-site walk's \`for\` arm draws the same pair, so (q-H3)'s counts belong to that check and not to the identifier walk. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${SHADOWED_CALLABLE_CALL}`, `error ${BARE_OBJECT_LITERAL}`]);
  });

  it("(q-iterand) the TYPE layer's non-array-iterand SURVIVES, beside the identifier refusal, in that order", () => {
    // §Reproduction (B)'s closing row: the one code that already crossed the
    // boundary from another traversal (`type-layer-checks.ts`'s own iterand
    // verdict on a name identifier resolution never judged). Bug 0224 adds the
    // identifier verdict AHEAD of it and removes nothing — the same
    // parse-before-type ordering bug 0140's group (c) already pins.
    const src = "let c = par for z in Zzz { z }\nc";
    expect(
      diagShapeOf(src),
      `PRIMARY (bug 0224 §Reproduction, iterand row): both verdicts, identifier refusal FIRST. Observed: ${showDiags(src)}`,
    ).toEqual([`error ${UNKNOWN_IDENTIFIER}`, `error ${NON_ARRAY_ITERAND}`]);
    expect(
      messagesFor(src, NON_ARRAY_ITERAND),
      "DIAG-4: the type layer's row is unmoved, message read from the registry's Message column",
    ).toEqual([registryMessageFor(NON_ARRAY_ITERAND, { "<type>": "Zzz" })]);
  });
});

// ===========================================================================
// PARSER — both enclosing modes admit `par for` (CTRL-4)
// ===========================================================================

describe("RFC-0003 par-for — legal in prompt- and subagent-mode thetas (CTRL-4)", () => {
  const withFrontmatter = (mode: string, bodySrc: string): string =>
    ["---", `mode: ${mode}`, "---", bodySrc].join("\n");

  it("CTRL-4: a prompt-mode theta may contain `par for` (RED — feature absent)", () => {
    const doc = parse(
      withFrontmatter("prompt", "let r = par for f in [1, 2, 3] { f }\nr"),
    );
    expect(
      parForNodes(doc.body).length,
      "iteration isolation severs the body↔conversation link, so `par for` is legal in prompt mode",
    ).toBeGreaterThan(0);
    expect(doc.diagnostics.map((d) => d.code)).not.toContain(
      "theta/parse/par-query-in-body",
    );
  });

  it("CTRL-4: a subagent-mode theta may contain `par for` (RED — feature absent)", () => {
    const doc = parse(
      withFrontmatter("subagent", "let r = par for f in [1, 2, 3] { f }\nr"),
    );
    expect(
      parForNodes(doc.body).length,
      "`par for` is legal in subagent mode too — isolation is independent of the enclosing mode",
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// PARSER — nesting is legal (CTRL-2: throttle is per-loop)
// ===========================================================================

describe("RFC-0003 par-for — nesting is legal (CTRL-2)", () => {
  it("CTRL-2: `par for` inside `par for` parses to a nested `par-for` node (RED — feature absent)", () => {
    const doc = parse(
      [
        "let grid = par for row in [1, 2] {",
        "  par for col in [3, 4] { col }",
        "}",
        "grid",
      ].join("\n"),
    );
    const nodes = parForNodes(doc.body);
    expect(
      nodes.length,
      "both the outer and inner `par for` lower to `par-for` nodes (nesting is legal; throttle is per-loop)",
    ).toBeGreaterThanOrEqual(2);
  });
});

// ===========================================================================
// TYPE SYSTEM — CTRL-3: value type is `array<Result<U, QueryError>>`
// ===========================================================================

const EMPTY_TYPE_ENV: TypeEnv = {};

function makeInferencePass(): StaticTypeInferencePass {
  const deps: StaticTypeInferenceDeps = { checkCompatible };
  return new StaticTypeInferencePass(deps);
}

describe("RFC-0003 par-for — static type is array<Result<U, QueryError>> (CTRL-3)", () => {
  it("CTRL-3: the inferred type of a `par for` over array<T> is an array (RED — feature absent)", () => {
    // The body tail type is `U` (here `integer`), so the value is
    // `array<Result<integer, QueryError>>`. This suite asserts the outer `array`
    // shape as the stable, representation-independent surface; the element being
    // `Result<U, QueryError>` is documented (below) and reported as an
    // assumption the implementer must honour in the CompatType model.
    const doc = parse("let r = par for f in [1, 2, 3] { f }\nr");
    const nodes = parForNodes(doc.body);
    expect(
      nodes.length,
      "a `par-for` node must exist for the inference pass to type it",
    ).toBeGreaterThan(0);

    const pass = makeInferencePass();
    const node = nodes[0] as unknown as Expr;
    const inferred: CompatType = pass.typeOf(node, EMPTY_TYPE_ENV);
    expect(inferred, "the pass assigns a static type to the `par-for` node").toBeDefined();
    expect(
      inferred.kind,
      "CTRL-3: the value of a `par for` is an `array<…>` (collected per-element results)",
    ).toBe("array");

    // Documented element expectation (CTRL-3): the array element type is
    // `Result<U, QueryError>`. `displayType` currently has no `Result` case, so
    // whether this renders as `Result<…>` depends on the implementer's chosen
    // CompatType representation; this is reported as an assumption in the notes.
    const rendered = displayType(inferred);
    expect(
      rendered.startsWith("array<"),
      `CTRL-3: rendered as an array type (got '${rendered}')`,
    ).toBe(true);
  });
});

// ===========================================================================
// RUNTIME harness — drive `executeBody` over real `par for` source
// ===========================================================================
//
// These tests parse a real `par for` source, then execute the parsed body
// through the tree-walking driver `executeBody`. Today the source mis-parses to
// a free identifier `par` plus a plain `for` statement, so the body's tail is
// not a `par-for` expression and `executeBody` yields the literal `null` final
// value (never the ordered `array<Result<…>>`); every runtime assertion below
// reds on that absence. Post-implementation the executor fans the parsed
// `par-for` out through the effect host and yields the ordered array.
//
// REQUIRED RUNTIME HOOK (documented for the implementer): the executor must
// evaluate a `par-for` expression by scheduling one body-evaluation per input
// element, routing each iteration's checkpointed effect (invoke / call / query)
// through `StatementEvalHost.runEffect`, concurrently up to `min(max, 64)`
// in-flight, collecting one `Result` per element into an input-index-ordered
// `array<Result<T, QueryError>>`. The instrumentation below (an in-flight peak
// counter, a completion-order log, and a per-index child-diagnostic recorder)
// observes that behaviour through `runEffect`; it stays inert until the executor
// routes `par-for` iterations through the host.

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/** Await `n` microtask turns — deterministic scheduling advance for the tests. */
async function tick(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

/** An `Ok(value)` operation result (the effect succeeded). */
function ok(value: ThetaValue): OperationResult {
  return { ok: true, value };
}

/** An `Err(error)` operation result (a non-cancel failure). */
function errResult(error: QueryError): OperationResult {
  return { ok: false, error };
}

/**
 * A `StatementEvalHost` for `par for` bodies. It evaluates the bounded pure
 * expression forms a fan-out body needs (literals / loop-var identifier / array
 * / binary / member / index) against the REAL per-iteration environment, and
 * treats `invoke` / `call` / `query` as checkpointed effects routed through
 * `runEffect`. It records concurrency (in-flight peak), completion order, and
 * per-iteration child diagnostics so the fan-out contract is observable.
 */
class ParForHost implements StatementEvalHost {
  inFlight = 0;
  peakInFlight = 0;
  readonly started: ThetaValue[] = [];
  readonly completed: ThetaValue[] = [];
  /** Child diagnostics recorded per iteration, in the order the executor drains them. */
  readonly drainedDiagnostics: Array<{ index: number; key: string }> = [];

  /** Per-first-argument-value effect outcome override (keyed by String(arg0)). */
  readonly results = new Map<string, OperationResult>();
  /** Per-first-argument-value microtask delay before the effect resolves. */
  readonly delays = new Map<string, number>();
  /** First-argument values whose effect throws a real `ThetaPanic` (one of the six closed panic sources → cause:"panic"). */
  readonly panics = new Set<string>();
  /** First-argument values whose effect throws an UNEXPECTED plain `Error` (runtime defect, not a panic source → cause:"internal_error"). */
  readonly defects = new Set<string>();
  /** First-argument values whose effect throws an uncatchable `HostFatal` (NOCEIL-3 → must propagate, never downgraded). */
  readonly hostFatals = new Set<string>();
  /** An optional gate every effect awaits before resolving (concurrency probe). */
  gate: Promise<void> | null = null;

  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(expr: Expr): CheckpointDescriptor | null {
    if (expr.kind === "call" || expr.kind === "query" || expr.kind === "invoke") {
      return { kind: "tool-call", site: { file: "test.theta", line: 1, column: 1 } };
    }
    return null;
  }

  async runEffect(
    expr: Expr,
    env: LexicalEnvironment,
    _evaluatedToolArgs?: Record<string, ThetaValue>,
  ): Promise<OperationResult> {
    // The executor passes pre-evaluated tool-args as a field-keyed object (or
    // `undefined` for `invoke`), so the payload is derived from the effect
    // expression's first argument evaluated against the per-iteration env — the
    // loop-variable binding — which is available both under the current
    // mis-parse (a plain `for` binds it) and post-implementation.
    const payload = this.#payloadOf(expr, env);
    const key = String(payload ?? null);
    this.started.push(payload ?? null);
    this.inFlight += 1;
    this.peakInFlight = Math.max(this.peakInFlight, this.inFlight);
    try {
      if (this.gate !== null) {
        await this.gate;
      }
      await tick(this.delays.get(key) ?? 0);
      if (this.panics.has(key)) {
        // A genuine runtime panic inside the iteration: one of the six closed
        // panic sources, modelled as a real `ThetaPanic` subclass. ERR-20
        // downgrades it to that element's Err(invoke_infra, cause:"panic"); it
        // must not abort the theta.
        throw new IndexOutOfBoundsPanic(`theta panic in iteration ${key}`);
      }
      if (this.defects.has(key)) {
        // An UNEXPECTED interpreter throw (a runtime defect, NOT one of the six
        // panic sources). ERR-20 downgrades it to that element's
        // Err(invoke_infra, cause:"internal_error") — not "panic".
        throw new Error(`unexpected interpreter throw in iteration ${key}`);
      }
      if (this.hostFatals.has(key)) {
        // An uncatchable host fatal (NOCEIL-3). It must propagate unwrapped out
        // of the loop — never downgraded to an Err element.
        throw new HostFatal(`host fatal in iteration ${key}`);
      }
      return this.results.get(key) ?? ok(payload ?? null);
    } finally {
      this.inFlight -= 1;
      this.completed.push(payload ?? null);
    }
  }

  /**
   * The effect payload: the first *data* argument expression evaluated against
   * env. An `InvokeExpr`'s `args[0]` is the callee path literal (data arguments
   * are `args.slice(1)`), whereas a `CallExpr`'s `args[0]` is already the first
   * data argument — so the first data argument is `args[1]` for `invoke` and
   * `args[0]` for `call`. (Harness fix: the earlier form read `args[0]` for
   * both, which yielded the constant callee path for every `invoke` iteration
   * rather than the per-iteration loop element.)
   */
  #payloadOf(expr: Expr, env: LexicalEnvironment): ThetaValue {
    if (expr.kind === "invoke") {
      const first = expr.args[1];
      return first === undefined ? null : this.#eval(first, env);
    }
    if (expr.kind === "call") {
      const first = expr.args[0];
      return first === undefined ? null : this.#eval(first, env);
    }
    return null;
  }

  #eval(expr: Expr, env: LexicalEnvironment): ThetaValue {
    switch (expr.kind) {
      case "number":
        return Number(expr.text);
      case "string":
        return expr.value;
      case "bool":
        return expr.value;
      case "null":
        return null;
      case "ident": {
        const r = env.resolve(expr.name);
        return "value" in r ? ((r.value ?? null) as ThetaValue) : null;
      }
      case "array":
        return expr.elements.map((e) => this.#eval(e, env));
      case "binary": {
        const l = this.#eval(expr.left, env);
        const rr = this.#eval(expr.right, env);
        if (expr.op === "+") {
          return (l as number) + (rr as number);
        }
        return null;
      }
      case "index": {
        const target = this.#eval(expr.target, env);
        const idx = this.#eval(expr.index, env);
        if (Array.isArray(target)) {
          const arr = target as readonly ThetaValue[];
          if (typeof idx === "number" && (idx < 0 || idx >= arr.length)) {
            // An out-of-bounds index is a genuine runtime panic source, modelled
            // as a real `IndexOutOfBoundsPanic`; inside a `par for` body it is
            // downgraded per ERR-20 to Err(invoke_infra, cause:"panic").
            throw new IndexOutOfBoundsPanic(
              `index out of bounds: ${idx} not in 0..${arr.length}`,
            );
          }
          return arr[idx as number] ?? null;
        }
        return null;
      }
      default:
        return null;
    }
  }
}

function execDeps(
  body: ThetaBody,
  host: StatementEvalHost,
  signal?: AbortSignal,
): ExecuteBodyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: signal ?? new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
    file: "test.theta",
  };
}

/** Parse `src` and return its body (for execution). */
function bodyOf(src: string): ThetaBody {
  return parse(src).body;
}

/** Assert `value` is a runtime `array<Result<…>>` and return it, else fail. */
function asResultArray(value: ThetaValue, why: string): readonly ThetaValue[] {
  expect(Array.isArray(value), why).toBe(true);
  const arr = value as readonly ThetaValue[];
  for (const el of arr) {
    expect(isResultValue(el), `${why}: each element is a Result value`).toBe(true);
  }
  return arr;
}

// ===========================================================================
// RUNTIME — CTRL-3: input-index ordering regardless of completion order
// ===========================================================================

describe("RFC-0003 par-for — results are input-index ordered (CTRL-3)", () => {
  it("CTRL-3: the result array is input-index ordered even when iterations complete in reverse (RED — feature absent)", async () => {
    const host = new ParForHost();
    // Higher indices resolve FIRST (fewer microtask delays), so completion order
    // is the reverse of input order; the collected array must still be input
    // ordered.
    host.delays.set("0", 6);
    host.delays.set("1", 4);
    host.delays.set("2", 2);
    host.delays.set("3", 0);

    const body = bodyOf(
      "par for i in [0, 1, 2, 3] { invoke(\"./child.theta\", i) }",
    );
    const exec = await executeBody(body, execDeps(body, host));

    expect(exec.result.present, "the fan-out yields a final value").toBe(true);
    const arr = asResultArray(
      exec.result.value as ThetaValue,
      "CTRL-3: `par for` yields array<Result<…>>",
    );
    expect(arr.length, "one Result per input element").toBe(4);
    expect(
      arr.map((el) => (el as { ok: boolean; value: ThetaValue }).value),
      "CTRL-3: element i corresponds to input element i, regardless of completion order",
    ).toEqual([0, 1, 2, 3]);
  });
});

// ===========================================================================
// RUNTIME — CTRL-1 reuse: iterand snapshot + fresh immutable loop var
// ===========================================================================

describe("RFC-0003 par-for — iterand snapshot & fresh loop var (CTRL-1 reuse)", () => {
  it("CTRL-1: every snapshotted input element is dispatched exactly once (RED — feature absent)", async () => {
    const host = new ParForHost();
    const body = bodyOf(
      "par for x in [10, 20, 30] { invoke(\"./child.theta\", x) }",
    );
    const exec = await executeBody(body, execDeps(body, host));

    const arr = asResultArray(
      exec.result.value as ThetaValue,
      "CTRL-1: the iterand snapshot is fanned out",
    );
    expect(arr.length, "one iteration per snapshot element").toBe(3);
    expect(
      [...host.started].sort((a, b) => Number(a) - Number(b)),
      "CTRL-1: each fresh loop-var binding carries its own snapshot element, dispatched once",
    ).toEqual([10, 20, 30]);
  });
});

// ===========================================================================
// RUNTIME — CTRL-2: concurrency width cap (max) and default throttle
// ===========================================================================

describe("RFC-0003 par-for — concurrency width cap (CTRL-2)", () => {
  it("CTRL-2: `max n` bounds in-flight iterations to at most n (RED — feature absent)", async () => {
    const host = new ParForHost();
    // Hold every effect open on a gate so the peak in-flight count is the
    // scheduling width the executor admits.
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      "par for f in [0, 1, 2, 3, 4, 5, 6, 7] max 3 { invoke(\"./child.theta\", f) }",
    );
    const execPromise = executeBody(body, execDeps(body, host));
    // Let the scheduler admit its initial batch.
    await tick(20);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      host.completed.length,
      "CTRL-2: all 8 iterations run to completion (excess queues, then starts)",
    ).toBe(8);
    expect(
      peakWhileGated,
      "CTRL-2: `max 3` admits at most 3 iterations in flight at once",
    ).toBeLessThanOrEqual(3);
    expect(
      peakWhileGated,
      "CTRL-2: the fan-out is actually concurrent (more than one in flight)",
    ).toBeGreaterThan(1);
  });

  it("CTRL-2: without `max`, fan-out is bounded by the default width throttle of 64 (RED — feature absent)", async () => {
    const host = new ParForHost();
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    // 130 elements, no `max`: excess over the 64 throttle queues.
    const inputs = Array.from({ length: 130 }, (_, i) => i).join(", ");
    const body = bodyOf(
      `par for f in [${inputs}] { invoke("./child.theta", f) }`,
    );
    const execPromise = executeBody(body, execDeps(body, host));
    await tick(50);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      host.completed.length,
      "CTRL-2: all 130 iterations run to completion (excess queues 64-at-a-time)",
    ).toBe(130);
    expect(
      peakWhileGated,
      "CTRL-2 / #par-for-width-throttle: the default throttle bounds in-flight to 64",
    ).toBeLessThanOrEqual(64);
    expect(
      peakWhileGated,
      "CTRL-2: the fan-out is concurrent up to the throttle (well above 1)",
    ).toBeGreaterThan(1);
  });

  it("CTRL-2: a `max` above the throttle clamps down to 64 (RED — feature absent)", async () => {
    const host = new ParForHost();
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const inputs = Array.from({ length: 130 }, (_, i) => i).join(", ");
    const body = bodyOf(
      `par for f in [${inputs}] max 1000 { invoke("./child.theta", f) }`,
    );
    const execPromise = executeBody(body, execDeps(body, host));
    await tick(50);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: a `max` exceeding the throttle clamps to the 64 throttle (not the 130 elements, not the requested 1000)",
    ).toBeLessThanOrEqual(64);
    expect(
      peakWhileGated,
      "CTRL-2: the fan-out is actually concurrent (well above 1) — proving the clamp is to 64, not down to sequential",
    ).toBeGreaterThan(1);
  });
});

// ===========================================================================
// RUNTIME — CTRL-5: run-to-completion; per-element Err isolation
// ===========================================================================

describe("RFC-0003 par-for — run-to-completion & per-element Err (CTRL-5)", () => {
  it("CTRL-5: one iteration's `Err` does not cancel siblings; it becomes that element's value (RED — feature absent)", async () => {
    const host = new ParForHost();
    const failure: QueryError = {
      kind: "validation",
      cause: "schema_validation",
      message: "bad element",
      attempts: 0,
      validation_errors: [],
      raw_response: null,
    };
    host.results.set("1", errResult(failure));

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );
    const exec = await executeBody(body, execDeps(body, host));

    const arr = asResultArray(
      exec.result.value as ThetaValue,
      "CTRL-5: `par for` yields a full array even with a failing element",
    );
    expect(arr.length, "all siblings run to completion").toBe(3);

    const el1 = arr[1] as { ok: boolean; error?: QueryError };
    expect(el1.ok, "CTRL-5: element 1 is an Err").toBe(false);
    expect(el1.error?.kind, "CTRL-5: element 1 carries its own QueryError").toBe(
      "validation",
    );
    expect(
      (arr[0] as { ok: boolean }).ok && (arr[2] as { ok: boolean }).ok,
      "CTRL-5: siblings 0 and 2 still complete successfully",
    ).toBe(true);
  });
});

// ===========================================================================
// RUNTIME — ERR-20: per-iteration panic downgrade
// ===========================================================================

describe("RFC-0003 par-for — per-iteration panic downgrade (ERR-20)", () => {
  it("ERR-20: a panic inside one iteration becomes that element's Err(invoke_infra, panic); siblings complete (RED — feature absent)", async () => {
    const host = new ParForHost();
    host.panics.add("1"); // iteration for input `1` panics.

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "ERR-20: a per-iteration panic must NOT abort the theta (the iteration boundary is a panic-downgrade point)",
    ).toBe(false);

    const arr = asResultArray(
      exec?.result.value as ThetaValue,
      "ERR-20: the loop still yields a full array<Result<…>>",
    );
    expect(arr.length, "ERR-20: siblings run to completion, full array yielded").toBe(3);

    const el1 = arr[1] as { ok: boolean; error?: QueryError };
    expect(el1.ok, "ERR-20: the panicking element is an Err").toBe(false);
    expect(el1.error?.kind, "ERR-20: kind is 'invoke_infra'").toBe("invoke_infra");
    expect(
      (el1.error as { cause?: string } | undefined)?.cause,
      "ERR-20: a genuine ThetaPanic downgrades with cause 'panic'",
    ).toBe("panic");
    expect(
      (el1.error as { message?: string } | undefined)?.message,
      "ERR-20: the downgrade carries the thrown panic's message",
    ).toBe("theta panic in iteration 1");
  });

  it("ERR-20: an UNEXPECTED throw (runtime defect, not a panic source) downgrades to that element's Err(invoke_infra, cause:'internal_error')", async () => {
    // Mirrors the invoke boundary (`runInvokeChild`): a thrown value that is NOT
    // a `ThetaPanic` is an interpreter defect routed to the parent as
    // Err(invoke_infra, cause:"internal_error") — NOT "panic". This locks in the
    // fix for the collapse defect where every throw became cause:"panic".
    const host = new ParForHost();
    host.defects.add("1"); // iteration for input `1` throws a plain Error.

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "ERR-20: an unexpected iteration throw must NOT abort the theta (it is downgraded)",
    ).toBe(false);

    const arr = asResultArray(
      exec?.result.value as ThetaValue,
      "ERR-20: the loop still yields a full array<Result<…>>",
    );
    expect(arr.length, "ERR-20: siblings run to completion, full array yielded").toBe(3);

    const el1 = arr[1] as { ok: boolean; error?: QueryError };
    expect(el1.ok, "ERR-20: the defecting element is an Err").toBe(false);
    expect(el1.error?.kind, "ERR-20: kind is 'invoke_infra'").toBe("invoke_infra");
    expect(
      (el1.error as { cause?: string } | undefined)?.cause,
      "ERR-20: a non-panic (defect) throw downgrades with cause 'internal_error', NOT 'panic'",
    ).toBe("internal_error");
    expect(
      (el1.error as { message?: string } | undefined)?.message,
      "ERR-20: the internal_error downgrade carries the thrown error's message",
    ).toBe("unexpected interpreter throw in iteration 1");
    // Siblings are ordinary Ok values.
    expect((arr[0] as { ok: boolean }).ok, "ERR-20: sibling 0 completes Ok").toBe(true);
    expect((arr[2] as { ok: boolean }).ok, "ERR-20: sibling 2 completes Ok").toBe(true);
  });

  it("ERR-20/NOCEIL-3: a HostFatal thrown in an iteration is NOT downgraded — it propagates unwrapped", async () => {
    // NOCEIL-3 (hard-ceilings.md): an uncatchable host fatal terminates the
    // process; the iteration boundary must rethrow it (as the invoke boundary
    // does), never collapse it into an Err element. Modelled via the `HostFatal`
    // marker so the carve-out is testable without a production V8 OOM.
    const host = new ParForHost();
    host.hostFatals.add("1"); // iteration for input `1` raises a host fatal.

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );

    let thrown: unknown;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch (e) {
      thrown = e;
    }
    expect(
      exec,
      "ERR-20/NOCEIL-3: a HostFatal must NOT be downgraded to a value/Err element",
    ).toBeUndefined();
    expect(
      thrown instanceof HostFatal,
      "ERR-20/NOCEIL-3: the HostFatal propagates unwrapped out of the loop",
    ).toBe(true);
  });

  it("ERR-20: a pure-computation panic (no invoke) downgrades with callee_path = enclosing .theta path (RED — feature absent)", async () => {
    // ERR-20: for the no-invoke case there is no callee to name, so the
    // InvokeInfraError's required `callee_path` is the path of the `.theta` file
    // containing the `par for` body (the enclosing source file — here
    // "enclosing.theta").
    const host = new ParForHost();
    const src = "par for x in [0, 1] { let a = [7]\n a[9] }";
    const body = parse(src, "enclosing.theta").body;

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, {
        ...execDeps(body, host),
        file: "enclosing.theta",
      });
    } catch {
      threw = true;
    }
    expect(
      threw,
      "ERR-20: a pure-computation panic in a no-invoke body is downgraded, not thrown out of the theta",
    ).toBe(false);

    const arr = asResultArray(
      exec?.result.value as ThetaValue,
      "ERR-20: the no-invoke panic case still yields a full array",
    );
    expect(arr.length, "ERR-20: one Result per element").toBe(2);
    for (const el of arr) {
      const e = el as { ok: boolean; error?: QueryError };
      expect(e.ok, "ERR-20: an out-of-bounds index panics per element").toBe(false);
      expect(e.error?.kind, "ERR-20: kind is 'invoke_infra'").toBe("invoke_infra");
      expect(
        (e.error as { cause?: string } | undefined)?.cause,
        "ERR-20: cause is 'panic'",
      ).toBe("panic");
      expect(
        (e.error as { callee_path?: string } | undefined)?.callee_path,
        "ERR-20: no-invoke callee_path is the enclosing .theta source path",
      ).toBe("enclosing.theta");
    }
  });
});

// ===========================================================================
// RUNTIME — CTRL-5: cancellation
// ===========================================================================

describe("RFC-0003 par-for — cancellation (CTRL-5)", () => {
  // CTRL-5 distinguishes TWO cancellation forms (see control-flow.md #ctrl-5 and
  // the RFC's Cancellation bullet, clarified alongside this suite):
  //   (a)/(b) WHOLE-THETA cancellation — the enclosing theta's `AbortSignal`
  //           fires — is a terminal `Cancelled` outcome: NO final value flows
  //           (`present === false`), consistent with FN-5 and the terminal-
  //           outcome trichotomy; the partial array is NOT a top-level value.
  //   (c)     PER-ELEMENT cancellation — a child cancelled within the
  //           run-to-completion model (enclosing signal NOT fired) — becomes
  //           that element's `Err(cancelled)` value in the collected array.

  it("CTRL-5 (whole-theta, pre-abort): a signal already aborted at loop entry starts no iteration and yields a terminal Cancelled outcome with no final value (RED — feature absent)", async () => {
    const host = new ParForHost();
    const controller = new AbortController();
    controller.abort(); // enclosing theta already cancelled at loop entry.

    const body = bodyOf(
      "let r = par for f in [0, 1, 2, 3] { invoke(\"./child.theta\", f) }\nr",
    );
    // This cancellation contract is about the `par for` form, so the source must
    // lower to a `par-for` node for the assertions below to mean anything (RED
    // today — the form mis-parses to `par` + a plain `for` statement).
    expect(
      parForNodes(body).length,
      "the source must lower to a `par-for` for the whole-theta cancellation contract to apply",
    ).toBeGreaterThan(0);

    const exec = await executeBody(body, execDeps(body, host, controller.signal));

    expect(
      host.started.length,
      "CTRL-5 whole-theta cancellation: not-yet-started iterations do not start (none start under a pre-aborted signal)",
    ).toBe(0);
    expect(
      exec.outcome,
      "CTRL-5 whole-theta cancellation: the terminal outcome is Cancelled",
    ).toBe("cancel");
    expect(
      exec.result.present,
      "CTRL-5 / FN-5: no final value flows under whole-theta cancellation (the partial array is NOT surfaced as a top-level value)",
    ).toBe(false);
  });

  it("CTRL-5 (whole-theta, in-flight abort): aborting after a concurrent batch has started cancels in-flight iterations, starts no queued iteration, and yields a terminal Cancelled outcome with no final value (RED — feature absent)", async () => {
    const host = new ParForHost();
    const controller = new AbortController();
    // Hold every effect open on a gate so a concurrent batch is genuinely in
    // flight (not merely not-yet-started) at the moment the abort lands.
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      "let r = par for f in [0, 1, 2, 3, 4, 5, 6, 7] max 3 { invoke(\"./child.theta\", f) }\nr",
    );
    const execPromise = executeBody(
      body,
      execDeps(body, host, controller.signal),
    );
    // Let the scheduler admit its first gated batch (`max 3`).
    await tick(20);
    const startedWhileInFlight = host.started.length;
    const peakWhileInFlight = host.peakInFlight;

    controller.abort(); // whole-theta cancellation, mid-flight.
    release();
    const exec = await execPromise;

    expect(
      peakWhileInFlight,
      "CTRL-5: the abort lands with a concurrent batch actually in flight (more than one iteration running)",
    ).toBeGreaterThan(1);
    expect(
      startedWhileInFlight,
      "CTRL-5: at least the first gated batch had started before the abort (in-flight cancellation is exercised, not only not-yet-started)",
    ).toBeGreaterThanOrEqual(1);
    expect(
      host.started.length,
      "CTRL-5 whole-theta cancellation: queued (not-yet-started) iterations do not start once the signal fires",
    ).toBeLessThan(8);
    expect(
      exec.outcome,
      "CTRL-5 whole-theta cancellation: the terminal outcome is Cancelled",
    ).toBe("cancel");
    expect(
      exec.result.present,
      "CTRL-5 / FN-5: no final value flows under whole-theta cancellation",
    ).toBe(false);
  });

  it("CTRL-5 (per-element): a child cancelled within the run-to-completion model becomes that element's Err(cancelled); siblings complete and the loop outcome is Success (RED — feature absent)", async () => {
    const host = new ParForHost();
    const cancelled: QueryError = { kind: "cancelled", message: "cancelled" };
    host.results.set("1", errResult(cancelled)); // element 1's child is cancelled.

    // The enclosing theta's signal is NOT aborted — this is per-element, not
    // whole-theta, cancellation, so the loop runs to completion.
    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );
    const exec = await executeBody(body, execDeps(body, host));

    expect(
      exec.outcome,
      "CTRL-5 per-element: with no whole-theta abort the loop runs to completion (Success outcome)",
    ).toBe("success");
    const arr = asResultArray(
      exec.result.value as ThetaValue,
      "CTRL-5 per-element: the loop yields a full array even with a cancelled element",
    );
    expect(arr.length, "all siblings run to completion").toBe(3);

    const el1 = arr[1] as { ok: boolean; error?: QueryError };
    expect(el1.ok, "CTRL-5 per-element: element 1 is an Err").toBe(false);
    expect(
      el1.error?.kind,
      "CTRL-5 per-element: a cancelled iteration carries the CancelledError envelope as its element value (kind 'cancelled')",
    ).toBe("cancelled");
    expect(
      (arr[0] as { ok: boolean }).ok && (arr[2] as { ok: boolean }).ok,
      "CTRL-5 per-element: cancelling one child does not cancel its siblings",
    ).toBe(true);
  });
});

// ===========================================================================
// RUNTIME — CTRL-3: child-diagnostic drain grouped by input index
// ===========================================================================

describe("RFC-0003 par-for — diagnostics drain grouped by input index (CTRL-3)", () => {
  // ---- Chosen diagnostics-drain seam (F1) --------------------------------
  //
  // The executor's `StatementEvalHost` / `ExecuteBodyDeps` surface exposes NO
  // diagnostic drain today, and child (invoke) diagnostics do NOT flow through
  // `executeBody` at all — they are routed by the composition layer's
  // `emitDiagnostic` sink / `theta-system-note` runtime-event channel
  // (production-composition.ts / runtime-event-channel.ts), which the executor
  // never sees. There is therefore no existing executor-level surface to target
  // (option (a) is unavailable), so CTRL-3's "child diagnostics aggregate …
  // grouped by input index, then (file,line,col)" requires a NEW, minimal seam
  // on the effect boundary the executor already drives. Two additive implementer
  // obligations (documented here and in the handoff notes):
  //
  //   (A) TRANSPORT — a `par for` iteration's effect result MAY carry the child
  //       session's diagnostics on an additive `childDiagnostics` field of the
  //       `OperationResult` returned by `runEffect`. The executor collects them
  //       tagged by input index.
  //   (B) SINK — `StatementEvalHost` gains
  //         `drainChildDiagnostics(index: number, diagnostics: readonly Diagnostic[]): void`
  //       and, at the `par for` join (after all iterations settle), the executor
  //       MUST call it once per input index in ASCENDING index order, each call
  //       carrying that iteration's diagnostics in the existing (file, line, col)
  //       order — turning the nondeterministic completion order into the
  //       deterministic (input-index, then (file,line,col)) drain order.
  //
  // The test targets (B) as the observable and drives (A) through the double. It
  // reds feature-absent today: base `StatementEvalHost` has no
  // `drainChildDiagnostics`, and `par for` is not fanned out, so the recorder is
  // never fed. A correct implementation of (A)+(B) turns it green.

  type ChildDiagResult = OperationResult & {
    readonly childDiagnostics?: readonly Diagnostic[];
  };

  interface ParForDiagnosticSink extends StatementEvalHost {
    drainChildDiagnostics(
      index: number,
      diagnostics: readonly Diagnostic[],
    ): void;
  }

  /** A child diagnostic located at `child.theta:<line>:1` (fixes (file,line,col)). */
  function childDiag(line: number, code: string): Diagnostic {
    return {
      severity: "warning",
      code,
      file: "child.theta",
      range: { start: { line, column: 1 }, end: { line, column: 2 } },
      message: `child diagnostic @${line}`,
    };
  }

  class DrainRecordingHost extends ParForHost implements ParForDiagnosticSink {
    /** Seeded per-input-index child diagnostics (already in (file,line,col) order). */
    readonly childDiagnostics = new Map<number, readonly Diagnostic[]>();
    /** The drain calls the executor made, in call order (obligation (B)). */
    readonly drained: Array<{ index: number; diags: readonly Diagnostic[] }> = [];

    drainChildDiagnostics(
      index: number,
      diagnostics: readonly Diagnostic[],
    ): void {
      this.drained.push({ index, diags: diagnostics });
    }

    override async runEffect(
      expr: Expr,
      env: LexicalEnvironment,
      args?: Record<string, ThetaValue>,
    ): Promise<ChildDiagResult> {
      // Obligation (A): attach the iteration's child diagnostics to the effect
      // result. The element value equals the input index in this test, so the
      // result value keys the seed.
      const base = await super.runEffect(expr, env, args);
      const index = Number((base as { value?: ThetaValue }).value);
      const diags = this.childDiagnostics.get(index);
      return diags === undefined
        ? base
        : ({ ...base, childDiagnostics: diags } as ChildDiagResult);
    }
  }

  it("CTRL-3: child diagnostics drain grouped by input index, then (file,line,col), regardless of completion order (RED — feature absent)", async () => {
    const host = new DrainRecordingHost();
    // Each iteration emits two child diagnostics, in (file,line,col) order.
    host.childDiagnostics.set(0, [childDiag(1, "a"), childDiag(2, "b")]);
    host.childDiagnostics.set(1, [childDiag(11, "a"), childDiag(12, "b")]);
    host.childDiagnostics.set(2, [childDiag(21, "a"), childDiag(22, "b")]);
    // Completion order is the REVERSE of input order (index 2 finishes first),
    // so a naive completion-order drain would NOT be input-index ordered — the
    // executor must reorder to input index.
    host.delays.set("0", 6);
    host.delays.set("1", 4);
    host.delays.set("2", 2);

    const body = bodyOf(
      "par for f in [0, 1, 2] { invoke(\"./child.theta\", f) }",
    );
    await executeBody(body, execDeps(body, host));

    expect(
      host.drained.length,
      "CTRL-3: the executor drains child diagnostics through the ordered `drainChildDiagnostics` sink",
    ).toBeGreaterThan(0);

    // (1) Grouped by input index: the drain-call indices are non-decreasing
    // (not completion order, which is 2,1,0).
    const indices = host.drained.map((d) => d.index);
    expect(
      indices,
      "CTRL-3: child diagnostics are grouped by input index (ascending), not by completion order",
    ).toEqual([...indices].sort((a, b) => a - b));

    // (2) Then by (file,line,col): flattening the drained diagnostics yields a
    // sequence ordered by (input index, then line) — here strictly ascending
    // lines 1,2,11,12,21,22 — even though iterations completed 2,1,0.
    const lines = host.drained.flatMap((d) =>
      d.diags.map((g) => g.range?.start.line ?? 0),
    );
    expect(
      lines,
      "CTRL-3: within each input index the existing (file,line,col) order is preserved",
    ).toEqual([...lines].sort((a, b) => a - b));
    expect(
      lines,
      "CTRL-3: every seeded child diagnostic is drained exactly once",
    ).toHaveLength(6);
  });
});

// ===========================================================================
// HARD CEILINGS — width throttle is NOT a routing-class breach (NOCEIL-5);
// depth-32 invoke ceiling still applies per iteration
// ===========================================================================

describe("RFC-0003 par-for — width throttle is not a ceiling breach (NOCEIL-5)", () => {
  it("#par-for-width-throttle: exceeding 64 in-flight queues rather than breaching — no panic/Err from width (RED — feature absent)", async () => {
    const host = new ParForHost();
    // 200 elements, no `max`, all succeed: exceeding the 64 throttle must queue
    // and run to completion, NOT surface a routing-class ceiling breach.
    const inputs = Array.from({ length: 200 }, (_, i) => i).join(", ");
    const body = bodyOf(
      `par for f in [${inputs}] { invoke("./child.theta", f) }`,
    );

    let threw = false;
    let exec: Awaited<ReturnType<typeof executeBody>> | undefined;
    try {
      exec = await executeBody(body, execDeps(body, host));
    } catch {
      threw = true;
    }
    expect(
      threw,
      "NOCEIL-5: exceeding the width throttle must not throw a ceiling breach",
    ).toBe(false);

    const arr = asResultArray(
      exec?.result.value as ThetaValue,
      "NOCEIL-5: a wide `par for` runs to completion 64-at-a-time",
    );
    expect(arr.length, "NOCEIL-5: all 200 iterations complete (excess queued)").toBe(
      200,
    );
    expect(
      arr.every((el) => (el as { ok: boolean }).ok),
      "NOCEIL-5: no element is an Err purely from exceeding the width throttle",
    ).toBe(true);
  });
});
