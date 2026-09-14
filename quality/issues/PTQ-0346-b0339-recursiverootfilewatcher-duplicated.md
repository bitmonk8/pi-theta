---
id: PTQ-0346
title: b0339 redeclares b0312's RecursiveRootFileWatcher recursive-root-scoping FileWatcher double instead of sharing it through tests/helpers/fake-file-watcher.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0339-package-source-watch-arming.test.ts:83-137
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0339 redeclares b0312's RecursiveRootFileWatcher recursive-root-scoping FileWatcher double instead of sharing it through tests/helpers/fake-file-watcher.ts

## Observation
tests/b0339-package-source-watch-arming.test.ts declares its own module-scope `RecursiveRootFileWatcher` class — a `FileWatcher` seam double that only delivers a `watch()` handler an event whose path sits under one of the currently-armed roots. Its own doc comment states it "Mirrors b0312's `RecursiveRootFileWatcher`". tests/b0312-out-of-root-thetalib-watch-closure.test.ts already declares a class of the same name whose `emit()` and `#underArmedRoot()` methods — the entire recursive-root-scoping mechanism the double exists to model — are byte-for-byte identical to b0339's. tests/helpers/fake-file-watcher.ts is this suite's established shared home for `FileWatcher`-seam doubles (it already hosts `FakeFileWatcher` and, per PTQ-0236, `RootsRecordingFileWatcher`/`norm`/`waitFor`/`armedRoots`, all of which b0339 already imports from it), but it exports no recursive-root-scoping double, so neither file draws this second double from a shared module.

## Evidence

tests/b0339-package-source-watch-arming.test.ts:90-103 (re-read immediately before filing) — the self-admitted mirror, plus the class's opening:
```ts
 * models the scoping case H turns on. Mirrors b0312's `RecursiveRootFileWatcher`.
 */
class RecursiveRootFileWatcher implements FileWatcher {
  readonly watchCalls: string[][] = [];
  #handler: ((event: FileWatchEvent) => void) | undefined;
  #roots: readonly string[] = [];

  watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    _onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls.push([...roots]);
    this.#handler = handler;
```

tests/b0339-package-source-watch-arming.test.ts:120-134 (re-read immediately before filing) — the `emit()`/`#underArmedRoot()` pair, the recursive-root-scoping mechanism itself:
```ts
  /** Deliver an event, honouring recursive-root scoping (an out-of-root path is dropped). */
  emit(event: FileWatchEvent): void {
    if (this.#handler === undefined) {
      return;
    }
    if (this.#underArmedRoot(event.path)) {
      this.#handler(event);
    }
  }

  #underArmedRoot(path: string): boolean {
    const p = norm(path);
    return this.#roots.some((root) => {
      const r = norm(root);
      return p === r || p.startsWith(r.endsWith("/") ? r : `${r}/`);
```

tests/b0312-out-of-root-thetalib-watch-closure.test.ts:163-177 (pattern context, outside this wave's scope; re-read immediately before filing) — confirmed byte-for-byte identical to the b0339 excerpt directly above via `diff` (zero output over these 15 lines each):
```ts
  /** Deliver an event, honouring recursive-root scoping (an out-of-root path is dropped). */
  emit(event: FileWatchEvent): void {
    if (this.#handler === undefined) {
      return;
    }
    if (this.#underArmedRoot(event.path)) {
      this.#handler(event);
    }
  }

  #underArmedRoot(path: string): boolean {
    const p = norm(path);
    return this.#roots.some((root) => {
      const r = norm(root);
      return p === r || p.startsWith(r.endsWith("/") ? r : `${r}/`);
```

tests/b0312-out-of-root-thetalib-watch-closure.test.ts's own class carries additional bug-0312-specific members (`#onTerminate`, `#live`, a `liveSubscriptions` getter, a `terminate()` method) that b0339's copy omits, so the two classes are not whole-file-identical — the claim here is narrower and confirmed exact: the constructor fields shared by both (`watchCalls`, `#handler`, `#roots`), the `watch()` method's three core assignment lines, the `currentRoots` getter, and the entire `emit()`/`#underArmedRoot()` pair are byte-identical between the two files.

Exact search: `grep -rl "class RecursiveRootFileWatcher" tests --include="*.test.ts"` → exactly 2 files repo-wide (tests/b0312-out-of-root-thetalib-watch-closure.test.ts and tests/b0339-package-source-watch-arming.test.ts); `grep -n "RecursiveRootFileWatcher" tests/helpers/fake-file-watcher.ts` → 0 hits (the shared module hosts no export of this name or shape).

## Why this is a problem
tests/helpers/fake-file-watcher.ts is the suite's already-established, already-used-by-b0339 shared home for `FileWatcher`-seam doubles (b0339 imports `RootsRecordingFileWatcher`/`armedRoots`/`norm`/`waitFor` from it in the very same file). A second, distinct `FileWatcher` double — one that actually honours recursive-root path scoping rather than merely recording the `roots` argument — is redeclared whole in two files instead of being added beside `FakeFileWatcher`/`RootsRecordingFileWatcher` in that same module. b0339's own doc comment names the duplication directly ("Mirrors b0312's `RecursiveRootFileWatcher`"), and the `emit()`/`#underArmedRoot()` pair that gives the double its entire reason to exist is confirmed byte-for-byte identical between the two files.

## Suggested direction (non-binding, optional)
tests/helpers/fake-file-watcher.ts already establishes the convention of one shared module per `FileWatcher`-seam double shape (`FakeFileWatcher` for unconditional delivery, `RootsRecordingFileWatcher` for roots-recording); a third export for the recursive-root-scoping shape is the home both files' own "mirrors" framing already points toward.

## False-positive check
- Gate-pin check: tests/b0339-package-source-watch-arming.test.ts does not match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited lines are a `FileWatcher` seam double's definition, not a pinned count or inventory assertion.
- Recording-double check: `RecursiveRootFileWatcher.watchCalls` does back assertions elsewhere in this suite, but this finding does not claim any assertion built over it cannot fail — it claims the DOUBLE'S OWN CODE (the `emit`/`#underArmedRoot` scoping mechanism) is copy-pasted across two files rather than shared, the same class of claim already accepted for this file pair's other double (PTQ-0236).
- docs/bugs/ signature search: docs/bugs/0339-package-source-present-but-empty-contributing-dir-not-watched.md Status "fixed (0.321.0)"; docs/bugs/0312-out-of-root-thetalib-edits-invisible-stale-imports.md Status "fixed" (referenced only as pattern context). `npx vitest run tests/b0339-package-source-watch-arming.test.ts` → 8 passed (8) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0339-package-source-watch-arming" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl "b0339-package-source-watch-arming" docs/bugs/*.md` → only its own bug document. This finding proposes no merge, rename or deletion of the file or any `it()`/`describe()` — only that the double's definition could be imported rather than redeclared — so no citation is affected.
- Scope note: tests/b0312-out-of-root-thetalib-watch-closure.test.ts is outside this wave's assigned seven-file scope; it is cited only as pattern context (confirming the byte-identity of the duplicated mechanism), not claimed as an additional `location` — mirroring PTQ-0236's and PTQ-0244's own in-scope/pattern-context boundary for out-of-scope sibling files.
- Coverage check: this finding does not claim a missing test path; every line of the double is exercised by b0339's own 8/8 passing tests (confirmed above). The claim is confined to a repeated DEFINITION, not to test behaviour or coverage.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — the emit()/#underArmedRoot() excerpts reproduce byte-identical via independent diff (zero output), grep confirms exactly 2 files repo-wide declare this class and 0 hits in tests/helpers/fake-file-watcher.ts, 8/8 tests pass at HEAD with both docs/bugs entries fixed and 0 coverage-matrix hits, no carve-out applies, and PTQ-0236's confirmed/fixed resolution on this same file pair for a different double is direct precedent (not a duplicate — RecursiveRootFileWatcher is untracked elsewhere) (triage: claude-opus-5)
