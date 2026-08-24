import { execFileSync } from "node:child_process";
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
// Bug 0197 — the residual that fix left at this position, and this file's
// current subject: a `params:` default whose member-access HEAD resolves and
// names no enum (`sev: 'Sev = Box.sev'` against the declared `schema Box`) loads
// with ZERO diagnostics, registers, and then binds WITHOUT the field.
// `walkParamsDefaultNames`'s `member` arm
// (`src/parser/theta-document.ts:5962–5988`) asks two questions — the head names
// a declared `enum` and the tail is not one of its variants (`:5967–5977`), or
// the head resolves to nothing in the whole-file root scope (`:5978–5986`) — and
// returns silently (`:5987`) for their conjunction, which is every name
// `collectIdentRoots` (`:4774`) folds except a declared `enum`. At invocation the
// recovery evaluates the default, `resolveEnumVariant` answers `undefined`, and
// the `NullMemberAccessPanic` is absorbed by the `isThetaPanic` catch
// (`src/extension/production-theta-producer.ts:1364–1371`), which `continue`s —
// so the field never reaches `defaults`, `fillDefaultsAndRevalidate` fills only
// what it is handed (`src/binder/defaulting.ts:134–139`), and a defaulted field
// is never in the lowered schema's `required` set, in `parseParams`
// (`src/parser/params.ts`), so the post-default-merge AJV check admits
// the absence. The one surface that speaks asserts the opposite:
// `#emitBinderEchoNote` (`production-theta-producer.ts:947`) recomputes the
// `(default)` tag from `params.defaultedFields` plus an absent binder key
// (`:968–970`) instead of reading the fill step's own report
// (`defaulting.ts:75`, whose doc-comment `:70–74` and
// `src/render/argument-echo.ts:74` both name as the tag's source), so a field
// that took no default renders `sev=null (default)`
// (docs/bugs/0197-params-default-non-enum-head-silently-unfilled.md).
//
// WHAT IS RED HERE AND WHY, row by row, at HEAD `a7d15562` (v0.113.0). The
// `RED (…)` / `GREEN (…)` prefix on each row names the state that row was ADDED
// in, so group A's eight rows keep 0185's `RED` prefixes and are green here.
//   LOAD (bug 0197: group C plus groups L, W) — eight cells, each red because
//   the diagnostic list is EMPTY at HEAD: the bare annotated field (group C,
//   `m11`), a second declared `schema` head (`a2`), a `params:`-field head
//   (`a3`), a declared `fn` head (`a4`), the array element (`a5`), the
//   schema-constructor field (`a6`), the bare-object field (`a6b`), and the
//   spelling carrying internal whitespace (group W, `a1w`). Each expects one
//   error-severity `theta/parse/default-not-literal` at the `params:` field's
//   OWN range (the YAML value node's — `rangeOf((item.value ?? item.key) …)`,
//   `src/parser/frontmatter.ts:739`), whose message is READ from the registry
//   (DIAG-4) with `<expr>` filled by the offending sub-expression's own bytes.
//   Group W is the row that separates a rendered SOURCE SPAN from a
//   reconstructed `<head>.<field>`: `Sev = Box . sev` must render `Box . sev`,
//   internal whitespace preserved
//   (`docs/spec_topics/diagnostics/placeholder-rendering-a.md:49`).
//   REGISTRATION (group G) — the same eight fixtures, projected through the
//   predicate the discovery parse-drop gate applies to a discovered `.theta`
//   (`hasLoadParseError`, applied inside `parseDiscoveredTheta` — both in
//   `src/extension/production-composition.ts`): red because none of them
//   carries the error-severity `theta/parse/*` that gate consumes.
//   ECHO (group E) — `e1` is group B's `s1` fixture driven as an in-memory
//   theta (no `sourcePath`), the recovery's FIRST best-effort arm and the one
//   arm a load refusal does not remove from the invocation path. It is red
//   because the success echo tags a field that took no default: HEAD renders
//   `sev=null (default)` where the row expects `sev=null`.
//   GREEN ON BOTH SIDES — group A's eight 0185 load rows, group B's three
//   fences (`s1`, `s14`, `s11`), group D's precedence row (`p1`), group R's
//   range oracle (`r1`), group X's two displacement controls (group A's `m1` /
//   `m2` fixtures re-read for their CODES, proving the third arm displaced
//   neither existing one), group F's three shadow rows (`f1`, `f2`, `f3` — the
//   head is the declared `enum` under a same-file `schema` shadow, so
//   `Color.Red` stays silent and `Color.Nope` / `Color.a` stay
//   `theta/parse/unknown-variant`) and group K's corpus census. They fence the
//   flip class: a resolvable variant, deferral row c6, a VALUE outside the
//   variant set, a field already carrying an error-severity default diagnostic,
//   the range arithmetic, both existing name arms, this gate's enum-first head
//   precedence, and the flip's reach over the committed corpus.
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
//
// MEASURED SIGNATURES AT HEAD `a7d15562` (v0.113.0) for bug 0197's rows,
// offline, deterministic, provider-free; re-derived by probe before those rows
// were added, then deleted. LOAD — every head-class fixture, at every admitted
// depth and in both spellings of the same access, parses with ZERO diagnostics:
//   sev: 'Sev = Box.sev'                        diags []   [m11, group C]
//   sev: 'Sev = Plain.who'                      diags []   [a2]
//   sev: 'Sev = topic.foo'                      diags []   [a3]
//   sev: 'Sev = f.foo'                          diags []   [a4]
//   sevs: 'array<Sev> = [Box.sev]'              diags []   [a5]
//   box: 'Box = Box { sev: Box.sev, who: "w" }' diags []   [a6]
//   box: 'Box = { sev: Box.sev, who: "w" }'     diags []   [a6b]
//   sev: 'Sev = Box . sev'                      diags []   [a1w, group W]
// The three shadow rows already carry the verdicts group F pins for them —
// `Color = Color.Red` `[]`, `Color = Color.Nope` and `Color = Color.a` one
// `theta/parse/unknown-variant` each at the field's own range — and the corpus
// census reads 34 committed `.theta` / `.thetalib` files, 0 declaring an `enum`
// and 0 carrying a member-access `params:` default, so the flip class has zero
// reach over shipped source.
// INVOCATION at this HEAD. `m11`'s row is the verdict group C itself pinned,
// green at `a7d15562` before the rewrite below — the end state 0185 installed it
// to fence and bug 0197 §Fix (c6) authorises moving. `e1`'s row is measured on
// the probe:
//   m11 panics [] errNotes [] bound=true {"topic":"hello"}
//       Running /m11: topic=hello, sev=null (default)   binderCalls 1
//   e1  (no `sourcePath`, the recovery's first best-effort arm)
//       Running /e1: topic=hello, sev=null (default)
// POST-FIX, the observables these rows pin: each of the eight load fixtures
// draws ONE error-severity `theta/parse/default-not-literal` at the `params:`
// field's own range, so `hasLoadParseError`
// (`src/extension/production-composition.ts`), consumed by the discovery
// parse-drop gate `parseDiscoveredTheta`, denies registration and no binder
// call is reachable for the spelling at all; and the echo reads the fill step's
// own `defaultedWireNames`, so a field that took no default renders UNTAGGED
// (`Running /e1: topic=hello, sev=null`) while a field that genuinely took its
// declared default keeps its tag (group B's `s1` / `s14`, byte-identical).
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

/**
 * The not-literal message for one offending sub-expression. The replacement is a
 * function so a `$` inside the rendered span can never read as a
 * `String.replace` substitution pattern.
 *
 * `docs/spec_topics/diagnostics/placeholder-rendering-a.md:49` makes `<expr>`
 * "the offending source span verbatim, copied byte-for-byte … with internal
 * whitespace preserved", so every caller below passes the fixture's OWN bytes
 * rather than a `<head>.<field>` reconstruction of them — which is what makes
 * group W discriminating.
 */
function notLiteralMessage(expr: string): string {
  return registryMessageOf(NOT_LITERAL_CODE).replace("<expr>", () => expr);
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

/**
 * `ENUM_BODY` plus a declared `fn`, so cell `a4`'s head names a callable. A `fn`
 * is a root (`collectIdentRoots`, `src/parser/theta-document.ts:4774`, folds
 * `fn` / `schema` / `enum` names) and has no first-class value under FN-1, so it
 * is a head the gate's root scope admits and no environment can ever bind.
 */
const FN_HEAD_BODY = `${ENUM_BODY}\nfn f(): number { 1 }`;

/**
 * Bug 0197 §Reproduction (f)'s body: a declared `enum` shadowed by a same-file
 * `schema` of the same name. Group F pins which declaration this gate's `member`
 * arm resolves the head against — `hoistEnumVariants`
 * (`src/parser/theta-document.ts:5858`) is consulted FIRST (the arm's own first
 * test, `:5967`), so the head is the ENUM here even though the type layer
 * prefers the shadowing `schema` (bug 0191's open subject). A route that read
 * declaration kind instead would refuse `Color.Red`, which loads today.
 */
const SHADOW_BODY = ["enum Color { Red }", "schema Color { a: string }"].join("\n");

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
  /** (L2) A SECOND declared `schema` head — the class is not one name. */
  a2: { field: `sev: 'Sev = Plain.who'`, body: ENUM_BODY, envelope: OMITTED },
  /**
   * (L3) A `params:`-field head. `topic` is a root (`collectIdentRoots` folds
   * the field names) and can never be bound while a default evaluates:
   * `#recoverDeclaredDefaults` builds the environment with `paramBindings`
   * `undefined` (`src/extension/production-theta-producer.ts:1321–1326`).
   */
  a3: { field: `sev: 'Sev = topic.foo'`, body: ENUM_BODY, envelope: OMITTED },
  /** (L4) A declared `fn` head — a root with no first-class value at all. */
  a4: { field: `sev: 'Sev = f.foo'`, body: FN_HEAD_BODY, envelope: OMITTED },
  /** (L5) The array element — the same head one container production down. */
  a5: { field: `sevs: 'array<Sev> = [Box.sev]'`, body: ENUM_BODY, envelope: OMITTED },
  /** (L6) The schema-constructor field value. */
  a6: {
    field: `box: 'Box = Box { sev: Box.sev, who: "w" }'`,
    body: ENUM_BODY,
    envelope: OMITTED,
  },
  /** (L7) The bare-object spelling of `a6` — the second admitted object form. */
  a6b: {
    field: `box: 'Box = { sev: Box.sev, who: "w" }'`,
    body: ENUM_BODY,
    envelope: OMITTED,
  },
  /**
   * (W) `m11`'s access with internal whitespace. The only cell whose rendered
   * `<expr>` differs from `<head>.<field>`, so it is the row that separates a
   * message sliced from the source from one reconstructed out of the two
   * identifier texts.
   */
  a1w: { field: `sev: 'Sev = Box . sev'`, body: ENUM_BODY, envelope: OMITTED },
  /** (F1) The shadowed head with a DECLARED variant — loads today, keeps loading. */
  f1: { field: `sev: 'Color = Color.Red'`, body: SHADOW_BODY, envelope: OMITTED },
  /** (F2) The shadowed head with an undeclared tail — the enum arm claims it. */
  f2: { field: `sev: 'Color = Color.Nope'`, body: SHADOW_BODY, envelope: OMITTED },
  /**
   * (F3) The shadowed head whose tail is a declared FIELD of the shadowing
   * `schema` — still an unknown VARIANT, because the enum wins the head.
   */
  f3: { field: `sev: 'Color = Color.a'`, body: SHADOW_BODY, envelope: OMITTED },
  /**
   * (E) `s1`'s fixture, byte for byte, driven as an IN-MEMORY theta (no
   * `sourcePath`). Its default resolves, so the only reason its field goes
   * unfilled is the recovery's first best-effort exit
   * (`#recoverDeclaredDefaults`, `production-theta-producer.ts:1305–1308`) — the
   * one unfilled-field vehicle a load refusal on the reported spelling does not
   * remove from the invocation path.
   */
  e1: { field: `sev: 'Sev = Sev.High'`, body: ENUM_BODY, envelope: OMITTED },
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

/**
 * Whether these diagnostics deny the theta registration. This MIRRORS
 * `hasLoadParseError` (`src/extension/production-composition.ts`) rather than
 * calling it: `rg -n "export function hasLoadParseError" src/` matches nothing,
 * so it is module-private and no test can reach it. It is consumed at four
 * sites, three of which drop the file: the discovery parse-drop gate
 * (`parseDiscoveredTheta`), which decides whether a discovered `.theta` becomes
 * a runnable slash command, the `.theta`-callable arity read
 * (`resolveCalleeArity`), and the callee composition step (`parseCalleeTheta`).
 * The fourth (`parseCalleeForTools`) records a callee's `hasErrors` instead.
 *
 * Mirrored, not restated: an `error`-severity diagnostic whose code sits in the
 * `theta/load/` or `theta/parse/` namespace. Warnings never deny registration.
 */
function deniesRegistration(doc: ThetaDocument): boolean {
  return doc.diagnostics.some(
    (d) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
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

/**
 * How one driven cell reaches the declared-default recovery. The default (absent
 * options) is the on-disk shape every pre-existing cell drives: a `sourcePath`
 * the in-memory fixture fs resolves.
 */
interface DriveOptions {
  /**
   * Drive the cell as an in-memory theta with NO `sourcePath`, so
   * `#recoverDeclaredDefaults` returns `[]` without reading anything and the
   * declared default is never applied — one of the recovery's three
   * already-documented best-effort arms
   * (`src/extension/production-theta-producer.ts:1246–1256`).
   */
  readonly withoutSourcePath?: true;
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
async function driveSlash(name: CellName, options?: DriveOptions): Promise<DispatchCapture> {
  const doc = parseDrivenCell(name);
  const theta: ThetaCompositionInput = {
    slashName: name,
    // `sourcePath` is the byte source `#recoverDeclaredDefaults` re-reads the
    // declared defaults from. Omitting it selects the recovery's FIRST
    // best-effort exit (`production-theta-producer.ts:1305–1308`, "a theta with
    // no on-disk `sourcePath` (an in-memory fixture)"), which is group E's
    // vehicle for an unfilled field. Spread rather than assigned `undefined`
    // because `sourcePath` is an OPTIONAL property and the repo compiles under
    // `exactOptionalPropertyTypes`.
    ...(options?.withoutSourcePath === true ? {} : { sourcePath: sourcePathOf(name) }),
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
// `sev: 'Sev = foo()'` is refused by `parseParams`'s is-literal check
// (`src/parser/params.ts`) at `field.range`, which is the range group A's
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
// `resolveThetaToolsAtLoad` (`src/extension/production-composition.ts`)
// registers a theta "iff no error-severity diagnostic was raised" — a warning
// would leave the theta registered and the invocation abort in place.
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
// (C) THE LOAD ROW FOR THE HEAD THAT RESOLVES AND NAMES NO ENUM. `Box` is a
// declared `schema`: it IS in the whole-file root scope and declares no enum, so
// `grammar.md:26`'s head side condition ("head is an enum name in scope") is not
// met and the RHS derives no arm of `Literal` — an identifier reference that is
// not an `Enum.Variant` access, which is one of the forms
// `theta/parse/default-not-literal`'s registered *Trigger* enumerates
// (`code-registry-parse.md:48`).
//
// WHICH ASSERTION MOVED, AND WHY. 0185 installed this cell as the fence for
// exactly this flip and bug 0197 §Fix (c6) authorises moving it. Gone: the load
// SILENCE premise (`diagnostics` `[]`) inverts into the one located refusal
// below, and with it the five invocation assertions this cell used to pin —
// `panics = []`, `bound = true`, `args = {"topic":"hello"}`, the echo
// `Running /m11: topic=hello, sev=null (default)` and `binderCalls = 1`. They
// are not weakened, they are UNREACHABLE: an error-severity `theta/parse/*`
// denies the theta registration (`hasLoadParseError`,
// `src/extension/production-composition.ts`, at the discovery parse-drop gate
// `parseDiscoveredTheta`), so production never composes a runnable command for
// this fixture and no envelope, merge or echo exists for it. This cell
// therefore does not drive: `parseDrivenCell` refuses a fixture that does not
// parse cleanly, which is the harness's own statement of the same fact.
//
// The end state those five assertions described — a declared default admitted at
// load and then absent from the merged args, with the echo claiming it was
// applied — remains reachable through the recovery's three documented
// best-effort arms, which no load refusal can pre-empt. Group E witnesses it
// there, on the in-memory-theta arm, and pins that the echo stops claiming the
// fill.
// ===========================================================================

describe("bug 0197 (C) — the head that RESOLVES and names no enum refuses at load", () => {
  it("RED (C): `sev: 'Sev = Box.sev'` draws one `theta/parse/default-not-literal` and reaches no invocation", () => {
    const doc = parseCell("m11");

    // THE PRIMARY ASSERTION, first so the red names the symptom the bug reports:
    // the whole diagnostic list, EMPTY at this HEAD.
    expect(
      diagCodes(doc),
      "grammar.md:26 makes `head is an enum name in scope` a side condition OF the `NamedValueLit` production, so a resolving non-enum head derives no arm of `Literal` and is a SHAPE failure; HEAD raises nothing and binds the invocation without the field",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(
      locatedRefusals(doc),
      "the refusal names the offending sub-expression (DIAG-4) and is located at the `params:` field's own range, so it points at the declaration rather than at the top of the file",
    ).toEqual([
      {
        severity: "error",
        code: NOT_LITERAL_CODE,
        file: parsePathOf("m11"),
        range: paramsFieldRange("m11"),
        message: notLiteralMessage("Box.sev"),
      },
    ]);
    expect(
      deniesRegistration(doc),
      "severity must be `error` in the `theta/parse/` namespace: a warning would leave the theta registered and every invocation still binding without the declared default",
    ).toBe(true);
    expect(
      scripted.calls.length,
      "no binder model call is spent on this fixture: the refusal is upstream of registration, so the per-invocation round trip the defect spends is never made — and this cell reaches none by construction, because a non-registering fixture has no dispatch for the harness to drive",
    ).toBe(0);
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

// ===========================================================================
// (L) THE HEAD CLASS, PER DECLARATION KIND AND PER DEPTH. Six cells beside
// group C's bare field, each red at HEAD because the diagnostic list is EMPTY.
// The class is every name `collectIdentRoots`
// (`src/parser/theta-document.ts:4774`) folds except a declared `enum`: a
// `schema` name, a `params:` field name, a `fn` name. Two of those three can
// never hold a value in a default's environment at all — the recovery builds it
// with `paramBindings` `undefined`
// (`src/extension/production-theta-producer.ts:1321–1326`), and a `fn` has no
// first-class value under FN-1 — which is why membership in the gate's root set
// does not answer whether a default can produce a value.
//
// Every row asserts the WHOLE diagnostic list projected through
// `locatedRefusals`, with the message read from the registry (DIAG-4,
// `docs/spec_topics/diagnostics/diagnostic-shape.md:74`) and the range read
// through the group-R-calibrated `paramsFieldRange` oracle, so no row can pass on
// a second diagnostic, a warning, a body-ranged site or a restated message.
// ===========================================================================

describe("bug 0197 (L2) — a second declared `schema` head refuses identically", () => {
  it("RED (L2): `sev: 'Sev = Plain.who'` draws `theta/parse/default-not-literal` at the field's range", () => {
    const doc = parseCell("a2");

    expect(
      diagCodes(doc),
      "the class is not one name: `Plain` is a second declared `schema`, so the same conjunction (`enums.get(head)` undefined, `roots.has(head)` true) holds and the same row must fire",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: NOT_LITERAL_CODE,
        file: parsePathOf("a2"),
        range: paramsFieldRange("a2"),
        message: notLiteralMessage("Plain.who"),
      },
    ]);
  });
});

describe("bug 0197 (L3) — a `params:`-field head refuses", () => {
  it("RED (L3): `sev: 'Sev = topic.foo'` refuses although `topic` is a field of this same `params:` block", () => {
    const doc = parseCell("a3");

    // `topic` is in the gate's root set (`collectIdentRoots` folds the `params:`
    // field names) and is unbindable where the default runs, so this row is the
    // one showing that the gate's question (is the name in scope) and the
    // evaluator's (does the name hold a readable value) are different questions,
    // and that only the second decides whether a default can be filled.
    expect(
      diagCodes(doc),
      "a head that can never be bound while a default evaluates cannot produce a value, and admitting it is what leaves the field silently unfilled",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: NOT_LITERAL_CODE,
        file: parsePathOf("a3"),
        range: paramsFieldRange("a3"),
        message: notLiteralMessage("topic.foo"),
      },
    ]);
  });
});

describe("bug 0197 (L4) — a declared `fn` head refuses", () => {
  it("RED (L4): `sev: 'Sev = f.foo'` refuses on a name with no first-class value at all", () => {
    const doc = parseCell("a4");

    expect(
      diagCodes(doc),
      "FN-1 gives a `fn` name no first-class value, so no member access on it is a literal-sublanguage form under any environment",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: NOT_LITERAL_CODE,
        file: parsePathOf("a4"),
        range: paramsFieldRange("a4"),
        message: notLiteralMessage("f.foo"),
      },
    ]);
  });
});

describe("bug 0197 (L5) — an array element refuses at its own depth", () => {
  it("RED (L5): `sevs: 'array<Sev> = [Box.sev]'` draws one refusal naming the ELEMENT", () => {
    const doc = parseCell("a5");

    // The whole container default evaporates at HEAD, not only its element, so
    // the depth positions are pinned here exactly as group A pins them for the
    // unknown-variant arm: the descent covers the literal sublanguage's container
    // productions (`walkParamsDefaultNames`, src/parser/theta-document.ts:5952–5961).
    expect(
      diagCodes(doc),
      "the array descent reaches the element, and the offending sub-expression is the member access rather than the array literal that contains it",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: NOT_LITERAL_CODE,
        file: parsePathOf("a5"),
        range: paramsFieldRange("a5"),
        message: notLiteralMessage("Box.sev"),
      },
    ]);
  });
});

describe("bug 0197 (L6) — a schema-constructor field value refuses", () => {
  it("RED (L6): `box: 'Box = Box { sev: Box.sev, who: \"w\" }'` refuses on its inner field value", () => {
    const doc = parseCell("a6");

    expect(
      diagCodes(doc),
      "one field draws one diagnostic, and the offending sub-expression is the inner member access rather than the construction that contains it",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: NOT_LITERAL_CODE,
        file: parsePathOf("a6"),
        range: paramsFieldRange("a6"),
        message: notLiteralMessage("Box.sev"),
      },
    ]);
  });
});

describe("bug 0197 (L7) — the bare-object spelling refuses identically", () => {
  it("RED (L7): `box: 'Box = { sev: Box.sev, who: \"w\" }'` draws the same one diagnostic", () => {
    const doc = parseCell("a6b");

    // The two object spellings differ only in the brand the literal carries;
    // group A pins both for the unknown-variant arm, so both are pinned here for
    // the third arm. A divergence would mean the new arm is reached through one
    // container production and not its sibling.
    expect(
      diagCodes(doc),
      "frontmatter-fields-a.md:60 admits bare-key object literals alongside variant-schema construction, so both spellings of one value are refused alike",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(locatedRefusals(doc)).toEqual([
      {
        severity: "error",
        code: NOT_LITERAL_CODE,
        file: parsePathOf("a6b"),
        range: paramsFieldRange("a6b"),
        message: notLiteralMessage("Box.sev"),
      },
    ]);
  });
});

// ===========================================================================
// (W) THE BYTE-EXACT SPAN. Red at HEAD for the same reason as group L — the
// diagnostic list is EMPTY for `sev: 'Sev = Box . sev'`, measured at `a7d15562`
// — and load-bearing for a second reason no other row carries:
// `docs/spec_topics/diagnostics/placeholder-rendering-a.md:49` makes `<expr>`
// "the offending source span verbatim, copied byte-for-byte … with internal
// whitespace preserved", so this is the row a message reconstructed as
// `<head>.<field>` from the two identifier texts reds on. Both spellings name the
// same access, so no reconstruction satisfies this row and group C's row at once.
// ===========================================================================

describe("bug 0197 (W) — the message renders the offending span verbatim", () => {
  it("RED (W): `sev: 'Sev = Box . sev'` renders `Box . sev`, its internal whitespace preserved", () => {
    const doc = parseCell("a1w");

    expect(
      diagCodes(doc),
      "an internal space around the `.` changes no side condition of the production: the head still resolves and still names no enum",
    ).toEqual([`error ${NOT_LITERAL_CODE}`]);
    expect(
      locatedRefusals(doc),
      "placeholder-rendering-a.md:49 requires the offending source span byte-for-byte, so the author reads back what they wrote rather than a normalisation of it",
    ).toEqual([
      {
        severity: "error",
        code: NOT_LITERAL_CODE,
        file: parsePathOf("a1w"),
        range: paramsFieldRange("a1w"),
        message: notLiteralMessage("Box . sev"),
      },
    ]);
  });
});

// ===========================================================================
// (X) THE TWO DISPLACEMENT CONTROLS. Green on both sides. The third arm is
// reached only when `enums.get(head)` is undefined AND `roots.has(head)` is true,
// so it must claim neither spelling the two existing arms own: group A1's
// `Sev.Missing` (the head names the declared enum) and group A2's `Nope.Missing`
// (the head resolves to nothing) — the pair the bug document's controls name, its
// second row spelled `Nope.foo` there and `Nope.Missing` here because both are
// one head that resolves to nothing and group A already carries the fixture.
// Groups A1 / A2 own the full located projections for those two rows; this cell
// pins only that their CODES did not move, which is the displacement question.
// ===========================================================================

describe("bug 0197 (X) — the third arm displaces neither existing arm", () => {
  it("GREEN (X): `Sev.Missing` keeps `theta/parse/unknown-variant` and `Nope.Missing` keeps `theta/parse/unknown-identifier`", () => {
    expect(
      diagCodes(parseCell("m1")),
      "the enum-head arm is tested FIRST (`walkParamsDefaultNames`'s `member` arm, src/parser/theta-document.ts:5967), so a declared enum head keeps drawing the variant code and never the shape code",
    ).toEqual([`error ${UNKNOWN_VARIANT_CODE}`]);
    expect(
      diagCodes(parseCell("m2")),
      "a head that resolves to NOTHING leaves the intended form undetermined and stays a name question; only a head that RESOLVES to a non-enum determines the form and is a shape question",
    ).toEqual([`error ${UNKNOWN_IDENTIFIER_CODE}`]);
  });
});

// ===========================================================================
// (F) WHICH DECLARATION THE HEAD RESOLVES AGAINST (bug 0191). Green on both
// sides. `hoistEnumVariants` (`src/parser/theta-document.ts:5858`) is consulted
// before the root scope, so under a same-file `schema Color` / `enum Color`
// shadow the head is the ENUM at this gate — while `#typeExpr`'s `member` arm
// adopts the shadowing `schema` (bug 0191's open subject). These three rows pin
// that the third arm keeps the enum-first precedence: a route that classified the
// head by declaration kind, or that adopted the type layer's answer, would refuse
// `Color.Red` — input that loads today, which is a GOV-15 flip on 0191's own
// admitted class.
// ===========================================================================

describe("bug 0197 (F1) — a shadowed head with a declared variant keeps loading", () => {
  it("GREEN (F1): `sev: 'Color = Color.Red'` draws nothing", () => {
    expect(
      locatedRefusals(parseCell("f1")),
      "the head is the declared `enum` and `Red` is one of its variants, so no arm claims it; refusing it would flip an input that loads today",
    ).toEqual([]);
  });
});

describe("bug 0197 (F2) — a shadowed head with an undeclared tail stays a variant question", () => {
  it("GREEN (F2): `sev: 'Color = Color.Nope'` keeps `theta/parse/unknown-variant`", () => {
    expect(locatedRefusals(parseCell("f2"))).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("f2"),
        range: paramsFieldRange("f2"),
        message: unknownVariantMessage("Nope", "Color"),
      },
    ]);
  });
});

describe("bug 0197 (F3) — a shadowed head whose tail is a declared schema FIELD stays a variant question", () => {
  it("GREEN (F3): `sev: 'Color = Color.a'` keeps `theta/parse/unknown-variant` although `a` is a field of the shadowing schema", () => {
    expect(
      locatedRefusals(parseCell("f3")),
      "the enum wins the head, so the tail is judged against the variant set and not against the shadowing schema's fields — the disagreement with the type layer bug 0191 owns, recorded here rather than decided",
    ).toEqual([
      {
        severity: "error",
        code: UNKNOWN_VARIANT_CODE,
        file: parsePathOf("f3"),
        range: paramsFieldRange("f3"),
        message: unknownVariantMessage("a", "Color"),
      },
    ]);
  });
});

// ===========================================================================
// (G) REGISTRATION. Red at HEAD, over every fixture of the class at once: the
// consequence that makes the load rows above worth having is that the theta does
// not become a runnable slash command, so no invocation, no binder round trip and
// no unfilled binding is reachable for the spelling.
// ===========================================================================

/** Every fixture of bug 0197's head class, at every depth and in both spellings. */
const REFUSING_CELLS = [
  "m11",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a6b",
  "a1w",
] as const satisfies readonly CellName[];

describe("bug 0197 (G) — every fixture of the class is denied registration", () => {
  it("RED (G): each of the eight head-class fixtures carries the error-severity `theta/parse/*` the registration gate consumes", () => {
    const verdicts = REFUSING_CELLS.map(
      (name) => `${name}: ${String(deniesRegistration(parseCell(name)))}`,
    );

    expect(
      verdicts,
      "`hasLoadParseError` (src/extension/production-composition.ts:2214–2221) denies registration for an error-severity `theta/load/*` / `theta/parse/*`, and the discovery parse-drop gate (`:2261`) is where a discovered `.theta` is dropped on it; a fixture carrying none registers and then binds without its declared default",
    ).toEqual(REFUSING_CELLS.map((name) => `${name}: true`));
  });
});

// ===========================================================================
// (E) THE ECHO. Red at HEAD because the success echo tags a field that took no
// default. `defaulting-system-note-echo.md:9` partitions on the FILL — "Only a
// field that took its declared default this way is tagged `(default)`" — and
// `fillDefaultsAndRevalidate` reports the fill it performed
// (`defaultedWireNames`, `src/binder/defaulting.ts:75`, whose doc-comment `:70–74`
// and `src/render/argument-echo.ts:74` both name as the tag's source).
// `#emitBinderEchoNote` recomputes the tag instead, from the theta's declared
// `defaultedFields` plus an absent binder key
// (`src/extension/production-theta-producer.ts:968–970`), so a field the merge
// never filled renders `(default)` over the absent key's `?? null` coalesce
// (`:964`).
//
// THE VEHICLE, and why it is this one: a load refusal removes the reported
// spelling from the invocation path entirely, so the unfilled-field rendering has
// to be reached through one of the recovery's three pre-existing best-effort arms
// (`#mergeDeclaredDefaults`'s doc-comment,
// `production-theta-producer.ts:1246–1256`). This cell takes the FIRST — a theta
// with no `sourcePath`, which returns `[]` without reading anything (`:1305–1308`).
// The other two would have to defeat the fixture fs on purpose: it REJECTS an
// unregistered path loudly by design, and `FIXTURE_SOURCES` registers every cell
// in the table.
//
// The other direction is group B's, not duplicated here: `s1` — this cell's
// fixture, byte for byte, driven WITH its `sourcePath` — and `s14` pin that a
// field which genuinely takes its declared default keeps its tag. The two cells
// differ in exactly one input, so the tag's presence tracks the fill and nothing
// else.
// ===========================================================================

describe("bug 0197 (E) — a field that took no default renders UNTAGGED", () => {
  it("RED (E): an in-memory theta fills nothing, and its echo must not claim the fill", async () => {
    expect(
      CELLS.e1.field,
      "premise: this cell's fixture text is `s1`'s, so the only difference between the tagged fence and this untagged row is whether the theta has an on-disk `sourcePath`",
    ).toBe(CELLS.s1.field);

    const capture = await driveSlash("e1", { withoutSourcePath: true });

    // THE PRIMARY ASSERTION, first so the red names the symptom the bug reports.
    expect(
      capture.notes,
      "GOV-15 observable (c) — the operator is told the declared default was applied to a field the merge never filled; the tag is defined by what happened, not by what was declared",
    ).toEqual(["Running /e1: topic=hello, sev=null"]);

    expect(
      capture.panics,
      "the first best-effort arm reads nothing and evaluates nothing, so no panic is reachable on it",
    ).toEqual([]);
    expect(
      capture.errNotes,
      "the SLSH-3 `Err`-note renderer is not on this path and must not become so",
    ).toEqual([]);
    expect(
      capture.binder?.bound,
      "route (3) repairs the SURFACE only: the recovery's three documented best-effort arms keep their end state, so this row still binds",
    ).toBe(true);
    expect(
      boundArgs(capture),
      "the unfilled field is absent from the merged document, which is what makes the rendered `null` a coalesce rather than a value",
    ).toEqual({ topic: "hello" });
    expect(capture.binderCalls, "exactly ONE binder model call, retry or none").toBe(1);
  });
});

// ===========================================================================
// (K) THE COMMITTED CORPUS. Green on both sides, and the GOV-15 measurement the
// flip class is judged against
// (`docs/spec_topics/governance/source-language-stability.md:9`, `:25`): a load
// refusal makes a currently-loading theta refuse, so the reach over shipped
// source is what decides whether the change sits inside the equivalence promise.
// Measured at `a7d15562`: 34 committed `.theta` / `.thetalib` files, none
// declaring an `enum` and none carrying a member-access `params:` default — so
// `tests/committed-fixture-parse-gate.test.ts` never meets this input, and the
// class consists of authoring mistakes that currently register and then drop a
// declared default.
// ===========================================================================

/** The repository root, resolved from this file's own URL rather than from `cwd`. */
const REPO_ROOT_URL = new URL("../", import.meta.url);

/**
 * Every committed `.theta` / `.thetalib`, read through `git ls-files` — the census
 * bug 0197 §Fix (d) requires be re-run over the index rather than inferred from
 * `tests/committed-fixture-parse-gate.test.ts`.
 *
 * NO SILENT SKIPPING: an unavailable `git` makes `execFileSync` THROW out of this
 * reader (it is deliberately uncaught, so the cell fails naming the unmet
 * precondition), and an empty listing throws naming the census — a census that
 * read nothing would report zero reach while measuring nothing.
 */
function committedThetaCorpus(): readonly string[] {
  const listed = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
    cwd: fileURLToPath(REPO_ROOT_URL),
    encoding: "utf8",
  });
  const files = listed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (files.length === 0) {
    throw new Error(
      "harness: `git ls-files -- '*.theta' '*.thetalib'` listed no file, so the GOV-15 corpus census measured nothing — a harness failure, never a skip",
    );
  }
  return files;
}

/**
 * A declared named `enum` at a line's start — the precondition for a shipped
 * `Enum.Variant` default. `[ \t]` rather than `\s` so the class cannot straddle a
 * line break under the `m` flag.
 */
const ENUM_DECL_RE = /^[ \t]*enum[ \t]/m;

/**
 * A single-quoted `params:` field whose default RHS opens with a member access —
 * the bug document's own census grep, with the same `[ \t]` narrowing and the
 * whitespace tolerance group W's spelling needs.
 */
const MEMBER_DEFAULT_RE = /^[ \t]+\w+: *'[^']*= *[A-Za-z_][A-Za-z0-9_]*[ \t]*\.[ \t]*[A-Za-z_]/m;

describe("bug 0197 (K) — the flip class has zero reach over the committed corpus", () => {
  it("GREEN (K): no committed `.theta` / `.thetalib` declares an `enum` or carries a member-access `params:` default", () => {
    const corpus = committedThetaCorpus();

    expect(
      corpus.length,
      "premise: the census must actually read the committed corpus, or the two emptiness claims below are vacuous (34 files at `a7d15562`)",
    ).toBeGreaterThan(0);

    const sources = corpus.map((relative) => ({
      relative,
      text: readFileSync(fileURLToPath(new URL(relative, REPO_ROOT_URL)), "utf8"),
    }));

    expect(
      sources.filter((file) => ENUM_DECL_RE.test(file.text)).map((file) => file.relative),
      "a shipped file declaring an `enum` is the precondition for a shipped `Enum.Variant` default, so the census records that first",
    ).toEqual([]);
    expect(
      sources.filter((file) => MEMBER_DEFAULT_RE.test(file.text)).map((file) => file.relative),
      "no shipped source spells a member-access `params:` default, so the load refusal this file pins flips no committed file and the equivalence promise is met through the diagnostic-registry carve-out",
    ).toEqual([]);
  });
});
