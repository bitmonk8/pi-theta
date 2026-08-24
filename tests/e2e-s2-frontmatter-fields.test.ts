import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  type FrontmatterParseResult,
  type ModelReferenceMatcher,
} from "../src/parser/frontmatter";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// e2e-campaign slice S2 (frontmatter-imports), area FRNT.
//
// M1 offline-unit coverage for in-scope FRNT field-contract requirements whose
// production behaviour was UNCOVERED by a dedicated assertion in the existing
// suite (frontmatter-contract.test.ts covered missing-mode / model-unresolved /
// unknown-frontmatter-field / bind_context retention; these fill the remaining
// value-validation load errors). Each drives the real `parseFrontmatter`
// production entry (src/parser/frontmatter.ts:980). Expected diagnostic
// *Message* strings are sourced from the shipped emitter (the same string the
// registry Message column pins).
//
// Requirements exercised:
//   REQ-FRNT-2  theta/load/unknown-mode-value   (spec-requirements.md:307)
//   REQ-FRNT-14 theta/load/unknown-bind-context-value (spec-requirements.md:319)
//   REQ-FRNT-21 theta/load/params-null          (spec-requirements.md:326)
//   REQ-FRNT-68 theta/load/unknown-methodology-value (spec-requirements.md:373)
//   REQ-FRNT-26 argument_hint (underscore) → unknown-frontmatter-field (spec-requirements.md:331)

const resolvingMatcher: ModelReferenceMatcher = { resolve: () => "resolved" };

function parse(...frontmatterLines: string[]): FrontmatterParseResult {
  const source = ["---", ...frontmatterLines, "---", "@`hello`"].join("\n");
  return parseFrontmatter(source, { file: "test.theta", modelMatcher: resolvingMatcher });
}

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

describe("S2/FRNT-2 — unrecognised `mode:` value (theta/load/unknown-mode-value)", () => {
  it("distinct from missing-mode: `mode: agent` fires unknown-mode-value and the theta is not registered", () => {
    const r = parse("mode: agent");
    const d = withCode(r.diagnostics, "theta/load/unknown-mode-value");
    expect(d, "unknown-mode-value for an unrecognised `mode:`").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe("unknown 'mode:' value 'agent'; expected 'prompt' or 'subagent'");
    // The missing-mode code (present-vs-absent) does not collapse into this one.
    expect(withCode(r.diagnostics, "theta/load/missing-mode")).toBeUndefined();
    expect(r.registered).toBe(false);
  });
});

describe("S2/FRNT-14 — bad `bind_context:` value (theta/load/unknown-bind-context-value)", () => {
  it("a `bind_context:` value other than none/session fires and the theta is not registered", () => {
    const r = parse("mode: prompt", "bind_context: elsewhere");
    const d = withCode(r.diagnostics, "theta/load/unknown-bind-context-value");
    expect(d, "unknown-bind-context-value for a bad value").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      "unknown 'bind_context:' value 'elsewhere'; expected 'none' or 'session'",
    );
    expect(r.registered).toBe(false);
  });

  it("a non-string scalar `bind_context: 3` is likewise unknown-bind-context-value", () => {
    const r = parse("mode: prompt", "bind_context: 3");
    expect(
      withCode(r.diagnostics, "theta/load/unknown-bind-context-value"),
      "a non-string scalar bind_context value is rejected",
    ).toBeDefined();
    expect(r.registered).toBe(false);
  });
});

describe("S2/FRNT-21 — redundant `params: null` (theta/load/params-null)", () => {
  it("`params: null` fires params-null (omit or use `params: {}`)", () => {
    const r = parse("mode: prompt", "params: null");
    const d = withCode(r.diagnostics, "theta/load/params-null");
    expect(d, "params-null for the redundant `params: null`").toBeDefined();
    expect(d?.message).toBe(
      "'params: null' is not permitted; omit 'params:' or use 'params: {}'",
    );
  });
});

describe("S2/FRNT-68 — bad `respond_repair.methodology:` value (theta/load/unknown-methodology-value)", () => {
  it("a value outside {validator_error,schema_repeat,none} fires and the theta is not registered", () => {
    const r = parse("mode: subagent", "respond_repair:", "  methodology: shout");
    const d = withCode(r.diagnostics, "theta/load/unknown-methodology-value");
    expect(d, "unknown-methodology-value for a bad methodology").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      "unknown 'respond_repair.methodology:' value 'shout'; expected 'validator_error', 'schema_repeat', or 'none'",
    );
    expect(r.registered).toBe(false);
  });

  it("the three recognised methodology values register cleanly", () => {
    for (const m of ["validator_error", "schema_repeat", "none"]) {
      const r = parse("mode: subagent", "respond_repair:", `  methodology: ${m}`);
      expect(
        withCode(r.diagnostics, "theta/load/unknown-methodology-value"),
        `methodology: ${m} is recognised`,
      ).toBeUndefined();
      expect(r.registered, `methodology: ${m} registers`).toBe(true);
    }
  });
});

describe("S2/FRNT-26 — `argument_hint:` (underscore) is unrecognised", () => {
  it("the underscore spelling surfaces unknown-frontmatter-field and the theta still registers", () => {
    // FRNT-25/26: `argument-hint` retains Pi's hyphenated spelling; the
    // underscore form is not the recognised key.
    const r = parse("mode: prompt", "argument_hint: foo");
    const d = withCode(r.diagnostics, "theta/load/unknown-frontmatter-field");
    expect(d, "argument_hint (underscore) is an unknown key").toBeDefined();
    expect(d?.severity).toBe("warning");
    expect(d?.message).toBe("unknown frontmatter field 'argument_hint'");
    expect(r.registered, "an unknown key is tolerated — the theta still registers").toBe(true);
  });

  it("the hyphenated `argument-hint:` is recognised (no unknown-frontmatter-field)", () => {
    const r = parse("mode: prompt", "argument-hint: foo");
    expect(
      withCode(r.diagnostics, "theta/load/unknown-frontmatter-field"),
      "the hyphenated argument-hint is a recognised key",
    ).toBeUndefined();
    expect(r.registered).toBe(true);
  });
});
