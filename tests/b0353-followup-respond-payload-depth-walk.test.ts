// Bug 0353 — respond-repair follow-up payloads are never depth-walked.
//
// `nextFollowUp` (src/runtime/typed-query-validation.ts) validates a
// respond-repair follow-up payload through `validateAgainst` (AJV compile +
// validate) on BOTH arms — the two-phase-restart payload arm
// (typed-query-validation.ts:271) and the legacy text arm (:295) — and never
// runs `depthWalk`. The ONLY depth walk on the typed-query response boundary
// is on the INITIAL forced turn (query-tool-loop.ts:663). So a depth-6+
// follow-up payload that conforms to the lowered schema BINDS as the typed
// query's `Ok` value (hard ceiling #4 bypassed), and under a closed root that
// rejects it AJV reports shape errors with NO canonical `maxDepth` issue —
// violating schema-subset.md:59 ("the depth walk re-runs on each follow-up's
// response") and CIO-3's walk-before-AJV ordering.
//
// WHY these cells drive the PRODUCTION seams: they exercise the real
// `parseThetaDocument` → `lowerQueryResponseSchema` → real `AjvSchemaValidator`
// → `buildTypedQueryValidation` → `runTypedQueryLoop` path (the
// tests/e2e-s3-typed-query-conformance.test.ts harness pattern), and the
// follow-up is delivered through the shipped `FollowUpRespondOutcome` payload
// arm (the two-phase-restart drive `driveRepairAttempt` feeds on a real repair
// attempt) — so the defect is witnessed at the exact seam the fix edits, not a
// mock of it. The initial turn opens repair either via an ERR-17 noncompliance
// report (B1, whose permissive `{}` root accepts every payload, so only a
// noncompliant opener reaches repair) or via an AJV-invalid initial payload
// (B2/B3/C1/C2).
//
// The Fix sketch (bug doc §Fix sketch) inserts `depthWalk(payload)` at the top
// of `validateAgainst` (typed-query-validation.ts:319), BEFORE AJV, returning
// the canonical single depth issue on breach — both follow-up arms inherit it.
// Post-fix, B1/B3 no longer bind, B2 leads with the `maxDepth` issue, and C2
// carries the single walk issue. C1 (depth exactly 5) must keep binding, so the
// walk does not over-fire at the boundary.
//
// Spec: docs/spec_topics/schema-subset.md:59 (the depth walk re-runs on each
// follow-up's response); depth-walk.ts (MAX_JSON_DEPTH=5,
// DEPTH_VIOLATION_MESSAGE, DEPTH_VIOLATION_SCHEMA_KEYWORD);
// query/query-failure-and-repair.md (QRY-11/QRY-22).

import { describe, expect, it } from "vitest";
import { runTypedQueryLoop } from "../src/runtime/query-tool-loop";
import {
  NOOP_CHECKPOINT,
  liveSignal,
  config,
  OpeningModel,
  schemaDeclsOf,
  ajv,
  payloadFollowUp,
  buildValidation,
  describeOutcome,
  isDepthIssue,
} from "./helpers/scripted-typed-query-harness";

// The depth-7 follow-up payload (bug doc §Symptom B1/B2): object nesting seven
// levels deep; `firstTooDeep` fast-fails at `/a/b/c/d/e` (level 6 > 5).
const DEPTH7 = { a: { b: { c: { d: { e: { f: 1 } } } } } };
// The depth-6 follow-up payload (bug doc §Symptom B3): `{a:[[[["x"]]]]}` —
// a nested-array member of a legal `array<array<array<array<string>>>>` type.
const DEPTH6 = { a: [[[["x"]]]] };
// The depth-5 control payload: `{a:[[["x"]]]}` — depth EXACTLY 5, at the cap.
const DEPTH5 = { a: [[["x"]]] };

// ===========================================================================
// B1 — permissive `{}` root: a depth-7 follow-up payload binds as the value.
// The imported schema NAME `ImportedElsewhere` is absent from the decls, so the
// real lowerer takes the bug-0028 unresolved-name arm and yields the permissive
// `{}` root (query-schema-lowering.ts). AJV accepts every payload against `{}`,
// so only an ERR-17 noncompliance opener reaches repair. The depth-7 follow-up
// then binds through the un-walked payload arm.
// ===========================================================================

describe("bug 0353 (B1) — permissive `{}` root: a depth-7 respond-repair follow-up payload must NOT bind (ceiling #4)", () => {
  it("the depth-7 follow-up under a permissive `{}` root surfaces a schema_validation maxDepth breach, not Ok(depth-7 doc)", async () => {
    const decls = schemaDeclsOf("schema Other { x: string }");
    const built = buildValidation("ImportedElsewhere", decls, payloadFollowUp(DEPTH7), 1);
    // Precondition, loud: the unresolved-name arm must yield the permissive
    // root, else this cell is not exercising ceiling #4 under `{}`.
    expect(
      built.lowered,
      "precondition unmet: the imported-name arm did not lower to the permissive `{}` root",
    ).toEqual({});

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      // ERR-17 plain-text noncompliance opens repair (a payload would bind
      // against `{}` and never reach a follow-up).
      new OpeningModel({ kind: "noncompliance", branch: { kind: "plain_text" }, raw_response: null }),
      config("inv-0353"),
      built.validation,
    );

    // The defect witness: at HEAD the depth-7 document binds as the value.
    expect(
      outcome.kind,
      `schema-subset.md:59: a depth-7 follow-up payload is walked and must NOT bind; observed ${describeOutcome(outcome, false)}`,
    ).not.toBe("value");
    // Post-fix end state (bug doc §Fix sketch): the breach is a schema_validation
    // failure whose issue is the canonical depth issue.
    expect(outcome.kind).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.cause).toBe("schema_validation");
    expect(
      isDepthIssue(outcome.error.validation_errors[0]),
      `the terminal issue is the canonical maxDepth breach; observed ${JSON.stringify(outcome.error.validation_errors)}`,
    ).toBe(true);
    expect(built.followUpCalls()).toBe(1);
  });
});

// ===========================================================================
// B3 — closed root, ordinary declaration: a depth-6 follow-up payload binds.
// `schema Deep { a: array<array<array<array<string>>>> }` is a legal type whose
// conforming set contains depth-6 members. An AJV-invalid opener (`{a:42}`,
// depth 2) opens repair; the depth-6 follow-up conforms to the lowered schema
// and binds through the un-walked payload arm — no permissive root required.
// ===========================================================================

describe("bug 0353 (B3) — closed nested-array root: a depth-6 respond-repair follow-up payload must NOT bind (ceiling #4)", () => {
  it("the depth-6 `{a:[[[[\"x\"]]]]}` follow-up surfaces a schema_validation maxDepth breach, not Ok(depth-6 doc)", async () => {
    const decls = schemaDeclsOf("schema Deep { a: array<array<array<array<string>>>> }");
    const built = buildValidation("Deep", decls, payloadFollowUp(DEPTH6), 1);
    // Loud fixture guards: the opener must be AJV-rejected (to open repair) and
    // the follow-up must conform to the lowered schema (to bind at HEAD).
    const compiled = ajv().compile(built.lowered);
    expect(
      compiled.validate({ a: 42 }).ok,
      "precondition unmet: the opener `{a:42}` must FAIL AJV so repair opens",
    ).toBe(false);
    expect(
      compiled.validate(DEPTH6).ok,
      "precondition unmet: the depth-6 follow-up must CONFORM to the lowered schema",
    ).toBe(true);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "respond", payload: { a: 42 } }),
      config("inv-0353"),
      built.validation,
    );

    // The defect witness: at HEAD the depth-6 document binds as the value.
    expect(
      outcome.kind,
      `schema-subset.md:59: a depth-6 follow-up payload is walked and must NOT bind; observed ${describeOutcome(outcome, false)}`,
    ).not.toBe("value");
    expect(outcome.kind).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.cause).toBe("schema_validation");
    expect(
      isDepthIssue(outcome.error.validation_errors[0]),
      `the terminal issue is the canonical maxDepth breach; observed ${JSON.stringify(outcome.error.validation_errors)}`,
    ).toBe(true);
    expect(built.followUpCalls()).toBe(1);
  });
});

// ===========================================================================
// B2 — closed root that REJECTS the document: the terminal error must LEAD with
// the depth issue. `schema Nest { deeply: string }`, AJV opener `{deeply:42}`,
// a depth-7 follow-up. AJV rejects the follow-up on shape (additionalProperties
// / required); post-fix CIO-3's walk-before-AJV ordering makes the canonical
// `maxDepth` issue lead the terminal `validation_errors` instead.
// ===========================================================================

describe("bug 0353 (B2) — rejecting closed root: the follow-up breach must LEAD with the canonical maxDepth issue (CIO-3)", () => {
  it("the terminal validation_errors leads with the maxDepth issue, not additionalProperties/required", async () => {
    const decls = schemaDeclsOf("schema Nest { deeply: string }");
    const built = buildValidation("Nest", decls, payloadFollowUp(DEPTH7), 1);
    expect(
      ajv().compile(built.lowered).validate({ deeply: 42 }).ok,
      "precondition unmet: the opener `{deeply:42}` must FAIL AJV so repair opens",
    ).toBe(false);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "respond", payload: { deeply: 42 } }),
      config("inv-0353"),
      built.validation,
    );

    expect(outcome.kind, `observed ${describeOutcome(outcome, false)}`).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.attempts, "one follow-up slot debited").toBe(1);
    // Walk-before-AJV: the LEADING issue is the canonical depth breach — at
    // HEAD it leads with AJV's `additionalProperties`, with no maxDepth issue
    // anywhere in the array.
    expect(
      isDepthIssue(outcome.error.validation_errors[0]),
      `CIO-3 walk-before-AJV: validation_errors must LEAD with the maxDepth issue; observed ${JSON.stringify(outcome.error.validation_errors)}`,
    ).toBe(true);
  });
});

// ===========================================================================
// Control C1 — a depth-5 follow-up binds. `schema D5 { a:
// array<array<array<string>>> }`, AJV opener `{a:42}`, a depth-EXACTLY-5
// follow-up `{a:[[["x"]]]}` that conforms. It must BIND both before and after
// the fix — proving the inserted walk does not over-fire at the depth-5
// boundary. GREEN at HEAD, stays GREEN.
// ===========================================================================

describe("bug 0353 (C1 control) — a depth-5 respond-repair follow-up still binds (the walk does not over-fire at the cap)", () => {
  it("the depth-5 `{a:[[[\"x\"]]]}` follow-up binds as the corrected value", async () => {
    const decls = schemaDeclsOf("schema D5 { a: array<array<array<string>>> }");
    const built = buildValidation("D5", decls, payloadFollowUp(DEPTH5), 1);
    const compiled = ajv().compile(built.lowered);
    expect(
      compiled.validate({ a: 42 }).ok,
      "precondition unmet: the opener `{a:42}` must FAIL AJV so repair opens",
    ).toBe(false);
    expect(
      compiled.validate(DEPTH5).ok,
      "precondition unmet: the depth-5 follow-up must CONFORM to the lowered schema",
    ).toBe(true);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "respond", payload: { a: 42 } }),
      config("inv-0353"),
      built.validation,
    );

    expect(
      outcome.kind,
      `a depth-5 (at-cap) follow-up must bind; observed ${describeOutcome(outcome, false)}`,
    ).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual(DEPTH5);
    }
    expect(built.followUpCalls()).toBe(1);
  });
});

// ===========================================================================
// Control C2 — CIO-3 single-issue ordering observable. A depth-6 follow-up
// under `schema Nest { deeply: string }`, which AJV would ALSO reject on shape.
// Post-fix the walk's SINGLE maxDepth issue wins (the walk short-circuits before
// AJV), so the terminal `validation_errors` is exactly `[maxDepth]` — no AJV
// issues present. At HEAD AJV runs unshielded and the array carries the shape
// issues with no maxDepth issue at all.
// ===========================================================================

describe("bug 0353 (C2 control) — CIO-3 ordering: a depth-6 follow-up under an AJV-rejecting root carries the SINGLE walk issue", () => {
  it("the terminal validation_errors is exactly the single canonical maxDepth issue (no AJV issues)", async () => {
    const decls = schemaDeclsOf("schema Nest { deeply: string }");
    const built = buildValidation("Nest", decls, payloadFollowUp(DEPTH6), 1);
    // Loud guard: AJV must ALSO reject the depth-6 follow-up on shape, so the
    // single-issue form proves the walk short-circuited AJV (not that AJV
    // happened to accept it).
    expect(
      ajv().compile(built.lowered).validate(DEPTH6).ok,
      "precondition unmet: AJV must also reject the depth-6 follow-up (shape mismatch)",
    ).toBe(false);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new OpeningModel({ kind: "respond", payload: { deeply: 42 } }),
      config("inv-0353"),
      built.validation,
    );

    expect(outcome.kind, `observed ${describeOutcome(outcome, false)}`).toBe("validation");
    if (outcome.kind !== "validation") return;
    // Walk-before-AJV, single-issue form: the walk fast-fails and AJV never
    // runs on the depth-6 document, so exactly ONE issue — the maxDepth breach —
    // is carried. At HEAD the array holds AJV's shape issues and no maxDepth.
    expect(
      outcome.error.validation_errors.length,
      `CIO-3: the walk short-circuits AJV, so a single issue is carried; observed ${JSON.stringify(outcome.error.validation_errors)}`,
    ).toBe(1);
    expect(
      isDepthIssue(outcome.error.validation_errors[0]),
      `the single issue is the canonical maxDepth breach; observed ${JSON.stringify(outcome.error.validation_errors)}`,
    ).toBe(true);
  });
});
