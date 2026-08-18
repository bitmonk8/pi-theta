import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { isThetaPanic } from "../src/runtime/runtime-panics";
import { isResultValue } from "../src/runtime/value";
import { INTERPOLATED_RESULT_CODE, INTERPOLATED_RESULT_MESSAGE } from "../src/render/query-render";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0079 — `theta/parse/interpolated-result` has no emitter. QRY-18 gives
// `Result<T, E>` exactly one disposition in the interpolation table (a parse
// rejection), yet no production input selects it: `interpolationTypeOf`
// (src/extension/production-theta-producer.ts, module-private) classifies the
// interpolated value by JS runtime shape and falls through to
// `{ kind: "object" }`, so a `Result` — a `{ ok, value | error }` carrier under a
// non-enumerable symbol brand — is `JSON.stringify`d into the prompt text and the
// model receives the interpreter's bookkeeping keys. No parse pass reads the
// interpolated expression's Theta static type for `Result`-ness either, so the
// statically resolvable rows draw nothing
// (docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md).
//
// SPEC ANCHORS.
//   - docs/spec_topics/query/query-escapes-stringification.md, the QRY-18 table's
//     last row: "`Result<T, E>` | parse error `theta/parse/interpolated-result`".
//   - the note under that table: "The `Result` rejection is **static**, resolved
//     from the expression's type, and fires even when the `Result`-valued
//     expression sits behind a function call whose return type the parser can
//     resolve. When the type is unresolvable (e.g. an inferred binding that
//     widens past the parser's view), the runtime renderer falls back to a panic
//     carrying the same `theta/parse/interpolated-result` diagnostic code."
//     Both halves are required; group (a) is the static one, group (b) the
//     runtime one.
//   - QRY-21, same page, §"Panics during interpolation are not caught by
//     `let _ =`": "Panics arise during evaluation of the RHS and propagate
//     before the `let _ =` binding completes; the discard form does not contain
//     them." Cell (b3) is that cell for this panic.
//   - docs/spec_topics/diagnostics/code-registry-parse.md, the
//     `theta/parse/interpolated-result` row: Sev `E`, Phase `type`, Trigger
//     "`${expr}` interpolation whose `expr` has Theta static type `Result<T, E>`
//     (the runtime renderer raises the same code as a panic when the type is
//     statically unresolvable)". Its *Message* column is this file's oracle
//     (DIAG-4) — {@link interpolatedResultMessage} reads it, no prose is copied.
//   - docs/spec_topics/runtime-value-model.md, `Result` row: "Theta code observes
//     `Result` only through `Ok` / `Err` constructors, `match` patterns, and `?`;
//     the in-memory shape is not part of the language surface … a `Result` value
//     never crosses the wire". Its reference-encoding paragraph names
//     `{ ok: true, value: T }` / `{ ok: false, error: E }` as an implementation
//     detail that "may change without a spec revision" — which is why group (b)
//     asserts the encoding never reaches `pi.sendUserMessage` rather than
//     asserting a corrected render — and states group (c)'s contract outright:
//     "The interpreter recognises a `Result` by that brand, never by the
//     `{ ok, … }` shape, so a user- or model-produced object carrying a boolean
//     `ok` field is an ordinary object value at every boundary".
//
// FIXED CONTRACT pinned by this file (groups (a) and (b) RED now, GREEN after;
// group (c) green both sides). Two halves, both required:
//
//   (a) STATIC GATE — a type-layer check over each `${…}` interpolation's
//       inferred expression type: a type of the form `Result<…>` emits
//       `theta/parse/interpolated-result` at the interpolation's range, one
//       emission site alongside the existing per-expression walks in
//       src/parser/type-layer-checks.ts. All three reproduction rows are
//       statically reachable, including the annotated-`fn`-return row the QRY-18
//       note singles out.
//   (b) RUNTIME FALLBACK — `interpolationTypeOf` tests `isResultValue`
//       (src/runtime/value.ts — the non-enumerable symbol brand via
//       `privateBrandOf`, explicitly NOT key presence) BEFORE the `object`
//       fall-through and returns `{ kind: "result" }`; `stringifyInterpolation`
//       turns the currently-dead `ok: false` branch of
//       `stringifyInterpolatedValue` (src/render/query-render.ts, its
//       `case "result"` arm) into a THROWN PANIC carrying the registered code and
//       message, on the same closed runtime-panic routing `MissingObjectKeyPanic`
//       / `NullMemberAccessPanic` already use — so `isThetaPanic` classifies it
//       and QRY-21 keeps holding.
//
// RANGE. `QueryTemplatePart` carries no per-interpolation offsets and `QueryExpr`
// carries only `template` + the whole `range`, so "at the interpolation's range"
// is realisable only as the enclosing `@`-query expression's range — the same
// choice, for the same documented reason, that `checkQueryTemplateInterpolations`
// (src/parser/theta-document.ts) already makes: "The whole `@`-query range
// locates the diagnostic — the verbatim template carries no per-interpolation
// token span." {@link assertGateFired} asserts that range exactly. If a later
// change gives `QueryTemplatePart` real offsets, THIS assertion is the one to
// narrow; nothing else in the file depends on the choice.
//
// PROBED CURRENT SIGNATURES (HEAD 3063f6f0 / 0.68.0, offline, deterministic,
// through the production composition; the rendered turn is read at
// `pi.sendUserMessage`). Every row parses with `diagnostics` EXACTLY `[]`:
//   row 1  let r = Ok(1)                        → sends  x{"ok":true,"value":1}
//   row 2  let r = Err(E { m: "boom" })         → sends  x{"ok":false,"error":{"m":"boom"}}
//   row 3  fn mk(): Result<integer, QueryError> → sends  x{"ok":true,"value":1}
//          { Ok(1) } / let r = mk()
//   laundered  fn mk() { Ok(1) } / let r = mk() → sends  x{"ok":true,"value":1}
//   laundered, discarded (`let _ =`)            → sends  x{"ok":true,"value":1}
//   `${r?}` over a `Result`-typed `r`           → sends  xnull (the pure-host
//                                                 safety net; no diagnostic)
//   Fake { ok: true, label: "x" }               → sends  x{"ok":true,"label":"x"}
//   Fake2 { ok: false, error: "boom" }          → sends  x{"ok":false,"error":"boom"}
// A panic raised during interpolation ALREADY propagates out of `executeBody`
// unchanged in all three query statement forms (bare tail, `let v = …?`, and the
// `let _ =` discard) and sends nothing — probed with `${o["absent"]}`, which
// throws `MissingObjectKeyPanic` / `theta/runtime/missing-object-key` from each.
// That is the routing group (b) asserts this panic joins; no new plumbing is
// needed for it.
//
// HARNESS NOTES:
//   - Group (a) is PARSE-ONLY (`parseThetaDocument`): the static half is a
//     load-time refusal, so no drive is involved and none is needed.
//   - Group (a)'s controls are the false-positive gates, and three of them are
//     the shapes of SHIPPED H9a acceptance fixtures — `{ ok: boolean, label:
//     string }` from tests/live/acceptance/fixtures/acc-typed-inline.theta, the
//     named-`Reply` shape from acc-typed-named.theta, and the code-tool callee
//     from acc-code-tool-loop.theta. A false positive on any of them refuses the
//     load of a shipped fixture and reds the live suite, so each asserts the code
//     is absent from the WHOLE diagnostics array and that the fixture still
//     carries no error-severity diagnostic at all.
//   - Groups (b) and (c) drive the REAL module-private render chain
//     (`renderQueryText` → `stringifyInterpolation` → `interpolationTypeOf` →
//     `translateInterpolationOutbound` / `stringifyInterpolatedValue`, all
//     private to src/extension/production-theta-producer.ts) through the
//     production composition: `createProductionProducerDeps` →
//     `bindPromptConversation` → `executeBody`, over the
//     tests/enum-schema-tag-privacy.test.ts group-(d) live-session double. An
//     UNTYPED prompt-mode query never dispatches `complete()`, so no provider and
//     no model is involved; the injected Clock's `setTimeout` ticks the double,
//     completing the streamed turn with a scripted reply. `ctx.sessionManager`
//     answers an empty entry list — the drive under test reads the rendered text
//     at the send seam, not the transcript.
//   - Group (b)'s fixture must be a binding the static half CANNOT see, or the
//     row would be refused at load and the runtime arm would never be exercised.
//     An UNANNOTATED `fn mk() { Ok(1) }` behind `let r = mk()` launders it:
//     `StaticTypeInferencePass.typeOf` (src/parser/static-type-inference.ts) types
//     a `call` as `{ named, name: <callee name> }` — the callee NAME, not a return
//     type — and `TypeEnv` (src/parser/type-compat.ts) holds only schema
//     declarations, so `mk` resolves to nothing while row 3's WRITTEN
//     `Result<integer, QueryError>` annotation does. {@link assertLaunders} pins
//     that laundering as an explicit precondition, loudly, so the day the static
//     half widens to cover it this file says so instead of quietly asserting a
//     panic that can no longer fire; cell (b2) pins the other precondition, that
//     the laundered binding really holds a branded `Result` at runtime.
//   - Group (c) is the bug-0017 regression cell at the runtime layer. An ordinary
//     object value whose fields are `ok`/`label` — and, separately, `ok`/`error`
//     — is byte-identical to the `Result` carrier shape, so it is exactly the
//     input that distinguishes a brand test from a key-presence test. It must keep
//     taking the `object` arm and rendering as compact JSON. Green now, green
//     after; a fix that classified by key presence reds here immediately.
//   - tests/fixtures/h7a/permitted-codes.json (the H9a empty-capture stderr gate)
//     does NOT list `theta/parse/interpolated-result`, and group (a)'s controls
//     are the evidence for why it must stay absent: no shipped fixture shape
//     emits it. The implementer decides by the real H9a run, not by this note.

// ===========================================================================
// The DIAG-4 oracle: the registry Message column, read from the spec corpus.
// ===========================================================================

/** The live registry, read from the spec corpus — the DIAG-4 source of truth. */
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
) as readonly { readonly code: string; readonly message: string }[];

/**
 * The registered Message for `theta/parse/interpolated-result`. The row's
 * template carries no placeholder, so the registry cell IS the expected string
 * for both halves — the static diagnostic's `message` and the runtime panic's
 * `message`. A missing row fails LOUDLY: the Message column is this file's only
 * message oracle, so its absence is a harness failure, never a skip.
 */
function interpolatedResultMessage(): string {
  const template = registryMessage(REGISTRY, INTERPOLATED_RESULT_CODE) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no registry row for ${INTERPOLATED_RESULT_CODE} in docs/spec_topics/diagnostics/ — the DIAG-4 Message column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

// ===========================================================================
// Shared parse harness (the tests/absent-member-presence-gate.test.ts pattern).
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
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

/** The source path every fixture parses under; also the diagnostics' `file`. */
const FIXTURE_PATH = "/theta/bug0079.theta";

function parseOnly(src: string): ThetaDocument {
  const source: ThetaSource = { path: FIXTURE_PATH, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

const FM = "---\nmode: prompt\n---\n";

/** Frontmatter for the code-tool control, which needs the `read` Pi tool in scope. */
const FM_READ_TOOL = "---\nmode: prompt\ntools:\n  - read\n---\n";

/**
 * The range of the fixture's tail `@`-query expression — the location
 * {@link assertGateFired} requires the diagnostic to carry. Every group-(a)
 * fixture ends in the bare tail query form the bug's §Reproduction uses, so the
 * `QueryExpr` is `body.tail` itself; a fixture whose tail is anything else is a
 * harness defect and fails loudly rather than silently comparing nothing.
 */
function tailQueryRange(doc: ThetaDocument): SourceRange {
  const tail = doc.body.tail;
  if (tail === null || tail.kind !== "query") {
    throw new Error(
      `harness: this fixture's body tail must BE the @\`-query expression whose range locates the diagnostic; got ${tail === null ? "no tail" : tail.kind}`,
    );
  }
  return tail.range;
}

/** Every diagnostic in `doc` carrying the bug-0079 code. */
function gateDiagnostics(doc: ThetaDocument): readonly Diagnostic[] {
  return doc.diagnostics.filter((d) => d.code === INTERPOLATED_RESULT_CODE);
}

/** A compact rendering of a document's diagnostics for failure messages. */
function showDiagnostics(doc: ThetaDocument): string {
  return doc.diagnostics.length === 0
    ? "[]"
    : doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`).join("; ");
}

/**
 * Assert the static half fired on `src`, in BOTH directions:
 *
 *   1. the emitted diagnostic set names the registered code — asserted against a
 *      rendering that spells out the PRE-FIX observation when the set is empty,
 *      so the red output carries the exact turn the theta renders into the prompt
 *      today alongside the code that is missing;
 *   2. exactly ONE diagnostic carries it, with the registered severity, the
 *      registry's Message, the fixture's `file`, and the enclosing `@`-query
 *      expression's range.
 *
 * `renderedTurn` is the text HEAD sends to the model for this row — the
 * reproduction table's own column.
 */
function assertGateFired(src: string, renderedTurn: string): Diagnostic {
  const doc = parseOnly(src);
  const observed =
    doc.diagnostics.length === 0
      ? `NO DIAGNOSTIC OF ANY SEVERITY; the rendered turn sent to the model is ${JSON.stringify(renderedTurn)}`
      : showDiagnostics(doc);
  expect(
    observed,
    `PRIMARY (bug 0079 §Fix (a)): QRY-18's \`Result<T, E>\` row prescribes a parse rejection, so this source must be REFUSED at load. At HEAD it loads clean and the model receives the interpreter-private Result carrier, which runtime-value-model.md declares unreachable and free to change without a spec revision`,
  ).toContain(INTERPOLATED_RESULT_CODE);
  const matches = gateDiagnostics(doc);
  expect(
    matches.length,
    `bug 0079 §Fix (a): ONE emission site, so exactly one diagnostic carries ${INTERPOLATED_RESULT_CODE}. Observed diagnostics: ${showDiagnostics(doc)}`,
  ).toBe(1);
  const diag = matches[0] as Diagnostic;
  expect(diag.code, "the registered code").toBe(INTERPOLATED_RESULT_CODE);
  expect(diag.severity, "code-registry-parse.md severity column: E").toBe("error");
  expect(
    diag.message,
    "DIAG-4: the expected message is READ from the registry's Message column, never copied prose",
  ).toBe(interpolatedResultMessage());
  expect(diag.file, "the diagnostic is located in the parsed file").toBe(FIXTURE_PATH);
  expect(
    diag.range,
    "bug 0079 §Fix (a): located \"at the interpolation's range\", which — because `QueryTemplatePart` carries no per-interpolation offsets — is the enclosing `@`-query expression's range, the same choice `checkQueryTemplateInterpolations` documents. Narrow THIS assertion, and only this one, if per-interpolation spans are ever added",
  ).toEqual(tailQueryRange(doc));
  return diag;
}

/**
 * Assert `src` loads with no error-severity diagnostic and, in particular, no
 * `theta/parse/interpolated-result`. The control direction of group (a): each of
 * these shapes ships in an H9a acceptance fixture or is a form QRY-18 admits, so
 * a false positive here refuses a working theta at load.
 */
function assertGateSilent(src: string, what: string): void {
  const doc = parseOnly(src);
  expect(
    gateDiagnostics(doc).map((d) => d.message),
    `CONTROL (bug 0079 §Fix (a), false-positive gate): ${what} carries no \`Result\`-typed interpolation, so ${INTERPOLATED_RESULT_CODE} must be absent from the WHOLE diagnostics array. Observed: ${showDiagnostics(doc)}`,
  ).toEqual([]);
  expect(
    doc.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code}: ${d.message}`),
    `CONTROL: ${what} must still LOAD — no error-severity diagnostic of any code`,
  ).toEqual([]);
}

/**
 * The range of the `@`-query at the tail of the fixture's sole top-level `fn`
 * body. The annotated-`fn`-parameter row interpolates INSIDE a function, where
 * the query is not the document tail and {@link tailQueryRange} cannot reach it.
 * A fixture without exactly that shape is a harness defect and fails loudly
 * rather than silently comparing nothing.
 */
function fnBodyTailQueryRange(doc: ThetaDocument): SourceRange {
  const fns = doc.body.statements.filter((s) => s.kind === "fn");
  const fn = fns.length === 1 ? fns[0] : undefined;
  const tail = fn !== undefined && fn.kind === "fn" ? fn.body.tail : null;
  if (tail === null || tail.kind !== "query") {
    throw new Error(
      `harness: this fixture must declare exactly ONE top-level \`fn\` whose body tail IS the @\`-query whose range locates the diagnostic; got ${fns.length} fns and a ${tail === null ? "missing" : tail.kind} tail`,
    );
  }
  return tail.range;
}

/**
 * The fired direction for the group-(a) rows whose expected range is not the
 * document tail, and whose pre-fix observation is a REFUSED-nothing rather than
 * one of the reproduction table's rendered turns. Same contract
 * {@link assertGateFired} pins — the registered code, exactly one emission, the
 * registered severity, the registry Message (DIAG-4), the fixture's file, the
 * enclosing `@`-query's range — plus the gate being the SOLE diagnostic, so the
 * cell cannot pass on an unrelated rejection.
 */
function assertGateFiredWith(
  src: string,
  what: string,
  locate: (doc: ThetaDocument) => SourceRange,
): Diagnostic {
  const doc = parseOnly(src);
  expect(
    showDiagnostics(doc),
    `PRIMARY (bug 0079 §Fix (a)): ${what} is a \`Result\`-typed interpolation, so QRY-18's \`Result<T, E>\` row refuses this source at load`,
  ).toContain(INTERPOLATED_RESULT_CODE);
  expect(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}`),
    `bug 0079 §Fix (a): ONE emission site, and the gate is the only thing wrong with ${what} — so the whole diagnostics array is exactly this one row. Observed: ${showDiagnostics(doc)}`,
  ).toEqual([`error ${INTERPOLATED_RESULT_CODE}`]);
  const diag = gateDiagnostics(doc)[0] as Diagnostic;
  expect(
    diag.message,
    "DIAG-4: the expected message is READ from the registry's Message column, never copied prose",
  ).toBe(interpolatedResultMessage());
  expect(diag.file, "the diagnostic is located in the parsed file").toBe(FIXTURE_PATH);
  expect(
    diag.range,
    "bug 0079 §Fix (a): located at the enclosing `@`-query expression's range, the same choice `checkQueryTemplateInterpolations` documents",
  ).toEqual(locate(doc));
  return diag;
}

// ===========================================================================
// Production-composition drive harness for groups (b) and (c) — the
// tests/enum-schema-tag-privacy.test.ts group-(d) pattern. An untyped
// prompt-mode query issues ONE streamed user turn whose content IS the QRY-18
// rendered template; the injected Clock's `setTimeout` ticks the session double,
// completing the turn with the scripted reply. No provider, no model dispatch.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** The user session's selected model (`ctx.model`) — provider derivation only. */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  sendUserMessageCalls = 0;
  /** Every text handed to `pi.sendUserMessage` — the wire-facing observable. */
  readonly sentQueryTexts: string[] = [];

  #idle = true;

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({ role: "user", content: [{ type: "text", text: content }], timestamp: 0 });
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn with the scripted reply. */
  tick(): void {
    if (this.#idle) {
      return;
    }
    this.#append({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: "stop",
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

function livePi(session: LiveSessionDouble): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    sendMessage: (): void => {},
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

function rootLive(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}

function registryDouble(): ModelRegistry {
  return {
    getAvailable: () => [ANTHROPIC_MODEL],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/**
 * `ctx` for the prompt-mode drive. `sessionManager` answers an EMPTY entry list:
 * the observable under test is the text handed to `pi.sendUserMessage`, not the
 * transcript, and an empty list keeps the drive independent of transcript replay.
 */
function ctxLive(session: LiveSessionDouble): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** One drive's disposition: the body produced a value, or the runtime threw. */
type Drive =
  | { readonly kind: "value"; readonly execution: BodyExecution; readonly session: LiveSessionDouble }
  | { readonly kind: "threw"; readonly thrown: unknown; readonly session: LiveSessionDouble };

/**
 * Parse + drive one prompt-mode theta through the production binding against the
 * live session double, capturing a throw out of the render. Fails LOUDLY when the
 * fixture stops parsing — every group-(b)/(c) fixture is parse-clean at HEAD, and
 * a fixture the static half refuses can neither pass nor fail this group for the
 * right reason.
 */
async function drive(src: string): Promise<Drive> {
  const doc = parseOnly(src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: this fixture must reach the RUNTIME render, but it failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  const session = new LiveSessionDouble();
  const deps = createProductionProducerDeps({
    pi: livePi(session),
    root: rootLive(session),
    modelRegistry: registryDouble(),
  });
  const theta: ThetaCompositionInput = {
    slashName: "bug0079",
    sourcePath: FIXTURE_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxLive(session) });
  if (binding.drivenAgainst !== "prompt-user-session") {
    throw new Error(
      `harness: expected the LIVE prompt-mode drive, got ${String(binding.drivenAgainst)}`,
    );
  }
  try {
    return { kind: "value", execution: await executeBody(doc.body, binding.executeDeps), session };
  } catch (thrown) {
    return { kind: "threw", thrown, session };
  }
}

// ===========================================================================
// Fixture prologues.
// ===========================================================================

/** Row 1 — the bug's §Reproduction source, verbatim. */
const ROW1 = "let r = Ok(1)\n";
/** Row 2 — an `Err` carrying a schema-typed payload. */
const ROW2 = 'schema E { m: string }\nlet r = Err(E { m: "boom" })\n';
/** The annotated `fn` row 3 and the second control set both build on. */
const ROW3_FN = "fn mk(): Result<integer, QueryError> {\n  Ok(1)\n}\n";
/** Row 3 — the row QRY-18's note singles out: a WRITTEN `Result` return type. */
const ROW3 = ROW3_FN + "let r = mk()\n";
/**
 * The laundered binding group (b) needs: an UNANNOTATED `fn` return leaves the
 * binding's static type unresolvable (`typeOf` of a `call` is the callee NAME and
 * `TypeEnv` carries no fn return types), while the runtime value is a genuine
 * branded `Result`.
 */
const LAUNDERED = "fn mk() {\n  Ok(1)\n}\nlet r = mk()\n";

/** The bare tail `@`-query the bug's §Reproduction interpolates `r` into. */
const TAIL_QUERY = "@`x${r}`\n";

/** The rendered turns HEAD sends for each row (§Reproduction and its table). */
const HEAD_TURN_OK = 'x{"ok":true,"value":1}';
const HEAD_TURN_ERR = 'x{"ok":false,"error":{"m":"boom"}}';

/** The carrier-key prefix no rendered turn may contain (runtime-value-model.md). */
const CARRIER_PREFIX = '{"ok":';

// ===========================================================================
// (a) STATIC GATE — the three reproduction rows, at parse level.
// ===========================================================================

describe("bug 0079 (a) — the static gate: a `Result`-typed `${…}` refuses the load", () => {
  it("RED (a1): `let r = Ok(1)` interpolated draws theta/parse/interpolated-result", () => {
    assertGateFired(FM + ROW1 + TAIL_QUERY, HEAD_TURN_OK);
  });

  it("RED (a2): `let r = Err(E { m: \"boom\" })` interpolated draws the same code", () => {
    // The `Err` arm renders the payload's own fields under the carrier's `error`
    // key, so the leak is not confined to the trivial `Ok(integer)` shape.
    assertGateFired(FM + ROW2 + TAIL_QUERY, HEAD_TURN_ERR);
  });

  it("RED (a3): a binding behind an annotated `fn` return draws it too — QRY-18's own singled-out row", () => {
    // QRY-18's note: the rejection "fires even when the `Result`-valued
    // expression sits behind a function call whose return type the parser can
    // resolve". `Result<integer, QueryError>` is written out on `mk`, so this row
    // is inside the static half's reach and outside group (b)'s.
    assertGateFired(FM + ROW3 + TAIL_QUERY, HEAD_TURN_OK);
  });
});

// ===========================================================================
// (a) CONTROLS — the false-positive gates. Three are the shapes of SHIPPED H9a
// acceptance fixtures: a false positive refuses their load and reds the live
// suite. Green now, green after.
// ===========================================================================

describe("bug 0079 (a) — controls: non-`Result` interpolations keep loading", () => {
  it("CONTROL (a4): the acc-typed-inline shape — an INLINE `{ ok: boolean, label: string }` binding", () => {
    // tests/live/acceptance/fixtures/acc-typed-inline.theta interpolates exactly
    // this binding. Its annotation spells `ok` as a field, so a gate keying off
    // the `{ ok, … }` SHAPE rather than the `Result` type rejects a shipped
    // fixture — bug 0017's invariant, restated at the static layer.
    assertGateSilent(
      FM +
        "let r: { ok: boolean, label: string } = @`Return an object: set ok to true and label to a short descriptive string.`?\n" +
        "@`echo ${r}`\n",
      "an inline-object-typed query binding whose declared fields include `ok`",
    );
  });

  it("CONTROL (a5): the acc-typed-named shape — a NAMED schema binding", () => {
    // tests/live/acceptance/fixtures/acc-typed-named.theta. The `?` unwraps the
    // query's `Result<Reply, QueryError>` to a `Reply`, so the interpolated
    // binding is an ordinary object value.
    assertGateSilent(
      FM +
        "schema Reply {\n  status: string,\n  summary: string\n}\n" +
        "let r: Reply = @`Report on a hypothetical build.`?\n" +
        "@`echo ${r}`\n",
      "a named-schema-typed query binding",
    );
  });

  it("CONTROL (a6): the acc-code-tool-loop shape — a code-tool callee must DEFER, never fire", () => {
    // tests/live/acceptance/fixtures/acc-code-tool-loop.theta. `typeOf` types
    // `read({ … })` as `{ named, name: "read" }` — the callee NAME — which
    // resolves to nothing in `TypeEnv`. An unresolvable type must defer to the
    // runtime, exactly as the QRY-18 note's "static where possible, runtime where
    // not" posture requires; treating unresolvable as `Result` rejects this.
    assertGateSilent(
      FM_READ_TOOL +
        'let contents = read({ path: "acc-code-tool-loop.theta" })?\n' +
        "@`Summarise in one short sentence what this file is: ${contents}`\n",
      "a binding initialised from a Pi code-tool call",
    );
  });

  it("CONTROL (a7): an interpolation that UNWRAPS — `${r?}` over a `Result`-typed `r`", () => {
    // `?` unwraps, so QRY-18's rejection does not apply to the interpolated
    // expression `r?`. This is a live false-positive hazard rather than a
    // hypothetical: `StaticTypeInferencePass.typeOf` types a `try` node as its
    // OPERAND's type, so an implementation that reads `typeOf` on the
    // interpolation without accounting for `try` sees the operand's `Result` and
    // fires. (At HEAD the runtime renders `xnull` here — the pure host has no
    // `try` arm and takes the expressions.md safety net — which is why this
    // control is parse-level only.)
    assertGateSilent(
      FM + ROW1 + "@`x${r?}`\n",
      "an interpolation whose expression unwraps with `?`",
    );
  });
});

// ===========================================================================
// (a) THE THREE FORMS A NAME-MATCHING PREDICATE MISSES. Each names a `Result`
// through the GENERIC `Result<…>` form rather than through an `Ok`/`Err`
// constructor or a callee name, and the written-annotation row is the most
// statically resolvable of the lot — the author spelled the type out.
// ===========================================================================

describe("bug 0079 (a) — the generic `Result<…>` forms also refuse the load", () => {
  it("(a8): an author-WRITTEN `Result<…>` annotation on the binding draws the gate", () => {
    // The annotation IS the static type, so this row is strictly inside the
    // static half's reach: QRY-18's note requires the rejection where the
    // parser can resolve the type, and nothing is more resolvable than a type
    // the author wrote out at the binding site.
    assertGateFiredWith(
      FM + ROW3_FN + "let r: Result<integer, QueryError> = mk()\n" + TAIL_QUERY,
      "a binding carrying a written `Result<integer, QueryError>` annotation",
      tailQueryRange,
    );
  });

  it("(a9): a `par for` ELEMENT draws the gate — CTRL-3 makes it a `Result`", () => {
    // CTRL-3: "the value of a `par for` is `array<Result<U, QueryError>>`".
    // `StaticTypeInferencePass`'s `par-for` arm renders that element as
    // `named "Result<U, QueryError>"`, so an element read is a `Result`-typed
    // interpolation with the generic form spelled out for it.
    assertGateFiredWith(
      FM + "let xs = [1]\nlet rs = par for v in xs {\n  v\n}\n" + "@`x${rs[0]}`\n",
      "an element read off a `par for`'s `array<Result<U, QueryError>>`",
      tailQueryRange,
    );
  });

  it("(a10): a `fn` PARAMETER annotated `Result<…>` draws the gate inside the body", () => {
    // `walkFn` binds each annotated parameter's declared type into the function
    // scope, so the body's interpolation resolves `r` to the written
    // `Result<integer, QueryError>` — the same provenance as (a8), reached
    // through the parameter list instead of a `let`.
    assertGateFiredWith(
      FM +
        "fn f(r: Result<integer, QueryError>) {\n  @`x${r}`\n}\n" +
        "f(Ok(1))\n",
      "an interpolation of a `fn` parameter annotated `Result<integer, QueryError>`",
      fnBodyTailQueryRange,
    );
  });
});

// ===========================================================================
// (a) CONTROLS, SECOND SET — the namespaces a name-string predicate cannot tell
// apart from `Result`, and the two composite positions a `?`-unwrapped operand
// reaches through. Every cell here is a CONFORMANT theta: a diagnostic refuses
// a valid load, which the module header of src/parser/type-layer-checks.ts and
// the registry Trigger both forbid.
// ===========================================================================

describe("bug 0079 (a) — controls: `Ok`/`Err` as ORDINARY names, and composite operands", () => {
  it("CONTROL (a11): an enum VARIANT named `Ok` takes QRY-18's enum row", () => {
    // `StaticTypeInferencePass` types every member access as `named <field>`, so
    // `Status.Ok` and a genuine `Ok(…)` constructor record the identical type
    // name. QRY-18's enum row prescribes the bare wire value for this, not a
    // rejection.
    assertGateSilent(
      FM + "enum Status { Ok, Bad }\n" + "@`x${Status.Ok}`\n",
      "an interpolation of an enum variant that happens to be named `Ok`",
    );
  });

  it("CONTROL (a12): a BINDING holding that variant is silent too", () => {
    // The stronger form: `let s = Status.Ok` records the same type a
    // `let r = Ok(1)` records, so the two are indistinguishable by name and
    // separable only by the initialiser's provenance.
    assertGateSilent(
      FM + "enum Status { Ok, Bad }\nlet s = Status.Ok\n" + "@`x${s}`\n",
      "a binding holding an enum variant named `Ok`",
    );
  });

  it("CONTROL (a13): a `string` FIELD sharing its name with a `Result`-returning `fn`", () => {
    // A member access types as `named <field name>`, which collides with the
    // callee-name key a `Result`-returning `fn` occupies. The field is a
    // `string`; QRY-18's string row applies.
    assertGateSilent(
      FM +
        ROW3_FN +
        'schema S { mk: string }\nlet s = S { mk: "hi" }\n' +
        "@`x${s.mk}`\n",
      "a `string` field whose name matches a `Result`-returning `fn`",
    );
  });

  it("CONTROL (a14): `${r? + 1}` — an arithmetic expression over an UNWRAPPED operand", () => {
    // `?` unwraps, and the sum is an integer. The hazard is the inference
    // layer's own narrowing: `#typeBinary` routes through `#commonType`, which
    // lets a statically-unresolvable operand type stand in for the whole
    // expression — so the operand's `Result` placeholder can surface as the
    // binary's type even though `?` consumed it. Cell (a7) pins the top-level
    // `${r?}` position; this one pins the composite it hides inside.
    assertGateSilent(
      FM + ROW1 + "@`x${r? + 1}`\n",
      "an arithmetic expression whose operand unwraps with `?`",
    );
  });

  it("CONTROL (a15): `${c ? r? : 0}` — the same, through the ternary", () => {
    // The ternary arm narrows through the same `#commonType`, so it is the
    // second position an unwrapped operand's placeholder reaches.
    assertGateSilent(
      FM + ROW1 + "let c = true\n" + "@`x${c ? r? : 0}`\n",
      "a ternary whose consequent unwraps with `?`",
    );
  });
});

// ===========================================================================
// (b) RUNTIME FALLBACK — the statically unresolvable row, through the production
// composition. The panic must fire and the carrier encoding must never be sent.
// ===========================================================================

/**
 * Assert `src`'s binding really is laundered past the static half AND really
 * holds a branded `Result` at runtime — the two preconditions group (b) rests
 * on. Both fail LOUDLY: if the static half widens to cover this shape, the
 * runtime arm is unreachable from it and the cells below would assert a panic
 * that can no longer fire.
 */
function assertLaunders(prologue: string): void {
  const doc = parseOnly(FM + prologue + "r\n");
  expect(
    gateDiagnostics(doc).map((d) => d.message),
    `harness precondition (bug 0079 §Fix (b)): group (b) exercises the RUNTIME arm, so its fixture must be a binding the static half cannot resolve. This one now draws ${INTERPOLATED_RESULT_CODE} at parse, so it belongs in group (a) and group (b) needs a different laundering. Observed: ${showDiagnostics(doc)}`,
  ).toEqual([]);
}

describe("bug 0079 (b) — the runtime fallback: a laundered `Result` interpolation panics", () => {
  it("RED (b1): an unannotated-`fn` binding panics with the registered code, and nothing is sent", async () => {
    assertLaunders(LAUNDERED);
    const outcome = await drive(FM + LAUNDERED + TAIL_QUERY);

    // DIRECTION 2 first, so a red names the exact text the model receives.
    expect(
      outcome.session.sentQueryTexts,
      `DIRECTION 2 (bug 0079 §Why it matters (2)): the interpreter-private Result carrier must never reach the wire. At HEAD the model receives ${JSON.stringify(HEAD_TURN_OK)}; runtime-value-model.md's \`Result\` row says "a \`Result\` value never crosses the wire"`,
    ).toEqual([]);
    if (outcome.kind === "value") {
      expect(
        `success, value ${JSON.stringify(outcome.execution.result.value)}`,
        `PRIMARY (bug 0079 §Fix (b)): a \`Result\`-valued interpolation whose static type is unresolvable must raise the panic QRY-18's note prescribes ("the runtime renderer falls back to a panic carrying the same \`theta/parse/interpolated-result\` diagnostic code"), not render`,
      ).toBe(`panic ${INTERPOLATED_RESULT_CODE}`);
      throw new Error("unreachable: the assertion above always fails on a value disposition");
    }
    const { thrown } = outcome;
    expect(
      isThetaPanic(thrown),
      `bug 0079 §Fix (b): the fallback lands "on the closed runtime-panic routing already used by MissingObjectKeyPanic / NullMemberAccessPanic", so it must classify as a ThetaPanic — that is what makes QRY-21 hold for it. Thrown: ${String(thrown)}`,
    ).toBe(true);
    expect(
      (thrown as { readonly code: string }).code,
      `PRIMARY (bug 0079 §Fix (b)): the panic carries the REGISTERED ${INTERPOLATED_RESULT_CODE}, per code-registry-parse.md's Trigger ("the runtime renderer raises the same code as a panic when the type is statically unresolvable"). Thrown: ${String(thrown)}`,
    ).toBe(INTERPOLATED_RESULT_CODE);
    expect(
      (thrown as Error).message,
      "DIAG-4: the panic message is the registry Message column, read not copied",
    ).toBe(interpolatedResultMessage());
  });

  it("PRECONDITION (b2): the laundered binding really does hold a branded `Result` at runtime", async () => {
    // Green now, green after — the cell that keeps (b1) honest in the other
    // direction: if `let r = mk()` did not bind a genuine `Result`, (b1) would be
    // asserting a panic over some other value. `isResultValue` is the
    // non-enumerable symbol brand (src/runtime/value.ts, `privateBrandOf`), never
    // key presence — the same predicate §Fix (b) requires `interpolationTypeOf`
    // to consult.
    const outcome = await drive(FM + LAUNDERED + "r\n");
    if (outcome.kind === "threw") {
      throw new Error(
        `harness precondition: binding the laundered fn's value must not throw; got ${String(outcome.thrown)}`,
      );
    }
    expect(
      isResultValue(outcome.execution.result.value as never),
      "harness precondition: `let r = mk()` over `fn mk() { Ok(1) }` binds a genuine branded Result value",
    ).toBe(true);
  });

  it("RED (b3, QRY-21): `let _ =` does not contain the panic", async () => {
    // QRY-21: "Panics arise during evaluation of the RHS and propagate before the
    // `let _ =` binding completes; the discard form does not contain them." At
    // HEAD this form renders and SENDS the carrier encoding as the bare tail form
    // does (probed), so the discard is a second wire-reaching position and
    // has to abort too. The `MissingObjectKeyPanic` precedent already propagates
    // out of this exact statement form, so the routing §Fix (b) joins delivers
    // this cell for free — which is the point of requiring that routing.
    assertLaunders(LAUNDERED);
    const outcome = await drive(FM + LAUNDERED + "let _ = @`x${r}`\n");

    expect(
      outcome.session.sentQueryTexts,
      `DIRECTION 2 (QRY-21): the discarding statement must not send the carrier encoding either. At HEAD it sends ${JSON.stringify(HEAD_TURN_OK)}`,
    ).toEqual([]);
    if (outcome.kind === "value") {
      expect(
        `success, value ${JSON.stringify(outcome.execution.result.value)}`,
        "PRIMARY (QRY-21): a panic during interpolation propagates before the `let _ =` binding completes; the discard form does not contain it",
      ).toBe(`panic ${INTERPOLATED_RESULT_CODE}`);
      throw new Error("unreachable: the assertion above always fails on a value disposition");
    }
    expect(
      isThetaPanic(outcome.thrown),
      `QRY-21 is a statement about PANICS, so the discard cell only holds if the throw is one. Thrown: ${String(outcome.thrown)}`,
    ).toBe(true);
    expect(
      (outcome.thrown as { readonly code: string }).code,
      `PRIMARY (QRY-21): the same registered code aborts the theta from the discarding statement. Thrown: ${String(outcome.thrown)}`,
    ).toBe(INTERPOLATED_RESULT_CODE);
    expect(
      (outcome.thrown as Error).message,
      "DIAG-4: the registry Message column",
    ).toBe(interpolatedResultMessage());
  });
});

// ===========================================================================
// (c) BUG 0017 REGRESSION AT THE RUNTIME LAYER — the cell that proves the fix
// tests the symbol brand, never key presence. Green now, green after.
// ===========================================================================

describe("bug 0079 (c) — controls: an ordinary object carrying `ok` still renders as compact JSON", () => {
  it("CONTROL (c1): `{ ok: boolean, label: string }` renders its fields, unchanged", async () => {
    // runtime-value-model.md's reference-encoding paragraph: "The interpreter
    // recognises a `Result` by that brand, never by the `{ ok, … }` shape, so a
    // user- or model-produced object carrying a boolean `ok` field is an ordinary
    // object value at every boundary." Restated as the bug's own §Fix constraint:
    // "the `object` arm must keep classifying an ordinary user/model object that
    // happens to carry a boolean `ok` field as an object (bug 0017)". This is also
    // the acc-typed-inline fixture's value shape at the render seam, so a
    // key-presence classifier reds the live suite here.
    const outcome = await drive(
      FM +
        "schema Fake { ok: boolean, label: string }\n" +
        'let o = Fake { ok: true, label: "x" }\n' +
        "@`x${o}`\n",
    );
    if (outcome.kind === "threw") {
      throw new Error(
        `CONTROL BROKEN — an ordinary object carrying a boolean \`ok\` field must still render; the runtime threw ${String(outcome.thrown)}. A bug-0079 classifier keyed on KEY PRESENCE rather than the non-enumerable symbol brand is the first suspect`,
      );
    }
    expect(
      outcome.session.sendUserMessageCalls,
      "harness guard: the untyped query drives exactly one streamed user turn",
    ).toBe(1);
    expect(
      outcome.session.sentQueryTexts[0],
      "QRY-18's Schema-typed-object row: compact JSON.stringify with outbound wire-name translation",
    ).toBe('x{"ok":true,"label":"x"}');
  });

  it("CONTROL (c2): `{ ok: boolean, error: string }` — byte-identical to the `Err` carrier — still renders", async () => {
    // The strongest form of the control: this value's rendered JSON is exactly
    // the shape an `Err` carrier serialises to, differing only in the brand. If
    // the fix consults key presence, this legal object is rejected while the two
    // are indistinguishable by shape.
    const outcome = await drive(
      FM +
        "schema Fake2 { ok: boolean, error: string }\n" +
        'let o = Fake2 { ok: false, error: "boom" }\n' +
        "@`x${o}`\n",
    );
    if (outcome.kind === "threw") {
      throw new Error(
        `CONTROL BROKEN — an object carrying \`ok\` + \`error\` keys must still render; the runtime threw ${String(outcome.thrown)}`,
      );
    }
    expect(
      outcome.session.sentQueryTexts[0],
      "the `object` arm classifies by the absent brand, not by the present keys",
    ).toBe('x{"ok":false,"error":"boom"}');
  });

  it("CONTROL (c3): the (c1)/(c2) renders are the only `{\"ok\":` texts this file admits on the wire", async () => {
    // Keeps (c1)/(c2) from being read as licence for the leak: the carrier prefix
    // is admissible ONLY because these values are ordinary objects whose own
    // declared fields spell it. Group (b) asserts the same prefix never appears
    // for a genuine `Result`.
    const outcome = await drive(
      FM +
        "schema Fake { ok: boolean, label: string }\n" +
        'let o = Fake { ok: true, label: "x" }\n' +
        "@`x${o}`\n",
    );
    if (outcome.kind === "threw") {
      throw new Error(`CONTROL BROKEN — ${String(outcome.thrown)}`);
    }
    expect(
      outcome.session.sentQueryTexts.filter((t) => t.includes(CARRIER_PREFIX)).length,
      "the object arm's render carries the prefix because the AUTHOR declared those fields",
    ).toBe(1);
  });
});

// ===========================================================================
// (d) DIAG-4 — the registry row this file interpolates.
// ===========================================================================

describe("bug 0079 (d) — the registry row is the oracle for both halves", () => {
  it("CONTROL (d1): the Message column matches the in-tree constant", () => {
    // Both halves carry the SAME registered message, so a drift between the
    // registry cell and `INTERPOLATED_RESULT_MESSAGE` (src/render/query-render.ts)
    // would turn every message assertion above into a meaningless comparison.
    // Bug 0079's §Fix edits no registry cell — DIAG-2 keeps the registry closed
    // and this row already exists — so this stays green in both directions.
    expect(
      registryMessage(REGISTRY, INTERPOLATED_RESULT_CODE),
      "code-registry-parse.md's `theta/parse/interpolated-result` row, Message column",
    ).toBe(INTERPOLATED_RESULT_MESSAGE);
    expect(interpolatedResultMessage()).toBe(
      "Result value cannot be interpolated; unwrap with ? or match first",
    );
  });
});

// ===========================================================================
// BUG 0114 — a `Result` NESTED inside an interpolated array or object.
//
// Bug 0079 (everything above) closed the TOP-LEVEL position in both halves.
// CONTAINMENT DEFEATS BOTH. At HEAD 5c9104ab, `stringifyInterpolation`
// (src/extension/production-theta-producer.ts:5934) derives the QRY-18
// discriminator ONCE, from the whole interpolated value (:5942), and for the
// `array` / `object` arms (:5943) returns
// `JSON.stringify(translateInterpolationOutbound(value, env))` at :5950 —
// before the sole runtime raise at :5957, which is therefore unreachable for any
// value whose own top level is a container. `translateInterpolationOutbound`
// (:5973) classifies nothing: it resolves a declaring-SCHEMA brand, and a
// `Result` carries `RESULT_TAG` rather than `SCHEMA_TAG`, so no schema resolves
// and the carrier's own enumerable `ok` / `value` / `error` keys are copied
// through unchanged. The static half never descends either —
// `interpolationIsResult` (src/parser/type-layer-checks.ts:2218) switches on the
// top-level node kind and answers `false` for an `array` or `object` literal, so
// the sole emission site (:2184, driven from `checkQueryInterpolationResults` at
// :2164) never fires. Twelve sources therefore load with `diagnostics` exactly
// `[]`, raise no panic, and put the interpreter-private carrier in the prompt
// text.
// (docs/bugs/0114-nested-result-in-interpolated-object-leaks-carrier.md)
//
// SPEC ANCHORS (content re-derived at HEAD 5c9104ab / 0.107.0; line numbers
// as this commit leaves the spec, not HEAD's own numbering).
//   - docs/spec_topics/runtime-value-model.md:14, the `Result` row, ending "so a
//     `Result` value never crosses the wire"; :16, the reference-encoding
//     paragraph — the carrier shapes "are implementation details … either may
//     change without a spec revision", and "The interpreter recognises a
//     `Result` by that brand, never by the `{ ok, … }` shape".
//   - docs/spec_topics/query/query-escapes-stringification.md:16 (QRY-18's
//     rule), :26 (the `array<T>` row), :27 (the Schema-typed object row), :28
//     (the `Result<T, E>` row → `theta/parse/interpolated-result`), :32 (the
//     static/runtime split, whose RUNTIME arm this group's disposition sits in),
//     :34 (recursive outbound wire-name translation — group (f)'s two rename
//     controls run through the exact function a fix edits).
//   - docs/spec_topics/control-flow.md:74, CTRL-3: "The value is
//     `array<Result<T, QueryError>>`". The one composite the spec itself defines
//     as an array of `Result`s, and cell (e1)'s fixture.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:74, the
//     `theta/parse/interpolated-result` row. DIAG-4
//     (docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes its *Message*
//     column normative; every expected message below is read through the EXISTING
//     {@link interpolatedResultMessage} oracle (:199) and no prose is copied.
//     DIAG-2 (:72) keeps the registry closed — a nested disposition reuses the
//     registered code and mints nothing.
//
// FIXED CONTRACT pinned by groups (e)/(f)/(g) (bug 0114 §Expected behaviour,
// Reading A — adopted; §Fix (a) route 2, the runtime disposition at the nested
// position, with route 1's static descent declined):
//   1. no render reaching `pi.sendUserMessage` carries a branded `Result`'s
//      carrier keys at ANY depth;
//   2. the disposition is the EXISTING registered
//      `theta/parse/interpolated-result`, Message unchanged — no new code, and
//      per §Fix (d) no third raise site;
//   3. classification stays `isResultValue` (src/runtime/value.ts:443 — the
//      non-enumerable `RESULT_TAG` brand read through `privateBrandOf`, :186),
//      NEVER key presence, at every depth. Bug 0017's invariant; group (f)'s
//      first two cells pin it at the nested position;
//   4. QRY-18 :34's recursive wire-name translation is unchanged for every value
//      that is not a `Result` — group (f) cells 3 and 4.
//
// Route 2 changes no parse-layer line, so every nested fixture below keeps
// parsing with `diagnostics` EXACTLY `[]`. {@link assertNestedCarrierRefused}
// asserts that as the settled route's own pin, and this group deliberately does
// NOT assert a parse diagnostic on any nested row: the existing {@link drive}
// (:521) fails loudly when a fixture stops parsing, which is the correct
// behaviour for a group whose every fixture parses clean by design.
//
// HEAD MEASUREMENTS (5c9104ab, offline, provider-free, deterministic; `diags` is
// the parse's whole UNFILTERED array, `sent` every text handed to
// `pi.sendUserMessage`). The twelve leaks, seven controls and six covered
// positions below are each carried in a table entry and printed by the red
// output:
//   L01 par-for whole value     diags=[] sent=["x[{\"ok\":true,\"value\":2},{\"ok\":true,\"value\":3}]"]
//   L02 inline array literal    diags=[] sent=["x[{\"ok\":true,\"value\":1}]"]
//   L03 bound unannotated       diags=[] sent=["x[{\"ok\":true,\"value\":1}]"]
//   L04 written array<integer>  diags=[] sent=["x[{\"ok\":true,\"value\":1}]"]
//   L05 written array<Result<>> diags=[] sent=["x[{\"ok\":true,\"value\":1}]"]
//   L06 both carrier arms       diags=[] sent=["x[{\"ok\":true,\"value\":1},{\"ok\":false,\"error\":2}]"]
//   L07 mixed elements          diags=[] sent=["x[1,{\"ok\":true,\"value\":2},\"s\"]"]
//   L08 schema array<integer>   diags=[] sent=["x{\"xs\":[{\"ok\":true,\"value\":1}]}"]
//   L09 bare object literal     diags=[] sent=["x{\"r\":{\"ok\":true,\"value\":1}}"]
//   L10 depth [[Ok(1)]]         diags=[] sent=["x[[{\"ok\":true,\"value\":1}]]"]
//   L11 depth [rs]              diags=[] sent=["x[[{\"ok\":true,\"value\":2},{\"ok\":true,\"value\":3}]]"]
//   L12 depth S { xs: rs }      diags=[] sent=["x{\"xs\":[{\"ok\":true,\"value\":2},{\"ok\":true,\"value\":3}]}"]
//   C01..C07 the controls       diags=[] sent as group (f) asserts, byte for byte
//   P01 top-level ctor          diags=[error theta/parse/interpolated-result] sent=[] PANIC
//   P02 top-level binding       diags=[error theta/parse/interpolated-result] sent=[] PANIC
//   P03 par-for element read    diags=[error theta/parse/interpolated-result] sent=[] PANIC
//   P04 inferred element read   diags=[]                                      sent=[] PANIC
//   P05 bug 0031's ctor field   diags=[error theta/parse/object-field-type-mismatch]
//   P06 Result-typed field      diags=[error theta/parse/result-in-schema-position,
//                                      error theta/parse/unresolved-named-type]
//
// HARNESS NOTES.
//   - Nothing above this banner is modified. Bug 0079's file authorises exactly
//     this: bug 0114 §Fix's Witness paragraph asks for these rows in "the harness
//     `tests/interpolated-result-gate.test.ts` extended, not a new mechanism".
//     `parseOnly` (:228), `drive` (:521), `FM` (:233), `ROW1` (:559),
//     `TAIL_QUERY` (:575), `CARRIER_PREFIX` (:582),
//     `interpolatedResultMessage` (:199), `assertGateFiredWith` (:357),
//     `tailQueryRange` (:245), `showDiagnostics` (:261) and
//     `LiveSessionDouble.sentQueryTexts` (:417) are all reused as-is.
//   - NO COLLISION WITH (c3). Cell (c3) (:950) drives its OWN fixture at :955 —
//     `drive` mints a fresh `LiveSessionDouble` per call at :529 — and counts
//     carrier-prefix texts on THAT drive's `outcome.session.sentQueryTexts` at
//     :965. `sentQueryTexts` is a per-instance field (:417, pushed at :423), so
//     the count is drive-scoped, never file-wide, and no cell below can
//     contribute to it.
//   - Group (e)'s cell (e2) drives a source the static half REFUSES, so it cannot
//     use `drive` — that helper's parse-clean guard is correct and is not
//     relaxed. {@link driveRefusedSource} is a deliberate narrow duplicate for
//     exactly that row, mirroring bug 0114's own probe, which "drives every row
//     whatever the parse said, so the refused rows show both dispositions".
// ===========================================================================

/**
 * {@link drive} without its parse-clean guard, for a row the static half already
 * REFUSES at load. `drive` (:521) fails loudly when a fixture carries an
 * error-severity diagnostic, and that guard is correct for every group-(b)/(c)/
 * (e)/(f) fixture — all of which parse clean. Cell (e2) needs the opposite: it
 * pins the RUNTIME half of a position the parse half already covers, which is the
 * two-character contrast bug 0114 §Reproduction turns on (`${rs}` leaks,
 * `${rs[0]}` refuses AND panics AND sends nothing). A narrow copy, never a
 * relaxation of the protected helper.
 */
async function driveRefusedSource(src: string): Promise<Drive> {
  const doc = parseOnly(src);
  const session = new LiveSessionDouble();
  const deps = createProductionProducerDeps({
    pi: livePi(session),
    root: rootLive(session),
    modelRegistry: registryDouble(),
  });
  const theta: ThetaCompositionInput = {
    slashName: "bug0114",
    sourcePath: FIXTURE_PATH,
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxLive(session) });
  if (binding.drivenAgainst !== "prompt-user-session") {
    throw new Error(
      `harness: expected the LIVE prompt-mode drive, got ${String(binding.drivenAgainst)}`,
    );
  }
  try {
    return { kind: "value", execution: await executeBody(doc.body, binding.executeDeps), session };
  } catch (thrown) {
    return { kind: "threw", thrown, session };
  }
}

/** One bug-0114 fixture plus its HEAD-measured parse and wire observations. */
interface NestedRow {
  /** The §Reproduction row id, so a red names the measured row it came from. */
  readonly id: string;
  /** What the row is, in the failure message's own voice. */
  readonly what: string;
  /** The whole theta source, frontmatter included. */
  readonly src: string;
  /** Every text HEAD hands to `pi.sendUserMessage` for this row. */
  readonly headSent: readonly string[];
}

/** The `par for` prologue CTRL-3 (control-flow.md:74) types `array<Result<…>>`. */
const PAR_FOR = "let ns = [1, 2]\nlet rs = par for n in ns {\n  n + 1\n}\n";

/** The carrier text HEAD renders for a lone `Ok(1)` inside an array. */
const NESTED_OK1 = 'x[{"ok":true,"value":1}]';

/**
 * The twelve §Reproduction rows whose render reaches the model carrying the
 * interpreter-private carrier at HEAD. Held as one table so cell (e14) can pin
 * all twelve rows' `sentQueryTexts` in a single ordered whole-list assertion: a
 * partial fix that closes some containers and not others reds there even if it
 * turned individual cells green.
 */
const NESTED_ROWS: readonly NestedRow[] = [
  {
    id: "L01",
    what: "a whole `par for` value interpolated — CTRL-3's own `array<Result<T, QueryError>>`",
    src: FM + PAR_FOR + "@`x${rs}`\n",
    headSent: ['x[{"ok":true,"value":2},{"ok":true,"value":3}]'],
  },
  {
    id: "L02",
    what: "an inline array literal holding an `Ok`, with no binding at all",
    src: FM + "@`x${[Ok(1)]}`\n",
    headSent: [NESTED_OK1],
  },
  {
    id: "L03",
    what: "an unannotated array binding holding an `Ok`",
    src: FM + "let xs = [Ok(1)]\n@`x${xs}`\n",
    headSent: [NESTED_OK1],
  },
  {
    id: "L04",
    what: "an array binding annotated `array<integer>` — the written non-`Result` sink",
    src: FM + "let xs: array<integer> = [Ok(1)]\n@`x${xs}`\n",
    headSent: [NESTED_OK1],
  },
  {
    id: "L05",
    what:
      "an array binding annotated `array<Result<integer, QueryError>>` — the author WROTE `Result` and the load is still clean",
    src: FM + "let xs: array<Result<integer, QueryError>> = [Ok(1)]\n@`x${xs}`\n",
    headSent: [NESTED_OK1],
  },
  {
    id: "L06",
    what: "an array holding BOTH carrier arms, `Ok` and `Err`",
    src: FM + "@`x${[Ok(1), Err(2)]}`\n",
    headSent: ['x[{"ok":true,"value":1},{"ok":false,"error":2}]'],
  },
  {
    id: "L07",
    what: "one `Result` among ordinary elements",
    src: FM + '@`x${[1, Ok(2), "s"]}`\n',
    headSent: ['x[1,{"ok":true,"value":2},"s"]'],
  },
  {
    id: "L08",
    what: "a Schema-typed object whose declared `array<integer>` field holds an `Ok`",
    src: FM + "schema S { xs: array<integer> }\nlet s = S { xs: [Ok(1)] }\n@`x${s}`\n",
    headSent: ['x{"xs":[{"ok":true,"value":1}]}'],
  },
  {
    id: "L09",
    what:
      "a bare object literal written inside the interpolation — QRY-18's object row, reached directly",
    src: FM + "@`x${ {r: Ok(1)} }`\n",
    headSent: ['x{"r":{"ok":true,"value":1}}'],
  },
  {
    id: "L10",
    what: "depth: an array of arrays holding an `Ok`",
    src: FM + "let xs = [[Ok(1)]]\n@`x${xs}`\n",
    headSent: ['x[[{"ok":true,"value":1}]]'],
  },
  {
    id: "L11",
    what: "depth: the `par for` value one container deeper",
    src: FM + PAR_FOR + "let xs = [rs]\n@`x${xs}`\n",
    headSent: ['x[[{"ok":true,"value":2},{"ok":true,"value":3}]]'],
  },
  {
    id: "L12",
    what: "depth: the `par for` value inside a Schema-typed object's `array<integer>` field",
    src: FM + "schema S { xs: array<integer> }\n" + PAR_FOR + "let s = S { xs: rs }\n@`x${s}`\n",
    headSent: ['x{"xs":[{"ok":true,"value":2},{"ok":true,"value":3}]}'],
  },
];

/**
 * The §Reproduction row named `id`. A missing id is a harness defect and fails
 * LOUDLY — a cell silently asserting nothing is worse than a red.
 */
function nestedRow(id: string): NestedRow {
  const row = NESTED_ROWS.find((r) => r.id === id);
  if (row === undefined) {
    throw new Error(
      `harness: bug 0114 has no §Reproduction row \`${id}\` in NESTED_ROWS — the table is this group's only fixture source, so a missing id is a harness failure, never a skip`,
    );
  }
  return row;
}

/**
 * The bug-0114 fixed contract on one row, in all three directions:
 *
 *   0. the PARSE layer is untouched — `diagnostics` stays exactly `[]`, which is
 *      §Fix (a) route 2's own pin (the settled route takes the runtime
 *      disposition and declines route 1's static descent). Deliberately NOT a
 *      parse-diagnostic assertion: see the banner above;
 *   1. NOTHING reaches `pi.sendUserMessage` — asserted FIRST so a red prints the
 *      exact carrier text the model receives today;
 *   2. the drive aborts with the EXISTING registered
 *      `theta/parse/interpolated-result`, classified by `isThetaPanic` (so QRY-21
 *      keeps holding for it) and carrying the registry's Message (DIAG-4, read
 *      through {@link interpolatedResultMessage}, never copied prose).
 *
 * Both directions are reachable: cell (g4) — `let xs = [Ok(1)]` / `${xs[0]}`,
 * §Reproduction row P04 — is GREEN at HEAD through this same helper, so the
 * assertions below are proven able to pass as well as to fail.
 */
async function assertNestedCarrierRefused(row: NestedRow): Promise<void> {
  const doc = parseOnly(row.src);
  expect(
    doc.diagnostics.map((d) => `${d.severity} ${d.code}`),
    `bug 0114 §Fix (a) route 2 (settled): the nested disposition is RUNTIME-only, so the parse layer is untouched and ${row.id} keeps loading with an empty diagnostics array. Observed: ${showDiagnostics(doc)}`,
  ).toEqual([]);

  const outcome = await drive(row.src);

  // DIRECTION 1 first, so a red names the exact bytes the model receives.
  expect(
    outcome.session.sentQueryTexts,
    `DIRECTION 1 (bug 0114 §Expected behaviour, Reading A): no render reaching \`pi.sendUserMessage\` may carry a branded \`Result\`'s carrier keys at ANY depth — runtime-value-model.md:14 "so a \`Result\` value never crosses the wire", :16 "either may change without a spec revision". ${row.id} is ${row.what}; at HEAD it sends ${JSON.stringify(row.headSent)}`,
  ).toEqual([]);

  if (outcome.kind === "value") {
    expect(
      `no panic; the drive completed and sent ${JSON.stringify(outcome.session.sentQueryTexts)}`,
      `PRIMARY (bug 0114 §Fix (a) route 2): ${row.id} — ${row.what} — must abort the theta with the registered ${INTERPOLATED_RESULT_CODE}. At HEAD \`stringifyInterpolation\` (src/extension/production-theta-producer.ts:5934) derives the QRY-18 discriminator once at :5942 and returns \`JSON.stringify(translateInterpolationOutbound(...))\` at :5950 for the container arms, before the sole raise at :5957, so no panic is possible for a nested \`Result\``,
    ).toBe(`panic ${INTERPOLATED_RESULT_CODE}`);
    throw new Error("unreachable: the assertion above always fails on a value disposition");
  }

  const { thrown } = outcome;
  expect(
    isThetaPanic(thrown),
    `bug 0114 §Fix (d): the nested raise is the SAME \`InterpolatedResultPanic\` class (src/render/query-render.ts:110), which is what keeps QRY-21 true for it — a panic during interpolation is not contained by \`let _ =\`. Thrown: ${String(thrown)}`,
  ).toBe(true);
  expect(
    (thrown as { readonly code: string }).code,
    `PRIMARY (bug 0114 §Fix (b)): the disposition is the EXISTING registered ${INTERPOLATED_RESULT_CODE} (code-registry-parse.md:74) — one code, no new row, no third raise site. Thrown: ${String(thrown)}`,
  ).toBe(INTERPOLATED_RESULT_CODE);
  expect(
    (thrown as Error).message,
    "DIAG-4 (diagnostic-shape.md:74): the expected message is READ from the registry Message column, never copied prose",
  ).toBe(interpolatedResultMessage());
}

/**
 * A bug-0114 group-(f) control: the render is byte-identical before and after.
 * Whole-list `toEqual`, not a substring — the two wire-name rows run through the
 * exact recursion (`translateInterpolationOutbound`,
 * src/extension/production-theta-producer.ts) a fix edits, so a fix that
 * disturbs QRY-18 :34's recursive translation by one byte reds here.
 */
async function assertNestedControlRenders(
  src: string,
  what: string,
  expected: string,
): Promise<void> {
  const outcome = await drive(src);
  if (outcome.kind === "threw") {
    throw new Error(
      `CONTROL BROKEN (bug 0114 §Fix (e)) — ${what} holds no branded \`Result\` at any depth, so it must still render; the runtime threw ${String(outcome.thrown)}. A nested classifier keyed on KEY PRESENCE rather than \`isResultValue\` (src/runtime/value.ts:443, the non-enumerable RESULT_TAG brand) is the first suspect — bug 0017's invariant`,
    );
  }
  expect(
    outcome.session.sendUserMessageCalls,
    "harness guard: the untyped query drives exactly one streamed user turn",
  ).toBe(1);
  expect(
    outcome.session.sentQueryTexts,
    `CONTROL (bug 0114 §Fix (e)): ${what} renders byte-identically before and after the fix — QRY-18 :26/:27 compact \`JSON.stringify\` with :34's recursive wire-name translation applied`,
  ).toEqual([expected]);
}

/**
 * The runtime half of a position the static gate already refuses: the drive
 * aborts with the registered panic and sends NOTHING. Used only by cell (e2),
 * through {@link driveRefusedSource}. Green now, green after.
 */
async function assertRefusedSourceAlsoPanics(src: string, what: string): Promise<void> {
  const outcome = await driveRefusedSource(src);
  expect(
    outcome.session.sentQueryTexts,
    `bug 0114 §Reproduction (the covered contrast): ${what} sends NOTHING — this is the position bug 0079 closed`,
  ).toEqual([]);
  if (outcome.kind === "value") {
    expect(
      `no panic; the drive completed and sent ${JSON.stringify(outcome.session.sentQueryTexts)}`,
      `REGRESSION PIN (bug 0079, kept by bug 0114 §Fix (e)): ${what} must keep aborting with ${INTERPOLATED_RESULT_CODE}`,
    ).toBe(`panic ${INTERPOLATED_RESULT_CODE}`);
    throw new Error("unreachable: the assertion above always fails on a value disposition");
  }
  expect(
    isThetaPanic(outcome.thrown),
    `the abort must classify as a ThetaPanic. Thrown: ${String(outcome.thrown)}`,
  ).toBe(true);
  expect(
    (outcome.thrown as { readonly code: string }).code,
    `REGRESSION PIN: the registered code. Thrown: ${String(outcome.thrown)}`,
  ).toBe(INTERPOLATED_RESULT_CODE);
  expect((outcome.thrown as Error).message, "DIAG-4: the registry Message column").toBe(
    interpolatedResultMessage(),
  );
}

// ===========================================================================
// (e) THE NESTED POSITION — twelve sources that load clean, never panic, and put
// the interpreter-private carrier on the wire. RED at HEAD; this group IS the
// defect. Governing sentence — query-escapes-stringification.md:33:
// "Containment does not change the disposition: an `array<T>` or Schema-typed
// object interpolation whose value holds a `Result` at **any depth** takes the
// `Result<T, E>` row's disposition".
// ===========================================================================

describe("bug 0114 (e) — a nested `Result` takes QRY-18's `Result` row: containment does not launder the carrier", () => {
  it("RED (e1, PRIMARY / L01): the whole `par for` value — CTRL-3's own composite — must not render its carrier", async () => {
    // control-flow.md:74 (CTRL-3): "The value is `array<Result<T, QueryError>>`".
    // Not a contrivance — it is the one composite the spec itself defines as an
    // array of `Result`s, and interpolating it whole is how an author dumps a
    // fan-out into a prompt. Paired with (e2), which differs by two characters.
    await assertNestedCarrierRefused(nestedRow("L01"));
  });

  it("(e2, PRIMARY pair / P03): the two-character contrast — the ELEMENT read off the SAME fixture refuses, panics, and sends nothing", async () => {
    // The other half of the primary pair, at the DRIVE level rather than the
    // parse level. Cell (a9) (:691) pins the parse disposition of an element read
    // on its own, different `par for` fixture; this cell pins the RUNTIME
    // disposition on bug 0114's primary fixture, which is what makes the contrast
    // a contrast — (e1) sends the carrier, (e2) sends nothing. Green now, green
    // after. Cell (g3) pins the same fixture's parse disposition.
    await assertRefusedSourceAlsoPanics(
      FM + PAR_FOR + "@`x${rs[0]}`\n",
      "the ELEMENT read `${rs[0]}` off bug 0114's primary `par for` fixture",
    );
  });

  it("RED (e3 / L02): an inline array literal `${[Ok(1)]}` — no binding at all", async () => {
    await assertNestedCarrierRefused(nestedRow("L02"));
  });

  it("RED (e4 / L03): a bound, unannotated `let xs = [Ok(1)]`", async () => {
    await assertNestedCarrierRefused(nestedRow("L03"));
  });

  it("RED (e5 / L04): a written `array<integer>` sink admits the `Ok` element in silence", async () => {
    // `checkCommonType`'s sink loop skips any branch whose compatibility answer is
    // "unknown", and a `result-ctor` types as an unresolvable `named "Ok"`, so the
    // declared element type buys nothing (bug 0114 §Actual behaviour). The sink is
    // real — the same fixture with `["a"]` draws
    // `theta/parse/array-element-type-mismatch`.
    await assertNestedCarrierRefused(nestedRow("L04"));
  });

  it("RED (e6 / L05): the sharpest row — the author WRITES `array<Result<integer, QueryError>>` and it still loads and leaks", async () => {
    // `interpolationIsResult` (src/parser/type-layer-checks.ts:2218) reaches
    // `isResultGenericType` (:2269) only for an `ident` or an `index` whose own
    // type spells `Result<…>`. An `array<Result<…>>` type is an array, so the
    // author has said the word `Result` in the source and the gate that exists for
    // that word does not see it.
    await assertNestedCarrierRefused(nestedRow("L05"));
  });

  it("RED (e7 / L06): both carrier arms — `${[Ok(1), Err(2)]}`", async () => {
    await assertNestedCarrierRefused(nestedRow("L06"));
  });

  it('RED (e8 / L07): one `Result` among ordinary elements — `${[1, Ok(2), "s"]}`', async () => {
    await assertNestedCarrierRefused(nestedRow("L07"));
  });

  it("RED (e9 / L08): QRY-18's Schema-typed object row, reached through a branded value whose `array<integer>` field holds an `Ok`", async () => {
    // `translateInterpolationOutbound` resolves `S`, renames nothing, and
    // recurses into the field with `integer` as the type hint; the element
    // resolves no schema of its own, so its own enumerable keys copy through.
    await assertNestedCarrierRefused(nestedRow("L08"));
  });

  it("RED (e10 / L09): the object arm reached directly — a bare object literal written inside the interpolation", async () => {
    // The same literal in STATEMENT position is refused (`let o = { r: Ok(1) }`
    // draws `theta/parse/bare-object-literal`). Whether that rule should reach an
    // interpolation source is fenced in bug 0114 §Non-goals; this cell uses the
    // spelling only as a measured route to QRY-18's object row (:27).
    await assertNestedCarrierRefused(nestedRow("L09"));
  });

  it("RED (e11 / L10): depth — `let xs = [[Ok(1)]]`", async () => {
    await assertNestedCarrierRefused(nestedRow("L10"));
  });

  it("RED (e12 / L11): depth — the `par for` value one container deeper", async () => {
    await assertNestedCarrierRefused(nestedRow("L11"));
  });

  it("RED (e13 / L12): depth — the `par for` value inside a Schema-typed object's field", async () => {
    await assertNestedCarrierRefused(nestedRow("L12"));
  });

  it("RED (e14, AGGREGATE): across ALL TWELVE rows, nothing reaching the wire carries the carrier prefix — one ordered whole-list pin", async () => {
    // The shape of (c3) (:950), applied to the twelve leaking rows instead of one
    // control: a partial fix that closes some containers and not others reds here
    // even if it turned individual cells green. `CARRIER_PREFIX` (:582) is the
    // assertion vocabulary, and the ordered list names every row that leaked, so
    // the red output IS the residual leak table.
    const leaked: string[] = [];
    let sentTotal = 0;
    for (const row of NESTED_ROWS) {
      const outcome = await drive(row.src);
      sentTotal += outcome.session.sentQueryTexts.length;
      for (const text of outcome.session.sentQueryTexts) {
        if (text.includes(CARRIER_PREFIX)) {
          leaked.push(`${row.id} :: ${JSON.stringify(text)}`);
        }
      }
    }
    expect(
      leaked,
      `PRIMARY (bug 0114 §Expected behaviour, Reading A): "No render reaching \`pi.sendUserMessage\` contains the carrier keys of a branded \`Result\` at any depth." Every entry below is one §Reproduction row still putting ${JSON.stringify(CARRIER_PREFIX)} on the wire`,
    ).toEqual([]);
    expect(
      sentTotal,
      "bug 0114 §Fix (a) route 2: the twelve nested rows abort the theta and send NOTHING — QRY-18 :28 fixes the `Result` disposition as a rejection, and rendering a `Result` usefully is fenced in §Non-goals",
    ).toBe(0);
  });
});

// ===========================================================================
// (f) CONTROLS — bug 0114 §Fix (e). Measured silent today and required
// byte-identical after: bug 0017's two nested shapes, QRY-18 :34's two wire-name
// renames (the same recursion a fix edits), the enum element, a plain array, and
// an array of ordinary schema values. Green now, green after.
// ===========================================================================

describe("bug 0114 (f) — controls: containment must not change any NON-`Result` render", () => {
  it("CONTROL (f1 / C01): bug 0017's `{ ok, label }` shape AT THE NESTED POSITION still renders its fields", async () => {
    // runtime-value-model.md:16: "The interpreter recognises a `Result` by that
    // brand, never by the `{ ok, … }` shape". Cell (c1) (:898) pins this at the
    // TOP level; a nested classifier keyed on key presence passes (c1) and reds
    // here, which is the whole point of the cell.
    await assertNestedControlRenders(
      FM +
        "schema F { ok: boolean, label: string }\n" +
        'let xs = [F { ok: true, label: "x" }]\n' +
        "@`x${xs}`\n",
      "an ARRAY of ordinary objects whose declared fields are `ok` and `label`",
      'x[{"ok":true,"label":"x"}]',
    );
  });

  it("CONTROL (f2 / C02): a nested object BYTE-IDENTICAL to the `Err` carrier still renders", async () => {
    // The strongest form: `{"ok":false,"error":"boom"}` is exactly what an `Err`
    // carrier serialises to, differing only in the brand — and here it sits one
    // level inside another schema value, the position (c2) (:928) does not reach.
    await assertNestedControlRenders(
      FM +
        "schema G { ok: boolean, error: string }\n" +
        "schema H { g: G }\n" +
        'let h = H { g: G { ok: false, error: "boom" } }\n' +
        "@`x${h}`\n",
      "a nested object byte-identical to the `Err` carrier",
      'x{"g":{"ok":false,"error":"boom"}}',
    );
  });

  it("CONTROL (f3 / C03): QRY-18 :34's recursive wire-name translation through a NESTED schema value", async () => {
    // query-escapes-stringification.md:34: "Wire-name translation for objects and
    // arrays uses the outbound translation pass … the theta-side names an author
    // writes never appear in the rendered prompt." This runs through
    // `translateInterpolationOutbound` — the exact function a fix edits —
    // so the whole rendered text is asserted, not a substring.
    await assertNestedControlRenders(
      FM +
        'schema P { m as "wire_m": string }\n' +
        "schema Q { p: P }\n" +
        'let q = Q { p: P { m: "a" } }\n' +
        "@`x${q}`\n",
      "a renamed field on a schema value nested inside another schema value",
      'x{"p":{"wire_m":"a"}}',
    );
  });

  it("CONTROL (f4 / C04): QRY-18 :34's recursive wire-name translation through an ARRAY element", async () => {
    await assertNestedControlRenders(
      FM + 'schema P { m as "wire_m": string }\n' + 'let xs = [P { m: "a" }]\n' + "@`x${xs}`\n",
      "a renamed field on a schema value inside an array",
      'x[{"wire_m":"a"}]',
    );
  });

  it("CONTROL (f5 / C05): the enum row inside a container — an enum VARIANT named `Ok`", async () => {
    // QRY-18 :25 renders an enum variant as its bare wire value; inside an array
    // that is a quoted JSON string. The variant is literally named `Ok`, so a
    // nested classifier keyed on anything but the RESULT_TAG brand reds here —
    // bug 0020's shared-brand posture, at the nested position.
    await assertNestedControlRenders(
      FM + "enum S { Ok, Bad }\n" + "let xs = [S.Ok]\n" + "@`x${xs}`\n",
      "an array holding an enum variant named `Ok`",
      'x["Ok"]',
    );
  });

  it("CONTROL (f6 / C06): a plain array of integers", async () => {
    await assertNestedControlRenders(
      FM + "@`x${[1, 2]}`\n",
      "a plain `array<integer>` literal",
      "x[1,2]",
    );
  });

  it("CONTROL (f7 / C07): an array of ordinary schema values", async () => {
    await assertNestedControlRenders(
      FM + "schema P { m: string }\n" + 'let xs = [P { m: "a" }]\n' + "@`x${xs}`\n",
      "an array of ordinary schema values",
      'x[{"m":"a"}]',
    );
  });
});

// ===========================================================================
// (g) THE SIX COVERED POSITIONS — bug 0114 §Fix (e)'s "required unchanged".
// Bug 0079's and bug 0031's territory, re-pinned here so a nested fix that
// regresses the TOP-LEVEL gate reds in this file's bug-0114 half too. Green now,
// green after.
// ===========================================================================

describe("bug 0114 (g) — the covered positions stay covered: a nested fix must not regress the top-level gate", () => {
  it("CONTROL (g1 / P01): the top-level constructor interpolated directly is still refused at load", () => {
    assertGateFiredWith(
      FM + "@`x${Ok(1)}`\n",
      "a top-level `Ok` constructor interpolated directly",
      tailQueryRange,
    );
  });

  it("CONTROL (g2 / P02): `let r = Ok(1)` / `${r}` — the top-level binding — is still refused at load", () => {
    // The same fixture cell (a1) (:589) pins through `assertGateFired`; restated
    // here through `assertGateFiredWith`, which additionally pins the WHOLE
    // diagnostics array to that one row, so a nested route that added a second
    // emission for the same source reds.
    assertGateFiredWith(
      FM + ROW1 + TAIL_QUERY,
      "a top-level binding holding an `Ok`",
      tailQueryRange,
    );
  });

  it("CONTROL (g3 / P03): the `par for` ELEMENT read is still refused at load", () => {
    // Cell (a9) (:691) pins this disposition on its own `par for` fixture; this
    // cell pins it on bug 0114's primary fixture, whose whole-value sibling (e1)
    // is the defect. Two characters apart, opposite dispositions.
    assertGateFiredWith(
      FM + PAR_FOR + "@`x${rs[0]}`\n",
      "an element read off bug 0114's primary `par for` value",
      tailQueryRange,
    );
  });

  it("CONTROL (g4 / P04): `let xs = [Ok(1)]` / `${xs[0]}` — parse `[]`, panic only, nothing sent", async () => {
    // The GREEN-DIRECTION PROOF for {@link assertNestedCarrierRefused}: this row
    // already satisfies every assertion that helper makes — parse `[]`, an
    // `isThetaPanic` carrying the registered code and the registry Message, and an
    // empty `sentQueryTexts`. It is exactly the post-fix shape of the twelve (e)
    // rows, so the helper is proven able to pass as well as to fail.
    await assertNestedCarrierRefused({
      id: "P04",
      what: "an element read off an INFERRED array binding — the runtime arm alone",
      src: FM + "let xs = [Ok(1)]\n@`x${xs[0]}`\n",
      headSent: [],
    });
  });

  it("CONTROL (g5 / P05): bug 0031's route — `S { n: Ok(1) }` under `n: integer` still draws object-field-type-mismatch", () => {
    // `checkObjectFieldCompat`'s `forceIncompatible` (src/parser/type-compat.ts,
    // driven from src/parser/type-layer-checks.ts:1572) decides a `result-ctor`
    // FIELD VALUE incompatible outright. Its array-element neighbour has no
    // counterpart, which is why (e9)/L08 leaks one line away in the same schema.
    const doc = parseOnly(
      FM + "schema S { n: integer }\n" + "let s = S { n: Ok(1) }\n" + "@`x${s}`\n",
    );
    expect(
      doc.diagnostics.map((d) => d.code),
      `REGRESSION PIN (bug 0114 §Fix (e), "required unchanged"): bug 0031's constructor-field route must keep refusing a \`result-ctor\` field value. Observed: ${showDiagnostics(doc)}`,
    ).toContain("theta/parse/object-field-type-mismatch");
    expect(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}`),
      `REGRESSION PIN: the whole diagnostics array is exactly bug 0031's row. Observed: ${showDiagnostics(doc)}`,
    ).toEqual(["error theta/parse/object-field-type-mismatch"]);
  });

  it("CONTROL (g6 / P06): a `Result`-typed schema FIELD still draws result-in-schema-position", () => {
    // runtime-value-model.md:14's warrant: "`Result` is not a lowerable type form
    // and is rejected in any schema-feeding position at parse time
    // (`theta/parse/result-in-schema-position`)". Unchanged by any nested route.
    const doc = parseOnly(
      FM + "schema S { r: Result<integer, QueryError> }\n" + "let n = 1\n" + "@`x${n}`\n",
    );
    expect(
      doc.diagnostics.map((d) => d.code),
      `REGRESSION PIN (bug 0114 §Fix (e), "required unchanged"): a \`Result\`-typed schema field is refused at parse. Observed: ${showDiagnostics(doc)}`,
    ).toContain("theta/parse/result-in-schema-position");
    expect(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}`),
      `REGRESSION PIN: the whole ordered diagnostics array for a \`Result\`-typed field. Observed: ${showDiagnostics(doc)}`,
    ).toEqual([
      "error theta/parse/result-in-schema-position",
      "error theta/parse/unresolved-named-type",
    ]);
  });
});
