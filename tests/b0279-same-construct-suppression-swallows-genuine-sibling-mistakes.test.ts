import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0279 — `theta/parse/unresolved-named-type`'s same-construct cover is
// decided by RANGE alone, so a coverer ranged over a whole declaration, or over
// a whole nested declaration, silences a SIBLING head the author wrote
// (docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md).
//
// THE SEAM (line numbers re-derived after this file's own fix — the
// provenance-mark change-set widens `src/parser/theta-document.ts` and shifts
// everything below `UNRESOLVED_NAMED_TYPE_CODE`). `captureWindowAlreadyRefused`
// (`src/parser/theta-document.ts` line 7630) decided clause (iv)(3)'s withhold
// on range geometry ALONE before this fix: its `own` branch counted a coverer
// when two range tests both held — `overlaps(d)`, the coverer's range meets the
// capture's absorption window, and `containedInConstruct(d)`, the coverer's
// range sits inside the construct whose capture is judged — with one exclusion,
// a row this same walk drew under `UNRESOLVED_NAMED_TYPE_CODE` (line 6522).
// Nothing in the predicate's own inputs distinguishes text the author SPELLED
// at the position from text the capture ABSORBED past a syntax fault; that
// distinction is what the fix threads onto the capture itself and gates every
// call site on.
//
// Two coverers reach that shape with a range wide enough to contain a sibling's
// written head. `annotationTypeNotExpressionDiagnostic` (line 6630) is minted
// with the enclosing statement's range at all three of its call sites (line
// 8193, the `let` arm; line 8323, the `fn` parameter loop; line 8377, the `fn`
// return slot), and the registry states that width normatively
// (docs/spec_topics/diagnostics/code-registry-parse.md line 107, "Every
// diagnostic carries the declaration's range"). `theta/parse/nested-fn`
// (registry line 93) is ranged over the inner declaration, which IS the
// construct whose parameter capture is judged. The windows the predicate is
// asked about do not narrow either coverer away: `captureAbsorptionWindow`
// (line 7663) and `fnHeaderWindow` (line 7678) give one `fn` header ONE window
// shared by every parameter capture and by the return capture, consulted at the
// four widened call sites — the `let` annotation (line 8220), the `fn`
// parameter type (line 8346), the `fn` return type (line 8395) and the
// `invoke<T>` ascription (line 8823) — each now additionally gated on the
// capture's own provenance mark (`annotationAbsorbed`, `typeAbsorbed`,
// `returnTypeAbsorbed`, `returnSchemaAbsorbed`). The registry's count rule
// (code-registry-parse.md line 112, "One written mistake draws one diagnostic
// naming it, and two written mistakes draw two") now holds without the
// same-construct carve-out this fix removes.
//
// WHAT IS RED BEFORE THE CHANGE-SET, AND FOR WHAT. Two cells assert a written
// sibling head the parser leaves unnamed, so each red reads as a missing
// `theta/parse/unresolved-named-type` naming `Gone`:
//
//   (a1) `fn f(p: integer--, q: Gone): number { 1 }` — expected
//   [annotation-type-not-expression @6:1-6:42, unresolved-named-type
//   @6:1-6:42], observed the annotation refusal alone. `q: Gone` sits at
//   columns 20-27 of a coverer spanning 6:1-6:42.
//
//   (a2) `fn f(): integer-- { fn g(z: Gone): number { 2 }  1 }` — expected
//   [annotation-type-not-expression @6:1-9:2, nested-fn @7:3-7:30,
//   unresolved-named-type @7:3-7:30], observed the first two alone. The coverer
//   for `z: Gone` is `nested-fn`, ranged over the inner declaration — the
//   fault's own true extent, which contains the sibling head legitimately, so
//   no narrowing of any minted range separates this cell's written head from
//   debris.
//
// Every other cell here is GREEN before the change-set and stays green: groups
// (C), (B), (D) and (E) below. Cells d1 and d2 locate the inconsistency — the
// count rule already holds inside ONE construct when the second mistake is a
// head this row itself names, because this row's own code is filtered out of
// `own` (line 6522), and fails only when the coverer carries any other code.
// Cell d1 is a1 with the junk annotation removed, and it names `Gone`.
//
// THE SETTLED TARGET BEHAVIOUR THIS FILE ENCODES (the bug document's §Fix route
// (2b), provenance-marked captures). Each of the four widened captures records,
// at capture time, whether it did NOT end at its own grammatical terminator —
// `=` for a `let` annotation, `,` or `)` for a parameter type, the body `{` or
// a `with` clause for a return type, the annotation's own `>` for an
// `invoke<T>` ascription — a test with two shapes
// (docs/spec_topics/diagnostics/code-registry-parse.md:112, the
// `theta/parse/unresolved-named-type` Trigger). The capture either ran PAST
// the terminator and absorbed the following construct's text (`fn h(a: string`
// / `let x = 1` -> the capture `stringletx`; `fn f(): number 1` -> `number1`),
// or it stopped EARLY at a token its own position does not derive, having
// absorbed nothing (`fn f(a: Gone = 1): number { 1 }`'s parameter capture
// holds exactly `Gone`, still marked, still silent beside
// `theta/parse/fn-param-not-identifier`). Clause (iv)(3)'s withhold then
// applies ONLY to a capture carrying the mark, in either shape — the predicate
// cannot be tightened to the ran-past shape alone, because cell c1's genuine
// debris capture also halts at an `=` (`src/parser/theta-document.ts`, the
// reworded `LetStmt.annotationAbsorbed` / `FnParam.typeAbsorbed` /
// `FnDecl.returnTypeAbsorbed` comments). A capture that ended at its own
// terminator holds text the author spelled there, so its unresolvable heads
// draw their own `theta/parse/unresolved-named-type` line whatever else in the
// construct is already refused. The suppressed class stays what clause (iv)(3)
// names — capture debris from another syntax error — and the trigger that
// selects it stops reading geometry.
//
// WHAT STAYS PUT, AND WHY EACH GROUP IS HERE.
//
//   (C) — the TRUE-DEBRIS FENCE, the hard constraint on the change-set. In
//   `fn h(a: string` followed by `let x = 1` the parameter capture ran past no
//   `,` and no `)`, so it absorbed the spelling `stringletx`; in
//   `fn f(): number 1` the return capture reached no body `{`, so it absorbed
//   `number1`. Both are marked, both stay silent, and both cells stay
//   BYTE-IDENTICAL. A change-set that reds either one re-founds clause (iv)(3)
//   rather than refining it.
//
//   (B) — the cross-construct controls bug 0272 landed. A `let` statement's
//   refusal is ranged over that statement alone and never covered the next
//   statement (b1); an ENCLOSING declaration's refusal is not contained in the
//   nested `let`'s construct and is no cover for it (b2).
//
//   (D) — the clean-`fn` baselines the rule restores. d1 is a1 minus the junk
//   annotation and names `Gone`; d2 writes two heads in one construct and draws
//   two refusals, each carrying the whole declaration's range.
//
//   (E) — the one-annotation fences at the `let` position and the return slot.
//   One written annotation draws ONE diagnostic, and the absorbed `Gone--`
//   trailer earns no second row on either reading.
//
// THE DIAGNOSTIC SET READ. Every cell asserts the UNFILTERED `doc.diagnostics`.
// At this HEAD every row every cell draws carries a `theta/parse/…` code, so a
// filter to that prefix would remove nothing and the unfiltered list is the
// stricter read: it also fences a change-set that reaches a diagnostic outside
// the parse registry.
//
// Every cell carries an error-severity row and therefore registers on NEITHER
// reading. That is asserted as a CONSTANT across the change-set, not as
// something that moves: the composition root denies registration on the first
// error-severity `theta/load/*` or `theta/parse/*` row, and both readings of
// every cell have one.
//
// RANGES ARE PART OF EVERY EXPECTATION. The defect is a range judgement applied
// to text that ranges cannot classify, so every cell asserts the start AND end
// position of every diagnostic it draws. A cell reading codes alone could not
// tell a1's declaration-wide coverer from d2's two per-head refusals, which
// carry the same extent for a different reason.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (`tests/helpers/e2e-s1.ts` — the shipped whole-file entry point wrapped in
// inert offline deps, no behaviour stubbed). An integration tier would add a
// round trip to a value already fixed at the parse boundary and observe nothing
// sharper. A live tier cannot witness this bug even in principle: a parse-time
// diagnostic list is not a live observable, and the only live-visible
// consequence — registration — is identical on both readings of all ten cells.
//
// NO SILENT SKIPPING. Nothing here early-returns, branches on the environment
// or skips. `msg` asserts its registry row is present and carries each
// placeholder it fills before substituting, and every cell asserts its fixture
// parsed to the body-statement count it spells and captured exactly the
// declarations it names BEFORE any disposition is read off it — a fixture the
// parser dropped upstream shortens the diagnostic list, which is
// indistinguishable from the suppression under test.
//
// ANTI-VACUITY. Every cell asserts an ORDERED WHOLE-LIST equality — never
// containment — so neither an extra diagnostic nor one at the wrong position
// can hide. `Gone`, `Nope` and `AlsoNope` are declared and imported in no
// fixture here.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PATH}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/** The row a written sibling head draws under the provenance mark; its *Message* does not move. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
/** Coverer 1 — minted with the whole declaration's range. */
const ANNOTATION = "theta/parse/annotation-type-not-expression";
/** Coverer 2 — ranged over the inner declaration, group (A) cell a2. */
const NESTED_FN = "theta/parse/nested-fn";
/** Group (C): the real fault behind the absorbed `stringletx` and `number1`. */
const SINGLE_LINE_IF = "theta/parse/single-line-if";
/** Group (C) cell c1: the second row naming that fault. */
const PARAM_LIST_UNCLOSED = "theta/parse/fn-param-list-unclosed";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so a
 * row whose *Message* moved reds by naming the registry page rather than by a
 * bare `undefined` comparison downstream. No message prose is written out in
 * this file.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PATH} must carry the Message row for ${code}`,
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

/** One rendered diagnostic line, `<severity> <code>: <message>`. */
function line(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  return `error ${code}: ${msg(code, fills)}`;
}

/** The written head's refusal, rendered for the head `name`. */
function unresolvedLine(name: string): string {
  return line(UNRESOLVED, [["<name>", name]]);
}

/** The declaration-wide coverer, rendered for the binder `name` it names. */
function annotationLine(name: string): string {
  return line(ANNOTATION, [["<name>", name]]);
}

// ===========================================================================
// The load harness.
// ===========================================================================

/** One parsed row: its codes, its rendered lines, and the declarations it captured. */
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}

/** The frontmatter every fixture carries, per the bug document's §Reproduction. */
const FRONTMATTER = "---\ndescription: d\nmode: prompt\n---\n\n";

/** A `mode: prompt` theta whose body is `body` verbatim, parsed once. */
function theta(label: string, body: string): LoadRow {
  const doc = parseDoc(`${FRONTMATTER}${body}\n`, "b0279.theta");
  return {
    label,
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    lines: doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    declared: doc.body.statements
      .filter((s) => s.kind === "schema" || s.kind === "enum")
      .map((s) => (s as { name: string }).name),
    statements: doc.body.statements.length,
    doc,
  };
}

/**
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered. Every diagnostic below is a `theta/parse/…` code, so the
 * code-prefix half of the real predicate always holds here.
 */
function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

/**
 * The 1-indexed `startLine:startColumn-endLine:endColumn` extent of each
 * diagnostic in a row. The END position is read as well as the start because
 * the coverers this bug is about are told apart by width alone: a
 * declaration-wide refusal and a nested-declaration one share a start with the
 * capture they silence.
 */
function extents(row: LoadRow): string[] {
  return row.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined
      ? "unlocated"
      : `${d.range.start.line}:${d.range.start.column}-${d.range.end.line}:${d.range.end.column}`,
  );
}

/**
 * Assert every row parsed to the number of body statements it spells and
 * captured exactly the declarations it names, before any disposition is read off
 * it. A dropped statement shortens the diagnostic list, which is
 * indistinguishable from a suppression unless the capture is asserted
 * separately — this is the precondition, failing loudly.
 */
function expectCaptured(
  rows: readonly LoadRow[],
  statements: number,
  names: readonly string[],
): void {
  expect(
    rows.map((r) => [r.label, r.statements]),
    `precondition: every fixture must parse to ${statements} body statement(s); a row listed here lost part of its body upstream of the type walk, so its diagnostic list says nothing about this bug`,
  ).toEqual(rows.map((r) => [r.label, statements]));
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}; \`Gone\`, \`Nope\` and \`AlsoNope\` are declared in no fixture, so each head is unresolvable by construction`,
  ).toEqual([]);
}

/**
 * Assert the ordered code list, THEN the ordered rendered-message list, THEN the
 * ordered extents, THEN registration. The message side is a thunk so the
 * registry read happens only after the code assertion has passed: a missing
 * emission must red as a missing diagnostic, not as a registry lookup.
 */
function expectRows(
  rows: readonly LoadRow[],
  expected: readonly (readonly string[])[],
  expectedLines: () => readonly (readonly string[])[],
  expectedExtents: readonly (readonly string[])[],
): void {
  expect(rows.map((r) => [r.label, r.codes])).toEqual(rows.map((r, i) => [r.label, expected[i]]));
  const wanted = expectedLines();
  expect(rows.map((r) => [r.label, r.lines])).toEqual(rows.map((r, i) => [r.label, wanted[i]]));
  expect(
    rows.map((r) => [r.label, extents(r)]),
    "a coverer's extent against the construct whose capture it silences is the whole subject, so every extent is pinned",
  ).toEqual(rows.map((r, i) => [r.label, expectedExtents[i]]));
  expect(
    rows.map((r) => [r.label, registered(r)]),
    "every fixture carries an error-severity refusal on both readings, so registration is a constant across this change-set and never a moving observable",
  ).toEqual(rows.map((r) => [r.label, false]));
}

// ===========================================================================
// (A) The subject — a written SIBLING head inside an already-refused construct.
// ===========================================================================

describe("b0279 (A) — a coverer's range is no verdict on a sibling head the author wrote", () => {
  it("b0279-a1: a junk parameter annotation and an undeclared sibling head draw one diagnostic each", () => {
    // The bug document's §Reproduction cell a1. `p`'s refusal is minted with
    // the whole declaration's range (`annotationTypeNotExpressionDiagnostic`,
    // `src/parser/theta-document.ts` line 6630, minted at line 8323), so at the
    // `fn` parameter call site (line 8346) it both overlaps
    // `fnHeaderWindow(s)` — the window every parameter of one header shares
    // (line 7678) — and is contained in `s.range`. Before this fix
    // `captureWindowAlreadyRefused` (line 7630) would have withheld `q`'s
    // refusal on that geometry alone; the fix gates the withhold on `q`'s own
    // `typeAbsorbed` mark instead.
    //
    // `q`'s capture stopped at its own `)`, so it absorbed nothing: `Gone` is a
    // name the author typed, and under the provenance mark it draws its own
    // line. Two written mistakes, two diagnostics — both carrying the
    // declaration's range, since neither the annotation nor the head has a
    // range of its own to carry.
    const subject = theta(
      "a1 — `fn f(p: integer--, q: Gone): number { 1 }`",
      "fn f(p: integer--, q: Gone): number { 1 }\n1",
    );
    expectCaptured([subject], 1, []);
    expectRows(
      [subject],
      [[ANNOTATION, UNRESOLVED]],
      () => [[annotationLine("p"), unresolvedLine("Gone")]],
      [["6:1-6:42", "6:1-6:42"]],
    );
  });

  it("b0279-a2: a nested `fn`'s own refusal is no verdict on that `fn`'s parameter head", () => {
    // The bug document's §Reproduction cell a2. The coverer here is
    // `theta/parse/nested-fn` (registry
    // docs/spec_topics/diagnostics/code-registry-parse.md line 93), ranged over
    // the inner declaration — which IS the construct whose parameter capture is
    // judged, so `containedInConstruct` holds by construction and no narrowing
    // of any minted range reaches this cell. The enclosing `fn`'s refusal is
    // already out of the way: bug 0272 narrowed `own` so a coverer spanning an
    // enclosing declaration is no cover, and it is group (B) cell b2 that pins
    // that.
    //
    // `z`'s capture stopped at its own `)`. Under the provenance mark the
    // parameter head draws its own refusal beside the two rows naming the two
    // OTHER mistakes — the junk return annotation and the nested declaration —
    // at the inner declaration's extent, which is the range the head's own
    // construct carries.
    const nested = theta(
      "a2 — `fn f(): integer--` over a body declaring `fn g(z: Gone)`",
      "fn f(): integer-- {\n  fn g(z: Gone): number { 2 }\n  1\n}\n1",
    );
    expectCaptured([nested], 1, []);
    expectRows(
      [nested],
      [[ANNOTATION, NESTED_FN, UNRESOLVED]],
      () => [[annotationLine("f"), line(NESTED_FN), unresolvedLine("Gone")]],
      [["6:1-9:2", "7:3-7:30", "7:3-7:30"]],
    );
  });
});

// ===========================================================================
// (C) The true-debris fence — the class clause (iv)(3) exists to suppress.
// ===========================================================================

describe("b0279 (C) — an absorbed spelling stays silent", () => {
  it("b0279-c1: an unclosed parameter list keeps its own rows and never names `stringletx`", () => {
    // Bug 0262's artefact-suppression witness group D6, restated here as this
    // change-set's hard constraint. The parameter capture reached neither a `,`
    // nor its `)`, so it ran past the fault and swallowed the next line: the
    // spelling `stringletx` is text the parser assembled, not text the author
    // wrote at a type position, and it draws nothing.
    //
    // Under the provenance mark that capture is marked ABSORBING, so clause
    // (iv)(3) still withholds — and it withholds without consulting the
    // coverers' geometry, which is what group (A) needed removed from the
    // decision. This cell is byte-identical on both readings.
    const debris = theta("c1 — `fn h(a: string` then `let x = 1`", 'fn h(a: string\nlet x = 1\n"ok"');
    expectCaptured([debris], 1, []);
    expectRows(
      [debris],
      [[SINGLE_LINE_IF, PARAM_LIST_UNCLOSED]],
      () => [[line(SINGLE_LINE_IF), line(PARAM_LIST_UNCLOSED)]],
      [["6:1-6:3", "6:5-6:6"]],
    );
  });

  it("b0279-c2: an unbraced `fn` body keeps its one row and never names `number1`", () => {
    // The same fence at the RETURN slot. The return capture reached no body `{`
    // and no `with` clause, so it ran past the fault and joined the `1` that
    // followed: `number1` is `Ident`-shaped and resolves against no
    // declaration, and it stays silent because the capture is marked absorbing.
    //
    // A route that decided this cell on the coverer's extent instead would red
    // here — `single-line-if` is ranged at 6:1-6:3, ahead of the absorbed text
    // — which is why the mark, and not a narrowed range, carries the withhold.
    const debris = theta("c2 — `fn f(): number 1`", 'fn f(): number 1\n"ok"');
    expectCaptured([debris], 1, []);
    expectRows(
      [debris],
      [[SINGLE_LINE_IF]],
      () => [[line(SINGLE_LINE_IF)]],
      [["6:1-6:3"]],
    );
  });
});

// ===========================================================================
// (B) Cross-construct controls — bug 0272's landed behaviour, unmoved.
// ===========================================================================

describe("b0279 (B) — a coverer that never reached the head's construct stays no cover", () => {
  it("b0279-b1: two sibling statements each keep their own diagnostic", () => {
    // A `let` statement's refusal is ranged over that statement alone, so it
    // never overlapped the next statement's capture window. This is the reading
    // group (A) cell a1 should already have had one construct down, and it is
    // the tripwire against a change-set that moved a shape already correct.
    const siblings = theta(
      "b1 — `let q: integer--` then `let y: Gone`",
      "let q: integer-- = 1\nlet y: Gone = 1\n1",
    );
    expectCaptured([siblings], 2, []);
    expectRows(
      [siblings],
      [[ANNOTATION, UNRESOLVED]],
      () => [[annotationLine("q"), unresolvedLine("Gone")]],
      [["6:1-6:21", "7:1-7:16"]],
    );
  });

  it("b0279-b2: an enclosing declaration's refusal is no cover for a nested `let` head", () => {
    // Bug 0272's subject, fixed and locked: the enclosing `fn`'s refusal spans
    // 6:1-9:2, which is not contained in the `let` construct whose capture is
    // judged, so `containedInConstruct` fails and the nested head is named. The
    // provenance mark is orthogonal to that narrowing — the `let` annotation's
    // capture stopped at its own `=` — so both rows stand on either reading.
    const enclosing = theta(
      "b2 — `fn f(): integer--` over a body declaring `let y: Gone`",
      "fn f(): integer-- {\n  let y: Gone = 1\n  1\n}\n1",
    );
    expectCaptured([enclosing], 1, []);
    expectRows(
      [enclosing],
      [[ANNOTATION, UNRESOLVED]],
      () => [[annotationLine("f"), unresolvedLine("Gone")]],
      [["6:1-9:2", "7:3-7:18"]],
    );
  });
});

// ===========================================================================
// (D) The clean-`fn` baselines the rule restores.
// ===========================================================================

describe("b0279 (D) — a written head in an `fn` parameter list is named", () => {
  it("b0279-d1: the same parameter list without the junk annotation names `Gone`", () => {
    // Cell a1 minus two characters. The parameter list, the head and the
    // capture are identical to a1's; the only delta is `p`'s annotation, and
    // that delta is what removes a1's diagnostic. That identity is what makes
    // a1's red attributable to the coverer rather than to anything about the
    // parameter capture itself.
    const baseline = theta("d1 — `fn f(q: Gone): number { 1 }`", "fn f(q: Gone): number { 1 }\n1");
    expectCaptured([baseline], 1, []);
    expectRows(
      [baseline],
      [[UNRESOLVED]],
      () => [[unresolvedLine("Gone")]],
      [["6:1-6:28"]],
    );
  });

  it("b0279-d2: two written heads in ONE construct already draw two refusals", () => {
    // The count rule holds inside one construct whenever both mistakes are
    // heads, because this row's own code is filtered out of the `own` argument
    // (`UNRESOLVED_NAMED_TYPE_CODE`, `src/parser/theta-document.ts` line 6522)
    // — each refusal carries the whole declaration's range and so covers the
    // construct in which the other head is judged, and neither silences the
    // other. Before this fix the inconsistency group (A) reported was exactly
    // that this held when the coverer carried THIS code and failed when it
    // carried any other; after the fix it holds for every coverer, since the
    // withhold is gated on the capture's own provenance mark rather than on
    // the coverer's code or range.
    const twoHeads = theta(
      "d2 — `fn f(p: Nope, q: AlsoNope): number { 1 }`",
      "fn f(p: Nope, q: AlsoNope): number { 1 }\n1",
    );
    expectCaptured([twoHeads], 1, []);
    expectRows(
      [twoHeads],
      [[UNRESOLVED, UNRESOLVED]],
      () => [[unresolvedLine("Nope"), unresolvedLine("AlsoNope")]],
      [["6:1-6:41", "6:1-6:41"]],
    );
  });
});

// ===========================================================================
// (E) One written annotation, one diagnostic.
// ===========================================================================

describe("b0279 (E) — one annotation carrying one mistake keeps ONE diagnostic", () => {
  it("b0279-e1/e2: a junk trailer on a head draws the annotation refusal alone", () => {
    // Bug 0272's witness group F, at the `let` position and at the return slot.
    // The author wrote ONE annotation and made ONE mistake in it; `Gone--`
    // derives from no `Type` production, and the head inside it is not a second
    // written mistake but the same one. Both captures stop at their own
    // terminator — the `=` and the body `{` — so the provenance mark does not
    // fire, but clause (iv)(3) is never even reached to read it: `Gone--`
    // itself fails `annotationSourceIsNotTypeExpression`, so bug 0124's guard 1
    // pushes the annotation refusal inside the `annotationDiagStart` /
    // `returnDiagStart` slice (`src/parser/theta-document.ts:8196-8203` at the
    // `let` position, `:8381-8387` at the return slot) before the clause
    // (iv)(3) check runs, and that check's own leading
    // `!out.slice(...).some((d) => d.severity === "error")` guard
    // (`:8227`, `:8401`) is already false. Guard 1 is what keeps these at one
    // row.
    //
    // These are the cells an over-broad rule would move first: a rule that
    // named every unresolvable head under any already-refused construct would
    // add a second row here for a mistake the author made once.
    const letFence = theta("e1 — `let x: Gone-- = 1`", "let x: Gone-- = 1\n1");
    const returnFence = theta("e2 — `fn f(): Gone-- { 1 }`", "fn f(): Gone-- { 1 }\n1");
    expectCaptured([letFence, returnFence], 1, []);
    expectRows(
      [letFence, returnFence],
      [[ANNOTATION], [ANNOTATION]],
      () => [[annotationLine("x")], [annotationLine("f")]],
      [["6:1-6:18"], ["6:1-6:21"]],
    );
  });
});
