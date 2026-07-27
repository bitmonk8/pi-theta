// Bug 0010 — INCREMENT D: the OFF-SESSION SIBLING (`subagent fn` in-process
// path, `OffSessionQueryModel`) joins the typed two-phase mechanism
// (regression pins — these cells red before the increment-D fix and now pin
// the fixed behaviour).
//
// docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md
// (OffSessionQueryModel paragraphs): with Increments A+B+C in the tree the
// LIVE prompt path ran typed queries two-phase (free phase on-session, forced
// respond off-session through pi-ai `complete()` with tools + forced
// toolChoice, repair restarts, provider gate), but the PRE-FIX off-session
// driver for every `@`-query in a `subagent fn` body was still the fused
// single-shot text-parse: `offSessionComplete` called `complete(model, {
// messages: [user prompt] })` with NO tools, NO toolChoice, NO signal/auth
// options, and the typed query's free phase did not exist at all (QRY-14's
// "available to the model during query-time tool loops" guarantee was dead
// for `subagent fn` typed queries). The increment-D contract this suite pins:
//
//   - FREE PHASE (typed AND untyped): a REAL tool loop through `complete()`
//     over a HELD conversation. Round 0 pushes the rendered prompt as the
//     opening user message; each round dispatches
//     `complete(model, { messages: heldConversation, tools }, { signal,
//     ...auth })` — NO toolChoice on free-phase calls. `tools` = the theta's
//     callable-set pi-tool entries (duck-read off each entry's
//     `toolDefinition`) PLUS the respond tool entry on typed queries (name
//     `__theta_respond_<slug>`, the fixed live-path description literal,
//     parameters = the lowered response schema). The assistant reply joins the
//     held conversation; a reply with ToolCall parts maps to the seam's
//     `{kind:"tool_use", batch}` and `runToolBatch` services EVERY held call:
//     a respond-tool call depth-walks + AJV-validates — valid captures
//     one-shot and the free phase TERMINATES (the next `nextFreePhaseTurn`
//     returns `{kind:"text"}` with NO further `complete()`); invalid feeds
//     back an `isError` tool-result (QRY-13). Any other name lowers through
//     `lowerModelDrivenToolCall(call, dispatch, signal)` — a name outside the
//     callable set feeds back the unavailable-tool `isError` result — and the
//     ToolResultMessages join the held conversation. A plain-text reply is
//     `{kind:"text"}`. Transport/overflow classification per bug 0007
//     (`classifyOffSessionReply`) is unchanged.
//   - FORCED RESPOND: gate short-circuit first (an unsupported resolved
//     respond-model api refuses with the gate TransportError and ZERO
//     completes); an early capture resolves the payload without dispatch; else
//     `complete(model, { messages: heldConversation + trailing QRY-15
//     template user message, tools: [respondTool] }, { toolChoice: <per-api
//     shape>, signal, ...auth })`. When NO free-phase call was ever issued
//     (`max_rounds: 0`) the single user message = the rendered prompt
//     right-trimmed of trailing newlines + one U+000A + the QRY-15 template
//     body. Extraction / ERR-17 / transport are identical to the live path.
//   - REPAIR (QRY-14 ¶3): a two-phase RESTART — the QRY-12 follow-up template
//     is APPENDED to the held conversation as a user message, the free-phase
//     tool loop re-runs with a FRESH budget, then a fresh forced respond
//     dispatch (held conversation + QRY-15 trailing). Forced-respond
//     exchanges do NOT join the held conversation (mirroring the live path,
//     where respond traffic never touches the session). `max_rounds: 0`
//     repair: the single user message is the QRY-12 follow-up text ALONE.
//   - AUTH/SIGNAL: every off-session `complete()` (free phase, respond,
//     untyped) carries `options.signal` and, when the producer's
//     ModelRegistry exposes `getApiKeyAndHeaders` AND it resolves ok,
//     `apiKey`/`headers`. A registry double LACKING the method must not crash
//     (the frozen bug-0007 suite constructs `modelRegistry: {}`).
//   - RESPOND MODEL: the theta-resolved frontmatter `model:` ?? `ctx.model`
//     (the `subagent fn`'s effectiveCtx already carries the FN-7 `with{model}`
//     override); the FREE PHASE keeps dispatching against `ctx.model`.
//
// Spec: functions.md (FN-6 isolation / FN-7 config inheritance / FN-8
// prompt→subagent), query/query-tool-loop.md (QRY-13 tool servicing, QRY-14
// two-phase + `max_rounds: 0` boundary, QRY-15 template bytes, QRY-16/CIO-4),
// query/query-failure-and-repair.md (QRY-11 respond-repair, QRY-12 template
// bytes), pi-integration-contract/conversation-drive.md (typed-query bullet,
// PIC-50/PIC-51 classification, §Provider compatibility for typed queries),
// pi-integration-contract/subagent.md (the forced respond turn runs
// off-session on the in-process path too), errors-and-results/
// queryerror-variants.md (ERR-17 non-compliance, §provider derivation).
//
// Method: the tests/off-session-transport-classification.test.ts harness
// (subagent-fn fixture thetas driving `@`-queries through the PRODUCTION
// producer + `expectErrQueryError` digging through the FN-6 invoke_callee
// wrapper) with the tests/typed-two-phase-live.test.ts mock upgrade: the
// mocked `complete()` RECORDS every call's full `(model, context, options)`
// triple and the reply queue holds FACTORIES invoked with the recorded call,
// sticky-last + throw-on-unscripted (the bug-0007 discipline). Every cell
// asserts the `complete()` CALL COUNT — the off-session drive's only counter
// (it touches no session surface) — plus the per-call tools / toolChoice /
// message pins. Deterministic; no live network.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recorded off-session `complete()` calls and the scripted reply queue.
// `vi.hoisted` so the `vi.mock` factory (hoisted above the imports) can close
// over a mutable holder each cell sets. Each queue entry is a FACTORY invoked
// with the recorded call triple, so a cell can build its reply from what the
// production code actually passed.
const scripted = vi.hoisted(() => ({
  queue: [] as Array<
    (call: { model: unknown; context: unknown; options: unknown }) => unknown
  >,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
        // No silent skipping: a dispatch against an unscripted cell fails
        // loudly (cells that pin ZERO complete() calls leave the queue empty).
        throw new Error(
          `scripted complete() called with an EMPTY reply queue (call #${index + 1})`,
        );
      }
      // Sticky-last consumption (the bug-0007 suite discipline): a drive that
      // issues MORE calls than the cell scripted keeps observing the terminal
      // reply, so over-driving stays observable as a CALL-COUNT assertion
      // instead of a mid-flight harness throw.
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { isResultValue, type ThetaValue } from "../src/runtime/value";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { renderFollowUpTurn } from "../src/runtime/query-followup-render";
import type { ValidationIssue } from "../src/runtime/query-error";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";

// --- The bug-0014 parse rejection (re-pins the F5 residual's entry) -----------

/** The registered code that rejects the empty `@<…>` annotation at parse. */
const EMPTY_ANNOTATION_CODE = "theta/parse/empty-query-annotation";

/**
 * The rejection's normative Message (DIAG-4), sourced from the parse registry
 * page — never copied prose — so this suite stays in lockstep with
 * tests/empty-query-annotation.test.ts and the registry row itself.
 */
const EMPTY_ANNOTATION_MESSAGE = registryMessage(
  parseRegistry(
    readFileSync(
      fileURLToPath(
        new URL(
          "../docs/spec_topics/diagnostics/code-registry-parse.md",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
  ),
  EMPTY_ANNOTATION_CODE,
) as string | undefined;

// --- The resolved models ------------------------------------------------------
// DISTINCT `.api` and `.provider` strings (the bug-0007/0009 fixture
// discipline) so a provider assertion catches a wrong-field read.

/** The dispatch ctx's session model — the free phase's model AND the respond fallback. */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/**
 * Cell (d6): a resolvable frontmatter `model:` whose api is OUTSIDE
 * `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` — the runtime provider gate's refusal
 * input (conversation-drive.md §Provider compatibility for typed queries).
 */
const GOOGLE_MODEL = {
  id: "m-gem",
  api: "google-generative-ai",
  provider: "google",
  strictCapable: true,
};

/** The fixed respond-tool description literal (bug-0010 design brief §Slug / naming). */
const RESPOND_TOOL_DESCRIPTION_LITERAL =
  "Return the final answer for the typed query, conforming to the response schema.";

// --- The driven thetas ----------------------------------------------------------
// The bug-doc repro shape (the 0007 harness): a prompt-mode theta whose
// `subagent fn` body issues the `@`-query. The body's queries resolve through
// the in-process subagent-fn host (`#spawnSubagentFnSession` →
// `userVisible: false`) → the off-session driver → mocked `complete()`.
// FN-7: with no `with` clause the spawned session INHERITS the enclosing
// theta's frontmatter (`model` / `tool_loop` / `respond_repair`), so each
// variant configures the fn's session through the enclosing frontmatter.
//
// The `Verdict` schema is declared at the theta TOP LEVEL and referenced from
// inside the fn body — named-schema resolution inside `subagent fn` bodies is
// proven by the frozen bug-0007 suite (its typed green control validates
// `{score: 7}` against the same shape), and `respondFixture()` below re-proves
// the lowering against this suite's own fixture before any cell drives.

/** Build a typed subagent-fn fixture theta with extra frontmatter lines. */
function typedFnTheta(frontmatterExtra: readonly string[]): string {
  return [
    "---",
    "mode: prompt",
    ...frontmatterExtra,
    "---",
    "schema Verdict {",
    "  score: number",
    "}",
    "subagent fn helper(a: string) {",
    "  let v: Verdict = @`Ping`?",
    "  v",
    "}",
    'let out = helper("x")',
    "out",
    "",
  ].join("\n");
}

/** (d1)(d2)(d2b)(d3)(d3b)(d4)(d7): default budgets (attempts 3, max_rounds 25). */
const TYPED_FN_THETA = typedFnTheta([]);

/** (d5): `respond_repair.attempts: 0` — ERR-17 is terminal at once. */
const TYPED_FN_THETA_REPAIR0 = typedFnTheta(["respond_repair:", "  attempts: 0"]);

/** (d8): `respond_repair.attempts: 1` — exactly ONE two-phase repair restart. */
const TYPED_FN_THETA_REPAIR1 = typedFnTheta(["respond_repair:", "  attempts: 1"]);

/** (d13): TWO attempts budgeted — a repair transport failure must stop attempt 2. */
const TYPED_FN_THETA_REPAIR2 = typedFnTheta(["respond_repair:", "  attempts: 2"]);

/**
 * (deg-off) degraded-arm fixture (bug 0010 fix review, F5): an EMPTY `@<>`
 * annotation — the one form `lowerQueryResponseSchema` cannot lower. Since bug
 * 0014 this source is REJECTED at parse (theta/parse/empty-query-annotation),
 * so it never drives: the (deg-off) cell re-pins the parse refusal, and the
 * kept degraded arm is pinned through the non-parse seam twin below.
 */
const UNLOWERABLE_FN_THETA = [
  "---",
  "mode: prompt",
  "---",
  "subagent fn helper(a: string) {",
  "  let v = @<>`Ping`?",
  "  v",
  "}",
  'let out = helper("x")',
  "out",
  "",
].join("\n");

/**
 * The seam-base twin for the kept degraded-arm pin: parses CLEAN with
 * `@<string>`; the (deg-off-seam) cell then blanks the parsed QueryExpr's
 * schema to `""` — the direct construction that is the arm's only remaining
 * entry now that bug 0014 rejects every empty `@<…>` spelling at parse.
 */
const UNLOWERABLE_FN_THETA_SEAM_BASE = [
  "---",
  "mode: prompt",
  "---",
  "subagent fn helper(a: string) {",
  "  let v = @<string>`Ping`?",
  "  v",
  "}",
  'let out = helper("x")',
  "out",
  "",
].join("\n");

/** (d6): frontmatter `model:` resolves to the gate-refused google api. */
const TYPED_FN_THETA_MODEL_GEM = typedFnTheta(["model: m-gem"]);

/** (d10): `tool_loop.max_rounds: 1` — one free-phase slot, then CIO-4's final branch. */
const TYPED_FN_THETA_ROUNDS1 = typedFnTheta(["tool_loop:", "  max_rounds: 1"]);

/** (d11): the QRY-14 `max_rounds: 0` boundary — no free-phase call at all. */
const TYPED_FN_THETA_MAX0 = typedFnTheta(["tool_loop:", "  max_rounds: 0"]);

/** (d9): the untyped twin — the callable set presents alone (no respond tool). */
const UNTYPED_FN_THETA = [
  "---",
  "mode: prompt",
  "---",
  "subagent fn helper(a: string) {",
  "  let v = @`Ping`?",
  "  v",
  "}",
  'let out = helper("x")',
  "out",
  "",
].join("\n");

// --- The lowered `Verdict` schema / slug / QRY-15 template ---------------------

/**
 * The lowered `Verdict` response schema, its slug, and the respond tool name —
 * computed through the SAME production collaborators the runtime uses
 * (`lowerQueryResponseSchema` + the sha256-first-16-hex slug recipe of
 * src/runtime/typed-query-validation.ts `respondSchemaSlug`), so the pins
 * below are byte-exact against the contract, not against copied constants.
 * Computing it from THIS suite's subagent-fn fixture also verifies the named
 * top-level schema lowers for a query INSIDE a `subagent fn` body.
 */
interface RespondFixture {
  readonly lowered: LoweredSchema;
  readonly slug: string;
  readonly toolName: string;
}

let cachedRespondFixture: RespondFixture | undefined;

function respondFixture(): RespondFixture {
  if (cachedRespondFixture !== undefined) {
    return cachedRespondFixture;
  }
  const doc = parse(TYPED_FN_THETA);
  const decls = doc.body.statements.filter(
    (stmt): stmt is SchemaDecl => stmt.kind === "schema",
  );
  const lowered = lowerQueryResponseSchema("Verdict", decls);
  if (lowered === undefined) {
    throw new Error(
      "fixture defect: the top-level Verdict schema must lower for the subagent-fn body query",
    );
  }
  const slug = createHash("sha256")
    .update(JSON.stringify(lowered))
    .digest("hex")
    .slice(0, 16);
  cachedRespondFixture = {
    lowered,
    slug,
    toolName: `__theta_respond_${slug}`,
  };
  return cachedRespondFixture;
}

/**
 * The QRY-15 initial-respond-turn template body, byte-exact
 * (query-tool-loop.md QRY-15): the instruction sentence naming the backticked
 * respond tool, a single U+000A, `JSON.stringify(lowered, null, 2)`, and the
 * mandated trailing U+000A. The off-session forced respond dispatch trails the
 * SAME bytes as the live path (shared `renderInitialRespondTurn`).
 */
function qry15Body(lowered: LoweredSchema, toolName: string): string {
  return (
    "Return your final answer using the `" +
    toolName +
    "` tool, conforming to this schema:\n" +
    JSON.stringify(lowered, null, 2) +
    "\n"
  );
}

/**
 * The EXACT QRY-12 `validator_error` follow-up bytes for an AJV-rejected
 * payload: the probe validates `payload` through the SAME production AJV
 * collaborator the loop uses, maps the errors to `ValidationIssue`s exactly as
 * src/runtime/typed-query-validation.ts `validateAgainst` does, and renders
 * through the production QRY-12 renderer — byte-derived from the contract,
 * never a hardcoded AJV message string.
 */
function expectedValidatorErrorFollowUp(payload: unknown): string {
  const { lowered, slug } = respondFixture();
  const verdict = ajv().compile(lowered).validate(payload);
  if (verdict.ok) {
    throw new Error("fixture defect: the probe payload must FAIL AJV validation");
  }
  const issues: ValidationIssue[] = verdict.errors.map((e) => ({
    path: e.instancePath,
    message: e.message,
    schema_keyword: e.keyword,
  }));
  return renderFollowUpTurn({
    methodology: "validator_error",
    loweredSchema: lowered,
    slug,
    issues,
  });
}

/** The production AJV's message strings for a rejected payload (byte-derived). */
function ajvIssueMessagesFor(payload: unknown): string[] {
  const { lowered } = respondFixture();
  const verdict = ajv().compile(lowered).validate(payload);
  if (verdict.ok) {
    throw new Error("fixture defect: the probe payload must FAIL AJV validation");
  }
  return verdict.errors.map((e) => e.message);
}

// --- Scripted `complete()` assistant replies ------------------------------------

/**
 * An `AssistantMessage`-shaped reply for the mocked `complete()`. `toolCalls`
 * scripts pi-ai `ToolCall` content parts (`{type: "toolCall", ...}`) alongside
 * any text part.
 */
function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  }>;
}): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  if (fields.text !== undefined) {
    content.push({ type: "text", text: fields.text });
  }
  for (const call of fields.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  }
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    stopReason: fields.stopReason,
    ...(fields.errorMessage !== undefined ? { errorMessage: fields.errorMessage } : {}),
    timestamp: 0,
  };
}

// --- Harness ------------------------------------------------------------------

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
function parse(src: string): ThetaDocument {
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/**
 * Bug 0014 seam accommodation: blank the `subagent fn` body's single query
 * `schema` to `""` IN PLACE (a narrowing cast over the parser's readonly
 * field). Bug 0014 rejects every empty `@<…>` spelling at parse, so a
 * `schema: ""` QueryExpr — the degraded arm's sole entry — is constructible
 * only here, bypassing `parseQuery`. Fails loudly if the fixture shape drifts.
 */
function blankHelperQuerySchema(doc: ThetaDocument): void {
  const fn = doc.body.statements[0];
  if (fn?.kind !== "fn") {
    throw new Error("seam guard: expected the subagent fn declaration first");
  }
  const stmt = fn.body.statements[0];
  if (
    stmt?.kind !== "let" ||
    stmt.init?.kind !== "try" ||
    stmt.init.operand.kind !== "query"
  ) {
    throw new Error(
      "seam guard: expected `let v = @<string>`…`?` as the fn body's first statement",
    );
  }
  (stmt.init.operand as { schema: string | null }).schema = "";
}

/** The production AJV validator (real schema validation for the typed cells). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * A runtime-root double sufficient for the off-session query drive: a noop
 * checkpoint, deterministic ids, a wall clock for the query-loop config, and
 * the REAL AJV validator so the typed cells' schema validation behaves as
 * production (a non-conforming payload genuinely fails and opens repair).
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/**
 * Bug 0010 harness accommodation (permitted outside the frozen scripted-driver
 * suites): the `ModelRegistry` double carries `getAvailable` — the surface a
 * present frontmatter `model:` resolves against for the respond dispatch — and
 * `getApiKeyAndHeaders`, the off-session calls' auth threading (options.apiKey
 * / options.headers when the resolution is ok).
 */
function registryDouble(available: readonly unknown[]): ModelRegistry {
  return {
    getAvailable: () => [...available],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/**
 * Cell (d7): a registry double WITHOUT `getApiKeyAndHeaders` — the frozen
 * bug-0007 suite drives this producer with `modelRegistry: {}`, so the fixed
 * auth threading must PROBE for the method rather than crash on its absence.
 */
function partialRegistryDouble(available: readonly unknown[]): ModelRegistry {
  return { getAvailable: () => [...available] } as unknown as ModelRegistry;
}

/**
 * The dispatch ctx. It MUST carry `.model` (the resolved off-session model) or
 * the off-session model-unavailable arm fires instead of the mechanism under
 * test.
 */
function ctxDouble(model: unknown): ExtensionCommandContext {
  return {
    model,
    sessionManager: { getEntries: (): readonly unknown[] => [], getLeafId: (): undefined => undefined },
  } as unknown as ExtensionCommandContext;
}

/**
 * The `ExtensionAPI` double. The off-session drive touches no session surface
 * (SLSH-2 by construction — there is no session), but the shared respond-tool
 * machinery MAY route through the PIC-44 registration cache, so the double
 * tolerates (and ignores) the registration/active-set surfaces rather than
 * crashing a conforming implementation on a missing method.
 */
function piDouble(): ExtensionAPI {
  return {
    sendMessage: (): void => {},
    registerTool: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

/**
 * Drive one fixture theta through the PRODUCTION prompt-mode binding
 * (`bindPromptConversation` → `executeBody`). The `subagent fn` call inside
 * re-binds the body's queries onto the off-session host
 * (`#spawnSubagentFnSession` → `userVisible: false`).
 */
async function driveTheta(
  source: string,
  model: unknown,
  opts?: {
    readonly registry?: ModelRegistry;
    readonly resolvePiTool?: (name: string) => PiToolDispatch | undefined;
    /**
     * Cancellation cells (fix review F1/F7b): the harness-owned per-invocation
     * controller, threaded as the bind input's `thetaAbort` so a scripted
     * `complete()` factory can abort the theta signal mid-flight (the
     * subagent-fn child derives its signal downward from it).
     */
    readonly thetaAbort?: AbortController;
    /**
     * Bug 0014 seam accommodation: mutate the (clean-parsed) document before
     * binding — the (deg-off-seam) cell blanks the query's schema to `""` to
     * construct the degraded arm's entry directly, now that the `@<>`
     * spelling is rejected at parse.
     */
    readonly mutateDoc?: (doc: ThetaDocument) => void;
  },
): Promise<BodyExecution> {
  const doc = parse(source);
  opts?.mutateDoc?.(doc);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const deps = createProductionProducerDeps({
    pi: piDouble(),
    root: rootDouble(),
    modelRegistry: opts?.registry ?? registryDouble([ANTHROPIC_MODEL]),
    ...(opts?.resolvePiTool !== undefined ? { resolvePiTool: opts.resolvePiTool } : {}),
  });
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: ctxDouble(model),
    ...(opts?.thetaAbort !== undefined ? { thetaAbort: opts.thetaAbort } : {}),
  });
  return executeBody(theta.body, binding.executeDeps);
}

/**
 * Dig the author-visible leaf `QueryError` out of a drive's final value (the
 * bug-0007 harness shape): the body completes either way (the fn-call result
 * is BOUND by `let out`, tail `out`), so the observable is a success-outcome
 * body whose FINAL VALUE is the Err Result; the fn boundary wraps the
 * `?`-propagated leaf as `InvokeCalleeError { kind: "invoke_callee", inner }`
 * (FN-6 / invocation.md §Failures). Strict: fails loudly (quoting the
 * observed value) when the shape is anything else.
 */
function expectErrQueryError(execution: BodyExecution): Record<string, unknown> {
  expect(
    execution.outcome,
    `the drive's body must complete with the Err BOUND as its final value; ` +
      `observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  const value = execution.result.value;
  const isErr =
    value !== undefined &&
    isResultValue(value as ThetaValue) &&
    (value as { readonly ok: boolean }).ok === false;
  expect(
    isErr,
    "the author-visible final value must be the Err Result carrying the QueryError; " +
      `observed final value: ${JSON.stringify(value)}`,
  ).toBe(true);
  const envelope = (value as { readonly error: unknown }).error;
  expect(
    envelope !== null && typeof envelope === "object",
    `the Err payload must be the QueryError envelope object; observed: ${JSON.stringify(envelope)}`,
  ).toBe(true);
  const wrapper = envelope as Record<string, unknown>;
  expect(
    wrapper.kind,
    "a `?`-propagated Err crosses the `subagent fn` boundary wrapped as invoke_callee " +
      `(FN-6); observed envelope: ${JSON.stringify(wrapper)}`,
  ).toBe("invoke_callee");
  const inner = wrapper.inner;
  expect(
    inner !== null && typeof inner === "object",
    `invoke_callee.inner must carry the leaf QueryError; observed envelope: ${JSON.stringify(wrapper)}`,
  ).toBe(true);
  return inner as Record<string, unknown>;
}

/**
 * Assert a successful drive resolving the fn's final value (the bug-0007
 * green-control shape: the callee's raw final value crosses the FN-6 boundary
 * on success and `let out` binds it as the body's final value).
 */
function expectValue(execution: BodyExecution, expected: unknown, why: string): void {
  expect(
    execution.outcome,
    `${why}; observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  expect(execution.result.value, why).toEqual(expected);
}

// --- Recorded-call digging -------------------------------------------------------

/** Extract a message's text (string content or text-part array). */
function messageText(message: unknown): string {
  const msg = message as { readonly content?: unknown };
  if (typeof msg.content === "string") {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(
        (part): part is { readonly type: string; readonly text: string } =>
          (part as { readonly type?: unknown }).type === "text" &&
          typeof (part as { readonly text?: unknown }).text === "string",
      )
      .map((part) => part.text)
      .join("");
  }
  return "";
}

/** The recorded `complete()` call's context.messages, duck-typed. */
function contextMessagesOf(call: {
  readonly context: unknown;
}): readonly Record<string, unknown>[] {
  const context = call.context as { readonly messages?: unknown };
  expect(
    Array.isArray(context.messages),
    `the complete() context must carry a messages array; observed context: ${JSON.stringify(call.context)}`,
  ).toBe(true);
  return context.messages as readonly Record<string, unknown>[];
}

/** The recorded `complete()` call's context.tools, duck-typed (undefined when absent). */
function contextToolsOf(call: {
  readonly context: unknown;
}): readonly Record<string, unknown>[] | undefined {
  const tools = (call.context as { readonly tools?: unknown }).tools;
  return tools === undefined ? undefined : (tools as readonly Record<string, unknown>[]);
}

/** The recorded `complete()` call's options object (`{}` when the call passed none). */
function optionsOf(call: { readonly options: unknown }): Record<string, unknown> {
  return (call.options ?? {}) as Record<string, unknown>;
}

/** Find a held-conversation message by its toolCallId (a fed-back tool result). */
function findToolResult(
  messages: readonly Record<string, unknown>[],
  toolCallId: string,
): Record<string, unknown> | undefined {
  return messages.find((message) => message["toolCallId"] === toolCallId);
}

/** Whether any message carries a ToolCall content part naming `toolName`. */
function anyMessageCarriesToolCall(
  messages: readonly Record<string, unknown>[],
  toolName: string,
): boolean {
  return messages.some((message) => {
    const content = message["content"];
    return (
      Array.isArray(content) &&
      content.some(
        (part) =>
          (part as { readonly type?: unknown }).type === "toolCall" &&
          (part as { readonly name?: unknown }).name === toolName,
      )
    );
  });
}

beforeEach(() => {
  scripted.queue = [];
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// Regression pins — the increment-D contract (red before the fix). PRE-FIX
// the off-session driver was the fused single shot: ONE `complete(model,
// { messages: [user <typed-aware fused text>] })` with no tools, no options,
// and a text-parse of the reply; a non-JSON reply laundered into
// respond-repair re-drives (so the typed cells redded on the CALL-COUNT pins
// first).
// ===========================================================================

describe("bug 0010 increment D (regression pins) — off-session typed free phase: a real tool loop over a held conversation (QRY-13/QRY-14, FN-6/FN-7)", () => {
  it("(d1) typed happy path: free-phase complete() with respond tool + signal + auth and NO toolChoice, then the forced respond complete() with toolChoice + QRY-15 trailing over the held conversation — resolving {score: 7}", async () => {
    const { lowered, toolName } = respondFixture();
    scripted.queue = [
      // complete() #1 — the free-phase round-0 turn terminates in plain text.
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      // complete() #2 — the forced respond turn: the respond ToolCall with the
      // schema-valid payload.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc1", name: toolName, arguments: { score: 7 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL);

    // The two-phase shape (bug 0010 increment D): free phase + forced respond
    // = exactly TWO complete() calls. Pre-fix: ONE fused call whose non-JSON
    // text laundered into respond-repair (1 + 3 = 4 calls).
    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — the free-phase turn and the off-session " +
        "forced respond turn (QRY-14 two-phase; bug 0010 increment D)",
    ).toBe(2);

    // FREE-PHASE call shape: tools = the callable set (empty here) + the
    // respond tool; NO toolChoice; signal + auth threaded as options.
    const free = scripted.calls[0]!;
    const freeTools = contextToolsOf(free);
    expect(
      Array.isArray(freeTools) && freeTools!.length === 1,
      "the free-phase context.tools is exactly the respond tool (the theta's " +
        `callable set is empty); observed: ${JSON.stringify(freeTools)}`,
    ).toBe(true);
    expect(
      freeTools![0]!["name"],
      "the presented respond tool entry carries the content-addressed " +
        "__theta_respond_<slug> name (QRY-14: available during the free phase)",
    ).toBe(toolName);
    expect(
      freeTools![0]!["description"],
      "the presented respond tool entry carries the SAME description literal as " +
        "the live path (bug-0010 design brief §Slug / naming)",
    ).toBe(RESPOND_TOOL_DESCRIPTION_LITERAL);
    expect(
      JSON.parse(JSON.stringify(freeTools![0]!["parameters"])),
      "the presented respond tool's parameters carry the lowered response schema",
    ).toEqual(JSON.parse(JSON.stringify(lowered)));
    const freeOptions = optionsOf(free);
    expect(
      freeOptions["toolChoice"],
      "the FREE-PHASE call carries NO toolChoice — forcing applies only to the " +
        "respond turn (QRY-14 step 2)",
    ).toBeUndefined();
    expect(
      freeOptions["signal"] instanceof AbortSignal,
      "the free-phase call threads options.signal (the theta signal — bug 0010 " +
        `§auth/signal threading); observed: ${String(freeOptions["signal"])}`,
    ).toBe(true);
    expect(
      freeOptions["apiKey"],
      "the free-phase call threads auth from modelRegistry.getApiKeyAndHeaders",
    ).toBe("k-test");

    // FORCED RESPOND call shape: held conversation + trailing QRY-15 template,
    // tools = exactly the respond tool, toolChoice forced (anthropic spelling).
    const respond = scripted.calls[1]!;
    expect(
      optionsOf(respond)["toolChoice"],
      "the respond dispatch forces the provider to the respond tool — the " +
        "anthropic-shaped {type:'tool',name} spelling (QRY-14 step 2; T34)",
    ).toEqual({ type: "tool", name: toolName });
    const respondTools = contextToolsOf(respond);
    expect(
      Array.isArray(respondTools) &&
        respondTools!.length === 1 &&
        respondTools![0]!["name"] === toolName,
      `the respond dispatch carries exactly the respond tool; observed: ${JSON.stringify(respondTools)}`,
    ).toBe(true);
    const messages = contextMessagesOf(respond);
    expect(
      messages.length,
      "the respond conversation is the HELD conversation (opening user prompt + " +
        "free-phase assistant reply) plus the trailing QRY-15 template — three messages",
    ).toBe(3);
    expect(messages[0]!["role"], "the held conversation opens at the rendered prompt").toBe(
      "user",
    );
    expect(
      messageText(messages[0]),
      "the held conversation's opening user message is the rendered prompt ONLY",
    ).toBe("Ping");
    expect(
      messages[1]!["role"],
      "the free-phase assistant reply JOINED the held conversation",
    ).toBe("assistant");
    const trailing = messages[messages.length - 1]!;
    expect(trailing["role"], "the QRY-15 template rides a user message").toBe("user");
    expect(
      messageText(trailing),
      "the trailing message is the QRY-15 template, byte-exact (shared renderer " +
        "with the live path)",
    ).toBe(qry15Body(lowered, toolName));

    // The validated payload crosses the FN-6 boundary as the fn's final value.
    expectValue(
      execution,
      { score: 7 },
      "the forced respond ToolCall's arguments validate and resolve the typed " +
        "subagent-fn query (QRY-14 step 2)",
    );
  });

  it("(d2) free-phase tool loop serviced: an out-of-set ToolCall feeds back the unavailable-tool isError result and the loop continues to the forced respond", async () => {
    const { toolName } = respondFixture();
    scripted.queue = [
      // complete() #1 — round 0: the model calls a tool OUTSIDE the callable set.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "t1", name: "ghost-tool", arguments: {} }],
        }),
      // complete() #2 — round 1: the fed-back result in hand, the model
      // terminates in plain text.
      () => assistantReply({ stopReason: "stop", text: "done" }),
      // complete() #3 — the forced respond turn complies.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-r", name: toolName, arguments: { score: 7 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL);

    expect(
      scripted.calls.length,
      "exactly THREE complete() calls — tool round, terminating text turn, " +
        "forced respond (QRY-13: the loop services the call and feeds the " +
        "result back; pre-fix the off-session driver ran no tool loop at all)",
    ).toBe(3);
    // THE QRY-13 WIRING PROOF: call 2's held conversation carries the fed-back
    // unavailable-tool isError result for the ghost call — the
    // `lowerModelDrivenToolCall` unavailable lowering (a name outside the
    // callable set never dispatches; ambient tools are never inherited).
    const round1Messages = contextMessagesOf(scripted.calls[1]!);
    const ghostResult = findToolResult(round1Messages, "t1");
    expect(
      ghostResult !== undefined,
      "the second free-phase call's held conversation contains the fed-back " +
        `tool result for ToolCall 't1'; observed messages: ${JSON.stringify(round1Messages)}`,
    ).toBe(true);
    expect(
      ghostResult!["isError"],
      "an out-of-set tool call lowers to an isError tool-result (QRY-13; " +
        "frontmatter.md §tools: ambient tools are never inherited)",
    ).toBe(true);
    expect(
      messageText(ghostResult),
      "the unavailable-tool result carries the fixed lowering text",
    ).toContain("tool 'ghost-tool' is not available in this theta's callable set");
    // Call 3 is the FORCED respond turn.
    expect(
      optionsOf(scripted.calls[2]!)["toolChoice"],
      "the third call is the forced respond dispatch (toolChoice forced)",
    ).toEqual({ type: "tool", name: toolName });
    expectValue(execution, { score: 7 }, "the typed query resolves through the forced respond turn");
  });

  it("(d2b) free-phase tool loop REAL dispatch: an in-set call executes through the resolved PiToolDispatch and feeds back its clean text result", async () => {
    const { toolName } = respondFixture();
    // The producer-wide `resolvePiTool` collaborator (ProductionProducerInput):
    // harness fixture thetas carry no frozen callable-set snapshot, so
    // resolution falls back to this seam — the load-bearing pin is the
    // `lowerModelDrivenToolCall(call, dispatch, signal)` DISPATCH wiring, not
    // the context.tools presentation (which duck-reads the frozen snapshot and
    // is empty for a snapshot-less fixture).
    const resolvePiTool = (name: string): PiToolDispatch | undefined =>
      name === "echo"
        ? {
            toolName: "echo",
            execute: async () => ({ content: [{ type: "text", text: "echoed!" }] }),
          }
        : undefined;
    scripted.queue = [
      // complete() #1 — round 0: the model calls the resolvable "echo" tool.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "t-echo", name: "echo", arguments: {} }],
        }),
      // complete() #2 — round 1: terminating text turn.
      () => assistantReply({ stopReason: "stop", text: "ok done" }),
      // complete() #3 — the forced respond turn complies.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-r", name: toolName, arguments: { score: 7 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL, { resolvePiTool });

    expect(
      scripted.calls.length,
      "exactly THREE complete() calls — tool round, terminating turn, forced respond",
    ).toBe(3);
    const round1Messages = contextMessagesOf(scripted.calls[1]!);
    const echoResult = findToolResult(round1Messages, "t-echo");
    expect(
      echoResult !== undefined,
      "the second free-phase call's held conversation contains the fed-back " +
        `tool result for ToolCall 't-echo'; observed messages: ${JSON.stringify(round1Messages)}`,
    ).toBe(true);
    expect(
      echoResult!["isError"],
      "a clean dispatch lowers to a NON-error tool-result " +
        "(lowerModelDrivenToolCall clean-resolve arm; QRY-13)",
    ).toBe(false);
    expect(
      messageText(echoResult),
      "the tool result carries the executed tool's text — the REAL dispatch ran",
    ).toBe("echoed!");
    expectValue(execution, { score: 7 }, "the typed query resolves through the forced respond turn");
  });

  it("(d3) early respond capture: a VALID respond-tool call during the free phase resolves the query with ONE complete() — no further free-phase call, no forced dispatch", async () => {
    const { toolName } = respondFixture();
    scripted.queue = [
      // complete() #1 — round 0: the model calls the respond tool EARLY with a
      // schema-valid payload. The capture is one-shot: the free phase then
      // TERMINATES (the next nextFreePhaseTurn returns {kind:"text"} with NO
      // complete()) and the forced respond turn returns the captured payload
      // WITHOUT any dispatch.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-early", name: toolName, arguments: { score: 3 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL);

    expect(
      scripted.calls.length,
      "exactly ONE complete() call — the early-captured payload terminates the " +
        "free phase and SKIPS the forced dispatch (QRY-14 early respond; bug 0010)",
    ).toBe(1);
    expectValue(
      execution,
      { score: 3 },
      "the first valid early respond call wins (one-shot) and resolves the typed query",
    );
  });

  it("(d3b) early respond INVALID: the respond-tool call's AJV failure feeds back an isError tool-result and the query resolves via the forced turn", async () => {
    const { toolName } = respondFixture();
    scripted.queue = [
      // complete() #1 — round 0: an INVALID early respond call ({score:"bad"}
      // vs number). QRY-13/QRY-14: the isError validation result feeds back
      // and the loop continues — no capture.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-early", name: toolName, arguments: { score: "bad" } }],
        }),
      // complete() #2 — round 1: terminating text turn.
      () => assistantReply({ stopReason: "stop", text: "let me try again" }),
      // complete() #3 — the forced respond turn complies.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-r", name: toolName, arguments: { score: 7 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL);

    expect(
      scripted.calls.length,
      "exactly THREE complete() calls — the invalid early call does NOT capture; " +
        "the loop continues and the forced respond turn supplies the payload",
    ).toBe(3);
    const round1Messages = contextMessagesOf(scripted.calls[1]!);
    const invalidResult = findToolResult(round1Messages, "tc-early");
    expect(
      invalidResult !== undefined,
      "the second call's held conversation contains the fed-back result for the " +
        `invalid respond call; observed messages: ${JSON.stringify(round1Messages)}`,
    ).toBe(true);
    expect(
      invalidResult!["isError"],
      "an INVALID early respond call feeds back an isError tool-result " +
        "(QRY-14: AJV rejects in the respond tool's servicing; QRY-13 feedback)",
    ).toBe(true);
    expect(
      messageText(invalidResult),
      "the isError result carries the AJV validation message so the model can " +
        "correct in-turn (byte-derived from the production AJV)",
    ).toContain(ajvIssueMessagesFor({ score: "bad" })[0]!);
    expectValue(
      execution,
      { score: 7 },
      "the query resolves from the forced respond payload, never the invalid early call",
    );
  });
});

describe("bug 0010 increment D (regression pins) — off-session forced respond: transport / ERR-17 / provider gate / auth threading (PIC-50/51, ERR-17, conversation-drive §Provider compatibility)", () => {
  it("(d4a) free-phase transport: an error-stop on the FIRST free-phase call is Err(transport) with ONE complete() — no respond dispatch — and the free-phase call already carries the two-phase shape", async () => {
    scripted.queue = [
      () => assistantReply({ stopReason: "error", errorMessage: "dead-free" }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL);

    // Classification pins — conceptually green since bug 0007 (the same
    // classifyOffSessionReply path): transport, message carried, provider =
    // the model's api-shaped `.api`, exactly one call.
    expect(
      scripted.calls.length,
      "the free-phase transport failure terminates the typed query BEFORE any " +
        "respond dispatch — exactly ONE complete() (PIC-50; bug 0007 discipline)",
    ).toBe(1);
    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(err.message, "the provider's errorMessage is CARRIED (PIC-51)").toBe("dead-free");
    expect(
      err.provider,
      "provider derives from the dispatched model's api-shaped `.api` " +
        "(queryerror-variants.md §provider derivation)",
    ).toBe("anthropic-messages");
    // The increment-D pins (red pre-fix — the fused call passed no tools and
    // no options): the FAILING call was a conforming FREE-PHASE call.
    const free = scripted.calls[0]!;
    const freeTools = contextToolsOf(free);
    expect(
      Array.isArray(freeTools) &&
        freeTools!.some((tool) => tool["name"] === respondFixture().toolName),
      "the failing call was the two-phase FREE-PHASE dispatch — context.tools " +
        `presents the respond tool (bug 0010 increment D); observed: ${JSON.stringify(freeTools)}`,
    ).toBe(true);
    expect(
      optionsOf(free)["toolChoice"],
      "no toolChoice on the free-phase call",
    ).toBeUndefined();
    expect(
      optionsOf(free)["signal"] instanceof AbortSignal,
      "the free-phase call threads options.signal (bug 0010 §auth/signal threading)",
    ).toBe(true);
  });

  it("(d4b) respond-turn transport: an error-stop on the forced respond dispatch is Err(transport) with TWO complete() calls — repair terminates with no debit — and the second call carries the forced shape", async () => {
    const { lowered, toolName } = respondFixture();
    scripted.queue = [
      // complete() #1 — the free phase terminates cleanly.
      () => assistantReply({ stopReason: "stop", text: "free ok" }),
      // complete() #2 — the forced respond dispatch FAILS at the transport
      // layer. Sticky-last: any over-driving keeps observing this failure.
      () => assistantReply({ stopReason: "error", errorMessage: "dead-respond" }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL);

    // Classification pins (0007-conceptually-green): the transport failure
    // terminates the typed query at the respond turn — no repair re-drives.
    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — free phase + the failing respond dispatch; " +
        "a transport failure terminates repair with NO attempts debit (QRY-11 " +
        "§non-validation; bug 0007 discipline on the new seam)",
    ).toBe(2);
    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(err.message, "the respond dispatch's errorMessage is carried").toBe("dead-respond");
    expect(
      err.provider,
      "the respond call's provider derives from the RESOLVED RESPOND MODEL's " +
        "`.api` (no frontmatter model: → the ctx session model)",
    ).toBe("anthropic-messages");
    // The increment-D pins (red pre-fix): call 2 was the FORCED respond dispatch.
    const respond = scripted.calls[1]!;
    expect(
      optionsOf(respond)["toolChoice"],
      "the second call is the FORCED respond dispatch — toolChoice forced " +
        "(bug 0010 increment D; pre-fix the repair follow-up re-drove bare)",
    ).toEqual({ type: "tool", name: toolName });
    const messages = contextMessagesOf(respond);
    expect(
      messageText(messages[messages.length - 1]),
      "the respond dispatch trails the QRY-15 template, byte-exact",
    ).toBe(qry15Body(lowered, toolName));
  });

  it("(d5) ERR-17 off-session (attempts 0): a plain-text respond reply is terminal Err(validation) with the fixed message, the synthesised plain_text issue, and raw_response 'refuse' — TWO calls", async () => {
    scripted.queue = [
      // complete() #1 — the free phase terminates cleanly.
      () => assistantReply({ stopReason: "stop", text: "considering" }),
      // complete() #2 — the forced respond turn resolves NORMALLY but returns
      // plain text instead of calling the respond tool (ERR-17 plain_text).
      () => assistantReply({ stopReason: "stop", text: "refuse" }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA_REPAIR0, ANTHROPIC_MODEL);

    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — free phase + the non-compliant respond " +
        "turn; attempts 0 is terminal at once (ERR-17; QRY-11 none/0)",
    ).toBe(2);
    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("validation");
    expect(err.cause, "ERR-17 rides cause schema_validation").toBe("schema_validation");
    expect(
      err.message,
      "the ERR-17 terminal message is the fixed literal (queryerror-variants.md)",
    ).toBe("model did not call the forced respond tool");
    const issues = err.validation_errors as ReadonlyArray<Record<string, unknown>>;
    expect(
      issues?.[0]?.message,
      "the synthesised plain_text issue literal (ERR-17: a normal stop with no ToolCall)",
    ).toBe("model returned plain text instead of calling the forced respond tool");
    expect(
      err.raw_response,
      "raw_response carries the respond turn's assistant text verbatim (ERR-17)",
    ).toBe("refuse");
    expect(err.attempts, "respond_repair.attempts: 0 — zero debits").toBe(0);
  });

  it("(d6) provider gate off-session: a frontmatter `model:` resolving to an unsupported api refuses with the gate TransportError and ZERO complete() calls", async () => {
    // The fn inherits the enclosing theta's `model:` (FN-7) as the respond
    // model resolution input; `m-gem` resolves against the registry to the
    // google-generative-ai api — outside TYPED_QUERY_SUPPORTED_PROVIDER_APIS.
    // The queue stays EMPTY: any complete() dispatch throws loudly.
    scripted.queue = [];

    const execution = await driveTheta(TYPED_FN_THETA_MODEL_GEM, ANTHROPIC_MODEL, {
      registry: registryDouble([ANTHROPIC_MODEL, GOOGLE_MODEL]),
    });

    expect(
      scripted.calls.length,
      "the runtime provider gate refuses BEFORE any provider turn — ZERO " +
        "complete() calls (conversation-drive.md §Provider compatibility for " +
        "typed queries; bug 0010 increment D brings the gate to the off-session sibling)",
    ).toBe(0);
    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.message,
      "the gate error is synthesizeUnsupportedProviderTransportError(api), verbatim",
    ).toBe("google-generative-ai does not support forced tool-use; typed queries unavailable");
    expect(err.provider, "the gate error carries the refused api").toBe(
      "google-generative-ai",
    );
    expect(err.http_status, "a capability gap, not a provider response").toBeNull();
    expect(err.retryable, "the gate refusal is definite").toBe(false);
  });

  it("(d7) partial registry: a ModelRegistry double WITHOUT getApiKeyAndHeaders still drives the typed happy path — 2 calls, no apiKey threaded, no crash", async () => {
    // WHY: the frozen bug-0007 suite constructs `modelRegistry: {}` — the
    // fixed auth threading must PROBE for the method (thread auth only when
    // the registry exposes it AND it resolves ok), never crash on absence.
    const { toolName } = respondFixture();
    scripted.queue = [
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc1", name: toolName, arguments: { score: 7 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL, {
      registry: partialRegistryDouble([ANTHROPIC_MODEL]),
    });

    expect(
      scripted.calls.length,
      "the two-phase shape survives a registry without getApiKeyAndHeaders — " +
        "exactly TWO complete() calls (bug 0010 §auth threading: auth is optional)",
    ).toBe(2);
    expect(
      optionsOf(scripted.calls[0]!)["apiKey"],
      "no auth surface → no apiKey threaded on the free-phase call",
    ).toBeUndefined();
    expect(
      optionsOf(scripted.calls[1]!)["apiKey"],
      "no auth surface → no apiKey threaded on the respond dispatch",
    ).toBeUndefined();
    expect(
      optionsOf(scripted.calls[0]!)["signal"] instanceof AbortSignal,
      "the signal still threads — auth absence must not drop cancellation",
    ).toBe(true);
    expectValue(execution, { score: 7 }, "the typed query resolves without auth threading");
  });
});

describe("bug 0010 increment D (regression pins) — off-session repair restart, untyped loop, and budget boundaries (QRY-14 ¶3, QRY-16/CIO-4)", () => {
  it("(d8) repair restart (attempts 1): the QRY-12 follow-up joins the HELD conversation and re-runs the free phase, then a fresh forced dispatch — respond exchanges never join the held conversation — resolving {score: 9}", async () => {
    const { lowered, toolName } = respondFixture();
    const followUpText = expectedValidatorErrorFollowUp({ score: "bad" });
    scripted.queue = [
      // complete() #1 — the free phase terminates cleanly.
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      // complete() #2 — the INITIAL forced respond dispatch: an AJV-rejected
      // payload ({score:"bad"} vs number) opens respond-repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-bad", name: toolName, arguments: { score: "bad" } }],
        }),
      // complete() #3 — the RESTARTED free phase's round-0 turn (the QRY-12
      // follow-up appended to the held conversation): terminating text.
      () => assistantReply({ stopReason: "stop", text: "retry done" }),
      // complete() #4 — the repair attempt's FRESH forced respond dispatch:
      // the corrected, schema-valid payload.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-ok", name: toolName, arguments: { score: 9 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA_REPAIR1, ANTHROPIC_MODEL);

    // THE RESTART PIN (QRY-14 ¶3): four complete() calls — free phase, initial
    // respond, restarted free phase, fresh respond. Pre-fix the repair
    // re-drove the fused single-shot follow-up (2 calls total).
    expect(
      scripted.calls.length,
      "FOUR complete() calls — free phase, initial forced respond, RESTARTED " +
        "free phase, fresh forced respond (QRY-14 ¶3: each follow-up restarts " +
        "the whole two-phase loop; bug 0010 increment D)",
    ).toBe(4);

    // Call 3 — the restarted FREE PHASE: the QRY-12 follow-up template is the
    // held conversation's trailing user message, and NO toolChoice is set.
    const restarted = scripted.calls[2]!;
    const restartedMessages = contextMessagesOf(restarted);
    const restartedTrailing = restartedMessages[restartedMessages.length - 1]!;
    expect(restartedTrailing["role"], "the QRY-12 follow-up rides a user message").toBe(
      "user",
    );
    expect(
      messageText(restartedTrailing),
      "the restarted free phase's trailing message starts with the QRY-12 " +
        "validator_error non-compliance sentence + <ajv-summary> (QRY-12 bytes)",
    ).toMatch(
      /^Your previous response did not match the required schema\. Validation errors: /,
    );
    expect(
      messageText(restartedTrailing),
      "the follow-up carries the QRY-15-shaped instruction + schema suffix " +
        "(the shared instruction builder)",
    ).toContain(qry15Body(lowered, toolName));
    expect(
      messageText(restartedTrailing),
      "the follow-up is the QRY-12 validator_error template over the REAL AJV " +
        "issues, byte-exact (derived through the production renderer)",
    ).toBe(followUpText);
    expect(
      optionsOf(restarted)["toolChoice"],
      "the restarted free-phase call carries NO toolChoice (QRY-14 step 1)",
    ).toBeUndefined();

    // Call 4 — the FRESH forced respond dispatch over the GROWN held
    // conversation: [Ping, assistant, follow-up, assistant] + trailing QRY-15.
    const fresh = scripted.calls[3]!;
    expect(
      optionsOf(fresh)["toolChoice"],
      "the repair attempt terminates through a FRESH forced respond dispatch",
    ).toEqual({ type: "tool", name: toolName });
    const freshMessages = contextMessagesOf(fresh);
    expect(
      freshMessages.length,
      "the fresh dispatch's conversation is the grown held conversation " +
        "(opening prompt, free reply, follow-up, restarted reply) + trailing QRY-15",
    ).toBe(5);
    expect(
      messageText(freshMessages[0]),
      "the held conversation still opens at the ORIGINAL rendered prompt",
    ).toBe("Ping");
    expect(
      freshMessages.some(
        (message) => message["role"] === "user" && messageText(message) === followUpText,
      ),
      "the held conversation CONTAINS the QRY-12 follow-up user message (it grew)",
    ).toBe(true);
    // Respond traffic never joins the held conversation: the initial respond
    // exchange's assistant ToolCall reply is absent, and the QRY-15 template
    // appears exactly ONCE — as this dispatch's own trailing message (the
    // initial dispatch's trailing template did not leak in either).
    expect(
      anyMessageCarriesToolCall(freshMessages, toolName),
      "NO assistant message from the initial respond exchange joined the held " +
        "conversation (respond traffic never touches it — the off-session mirror " +
        "of SLSH-2)",
    ).toBe(false);
    expect(
      freshMessages.filter(
        (message) => messageText(message) === qry15Body(lowered, toolName),
      ).length,
      "the QRY-15 template appears exactly once — the fresh dispatch's own " +
        "trailing message",
    ).toBe(1);
    expect(
      messageText(freshMessages[freshMessages.length - 1]),
      "the fresh dispatch trails the QRY-15 template, byte-exact",
    ).toBe(qry15Body(lowered, toolName));

    expectValue(
      execution,
      { score: 9 },
      "the repair attempt's fresh respond dispatch supplies the corrected payload",
    );
  });

  it("(d9) untyped tool loop: a ToolCall round is serviced and the loop terminates on the next text turn — Ok('final answer'), TWO calls, no respond tool presented", async () => {
    scripted.queue = [
      // complete() #1 — round 0: an out-of-set tool call.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "t1", name: "ghost-tool", arguments: {} }],
        }),
      // complete() #2 — round 1: the terminating plain-text turn.
      () => assistantReply({ stopReason: "stop", text: "final answer" }),
    ];

    const execution = await driveTheta(UNTYPED_FN_THETA, ANTHROPIC_MODEL);

    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — the serviced tool round and the " +
        "terminating turn (QRY-13; pre-fix the off-session driver was single-shot " +
        "and resolved the tool-use reply's empty text as Ok(''))",
    ).toBe(2);
    // Untyped presents the callable set ONLY — empty here, and no respond tool
    // exists for an untyped query. Both `tools: []` and an absent `tools` key
    // are conforming spellings of "nothing to present", so EITHER passes.
    const tools = contextToolsOf(scripted.calls[0]!);
    expect(
      tools === undefined || tools.length === 0,
      "an untyped query presents the (empty) callable set only — no respond " +
        `tool; absent and [] both conform; observed: ${JSON.stringify(tools)}`,
    ).toBe(true);
    expect(
      optionsOf(scripted.calls[0]!)["signal"] instanceof AbortSignal,
      "the untyped free-phase call threads options.signal too (bug 0010 " +
        "§auth/signal threading covers every off-session complete())",
    ).toBe(true);
    expectValue(
      execution,
      "final answer",
      "the terminating turn's text resolves the untyped subagent-fn query (QRY-13)",
    );
  });

  it("(d10) exhaustion → forced respond (CIO-4): at max_rounds 1 the single tool round consumes the budget and the SECOND call IS the forced respond dispatch", async () => {
    const { toolName } = respondFixture();
    scripted.queue = [
      // complete() #1 — round 0: a tool round consuming the single slot.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "t1", name: "ghost-tool", arguments: {} }],
        }),
      // complete() #2 — CIO-4's max_rounds-final branch dispatches the exempt
      // forced respond terminator (never tool_loop_exhausted on a typed query).
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-r", name: toolName, arguments: { score: 7 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA_ROUNDS1, ANTHROPIC_MODEL);

    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — the budget-consuming tool round, then " +
        "the forced respond terminator; NO second free-phase call (QRY-16/CIO-4 " +
        "max_rounds-final branch)",
    ).toBe(2);
    expect(
      optionsOf(scripted.calls[1]!)["toolChoice"],
      "the second call IS the forced respond dispatch (toolChoice forced) — " +
        "the exempt terminator, not another free-phase round",
    ).toEqual({ type: "tool", name: toolName });
    expectValue(
      execution,
      { score: 7 },
      "the exhausted free phase terminates through the exempt forced respond turn (CIO-4)",
    );
  });

  it("(d11) max_rounds 0 boundary: ONE forced complete() whose SINGLE user message is the rendered prompt + U+000A + the QRY-15 template body", async () => {
    const { lowered, toolName } = respondFixture();
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-r", name: toolName, arguments: { score: 7 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA_MAX0, ANTHROPIC_MODEL);

    expect(
      scripted.calls.length,
      "at max_rounds 0 NO free-phase call is issued — the forced respond turn " +
        "is the ONLY complete() (QRY-14 step 2 boundary)",
    ).toBe(1);
    const call = scripted.calls[0]!;
    expect(
      optionsOf(call)["toolChoice"],
      "the single call is the forced respond dispatch (toolChoice forced)",
    ).toEqual({ type: "tool", name: toolName });
    const messages = contextMessagesOf(call);
    expect(
      messages.length,
      "the max_rounds: 0 respond conversation is a SINGLE user message " +
        "(no held conversation exists)",
    ).toBe(1);
    expect(messages[0]!["role"], "the fused single message rides the user role").toBe("user");
    expect(
      messageText(messages[0]),
      "the single message is the rendered prompt (right-trimmed of trailing " +
        "newlines) + one U+000A + the QRY-15 template body, byte-exact " +
        "(QRY-14 step 2 boundary; pre-fix it was the retired fused JSON-only text)",
    ).toBe("Ping" + "\n" + qry15Body(lowered, toolName));
    expectValue(execution, { score: 7 }, "the max_rounds: 0 typed query resolves the respond payload");
  });
});

describe("bug 0010 fix review (F1/F7b) — off-session cancellation surfacing and repair-arm coverage (cancellation.md §Surfacing, QRY-11 §non-validation)", () => {
  it("(d12) mid-flight abort during the FREE-PHASE complete(): the CANCEL terminal outcome — never Err(transport) — with exactly ONE complete() and no forced dispatch", async () => {
    // Fix review F1, off-session twin (regression pin). pi-ai RESOLVES an
    // abort — the adapter surfaces `stopReason: "aborted"` — and
    // `classifyOffSessionReply` folds every non-normal stop into the transport
    // arm, so pre-fix a mid-flight Esc during the off-session free phase
    // surfaced Err(transport) instead of the cancelled outcome. The typed loop
    // now maps a signal-aborted free-phase transport verdict to its CANCELLED
    // arm (cancellation.md §Surfacing: an aborted in-flight query returns
    // Err(kind:"cancelled"); error-model.md §Terminal outcomes) — and an
    // aborted query issues NO further provider dispatch.
    const { toolName } = respondFixture();
    const thetaAbort = new AbortController();
    scripted.queue = [
      // complete() #1 — the free-phase round-0 call: the abort lands WHILE the
      // call is in flight (the factory flips the theta signal), and pi-ai
      // resolves it as an aborted-stop reply.
      () => {
        thetaAbort.abort();
        return assistantReply({ stopReason: "aborted" });
      },
      // Defensive sticky-last: the contract forbids ANY dispatch after the
      // abort — a compliant respond reply here keeps a regressed post-abort
      // forced dispatch observable on the count pin (it would RESOLVE, so the
      // outcome pin below would red on a bound value too).
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-r", name: toolName, arguments: { score: 7 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL, { thetaAbort });

    expect(
      execution.outcome,
      "cancellation is its own TERMINAL OUTCOME — the cancel arm, never a " +
        "transport Err classified from the aborted-stop reply (bug 0010 fix " +
        "review F1, off-session twin)",
    ).toBe("cancel");
    expect(
      scripted.calls.length,
      "exactly ONE complete() — the aborted free-phase call; the aborted query " +
        "issues NO post-abort forced respond dispatch",
    ).toBe(1);
  });

  it("(d13) transport during the REPAIR attempt's fresh respond dispatch (r3 analogue): the proximate Err(transport) terminates repair — no attempts debit, attempt 2 never driven", async () => {
    // Fix review F7b: the off-session `driveRepairAttempt` transport arm,
    // pinned directly (its live twin is tests/typed-repair-two-phase.test.ts
    // (r3)). QRY-11 §non-validation / bug 0007: the proximate provider failure
    // terminates repair immediately with NO attempts debit — the second
    // budgeted attempt must never re-drive the dead provider.
    const { toolName } = respondFixture();
    scripted.queue = [
      // complete() #1 — the free phase terminates cleanly.
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      // complete() #2 — the INITIAL respond dispatch: AJV-rejected payload
      // opens respond-repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-bad", name: toolName, arguments: { score: "bad" } }],
        }),
      // complete() #3 — the restarted free phase's round-0 turn terminates.
      () => assistantReply({ stopReason: "stop", text: "retry done" }),
      // complete() #4 — the repair attempt's FRESH respond dispatch FAILS at
      // the transport layer. Sticky-last: a debited second attempt would keep
      // observing this failure and red the count pin.
      () => assistantReply({ stopReason: "error", errorMessage: "dead" }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA_REPAIR2, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.message,
      "the PROXIMATE transport error propagates verbatim (QRY-11 §non-validation: " +
        "'the proximate cause wins'; bug 0007 discipline on the off-session repair seam)",
    ).toBe("dead");
    expect(
      err.provider,
      "the repair respond dispatch's provider derives from the RESOLVED RESPOND " +
        "MODEL's api-shaped `.api` (queryerror-variants.md §provider derivation)",
    ).toBe("anthropic-messages");
    expect(err.http_status, "no HTTP status is observable at the complete() seam").toBeNull();
    expect(err.retryable, "an error-stop is a definite outcome — retryable: false").toBe(false);
    expect(
      scripted.calls.length,
      "exactly FOUR complete() calls — free phase, initial respond, restarted " +
        "free phase, failing fresh respond; the transport failure consumes NO " +
        "attempts slot, so the SECOND budgeted attempt never dispatches",
    ).toBe(4);
  });

  it("(d14) cancellation at the REPAIR boundary (r7 analogue): the CANCEL terminal outcome and NO post-abort dispatch — the fresh respond dispatch never fires", async () => {
    // Fix review F7b: the off-session `driveRepairAttempt` boundary-
    // cancellation arm, pinned directly (its live twin is
    // tests/typed-repair-two-phase.test.ts (r7)). The abort lands during the
    // RESTARTED free-phase turn; the drive's next repair boundary observes the
    // aborted theta signal and terminates the attempt as the CancelledError
    // (QRY-11 §non-validation: `cancelled` terminates repair with no debit) —
    // resolving to the CANCEL terminal outcome downstream, with NO post-abort
    // off-session dispatch (the increment-C/D r7 discipline).
    const { toolName } = respondFixture();
    const thetaAbort = new AbortController();
    scripted.queue = [
      // complete() #1 — the free phase terminates cleanly.
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      // complete() #2 — the INITIAL respond dispatch: AJV-rejected payload
      // opens respond-repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-bad", name: toolName, arguments: { score: "bad" } }],
        }),
      // complete() #3 — the RESTARTED free phase's round-0 turn: the abort
      // lands while this turn is in flight; the reply itself commits normally
      // (the cancellation is observed at the next repair boundary, not on the
      // reply).
      () => {
        thetaAbort.abort();
        return assistantReply({ stopReason: "stop", text: "retry reply" });
      },
      // Defensive sticky-last: ANY post-abort dispatch is forbidden — a
      // compliant respond reply here keeps a regressed fresh dispatch
      // observable on both the outcome and count pins.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-late", name: toolName, arguments: { score: 9 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA_REPAIR1, ANTHROPIC_MODEL, {
      thetaAbort,
    });

    expect(
      execution.outcome,
      "cancellation at the repair boundary is the CANCEL terminal outcome — " +
        "never Err(transport) and never a bound post-abort value (QRY-11 " +
        "§non-validation; error-model.md §Terminal outcomes)",
    ).toBe("cancel");
    expect(
      scripted.calls.length,
      "exactly THREE complete() calls — free phase, initial respond, the " +
        "aborted restarted free-phase turn; the aborted attempt issues NO " +
        "post-abort fresh respond dispatch",
    ).toBe(3);
  });

  it("(d15) mid-flight abort during the INITIAL forced respond dispatch's complete(): the CANCEL terminal outcome — never Err(transport 'cancelled') — with exactly TWO complete() calls", async () => {
    // Bug 0010 fix round 2, R2-4 (red-checking cell for the loop's forced-
    // respond guard). The abort lands WHILE the INITIAL respond dispatch's
    // complete() is in flight — after the dispatch-entry pre-abort gate
    // passed — and pi-ai RESOLVES it as an aborted-stop reply. The dispatch's
    // aborted-precedence arm folds that into the fixed transport-'cancelled'
    // shape, and `runTypedQueryLoop`'s forced-respond transport arm re-checks
    // the theta signal (query-tool-loop.ts, the signal-aborted → cancelled
    // guard this cell pins): with the signal aborted the outcome is the
    // CANCEL terminal outcome (cancellation.md §Surfacing; error-model.md
    // §Terminal outcomes), never Err(transport 'cancelled'). Disabling that
    // guard reds this cell on the outcome pin (fail + transport 'cancelled').
    // The transport half of the distinction — a reply-side aborted stop with
    // a NON-aborted theta signal stays Err(transport) — is pinned by
    // tests/typed-two-phase-live.test.ts (l).
    const { toolName } = respondFixture();
    const thetaAbort = new AbortController();
    scripted.queue = [
      // complete() #1 — the free phase terminates cleanly.
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      // complete() #2 — the INITIAL forced respond dispatch: the abort lands
      // while THIS call is in flight; pi-ai resolves it as an aborted-stop
      // reply (no matching ToolCall, so extraction cannot win).
      () => {
        thetaAbort.abort();
        return assistantReply({ stopReason: "aborted" });
      },
      // Defensive sticky-last: ANY post-abort dispatch is forbidden — a
      // compliant respond reply here keeps a regressed over-dispatch
      // observable on both the outcome and count pins.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-late", name: toolName, arguments: { score: 9 } }],
        }),
    ];

    const execution = await driveTheta(TYPED_FN_THETA, ANTHROPIC_MODEL, { thetaAbort });

    expect(
      execution.outcome,
      "an abort during the INITIAL respond dispatch is the CANCEL terminal " +
        "outcome — never a fail outcome carrying Err(transport 'cancelled') " +
        "(query-tool-loop.ts forced-respond signal-aborted guard; bug 0010 " +
        "fix round 2, R2-4)",
    ).toBe("cancel");
    expect(
      scripted.calls.length,
      "exactly TWO complete() calls — the free phase and the aborted INITIAL " +
        "respond dispatch; the aborted query issues NO further dispatch",
    ).toBe(2);
  });

  it("(d16) mid-flight abort during the REPAIR attempt's FRESH respond dispatch complete(): the CANCEL terminal outcome — never Err(transport 'cancelled') — with exactly FOUR complete() calls", async () => {
    // Bug 0010 fix round 2, R2-1 (regression pin). The abort lands WHILE the
    // repair attempt's FRESH forced respond dispatch is in flight — pi-ai
    // resolves it as an aborted-stop reply, the dispatch's aborted-precedence
    // arm folds it into transport-'cancelled', and `mapForcedTurnToRepairOutcome`
    // (threaded with the theta signal) maps a signal-aborted transport result
    // to `provider_failure: CancelledError` — the exact mirror of the loop's
    // forced-respond guard applied to the repair-side dispatch. QRY-11
    // §non-validation: `cancelled` terminates repair with no debit and the
    // propagated error resolves to the CANCEL terminal outcome downstream.
    // PRE-FIX: the mapping passed the raw TransportError 'cancelled' through,
    // so the abort surfaced as a FAIL outcome carrying Err(transport) — this
    // cell reds on the outcome pin when that mapping is disabled.
    const { toolName } = respondFixture();
    const thetaAbort = new AbortController();
    scripted.queue = [
      // complete() #1 — the free phase terminates cleanly.
      () => assistantReply({ stopReason: "stop", text: "thinking" }),
      // complete() #2 — the INITIAL respond dispatch: AJV-rejected payload
      // opens respond-repair.
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [{ id: "tc-bad", name: toolName, arguments: { score: "bad" } }],
        }),
      // complete() #3 — the restarted free phase's round-0 turn terminates.
      () => assistantReply({ stopReason: "stop", text: "retry done" }),
      // complete() #4 — the repair attempt's FRESH respond dispatch: the abort
      // lands while THIS call is in flight; pi-ai resolves it as an
      // aborted-stop reply (no matching ToolCall, so extraction cannot win).
      // Sticky-last doubles as the defence: with TWO attempts budgeted, a
      // debited/re-driven second attempt would keep observing this factory and
      // red the count pin.
      () => {
        thetaAbort.abort();
        return assistantReply({ stopReason: "aborted" });
      },
    ];

    const execution = await driveTheta(TYPED_FN_THETA_REPAIR2, ANTHROPIC_MODEL, {
      thetaAbort,
    });

    expect(
      execution.outcome,
      "an abort during the repair attempt's fresh respond dispatch is the " +
        "CANCEL terminal outcome — never a fail outcome carrying " +
        "Err(transport 'cancelled') (mapForcedTurnToRepairOutcome signal " +
        "threading; bug 0010 fix round 2, R2-1; QRY-11 §non-validation)",
    ).toBe("cancel");
    expect(
      scripted.calls.length,
      "exactly FOUR complete() calls — free phase, initial respond, restarted " +
        "free phase, the aborted fresh respond dispatch; the aborted attempt " +
        "debits nothing and the SECOND budgeted attempt never dispatches",
    ).toBe(4);
  });
});

// ===========================================================================
// Residual pin (bug 0010 fix review, F5; re-pinned by bug 0014) — the
// off-session degraded unlowerable-annotation arm keeps the fused single-shot
// mechanism, but since bug 0014 the `@<>` spelling that reached it is REJECTED
// at parse (theta/parse/empty-query-annotation, docs/bugs/0014-…), so the arm
// is unreachable from parsed source and survives only as seam-level totality
// over `lowerQueryResponseSchema`'s `undefined` contract. Two pins: the parse
// refusal that gates the old entry, and the arm's behaviour via the seam.
// ===========================================================================

describe("bug 0010 (residual pin, re-pinned by bug 0014) — off-session degraded unlowerable annotation (`@<>`): rejected at parse; the kept arm survives only as seam-level totality", () => {
  it("(deg-off) the `@<>` subagent-fn source is REJECTED at parse with theta/parse/empty-query-annotation — the load gate refuses it, so the fused complete() is unreachable from source", () => {
    // Bug 0014 (Option 1): the empty annotation — formerly this arm's ONLY
    // entry, accepted with no diagnostic — now fails at parse, so production
    // (production-composition.ts parseDiscoveredTheta, which drops any theta
    // carrying an error-severity theta/parse/* diagnostic) never registers or
    // drives it: no fused complete(), no unvalidated bind (end-to-end refusal
    // coverage: tests/empty-query-annotation.test.ts RT-off/RT-load).
    const source: ThetaSource = {
      path: "probe.theta",
      bytes: new TextEncoder().encode(UNLOWERABLE_FN_THETA),
    };
    const doc = parseThetaDocument(source, parseDeps());
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    expect(
      errors.map((d) => d.code),
      "the fixture that used to drive the degraded arm now parses with exactly " +
        "the bug-0014 rejection",
    ).toEqual([EMPTY_ANNOTATION_CODE]);
    expect(
      EMPTY_ANNOTATION_MESSAGE,
      "the registry row exists (DIAG-2) — code-registry-parse.md",
    ).toBeDefined();
    expect(
      errors[0]!.message,
      "DIAG-4: the emitted message is the registry row's normative Message",
    ).toBe(EMPTY_ANNOTATION_MESSAGE);
    expect(
      scripted.calls.length,
      "nothing was driven — ZERO fused complete() dispatches for the refused form",
    ).toBe(0);
  });

  it('(deg-off-seam) a directly-constructed schema:"" QueryExpr — the arm\'s only remaining entry — drives ONE fused complete() — typed-aware text, NO tools, NO toolChoice — and binds the parsed payload with NO AJV', async () => {
    // Seam-level totality (bug 0014 fix decision — the arm is KEPT): parse the
    // CLEAN `@<string>` twin, then blank the QueryExpr's schema to `""`
    // (bypassing parseQuery) so the arm's pinned behaviour stays visible while
    // it survives as totality over `lowerQueryResponseSchema`'s undefined arm.
    scripted.queue = [
      // The fused single-shot reply: JSON no schema sanctioned — it must bind
      // verbatim, proving the arm validates nothing.
      () =>
        assistantReply({
          stopReason: "stop",
          text: '{"unvalidated": true, "score": "not-a-number"}',
        }),
    ];

    const execution = await driveTheta(UNLOWERABLE_FN_THETA_SEAM_BASE, ANTHROPIC_MODEL, {
      mutateDoc: blankHelperQuerySchema,
    });

    expect(
      scripted.calls.length,
      "the degraded arm keeps the fused single-shot — exactly ONE complete()",
    ).toBe(1);
    const call = scripted.calls[0]!;
    const messages = contextMessagesOf(call);
    expect(messages.length, "the fused call carries a SINGLE user message").toBe(1);
    expect(
      messageText(messages[0]),
      "the fused message is the pre-0010 typed-aware text — the JSON-only " +
        "instruction with the (unlowerable, hence empty) shape inlined",
    ).toBe(
      "Ping\n\nRespond with ONLY a single minified JSON object matching this JSON " +
        "schema, and nothing else — no prose, no markdown, no code fences: ",
    );
    expect(
      contextToolsOf(call),
      "the fused call presents NO tools (no respond tool exists on this arm)",
    ).toBeUndefined();
    expect(
      optionsOf(call)["toolChoice"],
      "the fused call forces nothing — no toolChoice",
    ).toBeUndefined();
    // THE RESIDUAL: the text-parsed payload binds UNVALIDATED — no lowered
    // schema exists, so no schema-validation collaborator (and no AJV) is
    // built (bug doc Fix §Residuals; fix review F5). Acceptable ONLY because
    // bug 0014's parse rejection keeps this entry unreachable from source —
    // the arm is pure seam-level totality.
    expectValue(
      execution,
      { unvalidated: true, score: "not-a-number" },
      "the degraded off-session arm binds the parsed JSON verbatim — NO AJV runs",
    );
  });
});
