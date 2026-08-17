# Bug 0192 — `checkTypeLayer` (`type-layer-checks.ts:235–259`) starts the top-level walk with an empty bindings map and threads the frontmatter `params:` fields in as NAMES only (`collectLocalBinderNames`, `:245`), so a `params:`-declared binding carries no declared type into the walk: twelve registered `E`-severity type-layer codes are unreachable on a params-typed read anywhere in the body, where the byte-identical `fn`-parameter form reports all twelve, and `theta/parse/non-array-iterand` fires falsely at `E` on `for y in xs` over a `params: xs: array<string>` — the third position of the erasure family after bug 0136's member arm (fixed 0.106.0) and bug 0126's plain-`for` loop variable

- **Status:** open. §Fix is constraint-pinned, not settled: the route choice
  between the two existing declared-type converters, and the GOV-15 enumeration
  the flip needs, are in-run decisions. No ordering dependency blocks this and it
  blocks nothing; the coordination constraints against
  [0126](./0126-plain-for-binds-no-loop-variable.md) — the two defects sit in
  the same file at disjoint arms — are in §Fix (e).
- **Sev/Diff estimate:** S1/D3 — twelve registered error-severity type-layer
  rejections are unreachable on every read of a `params:`-declared binding while
  the theta registers and runs, and `params:` is the sole typed-input surface of
  a theta (every slash invocation, every `invoke(...)`, every registered-tool
  call arrives through it), so declared constraints go unenforced on the primary
  authoring surface; the same missing type also rejects a spec-legal
  `for y in xs` over an `array<string>` param outright at `E` with registration
  denied. D3 because the fix must adjudicate between two already-shipped
  declared-type converters (`annotationToCompatType`,
  `paramsDeclaredCompatType`) whose declines differ, must widen the
  `checkTypeLayer` signature that
  `src/parser/theta-document.ts:899–903` feeds, engages GOV-15 in both the
  addition and the removal direction across thirteen registry rows, re-pins bug
  0136's witness row x20 under its own authority, and re-runs the whole-corpus
  parse gate against seventeen shipped fixtures that declare `params:`.
- **Kind:** defect — implementation. The spec is not silent here; three elements,
  carrying different standing:
  1. **Twelve registered checks are unreachable at a position the spec puts on
     the same footing as `let x: T` and a `fn` parameter.**
     `docs/spec_topics/type-system.md:15` — "The same type grammar applies in
     every type-annotation position: schema fields, frontmatter `params:`,
     `let x: T`, function parameters, and `@<T>`...`` explicit query schemas" —
     and `:27` lists the positions the `⊑` relation governs. `:48` states the
     only deferral licence: "when either side of a compatibility check is past
     the parser's static view", with two named examples (a binding whose RHS
     depends on an unregistered Pi-tool schema; an `invoke` against a callee that
     produced `theta/load/callee-has-errors`). A `params:` field's declared type
     is written in the file, resolves whole-file
     (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:58`), and `parseParams`
     already converts it to a `CompatType` at the same parse for any field that
     declares a default (`src/parser/params.ts:405`, reached for a defaulted field
     only — `:349–350` skips the rest). It is not past the parser's static view,
     so the deferral is unlicensed by `:48`.
  2. **A spec-legal program is rejected.**
     `docs/spec_topics/control-flow.md:13` admits `for x in xs` for any
     `array<T>` iterand. Measured: `params: xs: array<string>` with
     `for y in xs { y }` draws an `E`-severity `theta/parse/non-array-iterand`,
     and an `E`-severity `theta/parse/*` denies registration (`hasLoadParseError`,
     `src/extension/production-composition.ts:2214–2221`; the registration
     predicate at `:1729`). The message renders the binding's own identifier in a
     `<type>` position (`got xs`), which
     `docs/spec_topics/diagnostics/placeholder-rendering-a.md:11–13` does not
     admit — the category-1 rule requires re-serialising a Theta static type in
     source-grammar form, and a value binding's name is not one.
  3. **The declared type reaches the call site and is discarded there.** The
     record `checkTypeLayer` is fed from carries both halves:
     `BypassParamsField.wireName` and `BypassParamsField.type`, "the field's
     declared surface type" (`src/binder/binder-envelope.ts:167–170`), set
     together at the frontmatter read (`src/parser/frontmatter.ts:794–795`).
     `theta-document.ts:902` projects `wireName` alone. This is a threading gap,
     not a missing input.
- **Related:**
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **fixed (0.106.0)**, the origin. Its fix-record residual 5
    (`:645–653`) states this mechanism and declines to file it: "`checkTypeLayer`
    starts the top-level walk with an empty bindings map and threads
    `paramsFieldNames` only into `collectLocalBinderNames` (a name `Set`, bug
    0050's §Fix) … so a `params:` identifier types through the `ident` arm's
    nominal fallback and this arm correctly returns the receiver … Not filed
    here." This report is that filing. 0136's witness row **x20**
    (`tests/member-access-declared-field-type.test.ts:1113–1141`, fixture at
    `:969–970`) already pins the deferral as a measured **bound** — `[]` in both
    directions, re-pinned away from the pre-measurement's
    `theta/parse/non-boolean-condition` oracle after measurement contradicted
    it. A fix here flips x20 from a bound to a reporting row, under its own
    authority; 0136's own §Fix does not own that row's subject.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, the same
    family at a disjoint position: `walkStmt`'s `case "for"` (HEAD `:1071–1105`)
    binds no loop variable, so a read of the loop variable erases the same way a
    read of a `params:` field does, and the same `theta/parse/non-array-iterand`
    false refusal follows from the same `checkForIterand` behaviour. The two
    positions share the file and the downstream mechanism and touch no common
    line; whichever lands second rebases citations only. 0126's report is the prior
    art for the GOV-15 argument shape and for the `placeholder-rendering-a.md`
    category-1 reading; both are re-derived here against this HEAD.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**. It introduced `paramsFieldNames` and
    `collectLocalBinderNames` for callee resolution and shadowing, which is a
    NAME question; the type map was never its subject. Its own doc comment
    records the limit being filed here
    (`src/parser/type-layer-checks.ts:494–495`): "`TypeLayerWalk`'s own
    `bindings` map is not a complete local view — it never sees a frontmatter
    `params:` field". A fix must not repurpose the name `Set`: withholding a
    name can only suppress an emission, and this defect needs a channel that
    produces one.
  - [0190](./0190-fn-arg-sink-withholds-provable-member-reads.md) — the sibling
    residual of the same 0136 run (its residual 1), covering
    `provableArgType`'s `member` / `method-call` arm. It shares one row with this
    report: §Reproduction (a5)'s `theta/parse/fn-arg-type-mismatch` reaches its
    sink only through `provableArgType` (`type-layer-checks.ts:1654`), whose
    `ident` arm withholds on an `unprovableBindings` identity hit
    (`:894–906`). The two positions are disjoint — a5's argument is a bare
    identifier, not a member read — but the proof discipline binds both; see
    §Fix (c).
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, the
    `annotationToCompatType` family. It reports the converter admitting junk at
    the three body `Type` positions and producing an opaque `named`, with the
    identical twin observable (checks stop firing; `non-array-iterand` fires
    falsely with the junk text in its message). If a fix here routes through
    `annotationToCompatType`, 0124's leniency reaches the `params:` position
    too; the `params:` RHS has its own load-time text gate
    (`theta/load/params-type-not-expression`,
    `docs/spec_topics/diagnostics/code-registry-load.md:19`) that the body
    positions lack, so the two are not automatically the same input set.
- **Affected** (every citation verified at HEAD `6942ef27`, 0.106.0; every file
  below `git hash-object`-equal to its `HEAD:` blob at measurement time):
  - `src/parser/type-layer-checks.ts:235–259` — **the defect site**,
    `checkTypeLayer`. `:238` declares
    `paramsFieldNames: readonly string[] = []`; `:245` passes it to
    `collectLocalBinderNames` and nowhere else; `:258` is
    `checker.walkBlock(body, new Map(), { returnScope: { kind: "inferred" } })`.
    No `CompatType` for any `params:` field is constructed between `:236` and
    `:259`. The doc comment at `:228–234` states the parameter's whole purpose
    as the shadowing one: "so a frontmatter parameter counts as a local binder
    too (bug 0050 §Fix)".
  - `src/parser/type-layer-checks.ts:503–510` — `collectLocalBinderNames`.
    `:507` is `const names = new Set<string>(paramsFieldNames)`. A `Set<string>`
    carries no type. `:494–495` is the comment naming the gap.
  - `src/parser/type-layer-checks.ts:1216–1220` — `walkFn`, the contrast. `:1220`
    is `fnScope.set(p.name, annotationToCompatType(p.type) ?? { kind: "named", name: p.type })`.
    One `.set` per annotated parameter is the entire difference between every
    §Reproduction (a)/(b) row and its control.
  - `src/parser/type-layer-checks.ts:934–941` — `walkBlock`, whose per-block
    `new Map(bindings)` copies propagate the empty root map to every nested depth
    (§Reproduction (c) measures the propagation).
  - `src/parser/static-type-inference.ts:211–216` — `#typeExpr`'s `case "ident"`:
    `bindings.get(node.name) ?? { kind: "named", name: node.name }`. With no
    entry, a `params:` identifier types as `named "<its own spelling>"`.
  - `src/parser/static-type-inference.ts:242–278` — `#typeExpr`'s `case "member"`
    post-0136. `:268–271` returns the receiver's own `named` when the receiver
    resolves to no declaration, which is that fix's specified behaviour; `p.s`
    over a params-declared `p` therefore types as `named "p"`. Correct at this
    arm; the gap is upstream.
  - `src/parser/control-flow.ts:64–81` — `checkForIterand`. `:69` unfolds; `:70`
    admits only `kind === "array"`; `:74–80` refuses everything else at
    `severity: "error"`. `:55–57` states the design: "an unresolvable `named`
    stays intact, so both keep rejecting". This is the one type-layer check that
    refuses rather than defers on an unresolvable name.
  - `src/parser/type-layer-checks.ts:1071–1105` — `walkStmt`'s `case "for"`.
    `:1078` guards the refusal with `containsWithheldBinderType(iterandType)`
    alone. A `params:` name has no `bindings` entry at all, so nothing is
    withheld and the refusal lands. `:2007–2066` — the `par for` arm, the second
    call site of the same row, with the same guard at `:2012` and its own
    element-type binding at `:2048–2052`.
  - `src/parser/theta-document.ts:899–903` — the production wiring:
    `checkTypeLayer({ statements, tail: resolvedTail }, file, (frontmatter?.params?.fields ?? []).map((f) => f.wireName))`.
    `:5471–5472` — the second params-field reader,
    `checkLexicalCallSites`'s `rootLocals`, also name-keyed
    (`{ kind: "params-field" }`).
  - `src/binder/binder-envelope.ts:167–170` — `BypassParamsField.wireName` and
    `.type`. The declared type source is in the record the call site iterates.
    `src/parser/frontmatter.ts:794–795` — where both are set from one read.
  - `src/parser/type-compat.ts:742–774` — `paramsDeclaredCompatType`, an
    exported `params:`-position declared-type converter that already exists:
    primitives, top-level unions, `array<T>`, else a nominal `named`. `:734–740`
    states its injected-splitter layering constraint. `src/parser/params.ts:405`
    — its only current caller, the default-compatibility check, reached for a
    defaulted field only (`:349–350`).
  - `src/parser/type-layer-checks.ts:810–832` — `annotationToCompatType`, the
    type layer's own converter, the one `walkFn` uses.
  - `tests/member-access-declared-field-type.test.ts:969–970`, `:1113–1141` —
    bug 0136's row x20: the existing pin, `[]` in both directions, with its
    derivation in the row's own comment.
  - `tests/committed-fixture-parse-gate.test.ts:59–60` — the whole-corpus parse
    gate, hard counts `EXPECTED_SHIPPED_THETA = 31` /
    `EXPECTED_SHIPPED_THETALIB = 2`. Seventeen of the thirty-four committed
    `.theta` / `.thetalib` files declare `params:`
    (`git ls-files '*.theta' '*.thetalib' | xargs grep -l '^params:'`), so this
    gate is in the fix's blast radius.
  - `src/extension/production-composition.ts:1729`, `:2214–2221` — the
    registration predicate and `hasLoadParseError`. An `E`-severity
    `theta/parse/*` denies registration.
- **Observed at:** `0.106.0` (HEAD `6942ef27`). Offline, deterministic; no live
  model, no provider, no child process. Scratch vitest driving the real
  `parseThetaDocument` through the shared `parseDoc` harness
  (`tests/helpers/e2e-s1.ts:39`), the same harness bug 0136's witness uses.
  Written, run, deleted. One measurement round was taken while a sibling had
  `src/parser/type-layer-checks.ts` dirty; that round drove a
  `git hash-object`-verified copy of the `HEAD:` blob directly, and every row was
  re-measured against the pristine tree afterwards with identical results.
- **Scope:** the static type layer only. The frontmatter `params:` parse, the
  binder, the AJV boundary and the runtime are correct and unchanged — see
  §Non-goals.

## Summary

`checkTypeLayer` (`src/parser/type-layer-checks.ts:235–259`) receives the
frontmatter `params:` field wire names and starts the top-level walk with
`new Map()` (`:258`). The names go to `collectLocalBinderNames` (`:245`), which
seeds a `Set<string>` (`:507`) — a shadowing and callee-resolution channel, not a
type map. No `CompatType` is ever recorded for a `params:` field, so
`#typeExpr`'s `case "ident"` (`src/parser/static-type-inference.ts:211–216`)
falls through to its nominal fallback and a `params:` identifier types as
`named "<its own spelling>"`. That name resolves to no declaration in the
`TypeEnv`, and every judgement sink in the type layer defers on it.

The contrast is one line. `walkFn` (`:1216–1220`) writes
`fnScope.set(p.name, annotationToCompatType(p.type) ?? { kind: "named", name: p.type })`
for each annotated parameter (`:1220`). Every measured row below is a pair: the
`params:` spelling and the byte-identical `fn`-parameter spelling of the same
body. The `fn` form reports; the `params:` form is silent.

Twelve registered `E`-severity rows are unreachable this way. A thirteenth,
`theta/parse/non-array-iterand`, moves the other way: `checkForIterand`
(`src/parser/control-flow.ts:64–81`) refuses every non-`array` iterand including
an unresolvable `named` by design (`:55–57`), and the `for` arm's only shield is
a WITHHELD-marker test (`:1078`) that a params name — having no `bindings` entry
at all — never trips. So `for y in xs { y }` over a `params: xs: array<string>`
draws an `E`, renders the binding's own identifier where a type belongs
(`got xs`), and the theta does not register.

Post-0136 the member arm is correct at its own position: for an unresolvable
receiver it returns the receiver's own `named` (`static-type-inference.ts:268–271`),
so `p.s` over a params-declared `p` types as `named "p"` exactly as that fix
specifies. The gap is upstream of it. This is the third position of the same
erasure family — bug 0136's member arm (fixed 0.106.0) and bug 0126's plain-`for`
loop variable (open) are the other two.

## Reproduction

Offline, `parseDoc` (`tests/helpers/e2e-s1.ts:39`) over the real
`parseThetaDocument`. Every row's observable is the document's aggregated
`diagnostics` list, rendered `severity code: message`. Each `params:` row is
paired with the byte-identical `fn`-parameter spelling of the same body as its
control. `<FM>` abbreviates the fence
`---\nmode: prompt\nparams:\n`.

### (a) Twelve registered rows are silent on a `params:`-declared read

Every row: measured `[]`. Every control: measured as stated.

| row | source | measured | control | control measured |
|---|---|---|---|---|
| a1 | `<FM>  s: string\n---\nif s { 1 } else { 2 }\n` | `[]` | `fn f(s: string) { if s { 1 } else { 2 } }\n1\n` | `error theta/parse/non-boolean-condition: condition must be boolean; got string` |
| a2 | `<FM>  p: P\n---\nschema P { s: string }\nif p.s { 1 } else { 2 }\n` | `[]` | `schema P { s: string }\nfn f(p: P) { if p.s { 1 } else { 2 } }\n1\n` | `error theta/parse/non-boolean-condition: condition must be boolean; got string` |
| a3 | `<FM>  s: string\n---\nwhile s { 1 }\n2\n` | `[]` | `fn f(s: string) { while s { 1 } }\n1\n` | `error theta/parse/non-boolean-condition: condition must be boolean; got string` |
| a4 | `<FM>  n: integer\n---\nlet s: string = n\ns\n` | `[]` | `fn f(n: integer): string { let s: string = n\n s }\n1\n` | `error theta/parse/let-rhs-type-mismatch: let binding 's' initialiser type mismatch: expected string, got integer` |
| a5 | `<FM>  s: string\n---\nfn g(n: integer): integer { n }\ng(s)\n` | `[]` | `fn g(n: integer): integer { n }\nfn f(s: string): integer { g(s) }\n1\n` | `error theta/parse/fn-arg-type-mismatch: fn 'g' argument 0 ('n') type mismatch: expected integer, got string` |
| a6 | `<FM>  s: string\n---\nlet v = s.frobnicate()\nv\n` | `[]` | `fn f(s: string) { s.frobnicate() }\n1\n` | `error theta/parse/unknown-method: unknown method 'frobnicate' on type string` |
| a7 | `<FM>  x: number\n---\nlet n: integer = x\nn\n` | `[]` | `fn f(x: number): integer { let n: integer = x\n n }\n1\n` | `error theta/parse/integer-narrowing: cannot narrow number to integer` |
| a8 | `<FM>  s: string\n---\nlet v = s?\nv\n` | `[]` | `fn f(s: string) { let v = s?\n v }\n1\n` | `error theta/parse/question-on-non-result: '?' requires a Result operand; got string` |
| a9 | `<FM>  s: string\n---\nlet b: boolean = s < 1\nb\n` | `[]` | `fn f(s: string): boolean { s < 1 }\n1\n` | `error theta/parse/non-orderable-operands: '<' requires two numeric or two string operands; got string and integer` |
| a10 | `<FM>  xs: array<integer>\n---\nlet j = xs.join(", ")\nj\n` | `[]` | `fn f(xs: array<integer>) { xs.join(", ") }\n1\n` | `error theta/parse/non-string-array-join: array.join requires a string element type; got array<integer>` |
| a11 | `<FM>  p: P\n---\nschema P { s: string }\nlet v = p[0]\nv\n` | `[]` | `schema P { s: string }\nfn f(p: P) { p[0] }\n1\n` | `error theta/parse/non-string-object-index: object index must be string; got integer` |
| a12 | `<FM>  s: string\n---\nlet v = s[0]\nv\n` | `[]` | `fn f(s: string) { s[0] }\n1\n` | `error theta/parse/non-indexable-receiver: indexed access requires an array<T> or object receiver; got string` |
| a13 | `<FM>  s: string\n---\nschema S { n: number }\nlet v = S { n: s }\nv\n` | `[]` | `schema S { n: number }\nfn f(s: string) { S { n: s } }\n1\n` | `error theta/parse/object-field-type-mismatch: field 'n' on schema 'S' type mismatch: expected number, got string` |
| a14 | `<FM>  s: string\n---\nlet xs: array<integer> = [s]\nxs\n` | `[]` | `fn f(s: string) { let xs: array<integer> = [s]\n xs }\n1\n` | `error theta/parse/let-rhs-type-mismatch: … expected array<integer>, got array<string>`, `error theta/parse/array-element-type-mismatch: array element type mismatch at index 0: expected integer, got string` |
| a15 | `<FM>  s: string \| integer\n---\nif s { 1 } else { 2 }\n` | `[]` | `fn f(s: string \| integer) { if s { 1 } else { 2 } }\n1\n` | `error theta/parse/non-boolean-condition: condition must be boolean; got string \| integer` |
| a16 | `<FM>  xs: array<string>\n---\nlet n: integer = xs\nn\n` | `[]` | `fn f(xs: array<string>): integer { let n: integer = xs\n n }\n1\n` | `error theta/parse/let-rhs-type-mismatch: let binding 'n' initialiser type mismatch: expected integer, got array<string>` |

Distinct registered rows unreachable across (a): **twelve** —
`non-boolean-condition`, `let-rhs-type-mismatch`, `fn-arg-type-mismatch`,
`unknown-method`, `integer-narrowing`, `question-on-non-result`,
`non-orderable-operands`, `non-string-array-join`, `non-string-object-index`,
`non-indexable-receiver`, `object-field-type-mismatch`,
`array-element-type-mismatch`. Every one is registered `E` / `type` (except
`unknown-method`, registered `E` / `parse`) in
`docs/spec_topics/diagnostics/code-registry-parse.md` at `:34`, `:56`, `:120`,
`:65`, `:24`, `:79`, `:37`, `:43`, `:39`, `:38`, `:46`, `:40`.

All four declared-type spellings the claim covers are measured: a primitive
(a1, a3–a9, a12–a14), `array<T>` (a10, a16), a top-level union (a15), and a
`NamedType` resolving to an object-form `schema`, read through a member access
(a2, a11). The member route is the one bug 0136's x20 pins. Every control renders
its type in source-grammar form, `string | integer` and `array<string>` included,
so the fn-parameter oracle covers the compound spellings too.

### (b) `theta/parse/non-array-iterand` fires falsely, at `E`, registration denied

Every row: an `E`-severity refusal of a program `control-flow.md:13` admits.
Every control: `[]`.

| row | source | measured | control | control measured |
|---|---|---|---|---|
| b1 | `<FM>  xs: array<string>\n---\nfor y in xs { y }\n1\n` | `error theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got xs` | `fn f(xs: array<string>) { for y in xs { y } }\n1\n` | `[]` |
| b2 | `<FM>  p: P\n---\nschema P { xs: array<string> }\nfor y in p.xs { y }\n1\n` | `error theta/parse/non-array-iterand: … got p` | `schema P { xs: array<string> }\nfn f(p: P) { for y in p.xs { y } }\n1\n` | `[]` |
| b3 | `<FM>  xs: L\n---\nschema L = array<string>\nfor y in xs { y }\n1\n` | `error theta/parse/non-array-iterand: … got xs` | `schema L = array<string>\nfn f(xs: L) { for y in xs { y } }\n1\n` | `[]` |
| b4 | `<FM>  xs: array<string>\n---\npar for y in xs { y }\n1\n` | `error theta/parse/non-array-iterand: … got xs` | `fn f(xs: array<string>) { par for y in xs { y } }\n1\n` | `[]` |

b1 is the direct `array<T>` declaration; b2 reaches it through a declared field
of an object-schema param (`got p` is the receiver's own `named`, 0136's
specified answer for an unresolvable receiver); b3 through a type alias, which
`checkForIterand:52–54` unfolds for the `fn` control and cannot unfold here
because nothing named the type; b4 is the `par for` spelling, the second call
site of the same row (`type-layer-checks.ts:2012`).

The rendered `<type>` position holds `xs` / `p` — the binding's identifier, not a
type. An `E`-severity `theta/parse/*` denies registration
(`production-composition.ts:1729`, `:2214–2221`), so these four programs do not
load.

### (c) The erasure reaches every nesting depth

`walkBlock` copies the root map into each nested block
(`type-layer-checks.ts:934–941`), so the emptiness propagates. Measured `[]` for
every row; every control reports
`error theta/parse/non-boolean-condition: condition must be boolean; got string`.

| row | source |
|---|---|
| c1 | `<FM>  s: string\n  b: boolean\n---\nif b { if s { 1 } else { 2 } } else { 3 }\n` |
| c2 | `<FM>  s: string\n---\nfor y in [1,2] { if s { y } else { y } }\n1\n` |

There is no position at which a `params:` read is judged. Closures and
first-class function values are not part of theta 1.0
(`docs/spec_topics/functions.md:20`, FN-1; `:61` — "there is no lexical capture
of the enclosing scope"), so a `fn` body cannot read a `params:` field at all,
and the top-level walk `checkTypeLayer:258` starts is the whole of the surface.
The loss is total for the position, not partial by depth.

### (d) Fences — positions where the silence is correct and is not claimed here

| row | source | measured | note |
|---|---|---|---|
| d1 | `<FM>  b: boolean\n---\nif b { 1 } else { 2 }\n` | `[]` | legal; must stay `[]` after a fix |
| d2 | `<FM>  p: P\n---\nschema P { s: string }\nlet ok: string = p.s\nok\n` | `[]` | legal; must stay `[]` after a fix |
| d3 | `<FM>  p: {s: string}\n---\nif p.s { 1 } else { 2 }\n` | `[]` | inline object type: `annotationToCompatType` and `paramsDeclaredCompatType` both return a nominal `named` for it, at every position alike (0136's row x4 is the schema-field twin). Outside the claim. |
| d4 | `<FM>  c: Color\n---\nenum Color { Red }\nif c { 1 } else { 2 }\n` | `[]` | its `fn` control also measures `[]`: `collectTypeEnv` records no `enum`, a recorded non-goal (bug 0038 residual (iii)). No delta, so outside the claim. |

d3 and d4 separate the defect from the positions where a `params:` value
legitimately cannot be typed. The claim covers exactly the four spellings the
type layer types at every other annotation position: a primitive, a top-level
union, `array<T>`, and a `NamedType` resolving to an object-form `schema`.

### (e) The name is bound; only the type is missing

`<FM>  p: P\n---\nschema P { s: string }\nlet ok: string = q.s\nok\n` → the whole
document reports `error theta/parse/unknown-identifier: unknown identifier 'q'`,
while the same source spelling `p` reports nothing. The lexical layer resolves
`p` through `checkLexicalCallSites`'s `rootLocals`
(`theta-document.ts:5471–5472`). The binding exists; the type layer has no
entry for it.

### (f) The existing pin

`tests/member-access-declared-field-type.test.ts:1113–1141` (row x20, fixture
`:969–970`) drives `<FM>  p: P\n---\nschema P { s: string }\nif p.s { 1 } else { 2 }\n`
— a2 above — and asserts both the code list and the message list `toEqual([])`.
Re-measured here: `[]`. That row is the only committed witness of this defect and
it pins the defective behaviour as a bound, with its derivation in the row's own
comment.

## Expected behaviour

A read of a `params:`-declared binding carries that binding's declared type into
the type layer, so the twelve rows in §Reproduction (a) fire exactly as they do
on the byte-identical `fn`-parameter form, and §Reproduction (b)'s four programs
load.

- `type-system.md:15` places frontmatter `params:` in the same
  type-annotation-position list as `let x: T` and a function parameter. `:27`
  makes `⊑` the single relation governing those positions.
  `frontmatter-fields-a.md:57` states the body-side consequence: "`params` are
  validated with AJV at invocation time and exposed as typed variables in the
  theta body."
- `type-system.md:48` licenses skipping a check only for an operand "past the
  parser's static view". A `params:` field's declared type is not: the type
  expression is in the file, resolves whole-file (`frontmatter-fields-a.md:58`),
  and `parseParams` already projects a defaulted field's onto a `CompatType` at
  the same parse (`params.ts:405` → `type-compat.ts:742`).
- `control-flow.md:13` admits `for x in xs` for any `array<T>` iterand, so
  §Reproduction (b)'s four programs load and their bodies execute.
- `placeholder-rendering-a.md:11–13` requires a `<type>` placeholder to render a
  Theta static type in source-grammar form. `got xs` renders a binding name;
  after a fix the same position renders `array<string>` for b1 or does not
  render at all.

The user-facing mirrors agree: `docs/reference/type-system.md:22–23` carries the
same annotation-position list. `docs/reference/frontmatter.md:119–121` drops the
"exposed as typed variables in the theta body" clause the spec page carries; that
asymmetry is a mirror gap, not a licence, and is not this report's subject.

The spec states the position. It does not state, in one sentence, which
`CompatType` each `params:` type spelling projects to — but neither does it for a
`let` annotation or a `fn` parameter type, and both are implemented from the same
grammar sentence. No spec-silence closure is required for the four spellings in
the claim.

## Actual behaviour / root cause

One threading gap, four hops:

1. **The call site discards the type.** `theta-document.ts:899–903` calls
   `checkTypeLayer(body, file, (frontmatter?.params?.fields ?? []).map((f) => f.wireName))`.
   Each element of `frontmatter.params.fields` is a `BypassParamsField` carrying
   both `wireName` and `type` — "the field's declared surface type"
   (`binder-envelope.ts:167–170`), written verbatim from the frontmatter read
   (`frontmatter.ts:794–795`). The `.map` keeps the name and drops the type.
2. **The parameter's only consumer is a name set.** `checkTypeLayer:245` passes
   `paramsFieldNames` to `collectLocalBinderNames` and to nothing else;
   `:507` is `new Set<string>(paramsFieldNames)`. The function's contract is
   whole-file over-approximation for shadowing and callee resolution (bug 0050),
   and its own comment records the limit: "`TypeLayerWalk`'s own `bindings` map
   is not a complete local view — it never sees a frontmatter `params:` field"
   (`:494–495`).
3. **The walk starts empty.** `:258` is
   `checker.walkBlock(body, new Map(), { returnScope: { kind: "inferred" } })`.
   `walkBlock` hands each nested block `new Map(bindings)` (`:934–941`), so no
   depth ever gains a `params:` entry. `walkFn:1220` is the only arm that seeds a
   declared type into a scope map, and it seeds `fn` parameters.
4. **The ident arm falls through.**
   `static-type-inference.ts:211–216` returns
   `bindings.get(node.name) ?? { kind: "named", name: node.name }`. With no
   entry, `s` types as `named "s"` and `xs` as `named "xs"`. `collectTypeEnv`
   holds no declaration under those spellings, so `resolveNamed` answers
   `undefined` and `decide` answers `"unknown"` at every sink.

The member route adds one hop and no new cause. `#typeExpr`'s `case "member"`
computes the receiver first (`:267`); the receiver is the unresolvable
`named "p"` from hop 4; `:268–271` returns it, which is bug 0136's specified
answer for an unresolvable receiver and is why `p.s` types as `named "p"`, not
`named "s"`.

The `for` iterand is the one sink that refuses instead of deferring.
`checkForIterand:69–80` unfolds and then admits only `kind === "array"`; `:55–57`
states the intent ("an unresolvable `named` stays intact, so both keep
rejecting"). The `for` arm shields it with `containsWithheldBinderType(iterandType)`
(`:1078`), and the `par for` arm with the same test (`:2012`). That guard tests
for the WITHHELD sentinel `recordWithheldBinders` (`:1181`) writes. A `params:`
name has no entry of any kind, so the guard is false, the refusal lands, and
`displayType` renders the binding's identifier into the `got <type>` slot.

Asymmetry worth naming: the withheld channel cannot fix this. Withholding
suppresses an emission and never produces one (`:498–501`). Twelve of the
thirteen rows need a produced verdict, so recording `params:` fields as withheld
would silence b1–b4 and leave a1–a16 exactly as they are.

**The declared-type source a fix threads.** Two converters already exist and both
are exported:

- `paramsDeclaredCompatType` (`type-compat.ts:742–774`) — written for this exact
  input, a `params:` field's `typeSource`. Primitives → `prim`; top-level unions
  → `union`; `array<T>` → `array`; every other spelling → nominal `named`. Its
  top-level-`|` splitter is injected because `params.ts` sits below the type
  layer in the module graph (`:734–740`); a caller inside the type layer supplies
  its own. Already called at `params.ts:405`, for defaulted fields only.
- `annotationToCompatType` (`type-layer-checks.ts:810–832`) — the type layer's
  own converter, the one `walkFn:1220` uses for a `fn` parameter, so routing
  through it makes the `params:` and `fn`-parameter positions identical by
  construction.

They differ on the decline path: an `array<T>` whose element declines becomes
`{ kind: "array", element: named "unknown" }` under `annotationToCompatType`
(`:825–826`) and `undefined` under `paramsDeclaredCompatType`
(`type-compat.ts:766–768`). The second states its reason at the union arm that
shares the posture (`:756–759`): dropping an undecidable arm "would silently
narrow the declared type". A fix picks one and adds no third reader.

## Why it matters

- **`params:` is the sole typed-input surface of a theta.** Every slash
  invocation, every `invoke(...)` call, every registered-tool call delivers its
  arguments through it (`frontmatter-fields-a.md:57`). Twelve registered
  rejections that hold for a `fn` parameter hold for none of those inputs.
- **The loss is silent and the theta registers.** In the (a) direction no
  diagnostic of any severity is emitted, the theta registers, and the body runs
  on a value whose declared constraint the parser never checked. That is the
  posture `type-system.md:48` licenses only for operands past the static view.
- **A spec-legal program does not load.** §Reproduction (b): `E` severity,
  registration denied (`production-composition.ts:1729`).
  `params: xs: array<string>` is the ordinary shape for a list-valued parameter:
  `focus_areas: array<string>` is the spec's own opening `params:` example
  (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:23`, mirrored at
  `docs/reference/frontmatter.md:30`, and again with a default at
  `frontmatter-fields-a.md:65`), and iterating one is the ordinary use. No
  shipped fixture declares an `array<…>` param, so nothing in the corpus
  witnesses the refusal — the seventeen params-carrying fixtures declare sixteen
  `string`s, one `number = 3`, and one imported `Author`.
- **The false refusal renders a name where a type belongs.** `got xs` fails
  `placeholder-rendering-a.md:11–13`'s category-1 rule, so the emitted string is
  outside the registry's own rendering contract even where the verdict happens
  to be right.
- **There is no position where the type is honoured.** FN-1 forbids closures, so
  a `params:` read cannot occur inside a `fn` body; §Reproduction (c) shows every
  top-level nesting depth inherits the empty map. Unlike bug 0126, where the
  `par for` arm demonstrates the honoured behaviour on the identical body, no
  arm anywhere honours a `params:` declared type.
- **The corpus pins the gap rather than the behaviour.** The only committed
  witness of this position is bug 0136's row x20, asserting `[]`. A reader of the
  test suite sees the deferral certified.
- **Three positions, one family.** With 0136 fixed and 0126 open, this is the
  third position at which a statically known type fails to reach `#typeExpr`'s
  consumers, and the two faces are the same at each: silence at the deferring
  sinks plus a false `non-array-iterand`. Each position was found by fixing the
  previous one.

## Non-goals

- **Binder-side and AJV enforcement.** The runtime path is correct and is not
  touched. `params` are AJV-validated at invocation time
  (`frontmatter-fields-a.md:57`) and the post-default-merge boundary is enforced
  and witnessed (`tests/binder-post-merge-ajv-enforcement.test.ts`). This report
  is about the STATIC layer only: what the parser refuses at load, before any
  value exists.
- **Bug 0126's plain-`for` loop variable.** A disjoint arm
  (`type-layer-checks.ts:1071–1105`) with its own report, its own spec-silence
  question about the loop variable's static type, and its own coordination
  against bug 0089's `n1` tripwire. Fixing this position neither closes nor
  needs it.
- **The `params:` default-literal compatibility check.** Already implemented and
  registered (`params.ts:395–420`, `theta/parse/params-default-type-mismatch`).
  It judges the default against the declared type inside the frontmatter; this
  report is about body reads.
- **Inline object types and literal types in `params:` position.**
  §Reproduction (d3): both converters answer a nominal `named` for them, at every
  annotation position alike. Widening that is `annotationToCompatType`'s subject,
  not this position's.
- **`enum`-typed `params:` fields.** §Reproduction (d4): the `fn`-parameter
  control also defers, because `collectTypeEnv` records no `enum` — a recorded
  non-goal restated by bug 0038 residual (iii) and by bug 0136 §Fix (b). A fix
  here inherits whatever that position does and adds no enum-name source.
- **`annotationToCompatType`'s trailing-punctuation leniency.** Bug 0124's
  subject. A fix here consumes a converter; it does not tighten one.
- **The `docs/reference/frontmatter.md` mirror gap.** `:119–121` drops the
  spec page's "exposed as typed variables in the theta body" clause. Prose only,
  no behaviour, and not required by any route below.
- **`theta/parse/unresolved-named-type` and the `params:` load-time text gate.**
  Both already fire on their own inputs (`code-registry-load.md:19`) and are
  upstream of every row here: each §Reproduction row's `params:` RHS is a
  well-formed `Type` that resolves.

## Fix

Not settled. Constraints a route must satisfy, each anchored to a measurement or
a sentence above.

**(a) The type must reach `bindings`, not the name set.** The channel
`collectLocalBinderNames` owns is a `Set<string>` whose only power is suppression
(`type-layer-checks.ts:498–501`); twelve of the thirteen rows need a produced
verdict. So the fix adds a `CompatType` source to the map `walkBlock` starts
from (`:258`) and leaves `:245`'s name set intact — bug 0050's shadowing
behaviour is correct and unchanged, and any route that repurposes the `Set`
breaks it.

**(b) The declared type source is already at the call site.** `theta-document.ts:902`
iterates `BypassParamsField` records carrying `.type` beside `.wireName`
(`binder-envelope.ts:167–170`). A route widens `checkTypeLayer`'s third parameter
(`:238`, defaulted `[]` so two-argument callers keep compiling) or adds a fourth,
and threads `{ wireName, type }`. No new frontmatter read, no new parse.

**(c) One converter, no third reader.** `paramsDeclaredCompatType`
(`type-compat.ts:742–774`) and `annotationToCompatType`
(`type-layer-checks.ts:810–832`) both already project a declared type source onto
`CompatType`, and their declines differ on `array<T>` with an undeclinable
element (`type-layer-checks.ts:825–826` vs `type-compat.ts:766–768`). Routing
through `annotationToCompatType`
makes the `params:` and `fn`-parameter positions identical by construction —
which is what makes every §Reproduction (a) control the oracle for its row — and
is the smaller change, since `walkFn:1220` already establishes the
`?? { kind: "named", name: p.type }` fallback shape. Routing through
`paramsDeclaredCompatType` keeps the `params:` position's two consumers (the
default check at `params.ts:405` and the body walk) on one projection. Either
way the fix reuses one and writes none. The layering note at `type-compat.ts:734–740`
constrains only the splitter injection, and a type-layer caller supplies its own
(`splitTopLevelUnion`, `type-layer-checks.ts:840`).

Whichever converter wins, the recorded `CompatType` must NOT enter
`unprovableBindings` (`type-layer-checks.ts:894–906`). That set is bug 0050's
laundered-binding channel and `provableArgType`'s `ident` arm withholds on an
identity hit, so a params type recorded there would leave §Reproduction (a5)
silent while the other eleven rows move. The channel's own comment states the
rule this position inherits: "`walkFn`'s parameter scope feeds nothing here — an
author-written annotation IS a declared type, so it is a proof" (`:901–902`). A
`params:` field's declared type is author-written in exactly that sense.

**(d) The fix must remove b1–b4 as well as add a1–a16.** The `for` iterand is the
only sink that refuses on an unresolvable name (`control-flow.ts:55–57`), so a
correct declared type both silences the false `E` and makes the loop admissible.
A route that adds the twelve and leaves `checkForIterand` reading an unresolvable
`named` for a declared `array<T>` param is incomplete against
`control-flow.md:13`. The `par for` arm (`:2007–2066`) is the second call site of
the same row and moves with it (b4).

**(e) Coordination.** The two positions in
[0126](./0126-plain-for-binds-no-loop-variable.md) and this report sit in the
same file at disjoint arms — `walkStmt`'s `case "for"` (`:1071–1105`) there,
`checkTypeLayer`'s entry (`:235–259`) here — and touch no common line. Whichever
lands second rebases citations only, and neither is a prerequisite for the other.
Both consume `checkForIterand` unchanged. Bug 0136's arm
(`static-type-inference.ts:242–278`) is likewise untouched by either: this fix
supplies the receiver type the arm already knows how to use, which is why
§Reproduction (a2)'s and (b2)'s member routes move without editing that file.

**(f) Witness re-pins the fix owns.** Bug 0136's row x20
(`tests/member-access-declared-field-type.test.ts:1113–1141`) asserts `[]` in
both directions and is §Reproduction (a2). A fix flips it to
`theta/parse/non-boolean-condition: condition must be boolean; got string` —
which is the value the row's own pre-measurement predicted before measurement
contradicted it — and rewrites the row's derivation comment, which currently
states this defect as the reason for the bound. That flip is this fix's to make;
0136's §Fix does not own the row's subject.

`tests/committed-fixture-parse-gate.test.ts` (`:59–60`) must be re-run:
seventeen of the thirty-four committed `.theta` / `.thetalib` files declare
`params:`, and each newly gains a declared type at its body reads. The
params-typed positions the fix makes reachable across that corpus are
`docs/examples/import-thetalib.theta:9` (`rate_strictness(reviewer)` over an
imported `Author`), `docs/examples/typed-params-across-boundary.theta:16`
(`summarise_doc(document)`, callee `document: string`) and
`docs/examples/ralph.theta:12` (`ralph_step(objective)`, callee
`objective: string`) — three callable-argument sinks, the rest of the corpus
reading its params only inside `@`-query interpolations. Whether any of the three
emits is a measurement, not a prediction.

**(g) GOV-15, both directions.**
`docs/spec_topics/governance/source-language-stability.md` — the
*Diagnostic-registry carve-out* disposes a DIAG-2 *trigger* change "as an
addition for inputs newly brought into the code's emission set and as a removal
for inputs taken out of it". Thirteen registry rows change reachability at this
position: twelve additions (§Reproduction (a)) and one removal
(§Reproduction (b)'s `non-array-iterand`). The *loads-cleanly predicate*
(`#gov-15-loads-cleanly`) selects the input set by "no diagnostic of effective
severity `error`", so §Reproduction (b)'s four programs are outside GOV-15's
promise today and their removal is unconstrained by it; the (a) programs load
cleanly today and are inside it, so each of the twelve is an addition to be
enumerated with its *Trigger* read as written. No registry row is added, removed,
renamed or reworded, so DIAG-2/3/4 need no new adjudication — the same posture
bug 0136's fix recorded for its own thirteen-row enumeration.

**(h) Fences a fix must hold.** §Reproduction (d1)/(d2) stay `[]` (a legal use
must not become a refusal). §Reproduction (d3)/(d4) stay `[]` in both directions
— an inline-object or `enum`-typed `params:` field defers exactly as its
`fn`-parameter control does, and a route that changes either has widened
something this report does not claim. §Reproduction (e)'s
`unknown-identifier` stays unmoved: the lexical layer's `rootLocals`
(`theta-document.ts:5471–5472`) is a separate reader and is not this fix's
surface.

## Provenance

- **Origin:** the bug 0136 fix (0.106.0, commit `6942ef27`), fix-record residual
  5 (`docs/bugs/0136-member-access-types-as-field-name-not-field-type.md:645–653`;
  the run's report at `.pi/tmp/fixes/0136-report.md` §Residuals item 5 carries
  the longer form). That residual states the mechanism, records that the
  Phase-1 writer's reconstructed x20 fixture expected
  `theta/parse/non-boolean-condition` and measured `[]`, records that the
  orchestrator verified `checkTypeLayer` by reading it before re-pinning x20 as
  a deferral bound, names the position as "the same shape as bug 0126's
  plain-`for` loop variable, at a third position", and closes "Not filed here."
  This report is that filing.
- **What this report adds beyond the residual:** the second face — the false
  `E`-severity `theta/parse/non-array-iterand` on four spec-legal programs, with
  registration denied — which the residual does not mention; the twelve-row
  registry inventory with a paired `fn`-parameter control per row, measured in
  both directions; the depth-propagation measurement and the FN-1 argument that
  establish there is no position where a `params:` declared type is honoured;
  the identification of `BypassParamsField.type` as a declared-type source
  already present at the call site; the two existing converters and the axis on
  which their declines differ; the spec reading that this position is stated
  rather than silent (`type-system.md:15`, `frontmatter-fields-a.md:57`), which
  distinguishes it from bug 0126's spec-silence element; and the fences that
  separate the defect from the `params:` spellings that legitimately defer.
- **Measurement conditions:** HEAD `6942ef27`, 0.106.0. Offline, deterministic,
  provider-free. Scratch vitest over `parseDoc` (`tests/helpers/e2e-s1.ts:39`),
  written, run, and deleted; no file left in the tree. One round was taken while
  a sibling worker had `src/parser/type-layer-checks.ts` dirty and drove a
  `git hash-object`-verified copy of the `HEAD:` blob
  (`92960836d84c8323231777ceeefa62e66dd44a7a`) directly through the production
  wiring of `theta-document.ts:899–903`; every row was then re-measured against
  the pristine tree with identical results.
