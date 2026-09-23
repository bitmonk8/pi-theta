---
id: PTQ-1359
title: toolCallInFlight local-flag assertions in the bug-0469 witness assert only a value the test set itself, never a real observable
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/execution-status-entry-migration-witnesses.test.ts:197-223
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
fix_skips: 1
---

# toolCallInFlight local-flag assertions in the bug-0469 witness assert only a value the test set itself, never a real observable

## Observation
The test "T-ENT — B53 (bug 0469 fix witness): watcher-driven emission mid-in-flight-tool-call is adjacency-safe" declares a local plain object `toolCallInFlight = { toolUseId: ..., settled: false }` that is never passed to, read by, or connected to any of the production code under test (`emitDiagnosticBatch`, `createEntryChannel`, `recordingSystemNoteDeps`). The test asserts `toolCallInFlight.settled` immediately after setting it to `false`, and again immediately after setting it to `true`.

## Evidence
tests/execution-status-entry-migration-witnesses.test.ts:197-223
```ts
  it("live entry channel: the operator-facing batch note lands via appendEntry with ZERO pi.sendMessage calls, even while a tool call is simulated in flight", () => {
    const { pi, appendCalls } = fakeEntryPi();
    const channel = createEntryChannel(pi);
    const { deps, sentMessages } = recordingSystemNoteDeps(channel);

    // Simulate the bug 0469 scenario: the watcher-driven rescan completes
    // WHILE a driven tool call is still open (the assistant's tool_use has
    // been emitted; its toolResult has not arrived yet). Because entries
    // never enter provider replay, the emission's timing relative to that
    // open window is irrelevant to session correctness — the assertion
    // proves it by observing the delivery channel directly: no sendMessage
    // call is made, regardless of the simulated in-flight state.
    const toolCallInFlight = { toolUseId: "toolu_sim_0469", settled: false };
    expect(toolCallInFlight.settled).toBe(false); // precondition: tool call open

    emitDiagnosticBatch(loadDiagnosticBatch(), deps);

    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0]!.customType).toBe(THETA_PROGRESS_ENTRY_TYPE);
    // Nothing reached the message channel — the transcript the toolResult
    // will be parented against is untouched, so adjacency cannot break.
    expect(sentMessages).toHaveLength(0);

    // The simulated tool call settles afterward, unaffected by the note.
    toolCallInFlight.settled = true;
    expect(toolCallInFlight.settled).toBe(true);
  });
```
`toolCallInFlight` is declared, asserted, mutated, and asserted again entirely within this one `it` block; it is never read by `emitDiagnosticBatch`, `createEntryChannel`, `recordingSystemNoteDeps`, or any other production call in the test. No other identifier or call in the surrounding code depends on its value.

## Why this is a problem
`expect(toolCallInFlight.settled).toBe(false)` immediately follows the literal `settled: false` in the object initializer two lines above, and `expect(toolCallInFlight.settled).toBe(true)` immediately follows the literal assignment `toolCallInFlight.settled = true` one line above. Mechanically, each assertion reads back a value the same test statement just wrote, with no intervening call that could change it — there is no code path under which either assertion can fail. The comment says "the assertion proves it by observing the delivery channel directly," which correctly describes the real assertions (`appendCalls`, `sentMessages`) — but the `toolCallInFlight` object itself is not the delivery channel; it is inert decoration that never simulates an in-flight tool call against any production code. The real, falsifiable assertions in this test (`appendCalls`/`sentMessages` counts) already carry the bug-0469 witness value; the `toolCallInFlight` lines add two assertions that cannot fail and do not verify anything about tool-call-in-flight adjacency.

## Suggested direction (non-binding, optional)
The narrative comment already states the actual proof mechanism (observing the delivery channel); the `toolCallInFlight` object and its two `expect` calls could be dropped without changing what the test verifies.

## False-positive check
- Gate-pin carve-out: filename does not match `*gate*.test.ts` or kin; not applicable.
- Recording-double carve-out: `toolCallInFlight` is not a recording double asserting a MUST-NOT-be-called witness — it is a local plain object with no call recording, so this carve-out does not apply.
- docs/bugs/ signature search: searched `docs/bugs/` and `docs/bugs/README.md` for `bug 0469`/`toolCallInFlight`/`B53` — bug 0469 exists (root cause of bug 0470, resolved) but no open docs/bugs/ report cites this test or a pinned red signature matching this assertion; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rl "execution-status-entry-migration-witnesses"` against `docs/reference/coverage-matrix.md` and `docs/bugs/*.md` returned no matches — this test is not pinned by name in either.
- Coverage drift check: this finding is about the existing tautological assertion inside an existing test, not about a missing test or an untested path — no coverage claim is made.

## Triage
verdict: confirmed — excerpt reproduces at tests/execution-status-entry-migration-witnesses.test.ts:197-223; repo-wide grep shows `toolCallInFlight` only at lines 209/210/221/222 of that one `it` block, never passed to emitDiagnosticBatch/createEntryChannel/recordingSystemNoteDeps, so `expect(...settled).toBe(false)` (line 210, one statement after the `settled: false` initializer) and `expect(...settled).toBe(true)` (line 222, one statement after `settled = true`) are D7 assertions that cannot fail; no carve-out applies (not a *gate* test, the inert object is not a recording double — the real negative witness `sentMessages` is untouched by the proposal, docs/bugs/0469 names the offline obligation but cites neither this file nor these assertions, coverage-matrix has no reference); not tracked by any existing PTQ (triage: claude-fable-5-1)

## Fix attempts
- qw20260923093622: skipped — [PTQ-1332-parsedtheta-fixture-builder-duplicated.md] PTQ-1332: removed all 6 local NOOP_RUN/theta ParsedTheta builders across the 5 files and switched every call site to the canonical makeTheta from tests/helpers/watch-arming-harness; in registration-reload-wiring and watcher-terminated-recovery the toEqual(theta(...)) comparisons were rewritten to compare against a single hoisted makeTheta(...) instance (makeTheta's default run mints a fresh function per call, and toEqual treats distinct function refs as unequal — confirmed by an initial red run, then fixed); unused ParsedTheta type imports pruned where the builder was the only user. PTQ-1353: added stderrLinesWithPrefix(calls, prefix) to tests/helpers/compose-workspace-harness.ts (the existing console.error-capture helper home; prefix is a caller argument per the triage's RED-at-HEAD literal-prefix carve-out) and replaced all three cited partitions plus the triage-named fourth partial copy in tests/system-note-channel.test.ts (its spy now records full arg arrays instead of args[0] so the shared projection applies; assertion counts unchanged). PTQ-1338: moved RecordingQueryModel (with the log array as the superset shape) into tests/helpers/scripted-typed-query-harness.ts beside the existing QueryModelDriver doubles; both test files now import it; the b0316 copy gains inert log pushes it never reads; newly-unused type imports pruned. PTQ-1344: added RespondFixture/respondFixtureFor(thetaSource) (memoised per source string) and qry15Body to tests/helpers/scripted-live-session-harness.ts (the home the issue names; carrying the bug-0010/0099 slug-recipe and QRY-15 doc comments); typed-repair-two-phase and typed-two-phase-live keep a one-line respondFixture wrapper over their own theta constant so their 17 call sites are untouched; per the triage correction the drifted third copy in typed-query-provider-gate.test.ts was folded in too, replacing its hand-rolled sha256(JSON.stringify) slug with the canonical respondSchemaSlug path (the fixture is only self-consistent fallback-tool-name plumbing; gate suite passes); dead createHash/lowerQueryResponseSchema/respondSchemaSlug/LoweredSchema/SchemaDecl imports pruned. Verification: the verbatim unset+tsc+npm test gate ran green (705 files, 11780 tests). ||
