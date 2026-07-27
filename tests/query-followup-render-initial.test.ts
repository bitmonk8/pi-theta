// Bug 0010 — `renderInitialRespondTurn` byte-exact QRY-15 template
// (regression pins).
//
// docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md: the typed
// query's off-session forced respond turn carries a trailing `context.messages`
// user entry rendered from the QRY-15 template — the instruction sentence
// naming the synthesised `` `__theta_respond_<slug>` `` tool, a single U+000A,
// `JSON.stringify(lowered, null, 2)`, and a trailing U+000A
// (query/query-tool-loop.md QRY-15). The bug-0010 fix landed the renderer as
// the export `renderInitialRespondTurn` in
// src/runtime/query-followup-render.ts, SHARING the instruction builder with
// `renderFollowUpTurn` so the initial template is byte-identical to the
// `schema_repeat` follow-up minus the leading non-compliance sentence
// (QRY-12/QRY-15 template kinship — the tool reference and the registered
// tool name stay byte-equal because both renderers interpolate the same
// reference). Pre-fix the export did not exist (only the follow-up renderer
// did); this suite pins the landed contract:
//
//   renderInitialRespondTurn(input: {
//     loweredSchema: unknown; slug: string; toolName?: string;
//   }): string
//
// The optional `toolName` (fix review, F6) carries the REGISTERED respond-tool
// name: under a PIC-44 slug collision the registration mints a disambiguated
// `__theta_respond_<slug>_<n>`, and QRY-12/QRY-15 pin the template reference
// byte-equal to the REGISTERED name — so the renderers reference `toolName`
// verbatim when threaded, falling back to the recipe-derived
// `__theta_respond_<slug>` (byte-identical for every non-colliding
// registration).
//
// Spec: query/query-tool-loop.md (QRY-15 instruction wording + U+000A
// separators), query/query-failure-and-repair.md (QRY-12 `schema_repeat`
// template, `<schema-json>` / `<slug>` placeholders, byte-equality with the
// registered tool name).

import { describe, expect, it } from "vitest";
import {
  renderFollowUpTurn,
  renderInitialRespondTurn,
} from "../src/runtime/query-followup-render";

/** A representative lowered response schema (the AJV-handed JSON Schema form). */
const LOWERED_SCHEMA = {
  type: "object",
  properties: { score: { type: "number" } },
  required: ["score"],
  additionalProperties: false,
};

/** An arbitrary slug — the renderer interpolates whatever slug it is handed. */
const SLUG = "abc123def4567890";

/** The PIC-44 collision-disambiguated registered name for the F6 cells. */
const DISAMBIGUATED_TOOL_NAME = "__theta_respond_" + SLUG + "_2";

/** The leading QRY-12 non-compliance sentence the INITIAL template must NOT carry. */
const NON_COMPLIANCE_SENTENCE = "Your previous response did not match the required schema. ";

describe("bug 0010 (regression pins) — renderInitialRespondTurn byte-exact QRY-15 template (query-tool-loop.md QRY-15)", () => {
  it("QRY-15: the initial respond-turn body is the instruction sentence + U+000A + JSON.stringify(schema, null, 2) + U+000A, byte-exact", () => {
    const body = renderInitialRespondTurn({ loweredSchema: LOWERED_SCHEMA, slug: SLUG });
    // QRY-15 byte pin: the backticked tool reference interpolates the slug,
    // the instruction sentence ends in a single U+000A, `<schema-json>` is
    // JSON.stringify(schema, null, 2) over the LOWERED schema, and the body
    // ends with the mandated trailing U+000A.
    expect(
      body,
      "the QRY-15 initial respond-turn template is byte-for-byte fixed; only the " +
        "`<slug>` and `<schema-json>` placeholders are interpolated",
    ).toBe(
      "Return your final answer using the `__theta_respond_" +
        SLUG +
        "` tool, conforming to this schema:\n" +
        JSON.stringify(LOWERED_SCHEMA, null, 2) +
        "\n",
    );
  });

  it("QRY-15/QRY-12 kinship: the initial template is byte-identical to renderFollowUpTurn(schema_repeat) minus the leading non-compliance sentence", () => {
    const initial = renderInitialRespondTurn({ loweredSchema: LOWERED_SCHEMA, slug: SLUG });
    const followUp = renderFollowUpTurn({
      methodology: "schema_repeat",
      loweredSchema: LOWERED_SCHEMA,
      slug: SLUG,
      issues: [],
    });
    // Guard: the QRY-12 schema_repeat template leads with the fixed
    // non-compliance sentence (already pinned green by the V13h suite) — the
    // slice below is only meaningful if it does.
    expect(
      followUp.startsWith(NON_COMPLIANCE_SENTENCE),
      "the QRY-12 schema_repeat follow-up leads with the verbatim non-compliance sentence",
    ).toBe(true);
    // The bug-0010 design pin: both renderers share the instruction builder, so
    // the initial template is EXACTLY the schema_repeat bytes minus that
    // leading sentence — wording drift between QRY-15 and QRY-12 is impossible.
    expect(
      initial,
      "renderInitialRespondTurn shares the instruction builder with renderFollowUpTurn: " +
        "byte-identical to schema_repeat minus the non-compliance sentence (QRY-15)",
    ).toBe(followUp.slice(NON_COMPLIANCE_SENTENCE.length));
  });
});

describe("bug 0010 fix review (F6) — the PIC-44 collision-disambiguated registered name threads into the QRY-15/QRY-12 tool reference", () => {
  it("QRY-15 disambiguated: a threaded toolName `__theta_respond_<slug>_2` is referenced VERBATIM — never the recipe-derived base name", () => {
    // QRY-12 pins byte-equality between the template's tool reference and the
    // REGISTERED tool name; under a PIC-44 slug collision the registered name
    // is the disambiguated mint, so instructing the model to call the base
    // name would name a tool the provider is NOT forced to (fix review F6).
    const body = renderInitialRespondTurn({
      loweredSchema: LOWERED_SCHEMA,
      slug: SLUG,
      toolName: DISAMBIGUATED_TOOL_NAME,
    });
    expect(
      body,
      "the threaded registered name is interpolated verbatim into the QRY-15 " +
        "instruction (fix review F6)",
    ).toBe(
      "Return your final answer using the `" +
        DISAMBIGUATED_TOOL_NAME +
        "` tool, conforming to this schema:\n" +
        JSON.stringify(LOWERED_SCHEMA, null, 2) +
        "\n",
    );
    expect(
      body.includes("`__theta_respond_" + SLUG + "`"),
      "the base recipe name must NOT appear as the tool reference when a " +
        "disambiguated registered name was threaded",
    ).toBe(false);
  });

  it("QRY-12 disambiguated: renderFollowUpTurn(validator_error) references the threaded toolName verbatim, byte-identical otherwise", () => {
    const issues = [
      { path: "/score", message: "must be number", schema_keyword: "type" },
    ];
    const withToolName = renderFollowUpTurn({
      methodology: "validator_error",
      loweredSchema: LOWERED_SCHEMA,
      slug: SLUG,
      toolName: DISAMBIGUATED_TOOL_NAME,
      issues,
    });
    const withoutToolName = renderFollowUpTurn({
      methodology: "validator_error",
      loweredSchema: LOWERED_SCHEMA,
      slug: SLUG,
      issues,
    });
    // The ONLY byte difference is the tool reference: replacing the
    // disambiguated reference with the base reference reproduces the
    // undisambiguated rendering exactly (surrounding template bytes are
    // untouched by the threading).
    expect(
      withToolName.replace(
        "`" + DISAMBIGUATED_TOOL_NAME + "`",
        "`__theta_respond_" + SLUG + "`",
      ),
      "threading toolName changes ONLY the backticked tool reference (QRY-12 " +
        "template bytes otherwise identical)",
    ).toBe(withoutToolName);
    expect(
      withToolName.includes("`" + DISAMBIGUATED_TOOL_NAME + "`"),
      "the follow-up instructs the model to call the REGISTERED (disambiguated) name",
    ).toBe(true);
  });

  it("QRY-15 undisambiguated fallback: an absent toolName renders the recipe-derived base reference (bytes unchanged from the pre-F6 rendering)", () => {
    expect(
      renderInitialRespondTurn({ loweredSchema: LOWERED_SCHEMA, slug: SLUG }),
      "no threaded toolName ⇒ the recipe-derived `__theta_respond_<slug>` reference " +
        "(byte-identical for every non-colliding registration)",
    ).toBe(
      renderInitialRespondTurn({
        loweredSchema: LOWERED_SCHEMA,
        slug: SLUG,
        toolName: "__theta_respond_" + SLUG,
      }),
    );
  });
});
