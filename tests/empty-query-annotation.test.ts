import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Bug 0014 — an empty typed-query annotation (`@<>`) parses with no diagnostic
// and binds its payload unvalidated through the retired fused mechanism
// (docs/bugs/0014-empty-typed-query-annotation-silent-unvalidated-bind.md).
//
// Spec: grammar.md §Type grammar — `Type ::=` derives NO empty alternative;
// type-system.md §Type expressions — "The same type grammar applies in every
// annotation position: … `@<T>`...`` explicit query schemas", so `@<>` is not a
// derivable form; query-forms.md QRY-3 — an explicit `@<Schema>` ascription
// "always supplies the response schema", which an empty ascription cannot do
// (worse: it BLOCKS the QRY-2 inference it overrides — the shadowing cell);
// query-failure-and-repair.md QRY-22 — "The runtime MUST NOT bind, as a typed
// query's value, a response that has not been validated against its declared
// schema"; diagnostics/diagnostic-shape.md DIAG-2 (the registry is closed — a
// new code is a registry row) and DIAG-4 (the Message column is normative —
// every expected message below is sourced from the registry via
// `registryMessage`, never copied prose).
//
// The defect (HEAD, bfd6f7c5 / v0.22.0 — probed): `parseQuery`'s `@<…>` arm
// (src/parser/theta-document.ts, `schema = parts.join("").trim()`) assigns the
// capture with no emptiness check, so every interior that trims to empty —
// `@<>`, `@<  >`, tab-only, newline-only, and an unterminated `@<` at EOF —
// parses with ZERO diagnostics and mints `QueryExpr.schema === ""`. `""` is
// the SOLE input for which `lowerQueryResponseSchema`
// (src/runtime/query-schema-lowering.ts) returns `undefined`, so both query
// drivers (live sendUserMessage path and off-session complete() path in
// src/extension/production-theta-producer.ts) take the retired pre-0010
// degraded fused arm and bind the text-parsed payload with NO AJV — QRY-22 is
// silently void for a query the runtime itself marks typed. Shadowing:
// `let x: Triage = @<>`…`?` keeps schema `""` and the real `Triage`
// annotation is silently ignored (both propagation sites and the QRY-2 sink
// fire only on `schema === null`; QRY-4's `checkLetMismatch` skips on `""`).
//
// PINNED POST-FIX CONTRACT (bug doc §Options, Option 1 — RED now, GREEN after;
// written red-at-HEAD first, the bug-0016/0015 test-first convention):
//   (a) registry — a NEW registered code `theta/parse/empty-query-annotation`,
//       severity E, phase parse, homed in
//       docs/spec_topics/diagnostics/code-registry-parse.md (a sibling of the
//       `empty-template` / `empty-schema-body` / `empty-enum-body` rows) and
//       transcribed into docs/reference/diagnostics.md. THE IMPLEMENTER adds
//       those rows; these cells source the expected message from the registry
//       (DIAG-4), so they stay red until the row exists. The message is
//       placeholder-free (byte-equal emission, the `empty-template` shape).
//   (b) parse — `parseThetaDocument` emits the code exactly once per empty
//       `@<…>` capture, for EVERY spelling whose interior trims to empty,
//       error severity, range located on the annotation span (the `@<…>`
//       region: the `@` sigil through the closing `>`, or through the last
//       consumed token for the unterminated form).
//   (c) controls — non-empty annotations (`@<string>`, `@<Triage>`), the bare
//       untyped form, the guarded empty `let` annotation (`let r: = @`…``),
//       and `invoke<>` (whose capture normalises to `null` at parse —
//       src/parser/theta-document.ts `parseInvoke`) stay clean: the new code
//       must NOT fire for them. Green at HEAD AND post-fix.
//   (d) runtime consequence — a theta carrying the form is REFUSED before any
//       model turn. The production refusal seam: production-composition.ts
//       `parseDiscoveredTheta` drops (never registers) any theta whose
//       diagnostics contain an error-severity `theta/parse/*` / `theta/load/*`
//       entry (`hasLoadParseError`; the same gate bug 0003's parse rejections
//       ride). Post-fix the `@<>` theta hits that gate, so NO fused
//       sendUserMessage turn is driven (live), NO fused complete() dispatches
//       (off-session), and the unsanctioned payload never binds. AT HEAD these
//       cells are red precisely because the parse is silent, the gate admits
//       the theta, the fused turn DOES drive and the payload DOES bind
//       verbatim (the documented QRY-22 violation the bug-0010 residual pins
//       (deg-live)/(deg-off) currently normalise).
//   (e) defence in depth — `lowerQueryResponseSchema("")` stays `undefined`
//       (the seam's total-function contract is unchanged under Option 1).
//
// Method: the parse cells drive the production whole-file parser
// (`parseThetaDocument`) exactly as tests/shadowed-callable-call.test.ts; the
// runtime cells reuse the mocked-session / mocked-complete() harnesses of the
// bug-0010 residual pins (tests/typed-two-phase-live.test.ts (deg-live),
// tests/off-session-two-phase.test.ts (deg-off)) with the load gate mirrored
// in front of the drive (the gate's `hasLoadParseError` is not exported, so
// the predicate is mirrored byte-for-byte and the REAL seam is additionally
// driven end-to-end through `discoverAndComposeFixtures` in cell RT-load).
// Deterministic; no live network.

// The recorded off-session `complete()` calls and the scripted reply queue.
// `vi.hoisted` so the `vi.mock` factory (hoisted above the imports) can close
// over a mutable holder each cell sets (the bug-0010 suite pattern).
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
      // Sticky-last consumption (the bug-0007 suite discipline): over-driving
      // stays observable as a CALL-COUNT assertion, not a harness throw.
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ModelRegistry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type Block,
  type Expr,
  type InvokeExpr,
  type ParseThetaDocumentDeps,
  type QueryExpr,
  type Stmt,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import type { ThetaFixture } from "../src/extension/factory";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";

// ===========================================================================
// The registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

const EMPTY_ANNOTATION_CODE = "theta/parse/empty-query-annotation";
const FILE = "bug0014.theta";

interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
const REGISTRY_TEXT = [
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
  .join("\n");

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

/**
 * The registry row's normative Message string (DIAG-4) — `undefined` at HEAD
 * because the row does not exist yet; the asserting cells check definedness
 * FIRST so the red output names the missing registry row, never a bare
 * undefined-comparison.
 */
const NORMATIVE_MESSAGE = registryMessage(REGISTRY, EMPTY_ANNOTATION_CODE) as
  | string
  | undefined;

// ===========================================================================
// Parse-layer harness (the tests/shadowed-callable-call.test.ts makeDeps
// pattern).
// ===========================================================================

/** The frontmatter prelude — occupies source lines 1–3; the body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parseSource(src: string): ThetaDocument {
  const source: ThetaSource = { path: FILE, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic[] {
  return diags.filter((d) => d.code === code);
}

function errorCodesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

/**
 * Every expression of a parsed body, restricted to the statement / container
 * kinds these fixtures produce (`let` inits, `fn` bodies, expression
 * statements, postfix-`?` operands). Anything the walk misses fails the loud
 * count guards in the callers rather than passing silently.
 */
function collectExprs(doc: ThetaDocument): Expr[] {
  const found: Expr[] = [];
  const visitExpr = (e: Expr): void => {
    found.push(e);
    if (e.kind === "try") {
      visitExpr(e.operand);
    }
  };
  const visitBlock = (b: Block): void => {
    for (const s of b.statements) {
      visitStmt(s);
    }
    if (b.tail !== null) {
      visitExpr(b.tail);
    }
  };
  const visitStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        if (s.init !== null) {
          visitExpr(s.init);
        }
        return;
      case "fn":
        visitBlock(s.body);
        return;
      case "query":
        visitExpr(s.query);
        return;
      case "expr":
        visitExpr(s.expr);
        return;
      default:
        return;
    }
  };
  visitBlock(doc.body);
  return found;
}

/** The single `QueryExpr` in a parsed doc; fails loudly on any other count. */
function onlyQueryOf(doc: ThetaDocument): QueryExpr {
  const queries = collectExprs(doc).filter((e): e is QueryExpr => e.kind === "query");
  expect(queries.length, "fixture guard: expected exactly one query expression").toBe(1);
  return queries[0]!;
}

/** The single `InvokeExpr` in a parsed doc; fails loudly on any other count. */
function onlyInvokeOf(doc: ThetaDocument): InvokeExpr {
  const invokes = collectExprs(doc).filter((e): e is InvokeExpr => e.kind === "invoke");
  expect(invokes.length, "fixture guard: expected exactly one invoke expression").toBe(1);
  return invokes[0]!;
}

/** A 1-indexed, end-exclusive-column source range literal (the 0016 helper). */
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

/** Where the diagnostic's annotation-span range must sit for one spelling. */
interface AnnotationSpanExpectation {
  /**
   * Exact pin of the whole span — the `@` sigil through the closing `>`
   * (end-exclusive) — for the spellings whose column arithmetic is stable.
   */
  readonly exact?: SourceRange;
  /** The `@` sigil position — the span's pinned START (every spelling). */
  readonly at: { readonly line: number; readonly column: number };
  /**
   * The line the span must END on, where the spelling makes it knowable
   * without pinning lexer tab-width / token-end detail (the newline-interior
   * spelling closes its `>` on the next line).
   */
  readonly endLine?: number;
}

/**
 * Assert the bug-0014 rejection for one parse cell: exactly one
 * `theta/parse/empty-query-annotation` — error severity, correct file, the
 * registry row's normative message (DIAG-4; definedness asserted first so the
 * missing-row state reads as itself), and the range on the annotation span.
 * The PRIMARY assertion's failure message carries the observed diagnostics
 * array and the minted `QueryExpr.schema`, so the red-at-HEAD output shows the
 * documented defect: ZERO diagnostics and `schema: ""`.
 */
function expectEmptyAnnotationDiagnostic(
  doc: ThetaDocument,
  spelling: string,
  span: AnnotationSpanExpectation,
  extraDefectNote = "",
): void {
  const query = onlyQueryOf(doc);
  const hits = withCode(doc.diagnostics, EMPTY_ANNOTATION_CODE);
  expect(
    hits.length,
    `PRIMARY (bug 0014, Option 1): parseThetaDocument must emit exactly one ` +
      `${EMPTY_ANNOTATION_CODE} for ${spelling} — the type grammar derives no empty type ` +
      `(grammar.md §Type grammar; type-system.md §Type expressions). AT HEAD the parse is ` +
      `SILENT: observed diagnostics ${JSON.stringify(doc.diagnostics)}, and the parser minted ` +
      `the typed marker QueryExpr.schema = ${JSON.stringify(query.schema)} — the SOLE input ` +
      `lowerQueryResponseSchema cannot lower, so the runtime binds the response with NO AJV ` +
      `(QRY-22)${extraDefectNote}`,
  ).toBe(1);
  const d = hits[0]!;
  expect(d.severity, "the registered severity is E — the form must not load").toBe("error");
  expect(d.file, "the diagnostic is located in the parsed file").toBe(FILE);
  expect(
    NORMATIVE_MESSAGE,
    `DIAG-2/DIAG-4: docs/spec_topics/diagnostics/code-registry-parse.md must carry a normative ` +
      `Message row for ${EMPTY_ANNOTATION_CODE} (a sibling of the empty-template / ` +
      `empty-schema-body rows); at HEAD the row is absent`,
  ).toBeDefined();
  expect(
    d.message,
    "DIAG-4: the emitted message is byte-identical to the registry row's Message column",
  ).toBe(NORMATIVE_MESSAGE);
  expect(
    d.range,
    "the diagnostic is located on the annotation span (the `@<…>` region)",
  ).toBeDefined();
  if (span.exact !== undefined) {
    expect(
      d.range,
      "the range covers the whole annotation span — the `@` sigil through the closing `>` " +
        "(1-indexed, end-exclusive)",
    ).toEqual(span.exact);
    return;
  }
  expect(
    d.range!.start,
    "the annotation span starts at the `@` sigil that introduces the annotated query",
  ).toEqual({ line: span.at.line, column: span.at.column });
  const end = d.range!.end;
  expect(
    end.line > span.at.line || (end.line === span.at.line && end.column > span.at.column),
    `the annotation span is non-empty; observed range ${JSON.stringify(d.range)}`,
  ).toBe(true);
  if (span.endLine !== undefined) {
    expect(
      end.line,
      "the span ends on the closing `>`'s line (the annotation region, not just its head)",
    ).toBe(span.endLine);
  }
}

/**
 * The production load gate, mirrored: production-composition.ts
 * `parseDiscoveredTheta` drops (never registers) a theta whose diagnostics
 * contain an error-severity `theta/load/*` / `theta/parse/*` entry
 * (`hasLoadParseError` — not exported, so the predicate is mirrored
 * byte-for-byte here; cell RT-load drives the REAL seam end-to-end). The
 * runtime cells drive the theta exactly when this gate would have admitted
 * it, so at HEAD (silent parse) they reproduce the production drive and
 * post-fix they reproduce the production refusal.
 */
function productionLoadGateRefuses(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.code.startsWith("theta/load/") ||
        diagnostic.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// Runtime harness (trimmed from the bug-0010 residual-pin suites:
// tests/typed-two-phase-live.test.ts (deg-live) and
// tests/off-session-two-phase.test.ts (deg-off)).
// ===========================================================================

/** The user session's selected model (`ctx.model`). */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/**
 * The reply JSON that NO schema sanctioned — the (deg-live)/(deg-off) probe
 * payload. At HEAD it binds VERBATIM as the typed query's Ok value; post-fix
 * it must never bind because the theta never runs.
 */
const UNSANCTIONED_PAYLOAD = { unvalidated: true, score: "not-a-number" };
const UNSANCTIONED_PAYLOAD_TEXT = '{"unvalidated": true, "score": "not-a-number"}';

/**
 * The LIVE-path fixture — byte-identical to the (deg-live) suite's
 * TYPED_LIVE_THETA_UNLOWERABLE, whose top-level `@<>` query drives the
 * user-visible seam.
 */
const LIVE_EMPTY_ANNOTATION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "let v = @<>`Ping`?",
  "v",
  "",
].join("\n");

/**
 * The OFF-SESSION fixture — byte-identical to the (deg-off) suite's
 * UNLOWERABLE_FN_THETA: the `@<>` query lives in a `subagent fn` body, so it
 * drives the in-process off-session host through `complete()`.
 */
const OFF_EMPTY_ANNOTATION_FN_THETA = [
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

/** The scripted trailing assistant message one driven live turn commits. */
interface ScriptedAssistantReply {
  readonly stopReason: string;
  readonly text?: string;
}

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/**
 * The live user-session double the fused turn would drive (trimmed from the
 * (deg-live) harness): `sendUserMessage` commits the user entry and marks the
 * session streaming; `tick()` (from the injected Clock's `setTimeout`)
 * completes the in-flight turn with the scripted reply. A turn completing
 * against an EMPTY reply queue throws loudly (no silent skips).
 */
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  /** Proof of user-visible traffic — the post-fix refusal pins this at 0. */
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];

  #idle = true;
  #completedTurns = 0;
  readonly #replies: readonly ScriptedAssistantReply[];

  constructor(replies: readonly ScriptedAssistantReply[]) {
    this.#replies = [...replies];
  }

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({
      role: "user",
      content: [{ type: "text", text: content }],
      timestamp: 0,
    });
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn (inert while idle). */
  tick(): void {
    if (this.#idle) {
      return;
    }
    if (this.#replies.length === 0) {
      throw new Error(
        "live session double: a driven turn completed with an EMPTY reply queue",
      );
    }
    const reply =
      this.#replies[Math.min(this.#completedTurns, this.#replies.length - 1)]!;
    this.#completedTurns += 1;
    this.#append({
      role: "assistant",
      content: reply.text !== undefined ? [{ type: "text", text: reply.text }] : [],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: reply.stopReason,
      timestamp: 0,
    });
    this.#idle = true;
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

/** A recording `ExtensionAPI` double (registerTool capture; session routing). */
class RecordingPi {
  readonly registeredTools: ToolDefinition[] = [];
  readonly api: ExtensionAPI;

  constructor(session: LiveSessionDouble) {
    const record = this;
    this.api = {
      sendUserMessage: (content: string): void => session.sendUserMessage(content),
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
      registerTool: (tool: ToolDefinition): void => {
        record.registeredTools.push(tool);
      },
      on: (): void => {},
      sendMessage: (): void => {},
    } as unknown as ExtensionAPI;
  }
}

/** The production AJV validator — present in the root so its NON-use is real. */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * A runtime-root double covering BOTH drive shapes: the live clock's
 * `setTimeout` first `tick()`s the session double (completing any in-flight
 * streamed turn) then fires the callback synchronously; the off-session drive
 * reads only `wallNow`.
 */
function rootDouble(session: LiveSessionDouble | undefined): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => "inv-1",
      newToolCallId: (): string => "tc-1",
    },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session?.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

function registryDouble(): ModelRegistry {
  return {
    getAvailable: () => [ANTHROPIC_MODEL],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/** The live dispatch ctx: session model + the committed-transcript surface. */
function ctxLive(session: LiveSessionDouble): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** The off-session dispatch ctx (the (deg-off) harness shape — no idle surface). */
function ctxOff(): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

function compositionInput(doc: ThetaDocument): ThetaCompositionInput {
  return {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
}

/**
 * Drive one ADMITTED theta through the production prompt-mode binding against
 * the LIVE seam — called only when the mirrored load gate admits the parse,
 * i.e. exactly when production would have registered and driven it.
 */
async function driveAdmittedLive(
  doc: ThetaDocument,
  session: LiveSessionDouble,
  pi: RecordingPi,
): Promise<BodyExecution> {
  const deps = createProductionProducerDeps({
    pi: pi.api,
    root: rootDouble(session),
    modelRegistry: registryDouble(),
  });
  const binding = deps.bindPromptConversation({
    theta: compositionInput(doc),
    args: "",
    ctx: ctxLive(session),
  });
  expect(
    binding.drivenAgainst,
    "harness guard: the fixture must bind the LIVE prompt-mode drive",
  ).toBe("prompt-user-session");
  return executeBody(doc.body, binding.executeDeps);
}

/** Drive one ADMITTED theta whose `subagent fn` body runs off-session. */
async function driveAdmittedOff(
  doc: ThetaDocument,
  pi: RecordingPi,
): Promise<BodyExecution> {
  const deps = createProductionProducerDeps({
    pi: pi.api,
    root: rootDouble(undefined),
    modelRegistry: registryDouble(),
  });
  const binding = deps.bindPromptConversation({
    theta: compositionInput(doc),
    args: "",
    ctx: ctxOff(),
  });
  return executeBody(doc.body, binding.executeDeps);
}

/** An `AssistantMessage`-shaped reply for the mocked `complete()`. */
function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
}): Record<string, unknown> {
  return {
    role: "assistant",
    content: fields.text !== undefined ? [{ type: "text", text: fields.text }] : [],
    api: "anthropic-messages",
    stopReason: fields.stopReason,
    timestamp: 0,
  };
}

/** Extract a message's text (string content or text-part array), non-asserting. */
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

/** The user-message texts of every recorded `complete()` call (for red output). */
function recordedCompleteTexts(): string[] {
  return scripted.calls.map((call) => {
    const context = call.context as { readonly messages?: unknown };
    return Array.isArray(context.messages)
      ? context.messages.map(messageText).join(" | ")
      : "<no messages array>";
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
// Registry contract (DIAG-2) — RED at HEAD: the row does not exist.
// ===========================================================================

describe("bug 0014 registry contract — theta/parse/empty-query-annotation is a registered parse code (DIAG-2)", () => {
  it("RED REG: the parse registry carries the new row — severity E, phase parse, non-empty normative Message", () => {
    const row = REGISTRY.find((r) => r.code === EMPTY_ANNOTATION_CODE);
    expect(
      row,
      `DIAG-2 (the registry is closed — adding a code is a spec change): ` +
        `docs/spec_topics/diagnostics/code-registry-parse.md must carry a row for ` +
        `${EMPTY_ANNOTATION_CODE} (transcribed into docs/reference/diagnostics.md); ` +
        `at HEAD (bfd6f7c5) the row is ABSENT — no existing code fits the empty ` +
        `annotation form (bug doc §Expected behaviour, DIAG bullet)`,
    ).toBeDefined();
    expect(row!.severity, "the form must not load — severity E").toBe("E");
    expect(row!.phase, "emitted in parseQuery's `@<…>` arm — phase parse").toBe("parse");
    expect(
      row!.message.length,
      "the Message column is normative (DIAG-4) and non-empty",
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Parse layer — every spelling whose interior trims to empty fires the SAME
// code. RED at HEAD: zero diagnostics, schema "" minted (probed).
// ===========================================================================

describe("bug 0014 (b) parse layer — every empty `@<…>` spelling fires theta/parse/empty-query-annotation", () => {
  it("RED P1: `@<>` — the canonical spelling; exact annotation-span range", () => {
    // Line 4: `let r = @<>`classify this`` — `@` col 9, `<` 10, `>` 11; the
    // annotation span is 4:9–4:12 (end-exclusive).
    const doc = parseSource(FM + "let r = @<>`classify this`\nr\n");
    expectEmptyAnnotationDiagnostic(doc, "`@<>`", {
      at: { line: 4, column: 9 },
      exact: range(4, 9, 4, 12),
    });
  });

  it("RED P2: `@<  >` — whitespace-only interior trims to empty; exact span", () => {
    // Line 4: `let r = @<  >`…`` — `>` at col 13; span 4:9–4:14.
    const doc = parseSource(FM + "let r = @<  >`classify this`\nr\n");
    expectEmptyAnnotationDiagnostic(doc, "`@<  >` (space-only interior)", {
      at: { line: 4, column: 9 },
      exact: range(4, 9, 4, 14),
    });
  });

  it("RED P3: `@<\\t>` — tab-only interior trims to empty", () => {
    // A REAL tab char in the source. Tab column-width is lexer detail, so the
    // span is pinned by its start (`@` at 4:9) and its line, not exact end.
    const doc = parseSource(FM + "let r = @<\t>`classify this`\nr\n");
    expectEmptyAnnotationDiagnostic(doc, "`@<\\t>` (tab-only interior)", {
      at: { line: 4, column: 9 },
      endLine: 4,
    });
  });

  it("RED P4: `@<\\n>` — newline-only interior trims to empty; the span reaches the closing `>`'s line", () => {
    // A REAL newline inside the brackets: line 4 `let r = @<`, line 5 `>`…``.
    const doc = parseSource(FM + "let r = @<\n>`classify this`\nr\n");
    expectEmptyAnnotationDiagnostic(doc, "`@<` newline `>` (newline-only interior)", {
      at: { line: 4, column: 9 },
      endLine: 5,
    });
  });

  it("RED P5: unterminated `@<` at EOF — the capture runs to end of input and still trims to empty", () => {
    // The file ends immediately after `<` (no closing `>`, no template). At
    // HEAD this ALSO parses with zero diagnostics and mints schema "".
    const doc = parseSource(FM + "let r = @<");
    expectEmptyAnnotationDiagnostic(doc, "unterminated `@<` at EOF", {
      at: { line: 4, column: 9 },
    });
  });

  it("RED P6: shadowing — `let x: Triage = @<>`Assess`?` fires the code (the real `Triage` annotation is otherwise silently ignored)", () => {
    // Lines: 4–6 the Triage schema decl, 7 the shadowed binding. `@` at 7:17,
    // `<` 18, `>` 19 — span 7:17–7:20. AT HEAD: zero diagnostics, the query
    // keeps schema "" and the declared `Triage` never validates anything —
    // the empty explicit form blocks the direct-let propagation AND the QRY-2
    // inference (both fire only on schema === null), and QRY-4's
    // checkLetMismatch skips silently on "" (bug doc §Affected).
    const doc = parseSource(
      FM + "schema Triage {\n  severity: string\n}\nlet x: Triage = @<>`Assess`?\nx\n",
    );
    const letStmt = doc.body.statements.find(
      (s): s is Extract<Stmt, { kind: "let" }> => s.kind === "let",
    );
    expectEmptyAnnotationDiagnostic(
      doc,
      "`let x: Triage = @<>`…`?` (the shadowing case)",
      { at: { line: 7, column: 17 }, exact: range(7, 17, 7, 20) },
      `; the binding's REAL annotation ${JSON.stringify(letStmt?.annotation)} is silently ` +
        `ignored — deleting the stray @<> would make the program strictly safer`,
    );
  });
});

// ===========================================================================
// Controls — green at HEAD AND post-fix: the new code must fire ONLY for an
// empty `@<…>` capture.
// ===========================================================================

describe("bug 0014 (c) controls — non-empty and untyped forms stay clean; the new code must not fire", () => {
  it("control C1 (green): `@<string>` parses clean with schema \"string\"", () => {
    const doc = parseSource(FM + "let r = @<string>`classify this`\nr\n");
    expect(doc.diagnostics, "a non-empty primitive annotation is diagnostic-free").toEqual([]);
    expect(onlyQueryOf(doc).schema, "the annotation text is captured verbatim").toBe("string");
  });

  it("control C2 (green): `@<Triage>` against a declared schema parses clean with schema \"Triage\"", () => {
    const doc = parseSource(
      FM + "schema Triage {\n  severity: string\n}\nlet r = @<Triage>`classify this`\nr\n",
    );
    expect(doc.diagnostics, "a named-schema annotation is diagnostic-free").toEqual([]);
    expect(onlyQueryOf(doc).schema).toBe("Triage");
  });

  it("control C3 (green): the bare untyped `@`…`` keeps schema null, diagnostic-free", () => {
    const doc = parseSource(FM + "let r = @`classify this`\nr\n");
    expect(doc.diagnostics, "the untyped form is diagnostic-free").toEqual([]);
    expect(onlyQueryOf(doc).schema, "no annotation — schema null").toBeNull();
  });

  it("control C4 (green): an empty `let` annotation (`let r: = @`…``) keeps the query untyped — the propagation guard holds and the new code must NOT fire", () => {
    // The empty-annotation guard lives on the `let` propagation sites (bug doc
    // §Affected: parseLet propagates only length > 0), so the query stays
    // schema null. The new code targets the `@<…>` capture ONLY — an empty
    // LET annotation is a different (out-of-scope) gap and must not trip it.
    const doc = parseSource(FM + "let r: = @`classify this`\nr\n");
    expect(
      withCode(doc.diagnostics, EMPTY_ANNOTATION_CODE),
      "the new code fires only in parseQuery's `@<…>` arm — never for a `let` annotation",
    ).toEqual([]);
    expect(
      onlyQueryOf(doc).schema,
      "the empty let annotation must NOT propagate onto the query (guarded; stays untyped)",
    ).toBeNull();
  });

  it("control C5 (green): `invoke<>` keeps its parse-time normalisation to returnSchema null — the contrast arm the new code must NOT fire for", () => {
    // parseInvoke guards its identical angle-bracket capture
    // (`returnSchema = annotation.length > 0 ? annotation : null`) — the
    // in-file asymmetry that is the bug's root cause in one line. The fix
    // rejects the QUERY form only; invoke's silent normalisation is a
    // documented non-goal and must stay byte-stable.
    const doc = parseSource(FM + 'let r = invoke<>("./helper.theta")\nr\n');
    expect(doc.diagnostics, "invoke<> parses diagnostic-free").toEqual([]);
    expect(
      onlyInvokeOf(doc).returnSchema,
      "the empty invoke capture normalises to null (untyped) at parse",
    ).toBeNull();
  });

  it("control C6 (green, defence in depth): lowerQueryResponseSchema's undefined arm stays — \"\" (and whitespace) is the sole unlowerable input; \"string\" lowers", () => {
    // Option 1 keeps the lowering's total-function contract unchanged (bug doc
    // §Non-goals): the seam stays as defence in depth behind the parse gate.
    expect(
      lowerQueryResponseSchema("", []),
      "the empty annotation has no lowerable shape — undefined",
    ).toBeUndefined();
    expect(
      lowerQueryResponseSchema("  ", []),
      "a whitespace-only annotation trims to empty — undefined",
    ).toBeUndefined();
    expect(
      lowerQueryResponseSchema("string", []),
      "every non-empty annotation lowers (permissively for unresolved names, bug 0004)",
    ).toEqual({ type: "string" });
  });
});

// ===========================================================================
// Runtime consequence — the empty form is refused BEFORE any model turn.
// RED at HEAD: the parse is silent, the load gate admits the theta, the
// retired fused mechanism drives, and the unsanctioned payload binds with NO
// AJV (the documented QRY-22 violation).
// ===========================================================================

describe("bug 0014 (d) runtime consequence — a `@<>` theta is refused before any model turn (QRY-22)", () => {
  it("RED RT-live: the live path drives NO fused user-visible turn and never binds the unsanctioned payload", async () => {
    const doc = parseSource(LIVE_EMPTY_ANNOTATION_THETA);
    expect(
      doc.frontmatter,
      "fixture guard: the theta must carry parseable frontmatter",
    ).not.toBeNull();
    const refused = productionLoadGateRefuses(doc.diagnostics);
    const session = new LiveSessionDouble([
      // The fused turn's streamed reply: JSON that NO schema sanctioned. Only
      // the HEAD-reality drive consumes it; post-fix no turn ever completes.
      { stopReason: "stop", text: UNSANCTIONED_PAYLOAD_TEXT },
    ]);
    const pi = new RecordingPi(session);
    scripted.queue = []; // any off-session complete() dispatch throws loudly
    let execution: BodyExecution | undefined;
    if (!refused) {
      // HEAD reality: the load gate admits the parse-silent theta (production
      // registers it), so the drive proceeds exactly as a registered /probe
      // would — reproducing the (deg-live) degraded fused mechanism.
      execution = await driveAdmittedLive(doc, session, pi);
    }
    const bound = execution?.result.value;

    expect(
      session.sendUserMessageCalls,
      "POST-FIX CONTRACT (bug 0014, Option 1): the theta is refused at the parse gate BEFORE " +
        "any model turn — ZERO user-visible sendUserMessage turns. AT HEAD the retired " +
        "pre-0010 fused mechanism drives ONE JSON-in-text turn and binds the reply with NO " +
        `AJV (QRY-22 violation). Observed: sentQueryTexts=${JSON.stringify(session.sentQueryTexts)}; ` +
        `bound final value=${JSON.stringify(bound)}; parse diagnostics=${JSON.stringify(doc.diagnostics)}`,
    ).toBe(0);
    expect(
      scripted.calls.length,
      "no off-session complete() dispatch exists for the refused form",
    ).toBe(0);
    expect(
      pi.registeredTools.length,
      "no respond tool is ever registered for the refused form",
    ).toBe(0);
    expect(
      bound,
      "the unsanctioned payload — JSON no schema sanctioned — must NEVER bind as the typed " +
        "query's value (QRY-22: MUST NOT bind a response not validated against the declared schema)",
    ).not.toEqual(UNSANCTIONED_PAYLOAD);
    expect(
      refused,
      "the production refusal seam: parseDiscoveredTheta (production-composition.ts) drops a " +
        "theta carrying an error-severity theta/parse/* diagnostic, so it never registers and " +
        `never runs; observed parse diagnostics=${JSON.stringify(doc.diagnostics)}`,
    ).toBe(true);
    expect(
      errorCodesOf(doc),
      "the refusal is the NEW registered code, emitted at parse",
    ).toContain(EMPTY_ANNOTATION_CODE);
  });

  it("RED RT-off: the off-session path dispatches NO fused complete() and never binds the unsanctioned payload", async () => {
    const doc = parseSource(OFF_EMPTY_ANNOTATION_FN_THETA);
    expect(
      doc.frontmatter,
      "fixture guard: the theta must carry parseable frontmatter",
    ).not.toBeNull();
    const refused = productionLoadGateRefuses(doc.diagnostics);
    const session = new LiveSessionDouble([]); // off-session: NO live replies exist
    const pi = new RecordingPi(session);
    // The fused single-shot reply (consumed only by the HEAD-reality drive).
    scripted.queue = [
      () => assistantReply({ stopReason: "stop", text: UNSANCTIONED_PAYLOAD_TEXT }),
    ];
    let execution: BodyExecution | undefined;
    if (!refused) {
      // HEAD reality: the gate admits the parse-silent theta and the
      // `subagent fn` body's `@<>` query rides the (deg-off) fused
      // single-shot complete().
      execution = await driveAdmittedOff(doc, pi);
    }
    const bound = execution?.result.value;

    expect(
      scripted.calls.length,
      "POST-FIX CONTRACT (bug 0014, Option 1): the theta is refused at the parse gate BEFORE " +
        "any model turn — ZERO fused complete() dispatches. AT HEAD exactly ONE fused " +
        "complete() fires (single user message, no tools, no toolChoice) and its text-parsed " +
        `reply binds with NO AJV (QRY-22 violation). Observed: fused message texts=` +
        `${JSON.stringify(recordedCompleteTexts())}; bound final value=${JSON.stringify(bound)}; ` +
        `parse diagnostics=${JSON.stringify(doc.diagnostics)}`,
    ).toBe(0);
    expect(
      session.sendUserMessageCalls,
      "the off-session path touches no user-visible session surface either way (SLSH-2)",
    ).toBe(0);
    expect(
      bound,
      "the unsanctioned payload must NEVER bind as the typed query's value (QRY-22)",
    ).not.toEqual(UNSANCTIONED_PAYLOAD);
    expect(
      refused,
      "the production refusal seam: parseDiscoveredTheta drops the theta at load; observed " +
        `parse diagnostics=${JSON.stringify(doc.diagnostics)}`,
    ).toBe(true);
    expect(
      errorCodesOf(doc),
      "the refusal is the NEW registered code, emitted at parse",
    ).toContain(EMPTY_ANNOTATION_CODE);
  });

  it("RED RT-load: the REAL production load seam (discoverAndComposeFixtures) refuses to register the `@<>` theta and surfaces the registered message", async () => {
    // The end-to-end realisation of the refusal the two cells above mirror:
    // plant the fixture on disk under a project `.pi/theta/` discovery source
    // (the tests/production-tools-load-resolution.test.ts harness), run the
    // PRODUCTION COMPOSE HELPER, and require the theta to be dropped with its
    // diagnostic surfaced through ctx.ui.notify (makeLoadEmit routes
    // error-severity drops there). AT HEAD the parse is silent, so the theta
    // REGISTERS as a runnable slash command.
    const workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0014-"));
    try {
      const projectThetaDir = join(workspaceDir, ".pi", "theta");
      mkdirSync(projectThetaDir, { recursive: true });
      // A clean control theta: proves the discovery walk found the workspace,
      // so the not-registered assertion below can never pass vacuously.
      writeFileSync(
        join(projectThetaDir, "goodctl.theta"),
        "---\nmode: prompt\n---\n@`hi`\n",
        "utf8",
      );
      writeFileSync(
        join(projectThetaDir, "emptyann.theta"),
        LIVE_EMPTY_ANNOTATION_THETA,
        "utf8",
      );
      const notifications: string[] = [];
      const pi = {
        getFlag: (): undefined => undefined,
        getCommands: (): readonly unknown[] => [],
        sendMessage: (): void => {},
        sendUserMessage: (): void => {},
        getActiveTools: (): readonly string[] => [],
        setActiveTools: (): void => {},
      } as unknown as ExtensionAPI;
      const ctx = {
        cwd: workspaceDir,
        // Interactive posture so the drop path does not also mirror to stderr
        // (the no-UI arm); the observable under test is ui.notify.
        hasUI: true,
        modelRegistry: { getAvailable: (): readonly unknown[] => [] },
        ui: {
          notify: (message: string, _type: "error"): void => {
            notifications.push(message);
          },
        },
      } as unknown as ExtensionContext;

      const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
      const registered = fixtures.map((f) => f.slashName);

      expect(
        registered,
        "setup guard: the project .pi/theta/ discovery walk must register the clean control " +
          `theta; registered=${JSON.stringify(registered)}`,
      ).toContain("goodctl");
      expect(
        registered,
        "POST-FIX CONTRACT: the `@<>` theta carries an error-severity parse diagnostic, so " +
          "parseDiscoveredTheta DROPS it — it must not register. AT HEAD the parse is silent " +
          `and the theta registers as a runnable command; registered=${JSON.stringify(registered)}; ` +
          `notified=${JSON.stringify(notifications)}`,
      ).not.toContain("emptyann");
      expect(
        NORMATIVE_MESSAGE,
        `DIAG-2/DIAG-4: the registry must carry the ${EMPTY_ANNOTATION_CODE} Message row the ` +
          "drop path surfaces; at HEAD the row is absent",
      ).toBeDefined();
      expect(
        notifications,
        "the drop surfaces the registered message through ctx.ui.notify (DIAG-1: every " +
          `author-visible drop carries its registry code/message); notified=${JSON.stringify(notifications)}`,
      ).toContain(NORMATIVE_MESSAGE!);
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
