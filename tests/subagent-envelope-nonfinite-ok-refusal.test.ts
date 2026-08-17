// Bug 0180 — a typed `invoke<T>` whose `Ok` payload carries a non-finite
// `number` gets opposite verdicts by the callee's `mode:`. The prompt→prompt
// attach cell hands the callee's own `Infinity` to AJV and the seam's
// `strict: false` construction admits it; the subagent leg's
// `serializeOkEnvelope` is `JSON.stringify`, which has no non-finite form, so
// the child emits `{"theta_result":{"v":1,"ok":null}}` — a well-formed envelope
// carrying a value the callee never produced — and the parent then refuses that
// `null` under `{"type":"number"}` (loud, misattributed) or ADMITS it under
// `{"type":["number","null"]}` (silent: the caller binds `null` where the callee
// produced `Infinity`).
// `docs/bugs/0180-invoke-return-nonfinite-number-mode-variance.md`.
//
// SPEC. `docs/spec_topics/invocation.md:36` (§Final-value propagation across
// callees) fixes the return surface as mode-invariant: "A `prompt`-mode child
// attaches to the caller's current conversation, but the final value still
// propagates through the same return surface." `:55` (§Cross-mode semantics)
// fixes what the callee's mode DOES select — "whether it gets a fresh
// conversation or attaches to its caller's current conversation" — and nothing
// more. `docs/spec_topics/runtime-value-model.md:8` (the `number` row) names the
// non-finite results as values of the type: "Division produces IEEE-754
// `Infinity` / `NaN` per JS semantics". `docs/spec_topics/expressions.md:232`
// fixes that "Division by zero produces IEEE-754 `Infinity` / `-Infinity` /
// `NaN` per JS semantics; it does not panic. Modulo by zero (`n % 0`) likewise
// produces `NaN` and does not panic", so the value class is reachable from clean
// source. `docs/spec_topics/query/query-escapes-stringification.md:22` is the
// corpus's one existing ruling on rendering the class — "`NaN` → `NaN`;
// `Infinity` → `Infinity`; `-Infinity` → `-Infinity`" — which is the rendering
// the refusal message below reuses.
// `docs/spec_topics/pi-integration-contract/subagent.md:101` (PIC-59) owns the
// return envelope and its fail-closed inventory, and its `Ok`-values bullet
// carries the premise this class falsifies — measured at `34db8505` as `:110`,
// "**`Ok` values** serialise per the runtime value model (JSON-representable by
// construction)."
// `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15) is why
// the finite controls and the whole prompt leg are pinned UNCHANGED here.
//
// THE ROUTE UNDER TEST IS §Fix (b) — REFUSE CHILD-SIDE. The child detects a
// non-finite `number` anywhere in the `Ok` payload BEFORE `serializeOkEnvelope`
// and emits an `err` envelope instead — a registered diagnostic plus an
// `InvokeInfraError` naming the value and its position — rather than an envelope
// carrying a substituted `null`. The prompt→prompt leg is UNTOUCHED: §Fix (a)
// (normalise the prompt cell) and §Fix (d) (`strictNumbers` at the seam) are NOT
// taken, so the residual mode-variance — the prompt leg admits the callee's own
// non-finite value, the subagent leg refuses loudly — is the stated end state.
// Every prompt-leg row below is therefore a GOV-15 (iii) "zero flips" fence, not
// a pending red.
//
// THE ENTRY POINT IS READ OFF THE MODULE NAMESPACE, not imported by name. At
// HEAD `src/runtime/subagent-envelope.ts` exports no
// `mapNonRepresentableReturnValue`, and a named import of a missing export fails
// the whole FILE at link time — which would report one syntax error instead of
// reding each cell on its own primary assertion.
//
// TIER: unit, offline, provider-free. Every callee body is a pure tail
// expression (`1 / 0`, `NBox { n: 1 / 0, who: "w" }`, `[1 / 0, 0 / 0]`, `2`,
// `0 * -1`), so no query is issued, no provider is contacted and no model turn is
// spent. The child-side writer is the SHIPPED one, driven in-process:
// `driveSubagentRootRegime` (`src/extension/production-theta-producer.ts`, found
// by symbol — the file is >6000 lines and every open report inserts into it, so
// positions there are named by symbol per bug 0134's do-not-chase adjudication)
// is the method that writes the `Ok` envelope, and the subagent-root regime
// marker plus an injected `emitResultEnvelope` reach it without a process. The
// paired integration witness
// (`tests/subagent-invoke-nonfinite-return-refusal.test.ts`) re-drives the same
// values through real spawned children, where the PARENT's binding is the
// observable.
//
// DIAGNOSTIC MESSAGES ARE SOURCED FROM THE REGISTRY (DIAG-4,
// `docs/spec_topics/diagnostics/diagnostic-shape.md`), never copied as prose:
// the expected message is composed from the halves of the registry row's
// *Message* template via `registryMessage`, exactly as
// `tests/subagent-root-registration-refusal-envelope.test.ts` does.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type EnumDecl,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { isResultValue, type ResultValue, type ThetaValue } from "../src/runtime/value";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { MAX_JSON_DEPTH } from "../src/runtime/depth-walk";
import { enforceInvokeReturnDepth } from "../src/runtime/invoke-ceiling-depth";
import * as subagentEnvelope from "../src/runtime/subagent-envelope";
import {
  parseEnvelopeLine,
  serializeOkEnvelope,
  THETA_ENVELOPE_VERSION,
} from "../src/runtime/subagent-envelope";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
  type SchemaValidator,
} from "../src/seams/schema-validator";

// ===========================================================================
// The route-(b) surface, read off the module namespace.
// ===========================================================================

/** `theta/runtime/subagent-return-value-not-representable` — the route-(b) refusal code. */
const REFUSAL_CODE = "theta/runtime/subagent-return-value-not-representable";

/**
 * The refusal mapping shape route (b) adds beside the three existing fail-closed
 * mappings (`mapEnvelopeParseFailure`, `src/runtime/subagent-envelope.ts:242`;
 * `mapEnvelopeSchemaSkew`, `:265`; `mapExitWithoutEnvelope`, `:292`), all three
 * returning `EnvelopeFailureMapping` (`:231`). Declared structurally here rather
 * than imported so this file type-checks against the tree both before and after
 * the export lands.
 */
interface RefusalMapping {
  readonly error: {
    readonly kind: string;
    readonly message: string;
    readonly callee_path: string;
    readonly cause: string;
  };
  readonly diagnostic: {
    readonly severity: string;
    readonly code: string;
    readonly message: string;
  };
}

const CALLEE_PATH = "./kid.theta";

/** The `mapNonRepresentableReturnValue` export, or `undefined` while it does not exist. */
function refusalEntryPoint():
  | ((value: unknown, calleePath: string) => RefusalMapping | undefined)
  | undefined {
  const candidate = (subagentEnvelope as unknown as Record<string, unknown>)[
    "mapNonRepresentableReturnValue"
  ];
  return typeof candidate === "function"
    ? (candidate as (value: unknown, calleePath: string) => RefusalMapping | undefined)
    : undefined;
}

/**
 * The refusal (or `undefined` for a payload whose every `number` is finite). An
 * absent export also answers `undefined`, which is why every red cell asserts
 * presence FIRST and `describeSurface` names which of the two produced it.
 */
function refusalFor(value: unknown): RefusalMapping | undefined {
  const map = refusalEntryPoint();
  return map === undefined ? undefined : map(value, CALLEE_PATH);
}

/** Why a refusal is absent, so a red distinguishes "no export" from "walk found nothing". */
function describeSurface(): string {
  return refusalEntryPoint() === undefined
    ? "src/runtime/subagent-envelope.ts exports no mapNonRepresentableReturnValue"
    : "mapNonRepresentableReturnValue answered undefined";
}

/** The code constant route (b) exports beside the three existing envelope codes (`:83`, `:86`, `:89`). */
function exportedRefusalCode(): unknown {
  return (subagentEnvelope as unknown as Record<string, unknown>)[
    "SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE"
  ];
}

// ===========================================================================
// Registry anchors (DIAG-4). The expected message is COMPOSED from the halves
// of the registry row's *Message* template, never copied as prose.
//
// The template is `subagent return value is not JSON-representable: <value>`;
// the shipped string interpolates `<value>` and may carry a ` at <pointer>`
// segment the template does not spell out — exactly as
// `theta/runtime/subagent-params-validation-failed`'s registry template
// (`docs/spec_topics/diagnostics/code-registry-runtime.md:31`,
// `subagent marshalled params failed schema validation: <detail>`) omits the
// ` at <path>` segment its shipped builder emits (`refuseParams`,
// `src/runtime/subagent-params.ts:304`). So the assertion is an anchored
// composition over the template's two byte-identical halves rather than a bare
// `===` against the template.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live sharded registry, read from the spec corpus exactly as the H5a gate reads it. */
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

/** The `<value>` placeholder the registry row's *Message* template carries. */
const VALUE_PLACEHOLDER = "<value>";

/**
 * The registry row's normative *Message* template, or a loud failure naming the
 * absent row. Route (b) adds the row in the same commit as the code (§Fix (b),
 * "It needs a registered code and its same-commit spec edits"), so an absent row
 * is an unmet precondition of every message assertion, not a reason to weaken
 * one.
 */
function refusalTemplate(): string {
  const template = registryMessage(REGISTRY, REFUSAL_CODE) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `precondition unmet: docs/spec_topics/diagnostics/code-registry-runtime.md carries no ` +
        `Message row for ${REFUSAL_CODE} — DIAG-4 makes that column the normative string and ` +
        `every message assertion here sources its expectation from it rather than from copied ` +
        `prose, so the row is part of the change under test`,
    );
  }
  if (!template.includes(VALUE_PLACEHOLDER)) {
    throw new Error(
      `precondition unmet: the ${REFUSAL_CODE} registry Message template ` +
        `${JSON.stringify(template)} does not carry the ${VALUE_PLACEHOLDER} placeholder the ` +
        `refused value fills`,
    );
  }
  return template;
}

/**
 * The expected shipped message for a refusal at `pointer` rendering `value`,
 * composed from the registry template's halves: the head with the trailing
 * `: ` stripped, the RFC-6901 pointer's ` at <pointer>` segment (empty at the
 * root), then `: `, the `String(value)` rendering, and the template's tail.
 *
 * The rendering is `String(value)` — `Infinity` / `-Infinity` / `NaN` — which is
 * the interpolation surface's existing decision for this class
 * (`docs/spec_topics/query/query-escapes-stringification.md:22`).
 */
function expectedRefusalMessage(pointer: string, value: number): string {
  const template = refusalTemplate();
  const cut = template.indexOf(VALUE_PLACEHOLDER);
  const head = template.slice(0, cut);
  const tail = template.slice(cut + VALUE_PLACEHOLDER.length);
  const separator = ": ";
  if (!head.endsWith(separator)) {
    throw new Error(
      `precondition unmet: the ${REFUSAL_CODE} registry Message template ` +
        `${JSON.stringify(template)} does not separate its subject from ${VALUE_PLACEHOLDER} ` +
        `with ${JSON.stringify(separator)}, so the ' at <pointer>' segment has no anchored ` +
        `insertion point`,
    );
  }
  const subject = head.slice(0, head.length - separator.length);
  const location = pointer.length > 0 ? ` at ${pointer}` : "";
  return `${subject}${location}${separator}${String(value)}${tail}`;
}

// ===========================================================================
// Harness — the real parse, the real AJV seam, the real production bindings.
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

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic — a fixture
 * that stops parsing must never let a bug test pass, or red, for the wrong
 * reason (*No silent test skipping*). Every body below is measured to load with
 * `[]` diagnostics, which is the report's own premise: the class is minted from
 * clean source (`docs/spec_topics/expressions.md:232`).
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `precondition unmet: fixture ${path} failed to parse — ` +
        `${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * The production AJV validator, wired with the same `JSON.stringify`
 * content-addressing the shipped composition root uses. The seam's
 * `{ strict: false, … }` construction (`src/seams/schema-validator.ts:112`) is
 * what decides the prompt leg's verdict for this class, so a stub validator
 * would decide the very thing under test.
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

function rootDouble(schemaValidator: SchemaValidator): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator,
  } as unknown as RuntimeRoot;
}

const PROMPT_FM = "---\nmode: prompt\n---\n";
const SUBAGENT_FM = "---\nmode: subagent\n---\n";

const BOX_DECL = "schema Box { n: number, who: string }\n";
const NBOX_DECL = "schema NBox { n: number | null, who: string }\n";

// ---------------------------------------------------------------------------
// The prompt→prompt attach cell (the leg route (b) leaves alone).
// ---------------------------------------------------------------------------

/**
 * Drive `invoke<annotation>("./kidp.theta")` in a prompt-mode caller against a
 * prompt-mode callee, over the real production binding: `parseThetaDocument` →
 * `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
 * `executeBody`, with a real `AjvSchemaValidator` on the runtime root. The
 * attach guard is `callerMode === "prompt" && callee.frontmatter.mode ===
 * "prompt"` inside `#driveCallee`, and `bindPromptConversation` is what threads
 * `callerMode: "prompt"` in.
 *
 * `callerDecls` are the CALLER's own declarations: an `invoke<T>` annotation is
 * the caller's, and `#resolveReturnSite` resolves it against the caller's body.
 */
async function driveTypedInvoke(input: {
  readonly annotation: string;
  readonly callerDecls: string;
  readonly calleeBody: string;
}): Promise<ResultValue> {
  const calleeDoc = parseTheta("kidp.theta", PROMPT_FM + input.calleeBody);
  const callee: ThetaCompositionInput = {
    slashName: "kidp",
    sourcePath: "/theta/kidp.theta",
    frontmatter: calleeDoc.frontmatter as ParsedFrontmatter,
    body: calleeDoc.body,
  };
  const deps = createProductionProducerDeps({
    // `getActiveTools` / `setActiveTools` satisfy the PIC-17 prompt→prompt
    // suspend window; `sendMessage` satisfies the theta-system-note channel.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(realAjvValidator()),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee: () => Promise.resolve(callee),
  });

  const callerSrc =
    PROMPT_FM + input.callerDecls + `invoke<${input.annotation}>("${CALLEE_PATH}")\n`;
  const callerDoc = parseTheta("caller.theta", callerSrc);
  const theta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/theta/caller.theta",
    frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
    body: callerDoc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
  return boundaryResult(await executeBody(theta.body, binding.executeDeps));
}

/**
 * The `Result` the tail `invoke<T>(...)` expression produced. A caller body that
 * did not reach its tail says nothing about the return boundary, so that is a
 * loud harness failure rather than a cell outcome.
 */
function boundaryResult(execution: BodyExecution): ResultValue {
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail invoke — error ${JSON.stringify(execution.error)}`,
    );
  }
  const tail = execution.result.value;
  if (tail === undefined || !isResultValue(tail)) {
    throw new Error(
      `precondition unmet: the caller's tail value is not the invoke boundary Result — ` +
        `${JSON.stringify(tail)}`,
    );
  }
  return tail;
}

/** The `Err` payload rendered into an assertion message, so a red names the cause. */
function errDetail(result: ResultValue): string {
  return result.ok ? "" : ` — observed Err ${JSON.stringify(result.error)}`;
}

/** A payload rendered with its non-finite members legible (`JSON.stringify` renders them `null`). */
function render(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(render).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, member]) => `${key}:${render(member)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The prompt leg's outcome rendered for an assertion message, non-finite members intact. */
function promptOutcome(result: ResultValue): string {
  return result.ok ? `Ok(${render(result.value)})` : `Err(${JSON.stringify(result.error)})`;
}

// ---------------------------------------------------------------------------
// The shipped child-side envelope writer, driven in-process.
// ---------------------------------------------------------------------------

interface ChildDrive {
  readonly lines: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Drive the SHIPPED child-side writer `driveSubagentRootRegime` over a callee
 * whose whole body is `body`, capturing every `theta_result` line and every
 * diagnostic. This is the writer route (b) changes: its `if (terminal.ok)` arm
 * currently calls `emitEnvelope(serializeOkEnvelope(terminal.value))` with no
 * representability check, so a non-finite payload becomes
 * `{"theta_result":{"v":1,"ok":null}}`.
 *
 * The regime is selected by `subagentRootRegime` naming the theta's slug, which
 * is the same predicate `isSubagentRootFor` reads — the
 * `tests/subagent-root-drive-wiring.test.ts` pattern, with a real
 * `AjvSchemaValidator` instead of an always-passing stub so the drive's own
 * schema work is the shipped one.
 */
async function driveChildRoot(body: string): Promise<ChildDrive> {
  const doc = parseTheta("worker.theta", SUBAGENT_FM + body);
  const lines: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const deps = createProductionProducerDeps({
    pi: { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI,
    root: rootDouble(realAjvValidator()),
    modelRegistry: {
      getAvailable: () => [{ id: "claude-test", provider: "anthropic" }],
    } as unknown as ModelRegistry,
    subagentParentEnv: {},
    subagentRootRegime: { active: true, slug: "worker" },
    emitResultEnvelope: (line: string): void => {
      lines.push(line);
    },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
  });
  const theta = {
    slashName: "worker",
    sourcePath: CALLEE_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
  await deps.driveSubagentRootRegime?.({
    theta,
    args: "",
    ctx: {
      model: { id: "claude-test", provider: "anthropic" },
      cwd: "/tmp",
      // The child's own (empty) host session — the regime drives against it.
      sessionManager: { getEntries: () => [], getLeafId: () => undefined },
    } as unknown as ExtensionCommandContext,
    thetaAbort: new AbortController(),
  } as ConversationBindInput);
  return { lines, diagnostics };
}

/** The single envelope line the drive wrote, or a loud failure naming what it wrote instead. */
function soleEnvelope(drive: ChildDrive): subagentEnvelope.EnvelopeParse {
  if (drive.lines.length !== 1) {
    throw new Error(
      `precondition unmet: PIC-59 fixes ONE theta_result line per process; the drive wrote ` +
        `${drive.lines.length} — ${JSON.stringify(drive.lines)}`,
    );
  }
  return parseEnvelopeLine((drive.lines[0] as string).trimEnd());
}

/** The drive's whole observable surface rendered for an assertion message. */
function driveDetail(drive: ChildDrive): string {
  return (
    ` — observed envelope lines ${JSON.stringify(drive.lines)}, diagnostics ` +
    `${JSON.stringify(drive.diagnostics)}`
  );
}

// ---------------------------------------------------------------------------
// The real lowering, over the declarations the runtime reads.
// ---------------------------------------------------------------------------

function loweredFor(annotation: string): LoweredSchema {
  const doc = parseTheta("seam.theta", PROMPT_FM + BOX_DECL + NBOX_DECL + "1\n");
  // The producer reads its declaration sets off the body statements
  // (`schemaDeclsOf` / `enumDeclsOf`); mirroring that keeps the lowering input
  // identical to the runtime's.
  const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
  const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  if (lowered === undefined) {
    throw new Error(
      `precondition unmet: '${annotation}' lowered to nothing, so no AJV verdict is observable`,
    );
  }
  return lowered;
}

// ===========================================================================
// (EXPORT) The route-(b) surface exists.
// ===========================================================================

describe("bug 0180 (EXPORT) — the envelope module carries the route-(b) refusal surface", () => {
  it("RED (EXPORT): mapNonRepresentableReturnValue and its diagnostic code are exported beside the three existing fail-closed mappings", () => {
    // PIC-59's fail-closed inventory (`subagent.md:101`, whose
    // child-exit-without-envelope bullet is `:113` and whose
    // non-representable-`Ok` bullet is `:114`) has four members — envelope parse
    // failure, envelope schema skew, exit-without-envelope, and a
    // non-representable `Ok` payload — each with a code constant
    // (`src/runtime/subagent-envelope.ts:83`, `:86`, `:89`, `:92`) and a mapping
    // returning `EnvelopeFailureMapping` (`:231`, built at `:242`, `:265`,
    // `:292`, `:416`). This cell reads the fourth off the module namespace.
    expect(
      typeof refusalEntryPoint(),
      `PRIMARY (bug 0180 §Fix (b)): src/runtime/subagent-envelope.ts must export ` +
        `mapNonRepresentableReturnValue(value, calleePath) beside mapEnvelopeParseFailure / ` +
        `mapEnvelopeSchemaSkew / mapExitWithoutEnvelope — observed exports ` +
        `${JSON.stringify(Object.keys(subagentEnvelope as unknown as Record<string, unknown>))}`,
    ).toBe("function");

    expect(
      exportedRefusalCode(),
      "the fourth fail-closed class carries its own registered code, as the other three do",
    ).toBe(REFUSAL_CODE);
  });
});

// ===========================================================================
// (SEAM) `mapNonRepresentableReturnValue` — the walk, its RFC-6901 positions,
// and the message. §Reproduction (b) and (d)'s subagent rows, at the seam route
// (b) adds.
// ===========================================================================

describe("bug 0180 (SEAM) — the child-side representability check over a non-finite Ok payload", () => {
  it("RED (SEAM-ROOT): Infinity at the root refuses with cause return_validation, the root pointer, and the value named", () => {
    const mapping = refusalFor(Infinity);

    // PRIMARY. `subagent.md`'s `Ok`-values bullet — measured at `34db8505` as
    // `:110` — asserts `Ok` values are "JSON-representable by construction";
    // `Infinity` is a runtime value (`runtime-value-model.md:8`) that JSON has no
    // form for, so the premise fails and route (b) makes the envelope fail closed
    // rather than substitute `null`.
    expect(
      mapping,
      `PRIMARY (bug 0180 §Fix (b)): a root-position Infinity must refuse the Ok envelope — ` +
        describeSurface(),
    ).toBeDefined();
    if (mapping === undefined) {
      return;
    }

    expect(mapping.error.kind, "the carrier is an InvokeInfraError").toBe("invoke_infra");
    // An EXISTING `InvokeInfraCause` (`src/runtime/query-error.ts:125`); route
    // (b) adds no enum member.
    expect(mapping.error.cause, "the existing return_validation cause carries it").toBe(
      "return_validation",
    );
    expect(mapping.error.callee_path, "the carrier names the callee it refused").toBe(CALLEE_PATH);
    expect(
      mapping.error.message,
      "the message names the value by its `query-escapes-stringification.md:22` rendering and " +
        "carries no ` at <pointer>` segment at the root",
    ).toBe(expectedRefusalMessage("", Infinity));
    expect(mapping.diagnostic.severity, "the diagnostic is error-severity").toBe("error");
    expect(mapping.diagnostic.code, "and carries the registered code").toBe(REFUSAL_CODE);
    // `refuseParams` (`src/runtime/subagent-params.ts:304`) puts the SAME string
    // on both the error and the diagnostic; route (b) mirrors that shape.
    expect(
      mapping.diagnostic.message,
      "the diagnostic and the error carry one string, as refuseParams does",
    ).toBe(mapping.error.message);
  });

  it("RED (SEAM-ROOT-NEG): -Infinity at the root refuses and is rendered -Infinity", () => {
    const mapping = refusalFor(-Infinity);
    expect(
      mapping,
      `PRIMARY (bug 0180): -1 / 0 is a specified value (expressions.md:232) the envelope ` +
        `substitutes null for — observed ${JSON.stringify(serializeOkEnvelope(-Infinity))}, ` +
        describeSurface(),
    ).toBeDefined();
    if (mapping === undefined) {
      return;
    }
    expect(mapping.error.message).toBe(expectedRefusalMessage("", -Infinity));
  });

  it("RED (SEAM-ROOT-NAN): NaN at the root refuses and is rendered NaN", () => {
    const mapping = refusalFor(NaN);
    expect(
      mapping,
      `PRIMARY (bug 0180): 0 / 0 and 1 % 0 are specified values (expressions.md:232) — ` +
        describeSurface(),
    ).toBeDefined();
    if (mapping === undefined) {
      return;
    }
    expect(mapping.error.message).toBe(expectedRefusalMessage("", NaN));
  });

  it("RED (SEAM-FIELD): a non-finite schema FIELD refuses at its RFC-6901 pointer /n", () => {
    const mapping = refusalFor({ n: NaN, who: "w" });

    // §Reproduction (d): the envelope for `Box { n: 1 / 0, who: "w" }` is
    // `{"theta_result":{"v":1,"ok":{"n":null,"who":"w"}}}` and the parent's AJV
    // refuses at `/n` while the sibling `who` validates. Route (b) reports the
    // same position in the process where it is still true of the real value.
    expect(
      mapping,
      `PRIMARY (bug 0180): one non-finite FIELD must refuse the payload — ` + describeSurface(),
    ).toBeDefined();
    if (mapping === undefined) {
      return;
    }
    expect(
      mapping.error.message,
      "the position is the RFC-6901 JSON Pointer to the field, as the depth walk's own " +
        "positions are (`src/runtime/depth-walk.ts:131`)",
    ).toBe(expectedRefusalMessage("/n", NaN));
  });

  it("RED (SEAM-ARRAY): a non-finite ARRAY ELEMENT refuses at /0 and at /1", () => {
    const first = refusalFor([Infinity, 1]);
    expect(
      first,
      `PRIMARY (bug 0180): element 0 — ` + describeSurface(),
    ).toBeDefined();
    if (first !== undefined) {
      expect(first.error.message).toBe(expectedRefusalMessage("/0", Infinity));
    }

    const second = refusalFor([1, NaN]);
    expect(
      second,
      `PRIMARY (bug 0180): element 1 — ` + describeSurface(),
    ).toBeDefined();
    if (second !== undefined) {
      expect(second.error.message).toBe(expectedRefusalMessage("/1", NaN));
    }
  });

  it("RED (SEAM-ORDER): the FIRST non-finite number in document order is the one reported", () => {
    const mapping = refusalFor({ a: 1, b: Infinity, c: NaN });
    expect(
      mapping,
      `PRIMARY (bug 0180): a payload with two non-finite members still refuses — ` +
        describeSurface(),
    ).toBeDefined();
    if (mapping === undefined) {
      return;
    }
    // One position, deterministically the first — the same fast-fail shape
    // `depthWalk` uses (`src/runtime/depth-walk.ts` `firstTooDeep`), so the
    // message is stable for a payload with several offenders.
    expect(mapping.error.message).toBe(expectedRefusalMessage("/b", Infinity));
  });

  it("RED (SEAM-NESTED): a non-finite number nested WITHIN the depth cap is reached, and its pointer spells the whole path", () => {
    // The companion of the FENCE-DEPTH cell below: within `MAX_JSON_DEPTH` the
    // walk descends and the pointer names every token on the way down. `Infinity`
    // sits at nesting level 4 here, so the ceiling-#4 walk defers (asserted in
    // that fence) and this check is the one that owns the payload.
    const mapping = refusalFor({ a: { b: { c: Infinity } } });
    expect(
      mapping,
      `PRIMARY (bug 0180): a nested non-finite number inside the cap must refuse — ` +
        describeSurface(),
    ).toBeDefined();
    if (mapping === undefined) {
      return;
    }
    expect(mapping.error.message).toBe(expectedRefusalMessage("/a/b/c", Infinity));
  });

  it("RED (SEAM-ESCAPE): a key containing / or ~ is escaped ~1 / ~0 in the pointer", () => {
    // RFC 6901 reference-token escaping, identical to `escapePointerToken`
    // (`src/runtime/depth-walk.ts:131`). Driven at the seam because a theta
    // object literal is not a legal expression
    // (`theta/parse/bare-object-literal`) and a schema field's wire rename does
    // not reach the runtime value's key set
    // (`docs/spec_topics/runtime-value-model.md:12` keys an object by its
    // theta-side names), so no theta source can mint such a key today; the seam
    // must still not emit an unescaped pointer if one ever arrives.
    const slash = refusalFor({ "a/b": Infinity });
    expect(slash, `PRIMARY (bug 0180): a '/' in a key — ` + describeSurface()).toBeDefined();
    if (slash !== undefined) {
      expect(slash.error.message).toBe(expectedRefusalMessage("/a~1b", Infinity));
    }

    const tilde = refusalFor({ "t~x": NaN });
    expect(tilde, `PRIMARY (bug 0180): a '~' in a key — ` + describeSurface()).toBeDefined();
    if (tilde !== undefined) {
      expect(tilde.error.message).toBe(expectedRefusalMessage("/t~0x", NaN));
    }
  });
});

// ===========================================================================
// (FENCE) The over-reach fences at the seam. GREEN now and GREEN after: route
// (b) detects FINITENESS ONLY, at depths the ceiling-#4 walk already owns.
// ===========================================================================

describe("bug 0180 (FENCE-SEAM) — what the representability check must NOT refuse", () => {
  it("CONTROL (FENCE-FINITE): every finite payload is admitted (green now, green after)", () => {
    // §Fix (e)(8): "The `1.5` / `Box { n: 2 }` finite controls are the
    // over-reach fence and assert UNCHANGED values." A refusal here would move
    // GOV-15 observable (a) for inputs the report never touches.
    for (const value of [
      1.5,
      42,
      0,
      -1,
      1e308,
      Number.MAX_SAFE_INTEGER,
      "hello",
      true,
      null,
      [1, 2],
      { n: 2, who: "w" },
      { n: 2, nested: { deeper: [3, 4] } },
      [],
      {},
    ]) {
      expect(
        refusalFor(value),
        `a finite payload must still write an ok envelope — ${render(value)} was refused`,
      ).toBeUndefined();
    }
  });

  it("CONTROL (FENCE-NEGATIVE-ZERO): -0 is finite, so it is NOT refused (green now, green after)", () => {
    // PINNED NON-GOAL. `0 * -1` evaluates to `-0` and `serializeOkEnvelope(-0)`
    // is `{"theta_result":{"v":1,"ok":0}}` — the sign is lost. That loss is a
    // separately recorded residual, NOT this report's class: route (b)'s
    // detection is finiteness only, and `-0` is finite. This cell is the fence
    // that stops the detection widening into sign preservation, which would
    // newly refuse a today-passing input with no registered class behind it.
    expect(
      refusalFor(-0),
      "-0 is a finite double; refusing it would widen route (b) past its stated class",
    ).toBeUndefined();
    expect(
      refusalFor({ n: -0, who: "w" }),
      "including at a schema field",
    ).toBeUndefined();
    expect(serializeOkEnvelope(-0), "and the ok envelope is still written, carrying 0").toBe(
      '{"theta_result":{"v":1,"ok":0}}\n',
    );
  });

  it("CONTROL (FENCE-DEPTH): the walk does not descend past MAX_JSON_DEPTH (green now, green after)", () => {
    // §Fix (e)(3): the ceiling-#4 depth walk stays first, and it refuses a
    // too-deep `invoke<T>` return payload WHATEVER it carries
    // (`enforceInvokeReturnDepth`, `src/runtime/invoke-ceiling-depth.ts:99`). A
    // representability walk that recursed without a bound would be an unbounded
    // recursion on adversarial input for no observable gain, so it shares the
    // same cap.
    expect(MAX_JSON_DEPTH, "the shared cap the walk is bounded by").toBe(5);

    // `Infinity` sits at nesting level 7 here — two levels past the cap.
    const tooDeep = { a: { b: { c: { d: { e: { f: Infinity } } } } } };
    expect(
      refusalFor(tooDeep),
      "a non-finite number deeper than the cap is not this walk's to find",
    ).toBeUndefined();
    // And the payload is refused anyway, one sub-check earlier and on its own
    // grounds, so nothing reaches the parent carrying a substituted null. The
    // ordering itself is pinned at `tests/invoke-ceiling-depth.test.ts:105`.
    const breach = enforceInvokeReturnDepth(CALLEE_PATH, tooDeep);
    expect(
      breach?.issue.message,
      "the ceiling-#4 walk owns that payload regardless of what it carries",
    ).toBe("JSON document depth exceeds 5");

    // The complement, so the fence bounds the cap from both sides: the SEAM-NESTED
    // cell's payload is WITHIN the cap, which is why ceiling #4 defers there and
    // the representability check is the one that must reach it.
    expect(
      enforceInvokeReturnDepth(CALLEE_PATH, { a: { b: { c: Infinity } } }),
      "a level-4 non-finite number is within the cap, so ceiling #4 defers to the AJV boundary",
    ).toBeUndefined();
  });
});

// ===========================================================================
// (MECHANISM) §Reproduction (b) and (e)'s subagent rows over the shipped seams.
// GREEN now and GREEN after: route (b) inserts a check BEFORE
// `serializeOkEnvelope` and does not change the serialiser, the parser, or the
// lowering. These rows are the mechanism the refusal exists to pre-empt.
// ===========================================================================

describe("bug 0180 (MECHANISM) — what the envelope does with a non-finite Ok today", () => {
  it("MECHANISM: serializeOkEnvelope substitutes null for every non-finite number, at every depth (green now, green after)", () => {
    // `serializeOkEnvelope` (`src/runtime/subagent-envelope.ts:107`) is
    // `JSON.stringify` of the payload (`:109`), and its doc-comment (`:98-106`)
    // records what that costs: `JSON.stringify` "has no non-finite form and
    // would substitute `null` for a value the callee never produced". That
    // substitution is what these rows measure. Route (b) leaves the serialiser
    // alone and refuses before reaching it.
    expect(serializeOkEnvelope(Infinity)).toBe('{"theta_result":{"v":1,"ok":null}}\n');
    expect(serializeOkEnvelope(-Infinity)).toBe('{"theta_result":{"v":1,"ok":null}}\n');
    expect(serializeOkEnvelope(NaN)).toBe('{"theta_result":{"v":1,"ok":null}}\n');
    expect(serializeOkEnvelope({ n: Infinity, who: "w" })).toBe(
      '{"theta_result":{"v":1,"ok":{"n":null,"who":"w"}}}\n',
    );
    expect(serializeOkEnvelope([Infinity, NaN])).toBe(
      '{"theta_result":{"v":1,"ok":[null,null]}}\n',
    );
  });

  it("MECHANISM: the parent's AJV refuses the substituted null under {\"type\":\"number\"} and ADMITS it under {\"type\":[\"number\",\"null\"]} (green now, green after)", () => {
    // The loud arm and the S1 arm are one mechanism read against two
    // annotations. §Reproduction (b) and (e), re-driven over the real
    // `lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:120`)
    // and the production `AjvSchemaValidator` (`src/seams/schema-validator.ts:104`).
    expect(JSON.stringify(loweredFor("number"))).toBe('{"type":"number"}');
    expect(JSON.stringify(loweredFor("number | null"))).toBe('{"type":["number","null"]}');
    expect(JSON.stringify(loweredFor("NBox"))).toBe(
      '{"type":"object","properties":{"n":{"type":["number","null"]},"who":{"type":"string"}},' +
        '"required":["n","who"],"additionalProperties":false}',
    );

    const reread = parseEnvelopeLine(serializeOkEnvelope(Infinity).trimEnd());
    expect(reread.kind, "the parent re-reads a well-formed ok envelope").toBe("ok");
    if (reread.kind !== "ok") {
      return;
    }
    expect(reread.value, "carrying a value the callee never produced").toBeNull();

    const validator = realAjvValidator();
    expect(
      validator.compile(loweredFor("number")).validate(reread.value).ok,
      "the non-nullable annotation refuses it — loud, and blaming the annotation",
    ).toBe(false);
    expect(
      validator.compile(loweredFor("number | null")).validate(reread.value),
      "the NULLABLE annotation admits it: this is the S1 arm — the caller binds null where the " +
        "callee produced Infinity, with no diagnostic on either side",
    ).toEqual({ ok: true });
    expect(
      validator.compile(loweredFor("NBox")).validate({ n: null, who: "w" }),
      "and the same holds one level down, at a nullable schema FIELD",
    ).toEqual({ ok: true });
  });

  it("CONTROL (MECHANISM-FINITE): a finite payload round-trips the envelope byte-for-byte and validates (green now, green after)", () => {
    // §Reproduction (b)'s `1.5` control: "the leg itself is sound: the loss is
    // specific to the values `JSON.stringify` has no form for."
    const rows: readonly { readonly value: unknown; readonly line: string; readonly annotation: string }[] = [
      { value: 1.5, line: '{"theta_result":{"v":1,"ok":1.5}}\n', annotation: "number" },
      { value: 42, line: '{"theta_result":{"v":1,"ok":42}}\n', annotation: "number" },
      {
        value: { n: 2, who: "w" },
        line: '{"theta_result":{"v":1,"ok":{"n":2,"who":"w"}}}\n',
        annotation: "Box",
      },
      { value: [1, 2], line: '{"theta_result":{"v":1,"ok":[1,2]}}\n', annotation: "array<number>" },
    ];
    const validator = realAjvValidator();
    for (const row of rows) {
      expect(serializeOkEnvelope(row.value), `the envelope line for ${render(row.value)}`).toBe(
        row.line,
      );
      const parse = parseEnvelopeLine(row.line.trimEnd());
      expect(parse.kind, `the ok arm for ${render(row.value)}`).toBe("ok");
      if (parse.kind !== "ok") {
        continue;
      }
      expect(parse.value, `${render(row.value)} re-reads unchanged`).toEqual(row.value);
      expect(
        validator.compile(loweredFor(row.annotation)).validate(parse.value),
        `${render(row.value)} validates under ${row.annotation}`,
      ).toEqual({ ok: true });
      expect(
        refusalFor(row.value),
        `and the representability check admits ${render(row.value)}`,
      ).toBeUndefined();
    }
  });
});

// ===========================================================================
// (CHILD) The SHIPPED child-side writer, driven in-process. This is the site
// route (b) changes: `driveSubagentRootRegime`'s `if (terminal.ok)` arm.
// ===========================================================================

describe("bug 0180 (CHILD) — the real child-side envelope writer over a non-finite final value", () => {
  it("RED (CHILD-ROOT): a callee whose final value is 1 / 0 writes an ERR envelope naming Infinity, plus one registered diagnostic", async () => {
    const drive = await driveChildRoot("1 / 0\n");
    const parse = soleEnvelope(drive);

    // PRIMARY. `invocation.md:36` fixes the envelope as this leg's CARRIAGE for
    // the final value; nothing specifies it as a filter that substitutes one
    // value for another. Route (b): where the value cannot cross, the envelope
    // fails closed rather than carrying a `null` the callee never produced.
    expect(
      parse.kind,
      `PRIMARY (bug 0180 §Fix (b)): the child must refuse rather than write ` +
        `{"theta_result":{"v":1,"ok":null}} for a final value of Infinity` + driveDetail(drive),
    ).toBe("err");
    if (parse.kind !== "err") {
      return;
    }
    const error = parse.error as unknown as Record<string, unknown>;
    expect(error["kind"], "the err arm is an InvokeInfraError").toBe("invoke_infra");
    expect(error["cause"], "carrying the existing return_validation cause").toBe(
      "return_validation",
    );
    expect(
      String(error["message"] ?? ""),
      "and naming the value, so the author reads the true cause instead of " +
        "`invoke<number> return value failed validation` one process away",
    ).toBe(expectedRefusalMessage("", Infinity));

    // The diagnosis happens in the process where the corruption happens.
    expect(
      drive.diagnostics.map((d) => d.code),
      `exactly one registered diagnostic is emitted` + driveDetail(drive),
    ).toEqual([REFUSAL_CODE]);
    expect(drive.diagnostics[0]?.severity).toBe("error");
    expect(
      drive.diagnostics[0]?.message,
      "and its message is the registry's normative string (DIAG-4)",
    ).toBe(expectedRefusalMessage("", Infinity));
  });

  it("RED (CHILD-ROOT-NEG-NAN): -1 / 0 and 0 / 0 refuse the same way, rendered -Infinity and NaN", async () => {
    const negative = await driveChildRoot("-1 / 0\n");
    const negativeParse = soleEnvelope(negative);
    expect(
      negativeParse.kind,
      `PRIMARY (bug 0180): -1 / 0` + driveDetail(negative),
    ).toBe("err");
    if (negativeParse.kind === "err") {
      expect(String((negativeParse.error as unknown as Record<string, unknown>)["message"])).toBe(
        expectedRefusalMessage("", -Infinity),
      );
    }

    const nan = await driveChildRoot("0 / 0\n");
    const nanParse = soleEnvelope(nan);
    expect(nanParse.kind, `PRIMARY (bug 0180): 0 / 0` + driveDetail(nan)).toBe("err");
    if (nanParse.kind === "err") {
      expect(String((nanParse.error as unknown as Record<string, unknown>)["message"])).toBe(
        expectedRefusalMessage("", NaN),
      );
    }
  });

  it("RED (CHILD-S1): the NULLABLE arm — NBox { n: 1 / 0, who: \"w\" } refuses at /n instead of writing an envelope the parent silently admits", async () => {
    const drive = await driveChildRoot(NBOX_DECL + 'NBox { n: 1 / 0, who: "w" }\n');

    // THE S1 HALF, in its own cell. §Reproduction (e): `number | null` lowers to
    // `{"type":["number","null"]}`, the child's envelope carries `null`, the
    // parent's AJV says `{"ok":true}`, and the caller binds `null` where the
    // callee produced `Infinity` — GOV-15 observable (a) moving on the callee's
    // `mode:` frontmatter alone, with no diagnostic and no registered code. This
    // is the arm §Fix (b) removes entirely: "no caller ever binds a `null` the
    // callee did not produce."
    //
    // The premise is measured in the MECHANISM cell above (the same compiled
    // NBox document validates `{"n":null,"who":"w"}` `{"ok":true}`), so the
    // envelope this drive writes at HEAD is admitted rather than refused.
    const parse = soleEnvelope(drive);
    expect(
      parse.kind,
      `PRIMARY (bug 0180, the S1 arm): a nullable position must not turn a lost Infinity into a ` +
        `silently bound null` + driveDetail(drive),
    ).toBe("err");
    if (parse.kind !== "err") {
      return;
    }
    const error = parse.error as unknown as Record<string, unknown>;
    expect(error["cause"]).toBe("return_validation");
    expect(
      String(error["message"] ?? ""),
      "the position is still true of the real value in the child, which is why the diagnosis " +
        "belongs here",
    ).toBe(expectedRefusalMessage("/n", Infinity));
    expect(drive.diagnostics.map((d) => d.code)).toEqual([REFUSAL_CODE]);
  });

  it("RED (CHILD-ARRAY): [1 / 0, 0 / 0] refuses at /0, the first non-finite element", async () => {
    const drive = await driveChildRoot("[1 / 0, 0 / 0]\n");
    const parse = soleEnvelope(drive);
    expect(
      parse.kind,
      `PRIMARY (bug 0180): an array whose elements are both non-finite is written as ` +
        `[null,null] today` + driveDetail(drive),
    ).toBe("err");
    if (parse.kind !== "err") {
      return;
    }
    expect(
      String((parse.error as unknown as Record<string, unknown>)["message"] ?? ""),
      "one position, deterministically the first",
    ).toBe(expectedRefusalMessage("/0", Infinity));
    expect(drive.diagnostics.map((d) => d.code)).toEqual([REFUSAL_CODE]);
  });

  it("CONTROL (CHILD-FINITE): finite final values still write the ok envelope with no diagnostic (green now, green after)", async () => {
    const rows: readonly { readonly body: string; readonly line: string; readonly label: string }[] = [
      { body: "2\n", line: '{"theta_result":{"v":1,"ok":2}}\n', label: "2" },
      { body: "3 / 2\n", line: '{"theta_result":{"v":1,"ok":1.5}}\n', label: "3 / 2" },
      {
        body: NBOX_DECL + 'NBox { n: 2, who: "w" }\n',
        line: '{"theta_result":{"v":1,"ok":{"n":2,"who":"w"}}}\n',
        label: 'NBox { n: 2, who: "w" }',
      },
      { body: "[1, 2]\n", line: '{"theta_result":{"v":1,"ok":[1,2]}}\n', label: "[1, 2]" },
      // The pinned non-goal, at the real writer: `-0` is finite, so the ok
      // envelope is still written (carrying `0`). A red here means the detection
      // widened from finiteness into sign preservation.
      { body: "0 * -1\n", line: '{"theta_result":{"v":1,"ok":0}}\n', label: "0 * -1 (-0)" },
    ];
    for (const row of rows) {
      const drive = await driveChildRoot(row.body);
      expect(drive.lines, `${row.label} writes exactly one ok envelope, unchanged`).toEqual([
        row.line,
      ]);
      expect(drive.diagnostics, `${row.label} emits no diagnostic`).toEqual([]);
      const parse = soleEnvelope(drive);
      expect(parse.kind, `${row.label} stays the ok arm`).toBe("ok");
    }
  });

  it("CONTROL (CHILD-VERSION): the refusal rides the pinned envelope version, as the other fail-closed classes do (green now for the shape, green after)", async () => {
    // PIC-59 versioning: whichever arm the child writes, the line carries the
    // pinned `v`. Asserted over a finite drive so this cell is a shape lock
    // rather than a second copy of the CHILD-ROOT red.
    const drive = await driveChildRoot("2\n");
    const parsed = JSON.parse((drive.lines[0] as string).trimEnd()) as Record<string, unknown>;
    const payload = parsed[subagentEnvelope.THETA_RESULT_KEY] as Record<string, unknown>;
    expect(payload["v"]).toBe(THETA_ENVELOPE_VERSION);
  });
});

// ===========================================================================
// (DIAG-4) The registry row, and the message halves every assertion above is
// composed from.
// ===========================================================================

describe("bug 0180 (DIAG-4) — the registered code and its normative Message", () => {
  it("RED (DIAG-4): code-registry-runtime.md carries the row, and the shipped message composes from its halves", () => {
    const template = registryMessage(REGISTRY, REFUSAL_CODE) as string | undefined;

    // PRIMARY. §Fix (b): "It needs a registered code and its same-commit spec
    // edits." DIAG-4 (`docs/spec_topics/diagnostics/diagnostic-shape.md`) makes
    // the *Message* column normative, and DIAG-2 makes the registry closed in
    // both directions — a code this file asserts with no row fails the H5a gate.
    expect(
      template,
      `PRIMARY (bug 0180 §Fix (b)): docs/spec_topics/diagnostics/code-registry-runtime.md must ` +
        `carry a ${REFUSAL_CODE} row, joining the four OTHER RFC-0006 marshalling codes already ` +
        `enumerated there`,
    ).toBeDefined();
    if (template === undefined) {
      return;
    }
    expect(
      template,
      "the template names the subject and leaves the refused value as a placeholder",
    ).toBe(`subagent return value is not JSON-representable: ${VALUE_PLACEHOLDER}`);

    // The shipped string interpolates `<value>` and carries the ` at <pointer>`
    // segment the template does not spell out — the same relationship
    // `theta/runtime/subagent-params-validation-failed` has with its own
    // template (`code-registry-runtime.md:31` vs `refuseParams`,
    // `src/runtime/subagent-params.ts:304`). So the halves are anchored rather
    // than compared whole.
    const rootMessage = expectedRefusalMessage("", Infinity);
    expect(rootMessage, "at the root the shipped string IS the filled template").toBe(
      template.replace(VALUE_PLACEHOLDER, "Infinity"),
    );
    const fieldMessage = expectedRefusalMessage("/n", Infinity);
    expect(
      fieldMessage.startsWith("subagent return value is not JSON-representable"),
      "and a positioned refusal keeps the template's head as its anchored prefix",
    ).toBe(true);
    expect(
      fieldMessage.endsWith(": Infinity"),
      "and the template's tail half as its anchored suffix",
    ).toBe(true);

    // The code constant and the registry row name the same string.
    expect(exportedRefusalCode(), "DIAG-3: the code is one stable identifier").toBe(REFUSAL_CODE);
  });
});

// ===========================================================================
// (PROMPT) The prompt→prompt attach leg — ZERO FLIPS.
//
// Route (b) is child-side only: §Fix (a) (normalise `projectForValidation`) and
// §Fix (d) (`strictNumbers` at the seam) are NOT taken, so every row here is
// GREEN NOW and MUST STAY GREEN. This is the GOV-15
// (`docs/spec_topics/governance/source-language-stability.md:5`) observable-(a)
// evidence that the chosen route flips nothing on this leg — the exact cost that
// blocked §Fix (a), whose own record says "normalising it would newly refuse a
// today-passing prompt-cell input, which GOV-15 forbids".
//
// The residual mode-variance these rows encode — the prompt leg admits the
// callee's own non-finite value while the subagent leg refuses loudly — is the
// STATED END STATE of route (b), not a pending red.
// ===========================================================================

describe("bug 0180 (PROMPT) — the prompt→prompt attach leg is untouched by route (b)", () => {
  it("CONTROL (PROMPT-ROOT): invoke<number> of every non-finite spelling still binds the callee's own value (green now, green after)", async () => {
    // §Reproduction (a), re-driven on the real cell. All four spellings load with
    // `[]` diagnostics (`expressions.md:232`) and all four bind here.
    const rows: readonly { readonly body: string; readonly expected: number }[] = [
      { body: "1 / 0\n", expected: Infinity },
      { body: "-1 / 0\n", expected: -Infinity },
      { body: "1e308 * 10\n", expected: Infinity },
    ];
    for (const row of rows) {
      const result = await driveTypedInvoke({
        annotation: "number",
        callerDecls: "",
        calleeBody: row.body,
      });
      expect(
        result.ok,
        `GOV-15 (a): ${row.body.trim()} binds Ok on this leg today and must keep binding it` +
          errDetail(result),
      ).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(result.value, `${row.body.trim()} binds the callee's own value, unchanged`).toBe(
        row.expected,
      );
    }

    for (const body of ["0 / 0\n", "1 % 0\n"]) {
      const result = await driveTypedInvoke({
        annotation: "number",
        callerDecls: "",
        calleeBody: body,
      });
      expect(result.ok, `GOV-15 (a): ${body.trim()} binds Ok today` + errDetail(result)).toBe(true);
      if (!result.ok) {
        continue;
      }
      expect(
        Number.isNaN(result.value as number),
        `${body.trim()} binds NaN, the value expressions.md:232 specifies`,
      ).toBe(true);
    }
  });

  it("CONTROL (PROMPT-NULLABLE): invoke<number | null> still binds Infinity, NOT null (green now, green after)", async () => {
    // The prompt half of the S1 pair. Route (b) removes the SUBAGENT leg's
    // silent `null`; it does not make this leg agree by refusing here.
    const result = await driveTypedInvoke({
      annotation: "number | null",
      callerDecls: "",
      calleeBody: "1 / 0\n",
    });
    expect(result.ok, "the nullable annotation binds Ok on this leg" + errDetail(result)).toBe(
      true,
    );
    if (!result.ok) {
      return;
    }
    expect(
      result.value,
      "and binds the callee's Infinity — the value the subagent leg loses to a substituted null",
    ).toBe(Infinity);
  });

  it("CONTROL (PROMPT-NESTED): a non-finite schema FIELD and a non-finite ARRAY ELEMENT still bind unchanged (green now, green after)", async () => {
    // §Reproduction (d) and (e)'s prompt rows.
    const box = await driveTypedInvoke({
      annotation: "Box",
      callerDecls: BOX_DECL,
      calleeBody: BOX_DECL + 'Box { n: 1 / 0, who: "w" }\n',
    });
    expect(box.ok, "the non-nullable schema field binds Ok" + errDetail(box)).toBe(true);
    if (box.ok) {
      const fields = box.value as { readonly [k: string]: ThetaValue };
      expect(fields.n, "the field carries the callee's Infinity").toBe(Infinity);
      expect(fields.who, "the sibling string field is unchanged").toBe("w");
    }

    const nbox = await driveTypedInvoke({
      annotation: "NBox",
      callerDecls: NBOX_DECL,
      calleeBody: NBOX_DECL + 'NBox { n: 1 / 0, who: "w" }\n',
    });
    expect(nbox.ok, "the NULLABLE schema field binds Ok" + errDetail(nbox)).toBe(true);
    if (nbox.ok) {
      const fields = nbox.value as { readonly [k: string]: ThetaValue };
      expect(
        fields.n,
        "and binds Infinity where the subagent leg's admitted envelope binds null",
      ).toBe(Infinity);
    }

    const array = await driveTypedInvoke({
      annotation: "array<number>",
      callerDecls: "",
      calleeBody: "[1 / 0, 0 / 0]\n",
    });
    expect(array.ok, "the array binds Ok" + errDetail(array)).toBe(true);
    if (array.ok) {
      const elements = array.value as readonly ThetaValue[];
      expect(elements[0], "element 0 is the callee's Infinity").toBe(Infinity);
      expect(Number.isNaN(elements[1] as number), "element 1 is the callee's NaN").toBe(true);
    }
  });

  it("CONTROL (PROMPT-INTEGER): the annotation-dependent split under integer does not move (green now, green after)", async () => {
    // §Reproduction (b)'s `integer` block: AJV's `integer` check adds
    // `!isNaN(data)` and no finiteness test, so this leg admits `±Infinity` and
    // refuses `NaN` — a split produced by an AJV option chosen for
    // schema-strictness reasons (`src/seams/schema-validator.ts:112`), which
    // §Fix (d) would have flipped and route (b) leaves alone.
    const infinite = await driveTypedInvoke({
      annotation: "integer",
      callerDecls: "",
      calleeBody: "1 / 0\n",
    });
    expect(infinite.ok, "invoke<integer> admits Infinity today" + errDetail(infinite)).toBe(true);
    if (infinite.ok) {
      expect(infinite.value).toBe(Infinity);
    }

    const nan = await driveTypedInvoke({
      annotation: "integer",
      callerDecls: "",
      calleeBody: "0 / 0\n",
    });
    expect(nan.ok, "invoke<integer> refuses NaN today, on both legs").toBe(false);
    if (!nan.ok) {
      const error = nan.error as unknown as Record<string, unknown>;
      expect(
        error["cause"],
        "and the refusal is the gate's existing return_validation carrier, unchanged",
      ).toBe("return_validation");
      expect(error["message"]).toBe("invoke<integer> return value failed validation");
    }
  });

  it("CONTROL (PROMPT-FINITE): the finite controls cross unchanged (green now, green after)", async () => {
    const scalar = await driveTypedInvoke({
      annotation: "number",
      callerDecls: "",
      calleeBody: "3 / 2\n",
    });
    expect(scalar.ok, "the 3 / 2 control" + errDetail(scalar)).toBe(true);
    if (scalar.ok) {
      expect(scalar.value).toBe(1.5);
    }

    const box = await driveTypedInvoke({
      annotation: "Box",
      callerDecls: BOX_DECL,
      calleeBody: BOX_DECL + 'Box { n: 2, who: "w" }\n',
    });
    expect(box.ok, "the Box { n: 2 } control" + errDetail(box)).toBe(true);
    if (box.ok) {
      expect(box.value, "the finite object crosses with the same content").toEqual({
        n: 2,
        who: "w",
      });
    }

    const array = await driveTypedInvoke({
      annotation: "array<number>",
      callerDecls: "",
      calleeBody: "[1, 2]\n",
    });
    expect(array.ok, "the [1, 2] control" + errDetail(array)).toBe(true);
    if (array.ok) {
      expect(array.value).toEqual([1, 2]);
    }

    // `-0` is finite, so this leg keeps binding it and the subagent leg keeps
    // writing its ok envelope — the pinned non-goal, on the other leg.
    const negativeZero = await driveTypedInvoke({
      annotation: "number",
      callerDecls: "",
      calleeBody: "0 * -1\n",
    });
    expect(negativeZero.ok, "the 0 * -1 control" + errDetail(negativeZero)).toBe(true);
    if (negativeZero.ok) {
      expect(
        Object.is(negativeZero.value, -0),
        `this leg binds -0 itself — observed ${promptOutcome(negativeZero)}`,
      ).toBe(true);
    }
  });
});
