# Bug 0205 — Three of the eight `containsWithheldBinderType` gates in `src/parser/type-layer-checks.ts` — the `subagent fn` return annotation (`checkSubagentReturnAnnotation`, `:1699`), the array-literal common type (`checkArrayLiteral`, `:1833`) and the object-field value (`checkObjectField`, `:1942`) — have no pinning cell anywhere in the suite: neutering each one leaves the full default suite at `325 files / 5949 tests` green, and the fixtures that discriminate them (`subagent fn h(x): integer { return [x] }`, `Q { b: [[x]] }` and `Q { b: [x] }` over a schema-declared field) parse `[]` at HEAD and exist in no committed test

- **Status:** open. §Fix is settled: additive absence cells with their
  emitting-twin controls in bug 0050's witness
  (`tests/fn-arg-type-mismatch-wired.test.ts`), on the pattern bug
  [0193](./0193-withheld-binder-gates-lost-last-pinning-cells.md) shipped for
  the other two sinks (`u13mh`, `u13mi`), plus the two narrative statements the
  new cells discharge. No `src/**` byte moves, no assertion flips, no fixture
  re-points, no registry or spec edit. Ordering: nothing blocks this report from
  starting and it blocks nothing; 0193 is **fixed (0.124.0)** and this report
  measures the tree its fix delivered.
- **Sev/Diff estimate:** S3/D2 — three live gates whose removal is invisible to
  `npm test`, the species 0193 names "a gate that cannot red". S2 was weighed
  and rejected: nothing is wrong at HEAD, all three gates hold, and no
  author-visible behaviour moves; what is absent is the regression pin. D2
  rather than D1 because the three sinks need three different fixture shapes
  and two of them are not reachable through a `let` annotation at all — the
  array-element and object-field sinks are only reachable with a withheld
  element through a schema constructor, since the typed-`let` gate at `:1188`
  answers first on that route — so the fix carries four measured cells (a
  fourth closes 0193's residual 2) rather than two mechanical twins.
- **Kind:** verification gap — test-coverage defect. No spec sentence is
  violated, no registry row is engaged, and no `theta/*` behaviour is wrong at
  HEAD. The applicable in-tree rule is `AGENTS.md:124` §*Verify both directions
  when adding or strengthening an assertion* — "A live assertion that cannot
  red is worthless". One in-tree statement is falsified as a side effect: the
  u13 narrative block claims the object-field value sink is one of the six
  "where the group's own subject is measured"
  (`tests/fn-arg-type-mismatch-wired.test.ts:2594–2599`), and neutering that
  gate reds nothing.
- **Related:**
  - [0193](./0193-withheld-binder-gates-lost-last-pinning-cells.md) — **fixed
    (0.124.0)**, the direct predecessor and the pattern this fix follows. It
    restored pins at exactly two of the eight sites: the typed-`let` RHS
    (`u13mi`, `tests/fn-arg-type-mismatch-wired.test.ts:2907`, fixture `:959`)
    and the `array.join` element (`u13mh`, `:2883`, fixture `:958`). Its
    §Non-goals scoped the other six out and its residual 3 records them as
    unmeasured; residual 2 records the `match`-binder join shape as a
    candidate. This report measures all six and closes residual 2 with a
    measurement rather than an assumption.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **fixed (0.107.0)**,
    commit `3d05fd46`, where the plain-`for` vehicle stopped being a withheld
    binder and the sink rows written on it stopped measuring the withhold. Its
    round-2 fixer reported four sinks losing their last cell and its settled
    residual named two; the arithmetic is resolved here by measurement — three
    sinks are unpinned at this HEAD, and the object-field sink is the one
    neither count named.
  - [0190](./0190-fn-arg-sink-withholds-provable-member-reads.md) — **fixed
    (0.111.0)**, named for file coordination: it moved cells of the same
    84-cell witness (now 87 `it`s before 0193's two, 89 after) and edited
    `provableArgType`'s member arm in the same
    `src/parser/type-layer-checks.ts`. This report edits no `src/**` file, so
    its cells rebase onto that file's current line layout with no assertion
    change.
  - [0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md) —
    **open**, the other live report over the same sentinel: it plans edits to
    the withhold predicate's spellability contract and to the *Message* strings
    that render `<withheld>`. Landing order is free — this report adds cells and
    changes no predicate. Landing it first gives 0143's fix three more gates it
    cannot silently drop.
- **Affected** (symbols, not lines; every citation re-verified at HEAD
  `f832672d`, v0.124.0, `package.json:3`, by `rg` and by reading the file;
  `git status --short` empty while the measurements ran):
  - **The gate.** `src/parser/type-layer-checks.ts` (2992 lines).
    `WITHHELD_BINDER_TYPE_NAME` (`:422`), the recursive predicate
    `containsWithheldBinderType` (`:444`), and the site that mints the entry,
    `recordWithheldBinders` (`:1547`). Two binder classes carry the sentinel
    after 0126: an unannotated `fn` parameter (`walkFn`, record at `:1596`) and
    a `match` pattern binder (`matchArmScope`, `:1568`, record at `:1578`);
    `walkStmt`'s `case "for"` keeps it only for a non-`array` iterand (`:1371`)
    and a refused `let` annotation reaches it at `:1167`.
  - **Unpinned sink 1 — the `subagent fn` return annotation.**
    `checkSubagentReturnAnnotation` (`:1667`, called from `walkFn` at `:1644`)
    gates at `:1699` in front of `checkInvokeReturnType`
    (`src/parser/invoke-diagnostics.ts:281`,
    `theta/parse/invoke-return-type-mismatch`, registry row
    `docs/spec_topics/diagnostics/code-registry-parse.md:123`).
  - **Unpinned sink 2 — the array-literal common type.** `checkArrayLiteral`
    (`:1822`) gates at `:1833` in front of `checkCommonType`
    (`src/parser/type-compat.ts:564`, `theta/parse/array-element-type-mismatch`,
    registry row `code-registry-parse.md:40`). The gate decides only the
    in-scope-sink arm (`type-compat.ts:572`); the sink-less arm (`:598`) answers
    `"unknown"` on a withheld branch by itself.
  - **Unpinned sink 3 — the object-field value.** `checkObjectField` (`:1931`,
    called from `checkObjectFields` at `:1898`) gates at `:1942` in front of
    `checkObjectFieldCompat` (`src/parser/type-compat.ts:509`,
    `theta/parse/object-field-type-mismatch`, registry row
    `code-registry-parse.md:46`). The gate covers that emitter only: the
    declared-`array<T>` element sink beside it (`:1956`) runs unguarded and
    reaches sink 2's gate instead.
  - **The five pinned sites, for unambiguous identification.** The typed-`let`
    RHS (`:1188`, pinned by `u13mi`) and the `array.join` element (`:2779`, in
    `checkMethodCall` `:2751`, pinned by `u13mh`), both restored by 0193; the
    plain-`for` iterand (`:1335`), the `par for` iterand (`:2478`) and the
    object-index key (`:2738`), each measured pinned here.
  - **The witness the fix extends.** `tests/fn-arg-type-mismatch-wired.test.ts`
    (3248 lines, 89 `it`s, green at HEAD). The u13 group holds the two cells
    0193 added (`u13mh` `:2883`, `u13mi` `:2907`), the differentiators the new
    cells reuse as controls (`u13pd` `:2974` object-field, `u13pe` `:2990`
    array element, `u13pf` `:3009` `subagent fn` return annotation), and the
    cells whose shape does not discriminate (`u13c` `:2672`, `u13mb` `:2749`,
    both routing the withheld read as the whole field value).
  - **The narrative claim the measurement falsifies.** The u13 block's "WHICH
    CELLS CARRY THE WITHHELD SUBJECT" sentence
    (`tests/fn-arg-type-mismatch-wired.test.ts:2594–2599`) lists `u13c` and
    `u13mb` at the object-field value sink among the six sinks "where the
    group's own subject is measured". Neutering `:1942` reds neither. The cells'
    own comments are accurate — `u13mb`'s failure message says the row "defers
    on the withheld entry exactly as it defers on any unresolvable value type"
    (`:2760`);
    the overclaim is the block's.
  - **The `match`-binder join shape.** 0193 §Fix item 7 / residual 2:
    `let m = match "hi" { x => [x].join(",") }`. Its neutered direction is
    measured here for the first time and it discriminates the `:2779` gate over
    the `match` binder class, which no cell reaches at that sink.
- **Observed at:** v0.124.0 (`package.json:3`), HEAD `f832672d`. Offline,
  deterministic, provider-free: `rg`, file reads, six full `npm test` runs each
  over one byte-edited gate, and one scratch vitest file driving `parseDoc`
  (`tests/helpers/e2e-s1.ts:38–42`), deleted after measurement
  (`git status --short` and `ls tests | grep -i scratch` both empty
  afterwards). Every neutralisation was restored by explicit inverse edit and
  proved by blob hash:
  `git hash-object src/parser/type-layer-checks.ts` =
  `git rev-parse HEAD:src/parser/type-layer-checks.ts` =
  `1fc5f76443e6ea7f0b20270eed648ca42f6b187c` after each run.

## Summary

`containsWithheldBinderType` is the value channel of bug 0050's withheld-binder
recording: where a judgement sink would otherwise decide a verdict from a type
this layer cannot know, the sink withholds. Eight sites call it. 0193 restored
pins at two. Of the remaining six, three are pinned and three are not.

Neutering the `subagent fn` return-annotation gate, the array-literal
common-type gate or the object-field value gate leaves the whole default suite
green — `325 files / 5949 tests` passed in each of the three runs, the same
totals as the unmodified baseline. Each gate's removal is therefore invisible to
`npm test`, and each removal is a false `E`: registration denied for a program
that loads cleanly, with the internal sentinel rendered into a `<type>` slot.

Discriminating fixtures exist for all three and both directions are measured
here. Each puts the withheld read INSIDE a composite the sink can judge
structurally, so the sink has a shape to decide and a hole in it:
`subagent fn h(x): integer { return [x] }`,
`schema Q { b: array<integer> }` with `Q { b: [[x]] }`, and
`schema Q { b: string }` with `Q { b: [x] }`. All three parse `[]` at HEAD; with
their gate neutered each emits `… array<<withheld>>` under an `E` code. None of
the three shapes occurs in `tests/**` or in any committed `.theta` /
`.thetalib`.

The shapes the suite does carry at these sinks route the withheld read as the
WHOLE operand (`u13c`, `u13mb`: `Q { b: P }` over a `match` binder), where the
emitter answers `"unknown"` off the operand's own unresolvability and the gate
decides nothing. That is the same non-discrimination 0193 measured for `g2`,
`g3` and `g4`, one sink over.

The `match`-binder join shape 0193 left as a candidate (its residual 2) is
measured in both directions here: `[]` as shipped, and
`non-string-array-join … got array<<withheld>>` with the `array.join` gate
neutered. It discriminates.

## Reproduction

At HEAD `f832672d` (v0.124.0), offline. Two measurements: which gates the suite
pins, and which fixtures discriminate the ones it does not.

**Step 1 — the eight call sites.**

```sh
rg -n 'containsWithheldBinderType' src/parser/type-layer-checks.ts
#   :444 :449 :451 :453   the predicate itself
#   :1188 :1335 :1699 :1833 :1942 :2478 :2738 :2779   the eight gates
```

**Step 2 — per-gate neutralisation against the full suite.** One targeted byte
edit per run, restored by explicit inverse edit, blob hash checked after each.
Baseline first: unmodified HEAD, `npm test` → `Test Files 325 passed (325)` /
`Tests 5949 passed (5949)`. One earlier baseline run reported a single unrelated
red at `tests/inbound-union-arm-dispatch.test.ts:1577` (a real-process spawn
assertion); it passed on re-run and in all six neutered runs, so it is flaky and
attributable to no edit here.

| gate | symbol | neutralisation | `npm test` | pin status | restore hash |
|---|---|---|---|---|---|
| `:1188` | `walkStmt` `case "let"` | not re-measured — 0193's §Fix (0.124.0) verification reds `u13mi` alone | — | pinned (`u13mi`) | — |
| `:1335` | `walkStmt` `case "for"` iterand | `const diag = containsWithheldBinderType(iterandType)` → `const diag = false` | `2 files failed / 8 tests failed`, 5941 passed | pinned | `1fc5f764…` = HEAD |
| `:1699` | `checkSubagentReturnAnnotation` | `if (containsWithheldBinderType(resolved.inferred.payload))` → `if (false)` | `325 passed (325)` / `5949 passed (5949)` | **UNPINNED** | `1fc5f764…` = HEAD |
| `:1833` | `checkArrayLiteral` | `if (branches.some((branch) => containsWithheldBinderType(branch)))` → `if (false)` | `325 passed (325)` / `5949 passed (5949)` | **UNPINNED** | `1fc5f764…` = HEAD |
| `:1942` | `checkObjectField` | `if (!containsWithheldBinderType(valueType))` → `if (true)` | `325 passed (325)` / `5949 passed (5949)` | **UNPINNED** | `1fc5f764…` = HEAD |
| `:2478` | `walkExpr` `case "par-for"` iterand | `const iterDiag = containsWithheldBinderType(rawIterandType)` → `const iterDiag = false` | `1 file failed / 2 tests failed`, 5947 passed | pinned | `1fc5f764…` = HEAD |
| `:2738` | `checkObjectIndex` | `const objectDiag = containsWithheldBinderType(indexType)` → `const objectDiag = false` | `1 file failed / 1 test failed`, 5948 passed | pinned | `1fc5f764…` = HEAD |
| `:2779` | `checkMethodCall` `join` branch | not re-measured against the suite — 0193's verification reds `u13mh` alone; the probe direction is re-measured in step 3 (J5) | — | pinned (`u13mh`) | — |

The red sets of the three pinned gates, transcribed:

- `:1335` — `tests/plain-for-loop-variable-element-type.test.ts` cells `g1`
  (`:1509`), `g2`, `g3`, `g4`, `g5` (`:1556`), `g6` (`:1570`), and
  `tests/annotation-nontype-text-refusal.test.ts` cells `i2` (`:1300`) and `i4`
  (`:1339`).
- `:2478` — `tests/fn-arg-type-mismatch-wired.test.ts` cells `u13d` (`:2700`)
  and `u13mc` (`:2764`).
- `:2738` — `tests/plain-for-loop-variable-element-type.test.ts` cell `g6`
  (`:1570`).

Restores: `1fc5f76443e6ea7f0b20270eed648ca42f6b187c`, equal to
`git rev-parse HEAD:src/parser/type-layer-checks.ts`, after every run.

**Step 3 — the discriminating fixtures, both directions.** One scratch vitest
file drove `parseDoc` (`tests/helpers/e2e-s1.ts:38–42`) over each source with
`---\nmode: prompt\n---\n` prepended (so body line 1 is file line 4), printing
`severity code @line:column: message` per diagnostic; the file was deleted after
the run. `[]` is zero diagnostics. The "neutered" column re-runs the same probe
with that sink's gate removed, restored and hash-checked as in step 2.

| probe | source (after the frontmatter) | shipped | with its gate neutered |
|---|---|---|---|
| R1 | `subagent fn h(x): integer { return [x] }` + `let r = h(1)` | `[]` | `error theta/parse/invoke-return-type-mismatch @4:10: invoke<Schema> annotation incompatible with callee 'h' return type array<<withheld>>` |
| R3 (control) | `subagent fn h(): integer { return [1] }` + `let r = h()` | same code, `… return type array<integer>` | unchanged |
| R2 | `subagent fn h(x): integer { return x }` | `[]` | `[]` |
| R4 | `subagent fn h(x): array<string> { return [x] }` | `[]` | `[]` |
| C11 | `schema Q { b: array<integer> }` + `fn h(x) { let m = Q { b: [[x]] } }` | `[]` | `error theta/parse/array-element-type-mismatch @5:26: array element type mismatch at index 0: expected integer, got array<<withheld>>` |
| C13 | same schema + `let m = match "hi" { x => Q { b: [[x]] } }` | `[]` | same code `@5:34`, `got array<<withheld>>` |
| C12 (control) | same schema + `fn h() { let m = Q { b: [["s"]] } }` | `object-field-type-mismatch @5:25` + `array-element-type-mismatch @5:25 … got array<string>` | unchanged |
| C1 / C5 | `fn h(x) { let a = [x, 1] }`, `fn h(x) { let a = [x, "s", 1] }` | `[]` | `[]` |
| C3 | `fn h(x) { let a: array<integer> = [[x]] }` | `[]` | `[]` |
| O1 | `schema Q { b: string }` + `fn h(x) { let m = Q { b: [x] } }` | `[]` | `error theta/parse/object-field-type-mismatch @5:26: field 'b' on schema 'Q' type mismatch: expected string, got array<<withheld>>` |
| O5 | same schema + `let m = match "hi" { x => Q { b: [x] } }` | `[]` | same code `@5:34`, `got array<<withheld>>` |
| O3 (control) | same schema + `fn h() { let m = Q { b: [1] } }` | `object-field-type-mismatch @5:25 … got array<integer>` | unchanged |
| O2 | same schema + `fn h(x) { let m = Q { b: x } }` | `[]` | `[]` |
| J5 | `let m = match "hi" { x => [x].join(",") }` | `[]` | `error theta/parse/non-string-array-join @4:27: array.join requires a string element type; got array<<withheld>>` |
| J6 (control) | `let m = match "hi" { x => [1].join(",") }` | same code, `got array<integer>` | unchanged |

Readings:

- **R1, C11, O1 (and their `match`-binder twins C13, O5, and J5) discriminate.**
  The binder is an unannotated `fn` parameter or a `match` pattern binder — the
  two classes 0126 leaves withheld — and the read sits inside an array literal,
  so the type reaching the sink is `array<<withheld>>` and the predicate's
  recursion (`:449`) sees it.
- **R3, C12, O3, J6 establish that each position is live.** Each differs from
  its subject in the parameter list and the array element only, and each fires
  at the same position, so the silence above is a withhold and not an unreached
  check — the argument `g6`'s comment makes with `u13ph`.
- **R2, O2, C1, C5 do not discriminate.** They route the withheld read as the
  whole operand, where `checkCompatible` / the sink-less LUB arm
  (`src/parser/type-compat.ts:598`) answers `"unknown"` on its own. O2 is
  exactly `u13c`'s and `u13mb`'s shape.
- **C3 measures the wrong gate.** `let a: array<integer> = [[x]]` is silenced by
  the typed-`let` gate at `:1188` upstream of the element sink (`:1204`), so it
  pins `u13mi`'s gate, not `:1833`. The array-element sink is reachable with a
  withheld branch only through the schema-constructor route (`:1956`), which the
  object-field gate at `:1942` does not cover — verified by neutering `:1833`
  alone and watching C11 flip.

**Step 4 — no committed test carries any of the three shapes.**

```sh
# The subagent-return sink: a subagent fn with an unannotated parameter, and any
# `return` of an array literal over an identifier.
rg -n 'subagent fn [A-Za-z_][A-Za-z0-9_]*\([a-z][A-Za-z0-9_]*\)' tests -g '*.ts'   # no match
rg -n 'return \[[A-Za-z_]' tests -g '*.ts'      # only TypeScript returns, no theta source

# The object-field and array-element sinks: a schema-constructor field whose
# value is an array literal over an identifier.
rg -no '\{ *[A-Za-z_][A-Za-z0-9_]* *: *\[[^]]{0,20}\]' tests -g '*.ts' \
  | grep -E ': \[\[?[A-Za-z_]'                  # only TypeScript object literals

# The committed corpus.
rg -n 'subagent fn' --glob '*.theta' --glob '*.thetalib' .   # docs/examples only, all annotated
```

`tests/subagent-fn-return-annotation.test.ts` (466 lines, 16 `it`s) owns the
return-annotation row and mentions `withheld` nowhere.

## Expected behaviour

- **A gate whose removal changes an author-visible verdict has a cell that reds
  when it is removed.** `AGENTS.md:124`: "A live assertion that cannot red is
  worthless." Three gates match zero reds today.
- **An absence cell measures the mechanism it names.** A `[]` assertion is a pin
  only when the sink is reached at that position and the gate is what silences
  it. The tree states the standard in `g6`'s comment
  (`tests/plain-for-loop-variable-element-type.test.ts`, cell at `:1570`) by
  naming the emitting twin.
- **A witness's narrative says only what its cells measure.** The u13 block
  (`tests/fn-arg-type-mismatch-wired.test.ts:2594–2599`) counts the object-field
  value sink among those where "the group's own subject is measured"; the
  measurement says otherwise.
- **The withhold survives an edit to its own sink.** 0143 is open against the
  sentinel's contract and the strings that render it. A change that drops any of
  these three withholds should red something.

## Actual behaviour / root cause

### What the three gates decide

Each sink judges structurally, so the sentinel's unspellability is not
self-sufficient there:

- **`subagent fn` return annotation.** `checkInvokeReturnType` decides the
  annotation against the inferred Ok payload. With the gate removed,
  `subagent fn h(x): integer { return [x] }` reports
  `theta/parse/invoke-return-type-mismatch … return type array<<withheld>>` —
  R3's shape with a proven element. The annotation's own arm cannot save it:
  `⊑` answers the `integer` vs `array` relation before any `resolveNamed` arm.
- **Array-literal common type.** `checkCommonType`'s in-scope-sink arm
  (`src/parser/type-compat.ts:572`) tests each branch `⊑ sink` and reports the
  first failure by index. With the gate removed, `Q { b: [[x]] }` against
  `b: array<integer>` reports
  `theta/parse/array-element-type-mismatch … got array<<withheld>>`.
- **Object-field value.** `checkObjectFieldCompat`
  (`src/parser/type-compat.ts:509`) routes `checkCompatible` the way
  `checkLetRhsCompat` does, and a declared primitive against an `array` value is
  decided structurally. With the gate removed, `Q { b: [x] }` against
  `b: string` reports
  `theta/parse/object-field-type-mismatch … got array<<withheld>>`.

All three codes are `E`, so all three false verdicts deny registration
(`hasLoadParseError`, `src/extension/production-composition.ts:2214`) to a
program the runtime executes cleanly: the withheld
binder's runtime value is whatever the caller passes or whatever the scrutinee
holds, and the annotation or schema is the author's own claim, checked by the
runtime AJV net.

### Why nothing reds

Two separate causes, one per group of sinks.

**The array-element and object-field sinks were only ever fed through the whole
operand.** `u13c` (`:2672`) and `u13mb` (`:2749`) put a `match` binder at the
object-field sink as the entire field value (`Q { b: P }`). At that shape the
emitter answers `"unknown"` off the operand's own unresolvable `named` and the
gate is not what produces the `[]`. `u13mb`'s failure message says exactly that
(`:2760`); the block-level narrative at `:2594–2599` nonetheless counts the
sink as measured. The array-element sink has no withheld-fed cell at all: the
only route from a `let` annotation is closed by the `:1188` gate one level up,
so the shape a pin needs is a schema constructor with a declared `array<T>`
field, which no cell writes.

**The subagent-return sink has a differentiator but no subject.** `u13pf`
(`:3009`) is the proven-parameter control (`subagent fn h(q: string):
array<integer> { return q }`) and it fires; the withheld-fed counterpart was
never written. `tests/subagent-fn-return-annotation.test.ts` covers the row's
positive and negative cases over annotated parameters only.

### Root cause

Bug 0050's witness reached the eight sinks with whichever binder made the
shortest fixture, and for five of the sinks that was a plain `for` variable or
the whole-operand form of a `match` binder. 0126 moved the `for` class off the
withheld set; 0193 restored the two sinks whose loss 0126 had recorded. The
three sinks here were never pinned by a discriminating fixture in the first
place: their `[]` cells (where they exist) rest on the operand's own
unresolvability, which the emitters already defer on, so the gate's presence has
never been observable to the suite. A pin that never discriminated still passes,
and the group narrative was written from the fixture's position rather than from
a neutralisation.

## Why it matters

- **Three `E`-severity false-refusal paths are unguarded.** Dropping any of the
  three withholds denies registration to a program that loads and runs, and
  renders `<withheld>` into a `<type>` slot. 0126 measured that exact outcome
  when it tested its alternative fallback and rejected route 2 on it; the same
  class of edit at these three sinks ships green today.
- **A false in-tree statement is load-bearing for readers.** The u13 block
  (`:2594–2599`) tells the next author that the object-field sink is measured.
  An author who reads it and then edits `checkObjectField`'s gate gets a green
  suite.
- **0143 is queued over this code.** It edits the sentinel's contract and the
  *Message* strings that render it, and will be verified by neutralisation
  against the suite as it stands.
- **Closing it costs four cells; reconstructing the evidence later costs more.**
  All four discriminating fixtures and their controls are measured in
  §Reproduction, in both directions.

## Non-goals

- **Changing any gate.** All eight are correct as shipped and stay
  byte-identical. This report adds cells; it asserts no defect in `src/**`.
- **Re-pointing `u13c`, `u13mb` or any existing cell.** Their post-0126 subject
  — that the row defers on an unresolvable value type — is a real property and
  their assertions stay byte-identical. The fix adds cells beside them and
  corrects one narrative sentence.
- **The five pinned sites.** `:1188`, `:1335`, `:2478`, `:2738` and `:2779` are
  measured pinned in §Reproduction and need nothing.
- **Widening the object-index or iterand coverage.** `g6`, `g1`, `g5`, `u13d`
  and `u13mc` hold those sinks; their fixtures are not touched.
- **Citation drift in other bug documents.** 0193's §Affected cites
  `type-layer-checks.ts` at its 0.107.0 line layout (`:387`, `:409`, `:966`,
  `:2335`, …), which this HEAD no longer matches. That is bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s class and is not
  swept here.

## Fix

Four additive absence cells with their controls, in bug 0050's witness
`tests/fn-arg-type-mismatch-wired.test.ts`, in the `u13*` group beside `u13mh`
(`:2883`) and `u13mi` (`:2907`), on the pattern 0193 shipped there. That file
owns the gate's contract, already holds every one of these sinks' emitting
differentiators, and carries the narrative sentence the new cells correct. No
`src/**` edit, no `docs/spec_topics/**` edit, no registry row, no fixture
re-point, no assertion flip.

Each cell asserts `[]` as an ordered whole-list `toEqual`, behind a loud
`letRange` precondition so a layout drift fails there instead of letting the
`[]` measure nothing, with the diagnostics rendered into the failure message —
the shape `u13mh` and `u13mi` use.

1. **The `subagent fn` return-annotation sink.** Fixture
   `FM + 'subagent fn h(x): integer { return [x] }\nlet r = h(1)\nr\n'`,
   measured `[]` at HEAD (probe R1) and
   `theta/parse/invoke-return-type-mismatch … return type array<<withheld>>`
   with the gate at `:1699` removed. Comment states that
   `checkSubagentReturnAnnotation` runs FN-3 payload inference first and hands
   the payload to `checkInvokeReturnType`, which decides `integer` against an
   `array` outer shape before any `resolveNamed` arm, so the sentinel does not
   defer this row on its own. Control: `u13pf` (`:3009`), the same position over
   an annotated parameter, cited in the comment on `g6`'s pattern; probe R3 is
   the minimal-difference twin if a sibling cell is preferred.
2. **The array-literal common-type sink.** Fixture
   `FM + 'schema Q { b: array<integer> }\nfn h(x) { let m = Q { b: [[x]] } }\n1\n'`,
   measured `[]` at HEAD (probe C11) and
   `theta/parse/array-element-type-mismatch … at index 0: expected integer, got array<<withheld>>`
   with the gate at `:1833` removed. Comment states why the route is a schema
   constructor and not a typed `let`: `checkObjectField`'s declared-`array<T>`
   element sink (`:1956`) sits OUTSIDE that method's own gate (`:1942`), whereas
   the `let` route's element sink (`:1204`) sits inside the `:1188` gate, so
   `let a: array<integer> = [[x]]` measures `u13mi`'s gate instead (probe C3).
   Control: `u13pe` (`:2990`), plus probe C12 as the minimal-difference twin.
3. **The object-field value sink.** Fixture
   `FM + 'schema Q { b: string }\nfn h(x) { let m = Q { b: [x] } }\n1\n'`,
   measured `[]` at HEAD (probe O1) and
   `theta/parse/object-field-type-mismatch … expected string, got array<<withheld>>`
   with the gate at `:1942` removed. Comment states that the withheld read is a
   PART of the field value's type, so `checkObjectFieldCompat` has a structure to
   judge — unlike `u13c` / `u13mb`, whose whole-operand shape the emitter defers
   on by itself. Control: `u13pd` (`:2974`), plus probe O3.
4. **The `array.join` element over a `match` binder** — 0193's residual 2,
   now measured rather than optional. Fixture
   `FM + 'let m = match "hi" { x => [x].join(",") }\nm\n'`, measured `[]` at
   HEAD (probe J5) and
   `theta/parse/non-string-array-join … got array<<withheld>>` with the gate at
   `:2779` removed. It pins the `match` binder class at a sink whose only
   withheld-fed cell (`u13mh`) uses an unannotated `fn` parameter. Control:
   `u13pg` (`:3026`), plus probe J6.
5. **Binder class.** Cells 1–3 use an unannotated `fn` parameter and cell 4 a
   `match` pattern binder — the two classes `recordWithheldBinders` still mints
   after 0126 — so no cell is exposed to a future change in plain-`for` binding.
   The `match`-binder twins of cells 2 and 3 (probes C13, O5) are measured and
   may be added; neither is required, since each sink needs one discriminating
   cell.
6. **Narrative corrections.** Two statements in the same file:
   - The u13 block's "WHICH CELLS CARRY THE WITHHELD SUBJECT" sentence
     (`:2594–2599`) must stop counting the object-field value sink as measured
     by `u13c` / `u13mb` and name the new cells instead. State the mechanism:
     those two route the read as the whole field value, which the emitter defers
     on by itself.
   - The head-of-file cell inventory (`:100–120`) gains the new identifiers with
     one mechanism line each, on the shape `u13mh` / `u13mi` already use
     (`:110–117`).
7. **Both-directions proof, per gate, before the change is called done.**
   Neuter the gate at `:1699`, then `:1833`, then `:1942`, then `:2779`, one at a
   time; confirm the full suite reds exactly that gate's new cell, with the
   message transcribed in §Reproduction step 3. A red anywhere else means the
   fixture reaches a sink it was not written for; at `:2779` the pre-existing
   `u13mh` red is expected beside cell 4's. Restore by explicit inverse edit and
   prove each restore by blob hash against
   `HEAD:src/parser/type-layer-checks.ts`. Record all four red sets in the fix
   record — they are the evidence this report exists to create.
8. **Gates.** `npx vitest run tests/fn-arg-type-mismatch-wired.test.ts` → 93
   `it`s (89 at HEAD + 4; more if the optional twins are written); full default
   suite green at 5953 (5949 at HEAD + 4), re-measured before and after;
   `npx tsc -p tsconfig.json --noEmit` clean; `npm run lint` clean. No live run
   is owed: the subject is a parse-time gate with no session surface and no file
   under `tests/live/**` changes.

## Provenance

- Filing origin: bug
  [0193](./0193-withheld-binder-gates-lost-last-pinning-cells.md)
  `## Fix (0.124.0)` §*Residuals* items 2 and 3 — the `match`-binder join shape
  left as a candidate, and the six call sites left unmeasured for pin status.
  This report measures all six against the full suite and both directions of
  every discriminating fixture it proposes.
- What this report adds beyond that residual: the six full-suite
  neutralisation runs with their red sets and restore hashes, the identification
  of three genuinely unpinned sinks (one of them — object-field value — named by
  neither 0126's round-2 count of four nor its settled residual's two), the
  discriminating fixture for each with its neutered emission and its
  minimal-difference control, the mechanism that closes the array-element sink's
  `let` route (`:1188` answers first) and opens its schema-constructor route
  (`:1956` sits outside `:1942`), the falsification of the u13 block's
  object-field claim, and the first measurement of 0193's item-7 shape in the
  neutered direction.
- Tree measured: HEAD `f832672d`, v0.124.0 (`package.json:3`).
  `git status --short` empty before, between and after every run; every
  neutralisation restored by inverse edit and proved by
  `git hash-object src/parser/type-layer-checks.ts` =
  `1fc5f76443e6ea7f0b20270eed648ca42f6b187c`.
- Implementation read: `src/parser/type-layer-checks.ts` (`:422`, `:444–453`,
  `:1167`, `:1188`, `:1204`, `:1209`, `:1335`, `:1371`, `:1547`, `:1568`,
  `:1578`, `:1582`, `:1596`, `:1644`, `:1667–1699`, `:1822–1844`, `:1852`,
  `:1880–1900`, `:1931–1959`, `:2478`, `:2738`, `:2751`, `:2779`);
  `src/extension/production-composition.ts:2214`;
  `src/parser/type-compat.ts` (`:509`, `:564`, `:572`, `:598`);
  `src/parser/invoke-diagnostics.ts:281`; `src/runtime/stdlib-array.ts:100`.
- Tests read (none modified): `tests/fn-arg-type-mismatch-wired.test.ts`
  (`:100–120`, `:891`, `:909`, `:930`, `:958–959`, `:2594–2599`, `:2672`,
  `:2700`, `:2749–2760`, `:2764`, `:2883`, `:2907`, `:2930`, `:2974`, `:2990`,
  `:3009`, `:3026`); `tests/plain-for-loop-variable-element-type.test.ts`
  (`:1509`, `:1556`, `:1570`);
  `tests/annotation-nontype-text-refusal.test.ts` (`:1300`, `:1339`);
  `tests/subagent-fn-return-annotation.test.ts` (466 lines, 16 `it`s);
  `tests/helpers/e2e-s1.ts:38–42`.
- Registry read: `docs/spec_topics/diagnostics/code-registry-parse.md` (`:40`
  array-element, `:46` object-field, `:123` invoke-return).
- Bug corpus read:
  `docs/bugs/0193-withheld-binder-gates-lost-last-pinning-cells.md` (whole,
  including its `## Fix (0.124.0)` record and residuals);
  `docs/bugs/0126-plain-for-binds-no-loop-variable.md` (status, residual 1);
  `docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md` (status, file
  coordination); `docs/bugs/0143-withheld-sentinel-author-twin-and-render-leakage.md`
  (status).
- Rule cited: `AGENTS.md:124` §*Verify both directions when adding or
  strengthening an assertion*.
- Method: six full `npm test` runs each over one neutered gate, four probe runs
  over one scratch vitest file driving `parseDoc`, `rg` and file reads for
  everything else. The scratch file was deleted after measurement;
  `git status --short` and `ls tests | grep -i scratch` are both empty.
