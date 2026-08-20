import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaDocument } from "../src/parser/theta-document";
import { annotationSourceIsNotTypeExpression } from "../src/parser/type-layer-checks";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0203 — `parseQuery`'s own `@<T>` annotation capture
// (src/parser/theta-document.ts, the `<`-guarded branch of `parseQuery`) is an
// inline `<` / `>` depth loop with NO stop set: every token that is not the
// depth-closing `>` is appended whole (`parts.push(this.advance().text)`) and
// the result is joined and trimmed. So `@<Ghost-->` captures the annotation
// text `"Ghost--"`, `Ghost--` is no `Ident` and therefore no `NamedType`
// (docs/spec_topics/grammar.md:98), `lowerTypeExpr`'s trailing catch-all
// (src/parser/params.ts) takes it, nothing lands in the `unresolved` sink, and
// `walkExpr`'s `"query"` arm reports NOTHING — while `@<Ghost>`, the same
// program with the trailer removed, draws
// `theta/parse/unresolved-named-type 'Ghost'` at one of that row's OWN five
// Trigger positions
// (docs/spec_topics/diagnostics/code-registry-parse.md, the
// `theta/parse/unresolved-named-type` row's Trigger names "the `@<T>` query
// annotation"). The junk-annotated query then lowers to the accept-anything
// `{}` and the producer reads a `{}` as TYPED, so QRY-22 is satisfied
// vacuously
// (docs/bugs/0203-query-annotation-junk-suppresses-unresolved-named-type.md).
//
// THE FIX'S DIRECTION, WHICH IS WHAT THIS FILE ASSERTS. The restoration is BY
// REFUSAL, not by making `unresolved-named-type` fire on non-`Ident` text —
// bug 0044's fix settled that direction at 0.54.0 and §Expected restates it
// ("the text is not a name, and it is also not a type"). An AUTHOR-WRITTEN
// `@<T>` ascription whose captured text derives from none of `Type`'s six
// alternatives draws exactly one new registered row,
// `theta/parse/query-annotation-type-not-expression` (E, parse), at the query
// expression's range, and the theta does not register. The judgement is bug
// 0124's landed recogniser `annotationSourceIsNotTypeExpression`
// (src/parser/type-layer-checks.ts, cited by SYMBOL rather than by line — the
// citation-drift class bug 0134 adjudicates as do-not-chase) — no second copy
// of the type-grammar verdict is written anywhere, and its two declines (the
// `[`/`]` decline and the brace-and-angle SHRED decline, both guards at the
// head of that same function, and the shared fragment decline
// `isUnspellableTextRefusable`, src/parser/params.ts) are inherited verbatim.
//
// WHY A ROW OF ITS OWN rather than a fourth position on bug 0124's
// `theta/parse/annotation-type-not-expression`: that row's Trigger states its
// unit as the whole captured annotation "naming the annotation's own binder",
// and THIS position has no binder — a bare `@<T>`…`` query STATEMENT declares
// nothing at all (group (i)'s bare-statement cell is that proof, and it is why
// the new row's Message is placeholder-free). Its placeholder-free sibling at
// this same capture is `theta/parse/empty-query-annotation` (bug 0014),
// emitted ~14 lines from the capture loop.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/type-system.md:15 — "The same type grammar applies in
//     every type-annotation position: schema fields, frontmatter `params:`,
//     `let x: T`, function parameters, and `@<T>`", and "Text that derives
//     from none of the forms above is refused at load or parse time rather
//     than admitted as a nominal reference". The `@<T>` position is named by
//     the first clause and omitted from the row enumeration that follows.
//   - docs/spec_topics/grammar.md:105 — the bare-`Type` position list
//     including type-ascription contexts, plus "The grammar is otherwise
//     identical in every position"; `:98` `NamedType ::= Ident`.
//   - docs/spec_topics/query/query-failure-and-repair.md:78 (QRY-22) — the
//     runtime MUST NOT bind an unvalidated response as a typed query's value.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the
//     registry is CLOSED, so the refusal needs a row, which is the fix's to
//     mint) and `:74` (DIAG-4 — the *Message* column is normative, which is
//     why every expected message below is READ from the committed registry at
//     runtime and none is restated).
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15) and
//     `:9` (the loads-cleanly predicate every refusal fixture below satisfies
//     TODAY). Of the 34 committed `.theta`/`.thetalib` fixtures, 2 write an
//     `@<…>` annotation and both are well-formed, so no committed input
//     changes disposition.
//
// TIER: unit, offline, deterministic, provider-free, zero model turns. Every
// claim settles inside one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts — the shipped front end wrapped in the standard inert
// deps double), one call of bug 0124's recogniser at its own exported seam, or
// one read of the committed registry pages. An integration tier observes
// nothing more: the subject is which diagnostics a load emits for a given
// annotation text, fully determined before any turn runs. The ONE observable a
// unit row cannot reach — a real slash command that stops being created,
// because `hasLoadParseError` (src/extension/production-composition.ts) denies
// registration on any error-severity `theta/parse/*` row — is carried by the
// additive H8a cell in tests/live/live-production-acceptance.test.ts whose
// title carries the token `CELL-B`.
//
// WHAT IS RED HERE, AND WHY. Two distinct reasons, and each cell's title says
// which:
//   - RED (missing behaviour) — groups (a2 / a1), (b), (c), (h) and (i): the
//     annotation loads with ZERO diagnostics today, which IS the defect. Each
//     of those cells asserts the registry-FREE `severity code` sequence FIRST,
//     so its red names the absent diagnostic (the bug's symptom) rather than
//     the absent registry row.
//   - RED (missing row) — group (j) only: the registry carries no row for
//     `theta/parse/query-annotation-type-not-expression` at HEAD, so the
//     DIAG-4 reader FAILS LOUDLY naming exactly what is absent. DIAG-2 makes
//     minting the row part of the fix, not of this witness.
// EVERYTHING ELSE IS GREEN AT HEAD AND MUST STAY GREEN: groups (a3)–(a5),
// (d), (e), (f), (g) and (k) are the channel-liveness proofs, the precedence
// fences, bug 0028's legal-annotation controls and the 0204 boundary.
//
// NO SILENT SKIPPING: every reader THROWS, naming the absent intermediate,
// when the registry row is missing, when the body declares no query, or when
// the capture handed the position no text. A fixture that never reached the
// position under test can never be mistaken for a pass.

// ===========================================================================
// The code this refusal needs, and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

/**
 * The row bug 0203's fix mints. Cited by CODE and page rather than by line:
 * the fix inserts a row on `code-registry-parse.md` and shifts every later
 * row's line number, which is exactly the citation drift bug 0134 adjudicates
 * as the do-not-chase class.
 */
const CODE = "theta/parse/query-annotation-type-not-expression";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
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
 * A registry row's normative *Message* template (DIAG-4), read rather than
 * restated. THROWS, naming the missing row and the page it belongs on, so a
 * missing row can never degrade an assertion below into a comparison against
 * `undefined` and can never be silently replaced by a hard-coded string.
 * Called only from inside a test body: at module scope a throw would abort
 * collection and take this file's green fences down with it.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes that column this file's ` +
        `only oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. DIAG-2 (:72) makes minting the row part of bug 0203's fix, in ` +
        `the same commit as the site it is raised from ` +
        `(docs/spec_topics/diagnostics/code-registry-parse.md)`,
    );
  }
  return template;
}

/** One structured registry row, or a loud failure naming the code. */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness: the parsed registry holds no structured row for ${code}; DIAG-2 requires the ` +
        `code and its row to land together, so this refusal has no registry authority yet`,
    );
  }
  return row;
}

/** The `<…>` placeholders a template renders, in source order. */
function placeholdersOf(template: string): string[] {
  return template.match(/<[a-zA-Z][a-zA-Z0-9-]*>/g) ?? [];
}

/**
 * One `error <code>: <message>` line, rendering a registry template by
 * explicit slot substitution. Each slot's presence in the live template is
 * asserted first, so a reworded row reds by naming the slot instead of
 * silently leaving an unsubstituted placeholder in the expectation.
 */
function line(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessageOf(code);
  let out = template;
  for (const [slot, value] of subs) {
    expect(
      template,
      `DIAG-4: the ${code} row's Message must still carry the ${slot} slot this file renders; ` +
        `observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return `error ${code}: ${out}`;
}

/** One `error <code>: <message>` line for a placeholder-free registry row. */
function plainLine(code: string): string {
  const template = registryMessageOf(code);
  expect(
    placeholdersOf(template),
    `DIAG-4: the ${code} row's Message renders no placeholder, so this file substitutes none; ` +
      `observed template ${JSON.stringify(template)}`,
  ).toEqual([]);
  return `error ${code}: ${template}`;
}

/**
 * One `error <code>: <message>` line for a row whose Message carries LITERAL
 * `<…>`-shaped source text a placeholder-shaped regex cannot distinguish from a
 * slot — `theta/parse/empty-query-annotation` spells `@<>` and `@<Schema>` in
 * its own Message. The placeholder-SET assertion is therefore not applied here;
 * the template is still read from the registry, never restated (DIAG-4).
 */
function literalLine(code: string): string {
  const template = registryMessageOf(code);
  expect(
    template,
    `DIAG-4: the ${code} row's Message is rendered verbatim by this file, so it must carry no ` +
      `slot this file would have to substitute; observed template ${JSON.stringify(template)}`,
  ).not.toContain("<name>");
  return `error ${code}: ${template}`;
}

/**
 * The refusal's rendered line. Placeholder-FREE by decision: the `@<T>`
 * position has no binder to name, so there is nothing source-derived for the
 * Message to render — the same shape this capture's sibling
 * `theta/parse/empty-query-annotation` (bug 0014) already carries.
 */
function refusalLine(): string {
  return plainLine(CODE);
}

// ===========================================================================
// Fixtures and the loud readers.
// ===========================================================================

/** `Cat` is declared in the fixtures that need a resolvable name; `Ghost` is declared nowhere. */
const DECLS = "schema Cat { a: string }\n";

/** The prompt-mode frontmatter prelude. */
const FM = "---\nmode: prompt\n---\n";

/**
 * One author-written `@<annotation>` ascription on a `let`-bound query, in a
 * theta that is otherwise well-formed. `decls` is written only where a fixture
 * needs `Cat` resolvable — an unused declaration is inert, but leaving it out
 * of the `Ghost` fixtures keeps each diagnostic list attributable to the
 * annotation alone.
 */
function queryTheta(annotation: string, decls = ""): string {
  return `${FM}${decls}let r = @<${annotation}>\`hi\`\nr\n`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * Every diagnostic rendered `<severity> <code>`, in emission order — the
 * REGISTRY-FREE half of a refusal expectation. Asserted BEFORE the rendered
 * message on every refusal cell so the red at HEAD names the symptom the bug
 * reports (an annotation that draws nothing at all) rather than the absent
 * registry row, which is a separate, separately-titled red.
 */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/**
 * Every `QueryExpr.schema` in the document, in traversal order. A `QueryExpr`
 * is discriminated from the statement-level `{kind:"query"}` wrapper by its
 * own `template` field, which only the expression carries — without that the
 * bare-statement fixture in group (i) would read the wrapper's absent
 * `schema` and the assertion would compare against `undefined`.
 */
function queryAnnotationsOf(doc: ThetaDocument): (string | null)[] {
  const found: (string | null)[] = [];
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj["kind"] === "query" && "template" in obj) {
      found.push((obj["schema"] as string | null) ?? null);
    }
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else {
        visit(value);
      }
    }
  };
  visit(doc.body as unknown);
  return found;
}

/**
 * The annotation text the sole query in the body actually captured, loud on
 * every way a fixture can fail to reach the capture. Without this the
 * diagnostic assertions below could pass against a parse that never handed the
 * position any text.
 */
function capturedAnnotation(label: string, doc: ThetaDocument): string {
  const annotations = queryAnnotationsOf(doc);
  if (annotations.length !== 1) {
    throw new Error(
      `${label}: the body holds ${annotations.length} query expression(s), not one, so the ` +
        `annotation under test cannot be attributed; statement kinds ` +
        `${JSON.stringify(doc.body.statements.map((s) => s.kind))}, diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  const captured = annotations[0];
  if (captured === undefined || captured === null || captured.length === 0) {
    throw new Error(
      `${label}: the query carries no captured annotation (${JSON.stringify(captured)}), so the ` +
        `\`@<T>\` position was never handed the text under test; diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  return captured;
}

/**
 * One annotation draws EXACTLY the refusal and nothing else. The
 * registry-free code sequence is asserted first (the bug's symptom is the
 * ABSENT diagnostic), then the DIAG-4-sourced message.
 */
function expectRefusedAlone(label: string, src: string, path = "bug0203.theta"): void {
  const doc = parseDoc(src, path);
  capturedAnnotation(label, doc);
  expect(
    diagCodes(doc),
    `${label}: text the \`Type\` production does not derive must draw exactly one ` +
      `error-severity ${CODE} at the \`@<T>\` position, which type-system.md:15 names in its ` +
      `five-position list. Observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([`error ${CODE}`]);
  expect(
    diagLines(doc),
    `${label}: the rendered message is the registry's (DIAG-4), not this file's`,
  ).toEqual([refusalLine()]);
}

// ===========================================================================
// (a) THE SUPPRESSION PAIR AND ITS CONTROLS — §Reproduction (a).
// a1 / a2 are RED (missing behaviour); a3–a5 are the channel-liveness proofs
// and are GREEN at HEAD and after the fix alike, which is what makes a1's and
// a2's sequences measurements rather than dead channels.
// ===========================================================================

describe("bug 0203 (a) — the suppression pair and the two live channels at this capture", () => {
  it("RED (a1, missing behaviour): `@<Ghost-->` draws the refusal", () => {
    // §Reproduction (a) row 2, the defect: `[]` at HEAD. `Ghost--` is no
    // `Ident`, so the catch-all takes it and the position's only
    // name-resolution channel never sees it.
    expectRefusedAlone("a1 (@<Ghost-->)", queryTheta("Ghost--"));
  });

  it("RED (a2, missing behaviour): `@<Cat-->` draws the refusal even though `Cat` is declared", () => {
    // §Reproduction (a) row 4. The declared-name spelling is the sharper half:
    // one trailing character on a correctly-spelled, DECLARED schema name is
    // what turns the QRY-22 gate from 1-of-6 to 6-of-6 probe payloads
    // (§Reproduction (f)).
    expectRefusedAlone("a2 (@<Cat-->)", queryTheta("Cat--", DECLS));
  });

  it("GREEN (a3, control): `@<Ghost>` still draws `unresolved-named-type 'Ghost'`", () => {
    // The row whose Trigger already names this position. The fix must not
    // remove it: the refusal is for text that is not a NAME, and `Ghost` is
    // one.
    const doc = parseDoc(queryTheta("Ghost"), "bug0203.theta");
    expect(capturedAnnotation("a3", doc)).toBe("Ghost");
    expect(
      diagLines(doc),
      "a3: `theta/parse/unresolved-named-type`'s Trigger names the `@<T>` query annotation as " +
        "one of its five positions; an `Ident` that resolves to no declaration keeps that row",
    ).toEqual([line("theta/parse/unresolved-named-type", [["<name>", "Ghost"]])]);
  });

  for (const [index, interior] of ["", "  "].entries()) {
    it(`GREEN (a${4 + index}, control): \`@<${interior}>\` still draws \`empty-query-annotation\` alone`, () => {
      // Bug 0014 owns the EMPTY interior of this same capture and its guard
      // tests `schema.length === 0`; every input this file refuses is
      // non-empty, and bug 0124's recogniser declines the empty source
      // outright, so the two judgements cannot both fire.
      const doc = parseDoc(queryTheta(interior), "bug0203.theta");
      expect(
        diagLines(doc),
        `a${4 + index}: the empty interior is bug 0014's answer and this fix does not give a ` +
          `second one`,
      ).toEqual([literalLine("theta/parse/empty-query-annotation")]);
    });
  }
});

// ===========================================================================
// (b) THE TRAILER SWEEP — the 24 trailers §Reproduction (h) records as REFUSED
// by bug 0124's recogniser, at the name `Ghost`, plus the trailing NUMBER
// literal that sweep omits and the registry row's Trigger names (`Ghost1.5`).
// RED (missing behaviour): every one loads with zero diagnostics at HEAD. The 3
// trailers §Reproduction (h) records as ADMITTED are NOT here: `1` leaves an
// `Ident` and keeps `unresolved-named-type` (group (f), cell f9), and `{` / `}`
// are the shared brace decline's, pinned silent in group (g).
// ===========================================================================

/**
 * The 24 refused trailers of §Reproduction (h), in the document's order: the
 * 21 punctuation-and-literal trailers plus the 3 members of `parseType`'s own
 * structural stop set that this capture — which has no stop set at all — joins
 * instead of ending on. (`}` and `{` are the fourth and fifth stop-set members
 * and are excluded here: the recogniser's shared brace decline admits them,
 * and group (g) pins that.) The trailing NUMBER literal closes the list: the
 * registry row's Trigger names `Ghost1.5` as refused and `Ghost1` as excluded
 * for being `Ident`-shaped, so the refused half needs a cell of its own here
 * — the excluded half is f9's — and §Reproduction (h)'s sweep carries neither.
 */
const REFUSED_TRAILERS: readonly string[] = [
  "--",
  "++",
  "-",
  "+",
  "%",
  "*",
  "/",
  ".",
  "==",
  "&&",
  "||",
  "?",
  "!",
  ":",
  "|",
  "~",
  "^",
  "@",
  "#",
  "$",
  '"x"',
  ",",
  ")",
  "=",
  "1.5",
];

describe("bug 0203 (b) — the trailer sweep at the name `Ghost`", () => {
  for (const [index, trailer] of REFUSED_TRAILERS.entries()) {
    const annotation = `Ghost${trailer}`;
    it(`RED (b${index + 1}, missing behaviour): \`@<${annotation}>\` draws exactly one refusal`, () => {
      // Anti-vacuity, per trailer: the recogniser's own answer is asserted
      // beside the parse so a cell can never red because the trailer failed to
      // JOIN the capture (the `;` and `\\` trailers never reach it — the lexer
      // rejects the token first — and are outside this sweep for that reason).
      const doc = parseDoc(queryTheta(annotation), "bug0203.theta");
      const captured = capturedAnnotation(`b${index + 1} (@<${annotation}>)`, doc);
      expect(
        annotationSourceIsNotTypeExpression(captured),
        `b${index + 1}: bug 0124's landed recogniser must answer \`true\` for the captured text ` +
          `${JSON.stringify(captured)}; if it does not, this trailer is outside the refused set ` +
          `§Reproduction (h) measured and the cell is mis-specified, not the code`,
      ).toBe(true);
      expectRefusedAlone(`b${index + 1} (@<${annotation}>)`, queryTheta(annotation));
    });
  }
});

// ===========================================================================
// (c) THE SPELLINGS — leading, interior, doubled, spaced, bare, and one level
// down inside a `GenericType` argument, a union arm and an inline `ObjectType`
// field. RED (missing behaviour): every one loads with zero diagnostics at
// HEAD. Each row's captured text was MEASURED against the recogniser's actual
// declines before it was written here, and the cell re-asserts that answer.
// ===========================================================================

/** Spelling, and the text the capture actually materialises for it. */
const SPELLINGS: ReadonlyArray<readonly [string, string]> = [
  ["--Ghost", "--Ghost"],
  ["Gho--st", "Gho--st"],
  ["Ghost--%%", "Ghost--%%"],
  // The capture joins token TEXT, so the interior space is dropped.
  ["Ghost --", "Ghost--"],
  ["--", "--"],
  // One level down, and each admitted by the SHRED decline's own terms: an
  // angle-only text carries no brace, a brace-only text carries no angle, and
  // neither carries `[` or `]`. A text carrying BOTH — `array<{a: Ghost--}>` —
  // would be ADMITTED and stay silent, which is why no such row is here.
  ["array<Ghost-->", "array<Ghost-->"],
  ["Ghost-- | string", "Ghost--|string"],
  ["{a: Ghost--}", "{a:Ghost--}"],
];

describe("bug 0203 (c) — the leading, interior, doubled, spaced, bare and one-level-down spellings", () => {
  for (const [index, [annotation, captured]] of SPELLINGS.entries()) {
    it(`RED (c${index + 1}, missing behaviour): \`@<${annotation}>\` draws exactly one refusal`, () => {
      const label = `c${index + 1} (@<${annotation}>)`;
      const doc = parseDoc(queryTheta(annotation), "bug0203.theta");
      expect(
        capturedAnnotation(label, doc),
        `${label}: the capture's materialised text is what the refusal judges, so it is pinned ` +
          `here — a capture that changed would otherwise silently move the subject`,
      ).toBe(captured);
      expect(
        annotationSourceIsNotTypeExpression(captured),
        `${label}: bug 0124's recogniser must answer \`true\` for ${JSON.stringify(captured)} — ` +
          `if it declines, this spelling belongs in the silent group (g) and not here`,
      ).toBe(true);
      expectRefusedAlone(label, queryTheta(annotation));
    });
  }
});

// ===========================================================================
// (d) CONSTRAINT (b)(5) — an annotation whose own position-rule walk
// (`parseTypeExpression(responseAnnotation, "value", …)`) already drew an
// error-severity diagnostic keeps that diagnostic ALONE and draws no refusal.
// GREEN at HEAD and after the fix; these are the fences that catch a route
// that emits unconditionally. Two of the four are additionally under the
// recogniser's brace decline, and the cell says which.
// ===========================================================================

describe("bug 0203 (d) — the position's own rules keep firing, and keep firing alone", () => {
  const OWN_RULE_ROWS: ReadonlyArray<readonly [string, string, string]> = [
    [
      "void--",
      "error theta/parse/void-in-non-return-position",
      "the `void` position rule is unaffected by the trailer, and the recogniser DOES refuse " +
        "`void--`, so this cell is the precedence guard proper",
    ],
    [
      "array<string, integer>--",
      "error theta/parse/generic-arity-mismatch",
      "generic arity is decided on the parsed application, and the recogniser DOES refuse " +
        "`array<string,integer>--`, so this cell is the precedence guard proper",
    ],
    [
      "{}--",
      "error theta/parse/empty-schema-body",
      "doubly held: the position rule fires, AND the recogniser's shared brace decline admits " +
        "the text, so no refusal is reachable here by either path",
    ],
    [
      "{a: string, a: integer}--",
      "error theta/parse/duplicate-inline-field-name",
      "doubly held, as `{}--` is: the inline-object rule fires and the brace decline admits",
    ],
  ];

  for (const [index, [annotation, expectedCode, why]] of OWN_RULE_ROWS.entries()) {
    it(`GREEN (d${index + 1}): \`@<${annotation}>\` keeps its own position rule alone`, () => {
      const doc = parseDoc(queryTheta(annotation), "bug0203.theta");
      capturedAnnotation(`d${index + 1}`, doc);
      expect(
        diagCodes(doc),
        `d${index + 1}: ${why}. Observed ${JSON.stringify(diagLines(doc))}`,
      ).toEqual([expectedCode]);
      expect(
        diagCodes(doc),
        `d${index + 1}: constraint (b)(5) — an annotation that already drew an error-severity ` +
          `row from its own walk draws NO refusal beside it`,
      ).not.toContain(`error ${CODE}`);
    });
  }
});

// ===========================================================================
// (e) CONSTRAINT (b)(6) — the PROPAGATED route does not double up. `parseLet`'s
// `let x: T = @`…`` propagation writes `QueryExpr.schema` on a query that
// carried NO ascription of its own, and at that route the junk text is the
// `let` annotation's and is ALREADY refused there by bug 0124's
// `theta/parse/annotation-type-not-expression`. GREEN at HEAD and after the
// fix; these are the cells the `ascriptionWritten` carrier exists for.
// ===========================================================================

describe("bug 0203 (e) — the propagated `let`-annotation route keeps exactly one refusal", () => {
  it("GREEN (e1): `let r: Ghost-- = @`hi`` keeps bug 0124's row at the `let` position alone", () => {
    const doc = parseDoc(`${FM}let r: Ghost-- = @\`hi\`\nr\n`, "bug0203.theta");
    expect(
      capturedAnnotation("e1", doc),
      "e1: the propagation must still have written the annotation onto the query — otherwise " +
        "this cell would pin nothing about the double-emission it exists to forbid",
    ).toBe("Ghost--");
    expect(
      diagLines(doc),
      "e1: constraint (b)(6) — the junk is the `let` annotation's text and bug 0124's row " +
        "already refused it at that position; a second refusal at the query would double up on " +
        "one statement",
    ).toEqual([line("theta/parse/annotation-type-not-expression", [["<name>", "r"]])]);
    expect(diagCodes(doc), "e1: no refusal at the query").not.toContain(`error ${CODE}`);
  });

  it("GREEN (e2): `let r: Result<Ghost, QueryError> = @`hi`` still peels to `unresolved-named-type 'Ghost'`", () => {
    // The `Result` peel comes FIRST (constraint (b)(6)): the raw text names
    // `QueryError`, the builtin the peel exists to protect. The peeled `Ghost`
    // is an `Ident`, so it keeps the name row and draws no refusal.
    const doc = parseDoc(`${FM}let r: Result<Ghost, QueryError> = @\`hi\`\nr\n`, "bug0203.theta");
    expect(capturedAnnotation("e2", doc)).toBe("Result<Ghost,QueryError>");
    expect(
      diagLines(doc),
      "e2: a route that judged `e.schema` instead of `queryResponseAnnotation(e.schema)`'s " +
        "output would change this row",
    ).toEqual([line("theta/parse/unresolved-named-type", [["<name>", "Ghost"]])]);
  });
});

// ===========================================================================
// (f) CONSTRAINT (b)(9) — bug 0028's legal-annotation controls, plus the two
// `Ident` spellings bug 0044's rule protects. GREEN at HEAD and after the fix.
// These are the over-refusal fences: the refusal can only ever refuse LESS
// than the sibling rows do, never more.
// ===========================================================================

describe("bug 0203 (f) — grammar-admitted annotations keep their bytes and their silence", () => {
  const SILENT_LEGAL: readonly string[] = [
    "{a: string, b: integer, c: boolean}",
    // The SHRED decline's own subject: the angle-only split shreds this brace
    // group and the middle shard is refusable on its own, so a route through
    // the sink's fourth out-parameter would FALSELY refuse it. Route (b)(1)
    // inherits the decline and this row stays `[]`.
    "array<{a: string, b: integer, c: boolean}>",
    "array<Cat>",
    "Cat | integer",
    '"a" | "b"',
    "array<string>",
    "Cat",
    "integer",
  ];

  for (const [index, annotation] of SILENT_LEGAL.entries()) {
    it(`GREEN (f${index + 1}): \`@<${annotation}>\` stays silent`, () => {
      const doc = parseDoc(queryTheta(annotation, DECLS), "bug0203.theta");
      capturedAnnotation(`f${index + 1}`, doc);
      expect(
        diagCodes(doc),
        `f${index + 1}: a legal annotation draws nothing here before or after the fix — bug ` +
          `0028's witness (tests/unresolved-annotation-lowering.test.ts, \`SILENT (v)\` and the ` +
          `\`RESULT-LET-BRACE\` family) pins the same class`,
      ).toEqual([]);
    });
  }

  const IDENT_SHAPED: readonly string[] = ["Ghost1", "thisisnotatype"];

  for (const [index, annotation] of IDENT_SHAPED.entries()) {
    it(`GREEN (f${9 + index}): \`@<${annotation}>\` keeps \`unresolved-named-type\`, not the refusal`, () => {
      // Both are `Ident`s, hence `NamedType`s (grammar.md:98), hence derivable
      // from `Type`. Refusing them would be the honest-identity overreach bug
      // 0044's fix removed at 0.54.0; their disposition is
      // `unresolved-named-type`'s, which is exactly what fires.
      const doc = parseDoc(queryTheta(annotation), "bug0203.theta");
      expect(capturedAnnotation(`f${9 + index}`, doc)).toBe(annotation);
      expect(
        annotationSourceIsNotTypeExpression(annotation),
        `f${9 + index}: bug 0124's recogniser must DECLINE an \`Ident\``,
      ).toBe(false);
      expect(
        diagLines(doc),
        `f${9 + index}: an \`Ident\` that resolves to no declaration is a name question, not a ` +
          `grammar question`,
      ).toEqual([line("theta/parse/unresolved-named-type", [["<name>", annotation]])]);
    });
  }
});

// ===========================================================================
// (g) THE R10 / BUG 0204 BOUNDARY. `@<Ghost{>` and `@<Ghost}>` stay SILENT
// under bug 0124's SHARED brace decline, which every sibling position carries
// too. This fix inherits that decline verbatim and writes no second copy, so
// the shred-decline boundary — the sentence saying `[`/`]`-carrying or
// brace-and-angle text is ADMITTED because `splitTopLevel` never tracks
// bracket depth — is left exactly as landed. Narrowing it is bug 0204's
// subject (docs/bugs/0204-bracket-blind-split-shreds-inline-object-in-generic.md),
// NOT this fix's, and these cells are the pins bug 0204 must re-derive.
// GREEN at HEAD and after the fix.
// ===========================================================================

describe("bug 0203 (g) — the shared brace decline's admissions stay silent (bug 0204's boundary)", () => {
  for (const [index, annotation] of ["Ghost{", "Ghost}"].entries()) {
    it(`GREEN (g${index + 1}, bug 0204 boundary): \`@<${annotation}>\` stays silent`, () => {
      const doc = parseDoc(queryTheta(annotation), "bug0203.theta");
      expect(capturedAnnotation(`g${index + 1}`, doc)).toBe(annotation);
      expect(
        annotationSourceIsNotTypeExpression(annotation),
        `g${index + 1}: the decline is the SHARED one (isUnspellableTextRefusable, ` +
          `src/parser/params.ts) — bug 0203 inherits it and narrowing it in either direction is ` +
          `out of scope`,
      ).toBe(false);
      expect(
        diagCodes(doc),
        `g${index + 1}: §Reproduction (h) records these two as ADMITTED, and R10 pins them as ` +
          `bug 0204's surface rather than this fix's`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (h) CONSTRAINT (b)(7) — the capture over-run's STATED disposition. `@<Ghost`
// never closes, so the loop swallows the rest of the file into the annotation
// and materialises `"Ghost\nr"`; the recogniser answers `true` for that text,
// so the refusal FIRES, and its range is the query expression's — spanning the
// swallowed tail. The capture's EXTENT mechanics stay §Non-goals: this cell
// states the disposition and owns nothing about the loop.
// RED (missing behaviour): `[]` at HEAD.
// ===========================================================================

describe("bug 0203 (h) — the unterminated capture's stated disposition", () => {
  it("RED (h1, missing behaviour): `let r = @<Ghost` swallows the tail and the swallowed text is refused", () => {
    const src = `${FM}let r = @<Ghost\nr\n`;
    const doc = parseDoc(src, "bug0203.theta");
    expect(
      capturedAnnotation("h1", doc),
      "h1: the over-run is what makes this a stated disposition rather than an ordinary trailer " +
        "row — the captured text is the file tail, not an author-written type",
    ).toBe("Ghost\nr");
    expect(
      annotationSourceIsNotTypeExpression("Ghost\nr"),
      "h1: §Reproduction (h) records the recogniser answering `true` for the over-run capture",
    ).toBe(true);
    expectRefusedAlone("h1 (unterminated `@<Ghost`)", src);
  });
});

// ===========================================================================
// (i) INVARIANCE — the pair holds in every enclosing form §Reproduction (c)
// measures: an ordinary `fn` body, a `.thetalib`, `mode: subagent`, a `match`
// scrutinee (QRY-4's required-ascription position), and a BARE query
// statement. Each subject is paired with its `@<Ghost>` control in the same
// cell, so a fixture that failed to reach the position reds on the control.
// RED (missing behaviour) on every subject.
//
// The bare-statement row is the one with NO binder anywhere on the statement:
// it is why the new row's Message is placeholder-free and why widening bug
// 0124's `<name>`-rendering row to this position would have nothing to render.
// ===========================================================================

describe("bug 0203 (i) — the refusal is invariant across the enclosing forms", () => {
  const FORMS: ReadonlyArray<{
    readonly label: string;
    readonly path: string;
    readonly build: (annotation: string) => string;
  }> = [
    {
      label: "an ordinary `fn` body",
      path: "bug0203.theta",
      build: (a) =>
        `${FM}fn g(): string { let r = @<${a}>\`hi\`\n"s" }\nlet inert = 1\ninert\n`,
    },
    {
      label: "a `.thetalib`",
      path: "bug0203.thetalib",
      build: (a) => `fn g(): string { let r = @<${a}>\`hi\`\n"s" }\n`,
    },
    {
      label: "`mode: subagent`",
      path: "bug0203.theta",
      build: (a) => `---\nmode: subagent\n---\nlet r = @<${a}>\`hi\`\nr\n`,
    },
    {
      label: "a `match` scrutinee",
      path: "bug0203.theta",
      build: (a) =>
        `${FM}let s = match @<${a}>\`hi\` { Ok(v) => "a", Err(e) => "b" }\ns\n`,
    },
  ];

  for (const [index, form] of FORMS.entries()) {
    it(`RED (i${index + 1}, missing behaviour): inside ${form.label}, \`@<Ghost-->\` draws the refusal`, () => {
      const label = `i${index + 1} (${form.label})`;
      // The control FIRST: if the enclosing form never reached the `@<T>`
      // walk at all, this reds instead of the subject silently "passing".
      const control = parseDoc(form.build("Ghost"), form.path);
      expect(
        diagLines(control),
        `${label}: the control proves the \`@<T>\` walk runs in this enclosing form; without it ` +
          `the subject's sequence would be a dead channel rather than a measurement`,
      ).toEqual([line("theta/parse/unresolved-named-type", [["<name>", "Ghost"]])]);
      expectRefusedAlone(label, form.build("Ghost--"), form.path);
    });
  }

  it("RED (i5, missing behaviour): a BARE query statement's `@<Ghost-->` draws the refusal beside `discarded-query-result`", () => {
    // The no-binder case. `discarded-query-result` is emitted ahead of
    // `walkExpr`'s query arm — the control below pins that order — so the
    // refusal takes the slot `unresolved-named-type` occupies in the control.
    const control = parseDoc(`${FM}@<Ghost>\`hi\`\nlet inert = 1\ninert\n`, "bug0203.theta");
    expect(
      diagLines(control),
      "i5: the control pins both the live channel and the emission ORDER the subject's sequence " +
        "below depends on",
    ).toEqual([
      plainLine("theta/parse/discarded-query-result"),
      line("theta/parse/unresolved-named-type", [["<name>", "Ghost"]]),
    ]);

    const src = `${FM}@<Ghost-->\`hi\`\nlet inert = 1\ninert\n`;
    const doc = parseDoc(src, "bug0203.theta");
    expect(capturedAnnotation("i5", doc)).toBe("Ghost--");
    expect(
      diagCodes(doc),
      "i5: a bare query statement declares NOTHING — no `let`, no parameter, no `fn` — so the " +
        "refusal has no binder to name and its Message is placeholder-free. Observed " +
        JSON.stringify(diagLines(doc)),
    ).toEqual(["error theta/parse/discarded-query-result", `error ${CODE}`]);
    expect(diagLines(doc), "i5: both messages are the registry's (DIAG-4)").toEqual([
      plainLine("theta/parse/discarded-query-result"),
      refusalLine(),
    ]);
  });
});

// ===========================================================================
// (j) DIAG-2 / DIAG-4 — the registry row this refusal needs, and the oracle
// discipline this whole file rests on. RED (missing row) at HEAD: the row is
// the fix's to mint in the same commit as the site it is raised from.
// ===========================================================================

describe("bug 0203 (j) — the registry row this refusal needs (DIAG-2 / DIAG-4)", () => {
  it(`RED (j1, missing row): the registry carries a row for ${CODE}`, () => {
    // DIAG-2 (diagnostic-shape.md:72) closes the registry: a diagnostic with
    // no row has no authority to exist, and a row with no asserting test fails
    // the same gate from the other side (tests/code-registry.test.ts). This
    // file is the asserting test.
    const row = registryRowOf(CODE);
    expect(
      row.namespace,
      "the judgement is made while parsing the body, so it lives in the `parse` namespace — " +
        "which is also what `hasLoadParseError` reads to withhold registration",
    ).toBe("parse");
    expect(
      row.severity,
      "source-language-stability.md:9 reads effective severity off the *Severity* column; a `W` " +
        "row would leave the ascription unenforced with a note attached and QRY-22 still " +
        "vacuously satisfied",
    ).toBe("E");
    expect(row.phase, "the judgement is made during the body parse, not at runtime").toBe("parse");
  });

  it("RED (j2, missing row): the *Message* is PLACEHOLDER-FREE", () => {
    // The placeholder SET is pinned, not merely its emptiness by accident: a
    // `<name>`-style slot would be unrenderable at this position (group (i)'s
    // bare-statement cell has no binder anywhere on the statement), and any
    // junk-TEXT slot would be admissible under no category of a CLOSED surface
    // and would raise the GOV-7 / GOV-8 question bug 0061's fix record
    // rejected `<text>` over. Placeholder-free means the row adds no entry to
    // the placeholder table and needs no sub-rule.
    expect(
      placeholdersOf(registryMessageOf(CODE)),
      "the row renders no placeholder, exactly as this capture's sibling " +
        "`theta/parse/empty-query-annotation` (bug 0014) does",
    ).toEqual([]);
  });

  it("RED (j3, missing row): every code this file renders a message for has a registry row", () => {
    // The oracle discipline: no message in this file is restated (DIAG-4).
    // This cell fails loudly naming the FIRST absent row rather than letting a
    // per-cell throw obscure which oracle is missing.
    for (const code of [
      CODE,
      "theta/parse/unresolved-named-type",
      "theta/parse/empty-query-annotation",
      "theta/parse/void-in-non-return-position",
      "theta/parse/generic-arity-mismatch",
      "theta/parse/empty-schema-body",
      "theta/parse/duplicate-inline-field-name",
      "theta/parse/annotation-type-not-expression",
      "theta/parse/discarded-query-result",
    ]) {
      expect(
        typeof registryMessageOf(code),
        `every expected message in this file is read from the registry at runtime; ${code} is ` +
          `one of its oracles`,
      ).toBe("string");
    }
  });
});

// ===========================================================================
// (k) THE JUDGEMENT AT ITS OWN SEAM — bug 0124's landed recogniser over the
// texts this position's capture produces. GREEN at HEAD: the answer is already
// computed and the `@<T>` call site is the one that never asks. This group is
// the anti-vacuity floor for the whole file — if it reds, the fix's route
// (b)(1) is unavailable and every RED above is mis-specified.
// ===========================================================================

describe("bug 0203 (k) — bug 0124's recogniser already answers for this position's texts", () => {
  it("GREEN (k1): the refused texts", () => {
    for (const text of ["Ghost--", "Cat--", "--", "match--", "array<Ghost-->", "{a:Ghost--}"]) {
      expect(
        annotationSourceIsNotTypeExpression(text),
        `k1: \`${text}\` derives from none of \`Type\`'s six alternatives, so route (b)(1) has ` +
          `its verdict without writing a second copy of the type-grammar judgement`,
      ).toBe(true);
    }
  });

  it("GREEN (k2): the admitted texts, both declines", () => {
    for (const text of [
      "Ghost",
      "Cat",
      "Ghost1",
      "thisisnotatype",
      // The shared brace decline.
      "Ghost{",
      "Ghost}",
      // The SHRED decline: brace AND angle.
      "array<{a: string, b: integer, c: boolean}>",
      // The empty decline — bug 0014's interior, which this fix does not touch.
      "",
    ]) {
      expect(
        annotationSourceIsNotTypeExpression(text),
        `k2: \`${text}\` is admitted, so no refusal is reachable for it and the corresponding ` +
          `silence cell above is a property of the recogniser, not of the emission point`,
      ).toBe(false);
    }
  });
});
