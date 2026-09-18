---
id: PTQ-0764
title: requireLiveHost() is called without await or a return-value check at nine sites in noninteractive-acceptance.test.ts, so its precondition assertion cannot fail there
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/noninteractive-acceptance.test.ts:142
  - tests/live/acceptance/noninteractive-acceptance.test.ts:171
  - tests/live/acceptance/noninteractive-acceptance.test.ts:214
  - tests/live/acceptance/noninteractive-acceptance.test.ts:268
  - tests/live/acceptance/noninteractive-acceptance.test.ts:343
  - tests/live/acceptance/noninteractive-acceptance.test.ts:386
  - tests/live/acceptance/noninteractive-acceptance.test.ts:411
  - tests/live/acceptance/noninteractive-acceptance.test.ts:438
  - tests/live/acceptance/noninteractive-acceptance.test.ts:466
sites: 9
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# requireLiveHost() is called without await or a return-value check at nine sites in noninteractive-acceptance.test.ts, so its precondition assertion cannot fail there

## Observation
`tests/live/acceptance/harness.ts` declares `requireLiveHost` as
`export async function requireLiveHost(): Promise<{ readonly modelId: string }>`.
Every one of the nine H9a-T area tests in `noninteractive-acceptance.test.ts`
calls it as a bare statement, `requireLiveHost();`, with no `await`, no
`.then`/`.catch`, and no read of the resolved `modelId`. Elsewhere in this
review's scope (e.g. `nested-fn-under-par-for-live.test.ts:179-183`,
`non-literal-discriminator-live.test.ts:176-180`) the same function is called
as `const { modelId } = await requireLiveHost(); if (modelId.length === 0) { failLoudly(...); }`
— the pattern the function's own doc comment assumes ("Returns the resolved
model id … the same host `spawnPiPrint` drives against").

## Evidence

`tests/live/acceptance/harness.ts` (the function's signature and contract):
```ts
export async function requireLiveHost(): Promise<{ readonly modelId: string }> {
  return { modelId: (await resolveAcceptanceHost()).model };
}
```

`tests/live/acceptance/noninteractive-acceptance.test.ts:136-146` (area (a),
representative of all nine sites):
```ts
describe("H9a-T (a) prompt-mode sentinel turn (Convention: Phase 1 acceptance)", () => {
  it("drives one prompt-mode turn via `pi -p` with a no-error exit and permitted codes only", async () => {
    const spec = featureTheta("prompt-sentinel");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
```

Exact search: `grep -n "^\s*requireLiveHost();\s*$" tests/live/acceptance/noninteractive-acceptance.test.ts` returns exactly nine hits: lines 142, 171, 214, 268, 343, 386, 411, 438, 466 — one per H9a-T area (a) through (i) (area (i) at line 466 calls it once and then drives two spawns).

Contrast, the correctly-awaited-and-checked form used in this same review's
scope, `tests/live/acceptance/nested-fn-under-par-for-live.test.ts:179-183`:
```ts
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }
```

## Why this is a problem
`requireLiveHost()`'s only observable effect is its returned Promise: it
resolves to `{ modelId }` on success, or its inner `resolveAcceptanceHost()`
call rejects (via `assert.fail` inside `failLoudly`) when no live
provider/model is configured. At each of the nine cited call sites the
returned Promise is discarded with no `await`, so within that `it()` body's
synchronous continuation nothing reads `modelId` and nothing observes a
rejection through the test's assertion chain — the statement's return value
is thrown away exactly as if the call had not been made. Mechanically, this
particular statement cannot make its enclosing test fail: a missing
precondition can only surface later, through the unrelated, separately-await
`resolveAcceptanceHost()` call already made inside `spawnPiPrint` two lines
below (`tests/live/acceptance/harness.ts`, `spawnPiPrint`'s own
`const host = await resolveAcceptanceHost();`) — a real fail-loud path, but
one the `requireLiveHost();` statement contributes nothing to. The statement
reads as the same live-host precondition check every sibling file in this
review's scope performs (compare the `nested-fn-under-par-for-live.test.ts`
excerpt above), but with the `await`, the destructure, and the
`if (modelId.length === 0)` check all absent, it is inert.

## Suggested direction (non-binding, optional)
None of the nine call sites currently reads `requireLiveHost()`'s result;
awaiting it (with or without the `modelId.length === 0` check the sibling
files perform) is the direction the function's own contract and this file's
sibling acceptance files already point at.

## False-positive check
- Gate-pin check: `noninteractive-acceptance.test.ts` does not match
  `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: not applicable — `requireLiveHost` is a
  precondition resolver, not a recording double.
- docs/bugs/ signature search: `grep -rl "requireLiveHost" docs/bugs/*.md`
  returns no hits; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "noninteractive-acceptance"
  docs/reference/coverage-matrix.md` — the file is referenced by name as the
  H9a-T Phase 1 acceptance suite; this finding proposes no merge, rename, or
  deletion of any test, area, or `it()` — only that nine existing statements'
  return values go unread.
- Bug-vs-D7 boundary check: the suite does not silently pass with a missing
  live host — `spawnPiPrint`'s own internal `resolveAcceptanceHost()` call
  (awaited, inside `tests/live/acceptance/harness.ts`) still fails loudly on
  that precondition a few lines after each cited site, so no test in this
  file passes vacuously when the precondition is unmet; the finding is
  confined to the inert statement itself (an assertion that cannot fail),
  not to a claim that the suite's overall behaviour is wrong or flaky.
- Overlap check: `grep -ril "requireLiveHost" quality/intake` before filing
  surfaced `qw20260917154546-d7-01-live-host-precondition-guard-duplicated.md`
  (a different topic — duplicated *guard text* across a different, 11-file
  set that does not include `noninteractive-acceptance.test.ts`) and
  `qw20260917154546-d7-69-acceptance-offender-probe-clean-harness-duplicated.md`
  (a different topic, harness duplication) — neither addresses the unawaited,
  return-value-discarded call shape observed here.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: `grep -n "^\s*requireLiveHost();\s*$"` returns exactly the nine cited lines (142,171,214,268,343,386,411,438,466) and every other caller in tests/live/acceptance (40+ files) uses `const { modelId } = await requireLiveHost()`; harness.ts:423-425 matches verbatim, and resolveAcceptanceHost (harness.ts:77-105) rejects only on `getAvailable().length === 0` — a case spawnPiPrint's own awaited `resolveAcceptanceHost()` (harness.ts:462) already reds two lines later — while the `idOf()` `""` fallback (empty model id) is signalled solely through the return value these nine sites discard, so the statement contributes nothing to the enclosing test's verdict; one correction to the filing's FP check: `grep -rl requireLiveHost docs/bugs/*.md` returns 2 hits, not 0, but docs/bugs/0030 §Residuals (ii) names exactly these nine unawaited sites as "a candidate follow-up filing" (corroboration, not a documented correct-reason red); no gate/recording-double/coverage-matrix carve-out applies and no PTQ tracks this root cause (d7-01's triage note already distinguishes it) (triage: claude-fable-5-1)
