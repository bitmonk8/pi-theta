import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  type FrontmatterParseResult,
  type ModelMatchOutcome,
  type ModelReferenceMatcher,
} from "../src/parser/frontmatter";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// V6a-T — failing tests for the paired `V6a` "frontmatter field contract"
// implementation.
//
// Spec: frontmatter.md, frontmatter/frontmatter-fields-a.md (field-contract
// table — required `mode:`, present-`model:` load-time resolution, unknown-key
// tolerance) and frontmatter/frontmatter-fields-b-and-templates.md.
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-load.md, diagnostics/code-registry-parse.md) per
// the *Diagnostic message anchors* rule.
//
// These tests red because the V6a frontmatter parser is absent: `parseFrontmatter`
// is an inert stub returning `{ registered: false, diagnostics: [] }`. Each test
// reds on its own primary assertion (an absent expected diagnostic, an
// un-registered loom, or an undefined parsed field) — not on a compile error,
// missing fixture, or harness throw.

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** A matcher that resolves every reference (for tests not exercising `model:`). */
const resolvingMatcher: ModelReferenceMatcher = { resolve: () => "resolved" };

/** A matcher that returns a fixed outcome for every reference. */
function fixedMatcher(outcome: ModelMatchOutcome): ModelReferenceMatcher {
  return { resolve: () => outcome };
}

/** Parse a full `.loom` source under the given (default resolving) matcher. */
function parse(
  source: string,
  matcher: ModelReferenceMatcher = resolvingMatcher,
): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "test.loom", modelMatcher: matcher });
}

/** Build a `.loom` source from frontmatter lines plus a trivial body. */
function loom(...frontmatterLines: string[]): string {
  return ["---", ...frontmatterLines, "---", "@`hello`"].join("\n");
}

// --- frontmatter-fields-a.md §Field contract — required `mode:` -----------

// cka-11 / V6a: the FRNT code-keyed obligation area (frontmatter fields a/b)
// closes across V6a (this field contract), V6b, V6c, V6d, V6e; the assertions in
// this file witness the V6a facet against the shipped frontmatter parser.
describe("V6a-T — required `mode:` (loom/load/missing-mode)", () => {
  it("loom/load/missing-mode: frontmatter omitting `mode:` fires the load error and the loom is not registered", () => {
    const r = parse(loom("description: a review loom"));
    const d = withCode(r.diagnostics, "loom/load/missing-mode");
    expect(d, "loom/load/missing-mode for frontmatter with no `mode:`").toBeDefined();
    // Message from code-registry-load.md.
    expect(d?.message).toBe("frontmatter is missing required field 'mode:'");
    expect(d?.severity).toBe("error");
    expect(r.registered, "a `mode:`-less loom is not registered").toBe(false);
  });

  it("loom/load/missing-mode: a valid `mode:` resolves — no error, the loom registers, and `mode` is parsed", () => {
    const r = parse(loom("mode: subagent"));
    expect(
      withCode(r.diagnostics, "loom/load/missing-mode"),
      "a present `mode:` raises no missing-mode error",
    ).toBeUndefined();
    expect(r.registered, "a valid-`mode:` loom registers").toBe(true);
    expect(r.frontmatter?.mode).toBe("subagent");
  });
});

// --- frontmatter-fields-a.md §Unknown-key policy --------------------------

describe("V6a-T — unknown-key tolerance (loom/load/unknown-frontmatter-field)", () => {
  it("loom/load/unknown-frontmatter-field: an unknown top-level key warns (W) and the loom still loads", () => {
    const r = parse(loom("mode: prompt", "bogus_field: 1"));
    const d = withCode(r.diagnostics, "loom/load/unknown-frontmatter-field");
    expect(d, "loom/load/unknown-frontmatter-field for an unknown key").toBeDefined();
    expect(d?.severity, "unknown-frontmatter-field is severity W").toBe("warning");
    // Message from code-registry-load.md (`unknown frontmatter field '<field>'`).
    expect(d?.message).toBe("unknown frontmatter field 'bogus_field'");
    expect(r.registered, "an unknown key is tolerated — the loom still registers").toBe(true);
  });
});

// --- cancellation.md / code-registry-parse.md — NOCEIL-1 seam -------------

describe("V6a-T — per-call timeout rejected (loom/parse/timeout-field-rejected, NOCEIL-1 seam)", () => {
  it("loom/parse/timeout-field-rejected: a `timeout:` field is rejected (NOCEIL-1 seam)", () => {
    const r = parse(loom("mode: prompt", "timeout: 30"));
    const d = withCode(r.diagnostics, "loom/parse/timeout-field-rejected");
    expect(d, "loom/parse/timeout-field-rejected for a `timeout:` field").toBeDefined();
    // Message from code-registry-parse.md.
    expect(d?.message).toBe("'timeout:' field is not supported in loom 1.0");
  });
});

// --- frontmatter-fields-a.md §`model` — present-but-unresolvable ----------

describe("V6a-T — present `model:` resolution (loom/load/model-unresolved)", () => {
  it("loom/load/model-unresolved: a non-string scalar `model:` fails the load and the loom is not registered", () => {
    const r = parse(loom("mode: prompt", "model: 42"), fixedMatcher("no-match"));
    const d = withCode(r.diagnostics, "loom/load/model-unresolved");
    expect(d, "loom/load/model-unresolved for a non-string scalar `model:`").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(r.registered, "an unresolvable-`model:` loom is not registered").toBe(false);
  });

  it("loom/load/model-unresolved: a `provider/modelId` reference matching no available model fires through the matcher seam", () => {
    // Drive the parser's model-resolution hook through the model-reference-matcher
    // injection seam V6a defines, recording the reference the hook hands it.
    let seen: unknown = undefined;
    const recording: ModelReferenceMatcher = {
      resolve: (reference) => {
        seen = reference;
        return "no-match";
      },
    };
    const r = parse(loom("mode: prompt", "model: bogus/model"), recording);
    expect(seen, "the model-resolution hook consults the injected matcher").toBe("bogus/model");
    const d = withCode(r.diagnostics, "loom/load/model-unresolved");
    expect(d, "loom/load/model-unresolved for a non-matching provider/modelId reference").toBeDefined();
    // Message from code-registry-load.md; `<value>` renders the unquoted YAML scalar.
    expect(d?.message).toBe(
      "loom 'model:' value 'bogus/model' resolves to no available model, or is ambiguous across providers",
    );
    expect(r.registered).toBe(false);
  });

  it("loom/load/model-unresolved: a bare `modelId` ambiguous across providers fails the load", () => {
    const r = parse(loom("mode: prompt", "model: claude-haiku"), fixedMatcher("ambiguous"));
    const d = withCode(r.diagnostics, "loom/load/model-unresolved");
    expect(d, "loom/load/model-unresolved for a provider-ambiguous bare modelId").toBeDefined();
    expect(r.registered).toBe(false);
  });

  it("loom/load/model-unresolved: a resolving `model:` reference does not fire the code and the loom registers", () => {
    const r = parse(
      loom("mode: prompt", "model: anthropic/claude-sonnet-4-5"),
      fixedMatcher("resolved"),
    );
    expect(
      withCode(r.diagnostics, "loom/load/model-unresolved"),
      "a resolving `model:` raises no model-unresolved error",
    ).toBeUndefined();
    expect(r.registered, "a resolving-`model:` loom registers").toBe(true);
    expect(r.frontmatter?.model).toBe("anthropic/claude-sonnet-4-5");
  });
});

// --- BNDR-10 `bind_context:` retention (binder/binder-model-and-context.md) ---

describe("BNDR-10 — `bind_context:` retention on ParsedFrontmatter", () => {
  it("a prompt-mode `bind_context: session` loom retains bindContext: 'session'", () => {
    const r = parse(loom("mode: prompt", "bind_context: session"));
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.bindContext).toBe("session");
  });

  it("an absent `bind_context:` leaves bindContext undefined (defaults to none)", () => {
    const r = parse(loom("mode: prompt"));
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.bindContext).toBeUndefined();
  });

  it("an explicit `bind_context: none` is not retained as session (undefined)", () => {
    const r = parse(loom("mode: prompt", "bind_context: none"));
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.bindContext).toBeUndefined();
  });

  it("BNDR-10: `bind_context: session` on a subagent-mode loom is inert (not retained) + warns", () => {
    const r = parse(loom("mode: subagent", "bind_context: session"));
    expect(r.registered, "the loom still registers (session is inert on subagent, a warning)").toBe(true);
    expect(r.frontmatter?.bindContext, "subagent-mode session is normalised away").toBeUndefined();
  });
});

// --- `description` retention (frontmatter-fields-a.md — autocomplete entry) ---

describe("frontmatter `description` retention", () => {
  it("retains a non-empty `description` for the slash-command autocomplete entry", () => {
    const r = parse(loom("mode: prompt", "description: Programmatic code review"));
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.description).toBe("Programmatic code review");
  });

  it("an absent `description` leaves it undefined (command registers untexted)", () => {
    const r = parse(loom("mode: prompt"));
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.description).toBeUndefined();
  });
});
