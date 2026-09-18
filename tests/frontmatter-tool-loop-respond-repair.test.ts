import { describe, expect, it } from "vitest";
import type { FrontmatterParseResult } from "../src/parser/frontmatter";
import { findCode as withCode, parseFrontmatterLines } from "./helpers/e2e-s1";

// V6e-T — failing tests for the paired `V6e` "`respond_repair` and `tool_loop`"
// frontmatter parse implementation.
//
// Spec: frontmatter/frontmatter-fields-b-and-templates.md (FRNT-1 —
// `tool_loop.max_rounds` is a non-negative integer bounding free-phase rounds
// only, `0` disables model tool calls; the `tool_loop` / `respond_repair`
// field-contract defaults from frontmatter-fields-a.md §Field contract) and the
// `theta/load/frontmatter-value-out-of-range` load diagnostic (out-of-range
// `max_rounds` / `respond_repair.attempts`).
//
// The runtime side of FRNT-1 — free-phase-round accounting, `tool_loop_exhausted`
// on an untyped query, and the CIO-4 `max_rounds`-final forced-respond
// terminator on a typed query — is owned by `V13c` / `V13d` and is exercised by
// their suites; this leaf covers only the frontmatter *parse* side of FRNT-1
// (the per-theta `max_rounds` / `attempts` values, their non-negative-integer
// range rule, and their field-contract defaults).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-load.md) and its `<observed>` parsed-scalar
// carve-out (diagnostics/placeholder-rendering-b.md) per the *Diagnostic message
// anchors* rule.
//
// These tests red because the `V6e` parse of `tool_loop` / `respond_repair` is
// absent: `parseFrontmatter` recognises the two keys (they are tolerated members
// of the theta 1.0 field vocabulary) but neither populates `frontmatter.toolLoop`
// / `frontmatter.respondRepair` nor validates their scalars. Each test reds on
// its own primary assertion — an absent parsed field, an absent
// out-of-range diagnostic, or a wrongly-registered theta — not on a compile
// error, missing fixture, or harness throw.

/**
 * Parse a `subagent`-mode `.theta` built from the given extra frontmatter lines
 * (a trivial `mode: subagent` header keeps the only error under test the one
 * the extra lines introduce) under the resolving matcher.
 */
function parse(...frontmatterLines: string[]): FrontmatterParseResult {
  return parseFrontmatterLines("mode: subagent", ...frontmatterLines);
}

const OOR = "theta/load/frontmatter-value-out-of-range";

// --- FRNT-1 — `tool_loop.max_rounds` parse (non-negative integer) ----------

// cka-11 / V6e: the FRNT code-keyed obligation area's `respond_repair`/`tool_loop`
// facet closes on V6e; the assertions in this file witness that facet against the
// shipped range validation and defaults.
describe("V6e-T — FRNT-1 `tool_loop.max_rounds` parse", () => {
  it("FRNT-1: `max_rounds: 0` (the model-tool-call disable form) parses, registers, and exposes maxRounds 0", () => {
    const r = parse("tool_loop:", "  max_rounds: 0");
    expect(withCode(r.diagnostics, OOR), "`max_rounds: 0` is in range").toBeUndefined();
    expect(r.registered, "a `max_rounds: 0` theta registers").toBe(true);
    expect(r.frontmatter?.toolLoop?.maxRounds, "`max_rounds: 0` parses to 0").toBe(0);
  });

  it("FRNT-1: a positive `max_rounds` integer parses to that value", () => {
    const r = parse("tool_loop:", "  max_rounds: 25");
    expect(r.frontmatter?.toolLoop?.maxRounds, "`max_rounds: 25` parses to 25").toBe(25);
  });

  it("FRNT-1: `max_rounds: 25.0` (integer-valued number) is accepted \u2014 integer-ness is judged on the parsed value", () => {
    const r = parse("tool_loop:", "  max_rounds: 25.0");
    expect(withCode(r.diagnostics, OOR), "`25.0` is an integer-valued number").toBeUndefined();
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.toolLoop?.maxRounds, "`max_rounds: 25.0` parses to 25").toBe(25);
  });

  it("FRNT-1: an absent `tool_loop` block defaults to `{ max_rounds: 25 }`", () => {
    const r = parse("description: a theta with no tool_loop block");
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.toolLoop?.maxRounds, "absent `tool_loop` defaults max_rounds to 25").toBe(25);
  });

  it("FRNT-1: an empty `tool_loop: {}` block is equivalent to omitting it \u2014 the default 25 applies", () => {
    const r = parse("tool_loop: {}");
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.toolLoop?.maxRounds, "`tool_loop: {}` defaults max_rounds to 25").toBe(25);
  });
});

// --- respond_repair.attempts parse (non-negative integer + defaults) -------

describe("V6e-T — `respond_repair.attempts` parse", () => {
  it("FRNT-1: `respond_repair.attempts: 0` (the no-follow-up form) parses to 0", () => {
    const r = parse("respond_repair:", "  attempts: 0");
    expect(withCode(r.diagnostics, OOR), "`attempts: 0` is in range").toBeUndefined();
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.respondRepair?.attempts, "`attempts: 0` parses to 0").toBe(0);
  });

  it("FRNT-1: an absent `respond_repair` block defaults to `{ attempts: 3 }`", () => {
    const r = parse("description: a theta with no respond_repair block");
    expect(r.registered).toBe(true);
    expect(r.frontmatter?.respondRepair?.attempts, "absent `respond_repair` defaults attempts to 3").toBe(3);
  });
});

// --- theta/load/frontmatter-value-out-of-range ------------------------------
//
// Message template (code-registry-load.md):
//   frontmatter field '<dotted-key>' must be a non-negative integer; got <observed>
// The `<observed>` parsed-scalar carve-out (placeholder-rendering-b.md §8):
// numbers render bare, strings double-quoted-when-not-identifier-shaped,
// booleans as `true`/`false`, `null` as the literal `null`.

describe("V6e-T — theta/load/frontmatter-value-out-of-range (tool_loop.max_rounds)", () => {
  it("frontmatter-value-out-of-range: a negative `max_rounds` fires and the theta is not registered", () => {
    const r = parse("tool_loop:", "  max_rounds: -1");
    const d = withCode(r.diagnostics, OOR);
    expect(d, "out-of-range for a negative `max_rounds`").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      "frontmatter field 'tool_loop.max_rounds' must be a non-negative integer; got -1",
    );
    expect(r.registered, "an out-of-range `max_rounds` theta is not registered").toBe(false);
  });

  it("frontmatter-value-out-of-range: a non-integer number `max_rounds: 25.5` fires with the parsed value rendered bare", () => {
    const r = parse("tool_loop:", "  max_rounds: 25.5");
    const d = withCode(r.diagnostics, OOR);
    expect(d, "out-of-range for a non-integer `max_rounds`").toBeDefined();
    expect(d?.message).toBe(
      "frontmatter field 'tool_loop.max_rounds' must be a non-negative integer; got 25.5",
    );
    expect(r.registered).toBe(false);
  });

  it("frontmatter-value-out-of-range: a non-number scalar `max_rounds: \"25\"` fires with the string rendered double-quoted", () => {
    const r = parse("tool_loop:", '  max_rounds: "25"');
    const d = withCode(r.diagnostics, OOR);
    expect(d, "out-of-range for a stringly-typed `max_rounds`").toBeDefined();
    expect(d?.message).toBe(
      'frontmatter field \'tool_loop.max_rounds\' must be a non-negative integer; got "25"',
    );
    expect(r.registered).toBe(false);
  });

  it("frontmatter-value-out-of-range: a boolean `max_rounds: true` fires with the boolean rendered bare", () => {
    const r = parse("tool_loop:", "  max_rounds: true");
    const d = withCode(r.diagnostics, OOR);
    expect(d, "out-of-range for a boolean `max_rounds`").toBeDefined();
    expect(d?.message).toBe(
      "frontmatter field 'tool_loop.max_rounds' must be a non-negative integer; got true",
    );
    expect(r.registered).toBe(false);
  });

  it("frontmatter-value-out-of-range: a `null` `max_rounds` fires with the literal `null` rendered", () => {
    const r = parse("tool_loop:", "  max_rounds: null");
    const d = withCode(r.diagnostics, OOR);
    expect(d, "out-of-range for a `null` `max_rounds`").toBeDefined();
    expect(d?.message).toBe(
      "frontmatter field 'tool_loop.max_rounds' must be a non-negative integer; got null",
    );
    expect(r.registered).toBe(false);
  });
});

describe("V6e-T — theta/load/frontmatter-value-out-of-range (respond_repair.attempts)", () => {
  it("frontmatter-value-out-of-range: a non-number scalar `attempts: \"25\"` fires with the dotted key naming respond_repair.attempts", () => {
    const r = parse("respond_repair:", '  attempts: "25"');
    const d = withCode(r.diagnostics, OOR);
    expect(d, "out-of-range for a stringly-typed `respond_repair.attempts`").toBeDefined();
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      'frontmatter field \'respond_repair.attempts\' must be a non-negative integer; got "25"',
    );
    expect(r.registered, "an out-of-range `attempts` theta is not registered").toBe(false);
  });

  it("frontmatter-value-out-of-range: a negative `attempts: -2` fires with the parsed value rendered bare", () => {
    const r = parse("respond_repair:", "  attempts: -2");
    const d = withCode(r.diagnostics, OOR);
    expect(d, "out-of-range for a negative `respond_repair.attempts`").toBeDefined();
    expect(d?.message).toBe(
      "frontmatter field 'respond_repair.attempts' must be a non-negative integer; got -2",
    );
    expect(r.registered).toBe(false);
  });
});
