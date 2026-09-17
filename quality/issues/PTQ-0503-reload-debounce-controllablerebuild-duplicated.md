---
id: PTQ-0503
title: reload-debounce.test.ts's controllableRebuild resolver-parking factory is redeclared from reload-teardown-quiesce.test.ts instead of shared
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reload-debounce.test.ts:115-141
  - tests/reload-teardown-quiesce.test.ts:76-99
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: drift
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# reload-debounce.test.ts's controllableRebuild resolver-parking factory is redeclared from reload-teardown-quiesce.test.ts instead of shared

## Observation
Both tests/reload-debounce.test.ts and tests/reload-teardown-quiesce.test.ts
import the same `RebuildOutcome` type from `../src/extension/reload-debounce`
and each declares its own local `controllableRebuild()` function that builds a
`vi.fn` `rebuild` double whose call parks a `Promise` resolver in an array so
the test can release it later, deterministically, in call order. The two
declarations share their entire resolver-parking body; reload-debounce.test.ts's
copy adds one extra returned accessor (`inFlightCount`) on top of the shared
core. reload-teardown-quiesce.test.ts's own doc comment names this the
"V10d-T pattern" — the header tag `reload-debounce.test.ts` itself carries
("V10d-T — reload debounce...") — an explicit cross-reference to the file this
was copied from.

## Evidence

tests/reload-debounce.test.ts:115-141:
```ts
  function controllableRebuild(): {
    rebuild: ReturnType<typeof vi.fn>;
    settle: (outcome: RebuildOutcome) => void;
    inFlightCount: () => number;
  } {
    const resolvers: Array<(o: RebuildOutcome) => void> = [];
    let settled = 0;
    const rebuild = vi.fn(
      () =>
        new Promise<RebuildOutcome>((resolve) => {
          resolvers.push((o) => {
            settled++;
            resolve(o);
          });
        }),
    );
    return {
      rebuild,
      settle: (outcome) => {
        const next = resolvers[settled];
        if (next === undefined) {
          throw new Error("no in-flight rebuild to settle");
        }
        next(outcome);
      },
      inFlightCount: () => rebuild.mock.calls.length - settled,
    };
  }
```

tests/reload-teardown-quiesce.test.ts:76-99 (the same resolver-parking core,
doc comment naming the "V10d-T pattern" reload-debounce.test.ts's own header
tag identifies):
```ts
/**
 * A `rebuild` whose completion is caller-controlled (the V10d-T pattern): each
 * call parks a resolver so a rebuild can be held "in flight" and released
 * deterministically.
 */
function controllableRebuild(): {
  rebuild: ReturnType<typeof vi.fn>;
  settle: (outcome: RebuildOutcome) => void;
} {
  const resolvers: Array<(o: RebuildOutcome) => void> = [];
  let settled = 0;
  const rebuild = vi.fn(
    () =>
      new Promise<RebuildOutcome>((resolve) => {
        resolvers.push((o) => {
          settled++;
          resolve(o);
        });
      }),
  );
  return {
    rebuild,
    settle: (outcome) => {
      const next = resolvers[settled];
      if (next === undefined) {
        throw new Error("no in-flight rebuild to settle");
      }
      next(outcome);
    },
  };
}
```

Both files import the same production type this double stands in for:
tests/reload-teardown-quiesce.test.ts:41-42 (`type RebuildOutcome,` from
`"../src/extension/reload-debounce"`) matches
tests/reload-debounce.test.ts's own import of `RebuildOutcome` from the same
module, confirming both doubles are built against the identical seam.

## Why this is a problem
The resolver-array bookkeeping (`resolvers`, `settled`, the `vi.fn(() => new
Promise(...))` wrapper, and the "no in-flight rebuild to settle" guard) is
retyped statement-for-statement in the second file rather than imported, and
the second file's own doc comment cross-references the pattern's origin by
the exact header tag ("V10d-T") the first file uses to name itself. Every
`ReloadDebouncer`-driving PIC-49 test in both files needs this same
caller-controlled "hold rebuild #1 in flight, release it, observe the
deferred rebuild #2" seam, so the duplication recurs at every one of the
three call sites reload-debounce.test.ts drives it from and the three
reload-teardown-quiesce.test.ts drives it from.

## Suggested direction (non-binding, optional)
`tests/helpers/` already holds several PIC/V10-family seam doubles (e.g.
`fake-clock.ts`); a shared caller-controlled-rebuild factory alongside it
would be the natural home the "V10d-T pattern" doc comment is already
pointing at, and could carry the `inFlightCount` accessor as an optional
extra rather than a second, independently maintained copy.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); nothing
  cited here is a pinned count or inventory assertion.
- Recording-double check: `controllableRebuild`'s `rebuild` is a `vi.fn` used
  for both call-count and call-argument assertions in both files, but this
  finding targets the duplicated FACTORY code itself, not any single
  MUST-NOT-be-called witness built on it — the negative-witness carve-out does
  not shield the claim being made and is not contested here.
- docs/bugs/ signature search: reload-debounce.test.ts's PIC-49 section cites
  "bug 0311 §Fix constraint (1)" for one of its cells and both files are
  green, ordinary regression/behaviour suites (not red-by-design); this
  finding does not contest either file's redness or behaviour, only the
  duplicated harness code both depend on.
- coverage-matrix/bug-doc citation search:
  `grep -rn "reload-debounce.test.ts\|reload-teardown-quiesce.test.ts" docs/reference/coverage-matrix.md docs/bugs/`
  returns no hits in coverage-matrix.md and only bug 0311's own fix-constraint
  prose (already quoted in reload-debounce.test.ts's own comment, not naming
  the test by filename) in docs/bugs/; this finding proposes no merge,
  rename, or deletion of either file.
- Coverage-drift check: the claim is about a harness DEFINITION duplicated
  across two files that both exist today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/reload-debounce.test.ts:115-141 and tests/reload-teardown-quiesce.test.ts:76-99 and the resolver-parking bodies are statement-identical except the one-line `inFlightCount` accessor (used once, line 251); `grep controllableRebuild` / `"no in-flight rebuild to settle"` across src/, extensions/, tools/, tests/ hits only these two files and tests/helpers/ exports no such factory; both copies are live (4 call sites at 146/172/196/231 — the filing's "three" is a minor undercount — and 3 at 180/233/470; both suites green per shard-128/129 logs); neither file is a gate kin, no coverage-matrix citation, and the docs/bugs/ hits (0018, 0034, 0376, 0468) name the files as witnesses but the filing proposes no merge/rename/delete; not tracked elsewhere (resolved PTQ-0341 is the src/ quiesce race-timer clone, same-wave sibling controllableentry-makeentry covers a different factory); stray `d4_class: drift` on a D7 filing is a template nit that does not block evaluation — copy-paste fixture/double, in tests/ only (triage: claude-fable-5-1)
