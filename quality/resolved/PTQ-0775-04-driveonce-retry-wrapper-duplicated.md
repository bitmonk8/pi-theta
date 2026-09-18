---
id: PTQ-0775
title: The `driveOnce<T>` retry-once-on-transport-blip wrapper is redeclared byte-identically in two tests/live/hardening files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/hardening/b0308-cap0-exhaustion-note.test.ts:34-42
  - tests/live/hardening/session-promptloop.test.ts:57-65
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The `driveOnce<T>` retry-once-on-transport-blip wrapper is redeclared byte-identically in two tests/live/hardening files

## Observation
`tests/live/hardening/b0308-cap0-exhaustion-note.test.ts` and
`tests/live/hardening/session-promptloop.test.ts` each declare a
module-scope, generic `async function driveOnce<T>(run: () => Promise<T>):
Promise<T>` whose doc comment, body (a `try`/`catch` that retries `run()`
exactly once when the caught error's message matches `/429|transport|rate/i`,
otherwise rethrows) are byte-identical, including the one-line doc comment
above each declaration. Both files already import `requireLiveProvider`,
`runProbe`, and `turnAt` from the sibling `./probe-harness` module, which
defines no such retry wrapper.

## Evidence
`tests/live/hardening/b0308-cap0-exhaustion-note.test.ts:34-42`:
```ts
/** Retry once on a transport/429 blip (never a silent skip). */
async function driveOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|transport|rate/i.test(msg)) return await run();
    throw e;
  }
}
```

`tests/live/hardening/session-promptloop.test.ts:57-65` — reverified
byte-identical via
`diff <(sed -n '34,42p' b0308-cap0-exhaustion-note.test.ts) <(sed -n '57,65p' session-promptloop.test.ts)`
→ no output:
```ts
/** Retry once on a transport/429 blip (never a silent skip). */
async function driveOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|transport|rate/i.test(msg)) return await run();
    throw e;
  }
}
```

Exact search: `grep -rn "async function driveOnce<T>" tests/live/hardening/*.ts`
→ exactly these two hits.

## Why this is a problem
The same 9-line generic retry wrapper (comment included) is retyped whole into
a second file rather than defined once. Both files already import from the
shared `./probe-harness` module in the same directory for their subject
functions (`runProbe`, `turnAt`, `requireLiveProvider`), so the pattern of
drawing shared live-drive plumbing from that module is already established;
only this one retry wrapper is independently re-declared in each file.

## Suggested direction (non-binding, optional)
`tests/live/hardening/probe-harness.ts` is the module both call sites already
import from and is where each file's other shared live-drive plumbing already
lives; it is the natural home for a single exported `driveOnce`.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `driveOnce` retries a caller-supplied thunk; it
  records no calls and backs no "never called" assertion, so the
  negative-witness carve-out does not apply.
- Documented correct-reason red check: `b0308-cap0-exhaustion-note.test.ts`
  is itself a documented correct-reason red for open bug
  `docs/bugs/0308-snk-h-fabricates-last-tool-respond-on-reachable-null.md`
  (its own header cites the bug and states it stays red "while bug 0308 is
  open"), but that document's pinned failure signature is about the SNK-h
  note's `last_tool_name` rendering, not about the `driveOnce` retry helper;
  this finding proposes no change to the red assertion, only that the retry
  helper's definition could be shared, so the documented-red carve-out does
  not shield the duplication claim.
- docs/bugs/ signature search: `grep -rl "driveOnce" docs/bugs/*.md` → 0
  files. No bug document states a rationale for redeclaring this wrapper
  locally rather than sharing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0308-cap0-exhaustion-note\|session-promptloop" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no change to any `it()`/`describe()` name,
  count, or assertion — only that the retry wrapper's definition could be
  shared — so the citation carve-out does not bind.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; both copies are exercised by the tests
  in their own files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at exactly :34-42 and :57-65, `diff` of the two 9-line ranges is empty (byte-identical incl. doc comment), both copies are live (called at b0308:53, session-promptloop:76/:129), repo-wide grep of `driveOnce` and of the regex literal `429|transport|rate` yields only these two declarations (the third `driveOnce` in session-subagent-toolloop.test.ts:56 is a diverged non-generic variant keyed on `turn.error`/`transportish`, so the two-site count is accurate and there is no overlap with sibling -01), probe-harness.ts exports no retry wrapper, docs/bugs and coverage-matrix searches reproduce at 0 hits, git shows the b0308 copy (fee02d40, 2026-09-01, header: "Modeled on session-promptloop.test.ts") was pasted from the 7030aa98 original — D7 boilerplate-duplication class in tests/ with no gate/recording-double/documented-red/failLoudly carve-out touched; not tracked in quality/issues or quality/resolved (triage: claude-fable-5-1)
