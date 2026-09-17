---
id: PTQ-0712
title: subagent-tool-admission.test.ts retypes the callableSetOf frozen-snapshot reader that two sibling production-load test files already carry
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-tool-admission.test.ts:196-203
  - tests/nested-tools-entry-containment.test.ts:530-545
  - tests/tool-arg-runtime-schema-validation.test.ts:151-166
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# subagent-tool-admission.test.ts retypes the callableSetOf frozen-snapshot reader that two sibling production-load test files already carry

## Observation
`tests/subagent-tool-admission.test.ts` declares a module-scope
`callableSetOf(name)` function that looks up a registered fixture by
`slashName`, asserts (via a defined precondition check) that the fixture and
its threaded `callableSet` snapshot both exist, and returns the snapshot.
Two sibling production-load test files — both driving the same
`discoverAndComposeFixtures` seam over a planted `.pi/theta/` workspace —
already declare a function of the same name performing the identical two
lookups and the identical two precondition checks over the identical
`{ callableSet?: CallableSetSnapshot }` cast, under the same one-line doc
comment ("Read the frozen callable-set snapshot threaded onto a … fixture.").
No `tests/helpers/` module exports this reader.

## Evidence

tests/subagent-tool-admission.test.ts:196-203 (re-read immediately before
filing):
```ts
/** Read the frozen callable-set snapshot threaded onto a runnable fixture. */
function callableSetOf(name: string): CallableSetSnapshot {
  const fixture = outcome.fixtures.find((f) => f.slashName === name);
  expect(fixture, `fixture '${name}' was not registered`).toBeDefined();
  const snapshot = (fixture as unknown as { callableSet?: CallableSetSnapshot }).callableSet;
  expect(snapshot, `fixture '${name}' carries no callableSet snapshot`).toBeDefined();
  return snapshot as CallableSetSnapshot;
}
```

tests/nested-tools-entry-containment.test.ts:530-545 (re-read immediately
before filing — same doc comment, same two-lookup/two-precondition shape,
longer failure messages):
```ts
/** Read the frozen callable-set snapshot threaded onto a registered fixture. */
function callableSetOf(slashName: string): CallableSetSnapshot {
  const fixture = outcome.fixtures.find((f) => f.slashName === slashName);
  expect(
    fixture,
    `PRECONDITION: fixture '${slashName}' was not registered. Registered: ` +
      `${JSON.stringify(outcome.registered)}; notified: ` +
      JSON.stringify(outcome.notifications),
  ).toBeDefined();
  const snapshot = (fixture as unknown as { callableSet?: CallableSetSnapshot })
    .callableSet;
  expect(
    snapshot,
    `PRECONDITION: fixture '${slashName}' carries no callableSet snapshot`,
  ).toBeDefined();
  return snapshot as CallableSetSnapshot;
```

tests/tool-arg-runtime-schema-validation.test.ts:151-166 (re-read
immediately before filing — same shape again):
```ts
/** Read the frozen callable-set snapshot threaded onto a runnable fixture. */
function callableSetOf(slashName: string): CallableSetSnapshot {
  const fixture = loadOutcome.fixtures.find((f) => f.slashName === slashName);
  expect(
    fixture,
    `PRECONDITION: fixture '${slashName}' was not registered by the production load ` +
      `path. Registered: ${JSON.stringify(loadOutcome.registered)}; notified: ` +
      JSON.stringify(loadOutcome.notifications),
  ).toBeDefined();
  const snapshot = (fixture as unknown as { callableSet?: CallableSetSnapshot }).callableSet;
  expect(
    snapshot,
    `PRECONDITION: fixture '${slashName}' carries no callableSet snapshot, so the ` +
      "threading assertion below has nothing to read",
  ).toBeDefined();
  return snapshot as CallableSetSnapshot;
```

Search performed: `grep -rn "^function callableSetOf" tests/*.test.ts` → four
hits total: the three above plus `tests/session-control-callable-set.test.ts`'s
differently-named/shaped `piToolNamesOf`, which is not the same function and
is not counted here. `grep -rln "CallableSetSnapshot" tests/helpers/*.ts` →
0 hits — no `tests/helpers/` module exports a `CallableSetSnapshot` reader
of any name.

## Why this is a problem
Three test files that each drive a `discoverAndComposeFixtures`-shaped
production load and then read the frozen `callableSet` snapshot off a
registered fixture each retype the same two-lookup/two-precondition reader
function under the same name and the same doc comment, rather than sharing
one parameterised version (the outcome/registered/notified field names the
three files' own `expect(...)` messages read from already differ only in
which local variable holds the load outcome).

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export of `callableSetOf(outcome, name)` —
parameterised by the load-outcome object each file already produces from
its own `discoverAndComposeFixtures` call — is the home the three
near-identical copies point toward; each file's own outcome-shape and
precondition-message wording is the part that would stay local.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named kin; the cited lines are a snapshot-reader function, not a pinned
  count or inventory assertion.
- Recording-double check: `callableSetOf` reads a frozen snapshot off a
  fixture, it does not record calls to back a MUST-NOT witness; not
  applicable.
- docs/bugs/ signature search: `grep -rl "function callableSetOf" docs/bugs/*.md`
  → 0 hits; the in-scope file's governing spec (RFC-0005 + bug 0001) does
  not call for a per-file re-derivation of this reader.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-tool-admission\|nested-tools-entry-containment\|tool-arg-runtime-schema-validation"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any of the three files or any
  `describe`/`it` block — only that the identical reader function could be
  imported from one shared helper.
- Overlap check: `grep -rl "callableSetOf" quality/intake/*.md
  quality/resolved/*.md` → no hits before this filing; no prior candidate
  names this reader's duplication.
- Coverage-drift check: the claim is about a repeated reader-function
  DEFINITION, not a missing test path; each of the three files' own tests
  already exercise their local copy and pass.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at the cited lines and `grep -rn "function callableSetOf" tests/` yields exactly those three module-scope definitions (same find-by-slashName → `{ callableSet?: CallableSetSnapshot }` cast → two toBeDefined preconditions → return shape, differing only in the outcome local and message wording), each live (10/5/1 call sites); no tests/helpers/ module exports a snapshot reader (tool-call-dispatch-harness.ts only mentions CallableSetSnapshot as the `thetaWithSet` builder's parameter, so the candidate's "0 hits" is off by one but its conclusion stands); all locations in tests/, none a gate test or recording double, coverage-matrix cites none of the three files, and PTQ-0237/PTQ-0238 cover other sections of these files (registry oracle, span/objArg harness), not this reader — D7 boilerplate-duplication class, mechanical dedupe into a `callableSetOf(outcome, name)` helper (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
