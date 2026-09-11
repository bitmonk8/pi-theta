---
id: PTQ-0211
title: The driveOver fake-child drive harness in b0258 is copied byte-for-byte from two sibling subagent test files
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0258-envelope-parse-failed-line-summary-cr.test.ts:76-88
  - tests/subagent-json-wire.test.ts:35-46
  - tests/subagent-wire-parse-failed-emitter.test.ts:151-165
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# The driveOver fake-child drive harness in b0258 is copied byte-for-byte from two sibling subagent test files

## Observation
`tests/b0258-envelope-parse-failed-line-summary-cr.test.ts` defines a
module-scope `driveOver(child, thetaAbort, emitted)` function whose entire
body constructs one `driveSubagentChild({ child, thetaAbort, calleePath,
emitDiagnostic })` call. The function's own doc comment states it is a
"Mirror of `tests/subagent-json-wire.test.ts`'s `driveOver` fake-child
harness." A function of the same name, same parameter list, and the same
body (down to the hard-coded `calleePath` string) already exists in both
`tests/subagent-json-wire.test.ts` and
`tests/subagent-wire-parse-failed-emitter.test.ts`, the latter also carrying
a comment naming the same source file ("mirrors
tests/subagent-json-wire.test.ts").

## Evidence
tests/b0258-envelope-parse-failed-line-summary-cr.test.ts:76-88:
```ts
/** Mirror of `tests/subagent-json-wire.test.ts`'s `driveOver` fake-child harness. */
function driveOver(
  child: FakeJsonChild,
  thetaAbort: AbortController,
  emitted: Diagnostic[],
): ReturnType<typeof driveSubagentChild> {
  return driveSubagentChild({
    child,
    thetaAbort,
    calleePath: CALLEE,
    emitDiagnostic: (d) => emitted.push(d),
  });
}
```

tests/subagent-json-wire.test.ts:35-46 (identical body; `CALLEE` in b0258 is
the module constant `"/theta/child.theta"`, the same literal spelled out
here):
```ts
function driveOver(
  child: FakeJsonChild,
  thetaAbort: AbortController,
  emitted: Diagnostic[],
): ReturnType<typeof driveSubagentChild> {
  return driveSubagentChild({
    child,
    thetaAbort,
    calleePath: "/theta/child.theta",
    emitDiagnostic: (d) => emitted.push(d),
  });
}
```

tests/subagent-wire-parse-failed-emitter.test.ts:151-165 (same function again,
with its own comment naming the same source):
```ts
// ---------------------------------------------------------------------------
// Drive harness (mirrors tests/subagent-json-wire.test.ts).
// ---------------------------------------------------------------------------

function driveOver(
  child: FakeJsonChild,
  thetaAbort: AbortController,
  emitted: Diagnostic[],
): ReturnType<typeof driveSubagentChild> {
  return driveSubagentChild({
    child,
    thetaAbort,
    calleePath: "/theta/child.theta",
    emitDiagnostic: (d) => emitted.push(d),
  });
}
```

Exact search: `grep -n "^function driveOver(" tests/*.test.ts` returns exactly
these three files and no others.

## Why this is a problem
All three definitions build the identical call to the real
`driveSubagentChild` over a `FakeJsonChild` double, an `AbortController`, and
an `emitted: Diagnostic[]` recording array, differing only in whether
`calleePath` is a bare string literal or a same-valued module constant. Two of
the three copies say outright, in their own comments, which file they were
copied from ("Mirror of `tests/subagent-json-wire.test.ts`'s `driveOver`
fake-child harness", "Drive harness (mirrors
tests/subagent-json-wire.test.ts)"), so this is a named, traceable copy rather
than three authors independently arriving at the same eleven-line function.
`tests/helpers/fake-json-child.ts` already centralises the `FakeJsonChild`
double all three files import; no sibling module in `tests/helpers/` yet
exports the small wrapper that drives that double through
`driveSubagentChild`, which is consistent with each file re-declaring it
locally instead.

## Suggested direction (non-binding, optional)
`tests/helpers/fake-json-child.ts` already centralises the double `driveOver`
wraps; a `driveOver`-shaped export living beside it is the home both copies'
own comments already point at ("Mirror of …", "mirrors …"), not a design for
the extraction.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the named
  kin; not applicable, and no pinned count or inventory is touched by this
  observation.
- Recording-double check: `driveOver` itself is not a recording double — it
  is a thin call-shape wrapper around the real `driveSubagentChild` production
  function, built over the canonical `FakeJsonChild` double. The `emitted`
  array it threads through IS used by callers as a recording sink (e.g. to
  assert a code is absent), but that MUST-NOT-witness use lives in the
  callers' own assertions, not in `driveOver`'s definition, which is the
  object of this finding.
- docs/bugs/ signature search: `grep -rl "driveOver" docs/bugs/*.md` → 0
  files; no bug document discusses or justifies this duplication.
  `docs/bugs/0258-…md` Status is "fixed (0.242.0)"; not a documented
  correct-reason red. `npx vitest run
  tests/b0258-envelope-parse-failed-line-summary-cr.test.ts
  tests/subagent-json-wire.test.ts
  tests/subagent-wire-parse-failed-emitter.test.ts` passes all three files (24
  tests) at HEAD.
- coverage-matrix / bug-doc citation search: `grep -n
  "b0258-envelope-parse-failed-line-summary-cr\|subagent-json-wire.test.ts\|subagent-wire-parse-failed-emitter.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. `subagent-json-wire.test.ts`
  and `subagent-wire-parse-failed-emitter.test.ts` are each named in several
  bug docs' own reproduction/witness sections (0009, 0086, 0230, 0258, 0261).
  This finding proposes no merge, rename, or deletion of any of the three
  files, and no change to any `it()`/`describe()` name, count, or assertion —
  only that the internal `driveOver` wrapper is currently declared three times
  — so those citations are unaffected.
- Scope: only `tests/b0258-envelope-parse-failed-line-summary-cr.test.ts` is
  in this wave's review scope; `tests/subagent-json-wire.test.ts` and
  `tests/subagent-wire-parse-failed-emitter.test.ts` are cited solely as
  duplication evidence — the two files b0258's own comment names as the
  mirrored source — and were not otherwise reviewed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three excerpts and line ranges reproduce verbatim at HEAD (77-88/35-46/151-165, ±1-line cosmetic drift on the comment-block boundary of the third), `grep -n "^function driveOver(" tests/*.test.ts` independently reproduces exactly these 3 hits and no others, `tests/helpers/fake-json-child.ts` exports no `driveSubagentChild` wrapper, and the gate-pin/recording-double/docs-bugs-signature/coverage-matrix carve-out checks are all independently confirmed inapplicable — a genuine, self-admitted ("Mirror of …"/"mirrors …") D7 boilerplate-duplication finding proposing no test rename/merge/delete (triage: claude-opus-5)
