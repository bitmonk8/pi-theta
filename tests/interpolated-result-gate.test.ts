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
