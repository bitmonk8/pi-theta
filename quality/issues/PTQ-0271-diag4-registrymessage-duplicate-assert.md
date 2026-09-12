---
id: PTQ-0271
title: code-registry.test.ts's DIAG-4 test asserts the same registryMessage(...) comparison twice, the second time via a hand-typed duplicate
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/code-registry.test.ts:172-190
sites: 1
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# code-registry.test.ts's DIAG-4 test asserts the same registryMessage(...) comparison twice, the second time via a hand-typed duplicate

## Observation
`tests/code-registry.test.ts`'s DIAG-4 test asserts that
`registryMessage(registry, "theta/parse/binding-case-mismatch")` equals a
literal string, then three lines later builds a local `emitted` object whose
`code` and `message` fields are hand-typed copies of those same two literals,
and asserts `emitted.message` equals `registryMessage(registry,
emitted.code)`. `registryMessage` is a pure lookup
(`registry.find((row) => row.code === code)?.message`) with no mutation of
`registry` in between the two assertions.

## Evidence
`tests/code-registry.test.ts:172-186`:
```ts
  it("DIAG-4: registryMessage returns the registry's normative Message string, and an asserting test sources its expected message from it", () => {
    const registry = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

    // theta/parse/binding-case-mismatch — Message column (placeholder-free).
    expect(
      registryMessage(registry, "theta/parse/binding-case-mismatch"),
    ).toBe("binding name must start with a lowercase letter or _");

    // The normative discipline: an asserting test's expected message string is
    // the registry's, sourced via registryMessage rather than copy-pasted prose.
    const emitted = {
      code: "theta/parse/binding-case-mismatch",
      message: "binding name must start with a lowercase letter or _",
    };
    expect(emitted.message).toBe(registryMessage(registry, emitted.code));
```

`tools/code-registry/index.js:88-90` (the function both calls resolve
through — a pure lookup, no memoisation or hidden state):
```js
export function registryMessage(registry, code) {
  return registry.find((row) => row.code === code)?.message;
}
```

## Why this is a problem
Substituting `emitted`'s two literal fields, the `expect` at line 186 is
`expect("binding name must start with a lowercase letter or _").toBe(
registryMessage(registry, "theta/parse/binding-case-mismatch"))` — the exact
same `registryMessage` call over the exact same `registry`, compared against
the exact same string, as the `expect` at lines 176-178, only with the two
operands swapped. Vitest's `expect(...).toBe(...)` throws synchronously on a
mismatch, so if lines 176-178 had failed the test function would already
have stopped before reaching line 186; line 186 therefore only ever executes
once lines 176-178 have already succeeded, and since it recomputes the
identical `registryMessage` call against the identical constant it is then
guaranteed to hold too — it cannot disagree with the assertion two lines
above it. The comment directly above line 186 ("sourced via registryMessage
rather than copy-pasted prose") describes a discipline this code does not
demonstrate: `emitted.message` is itself a second hand-typed copy of the
prose string, not a value derived from a call to `registryMessage`, so this
second assertion verifies nothing beyond what lines 176-178 already
established.

## Suggested direction (non-binding, optional)
None offered beyond the observation above; the fix stage owns whether the
second assertion is removed or reworked to check a value actually derived
from `registryMessage` rather than a second literal.

## False-positive check
- Gate-pin check: `tests/code-registry.test.ts` does not match
  `*gate*.test.ts` and is not among the named kin (`closing-gate`,
  `cross-cutting-gates`, `rfc-*-spec-surface-gate`,
  `committed-fixture-parse-gate`, `registry-closed-set-corpus-gate` — the
  last of which is the separate file `tests/registry-closed-set-corpus-gate.test.ts`,
  added by bug 0230's fix, not this file). No pinned count or inventory is at
  issue; the claim is about one internal assertion's redundancy.
- Recording-double check: not applicable — `emitted` is a plain literal
  object, not a fake, double, or MUST-NOT witness; no "never called"
  property is asserted here.
- docs/bugs/ signature search: `grep -rln "emitted\.message\|DIAG-4" docs/bugs/`
  surfaces `docs/bugs/0230-diag-2-closed-set-not-gated-corpus-wide.md`, which
  discusses this file at length — it names `tests/code-registry.test.ts:169`
  as "DIAG-4 has a live-corpus foothold" and explains why live-registry
  `registryMessage` reads across the suite act as a canary against a
  silently deleted registry row — and `docs/bugs/0216-shutdown-reason-classification-unwired.md`,
  which cites `tests/code-registry.test.ts:58`, `:128`, `:165` labelled
  collectively as "the DIAG-2/3/4 gates", though none of those three specific
  line numbers falls inside this finding's cited 172–190 range (they land in
  the DIAG-2 and DIAG-3 blocks that precede it). Neither document discusses
  or rationalises the specific duplicate `emitted.message`/
  `registryMessage(registry, emitted.code)` comparison at line 186; 0230's
  argument is about why the registry must be read live at all (DIAG-4's
  message-sourcing discipline across the whole suite), not about why this
  one test needs two assertions of the same proposition.
- coverage-matrix/bug-doc citation search: `grep -n "code-registry.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of the test — only that one of its internal
  assertions duplicates another already present in the same test body.
- Currently green: `npx vitest run tests/code-registry.test.ts` → 1 file, 5
  tests passed, confirming the cited lines are live, executing assertions,
  not dead or skipped code.

## Triage
verdict: confirmed — evidence reproduces exactly (tests/code-registry.test.ts:172-190, registryMessage a pure lookup with no state), the line-186 assert is algebraically the line-176-178 assert with operands swapped over identical literals so it cannot independently fail, no gate-pin/recording-double/coverage-matrix carve-out applies, and neither docs/bugs/0230:288 nor 0216:101 rationalises this specific duplicate (both verified by direct read) (triage: claude-opus-5)
