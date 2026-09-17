---
id: PTQ-0589
title: "T-ENT B50's test name claims live() reports dead after a failed append but the body never calls live()"
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-entry-channel.test.ts:142-152
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# T-ENT B50's test name claims live() reports dead after a failed append but the body never calls live()

## Observation
B50's `it` title reads "first append fails-through, live() then reports
dead, second append also fails-through" — a three-part claim: (1) the first
append falls back, (2) `channel.live()` reports dead after that failure, (3)
the second append also falls back. The body only drives two `append()` calls
and asserts their boolean return values plus `appendCalls` length; it never
calls `channel.live()`. The sibling tests B48 and B49 in the same file (lines
109-136) DO call `channel.live()` to assert the dead state directly.

## Evidence
tests/execution-status-entry-channel.test.ts:142-152
```ts
describe("T-ENT — B50: appendEntry throws on note N -> permanent degrade for N and N+1", () => {
  it("first append fails-through, live() then reports dead, second append also fails-through", () => {
    const { pi, appendCalls } = fakePi({ appendEntryThrows: true });
    const channel = createEntryChannel(pi);
    const firstDelivered = channel.append(BATCH_NOTE);
    const secondDelivered = channel.append(STRUCTURAL_NOTE);
    expect(firstDelivered, "N: falls back to sendMessage").toBe(false);
    expect(secondDelivered, "N+1: permanent degrade, also falls back").toBe(false);
    expect(appendCalls).toHaveLength(0);
  });
});
```

Exact search confirming no `live()` call anywhere in this test body or file
outside the two sibling tests:
```
$ grep -n "live()" tests/execution-status-entry-channel.test.ts
109:  it("live() is false and append() returns false (absent pi.appendEntry: no surface to deliver through)", () => {
112:    expect(channel.live()).toBe(false);
124:  it("live() is false; a later append() still returns false", () => {
127:    expect(channel.live()).toBe(false);
143:  it("first append fails-through, live() then reports dead, second append also fails-through", () => {
```
Line 143 is the `it` title text itself (the string "live()" inside the title)
— there is no executable call to `channel.live()` anywhere in that test's
body (lines 144-150).

## Why this is a problem
A reader following the title would conclude this test pins that `live()`
transitions to reporting dead once `appendEntry` has thrown once — the exact
observable the two neighbouring B48/B49 tests use `channel.live()` to check.
Mechanically, the body only asserts the two `append()` return values and the
`appendCalls` count; an implementation that left `channel.live()` returning
`true` after the throw (while still degrading `append()`'s return value some
other way) would pass this test unchanged, because the assertion the title
promises — reading `live()` after the first failure — never executes.

## Suggested direction (non-binding, optional)
The test could insert `expect(channel.live()).toBe(false)` between the first
and second `append()` calls, mirroring the pattern already used in the B48
and B49 tests in the same file.

## False-positive check
- Gate-pin carve-out: filename is `execution-status-entry-channel.test.ts`, does not match `*gate*.test.ts` or any listed gate kin — not applicable.
- Recording-double carve-out: `fakePi` here is a genuine recording double, but the missing assertion is a direct `channel.live()` read, not a "never called" witness on the fake — not applicable.
- docs/bugs/ signature search: `grep -rn "B50" docs/bugs/` found no report naming this test's failure signature as a documented correct-reason red; the suite runs green at HEAD.
- coverage-matrix/bug-doc citation search: `grep -rn "execution-status-entry-channel.test.ts" docs/reference/coverage-matrix.md docs/bugs/*.md` found one hit, docs/bugs/0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md:215, which cites the FILE as a whole ("Witnessed offline by tests/execution-status-entry-channel.test.ts (delivery as an entry per class, the absent-member / throwing-registration / throwing-append degrade ladder, no dedup, and byte-identical renderer lines)") without naming this specific test by its title. This finding does not propose merging, renaming, or deleting the test — it observes a name/body mismatch within the existing test, leaving the file and its witness role for bug 0469 untouched.
- Coverage drift check: this finding does not argue live()-after-failure is untested in general (B48/B49 already cover the absent-surface and throwing-registration cases); it is scoped to this one test's own name-vs-body mismatch.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: excerpt matches tests/execution-status-entry-channel.test.ts:142-152 verbatim; `grep -n "live()"` reproduces (executable calls only at 112/127 in B48/B49; line 143 is the B50 title string; lines 18/20 are header comments); the body's two `append()` returns and `appendCalls` length never read `channel.live()`, while src/extension/execution-status/entry-channel.ts:60-75 shows `live()` is `!dead` and the append catch arm is the only place that flips `dead = true` — so the title's asserted transition is the one observable the test leaves unpinned (D7 misleading name, in tests/); not a gate test, not a recording-double negative witness, suite green (10/10), docs/bugs/0469:215 cites the file only, no quality/ row tracks this test (triage: claude-fable-5-1)
