// Bug 0188 — `-0` crosses the subagent return envelope as `+0` while the
// prompt→prompt attach leg binds it unchanged. `0 * -1` parses with `[]`
// diagnostics and evaluates to `-0`, whose sign theta code observes through
// division (`1 / (0 * -1)` is `-Infinity` where `1 / 0` is `Infinity`), but
// `serializeOkEnvelope(-0)` is `{"theta_result":{"v":1,"ok":0}}` because
// `JSON.stringify` never emits a sign the JSON grammar itself admits
// (`JSON.parse("-0")` IS `-0`). The parent re-reads `+0`, BOTH legs validate
// `{"ok":true}` with no diagnostic, and the callee's `mode:` frontmatter
// therefore selects the sign of the value the caller binds.
// `docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md`.
//
// THE SETTLED ROUTE IS §Fix (a) — SIGN-PRESERVING ENVELOPE ENCODING, adjudicated
// before this run and not re-litigated here. The child's envelope writer emits
// the `-0` form the JSON grammar already admits, so the subagent leg and the
// prompt→prompt attach leg become identical by construction — which is what
// `docs/spec_topics/invocation.md:36` requires. The change is confined to
// `serializeOkEnvelope` (`src/runtime/subagent-envelope.ts:121`) and its
// serialisation call, now `stringifyPreservingNegativeZero` (`:123`) where it
// was plain `JSON.stringify`. THE PARENT IS UNCHANGED: `parseEnvelopeLine`
// (`:254`), the driver's parse and settle
// (`src/runtime/subagent-json-driver.ts:118`, `:121`), the envelope schema, the
// `v` field and every parse behaviour stay exactly as they are, because
// `JSON.parse` already recovers `-0` at the root, at a field and in an array
// (§Reproduction (b)).
//
// WHAT THIS FILE DISCHARGES: §Fix (e)(8) — "Re-drive §Reproduction (a), (c),
// (d) and (e) over the shipped seams: the real prompt→prompt attach cell for the
// prompt leg, the real `driveSubagentRootRegime` writer plus `parseEnvelopeLine`
// and the production `AjvSchemaValidator` for the subagent leg, at the root, at
// a schema field and at an array element, under `number`, `integer` and
// `number | null`. The `+0` controls (`0 - 0`, `0 * 1`) and the finite controls
// assert UNCHANGED values on both legs. The caller-side reciprocal (`Ok(1 / z)`)
// is the cell that measures the harm rather than the mechanism." The `FENCE-*`
// and `CONTROL (BOUNDARY-*)` cells additionally discharge §Fix (e)(1), (e)(2),
// (e)(3), (e)(6) and (e)(7).
//
// RED NOW / GREEN AFTER — the five cell groups that assert the specified
// behaviour rather than the current one:
//   - `SEAM-*`   the emitted bytes at the root, at a schema field, at an array
//                element, at depth and inside a nested `Result` carrier;
//   - `TRIP-*`   the round trip `parseEnvelopeLine(serializeOkEnvelope(x))`;
//   - `CHILD-*`  the REAL child-side writer `driveSubagentRootRegime`;
//   - `VERDICT`  the re-read VALUE the parent binds (its AJV verdicts are
//                already correct and are pinned UNCHANGED in the same cell);
//   - `HARM-SUBAGENT` and `SENTINEL-*`.
//
// GREEN NOW AND GREEN AFTER — the controls, which are the whole cost argument
// for route (a) and must not move in either direction:
//   - `SPELLING-*`        §Reproduction (a): the four spellings, the two `+0`
//                         controls, and the sign's observability through `/`;
//   - `HARM-PROMPT`       the leg that already carries the sign;
//   - `BYTES-IDENTICAL`   every `-0`-FREE payload emits byte-identical bytes to
//                         today — the no-blast-radius witness, and the
//                         structural property route (a) rests on;
//   - `FENCE-DEPTH-*`     bug 0187's depth refusal and its sub-check ORDER;
//   - `FENCE-DETECTION`   §Fix (e)(6): route (a) does NOT widen bug 0180's
//                         finiteness predicate;
//   - `BOUNDARY-*`        §Fix (e)(1)(2)(3): the rendering and equality
//                         boundaries route (a) stops short of.
//
// THE THREE COMMITTED 0180 FENCES THIS FILE DOES NOT TOUCH. §Fix (e)(4) names
// them and the landing commit re-pins them under bug 0188's authority, not this
// file: `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:804`
// (`CONTROL (FENCE-NEGATIVE-ZERO)`), `:1100` (the `CHILD-FINITE` row labelled
// `0 * -1 (-0)`), and `tests/subagent-invoke-nonfinite-return-refusal.test.ts:541`
// (the `negVal` soft cell over REAL spawned children). All three asserted the
// erasure at filing HEAD; the landing commit re-pins them to the preserved sign
// (green under this fix).
//
// SPEC.
//   - `docs/spec_topics/invocation.md:36` (§Final-value propagation across
//     callees) — "A `prompt`-mode child attaches to the caller's current
//     conversation, but the final value still propagates through the same return
//     surface." The envelope is specified as that leg's CARRIAGE; nothing
//     specifies it as a transform on the values it carries. `:55` (§Cross-mode
//     semantics) fixes what the callee's mode DOES select — "whether it gets a
//     fresh conversation or attaches to its caller's current conversation" — and
//     nothing more. `:28` (§Typed return) bounds the domain to the value-carrying
//     `invoke<T>` form.
//   - `docs/spec_topics/expressions.md:232` — the `*` / `/` / unary-minus rules
//     that mint `-0` from clean source, and "Division by zero produces IEEE-754
//     `Infinity` / `-Infinity` / `NaN` per JS semantics; it does not panic".
//     `-Infinity` from `1 / x` requires `x` to be `-0`, so the specified result
//     set presupposes the sign is carried.
//   - `docs/spec_topics/runtime-value-model.md:8` (the `number` row) — a theta
//     `number` is a JS `number`; the row is silent on the sign of zero. `:26`
//     (§Equality) fixes `+0 == -0` as `true` and scopes its own normalisation
//     claim to "the `-0`→`0` normalisation the rendering pipeline applies".
//   - `docs/spec_topics/pi-integration-contract/subagent.md:101` (PIC-59) owns
//     the return envelope; its `Ok`-values bullet (`:110`) and its fail-closed
//     non-representable bullet (`:114`) are both closed to the non-finite class,
//     which is why route (a) engages neither.
//   - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:79` — "`0` for the
//     value `-0` (signed zero is normalised at the rendering boundary)". The
//     corpus's most explicit statement of WHERE the erasure belongs, and the
//     reason the `BOUNDARY-*` cells below are controls rather than reds.
//   - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15) —
//     observable (a) moves on the SUBAGENT leg only, in the direction of the
//     prompt leg. `HARM-PROMPT`, `BYTES-IDENTICAL` and every `FENCE-*` /
//     `BOUNDARY-*` cell are the evidence that nothing else moves.
//
// TIER: unit, offline, provider-free, part of the DEFAULT suite. Every callee
// and caller body below is a pure tail expression or a `let` chain ending in a
// `match` over one, so no query is issued, no provider is contacted and no model
// turn is spent. The integration tier is not needed and the live tier adds
// nothing: the whole class is decided by bytes a pure function emits and by a
// value a pure function re-reads, and the one seam that needs a real driver —
// the child-side writer — is the SHIPPED `driveSubagentRootRegime`, reachable
// in-process through the `subagentRootRegime` marker with no child process. The
// parent's bind over REAL spawned children is already measured by the committed
// integration witness `tests/subagent-invoke-nonfinite-return-refusal.test.ts`
// (its `negVal` cell at `:541`), which this file deliberately leaves alone.
//
// HARNESS PROVENANCE — nothing new is invented here. `driveChildRoot`,
// `soleEnvelope`, `driveDetail`, `parseTheta`, `realAjvValidator`, `rootDouble`,
// `loweredFor` and the prompt-leg drive are
// `tests/subagent-envelope-nonfinite-ok-refusal.test.ts`'s harness, reproduced
// with the same construction (the regime is selected by `subagentRootRegime`
// naming the theta's slug, an injected `emitResultEnvelope` captures the line,
// and a REAL `AjvSchemaValidator` sits on the runtime root so the drive's own
// schema work is the shipped one). The prompt-leg drive differs from that file's
// `driveTypedInvoke` in one respect, required by §Fix (e)(8)'s harm cell: the
// caller's whole BODY is supplied, so its tail can be `Ok(1 / z)` rather than a
// bare `invoke<T>(…)`.
//
// POSITIONS IN `src/extension/production-theta-producer.ts` ARE NAMED BY SYMBOL
// ONLY, per bug 0134's do-not-chase adjudication
// (`docs/bugs/0134-params-shift-induced-stale-citations.md`): the file is >6000
// lines and every landed fix inserts into it.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
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
import { evaluateSource, type EvalHost } from "../src/runtime/expression-evaluator";
import {
  isResultValue,
  makeEnumValue,
  makeOk,
  valuesEqual,
  type ResultValue,
  type ThetaValue,
} from "../src/runtime/value";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { DEPTH_VIOLATION_MESSAGE, MAX_JSON_DEPTH } from "../src/runtime/depth-walk";
import {
  mapNonRepresentableReturnValue,
  mapTooDeepReturnValue,
  parseEnvelopeLine,
  serializeOkEnvelope,
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
  type EnvelopeParse,
} from "../src/runtime/subagent-envelope";
import { renderCanonicalNumber } from "../src/render/canonical-number";
import { stringifyInterpolatedValue } from "../src/render/query-render";
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
// Shared constants and sign-legible rendering.
// ===========================================================================

const CALLEE_PATH = "./kid.theta";

const PROMPT_FM = "---\nmode: prompt\n---\n";
const SUBAGENT_FM = "---\nmode: subagent\n---\n";

const NBOX_DECL = "schema NBox { n: number | null, who: string }\n";

/**
 * The sign of a zero, rendered so an assertion diff SHOWS it. Every channel the
 * corpus decides erases this distinction — `String(-0)` is `"0"`,
 * `renderCanonicalNumber` is `"0"` (BNDR-6p), the non-exhaustive-`match` panic
 * summary is `"0"` (`src/runtime/match-result.ts:70`) — so a bare `Object.is`
 * assertion would red as `false` vs `true` and name nothing. This renders
 * `Object.is`-distinctly, which makes the red read as literally "a `0` where a
 * `-0` is expected".
 */
function signedZeroForm(value: unknown): string {
  if (typeof value !== "number") {
    return `<not a number: ${JSON.stringify(value)}>`;
  }
  if (Object.is(value, -0)) {
    return "-0";
  }
  if (Object.is(value, 0)) {
    return "0";
  }
  return String(value);
}

/** A payload rendered with its signed zeros legible (`JSON.stringify` renders both `0`). */
function render(value: unknown): string {
  if (typeof value === "number") {
    return signedZeroForm(value);
  }
  if (value instanceof String) {
    return `String(${JSON.stringify(String(value))})`;
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

/**
 * The `ok` arm's value, or a LOUD failure naming the arm that came back
 * instead — a cell that asserted a sign against a `parse-failed` verdict would
 * red for the wrong reason.
 */
function okValueOf(parse: EnvelopeParse, label: string): unknown {
  if (parse.kind !== "ok") {
    throw new Error(
      `precondition unmet: ${label} did not re-read as the envelope's ok arm — observed ` +
        `${JSON.stringify(parse)}`,
    );
  }
  return parse.value;
}

/** The member at `path` inside a re-read payload, or a LOUD failure naming the miss. */
function memberAt(value: unknown, path: readonly (string | number)[], label: string): unknown {
  let cursor: unknown = value;
  for (const token of path) {
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(
        `precondition unmet: ${label} — cannot descend '${String(token)}' into ` +
          `${render(cursor)}`,
      );
    }
    cursor = (cursor as Record<string | number, unknown>)[token];
  }
  return cursor;
}

// ===========================================================================
// Harness — the real parse, the real AJV seam, the real production bindings.
// Reproduced from `tests/subagent-envelope-nonfinite-ok-refusal.test.ts`.
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
 * `[]` diagnostics, which is this report's own premise: `-0` is minted from
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
 * `{ strict: false, allErrors: true, logger: false }` construction
 * (`src/seams/schema-validator.ts:112`) is what decides both legs' verdicts, so
 * a stub validator would decide part of the very thing under test.
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

/** The real lowering, over the declarations the runtime reads off the body statements. */
function loweredFor(annotation: string): LoweredSchema {
  const doc = parseTheta("seam.theta", PROMPT_FM + NBOX_DECL + "1\n");
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

// ---------------------------------------------------------------------------
// The shipped expression interpreter, over an explicitly injected host.
// ---------------------------------------------------------------------------

/**
 * A host with no names and no callables: every body evaluated through it is a
 * pure expression, so an unbound identifier is a fixture defect and says so
 * rather than resolving to a default.
 */
const PURE_EVAL_HOST: EvalHost = {
  resolveIdentifier(name: string): never {
    throw new Error(`precondition unmet: test host has no binding for identifier '${name}'`);
  },
  callFunction(name: string): never {
    throw new Error(`precondition unmet: test host issues no calls; '${name}' was called`);
  },
};

/**
 * A host binding exactly one name, so the caller's own arithmetic over a BOUND
 * value can be evaluated by the SHIPPED interpreter rather than by this file.
 * The binding is injected per call — no ambient state.
 */
function hostBinding(name: string, value: ThetaValue): EvalHost {
  return {
    resolveIdentifier(read: string): ThetaValue {
      if (read === name) {
        return value;
      }
      throw new Error(`precondition unmet: test host has no binding for identifier '${read}'`);
    },
    callFunction(called: string): never {
      throw new Error(`precondition unmet: test host issues no calls; '${called}' was called`);
    },
  };
}

// ---------------------------------------------------------------------------
// The prompt→prompt attach cell (the leg that already carries the sign).
// ---------------------------------------------------------------------------

/**
 * Drive a prompt-mode caller against a prompt-mode callee over the real
 * production binding: `parseThetaDocument` →
 * `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
 * `executeBody`, with a real `AjvSchemaValidator` on the runtime root. The
 * attach guard is `callerMode === "prompt" && callee.frontmatter.mode ===
 * "prompt"` inside `#driveCallee`, and `bindPromptConversation` is what threads
 * `callerMode: "prompt"` in (both named by symbol, per bug 0134).
 *
 * The caller's whole BODY is supplied so §Fix (e)(8)'s harm cell can put the
 * reciprocal `Ok(1 / z)` in the tail; `tests/subagent-envelope-nonfinite-ok-refusal.test.ts`'s
 * `driveTypedInvoke` is the same construction with a bare `invoke<T>(…)` tail.
 */
async function drivePromptLeg(input: {
  readonly callerBody: string;
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

  const callerDoc = parseTheta("caller.theta", PROMPT_FM + input.callerBody);
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
 * The `Result` the caller's tail produced. A caller body that did not reach its
 * tail says nothing about the return boundary, so that is a loud harness failure
 * rather than a cell outcome.
 */
function boundaryResult(execution: BodyExecution): ResultValue {
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail — error ${JSON.stringify(execution.error)}`,
    );
  }
  const tail = execution.result.value;
  if (tail === undefined || !isResultValue(tail)) {
    throw new Error(
      `precondition unmet: the caller's tail value is not the boundary Result — ` +
        `${JSON.stringify(tail)}`,
    );
  }
  return tail;
}

/** The prompt leg's outcome rendered for an assertion message, signed zeros intact. */
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
 * Drive the SHIPPED child-side writer `driveSubagentRootRegime`
 * (`src/extension/production-theta-producer.ts`, found by symbol) over a callee
 * whose whole body is `body`, capturing every `theta_result` line and every
 * diagnostic. This is the writer route (a) changes: its `terminal.ok` arm calls
 * `emitEnvelope(serializeOkEnvelope(terminal.value))` once the two existing
 * sub-checks defer, and a `-0` payload takes that arm today with `diagnostics:
 * []` — which route (a) preserves. The fix is silent-and-correct, not a new
 * refusal.
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
function soleEnvelope(drive: ChildDrive): EnvelopeParse {
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

// ===========================================================================
// (SPELLING) §Reproduction (a) — the value is minted from clean source and its
// sign is observable from theta code. GREEN NOW and GREEN AFTER: §Fix (e)(1)
// fixes that no route touches the operators, and
// `tests/expression-evaluator.test.ts:207` / `:213` own the `/` and `%` halves.
// ===========================================================================

describe("bug 0188 (SPELLING) — the four spellings that mint -0, and the two +0 controls", () => {
  it("CONTROL (SPELLING-PARSE): every spelling parses with [] diagnostics and evaluates to the signed zero it names (green now, green after)", () => {
    // `docs/spec_topics/expressions.md:232` mints all four: the first two by its
    // `*` rule, the third by its `/` rule, the fourth by its unary-minus rule.
    // The parse half runs through the REAL `parseThetaDocument` (over a whole
    // document, frontmatter included) and the evaluation half through the REAL
    // `evaluateSource` (`src/runtime/expression-evaluator.ts:92`), so this cell
    // establishes the report's premise rather than assuming it.
    const rows: readonly { readonly source: string; readonly sign: string }[] = [
      { source: "0 * -1", sign: "-0" },
      { source: "-1 * 0", sign: "-0" },
      { source: "0 / -1", sign: "-0" },
      { source: "-0", sign: "-0" },
      // The `+0` controls: same magnitude, same `==` class, opposite sign.
      { source: "0 - 0", sign: "0" },
      { source: "0 * 1", sign: "0" },
    ];
    for (const row of rows) {
      const doc = parseThetaDocument(
        { path: "spelling.theta", bytes: new TextEncoder().encode(PROMPT_FM + row.source + "\n") },
        parseDeps(),
      );
      expect(
        doc.diagnostics.map((d) => d.code),
        `'${row.source}' is clean source — no route refuses it (§Fix (e)(1))`,
      ).toEqual([]);
      expect(
        signedZeroForm(evaluateSource(row.source, PURE_EVAL_HOST)),
        `'${row.source}' evaluates to ${row.sign}`,
      ).toBe(row.sign);
    }
  });

  it("CONTROL (SPELLING-OBSERVABLE): division observes the sign, which is what makes the loss a value defect (green now, green after)", () => {
    // `expressions.md:232` names `-Infinity` among division's specified results,
    // and `1 / x` produces it only when `x` is `-0` (or the numerator is
    // negative). So the specified result set presupposes the sign is carried —
    // the argument that separates this class from a JS trivium.
    const rows: readonly { readonly source: string; readonly value: string }[] = [
      { source: "1 / (0 * -1)", value: "-Infinity" },
      { source: "1 / -0", value: "-Infinity" },
      { source: "1 / 0", value: "Infinity" },
      { source: "1 / (0 * 1)", value: "Infinity" },
      { source: "1 / (0 - 0)", value: "Infinity" },
      { source: "-1 / 0", value: "-Infinity" },
    ];
    for (const row of rows) {
      expect(
        String(evaluateSource(row.source, PURE_EVAL_HOST)),
        `'${row.source}' is the reciprocal channel that distinguishes the two zeros`,
      ).toBe(row.value);
    }
  });
});

// ===========================================================================
// (SEAM) The emitted bytes. §Reproduction (c), re-driven at the seam route (a)
// changes: `serializeOkEnvelope` (`src/runtime/subagent-envelope.ts:121`).
//
// RED NOW. `JSON.stringify(-0)` is `"0"` and no `replacer` / `toJSON` hook
// changes that (§Reproduction (b)), so the writer emits a `0` the JSON GRAMMAR
// would have carried as `-0` — `JSON.parse("-0")` IS `-0`. Route (a) emits the
// form the format admits, at every position `JSON.stringify`'s own traversal
// reaches.
// ===========================================================================

describe("bug 0188 (SEAM) — serializeOkEnvelope emits the -0 form the JSON grammar admits", () => {
  it("RED (SEAM-ROOT): a root-position -0 serialises as -0 (red now, green after)", () => {
    // PRIMARY. `invocation.md:36` specifies the envelope as this leg's CARRIAGE
    // for the final value; nothing specifies it as a transform on the values it
    // carries. Today the bytes for `-0` and `+0` are IDENTICAL, which is why no
    // parent-side route can recover the sign (§Fix, "the sign cannot be recovered
    // parent-side") and why route (a) is confined to the writer.
    expect(
      serializeOkEnvelope(-0),
      `PRIMARY (bug 0188 §Fix (a)): the writer must emit the sign the grammar admits — ` +
        `JSON.parse("-0") already recovers -0, so the parent needs no change`,
    ).toBe('{"theta_result":{"v":1,"ok":-0}}\n');
  });

  it("RED (SEAM-FIELD): a -0 at a schema FIELD serialises as -0 (red now, green after)", () => {
    // §Reproduction (d)'s `NBox { n: 0 * -1, who: "w" }` row, at the seam. The
    // sibling `who` field is asserted in the same bytes so a red cannot be read
    // as a whole-payload change.
    expect(
      serializeOkEnvelope({ n: -0, who: "w" }),
      `PRIMARY (bug 0188 §Fix (a)): a schema field carries the sign, and its siblings are ` +
        `untouched`,
    ).toBe('{"theta_result":{"v":1,"ok":{"n":-0,"who":"w"}}}\n');
  });

  it("RED (SEAM-ARRAY): a -0 ARRAY ELEMENT serialises as -0 beside a finite sibling (red now, green after)", () => {
    expect(
      serializeOkEnvelope([-0, 1]),
      `PRIMARY (bug 0188 §Fix (a)): an array element carries the sign; the finite sibling is ` +
        `byte-unchanged`,
    ).toBe('{"theta_result":{"v":1,"ok":[-0,1]}}\n');
  });

  it("RED (SEAM-DEEP): a -0 nested through objects and arrays serialises as -0 (red now, green after)", () => {
    // The reach of the encoding is exactly `JSON.stringify`'s own traversal, so
    // depth costs it nothing and the writer adds NO new payload walk — which is
    // what satisfies §Fix (e)(7) (CIO-3: any new payload walk is depth-bounded)
    // with nothing to bound. This payload's JSON document is depth 4, inside
    // ceiling #4's cap, so bug 0187's `mapTooDeepReturnValue` defers and the
    // bytes below are the ones actually written.
    expect(
      serializeOkEnvelope({ a: { b: [{ c: -0 }] } }),
      `PRIMARY (bug 0188 §Fix (a)): the encoding's reach is JSON.stringify's reach`,
    ).toBe('{"theta_result":{"v":1,"ok":{"a":{"b":[{"c":-0}]}}}}\n');
  });

  it("RED (SEAM-RESULT-CARRIER): a -0 inside a nested Result carrier serialises as -0 (red now, green after)", () => {
    // The one shape where the module's two BOUNDED walks deliberately stop and
    // `JSON.stringify` does not: neither `firstNonFiniteNumber`
    // (`src/runtime/subagent-envelope.ts:467`) nor `wireFormExceedsDepthCap`
    // (`:566`) descends a `Result`, but `JSON.stringify` descends the `makeOk`
    // carrier's own enumerable `ok` / `value` keys. Route (a) rides
    // `JSON.stringify`'s traversal rather than a walk of its own, so its reach
    // INCLUDES this position — which is a property of the route, asserted here
    // so a later implementation that adds a separate walk cannot silently lose
    // it. The carrier is built through the SHIPPED constructor `makeOk`
    // (`src/runtime/value.ts:475`), never a hand-made `{ ok: true, value }`,
    // because only that constructor installs the brand `isResultValue`
    // classifies by.
    expect(
      serializeOkEnvelope([makeOk(-0), 1]),
      `PRIMARY (bug 0188 §Fix (a)): the encoding rides JSON.stringify's traversal, so it reaches ` +
        `a -0 the module's two bounded walks do not`,
    ).toBe('{"theta_result":{"v":1,"ok":[{"ok":true,"value":-0},1]}}\n');
  });

  it("CONTROL (SEAM-POSITIVE-ZERO): +0 at every one of those positions emits UNCHANGED bytes (green now, green after)", () => {
    // GOV-15 observable (a): route (a) moves the bytes for `-0` and for nothing
    // else. `+0` is the value an author writes as `0 - 0` or `0 * 1`
    // (§Reproduction (a)) and its envelope must be byte-identical before and
    // after — otherwise the change is a re-rendering of zero rather than a
    // preservation of its sign.
    expect(serializeOkEnvelope(0)).toBe('{"theta_result":{"v":1,"ok":0}}\n');
    expect(serializeOkEnvelope({ n: 0, who: "w" })).toBe(
      '{"theta_result":{"v":1,"ok":{"n":0,"who":"w"}}}\n',
    );
    expect(serializeOkEnvelope([0, 1])).toBe('{"theta_result":{"v":1,"ok":[0,1]}}\n');
    expect(serializeOkEnvelope({ a: { b: [{ c: 0 }] } })).toBe(
      '{"theta_result":{"v":1,"ok":{"a":{"b":[{"c":0}]}}}}\n',
    );
    expect(serializeOkEnvelope([makeOk(0), 1])).toBe(
      '{"theta_result":{"v":1,"ok":[{"ok":true,"value":0},1]}}\n',
    );
  });
});

// ===========================================================================
// (TRIP) The round trip. §Reproduction (c)'s "re-read" column, which is what
// the parent actually binds.
//
// RED NOW on the VALUE only: `parseEnvelopeLine` is unchanged by route (a) and
// already recovers `-0` from a line that carries it (§Reproduction (b)).
// ===========================================================================

describe("bug 0188 (TRIP) — the parent re-reads the sign the child wrote", () => {
  it("RED (TRIP-POSITIONS): parseEnvelopeLine(serializeOkEnvelope(x)) recovers Object.is(-0) at every position (red now, green after)", () => {
    // PRIMARY. This is the composition that decides what a subagent-leg caller
    // binds: the child's writer, then the parent's reader
    // (`src/runtime/subagent-envelope.ts:254`), then the driver's settle
    // (`src/runtime/subagent-json-driver.ts:118`, `:121`). The reader is
    // UNCHANGED by route (a) — the JSON grammar already carries the sign — so
    // every red here is the writer's.
    const rows: readonly {
      readonly value: unknown;
      readonly path: readonly (string | number)[];
      readonly label: string;
    }[] = [
      { value: -0, path: [], label: "root" },
      { value: { n: -0, who: "w" }, path: ["n"], label: "schema field /n" },
      { value: [-0, 1], path: [0], label: "array element /0" },
      { value: { a: { b: [{ c: -0 }] } }, path: ["a", "b", 0, "c"], label: "deep /a/b/0/c" },
      { value: [makeOk(-0), 1], path: [0, "value"], label: "nested Result carrier /0/value" },
    ];
    for (const row of rows) {
      const line = serializeOkEnvelope(row.value);
      const reread = okValueOf(parseEnvelopeLine(line.trimEnd()), row.label);
      expect(
        signedZeroForm(memberAt(reread, row.path, row.label)),
        `PRIMARY (bug 0188 §Fix (a)): the value the parent re-reads at ${row.label} must be the ` +
          `value the callee produced — observed line ${JSON.stringify(line)}`,
      ).toBe("-0");
    }
  });

  it("CONTROL (TRIP-POSITIVE-ZERO): +0 re-reads as +0 at every one of those positions (green now, green after)", () => {
    const rows: readonly {
      readonly value: unknown;
      readonly path: readonly (string | number)[];
      readonly label: string;
    }[] = [
      { value: 0, path: [], label: "root" },
      { value: { n: 0, who: "w" }, path: ["n"], label: "schema field /n" },
      { value: [0, 1], path: [0], label: "array element /0" },
      { value: { a: { b: [{ c: 0 }] } }, path: ["a", "b", 0, "c"], label: "deep /a/b/0/c" },
      { value: [makeOk(0), 1], path: [0, "value"], label: "nested Result carrier /0/value" },
    ];
    for (const row of rows) {
      const reread = okValueOf(parseEnvelopeLine(serializeOkEnvelope(row.value).trimEnd()), row.label);
      expect(
        signedZeroForm(memberAt(reread, row.path, row.label)),
        `the +0 control at ${row.label} keeps re-reading +0`,
      ).toBe("0");
    }
  });
});

// ===========================================================================
// (CHILD) The REAL child-side writer, driven in-process. §Reproduction (d)'s
// subagent rows.
//
// RED NOW on the bytes. GREEN in both directions on `diagnostics: []` — route
// (a) is silent-and-correct, not a new refusal, which is what distinguishes it
// from bug 0180's §Fix (b) and from this report's own §Fix (b).
// ===========================================================================

describe("bug 0188 (CHILD) — driveSubagentRootRegime writes the sign the callee produced", () => {
  it("RED (CHILD-ROOT): a callee whose final value is 0 * -1 writes an ok envelope carrying -0, with no diagnostic (red now, green after)", async () => {
    const drive = await driveChildRoot("0 * -1\n");

    // PRIMARY. §Reproduction (d): today this drive writes
    // `{"theta_result":{"v":1,"ok":0}}` with `diagnostics: []`, the parent
    // re-reads `+0`, and the caller's own `1 / z` flips sign — GOV-15 observable
    // (a) moving on the callee's `mode:` frontmatter alone.
    expect(
      drive.lines,
      `PRIMARY (bug 0188 §Fix (a)): the child must write the sign it computed` +
        driveDetail(drive),
    ).toEqual(['{"theta_result":{"v":1,"ok":-0}}\n']);

    // NOTHING REPORTS, before or after. Route (a) preserves the value rather
    // than refusing it (§Fix (e)(6)), so an empty diagnostic drain is part of
    // the asserted end state — a red here would mean the detection widened.
    expect(
      drive.diagnostics,
      `route (a) is silent-and-correct: no diagnostic is emitted, before or after` +
        driveDetail(drive),
    ).toEqual([]);

    const parse = soleEnvelope(drive);
    expect(
      signedZeroForm(okValueOf(parse, "CHILD-ROOT")),
      `and the parent re-reads the callee's own -0`,
    ).toBe("-0");
  });

  it("RED (CHILD-FIELD): NBox { n: 0 * -1, who: \"w\" } writes -0 at /n with no diagnostic (red now, green after)", async () => {
    const drive = await driveChildRoot(NBOX_DECL + 'NBox { n: 0 * -1, who: "w" }\n');
    expect(
      drive.lines,
      `PRIMARY (bug 0188 §Fix (a)): the nullable schema field carries the sign` +
        driveDetail(drive),
    ).toEqual(['{"theta_result":{"v":1,"ok":{"n":-0,"who":"w"}}}\n']);
    expect(drive.diagnostics, `and nothing reports` + driveDetail(drive)).toEqual([]);
    expect(
      signedZeroForm(memberAt(okValueOf(soleEnvelope(drive), "CHILD-FIELD"), ["n"], "/n")),
      `the parent re-reads -0 at /n`,
    ).toBe("-0");
  });

  it("RED (CHILD-ARRAY): [0 * -1] writes -0 at /0 with no diagnostic (red now, green after)", async () => {
    const drive = await driveChildRoot("[0 * -1]\n");
    expect(
      drive.lines,
      `PRIMARY (bug 0188 §Fix (a)): the array element carries the sign` + driveDetail(drive),
    ).toEqual(['{"theta_result":{"v":1,"ok":[-0]}}\n']);
    expect(drive.diagnostics, `and nothing reports` + driveDetail(drive)).toEqual([]);
    expect(
      signedZeroForm(memberAt(okValueOf(soleEnvelope(drive), "CHILD-ARRAY"), [0], "/0")),
      `the parent re-reads -0 at /0`,
    ).toBe("-0");
  });

  it("CONTROL (CHILD-POSITIVE-ZERO): the +0 spellings still write byte-identical ok envelopes (green now, green after)", async () => {
    // GOV-15 observable (a) on the same leg: a `+0` payload's bytes must not
    // move. Both spellings `expressions.md:232` mints as `+0`, plus the two
    // finite controls the 0180 witness already drives at this writer.
    const rows: readonly { readonly body: string; readonly line: string }[] = [
      { body: "0 * 1\n", line: '{"theta_result":{"v":1,"ok":0}}\n' },
      { body: "0 - 0\n", line: '{"theta_result":{"v":1,"ok":0}}\n' },
      {
        body: NBOX_DECL + 'NBox { n: 0 * 1, who: "w" }\n',
        line: '{"theta_result":{"v":1,"ok":{"n":0,"who":"w"}}}\n',
      },
      { body: "[0 * 1]\n", line: '{"theta_result":{"v":1,"ok":[0]}}\n' },
      { body: "3 / 2\n", line: '{"theta_result":{"v":1,"ok":1.5}}\n' },
      { body: "[1, 2]\n", line: '{"theta_result":{"v":1,"ok":[1,2]}}\n' },
    ];
    for (const row of rows) {
      const drive = await driveChildRoot(row.body);
      expect(
        drive.lines,
        `${row.body.trim()} writes exactly one ok envelope, byte-unchanged` + driveDetail(drive),
      ).toEqual([row.line]);
      expect(drive.diagnostics, `${row.body.trim()} emits no diagnostic`).toEqual([]);
    }
  });

  it("CONTROL (CHILD-VERSION): the sign-carrying envelope rides the pinned version and reserved key (green now for the shape, green after)", async () => {
    // PIC-59 versions the envelope schema (`subagent.md:101`). Route (a) changes
    // the RENDERING of one leaf; the payload shape, the key set and the parse
    // behaviour are unchanged, which is the ground on which the route argues it
    // is not a schema change. Asserted over a `+0` drive so this cell is a shape
    // lock rather than a second copy of the CHILD-ROOT red.
    const drive = await driveChildRoot("0 * 1\n");
    const parsed = JSON.parse((drive.lines[0] as string).trimEnd()) as Record<string, unknown>;
    expect(Object.keys(parsed), "one reserved top-level key").toEqual([THETA_RESULT_KEY]);
    const payload = parsed[THETA_RESULT_KEY] as Record<string, unknown>;
    expect(payload["v"], "riding the pinned envelope version").toBe(THETA_ENVELOPE_VERSION);
    expect(Object.keys(payload), "and the pinned ok-arm key set").toEqual(["v", "ok"]);
  });
});

// ===========================================================================
// (VERDICT) The parent's gate and its bind. §Reproduction (d)'s AJV block.
//
// The VERDICTS already agree between the two legs and between the two signs —
// that is why this report engages no AJV flag and why bug 0180's §Fix (d) has no
// analogue here (§Non-goals). This cell pins the verdicts UNCHANGED and reds on
// the VALUE.
// ===========================================================================

describe("bug 0188 (VERDICT) — every lowered numeric annotation admits both signs; only the value differs", () => {
  it("RED (VERDICT-BIND): number, integer and number | null all verdict {\"ok\":true} for both signs, and the re-read value keeps its sign (red now, green after)", () => {
    const validator = realAjvValidator();
    const annotations: readonly { readonly annotation: string; readonly lowered: string }[] = [
      { annotation: "number", lowered: '{"type":"number"}' },
      { annotation: "integer", lowered: '{"type":"integer"}' },
      { annotation: "number | null", lowered: '{"type":["number","null"]}' },
    ];

    for (const row of annotations) {
      const lowered = loweredFor(row.annotation);
      expect(
        JSON.stringify(lowered),
        `${row.annotation} lowers through the real lowerQueryResponseSchema ` +
          `(src/runtime/query-schema-lowering.ts:123)`,
      ).toBe(row.lowered);

      const compiled = validator.compile(lowered);
      // UNCHANGED, both directions: route (a) engages no validator flag. The
      // production seam's construction (`src/seams/schema-validator.ts:112`)
      // is untouched, so the pair of verdicts below is identical before and
      // after — which is exactly why nothing reports the divergence today.
      expect(
        compiled.validate(-0),
        `${row.annotation} admits -0 today and must keep admitting it`,
      ).toEqual({ ok: true });
      expect(
        compiled.validate(0),
        `${row.annotation} admits +0 today and must keep admitting it`,
      ).toEqual({ ok: true });

      // PRIMARY. The verdicts agree; the VALUE is what diverges. This is the
      // value `#validateInvokeReturn`'s `verdict.ok` arm binds — it binds the
      // ORIGINAL value, so on the subagent leg it is the driver's re-read one
      // (`src/extension/production-theta-producer.ts`, named by symbol).
      const reread = okValueOf(
        parseEnvelopeLine(serializeOkEnvelope(-0).trimEnd()),
        `${row.annotation} re-read`,
      );
      expect(
        compiled.validate(reread),
        `and the re-read value still validates under ${row.annotation}`,
      ).toEqual({ ok: true });
      expect(
        signedZeroForm(reread),
        `PRIMARY (bug 0188 §Fix (a)): under ${row.annotation} the parent must bind the sign the ` +
          `callee produced — the verdict was never the problem`,
      ).toBe("-0");
    }
  });
});

// ===========================================================================
// (HARM) §Reproduction (d)'s `--- E ---` block: the caller's own arithmetic over
// the value it bound. This is the cell that measures the HARM rather than the
// mechanism, and it is the one that proves `invocation.md:36`'s mode-invariance
// restored — the same caller and the same callee body computing opposite-signed
// infinities selected by one frontmatter line.
// ===========================================================================

/**
 * §Reproduction (d)'s caller verbatim: bind the callee's value, unwrap it, and
 * return the reciprocal. `1 / z` is the one channel that observes the sign
 * (`expressions.md:232`).
 */
const HARM_CALLER_BODY =
  `let r = invoke<number>("${CALLEE_PATH}")\n` +
  "let z = match r { Ok(v) => v, Err(e) => 1 }\n" +
  "Ok(1 / z)\n";

describe("bug 0188 (HARM) — the same caller body over the same callee body, on both legs", () => {
  it("CONTROL (HARM-PROMPT): the prompt→prompt attach leg computes Ok(-Infinity) for a 0 * -1 callee, and Ok(Infinity) for the +0 control (green now, green after)", async () => {
    // GOV-15 observable (a), the ZERO-FLIP half: route (a) is child-side only,
    // so no prompt-leg input moves. `invocation.md:36`'s mode-invariance is
    // restored by lifting the subagent leg to THIS leg's behaviour, never by
    // lowering this one (which is what §Fix (c) would have done, and which the
    // report costs as "destroys information on the leg that currently preserves
    // it").
    const negative = await drivePromptLeg({
      callerBody: HARM_CALLER_BODY,
      calleeBody: "0 * -1\n",
    });
    expect(
      negative.ok,
      `the prompt leg binds Ok today and must keep binding it — ${promptOutcome(negative)}`,
    ).toBe(true);
    if (negative.ok) {
      expect(
        String(negative.value),
        `the caller's own 1 / z over a -0 bind is -Infinity, a value expressions.md:232 names`,
      ).toBe("-Infinity");
    }

    const control = await drivePromptLeg({ callerBody: HARM_CALLER_BODY, calleeBody: "0 * 1\n" });
    expect(control.ok, `the +0 control binds Ok — ${promptOutcome(control)}`).toBe(true);
    if (control.ok) {
      expect(String(control.value), `and its reciprocal is Infinity, unchanged`).toBe("Infinity");
    }
  });

  it("RED (HARM-SUBAGENT): the subagent leg must compute the SAME -Infinity for the same callee body (red now, green after)", async () => {
    // The subagent leg composed from the SHIPPED seams: the real child-side
    // writer, the real parent-side reader, and the real interpreter evaluating
    // the caller's own `1 / z` over what the parent bound. The one thing not
    // driven is the process boundary — the parent's bind over REAL spawned
    // children is already measured by the committed integration witness
    // `tests/subagent-invoke-nonfinite-return-refusal.test.ts` (its `negVal`
    // cell at `:541`, which asserts the caller binds `-0`).
    const drive = await driveChildRoot("0 * -1\n");
    const bound = okValueOf(soleEnvelope(drive), "HARM-SUBAGENT") as ThetaValue;

    // The root cause, stated as its own assertion so the red names the sign
    // rather than only the infinity derived from it.
    expect(
      signedZeroForm(bound),
      `PRIMARY (bug 0188 §Fix (a)): the value the subagent-leg caller binds must be the value ` +
        `the callee produced` + driveDetail(drive),
    ).toBe("-0");

    // The harm itself: the identical caller body, evaluated by the SHIPPED
    // interpreter over the bound value.
    expect(
      String(evaluateSource("1 / z", hostBinding("z", bound))),
      `PRIMARY (bug 0188): invocation.md:36 fixes the return surface as mode-invariant, so the ` +
        `same caller and the same callee body must not compute opposite-signed infinities ` +
        `selected by the callee's mode: frontmatter` + driveDetail(drive),
    ).toBe("-Infinity");
  });

  it("CONTROL (HARM-BOTH-LEGS-POSITIVE-ZERO): the 0 * 1 control computes Infinity on BOTH legs (green now, green after)", async () => {
    // The over-reach fence for the harm cell: route (a) must move the `-0`
    // caller and nothing else. A `+0` callee's caller computes `Infinity` on both
    // legs today and must keep doing so.
    const prompt = await drivePromptLeg({ callerBody: HARM_CALLER_BODY, calleeBody: "0 * 1\n" });
    expect(prompt.ok, `prompt leg — ${promptOutcome(prompt)}`).toBe(true);
    if (prompt.ok) {
      expect(String(prompt.value), "prompt leg reciprocal").toBe("Infinity");
    }

    const drive = await driveChildRoot("0 * 1\n");
    const bound = okValueOf(soleEnvelope(drive), "HARM-CONTROL") as ThetaValue;
    expect(signedZeroForm(bound), `subagent leg binds +0` + driveDetail(drive)).toBe("0");
    expect(
      String(evaluateSource("1 / z", hostBinding("z", bound))),
      "subagent leg reciprocal",
    ).toBe("Infinity");
  });
});

// ===========================================================================
// (BYTES) The no-blast-radius witness. GREEN NOW and GREEN AFTER.
//
// This is the structural property route (a) rests on: the encoder's first pass
// is `JSON.stringify` with an IDENTITY replacer that merely RECORDS whether a
// `-0` number leaf was seen, so for every payload carrying no `-0` the emitted
// bytes are `JSON.stringify`'s own. If this cell can red, the route has changed
// the wire for payloads the report never touches — which is the GOV-15
// observable-(a) cost §Fix (a) claims it does not pay.
// ===========================================================================

describe("bug 0188 (BYTES) — every -0-FREE payload emits byte-identical bytes to plain JSON.stringify", () => {
  it("CONTROL (BYTES-IDENTICAL): the corpus spanning every shape the envelope carries is byte-identical (green now, green after)", () => {
    const corpus: readonly { readonly value: unknown; readonly label: string }[] = [
      { value: null, label: "null" },
      { value: true, label: "true" },
      { value: false, label: "false" },
      { value: 0, label: "+0 — the control the whole route turns on" },
      { value: 42, label: "a positive integer" },
      { value: -1, label: "a negative integer (the sign JSON.stringify DOES emit)" },
      { value: 1e21, label: "1e21 — the exponent form JSON.stringify switches to" },
      { value: 5e-324, label: "5e-324 — the smallest subnormal" },
      { value: -0.5, label: "-0.5 — a negative fraction, BNDR-5's own example" },
      { value: "", label: "the empty string" },
      { value: '"\\\n\t\u0000', label: "a string needing every escape class" },
      { value: "héllo — 𝄞", label: "non-ASCII plus an astral pair" },
      { value: "-0", label: "the STRING '-0' — textual, not a number leaf" },
      {
        value: '{"theta_result":{"v":1,"ok":-0}}',
        label: "an author string that spells this very envelope",
      },
      { value: { "-0": 1 }, label: "a record KEY spelling -0" },
      { value: [], label: "the empty array" },
      { value: {}, label: "the empty object" },
      { value: [[1, 2], [3]], label: "nested arrays" },
      { value: { a: { b: { c: 1 } } }, label: "nested objects" },
      { value: { n: 2, who: "w" }, label: "a schema-shaped record" },
      {
        value: makeEnumValue("Colour", "red"),
        label: "the boxed-String enum carrier (src/runtime/value.ts:135)",
      },
      {
        value: [makeOk(1), 2],
        label: "a nested Result carrier with finite members (src/runtime/value.ts:475)",
      },
    ];

    // Pinned separately so a red distinguishes "the corpus shrank" from "a row
    // diverged" — §Fix (a)'s no-blast-radius claim is about BREADTH as much as
    // about each row.
    expect(corpus.length, "the sweep spans at least a dozen shapes").toBeGreaterThanOrEqual(12);

    for (const row of corpus) {
      const expected = `${JSON.stringify({
        [THETA_RESULT_KEY]: { v: THETA_ENVELOPE_VERSION, ok: row.value },
      })}\n`;
      expect(
        serializeOkEnvelope(row.value),
        `${row.label}: a payload carrying no -0 must emit exactly JSON.stringify's own bytes — ` +
          `this is the structural property route (a) rests on (§Fix (a))`,
      ).toBe(expected);
    }
  });
});

// ===========================================================================
// (SENTINEL) Collision-freedom. RED NOW.
//
// Route (a) cannot go through `JSON.stringify` alone — measured, no `replacer`
// and no `toJSON` can make it emit the sign (§Reproduction (b)) — so the shipped
// encoder substitutes a deterministic sentinel STRING for each `-0` number leaf
// and then textually replaces the emitted `"<sentinel>"` token with `-0`. The
// sentinel is doubled while it occurs in the first pass's output, so it is
// provably absent from the document it is substituted into.
//
// The BYTES are not asserted here: the sentinel's exact spelling is the landing
// implementation's, not this file's. The two PROPERTIES are, structurally — an
// author's own string data survives byte-exact, and the `-0` beside it keeps its
// sign.
// ===========================================================================

/** The seed the shipped encoder doubles until absent. Named for the reader; never asserted as bytes. */
const SENTINEL_SEED = "theta_negative_zero_sentinel";

describe("bug 0188 (SENTINEL) — author string data that spells the sentinel survives beside a -0", () => {
  it("RED (SENTINEL-COLLISION): a payload whose own string is the sentinel seed keeps that string AND the sign, byte-exact (red now, green after)", () => {
    // Tightened from property assertions to exact-byte assertions now that the
    // sentinel spelling (`NEGATIVE_ZERO_SENTINEL_SEED`,
    // `src/runtime/subagent-envelope.ts`) is landed: for each `authorString` the
    // seed is doubled once per occurrence still found in pass 1's own output
    // (§Fix (a)'s collision-freedom argument — SEED for `authorString ===
    // SEED`, since pass 1 already contains one bare copy of it; SEED doubled
    // again for `authorString === SEED + SEED`, since pass 1 then contains one
    // bare copy of THAT), so the byte sequence below is exactly what the
    // shipped encoder emits, not merely a property it satisfies.
    const rows: readonly { readonly authorString: string; readonly line: string }[] = [
      {
        authorString: SENTINEL_SEED,
        line: '{"theta_result":{"v":1,"ok":{"s":"theta_negative_zero_sentinel","n":-0}}}\n',
      },
      {
        authorString: SENTINEL_SEED + SENTINEL_SEED,
        line:
          '{"theta_result":{"v":1,"ok":{"s":"theta_negative_zero_sentineltheta_negative_zero_sentinel",' +
          '"n":-0}}}\n',
      },
    ];

    for (const row of rows) {
      const line = serializeOkEnvelope({ s: row.authorString, n: -0 });

      // PRIMARY. Byte-exact: the author's own string survives verbatim and the
      // `-0` beside it crosses with its sign, in the exact bytes the encoder
      // emits — not merely a property ("contains", "re-reads as") those bytes
      // happen to satisfy.
      expect(
        line,
        `PRIMARY (bug 0188 §Fix (a)): the author's own string survives byte-exact and the -0 ` +
          `beside it crosses with its sign — observed ${JSON.stringify(line)}`,
      ).toBe(row.line);

      const reread = okValueOf(parseEnvelopeLine(line.trimEnd()), "SENTINEL-COLLISION");
      expect(memberAt(reread, ["s"], "/s"), "and re-reads unchanged").toBe(row.authorString);
      expect(signedZeroForm(memberAt(reread, ["n"], "/n")), "with its sign intact").toBe("-0");
    }
  });
});

// ===========================================================================
// (FENCE-DEPTH) Bug 0187's shipped depth refusal and its sub-check ORDER.
// GREEN NOW and GREEN AFTER: route (a) changes SERIALISATION, and the DEPTH walk
// runs before serialisation and is untouched.
// ===========================================================================

describe("bug 0188 (FENCE-DEPTH) — bug 0187's depth refusal and its ordering are unaffected", () => {
  it("CONTROL (FENCE-DEPTH-NESTED-RESULT): mapTooDeepReturnValue over a nested Result stays undefined (green now, green after)", () => {
    // Bug 0187's `CONTROL (FENCE-NESTED-RESULT)` disposition
    // (`tests/subagent-return-depth-refusal.test.ts:657`), re-pinned here under
    // bug 0188's authority because route (a) DOES reach inside a `Result` (the
    // `SEAM-RESULT-CARRIER` cell above) while `wireFormExceedsDepthCap`
    // (`src/runtime/subagent-envelope.ts:566`) deliberately does not. The two
    // are different questions: the DEPTH walk's non-descent of a `Result` is a
    // statement about what that walk counts, and a change to how a number LEAF
    // is rendered does not move it. PIC-59 states the bound normatively as its
    // *Result-carriage bound* (`subagent.md:115`).
    expect(
      mapTooDeepReturnValue([makeOk([[[[[1]]]]]), 1], "./k.theta"),
      "a payload whose depth is contributed only from inside a nested Result stays admitted",
    ).toBeUndefined();
  });

  it("CONTROL (FENCE-DEPTH-REFUSAL): a >cap payload is still refused, and the cap and message are still the shipped ones (green now, green after)", () => {
    expect(MAX_JSON_DEPTH, "docs/spec_topics/schema-subset.md — the shipped cap").toBe(5);
    expect(
      DEPTH_VIOLATION_MESSAGE,
      "docs/spec_topics/schema-subset.md §Error shape — the canonical depth message",
    ).toBe("JSON document depth exceeds 5");
    expect(
      mapTooDeepReturnValue([[[[[[1]]]]]], "./k.theta")?.message,
      "a finite payload past the cap still refuses",
    ).toBe(DEPTH_VIOLATION_MESSAGE);
  });

  it("CONTROL (FENCE-DEPTH-ORDER): a >cap payload that ALSO carries a -0 still takes the DEPTH refusal, with no ok envelope at all (green now, green after)", async () => {
    // The ordering fence, on the REAL writer. `driveSubagentRootRegime`'s
    // `terminal.ok` arm consults `mapTooDeepReturnValue` FIRST, then
    // `mapNonRepresentableReturnValue`, then `serializeOkEnvelope` — so a route
    // that changes only the third must leave the first two deciding exactly what
    // they decide today. A red here means route (a) reordered the arm or moved a
    // refusal.
    const drive = await driveChildRoot("[[[[[[0 * -1]]]]]]\n");
    const parse = soleEnvelope(drive);
    expect(
      parse.kind,
      `the depth refusal wins: no ok envelope is written at all` + driveDetail(drive),
    ).toBe("err");
    if (parse.kind !== "err") {
      return;
    }
    const error = parse.error as unknown as Record<string, unknown>;
    expect(error["message"], "carrying the canonical depth message" + driveDetail(drive)).toBe(
      DEPTH_VIOLATION_MESSAGE,
    );
    expect(error["cause"], "on the existing return_validation cause").toBe("return_validation");
    expect(
      drive.diagnostics,
      "and the depth refusal still emits nothing on the diagnostic channel" + driveDetail(drive),
    ).toEqual([]);
  });
});

// ===========================================================================
// (FENCE-DETECTION) §Fix (e)(6) — the detection predicate stays FINITENESS.
// GREEN NOW and GREEN AFTER.
// ===========================================================================

describe("bug 0188 (FENCE-DETECTION) — route (a) does not widen bug 0180's finiteness predicate", () => {
  it("CONTROL (FENCE-DETECTION): mapNonRepresentableReturnValue admits -0 at every position (green now, green after)", () => {
    // §Fix (e)(6): "a route that does not widen it (a), (c), (d) says so, so a
    // later reader does not infer that `-0` was overlooked." STATED PLAINLY:
    // route (a) does NOT widen the predicate, and `-0` was NOT overlooked when
    // bug 0180 shipped this search. The shipped leaf test is
    // `Number.isFinite(value)` (`src/runtime/subagent-envelope.ts:476`) inside
    // `firstNonFiniteNumber` (`:467`), consulted by
    // `mapNonRepresentableReturnValue` (`:684`), and `-0` is finite — correctly,
    // by that search's own stated class. Route (a) closes this report by
    // PRESERVING the value in the writer, not by teaching the detection to
    // refuse it: a refusal would newly turn a today-succeeding call into an
    // `Err` (the GOV-15 cost §Fix (b) carries and §Fix (a) does not).
    const positions: readonly { readonly value: unknown; readonly label: string }[] = [
      { value: -0, label: "the root" },
      { value: { n: -0, who: "w" }, label: "a schema field" },
      { value: [-0, 1], label: "an array element" },
      { value: { a: { b: [{ c: -0 }] } }, label: "a nested position" },
    ];
    for (const position of positions) {
      expect(
        mapNonRepresentableReturnValue(position.value, CALLEE_PATH),
        `-0 at ${position.label} is finite, so the representability search must keep admitting ` +
          `it — ${render(position.value)}`,
      ).toBeUndefined();
    }

    // The other direction, so the fence BOUNDS the predicate rather than
    // blessing everything numeric: the non-finite class bug 0180 closed at
    // 0.105.0 is untouched (§Non-goals, "Bug 0180's non-finite class").
    expect(
      mapNonRepresentableReturnValue(Infinity, CALLEE_PATH)?.error.message,
      "and the non-finite class still refuses, by name",
    ).toBe("subagent return value is not JSON-representable: Infinity");
  });
});

// ===========================================================================
// (BOUNDARY) §Fix (e)(1)(2)(3) — the boundaries route (a) stops at.
// GREEN NOW and GREEN AFTER.
//
// These are thin RE-ASSERTIONS under bug 0188's authority; the owning witnesses
// are named per assertion and are not touched by this file. What they fence is
// the scope of route (a): it preserves the sign on the WIRE, and changes nothing
// about how the value RENDERS or COMPARES —
// `docs/spec_topics/diagnostics/placeholder-rendering-a.md:79` localises the
// erasure to "the rendering boundary", and route (a) leaves it exactly there.
// ===========================================================================

describe("bug 0188 (BOUNDARY) — the rendering and equality boundaries do not move", () => {
  it("CONTROL (BOUNDARY-CANONICAL): renderCanonicalNumber(-0, …) stays \"0\" for both kinds (green now, green after)", () => {
    // BNDR-6p (`docs/spec_topics/binder/defaulting-system-note-echo.md:66` —
    // "`-0` (integer or number) | `0`"), implemented by `canonicalDecimal`'s
    // `value === 0` arm (`src/render/canonical-number.ts:55`, comment `:54`).
    // OWNED BY `tests/canonical-number-render.test.ts:45` and `:86`.
    expect(renderCanonicalNumber(-0, "integer"), "BNDR-4 / BNDR-6p").toBe("0");
    expect(renderCanonicalNumber(-0, "number"), "BNDR-5 / BNDR-6p").toBe("0");
  });

  it("CONTROL (BOUNDARY-INTERPOLATION): stringifyInterpolatedValue(-0, …) stays {\"ok\":true,\"text\":\"0\"} (green now, green after)", () => {
    // The two interpolation rows
    // (`docs/spec_topics/query/query-escapes-stringification.md:21` and `:22`,
    // both "`-0` → `0`"), implemented by `stringifyInterpolatedValue`
    // (`src/render/query-render.ts:396`). So `${z}` keeps rendering `0` on both
    // legs under route (a) (§Non-goals, "The `-0` → `0` decision at the
    // rendering boundaries"). OWNED BY `tests/placeholder-rendering.test.ts:105`
    // and `tests/argument-echo.test.ts:181-184`.
    expect(stringifyInterpolatedValue(-0, { kind: "number" })).toEqual({ ok: true, text: "0" });
    expect(stringifyInterpolatedValue(-0, { kind: "integer" })).toEqual({ ok: true, text: "0" });
  });

  it("CONTROL (BOUNDARY-EQUALITY): valuesEqual(-0, 0) and valuesEqual(0, -0) stay true (green now, green after)", () => {
    // `docs/spec_topics/runtime-value-model.md:26` fixes `+0 == -0` as `true`,
    // implemented by the numeric compare in `valuesEqual`
    // (`src/runtime/value.ts:564`, under the comment at `:560-561`). Route (a)
    // leaves two values that COMPARE equal and DIVIDE differently — which is
    // IEEE-754, and is already the situation inside a single theta (§Fix (e)(3)).
    // OWNED BY `tests/runtime-value-model.test.ts:89-90`.
    expect(valuesEqual(-0, 0), "runtime-value-model.md:26").toBe(true);
    expect(valuesEqual(0, -0), "both directions").toBe(true);
  });
});
