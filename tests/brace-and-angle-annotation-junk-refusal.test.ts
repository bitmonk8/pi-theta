import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { annotationSourceIsNotTypeExpression } from "../src/parser/type-layer-checks";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0252 — `annotationSourceIsNotTypeExpression` (src/parser/type-layer-checks.ts)
// declines — admits without judging — any annotation text carrying BOTH a brace
// and an angle bracket, so junk each half of that conjunct refuses on its own
// (`{a: integer--}` refuses, `array<integer-->` refuses) loads clean when both
// characters appear (`{a: integer--, c: array<integer>}`,
// `{a: integer, b > c, m: integer}`). `letAnnotationToCompatType` then declines
// the whole interior through `inlineObjectAnnotationToCompatType` and
// `convertAnnotation` mints a deferring `{kind:"named", name:<the annotation
// text>}`, so TYPE-8 (docs/reference/type-system.md:55) has no field set to
// compare and `theta/parse/let-rhs-type-mismatch` plus
// `theta/parse/reassign-rhs-type-mismatch` are withheld with nothing on any
// channel. The theta registers
// (docs/bugs/0252-brace-and-angle-annotation-junk-exempt-from-refusal.md). This
// file is that report's §Fix "Witness".
//
// CITED BY SYMBOL, NEVER BY LINE (docs/STYLE.md §Citations; bug 0134
// (docs/bugs/0134-params-shift-induced-stale-citations.md) is the adjudicated
// stale-citation class). The route below edits
// `src/parser/type-layer-checks.ts` and reads a predicate out of
// `src/parser/params.ts`, so every citation into either names a function and
// its module. Spec sentences, which have no symbol to name, keep their line.
//
// THE MECHANISM. `annotationSourceIsNotTypeExpression` asks whether the text
// carries a brace and whether it carries an angle bracket and returns `false`
// — not refusable — when both hold, BEFORE the shared refusable-text sink
// (`collectUnresolvedNamedTypes` + `isUnspellableTextRefusable`, same module)
// is consulted. That decline is landed law with a stated reason (bug 0124's
// §Fix: a union or generic split must not hand the sink a SHARD of a group the
// author wrote whole), but its test is the presence of two characters ANYWHERE
// in the annotation, so it also covers every interior whose junk merely sits
// beside an unrelated generic (B2) and every interior whose only angle bracket
// IS the junk (A2, B3).
//
// =====================================================================
// THE ROUTE THIS FILE ENCODES (settled by the parent run and premeasured by it
// against a working prototype: .pi/tmp/fixes/0252-premeasure.md)
// =====================================================================
// §Fix ROUTE (a), NARROWED TO THE AUTHOR-WRITTEN BRACE GROUP. For an
// annotation carrying both a brace and an angle bracket:
//   1. if the text is NOT a single enclosing brace group
//      (`isSingleEnclosingBraceGroup`, src/parser/params.ts — the predicate the
//      shared sink itself uses to decide the brace-group entry), the SHRED
//      decline stands exactly as landed. Only a brace group nested inside a
//      generic argument or a union arm can be cut into a shard, so this is the
//      shard property bug 0124's §Fix names, and a capture over-run
//      (`fn f(n: integer>): integer { 1 }`) is text no author wrote;
//   2. else the group is one unit the author wrote whole, so a kind-matched
//      scan of it shreds nothing: a close token that closes nothing, or closes
//      the wrong kind, inside that group derives from no `Type` production
//      (docs/reference/grammar.md:215) and is refused directly;
//   3. else the shared refusable-text sink judges the text exactly as it judges
//      the text at any non-conjunct position.
// The route mints no diagnostic code and moves no registry row's identity; it
// edits the *Trigger* sentence at
// docs/spec_topics/diagnostics/code-registry-parse.md:106 (and the inherited
// sentence in row :107) under DIAG-2, which is the implementer's same-commit
// obligation and not this file's observable.
//
// WHY NARROWING THE DECLINE ALONE IS NOT ENOUGH, measured by the parent run:
// with the conjunct decline hypothetically removed, the sink's refusable set
// for A2's interior is EMPTY —
//     sink("{a: integer, b > c, m: integer}")  → []
//     sink("{a: integer--, c: array<integer>}") → ["integer--"]
// — because `lowerInlineObject`'s keyless-entry skip drops `b > c` before the
// sink ever sees it. Step 2's positive structural judgement is what closes A2,
// A3, A4 and B3; step 3 alone closes B2. The unit group (U) pins both halves at
// the predicate's own seam.
//
// EVERY EXPECTATION BELOW IS THE SPECIFIED BEHAVIOUR, NOT THE CURRENT ONE, and
// every post-fix value is the parent run's prototype measurement. TWO of them
// DEVIATE from the bug document's §Expected behaviour 4, which the premeasure
// adjudicates and this file follows:
//   - DEVIATION 1 — §Expected behaviour 4's "C3 keeps its code" cannot hold
//     under this route, and §Expected behaviour 1 overrides it: once A2's
//     annotation is refused, the registry row's own withhold census
//     (code-registry-parse.md:106 — the binding record is seeded WITHHELD)
//     removes the `theta/parse/non-array-iterand` line that read the deferring
//     nominal, so C3 becomes the refusal ALONE. C5 and C6 lose their silence
//     for the same reason. The clause holds only under §Fix route (b), which
//     the parent run declined.
//   - DEVIATION 2 — the same requirement forces bug 0130's cell e7 rows
//     e7.1–e7.4 to flip from `[]` to the refusal
//     (tests/let-annotation-inline-object-compat.test.ts, updated in this
//     change under the same authority).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/diagnostics/code-registry-parse.md:106 —
//     `theta/parse/annotation-type-not-expression`, whose *Trigger* states the
//     refusal ("Refused, at all three positions alike") for an annotation
//     carrying text that derives from no `Type` production, and states the
//     SHRED decline as a shard protection rather than a licence for junk each
//     half of the conjunct refuses alone. The same row states the withhold
//     census deviation 1 turns on, and states "one diagnostic per offending
//     annotation".
//   - docs/spec_topics/diagnostics/code-registry-parse.md:59 —
//     `theta/parse/let-rhs-type-mismatch` (the control column A1/A5/C1 keep);
//     :58 `theta/parse/reassign-rhs-type-mismatch` (C1); the
//     `theta/parse/non-array-iterand` and
//     `theta/parse/duplicate-inline-field-name` rows carry C4 and the
//     constraint-3 cell.
//   - docs/reference/grammar.md:215 (`Type`), :225 (`ObjectType`) — the
//     productions the refused texts derive from none of.
//   - docs/reference/type-system.md:55 — TYPE-8, the field-wise rule whose
//     operand the deferring nominal replaces.
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the *Message*
//     column is normative and a test MUST source it from the registry. No
//     message prose is transcribed below: every expected string is read through
//     `parseRegistry` / `registryMessage`, so a reworded template reds by
//     naming the registry.
//
// THE LEDGER — RED at HEAD for exactly the symptom the report names (a missing
// `theta/parse/annotation-type-not-expression`), except where a cell is
// declared a FENCE:
//   - (A) the `let` position. A1/A5 controls GREEN; A2, A3, A4 RED (`[]` at
//     HEAD).
//   - (B) the conjunct itself, as two byte-neighbour pairs. B1/B4/B6 GREEN
//     (each half refuses alone); B2 and B3 RED; B5 a GREEN fence — it is no
//     single enclosing brace group, so step 1 keeps the decline and its
//     `let-rhs-type-mismatch` is unmoved.
//   - (C) the checks the deferral withholds. C1/C4 controls GREEN; C2, C3, C5,
//     C6 RED (deviation 1 governs C3/C5/C6).
//   - (D) the same interior at `params:`, repaired by bug 0238 (0.218.0) —
//     GREEN fences in both trees, asserted as BYTE EQUALITY between the control
//     and the stray-token row (§Reproduction D).
//   - (F) §Expected behaviour 3 / §Fix constraint 2 — five legal-or-declined
//     annotations and one capture over-run keep exactly their HEAD
//     dispositions. GREEN fences; a red here is the union half of the shard
//     hazard re-opened, or the decline's remaining reach lost.
//   - (G) §Fix constraint 3 — exactly one diagnostic per newly-refused
//     annotation, and the duplicate-key row alone where the annotation's own
//     walk already errored. The count half is RED at HEAD (zero, not one).
//   - (U) the changed predicate at its own seam. B2/B3 and A2's interior RED
//     (`false` at HEAD); B1/B4/B6 and B5 GREEN.
//
// ORDERING IS PART OF THE ASSERTION. Every diagnostic cell is an ordered
// whole-list `toEqual` over the UNFILTERED `doc.diagnostics`, so neither an
// extra diagnostic nor a right diagnostic in a wrong order can hide inside a
// containment check or a `.some()`.
//
// TIER: unit, offline, deterministic, provider-free — the tier this repository
// puts this kind of claim in, and the tier the report's own §Reproduction was
// measured at. Every observable settles inside one `parseThetaDocument` call
// over a source string (`parseDoc`, tests/helpers/e2e-s1.ts), one read of the
// settled document's own frontmatter object, or one direct call to the exported
// predicate. An integration tier would add a session round-trip to a
// parse-time value and a live tier would make a fully determined value
// stochastic; neither buys reach for a recogniser claim. §Fix's live clause —
// every (A), (B) and (C) row REGISTERS today and this route makes them refuse,
// so a registration outcome moves — is a SEPARATE obligation and is not
// discharged by this file.
//
// ANTI-VACUITY / NO SILENT SKIPPING: nothing here early-returns, branches on
// the environment or conditionally skips. The registry lookup asserts its row's
// presence and its placeholder before the template is used, so a missing or
// reworded row reds by naming the registry rather than by a bare `undefined`
// comparison. Group (D) asserts the lowered envelope is PRESENT before
// comparing its bytes, so a withheld frontmatter fails loudly instead of
// comparing two `null`s.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4). Mirrors
// tests/inline-object-stray-close-token-split.test.ts (bug 0238's witness).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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
) as RegistryRow[];

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison, and no prose is transcribed into this file.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

const NOT_TYPE_EXPR = "theta/parse/annotation-type-not-expression";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const REASSIGN_RHS_MISMATCH = "theta/parse/reassign-rhs-type-mismatch";
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";

/** One expected diagnostic, as a code plus the placeholder fills its row needs. */
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}

/** This report's row: the refusal, naming the `let` binder. */
function REFUSE(name: string): Exp {
  return { severity: "error", code: NOT_TYPE_EXPR, fills: [["<name>", name]] };
}
function LETRHS(name: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: LET_RHS_MISMATCH,
    fills: [
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}
function REASSIGN(name: string, expected: string, actual: string): Exp {
  return {
    severity: "error",
    code: REASSIGN_RHS_MISMATCH,
    fills: [
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ],
  };
}
function ITERAND(type: string): Exp {
  return { severity: "error", code: NON_ARRAY_ITERAND, fills: [["<type>", type]] };
}
function DUP(field: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", field]] };
}

/** One rendered diagnostic, in the shape `diagLines` produces. */
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}

// ===========================================================================
// Parse harness. `parseDoc` (tests/helpers/e2e-s1.ts) is the shipped whole-file
// entry point `parseThetaDocument` wrapped in the standard inert deps — an
// in-band no-op system-note channel and a resolving `model:` matcher. No
// behaviour is stubbed: the lexer, the parser, the frontmatter reader, the
// recogniser and the conversion under assertion are the production ones.
// ===========================================================================

/** A whole `mode: prompt` theta whose body is `body`, exactly as §Reproduction spells it. */
function theta(body: string): string {
  return `---\nmode: prompt\n---\n${body}\n`;
}

/**
 * §Reproduction (D)'s `params:` fixture: a whole prompt-mode theta with one
 * `params:` field `p` carrying the type under test, body `let x = 1`. The type
 * is single-quoted, which is exact for every interior below (none spells a `'`),
 * so the scalar the frontmatter reader delivers is the type verbatim.
 */
function paramsSrc(type: string): string {
  return `---\nmode: prompt\nparams:\n  p: '${type}'\n---\nlet x = 1\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string): string[] {
  return diagLines(parseDoc(src));
}

/** One diagnostic-list cell: a whole theta source and its whole ordered list. */
interface Cell {
  readonly cell: string;
  readonly src: string;
  readonly expected: readonly Exp[];
}

/**
 * One group's cells asserted as a whole-map equality: separate assertions would
 * stop at the first divergence and hide the rest, and every subject-versus-
 * control claim here is only meaningful against whole lists compared together.
 */
function expectGroup(cells: readonly Cell[], why: string): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const c of cells) {
    const key = `${c.cell} :: ${JSON.stringify(c.src)}`;
    actual[key] = lines(c.src);
    expected[key] = renderAll(c.expected);
  }
  expect(actual, why).toEqual(expected);
}

// The interiors §Reproduction (A)–(D) share. `STRAY` is the sharp one: its only
// angle bracket IS its junk, so no generic anywhere in it supplies the
// conjunct's second character.
const CONTROL_INTERIOR = "{a: integer, m: integer}";
const STRAY_INTERIOR = "{a: integer, b > c, m: integer}";
const NESTED_STRAY_INTERIOR = "{a: integer, n: {q > r, m: integer}}";
const NESTED_CONTROL_INTERIOR = "{a: integer, n: {q: integer, m: integer}}";

// ===========================================================================
// (A) THE `let` ANNOTATION — §Reproduction (A), §Expected behaviour 1.
// ===========================================================================

describe("bug 0252 (A) — the withheld check at the `let` annotation", () => {
  it("A1–A5: junk in the interior is refused; the two controls keep their mismatch ", () => {
    // A2 is THE SHARP ROW: `let y: {a: integer, b > c, m: integer} = 1` draws
    // `[]` where its byte-neighbour control A1 draws
    // `theta/parse/let-rhs-type-mismatch`, and the only difference between the
    // two sources is the entry `b > c, ` — which is no `Field`
    // (docs/reference/grammar.md:225) and whose `>` supplies the conjunct's
    // angle bracket by itself.
    //
    // A3 shows the row is not an artefact of the RHS: no initialiser type is
    // compatible with this annotation and none is reported, so the missing line
    // cannot be excused as a compatible pair.
    //
    // A4 is the nested spelling — the stray token sits inside `n`'s own braces,
    // where it cancels a REAL `{` for any unkinded depth counter — and A5 is
    // its control.
    //
    // POST-FIX the four refusing rows draw the refusal ALONE, not the control's
    // mismatch: the route judges the ANNOTATION at the recogniser
    // (`annotationSourceIsNotTypeExpression`, src/parser/type-layer-checks.ts),
    // and the registry row seeds the binding WITHHELD, so no second line reads
    // the text the refusal rejected (code-registry-parse.md:106).
    expectGroup(
      [
        {
          cell: "A1 control",
          src: theta(`let y: ${CONTROL_INTERIOR} = 1`),
          expected: [LETRHS("y", "{ a: integer, m: integer }", "integer")],
        },
        {
          cell: "A2 THE SHARP ROW",
          src: theta(`let y: ${STRAY_INTERIOR} = 1`),
          expected: [REFUSE("y")],
        },
        {
          cell: "A3 string RHS — the row is not the initialiser's",
          src: theta(`let y: ${STRAY_INTERIOR} = "s"`),
          expected: [REFUSE("y")],
        },
        {
          cell: "A4 nested stray",
          src: theta(`let y: ${NESTED_STRAY_INTERIOR} = 1`),
          expected: [REFUSE("y")],
        },
        {
          cell: "A5 nested control",
          src: theta(`let y: ${NESTED_CONTROL_INTERIOR} = 1`),
          expected: [
            LETRHS("y", "{ a: integer, n: { q: integer, m: integer } }", "integer"),
          ],
        },
      ],
      "a red reporting `[]` for A2/A3/A4 is bug 0252: " +
        "`annotationSourceIsNotTypeExpression` (src/parser/type-layer-checks.ts) saw a brace " +
        "and an angle bracket in the text and declined before the refusable-text sink ran, " +
        "then `inlineObjectAnnotationToCompatType` declined the whole interior on the " +
        "colon-less entry and `convertAnnotation` minted the deferring nominal, so TYPE-8 " +
        "(docs/reference/type-system.md:55) had no field set to compare. A red on A1 or A5 " +
        "instead is §Expected behaviour 4's no-move column broken",
    );
  });
});

// ===========================================================================
// (B) THE CONJUNCT IS THE HOLE — §Reproduction (B). Two byte-neighbour pairs:
// in each, the added text is well-formed and the junk is unchanged.
// ===========================================================================

describe("bug 0252 (B) — each half of the conjunct refuses what their conjunction admits", () => {
  it("B1/B2 and B4/B5 pairs, plus B3 and B6: the junk decides, not the brackets ", () => {
    // B1 (brace-only junk) and B4 (angle-only junk) refuse at HEAD, so both
    // halves of the conjunct are live. B2 adds one well-formed
    // `c: array<integer>` field beside B1's untouched junk and the whole
    // interior goes silent; B3 adds a bare `>` instead and does the same. Those
    // two are the hole, and the route closes them by two DIFFERENT steps —
    // which is why both spellings are pinned:
    //   - B2's interior is a single enclosing brace group whose close tokens
    //     all match, so step 3 hands it to the shared sink, which refuses the
    //     keyed junk tail `integer--` exactly as it does in B1;
    //   - B3's interior is a single enclosing brace group carrying a `>` that
    //     closes nothing, so step 2 refuses it directly.
    //
    // B5 IS A FENCE, GREEN IN BOTH TREES: `array<{a: integer--}>` is NOT a
    // single enclosing brace group (`isSingleEnclosingBraceGroup`,
    // src/parser/params.ts), so step 1 keeps the SHRED decline landed as bug
    // 0124 wrote it and the row keeps its `let-rhs-type-mismatch`. Its
    // `<expected>` column renders the junk text `array<{a: integer--}>`
    // verbatim, which is no static type — that is bug 0247's class
    // (docs/bugs/0247-untypeable-static-type-has-no-category-1-rendering-clause.md),
    // measured here and NOT claimed here, so this cell pins the RENDERED bytes
    // as they stand rather than as 0247 will fix them.
    //
    // B6 is the bare junk with no brackets at all — the sink's ordinary
    // subject, unmoved.
    expectGroup(
      [
        {
          cell: "B1 brace-only junk",
          src: theta("let y: {a: integer--} = 1"),
          expected: [REFUSE("y")],
        },
        {
          cell: "B2 the same junk, one well-formed angle-bracketed field added",
          src: theta("let y: {a: integer--, c: array<integer>} = 1"),
          expected: [REFUSE("y")],
        },
        {
          cell: "B3 the same junk, a bare `>` added",
          src: theta("let y: {a: integer--, c > d} = 1"),
          expected: [REFUSE("y")],
        },
        {
          cell: "B4 angle-only junk",
          src: theta("let y: array<integer--> = 1"),
          expected: [REFUSE("y")],
        },
        {
          cell: "B5 FENCE the same junk, one brace added — no single enclosing brace group",
          src: theta("let y: array<{a: integer--}> = 1"),
          expected: [LETRHS("y", "array<{a: integer--}>", "integer")],
        },
        {
          cell: "B6 bare junk, neither bracket",
          src: theta("let y: integer-- = 1"),
          expected: [REFUSE("y")],
        },
      ],
      "a red reporting `[]` for B2 or B3 is the conjunct exemption itself: the junk " +
        "`integer--` is byte-identical to B1's, which refuses, and the only change is text " +
        "the grammar admits. A red on B1/B4/B6 is a half of the conjunct lost; a red on B5 is " +
        "the SHRED decline narrowed past the shard property bug 0124's §Fix names, which " +
        "§Fix constraint 2 forbids",
    );
  });
});

// ===========================================================================
// (C) THE OTHER CHECKS THE DEFERRAL WITHHOLDS — §Reproduction (C),
// §Expected behaviour 2, and DEVIATION 1 for C3/C5/C6.
// ===========================================================================

describe("bug 0252 (C) — the reassignment pair and the render-face fence", () => {
  it("C1/C2: the reassignment check is not lost with the initialiser check ", () => {
    // §Expected behaviour 2. C1's control draws BOTH lines in source order —
    // the initialiser row and bug 0115's write row — while C2, one entry apart,
    // draws nothing at either position: the binding's recorded declared type is
    // the deferring nominal, so the write gate has no field set either.
    //
    // POST-FIX C2 draws the refusal ALONE (one line, §Fix constraint 3): the
    // annotation is rejected once, at the declaration, and the binding is
    // seeded WITHHELD, so the reassignment defers rather than reporting a
    // second time against text the refusal rejected.
    expectGroup(
      [
        {
          cell: "C1 reassignment control",
          src: theta(`let mut y: ${CONTROL_INTERIOR} = 1\ny = "s"`),
          expected: [
            LETRHS("y", "{ a: integer, m: integer }", "integer"),
            REASSIGN("y", "{ a: integer, m: integer }", "string"),
          ],
        },
        {
          cell: "C2 reassignment, stray",
          src: theta(`let mut y: ${STRAY_INTERIOR} = 1\ny = "s"`),
          expected: [REFUSE("y")],
        },
      ],
      "a red reporting `[]` for C2 is §Expected behaviour 2's loss: one exempt annotation " +
        "withholds the declaration check AND every later write check on the same binding, " +
        "because `convertAnnotation` (src/parser/type-layer-checks.ts) recorded a nominal " +
        "with no fields. A red reporting TWO lines for C2 is §Fix constraint 3's " +
        "one-diagnostic-per-annotation rule broken",
    );
  });

  it("C3/C4: the render-face fence — the iterand line and bug 0247's ownership ", () => {
    // C3 is the deferral's ONE VISIBLE FACE at HEAD: the nominal's name is the
    // annotation text, so `theta/parse/non-array-iterand`'s `<type>` slot
    // renders `{a: integer, b > c, m: integer}` verbatim and unspaced, where
    // C4's control renders the re-serialised type `{ a: integer, m: integer }`.
    // Bug 0247
    // (docs/bugs/0247-untypeable-static-type-has-no-category-1-rendering-clause.md)
    // OWNS THAT RENDERED COLUMN — no clause of rendering category 1 admits a
    // rendering for a static type the parse layer cannot determine — and this
    // report neither claims nor fixes it.
    //
    // DEVIATION 1 FROM §Expected behaviour 4, adjudicated in the premeasure:
    // that clause says C3 keeps its code, and it cannot under this route. Once
    // the annotation is refused, the registry row's withhold census
    // (code-registry-parse.md:106) seeds the binding WITHHELD, the deferring
    // nominal is NEVER BUILT, and the `non-array-iterand` line that read it has
    // no operand — so C3 becomes the refusal alone. The clause holds only under
    // §Fix route (b), which the parent run declined on the doc's own record.
    // The cell is kept as the render-face fence precisely so 0247's face
    // disappearing here is recorded rather than discovered: the junk text stops
    // reaching a rendered column at THIS position, and 0247's class is unclosed
    // either way.
    expectGroup(
      [
        {
          cell: "C3 iterand, stray — the render face, now the refusal alone",
          src: theta(`let y: ${STRAY_INTERIOR} = 1\nfor q in y { let w = 1 }`),
          expected: [REFUSE("y")],
        },
        {
          cell: "C4 iterand control",
          src: theta(`let y: ${CONTROL_INTERIOR} = 1\nfor q in y { let w = 1 }`),
          expected: [
            LETRHS("y", "{ a: integer, m: integer }", "integer"),
            ITERAND("{ a: integer, m: integer }"),
          ],
        },
      ],
      "a red at C3 reporting the `non-array-iterand` line carrying the raw annotation text is " +
        "HEAD's deferring nominal still being built and still being read; a red reporting BOTH " +
        "lines is the withhold census (code-registry-parse.md:106) not applied. A red at C4 is " +
        "§Expected behaviour 4's control column broken",
    );
  });

  it("C5/C6: the index and member reads lose the annotation's line too ", () => {
    // §Reproduction (C) rows C5 and C6: at HEAD the index and member checks
    // defer on a nominal BY DESIGN, so these two rows lose the annotation's own
    // line only. DEVIATION 1 governs them as it governs C3: with the annotation
    // refused, both draw the refusal alone. They are pinned so the withhold's
    // reach at the two remaining structural reads is stated rather than
    // inferred from C3.
    expectGroup(
      [
        {
          cell: "C5 index, stray",
          src: theta(`let y: ${STRAY_INTERIOR} = 1\nlet w = y["a"]`),
          expected: [REFUSE("y")],
        },
        {
          cell: "C6 member, stray",
          src: theta(`let y: ${STRAY_INTERIOR} = 1\nlet w = y.zzz`),
          expected: [REFUSE("y")],
        },
      ],
      "a red reporting `[]` is bug 0252's terminal silence at a third and fourth read of the " +
        "same binding; a red reporting a SECOND line beside the refusal is the index or member " +
        "check judging text the refusal rejected, against the row's withhold census",
    );
  });
});

// ===========================================================================
// (D) THE SAME INTERIOR AT `params:` — §Reproduction (D). Bug 0238 (0.218.0)
// repaired this position; §Expected behaviour 4 pins it unmoved. GREEN fences.
// ===========================================================================

describe("bug 0252 (D) — the `params:` position does not move", () => {
  it("D1/D2: both rows load clean and lower BYTE-IDENTICALLY ", () => {
    // The report's position comparison: ONE interior, TWO positions, and at
    // HEAD two dispositions. Bug 0238's typed opener stacks
    // (`splitTopLevelSegments` / `topLevelColon`, src/parser/params.ts) made the
    // stray-token row lower byte-identically to its control here, so the
    // `params:` face is already correct and this route must leave it alone —
    // the route touches `annotationSourceIsNotTypeExpression` and the `let`
    // annotation's own judgement, neither of which the `params:` text stage
    // consults for these interiors.
    //
    // The assertion is EQUALITY BETWEEN THE TWO ROWS, not a transcribed
    // envelope: §Reproduction D states "the SAME `$ref`, the same slug,
    // byte-identical fragment", and bug 0238's own witness
    // (tests/inline-object-stray-close-token-split.test.ts) owns the
    // hand-derived slug bytes. Presence is asserted first so a withheld
    // frontmatter fails loudly instead of comparing two nulls.
    const control = parseDoc(paramsSrc(CONTROL_INTERIOR)).frontmatter?.params?.loweredSchema;
    const stray = parseDoc(paramsSrc(STRAY_INTERIOR)).frontmatter?.params?.loweredSchema;
    expect(
      control,
      "D1 must register and lower a `params:` envelope; an absent one means the control row " +
        "was refused, which §Reproduction (D) does not measure and §Expected behaviour 4 " +
        "forbids",
    ).toBeDefined();
    expect(
      stray,
      "D2 must register and lower a `params:` envelope — that is bug 0238's shipped outcome " +
        "at this position, and this route must not withdraw it",
    ).toBeDefined();
    expect(
      JSON.stringify(stray),
      "§Reproduction (D): the stray-token `params:` row lowers byte-identically to its " +
        "control after bug 0238 (0.218.0). A red here means this route reached a position it " +
        "does not claim — the `params:` text stage — and moved bug 0238's shipped bytes",
    ).toBe(JSON.stringify(control));
    expectGroup(
      [
        { cell: "D1 params control", src: paramsSrc(CONTROL_INTERIOR), expected: [] },
        { cell: "D2 params stray `>`", src: paramsSrc(STRAY_INTERIOR), expected: [] },
      ],
      "both `params:` rows load clean at HEAD and must keep doing so: this route refuses at " +
        "the `let` annotation, and a refusal appearing at `params:` is a GOV-15 surface this " +
        "report does not claim",
    );
  });
});

// ===========================================================================
// (F) §Expected behaviour 3 / §Fix constraint 2 — the legal and the declined
// annotations keep exactly their HEAD dispositions. MEASURED at HEAD, not
// reasoned: every value below was read off this tree before it was written
// here. GREEN fences.
// ===========================================================================

describe("bug 0252 (F) — the decline's remaining reach and the union half of the shard hazard", () => {
  it("F1–F5: five brace-carrying annotations keep their HEAD dispositions ", () => {
    // §Fix constraint 2 demands MEASUREMENT rather than reasoning that the
    // union half of the shard hazard is not re-opened: `splitTopLevelUnion`
    // (src/parser/type-layer-checks.ts) tracks angle depth only, so a brace
    // group carrying a top-level `|` can still be shredded, and the SHRED
    // decline is what keeps such a shard from reaching the sink.
    //
    // F1 and F2 are the two shapes bug 0204 measured out of the
    // generic-argument half of the hazard, and bug 0028's `RESULT-LET-BRACE`
    // witness (tests/unresolved-annotation-lowering.test.ts) is F1's shape at
    // its own site — §Fix constraint 1 keeps that file green and this cell is
    // this file's own copy of the same boundary. Neither is a single enclosing
    // brace group, so step 1 leaves them exactly as landed.
    //
    // F3 IS THE UNION HALF ITSELF: `{a: integer} | null` is a brace group whose
    // union split can cut it, and it keeps its `let-rhs-type-mismatch`.
    // F4 carries a `|` INSIDE the group and no angle bracket, so the conjunct
    // never applied to it and the sink already judged it silent at HEAD; it is
    // pinned so a route that starts refusing an admitted union field type reds.
    // F5 is a single enclosing brace group with matched angle brackets in TWO
    // fields — the shape step 3 hands to the sink — and it must stay ADMITTED,
    // because every field type in it derives from a `Type` production.
    expectGroup(
      [
        {
          cell: "F1 Result<{…}, QueryError> — bug 0028's RESULT-LET-BRACE shape",
          src: theta("let y: Result<{a: string, b: integer, c: boolean}, QueryError> = 1"),
          expected: [],
        },
        {
          cell: "F2 array<{a: integer}>",
          src: theta("let y: array<{a: integer}> = 1"),
          expected: [LETRHS("y", "array<{ a: integer }>", "integer")],
        },
        {
          cell: "F3 {a: integer} | null — the union half of the shard hazard",
          src: theta("let y: {a: integer} | null = 1"),
          expected: [LETRHS("y", "{ a: integer } | null", "integer")],
        },
        {
          cell: "F4 {a: integer|null} — a union INSIDE the group, no angle bracket",
          src: theta("let y: {a: integer|null} = 1"),
          expected: [],
        },
        {
          cell: "F5 {a: array<integer>, b: array<string>} — matched angles in two fields",
          src: theta("let y: {a: array<integer>, b: array<string>} = 1"),
          expected: [
            LETRHS("y", "{ a: array<integer>, b: array<string> }", "integer"),
          ],
        },
      ],
      "§Expected behaviour 3 and §Fix constraint 2: a red reporting " +
        "`theta/parse/annotation-type-not-expression` on any of these five rows is a LEGAL " +
        "annotation newly refused — the falsely-refusing direction bug 0124's §Fix records the " +
        "SHRED decline as existing to prevent, and the direction that reds bug 0028's " +
        "`RESULT-LET-BRACE` cell (tests/unresolved-annotation-lowering.test.ts). A red " +
        "reporting a LOST mismatch line is the opposite failure: the route stopped building " +
        "the annotation's field set for a shape it already built one for",
    );
  });

  it("F6: a capture over-run keeps its silence — the decline's remaining reach ", () => {
    // Bug 0124's cell e2 input (tests/annotation-nontype-text-refusal.test.ts):
    // the `fn` parameter capture is LENIENT, so `fn f(n: integer>): integer { 1 }`
    // joins the body into the captured annotation text
    // (`integer>):integer{1}`), which carries both a brace and an angle bracket
    // and is text NO AUTHOR WROTE. Step 1 of the route is what keeps it
    // declined: the capture over-run is not a single enclosing brace group, so
    // the SHRED decline stands and this position stays silent. Bug 0124's own
    // witness holds all 251 of its cells; this cell states the boundary inside
    // THIS file, because the boundary is the reason step 1 exists.
    expectGroup(
      [
        {
          cell: "F6 capture over-run at an `fn` parameter type",
          src: theta("fn f(n: integer>): integer { 1 }"),
          expected: [],
        },
      ],
      "a red here reporting `theta/parse/annotation-type-not-expression` is the SHRED " +
        "decline's remaining reach lost: the refused text would be a capture over-run — the " +
        "annotation joined to the function body — which no author spelled, and bug 0124's " +
        "cell e2 pins its silence",
    );
  });
});

// ===========================================================================
// (G) §Fix constraint 3 — exactly one diagnostic per offending annotation, and
// the annotation whose OWN walk already errored keeps that error alone.
// ===========================================================================

/** Every source whose annotation this route newly refuses (§Expected behaviour 1). */
const NEWLY_REFUSED: ReadonlyArray<readonly [string, string]> = [
  ["A2", `let y: ${STRAY_INTERIOR} = 1`],
  ["A3", `let y: ${STRAY_INTERIOR} = "s"`],
  ["A4", `let y: ${NESTED_STRAY_INTERIOR} = 1`],
  ["B2", "let y: {a: integer--, c: array<integer>} = 1"],
  ["B3", "let y: {a: integer--, c > d} = 1"],
  ["C2", `let mut y: ${STRAY_INTERIOR} = 1\ny = "s"`],
  ["C3", `let y: ${STRAY_INTERIOR} = 1\nfor q in y { let w = 1 }`],
  ["C5", `let y: ${STRAY_INTERIOR} = 1\nlet w = y["a"]`],
  ["C6", `let y: ${STRAY_INTERIOR} = 1\nlet w = y.zzz`],
];

describe("bug 0252 (G) — one diagnostic per offending annotation", () => {
  it("every newly-refused annotation draws EXACTLY ONE line, and it is the refusal ", () => {
    // code-registry-parse.md:106 states it in terms: "one diagnostic per
    // offending annotation, not one per fragment". Bug 0124 §Fix (f)
    // constraint 1's per-annotation guard and the withhold census across the
    // recogniser's consumers are what hold it — each consumer reads the
    // position as unannotated or seeds the binding withheld, so no sibling row
    // reports on the refused text beside the refusal. Asserted as a MAP of
    // whole lists so a doubled line names its row.
    const observed: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [cell, body] of NEWLY_REFUSED) {
      observed[cell] = lines(theta(body));
      expected[cell] = [render(REFUSE("y"))];
    }
    expect(
      observed,
      "§Fix constraint 3: a red reporting `[]` is the refusal still withheld (bug 0252's " +
        "subject); a red reporting TWO lines is the per-annotation guard lost — either the " +
        "recogniser refusing per fragment, or a consumer judging text the refusal rejected",
    ).toEqual(expected);
  });

  it("the duplicate-key interior keeps `duplicate-inline-field-name` ALONE ", () => {
    // `{a: integer, b > c, a: integer}` is bug 0238's cell W22 interior at this
    // position. Its annotation's OWN position-rule walk already draws an
    // error-severity diagnostic, and the registry row states that such an
    // annotation "keeps that diagnostic ALONE and draws no refusal" — the
    // per-annotation guard in `src/parser/theta-document.ts`, which reads the
    // recogniser only where the walk itself found nothing. GREEN at HEAD and
    // after; it is the boundary that keeps this route from doubling every
    // interior that is both malformed and already refused.
    expectGroup(
      [
        {
          cell: "G2 duplicate key behind a stray close token",
          src: theta("let y: {a: integer, b > c, a: integer} = 1"),
          expected: [DUP("a")],
        },
      ],
      "a red reporting the refusal BESIDE the duplicate-key line is the per-annotation guard " +
        "in src/parser/theta-document.ts bypassed, against code-registry-parse.md:106's own " +
        "sentence; a red reporting the refusal INSTEAD of it is bug 0238's landed cell W22 " +
        "withdrawn",
    );
  });
});

// ===========================================================================
// (U) THE CHANGED PREDICATE, DIRECT — §Fix "Witness"'s unit cell.
// `annotationSourceIsNotTypeExpression` is the component route (a) edits, so
// its verdict is pinned at its own seam and not only through its consumers.
// ===========================================================================

describe("bug 0252 (U) — annotationSourceIsNotTypeExpression at its own seam", () => {
  it("the six B-group texts, plus A2's interior, get their route-(a) verdicts ", () => {
    // `true` means refusable — the text derives from no `Type` production. The
    // six B-group texts are exactly §Reproduction (B)'s annotation sources, and
    // the seventh row is A2's interior, whose refusal this route mints in THIS
    // predicate (step 2) rather than downstream.
    //
    // The two `false` expectations are load-bearing in the opposite direction:
    // `array<{a: integer--}>` is no single enclosing brace group
    // (`isSingleEnclosingBraceGroup`, src/parser/params.ts), so step 1 keeps
    // the SHRED decline and the predicate must keep declining it — that is
    // cell B5's disposition read one layer down, and the reason the fix cannot
    // be "delete the conjunct".
    expect(
      {
        "B1 {a: integer--}": annotationSourceIsNotTypeExpression("{a: integer--}"),
        "B2 {a: integer--, c: array<integer>}": annotationSourceIsNotTypeExpression(
          "{a: integer--, c: array<integer>}",
        ),
        "B3 {a: integer--, c > d}": annotationSourceIsNotTypeExpression(
          "{a: integer--, c > d}",
        ),
        "B4 array<integer-->": annotationSourceIsNotTypeExpression("array<integer-->"),
        "B5 array<{a: integer--}>": annotationSourceIsNotTypeExpression(
          "array<{a: integer--}>",
        ),
        "B6 integer--": annotationSourceIsNotTypeExpression("integer--"),
        "A2 {a: integer, b > c, m: integer}":
          annotationSourceIsNotTypeExpression(STRAY_INTERIOR),
      },
      "a red reporting `false` for B2, B3 or A2 is the brace-AND-angle decline returning " +
        "before the refusable-text sink runs — bug 0252's root cause at its own seam. A red " +
        "reporting `true` for B5 is the decline narrowed past the shard property bug 0124's " +
        "§Fix names (§Fix constraint 2); a red on B1/B4/B6 is the sink itself broken",
    ).toEqual({
      "B1 {a: integer--}": true,
      "B2 {a: integer--, c: array<integer>}": true,
      "B3 {a: integer--, c > d}": true,
      "B4 array<integer-->": true,
      "B5 array<{a: integer--}>": false,
      "B6 integer--": true,
      "A2 {a: integer, b > c, m: integer}": true,
    });
  });
});
