// V13d-T — failing tests for the paired `V13d` schema-validation respond-repair
// loop (query/query-failure-and-repair.md QRY-11;
// errors-and-results/queryerror-variants.md ERR-17).
//
// Each test drives the live respond-repair surface (`runRespondRepairLoop`)
// through a deterministic scripted follow-up driver and reds on its own primary
// assertion while `V13d` is absent: the stub loop issues no follow-up, consults
// neither the opening failure nor the driver, and returns an inert `value`
// outcome, so the attempt-accounting, proximate-propagation, per-attempt-budget,
// and ERR-17 synthesised-issue expectations red rather than a compile error, a
// missing fixture, or a harness throw. Byte-exact follow-up template rendering
// (QRY-12) is owned by `V13h`, not this leaf.

import { describe, expect, it } from "vitest";
import {
  NONCOMPLIANCE_TERMINAL_MESSAGE,
  runRespondRepairLoop,
  type FollowUpResult,
  type RespondRepairConfig,
  type RespondRepairDriver,
  type RespondRepairInput,
  type ValidationFailure,
} from "../src/runtime/query-respond-repair";
import {
  synthesizeForcedRespondIssue,
  type ForcedRespondBranch,
  type QueryError,
  type TransportError,
  type ContextOverflowError,
  type ValidationIssue,
} from "../src/runtime/query-error";

// ---------------------------------------------------------------------------
// Test fixtures.
// ---------------------------------------------------------------------------

function config(
  methodology: RespondRepairConfig["methodology"],
  attempts: number,
): RespondRepairConfig {
  return { methodology, attempts };
}

function input(cfg: RespondRepairConfig, maxRounds: number): RespondRepairInput {
  return { config: cfg, maxRounds };
}

const issue = (path: string): ValidationIssue => ({
  path,
  message: `value at ${path} failed`,
  schema_keyword: "type",
});

const schemaFailure = (
  issues: readonly ValidationIssue[],
  raw_response: string | null = "{ malformed }",
): ValidationFailure & { kind: "schema_validation" } => ({
  kind: "schema_validation",
  issues,
  raw_response,
});

const transportError = (): TransportError => ({
  kind: "transport",
  message: "provider transport failure",
  http_status: 503,
  provider: "anthropic-messages",
  retryable: true,
});

const contextOverflowError = (): ContextOverflowError => ({
  kind: "context_overflow",
  message: "context overflow",
  tokens_used: null,
  tokens_limit: null,
  raw_response: null,
});

/**
 * A deterministic scripted `RespondRepairDriver`. Records every follow-up's
 * `(attempt, maxRounds)` so a test can assert the per-attempt fresh budget and
 * the number of user turns appended, and fails loudly (never silently) when the
 * loop reads past the scripted follow-ups.
 */
class ScriptedRepairDriver implements RespondRepairDriver {
  readonly calls: { attempt: number; maxRounds: number }[] = [];
  readonly #results: readonly FollowUpResult[];

  constructor(results: readonly FollowUpResult[]) {
    this.#results = results;
  }

  nextFollowUp(attempt: number, maxRounds: number): Promise<FollowUpResult> {
    this.calls.push({ attempt, maxRounds });
    const result = this.#results[attempt - 1];
    if (result === undefined) {
      // Loud failure, not a silent hang: a correct loop never issues more
      // follow-ups than the scripted transcript provides.
      throw new Error(`no scripted follow-up for attempt ${attempt}`);
    }
    return Promise.resolve(result);
  }
}

const followSchemaFail = (
  issues: readonly ValidationIssue[],
  raw_response: string | null = "{ malformed }",
): FollowUpResult => ({ kind: "schema_validation", issues, raw_response });

const followNonValidation = (error: QueryError): FollowUpResult => ({
  kind: "non_validation",
  error,
});

const followNoncompliance = (
  branch: ForcedRespondBranch,
  raw_response: string | null = null,
): FollowUpResult => ({ kind: "noncompliance", branch, raw_response });

// ===========================================================================
// QRY-11 — respond-repair loop: a schema-validation failure appends a new user
// turn per attempt and terminates as ValidationError{schema_validation} at the
// bound; `none` / `0` issues no follow-up (query-failure-and-repair.md#qry-11).
// ===========================================================================

describe("V13d-T — QRY-11 respond-repair loop (query-failure-and-repair.md#qry-11)", () => {
  it("QRY-11: a schema-validation failure appends one new user turn per attempt and terminates as ValidationError{schema_validation} at the attempts bound, carrying only the final attempt's issue", async () => {
    // Every follow-up re-validation fails, so the loop exhausts the 3-attempt
    // budget. Each attempt carries a distinct issue; only the LAST attempt's
    // issue survives into the terminal error.
    const finalIssues = [issue("/final")];
    const driver = new ScriptedRepairDriver([
      followSchemaFail([issue("/a1")], "attempt-1"),
      followSchemaFail([issue("/a2")], "attempt-2"),
      followSchemaFail(finalIssues, "attempt-3"),
    ]);

    const outcome = await runRespondRepairLoop(
      schemaFailure([issue("/initial")], "initial"),
      driver,
      input(config("validator_error", 3), 8),
    );

    // A new user turn is appended per attempt (never a re-issue of the original
    // query): exactly `attempts` follow-ups were issued.
    expect(driver.calls.map((c) => c.attempt)).toEqual([1, 2, 3]);
    // QRY-11: terminal exhaustion surfaces the schema_validation ValidationError
    // whose `attempts` equals the configured budget.
    expect(outcome.kind).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.kind).toBe("validation");
    expect(outcome.error.cause).toBe("schema_validation");
    expect(outcome.error.attempts).toBe(3);
    // Only the final attempt's issue appears (never a cumulative concatenation).
    expect(outcome.error.validation_errors).toEqual(finalIssues);
    expect(outcome.error.raw_response).toBe("attempt-3");
  });

  it("QRY-11: a follow-up that re-validates successfully returns the corrected value with the slots debited so far", async () => {
    // Attempt 1 fails re-validation (one slot), attempt 2 re-validates OK.
    const driver = new ScriptedRepairDriver([
      followSchemaFail([issue("/a1")]),
      { kind: "validated", value: { answer: "ok" } },
    ]);

    const outcome = await runRespondRepairLoop(
      schemaFailure([issue("/initial")]),
      driver,
      input(config("schema_repeat", 3), 8),
    );

    expect(outcome.kind).toBe("value");
    if (outcome.kind !== "value") return;
    expect(outcome.value).toEqual({ answer: "ok" });
    // Two follow-ups issued; both re-validated, so two slots debited.
    expect(driver.calls.map((c) => c.attempt)).toEqual([1, 2]);
    expect(outcome.attemptsUsed).toBe(2);
  });

  it("QRY-11: `methodology: none` issues no follow-up and terminates with attempts:0 carrying the opening failure's issue", async () => {
    // A driver that must never be consulted under `none`.
    const driver = new ScriptedRepairDriver([]);
    const initialIssue = issue("/initial");

    const outcome = await runRespondRepairLoop(
      schemaFailure([initialIssue], "initial"),
      driver,
      input(config("none", 3), 8),
    );

    // `none` (== attempts:0) issues NO follow-up at all.
    expect(driver.calls).toEqual([]);
    expect(outcome.kind).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.cause).toBe("schema_validation");
    expect(outcome.error.attempts).toBe(0);
    expect(outcome.error.validation_errors).toEqual([initialIssue]);
  });

  it("QRY-11: `attempts: 0` issues no follow-up (equivalent to `none`)", async () => {
    const driver = new ScriptedRepairDriver([]);
    const initialIssue = issue("/initial");

    const outcome = await runRespondRepairLoop(
      schemaFailure([initialIssue]),
      driver,
      input(config("validator_error", 0), 8),
    );

    expect(driver.calls).toEqual([]);
    expect(outcome.kind).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.attempts).toBe(0);
  });
});

// ===========================================================================
// QRY-11 — proximate propagation: a non-validation failure propagates the
// proximate variant and consumes no attempt; ContextOverflowError permanently
// short-circuits (query-failure-and-repair.md#qry-11).
// ===========================================================================

describe("V13d-T — QRY-11 proximate non-validation propagation (query-failure-and-repair.md#qry-11)", () => {
  it("QRY-11: a non-validation follow-up failure propagates the proximate variant, consumes no attempt, and issues no further follow-up", async () => {
    // The first follow-up fails with transport; the proximate cause wins and the
    // loop terminates without touching the remaining budget.
    const driver = new ScriptedRepairDriver([
      followNonValidation(transportError()),
      // A guard entry that must never be consulted.
      followSchemaFail([issue("/never")]),
    ]);

    const outcome = await runRespondRepairLoop(
      schemaFailure([issue("/initial")]),
      driver,
      input(config("validator_error", 3), 8),
    );

    // Exactly one follow-up was issued (no further follow-up after the proximate
    // failure).
    expect(driver.calls.map((c) => c.attempt)).toEqual([1]);
    expect(outcome.kind).toBe("propagated");
    if (outcome.kind !== "propagated") return;
    // The proximate variant is surfaced, never `validation` with a prior count.
    expect(outcome.error.kind).toBe("transport");
    // A non-validation failure consumes NO attempts slot.
    expect(outcome.attemptsUsed).toBe(0);
  });

  it("QRY-11: a re-validated follow-up debits its slot, then a later non-validation failure propagates without debiting a further slot", async () => {
    // Attempt 1 re-validates and fails schema (one slot); attempt 2 fails with
    // transport (no slot) and propagates.
    const driver = new ScriptedRepairDriver([
      followSchemaFail([issue("/a1")]),
      followNonValidation(transportError()),
    ]);

    const outcome = await runRespondRepairLoop(
      schemaFailure([issue("/initial")]),
      driver,
      input(config("validator_error", 3), 8),
    );

    expect(driver.calls.map((c) => c.attempt)).toEqual([1, 2]);
    expect(outcome.kind).toBe("propagated");
    if (outcome.kind !== "propagated") return;
    expect(outcome.error.kind).toBe("transport");
    // Only the first (re-validated) follow-up debited a slot.
    expect(outcome.attemptsUsed).toBe(1);
  });

  it("QRY-11: ContextOverflowError permanently short-circuits respond-repair — it propagates, consumes no attempt, and issues no further follow-up", async () => {
    const driver = new ScriptedRepairDriver([
      followNonValidation(contextOverflowError()),
      followSchemaFail([issue("/never")]),
    ]);

    const outcome = await runRespondRepairLoop(
      schemaFailure([issue("/initial")]),
      driver,
      input(config("validator_error", 3), 8),
    );

    // Short-circuit: no further follow-up after the context overflow.
    expect(driver.calls.map((c) => c.attempt)).toEqual([1]);
    expect(outcome.kind).toBe("propagated");
    if (outcome.kind !== "propagated") return;
    expect(outcome.error.kind).toBe("context_overflow");
    expect(outcome.attemptsUsed).toBe(0);
  });
});

// ===========================================================================
// QRY-11 — per-attempt budget: each repair turn gets a fresh `tool_loop` budget
// (query-failure-and-repair.md#qry-11).
// ===========================================================================

describe("V13d-T — QRY-11 fresh per-attempt tool_loop budget (query-failure-and-repair.md#qry-11)", () => {
  it("QRY-11: every respond-repair follow-up is serviced with a fresh full tool_loop budget, not a decremented residue", async () => {
    const MAX_ROUNDS = 5;
    const driver = new ScriptedRepairDriver([
      followSchemaFail([issue("/a1")]),
      followSchemaFail([issue("/a2")]),
      followSchemaFail([issue("/a3")]),
    ]);

    await runRespondRepairLoop(
      schemaFailure([issue("/initial")]),
      driver,
      input(config("validator_error", 3), MAX_ROUNDS),
    );

    // Each follow-up received the full configured `max_rounds` (a fresh budget),
    // never a decremented residue such as 4, 3, ….
    expect(driver.calls.map((c) => c.maxRounds)).toEqual([
      MAX_ROUNDS,
      MAX_ROUNDS,
      MAX_ROUNDS,
    ]);
  });
});

// ===========================================================================
// ERR-17 — forced-respond non-compliance injects the synthesised ValidationIssue
// (path "", keyword "required", branch-specific message) into the respond-repair
// loop (queryerror-variants.md ERR-17).
// ===========================================================================

describe("V13d-T — ERR-17 forced-respond non-compliance into the respond-repair loop (queryerror-variants.md ERR-17)", () => {
  it("ERR-17: a plain-text non-compliance under `methodology: none` returns attempts:0 with the synthesised issue (path \"\", keyword \"required\", plain-text message) and the terminal message", async () => {
    const branch: ForcedRespondBranch = { kind: "plain_text" };
    const driver = new ScriptedRepairDriver([]);

    const outcome = await runRespondRepairLoop(
      { kind: "noncompliance", branch, raw_response: "here is the answer" },
      driver,
      input(config("none", 3), 8),
    );

    // `none` issues no follow-up; the first non-compliant forced respond turn
    // surfaces immediately with attempts:0.
    expect(driver.calls).toEqual([]);
    expect(outcome.kind).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.cause).toBe("schema_validation");
    expect(outcome.error.attempts).toBe(0);
    // The synthesised issue (ERR-17): path "", schema_keyword "required",
    // plain-text-branch message.
    expect(outcome.error.validation_errors).toEqual([
      synthesizeForcedRespondIssue(branch),
    ]);
    expect(outcome.error.validation_errors[0]).toEqual({
      path: "",
      schema_keyword: "required",
      message: "model returned plain text instead of calling the forced respond tool",
    });
    // ERR-17 terminal-exhaustion message.
    expect(outcome.error.message).toBe(NONCOMPLIANCE_TERMINAL_MESSAGE);
    // Plain-text branch: `raw_response` is the plain-text body of the turn.
    expect(outcome.error.raw_response).toBe("here is the answer");
  });

  it("ERR-17: a wrong-tool non-compliance on each follow-up feeds the synthesised issue into the loop; on exhaustion only the last attempt's synthesised issue survives", async () => {
    const respondTool = "__loom_respond_r1";
    const lastBranch: ForcedRespondBranch = {
      kind: "wrong_tool",
      providerToolName: "fetch",
      respondToolName: respondTool,
    };
    const driver = new ScriptedRepairDriver([
      followNoncompliance(
        { kind: "wrong_tool", providerToolName: "search", respondToolName: respondTool },
        null,
      ),
      followNoncompliance(lastBranch, null),
    ]);

    const outcome = await runRespondRepairLoop(
      schemaFailure([issue("/initial")]),
      driver,
      input(config("validator_error", 2), 8),
    );

    expect(driver.calls.map((c) => c.attempt)).toEqual([1, 2]);
    expect(outcome.kind).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(outcome.error.cause).toBe("schema_validation");
    expect(outcome.error.attempts).toBe(2);
    // Only the final attempt's synthesised issue (wrong-tool branch, verbatim
    // ERR-17 message naming the provider-emitted tool) survives.
    expect(outcome.error.validation_errors).toEqual([
      synthesizeForcedRespondIssue(lastBranch),
    ]);
    expect(outcome.error.validation_errors[0]).toEqual({
      path: "",
      schema_keyword: "required",
      message:
        "model invoked tool 'fetch' instead of the forced respond tool '__loom_respond_r1'",
    });
    expect(outcome.error.message).toBe(NONCOMPLIANCE_TERMINAL_MESSAGE);
    // Wrong-tool turn carried no plain text: `raw_response` is null.
    expect(outcome.error.raw_response).toBeNull();
  });

  it("ERR-17: a non-compliant follow-up consumes exactly one attempts slot (same accounting as an AJV failure)", async () => {
    const respondTool = "__loom_respond_r1";
    // Attempt 1 non-compliant (one slot), attempt 2 re-validates OK.
    const driver = new ScriptedRepairDriver([
      followNoncompliance({ kind: "plain_text" }, "prose"),
      { kind: "validated", value: 42 },
    ]);

    const outcome = await runRespondRepairLoop(
      {
        kind: "noncompliance",
        branch: { kind: "wrong_tool", providerToolName: "x", respondToolName: respondTool },
        raw_response: null,
      },
      driver,
      input(config("validator_error", 3), 8),
    );

    expect(outcome.kind).toBe("value");
    if (outcome.kind !== "value") return;
    expect(outcome.value).toBe(42);
    // The non-compliant follow-up debited exactly one slot, then the corrected
    // follow-up debited its own — two re-validations, two slots.
    expect(outcome.attemptsUsed).toBe(2);
  });
});
