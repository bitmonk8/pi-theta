---
id: PTQ-0235
title: The "reached both bind_model stems" precondition test in b0297-bind-model-nonscalar-production-load.test.ts checks neither bind_model stem
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0297-bind-model-nonscalar-production-load.test.ts:165-175
sites: 1
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# The "reached both bind_model stems" precondition test in b0297-bind-model-nonscalar-production-load.test.ts checks neither bind_model stem

## Observation
A test named "the discovery walk reached both bind_model stems
(precondition)", preceded by a comment reading "both stems reached the
compose pass at all", asserts only that a third, unrelated planted fixture
("plainok" — a plain theta carrying no `bind_model:` field at all) appears in
the load outcome's `registered` list. Neither of the two actual bind_model
stems the name refers to ("binmodelseq", "binmodelscalar") is read anywhere
in this test's body.

## Evidence
tests/b0297-bind-model-nonscalar-production-load.test.ts:165-175 — the test
in question:
```ts
describe("bug 0297 face 2 — non-scalar bind_model: threaded through the production compose pass", () => {
  // Shared precondition guard: both stems reached the compose pass at all, so a
  // registration red is a binder-model-resolution red, not an empty-walk red.
  it("the discovery walk reached both bind_model stems (precondition)", () => {
    expect(
      outcome.registered,
      "the project `.pi/theta/` discovery walk did not register the clean bypass " +
        "control — the setup precondition is unmet. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("plainok");
  });
```

tests/b0297-bind-model-nonscalar-production-load.test.ts:99-102 — "plainok"'s
own fixture comment, confirming it carries no `bind_model:` field and is a
different fixture from the two the test's name names:
```ts
  // PRECONDITION CONTROL — a clean bypass-eligible theta (no `bind_model:`, no
  // `params:`) that must always register, so a red below is a resolution red
  // rather than an empty-walk / setup red.
  { stem: "plainok", text: theta("---", "mode: prompt", "---", "@`hi`") },
```

tests/b0297-bind-model-nonscalar-production-load.test.ts:107-110 — the only
shape `runProductionLoad`'s return value exposes; there is no separate
"discovered"/"attempted" signal distinct from `registered`, so nothing this
test's assertion reads can distinguish "the walk reached this stem and
refused it" from "the walk never reached this stem at all":
```ts
interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
}
```

tests/b0297-bind-model-nonscalar-production-load.test.ts:177-204 — the only
two places either bind_model stem is actually read, both in later,
separately-named tests:
```ts
  it("a scalar bind_model: that resolves against the available model registers (control)", () => {
    // The harness resolves the model and a well-formed scalar `bind_model:`
    // loads: `test/binder` matches the one available model, takes the
    // strict-capability probe's silent-admit branch (bug 0475), and the
    // non-bypass theta registers.
    expect(
      outcome.registered,
      "the scalar-bind_model control must register, proving the harness resolves " +
        "the model. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("binmodelscalar");
  });

  it("a non-scalar bind_model: on a non-bypass theta does NOT register", () => {
    ...
    expect(
      outcome.registered,
      "the non-scalar bind_model: theta registered: the `bindModelUnresolvable` " +
        "marker did not thread through the production compose spread, so the " +
        "settings fallback (the ABSENT-field behaviour) admitted it. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("binmodelseq");
  });
```

## Why this is a problem
A reader following the name "the discovery walk reached both bind_model
stems (precondition)" — reinforced by the comment directly above it, "both
stems reached the compose pass at all" — would expect this test to fail
loudly if either "binmodelseq" or "binmodelscalar" (the two stems that carry
a `bind_model:` field, per the `THETAS` array) were never read by the
discovery walk, guarding the two tests below against a vacuous pass: in
particular, if "binmodelseq" specifically were never discovered (rather than
being discovered and correctly refused), the later test's
`.not.toContain("binmodelseq")` assertion would still pass, exactly the
"empty-walk red" scenario the precondition's own comment says it exists to
distinguish from a genuine binder-model-resolution red. The precondition's
actual body reads only `outcome.registered.toContain("plainok")` — a fixture
that, per its own comment, carries no `bind_model:` field and is unrelated to
either named stem. `LoadOutcome` (lines 107-110) exposes only `registered`
(no separate discovered/attempted list), so a discovery-walk defect confined
to the two bind_model-bearing fixtures specifically — while "plainok" still
loads — would leave this precondition green and give no warning that neither
stem the test's name promises to guard was ever exercised.

## Suggested direction (non-binding, optional)
A name and comment naming what is actually read (that the workspace's
`.pi/theta/` discovery walk is live at all, witnessed by the always-registering
control fixture) would describe this test's own body; verifying that the two
bind_model stems specifically were reached is a distinct claim this test does
not make good on today.

## False-positive check
- Gate-pin check: `tests/b0297-bind-model-nonscalar-production-load.test.ts`
  does not match `*gate*.test.ts` or the named kin, and this finding disputes
  no pinned count or inventory — it is about what a single test's name claims
  versus what its body reads.
- Recording-double check: `outcome.registered` is an already-computed array of
  slash names read off a real `discoverAndComposeFixtures` call; the assertion
  is a plain membership check, not a MUST-NOT-called witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0297-bind-context-nonscalar-silently-registers.md`
  is **Status: fixed (0.330.0)** and names this file's suite as "a
  composition-level offline witness (3 cells)" and pins `npx vitest run
  tests/b0297-bind-model-nonscalar-production-load.test.ts → 3/3`; it does not
  discuss this specific precondition cell's assertion target, so no documented
  correct-reason-red applies. `npx vitest run
  tests/b0297-bind-model-nonscalar-production-load.test.ts` reproduces 3/3
  passing at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0297-bind-model-nonscalar-production-load" docs/reference/coverage-matrix.md`
  → 0 hits. The bug doc's witness line pins a cell COUNT (3), which this
  finding does not propose changing (no merge/rename/delete of any `it()`) —
  only that the existing cell's name and its assertion target diverge.
- Coverage check: this finding does not claim a missing test for "both stems
  are reached" — it observes that the CURRENT test's name claims that
  verification while its body performs a different one; whether a test for the
  omitted claim should exist is a routing note, not part of this filing.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim (lines 165-175, 99-102, 107-110, 177-204): the precondition's sole assertion is `toContain("plainok")`, a fixture its own adjacent comment says carries no `bind_model:`, while neither named stem is read; `LoadOutcome` exposes only `registered` with no discovered/attempted signal, so a discovery defect confined to bind_model-bearing files would leave this precondition green — a genuine misleading-name/vacuous-guard, not shielded by the bug doc's count-only witness (3/3) or coverage-matrix (0 hits, reconfirmed) (triage: claude-opus-5)
