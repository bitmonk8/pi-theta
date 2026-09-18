---
id: PTQ-1012
title: session-shutdown.test.ts's local sinkSpy retypes the canonical helper's emit/serialise double instead of extending it
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/session-shutdown.test.ts:84-104
  - tests/helpers/session-shutdown-harness.ts:72-81
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# session-shutdown.test.ts's local sinkSpy retypes the canonical helper's emit/serialise double instead of extending it

## Observation
`tests/session-shutdown.test.ts` imports `watcherSpy`, `signalSpy`, `makeEntry`, `healthyInventory`, `shutdownDeps`, and `eventWith` from `tests/helpers/session-shutdown-harness.ts` — but not `sinkSpy`, which that same module also exports. Instead the file declares its own module-scope `sinkSpy(options)` function returning the identical `EmissionSink`-shaped double (`{ emit: vi.fn(...), serialise: vi.fn(...) }`), adding two optional throw-injection flags the canonical export does not take.

## Evidence

`tests/session-shutdown.test.ts:84-104` (re-read immediately before filing):
```ts
function sinkSpy(
  options: { serialiseThrows?: boolean; emitThrows?: boolean } = {},
): EmissionSink & {
  emit: ReturnType<typeof vi.fn>;
  serialise: ReturnType<typeof vi.fn>;
} {
  return {
    emit: vi.fn((line: unknown) => {
      void line;
      if (options.emitThrows === true) {
        throw new Error("console.error boom");
      }
    }),
    serialise: vi.fn((diagnostic: Diagnostic) => {
      if (options.serialiseThrows === true) {
        throw new Error("serialiser boom");
      }
      return JSON.stringify(diagnostic);
    }),
  };
}
```

`tests/helpers/session-shutdown-harness.ts:72-81` — the canonical export, same return shape, same base body:
```ts
export function sinkSpy(): EmissionSink & {
  emit: ReturnType<typeof vi.fn>;
  serialise: ReturnType<typeof vi.fn>;
} {
  return {
    emit: vi.fn((line: unknown) => {
      void line;
    }),
    serialise: vi.fn((diagnostic: Diagnostic) => JSON.stringify(diagnostic)),
  };
}
```

Both functions declare the identical return type annotation
(`EmissionSink & { emit: ReturnType<typeof vi.fn>; serialise: ReturnType<typeof vi.fn>; }`),
build the same two-field object literal, wrap `emit` in `vi.fn((line: unknown) => { void line; ... })`,
and wrap `serialise` in `vi.fn((diagnostic: Diagnostic) => ... JSON.stringify(diagnostic))`.
The local version differs only by the added `options.emitThrows` / `options.serialiseThrows`
conditionals inserted into those same two bodies.

## Why this is a problem
The file already depends on `tests/helpers/session-shutdown-harness.ts` for six other exports from the same fixture family, so the module is not merely available but already in active use two lines above the local `sinkSpy` declaration (line 78 imports the sibling exports). The base `EmissionSink` double — return type, field names, `vi.fn` wrapping, `JSON.stringify` serialisation — is retyped locally rather than composed on top of the one export the helper module withholds only the throw-injection behaviour from. A change to the `EmissionSink` shape (e.g. a new required field) is checked independently in the local copy and in the canonical export.

## Suggested direction (non-binding, optional)
The canonical `sinkSpy()` accepting the same two optional throw flags this file already defines locally is the shape the two bodies' otherwise-identical structure already points toward; this file's six other imports from the same module show the dependency is already in place.

## False-positive check
- Gate-pin check: `session-shutdown.test.ts` does not match `*gate*.test.ts` or a named gate kin; the cited lines are a fixture-double declaration, not a pinned count or inventory assertion.
- Recording-double check: `sinkSpy`'s `emit`/`serialise` mocks back genuine positive and negative-count assertions in the file (e.g. `expect(failedEmits.length).toBe(1)`, `expect(sink.emit).toHaveBeenCalledTimes(1)`); this finding targets the redeclared double's DEFINITION, not the validity of any assertion built on it.
- docs/bugs/ signature search: `grep -rl "sinkSpy" docs/bugs/` → 0 hits; no documented correct-reason red cites this function.
- coverage-matrix/bug-doc citation search: `grep -n "session-shutdown.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block — only that the local double could extend the already-imported-from module's export.
- Coverage-drift check: the claim is about a repeated fixture-double DEFINITION inside an existing, passing test file; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/session-shutdown.test.ts:84-104 and tests/helpers/session-shutdown-harness.ts:72-81; a mktemp diff of the local body with its two `options.*Throws` branches stripped against the canonical export differs only in formatting (block-arrow vs expression-arrow `serialise`, signature line-wrap) — same return intersection, same two-field literal, same `vi.fn((line: unknown) => { void line; })` / `JSON.stringify(diagnostic)` bodies; the import block at :35-43 already pulls six names from that harness but not `sinkSpy`; the local copy is live (13 call sites, 7 with `serialiseThrows`/`emitThrows` backing the PIC-25/26/27 fallback and swallow cells at :467-563, so the fold MUST carry the flags), and `grep -rn sinkSpy tests/` shows every other declarer (b0376, reload-teardown-quiesce, session-swap-tripwire) now imports the export and calls it with no args, so adding optional throw flags to the helper is backward-compatible with zero assertion changes (all 4 files green 60/60); stated searches reproduce (docs/bugs `sinkSpy` → 0; coverage-matrix cite → 0), not a gate file, the vi.fn spies back positive `toHaveBeenLastCalledWith`/`toHaveBeenCalledTimes(1)` assertions (no negative-witness carve-out), no merge/rename/delete proposed; D7 copy-paste double, both locations under tests/; not a duplicate — resolved PTQ-0443 minted the harness but its md5 inventory listed `sinkSpy` identical only in b0376/reload-teardown-quiesce/session-swap-tripwire (this options-taking variant was excluded and left unmigrated), PTQ-0837 covers this file's `signalSpy` residual, PTQ-0509/0699/0856/0889 cover the deps builder, makeEntry and fakeDebouncerDep, and same-wave intake d7-10 cites `driveShutdown` (:165-172), not this double (triage: claude-fable-5-1)
