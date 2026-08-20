# Bug 0115 — `docs/spec_topics/bindings.md:12` requires a reassignment's RHS to be compatible with the binding's declared or inferred type, and no check anywhere in the tree evaluates that relation: `let mut n: integer = 1` / `n = "hi"` parses with `[]`, every compound form is equally silent, the runtime write accepts on mutability alone, and the diagnostics registry carries no row for the position — the mirror of bug 0050's family, so the fix needs a DIAG-2 adjudication before any code

- **Status:** fixed (0.138.0). §Fix was constraint-pinned; the DIAG-2 choice is
  made in `## Fix (0.138.0)` below — **route 1, mint a row**. The ordering
  dependency is satisfied:
  [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md) is
  **fixed** and its disposition 1 is landed, so this report's obligation
  survives rather than being deleted.
- **Sev/Diff estimate:** S1/D3 — a declared constraint is enforced nowhere in
  either phase, so a `string` writes into an `integer`-annotated binding with no
  diagnostic of any severity and the recorded type keeps asserting the
  annotation; D3 because §Fix needs an in-run DIAG-2 decision (mint a row against
  widen an existing *Trigger*) with a same-commit spec edit, and it is ordered
  behind 0090's separate adjudication.
- **Kind:** defect against existing normative text, plus a registry gap that
  makes it unfixable without a spec decision.
  1. **A stated obligation runs nowhere.** `docs/spec_topics/bindings.md:12`:
     "the RHS must be compatible with the binding's declared or inferred type per
     [Type System — Type compatibility]". No parse pass and no runtime path
     evaluates `⊑` at that position. The type-layer walk's `case "reassign"`
     (`src/parser/type-layer-checks.ts:665–667`) walks the assigned value for
     nested checks and returns; `checkReassignment`
     (`src/parser/bindings.ts:85–100`) tests mutability only; `writeBinding`
     (`src/runtime/lexical-environment.ts:361–373`) accepts on mutability alone.
  2. **The registry has no row for the position.** `theta/parse/immutable-rebinding`
     (`docs/spec_topics/diagnostics/code-registry-parse.md:28`) has *Trigger*
     "Reassignment of a `let` (non-`mut`) binding" — mutability, not
     compatibility. `theta/parse/let-rhs-type-mismatch` (`:54`) has *Trigger*
     "The RHS initialiser of a typed binding `let x: T = expr`" — scoped to the
     initialiser, and to an annotated binding. The registry is closed under
     [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2), so an
     emitter cannot be wired without either minting a row or widening that
     *Trigger*, each a spec change landing in the same commit. This is the
     mirror image of [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)'s
     family: there a registered code has no emitter, here a specified obligation
     has no registered code.
- **Related:**
  - [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md) —
    **open**, the ordering constraint and the sibling half of the same spec
    silence. 0090 asks what type a binding carries *after* a reassignment; this
    report is about the write itself. 0090 names this gap in its §Non-goals
    ("Not about the absent reassignment RHS compatibility check … no report
    covers it at the time of writing") and its §Fix disposition 1 depends on it:
    "The RHS check `bindings.md:12` already requires is what makes this
    disposition sound; blessing the reading without it leaves a declared type any
    write can contradict silently." Its §Fix constraint 2 states the converse —
    under 0090's disposition 2 (each reassignment re-derives the recorded type)
    "a binding whose type follows its last write cannot fail a compatibility
    check against itself", so that resolution deletes this report's premise
    instead of satisfying it. Both reports also edit the same physical line
    (`bindings.md:12`), so their spec edits collide.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **open**, the mirror family and the closest structural precedent. Its
    position (a plain `fn`-argument slot) is named by both `type-system.md:27`
    and TYPE-9 (`:50`) and has a registered code whose sole emitter
    `checkFnArgCompat` (`src/parser/type-compat.ts:452`) has no caller. Here the
    engine seam is the same shape and the missing piece is at the other end. Its
    §Fix is also constraint-pinned, and neither report's resolution touches the
    other's site.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)**, the
    precedent for the mint route. A written value was checked against no declared
    type at the schema-constructor field position; the fix minted
    `theta/parse/object-field-type-mismatch`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:46`, mirrored at
    `docs/reference/diagnostics.md:92`), added the position to
    `type-system.md:27`'s enumeration, and wired one call at the type-phase
    `object` arm. Its fix record states the DIAG-2 / GOV-15 disposition and the
    placeholder-closure check this report's §Fix (a) reuses.
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md) —
    **fixed (0.55.0)**, what makes the missing check consequential. Before it the
    `let` arm recorded the initialiser's inferred type; after it the arm records
    the declared annotation (`src/parser/type-layer-checks.ts:640–643`), so an
    annotation now governs every later reference for the binding's whole scope
    with nothing checking that later writes respect it.
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, the report whose review surfaced this gap and whose static
    gate the gap is observable through. Its residual (ii) records the probe; its
    orchestrator adjudicated the interaction, which §Why it matters restates. The
    adjudication is not reopened here.
- **Affected** (every citation verified at HEAD `a410f727`, 0.69.0; cite symbols,
  the line numbers are this HEAD's):
  - `docs/spec_topics/bindings.md:12` — the obligation. One physical line
    carrying the whole **Reassignment** paragraph: the statement-only rule, the
    five compound forms `+=`, `-=`, `*=`, `/=`, `%=`, the RHS compatibility
    clause with its anchor link to
    `docs/spec_topics/type-system.md#type-compatibility`, and the clause naming
    that relation "the canonical referent of every 'same rules as `let`'
    cross-link elsewhere in the spec". `bindings.md` is 36 lines; no other line
    addresses the reassignment write.
  - `docs/spec_topics/type-system.md:27` — the page `bindings.md:12` cites. It
    enumerates the nine positions `⊑` governs — the typed-`let` RHS, a
    function-argument slot, an `invoke<T>` return annotation, `match`-arm and
    ternary common types, an `array<T>` element against its sink, `+`'s
    mixed-numeric case, a frontmatter `params:` default, a schema-constructor
    field value — and the reassignment RHS is **not** among them. Its closing
    sentence states that "every site that previously phrased itself as 'the same
    rules as `let`' … cites this section by anchor", and no page in `docs/`
    carries that phrasing any more except `bindings.md:12`'s own
    self-description. So the cross-link is one-directional: the obligation names
    the relation, and the relation's own position list omits the site.
  - `docs/spec_topics/type-system.md:50` — TYPE-9, the rule that assigns per-site
    parse-time codes. It names three sites (the typed-`let` RHS →
    `theta/parse/let-rhs-type-mismatch`, a plain `fn`-argument slot →
    `theta/parse/fn-arg-type-mismatch`, a ternary → the array/ternary
    common-type machinery) and no reassignment. Mirrored at
    `docs/reference/type-system.md:64–69`, same three sites.
  - `src/parser/type-layer-checks.ts:665–667` — **defect site 1**, the type
    phase. `case "reassign"` is two statements: `this.walkExpr(stmt.value,
    bindings, flow)` then `return`. It resolves no type for the target, calls no
    compatibility engine, and pushes no diagnostic.
  - `src/parser/type-layer-checks.ts:595–643` — the `let` arm, which does what
    the reassign arm does not: `:595` resolves the initialiser type, `:601–604`
    resolves the annotation, `:605–623` calls `checkLetRhsCompat` when an
    annotation is present, `:626` walks the initialiser, `:640–643` records
    `annotation === undefined ? rhsType : unfoldAlias(annotation, this.env)` as
    the binding's type (bug 0083). The reassign arm has only the walk.
  - `src/parser/type-compat.ts:403–442` — `checkLetRhsCompat`, the emitter seam a
    fix reuses or parallels. It calls `checkCompatible` (`:411`), returns `[]` for
    `"compatible"` or `"unknown"` (`:412–416`, the statically-unresolvable
    deferral), emits `theta/parse/integer-narrowing` for the `number`-into-`integer`
    case (`:417–429`), and otherwise emits `theta/parse/let-rhs-type-mismatch`
    with a Message naming the binding (`:431–441`). Its only caller in `src/` is
    `type-layer-checks.ts:609`.
  - `src/parser/type-layer-checks.ts:573–575`, `:640`, `:738`, `:1182` — the
    `CompatType` map every later `typeOf` reads, and the three sites that write
    it: the `let` arm, `fn` parameters (`walkFn`), and the comprehension loop
    variable. No reassignment write exists, which is bug 0090's subject and is
    why the recorded type stays the annotation this report's missing check would
    have enforced.
  - `src/parser/bindings.ts:85–100` — `checkReassignment`, the only
    reassignment-specific check in the parser. Its input is
    `BindingReassignment` (`:73–76`): `{ name, mutable }`. No type crosses the
    boundary, so the function is structurally incapable of a compatibility check
    as written.
  - `src/parser/theta-document.ts:2027–2053` — `buildReassign`, its sole caller.
    `:2036` reads the target's mutability out of `this.bindings`, `:2038–2041`
    calls `checkReassignment` with the name, `mutable: false` and the target
    token's range, and `:2046–2052` returns the `ReassignStmt`. The parser's
    binding table holds mutability, not types.
  - `src/parser/static-type-inference.ts:129–131` — the inference pass's
    `case "reassign"`: `record(stmt.value)` and return. The value's type is
    recorded for the expression map; nothing compares it to the target's.
  - `src/parser/query-schema-resolve.ts:148–150` — `case "reassign"` rewrites the
    value with an empty sink frame list, under the comment "A reassignment
    carries no declared annotation to serve as a sink." So a query RHS assigned
    by reassignment gets no schema sink either, where a `let` RHS gets one
    (`:143–146`).
  - `src/extension/extension-tool-reachability.ts:86–88`,
    `src/extension/invoke-static-checks.ts:129–131`,
    `src/extension/subagent-fn-static-checks.ts:79–81` — the three remaining
    statement walks with a `reassign` arm. Each descends into `stmt.value` and
    returns; none is a type check. This is the complete set of reassign arms in
    `src/` outside the parser and the runtime.
  - `src/runtime/lexical-environment.ts:361–373` — **defect site 2**, the runtime
    write. `writeBinding` walks the scope chain to the nearest slot, rejects when
    `!slot.mutable` (`:365–367`) and otherwise assigns `slot.value = value`
    (`:368`). Mutability is the only predicate; no type is carried on the slot.
  - `src/runtime/statement-executor.ts:1469–1478` — `case "reassign"` in the
    executor: evaluate the value, compute `next` (the value itself for `=`, or
    `applyCompound` for the compound forms), call `writeBinding`, discard its
    `WriteResult`.
  - `src/runtime/statement-executor.ts:569–588` — `applyCompound`, the compound
    path's arithmetic. It coerces a non-`number` current value or delta to `0`
    (`:574–575`) before applying the operator, so a compound write of a
    non-numeric RHS produces a number rather than an error. Read, not executed
    (the function is module-private).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:28` — the
    `theta/parse/immutable-rebinding` row. Sev `E`, phase `parse`, *Trigger*
    "Reassignment of a `let` (non-`mut`) binding.", *Message*
    `cannot reassign immutable binding '<name>'`. The only registered code whose
    *Trigger* names a reassignment, and it is about mutability.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:54` — the
    `theta/parse/let-rhs-type-mismatch` row. Sev `E`, phase `type`, *Trigger*
    "The RHS initialiser of a typed binding `let x: T = expr` has a static type
    that is not compatible with the annotation `T` … where the RHS type is
    statically resolvable", *Message*
    `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>`.
    The Trigger names the *initialiser* of a *typed* binding, so it covers
    neither a reassignment nor an inferred binding.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:46` — the
    `theta/parse/object-field-type-mismatch` row bug 0031 minted, the shape a new
    row here would copy (including the resolvability qualifier).
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2: the registry
    is closed; adding a code or "changing a code's … trigger" is a spec change
    that MUST land in the same commit. `:74` — DIAG-4: the *Message* column is
    normative and a reword is deferred to theta 2.0.
  - `docs/spec_topics/governance/source-language-stability.md:25` — the GOV-15
    diagnostic-registry carve-out. Both routes are covered within a theta 1.x
    minor: "a code **addition** (DIAG-2) is in-scope for inputs that did not
    previously emit the added code … a DIAG-2 *trigger* change is dispositioned
    by the same principle, in-scope as an addition for inputs newly brought into
    the code's emission set". A *Message* reword is not covered.
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` — the closed
    placeholder surface, enforced at build time. `:11` — category 1 admits
    `<expected>` and `<actual>`;
    `docs/spec_topics/diagnostics/placeholder-rendering-b.md:10` — category 5
    admits `<name>`. A row reusing those three placeholders needs no closure
    edit, as bug 0031's did not.
  - `docs/reference/diagnostics.md:74`, `:100` — the user-facing mirrors of the
    two rows above. The page transcribes **Code**, **Sev**, **Phase** and
    **Message** only and states so at `:3–9`: "The full *Trigger* / *Spec rule* /
    *Hint* columns live on the spec registry pages and are not restated here to
    avoid drift." A *Trigger* widening therefore does not reach this page; a new
    row does.
  - `docs/reference/grammar.md:495–497` — the reference restatement: "RHS must be
    compatible with the binding's type". It inherits the obligation and names no
    code for it. (Bug 0090 cites this as `:466–469`; that citation has drifted.)
  - `tools/closing-gate/index.js:701–710` — the DIAG-2 reconciliation arm that
    reports `registry-code-no-asserting-test` for a registry code no test
    asserts, so a minted row carries a witness obligation. It is computed over
    the live corpus but is **not** in `CANARY_GAP_KINDS`
    (`tools/closing-gate/live-corpus.js:51–59`), which is the filter both the
    hard-fail footing (`tests/live-corpus-release-gate.test.ts:40`) and the
    warn-only canary apply, so a row with no asserting test does not red
    `npm test` today. The obligation is DIAG-2's, not a gate's.
  - `tests/lexical-environment.test.ts:198–213` — the cka-6 pin on the runtime
    write. It asserts a `let mut` write is accepted and an immutable one rejected,
    with no type on either side. `tests/bindings.test.ts:50–71` — the
    `checkReassignment` unit pin, whose second cell asserts `undefined` for a
    mutable target. Both are scoped to mutability and stay green under either
    §Fix route as long as the compatibility check is not wired inside
    `checkReassignment`'s current signature.
  - **Test coverage of this defect: none.** No test in `tests/` drives a
    type-incompatible reassignment in either direction. The one test row that
    depends on a binding's recorded type after a reassignment is bug 0083's pin
    `tests/let-annotation-recorded-binding-type.test.ts:328–343`, which asserts
    `theta/parse/integer-narrowing` for `let mut n: number = 1` / `n = 2` /
    `let m: integer = n` — a compatible write, so it does not score this defect
    (re-measured below, row d5).
  - `docs/examples/` — the reachability surface a fix must not break. Seven
    reassignment statements across the committed corpus, all inside a loop body:
    `fan-out-reviews.theta:34` (`report = report + line + "\n"`, target
    `let mut report = ""` at `:27`), `ralph.theta:11` and
    `ralph-inline.theta:38` (`round += 1`), `refine.theta:12` and
    `refine-inline.theta:29` (`round += 1`), `refine.theta:17` and
    `refine-inline.theta:34` (`draft = @\`…\`?`, target `let mut draft = @\`…\`?`
    at `refine.theta:9`). The two `draft` rows are the risk case: the target's
    type is inferred from a `?`-unwrapped query, so a check that does not defer
    on an unresolvable operand refuses a shipped example.
    `tests/committed-fixture-parse-gate.test.ts` walks every committed `.theta`
    (32 shipped, plus one seeded-invalid fixture the walk skips) and requires
    zero diagnostics; 34 cells, green at this HEAD on my own run.
- **Observed at:** 0.69.0 (HEAD `a410f727`). Offline, deterministic, no provider:
  scratch vitest files driving the shipped `parseThetaDocument` through
  `parseDoc` (`tests/helpers/e2e-s1.ts`) and reading `.diagnostics`, plus one
  unit call against the real `buildEnvironment` / `writeBinding`. Written, run,
  deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other bug document
  are unmodified by this filing.

## Summary

`bindings.md:12` states one obligation on a reassignment beyond mutability: the
RHS must be compatible with the binding's declared or inferred type. Nothing
evaluates it. The type-layer walk's `reassign` arm descends into the assigned
value and returns (`type-layer-checks.ts:665–667`); the parser's
reassignment-specific check receives a name and a mutability flag and nothing
else (`bindings.ts:85–100`, `theta-document.ts:2038–2041`); the runtime write
tests the slot's mutability and assigns (`lexical-environment.ts:361–373`).
Measured: `let mut n: integer = 1` followed by `n = "hi"` produces `[]` — no
diagnostic of any severity — and so does the inferred form `let mut n = 1` /
`n = "hi"`. The identical mismatch at the initialiser
(`let n: integer = "hi"`) reports `theta/parse/let-rhs-type-mismatch`.

The position is unchecked in both phases, so there is no runtime safety net
either: `writeBinding` returns `{ accepted: true }` for a `string` written into a
slot initialised with `1`, and the slot then reads back `"hi"`. Combined with bug
0083's record change, the recorded static type remains the annotation for the
binding's whole scope, so the parser keeps asserting a type the value no longer
has — which surfaces one statement later under an unrelated code
(`theta/parse/unknown-method` on a `number`-recorded receiver) or not at all.

Wiring an emitter is blocked on a spec decision, which is why this report exists
before any code. The registry is closed under DIAG-2 and carries no row for the
position: `theta/parse/immutable-rebinding` is scoped to mutability
(`code-registry-parse.md:28`) and `theta/parse/let-rhs-type-mismatch`'s *Trigger*
is scoped to "the RHS initialiser of a typed binding `let x: T = expr`" (`:54`).
This inverts bug 0050, where a registered code has no emitter: here a specified
obligation has no registered code. Either route — mint a row, or widen
`let-rhs-type-mismatch`'s *Trigger* — is a spec change landing in the same
commit, and the choice changes what a conformant implementation reports.

## Reproduction

Parse-only, offline, at `a410f727`. Each source is a body under
`---\nmode: prompt\n---`; *Observed* is the aggregated diagnostic codes from
`parseThetaDocument`, unfiltered. Rows marked **control** are the same mismatch
in a position that is checked. Each measured source carries a trailing tail
expression `1` where the last statement shown is not itself a final value; the
tail is elided from the tables and changes no row (measured both ways on rows (a)
1, (d) 3 and (d) 6).

### (a) The two primary rows

| Source | Observed |
| --- | --- |
| `let mut n: integer = 1` <br> `n = "hi"` | `[]` |
| `let mut n = 1` <br> `n = "hi"` | `[]` |
| **control** `let n: integer = "hi"` | `["theta/parse/let-rhs-type-mismatch"]` |
| **control** `let n: integer = 1` <br> `n = 2` | `["theta/parse/immutable-rebinding"]` |

The first control establishes that the relation is computable on these operands
and that a checked position reports it. The second establishes that the
reassignment statement is otherwise reached by a check — the mutability one fires
on the same statement shape.

### (b) Every primitive pair and every compound form

| Source | Observed |
| --- | --- |
| `let mut n: number = 1` <br> `n = "x"` | `[]` |
| `let mut n: integer = 1` <br> `n = 1.5` | `[]` |
| **control** `let n: integer = 1.5` | `["theta/parse/integer-narrowing"]` |
| `let mut b: boolean = true` <br> `b = 1` | `[]` |
| `let mut s: string = "a"` <br> `s = 1` | `[]` |
| `let mut s = "a"` <br> `s = 1` | `[]` |
| `let mut n: integer = 1` <br> `n += "hi"` | `[]` |
| `let mut n: integer = 1` <br> `n -= "hi"` | `[]` |
| `let mut n: integer = 1` <br> `n *= "hi"` | `[]` |
| `let mut n: integer = 1` <br> `n /= "hi"` | `[]` |
| `let mut n: integer = 1` <br> `n %= "hi"` | `[]` |
| `let mut n: integer = 1` <br> `n += 1.5` | `[]` |

All five compound forms `bindings.md:12` names are silent, including the
`number`-into-`integer` narrowing the initialiser position reports as
`theta/parse/integer-narrowing`.

### (c) Composite and nominal types

| Source | Observed |
| --- | --- |
| `let mut xs: array<string> = []` <br> `xs = [1]` <br> `xs.join(",")` | `[]` |
| **control** `let xs: array<string> = [1]` <br> `xs.join(",")` | `["theta/parse/let-rhs-type-mismatch", "theta/parse/array-element-type-mismatch"]` |
| `schema P { x: number }` <br> `schema Q { x: number }` <br> `let mut p: P = P { x: 1 }` <br> `p = Q { x: 2 }` | `[]` |
| **control** same schemas, `let p: P = Q { x: 1 }` | `["theta/parse/let-rhs-type-mismatch"]` |

TYPE-10's nominality (`type-system.md:52`) is enforced at the initialiser and not
at the reassignment, so a `Q` writes into a `P`-annotated binding silently.

### (d) The consequence surfaces at the wrong site, under the wrong code, or not at all

| Source | Observed |
| --- | --- |
| `let mut n: number = 1` <br> `n = "x"` <br> `n.length()` | `["theta/parse/unknown-method"]` |
| `let mut n = 1` <br> `n = "x"` <br> `n.length()` | `["theta/parse/unknown-method"]` |
| `let mut s: string = "a"` <br> `s = 1` <br> `s.length()` | `[]` |
| `let mut n: integer = 1` <br> `n = "hi"` <br> `let m: integer = n` | `[]` |
| `let mut n: number = 1` <br> `n = 2` <br> `let m: integer = n` | `["theta/parse/integer-narrowing"]` (bug 0083's pin, a **compatible** write) |
| `let mut n: integer = 0` <br> `for x in [1, 2] { n = "hi" }` | `[]` |

Rows 1 and 2 report at `n.length()`, one statement after the statement the spec
makes illegal, and under a code about methods. Row 3 is the reverse: the recorded
`string` admits `.length()`, so the program is accepted, and by (e) the receiver
the method runs against holds `1`. Row 4 launders the value through a checked
position — the typed `let` sink compares against the recorded `integer`, not the
`string` the binding holds — and reports nothing.

### (e) The runtime write

Unit-level, against the real `buildEnvironment` and `writeBinding`:

```
@@ defineLocal("n", 1, mutable) ; writeBinding("n", "hi")
   -> { "accepted": true }
   resolve("n") -> { "arm": "local", "value": "hi", "mutable": true }
@@ control: defineLocal("m", 1, immutable) ; writeBinding("m", "hi")
   -> { "accepted": false }
```

There is no runtime net at this position: the write is accepted and the slot
holds the incompatible value. `type-system.md:29`'s AJV safety net does not reach
a binding write.

### (f) Interaction with bug 0079's static gate — both directions

| Source | Observed |
| --- | --- |
| `let mut r = Ok(1)` <br> `` @`x${r}` `` | `["theta/parse/interpolated-result"]` |
| `let mut r = Ok(1)` <br> `r = 5` <br> `` @`x${r}` `` | `["theta/parse/interpolated-result"]` |
| `let mut r = Ok(1)` <br> `r = "s"` <br> `` @`x${r}` `` | `["theta/parse/interpolated-result"]` |
| `let mut r: Result<integer, QueryError> = Ok(1)` <br> `r = 5` <br> `` @`x${r}` `` | `["theta/parse/interpolated-result"]` |
| **control** `let mut r = 5` <br> `` @`x${r}` `` | `[]` |
| `let mut n: integer = 1` <br> `n = Ok(1)` <br> `` @`x${n}` `` | `[]` |
| `let mut n = 1` <br> `n = Ok(1)` <br> `` @`x${n}` `` | `[]` |

Rows 2–4 are the adjudicated case §Why it matters describes: the binding's
recorded type is the `Result`, which is what the registered *Trigger* names, and
the reassignment that would have made the program illegal draws nothing. Rows 6
and 7 are the same gap from the other side: a `Result` written into a binding
recorded as `integer` is invisible to the static gate, so the rejection falls to
bug 0079's runtime fallback instead of its parse gate. The parse observable `[]`
is measured; the runtime panic is not measured here.

Probe: scratch vitest files calling `parseDoc` (`tests/helpers/e2e-s1.ts`, the
shipped `parseThetaDocument` under inert deps) on each source and collecting
`.diagnostics`, plus the `writeBinding` unit call of (e). Deleted after the run.

## Expected behaviour

`bindings.md:12` is unambiguous about the obligation and silent about its
diagnostic:

> the RHS must be compatible with the binding's declared or inferred type per
> [Type System — Type compatibility](./type-system.md#type-compatibility)

The relation is `⊑` (`type-system.md:27`), normative, and computable on every
operand pair measured above — the same relation, the same engine
(`checkCompatible`), and the same statically-unresolvable deferral that
`checkLetRhsCompat` already applies at the typed-`let` sink. So a conformant
implementation reports:

- a `string` RHS against an `integer`- or `number`-typed binding, at the
  reassignment statement, in the plain form and in all five compound forms;
- a `number` RHS against an `integer`-typed binding as the TYPE-2 one-way
  widening failure, the same disposition `checkLetRhsCompat` gives it
  (`type-compat.ts:417–429`);
- an `array<integer>` RHS against an `array<string>`-typed binding, and a `Q`
  against a `P`-typed one (TYPE-10 nominality, `type-system.md:52`);
- nothing when either side is past the parser's static view — the
  `"unknown"` arm `checkLetRhsCompat` already takes
  (`type-compat.ts:412–416`), which is what keeps `refine.theta:17`'s
  query-inferred `draft` reassignment admitted.

Two things the text does **not** decide, and which are this report's deliverable
rather than its premise:

1. **Which code.** `type-system.md:50` (TYPE-9) assigns per-site codes and names
   three sites, none of them this one. `type-system.md:27`'s position list omits
   the reassignment RHS, so the anchor `bindings.md:12` cites does not carry the
   site back and does not route it to a code. The registry has no row whose
   *Trigger* admits the position (`code-registry-parse.md:28`, `:54`). Under
   DIAG-2 the answer is a spec edit either way.
2. **Whether the obligation survives.** `bindings.md:12` presumes the binding
   has a type at the moment of the write. Bug 0090 records that no sentence says
   whether that type is the declared or inferred one or the last-written one, and
   that under the second reading a compatibility check at this position is
   vacuous by construction. The obligation as written is therefore conditional on
   0090's adjudication.

What the text does decide, and what makes this a defect rather than only a gap:
whichever type governs, the write is constrained, and today it is not constrained
at all. The measured rows are illegal under both of 0090's readings — a `string`
is not compatible with `integer` under the declared-governs reading, and under
the re-derive reading the sentence at `bindings.md:12` would have to be removed
rather than left unenforced.

## Actual behaviour / root cause

**The type phase has no arm for it.** `TypeLayerWalk.walkStmt`'s reassign case is
the whole of the parser's type-side treatment (`type-layer-checks.ts:665–667`):

```ts
case "reassign":
  this.walkExpr(stmt.value, bindings, flow);
  return;
```

The walk holds everything a check needs at that point: `bindings` maps the target
name to its recorded `CompatType`, `this.typeOf` resolves the assigned
expression, `this.env` is the `TypeEnv`, and `this.diagnostics` is the sink. The
adjacent `let` arm (`:595–643`) uses all four. The reassign arm reads none of
them for the target.

**The parser's reassignment check cannot see a type.** `checkReassignment`
(`bindings.ts:85–100`) takes `BindingReassignment` = `{ name, mutable }`
(`:73–76`) and returns `theta/parse/immutable-rebinding` or `undefined`. Its sole
caller `buildReassign` (`theta-document.ts:2027–2053`) looks the target up in the
parser's binding table, which stores mutability (`:2036`: `const known =
this.bindings.get(target)`, compared against `false`). The structural-parse layer
has no type information, which is why a fix belongs in the type phase, not here.

**Two other passes visit the statement and neither compares.**
`static-type-inference.ts:129–131` records the assigned value's type for the
expression map. `query-schema-resolve.ts:148–150` rewrites the value with no sink
frame, stating in its comment that a reassignment carries no declared annotation
to serve as one — true of the *statement*, not of the *target*, whose annotation
is recorded and available one layer up. The three extension-side walks with a
`reassign` arm (`extension-tool-reachability.ts:86–88`,
`invoke-static-checks.ts:129–131`, `subagent-fn-static-checks.ts:79–81`) descend
into the value for their own concerns. That is every `reassign` arm in `src/`.

**The runtime is not a net.** `writeBinding` (`lexical-environment.ts:361–373`)
finds the nearest slot and branches on `slot.mutable` alone; a slot carries a
value and a mutability flag and no type. `executeBody`'s reassign case
(`statement-executor.ts:1469–1478`) discards the returned `WriteResult`. On the
compound path `applyCompound` (`:569–588`) coerces a non-`number` operand to `0`
before applying the operator, so `n += "hi"` on a numeric `n` produces a number
rather than raising — the value is wrong rather than refused. Read from source,
not executed.

**Bug 0083 made the omission consequential.** Since 0.55.0 the `let` arm records
the declared annotation rather than the initialiser's inferred type
(`type-layer-checks.ts:640–643`). The recorded type is therefore an assertion
about the binding for the rest of its scope, checked once at the initialiser by
`checkLetRhsCompat` (`:609`) and never again. Every measured (d) row is that
assertion going stale: the receiver gate, the `array.join` element precondition
and the typed-`let` sink all read the map and get the annotation, while the slot
holds something else.

**The registry is the blocking constraint, not the code.** The engine
(`checkCompatible`), the emitter shape (`checkLetRhsCompat`), the unresolvable
deferral and the walk position all exist. What does not exist is a code the
emission may carry. `theta/parse/immutable-rebinding`'s *Trigger* is
"Reassignment of a `let` (non-`mut`) binding" (`code-registry-parse.md:28`) —
satisfied by mutability, and its *Message*
(`cannot reassign immutable binding '<name>'`) is wrong for a compatibility
failure and unrewordable under DIAG-4. `theta/parse/let-rhs-type-mismatch`'s
*Trigger* is "The RHS initialiser of a typed binding `let x: T = expr`" (`:54`) —
scoped by both position (initialiser) and form (typed), and the measured rows
include inferred targets, which even a position-only widening would leave out.
Under DIAG-2 (`diagnostic-shape.md:72`) neither can be stretched by
implementation.

## Why it matters

- **A declared constraint is enforced in neither phase.** Measured: an
  `integer`-annotated binding accepts a `string` at parse (`[]`) and at runtime
  (`{ accepted: true }`, slot reads back `"hi"`). The annotation is the author's
  statement of intent and the parser's basis for every later check on that
  binding, and nothing tests a write against it.
- **The recorded type becomes a false premise for other checks.** Measured (d):
  `unknown-method` fires on a receiver the binding no longer holds; a
  `string`-recorded binding holding `1` passes `.length()`; a typed `let`
  compares against the recorded `integer` rather than the `string` in the slot.
  Each is a check reaching the wrong verdict because its input is a stale
  assertion, and the fix for each is at this position, not at theirs.
- **All five compound forms are silent, including the narrowing case.**
  `bindings.md:12` names `+=`, `-=`, `*=`, `/=`, `%=` in the same sentence as the
  compatibility clause. `n += 1.5` on an `integer` binding is the exact failure
  `theta/parse/integer-narrowing` exists for, and it reports nothing.
- **The obligation is the corpus's own canonical referent.** `bindings.md:12`
  ends by calling this compatibility relation "the canonical referent of every
  'same rules as `let`' cross-link elsewhere in the spec". A reader following any
  such cross-link arrives at a sentence whose own site is unenforced, and at
  `type-system.md:27`'s position list, which does not include it.
- **A shipped consequence, adjudicated and correct.** Bug 0079's static gate
  classifies an interpolation by provenance and reads the binding type the `let`
  arm recorded (`type-layer-checks.ts:644–661`, `:1325–1336`). A `let mut r =
  Ok(1)` later reassigned to a non-`Result` therefore still draws
  `theta/parse/interpolated-result` at an interpolation of `r` — measured, rows
  (f) 2–4. A reviewer on that fix called this a false positive; 0079's
  orchestrator **rejected** the finding on the ground that under
  `bindings.md:12` the reassigning program is already ill-typed, so the recorded
  static type is the `Result` the registered *Trigger* names ("`${expr}`
  interpolation whose `expr` has Theta static type `Result<T, E>`",
  `code-registry-parse.md:72`), and the suggested `reassignedAway` set would
  contradict that rule, contradict bug 0083's pinned "declared type governs", and
  introduce false negatives. That disposition is recorded at 0079 residual (ii)
  and stands; it is not reopened here. The observable it leaves is this report's
  concern: because the reassignment check is missing, the program that should be
  refused for its reassignment is instead refused for its interpolation — and, in
  the mirror rows (f) 6–7, a `Result` written into a binding recorded as
  `integer` is invisible to the static gate and reaches 0079's runtime fallback
  instead. The interaction is a reason this gap matters, not a defect of 0079.
- **The position is reachable from ordinary code.** Every committed example that
  reassigns does so inside a loop body (`docs/examples/`, seven statements), the
  shape authors write for accumulators and bounded refinement loops. Those seven
  are all compatible writes, so no shipped example is currently ill-typed — which
  also means a fix must keep them admitted, including the two whose target type
  is inferred from a `?`-unwrapped query.
- **Nothing in the suite scores it.** No test drives a type-incompatible
  reassignment in either direction. The nearest rows pin mutability
  (`tests/bindings.test.ts:50–71`, `tests/lexical-environment.test.ts:198–213`)
  or a *compatible* write (bug 0083's pin,
  `tests/let-annotation-recorded-binding-type.test.ts:328–343`), so the silence
  measured here is unwitnessed in both directions.

## Non-goals

- **What type a binding carries after a reassignment.** Bug
  [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md)'s subject,
  and the ordering dependency in §Status. This report is about the write; 0090 is
  about the read that follows it. The two interact (§Fix (d)) and are not merged:
  0090's question is answerable without an emitter, and this report's is not
  answerable without 0090's answer.
- **The `fn`-argument position.** Bug
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)'s
  subject. Different position, different registered code, opposite defect shape;
  a resolution there does not reach this site and vice versa.
- **`theta/parse/immutable-rebinding`'s own behaviour.** It fires correctly on
  the measured control and is out of scope except as the row whose *Trigger* does
  not cover this position.
- **Bug 0079's static gate and its adjudicated reassignment disposition.** Rows
  (f) 2–4 are within the registered *Trigger* on the recorded type, as 0079's
  residual (ii) determines. This report records the observable and does not
  propose a `reassignedAway` set or any other narrowing of that gate.
- **`applyCompound`'s numeric coercion** (`statement-executor.ts:574–575`).
  Whether a compound operator should raise rather than coerce a non-numeric
  operand is a runtime-semantics question with its own text and its own code
  decision; here it is evidence that the runtime is not a net, not the subject.
- **A runtime check at `writeBinding`.** `bindings.md:12`'s obligation is stated
  over static types and `type-system.md:50` places every sibling site's
  diagnostic at parse time. A slot carries no type today
  (`lexical-environment.ts:212–373`), so adding one is a separate design.
- **The `?`-unwrapped query RHS's inferred type.** `refine.theta:17`'s
  reassignment is admitted today and must stay admitted; whether its target's
  type is statically resolvable is a property of the inference layer, and the
  deferral arm (`type-compat.ts:412–416`) is what a fix relies on rather than
  changes.

## Fix

**Not settled. This report exists to pin the DIAG-2 disposition first**, and the
decision precedes any code: there is no code an emitter may carry until the
registry answer is chosen. Six questions, of which (d) orders the work.

**(a) Route 1 — mint a row.** A new `theta/parse/*` row in
`docs/spec_topics/diagnostics/code-registry-parse.md`, phase `type`, severity
`E`, whose *Trigger* names the reassignment RHS against the binding's
declared-or-inferred type with the resolvability qualifier row `:54` and row
`:46` already carry. Consequences, each verified against the corpus:

- The *Message* is new text, so it is fixed at mint time and unrewordable
  afterwards under DIAG-4 (`diagnostic-shape.md:74`). Reusing `<name>`,
  `<expected>` and `<actual>` keeps the row inside the closed placeholder surface
  with no closure edit (`placeholder-rendering-a.md:7`, `:11`;
  `placeholder-rendering-b.md:10`) — the check bug 0031's fix record performs for
  its own row.
- `docs/reference/diagnostics.md` gains a row: the page transcribes Code / Sev /
  Phase / Message (`:3–9`), so a new code reaches it and a *Trigger* change does
  not.
- `type-system.md:27` gains the position in its `⊑` enumeration and
  `type-system.md:50` (TYPE-9) gains the site with its code, mirrored at
  `docs/reference/type-system.md:64–69`, which today names exactly three sites.
  This is the edit set bug 0031 made for the constructor-field position.
- The row carries a DIAG-2 asserting-test obligation
  (`tools/closing-gate/index.js:701–710`), which the witness below discharges.
- Distinct codes for the plain and compound forms are not needed: one row covers
  both, as `bindings.md:12` states both in one sentence.
- GOV-15: a code addition is carve-out-covered within a theta 1.x minor for
  inputs that did not previously emit it
  (`source-language-stability.md:25`), which is every input measured above.

**(b) Route 2 — widen `let-rhs-type-mismatch`'s *Trigger*.** Replace the
initialiser scoping at `code-registry-parse.md:54` with one covering both the
initialiser and a reassignment RHS. Consequences:

- No new code, no `docs/reference/diagnostics.md` edit (no *Trigger* column
  there), and no placeholder-closure question. GOV-15 disposes a *Trigger* change
  as an addition for the inputs newly brought into the code's emission set
  (`source-language-stability.md:25`), so it is equally admissible in a 1.x
  minor.
- The *Message* is fixed and unrewordable:
  `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>`.
  It would render the word **initialiser** at a reassignment. DIAG-4 defers the
  reword to theta 2.0, so this route ships a message that misdescribes its own
  trigger for the lifetime of theta 1.x. That is the decisive cost, and it is
  visible in the suite as well as in the author-facing output: the string is
  asserted verbatim at `tests/type-compat.test.ts:249–251` and through the
  registry lookup at `tests/ctor-field-type-check.test.ts:251–256`.
- The widening must also drop the *typed*-binding scoping, since the measured
  rows include inferred targets (`let mut n = 1` / `n = "hi"`). The current
  Trigger is scoped on both axes.
- The row is already emitted at the `let` sink by `checkLetRhsCompat`
  (`type-compat.ts:431–441`), so a widening keeps one emitter function serving
  two positions with one Message — the coupling that produces the wording defect.

**(c) The narrowing sub-case either way.** `checkLetRhsCompat` splits a
`number`-into-`integer` failure off to `theta/parse/integer-narrowing`
(`type-compat.ts:417–429`), a row already registered
(`code-registry-parse.md:24`, *Trigger* "`number` value used where `integer` is
expected") and already fired from the initialiser. Measured:
`let mut n: integer = 1` / `n = 1.5` is silent today and
`let n: integer = 1.5` reports that code. A fix routes the reassignment's
narrowing case to the same existing code under both routes — no new row for it,
and no *Trigger* question, since the narrowing row is not position-scoped. State
this explicitly, because it is the one sub-case where the two routes agree.

**(d) Ordering against bug 0090 — binding.**
[0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md) adjudicates
whether a reassignment re-derives the binding's recorded type. Under its
disposition 1 (declared-or-inferred governs) this report's check is what makes
that disposition sound, by 0090's own §Fix text. Under its disposition 2
(re-derive) a binding's type follows its last write, so a compatibility check
against itself cannot fail and `bindings.md:12`'s clause is deleted rather than
implemented — 0090's §Fix constraint 2 states exactly that. **0090's adjudication
lands first.** Two further couplings: both fixes edit `bindings.md:12`, one
physical line; and 0090's disposition 2 would re-record at
`type-layer-checks.ts:665–667`, the same three lines a check here occupies.

**(e) Line-citation drift in `bindings.md`.** The page is 36 lines and the
**Reassignment** paragraph is the single line `:12`. Extending that sentence in
place shifts no citation. Inserting a new paragraph after it shifts every later
line: the inbound line citations at HEAD are `:10` ×2
(`0062-grammar-trailing-trigger-table-omits-equals.md`), `:25` ×2
(`0049-grammar-member-access-head-covers-bracket-indexing.md`) and `:36` ×4
(`0084-increment-decrement-check-dead.md`), all in `docs/bugs/`, plus `:12`
itself in 0090 (×16) and in this report. A resolution that adds a paragraph
re-pins the six `:25` / `:36` citations in the same commit.
Bug 0090's own §Fix carries the same constraint over the same citations, which is
another reason the two edits coordinate.

**(f) The controls a fix must preserve.** Gated silent today and required silent
after: the seven committed reassignments in `docs/examples/`
(`fan-out-reviews.theta:34`; `ralph.theta:11`; `ralph-inline.theta:38`;
`refine.theta:12`, `:17`; `refine-inline.theta:29`, `:34`), which
`tests/committed-fixture-parse-gate.test.ts` gates at zero diagnostics over all
32 shipped `.theta` — 34 cells (one discovery cell, 32 fixture cells, one
seeded-invalid cell), green at this HEAD on my own run. The two `draft = @\`…\`?` rows are the ones that reach the
unresolvable-operand deferral (`type-compat.ts:412–416`); a check that reports on
an unresolvable target refuses a shipped example, so the deferral is
load-bearing, not incidental. Also required unchanged: bug 0083's pin
(`tests/let-annotation-recorded-binding-type.test.ts:328–343`), a compatible
write; the mutability pins (`tests/bindings.test.ts:50–71`,
`tests/lexical-environment.test.ts:198–213`), which stay green as long as the
compatibility check is not wired into `checkReassignment`'s current signature;
and bug 0079's witness (`tests/interpolated-result-gate.test.ts`), whose cells do
not reassign.

**Placement, once the route is chosen.** The check belongs in the type phase at
`type-layer-checks.ts:665–667`, where the recorded target type, `typeOf`, the
`TypeEnv` and the diagnostics sink are all in scope, reusing `checkCompatible`
and the `"unknown"` deferral through a seam shaped like `checkLetRhsCompat`
(`type-compat.ts:403–442`). The compound forms resolve the RHS the same way; the
operator's own numeric-operand rule is a separate question (§Non-goals). The
structural-parse site (`bindings.ts:85–100`, `theta-document.ts:2027–2053`)
carries no types and stays as it is, so `theta/parse/immutable-rebinding` keeps
firing from where it fires today. A fix states whether an immutable target
reports both codes or only the mutability one — measured, the immutable control
reports only `theta/parse/immutable-rebinding` today.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `parseThetaDocument` call, so the witness is an ordinary parse-level test
file over `parseDoc`, plus the one `writeBinding` unit call of (e). Required: the
two primary rows and both controls; every compound form; the composite and
nominal rows with their controls; the narrowing row of (c) against its
initialiser control; the (d) rows, which pin that the consequence moves to the
reassignment statement and stops surfacing as `unknown-method`; the (f) controls
including the two query-inferred example shapes; and the bug 0079 interaction
rows, which pin that the adjudicated disposition is unchanged by the fix.
Expected messages read from the registry's *Message* column per DIAG-4, never
copied prose.

## Provenance

- Origin: the bug 0079 fix (0.69.0, commit `a410f727`), whose round-2 review
  raised a reassigned-`let mut` correctness claim that the orchestrator rejected
  and recorded instead as residual (ii) of that report's `## Fix (0.69.0)` record
  (`docs/bugs/0079-interpolated-result-unemitted-private-encoding-rendered.md:173–186`),
  naming the absent check, the two probes, the registry gap and the bug 0050
  mirror. Bug 0090's §Non-goals had already recorded the gap as unfiled. This
  report adds what neither states: the full measured matrix (both primary rows,
  all five compound forms, every primitive pair, the composite and nominal rows,
  each against a checked-position control), the wrong-site / wrong-code and
  laundering rows, the measured runtime write, both directions of the bug 0079
  interaction, the complete inventory of `reassign` arms in `src/`, the two DIAG-2
  routes with their verified consequences, the DIAG-4 wording cost of the
  widening route, the GOV-15 disposition of each, the bug 0090 ordering
  constraint, and the `bindings.md` citation-drift set.
- Spec: `docs/spec_topics/bindings.md:12` (the obligation; the 36-line page in
  full); `docs/spec_topics/type-system.md:27` (the `⊑` position enumeration),
  `:29` (the AJV safety net), `:50` (TYPE-9), `:52` (TYPE-10 nominality);
  `docs/spec_topics/diagnostics/code-registry-parse.md:28`
  (`immutable-rebinding`), `:46` (`object-field-type-mismatch`, bug 0031's row),
  `:54` (`let-rhs-type-mismatch`), `:72` (`interpolated-result`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` (the closure),
  `:11` (category 1);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:10` (category 5);
  `docs/spec_topics/governance/source-language-stability.md:25` (the GOV-15
  diagnostic-registry carve-out). User-facing mirrors:
  `docs/reference/diagnostics.md:3–9` (the transcribed-columns statement), `:74`,
  `:92`, `:100`; `docs/reference/type-system.md:64–69` (the TYPE-9 mirror);
  `docs/reference/grammar.md:495–497` (the restatement).
- Implementation evidence at `a410f727`:
  `src/parser/type-layer-checks.ts:573–575` (`typeOf`), `:595–643` (the `let`
  arm, `checkLetRhsCompat` at `:609`, the record at `:640–643`), `:644–661` (bug
  0079's `resultBindings` write), `:665–667` (**the reassign arm**), `:671`,
  `:677`, `:688` (nested-block map copies), `:738` (`fn` parameters), `:1182`
  (the comprehension variable), `:1191–1192` and `:1271` (bug 0079's
  interpolation check), `:1325–1336` (`interpolationIsResult`);
  `src/parser/type-compat.ts:403–442` (`checkLetRhsCompat`, the deferral at
  `:412–416`, the narrowing arm at `:417–429`), `:452` (`checkFnArgCompat`, bug
  0050's); `src/parser/bindings.ts:73–76`, `:85–100` (`checkReassignment`);
  `src/parser/theta-document.ts:2027–2053` (`buildReassign`);
  `src/parser/static-type-inference.ts:129–131`;
  `src/parser/query-schema-resolve.ts:143–150`;
  `src/extension/extension-tool-reachability.ts:86–88`;
  `src/extension/invoke-static-checks.ts:129–131`;
  `src/extension/subagent-fn-static-checks.ts:79–81`;
  `src/runtime/lexical-environment.ts:212` (the class), `:331` (`defineLocal`),
  `:361–373` (**`writeBinding`**), `:548` (`buildEnvironment`);
  `src/runtime/statement-executor.ts:569–588` (`applyCompound`), `:1469–1478`
  (the executor's reassign case);
  `tools/closing-gate/index.js:701–710` and
  `tools/closing-gate/live-corpus.js:51–59` (the DIAG-2 reconciliation arm and
  the filter that excludes it from the gating set).
- Test evidence at `a410f727`: `tests/bindings.test.ts:50–71`;
  `tests/lexical-environment.test.ts:198–213` (cka-6, mapped at
  `docs/plan_topics/coverage-matrix.md:130`);
  `tests/let-annotation-recorded-binding-type.test.ts:328–343` (bug 0083's pin);
  `tests/committed-fixture-parse-gate.test.ts` (the shipped-`.theta` gate);
  `tests/interpolated-result-gate.test.ts` (bug 0079's witness);
  `tests/live-corpus-release-gate.test.ts:40` (the hard-fail filter).
- Examples surveyed at `a410f727`: the committed `.theta` / `.thetalib` corpus
  under `docs/` (20 `.theta`, 1 `.thetalib`). The whole-repo committed set is 32
  shipped `.theta`, each a cell of the parse gate (whose walk filters on
  `.theta`, `tests/committed-fixture-parse-gate.test.ts:55`), plus 2 `.thetalib`
  the gate does not walk. The seven reassignment statements
  are `docs/examples/fan-out-reviews.theta:34`, `ralph.theta:11`,
  `ralph-inline.theta:38`, `refine.theta:12`, `:17`,
  `refine-inline.theta:29`, `:34`, all inside a loop body.
- Reproduction: scratch vitest files at `a410f727` — the 33 parse rows quoted
  above over `parseDoc`, covering §Reproduction (a)–(d) and (f) with their
  controls, plus one `writeBinding` unit call for (e). Run on the outputs quoted
  above, then deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other bug document
  are unmodified by this filing.
- Not personally re-measured, sourced from bug 0079's fix report: the review
  round in which the reassignment finding was raised and the orchestrator's
  reasoning for rejecting it (recorded verbatim in that report's residual (ii),
  which this document quotes rather than re-derives), and the runtime panic bug
  0079's half (b) raises for §Reproduction (f) rows 6–7. Every parse observable
  and the `writeBinding` result above are my own measurements at this HEAD.

## Coordination note — bug 0050 landed (0.77.0)

0050's fn-argument sink now READS the recorded binding type this report's
defect corrupts: a type-changing `let mut` reassign leaves the record
describing the ORIGINAL initialiser, so `let mut x = 1` / `x = "a"` /
`g(x)` against `fn g(s: string)` emits `theta/parse/fn-arg-type-mismatch:
… expected string, got integer` while the runtime passes `"a"` — the wired
`let-rhs` sibling misjudges the identical read today (0050's fix record,
residual 10). Whatever disposition this report's adjudication takes (ordered
behind bug 0090), it now owes the fn-argument sink the same answer.
## Fix (0.138.0)

**The DIAG-2 adjudication.** §Fix **route 1 — mint a row**, on §Fix (b)'s own
decisive ground: route 2 would ship
`let binding '<name>' initialiser type mismatch: …` at a position that has no
initialiser, and DIAG-4 (`diagnostic-shape.md:74`) makes the *Message* normative
and defers the reword to theta 2.0, so that route misdescribes its own trigger
for the lifetime of theta 1.x; it would also have to drop both axes of the
current *Trigger* scoping. The minted row is
`theta/parse/reassign-rhs-type-mismatch` (Sev `E`, phase `type`), Message
`reassignment of '<name>' type mismatch: expected <expected>, got <actual>`.
The placeholder surface stays closed with **no** closure edit, reusing named
sub-rules rather than coining: `<name>` is admitted by
`placeholder-rendering-b.md` §5 *Source-derived placeholders*, `<expected>` and
`<actual>` by `placeholder-rendering-a.md` §1 *Static-type placeholders* — the
check bug 0031's record performs for its own row. GOV-15
(`source-language-stability.md:25`) disposes it as a code **addition**, in-scope
in a theta 1.x minor for inputs that did not previously emit it, which is every
row of §Reproduction. §Fix (c)'s narrowing sub-case routes to the
already-registered `theta/parse/integer-narrowing` (`code-registry-parse.md:24`),
which is not position-scoped, so no second row and no *Trigger* question. §Fix's
open question about an immutable target is settled as **both codes**, measured
and stated in the *Trigger*: the mutability row is phase `parse` and this one
phase `type`, and neither *Trigger* excludes the other.

**§Fix (d) is closed by 0090's landed adjudication, not re-derived here.**
`docs/spec_topics/bindings.md` §Reassignment, anchor `#reassignment-binding-type`
— "A reassignment does not change the binding's type: every later reference
resolves the type the binding was declared or inferred with, for the whole of the
binding's scope." So this report's premise survives, the target's recorded type is
what the RHS is judged against, and the check does **not** re-record it (writing
the map is 0090's rejected disposition 2). §Fix (e)'s `bindings.md` collision
worry is discharged: the page is still 36 lines and this fix edits line 12 in
place.

- **What shipped:**
  - `src/parser/type-compat.ts` — `checkReassignRhsCompat`, shaped on its two
    neighbours `checkLetRhsCompat` / `checkParamsDefaultCompat`: `"compatible"`
    and `"unknown"` defer (the Unresolvable-operands paragraph), an
    `"integer-narrowing"` failure routes to the registered narrowing row, and an
    incompatible pair emits the minted row. Appended, so no existing line moves.
  - `src/parser/type-layer-checks.ts` — the type phase's `case "reassign"` arm
    now reads the target's recorded type (`bindings.get`), resolves the RHS
    (`this.typeOf`), gates **both** sides on `containsWithheldBinderType` (the
    file's ninth such gate pair), emits at `stmt.range`, and keeps the existing
    walk of the assigned value. It never writes `bindings`. The structural-parse
    site (`bindings.ts`, `buildReassign`) and the runtime (`writeBinding`) are
    untouched — both are §Non-goals — so `theta/parse/immutable-rebinding` keeps
    firing from where it fired.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the minted row, with
    the resolvability qualifier rows `:46` / `:56` carry, the plain form and all
    five compound forms named, and the immutable-target both-codes disposition
    stated.
  - `docs/reference/diagnostics.md` — the user-facing mirror (Code / Sev / Phase /
    Message only, per that page's `:3–9` statement).
  - `docs/spec_topics/type-system.md` — the reassignment RHS added to `:27`'s `⊑`
    position enumeration (closing the one-directional cross-link §Why it matters
    names) and to TYPE-9 (`:50`), whose count moved **Four → Five**; page still
    55 lines.
  - `docs/reference/type-system.md` — the TYPE-9 mirror, same site and code.
  - `docs/spec_topics/bindings.md` — the obligation clause at `:12` now names the
    code it routes to, edited in place; page still **36 lines**, 0090's anchor
    defined exactly once, and the inbound `:25` / `:36` citations unmoved.
  - `tests/reassign-rhs-type-compat.test.ts` (new, 42 cells) — the witness.
  - `tests/live/reassign-rhs-type-mismatch-live-cell.test.ts` (new, H8a)
    — the live registration cell, carrying the literal token **the standalone live cell** in
    place of a numeric H8a id.
  - `tests/reassignment-binding-type-governs.test.ts` (b1, c5) and
    `tests/type-name-as-value-refusal.test.ts` (a8) — the three pre-authorized
    existing-cell flips, subjects preserved (see *Pre-authorized flips* below).
  - Twelve further files (ten `tests/**`, `src/runtime/wire-translation.ts`,
    `tests/let-annotation-recorded-binding-type.test.ts`) — **comment-only**
    re-derivation of `src/parser/type-layer-checks.ts:N` line citations the
    wiring shifted (+1 at/after old `:68`, +30 at/after old `:1317`). Every hunk
    touches zero executable line and zero assertion, and every one of those files
    keeps its own line count, so the shift does not cascade.
- **Gates:** witness `npx vitest run tests/reassign-rhs-type-compat.test.ts` →
  42 passed; full default suite `npx vitest run` → **333 files / 6136 tests
  passed** (baseline at `769164b8` is 332 / 6094; the delta is exactly this fix's
  one new default-suite file); `npm run typecheck` clean; `npm run lint` clean;
  `tests/committed-fixture-parse-gate.test.ts` → 36 cells green, the corpus-wide
  discharge that no shipped `.theta` moves; `wc -l` 36 (`bindings.md`), 55
  (`type-system.md`), 343 (`tests/let-annotation-recorded-binding-type.test.ts`,
  pin block still `:328–343`). Live: the new H8a **the standalone live cell** cell green through
  the real production load path and red-proven in both directions; H9a acceptance
  both files **11/11** through the real `pi -p`, with the empty-capture stderr
  gate holding on all ten spawns.
- **Review:** 2 rounds. Round 1 (`bug-fix-reviewer`) — two findings: (1)
  *correctness*, the new arm's WHY-comment claimed `buildReassign` refuses an
  unknown target and that the `undefined` branch is unreachable; both are false
  (`buildReassign` calls `checkReassignment` only for a known-**immutable**
  target, and an undeclared reassignment target measures `[]`); (2) *test*, the
  witness's two withheld-binder cells could not red on removal of the new gate
  pair, because a top-level withheld record is an unresolvable `named` that the
  emitter's own `"unknown"` arm defers anyway — so the ledger's red-provability
  claim was false and the gate pair was unpinned against `AGENTS.md` §"Verify
  both directions". Plus one prose residual (a banned word). The round-1 fixer
  (`bug-fix-fixer`) corrected the comment length-neutrally (no citation moved)
  and added four cells — `g6` / `g7` pin the RHS-side and target-side gates with
  a withheld binder **inside a composite**, where the kind mismatch is decided
  before the element resolves so only the arm gate defers, each with an emitting
  twin — with a two-direction red proof and a blob-hash-verified restore. Round 2
  (`bug-fix-reviewer-fast`) — **CLEAN**, both findings reproduced rather than
  trusted. One **pre-review citation correction** ran before round 1 (not a review
  round; numbering unaffected): the implementation had grown
  `tests/let-annotation-recorded-binding-type.test.ts` to 344 lines, drifting the
  `:328–343` citations this report (×4), 0090 (×4) and two witness files carry;
  the pin's comment was re-wrapped at equal length, the file is back to 343 lines,
  comment-only, 19/19 green.
- **Verification:** PASS. (i) The witness genuinely witnesses: with the
  `checkReassignRhsCompat` push deleted so the arm is again a walk plus a return
  (blob `535e867e81b55abf6a10ae5cd734a56781148f03`), 31 cells red — 28 in the new
  witness plus the three pre-authorized flips b1 / c5 / a8 — each for the right
  reason (the expected code absent, or the list one code short), while every
  deferral cell stayed green; restored blob-hash-verified to
  `cf8f7f6cc3d58311a33e2236530b56ed1207312c` and re-run 111/111 green. (ii) Full
  default suite green at the expected delta. (iii) Live: the H8a the standalone live cell cell reds
  under the same neutralisation (the mismatched theta **registers**) and passes
  restored, and H9a is 11/11 with an empty stderr capture on every spawn; no live
  red needed attribution. (iv) Lint and typecheck clean. Spot-checks: the emitted
  Message is placeholder-for-placeholder identical to the registry *Message*
  column (DIAG-4), no placeholder-rendering page is in the diff, and the one
  `scratch` hit inside the diff is pre-existing methodology prose.
- **Pre-authorized flips, re-derived under this report's authority and listed for
  ratification:**
  1. `tests/reassignment-binding-type-governs.test.ts` **b1** — `[]` →
     `["theta/parse/integer-narrowing"]`. Authority: 0090's fix record residual 2
     ("Two witness cells assert an absence 0115 will legitimately move"), in
     exactly the named direction. That residual's second-order warning is
     honoured: b1's new code list is list-identical to the rejected disposition-2
     signature it was red-proven against, so b1 now also **pins the diagnostic's
     position** (the reassignment statement, not the later reference), which is
     what restores its discrimination. The rule it locks is unchanged.
  2. same file, **c5** — `[]` → `["theta/parse/reassign-rhs-type-mismatch"]`. Same
     authority; c5 is the cell 0090's residual names as the one that keeps
     discriminating by code alone (disposition 2's code there is
     `theta/parse/non-string-array-join`).
  3. `tests/type-name-as-value-refusal.test.ts` **a8** —
     `["theta/parse/type-as-value"]` →
     `["theta/parse/reassign-rhs-type-mismatch", "theta/parse/type-as-value"]`.
     Bucketed against three independent doc authorities: that file's own group (c)
     already pins the identical co-firing at the two sibling wired sinks (c2,
     `let out: string = P` → `[let-rhs-type-mismatch, type-as-value]`, and the
     constructor-field row), GOV-15's addition direction, and §Expected, which
     carves out no type-name RHS. The cell keeps its group-(a) subject and its
     `registers(doc) === false` assertion.
- **Where this report turned out to be wrong.** §Fix's witness list asks the (d)
  rows to pin that the consequence "stops surfacing as `unknown-method`". Under
  0090's landed rule the recorded type does not move, so it does not stop:
  measured `let mut n: number = 1` / `n = "x"` / `n.length()` →
  `["theta/parse/reassign-rhs-type-mismatch", "theta/parse/unknown-method"]`. The
  new row is an **addition** at the offending statement and the method row remains
  correct; the witness pins the addition. §Affected's line citations are likewise
  0.69.0-era throughout and were re-verified by symbol, not by line — the reassign
  arm is at `:1315–1345` after this fix, `let-rhs-type-mismatch`'s registry row at
  `:56`, and TYPE-9 named four sites before this fix rather than the three the
  report describes.
- **The 0050 coordination note is answered.** That note states this adjudication
  "owes the fn-argument sink the same answer". Measured after this fix,
  `fn g(s: string)` / `let mut x = 1` / `x = "a"` / `g(x)` reports
  `theta/parse/reassign-rhs-type-mismatch` at the reassignment **and** the
  pre-existing `theta/parse/fn-arg-type-mismatch` at the call, so the write is
  refused at the statement the spec makes illegal and 0050's residual-10 stale
  read is never a program's only diagnostic. The stale-read mechanism itself is
  0050's subject and is untouched.
- **Residuals:**
  1. **Inbound line citations in `docs/bugs/` are shifted by this fix and were
     deliberately not re-pinned** — every one lives in another report's document,
     which this lane may not edit. Measured unique citations affected: 42 ×
     `code-registry-parse.md:N` for N ≥ 57 (+1), 46 ×
     `reference/diagnostics.md:N` for N ≥ 103 (+1), the `reference/type-system.md`
     TYPE-9 mirror (+3, 202 → 205), 71 × `type-layer-checks.ts:N` for N ≥ 1317
     (+30) and a further 195 × `type-layer-checks.ts:N` for 68 ≤ N < 1317 (+1). No
     citation outside `docs/bugs/` is affected: a `grep -rlE` over `docs/`
     excluding `docs/bugs/` returns nothing. This is the ordinary consequence of a
     DIAG-2 mint plus a `src/` edit, the species 0090's record carries as its own
     residual 4.
  2. **Three in-tree citations were already stale before this fix and were left
     alone** — two in `tests/live/live-production-acceptance.test.ts` (`:1237`,
     `:1006`) and one further spot: shifting an already-wrong number produces a
     differently-wrong number, not a fix. Out of remit.
  3. **An immutable reassignment target still draws no mutability diagnostic in
     two shapes** — a `for` loop variable and a `fn` parameter. Measured:
     `for x in [1, 2] { x = "b" }` and `fn g(s: integer) { s = "a" }` each draw the
     new **type** row alone and no `theta/parse/immutable-rebinding`. This fix adds
     only the type verdict; the mutability silence is bug 0126's PIN e2 observation
     and is not this report's subject. Witness cells `f2` / `f3` state it in place.
  4. **A compound write's own operand rule is unchanged.** The check judges the RHS
     expression against the target's type, which is what `bindings.md:12` states
     for the plain and compound forms alike; `applyCompound`'s numeric coercion
     (`statement-executor.ts`) remains a §Non-goal.
- **Discharge notes appended:**
  [0090](./0090-let-mut-reassignment-type-rederivation-unspecified.md) — its
  residual 2 (the two pre-authorized witness cells) is discharged by this fix.
- **Pinned dispositions / non-goals:** route 2 (widen
  `theta/parse/let-rhs-type-mismatch`'s *Trigger*) is **rejected**, and its DIAG-4
  wording cost is the recorded reason. Out of scope and unchanged: what type a
  binding carries after a reassignment (0090, landed and cited here); the
  `fn`-argument position's stale read (0050); a runtime check at `writeBinding`;
  `applyCompound`'s coercion; `theta/parse/immutable-rebinding`'s own behaviour and
  the two shapes where it does not fire (residual 3); 0079's adjudicated
  interpolation disposition, measured unmoved in both directions.
