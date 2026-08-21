// Bug 0222 — `checkLetMismatch` converts a REFUSED `let` annotation directly
// instead of consulting the `theta/parse/annotation-type-not-expression`
// withhold, so `let a: array<integer--> = @<integer>`x`` draws
// `theta/parse/explicit-schema-mismatch` (W) beside the refusal, where the same
// binding with the annotation OMITTED draws nothing on that channel
// (docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md).
//
// THE SITE. `checkLetMismatch` — a private method of `QuerySchemaResolveWalk`
// in src/parser/query-schema-resolve.ts, called from `rewriteStmt`'s
// `case "let"` — guards on an empty annotation, on an initialiser that is not a
// (wrapped) query (`query.schema === null`), and on an `undefined` conversion
// result, then calls `annotationToCompatType(annotationSource)` and pushes
// `checkExplicitSchemaMismatch`'s verdict. None of the three guards is the
// type-grammar judgement, and the file consults
// `annotationSourceIsNotTypeExpression` (exported from
// src/parser/type-layer-checks.ts beside `annotationToCompatType`) nowhere.
// `annotationToCompatType`'s final arm maps unrecognised text to
// `{kind:"named"}`, so `array<integer-->` becomes a well-formed `array` whose
// element is unresolvable; `⊑`'s array arm decides against a scalar ascription
// on the OUTER kind before the element is inspected, and
// `checkExplicitSchemaMismatch` skips only `"compatible"` and `"unknown"`, so
// the warning fires. `unwrapToQuery` peels `try`, so the postfix-`?` spelling
// reaches the same conversion (cell A3, whose initialiser parses to `try`).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/diagnostics/code-registry-parse.md, row
//     `theta/parse/annotation-type-not-expression` — its *Trigger* states the
//     absence semantics the withhold carries ("A refused annotation is ABSENT
//     to the downstream consumers this row's withhold reaches") and then
//     records THIS consumer as a "KNOWN, RECORDED residual, not intended
//     behaviour". The *Trigger*'s own test for whether a verdict is derived
//     from refused text is whether the annotation's ABSENCE reaches the same
//     verdict: cell A4 shows it does not.
//   - docs/spec_topics/diagnostics/code-registry-parse.md, row
//     `theta/parse/explicit-schema-mismatch` (`W`) — its *Trigger* is a
//     BOTH-ANNOTATIONS-PRESENT condition and says nothing about refused text.
//   - docs/spec_topics/query/query-forms.md — QRY-4's explicit form: the
//     warning fires iff `ascription ⋢ annotation`, and is skipped when either
//     side is past the parser's static view. A refused annotation is absent, so
//     QRY-4's own two-annotations-present condition is unmet.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 (DIAG-4 — the
//     *Message* column is normative), which is why every expected message here
//     is READ from the registry at runtime and none is restated.
//     `theta/parse/explicit-schema-mismatch` is registered `W`, so its rendered
//     line is `warning <code>: <message>`, not `error …`.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string, driven through `parseDoc`
// (tests/helpers/e2e-s1.ts — the shipped front end wrapped in the standard
// inert deps double), which is the harness the bug doc's §Reproduction used.
// The observables are a parse-time diagnostic list (with ranges) and the parsed
// `QueryExpr.schema` field; an integration or live tier would add a session
// round-trip that can assert neither more sharply, since the subject is fully
// determined before any turn runs.
//
// WHOLE ORDERED LISTS, NEVER `.some` / `.toContain`: the claim is that ONE
// written mistake draws ONE diagnostic, so both directions have to be reachable
// off one assertion. A repair that also silenced the refusal reds on the
// missing error line; one that also silenced the ordinary QRY-4 channel reds on
// cell A5.
//
// RANGES ARE PART OF EVERY EXPECTATION: the refusal carries the `let`
// statement's range and the warning carries the QUERY's, so the two lines are
// distinguishable only with ranges rendered — and §Expected behaviour item 3
// requires the surviving verdicts to keep their exact ranges.
//
// WHAT IS RED HERE. Cells A1, A2 and A3 assert the FIXED expectation — the
// refusal ALONE — and red at HEAD on the surviving
// `warning theta/parse/explicit-schema-mismatch` line. Every other cell is
// GREEN at HEAD and must stay green: A4/A5/A6 are the boundaries that locate
// the fault, group (B) is the four threaded consumers, group (C) is the second
// reader in the same file, and group (D) is the propagated-schema channel the
// report measures but does not own.
//
// NO SILENT SKIPPING: every reader THROWS, naming the absent intermediate, when
// the registry row, the statement node or the captured annotation is missing,
// and a diagnostic arriving with no range fails loudly rather than rendering a
// placeholder. A fixture that never reached the position under test can never
// be mistaken for a pass.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { LetStmt, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// ===========================================================================
// The two codes under assertion, and their normative messages (DIAG-2/DIAG-4).
// Rows are cited by CODE and page, never by line: bug 0134's adjudicated
// do-not-chase class covers positional drift on these pages.
// ===========================================================================

const REFUSAL_CODE = "theta/parse/annotation-type-not-expression";
const MISMATCH_CODE = "theta/parse/explicit-schema-mismatch";

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
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
 * A row's normative *Message* template (DIAG-4), read rather than restated.
 * THROWS naming the missing code, so a registry rename can never degrade an
 * assertion below into a comparison against `undefined` and can never be
 * silently replaced by a hard-coded string. Called only from inside a test
 * body: at module scope a throw would abort collection and take this file's
 * green control cells down with it.
 */
function templateOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code}; DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes that column this file's ` +
        `only oracle, so a missing row is a loud failure, never a skip and never a ` +
        `hard-coded fallback`,
    );
  }
  return template;
}

/** The `<…>` placeholders a template renders, in source order. */
function placeholdersOf(template: string): string[] {
  return template.match(/<[a-zA-Z][a-zA-Z0-9-]*>/g) ?? [];
}

/**
 * One rendered `<severity> <code>: <message> @ <range>` line, by explicit slot
 * substitution. Each slot's presence in the live template is asserted first, so
 * a reworded row reds by naming the slot instead of silently leaving an
 * unsubstituted placeholder in the expectation.
 */
function line(
  severity: "error" | "warning",
  code: string,
  subs: ReadonlyArray<readonly [string, string]>,
  range: string,
): string {
  const template = templateOf(code);
  let out = template;
  for (const [slot, value] of subs) {
    expect(
      template,
      `DIAG-4: the ${code} row's Message must still carry the ${slot} slot this file renders; ` +
        `observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return `${severity} ${code}: ${out} @ ${range}`;
}

/**
 * The refusal's line for one offending binder. Error-severity, carrying the
 * declaration's range — which is why `hasLoadParseError` denies registration
 * whether or not the warning survives beside it.
 */
function refusal(name: string, range: string): string {
  return line("error", REFUSAL_CODE, [["<name>", name]], range);
}

/**
 * The QRY-4 warning's line, at the QUERY's range. The row's *Message* carries
 * ONE `<…>`-shaped token and it is not a slot: `@<Schema>` is a literal
 * source-grammar spelling the renderer interpolates nothing into
 * (docs/spec_topics/diagnostics/placeholder-rendering-a.md:11 names this row's
 * template as one of exactly three such spellings). The set is asserted rather
 * than assumed, so a row that gained a real slot reds by naming it instead of
 * leaving an unrendered placeholder in the expectation.
 */
function mismatch(range: string): string {
  const template = templateOf(MISMATCH_CODE);
  expect(
    placeholdersOf(template),
    `DIAG-4: the ${MISMATCH_CODE} row's Message must still carry no interpolated slot — its ` +
      `only \`<…>\` token is the literal \`@<Schema>\` source spelling ` +
      `(docs/spec_topics/diagnostics/placeholder-rendering-a.md:11) — so this file substitutes ` +
      `nothing; observed template ${JSON.stringify(template)}`,
  ).toEqual(["<Schema>"]);
  return `warning ${MISMATCH_CODE}: ${template} @ ${range}`;
}

// ===========================================================================
// Fixtures and observation. Every fixture is a whole prompt-mode theta with
// three lines of frontmatter, so the first body line is line 4 — the shape the
// bug doc's §Reproduction measured, and the reason every range below starts at
// line 4 (or line 5 inside a block).
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "a\n";

/** A `mode: prompt` theta whose body is `stmt` on line 4, then a tail expression. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** A `mode: prompt` theta whose body is a multi-line block starting on line 4. */
function blockBody(lines: readonly string[]): string {
  return `${FM}${lines.join("\n")}\n`;
}

/**
 * Each diagnostic as `<severity> <code>: <message> @ <start>-<end>`, in
 * emission order. A range-less diagnostic fails LOUDLY rather than rendering a
 * placeholder: the refusal and the warning differ in range, and §Expected
 * behaviour item 3 freezes the surviving ranges, so a defaulted range would let
 * a moved verdict read as a pass.
 */
function diagLines(label: string, doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => {
    const range = d.range;
    if (range === undefined) {
      throw new Error(
        `${label}: ${d.code} arrived with no range, so the refusal (the \`let\` statement's ` +
          `range) and the QRY-4 warning (the query's) cannot be told apart at this position`,
      );
    }
    return (
      `${d.severity} ${d.code}: ${d.message} @ ` +
      `${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`
    );
  });
}

/** The whole ordered diagnostic list of one fixture. */
function diags(label: string, src: string): string[] {
  return diagLines(label, parseDoc(src, "bug0222.theta"));
}

/** The sole top-level `let` named `name`, loud when the body declares none. */
function letStmtOf(label: string, doc: ThetaDocument, name: string): LetStmt {
  const hit = doc.body.statements.find(
    (s): s is LetStmt => s.kind === "let" && (s as LetStmt).name === name,
  );
  if (hit === undefined) {
    throw new Error(
      `${label}: the body declares no top-level \`let ${name}\`, so no annotation reached the ` +
        `position under test; diagnostics ${JSON.stringify(diagLines(label, doc))}`,
    );
  }
  return hit;
}

/**
 * Every `QueryExpr.schema` in the parsed body, in traversal order — read after
 * `resolveQuerySchemas` has run, the way §Reproduction (C) and (D) read it.
 */
function querySchemas(src: string): unknown[] {
  const found: unknown[] = [];
  const seen = new Set<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    const record = node as Record<string, unknown>;
    if (record.kind === "query") found.push(record.schema);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(parseDoc(src, "bug0222.theta").body as unknown);
  return found;
}

// ===========================================================================
// (A) THE SUBJECT AND ITS BOUNDARIES.
//
// A1/A2/A3 are RED at HEAD: each asserts §Expected behaviour item 1 — a `let`
// annotation the recogniser refuses is ABSENT to `checkLetMismatch`, so the
// refusal fires ALONE. At HEAD each carries a surviving
// `warning theta/parse/explicit-schema-mismatch` line as the diff.
//
// A4/A5/A6 are GREEN at HEAD and must stay green. A4 is the absence test the
// registry row's *Trigger* itself applies (`[]`), A5 proves the channel is live
// on ordinary input, and A6 proves the pairing is a property of the converted
// OUTER shape rather than of the junk text.
// ===========================================================================

describe("bug 0222 (A) — the refused `let` annotation is absent to the QRY-4 check", () => {
  it("RED A1: `let a: array<integer--> = @<integer>`x`` draws the refusal ALONE", () => {
    // The headline fixture. `array<integer-->` converts to an `array` whose
    // element is the unresolvable `integer--`, and `⊑`'s array arm decides
    // against the scalar `integer` ascription on the outer kind alone.
    const label = "A1";
    const src = body("let a: array<integer--> = @<integer>`x`");
    const doc = parseDoc(src, "bug0222.theta");
    expect(
      letStmtOf(label, doc, "a").annotation,
      `${label}: PRECONDITION — this cell needs the REFUSED annotation text to have been ` +
        "captured at the `let` position; a drifted capture would test nothing about the withhold",
    ).toBe("array<integer-->");
    expect(
      diagLines(label, doc),
      "A1 — the surviving `warning theta/parse/explicit-schema-mismatch` line is the defect: " +
        "it is computed from text the refusal's own registry row declares ABSENT to its " +
        "consumers, and its range points at the query rather than the annotation, so it reads " +
        "as an independent second fault. The refusal's own line and range do not move",
    ).toEqual([refusal("a", "4:1-4:40")]);
  });

  it("RED A2: the union arm carrying the array-wrapped refusal draws the refusal ALONE", () => {
    // Nesting depth changes nothing about which consumer decided the verdict:
    // the union's array arm fails on outer kind exactly as in A1, the `boolean`
    // arm fails on primitive mismatch, and neither reaches "compatible" or
    // "unknown", so the union verdict is "incompatible".
    const label = "A2";
    const src = body("let a: array<integer--> | boolean = @<string>`x`");
    const doc = parseDoc(src, "bug0222.theta");
    // The capture drops the spaces around the union's `|`, so the text handed to
    // the position is not byte-identical to the source spelling.
    expect(
      letStmtOf(label, doc, "a").annotation,
      `${label}: PRECONDITION — the whole union text must reach the position under test`,
    ).toBe("array<integer-->|boolean");
    expect(
      diagLines(label, doc),
      "A2 — a red carrying the warning at 4:37-4:49 is the same defect as A1 measured one " +
        "level down inside a union arm, which is what makes the fault the consumer's routing " +
        "rather than any one converted shape",
    ).toEqual([refusal("a", "4:1-4:49")]);
  });

  it("RED A3: the postfix-`?` spelling draws the refusal ALONE", () => {
    // `unwrapToQuery` peels the `try` wrapper the postfix `?` parses to, so
    // this spelling reaches the same conversion; the withhold guard sits ahead
    // of the peel and covers both spellings at once (§Fix (b)(6)). The `?`
    // needs a `Result`-returning `fn` scope, so the statement is on line 5.
    const label = "A3";
    const src = blockBody([
      "fn f(): Result<integer, QueryError> {",
      "  let a: array<integer--> = @<integer>`x`?",
      "  a",
      "}",
      "f()",
    ]);
    const doc = parseDoc(src, "bug0222.theta");
    expect(
      diagLines(label, doc),
      "A3 — the `?` form is pinned beside A1 rather than assumed to follow it: the peel is a " +
        "separate reach into the same conversion. A red carrying the warning at 5:29-5:42 is " +
        "the wrapped spelling of A1's defect",
    ).toEqual([refusal("a", "5:3-5:43")]);
  });

  it("GREEN A4: with the annotation ABSENT, the identical query draws `[]`", () => {
    // The control the whole report turns on, and the registry row's own
    // absence test: `let a = …` carries no annotation, `checkLetMismatch`
    // returns on the null source, and nothing lands on this channel. A1's
    // warning is therefore derived from the refused TEXT, not from the query
    // being present.
    const label = "A4";
    const src = body("let a = @<integer>`x`");
    const doc = parseDoc(src, "bug0222.theta");
    expect(
      letStmtOf(label, doc, "a").annotation,
      `${label}: PRECONDITION — this cell's whole point is the ABSENCE of an annotation, not a ` +
        "refused one; a non-null capture would mean the fixture drifted off the shape it pins",
    ).toBeNull();
    expect(
      diagLines(label, doc),
      "A4 — a red here means the repair changed the ABSENT case, which is the reference the " +
        "refused case must converge on (§Expected behaviour item 2)",
    ).toEqual([]);
  });

  it("GREEN A5: a WELL-FORMED mismatched annotation keeps its warning ALONE", () => {
    // The liveness control: with no refusal in play the QRY-4 channel behaves
    // exactly as its own doc comment states (`integer ⋢ string`). A repair that
    // gated the channel on something wider than the recogniser reds here.
    expect(
      diags("A5", body("let a: string = @<integer>`x`")),
      "A5 — §Expected behaviour item 3: the QRY-4 channel is otherwise unmoved, keeping its " +
        "code, its `W` severity and its query-ranged position. A red here means the guard " +
        "removed an emission bug 0222 does not own",
    ).toEqual([mismatch("4:17-4:30")]);
  });

  it("GREEN A6: the bare junk name keeps its single refusal", () => {
    // The same junk text as A1 without the `array<…>` wrapper: it converts to a
    // bare `named`, `checkCompatible` answers "unknown", and
    // `checkExplicitSchemaMismatch` skips on that deferral. Its silence is the
    // relation's, not the withhold's — so it is a boundary, not coverage.
    expect(
      diags("A6", body("let a: integer-- = @<string>`x`")),
      "A6 — the pairing is a property of the converted OUTER shape, not of the junk by " +
        "itself. A red here means the repair moved a case the `⊑` relation already defers on",
    ).toEqual([refusal("a", "4:1-4:32")]);
  });
});

// ===========================================================================
// (B) THE FOUR THREADED CONSUMERS, on the same refused text. Each already
// consults `annotationSourceIsNotTypeExpression` and reports nothing derived
// from the refused annotation — the shape the subject does not have, and the
// shape §Expected behaviour item 1 asks it to join. Each cell names the
// diagnostic the consumer WOULD have had to report if it converted the text,
// so a repair that widened the withhold's emission direction reds here.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0222 (B) — the withheld consumers report nothing beside the refusal", () => {
  it("GREEN B1: the binding record — a refused iterand draws no `non-array-iterand`", () => {
    expect(
      diags("B1", blockBody(["let a: integer-- = 3", "for x in a { 1 }"])),
      "B1 — `recordWithheldBinders` seeds the binding withheld, so the iterand check defers " +
        "instead of reporting `theta/parse/non-array-iterand` on a type the refused text never " +
        "supported. A red here means the repair perturbed the landed withhold",
    ).toEqual([refusal("a", "4:1-4:21")]);
  });

  it("GREEN B2: the `fn` parameter scope draws nothing beside the refusal", () => {
    expect(
      diags("B2", blockBody(["fn f(n: integer--): integer {", "  n", "}", "f(1)"])),
      "B2 — `walkFn`'s parameter loop consults the recogniser and takes its existing " +
        "unannotated-parameter branch, so the parameter's scope entry carries no judged type",
    ).toEqual([refusal("n", "4:1-6:2")]);
  });

  it("GREEN B3: the callee parameter table draws no `fn-arg-type-mismatch`", () => {
    expect(
      diags("B3", blockBody(["fn g(n: integer--): integer {", "  1", "}", 'let z = g("s")', "z"])),
      "B3 — `checkFnCallArgs` treats the refused parameter type as absent, so a `string` " +
        "argument at that position draws no `theta/parse/fn-arg-type-mismatch`",
    ).toEqual([refusal("n", "4:1-6:2")]);
  });

  it("GREEN B4: a withheld read draws no `unknown-method`", () => {
    expect(
      diags("B4", blockBody(["let a: integer-- = 3", 'let b = a.join(",")', "b"])),
      "B4 — the withheld binder defers every later structural read of it, so `.join` on a " +
        "binding whose annotation was refused draws no `theta/parse/unknown-method`",
    ).toEqual([refusal("a", "4:1-4:21")]);
  });
});

// ===========================================================================
// (C) THE SECOND READER IN THE SAME FILE. `annotationToInferred` /
// `compatToInferred` also read the refused text, and C1 is silent — but NOT
// through the withhold. GREEN at HEAD and after.
// ===========================================================================

describe("bug 0222 (C) — the indirect sink's silence is incidental, not coverage", () => {
  it("GREEN C1: the indirect sink stays untyped and draws the refusal ALONE", () => {
    // INCIDENTAL, and asserted as such (§Fix (b)(7)): `compatToInferred`'s
    // `named` arm requires a plain identifier, and every refused spelling fails
    // that test at the leaf, so the sink declines by accident rather than by
    // withhold. This cell must NOT be read as coverage of the subject — the
    // subject is `checkLetMismatch`, which converts and reports, while this
    // reader converts and discards.
    const src = body("let a: array<integer--> = [@`x`]");
    expect(
      { diags: diags("C1", src), schemas: querySchemas(src) },
      "C1 — the schema value is pinned beside the diagnostics so a repair that gated this " +
        "reader with the recogniser, or left it alone, is distinguishable from one that changed " +
        "what the sink supplies. Its silence is the identifier test's, not the withhold's",
    ).toEqual({ diags: [refusal("a", "4:1-4:33")], schemas: [null] });
  });

  it("GREEN C2: the well-formed sink supplies its element schema and stays silent", () => {
    // The contrast that shows the sink is live: a well-formed `array<string>`
    // annotation reaches `QueryExpr.schema` as `"string"`, so C1's `null` is a
    // decline at the leaf rather than a dead route.
    const src = body("let a: array<string> = [@`x`]");
    expect(
      { diags: diags("C2", src), schemas: querySchemas(src) },
      "C2 — a red means the repair reached the indirect-sink route's ordinary behaviour, which " +
        "bug 0222 does not own",
    ).toEqual({ diags: [], schemas: ["string"] });
  });
});

// ===========================================================================
// (D) THE PROPAGATED-SCHEMA CHANNEL, measured and OUT OF FRAME (§Non-goals).
// `parseLet` copies a refused annotation verbatim onto a query that carried no
// ascription. That text is deliberately outside
// `theta/parse/query-annotation-type-not-expression`'s *Trigger*, and the `let`
// position already refuses it, so the values are recorded here rather than
// claimed as a defect. Pinned so a repair that starved the propagation to
// silence the subject reds instead of passing.
// GREEN at HEAD and after.
// ===========================================================================

describe("bug 0222 (D) — the propagated `QueryExpr.schema` text is unmoved", () => {
  it("GREEN D1: `let a: array<integer--> = @`x`` records `\"array<integer-->\"`", () => {
    const src = body("let a: array<integer--> = @`x`");
    expect(
      { diags: diags("D1", src), schemas: querySchemas(src) },
      "D1 — the subject's guard sits in `checkLetMismatch`, which reports rather than " +
        "propagates, so neither the copied text nor the refusal beside it may move",
    ).toEqual({ diags: [refusal("a", "4:1-4:31")], schemas: ["array<integer-->"] });
  });

  it("GREEN D2: `let a: integer-- = @`x`` records `\"integer--\"`", () => {
    const src = body("let a: integer-- = @`x`");
    expect(
      { diags: diags("D2", src), schemas: querySchemas(src) },
      "D2 — the bare-name spelling of D1, pinned so the propagation is frozen for both " +
        "converted shapes the subject distinguishes",
    ).toEqual({ diags: [refusal("a", "4:1-4:24")], schemas: ["integer--"] });
  });
});
