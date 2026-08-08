import { describe, expect, it } from "vitest";
import {
  fillDefaultsAndRevalidate,
  type FillDefaultsResult,
  type PostMergeValidation,
} from "../src/binder/defaulting";
import type { BinderArgsClassification } from "../src/binder/retry-taxonomy";
import { DEPTH_VIOLATION_MESSAGE, jsonDepth, MAX_JSON_DEPTH } from "../src/runtime/depth-walk";
import {
  AjvSchemaValidator,
  type CompiledValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

// Bug 0066 — the post-default-merge AJV validation hook
// (`fillDefaultsAndRevalidate`, src/binder/defaulting.ts) runs NO depth walk:
// it goes straight to `input.validator.validate(merged)`. `rg -n "depthWalk\("
// src/binder/` returns nothing, JSON Schema 2020-12 has no `maxDepth` keyword,
// and the classifier written for this boundary (`classifyBinderArgs`,
// src/binder/retry-taxonomy.ts) has no caller in `src/` — so hard-ceiling #4's
// slash-load `params` enforcement point does not exist in production and a
// depth-6 merged `args` document validates clean
// (docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md).
//
// THIS FILE IS THE LEAF HALF of the witness: the depth-walk ordering, the
// summary form, and the `ValidationError[]` → `ValidationIssue` projection, all
// observable on `fillDefaultsAndRevalidate`'s own return value. The `runBinder`
// routing lives in tests/binder-post-merge-ajv-enforcement.test.ts and the
// load-time companion gate in tests/params-default-type-compat.test.ts.
// tests/defaulting-revalidation.test.ts pins this leaf's fill-if-absent halves
// and is untouched — this file adds only the classification the caller reads.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:11 — the named
//     hook, and "Per Schema Subset — Depth Enforcement the depth-walk runs
//     *first* at this site (it is enforcement point #4 in that section's
//     per-boundary table), so a depth-6 merged `args` payload short-circuits the
//     AJV step and produces a depth-walk failure that is classified into the
//     AJV-on-`args` retry class".
//   - docs/spec_topics/schema-subset.md:44 (enforcement point #4 — "`params`
//     validation at theta invocation"), :47 ("The walk runs **before** AJV at
//     each site"), :49 (the canonical `maxDepth` / `"JSON document depth
//     exceeds 5"` error shape), :65 ("The walk is still installed at the
//     `params` boundary unchanged").
//   - docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:19 (every breach
//     surfaces with `schema_keyword: "maxDepth"` and the canonical message),
//     :39 (CIO-1 — the slash-load `params` arm is routed by ceiling #3's
//     failure-mode templates), :41 (CIO-3 — the depth-walk runs before AJV at
//     the same site).
//   - docs/spec_topics/binder/determinism-cancellation-failure.md:35 (the
//     AJV-on-`args` class and its depth-walk fast-fail sub-case), :42 (the
//     `<ajv-summary>` placeholder: each entry rendered `<path> <message>` and
//     joined by the two-character `; ` in canonical `validation_errors` order,
//     plus the depth-walk clause's single-issue form with no separator).
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix constraints 1, 2, 4):
//   1. The depth walk runs at this hook BEFORE the AJV call, over the MERGED
//      `args` — either inside `fillDefaultsAndRevalidate` or immediately ahead
//      of it.
//   2. The classification is `classifyBinderArgs` over `{ depth, ajvIssues }`;
//      the validator's `ValidationError[]` maps to `ValidationIssue` for
//      `renderAjvSummary`.
//   4. A depth breach renders `<JSON-Pointer> JSON document depth exceeds 5` —
//      the single-issue form, no `; ` separator — and AJV does not run.
//
// MEASURED SIGNATURES AT HEAD (offline, deterministic; re-derived by probe
// before this file was added, then deleted per probe policy).
// `fillDefaultsAndRevalidate` over the depth-6 merged document
// `{p:{a:{b:{c:{d:{e:1}}}}}}` calls the validator ONCE and returns
// `{"args":{…},"defaultedWireNames":[…],"validation":{"ok":true}}` against a
// permissive `{"type":"object"}` fragment — no `maxDepth` issue, no
// `"JSON document depth exceeds 5"`. Against the real AJV validator and
// `{a:integer,b:integer}` the two-issue merged document `{a:"one",b:"two"}`
// yields `errors` in the order `/a` then `/b`, each with `message` `"must be
// integer"`.
//
// WHAT IS RED HERE AND WHY: every cell, because `FillDefaultsResult` carries no
// `classification` at HEAD — the verdict is surfaced and the caller is left to
// classify it, and no caller does. The at-limit NEGATIVE cell reds for the same
// structural reason rather than for an over-fire; its post-fix job is to red if
// the walk ever fires one level early.
//
// TIER: unit, offline, deterministic, provider-free. The subject is one pure
// function's return value over a materialised JSON document plus an injected
// validator; nothing above this tier can observe the AJV-did-not-run ordering at
// all (a `runBinder` drive sees only the routed note, which
// tests/binder-post-merge-ajv-enforcement.test.ts pins).
//
// NO SILENT SKIPPING: `classificationOf` THROWS naming the whole returned result
// when the field is absent, so a missing classification reds as a named harness
// failure and never degrades into a comparison against `undefined`; the fixture
// depths are asserted against the shipped `jsonDepth` before they are used.

// ===========================================================================
// Reading the post-fix return shape without breaking the HEAD one.
// ===========================================================================

/**
 * The classification `fillDefaultsAndRevalidate` returns alongside the merged
 * args (§Fix constraint 2). Read through a structural view rather than off
 * `FillDefaultsResult` directly: the field is the post-fix addition to that
 * interface, so a direct property read would not compile against the shape in
 * the tree today and this file's reds would be build failures instead of
 * assertion failures.
 */
function classificationOf(result: FillDefaultsResult): BinderArgsClassification {
  const view = result as { readonly classification?: BinderArgsClassification };
  const classification = view.classification;
  if (classification === undefined) {
    throw new Error(
      "the post-default-merge hook returned no `classification`: the AJV/depth verdict is " +
        "computed and left unclassified, so no caller can route it (bug 0066 §Fix constraint 2). " +
        `Returned: ${JSON.stringify(result)}`,
    );
  }
  return classification;
}

/**
 * A spy `CompiledValidator`: records every value handed to `validate()` and
 * returns a fixed verdict. `calls.length === 0` is the CIO-3 observable — AJV
 * did not run because the depth walk short-circuited ahead of it.
 */
function spyValidator(result: PostMergeValidation): {
  readonly validator: CompiledValidator;
  readonly calls: unknown[];
} {
  const calls: unknown[] = [];
  const validator: CompiledValidator = {
    validate(value: unknown) {
      calls.push(value);
      return result;
    },
  };
  return { validator, calls };
}

/**
 * The production AJV validator over one lowered fragment, wired with the same
 * JSON.stringify content-addressing the shipped composition root uses — so the
 * `ValidationError[]` the projection consumes is the real validator's, in the
 * real validator's own emission order.
 */
function realValidator(schema: LoweredSchema): CompiledValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (document: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(document);
      return { slug: canonicalBytes, canonicalBytes };
    },
  }).compile(schema);
}

/** The `<ajv-summary>` a `ValidationError[]` projects to (`renderAjvSummary`). */
function joinedSummary(validation: PostMergeValidation): string {
  if (validation.ok) {
    throw new Error(
      "the expected-summary oracle needs a FAILED verdict to project; the validator accepted the merged args",
    );
  }
  return validation.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ");
}

// ===========================================================================
// Fixtures. Every depth is asserted against the shipped `jsonDepth` (scalar or
// empty container → 1, non-empty → 1 + max child) before it is relied on, so a
// fixture that drifts out of (or into) breach reds on its own oracle first.
// ===========================================================================

/** The declared default whose filled value breaches the cap by one level. */
const DEEP_DEFAULT_VALUE = { a: { b: { c: { d: { e: 1 } } } } } as const;

/** The merged document both breach cells produce, and its breach pointer. */
const DEPTH_6_MERGED = { p: DEEP_DEFAULT_VALUE } as const;
const DEPTH_6_BREACH_POINTER = "/p/a/b/c/d";

/** The exactly-at-limit merged document (`jsonDepth` 5 — inside `depth ≤ 5`). */
const AT_LIMIT_MERGED = { p: { a: { b: { c: 1 } } } } as const;

/** The permissive `params`-shaped fragment the breach cells validate against. */
const PERMISSIVE_PARAMS_SCHEMA: LoweredSchema = {
  type: "object",
  properties: { p: { type: "object" } },
  required: ["p"],
  additionalProperties: false,
};

/** A two-integer-field fragment: the multi-issue AJV projection's subject. */
const TWO_INTEGER_SCHEMA: LoweredSchema = {
  type: "object",
  properties: { a: { type: "integer" }, b: { type: "integer" } },
  required: ["a", "b"],
  additionalProperties: false,
};

// ===========================================================================
// (a) CIO-3 — THE DEPTH WALK RUNS BEFORE AJV, OVER THE MERGED ARGS.
// RED at HEAD: no walk exists at this hook, so the merged document reaches AJV
// and (AJV having no `maxDepth` keyword) validates clean.
// ===========================================================================

describe("bug 0066 (a) — a depth-6 MERGED args document fast-fails ahead of AJV", () => {
  it("RED (a1): the breach arrives via the FILLED DEFAULT and is classified with the depth-walk summary", () => {
    // The binder args alone are within the cap — the depth arrives only once the
    // runtime has filled the declared default. A walk placed over `binderArgs`
    // instead of over the merge would pass this cell, which is what makes it the
    // pin for defaulting-system-note-echo.md:11's "the merged `args` object".
    expect(
      jsonDepth({}),
      "the binder-supplied half must be within the cap so the breach is attributable to the merge",
    ).toBeLessThanOrEqual(MAX_JSON_DEPTH);
    expect(
      jsonDepth(DEPTH_6_MERGED),
      "the merged document must exceed the cap for the walk to have a subject",
    ).toBeGreaterThan(MAX_JSON_DEPTH);

    const { validator, calls } = spyValidator({ ok: true });
    const result = fillDefaultsAndRevalidate({
      binderArgs: {},
      defaults: [{ wireName: "p", defaultValue: DEEP_DEFAULT_VALUE }],
      validator,
    });

    // THE PRIMARY ASSERTION, first so the red names the missing enforcement
    // rather than a downstream shape. §Fix constraint 4 / ceilings-3-and-4.md:19
    // — the single canonical issue rendered `<JSON-Pointer> <message>`.
    expect(
      classificationOf(result),
      "schema-subset.md:44 names `params` validation as enforcement point #4 and :47 pins the walk before AJV at each site; the breach cross-routes (CIO-1) into the AJV-on-`args` class carrying the depth-walk's canonical issue",
    ).toEqual({
      kind: "ajv_args",
      ajvSummary: `${DEPTH_6_BREACH_POINTER} ${DEPTH_VIOLATION_MESSAGE}`,
    });

    // The single-issue form (determinism-cancellation-failure.md:42's depth-walk
    // clause): AJV did not run, so there is no issue LIST to join and no `; `.
    const summary = (classificationOf(result) as { readonly ajvSummary: string }).ajvSummary;
    expect(
      summary.includes("; "),
      "the depth-walk fast-fail is the single-issue form — a `; ` separator would mean the summary was built by an `errorsText` traversal of the (empty) AJV `errors` array",
    ).toBe(false);

    // CIO-3's ordering, as a fact about the validator rather than about the
    // rendered string: the walk short-circuits, so AJV is never invoked.
    expect(
      calls,
      "ceilings-3-and-4.md:41 — the depth-walk runs BEFORE AJV at the same site, so a breach means the validator is not called at all (schema-subset.md:47: \"a cheap fast-fail [that] avoids feeding pathologically deep payloads into the validator\")",
    ).toEqual([]);
    expect(
      result.validation,
      "AJV did not run, so the verdict is a failure with an EMPTY errors array — the summary is synthesised from the depth-walk issue instead",
    ).toEqual({ ok: false, errors: [] });

    // The leaf's own fill-if-absent contract is untouched by the added walk.
    expect(
      result.args,
      "the merge still happens — the classification is what the caller routes on, not a replacement for the merged args",
    ).toEqual(DEPTH_6_MERGED);
    expect(result.defaultedWireNames).toEqual(["p"]);
  });

  it("RED (a2): the breach arrives in the BINDER's own args and is classified the same way", () => {
    // The no-defaults reach of the same hook (§Fix constraint 5's leaf half):
    // enforcement point #4 is about the `params` boundary, so a document that
    // arrives already too deep is refused with no default in play.
    const { validator, calls } = spyValidator({ ok: true });
    const result = fillDefaultsAndRevalidate({
      binderArgs: DEPTH_6_MERGED,
      defaults: [],
      validator,
    });

    expect(
      classificationOf(result),
      "the walk is installed at the `params` boundary unchanged (schema-subset.md:65), independent of whether the theta declares any default",
    ).toEqual({
      kind: "ajv_args",
      ajvSummary: `${DEPTH_6_BREACH_POINTER} ${DEPTH_VIOLATION_MESSAGE}`,
    });
    expect(calls, "AJV still does not run on a breach").toEqual([]);
  });

  it("RED (a3, negative): an exactly-at-limit merged document classifies `ok` and reaches AJV", () => {
    // The over-fire fence. The counting rule is the shipped one (`jsonDepth`,
    // src/runtime/depth-walk.ts): a scalar or empty container is depth 1 and a
    // non-empty object is 1 + max child, so this four-key nest sits AT 5 and the
    // cap is `depth ≤ 5`. A walk that refused it would refuse every `params`
    // document one level shallower than the spec admits.
    expect(
      jsonDepth(AT_LIMIT_MERGED),
      "the negative fixture must sit exactly AT the cap for the boundary to be the subject",
    ).toBe(MAX_JSON_DEPTH);

    const { validator, calls } = spyValidator({ ok: true });
    const result = fillDefaultsAndRevalidate({
      binderArgs: {},
      defaults: [{ wireName: "p", defaultValue: AT_LIMIT_MERGED["p"] }],
      validator,
    });

    expect(
      classificationOf(result),
      "a document inside the cap is `ok` — the walk contributes nothing and the AJV verdict decides",
    ).toEqual({ kind: "ok" });
    expect(
      calls,
      "no breach means the walk falls through and AJV runs on the MERGED args exactly as it does today",
    ).toEqual([AT_LIMIT_MERGED]);
    expect(result.validation).toEqual({ ok: true });
  });
});

// ===========================================================================
// (b) THE `ValidationError[]` → `ValidationIssue` PROJECTION (§Fix constraint 2).
// RED at HEAD: nothing projects the verdict, so no `<ajv-summary>` exists.
// ===========================================================================

describe("bug 0066 (b) — the AJV verdict projects to the `; `-joined `<ajv-summary>`", () => {
  it("RED (b1): a multi-issue failure joins the validator's own issues in the validator's own order", () => {
    // The REAL production validator, so the projected issues are the ones
    // production would carry. The expected string is BOTH stated (the measured
    // bytes) and DERIVED from `result.validation.errors` — the derivation is what
    // makes this a claim about order preservation rather than about two literals
    // agreeing, and the real validator's emission order for this fragment is
    // already the canonical `validation_errors` order
    // (determinism-cancellation-failure.md:42), so the two readings coincide and
    // the cell takes no position on a hypothetically unsorted validator.
    const result = fillDefaultsAndRevalidate({
      binderArgs: { a: "one" },
      defaults: [{ wireName: "b", defaultValue: "two" }],
      validator: realValidator(TWO_INTEGER_SCHEMA),
    });

    expect(
      classificationOf(result),
      "determinism-cancellation-failure.md:42 — each entry renders `<path> <message>` and the entries join by the two-character separator `; `",
    ).toEqual({
      kind: "ajv_args",
      ajvSummary: "/a must be integer; /b must be integer",
    });

    const summary = (classificationOf(result) as { readonly ajvSummary: string }).ajvSummary;
    expect(
      summary.split("; ").length,
      "the multi-issue fixture must actually carry two issues, or the separator claim is vacuous",
    ).toBe(2);
    expect(
      summary,
      "the projection preserves the validator's own issue order — the summary is the in-order join of exactly the `ValidationError[]` the same call surfaced on `validation.errors`",
    ).toBe(joinedSummary(result.validation));
  });

  it("RED (b2): a single-issue failure renders one `<path> <message>` with no separator", () => {
    // The control that separates "the separator is present when there are two
    // issues" from "the separator is always emitted": the depth-walk clause's
    // no-separator form must not be the only separator-free shape.
    const result = fillDefaultsAndRevalidate({
      binderArgs: { a: 1 },
      defaults: [{ wireName: "b", defaultValue: "two" }],
      validator: realValidator(TWO_INTEGER_SCHEMA),
    });

    expect(
      classificationOf(result),
      "one failing field yields one issue, rendered `<path> <message>`",
    ).toEqual({ kind: "ajv_args", ajvSummary: "/b must be integer" });
  });

  it("RED (b3): a clean merged document classifies `ok`", () => {
    // The green-path arm of the same classification, so a post-fix
    // implementation that classified every merge as `ajv_args` reds here rather
    // than shipping a binder that never binds.
    const result = fillDefaultsAndRevalidate({
      binderArgs: { a: 1 },
      defaults: [{ wireName: "b", defaultValue: 2 }],
      validator: realValidator(TWO_INTEGER_SCHEMA),
    });

    expect(
      classificationOf(result),
      "a merged document the lowered `params:` schema admits is `ok`, and the theta runs",
    ).toEqual({ kind: "ok" });
    expect(result.validation).toEqual({ ok: true });
  });
});
