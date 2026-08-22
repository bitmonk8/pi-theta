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

// Bug 0234 — at a `match` object-pattern head, a `number`-SPELLED numeric
// literal under an `integer`-declared field of a same-file object-form schema
// draws nothing: `match d { Q { a: 1.0 } => … }` where `schema Q { a: integer }`
// draws `[]`, registers, and SELECTS that arm, while the identical literal in
// the CONSTRUCTOR position and at a typed `let`, a `params:` default, a
// reassignment and an `array<integer>` element each draw
// `theta/parse/integer-narrowing`
// (docs/bugs/0234-pattern-field-literal-integer-narrowing-deferred.md).
//
// WHY the position is silent today, in two distinct mechanisms — the
// distinction §Fix constraint 1 turns on:
//
//   * `Q { a: 1.5 }` — the verdict IS computed and DISCARDED, BEFORE THIS FIX.
//     Symbol `TypeLayerWalk.checkPatternFieldTypes` (src/parser/type-layer-checks.ts,
//     declared at src/parser/type-layer-checks.ts:2202) routes each LITERAL
//     field sub-pattern through `checkObjectFieldCompat`
//     (src/parser/type-compat.ts:526), whose `r === "integer-narrowing"` branch
//     (src/parser/type-compat.ts:540) builds the diagnostic — and, before this
//     fix, the `.filter` on `TypeLayerWalk.checkPatternFieldTypes`'s
//     `checkObjectFieldCompat` call (src/parser/type-layer-checks.ts;
//     this fix removes the filter and keeps both codes) discarded it
//     down to `theta/parse/object-field-type-mismatch` alone.
//   * `Q { a: 1.0 }` and `Q { a: 1e10 }` — the verdict is NEVER computed, BEFORE
//     THIS FIX. `patternLiteralType` (src/parser/type-layer-checks.ts:1252,
//     pre-fix) typed a numeric pattern literal by `Number.isInteger(value)`,
//     i.e. by the parsed JS value's shape rather than by the source spelling
//     that docs/spec_topics/lexical.md:28 makes normative, so both spellings
//     typed `integer`, `checkCompatible` (src/parser/type-compat.ts, narrowing
//     return at src/parser/type-compat.ts:334) answered `"compatible"`, and the
//     filter above was not even reached.
//
// The spelling was DROPPED, not absent: `Token.numericType`
// (src/lexer/lexer.ts:54, computed at src/lexer/lexer.ts:636 as
// `isFractional ? "number" : "integer"`, pushed at src/lexer/lexer.ts:660) is
// carried onto `NumberExpr` by the EXPRESSION path
// (src/parser/theta-document.ts:4278, `numericType: t.numericType ?? "integer"`,
// the field declared at src/parser/theta-document.ts:141) and, before this
// fix, discarded by `BodyParser.parsePattern`'s number branch
// (src/parser/theta-document.ts:4628, then a bare `return { kind: "literal",
// value: Number(t.text) }`), so the `PatternNode` literal variant
// (src/parser/theta-document.ts:304) carried the parsed value alone. This fix
// carries the token's `numericType` onto that variant instead.
//
// THE CONTRACT UNDER TEST is §Fix DISPOSITION 1, settled for this run: THE
// PATTERN POSITION NARROWS. A `number`-spelled numeric literal in a `match`
// object-pattern field, under an `integer`-declared field of a same-file
// object-form schema, draws `theta/parse/integer-narrowing` with the message
// `cannot narrow number to integer` at the WHOLE object-pattern's range (§Fix
// constraint 7 — the object variant's `range`, the only range a `PatternNode`
// carries, is what row A5 measures at 6:19-6:31 today). No code is minted and
// no *Message* column moves (§Fix constraint 5), so
// tests/fixtures/h7a/permitted-codes.json is untouched; the disposition is
// DIAG-2 as a *Trigger* WIDENING of
// docs/spec_topics/diagnostics/code-registry-parse.md:27 plus the DELETION of
// the deferral sentence carried today on
// docs/spec_topics/diagnostics/code-registry-parse.md:49.
//
// NO RUNTIME DISPATCH CHANGE (§Fix constraint 2): `matchPattern`'s literal arm
// (src/runtime/match-result.ts:181, `valuesEqual(value, pattern.value)` over
// `valuesEqual` in src/runtime/value.ts) stays byte-identical, so `1.0` keeps
// matching the field value `1`. The greenable form of a wrong-arm claim is
// therefore the registration DENIAL (`hasLoadParseError`,
// src/extension/production-composition.ts:2220), never a changed value — which
// is why every (a) cell below asserts the denial and carries the arm the body
// ANSWERS in its failure payload (A2 and A3 answer `"n-arm"` at HEAD).
//
// LOCKS this file must not red (§Fix constraint 4):
// tests/object-pattern-head-field-set-refusal.test.ts (bug 0226, 32 cells),
// tests/object-pattern-head-unresolved-refusal.test.ts (bug 0221, 43 cells) and
// tests/reserved-keyword-object-pattern-head-refusal.test.ts (bug 0219, 54
// cells). The single flip disposition 1 authorises is bug 0226's cell `x4`,
// tests/object-pattern-head-field-set-refusal.test.ts, which pins row
// A1's `[]` and `"other"` as a deliberate deferral. Amending it belongs to the
// FIX, not to this witness, so this file leaves that file untouched and states
// the conflict in its report instead.
//
// TIER — unit, offline, provider-free, deterministic, inside the default
// `npm test` gate. Both observables settle in-process: the diagnostic list at
// the `parseThetaDocument` boundary (through `parseDoc`, tests/helpers/e2e-s1.ts)
// and the selected arm's value inside one `executeBody` over the production
// prompt-mode binding (`createProductionProducerDeps` +
// `bindPromptConversation`). No provider, model, child process or socket is on
// either path, so an integration tier adds no observable reachable only there.
// The registration outcome the route changes is additionally witnessed live, on
// bug 0226's precedent, by
// tests/live/pattern-field-integer-narrowing-live-cell-.test.ts.
//
// NO SILENT SKIPPING (CLAUDE.md): the registry oracle throws naming an absent
// row, the corpus sweep fails loudly on an empty `git ls-files` result, and
// every other expectation is a literal substituted through the oracle — so the
// primary reds are the MISSING REFUSAL and the un-widened *Trigger*, the
// symptoms bug 0234 describes, and never an oracle miss. 

// ===========================================================================
// Codes. Both are already registered; this file mints nothing. 
// ===========================================================================

/** The narrowing verdict (code-registry-parse.md:27), phase `type`. */
const NARROWING = "theta/parse/integer-narrowing";

/** Bug 0226's landed field-TYPE verdict (code-registry-parse.md:49). */
const TYPE_MISMATCH = "theta/parse/object-field-type-mismatch";

/** Row B7's second, unmoved code. */
const ARRAY_ELEMENT_MISMATCH = "theta/parse/array-element-type-mismatch";

/** Row B8's own code — the measured exception, not this class (§Non-goals). */
const FN_ARG_MISMATCH = "theta/parse/fn-arg-type-mismatch";

/** Row B5's second diagnostic: the probe body's own artefact. */
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";

// ===========================================================================
// (r) The registry oracle — DIAG-4's source of truth for every rendering below,
// and DIAG-2's evidence that disposition 1 mints no row. 
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY_TEXT = readRepoFile(REGISTRY_PARSE_PAGE);
const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

/**
 * The registry row for `code`, or a throw naming the absent row (no silent
 * skipping: a missing row must fail the oracle loudly, not default a message).
 */
function row(code: string): RegistryRow {
  const found = REGISTRY.find((r) => r.code === code);
  if (found === undefined) {
    throw new Error(
      `${REGISTRY_PARSE_PAGE} carries no row for ${code} — bug 0234's oracle for that row has no source`,
    );
  }
  return found;
}

const NARROWING_MESSAGE: string = registryMessage(REGISTRY, NARROWING) as string;
const TYPE_MISMATCH_TEMPLATE: string = registryMessage(REGISTRY, TYPE_MISMATCH) as string;

/**
 * The two *Trigger* substrings disposition 1 must put on the narrowing row, and
 * the sentence it must remove from the registry page. The widened wording is
 * the implementer's; these are the stable anchors the wording must satisfy.
 */
const TRIGGER_REQUIRED = ["`match` object-pattern", "pattern field literal"] as const;
const DEFERRAL_SENTENCE = "is a deferral at that position";

describe("0234 (r) — the registered row the refusal renders from, and the deferral sentence it deletes — ", () => {
  it("r1: `integer-narrowing` stays an `E`/`type` row in the `theta/parse/` namespace with its *Message* unmoved — ", () => {
    const found = row(NARROWING);
    expect(
      found.severity,
      `${NARROWING} must stay an E row: an error-severity \`theta/parse/\` code is what \`hasLoadParseError\` (src/extension/production-composition.ts:2220) turns into the registration denial that IS the refusal`,
    ).toBe("E");
    expect(
      found.phase,
      `${NARROWING} is the type layer's verdict, routed from \`checkObjectFieldCompat\` (src/parser/type-compat.ts:526), so its registered phase stays \`type\``,
    ).toBe("type");
    expect(
      found.code.startsWith("theta/parse/"),
      `${NARROWING} sits in the \`theta/parse/\` NAMESPACE even though its phase is \`type\`, which is what makes \`hasLoadParseError\` (src/extension/production-composition.ts:2220) deny registration for every (a) cell`,
    ).toBe(true);
    expect(
      NARROWING_MESSAGE,
      "§Fix constraint 5 (DIAG-4, docs/spec_topics/diagnostics/diagnostic-shape.md:74): the *Message* column does not move, so the message-only mirror docs/reference/diagnostics.md:73 needs no edit",
    ).toBe("cannot narrow number to integer");
  });

  it("r2: `integer-narrowing`'s *Trigger* names the `match` object-pattern position and its pattern field literal — ", () => {
    // THE REGISTRY CELL. Disposition 1 is DIAG-2 as a *Trigger* WIDENING of
    // docs/spec_topics/diagnostics/code-registry-parse.md:27, whose text today
    // names NO position at all ("`number` value used where `integer` is
    // expected (the `integer → number` widening is one-way)."). The widened
    // WORDS are the implementer's; the two anchors this cell requires, verbatim
    // and case-sensitive, are:
    //   1. "`match` object-pattern"  — the backticked keyword followed by
    //      `object-pattern`, naming the position the verdict is now emitted at.
    //      Any continuation is admitted ("… object-pattern head",
    //      "… object-pattern field").
    //   2. "pattern field literal"  — the three words in that order, naming
    //      the sub-pattern the verdict is computed for, so the row does not
    //      read as covering a whole-pattern or scrutinee verdict.
    // A row that carries both, in any surrounding prose, satisfies this cell.
    const trigger = row(NARROWING).trigger;
    for (const required of TRIGGER_REQUIRED) {
      expect(
        trigger,
        `§Expected behaviour 1 and §Fix disposition 1: the row that CARRIES the rule must state it. ${NARROWING}'s *Trigger* must contain ${JSON.stringify(required)}; today it names no position at all.\n  actual *Trigger*: ${JSON.stringify(trigger)}`,
      ).toContain(required);
    }
  });

  it("r3: `object-field-type-mismatch` keeps its *Message* and no longer states the deferral — ", () => {
    // The other half of the DIAG-2 move: today the pattern-position exemption
    // lives on THIS row (docs/spec_topics/diagnostics/code-registry-parse.md:49)
    // — "The pattern-position TYPE-2 outcome (`theta/parse/integer-narrowing`)
    // is a deferral at that position: a pattern literal carries no lexed
    // numeric spelling to distinguish `1` from `1.0` …" — a cause that holds of
    // the node bug 0226 built and not of the token at the site
    // (src/lexer/lexer.ts:660 against src/parser/theta-document.ts:4628). Under
    // disposition 1 that sentence is replaced by the emission rule, so the
    // exact anchor required here is the ABSENCE of the substring
    // "is a deferral at that position" from the WHOLE registry page — not only
    // from this row — so the sentence cannot survive by moving elsewhere on the
    // page.
    const found = row(TYPE_MISMATCH);
    expect(
      TYPE_MISMATCH_TEMPLATE,
      "§Fix constraint 5: bug 0226's field-TYPE *Message* stays character-for-character, which is what row a5 renders from",
    ).toBe(
      "field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>",
    );
    expect(found.phase, `${TYPE_MISMATCH} keeps its registered phase`).toBe("type");
    expect(
      REGISTRY_TEXT.includes(DEFERRAL_SENTENCE),
      `§Fix disposition 1: ${REGISTRY_PARSE_PAGE} must no longer state ${JSON.stringify(DEFERRAL_SENTENCE)} — the pattern-position TYPE-2 outcome is no longer a deferral, and the sentence's stated cause ("a pattern literal carries no lexed numeric spelling") is contradicted by src/lexer/lexer.ts:660 and src/parser/theta-document.ts:4628`,
    ).toBe(false);
  });

  it("r4: no code is minted for the pattern position — ", () => {
    // §Fix constraint 5: disposition 1 reuses the two registered rows and mints
    // nothing, so tests/fixtures/h7a/permitted-codes.json is byte-untouched.
    expect(
      REGISTRY.filter((r) => r.code === NARROWING || r.code === TYPE_MISMATCH).map(
        (r) => r.code,
      ),
      "both rows must be present: the refusal renders from these two",
    ).toEqual([NARROWING, TYPE_MISMATCH]);
    expect(
      REGISTRY.filter((r) => /narrow/.test(r.code)).map((r) => r.code),
      "no second narrowing row: a minted `theta/parse/…pattern…narrow…` code would be a new code where §Fix constraint 5 admits none",
    ).toEqual([NARROWING]);
  });
});

// ===========================================================================
// Parse harness — the shipped `parseThetaDocument` through `parseDoc`
// (tests/helpers/e2e-s1.ts). 
// ===========================================================================

/** Every row is a whole prompt-mode theta; frontmatter occupies lines 1–3. */
const FM = "---\nmode: prompt\n---\n";

const FILE = "bug0234.theta";

function theta(body: string): ThetaDocument {
  return parseDoc(FM + body, FILE);
}

/** A whole theta source given verbatim, for the `params:` row B5. */
function thetaRaw(src: string): ThetaDocument {
  return parseDoc(src, FILE);
}

/** A body assembled from lines, so a cell's line numbers read off its array. */
function lines(...parts: readonly string[]): string {
  return parts.join("\n") + "\n";
}

/**
 * A diagnostic reduced to the five normative fields
 * (docs/spec_topics/diagnostics/diagnostic-shape.md §"Internal diagnostic
 * shape"). `hint` is excluded on purpose: it is a non-normative repair aid
 * carried in its own registry column.
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
 * The PATTERN's span, derived from its source spelling alone: §Fix constraint 7
 * pins the emission to the whole object-pattern's range, the object variant's
 * `range` bug 0226 added (src/parser/theta-document.ts:333). The caller states
 * the line, the start column and the pattern text, and the end column is
 * `start + text.length` because the range's end column is exclusive — which is
 * exactly what row a5's measured `6:19-6:31` for `Q { a: "x" }` (12 characters
 * at column 19) confirms against the tree.
 */
function patternRange(line: number, column: number, pattern: string): SourceRange {
  return range(line, column, line, column + pattern.length);
}

/** The expected narrowing refusal, rendered through the registry oracle. */
function narrowing(at: SourceRange): DiagShape {
  return {
    severity: "error",
    code: NARROWING,
    file: FILE,
    range: at,
    message: NARROWING_MESSAGE,
  };
}

/** Fill a registry *Message* template's `<placeholder>` slots. */
function fill(template: string, slots: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [name, value] of Object.entries(slots)) {
    const token = `<${name}>`;
    if (!out.includes(token)) {
      throw new Error(
        `registry *Message* template ${JSON.stringify(template)} has no ${token} slot — bug 0234's oracle cannot render it`,
      );
    }
    out = out.split(token).join(value);
  }
  return out;
}

/** Bug 0226's field-TYPE refusal, rendered through the registry oracle. */
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

/** An expected diagnostic from a code this fix does not move. */
function existing(code: string, message: string, at: SourceRange): DiagShape {
  return { severity: "error", code, file: FILE, range: at, message };
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
 * Assert a document's WHOLE diagnostic list, order-sensitive and unfiltered.
 *
 * `assembleDiagnostics` (src/diagnostics/diagnostic.ts) orders by
 * (file, line, column) with a stable sort, so a multi-diagnostic row's expected
 * order is positional and measured, never guessed (row B5 and row B7).
 */
function expectDiagnosticsOf(
  doc: ThetaDocument,
  expected: readonly DiagShape[],
  why: string,
): ThetaDocument {
  expect(shapes(doc), `${why}\n  actual diagnostics: ${render(doc)}`).toEqual([...expected]);
  return doc;
}

function expectDiagnostics(
  body: string,
  expected: readonly DiagShape[],
  why: string,
): ThetaDocument {
  return expectDiagnosticsOf(theta(body), expected, why);
}

/**
 * Whether `diagnostics` denies registration. `hasLoadParseError`
 * (src/extension/production-composition.ts:2220) is module-private — `rg -n
 * 'export.*hasLoadParseError' src/` matches nothing — so the predicate is
 * mirrored here clause for clause: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. It is the mechanism that turns
 * this fix's diagnostics into the refusal (§Fix constraint 2), so every (a)
 * cell asserts it directly.
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
// (bug 0226's witness shape, symbols `producer` / `execute` / `expectValue`).
// Offline, provider-free: a query-free prompt body dispatches no model. 
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
    slashName: "bug0234",
    sourcePath: "/bug0234-cells.theta",
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
 * (measured at HEAD — A1 `"other"`, A2 `"n-arm"`, A3 `"n-arm"`, A4 `"other"`,
 * A6 `"none"`, A7 `"other"`) rather than only a missing diagnostic.
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
  expectDiagnosticsOf(doc, expected, why);
}

/** Assert a boundary row keeps BOTH its silence and its measured value. */
async function expectClean(body: string, value: ThetaValue, why: string): Promise<void> {
  const doc = expectDiagnostics(body, [], why);
  await expectValue(doc, value, why);
}

/**
 * Assert a cross-sink control's whole diagnostic list AND that it denies
 * registration. No value is asserted: a refused theta never registers, so its
 * body's value is not an observable of the contract.
 */
function expectSinkRefusal(
  doc: ThetaDocument,
  expected: readonly DiagShape[],
  why: string,
): void {
  expect(
    deniesRegistration(doc.diagnostics),
    `${why}\n  actual diagnostics: ${render(doc)}`,
  ).toBe(true);
  expectDiagnosticsOf(doc, expected, why);
}

// ===========================================================================
// Column derivation, used by every cell below. Frontmatter occupies lines 1–3,
// so the first body line is line 4. In `let r = match d { PATTERN => …` the
// characters are `l`=1 … `match`=9–13, ` `=14, `d`=15, ` `=16, `{`=17, ` `=18,
// so the arm's pattern starts at column 19 — the constant below, cross-checked
// against row a5's measured `6:19-6:31`. 
// ===========================================================================

/** The arm-pattern start column after a one-character scrutinee. */
const ARM_COLUMN = 19;

/** The three shared lines every (a) and (c) row opens with. */
const INTEGER_SCHEMA = "schema Q { a: integer }";

// ===========================================================================
// (a) The class — a `number`-spelled numeric literal in a `match`
// object-pattern field under an `integer`-declared field (bug 0234
// §Reproduction (A)). Every cell here is RED at HEAD: `[]`, and the arm the
// body answers named in the payload. 
// ===========================================================================

describe("0234 (a) — a `number`-spelled pattern field literal under an `integer` field is refused — ", () => {
  it("a1 [flips bug 0226's cell x4]: `Q { a: 1.5 }` under `a: integer` is refused — ", async () => {
    // §Reproduction A1: the verdict IS computed here and, before this fix, was
    // dropped by the `.filter` on `TypeLayerWalk.checkPatternFieldTypes`'s
    // `checkObjectFieldCompat` call (src/parser/type-layer-checks.ts).
    // This is the row bug
    // 0226's cell `x4`, tests/object-pattern-head-field-set-refusal.test.ts,
    // pins as `[]` / `"other"`, and the single flip §Fix constraint 4
    // authorises there — the flip belongs to the implementer, not to this file.
    // Pattern `Q { a: 1.5 }` is 12 characters at column 19 of line 6.
    await expectRefused(
      lines(
        INTEGER_SCHEMA,
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1.5 } => "n-arm", _ => "other" }',
        "r",
      ),
      [narrowing(patternRange(6, ARM_COLUMN, "Q { a: 1.5 }"))],
      "§Expected behaviour 1 / §Fix disposition 1: the pattern position narrows, so the verdict `checkObjectFieldCompat` (src/parser/type-compat.ts:540) already computes here must reach the diagnostic list instead of being filtered out, which `TypeLayerWalk.checkPatternFieldTypes` (src/parser/type-layer-checks.ts) did before this fix",
    );
  });

  it("a2 [THE SHARP ROW]: `Q { a: 1.0 }` under `a: integer` is refused, and it is the arm the body answers — ", async () => {
    // §Reproduction A2, the row no existing cell measures. `1.0` is a `number`
    // literal by docs/spec_topics/lexical.md:28 and an `integer` by
    // `patternLiteralType`'s `Number.isInteger`
    // (src/parser/type-layer-checks.ts:1252, before this fix fed the value alone),
    // so no verdict is COMPUTED at all and removing the `.filter` alone leaves
    // this row silent — §Fix constraint
    // 1. Dispatch does not move (§Fix constraint 2): `valuesEqual`
    // (src/runtime/value.ts) compares `1.0` to the field value `1` numerically,
    // so the arm still answers `"n-arm"` and the refusal is the registration
    // denial. Pattern `Q { a: 1.0 }` is 12 characters at column 19 of line 6.
    await expectRefused(
      lines(
        INTEGER_SCHEMA,
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1.0 } => "n-arm", _ => "other" }',
        "r",
      ),
      [narrowing(patternRange(6, ARM_COLUMN, "Q { a: 1.0 }"))],
      "§Expected behaviour 2 and §Fix constraint 1: the literal is judged by its SOURCE spelling, which requires `parsePattern`'s number branch (src/parser/theta-document.ts:4628) to carry the token's `numericType` (src/lexer/lexer.ts:660) onto the `PatternNode` literal variant (src/parser/theta-document.ts:304) exactly as the expression path does at src/parser/theta-document.ts:4278",
    );
  });

  it("a3 [beats the correctly-spelled arm below it]: `Q { a: 1.0 }` above `Q { a: 1 }` is refused — ", async () => {
    // §Reproduction A3. The correctly-spelled arm is present BELOW and the
    // `number`-spelled arm still takes the value at HEAD (`"n-arm"`), which is
    // the copy-paste hazard §Why it matters names. Exactly one diagnostic is
    // owed (§Fix constraint 6): the second arm's `1` is `integer`-spelled under
    // an `integer` field and stays silent, so the whole-list assertion also
    // pins that the legal arm draws nothing. Pattern `Q { a: 1.0 }` is 12
    // characters at column 19 of line 6.
    await expectRefused(
      lines(
        INTEGER_SCHEMA,
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1.0 } => "n-arm", Q { a: 1 } => "i-arm", _ => "other" }',
        "r",
      ),
      [narrowing(patternRange(6, ARM_COLUMN, "Q { a: 1.0 }"))],
      "§Fix constraint 6: one diagnostic per construct — the `number`-spelled arm refuses and the `integer`-spelled arm below it stays silent, so a route that judged every numeric pattern literal `number` would red here on a second diagnostic",
    );
  });

  it("a4 [exponent spelling]: `Q { a: 1e10 }` under `a: integer` is refused — ", async () => {
    // §Reproduction A4: the other integral-VALUED `number` spelling, whose
    // verdict is likewise never computed today. It does not match the field
    // value, so at HEAD the body answers `"other"` — the silent member of the
    // class, which is why the assertion is the denial and not the value.
    // Pattern `Q { a: 1e10 }` is 13 characters at column 19 of line 6, giving
    // the measured `6:19-6:32`.
    await expectRefused(
      lines(
        INTEGER_SCHEMA,
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1e10 } => "e-arm", _ => "other" }',
        "r",
      ),
      [narrowing(patternRange(6, ARM_COLUMN, "Q { a: 1e10 }"))],
      "§Fix constraint 1: the disposition must answer for BOTH integral-valued `number` spellings by name, so the exponent form refuses on the same evidence as a2",
    );
  });

  it("a5 [must not move]: `Q { a: \"x\" }` keeps bug 0226's field-TYPE verdict alone — ", async () => {
    // §Reproduction A5 / §Expected behaviour 5: the control that the field-TYPE
    // half is wired at this position at all, and the row whose measured range
    // (`6:19-6:31`) is the evidence for §Fix constraint 7's whole-pattern span.
    // GREEN at HEAD and must stay green, in code, count, range, message and
    // value: §Fix constraint 6 forbids a second diagnostic here.
    const doc = expectDiagnostics(
      lines(
        INTEGER_SCHEMA,
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: "x" } => "s-arm", _ => "other" }',
        "r",
      ),
      [
        typeMismatch(
          "a",
          "Q",
          "integer",
          "string",
          patternRange(6, ARM_COLUMN, 'Q { a: "x" }'),
        ),
      ],
      "§Expected behaviour 5: a string literal under an `integer` field keeps `object-field-type-mismatch` alone — the two-way incompatibility is bug 0226's landed verdict and this route neither doubles nor replaces it",
    );
    await expectValue(
      doc,
      "other",
      "row A5's value is unmoved: the refusal is static and dispatch stays byte-identical (§Fix constraint 2)",
    );
  });

  it("a6 [recursion, nested object field]: `Outer { i: Inner { z: 1.5 } }` is refused at the INNER pattern's range — ", async () => {
    // §Reproduction A6: `checkPatternFieldTypes`
    // (src/parser/type-layer-checks.ts:2202) recurses into object field
    // sub-patterns, so the class follows it down. The refusal lands at the
    // INNER object-pattern's own range (§Fix constraint 7), and the satisfied
    // outer head stays silent — pinned by the whole-list assertion. Columns on
    // line 7: `Outer`=19–23, ` `=24, `{`=25, ` `=26, `i`=27, `:`=28, ` `=29, so
    // `Inner { z: 1.5 }` (16 characters) starts at column 30, giving the
    // measured `7:30-7:46`.
    await expectRefused(
      lines(
        "schema Inner { z: integer }",
        "schema Outer { i: Inner }",
        "let d = Outer { i: Inner { z: 1 } }",
        'let r = match d { Outer { i: Inner { z: 1.5 } } => "in-arm", _ => "none" }',
        "r",
      ),
      [narrowing(patternRange(7, 30, "Inner { z: 1.5 }"))],
      "§Expected behaviour 2: the verdict follows the existing recursion into object field sub-patterns, at the inner pattern's range, with the satisfied outer head silent",
    );
  });

  it("a7 [recursion, array element]: `[Q { a: 1.5 }]` is refused at the element pattern's range — ", async () => {
    // §Reproduction A7: the array-element branch of the same recursion.
    // Columns on line 6: `{`=17, ` `=18, `[`=19, so the element pattern
    // `Q { a: 1.5 }` (12 characters) starts at column 20, giving the measured
    // `6:20-6:32`.
    await expectRefused(
      lines(
        INTEGER_SCHEMA,
        "let d = [Q { a: 1 }]",
        'let r = match d { [Q { a: 1.5 }] => "arr-arm", _ => "other" }',
        "r",
      ),
      [narrowing(patternRange(6, ARM_COLUMN + 1, "Q { a: 1.5 }"))],
      "§Expected behaviour 2: the array-element branch of the recursion carries the verdict too, at the element pattern's own range",
    );
  });
});

// ===========================================================================
// (b) The other TYPE-2 sinks (bug 0234 §Reproduction (B)). Every cell here is
// GREEN at HEAD and must stay green: this route adds a call site at the pattern
// position and edits no existing emission. 
// ===========================================================================

describe("0234 (b) — the constructor position and the four cross-sinks are untouched — ", () => {
  it("b1: constructor `Q { a: 1.5 }` keeps its narrowing verdict at the field VALUE's range — ", () => {
    // §Reproduction B1. Note the RANGE: the constructor position points at the
    // offending field value (`1.5` at columns 16–19 of line 5), where the
    // pattern-position emission points at the whole PATTERN (§Fix constraint
    // 7). Both are the same code and the same message.
    expectSinkRefusal(
      theta(lines(INTEGER_SCHEMA, "let d = Q { a: 1.5 }", "d")),
      [{ ...narrowing(range(5, 16, 5, 19)) }],
      "§Expected behaviour 5: the constructor position's landed verdict keeps its code, count, range and message — the pattern-position emission is an ADDED call site, not an edit of this one",
    );
  });

  it("b2: constructor `Q { a: 1.0 }` — row a2's spelling one position over — keeps its verdict — ", () => {
    // §Reproduction B2, the control that makes a2 a divergence rather than a
    // language choice: the constructor position reads `NumberExpr.numericType`
    // (src/parser/theta-document.ts:4278) and refuses the same spelling a2
    // admits.
    expectSinkRefusal(
      theta(lines(INTEGER_SCHEMA, "let d = Q { a: 1.0 }", "d")),
      [{ ...narrowing(range(5, 16, 5, 19)) }],
      "§Why it matters: `Q { a: 1.0 }` is refused in the constructor position and admitted at a pattern head, one copy-paste apart, so this row must keep exactly its landed emission",
    );
  });

  it("b3: constructor `Q { a: 1e10 }` — row a4's spelling one position over — keeps its verdict — ", () => {
    // §Reproduction B3. `1e10` is four characters, so the field value spans
    // columns 16–20 of line 5.
    expectSinkRefusal(
      theta(lines(INTEGER_SCHEMA, "let d = Q { a: 1e10 }", "d")),
      [{ ...narrowing(range(5, 16, 5, 20)) }],
      "the exponent spelling's constructor-position verdict is unmoved, which is the control for row a4",
    );
  });

  it("b4: a typed `let` keeps its narrowing verdict — ", () => {
    // §Reproduction B4, the first of the four sinks
    // docs/spec_topics/type-system.md:52 enumerates. `let n: integer = 1.5` is
    // 20 characters on line 4, and the emission spans the whole statement.
    expectSinkRefusal(
      theta(lines("let n: integer = 1.5", "n")),
      [{ ...narrowing(range(4, 1, 4, 21)) }],
      "§Expected behaviour 5: the typed-`let` sink is untouched, and it is one of the four sinks whose agreement with the pattern position §Expected behaviour 1 demands",
    );
  });

  it("b5: a `params:` default keeps its narrowing verdict — ", () => {
    // §Reproduction B5. The frontmatter carries the `params:` block, so this
    // row is spelled as a whole source rather than through the shared
    // three-line frontmatter: line 3 is `params:`, line 4 the field, line 5 the
    // closing `---`, line 6 the body. The SECOND diagnostic is the probe body's
    // own artefact — the body reads `p`, which is not in scope at this
    // position — and the bug document states it rather than filtering it, so
    // the whole unfiltered list is asserted here.
    expectSinkRefusal(
      thetaRaw("---\nmode: prompt\nparams:\n  p: integer = 1.0\n---\np\n"),
      [
        { ...narrowing(range(4, 6, 4, 19)) },
        existing(UNKNOWN_IDENT, "unknown identifier 'p'", range(6, 1, 6, 2)),
      ],
      "§Expected behaviour 5: the `params:`-default sink is untouched, including the probe's own second diagnostic — asserting the whole list is what proves the route adds nothing here",
    );
  });

  it("b6: a reassignment keeps its narrowing verdict — ", () => {
    // §Reproduction B6, and bug 0115's routing precedent: a sink whose own
    // mismatch code exists still routes the `number`-under-`integer` failure to
    // the narrowing row rather than minting a second code. `n = 1.0` is 7
    // characters on line 5, and the emission spans the whole statement.
    expectSinkRefusal(
      theta(lines("let mut n: integer = 1", "n = 1.0", "n")),
      [{ ...narrowing(range(5, 1, 5, 8)) }],
      "§Expected behaviour 5: the reassignment sink is untouched, and it is the precedent (bug 0115) for routing this failure to the narrowing row instead of minting a code",
    );
  });

  it("b7: an `array<integer>` element keeps BOTH its codes, in order — ", () => {
    // §Reproduction B7: the narrowing verdict at the whole statement's range
    // plus `array-element-type-mismatch` at the element's. Their ORDER is
    // positional — `assembleDiagnostics` (src/diagnostics/diagnostic.ts) sorts
    // by (file, line, column) — and is measured, not guessed.
    expectSinkRefusal(
      theta(lines("let a: array<integer> = [1.0]", "a")),
      [
        { ...narrowing(range(4, 1, 4, 30)) },
        existing(
          ARRAY_ELEMENT_MISMATCH,
          "array element type mismatch at index 0: expected integer, got number",
          range(4, 25, 4, 30),
        ),
      ],
      "§Expected behaviour 5: the `array<integer>`-element sink keeps both codes, both ranges and their order",
    );
  });

  it("b8 [boundary, NOT this class]: an `fn` argument keeps routing its OWN code — ", () => {
    // §Reproduction B8 and §Non-goals: a plain `fn`-argument slot reports
    // `theta/parse/fn-arg-type-mismatch` for the same input, so "every sink
    // routes narrowing" is false as a general claim and the pattern position is
    // judged against the field-value sinks (b1–b3) it mirrors. A route that
    // turned this row into a narrowing verdict has widened past this report's
    // subject.
    expectSinkRefusal(
      theta(lines("fn f(x: integer) { x }", "f(1.0)")),
      [
        existing(
          FN_ARG_MISMATCH,
          "fn 'f' argument 0 ('x') type mismatch: expected integer, got number",
          range(5, 3, 5, 6),
        ),
      ],
      "§Non-goals: the `fn`-argument sink's code choice is registered (docs/spec_topics/type-system.md:52) and is not this report's subject, so it keeps exactly its landed emission",
    );
  });
});

// ===========================================================================
// (c) The must-not-move boundaries (bug 0234 §Reproduction (C), §Expected
// behaviour 3 and 4, §Fix constraint 3). Every cell here is GREEN at HEAD and
// must stay green: a red means the route typed an `integer`-spelled literal
// `number`, the failure `patternLiteralType`'s own doc comment
// (src/parser/type-layer-checks.ts:1252) names. 
// ===========================================================================

describe("0234 (c) — the silent rows stay silent, in diagnostics and in value — ", () => {
  it("c1 [the row a wrong route reds]: an `integer`-spelled literal under `integer` stays silent — ", async () => {
    // §Reproduction C1 / §Expected behaviour 3, and §Fix constraint 3's named
    // failure mode: a route that reds this cell has typed EVERY integral
    // pattern literal `number`, which is exactly the spurious-verdict outcome
    // `patternLiteralType`'s doc comment is written against. The carriage a2
    // demands must read the SPELLING, not replace the typing rule.
    await expectClean(
      lines(
        INTEGER_SCHEMA,
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1 } => "i-arm", _ => "other" }',
        "r",
      ),
      "i-arm",
      "§Expected behaviour 3: an `integer`-spelled literal under an `integer`-declared field keeps `[]` and its arm under this disposition",
    );
  });

  it("c2 [TYPE-2's legal direction]: an `integer`-spelled literal under a `number` field stays silent — ", async () => {
    // §Reproduction C2 / §Expected behaviour 4: `integer ⊑ number` is TYPE-2's
    // one-way widening in the direction that is legal
    // (docs/spec_topics/type-system.md:36) and stays legal.
    await expectClean(
      lines(
        "schema Q { a: number }",
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1 } => "n-arm", _ => "other" }',
        "r",
      ),
      "n-arm",
      "§Expected behaviour 4: the widening direction is legal, so a route that refused here has inverted TYPE-2 rather than closed the narrowing gap",
    );
  });

  it("c3: a `number`-spelled literal under a `number` field stays silent — ", async () => {
    // §Reproduction C3: same spelling as a1, compatible declaration. This is
    // the pair that shows a1's red is the DECLARED type and not the literal's
    // spelling on its own.
    await expectClean(
      lines(
        "schema Q { a: number }",
        "let d = Q { a: 1.5 }",
        'let r = match d { Q { a: 1.5 } => "n-arm", _ => "other" }',
        "r",
      ),
      "n-arm",
      "§Expected behaviour 4: a `number` literal under a `number`-declared field is compatible in both directions and draws nothing",
    );
  });

  it("c4 [no literal to judge]: the shorthand binder stays unjudged — ", async () => {
    // §Reproduction C4, which is bug 0226's cell `x5`: a shorthand carries no
    // literal, so `checkPatternFieldTypes` has nothing to compare and this
    // report adds nothing. §Non-goals: structural judgement of non-literal
    // sub-patterns is bug 0226's *Residuals* item 2.
    await expectClean(
      lines(
        "schema Q { a: string }",
        'let d = Q { a: "x" }',
        'let r = match d { Q { a } => a, _ => "other" }',
        "r",
      ),
      "x",
      "§Non-goals: a shorthand field carries no literal to compare, so it stays unjudged and its binding still reaches the arm body",
    );
  });

  it("c5 [measured non-goal, bug 0123's territory]: a NEGATIVE pattern literal draws nothing, before and after — ", async () => {
    // NOT a claim about narrowing, and NOT in the bug document's tables: a
    // measured boundary. `BodyParser.parsePattern`
    // (src/parser/theta-document.ts:4628 is its number branch) has no
    // unary-minus arm, so `-1.0` never reaches a literal `PatternNode` at all
    // and no field-type judgement of any kind runs for it — which is why this
    // row draws `[]` at HEAD and still draws `[]` once the spelling is carried.
    // Whatever the arm does with it belongs to bug 0123's one-token recovery
    // tail (§Fix constraint 9, §Non-goals), so only the diagnostic list is
    // asserted here and no value is claimed.
    expectDiagnostics(
      lines(
        INTEGER_SCHEMA,
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: -1.0 } => "neg", _ => "other" }',
        "r",
      ),
      [],
      "§Fix constraint 9: bug 0123's recovery tail is untouched — a unary-minus pattern field literal reaches no literal `PatternNode`, so it draws nothing before and after this route",
    );
  });
});

// ===========================================================================
// (f) The corpus sweep — §Fix constraint 8's GOV-15 half, RE-DERIVED rather
// than taken from §Reproduction (D)'s census. 
// ===========================================================================

describe("0234 (f) — the committed corpus gains no narrowing refusal — ", () => {
  it("f1: no committed `.theta` / `.thetalib` carries a numeric literal in an object-pattern field — ", () => {
    // §Fix constraint 8: the census (34 files, three object-pattern arms, every
    // head `QueryError`, every listed field a string literal) is a measurement
    // at the filing HEAD, not a licence, so it is re-derived here.
    // tests/committed-fixture-parse-gate.test.ts is what discharges a
    // corpus-wide parse claim, and per bug 0132 it filters `.theta` only — so
    // the `.thetalib` half of THIS sweep is a probe and cannot be delegated.
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    const listed = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Fail LOUDLY on an empty list (CLAUDE.md): a sweep over nothing reports
    // success while verifying nothing, and the GOV-15 half is the whole reason
    // this cell exists.
    expect(
      listed.length,
      "bug-0234 precondition unmet: `git ls-files -- '*.theta' '*.thetalib'` reported NO tracked corpus files, so the GOV-15 sweep would verify nothing. Run it from the repository root of a real checkout.",
    ).toBeGreaterThan(0);

    // The arm regex admits the committed `})` shape — the arm's `}` followed by
    // `)` before the arrow, as in `Err(QueryError { kind: "…" }) =>` — which is
    // what §Fix constraint 8 requires and what a naive `\{[^}]*\} *=>` misses.
    // The head is optional so a BARE `{ … } =>` arm is found too.
    const armWithHead = /([A-Za-z_][A-Za-z0-9_]*)?[ \t]*\{([^{}]*)\}[\s)]*=>/g;
    // A field position inside such an arm holding a numeric literal, negative
    // spelling included: `field: 1`, `field: 1.0`, `field: -1e10`.
    const numericFieldLiteral = /:\s*-?\d/;

    const census: string[] = [];
    const offenders: string[] = [];
    for (const relative of listed) {
      const bytes = new Uint8Array(readFileSync(`${repoRoot}${relative}`));
      const text = new TextDecoder().decode(bytes);
      armWithHead.lastIndex = 0;
      let match = armWithHead.exec(text);
      while (match !== null) {
        census.push(`${relative}: ${match[1] ?? "<bare>"}`);
        if (numericFieldLiteral.test(match[2] ?? "")) {
          offenders.push(`${relative}: ${match[0]}`);
        }
        match = armWithHead.exec(text);
      }
      // The parse-side half: no committed file may gain the narrowing code.
      const doc = parseDocBytes(bytes, relative);
      for (const d of doc.diagnostics) {
        if (d.code === NARROWING) {
          offenders.push(`${relative}: ${d.code}: ${d.message}`);
        }
      }
    }

    expect(
      census,
      "the re-derived census must still find exactly the three committed `Err(QueryError { … }) =>` arms; a shorter list means the regex stopped catching the `})` shape and the sweep below is vacuous",
    ).toEqual([
      "docs/examples/configure-tool-loop.theta: QueryError",
      "docs/examples/fan-out-reviews.theta: QueryError",
      "docs/examples/handle-error.theta: QueryError",
    ]);
    expect(
      offenders,
      "no shipped theta may carry a numeric literal in an object-pattern field position, nor gain `theta/parse/integer-narrowing`: the GOV-15 blast radius is re-measured, never assumed",
    ).toEqual([]);
  });
});
