// Shared forced-respond typed-query scaffold for the bug-0352/0353 witnesses
// (PTQ-0439). The real parser, schema lowerer, AJV validator and respond-repair
// stack run against a scripted opener and repeatable follow-up.

import type {
  ForcedRespondTurn,
  FreePhaseTurn,
  QueryModelDriver,
  QueryToolLoopConfig,
  TypedQueryOutcome,
  TypedQuerySchemaValidation,
} from "../../src/runtime/query-tool-loop";
import {
  buildTypedQueryValidation,
  type FollowUpRespondOutcome,
} from "../../src/runtime/typed-query-validation";
import { lowerQueryResponseSchema } from "../../src/runtime/query-schema-lowering";
import {
  DEPTH_VIOLATION_MESSAGE,
  DEPTH_VIOLATION_SCHEMA_KEYWORD,
} from "../../src/runtime/depth-walk";
import type { AjvSchemaValidator, LoweredSchema } from "../../src/seams/schema-validator";
import type { SchemaDecl } from "../../src/parser/theta-document";
import type { ValidationIssue } from "../../src/runtime/query-error";
import { ajv as sharedAjv, schemaDeclsOf as sharedSchemaDeclsOf, forcedRespondConfig } from "./typed-query-harness";

export { NOOP_CHECKPOINT, liveSignal } from "./typed-query-harness";

export function config(invocationId: string): QueryToolLoopConfig {
  // A typed query at `max_rounds: 0` fires the forced-respond terminator as its
  // only turn (QRY-14) — the scripted model supplies only that turn, and the
  // follow-up rides the injected `driveFollowUp`.
  return forcedRespondConfig({
    querySite: { file: "probe.theta", line: 1, column: 1 },
    thetaSlashName: "/probe",
    invocationId,
    occurredAt: 0,
  });
}

/**
 * A scripted model whose SINGLE forced-respond turn is whatever opener a cell
 * needs — a `respond` payload (a depth breach opens repair post-fix; an
 * AJV-invalid-but-depth-legal payload opens repair on the AJV arm) or an ERR-17
 * `noncompliance` report (the noncompliance arm).
 */
export class OpeningModel implements QueryModelDriver {
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
export function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  return sharedSchemaDeclsOf(src, "probe.theta");
}

/** The production AJV validator with the scripted fixture's schema slug. */
export function ajv(): AjvSchemaValidator {
  return sharedAjv("probe");
}

/** A `FollowUpRespondOutcome` delivering `payload` through the shipped payload arm. */
export function payloadFollowUp(payload: unknown): FollowUpRespondOutcome {
  return { kind: "respond_outcome", turn: { kind: "payload", payload } };
}

/**
 * Build the production `TypedQuerySchemaValidation` for `annotation` against
 * `decls`, driving each respond-repair follow-up with `follow` through the
 * two-phase-restart payload arm. `driveFollowUp` returns `follow` on EVERY call,
 * so the same scripted follow-up is re-returned up to `budget` times, stopping
 * when a conforming follow-up binds. `budget` counts follow-up slots
 * (`respond_repair.attempts`).
 */
export function buildValidation(
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
export function describeOutcome(outcome: TypedQueryOutcome, includeAttempts = true): string {
  if (outcome.kind === "value") {
    return `kind=value value=${JSON.stringify(outcome.value)}`;
  }
  if (outcome.kind === "validation") {
    const attempts = includeAttempts ? ` attempts=${outcome.error.attempts}` : "";
    return `kind=validation${attempts} validation_errors=${JSON.stringify(outcome.error.validation_errors)}`;
  }
  return `kind=${outcome.kind}`;
}

/** The canonical depth-violation issue's constants (depth-walk.ts). */
export function isDepthIssue(issue: ValidationIssue | undefined): boolean {
  return (
    issue !== undefined &&
    issue.message === DEPTH_VIOLATION_MESSAGE &&
    issue.schema_keyword === DEPTH_VIOLATION_SCHEMA_KEYWORD
  );
}
