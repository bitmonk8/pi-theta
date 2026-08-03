// V13e-T — failing integration tests for the paired `V13e` typed-query
// schema-validation integration (QRY-22).
//
// These drive a typed `@`-query end-to-end through the REAL runtime execution
// path (`runTypedQueryLoop` / `runQueryEffect`, NOT the isolated `V5d` / `V13c`
// / `V13d` units) and assert that a query's declared schema — a named `schema`
// decl AND an inline object/type annotation — is resolved (via `resolveSchema`
// for a named decl), lowered to the validating JSON Schema (`V5d`/`SUBS-1`),
// conveyed to the model on the forced-respond turn (the conveyance carries the
// LOWERED shape, not the bare type name), and that the response is validated
// against it with respond-repair (`QRY-11`) on non-conformance.
//
// The tests inject a `TypedQuerySchemaValidation` seam whose steps wrap the REAL
// collaborators — a real `env.resolveSchema` read, a real lowered JSON Schema,
// the real `AjvSchemaValidator`, and the real `runRespondRepairLoop` — and
// record every invocation, so the "execution-path wiring" assertions witness
// the path invoking the real pieces rather than the isolated units.
//
// They red for the intended reason: at `V13e-T` time the `V13c` `runTypedQueryLoop`
// body performs only a depth walk and returns the raw forced-respond payload as
// the query value; it invokes NONE of the seam's steps and binds a
// non-conforming response as the typed query's value. Each test reds on its own
// primary QRY-22 assertion (the seam step was never invoked, the conveyance
// carried nothing, or a non-conforming response was bound instead of surfacing
// `Err(QueryError { kind: "validation", cause: "schema_validation" })`), not on
// a compile error, a missing fixture, or a harness throw.
//
// Spec: query/query-failure-and-repair.md (QRY-22 typed-query schema-validation
// integration; QRY-11 respond-repair), schema-subset.md (SUBS-1 lowering),
// errors-and-results/queryerror-variants.md (ValidationError shape).

import { describe, expect, it } from "vitest";
import {
  runTypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type ToolCallRequest,
  type TypedQuerySchemaValidation,
  type TypedQueryValidationResult,
} from "../src/runtime/query-tool-loop";
import {
  runRespondRepairLoop,
  type FollowUpResult,
  type RespondRepairConfig,
  type RespondRepairDriver,
  type RespondRepairInput,
  type RespondRepairOutcome,
  type ValidationFailure,
} from "../src/runtime/query-respond-repair";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { ValidationIssue } from "../src/runtime/query-error";
import {
  buildEnvironment,
  type LexicalEnvironment,
} from "../src/runtime/lexical-environment";
import type { Checkpoint, CheckpointSite } from "../src/seams/checkpoint";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import type {
  Expr,
  ThetaBody,
  QueryExpr,
  SchemaDecl,
} from "../src/parser/theta-document";
import type { ThetaValue } from "../src/runtime/value";
import type { CodeSideToolCall, ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { InvokeChild } from "../src/runtime/invoke-cancellation";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// --- Substrate -------------------------------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

const QUERY_SITE: CheckpointSite = { file: "report.theta", line: 3, column: 5 };

function config(): QueryToolLoopConfig {
  // A typed query dispatches only the forced-respond terminator (no free-phase
  // provider call), so `max_rounds: 0` fires the `max_rounds`-final branch at
  // typed-query start and the forced respond turn is the only turn.
  return {
    maxRounds: 0,
    querySite: QUERY_SITE,
    thetaSlashName: "/report",
    invocationId: "00000000-0000-4000-8000-000000000000",
    occurredAt: 1_700_000_000_000,
  };
}

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A scripted `QueryModelDriver` whose forced respond turn carries `payload`. */
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    // A `max_rounds: 0` typed query never reads a free-phase turn; fail loudly
    // rather than hang if a broken loop ever reaches here.
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(_batch: readonly ToolCallRequest[]): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}

// The lowered response schema `V5d` produces for the declared shape
// `{ status: "ok" | "degraded"; summary: string }`, with `status` carrying the
// step-3 emission `schema-subset.md:80` spells for a string-literal union. This
// is the LOWERED JSON Schema — the only form the model has seen during the
// original turn (per the forced-respond conveyance) — not the source-Theta-type
// form.
const LOWERED: LoweredSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "degraded"] },
    summary: { type: "string" },
  },
  required: ["status", "summary"],
  additionalProperties: false,
};

const CONFORMING = { status: "ok", summary: "all systems nominal" };
// Non-conforming exactly as the manual real-host smoke observed: `status` is
// out of the declared enum and `summary` is absent.
const NON_CONFORMING = { status: "inspected", notes: "x" };

/**
 * A scripted respond-repair driver that never re-validates successfully, so the
 * `QRY-11` respond-repair loop runs to terminal exhaustion and surfaces the
 * `schema_validation` `ValidationError`.
 */
class ExhaustingRepairDriver implements RespondRepairDriver {
  calls = 0;
  nextFollowUp(): Promise<FollowUpResult> {
    this.calls += 1;
    return Promise.resolve({
      kind: "schema_validation",
      issues: [{ path: "/status", message: "must be equal to one of the allowed values", schema_keyword: "enum" }],
      raw_response: JSON.stringify(NON_CONFORMING),
    });
  }
}

/**
 * A `TypedQuerySchemaValidation` seam whose steps wrap the REAL collaborators
 * and record each invocation, so a test asserts the execution path drove the
 * real resolution / lowering / `AjvSchemaValidator` / `runRespondRepairLoop`.
 */
class SpyValidation implements TypedQuerySchemaValidation {
  resolveCalls = 0;
  lowerCalls = 0;
  conveyCalls = 0;
  validateCalls = 0;
  respondRepairCalls = 0;
  conveyed: LoweredSchema | null = null;
  resolvedShape: unknown = undefined;

  readonly #validator: AjvSchemaValidator;
  readonly #repairDriver: ExhaustingRepairDriver;

  constructor(
    /** For a named `schema` decl: the env + name the real `resolveSchema` reads. */
    private readonly named: { readonly env: LexicalEnvironment; readonly name: string } | null,
    /** For an inline object/type annotation: the pre-resolved inline shape. */
    private readonly inlineShape: unknown,
  ) {
    const slugOf = (schema: LoweredSchema): SchemaSlug => ({
      slug: "report-slug",
      canonicalBytes: JSON.stringify(schema),
    });
    this.#validator = new AjvSchemaValidator({ emit: () => {}, slugOf });
    this.#repairDriver = new ExhaustingRepairDriver();
  }

  resolveDeclaredSchema(): unknown {
    this.resolveCalls += 1;
    // A named decl resolves through the REAL `resolveSchema` (previously
    // uncalled); an inline annotation resolves to its inline shape.
    this.resolvedShape = this.named !== null
      ? this.named.env.resolveSchema(this.named.name)
      : this.inlineShape;
    return this.resolvedShape;
  }

  lower(_shape: unknown): LoweredSchema {
    this.lowerCalls += 1;
    return LOWERED;
  }

  convey(lowered: LoweredSchema): void {
    this.conveyCalls += 1;
    this.conveyed = lowered;
  }

  validate(lowered: LoweredSchema, payload: unknown): TypedQueryValidationResult {
    this.validateCalls += 1;
    const compiled = this.#validator.compile(lowered);
    const result = compiled.validate(payload);
    if (result.ok) {
      return { ok: true };
    }
    const issues: ValidationIssue[] = result.errors.map((e) => ({
      path: e.instancePath,
      message: e.message,
      schema_keyword: e.keyword,
    }));
    return { ok: false, issues, raw_response: JSON.stringify(payload) };
  }

  runRespondRepair(initial: ValidationFailure): Promise<RespondRepairOutcome> {
    this.respondRepairCalls += 1;
    const repairConfig: RespondRepairConfig = { methodology: "schema_repeat", attempts: 2 };
    const input: RespondRepairInput = { config: repairConfig, maxRounds: 0 };
    return runRespondRepairLoop(initial, this.#repairDriver, input);
  }
}

/** A root environment registering a top-level `schema Report` decl. */
function envWithReportSchema(): LexicalEnvironment {
  const decl: SchemaDecl = { kind: "schema", name: "Report", range: span() };
  const body: ThetaBody = { statements: [decl], tail: null };
  return buildEnvironment({ body });
}

// ===========================================================================
// QRY-22 — named-schema resolution, lowering, and conveyance.
// ===========================================================================

describe("V13e-T — QRY-22 named-schema resolution + lowered-shape conveyance", () => {
  it("QRY-22: a typed query annotated with a named `schema` decl resolves the name to its declared shape, lowers it (V5d/SUBS-1), and conveys the LOWERED shape on the forced-respond turn — not the bare type name", async () => {
    const env = envWithReportSchema();
    const validation = new SpyValidation({ env, name: "Report" }, undefined);

    await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(CONFORMING),
      config(),
      validation,
    );

    // The named schema is resolved through the real `resolveSchema` (previously
    // 0-caller) and lowered (V5d/SUBS-1).
    expect(
      validation.resolveCalls,
      "QRY-22: the execution path resolves the named `schema` decl via `resolveSchema`",
    ).toBeGreaterThan(0);
    expect(
      validation.lowerCalls,
      "QRY-22: the execution path lowers the resolved declared shape (V5d/SUBS-1)",
    ).toBeGreaterThan(0);
    // The forced-respond conveyance carries the LOWERED shape, not the bare
    // type name `"Report"`.
    expect(
      validation.conveyed,
      "QRY-22: the forced-respond conveyance carries the lowered shape",
    ).toEqual(LOWERED);
    expect(
      validation.conveyed,
      "QRY-22: the conveyance is NOT the bare type name",
    ).not.toBe("Report");
  });
});

// ===========================================================================
// QRY-22 — validation is enforced against the lowered declared schema.
// ===========================================================================

describe("V13e-T — QRY-22 validation enforced via the execution path", () => {
  it("QRY-22: a non-conforming response is NOT bound as the query value — it routes through the QRY-11 respond-repair loop and terminal non-conformance surfaces Err(QueryError { kind: \"validation\", cause: \"schema_validation\" })", async () => {
    const env = envWithReportSchema();
    const validation = new SpyValidation({ env, name: "Report" }, undefined);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(NON_CONFORMING),
      config(),
      validation,
    );

    // A non-conforming response must NOT bind as the typed query's value.
    expect(
      outcome.kind,
      "QRY-22: a non-conforming response is not bound as the typed query value",
    ).not.toBe("value");
    // It routes through the QRY-11 respond-repair loop.
    expect(
      validation.respondRepairCalls,
      "QRY-22: a non-conforming response routes through `runRespondRepairLoop` (QRY-11)",
    ).toBeGreaterThan(0);
    // Terminal non-conformance surfaces the schema_validation ValidationError.
    expect(
      outcome.kind,
      "QRY-22: terminal non-conformance surfaces the validation outcome",
    ).toBe("validation");
    if (outcome.kind === "validation") {
      expect(outcome.error.kind, "QRY-22: kind = validation").toBe("validation");
      expect(outcome.error.cause, "QRY-22: cause = schema_validation").toBe("schema_validation");
    }
  });

  it("QRY-22: a conforming response validates against the lowered schema and binds as the typed query's value", async () => {
    const env = envWithReportSchema();
    const validation = new SpyValidation({ env, name: "Report" }, undefined);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(CONFORMING),
      config(),
      validation,
    );

    // The response is validated against the lowered schema before it binds —
    // a bind with no validation run does not satisfy QRY-22.
    expect(
      validation.validateCalls,
      "QRY-22: the execution path validates the response against the lowered schema",
    ).toBeGreaterThan(0);
    expect(outcome.kind, "QRY-22: a conforming response binds as the value").toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value, "QRY-22: the validated value is the query result").toEqual(CONFORMING);
    }
  });
});

// ===========================================================================
// QRY-22 — inline object/type annotation drives the same pipeline.
// ===========================================================================

describe("V13e-T — QRY-22 inline object/type annotation integration", () => {
  it("QRY-22: an inline object/type-annotated typed query resolves and lowers its inline shape, conveys the lowered shape, and validates the response against it", async () => {
    // An inline annotation resolves to its inline shape directly (no named
    // `resolveSchema` read); the lowered form is still what the conveyance and
    // AJV consume.
    const inlineShape = { object: { status: ["ok", "degraded"], summary: "string" } };
    const validation = new SpyValidation(null, inlineShape);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(NON_CONFORMING),
      config(),
      validation,
    );

    expect(
      validation.lowerCalls,
      "QRY-22: the execution path lowers the inline shape (V5d/SUBS-1)",
    ).toBeGreaterThan(0);
    expect(
      validation.conveyed,
      "QRY-22: the inline query's conveyance carries the lowered shape",
    ).toEqual(LOWERED);
    expect(
      validation.validateCalls,
      "QRY-22: the inline query's response is validated against the lowered schema",
    ).toBeGreaterThan(0);
    expect(
      outcome.kind,
      "QRY-22: a non-conforming inline-typed response is not bound as the value",
    ).not.toBe("value");
  });
});

// ===========================================================================
// QRY-22 — execution-path wiring: driving runTypedQueryLoop / runQueryEffect
// actually invokes resolution → lowering → AjvSchemaValidator →
// runRespondRepairLoop (not the isolated units).
// ===========================================================================

describe("V13e-T — QRY-22 execution-path wiring (drives the path, not the units)", () => {
  it("QRY-22: driving `runTypedQueryLoop` invokes schema resolution → lowering → AjvSchemaValidator → runRespondRepairLoop — an implementation that leaves them unwired fails", async () => {
    const env = envWithReportSchema();
    const validation = new SpyValidation({ env, name: "Report" }, undefined);

    await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(NON_CONFORMING),
      config(),
      validation,
    );

    expect(validation.resolveCalls, "QRY-22 wiring: schema resolution invoked").toBeGreaterThan(0);
    expect(validation.lowerCalls, "QRY-22 wiring: lowering invoked").toBeGreaterThan(0);
    expect(validation.validateCalls, "QRY-22 wiring: AjvSchemaValidator invoked").toBeGreaterThan(0);
    expect(
      validation.respondRepairCalls,
      "QRY-22 wiring: runRespondRepairLoop invoked on non-conformance",
    ).toBeGreaterThan(0);
  });

  it("QRY-22: driving `runQueryEffect` (the effectful-statement-host execution path) validates the typed query and surfaces the schema_validation Err on non-conformance", async () => {
    const env = envWithReportSchema();
    const validation = new SpyValidation({ env, name: "Report" }, undefined);
    const model = new RespondingModel(NON_CONFORMING);

    const dispatch: QueryHostDispatch = {
      typed: true,
      model,
      config: config(),
      schemaValidation: validation,
    };

    const sink: ToolLoweringSink = {
      runtimeEvent(): void {},
      diagnostic(): void {},
      systemNote(): void {},
    };
    const queryExpr: QueryExpr = { kind: "query", schema: "Report", template: "status?", range: span() };

    const deps: EffectfulStatementHostDeps = {
      checkpoint: NOOP_CHECKPOINT,
      signal: liveSignal(),
      sink,
      file: "report.theta",
      evaluatePure(_expr: Expr): ThetaValue {
        return null;
      },
      resolveQuery(): QueryHostDispatch {
        return dispatch;
      },
      resolveToolCall(): CodeSideToolCall {
        throw new Error("unused");
      },
      resolveInvoke(): InvokeChild {
        throw new Error("unused");
      },
    };

    const host = createEffectfulStatementHost(deps);
    const result = await host.runEffect(queryExpr, env);

    // The typed query's response is validated through the execution path and a
    // non-conforming response surfaces the schema_validation `Err`, not an
    // `Ok` binding the raw model payload.
    expect(
      validation.respondRepairCalls,
      "QRY-22: `runQueryEffect` routes a non-conforming response through respond-repair",
    ).toBeGreaterThan(0);
    expect(result.ok, "QRY-22: a non-conforming typed query does not bind an Ok value").toBe(false);
    if (!result.ok) {
      expect(result.error.kind, "QRY-22: the surfaced error kind is validation").toBe("validation");
    }
  });
});
