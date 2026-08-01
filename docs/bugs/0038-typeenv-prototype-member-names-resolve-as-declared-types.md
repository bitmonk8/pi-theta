# Bug 0038 — The `TypeEnv` is a plain `{}`, so an annotation naming an `Object.prototype` member resolves as a declared type: `let c: constructor = 3` reports a mismatch, and `1 + constructor` throws a `TypeError` out of the parse

- **Status:** fixed (0.48.0)
- **Kind:** defect — implementation. `collectTypeEnv`
  (`src/parser/type-layer-checks.ts:282`) builds the `TypeEnv` as
  `const env: Record<string, NamedDecl> = {}`, and every consumer resolves a
  `NamedType` by reading `env[name]` through that prototype chain. For the
  twelve `Object.prototype` own property names the read answers a JS value
  instead of `undefined`, so the name is treated as a **declared** type. Two
  consequences with different shapes:
  1. **Wrong diagnostics.** `decide`'s named arms
     (`src/parser/type-compat.ts:238`, `:242`, `:252`) test only
     `env[name] === undefined`, so a prototype name passes as a present
     declaration and the relation answers `"incompatible"` where the operand is
     statically unresolvable and
     [type-system.md §Unresolvable operands](../spec_topics/type-system.md#type-compatibility)
     (`docs/spec_topics/type-system.md:48`) requires the check be skipped. The
     emitted `theta/parse/let-rhs-type-mismatch` violates its own registered
     Trigger, which fires only "where the RHS type is statically resolvable"
     (`docs/spec_topics/diagnostics/code-registry-parse.md:54`).
  2. **A parse-phase `TypeError`.** `classifyOperand`
     (`src/parser/type-layer-checks.ts:128`), `classifyReceiver` (`:171`), and
     `classifyIndexReceiver` (`src/parser/type-compat.ts:365`) branch on
     `decl.kind === "object-schema"` and otherwise recurse into `decl.rhs`. A
     prototype value has neither, so the recursion reads `.kind` of `undefined`
     and throws. `let r = 1 + constructor` — two body lines, no `schema`, no
     `fn` — throws `TypeError: Cannot read properties of undefined (reading
     'kind')` out of `parseThetaDocument`, and the shipped composition root
     registers zero thetas with zero author-visible per-file diagnostics.
- **Affected** (every citation verified at HEAD `f959f8de`, 0.45.0):
  - **The construction site** — `collectTypeEnv`
    (`src/parser/type-layer-checks.ts:281–310`); the plain record at `:282`,
    the two writes at `:298` (alias form) and `:303–306` (object form). This is
    the single point every consumer reads.
  - `src/parser/type-compat.ts:90` — `TypeEnv = Readonly<Record<string,
    NamedDecl>>`, the type that carries no own-key constraint.
  - **The eight read sites**, every one an unguarded index read (`env[name]`,
    or `this.env[name]` at the last):
    - `src/parser/type-compat.ts:149` (`unfoldAlias`) — `decl.kind !== "alias"`
      is true for a prototype value, so the name stays `named` and the wrong
      answer is produced downstream, not here.
    - `src/parser/type-compat.ts:238`, `:242`, `:252` (`decide`'s TYPE-10 arms,
      `:237–252`) — wrong `"incompatible"` where `"unknown"` is required.
    - `src/parser/type-compat.ts:365` (`classifyIndexReceiver`) — throws at
      `:373`.
    - `src/parser/type-layer-checks.ts:128` (`classifyOperand`) — throws at
      `:136`.
    - `src/parser/type-layer-checks.ts:171` (`classifyReceiver`) — throws at
      `:178`.
    - `src/parser/type-layer-checks.ts:906` (`declaredFieldsOf`) — the one read
      that is already safe: `decl.kind !== "object-schema"` returns `undefined`
      for a prototype value.
  - `src/parser/type-layer-checks.ts:462` (`annotationToCompatType`'s
    fallback) — every annotation text that is not a primitive, a top-level
    union, or `array<T>` becomes `{ kind: "named", name: text }` verbatim, with
    no case or resolvability test. This is what puts a lowercase annotation
    into the engine.
  - `src/parser/static-type-inference.ts` — the five arms that mint a `named`
    type from an author-chosen name, each a route into the throwing
    classifiers: `:215` (a free identifier), `:244` (a member read's field
    name), `:252` (a call's callee name), `:258` (an object constructor's type
    name), `:262` (a method call's method name).
  - **The throwing callers**: `checkPlusOperands`
    (`src/parser/type-layer-checks.ts:1256–1257`), `checkOrderingOperands`
    (`:1291–1292`), `checkMemberAccess` (`:1218`), and `checkIndex` (`:1160`)
    through `checkIndexReceiver` (`src/runtime/expression-evaluator.ts:621`).
  - **Both env construction call sites** share the defect: `checkTypeLayer`
    (`src/parser/type-layer-checks.ts:218`, walked at `:223`) and
    `resolveQuerySchemas` (`src/parser/query-schema-resolve.ts:81`).
  - **The load path, no catch between the throw and the compose pass.**
    `parseThetaDocument` calls `checkTypeLayer` unguarded
    (`src/parser/theta-document.ts:843`); `parseDiscoveredTheta`
    (`src/extension/production-composition.ts:1940`) is called unguarded from
    the parse loop at `:635`; that loop is inside `runComposePass` (`:395`),
    whose two call sites are `discoverAndComposeFixtures` (`:350`) and
    `composeExtensionInstance` (`:1042`, awaited at `:1155`). The first throw
    aborts the whole loop, so no later theta is parsed and no earlier theta's
    diagnostics are emitted.
  - **Where the throw lands.** The factory's compose-supplier catch
    (`src/extension/factory.ts:702–719`) converts it to one
    `theta/load/extension-compose-failed` (`composeFailedDiagnostic`, `:170`)
    and falls back to `registerFixtures(deps.fixtures)`.
  - **The shielded direction.** `theta/parse/schema-case-mismatch`
    (`docs/spec_topics/diagnostics/code-registry-parse.md:20`) refuses a
    lowercase-headed name at every declaration position, and all twelve
    `Object.prototype` own property names begin with a lowercase letter or `_`
    (`constructor`, `__defineGetter__`, `__defineSetter__`, `hasOwnProperty`,
    `__lookupGetter__`, `__lookupSetter__`, `isPrototypeOf`,
    `propertyIsEnumerable`, `toString`, `valueOf`, `__proto__`,
    `toLocaleString`). No declaration can therefore occupy one of these keys
    without an error-severity refusal, and the `__proto__` write hazard is
    unreachable through the grammar. The shield is one-directional: it
    constrains the writes at `:298`/`:303`, not the reads.
  - **The fixed sibling record, one level down.** `collectSchemaFields`
    (`src/parser/type-layer-checks.ts:417–431`) already uses
    `Object.create(null)`, and its lookup is own-key-guarded with
    `Object.hasOwn` (`:889`) —
    [0031](./0031-ctor-field-value-typing-unchecked.md) §Fix (0.43.0):100.
- **Observed at:** `0.45.0` (`f959f8de`). Fully offline and deterministic — no
  live model, no provider.
- **Fix ordering:** none. The fix is confined to `collectTypeEnv`'s record and
  the eight reads listed above; no other open bug touches them.

## Fix (0.48.0)

The settled §Fix, implemented as written, both halves; four review rounds and
three fixer rounds hardened the prose and the witness. Line anchors are at the
fix commit.

**The construction site.** `collectTypeEnv` (`src/parser/type-layer-checks.ts`)
builds its record with `Object.create(null)` in place of `{}`, matching the
sibling `collectSchemaFields` (`:417`) that 0031 null-prototyped one level down.
The doc comment carries the reason: a `NamedType` *reference* is under no case
constraint — unlike a declaration position, which
`theta/parse/schema-case-mismatch` refuses — so a reference may spell an
`Object.prototype` own property verbatim, and a prototype-bearing record
manufactures a declared type for a name no `schema` statement wrote.

**The reads.** One exported `resolveNamed(env, name): NamedDecl | undefined`
(`src/parser/type-compat.ts`, beside the `TypeEnv` declaration) returns
`Object.hasOwn(env, name) ? env[name] : undefined`, and all eight read sites go
through it: `unfoldAlias`, `decide`'s three TYPE-10 arms, `classifyIndexReceiver`
(type-compat.ts) and `classifyOperand`, `classifyReceiver`, `declaredFieldsOf`
(type-layer-checks.ts). Post-fix the complete set of `env[` occurrences under
`src/parser/` is the guarded read inside `resolveNamed` plus `collectTypeEnv`'s
two writes — zero unguarded reads remain. The guard is what makes the fix hold
for a `TypeEnv` constructed anywhere else, including `tests/type-compat.test.ts`'s
plain-`{}` literals and the genuine plain-`{}` env at
`src/runtime/expression-evaluator.ts:590`.

**Each half is independently load-bearing, measured.** Neutralising the
construction alone reds exactly the two construction pins (g1/g2) and nothing
else; neutralising the read guard alone reds exactly the twelve plain-`{}`
engine pins and nothing else; neutralising both reds 49 of 78. The classifiers'
two guards recover their stated invariant — past them the declaration is an
`alias` and `decl.rhs` is a `CompatType` — rather than the throw being relocated:
an unresolvable name answers `"unknown"` and defers, which is
[type-system.md:48](../spec_topics/type-system.md#type-compatibility)'s
disposition.

**No spec or registry edit.** DIAG-2 is not engaged: no code is added, removed,
or re-triggered. `theta/parse/let-rhs-type-mismatch`
(`code-registry-parse.md:54`) and `theta/parse/object-field-type-mismatch`
(`:46`) both delegate the judgement to §Type compatibility, whose §Unresolvable
operands rule the fix now satisfies — the implementation moved to match the
registered triggers, so no Trigger prose became inaccurate. H9a's
`tests/fixtures/h7a/permitted-codes.json` is untouched. GOV-15 does not range
over the affected inputs: every w-row emitted an `E` and every t-row failed to
load, so none satisfied the loads-cleanly predicate
(`source-language-stability.md:9`). No runtime change — both edited files are
parse-phase, and the four `src/runtime/` helpers importing `type-compat` are
static checkers whose only callers are in `type-layer-checks.ts`.

**Reproduction re-derived at the fix baseline** (`562d3607`, 0.47.0): all 8
w-rows, 11 t-rows, 11 c-rows, 2 L-rows and 5 engine rows byte-identical to the
recorded 0.45.0 tables — zero drift across two releases. The ten-name annotation
sweep was extended to all twelve `Object.prototype` own names; the two §Reproduction
left to mechanism (`__defineSetter__`, `__lookupSetter__`) behave identically, so
the claim for them is now measured. Post-fix: w1–w6 load silently matching
c1/c2/c3; w7/w8 keep `theta/parse/unresolved-named-type` alone matching c4/c5;
t1–t11 load; L1 takes L2's shape (`registered=["actl","zctl"]`,
`notified=["unknown identifier 'constructor'"]`); c1–c11 byte-unchanged.

**Two §Fix predictions were measured false and are corrected here.**
(1) *Post-fix observables* predicted "t8–t11 silent as their `zzz`-named
counterparts are". The rule is right and the values are not: t10
(`"x".toString() + 1`) reports `theta/parse/unknown-method: unknown method
'toString' on type string` and t11 (`constructor { a: 1 }`) reports
`theta/parse/unresolved-named-type`, because their counterparts are not silent
either — `"x".zzz() + 1` draws the method gate and `Zzz { a: 1 }` draws bug
0025's constructor-name gate. The lock asserts the measured counterpart
disposition, so the rows pin the rule §Fix states rather than the value it
mis-derived. (2) §Affected calls the `__proto__` write "unreachable through the
grammar". The grammar admits it: `theta/parse/schema-case-mismatch` is a
contextual lexer diagnostic (`src/lexer/lexer.ts:833`), not a parse refusal, so
the `SchemaDecl` reaches `doc.body.statements` and `checkTypeLayer` runs over it
ungated (`theta-document.ts:843`). The bound is the `E` severity denying
registration, not the grammar. Measured at the neutralised baseline,
`schema __proto__ { a: number }` beside `let c: kind = 3` draws a spurious
`let-rhs-type-mismatch: expected kind, got integer`, `let c: fields = 3` the same
under the other own property name, and `let r = 1 + kind` the `TypeError` — all
three closed by the fix, all three locked.

**Offline lock.** `tests/typeenv-prototype-names.test.ts` (78 tests): (a) w1–w8
as complete ordered diagnostic lists, (b) the w1 shape as a table over
`Object.getOwnPropertyNames(Object.prototype)` behind a loud non-empty
precondition guard, (c) t1–t11 as an explicit `not.toThrow` gate plus each row's
measured disposition with the four `zzz`-named counterparts pinned beside them,
(d) L1 through `discoverAndComposeFixtures` over a `mkdtemp` root with L2 as the
measured control, (e) c1–c11 byte-unchanged controls, (f) the three exported
engine entry points × four names × both env constructions — the plain-`{}` side
the read-guard witness, the `Object.create(null)` side the construction witness,
(g) three direct pins on the exported `collectTypeEnv` including §Reproduction's
synthetic `__proto__`-named statement, (h) the author-reachable `__proto__`
route. Every expected message is read from the live registry through
`registryMessage` (DIAG-4); a missing row throws naming it, never skips.
Prototype-collision pins for the sibling record stay at
`tests/ctor-field-type-check.test.ts:522–593` (0031's p1–p4); these are their
env-level counterparts. Full gate 238 files / 3054 tests; typecheck and lint
clean. Live: H8a `live-production-acceptance` 7/7 and the whole live suite 13
files / 35 tests green, plus a scratch H8a probe — a registrable theta carrying
`let c: constructor = 3`, and a discovery root whose middle file is
`let r = 1 + constructor` — green with the fix and red with it neutralised (zero
thetas registered, including the clean one sorting ahead of the crasher), then
deleted.

**0031 residual (ii) discharged.** That fix recorded `collectTypeEnv`'s `env` as
"the same prototype-hazard class one level up … shielded at the schema-name
position by `theta/parse/schema-case-mismatch`". The class is closed here, and
the recorded shield is weaker than stated in two ways this fix measured: it is a
load gate rather than a grammar refusal, and it never covered the read side,
where both symptoms lived.

**Residuals.** (i) `theta/parse/fn-arg-type-mismatch` stays unreachable —
`checkFnArgCompat` (`type-compat.ts:436`) has no caller in `src/`, so a mistyped
argument against a declared schema parameter is silent. Pre-existing, orthogonal,
recorded as a §Non-goal and unchanged. (ii) A lowercase `NamedType` at a
*reference* position is still admitted without a case diagnostic
(`let a: nope = 3` is silent), which is what puts an author-chosen lowercase name
into the engine at all. §Non-goals; unchanged. (iii) `enum` declarations are
still absent from the `TypeEnv`, so an `enum`-named annotation stays unresolvable
at every position — 0031's recorded non-goal, unchanged, and pinned negative by
0031's residue tests so a later widening is deliberate. (iv) The parse phase
carries no registered internal-defect code; the fix removes the throw rather than
reporting it, so the question is not engaged.

## Summary

`collectTypeEnv` returns a plain object literal keyed by declaration names. A
`NamedType` is resolved by `env[name]`, so JS prototype inheritance supplies an
answer for the twelve `Object.prototype` own property names. The engine reads a
truthy answer as "this name names a declaration".

The `TypeEnv` has no entry for `constructor`. Reading it yields
`Object.prototype.constructor`, a `Function`. `let c: constructor = 3` therefore
reports `theta/parse/let-rhs-type-mismatch: let binding 'c' initialiser type
mismatch: expected constructor, got integer` — a mismatch against a type that no
declaration declares. `let u: Missing = 3` and `let u: nope = 3`, both equally
undeclared, load silently: `decide` answers `"unknown"` for them and every
caller skips, which is the disposition
[type-system.md:48](../spec_topics/type-system.md#type-compatibility) requires
and the disposition the registered `let-rhs-type-mismatch` Trigger's
"statically resolvable" qualifier
(`code-registry-parse.md:54`) presupposes.

The three classifiers do not answer wrongly; they throw. `classifyOperand`,
`classifyReceiver`, and `classifyIndexReceiver` each test
`decl.kind === "object-schema"` and, failing that, recurse into `decl.rhs`
treating the declaration as a transparent alias. A `Function` has neither
property, so the recursive call receives `undefined` and its own `switch
(type.kind)` throws. Every route that reaches a classifier with a
prototype-named `CompatType` therefore aborts the parse:

```
let r = 1 + constructor
```

throws `TypeError: Cannot read properties of undefined (reading 'kind')` from
`type-layer-checks.ts:112`, out through `checkTypeLayer` and
`parseThetaDocument`. The matched control `1 + zzz` reports
`theta/parse/unknown-identifier` and loads. The reachable routes are wider than
annotation positions, because `static-type-inference.ts` mints a `named` type
from an author-chosen name at five arms: a free identifier (`:215`), a member
read's field name (`:244`), a call's callee (`:252`), a constructor's type name
(`:258`), and a method call's method name (`:262`). `"x".toString() + 1` and
`s.toString + 1` both throw.

The load consequence is measured, not inferred. Against the shipped composition
root over a discovery root holding one crashing theta and two clean ones,
`discoverAndComposeFixtures` throws: **zero** thetas register — including the
clean theta that sorts ahead of the crasher — and **zero** notifications reach
the author. The same input shape with `zzz` in place of `constructor` drops the
one malformed theta with its `unknown identifier 'zzz'` notification and
registers both clean thetas.

[0031](./0031-ctor-field-value-typing-unchecked.md) closed this hazard class one
level down: its review found the declared-field record leaking the same way,
and the fix null-prototyped it and own-key-guarded its lookup. The `env` itself
was recorded there as "the same prototype-hazard class one level up"
(§Fix (0.43.0):165–169). The shield that residual names —
`theta/parse/schema-case-mismatch` over lowercase declaration names — covers
only the write side.

## Reproduction

Offline, deterministic, at `f959f8de`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`; the load
rows drive `discoverAndComposeFixtures`
(`src/extension/production-composition.ts:341`) over a `mkdtemp` workspace, the
pattern of `tests/ctor-unresolved-schema-name.test.ts:511`. "static" is the full
parse diagnostic list; a throw is recorded as the caught error. All fixtures are
`mode: prompt`.

Wrong-diagnostic rows — the annotation is statically unresolvable, and the
engine reports a mismatch:

| # | fixture | static |
|---|---|---|
| w1 | `let c: constructor = 3` | `theta/parse/let-rhs-type-mismatch`: `let binding 'c' initialiser type mismatch: expected constructor, got integer` |
| w2 | `let c: toString = 3` | same, `expected toString` |
| w3 | `let c: __proto__ = 3` | same, `expected __proto__` |
| w4 | `let c: constructor = "s"` | same, `expected constructor, got string` |
| w5 | `let mut c: constructor = 3` | same as w1 |
| w6 | `let xs: array<constructor> = ["a"]` | `let-rhs-type-mismatch`: `expected array<constructor>, got array<string>` **and** `theta/parse/array-element-type-mismatch`: `array element type mismatch at index 0: expected constructor, got string` |
| w7 | `schema S { f: constructor }` + `let s = S { f: 3 }` | `theta/parse/unresolved-named-type`: `unresolved named type 'constructor'` **and** `theta/parse/object-field-type-mismatch`: `field 'f' on schema 'S' type mismatch: expected constructor, got integer` |
| w8 | `schema A = constructor` + `let a: A = 3` | `unresolved-named-type`: `unresolved named type 'constructor'` **and** `let-rhs-type-mismatch`: `expected A, got integer` |

The w1 shape is not specific to `constructor`. Ten of the twelve names were
probed individually in the w1 fixture — `constructor`, `toString`, `valueOf`,
`hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`,
`__proto__`, `__defineGetter__`, `__lookupGetter__` — and each reports the w1
message with its own name interpolated. `__defineSetter__` and
`__lookupSetter__` were not probed individually; they are own properties of
`Object.prototype` by the same read
(`Object.getOwnPropertyNames(Object.prototype)`), so the mechanism is the same
and the claim for them is by mechanism, not by measurement.

w7 and w8 are the sharpest of this group: two checkers in the same parse
disagree about the same name. `theta/parse/unresolved-named-type` resolves
`constructor` against the body's declarations and reports it unresolved; the
type layer resolves it against the `TypeEnv` and reports a mismatch as if it
resolved.

Throwing rows — the parse aborts with no diagnostic:

| # | fixture | static |
|---|---|---|
| t1 | `let r = 1 + constructor` | `TypeError: Cannot read properties of undefined (reading 'kind')` at `classifyOperand` (`type-layer-checks.ts:112`), via `checkPlusOperands` (`:1257`) |
| t2 | `let r = 1 < toString` | same, via `checkOrderingOperands` (`:1292`) |
| t3 | `let r = constructor.x` | same at `classifyReceiver` (`:159`), via `checkMemberAccess` (`:1218`) |
| t4 | `let r = valueOf[0]` | same at `classifyIndexReceiver` (`type-compat.ts:354`), via `checkIndexReceiver` (`expression-evaluator.ts:621`) |
| t5 | `fn f(x: constructor): number { x + 1 }` + `let r = f(1)` | t1's throw — the parameter's binding type is `named "constructor"` |
| t6 | `fn f(x: __proto__): number { let m = x.nope` … `}` (member read in the body) | t3's throw |
| t7 | `schema A = constructor` + `fn f(x: A): number { x + 1 }` | t1's throw, one alias unfold deeper (three `classifyOperand` frames) |
| t8 | `schema S { a: number }` + `let s = S { a: 1 }` + `let r = s.toString + 1` | t1's throw — the member read types as `named "toString"` (`static-type-inference.ts:244`) |
| t9 | `fn toString(): number { 1 }` + `let r = toString() + 1` | t1's throw — the call types as `named "toString"` (`:252`) |
| t10 | `let r = "x".toString() + 1` | t1's throw — the method call types as `named "toString"` (`:262`) |
| t11 | `let v = constructor { a: 1 }` + `let r = 1 + v` | t1's throw — the constructor types as `named "constructor"` (`:258`) |

Matched controls, same shape with an undeclared non-prototype name:

| # | fixture | static |
|---|---|---|
| c1 | `let u: Missing = 3` | none — loads |
| c2 | `let u: nope = 3` | none — loads |
| c3 | `let xs: array<Missing> = ["a"]` | none — loads |
| c4 | `schema S { f: Missing }` + `let s = S { f: 3 }` | `unresolved-named-type`: `unresolved named type 'Missing'` — one code, no mismatch |
| c5 | `schema A = Missing` + `let a: A = 3` | `unresolved-named-type` alone |
| c6 | `let r = 1 + zzz` | `theta/parse/unknown-identifier`: `unknown identifier 'zzz'` |
| c7 | `let r = 1 < zzz` | `unknown-identifier` |
| c8 | `let r = zzz.x` | `unknown-identifier` |
| c9 | `fn f(x: Missing): number { x + 1 }` + `let r = f(1)` | none — loads |
| c10 | `let r = constructor` (bare, no operator) | `unknown-identifier`: `unknown identifier 'constructor'` |
| c11 | `schema Good { a: number }` + `let v: Good = 3` | `let-rhs-type-mismatch`: `expected Good, got integer` — the correct positive |

c10 is the control that isolates the mechanism: the identifier checker reports
`constructor` unresolved and the parse completes, so the crash is contributed by
the type layer's own resolution, not by name resolution generally.

Load rows — the shipped composition root over `.pi/theta/` holding
`actl.theta` (clean), `mcrash.theta`, `zctl.theta` (clean):

| # | `mcrash.theta` body | `discoverAndComposeFixtures` | notifications |
|---|---|---|---|
| L1 | `let r = 1 + constructor` | throws `TypeError` at `classifyOperand` | none — the throw precedes every `emitGroup` |
| L2 | `let r = 1 + zzz` | returns; registers `["actl","zctl"]` | `["unknown identifier 'zzz'"]` |

Engine rows — the fix mechanism measured directly on the shipped engine, one
env a plain `{}` and one `Object.create(null)`, everything else identical
(`checkCompatible`, `checkLetRhsCompat`, `classifyIndexReceiver` are exported):

| annotation | `checkCompatible(integer, named)` plain → null-proto | `checkLetRhsCompat` plain → null-proto | `classifyIndexReceiver` plain → null-proto |
|---|---|---|---|
| `constructor` | `incompatible` → `unknown` | one `let-rhs-type-mismatch` → none | throws → `unknown` |
| `toString` | `incompatible` → `unknown` | one `let-rhs-type-mismatch` → none | throws → `unknown` |
| `valueOf` | `incompatible` → `unknown` | one `let-rhs-type-mismatch` → none | throws → `unknown` |
| `__proto__` | `incompatible` → `unknown` | one `let-rhs-type-mismatch` → none | throws → `unknown` |
| `zzz` | `unknown` → `unknown` | none → none | `unknown` → `unknown` |

Positions probed and **not** affected, recorded so the surface is bounded:

- The typed-query annotation `@<constructor>` reports
  `unresolved-named-type: unresolved named type 'constructor'` and nothing
  else, matching `@<Missing>` exactly.
- A `params:` field type `p: constructor` reports `unresolved-named-type`
  alone, matching `p: Missing`.
- `invoke<constructor>("./x.theta")` is silent, matching
  `invoke<Missing>(…)`.
- A `fn` return annotation `fn f(): constructor { 3 }` is silent, matching
  `fn f(): Missing { 3 }`.
- The `fn`-argument slot emits nothing for any name: `checkFnArgCompat`
  (`src/parser/type-compat.ts:436`) has no caller in `src/`, so
  `theta/parse/fn-arg-type-mismatch` is unreachable at HEAD and a mistyped
  argument against a *declared* schema parameter is silent too. Separate
  pre-existing gap; see §Non-goals.
- `declaredFieldsOf` (`type-layer-checks.ts:906`) returns `undefined` for a
  prototype value, so a *constructor name* that is a prototype member skips the
  0031 field check rather than mis-answering it. w7's wrong emission comes from
  the field's declared *type* passing through `checkCompatible`, not from the
  fields record.
- The `__proto__` **write** is unreachable: `schema __proto__ { … }`,
  `enum __proto__ { … }`, and `schema __proto__ = number` all report
  `theta/parse/schema-case-mismatch: schema name must start with an uppercase
  letter`. Driving `collectTypeEnv` with a synthetic `__proto__`-named schema
  statement confirms what the grammar prevents: the assignment replaces the
  record's prototype instead of creating an own property, `Object.keys(env)` is
  `["Real"]` alone, and the names `kind` and `fields` then resolve to the lost
  declaration's own properties.

## Expected behaviour

**A name no declaration declares is statically unresolvable, and an
unresolvable operand defers.**
[type-system.md §Unresolvable operands](../spec_topics/type-system.md#type-compatibility)
(`docs/spec_topics/type-system.md:48`):

> When either side of a compatibility check is past the parser's static view
> […] the parse-time check is skipped and the runtime AJV check is the safety
> net.

[TYPE-9](../spec_topics/type-system.md#type-9) (`:50`) states the same bound
positively for the site w1 fires at: each of the three sites "reports its own
parse-time diagnostic on a static failure (`T₁ ⋢ T₂`, **both operands
statically resolvable**)". The registered Trigger carries the qualifier
verbatim (`code-registry-parse.md:54`): `let-rhs-type-mismatch` fires "where
the RHS type is statically resolvable". `constructor` names no declaration in
w1's document, so the annotation is not statically resolvable and the row does
not admit the input. Rows w1–w6 emit a code whose registered trigger excludes
them; w7 and w8 emit such a code *beside* a correct
`theta/parse/unresolved-named-type`. c1–c5 and c9 are the same positions
answering correctly for an equally undeclared name.

**Resolution is over the document's declarations.**
[grammar.md:98](../spec_topics/grammar.md#type-grammar) gives `NamedType ::=
Ident // schema or enum name (PascalCase)`;
[code-registry-parse.md:89](../spec_topics/diagnostics/code-registry-parse.md)
pins resolution as "whole-file over the body's top-level declarations — a
top-level `schema` / `enum` declaration or a symbol imported from a
`.thetalib`". A host language's object prototype is not among the sources. The
`unresolved-named-type` checker implements this and answers correctly for
`constructor` at every position that row lists (w7, w8, and the `@<T>` and
`params:` probes); the type layer answers from a different, prototype-bearing
map.

**The parse reports; it does not throw.** The registry carries no `phase: parse`
row for an internal throw. `theta/runtime/internal-error`
(`docs/spec_topics/diagnostics/code-registry-runtime.md:22`) covers "the
interpreter or an adapter it called threw an exception outside the closed
theta 1.0.0 panic-source list" — phase `runtime`, not `parse`. The only
registered code the t-rows can surface under is
`theta/load/extension-compose-failed`
(`docs/spec_topics/diagnostics/code-registry-load.md:10`), whose Trigger is "a
throw escapes the whole `session_start`-time `composeInstance` compose pass —
the discovery walk, settings read, parse, schema compile, or registry build",
and whose Hint reads "the compose pass failed before any theta registered on
this pass". That row exists for host-level failures; it carries `details: {
error }` and a message of `extension compose failed: <error>` — no file, no
span, no theta name. Reaching it from a two-line theta body is an escape from
[DIAG-1](../spec_topics/diagnostics/diagnostic-shape.md#diag-1)'s per-site
attribution ("tests are entitled to assert on the specific code at every
documented diagnostic site"): the site here is an expression in one file, and
the observable is a whole-pass load failure naming a JS `TypeError`.

**The theta 1.x equivalence promise is not engaged.**
[GOV-15](../spec_topics/governance/source-language-stability.md#gov-15)'s
loads-cleanly predicate (`source-language-stability.md:9`) selects inputs that
emit "no diagnostic of effective severity `error`". Every w-row emits an `E`
today and every t-row fails to load at all, so the affected inputs are outside
the promise's input set and the fix needs no carve-out.

## Actual behaviour / root cause

1. **The record inherits.** `collectTypeEnv`
   (`type-layer-checks.ts:281–310`) opens with
   `const env: Record<string, NamedDecl> = {}` (`:282`) and writes only
   `schema` declarations (`:298`, `:303–306`). `Object.prototype` is on the
   chain, so `env["constructor"]` answers
   `Object.prototype.constructor` — the `Function` `Object` — and
   `env["toString"]`, `env["valueOf"]`, `env["__proto__"]` and the other eight
   answer their prototype values. Measured over `collectTypeEnv([])`:
   `Object.keys(env)` is `[]` while `env["constructor"]`,
   `env["toString"]`, and `env["valueOf"]` are each a `function`.

2. **`decide` tests presence, not shape.** The TYPE-10 arm
   (`type-compat.ts:237–248`) is a pair of `env[name] === undefined` tests. A
   prototype value is not `undefined`, so a `named` sup passes as present; with
   an `integer` sub (not `named`), control falls to `return "incompatible"`
   (`:247`). `checkLetRhsCompat` (`:387`) routes `"incompatible"` to
   `theta/parse/let-rhs-type-mismatch` and interpolates the annotation text
   through `displayType` (`:302–317`), which for a `named` returns `type.name`
   unchanged — hence `expected constructor`. `unfoldAlias` (`:139–162`) does
   not intervene: `decl.kind !== "alias"` holds for a `Function`, so the name
   is returned as-is at `:151`.

3. **The classifiers dereference the alias RHS unconditionally.** Each of the
   three has the same shape, e.g. `classifyOperand`
   (`type-layer-checks.ts:127–137`):

   ```ts
   case "named": {
     const decl = env[type.name];
     if (decl === undefined) {
       return "unknown";
     }
     if (decl.kind === "object-schema") {
       return "other";
     }
     // A transparent alias (TYPE-11): classify its resolved RHS.
     return classifyOperand(decl.rhs, env);
   }
   ```

   The comment states the invariant the two guards are meant to establish: past
   them, the declaration is an `alias` and `decl.rhs` is a `CompatType`. A
   prototype value satisfies neither guard and has no `rhs`, so the recursive
   call receives `undefined` and its `switch (type.kind)` (`:112`) throws. The
   `NamedDecl` union (`type-compat.ts:82–87`) makes the invariant true by
   construction for every value the two writes at `:298`/`:303` put in — the
   only values that violate it are the ones the prototype supplies.
   `classifyReceiver` (`:170–179`) and `classifyIndexReceiver`
   (`type-compat.ts:364–374`) are the same three lines.

4. **Five inference arms feed author-chosen names into the classifiers.**
   `StaticTypeInferencePass` types a free identifier as
   `{ kind: "named", name: node.name }` (`static-type-inference.ts:215`), a
   member read as its field name (`:244`), a call as its callee (`:252`), an
   object construction as its type name (`:258`), and a method call as its
   method name (`:262`). Each is a name the author writes, under no case
   constraint at these positions. `checkPlusOperands` (`:1256–1257`),
   `checkOrderingOperands` (`:1291–1292`), `checkMemberAccess` (`:1218`), and
   `checkIndex` (`:1160`) then hand those types to the classifiers. This is why
   the throwing surface is not limited to annotations: t8–t11 carry no
   annotation at all.

5. **Annotations reach the same place through `annotationToCompatType`.** Its
   fallback (`:462`) returns `{ kind: "named", name: text }` for any text that
   is not a primitive, a top-level union, or `array<T>` — no case test, no
   resolvability test. `theta/parse/schema-case-mismatch`
   (`code-registry-parse.md:20`) constrains declaration positions only, so
   `let c: constructor = 3` and `fn f(x: constructor)` parse without a case
   diagnostic (probed: `let a: nope = 3` is silent too).

6. **The load pass has no recovery point.** `parseThetaDocument` calls
   `checkTypeLayer` at `theta-document.ts:843` with no `try`. The parse loop at
   `production-composition.ts:635` calls `parseDiscoveredTheta` (`:1940`) with
   no `try`. So the first throwing file ends the loop: files already parsed
   never reach their `sink.emitGroup` (`:643`, `:652`) and files after it are
   never read. `composeExtensionInstance` awaits `runComposePass` unguarded
   (`:1155`). The nearest catch is the factory's compose supplier
   (`factory.ts:702–719`), which emits one
   `theta/load/extension-compose-failed` and calls
   `registerFixtures(deps.fixtures)`. Measured through
   `discoverAndComposeFixtures`: the throw escapes, no fixture list is
   returned, and the two clean thetas in the same root do not register.

7. **The sibling record was fixed; this one was recorded and left.**
   `collectSchemaFields` (`:417–431`) constructs with `Object.create(null)`
   and its consumer guards with `Object.hasOwn` (`:889`) — 0031's review
   finding F1. 0031 §Fix (0.43.0):165–169 names `collectTypeEnv`'s `env` as
   the same class "one level up, pre-existing at baseline, shielded at the
   schema-name position by `theta/parse/schema-case-mismatch`". The shield
   holds for what that residual claimed — a *declaration* cannot take a
   prototype key — and does not reach the read side, which is where both
   symptoms live.

## Why it matters

- **A diagnostic fires against a type that does not exist.** w1's message
  names `constructor` as an expected type. No declaration in the document
  declares it, `theta/parse/unresolved-named-type` says so in w7 and w8 of the
  same parse, and the registered Trigger for the emitted code excludes
  statically unresolvable operands. An author cannot act on the message: there
  is no `constructor` type to satisfy.
- **A two-line theta body takes down every theta in the discovery root.**
  Measured: `let r = 1 + constructor` in one file leaves `actl.theta` and
  `zctl.theta` unregistered and emits no per-file diagnostic. The recovery
  observable is one `theta/load/extension-compose-failed` naming a JS
  `TypeError` with no file and no span, from a row whose Trigger is a host-level
  compose failure.
- **The throwing surface is not opt-in.** t8–t11 need no annotation:
  `s.toString + 1`, `toString() + 1`, `"x".toString() + 1`. `toString`,
  `valueOf`, and `constructor` are ordinary field and function names, and the
  lowercase-first rule for fields and functions
  ([lexical.md:15](../spec_topics/lexical.md)) puts every one of the twelve
  prototype names inside the admitted name space for exactly those positions.
- **Two checkers in one parse disagree about the same name.** w7 emits
  `unresolved named type 'constructor'` and `field 'f' on schema 'S' type
  mismatch: expected constructor` together. Whichever is right, the pair is not
  a coherent report, and it reaches an author who wrote one field.
- **The precedent fix is in the same file.** The declared-field record built at
  `type-layer-checks.ts:417–431` is null-prototyped and own-key-guarded against
  this exact hazard; the env constructed at `:282` is not. The 0031 residual
  predicted the filing.

## Fix

Null-prototype the `TypeEnv` record and own-key-guard its reads, so a
prototype member name answers `undefined` → `"unknown"` → deferred, exactly as
any other undeclared name does.

**The construction site.** In `collectTypeEnv`
(`src/parser/type-layer-checks.ts:282`), build the record with
`Object.create(null)` in place of `{}`, matching `collectSchemaFields` (`:417`,
whose doc comment at `:400–416` already states the reasoning for the sibling
record). This alone closes both symptoms, because a null-prototype object
answers `undefined`
for every name not written at `:298`/`:303`, and it also makes the `__proto__`
write an ordinary own property rather than a prototype replacement (verified:
on `Object.create(null)`, `o["__proto__"] = v` yields
`Object.hasOwn(o, "__proto__") === true`, `Object.keys(o) === ["__proto__"]`,
and the prototype still `null`).

**The reads.** Guard each of the eight `env[name]` sites with `Object.hasOwn`,
mirroring `:889`, so the invariant is enforced where it is consumed and not
only where the record is built. One guarded resolver — a single exported
`resolveNamed(env, name): NamedDecl | undefined` in `type-compat.ts` beside the
`TypeEnv` declaration at `:90` — carries it in one place for all eight:
`type-compat.ts:149`, `:238`, `:242`, `:252`, `:365` and
`type-layer-checks.ts:128`, `:171`, `:906`. This is what makes the fix hold for
a `TypeEnv` value constructed anywhere else, including the plain-`{}` literals
`tests/type-compat.test.ts` uses (`:61`, `:82`, `:138`, `:149`, `:321`, `:347`,
`:354`, `:367`).

**No registry change.** The affected rows keep their triggers.
`theta/parse/let-rhs-type-mismatch` (`code-registry-parse.md:54`) already
excludes a statically unresolvable RHS, so the fix makes the implementation
match the registered trigger rather than editing it; the same holds for
`theta/parse/array-element-type-mismatch` (`:40`) and
`theta/parse/object-field-type-mismatch` (`:46`). No new code is needed for the
throwing rows: they become silent loads. The two rows that *keep* firing on
w7/w8 — `theta/parse/unresolved-named-type` (`:89`) — are the correct answer at
those positions and are untouched. Nothing engages
[DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2), and
[GOV-15](../spec_topics/governance/source-language-stability.md#gov-15)'s
equivalence promise does not range over the affected inputs: every w-row emits
an `E` diagnostic today and every t-row fails to load, so none satisfies the
loads-cleanly predicate (`source-language-stability.md:9`).

**Post-fix observables.** The mechanism is measured (the Engine rows of
§Reproduction: an `Object.create(null)` env flips every affected answer to
`"unknown"` and leaves the `zzz` control identical). The per-row predictions
below follow from that measurement and from each row's measured control; they
are not themselves measured post-fix:

- w1–w5 become silent loads, matching c1/c2 byte-for-byte.
- w6 becomes a silent load, matching c3.
- w7 and w8 keep `theta/parse/unresolved-named-type` alone, matching c4/c5.
- t1–t11 load with whatever their non-type-layer checkers report: t1 with
  `theta/parse/unknown-identifier: unknown identifier 'constructor'` (c10's
  observable), t3 likewise, t8–t11 silent as their `zzz`-named counterparts are.
- L1 becomes L2's shape: the crashing file drops or loads on its own merits and
  both clean thetas register.
- c1–c11 are byte-unchanged. c11 (`let v: Good = 3` against a declared
  `schema Good`) is the positive that proves the guard did not disable
  resolution: an own key still resolves.

**Blast radius, bounded by grep.** The reads are the eight sites enumerated in
§Affected — the complete set of `env[` occurrences under `src/parser/`
(`rg 'env\['`), of which `:298` and `:303` are the two writes and `:261` is a
comment. Every other consumer of the `TypeEnv` (`functions.ts:350`,
`invoke-diagnostics.ts:189`/`:254`/`:385`, `match-result.ts:216`,
`query-schema-inference.ts:227`, `static-type-inference.ts:41`,
`query-schema-resolve.ts:111`) passes the env into `checkCompatible` /
`classify*` and reaches the same eight. `collectTypeEnv`'s two callers
(`type-layer-checks.ts:218`, `query-schema-resolve.ts:81`) both get the fixed
record. `tests/type-compat.test.ts`'s env fixtures declare only `A`, `B`, `C`,
`Cat`, `U` and friends — no prototype-name collision — so an own-key guard
leaves every existing relation test green; the guard is what keeps them green
despite their plain-`{}` literals.

**Test witness — unit, offline, provider-free.** The whole fix is witnessable
at the `parseThetaDocument` boundary plus one composition-root drive. Red-first
coverage: w1–w8 as expected-silence assertions (red at HEAD naming the wrong
code), t1–t11 as `expect(() => parseDoc(…)).not.toThrow()` plus the positive
diagnostic each should carry, L1 through `discoverAndComposeFixtures` over a
`mkdtemp` root asserting both clean thetas register, c1–c11 as byte-unchanged
controls, and one pin per throwing classifier that a null-prototype env answers
`"unknown"` (the Engine rows, which red on the plain-`{}` side today). The
twelve `Object.prototype` own names are enumerable from
`Object.getOwnPropertyNames(Object.prototype)`, so the w-row family is a table
test over that list rather than a hand-picked subset. Nothing on this path
crosses a provider, so no live test applies. Prototype-collision pins already
live at `tests/ctor-field-type-check.test.ts:522–593` (0031's p1–p4) for the
sibling record; the new pins are their env-level counterparts.

## Non-goals

- **Enforcing the case rule at `NamedType` *reference* positions.**
  `grammar.md:98` annotates `NamedType ::= Ident` with "(PascalCase)" and
  `lexical.md:15` requires PascalCase for "any user identifier introduced as a
  type-like binding", but `theta/parse/schema-case-mismatch`'s registered
  Trigger (`code-registry-parse.md:20`) names declaration positions only —
  "a schema / enum / variant / type-alias position". `let a: nope = 3` is
  silent at HEAD. Refusing a lowercase annotation would also close this bug's
  annotation half, and it is a separate widening at a separate position with
  its own registry question. Not filed; the fix here does not depend on it, and
  t8–t11 are outside its reach anyway.
- **`theta/parse/fn-arg-type-mismatch` being unreachable.**
  `checkFnArgCompat` (`type-compat.ts:436`) has no caller in `src/`, so a
  mistyped argument against a declared schema parameter is silent
  (`fn f(x: P): number { 1 }` + `f(3)` reports nothing).
  [TYPE-9](../spec_topics/type-system.md#type-9) (`type-system.md:50`) names the
  site and the row is registered. Pre-existing, orthogonal to the prototype
  chain, and it is why t5's fixture reports the throw and no argument
  diagnostic. Not filed here.
- **Recording `enum` declarations in the `TypeEnv`.** `collectTypeEnv` matches
  `stmt.kind === "schema"` only (`:294`); an `enum`-named annotation stays
  unresolvable at every position. Already a recorded non-goal of
  [0031](./0031-ctor-field-value-typing-unchecked.md), unchanged by this fix.
- **The `NamedDecl` union gaining a runtime shape check.** The union
  (`type-compat.ts:82–87`) is sound for every value the two writes produce; the
  invariant break comes from the prototype supplying non-`NamedDecl` values, not
  from a mis-shaped declaration. A validating read would mask the same class of
  defect instead of removing it.
- **Other prototype-bearing records in the parser.** This report covers the
  `TypeEnv` built by `collectTypeEnv` and its eight reads. A sweep for further
  plain-`{}` records keyed by author-chosen names is adjacent and not filed;
  `StructuralRefs.schemas` (`theta-document.ts:5222`) is a `ReadonlyMap` and
  `bindings` is a `Map`, both immune.
- **The absence of a registered parse-phase throw code.** The t-rows surface
  only under `theta/load/extension-compose-failed`
  (`code-registry-load.md:10`), a host-level row. Whether the parse phase
  should carry its own internal-defect code, on the model of
  `theta/runtime/internal-error` (`code-registry-runtime.md:22`), is a registry
  question this fix does not need: it removes the throw rather than reporting
  it.

## Provenance

- **Origin:** bug 0031's review round 1, finding F1 — the fields-record
  prototype leak. That fix null-prototyped the declared-field record and
  own-key-guarded its lookup, and the reviewer recorded the `TypeEnv` itself as
  "the same prototype-hazard class one level up, pre-existing at baseline". Both
  the finding and the residual are recorded in
  [0031](./0031-ctor-field-value-typing-unchecked.md) §Fix (0.43.0) — the F1
  paragraph at `:99–104`, residual (ii) at `:165–169` — and in
  `.pi/tmp/fixes/0031-report.md` (§Review: "R1: F1 prototype-chain leak
  (blocking-class; fixed — Object.create(null) + Object.hasOwn + 4 pins with
  both-direction proofs)"; §Residuals (ii)).
- **Evidence:** scratch vitest files (deleted after probing) over `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`), `discoverAndComposeFixtures`
  (`src/extension/production-composition.ts:341`) against a `mkdtemp`
  discovery root, and direct calls to the exported `checkCompatible`,
  `checkLetRhsCompat`, and `classifyIndexReceiver` with a plain-`{}` versus an
  `Object.create(null)` env. All 8 w-rows, 11 t-rows, 11 c-rows, 2 L-rows, 5
  engine rows, the ten-name annotation sweep, the seven not-affected positions,
  and the synthetic `__proto__`-write probe measured at `f959f8de`, offline;
  outputs quoted verbatim above.
- **Implementation:** `src/parser/type-layer-checks.ts` (`:111–137`,
  `:158–179`, `:218`, `:223`, `:261`, `:281–310`, `:400–431`, `:441–463`,
  `:889`, `:903–911`, `:1160`, `:1218`, `:1256–1257`, `:1291–1292`),
  `src/parser/type-compat.ts` (`:55–87`, `:90`, `:123–129`, `:139–162`,
  `:164–277`, `:302–317`, `:350–374`, `:387`, `:436`),
  `src/parser/static-type-inference.ts`
  (`:215`, `:244`, `:252`, `:258`, `:262`), `src/parser/query-schema-resolve.ts`
  (`:81`, `:111`, `:484`), `src/parser/theta-document.ts` (`:843`, `:5222`),
  `src/runtime/expression-evaluator.ts` (`:621`),
  `src/extension/production-composition.ts` (`:341`, `:350`, `:395`, `:635`,
  `:1042`, `:1155`, `:1940`), `src/extension/factory.ts` (`:170`, `:702–719`,
  `:1025`), all at `f959f8de`.
- **Spec measured against:**
  [type-system.md §Type compatibility](../spec_topics/type-system.md#type-compatibility)
  (check-site enumeration `:27`, Operational definition `:29`, Unresolvable
  operands `:48`, TYPE-9 `:50`, TYPE-10 `:52`, TYPE-11 `:54`);
  [lexical.md](../spec_topics/lexical.md) (identifier grammar and the
  first-letter case rule `:13–19`, reserved keywords `:20`);
  [grammar.md §Type grammar](../spec_topics/grammar.md#type-grammar)
  (`NamedType ::= Ident` `:98`, generic-application closure `:107`);
  [code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md)
  rows `:20` (`schema-case-mismatch`), `:40`
  (`array-element-type-mismatch`), `:46` (`object-field-type-mismatch`), `:54`
  (`let-rhs-type-mismatch`, the resolvability qualifier), `:89`
  (`unresolved-named-type`, the whole-file resolution rule and its position
  list);
  [code-registry-load.md:10](../spec_topics/diagnostics/code-registry-load.md)
  (`extension-compose-failed`);
  [code-registry-runtime.md:22](../spec_topics/diagnostics/code-registry-runtime.md)
  (`internal-error`, phase `runtime`);
  [DIAG-1](../spec_topics/diagnostics/diagnostic-shape.md#diag-1) and
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)
  (`diagnostic-shape.md:71–72`);
  [GOV-15](../spec_topics/governance/source-language-stability.md#gov-15)
  (`:5`, loads-cleanly predicate `:9`, diagnostic-registry carve-out `:25`).
- **Related bugs:**
  [0031](./0031-ctor-field-value-typing-unchecked.md) — the fixed sibling
  record (`collectSchemaFields`, `Object.create(null)` + `Object.hasOwn`), the
  origin of this filing, and the source of the `theta/parse/object-field-type-mismatch`
  row that w7 mis-emits. Its p1–p4 prototype pins
  (`tests/ctor-field-type-check.test.ts:522–593`) are the shape the env-level
  pins take.
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — widened
  `theta/parse/unresolved-named-type`, the checker that answers `constructor`
  correctly in w7/w8 while the type layer answers it wrongly in the same parse.
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md) — the
  constructor-name resolution gate; its temp-root load-refusal test
  (`tests/ctor-unresolved-schema-name.test.ts:511`) is the harness pattern the
  L-rows use.
