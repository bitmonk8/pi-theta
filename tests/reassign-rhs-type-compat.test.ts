import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0115 — `docs/spec_topics/bindings.md:12` §Reassignment states one
// obligation on a reassignment beyond mutability ("the RHS must be compatible
// with the binding's declared or inferred type per [Type System — Type
// compatibility]") and at HEAD 769164b8 (before this fix) nothing in either
// phase evaluated it: the type phase's `case "reassign"` (then
// src/parser/type-layer-checks.ts:1314–1316, now wired at :1315–1345) was
// exactly `this.walkExpr(stmt.value, bindings, flow); return;`, the
// structural-parse check `checkReassignment` (src/parser/bindings.ts) receives
// `{ name, mutable }` and no type at all, and the runtime write `writeBinding`
// (src/runtime/lexical-environment.ts) branches on `slot.mutable` alone. So
// `let mut n: integer = 1` / `n = "hi"` loaded with ZERO diagnostics, and the
// registry carried no row the position's emission could have used
// (docs/bugs/0115-reassignment-type-compat-unchecked-no-registry-row.md).
// This file's fix commit lands both the check and the row (§ below).
//
// THE ROUTE THIS FILE WITNESSES — §Fix (a), Route 1 (mint a row), not §Fix (b)
// (widen `let-rhs-type-mismatch`'s *Trigger*). Route 2's decisive cost is
// DIAG-4: its fixed *Message* renders the word `initialiser` at a position that
// has no initialiser, and the reword is deferred to theta 2.0. The minted row:
//
//   code    theta/parse/reassign-rhs-type-mismatch
//   sev     E          phase   type
//   message reassignment of '<name>' type mismatch: expected <expected>, got <actual>
//
// with the NARROWING sub-case (§Fix (c)) routed to the ALREADY-REGISTERED
// `theta/parse/integer-narrowing` — the one sub-case where both routes agree,
// and a row that is not position-scoped, so no second mint and no *Trigger*
// question. Placement is the type phase's reassign arm, reusing
// `checkCompatible` and the `"unknown"` deferral of `checkLetRhsCompat`
// (src/parser/type-compat.ts, deferral arm "Compatible, or statically
// unresolvable"). The structural-parse site and the runtime are untouched, so
// `theta/parse/immutable-rebinding` keeps firing from where it fires today.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/bindings.md:12 §Reassignment — the obligation, naming the
//     plain form and all five compound forms `+=`, `-=`, `*=`, `/=`, `%=` in the
//     same sentence as the compatibility clause. One row per offending
//     statement, whichever form it is spelled with.
//   - docs/spec_topics/bindings.md §Reassignment, anchor
//     `#reassignment-binding-type` — bug 0090's landed adjudication: "A
//     reassignment does not change the binding's type: every later reference
//     resolves the type the binding was declared or inferred with, for the whole
//     of the binding's scope." This is the READ side and it is the authority for
//     what the RHS is judged AGAINST here (the recorded declared-or-inferred
//     type) and for why the recorded type does not move after the write — which
//     is what makes group (e) a set of ADDITIONS rather than disappearances.
//   - docs/spec_topics/type-system.md:27 — the enumeration of positions `⊑`
//     governs. The reassignment RHS is absent from it today; Route 1 adds the
//     position there and to TYPE-9 (:50, which names four sites), so the
//     emission becomes citeable.
//   - docs/spec_topics/type-system.md:52 TYPE-10 — object-schema named types are
//     nominal, so `Q ⋢ P` regardless of field shape (group (d), cell d2).
//   - docs/spec_topics/type-system.md:54 TYPE-11 — alias-schema transparency: a
//     `schema S = string` annotation is replaced by `string` on whichever side
//     it appears, which is also the form the `let` arm records
//     (`unfoldAlias(annotation, this.env)`, src/parser/type-layer-checks.ts:1250)
//     — hence d3's `<expected>` renders `string`, not `S`.
//   - docs/spec_topics/type-system.md §Unresolvable operands — licenses the
//     deferral group (g) rests on; it is the same arm `checkLetRhsCompat`
//     already takes, and it is load-bearing rather than incidental: two
//     committed examples reassign a `?`-unwrapped query binding
//     (docs/examples/refine.theta, refine-inline.theta), gated at zero
//     diagnostics by tests/committed-fixture-parse-gate.test.ts.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 DIAG-2 — the registry
//     is closed, so the row is a spec change landing in lock-step with the
//     implementation; :74 DIAG-4 — the *Message* column is normative, which is
//     why group (i) reconciles this file's template against it and why every
//     already-registered expectation below is READ from the registry.
//   - docs/spec_topics/governance/source-language-stability.md:25 — the GOV-15
//     diagnostic-registry carve-out: a code ADDITION is admissible within a
//     theta 1.x minor exactly for inputs that did not previously emit it, which
//     is every emitting cell below (each measured `[]` or a strict subset at
//     HEAD — no cell LOSES a code).
//   - docs/spec_topics/diagnostics/placeholder-rendering-a.md:7 (the closure),
//     :11 (category 1, `<expected>` / `<actual>`);
//     placeholder-rendering-b.md:10 (category 5, `<name>`, rendered unquoted
//     with the quotes supplied by the template) — the three placeholders the
//     minted row reuses, so it states no new rendering vector and needs no
//     closure edit.
//
// WHERE THE BUG DOCUMENT IS WRONG, and this file departs from it. §Fix's witness
// list asks the group (e) rows to pin that the consequence "stops surfacing as
// `unknown-method`". Under bug 0090's landed `#reassignment-binding-type` rule it
// does not stop: the recorded `number` still governs the receiver, so
// `n.length()` after `n = "x"` keeps its `theta/parse/unknown-method` and the new
// row is an ADDITION at the offending statement (cell e1 asserts both codes).
// The document's wish predates that adjudication; the rule it contradicts is
// normative text, so the rule wins.
//
// RED / GREEN LEDGER at HEAD 769164b8 (v0.133.0), each list measured by probe
// through `parseDoc`:
//   RED (the missing check) — a1, a2 `[]`; b1–b3 and their inferred twins `[]`;
//   b4–b8 (all five compound forms) `[]`; b9 `[]`; c1 `[]`; d1–d4 `[]`;
//   e1 `["theta/parse/unknown-method"]` (one code, gains the new row);
//   e2, e3, e4 `[]`; f1 `["theta/parse/immutable-rebinding"]` (one code, gains
//   the new row); f2, f3 `[]`; g6t, g7t (the composite-withheld deferrals'
//   EMITTING twins) `[]`.
//   RED (the registry gap) — group (i): docs/spec_topics/diagnostics/
//   code-registry-parse.md carries no `reassign-rhs-type-mismatch` row at HEAD.
//   GREEN AT HEAD AND REQUIRED GREEN AFTER (both directions) — a3, a4, c2
//   (the checked-position controls, which prove the relation is computable on
//   these operands and that the reassignment statement is reached by a check at
//   all); g1, g2, g3, g4, g5, g6, g7 (the deferrals §Fix (f) turns on); h1, h2 (bug
//   0079's adjudicated disposition, unmoved in both directions).
//
// RED-PROVABILITY OF THE GREEN CELLS (AGENTS.md §"Verify both directions when
// adding or strengthening an assertion"). Each green cell names the gate whose
// removal reds it, so none of them can be a cell that cannot fail:
//   g1 — the `"compatible"` arm (`integer ⊑ number`, TYPE-2): report on a
//        compatible write and g1 reds.
//   g2/g3 — the `"unknown"` deferral arm: report on an unresolvable operand and
//        both red, and so does the committed-corpus gate.
//   g4/g5 — DOUBLY guarded, so neither cell pins the new gate pair. A TOP-LEVEL
//        withheld record is `{ kind: "named", name: <the sentinel> }`, an
//        unresolvable named, so `checkCompatible` answers `"unknown"` on either
//        ordering and the emitter's own `"unknown"` arm returns `[]` even with
//        the arm-level gate deleted. Measured: both stay green under either
//        conjunct's removal. They are kept because they are true deferral rows
//        for the commonest withheld shape, not because they can red for the
//        gate.
//   g6/g7 — the red-provable pins on the `containsWithheldBinderType` gate pair
//        this fix adds (the NINTH such pair in the walk; the predicate is
//        src/parser/type-layer-checks.ts:445). A withheld binder inside a
//        COMPOSITE is where the gate is load-bearing: `decide`
//        (src/parser/type-compat.ts) settles a kind mismatch (`array<…>`
//        against `string`) under TYPE-7 BEFORE it tries to resolve the element,
//        so the verdict is `"incompatible"` and the emitter's `"unknown"` arm
//        never runs. Measured: drop the gate on the RHS side and g6 reds
//        (emitting a Message that renders the private sentinel spelling into
//        normative text); drop it on the TARGET side and g7 reds; each reds on
//        its own side only. Each is paired with an EMITTING twin (g6t, g7t)
//        that differs only in that the binder carries an annotation, so the
//        read is judged instead of withheld — neither green cell can be
//        satisfied by a check that never runs on those shapes at all.
//   h1/h2 — h1 reds if the new row is also emitted where bug 0079's gate already
//        reports (`r = 5` on a `Result`-recorded binding is judged
//        `"unknown"`, not incompatible); h2 reds if an `Ok(…)` RHS stops
//        deferring.
//
// ANTI-VACUITY. Every assertion is an ordered whole-list equality over the
// AGGREGATED codes (or over `code: message` pairs), so a lost diagnostic, a
// spurious extra one and a reordering all red; and the seven `[]`-expecting
// cells sit beside emitting neighbours built from the same frontmatter and the
// same harness, so a parse that stopped reaching the type layer reds loudly in
// the emitting cells instead of silently satisfying the empty ones.
//
// TIER — unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string, plus one read of the
// committed registry corpus. An integration tier would add a discovery /
// session round-trip to reach the same parse-time diagnostic list and witness
// nothing further; a live tier would put a model in front of a fully determined
// static observable. The runtime half of the report (`writeBinding` accepting a
// mistyped write) is an explicit §Non-goal of the chosen route — the runtime is
// untouched — so no runtime cell is minted here.
//
// NO SILENT SKIPPING (CLAUDE.md, AGENTS.md). Nothing early-returns, branches on
// the environment, or skips: `registered()` THROWS naming the registry page when
// a row it needs is absent, and the minted row's own template is pinned as a
// literal (see EXPECTED_TEMPLATE) precisely so that the emitting cells red for
// the reason under test — the diagnostic is absent — and never for a harness
// reason.

// ===========================================================================
// The codes and their normative messages (DIAG-2 / DIAG-4).
// ===========================================================================

/** The code Route 1 mints. Absent from the registry at HEAD — group (i) reconciles it. */
const CODE = "theta/parse/reassign-rhs-type-mismatch";

/**
 * The minted row's *Message* template. Pinned as a literal rather than read
 * through `registryMessage` on purpose: the row does not exist at HEAD, so
 * sourcing it from the registry would make every emitting cell red for a HARNESS
 * reason ("no registry row") instead of for the reason under test (the
 * diagnostic is absent). Group (i) is the DIAG-4 reconciliation that reds when
 * this literal and the registry disagree.
 */
const EXPECTED_TEMPLATE =
  "reassignment of '<name>' type mismatch: expected <expected>, got <actual>";

/** The registered row the narrowing sub-case routes to (§Fix (c)). */
const NARROWING_CODE = "theta/parse/integer-narrowing";
/** The initialiser-position sibling whose *Trigger* does not reach a reassignment. */
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
/** The mutability row — a different phase, and untouched by this fix. */
const IMMUTABLE_CODE = "theta/parse/immutable-rebinding";
/** The consequence row group (e) proves is an addition, not a replacement. */
const UNKNOWN_METHOD_CODE = "theta/parse/unknown-method";
/** The desugared-operator row bug 0314 makes `+=` draw in addition to the compat verdict (b4). */
const MIXED_PLUS_CODE = "theta/parse/mixed-plus-operands";
/** Bug 0079's static gate, whose adjudicated disposition group (h) pins unmoved. */
const INTERPOLATED_RESULT_CODE = "theta/parse/interpolated-result";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
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
 * A registered code's normative *Message* template. Fails LOUDLY naming the
 * registry page when the row is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/** The minted row's message with its three placeholders interpolated. */
function reassignMismatch(name: string, expected: string, actual: string): string {
  return EXPECTED_TEMPLATE.replace("<name>", name)
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

function letRhsMessage(name: string, expected: string, actual: string): string {
  return registered(LET_RHS_CODE)
    .replace("<name>", name)
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

function immutableMessage(name: string): string {
  return registered(IMMUTABLE_CODE).replace("<name>", name);
}

function unknownMethodMessage(method: string, type: string): string {
  return registered(UNKNOWN_METHOD_CODE)
    .replace("<method>", method)
    .replace("<type>", type);
}

function mixedPlusMessage(left: string, right: string): string {
  return registered(MIXED_PLUS_CODE).replace("<left>", left).replace("<right>", right);
}

// ===========================================================================
// Parse harness — the shipped whole-file front end under the standard inert
// offline deps (`parseDoc`, tests/helpers/e2e-s1.ts). No behaviour is stubbed:
// the type layer under assertion is the production one. Every fixture is a body
// under `mode: prompt`, the convention §Reproduction measured in, and carries a
// tail expression where the last interesting statement is not itself a value.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";

/**
 * Body line 1 is file line 4: the frontmatter above occupies three lines. The
 * emitting fixtures below all place the offending reassignment on body line 2,
 * so its file line is this constant — used by the position pins in (a) and (e).
 */
const REASSIGN_LINE = 5;

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "bug0115.theta");
}

/** The whole diagnostic list, rendered for failure text. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map(
      (d: Diagnostic) =>
        `${d.severity} ${d.code} @${d.range === undefined ? "-" : d.range.start.line}: ${d.message}`,
    ),
  );
}

/** The aggregated diagnostic codes, in emission order. */
function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}

/** `severity code: message` for every diagnostic, in emission order. */
function fullOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

/** The aggregated codes of `body` are exactly `expected`, in order. */
function expectCodes(body: string, expected: readonly string[], why: string): void {
  const doc = parse(body);
  expect(codesOf(doc), `${why}; actual diagnostics=${render(doc)}`).toEqual([...expected]);
}

/**
 * `body` reports exactly one diagnostic: the minted row, error-severity, with
 * the interpolated message and located on the reassignment statement's line.
 * Severity is `error` per the minted row (Sev `E`, the severity every sibling
 * `⊑` sink carries): the write contradicts the binding's declared or inferred
 * type, so the theta must not load.
 */
function expectSoleMismatch(
  body: string,
  name: string,
  expected: string,
  actual: string,
  why: string,
): void {
  const doc = parse(body);
  expect(fullOf(doc), `${why}; actual diagnostics=${render(doc)}`).toEqual([
    `error ${CODE}: ${reassignMismatch(name, expected, actual)}`,
  ]);
}

// ===========================================================================
// (a) The two primary rows and the two checked-position controls.
// ===========================================================================

describe("bug 0115 (a) — a reassignment's RHS is judged against the binding's declared or inferred type", () => {
  it("RED a1: `let mut n: integer = 1` / `n = \"hi\"` reports reassign-rhs-type-mismatch at the reassignment", () => {
    // The headline row. Both operands are inside the parser's static view — a
    // string literal and a declared `integer` — so type-system.md §Unresolvable
    // operands licenses no deferral, and control a3 decides the identical pair
    // one position over. The POSITION is pinned as well as the code: the whole
    // point of the fix is that the offending statement reports, rather than a
    // later statement reporting under some other code (group (e)).
    expectSoleMismatch(
      'let mut n: integer = 1\nn = "hi"\n1\n',
      "n",
      "integer",
      "string",
      "a1 — the declared `integer` governs the write (bindings.md:12); a `string` RHS is `⋢` it",
    );
    const doc = parse('let mut n: integer = 1\nn = "hi"\n1\n');
    expect(
      doc.diagnostics[0]?.range?.start.line,
      `a1 — the diagnostic is located on the REASSIGNMENT statement, not on the declaration and not on a later read; actual diagnostics=${render(doc)}`,
    ).toBe(REASSIGN_LINE);
  });

  it("RED a2: the INFERRED twin `let mut n = 1` / `n = \"hi\"` reports the same row", () => {
    // bindings.md:12 says "declared OR INFERRED type", and bug 0090's
    // `#reassignment-binding-type` fixes the inferred type for the binding's
    // whole scope on the same terms. `let mut n = 1` infers `integer`, so this
    // row is a1 with the annotation dropped — and it is the row that rules out
    // §Fix (b)'s position-only *Trigger* widening, whose current text is scoped
    // to a TYPED binding as well as to the initialiser.
    expectSoleMismatch(
      'let mut n = 1\nn = "hi"\n1\n',
      "n",
      "integer",
      "string",
      "a2 — an inferred binding type constrains the write exactly as a declared one does",
    );
  });

  it("a3 CONTROL: the same mismatch at the INITIALISER keeps let-rhs-type-mismatch alone", () => {
    // Establishes that the relation is computable on these operands and that a
    // checked position reports it. Also the guard against an over-broad fix:
    // the initialiser sink must keep its own registered code and must not gain
    // the reassignment row.
    const doc = parse('let n: integer = "hi"\n1\n');
    expect(
      fullOf(doc),
      `a3 — the typed-\`let\` sink is unchanged by this fix (its emitter is reused, not rerouted); actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${LET_RHS_CODE}: ${letRhsMessage("n", "integer", "string")}`]);
  });

  it("a4 CONTROL: a COMPATIBLE write to an immutable binding keeps immutable-rebinding alone", () => {
    // Establishes that the reassignment statement is already reached by a check
    // — the mutability one — so a1's silence at HEAD is the compatibility check
    // being absent rather than the statement being unvisited. The fix does not
    // touch the structural-parse site, so this list must not move.
    const doc = parse("let n: integer = 1\nn = 2\n1\n");
    expect(
      fullOf(doc),
      `a4 — \`2\` is \`⊑ integer\`, so only the mutability row applies; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${IMMUTABLE_CODE}: ${immutableMessage("n")}`]);
  });
});

// ===========================================================================
// (b) Every primitive pair, annotated and inferred, and all five compound forms
//     bindings.md:12 names in the same sentence as the compatibility clause.
// ===========================================================================

interface PairCell {
  readonly id: string;
  readonly body: string;
  readonly name: string;
  readonly expected: string;
  readonly actual: string;
  readonly why: string;
}

const PRIMITIVE_PAIRS: readonly PairCell[] = [
  {
    id: "b1",
    body: 'let mut n: number = 1\nn = "x"\n1\n',
    name: "n",
    expected: "number",
    actual: "string",
    why: "a `string` under a declared `number`",
  },
  {
    id: "b1i",
    body: 'let mut n = 1.5\nn = "x"\n1\n',
    name: "n",
    expected: "number",
    actual: "string",
    why: "the same pair with the `number` INFERRED from a fractional literal",
  },
  {
    id: "b2",
    body: "let mut b: boolean = true\nb = 1\n1\n",
    name: "b",
    expected: "boolean",
    actual: "integer",
    why: "an `integer` under a declared `boolean` — no widening relation exists in either direction",
  },
  {
    id: "b2i",
    body: "let mut b = true\nb = 1\n1\n",
    name: "b",
    expected: "boolean",
    actual: "integer",
    why: "the same pair with the `boolean` inferred",
  },
  {
    id: "b3",
    body: 'let mut s: string = "a"\ns = 1\n1\n',
    name: "s",
    expected: "string",
    actual: "integer",
    why: "an `integer` under a declared `string`",
  },
  {
    id: "b3i",
    body: 'let mut s = "a"\ns = 1\n1\n',
    name: "s",
    expected: "string",
    actual: "integer",
    why: "the same pair with the `string` inferred",
  },
];

describe("bug 0115 (b1–b3) — every primitive pair reports, annotated and inferred alike", () => {
  for (const cell of PRIMITIVE_PAIRS) {
    it(`RED ${cell.id}: ${cell.why}`, () => {
      expectSoleMismatch(cell.body, cell.name, cell.expected, cell.actual, `${cell.id} — ${cell.why}`);
    });
  }
});

/**
 * The FOUR numeric-only compound forms, each with a `string` RHS on an
 * `integer` target. `+=` (b4) is handled separately below: bug 0314 desugars
 * `x <op>= e ≡ x = x <op> e` and routes `+=` through the shared operand check,
 * so `+=` on a mixed pair draws the operator row in addition to the compat
 * verdict, while `-=`/`*=`/`/=`/`%=` get no operand check and keep the sole
 * mismatch.
 */
const COMPOUND_OPERATORS: readonly [string, string][] = [
  ["b5", "-="],
  ["b6", "*="],
  ["b7", "/="],
  ["b8", "%="],
];

describe("bug 0115 (b4–b9) — all five compound forms are judged, and the compound narrowing routes to its own registered row", () => {
  it('RED b4: `n += "hi"` on an `integer` binding reports BOTH the compat mismatch AND the desugared mixed-plus row', () => {
    // PARENT RATIFICATION A-1 (bug 0314, recorded verbatim). bug 0314 defines
    // `x <op>= e ≡ x = x <op> e` and routes `+=` through the shared
    // `pushMixedPlusIfNeeded` operand check. So `n += "hi"` (integer target +
    // string RHS = a MIXED pair) now legitimately draws BOTH diagnostics:
    //   - `theta/parse/reassign-rhs-type-mismatch` — b4's ORIGINAL subject
    //     (TYPE-9's RHS-vs-target `⊑` check at the reassign position). PRESERVED:
    //     its code remains in the set.
    //   - `theta/parse/mixed-plus-operands` — the desugared operator check the
    //     same input now legitimately draws, verified byte-identical to the
    //     spelled binary `n = n + "hi"` (the added row renders `'+' has mixed
    //     operand types: integer and string` in both spellings).
    // The parent's ratified set is [mixed-plus-operands,
    // reassign-rhs-type-mismatch]; the emission ORDER is [reassign-rhs-type-
    // mismatch, mixed-plus-operands] and this ordered whole-list equality pins
    // it. Suppression (A-2 — routing `+=` past the operand check when the compat
    // mismatch already fires) was REJECTED on the record: `+=` must not draw
    // FEWER diagnostics than the spelled `+`. The widening is bounded to THIS
    // cell; b5–b8 (the numeric-only forms, which get no operand check) keep
    // `expectSoleMismatch` unchanged.
    const doc = parse('let mut n: integer = 1\nn += "hi"\n1\n');
    expect(
      fullOf(doc),
      `b4 — the desugared \`+=\` draws the operand check in lockstep with the spelled binary, in ADDITION to the compat verdict; actual diagnostics=${render(doc)}`,
    ).toEqual([
      `error ${CODE}: ${reassignMismatch("n", "integer", "string")}`,
      `error ${MIXED_PLUS_CODE}: ${mixedPlusMessage("integer", "string")}`,
    ]);
  });

  for (const [id, op] of COMPOUND_OPERATORS) {
    it(`RED ${id}: \`n ${op} "hi"\` on an \`integer\` binding reports reassign-rhs-type-mismatch`, () => {
      // bindings.md:12 names the plain form and `+=`, `-=`, `*=`, `/=`, `%=` in
      // ONE sentence with the compatibility clause, so one row covers all six
      // spellings — §Fix (a): "Distinct codes for the plain and compound forms
      // are not needed". These four are the numeric-only operators: bug 0314
      // gives them NO parse operand check (the spelled-binary sibling defect is
      // out of scope), so what is asserted here is the compatibility verdict on
      // the RHS against the target alone, in the same shape the plain form gets.
      expectSoleMismatch(
        `let mut n: integer = 1\nn ${op} "hi"\n1\n`,
        "n",
        "integer",
        "string",
        `${id} — the compound form \`${op}\` carries the same obligation as the plain form`,
      );
    });
  }

  it("RED b9: `n += 1.5` on an `integer` binding reports the REGISTERED integer-narrowing row, not the minted one", () => {
    // §Fix (c) — the one sub-case both DIAG-2 routes agree on: a `number` RHS
    // under an `integer` target is TYPE-2's one-way widening failure, which
    // `theta/parse/integer-narrowing` (code-registry-parse.md:24) already owns
    // and which is not position-scoped. The minted row must NOT also fire, so
    // the whole-list equality here is the no-double-report pin as well.
    const doc = parse("let mut n: integer = 1\nn += 1.5\n1\n");
    expect(
      fullOf(doc),
      `b9 — the narrowing outcome routes to the existing registered code exactly as \`checkLetRhsCompat\` routes it; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${NARROWING_CODE}: ${registered(NARROWING_CODE)}`]);
  });
});

// ===========================================================================
// (c) The plain narrowing row against its initialiser control.
// ===========================================================================

describe("bug 0115 (c) — the narrowing sub-case reports the already-registered row", () => {
  it("RED c1: `let mut n: integer = 1` / `n = 1.5` reports integer-narrowing", () => {
    const doc = parse("let mut n: integer = 1\nn = 1.5\n1\n");
    expect(
      fullOf(doc),
      `c1 — the plain form of b9, at the same registered row (§Fix (c)); actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${NARROWING_CODE}: ${registered(NARROWING_CODE)}`]);
  });

  it("c2 CONTROL: `let n: integer = 1.5` keeps integer-narrowing at the initialiser", () => {
    // The matched initialiser control for c1: same operand pair, one position
    // over, already reporting today. Without it c1's expectation could be
    // satisfied by a fix that reroutes the initialiser's narrowing instead of
    // adding the reassignment's.
    const doc = parse("let n: integer = 1.5\n1\n");
    expect(
      fullOf(doc),
      `c2 — the initialiser position is unchanged by this fix; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${NARROWING_CODE}: ${registered(NARROWING_CODE)}`]);
  });
});

// ===========================================================================
// (d) Composite, nominal (TYPE-10), alias-transparent (TYPE-11) and union
//     targets — the relation is the whole of `⊑`, not a primitive table.
// ===========================================================================

describe("bug 0115 (d) — composite, nominal, alias and union targets are judged by the same relation", () => {
  it("RED d1: `let mut xs: array<string> = []` / `xs = [1]` reports expected array<string>, got array<integer>", () => {
    // The composite row. The trailing `xs.join(",")` is deliberate: under bug
    // 0090's `#reassignment-binding-type` the receiver still resolves the
    // DECLARED `array<string>`, so the join precondition stays satisfied and the
    // list carries the reassignment row ALONE — the incompatible write is
    // reported where it happens, and no consequence row appears downstream.
    expectSoleMismatch(
      'let mut xs: array<string> = []\nxs = [1]\nxs.join(",")\n',
      "xs",
      "array<string>",
      "array<integer>",
      "d1 — TYPE-7 element recursion decides the composite pair, the same way the typed-`let` sink decides it",
    );
  });

  it("RED d2: `p = Q { x: 2 }` on a `P`-annotated binding reports expected P, got Q (TYPE-10)", () => {
    // TYPE-10 (type-system.md:52) makes `Q ⋢ P` by name identity regardless of
    // byte-identical field shape, and the rule's own text routes such a
    // mismatch to "that site's own diagnostic … see TYPE-9" — which is exactly
    // the site Route 1 adds to TYPE-9's list.
    expectSoleMismatch(
      "schema P { x: number }\nschema Q { x: number }\nlet mut p: P = P { x: 1 }\np = Q { x: 2 }\n1\n",
      "p",
      "P",
      "Q",
      "d2 — two distinct named object schemas are incompatible by name identity",
    );
  });

  it("RED d3: `schema S = string` / `let mut s: S = \"a\"` / `s = 1` reports expected string, got integer (TYPE-11)", () => {
    // TYPE-11 (type-system.md:54) — an alias schema is transparent in `⊑`, and
    // the `let` arm records the annotation in its unfolded form
    // (`unfoldAlias`), so the RENDERED `<expected>` is `string` rather than the
    // alias's own name. Pinned because it is the one cell where the message's
    // `<expected>` is not the annotation's source spelling.
    expectSoleMismatch(
      'schema S = string\nlet mut s: S = "a"\ns = 1\n1\n',
      "s",
      "string",
      "integer",
      "d3 — the alias unfolds before the comparison, so the message names the unfolded type",
    );
  });

  it("RED d4: `let mut u: string | integer = \"a\"` / `u = true` reports expected string | integer, got boolean", () => {
    // A union target: the write must satisfy some arm (TYPE-5/TYPE-6), and
    // `boolean` satisfies neither. Pinned to fix how a union renders in
    // `<expected>` — the arms joined with ` | `, the spelling the sibling sinks
    // already produce.
    expectSoleMismatch(
      'let mut u: string | integer = "a"\nu = true\n1\n',
      "u",
      "string | integer",
      "boolean",
      "d4 — a union target admits its arms and nothing else",
    );
  });
});

// ===========================================================================
// (e) The consequence rows — ADDITIONS at the offending statement, not
//     disappearances downstream. See the "WHERE THE BUG DOCUMENT IS WRONG"
//     note above: bug 0090's landed rule keeps the recorded type in place, so
//     every downstream verdict computed from it remains correct.
// ===========================================================================

describe("bug 0115 (e) — the new row is added at the offending statement and the downstream verdicts stand", () => {
  it("RED e1: `let mut n: number = 1` / `n = \"x\"` / `n.length()` reports BOTH the new row and unknown-method", () => {
    // The recorded type does not move (bindings.md
    // `#reassignment-binding-type`), so the receiver is still `number` and
    // `theta/parse/unknown-method` is still the right verdict for `.length()` on
    // it. What the fix adds is the row at the reassignment — pinned by position
    // below, so "both codes" cannot be satisfied by two diagnostics on the same
    // statement.
    const body = 'let mut n: number = 1\nn = "x"\nn.length()\n';
    const doc = parse(body);
    expect(
      fullOf(doc),
      `e1 — an ADDITION, in emission order: the reassignment row precedes the method row; actual diagnostics=${render(doc)}`,
    ).toEqual([
      `error ${CODE}: ${reassignMismatch("n", "number", "string")}`,
      `error ${UNKNOWN_METHOD_CODE}: ${unknownMethodMessage("length", "number")}`,
    ]);
    expect(
      doc.diagnostics[0]?.range?.start.line,
      `e1 — the new row is located on the reassignment statement, one line ABOVE the method call that reports today; actual diagnostics=${render(doc)}`,
    ).toBe(REASSIGN_LINE);
  });

  it("RED e2: `let mut s: string = \"a\"` / `s = 1` / `s.length()` reports the new row alone", () => {
    // The reverse of e1 and the sharper half: the recorded `string` admits
    // `.length()`, so at HEAD the whole program is accepted while the slot
    // holds `1`. Nothing downstream can report here — the new row is the only
    // diagnostic this program can ever carry.
    expectSoleMismatch(
      'let mut s: string = "a"\ns = 1\ns.length()\n',
      "s",
      "string",
      "integer",
      "e2 — the downstream method row is CORRECT for the recorded type, so only the write itself can be refused",
    );
  });

  it("RED e3: the laundering row `n = \"hi\"` then `let m: integer = n` reports the new row alone", () => {
    // The typed-`let` sink compares against the RECORDED `integer` (the
    // adjudicated read side), not against the `string` in the slot, so it is
    // silent and correct. The mistyped write is caught where it happens.
    const body = 'let mut n: integer = 1\nn = "hi"\nlet m: integer = n\n1\n';
    expectSoleMismatch(
      body,
      "n",
      "integer",
      "string",
      "e3 — the laundering route closes at the reassignment; the later typed `let` stays silent because the recorded type it reads is unchanged",
    );
    const doc = parse(body);
    expect(
      doc.diagnostics[0]?.range?.start.line,
      `e3 — located on the reassignment, not on the \`let m\` that launders it; actual diagnostics=${render(doc)}`,
    ).toBe(REASSIGN_LINE);
  });

  it("RED e4: a reassignment inside a `for` body reports — the shape every committed example uses", () => {
    // All seven committed reassignments sit inside a loop body
    // (docs/examples/), so a check that only ran at statement top level would
    // miss the reachable position entirely. The `for` body receives a COPY of
    // the binding map, and the target's record is in that copy, so the target
    // type is available there.
    expectSoleMismatch(
      'let mut n: integer = 0\nfor x in [1, 2] { n = "hi" }\n1\n',
      "n",
      "integer",
      "string",
      "e4 — a loop body is the reachable position, and the enclosing binding's recorded type reaches it",
    );
  });
});

// ===========================================================================
// (f) Targets that are not mutable `let` bindings. §Fix asks explicitly whether
//     an immutable target reports both codes; f1 is that answer.
// ===========================================================================

describe("bug 0115 (f) — an immutable target reports BOTH codes; a loop variable and an `fn` parameter report the type verdict alone", () => {
  it("RED f1: `let n: integer = 1` / `n = \"hi\"` reports immutable-rebinding AND the new row, in that order", () => {
    // The decided disposition (§Fix's "state whether an immutable target
    // reports both codes"): BOTH. The two rows are different phases — `parse`
    // for mutability, `type` for compatibility — and neither *Trigger* excludes
    // the other, so refusing one because the other fired would drop a true
    // verdict. The ordering is the statement-ranged parse row first, which is
    // the ordering the sibling co-firing sinks already exhibit
    // (tests/type-name-as-value-refusal.test.ts group (c)).
    const doc = parse('let n: integer = 1\nn = "hi"\n1\n');
    expect(
      fullOf(doc),
      `f1 — a non-\`mut\` target is BOTH un-writable and mistyped; actual diagnostics=${render(doc)}`,
    ).toEqual([
      `error ${IMMUTABLE_CODE}: ${immutableMessage("n")}`,
      `error ${CODE}: ${reassignMismatch("n", "integer", "string")}`,
    ]);
  });

  it("RED f2: `for x in [1, 2] { x = \"b\" }` reports immutable-rebinding AND the new row", () => {
    // A loop variable is an always-immutable context (bindings.md §"Immutable
    // contexts"). At 0115's HEAD the mutability refusal was NOT wired for a
    // `for`-variable write, so this cell drew the TYPE verdict alone and 0115
    // §Residuals 3 recorded the missing mutability row as bug 0126's PIN e2
    // observation. Bug 0370 (§Fix layer 1) wires that refusal, so the write now
    // draws BOTH codes in the f1 order — the statement-ranged
    // `immutable-rebinding` (parse) first, then the compatibility verdict
    // (type). The target's type is the iterand's proven element `integer`, so
    // the `string` RHS is `⋢` it: 0115's own verdict is PRESERVED, and 0370
    // adds the row 0115 flagged as then-missing.
    const doc = parse('for x in [1, 2] { x = "b" }\n1\n');
    expect(
      fullOf(doc),
      `f2 — a loop variable is both immutable and mistyped here; actual diagnostics=${render(doc)}`,
    ).toEqual([
      `error ${IMMUTABLE_CODE}: ${immutableMessage("x")}`,
      `error ${CODE}: ${reassignMismatch("x", "integer", "string")}`,
    ]);
  });

  it("RED f3: `fn g(s: integer) { s = \"a\" … }` reports immutable-rebinding AND the new row", () => {
    // The same disposition at the `fn`-parameter class: an annotated parameter
    // is recorded by `walkFn`, so the compatibility verdict is judgeable, and
    // bug 0370 (§Fix layer 1) wires the mutability refusal for a parameter
    // write. Both codes, f1 order. 0115's verdict is PRESERVED; 0370 adds the
    // mutability row 0115 §Residuals 3 recorded as the parameter's then-missing
    // refusal. This cell is still g4's EMITTING twin — the two now SHARE
    // `immutable-rebinding` and differ only in the compatibility verdict: f3's
    // annotated parameter is judged where g4's unannotated one is withheld.
    const doc = parse('fn g(s: integer) { s = "a"\ns }\ng(1)\n');
    expect(
      fullOf(doc),
      `f3 — a declared parameter is both immutable and mistyped here; actual diagnostics=${render(doc)}`,
    ).toEqual([
      `error ${IMMUTABLE_CODE}: ${immutableMessage("s")}`,
      `error ${CODE}: ${reassignMismatch("s", "integer", "string")}`,
    ]);
  });
});

// ===========================================================================
// (g) The DEFERRALS — §Fix (f)'s controls, green at HEAD and required green
//     after. These are what keeps the shipped corpus admitted. Each names the
//     gate whose removal reds it (see the ledger's red-provability block).
// ===========================================================================

describe("bug 0115 (g) — compatible and statically unresolvable writes stay silent", () => {
  it("g1: a COMPATIBLE write (`integer` into a `number` binding) stays silent — the TYPE-2 widening arm", () => {
    // The `"compatible"` arm. This is also bug 0083's pinned shape without its
    // laundering tail (tests/let-annotation-recorded-binding-type.test.ts),
    // so a check that reported here would red that file too.
    expectCodes(
      "let mut n: number = 1\nn = 2\n1\n",
      [],
      "g1 — `integer ⊑ number` is one-way but this is the admitted direction",
    );
  });

  it("g2: the accumulator shape `let mut r = \"\"` / `r = r + \"x\"` stays silent", () => {
    // The `fan-out-reviews.theta` accumulator, reduced. The RHS is a `+` over
    // the binding itself: judged, compatible, silent. A check that mis-resolved
    // the RHS type would refuse a shipped example here.
    expectCodes(
      'let mut r = ""\nr = r + "x"\nr\n',
      [],
      "g2 — a self-referencing string concatenation is compatible with the inferred `string`",
    );
  });

  it("g3: the query-inferred example shape `let mut d = @`hi`?` / `d = @`ho`?` stays silent — the unresolvable-operand deferral", () => {
    // The load-bearing deferral (§Fix (f) and §Non-goals): `refine.theta:17`
    // and `refine-inline.theta:34` reassign a binding whose type is inferred
    // from a `?`-unwrapped query. Neither operand is statically resolvable, so
    // `checkCompatible` answers `"unknown"` and the site defers to the runtime
    // AJV net. A check that reported on an unresolvable operand would refuse a
    // committed example and red tests/committed-fixture-parse-gate.test.ts.
    expectCodes(
      "let mut d = @`hi`?\nd = @`ho`?\nd\n",
      [],
      "g3 — an unresolvable target and an unresolvable RHS both defer",
    );
  });

  it("g4: a top-level WITHHELD-binder TARGET — the compatibility verdict defers; bug 0370 adds the mutability refusal", () => {
    // An UNANNOTATED `fn` parameter is recorded WITHHELD by the walk
    // (`recordWithheldBinders`), a sentinel-named entry no `.theta` text can
    // declare, read through `containsWithheldBinderType`
    // (src/parser/type-layer-checks.ts:445). A withheld entry is a SPELLING and
    // not a proven type, so judging a write against it would manufacture a
    // verdict the position never supported. 0115's own subject is PRESERVED:
    // the COMPATIBILITY verdict still defers, so NO `reassign-rhs-type-mismatch`
    // fires here, and this cell still does NOT pin the type-side gate — the
    // sentinel is an unresolvable NAMED at top level, so `checkCompatible`
    // answers `"unknown"` and the emitter's own `"unknown"` arm defers even with
    // the target-side conjunct deleted (g7 is the target-side pin). Bug 0370
    // (§Fix layer 1) independently wires the mutability refusal for a parameter
    // write, so this draws `immutable-rebinding` ALONE — the parse-phase row
    // its EMITTING twin f3 also carries, differing only in that f3's annotated
    // parameter adds the compatibility row on top.
    expectCodes(
      'fn h(x) { x = "hi"\n1 }\nh(1)\n',
      [IMMUTABLE_CODE],
      "g4 — the parameter write is refused as immutable (0370); the compatibility verdict stays withheld because the binder's recorded type is (0115)",
    );
  });

  it("g5: a top-level WITHHELD-binder RHS defers — doubly guarded, so not a gate pin", () => {
    // The RHS-side mirror of g4, and doubly guarded for the same reason: the
    // target is a judged `integer`, the RHS is a top-level withheld read, and
    // `integer` against an unresolvable named answers `"unknown"`, so the
    // emitter defers on its own even with the RHS-side conjunct deleted —
    // measured green under that removal. g6 is the RHS-side pin. Its emitting
    // twin is a1, which differs only in that the RHS is a `string` literal
    // instead of a withheld read.
    expectCodes(
      "fn h(x) { let mut n: integer = 1\nn = x\nn }\nh(1)\n",
      [],
      "g5 — a withheld RHS is not a proven type, so the write defers",
    );
  });

  it("g6: a withheld binder inside a COMPOSITE RHS defers — the RHS-side gate pin", () => {
    // Where the RHS-side gate is load-bearing. The RHS `[x]` types as
    // `array<<the withheld sentinel>>` and the target is a resolvable `string`,
    // so `decide` (src/parser/type-compat.ts) settles the kind mismatch under
    // TYPE-7 WITHOUT resolving the element: the verdict is `"incompatible"`,
    // not `"unknown"`, and the emitter's deferral arm never runs. Removing the
    // RHS-side `containsWithheldBinderType(rhsType)` conjunct therefore emits
    // here — and renders the private sentinel spelling into a normative
    // Message, which is exactly what the VALUE channel exists to prevent
    // (`recordWithheldBinders`). Measured red under that removal and green
    // under the target-side one.
    expectCodes(
      'fn h(x) { let mut n: string = "a"\nn = [x]\nn }\nh(1)\n',
      [],
      "g6 — a composite over a withheld binder is not a proven type, so the write defers",
    );
  });

  it("g6t: g6's EMITTING twin — an ANNOTATED binder makes the same composite judgeable", () => {
    // Identical to g6 but for the parameter's annotation, so the RHS types as
    // `array<integer>` and the same kind mismatch is now a proven verdict. This
    // is what keeps g6 from being satisfiable by a check that never reaches the
    // shape: the fixture differs only in whether the read is withheld.
    expectSoleMismatch(
      'fn h(x: integer) { let mut n: string = "a"\nn = [x]\nn }\nh(1)\n',
      "n",
      "string",
      "array<integer>",
      "g6t — with the binder judged, the composite RHS is `⋢ string` and reports",
    );
  });

  it("g7: a TARGET recorded as a composite over a withheld binder defers — the target-side gate pin", () => {
    // The target-side twin of g6. `let mut n = [x]` records the initialiser's
    // inferred `array<<the withheld sentinel>>` for the binding's whole scope
    // (bug 0090's `#reassignment-binding-type`), and the RHS `"a"` is a
    // resolvable `string`, so the kind mismatch is again decided before the
    // element is resolved. Removing the target-side
    // `containsWithheldBinderType(declared)` conjunct emits here. Measured red
    // under that removal and green under the RHS-side one.
    expectCodes(
      'fn h(x) { let mut n = [x]\nn = "a"\nn }\nh(1)\n',
      [],
      "g7 — a target recorded as a composite over a withheld binder carries no proven type to judge against",
    );
  });

  it("g7t: g7's EMITTING twin — an ANNOTATED binder makes the same composite target judgeable", () => {
    // Identical to g7 but for the parameter's annotation: the target records a
    // proven `array<integer>`, so the `string` write is a verdict rather than a
    // deferral, and g7 cannot be satisfied by a check that never runs here.
    expectSoleMismatch(
      'fn h(x: integer) { let mut n = [x]\nn = "a"\nn }\nh(1)\n',
      "n",
      "array<integer>",
      "string",
      "g7t — with the binder judged, the target's recorded `array<integer>` refuses a `string` write",
    );
  });
});

// ===========================================================================
// (h) Bug 0079's adjudicated disposition, unmoved in BOTH directions. The
//     interaction is a reason this gap matters, not a defect of 0079, and this
//     fix does not reopen it (§Non-goals).
// ===========================================================================

describe("bug 0115 (h) — bug 0079's static interpolation gate is unchanged in both directions", () => {
  it("h1: `let mut r = Ok(1)` / `r = 5` / interpolation keeps interpolated-result ALONE", () => {
    // The adjudicated row: the recorded type is the `Result` the registered
    // *Trigger* names, so the interpolation is refused. The reassignment itself
    // draws nothing new — `5` against a `Result`-recorded target is
    // `"unknown"`, not incompatible — so this list must not gain the minted
    // row.
    const doc = parse("let mut r = Ok(1)\nr = 5\n@`x${r}`\n");
    expect(
      fullOf(doc),
      `h1 — 0079's disposition stands; the minted row must not double up on it; actual diagnostics=${render(doc)}`,
    ).toEqual([
      `error ${INTERPOLATED_RESULT_CODE}: ${registered(INTERPOLATED_RESULT_CODE)}`,
    ]);
  });

  it("h2: the mirror `let mut n: integer = 1` / `n = Ok(1)` / interpolation stays silent", () => {
    // The other direction: an `Ok(…)` types as an unresolvable named form, so
    // both the interpolation gate and this fix's sink defer, and the rejection
    // stays with bug 0079's runtime fallback. Pinned so that a widened
    // `Result`-arm handling cannot land here silently.
    expectCodes(
      "let mut n: integer = 1\nn = Ok(1)\n@`x${n}`\n",
      [],
      "h2 — a `result-ctor` RHS is statically unresolvable, so the sink defers",
    );
  });
});

// ===========================================================================
// (i) The minted registry row (DIAG-2 / DIAG-4). RED until the fix commit adds
//     it — by design: the code and its *Message* are a spec change landing in
//     lock-step with the implementation (diagnostic-shape.md:72), admissible in
//     a theta 1.x minor under the GOV-15 diagnostic-registry carve-out
//     (source-language-stability.md:25) because its only effect is that
//     previously clean-loading inputs gain the emission. This group is what
//     keeps EXPECTED_TEMPLATE from silently drifting from the registry.
// ===========================================================================

describe("bug 0115 (i) — the minted registry row", () => {
  it("RED REG: code-registry-parse.md carries the reassign-rhs-type-mismatch row, Sev E, phase type, with the pinned Message template", () => {
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `THE 0115 FIX COMMIT MUST ADD THIS ROW — docs/spec_topics/diagnostics/code-registry-parse.md has no row for ${CODE} at HEAD, and that registry gap is why the report was filed before any code (DIAG-2, diagnostic-shape.md:72). Expected RED until the fix lands`,
    ).toBeDefined();
    expect(
      row!.severity,
      "Route 1: Sev E — the write contradicts the binding's declared or inferred type, so the theta must not load, matching every sibling `⊑` sink",
    ).toBe("E");
    expect(
      row!.phase,
      "the emission is from the type phase's reassign arm, the same phase as the initialiser row it parallels",
    ).toBe("type");
    expect(
      row!.trigger,
      `the *Trigger* names the reassignment RHS against the binding's declared-or-inferred type; actual trigger=${JSON.stringify(row!.trigger)}`,
    ).toMatch(/reassign/i);
    expect(
      row!.trigger,
      `the *Trigger* carries the resolvability qualifier the sibling rows carry, which is what licenses group (g)'s deferrals; actual trigger=${JSON.stringify(row!.trigger)}`,
    ).toMatch(/statically resolvable/i);
    expect(
      row!.message,
      "DIAG-4: the *Message* column is normative and this file interpolates it — `<name>` (placeholder-rendering-b.md:10, category 5) and `<expected>` / `<actual>` (placeholder-rendering-a.md:11, category 1) are already in the closed placeholder surface, so the row states no new rendering vector",
    ).toBe(EXPECTED_TEMPLATE);
  });

  it("the interpolated messages this file asserts render as the route decision states them", () => {
    // A pure-rendering check over the pinned template: it can never red for a
    // parser reason, so a red in the emitting groups is never confounded with a
    // mis-spelled expectation here.
    expect(reassignMismatch("n", "integer", "string")).toBe(
      "reassignment of 'n' type mismatch: expected integer, got string",
    );
    expect(reassignMismatch("xs", "array<string>", "array<integer>")).toBe(
      "reassignment of 'xs' type mismatch: expected array<string>, got array<integer>",
    );
    expect(reassignMismatch("p", "P", "Q")).toBe(
      "reassignment of 'p' type mismatch: expected P, got Q",
    );
    expect(reassignMismatch("u", "string | integer", "boolean")).toBe(
      "reassignment of 'u' type mismatch: expected string | integer, got boolean",
    );
  });
});
