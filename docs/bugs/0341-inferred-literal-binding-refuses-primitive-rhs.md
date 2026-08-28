# Bug 0341 — An unannotated binding initialised from a literal records the LITERAL type, so every later write of a primitive-typed value into it is refused with a message that renders both sides identically: `let mut a = ""` / `a = s` (`s: string`) reports `theta/parse/reassign-rhs-type-mismatch: reassignment of 'a' type mismatch: expected string, got string`, the theta does not register, and the same asymmetry swallows TYPE-2's narrowing route

- **Status:** fixed (0.309.0).
- **Sev/Diff estimate:** S1/D1 — S1 because a legal, idiomatic program is
  REFUSED at load (an error-severity `theta/parse/*` denies registration, so
  the slash command does not exist) and the message names one type twice, which
  leaves the author no next step but to guess; the input class is the ordinary
  accumulator idiom the spec's own `let mut count = 0` example heads. D1
  because the fix is one widening applied at one recording site, with no
  registry, message, or `⊑` change and no cell in the tree flipping.
- **Kind:** defect against the inferred-binding-type rule.
  `docs/spec_topics/bindings.md:12` requires a reassignment's RHS to be
  compatible with "the binding's declared or **inferred** type", and
  `docs/spec_topics/type-system.md:37` ([TYPE-3](../spec_topics/type-system.md#type-3))
  fixes what a literal is worth as an expression: "`L ⊑ T` when `L` is a
  literal type and the value `L` would be statically typed `T` **in expression
  position**". An initialiser is an expression position, so `let mut a = ""`
  infers `string`; the implementation instead records the literal type and then
  treats it as a target strictly narrower than `string`.
- **Related:**
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md)
    (fixed 0.138.0) — minted `theta/parse/reassign-rhs-type-mismatch` and wired
    the reassignment-RHS check. It is the check that made this recording defect
    observable; before it, the wrong recorded type reached no judgement sink.
  - [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md)
    (fixed 0.133.0) — adjudicated that the declared-or-inferred type governs
    the binding's whole scope and is never re-derived from a write. This report
    does not disturb that rule; it corrects what is inferred in the first place.
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md)
    (fixed 0.55.0) — the ANNOTATED half of the same recording arm. An
    annotation is recorded as declared; this report is the unannotated half.
  - [0142](./0142-division-result-type-not-number.md) (fixed 0.80.0) — moved
    `3 / 2` from `{kind:"literal",typesAs:"integer"}` to
    `{kind:"prim",name:"number"}` and recorded that "the `literal` kind is not
    weaker than `prim` for any consumer measured here". That measurement is
    true of every consumer except the one this report names.
  - [0163](./0163-params-default-type-compat-unchecked-at-load.md)
    (fixed 0.88.0) — records that `CompatType`'s `literal` arm "carries only
    `typesAs` … and not the value", the fact that makes the widening
    information-lossless.
- **Affected** (verified at `089b27df`, v0.304.0):
  - `src/parser/type-layer-checks.ts:1641-1647` — `walkStmt`'s `case "let"`
    records `rhsType` verbatim for an unannotated binding.
  - `src/parser/static-type-inference.ts:258-265` — `#typeExpr`'s literal arms,
    the producer of `{kind:"literal",typesAs:…}`.
  - `src/parser/type-compat.ts:381-387` — `decide`'s literal-TARGET arm, which
    relates a literal target to a literal source alone.
  - `src/parser/type-compat.ts:419-420` — `displayType`, which renders a
    literal as its `typesAs`, so both sides of the refusal print the same word.
  - `src/parser/type-compat.ts:932-968` — `checkReassignRhsCompat`, the
    emitter; its `integer-narrowing` pre-arm at `:944-954` is unreachable for
    an inferred target for the same reason.
  - `src/parser/type-layer-checks.ts:1724` — `case "reassign"` reading
    `bindings.get(stmt.target)`: the one production path that puts an inferred
    type in a TARGET position.
- **Observed at:** 0.304.0 (`089b27df`), offline, through
  `tests/helpers/e2e-s1.ts`'s `parseDoc` (the real `lexTheta` +
  `parseThetaDocument`). Also observed in the field at 0.150.0 by an agent
  authoring a five-theta CI-loop suite — see §Provenance.

## Summary

An unannotated `let` / `let mut` binding records the initialiser's inferred
type exactly as `#typeExpr` returned it. For a literal initialiser that type is
`{kind:"literal", typesAs:"string"}`, not `{kind:"prim", name:"string"}`.

Every consumer in the tree treats a `literal` as the primitive it types as —
`decide`'s primitive-target arm (`type-compat.ts:374-375`), `displayType`,
`classifyIndexReceiver`, `classifyOperand`, `array.join`'s element
precondition — with exactly one exception: `decide`'s literal-TARGET arm
(`type-compat.ts:381-387`) returns `"incompatible"` for a `prim` source. A
literal only ever reaches a target position through an inferred binding
(annotations never lower to a literal type — `convertAnnotation` has no literal
arm), so that arm's whole reachable input class is this defect.

Three consequences, all measured:

1. Legal writes are refused. `let mut a = ""` accepts no `string`-typed value.
2. The refusal cannot be acted on: `expected string, got string`.
3. TYPE-2's one-way narrowing route is swallowed. A `number` RHS under an
   inferred `integer` target should report `theta/parse/integer-narrowing`;
   `decidePrimitive` is never reached, so it reports the mismatch row instead.

Because the row is `E`-severity, `hasLoadParseError`
(`src/extension/production-composition.ts`) denies registration: the theta does
not exist as a slash command.

## Reproduction

Bodies under `---\ndescription: b0341\nmode: prompt\n---\n`, measured at
`089b27df` through `parseDoc`.

| # | Source (body) | Observed | Expected |
|---|---|---|---|
| P1 | `let s: string = "q"` / `let mut a = ""` / `a = s` / `a` | `reassign-rhs-type-mismatch: reassignment of 'a' type mismatch: expected string, got string` | `[]` |
| P2 | same, `a = a + s` | same row | `[]` |
| P3 | same, `a += s` | same row | `[]` |
| P4 | `let n: integer = 2` / `let mut c = 0` / `c = c + n` / `c` | `… expected integer, got integer` | `[]` |
| P5 | `schema Item { id: string }` / `let items: array<Item> = []` / `let mut c = ""` / `for it in items { c = c + it.id }` / `c` | `… expected string, got string` | `[]` |
| P6 | `let s: string = "q"` / `let mut xs = ["a"]` / `xs = [s]` / `xs` | `… expected array<string>, got array<string>` | `[]` |
| P7 | `let b: boolean = true` / `let mut f = false` / `f = b` / `f` | `… expected boolean, got boolean` | `[]` |
| N1 | `let n: number = 1.5` / `let mut c = 0` / `c = n` / `c` | `reassign-rhs-type-mismatch … expected integer, got number` | `integer-narrowing: cannot narrow number to integer` |
| N2 | `let n: integer = 1` / `let mut c = 0.5` / `c = n` / `c` | `… expected number, got integer` | `[]` (TYPE-2) |
| R1 | P2's body, through the mirrored `hasLoadParseError` gate | not registered | registered |
| C1 | `let mut a = ""` / `a = 1` / `a` | `… expected string, got integer` | unchanged — a real mismatch |
| C2 | `let mut n = 1` / `n = 1.5` / `n` | `integer-narrowing` | unchanged |
| C3 | `let mut a: string = ""` / `a = 1` / `a` | `… expected string, got integer` | unchanged — annotated |
| C4 | `let mut a = ""` / `a = "z"` / `a` | `[]` | unchanged — literal RHS under a literal target |
| G1 | `let n = 1` / `let xs = [n, 1.5]` / `let ys: array<string> = xs` / `ys` | `got array<number>` | `got array<integer \| number>` — what the annotated twin (`let n: integer = 1`) already reports at HEAD |

C4 is why the defect survived: the accumulator idiom stays silent as long as
every write is itself a literal, so the refusal appears only once a value
crosses in from a parameter, a schema field, a loop variable, or a callee.

## Expected behaviour

`docs/spec_topics/bindings.md:12` — the RHS "must be compatible with the
binding's declared or inferred type". `docs/spec_topics/type-system.md:37`
(TYPE-3) — a literal is worth the primitive it "would be statically typed … in
expression position". An initialiser is an expression, so the inferred type of
`let mut a = ""` is `string`, and every `string`-typed RHS is compatible with
it (TYPE-1). N1 is `integer-narrowing` by TYPE-2, and N2 is compatible by the
same rule's admitted direction.

Independently, `docs/spec_topics/diagnostics/diagnostic-shape.md` DIAG-4 makes
the *Message* column normative: `expected <expected>, got <actual>` is a
two-type template, and a rendering in which the two are the same string states
no fact about the program.

## Actual behaviour / root cause

One recording decision, one relation arm.

**The recording.** `type-layer-checks.ts:1641-1647`:

```ts
const recorded: CompatType =
  annotation === undefined
    ? initUnprovable
      ? { ...rhsType }
      : rhsType
    : unfoldAlias(annotation, this.env);
bindings.set(stmt.name, recorded);
```

`rhsType` is `this.typeOf(stmt.init, bindings)` (`:1528`), and `#typeExpr`'s
literal arms (`static-type-inference.ts:258-265`) return
`{kind:"literal",typesAs:…}`. The annotated branch was corrected by bug 0083 to
record the DECLARED type; the unannotated branch adopts the expression's
internal type unchanged, literal kind and all.

**The relation.** `type-compat.ts:381-387`:

```ts
if (sup.kind === "literal") {
  if (sub.kind === "literal") {
    return decidePrimitive(sub.typesAs, sup.typesAs);
  }
  return "incompatible";
}
```

The mirror-image arm eight lines above (`:368-378`) decides a literal SOURCE
against a primitive target through `decidePrimitive`. Only the target direction
refuses, and `decidePrimitive` — the sole route to `"integer-narrowing"` — is
skipped with it, which is N1.

**The message.** `displayType` (`:419-420`) returns `type.typesAs` for a
literal, so `checkReassignRhsCompat`'s template (`:961-965`) interpolates the
same word into both placeholders.

The three compose: a wrong recorded type reaches the only arm in the engine
that can tell a literal from its primitive, and the renderer that cannot.

## Why it matters

The refused program is the accumulator loop — build a string or a counter
across iterations of a `for` over a schema-typed array. The spec's own
`bindings.md:15-17` example (`let mut count = 0` / `count = count + 1`) is
silent only because its RHS is a literal too; adding one typed operand refuses
the theta. The theta does not register, so the failure is not a warning at a
line, it is a slash command that does not exist, and the diagnostic that
explains it names one type twice. The author's available inferences from
`expected string, got string` are all wrong.

## Non-goals

- **Value-level literal-type checking.** `CompatType`'s `literal` arm carries
  only `typesAs` (bug 0163), so `let s: "low" = "high"` is not decidable in
  this model and no annotation lowers to a literal type at all (measured:
  `schema Sev = "low" | "high"` / `let s: Sev = 1` reports `[]` at HEAD). This
  report does not add value carriage, and the widening cannot lose information
  that the model does not hold. Should a future change make literal-union
  annotations enforceable, the literal-target arm of `decide` becomes reachable
  from annotations for the first time and must be re-read then — it is left
  exactly as it is here for that reason.
- **The `integer | number` array LUB (G1).** `commonType`'s dominating-candidate
  search relates each branch against a candidate, so a `prim integer` branch
  under a `literal number` candidate finds no dominator and the LUB widens to a
  union. That is pre-existing and independent of this fix: at HEAD the
  ANNOTATED twin (`let n: integer = 1` / `[n, 1.5]`) already reports
  `array<integer | number>`. The fix makes the inferred twin agree with the
  annotated one; making both read `array<number>` is a separate defect in
  `commonType`, filed as residual 1 below.
- **`params:` default literal types.** `primitiveLiteralType`
  (`literal-sublanguage.ts:738-749`) mints literals for default values, judged
  as SOURCES against a declared type. Untouched.

## Fix

Two routes were considered.

1. **Widen at the recording site.** Record, for an unannotated binding, the
   initialiser's type with every literal replaced by its `typesAs` primitive.
   Fixes what the binding IS; leaves `⊑` alone; is exactly the sentence TYPE-3
   already states for expression position.
2. **Relax `decide`'s literal-target arm** to admit a `prim` source through
   `decidePrimitive`. Fixes the same symptoms with one line and also covers
   `commonType`'s literal candidates.

**Route 1 is taken.** Route 2 makes `string ⊑ "low"` a rule of the relation.
That is wrong at the language level — TYPE-3 is deliberately one-way — and it
is invisible today only because no annotation currently lowers to a literal
type. Encoding a spec-false rule to compensate for a spec-false inference is
the wrong direction: the inference is what is wrong, and the model's
value-blindness (§Non-goals) is why the arm must stay strict for the day
annotations do reach it.

Route 1's mechanism: `widenLiteralTypes(type)` in `type-compat.ts`, recursing
through `array` / `union` / inline-`object` structure, leaving `named`
untouched (an alias's right-hand side belongs to the declaration, not to this
value, and TYPE-10 nominality must not be disturbed), and returning `type` BY
REFERENCE when it holds no literal — so the identity-keyed side channels
around the recording site (`resultBindings`, `unprovableBindings`) see the
objects they saw before.

**Collateral, pre-authorised by enumeration:** none. The six files that pin
`theta/parse/reassign-rhs-type-mismatch` (`tests/reassign-rhs-type-compat.test.ts`,
`tests/reassignment-binding-type-governs.test.ts`,
`tests/let-annotation-inline-object-compat.test.ts`,
`tests/brace-and-angle-annotation-junk-refusal.test.ts`,
`tests/inline-object-empty-entry-slot-refusal.test.ts`,
`tests/type-name-as-value-refusal.test.ts`) were re-read before the change: each
inferred-binding cell writes a source of a DIFFERENT primitive (or a `named`
source, which `decide`'s named escape at `:365-367` settles first), so the
widening relaxes the target without changing any verdict. The full offline
suite confirms it — see the fix record's *Gates*.

**Spec:** no registry edit is owed (no code is minted, and the row's *Trigger*
already scopes itself to a RHS "not compatible with the target binding's
declared or inferred type"). One same-commit sentence closes the silence the
defect exploited: `bindings.md` said what a reassignment is checked against but
never what an unannotated binding is inferred WITH.

## Provenance

Found in the field on 2026-08-28 against the installed 0.150.0, by an agent
authoring a five-theta CI-driver suite (`cq-loop` / `cq-investigate` /
`cq-fix` / `cq-review` / `cq-wait`) for a Unity CoreCLR test-triage loop: the
orchestrator accumulated a fix log across a `for` over a schema-typed array
(P5's shape) and the suite would not register, reporting `reassignment of 'acc'
type mismatch: expected string, got string`. The author's workaround was to
annotate every `let mut` — correct, and the reason the defect is routed around
once seen and impossible to diagnose before.

Re-measured at `089b27df` (0.304.0) offline against the shipped front end; every
row of §Reproduction is from that measurement, not from the field report.
Scratch probes deleted.

## Fix (0.309.0)

- **What shipped:**
  - `src/parser/type-compat.ts` — new exported `widenLiteralTypes`, recursive
    over `array` / `union` / `object`, structurally sharing when nothing moves.
    `decide`, `displayType`, and every emitter are unchanged.
  - `src/parser/type-layer-checks.ts` — the unannotated branch of `case "let"`
    records `widenLiteralTypes(rhsType)`. The annotated branch, the
    `initUnprovable` private-twin copy, and the `resultBindings` /
    `unprovableBindings` identity discipline are unchanged; the carry arm still
    tests `rhsType` (the object `typeOf` returned) and still adds `recorded`.
  - `docs/spec_topics/bindings.md` — one sentence at the new
    `#inferred-binding-type` anchor: an unannotated binding is inferred with
    the type its initialiser has in expression position, so a literal
    initialiser infers the primitive under TYPE-3.
  - `tests/b0341-inferred-literal-binding-refuses-primitive-rhs.test.ts` — the
    witness, 20 cells in seven groups (A legal writes, B refusals that must
    survive, C the narrowing route, D the message-tautology sweep, E the
    registration consequence through the mirrored `hasLoadParseError` gate,
    F neighbouring sinks, G inferred/annotated agreement).
  - `CHANGELOG.md`, `docs/bugs/README.md`, `package.json` — release surface.
- **Gates:**
  - Witness: `npx vitest run tests/b0341-…test.ts` → 20/20 pass. Red direction
    proved by running the same file, byte-identical, in a second worktree at
    `089b27df` without the fix: 12 failed / 8 passed — the 12 are A1-A7, C1,
    C2, D1, E1, G1, and the 8 green-in-both are the B and F controls plus E2.
  - `npm test` → 474 passed / 9 failed files (9587 passed / 10 failed tests;
    9577 of those passes are the pre-fix baseline, +20 are this witness).
    The 9 failing files are IDENTICAL, file for file, to the same run at
    `089b27df` in a clean worktree (`tests/subagent-*`,
    `tests/inbound-*`, `tests/invoke-prompt-cell-enum-return.test.ts`): they are
    subagent child-spawn cells that need a configured provider, and this
    environment has none (`ModelRegistry.getAvailable()` is empty). No cell in
    the tree changed verdict under the fix.
  - `npm run typecheck` → exit 0. `npm run lint` → exit 0.
  - `tests/fixtures/h7a/permitted-codes.json` — byte-unchanged; no code minted.
  - Landing gates (maintainer environment, provider configured, rebased onto
    v0.308.0 `cf775800`): witness 20/20; red direction re-proven in place —
    both src files reverted to main's bytes → 12 failed / 8 controls green,
    matching the row above exactly, restored byte-exact; full suite
    485 files / 9612 tests ALL green (the 9 provider-needing files pass here);
    typecheck + lint exit 0; live cell 1/1 green under the campaign live lock
    with its red direction proven first (see Live cell below); live-config
    premeasure: no existing live cell flips (the 0115 reassign cell and both
    annotation cells are annotated-target shapes this fix does not touch).
- **Live cell:** `tests/live/acceptance/b0341live-inferred-binding-accumulator-registers.test.ts`,
  added at landing (the PR's own environment had no configured provider —
  `requireLiveHost()` failed loudly — so its author recorded the gap and asked
  the maintainer to close it; closed at merge). Cell 1: the previously-refused
  accumulator (`let s: string = "x7"` / `let mut a = ""` / `a = a + s`)
  REGISTERS at live production load — offline attribution guard asserts it
  parses clean — and drives a real turn through the spawned `pi` binary to the
  task-framed arithmetic observable (`263 plus 514` → `777`). Cell 2: the B1
  byte-neighbour (`let mut a = ""` / `a = 5`) still refuses, guarded offline
  as exactly `[theta/parse/reassign-rhs-type-mismatch]` and probed live via the
  `invoke`+`match` REFUSED/LOADED sentinel. Both directions proven at landing:
  with the two src files reverted to their pre-fix state the offline guard red
  with the expected signature; restored, 1/1 green under the campaign live
  lock. The registration delta is additionally witnessed offline in group E
  through the clause-for-clause mirror of `hasLoadParseError`.
- **Residuals:**
  1. `commonType`'s dominating-candidate search inherits the same
     literal-vs-primitive asymmetry from the other side: `[n, 1.5]` over an
     `integer`-typed `n` yields `integer | number` rather than `number`
     (§Non-goals, cell G1). Pre-existing for annotated bindings at
     `089b27df`; this fix makes the inferred spelling agree with the annotated
     one rather than diverge from it. Worth its own filing.
  2. `decide`'s literal-target arm is now provably unreachable from any
     production path (no annotation lowers to a literal type; the one inferred
     route is closed here). An unreachable arm in the `⊑` engine is a
     registry-adjacent closure question, not a defect — recorded so a future
     literal-value-carrying model re-reads it deliberately.
- **Pinned dispositions / non-goals:** value-level literal checking stays out
  of the model (bug 0163's finding); `⊑` is unchanged; annotated bindings are
  unchanged; the `params:` default literal producer is unchanged.
