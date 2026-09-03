import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type Expr,
  type LetStmt,
  type MatchExpr,
  type ParseThetaDocumentDeps,
  type QueryExpr,
  type Stmt,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { checkExtensionToolReachability } from "../src/extension/extension-tool-reachability";
import { EXTENSION_TOOL_UNREACHABLE_CODE } from "../src/runtime/host-loop-dispatch";
import { checkSubagentFnStaticResolution } from "../src/extension/subagent-fn-static-checks";
import { INVOCATION_CYCLE_CODE } from "../src/runtime/invoke-depth-cycle";
import { executeBody } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { ThetaValue } from "../src/runtime/value";
import { buildEnvironment } from "../src/runtime/lexical-environment";

// Bug 0082 — the `BlockExpr` production has no AST node, so a `{ … }` block
// expression in `match`-arm-body or `let`-RHS position is parsed as a bare
// object literal and refused with `theta/parse/bare-object-literal`
// (docs/bugs/0082-blockexpr-production-unimplemented.md).
//
// Spec: docs/spec_topics/grammar.md:118
// (`BlockExpr ::= "{" Stmt* Expr "}"` — expression-position, tail Expr
// required, value is the tail expression), `:114` (the two expression-position
// block sites: the `let` RHS and a `match`-arm body), `:148–150`
// (`ArmBody ::= Expr | BlockExpr`), `:153–164` (the worked example this file's
// cell (a) reproduces); docs/spec_topics/expressions.md:182.
//
// Surface, re-derived at HEAD 1848fb65 (line numbers below re-derived again
// post-fix, against the tree as this file's own fix leaves it — the shapes
// described are the PRE-FIX ones the citations originally pointed at):
//   - `export type Expr` — src/parser/theta-document.ts:402–421. Nineteen arms,
//     none a block, pre-fix (the union now carries a twentieth, `BlockExpr`).
//   - primary-expression bare-`{` → `parseObjectLiteral(null, …)` —
//     src/parser/theta-document.ts:4260–4261; `parseObjectLiteral` at :4275.
//   - `tryConsumeArmBodyStatement` — src/parser/theta-document.ts:4392, called
//     from the match-arm loop at :4352; it fires on a leading statement keyword
//     only, so a leading `{` falls through to expression parsing.
//   - `bareObjectLiteralDiagnostic` (the sole shared message builder) —
//     src/parser/theta-document.ts:5950; `checkObjectExpr` at :7721 emits it at
//     :7733 whenever `typeName === null` outside the sole-Pi-tool-argument
//     carve-out.
//   - `interface Block { statements; tail }` — src/parser/theta-document.ts:807.
//   - `executeBlock` — src/runtime/statement-executor.ts:1593; `evalMatch` at
//     :1139.
//
// THE TARGETED FIX (bug 0082 §Fix, recommendation: option 2 implemented as
// option 1's node with a position-gated parse):
//   1. `BlockExpr extends NodeBase { kind: "block"; body: Block }` joins the
//      `Expr` union.
//   2. Admitted at exactly two positions — a `let` / `let mut` RHS and a
//      `match`-arm body. Every other position keeps today's
//      `theta/parse/bare-object-literal` behaviour verbatim from the shared
//      builder (DIAG-4 + bug 0016's shared-builder invariant).
//   3. At those two positions the braces read as an OBJECT LITERAL iff the
//      token after `{` is `}` or an ident/string immediately followed by `:`;
//      otherwise they read as a BLOCK.
//   4. A block at one of those positions whose `Block.tail === null` is
//      `theta/parse/block-expr-missing-tail` (severity error, phase parse,
//      message `block expression must end in a tail expression`).
//   5. `theta/parse/statement-in-arm-body` keeps firing for an UNWRAPPED
//      statement arm body.
//   6. A `BlockExpr` evaluates through the existing `executeBlock` in a child
//      scope; its value is the tail expression's value.
//
// WHY THESE CELLS RED TODAY. Cells (a), (b), (c), (d), (g) and (h) red on their
// own primary assertion because the block reading does not exist: the parse
// aggregates `theta/parse/bare-object-literal` where the spec requires a clean
// parse, the `let` init node's `kind` is `"object"` rather than `"block"`, the
// tail-less-block code is not in the registry so no diagnostic carries it, and
// the runtime never reaches a block because the parse already refused. Cells
// (e) and (f) are CONTROLS — green at HEAD and required to stay green after the
// fix — pinning the shared-builder invariant and the surviving
// `statement-in-arm-body` disposition. They are stated here so a fix that wins
// cells (a)–(d) by loosening `checkObjectExpr` globally reds instead.
//
// No cell reds on a compile error, a missing import, or a harness throw:
// `parseThetaDocument` aggregates diagnostics and does not throw, and the
// runtime cells fail LOUDLY on an unexpected parse rejection rather than
// skipping (CLAUDE.md: no silent test skipping).

// --- production parse harness ----------------------------------------------
// Modelled on tests/lexer-parser-diagnostics-production.test.ts:38–56.

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
function parse(src: string, path = "bug0082.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}

/** The `{code, severity, message}` triples the production parse aggregated. */
function diagsOf(src: string): { code: string; severity: string; message: string }[] {
  return parse(src).diagnostics.map((d: Diagnostic) => ({
    code: d.code,
    severity: d.severity,
    message: d.message,
  }));
}

/** The bug's §Reproduction frontmatter, verbatim. */
const FM = "---\nmode: prompt\n---\n";

/** The registered `theta/parse/bare-object-literal` message (src/parser/theta-document.ts:5957). */
const BARE_OBJECT_MESSAGE =
  "bare object literal not permitted in this position; name the schema (Schema { ... })";

/** The normative `theta/parse/block-expr-missing-tail` message (bug 0082 §Fix, grammar.md:118). */
const MISSING_TAIL_CODE = "theta/parse/block-expr-missing-tail";
const MISSING_TAIL_MESSAGE = "block expression must end in a tail expression";

const BARE_OBJECT_CODE = "theta/parse/bare-object-literal";

// --- §Reproduction sources -------------------------------------------------

/**
 * §Reproduction source #1 — docs/spec_topics/grammar.md:164–173's own worked
 * example of the block arm body, wrapped in the bug's minimal frontmatter.
 *
 * Transcribed as the bug doc §Reproduction transcribes it: the doc substitutes
 * the integer tail `2` for grammar.md:161's `"fallback"` so both arms produce
 * `integer` and the example is free of the arm-type question this bug is not
 * about. The braces — the surface under test — are unchanged.
 */
const ARM_BLOCK_SOURCE = [
  "let result = Ok(1)",
  "let out = match result {",
  "  Ok(s)  => s,",
  "  Err(e) => {",
  "    let mut count = 0",
  "    count += 1",
  "    2",
  "  },",
  "}",
  "out",
  "",
].join("\n");

/** §Reproduction source #2 — the `let`-RHS block. */
const LET_BLOCK_SOURCE = ["let x = {", "  let y = 1", "  y + 1", "}", "x", ""].join("\n");

/** §Reproduction control — a plain expression arm body parses clean. */
const PLAIN_ARM_SOURCE = [
  "let r = Ok(1)",
  "let o = match r { Ok(s) => s, Err(e) => 0 }",
  "o",
  "",
].join("\n");

// --- AST navigation helpers ------------------------------------------------

function letNamed(doc: ThetaDocument, name: string): LetStmt {
  const found = doc.body.statements.find(
    (s: Stmt): s is LetStmt => s.kind === "let" && s.name === name,
  );
  if (found === undefined) {
    throw new Error(
      `harness: no \`let ${name}\` statement in the parsed body — the fixture is this file's oracle, so an absent binding is a harness failure, never a skip`,
    );
  }
  return found;
}

/** The `kind` discriminator of an expression, or `"<null>"` when absent. */
function kindOf(e: Expr | null): string {
  return e === null ? "<null>" : e.kind;
}

// ===========================================================================
// (a) — the spec's own worked example parses clean.
// ===========================================================================

describe("bug 0082 — a `match`-arm block expression parses", () => {
  it("parses grammar.md's worked block-arm example with zero diagnostics", () => {
    // grammar.md:150 `ArmBody ::= Expr | BlockExpr`; :153–164 prints this
    // program (see ARM_BLOCK_SOURCE on the tail substitution). Today `tryConsumeArmBodyStatement`
    // (src/parser/theta-document.ts:4392) declines a leading `{`, the arm body
    // falls through to `parseObjectLiteral(null, …)` (:4152–4153) and
    // `checkObjectExpr` (:7581) refuses it at :7593.
    expect(
      diagsOf(FM + ARM_BLOCK_SOURCE),
      "grammar.md:153–164's worked example must parse clean: an arm body wrapped in `{ … }` is a BlockExpr, not a bare object literal",
    ).toEqual([]);
  });

  it("parses a plain expression arm body with zero diagnostics — CONTROL", () => {
    // §Reproduction control: green at HEAD and after the fix. Proves the
    // harness reports `[]` for a clean parse, so cell (a)'s red is the block
    // form and not ambient frontmatter/aggregation noise.
    expect(
      diagsOf(FM + PLAIN_ARM_SOURCE),
      "CONTROL: a plain expression arm body is clean before and after bug 0082",
    ).toEqual([]);
  });
});

// ===========================================================================
// (b) — the `let` RHS, the other expression-position block site (grammar.md:115).
// ===========================================================================

describe("bug 0082 — a `let`-RHS block expression parses", () => {
  it("parses a `let` RHS block with zero diagnostics", () => {
    // grammar.md:115 names "the right-hand side of `let`" as an
    // expression-position block site.
    expect(
      diagsOf(FM + LET_BLOCK_SOURCE),
      "grammar.md:115: a `let` RHS is expression position; `{ let y = 1 \\n y + 1 }` is a BlockExpr, not a bare object literal",
    ).toEqual([]);
  });
});

// ===========================================================================
// (c) — the AST shape: `kind === "block"` with the tail carried on `body.tail`.
// ===========================================================================

describe("bug 0082 — the `BlockExpr` node shape", () => {
  it("gives a `let` RHS block the `block` kind, with the tail expression on `body.tail`", () => {
    // Bug 0082 §Fix option 1's node:
    // `BlockExpr extends NodeBase { kind: "block"; body: Block }`, joining the
    // `Expr` union at src/parser/theta-document.ts:402–421. `Block` is the
    // existing `{ statements; tail }` interface at :790.
    const doc = parse(FM + LET_BLOCK_SOURCE);
    const init = letNamed(doc, "x").init;

    expect(
      kindOf(init),
      "the `let x = { … }` init node must be the new `block` node, not the `object` node the primary-expression parser produces today (src/parser/theta-document.ts:4260–4261)",
    ).toBe("block");

    const body = (init as unknown as { body: { statements: readonly Stmt[]; tail: Expr | null } })
      .body;
    expect(
      body.statements.map((s: Stmt) => s.kind),
      "the block's statements are its `Stmt*` prefix (grammar.md:118)",
    ).toEqual(["let"]);
    expect(
      kindOf(body.tail),
      "grammar.md:118: the block's value is its tail Expr — here the binary `y + 1`",
    ).toBe("binary");
  });

  it("gives a `match` arm block body the `block` kind", () => {
    const doc = parse(FM + ARM_BLOCK_SOURCE);
    const init = letNamed(doc, "out").init;
    expect(
      kindOf(init),
      "harness: `let out = match result { … }` must parse to a `match` expression",
    ).toBe("match");
    const arms = (init as unknown as MatchExpr).arms;
    expect(arms.length, "harness: the fixture declares two arms").toBe(2);
    expect(
      kindOf(arms[1]?.body ?? null),
      "grammar.md:150 `ArmBody ::= Expr | BlockExpr`: the `Err(e) => { … }` arm body is a block node",
    ).toBe("block");
  });
});

// ===========================================================================
// (d) — tail required (grammar.md:118): a tail-less block is an ERROR at both
// admitted positions, never the implicit `null` `FnBody` / `StmtBlock` produce.
// ===========================================================================

describe("bug 0082 — a tail-less block expression is refused", () => {
  it("refuses a tail-less `let`-RHS block with block-expr-missing-tail", () => {
    // grammar.md:118 requires the tail Expr; :119/:121's implicit-`null` rule
    // is `FnBody` / `StmtBlock` only (bug 0082 §Fix, third constraint).
    const diags = diagsOf(FM + ["let x = {", "  let y = 1", "}", "x", ""].join("\n"));
    expect(
      diags,
      "a `let` RHS block with no tail expression draws exactly one `theta/parse/block-expr-missing-tail`, with the normative message",
    ).toEqual([
      {
        code: MISSING_TAIL_CODE,
        severity: "error",
        message: MISSING_TAIL_MESSAGE,
      },
    ]);
  });

  it("refuses a tail-less `match`-arm block with block-expr-missing-tail", () => {
    const diags = diagsOf(
      FM +
        [
          "let result = Ok(1)",
          "let out = match result {",
          "  Ok(s)  => s,",
          "  Err(e) => {",
          "    let mut count = 0",
          "  },",
          "}",
          "out",
          "",
        ].join("\n"),
    );
    expect(
      diags,
      "a `match`-arm block with no tail expression draws exactly one `theta/parse/block-expr-missing-tail`, with the normative message",
    ).toEqual([
      {
        code: MISSING_TAIL_CODE,
        severity: "error",
        message: MISSING_TAIL_MESSAGE,
      },
    ]);
  });
});

// ===========================================================================
// (e) — CONTROL / non-regression: the shared-builder invariant. A genuine bare
// object literal keeps drawing `theta/parse/bare-object-literal` from the sole
// builder (src/parser/theta-document.ts:5950), message unchanged (DIAG-4, bug
// 0016 part B). Green at HEAD; must stay green after the fix.
// ===========================================================================

describe("bug 0082 — bare object literals keep their diagnostic (CONTROL)", () => {
  it("still refuses a bare object literal in array-element position", () => {
    const diags = diagsOf(FM + ["let a = [{ a: 1 }]", "a", ""].join("\n"));
    expect(
      diags.filter((d) => d.code === BARE_OBJECT_CODE),
      "array-element position is not one of grammar.md:115's two block sites: the shared builder's message must not drift",
    ).toEqual([{ code: BARE_OBJECT_CODE, severity: "error", message: BARE_OBJECT_MESSAGE }]);
  });

  it("still refuses a bare object literal as a non-Pi callee's argument", () => {
    const diags = diagsOf(
      FM + ["fn f(v) {", "  v", "}", "let r = f({ a: 1 })", "r", ""].join("\n"),
    );
    expect(
      diags.filter((d) => d.code === BARE_OBJECT_CODE),
      "bug 0016 part B's argument-position emission site is outside the sole-Pi-tool-argument carve-out and must keep firing with the identical message",
    ).toEqual([{ code: BARE_OBJECT_CODE, severity: "error", message: BARE_OBJECT_MESSAGE }]);
  });

  it("reads `let x = { a: 1 }` as a field list and still refuses it", () => {
    // Bug 0082 §Fix disambiguation: an ident/string immediately followed by `:`
    // after the `{` is an OBJECT LITERAL reading even at a block position.
    // Compared as a WHOLE list (not filtered to the bare-object code) so an
    // extra diagnostic drawn on the same braces reds this cell.
    const diags = diagsOf(FM + ["let x = { a: 1 }", "x", ""].join("\n"));
    expect(
      diags,
      "`{ a: 1 }` on a `let` RHS is a field list, so the block reading must not swallow it — and draws exactly that one diagnostic",
    ).toEqual([{ code: BARE_OBJECT_CODE, severity: "error", message: BARE_OBJECT_MESSAGE }]);
  });

  it("reads `let x = {}` as an empty object literal and still refuses it", () => {
    // Bug 0082 §Fix disambiguation: `}` immediately after `{` is the empty
    // OBJECT LITERAL reading, not a tail-less block.
    const diags = diagsOf(FM + ["let x = {}", "x", ""].join("\n"));
    expect(
      diags.filter((d) => d.code === BARE_OBJECT_CODE),
      "`{}` on a `let` RHS is the empty object literal reading, not a tail-less block",
    ).toEqual([{ code: BARE_OBJECT_CODE, severity: "error", message: BARE_OBJECT_MESSAGE }]);
    expect(
      diags.map((d) => d.code),
      "`let x = {}` must not additionally draw the tail-less-block diagnostic",
    ).not.toContain(MISSING_TAIL_CODE);
  });
});

// ===========================================================================
// (f) — CONTROL / non-regression: the UNWRAPPED statement arm body keeps its
// own disposition, so the two arm-body dispositions stay distinguishable (bug
// 0082 §Fix, second constraint). Mirrors the shape at
// tests/lexer-parser-diagnostics-production.test.ts:108.
// ===========================================================================

describe("bug 0082 — statement-in-arm-body still fires unwrapped (CONTROL)", () => {
  it("still refuses a bare `if` statement in a `match` arm body", () => {
    const codes = codesOf(
      [
        "let y = 1",
        "let z = match y {",
        "  0 => if true { 1 } else { 2 },",
        "  _ => 3,",
        "}",
      ].join("\n"),
    );
    expect(
      codes,
      "an UNWRAPPED statement arm body stays `theta/parse/statement-in-arm-body`; only the `{ … }`-wrapped form becomes a BlockExpr",
    ).toContain("theta/parse/statement-in-arm-body");
  });
});

// ===========================================================================
// (g) — runtime: the block's value is its tail expression, its statements run,
// and it is a CHILD scope (bug 0082 §Fix; `executeBlock`,
// src/runtime/statement-executor.ts:1593).
//
// Harness: tests/non-object-receiver-gate.test.ts's production-executor
// pattern — parseThetaDocument → createProductionProducerDeps →
// bindPromptConversation → executeBody. Offline, provider-free, no child
// process, no model.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/**
 * One runtime probe's disposition. A parse rejection is reported as a VALUE,
 * not a throw, so the cell reds on its own primary value assertion (showing the
 * refusing code) rather than on a harness throw — and can never silently skip
 * (CLAUDE.md: no silent test skipping).
 */
type RunOutcome =
  | { readonly kind: "value"; readonly value: ThetaValue | undefined }
  | { readonly kind: "parse-refused"; readonly codes: readonly string[] };

/** Parse + run a self-contained query-free prompt-mode source. */
async function runSource(src: string): Promise<RunOutcome> {
  const doc = parse(FM + src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    return { kind: "parse-refused", codes: errors.map((d) => d.code) };
  }
  const theta: ThetaCompositionInput = {
    slashName: "bug0082",
    sourcePath: "/theta/bug0082.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { kind: "value", value: execution.result.value };
}

describe("bug 0082 — a block expression evaluates to its tail", () => {
  it("runs a block-free body through the same harness — CONTROL", async () => {
    // Green at HEAD and after the fix: proves the parse → producer → executeBody
    // wiring reaches a final value, so the two runtime cells below red on the
    // absent block reading and not on a broken harness.
    const outcome = await runSource(["let mut count = 0", "count += 1", "count + 1", ""].join("\n"));
    expect(
      outcome,
      "CONTROL: the offline production executor yields a block-free body's tail value",
    ).toEqual({ kind: "value", value: 2 });
  });

  it("evaluates a `let`-RHS block's statements and yields its tail value", async () => {
    // The doc's `let mut count = 0 / count += 1 / 2` shape: the statements run
    // and the tail `2` is the block's value (grammar.md:118).
    const outcome = await runSource(
      ["let x = {", "  let mut count = 0", "  count += 1", "  2", "}", "x", ""].join("\n"),
    );
    expect(
      outcome,
      "grammar.md:118: a block expression's value is its tail expression, produced through `executeBlock` (src/runtime/statement-executor.ts:1593)",
    ).toEqual({ kind: "value", value: 2 });
  });

  it("runs the block's statements — the tail reads a binding the block made", async () => {
    const outcome = await runSource(
      ["let x = {", "  let mut count = 0", "  count += 1", "  count + 1", "}", "x", ""].join("\n"),
    );
    expect(
      outcome,
      "the block's statements execute in order before the tail is evaluated: `count` is 1 at the tail, so the block's value is 2",
    ).toEqual({ kind: "value", value: 2 });
  });

  it("evaluates the block in a CHILD scope — its bindings do not leak", () => {
    // Bug 0082 §Fix: the block runs in a child scope. A name bound
    // inside it is not in scope after the block, so the identifier-resolution
    // parse checker (src/parser/theta-document.ts:5409) refuses the outer read.
    const codes = codesOf(FM + ["let x = {", "  let inner = 1", "  inner", "}", "inner", ""].join("\n"));
    expect(
      codes,
      "a `let` inside a block expression must not leak to the enclosing scope: the trailing `inner` is unresolved",
    ).toEqual(["theta/parse/unknown-identifier"]);
  });
});

// ===========================================================================
// (h) — the structural walk descends INTO the new node: a diagnostic raised by
// a statement nested in a block body still surfaces.
// ===========================================================================

describe("bug 0082 — diagnostics inside a block body still surface", () => {
  it("reports an unknown identifier used inside a block expression's body", () => {
    // If the block node were added to the `Expr` union without teaching the
    // structural walk to descend into `body`, this source would parse silently
    // clean. It must report exactly the nested unknown identifier and nothing
    // else — in particular, no `theta/parse/bare-object-literal`.
    const codes = codesOf(FM + ["let x = {", "  let y = nope", "  y", "}", "x", ""].join("\n"));
    expect(
      codes,
      "the structural walk must descend into a block expression's body: `nope` is unresolved, and the braces are NOT a bare object literal",
    ).toEqual(["theta/parse/unknown-identifier"]);
  });
});

// ===========================================================================
// (i) — the CTRL-4 `par for` body scan descends into a block expression. A
// sibling `Expr` walker whose `default:` arm swallows the new `"block"` kind
// hides the block's whole statement list from the restriction check, so each
// escape below would emit nothing at all (`scanParForExpr`,
// src/parser/theta-document.ts).
// ===========================================================================

describe("bug 0082 — `par for` body restrictions reach inside a block expression", () => {
  it("refuses an `@`-query written inside a block in a `par for` body", () => {
    const codes = codesOf(
      [
        "let r = par for f in [1, 2, 3] {",
        "  let v = {",
        "    let q = @`Summarise ${f}.`?",
        "    q",
        "  }",
        "  v",
        "}",
        "r",
      ].join("\n"),
    );
    expect(
      codes,
      "CTRL-4: a brace level does not licence an enclosing-conversation query inside a `par for` body",
    ).toContain("theta/parse/par-query-in-body");
  });

  it("refuses a shared mutation written inside a block in a `par for` body", () => {
    const codes = codesOf(
      [
        "let mut acc = 0",
        "let r = par for f in [1, 2, 3] {",
        "  let v = {",
        "    acc += 1",
        "    f",
        "  }",
        "  v",
        "}",
        "r",
      ].join("\n"),
    );
    expect(
      codes,
      "CTRL-4: assignment to an outer `let mut` is refused at every depth of the body, block levels included",
    ).toContain("theta/parse/par-shared-mutation");
  });

  it("refuses a `break` written inside a block in a `par for` body", () => {
    const codes = codesOf(
      [
        "let r = par for f in [1, 2, 3] {",
        "  let v = {",
        "    break",
        "    f",
        "  }",
        "  v",
        "}",
        "r",
      ].join("\n"),
    );
    expect(
      codes,
      "a block is not a loop, so a `break` inside one still targets the `par for` and is refused",
    ).toContain("theta/parse/par-break-continue");
  });

  it("refuses a `return` written inside a block in a `par for` body", () => {
    const codes = codesOf(
      [
        "fn g(xs) {",
        "  let r = par for f in xs {",
        "    let v = {",
        "      return 1",
        "      f",
        "    }",
        "    v",
        "  }",
        "  r",
        "}",
        "g([1, 2, 3])",
      ].join("\n"),
    );
    expect(
      codes,
      "CTRL-4: a `return` inside a `par for` body is refused at every depth, block levels included",
    ).toContain("theta/parse/par-return-in-body");
  });

  it("keeps a block-local `let` out of a sibling statement's judgement", () => {
    // A block's `let`s bind in a child scope (the runtime evaluates the body in
    // `env.child()`), so a name a block binds must not mask a SIBLING
    // statement's assignment to the identically-named outer `let mut`.
    const codes = codesOf(
      [
        "let mut acc = 0",
        "let r = par for f in [1, 2, 3] {",
        "  let v = {",
        "    let mut acc = 0",
        "    acc += 1",
        "    acc",
        "  }",
        "  acc = v",
        "  v",
        "}",
        "r",
      ].join("\n"),
    );
    expect(
      codes,
      "a block-local `acc` must not leak into the sibling statement: `acc = v` still assigns the OUTER `let mut`",
    ).toContain("theta/parse/par-shared-mutation");
  });

  it("does not refuse a block-local mutation of a block-local binding — CONTROL", () => {
    const codes = codesOf(
      [
        "let r = par for f in [1, 2, 3] {",
        "  let v = {",
        "    let mut n = 0",
        "    n += f",
        "    n",
        "  }",
        "  v",
        "}",
        "r",
      ].join("\n"),
    );
    expect(
      codes,
      "CONTROL: a binding the block itself declares is body-local, so mutating it is not a shared mutation",
    ).not.toContain("theta/parse/par-shared-mutation");
  });
});

// ===========================================================================
// (j) — PIC-64 rung 3: a code-side extension-tool call reachable only inside a
// block expression is visible to the load-time reachability check
// (`walkExpr`, src/extension/extension-tool-reachability.ts).
// ===========================================================================

describe("bug 0082 — extension-tool reachability sees a call inside a block", () => {
  const REACH_FILE = "/theta/bug0082.theta";
  const BLOCK_CALL_SOURCE = [
    "let v = {",
    "  let r = finding_store(1)",
    "  r",
    "}",
    "v",
    "",
  ].join("\n");

  it("refuses a theta whose only code-side extension-tool call sits in a block", () => {
    const diagnostics = checkExtensionToolReachability({
      body: parse(FM + BLOCK_CALL_SOURCE).body,
      extensionToolNames: new Set(["finding_store"]),
      probe: { getToolDefinitionAvailable: false, hostLoopAvailable: false },
      file: REACH_FILE,
    });
    expect(
      diagnostics.map((d) => d.code),
      "a call site one brace level down is still a code-side call site: it must draw the load-time refusal instead of failing at runtime",
    ).toEqual([EXTENSION_TOOL_UNREACHABLE_CODE]);
  });

  it("admits the same block-nested call when a dispatch rung is available — CONTROL", () => {
    expect(
      checkExtensionToolReachability({
        body: parse(FM + BLOCK_CALL_SOURCE).body,
        extensionToolNames: new Set(["finding_store"]),
        probe: { getToolDefinitionAvailable: false, hostLoopAvailable: true },
        file: REACH_FILE,
      }),
      "CONTROL: the block-nested call site is admitted when the host-loop rung is available",
    ).toEqual([]);
  });
});

// ===========================================================================
// (k) — FN-6: a `subagent fn` → `subagent fn` spawn routed through a block
// expression contributes its edge, so a cycle through a block is refused at
// load (`walkExpr` in `collectCallCallees`,
// src/extension/subagent-fn-static-checks.ts).
// ===========================================================================

describe("bug 0082 — the FN-6 spawn graph sees a call inside a block", () => {
  it("refuses a self-cycle routed through a block expression", () => {
    const doc = parse(
      FM +
        [
          "subagent fn step(o: string) {",
          "  let v = {",
          "    let r = step(o)?",
          "    r",
          "  }",
          "  v",
          "}",
          'step("x")',
          "",
        ].join("\n"),
    );
    const diags = checkSubagentFnStaticResolution({
      body: doc.body,
      file: "bug0082.theta",
      parseDiagnostics: [],
    });
    expect(
      diags.map((d) => d.code),
      "FN-6: a spawn nested in a block expression is still a spawn — the cycle must be refused at load",
    ).toContain(INVOCATION_CYCLE_CODE);
  });
});

// ===========================================================================
// (l) — QRY-2 Option-B schema resolution reaches a query written as a block's
// tail: the block's value IS its tail, so the tail sits in the frames
// enclosing the block (`rewriteExpr`, src/parser/query-schema-resolve.ts).
// ===========================================================================

describe("bug 0082 — a typed query inside a block resolves its schema", () => {
  it("resolves a typed `let`-RHS block's tail query to the annotation", () => {
    const doc = parse(
      FM +
        ["let x: integer = {", "  let hint = 1", "  @`How many?`?", "}", "x", ""].join("\n"),
    );
    const init = letNamed(doc, "x").init;
    expect(kindOf(init), "harness: the `let x` initialiser is the block node").toBe("block");
    const tail = (init as unknown as { body: { tail: Expr | null } }).body.tail;
    expect(kindOf(tail), "harness: the block's tail is the `?`-wrapped query").toBe("try");
    const query = (tail as unknown as { operand: Expr }).operand;
    expect(kindOf(query), "harness: the `try` operand is the query").toBe("query");
    expect(
      (query as unknown as QueryExpr).schema,
      "the block's value is its tail, so the tail query resolves against the enclosing `let` annotation exactly as it does one brace level up",
    ).toBe("integer");
  });

  it("resolves a query at an INDIRECT position under the block's tail", () => {
    const doc = parse(
      FM +
        [
          "let x: array<integer> = {",
          "  let hint = 1",
          "  [@`How many?`]",
          "}",
          "x",
          "",
        ].join("\n"),
    );
    const tail = (letNamed(doc, "x").init as unknown as { body: { tail: Expr | null } }).body
      .tail;
    expect(kindOf(tail), "harness: the block's tail is the array literal").toBe("array");
    const element = (tail as unknown as { elements: readonly Expr[] }).elements[0] ?? null;
    expect(
      (element as unknown as QueryExpr).schema,
      "the array-literal frame crosses the block boundary to reach the enclosing `array<integer>` sink",
    ).toBe("integer");
  });

  it("resolves the identical query one brace level up — CONTROL", () => {
    const doc = parse(FM + ["let x: integer = @`How many?`?", "x", ""].join("\n"));
    const operand = (letNamed(doc, "x").init as unknown as { operand: Expr }).operand;
    expect(
      (operand as unknown as QueryExpr).schema,
      "CONTROL: the direct `let` RHS query resolves to the annotation",
    ).toBe("integer");
  });
});

// ===========================================================================
// (m) — the synchronous pure host evaluates a block expression rather than
// yielding its inert `null` (`evaluatePureExpression`,
// src/extension/production-theta-producer.ts).
// ===========================================================================

describe("bug 0082 — the pure host evaluates a block expression", () => {
  /**
   * The production `evaluatePure` seam, driven directly. The executor
   * intercepts a `"block"` node in every position it owns, so the SYNCHRONOUS
   * pure host is reached for one through its own recursion into a pure `fn`
   * body (the interpolation renderer and the `params:` default recovery are its
   * entry points). This cell drives that seam through the real production deps
   * rather than reconstructing either entry point.
   */
  function pureHostValueOf(src: string, call: Expr): ThetaValue {
    const doc = parse(FM + src);
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `harness: the fixture must parse clean — got ${JSON.stringify(errors.map((d) => d.code))}`,
      );
    }
    const theta: ThetaCompositionInput = {
      slashName: "bug0082",
      sourcePath: "/theta/bug0082.theta",
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const binding = producer().bindPromptConversation({
      theta,
      args: "",
      ctx: {} as unknown as ExtensionCommandContext,
    });
    return binding.executeDeps.host.evaluatePure(call, buildEnvironment({ body: doc.body }));
  }

  const PURE_FN_SOURCE = [
    "fn f() {",
    "  let x = {",
    "    let y = 2",
    "    y + 1",
    "  }",
    "  x",
    "}",
    "f()",
    "",
  ].join("\n");

  it("yields a block's tail value from a pure `fn` body", () => {
    const call: Expr = {
      kind: "call",
      callee: "f",
      args: [],
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    };
    expect(
      pureHostValueOf(PURE_FN_SOURCE, call),
      "a `let x = { … }` in a pure `fn` body binds the block's tail value, not the pure host's inert `null`",
    ).toBe(3);
  });
});
