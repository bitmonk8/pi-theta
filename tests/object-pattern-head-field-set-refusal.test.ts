import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { parseDoc, parseDocBytes } from "./helpers/e2e-s1";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { ThetaValue } from "../src/runtime/value";

// Bug 0226 — a `match` object-pattern head that RESOLVES is admitted with any
// field list at all: `R { a: 1 }` where `schema R { b: integer }`, `R { a: 1 }`
// where `R` declares `a: string`, and `Animal { a: 1 }` where `Animal` is an
// alias/union with no object body each draw `[]`, register, and select their
// arm on a value of an unrelated schema — while the same three field lists in
// the VALUE position draw `theta/parse/extra-object-field`,
// `theta/parse/object-field-type-mismatch` and
// `theta/parse/unresolved-named-type`
// (docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md).
//
// WHY the field list is unjudged today: bug 0221's landed head check resolves
// the head's NAME against a whole-file token scan (symbol
// `BodyParser.patternHeadTypeNames`, src/parser/theta-document.ts:4586, memo
// field :4557) and returns `{ kind: "object", typeName: t.text, fields }`
// (symbol `BodyParser.parsePattern`'s `{`-gated arm, :4444) with the fields
// compared to nothing. The two passes that DO compare a field list to a
// declaration reach object EXPRESSIONS only — `checkObjectExpr` (:7489, whose
// declared-field lookup is `refs.schemas.get(e.typeName)` at :7505 over
// `StructuralRefs.schemas`, :6545) is reached from `walkExpr`'s `object` case
// (:7671–:7672), while its `case "match"` (:7677) walks the scrutinee and each
// `arm.body` and never `arm.pattern`; and the type layer's
// `checkObjectFieldCompat` (src/parser/type-compat.ts:526) is routed from the
// object-expression arm of `checkObjectField`
// (src/parser/type-layer-checks.ts:2148), whose `case "match"` (:3157)
// enumerates scrutinee plus arm bodies.
//
// THE CONTRACT UNDER TEST is the bug's §Fix as SETTLED for this run — four
// elements, measured at this tree before the cells were written:
//
//   (1) RANGE CARRIAGE. The object variant of `PatternNode`
//       (src/parser/theta-document.ts:321–:324, which today carries `typeName`
//       and `fields` and no range — the reason §Fix constraint 1 exists) gains
//       `readonly range: SourceRange` spanning the WHOLE pattern: the head
//       token through the closing `}` (for the bare `{ … }` form, `{` through
//       `}`), built with `spanRange(t.range, this.prevRange())`. Every
//       expected range in this file is therefore the PATTERN's span, not the
//       head token's — which is what separates this file's ranges from bug
//       0221's head-token ranges. The runtime shape is untouched
//       (`toRuntimePattern`, src/runtime/statement-executor.ts:1359 with its
//       object arm :1190–:1193, the runtime `Pattern` object variant
//       src/runtime/match-result.ts:113–:117, and `matchPattern`'s object arm
//       :202–:221 stay byte-identical — §Fix constraint 2).
//
//   (2) THE FIELD-NAME HALF. A new module function `checkPatternObjectFields`
//       in src/parser/theta-document.ts, called from `walkExpr`'s
//       `case "match"` (:7677) for each `arm.pattern`, recursing into object
//       field sub-patterns, array elements and `Ok(`/`Err(` constructor
//       inners. For a head that resolves to a same-file object-form `schema`
//       (`StructuralRefs.schemas`, :6545), each LISTED field name absent from
//       the declared set draws `theta/parse/extra-object-field` at the
//       PATTERN's range. A head that is an imported symbol, an `enum`, a
//       builtin (`QueryError`), or resolves to NO declaration at all DEFERS
//       silently (§Fix constraint 3, groups (b)/(d) below).
//
//   (3) ROW A5's SETTLED DISPOSITION — refused-as-unsatisfiable. §Fix
//       constraint 3 required this choice to be stated and pinned: a same-file
//       alias/union `schema` (`schema Animal = Cat | Dog`) or a head-only
//       `schema` declares NO fields, so it is FIELDLESS and every listed field
//       is reported. An EMPTY field list on such a head stays silent, because
//       the empty set is a subset of the empty declared set — cell x1.
//
//   (4) THE FIELD-TYPE HALF. A new private method `checkPatternFieldTypes` in
//       src/parser/type-layer-checks.ts, called from its `case "match"`
//       (:3157) per arm, judging LITERAL sub-patterns only, through the
//       existing `checkObjectFieldCompat` (src/parser/type-compat.ts:526,
//       TYPE-9 doc :508), with the verdict
//       `theta/parse/object-field-type-mismatch` at the PATTERN's range. A
//       number literal types as `integer` when integral, else `number`. The
//       pattern position narrows (bug 0234 §Fix disposition 1,
//       docs/bugs/0234-pattern-field-literal-integer-narrowing-deferred.md):
//       `checkObjectFieldCompat`'s whole verdict is kept at the pattern
//       position, so a non-integral literal under an `integer` field is
//       refused there. This file's cell x4 is the single flip bug 0234
//       §Fix constraint 4 authorises.
//
// NO NEW REGISTRY ROW, and no tests/fixtures/h7a/permitted-codes.json edit.
// The disposition is DIAG-2 as a *Trigger* WIDENING of the two existing rows
// (docs/spec_topics/diagnostics/code-registry-parse.md:47 and :49), whose
// texts today name the constructor position only. The widened trigger WORDS
// are the implementer's, so group (r) asserts only what this file can name
// from the registry as it stands: each row's presence, severity, phase and
// normative *Message* template (DIAG-4,
// docs/spec_topics/diagnostics/diagnostic-shape.md:74) — every rendering below
// is substituted into that template rather than spelled by hand.
// `theta/parse/missing-object-field` (:48) is ruled OUT: a pattern lists a
// SUBSET of the declared fields by design (docs/spec_topics/expressions.md:171
// "unlisted fields are ignored"), so omission is legal here — cell b2.
//
// NOTE on the type-half row's PHASE: `theta/parse/object-field-type-mismatch`
// is registered phase `type` (:49) while its CODE sits in the `theta/parse/`
// namespace, which is what `hasLoadParseError`
// (src/extension/production-composition.ts) keys on. So the type half
// denies registration exactly as the name half does — asserted in group (r)
// and relied on by cells a3, a4, b8b, x6.
//
// DOC CORRECTION carried by this file. The bug document's row B8
// (`schema R { a: string }` / `match Ok(1) { R { a: 1 } => … }`, listed as a
// must-not-move `[]` boundary at §Reproduction (C)) is ITSELF an instance of
// element (4): a DECLARED field (`a`) with an incompatible literal (`1` under
// `a: string`). It therefore CANNOT keep `[]` under the settled route — it
// draws `theta/parse/object-field-type-mismatch`. B8's SUBJECT is that the
// listed field must be PRESENT in the value for the wrong arm to fire, and
// that subject is preserved by writing the row FIELD-COMPATIBLY
// (`schema R { a: integer }`), which keeps `[]` and `"ok-arm"`. Both are
// pinned: cell b8a is the amended compatible boundary, cell b8b is the
// document's literal spelling as a now-refused member of the a3/a4 class.
//
// CHANGED rows that the bug document does NOT list among its must-not-move
// boundaries, pinned here in their AMENDED form because the settled route's
// recursion and literal judging reach them: cell x3 (an array ELEMENT's head,
// `[Q { zz: 1 }]`) and cell x6 (`Q { a: null }` under a `boolean` field).
//
// LOCKS this file must not red (§Fix constraints 4 and 5):
// tests/object-pattern-head-unresolved-refusal.test.ts (bug 0221's 43 cells)
// and tests/reserved-keyword-object-pattern-head-refusal.test.ts (bug 0219's
// 54 cells) are green as written at HEAD. The single flip bug 0226 authorises
// there is cell `a1` (tests/object-pattern-head-unresolved-refusal.test.ts:485),
// which pins THIS class's `[]` and its `"r-arm"` value as bug 0221's recorded
// residual; amending it belongs to the fix, not to this witness, so this file
// leaves both lock files untouched. Bug 0221 §Fix (c)(5)'s interchangeability
// boundary (its cell `a5`, :557) is re-asserted independently here as cell b1.
//
// TIER — unit, offline, provider-free, deterministic, inside the default
// `npm test` gate. Both observables settle in-process: the diagnostic list at
// the `parseThetaDocument` boundary, and the selected arm's value inside one
// `executeBody` over the production prompt-mode binding
// (`createProductionProducerDeps` + `bindPromptConversation`). No provider,
// model, child process or socket is on either path, so an integration tier
// adds no observable that is not already reachable here. The registration
// outcome the route changes is additionally witnessed live, on bug 0221's
// precedent, by tests/live/object-pattern-head-field-set-live-cell.test.ts.
//
// NO SILENT SKIPPING (CLAUDE.md). Group (r)'s registry lookups throw naming
// the absent row, group (f)'s corpus sweep fails loudly on an empty
// `git ls-files` result, and every other expectation is a hard-coded literal
// substituted through the registry oracle — so the primary reds are the
// MISSING REFUSAL and the WRONG ARM, the symptoms bug 0226 describes, and
// never an oracle miss.

// ===========================================================================
// Codes. Both are already registered; this file mints nothing.
// ===========================================================================

/** The field-NAME verdict (code-registry-parse.md:47). */
const EXTRA_FIELD = "theta/parse/extra-object-field";

/** The field-TYPE verdict (code-registry-parse.md:49, phase `type`). */
const TYPE_MISMATCH = "theta/parse/object-field-type-mismatch";

/** Ruled OUT at a pattern head by §Non-goals and cell b2 (:48). */
const MISSING_FIELD = "theta/parse/missing-object-field";

/** The value-position-only verdict for an alias head (:107) — cell v3. */
const UNRESOLVED = "theta/parse/unresolved-named-type";

/**
 * TYPE-2's one-way `number`-under-`integer` verdict (code-registry-parse.md:27).
 * Bug 0234 authorises the single flip in this file that reads this constant:
 * cell x4, moved from a pinned `[]` deferral to this refusal.
 */
const NARROWING = "theta/parse/integer-narrowing";

// ===========================================================================
// (r) The registry oracle — DIAG-4's source of truth for every rendering
// below, and DIAG-2's evidence that the route mints no row.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY = parseRegistry(readRepoFile(REGISTRY_PARSE_PAGE)) as RegistryRow[];

/**
 * The registry row for `code`, or a throw naming the absent row (no silent
 * skipping: a missing row must fail the oracle loudly, not default a message).
 */
function row(code: string): RegistryRow {
  const found = REGISTRY.find((r) => r.code === code);
  if (found === undefined) {
    throw new Error(
      `${REGISTRY_PARSE_PAGE} carries no row for ${code} — bug 0226's oracle for that row has no source`,
    );
  }
  return found;
}

/**
 * Fill a registry *Message* template's `<placeholder>` slots. Every expected
 * message in this file is built this way, so a DIAG-4 rendering change reds
 * group (r) and the affected cells together rather than silently diverging.
 */
function fill(template: string, slots: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [name, value] of Object.entries(slots)) {
    const token = `<${name}>`;
    if (!out.includes(token)) {
      throw new Error(
        `registry *Message* template ${JSON.stringify(template)} has no ${token} slot — bug 0226's oracle cannot render it`,
      );
    }
    out = out.split(token).join(value);
  }
  return out;
}

const EXTRA_FIELD_TEMPLATE: string = registryMessage(REGISTRY, EXTRA_FIELD) as string;
const TYPE_MISMATCH_TEMPLATE: string = registryMessage(REGISTRY, TYPE_MISMATCH) as string;
const NARROWING_MESSAGE: string = registryMessage(REGISTRY, NARROWING) as string;

describe("0226 (r) — the two registered rows the refusals render from", () => {
  it("r1: `extra-object-field` is registered `E`/`parse` with the rendering every (a) cell substitutes", () => {
    const found = row(EXTRA_FIELD);
    expect(
      found.severity,
      `${EXTRA_FIELD} must be an E row: an error-severity \`theta/parse/\` code is what \`hasLoadParseError\` (src/extension/production-composition.ts:2220) turns into the registration denial that IS the refusal`,
    ).toBe("E");
    expect(
      found.phase,
      `${EXTRA_FIELD} is emitted from \`walkExpr\`'s \`case "match"\` (src/parser/theta-document.ts:7677), a parse-phase structural leaf`,
    ).toBe("parse");
    expect(
      EXTRA_FIELD_TEMPLATE,
      "DIAG-4 (diagnostic-shape.md:74): the *Message* column is normative, and it must stay TRUE of a pattern — \"extra field 'a' on schema 'R'\" is, which is why §Fix constraint 6 admits this row and rules out `missing-object-field`",
    ).toBe("extra field '<field>' on schema '<schema>'");
  });

  it("r2: `object-field-type-mismatch` is registered `E`, phase `type`, in the `theta/parse/` namespace", () => {
    const found = row(TYPE_MISMATCH);
    expect(
      found.severity,
      `${TYPE_MISMATCH} must be an E row: the field-TYPE half denies registration exactly as the name half does`,
    ).toBe("E");
    expect(
      found.phase,
      `${TYPE_MISMATCH} is the type layer's verdict (src/parser/type-layer-checks.ts, routing \`checkObjectFieldCompat\`, src/parser/type-compat.ts:526), so its registered phase stays \`type\``,
    ).toBe("type");
    expect(
      found.code.startsWith("theta/parse/"),
      `${TYPE_MISMATCH} sits in the \`theta/parse/\` NAMESPACE even though its phase is \`type\`, which is what makes \`hasLoadParseError\` (src/extension/production-composition.ts:2220) deny registration for cells a3, a4, b8b and x6`,
    ).toBe(true);
    expect(
      TYPE_MISMATCH_TEMPLATE,
      "DIAG-4: the *Message* column is normative for every field-type rendering below",
    ).toBe(
      "field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>",
    );
  });

  it("r3: `missing-object-field` keeps a rendering that is NOT true of a pattern, which is why it is ruled out", () => {
    // §Fix constraint 6 and §Non-goals: a pattern lists a SUBSET by design
    // (expressions.md:171 "unlisted fields are ignored"), so an omitted
    // declared field is legal at a pattern head and refused only at the
    // constructor (cell v1's second code). The row's own normative rendering
    // states the constructor requirement, so reusing it at a pattern would
    // render a false sentence.
    const found = row(MISSING_FIELD);
    expect(
      registryMessage(REGISTRY, MISSING_FIELD),
      `${MISSING_FIELD} must keep its constructor-omission rendering: it is the row §Fix constraint 6 rules out, and cell b2 is the boundary that rules it out`,
    ).toBe("missing field '<field>' on schema '<schema>'");
    expect(
      found.phase,
      `${MISSING_FIELD}'s row is untouched by this route`,
    ).toBe("parse");
  });

  it("r4: the two widened rows exist as a PAIR, and no third row is minted for the pattern position", () => {
    // DIAG-2 disposition: the route widens the *Trigger* of exactly these two
    // rows. The widened trigger WORDS are the implementer's, so this cell
    // asserts what it can name from the registry as it stands — that both rows
    // are present and that no row exists whose code names a pattern-position
    // field verdict.
    expect(
      REGISTRY.filter((r) => r.code === EXTRA_FIELD || r.code === TYPE_MISMATCH).map(
        (r) => r.code,
      ),
      "both rows must be present; §Fix takes the *Trigger*-widening disposition, so the refusal renders from these two and mints nothing",
    ).toEqual([EXTRA_FIELD, TYPE_MISMATCH]);
    expect(
      REGISTRY.filter((r) => /pattern.*field|field.*pattern/.test(r.code)).map((r) => r.code),
      "no new row: a minted `theta/parse/…pattern…field…` code would be the GOV-15 carve-out shape §Fix constraint 6 names as the ALTERNATIVE to the widening this file pins",
    ).toEqual([]);
  });
});

// ===========================================================================
// Parse harness — the shipped `parseThetaDocument` through `parseDoc`
// (tests/helpers/e2e-s1.ts:39; the signature is `parseDoc(src, path)`).
// ===========================================================================

/** Every row is a whole prompt-mode theta; frontmatter occupies lines 1–3. */
const FM = "---\nmode: prompt\n---\n";

const FILE = "bug0226.theta";

function theta(body: string): ThetaDocument {
  return parseDoc(FM + body, FILE);
}

/** A body assembled from lines, so a cell's line numbers read off its array. */
function lines(...parts: readonly string[]): string {
  return parts.join("\n") + "\n";
}

/**
 * A diagnostic reduced to the five normative fields (diagnostic-shape.md
 * §"Internal diagnostic shape"). `hint` is excluded on purpose: it is a
 * non-normative repair aid carried in its own registry column, so pinning it
 * would make an added hint fail an assertion that is about the refusal.
 */
interface DiagShape {
  readonly severity: string;
  readonly code: string;
  readonly file: string | undefined;
  readonly range: SourceRange | undefined;
  readonly message: string;
}

function shapes(doc: ThetaDocument): DiagShape[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    file: d.file,
    range: d.range,
    message: d.message,
  }));
}

/** A 1-indexed, end-exclusive-column source range literal. */
function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceRange {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}

/**
 * The PATTERN's span, from its source spelling alone: element (1) of the
 * settled route carries the whole pattern's range on the object `PatternNode`,
 * head token through closing `}`. Derived, not guessed: the caller states the
 * line, the start column and the pattern text, and the end column is
 * `start + text.length` because the range's end column is exclusive.
 */
function patternRange(line: number, column: number, pattern: string): SourceRange {
  return range(line, column, line, column + pattern.length);
}

/** The expected field-NAME refusal, rendered through the registry oracle. */
function extraField(field: string, schema: string, at: SourceRange): DiagShape {
  return {
    severity: "error",
    code: EXTRA_FIELD,
    file: FILE,
    range: at,
    message: fill(EXTRA_FIELD_TEMPLATE, { field, schema }),
  };
}

/** The expected field-TYPE refusal, rendered through the registry oracle. */
function typeMismatch(
  field: string,
  schema: string,
  expected: string,
  actual: string,
  at: SourceRange,
): DiagShape {
  return {
    severity: "error",
    code: TYPE_MISMATCH,
    file: FILE,
    range: at,
    message: fill(TYPE_MISMATCH_TEMPLATE, { field, schema, expected, actual }),
  };
}

/** An expected diagnostic from a code this fix does not move (group (v)). */
function existing(code: string, message: string, at: SourceRange): DiagShape {
  return { severity: "error", code, file: FILE, range: at, message };
}

/**
 * The narrowing refusal, rendered through the registry oracle. Bug 0234's
 * fix keeps `checkObjectFieldCompat`'s whole result at the pattern position,
 * so this row and `typeMismatch` above are mutually exclusive per field.
 */
function narrowing(at: SourceRange): DiagShape {
  return { severity: "error", code: NARROWING, file: FILE, range: at, message: NARROWING_MESSAGE };
}

/** Failure payload: every diagnostic rendered `severity code @l:c-l:c: message`. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      const at =
        r === undefined
          ? "-"
          : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      return `${d.severity} ${d.code} @${at}: ${d.message}`;
    }),
  );
}

/**
 * Assert `body`'s WHOLE diagnostic list, order-sensitive and unfiltered.
 *
 * `assembleDiagnostics` (src/diagnostics/diagnostic.ts:123) orders by
 * (file, line, column) with a stable sort, so a multi-diagnostic row's
 * expected order is positional and measured, never guessed.
 */
function expectDiagnostics(
  body: string,
  expected: readonly DiagShape[],
  why: string,
): ThetaDocument {
  const doc = theta(body);
  expect(shapes(doc), `${why}\n  actual diagnostics: ${render(doc)}`).toEqual([...expected]);
  return doc;
}

/**
 * Whether `diagnostics` denies registration. `hasLoadParseError`
 * (src/extension/production-composition.ts) is module-private — `rg -n
 * 'export.*hasLoadParseError' src/` matches nothing — so the predicate is
 * mirrored here clause for clause: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. It is the mechanism that turns
 * this fix's diagnostics into the refusal, so the wrong-arm cells assert it
 * directly (the same mirror, for the same reason, as symbol
 * `deniesRegistration`,
 * tests/object-pattern-head-unresolved-refusal.test.ts:266).
 */
function deniesRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (d) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// Runtime harness — parse → production prompt-mode binding → `executeBody`
// (the tests/object-pattern-head-unresolved-refusal.test.ts:402–:454 shape,
// symbols `producer` / `execute` / `expectValue`). Offline, provider-free: a
// query-free prompt body dispatches no model.
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

function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    // `sendMessage` satisfies the theta-system-note channel; the active-tools
    // pair satisfies the PIC-17 snapshot/restore window. No provider, no model.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

async function execute(doc: ThetaDocument): Promise<BodyExecution> {
  const input: ThetaCompositionInput = {
    slashName: "bug0226",
    sourcePath: "/theta/bug0226.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta: input,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  return executeBody(input.body, binding.executeDeps);
}

/** Assert the value an already-parsed body evaluates to. */
async function expectValue(
  doc: ThetaDocument,
  value: ThetaValue,
  why: string,
): Promise<void> {
  const execution = await execute(doc);
  expect(execution.outcome, `${why}: the body reaches a value`).toBe("success");
  expect(execution.result.value, why).toEqual(value);
}

/**
 * Assert that a member of the class is refused at LOAD — first that it denies
 * registration, carrying the arm it ANSWERS in the failure payload, then its
 * whole diagnostic list.
 *
 * §Fix constraint 2 keeps dispatch byte-identical, so the greenable form of a
 * wrong-arm claim is the registration DENIAL, never a changed value: the value
 * is computed and reported first so the red names the pre-fix answered arm
 * (bug 0226 §Reproduction (A): a1 `"r-arm"`, a2 `1`, a3 `"r-arm"`, a4
 * `"r-arm"`, a5 `"animal-arm"`, a6 `"other-arm"`, a7 `"other"`) rather than
 * only a missing diagnostic.
 */
async function expectRefused(
  body: string,
  expected: readonly DiagShape[],
  why: string,
): Promise<void> {
  const doc = theta(body);
  const execution = await execute(doc);
  expect(
    deniesRegistration(doc.diagnostics),
    `${why}\n  the body answers ${JSON.stringify(execution.result.value)} (outcome=${execution.outcome})\n  actual diagnostics: ${render(doc)}`,
  ).toBe(true);
  expect(shapes(doc), `${why}\n  actual diagnostics: ${render(doc)}`).toEqual([...expected]);
}

/** Assert a boundary row keeps BOTH its silence and its measured value. */
async function expectClean(body: string, value: ThetaValue, why: string): Promise<void> {
  const doc = expectDiagnostics(body, [], why);
  await expectValue(doc, value, why);
}

// ===========================================================================
// Column derivation, used by every cell below. Frontmatter occupies lines 1–3,
// so the first body line is line 4. In `let r = match d { PATTERN => …` the
// characters are `l`=1 … `match`=9–13, ` `=14, `d`=15, ` `=16, `{`=17, ` `=18,
// so the arm's pattern starts at column 19. The `match v {` and `match 3 {`
// rows share the arithmetic (a one-character scrutinee). `match Ok(1) {` is
// four characters wider — `Ok(1)`=15–19, ` `=20, `{`=21, ` `=22 — so its arm
// pattern starts at column 23.
// ===========================================================================

/** The arm-pattern start column after a one-character scrutinee. */
const ARM_COLUMN = 19;

/** The arm-pattern start column after the `Ok(1)` scrutinee. */
const OK_ARM_COLUMN = 23;

/** A5's/v3's shared alias declarations — three lines, so the body's 4–6. */
const ALIAS_SCHEMAS = [
  'schema Cat { kind: "cat", c: integer }',
  'schema Dog { kind: "dog", d: integer }',
  "schema Animal = Cat | Dog",
] as const;

// ===========================================================================
// (a) The class — a resolved head with a field list its declaration cannot
// carry (bug 0226 §Reproduction (A)). Every cell here is RED at HEAD with `[]`
// and the answered arm named in the payload.
// ===========================================================================

describe("0226 (a) — a resolved head's field list is judged against its declaration", () => {
  it("a1 [S1 PIN]: `R { a: 1 }` where `schema R { b: integer }` is refused, so the wrong arm never reaches a registered theta", async () => {
    // The S1 row (§Reproduction A1, and bug 0221's authorised flip, cell `a1`
    // at tests/object-pattern-head-unresolved-refusal.test.ts:485): the
    // correct `Q { a: 1 }` arm is present below, `R` declares `{ b }` and
    // cannot carry `a`, and at HEAD the `R` arm takes the `Q`-constructed
    // value and answers "r-arm" with `[]` on every channel. Element (2): `R`
    // resolves to a same-file object-form `schema` in `StructuralRefs.schemas`
    // (src/parser/theta-document.ts:6545), which declares `{ b }` alone.
    // Pattern `R { a: 1 }` is 10 characters at column 19 of line 7.
    await expectRefused(
      lines(
        "schema Q { a: integer }",
        "schema R { b: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ),
      [extraField("a", "R", patternRange(7, ARM_COLUMN, "R { a: 1 }"))],
      "§Expected behaviour 1: a pattern's listed field names must be a subset of the resolved declaration's, on the reading `checkObjectExpr` (src/parser/theta-document.ts:7489) already applies at the constructor (cell v1's first code), and the refusal must deny registration (src/extension/production-composition.ts:2220)",
    );
  });

  it("a2 [shorthand]: the field shorthand `R { a }` is refused identically, binder or no binder", async () => {
    // §Reproduction A2. The colon-less field sugars to a same-named
    // identifier pattern (expressions.md:171), so the shorthand lists the
    // field `a` exactly as a2's long form does; at HEAD the binder is live and
    // the arm body answers `1`, which is what makes the acceptance look
    // intentional. §Fix constraint 2 keeps the binders in scope
    // (`collectPatternBindings`, src/parser/theta-document.ts:5314, object arm
    // :5324, seeded per arm at :5650), so the whole-list assertion also pins
    // that no `theta/parse/unknown-identifier` cascade appears for the arm
    // body's read of `a`. Pattern `R { a }` is 7 characters at column 19 of
    // line 7.
    await expectRefused(
      lines(
        "schema Q { a: integer }",
        "schema R { b: integer }",
        "let d = Q { a: 1 }",
        "let r = match d { R { a } => a, Q { a: 1 } => 99, _ => 0 }",
        "r",
      ),
      [extraField("a", "R", patternRange(7, ARM_COLUMN, "R { a }"))],
      "the shorthand spelling reaches the same acceptance at HEAD and must reach the same refusal — exactly one code, and no binder cascade from the refused head's live `a`",
    );
  });

  it("a3 [field TYPE]: `R { a: 1 }` where `R` declares `a: string` is refused by the type half", async () => {
    // §Reproduction A3 / §Expected behaviour 2. `a` IS declared, so element
    // (2) is silent and element (4) judges the literal through
    // `checkObjectFieldCompat` (src/parser/type-compat.ts:526) — the same
    // relation the constructor position already decides (cell v2). The
    // integral number literal `1` types as `integer`. Pattern `R { a: 1 }` is
    // 10 characters at column 19 of line 7.
    await expectRefused(
      lines(
        "schema Q { a: integer }",
        "schema R { a: string }",
        "let d = Q { a: 1 }",
        'let r = match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ),
      [typeMismatch("a", "R", "string", "integer", patternRange(7, ARM_COLUMN, "R { a: 1 }"))],
      "§Expected behaviour 2: a listed field's pattern literal must be compatible with the declared field type under the relation the constructor position already applies (cell v2)",
    );
  });

  it("a4 [field TYPE, reversed]: `R { a: \"x\" }` where `R` declares `a: integer` is refused too", async () => {
    // §Reproduction A4 — the same element in the other direction, so a route
    // that judged only one direction reds here. Pattern `R { a: "x" }` is 12
    // characters at column 19 of line 7.
    await expectRefused(
      lines(
        "schema Q { a: string }",
        "schema R { a: integer }",
        'let d = Q { a: "x" }',
        'let r = match d { R { a: "x" } => "r-arm", Q { a: "x" } => "q-arm", _ => "other" }',
        "r",
      ),
      [
        typeMismatch(
          "a",
          "R",
          "integer",
          "string",
          patternRange(7, ARM_COLUMN, 'R { a: "x" }'),
        ),
      ],
      "§Expected behaviour 2 in the reverse direction: the incompatibility is symmetric, so both orderings of the declared type and the pattern literal must refuse",
    );
  });

  it("a5 [alias head, refused as unsatisfiable]: `Animal { a: 1 }` where `Animal = Cat | Dog` is refused", async () => {
    // §Reproduction A5 / §Expected behaviour 3, and element (3) of the settled
    // route: §Fix constraint 3 demanded this disposition be STATED and pinned,
    // and the disposition taken is refused-as-unsatisfiable. The alias head
    // resolves at the pattern position by the registered row's own rule
    // (code-registry-parse.md:107, the clause bug 0221 added) and declares NO
    // fields, so it is FIELDLESS and every listed field is reported — NOT
    // judged against the variants' union, and NOT deferred. The value position
    // refuses the same spelling at a third code (cell v3). Pattern
    // `Animal { a: 1 }` is 15 characters at column 19 of line 9.
    await expectRefused(
      lines(
        ...ALIAS_SCHEMAS,
        "schema Q { a: integer }",
        "let v = Q { a: 1 }",
        'let r = match v { Animal { a: 1 } => "animal-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ),
      [extraField("a", "Animal", patternRange(9, ARM_COLUMN, "Animal { a: 1 }"))],
      "§Expected behaviour 3: a head resolving to a same-file declaration with no object body carries no field list, so any listed field is unsatisfiable by it; the settled disposition is refused-as-unsatisfiable, and cell x1 pins that an EMPTY field list on the same head stays silent",
    );
  });

  it("a6 [depth]: the same class one level down is refused at the INNER pattern's range", async () => {
    // §Reproduction A6 — the row that beats a present correct arm one level
    // down, which is why element (2) recurses into object field sub-patterns.
    // `Other` declares `{ y }` and cannot carry `z`; the outer head `Outer`
    // declares `{ i }` and IS satisfied, so the whole-list assertion also
    // pins that the resolved outer head stays silent. Columns on line 8:
    // `Outer`=19–23, ` `=24, `{`=25, ` `=26, `i`=27, `:`=28, ` `=29, so the
    // inner pattern `Other { z: 1 }` (14 characters) starts at column 30.
    await expectRefused(
      lines(
        "schema Inner { z: integer }",
        "schema Other { y: integer }",
        "schema Outer { i: Inner }",
        "let d = Outer { i: Inner { z: 1 } }",
        'let r = match d { Outer { i: Other { z: 1 } } => "other-arm", Outer { i: Inner { z: 1 } } => "inner-arm", _ => "none" }',
        "r",
      ),
      [extraField("z", "Other", patternRange(8, 30, "Other { z: 1 }"))],
      "§Why it matters \"Depth carries it\": the inner head takes the value from the correct sibling arm, so the recursion into object field sub-patterns must reach it — exactly one code, at the inner pattern's range, with the satisfied outer head silent",
    );
  });

  it("a7 [silent member]: `R { zz: 1 }` — the same class with no wrong answer — is refused", async () => {
    // §Reproduction A7: the listed field is absent from the value too, so the
    // runtime's field-shape test (`matchPattern`'s object arm,
    // src/runtime/match-result.ts:202–:221) rejects the arm and the
    // acceptance is silent — the member of the class that hides in programs
    // which currently behave correctly. It must refuse on the DECLARATION, not
    // on the value's shape. Pattern `R { zz: 1 }` is 11 characters at column
    // 19 of line 7.
    await expectRefused(
      lines(
        "schema Q { a: integer }",
        "schema R { b: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { R { zz: 1 } => "r-arm", _ => "other" }',
        "r",
      ),
      [extraField("zz", "R", patternRange(7, ARM_COLUMN, "R { zz: 1 }"))],
      "§Expected behaviour 1: the verdict is the declaration's field set, not the scrutinee's runtime shape, so the silent member of the class refuses on the same evidence as a1",
    );
  });
});

// ===========================================================================
// (v) The value position — the three controls, unchanged in both directions
// (bug 0226 §Reproduction (B)). The route adds call sites and edits no
// existing emission, so each keeps its code, count, range and message.
// ===========================================================================

describe("0226 (v) — the value position's verdicts are untouched", () => {
  it("v1: `let r = R { a: 1 }` keeps `extra-object-field` AND `missing-object-field`", () => {
    // The a1 field list written one position over. Both codes are
    // `checkObjectExpr`'s (src/parser/theta-document.ts:7545–:7554 for the
    // extra-field loop, and `checkObjectLiteralFields`,
    // src/parser/literal-sublanguage.ts:600, for the omission), and the second
    // is the one that must NOT follow the check into the pattern position
    // (cell b2). Both ranges are the whole object expression, measured:
    // `let r = ` is 8 characters, so `R { a: 1 }` spans columns 9–19 of line 5.
    expectDiagnostics(
      lines("schema R { b: integer }", "let r = R { a: 1 }", "r"),
      [
        extraField("a", "R", range(5, 9, 5, 19)),
        existing(MISSING_FIELD, "missing field 'b' on schema 'R'", range(5, 9, 5, 19)),
      ],
      "the constructor position's pair is unchanged in code, count, order and range: a1 asserts the FIRST code at the pattern position and cell b2 rules out the second",
    );
  });

  it("v2: `let r = R { a: 1 }` under `a: string` keeps `object-field-type-mismatch` at the VALUE's range", () => {
    // The a3 field list one position over. Note the range: the constructor
    // position points at the offending field VALUE (`1` at column 16 of line
    // 5), where the settled route's pattern-position emission points at the
    // whole PATTERN (element (1)) — a pattern node's range is the only range
    // the route adds, per §Fix constraint 1.
    expectDiagnostics(
      lines("schema R { a: string }", "let r = R { a: 1 }", "r"),
      [
        typeMismatch("a", "R", "string", "integer", range(5, 16, 5, 17)),
      ],
      "the type layer's constructor-position verdict keeps its code, count and range; the pattern-position emission is an added call site (cell a3), not an edit of this one",
    );
  });

  it("v3: `let r = Animal { a: 1 }` keeps `unresolved-named-type`", () => {
    // The a5 field list one position over, and the reason a5's head resolves
    // where this one does not: the constructor position carries the
    // brace-constructible requirement (code-registry-parse.md:107) that the
    // pattern head explicitly does not. `let r = ` is 8 characters, so
    // `Animal { a: 1 }` spans columns 9–24 of line 7.
    expectDiagnostics(
      lines(...ALIAS_SCHEMAS, "let r = Animal { a: 1 }", "r"),
      [
        existing(UNRESOLVED, "unresolved named type 'Animal'", range(7, 9, 7, 24)),
      ],
      "§Fix rules `unresolved-named-type` out for the field-set verdict by its own predicate — the pattern head DID resolve — so this row must keep exactly its landed emission",
    );
  });
});

// ===========================================================================
// (b) The must-not-move boundaries (bug 0226 §Reproduction (C) and §Expected
// behaviour 5). Every cell here is GREEN at HEAD and must stay green: a red
// means the route reached a position outside a resolved head's field list.
// ===========================================================================

describe("0226 (b) — the boundaries keep their silence and their values", () => {
  it("b1 [LOCK, §Fix (c)(5)]: two declared FIELD-COMPATIBLE schemas stay interchangeable", async () => {
    // Bug 0221 §Fix (c)(5)'s clean-by-design boundary, re-asserted here
    // independently of its own cell (`a5`,
    // tests/object-pattern-head-unresolved-refusal.test.ts:557). Both heads
    // resolve and both declare `a`, so the listed field IS declared: only
    // NOMINAL dispatch could separate them, and that language decision is held
    // open (§Non-goals). A route that reds this cell has made object patterns
    // nominal by accident (§Fix constraint 4).
    await expectClean(
      lines(
        "schema Q { a: integer }",
        "schema R { a: integer }",
        "let d = R { a: 2 }",
        'let r = match d { Q { a: 2 } => "q-arm", _ => "other" }',
        "r",
      ),
      "q-arm",
      "§Fix constraint 4: the field list IS carryable by the head's declaration, so the head is admitted and the field-compatible sibling still selects (expressions.md:171's field-shape reading)",
    );
  });

  it("b2 [rules out `missing-object-field`]: a SUBSET field list stays silent", async () => {
    // §Expected behaviour 4: a pattern lists a subset by design
    // (expressions.md:171 "unlisted fields are ignored"), so the omitted
    // declared field `b` is legal here and refused only at the constructor
    // (cell v1's second code). This is the boundary that rules
    // `theta/parse/missing-object-field` out of the pattern position, which
    // group (r) cell r3 states from the registry side.
    await expectClean(
      lines(
        "schema Q { a: integer, b: integer }",
        "let d = Q { a: 1, b: 2 }",
        'let r = match d { Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ),
      "q-arm",
      "§Expected behaviour 4: omission stays legal at a pattern head, so the field-name check is a SUBSET test and never an equality test",
    );
  });

  it("b3: the runtime's field-shape test still protects the correct arm", async () => {
    // §Reproduction B3: `R { b: 1 }` lists `b`, which `R` DOES declare, so the
    // field list is carryable and the arm is admitted — it does not
    // match a `Q`-constructed value, though. The correct arm answers. A route that
    // refused here would be judging the SCRUTINEE, not the declaration.
    await expectClean(
      lines(
        "schema Q { a: integer }",
        "schema R { b: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { R { b: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ),
      "q-arm",
      "the check reads the head's declaration only: a carryable field list is admitted whatever the scrutinee's shape, and dispatch stays byte-identical (§Fix constraint 2)",
    );
  });

  it("b4 [LOCK; dispatch re-vehicled by 0317 0.296.0]: an EMPTY field list on a declared head no longer captures an `Ok` value", async () => {
    // §Reproduction B4 and §Expected behaviour 5. The empty field list is the
    // empty SUBSET of `R`'s declared fields, so it is carryable and stays
    // SILENT at the parse layer — 0226's SUBJECT here (an empty-braced declared
    // head draws NO head-field-set refusal) is untouched: `expectClean` still
    // asserts a `[]` diagnostic list, and that assertion is unchanged.
    //
    // WHY the dispatch value flipped `"r-arm"` -> `"ok-arm"`: this cell's VEHICLE
    // was an `Ok(1)` Result carrier, and its RUNTIME DISPATCH is what bug 0317's
    // brand gate (`isObjectValue` in `matchPattern`'s object arm, 0.296.0)
    // legitimately changes — a `Result` carrier no longer takes the object arm,
    // so the empty-braced head `R { }` fails to match and control falls through
    // to `Ok(v) => "ok-arm"`. 0226's parse-layer non-refusal is preserved; only
    // the dispatch half is re-owned by 0317's brand gate. Parent-ratified
    // (Option A) as VEHICLE-COLLATERAL of 0317; new value verified by execution.
    await expectClean(
      lines(
        "schema R { a: string }",
        'let r = match Ok(1) { R { } => "r-arm", Ok(v) => "ok-arm", _ => "other" }',
        "r",
      ),
      "ok-arm",
      "§Fix constraint 4 (parse subject preserved): the empty-braced declared head still draws NO field-set refusal; 0317's brand gate (0.296.0) re-owns the dispatch half, so the `Ok(1)` carrier fails the object arm and falls through to `Ok(v)`",
    );
  });

  it("b5 [LOCK; dispatch re-vehicled by 0317 0.296.0]: the bare object pattern `{ }` no longer captures the `Ok` value", async () => {
    // §Reproduction B5, the pair to b4: the headless form
    // (src/parser/theta-document.ts:4507, returning `typeName: null`) has no
    // declaration to judge against at all, so it stays SILENT at the parse
    // layer (zero diagnostics) — 0226's preserved SUBJECT, and `expectClean`'s
    // `[]` assertion is unchanged.
    //
    // WHY the dispatch value flipped `"bare-arm"` -> `"ok-arm"`: same re-vehicle
    // as b4 — the `Ok(1)` Result carrier fails bug 0317's brand gate
    // (`isObjectValue` in `matchPattern`'s object arm, 0.296.0), so the bare `{ }`
    // pattern fails to match and control falls through to `Ok(v) => "ok-arm"`.
    // Parent-ratified (Option A) as VEHICLE-COLLATERAL of 0317; new value
    // verified by execution.
    await expectClean(
      lines(
        'let r = match Ok(1) { { } => "bare-arm", Ok(v) => "ok-arm", _ => "other" }',
        "r",
      ),
      "ok-arm",
      "a headless object pattern still draws nothing at the parse layer; 0317's brand gate (0.296.0) re-owns the dispatch half, so the `Ok(1)` carrier fails the object arm and falls through to `Ok(v)`",
    );
  });

  it("b6 [LOCK, deferral]: an `enum` head DEFERS with any field list", async () => {
    // §Reproduction B6 / §Fix constraint 3, and bug 0221's cell `u4`. An
    // `enum` name resolves at the pattern head (the universe admits every
    // identifier after an `enum` token, `patternHeadTypeNames`,
    // src/parser/theta-document.ts:4586) and supplies NO same-file object
    // field set, so there is nothing to judge the list against. A route that
    // refused here would be judging a field list against a declaration it does
    // not hold.
    await expectClean(
      lines(
        "schema Q { a: integer }",
        "enum E { one, two }",
        "let d = Q { a: 1 }",
        'let r = match d { E { a: 1 } => "e-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ),
      "e-arm",
      "§Fix constraint 3: the `enum` head is a pinned deferral — `StructuralRefs.schemas` (src/parser/theta-document.ts:6545) holds object-form `schema` fields only",
    );
  });

  it("b7 [LOCK, deferral]: the builtin `QueryError` head DEFERS with any field list", async () => {
    // §Reproduction B7 / §Fix constraint 3, and bug 0221's cells `u1`/`u2`.
    // `QueryError` comes from `BUILTIN_VALUE_NAMES`
    // (src/parser/theta-document.ts:5219, which carries it at :5228) and has
    // no same-file field bodies. This is the deferral that carries the THREE
    // committed examples (group (f)), so a red here newly refuses shipped
    // source.
    await expectClean(
      lines(
        "schema Q { a: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { QueryError { a: 1 } => "qe-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ),
      "qe-arm",
      "§Fix constraint 3: the builtin error-model head defers, and it is the deferral the committed corpus depends on (group (f))",
    );
  });

  it("b8a [AMENDED boundary]: the listed field must be PRESENT in the value — written field-compatibly", async () => {
    // §Reproduction B8's SUBJECT, preserved. THE DOC CORRECTION this file
    // carries: the document's literal B8 spelling (`schema R { a: string }`
    // with the pattern `R { a: 1 }`) is itself an instance of element (4) — a
    // DECLARED field with an incompatible literal — so it CANNOT keep `[]`
    // under the settled route; cell b8b pins its amended verdict. B8's subject
    // is only that the listed field must be present in the value for the wrong
    // arm to fire, which is what makes a1's and a6's coincidence the sharp
    // shape, and that subject is preserved by declaring `a: integer` so the
    // field list is carryable. `Ok(1)` has no field `a`, so the arm does not
    // match and the correct arm answers.
    await expectClean(
      lines(
        "schema R { a: integer }",
        'let r = match Ok(1) { R { a: 1 } => "r-arm", Ok(v) => "ok-arm", _ => "other" }',
        "r",
      ),
      "ok-arm",
      "the amended B8: a carryable field list on a declared head is admitted, and the runtime's field-shape test rejects the arm because the value lacks the listed field",
    );
  });

  it("b8b [DOC CORRECTION]: the document's literal B8 spelling is a now-refused member of the a3/a4 class", async () => {
    // The correction stated as an assertion. `R` declares `a: string`, the
    // pattern lists `a: 1`, so this is a3's shape with an `Ok(1)` scrutinee —
    // element (4) refuses it, and the bug document's §Reproduction (C) listing
    // of it as a `[]` boundary is wrong on its own §Expected behaviour 2.
    // Columns on line 5: `match`=9–13, ` `=14, `Ok(1)`=15–19, ` `=20, `{`=21,
    // ` `=22, so the pattern `R { a: 1 }` (10 characters) starts at column 23.
    await expectRefused(
      lines(
        "schema R { a: string }",
        'let r = match Ok(1) { R { a: 1 } => "r-arm", Ok(v) => "ok-arm", _ => "other" }',
        "r",
      ),
      [
        typeMismatch(
          "a",
          "R",
          "string",
          "integer",
          patternRange(5, OK_ARM_COLUMN, "R { a: 1 }"),
        ),
      ],
      "the DOC CORRECTION: §Reproduction (C) row B8 lists this spelling as a must-not-move `[]`, but it is an instance of §Expected behaviour 2 — a declared field with an incompatible literal — so it refuses, and cell b8a carries B8's actual subject",
    );
  });
});

// ===========================================================================
// (x) Rows measured for this route beyond the bug document's tables. x1, x2
// and x5 are GREEN at HEAD and must stay green (they bound the four
// elements); x3 and x6 are RED at HEAD and are NOT in the document's
// must-not-move set, so their AMENDED form is pinned here. x4 is the single
// flip bug 0234 authorises (§Fix constraint 4): FLIPPED from a pinned `[]`
// deferral to the narrowing refusal.
// ===========================================================================

describe("0226 (x) — the route's own boundaries, measured", () => {
  it("x1 [bounds element (3)]: an alias head with an EMPTY field list stays silent", async () => {
    // The pair to a5, and what makes element (3) a SUBSET test rather than a
    // blanket refusal of the alias head: the empty list is a subset of the
    // empty declared set, so `Animal { }` draws nothing and keeps its value.
    // A route that refused the fieldless HEAD rather than each listed FIELD
    // would red here.
    await expectClean(
      lines(
        ...ALIAS_SCHEMAS,
        "schema Q { a: integer }",
        "let v = Q { a: 1 }",
        'let r = match v { Animal { } => "animal-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ),
      "animal-arm",
      "element (3): the alias head is FIELDLESS, so every LISTED field is reported and an empty list reports nothing — the refusal is per-field, not per-head",
    );
  });

  it("x2 [bounds element (2)'s recursion]: a nested all-declared pattern stays silent", async () => {
    // a6's shape with the wrong inner head removed: `Outer` declares `i` and
    // `Inner` declares `z`, so the recursion visits both and refuses neither.
    // The pair that shows a6's red is the inner head's field set and not the
    // recursion itself.
    await expectClean(
      lines(
        "schema Inner { z: integer }",
        "schema Outer { i: Inner }",
        "let d = Outer { i: Inner { z: 1 } }",
        'let r = match d { Outer { i: Inner { z: 1 } } => "inner-arm", _ => "none" }',
        "r",
      ),
      "inner-arm",
      "the recursion into object field sub-patterns must be silent when every listed field at every depth is declared",
    );
  });

  it("x3 [CHANGED, amended]: an array ELEMENT's head is refused too", async () => {
    // NOT in the bug document's must-not-move set: element (2) recurses into
    // ARRAY ELEMENTS as well as object field sub-patterns, so the class inside
    // an array element is refused. At HEAD this row draws `[]` and answers
    // "other" (the value's `a` is not the pattern's `zz`), so it is a silent
    // member of the class exactly as a7 is. Columns on line 6: `{`=17, ` `=18,
    // `[`=19, so the element pattern `Q { zz: 1 }` (11 characters) starts at
    // column 20.
    await expectRefused(
      lines(
        "schema Q { a: integer }",
        "let d = [Q { a: 1 }]",
        'let r = match d { [Q { zz: 1 }] => "arr-arm", _ => "other" }',
        "r",
      ),
      [extraField("zz", "Q", patternRange(6, ARM_COLUMN + 1, "Q { zz: 1 }"))],
      "element (2) recurses into array elements, so an undeclared listed field is refused at the element pattern's own range; this row is pinned in its AMENDED form because the bug document does not list it among the must-not-move boundaries",
    );
  });

  it("x4 [FLIPPED by bug 0234]: a non-integral literal under an `integer` field is now refused", async () => {
    // Number literals type as `integer` when integral and `number`
    // otherwise. Per bug 0234 §Fix disposition 1
    // (docs/bugs/0234-pattern-field-literal-integer-narrowing-deferred.md),
    // `checkObjectFieldCompat`'s (src/parser/type-compat.ts:526) whole
    // verdict is kept at the pattern position, so `Q { a: 1.5 }` under
    // `a: integer` draws `theta/parse/integer-narrowing` at the whole
    // pattern's range and the arm does not register. The two codes
    // (`theta/parse/integer-narrowing` and
    // `theta/parse/object-field-type-mismatch`) are mutually exclusive per
    // field. This is the single flip bug 0234 §Fix constraint 4 authorises
    // in this file (cell x4).
    // Pattern `Q { a: 1.5 }` is 12 characters at column 19 of line 6.
    await expectRefused(
      lines(
        "schema Q { a: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1.5 } => "n-arm", _ => "other" }',
        "r",
      ),
      [narrowing(patternRange(6, ARM_COLUMN, "Q { a: 1.5 }"))],
      "bug 0234 §Fix disposition 1: the pattern position narrows, so `checkObjectFieldCompat`'s `theta/parse/integer-narrowing` verdict now reaches the diagnostic list instead of being filtered out",
    );
  });

  it("x5 [bounds element (4)]: the shorthand under a declared, compatible field stays silent", async () => {
    // The shorthand lists a field with NO literal to judge, so element (4)
    // has nothing to say and element (2) is satisfied — the arm binds and
    // answers. The pair to a2: a2's red is the field NAME, never the
    // shorthand spelling.
    await expectClean(
      lines(
        "schema Q { a: string }",
        'let d = Q { a: "x" }',
        'let r = match d { Q { a } => a, _ => "other" }',
        "r",
      ),
      "x",
      "element (4) judges LITERAL sub-patterns only, so a shorthand binder under a declared field is silent and its binding still reaches the arm body",
    );
  });

  it("x6 [CHANGED, amended]: `Q { a: null }` under a `boolean` field is refused by the type half", async () => {
    // NOT in the bug document's must-not-move set: `null` is a literal
    // sub-pattern, so element (4) judges it through
    // `checkObjectFieldCompat` (src/parser/type-compat.ts:526) and it is
    // incompatible with the declared `boolean`. At HEAD the row draws `[]` and
    // answers "other". Pattern `Q { a: null }` is 13 characters at column 19
    // of line 6.
    await expectRefused(
      lines(
        "schema Q { a: boolean }",
        "let d = Q { a: true }",
        'let r = match d { Q { a: null } => "null-arm", _ => "other" }',
        "r",
      ),
      [
        typeMismatch(
          "a",
          "Q",
          "boolean",
          "null",
          patternRange(6, ARM_COLUMN, "Q { a: null }"),
        ),
      ],
      "element (4) judges every LITERAL sub-pattern, `null` included; this row is pinned in its AMENDED form because the bug document does not list it among the must-not-move boundaries",
    );
  });

  it("x7 [bounds element (2)'s recursion into constructor inners, name half]: `Ok(R { zz: 1 })` is refused too", async () => {
    // Neither recursion branch had a witness at the `case "constructor"` arm
    // before this cell: `checkPatternObjectFields` recurses into
    // `pattern.inner` (src/parser/theta-document.ts:7632–7633) for a
    // constructor pattern exactly as it recurses into object field
    // sub-patterns (a6) and array elements (x3), so an undeclared field one
    // level inside `Ok(...)` must refuse identically. Without this cell,
    // deleting that `case "constructor"` arm survives the suite. Columns on
    // line 6: `let r = match d { `=1–18 (ARM_COLUMN=19), `Ok(`=19–21, so the
    // inner pattern `R { zz: 1 }` (11 characters) starts at column 22.
    await expectRefused(
      lines(
        "schema R { b: integer }",
        "let d = Ok(1)",
        'let r = match d { Ok(R { zz: 1 }) => "r-arm", _ => "other" }',
        "r",
      ),
      [extraField("zz", "R", patternRange(6, ARM_COLUMN + 3, "R { zz: 1 }"))],
      "element (2)'s recursion must reach a constructor pattern's inner exactly as it reaches an object field sub-pattern or an array element, and the refusal lands at the INNER pattern's range",
    );
  });

  it("x8 [bounds element (2)'s recursion into constructor inners, type half]: `Ok(R { a: 1 })` under `a: string` is refused too", async () => {
    // The type-half twin of x7: `checkPatternFieldTypes`'s own `case
    // "constructor"` arm (src/parser/type-layer-checks.ts:2190–2191) recurses
    // into `pattern.inner` exactly as its object-field and array-element
    // branches do. Without this cell, deleting that arm also survives the
    // suite. Same column arithmetic as x7: the inner pattern `R { a: 1 }` (10
    // characters) starts at column 22 of line 6.
    await expectRefused(
      lines(
        "schema R { a: string }",
        "let d = Ok(1)",
        'let r = match d { Ok(R { a: 1 }) => "r-arm", _ => "other" }',
        "r",
      ),
      [
        typeMismatch(
          "a",
          "R",
          "string",
          "integer",
          patternRange(6, ARM_COLUMN + 3, "R { a: 1 }"),
        ),
      ],
      "the type half's recursion must reach a constructor pattern's inner exactly as it reaches an object field sub-pattern or an array element, and the refusal lands at the INNER pattern's range",
    );
  });
});

// ===========================================================================
// (f) The corpus sweep — §Fix constraint 9's GOV-15 half, RE-DERIVED rather
// than taken from §Reproduction (D)'s census.
// ===========================================================================

describe("0226 (f) — the committed corpus gains no refusal", () => {
  it("f1: every committed object-pattern arm head is `QueryError`, and no corpus file gains either code", () => {
    // §Fix constraint 9: the census (34 files, three object-pattern arms,
    // every head `QueryError`) is a measurement, not a licence, so it is
    // re-derived here. The regex admits the committed `})` shape — the arm's
    // `}` followed by `)` before the arrow, as in
    // `Err(QueryError { kind: "…" }) =>` — which is what bug 0221's
    // *Residuals* 2 records the naive `\{[^}]*\} *=>` regex missing (the
    // precedent is bug 0221's cell `f1`,
    // tests/object-pattern-head-unresolved-refusal.test.ts:994).
    const listed = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Fail LOUDLY on an empty list (CLAUDE.md): a sweep over nothing reports
    // success while verifying nothing, and this file's GOV-15 half is the
    // whole reason the sweep exists. tests/committed-fixture-parse-gate.test.ts
    // is the gate that discharges a corpus-wide parse claim, and per bug 0132
    // it filters `.theta` only — so the `.thetalib` half of THIS sweep is a
    // probe and cannot be delegated to it.
    expect(
      listed.length,
      "`git ls-files -- '*.theta' '*.thetalib'` must report the tracked corpus; an empty list means the sweep verified nothing",
    ).toBeGreaterThan(0);

    // The head is optional in the capture so a BARE `{ … } =>` arm is found
    // too: a headless arm has no declaration to judge (cell b5), but an
    // unheaded MATCH here would mean the sweep's head census is incomplete.
    const armWithHead = /([A-Za-z_][A-Za-z0-9_]*)?[ \t]*\{[^{}]*\}[\s)]*=>/g;
    const heads: string[] = [];
    const filesWithArms: string[] = [];
    const offenders: string[] = [];
    for (const relative of listed) {
      const bytes = new Uint8Array(
        readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url))),
      );
      const text = new TextDecoder().decode(bytes);
      armWithHead.lastIndex = 0;
      let match = armWithHead.exec(text);
      let sawArm = false;
      while (match !== null) {
        sawArm = true;
        heads.push(`${relative}: ${match[1] ?? "<bare>"}`);
        match = armWithHead.exec(text);
      }
      if (sawArm) {
        filesWithArms.push(relative);
      }
      const doc = parseDocBytes(bytes, relative);
      for (const d of doc.diagnostics) {
        if (d.code === EXTRA_FIELD || d.code === TYPE_MISMATCH) {
          offenders.push(`${relative}: ${d.code}: ${d.message}`);
        }
      }
    }

    expect(
      filesWithArms,
      "the re-derived sweep must find exactly the three committed `Err(QueryError { … }) =>` files; a shorter list means the regex stopped catching the shape §Reproduction (D)'s naive regex missed",
    ).toEqual([
      "docs/examples/configure-tool-loop.theta",
      "docs/examples/fan-out-reviews.theta",
      "docs/examples/handle-error.theta",
    ]);
    expect(
      heads,
      "every committed object-pattern arm head must be `QueryError`, a builtin with no same-file field bodies (cell b7's deferral) — that is what bounds the corpus blast radius of a check that judges a field list against a resolved same-file object schema",
    ).toEqual([
      "docs/examples/configure-tool-loop.theta: QueryError",
      "docs/examples/fan-out-reviews.theta: QueryError",
      "docs/examples/handle-error.theta: QueryError",
    ]);
    expect(
      offenders,
      "no shipped theta may gain either refusal: the corpus blast radius is re-measured, never assumed",
    ).toEqual([]);
  });
});
