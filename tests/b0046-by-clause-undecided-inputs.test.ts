import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { checkDiscriminatedUnion, type UnionVariantSchema } from "../src/parser/schema-declarations";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0046 — two reachable `by <field>` inputs load with ZERO diagnostics
// (docs/bugs/0046-by-clause-undecided-inputs-load-silently.md):
//   Class 1 — an explicit `by` naming a field at least one variant does not
//   declare. `checkExplicitDiscriminator` (`src/parser/schema-declarations.ts`)
//   resolves the author's theta-side name per variant through
//   `thetaNamedFieldInVariant`; when a variant carries no such field the
//   occurrence is `undefined`, `evaluateOccurrences` records `presentInAll`
//   false, `allLiteral` is conjoined with it, and every remaining gate is
//   vacuous — so the function returns clean AND the explicit path REPLACES
//   `detectImplicitDiscriminator` rather than falling back to it. One
//   misspelled field name therefore silences four distinct rejections the same
//   variants draw without the clause (groups (S) below).
//   Class 2 — an explicit `by` over a right-hand side of two or more arms whose
//   arms are not all object schemas. `checkByClause` cuts on the declaration's
//   SHAPE (object body, or fewer than two arms), so a two-arm primitive union
//   is admitted; `buildUnionVariantSchemas` (`src/parser/theta-document.ts`)
//   then declines every arm that is not a bare identifier resolving to a
//   declared object-form schema, so `checkDiscriminatedUnion` never runs. The
//   clause is accepted where it can have no subject.
//
// THE SETTLED ROUTE THIS FILE ENCODES. The bug document's §Fix is "Not yet
// decided" and enumerates four candidates plus six constraints; the route was
// adjudicated at HEAD inside those constraints and is the specification here.
// Both classes are REFUSED:
//
//   1. Class 1 — bug-document §Fix candidate 2. A NEW registered row
//      `theta/parse/absent-discriminator-field`, severity E, phase parse,
//      minted in the fix's own commit under DIAG-2
//      (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-2) and covered
//      by the GOV-15 diagnostic-registry carve-out
//      (docs/spec_topics/governance/source-language-stability.md
//      §Diagnostic-registry carve-out — every input newly refused emits nothing
//      at HEAD). Its *Message* is built from the closed placeholder surface
//      alone — `<field>` is category 5 and `<X>` category 7
//      (docs/spec_topics/diagnostics/placeholder-rendering-b.md) — so no
//      rendering category is added. The gate is `!evaluation.presentInAll` in
//      `checkExplicitDiscriminator`, at the declaration's own range (DIAG-1).
//      §Fix constraint 2 is answered "absent from ANY variant": detection rule
//      1 (docs/spec_topics/schemas.md §Discriminated unions) is "be present in
//      every variant", and the half-present arrangements are exactly the ones
//      that silence live rejections.
//      GATE ORDER IS BINDING: AFTER the `anyNested` gate, so A6 and A10 keep
//      `theta/parse/nested-discriminator` (the bug document's acceptance set
//      locks them), and BEFORE the non-literal / non-string / duplicate gates,
//      which the fix does not move.
//   2. Class 2 — bug-document §Fix candidate 1. The *Trigger* of the existing
//      row `theta/parse/by-on-object-schema` widens so the cut becomes the
//      registered *Message*'s own truth condition: the clause is admitted only where the declaration
//      IS a discriminated union — two or more arms, EVERY one an object schema.
//      The *Message* is UNCHANGED, so this is a DIAG-2 Trigger operation and
//      not a DIAG-4 *Message* reword. Three bounded adjudications, each
//      asserted below: an inline `ObjectType` arm IS an object schema
//      (docs/spec_topics/schemas.md §Discriminated unions defines the concept
//      over unions "whose variants are all object schemas"), so B7 and the
//      all-inline spelling stay admitted; an arm naming an ALIAS declaration is
//      not an object schema at the point of use, so B8 refuses; and the row is
//      WITHHELD behind an arm walk that already pushed an error-severity
//      diagnostic, so B13 keeps `theta/parse/unresolved-named-type` alone.
//
// WHY THIS FILE IS RED AT HEAD, AND FOR WHAT. Every red is the OBSERVED
// SILENCE the bug document reports — an expected refusal against an observed
// empty diagnostic list — plus the one registry cell that reds on the new row's
// absence:
//   - groups (A), (S), (L), (B): the structural code list is asserted BEFORE
//     the registry-message list in each cell, so the red reads "expected
//     [theta/parse/absent-discriminator-field], observed []" (or the class-2
//     equivalent) rather than a registry lookup failure.
//   - group (R): the `theta/parse/absent-discriminator-field` row does not
//     exist yet. DIAG-2 lands it in the same commit as the gate, so this cell
//     reds by NAMING the registry page that must carry it.
// The rows the route leaves unmoved — A6, A10, A11, A12, B7, B13, B14, B15, the
// no-clause column of S1–S6, the arm-shape controls, the all-inline union — are
// GREEN at HEAD and must stay green: they are the tripwires against a fix that
// over-reaches.
//
// TIER: unit, offline, provider-free, deterministic. Every observable settles
// inside one `parseThetaDocument` call over a source string (through `parseDoc`,
// tests/helpers/e2e-s1.ts — the shipped whole-file entry point wrapped in the
// standard inert deps, no behaviour stubbed) or one `checkDiscriminatedUnion`
// call over a hand-built declaration. An integration tier would add a round
// trip to a value fixed at the parse boundary and observe nothing sharper; a
// live tier would make a fully determined value stochastic AND could not see
// the contract at all, since the lowered schema carries no discriminator marker
// (docs/spec_topics/schema-subset.md, Lowering Algorithm step 6) — the clause
// never reaches a provider. Registration is likewise asserted through the
// composition root's own predicate rather than a live load.
//
// NO SILENT SKIPPING. Nothing here early-returns, branches on the environment
// or skips. `msg` asserts its registry row is present and carries each
// placeholder it fills before substituting; every `parseDoc` cell asserts the
// declaration names it captured BEFORE reading a disposition off it, so a
// fixture whose declaration vanished upstream reds by naming the absent schema
// instead of passing on an empty diagnostic list that reads as a clean load.
//
// ANTI-VACUITY. Every cell asserts an ORDERED WHOLE-LIST equality over the
// UNFILTERED `doc.diagnostics` — never containment — so neither an extra
// diagnostic nor one at the wrong position can hide.

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

/** The row this fix mints under DIAG-2 (absent at HEAD). */
const ABSENT_FIELD = "theta/parse/absent-discriminator-field";
/** The row whose *Trigger* widens over class 2; its *Message* does not move. */
const BY_ON_OBJECT = "theta/parse/by-on-object-schema";
/** The gate-order lock for A6/A10 — checked before the new gate. */
const NESTED = "theta/parse/nested-discriminator";
/** The rejection the clause suppresses in S1/S5, and the `.thetalib` control. */
const MISSING = "theta/parse/missing-discriminator";
/** The rejection the clause suppresses in S2, and control A12's own code. */
const DUPLICATE = "theta/parse/duplicate-discriminator-value";
/** The rejection the clause suppresses in S3. */
const AMBIGUOUS = "theta/parse/ambiguous-discriminator";
/** The rejection the clause suppresses in S4. */
const NON_STRING = "theta/parse/non-string-discriminator";
/** B13's own arm-name resolution, which the class-2 withhold leaves ALONE. */
const UNRESOLVED = "theta/parse/unresolved-named-type";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * the absent `theta/parse/absent-discriminator-field` row reds by naming the
 * registry page rather than by a bare `undefined` comparison downstream.
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

/** One rendered diagnostic line, `<severity> <code>: <message>` — the bug document's own rendering. */
function line(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  return `error ${code}: ${msg(code, fills)}`;
}

/** Class 1's refusal, rendered for `field` on `schema`. */
function absentLine(field: string, schema: string): string {
  return line(ABSENT_FIELD, [
    ["<field>", field],
    ["<X>", schema],
  ]);
}

/** Class 2's refusal — the placeholder-free registered *Message*, unchanged by this fix. */
function byOnObjectLine(): string {
  return line(BY_ON_OBJECT);
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
  readonly doc: ThetaDocument;
}

function rowOf(label: string, doc: ThetaDocument): LoadRow {
  return {
    label,
    codes: doc.diagnostics.map((d: Diagnostic) => d.code),
    lines: doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    declared: doc.body.statements
      .filter((s) => s.kind === "schema" || s.kind === "enum")
      .map((s) => (s as { name: string }).name),
    doc,
  };
}

/**
 * A `mode: prompt` theta whose body is `decls` followed by the tail the bug
 * document's §Reproduction uses, so no row leaks a residue statement.
 */
function theta(label: string, decls: string): LoadRow {
  return rowOf(label, parseDoc(`---\nmode: prompt\n---\n${decls}\nlet a = 1\na\n`, "b0046.theta"));
}

/** The `.thetalib` spelling: declarations alone, no frontmatter and no trailing `let`. */
function thetalib(label: string, decls: string): LoadRow {
  return rowOf(label, parseDoc(`${decls}\n`, "b0046.thetalib"));
}

/**
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered. Every fixture's refusal code below is `theta/parse/…`, so the
 * code-prefix half of the real predicate is always satisfied here.
 */
function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}

/**
 * Assert every row captured exactly the declarations it names, before any
 * disposition is read off it. A vanished declaration produces zero diagnostics
 * on some paths, which is indistinguishable from a clean load unless the
 * capture is asserted separately — this is the precondition, failing loudly.
 */
function expectDeclared(rows: readonly LoadRow[], names: readonly string[]): void {
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}; a row listed here lost a declaration upstream of the by-clause checkers, so its diagnostic list says nothing about this bug`,
  ).toEqual([]);
}

/**
 * Assert the ordered code list, THEN the ordered rendered-message list. The
 * message side is a thunk so the registry read happens only after the code
 * assertion has passed: a missing emission must red as a missing diagnostic,
 * not as the absent registry row (which group (R) owns).
 */
function expectRows(
  rows: readonly LoadRow[],
  expected: readonly (readonly string[])[],
  expectedLines: () => readonly (readonly string[])[],
): void {
  expect(rows.map((r) => [r.label, r.codes])).toEqual(
    rows.map((r, i) => [r.label, expected[i]]),
  );
  const wanted = expectedLines();
  expect(rows.map((r) => [r.label, r.lines])).toEqual(
    rows.map((r, i) => [r.label, wanted[i]]),
  );
}

// The variants the bug document's §Reproduction uses unless a row says otherwise.
const CAT = 'schema Cat { kind: "cat", name: string }';
const DOG = 'schema Dog { kind: "dog", name: string }';

// ===========================================================================
// (R) The DIAG-2 addition, and the *Message* that does NOT move.
// ===========================================================================

describe("b0046 (R) — the registry rows the settled route requires", () => {
  it("b0046-R1: code-registry-parse.md carries `absent-discriminator-field` as an E/parse row with its normative Message", () => {
    // DIAG-1 requires every emission to carry a registered code and DIAG-2
    // requires the row to land in the same commit as its site. The *Message*
    // uses `<field>` (placeholder category 5) and `<X>` (category 7) only, so
    // the closed placeholder surface
    // (docs/spec_topics/diagnostics/placeholder-rendering-a.md §Closure) is not
    // touched. This is the ONE place in the file a message literal appears,
    // because here the string is the row's specified content rather than an
    // oracle read.
    const row = REGISTRY.find((r) => r.code === ABSENT_FIELD);
    expect(
      row,
      `DIAG-2: the fix adds the ${ABSENT_FIELD} row to ${REGISTRY_PATH} (and its docs/reference/diagnostics.md mirror) in its own commit`,
    ).toBeDefined();
    expect(row?.message).toBe("discriminator '<field>' on <X> must be declared in every variant");
    expect(
      row?.severity,
      "severity E is what the composition root's registration gate acts on; a W row would leave the silently-mis-typed discriminator registered",
    ).toBe("E");
    expect(row?.phase).toBe("parse");
  });

  it("b0046-R2: `by-on-object-schema`'s Message is byte-unchanged — class 2 is a Trigger widening, not a reword", () => {
    // The ground for reusing the row rather than minting a second one: the
    // registered *Message* is already TRUE of every class-2 input (a union with
    // a primitive, literal, generic, alias or `enum` arm is not a
    // discriminated-union schema), so widening the *Trigger* is a DIAG-2
    // operation. A *Message* reword would instead be DIAG-4, deferred to theta
    // 2.0 — which is the objection the bug document raises against reusing
    // `theta/parse/missing-discriminator` for class 1.
    expect(msg(BY_ON_OBJECT)).toBe(
      "the 'by' clause applies only to discriminated-union schemas (schema X by f = A | B | …)",
    );
  });

  it("b0046-R3: the emitted class-1 bytes ARE the registry row's Message bytes", () => {
    // The reconciliation the route's DIAG-4 clause demands, asserted end to end
    // rather than by inspection: the diagnostic a real load produces must equal
    // the registry template with its two placeholders filled. A row that landed
    // with different bytes than the emission — or an emission that hard-codes
    // prose the registry does not carry — reds here.
    const row = theta("R3 — A1's load, read against the registry", `${CAT}\n${DOG}\nschema Animal by ghost = Cat | Dog`);
    expectDeclared([row], ["Cat", "Dog", "Animal"]);
    expect(row.codes).toEqual([ABSENT_FIELD]);
    const emitted = row.doc.diagnostics[0]?.message;
    expect(emitted).toBe(
      msg(ABSENT_FIELD, [
        ["<field>", "ghost"],
        ["<X>", "Animal"],
      ]),
    );
  });
});

// ===========================================================================
// (A) Class 1 — §Reproduction rows A1–A12, at their exact fixtures.
// ===========================================================================

/** One class-1 row: its declarations, and the disposition the route settles. */
interface ClassOneRow {
  readonly label: string;
  readonly decls: string;
  readonly declared: readonly string[];
  readonly codes: readonly string[];
  /** Lazy: the registry read must happen inside a cell, not at module load. */
  readonly lines: () => readonly string[];
}

const CLASS_ONE: readonly ClassOneRow[] = [
  {
    // `ghost` is declared by neither variant: every occurrence is `undefined`.
    label: "A1 — `by ghost` over two well-formed variants",
    decls: `${CAT}\n${DOG}\nschema Animal by ghost = Cat | Dog`,
    declared: ["Cat", "Dog", "Animal"],
    codes: [ABSENT_FIELD],
    lines: () => [absentLine("ghost", "Animal")],
  },
  {
    // Cell i2's fixture. `by` names the THETA-SIDE identifier
    // (docs/spec_topics/schemas.md §Wire-name renaming), so the WIRE spelling
    // `Kind` resolves to nothing even though both variants carry the field —
    // a member of class 1 BECAUSE of that resolution rule, not in spite of it.
    label: "A2 — `by Kind`, the wire spelling of a renamed field",
    decls:
      'schema Cat { kind as "Kind": 1, name: string }\n' +
      'schema Dog { kind as "Kind": 2, name: string }\n' +
      "schema Animal by Kind = Cat | Dog",
    declared: ["Cat", "Dog", "Animal"],
    codes: [ABSENT_FIELD],
    lines: () => [absentLine("Kind", "Animal")],
  },
  {
    // Half-present, string-literal occurrence: §Fix constraint 2's "absent from
    // ANY variant" reading is what refuses A3–A5 and A7–A9.
    label: "A3 — `kind` absent from `Dog`",
    decls: `${CAT}\nschema Dog { name: string }\nschema Animal by kind = Cat | Dog`,
    declared: ["Cat", "Dog", "Animal"],
    codes: [ABSENT_FIELD],
    lines: () => [absentLine("kind", "Animal")],
  },
  {
    label: "A4 — `kind` absent from `Cat`",
    decls: `schema Cat { name: string }\n${DOG}\nschema Animal by kind = Cat | Dog`,
    declared: ["Cat", "Dog", "Animal"],
    codes: [ABSENT_FIELD],
    lines: () => [absentLine("kind", "Animal")],
  },
  {
    // The present occurrence is a NON-STRING literal. The non-string gate is
    // downstream of `allLiteral`, itself conjoined with `presentInAll`, so it
    // is unreachable here — the absent-field gate is what answers.
    label: "A5 — half-present, the present occurrence a non-string literal",
    decls:
      "schema Cat { kind: 1, name: string }\nschema Dog { name: string }\nschema Animal by kind = Cat | Dog",
    declared: ["Cat", "Dog", "Animal"],
    codes: [ABSENT_FIELD],
    lines: () => [absentLine("kind", "Animal")],
  },
  {
    // GATE ORDER. `anyNested` is a `.some`, and the new gate is placed AFTER
    // it, so the half-present NESTED arrangement keeps the more specific code.
    // A route that put the absent-field gate first would red this row.
    label: "A6 — half-present, the present occurrence nested (keeps `nested-discriminator`)",
    decls:
      'schema Cat { kind: { type: "x" }, name: string }\n' +
      "schema Dog { name: string }\nschema Animal by kind = Cat | Dog",
    declared: ["Cat", "Dog", "Animal"],
    codes: [NESTED],
    lines: () => [
      line(NESTED, [
        ["<field>", "kind"],
        ["<X>", "Animal"],
      ]),
    ],
  },
  {
    label: "A7 — half-present, the present occurrence a non-literal type",
    decls:
      "schema Cat { kind: string, name: string }\nschema Dog { name: string }\nschema Animal by kind = Cat | Dog",
    declared: ["Cat", "Dog", "Animal"],
    codes: [ABSENT_FIELD],
    lines: () => [absentLine("kind", "Animal")],
  },
  {
    // Three arms, the third lacking the field: the refusal is not arity-bound.
    label: "A8 — a third arm lacking the field",
    decls: `${CAT}\n${DOG}\nschema Fish { name: string }\nschema Animal by kind = Cat | Dog | Fish`,
    declared: ["Cat", "Dog", "Fish", "Animal"],
    codes: [ABSENT_FIELD],
    lines: () => [absentLine("kind", "Animal")],
  },
  {
    // A9 against A12: the duplicate-value gate is unreachable once ANY
    // occurrence is absent, so adding a third arm that lacks `kind` converts
    // A12's refusal into silence at HEAD. Under the route both refuse — A12 on
    // the duplicate it earns, A9 on the absent field.
    label: "A9 — duplicate values plus a third arm lacking the field",
    decls:
      'schema Cat { kind: "same", name: string }\n' +
      'schema Dog { kind: "same", name: string }\n' +
      "schema Fish { name: string }\nschema Animal by kind = Cat | Dog | Fish",
    declared: ["Cat", "Dog", "Fish", "Animal"],
    codes: [ABSENT_FIELD],
    lines: () => [absentLine("kind", "Animal")],
  },
  {
    // NOT a member of class 1 — `ghost` is present in BOTH variants. Pinned as
    // the boundary: a gate written on the field's name rather than on
    // `presentInAll` would move this row.
    label: "A10 — `by ghost` where both variants DO declare a nested `ghost`",
    decls:
      'schema Cat { ghost: { type: "x" }, name: string }\n' +
      'schema Dog { ghost: { type: "y" }, name: string }\n' +
      "schema Animal by ghost = Cat | Dog",
    declared: ["Cat", "Dog", "Animal"],
    codes: [NESTED],
    lines: () => [
      line(NESTED, [
        ["<field>", "ghost"],
        ["<X>", "Animal"],
      ]),
    ],
  },
  {
    // The positive control: a well-formed explicit discriminator stays clean.
    label: "A11 — CONTROL, a well-formed `by kind`",
    decls: `${CAT}\n${DOG}\nschema Animal by kind = Cat | Dog`,
    declared: ["Cat", "Dog", "Animal"],
    codes: [],
    lines: () => [],
  },
  {
    // The control the new gate must not swallow: the field RESOLVES in both
    // variants, so the duplicate-value gate — downstream of the new one —
    // still answers.
    label: "A12 — CONTROL, duplicate values over a resolved field",
    decls:
      'schema Cat { kind: "same", name: string }\n' +
      'schema Dog { kind: "same", name: string }\n' +
      "schema Animal by kind = Cat | Dog",
    declared: ["Cat", "Dog", "Animal"],
    codes: [DUPLICATE],
    lines: () => [
      line(DUPLICATE, [
        ["<value>", "same"],
        ["<X>", "Animal"],
      ]),
    ],
  },
];

describe("b0046 (A) — class 1, an explicit `by` naming a field a variant does not declare", () => {
  it("b0046-A: rows A1–A12 take the settled dispositions", () => {
    const rows = CLASS_ONE.map((r) => theta(r.label, r.decls));
    rows.forEach((row, i) => expectDeclared([row], CLASS_ONE[i]!.declared));
    expectRows(
      rows,
      CLASS_ONE.map((r) => r.codes),
      () => CLASS_ONE.map((r) => r.lines()),
    );
  });

  it("b0046-A-range: DIAG-1 — the refusal carries the DECLARATION's own range", () => {
    // DIAG-1 (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-1): one
    // range per diagnostic, and the site `checkExplicitDiscriminator` already
    // receives is the declaration's. Frontmatter takes file lines 1–3, `Cat`
    // line 4 and `Dog` line 5, so `schema Animal by ghost = Cat | Dog` is file
    // line 6, columns 1 through 35 (end exclusive, the declaration's own
    // extent) — the same span `theta/parse/nested-discriminator` occupies for
    // the sibling declaration on that line.
    const row = theta("A-range — A1's span", `${CAT}\n${DOG}\nschema Animal by ghost = Cat | Dog`);
    expectDeclared([row], ["Cat", "Dog", "Animal"]);
    expect(row.codes).toEqual([ABSENT_FIELD]);
    const range: SourceRange | undefined = row.doc.diagnostics[0]?.range;
    expect(range).toEqual({
      start: { line: 6, column: 1 },
      end: { line: 6, column: 35 },
    });
  });

  it("b0046-A-registration: an error-severity class-1 refusal denies registration", () => {
    // The observable the severity column buys. `hasLoadParseError`
    // (`src/extension/production-composition.ts`) is
    // `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
    // d.code.startsWith("theta/parse/")))`, and the composition root drops a
    // document that satisfies it (the refusal below is `theta/parse/…`, so the
    // code-prefix half holds), so the refusal IS the non-registration — asserted
    // through that predicate rather than through a live load, which could not
    // see a parse-time value more sharply.
    const refused = theta(
      "A-registration — A1 under the refusal",
      `${CAT}\n${DOG}\nschema Animal by ghost = Cat | Dog`,
    );
    const control = theta(
      "A-registration — A11, the clean control",
      `${CAT}\n${DOG}\nschema Animal by kind = Cat | Dog`,
    );
    expectDeclared([refused, control], ["Cat", "Dog", "Animal"]);
    expect(
      refused.doc.diagnostics.map((d: Diagnostic) => d.severity),
      `${ABSENT_FIELD} is an E row, so its emission must be error-severity`,
    ).toEqual(["error"]);
    expect(registered(refused), "a refused document is not registered").toBe(false);
    expect(registered(control), "the well-formed discriminator still registers").toBe(true);
  });
});

// ===========================================================================
// (S) What the clause suppresses — both columns of §Reproduction's S1–S6.
// ===========================================================================

/** One suppression pair: the same variants with no clause, and under `by ghost`. */
interface SuppressionRow {
  readonly label: string;
  readonly variants: string;
  /** The no-clause column, byte-identical to today. */
  readonly noClauseCodes: readonly string[];
  /** Lazy: the registry read must happen inside a cell, not at module load. */
  readonly noClauseLines: () => readonly string[];
}

const SUPPRESSION: readonly SuppressionRow[] = [
  {
    label: "S1 — disjoint fields",
    variants: "schema Cat { name: string }\nschema Dog { age: integer }",
    noClauseCodes: [MISSING],
    noClauseLines: () => [line(MISSING, [["<X>", "Animal"]])],
  },
  {
    label: "S2 — a shared duplicate value",
    variants:
      'schema Cat { kind: "same", name: string }\nschema Dog { kind: "same", name: string }',
    noClauseCodes: [DUPLICATE],
    noClauseLines: () => [
      line(DUPLICATE, [
        ["<value>", "same"],
        ["<X>", "Animal"],
      ]),
    ],
  },
  {
    label: "S3 — two qualifying candidate fields",
    variants:
      'schema Cat { kind: "cat", species: "felis", name: string }\n' +
      'schema Dog { kind: "dog", species: "canis", name: string }',
    noClauseCodes: [AMBIGUOUS],
    noClauseLines: () => [
      line(AMBIGUOUS, [
        ["<X>", "Animal"],
        ["<fields>", "kind, species"],
      ]),
    ],
  },
  {
    label: "S4 — integer tags",
    variants: "schema Cat { kind: 1, name: string }\nschema Dog { kind: 2, name: string }",
    noClauseCodes: [NON_STRING],
    noClauseLines: () => [
      line(NON_STRING, [
        ["<field>", "kind"],
        ["<X>", "Animal"],
        ["<kind>", "integer"],
      ]),
    ],
  },
  {
    label: "S5 — nested tags",
    variants:
      'schema Cat { kind: { type: "x" }, name: string }\n' +
      'schema Dog { kind: { type: "y" }, name: string }',
    noClauseCodes: [MISSING],
    noClauseLines: () => [line(MISSING, [["<X>", "Animal"]])],
  },
  {
    label: "S6 — CONTROL, distinct string tags",
    variants: `${CAT}\n${DOG}`,
    noClauseCodes: [],
    noClauseLines: () => [],
  },
];

describe("b0046 (S) — the rejections a misspelled `by` field silences", () => {
  it("b0046-S-noclause: the no-clause column is byte-identical to today", () => {
    // The invariant the fix must not disturb: implicit detection keeps every
    // one of its four codes, and the control keeps its clean load. Green at
    // HEAD; a route that changed `detectImplicitDiscriminator` would red here.
    const rows = SUPPRESSION.map((r) =>
      theta(`${r.label} — no clause`, `${r.variants}\nschema Animal = Cat | Dog`),
    );
    expectDeclared(rows, ["Cat", "Dog", "Animal"]);
    expectRows(
      rows,
      SUPPRESSION.map((r) => r.noClauseCodes),
      () => SUPPRESSION.map((r) => r.noClauseLines()),
    );
  });

  it("b0046-S-byghost: the `by ghost` column now refuses in every arrangement", () => {
    // The heart of the report: at HEAD each of these six is `[]`, so a
    // one-character misspelling of the discriminator field turns off four
    // distinct rejections — including the two arrangements
    // docs/spec_topics/schemas.md §Discriminated unions names as provider-quality
    // failures (no shared discriminator, S1/S5; a non-string tag, S4). Under the
    // route every one draws the new code, and the S6 control refuses too: the
    // clause is wrong there as well, its field naming nothing.
    const rows = SUPPRESSION.map((r) =>
      theta(`${r.label} — by ghost`, `${r.variants}\nschema Animal by ghost = Cat | Dog`),
    );
    expectDeclared(rows, ["Cat", "Dog", "Animal"]);
    expectRows(
      rows,
      SUPPRESSION.map(() => [ABSENT_FIELD]),
      () => SUPPRESSION.map(() => [absentLine("ghost", "Animal")]),
    );
  });
});

// ===========================================================================
// (L) Both classes in a `.thetalib`, plus the control.
// ===========================================================================

describe("b0046 (L) — the `.thetalib` spelling of both classes", () => {
  it("b0046-L: a library file takes the same dispositions as the `.theta` spelling", () => {
    // Declarations are permitted top-level forms in a `.thetalib`, so the same
    // declaration graph reaches the same checkers with no frontmatter and no
    // trailing `let`. The pair fixes that each disposition is a property of the
    // declaration graph, not of the document kind. The control is the row that
    // proves the harness reached the checkers at all.
    const classOne = thetalib(
      "L1 — class 1 in a library",
      `${CAT}\n${DOG}\nschema Animal by ghost = Cat | Dog`,
    );
    const classTwo = thetalib("L2 — class 2 in a library", "schema X by f = string | integer");
    const control = thetalib(
      "L3 — CONTROL, disjoint variants with no clause",
      "schema Cat { name: string }\nschema Dog { age: integer }\nschema Animal = Cat | Dog",
    );
    expectDeclared([classOne, control], ["Cat", "Dog", "Animal"]);
    expectDeclared([classTwo], ["X"]);
    expectRows(
      [classOne, classTwo, control],
      [[ABSENT_FIELD], [BY_ON_OBJECT], [MISSING]],
      () => [
        [absentLine("ghost", "Animal")],
        [byOnObjectLine()],
        [line(MISSING, [["<X>", "Animal"]])],
      ],
    );
  });
});

// ===========================================================================
// (B) Class 2 — §Reproduction rows B1–B15, plus the two adjudications.
// ===========================================================================

interface ClassTwoRow {
  readonly label: string;
  readonly decls: string;
  readonly declared: readonly string[];
  readonly codes: readonly string[];
  /** Lazy: the registry read must happen inside a cell, not at module load. */
  readonly lines: () => readonly string[];
}

/** Every class-2 row that the widened Trigger refuses draws exactly this line. */
const BY_REFUSAL: readonly string[] = [BY_ON_OBJECT];

const CLASS_TWO: readonly ClassTwoRow[] = [
  {
    // Cell n22's fixture — the row the `by-on-object-schema` Trigger was
    // reworded to EXCLUDE. The widening brings it back in.
    label: "B1 — `string | integer`",
    decls: "schema X by f = string | integer",
    declared: ["X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B2 — `Cat | string`",
    decls: `${CAT}\nschema X by f = Cat | string`,
    declared: ["Cat", "X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B3 — `string | Cat`, the mirrored arm order",
    decls: `${CAT}\nschema X by f = string | Cat`,
    declared: ["Cat", "X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B4 — a literal union",
    decls: 'schema X by f = "a" | "b"',
    declared: ["X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B5 — two object arms and a primitive third",
    decls: `${CAT}\n${DOG}\nschema X by f = Cat | Dog | string`,
    declared: ["Cat", "Dog", "X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B6 — a generic arm",
    decls: "schema X by f = array<integer> | string",
    declared: ["X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    // ADJUDICATION 1, the one place the route departs from the bug document's
    // grouping: an inline `ObjectType` IS an object schema in the language, so
    // this union's variants ARE all object schemas and the registered *Message*
    // would be FALSE of it. Refusing an input the Message misdescribes is the
    // objection the bug document raises against its own candidate 3. Green at
    // HEAD and green after — a route that refused it would red here.
    label: "B7 — CLEAN, an inline object arm is an object schema",
    decls: `${CAT}\nschema X by f = Cat | { a: string }`,
    declared: ["Cat", "X"],
    codes: [],
    lines: () => [],
  },
  {
    // ADJUDICATION 2: an arm naming an ALIAS declaration is not an object
    // schema at the point of use, so the clause has no subject and refuses.
    // The bug document leaves this "one way or the other".
    label: "B8 — an alias arm",
    decls: `${CAT}\nschema Y = string\nschema X by f = Cat | Y`,
    declared: ["Cat", "Y", "X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B9 — an `enum` arm",
    decls: "enum E { Low, High }\nschema X by f = E | string",
    declared: ["E", "X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B10 — a `null` arm",
    decls: "schema X by f = string | null",
    declared: ["X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B11 — three primitive arms",
    decls: "schema X by f = string | integer | boolean",
    declared: ["X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    // The field name is one a variant DOES declare, which changes nothing: the
    // cut is the arm kinds, and a primitive arm has no fields at all.
    label: "B12 — `by kind`, a name the object arm declares",
    decls: `${CAT}\nschema X by kind = Cat | string`,
    declared: ["Cat", "X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    // ADJUDICATION 3, the withhold: the declaration's own arm walk already
    // pushed an error-severity diagnostic, so the clause's refusal is withheld
    // and the arm's name resolution stands ALONE — a lock in the bug document's
    // acceptance set. A route that appended its refusal unconditionally reds
    // here with a second line.
    label: "B13 — an unresolved arm keeps `unresolved-named-type` ALONE",
    decls: `${DOG}\nschema X by f = Ghost | Dog`,
    declared: ["Dog", "X"],
    codes: [UNRESOLVED],
    lines: () => [line(UNRESOLVED, [["<name>", "Ghost"]])],
  },
  {
    // §Non-goals: the existing emission set does not move.
    label: "B14 — CONTROL, a one-arm right-hand side",
    decls: `${CAT}\nschema X by f = Cat`,
    declared: ["Cat", "X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    label: "B15 — CONTROL, a `by` clause on an object body",
    decls: "schema X by f { a: string }",
    declared: ["X"],
    codes: BY_REFUSAL,
    lines: () => [byOnObjectLine()],
  },
  {
    // ADJUDICATION 1's second spelling: a well-formed discriminated union whose
    // arms are both inline object schemas, each carrying a correct string tag.
    // Refusing it would refuse a union the language calls discriminated.
    label: "B-inline — CLEAN, `by kind` over two inline object arms",
    decls: 'schema S by kind = { kind: "a" } | { kind: "b" }',
    declared: ["S"],
    codes: [],
    lines: () => [],
  },
];

/** The arm-shape controls: the same arms with NO clause, clean before and after. */
const CLASS_TWO_CONTROLS: readonly ClassTwoRow[] = [
  {
    label: "B-ctl1 — `Cat | Dog | string`, no clause",
    decls: `${CAT}\n${DOG}\nschema X = Cat | Dog | string`,
    declared: ["Cat", "Dog", "X"],
    codes: [],
    lines: () => [],
  },
  {
    label: "B-ctl2 — `Cat | string`, no clause",
    decls: `${CAT}\nschema X = Cat | string`,
    declared: ["Cat", "X"],
    codes: [],
    lines: () => [],
  },
  {
    label: "B-ctl3 — `string | integer`, no clause",
    decls: "schema X = string | integer",
    declared: ["X"],
    codes: [],
    lines: () => [],
  },
  {
    label: "B-ctl4 — `Cat | { a: string }`, no clause",
    decls: `${CAT}\nschema X = Cat | { a: string }`,
    declared: ["Cat", "X"],
    codes: [],
    lines: () => [],
  },
  {
    label: "B-ctl5 — `{ kind: \"a\" } | { kind: \"b\" }`, no clause",
    decls: 'schema S = { kind: "a" } | { kind: "b" }',
    declared: ["S"],
    codes: [],
    lines: () => [],
  },
];

describe("b0046 (B) — class 2, an explicit `by` over arms that are not all object schemas", () => {
  it("b0046-B: rows B1–B15 and the inline-arm adjudication take the settled dispositions", () => {
    const rows = CLASS_TWO.map((r) => theta(r.label, r.decls));
    rows.forEach((row, i) => expectDeclared([row], CLASS_TWO[i]!.declared));
    expectRows(
      rows,
      CLASS_TWO.map((r) => r.codes),
      () => CLASS_TWO.map((r) => r.lines()),
    );
  });

  it("b0046-B-controls: the same arms WITHOUT a clause stay clean", () => {
    // The cut is the CLAUSE over those arms, never the arms themselves:
    // docs/spec_topics/schemas.md §Discriminated unions gives a mixed or
    // primitive union its own non-discriminated lowering, and this fix does not
    // touch it. Green at HEAD; a route that cut on arm kinds alone reds here.
    const rows = CLASS_TWO_CONTROLS.map((r) => theta(r.label, r.decls));
    rows.forEach((row, i) => expectDeclared([row], CLASS_TWO_CONTROLS[i]!.declared));
    expectRows(
      rows,
      CLASS_TWO_CONTROLS.map(() => []),
      () => CLASS_TWO_CONTROLS.map(() => []),
    );
  });

  it("b0046-B-registration: a class-2 refusal is error-severity and denies registration", () => {
    const refused = theta("B-registration — B1", "schema X by f = string | integer");
    const control = theta("B-registration — B-ctl3", "schema X = string | integer");
    expectDeclared([refused, control], ["X"]);
    expect(refused.doc.diagnostics.map((d: Diagnostic) => d.severity)).toEqual(["error"]);
    expect(registered(refused), "a refused document is not registered").toBe(false);
    expect(registered(control), "the clause-less union still registers").toBe(true);
  });
});

// ===========================================================================
// (Seam) `checkDiscriminatedUnion` — class 1's gate, and its order.
// ===========================================================================

/** A throwaway 1:1–1:2 span for the seam calls. */
const SITE = {
  file: "b0046.theta",
  range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } as SourceRange,
};

/** `Cat` with the field spelling under test, and `Dog` with a plain string tag. */
function variants(catFields: UnionVariantSchema["fields"]): readonly UnionVariantSchema[] {
  return [
    { name: "Cat", fields: catFields },
    {
      name: "Dog",
      fields: [{ name: "kind", literal: { kind: "string", text: "dog" } }, { name: "name" }],
    },
  ];
}

function seam(
  catFields: UnionVariantSchema["fields"],
  by: string | undefined,
): { codes: string[]; lines: string[] } {
  const decl = {
    name: "Animal",
    ...(by !== undefined ? { by } : {}),
    variants: variants(catFields),
  };
  const out = checkDiscriminatedUnion(decl, SITE);
  return {
    codes: out.map((d) => d.code),
    lines: out.map((d) => `${d.severity} ${d.code}: ${d.message}`),
  };
}

/** `Cat` with a well-formed string tag — the shape every seam row varies from. */
const CAT_TAGGED: UnionVariantSchema["fields"] = [
  { name: "kind", literal: { kind: "string", text: "cat" } },
  { name: "name" },
];

describe("b0046 (seam) — `checkDiscriminatedUnion` refuses a `by` field that does not resolve", () => {
  it("b0046-seam1: a `by` naming NO variant's field draws the new code", () => {
    // The sharpest statement of class 1: one call, both variants well-formed,
    // and the only fault is the clause's name. This is the cell the bug 0128
    // witness pinned as its non-goal boundary ("an ABSENT `by` field still
    // returns no diagnostic — the bug 0046 boundary"); this report owns that
    // boundary and moves it, which is why that sibling cell is authorized to
    // flip in the same commit.
    expect(seam(CAT_TAGGED, "ghost").codes).toEqual([ABSENT_FIELD]);
    expect(seam(CAT_TAGGED, "ghost").lines).toEqual([absentLine("ghost", "Animal")]);
  });

  it("b0046-seam2: HALF-present is the same class — §Fix constraint 2's `any`, not `every`", () => {
    // `Cat` declares no `kind` and `Dog` does. Detection rule 1 is "be present
    // in every variant" (docs/spec_topics/schemas.md §Discriminated unions), so
    // the named field fails it and the declaration refuses. A gate written on
    // "absent from EVERY variant" would leave this silent and red here — and
    // the half-present arrangements are precisely the ones that suppress live
    // rejections.
    expect(seam([{ name: "name" }], "kind").codes).toEqual([ABSENT_FIELD]);
    expect(seam([{ name: "name" }], "kind").lines).toEqual([absentLine("kind", "Animal")]);
  });

  it("b0046-seam3: GATE ORDER — a nested present occurrence keeps `nested-discriminator`", () => {
    // The new gate sits AFTER `anyNested`, which is a `.some`, so one nested
    // occurrence still answers first even though the field is absent from the
    // other variant. The `.some`/`.every` asymmetry the bug document's §Fix
    // constraint 2 names stays exactly where it is.
    const nested = seam([{ name: "kind", nested: true }, { name: "name" }], "kind");
    expect(nested.codes).toEqual([NESTED]);
    expect(nested.lines).toEqual([
      line(NESTED, [
        ["<field>", "kind"],
        ["<X>", "Animal"],
      ]),
    ]);
  });

  it("b0046-seam4: a field that RESOLVES everywhere is untouched, on both paths", () => {
    // The two controls the new gate must not reach: a well-formed explicit
    // discriminator stays clean, and the implicit path keeps
    // `theta/parse/missing-discriminator` for the same variants with no clause.
    expect(seam(CAT_TAGGED, "kind").codes).toEqual([]);
    expect(seam([{ name: "name" }], undefined).codes).toEqual([MISSING]);
    expect(seam([{ name: "name" }], undefined).lines).toEqual([
      line(MISSING, [["<X>", "Animal"]]),
    ]);
  });
});
