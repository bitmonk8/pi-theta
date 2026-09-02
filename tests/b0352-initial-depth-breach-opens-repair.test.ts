// Bug 0352 — a depth-6+ payload on the INITIAL forced respond turn terminates
// the typed query with `attempts: 0` and never opens respond-repair.
//
// `runTypedQueryLoop`'s depth arm (src/runtime/query-tool-loop.ts:663–700 —
// `const walk = depthWalk(forced.payload); if (!walk.ok) { … attempts: 0 …
// return { kind: "validation", … } }`) returns a TERMINAL `validation` outcome
// with `attempts: 0` on the very first forced-respond depth breach, INSTEAD of
// routing the breach into `schemaValidation.runRespondRepair(...)` the way the
// two sibling failure arms of the SAME function already do — the ERR-17
// noncompliance arm (:620–656) and the AJV non-conformance arm (:711–738).
// schema-subset.md:59 ("Because depth violations are `validation` failures,
// typed-query respond-repair follow-ups apply per [Query — Schema-validation
// respond-repair] at the typed-query response boundary (row #1)") grants
// respond-repair to depth violations. QRY-22 ("A response that does not conform
// MUST be routed through the respond-repair loop") and CIO-3 (the depth walk
// runs BEFORE AJV at the same boundary, but the walk's POSITION does not license
// the terminal return — the AJV arm at the same boundary opens repair) pin the
// contract the depth arm violates.
//
// The fix (bug doc §Fix sketch) replaces the depth arm's direct terminal return
// with the AJV arm's routing: build `ValidationFailure { kind:
// "schema_validation", issues: [walk.issue], raw_response:
// JSON.stringify(forced.payload) }`, call `schemaValidation.runRespondRepair(...)`
// when the collaborator is present, and fall back to the current terminal shape
// only when it is absent.
//
// WHY these cells drive the PRODUCTION seams: they exercise the real
// `parseThetaDocument` → `lowerQueryResponseSchema` → real `AjvSchemaValidator`
// → `buildTypedQueryValidation` → `runTypedQueryLoop` path (the
// tests/e2e-s3-typed-query-conformance.test.ts harness pattern, mirrored from
// the sibling tests/b0353-followup-respond-payload-depth-walk.test.ts). The
// `OpeningModel` scripts the single forced-respond turn, and
// `buildTypedQueryValidation`'s injected `driveFollowUp` scripts the follow-ups.
// So the bypass is witnessed at the exact seam the fix edits, not a mock of it.
//
// WHY the follow-up re-walk exists in this tree: bug 0352 must land WITH bug
// 0353 (bug doc §Fix constraint 1) — 0353's SANCTIONED uncommitted change adds
// `depthWalk(payload)` at the top of `validateAgainst`
// (src/runtime/typed-query-validation.ts) BEFORE AJV. That is why Cell B's
// still-too-deep follow-ups are caught (each `nextFollowUp` depth-walks before
// AJV) and the exhaustion path terminates correctly instead of binding a
// too-deep repair. This test does not touch that change.
//
// Spec: docs/spec_topics/schema-subset.md:59 (row #1 grants respond-repair to
// depth violations); query/query-failure-and-repair.md QRY-22 (non-conformance
// MUST route through respond-repair); hard-ceilings/ceilings-3-and-4.md CIO-3
// (depth walk before AJV at the same boundary); depth-walk.ts (MAX_JSON_DEPTH=5,
// DEPTH_VIOLATION_MESSAGE, DEPTH_VIOLATION_SCHEMA_KEYWORD); the bug doc
// docs/bugs/0352-initial-depth-breach-bypasses-repair.md.

import { describe, expect, it } from "vitest";
import {
  runTypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type TypedQueryOutcome,
  type TypedQuerySchemaValidation,
} from "../src/runtime/query-tool-loop";
import {
  buildTypedQueryValidation,
  type FollowUpRespondOutcome,
} from "../src/runtime/typed-query-validation";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  DEPTH_VIOLATION_MESSAGE,
  DEPTH_VIOLATION_SCHEMA_KEYWORD,
  jsonDepth,
} from "../src/runtime/depth-walk";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
} from "../src/parser/theta-document";
import type { ValidationIssue } from "../src/runtime/query-error";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Checkpoint } from "../src/seams/checkpoint";

// --- Substrate (mirrors the e2e-s3 harness / the b0353 sibling) ------------

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function config(): QueryToolLoopConfig {
  // A typed query at `max_rounds: 0` fires the forced-respond terminator as its
  // only turn (QRY-14) — the scripted model supplies only that turn, and the
  // follow-up rides the injected `driveFollowUp`.
  return {
    maxRounds: 0,
    querySite: { file: "probe.theta", line: 1, column: 1 },
    thetaSlashName: "/probe",
    invocationId: "inv-0352",
    occurredAt: 0,
  };
}

/**
 * A scripted model whose SINGLE forced-respond turn is whatever opener a cell
 * needs — a `respond` payload (a depth breach opens repair post-fix; an
 * AJV-invalid-but-depth-legal payload opens repair on the AJV arm) or an ERR-17
 * `noncompliance` report (the noncompliance arm).
 */
class OpeningModel implements QueryModelDriver {
  constructor(private readonly opener: ForcedRespondTurn) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve(this.opener);
  }
}

/** Parse `.theta` source and return its body's `schema` declarations. */
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The real production AJV validator (byte-identical to the sibling suites). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "probe",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** A `FollowUpRespondOutcome` delivering `payload` through the shipped payload arm. */
function payloadFollowUp(payload: unknown): FollowUpRespondOutcome {
  return { kind: "respond_outcome", turn: { kind: "payload", payload } };
}

/**
 * Build the production `TypedQuerySchemaValidation` for `annotation` against
 * `decls`, driving each respond-repair follow-up with `follow` through the
 * two-phase-restart payload arm. `driveFollowUp` returns `follow` on EVERY call,
 * so the SAME scripted follow-up is re-returned up to `budget` times — Cell B's
 * exhaustion driver (a still-too-deep payload returned three times) needs
 * exactly this, and Cell A's single conforming follow-up stops after one call by
 * binding. `budget` counts follow-up slots (`respond_repair.attempts`).
 */
function buildValidation(
  annotation: string,
  decls: readonly SchemaDecl[],
  follow: FollowUpRespondOutcome,
  budget: number,
): { readonly validation: TypedQuerySchemaValidation; readonly lowered: LoweredSchema; followUpCalls(): number } {
  const lowered = lowerQueryResponseSchema(annotation, decls);
  if (lowered === undefined) {
    // No silent skipping: a fixture whose annotation does not lower cannot
    // witness anything — fail loudly naming the unmet precondition.
    throw new Error(
      `precondition unmet: annotation \`${annotation}\` failed to lower (parser/lowerer drift)`,
    );
  }
  const state = { calls: 0 };
  const validation = buildTypedQueryValidation({
    lowered,
    resolveShape: () => decls.find((s) => s.name === annotation),
    schemaValidator: ajv(),
    attempts: budget,
    maxRounds: 0,
    driveFollowUp: () => {
      state.calls += 1;
      return Promise.resolve(follow);
    },
  });
  return { validation, lowered, followUpCalls: () => state.calls };
}

/** Human-readable outcome digest for a red witness's failure message. */
function describeOutcome(outcome: TypedQueryOutcome): string {
  if (outcome.kind === "value") {
    return `kind=value value=${JSON.stringify(outcome.value)}`;
  }
  if (outcome.kind === "validation") {
    return `kind=validation attempts=${outcome.error.attempts} validation_errors=${JSON.stringify(outcome.error.validation_errors)}`;
  }
  return `kind=${outcome.kind}`;
}

/** The canonical depth-violation issue's constants (depth-walk.ts). */
function isDepthIssue(issue: ValidationIssue | undefined): boolean {
  return (
    issue !== undefined &&
    issue.message === DEPTH_VIOLATION_MESSAGE &&
    issue.schema_keyword === DEPTH_VIOLATION_SCHEMA_KEYWORD
  );
}

// The depth-7 INITIAL forced payload (bug doc §Symptom): object nesting seven
// levels deep; `firstTooDeep` fast-fails at `/a/b/c/d/e` (level 6 > 5).
const DEPTH7 = { a: { b: { c: { d: { e: { f: 1 } } } } } };
// A STILL-too-deep follow-up payload (jsonDepth 6): `{a:[[[["x"]]]]}` — a
// nested-array member 0353's `validateAgainst` depth-walks BEFORE AJV.
const DEPTH6 = { a: [[[["x"]]]] };
// A CONFORMING shallow recovery payload (jsonDepth 2), distinct so Cell A can
// assert the bound value came from the follow-up, not the opener.
const RECOVERED = { recovered: true };

// Loud fixture preconditions: the depth of every fixture is asserted so a red
// can never be blamed on a mis-shaped fixture (schema-subset.md §Depth cap 5).
describe("bug 0352 — fixture depth preconditions", () => {
  it("DEPTH7 breaches (7 > 5), DEPTH6 breaches (6 > 5), RECOVERED is legal (2 ≤ 5)", () => {
    expect(jsonDepth(DEPTH7), "DEPTH7 must be depth 7 (a real initial breach)").toBe(7);
    expect(jsonDepth(DEPTH6), "DEPTH6 must be depth 6 (a still-too-deep follow-up)").toBe(6);
    expect(jsonDepth(RECOVERED), "RECOVERED must be depth ≤ 5 (a legal follow-up)").toBe(2);
  });
});

// ===========================================================================
// Cell A — RECOVERY. RED at HEAD. The initial forced payload is depth-7 (a real
// breach); `attempts: 3`; the single scripted follow-up returns a CONFORMING
// depth-2 payload. Under the permissive `{}` root the SOLE failure driver on the
// opener is depth, not shape (AJV accepts every payload against `{}`).
//
// Post-fix (schema-subset.md:59): the depth arm OPENS repair, the follow-up
// re-validates and BINDS → `outcome.kind === "value"` with RECOVERED,
// `followUpCalls() === 1`.
//
// At HEAD: the depth arm returns a terminal `validation`/`attempts: 0` outcome
// and NEVER issues a follow-up (`followUpCalls() === 0`) — so `kind` is
// `"validation"` where `"value"` is required. RED for the right reason.
// ===========================================================================

describe("bug 0352 (Cell A) — RECOVERY: an initial depth breach must open repair; a conforming follow-up binds", () => {
  it("the depth-7 opener opens respond-repair, the conforming follow-up binds as the value", async () => {
    // The unresolved-name arm (bug 0028) lowers to the permissive `{}` root, so
    // the opener's ONLY rejection driver is depth (AJV accepts everything).
    const decls = schemaDeclsOf("schema Other { x: string }");
    const built = buildValidation("ImportedElsewhere", decls, payloadFollowUp(RECOVERED), 3);
    expect(
      built.lowered,
      "precondition unmet: the imported-name arm did not lower to the permissive `{}` root",
    ).toEqual({});
    const compiled = ajv().compile(built.lowered);
    // Loud precondition: AJV ACCEPTS a legal shallow payload, so on the opener
    // the only failure driver is depth — not shape.
    expect(
      compiled.validate(RECOVERED).ok,
      "precondition unmet: AJV must ACCEPT the legal shallow follow-up so depth is the sole failure driver",
    ).toBe(true);
    // And AJV would ACCEPT the depth-7 opener too — proving depth (the loop's
    // walk-before-AJV, query-tool-loop.ts:663) is what rejects it, not shape.
    expect(
      compiled.validate(DEPTH7).ok,
      "precondition unmet: AJV must ACCEPT the depth-7 opener (so the depth WALK is its sole rejector)",
    ).toBe(true);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "respond", payload: DEPTH7 }),
      config(),
      built.validation,
    );

    // RED driver: schema-subset.md:59 grants respond-repair to the depth breach,
    // so a conforming follow-up must BIND. At HEAD the depth arm terminates with
    // `validation`/attempts:0 and no follow-up is ever issued.
    expect(
      outcome.kind,
      `schema-subset.md:59: an initial depth breach opens repair and a conforming follow-up binds; observed ${describeOutcome(outcome)}`,
    ).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual(RECOVERED);
    }
    expect(
      built.followUpCalls(),
      "QRY-22: the depth breach must be routed through respond-repair (≥1 follow-up issued)",
    ).toBe(1);
  });
});

// ===========================================================================
// Cell B — EXHAUSTION. RED at HEAD. Initial depth-7 opener; `attempts: 3`; EVERY
// follow-up returns a STILL-too-deep depth-6 payload. Under the permissive `{}`
// root the follow-up passes AJV but 0353's `validateAgainst` depth-walks it
// FIRST → schema_validation failure → slot debited, on all three attempts.
//
// Post-fix: repair opens, exhausts the budget → terminal EXHAUSTION
// `outcome.kind === "validation"`, `error.attempts === 3`,
// `error.cause === "schema_validation"`, `isDepthIssue(validation_errors[0])`,
// `followUpCalls() === 3`.
//
// At HEAD: the depth arm returns terminal `attempts: 0` with `followUpCalls()
// === 0`. RED driver: `attempts` (0 vs 3) and `followUpCalls` (0 vs 3).
// ===========================================================================

describe("bug 0352 (Cell B) — EXHAUSTION: an initial depth breach opens repair and exhausts on still-too-deep follow-ups", () => {
  it("the depth-7 opener opens repair; three still-too-deep follow-ups exhaust the budget with the maxDepth issue", async () => {
    const decls = schemaDeclsOf("schema Other { x: string }");
    const built = buildValidation("ImportedElsewhere", decls, payloadFollowUp(DEPTH6), 3);
    expect(
      built.lowered,
      "precondition unmet: the imported-name arm did not lower to the permissive `{}` root",
    ).toEqual({});
    // Loud precondition: AJV ACCEPTS the depth-6 follow-up (permissive `{}`), so
    // its only rejector is 0353's walk-before-AJV in `validateAgainst`.
    expect(
      ajv().compile(built.lowered).validate(DEPTH6).ok,
      "precondition unmet: AJV must ACCEPT the depth-6 follow-up so the follow-up depth WALK is its sole rejector",
    ).toBe(true);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "respond", payload: DEPTH7 }),
      config(),
      built.validation,
    );

    // RED driver: at HEAD `attempts` is 0 and `followUpCalls` is 0; post-fix the
    // budget is granted, three follow-ups are re-validated, and the loop exhausts.
    expect(
      outcome.kind,
      `schema-subset.md:59 / QRY-22: an initial depth breach opens repair and exhausts; observed ${describeOutcome(outcome)}`,
    ).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(
      outcome.error.attempts,
      `ERR: three follow-up slots must be DEBITED (repair granted); observed attempts=${outcome.error.attempts}`,
    ).toBe(3);
    expect(outcome.error.cause).toBe("schema_validation");
    expect(
      isDepthIssue(outcome.error.validation_errors[0]),
      `the terminal issue is the canonical maxDepth breach; observed ${JSON.stringify(outcome.error.validation_errors)}`,
    ).toBe(true);
    expect(
      built.followUpCalls(),
      "QRY-22: three re-validated follow-ups must be issued",
    ).toBe(3);
  });
});

// ===========================================================================
// Cell C — AJV-ARM CONTROL. GREEN before AND after (byte-identical neighbour).
// The initial forced payload is AJV-INVALID but depth-LEGAL (`{a:42}`, depth 2)
// against `schema Typed { a: string }`; `attempts: 3`; the follow-up conforms
// (`{a:"ok"}`) and binds. This exercises the AJV arm (query-tool-loop.ts:711),
// which the fix does not touch — it must keep opening repair and binding.
// ===========================================================================

describe("bug 0352 (Cell C control) — the AJV non-conformance arm is untouched: an AJV-invalid depth-legal opener still opens repair and binds", () => {
  it("the `{a:42}` opener (depth 2) opens repair; the conforming `{a:\"ok\"}` follow-up binds", async () => {
    const decls = schemaDeclsOf("schema Typed { a: string }");
    const built = buildValidation("Typed", decls, payloadFollowUp({ a: "ok" }), 3);
    const compiled = ajv().compile(built.lowered);
    // Loud preconditions: the opener is depth-LEGAL (so the depth arm does NOT
    // fire) and AJV-INVALID (so the AJV arm opens repair); the follow-up conforms.
    expect(
      jsonDepth({ a: 42 }),
      "precondition unmet: the AJV-arm opener must be depth-legal (≤5) so the depth arm does not intercept it",
    ).toBe(2);
    expect(
      compiled.validate({ a: 42 }).ok,
      "precondition unmet: the opener `{a:42}` must FAIL AJV so the AJV arm opens repair",
    ).toBe(false);
    expect(
      compiled.validate({ a: "ok" }).ok,
      "precondition unmet: the follow-up `{a:\"ok\"}` must CONFORM to the lowered schema",
    ).toBe(true);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "respond", payload: { a: 42 } }),
      config(),
      built.validation,
    );

    expect(
      outcome.kind,
      `the AJV arm must open repair and bind the conforming follow-up; observed ${describeOutcome(outcome)}`,
    ).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual({ a: "ok" });
    }
    expect(built.followUpCalls()).toBe(1);
  });
});

// ===========================================================================
// Cell D — ERR-17-ARM CONTROL. GREEN before AND after. The initial forced turn
// is an ERR-17 `noncompliance` (plain_text, no payload); `attempts: 3`; the
// follow-up conforms (`{a:"ok"}`) and binds. This exercises the noncompliance
// arm (query-tool-loop.ts:620), which the fix does not touch.
// ===========================================================================

describe("bug 0352 (Cell D control) — the ERR-17 noncompliance arm is untouched: a noncompliant opener still opens repair and binds", () => {
  it("the plain-text noncompliance opener opens repair; the conforming `{a:\"ok\"}` follow-up binds", async () => {
    const decls = schemaDeclsOf("schema Typed { a: string }");
    const built = buildValidation("Typed", decls, payloadFollowUp({ a: "ok" }), 3);
    expect(
      ajv().compile(built.lowered).validate({ a: "ok" }).ok,
      "precondition unmet: the follow-up `{a:\"ok\"}` must CONFORM to the lowered schema",
    ).toBe(true);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "noncompliance", branch: { kind: "plain_text" }, raw_response: null }),
      config(),
      built.validation,
    );

    expect(
      outcome.kind,
      `the noncompliance arm must open repair and bind the conforming follow-up; observed ${describeOutcome(outcome)}`,
    ).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual({ a: "ok" });
    }
    expect(built.followUpCalls()).toBe(1);
  });
});

// ===========================================================================
// Cell E — WORKED-EXAMPLE / attempts:0 CONTROL. GREEN before AND after. The
// initial depth-7 breach with `respond_repair.attempts: 0`. Post-fix the depth
// arm routes into `runRespondRepair`, whose `none`/`0` early terminal
// (query-respond-repair.ts:211) returns `attempts: 0` carrying the OPENING
// depth issue; at HEAD the terminal fallback returns the SAME shape. Proves the
// fix does not over-fire when no repair budget is granted (bug doc §Fix
// constraint 3: the worked-example fixture stays byte-identical).
// ===========================================================================

describe("bug 0352 (Cell E control) — worked example: an initial depth breach with attempts:0 stays terminal attempts:0 with the depth issue", () => {
  it("the depth-7 opener at attempts:0 surfaces validation/attempts:0 with the maxDepth issue and NO follow-up", async () => {
    const decls = schemaDeclsOf("schema Other { x: string }");
    const built = buildValidation("ImportedElsewhere", decls, payloadFollowUp(RECOVERED), 0);
    expect(built.lowered).toEqual({});

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "respond", payload: DEPTH7 }),
      config(),
      built.validation,
    );

    expect(outcome.kind, `observed ${describeOutcome(outcome)}`).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(
      outcome.error.attempts,
      `no repair budget granted → attempts stays 0; observed attempts=${outcome.error.attempts}`,
    ).toBe(0);
    expect(
      isDepthIssue(outcome.error.validation_errors[0]),
      `the terminal issue is the canonical maxDepth breach; observed ${JSON.stringify(outcome.error.validation_errors)}`,
    ).toBe(true);
    expect(
      built.followUpCalls(),
      "attempts:0 issues NO follow-up (the fix must not over-fire)",
    ).toBe(0);
  });
});
