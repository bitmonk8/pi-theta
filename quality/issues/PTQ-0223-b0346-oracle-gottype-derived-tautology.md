---
id: PTQ-0223
title: b0346 cell (O) re-derives a value two preceding `toEqual` calls already pinned, so its own assertion cannot independently fail
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts:85-96
  - tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts:201-207
  - tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts:214-220
  - tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts:233-236
sites: 1
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0346 cell (O) re-derives a value two preceding `toEqual` calls already pinned, so its own assertion cannot independently fail

## Observation
Cell (O) computes `arraySurface` and `matchSurface` via `messagesOf(...)` and
asserts each equals a single-element array holding one exact literal string
(`arraySink("number")`, then `scalarSink("number")`). As a third and final
assertion in the same test, it re-derives `gotType(arraySurface[0])` /
`gotType(matchSurface[0])` — a pure regex extraction over those same two
now-fixed strings — and compares the pair to the literal `["number",
"number"]`.

## Evidence
`tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts:201-207`
(the array-surface computation and its pinning assertion):
```ts
    const arraySurface = messagesOf([
      "let n: integer = 1",
      "let xs = [n, 1.5]",
      "let ys: array<string> = xs",
      "ys",
    ]);
    expect(arraySurface).toEqual([arraySink("number")]);
```

`tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts:214-220`
(the match-surface computation and its pinning assertion):
```ts
    const matchSurface = messagesOf([
      "let n: integer = 1",
      "let r = match 1 { 1 => n, _ => 1.5 }",
      "let ys: string = r",
      "ys",
    ]);
    expect(matchSurface).toEqual([scalarSink("number")]);
```

`tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts:233-236`
(the final assertion in the same `it`, immediately following the above with
only interstitial comments between them):
```ts
    expect([
      gotType(arraySurface[0] ?? ""),
      gotType(matchSurface[0] ?? ""),
    ]).toEqual(["number", "number"]);
```

`gotType`/`arraySink`/`scalarSink` — the pure functions the final assertion
composes, `tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts:85-96`:
```ts
function scalarSink(got: string): string {
  return `let binding 'ys' initialiser type mismatch: expected string, got ${got}`;
}

function arraySink(element: string): string {
  return `let binding 'ys' initialiser type mismatch: expected array<string>, got array<${element}>`;
}

/** The scalar primitive a sink message resolved, `array<X>` normalised to `X`. */
function gotType(message: string): string {
  const match = message.match(/got (?:array<)?([a-z]+)>?$/);
  return match?.[1] ?? message;
}
```

## Why this is a problem
`expect(arraySurface).toEqual([arraySink("number")])` (line 207) uses
`toEqual`, which for an array of one primitive string requires exact
equality; reaching line 214 at all already proves `arraySurface[0]` is the
literal string `"let binding 'ys' initialiser type mismatch: expected
array<string>, got array<number>"` for the rest of the test. Line 220
likewise fixes `matchSurface[0]` to `"let binding 'ys' initialiser type
mismatch: expected string, got number"`. `gotType` (lines 94-96) is a pure
function with no external state: applying its regex to those two now-fixed
literal strings deterministically yields `"number"` in both cases (`"got
array<number>"` matches `` got (?:array<)?([a-z]+)>?$ `` with group 1
`"number"`; `"got number"` matches the same pattern with the optional
`array<`/`>` absent, group 1 `"number"`). So by the time execution reaches
lines 233-236, `arraySurface[0]` and `matchSurface[0]` are no longer free —
they are two fixed strings the two prior assertions already exhaustively
checked — and `gotType` maps each to `"number"` unconditionally. The final
`expect` therefore restates arithmetic the two lines above it already
performed and adds no code path this cell can independently fail: a
production change that broke the "array/match agree on `number`" invariant
would already have thrown at line 207 or 220, before line 233 runs. This is
the "tautologies" instance of D7's "assertions that cannot fail" class
(AGENTS.md "Assert on real observables"): a reader relying on lines 233-236
as a distinct oracle check for the array/match agreement is relying on a
check that can never be the one to catch a regression in that agreement.

## Suggested direction (non-binding, optional)
None offered beyond the observation above; the fix stage owns whether the
final `expect` is removed or replaced with a check against something not
already pinned by the two calls above it.

## False-positive check
- Gate-pin check: `tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts`
  does not match `*gate*.test.ts` or its named kin; this cell asserts a
  checker-LUB oracle over hand-written fixtures, not a pinned corpus census
  or inventory.
- Recording-double check: `arraySurface`/`matchSurface` are plain arrays of
  diagnostic messages read from `parseDoc`'s return value (via
  `messagesOf`), not a recording double's call log; nothing here is a
  MUST-NOT-called negative witness, so that carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0346-checker-side-lubs-literal-candidate-asymmetry.md`
  is this test's own originating bug (open at HEAD); its witness table pins
  cell `O` as an "ORACLE" checking that "array, match, and inferred-return
  LUBs all resolve {integer, number} to `number`", but states no rationale
  for re-deriving `gotType` over already-pinned strings as a distinct check.
  No other docs/bugs entry names this file.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0346-checker-side-lubs-literal-candidate-asymmetry"
  docs/reference/coverage-matrix.md` → 0 hits. This finding does not
  propose merging, renaming, or deleting the cell or the file — only that
  one `expect` statement inside it is redundant with the two immediately
  above it.
- Coverage-drift check: this is not a claim that a path is untested; cell
  O's two `toEqual` assertions (lines 207, 220), and cells M1–M5/R1–R4/S/
  Fm/Fr elsewhere in the same file, already exercise the array/match/return
  LUB surfaces against real parse outcomes — the claim is narrowly that
  this one derived `expect` call, given the two calls preceding it in the
  same test, cannot fail.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim: lines 207/220 `toEqual(arraySink("number"))`/`toEqual(scalarSink("number"))` already pin arraySurface[0]/matchSurface[0] to exact literal strings, so the pure regex `gotType` at 233-236 deterministically yields ["number","number"] whenever reached, matching D7's own "tautologies" sub-case of assertions-that-cannot-fail (precedent PTQ-0216) (triage: claude-opus-5)
