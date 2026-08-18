import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bug 0185 — a `params:` default whose `Enum.Variant` access resolves to
// nothing loads with ZERO diagnostics and then aborts every invocation.
// `checkVariantAccess` (`src/parser/schema-declarations.ts:315`) has one call
// site, `src/parser/theta-document.ts:6641` inside `walkExpr`'s `member` arm,
// so the check reaches the body AST and not the `params:` default RHS — even
// though `parseFrontmatter` (`:841`) has already produced the located fields
// when `checkStructural` (`:857`) hoists the declared variant sets. The
// spelling survives the five load-time default checks because the literal
// sublanguage's `member` node (`src/parser/literal-sublanguage.ts:103`) keeps
// only `objectIsIdent` and discards both identifier texts, so the is-literal
// arm can test only that shape (`:522`) and never `grammar.md`'s two side
// conditions on `NamedValueLit`. At invocation `#recoverDeclaredDefaults`
// (`src/extension/production-theta-producer.ts:1293`) evaluates the default
// through the theta's own body environment; `resolveEnumVariant`
// (`src/runtime/lexical-environment.ts:526`) answers `undefined`, the `member`
// arm's guard (`production-theta-producer.ts:6150`) does not return, and the
// fallthrough (`:6155`) hands `evaluateMemberAccess` the `null` the `ident` arm
// (`:6124`) manufactures for a non-local resolution, which throws
// `NullMemberAccessPanic` (`src/runtime/runtime-panics.ts:333`) out of a
// recovery whose caller's doc-comment (`:1245`) says it never throws
// (docs/bugs/0185-unresolvable-enum-variant-default-panics-recovery.md).
//
// WHAT IS RED HERE AND WHY, row by row.
//   LOAD (group A) — eight cells, each red because the diagnostic list is
//   EMPTY at HEAD. `m1` (bare annotated field), `m6` (`Box { … }` field), `m12`
//   (bare-object field), `m7` (array element) and `m8` (union arm) each expect
//   the one `theta/parse/unknown-variant` the byte-identical body expression
//   already draws; `m9` expects the same code for the case-mismatched variant
//   (variant names are case-sensitive); `m2` expects
//   `theta/parse/unknown-identifier` for the unregistered head, the pair the
//   body position mints; `m10` is `m1`'s fixture whose scripted envelope
//   SUPPLIES the field, and it expects the identical refusal — the row that
//   proves the abort at HEAD is unconditional on the default being used. Every
//   expected range is the `params:` field's OWN range (the YAML value node's,
//   `src/parser/frontmatter.ts:730`), never the synthesized zero body range the
//   panic carries.
//   INVOCATION (group C) — `m11` (`sev: 'Sev = Box.sev'`) is the one input the
//   parse gate does not pre-empt: its head RESOLVES but names no enum, so the
//   body position is silent on it too. It is red because the dispatch delivers
//   `emitPanicNote("theta /m11 aborted: null member access: .sev", …)` instead
//   of settling on a value.
//   GREEN BY DESIGN, on both sides of the fix — group B's three fences (`s1`,
//   `s14`, `s11`), group D's precedence row (`p1`) and group R's range oracle
//   (`r1`). They fence the flip class: a resolvable variant, deferral row c6, a
//   VALUE outside the variant set, a field already carrying an error-severity
//   default diagnostic, and the range arithmetic itself.
//
// MEASURED SIGNATURES AT HEAD `a8d95853` (v0.108.0), offline, deterministic,
// provider-free; re-derived by probe before this file was added, then deleted.
// LOAD — every group-A cell parses with ZERO diagnostics and lowers
// `$defs.Sev = {"type":"string","enum":["high","low"]}`:
//   sev: 'Sev = Sev.Missing'                        diags []
//   sev: 'Sev = Nope.Missing'                       diags []
//   sev: 'Sev = Sev.high'                           diags []
//   box: 'Box = Box { sev: Sev.Missing, who: "w" }' diags []
//   box: 'Box = { sev: Sev.Missing, who: "w" }'     diags []
//   sevs: 'array<Sev> = [Sev.Missing]'              diags []
//   sev: 'Sev | null = Sev.Missing'                 diags []
//   sev: 'Sev = Box.sev'                            diags []
// INVOCATION — one binder model call each, `bound` undefined, NO
// `theta-system-note` content row; the delivery is `emitPanicNote(framing,
// diagnostic)`:
//   m1  theta /m1 aborted: null member access: .Missing
//       {"severity":"error","code":"theta/runtime/null-member-access",
//        "file":"/theta/m1.theta","range":{"start":{"line":0,"column":0},
//        "end":{"line":0,"column":0}},"message":"null member access: .Missing"}
//   m2 / m6 / m7 / m8 / m12 identical (".Missing"); m9 ".high";
//   m11 (`Box.sev`) ".sev"; m10 identical even though the envelope supplies the
//   field. `emitTopLevelErrNote` is never called on any row.
// The three fences already carry the verdicts this file pins for them:
//   s1  bound=true  {"topic":"hello","sev":"high"}  Running /s1: topic=hello, sev=high (default)
//   s14 bound=true  {"topic":"hello","p":"A"}       Running /s14: topic=hello, p=A (default)
//   s11 bound=false theta /s11: argument binding produced invalid args —
//                   /sev must be equal to one of the allowed values
// POST-FIX, the observables group C pins: no panic note, `bound=true`,
// `args={"topic":"hello"}` (the field left UNFILLED, as the recovery's three
// already-documented best-effort cases leave theirs), echo
// `Running /m11: topic=hello, sev=null (default)`. A defaulted field is dropped
// from the lowered schema's `required` set (`src/parser/params.ts:277`), so the
// merge admits the absent field and no AJV refusal is reachable on this row.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schemas.md:97 — "Unknown-variant references
//     (`Severity.Critical` when no such variant exists) are
//     `theta/parse/unknown-variant`", scoped to no position.
//   - docs/spec_topics/grammar.md:26 — `NamedValueLit ::= Ident "." Ident //
//     Enum.Variant access; head is an enum name in scope, tail a declared
//     variant`. The two names are side conditions OF the production, so a
//     spelling failing either is not a `NamedValueLit`.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:93 — the
//     `theta/parse/unknown-variant` row (E, parse, Trigger "`Enum.Variant`
//     reference where `Variant` is not a declared variant of `Enum`",
//     position-agnostic); :63 — `theta/parse/unknown-identifier` (Trigger
//     "Bare identifier in call or value position resolves to nothing in
//     scope"; a default RHS is a value position); :48 —
//     `theta/parse/default-not-literal`, the shape rule group D fences.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 (DIAG-4) — the
//     registry's *Message* column is normative, which is why every expected
//     message below is READ from the registry and never restated.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:71 — "the literal
//     sublanguage *is* a subset of the body expression grammar". A subset
//     admits no spelling the superset refuses.
//   - docs/spec_topics/type-system.md:48 (§Unresolvable operands) — the
//     licence deferral row c6 rests on. It governs a COMPATIBILITY check whose
//     operand is past the parser's static view; whether an enum declares a
//     variant is neither, so fence `s14` stays silent while group A refuses.
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:9 (fill-if-absent
//     and the `(default)` echo tag), :11 (the post-default-merge AJV hook, the
//     seam fence `s11` refuses at).
//   - docs/spec_topics/errors-and-results/error-model.md:65, :74 — the six V1
//     panic sources are a closed list of things a theta expression does, and
//     the runtime-defect surface is "not a new authoring concept (no theta
//     expression 'causes' one)"; :91 — the slash-command panic surface group C
//     asserts the ABSENCE of.
//   - docs/spec_topics/diagnostics/code-registry-runtime.md:15 — the
//     `theta/runtime/null-member-access` Trigger is "`expr.field` where `expr`
//     evaluated to `null`", which none of these authors wrote.
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15) —
//     observable (c) is byte-identical `theta-system-note` content, which is
//     what group B's three echo rows fence.
//
// TIER: unit, offline, deterministic, provider-free, zero model turns. The load
// half settles inside one `parseThetaDocument` call over a string plus one read
// of the committed registry corpus; the invocation half settles inside one
// `composeThetaFixture(...).run(...)` dispatch over the production
// `ProductionThetaProducer.runBinder()` with the off-session pi-ai `complete()`
// scripted (the bug-0011 / e2e-s5 pattern that 0181's witness establishes). An
// integration tier would re-drive discovery to reach the same two seams and
// witness nothing further; a live tier adds a real binder model, whose only
// contribution is the `ok` envelope this file scripts — and a load refusal is
// upstream of every model interaction, so a live drive could not distinguish
// group A's refusal from any other load error.
//
// NO SILENT SKIPPING: `registryMessageOf` THROWS naming the registry page when
// the DIAG-4 row it needs is absent, never falling back to a copied literal;
// `paramsFieldRange` THROWS on a field it cannot locate, and group R proves its
// arithmetic against a range the shipped parser actually emitted rather than
// against this file's own prose; the fixture fs backing
// `#recoverDeclaredDefaults` REJECTS an unregistered path instead of reading
// empty; `parseDrivenCell` asserts a clean parse before a fixture is driven;
// and every reader below throws naming the `theta-system-note` channel, the
// panic channel or the binder verdict it needs when it is absent. A missing
// fixture, a refused parse or an empty note list can never read as a pass.

// The scripted off-session binder reply. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over a mutable holder each test sets.
// `replyFor` scripts the reply as a FUNCTION of the captured call so the
// ToolCall reply always names whatever binder tool production actually
// attached; `calls` counts the attempts (HC3-c: no retry on this class).
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
  calls: [] as unknown[],
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) => {
      scripted.calls.push(context);
      return scripted.replyFor?.(context);
    }),
  };
});

// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import {
  composeThetaFixture,
  type BinderRunInput,
  type BinderRunResult,
  type ConversationBinding,
  type ConversationBindInput,
  type ThetaCompositionInput,
  type ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaBody,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import type { BodyExecution, ExecuteBodyDeps } from "../src/runtime/statement-executor";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../src/runtime/terminal-outcomes";
import type { CodeSideToolCall, ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { InvokeChild } from "../src/runtime/invoke-cancellation";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { Diagnostic, Severity, SourceRange } from "../src/diagnostics/diagnostic";
import type { QueryError } from "../src/runtime/query-error";
import { makeOk, type ResultValue, type ThetaValue } from "../src/runtime/value";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/** The rule-3 prefix/suffix separator of `renderFailureNote` (U+2014 EM DASH). */
const EM_DASH = "\u2014";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
const AJV_ARGS_PHRASE = "argument binding produced invalid args";

/** The AJV-on-`args` note for one theta and one rendered `<ajv-summary>`. */
function ajvArgsNote(thetaName: string, ajvSummary: string): string {
  return `theta /${thetaName}: ${AJV_ARGS_PHRASE} ${EM_DASH} ${ajvSummary}`;
}

// ===========================================================================
// The codes and their normative messages (DIAG-4).
// ===========================================================================

/** The code the body position mints for a tail that is not a declared variant. */
const UNKNOWN_VARIANT_CODE = "theta/parse/unknown-variant";

/** The code the body position mints for a head that resolves to nothing. */
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";

/** The shape rule already raised from `parseParams`'s per-field default loop. */
const NOT_LITERAL_CODE = "theta/parse/default-not-literal";

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
 * A registry row's normative *Message* (DIAG-4), read rather than restated.
 * THROWS naming the registry page when the row is absent, so registry drift can
 * never degrade an assertion into a comparison against `undefined`.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * The unknown-variant message for one variant of one enum. Both replacements
 * are functions so a `$` in either name can never read as a `String.replace`
 * substitution pattern.
 */
function unknownVariantMessage(variant: string, enumName: string): string {
  return registryMessageOf(UNKNOWN_VARIANT_CODE)
    .replace("<variant>", () => variant)
    .replace("<enum>", () => enumName);
}

/** The unknown-identifier message for one unresolvable head. */
function unknownIdentifierMessage(name: string): string {
  return registryMessageOf(UNKNOWN_IDENTIFIER_CODE).replace("<name>", () => name);
}

// ===========================================================================
// Fixtures.
// ===========================================================================

/**
 * The shared body every cell but `s14` resolves its `params:` types against:
 * the declaring `enum` whose variant set is what group A's tail names are
 * measured for, a `schema` carrying a named-enum field (the depth position),
 * and a brand-only `schema`. `Box` is also `m11`'s head — a name that RESOLVES
 * in the whole-file root scope yet names no enum, which is why `m11` is the one
 * cell the load gate leaves to invocation.
 */
const ENUM_BODY = [
  'enum Sev { High = "high", Low = "low" }',
  "schema Box { sev: Sev, who: string }",
  "schema Plain { who: string }",
].join("\n");

/**
 * Deferral row c6's exact body (`tests/params-default-type-compat.test.ts:209`),
 * whose enum declares bare variants so the wire strings are `"A"` / `"B"`.
 */
const C6_BODY = "enum Sev { A, B }";

/** The two-space `params:` indent every fixture field carries. */
const FIELD_INDENT = "  ";

/**
 * One fixture: a `topic: string` the binder always supplies plus the single
 * defaulted field under test. `topic` keeps the pass a genuine binder pass (two
 * params, one of them non-string, is off `classifyBinderBypass`'s single-string
 * bypass) and gives the echo a non-defaulted term to render beside the
 * defaulted one.
 */
function thetaSource(field: string, body: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: binder-model",
    "params:",
    `${FIELD_INDENT}topic: string`,
    `${FIELD_INDENT}${field}`,
    "---",
    body,
    "",
  ].join("\n");
}

/** One cell: the `params:` line under test, the body it resolves against, its envelope. */
interface Cell {
  /** The `params:` line under test, verbatim. */
  readonly field: string;
  /** The body whose declarations the field's type and default resolve against. */
  readonly body: string;
  /**
   * The scripted `ok` envelope's `args`. Every cell but `m10` and `s11`'s
   * siblings OMITS the defaulted field, exactly as the binder system prompt
   * instructs ("Do not invent values for defaulted parameters that the user did
   * not specify; omit them", src/binder/binder-system-prompt.ts:345).
   */
  readonly envelope: Record<string, unknown>;
}

const OMITTED: Record<string, unknown> = { topic: "hello" };

/**
 * The cell table. Slash names are the ones the pre-measurement recorded its
 * verbatim rows under, so every pinned note string below is traceable to one
 * measured row rather than reconstructed.
 */
const CELLS = {
  /** (A1) The bare annotated field — the bug's subject. */
  m1: { field: `sev: 'Sev = Sev.Missing'`, body: ENUM_BODY, envelope: OMITTED },
  /** (A2) The unregistered head — the spelling the body separates by code. */
  m2: { field: `sev: 'Sev = Nope.Missing'`, body: ENUM_BODY, envelope: OMITTED },
  /** (A3) The schema-constructor field — the depth position. */
  m6: {
    field: `box: 'Box = Box { sev: Sev.Missing, who: "w" }'`,
    body: ENUM_BODY,
    envelope: OMITTED,
  },
  /** (A4) The array element. */
  m7: { field: `sevs: 'array<Sev> = [Sev.Missing]'`, body: ENUM_BODY, envelope: OMITTED },
  /** (A5) The union arm. */
  m8: { field: `sev: 'Sev | null = Sev.Missing'`, body: ENUM_BODY, envelope: OMITTED },
  /** (A6) The case-mismatched variant — variant names are case-sensitive. */
  m9: { field: `sev: 'Sev = Sev.high'`, body: ENUM_BODY, envelope: OMITTED },
  /** (A7) `m1`'s fixture, with the envelope SUPPLYING the defaulted field. */
  m10: {
    field: `sev: 'Sev = Sev.Missing'`,
    body: ENUM_BODY,
    envelope: { topic: "hello", sev: "low" },
  },
  /** (A8) The bare-object spelling of `m6` — the second admitted object form. */
  m12: {
    field: `box: 'Box = { sev: Sev.Missing, who: "w" }'`,
    body: ENUM_BODY,
    envelope: OMITTED,
  },
  /** (C) The head that RESOLVES but names no enum — deferred to invocation. */
  m11: { field: `sev: 'Sev = Box.sev'`, body: ENUM_BODY, envelope: OMITTED },
  /** (B1) FENCE — 0181 cell 1, a resolvable variant. */
  s1: { field: `sev: 'Sev = Sev.High'`, body: ENUM_BODY, envelope: OMITTED },
  /** (B2) FENCE — 0181 cell 9, the VALUE-mismatch control. */
  s11: { field: `sev: 'Sev = "nope"'`, body: ENUM_BODY, envelope: OMITTED },
  /** (B3) FENCE — deferral row c6 / 0181 cell 10. */
  s14: { field: `p: 'Sev = Sev.A'`, body: C6_BODY, envelope: OMITTED },
  /** (D) The precedence row — one refused field draws ONE diagnostic. */
  p1: {
    field: `sevs: 'array<Sev> = [Sev.Missing, foo()]'`,
    body: ENUM_BODY,
    envelope: OMITTED,
  },
  /** (R) The range oracle — a shape the shipped parser already locates. */
  r1: { field: `sev: 'Sev = foo()'`, body: ENUM_BODY, envelope: OMITTED },
} as const satisfies Record<string, Cell>;

type CellName = keyof typeof CELLS;

/** The composition-input `sourcePath` a cell's bytes are re-read from. */
function sourcePathOf(name: CellName): string {
  return `/theta/${name}.theta`;
}

/** The parser-facing path a cell's diagnostics are attributed to. */
function parsePathOf(name: CellName): string {
  return `${name}.theta`;
}

/**
 * The fixture sources by `sourcePath`, backing the root double's in-memory
 * `fileSystem.readBytes` so `#recoverDeclaredDefaults`
 * (`src/extension/production-theta-producer.ts:1293`) re-reads the same bytes
 * the parser saw. An unregistered path REJECTS loudly: a silent empty read
 * would take the recovery's no-bytes best-effort exit and make a defaults
 * failure look like a clean merge, which is the one way group C could pass
 * while witnessing nothing.
 */
const FIXTURE_SOURCES: ReadonlyMap<string, string> = new Map(
  (Object.keys(CELLS) as CellName[]).map((name) => [
    sourcePathOf(name),
    thetaSource(CELLS[name].field, CELLS[name].body),
  ]),
);

// ===========================================================================
// The `params:` field's own range, computed from the fixture layout.
// ===========================================================================

/**
 * The range of one cell's `params:` VALUE node — `rangeOf(item.value, …)` at
 * `src/parser/frontmatter.ts:730`, 1-indexed line and column with an exclusive
 * end (`src/diagnostics/diagnostic.ts:16`, `:22`). The value node of a
 * single-quoted YAML scalar spans the quotes, so the span starts at the `'`
 * after `<name>: ` and ends one past the closing `'`.
 *
 * THROWS on a field it cannot locate: a silently wrong range would let a
 * group-A cell compare a real diagnostic against a fabricated site.
 */
function paramsFieldRange(name: CellName): SourceRange {
  const field = CELLS[name].field;
  const source = thetaSource(field, CELLS[name].body);
  const lineIndex = source.split("\n").indexOf(`${FIELD_INDENT}${field}`);
  const separator = field.indexOf(": ");
  if (lineIndex < 0 || separator < 0) {
    throw new Error(
      `harness: cell ${name} has no locatable \`params:\` field line for '${field}' — the range oracle cannot be computed, so this file must not compare any diagnostic against a fabricated site`,
    );
  }
  const startColumn = FIELD_INDENT.length + separator + ": ".length + 1;
  return {
    start: { line: lineIndex + 1, column: startColumn },
    end: { line: lineIndex + 1, column: startColumn + field.length - separator - ": ".length },
  };
}

// ===========================================================================
// Harness (the bug-0011 / e2e-s5 production-producer pattern, driven through
// the shipped dispatch entry).
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse one cell's source through the production whole-file parser. */
function parseCell(name: CellName): ThetaDocument {
  const source: ThetaSource = {
    path: parsePathOf(name),
    bytes: new TextEncoder().encode(thetaSource(CELLS[name].field, CELLS[name].body)),
  };
  return parseThetaDocument(source, parseDeps());
}

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** The five located-refusal fields this file pins, leaving `hint` and friends free. */
interface LocatedRefusal {
  readonly severity: Severity;
  readonly code: string;
  readonly file: string | undefined;
  readonly range: SourceRange | undefined;
  readonly message: string;
}

/** Each diagnostic projected onto the pinned five, in emission order. */
function locatedRefusals(doc: ThetaDocument): LocatedRefusal[] {
  return doc.diagnostics.map((d) => ({
    severity: d.severity,
    code: d.code,
    file: d.file,
    range: d.range,
    message: d.message,
  }));
}

/** Parse a cell that must load cleanly before it is driven, or fail loudly. */
function parseDrivenCell(name: CellName): ThetaDocument {
  const doc = parseCell(name);
  expect(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    `cell ${name} must parse cleanly before it is driven — a refused parse would make every invocation assertion below unreachable`,
  ).toEqual([]);
  expect(doc.frontmatter, `cell ${name} must carry parseable frontmatter`).not.toBeNull();
  return doc;
}

/**
 * The production AJV validator, wired with the same `JSON.stringify`
 * content-addressing the shipped composition root uses
 * (`src/extension/production-composition.ts`), so the envelope AJV at the
 * routing step and the post-merge hook resolve through one compiled-validator
 * cache exactly as production does.
 */
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

/**
 * A runtime-root double sufficient for a binder pass: noop checkpoint,
 * deterministic ids, wall-clock zero, the REAL AJV validator, and an in-memory
 * fs resolving the fixture sources by `sourcePath`.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: realAjvValidator(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const src = FIXTURE_SOURCES.get(path);
        return src !== undefined
          ? Promise.resolve(new TextEncoder().encode(src))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

class InertMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

/**
 * Executor deps over the driven fixture's own body. The bodies are declarations
 * only, so every effect resolver throws rather than returning a double: a
 * fixture that grew a tail would fail loudly here instead of quietly binding
 * against a stub.
 */
function inertExecuteDeps(body: ThetaBody, file: string): ExecuteBodyDeps {
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    sink: NOOP_SINK,
    file,
    evaluatePure(): ThetaValue {
      throw new Error(`harness: ${file} is declarations only, with no pure tail`);
    },
    resolveQuery(): QueryHostDispatch {
      throw new Error(`harness: ${file} issues no query`);
    },
    resolveToolCall(): CodeSideToolCall {
      throw new Error(`harness: ${file} issues no tool call`);
    },
    resolveInvoke(): InvokeChild {
      throw new Error(`harness: ${file} issues no invoke`);
    },
  };
  return {
    env: buildEnvironment({ body }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new InertMutator(),
    mode: "prompt",
    file,
  };
}

/** A ToolCall-bearing assistant reply (the pi-ai `ToolCall` content-part shape). */
function toolCallReply(name: string, args: Record<string, unknown>): unknown {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: "tc-1", name, arguments: args }],
    stopReason: "toolUse",
    timestamp: 0,
  };
}

/**
 * Script a ToolCall reply carrying `{ envelope }`, naming the binder tool
 * production actually attached on the captured call — so the reply matches
 * whatever slug production derives for this fixture's envelope schema.
 */
function scriptToolCallEnvelope(envelope: unknown): void {
  scripted.replyFor = (context) => {
    const tools = (context as { readonly tools?: ReadonlyArray<{ readonly name?: unknown }> })
      .tools;
    const name = tools?.[0]?.name;
    if (typeof name !== "string") {
      throw new Error(
        "the binder call attached no forced tool, so no ToolCall reply can name it — the harness cannot script an envelope",
      );
    }
    return toolCallReply(name, { envelope });
  };
}

/** One `emitPanicNote` delivery, captured verbatim. */
interface PanicDelivery {
  readonly framing: string;
  readonly diagnostic: Diagnostic;
}

/** Everything one driven dispatch exposes. */
interface DispatchCapture {
  readonly cell: CellName;
  /** The `theta-system-note` channel entries' rendered content, in delivery order. */
  readonly notes: readonly string[];
  /**
   * Every `emitPanicNote` delivery. Group C asserts this is EMPTY: the panic is
   * the whole subject of the invocation half, so it is captured rather than
   * rethrown by the harness, which would collapse the red into a harness error.
   */
  readonly panics: readonly PanicDelivery[];
  /** Every `emitTopLevelErrNote` delivery — measured non-involved at HEAD. */
  readonly errNotes: readonly string[];
  /** The production `runBinder` verdict, captured on its way through the dispatch. */
  readonly binder: BinderRunResult | undefined;
  /** The `paramBindings` the shipped `paramBindingsFrom` projected, when it ran. */
  readonly paramBindings: ReadonlyMap<string, ThetaValue> | undefined;
  /** Binder LLM attempts (HC3-c: this class carries no retry budget). */
  readonly binderCalls: number;
}

/**
 * Drive one cell through the shipped slash-dispatch entry.
 * `composeThetaFixture(...).run(...)` reaches the real `runBinder` delegate on
 * the production `ProductionThetaProducer`, so the merged `args` and the echo
 * row are the ones `#mergeDeclaredDefaults` actually produced. Only the two
 * conversation bindings are replaced, because binding a real Pi session is what
 * would make this tier non-offline.
 */
async function driveSlash(name: CellName): Promise<DispatchCapture> {
  const doc = parseDrivenCell(name);
  const theta: ThetaCompositionInput = {
    slashName: name,
    sourcePath: sourcePathOf(name),
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };

  scriptToolCallEnvelope({ kind: "ok", args: CELLS[name].envelope });

  const notes: string[] = [];
  const pi = {
    sendMessage: (message: { readonly customType: string; readonly content: string }): void => {
      if (message.customType === SYSTEM_NOTE_CHANNEL) {
        notes.push(message.content);
      }
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [
      {
        id: "binder-model",
        provider: "anthropic-messages",
        api: "anthropic-messages",
        strictCapable: true,
      },
    ],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const production = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });

  let binder: BinderRunResult | undefined;
  let paramBindings: ReadonlyMap<string, ThetaValue> | undefined;
  const errNotes: string[] = [];
  const panics: PanicDelivery[] = [];

  const deps: ThetaProducerDeps = {
    runBinder: async (input: BinderRunInput): Promise<BinderRunResult> => {
      const result = await production.runBinder(input);
      binder = result;
      return result;
    },
    bindPromptConversation: (input: ConversationBindInput): ConversationBinding => {
      paramBindings = input.paramBindings;
      return {
        drivenAgainst: "prompt-user-session",
        executeDeps: inertExecuteDeps(doc.body, parsePathOf(name)),
        surface(_execution: BodyExecution): ResultValue {
          return makeOk(null);
        },
      };
    },
    spawnSubagentConversation: (): Promise<ConversationBinding> => {
      throw new Error("harness: every fixture is prompt-mode, so no subagent session is spawned");
    },
    emitTopLevelErrNote: (_thetaName: string, error: QueryError): void => {
      errNotes.push(JSON.stringify(error));
    },
    emitPanicNote: (framing: string, diagnostic: Diagnostic): void => {
      panics.push({ framing, diagnostic });
    },
    ...(production.schemaValidator !== undefined
      ? { schemaValidator: production.schemaValidator }
      : {}),
  };

  await composeThetaFixture(theta, deps).run("hello", {} as unknown as ExtensionCommandContext);

  return {
    cell: name,
    notes,
    panics,
    errNotes,
    binder,
    paramBindings,
    binderCalls: scripted.calls.length,
  };
}

// --- Loud readers ----------------------------------------------------------

/** Every panic delivery rendered as its framing, for a diff that names the abort. */
function panicFramings(capture: DispatchCapture): string[] {
  return capture.panics.map((p) => p.framing);
}

/** The merged `args` the binder bound, or a loud throw naming what happened instead. */
function boundArgs(capture: DispatchCapture): Readonly<Record<string, unknown>> {
  if (capture.binder?.args === undefined) {
    throw new Error(
      `harness: cell ${capture.cell} surfaced no bound args (bound=${String(
        capture.binder?.bound,
      )}); the \`${SYSTEM_NOTE_CHANNEL}\` channel carried ${JSON.stringify(
        capture.notes,
      )}, the panic channel carried ${JSON.stringify(
        panicFramings(capture),
      )} and the top-level Err channel carried ${JSON.stringify(capture.errNotes)}`,
    );
  }
  return capture.binder.args;
}

/** The one `theta-system-note` row this dispatch delivered, or a loud throw. */
function soleNote(capture: DispatchCapture): string {
  if (capture.notes.length !== 1) {
    throw new Error(
      `harness: cell ${capture.cell} needs exactly one \`${SYSTEM_NOTE_CHANNEL}\` row to read, and the channel captured ${capture.notes.length}: ${JSON.stringify(
        capture.notes,
      )}; the panic channel carried ${JSON.stringify(panicFramings(capture))}`,
    );
  }
  return capture.notes[0] as string;
}

beforeEach(() => {
  scripted.replyFor = undefined;
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// (R) THE RANGE ORACLE. Green on both sides. `paramsFieldRange` is arithmetic
// over the fixture layout, and group A compares real diagnostics against it —
// so the arithmetic is calibrated here against a range the SHIPPED parser
// emitted for the same fixture shape, never against this file's own prose.
// `sev: 'Sev = foo()'` is refused by the is-literal check
// (`src/parser/params.ts:390`) at `field.range`, which is the range group A's
// refusal must also carry.
// ===========================================================================

describe("bug 0185 (R) — the `params:` field's own range, calibrated against the shipped parser", () => {
  it("GREEN (R): a default already refused at load carries exactly the computed field range", () => {
    const doc = parseCell("r1");

    expect(
      diagCodes(doc),
      "premise: the calibration fixture must draw exactly the one load-time default refusal whose range this file's arithmetic is being checked against",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(
      locatedRefusals(doc)[0]?.range,
      "`paramsFieldRange` must reproduce `rangeOf(item.value, …)` (src/parser/frontmatter.ts:730) exactly, or every group-A range assertion below is comparing against a fabricated site",
    ).toEqual(paramsFieldRange("r1"));
  });
});

// ===========================================================================
// (A) THE LOAD HALF. Eight cells, each red at HEAD because the diagnostic list
// is EMPTY. schemas.md:97 scopes the unknown-variant rule to no position, and
// grammar.md:26 makes both identifier resolutions side conditions of the
// `NamedValueLit` production itself, so a `params:` default is the same
// reference the body draws the diagnostic for. Severity is `error` because
// production-composition.ts:1729 registers a theta "iff no error-severity
// diagnostic was raised" — a warning would leave the theta registered and the
// invocation abort in place.
// ===========================================================================

describe("bug 0185 (A1) — the bare annotated field refuses at load", () => {
  it("RED (A1): `sev: 'Sev = Sev.Missing'` draws `theta/parse/unknown-variant` at the field's range", () => {
    const doc = parseCell("m1");

    expect(
      diagCodes(doc),
      "schemas.md:97 registers `theta/parse/unknown-variant` for an unknown-variant reference and scopes the rule to no position; HEAD raises nothing here and defers the same reference to a runtime panic",
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}`]);
    expect(
      locatedRefusals(doc),
      "the refusal names both the variant and the enum (DIAG-4) and is located at the `params:` field's own range, not at the synthesized zero body range the panic carries",
    ).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("m1"),
        range: paramsFieldRange("m1"),
        message: unknownVariantMessage("Missing", "Sev"),
      },
    ]);
  });
});

describe("bug 0185 (A2) — the unregistered head refuses under the identifier code", () => {
  it("RED (A2): `sev: 'Sev = Nope.Missing'` draws `theta/parse/unknown-identifier`", () => {
    const doc = parseCell("m2");

    expect(
      diagCodes(doc),
      "code-registry-parse.md:63's Trigger is a bare identifier in a value position resolving to nothing in scope, and a default RHS is a value position; the body position already separates this spelling from A1 and the two positions must agree",
    ).toEqual([`error ${UNKNOWN_IDENTIFIER_CODE}`]);
    expect(
      locatedRefusals(doc),
      "a misspelled ENUM name and a misspelled VARIANT name are two mistakes and must not render one message",
    ).toEqual([
      {
        severity: "error",
        code: UNKNOWN_IDENTIFIER_CODE,
        file: parsePathOf("m2"),
        range: paramsFieldRange("m2"),
        message: unknownIdentifierMessage("Nope"),
      },
    ]);
  });
});

describe("bug 0185 (A3) — a named-enum field of a `Box { … }` default refuses at load", () => {
  it("RED (A3): the schema-constructor spelling draws the same code at its own depth", () => {
    const doc = parseCell("m6");

    expect(
      diagCodes(doc),
      "frontmatter-fields-a.md:71 makes the literal sublanguage a SUBSET of the body expression grammar, and the body refuses `Box { sev: Sev.Missing, who: \"w\" }`; a subset admits no spelling the superset refuses",
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("m6"),
        range: paramsFieldRange("m6"),
        message: unknownVariantMessage("Missing", "Sev"),
      },
    ]);
  });
});

describe("bug 0185 (A4) — the bare-object spelling of the same default refuses identically", () => {
  it("RED (A4): `Box = { sev: Sev.Missing, who: \"w\" }` draws the same one diagnostic", () => {
    const doc = parseCell("m12");

    // The two object spellings differ only in the brand the literal carries.
    // 0181's witness pins both for a RESOLVABLE variant, so both are pinned
    // here for an unresolvable one: a divergence would mean the check descends
    // one container production and not its sibling.
    expect(
      diagCodes(doc),
      "frontmatter-fields-a.md:60 admits bare-key object literals alongside variant-schema construction, so both spellings of one value are refused alike",
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("m12"),
        range: paramsFieldRange("m12"),
        message: unknownVariantMessage("Missing", "Sev"),
      },
    ]);
  });
});

describe("bug 0185 (A5) — an array element refuses at load", () => {
  it("RED (A5): `sevs: 'array<Sev> = [Sev.Missing]'` draws one `theta/parse/unknown-variant`", () => {
    const doc = parseCell("m7");

    expect(
      diagCodes(doc),
      "the body refuses `[Sev.Missing]` at the element's own depth; the `params:` position composes the same array production with the same element form",
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("m7"),
        range: paramsFieldRange("m7"),
        message: unknownVariantMessage("Missing", "Sev"),
      },
    ]);
  });
});

describe("bug 0185 (A6) — a union-typed param refuses on its default", () => {
  it("RED (A6): `sev: 'Sev | null = Sev.Missing'` refuses despite the nullable arm", () => {
    const doc = parseCell("m8");

    // The `null` arm makes the field's TYPE admit an absent value; it says
    // nothing about whether the default's own spelling resolves, which is the
    // side condition grammar.md:26 places on the production.
    expect(
      diagCodes(doc),
      "a union arm is an ordinary `params:` type position, and the default RHS is judged as the literal it spells rather than against the arm set",
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("m8"),
        range: paramsFieldRange("m8"),
        message: unknownVariantMessage("Missing", "Sev"),
      },
    ]);
  });
});

describe("bug 0185 (A7) — a case-mismatched variant refuses at load", () => {
  it("RED (A7): `sev: 'Sev = Sev.high'` names `high`, not the declared `High`", () => {
    const doc = parseCell("m9");

    // `high` IS the declared variant's wire string, which is what makes this
    // spelling plausible to write; variant names are case-sensitive, so the
    // tail resolves to nothing and belongs with A1.
    expect(
      diagCodes(doc),
      "the body draws `theta/parse/unknown-variant` for `Sev.high`, so the `params:` position draws it too",
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}`]);
    expect(
      locatedRefusals(doc),
      "the message names the variant AS WRITTEN, so an author comparing it against the declaration sees the case difference",
    ).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("m9"),
        range: paramsFieldRange("m9"),
        message: unknownVariantMessage("high", "Sev"),
      },
    ]);
  });
});

describe("bug 0185 (A8) — the refusal is unconditional on the default being used", () => {
  it("RED (A8): the supplied-argument fixture refuses at LOAD, before any envelope exists", () => {
    // At HEAD the abort fires even when the caller supplies the argument,
    // because `#recoverDeclaredDefaults` iterates `defaultedFields` before
    // `fillDefaultsAndRevalidate` applies fill-if-absent
    // (`src/binder/defaulting.ts:134`). A load refusal is unconditional by
    // construction: the theta does not register, so no envelope is ever
    // produced for it. This cell pins that the fixture really is the
    // supplied-argument shape and that its verdict is `m1`'s, byte for byte.
    expect(
      CELLS.m10.envelope,
      "premise: this cell's scripted envelope must SUPPLY the defaulted field, or it is not the supplied-argument row",
    ).toEqual({ topic: "hello", sev: "low" });
    expect(
      CELLS.m10.field,
      "premise: the fixture text is `m1`'s, so the only difference between the two rows is the envelope",
    ).toBe(CELLS.m1.field);

    const doc = parseCell("m10");

    expect(
      diagCodes(doc),
      "a load-time refusal cannot depend on a caller's arguments; the theta does not register, so there is no invocation shape in which the unresolvable spelling is tolerated",
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("m10"),
        range: paramsFieldRange("m10"),
        message: unknownVariantMessage("Missing", "Sev"),
      },
    ]);
  });
});

// ===========================================================================
// (B) THE THREE FENCES. Green BEFORE and AFTER the fix, load AND invocation.
// GOV-15 (source-language-stability.md:5): no input that succeeds today may
// start failing, and observable (c) — `theta-system-note` content — is
// byte-identical across releases, so these rows are asserted verbatim.
// ===========================================================================

describe("bug 0185 (B1) — CONTROL: a resolvable variant loads silently and binds", () => {
  it("GREEN (B1): `sev: 'Sev = Sev.High'` parses clean, merges `\"high\"` and echoes it", async () => {
    const doc = parseCell("s1");
    expect(
      doc.diagnostics,
      "0181 cell 1 is the spec's own worked-example spelling (frontmatter-fields-a.md:67); a load-time check that refused a RESOLVABLE variant would refuse the documented form",
    ).toEqual([]);

    const capture = await driveSlash("s1");

    expect(capture.panics, "a resolvable variant reaches no panic path").toEqual([]);
    expect(
      capture.notes,
      "GOV-15 observable (c) — this row is what an author gets today and must be byte-identical after the fix",
    ).toEqual(["Running /s1: topic=hello, sev=high (default)"]);
    expect(capture.binder?.bound).toBe(true);
    expect(boundArgs(capture)).toEqual({ topic: "hello", sev: "high" });
    expect(capture.binderCalls, "exactly ONE binder model call, retry or none").toBe(1);
  });
});

describe("bug 0185 (B2) — CONTROL: deferral row c6 keeps loading silently and still binds", () => {
  it("GREEN (B2): `p: 'Sev = Sev.A'` against `enum Sev { A, B }` parses clean and merges `\"A\"`", async () => {
    // §Fix constraint 1: a load-time check must distinguish "the compat
    // relation cannot decide this default's type" (c6's licence,
    // type-system.md:48) from "this default names a variant the enum does not
    // declare". c6's variant RESOLVES, so it stays on the deferral side.
    const doc = parseCell("s14");
    expect(
      doc.diagnostics,
      "type-system.md:48 assigns the compatibility adjudication to the runtime AJV check; variant existence is not a compatibility question and this variant exists, so the load gate stays silent",
    ).toEqual([]);
    expect(
      doc.frontmatter?.params?.defaultedFields,
      "premise: the field really is defaulted, so the invocation half exercises the fill path",
    ).toEqual(["p"]);

    const capture = await driveSlash("s14");

    expect(capture.panics, "row c6's default resolves, so no panic is reachable").toEqual([]);
    expect(capture.notes).toEqual(["Running /s14: topic=hello, p=A (default)"]);
    expect(capture.binder?.bound).toBe(true);
    expect(boundArgs(capture)).toEqual({ topic: "hello", p: "A" });
  });
});

describe("bug 0185 (B3) — CONTROL: a VALUE outside the variant set stays refused at the merge", () => {
  it("GREEN (B3): `sev: 'Sev = \"nope\"'` loads silently and is refused by the post-merge AJV hook", async () => {
    // §Fix constraint 3: this report moves only the case where the SPELLING
    // resolves to nothing. `"nope"` is already wire-form and spells a perfectly
    // good string literal; whether it is a member of the variant set is a VALUE
    // question, and moving it to load time would over-refuse
    // type-system.md:48's deferral.
    const doc = parseCell("s11");
    expect(
      doc.diagnostics,
      "a wire-string default is a `PrimitiveLit`, so no name resolution applies to it and the load gate stays silent",
    ).toEqual([]);

    const capture = await driveSlash("s11");

    expect(
      capture.panics,
      "the value-mismatch fence refuses on a verdict, never on a panic",
    ).toEqual([]);
    expect(
      capture.notes,
      "defaulting-system-note-echo.md:11 — the post-default-merge AJV hook is where a merged document the lowered schema genuinely refuses is caught",
    ).toEqual([ajvArgsNote("s11", "/sev must be equal to one of the allowed values")]);
    expect(
      capture.binder?.bound,
      "the theta does not start on a default its own declared type refuses",
    ).toBe(false);
    expect(capture.binder?.args, "a refused merge surfaces no bound args at all").toBeUndefined();
    expect(
      capture.paramBindings,
      "the dispatch short-circuits on the verdict, so the inbound boundary downstream of it is never reached",
    ).toBeUndefined();
    expect(soleNote(capture).includes(EM_DASH), "the rendered row keeps its rule-3 separator").toBe(
      true,
    );
  });
});

// ===========================================================================
// (C) THE INVOCATION HALF — the one input the parse gate does not pre-empt.
// `Box` RESOLVES in the whole-file root scope but names no enum, so neither
// resolution arm claims it and the body position is silent on the same
// sub-expression (bug 0140's open subject). The recovery is therefore the last
// line, and `#mergeDeclaredDefaults`'s doc-comment
// (`src/extension/production-theta-producer.ts:1245`) already says what it must
// do: leave the field unfilled and never throw.
// ===========================================================================

describe("bug 0185 (C) — an evaluation the parse gate cannot pre-empt settles on a value", () => {
  it("RED (C): `sev: 'Sev = Box.sev'` leaves the field UNFILLED instead of aborting the theta", async () => {
    const doc = parseCell("m11");
    expect(
      doc.diagnostics,
      "premise: this cell must stay a LOAD-silent row — its head resolves, so neither the unknown-variant arm nor the unknown-identifier arm claims it, and the recovery is the only boundary left",
    ).toEqual([]);

    const capture = await driveSlash("m11");

    // THE PRIMARY ASSERTION, first so the red names the symptom the bug reports.
    // error-model.md:74 — the runtime-defect surface is "not a new authoring
    // concept (no theta expression 'causes' one)" — and
    // code-registry-runtime.md:15 scopes `theta/runtime/null-member-access` to
    // "`expr.field` where `expr` evaluated to `null`". The author wrote no
    // `null`; the evaluator's `ident` arm manufactures it.
    expect(
      panicFramings(capture),
      "no panic may be delivered: `#mergeDeclaredDefaults`'s doc-comment says recovery 'never throws', and a default that parses and then fails to resolve is a fourth best-effort case that must behave like its three siblings",
    ).toEqual([]);
    expect(
      capture.errNotes,
      "the SLSH-3 `Err`-note renderer is not on this path and must not become so",
    ).toEqual([]);

    expect(
      capture.binder?.bound,
      "the recovery leaves the field unfilled and the merge proceeds; a defaulted field is dropped from the lowered schema's `required` set (src/parser/params.ts:277), so the absent field passes the post-merge AJV hook",
    ).toBe(true);
    expect(
      boundArgs(capture),
      "the unfilled field is absent from the merged document — the same end state the recovery's three documented best-effort cases produce",
    ).toEqual({ topic: "hello" });
    expect(
      capture.notes,
      "GOV-15 observable (c) — the operator gets the BND-1 success echo, whose defaulted term renders `null` because no value was recovered for it",
    ).toEqual(["Running /m11: topic=hello, sev=null (default)"]);
    expect(capture.binderCalls, "exactly ONE binder model call, retry or none").toBe(1);
  });
});

// ===========================================================================
// (D) PRECEDENCE. Green on both sides. A field whose default RHS is already
// refused on its SHAPE draws that one diagnostic and no second one: the
// offending sub-expression `foo()` is outside the production set entirely
// (code-registry-parse.md:48), and reporting an unresolved name inside a form
// that is not a literal at all would double-report one field.
// ===========================================================================

describe("bug 0185 (D) — a shape refusal pre-empts the name refusal on the same field", () => {
  it("GREEN (D): `sevs: 'array<Sev> = [Sev.Missing, foo()]'` keeps `theta/parse/default-not-literal` ALONE", () => {
    const doc = parseCell("p1");

    expect(
      diagCodes(doc),
      "one field, one default-RHS diagnostic: the shape rule owns this field and the name check must skip a field already carrying an error-severity frontmatter diagnostic",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(
      locatedRefusals(doc)[0]?.range,
      "the surviving diagnostic keeps the field's own range",
    ).toEqual(paramsFieldRange("p1"));
  });
});
