// Bug 0010 — `runTypedQueryLoop` routes the ADDITIVE `ForcedRespondTurn`
// noncompliance arm (regression pins).
//
// docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md seam law:
// the `QueryModelDriver` seam SHAPE stays as-is and `ForcedRespondTurn` gained
// ONE ADDITIVE union arm
//   `{ kind: "noncompliance"; branch: ForcedRespondBranch; raw_response: string | null }`
// — the driver-level report that the off-session forced respond turn was
// ERR-17 non-compliant (a normal stop with the wrong `ToolCall`, or plain text
// and no `ToolCall` at all). `runTypedQueryLoop` MUST route that arm into the
// EXISTING respond-repair machinery: `schemaValidation.runRespondRepair({kind:
// "noncompliance", branch, raw_response})` (`ValidationFailure` already carries
// the `noncompliance` arm — src/runtime/query-respond-repair.ts), surfacing the
// repair outcome + the operator-facing `RuntimeEvent`; when `schemaValidation`
// is ABSENT the loop surfaces the ERR-17 terminal `ValidationError` directly
// (attempts 0, the fixed `NONCOMPLIANCE_TERMINAL_MESSAGE`, the synthesised
// ERR-17 issue, `raw_response` carried) with the usual `RuntimeEvent`.
//
// WHY these pins exist (pre-fix failure mode): before the arm landed, a
// pre-fix loop treated an unknown turn kind as a payload-less respond — it
// depth-walked `undefined`, AJV-validated `undefined`, and misrouted into
// repair as `schema_validation` (or, with no collaborator, fabricated
// `{kind: "value", value: undefined}` — the unvalidated-binding failure mode
// the additive arm exists to prevent).
//
// This suite deliberately does NOT touch tests/query-tool-loop.test.ts (a
// frozen scripted-driver suite per the bug-0010 brief); it copies that
// harness's style (RecordingCheckpoint / scripted `QueryModelDriver` /
// `config()`), driving `runTypedQueryLoop` directly.
//
// Spec: errors-and-results/queryerror-variants.md (ERR-17 synthesised issue +
// terminal shape), query/query-failure-and-repair.md (QRY-11 respond-repair
// routing), query/query-tool-loop.md (QRY-14 forced respond turn).

import { describe, expect, it } from "vitest";
import type {
  Checkpoint,
  CheckpointKind,
  CheckpointSite,
} from "../src/seams/checkpoint";
import {
  runTypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type TypedQuerySchemaValidation,
  type TypedQueryValidationResult,
} from "../src/runtime/query-tool-loop";
import type { LoweredSchema } from "../src/seams/schema-validator";
import type { ValidationError, ValidationIssue } from "../src/runtime/query-error";
import type {
  RespondRepairOutcome,
  ValidationFailure,
} from "../src/runtime/query-respond-repair";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";

const QUERY_SITE: CheckpointSite = { file: "probe.theta", line: 3, column: 5 };

function config(maxRounds: number): QueryToolLoopConfig {
  return {
    maxRounds,
    querySite: QUERY_SITE,
    thetaSlashName: "/noncompliance-probe",
    invocationId: "00000000-0000-4000-8000-000000000010",
    occurredAt: 1_700_000_000_000,
  };
}

/** A never-aborted signal (the non-cancellation arms). */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/** A checkpoint recording the ordered kinds (the cka-47 pre-dispatch site). */
class RecordingCheckpoint implements Checkpoint {
  readonly kinds: CheckpointKind[] = [];

  before(kind: CheckpointKind): Promise<void> {
    this.kinds.push(kind);
    return Promise.resolve();
  }
}

/** The wrong-tool branch the driver reports (ERR-17). */
const WRONG_TOOL_BRANCH = {
  kind: "wrong_tool",
  providerToolName: "grep",
  respondToolName: "__theta_respond_x",
} as const;

/** The additive `ForcedRespondTurn` noncompliance arm under test (bug 0010). */
const NONCOMPLIANCE_TURN: ForcedRespondTurn = {
  kind: "noncompliance",
  branch: WRONG_TOOL_BRANCH,
  raw_response: null,
};

/**
 * A scripted `QueryModelDriver` whose free phase terminates at once and whose
 * forced respond turn reports the ERR-17 noncompliance arm (the
 * tests/query-tool-loop.test.ts ScriptedModel style, narrowed to this suite).
 */
class NoncomplianceModel implements QueryModelDriver {
  freePhaseCalls = 0;
  forcedRespondCalls = 0;

  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    this.freePhaseCalls += 1;
    return Promise.resolve({ kind: "text", text: "free phase done" });
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    this.forcedRespondCalls += 1;
    return Promise.resolve(NONCOMPLIANCE_TURN);
  }
}

/** The representative lowered schema the collaborator hands the loop. */
const LOWERED: LoweredSchema = {
  type: "object",
  properties: { score: { type: "number" } },
  required: ["score"],
  additionalProperties: false,
} as LoweredSchema;

/** The ERR-17 synthesised wrong_tool issue for `WRONG_TOOL_BRANCH`. */
const WRONG_TOOL_ISSUE: ValidationIssue = {
  path: "",
  message:
    "model invoked tool 'grep' instead of the forced respond tool '__theta_respond_x'",
  schema_keyword: "required",
};

/** The terminal ERR-17 `ValidationError` the scripted repair returns. */
const TERMINAL_ERROR: ValidationError = {
  kind: "validation",
  cause: "schema_validation",
  // The fixed ERR-17 terminal literal (queryerror-variants.md; exported as
  // NONCOMPLIANCE_TERMINAL_MESSAGE by src/runtime/query-respond-repair.ts).
  message: "model did not call the forced respond tool",
  attempts: 0,
  validation_errors: [WRONG_TOOL_ISSUE],
  raw_response: null,
};

/**
 * A recording `TypedQuerySchemaValidation` double: `runRespondRepair` records
 * the `ValidationFailure` it received and returns the scripted terminal
 * outcome; `validate` records its calls (a noncompliant turn carries NO
 * payload, so the routed loop must never AJV-validate for it) and — were it
 * ever wrongly called, as the pre-fix loop did — reports a failure so a
 * regressed misroute stays visible in the recorded failure's kind.
 */
function recordingValidation(): {
  readonly validation: TypedQuerySchemaValidation;
  readonly received: ValidationFailure[];
  readonly validateCalls: () => number;
} {
  const received: ValidationFailure[] = [];
  let validateCalls = 0;
  const validation: TypedQuerySchemaValidation = {
    resolveDeclaredSchema: (): unknown => "Verdict",
    lower: (): LoweredSchema => LOWERED,
    convey: (): void => {},
    validate: (): TypedQueryValidationResult => {
      validateCalls += 1;
      return {
        ok: false,
        issues: [
          { path: "", message: "must have required property 'score'", schema_keyword: "required" },
        ],
        raw_response: null,
      };
    },
    runRespondRepair: (initial: ValidationFailure): Promise<RespondRepairOutcome> => {
      received.push(initial);
      return Promise.resolve({ kind: "validation", error: TERMINAL_ERROR });
    },
  };
  return { validation, received, validateCalls: () => validateCalls };
}

describe("bug 0010 (regression pins) — runTypedQueryLoop routes the additive noncompliance arm (ERR-17, QRY-11)", () => {
  it("routes {kind:'noncompliance'} into schemaValidation.runRespondRepair AS a noncompliance ValidationFailure and surfaces the repair's validation outcome + RuntimeEvent", async () => {
    const { validation, received, validateCalls } = recordingValidation();
    const model = new NoncomplianceModel();

    const outcome = await runTypedQueryLoop(
      new RecordingCheckpoint(),
      liveSignal(),
      model,
      config(2),
      validation,
    );

    expect(model.forcedRespondCalls, "the forced respond turn was dispatched once").toBe(1);
    expect(
      received.length,
      "the noncompliant respond turn opens respond-repair exactly once (QRY-11)",
    ).toBe(1);
    const failure = received[0]!;
    // THE bug-0010 pin: the driver's noncompliance report reaches repair AS
    // the `ValidationFailure` noncompliance arm — the pre-fix loop treated the
    // unknown turn kind as a payload-less respond, AJV-validated `undefined`,
    // and misrouted the failure into repair as `schema_validation`.
    expect(
      failure.kind,
      "the opening ValidationFailure carries kind 'noncompliance' (the ERR-17 branch, " +
        "never re-cast through the AJV schema_validation channel — bug 0010 seam law)",
    ).toBe("noncompliance");
    expect(
      (failure as { readonly branch?: unknown }).branch,
      "the ForcedRespondBranch rides through verbatim (wrong_tool: provider name + respond name)",
    ).toEqual(WRONG_TOOL_BRANCH);
    expect(
      failure.raw_response,
      "the turn carried no assistant text — raw_response null rides through",
    ).toBeNull();
    expect(
      validateCalls(),
      "a noncompliant forced respond turn carries NO payload — the loop must never " +
        "AJV-validate for it (the pre-fix loop validated `undefined` once)",
    ).toBe(0);

    // The repair outcome surfaces as the loop's validation outcome with the
    // operator-facing RuntimeEvent (PIC-1 / QRY-22 event shape).
    expect(outcome.kind, "the terminal repair outcome surfaces as kind 'validation'").toBe(
      "validation",
    );
    if (outcome.kind !== "validation") return;
    expect(outcome.error, "the repair loop's terminal ValidationError surfaces verbatim").toBe(
      TERMINAL_ERROR,
    );
    expect(outcome.event.kind, "the RuntimeEvent rides the validation kind").toBe("validation");
    expect(
      outcome.event.message,
      "the RuntimeEvent carries the terminal error's message",
    ).toBe(TERMINAL_ERROR.message);
    expect(outcome.event.attempts, "the RuntimeEvent carries the terminal attempts (0)").toBe(0);
    expect(
      outcome.forcedRespond.dispatched,
      "the forced respond dispatch record is kept on the outcome",
    ).toBe(true);
  });

  it("schemaValidation ABSENT: the loop surfaces the ERR-17 terminal ValidationError directly (attempts 0, NONCOMPLIANCE_TERMINAL_MESSAGE, synthesised issue, raw_response null) with the RuntimeEvent", async () => {
    const model = new NoncomplianceModel();

    const outcome = await runTypedQueryLoop(
      new RecordingCheckpoint(),
      liveSignal(),
      model,
      config(2),
      // no schemaValidation collaborator
    );

    expect(model.forcedRespondCalls, "the forced respond turn was dispatched once").toBe(1);
    // Pre-fix the noncompliance arm fell through the respond happy path and
    // the loop fabricated `{kind: "value", value: undefined}` — the exact
    // unvalidated-binding failure mode the additive arm exists to prevent.
    expect(
      outcome.kind,
      "with no schemaValidation collaborator the loop surfaces the ERR-17 terminal " +
        "ValidationError DIRECTLY — never a fabricated value outcome (bug 0010 seam law)",
    ).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.cause, "the terminal error rides cause schema_validation").toBe(
      "schema_validation",
    );
    expect(
      outcome.error.message,
      "the terminal message is the fixed NONCOMPLIANCE_TERMINAL_MESSAGE literal (ERR-17)",
    ).toBe("model did not call the forced respond tool");
    expect(outcome.error.attempts, "no repair machinery exists here — attempts 0").toBe(0);
    expect(
      outcome.error.validation_errors,
      "validation_errors carries exactly the synthesised ERR-17 wrong_tool issue " +
        "(path '', schema_keyword 'required', the two-arm message literal)",
    ).toEqual([WRONG_TOOL_ISSUE]);
    expect(
      outcome.error.raw_response,
      "raw_response rides through from the driver's noncompliance report (null here)",
    ).toBeNull();
    expect(outcome.event.kind, "the usual RuntimeEvent accompanies the Err").toBe("validation");
    expect(outcome.event.message, "the RuntimeEvent carries the ERR-17 terminal message").toBe(
      "model did not call the forced respond tool",
    );
    expect(outcome.event.attempts, "the RuntimeEvent carries attempts 0").toBe(0);
  });
});
