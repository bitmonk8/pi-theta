---
id: PTQ-0894
title: load-warning-delivery.test.ts redeclares e2e-s6-load-emit-toast-path.test.ts's GOOD_THETA/BAD_THETA fixtures and ctx double byte-identically
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/load-warning-delivery.test.ts:129-144
  - tests/load-warning-delivery.test.ts:387-402
  - tests/e2e-s6-load-emit-toast-path.test.ts:36-47
  - tests/e2e-s6-load-emit-toast-path.test.ts:70-81
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# load-warning-delivery.test.ts redeclares e2e-s6-load-emit-toast-path.test.ts's GOOD_THETA/BAD_THETA fixtures and ctx double byte-identically

## Observation
`tests/load-warning-delivery.test.ts`'s own header comment states its
helper-path cells drive "the REAL `discoverAndComposeFixtures` (the
`tests/e2e-s6-load-emit-toast-path.test.ts` harness)". Both files declare a
module-level `GOOD_THETA` constant with a byte-identical string value, a
module-level `BAD_THETA` constant with a byte-identical string value, and a
`makeCtx`/`makeHelperCtx` function of the identical three-parameter
signature `(cwd, hasUI, recorder)` whose body — `cwd`, `hasUI`,
`modelRegistry.getAvailable`, and the `ui.notify` closure pushing
`{ message, type }` — is byte-for-byte identical between the two files.
Neither file imports the other's declaration, and no `tests/helpers/`
module exports this fixture pair or this `ctx` double.

## Evidence
`tests/load-warning-delivery.test.ts:129-144`:
```ts
const GOOD_THETA = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join(
  "\n",
);

/**
 * The ERROR control (reused from tests/load-phase-pre-eval-routing.test.ts):
 * `tools:` names an unknown Pi tool → theta/load/unknown-tool (E), theta
 * dropped, failure note-routed. Error routing must be UNCHANGED by the fix.
 */
const BAD_THETA = [
  "---",
  "mode: prompt",
  "tools: totally_unknown_xyz",
  "---",
  "@`hi`",
  "",
].join("\n");
```

`tests/e2e-s6-load-emit-toast-path.test.ts:36-47` — the same two string
values, differing only in the comment text:
```ts
const GOOD_THETA = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join(
  "\n",
);
// `tools:` names a Pi tool absent from the threaded registry →
// `theta/load/unknown-tool` (error-severity ERR-6). The theta is dropped.
const BAD_THETA = [
  "---",
  "mode: prompt",
  "tools: totally_unknown_xyz",
  "---",
  "@`hi`",
  "",
].join("\n");
```

`tests/load-warning-delivery.test.ts:387-402` (`makeHelperCtx`):
```ts
function makeHelperCtx(
  cwd: string,
  hasUI: boolean,
  recorder: HelperRecorder,
): ExtensionContext {
  return {
    cwd,
    hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: string): void => {
        recorder.notifications.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;
}
```

`tests/e2e-s6-load-emit-toast-path.test.ts:70-81` (`makeCtx`) — the same
body, one line shorter only because the signature is written on one line:
```ts
function makeCtx(cwd: string, hasUI: boolean, recorder: Recorder): ExtensionContext {
  return {
    cwd,
    hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: string): void => {
        recorder.notifications.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;
}
```

Exact search re-run immediately before filing: `grep -n "^const GOOD_THETA\|^const BAD_THETA" tests/load-warning-delivery.test.ts tests/e2e-s6-load-emit-toast-path.test.ts` finds exactly one declaration of each per file, at the cited lines; the `.join("\n")` array-literal segments of `GOOD_THETA` and `BAD_THETA` diff byte-for-byte identical between the two files (only the surrounding comment text differs). `grep -n "^function makeCtx\|^function makeHelperCtx" tests/load-warning-delivery.test.ts tests/e2e-s6-load-emit-toast-path.test.ts` finds exactly one declaration of each; the function bodies (excluding the signature line) diff to zero bytes.

## Why this is a problem
The two fixture strings and the `ctx` double that the file's own header
comment names as originating from `tests/e2e-s6-load-emit-toast-path.test.ts`
are re-typed rather than imported, so the helper-path cells in
`load-warning-delivery.test.ts` and the cells in
`e2e-s6-load-emit-toast-path.test.ts` that the header comment says they
mirror have two independent copies of the same fixture data and the same
`ctx` construction to keep in sync by hand. No `tests/helpers/` module hosts
either shape today.

## Suggested direction (non-binding, optional)
A shared module exporting `GOOD_THETA`/`BAD_THETA` and the `(cwd, hasUI,
recorder) => ExtensionContext` double — parameterised over the recorder
shape each file already varies (`Recorder` vs `HelperRecorder`) — would sit
naturally beside the fixture/harness modules `tests/helpers/` already hosts
for the shipped-path pi/ctx double (per PTQ-0632's precedent for that
sibling pair), as a hypothesis only.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: the `notes`/`notifications` this `ctx` double
  backs are read by genuine assertions in both files (e.g.
  `expect(harness.notifications).toHaveLength(0)`,
  `errorToasts.length` in e2e-s6); this finding does not dispute any
  assertion built on the double, only that the double's definition and the
  two fixture strings are redeclared rather than imported.
- docs/bugs/ signature search: `grep -rln "GOOD_THETA\|BAD_THETA"
  docs/bugs/*.md` → 0 hits; no open bug document cites either constant by
  name or argues for keeping the two copies unshared.
- coverage-matrix/bug-doc citation search: `grep -n
  "load-warning-delivery\|e2e-s6-load-emit-toast-path"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` in either file —
  only that the fixture constants and `ctx` double could be imported from a
  shared module — so no pinned citation is disturbed.
- Coverage check: the claim is entirely about repeated DEFINITIONS (two
  string constants, one double-constructor function), not a missing test
  path; every copy is exercised by its own file's cells at HEAD.
- Prior-finding overlap check: `quality/issues/PTQ-0632-01-shipped-harness-duplicated-load-phase-pre-eval.md`
  (confirmed) covers `load-warning-delivery.test.ts`'s SHIPPED-path harness
  (`makeShippedHarness`/`RecordedNote`/`GOOD_THETA`/`BAD_THETA` shared with
  `tests/load-phase-pre-eval-routing.test.ts`) — a disjoint pair of
  functions (`makeShippedHarness` at :219-... vs `makeHelperCtx` at
  :387-402) from a disjoint sibling file. `grep -rl
  "e2e-s6-load-emit-toast-path" quality/intake quality/issues` → 0 hits
  before this filing; no existing finding names this file at all. The
  intake candidate `qw20260918050411-d7-03-shippedharness-third-copy-glob-universe.md`
  covers a third copy of PTQ-0632's SHIPPED-path harness in a different
  file (`discovery-glob-universe-enumeration-failure.test.ts`) — again a
  disjoint function pair from this finding's HELPER-path `ctx` double.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines; awk-extracted `GOOD_THETA`/`BAD_THETA` array-literal segments diff IDENTICAL and the `makeHelperCtx` (load-warning-delivery:391-402) / `makeCtx` (e2e-s6:70-81) bodies from `return {` to the `as unknown as ExtensionContext` cast diff to zero bytes; neither file imports the other; both copies live (4 call sites each, 8/6 fixture references); `grep "notify: (message: string, type: string)" tests/` → 4 files, of which only these two carry the three-param `(cwd, hasUI, recorder)` shape (b0451 inlines a fixed-cwd/hasUI:false literal, quality-loop-empty-tail-return-validation's `loadCtx(cwd, recorder)` fixes hasUI and pushes to `toasts`), so the 2-site count stands; stated searches reproduce (docs/bugs GOOD_THETA|BAD_THETA → 0, coverage-matrix cite → 0, no gate/recording-double/red-test carve-out, no merge/rename/delete proposed); both locations under tests/, D7 copy-paste fixture/double class. Dedupe: PTQ-0632 (open) already tracks load-warning-delivery's GOOD_THETA/BAD_THETA as a redeclaration of load-phase-pre-eval-routing's, so e2e-s6:36-47 is a THIRD copy of that fixture pair to fold into PTQ-0632's location list at fix time; but the `(cwd, hasUI, recorder) => ExtensionContext` helper-path ctx double is a distinct shape from PTQ-0632's inline shipped-harness ctx (hasUI:false fixed, `notifications: string[]`) and is tracked nowhere (PTQ-0622 covers live-cell ExtensionUIContext doubles, unrelated) — the new root stands on its own (triage: claude-fable-5-1)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
