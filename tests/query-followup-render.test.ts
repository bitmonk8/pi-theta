// V13h-T — failing tests for the paired `V13h` respond-repair follow-up turn
// template rendering (query/query-failure-and-repair.md QRY-12;
// errors-and-results/queryerror-variants.md ERR-14).
//
// Each test drives the live renderer (`renderFollowUpTurn`) and reds on its own
// primary byte-comparison assertion while `V13h` is absent: the stub returns the
// empty string, so the verbatim-template, lowered-schema-substitution, and
// most-recent-attempt-only `<ajv-summary>` expectations red on their own equality
// assertions rather than on a compile error, a missing fixture, or a harness
// throw. The respond-repair loop control flow and attempt accounting (QRY-11 /
// ERR-17) are owned by `V13d`, not this leaf.

import { describe, expect, it } from "vitest";
import {
  renderFollowUpTurn,
  type FollowUpTurnInput,
} from "../src/runtime/query-followup-render";
import { schemaSlug, type LoweredJsonValue } from "../src/parser/schema-lowering";
import { type ValidationIssue } from "../src/runtime/query-error";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

// The lowered JSON Schema handed to AJV (schema-subset.md); its
// `JSON.stringify(_, null, 2)` form is the `<schema-json>` interpolation.
const LOWERED_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
} as const;
const SCHEMA_JSON = JSON.stringify(LOWERED_SCHEMA, null, 2);

// A fixed slug so the byte-for-byte template assertions pin every other
// character of the rendered turn.
const SLUG = "abc123def4567890";

// Two `ValidationIssue` entries supplied out of canonical order (path "/b"
// before "/a") so the canonical ERR-14 order (ascending on path) is observable
// in `<ajv-summary>`.
const UNORDERED_ISSUES: readonly ValidationIssue[] = [
  { path: "/b", message: "must be string", schema_keyword: "type" },
  { path: "/a", message: "is required", schema_keyword: "required" },
];
// Canonical ERR-14 order: "/a" sorts before "/b"; the summary joins
// `<path> <message>` by "; ".
const CANONICAL_AJV_SUMMARY = "/a is required; /b must be string";

function input(overrides: Partial<FollowUpTurnInput>): FollowUpTurnInput {
  return {
    methodology: "validator_error",
    loweredSchema: LOWERED_SCHEMA,
    slug: SLUG,
    issues: UNORDERED_ISSUES,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// QRY-12 — verbatim templates (both non-`none` methodologies).
// ---------------------------------------------------------------------------

describe("QRY-12 — respond-repair follow-up turn templates render byte-for-byte", () => {
  it("QRY-12: `validator_error` renders its follow-up user turn byte-for-byte, backticks and trailing U+000A included", () => {
    // Constructed character-by-character: the fixed template text, the literal
    // U+0060 backticks around `__loom_respond_<slug>`, the single U+000A between
    // the instruction sentence and `<schema-json>`, and the trailing U+000A.
    const expected =
      "Your previous response did not match the required schema. " +
      "Validation errors: " +
      CANONICAL_AJV_SUMMARY +
      ". Return your final answer using the `__loom_respond_" +
      SLUG +
      "` tool, conforming to this schema:\n" +
      SCHEMA_JSON +
      "\n";

    const rendered = renderFollowUpTurn(input({ methodology: "validator_error" }));

    expect(rendered).toBe(expected); // QRY-12
    // The trailing byte is the mandated U+000A after `<schema-json>`.
    expect(rendered.endsWith(SCHEMA_JSON + "\n")).toBe(true); // QRY-12
    // The tool reference is wrapped in literal U+0060 backticks.
    expect(rendered).toContain("`__loom_respond_" + SLUG + "`"); // QRY-12
  });

  it("QRY-12: `schema_repeat` renders its follow-up user turn byte-for-byte (no `<ajv-summary>` clause), backticks and trailing U+000A included", () => {
    const expected =
      "Your previous response did not match the required schema. " +
      "Return your final answer using the `__loom_respond_" +
      SLUG +
      "` tool, conforming to this schema:\n" +
      SCHEMA_JSON +
      "\n";

    const rendered = renderFollowUpTurn(input({ methodology: "schema_repeat" }));

    expect(rendered).toBe(expected); // QRY-12
    // `schema_repeat` carries no "Validation errors:" clause and no ajv-summary.
    expect(rendered).not.toContain("Validation errors:"); // QRY-12
    expect(rendered).not.toContain(CANONICAL_AJV_SUMMARY); // QRY-12
    expect(rendered.endsWith(SCHEMA_JSON + "\n")).toBe(true); // QRY-12
  });
});

// ---------------------------------------------------------------------------
// QRY-12 — `<schema-json>` / `<slug>` are the lowered response schema's forms.
// ---------------------------------------------------------------------------

describe("QRY-12 — `<schema-json>` is JSON.stringify(lowered, null, 2) and `<slug>` is the lowered schema slug", () => {
  it("QRY-12: `<schema-json>` is `JSON.stringify(schema, null, 2)` over the lowered response schema, not the source-Loom-type form", () => {
    const rendered = renderFollowUpTurn(input({ methodology: "schema_repeat" }));

    // The interpolation is the two-space-indented JSON.stringify of the lowered
    // JSON Schema (the form handed to AJV) — its lowered keys are present, and it
    // is not a source-Loom-type serialisation.
    expect(rendered).toContain(JSON.stringify(LOWERED_SCHEMA, null, 2)); // QRY-12
    expect(rendered).toContain('"additionalProperties": false'); // QRY-12
    // The rendered turn ends with exactly the lowered schema-json plus U+000A.
    expect(rendered.endsWith(JSON.stringify(LOWERED_SCHEMA, null, 2) + "\n")).toBe(
      true,
    ); // QRY-12
  });

  it("QRY-12: `<slug>` equals the slug of the lowered response schema (same source-of-truth as `__loom_respond_<slug>`)", () => {
    // The lowered response schema's canonical fragment; its slug names both the
    // synthesised respond tool and the `<slug>` placeholder.
    const loweredCanonical: LoweredJsonValue = {
      kind: "object",
      entries: [
        { key: "type", value: { kind: "string", value: "object" } },
        {
          key: "required",
          value: { kind: "array", items: [{ kind: "string", value: "answer" }] },
        },
      ],
    };
    const expectedSlug = schemaSlug(loweredCanonical);

    const rendered = renderFollowUpTurn(
      input({ methodology: "schema_repeat", slug: expectedSlug }),
    );

    // The follow-up's tool reference is byte-equal to `__loom_respond_<slug>` of
    // the lowered schema slug.
    expect(rendered).toContain("`__loom_respond_" + expectedSlug + "`"); // QRY-12
  });
});

// ---------------------------------------------------------------------------
// QRY-12 / ERR-14 — most-recent-attempt-only `<ajv-summary>`, canonical order.
// ---------------------------------------------------------------------------

describe("QRY-12 — multi-attempt `<ajv-summary>` reflects only the most-recent failed attempt, canonical order", () => {
  it("QRY-12: on a 2-attempt sequence the second follow-up's `<ajv-summary>` carries only the most-recent attempt's issues in canonical ERR-14 order, never a cumulative concatenation", () => {
    const firstAttemptIssues: readonly ValidationIssue[] = [
      { path: "/first", message: "attempt one issue", schema_keyword: "type" },
    ];
    // Second attempt's issues, supplied out of canonical order.
    const secondAttemptIssues: readonly ValidationIssue[] = [
      { path: "/y", message: "second later", schema_keyword: "type" },
      { path: "/x", message: "second earlier", schema_keyword: "enum" },
    ];

    const firstRendered = renderFollowUpTurn(
      input({ methodology: "validator_error", issues: firstAttemptIssues }),
    );
    const secondRendered = renderFollowUpTurn(
      input({ methodology: "validator_error", issues: secondAttemptIssues }),
    );

    // Canonical ERR-14 order over the second attempt's issues: "/x" before "/y".
    const secondSummary = "/x second earlier; /y second later";
    const expectedSecond =
      "Your previous response did not match the required schema. " +
      "Validation errors: " +
      secondSummary +
      ". Return your final answer using the `__loom_respond_" +
      SLUG +
      "` tool, conforming to this schema:\n" +
      SCHEMA_JSON +
      "\n";

    expect(secondRendered).toBe(expectedSecond); // QRY-12 / ERR-14
    // Not cumulative: the second follow-up carries none of the first attempt's
    // issue text.
    expect(secondRendered).not.toContain("attempt one issue"); // QRY-12
    expect(secondRendered).not.toContain("/first"); // QRY-12
    // The first follow-up in turn carried only its own attempt's issue.
    expect(firstRendered).toContain("/first attempt one issue"); // QRY-12
    expect(firstRendered).not.toContain("second"); // QRY-12
  });
});
