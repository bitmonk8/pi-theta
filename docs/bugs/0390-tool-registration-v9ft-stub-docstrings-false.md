# Bug 0390 — `deriveToolLabel` and `registerToolInCache` docstrings still claim to be red-by-design "V9f-T stubs" while each sits atop its full V9f implementation, asserting behaviour the code's own body contradicts

- **Status:** fixed (0.384.0).
- **Sev/Diff estimate:** S5/D1 — comment-only falsity; no runtime bytes
  involved. D1: delete/replace two stale docstring paragraphs and the test
  file's header claim.
- **Kind:** defect (doc/comment layer asserting false behaviour — the
  "diagnostics that lie" class at the maintainer-facing layer; reported
  because it is crisp, verified, and the falsity inverts the functions'
  actual contracts).
- **Related:**
  - [0372](./0372-pic8-restore-protocol-orphaned.md) — fixed
    (0.363.0). Its §Fix Residual 2 names exactly this: "Pre-existing stale
    'V9f-T stub' docstrings remain on the two UNTOUCHED functions in
    `tool-registration.ts` (`deriveToolLabel`, `registerToolInCache`) and in
    the `tool-registration-lifetime.test.ts` header — same falsity class but
    OUT of §Fix scope… Follow-up candidate." (0372's own subject was the same
    file's PIC-8 stub docstring whose promised composition was never built.)
    No follow-up was filed; this report is it.
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/runtime/tool-registration.ts:55-57` — `deriveToolLabel`'s docstring:
    "V9f-T stub: returns `""` so the paired label tests red on their own
    assertion (the absent capitalisation / absent literal). The V9f
    implementation fills this in." The body immediately below returns
    `"Theta typed-query response"` for the respond kind and the
    leading-capitalised basename otherwise — the filled-in V9f implementation.
  - `src/runtime/tool-registration.ts:244-248` — `registerToolInCache`'s
    docstring: "V9f-T stub: always mints the base content-addressed name and
    calls `registerTool` unconditionally, never storing or byte-comparing
    canonical-form bytes and never emitting a collision…" The same doc
    comment's own preceding paragraph and the body below implement the PIC-44
    cache: byte-equality verification on cache hit, reuse on byte-equal,
    `theta/runtime/registration-cache-collision` + disambiguated name on
    mismatch.
  - `tests/tool-registration-lifetime.test.ts:15` — the file header: "V9f-T —
    failing tests for the paired `V9f` \"tool-registration lifetime and
    visibility\" implementation." The suite runs 11/11 green (`npx vitest run
    tests/tool-registration-lifetime.test.ts`); the "failing tests" claim is
    false, and 0372 §Fix Residual 2 names this header as part of the same
    residual.
- **Observed at:** v0.382.0 (d63c5148), by reading the two functions end to
  end (no probe needed; the contradiction is intra-file, docstring vs body).

## Summary

Both docstrings describe the deliberately-red V9f-T scaffolding phase
("stub… so the paired tests red… The V9f implementation fills this in") on
functions whose bodies ARE the V9f implementation, green-tested by
`tests/tool-registration-lifetime.test.ts`. Each stub paragraph states the
opposite of the function's behaviour: `deriveToolLabel` does not return `""`;
`registerToolInCache` does store, byte-compare, dedup, and emit the collision
code. A maintainer trusting the docstring concludes the PIC-44 cache and the
label derivation are unimplemented.

## Reproduction

Read `src/runtime/tool-registration.ts:52-70` and `:230-280` at d63c5148: in
both cases the "V9f-T stub" paragraph is directly contradicted by the
adjacent implementation and by the first paragraph of the same doc comment
(which documents the real contract). `npx vitest run
tests/tool-registration-lifetime.test.ts` is green — the "tests red on their
own assertion" claim is false in both directions.

## Expected behaviour

Comments state WHY and must be true of the code they annotate (CLAUDE.md code
style: "Comments: WHY not WHAT. No historical references." — these are false
historical references). The precedent is this file's own bug 0372, which
removed the same era's false "V9f-T stub" claim from the PIC-8/PIC-17/PIC-19
surfaces when wiring them; these two functions kept theirs only because 0372's
§Fix scope did not touch them.

## Actual behaviour / root cause

The V9f implementation landed by editing the stub bodies without deleting the
scaffolding-phase paragraphs above them. 0372 catalogued the leftovers and
deferred them as scope-widening.

## Why it matters

Lowest impact class, but the falsity is load-bearing for anyone auditing
PIC-44 conformance from the source: the docstring explicitly says the cache
"never emit[s] a collision", i.e. that a registered diagnostic code is dead —
the exact confusion 0216/0377-class audits exist to resolve. Two minutes of
maintainer trust, repeatedly.

## Non-goals

- Any behaviour change in `tool-registration.ts` — the implementations are
  correct and tested.
- The five `describe("V9f-T — …")` titles in the same test file (`:109`,
  `:151`, `:198`, `:254`, `:332`) — phase labels naming the tests' origin, not
  false claims; out of scope.

## Fix

Delete the two "V9f-T stub:" paragraphs (or replace with one line noting the
V9f implementation is in place and where its tests live), and correct the
test-file header (`tests/tool-registration-lifetime.test.ts:15`) so it no
longer claims the tests are failing — all three sites are 0372 §Fix
Residual 2's scope. Comment-only diff; no assertion moves.

## Provenance

Fix-residuals sweep over bugs 0351-0385: 0372 §Fix Residual 2 named these
docstrings unprospected. Verified at d63c5148 by reading
tool-registration.ts:48-70/:230-280 and the green lifetime test. Dup check:
README index — 0372 covered the PIC-8 stub docstring in the same file; these
two functions' docstrings are the explicitly-deferred remainder.

## Fix (0.384.0)
- What shipped:
  - `src/runtime/tool-registration.ts` — replaced `deriveToolLabel`'s false "V9f-T stub: returns `""`" paragraph with a truthful note of the implemented label rule (fixed respond literal / leading-capitalised basename) and its test lock; deleted `registerToolInCache`'s false "V9f-T stub: … never emitting a collision" paragraph, kept the accurate PIC-44 first paragraph, added a truthful test-lock pointer (§Fix sites 1-2).
  - `tests/tool-registration-lifetime.test.ts` — corrected the file-header comment: "failing tests" → "tests", and replaced the false "These tests red because the V9f bodies are absent…" block with a truthful "the V9f implementation is in place; each test exercises it" statement (§Fix site 3).
- Gates:
  - Witness (documentary, both directions): `grep -c "V9f-T stub"` src at HEAD → 2, fixed → 0; header "failing tests"/"These tests red…" at HEAD → present, fixed → gone.
  - Paired suite: `npx vitest run tests/tool-registration-lifetime.test.ts` → 11/11 green.
  - Full default suite: 10307 tests; all full-suite reds confirmed parallel-load noise (failing set varied run-to-run — "registerCommand host seam absent" / 5000ms timeouts; every implicated file green isolated with 0 failed assertions, e.g. shared-subtree 7/7 in 3.5s).
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/typed-query-wire-shapes.test.ts` → 3/3 green (incl. the `__theta_respond_<canonical slug>` registration cell) under the lane live lock.
  - `npm run typecheck` clean; `npm run lint` clean.
- Review: 1 round — bug-fix-reviewer CLEAN; one non-blocking prose residual (R1: `registerToolInCache` docstring lost its paragraph separator and repeated "PIC-44") resolved in-place as a comment-only polish.
- Verification: VERIFIED — documentary witness both directions; paired suite 11/11; full suite green modulo isolated-confirmed load noise; comment-only diff (every changed line begins `*` or `//`); typecheck + lint clean.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the five `describe("V9f-T — …")` titles and `tool-registration.ts:1` module header are phase-origin labels, not falsities — left untouched per §Non-goals.
