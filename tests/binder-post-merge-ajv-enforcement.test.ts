import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bug 0066 — `#mergeDeclaredDefaults` (src/extension/production-theta-producer.ts)
// compiles the lowered `params:` schema, calls `fillDefaultsAndRevalidate`
// (src/binder/defaulting.ts) and returns `result.args` alone: the
// post-default-merge AJV verdict has no reader, so the binder's AJV-on-`args`
// failure class is never constructed and hard-ceiling #4's slash-load `params`
// enforcement point runs no depth walk. A declared default that violates its
// own param type binds into body scope behind the `Running /<name>:` success
// echo, and a depth-6 `params` document binds unchecked
// (docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md).
//
// THIS FILE IS THE `runBinder` HALF of the witness: the three cells that need a
// production binder pass end to end (the note channel, the echo suppression and
// the routed `{ bound: false }`). The leaf-level depth-walk / classification
// cells live in tests/defaulting-post-merge-classification.test.ts and the
// load-time companion gate in tests/params-default-type-compat.test.ts.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:11 — the
//     **post-default-merge AJV validation** hook: "the `SchemaValidator.validate()`
//     call that AJV-validates the merged `args` object against the lowered
//     `params` schema after the runtime has filled the defaults above. Per
//     Schema Subset — Depth Enforcement the depth-walk runs *first* at this site
//     (it is enforcement point #4 in that section's per-boundary table), so a
//     depth-6 merged `args` payload short-circuits the AJV step and produces a
//     depth-walk failure that is classified into the AJV-on-`args` retry class".
//     :9 — fill-if-absent, keyed on the wire name in the binder-returned `args`.
//   - docs/spec_topics/binder/determinism-cancellation-failure.md:35 — the
//     AJV-on-`args` class ("A `kind: "ok"` envelope whose `args` fail AJV against
//     the lowered `params` schema after default-merge … Not retried"), including
//     the depth-walk fast-fail sub-case; :42 — the `<ajv-summary>` placeholder
//     (in-order `<path> <message>` join in canonical `validation_errors` order)
//     and its depth-walk clause ("single-issue form, no `; ` separator"); :52 —
//     the row `theta /<name>: argument binding produced invalid args —
//     <ajv-summary>`; :58 — AJV validation of `args` carries no retry budget.
//   - docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:11 (HC3-c, no retry),
//     :19 (the canonical breach message and `schema_keyword: "maxDepth"`), :26
//     (the `params` validation row's slash-load arm), :39 (CIO-1), :41 (CIO-3's
//     five sites and the depth-walk-before-AJV ordering), :52 (the
//     audience-coverage invariant).
//   - docs/spec_topics/schema-subset.md:44 (enforcement point #4), :47 ("The walk
//     runs **before** AJV at each site"), :49 (the canonical `maxDepth` issue),
//     :56 (the slash-load routing), :65 ("The walk is still installed at the
//     `params` boundary unchanged").
//   - docs/spec_topics/pi-integration-contract/runtime-event-channel.md:100
//     (PIC-1 (b): "implementations MUST NOT emit `masked: []`"), :110 (PIC-1 (c):
//     the *Slash-load `params` AJV (ceiling #3, load-time)* row's reachable mask
//     domain is **empty**, cross-ceiling sub-case included).
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix constraints 1–5):
//   1. The depth walk runs at the post-default-merge hook BEFORE the AJV call,
//      over the MERGED `args`.
//   2. The classification is `classifyBinderArgs` (src/binder/retry-taxonomy.ts)
//      over `{ depth, ajvIssues }`.
//   3. `#mergeDeclaredDefaults` returns the classification and `runBinder` routes
//      on it: on `kind: "ajv_args"`, `#emitBinderFailureNote(slashName, outcome)`
//      then `return { bound: false }` — BEFORE `#emitBinderEchoNote`. No retry
//      (HC3-c); the theta does not start.
//   4. A depth breach renders through the same `ajv_args` template with
//      `<ajv-summary>` carrying `<JSON-Pointer> JSON document depth exceeds 5`.
//   5. The hook runs whenever the theta presents a lowered `params:` schema, not
//      only when it declares defaults: `defaultedFields.length === 0` still needs
//      the depth walk over the binder's own `args`, and a theta whose defaults
//      could not be RECOVERED must not silently skip validation of what did
//      arrive (the second early return, on `defaults.length === 0`).
//
// MEASURED SIGNATURES AT HEAD (offline, deterministic, provider-free;
// re-derived by probe before this file was added, then deleted per probe
// policy). Every fixture below parses with ZERO diagnostics:
//   ENUM_DEFAULT lowers
//     {"type":"object","properties":{"topic":{"type":"string"},
//      "pick":{"type":"string","enum":["x","y"]}},"required":["topic"],
//      "additionalProperties":false}
//     with defaultedFields ["pick"] and defaultSource "\"zzz\"" — and the real
//     AJV verdict for the merged {topic:"hello",pick:"zzz"} is
//     {"ok":false,"errors":[{"instancePath":"/pick",…,"keyword":"enum",
//      "message":"must be equal to one of the allowed values"}]}.
//     `runBinder` nevertheless returns {"bound":true,
//      "args":{"topic":"hello","pick":"zzz"}} and emits the SUCCESS echo
//     "Running /b66pick: topic=hello, pick=zzz (default)".
//   DEEP_DEFAULTED / DEEP_NO_DEFAULT with the depth-6 args
//     {p:{a:{b:{c:{d:{e:"x"}}}}}} return {"bound":true, …} and emit
//     "Running /b66deep: p={{{{{x, …}, …}, …}, …}, …}, q=d (default)" and
//     "Running /b66bare: p={{{{{x, …}, …}, …}, …}, …}" respectively.
//   DEEP_UNRECOVERABLE_DEFAULT parses with `defaultedFields` ["q"] and `q`'s
//     `defaultSource` the EMPTY string, and `parseExpressionSource("")` returns
//     `null` — so `#recoverDeclaredDefaults` skips the field and the recovered
//     list is empty. On the recovery-skip path the same depth-6 args return
//     {"bound":true, …} and emit
//     "Running /b66unrec: p={{{{{x, …}, …}, …}, …}, …}, q=null (default)" —
//     the success echo asserting a bind of a document ceiling #4 refuses, with
//     the `(default)` tag on a value no default supplied.
//
// WHAT IS RED HERE AND WHY: the four defect cells (1, 3, 4, 5) — each asserts
// the AJV-on-`args` note on the `theta-system-note` channel, which HEAD never
// emits from the binder path (`rg -n 'kind: "ajv_args"' src/` reaches no
// production caller). Cells 4 and 5 are the two skip arms of constraint 5, one
// per early return: no defaults declared, and defaults declared but not
// recovered. GREEN BY DESIGN and required to stay green: the two over-fire
// controls — a declared default its own fragment ADMITS still binds and echoes,
// and an exactly-at-limit depth-5 `params` document still binds and echoes.
//
// TIER: unit, offline, deterministic, provider-free. The whole contract settles
// inside one `ProductionThetaProducer.runBinder()` call with the off-session
// pi-ai `complete()` mocked (the e2e-s5 / bug-0011 pattern): the subject is
// which system note the production producer delivers and what it returns, both
// fully determined by the scripted envelope. An integration tier would re-drive
// discovery to reach the same seam and witness nothing further; the live tier
// adds a real binder model, which the single live cell in
// tests/live/live-production-acceptance.test.ts covers for reproduction (A).
//
// NO SILENT SKIPPING: the fixture fs backing `#recoverDeclaredDefaults` REJECTS
// an unregistered path (never a silent empty read), `parse` asserts a clean
// parse before a fixture is driven, and every note reader throws naming the
// captured channel when the note it needs is absent. A missing fixture, a
// refused parse or an empty note list can never read as a pass.

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
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import {
  parseExpressionSource,
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import { DEPTH_VIOLATION_MESSAGE, jsonDepth, MAX_JSON_DEPTH } from "../src/runtime/depth-walk";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

/** The rule-3 prefix/suffix separator of `renderFailureNote` (U+2014 EM DASH). */
const EM_DASH = "\u2014";

/** The two-character `<ajv-summary>` inter-issue separator (`renderAjvSummary`). */
const AJV_SUMMARY_SEPARATOR = "; ";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
const AJV_ARGS_PHRASE = "argument binding produced invalid args";

/** The AJV-on-`args` note for one theta and one rendered `<ajv-summary>`. */
function ajvArgsNote(thetaName: string, ajvSummary: string): string {
  return `theta /${thetaName}: ${AJV_ARGS_PHRASE} ${EM_DASH} ${ajvSummary}`;
}

/**
 * A captured `pi.sendMessage` custom message. `details` is read as well as
 * `content` because PIC-1 (c) is a claim about `details.event`
 * (runtime-event-channel.md:110), not about the rendered line.
 */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: { readonly event?: Record<string, unknown> };
}

// ===========================================================================
// Fixtures.
// ===========================================================================

/**
 * THE MISTYPED-DEFAULT SHAPE (bug doc §Reproduction (A), retargeted).
 *
 * The bug doc's own reproduction spells the defect `count_b: integer = "xyzzy"`,
 * which the load-time companion gate (§Fix constraint 8, witnessed in
 * tests/params-default-type-compat.test.ts) refuses in the SAME commit — so a
 * primitive-typed mistyped default no longer reaches the runtime at all. The
 * runtime witness therefore needs a declared type the compat relation DEFERS on
 * (its resolution answers `"unknown"`, leaving the invocation-time AJV check as
 * the only judge) whose lowered fragment AJV nevertheless refuses at the merge:
 * an all-string-literal union lowers `{"type":"string","enum":["x","y"]}`
 * (schema-subset.md:80) and refuses `"zzz"`.
 *
 * `topic` is required and `pick` is defaulted, so `pick` is omitted from the
 * lowered `required` (src/parser/params.ts, the per-field `required.push`
 * guarded on `defaultSource === undefined`) — which is why the envelope's
 * relaxed `args` copy (`relaxParamsSchema`, src/binder/binder-envelope.ts) and
 * the extraction-time envelope AJV both accept an `ok` arm that omits it, and
 * why the post-merge hook is the only place the filled value is ever checked.
 */
const ENUM_DEFAULT_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  `  pick: '"x" | "y" = "zzz"'`,
  "---",
  "@`t=${topic} p=${pick}`",
  "",
].join("\n");

/** The over-fire control: the SAME shape whose default its own fragment ADMITS. */
const ENUM_DEFAULT_OK_THETA = ENUM_DEFAULT_THETA.replace(`= "zzz"`, `= "x"`);

/**
 * The five-deep named-schema chain: the shape whose lowered fragment ADMITS a
 * depth-6 `params` document, so the depth breach reaches the post-default-merge
 * hook instead of being stopped by the envelope AJV at extraction. Each link is
 * a body `schema` declaration, resolved whole-file from the `params:` RHS.
 */
const DEEP_CHAIN_BODY = [
  "schema L1 { a: L2 }",
  "schema L2 { b: L3 }",
  "schema L3 { c: L4 }",
  "schema L4 { d: L5 }",
  "schema L5 { e: string }",
].join("\n");

/** The depth chain WITH a declared default — the hook's currently-reachable arm. */
const DEEP_DEFAULTED_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  p: L1",
  '  q: string = "d"',
  "---",
  DEEP_CHAIN_BODY,
  "@`q=${q}`",
  "",
].join("\n");

/**
 * The depth chain with NO declared default (§Fix constraint 5): at HEAD
 * `#mergeDeclaredDefaults` returns on `params.defaultedFields.length === 0`
 * before compiling a validator, so the named hook is not invoked at all — yet
 * enforcement point #4 is about the `params` boundary, not about defaults. One
 * non-string field keeps this off `classifyBinderBypass`'s single-string bypass,
 * so it is a genuine binder pass.
 */
const DEEP_NO_DEFAULT_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  p: L1",
  "---",
  DEEP_CHAIN_BODY,
  "@`p bound`",
  "",
].join("\n");

/**
 * The depth chain whose declared default RECOVERY CANNOT PARSE (§Fix constraint
 * 5's second clause): bug 0165's shape `string = ` records `hasDefault: true`
 * with an EMPTY `defaultSource`, so `#recoverDeclaredDefaults` splits the `=`,
 * hands `""` to `parseExpressionSource`, gets `null` and skips the field —
 * yielding no recovered default at all. At HEAD `#mergeDeclaredDefaults` returns
 * on `defaults.length === 0` before compiling a validator, so a filesystem-level
 * recovery failure silently excuses the whole `params` boundary for what DID
 * arrive. `p: L1` is the field the depth-6 document arrives under, so the
 * boundary has something to judge.
 */
const DEEP_UNRECOVERABLE_DEFAULT_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  p: L1",
  "  q: 'string = '",
  "---",
  DEEP_CHAIN_BODY,
  "@`q=${q}`",
  "",
].join("\n");

/**
 * The exactly-at-limit control: a THREE-deep chain whose minimal document sits
 * at `jsonDepth` 5 (asserted below off the shipped `jsonDepth`, not asserted by
 * hand), so the walk must not fire for it. A deeper document is unconstructible
 * against this chain — every leaf is `string` under
 * `additionalProperties: false` — which is what makes it a pure over-fire fence.
 */
const AT_LIMIT_CHAIN_BODY = [
  "schema M1 { a: M2 }",
  "schema M2 { b: M3 }",
  "schema M3 { c: string }",
].join("\n");

const AT_LIMIT_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  p: M1",
  "---",
  AT_LIMIT_CHAIN_BODY,
  "@`p bound`",
  "",
].join("\n");

const ENUM_DEFAULT_PATH = "/theta/b66pick.theta";
const ENUM_DEFAULT_OK_PATH = "/theta/b66pickok.theta";
const DEEP_DEFAULTED_PATH = "/theta/b66deep.theta";
const DEEP_NO_DEFAULT_PATH = "/theta/b66bare.theta";
const DEEP_UNRECOVERABLE_DEFAULT_PATH = "/theta/b66unrec.theta";
const AT_LIMIT_PATH = "/theta/b66lim.theta";

/**
 * The fixture sources by their composition-input `sourcePath`, backing the root
 * double's in-memory `fileSystem.readBytes` so `#recoverDeclaredDefaults`
 * resolves the same bytes the parser saw. An unregistered path REJECTS loudly —
 * a silent empty read would make a defaults-recovery failure look like a clean
 * merge, which is one of the two skip paths this bug reports.
 */
const FIXTURE_SOURCES: ReadonlyMap<string, string> = new Map([
  [ENUM_DEFAULT_PATH, ENUM_DEFAULT_THETA],
  [ENUM_DEFAULT_OK_PATH, ENUM_DEFAULT_OK_THETA],
  [DEEP_DEFAULTED_PATH, DEEP_DEFAULTED_THETA],
  [DEEP_NO_DEFAULT_PATH, DEEP_NO_DEFAULT_THETA],
  [DEEP_UNRECOVERABLE_DEFAULT_PATH, DEEP_UNRECOVERABLE_DEFAULT_THETA],
  [AT_LIMIT_PATH, AT_LIMIT_THETA],
]);

/** The depth-6 merged-args document and its breach pointer. */
const DEPTH_6_ARGS = { p: { a: { b: { c: { d: { e: "x" } } } } } } as const;
const DEPTH_6_BREACH_POINTER = "/p/a/b/c/d";

/** The exactly-at-limit document for the three-deep chain. */
const AT_LIMIT_ARGS = { p: { a: { b: { c: "x" } } } } as const;

// ===========================================================================
// Harness (the bug-0011 / e2e-s5 production-producer pattern).
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

/** Parse `.theta` source through the production whole-file parser. */
function parse(src: string) {
  const source: ThetaSource = {
    path: "b66.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  expect(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    "the fixture must parse cleanly before it is driven — a refused parse would make every note assertion below unreachable",
  ).toEqual([]);
  expect(doc.frontmatter, "the fixture must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/**
 * The production AJV validator, wired with the same JSON.stringify
 * content-addressing the shipped composition root uses, so the envelope AJV at
 * the routing step and the post-merge hook validate exactly as production.
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

/** A production producer wired with a capturing `pi.sendMessage`. */
function producerWithCapture(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
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
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

/** Build the composition input for a parsed fixture theta. */
function thetaInput(
  source: string,
  sourcePath: string,
  slashName: string,
): ThetaCompositionInput {
  const doc = parse(source);
  return {
    slashName,
    sourcePath,
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

/** The `theta-system-note` channel entries, in delivery order. */
function noteChannelEntries(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

/** Every channel note's rendered content — the readable form of a red. */
function noteContents(notes: readonly CapturedNote[]): string[] {
  return noteChannelEntries(notes).map((n) => n.content);
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

/** Drive one binder pass over a fixture theta. */
async function driveBinder(
  deps: ReturnType<typeof createProductionProducerDeps>,
  theta: ThetaCompositionInput,
  slashArguments: string,
): Promise<{ readonly bound: boolean; readonly args?: Readonly<Record<string, unknown>> }> {
  return deps.runBinder({ theta, args: slashArguments, ctx: ctxDouble() });
}

beforeEach(() => {
  scripted.replyFor = undefined;
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// (1) THE AJV-ON-`args` FAILURE CLASS IS REACHABLE FROM THE BINDER.
// RED at HEAD: the verdict is computed and dropped, so the success echo is
// emitted, the theta runs, and `"zzz"` binds to an `"x" | "y"`-declared param.
// ===========================================================================

describe("bug 0066 (1) — a recovered default its own lowered fragment refuses does not bind", () => {
  it("RED (1): the AJV-on-`args` note is emitted, the `Running /…` echo is not, and the bind fails", async () => {
    // The binder returns the envelope shape §Reproduction (A) recorded for this
    // params shape: the defaulted field OMITTED, exactly as the system prompt's
    // last line instructs ("Do not invent values for defaulted parameters that
    // the user did not specify; omit them", src/binder/binder-system-prompt.ts).
    scriptToolCallEnvelope({ kind: "ok", args: { topic: "hello" } });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(
      deps,
      thetaInput(ENUM_DEFAULT_THETA, ENUM_DEFAULT_PATH, "b66pick"),
      "hello",
    );

    // THE PRIMARY ASSERTION, first so the red names the symptom the bug reports
    // rather than a downstream shape: the failure row exists on the channel.
    // `<ajv-summary>` is the in-order `<path> <message>` join of the merged-args
    // verdict's issues (determinism-cancellation-failure.md:42) — one issue
    // here, AJV's own `enum` message for the lowered fragment.
    const expectedNote = ajvArgsNote(
      "b66pick",
      "/pick must be equal to one of the allowed values",
    );
    expect(
      noteContents(notes),
      "determinism-cancellation-failure.md:52 gives exactly one note for this input and defaulting-system-note-echo.md:11 installs the hook that produces it; HEAD emits the SUCCESS echo instead, so a passing and a failing merged-args validation are indistinguishable",
    ).toEqual([expectedNote]);

    // The echo's SUPPRESSION is the other half of §Fix constraint 3 ("the
    // `bind_echo` note moves after the verdict"): the success echo asserting the
    // bind worked is what makes the corruption invisible to an operator.
    // tests/e2e-s5-binder-echo-emission.test.ts pins the echo's EMISSION on a
    // clean merge; this pins its absence on a refused one.
    expect(
      noteContents(notes).filter((c) => c.startsWith("Running /b66pick")),
      "the `Running /<name>:` success echo must not be emitted for a merge the post-default-merge validation refused",
    ).toEqual([]);

    // The routed disposition: the theta does not start.
    expect(
      result.bound,
      "§Fix constraint 3 — the AJV-on-`args` arm returns `{ bound: false }`, so the body never runs on a value the declared type says is impossible",
    ).toBe(false);
    expect(
      result.args,
      "a refused merge surfaces no bound args at all — the failure arm returns `{ bound: false }` alone",
    ).toBeUndefined();

    // HC3-c (ceilings-3-and-4.md:11) / determinism-cancellation-failure.md:58 —
    // the class is terminal and carries no retry budget of its own.
    expect(
      scripted.calls,
      "the AJV-on-`args` class is not retried (HC3-c), so exactly ONE binder LLM call was issued",
    ).toHaveLength(1);

    // The note's delivery shape, matching every other binder failure row.
    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes[0]?.display, "the failure note is display:true").toBe(true);
  });

  it("GREEN (1-control): a recovered default the same fragment ADMITS still binds and echoes", async () => {
    // The over-fire fence for cell 1: the identical params shape with `= "x"`
    // instead of `= "zzz"`. Without it, cell 1's red could be explained by "this
    // fixture never binds in this harness" rather than by the refused merge.
    scriptToolCallEnvelope({ kind: "ok", args: { topic: "hello" } });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(
      deps,
      thetaInput(ENUM_DEFAULT_OK_THETA, ENUM_DEFAULT_OK_PATH, "b66pickok"),
      "hello",
    );

    expect(
      result.bound,
      "a merged-args document the lowered `params:` schema admits binds — the hook must refuse only what AJV refuses",
    ).toBe(true);
    expect(result.args).toEqual({ topic: "hello", pick: "x" });
    expect(
      noteContents(notes),
      "the BND-1 success echo is the only note on a clean merge, with the `(default)` tag firing exactly when it should (defaulting-system-note-echo.md:9)",
    ).toEqual(["Running /b66pickok: topic=hello, pick=x (default)"]);
  });
});

// ===========================================================================
// (3) HARD-CEILING #4's SLASH-LOAD `params` ENFORCEMENT POINT.
// RED at HEAD: `rg -n "depthWalk\(" src/binder/` returns nothing and
// `fillDefaultsAndRevalidate` goes straight to `validator.validate(merged)`, so
// a depth-6 merged `args` document validates clean and binds.
// ===========================================================================

describe("bug 0066 (3) — a depth-6 `params` document is refused at the post-default-merge hook", () => {
  it("RED (3): the depth-walk summary renders through the AJV-on-`args` row and `masked` is absent from `details.event`", async () => {
    // The fixture's own counting oracle, read off the shipped walk rather than
    // written by hand (`jsonDepth`, src/runtime/depth-walk.ts: scalar/empty → 1,
    // non-empty → 1 + max child), so the fixture cannot drift out of breach
    // without this line reddening first.
    expect(
      jsonDepth(DEPTH_6_ARGS),
      "the breach fixture must exceed the cap; schema-subset.md:47 fast-fails the first node whose depth would exceed 5",
    ).toBeGreaterThan(MAX_JSON_DEPTH);

    scriptToolCallEnvelope({ kind: "ok", args: DEPTH_6_ARGS });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(
      deps,
      thetaInput(DEEP_DEFAULTED_THETA, DEEP_DEFAULTED_PATH, "b66deep"),
      "go",
    );

    // THE PRIMARY ASSERTION. §Fix constraint 4 / ceilings-3-and-4.md:26: the
    // breach renders through the SAME `ajv_args` template with `<ajv-summary>`
    // carrying the depth-walk's canonical issue.
    const expectedSummary = `${DEPTH_6_BREACH_POINTER} ${DEPTH_VIOLATION_MESSAGE}`;
    const expectedNote = ajvArgsNote("b66deep", expectedSummary);
    expect(
      noteContents(notes),
      "schema-subset.md:44 names `params` validation as enforcement point #4 and :65 pins the walk as installed there unchanged; HEAD runs no walk on the binder path at all, so a depth-6 document binds and the body runs on it",
    ).toEqual([expectedNote]);

    // The single-issue form (determinism-cancellation-failure.md:42's depth-walk
    // clause): AJV did not run, so its `errors` array is empty and the summary
    // is synthesised from the one depth-walk issue — never an `errorsText`
    // traversal producing a `; `-joined list.
    expect(
      noteChannelEntries(notes)[0]?.content.includes(AJV_SUMMARY_SEPARATOR),
      "the depth-walk fast-fail renders the single-issue form with NO `; ` separator",
    ).toBe(false);

    // PIC-1 (c) (runtime-event-channel.md:110): this site's reachable mask
    // domain is EMPTY — the originating ceiling is recoverable from the rendered
    // `<ajv-summary>`, so `masked` is omitted rather than populated. PIC-1 (b)
    // (:100) additionally forbids `masked: []`, so the assertion is absence of
    // the key, not an empty array.
    const event = noteChannelEntries(notes)[0]?.details?.event;
    expect(
      event,
      "the note must carry a `details.event` object for the mask claim to be judged",
    ).toBeDefined();
    expect(
      event !== undefined && "masked" in event,
      "PIC-1 (c) pins this site's reachable mask domain empty, cross-ceiling sub-case included; `crossRouteSlashLoadParams`'s constant `satisfied: [\"ceiling#3\", \"ceiling#4\"]` produced `masked: [\"ceiling#4\"]` on every call and is the shape that must not ship",
    ).toBe(false);

    expect(
      result.bound,
      "the depth breach cross-routes into ceiling #3's no-retry classification (CIO-1), which short-circuits the theta",
    ).toBe(false);
    expect(
      noteContents(notes).filter((c) => c.startsWith("Running /b66deep")),
      "no success echo for a merged-args document the depth walk refused",
    ).toEqual([]);
  });

  it("GREEN (3-control): an exactly-at-limit `params` document still binds and echoes", async () => {
    // The over-fire fence: `jsonDepth` 5 is INSIDE the cap (`depth ≤ 5`), and a
    // deeper document is unconstructible against this three-deep chain, so this
    // cell isolates the walk's boundary rather than its existence.
    expect(
      jsonDepth(AT_LIMIT_ARGS),
      "the control fixture must sit exactly AT the cap for the boundary to be the subject",
    ).toBe(MAX_JSON_DEPTH);

    scriptToolCallEnvelope({ kind: "ok", args: AT_LIMIT_ARGS });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(
      deps,
      thetaInput(AT_LIMIT_THETA, AT_LIMIT_PATH, "b66lim"),
      "go",
    );

    expect(
      result.bound,
      "schema-subset.md's cap is `depth ≤ 5`, so a document AT the cap is admitted; a walk that refused it would be an over-fire",
    ).toBe(true);
    expect(result.args).toEqual(AT_LIMIT_ARGS);
    expect(
      noteContents(notes).filter((c) => c.includes(AJV_ARGS_PHRASE)),
      "no AJV-on-`args` note for a document inside the cap",
    ).toEqual([]);
  });
});

// ===========================================================================
// (4) THE HOOK RUNS WHEN THE THETA DECLARES NO DEFAULTS (§Fix constraint 5).
// RED at HEAD: `#mergeDeclaredDefaults` returns `binderArgs` unchanged when
// `params.defaultedFields.length === 0`, before it compiles a validator, so the
// named hook is not invoked at all on this path.
// ===========================================================================

describe("bug 0066 (4) — enforcement point #4 is about the `params` boundary, not about defaults", () => {
  it("RED (4): a no-defaults theta's own depth-6 `args` are refused at the same hook", async () => {
    scriptToolCallEnvelope({ kind: "ok", args: DEPTH_6_ARGS });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(
      deps,
      thetaInput(DEEP_NO_DEFAULT_THETA, DEEP_NO_DEFAULT_PATH, "b66bare"),
      "go",
    );

    const expectedNote = ajvArgsNote(
      "b66bare",
      `${DEPTH_6_BREACH_POINTER} ${DEPTH_VIOLATION_MESSAGE}`,
    );
    expect(
      noteContents(notes),
      "§Fix constraint 5 — the hook runs whenever the theta presents a lowered `params:` schema; a theta declaring no defaults still needs the depth walk over the binder's own `args`, and its absence is why the AJV half is conditional on the theta declaring at least one default",
    ).toEqual([expectedNote]);
    expect(
      result.bound,
      "the theta does not start on a depth-breaching `params` document, defaults or no defaults",
    ).toBe(false);
    expect(
      noteContents(notes).filter((c) => c.startsWith("Running /b66bare")),
      "no success echo on the no-defaults path either",
    ).toEqual([]);
  });
});

// ===========================================================================
// (5) THE HOOK RUNS WHEN DEFAULTS ARE DECLARED BUT RECOVERY YIELDS NOTHING
// (§Fix constraint 5's SECOND clause). RED at HEAD: `#mergeDeclaredDefaults`
// returns `binderArgs` unchanged on `defaults.length === 0`, so a recovery
// failure — an in-memory theta, an unreadable file, a default that does not
// re-parse — excuses the `params` boundary for the args that DID arrive, which
// makes the whole invoked-but-ignored validation conditional on a filesystem
// read succeeding.
// ===========================================================================

describe("bug 0066 (5) — a default recovery could not parse does not excuse the boundary", () => {
  it("RED (5): a theta whose only default is unrecoverable still has its depth-6 `args` refused", async () => {
    // The arm is only the subject if recovery genuinely yields nothing, so both
    // halves of that premise are asserted off the parsed fixture and the shipped
    // recovery predicate rather than assumed: the theta DOES declare a default
    // (otherwise this is cell 4 again), and the recorded default fails the exact
    // predicate `#recoverDeclaredDefaults` applies (`parseExpressionSource(...)
    // === null` ⇒ the field is skipped ⇒ no recovered default).
    const parsed = parse(DEEP_UNRECOVERABLE_DEFAULT_THETA);
    const params = parsed.frontmatter?.params;
    expect(
      params?.defaultedFields,
      "the fixture must declare a default, or the cell would witness the no-defaults arm cell 4 already owns",
    ).toEqual(["q"]);
    const recorded = params?.fields.find((f) => f.wireName === "q")?.defaultSource;
    expect(
      recorded,
      "bug 0165's shape records `hasDefault: true` with an EMPTY `defaultSource`",
    ).toBe("");
    expect(
      parseExpressionSource(recorded ?? "unparsed"),
      "`#recoverDeclaredDefaults` skips a field whose `defaultSource` does not parse as a single expression, so a `null` here is what makes the recovered-defaults list empty and reaches the arm under test",
    ).toBeNull();

    scriptToolCallEnvelope({ kind: "ok", args: DEPTH_6_ARGS });
    const { deps, notes } = producerWithCapture();

    const result = await driveBinder(
      deps,
      thetaInput(
        DEEP_UNRECOVERABLE_DEFAULT_THETA,
        DEEP_UNRECOVERABLE_DEFAULT_PATH,
        "b66unrec",
      ),
      "go",
    );

    const expectedNote = ajvArgsNote(
      "b66unrec",
      `${DEPTH_6_BREACH_POINTER} ${DEPTH_VIOLATION_MESSAGE}`,
    );
    expect(
      noteContents(notes),
      "§Fix constraint 5 — \"a theta whose defaults cannot be recovered must not silently skip validation of what did arrive\"; the early return on an empty recovered-defaults list is what makes the boundary conditional on a filesystem read succeeding",
    ).toEqual([expectedNote]);
    expect(
      result.bound,
      "the depth breach is terminal on this path too — an unrecoverable default leaves its field unfilled, it does not license binding a document the ceiling refuses",
    ).toBe(false);
    expect(
      noteContents(notes).filter((c) => c.startsWith("Running /b66unrec")),
      "no success echo when the hook refused the merge, recovered defaults or none",
    ).toEqual([]);
  });
});
