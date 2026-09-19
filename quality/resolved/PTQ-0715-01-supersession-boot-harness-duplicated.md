---
id: PTQ-0715
title: supersession-inflight-rebuild-quiesce.test.ts redeclares supersession-detach-throw-containment.test.ts's RecordingFakeClock/watcherAt/wiringAt/registryKeys/structuralNotes/sleep instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/supersession-detach-throw-containment.test.ts:252-258
  - tests/supersession-detach-throw-containment.test.ts:398-404
  - tests/supersession-detach-throw-containment.test.ts:406-412
  - tests/supersession-detach-throw-containment.test.ts:414-416
  - tests/supersession-detach-throw-containment.test.ts:434-436
  - tests/supersession-detach-throw-containment.test.ts:439-441
  - tests/supersession-inflight-rebuild-quiesce.test.ts:523-529
  - tests/supersession-inflight-rebuild-quiesce.test.ts:837-843
  - tests/supersession-inflight-rebuild-quiesce.test.ts:845-851
  - tests/supersession-inflight-rebuild-quiesce.test.ts:854-856
  - tests/supersession-inflight-rebuild-quiesce.test.ts:859-861
  - tests/supersession-inflight-rebuild-quiesce.test.ts:868-870
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# supersession-inflight-rebuild-quiesce.test.ts redeclares supersession-detach-throw-containment.test.ts's RecordingFakeClock/watcherAt/wiringAt/registryKeys/structuralNotes/sleep instead of importing them

## Observation
tests/supersession-inflight-rebuild-quiesce.test.ts's own header comment
states "Harness: mirrors tests/supersession-detach-throw-containment.test.ts
(bug 0029's landed lock) … the real `createThetaExtension` +
`composeExtensionInstance` over a mkdtemp temp-dir workspace, hand-rolled
pi/ctx fakes … ONE shared window-recording `FakeClock`, one `FakeFileWatcher`
per compose". Six module-scope declarations in the later file —
`RecordingFakeClock`, `watcherAt`, `wiringAt`, `registryKeys`,
`structuralNotes`, `sleep` — are either byte-identical or renamed-parameter
copies of the same declarations in the earlier file, rather than imports of
them.

## Evidence

`RecordingFakeClock` — byte-identical class body.

tests/supersession-detach-throw-containment.test.ts:252-258:
```ts
class RecordingFakeClock extends FakeClock {
  readonly armedWindows: number[] = [];

  override setTimeout(fn: () => void, ms: number): TimerHandle {
    this.armedWindows.push(ms);
    return super.setTimeout(fn, ms);
  }
}
```

tests/supersession-inflight-rebuild-quiesce.test.ts:523-529:
```ts
class RecordingFakeClock extends FakeClock {
  readonly armedWindows: number[] = [];

  override setTimeout(fn: () => void, ms: number): TimerHandle {
    this.armedWindows.push(ms);
    return super.setTimeout(fn, ms);
  }
}
```

`watcherAt` / `wiringAt` — identical bodies (only the watcher subclass's
return type name differs).

tests/supersession-detach-throw-containment.test.ts:398-412:
```ts
function watcherAt(b: Boot, index: number): ProductionShapeFakeFileWatcher {
  const watcher = b.watchers[index];
  if (watcher === undefined) {
    throw new Error(`compose #${index + 1} never created its watcher`);
  }
  return watcher;
}

function wiringAt(b: Boot, index: number): ExtensionInstanceWiring {
  const wiring = b.wirings[index];
  if (wiring === undefined) {
    throw new Error(`compose #${index + 1} never resolved its wiring`);
  }
  return wiring;
}
```

tests/supersession-inflight-rebuild-quiesce.test.ts:837-851:
```ts
function watcherAt(b: Boot, index: number): CountingFakeFileWatcher {
  const watcher = b.watchers[index];
  if (watcher === undefined) {
    throw new Error(`compose #${index + 1} never created its watcher`);
  }
  return watcher;
}

function wiringAt(b: Boot, index: number): ExtensionInstanceWiring {
  const wiring = b.wirings[index];
  if (wiring === undefined) {
    throw new Error(`compose #${index + 1} never resolved its wiring`);
  }
  return wiring;
}
```

`registryKeys` — byte-identical.

tests/supersession-detach-throw-containment.test.ts:434-436:
```ts
function registryKeys(b: Boot, index: number): readonly string[] {
  return [...wiringAt(b, index).registry.snapshot().keys()].sort();
}
```

tests/supersession-inflight-rebuild-quiesce.test.ts:854-856:
```ts
function registryKeys(b: Boot, index: number): readonly string[] {
  return [...wiringAt(b, index).registry.snapshot().keys()].sort();
}
```

`structuralNotes` — same filter, renamed-only parameter (`harness: Harness`
vs. `b: Boot` with one extra `.harness` hop).

tests/supersession-detach-throw-containment.test.ts:439-441:
```ts
function structuralNotes(harness: Harness): readonly RecordedNote[] {
  return harness.notes.filter((n) => n.content.startsWith(STRUCTURAL_NOTE_PREFIX));
}
```

tests/supersession-inflight-rebuild-quiesce.test.ts:859-861:
```ts
function structuralNotes(b: Boot): readonly RecordedNote[] {
  return b.harness.notes.filter((n) => n.content.startsWith(STRUCTURAL_NOTE_PREFIX));
}
```

`sleep` — byte-identical.

tests/supersession-detach-throw-containment.test.ts:414-416:
```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

tests/supersession-inflight-rebuild-quiesce.test.ts:868-870:
```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

## Why this is a problem
Six named pieces of harness code are retyped verbatim (or renamed-parameter
verbatim) in the second file, and that file's own header comment names the
exact source file it mirrors. `grep -rn "class RecordingFakeClock" tests/`
returns exactly these two hits; `grep` for `function watcherAt(b: Boot`,
`function wiringAt(b: Boot`, `function registryKeys(b: Boot` and
`function structuralNotes(` across `tests/` shows this `watcherAt`/`wiringAt`
loud-indexed-access pair and `registryKeys` shape also independently
duplicated in a third and fourth file
(tests/double-session-start-supersession.test.ts,
tests/rebind-self-collision-reownership.test.ts, filed separately as
qw20260917154546-d7-01-rebind-self-collision-double-session-start-harness-duplicated.md),
so this is a recurring shape in this bug-witness-suite family with no
`tests/helpers/` module yet holding the `Boot`-with-per-generation-
watcher/wiring-array skeleton these two in-scope files share.

## Suggested direction (non-binding, optional)
tests/helpers/fake-file-watcher.ts and tests/helpers/fake-clock.ts already
hold the base doubles both files extend; noting that a `tests/helpers/`
module for the shared `RecordingFakeClock` + `watcherAt`/`wiringAt`/
`registryKeys`/`structuralNotes`/`sleep` sextet has no home yet, despite two
in-scope files needing it verbatim, is an observation about the existing
convention (mirrored by the sibling watch-arming-harness.ts extraction), not
a design proposal.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); nothing
  cited here is a pinned count or inventory assertion.
- Recording-double check: `RecordingFakeClock`/`registryKeys`/
  `structuralNotes` do back MUST-NOT/must-witness observations elsewhere in
  each file, but this finding targets the duplicated CODE building those
  observations, not any single recording-double witness itself.
- docs/bugs/ signature search: both files are documented correct-reason RED
  witness suites for docs/bugs/0029-throwing-supersession-detach-swallowed-watcher-rearmed.md
  and docs/bugs/0034-supersession-does-not-await-whenidle.md (both now
  Status: fixed); this finding does not contest either file's red/green
  status or behaviour, only the harness code both depend on regardless of
  either bug's resolution.
- coverage-matrix/bug-doc citation search:
  `grep -rn "supersession-detach-throw-containment\|supersession-inflight-rebuild-quiesce" docs/reference/coverage-matrix.md docs/bugs/`
  returns no hits in coverage-matrix.md; each file is its own bug doc's
  witness suite by filename convention, not by an explicit witness-list
  citation. This finding proposes no merge, rename, or deletion of either
  file.
- Coverage-drift check: the claim is about harness code duplicated across two
  files that both exist and both pass today, not about a missing test path.

## Triage
verdict: confirmed — independently re-verified: all 12 excerpts match at the cited lines (RecordingFakeClock 252-258/523-529, watcherAt/wiringAt 398-412/837-851, sleep 414-416/868-870, registryKeys 434-436/854-856 byte-identical; structuralNotes 439-441/859-861 renamed-parameter only), quiesce's header at :197-201 names detach-throw-containment as the mirrored harness, `grep "class RecordingFakeClock" tests/` returns exactly these two hits, both Boot interfaces share the same harness/clock/watchers/wirings skeleton (:328-336 / :654-662), every copy is live (15/17 watcherAt, 9/14 wiringAt, 7/9 registryKeys, 7/3 structuralNotes, 3/10 sleep call sites), all locations are under tests/, neither file is a gate suite, no merge/rename/delete is proposed against the docs/bugs 0029:165 / 0034:215 offline-lock citations, and no existing PTQ row covers this file pair (PTQ-0363 is b0339/b0310; the sibling d7-01 intake is double-session-start/rebind-self-collision) — a copy-paste fixture/double whose fix is a mechanical tests/helpers extraction (triage: claude-fable-5-1)
