# Bug 0179 — `decide`'s TYPE-7 arm answers `incompatible` for every non-`array` sub-type, including a `named` the type env cannot resolve, so an `array<T>`-declared sink refuses at load any expression the inference pass leaves nominal — `p.keys()`, a read of an `array<string>`-declared field, a call of an `array`-returning `fn`, an index into a nested array — with `theta/parse/object-field-type-mismatch: … expected array<string>, got keys`, whose `<actual>` slot names a method rather than a type; the same expression at a `string`, `boolean` or `fn`-parameter sink is admitted, and when the refused theta is a spawned subagent child's root the refusal is unreportable: the child exits 0 with no `theta_result` envelope and the driver discards its captured stderr on a zero exit

- **Status:** fixed (0.104.0).
- **Sev/Diff estimate:** S2/D2 — S2 because conformant input is noisily refused
  at load and the refusal's text names a type that does not exist: twelve
  measured spellings (§Reproduction (a)) are rejected, including
  `R { ks: q.xs }` where `q.xs` is a field the schema declares `array<string>`
  and the sink declares `array<string>`. No value is corrupted and the ordinary
  in-process path emits a diagnostic, so the S1 band ("silent wrong behaviour")
  does not apply; the one silent surface is the spawned-child root
  (§Reproduction (b)), where the parent's fail-closed mapping is itself PIC-59
  conformant and what is lost is the refusal's reason, not the value. D2 because
  the correction §Fix pins is one arm of one function
  (`src/parser/type-compat.ts:213–215`, three lines) with no new registry row and
  an offline parse-diagnostic witness — but that arm is on the single shared
  compatibility relation 30 test files reach, so the fix owes a full-suite
  re-measure, and it owes a scope statement against the second locus the
  measurements expose (the ctor-field and typed-`let` sinks pass `typeOf`
  straight through where the `fn`-argument sink consults `provableArgType`,
  `src/parser/type-layer-checks.ts:1654`). Not D1 for those two items.
- **Kind:** defect — the implementation departs from
  `docs/spec_topics/type-system.md:48` and from the posture the module's own
  design note states. Three elements, each measured at HEAD `0d0f8a6d`, v0.97.0.
  1. *The array arm short-circuits before the unresolvable-operand escape.*
     `decide` (`src/parser/type-compat.ts:180`) tests `sup.kind === "array"` at
     `:212` and returns `"incompatible"` for any sub whose kind is not `array`
     (`:213–215`). The arm that answers `"unknown"` for a `named` sub the env
     cannot resolve is 53 lines later (`:266–269`), so it is unreachable
     whenever the sink is `array<T>`. At a `prim` sink (`:273`) the same sub
     reaches that escape and the check is skipped.
  2. *The inference pass leaves a large expression class nominal by design.*
     `StaticTypeInferencePass.#typeExpr` (`src/parser/static-type-inference.ts:197`)
     types a member access as `{ kind: "named", name: node.field }` (`:242–244`),
     an index whose target is not statically an array as `named "index"`
     (`:245–250`), a `fn` call as `named <callee>` (`:251–252`), an `invoke` as
     `named <path>` (`:253–254`) and a method call as `named <method>`
     (`:261–262`). None of those names resolves in the `TypeEnv`, which is what
     the escape at `:266–269` exists for. `unfoldAlias`'s own design note states
     the intent: "an unresolvable `named` (past the parser's static view) stays
     `named` so the relation reports `\"unknown\"` and the runtime AJV safety net
     applies" (`src/parser/type-compat.ts:150–153`).
  3. *The refusal's rendered `<actual>` is a method name, not a type.*
     `checkObjectFieldCompat` (`:500`) fills the registered template's
     `<actual>` slot with `displayType(value)` (`:534–536`, `displayType` at
     `:318`), which for these operands prints the nominal placeholder: `keys`,
     `values`, `split`, `xs`, `f`, `index`. `docs/spec_topics/diagnostics/code-registry-parse.md:46`
     defines the slot as the field value's static type. No theta type is spelled
     `keys`.
- **Related:**
  - **0178** — filed concurrently by a sibling session; its file is not in the
    tree at this HEAD, so it is named by number here. Its subject is a
    named-type `params:` field on a `mode: subagent` callee producing the same
    child-side signature (exit 0, no envelope,
    `theta/runtime/subagent-exit-without-envelope`), from the same 0172 residual
    list (item 1). The two reports share the child-side half measured in
    §Reproduction (b) — a theta that does not register cannot emit an envelope,
    and the driver drops the stderr line that would have said why — and differ
    in the load-time cause: this report's cause is a spurious type refusal on
    the body, that report's is in the `params:` surface. Whichever report's fix
    addresses the child-side reporting gap owns it; this report does not decide
    it (§Non-goals).
  - **0172** —
    [`0172-inbound-translation-pass-unperformed-at-three-boundaries.md`](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md),
    **open (fix landed 0.97.0)**. Its run observed this defect while building the
    boundary-2 witness (`tests/inbound-boundary-theta-callable.test.ts`), worked
    around it by removing the field, and handed it over as residual 2 (§Provenance).
    That witness's header carries `expressions.md:118` — the `keys()` row — in
    its spec list and contains no cell that reads `keys()`; the removed field is
    the missing one. No file of that fix is changed by this report.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift. Every
    position below is named by symbol beside its line;
    `src/parser/type-layer-checks.ts` is 2531 lines and
    `src/parser/type-compat.ts` 816 lines at this HEAD.
- **Affected** (every citation re-verified against the tree at HEAD `0d0f8a6d`,
  v0.97.0; symbols named beside lines):
  - **The decision procedure.** `decide` (`src/parser/type-compat.ts:180`): the
    TYPE-7 array arm (`:210–217`), whose non-`array` short-circuit is `:213–215`;
    the TYPE-8 inline-object arm (`:222–246`), same shape, not witnessed here
    (§Reproduction (a) row 19); the TYPE-10 named-sup arm (`:253–264`); the
    unresolvable-`named`-sub escape (`:266–269`); the `prim` arm (`:273–281`) and
    the `literal` arm (`:285–290`). Its entry `checkCompatible` (`:139`),
    `unfoldAlias` (`:155`, design note `:147–154`) and `resolveNamed` (`:104`).
  - **The three sinks and their callers.** `checkObjectFieldCompat` (`:500`,
    early return on `"compatible"` / `"unknown"` `:511–513`, code `:531`, message
    `:534–536`) called from `checkObjectField`
    (`src/parser/type-layer-checks.ts:1535`, the `typeOf` read `:1542`, call
    `:1548`);
    `checkLetRhsCompat` (`type-compat.ts:403`, code `:434`) called at
    `type-layer-checks.ts:970`; `checkFnArgCompat` (`type-compat.ts:452`) called
    at `type-layer-checks.ts:1616` — and only for an argument
    `provableArgType` (`:1654`) certifies, which is why the `fn`-argument sink
    admits the same expression the other two refuse (§Reproduction (a) row 17).
  - **The inference pass.** `StaticTypeInferencePass.#typeExpr`
    (`src/parser/static-type-inference.ts:197`): `member` (`:242–244`), `index`
    (`:245–250`), `call` (`:251–252`), `invoke` (`:253–254`), `query`
    (`:255–256`), `object` (`:257–258`), `result-ctor` (`:259–260`),
    `method-call` (`:261–262`), `array` (`:217–222`), `ternary` (`:226–233`),
    `match` (`:237–241`), `#commonType` (`:353`). Its public entry `typeOf`
    (`:182`).
  - **The member surface the trigger comes from.** `OBJECT_MEMBERS`
    (`src/runtime/stdlib-object.ts:104`) and `evaluateObjectMember` (`:106`),
    whose `keys` arm is `:113–114` and `values` arm `:116–117`. Both members are
    reachable and correct at runtime (§Reproduction (a) row 3 — `p.keys()` as a
    tail answers `["a","b"]`); only their placement at an `array<T>` sink is
    refused.
  - **The child-side reporting path.** `driveSubagentChild`
    (`src/runtime/subagent-json-driver.ts:87`): the stderr capture that keeps
    only the last line (`:104–106`), the stray-line tolerance that drops every
    non-`theta_result` stdout line (`:112–118`), the crash-detail emission gated
    on `info.code !== 0 || info.signal !== null` (`:155–161`, the `hint`
    carrying `lastStderr` at `:160`), and the unconditional
    `mapExitWithoutEnvelope` call (`:164`, the mapper at
    `src/runtime/subagent-envelope.ts:279`). On a zero exit the captured stderr
    line is discarded.
  - **The load-refusal path inside the child.** The parse pass that drops a
    theta carrying an error-severity diagnostic and does not register it
    (`src/extension/production-composition.ts:641–654`, the drop at `:648–653`),
    and `makeLoadEmit` (`:199`), whose no-UI branch mirrors the diagnostic to
    stderr (`:216–217`) under a comment that states the consequence of a dropped
    theta in headless mode: the slash command "silently fails to register (the
    raw `/stem …` text is forwarded to the model as chat, and the run still
    exits 0)" (`:208–215`).
  - **Spec.** `docs/spec_topics/type-system.md:25` (§Type compatibility, the
    sink list that names both the schema-constructor field value and the typed
    `let` RHS), `:29` (Operational definition — AJV "is the safety net at
    runtime"), `:31` (Structural cases; the closed-list sentence and its
    "unless the position is one where a runtime AJV check is documented as the
    safety net" clause), `:48` (**Unresolvable operands** — the governing
    paragraph), `:50` (TYPE-9, the three sink diagnostics);
    `docs/spec_topics/expressions.md:114` (the `object` member table's heading
    row) and `:118` (`keys()` — `(): array<string>`), `:119` (`values()`);
    `docs/spec_topics/diagnostics/code-registry-parse.md:40`
    (`array-element-type-mismatch`), `:46` (`object-field-type-mismatch`, whose
    Trigger requires the field value's type to be "statically resolvable"),
    `:56` (`let-rhs-type-mismatch`);
    `docs/spec_topics/diagnostics/code-registry-runtime.md:30`
    (`subagent-exit-without-envelope`, whose Trigger enumerates "crash, kill, or
    teardown timeout");
    `docs/spec_topics/pi-integration-contract/subagent.md:101` (PIC-59,
    including the fail-closed child-exit-without-envelope requirement).
  - **Committed coverage, counted at HEAD.** 30 test files reach `type-compat` /
    `checkCompatible`. Of the cells that pin an `array<T>` sink refusing a
    value, every one uses a sub the inference resolves: `array<number>` against
    `array<string>` (`tests/ctor-field-type-check.test.ts:441`, `:633`,
    `:964–965`; `tests/division-result-type-number.test.ts:1454`) and a literal
    against an array (`expected array<B72Arr>, got integer`). No committed cell
    pins a `named` sub at an array sink in either direction, so the arm this
    report names is unwitnessed.
- **Observed at:** v0.97.0 (`0d0f8a6d`). Offline and deterministic for the
  in-process half; the child half spawns real `pi` processes with all three
  `AGENTS.md` `#subagent-child-pins` set. One scratch vitest probe, written, run
  and deleted; the tree was otherwise clean, `git status --short` listing only
  this probe and one concurrent sibling session's own untracked probe.

## Summary

`docs/spec_topics/type-system.md:48` states that when either side of a
compatibility check is past the parser's static view, "the parse-time check is
skipped and the runtime AJV check is the safety net". `decide` implements that
skip in one place — `:266–269`, for a `named` sub `resolveNamed` cannot resolve —
and the array arm at `:212` returns before control ever reaches it. Any sink
declared `array<T>` therefore refuses every value whose static type the
inference pass leaves nominal, which is every method call, every member access,
every `fn` call, every `invoke` and every index into a non-array-typed target.

Measured, the refused set includes ordinary spellings:
`R { ks: p.keys() }`, `let ks: array<string> = p.keys()`,
`R { ks: q.xs }` where `q.xs` is declared `array<string>`,
`R { ks: f() }` where `fn f(): array<string>`, `R9 { ks: w.rows[0] }`,
and the same expression behind a `match` or ternary. Hoisting into an untyped
`let` does not help: the binding records the same nominal type. The message
names the placeholder as if it were a type — `expected array<string>, got keys`.
The identical expression at a `string`, `boolean` or `fn`-parameter sink is
admitted, because those routes reach the escape (or, for `fn` arguments, a
separate proof gate the other sinks do not consult).

The refusal is an error-severity parse diagnostic, so the theta does not
register. When the refused theta is the root theta of a spawned subagent child,
that is unobservable to the parent: the child never reaches the envelope writer,
exits 0, and `driveSubagentChild` maps the missing envelope to
`Err(invoke_infra, internal_error)` with `theta/runtime/subagent-exit-without-envelope`
and nothing else — the stderr line carrying the actual diagnostic is captured
but discarded, because the crash-detail arm that would attach it is gated on a
nonzero or signalled exit. That is the "loud but empty" signature the bug-0172
run hit and worked around.

## Reproduction

At HEAD `0d0f8a6d`, v0.97.0. One scratch vitest probe with two halves:

- **In-process** — `parseThetaDocument` (real deps: a no-op
  `SystemNoteChannelDeps`, a `ModelReferenceMatcher` resolving every reference)
  then `createProductionProducerDeps(...).bindPromptConversation(...)` and
  `executeBody`; the harness shape of
  `tests/absent-member-presence-gate.test.ts:219–325`. Offline, provider-free,
  no child process.
- **Child** — `launchSubagentChild` + `createProductionSpawnFn` +
  `driveSubagentChild`, the harness shape of
  `tests/inbound-boundary-theta-callable.test.ts`, with all three child pins:
  `ExecutableHost.argv1` set to
  `node_modules/@earendil-works/pi-coding-agent/dist/cli.js`,
  `PI_THETA_SUBAGENT_EXTENSION_PIN` set to this tree's `extensions/`, and
  `parentPid: process.pid` beside it so the authenticated control plane keeps
  the pin. Every fixture body is a pure tail expression and issues no query.

Every fixture below is a whole theta: the frontmatter shown, then the body. The
in-process half uses `mode: prompt`, the child half `mode: subagent`; the body
bytes are identical across the two halves.

Shared prologue, prepended to every row whose body reads `p`:

```
schema P { a: string, b: string }
let p = P { a: "x", b: "y" }
```

### (a) The refusal, in-process

Verbatim diagnostics. `R` abbreviates `schema R { ks: array<string> }`; `+`
joins consecutive body lines.

| # | body | parse diagnostics / value |
| --- | --- | --- |
| 1 | `R` + `R { ks: p.keys() }` | `error theta/parse/object-field-type-mismatch: field 'ks' on schema 'R' type mismatch: expected array<string>, got keys` |
| 2 | `R` + `let k = p.keys()` + `R { ks: k }` | same message |
| 3 | `p.keys()` | no diagnostics; value `["a","b"]` |
| 4 | `schema R2 { vs: array<string> }` + `R2 { vs: p.values() }` | `… expected array<string>, got values` |
| 5 | `schema R3 { h: boolean }` + `R3 { h: p.has("a") }` | no diagnostics; value `{"h":true}` |
| 6 | `schema R4 { n: integer }` + `R4 { n: p.keys().length }` | no diagnostics; value `{"n":2}` |
| 7 | `schema R5 { s: array<string> }` + `R5 { s: p.a.split("") }` | `… expected array<string>, got split` |
| 8 | `schema R6 { s: string }` + `R6 { s: p.a }` | no diagnostics; value `{"s":"x"}` |
| 9 | `let ks: array<string> = p.keys()` + `ks` | `error theta/parse/let-rhs-type-mismatch: let binding 'ks' initialiser type mismatch: expected array<string>, got keys` |
| 10 | `schema Q { xs: array<string> }` + `let q = Q { xs: ["a"] }` + `let ks: array<string> = q.xs` + `ks` | `… expected array<string>, got xs` |
| 11 | that `Q` prologue + `R` + `R { ks: q.xs }` | `error theta/parse/object-field-type-mismatch: field 'ks' on schema 'R' type mismatch: expected array<string>, got xs` |
| 12 | `R` + `fn f(): array<string> { return ["a"] }` + `R { ks: f() }` | `… expected array<string>, got f` |
| 13 | `let n: array<array<string>> = [p.keys()]` + `n` | two errors: `let-rhs-type-mismatch: … expected array<array<string>>, got array<keys>` and `theta/parse/array-element-type-mismatch: array element type mismatch at index 0: expected array<string>, got keys` |
| 14 | `schema W { rows: array<array<string>> }` + `let w = W { rows: [["a"]] }` + `schema R9 { ks: array<string> }` + `R9 { ks: w.rows[0] }` | `… expected array<string>, got index` |
| 15 | `R` + `R { ks: match true { true => p.keys(), false => [] } }` | `… expected array<string>, got keys` |
| 16 | `R` + `R { ks: true ? p.keys() : [] }` | `… expected array<string>, got keys` |
| 17 | `fn g(xs: array<string>): integer { return xs.length }` + `g(p.keys())` | no diagnostics; value `2` |
| 18 | `fn f3(): string { return "z" }` + `schema R8 { s: string }` + `R8 { s: f3() }` | no diagnostics; value `{"s":"z"}` |
| 19 | `fn f2(): string { return "z" }` + `let v: { x: string } = f2()` + `v` | no diagnostics; value `"z"` |

Rows 1, 2, 4, 7, 9–16 are the defect — twelve spellings. Rows 3, 5, 6, 8, 17–19
are the controls that locate it: the same `p.keys()` call is legal as a tail
(3), as a receiver (6) and as a `fn` argument against an `array<string>`
parameter (17); the same nominal-typed value is admitted at a `boolean` sink
(5), at a `string` sink (18) and at an inline-object sink (19). Row 2 answers
the hoisting question directly — moving the call into an untyped `let` changes
nothing, because the binding records the same nominal type and the sink is still
`array<string>`.

The spelling the residual's wording suggests is not available in theta 1.0 and
is recorded so the minimal case is not mis-stated: a bare object literal draws
`error theta/parse/bare-object-literal: bare object literal not permitted in
this position; name the schema (Schema { ... })` in both measured positions (as
a `let` initialiser and as the receiver of a member call), so the receiver has
to be a named-schema constructor as above.

The smallest failing input measured is row 1: a two-field schema, one
constructor, one `array<string>`-declared sink, one `keys()` call. Removing the
sink (row 3) or changing its declared type to a primitive (rows 5, 6, 8) makes it
pass; nothing else in the fixture matters.

### (b) The same bodies in a real spawned child

Each row is one child process, driven to settlement. `RESULT` is
`driveSubagentChild`'s return value, `DIAGS` the diagnostics it emitted, `EXIT`
the observed child exit.

Rows 1, 2, 4 and 7 of §(a), each:

```
RESULT {"ok":false,"error":{"kind":"invoke_infra",
        "message":"subagent child exited without a return envelope: exited code 0",
        "callee_path":"…/thetas/top.theta","cause":"internal_error"}}
DIAGS  [{"severity":"error","code":"theta/runtime/subagent-exit-without-envelope",
        "message":"subagent child exited without a return envelope: exited code 0"}]
EXIT   {"code":0,"signal":null}
```

Rows 3, 5, 6 and 8 of §(a), each:

```
RESULT {"ok":true,"value":…}     ["a","b"] / {"h":true} / {"n":2} / {"s":"x"}
DIAGS  []
EXIT   {"code":0,"signal":null}
```

The correspondence is exact: every body the in-process parse refuses kills the
child, every body it accepts returns its value. `DIAGS` is not empty — it carries
exactly one diagnostic, the driver's own exit-without-envelope mapping. No
`theta/parse/*` code crosses the process boundary, and no
`theta/runtime/subagent-child-crashed` is emitted, because that companion is
gated on a nonzero or signalled exit (`subagent-json-driver.ts:155`) and this
exit is a clean 0.

### (c) What the child does between the refusal and exit 0

Not measured by this report's probe, which observes the parent side only. The
path is stated in the tree: a theta carrying an error-severity diagnostic is
dropped by the parse pass and does not register
(`production-composition.ts:641–654`), and `makeLoadEmit`'s own comment records
what that means in a headless process — the diagnostic is mirrored to stderr,
"a dropped theta's slash command silently fails to register (the raw `/stem …`
text is forwarded to the model as chat, and the run still exits 0)"
(`:208–215`). The child is launched `--mode json -p "/top"`
(`subagent-launcher.ts:429–433`), so `/top` is that raw text. Bug 0178's probe
measures the model turn on the same path. This report pins only the parent-side
observables in §(b) and does not claim a token cost.

## Expected behaviour

- **`docs/spec_topics/type-system.md:48`** — "**Unresolvable operands.** When
  either side of a compatibility check is past the parser's static view …, the
  parse-time check is skipped and the runtime AJV check is the safety net." The
  paragraph is unconditional on the sink's kind. A `named` type the `TypeEnv`
  does not resolve is the paragraph's own example class, and the module
  implements exactly that reading at `:266–269` for every sink the array arm
  does not intercept first.
- **`docs/spec_topics/type-system.md:31`** — the closed-list sentence ends
  "unless the position is one where a runtime AJV check is documented as the
  safety net". `:29` documents AJV as the runtime safety net for the whole
  relation, and `:48` names the skip; so an unresolvable operand is the
  documented exception, not a member of the closed list.
- **`docs/spec_topics/diagnostics/code-registry-parse.md:46`** — the Trigger for
  `theta/parse/object-field-type-mismatch` requires the field value's type to be
  "not compatible with the schema's declared type for that field … **where the
  field value's type is statically resolvable**". `keys`, `values`, `split`,
  `xs`, `f` and `index` are not statically resolvable types; they are the
  inference pass's nominal placeholders. The registered row does not admit the
  measured inputs. `:56` (`let-rhs-type-mismatch`) carries the same clause.
- **`docs/spec_topics/expressions.md:118`** — `keys()` is `(): array<string>`,
  a member of the `object` table that applies to "any object value, schema-typed
  or anonymous" (`:114`). Nothing in the language reference makes its result
  ineligible for an `array<string>` position. `values()` (`:119`) is the same
  case one row down.
- **`src/parser/type-compat.ts:150–153`** — the module states its own posture:
  an unresolvable `named` "stays `named` so the relation reports `\"unknown\"`
  and the runtime AJV safety net applies". The array arm contradicts the
  sentence in the same file.
- **Diagnostics — a load refusal is a registered code or it is nothing.**
  `docs/spec_topics/diagnostics/code-registry-runtime.md:30` gives
  `theta/runtime/subagent-exit-without-envelope` the Trigger "crash, kill, or
  teardown timeout". A child that refuses to load and exits cleanly is none of
  the three, so the parent's only observable is a code whose registered trigger
  does not describe what happened, and the registered code that does describe it
  (`theta/parse/object-field-type-mismatch`) never reaches the parent. PIC-59
  (`subagent.md:101`) obliges the parent to map a missing envelope fail-closed
  with the exit detail — which it does — and says nothing about a child that
  never registers its root theta.

## Actual behaviour / root cause

**1. Arm order.** `decide` (`type-compat.ts:180`) tests its sup-side kinds in a
fixed order: union-sub (`:182`), union-sup (`:196`), array (`:212`), inline
object (`:222`), named (`:253`), then the `named`-sub escape (`:266`), then prim
(`:273`) and literal (`:285`). The escape is a *sub*-side test placed after four
*sup*-side tests, two of which (`array`, `object`) return `"incompatible"` for
every sub of a different kind. So the answer for one and the same sub-type
depends on the sink's kind: at `array<string>` it is `"incompatible"`, at
`string` it is `"unknown"`. Measured in both directions (§Reproduction (a) rows
1 and 18).

**2. The sub-types reaching that arm are placeholders, not claims.**
`#typeExpr` (`static-type-inference.ts:197`) answers a nominal reference for
every expression whose result type the pass does not compute: `member` returns
the field's *name* (`:243`), `call` the callee's *name* (`:252`), `method-call`
the method's *name* (`:262`), `index` the literal token `"index"` when the
target is not statically an array (`:249`). These are deliberately conservative —
the pass records no type for them — and the relation is the only place that can
turn a placeholder into a verdict. At an array sink it turns it into a refusal.

**3. The composite arms propagate it.** `#commonType` over `match` arms
(`:234–240`) and ternary branches (`:227–233`) reduces a placeholder branch and a
legal branch to a placeholder, and the array-literal arm (`:218–222`) lifts it to
`array<keys>` — which is why row 13 draws two diagnostics, one from the typed-`let`
sink over `array<array<string>>` and one from `checkArrayLiteral`'s element sink,
both through the same short-circuit at the element level.

**4. The sinks disagree about whether `typeOf` is a proof.** `checkObjectField`
(`type-layer-checks.ts:1535`) passes `this.typeOf(value, bindings)` straight into
`checkObjectFieldCompat` (`:1542`, `:1548`), and the typed-`let` arm does the
same (`:970`). The `fn`-argument arm does not: it calls `provableArgType`
(`:1608`, defined `:1654`), which returns `undefined` for any expression whose
read is not a proof of the runtime value type, and skips the check. That is why
`g(p.keys())` is admitted (§Reproduction (a) row 17) while
`R { ks: p.keys() }` is refused. The withhold discipline the two other sinks do
apply is narrower — `containsWithheldBinderType` (`:1546`), binder-typed values
only.

**5. The rendered `<actual>` is the placeholder.**
`checkObjectFieldCompat` (`type-compat.ts:500`) interpolates `displayType(value)`
(`:534–536`), which prints a `named` type's name verbatim. So the diagnostic
reports a mismatch against a type that does not exist, and gives the author no
route to the actual condition — there is nothing to declare or cast that would
make `keys` compatible with `array<string>`.

**6. The child-side half is a reporting gap, not a second cause.** The refusal
is the same refusal; what differs is where it lands. The theta is dropped
before registration (`production-composition.ts:648–653`), the child never
reaches the envelope writer, and the parent's driver sees a clean exit. Its
stderr pump captures the last line (`subagent-json-driver.ts:104–106`) but
attaches it only inside the crash-detail arm gated on
`info.code !== 0 || info.signal !== null` (`:155–161`); on `code: 0` the value is
dropped and `mapExitWithoutEnvelope` (`:164`) supplies the whole of the parent's
knowledge. Stdout cannot carry it either: every non-`theta_result` line is
discarded by design (`:112–118`, PIC-59's stray-line tolerance).

## Why it matters

- **Legal input is refused at load, in spellings a theta author reaches
  immediately.** `R { ks: q.xs }` moves an `array<string>`-declared field into
  an `array<string>`-declared field. `R { ks: f() }` calls a `fn` whose return
  annotation *is* `array<string>`. Both are refused, and no rewriting of the
  declaration helps, because the declaration is not what the relation reads.
- **The diagnostic misdirects.** `expected array<string>, got keys` names a
  method as the offending type. An author reading it looks for a type named
  `keys`.
- **The refusal contradicts the registered row's own Trigger.** Both
  `object-field-type-mismatch` and `let-rhs-type-mismatch` require a statically
  resolvable value type; the measured inputs have none. The codes fire outside
  their registered condition (DIAG-4).
- **The `array<T>` sink is the position `keys()` and `values()` exist to feed.**
  `expressions.md:118–119` gives both members an array result, and theta 1.0's
  only object-iteration surface is `for k in o.keys()`. Storing that result in a
  declared field is refused.
- **In a spawned child the refusal is unreportable.** The parent receives
  `Err(invoke_infra, internal_error)` and one diagnostic whose registered
  trigger is "crash, kill, or teardown timeout" — no code, no message, no line
  from the actual refusal. The bug-0172 run hit exactly this and could only
  bisect it by deleting fields from the fixture; the residual it filed records
  the surface (`vo.keys()` in a constructor field) rather than the cause,
  because the cause is not observable from the parent.
- **The workaround is already in the tree.** The 0172 boundary-2 witness
  (`tests/inbound-boundary-theta-callable.test.ts`) lists
  `expressions.md:118` — the `keys()` row — among the spec anchors in its header
  and carries no cell that calls `keys()`; its report records the removal
  (§Provenance).
- **The arm is unwitnessed.** No committed cell pins a `named` sub at an array
  sink in either direction (§Affected), so nothing reds if the behaviour changes
  in either direction today.

## Fix

Settled for the relation. `decide` must not answer `"incompatible"` for a sub it
cannot resolve, whatever the sink's kind: the array arm
(`src/parser/type-compat.ts:212–217`) answers `"unknown"` when the sub is a
`named` that `resolveNamed` does not resolve, exactly as `:266–269` answers for
the same sub at every sink the arm does not intercept. `checkObjectFieldCompat`,
`checkLetRhsCompat` and `checkFnArgCompat` already return no diagnostic for
`"unknown"` (`:511–513`, and the same early return at `:412` and `:463`), so no
sink changes.

### Constraints

1. **Narrow to the unresolvable case.** Only a `named` sub whose
   `resolveNamed(env, name)` is `undefined` changes verdict. A resolvable
   `named` (an object schema, per TYPE-10) stays `"incompatible"` against an
   array sink; a `prim`, `literal`, `object` or mismatched `array` sub is
   untouched. The committed cells that pin an array sink refusing
   `array<number>` under `array<string>`
   (`tests/ctor-field-type-check.test.ts:441`, `:633`, `:964–965`;
   `tests/division-result-type-number.test.ts:1454`) and a literal under an
   array (`expected array<B72Arr>, got integer`) stay green byte-for-byte.
2. **Element-wise recursion inherits the deferral.** `array<T₁> ⊑ array<T₂>`
   recurses through the same procedure (`:216`), so an unresolvable element type
   defers rather than refuses, which is what discharges §Reproduction (a) row 13's
   second diagnostic through `checkArrayLiteral`'s element sink.
3. **The TYPE-8 inline-object arm is the same shape and is not decided here.**
   `:223–225` returns `"incompatible"` for every non-`object` sub by the same
   construction. §Reproduction (a) row 19 (`let v: { x: string } = f2()`) is
   admitted at HEAD, so the arm was not
   reached and this report measured no input that fires it. The fix states
   whether it moves the arm, and on what measurement; it does not move it
   silently.
4. **No new registry row, no spec edit.** The change makes the implementation
   conform to `type-system.md:48` and to the two Triggers in
   `code-registry-parse.md:46` / `:56` as written. DIAG-2 is not engaged.
5. **Full-suite re-measure is part of the change.** 30 test files reach this
   relation. The arm is shared by every sink, so the fix reports the suite delta
   rather than asserting the change is local.
6. **The sink-side proof gate is scoped, not silently adopted.** The
   `fn`-argument sink consults `provableArgType`
   (`type-layer-checks.ts:1608`, `:1654`) and the ctor-field / typed-`let` sinks
   do not (`:1542`, `:970`). Constraint 1 makes the three sinks agree for the
   measured inputs without touching that asymmetry. Whether the two sinks should
   also consult a proof gate is a separate question this report's evidence does
   not settle; the fix states it is out of scope.
7. **The static inference is not widened.** Typing `keys()` as `array<string>`
   from the `expressions.md:118` table would discharge rows 1, 2 and 4 and would
   leave rows 10–16 refused (their subs are member reads, `fn` calls and an
   index, none of which the table covers). It is therefore neither necessary nor
   sufficient, and it is not part of this fix.
8. **The child-side reporting gap is not closed here.** §Reproduction (b) is
   recorded as the observation vehicle and as the shared surface with bug 0178.
   This fix removes the input that triggered it; it does not change
   `driveSubagentChild`, the envelope contract, or what a child does when its
   root theta fails to load.

### Witness

Offline, provider-free, parse-level, in a new file. Required cells, each an
assertion over `parseThetaDocument`'s diagnostics for a whole theta:

- The primary, red at HEAD: §Reproduction (a) row 1 parses with zero
  error-severity diagnostics, and its body then executes to `{"ks":["a","b"]}`
  through the production executor, so the cell pins the value and not only the
  absence of a diagnostic.
- One cell per distinct placeholder shape, all red at HEAD: `method-call` (row
  1), `member` (row 11), `call` (row 12), `index` (row 14), and the composite
  reductions (rows 15, 16).
- The typed-`let` sink (row 9) and the array-literal element sink (row 13), so
  the deferral is pinned at all three TYPE-9 sinks the relation serves.
- Constraint-1 controls, green in both directions: `array<number>` under
  `array<string>` still refuses with the unchanged message; a resolvable named
  schema under an array sink still refuses; a literal under an array sink still
  refuses.
- The already-green controls that locate the arm, so a later change cannot make
  them red silently: rows 3, 5, 6, 8, 17–19.

No child-process cell. §Reproduction (b) is reproducible, but a failing row's
child takes the unregistered-slash-command path (§Reproduction (c)) rather than
a bounded theta run, and every observable it carries is already pinned by the
parse-level cells plus bug 0178's own witness.

## Non-goals

- **The child-side reporting gap.** A theta that fails to load in a spawned
  child producing exit 0 with no envelope, and the parent discarding the stderr
  line that names the reason, is measured here (§Reproduction (b), §Affected) and
  is bug 0178's shared surface. This report neither designs the remedy nor edits
  `src/runtime/subagent-json-driver.ts`.
- **Widening `StaticTypeInferencePass`.** §Fix constraint 7. Typing stdlib
  method results, `fn` returns or member reads from their declarations is a
  larger change with its own blast radius, and the measurements show it is not
  what unbreaks the reported inputs.
- **The unsound admissions deferral leaves.** `let v: { x: string } = f2()`
  where `fn f2(): string` is admitted at HEAD and executes to `"z"`
  (§Reproduction (a) row 19). Deferring at the array sink adds cases of
  the same kind, which is what `type-system.md:29`/`:48` prescribe (AJV is the
  runtime net). Whether that net actually runs at a typed `let` is not this
  report's question and is not measured here.
- **The `fn`-argument sink's asymmetry.** §Fix constraint 6 scopes it out.
- **`theta/parse/bare-object-literal`.** Recorded in §Reproduction (a) only to
  fix the minimal spelling; the rule itself is correct and untouched.
- **Line-number drift in sibling documents.** Bug 0134's adjudicated
  do-not-chase class.

## Provenance

Filed as residual 2 of the bug 0172 fix (0.97.0, commit `c2d22aad`). That run's
report (`.pi/tmp/fixes/0172-report.md`, §*Residuals/notes* → *For the parent to
file*, item 2) is the source, verbatim: "**`vo.keys()` in a schema-constructor
field position kills a spawned child drive** — the root exits 0 with no
envelope. Observed while building the boundary-2 witness, worked around by
removing the field. Apparently unfiled and unrelated to this report."

**Three corrections to that residual, each measured.** (i) The constructor-field
position is not the trigger: a typed `let` refuses identically (§Reproduction (a)
row 9), and hoisting the call into an untyped `let` does not help (row 2). The
trigger is the sink's declared `array<T>` plus a value type the inference leaves
nominal. (ii) `keys()` is not the trigger either: `values()`, a string `split()`,
a member read, a `fn` call and an index all refuse the same way (rows 4, 7,
10–14), while `keys()` at a non-array sink is admitted (rows 3, 5, 6). (iii) The
diagnostics list is not empty on the parent side — it carries exactly one entry,
the driver's own `theta/runtime/subagent-exit-without-envelope` (§Reproduction
(b)); what is absent is any diagnostic naming the cause.

**Verified at HEAD `0d0f8a6d` for this filing, not copied.** Every `src/`,
`tests/`, spec and registry citation above was checked against the tree with `rg`
and by reading the file. Specifically read in full for this report: `decide` and
its eight arms (`src/parser/type-compat.ts:180–292`), `unfoldAlias` (`:147–172`),
`resolveNamed` (`:104`), the three sink functions (`:403`, `:452`, `:500`),
`StaticTypeInferencePass.#typeExpr` (`src/parser/static-type-inference.ts:197–295`),
`checkObjectField` / the typed-`let` arm / the `fn`-argument arm and
`provableArgType` (`src/parser/type-layer-checks.ts:960–1000`, `:1522–1562`,
`:1595–1626`, `:1654–1867`), `evaluateObjectMember`
(`src/runtime/stdlib-object.ts:104–128`), `driveSubagentChild`
(`src/runtime/subagent-json-driver.ts:87–170`), `mapExitWithoutEnvelope`
(`src/runtime/subagent-envelope.ts:279–296`), `makeLoadEmit` and the parse pass
(`src/extension/production-composition.ts:199–220`, `:641–654`),
`assembleSubagentArgv` (`src/runtime/subagent-launcher.ts:380–449`), and
`type-system.md:25–52`, `expressions.md:114–120`, `code-registry-parse.md:40`,
`:46`, `:56`, `code-registry-runtime.md:30`, `subagent.md:101–115`.

**Measured independently for this filing** by one scratch vitest probe (written,
run, deleted; `git status --short` listed only that probe and one concurrent
sibling session's own untracked probe): §Reproduction (a)'s nineteen in-process rows
and the two `bare-object-literal` rows, and §Reproduction (b)'s eight real
spawned children with all three `#subagent-child-pins` set. Every string in
§Reproduction is that run's output verbatim.

## Fix (0.104.0)

- **What shipped.**
  - `src/parser/type-compat.ts` — `decide`'s TYPE-7 array arm (`:218–226`)
    answers `"unknown"` for a `named` sub `resolveNamed(env, name)` cannot
    resolve (`:219–221`), ahead of the non-`array` short-circuit (`:222–224`),
    so an operand past the parser's static view no longer takes its verdict
    from the sink's kind. The element-wise recursion (`:225`) is untouched,
    which is what carries constraint 2: an unresolvable element type now defers
    through the same recursive call. 816 → 825 lines (+3 code, +6 comment). No
    sink changed — `checkObjectFieldCompat` (`:520–522`), `checkLetRhsCompat`
    (`:421`) and `checkFnArgCompat` (`:472`) already return no diagnostic on
    `"unknown"`.
  - `tests/array-sink-unresolvable-deferral.test.ts` (new, 705 lines, 21 cells)
    — the §Witness inventory: the primary (row 1) parse-clean **and** executed
    to `{"ks":["a","b"]}` through the production executor; one cell per
    placeholder shape (`method-call`, `member`, `call`, `index`, `match`,
    ternary); the typed-`let` and array-literal-element sinks (row 13 sheds
    BOTH of its diagnostics); five constraint-1 refusal controls with
    registry-sourced messages (DIAG-4); the seven already-green controls that
    locate the arm (rows 3, 5, 6, 8, 17–19); and one additional cell for the
    self-identical refusal ``let r: array<string> = @`x` `` recorded verbatim
    as
    residual (iii) of
    [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)`:338–349`.
  - `tests/live/live-production-acceptance.test.ts` — additive H8a cell 42,
    registration-only: §Reproduction (a) row 1 as a whole theta driven through
    the real discovery→registration path, so the fixed input's *load* is
    witnessed live and not only at the offline parse boundary. Proved in both
    directions live (guard neutralised ⇒ the caller fails to register;
    restored ⇒ it registers).
  - `tests/inline-empty-object-type.test.ts` — the single authorized suite
    flip, below.
- **Suite delta (constraint 5 — the full-suite re-measure is part of the
  change).** Baseline at the fix's HEAD (`d470996e`, v0.103.0): 307 files /
  5034 tests green. Prototype of the arm change, full suite: **exactly one
  flip in 5034 tests** — `tests/inline-empty-object-type.test.ts` ›
  `bug 0045 (g)` › `RECORDED g3`, whose recorded row
  ``let r: array<string, integer> = @`hi` `` loses its middle element,
  `let-rhs-type-mismatch: … expected array<string,integer>, got
  array<string,integer>`, landing on `[arityLine, arityLine]`. Bucketed as
  **authorized by constraint 1**: `parseLet` propagates the malformed
  annotation text onto the query, `static-type-inference.ts:255` types the
  query as `{kind:"named", name: node.schema}` — that text verbatim — while
  `annotationToCompatType` (`type-layer-checks.ts:810`) parses the same text
  into `{kind:"array"}`, so the sub is a `named` the `TypeEnv` cannot resolve
  at an `array` sup and `displayType` renders both operands from one source
  string. The row's input carries an `E`-severity
  `theta/parse/generic-arity-mismatch` before and after, so it does not load
  either way (GOV-15: never-conformant). The cell's own claim — per-check-site
  doubling of an untouched proxy rule, row 2 against row 3 — survives and
  sharpens; its `expect` message, every other row and every other cell are
  byte-unchanged. Nothing else in the suite moved: the constraint-1 committed
  cells (`tests/ctor-field-type-check.test.ts:441`, `:633`, `:964–965`;
  `tests/division-result-type-number.test.ts:1454`) and every protected lock
  (`fn-arg-type-mismatch-wired` 84, `invoke-arg-type-mismatch-wired`,
  `index-element-alias-unfolded` 51, `array-ternary-common-type-union` 21,
  `inline-object-duplicate-field-name` 49, `params-literal-sublanguage-lowering`,
  `params-default-type-compat`, `params-brace-union-rhs-lowering`,
  `annotation-root-brace-union-lowering`, `inbound-union-arm-dispatch`,
  `params-default-enum-access-merge`, the two `subagent-root-*` files) are green
  and byte-unchanged. §Affected's claim that "no committed cell pins a `named`
  sub at an array sink in either direction" is therefore **one cell wrong**:
  `RECORDED g3`'s row 2 pinned exactly that, incidentally.
- **TYPE-8 disposition (constraint 3): the inline-object arm does NOT move,
  and the measurement is stated.** The arm (`:231–256`) is unreachable in the
  shipped tree, on four independent legs. (i) `annotationToCompatType`
  (`type-layer-checks.ts:810`) is the only annotation→`CompatType` lowering
  feeding the three TYPE-9 sinks and never emits `kind:"object"` — its own doc
  comment says an inline object type "resolves to a nominal `named`
  reference". (ii) `paramsDeclaredCompatType` (`type-compat.ts:742`) likewise.
  (iii) No site in `src/` constructs an `object`-kind `CompatType`.
  (iv) Twelve probed inputs across the typed-`let`, ctor-field and
  `fn`-parameter sinks — literal, array, resolvable-named,
  unresolvable-named and `fn`-call subs against an inline-object sink — are all
  admitted both at HEAD and under the prototype, including
  `let v: { x: string } = 1`, which a reached arm would refuse. So no input
  class fires it spuriously and there is nothing to widen; the only
  inline-object type that reaches `decide` is nested inside an `array<…>` sup,
  where the arm under test is TYPE-7.
- **`<actual>` rendering disposition: out of scope, `displayType` untouched.**
  The fixed inputs now draw no diagnostic at all, and the inputs that still
  refuse have statically resolvable subs whose rendering is a real type name
  (`array<number>`, `integer`, `Zn`). No spelling in which `<actual>` names a
  method survives the fix, so no rendering change is owed.
- **Proof-gate scope statement (constraint 6).** The `fn`-argument sink
  consults `provableArgType` (`type-layer-checks.ts:1654`) where the ctor-field
  (`:1542`) and typed-`let` (`:970`) sinks pass `typeOf` straight through.
  Constraint 1 makes the three sinks agree for every measured input **without**
  touching that asymmetry, and `type-layer-checks.ts` is byte-unchanged (2531
  lines). Whether the two sinks should also consult a proof gate is not settled
  by this report's evidence and is out of scope.
- **Bug 0144's measured observable flips, and 0144 stays open.** Measured both
  sides at this HEAD: `fn g(xs: array<integer>)` + `let v: Zz = [1]` + `g(v)`
  draws `theta/parse/fn-arg-type-mismatch: … expected array<integer>, got Zz`
  before and **nothing** after (`provableArgType` certifies the annotated-`let`
  read, the check runs, and the arm defers); the same `v` at an
  `array<integer>` ctor field and at an `array<integer>` typed `let` flips
  identically. This record states its `:48` reading — the skip is unconditional
  on the sink's kind — and does **not** claim to close 0144: the corpus-level
  `type-system.md:31`-vs-`:48` disposition adjudication and the
  must-agree-with-0127 clause stay open there. An append-only coordination note
  records the flip on 0144's doc; its Status is untouched.
- **§Reproduction (b) is stale at this HEAD (baseline drift, not re-derived).**
  Bug 0178's fix (0.101.0, element (b)) made a child-side load refusal of the
  marked root reach the parent as
  `Err(InvokeInfraError { cause: "load_failure" })` naming the refusing
  diagnostic, so the recorded signature (exit 0, no envelope,
  `theta/runtime/subagent-exit-without-envelope`, empty reason) no longer holds.
  Taken as a measured fact from that fix's record rather than re-derived with
  spawned children. The witness spec carries no child-process cell, so this
  affects framing only; `src/runtime/subagent-json-driver.ts` is untouched
  (constraint 8).
- **GOV-15 — the refusal→silence classes this fix creates.** Every one is an
  input the `array<T>` sink refused with a placeholder for a type name; the
  language admits no program in which the removed diagnostic was correct.
  1. `method-call` subs (`p.keys()`, `p.values()`, `s.split("")`) at an
     `array<T>` ctor field, typed `let` and array-literal element.
  2. `member` subs (a read of an `array<T>`-declared field).
  3. `call` subs (a `fn` whose return annotation is `array<T>`).
  4. `index` subs (an index into a non-array-typed target).
  5. The `match`/ternary reductions of 1–4 through `#commonType`.
  6. `named` annotations the `TypeEnv` cannot resolve at all three sinks (bug
     0144's `Zz` class), including a `.thetalib`-imported type name.
  7. `result-ctor` subs (`Ok(…)`/`Err(…)`) at the typed-`let` sink only — the
     ctor-field sink still refuses them through `forceIncompatible`, which
     bypasses `checkCompatible`.
  8. The self-identical `array<T>`-annotated bare-query refusal (0028 residual
     (iii)), including the malformed-generic spelling in `RECORDED g3`.
- **Gates** (verbatim, at the committed tree).
  - Witness: `npx vitest run tests/array-sink-unresolvable-deferral.test.ts` →
    `Test Files 1 passed (1)`, `Tests 21 passed (21)`. Red before the fix: 9
    failed / 12 passed, each red the object-field / let-rhs / array-element
    mismatch naming the placeholder.
  - Full default suite: `npm test` → `Test Files 308 passed (308)`,
    `Tests 5055 passed (5055)`, exit 0 (307 / 5034 before the witness).
  - Typecheck: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) → exit 0,
    no output.
  - Lint: `npm run lint` (`eslint --no-error-on-unmatched-pattern
    "src/**/*.ts"`) → exit 0, no output.
  - Live: H8a `tests/live/live-production-acceptance.test.ts` → 42/42 passed;
    H9a `tests/live/acceptance/` → 11/11 passed across both files;
    `tests/fixtures/h7a/permitted-codes.json` byte-unchanged by the real run.
- **Review.** Round 1 (`bug-fix-reviewer`) — **clean**, zero findings, one
  non-blocking prose residual (the witness header's TYPE-9 gloss claimed an
  `fn-arg-type-mismatch` oracle the file does not assert, and placed
  `object-field-type-mismatch` under TYPE-9 where `type-system.md:27` is its
  home). The reviewer proved constraint 1 with data of its own, comparing
  `HEAD:src/parser/type-compat.ts` against the fixed relation over prim,
  literal, object, resolvable-named, mismatched-array and union subs. Two
  comment-only polish rounds followed (`bug-fix-fixer-light`): the prose
  residual, then the `type-compat.ts` line citations inside the two files this
  commit ships, which the +9 shift had moved. Both inspected hunk-by-hunk as
  comment-only with the gates re-run green, so no confirmation review round was
  dispatched.
- **Verification** (`bug-fix-verifier`). All four obligations discharged with
  quoted evidence; its one finding was this record's own owed 0144 note, now
  written.
  - Neutralisation both directions: the three-line guard deleted →
    `type-compat.ts` `23a75a14…` → `89a5db37…`, witness 9 red / 12 green (the
    nine named, each with its mismatch text) and `RECORDED g3` red; restored →
    `23a75a14…`, witness 21/21 and `inline-empty-object-type` 46/46. No
    `git stash` at any point. No cell is vacuous: exactly the nine deferral
    cells red under neutralisation, and the twelve controls stay green by
    design.
  - Full default suite green at the restored tree (308 / 5055).
  - Live: no existing cell exercised a parse-deferral path (0089/0125 are
    TYPE-11 alias transparency, 0081 is the common-type union, H9a's
    ctor-refusal cell is an actually-unresolvable schema name), so cell 42 was
    added and proved live in both directions; both live halves then ran clean
    on the first attempt with none of the known flaky signatures.
  - Lint and typecheck read from `package.json` and run, both exit 0.
- **Residuals.**
  1. **The 0172 boundary-2 witness's removed `keys()` field can now be
     restored.** `tests/inbound-boundary-theta-callable.test.ts` lists
     `expressions.md:118` in its spec header and carries no cell that calls
     `keys()`; that field was deleted as a workaround for this defect (0172
     §Provenance). The workaround is now unnecessary, but the file is a closed
     bug's protected witness and this fix pre-authorized no edit to it, so the
     restoration is recorded rather than performed.
  2. **The `Result`-ctor sink asymmetry the deferral exposes.**
     `let ks: array<string> = Ok(1)` now loads where `R { ks: Ok(1) }` still
     refuses, because only `checkObjectFieldCompat` carries
     `forceIncompatible`. Measured both sides. It is a member of §Non-goals'
     "unsound admissions the deferral leaves" class — `type-system.md:29`/`:48`
     prescribe AJV as the net — and no committed cell pins either spelling.
  3. **Positional drift this commit causes and does not chase.** The +9 shift
     stales every `src/parser/type-compat.ts` citation of a line ≥ 210 in files
     this commit does not ship: `tests/ctor-unresolved-schema-name.test.ts`,
     `tests/index-element-alias-unfolded.test.ts`,
     `tests/fn-param-alias-unfolded-at-gates.test.ts`,
     `tests/fn-arg-type-mismatch-wired.test.ts` (`:2400` spans the edited
     region), `tests/schema-alias-union-decl.test.ts`,
     `tests/typeenv-prototype-names.test.ts` and
     `tests/live/live-production-acceptance.test.ts:2399`. All comment-only, no
     executable assertion affected;
     [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
     do-not-chase class, which this report's §Non-goals adopts by name. The two
     files this commit does ship were corrected.
- **Discharge notes appended.**
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)
  (its `## Fix (0.97.0)` *Residuals* item 3 — the unfiled `vo.keys()` child
  kill — is this report, fixed here),
  [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md) (its
  measured observable flipped; subject still open) and
  [0093](./0093-let-annotation-query-position-double-emission.md) (the cell it
  names as its honest record changed shape; its doubling subject is
  untouched). No Status but this report's was changed.
- **Pinned dispositions / non-goals.** No registry row, no spec edit (constraint
  4 — DIAG-2 is not engaged; the change makes the implementation conform to
  `type-system.md:48` and to the "statically resolvable" clauses at
  `code-registry-parse.md:46`/`:56` as written). `StaticTypeInferencePass` is not
  widened (constraint 7; `static-type-inference.ts` byte-unchanged at 378
  lines). The child-side reporting gap is not touched (constraint 8; bug 0178
  owns and fixed it). The `fn`-argument proof-gate asymmetry stays out of scope
  (constraint 6). `theta/parse/bare-object-literal` is untouched.
