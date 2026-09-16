---
id: PTQ-0386
title: b0369 and b0417 each hand-roll a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0369-control-flow-kind-belts.test.ts:162-170
  - tests/b0417-responses-binder-toolchoice-gate.test.ts:167-175
  - tests/helpers/e2e-s1.ts:26-38
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# b0369 and b0417 each hand-roll a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports

## Observation
tests/b0369-control-flow-kind-belts.test.ts:162-170 and
tests/b0417-responses-binder-toolchoice-gate.test.ts:167-175 each declare a
module-scope `function parseDeps(): ParseThetaDocumentDeps` that builds an
inert `SystemNoteChannelDeps` (no-op `sendMessage`/`notify`/`emitDiagnostic`)
plus a trivially-resolving `ModelReferenceMatcher`. The two nine-line
declarations are byte-identical to each other. tests/helpers/e2e-s1.ts
already exports a `parseDeps()` (lines 26-38) that assembles the identical
`ParseThetaDocumentDeps` shape from the same field values under an `export`
keyword, and two OTHER files inside this same review scope
(tests/b0380-params-key-not-identifier.test.ts,
tests/b0427-alias-schema-param-permissive-string-terminal.test.ts) already
import from that same helper module for adjacent needs (`parseDoc`/`codes`/`errors`).
Neither b0369 nor b0417 imports anything from `./helpers/`.

## Evidence
tests/b0369-control-flow-kind-belts.test.ts:162-170 (re-read immediately
before filing):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/b0417-responses-binder-toolchoice-gate.test.ts:167-175 — byte-identical
to the excerpt above (`diff` on the two extracted 9-line ranges produces zero
output):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/helpers/e2e-s1.ts:26-38 — the canonical, already-exported equivalent
(same four field values, factored into two named pieces):
```ts
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};

/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```

Exact search, confined to this wave's 8-file review scope: `grep -n
"^function parseDeps" <each of the 8 reviewed files>` → exactly 2 hits,
tests/b0369-control-flow-kind-belts.test.ts:162 and
tests/b0417-responses-binder-toolchoice-gate.test.ts:167; the other 6 files
(b0364, b0380, b0414, b0418, b0426, b0427) carry none. `grep -n
"helpers/e2e-s1" tests/b0369-control-flow-kind-belts.test.ts
tests/b0417-responses-binder-toolchoice-gate.test.ts` → 0 hits in both files
(neither imports the module that already exports this exact shape), while
`grep -ln "helpers/e2e-s1" tests/b0380-params-key-not-identifier.test.ts
tests/b0427-alias-schema-param-permissive-string-terminal.test.ts` confirms
both of those other in-scope files already import from it for their own,
adjacent needs.

## Why this is a problem
Both `parseDeps()` declarations return the exact same four no-op fields wired
the exact same way, and a directly-substitutable version of that value
already exists as a live, exported member of a helper module two other files
in this same review already import from for a related purpose. Each
occurrence adds nine lines a reader must independently re-verify are
genuinely inert rather than importing a value already verified as such once;
the duplication is between the two reviewed files themselves as well as
against the unconsulted existing export.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts's exported `parseDeps()` is already the import two
sibling files in this same review batch (b0380, b0427) use from the same
module for adjacent needs; naming it here observes where those two already
point, not a design for either file under review.

## False-positive check
- Gate-pin check: tests/b0417-responses-binder-toolchoice-gate.test.ts's
  filename textually matches the `*gate*.test.ts` glob, but this finding
  touches no pinned count or inventory assertion — `parseDeps()` is an inert
  dependency-builder, not a value the file fixes for itself and checks a
  corpus against — so the census/pin-gate carve-out does not shield it.
  tests/b0369-control-flow-kind-belts.test.ts does not match the glob or any
  of its named kin at all.
- Recording-double check: `parseDeps()`'s `sendMessage`/`notify`/`emitDiagnostic`/`resolve`
  fields are static no-ops, not a call-recording double backing a MUST-NOT
  witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0369-control-flow-runtime-kind-fallbacks-silent.md:3
  and docs/bugs/0417-binder-openai-responses-toolchoice-400.md:3 are both
  Status "fixed"; `grep -rln "parseDeps" docs/bugs/*.md` returns 21 other,
  unrelated bug docs — neither 0369 nor 0417 is among them, so no bug doc
  ties this specific duplication to a deliberate reason. `npx vitest run` on
  both files: 34/34 and 5/5 passed at HEAD, so neither is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0369\|b0417"
  docs/reference/coverage-matrix.md` → 0 hits. Both bug docs cite their own
  test FILE as witness (docs/bugs/0369-…md:227; docs/bugs/0417-…md:316-318)
  but neither names `parseDeps` or any specific cell. This finding proposes
  no merge, rename, or deletion of either file or any cell inside them, only
  that one nine-line internal builder duplicate in each could import an
  equivalent already-exported value, so neither citation is disturbed.
- Coverage check: not a claim that a path or behaviour is untested — both
  files' existing cells and their outcomes are unaffected; the claim is
  confined to a duplicated builder function's provenance.
- Not a re-file of PTQ-0214 (parsedeps-reimplements-e2e-s1-helper, already
  resolved): that finding's locations are
  tests/array-sink-unresolvable-deferral.test.ts (plus two sibling files
  cited only as already-correct comparisons) — neither b0369 nor b0417
  appears among them. That finding's own Evidence section states its search
  found "76 test files" repo-wide carrying a same-named `parseDeps()`,
  which is the standing confirmation that filing this per reviewed-file-pair,
  rather than as one repo-wide finding, is this review process's established
  convention (mirrored by the many other per-file-cluster `*-harness-duplicated`
  entries in the already-filed list).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both parseDeps() bodies verified byte-identical (diff exit 0) at tests/b0369:162-170 and tests/b0417:167-175, tests/helpers/e2e-s1.ts:26-38 exports the equivalent value and sibling in-scope files b0380/b0427 already import it while neither b0369 nor b0417 imports anything from ./helpers/ (grep confirms both), the 8-file scope search for `^function parseDeps` yields exactly these 2 hits, both docs/bugs are Status fixed with the files green at HEAD (34/34, 5/5 via vitest) so no documented-red carve-out applies, coverage-matrix.md has 0 hits for either file so no citation is disturbed, and this is a distinct instance from resolved PTQ-0214/confirmed PTQ-0239/PTQ-0314 (different locations), matching that same established per-file-pair filing convention (triage: claude-opus-5)
