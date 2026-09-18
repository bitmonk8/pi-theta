import { describe, expect, it } from "vitest";
import { findCode as withCode, parseFrontmatterLines as parse } from "./helpers/e2e-s1";

// e2e-campaign slice S2 (frontmatter-imports), area FRNT — advisory-diagnostic
// gaps.
//
// Three W-level advisory diagnostics are in the closed registry
// (docs/spec_topics/diagnostics/code-registry-load.md:13,17,32) and required by
// in-scope FRNT rows. They were previously NOT emitted by any src/** path;
// FIX-3 (frontmatter advisory) added all three emitters to
// src/parser/frontmatter.ts. Ground truth is captured through the real
// `parseFrontmatter` production entry.
//
// Per D7 these witnesses are reconciled to assert the SPEC-correct behaviour:
//   (a) the former `[observed]` characterization tests now assert the advisory
//       diagnostic FIRES (they previously pinned the pre-fix no-diagnostic
//       output);
//   (b) the former `it.fails` SPEC repros are converted to plain `it(...)`
//       permanent gates.
//
// Findings: FIND-S2-1 (FRNT-23), FIND-S2-2 (FRNT-22), FIND-S2-3 (FRNT-5).

// --- FIND-S2-1 / REQ-FRNT-23 — deferred-frontmatter-field -------------------
// Spec (spec-requirements.md:328): reserved names → `theta/load/deferred-
// frontmatter-field`; unrecognised names → `theta/load/unknown-frontmatter-field`.
// `binder_temperature` is the named deferred/reserved field (frontmatter-fields
// -a.md:32; Deferred appendix Cluster 2).

describe("S2/FRNT-23 — reserved `binder_temperature` should be deferred-frontmatter-field", () => {
  it("binder_temperature now fires deferred-frontmatter-field, not generic unknown-frontmatter-field", () => {
    const r = parse("mode: prompt", "binder_temperature: 0.5");
    expect(withCode(r.diagnostics, "theta/load/deferred-frontmatter-field")).toBeDefined();
    expect(withCode(r.diagnostics, "theta/load/unknown-frontmatter-field")).toBeUndefined();
    expect(r.registered).toBe(true);
  });

  it("[spec repro] binder_temperature should fire theta/load/deferred-frontmatter-field (W)", () => {
    const r = parse("mode: prompt", "binder_temperature: 0.5");
    const d = withCode(r.diagnostics, "theta/load/deferred-frontmatter-field");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("warning");
    expect(r.registered).toBe(true);
  });
});

// --- FIND-S2-2 / REQ-FRNT-22 — bind-echo-without-params ---------------------
// Spec (spec-requirements.md:327): an explicit `bind_echo: true` on a no-params
// theta is `theta/load/bind-echo-without-params` (W) and produces no echo.

describe("S2/FRNT-22 — bind_echo: true on a no-params theta should warn", () => {
  it("bind_echo: true on a no-params theta fires theta/load/bind-echo-without-params", () => {
    const r = parse("mode: prompt", "bind_echo: true");
    expect(withCode(r.diagnostics, "theta/load/bind-echo-without-params")).toBeDefined();
    expect(r.registered).toBe(true);
  });

  it("[spec repro] bind_echo: true (no params) should fire theta/load/bind-echo-without-params (W)", () => {
    const r = parse("mode: prompt", "bind_echo: true");
    const d = withCode(r.diagnostics, "theta/load/bind-echo-without-params");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("warning");
  });
});

// --- FIND-S2-3 / REQ-FRNT-5 — argument-hint-not-displayed -------------------
// Spec (spec-requirements.md:310): declaring `argument-hint` without
// `description` emits advisory `theta/load/argument-hint-not-displayed`.

describe("S2/FRNT-5 — argument-hint without description should warn", () => {
  it("argument-hint without description fires theta/load/argument-hint-not-displayed", () => {
    const r = parse("mode: prompt", "argument-hint: <file>");
    expect(withCode(r.diagnostics, "theta/load/argument-hint-not-displayed")).toBeDefined();
    expect(r.registered).toBe(true);
  });

  it("[spec repro] argument-hint w/o description should fire theta/load/argument-hint-not-displayed (W)", () => {
    const r = parse("mode: prompt", "argument-hint: <file>");
    const d = withCode(r.diagnostics, "theta/load/argument-hint-not-displayed");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("warning");
  });

  it("[control] argument-hint WITH description raises no advisory (both spellings recognised)", () => {
    const r = parse("mode: prompt", "description: pick a file", "argument-hint: <file>");
    expect(withCode(r.diagnostics, "theta/load/argument-hint-not-displayed")).toBeUndefined();
    expect(r.registered).toBe(true);
  });
});
