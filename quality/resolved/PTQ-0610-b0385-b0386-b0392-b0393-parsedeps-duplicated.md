---
id: PTQ-0610
title: b0385, b0386, b0392 and b0393 each hand-roll a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0385-key-placeholder-json-stringify.test.ts:101-110
  - tests/b0386-dead-block-let-scope.test.ts:52-58
  - tests/b0392-unary-minus-operand-discipline.test.ts:167-173
  - tests/b0393-stdlib-method-call-primitive-receiver.test.ts:114-120
  - tests/helpers/e2e-s1.ts:26-40
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0385, b0386, b0392 and b0393 each hand-roll a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports

## Observation
tests/b0385-key-placeholder-json-stringify.test.ts,
tests/b0386-dead-block-let-scope.test.ts,
tests/b0392-unary-minus-operand-discipline.test.ts and
tests/b0393-stdlib-method-call-primitive-receiver.test.ts each declare,
module scope, a `function parseDeps(): ParseThetaDocumentDeps` that builds an
inert `SystemNoteChannelDeps` (no-op `sendMessage`/`notify`/`emitDiagnostic`)
plus a trivially-resolving `ModelReferenceMatcher` returning `"resolved"`.
tests/helpers/e2e-s1.ts already exports a `parseDeps()` assembling the
identical `ParseThetaDocumentDeps` shape from the same field values (via its
own `inertSystemNote()`/`resolvingMatcher` locals) under an `export` keyword.
None of the four files imports it, even though one of them
(tests/b0388-crossfile-fnbody-effect-undercount.test.ts, reviewed alongside
these in the same shard) already imports `parseDeps` from
`./helpers/e2e-s1` for the identical purpose.

## Evidence

tests/b0385-key-placeholder-json-stringify.test.ts:101-110:
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

tests/b0386-dead-block-let-scope.test.ts:52-58:
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

tests/b0392-unary-minus-operand-discipline.test.ts:167-173 and
tests/b0393-stdlib-method-call-primitive-receiver.test.ts:114-120 are
byte-identical to b0386's declaration above (confirmed by direct read of
each range).

tests/helpers/e2e-s1.ts:26-40 (the canonical export, same field values,
factored through its own two module-scope locals):
```ts
/** An in-band, no-op system-note channel that discards emitted batches. */
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

Exact search: `grep -n "^function parseDeps" tests/b0385-key-placeholder-json-stringify.test.ts
tests/b0386-dead-block-let-scope.test.ts tests/b0392-unary-minus-operand-discipline.test.ts
tests/b0393-stdlib-method-call-primitive-receiver.test.ts` → exactly 4 hits, one per
file; none of the four files' `grep -n "from \"\./helpers"` output names
`./helpers/e2e-s1`.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class. tests/helpers/e2e-s1.ts's
own header states it "wraps the REAL production front-end entry points... so
a test can assert on the returned diagnostics/tokens without a model or
session"; its exported `parseDeps()` produces the identical
`ParseThetaDocumentDeps` value each of the four files' own copy also
produces. This exact gap has already been confirmed and fixed repeatedly for
disjoint file pairs (PTQ-0214, PTQ-0314, PTQ-0386, all resolved) — b0385,
b0386, b0392 and b0393 are a further, disjoint occurrence, none named in any
of those three findings' cited locations.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already exports a `parseDeps()` matching all four
files' local copies field-for-field; it is the existing home each file's own
copy could import instead of redeclaring, the same substitution
tests/b0388-crossfile-fnbody-effect-undercount.test.ts (reviewed in the same
shard) already makes.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or the
  named kin; not applicable.
- Recording-double check: `parseDeps()`'s returned `SystemNoteChannelDeps` /
  `ModelReferenceMatcher` are stateless no-op/constant-resolving stubs, not
  recording doubles backing a "never called" witness; the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0385-key-placeholder-plain-quote-vs-json-stringify.md,
  docs/bugs/0386-dead-block-let-leaks-immutability-false-refusal.md,
  docs/bugs/0392-unary-minus-no-operand-discipline.md and
  docs/bugs/0393-stdlib-method-call-primitive-receiver-silent-null.md all
  exist; none of the four files' RED cells are skipped past a precondition —
  each file's own header states every cell is a direct assertion, so no
  silent-skip claim is implicated by this duplication finding.
- coverage-matrix/bug-doc citation search: `grep -n "b0385-key-placeholder-json-stringify\|b0386-dead-block-let-scope\|b0392-unary-minus-operand-discipline\|b0393-stdlib-method-call-primitive-receiver"
  docs/reference/coverage-matrix.md` → 0 hits; cross-bug-doc citation search
  (excluding each file's own bug document) → 0 hits. This finding proposes no
  merge, rename, or deletion of any of the four files or any
  `it()`/`describe()` inside them — only that the local `parseDeps()` could
  import the existing export instead of redeclaring it.
- Prior-finding overlap check: PTQ-0214 (resolved), PTQ-0314 (resolved), and
  PTQ-0386 (resolved) each cover this identical `parseDeps()` gap in disjoint
  file pairs; none names b0385, b0386, b0392, or b0393. This is a distinct,
  unremediated occurrence of the same already-recognised gap, not a
  re-filing.
- Coverage check: the claim is about a repeated helper DEFINITION, not a
  missing test path; every field of each local `parseDeps()` is exercised by
  its own file's tests.

## Triage
verdict: confirmed — independently re-verified: `^function parseDeps` hits exactly once in each of b0385:101, b0386:52, b0392:167 and b0393:114 (b0386/b0392/b0393 bodies diff-identical; b0385 differs only in wrapping the `modelMatcher` literal), each building the same no-op SystemNoteChannelDeps + constant-"resolved" ModelReferenceMatcher that tests/helpers/e2e-s1.ts:26-40 exports as `parseDeps()`; none of the four files imports `./helpers/*` (grep exit 1) while b0388:31 already imports `parseDeps` from `./helpers/e2e-s1`; none is a gate test, no merge/rename/delete is proposed (the four bug-doc witness citations are untouched), the stubs are stateless so the recording-double carve-out does not apply; not a duplicate — resolved PTQ-0214/0314/0386 cite disjoint files (array-sink, b0295, b0369/b0417) and the same-wave d7-03 sibling covers a disjoint piece (belt-probe harness), so this is the separately-filable not-migrated residual class (PTQ-0228/PTQ-0240 precedent) (triage: claude-fable-5-1)
