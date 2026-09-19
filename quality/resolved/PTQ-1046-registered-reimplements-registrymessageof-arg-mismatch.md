---
id: PTQ-1046
title: arg-mismatch-diagnostic-count-by-surface.test.ts's registered() reimplements the exported registryMessageOf lookup-and-guard half
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/arg-mismatch-diagnostic-count-by-surface.test.ts:112-124
  - tests/helpers/load-row-harness.ts:60-80
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# arg-mismatch-diagnostic-count-by-surface.test.ts's registered() reimplements the exported registryMessageOf lookup-and-guard half

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf(registry,
registryPath, code, fills)`, whose first half looks up a registry row's
*Message* template via `registryMessage` and throws (via `expect(...)
.toBeDefined()`) naming the registry page when the row is missing.
`tests/arg-mismatch-diagnostic-count-by-surface.test.ts` declares a private
`registered(code)` that performs the identical lookup-and-guard sequence over
the same `registryMessage`/`REGISTRY` pairing, using a hand-written `throw
new Error(...)` in place of the `expect().toBeDefined()` call. The file
already imports `REGISTRY` from `./helpers/registry-oracle` (the module
`registryMessageOf` itself is layered on top of, per `load-row-harness.ts`'s
own `readRegistry`/`REGISTRY` re-export chain) but does not import
`registryMessageOf` from `./helpers/load-row-harness`.

## Evidence

tests/arg-mismatch-diagnostic-count-by-surface.test.ts:112-124 (re-read
immediately before filing):
```ts
/**
 * A registered code's normative *Message* template, or a throw naming the
 * registry page: a missing row is a harness failure, never a skip, because
 * every expected string below is derived from it.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no *Message* row for ${code} in ${REGISTRY_PAGE} — the DIAG-4 ` +
        "column is this file's only source for the expected strings",
    );
  }
  return template;
}
```

tests/helpers/load-row-harness.ts:60-80 (the canonical helper, same
lookup-then-guard sequence over the same `registryMessage` call):
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```

The local copy is live: `grep -n "registered(" tests/arg-mismatch-diagnostic-count-by-surface.test.ts`
shows the declaration at :118 plus three call sites (:138, :750, :760).
Exact search: `grep -rn "^function registered(code: string" tests/*.test.ts`
returns 22 declarations repository-wide (this file is one of them), of which
this specific file's copy is not cited as a location by any currently open
or resolved finding (checked below).

## Why this is a problem
`registered` performs the same "fetch the row's *Message* template, fail
loudly naming the registry page when it is absent" step `registryMessageOf`
already exports, differing only in `throw new Error(...)` versus
`expect(...).toBeDefined()` as the failure mechanism — a stylistic
difference, not a behavioural one. The file supplies its own fill step
(`fill`, a separate function) rather than using `registryMessageOf`'s
built-in `fills` parameter, but the lookup-and-guard half this finding cites
is the exact sequence already centralised.

## Suggested direction (non-binding, optional)
`registered(code)` could become a one-line wrapper `registryMessageOf(REGISTRY,
REGISTRY_PAGE, code)`, the same substitution already in use elsewhere in the
suite (e.g. `tests/fn-param-list-unclosed.test.ts`'s local `msg` wrapping the
same export, as cited by the sibling finding PTQ-0859).

## False-positive check
- Gate-pin check: `arg-mismatch-diagnostic-count-by-surface.test.ts` does not
  match `*gate*.test.ts` or the named gate kin; the cited lines are a
  message-template lookup, not a pinned count or inventory.
- Recording-double check: `registered` renders static registry text for a
  positive `toEqual`/`toContain`-style assertion; it records no call and
  backs no "never called" MUST-NOT witness, so the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "registered(code" docs/bugs/*.md` →
  0 hits; no documented correct-reason red names this function's shape. The
  file's own docs/bugs/0147 is "Status: fixed", and the file is 98/98 green
  at HEAD (confirmed by the resolved PTQ-0327 finding on the same file), so
  this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "arg-mismatch-diagnostic-count-by-surface" docs/reference/coverage-matrix.md`
  → 0 hits. Six bug docs cite the file by name as a witness suite, none
  pinning the `registered` helper's declaration; this finding proposes no
  merge, rename, or deletion of the file or any `it()`/`describe()` block —
  only that the lookup-and-guard helper import the existing export.
- Prior-filing overlap check: `grep -rl "arg-mismatch-diagnostic-count-by-surface"
  quality/issues/*.md quality/resolved/*.md` returns PTQ-0327 (fixed — the
  file's local `RegistryRow`/`REGISTRY` declaration, already resolved by
  importing `REGISTRY` from `registry-oracle`, which is why `registered`
  today reads `REGISTRY` rather than a local read), PTQ-0805 (fixed/resolved
  — the two-guard `fill` placeholder-interpolation duplicate, whose triage
  note lists this file only among 15 sites sharing `fill`, not `registered`),
  PTQ-0814, PTQ-0857, PTQ-0960, PTQ-0969, PTQ-0983 (open — `linesFor`/
  `linesForCode`, `messagesFor`, `runProductionLoad`/`LoadOutcome`,
  `plantThetaWorkspace`, and `invokeArgMessage` respectively — none of these
  five cites `registered`). The wider `registered`-reimplements-
  `registryMessageOf` pattern is tracked per confirmed-open sibling PTQ-0859,
  whose own Evidence section states the 22-site `registered` search and its
  triage explicitly treats the pattern as tracked "per disjoint file set …
  with no open repo-wide canonical" — PTQ-0859's two cited locations
  (`tests/match-pattern-increment-decrement.test.ts`,
  `tests/member-access-declared-field-type.test.ts`) do not include this
  file, so this is a distinct, untracked instance of the same class rather
  than a re-file.
- Coverage-drift check: the claim is about a repeated lookup-and-guard
  function DECLARATION; the local copy is exercised by three live call sites
  in the file's already-passing 98/98 test run.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (test :112-124 `registered`, load-row-harness.ts:60-80 `registryMessageOf`); `registered` is live at :138 (inside `fill`), :750 and :760, the latter two reading the raw template, which `registryMessageOf(REGISTRY, REGISTRY_PAGE, code)` with its default empty `fills` returns unchanged, so all three callers are served by a one-line wrapper differing only in `throw new Error` vs `expect().toBeDefined()`; the file imports `registryMessage`/`REGISTRY`/`interpolateStrict` but neither `registryMessageOf` nor `load-row-harness` (grep → 0); stated searches reproduce (docs/bugs `registered(code` → 0, coverage-matrix → 0, prior filings citing the file = PTQ-0327/0805 fixed + PTQ-0814/0857/0960/0969/0983 open, none naming `registered`); one evidence correction: `^function registered(code: string` now hits 20 tests/*.test.ts files, not 22 (the stale count is copied from PTQ-0859's triage), immaterial to the sites:1 claim; both locations under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-signature carve-out, no it()/describe() change proposed; not a duplicate — open PTQ-0859 tracks the identical `registered` shape but its triage deliberately held it to its two files and ruled the pattern tracked per disjoint file set, so this file is an untracked slice, and PTQ-0983 (this file's `invokeArgMessage`) is a different helper; note for the fixer: tests/helpers/registry-oracle.ts (already imported here, e54a42b3) now exports `fillParseMessage` over a private `registeredParseMessage` — the exact `registered`+`fill` pair with the same interpolateStrict wording — and all seven codes here are parse-shard rows, so migrating to that pair (the home PTQ-0983's lift also lands on) retires both wrappers, not just the lookup half (triage: claude-fable-5-1)
