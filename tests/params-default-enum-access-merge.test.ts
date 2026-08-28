import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bug 0181 — a `params:` default authored as `Enum.Variant` is refused by the
// post-default-merge AJV check. `#recoverDeclaredDefaults`
// (`src/extension/production-theta-producer.ts:1292`) evaluates the default's
// literal through the theta's own body environment, so `Sev.High` resolves via
// `LexicalEnvironment.resolveEnumVariant`
// (`src/runtime/lexical-environment.ts:671`) to `makeEnumValue`'s boxed
// `String` (`src/runtime/value.ts:135`, the `new String(wire)` carrier at
// `:136`), whose `typeof` is `"object"`. The push at
// `production-theta-producer.ts:1341` hands that value to
// `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:124`), whose fill loop
// writes it into the merged record verbatim (`:136`) and whose AJV step
// validates the record as it stands (`:158`). A named `enum` lowers to
// `{"type":"string","enum":[…]}`, and AJV's `type` check is a `typeof` test, so
// the runtime's own default is refused, `classifyBinderArgs`
// (`src/binder/retry-taxonomy.ts:184`) mints the AJV-on-`args` class,
// `runBinder` routes it before the success echo
// (`production-theta-producer.ts:923` vs `:930`) and the slash invocation ends
// `{ bound: false }` with the binder model call already spent
// (docs/bugs/0181-enum-access-params-default-boxed-string-refused-at-merge.md).
//
// WHAT IS RED HERE AND WHY. Five positions carry the boxed carrier into the
// merged document and are refused at HEAD — the annotated field, a named-enum
// field of a schema-typed default under both admitted object spellings, an
// array element, and a union arm — plus the invocation half of deferral row c6.
// Each of those cells asserts the note the merge produces AFTER the fix (the
// BND-1 success echo), so its red is the verbatim AJV-on-`args` refusal against
// the expected echo, not a harness error. GREEN BY DESIGN and required to stay
// green on both sides: the four over-reach controls (the bare-wire-string
// spelling, fill-if-absent, the schema-brand control, and the value-mismatch
// control that keeps the gate value-aware rather than representation-blind).
//
// MEASURED SIGNATURES AT HEAD `9209f996` (v0.102.0), offline, deterministic,
// provider-free; re-derived by probe before this file was added, then deleted.
// Every fixture parses with ZERO diagnostics and issues exactly ONE binder
// model call (HC3-c, no retry). Pre-fix:
//   sev: 'Sev = Sev.High'          bound=false
//     theta /s1: argument binding produced invalid args — /sev must be equal to
//     one of the allowed values; /sev must be string
//   sev: 'Sev | null = Sev.High'   bound=false  (… /sev must match a schema in
//     anyOf; /sev must be equal to one of the… — capped at 120 code points)
//   box: 'Box = Box { … }'         bound=false  (… /box/sev …)
//   box: 'Box = { … }'             bound=false  (identical to the `Box { … }` spelling)
//   sevs: 'array<Sev> = [Sev.High]' bound=false (… /sevs/0 …)
//   p: 'Sev = Sev.A'  (row c6)     bound=false  (… /p must be equal to one of
//     the allowed values; /p must be string)
// Post-fix, the merged values and echo rows the cells below pin:
//   {"topic":"hello","sev":"high"}            Running /s1: topic=hello, sev=high (default)
//   {"topic":"hello","sev":"high"}            Running /s3: topic=hello, sev=high (default)
//   {"topic":"hello","box":{"sev":"high","who":"w"}}
//                                             Running /s4: topic=hello, box={high, …} (default)
//   {"topic":"hello","sevs":["high"]}         Running /s6: topic=hello, sevs=[high] (default)
//   {"topic":"hello","p":"A"}                 Running /s14: topic=hello, p=A (default)
// The controls are byte-identical on both sides:
//   Running /s2: topic=hello, sev=high (default)
//   Running /s13: topic=hello, sev=low
//   Running /s12: topic=hello, plain={w, …} (default)
//   theta /s11: argument binding produced invalid args — /sev must be equal to
//   one of the allowed values
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:60 (§Defaults) — the
//     admitted production set includes "`Enum.Variant` access", and "When a
//     slash-command invocation omits the corresponding positional argument, the
//     default is filled in before AJV validation"; :67 — the section's own
//     worked example `severity: Severity = Severity.Medium`; :71 —
//     "`Enum.Variant` defaults preserve the runtime enum brand (see Runtime
//     Value Model) without a separate restoration pass".
//   - docs/spec_topics/type-system.md:48 (§Unresolvable operands) — "the
//     parse-time check is skipped and the runtime AJV check is the safety net",
//     the sentence deferral row c6 rests on.
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:9 (fill-if-absent,
//     keyed on the wire name, and the `(default)` echo tag), :11 (the
//     post-default-merge AJV hook over the merged `args`).
//   - docs/spec_topics/binder/determinism-cancellation-failure.md:35 (the
//     AJV-on-`args` class, minted for "a binder that … is hallucinating field
//     shapes"; not retried), :42 (the `<ajv-summary>` in-order `<path>
//     <message>` join, `; `-separated), :52 (the rendered row `theta /<name>:
//     argument binding produced invalid args — <ajv-summary>`).
//   - docs/spec_topics/runtime-value-model.md:13 (the enum row — the tag "MUST
//     NOT appear in JSON output"; the requirement is on JSON output, not on
//     `typeof`), :34 (§Wire-name translation, the inbound bullet: the pass runs
//     "after AJV validation against the lowered schema" over the four
//     boundaries, binder `args` among them, and dispatches an `anyOf` position
//     under the first admitting arm).
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15) —
//     observable (c) is byte-identical `theta-system-note` content, which is
//     what the four controls fence.
//
// TIER: unit, offline, deterministic, provider-free, zero model turns. The
// whole contract settles inside one `composeThetaFixture(...).run(...)`
// dispatch over the production `ProductionThetaProducer.runBinder()` with the
// off-session pi-ai `complete()` scripted (the bug-0011 / e2e-s5 pattern): the
// refusal, the merged `args`, the echo row and the projected body-scope value
// are all determined by the theta's own frontmatter and one scripted envelope.
// An integration tier would re-drive discovery to reach the same seam and
// witness nothing further; the live tier would add a real binder model, whose
// only contribution is the `ok` envelope this file pins.
//
// NO SILENT SKIPPING: the fixture fs backing `#recoverDeclaredDefaults` REJECTS
// an unregistered path (never a silent empty read), `parseCell` asserts a clean
// parse before a fixture is driven, `driveSlash` throws when the dispatch
// surfaced a panic or top-level `Err` instead of binding, and every reader
// below throws naming the `theta-system-note` channel / the projected binding
// it needs when it is absent. A missing fixture, a refused parse or an empty
// note list can never read as a pass.

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
import { bindParamsInbound } from "../src/runtime/inbound-boundary";
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
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { QueryError } from "../src/runtime/query-error";
import {
  isEnumValue,
  makeEnumValue,
  makeOk,
  schemaTagOf,
  valuesEqual,
  type ResultValue,
  type ThetaValue,
} from "../src/runtime/value";
import { enumDeclaringKey } from "../src/runtime/lexical-environment";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/** The rule-3 prefix/suffix separator of `renderFailureNote` (U+2014 EM DASH). */
const EM_DASH = "\u2014";

/** The echo's elided-value marker and the rule-2 truncation marker (U+2026). */
const ELLIPSIS = "\u2026";

/** The two-character `<ajv-summary>` inter-issue separator (`renderAjvSummary`). */
const AJV_SUMMARY_SEPARATOR = "; ";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
const AJV_ARGS_PHRASE = "argument binding produced invalid args";

/** The AJV-on-`args` note for one theta and one rendered `<ajv-summary>`. */
function ajvArgsNote(thetaName: string, ajvSummary: string): string {
  return `theta /${thetaName}: ${AJV_ARGS_PHRASE} ${EM_DASH} ${ajvSummary}`;
}

/**
 * The locally constructed variant every enum-position cell compares against —
 * runtime-value-model.md:34's own success criterion for the inbound pass ("so
 * the resulting value compares equal to a locally constructed variant of the
 * same enum").
 */
// 0337: `.theta` enum tags now key on the DECLARING file, not the bare name.
// Each cell parses its OWN body under its OWN `sourcePathOf(name)`, so a value
// asserted to satisfy "that cell's own enum" must carry that cell's own
// declaring key rather than one shared bare tag.
function sevHighOf(name: CellName): ThetaValue {
  return makeEnumValue(enumDeclaringKey(sourcePathOf(name), "Sev"), "high");
}

/** Row c6's variant, whose enum declares bare variants rather than wire strings. */
function sevAOf(name: CellName): ThetaValue {
  return makeEnumValue(enumDeclaringKey(sourcePathOf(name), "Sev"), "A");
}

// ===========================================================================
// Fixtures.
// ===========================================================================

/**
 * The shared body every enum cell resolves its `params:` types against: the
 * declaring `enum`, a `schema` carrying a named-enum field (the `/box/sev`
 * depth position) and a brand-only `schema` (the control that isolates the
 * boxed carrier as the sole refusing value — a `SCHEMA_TAG` brand is a
 * non-enumerable symbol and is AJV-invisible).
 *
 * The bodies here are declarations only, with no query tail: the dispatch below
 * runs the real `executeBody`, and a `@`-query tail would need a conversation
 * seam this offline tier composes none of. Every observable the cells read —
 * the merged `args`, the echo row, the projected `paramBindings` — is produced
 * by the binder step BEFORE the body runs, so the tail's absence changes none
 * of them.
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
    "  topic: string",
    `  ${field}`,
    "---",
    body,
    "",
  ].join("\n");
}

/** One driven cell: its slash name, its defaulted field, its body, its envelope. */
interface Cell {
  /** The `params:` line under test, verbatim. */
  readonly field: string;
  /** The body whose declarations the field's type and default resolve against. */
  readonly body: string;
  /**
   * The scripted `ok` envelope's `args`. Every cell but the fill-if-absent
   * control OMITS the defaulted field, exactly as the binder system prompt
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
  /** (1) The annotated field — the bug's subject and the spec's worked example. */
  s1: { field: `sev: 'Sev = Sev.High'`, body: ENUM_BODY, envelope: OMITTED },
  /** (6) CONTROL — the bare wire string, which binds today and must keep binding. */
  s2: { field: `sev: 'Sev = "high"'`, body: ENUM_BODY, envelope: OMITTED },
  /** (5) The union arm — the position an `anyOf` sidecar carries no pointer for. */
  s3: { field: `sev: 'Sev | null = Sev.High'`, body: ENUM_BODY, envelope: OMITTED },
  /** (2) The `Box { … }` spelling — the named-object literal. */
  s4: { field: `box: 'Box = Box { sev: Sev.High, who: "w" }'`, body: ENUM_BODY, envelope: OMITTED },
  /** (3) The bare-object spelling — same value, no brand on the literal. */
  s5: { field: `box: 'Box = { sev: Sev.High, who: "w" }'`, body: ENUM_BODY, envelope: OMITTED },
  /** (4) The array element. */
  s6: { field: `sevs: 'array<Sev> = [Sev.High]'`, body: ENUM_BODY, envelope: OMITTED },
  /** (9) CONTROL — a wire string OUTSIDE the variant set: refused on its VALUE. */
  s11: { field: `sev: 'Sev = "nope"'`, body: ENUM_BODY, envelope: OMITTED },
  /** (8) CONTROL — a brand-only default, AJV-invisible and admitted today. */
  s12: { field: `plain: 'Plain = Plain { who: "w" }'`, body: ENUM_BODY, envelope: OMITTED },
  /** (7) CONTROL — fill-if-absent: the envelope SUPPLIES the field. */
  s13: {
    field: `sev: 'Sev = Sev.High'`,
    body: ENUM_BODY,
    envelope: { topic: "hello", sev: "low" },
  },
  /** (10) Deferral row c6's exact fixture, driven. */
  s14: { field: `p: 'Sev = Sev.A'`, body: C6_BODY, envelope: OMITTED },
} as const satisfies Record<string, Cell>;

type CellName = keyof typeof CELLS;

/** The composition-input `sourcePath` a cell's bytes are re-read from. */
function sourcePathOf(name: CellName): string {
  return `/theta/${name}.theta`;
}

/**
 * The fixture sources by `sourcePath`, backing the root double's in-memory
 * `fileSystem.readBytes` so `#recoverDeclaredDefaults`
 * (`src/extension/production-theta-producer.ts:1292`) re-reads the same bytes
 * the parser saw. An unregistered path REJECTS loudly: a silent empty read
 * would make a defaults-recovery failure look like a clean merge, which is the
 * one way every cell below could pass while witnessing nothing.
 */
const FIXTURE_SOURCES: ReadonlyMap<string, string> = new Map(
  (Object.keys(CELLS) as CellName[]).map((name) => [
    sourcePathOf(name),
    thetaSource(CELLS[name].field, CELLS[name].body),
  ]),
);

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
    path: `${name}.theta`,
    bytes: new TextEncoder().encode(thetaSource(CELLS[name].field, CELLS[name].body)),
  };
  const doc = parseThetaDocument(source, parseDeps());
  expect(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    "the fixture must parse cleanly before it is driven — a refused parse would make every assertion below unreachable",
  ).toEqual([]);
  expect(doc.frontmatter, "the fixture must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/**
 * The production AJV validator, wired with the same `JSON.stringify`
 * content-addressing the shipped composition root uses
 * (`src/extension/production-composition.ts`), so the envelope AJV at the
 * routing step, the post-merge hook and the inbound union-arm re-test all
 * resolve through one compiled-validator cache exactly as production does.
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

/** Everything one driven dispatch exposes. */
interface DispatchCapture {
  readonly cell: CellName;
  /** The `theta-system-note` channel entries' rendered content, in delivery order. */
  readonly notes: readonly string[];
  /** The production `runBinder` verdict, captured on its way through the dispatch. */
  readonly binder: BinderRunResult | undefined;
  /** The `paramBindings` the shipped `paramBindingsFrom` projected, when it ran. */
  readonly paramBindings: ReadonlyMap<string, ThetaValue> | undefined;
  /** Binder LLM attempts (HC3-c: this class carries no retry budget). */
  readonly binderCalls: number;
  /** The theta's own lowered `params:` document. */
  readonly lowered: Record<string, unknown>;
  /** The parsed body, for a mirrored projection. */
  readonly body: ThetaBody;
  /** Whether the composed producer deps carried the runtime's `SchemaValidator`. */
  readonly schemaValidatorThreaded: boolean;
}

/**
 * Drive one cell through the shipped slash-dispatch entry.
 *
 * This is the HIGHER-FIDELITY route `tests/inbound-boundary-binder-args.test.ts`
 * establishes: `composeThetaFixture(...).run(...)` reaches the real
 * `paramBindingsFrom` (`src/extension/theta-composition-producer.ts:99`) at its
 * real call site (`:417`), which is where production hands it
 * `deps.schemaValidator`. That file stubs the binder step; this one keeps it —
 * `runBinder` delegates to the production `ProductionThetaProducer`, so the
 * merged `args` the projection receives are the ones
 * `fillDefaultsAndRevalidate` actually produced. Only the two conversation
 * bindings are replaced, because binding a real Pi session is what would make
 * this tier non-offline.
 *
 * `schemaValidator` is read off the production producer's own accessor
 * (`src/extension/production-theta-producer.ts:718`), which is how the shipped
 * composition root supplies it: `production-composition.ts:652` builds
 * `producerDeps` with `createProductionProducerDeps(...)` and `:1015` hands that
 * same object to `composeThetaFixture`.
 */
async function driveSlash(name: CellName): Promise<DispatchCapture> {
  const doc = parseCell(name);
  const lowered = doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
  if (lowered === undefined) {
    throw new Error(
      `harness: cell ${name} produced no lowered \`params:\` document, so the post-default-merge hook this file is about does not exist for it`,
    );
  }
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
  const panicNotes: string[] = [];

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
        executeDeps: inertExecuteDeps(doc.body, `${name}.theta`),
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
    emitPanicNote: (framing: string, _diagnostic: Diagnostic): void => {
      panicNotes.push(framing);
    },
    ...(production.schemaValidator !== undefined
      ? { schemaValidator: production.schemaValidator }
      : {}),
  };

  await composeThetaFixture(theta, deps).run("hello", {} as unknown as ExtensionCommandContext);

  if (panicNotes.length > 0 || errNotes.length > 0) {
    throw new Error(
      `harness: cell ${name} surfaced notes instead of settling on the binder verdict — panic ${JSON.stringify(
        panicNotes,
      )} err ${JSON.stringify(errNotes)}`,
    );
  }

  return {
    cell: name,
    notes,
    binder,
    paramBindings,
    binderCalls: scripted.calls.length,
    lowered,
    body: doc.body,
    schemaValidatorThreaded: deps.schemaValidator !== undefined,
  };
}

// --- Loud readers ----------------------------------------------------------

/** The one `theta-system-note` row this dispatch delivered. */
function soleNote(capture: DispatchCapture): string {
  if (capture.notes.length !== 1) {
    throw new Error(
      `harness: cell ${capture.cell} needs exactly one \`${SYSTEM_NOTE_CHANNEL}\` row to read, and the channel captured ${capture.notes.length}: ${JSON.stringify(
        capture.notes,
      )}`,
    );
  }
  return capture.notes[0] as string;
}

/** The merged `args` the binder bound, or a loud throw naming the refusal. */
function boundArgs(capture: DispatchCapture): Readonly<Record<string, unknown>> {
  if (capture.binder?.args === undefined) {
    throw new Error(
      `harness: cell ${capture.cell} surfaced no bound args (bound=${String(
        capture.binder?.bound,
      )}); the \`${SYSTEM_NOTE_CHANNEL}\` channel carried ${JSON.stringify(capture.notes)}`,
    );
  }
  return capture.binder.args;
}

/** One projected body-scope binding, or a loud throw naming what did arrive. */
function bindingOf(capture: DispatchCapture, param: string): ThetaValue {
  const bindings = capture.paramBindings;
  if (bindings === undefined) {
    throw new Error(
      `harness: cell ${capture.cell} projected no \`paramBindings\` — the dispatch short-circuited on the binder verdict, so the inbound boundary was never reached; the \`${SYSTEM_NOTE_CHANNEL}\` channel carried ${JSON.stringify(
        capture.notes,
      )}`,
    );
  }
  if (!bindings.has(param)) {
    throw new Error(
      `harness: cell ${capture.cell} bound no '${param}'; the projection carried ${JSON.stringify([
        ...bindings.keys(),
      ])}`,
    );
  }
  return bindings.get(param) as ThetaValue;
}

/** A named field of a projected object binding, read loudly. */
function fieldOf(value: ThetaValue, field: string): ThetaValue {
  const record = value as Record<string, ThetaValue>;
  if (typeof value !== "object" || value === null || !(field in record)) {
    throw new Error(
      `harness: the bound value carries no '${field}' field to read: ${JSON.stringify(value)}`,
    );
  }
  return record[field] as ThetaValue;
}

/** An element of a projected array binding, read loudly. */
function elementOf(value: ThetaValue, index: number): ThetaValue {
  if (!Array.isArray(value) || value.length <= index) {
    throw new Error(
      `harness: the bound value is not an array with an index ${index}: ${JSON.stringify(value)}`,
    );
  }
  return value[index] as ThetaValue;
}

beforeEach(() => {
  scripted.replyFor = undefined;
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// (1) THE ANNOTATED FIELD — the spec's own worked example spelling.
// RED at HEAD: the boxed carrier reaches `validator.validate(merged)`
// (src/binder/defaulting.ts:158) and the lowered `{"type":"string","enum":[…]}`
// refuses it on `typeof`, so the dispatch ends `{ bound: false }`.
// ===========================================================================

describe("bug 0181 (1) — an `Enum.Variant` default at the annotated field binds", () => {
  it("RED (1): the merge admits `Sev.High`, echoes it as its wire string, and binds it TAGGED", async () => {
    const capture = await driveSlash("s1");

    // THE PRIMARY ASSERTION, first so the red names the symptom the bug reports:
    // frontmatter-fields-a.md:60 fixes the invocation behaviour ("the default is
    // filled in before AJV validation") and :67 supplies this exact spelling as
    // the section's worked example, so the only row this dispatch may deliver is
    // the BND-1 success echo with the `(default)` tag
    // (defaulting-system-note-echo.md:9).
    expect(
      capture.notes,
      "frontmatter-fields-a.md:60/:67 admit `Enum.Variant` as a `params:` default and fix that it is filled and then validated; HEAD refuses the runtime's own filled value on its representation and renders the AJV-on-`args` row (determinism-cancellation-failure.md:52) instead of the echo",
    ).toEqual(["Running /s1: topic=hello, sev=high (default)"]);

    expect(
      capture.binder?.bound,
      "type-system.md:48 assigns the adjudication to the runtime AJV check, and `Sev.High` IS a `Sev` — the theta starts",
    ).toBe(true);
    expect(
      boundArgs(capture),
      "runtime-value-model.md:13 fixes the enum's JSON projection as the bare wire string, which is what the merged document carries",
    ).toEqual({ topic: "hello", sev: "high" });

    // THE END STATE (frontmatter-fields-a.md:71): the default reaches body scope
    // indistinguishable from a body-code `Sev.High`. Read off the `paramBindings`
    // the shipped `paramBindingsFrom` projected, not off a mirrored call.
    const sev = bindingOf(capture, "sev");
    expect(
      isEnumValue(sev),
      "frontmatter-fields-a.md:71 — an `Enum.Variant` default preserves the runtime enum brand at the body",
    ).toBe(true);
    expect(
      valuesEqual(sev, sevHighOf("s1")),
      "runtime-value-model.md:34 — the bound value compares equal to a locally constructed variant of the same enum",
    ).toBe(true);

    // HC3-c (determinism-cancellation-failure.md:35): the class carries no retry
    // budget, so the refusal this bug reports costs exactly one binder LLM call —
    // the cost paid before a failure decidable from the frontmatter alone.
    expect(capture.binderCalls, "exactly ONE binder model call, retry or none").toBe(1);
  });
});

// ===========================================================================
// (2) / (3) THE TWO ADMITTED OBJECT SPELLINGS — `/box/sev`.
// RED at HEAD: one enum-valued position anywhere in one default refuses the
// whole merged document; `Box`'s other field is a plain `string` that validates.
// ===========================================================================

describe("bug 0181 (2) — a named-enum field of a `Box { … }` default binds", () => {
  it("RED (2): the merge admits the branded object, echoes `box={high, …}`, and binds it BRANDED", async () => {
    const capture = await driveSlash("s4");

    expect(
      capture.notes,
      "frontmatter-fields-a.md:60 admits variant-schema construction (`Cat { ... }`) as a default form, and :67's worked block spells one; HEAD refuses the whole merged document for the ONE named-enum position inside it",
    ).toEqual([`Running /s4: topic=hello, box={high, ${ELLIPSIS}} (default)`]);

    expect(capture.binder?.bound, "the theta starts on a default its declared type admits").toBe(
      true,
    );
    expect(boundArgs(capture)).toEqual({ topic: "hello", box: { sev: "high", who: "w" } });

    const box = bindingOf(capture, "box");
    expect(
      schemaTagOf(box),
      "runtime-value-model.md:34 — a rebuilt object whose `$defs` entry names a declared schema is branded, so the default is indistinguishable from a constructor-built `Box`",
    ).toBe("Box");
    expect(
      Object.keys(box as object),
      "the projection installs the schema's declaration order (`sev` before `who`)",
    ).toEqual(["sev", "who"]);
    expect(
      isEnumValue(fieldOf(box, "sev")),
      "runtime-value-model.md:34 — the walk recurses through nested object fields, so the named-enum FIELD is tagged at its own depth",
    ).toBe(true);
    // 0337: this cell's own declaring file (sourcePathOf("s4")); the comparand must carry that same declaring key.
    expect(valuesEqual(fieldOf(box, "sev"), sevHighOf("s4"))).toBe(true);
  });
});

describe("bug 0181 (3) — the bare-object spelling of the same default binds identically", () => {
  it("RED (3): `Box = { sev: Sev.High, who: \"w\" }` produces the same merge, echo and bound value", async () => {
    const capture = await driveSlash("s5");

    // The two spellings differ only in the brand the literal carries, and a
    // `SCHEMA_TAG` brand is a non-enumerable symbol AJV's object walk never
    // sees — so a divergence between this cell and (2) would mean the gate reads
    // the brand, which it does not.
    expect(
      capture.notes,
      "frontmatter-fields-a.md:60 admits bare-key object literals ('the param's declared type supplies the schema') alongside variant-schema construction, so both spellings of one value behave alike",
    ).toEqual([`Running /s5: topic=hello, box={high, ${ELLIPSIS}} (default)`]);

    expect(capture.binder?.bound).toBe(true);
    expect(boundArgs(capture)).toEqual({ topic: "hello", box: { sev: "high", who: "w" } });

    const box = bindingOf(capture, "box");
    expect(
      schemaTagOf(box),
      "the declared type supplies the schema, so the bare-object spelling reaches the body branded exactly as the named spelling does",
    ).toBe("Box");
    expect(Object.keys(box as object)).toEqual(["sev", "who"]);
    // 0337: this cell's own declaring file (sourcePathOf("s5")); the comparand must carry that same declaring key.
    expect(valuesEqual(fieldOf(box, "sev"), sevHighOf("s5"))).toBe(true);
  });
});

// ===========================================================================
// (4) THE ARRAY ELEMENT — `/sevs/0`.
// ===========================================================================

describe("bug 0181 (4) — an `Enum.Variant` inside an array default binds", () => {
  it("RED (4): `array<Sev> = [Sev.High]` merges `[\"high\"]`, echoes `sevs=[high]`, and binds a TAGGED element", async () => {
    const capture = await driveSlash("s6");

    expect(
      capture.notes,
      "frontmatter-fields-a.md:60 admits array literals as defaults, and the element form it composes with is the same `Enum.Variant` access the same sentence admits",
    ).toEqual(["Running /s6: topic=hello, sevs=[high] (default)"]);

    expect(capture.binder?.bound).toBe(true);
    expect(boundArgs(capture)).toEqual({ topic: "hello", sevs: ["high"] });

    const first = elementOf(bindingOf(capture, "sevs"), 0);
    expect(
      isEnumValue(first),
      "runtime-value-model.md:34 — the walk recurses through arrays and tags at the element's own depth, never at the enclosing array",
    ).toBe(true);
    // 0337: this cell's own declaring file (sourcePathOf("s6")); the comparand must carry that same declaring key.
    expect(valuesEqual(first, sevHighOf("s6"))).toBe(true);
  });
});

// ===========================================================================
// (5) THE UNION ARM — the position that separates the two candidate routes.
// A value projected to its wire form at an `anyOf` position is re-tagged only
// because the inbound union-arm dispatch re-tests the arms through the
// runtime's own `SchemaValidator`. The premise assertions below fail loudly if
// that thread is ever dropped, so the cell can never degrade into a silent
// untagged bind.
// ===========================================================================

describe("bug 0181 (5) — an `Enum.Variant` default at a union-typed param binds TAGGED", () => {
  it("RED (5): `Sev | null = Sev.High` merges, echoes, and reaches the body as a tagged variant", async () => {
    const capture = await driveSlash("s3");

    expect(
      capture.notes,
      "a union arm is an ordinary `params:` type position; frontmatter-fields-a.md:60 admits the default form and fixes that it is filled and then validated, and HEAD refuses it with four AJV errors rather than two",
    ).toEqual(["Running /s3: topic=hello, sev=high (default)"]);

    expect(capture.binder?.bound).toBe(true);
    expect(boundArgs(capture)).toEqual({ topic: "hello", sev: "high" });
    expect(
      capture.lowered["properties"],
      "premise: the field really lowers to an `anyOf` position, so this cell is the union arm and not another `$ref`",
    ).toEqual({
      topic: { type: "string" },
      sev: { anyOf: [{ $ref: "#/$defs/Sev" }, { type: "null" }] },
    });

    const sev = bindingOf(capture, "sev");
    expect(
      isEnumValue(sev),
      "runtime-value-model.md:34 — at a position lowered to `{ \"anyOf\": [...] }` the walk translates the value under the first arm that admits it, reattaching the declaring-enum tag where that arm is a named `enum`",
    ).toBe(true);
    // 0337: this cell's own declaring file (sourcePathOf("s3")); the comparand must carry that same declaring key.
    expect(valuesEqual(sev, sevHighOf("s3"))).toBe(true);

    // PREMISE 1 (structural): the union-arm dispatch only runs when the boundary
    // is given a validator to re-test the arms through
    // (`src/runtime/inbound-boundary.ts`, `ParamsBindingInput.schemaValidator`),
    // and the shipped composition supplies it off the producer's own accessor
    // (`src/extension/production-theta-producer.ts:718`), consumed at
    // `src/extension/theta-composition-producer.ts:417`.
    expect(
      capture.schemaValidatorThreaded,
      "the dispatch must carry the runtime's `SchemaValidator`; without it a union-arm value keeps the documented pass-through and this cell would bind an UNTAGGED string while still reporting `bound: true`",
    ).toBe(true);

    // PREMISE 2 (behavioural): the same projection with the validator withheld
    // yields an untagged value. The three other inputs are the ones
    // `paramBindingsFrom` passes verbatim
    // (`src/extension/theta-composition-producer.ts:99`) — the merged `args`, the
    // theta's own `frontmatter.params.loweredSchema`, and the parsed body — so
    // the only difference between this call and the production one is the
    // withheld validator, and a `false` here is attributable to nothing else.
    const withoutValidator = bindParamsInbound({
      params: boundArgs(capture),
      lowered: capture.lowered,
      body: capture.body,
    });
    expect(
      isEnumValue(withoutValidator.get("sev") as ThetaValue),
      "the tag at a union arm is restorable ONLY through the arm re-test; if this ever reads `true` the cell above has stopped witnessing the thread and would pass on a value that is merely a string",
    ).toBe(false);
  });
});

// ===========================================================================
// (6)–(9) THE OVER-REACH FENCE. Green BEFORE and AFTER the fix. GOV-15
// (source-language-stability.md:5): no input that succeeds today may start
// failing, and observable (c) — `theta-system-note` content — is byte-identical
// across releases, so these echo rows are asserted verbatim.
// ===========================================================================

describe("bug 0181 (6) — CONTROL: the bare-wire-string default keeps binding, byte for byte", () => {
  it("GREEN (6): `Sev = \"high\"` binds, echoes unchanged, and still reaches the body tagged", async () => {
    const capture = await driveSlash("s2");

    expect(
      capture.notes,
      "GOV-15 observable (c) — this row is what an author gets today and must be byte-identical after the fix; it is also the text the enum-access spelling is required to produce",
    ).toEqual(["Running /s2: topic=hello, sev=high (default)"]);
    expect(capture.binder?.bound).toBe(true);
    expect(boundArgs(capture)).toEqual({ topic: "hello", sev: "high" });

    // The workaround's end state, unchanged: the wire string is re-tagged by the
    // inbound pass at the named-enum position, which is why the two spellings
    // must agree on the bound value as well as on the echo.
    // 0337: this control's own declaring file (sourcePathOf("s2")); the comparand must carry that same declaring key.
    expect(valuesEqual(bindingOf(capture, "sev"), sevHighOf("s2"))).toBe(true);
  });
});

describe("bug 0181 (7) — CONTROL: fill-if-absent never constructs the default", () => {
  it("GREEN (7): a binder-SUPPLIED value for a defaulted field survives, untagged by `(default)`", async () => {
    const capture = await driveSlash("s13");

    expect(
      capture.notes,
      "defaulting-system-note-echo.md:9 — the wire name is present in the binder-returned `args`, so the binder-supplied value is preserved unchanged, no default is applied, and the echo term is UNTAGGED",
    ).toEqual(["Running /s13: topic=hello, sev=low"]);
    expect(
      soleNote(capture).includes("(default)"),
      "only a field that took its declared default is tagged `(default)`",
    ).toBe(false);
    expect(capture.binder?.bound).toBe(true);
    expect(
      boundArgs(capture),
      "the declared `Sev.High` is never constructed on this path, so nothing this bug is about can reach the merge",
    ).toEqual({ topic: "hello", sev: "low" });
    // 0337: this control's own declaring file (sourcePathOf("s13")); the comparand must carry that same declaring key.
    expect(
      valuesEqual(bindingOf(capture, "sev"), makeEnumValue(enumDeclaringKey(sourcePathOf("s13"), "Sev"), "low")),
    ).toBe(true);
  });
});

describe("bug 0181 (8) — CONTROL: a schema brand alone is not a refusing carrier", () => {
  it("GREEN (8): `Plain = Plain { who: \"w\" }` binds, echoes, and carries its brand to the body", async () => {
    const capture = await driveSlash("s12");

    expect(
      capture.notes,
      "a `SCHEMA_TAG` brand is a non-enumerable symbol, invisible to `Object.entries`, so AJV's object walk never sees it — the boxed enum carrier is the sole value this gate refuses",
    ).toEqual([`Running /s12: topic=hello, plain={w, ${ELLIPSIS}} (default)`]);
    expect(capture.binder?.bound).toBe(true);
    expect(boundArgs(capture)).toEqual({ topic: "hello", plain: { who: "w" } });
    expect(schemaTagOf(bindingOf(capture, "plain"))).toBe("Plain");
  });
});

describe("bug 0181 (9) — CONTROL: the gate stays VALUE-aware, not only representation-aware", () => {
  it("GREEN (9): a wire string outside the variant set is still refused, on its value", async () => {
    const capture = await driveSlash("s11");

    // The fix collapses REPRESENTATIONS and must not collapse VALUES: `"nope"`
    // is already wire-form, so no projection changes it, and the lowered
    // fragment's `enum` keyword refuses it before and after.
    expect(
      capture.notes,
      "determinism-cancellation-failure.md:52 — a merged document the lowered `params:` schema genuinely refuses still renders the AJV-on-`args` row; a fix that admitted this would have collapsed the check itself",
    ).toEqual([
      ajvArgsNote("s11", "/sev must be equal to one of the allowed values"),
    ]);
    expect(
      soleNote(capture).includes(AJV_SUMMARY_SEPARATOR),
      "determinism-cancellation-failure.md:42 — one issue, so the single-issue form with no `; ` separator: the `type` clause the boxed carrier adds is absent here because the value IS a string",
    ).toBe(false);
    expect(
      capture.binder?.bound,
      "the theta does not start on a default its own declared type refuses",
    ).toBe(false);
    expect(capture.binder?.args, "a refused merge surfaces no bound args at all").toBeUndefined();
    expect(
      capture.paramBindings,
      "the dispatch short-circuits on the verdict, so the inbound boundary downstream of it is never reached",
    ).toBeUndefined();
  });
});

// ===========================================================================
// (10) DEFERRAL ROW c6, DRIVEN. `tests/params-default-type-compat.test.ts:452`
// (`["c6 (enum-access default)", "Sev = Sev.A"]`, against that file's
// `enum Sev { A, B }` at `:209`) asserts that this shape LOADS silently,
// licensed by type-system.md:48 — "the parse-time check is skipped and the
// runtime AJV check is the safety net". That row never invokes its fixture,
// which is why it has stayed green while the shape is unusable. Both halves are
// asserted here in one cell: the load gate stays silent AND the safety net
// admits the value it was handed to catch.
// ===========================================================================

describe("bug 0181 (10) — deferral row c6's exact shape loads silently AND then binds", () => {
  it("RED (10): `p: 'Sev = Sev.A'` against `enum Sev { A, B }` parses clean and merges `\"A\"`", async () => {
    // HALF (i) — the load gate. Green today and required to stay green: refusing
    // `Sev = Sev.A` at load would refuse a spelling frontmatter-fields-a.md:60
    // admits, and type-system.md:48 explicitly assigns the adjudication to the
    // runtime check. The fix is at the check, not at the deferral.
    const doc = parseCell("s14");
    expect(
      doc.diagnostics,
      "type-system.md:48 — the parse-time compatibility check is skipped for an unresolvable operand and the runtime AJV check is the safety net, so the load gate stays silent for this shape",
    ).toEqual([]);
    expect(
      doc.frontmatter?.params?.defaultedFields,
      "premise: the field really is defaulted, so the invocation half exercises the fill path",
    ).toEqual(["p"]);

    // HALF (ii) — the invocation. This is the check row c6 defers TO.
    const capture = await driveSlash("s14");
    expect(
      capture.notes,
      "the deferral chain terminates here: the load check defers this shape to invocation and the invocation check refuses it on representation, so the two individually defensible halves compose into a shape that cannot be used at all",
    ).toEqual(["Running /s14: topic=hello, p=A (default)"]);
    expect(capture.binder?.bound).toBe(true);
    expect(boundArgs(capture)).toEqual({ topic: "hello", p: "A" });
    expect(
      valuesEqual(bindingOf(capture, "p"), sevAOf("s14")),
      "a bare-variant enum's wire string is the variant name, and the bound value compares equal to a locally constructed `Sev.A` (0337: keyed to this cell's own declaring file)",
    ).toBe(true);
  });
});
