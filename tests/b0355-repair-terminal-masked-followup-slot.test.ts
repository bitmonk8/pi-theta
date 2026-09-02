// Bug 0355 — the terminal repair-validation `RuntimeEvent`'s `masked` field is
// computed from the PARENT query's slot-count-at-dispatch, not from the
// FOLLOW-UP's own fresh `tool_loop` budget.
//
// `slotCountAtDispatch` is captured ONCE, at the parent's forced-respond
// dispatch (query-tool-loop.ts:582), and reused at every repair-terminal event
// build — including the AJV-opened repair terminal
// (query-tool-loop.ts:763: `buildValidationEvent(config, repair.error,
// slotCountAtDispatch)`). `buildValidationEvent` (query-tool-loop.ts:790) feeds
// that parent scalar to `computeMasked` as `toolLoopSlotCount`
// (query-tool-loop.ts:800). When the parent's free phase exhausted
// (`slotCountAtDispatch == max_rounds`) and a respond-repair follow-up ran
// (`error.attempts >= 1`) and then failed validation, the surfaced failure
// originated on the FOLLOW-UP's turn, whose own slot count is fresh (0 when the
// follow-up ran zero free-phase rounds). PIC-1 (d) requires the predicate to be
// evaluated against that follow-up's own slot count, so `masked` must be
// omitted — but at HEAD the event carries `masked: ["ceiling#2"]`.
//
// WHY these cells drive the PRODUCTION seams: they run the real
// `parseThetaDocument` → `lowerQueryResponseSchema` → real `AjvSchemaValidator`
// → `buildTypedQueryValidation` → `runTypedQueryLoop` path (the 0353 sibling's
// harness), and combine it with a `ScriptedModel`-style parent driver (the
// query-tool-loop.test.ts substrate) so the parent's free phase actually
// exhausts to `slotCount == max_rounds` and dispatches the forced respond turn.
// The follow-up rides the shipped `FollowUpRespondOutcome` payload arm through
// the injected `driveFollowUp`. So the defect is witnessed at the exact event
// build the Phase-2 fix edits, not a mock of it.
//
// Spec: docs/spec_topics/pi-integration-contract/runtime-event-channel.md:114
// (PIC-1 (d): "the predicate is evaluated against the follow-up's own slot
// count, not the parent query's"); docs/spec_topics/query/query-tool-loop.md
// (worked example + follow-up re-evaluation sentence). Bug doc:
// docs/bugs/0355-repair-terminal-masked-parent-slot-count.md.
//
// The under-fire witness (Cell 5) — a follow-up that itself ran `max_rounds`
// free-phase rounds of its OWN and then failed validation — must carry
// `["ceiling#2"]`. It is a POST-FIX-ONLY witness: it reads the widened repair
// seam's `slotCountAtDispatch` field, which does not exist at HEAD, so it cannot
// red before the seam widens — the fix both enables the field and makes this
// direction reachable (bug doc §Fix constraint 4).

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
import { jsonDepth } from "../src/runtime/depth-walk";
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
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Checkpoint } from "../src/seams/checkpoint";

// --- Substrate (0353's real-seam harness fused with the query-tool-loop
//     scripted parent driver) --------------------------------------------------

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function config(maxRounds: number): QueryToolLoopConfig {
  return {
    maxRounds,
    querySite: { file: "deep.theta", line: 1, column: 1 },
    thetaSlashName: "/deep",
    invocationId: "inv-0355",
    occurredAt: 0,
  };
}

const toolUse = (...ids: string[]): FreePhaseTurn => ({
  kind: "tool_use",
  batch: ids.map((toolUseId) => ({ toolName: "search", toolUseId })),
});
const textTurn = (text: string): FreePhaseTurn => ({ kind: "text", text });
const respond = (payload: unknown): ForcedRespondTurn => ({ kind: "respond", payload });

/**
 * A scripted parent driver (mirrors query-tool-loop.test.ts's `ScriptedModel`):
 * the ordered free-phase `tool_use` rounds drive `slotCount` up to `max_rounds`
 * so CIO-4's `max_rounds`-final branch dispatches the forced respond turn at
 * `slotCountAtDispatch == max_rounds` — the parent-exhausted shape the defect
 * needs. The forced respond turn opens repair (an AJV-invalid payload) or trips
 * the inline depth arm (a depth-6 payload).
 */
class ScriptedParent implements QueryModelDriver {
  constructor(
    private readonly freeTurns: readonly FreePhaseTurn[],
    private readonly forced: ForcedRespondTurn,
  ) {}

  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    const turn = this.freeTurns[round];
    if (turn === undefined) {
      // Loud, not a silent hang: a correct loop never reads past the scripted
      // free phase (it breaks at the `max_rounds`-final branch first).
      throw new Error(`no scripted free-phase turn for round ${round}`);
    }
    return Promise.resolve(turn);
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve(this.forced);
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
    path: "deep.theta",
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
  // No slot-count field is set: its absence models the follow-up running zero
  // free-phase rounds of its own (fresh budget, slot count 0 — the
  // reproduction's shape).
  return { kind: "respond_outcome", turn: { kind: "payload", payload } };
}

/**
 * A `FollowUpRespondOutcome` whose own restarted free phase ran `slots`
 * rounds before its forced respond dispatch (the under-fire shape): the
 * follow-up's OWN fresh `tool_loop` budget is `slots`.
 */
function payloadFollowUpWithSlots(payload: unknown, slots: number): FollowUpRespondOutcome {
  return { kind: "respond_outcome", slotCountAtDispatch: slots, turn: { kind: "payload", payload } };
}

/**
 * Build the production `TypedQuerySchemaValidation` for `annotation` against
 * `decls`, driving at most `attempts` respond-repair follow-ups that each return
 * `follow` through the two-phase-restart payload arm. `followUpMaxRounds` is the
 * follow-up's own fresh `tool_loop` budget (irrelevant to the parent event's
 * `masked`, which is the whole point of the bug).
 */
function buildValidation(
  annotation: string,
  decls: readonly SchemaDecl[],
  follow: FollowUpRespondOutcome,
  attempts: number,
  followUpMaxRounds: number,
): {
  readonly validation: TypedQuerySchemaValidation;
  readonly lowered: LoweredSchema;
  followUpCalls(): number;
} {
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
    attempts,
    maxRounds: followUpMaxRounds,
    driveFollowUp: () => {
      state.calls += 1;
      return Promise.resolve(follow);
    },
  });
  return { validation, lowered, followUpCalls: () => state.calls };
}

// The fixture schema (bug doc §Reproduction): a legal nested-array type whose
// `a` member must be `array<array<array<array<string>>>>`.
const DEEP_SCHEMA = "schema Deep { a: array<array<array<array<string>>>> }";
// The AJV-invalid, depth-OK opener/follow-up payloads: `a` is a scalar, not an
// array, so AJV rejects both; each is depth 2, well under the depth-5 cap, so
// the depth arm never fires and the AJV repair leg is the one exercised.
const OPENER_INVALID = { a: 42 };
const FOLLOWUP_INVALID = { a: "still wrong" };
// The depth-6 payload `{a:[[[["x"]]]]}` for the initial-co-fire control: a
// nested-array member of the SAME `Deep` type, one level past the depth-5 cap.
const DEPTH6 = { a: [[[["x"]]]] };

// ===========================================================================
// CELL 1 — REPRODUCTION (RED at HEAD, GREEN post-fix).
//
// Parent free phase exhausts (two `tool_use` rounds → slot 2 == max_rounds 2 →
// forced respond dispatched at slotCountAtDispatch 2). The forced respond
// `{a:42}` is AJV-invalid, so repair opens; the single follow-up `{a:"still
// wrong"}` is also AJV-invalid, so repair exhausts with a terminal validation
// error whose `attempts == 1`. The surfaced failure originated on that
// follow-up, whose own slot count is 0 (< max_rounds 2), so PIC-1 (d) requires
// `masked` OMITTED. At HEAD the event reuses the parent's `slotCountAtDispatch`
// (2) and carries `masked: ["ceiling#2"]`.
// ===========================================================================

describe("bug 0355 — repair-terminal `masked` must read the FOLLOW-UP's own slot count (PIC-1 (d))", () => {
  it("bug 0355: an AJV-opened repair terminal (attempts 1) on a parent-exhausted query omits `masked` — the follow-up's own slot count is 0", async () => {
    const decls = schemaDeclsOf(DEEP_SCHEMA);
    const built = buildValidation("Deep", decls, payloadFollowUp(FOLLOWUP_INVALID), 1, 2);
    // Loud fixture guards: the opener and the follow-up must BOTH fail AJV
    // (depth-OK) so repair opens and then exhausts on a validation failure.
    const compiled = ajv().compile(built.lowered);
    expect(
      compiled.validate(OPENER_INVALID).ok,
      "precondition unmet: the opener `{a:42}` must FAIL AJV so repair opens",
    ).toBe(false);
    expect(
      compiled.validate(FOLLOWUP_INVALID).ok,
      "precondition unmet: the follow-up `{a:\"still wrong\"}` must FAIL AJV so repair exhausts",
    ).toBe(false);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      // Two free-phase rounds drive slot count to 2 == max_rounds, so the forced
      // respond turn dispatches at slotCountAtDispatch 2 (the parent-exhausted
      // shape).
      new ScriptedParent([toolUse("a"), toolUse("b")], respond(OPENER_INVALID)),
      config(2),
      built.validation,
    );

    // The terminal is the follow-up's exhausted validation error.
    expect(outcome.kind, describeOutcome(outcome)).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.attempts, "one follow-up ran and is the surfaced failure's origin").toBe(1);
    expect(built.followUpCalls(), "the single repair follow-up was driven once").toBe(1);

    // THE RED ASSERTION (PIC-1 (d),
    // runtime-event-channel.md:114): the surfaced failure originated on a
    // follow-up whose own slot count is 0 (< max_rounds 2), so `masked` MUST be
    // omitted. At HEAD the event reuses the parent's slotCountAtDispatch (2 ==
    // max_rounds) and carries `masked: ["ceiling#2"]`.
    expect(
      "masked" in outcome.event,
      `PIC-1 (d): the repair-terminal failure originated on a follow-up whose own slot count is 0 (< max_rounds 2), so masked must be omitted; observed ${JSON.stringify(outcome.event)}`,
    ).toBe(false);
  });
});

// ===========================================================================
// CELL 2 — WORKED-EXAMPLE CONTROL (GREEN at HEAD and post-fix).
//
// The initial-payload co-fire (bug doc §Non-goals): the parent's OWN forced
// respond turn carries a depth-6 payload with NO schema-validation collaborator,
// so the inline depth arm (query-tool-loop.ts:690's no-machinery sibling) fires
// on the PARENT's turn at slotCountAtDispatch 2 == max_rounds 2. `masked ==
// ["ceiling#2"]` is exactly the spec's worked example — a genuine parent co-fire
// the fix must leave untouched.
// ===========================================================================

describe("bug 0355 (control) — the initial-payload co-fire keeps the parent scalar (worked example, untouched by the fix)", () => {
  it("bug 0355: a parent-exhausted depth-6 forced respond turn (no repair) still carries masked ['ceiling#2']", async () => {
    // Guard: the payload really is depth-6 (> the depth-5 cap), so ceiling #4
    // fires on the parent's own forced respond turn.
    expect(jsonDepth(DEPTH6), "precondition unmet: the control payload must be depth-6").toBe(6);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      // Two free-phase rounds → slot 2 == max_rounds 2; the depth-6 payload
      // trips the inline depth arm on the parent's own forced respond turn.
      new ScriptedParent([toolUse("a"), toolUse("b")], respond(DEPTH6)),
      config(2),
      // No schema-validation collaborator: the inline depth arm surfaces with
      // the parent scalar directly (attempts 0, no follow-up).
    );

    expect(outcome.kind, describeOutcome(outcome)).toBe("validation");
    if (outcome.kind !== "validation") return;
    // The failure genuinely originated on the parent's forced respond turn
    // (slotCountAtDispatch 2 == max_rounds 2), so the co-fire is real.
    expect(
      outcome.event.masked,
      `the parent's own forced respond turn at slot 2 == max_rounds 2 co-fires ceiling #2; observed ${JSON.stringify(outcome.event)}`,
    ).toEqual(["ceiling#2"]);
  });
});

// ===========================================================================
// CELL 3 — max_rounds:0 GUARD CONTROL (GREEN at HEAD and post-fix).
//
// A typed query at parent `max_rounds: 0` dispatches the forced respond turn as
// its only turn (slotCountAtDispatch 0). Repair opens on the AJV-invalid
// `{a:42}`, exhausts on the follow-up `{a:"still wrong"}` (attempts 1). The
// `computeMasked` `maxRounds > 0` guard omits `masked` regardless of which slot
// count is read, so this stays GREEN both before and after the fix.
// ===========================================================================

describe("bug 0355 (control) — the max_rounds:0 guard omits masked regardless of the sourced slot count", () => {
  it("bug 0355: a max_rounds:0 repair terminal (attempts 1) omits masked (the maxRounds>0 guard)", async () => {
    const decls = schemaDeclsOf(DEEP_SCHEMA);
    const built = buildValidation("Deep", decls, payloadFollowUp(FOLLOWUP_INVALID), 1, 0);
    const compiled = ajv().compile(built.lowered);
    expect(
      compiled.validate(OPENER_INVALID).ok,
      "precondition unmet: the opener `{a:42}` must FAIL AJV so repair opens",
    ).toBe(false);
    expect(
      compiled.validate(FOLLOWUP_INVALID).ok,
      "precondition unmet: the follow-up `{a:\"still wrong\"}` must FAIL AJV so repair exhausts",
    ).toBe(false);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      // max_rounds 0 → the free phase breaks immediately (slot 0 == 0) and the
      // forced respond turn is the only turn; no free-phase turn is read.
      new ScriptedParent([], respond(OPENER_INVALID)),
      config(0),
      built.validation,
    );

    expect(outcome.kind, describeOutcome(outcome)).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.attempts, "one follow-up ran").toBe(1);
    expect(built.followUpCalls(), "the single repair follow-up was driven once").toBe(1);
    expect(
      "masked" in outcome.event,
      `the maxRounds>0 guard omits masked at max_rounds:0; observed ${JSON.stringify(outcome.event)}`,
    ).toBe(false);
  });
});

// ===========================================================================
// CELL 4 — attempts:0 TERMINAL KEEPS THE PARENT SCALAR (GREEN both).
//
// bug doc §Fix 2a: only terminals whose `error.attempts >= 1` change sourcing.
// The `none`/`0` early terminal (query-respond-repair.ts: `attempts <= 0`)
// surfaces the PARENT's own opening failure with NO follow-up — `error.attempts
// == 0` — so the parent's slotCountAtDispatch (2 == max_rounds 2) is the
// correct scalar and `masked == ["ceiling#2"]` is conformant. Stays
// byte-identical post-fix.
// ===========================================================================

describe("bug 0355 (control) — the attempts:0 early terminal correctly keeps the parent's slotCountAtDispatch", () => {
  it("bug 0355: a parent-exhausted attempts:0 terminal (no follow-up) keeps masked ['ceiling#2']", async () => {
    const decls = schemaDeclsOf(DEEP_SCHEMA);
    // attempts 0 → runRespondRepairLoop returns the early `none`/`0` terminal;
    // the follow-up is never driven.
    const built = buildValidation("Deep", decls, payloadFollowUp(FOLLOWUP_INVALID), 0, 2);
    expect(
      ajv().compile(built.lowered).validate(OPENER_INVALID).ok,
      "precondition unmet: the opener `{a:42}` must FAIL AJV so repair opens",
    ).toBe(false);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new ScriptedParent([toolUse("a"), toolUse("b")], respond(OPENER_INVALID)),
      config(2),
      built.validation,
    );

    expect(outcome.kind, describeOutcome(outcome)).toBe("validation");
    if (outcome.kind !== "validation") return;
    // attempts 0: no follow-up ran, the surfaced failure IS the parent's own,
    // and the parent scalar is correct.
    expect(outcome.error.attempts, "the none/0 early terminal ran no follow-up").toBe(0);
    expect(built.followUpCalls(), "no follow-up was driven at attempts:0").toBe(0);
    expect(
      outcome.event.masked,
      `the attempts:0 terminal correctly keeps the parent slotCountAtDispatch 2 == max_rounds 2; observed ${JSON.stringify(outcome.event)}`,
    ).toEqual(["ceiling#2"]);
  });
});

// ===========================================================================
// CELL 5 — UNDER-FIRE WITNESS (post-fix only; GREEN after the fix, unreachable
// at HEAD).
//
// bug doc §Fix constraint 4 (the symmetric direction): a respond-repair
// follow-up that ITSELF ran `max_rounds` free-phase rounds before its own
// forced respond turn, and then failed validation, MUST carry `["ceiling#2"]` —
// the follow-up's own fresh slot count reached `max_rounds`. This is impossible
// at HEAD: no follow-up slot count exists to read until the seam widens, so the
// event could never have been masked on the follow-up's own budget. The fix
// threads `slotCountAtDispatch` through `FollowUpRespondOutcome`, so a follow-up
// carrying `slotCountAtDispatch == max_rounds` co-fires ceiling #2 on ITS turn.
//
// The discriminator is deliberately sharp: the PARENT runs ONE free-phase round
// (slotCountAtDispatch 1, != max_rounds 2), so at HEAD — and under the
// pre-fix parent-scalar sourcing — the event would OMIT masked. The masked
// value can therefore ONLY come from the threaded follow-up scalar (2 ==
// max_rounds 2). `computeMasked`'s `maxRounds` guard reads config.maxRounds, so
// the parent and follow-up share the budget (2) for the follow-up's slot count
// to reach it.
// ===========================================================================

describe("bug 0355 (under-fire) — a follow-up that exhausts ITS OWN fresh budget then fails validation carries masked ['ceiling#2']", () => {
  it("bug 0355: a follow-up whose fresh budget reached max_rounds co-fires ceiling #2 on ITS turn, even when the parent did not exhaust", async () => {
    const decls = schemaDeclsOf(DEEP_SCHEMA);
    // The follow-up's OWN fresh budget reached max_rounds (2): its restarted
    // free phase exhausted before the forced respond turn.
    const built = buildValidation(
      "Deep",
      decls,
      payloadFollowUpWithSlots(FOLLOWUP_INVALID, 2),
      1,
      2,
    );
    const compiled = ajv().compile(built.lowered);
    expect(
      compiled.validate(OPENER_INVALID).ok,
      "precondition unmet: the opener `{a:42}` must FAIL AJV so repair opens",
    ).toBe(false);
    expect(
      compiled.validate(FOLLOWUP_INVALID).ok,
      "precondition unmet: the follow-up `{a:\"still wrong\"}` must FAIL AJV so repair exhausts",
    ).toBe(false);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      // One free-phase tool round then a terminating text turn → parent slot 1
      // (< max_rounds 2), then the forced respond turn dispatches at slot 1. The
      // parent does NOT co-fire (slot 1 != 2); only the follow-up's own budget
      // (2 == 2) does — so the masked value can come ONLY from the threaded
      // follow-up scalar.
      new ScriptedParent([toolUse("a"), textTurn("done")], respond(OPENER_INVALID)),
      config(2),
      built.validation,
    );

    expect(outcome.kind, describeOutcome(outcome)).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.attempts, "one follow-up ran and is the surfaced failure's origin").toBe(1);
    expect(
      outcome.event.masked,
      `the follow-up's own fresh budget reached max_rounds (2), co-firing ceiling #2 on ITS turn (parent slot 1 != 2 would omit it); observed ${JSON.stringify(outcome.event)}`,
    ).toEqual(["ceiling#2"]);
  });
});

/** Human-readable outcome digest for a witness's failure message. */
function describeOutcome(outcome: TypedQueryOutcome): string {
  if (outcome.kind === "value") {
    return `kind=value value=${JSON.stringify(outcome.value)}`;
  }
  if (outcome.kind === "validation") {
    return `kind=validation event=${JSON.stringify(outcome.event)}`;
  }
  return `kind=${outcome.kind}`;
}
