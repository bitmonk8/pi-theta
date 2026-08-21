# Bug 0193 — `containsWithheldBinderType`'s withhold at the typed-`let` RHS sink (`type-layer-checks.ts:966`) and at the `array.join` element sink (`:2335`) has no pinning cell anywhere in the suite: bug 0126's fix (0.107.0, `3d05fd46`) moved both gates' only withheld-fed inputs onto a proven element type, so neutering either gate leaves the whole default suite green — the gates are correct as shipped, and the two shapes that discriminate them, `fn h(x) { let s = [x].join(",") }` and `fn h(x) { let s: integer = [x] }`, parse `[]` at HEAD and exist in no committed test

- **Status:** fixed (0.124.0). §Fix is settled: two additive absence cells with their
  live-sink controls in bug 0050's witness
  (`tests/fn-arg-type-mismatch-wired.test.ts`), plus the group-narrative
  sentence they discharge. No `src/**` byte moves, no assertion flips, no
  fixture re-points, no registry or spec edit. Ordering: nothing blocks this
  report from starting and it blocks nothing.
  [0126](./0126-plain-for-binds-no-loop-variable.md) is **fixed (0.107.0)**,
  commit `3d05fd46` — the tree this report measures and the run that found the
  gap.
- **Sev/Diff estimate:** S3/D1 — a verification gap of the "gate that cannot
  red" species: two live gates whose removal is invisible to `npm test`. S2 was
  weighed and rejected: nothing is wrong at HEAD, both gates hold, and no
  author-visible behaviour moves — what is absent is the regression pin, which
  is S3's own definition. S4 was rejected because the subject is executable
  behaviour, not prose: the withhold each gate performs is the difference
  between `[]` and an `E` that denies registration to a program which loads
  cleanly, and 0126's §Fix rejected its route-2 fallback on exactly that
  measured false-`E` evidence, so the failure mode is live in this file. D1
  because the remedy is additive cells in one existing witness file, both
  discriminating fixtures are already measured and quoted, the emitting-twin
  controls already exist in that file (`u13pg`, `u13p`), and the
  both-directions proof is the same one-line neutering 0126's verification
  already scripted.
- **Kind:** verification gap — test-coverage defect. No spec sentence is
  violated, no registry row is engaged, and no `theta/*` behaviour is wrong.
  The applicable in-tree rule is `AGENTS.md:124` §*Verify both directions when
  adding or strengthening an assertion* — "A live assertion that cannot red is
  worthless" — whose offline analogue this witness family already practises:
  0050's verification derived each neutralisation's red set before the run and
  matched it exactly, and 0126's did the same
  (`.pi/tmp/fixes/0126-report.md:42`, `:45`, `:80`). Two of the sinks 0050's §Fix
  enumerates (`docs/bugs/0050-…md:592–597`) now sit outside that discipline.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the owner of both the gate and the witness this report
    adds to. Its §Fix built `recordWithheldBinders` and
    `containsWithheldBinderType` and states the contract the missing cells
    measure: the sentinel "withholds the verdict at the six sibling sinks that
    judge structurally or refuse unresolvables (typed-`let`, object-field,
    array-element/common-type, subagent-return, both iterands,
    join-element/object-index-key)" (`:594–597`). Its round-6 review finding
    created the recording; its verification neutralised that recording and
    matched 13 red cells. This report restores the pin at two of those sinks
    and adds no finding against 0050's behaviour.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **fixed (0.107.0)**,
    commit `3d05fd46`, the mechanism and the filing origin. Binding a plain
    `for` variable to the iterand's element type moved `u13m`, `u13mf` and
    `u13mg` off the withheld class they used to carry; the run recorded the
    consequence as `## Fix (0.107.0)` §*Residuals* item 1 (`:1328–1336`) and as
    residual 1 of its run report (`.pi/tmp/fixes/0126-report.md:120`). Its new
    witness's cell `g6`
    (`tests/plain-for-loop-variable-element-type.test.ts:1549`) is the
    replacement pin that sink received; the two sinks here received none.
  - [0143](./0143-withheld-sentinel-author-twin-and-render-leakage.md) —
    **open**, the other live report over the same sentinel. It plans edits to
    the withhold predicate's spellability contract and to the six *Message*
    strings that render `<withheld>`, and its §Fix already reasons about
    keeping cell `u13r`'s byte-exact pin (its bug-0126 coordination note,
    `:881–915`, records that `u13r` survived 0126 because it was re-pointed
    onto an unannotated `fn` parameter — the same binder class the cells this
    report asks for use). Landing order is free: this report adds cells and
    changes no predicate; 0143 changes the predicate and will re-derive whatever
    the new cells assert. Landing this first gives 0143's fix two more gates it
    cannot silently drop.
  - [0190](./0190-fn-arg-sink-withholds-provable-member-reads.md) — **open**,
    named for file coordination only. It edits `provableArgType`'s member arm in
    the same `src/parser/type-layer-checks.ts` and moves cells of the same
    84-cell witness; the two touch no common cell and no common line. This
    report edits no `src/**` file, so its cells rebase onto 0190's line shift
    with no assertion change.
- **Affected** (every citation re-verified at HEAD `5c9104ab` — v0.107.0,
  `package.json:3`; the last code-bearing commit is `3d05fd46` and `5c9104ab` is
  docs-only — by `rg` and by reading the file; no cited file differs from HEAD,
  checked with `git status --short`):
  - **The gate.** `src/parser/type-layer-checks.ts` (2548 lines).
    `WITHHELD_BINDER_TYPE_NAME` (`:387`), the recursive predicate
    `containsWithheldBinderType` (`:409`, docstring `:390–408`), and the one
    site that mints the entry, `recordWithheldBinders` (`:1198`, docstring
    `:1166–1197`). Three binder classes reach it: an unannotated `fn` parameter
    (`walkFn`, `:1244`), a `match` pattern binder (`matchArmScope`, `:1229`),
    and a plain `for` variable whose iterand does not unfold to an `array`
    (`walkStmt`'s `case "for"` fallback, `:1117–1118`).
  - **Sink 1 — the typed-`let` RHS.** `walkStmt` (`:943`) `case "let"` (`:945`)
    types the initialiser at `:947` and gates at `:966` —
    `if (annotation !== undefined && !containsWithheldBinderType(rhsType))`.
    The gate covers two emitters: `checkLetRhsCompat` (`:969–977`,
    `theta/parse/let-rhs-type-mismatch` and `theta/parse/integer-narrowing`) and
    the annotation's element sink `checkArrayLiteral` (`:981–982`). Its WHY
    (`:957–965`) states why the sentinel's unresolvability is insufficient here:
    `decide` answers a structural annotation under TYPE-7 / TYPE-8 before its
    `resolveNamed` arms.
  - **Sink 2 — the `array.join` element.** `checkMethodCall` (`:2307`), the
    `join` branch entered only for an unfolded `array` receiver (`:2318`), the
    unfolded element (`:2334`) and the gate (`:2335`) in front of
    `checkArrayJoin` (`:2337`; the predicate is
    `src/runtime/stdlib-array.ts:100`, which admits a `string` element and
    refuses every other one including an unresolvable name). Its WHY
    (`:2328–2333`) names the reachable shape verbatim: "the runtime element may
    be the string the method requires (`[x].join(",")` inside
    `for x in ["a"] { … }`)".
  - **The other six call sites, out of scope and listed so the two are
    identified unambiguously:** the plain-`for` iterand (`:1078`,
    `checkForIterand`), the subagent return annotation (`:1320`, in
    `checkSubagentReturnAnnotation` `:1298`), the array-literal common type
    (`:1454`, in `checkArrayLiteral` `:1443`), the object-field value (`:1563`,
    in `checkObjectField` `:1552`), the `par for` iterand (`:2029`), and the
    object-index key (`:2294`, `checkObjectIndex`,
    `src/runtime/stdlib-object.ts:63`).
  - **The witness that used to pin sink 1 and sink 2.**
    `tests/fn-arg-type-mismatch-wired.test.ts` (3051 lines, 84 cells, green at
    HEAD). `u13m` (`:2589`, fixture `:877`) and `u13mf` (`:2702`, fixture
    `:907`) both read a plain `for` variable; before `3d05fd46` that read was
    withheld and each cell's `[]` was the gate's own product. The fixtures'
    source strings are byte-identical across that commit — only the binding
    moved — and the run renamed the identifiers to say so:
    `U13MF_JOIN_WITHHELD_ELEMENT` → `U13MF_JOIN_FOR_ELEMENT`,
    `U13MG_OBJECT_INDEX_WITHHELD_KEY` → `U13MG_OBJECT_INDEX_FOR_KEY`
    (`git show 3d05fd46^:tests/fn-arg-type-mismatch-wired.test.ts`, `:888`,
    `:891`).
  - **What the group now claims for itself.** The u13 narrative block
    (`:2380–2477`) states at `:2447–2455` that `u13m`, `u13md`, `u13me`,
    `u13mf` and `u13mg` "read a plain `for` variable, which carries the
    iterand's PROVEN element under bug 0126", and at `:2457–2465` enumerates the
    four sinks where "the group's own subject is measured" — object-field
    (`u13c`, `u13mb`), `par for` iterand (`u13d`, `u13mc`), the fn-arg identity
    channel (`u13e`) and the composite render (`u13r`, `:2901`). Neither of this
    report's two sinks is in that list.
  - **The cells that address the two sinks and do not pin them.**
    `tests/plain-for-loop-variable-element-type.test.ts` (1663 lines, 53 cells,
    green at HEAD), group (g) (`:1453–1485`, cells `:1487–1568`): `g3` (`:1515`)
    puts a withheld read at the `join` sink and `g2` (`:1498`) / `g4` (`:1525`)
    put one at the typed-`let` sink, all three asserting `[]`. The block records
    the measurement (`:1468–1470`): they "stay `[]` under both fallbacks — but
    measured (neutering each sink's own withhold check and re-running the whole
    suite), the explicit withhold silences NONE of them". Their fixtures route
    the withheld read as the WHOLE operand — `UNANNOTATED` (`:589–591`) builds
    `fn h(p) { for <v> in p { <stmt> } }`, so `<v>` is withheld and `x.join(",")`
    never enters the `join` branch (`:1482–1485`, `:1521`), while
    `let s: array<integer> = y` is answered by TYPE-7's own escape before any
    element recursion.
  - **The pin the same run did add.** `g6` (`:1549`) is the object-index key
    sink's withheld-fed cell, written in fixer round 3 as "the object-index-key
    sink's only withheld-fed cell tree-wide"
    (`.pi/tmp/fixes/0126-report.md:43`), with a comment that argues silence is a
    withhold and not an unreached check by naming the emitting twin `u13ph`
    (`tests/fn-arg-type-mismatch-wired.test.ts:2855`).
  - **The nearest committed shapes, all resting on a proven read** (the search
    is §Reproduction step 3): `[x].join(",")` occurs twice, at `:907`
    (`u13mf`, `for x in ["a"]` → proven `string`) and `:908–909` (`u13pg`, an
    outer `let x = 1` → proven `integer`, the emitting twin at `:2841`); the
    only typed-`let` cells whose RHS is an array literal over an identifier are
    `b17` / `b18` (`tests/member-access-declared-field-type.test.ts:382–383`),
    whose elements are an annotated parameter's declared field and an annotated
    `let`.
- **Observed at:** v0.107.0 (`package.json:3`), HEAD `5c9104ab`. Offline,
  deterministic, provider-free: `rg`, file reads, and one scratch vitest file
  driving `parseDoc` (`tests/helpers/e2e-s1.ts:38–42`), deleted after
  measurement (`git status --short | grep -i scratch`,
  `ls tests | grep -i scratch` and `git ls-files | grep -i scratch` all empty). No `src/**` file was edited, so the
  neutered direction is not re-measured here; it is quoted from 0126's fix run
  and marked as such throughout.

## Summary

`containsWithheldBinderType` is the value channel of bug 0050's withheld-binder
recording: where a judgement sink would otherwise decide a verdict from a type
this layer cannot know, the sink withholds. Eight sinks call it. Two of them —
the typed-`let` RHS check and the `array.join` element precondition — have no
cell anywhere in the suite whose result depends on the call.

The gates work. What changed is their input. Until `3d05fd46`, both were fed by
a plain `for` variable: `u13m` (`let s: integer = P` inside `for P in [5]`) and
`u13mf` (`[x].join(",")` inside `for x in ["a"]`) each asserted `[]`, and each
`[]` was produced by the gate. Bug 0126 gave a plain `for` variable the
iterand's element type, so both cells now read a proven element and their `[]`
comes from the judgement, not from the withhold. The object-index key sink lost
its cell the same way and got a replacement in the same commit (`g6`); these two
did not.

The remaining cells that put a withheld read at these two sinks — `g2`, `g3`,
`g4` of the new witness — were measured during that run and do not discriminate:
each routes the withheld binder as the whole operand, where the sink's own
generic unresolvable-`named` handling answers first. The gate only decides the
answer when the withheld read sits INSIDE a composite, and no committed test
carries that shape.

Two fixtures do carry it, and 0126's run measured both directions: `fn h(x) {
let s = [x].join(",") }` and `fn h(x) { let s: integer = [x] }` are `[]` as
shipped and emit `… got array<<withheld>>` with the gate neutered. Both parse
`[]` at HEAD, re-measured for this report. Neither shape occurs in `tests/**`,
in `src/**/*.test.ts` (there are none), or in any committed `.theta` /
`.thetalib`.

The removal direction of either gate is a false `E`: registration denied for a
program that loads cleanly, with the internal sentinel rendered into a `<type>`
slot. That is the exact failure 0126 measured when it tested the alternative
fallback, and it is the failure neither gate would now red on.

## Reproduction

At HEAD `5c9104ab` (v0.107.0), offline. Three steps: measure the shapes, show
the suite does not carry them, and read the neutered direction off the record
that measured it.

**Step 1 — the two shapes, and their live-sink controls.** One scratch vitest
file drove `parseDoc` (`tests/helpers/e2e-s1.ts:38–42`) over each source with
the frontmatter `---\nmode: prompt\n---\n` prepended (so a body line 1 is file
line 4), printing `severity code @range: message` per diagnostic. Transcribed
verbatim; `[]` is zero diagnostics. The file was deleted after the run.

```console
P1  fn h(x) { let s = [x].join(",") }        => []
P2  fn h() { let s = [1].join(",") }         => ["error theta/parse/non-string-array-join @4:18-4:31: array.join requires a string element type; got array<integer>"]
P3  fn h(x) { let s: integer = [x] }         => []
P4  fn h() { let s: integer = [1] }          => ["error theta/parse/let-rhs-type-mismatch @4:10-4:30: let binding 's' initialiser type mismatch: expected integer, got array<integer>"]
P5  let m = match "hi" { x => [x].join(",") } => []
P6  fn h(x) { let s = x.join(",") }          => []
P7  fn h(x) { let s: integer = x }           => []
P8  fn h(x) { let s: array<integer> = [x] }  => []
```

Readings:

- **P1 and P3 are the subjects.** The binder `x` is an unannotated `fn`
  parameter, recorded withheld at `type-layer-checks.ts:1244`; the read sits
  inside an array literal, so the type reaching the sink is
  `array<<withheld>>` and the gate's recursion (`:414`) sees it.
- **P2 and P4 are the same positions with a proven element.** Each differs from
  its subject in the parameter list and the array element only, and each fires,
  which establishes that the sink is reached and live at that position: the silence at P1 and P3 is a withhold, not
  an unreached check. This is the argument `g6`'s comment makes with `u13ph`
  (`tests/plain-for-loop-variable-element-type.test.ts:1550–1559`).
- **P5** is the same join shape over the other withheld class still in the tree,
  a `match` pattern binder (`matchArmScope`, `:1229`). Measured `[]` as shipped;
  its neutered direction is not measured by this report or by 0126's.
- **P6, P7, P8 are the non-discriminating shapes**, reproduced here so the fix
  does not write one of them by accident. P6 and P7 are `g3`'s and `g2`/`g4`'s
  vehicles — the withheld read as the whole operand. P8 keeps the withheld read
  inside a composite but pairs it with an `array` annotation, where TYPE-7's
  element recursion meets an unresolvable `named` and defers; its twin with a
  proven element (`let s: array<integer> = ["a"]`) reports both
  `theta/parse/let-rhs-type-mismatch` and
  `theta/parse/array-element-type-mismatch`, so the position is live and the
  deferral is the element rule's, not the gate's.

**Step 2 — the sinks are the two named.** Every call site of the predicate, and
what each guards:

```sh
rg -n 'containsWithheldBinderType' src/parser/type-layer-checks.ts
```

| line | sink | emitter behind the gate |
|---|---|---|
| `:966` | typed-`let` RHS | `checkLetRhsCompat` + the annotation's element sink |
| `:1078` | plain-`for` iterand | `checkForIterand` |
| `:1320` | subagent return annotation | `checkInvokeReturnType` |
| `:1454` | array-literal common type | `checkCommonType` |
| `:1563` | object-field value | `checkObjectFieldCompat` |
| `:2029` | `par for` iterand | `checkForIterand` |
| `:2294` | object-index key | `checkObjectIndex` |
| `:2335` | `array.join` element | `checkArrayJoin` |

**Step 3 — no committed test carries either shape.** The pin requires a
composite whose element is withheld, at one of the two sinks.

```sh
# The join sink: every array-literal receiver of `join` in the suite.
rg -n '\[\s*[A-Za-z_][A-Za-z0-9_]*\s*\]\s*\.join' tests/
#   tests/fn-arg-type-mismatch-wired.test.ts:907   u13mf — `for x in ["a"]`, proven string
#   tests/fn-arg-type-mismatch-wired.test.ts:909   u13pg — outer `let x = 1`, proven integer

# Every other theta-source `join` receiver: annotated parameters, alias-typed
# bindings, member reads and `for` variables over proven elements.
rg -n '\.join\(' tests/ -g '*.ts'          # filter out the TS `Array.prototype.join`

# The typed-`let` sink: every annotated `let` whose initialiser is an array
# literal (87 occurrences), narrowed to those whose element is an identifier.
rg -no 'let [A-Za-z_][A-Za-z0-9_]*[[:space:]]*:[[:space:]]*[^=]{1,40}=[[:space:]]*\[.{0,36}' tests/ -g '*.ts' \
  | grep -E '=[[:space:]]*\[[[:space:]]*[A-Za-z_]'
#   tests/member-access-declared-field-type.test.ts:382  b17 — `[p.s]`, `p: P` annotated
#   tests/member-access-declared-field-type.test.ts:383  b18 — `[y]`, `y: string` annotated

# The corpus and the other suite roots.
rg -n '\.join\(' --glob '*.theta' --glob '*.thetalib' .    # no match (34 committed files)
find src -name '*.test.ts'                                  # none
```

Every unannotated-parameter body in the suite was read as well
(`rg -no 'fn [A-Za-z_][A-Za-z0-9_]*\(\s*[a-z][A-Za-z0-9_]*\s*\)' tests/ -g '*.ts'`
— six files): the only composite over a withheld read is
`U13R_NESTED_RENDER` (`tests/fn-arg-type-mismatch-wired.test.ts:921`,
`fn h(x) { if [x] { let r = 1 } }`), which lands at the boolean-condition row —
an ungated sink that fires and renders `array<<withheld>>`, which is `u13r`'s
subject and not either gate's.

**Step 4 — the neutered direction, quoted, not re-run.** No `src/**` file was
edited for this report. The measurement is bug 0126's, made during its fix run
and independently confirmed in its round-3 review:

- `docs/bugs/0126-plain-for-binds-no-loop-variable.md:1328–1336` — "Neutering
  `containsWithheldBinderType` at the typed-`let` RHS sink and at the
  `array.join` element sink leaves the whole suite green … Discriminating
  fixtures exist and were measured — `fn h(x) { let s = [x].join(",") }` and
  `fn h(x) { let s: integer = [x] }` are `[]` as shipped and emit
  `… got array<<withheld>>` with the gate neutered."
- `.pi/tmp/fixes/0126-report.md:120` — the same finding in that run's report.
- `.pi/tmp/fixes/0126-report.md:80` — round 3's evidence included
  "independently confirming the two-lost-gates measurement".

## Expected behaviour

- **A gate whose removal changes an author-visible verdict has a cell that reds
  when it is removed.** `AGENTS.md:124`: "A live assertion that cannot red is
  worthless." The rule is written for the live axis; this witness family
  already applies it offline — 0050's verification derived three neutralisation
  red sets before the run and matched each exactly (13 cells for the withheld
  recording), and 0126's matched 21 (`.pi/tmp/fixes/0126-report.md:42`, `:45`).
  Neutering either of these two gates today matches zero.
- **An absence cell measures the mechanism it names.** A `[]` assertion is only
  a pin when the sink is reached at that position and the gate is what silences
  it. The tree already states the standard: `g6`'s comment settles the same
  question for the object-index key sink by naming the emitting twin, "so the
  silence here is a withhold and not an unreached check"
  (`tests/plain-for-loop-variable-element-type.test.ts:1557–1559`).
- **A fix that moves a witness's input class replaces the pin it retires.**
  `3d05fd46` did that for the object-index key sink in the same commit (`g6`)
  and recorded the two it did not, rather than leaving the loss silent
  (`docs/bugs/0126-…md:1328–1336`). This report is the deferred half of that
  work.
- **The withhold survives an edit to its own sink.** Both sinks are under active
  reports — 0143 against the sentinel's contract and its rendered *Message*
  strings, 0190 against a neighbouring predicate in the same file. A change that
  drops either withhold should red something.

## Actual behaviour / root cause

### What the two gates decide

Both sinks refuse an unresolvable operand instead of deferring on one, which is
why the sentinel's unspellability is not self-sufficient there:

- `checkArrayJoin` (`src/runtime/stdlib-array.ts:100`) admits a `string`
  element and nothing else, an unresolvable `named` included. With the gate
  removed, `[x].join(",")` over a withheld `x` reports
  `theta/parse/non-string-array-join … got array<<withheld>>` — the shape P2
  shows with a proven element.
- `checkLetRhsCompat` decides a structural annotation through `decide`'s TYPE-7 /
  TYPE-8 arms, which answer before `resolveNamed` runs
  (`type-layer-checks.ts:957–965`). With the gate removed,
  `let s: integer = [x]` reports `theta/parse/let-rhs-type-mismatch … got
  array<<withheld>>` — the shape P4 shows with a proven element.

Both codes are `E`, so both false verdicts deny registration
(`hasLoadParseError`) to a program the runtime executes cleanly: at P1 the
runtime element is whatever the caller passes, and at P3 the annotation is the
author's own claim, checked by the runtime AJV net.

### Why the pins went away

Before `3d05fd46`, a plain `for` variable was a withheld binder, and it was the
vehicle the 0050 witness used at four of the eight sinks. Three of those cells
sit at the sinks in question here or next door:

| cell | fixture (unchanged across `3d05fd46`) | sink | pre-`3d05fd46` | at HEAD |
|---|---|---|---|---|
| `u13m` (`:2589`) | `for P in [5] { let s: integer = P }` | typed-`let` RHS | withheld read; `[]` produced by the gate | proven `integer`; `[]` produced by the judgement |
| `u13mf` (`:2702`) | `for x in ["a"] { let s = [x].join(",") }` | `array.join` element | withheld element; `[]` produced by the gate | proven `string`; precondition met |
| `u13mg` (`:2725`) | `for x in ["b"] { let v = q[x] }` | object-index key | withheld key; `[]` produced by the gate | proven `string`; key admitted |

The fixtures' source strings did not move — `git show
3d05fd46^:tests/fn-arg-type-mismatch-wired.test.ts` carries `u13m`'s at `:858`
and `u13mf`'s at `:888`, byte-identical to `:877` and `:907` at HEAD. What moved
is `walkStmt`'s `case "for"`: the body scope now records the TYPE-11-unfolded
iterand's element (`:1110–1116`) and keeps `recordWithheldBinders` only for a
non-`array` iterand (`:1117–1118`). The run renamed the two identifiers that
asserted the retired mechanism (`U13MF_JOIN_WITHHELD_ELEMENT` →
`U13MF_JOIN_FOR_ELEMENT`, `U13MG_OBJECT_INDEX_WITHHELD_KEY` →
`U13MG_OBJECT_INDEX_FOR_KEY`) and rewrote their comments, so the cells are
correct about what they now measure — the record-versus-spelling channel, which
is a real property one mechanism further in. They no longer measure the
withhold.

`u13mg`'s sink was re-pinned in the same commit by `g6`. The other two were
recorded as residual 1 and left.

### Why the cells that look like pins are not

Group (g) of the new witness puts a withheld read at both sinks:

- `g3` (`:1515`): `x.join(",")` where `x` is the withheld binder. The receiver's
  unfolded type is `named`, not `array`, so the `join` branch at `:2318` is
  never entered and the gate at `:2335` is not evaluated at all;
  `classifyReceiver` (`:2348`) answers with its generic unresolvable case.
- `g2` (`:1498`): `let s: { a: integer } = x`. `annotationToCompatType` yields an
  opaque `named` for an inline object annotation, so TYPE-8 never runs and
  TYPE-10 answers `"unknown"` off the annotation's own unresolvability.
- `g4` (`:1525`): `let s: array<integer> = y`. The sub is an unresolvable
  `named`, and TYPE-7's escape answers before element-wise recursion.

The group's own comment records the measurement (`:1468–1470`): neutering each
sink's withhold check and re-running the suite silences none of them. The
distinction is structural — the gate decides the answer only when the withheld
read is a PART of the operand's type, so the sink has a composite it can judge
structurally and a hole inside it. `[x]` supplies that; `x` does not.

### Root cause

The withheld-fed input class at these two sinks was, in the whole corpus, only
ever reachable through a plain `for` variable. That was an accident of how 0050's
witness was written: `for x in […] { … }` is the shortest way to get a withheld
binder into an expression, so it became the vehicle for the sink rows, while the
two binder classes 0126 does not touch — an unannotated `fn` parameter and a
`match` pattern binder — were used only where the shape needed them (`u13c`,
`u13d`, `u13e`, `u13mb`, `u13mc`, `u13r`). When the vehicle stopped being
withheld, the sinks it carried lost their subject in one commit, and only the
one with a same-commit replacement kept a pin. Nothing in the suite reports the
loss, because a pin that stops discriminating still passes.

## Why it matters

- **Two `E`-severity false-refusal paths are unguarded.** Dropping either
  withhold denies registration to a program that loads and runs, and renders
  `<withheld>` into a `<type>` slot. This is not hypothetical for this file:
  0126's §Fix measured the analogous fallback and found it produced exactly that
  (`for x in p { for y in x { } }` drawing `non-array-iterand … got unknown`),
  which is why route 2's literal mirror was rejected
  (`docs/bugs/0126-…md:1207–1219`). The same class of edit at these two sinks
  ships green today.
- **The contract is asserted in prose with nothing measuring it.** Both gates
  carry multi-line WHY comments (`:957–965`, `:2328–2333`) and 0050's §Fix
  enumerates the sink list (`:594–597`). A reader checking whether the corpus
  holds the layer to that contract finds `u13mf`'s and `u13m`'s `[]` and a group
  narrative that now, correctly, says those cells rest on a proven element
  (`:2447–2455`).
- **Two open reports are queued over this code.** 0143 edits the sentinel's
  contract and the six *Message* strings that render it; 0190 edits a sibling
  predicate in the same file. Both will be verified by neutralisation against
  the suite as it stands.
- **Closing it costs two cells; reconstructing the evidence later costs more.**
  Both discriminating fixtures are known and measured. Once a later fix removes or rewrites one of the gates, the evidence that it
  was load-bearing has to be reconstructed from bug documents rather than read
  off a red test.

## Non-goals

- **Changing either gate.** Both are correct as shipped and stay byte-identical.
  This report adds cells; it asserts no defect in `src/**`.
- **The other six call sites.** Their pin status is not measured here. `g6` and
  `g1` / `g5` cover the object-index key sink and the non-`array` fallback per
  0126's own verification; the object-field, `par for` iterand, subagent-return,
  array-common-type and plain-`for` iterand sinks are out of scope. 0126's
  round-2 fixer first reported the loss as four sinks
  (`.pi/tmp/fixes/0126-report.md:79`) and the settled residual names two; the
  arithmetic between those two statements is not re-derived here.
- **Re-pointing `u13m`, `u13mf` or `u13mg`.** Their post-0126 subject — that a
  sink reads the RECORDED element type and never the binder's spelling — is a
  real property with its own value, and their assertions stay byte-identical.
  The fix adds cells beside them.
- **The `match`-binder class beyond one optional cell.** P5 measures the join
  shape over a `match` pattern binder as `[]` at HEAD; its neutered direction is
  unmeasured, so it is a candidate, not an obligation.
- **Re-litigating 0126's fallback settlement.** Route 1 with the withheld twin
  is shipped and its discriminating pins (`g1`, `g5`, `g6`) hold.
- **Citation drift.** `3d05fd46` shifted `type-layer-checks.ts` citations at
  line ≥1106 by `+17`, and stale spans remain in `docs/bugs/**` (for example
  0143's `:6–7` naming `u13r`'s comment at `:2742–2746`, now `:2901`). That is
  [0134](./0134-params-shift-induced-stale-citations.md)'s class and is not
  swept here.

## Fix

Two additive absence cells with their controls, in bug 0050's witness
`tests/fn-arg-type-mismatch-wired.test.ts`, in the `u13*` group
(`describe` at `:2479`) beside `u13mf` (`:2702`) and `u13mg` (`:2725`). That
file owns the gate's contract, already holds both sinks' emitting twins, and
carries the group narrative the new cells discharge. No `src/**` edit, no
`docs/spec_topics/**` edit, no registry row, no fixture re-point, no assertion
flip.

1. **Cell — the `array.join` element sink.** Fixture
   `FM + 'fn h(x) { let s = [x].join(",") }\n1\n'` (`FM` at `:369`); expected
   `[]` as an ordered whole-list `toEqual`, in the file's existing shape with
   the diagnostics rendered into the failure message. The binder is an
   unannotated `fn` parameter, the class `walkFn` (`:1244`) records withheld and
   0126 does not touch, so the cell is stable against a future change to `for`
   binding. Precondition: a loud `letRange(doc, "s")` assertion, so a layout
   drift fails there instead of letting the `[]` measure nothing. Comment states
   the mechanism: the receiver is an array BUILT from a withheld read, so
   `unfoldedTarget.kind === "array"` (`:2318`) is satisfied, the element carries
   the sentinel, and `checkArrayJoin` (`src/runtime/stdlib-array.ts:100`)
   refuses every non-`string` element including an unresolvable one — which is
   why the gate at `:2335`, not the predicate, is what keeps the cell green.
2. **Cell — the typed-`let` RHS sink.** Fixture
   `FM + 'fn h(x) { let s: integer = [x] }\n1\n'`; expected `[]`, same shape,
   same loud precondition. Comment states that a primitive annotation against an
   `array` RHS is decided structurally by `decide` before any `resolveNamed`
   arm, so the sentinel's unresolvability does not defer this row on its own
   (`:957–965`), and that the declared type is still recorded below the gate
   (`:988` onward), so nothing downstream loses the author's claim.
3. **Controls, so neither cell can pass while measuring nothing.** The
   emitting-direction twin for each sink, identical to its subject but for the
   parameter list and the array element:
   `fn h() { let s = [1].join(",") }` reports
   `theta/parse/non-string-array-join` (`array.join requires a string element
   type; got array<integer>`) and `fn h() { let s: integer = [1] }` reports
   `theta/parse/let-rhs-type-mismatch` (`let binding 's' initialiser type
   mismatch: expected integer, got array<integer>`), both measured in
   §Reproduction. Either add them as sibling cells or cite the file's existing
   twins — `u13pg` (`:2841`) for the join sink and `u13p` (`:2745`) for the
   typed-`let` sink — in each new cell's comment, on the pattern `g6` uses with
   `u13ph`. Every expected message is read from the registry by CODE through the
   file's existing `registryMessage` oracle (DIAG-4), never as a literal.
4. **Both-directions proof, per gate, before the change is called done.**
   Temporarily delete the gate at `:2335` (leaving `checkArrayJoin`
   unconditional) and confirm
   exactly the new join cell reds with `… got array<<withheld>>`; restore,
   verify the restore by blob hash, and repeat for `:966` and the typed-`let`
   cell. The two neuterings are independent and each must red its own cell and
   only its own cell — a red anywhere else means the fixture reaches a sink it
   was not written for. Record both red sets in the fix record; they are the
   evidence this report exists to create, and the expected messages are those
   0126's run measured (`docs/bugs/0126-…md:1328–1336`).
5. **Group narrative.** The u13 block's sink enumeration (`:2457–2465`) lists
   four sinks where "the group's own subject is measured"; the two new cells
   make it six. Update that sentence and the cell inventory at the head of the
   file to name them. Keep `:2447–2455` as is — it is true and it is the reason
   the new cells exist.
6. **Gates.** `npx vitest run tests/fn-arg-type-mismatch-wired.test.ts` → 86
   cells (84 at HEAD + 2; 88 if the twins are written as their own cells);
   full default suite green at 5208 + the delta (5208 at HEAD per
   `docs/bugs/0126-…md`, re-measured before and after); `npx tsc -p
   tsconfig.json --noEmit` clean; `npm run lint` clean. No live run is owed: the
   subject is a parse-time gate with no session surface, and the suite's live
   coverage of this file is unchanged.
7. **Optional, on the same evidence standard.** The `match`-binder join shape
   (P5) is a second withheld class at the join sink. Write it only with its own
   neutering measurement; without one it is another cell that cannot red.

## Provenance

- Filing origin: [0126](./0126-plain-for-binds-no-loop-variable.md)
  `## Fix (0.107.0)` §*Residuals* item 1 (`:1328–1336`), recorded as residual 1
  of that run's report (`.pi/tmp/fixes/0126-report.md:120`) and dispositioned
  "Filing candidate against bug 0050's witness". The loss was surfaced by the
  run's round-2 fixer, which "STOPped and reported that four withheld sinks had
  lost their last cell" (`:79`), and the two-sink measurement was independently
  confirmed in round 3 (`:80`).
- What this report adds beyond the residual: the HEAD re-measurement of both
  discriminating fixtures and of their emitting twins at the same positions
  (§Reproduction P1–P4), the corpus search establishing that neither shape
  exists in `tests/**`, in `src/**/*.test.ts` or in the committed `.theta`
  corpus (step 3), the eight-call-site inventory that fixes which two sinks are
  meant, the mechanism separating a discriminating fixture from `g2` / `g3` /
  `g4`'s non-discriminating ones, the `git show 3d05fd46^` evidence that the
  fixtures did not move and only the binding did (including the two identifier
  renames), and the settled cell design with its per-gate red-set obligation.
- Tree measured: HEAD `5c9104ab`, v0.107.0 (`package.json:3`); the last
  code-bearing commit is `3d05fd46`. `git status --short` reported no tracked
  modification while the measurements ran; a sibling session's uncommitted
  addition to `tests/interpolated-result-gate.test.ts` appeared afterwards and
  is not a file this report cites. Every cited file is byte-identical to HEAD.
- Implementation read: `src/parser/type-layer-checks.ts` (`:387`, `:390–408`,
  `:409–423`, `:943`, `:945–990`, `:957–965`, `:966`, `:1071–1122`, `:1078`,
  `:1110–1118`, `:1166–1203`, `:1229`, `:1244`, `:1298–1330`, `:1320`,
  `:1443–1465`, `:1454`, `:1552–1581`, `:1563`, `:2029`, `:2294`, `:2307–2359`,
  `:2318`, `:2328–2337`, `:2348`); `src/runtime/stdlib-array.ts:100`;
  `src/runtime/stdlib-object.ts:63`.
- Tests read (none modified): `tests/fn-arg-type-mismatch-wired.test.ts`
  (`:369`, `:877`, `:907–915`, `:921`, `:2380–2477`, `:2479`, `:2589`, `:2702`,
  `:2725`, `:2745`, `:2841`, `:2855`, `:2901`);
  `tests/plain-for-loop-variable-element-type.test.ts` (`:589–591`,
  `:1453–1485`, `:1487–1568`);
  `tests/member-access-declared-field-type.test.ts:365–384`;
  `tests/helpers/e2e-s1.ts:38–42`. Both witnesses re-run at HEAD:
  `npx vitest run tests/fn-arg-type-mismatch-wired.test.ts
  tests/plain-for-loop-variable-element-type.test.ts` → `Test Files 2 passed
  (2)` / `Tests 137 passed (137)`.
- History read: `git show --stat 5c9104ab` (docs-only);
  `git show 3d05fd46^:tests/fn-arg-type-mismatch-wired.test.ts` (`:858`,
  `:888–894`, `:2525–2545`, `:2620–2645`).
- Bug corpus read:
  `docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md`
  (`:592–597`, §Fix verification and residuals);
  `docs/bugs/0126-plain-for-binds-no-loop-variable.md` (`:1148`, `:1207–1219`,
  `:1328–1336`); `docs/bugs/0143-withheld-sentinel-author-twin-and-render-leakage.md`
  (`:6–7`, `:881–915`);
  `docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md` (§Related, for
  file coordination).
- Rule cited: `AGENTS.md:124` §*Verify both directions when adding or
  strengthening an assertion*.
- Method: one scratch vitest file over `parseDoc`, deleted after measurement;
  `rg` and file reads for everything else. No `src/**` byte was edited, so the
  neutered direction in this document is quoted from 0126's fix run and is
  marked as quoted at every use.

## Fix (0.124.0)

Tests only, as §Fix settles it: no `src/**` byte moved
(`git hash-object src/parser/type-layer-checks.ts` equals
`git rev-parse HEAD:src/parser/type-layer-checks.ts`,
`1fc5f76443e6ea7f0b20270eed648ca42f6b187c`, re-checked after both
neutralisations), no assertion flipped, no fixture re-pointed, no registry or
spec row engaged. §Fix item 7 — the optional `match`-binder join shape — was
NOT written: its neutered direction is unmeasured, so it would be another cell
that cannot red.

- **What shipped:** `tests/fn-arg-type-mismatch-wired.test.ts` — two additive
  absence cells in the `u13*` group beside `u13mg`, their two fixture constants
  under one doc-comment, and §Fix item 5's two prose updates.
  - `u13mh` (§Fix item 1) — the `array.join` element sink. Fixture
    `U13MH_JOIN_WITHHELD_ELEMENT` = `FM + 'fn h(x) { let s = [x].join(",") }\n1\n'`,
    expected `[]` as an ordered whole-list `toEqual` behind a loud
    `letRange(doc, "s")` precondition. The receiver is an array BUILT from the
    withheld read, so `checkMethodCall`'s `join` branch is entered and the
    element carries the sentinel; `checkArrayJoin`
    (`src/runtime/stdlib-array.ts:100`) refuses every non-`string` element
    including an unresolvable one, so the gate in front of it — not the
    predicate — is what keeps the cell green.
  - `u13mi` (§Fix item 2) — the typed-`let` RHS sink. Fixture
    `U13MI_LET_ANNOT_WITHHELD_ELEMENT` =
    `FM + 'fn h(x) { let s: integer = [x] }\n1\n'`, same shape, same loud
    precondition. `decide` answers a primitive annotation against an `array`
    RHS structurally under TYPE-7 / TYPE-8 before either `resolveNamed` arm, so
    the sentinel's unresolvability does not defer this row on its own; the
    declared type is still recorded below the gate.
  - Binder class per §Fix items 1–2: an unannotated `fn` parameter, the class
    `recordWithheldBinders` mints from `walkFn`, so both cells are stable
    against a future change to plain-`for` binding.
  - Controls per §Fix item 3, taken as the in-comment citation option on cell
    `g6`'s pattern: `u13pg` is the join sink's emitting twin and `u13p` the
    typed-`let` sink's, both read and verified to sit at the same positions
    over a non-withheld operand. No expected-message literal was added — both
    cells expect `[]` and DIAG-4's `registryMessage` oracle is untouched.
  - §Fix item 5 prose: the u13 narrative's "WHICH CELLS CARRY THE WITHHELD
    SUBJECT" sentence now names six sinks where the group's own subject is
    measured (was four), and the head-of-file cell inventory carries `u13mh`
    and `u13mi` with the mechanism sentence. The preceding paragraph — the one
    stating that `u13m`, `u13mf` and `u13mg` rest on a proven element — is
    unchanged: it is true and it is why the new cells exist.
- **Gates:**
  - Witness file: `npx vitest run tests/fn-arg-type-mismatch-wired.test.ts` →
    `Test Files 1 passed (1)` / `Tests 89 passed (89)`. The file held 87 cells
    at this HEAD, not the 84 §Fix item 6 measured at filing, so the arithmetic
    is 87 + 2 = 89 rather than 86.
  - Full default suite: `npm test` → `Test Files 325 passed (325)` /
    `Tests 5949 passed (5949)`. Baseline at the fork was 5947, so the delta is
    exactly the two new cells; nothing flipped anywhere else. §Fix item 6's
    5208 was the 0126-era total.
  - `npx tsc -p tsconfig.json --noEmit` → clean, no output.
  - `npm run lint` (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`) →
    clean, no output.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) returned one `house-rule`
  finding and no `correctness`, `fidelity` or `spec` finding: the item-5 prose
  rewrite left one narrative comment line at 146 columns against the file's
  99-column widest and the block's own ≤84. It verified independently that both
  fixtures place the withheld read inside a composite rather than as the whole
  operand, that the binder is `walkFn`'s withheld class, that `letRange` fails
  loudly and both asserted ranges are correct, that `u13pg` and `u13p` really
  are the emitting twins of these two positions, that every path:line the new
  comments cite lands on the symbol it names at this HEAD, and that no existing
  assertion moved. Fixed by one comment-only re-wrap round
  (`bug-fix-fixer-light`, longest resulting comment line 80 columns). That
  round's diff touches no executable line, and the gate re-run above is green,
  so the polish was verified by gate-diff and the confirmation review round was
  skipped.
- **Verification:** verified (`bug-fix-verifier`, 1 round, no findings).
  - §Fix item 4, both directions, per gate, reproduced independently rather
    than taken from the Phase-1 run. Neutering the `array.join` element gate
    (deleting the ternary so `checkArrayJoin` runs unconditionally) and running
    the full suite gives `Tests 1 failed | 5948 passed (5949)`, the single red
    being `u13mh` with
    `error theta/parse/non-string-array-join @4:19-4:32: array.join requires a string element type; got array<<withheld>>`.
    Neutering the typed-`let` gate (dropping
    `&& !containsWithheldBinderType(rhsType)`) gives the same shape, the single
    red being `u13mi` with
    `error theta/parse/let-rhs-type-mismatch @4:11-4:31: let binding 's' initialiser type mismatch: expected integer, got array<<withheld>>`.
    Both signatures are the ones 0126's run measured. Each neutralisation reds
    its own cell and only its own cell, so neither fixture reaches a sink it
    was not written for. Both restores were made by explicit inverse edit and
    proved by blob hash against `HEAD:src/parser/type-layer-checks.ts`.
  - Full default suite green in the delivered state; typecheck and lint clean.
  - Live obligation discharged without a live run: the subject is a parse-time
    gate with no session surface, no file under `tests/live/**` changed, and
    §Fix item 6 already settles that no live run is owed. The offline suite
    carries the whole subject.
  - Fidelity spot-check: no hunk falls inside any existing `it(` body. `u13e`
    — the emission cell restated under bug 0199's authority — is untouched, as
    are `u13m`, `u13mf`, `u13mg`, `u13p` and `u13pg`.
- **Residuals:**
  1. **The two new cells shift this witness's line citations.** The file grows
     from 3183 to 3248 lines over four hunks, so a citation into
     `tests/fn-arg-type-mismatch-wired.test.ts` shifts by `+4` from old `:113`,
     by `+17` from old `:944`, by `+18` from old `:2586` and by `+65` from old
     `:2865`. That is inherent to an additive-cell fix and is bug
     [0134](./0134-params-shift-induced-stale-citations.md)'s recorded class;
     the citations this document's own §Affected and §Provenance carry were
     measured at `5c9104ab` and were already stale at this HEAD before the
     change. No sweep is made here.
  2. **The `match`-binder class at the join sink is still unpinned.** §Fix item
     7's shape (`let m = match "hi" { x => [x].join(",") }`) re-measures `[]` at
     this HEAD, and its neutered direction remains unmeasured, so no cell was
     written for it. It stays what the document calls it: a candidate, not an
     obligation.

     **Discharged by bug
     [0205](./0205-withheld-binder-gates-three-sinks-cannot-red.md)
     `## Fix (X.Y.Z)`.** That fix measures the shape in both directions and
     ships it as cell `u13mm`: `[]` as shipped, and
     `theta/parse/non-string-array-join … got array<<withheld>>` with the
     `join` branch's gate neutered, beside `u13mh`'s expected red. The
     `match`-binder class at the join sink is pinned.
  3. **Six of the eight gate call sites are still unmeasured for pin status.**
     §Non-goals scopes this fix to two sinks; the object-field, `par for`
     iterand, subagent-return, array-common-type and plain-`for` iterand sinks
     were not measured, and the arithmetic between 0126's round-2 "four sinks"
     and its settled residual's two is not re-derived here either.

     **Discharged by bug
     [0205](./0205-withheld-binder-gates-three-sinks-cannot-red.md).** Its
     filing measures all six against the full suite: the plain-`for` iterand,
     the `par for` iterand and the object-index key are pinned; the
     `subagent fn` return annotation, the array-literal common type and the
     object-field value are not, and its `## Fix (X.Y.Z)` pins those three with
     cells `u13mj`, `u13mk` and `u13ml`. The arithmetic 0126 left open resolves
     to three unpinned sinks, the object-field value being the one neither of
     0126's counts named. Its residual 2 also records a ninth gate call site
     that post-dates this document's eight-site enumeration.
- **Discharge notes appended:** bug 0126's `## Fix (0.107.0)` §*Residuals*
  item 1 — the filing origin — now records this fix as its discharge, naming
  both cells and the per-gate neutralisation evidence.
- **Pinned dispositions / non-goals:** both gates stay byte-identical, so no
  defect is asserted against `src/**`. `u13m`, `u13mf` and `u13mg` keep their
  post-0126 subject and their byte-identical assertions — the new cells sit
  beside them, not over them. The optional item-7 cell and the citation sweep
  stay out, per §Non-goals.

