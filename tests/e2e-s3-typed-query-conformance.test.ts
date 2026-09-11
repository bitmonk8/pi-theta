// e2e-S3 — deterministic typed-query two-phase-loop + schema-validation
// conformance (QRY-22 / QRY-11 / REQ-QRY-36; the CAND-1 reduction).
//
// This suite drives a typed `@<Schema>` query end-to-end through the REAL
// production collaborators — the whole-file parser (`parseThetaDocument`, which
// retains `schema X { … }` object-body fields), `lowerQueryResponseSchema`
// (declared-schema → lowered JSON Schema, SUBS-1), the real `AjvSchemaValidator`,
// and `buildTypedQueryValidation` (the QRY-22 seam over the `V13d` respond-repair
// loop) — through the REAL `runTypedQueryLoop` execution path, with a scripted
// `QueryModelDriver` supplying the forced-respond payload. No live provider.
//
// It exists to answer the campaign's CAND-1 question (`status.md`): the live
// H8a "typed-query lowering, bounded" bullet and the acceptance (b)/(c) typed
// thetas fail schema validation with the AJV message `"must be object"`. These
// tests pin the CORRECT theta behaviour deterministically so we can classify
// CAND-1 as a theta-defect vs a provider-capability / test-artifact issue:
//
//   - A CONFORMING object reply binds `Ok(value)`.
//   - A NON-OBJECT reply (`null`, prose string, number) is NOT bound — it
//     surfaces `Err(QueryError { kind: "validation", cause: "schema_validation" })`
//     whose leading `ValidationIssue` is exactly the AJV `type` / `"must be
//     object"` the live suites observe. That is REQ-QRY-36's "never bind an
//     unvalidated response", so the live `"must be object"` is theta doing the
//     right thing, not a lowering defect.
//   - A NON-CONFORMING object reply routes through the QRY-11 respond-repair
//     loop; a follow-up that re-validates binds the corrected value.
//   - An UNRECOVERABLE reply (every follow-up still non-conforming) surfaces the
//     terminal `Err(validation / schema_validation)`.
//
// Spec: query/query-failure-and-repair.md (QRY-22, QRY-11, REQ-QRY-36),
// schema-subset.md (SUBS-1), errors-and-results/queryerror-variants.md
// (ValidationError shape). Method: M2 conformance (scripted QueryModelDriver
// seam, `src/runtime/query-tool-loop.ts:119`).

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
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
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
  // A typed query at `max_rounds: 0` fires the forced-respond terminator as its
  // only turn (QRY-14) — no free-phase provider call — so the scripted driver
  // supplies only the forced-respond payload.
  return {
    maxRounds: 0,
    querySite: { file: "triage.theta", line: 1, column: 1 },
    thetaSlashName: "/triage",
    invocationId: "inv-s3",
    occurredAt: 0,
  };
}

/** A scripted `QueryModelDriver` whose forced-respond turn carries `payload`. */
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

/** Parse a `.theta` source and return its body's `schema` declarations. */
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = { path: "triage.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The shipped-shape triage schema (mirrors docs/examples/handle-error.theta). */
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
 * the shipped producer composes it, over a scripted respond-repair follow-up
 * sequence. `followUps` are the raw reply strings the driven follow-up turns
 * would return.
 */
function buildTriageValidation(followUps: readonly string[]): {
  readonly validation: TypedQuerySchemaValidation;
  readonly lowered: LoweredSchema;
  readonly followUpCalls: () => number;
} {
  const schemas = schemaDeclsOf(TRIAGE_SOURCE);
  const lowered = lowerQueryResponseSchema("Triage", schemas);
  if (lowered === undefined) {
    throw new Error("Triage schema failed to lower — parser did not retain the schema body");
  }
  const state = { calls: 0 };
  const validation = buildTypedQueryValidation({
    lowered,
    schemaValidator: ajv(),
    attempts: followUps.length,
    maxRounds: 0,
    driveFollowUp: () => {
      const reply = followUps[state.calls] ?? "{}";
      state.calls += 1;
      return Promise.resolve(reply);
    },
  });
  return { validation, lowered, followUpCalls: () => state.calls };
}

// ===========================================================================
// (a) A conforming object binds Ok(value).
// ===========================================================================

describe("e2e-S3 — typed query: conforming reply binds Ok(value) (QRY-22)", () => {
  it("a reply that validates against the lowered Triage schema binds as the typed value", async () => {
    const { validation } = buildTriageValidation([]);
    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel({ category: "question", urgent: false }),
      config(),
      validation,
    );
    expect(outcome.kind).toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual({ category: "question", urgent: false });
    }
  });
});

// ===========================================================================
// (b) CAND-1 reduction — a NON-OBJECT reply surfaces the exact AJV `"must be
// object"` validation Err, never a bound value. This is the deterministic
// mirror of the live H8a / acceptance `"must be object"` observation.
// ===========================================================================

describe("e2e-S3 — CAND-1: a non-object reply surfaces Err(validation/schema_validation) with the AJV \"must be object\" issue (REQ-QRY-36)", () => {
  // The three non-object payload shapes the forced-respond turn can carry: a
  // bare `null` (the live Defect-B smoke), a prose string (a model that ignored
  // the forced tool and replied in text), and a bare number.
  for (const [label, payload] of [
    ["null", null],
    ["prose string", "The sky is blue."],
    ["number", 42],
  ] as const) {
    it(`a ${label} reply is NOT bound — it surfaces validation/schema_validation carrying keyword "type" / "must be object"`, async () => {
      const { validation } = buildTriageValidation([]);
      const outcome = await runTypedQueryLoop(
        NOOP_CHECKPOINT,
        liveSignal(),
        new RespondingModel(payload),
        config(),
        validation,
      );
      // REQ-QRY-36: an unvalidated response is never bound.
      expect(outcome.kind, `a ${label} reply must not bind as the value`).toBe("validation");
      if (outcome.kind !== "validation") return;
      expect(outcome.error.kind).toBe("validation");
      expect(outcome.error.cause).toBe("schema_validation");
      // The leading ValidationIssue is exactly the AJV `type` / "must be object"
      // the live suites report as CAND-1 — proving the theta lowering is correct
      // and the message is theta rejecting a non-object, not a lowering defect.
      const first = outcome.error.validation_errors[0];
      expect(first?.schema_keyword).toBe("type");
      expect(first?.message).toBe("must be object");
    });
  }
});

// ===========================================================================
// (c) A non-conforming object routes through respond-repair; a re-validated
// follow-up binds the corrected value (QRY-11).
// ===========================================================================

describe("e2e-S3 — typed query: respond-repair recovers a non-conforming object (QRY-11)", () => {
  it("a wrong-shape object routes through respond-repair and a conforming follow-up binds the corrected value", async () => {
    // Initial reply: an out-of-enum category and a missing `urgent` field, plus
    // an undeclared property — the exact non-conformance the manual smoke saw.
    const built = buildTriageValidation(['{"category":"bug","urgent":true}']);
    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel({ category: "inspected", notes: "x" }),
      config(),
      built.validation,
    );
    expect(outcome.kind, "a corrected follow-up binds the value").toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual({ category: "bug", urgent: true });
    }
    expect(built.followUpCalls(), "exactly one respond-repair follow-up drove").toBe(1);
  });
});

// ===========================================================================
// (d) An unrecoverable reply — every follow-up still non-conforming — surfaces
// the terminal Err(validation / schema_validation) after exhausting attempts.
// ===========================================================================

describe("e2e-S3 — typed query: unrecoverable non-conformance surfaces terminal Err (QRY-11 / REQ-QRY-30)", () => {
  it("when every follow-up stays non-conforming the query surfaces Err(validation/schema_validation) and consumes its attempts", async () => {
    // Two follow-up slots, both replying with a still-non-conforming object.
    const built = buildTriageValidation([
      '{"category":"nope"}',
      '{"still":"wrong"}',
    ]);
    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel({ category: "nope" }),
      config(),
      built.validation,
    );
    expect(outcome.kind).toBe("validation");
    if (outcome.kind === "validation") {
      expect(outcome.error.kind).toBe("validation");
      expect(outcome.error.cause).toBe("schema_validation");
    }
    // Both respond-repair follow-up slots were consumed before terminal
    // exhaustion (QRY-11 bounded by respond_repair.attempts).
    expect(built.followUpCalls()).toBe(2);
  });
});
