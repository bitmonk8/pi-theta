// Bug 0187 — the one subagent return boundary that runs no depth walk lets a
// `>cap` terminal `Ok` payload cross, so a caller binds `[[[[[[null]]]]]]` for a
// callee that produced `[[[[[[Infinity]]]]]]` (and binds a `>cap` FINITE payload
// unchecked too) with `diagnostics: []` on every channel.
// `docs/bugs/0187-untyped-subagent-return-boundary-no-depth-ceiling.md`.
//
// THE SETTLED ROUTE IS §Fix (b) — REFUSE CHILD-SIDE AT THE ENVELOPE WRITER,
// adjudicated by the parent before this run and not re-litigated here. A new
// export in `src/runtime/subagent-envelope.ts` beside
// `mapNonRepresentableReturnValue` —
// `mapTooDeepReturnValue(value, calleePath): InvokeInfraError | undefined` —
// runs a bounded fast-failing depth walk over the terminal `Ok` payload and, on
// a breach, returns `{ kind: "invoke_infra", message: <the canonical depth
// message>, callee_path, cause: "return_validation" }`; `undefined` within the
// cap. It reuses ceiling #4's own `MAX_JSON_DEPTH` and `DEPTH_VIOLATION_MESSAGE`
// from `src/runtime/depth-walk.ts` rather than restating either. Its call site is
// `driveSubagentRootRegime`'s `terminal.ok` arm
// (`src/extension/production-theta-producer.ts`, named by symbol per bug 0134's
// positional-drift adjudication), where the depth refusal runs BEFORE
// `mapNonRepresentableReturnValue` and BEFORE `serializeOkEnvelope`.
//
// WIRE FORM, NOT CARRIER — why that walk is MODULE-PRIVATE to
// `subagent-envelope.ts` instead of the shipped `depthWalk` itself. `depthWalk`
// answers a question about ALREADY-PARSED JSON; the envelope writer holds the
// interpreter's own value on its way INTO `JSON.stringify`. The two representations
// differ on exactly one shape: `makeEnumValue` (`src/runtime/value.ts`) encodes an
// enum variant as a boxed `String`, whose own enumerable keys are its character
// indices (`Object.keys(new String("red"))` is `["0","1","2"]`), so `depthWalk`
// reads that carrier as a non-empty object and counts a level for it while
// `JSON.stringify` renders it as the bare scalar string it holds. Sharing
// `depthWalk` here would therefore refuse `[[[[Colour.Red]]]]`, whose JSON
// document is `[[[["red"]]]]` at depth 5 — WITHIN the cap — with a message false
// of that input. The envelope's verdict is a function of the wire form, so the
// walk carries `firstNonFiniteNumber`'s already-reviewed carrier arms (a boxed
// `String` is a scalar, a `Result` is not descended, records by own enumerable
// string keys only) and the two bounded walks in that module answer the carrier
// question the same way. `src/runtime/depth-walk.ts` is BYTE-UNTOUCHED: it answers
// for all five of ceiling #4's AJV enforcement points, four of which are handed
// already-parsed JSON where a boxed `String` cannot occur, and
// `tests/invoke-ceiling-depth.test.ts` freezes its behaviour. The
// `SEAM-ENUM-CARRIER`, `ORDER-ENUM-CARRIER` and row-K cells below fence all three
// tiers of that distinction.
//
// THE LIMIT OF THE ROWS BELOW — THE `Result`-CARRIAGE BOUND, PINNED NOT CLOSED.
// Neither bounded walk in `src/runtime/subagent-envelope.ts` descends a
// `Result`: `firstNonFiniteNumber`'s arm is bug 0180's reviewed disposition and
// `wireFormExceedsDepthCap` inherits it, on the ground `projectForValidation`
// states at `src/runtime/wire-translation.ts:654` — a `Result` is not a lowerable
// type form and does not cross this envelope by specification
// (`docs/spec_topics/runtime-value-model.md`'s `Result<T, E>` row;
// `docs/spec_topics/schema-subset.md` §"Lowering Algorithm" step 3). But
// `JSON.stringify` DOES descend one, so depth contributed only from INSIDE a
// nested `Result` is under-counted and such a payload is admitted: measured,
// `[Ok([[[[[1]]]]]), 1]` writes `[{"ok":true,"value":[[[[[1]]]]]},1]` at document
// depth 8 and the seam answers `undefined`. Every row and cell below is
// therefore about payloads OUTSIDE a `Result` carrier, and PIC-59 states that
// bound normatively as its *Result-carriage bound*
// (`docs/spec_topics/pi-integration-contract/subagent.md:115`,
// `#subagent-envelope-result-carriage-bound`) rather than claiming a reach the
// walks do not have. `CONTROL (FENCE-NESTED-RESULT)` below pins the disposition
// in both directions so a later widening cannot happen silently — widening it is
// bug 0180's settled refusal mechanism
// (`docs/bugs/0187-untyped-subagent-return-boundary-no-depth-ceiling.md`
// §Non-goals, "0180's within-cap refusal"), out of this fix's scope, and recorded
// rather than widened on the `-0` precedent that became bug 0188.
//
// CODE IDENTITY, SETTLED: the canonical depth message under the existing
// `cause: "return_validation"`, with **no registered `theta/*` diagnostic code
// and no diagnostic emitted**. Grounds: zero registry rows exist for a
// ceiling-#4 depth breach at any of the five existing enforcement points — the
// only registry row that mentions the cap at all is
// `theta/runtime/subagent-return-value-not-representable`
// (`docs/spec_topics/diagnostics/code-registry-runtime.md:32`), and only to
// bound its own reach — and PIC-59 already ships a child-side fail-closed
// envelope class carrying no code of its own (the *Marked-root registration
// refusal* bullet, `docs/spec_topics/pi-integration-contract/subagent.md:116`).
// So NO cell below expects a diagnostic code, a registry row, or a non-empty
// diagnostic drain for the depth refusal; the drain being EMPTY is part of the
// asserted shape.
//
// `#validateInvokeReturn`, `#resolveReturnSite` and `inferCalleeReturnAnnotation`
// are BYTE-UNTOUCHED by this fix, so no cell requires any of them to move.
//
// SPEC.
//   - `docs/spec_topics/pi-integration-contract/subagent.md:101` (PIC-59) owns
//     the return envelope and its fail-closed inventory, whose members are the
//     envelope-parse / schema-skew bullet (`:112`), *Fail-closed
//     child-exit-without-envelope* (`:113`), *Fail-closed non-representable `Ok`
//     payload* (`:114`, bug 0180's, whose "anywhere within it MUST refuse" is
//     the sentence this report measured false past the cap), and *Marked-root
//     registration refusal* (`:116`). Route (b) adds a fifth member to that
//     inventory, and `:116` is the precedent for a member with no code.
//   - `docs/spec_topics/schema-subset.md:20` (§"Depth Enforcement") owns the
//     counting algorithm (`:24-30`, "The cap is `depth ≤ 5`" at `:30`), the
//     five enforcement points (`:39`), and the walk-before-AJV ordering (`:47`).
//     `:49` (§*Error shape*) pins the canonical message
//     `JSON document depth exceeds 5` verbatim, which the seam below sources
//     from `DEPTH_VIOLATION_MESSAGE` rather than as a copied literal.
//   - `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:17`
//     (`#ceiling-4-table`) is ceiling #4's per-boundary destination/surface
//     table and `:41` is CIO-3 ("the FIRST sub-check at every AJV validation
//     boundary"). THE ENVELOPE WRITER IS NOT AN AJV BOUNDARY: it validates
//     nothing and compiles no schema, so route (b) is a NEW fail-closed
//     envelope class rather than a widening of ceiling #4's enforcement points,
//     and the five-site table gains no row — which is why
//     `ceiling-invariants-and-audit.md:47`'s *Five-site list co-edit
//     obligation* is not engaged and why no cell here asserts a sixth site.
//     The refusal reuses ceiling #4's canonical message because
//     `schema-subset.md:49` fixes it for every depth breach, not because a new
//     enforcement point exists.
//   - `docs/spec_topics/invocation.md:28` (§*Typed return*) fixes that untyped
//     `invoke(...)` returns `Result<null, QueryError>` and "the runtime discards
//     the child's return value entirely" — bug 0068's settled discard arm, which
//     is why row F's Ok arm reads `"OK-DISCARD"` and why a refusal there is
//     observable only as the `Err` message. `:36` (INV-5) requires the parent to
//     derive the `invoke` result solely from the envelope and fixes "never a
//     fabricated `Ok`".
//   - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15,
//     observables (a) return values / (b) ordered diagnostic-code sequences /
//     (c) `theta-system-note` content) is why rows B, B3, D, E, I and J assert
//     UNCHANGED values: route (b) flips exactly the rows the report measures and
//     nothing else, and those six rows are the over-reach fence that proves it.
//     `:13` is the *Ceiling-set carve-out* the landing route adjudicates; this
//     file only pins which inputs flip. Row K is the same fence for the enum
//     carrier: clean source that succeeds at HEAD and must keep succeeding,
//     because its JSON document is inside the cap.
//
// TOKENS: none. Every fixture body is a pure tail expression or a `let` chain
// ending in one, so no query is issued and no provider is contacted. The
// marshalled `--provider`/`--model` reference (PIC-62) only satisfies the launch
// argv shape.
//
// THE CHILD PINS (AGENTS.md `#subagent-child-pins`) are all three, and each is a
// LOUD precondition rather than a skip: `process.argv[1]` replaced by the repo's
// own pi CLI entry through the `ExecutableHost` (under vitest `argv[1]` is
// vitest's entry script, and rung 1 would spawn `node <vitest-entry>`),
// `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this working tree's `extensions/` so
// each child loads the build under test rather than an ambient install, and
// `parentPid` written beside it because the control plane is AUTHENTICATED
// (`subagent.md` `#subagent-control-plane-authentication`) and an
// unauthenticated pin is stripped in silence. The harness shape is bug 0180's
// integration witness (`tests/subagent-invoke-nonfinite-return-refusal.test.ts`).
//
// FIXTURE SHAPE CONSTRAINTS, inherited from that file (and through it from bug
// 0174's witness). No callee declares `params:` and no body feeds a `.keys()`
// call into an `array<T>`-declared sink: both shapes make a spawned child exit 0
// with NO `theta_result` envelope (bugs 0178 and 0179), which would replace this
// file's observable with a launch-path one. Every declaration a fixture needs is
// made in its own body.
//
// A `tools:` ENTRY NAMING A PROMPT-MODE CALLEE IS REFUSED AT LOAD
// (`theta/load/prompt-mode-callable`,
// `docs/spec_topics/diagnostics/code-registry-load.md:28`), so the prompt-leg
// zero-flip evidence cannot ride the `tools:` boundary at all: it rests on rows
// I and J, which reach a prompt-mode callee through `invoke`.
//
// TIER: two, in one file, in this order.
//   (1) unit — the new seam (`SEAM`) and the writer's sub-check ORDER (`ORDER`),
//       both offline and provider-free; the ORDER cells drive the SHIPPED
//       child-side writer `driveSubagentRootRegime` in-process exactly as
//       `tests/subagent-envelope-nonfinite-ok-refusal.test.ts`'s `CHILD-*` cells
//       do, so the sub-check order is observed on the real writer without a
//       process.
//   (2) integration — the `UNINFERRED` rows. The unit tier cannot reach them:
//       the observable is what a CALLER BINDS at a `tools:`-declared
//       `.theta`-callable return, and that value is produced by a chain
//       beginning with a real child process's stdout and passing through
//       `#resolveReturnSite`, both private to `ProductionThetaProducer`. The
//       live tier adds nothing — no fixture issues a query, so no provider or
//       model participates and the whole run is deterministic.

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
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
import { driveSubagentChild, type SubagentInvocationResult } from "../src/runtime/subagent-json-driver";
import {
  launchSubagentChild,
  SUBAGENT_EXTENSION_PIN_ENV,
  type ChildExitInfo,
  type ExecutableHost,
} from "../src/runtime/subagent-launcher";
import {
  DEPTH_VIOLATION_MESSAGE,
  MAX_JSON_DEPTH,
  depthWalk,
  jsonDepth,
} from "../src/runtime/depth-walk";
import {
  SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE,
  parseEnvelopeLine,
  serializeOkEnvelope,
  type EnvelopeParse,
} from "../src/runtime/subagent-envelope";
import { makeEnumValue, makeOk } from "../src/runtime/value";
import { WallClock } from "../src/seams/wall-clock";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ParseThetaDocumentDeps, type ThetaDocument } from "../src/parser/theta-document";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
  type SchemaValidator,
} from "../src/seams/schema-validator";

// ===========================================================================
// Shared constants.
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

/** The existing `InvokeInfraCause` route (b) reuses; no enum member is added. */
const RETURN_VALIDATION_CAUSE = "return_validation";

/** The `InvokeInfraError` discriminator every PIC-59 fail-closed class carries. */
const INVOKE_INFRA_KIND = "invoke_infra";

/** The callee path the in-process ORDER drives echo, mirroring the 0180 unit witness's. */
const UNIT_CALLEE_PATH = "./kid.theta";

/** Fail loudly on a missing precondition — never a silent skip (*No silent test skipping*). */
function requirePath(path: string, what: string): void {
  if (!existsSync(path)) {
    throw new Error(
      `precondition unmet: ${what} not found at ${path} — the bug-0187 too-deep ` +
        `subagent-return witness needs the repo install (npm install) and the built extension ` +
        `entry; it never silently skips.`,
    );
  }
}

// ===========================================================================
// The route-(b) seam, read through a DYNAMIC import.
//
// A named static import of a missing export fails the whole FILE at link time,
// which would report one module error instead of reding each cell on its own
// primary assertion — and would take the integration rows below down with it for
// a link reason rather than a behavioural one. The import is therefore performed
// inside each cell, and the absent export is named as that cell's unmet
// precondition.
// ===========================================================================

/**
 * The refusal shape route (b) returns: an `InvokeInfraError` and nothing else.
 * Declared structurally here rather than imported so this file type-checks
 * against the tree both before and after the export lands. There is no paired
 * `diagnostic` member — see CODE IDENTITY in the header.
 */
interface TooDeepRefusal {
  readonly kind: string;
  readonly message: string;
  readonly callee_path: string;
  readonly cause: string;
}

type TooDeepMapper = (value: unknown, calleePath: string) => TooDeepRefusal | undefined;

/**
 * `mapTooDeepReturnValue`, or a LOUD red naming the unmet export. The `expect`
 * throws on failure, so a cell calling this stops on the precondition rather
 * than asserting against `undefined` and reporting a less diagnostic message.
 */
async function tooDeepMapper(): Promise<TooDeepMapper> {
  const mod = await import("../src/runtime/subagent-envelope");
  const map = (mod as unknown as Record<string, unknown>)["mapTooDeepReturnValue"];
  expect(
    typeof map,
    `precondition unmet (bug 0187 §Fix (b)): src/runtime/subagent-envelope.ts must export ` +
      `mapTooDeepReturnValue(value, calleePath) beside mapNonRepresentableReturnValue — the ` +
      `bounded WIRE-FORM depth refusal the envelope writer consults before serializeOkEnvelope. ` +
      `Observed exports: ` +
      `${JSON.stringify(Object.keys(mod as unknown as Record<string, unknown>).sort())}`,
  ).toBe("function");
  return map as TooDeepMapper;
}

/** The whole refusal rendered into an assertion message, so a red names what came back. */
function refusalDetail(refusal: TooDeepRefusal | undefined): string {
  return ` — observed ${JSON.stringify(refusal)}`;
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

// ===========================================================================
// The 0180 refusal message, composed from its registry row's halves (DIAG-4).
//
// The ORDER control cell and integration row B assert that bug 0180's NAMED
// within-cap refusal still wins where it already does. `docs/…/diagnostic-shape.md`
// (DIAG-4) makes the registry *Message* column the normative string, so the
// expectation is composed from that row's halves rather than copy-pasted as
// prose, exactly as both mirrored witnesses do.
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
 * Bug 0180's shipped within-cap refusal message for a non-finite `value` at
 * `pointer`, composed from the registry template's halves: the head with its
 * trailing `: ` stripped, the ` at <pointer>` segment (empty at the root), `: `,
 * and the `String(value)` rendering. An absent or malformed row is an unmet
 * precondition of every cell that uses it — 0180 shipped the row at 0.105.0, so
 * a throw here is a corpus regression rather than this report's class.
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
        `that column the only source for bug 0180's within-cap refusal string, which this file ` +
        `asserts UNCHANGED. Observed template: ${JSON.stringify(template)}`,
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

// ===========================================================================
// (SEAM) The new unit-tier seam: the bounded depthWalk refusal, in isolation.
// ===========================================================================

describe("bug 0187 (SEAM) — mapTooDeepReturnValue over a terminal Ok payload", () => {
  it("RED (SEAM-EXPORT): the envelope module exports the refusal, and the cap and message it reuses are the shipped ones", async () => {
    const map = await tooDeepMapper();

    // The cap and the message are NOT this file's to name: `schema-subset.md:30`
    // fixes `depth ≤ 5` and `:49` fixes the canonical message verbatim, and both
    // already exist as module constants. Sourcing them here is what makes the
    // breach cells below assert the corpus's string rather than a copy of it.
    expect(MAX_JSON_DEPTH, "schema-subset.md:30 — the cap route (b) reuses").toBe(5);
    expect(
      DEPTH_VIOLATION_MESSAGE,
      "schema-subset.md:49 — the canonical depth message, pinned verbatim",
    ).toBe("JSON document depth exceeds 5");

    // The refusal is reachable through the mapper for the report's own headline
    // payload (§Reproduction (b) row C's `[[[[[[1]]]]]]`), so this cell fails on
    // the export rather than on a behaviour a later cell owns.
    expect(
      map([[[[[[1]]]]]], UNIT_CALLEE_PATH),
      "PRIMARY (bug 0187 §Fix (b)): the export exists and refuses the report's headline payload",
    ).toBeDefined();
  });

  it("CONTROL (SEAM-WITHIN-CAP): every payload the counting algorithm puts at depth ≤ 5 is admitted", async () => {
    const map = await tooDeepMapper();

    // The depths are read off the SHIPPED counting algorithm (`jsonDepth`,
    // `schema-subset.md:24-30`) rather than counted by hand here, so a change to
    // the algorithm cannot leave these fixtures silently mis-labelled.
    const admitted: readonly unknown[] = [
      // Scalars and empty containers are depth 1 (`schema-subset.md:26`).
      1,
      0,
      -1,
      1.5,
      "s",
      true,
      null,
      {},
      [],
      // Depth 5 EXACTLY — the last depth the cap admits, in both spellings.
      [[[[1]]]],
      { a: { b: { c: { d: 1 } } } },
      // Mixed shapes inside the cap.
      { a: [{ b: 1 }] },
      [1, 2, 3],
      { n: 2, who: "w" },
    ];
    for (const value of admitted) {
      expect(
        jsonDepth(value),
        `${render(value)} must sit within the cap for this row to mean anything`,
      ).toBeLessThanOrEqual(MAX_JSON_DEPTH);
      const refusal = map(value, UNIT_CALLEE_PATH);
      expect(
        refusal,
        `a payload at depth ${jsonDepth(value)} must still write an ok envelope — ` +
          `${render(value)} was refused` +
          refusalDetail(refusal),
      ).toBeUndefined();
    }
  });

  it("RED (SEAM-DEPTH-SIX): a depth-6 payload refuses with the canonical shape", async () => {
    const map = await tooDeepMapper();

    // §Reproduction (b) row B2's payload one bracket shallower than row A's: the
    // FIRST depth the cap excludes.
    const value = [[[[[1]]]]];
    expect(jsonDepth(value), "the fixture is depth 6").toBe(6);

    const refusal = map(value, UNIT_CALLEE_PATH);
    expect(
      refusal,
      `PRIMARY (bug 0187 §Fix (b)): a payload past the cap must refuse before ` +
        `serializeOkEnvelope` + refusalDetail(refusal),
    ).toBeDefined();
    if (refusal === undefined) {
      return;
    }
    expect(refusal.kind, "the carrier is an InvokeInfraError, as PIC-59's siblings are").toBe(
      INVOKE_INFRA_KIND,
    );
    expect(
      refusal.cause,
      "carried on the EXISTING return_validation cause — no InvokeInfraCause member is added",
    ).toBe(RETURN_VALIDATION_CAUSE);
    expect(refusal.callee_path, "the carrier names the callee it refused").toBe(UNIT_CALLEE_PATH);
    expect(
      refusal.message,
      "and the message is ceiling #4's canonical depth string (schema-subset.md:49), reused " +
        "because that page fixes it for every depth breach — not because a sixth enforcement " +
        "point exists",
    ).toBe(DEPTH_VIOLATION_MESSAGE);
  });

  it("RED (SEAM-DEPTH-SEVEN): the report's headline depths refuse the same way, array and object alike", async () => {
    const map = await tooDeepMapper();

    // §Reproduction (b) rows A and C are both depth 7; row E's derivation
    // fixture is the object spelling of the same depth
    // (`W { a: [[[[[1]]]]] }`).
    const rows: readonly { readonly value: unknown; readonly label: string }[] = [
      { value: [[[[[[1]]]]]], label: "row A / C tail `[[[[[[1]]]]]]`" },
      { value: { a: [[[[[1]]]]] }, label: "row E payload `W { a: [[[[[1]]]]] }`" },
      { value: { a: { b: { c: { d: { e: { f: 1 } } } } } }, label: "the all-object spelling" },
    ];
    for (const row of rows) {
      expect(jsonDepth(row.value), `${row.label} is depth 7`).toBe(7);
      const refusal = map(row.value, UNIT_CALLEE_PATH);
      expect(
        refusal,
        `PRIMARY (bug 0187): ${row.label} must refuse` + refusalDetail(refusal),
      ).toBeDefined();
      if (refusal === undefined) {
        continue;
      }
      expect(refusal.kind, `${row.label} carrier`).toBe(INVOKE_INFRA_KIND);
      expect(refusal.cause, `${row.label} cause`).toBe(RETURN_VALIDATION_CAUSE);
      expect(refusal.callee_path, `${row.label} callee_path`).toBe(UNIT_CALLEE_PATH);
      expect(refusal.message, `${row.label} message`).toBe(DEPTH_VIOLATION_MESSAGE);
    }
  });

  it("RED (SEAM-CAP-BOUNDARY): the threshold is exactly MAX_JSON_DEPTH, asserted from both sides", async () => {
    const map = await tooDeepMapper();

    // §Reproduction (b) brackets the threshold from both sides at the CALLER
    // (rows B / B2 / A); this is the same bracketing at the seam, so a later
    // change to either side of the cap cannot pass unnoticed. The two spellings
    // are asserted together because the counting algorithm treats a non-empty
    // array and a non-empty object identically (`schema-subset.md:27`).
    const withinArray = [[[[1]]]];
    const breachArray = [[[[[1]]]]];
    const withinObject = { a: { b: { c: { d: 1 } } } };
    const breachObject = { a: { b: { c: { d: { e: 1 } } } } };

    expect(jsonDepth(withinArray), "the admitted array sits AT the cap").toBe(MAX_JSON_DEPTH);
    expect(jsonDepth(breachArray), "the refused array sits one level past it").toBe(
      MAX_JSON_DEPTH + 1,
    );
    expect(jsonDepth(withinObject), "the admitted object sits AT the cap").toBe(MAX_JSON_DEPTH);
    expect(jsonDepth(breachObject), "the refused object sits one level past it").toBe(
      MAX_JSON_DEPTH + 1,
    );

    expect(
      map(withinArray, UNIT_CALLEE_PATH),
      `a payload AT the cap is admitted — ${render(withinArray)}`,
    ).toBeUndefined();
    expect(
      map(withinObject, UNIT_CALLEE_PATH),
      `including in the object spelling — ${render(withinObject)}`,
    ).toBeUndefined();
    expect(
      map(breachArray, UNIT_CALLEE_PATH)?.message,
      `PRIMARY (bug 0187): one level past the cap refuses — ${render(breachArray)}`,
    ).toBe(DEPTH_VIOLATION_MESSAGE);
    expect(
      map(breachObject, UNIT_CALLEE_PATH)?.message,
      `PRIMARY (bug 0187): including in the object spelling — ${render(breachObject)}`,
    ).toBe(DEPTH_VIOLATION_MESSAGE);

    // This cell's fixtures are plain JSON — no enum carrier, no `Result` —
    // and on plain JSON the seam's wire-form walk and the shipped
    // `depthWalk` agree node for node, which is what this cell cross-checks.
    // Where they deliberately DIVERGE is the carrier question, fenced by
    // `SEAM-ENUM-CARRIER` below — see WIRE FORM, NOT CARRIER in the header.
    for (const value of [withinArray, withinObject, breachArray, breachObject]) {
      const walk = depthWalk(value);
      expect(
        map(value, UNIT_CALLEE_PATH) === undefined,
        `the seam agrees with depthWalk on ${render(value)} — walk says ` +
          `${JSON.stringify(walk)}`,
      ).toBe(walk.ok);
    }
  });

  it("CONTROL (SEAM-ENUM-CARRIER): the verdict is the payload's WIRE form, so an enum carrier at level 5 is admitted (green now, green after)", async () => {
    const map = await tooDeepMapper();

    // The carrier is built through the SHIPPED constructor, never a hand-made
    // `new String(...)`: `makeEnumValue` (`src/runtime/value.ts`) is what an
    // `enum Colour { Red = "red" }` variant evaluates to at runtime, so this cell
    // fences the real encoding rather than a look-alike.
    const carrier = makeEnumValue("Colour", "red");

    // Depth is asserted over the payload's WIRE FORM — the document
    // `JSON.stringify` actually writes, read back through `JSON.parse` and
    // measured by the shipped counting algorithm — so the cell states WHY these
    // payloads are inside the cap instead of asserting a bare expectation.
    const rows: readonly { readonly payload: unknown; readonly wire: unknown; readonly label: string }[] = [
      { payload: carrier, wire: "red", label: "a root-position variant `Colour.Red`" },
      { payload: [[[[carrier]]]], wire: [[[["red"]]]], label: "an array nest at level 5 `[[[[Colour.Red]]]]`" },
      {
        payload: { a: { b: { c: { d: carrier } } } },
        wire: { a: { b: { c: { d: "red" } } } },
        label: "the object spelling at level 5",
      },
    ];
    for (const row of rows) {
      const wire = JSON.parse(JSON.stringify(row.payload)) as unknown;
      expect(wire, `${row.label} serialises to its wire form`).toEqual(row.wire);
      expect(
        jsonDepth(wire),
        `${row.label}: its JSON DOCUMENT is within the cap, which is what the envelope's ` +
          `verdict is about`,
      ).toBeLessThanOrEqual(MAX_JSON_DEPTH);
      const refusal = map(row.payload, UNIT_CALLEE_PATH);
      expect(
        refusal,
        `PRIMARY (bug 0187 F1): ${row.label} must be ADMITTED — a refusal here carries ` +
          `"${DEPTH_VIOLATION_MESSAGE}" about a document whose depth is ${jsonDepth(wire)}, a ` +
          `message false of the input, and refuses clean source that succeeds at HEAD` +
          refusalDetail(refusal),
      ).toBeUndefined();
    }

    // The other direction: the carrier is a SCALAR, not a licence to nest. A
    // carrier one level deeper puts the document itself past the cap and must
    // refuse like any other `>cap` payload.
    const overDeep = [[[[[carrier]]]]];
    const overDeepWire = JSON.parse(JSON.stringify(overDeep)) as unknown;
    expect(overDeepWire, "the deeper nest's wire form").toEqual([[[[["red"]]]]]);
    expect(
      jsonDepth(overDeepWire),
      "whose JSON document genuinely exceeds the cap",
    ).toBe(MAX_JSON_DEPTH + 1);
    expect(
      map(overDeep, UNIT_CALLEE_PATH)?.message,
      `PRIMARY (bug 0187 F1): treating the carrier as a scalar must not admit a payload whose ` +
        `document is past the cap` + refusalDetail(map(overDeep, UNIT_CALLEE_PATH)),
    ).toBe(DEPTH_VIOLATION_MESSAGE);

    // WHY the envelope's walk is module-private rather than the shipped
    // `depthWalk`: the two answer different questions, and this is the one shape
    // they answer differently. `depthWalk` sees the boxed `String`'s character
    // indices as own enumerable keys (`Object.keys(new String("red"))` is
    // `["0","1","2"]`) and counts a level for the carrier; the envelope walk
    // reads it as the scalar `JSON.stringify` renders. A red here means the two
    // questions were merged — which is exactly what refuses `[[[["red"]]]]`.
    expect(
      depthWalk([[[[carrier]]]]).ok,
      "depth-walk.ts answers about PARSED JSON and is byte-untouched, so it still counts the " +
        "carrier as a non-empty object",
    ).toBe(false);
    expect(
      depthWalk(JSON.parse(JSON.stringify([[[[carrier]]]])) as unknown).ok,
      "and it agrees with the envelope walk once the payload IS parsed JSON",
    ).toBe(true);
  });

  it("CONTROL (FENCE-NESTED-RESULT): depth contributed only from inside a nested Result is NOT refused, and a Result past the cap still is (green now, green after)", async () => {
    const map = await tooDeepMapper();

    // PINNED BOUND, NOT THIS FIX'S CLASS. `wireFormExceedsDepthCap` does not
    // descend a `Result`, inheriting `firstNonFiniteNumber`'s reviewed arm on the
    // ground `projectForValidation` states at
    // `src/runtime/wire-translation.ts:654`: a `Result` is not a lowerable type
    // form and does not cross this envelope by specification
    // (`docs/spec_topics/runtime-value-model.md`'s `Result<T, E>` row;
    // `docs/spec_topics/schema-subset.md` §"Lowering Algorithm" step 3, which
    // rejects one in any schema-feeding position at parse time as
    // `theta/parse/result-in-schema-position`). `JSON.stringify` nevertheless
    // descends the carrier's own enumerable `ok` / `value` fields, so for a
    // payload nesting a `Result` the walk's verdict is an UNDER-COUNT of the real
    // wire depth and the payload is admitted. PIC-59 states that bound rather
    // than claiming a reach the walk lacks (its *Result-carriage bound*,
    // `docs/spec_topics/pi-integration-contract/subagent.md:115`), and this cell
    // pins the disposition so a later widening cannot happen silently. Widening
    // it is bug 0180's settled refusal mechanism
    // (`docs/bugs/0187-untyped-subagent-return-boundary-no-depth-ceiling.md`
    // §Non-goals, "0180's within-cap refusal") and is out of bug 0187's scope; the
    // disposition is recorded rather than widened, on the `-0` precedent that
    // became bug 0188.
    //
    // The `Result` is built through the SHIPPED constructor `makeOk`
    // (`src/runtime/value.ts`) — never a hand-made `{ ok: true, value }` — because
    // only that constructor installs the interpreter-private brand symbol
    // `isResultValue` classifies by, so this cell fences the real carrier rather
    // than a look-alike a plain object would make `wireFormExceedsDepthCap`
    // descend as a record.
    const nested = [makeOk([[[[[1]]]]]), 1];

    // The number this cell fences, read off the SHIPPED counting algorithm over
    // the payload's REAL wire form, so the cell is honest about what crosses.
    const wire = JSON.parse(JSON.stringify(nested)) as unknown;
    expect(wire, "the wire form the carrier's enumerable fields produce").toEqual([
      { ok: true, value: [[[[[1]]]]] },
      1,
    ]);
    expect(
      jsonDepth(wire),
      "the wire document is genuinely past the cap — this is the depth the bound admits",
    ).toBe(8);

    expect(
      map(nested, UNIT_CALLEE_PATH),
      `PINNED BOUND (PIC-59 #subagent-envelope-result-carriage-bound): a payload whose depth ` +
        `is contributed only from inside a nested Result is admitted at document depth ` +
        `${jsonDepth(wire)}. A red here means the Result arm was widened, which is bug 0180's ` +
        `settled mechanism and not this fix's to move` +
        refusalDetail(map(nested, UNIT_CALLEE_PATH)),
    ).toBeUndefined();

    // THE OTHER DIRECTION, so the fence BOUNDS the disposition instead of
    // blessing everything `Result`-shaped: the level check precedes the `Result`
    // arm, so a carrier sitting at a position that already exceeds the cap is
    // refused on its POSITION without the arm ever being consulted.
    const pastCap = [[[[[makeOk(1)]]]]];
    expect(
      jsonDepth(JSON.parse(JSON.stringify(pastCap)) as unknown),
      "five brackets put the carrier at level 6, one past the cap, before its own wire form counts",
    ).toBeGreaterThan(MAX_JSON_DEPTH);
    expect(
      map(pastCap, UNIT_CALLEE_PATH)?.message,
      `PRIMARY (bug 0187 §Fix (b)): a Result at a position already past the cap is still refused ` +
        `— the level check precedes the Result arm` +
        refusalDetail(map(pastCap, UNIT_CALLEE_PATH)),
    ).toBe(DEPTH_VIOLATION_MESSAGE);
  });
});

// ===========================================================================
// (ORDER) The SHIPPED child-side writer, driven in-process: the depth refusal is
// the FIRST sub-check in the `terminal.ok` arm.
//
// The harness is `tests/subagent-envelope-nonfinite-ok-refusal.test.ts`'s
// `driveChildRoot` — the regime is selected by `subagentRootRegime` naming the
// theta's slug, and an injected `emitResultEnvelope` captures the line, so the
// real writer runs without a process.
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
 * reason (*No silent test skipping*). §Reproduction states the premise these
 * bodies rest on: a nested array literal is ordinary theta source and no load-
 * or parse-time check bounds a value's nesting.
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

interface ChildDrive {
  readonly lines: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Drive the SHIPPED writer over a callee whose whole body is `body`. */
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
 * A payload that breaches the cap AND carries a within-cap non-finite `number`:
 * `{deep: [[[[[1]]]]], n: Infinity}` is depth 7, while `n` sits at level 2 where
 * 0180's bounded search reaches it. Exactly one of the two refusals can be
 * written, so this fixture is what makes the sub-check ORDER observable.
 */
const BOTH_BREACHES_BODY =
  "schema D { deep: array<array<array<array<array<number>>>>>, n: number }\n" +
  "D { deep: [[[[[1]]]]], n: 1 / 0 }\n";

describe("bug 0187 (ORDER) — the depth refusal is the first sub-check in the writer's terminal.ok arm", () => {
  it("RED (ORDER-BOTH): a payload that is BOTH too deep and non-finite emits the DEPTH refusal, with no diagnostic", async () => {
    const drive = await driveChildRoot(BOTH_BREACHES_BODY);
    const parse = soleEnvelope(drive);

    // Soft from here down so ONE run names both the wrong refusal and the stray
    // diagnostic channel, rather than stopping at the message.
    expect.soft(
      parse.kind,
      `PRIMARY (bug 0187 §Fix (b)): the writer must fail closed rather than serialise a payload ` +
        `past the cap` + driveDetail(drive),
    ).toBe("err");
    const error = errFields(parse);

    // PRIMARY. `schema-subset.md:47` and CIO-3 (`ceilings-3-and-4.md:41`) both
    // fix the depth walk as the FIRST sub-check wherever it runs; route (b)
    // places it before `mapNonRepresentableReturnValue` for the same reason —
    // a bounded fast-fail precedes the search it would otherwise make partially
    // meaningless (0180's search stops at the cap, so on this payload it reports
    // a position inside a document that must not cross at all).
    expect.soft(
      error["message"],
      `PRIMARY (bug 0187): the DEPTH refusal wins over 0180's within-cap non-finite refusal on ` +
        `a payload that trips both` + driveDetail(drive),
    ).toBe(DEPTH_VIOLATION_MESSAGE);
    expect.soft(error["kind"], "the carrier is an InvokeInfraError").toBe(INVOKE_INFRA_KIND);
    expect.soft(error["cause"], "on the existing return_validation cause").toBe(
      RETURN_VALIDATION_CAUSE,
    );
    expect.soft(error["callee_path"], "naming the callee the child refused").toBe(UNIT_CALLEE_PATH);

    // CODE IDENTITY: the depth refusal emits NOTHING on the diagnostic channel —
    // no registry row exists for a ceiling-#4 breach at any enforcement point,
    // and PIC-59's marked-root registration refusal (`subagent.md:116`) is the
    // shipped precedent for a child-side fail-closed class with no code. In
    // particular 0180's code must not ride this envelope: the value the child
    // refused is not the one that code names.
    expect.soft(
      drive.diagnostics.map((d) => d.code),
      `the depth refusal carries no registered code, and 0180's code does not ride it` +
        driveDetail(drive),
    ).toEqual([]);
  });

  it("RED (ORDER-DEPTH-ONLY): a FINITE payload past the cap refuses instead of writing an ok arm", async () => {
    // §Reproduction (b) row C's depth half, at the writer: nothing about
    // non-finiteness is needed for a `>cap` payload to cross today, so no change
    // to a non-finite search can close it.
    const drive = await driveChildRoot("[[[[[[1]]]]]]\n");
    const parse = soleEnvelope(drive);

    expect.soft(
      parse.kind,
      `PRIMARY (bug 0187 §Fix (b)): a finite payload at depth 7 must refuse rather than ` +
        `serialise` + driveDetail(drive),
    ).toBe("err");
    const error = errFields(parse);
    expect.soft(error["message"], `the canonical depth message` + driveDetail(drive)).toBe(
      DEPTH_VIOLATION_MESSAGE,
    );
    expect.soft(error["cause"]).toBe(RETURN_VALIDATION_CAUSE);
    expect.soft(
      drive.diagnostics,
      `no diagnostic accompanies the depth refusal` + driveDetail(drive),
    ).toEqual([]);
  });

  it("CONTROL (ORDER-WITHIN-CAP): 0180's named refusal still wins inside the cap, code and all (green now, green after)", async () => {
    // The over-reach fence for the ORDER change (GOV-15 observables (a) and
    // (b)). Route (b) inserts a check BEFORE 0180's; it does not replace it, so
    // a within-cap non-finite payload must keep refusing by NAME, at its
    // RFC-6901 position, with its registered code on the diagnostic channel. A
    // red here means the depth check swallowed 0180's class.
    const drive = await driveChildRoot("schema N { n: number }\nN { n: 1 / 0 }\n");
    const parse = soleEnvelope(drive);
    expect(parse.kind, `0180's refusal is still an err envelope` + driveDetail(drive)).toBe("err");
    const error = errFields(parse);
    expect(
      error["message"],
      `the within-cap refusal names the value and its position, not the depth` +
        driveDetail(drive),
    ).toBe(nonRepresentableMessage("/n", Infinity));
    expect(error["cause"], "on the same shared cause").toBe(RETURN_VALIDATION_CAUSE);
    expect(
      drive.diagnostics.map((d) => d.code),
      `and 0180's registered code is still emitted for its own class` + driveDetail(drive),
    ).toEqual([SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE]);
  });

  it("CONTROL (ORDER-FINITE-WITHIN-CAP): a payload inside the cap still writes its ok arm unchanged (green now, green after)", async () => {
    // The second half of the fence: route (b) must not refuse anything the cap
    // admits. Both spellings at depth 5 exactly, plus the plain scalar.
    const rows: readonly { readonly body: string; readonly line: string }[] = [
      { body: "2\n", line: '{"theta_result":{"v":1,"ok":2}}\n' },
      { body: "[[[[1]]]]\n", line: '{"theta_result":{"v":1,"ok":[[[[1]]]]}}\n' },
      {
        body:
          "schema W { a: array<array<array<number>>> }\n" + "W { a: [[[1]]] }\n",
        line: '{"theta_result":{"v":1,"ok":{"a":[[[1]]]}}}\n',
      },
    ];
    for (const row of rows) {
      const drive = await driveChildRoot(row.body);
      expect(
        drive.lines,
        `${row.body.trim()} writes exactly one ok envelope, unchanged`,
      ).toEqual([row.line]);
      expect(drive.diagnostics, `${row.body.trim()} emits no diagnostic`).toEqual([]);
    }
  });

  it("CONTROL (ORDER-ENUM-CARRIER): the REAL writer still writes the ok arm for an enum carrier at level 5 (green now, green after)", async () => {
    // The wire-form fence at the writer itself (bug 0187 F1). The interpreter
    // hands `driveSubagentRootRegime` the `makeEnumValue` carrier this body
    // builds, so the value the sub-checks see is the boxed `String` rather than
    // the string it serialises to — and the ok arm must still be written, because
    // the DOCUMENT `[[[["red"]]]]` is depth 5. A red here is the carrier being
    // counted as a nesting level.
    const drive = await driveChildRoot('enum Colour { Red = "red" }\n[[[[Colour.Red]]]]\n');

    // The expected bytes are the envelope writer's OWN rendering of the wire
    // form, so this cell cannot pass against a line the writer would not produce;
    // the literal beside it states what those bytes are.
    const expected = serializeOkEnvelope([[[["red"]]]]);
    expect(
      expected,
      "serializeOkEnvelope renders the wire form of a level-5 enum nest",
    ).toBe('{"theta_result":{"v":1,"ok":[[[["red"]]]]}}\n');
    expect(
      drive.lines,
      `PRIMARY (bug 0187 F1): the writer must emit the ok arm byte-identically for a payload ` +
        `whose JSON document is inside the cap` + driveDetail(drive),
    ).toEqual([expected]);
    expect(
      drive.diagnostics,
      `and drain nothing on the diagnostic channel` + driveDetail(drive),
    ).toEqual([]);
  });
});

// ===========================================================================
// (UNINFERRED) The integration tier: what a CALLER BINDS at the return boundary
// that runs no depth walk.
// ===========================================================================

/** `mode: subagent` frontmatter with no `tools:` — every leaf callee's shape. */
const SUB = "---\nmode: subagent\n---\n";

/** A `tools:`-callable root over one `.theta` callee. */
function toolsRoot(callee: string, body: string): string {
  return `---\nmode: subagent\ntools:\n  - ./${callee}.theta\n---\n${body}`;
}

/** A plain `mode: subagent` root (the `invoke`-form rows declare no `tools:`). */
function plainRoot(body: string): string {
  return SUB + body;
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
 * observable as a string instead of collapsing the root into its own `Err`.
 */
function matchMessageBody(call: string, okLabel: string): string {
  return `let r = ${call}\nlet m = match r { Ok(v) => "${okLabel}", Err(e) => e.message }\nm\n`;
}

/** The same reduction over `callee_path`, for the rows that pin which path the carrier names. */
function matchCalleePathBody(call: string): string {
  return `let r = ${call}\nlet m = match r { Ok(v) => "OK", Err(e) => e.callee_path }\nm\n`;
}

/**
 * The leaf callees and the thirteen roots. Every callee is `mode: subagent` except
 * `pdeepfin.theta`, which rows I and J reach through `invoke` — a `tools:` entry
 * naming it is refused at load (`theta/load/prompt-mode-callable`).
 */
const FIXTURES: Readonly<Record<string, string>> = {
  // Non-finite at level 7 — §Reproduction (b) row A's callee.
  "deepnf.theta": SUB + "[[[[[[1 / 0]]]]]]\n",
  // Non-finite at level 6 — the first level past the cap.
  "capsix.theta": SUB + "[[[[[1 / 0]]]]]\n",
  // Non-finite at level 5 — WITHIN the cap, so 0180's named refusal owns it.
  "capnf.theta": SUB + "[[[[1 / 0]]]]\n",
  // Finite, depth 7 — the depth half on its own.
  "deepfin.theta": SUB + "[[[[[[1]]]]]]\n",
  // Finite, depth 7, behind a schema-constructor tail the derivation CAN name.
  "deepschema.theta":
    SUB +
    "schema W { a: array<array<array<array<array<number>>>>> }\n" +
    "W { a: [[[[[1]]]]] }\n",
  // The prompt-mode callee: the leg that does not serialise.
  "pdeepfin.theta": "---\nmode: prompt\n---\n[[[[[[1]]]]]]\n",
  // A `tools:`-callable root in the middle of a chain: each child must refuse at
  // its OWN envelope, so the breach never depends on the depth of the chain.
  "middle.theta": toolsRoot("deepfin", bindValueBody("deepfin()")),
  // A declared enum variant nested at level 5 — clean source whose JSON DOCUMENT
  // (`[[[["red"]]]]`) is depth 5, inside the cap, even though the interpreter's
  // carrier for the variant is a boxed `String` (bug 0187 F1, row K).
  "colourdeep.theta": SUB + 'enum Colour { Red = "red" }\n[[[[Colour.Red]]]]\n',
};

/** One driven root per row, each spawned in its own child process. */
const ROOTS: Readonly<Record<string, string>> = {
  // Row A — `tools:` uninferred, non-finite at level 7, value bound.
  "top-a.theta": toolsRoot("deepnf", bindValueBody("deepnf()")),
  // Row B — `tools:` uninferred, non-finite WITHIN the cap, message read.
  "top-b.theta": toolsRoot("capnf", matchMessageBody("capnf()", "OK")),
  // Row B2 — `tools:` uninferred, non-finite at the first level past the cap.
  "top-b2.theta": toolsRoot("capsix", bindValueBody("capsix()")),
  // Row B3 — the same within-cap refusal, read for the path it names.
  "top-b3.theta": toolsRoot("capnf", matchCalleePathBody("capnf()")),
  // Row C — `tools:` uninferred, FINITE and past the cap.
  "top-c.theta": toolsRoot("deepfin", bindValueBody("deepfin()")),
  // Row D — the typed control: the same payload at a boundary that DOES walk.
  "top-d.theta": plainRoot(matchMessageBody('invoke<number>("./deepfin.theta")', "OK")),
  // Row D2 — the same typed control, read for the path it names.
  "top-d2.theta": plainRoot(matchCalleePathBody('invoke<number>("./deepfin.theta")')),
  // Row E — the derivation control: the same boundary, a nameable callee tail.
  "top-e.theta": toolsRoot("deepschema", matchMessageBody("deepschema()", "OK")),
  // Row F — bug 0068's discard arm: untyped `invoke` binds nothing, so a
  // refusal is observable only as the message.
  "top-f.theta": plainRoot(matchMessageBody('invoke("./deepfin.theta")', "OK-DISCARD")),
  // Row H — the grandchild chain: the refusal happens at each child's own
  // envelope, so an intermediate `tools:` hop does not launder it.
  "top-h.theta": toolsRoot("middle", matchMessageBody("middle()", "OK")),
  // Row I — the prompt leg, untyped: no serialisation, nothing to refuse.
  "top-i.theta": plainRoot(matchMessageBody('invoke("./pdeepfin.theta")', "OK-DISCARD")),
  // Row J — the prompt leg, typed: the PARENT-side walk owns it, unchanged.
  "top-j.theta": plainRoot(matchMessageBody('invoke<number>("./pdeepfin.theta")', "OK")),
  // Row K — the wire-form over-reach fence (bug 0187 F1): the same uninferred
  // `tools:` boundary as rows A/B2/C, carrying an enum variant at level 5. Its
  // document is inside the cap, so it binds at HEAD and must keep binding.
  "top-k.theta": toolsRoot("colourdeep", bindValueBody("colourdeep()")),
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

/**
 * Path comparison that tolerates the child's `realpath` normalisation: on
 * Windows a temp-directory path can come back with different casing than
 * `mkdtempSync` returned, and the assertion is about WHICH FILE the carrier
 * names, not about which spelling of it the OS chose.
 */
function samePath(observed: unknown, expected: string): boolean {
  if (typeof observed !== "string") {
    return false;
  }
  const normalise = (p: string): string => {
    const absolute = resolve(p).split("/").join(sep);
    return process.platform === "win32" ? absolute.toLowerCase() : absolute;
  };
  return normalise(observed) === normalise(expected);
}

describe("bug 0187 (UNINFERRED) — what a caller binds at a return boundary that runs no depth walk", () => {
  it(
    "a >cap terminal Ok payload is refused before it crosses, whether or not the return site names a type",
    async () => {
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");

      // One discovery root holds every fixture so each root's `./` callee paths
      // and `tools:` entries resolve beside it.
      const scratchDir = mkdtempSync(join(tmpdir(), "pi-theta-bug0187-"));
      const thetaDir = join(scratchDir, "thetas");
      mkdirSync(thetaDir, { recursive: true });
      for (const [name, source] of Object.entries({ ...FIXTURES, ...ROOTS })) {
        writeFileSync(join(thetaDir, name), source);
      }

      // Rung-1 executable resolution, exactly as a pi-hosted parent resolves it
      // (node + the entry script); pinned to the repo's own pi install. Under
      // vitest `process.argv[1]` is vitest's own entry, so an unpinned rung 1
      // would spawn `node <vitest-entry> …` and the child would die instantly.
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
         * AUTHENTICATES the pin at each level, so omitting it would strip the
         * pin silently and bind ambient builds instead.
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
                tools: [],
                emptyCallableSet: true,
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
        // two live `pi` processes, and thirteen concurrent pairs would make the
        // wall time a function of machine load rather than of the boundary.
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
        // envelope; and the parent-side drain is EMPTY on every row, HEAD and
        // after (the depth refusal emits no diagnostic — see CODE IDENTITY — and
        // 0180's code is emitted in the CHILD, whose diagnostic channel is
        // process-local). A non-empty drain means the run failed for a different
        // reason than the return boundary.
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
        // Row A — PRIMARY. `tools:` uninferred, non-finite at level 7, value
        // bound. At HEAD the caller binds `[[[[[[null]]]]]]` for a callee that
        // produced `[[[[[[Infinity]]]]]]` with an empty drain: INV-5's "never a
        // fabricated `Ok`" (`invocation.md:36`) and PIC-59's own never-fabricate
        // principle, failing on the one leg where nothing else looks.
        // -----------------------------------------------------------------
        {
          const a = row("top-a");
          expect.soft(
            a.result.ok,
            `(A) PRIMARY (bug 0187): a caller must not bind a value its callee never produced — ` +
              `at HEAD this settles Ok([[[[[[null]]]]]]) for a callee whose tail is ` +
              `[[[[[[1 / 0]]]]]]` + outcomeDetail(a),
          ).toBe(false);
          expect.soft(
            errField(a, "message"),
            `(A) and the refusal is the canonical depth message, because the payload is past the ` +
              `cap before its non-finiteness is reachable` + outcomeDetail(a),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
          expect.soft(
            errField(a, "kind"),
            `(A) carried as an InvokeInfraError` + outcomeDetail(a),
          ).toBe(INVOKE_INFRA_KIND);
          expect.soft(
            errField(a, "cause"),
            `(A) on the existing return_validation cause` + outcomeDetail(a),
          ).toBe(RETURN_VALIDATION_CAUSE);
        }

        // -----------------------------------------------------------------
        // Row B — CONTROL / GREEN FENCE. The same boundary, one level
        // shallower: 0180's within-cap refusal names the value and its RFC-6901
        // position, and route (b) must leave it exactly so (GOV-15 observable
        // (a), `source-language-stability.md:5`).
        // -----------------------------------------------------------------
        {
          const b = row("top-b");
          expect.soft(
            okValue(b),
            `(B) CONTROL — a non-finite number INSIDE the cap keeps refusing by name at its ` +
              `pointer; a red here means the depth refusal swallowed 0180's class` +
              outcomeDetail(b),
          ).toBe(nonRepresentableMessage("/0/0/0/0", Infinity));
        }

        // -----------------------------------------------------------------
        // Row B2 — PRIMARY, the exact cap boundary at the caller. Level 6 is
        // the first level 0180's bounded search cannot reach, and at HEAD it
        // fabricates where level 5 refuses by name.
        // -----------------------------------------------------------------
        {
          const b2 = row("top-b2");
          expect.soft(
            b2.result.ok,
            `(B2) PRIMARY (bug 0187): the discriminator is exactly MAX_JSON_DEPTH — level 5 ` +
              `refuses (row B) and level 6 must not fabricate` + outcomeDetail(b2),
          ).toBe(false);
          expect.soft(
            errField(b2, "message"),
            `(B2) with the canonical depth message` + outcomeDetail(b2),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
        }

        // -----------------------------------------------------------------
        // Row B3 — CONTROL / GREEN FENCE. 0180's refusal is minted CHILD-SIDE,
        // so its `callee_path` is the child's own resolved absolute path rather
        // than the spelling the caller wrote. Pinned here because row D2's flip
        // is that same property arriving at a boundary that used to mint the
        // refusal parent-side.
        // -----------------------------------------------------------------
        {
          const b3 = row("top-b3");
          expect.soft(
            samePath(okValue(b3), join(thetaDir, "capnf.theta")),
            `(B3) CONTROL — a child-side refusal names the child's own resolved path` +
              outcomeDetail(b3),
          ).toBe(true);
        }

        // -----------------------------------------------------------------
        // Row C — PRIMARY, the depth half on its own. No non-finite value is
        // involved: a `>cap` FINITE payload crosses this boundary unchecked at
        // HEAD, which is why no change to a non-finite search can close the
        // report.
        // -----------------------------------------------------------------
        {
          const c = row("top-c");
          expect.soft(
            c.result.ok,
            `(C) PRIMARY (bug 0187): a FINITE payload past the cap must be refused too — at HEAD ` +
              `the caller binds [[[[[[1]]]]]]` + outcomeDetail(c),
          ).toBe(false);
          expect.soft(
            errField(c, "message"),
            `(C) with the canonical depth message` + outcomeDetail(c),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
          expect.soft(
            errField(c, "cause"),
            `(C) on the existing return_validation cause` + outcomeDetail(c),
          ).toBe(RETURN_VALIDATION_CAUSE);
        }

        // -----------------------------------------------------------------
        // Row D — CONTROL / GREEN FENCE. The same payload at a boundary that
        // DOES run the walk: `#validateInvokeReturn` reaches
        // `enforceInvokeReturnDepth` because the site names a type. The message
        // is byte-identical before and after, which is what makes the depth
        // refusal a reuse of `schema-subset.md:49` rather than a new string.
        // -----------------------------------------------------------------
        {
          const d = row("top-d");
          expect.soft(
            okValue(d),
            `(D) CONTROL — the typed boundary already refuses this payload, and route (b) leaves ` +
              `its message byte-identical` + outcomeDetail(d),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
        }

        // -----------------------------------------------------------------
        // Row D2 — THE ENUMERATED FLIP (GOV-15 observable (a), stated rather
        // than absorbed). The message does not move; the `callee_path` does. At
        // HEAD the refusal is minted PARENT-side by
        // `enforceInvokeReturnDepth(calleePath, …)`, so it echoes the literal
        // the caller wrote (`"./deepfin.theta"`). Under route (b) the child
        // refuses first, so the carrier that reaches the caller is the child's,
        // naming the child's own resolved absolute path — the same property row
        // B3 pins for 0180's refusal. This cell asserts the AFTER shape.
        // -----------------------------------------------------------------
        {
          const d2 = row("top-d2");
          expect.soft(
            samePath(okValue(d2), join(thetaDir, "deepfin.theta")),
            `(D2) FLIP (bug 0187 §Fix (b)): the refusal now originates in the child, so the ` +
              `carrier names the child's resolved absolute path rather than the caller's literal ` +
              `"./deepfin.theta"` + outcomeDetail(d2),
          ).toBe(true);
        }

        // -----------------------------------------------------------------
        // Row E — CONTROL / GREEN FENCE. The same `tools:` BOUNDARY as rows
        // A/B2/C, with a callee tail `inferCalleeReturnAnnotation` can name, so
        // the site is typed and the parent-side walk already refuses. The
        // discriminator at HEAD is the callee's tail syntax, not the boundary —
        // and this row must not move.
        // -----------------------------------------------------------------
        {
          const e = row("top-e");
          expect.soft(
            okValue(e),
            `(E) CONTROL — a schema-constructor callee tail gives this boundary a type, so the ` +
              `depth walk already runs; the verdict and its message are unchanged` +
              outcomeDetail(e),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
        }

        // -----------------------------------------------------------------
        // Row F — PRIMARY, structurally entailed by a child-side refusal. Bug
        // 0068 (`invocation.md:28`) settled that untyped `invoke(...)` returns
        // `Result<null, QueryError>` and discards the callee's value, so at HEAD
        // this arm reports success for a payload nothing ever looked at. A
        // refusal written before the value leaves the child reaches even this
        // arm, because the `Err` is what the parent derives its result from
        // (INV-5).
        // -----------------------------------------------------------------
        {
          const f = row("top-f");
          expect.soft(
            okValue(f),
            `(F) PRIMARY (bug 0187): the discard arm is reached too — the child refuses before ` +
              `the parent has anything to discard` + outcomeDetail(f),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
        }

        // -----------------------------------------------------------------
        // Row H — PRIMARY, the chain. `middle.theta` is itself a `tools:` root
        // that binds `deepfin`'s value and returns it, so at HEAD the payload
        // crosses TWO uninferred boundaries and arrives intact. Each child
        // refuses at its own envelope, so the grandchild's breach is what the
        // root reports and no intermediate hop launders it.
        // -----------------------------------------------------------------
        {
          const h = row("top-h");
          expect.soft(
            okValue(h),
            `(H) PRIMARY (bug 0187): an intermediate uninferred hop does not launder a >cap ` +
              `payload — the refusal happens at each child's own envelope` + outcomeDetail(h),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
        }

        // -----------------------------------------------------------------
        // Row I — CONTROL / GREEN FENCE, the prompt leg's zero flip
        // (untyped). A `mode: prompt` callee attaches to its caller's
        // conversation and does not serialise (`subagent.md:110`), so there is
        // no envelope to refuse; `invocation.md:28`'s discard then makes the
        // value unobservable. Route (b) is child-envelope-only, so this row must
        // not move.
        // -----------------------------------------------------------------
        {
          const i = row("top-i");
          expect.soft(
            okValue(i),
            `(I) CONTROL — the prompt leg does not serialise, so route (b) has nothing to refuse ` +
              `there; the untyped discard still reports success` + outcomeDetail(i),
          ).toBe("OK-DISCARD");
        }

        // -----------------------------------------------------------------
        // Row J — CONTROL / GREEN FENCE, the prompt leg's zero flip (typed).
        // The PARENT-side ceiling-#4 walk owns this boundary and route (b)
        // leaves `#validateInvokeReturn` byte-untouched, so the same refusal
        // arrives from the same place with the same message.
        // -----------------------------------------------------------------
        {
          const j = row("top-j");
          expect.soft(
            okValue(j),
            `(J) CONTROL — the parent-side walk is untouched, so a typed prompt-callee boundary ` +
              `refuses exactly as it does today` + outcomeDetail(j),
          ).toBe(DEPTH_VIOLATION_MESSAGE);
        }

        // -----------------------------------------------------------------
        // Row K — CONTROL / GREEN FENCE, THE WIRE-FORM OVER-REACH FENCE (bug
        // 0187 F1). The same uninferred `tools:` boundary rows A/B2/C reach,
        // with a callee whose tail nests a DECLARED ENUM VARIANT at level 5.
        // The interpreter's carrier for that variant is a boxed `String`
        // (`makeEnumValue`, `src/runtime/value.ts`), whose own enumerable keys
        // are its character indices — so a depth verdict computed over the
        // carrier rather than the wire form counts a level for it and refuses
        // `[[[[Colour.Red]]]]` with a message false of its document
        // (`[[[["red"]]]]`, depth 5). Clean source, zero diagnostics, binding at
        // HEAD on every subagent-leg surface: GREEN NOW AND AFTER.
        // -----------------------------------------------------------------
        {
          const k = row("top-k");
          expect.soft(
            k.result.ok,
            `(K) CONTROL (bug 0187 F1) — an enum variant nested at level 5 is clean source whose ` +
              `JSON document is INSIDE the cap, so the boundary must still bind it` +
              outcomeDetail(k),
          ).toBe(true);
          expect.soft(
            okValue(k),
            `(K) and the caller binds the variant's wire form at every level it was nested — a ` +
              `red here is the depth verdict being computed over the interpreter's carrier ` +
              `instead of the wire form` + outcomeDetail(k),
          ).toEqual([[[["red"]]]]);
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
