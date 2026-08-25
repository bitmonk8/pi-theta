import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0272 — an enclosing construct's `theta/parse/annotation-type-not-expression`
// carries the whole declaration's range, so it satisfies the artefact-suppression
// predicate for every `theta/parse/unresolved-named-type` capture nested in that
// declaration's body
// (docs/bugs/0272-enclosing-annotation-refusal-swallows-nested-unresolved-head.md).
//
// THE SEAM (line numbers re-derived post bug 0279, which widened
// `src/parser/theta-document.ts` below `UNRESOLVED_NAMED_TYPE_CODE`).
// `captureWindowAlreadyRefused` (`src/parser/theta-document.ts` line 7630)
// answers `true` when any error-severity diagnostic's range OVERLAPS the
// capture's absorption window, filtering out of its `own` argument only a row
// this same walk drew under `UNRESOLVED_NAMED_TYPE_CODE` (line 6522). The
// windows it is asked about are narrowed — `captureAbsorptionWindow` (line 7663)
// and `fnHeaderWindow` (line 7678), consulted at the `let` annotation (line
// 8220), the `fn` parameter type (line 8346), the `fn` return type (line 8395)
// and the `invoke<T>` ascription (line 8823), each now additionally gated on
// the capture's own provenance mark (bug 0279) — but the COVERING diagnostic's
// own range is not: `annotationTypeNotExpressionDiagnostic` (line 6630) is minted
// with the enclosing statement's range, and the registry row for that code
// states that choice normatively ("Every diagnostic carries the declaration's
// range — a `let` statement's, or an `fn` declaration's",
// docs/spec_topics/diagnostics/code-registry-parse.md line 107). An `fn`
// declaration's range spans its body, so it overlaps every capture window inside
// that body.
//
// WHAT WAS RED BEFORE THE CHANGE-SET, AND FOR WHAT. Three cells asserted a
// nested written head that the parser left unnamed, so each red read as a
// missing `theta/parse/unresolved-named-type`:
//
//   (S) `fn f(): integer-- { let y: Gone = 1  1 }` — expected
//   [annotation-type-not-expression @6:1-9:2, unresolved-named-type @7:3-7:18],
//   observed [annotation-type-not-expression @6:1-9:2] alone.
//
//   (J) the same enclosing refusal over `let y: array<Gone> = 1` — expected the
//   refusal of the generic interior beside the enclosing row and the `let`'s own
//   mismatch, observed the enclosing row and the mismatch alone.
//
//   (K) the same enclosing refusal over `let y = invoke<Gone>("x.theta")` —
//   expected the ascription's refusal @7:11-7:34 beside the enclosing row,
//   observed the enclosing row alone.
//
// Cell (S)'s twin with a well-formed enclosing annotation, group (B) below, drew
// the nested head's refusal before the change-set and after it: the two bodies
// differ by two characters in `f`'s return annotation, and that difference
// removed the nested diagnostic.
//
// THE SETTLED TARGET BEHAVIOUR THIS FILE ENCODES (the bug document's §Fix route
// (b), narrowed as the operator adjudicated it). `captureWindowAlreadyRefused`'s
// `own` branch counts a coverer only when that coverer's range is CONTAINED in
// the construct whose capture is being judged; the `prior` branch stays
// unnarrowed. So a refusal ranged over an ENCLOSING declaration is no cover for
// a capture nested in that declaration's body, and the nested written head draws
// its own refusal beside it — the outcome the widened registry row already
// promises at docs/spec_topics/diagnostics/code-registry-parse.md line 112 ("A
// refusal drawn for ANOTHER capture's head is never such cover … One written
// mistake draws one diagnostic naming it, and two written mistakes draw two").
// Route (a), a prose-only qualification of that row, was declined. No *Message*
// byte and no registry row moves.
//
// WHAT STAYS PUT, EACH LOCKED BY ITS OWN GROUP BELOW.
//
//   (F) — the true one-mistake fences. `let x: Gone-- = 1` and
//   `fn f(): Gone-- { 1 }` each draw the enclosing refusal ALONE, because guard-1
//   withholds the second row before clause (iv)(3) is ever consulted: the
//   author wrote ONE malformed annotation, not two mistakes.
//   `fn f(p: integer--, q: Gone): number { 1 }` (row F3) is REFOUNDED under bug
//   0279 (docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md):
//   it is NOT the same reading as the other two rows, because `q: Gone` is a
//   second, genuinely-written mistake whose capture absorbed nothing, and it now
//   draws its own `unresolved-named-type` beside the enclosing refusal.
//
//   (N) — the nested-`fn` cell, also REFOUNDED under bug 0279.
//   `theta/parse/nested-fn` is ranged over the inner `fn`'s OWN construct, so it
//   IS contained in the construct whose parameter capture is judged — a range
//   relation this file's ORIGINAL reading took as cover. `z`'s capture absorbed
//   nothing, `Gone` is a name the author wrote, and it now draws its own line
//   beside the enclosing refusal and `nested-fn`.
//
//   (SIB) — the sibling-statement controls, in both orders. An enclosing range
//   that does not reach the second statement never covered it, before or after.
//
// Bug 0262 §Fix's operator ruling clause (iv)(3) still settles SAME-CONSTRUCT
// suppression, but its TRIGGER is bug 0279's provenance mark, not the range
// relation this file originally encoded: a coverer inside one construct is
// cover only for a capture that itself absorbed debris past a syntax fault, not
// for a sibling capture that ended at its own terminator and holds a head the
// author wrote. Rows F1/F2 hold under either reading (guard-1 alone accounts for
// them); rows F3 and N do not, and are the two cells this file re-founds.
//
// Every cell here carries an error-severity `theta/parse/*` diagnostic, so no
// cell registers on either side of the change: an `E` denies registration, the
// GOV-15 loads-cleanly reading
// (docs/spec_topics/governance/source-language-stability.md line 9).
//
// RANGES ARE THE SUBJECT. The defect is range geometry — a coverer whose extent
// exceeds the construct whose capture it silences — so every cell asserts the
// start AND end position of every diagnostic it draws, not the codes alone. A
// cell that read codes only could not tell an enclosing coverer from a
// same-construct one.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string, through `parseDoc`
// (`tests/helpers/e2e-s1.ts` — the shipped whole-file entry point wrapped in
// inert offline deps, no behaviour stubbed). An integration tier would add a
// round trip to a value already fixed at the parse boundary and observe nothing
// sharper; a live tier cannot see a parse-time diagnostic list at all, only the
// registration outcome it implies — and that outcome is identical on both sides
// of this change, since the enclosing refusal already denies registration, so a
// live tier could not witness this bug even in principle. Registration is read
// here off a helper that MIRRORS the composition root's own predicate
// (`hasLoadParseError`, src/extension/production-composition.ts) rather than
// calling it.
//
// NO SILENT SKIPPING. Nothing here early-returns, branches on the environment or
// skips. `msg` asserts its registry row is present and carries each placeholder
// it fills before substituting, and every cell asserts its fixture captured its
// body statements and exactly the declarations it names BEFORE reading a
// disposition off it — a fixture the parser dropped upstream reds by naming the
// loss instead of passing on a short list that reads as a clean parse.
//
// ANTI-VACUITY. Every cell asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics` — never containment — so neither an extra
// diagnostic nor one at the wrong position can hide. `Gone` is declared and
// imported in no fixture here.

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

/** The row a nested written head draws under the narrowing; its *Message* does not move. */
const UNRESOLVED = "theta/parse/unresolved-named-type";
/** The enclosing refusal, ranged over the whole declaration — the coverer this bug is about. */
const ANNOTATION = "theta/parse/annotation-type-not-expression";
/** Group (N): the inner `fn`'s own refusal, ranged over the inner construct. */
const NESTED_FN = "theta/parse/nested-fn";
/** Group (J): the verdict the `let`'s `array` outer shape reaches beside the refusal. */
const LET_MISMATCH = "theta/parse/let-rhs-type-mismatch";

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

/** The nested head's refusal, rendered for the head `name`. */
function unresolvedLine(name: string): string {
  return line(UNRESOLVED, [["<name>", name]]);
}

/** The enclosing refusal, rendered for the binder `name` it names. */
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
  const doc = parseDoc(`${FRONTMATTER}${body}\n`, "b0272.theta");
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
 * diagnostic in a row. The whole subject is whether a coverer's extent exceeds
 * the construct whose capture it silences, so the END position is read as well
 * as the start: an enclosing `fn` refusal and a same-construct one share their
 * start and differ only in where they stop.
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
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}; \`Gone\` is declared in no fixture, so the head is unresolvable by construction`,
  ).toEqual([]);
}

/**
 * Assert the ordered code list, THEN the ordered rendered-message list, THEN the
 * ordered extents. The message and extent sides are thunks so the registry read
 * happens only after the code assertion has passed: a missing emission must red
 * as a missing diagnostic, not as a registry lookup.
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
    "the coverer's extent against the judged construct's is the whole subject: an enclosing `fn` refusal spans the body, a same-construct one does not",
  ).toEqual(rows.map((r, i) => [r.label, expectedExtents[i]]));
  expect(
    rows.map((r) => [r.label, registered(r)]),
    "every fixture carries an error-severity refusal, so none registers on either side of the change",
  ).toEqual(rows.map((r) => [r.label, false]));
}

// ===========================================================================
// (S) The subject — a nested written head under an enclosing refusal.
// ===========================================================================

describe("b0272 (S) — an enclosing `fn` refusal does not swallow a nested `let` head", () => {
  it("b0272-S: the enclosing refusal and the nested head each draw their own diagnostic", () => {
    // The bug document's §Reproduction row a. The `fn` declaration's refusal
    // spans source lines 6 through 9, so it overlaps the `let` capture's window
    // at source line 7, and `captureWindowAlreadyRefused`
    // (`src/parser/theta-document.ts` line 7630) counted it as cover at the
    // `let` call site (line 8220). Under the narrowing it counts only a coverer
    // CONTAINED in the construct whose capture is judged — the `let` statement
    // at 7:3-7:18 — and the enclosing refusal is not, so the head the author
    // wrote is named.
    //
    // Two written mistakes, two diagnostics, each ranged at the construct that
    // carries it.
    const subject = theta(
      "S — `fn f(): integer--` over a body declaring `let y: Gone`",
      "fn f(): integer-- {\n  let y: Gone = 1\n  1\n}\n1",
    );
    expectCaptured([subject], 1, []);
    expectRows(
      [subject],
      [[ANNOTATION, UNRESOLVED]],
      () => [[annotationLine("f"), unresolvedLine("Gone")]],
      [["6:1-9:2", "7:3-7:18"]],
    );
  });
});

// ===========================================================================
// (B) The control the subject differs from by two characters.
// ===========================================================================

describe("b0272 (B) — with the enclosing annotation well formed, the nested head refuses", () => {
  it("b0272-B: the nested `let` head draws its refusal at the same extent as in the subject", () => {
    // The anti-vacuity half of group (S): the only delta is `f`'s return
    // annotation, and the nested refusal's code, message and extent are
    // identical to the one group (S) demands. That identity is what makes the
    // subject's red attributable to the enclosing coverer rather than to
    // anything about the `let` itself.
    const control = theta(
      "B — `fn f(): integer` over a body declaring `let y: Gone`",
      "fn f(): integer {\n  let y: Gone = 1\n  1\n}\n1",
    );
    expectCaptured([control], 1, []);
    expectRows(
      [control],
      [[UNRESOLVED]],
      () => [[unresolvedLine("Gone")]],
      [["7:3-7:18"]],
    );
  });

  it("b0272-B-no-head: the enclosing refusal alone is unchanged when no nested head is written", () => {
    // The other anti-vacuity half: with the nested annotation resolving, the
    // enclosing refusal stands alone at its declaration extent. A narrowing that
    // manufactured a second row here would name a head no author wrote.
    const control = theta(
      "B2 — `fn f(): integer--` over a body declaring `let y: number`",
      "fn f(): integer-- {\n  let y: number = 1\n  1\n}\n1",
    );
    expectCaptured([control], 1, []);
    expectRows([control], [[ANNOTATION]], () => [[annotationLine("f")]], [["6:1-9:2"]]);
  });
});

// ===========================================================================
// (SIB) Sibling statements — an extent that never reached the second statement.
// ===========================================================================

describe("b0272 (SIB) — two sibling statements each keep their own diagnostic", () => {
  it("b0272-SIB: both orders are byte-unchanged by the narrowing", () => {
    // A `let` statement's refusal is ranged over that statement alone, so it
    // never overlapped the next statement's capture window and never covered it.
    // These two rows are the reading the subject SHOULD have had all along, in
    // both source orders, and they are the tripwire against a narrowing that
    // moved a shape already correct.
    const forward = theta(
      "SIB1 — `let q: integer--` then `let y: Gone`",
      "let q: integer-- = 1\nlet y: Gone = 1\n1",
    );
    const reversed = theta(
      "SIB2 — `let y: Gone` then `let q: integer--`",
      "let y: Gone = 1\nlet q: integer-- = 2\n1",
    );
    expectCaptured([forward, reversed], 2, []);
    expectRows(
      [forward, reversed],
      [
        [ANNOTATION, UNRESOLVED],
        [UNRESOLVED, ANNOTATION],
      ],
      () => [
        [annotationLine("q"), unresolvedLine("Gone")],
        [unresolvedLine("Gone"), annotationLine("q")],
      ],
      [
        ["6:1-6:21", "7:1-7:16"],
        ["6:1-6:16", "7:1-7:21"],
      ],
    );
  });
});

// ===========================================================================
// (F) Same-construct suppression — the fences clause (iv)(3) settled.
// ===========================================================================

describe("b0272 (F) — a coverer carrying the judged construct's own range stays cover ONLY over absorbed debris", () => {
  it("b0272-F: one written annotation with nothing absorbed past it keeps ONE diagnostic; a genuinely-written sibling head draws its own", () => {
    // Bug 0262 §Fix's operator ruling clause (iv)(3). F1 and F2 stay fences:
    // `Gone--` derives from no `Type` production, so
    // `annotationTypeNotExpressionDiagnostic` fires from THIS capture's own
    // walk before clause (iv)(3) is ever consulted (guard-1,
    // `src/parser/theta-document.ts`'s `!out.slice(...).some(error)` term) —
    // one written mistake, one diagnostic, on every reading bug 0279 leaves
    // untouched.
    //
    // F3 is REFOUNDED under bug 0279
    // (docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md).
    // It was authored as a same-construct fence on clause (iv)(3)'s
    // then-decided reading: a coverer ranged over the WHOLE construct (`p`'s
    // annotation refusal, minted with the declaration's range) was counted as
    // cover for every capture in that construct, including `q`'s, whichever
    // code the coverer carried. Bug 0279 refines the clause's trigger to the
    // capture's own PROVENANCE: `q`'s parameter-type capture stopped at its own
    // `)`, so it absorbed nothing, and `Gone` is a name the author wrote, not
    // debris from `p`'s mistake. `q`'s capture now draws its own
    // `unresolved-named-type` beside `p`'s annotation refusal — two written
    // mistakes, two diagnostics, both carrying the declaration's range since
    // neither the annotation nor the head has a range of its own to carry.
    const letFence = theta("F1 — `let x: Gone-- = 1`", "let x: Gone-- = 1\n1");
    const returnFence = theta("F2 — `fn f(): Gone-- { 1 }`", "fn f(): Gone-- { 1 }\n1");
    const siblingHead = theta(
      "F3 — `fn f(p: integer--, q: Gone): number { 1 }`",
      "fn f(p: integer--, q: Gone): number { 1 }\n1",
    );
    expectCaptured([letFence, returnFence, siblingHead], 1, []);
    expectRows(
      [letFence, returnFence, siblingHead],
      [[ANNOTATION], [ANNOTATION], [ANNOTATION, UNRESOLVED]],
      () => [
        [annotationLine("x")],
        [annotationLine("f")],
        [annotationLine("p"), unresolvedLine("Gone")],
      ],
      [["6:1-6:18"], ["6:1-6:21"], ["6:1-6:42", "6:1-6:42"]],
    );
  });
});

// ===========================================================================
// (N) The nested `fn` — same-construct cover, and a required fence.
// ===========================================================================

describe("b0272 (N) — an inner `fn`'s own refusal is no verdict on that `fn`'s written parameter head", () => {
  it("b0272-N: the inner `Gone` is named beside the enclosing refusal and `nested-fn`", () => {
    // REFOUNDED under bug 0279
    // (docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md).
    // This cell was authored as a fence on clause (iv)(3)'s then-decided
    // same-construct reading: `theta/parse/nested-fn` is ranged over the inner
    // `fn`'s OWN construct (7:3-7:30), which IS the construct whose parameter
    // capture is judged, so the range test counted it as cover for `z: Gone`
    // whatever code it carried.
    //
    // `z`'s parameter-type capture stopped at its own `)`, so it absorbed
    // nothing — `Gone` is a name the author wrote in a real parameter list, not
    // debris from the enclosing `fn`'s `integer--` mistake or from `nested-fn`
    // itself. Under bug 0279's provenance mark, `nested-fn` is no longer read as
    // a verdict on that written head: the inner declaration now draws its own
    // `unresolved-named-type` at its own extent, third in order, beside the
    // enclosing annotation refusal and `nested-fn`. The enclosing `fn`'s refusal
    // at 6:1-9:2 already stopped covering the inner capture under bug 0272's
    // containment narrowing; what bug 0279 removes is `nested-fn`'s cover.
    const nested = theta(
      "N — `fn f(): integer--` over a body declaring `fn g(z: Gone)`",
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
// (J) A nested GENERIC interior under an enclosing refusal.
// ===========================================================================

describe("b0272 (J) — a head nested one generic level down inside the body is named too", () => {
  it("b0272-J: the interior head refuses beside the enclosing row and the `let`'s own verdict", () => {
    // The registry row at docs/spec_topics/diagnostics/code-registry-parse.md
    // line 112 covers "every generic type argument, union arm, `Result`
    // argument, and inline object field nested inside one of those ten"
    // positions, so a head written inside an `array<…>` argument of a nested
    // `let` annotation is a reference position exactly as the bare head of
    // group (S) is.
    //
    // The `let`'s own `array` outer shape decides against the initialiser
    // regardless of whether the element head resolves, so
    // `theta/parse/let-rhs-type-mismatch` stands here before the change-set and
    // after it; what the change adds is the refusal naming `Gone`. All three
    // rows are read whole-list, so a route that dropped the mismatch while
    // adding the refusal reds here.
    const generic = theta(
      "J — `fn f(): integer--` over a body declaring `let y: array<Gone>`",
      "fn f(): integer-- {\n  let y: array<Gone> = 1\n  1\n}\n1",
    );
    expectCaptured([generic], 1, []);
    expectRows(
      [generic],
      [[ANNOTATION, UNRESOLVED, LET_MISMATCH]],
      () => [
        [
          annotationLine("f"),
          unresolvedLine("Gone"),
          line(LET_MISMATCH, [
            ["<name>", "y"],
            ["<expected>", "array<Gone>"],
            ["<actual>", "integer"],
          ]),
        ],
      ],
      [["6:1-9:2", "7:3-7:25", "7:3-7:25"]],
    );
  });
});

// ===========================================================================
// (K) The `invoke<T>` ascription nested in the body.
// ===========================================================================

describe("b0272 (K) — an `invoke<T>` ascription written in the body is named too", () => {
  it("b0272-K: the ascription's head refuses at the invoke expression's extent", () => {
    // The fourth of the captures bug 0262 §Fix widened, judged at the `invoke`
    // call site (`src/parser/theta-document.ts` line 8823) against the window
    // `captureAbsorptionWindow` (line 7663) builds from the invoke EXPRESSION's
    // range. The enclosing `fn` refusal at 6:1-9:2 is not contained in that
    // expression, so it is no cover under the narrowing and the ascription's
    // head is named at the expression's own extent, 7:11-7:34 — a position
    // neither the enclosing declaration nor the `let` statement occupies, which
    // is what reads WHICH capture spoke.
    const ascription = theta(
      "K — `fn f(): integer--` over a body declaring `let y = invoke<Gone>(…)`",
      'fn f(): integer-- {\n  let y = invoke<Gone>("x.theta")\n  1\n}\n1',
    );
    expectCaptured([ascription], 1, []);
    expectRows(
      [ascription],
      [[ANNOTATION, UNRESOLVED]],
      () => [[annotationLine("f"), unresolvedLine("Gone")]],
      [["6:1-9:2", "7:11-7:34"]],
    );
  });
});
