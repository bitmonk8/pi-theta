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
import type { ThetaValue } from "../src/runtime/value";

// ===========================================================================
// Bug 0223 — a `return` in a `par for` body is REFUSED at load (route (a))
// ===========================================================================
//
// Bug: docs/bugs/0223-par-for-body-return-folds-unenumerated.md. CTRL-4
// (docs/spec_topics/control-flow.md:76) closes the `par for` body's restriction
// list at three items and does not name `return`, while
// `runParForIteration` folds a body `return` into that ITERATION's
// `makeOk(flow.value)` — before this fix, `case "normal"` and `case "return"`
// shared one arm; this fix splits them into separate arms with the identical
// fold body (src/runtime/statement-executor.ts:1315 and :1316-1320, the
// switch at `:1313`, the function at `:1256`). So `return <expr>` in a
// `par for` body loaded with
// zero diagnostics (§Reproduction A, B, G, I, J, K — re-measured at this tree
// and identical) and meant the opposite of `docs/spec_topics/return.md:3` /
// RET-1 (`:19`), while the identical statement in a plain `for` body exits the
// enclosing scope (`executeFor` propagates the flow outward,
// src/runtime/statement-executor.ts:1724 — the bare `return flow;` that ends
// `executeFor`'s iteration loop; `executeFor` itself begins at `:1690`).
//
// ROUTE, operator-adjudicated: §Fix route (a) ENUMERATE-AND-REFUSE. CTRL-4
// gains `return` as a fourth body restriction and the parse side refuses it, so
// the runtime fold becomes unreachable-but-retained rather than wrong.
//
// The settled design this suite encodes:
//   - new code `theta/parse/par-return-in-body`, Sev `E`, Phase `parse`,
//     placeholder-free Message
//     `'return' is not permitted inside a 'par for' body`;
//   - emitted from `scanParForStmt`'s existing `case "return"`
//     (src/parser/theta-document.ts, symbol `scanParForStmt` at `:4675`, the
//     `case "return"` arm now at `:4755-4773`), taking the shape of the
//     `break` / `continue` arm above it (`:4702-4716`, the code at `:4710`,
//     the depth gate at `:4707`) — but with `loopDepth` IGNORED: refused at
//     EVERY body depth, because the bug's row K measures that a depth-1
//     `return` crosses the inner plain `for` and folds at the `par for`
//     boundary, so CTRL-4's depth discrimination for `break` does not transfer;
//   - the BARE `return` is in class: refused too (row D, row M);
//   - emitted BEFORE the operand is walked, so a query in the operand still
//     draws `theta/parse/par-query-in-body` AFTER it (cell (q1));
//   - the neighbour codes FIRE BESIDE it, nothing is withheld: row C keeps
//     RET-3's `theta/parse/unreachable-code` and row D keeps RET-2's
//     `theta/parse/bare-return-in-non-void` (cells (c1) / (c2) assert the WHOLE
//     unfiltered ordered array with exact ranges, which is the §Fix route-(a)
//     cost item "with exact pass-wide counts per (code, range)").
//
// Emission ORDER in the mixed cells is structural, not stipulated: the CTRL-4
// body scan runs at PARSE time (`emitParForBodyDiagnostics`,
// src/parser/theta-document.ts:4653, reached from the `par for` parse at
// `:4632`), while `unreachable-code` and `bare-return-in-non-void` are pushed
// by the post-parse structural walk (`checkUnreachableCode` called at
// src/parser/theta-document.ts:7130; `checkBareReturn`,
// src/parser/functions.ts:379). Hence the refusal comes FIRST.
//
// RANGE pin: the refusal carries the RETURN STATEMENT's own `range` — what
// `range: s.range` in the neighbouring `break` / `continue` arm
// (src/parser/theta-document.ts:4712) yields. Every range asserted below was
// read off the parsed AST at this tree (the `return` statement nodes' ranges),
// not guessed.
//
// TIER: unit. Offline, provider-free, deterministic — the whole subject is one
// parse-phase emission plus one already-shipped runtime arm, both reachable
// through `parseThetaDocument` and `executeBody` directly.
//
// PROTECTED NEIGHBOURS this file does not touch: bug 0140's cell g9
// (tests/type-name-as-value-refusal.test.ts) and bug 0128's witness
// (tests/non-literal-by-field-refusal.test.ts).

// --- parse harness (shape copied from tests/par-for.test.ts, not imported) ---

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

/**
 * The live registry, read from the spec corpus — the DIAG-4 message oracle
 * (the same source, and the same reader, the production emitters' messages are
 * transcribed from). Sharded across the four `code-registry-*.md` pages.
 */
const REGISTRY = parseRegistry(
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

/** The code route (a) mints — the subject of this file. */
const PAR_RETURN_IN_BODY = "theta/parse/par-return-in-body";
/** RET-3's warning, which must keep firing beside the refusal (row C). */
const UNREACHABLE_CODE = "theta/parse/unreachable-code";
/** RET-2's error, which must keep firing beside the refusal (row D). */
const BARE_RETURN_IN_NON_VOID = "theta/parse/bare-return-in-non-void";
/** CTRL-4's query restriction, which must still fire from the operand (cell (q1)). */
const PAR_QUERY_IN_BODY = "theta/parse/par-query-in-body";
/** FN-1's placement refusal, which owns a `fn` declared in the body (cell (b8)). */
const NESTED_FN = "theta/parse/nested-fn";

/**
 * The registered Message for `code` (DIAG-4). A missing row fails LOUDLY: the
 * Message column is this file's only message oracle, so its absence is a
 * harness failure naming the unmet precondition, never a skip.
 */
function registryMessageFor(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness precondition unmet: no registry row for ${code} on any sharded ` +
        `docs/spec_topics/diagnostics/code-registry-*.md page — the DIAG-4 Message ` +
        `column is this file's message oracle, so a missing row is a harness ` +
        `failure, never a skip. Bug 0223 §Fix route (a) owes that row (and ` +
        `inherits bug 0200's shard adjudication for where a \`par-*\` row lands).`,
    );
  }
  return template;
}

/**
 * The whole unfiltered diagnostics array as an ordered
 * `severity code@startLine:startCol-endLine:endCol` list — severity, code,
 * order, count AND range in one comparable value.
 */
function diagShapeOf(src: string): string[] {
  return parse(src).diagnostics.map(
    (d: Diagnostic) => `${d.severity} ${d.code}@${showRange(d)}`,
  );
}

/**
 * `startLine:startCol-endLine:endCol`, or the literal `NO-RANGE` — a
 * range-less diagnostic is itself an assertion failure here (route (a)'s cost
 * list pins ranges), never a silently-dropped field.
 */
function showRange(d: Diagnostic): string {
  const r = d.range;
  if (r === undefined) {
    return "NO-RANGE";
  }
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
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
    : diags
        .map((d) => `${d.severity} ${d.code}@${showRange(d)}: ${d.message}`)
        .join("; ");
}

// --- the bug's §Reproduction rows, verbatim ---------------------------------

/** A (§Reproduction A) — `return i * 10` in a `par for` body inside `fn(): integer`. */
const SRC_A = [
  "fn outer(): integer {",
  "  let xs = par for i in [1, 2, 3] {",
  "    return i * 10",
  "  }",
  "  1",
  "}",
  "let n = outer()",
  "n",
].join("\n");

/** B (§Reproduction B) — the same body at the TOP LEVEL. */
const SRC_B = ["let xs = par for i in [1, 2, 3] {", "  return i * 10", "}", "xs"].join(
  "\n",
);

/** C (§Reproduction C) — a body `return` followed by an unreachable tail `0`. */
const SRC_C = [
  "let xs = par for i in [1, 2, 3] {",
  "  return i * 10",
  "  0",
  "}",
  "xs",
].join("\n");

/** D (§Reproduction D) — a BARE `return` in a top-level `par for` body. */
const SRC_D = ["let xs = par for i in [1, 2] {", "  return", "}", "xs"].join("\n");

/** E (§Reproduction E) — CONTROL: the same loop with a TAIL expression, no `return`. */
const SRC_E = ["let xs = par for i in [1, 2, 3] {", "  i * 10", "}", "xs"].join("\n");

/** F (§Reproduction F) — CONTROL: `return i` in a PLAIN `for` inside `fn(): integer`. */
const SRC_F = [
  "fn outer(): integer {",
  "  for i in [1, 2] {",
  "    return i",
  "  }",
  "  0",
  "}",
  "let n = outer()",
  "n",
].join("\n");

/** G (§Reproduction G) — `return 7` in a `par for` body inside `fn(): integer`. */
const SRC_G = [
  "fn outer(): integer {",
  "  let xs = par for i in [1, 2] {",
  "    return 7",
  "  }",
  "  1",
  "}",
  "let n = outer()",
  "n",
].join("\n");

/** H (§Reproduction H) — CONTROL: `return i` in a plain TOP-LEVEL `for`. */
const SRC_H = ["for i in [1, 2] {", "  return i", "}", "0"].join("\n");

/** I (§Reproduction I) — a body `return` with a top-level `42` after the loop. */
const SRC_I = ["let xs = par for i in [1, 2] {", "  return i", "}", "42"].join("\n");

/** J (§Reproduction J) — `return 5` inside an `if true { … }` in the body. */
const SRC_J = [
  "let xs = par for i in [1, 2] {",
  "  if true {",
  "    return 5",
  "  }",
  "  9",
  "}",
  "xs",
].join("\n");

/** K (§Reproduction K) — `return j` inside a NESTED PLAIN `for j in [7]` in the body. */
const SRC_K = [
  "let xs = par for i in [1, 2] {",
  "  for j in [7] {",
  "    return j",
  "  }",
  "  9",
  "}",
  "xs",
].join("\n");

/** M — a BARE `return` in a `par for` body inside `fn(): void` (RET-2 silent there). */
const SRC_M = [
  "fn outer(): void {",
  "  let xs = par for i in [1, 2] {",
  "    return",
  "  }",
  "}",
  "outer()",
].join("\n");

/** N — a `return` in the body of a `par for` NESTED in a `par for` body. */
const SRC_N = [
  "let xs = par for i in [1, 2] {",
  "  let ys = par for j in [3] {",
  "    return j",
  "  }",
  "  ys",
  "}",
  "xs",
].join("\n");

/** O — a `return` whose OPERAND is an enclosing-conversation query. */
const SRC_O = ["let xs = par for i in [1, 2] {", "  return @`hi`?", "}", "xs"].join("\n");

/** P — a `return` inside a `fn` DECLARED in the body: outside the refusal's reach. */
const SRC_P = [
  "let xs = par for i in [1, 2] {",
  "  fn mk(): integer {",
  "    return 1",
  "  }",
  "  1",
  "}",
  "xs",
].join("\n");

// ===========================================================================
// PARSE — the refusal fires at every body depth and every enclosing shape
// ===========================================================================

describe("bug 0223 — a `return` in a `par for` body is refused at load (CTRL-4, route (a))", () => {
  it("(b1) B: `return <expr>` directly in a TOP-LEVEL `par for` body is theta/parse/par-return-in-body", () => {
    // §Reproduction B. Pre-fix this loaded with ZERO diagnostics (re-measured
    // at this tree: `[]`), so the statement `docs/spec_topics/return.md:3`
    // states unconditionally had no realisation and no refusal.
    expect(
      diagShapeOf(SRC_B),
      `PRIMARY (bug 0223 §Fix route (a)): the body `+
        `is a scope in which \`return\` is not written, so the whole ` +
        `diagnostics array is exactly that one refusal, carrying the return ` +
        `statement's range. Observed: ${showDiags(SRC_B)}`,
    ).toEqual([`error ${PAR_RETURN_IN_BODY}@2:3-2:16`]);
  });

  it("(b2) A: the same body inside a NON-VOID `fn` draws the same refusal", () => {
    // §Reproduction A. The refusal is the BODY's, not the enclosing scope's —
    // unlike RET-2's verdict, which is inherited from the enclosing annotation
    // (src/parser/theta-document.ts:7757 hands the body the enclosing scope's
    // `voidReturn`). So the enclosing `fn`'s annotation must not change it.
    expect(
      diagShapeOf(SRC_A),
      `PRIMARY (bug 0223): the refusal belongs to the \`par for\` body, so an ` +
        `enclosing non-void \`fn\` neither adds nor withholds anything. ` +
        `Observed: ${showDiags(SRC_A)}`,
    ).toEqual([`error ${PAR_RETURN_IN_BODY}@3:5-3:18`]);
  });

  it("(b3) G: a `return` whose operand is a LITERAL draws the refusal (the operand form is irrelevant)", () => {
    // §Reproduction G. The refusal is on the STATEMENT, so it does not depend
    // on the operand mentioning the loop variable.
    expect(
      diagShapeOf(SRC_G),
      `PRIMARY (bug 0223): a literal-operand \`return\` is refused on the same ` +
        `terms as a loop-variable one. Observed: ${showDiags(SRC_G)}`,
    ).toEqual([`error ${PAR_RETURN_IN_BODY}@3:5-3:13`]);
  });

  it("(b4) J: a `return` nested inside an `if` block in the body draws the refusal (depth > 0, nested block)", () => {
    // §Reproduction J: the fold reaches through a nested block, so the refusal
    // must too. `scanParForStmt`'s `case "if"` recurses at the SAME
    // `loopDepth` (src/parser/theta-document.ts:4719), so this row would be
    // refused even under a `loopDepth === 0` gate — (b5) is the row that
    // discriminates the gate.
    expect(
      diagShapeOf(SRC_J),
      `PRIMARY (bug 0223): a nested \`if\` block does not shelter a body ` +
        `\`return\`. Observed: ${showDiags(SRC_J)}`,
    ).toEqual([`error ${PAR_RETURN_IN_BODY}@3:5-3:13`]);
  });

  it("(b5) K: a `return` inside a NESTED PLAIN `for` in the body draws the refusal — `loopDepth` is IGNORED", () => {
    // §Reproduction K, the row that forces the depth decision. The
    // `break` / `continue` arm is gated on `loopDepth === 0`
    // (src/parser/theta-document.ts:4707) because at depth > 0 a `break`
    // targets the inner loop and stays inside the iteration. A `return` at the
    // same depth does NOT stay inside: it propagates out of the plain `for`
    // (`executeFor`'s outward arm, src/runtime/statement-executor.ts:1724) and
    // is consumed at the `par for` boundary (`:1316-1320`). So the depth gate
    // must NOT be copied — this cell reds against a depth-0-only refusal.
    expect(
      diagShapeOf(SRC_K),
      `PRIMARY (bug 0223 §Fix route (a), the depth question): refused at ` +
        `EVERY body depth, because a depth-1 \`return\` crosses the inner loop ` +
        `and folds. A depth-0-only gate (the \`break\` shape) leaves this row ` +
        `silent. Observed: ${showDiags(SRC_K)}`,
    ).toEqual([`error ${PAR_RETURN_IN_BODY}@3:5-3:13`]);
  });

  it("(b6) M: a BARE `return` in a `par for` body inside `fn(): void` draws the refusal alone", () => {
    // The bare form is IN CLASS. RET-2 has nothing to say here (the enclosing
    // annotation is `void`, so `checkBareReturn` returns `undefined` —
    // src/parser/functions.ts:379), which makes this the cleanest bare-form
    // row: pre-fix it loaded with zero diagnostics (re-measured: `[]`).
    expect(
      diagShapeOf(SRC_M),
      `PRIMARY (bug 0223): the bare form is refused by the body's own rule, ` +
        `not by the enclosing annotation — a \`void\` enclosure no longer ` +
        `admits it. Observed: ${showDiags(SRC_M)}`,
    ).toEqual([`error ${PAR_RETURN_IN_BODY}@3:5-3:11`]);
  });

  it("(b7) N: a `return` in the body of a `par for` NESTED in a `par for` body is refused EXACTLY ONCE", () => {
    // The inner `par for`'s body is scanned by the inner loop's own
    // `emitParForBodyDiagnostics` call (src/parser/theta-document.ts:4632),
    // not by the outer scan — `scanParForExpr`'s nested-`par for` arm visits
    // the inner iterand and `max` only (`:4793-4800`). Measured at this tree
    // through the analogous code: the same nesting with a `break` in the inner
    // body draws exactly one `theta/parse/par-break-continue`, so the inner
    // body IS scanned and the count is one. This cell pins BOTH facts: the
    // refusal reaches an inner body, and it is not double-emitted.
    expect(
      diagShapeOf(SRC_N),
      `PRIMARY (bug 0223): an inner \`par for\` body is refused by its own ` +
        `scan, exactly once (no double emission from the outer scan). ` +
        `Observed: ${showDiags(SRC_N)}`,
    ).toEqual([`error ${PAR_RETURN_IN_BODY}@3:5-3:13`]);
  });

  it("(b8) P: a `return` inside a `fn` DECLARED in the body draws NO par-return-in-body — the carve-out", () => {
    // The refusal's reach is the body's OWN statement tree. `scanParForStmt`'s
    // `default` arm (src/parser/theta-document.ts:4774-4777) covers `fn` and
    // does not descend, which is correct rather than a gap: a `fn` body is its
    // own return scope, so a `return` written there exits that `fn` and never
    // crosses the iteration boundary. The nested DECLARATION is what CTRL-4's
    // neighbour rule refuses, under FN-1's `theta/parse/nested-fn`. The sibling
    // pin for this shape is (r8) in tests/par-for.test.ts, which asserts the
    // same carve-out over a `fn` body that also carries unreachable code.
    expect(
      diagShapeOf(SRC_P),
      `PRIMARY (bug 0223, the carve-out CTRL-4 now states): the whole ` +
        `diagnostics array is FN-1's declaration refusal alone — no ` +
        `\`par-return-in-body\`, because the \`fn\` body is a separate return ` +
        `scope. Observed: ${showDiags(SRC_P)}`,
    ).toEqual([`error ${NESTED_FN}@2:3-4:4`]);
  });
});

// ===========================================================================
// PARSE — the neighbour codes fire BESIDE the refusal (whole unfiltered array)
// ===========================================================================
//
// §Fix route (a)'s cost item: "the interaction with RET-2 and RET-3. Today D
// draws `bare-return-in-non-void` from the enclosing scope and C draws
// `unreachable-code`; a refusal must state whether those fire beside it or are
// withheld as derived verdicts, with exact pass-wide counts per
// `(code, range)`." Settled: they FIRE BESIDE it, nothing is withheld. Both
// cells assert the WHOLE unfiltered ordered array with exact ranges, so a
// withholding implementation reds here and nowhere else.

describe("bug 0223 — the refusal fires BESIDE the RET-family verdicts, withholding nothing", () => {
  it("(c1) C: `unreachable-code` (RET-3) still fires beside the refusal, refusal first", () => {
    // Order is structural, not stipulated: the CTRL-4 body scan runs at parse
    // time (`emitParForBodyDiagnostics`, src/parser/theta-document.ts:4653)
    // and `checkUnreachableCode` in the post-parse walk
    // (called at src/parser/theta-document.ts:7130).
    // Pre-fix this row was `["warning theta/parse/unreachable-code@3:3-3:4"]`
    // alone (re-measured at this tree).
    expect(
      diagShapeOf(SRC_C),
      `PRIMARY (bug 0223 §Fix route (a), RET-3 interaction): exactly two ` +
        `diagnostics — the body refusal on the \`return\` statement, then ` +
        `RET-3's warning on the unreachable tail. Neither is withheld and ` +
        `neither is duplicated. Observed: ${showDiags(SRC_C)}`,
    ).toEqual([
      `error ${PAR_RETURN_IN_BODY}@2:3-2:16`,
      `warning ${UNREACHABLE_CODE}@3:3-3:4`,
    ]);
  });

  it("(c2) D: `bare-return-in-non-void` (RET-2) still fires beside the refusal, refusal first", () => {
    // Both diagnostics carry the SAME range (the bare `return` statement's,
    // 2:3-2:9 measured at this tree) — one per (code, range), no duplication.
    // Pre-fix this row was `["error theta/parse/bare-return-in-non-void@2:3-2:9"]`
    // alone: a verdict computed from a scope the runtime never returns to.
    expect(
      diagShapeOf(SRC_D),
      `PRIMARY (bug 0223 §Fix route (a), RET-2 interaction): exactly two ` +
        `diagnostics over the one bare \`return\` — the body refusal first, ` +
        `then RET-2's enclosing-scope verdict. Observed: ${showDiags(SRC_D)}`,
    ).toEqual([
      `error ${PAR_RETURN_IN_BODY}@2:3-2:9`,
      `error ${BARE_RETURN_IN_NON_VOID}@2:3-2:9`,
    ]);
  });

  it("(q1) O: the refusal is emitted BEFORE the operand is walked, so a query in the operand still draws par-query-in-body", () => {
    // `scanParForStmt`'s `case "return"` (now preceded by the refusal this
    // fix adds) still descends into the operand afterward
    // (src/parser/theta-document.ts:4770-4772), which is how a query hidden in
    // a `return`'s operand draws CTRL-4's query refusal. The new emission must
    // be pushed BEFORE that descent, so the statement-level refusal precedes
    // the operand-level one. Pre-fix this row was
    // `["error theta/parse/par-query-in-body@2:10-2:15"]` alone (re-measured).
    expect(
      diagShapeOf(SRC_O),
      `PRIMARY (bug 0223): the body refusal precedes the operand walk's own ` +
        `CTRL-4 refusal; the operand walk is NOT replaced by the refusal. ` +
        `Observed: ${showDiags(SRC_O)}`,
    ).toEqual([
      `error ${PAR_RETURN_IN_BODY}@2:3-2:16`,
      `error ${PAR_QUERY_IN_BODY}@2:10-2:15`,
    ]);
  });
});

// ===========================================================================
// PARSE — controls: the legal spellings are UNAFFECTED
// ===========================================================================
//
// §Expected behaviour's last bullet: "a legal `par for` is unaffected: a body
// with no `return` keeps loading with zero diagnostics and keeps its
// tail-expression element values (E)". These three cells are GREEN both before
// and after the fix — they bound the refusal to a body `return`, so an
// over-broad emission (every `par for`, or every `return`) reds here.

describe("bug 0223 — controls: a legal `par for` and both plain-`for` spellings are unaffected", () => {
  it("(e1) E: the same loop with a TAIL expression instead of a `return` loads clean", () => {
    expect(
      diagShapeOf(SRC_E),
      `CONTROL (green before AND after): the refusal is bound to a body ` +
        `\`return\`, not to \`par for\`. Observed: ${showDiags(SRC_E)}`,
    ).toEqual([]);
  });

  it("(e2) F: `return i` in a PLAIN `for` body inside `fn(): integer` loads clean", () => {
    expect(
      diagShapeOf(SRC_F),
      `CONTROL (green before AND after): a plain \`for\` body carries no ` +
        `CTRL-4 restriction — the documented early-exit idiom ` +
        `(docs/spec_topics/return.md:6-14) keeps loading. ` +
        `Observed: ${showDiags(SRC_F)}`,
    ).toEqual([]);
  });

  it("(e3) H: `return i` in a plain TOP-LEVEL `for` loads clean", () => {
    expect(
      diagShapeOf(SRC_H),
      `CONTROL (green before AND after): the top-level plain-\`for\` spelling ` +
        `— the H half of the H/I pair that differs only by the token \`par\` ` +
        `— is untouched. Observed: ${showDiags(SRC_H)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// DIAG-4 — the registered Message is the emitted Message
// ===========================================================================

describe("bug 0223 — DIAG-4: par-return-in-body's message is the registry's", () => {
  it("(d1) the emitted message equals the sharded registry's Message column, verbatim and placeholder-free", () => {
    // The registry row route (a) owes. This cell reds until the row lands on a
    // sharded docs/spec_topics/diagnostics/code-registry-*.md page — a
    // correct-reason red, and a LOUD one: `registryMessageFor` throws naming
    // the missing row rather than skipping (bug 0223 §Fix route (a) inherits
    // bug 0200's open adjudication about WHICH shard hosts a `par-*` row; that
    // it must be on one is DIAG-4's requirement).
    const registered = registryMessageFor(PAR_RETURN_IN_BODY);
    expect(
      registered,
      "DIAG-4: the settled Message is placeholder-free, mirroring " +
        "`par-break-continue`'s wording with `return` in place of its " +
        "`<keyword>` placeholder",
    ).toBe("'return' is not permitted inside a 'par for' body");
    expect(
      messagesFor(SRC_B, PAR_RETURN_IN_BODY),
      "DIAG-4: the emitted message is transcribed from the registry's Message " +
        "column, with no placeholder left unbound",
    ).toEqual([registered]);
  });
});

// ===========================================================================
// RUNTIME harness — the defensive fold, pinned
// ===========================================================================

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

/**
 * A `StatementEvalHost` that evaluates only the pure forms these bodies need —
 * literals, the loop-variable identifier, arrays and `+` / `*` binaries — and
 * runs no effects. The `par for` fan-out, flow handling and element collection
 * are the production code paths (`runParForIteration`,
 * src/runtime/statement-executor.ts:1256).
 */
class PureHost implements StatementEvalHost {
  evaluatePure(expr: Expr, env: LexicalEnvironment): ThetaValue {
    return this.#eval(expr, env);
  }

  checkpointFor(_expr: Expr): CheckpointDescriptor | null {
    return null;
  }

  async runEffect(): Promise<OperationResult> {
    throw new Error(
      "PureHost: no effect is written in any bug-0223 fold row — an effect " +
        "reaching the host means the source under test is not the row's source",
    );
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
        const left = this.#eval(expr.left, env) as number;
        const right = this.#eval(expr.right, env) as number;
        if (expr.op === "*") {
          return left * right;
        }
        if (expr.op === "+") {
          return left + right;
        }
        return null;
      }
      default:
        return null;
    }
  }
}

function execDeps(body: ThetaBody, host: StatementEvalHost): ExecuteBodyDeps {
  return {
    env: buildEnvironment({ body }),
    host,
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new NoopMutator(),
    mode: "prompt",
    file: "test.theta",
  };
}

/** Parse `src` and return its body (for execution). */
function bodyOf(src: string): ThetaBody {
  return parse(src).body;
}

/** Parse `src` (diagnostics notwithstanding) and run the real `executeBody` over its body. */
async function runValue(src: string): Promise<unknown> {
  const body = bodyOf(src);
  const exec = await executeBody(body, execDeps(body, new PureHost()));
  return exec.result;
}

// ===========================================================================
// RUNTIME — DEFENSIVE-FOLD LOCK
// ===========================================================================
//
// GREEN BOTH BEFORE AND AFTER THE FIX, BY DESIGN. Route (a) makes
// `runParForIteration`'s `case "return"` arm
// (src/runtime/statement-executor.ts:1316-1320) UNREACHABLE from a fresh load —
// the parse refusal above denies registration — but the arm KEEPS its
// behaviour as a defensive fold, exactly as `case "break"` / `case "continue"`
// already do (`:1274-1277`, whose comment names the parser gate). These cells
// are that arm's only witness: the bug records "Test coverage of the runtime
// fold: none", so without them a change to `:1269-1273` reds nothing.
//
// In-process execution is possible despite the refusal because diagnostics do
// not prevent `executeBody` from running a parsed body — only production LOAD
// (registration) is denied. That is what makes a retained-but-unreachable arm
// testable at all.

describe("bug 0223 — the runtime fold is RETAINED as a defensive arm (green before and after the fix)", () => {
  it("(f1) C: the `return`'s operand is the element value and the body tail is skipped", async () => {
    expect(
      await runValue(SRC_C),
      "DEFENSIVE FOLD: `runParForIteration` folds `flow.kind === \"return\"` " +
        "into `makeOk(flow.value)`, identically to a normal body " +
        "completion's own arm (src/runtime/statement-executor.ts:1316-1320), so " +
        "the operand becomes the element and the tail `0` never runs",
    ).toEqual({
      present: true,
      value: [
        { ok: true, value: 10 },
        { ok: true, value: 20 },
        { ok: true, value: 30 },
      ],
    });
  });

  it("(f1-control) E: the tail-expression spelling yields the IDENTICAL value", async () => {
    // The discrimination the fold erases: a body `return`'s value is
    // indistinguishable from a tail expression's (§Reproduction C vs E). Pinned
    // so that erasure cannot silently change.
    expect(
      await runValue(SRC_E),
      "DEFENSIVE FOLD control: byte-identical to (f1) — the fold makes a body " +
        "`return` and a body tail expression produce the same elements",
    ).toEqual(await runValue(SRC_C));
  });

  it("(f2) I: the enclosing scope is NOT exited — the statement after the loop is the value", async () => {
    expect(
      await runValue(SRC_I),
      "DEFENSIVE FOLD: the `return` is consumed at the iteration boundary, so " +
        "the theta's tail `42` is the value — where the plain-`for` spelling " +
        "(f2-control) exits with `1`",
    ).toEqual({ present: true, value: 42 });
  });

  it("(f2-control) H: the plain-`for` spelling DOES exit, with the loop body's value", async () => {
    // `executeFor` returns a `return` flow outward unchanged
    // (src/runtime/statement-executor.ts:1724). One token — `par` — is the
    // whole difference between this row and (f2).
    expect(
      await runValue(SRC_H),
      "DEFENSIVE FOLD control: `executeFor` propagates the flow outward " +
        "(src/runtime/statement-executor.ts:1724), so the theta exits with `1` " +
        "and its tail `0` never runs",
    ).toEqual({ present: true, value: 1 });
  });

  it("(f3) J: the fold reaches through a nested `if` block", async () => {
    expect(
      await runValue(SRC_J),
      "DEFENSIVE FOLD: a `return` inside a nested block still lands at the " +
        "`par for` boundary, so `5` is each element and the tail `9` never runs",
    ).toEqual({
      present: true,
      value: [
        { ok: true, value: 5 },
        { ok: true, value: 5 },
      ],
    });
  });

  it("(f4) K: the fold CROSSES a nested plain `for` boundary", async () => {
    expect(
      await runValue(SRC_K),
      "DEFENSIVE FOLD: the `return` propagates out of the inner plain `for` " +
        "(src/runtime/statement-executor.ts:1724) and is consumed at the " +
        "`par for` boundary — which is why the `break` depth gate does not " +
        "transfer to `return` (cell (b5))",
    ).toEqual({
      present: true,
      value: [
        { ok: true, value: 7 },
        { ok: true, value: 7 },
      ],
    });
  });

  it("(f5) D: a BARE body `return` folds to an `Ok(null)` element", async () => {
    expect(
      await runValue(SRC_D),
      "DEFENSIVE FOLD: the value-less `return` folds to `makeOk(null)` " +
        "regardless of the enclosing annotation RET-2 judged it against",
    ).toEqual({
      present: true,
      value: [
        { ok: true, value: null },
        { ok: true, value: null },
      ],
    });
  });
});
