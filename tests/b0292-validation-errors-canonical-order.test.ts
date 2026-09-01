// Bug 0292 — `ValidationError.validation_errors` must be emitted in the ERR-14
// canonical order (a stable ascending sort keyed on the tuple
// (`path`, `schema_keyword`, `message`), each field compared by Unicode code
// point), so `validation_errors[0]` is well-defined for author `match` code and
// conformance tests. ERR-14
// (docs/spec_topics/errors-and-results/queryerror-variants.md:56) assigns that
// order to the mapping site — "the runtime applies this canonical order when
// mapping those errors into `ValidationIssue` entries".
//
// `validateAgainst` (src/runtime/typed-query-validation.ts:319) maps AJV's
// `result.errors` into `ValidationIssue[]` positionally (the `.map` at
// src/runtime/typed-query-validation.ts:329); at fork it returned that mapping
// without the ERR-14 sort, so the author-visible array carried AJV's native
// emission sequence (schema-declaration / `required`-array order) instead.
// Bug 0292's fix (0.333.0) wraps the return in `orderValidationIssues`
// (src/runtime/typed-query-validation.ts:334-340). The shipped sort
// `orderValidationIssues` (src/runtime/query-error.ts:197) is reached by the
// `<ajv-summary>` renderer (src/runtime/query-followup-render.ts:121) but not by
// the value-construction site.
//
// The probe schema declares `b` before `a`, so AJV's native order (b-first)
// differs from the canonical order (a-first): every multi-issue cell here
// distinguishes the two. Cells (A), (B), (E) are RED at this HEAD because the
// array arrives in raw AJV order; cells (C), (D) are the controls that must stay
// GREEN across the fix — a single-issue array cannot reorder, and the renderer
// path the fix does not touch already sorts.
//
// Substrate mirrors tests/e2e-s3-typed-query-conformance.test.ts (the
// production typed-query loop over the real parser, lowering, AjvSchemaValidator
// and respond-repair — no live provider).

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
import type { ValidationIssue } from "../src/runtime/query-error";

// --- Substrate (mirrors e2e-s3) --------------------------------------------

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
  // only turn (QRY-14) — no free-phase provider call.
  return {
    maxRounds: 0,
    querySite: { file: "pair.theta", line: 1, column: 1 },
    thetaSlashName: "/pair",
    invocationId: "inv-b0292",
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
  const source: ThetaSource = { path: "pair.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "pair",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

// Declaration order `b` then `a`: AJV's native emission (`required`-array /
// declaration order) is b-first, the ERR-14 canonical order is a-first, so the
// two orders are distinguishable on every multi-issue failure.
const PAIR_SOURCE = ["schema Pair {", "  b: string,", "  a: string", "}"].join("\n");

/**
 * Build the production `TypedQuerySchemaValidation` for `@<Pair>` exactly as the
 * shipped producer composes it, capturing each rendered respond-repair follow-up
 * prompt so cell (D) can inspect the `<ajv-summary>` the renderer emits.
 */
function buildPairValidation(followUps: readonly string[]): {
  readonly validation: TypedQuerySchemaValidation;
  readonly followUpPrompts: () => readonly string[];
} {
  const schemas = schemaDeclsOf(PAIR_SOURCE);
  const lowered = lowerQueryResponseSchema("Pair", schemas);
  if (lowered === undefined) {
    throw new Error("Pair schema failed to lower — parser did not retain the schema body");
  }
  const prompts: string[] = [];
  const state = { calls: 0 };
  const validation = buildTypedQueryValidation({
    lowered,
    resolveShape: () => schemas.find((s) => s.name === "Pair"),
    schemaValidator: ajv(),
    attempts: followUps.length,
    maxRounds: 0,
    driveFollowUp: (prompt: string) => {
      prompts.push(prompt);
      const reply = followUps[state.calls] ?? "{}";
      state.calls += 1;
      return Promise.resolve(reply);
    },
  });
  return { validation, followUpPrompts: () => prompts };
}

/** Drive one forced-respond payload through the real loop; require it to fail
 * validation (the precondition every ordering cell rests on) and hand back the
 * author-visible `validation_errors`. */
async function validationErrorsFor(
  payload: unknown,
  followUps: readonly string[] = [],
): Promise<readonly ValidationIssue[]> {
  const { validation } = buildPairValidation(followUps);
  const outcome = await runTypedQueryLoop(
    NOOP_CHECKPOINT,
    liveSignal(),
    new RespondingModel(payload),
    config(),
    validation,
  );
  if (outcome.kind !== "validation") {
    throw new Error(
      `precondition unmet: payload ${JSON.stringify(payload)} must fail schema validation, got outcome.kind=${outcome.kind}`,
    );
  }
  expect(outcome.error.cause).toBe("schema_validation");
  return outcome.error.validation_errors;
}

// The ERR-14 canonical orderings for the two multi-issue probes: `a` before `b`
// on both the `required` failure (sort key falls to `message`) and the `type`
// failure (sort key is `path`, `/a` before `/b`).
const CANONICAL_REQUIRED: readonly ValidationIssue[] = [
  { path: "", message: "must have required property 'a'", schema_keyword: "required" },
  { path: "", message: "must have required property 'b'", schema_keyword: "required" },
];
const CANONICAL_TYPE: readonly ValidationIssue[] = [
  { path: "/a", message: "must be string", schema_keyword: "type" },
  { path: "/b", message: "must be string", schema_keyword: "type" },
];

// ===========================================================================
// (A) Two missing `required` properties: the array must be the canonical
// a-required-first order. RED at this HEAD (AJV emits b-required first).
// ===========================================================================

describe("bug 0292 — validation_errors: two missing required properties are canonically ordered (ERR-14)", () => {
  it("payload `{}` surfaces validation_errors sorted a-required before b-required", async () => {
    const issues = await validationErrorsFor({});
    expect(issues).toEqual(CANONICAL_REQUIRED);
  });
});

// ===========================================================================
// (B) Two wrong-type properties: the array must be sorted by `path`, `/a`
// before `/b`. RED at this HEAD (AJV emits `/b` first).
// ===========================================================================

describe("bug 0292 — validation_errors: two type failures are canonically ordered by path (ERR-14)", () => {
  it("payload `{ b: 1, a: 2 }` surfaces validation_errors sorted /a before /b", async () => {
    const issues = await validationErrorsFor({ b: 1, a: 2 });
    expect(issues).toEqual(CANONICAL_TYPE);
  });
});

// ===========================================================================
// (C) Single-issue control: a one-element array cannot reorder, so it is
// GREEN at this HEAD and byte-identical after the fix. `{ b: "x" }` fails on
// exactly the one missing `a`.
// ===========================================================================

describe("bug 0292 — control: a single-issue validation_errors array is order-invariant", () => {
  it("payload `{ b: \"x\" }` surfaces exactly one issue, unchanged by ordering", async () => {
    const issues = await validationErrorsFor({ b: "x" });
    expect(issues).toHaveLength(1);
    expect(issues).toEqual([
      { path: "", message: "must have required property 'a'", schema_keyword: "required" },
    ]);
  });
});

// ===========================================================================
// (D) Renderer control: the QRY-12 follow-up `<ajv-summary>` already routes
// through orderValidationIssues (src/runtime/query-followup-render.ts:121), so
// it lists `a` before `b` here. The fix wraps only the value-construction site
// (src/runtime/typed-query-validation.ts:334-340), so this rendered prompt is
// byte-identical pre- and post-fix — this cell is the byte-identical-pre/post
// control proving the renderer path is untouched.
// ===========================================================================

describe("bug 0292 — control: the follow-up <ajv-summary> already lists issues canonically", () => {
  it("the rendered respond-repair follow-up orders `a` before `b`", async () => {
    // Opening payload `{}` seeds the follow-up's summary with both `required`
    // issues; a still-non-conforming follow-up reply forces the QRY-12 render.
    const { validation, followUpPrompts } = buildPairValidation(['{"still":"wrong"}']);
    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel({}),
      config(),
      validation,
    );
    if (outcome.kind !== "validation") {
      throw new Error(
        "precondition unmet: the opening {} must fail validation so a follow-up renders, got outcome.kind=" +
          outcome.kind,
      );
    }
    const prompts = followUpPrompts();
    if (prompts.length === 0) {
      throw new Error("precondition unmet: no respond-repair follow-up was rendered");
    }
    const summary = prompts[0];
    if (summary === undefined) {
      throw new Error("precondition unmet: followUpPrompts()[0] is undefined despite a non-empty array");
    }
    const aAt = summary.indexOf("must have required property 'a'");
    const bAt = summary.indexOf("must have required property 'b'");
    if (aAt < 0 || bAt < 0) {
      throw new Error(`precondition unmet: follow-up <ajv-summary> missing an issue: ${JSON.stringify(summary)}`);
    }
    expect(aAt).toBeLessThan(bAt);
  });
});

// ===========================================================================
// (E) Determinism control: the same drive run twice must yield the identical
// array (run1 deep-equals run2) AND that array must be the canonical order.
// The determinism half is GREEN at this HEAD (AJV order is stable); the
// canonical half is RED at this HEAD for the same reason as (A). Post-fix both
// halves are GREEN.
// ===========================================================================

describe("bug 0292 — determinism: repeated drives yield the identical canonical array", () => {
  it("payload `{}` twice yields deep-equal validation_errors, canonically ordered", async () => {
    const run1 = await validationErrorsFor({});
    const run2 = await validationErrorsFor({});
    expect(run1).toEqual(run2);
    expect(run1).toEqual(CANONICAL_REQUIRED);
  });
});
