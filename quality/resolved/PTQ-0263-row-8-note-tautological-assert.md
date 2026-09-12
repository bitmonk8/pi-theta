---
id: PTQ-0263
title: call-with-clause-threading.test.ts's "row 8 note" test asserts expect(true).toBe(true)
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/call-with-clause-threading.test.ts:131-133
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# call-with-clause-threading.test.ts's "row 8 note" test asserts expect(true).toBe(true)

## Observation
tests/call-with-clause-threading.test.ts declares a `describe`/`it` pair whose
`it` title is a prose note explaining that RFC 0009's matrix row 8 (a
runtime-subagent, not-statically-resolvable callee) is not separately
witnessed at this harness level because it shares the same evaluation+bind
mechanism as row 5's cell above it. The test body carries no drive, no
double, and no reference to any production import — its sole statement is
`expect(true).toBe(true);`.

## Evidence
tests/call-with-clause-threading.test.ts:131-133 (re-read verbatim
immediately before filing):
```ts
  it("row 8 note: this harness never runs a static-resolution pass, so a 'not statically resolvable' callee is not statically distinguishable here — the runtime-subagent cell (row 8) and the statically-resolvable cell (row 5) share this same evaluation+bind mechanism and are witnessed by the SAME assertion above; no separate cell is required at this level", () => {
    expect(true).toBe(true);
  });
```
Exact search: `grep -rln "expect(true).toBe(true)" tests --include="*.test.ts"`
→ exactly 1 file, this one, at this one line — not a repeated idiom anywhere
else in the suite.

## Why this is a problem
`expect(true).toBe(true)` compares a boolean literal to itself. Neither
operand is derived from a drive, a double's recording, an import, or any
other observable the surrounding RFC 0009 threading tests exercise (contrast
the same file's own V5-V8 cells a few lines above, each of which asserts
`outcome.spawns[0]!.cwd` against a value computed via `resolvePath`). No
change to `src/`, no regression in row 8's behaviour, and no drift in the
evaluation+bind mechanism the test's own name discusses can make this
assertion red: it is true by construction, independent of program state. The
test therefore always reports success whether or not the claim its title
makes (that row 8 is witnessed by the assertion in the preceding `it`) stays
true over time.

## Suggested direction (non-binding, optional)
The test's entire content is the prose already carried in its own title; that
prose is the kind of thing this file's surrounding section comments (e.g. the
"Row 7 — runtime prompt-mode-callee gate" banner two blocks above) already
carry without needing a vitest `it` to hold them.

## False-positive check
- Gate-pin check: the file name matches none of `*gate*.test.ts` or the named
  gate kin; not applicable.
- Recording-double check: no double, fake, or spy backs either operand of
  `expect(true).toBe(true)` — it is a literal compared to itself, not a
  "never called" witness over a recording double, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "row 8 note" docs/` → 0 hits; the
  test is GREEN at HEAD (see below), so the "documented correct-reason red"
  carve-out (which concerns tests left red on purpose) does not apply either.
- coverage-matrix/bug-doc citation search: `grep -n
  "call-with-clause-threading" docs/reference/coverage-matrix.md docs/bugs/*.md`
  → 0 hits; this finding proposes no merge, rename, or deletion, only
  observes that the existing assertion cannot fail.
- Run check: `npx vitest run tests/call-with-clause-threading.test.ts` → 10/10
  passing at HEAD, confirming this is an ordinary green test, not a
  documented-red one.
- Coverage check: this finding does not claim row 8 (or any RFC 0009 matrix
  row) lacks a test — the file's own comment argues row 8 is witnessed by the
  V5-V8 assertions above it, a routing judgment this finding does not
  dispute; the claim here is narrowly that THIS test's own assertion is
  incapable of ever failing.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — excerpt and grep count reproduce exactly (tests/call-with-clause-threading.test.ts:131-133 is the sole `expect(true).toBe(true)` in tests/), the test is GREEN 10/10 at HEAD with no docs/bugs or coverage-matrix citation, no gate-file name or recording double backs it, and the operand is a boolean literal compared to itself — a textbook D7 assertion-that-cannot-fail with no applicable carve-out (triage: claude-opus-5)
