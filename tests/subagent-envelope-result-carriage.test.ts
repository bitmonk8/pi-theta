// Bug 0201 — neither of the subagent envelope writer's two bounded walks
// descends a `Result`, so a `mode: subagent` callee whose terminal value is
// `[Ok(1 / 0), 1]` writes `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}`
// with an EMPTY diagnostic drain — bug 0180's fabricated `null` alive through
// the `Result` vector — and `[Ok([[[[[1]]]]]), 1]` crosses as an `ok` envelope
// whose wire document is depth 8, where a shallower document outside a carrier
// (`[[[[[[1]]]]]]`, depth 7) refuses `JSON document depth exceeds 5`.
// `docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md`.
//
// THE MECHANISM, in one paragraph. `src/runtime/subagent-envelope.ts` holds two
// bounded walks over a callee's terminal `Ok` payload: `firstNonFiniteNumber`
// (`:544`, bug 0180's non-representability search, which builds the RFC-6901
// pointer its message carries) and `wireFormExceedsDepthCap` (`:628`, bug 0187's
// depth walk). §Actual behaviour 1 and 3 measure each carrying its own arm
// `if (isResultValue(value as ThetaValue)) { return undefined/false; }`, so
// neither walk reaches inside a `Result`; the route below replaces both arms
// with the one shared classifier `classifyWireNode` (`:467`).
// `serializeOkEnvelope` (`:121`) reaches `JSON.stringify` through
// `stringifyPreservingNegativeZero` (`:188`), and the `makeOk` / `makeErr` brand
// is a NON-ENUMERABLE symbol (`src/runtime/value.ts:88`, installed at `:475` /
// `:480`) while `ok` and `value` / `error` are own enumerable string keys — so
// `JSON.stringify` DOES descend the carrier. Consequence: a payload whose
// non-finite `number`, or whose depth, is contributed only from inside a nested
// `Result` is not refused, and the wire carries a fabricated `null` (or a depth-8
// document) with nothing on any channel.
//
// THE ADJUDICATED ROUTE IS §Fix (a) — BOTH WALKS DESCEND THE `Result`'s WIRE
// FORM, settled by the parent before this run and not re-litigated here.
// §Fix (b) (refuse to carry a `Result` at all) and §Fix (c) (state the bound
// more widely and close nothing) are REJECTED. The implementation shape is
// settled with it: ONE shared exported node-level wire-form classifier
// `classifyWireNode` in `src/runtime/subagent-envelope.ts`, with
// `WireNode = scalar | array | record`; a boxed `String` classifies SCALAR (its
// wire form is the primitive string it holds — the deliberate `depthWalk`
// divergence); a `Result` classifies RECORD via `Object.entries` (the brand is a
// symbol, never visited); both walks consult it and carry ZERO carrier arms;
// both keep their own `level > MAX_JSON_DEPTH` fast-fail as the FIRST statement
// (CIO-3, `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:41`).
//
// WHICH INPUTS FLIP, AND WHICH DO NOT. The walk's `level` equals
// `jsonDepth(wire form)` once the carrier is descended as a record, so route (a)
// computes exactly `jsonDepth(wire form) > MAX_JSON_DEPTH`. Measured over the
// shipped counting algorithm (`docs/spec_topics/schema-subset.md:24`–`:30`;
// `jsonDepth`, `src/runtime/depth-walk.ts:141`): `[Ok([[[[[1]]]]]), 1]` is wire
// depth 8 and REFUSES; `[[[[Ok(1)]]]]` is wire depth 6 and REFUSES;
// `[Ok(1), 1]` is wire depth 3 and STAYS ADMITTED. That last row is
// §Reproduction row 3c, and only rejected route (b) would flip it — the
// `WRITER-ROW3C` and `SEAM-DEPTH-ADMITTED` cells below fence it in the
// admitted direction. `[[[[Colour.Red]]]]` likewise stays admitted, because a
// boxed `String` stays a scalar (`SEAM-DEPTH-ENUM-CARRIER`).
//
// THE RFC-6901 POINTER IS THE WIRE-FORM POINTER — `/0/value` for `[Ok(1/0), 1]`,
// `/0/error` for `[Err(1/0), 1]`, `/0/0/value` for `[[Ok(1/0)]]`, `/a/value` for
// a declared-schema field holding the carrier. The alternatives — a pointer to
// the carrier (`/0`), or no pointer for this class — are rejected on three
// grounds, stated rather than re-argued: it is the only truthful locator
// (position `/0` holds a `Result`, not `Infinity`); both walks answer wire-form
// questions by construction, which is why `wireFormExceedsDepthCap` is
// module-private rather than the shipped `depthWalk`; and the bug-0079
// private-field hazard is defused because the `value` / `error` token is DERIVED
// from the encoding by the descent rather than hard-coded, so if
// `docs/spec_topics/runtime-value-model.md:16`'s reference encoding changes the
// pointer changes with it. The pointer's domain is "the RFC-6901 position in the
// JSON document the envelope would have carried", and every pointer asserted
// below is derived from that domain.
//
// SPEC.
//   - `docs/spec_topics/pi-integration-contract/subagent.md:101` (PIC-59) owns
//     the return envelope and its fail-closed inventory. `:114` is *Fail-closed
//     non-representable `Ok` payload* (bug 0180's) and `:115` is *Fail-closed
//     over-deep `Ok` payload* (bug 0187's), which carries the anchored
//     *Result-carriage bound* (`#subagent-envelope-result-carriage-bound`) this
//     report disputes; `:110`'s `Ok`-values bullet is qualified by the same
//     bound ("at any depth **the two walks reach**"). Those sentences are
//     honest at HEAD; route (a) makes them false and they move in the same
//     commit (§Fix (e)(1)–(e)(2)). This file asserts the BEHAVIOUR, not the
//     wording.
//   - `docs/spec_topics/invocation.md:36` (INV-5) requires the parent to derive
//     the `invoke` result solely from the envelope and fixes "never a fabricated
//     `Ok`". A `null` where the callee produced `Infinity` is a fabricated value
//     at whatever position it sits. `:28` (§*Typed return*) fixes that untyped
//     `invoke(...)` returns `Result<null, QueryError>` and discards the child's
//     value — bug 0068's settled discard arm, which is why the PROMPT cells
//     below read `Ok(null)` rather than a payload.
//   - `docs/spec_topics/schema-subset.md:13` states the cap as "≤ 5 levels of
//     nesting at runtime (the JSON document depth, not the schema graph)", `:20`
//     opens §"Depth Enforcement", `:24`–`:30` is the counting algorithm (with no
//     carrier exemption; `:30` "The cap is `depth ≤ 5`") and `:49` (§*Error
//     shape*) fixes the canonical message verbatim. `:84` is *Lowering
//     Algorithm* step 3, which rejects a `Result` in any schema-feeding position
//     at parse time — the ground both carrier arms are argued from, and a
//     statement about TYPED boundaries only.
//   - `docs/spec_topics/runtime-value-model.md:14` (the `Result<T, E>` row) is
//     the sentence "so a `Result` value never crosses the wire", measured false
//     at this wire by the `WRITER-ROW3C` cell. `:16` is the reference-encoding
//     paragraph that fixes the `{ ok, value }` shape and the non-enumerable
//     brand.
//   - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15,
//     observables (a) return values / (b) ordered diagnostic-code sequences /
//     (c) `theta-system-note` content) is why every fence cell below asserts
//     UNCHANGED values: route (a) flips exactly the inputs this report measures
//     and nothing else.
//   - `src/runtime/wire-translation.ts:654` — `projectForValidation`'s own
//     `isResultValue` arm, the statement both envelope walks cited, at HEAD, as
//     their ground. That file is byte-frozen (§Fix (d)(6)) and no cell below
//     requires it to move: it answers for an AJV projection at a TYPED boundary,
//     and the `PROMPT-TYPED` cell pins that its verdict is unchanged.
//
// WHAT EACH TIER ESTABLISHES.
//   (1) SEAM — the two mappers and the serialiser called directly, over
//       `Result`s built with the SHIPPED `makeOk` / `makeErr`, never a hand-made
//       `{ ok, value }` look-alike (only the constructors install the brand
//       `isResultValue` classifies by, so a look-alike would prove nothing —
//       `wireFormExceedsDepthCap` already descends a plain record). Both carrier
//       arms, both directions per assertion, and the pointer spellings. The
//       `Err` arm is the growth row: §Fix (a) names "`value` / `error`", but no
//       §Reproduction row and no committed cell covers it.
//   (2) WRITER — the REAL child-side writer `driveSubagentRootRegime`
//       (`src/extension/production-theta-producer.ts:2193`), driven in-process
//       with the subagent-root regime marker active and both output channels
//       captured, so the sub-check order (`:2307` depth, `:2310`
//       non-representability, `:2318` serialise) and the diagnostic drain are
//       observed on the shipped writer. This is the tier that shows the drain is
//       EMPTY at HEAD.
//   (3) BOUND — the caller-side observable over REAL spawned children through
//       `createProductionSpawnFn`. The unit tiers cannot reach it: what a caller
//       binds is produced by a chain beginning with a real child's stdout and
//       passing through `#resolveReturnSite` / `#validateInvokeReturn`, both
//       private to `ProductionThetaProducer`. Provider-free — every fixture body
//       is a `let` chain ending in a pure tail expression — so this tier belongs
//       in the DEFAULT suite, not the live one.
//   (4) SIGN — the bug-0188 rider, in the POSITIVE direction. `-0` is finite and
//       `stringifyPreservingNegativeZero` owns RENDERING while these two walks
//       decide only REFUSAL, so route (a) cannot regress it. That is an argument;
//       these cells are the measurement.
//   (5) PROMPT — the `prompt`→`prompt` attach leg does not serialise, so route
//       (a) flips ZERO inputs there. Asserted rather than assumed.
//
// TIER JUSTIFICATION. Tiers 1, 2, 4 and 5 are unit: offline, provider-free,
// deterministic, and they reach the seams and the shipped writer directly. Tier
// 3 is integration because the observable the report is about — what a CALLER
// binds — is not reachable in-process. No tier is live: no fixture issues a
// query, so no provider or model participates; the marshalled
// `--provider` / `--model` reference (PIC-62) only satisfies the launch argv
// shape and is never contacted.
//
// TOKENS: none. Every fixture body is a pure tail expression or a `let` chain
// ending in one.
//
// THE CHILD PINS (AGENTS.md `#subagent-child-pins`) are all three, and each is a
// LOUD precondition rather than a skip: `process.argv[1]` replaced by the repo's
// own pi CLI entry through the `ExecutableHost` (under vitest `argv[1]` is
// vitest's entry script, and rung 1 would spawn `node <vitest-entry>` and the
// child would die instantly as a fail-closed infra error);
// `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this working tree's `extensions/` so
// each child loads the build under test rather than an ambient install (bug 0002
// defect 2); and `PI_THETA_SUBAGENT_PARENT_PID` written beside it, because the
// control plane is AUTHENTICATED (`subagent.md`
// `#subagent-control-plane-authentication`) and an unauthenticated pin is
// stripped in silence. `launchSubagentChild` writes the pid variable from its
// `parentPid` argument, and this process is the child's real parent, so the
// value is `process.pid`.
//
// TWO PROTECTED WITNESSES OWN THIS CLASS'S EXISTING ROWS AND ARE NOT TOUCHED
// HERE. `CONTROL (FENCE-NESTED-RESULT)`
// (`tests/subagent-return-depth-refusal.test.ts:650`) and
// `CONTROL (FENCE-DEPTH-NESTED-RESULT)`
// (`tests/subagent-envelope-negative-zero-fidelity.test.ts:1176`) each bound
// `mapTooDeepReturnValue([makeOk([[[[[1]]]]]), 1], …)` in both directions — the
// first under bug 0187's authority, the second under bug 0188's. Route (a)
// falsifies the first direction of each, so both are re-pinned under this
// report's authority in the landing commit (§Fix (d)(2)), in their own files, by
// the implementer — not from here. The additive rows for this class live in this
// file.
//
// DIAGNOSTIC MESSAGES ARE SOURCED FROM THE REGISTRY (DIAG-4,
// `docs/spec_topics/diagnostics/diagnostic-shape.md`), never copied as prose:
// the expected non-representability string is composed from the halves of the
// `theta/runtime/subagent-return-value-not-representable` registry row's
// *Message* template (`docs/spec_topics/diagnostics/code-registry-runtime.md:32`)
// via `registryMessage`, exactly as bug 0180's and bug 0187's witnesses do.

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { createProductionSpawnFn } from "../src/extension/production-subagent-host";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { DEPTH_VIOLATION_MESSAGE, MAX_JSON_DEPTH, jsonDepth } from "../src/runtime/depth-walk";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  driveSubagentChild,
  type SubagentInvocationResult,
} from "../src/runtime/subagent-json-driver";
import {
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_PARENT_PID_ENV,
  type ChildExitInfo,
  type ExecutableHost,
} from "../src/runtime/subagent-launcher";
import * as subagentEnvelope from "../src/runtime/subagent-envelope";
import {
  SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE,
  THETA_ENVELOPE_VERSION,
  mapNonRepresentableReturnValue,
  mapTooDeepReturnValue,
  parseEnvelopeLine,
  serializeOkEnvelope,
  type EnvelopeFailureMapping,
  type EnvelopeParse,
} from "../src/runtime/subagent-envelope";
import { isResultValue, makeEnumValue, makeErr, makeOk, type ResultValue } from "../src/runtime/value";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
  type SchemaValidator,
} from "../src/seams/schema-validator";
import { WallClock } from "../src/seams/wall-clock";

// ===========================================================================
// Shared constants.
//
// Both mappers already EXIST as exports at HEAD (`mapTooDeepReturnValue`,
// `src/runtime/subagent-envelope.ts:707`; `mapNonRepresentableReturnValue`,
// `:741`) — route (a) changes what they answer, not the module's surface — so
// they are imported by name here rather than read off the namespace. The one
// symbol route (a) ADDS is read off the namespace instead (`SHAPE-CLASSIFIER`),
// because a named static import of a missing export fails the whole FILE at
// link time and would take every other cell down with it for a link reason.
// ===========================================================================

/** The repo's pinned pi CLI entry — the SAME executable resolution rung 1 uses in production. */
const PI_CLI_ENTRY = fileURLToPath(
  new URL("../node_modules/@earendil-works/pi-coding-agent/dist/cli.js", import.meta.url),
);

/** This working tree's extension entry (the build under test). */
const EXTENSION_ENTRY = fileURLToPath(new URL("../extensions", import.meta.url));

/**
 * The marshalled model reference riding the child argv (`--provider`/`--model`,
 * PIC-62). NEVER CONTACTED: no fixture below issues a query.
 */
const CHILD_MODEL_PROVIDER = "anthropic";
const CHILD_MODEL_ID = "claude-fable-5";

/** The existing `InvokeInfraCause` both refusals reuse; no enum member is added. */
const RETURN_VALIDATION_CAUSE = "return_validation";

/** The `InvokeInfraError` discriminator every PIC-59 fail-closed class carries. */
const INVOKE_INFRA_KIND = "invoke_infra";

/** The callee path the in-process drives echo, mirroring the 0180 / 0187 unit witnesses'. */
const UNIT_CALLEE_PATH = "./kid.theta";

/** The prompt-leg callee path (a distinct file so a red names which leg it came from). */
const PROMPT_CALLEE_PATH = "./kidp.theta";

// ===========================================================================
// Rendering helpers — a red must name what came back.
// ===========================================================================

/** A payload rendered with its non-finite members legible (`JSON.stringify` renders them `null`). */
function render(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }
  if (value instanceof String) {
    return `String(${JSON.stringify(value.valueOf())})`;
  }
  if (isResultValue(value as never)) {
    const result = value as unknown as ResultValue;
    return result.ok ? `Ok(${render(result.value)})` : `Err(${render(result.error)})`;
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
 * The payload's WIRE FORM — the document `JSON.stringify` writes, read back
 * through `JSON.parse`. Every depth number asserted below is measured over this
 * rather than counted by hand, so a change to the encoding cannot leave a
 * fixture silently mis-labelled.
 */
function wireOf(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/** The whole refusal rendered into an assertion message. */
function detail(refusal: unknown): string {
  return ` — observed ${JSON.stringify(refusal)}`;
}

// ===========================================================================
// The 0180 refusal message, composed from its registry row's halves (DIAG-4).
//
// `docs/spec_topics/diagnostics/diagnostic-shape.md` (DIAG-4) makes the registry
// *Message* column the normative string, so every non-representability
// expectation below is composed from that row's halves rather than copy-pasted
// as prose — the pattern bug 0180's witness
// (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts`) and bug 0187's
// (`tests/subagent-return-depth-refusal.test.ts`) both use.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

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

/** The `<value>` placeholder the 0180 registry row's *Message* template carries. */
const VALUE_PLACEHOLDER = "<value>";

/**
 * Bug 0180's shipped refusal message for a non-finite `value` at `pointer`,
 * composed from the registry template's halves: the head with its trailing `: `
 * stripped, the ` at <pointer>` segment (empty at the payload root), `: `, and
 * the `String(value)` rendering. An absent or malformed row is an unmet
 * precondition of every cell that uses it — bug 0180 shipped the row at 0.105.0,
 * so a throw here is a corpus regression rather than this report's class.
 */
function nonRepresentableMessage(pointer: string, value: number): string {
  const template = registryMessage(REGISTRY, SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE) as
    | string
    | undefined;
  const separator = ": ";
  if (template === undefined || !template.includes(VALUE_PLACEHOLDER)) {
    throw new Error(
      `precondition unmet: docs/spec_topics/diagnostics/code-registry-runtime.md carries no ` +
        `usable Message row for ${SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE} — DIAG-4 makes ` +
        `that column the only source for the refusal string this file asserts. Observed ` +
        `template: ${JSON.stringify(template)}`,
    );
  }
  const cut = template.indexOf(VALUE_PLACEHOLDER);
  const head = template.slice(0, cut);
  const tail = template.slice(cut + VALUE_PLACEHOLDER.length);
  if (!head.endsWith(separator)) {
    throw new Error(
      `precondition unmet: the ${SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE} registry Message ` +
        `template ${JSON.stringify(template)} does not separate its subject from ` +
        `${VALUE_PLACEHOLDER} with ${JSON.stringify(separator)}, so the ' at <pointer>' segment ` +
        `has no anchored insertion point`,
    );
  }
  const subject = head.slice(0, head.length - separator.length);
  const location = pointer.length > 0 ? ` at ${pointer}` : "";
  return `${subject}${location}${separator}${String(value)}${tail}`;
}

/**
 * The full `refuseParams`-shaped assertion for a non-representability refusal at
 * `pointer` naming `value`: the SAME string on `error.message` and
 * `diagnostic.message`, `severity: "error"`, the code read from the module's own
 * exported constant, the `InvokeInfraError` carrier, and the existing
 * `return_validation` cause. `refuseParams`
 * (`src/runtime/subagent-params.ts`, the shape
 * `mapNonRepresentableReturnValue`'s doc-comment names) is what fixes the
 * one-string-two-channels property.
 */
function expectNamedRefusal(
  mapping: EnvelopeFailureMapping | undefined,
  pointer: string,
  value: number,
  label: string,
): void {
  // SOFT on presence only, so a cell looping over several shapes names EVERY
  // shape the seam declined rather than stopping at the first. The field
  // assertions below stay hard: they run only for a mapping that exists, and
  // there a wrong pointer is the finding rather than one of many.
  expect.soft(
    mapping,
    `PRIMARY (bug 0201 §Fix (a)): ${label} must refuse by name at ${pointer}` + detail(mapping),
  ).toBeDefined();
  if (mapping === undefined) {
    return;
  }
  const expected = nonRepresentableMessage(pointer, value);
  expect(mapping.error.kind, `${label}: the carrier is an InvokeInfraError`).toBe(
    INVOKE_INFRA_KIND,
  );
  expect(
    mapping.error.cause,
    `${label}: on the EXISTING return_validation cause — no InvokeInfraCause member is added`,
  ).toBe(RETURN_VALIDATION_CAUSE);
  expect(mapping.error.callee_path, `${label}: naming the callee it refused`).toBe(
    UNIT_CALLEE_PATH,
  );
  expect(
    mapping.error.message,
    `${label}: the WIRE-FORM pointer ${pointer} — the RFC-6901 position in the JSON document ` +
      `the envelope would have carried, derived by the descent rather than spelled by hand` +
      detail(mapping),
  ).toBe(expected);
  expect(mapping.diagnostic.severity, `${label}: the diagnostic is error-severity`).toBe("error");
  expect(mapping.diagnostic.code, `${label}: carrying bug 0180's registered code`).toBe(
    SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE,
  );
  expect(
    mapping.diagnostic.message,
    `${label}: one string on both channels, as refuseParams does`,
  ).toBe(mapping.error.message);
}

/**
 * The full assertion for bug 0187's depth refusal: the canonical message and
 * cap imported from `src/runtime/depth-walk.ts` (`:40`, `:50`) rather than
 * restated as literals, the `InvokeInfraError` carrier, the reused cause, and
 * NO paired diagnostic — the no-code decision `mapTooDeepReturnValue`'s
 * doc-comment records, which is settled and not reopened here (§Non-goals).
 */
function expectDepthRefusal(refusal: unknown, label: string): void {
  // SOFT on presence only, for the reason `expectNamedRefusal` states.
  expect.soft(
    refusal,
    `PRIMARY (bug 0201 §Fix (a)): ${label} must refuse on depth` + detail(refusal),
  ).toBeDefined();
  if (refusal === undefined) {
    return;
  }
  const fields = refusal as Record<string, unknown>;
  expect(fields["kind"], `${label}: the carrier is an InvokeInfraError`).toBe(INVOKE_INFRA_KIND);
  expect(
    fields["message"],
    `${label}: ceiling #4's canonical depth message, imported not restated` + detail(refusal),
  ).toBe(DEPTH_VIOLATION_MESSAGE);
  expect(fields["callee_path"], `${label}: naming the callee it refused`).toBe(UNIT_CALLEE_PATH);
  expect(fields["cause"], `${label}: on the existing return_validation cause`).toBe(
    RETURN_VALIDATION_CAUSE,
  );
  expect(
    fields["diagnostic"],
    `${label}: the depth refusal pairs with NO diagnostic — no registry row exists for a ` +
      `ceiling-#4 breach at any enforcement point (bug 0187's no-code decision)`,
  ).toBeUndefined();
}

// ===========================================================================
// (SEAM-NONFINITE) `mapNonRepresentableReturnValue` over a carried non-finite
// `number`. §Reproduction rows 1, ERR-CARRIER, 6-schema, 6-arr at the seam.
// ===========================================================================

describe("bug 0201 (SEAM-NONFINITE) — the non-representability search descends the Result carrier", () => {
  it("RED (SEAM-OK-CARRIER): a non-finite number inside a nested Ok refuses at /0/value, in all three spellings", () => {
    // PRIMARY. §Reproduction row 1. `firstNonFiniteNumber` classifies every node
    // through `classifyWireNode` (`src/runtime/subagent-envelope.ts:467`), which
    // answers `record` for a `Result`, so the search descends the carrier's own
    // enumerable fields and names the leaf it finds there. §Actual behaviour 1
    // measures the search stopping AT the carrier instead: it answers
    // `undefined` for the whole payload, the writer takes its
    // `serializeOkEnvelope` arm, and the wire carries `null` where the callee
    // produced `Infinity` — INV-5's "never a fabricated `Ok`"
    // (`docs/spec_topics/invocation.md:36`) failing at the one position nothing
    // looks at.
    //
    // The carrier is built through the SHIPPED constructor `makeOk`
    // (`src/runtime/value.ts:475`), never a hand-made `{ ok: true, value }`:
    // only that constructor installs the interpreter-private brand
    // `isResultValue` (`:443`) classifies by, and a plain look-alike is already
    // descended as an ordinary record — so a look-alike fixture would assert
    // nothing about this class.
    const rows: readonly { readonly value: number; readonly label: string }[] = [
      { value: 1 / 0, label: "Ok(1 / 0)" },
      { value: -1 / 0, label: "Ok(-1 / 0)" },
      { value: 0 / 0, label: "Ok(0 / 0)" },
    ];
    for (const row of rows) {
      const payload = [makeOk(row.value), 1];
      // The fabrication this refusal exists to pre-empt, measured on the
      // shipped serialiser so the cell states what crosses if it does not.
      expect(
        serializeOkEnvelope(payload),
        `${row.label}: the serialiser descends the carrier and substitutes null`,
      ).toBe('{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}\n');
      expectNamedRefusal(
        mapNonRepresentableReturnValue(payload, UNIT_CALLEE_PATH),
        "/0/value",
        row.value,
        `[${row.label}, 1]`,
      );
    }

    // THE OTHER DIRECTION, so the cell isolates the DISCRIMINATOR. The carrier
    // is not the offence: a finite payload inside the same carrier at the same
    // position stays admitted, which is what makes the refusals above about the
    // value rather than about carrying a `Result` (route (b), rejected).
    expect(
      mapNonRepresentableReturnValue([makeOk(1), 1], UNIT_CALLEE_PATH),
      `CONTROL: a FINITE payload inside the carrier is admitted — ` +
        `${render([makeOk(1), 1])} was refused` +
        detail(mapNonRepresentableReturnValue([makeOk(1), 1], UNIT_CALLEE_PATH)),
    ).toBeUndefined();
    expect(
      mapNonRepresentableReturnValue([makeOk([1, 2]), "s"], UNIT_CALLEE_PATH),
      `CONTROL: including a finite compound inside the carrier`,
    ).toBeUndefined();
  });

  it("RED (SEAM-ERR-CARRIER): a non-finite number inside a nested Err refuses at /0/error", () => {
    // THE GROWTH ROW. §Fix (a) names the descent over "`ok` and `value` /
    // `error`", so the `Err` arm is inside the route — but no §Reproduction row
    // and no committed cell covers it, in either direction: bug 0180's 27-cell
    // witness contains no `Result` at all, and bug 0187's
    // `CONTROL (FENCE-NESTED-RESULT)` covers the `Ok` arm's depth only. The
    // pointer's second token is `error` rather than `value` because it is
    // DERIVED from the carrier the descent walked, which is what keeps the
    // reference encoding (`docs/spec_topics/runtime-value-model.md:16`) and the
    // message in agreement without either being hard-coded.
    const rows: readonly { readonly value: number; readonly label: string }[] = [
      { value: 1 / 0, label: "Err(1 / 0)" },
      { value: -1 / 0, label: "Err(-1 / 0)" },
      { value: 0 / 0, label: "Err(0 / 0)" },
    ];
    for (const row of rows) {
      const payload = [makeErr(row.value), 1];
      expect(
        serializeOkEnvelope(payload),
        `${row.label}: the Err arm's own enumerable fields serialise the same way`,
      ).toBe('{"theta_result":{"v":1,"ok":[{"ok":false,"error":null},1]}}\n');
      expectNamedRefusal(
        mapNonRepresentableReturnValue(payload, UNIT_CALLEE_PATH),
        "/0/error",
        row.value,
        `[${row.label}, 1]`,
      );
    }

    // THE OTHER DIRECTION: a finite `Err` payload stays admitted.
    expect(
      mapNonRepresentableReturnValue([makeErr("boom"), 1], UNIT_CALLEE_PATH),
      `CONTROL: a finite Err payload is admitted — ${render([makeErr("boom"), 1])}`,
    ).toBeUndefined();
  });

  it("RED (SEAM-CARRIER-POINTERS): the pointer spells every token on the way down, through both reachable compound spellings", () => {
    // §Reproduction row 6: the two compound spellings the language admits are an
    // ARRAY LITERAL and a DECLARED-SCHEMA CONSTRUCTOR FIELD (a bare object
    // literal is refused at parse as `theta/parse/bare-object-literal`). Each
    // contributes its own reference token, and the schema-field spelling is the
    // wider of the two: the field is declared `number`, the value bound into it
    // is a `Result`, and the fabricated `null` lands inside the record the
    // caller reads.
    const rows: readonly {
      readonly payload: unknown;
      readonly pointer: string;
      readonly label: string;
    }[] = [
      { payload: [[makeOk(1 / 0)]], pointer: "/0/0/value", label: "[[Ok(1 / 0)]]" },
      { payload: [[makeErr(1 / 0)]], pointer: "/0/0/error", label: "[[Err(1 / 0)]]" },
      { payload: { a: makeOk(1 / 0) }, pointer: "/a/value", label: "B { a: Ok(1 / 0) }" },
      { payload: { a: makeErr(1 / 0) }, pointer: "/a/error", label: "B { a: Err(1 / 0) }" },
      { payload: [1, makeOk(1 / 0)], pointer: "/1/value", label: "[1, Ok(1 / 0)]" },
      {
        payload: { a: [makeOk(1 / 0)] },
        pointer: "/a/0/value",
        label: "B { a: [Ok(1 / 0)] }",
      },
    ];
    for (const row of rows) {
      expectNamedRefusal(
        mapNonRepresentableReturnValue(row.payload, UNIT_CALLEE_PATH),
        row.pointer,
        Infinity,
        row.label,
      );
      // THE OTHER DIRECTION, per row: the same shape carrying a finite payload
      // is admitted, so each pointer assertion is about the value at that
      // position rather than about the shape reaching it.
      const finite = JSON.parse(
        JSON.stringify(row.payload, (_k: string, v: unknown) => (v === null ? 0 : v)),
      ) as unknown;
      expect(
        mapNonRepresentableReturnValue(finite, UNIT_CALLEE_PATH),
        `CONTROL: ${row.label} with a finite leaf is admitted — ${render(finite)}`,
      ).toBeUndefined();
    }
  });

  it("CONTROL (SEAM-NONFINITE-OUTSIDE): the refusals that already land outside a carrier are byte-stable (green now, green after)", () => {
    // §Fix (d)(3): "Every refusal that lands today still lands, byte-stable."
    // These are §Reproduction rows 3a and 5a — the same value class OUTSIDE the
    // carrier, and a terminal `Result` whose payload `surfaceCalleeFinalValue`
    // (`src/extension/production-theta-producer.ts:3755`) unwraps, so both walks
    // already reach it. A red here means route (a) moved a pointer or a message
    // it was not asked to move (GOV-15 observable (a),
    // `docs/spec_topics/governance/source-language-stability.md:5`).
    expectNamedRefusal(
      mapNonRepresentableReturnValue(Infinity, UNIT_CALLEE_PATH),
      "",
      Infinity,
      "a root-position Infinity",
    );
    expectNamedRefusal(
      mapNonRepresentableReturnValue([1 / 0, 1], UNIT_CALLEE_PATH),
      "/0",
      Infinity,
      "[1 / 0, 1] (row 3a)",
    );
    expectNamedRefusal(
      mapNonRepresentableReturnValue({ n: NaN, who: "w" }, UNIT_CALLEE_PATH),
      "/n",
      NaN,
      "a non-finite schema field",
    );
    expectNamedRefusal(
      mapNonRepresentableReturnValue({ a: { b: { c: Infinity } } }, UNIT_CALLEE_PATH),
      "/a/b/c",
      Infinity,
      "a level-4 nest",
    );
  });

  it("CONTROL (SEAM-CIO3-BOUND): the search keeps its level fast-fail as the FIRST statement, inside a carrier too (green now, green after)", () => {
    // CIO-3 (`docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:41`) and
    // §Fix (d)(1) bind every route: a descent that enters the carrier still
    // fast-fails the moment a node's level would exceed `MAX_JSON_DEPTH`.
    // `firstNonFiniteNumber`'s `if (level > MAX_JSON_DEPTH)`
    // (`src/runtime/subagent-envelope.ts:549`) is the first statement of the
    // function, and route (a) keeps it there — so a non-finite leaf whose WIRE
    // position is past the cap is not this search's to find, exactly as it is
    // not outside a carrier (`CONTROL (FENCE-DEPTH)`,
    // `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:823`).
    //
    // Nothing is lost by that: the depth refusal runs one sub-check earlier in
    // the writer's `terminal.ok` arm
    // (`src/extension/production-theta-producer.ts:2307`) and refuses the whole
    // payload — asserted for this very fixture in the `SEAM-CARRIER-AT-CAP`
    // cell below, which also carries the complement direction.
    const pastCap = [makeOk({ a: { b: { c: Infinity } } }), 1];
    expect(
      jsonDepth(wireOf(pastCap)),
      "the offending leaf's WIRE position is level 6, past the cap",
    ).toBe(MAX_JSON_DEPTH + 1);
    expect(
      mapNonRepresentableReturnValue(pastCap, UNIT_CALLEE_PATH),
      `the non-representability search stops at the cap — a refusal here means the level check ` +
        `stopped being the first statement (CIO-3)` +
        detail(mapNonRepresentableReturnValue(pastCap, UNIT_CALLEE_PATH)),
    ).toBeUndefined();
  });

  it("RED (SEAM-CARRIER-AT-CAP): a carried non-finite leaf AT the cap IS reached, and the depth seam owns the one past it", () => {
    // The complement of `SEAM-CIO3-BOUND`, so the cap is bounded from both
    // sides. One level shallower than that cell's fixture the leaf sits AT
    // `MAX_JSON_DEPTH`, which is the last level the search reaches, and the
    // pointer spells all four tokens on the way down — including the carrier's
    // own `value`.
    const atCap = [makeOk({ a: { b: Infinity } }), 1];
    expect(jsonDepth(wireOf(atCap)), "the leaf's WIRE position is level 5, AT the cap").toBe(
      MAX_JSON_DEPTH,
    );
    expectNamedRefusal(
      mapNonRepresentableReturnValue(atCap, UNIT_CALLEE_PATH),
      "/0/value/a/b",
      Infinity,
      "a carrier-nested leaf AT the cap",
    );

    // And the payload one level deeper is refused anyway, by the sub-check that
    // runs first: nothing carrying a non-finite `number` crosses at any depth,
    // whichever of the two seams owns it.
    expectDepthRefusal(
      mapTooDeepReturnValue([makeOk({ a: { b: { c: Infinity } } }), 1], UNIT_CALLEE_PATH),
      "the same shape one level deeper, owned by the depth seam",
    );
  });
});

// ===========================================================================
// (SEAM-DEPTH) `mapTooDeepReturnValue` over a carried nest. §Reproduction rows
// 2, 6-arr-depth, 2c at the seam.
// ===========================================================================

describe("bug 0201 (SEAM-DEPTH) — the depth walk counts the Result carrier as one level", () => {
  it("RED (SEAM-DEPTH-CARRIER): a nest contributed only from inside a Result refuses, at the depth the wire document actually has", () => {
    // PRIMARY. §Reproduction row 2. `wireFormExceedsDepthCap` classifies every
    // node through `classifyWireNode` (`src/runtime/subagent-envelope.ts:467`),
    // which answers `record` for a `Result`, so the carrier costs the one level
    // its wire form costs and a payload past the cap reaches
    // `mapTooDeepReturnValue`'s refusal. §Actual behaviour 3 measures the walk
    // stopping AT the carrier instead: it answers `false`, `mapTooDeepReturnValue`
    // answers `undefined`, and the writer emits an `ok` envelope whose document
    // is depth 8 against `MAX_JSON_DEPTH = 5` — while `[[[[[[1]]]]]]` at depth 7
    // outside a carrier refuses. Ceiling #4's counting algorithm
    // (`docs/spec_topics/schema-subset.md:24`–`:30`) has no carrier exemption, so
    // an author reading that asymmetry cannot predict which of the two refuses.
    const rows: readonly { readonly payload: unknown; readonly depth: number; readonly label: string }[] = [
      { payload: [makeOk([[[[[1]]]]]), 1], depth: 8, label: "[Ok([[[[[1]]]]]), 1] (row 2)" },
      { payload: [makeErr([[[[[1]]]]]), 1], depth: 8, label: "[Err([[[[[1]]]]]), 1]" },
      { payload: [[makeOk([[[[[1]]]]])]], depth: 9, label: "[[Ok([[[[[1]]]]])]] (row 6-arr-depth)" },
      { payload: [[[[makeOk(1)]]]], depth: 6, label: "[[[[Ok(1)]]]] — the carrier's own level" },
    ];
    for (const row of rows) {
      // The depth is read off the SHIPPED counting algorithm over the payload's
      // REAL wire form, never counted by hand.
      expect(
        jsonDepth(wireOf(row.payload)),
        `${row.label}: its wire document is genuinely past the cap`,
      ).toBe(row.depth);
      expect(
        jsonDepth(wireOf(row.payload)) > MAX_JSON_DEPTH,
        `${row.label}: which is what makes a refusal true of it`,
      ).toBe(true);
      expectDepthRefusal(mapTooDeepReturnValue(row.payload, UNIT_CALLEE_PATH), row.label);
    }
  });

  it("RED (SEAM-DEPTH-CAP-BOUNDARY): the carrier counts as EXACTLY one level, bracketed from both sides of the cap", () => {
    // The threshold, asserted from both sides over one shape. Under route (a)
    // the walk's `level` equals `jsonDepth(wire form)`, so a carrier contributes
    // one level — not zero (which is HEAD, and which admits the depth-6 payload
    // below) and not two (which would refuse the depth-5 payload above it and
    // carry a message false of its document).
    const atCap = [makeOk([[1]])];
    const pastCap = [makeOk([[[1]]])];
    expect(jsonDepth(wireOf(atCap)), "the admitted payload's wire document sits AT the cap").toBe(
      MAX_JSON_DEPTH,
    );
    expect(
      jsonDepth(wireOf(pastCap)),
      "the refused payload's wire document sits one level past it",
    ).toBe(MAX_JSON_DEPTH + 1);

    expect(
      mapTooDeepReturnValue(atCap, UNIT_CALLEE_PATH),
      `a carrier-nested payload AT the cap is admitted — ${render(atCap)}, wire ` +
        `${JSON.stringify(wireOf(atCap))}` +
        detail(mapTooDeepReturnValue(atCap, UNIT_CALLEE_PATH)),
    ).toBeUndefined();
    expectDepthRefusal(
      mapTooDeepReturnValue(pastCap, UNIT_CALLEE_PATH),
      `${render(pastCap)} — one level past the cap`,
    );
  });

  it("CONTROL (SEAM-DEPTH-ADMITTED): a within-cap carried payload STAYS ADMITTED — route (b) is rejected (green now, green after)", () => {
    // §Reproduction row 3c, as a fence. `[Ok(1), 1]` crosses today as
    // `[{"ok":true,"value":1},1]` at wire depth 3, which measures
    // `docs/spec_topics/runtime-value-model.md:14`'s "so a `Result` value never
    // crosses the wire" false at this wire. Route (b) — refuse to carry a
    // `Result` at all — would flip it and is REJECTED; route (a) makes the
    // carrier's CONTENTS checked and leaves the carrier on the wire. A red here
    // is route (b) landing under route (a)'s name.
    const rows: readonly { readonly payload: unknown; readonly wire: unknown }[] = [
      { payload: [makeOk(1), 1], wire: [{ ok: true, value: 1 }, 1] },
      { payload: [makeErr("boom"), 1], wire: [{ ok: false, error: "boom" }, 1] },
      { payload: { a: makeOk(1) }, wire: { a: { ok: true, value: 1 } } },
      { payload: [[makeOk(1)]], wire: [[{ ok: true, value: 1 }]] },
      { payload: makeOk([[1]]), wire: { ok: true, value: [[1]] } },
    ];
    for (const row of rows) {
      expect(wireOf(row.payload), `${render(row.payload)} serialises to its wire form`).toEqual(
        row.wire,
      );
      expect(
        jsonDepth(wireOf(row.payload)),
        `${render(row.payload)}: its wire document is inside the cap, which is what makes ` +
          `admission the correct verdict`,
      ).toBeLessThanOrEqual(MAX_JSON_DEPTH);
      expect(
        mapTooDeepReturnValue(row.payload, UNIT_CALLEE_PATH),
        `${render(row.payload)} must still write an ok envelope` +
          detail(mapTooDeepReturnValue(row.payload, UNIT_CALLEE_PATH)),
      ).toBeUndefined();
      expect(
        mapNonRepresentableReturnValue(row.payload, UNIT_CALLEE_PATH),
        `${render(row.payload)} carries no non-finite number either`,
      ).toBeUndefined();
    }
  });

  it("CONTROL (SEAM-DEPTH-POSITION): a Result at a position already past the cap still refuses on its POSITION (green now, green after)", () => {
    // §Reproduction row 2c, as a fence. The level check
    // (`src/runtime/subagent-envelope.ts:629`) precedes every classifier
    // consult, so five brackets put the carrier at level 6 and the payload
    // refuses without its own wire form being counted at all. Route (a) keeps
    // that ordering (§Fix (d)(1)), so this row is UNCHANGED — it refuses at HEAD
    // and after, and for the same reason.
    const pastCap = [[[[[makeOk(1)]]]]];
    expect(
      jsonDepth(wireOf(pastCap)),
      "five brackets put the carrier at level 6, one past the cap, before its own wire form counts",
    ).toBeGreaterThan(MAX_JSON_DEPTH);
    expectDepthRefusal(
      mapTooDeepReturnValue(pastCap, UNIT_CALLEE_PATH),
      "[[[[[Ok(1)]]]]] (row 2c)",
    );
    expectDepthRefusal(
      mapTooDeepReturnValue([[[[[makeErr(1)]]]]], UNIT_CALLEE_PATH),
      "[[[[[Err(1)]]]]]",
    );
  });

  it("CONTROL (SEAM-DEPTH-ENUM-CARRIER): the boxed-String enum carrier stays a SCALAR (green now, green after)", () => {
    // The deliberate `depthWalk` divergence, which route (a) preserves: the
    // carrier `makeEnumValue` (`src/runtime/value.ts:135`) builds is a boxed
    // `String`, whose own enumerable keys are its character indices
    // (`Object.keys(new String("red"))` is `["0","1","2"]`), so the shipped
    // `depthWalk` (`src/runtime/depth-walk.ts`) reads it as a non-empty object
    // and counts a level for it while `JSON.stringify` renders it as the bare
    // scalar it holds. `[[[[Colour.Red]]]]` serialises to `[[[["red"]]]]` at
    // document depth 5 — INSIDE the cap — so a refusal naming depth would be
    // false of it. Under route (a) `classifyWireNode` answers SCALAR for that
    // carrier and RECORD for a `Result`; a red here is the two carriers being
    // answered the same way.
    const carrier = makeEnumValue("Colour", "red");
    expect(wireOf([[[[carrier]]]]), "the enum carrier's wire form is its bare string").toEqual([
      [[["red"]]],
    ]);
    expect(jsonDepth(wireOf([[[[carrier]]]])), "at document depth 5, inside the cap").toBe(
      MAX_JSON_DEPTH,
    );
    expect(
      mapTooDeepReturnValue([[[[carrier]]]], UNIT_CALLEE_PATH),
      `[[[[Colour.Red]]]] must be ADMITTED — a refusal here carries ` +
        `"${DEPTH_VIOLATION_MESSAGE}" about a document whose depth is ` +
        `${jsonDepth(wireOf([[[[carrier]]]]))}` +
        detail(mapTooDeepReturnValue([[[[carrier]]]], UNIT_CALLEE_PATH)),
    ).toBeUndefined();
    expect(
      mapNonRepresentableReturnValue([[[[carrier]]]], UNIT_CALLEE_PATH),
      "and the boxed String holds no number, so the other walk admits it too",
    ).toBeUndefined();

    // The other direction: a scalar is not a licence to nest. One level deeper
    // the DOCUMENT itself is past the cap and must refuse like any other.
    expect(jsonDepth(wireOf([[[[[carrier]]]]])), "one level deeper the document exceeds the cap").toBe(
      MAX_JSON_DEPTH + 1,
    );
    expectDepthRefusal(
      mapTooDeepReturnValue([[[[[carrier]]]]], UNIT_CALLEE_PATH),
      "[[[[[Colour.Red]]]]]",
    );

    // And the two carriers do not merge: an enum carrier INSIDE a `Result` is
    // still a scalar once the carrier is descended, so this payload's document
    // (`[{"ok":true,"value":[[["red"]]]}]`) is depth 5 and stays admitted.
    expect(
      jsonDepth(wireOf([makeOk([[carrier]])])),
      "the mixed nest's document sits AT the cap, because the boxed String adds no level",
    ).toBe(MAX_JSON_DEPTH);
    expect(
      mapTooDeepReturnValue([makeOk([[carrier]])], UNIT_CALLEE_PATH),
      `an enum carrier nested inside a Result stays a scalar — ` +
        `${JSON.stringify(wireOf([makeOk([[carrier]])]))}` +
        detail(mapTooDeepReturnValue([makeOk([[carrier]])], UNIT_CALLEE_PATH)),
    ).toBeUndefined();
  });
});

// ===========================================================================
// (SHAPE) The ONE shared classifier §Fix (a)'s settled shape names, so the two
// walks cannot drift apart again — the cost the report's §Fix (a) weighs
// against the two-symmetric-arms alternative ("the duplication that produced
// this defect is preserved, and the next carrier shape has to be fixed twice").
// ===========================================================================

describe("bug 0201 (SHAPE) — one exported wire-form node classifier, consulted by both walks", () => {
  it("RED (SHAPE-CLASSIFIER): classifyWireNode is exported and answers the same tag for a Result as for a plain record", () => {
    const candidate = (subagentEnvelope as unknown as Record<string, unknown>)[
      "classifyWireNode"
    ];
    expect(
      typeof candidate,
      `PRIMARY (bug 0201 §Fix (a), settled shape): src/runtime/subagent-envelope.ts must export ` +
        `one node-level wire-form classifier classifyWireNode(node) that both bounded walks ` +
        `consult, so neither carries a carrier arm of its own. Observed exports: ` +
        `${JSON.stringify(Object.keys(subagentEnvelope as unknown as Record<string, unknown>).sort())}`,
    ).toBe("function");
    if (typeof candidate !== "function") {
      return;
    }
    const classify = candidate as (node: unknown) => unknown;

    // The EQUIVALENCES are asserted rather than the tag spellings: what the
    // route settles is which nodes are answered alike, and asserting that
    // relation keeps this cell red on a classification rather than on a name.
    // (§Fix (a)'s settled shape names the three tags `scalar` / `array` /
    // `record`.) The comparison is STRUCTURAL — the tag AND the children the
    // answer carries — because the answer for a carrier must be the answer for
    // the record its wire form is, children included: a node tagged `record`
    // over anything but the carrier's own enumerable fields would send the two
    // walks somewhere `JSON.stringify` does not go, and reds here. Which
    // INSTANCE carries the answer is not the contract and is not asserted: a
    // node quotes its own input's children (`entries` / `elements`, the walks
    // recurse over them directly), so two inputs have two answers whatever an
    // implementation does.
    expect(
      classify(makeEnumValue("Colour", "red")),
      `a boxed String enum carrier classifies as the primitive string its wire form is — the ` +
        `deliberate depthWalk divergence`,
    ).toStrictEqual(classify("red"));
    expect(
      classify(makeOk(1)),
      `an Ok carrier classifies as a record: its wire form is {"ok":true,"value":…}, walked by ` +
        `Object.entries so the brand symbol (src/runtime/value.ts:88) is never visited`,
    ).toStrictEqual(classify({ ok: true, value: 1 }));
    expect(classify(makeErr(1)), "and an Err carrier the same way").toStrictEqual(
      classify({ ok: false, error: 1 }),
    );

    // The three tags are pairwise distinct, so the equivalences above are not
    // satisfied by a classifier that answers one tag for everything. The
    // DISCRIMINANT carries that property, not the node: a node quotes its own
    // input's children, so three nodes are three values however they are
    // tagged, and only `kind` tells them apart.
    const kindOf = (node: unknown): unknown =>
      typeof node === "object" && node !== null
        ? (node as Record<string, unknown>)["kind"]
        : undefined;
    const scalar = classify(1);
    const tags = [kindOf(scalar), kindOf(classify([1])), kindOf(classify({ a: 1 }))];
    expect(
      new Set(tags).size,
      `scalar, array and record are three distinct tags. Observed: ${JSON.stringify(tags)}`,
    ).toBe(3);
    expect(classify("s"), "every scalar classifies alike").toStrictEqual(scalar);
    expect(classify(null), "including null").toStrictEqual(scalar);
    expect(classify(true), "and boolean").toStrictEqual(scalar);
  });
});

// ===========================================================================
// (WRITER) Tier 2 — the REAL child-side writer, driven in-process.
//
// The harness is `tests/subagent-envelope-nonfinite-ok-refusal.test.ts`'s
// `driveChildRoot`: the regime is selected by `subagentRootRegime` naming the
// theta's slug (the predicate `isSubagentRootFor` reads), a real
// `AjvSchemaValidator` sits on the runtime root so the drive's own schema work
// is the shipped one, and injected `emitResultEnvelope` / `emitDiagnostic`
// capture both channels — so the writer runs without a process.
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
 * `[]` diagnostics, which is this report's own premise: the class is minted from
 * clean source, and `Ok(...)` / `Err(...)` in expression position is ordinary
 * theta (`docs/spec_topics/runtime-value-model.md:14`, the `Result<T, E>` row's
 * constructors).
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
 * content-addressing the shipped composition root uses, so the drive's own
 * schema work is the shipped one rather than an always-passing stub.
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

const SUBAGENT_FM = "---\nmode: subagent\n---\n";
const PROMPT_FM = "---\nmode: prompt\n---\n";

interface ChildDrive {
  readonly lines: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Drive the SHIPPED writer over a `mode: subagent` callee whose whole body is `body`. */
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
    sourcePath: UNIT_CALLEE_PATH,
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

/** The `err` arm's fields, or `{}` when the drive did not write one. */
function errFields(parse: EnvelopeParse): Record<string, unknown> {
  return parse.kind === "err" ? (parse.error as unknown as Record<string, unknown>) : {};
}

/**
 * Assert the drive refused by NAME at `pointer`, with bug 0180's registered code
 * as the whole drain — the DIAG-4 message and the ordered diagnostic-code
 * sequence (GOV-15 observable (b)) together.
 */
function expectWriterNamedRefusal(
  drive: ChildDrive,
  pointer: string,
  value: number,
  label: string,
): void {
  const parse = soleEnvelope(drive);
  expect.soft(
    parse.kind,
    `PRIMARY (bug 0201 §Fix (a)): ${label} must fail closed rather than serialise a fabricated ` +
      `null` + driveDetail(drive),
  ).toBe("err");
  const error = errFields(parse);
  expect.soft(
    error["message"],
    `${label}: the refusal names the value and its WIRE-FORM position ${pointer}` +
      driveDetail(drive),
  ).toBe(nonRepresentableMessage(pointer, value));
  expect.soft(error["kind"], `${label}: the carrier is an InvokeInfraError`).toBe(
    INVOKE_INFRA_KIND,
  );
  expect.soft(error["cause"], `${label}: on the existing return_validation cause`).toBe(
    RETURN_VALIDATION_CAUSE,
  );
  expect.soft(error["callee_path"], `${label}: naming the callee the child refused`).toBe(
    UNIT_CALLEE_PATH,
  );
  expect.soft(
    drive.diagnostics.map((d) => d.code),
    `${label}: exactly bug 0180's registered code on the drain, and nothing else` +
      driveDetail(drive),
  ).toEqual([SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE]);
  expect.soft(
    drive.diagnostics.map((d) => d.message),
    `${label}: with the registry's normative string (DIAG-4)`,
  ).toEqual([nonRepresentableMessage(pointer, value)]);
}

/** Assert the drive refused on DEPTH, with an EMPTY drain (bug 0187's no-code decision). */
function expectWriterDepthRefusal(drive: ChildDrive, label: string): void {
  const parse = soleEnvelope(drive);
  expect.soft(
    parse.kind,
    `PRIMARY (bug 0201 §Fix (a)): ${label} must fail closed rather than serialise a document ` +
      `past the cap` + driveDetail(drive),
  ).toBe("err");
  const error = errFields(parse);
  expect.soft(
    error["message"],
    `${label}: ceiling #4's canonical depth message` + driveDetail(drive),
  ).toBe(DEPTH_VIOLATION_MESSAGE);
  expect.soft(error["kind"], `${label}: the carrier is an InvokeInfraError`).toBe(
    INVOKE_INFRA_KIND,
  );
  expect.soft(error["cause"], `${label}: on the existing return_validation cause`).toBe(
    RETURN_VALIDATION_CAUSE,
  );
  expect.soft(error["callee_path"], `${label}: naming the callee the child refused`).toBe(
    UNIT_CALLEE_PATH,
  );
  expect.soft(
    drive.diagnostics,
    `${label}: the depth refusal drains NOTHING — no registry row exists for a ceiling-#4 ` +
      `breach at any enforcement point` + driveDetail(drive),
  ).toEqual([]);
}

describe("bug 0201 (WRITER) — the shipped child-side writer over a Result-carrying terminal value", () => {
  it("RED (WRITER-ROW1): a callee whose terminal value is [Ok(1 / 0), 1] refuses at /0/value instead of writing a fabricated null", async () => {
    // PRIMARY, §Reproduction row 1 — the report's headline. At HEAD this drive
    // writes `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}` with
    // drain `[]`: the callee produced `Infinity`, the wire carries `null`, and
    // no `Err`, no registered code and no diagnostic report the substitution.
    // That is the S1 class bug 0180 exists to close, reached, at HEAD, through
    // the one carrier its walk declined to enter.
    const drive = await driveChildRoot("let r = Ok(1 / 0)\n[r, 1]\n");
    expectWriterNamedRefusal(drive, "/0/value", Infinity, "[Ok(1 / 0), 1]");
  });

  it("RED (WRITER-ERR-CARRIER): [Err(1 / 0), 1] refuses at /0/error", async () => {
    // The growth row at the writer. §Fix (a)'s descent covers `value` / `error`
    // alike, and the pointer's second token follows the carrier the descent
    // actually walked.
    const drive = await driveChildRoot("let r = Err(1 / 0)\n[r, 1]\n");
    expectWriterNamedRefusal(drive, "/0/error", Infinity, "[Err(1 / 0), 1]");
  });

  it("RED (WRITER-SCHEMA-FIELD): a declared-schema field holding the carrier refuses at /a/value", async () => {
    // §Reproduction row 6-schema — the WIDER of the two reachable spellings and
    // the one most likely to look checked: the field is declared `number`, the
    // value bound into it is a `Result`, the construction draws no diagnostic,
    // and at HEAD the fabricated `null` lands inside the record the caller reads
    // (`{"theta_result":{"v":1,"ok":{"a":{"ok":true,"value":null}}}}`).
    const drive = await driveChildRoot(
      "let r = Ok(1 / 0)\nschema B { a: number }\nB { a: r }\n",
    );
    expectWriterNamedRefusal(drive, "/a/value", Infinity, "B { a: Ok(1 / 0) }");
  });

  it("RED (WRITER-ARRAY-NEST): a carrier one level further down refuses at /0/0/value", async () => {
    // §Reproduction row 6-arr — the array-literal spelling at depth, which is
    // what shows the pointer accumulating a token per descent rather than being
    // a fixed string.
    const drive = await driveChildRoot("let r = Ok(1 / 0)\n[[r]]\n");
    expectWriterNamedRefusal(drive, "/0/0/value", Infinity, "[[Ok(1 / 0)]]");
  });

  it("RED (WRITER-ROW2-DEPTH): a nest contributed only from inside the carrier refuses on depth, with an EMPTY drain", async () => {
    // §Reproduction rows 2 and 6-arr-depth. At HEAD both write an `ok` envelope
    // whose document is past the cap (depth 8 and depth 9), where
    // `[[[[[[1]]]]]]` at depth 7 outside a carrier refuses. The drain stays
    // EMPTY in both directions: bug 0187's no-code decision is settled and not
    // reopened here (§Non-goals).
    const row2 = await driveChildRoot("let r = Ok([[[[[1]]]]])\n[r, 1]\n");
    expectWriterDepthRefusal(row2, "[Ok([[[[[1]]]]]), 1] (row 2)");

    const row6 = await driveChildRoot("let r = Ok([[[[[1]]]]])\n[[r]]\n");
    expectWriterDepthRefusal(row6, "[[Ok([[[[[1]]]]])]] (row 6-arr-depth)");
  });

  it("CONTROL (WRITER-ROW3C): a within-cap finite carried payload still crosses, byte-identically (green now, green after)", async () => {
    // §Reproduction row 3c, as a fence, and the load-bearing distinction between
    // the adjudicated route (a) and the rejected route (b): route (b) would
    // refuse this line and every other compound holding a `Result`. The bytes
    // are asserted whole, because what this cell fences is the wire itself.
    const drive = await driveChildRoot("let r = Ok(1)\n[r, 1]\n");
    expect(
      drive.lines,
      `[Ok(1), 1] must still write exactly one ok envelope, unchanged — a red here is route (b) ` +
        `landing under route (a)'s name` + driveDetail(drive),
    ).toEqual(['{"theta_result":{"v":1,"ok":[{"ok":true,"value":1},1]}}\n']);
    expect(drive.diagnostics, `and drain nothing` + driveDetail(drive)).toEqual([]);

    // The same for the `Err` arm and the schema-field spelling, so the fence
    // covers every shape the flip rows above reach.
    const errArm = await driveChildRoot('let r = Err("boom")\n[r, 1]\n');
    expect(errArm.lines, `[Err("boom"), 1] crosses unchanged` + driveDetail(errArm)).toEqual([
      '{"theta_result":{"v":1,"ok":[{"ok":false,"error":"boom"},1]}}\n',
    ]);
    expect(errArm.diagnostics).toEqual([]);

    const field = await driveChildRoot("let r = Ok(1)\nschema B { a: number }\nB { a: r }\n");
    expect(field.lines, `B { a: Ok(1) } crosses unchanged` + driveDetail(field)).toEqual([
      '{"theta_result":{"v":1,"ok":{"a":{"ok":true,"value":1}}}}\n',
    ]);
    expect(field.diagnostics).toEqual([]);

    // PIC-59 versioning: whichever arm the writer takes, the line carries the
    // pinned `v`.
    const parsed = JSON.parse((drive.lines[0] as string).trimEnd()) as Record<string, unknown>;
    const payload = parsed[subagentEnvelope.THETA_RESULT_KEY] as Record<string, unknown>;
    expect(payload["v"], "the pinned envelope version").toBe(THETA_ENVELOPE_VERSION);
  });

  it("CONTROL (WRITER-FENCES): every refusal that lands at HEAD outside the carrier still lands, byte-stable (green now, green after)", async () => {
    // §Fix (d)(3) and GOV-15 observables (a) and (b). §Reproduction rows 2c,
    // 3a, 3b, 5a and 5b, at the real writer:
    //   - 2c  — a carrier at a position already past the cap refuses on POSITION;
    //   - 3a  — the same value class OUTSIDE a carrier refuses by name at /0,
    //           with bug 0180's code on the drain;
    //   - 3b  — a finite `>cap` payload outside a carrier refuses on depth;
    //   - 5a/5b — a TERMINAL `Result` is unwrapped by `surfaceCalleeFinalValue`
    //           (`src/extension/production-theta-producer.ts:3755`) so its
    //           payload BECOMES the envelope payload and both walks already
    //           reach it. That unwrap is the reachability conjunct: only a
    //           NESTED carrier exhibits this report's class.
    const rows: readonly {
      readonly body: string;
      readonly message: string;
      readonly drain: readonly string[];
      readonly label: string;
    }[] = [
      {
        body: "[[[[[Ok(1)]]]]]\n",
        message: DEPTH_VIOLATION_MESSAGE,
        drain: [],
        label: "row 2c [[[[[Ok(1)]]]]]",
      },
      {
        body: "[1 / 0, 1]\n",
        message: nonRepresentableMessage("/0", Infinity),
        drain: [SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE],
        label: "row 3a [1 / 0, 1]",
      },
      {
        body: "[[[[[[1]]]]]]\n",
        message: DEPTH_VIOLATION_MESSAGE,
        drain: [],
        label: "row 3b [[[[[[1]]]]]]",
      },
      {
        body: "let r = Ok(1 / 0)\nr\n",
        message: nonRepresentableMessage("", Infinity),
        drain: [SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE],
        label: "row 5a terminal Ok(1 / 0)",
      },
      {
        body: "let r = Ok([[[[[1]]]]])\nr\n",
        message: DEPTH_VIOLATION_MESSAGE,
        drain: [],
        label: "row 5b terminal Ok([[[[[1]]]]])",
      },
    ];
    for (const row of rows) {
      const drive = await driveChildRoot(row.body);
      const parse = soleEnvelope(drive);
      expect(parse.kind, `${row.label} still refuses` + driveDetail(drive)).toBe("err");
      const error = errFields(parse);
      expect(error["message"], `${row.label}: unchanged message` + driveDetail(drive)).toBe(
        row.message,
      );
      expect(error["cause"], `${row.label}: unchanged cause`).toBe(RETURN_VALIDATION_CAUSE);
      expect(
        drive.diagnostics.map((d) => d.code),
        `${row.label}: unchanged ordered diagnostic-code sequence` + driveDetail(drive),
      ).toEqual(row.drain);
    }
  });
});

// ===========================================================================
// (SIGN) Tier 4 — the bug-0188 rider, in the POSITIVE direction.
//
// Bug 0188 shipped `stringifyPreservingNegativeZero`
// (`src/runtime/subagent-envelope.ts:188`), which rides `JSON.stringify`'s own
// traversal and therefore already reaches a `-0` leaf inside a `Result`
// carrier. Route (a) cannot regress it — that function owns RENDERING while the
// two walks decide only REFUSAL, and `-0` is finite so neither walk's leaf test
// is engaged — but that is an argument, and these cells are the measurement.
// GREEN NOW AND GREEN AFTER.
//
// `tests/subagent-envelope-negative-zero-fidelity.test.ts` pins the DIRECT
// carrier position already (`RED (SEAM-RESULT-CARRIER)` at `:670`, and the
// `/0/value` row of `RED (TRIP-POSITIONS)` at `:722`). That file is bug 0188's
// and is not edited from here; the rows below add the position it does not
// cover — a `-0` nested one level INSIDE the carrier's payload, which is where
// route (a)'s descent newly walks — and re-measure the direct position beside
// it so this report's own witness answers for both without depending on
// another's.
// ===========================================================================

/** `"-0"` / `"0"` / a rendering of a non-zero value, so a red names the sign it saw. */
function signedZeroForm(value: unknown): string {
  if (typeof value !== "number") {
    return `non-number ${JSON.stringify(value)}`;
  }
  if (value !== 0) {
    return String(value);
  }
  return Object.is(value, -0) ? "-0" : "0";
}

/** The `ok` arm of a re-read envelope line, or a loud failure naming what came back. */
function okArmOf(parse: EnvelopeParse, label: string): unknown {
  if (parse.kind !== "ok") {
    throw new Error(
      `precondition unmet: ${label} did not re-read as an ok envelope — ${JSON.stringify(parse)}`,
    );
  }
  return parse.value;
}

describe("bug 0201 (SIGN) — a Result-carried -0 keeps its sign across the envelope", () => {
  it("CONTROL (SIGN-ROUNDTRIP): serializeOkEnvelope → parseEnvelopeLine recovers Object.is(-0) at and inside the carrier (green now, green after)", () => {
    // The composition that decides what a subagent-leg caller binds: the
    // child's writer, then the parent's reader. Route (a) touches neither, and
    // `-0` is admitted by `Number.isFinite` by design (bug 0188 §Fix (e)(6)),
    // so both positions must keep their sign. A red here means route (a)'s
    // descent replaced the serialiser's traversal with a walk of its own and
    // lost the leaf.
    const rows: readonly {
      readonly payload: unknown;
      readonly line: string;
      readonly read: (arm: unknown) => unknown;
      readonly label: string;
    }[] = [
      {
        payload: [makeOk(-0), 1],
        line: '{"theta_result":{"v":1,"ok":[{"ok":true,"value":-0},1]}}\n',
        read: (arm) => (((arm as unknown[])[0] as Record<string, unknown>)["value"]),
        label: "the carrier's own value position /0/value",
      },
      {
        payload: [makeOk([-0]), 1],
        line: '{"theta_result":{"v":1,"ok":[{"ok":true,"value":[-0]},1]}}\n',
        read: (arm) =>
          (((arm as unknown[])[0] as Record<string, unknown>)["value"] as unknown[])[0],
        label: "one level INSIDE the carrier's payload /0/value/0",
      },
      {
        payload: [makeErr(-0), 1],
        line: '{"theta_result":{"v":1,"ok":[{"ok":false,"error":-0},1]}}\n',
        read: (arm) => (((arm as unknown[])[0] as Record<string, unknown>)["error"]),
        label: "the Err arm's error position /0/error",
      },
    ];
    for (const row of rows) {
      const line = serializeOkEnvelope(row.payload);
      expect(line, `${row.label}: the writer emits the -0 form the JSON grammar admits`).toBe(
        row.line,
      );
      const arm = okArmOf(parseEnvelopeLine(line.trimEnd()), row.label);
      expect(
        signedZeroForm(row.read(arm)),
        `${row.label}: the value the parent re-reads must be the value the callee produced — ` +
          `observed line ${JSON.stringify(line)}`,
      ).toBe("-0");
      expect(
        Object.is(row.read(arm), -0),
        `${row.label}: asserted as Object.is, because -0 === 0`,
      ).toBe(true);

      // Neither walk refuses it: `-0` is finite and the wire document is inside
      // the cap, so route (a)'s descent must leave both verdicts as they are.
      expect(
        mapNonRepresentableReturnValue(row.payload, UNIT_CALLEE_PATH),
        `${row.label}: the finiteness predicate is not widened into sign preservation`,
      ).toBeUndefined();
      expect(
        mapTooDeepReturnValue(row.payload, UNIT_CALLEE_PATH),
        `${row.label}: and the document is inside the cap`,
      ).toBeUndefined();
    }

    // The +0 control, so the cell measures the SIGN rather than a re-rendering
    // of zero (GOV-15 observable (a)).
    expect(serializeOkEnvelope([makeOk(0), 1]), "the +0 control's bytes are unchanged").toBe(
      '{"theta_result":{"v":1,"ok":[{"ok":true,"value":0},1]}}\n',
    );
    expect(serializeOkEnvelope([makeOk([0]), 1]), "including one level inside the carrier").toBe(
      '{"theta_result":{"v":1,"ok":[{"ok":true,"value":[0]},1]}}\n',
    );
  });

  it("CONTROL (SIGN-WRITER): the real writer carries the sign for both carried positions (green now, green after)", async () => {
    // The same two positions on the shipped writer, from theta source. `0 * -1`
    // is the spelling that mints `-0` (bug 0188 §Reproduction (a)); the drain is
    // EMPTY in both directions, which is what distinguishes this rider from a
    // refusal.
    const rows: readonly { readonly body: string; readonly line: string; readonly label: string }[] =
      [
        {
          body: "let r = Ok(0 * -1)\n[r, 1]\n",
          line: '{"theta_result":{"v":1,"ok":[{"ok":true,"value":-0},1]}}\n',
          label: "[Ok(0 * -1), 1]",
        },
        {
          body: "let r = Ok([0 * -1])\n[r, 1]\n",
          line: '{"theta_result":{"v":1,"ok":[{"ok":true,"value":[-0]},1]}}\n',
          label: "[Ok([0 * -1]), 1]",
        },
      ];
    for (const row of rows) {
      const drive = await driveChildRoot(row.body);
      expect(
        drive.lines,
        `${row.label}: the writer emits one ok envelope carrying the callee's own sign` +
          driveDetail(drive),
      ).toEqual([row.line]);
      expect(drive.diagnostics, `${row.label}: and drains nothing` + driveDetail(drive)).toEqual(
        [],
      );
      const arm = okArmOf(soleEnvelope(drive), row.label);
      const carrier = (arm as unknown[])[0] as Record<string, unknown>;
      const leaf = Array.isArray(carrier["value"])
        ? (carrier["value"] as unknown[])[0]
        : carrier["value"];
      expect(
        signedZeroForm(leaf),
        `${row.label}: and the parent re-reads the sign, not its absolute value`,
      ).toBe("-0");
    }
  });
});

// ===========================================================================
// (PROMPT) Tier 5 — the prompt→prompt attach leg's ZERO flips (GOV-15 (iii)).
//
// A `prompt`-mode callee attaches to its caller's conversation and its final
// value does not cross the envelope at all
// (`docs/spec_topics/pi-integration-contract/subagent.md:110`), so route (a) —
// which changes two envelope-writer walks — flips nothing there. Asserted
// rather than assumed, at the seam that is actually reachable: `Result` is not a
// lowerable type form, so no `invoke<T>` annotation describes a position holding
// one (`docs/spec_topics/schema-subset.md:84`), which leaves exactly two
// reachable prompt-leg forms — the untyped discard arm and a typed annotation
// whose AJV gate refuses the carrier object as the wrong type.
//
// The existing prompt-leg fences in bug 0180's witness
// (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:1193` onward) carry no
// `Result` in any cell, so neither of these two rows is a duplicate.
// ===========================================================================

/**
 * The `Result` the tail `invoke(...)` expression produced. A caller body that
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

/**
 * Drive `call` in a prompt-mode caller against a prompt-mode callee over the
 * real production binding: `parseThetaDocument` →
 * `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
 * `executeBody`, with a real `AjvSchemaValidator` on the runtime root. The
 * attach guard is `callerMode === "prompt" && callee.frontmatter.mode ===
 * "prompt"`, and `bindPromptConversation` is what threads `callerMode: "prompt"`
 * in — the harness shape bug 0180's witness uses for the same leg.
 */
async function drivePromptInvoke(input: {
  readonly call: string;
  readonly calleeBody: string;
}): Promise<{ readonly result: ResultValue; readonly diagnostics: readonly Diagnostic[] }> {
  const calleeDoc = parseTheta("kidp.theta", PROMPT_FM + input.calleeBody);
  const callee: ThetaCompositionInput = {
    slashName: "kidp",
    sourcePath: "/theta/kidp.theta",
    frontmatter: calleeDoc.frontmatter as ParsedFrontmatter,
    body: calleeDoc.body,
  };
  const diagnostics: Diagnostic[] = [];
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
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
  });
  const callerDoc = parseTheta("caller.theta", `${PROMPT_FM}${input.call}\n`);
  const theta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: "/theta/caller.theta",
    frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
    body: callerDoc.body,
  };
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  } as ConversationBindInput);
  return {
    result: boundaryResult(await executeBody(theta.body, binding.executeDeps)),
    diagnostics,
  };
}

/** The prompt leg's outcome rendered for an assertion message. */
function promptOutcome(outcome: {
  readonly result: ResultValue;
  readonly diagnostics: readonly Diagnostic[];
}): string {
  const arm = outcome.result.ok
    ? `Ok(${render(outcome.result.value)})`
    : `Err(${JSON.stringify(outcome.result.error)})`;
  return ` — observed ${arm}, diagnostics ${JSON.stringify(outcome.diagnostics)}`;
}

/** The three carried payloads the subagent leg's flip rows use, as prompt-callee bodies. */
const PROMPT_CARRIER_BODIES: readonly { readonly body: string; readonly label: string }[] = [
  { body: "let r = Ok(1 / 0)\n[r, 1]\n", label: "[Ok(1 / 0), 1]" },
  { body: "let r = Err(1 / 0)\n[r, 1]\n", label: "[Err(1 / 0), 1]" },
  { body: "let r = Ok([[[[[1]]]]])\n[r, 1]\n", label: "[Ok([[[[[1]]]]]), 1]" },
];

describe("bug 0201 (PROMPT) — the attach leg does not serialise, so route (a) flips nothing there", () => {
  it("CONTROL (PROMPT-UNTYPED): an untyped invoke of a Result-carrying prompt callee still reports success and drains nothing (green now, green after)", async () => {
    // `docs/spec_topics/invocation.md:28` fixes that untyped `invoke(...)`
    // returns `Result<null, QueryError>` and "the runtime discards the child's
    // return value entirely" — bug 0068's settled discard arm — so the
    // observable on this leg is the ARM, and it must stay `Ok`. The same three
    // payloads refuse on the subagent leg under route (a); here they must not,
    // because no envelope is written.
    for (const row of PROMPT_CARRIER_BODIES) {
      const outcome = await drivePromptInvoke({
        call: `invoke("${PROMPT_CALLEE_PATH}")`,
        calleeBody: row.body,
      });
      expect(
        outcome.result.ok,
        `${row.label}: the prompt leg has nothing to refuse — route (a) is child-envelope-only` +
          promptOutcome(outcome),
      ).toBe(true);
      if (outcome.result.ok) {
        expect(
          outcome.result.value,
          `${row.label}: and the untyped form still discards the callee's value`,
        ).toBeNull();
      }
      expect(
        outcome.diagnostics,
        `${row.label}: with nothing on the diagnostic channel` + promptOutcome(outcome),
      ).toEqual([]);
    }
  });

  it("CONTROL (PROMPT-TYPED): a typed annotation still refuses the carrier at the AJV gate, with the gate's own message (green now, green after)", async () => {
    // The other reachable prompt-leg form. `projectForValidation`
    // (`src/runtime/wire-translation.ts:654`) hands the `Result` to AJV
    // unchanged — that file is byte-frozen (§Fix (d)(6)) — so the carrier object
    // fails `{"type":"number"}` and the gate returns its own message. This row
    // pins that the prompt leg's refusal for a carried payload comes from the
    // AJV gate rather than from either envelope walk: a red here means route
    // (a)'s descent leaked into the typed-return boundary.
    const outcome = await drivePromptInvoke({
      call: `invoke<array<number>>("${PROMPT_CALLEE_PATH}")`,
      calleeBody: "let r = Ok(1 / 0)\n[r, 1]\n",
    });
    expect(
      outcome.result.ok,
      `the typed prompt-leg gate refuses the carrier as the wrong type` + promptOutcome(outcome),
    ).toBe(false);
    if (outcome.result.ok) {
      return;
    }
    const error = outcome.result.error as unknown as Record<string, unknown>;
    expect(
      error["message"],
      `with the AJV gate's own message, not a depth message and not bug 0180's` +
        promptOutcome(outcome),
    ).toBe("invoke<array<number>> return value failed validation");
    expect(error["cause"], "on the gate's existing return_validation carrier").toBe(
      RETURN_VALIDATION_CAUSE,
    );
    expect(
      outcome.diagnostics,
      `and nothing on the diagnostic channel` + promptOutcome(outcome),
    ).toEqual([]);
  });
});

// ===========================================================================
// (BOUND) Tier 3 — what a CALLER BINDS, over REAL spawned children.
//
// The observable this report is about is a caller binding a value its callee
// never produced. That value is produced by a chain beginning with a real
// child's stdout and passing through `#resolveReturnSite` and
// `#validateInvokeReturn`, both private to `ProductionThetaProducer`, so no
// in-process tier reaches it. At an uninferred `tools:`-declared
// `.theta`-callable boundary `#validateInvokeReturn` returns the parsed envelope
// unchanged, which is every row below.
// ===========================================================================

/** `mode: subagent` frontmatter with no `tools:` — every leaf callee's shape. */
const SUB = "---\nmode: subagent\n---\n";

/** A `tools:`-callable root over one `.theta` callee. */
function toolsRoot(callee: string, body: string): string {
  return `---\nmode: subagent\ntools:\n  - ./${callee}.theta\n---\n${body}`;
}

/**
 * The root's settled value IS what the caller bound: `?` propagates the callee's
 * `Err` and the tail returns the bound value, so a fabricated payload arrives at
 * this test as the root's own `Ok`.
 */
function bindValueBody(call: string): string {
  return `let r = ${call}\nlet v = r?\nv\n`;
}

/**
 * The refusal reduced to DATA rather than an unwind: `match` keeps a refused row
 * observable as a string instead of collapsing the root into its own `Err`. Used
 * where re-emitting the bound value would put the ROOT's own envelope past the
 * cap and make the root's writer, rather than the boundary, the thing observed.
 */
function matchMessageBody(call: string, okLabel: string): string {
  return `let r = ${call}\nlet m = match r { Ok(v) => "${okLabel}", Err(e) => e.message }\nm\n`;
}

/** The label a match-arm row reports when the boundary admitted the payload. */
const ADMITTED_LABEL = "ADMITTED";

/** The leaf callees: one carried payload each, every body a `let` chain ending in a tail. */
const FIXTURES: Readonly<Record<string, string>> = {
  // §Reproduction row 1 — a non-finite number inside a nested Ok.
  "resnf.theta": SUB + "let r = Ok(1 / 0)\n[r, 1]\n",
  // The Err arm of the same class.
  "reserr.theta": SUB + "let r = Err(1 / 0)\n[r, 1]\n",
  // §Reproduction row 2 — depth contributed only from inside the carrier.
  "resdeep.theta": SUB + "let r = Ok([[[[[1]]]]])\n[r, 1]\n",
  // §Reproduction row 3c — within the cap and finite: the route-(b) fence.
  "resfin.theta": SUB + "let r = Ok(1)\n[r, 1]\n",
};

/** One driven root per row, each spawned in its own child process. */
const ROOTS: Readonly<Record<string, string>> = {
  // Row NF — PRIMARY. The wire document `[{"ok":true,"value":null},1]` is depth
  // 3 and finite, so the ROOT re-emits it unrefused and the caller's binding is
  // observable as the root's own value.
  "top-nf.theta": toolsRoot("resnf", bindValueBody("resnf()")),
  // Row ERR — PRIMARY, the growth arm. Same shape on the `Err` field.
  "top-err.theta": toolsRoot("reserr", bindValueBody("reserr()")),
  // Row DEEP — PRIMARY. The bound value's own document is depth 8, so the root
  // reduces it to a string: otherwise the ROOT's envelope writer would refuse
  // the re-emission and the observable would be the root's writer rather than
  // the boundary under test.
  "top-deep.theta": toolsRoot(
    "resdeep",
    matchMessageBody("resdeep()", ADMITTED_LABEL),
  ),
  // Row FIN — CONTROL / GREEN FENCE. The same boundary, a within-cap finite
  // carried payload: it binds at HEAD and must keep binding, which also proves
  // the harness reaches the boundary when a flip row reds.
  "top-fin.theta": toolsRoot("resfin", bindValueBody("resfin()")),
};

interface RootOutcome {
  readonly result: SubagentInvocationResult;
  readonly exit: ChildExitInfo;
  readonly diagnostics: readonly Diagnostic[];
  readonly killedByWatchdog: boolean;
}

/** The settled outcome rendered for an assertion message, so a red names what came back. */
function outcomeDetail(outcome: RootOutcome): string {
  return (
    ` — settled ${JSON.stringify(outcome.result)}, exit ` +
    `${JSON.stringify(outcome.exit)}, diagnostics ${JSON.stringify(outcome.diagnostics)}`
  );
}

/** The `Ok` payload, or `undefined` when the root settled fail-closed. */
function okValue(outcome: RootOutcome): unknown {
  return outcome.result.ok ? outcome.result.value : undefined;
}

/** One field of the settled `Err`, or `undefined` when the root settled `Ok`. */
function errField(outcome: RootOutcome, field: string): unknown {
  return outcome.result.ok
    ? undefined
    : (outcome.result.error as unknown as Record<string, unknown>)[field];
}

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0201 Result-carriage witness ` +
        `needs the repo install (npm install) and the built extension entry; it never silently ` +
        `skips.`,
    );
  }
}

/**
 * All three AGENTS.md `#subagent-child-pins`, each as a LOUD precondition
 * naming the unmet input. Without the executable pin rung 1 spawns
 * `node <vitest-entry>` and the child dies instantly; without the extension pin
 * the child binds whatever ambient theta build the machine carries; without the
 * parent-pid pin the control plane's authentication strips the extension pin in
 * SILENCE and the child falls back to ambient discovery — so a missing pin
 * would turn every row below into a launch-path observation rather than a
 * return-boundary one.
 */
function requireChildPins(): void {
  requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
  requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");
  if (SUBAGENT_EXTENSION_PIN_ENV !== "PI_THETA_SUBAGENT_EXTENSION_PIN") {
    throw new Error(
      `precondition unmet: the extension-pin variable is spelled ` +
        `${JSON.stringify(SUBAGENT_EXTENSION_PIN_ENV)}, not PI_THETA_SUBAGENT_EXTENSION_PIN — ` +
        `AGENTS.md #subagent-child-pins names that variable, and a rename would make the pin ` +
        `below a no-op rather than a failure`,
    );
  }
  if (SUBAGENT_PARENT_PID_ENV !== "PI_THETA_SUBAGENT_PARENT_PID") {
    throw new Error(
      `precondition unmet: the parent-pid variable is spelled ` +
        `${JSON.stringify(SUBAGENT_PARENT_PID_ENV)}, not PI_THETA_SUBAGENT_PARENT_PID — the ` +
        `control plane is AUTHENTICATED (subagent.md ` +
        `#subagent-control-plane-authentication) and an unauthenticated extension pin is ` +
        `stripped in silence`,
    );
  }
  if (!Number.isInteger(process.pid) || process.pid <= 0) {
    throw new Error(
      `precondition unmet: process.pid is ${String(process.pid)}, so the parent-pid pin cannot ` +
        `authenticate the extension pin — launchSubagentChild writes ` +
        `${SUBAGENT_PARENT_PID_ENV} from its parentPid argument, and this process is the ` +
        `child's real parent`,
    );
  }
}

describe("bug 0201 (BOUND) — what a caller binds when the callee's payload carries a Result", () => {
  it(
    "a caller does not bind a value its callee never produced, at an uninferred tools:-declared boundary",
    async () => {
      requireChildPins();

      // One discovery root holds every fixture so each root's `./` callee paths
      // and `tools:` entries resolve beside it.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0201-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries({ ...FIXTURES, ...ROOTS })) {
        writeFileSync(join(thetaDir, name), source);
      }

      // Rung-1 executable resolution, exactly as a pi-hosted parent resolves it
      // (node + the entry script); pinned to the repo's own pi install.
      const host: ExecutableHost = {
        argv1: PI_CLI_ENTRY,
        execPath: process.execPath,
        fileExists: (p: string): boolean => existsSync(p),
        isGenericRuntime: (): boolean => false,
      };

      /** Every child launched below, reaped in the `finally` on every path. */
      const launched: { readonly kill: () => void; readonly exited: Promise<ChildExitInfo> }[] = [];

      try {
        /**
         * Drive one root in its own spawned child through the REAL production
         * spawn path. The extension pin rides `parentEnv` and inherits down to
         * the grandchildren the root's calls spawn; `parentPid` is what
         * AUTHENTICATES the pin at each level.
         */
        const driveRoot = async (slug: string): Promise<RootOutcome> => {
          const diagnostics: Diagnostic[] = [];
          const emitDiagnostic = (d: Diagnostic): void => {
            diagnostics.push(d);
          };
          const launch = launchSubagentChild(
            {
              argv: {
                slug,
                thetaDirs: [thetaDir],
                systemPrompt: "",
                hostTools: [],
                noHostTools: true,
                provider: CHILD_MODEL_PROVIDER,
                model: CHILD_MODEL_ID,
                projectTrust: false,
              },
              cwd: scratchDir,
              parentEnv: { ...process.env, [SUBAGENT_EXTENSION_PIN_ENV]: EXTENSION_ENTRY },
              parentPid: process.pid,
              invokeDepth: 0,
              host,
            },
            { spawn: createProductionSpawnFn(), emitDiagnostic },
          );
          if (!launch.ok) {
            throw new Error(
              `precondition unmet: the spawn of root '${slug}' failed, so nothing about the ` +
                `return boundary was observed — ${JSON.stringify(diagnostics)}`,
            );
          }
          const child = launch.child;
          // Subscribed BEFORE driving so the terminal `'close'` is never missed.
          const exited = new Promise<ChildExitInfo>((r) => child.onExit(r));
          launched.push({ kill: () => child.kill(), exited });

          // In-test bound BELOW the vitest timeout: on a stall (this root or its
          // grandchild making no progress) kill the pair so the drive settles
          // fail-closed and the assertions below report loudly, instead of the
          // test and a live process tree hanging to the outer timeout.
          let killedByWatchdog = false;
          const watchdog = setTimeout(() => {
            killedByWatchdog = true;
            child.kill();
          }, 90_000);
          const result = await driveSubagentChild({
            child,
            thetaAbort: new AbortController(),
            calleePath: join(thetaDir, `${slug}.theta`),
            emitDiagnostic,
            clock: new WallClock(),
          });
          clearTimeout(watchdog);
          const exit = await exited;
          return { result, exit, diagnostics, killedByWatchdog };
        };

        // Sequential, one child per root: a `tools:` root and its grandchild are
        // two live `pi` processes, and four concurrent pairs would make the wall
        // time a function of machine load rather than of the boundary.
        const outcomes = new Map<string, RootOutcome>();
        for (const slug of Object.keys(ROOTS).map((name) => name.replace(/\.theta$/, ""))) {
          outcomes.set(slug, await driveRoot(slug));
        }

        /** The outcome for `slug`, or a loud failure — a missing row asserts nothing. */
        const row = (slug: string): RootOutcome => {
          const outcome = outcomes.get(slug);
          if (outcome === undefined) {
            throw new Error(`precondition unmet: root '${slug}' was never driven`);
          }
          return outcome;
        };

        // Soft across every row so ONE run names every boundary that is wrong,
        // rather than stopping at the first.

        // Shared per-row invariants, asserted before the per-row values: PIC-59
        // fixes one invocation per process, so each root self-exits 0 after its
        // envelope; and the parent-side drain is EMPTY on every row, at HEAD and
        // after — the depth refusal emits no diagnostic and bug 0180's code is
        // emitted in the CHILD, whose diagnostic channel is process-local. A
        // non-empty drain means the run failed for a different reason than the
        // return boundary.
        for (const [slug, outcome] of outcomes) {
          expect.soft(
            outcome.killedByWatchdog,
            `(${slug}) the root made no progress within 90s — its invoke did not settle, so ` +
              `nothing about the return boundary was observed`,
          ).toBe(false);
          expect.soft(
            outcome.exit.code,
            `(${slug}) PIC-59: one invocation per process — the child self-exits 0 after its ` +
              `envelope` + outcomeDetail(outcome),
          ).toBe(0);
          expect.soft(
            outcome.exit.signal,
            `(${slug}) and is not killed` + outcomeDetail(outcome),
          ).toBeNull();
          expect.soft(
            outcome.diagnostics,
            `(${slug}) the parent-side drive emitted diagnostics` + outcomeDetail(outcome),
          ).toEqual([]);
        }

        // -----------------------------------------------------------------
        // Row NF — PRIMARY. §Reproduction row 1, at the caller. At HEAD the
        // parent binds `[{"ok":true,"value":null},1]` for a callee whose tail is
        // `[Ok(1 / 0), 1]`, with `diagnostics: []` on every channel: INV-5's
        // "never a fabricated `Ok`" (`docs/spec_topics/invocation.md:36`) failing
        // on the one leg where nothing else looks. An author reading `null` at
        // that position has no channel distinguishing it from a callee that
        // produced `null`.
        // -----------------------------------------------------------------
        {
          const nf = row("top-nf");
          expect.soft(
            nf.result.ok,
            `(NF) PRIMARY (bug 0201): a caller must not bind a value its callee never produced — ` +
              `at HEAD this settles Ok([{"ok":true,"value":null},1]) for a callee whose tail is ` +
              `[Ok(1 / 0), 1]` + outcomeDetail(nf),
          ).toBe(false);
          expect.soft(
            errField(nf, "message"),
            `(NF) and the refusal names the value and its WIRE-FORM position /0/value` +
              outcomeDetail(nf),
          ).toBe(nonRepresentableMessage("/0/value", Infinity));
          expect.soft(
            errField(nf, "kind"),
            `(NF) carried as an InvokeInfraError` + outcomeDetail(nf),
          ).toBe(INVOKE_INFRA_KIND);
          expect.soft(
            errField(nf, "cause"),
            `(NF) on the existing return_validation cause` + outcomeDetail(nf),
          ).toBe(RETURN_VALIDATION_CAUSE);
        }

        // -----------------------------------------------------------------
        // Row ERR — PRIMARY, the growth arm. The `Err` field of a carried
        // `Result` reaches the caller as a fabricated `null` the same way, and
        // no committed cell covers it in either direction.
        // -----------------------------------------------------------------
        {
          const err = row("top-err");
          expect.soft(
            err.result.ok,
            `(ERR) PRIMARY (bug 0201): the Err arm fabricates too — at HEAD this settles ` +
              `Ok([{"ok":false,"error":null},1])` + outcomeDetail(err),
          ).toBe(false);
          expect.soft(
            errField(err, "message"),
            `(ERR) at the wire-form position /0/error` + outcomeDetail(err),
          ).toBe(nonRepresentableMessage("/0/error", Infinity));
        }

        // -----------------------------------------------------------------
        // Row DEEP — PRIMARY, the depth half at the caller. The document the
        // grandchild wrote is depth 8 against a cap of 5, and at HEAD the
        // boundary admits it — where `[[[[[[1]]]]]]` at depth 7 outside a
        // carrier refuses. Read through a `match` arm so the root's own writer
        // is not what is observed.
        // -----------------------------------------------------------------
        {
          const deep = row("top-deep");
          expect.soft(
            deep.result.ok,
            `(DEEP) the root reduces the boundary's verdict to a string, so it settles Ok either ` +
              `way — a fail-closed root here means the harness, not the boundary, was observed` +
              outcomeDetail(deep),
          ).toBe(true);
          expect.soft(
            okValue(deep),
            `(DEEP) PRIMARY (bug 0201): a document at depth 8 must not cross a boundary that ` +
              `refuses depth 7 — at HEAD this reports "${ADMITTED_LABEL}"` + outcomeDetail(deep),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
        }

        // -----------------------------------------------------------------
        // Row FIN — CONTROL / GREEN FENCE. §Reproduction row 3c at the caller:
        // a within-cap finite carried payload binds at HEAD and must keep
        // binding, which is what makes route (a) narrower than the rejected
        // route (b). It is also the harness's own control: a green here beside a
        // red above means the reds are the boundary's, not the spawn path's.
        // -----------------------------------------------------------------
        {
          const fin = row("top-fin");
          expect.soft(
            fin.result.ok,
            `(FIN) CONTROL — a finite carried payload inside the cap must still bind` +
              outcomeDetail(fin),
          ).toBe(true);
          expect.soft(
            okValue(fin),
            `(FIN) and the caller binds the carrier's wire form, brand dropped by JSON — a red ` +
              `here is route (b) landing under route (a)'s name` + outcomeDetail(fin),
          ).toEqual([{ ok: true, value: 1 }, 1]);
        }
      } finally {
        // Reap every child on every path (idempotent on an already-exited
        // child), then await their exits (bounded) before dropping the scratch
        // dir — a dying child's cwd is inside scratchDir, so an immediate
        // rmSync could throw EBUSY and replace the primary assertion error with
        // a less diagnostic one.
        for (const child of launched) {
          child.kill();
        }
        let reapTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          Promise.all(launched.map((c) => c.exited)),
          new Promise<void>((r) => {
            reapTimer = setTimeout(r, 5_000);
          }),
        ]);
        clearTimeout(reapTimer);
        try {
          rmSync(scratchDir, { recursive: true, force: true });
        } catch {
          // Best-effort scratch cleanup; never mask the primary test failure.
        }
      }
    },
    600_000,
  );
});
