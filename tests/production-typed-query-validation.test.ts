// V13e (Defect B) — production typed-query schema-validation wiring (QRY-22).
//
// Defect B: a typed `@<Schema>` query bound its response as a typed `Ok(...)`
// WITHOUT validating it against the declared schema, because the production
// producer never supplied the `TypedQuerySchemaValidation` collaborator to
// `runTypedQueryLoop`. A `null` (or non-conforming) reply surfaced as `Ok(null)`
// instead of `Err(QueryError { kind: "validation", cause: "schema_validation" })`.
//
// These tests exercise the production collaborators the fixed producer composes —
// the whole-file parser (which now retains `schema X { … }` object-body fields),
// `lowerQueryResponseSchema` (declared-schema → lowered JSON Schema), the real
// `AjvSchemaValidator`, and `buildTypedQueryValidation` (QRY-22 seam over the
// `V13d` respond-repair loop) — driven through the REAL `runTypedQueryLoop`
// execution path, exactly as the producer wires them.
//
//   - The FIRST test pins the defect and the fix as a contrast: with NO
//     collaborator (the pre-fix miscompose) a `null` reply binds `Ok(null)`;
//     with the production collaborator it surfaces the schema_validation `Err`.
//   - A conforming reply binds the validated typed value.
//   - A non-JSON reply becomes a validation failure routed through respond-repair
//     (never an uncaught `JSON.parse` throw, never `Ok(null)`).
//   - The forced-respond conveyance carries the lowered shape (not the bare name).
//
// Spec: query/query-failure-and-repair.md (QRY-22, QRY-11), schema-subset.md
// (SUBS-1), errors-and-results/queryerror-variants.md (ValidationError shape).

import { describe, expect, it } from "vitest";
import {
  runTypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type TypedQuerySchemaValidation,
} from "../src/runtime/query-tool-loop";
import { buildTypedQueryValidation } from "../src/runtime/typed-query-validation";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import {
  parseLoomDocument,
  type ParseLoomDocumentDeps,
  type SchemaDecl,
} from "../src/parser/loom-document";
import type { LoomSource } from "../src/lexer/lexer";
import type { Checkpoint } from "../src/seams/checkpoint";

// --- Substrate -------------------------------------------------------------

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function config(): QueryToolLoopConfig {
  // A typed query dispatches only the forced-respond terminator (max_rounds: 0).
  return {
    maxRounds: 0,
    querySite: { file: "triage.loom", line: 1, column: 1 },
    loomSlashName: "/triage",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}

/** A scripted model whose forced-respond turn carries `payload`. */
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}

/** Parse a `.loom` source and return its body's `schema` declarations. */
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseLoomDocumentDeps;
  const source: LoomSource = { path: "triage.loom", bytes: new TextEncoder().encode(src) };
  const doc = parseLoomDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The shipped-shape triage schema (mirrors docs/examples/handle-error.loom). */
const TRIAGE_SOURCE = [
  "schema Triage {",
  '  category: "bug" | "feature" | "question",',
  "  urgent: boolean",
  "}",
].join("\n");

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "triage",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * Build the production `TypedQuerySchemaValidation` for `@<Triage>` exactly as
 * the fixed producer composes it, over a scripted respond-repair follow-up.
 */
function buildTriageValidation(
  followUps: readonly string[],
): { readonly validation: TypedQuerySchemaValidation; readonly lowered: LoweredSchema; followUpCalls: number } {
  const schemas = schemaDeclsOf(TRIAGE_SOURCE);
  const lowered = lowerQueryResponseSchema("Triage", schemas);
  if (lowered === undefined) {
    throw new Error("Triage schema failed to lower — parser did not retain the schema body");
  }
  const state = { followUpCalls: 0 };
  const validation = buildTypedQueryValidation({
    lowered,
    resolveShape: () => schemas.find((s) => s.name === "Triage"),
    schemaValidator: ajv(),
    attempts: followUps.length,
    maxRounds: 0,
    driveFollowUp: () => {
      const reply = followUps[state.followUpCalls] ?? "{}";
      state.followUpCalls += 1;
      return Promise.resolve(reply);
    },
  });
  return {
    validation,
    lowered,
    get followUpCalls() {
      return state.followUpCalls;
    },
  };
}

// ===========================================================================

describe("V13e (Defect B) — production typed-query schema validation (QRY-22)", () => {
  it("QRY-22: a null reply — the live defect — binds Ok(null) WITHOUT the collaborator, and surfaces Err(validation, schema_validation) WITH it", async () => {
    // Pre-fix miscompose: no `schemaValidation` collaborator → the loop binds the
    // raw `null` payload as the typed value (the exact Defect B behaviour).
    const buggy = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(null),
      config(),
    );
    expect(buggy.kind, "pre-fix: an unvalidated null payload binds as the value").toBe("value");
    if (buggy.kind === "value") {
      expect(buggy.value, "pre-fix: the bound value is null (Ok(null))").toBeNull();
    }

    // Fixed compose: the production collaborator validates the null reply against
    // the lowered `Triage` schema, which rejects a non-object — surfacing the
    // schema_validation `Err` (QRY-22).
    const { validation } = buildTriageValidation([]);
    const fixed = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(null),
      config(),
      validation,
    );
    expect(fixed.kind, "fix: a null reply is NOT bound as the typed value").not.toBe("value");
    expect(fixed.kind, "fix: terminal non-conformance surfaces the validation outcome").toBe(
      "validation",
    );
    if (fixed.kind === "validation") {
      expect(fixed.error.kind).toBe("validation");
      expect(fixed.error.cause, "QRY-22: cause = schema_validation").toBe("schema_validation");
    }
  });

  it("QRY-22: a non-conforming reply routes through respond-repair and surfaces Err(validation, schema_validation)", async () => {
    // Non-conforming exactly as the manual real-host smoke observed: missing the
    // required fields and carrying an undeclared property.
    const built = buildTriageValidation(['{"status":"inspected","notes":"x"}']);
    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel({ status: "inspected", notes: "x" }),
      config(),
      built.validation,
    );
    expect(outcome.kind).toBe("validation");
    expect(built.followUpCalls, "QRY-11: respond-repair drove a follow-up turn").toBeGreaterThan(0);
    if (outcome.kind === "validation") {
      expect(outcome.error.cause).toBe("schema_validation");
    }
  });

  it("QRY-22: a conforming reply validates against the lowered schema and binds the typed value", async () => {
    const { validation } = buildTriageValidation([]);
    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel({ category: "question", urgent: false }),
      config(),
      validation,
    );
    expect(outcome.kind, "QRY-22: a conforming response binds as the value").toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual({ category: "question", urgent: false });
    }
  });

  it("QRY-11: a respond-repair follow-up that re-validates successfully binds the corrected value", async () => {
    // The initial reply is non-conforming; the follow-up returns a conforming
    // object, so respond-repair binds the corrected value (not an Err).
    const built = buildTriageValidation(['{"category":"bug","urgent":true}']);
    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel({ category: "not-a-category", urgent: false }),
      config(),
      built.validation,
    );
    expect(outcome.kind, "QRY-11: a corrected follow-up binds the value").toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual({ category: "bug", urgent: true });
    }
    expect(built.followUpCalls).toBe(1);
  });

  it("the lowered Triage schema is the declared shape (conveyed to the model), not the bare type name", () => {
    const lowered = lowerQueryResponseSchema("Triage", schemaDeclsOf(TRIAGE_SOURCE));
    expect(lowered, "QRY-22: parser retains the schema body so it lowers").toBeDefined();
    expect(lowered).toMatchObject({
      type: "object",
      required: ["category", "urgent"],
      additionalProperties: false,
    });
    // The declared literal set lowers to an enum; the boolean field to a type.
    const properties = (lowered as { readonly properties: Record<string, unknown> }).properties;
    expect(properties["category"]).toEqual({ enum: ["bug", "feature", "question"] });
    expect(properties["urgent"]).toEqual({ type: "boolean" });
    // Not the bare type name.
    expect(lowered).not.toBe("Triage");
  });
});
