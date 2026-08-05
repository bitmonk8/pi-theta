# Bug 0143 — `WITHHELD_BINDER_TYPE_NAME` is unspellable as a `TypeEnv` KEY but not as a `CompatType` NAME, and the sentinel has two author-visible faces: an author who writes `<withheld>` in any type-slice position mints a twin the withhold predicate cannot distinguish from the engine's own mint, so six judgement sinks go silent where the byte-identical program spelled `<foo>` reports — including a true `array-element-type-mismatch` on an operand the twin does not touch, in a document that then loads clean — while the same ten characters render verbatim into six user-visible *Message* strings

- **Status:** open. §Fix is not settled: this report exists to pin the
  sentinel's spellability contract and the render disposition before any code
  lands. The disposition bug 0050 round 8 left unpinned ("pin the twin's
  deferral disposition in a cell") is still unpinned at HEAD — the u13r cell
  comment (`tests/fn-arg-type-mismatch-wired.test.ts:2742–2746`) names the
  author-twin route in prose and no cell measures it. Coordination, not a hard
  prerequisite: [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md)
  is **fixed (0.77.0)** and its witness pins one of this report's render rows
  byte-exact (`tests/fn-arg-type-mismatch-wired.test.ts:2759`); any fix here
  updates that row deliberately. Four open reports
  ([0124](./0124-parsetype-trailing-punctuation-leniency.md),
  [0126](./0126-plain-for-binds-no-loop-variable.md),
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md),
  [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md)) each own a
  different non-conformant name reaching the same `displayType` arm; whichever
  render-touching fix lands second rebases against the first.
- **Sev/Diff estimate:** S2/D3 — row b6 measures a registered `E` row
  (`theta/parse/array-element-type-mismatch`) not firing on an operand whose
  mismatch is decidable and which both controls report, leaving a document that
  loads clean and registers, which is S1's shape; discounted to S2 because
  every input reaching it must spell the engine's own ten-character sentinel in
  a type annotation, no shipped `.theta` or `.thetalib` does
  (`rg -lF '<withheld>' --glob '*.theta' --glob '*.thetalib'` returns nothing at
  HEAD), and the second face is a display string whose verdicts are
  byte-identical to the pre-0050 baseline. D3 because the render half lands on
  `type-compat.ts:324–325`, the arm four open reports cite, under u13r's
  byte-exact pin, and because the choice between renaming the sentinel,
  carrying provenance on the `named` arm, and refusing the spelling at capture
  is an in-run adjudication against DIAG-2 / DIAG-4 / GOV-7-8.
- **Kind:** two defects against the same object, one root.
  1. **Collision — defect against `docs/spec_topics/type-system.md:48` read
     with `docs/spec_topics/grammar.md:90–102` and `:105`.** The sentinel is
     `"<withheld>"` (`src/parser/type-layer-checks.ts:387`) and
     `containsWithheldBinderType` (`:409–423`) tests `type.name ===
     WITHHELD_BINDER_TYPE_NAME` with nothing else to test — `CompatType`'s
     `named` arm carries a bare `string` and no provenance
     (`src/parser/type-compat.ts:58`). `annotationToCompatType`
     (`type-layer-checks.ts:810`, final arm `:831`) mints
     `{ kind: "named", name: text }` from a trimmed source slice with no
     identifier test, and `parseType` (`src/parser/theta-document.ts:2970`)
     returns `parts.join("")` (`:3080`) over token texts with a depth counter
     that admits a balanced `<…>` group whole (`:3061–3068`). So author text
     produces a `CompatType` byte-equal to the engine's mint, and the six gated
     sinks withhold on it. `type-system.md:48` licenses skipping a check whose
     operand is past the parser's static view; it does not license one
     unresolvable spelling being skipped where every other unresolvable
     spelling at the same position is judged. Measured, seven differentiator
     rows.
  2. **Render — defect against
     `docs/spec_topics/diagnostics/placeholder-rendering-a.md:19` read with
     `docs/spec_topics/lexical.md:13`.** `displayType`'s `case "named"`
     (`type-compat.ts:324–325`) returns `type.name` verbatim, so `<withheld>`
     reaches a `<type>` / `<actual>` / `<left>` / `<element>` placeholder in six
     measured *Message* strings. Category 1 admits a `named` rendering only as
     "Named schemas, enums, and type aliases by their theta-side identifier …
     the identifier shape is fixed by [Lexical — Identifiers]" (`:19`), and
     `lexical.md:13` fixes that shape as `[A-Za-z_][A-Za-z0-9_]*`.
     `<withheld>` matches no clause. **Bound:** at the pre-0050 baseline
     (`67a474f2`) the same five withheld-binder-fed positions rendered the
     binder's own spelling (`array<x>`, `Result<x, QueryError>`) — equally
     outside category 1, differently spelled — with byte-identical codes,
     severities and ranges (measured, group (d)). This face is a rendering
     change, not a verdict change.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the origin. Its §Fix (0.77.0) discloses both faces by
    name ("the `<withheld>` author-twin pinhole and render shapes") and routes
    them here. The sentinel, the predicate and the eight gate call sites all
    land in that fix. Its witness cell u13r pins the `array<<withheld>>`
    rendering byte-exact (`tests/fn-arg-type-mismatch-wired.test.ts:2759`) and
    its comment (`:2742–2746`) states the sixth shape this report measures.
  - [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) —
    **open**, the sibling sentinel report, and the closest relative. Same two
    faces, different sentinels, and **this report's sentinel is strictly harder
    to weaponise on the second face**: 0135's `index` is an ordinary lowercase
    identifier, so `schema index = string` enters the `TypeEnv` and
    `resolveNamed` answers with the author's declaration; `<withheld>` cannot
    key the env at all, because a `TypeEnv` key is exactly one token's text
    (`parseSchema` takes the declaration name with a single `advance().text`,
    `theta-document.ts:2336`; `collectTypeEnv` keys the env by `stmt.name`,
    `type-layer-checks.ts:345`, `:350`) and no token text starts with `<`
    (`isIdentStart`, `src/lexer/lexer.ts:212–214`). Measured: `Object.hasOwn(env,
    "<withheld>")` is false after `schema X = <withheld>`, and
    `resolveNamed(env, "<withheld>")` is `undefined` on every input, so no
    author declaration ever decides a check off this name. What is spellable
    here is the `CompatType` NAME, not the KEY — a face 0135's sentinel does not
    have, because no code compares a `CompatType` name against `"index"`.
    **The two reports are not duplicates:** 0135's collision is nominal
    resolution through the env; this one's is a string equality inside a
    predicate. They share only the `displayType` arm.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, the
    delivery route for the twin at the `let` / `fn`-parameter / `fn`-return
    positions, and the report that owns the capture. Its subject is
    `parseType`'s accepted-terminator set; its group (e) records the `<` / `>`
    trailers as the unfloored-depth mechanism and hands them off explicitly.
    A **balanced** `<…>` group is a different sub-case: the depth counter
    returns to zero and the capture terminates normally, so `let v: <withheld>
    = [1]` parses with no residue at all. **The escape from
    `theta/parse/unresolved-named-type` is 0124's / 0061's class and not this
    report's claim** — measured, `<foo>` escapes identically at all five of that
    row's Trigger positions (rows a3, a5). What is this report's claim is that
    with `<foo>` the six sinks still report and with `<withheld>` they do not.
  - [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) —
    **open**, the same delivery route at the two non-`params:` schema positions
    (alias arm, schema field). Row b7's alias route runs through it. Same
    disposition: the capture is 0061's, the collision is this report's.
  - [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) — **open**, a
    third source at the same render arm. An inline object annotation becomes a
    pseudo-`named` rendering as `array<{a:integer}>` against
    `placeholder-rendering-a.md:21`. It cites `type-compat.ts:318–333` and
    changes neither.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, a fourth
    source at the same arm, and the report whose fix decides whether the plain
    `for` binder that feeds group (c) is recorded as a withheld twin at all.
  - [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md) — **open**, filed from the same fix: the annotated-but-unresolvable
    structural refusal (`fn g(xs: array<integer>)` + `let v: Zz = [1]` + `g(v)`
    reports where every execution hands `g` a fitting value). Row c6's
    *emission* is that report's; this report claims only what c6 renders.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - `src/parser/type-layer-checks.ts:387` — **the sentinel.**
    `const WITHHELD_BINDER_TYPE_NAME = "<withheld>";`. Its doc comment
    (`:359–386`) already carries the key-level claim and its own qualification:
    "UNSPELLABLE AS A KEY by the grammar, not by convention … The KEY claim does
    not cover every NAME: an alias's right-hand side or a direct annotation is a
    source-text slice, not a token, so it CAN carry this text — harmlessly,
    since that name still fails every `resolveNamed` lookup and only ever
    defers." Group (b) measures what "harmlessly" costs.
  - `src/parser/type-layer-checks.ts:409–423` — `containsWithheldBinderType`.
    The `case "named"` arm is `:411–412`, `return type.name ===
    WITHHELD_BINDER_TYPE_NAME` — a string equality over a value whose only
    field is that string. Recursive through `array` (`:414`), `union` (`:416`)
    and `object` (`:418`).
  - `src/parser/type-compat.ts:55–64` — the `CompatType` union; the `named` arm
    is `:58`, `{ readonly kind: "named"; readonly name: string }`. No
    provenance field, so no consumer can tell a minted name from a captured
    one. This is the root both faces share.
  - `src/parser/type-layer-checks.ts:1181–1187` — `recordWithheldBinders`, the
    mint. `:1183` constructs `{ kind: "named", name: WITHHELD_BINDER_TYPE_NAME }`
    per binder; `:1185` also adds the object to `unprovableBindings` (the
    identity channel, which the twin does **not** reach — an author-spelled
    annotation is a different object).
  - `src/parser/type-layer-checks.ts:810–832` — `annotationToCompatType`, **the
    twin's construction point.** `:831` is the fallthrough,
    `return { kind: "named", name: text };`, where `text` is
    `src.trim()` (`:811`). No identifier test; the only shape tests ahead of it
    are the union split (`:816–822`), the `array<…>` match (`:823–827`) and
    `PRIMITIVE_NAMES` (`:828–830`). Called on the alias RHS at `:333`
    (`stmt.arms.join(" | ")`), on a schema field's `typeSource` at `:794`, on a
    `let` annotation at `:955`, on a `fn` parameter type at `:1220` and
    `:1601`, and on a `fn` return type at `:1286`.
  - `src/parser/theta-document.ts:2970–3081` — `parseType`, the slice capture.
    `:3070` pushes each token's text, `:3080` returns `parts.join("")` — so
    inter-token whitespace is dropped and `< withheld >` normalises to
    `<withheld>` (row b9, and the env probe under (a)). `:3061–3068` is the
    depth counter that admits a balanced `<…>` group as one atom.
  - `src/parser/params.ts:428` — `const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/`,
    and `:567–573` — the arm that gates the
    `theta/parse/unresolved-named-type` sink (`lowerCtx.unresolved.push(s)` at
    `:572`) behind that test. `<withheld>` fails the test, so the sink never
    sees it and `lowerTypeExpr` returns the permissive `{}` (`:604`) with no
    diagnostic. `annotationToCompatType` applies no such test. **That asymmetry
    is the delivery mechanism:** one path declines to call the slice a name, the
    other calls it a name and carries it into the type layer.
  - `src/parser/type-compat.ts:318–332` — `displayType`, face 2's site. The
    `case "named"` arm is `:324–325`, `return type.name`, with no conformance
    test and no `env` parameter to run one against. Its doc comment
    (`:313–317`) binds the function to "the `<expected>` / `<actual>` fields of
    the diagnostics/code-registry-parse.md *Message* strings". The `array` arm
    (`:326–327`) is what produces `array<<withheld>>`.
  - `src/parser/type-layer-checks.ts:902` — the annotation-is-a-proof
    statement: `walkFn`'s parameter scope feeds `unprovableBindings` nothing,
    "an author-written annotation IS a declared type, so it is a proof". This is
    the channel row c6 arrives on.
  - `src/parser/type-layer-checks.ts:1595–1620` — `checkFnCallArgs`'
    per-argument loop: the parameter conversion `:1601`, the argument read
    `:1608`, the `checkFnArgCompat` push `:1615–1616`. It calls
    `containsWithheldBinderType` nowhere, which is why c6 emits where group
    (b)'s sinks withhold.
  - `src/parser/type-compat.ts:104–106` — `resolveNamed`, `Object.hasOwn`-guarded
    after bug 0038. It answers `undefined` for the sentinel on every input,
    which is why no false `E` exists on any twin input and why 0135's second
    face has no analogue here.
  - **The eight gate call sites** covering the six sinks, all in
    `src/parser/type-layer-checks.ts`: `:966` (typed-`let` RHS), `:1078` (`for`
    iterand), `:1303` (`subagent fn` return payload), `:1437`
    (array-element / common-type branches), `:1546` (object-field value),
    `:2012` (`par for` iterand), `:2277` (object-index key), `:2318` (join
    element). Group (b) measures five of the six from author text; the
    `subagent fn` return and object-index-key sinks are not measured here.
  - `src/parser/theta-document.ts:2336` — `parseSchema`'s
    `const name = this.advance().text;`, the single-token key capture;
    `src/parser/type-layer-checks.ts:328–353` — `collectTypeEnv`, whose writes
    are `:345` (alias) and `:350` (object schema), both keyed by `stmt.name`;
    `src/lexer/lexer.ts:212–214` — `isIdentStart`, which excludes `<`. Together
    these are the key-level unspellability the sentinel's comment asserts, and
    it holds: measured, `Object.hasOwn(env, "<withheld>")` is false after
    `schema X = <withheld>` even though the alias's RHS carries the name.
  - `src/extension/production-composition.ts:1329`, `:1749`, `:1933` — the
    `hasLoadParseError` consultations. Rows b1–b7 emit no diagnostic at all, so
    unlike bug 0135's collision rows **these documents register and run**.
  - **Existing coverage.** `tests/fn-arg-type-mismatch-wired.test.ts` — bug
    0050's witness, 84 cells, green at HEAD. One cell touches this report:
    u13r (`:2726–2760`), which pins `array<<withheld>>` byte-exact at `:2759`
    and whose comment (`:2734–2746`) enumerates the five withheld-binder-fed
    render shapes and names the sixth (author-twin) route in prose. **No cell
    anywhere measures an author-spelled twin**, in either direction, and no test
    in the tree asserts that a rendered type name is category-1 conformant.
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:5` (the
    byte-identical-strings purpose), `:7` (the closure paragraph and its
    GOV-7 / GOV-8 posture), `:9–21` (category 1; `:11` its placeholder list,
    `:13` its rule, `:19` the `named` clause, `:20` the `Result<T, E>` clause).
  - `docs/spec_topics/lexical.md:13` — the identifier grammar
    `[A-Za-z_][A-Za-z0-9_]*`; `:15` — the PascalCase rule for type-like
    bindings; `:18` — that violating either casing rule is a parse error. The
    sentinel fails `:13` outright, so `:15`'s casing question never arises —
    the difference from 0135, whose sentinel satisfies `:13` and fails `:15`.
  - `docs/spec_topics/grammar.md:90–102` — the `Type` production set;
    `NamedType ::= Ident` is `:98`. `:105` — "The grammar is otherwise identical
    in every position". `docs/spec_topics/type-system.md:15` — the same rule
    from the type-system side.
  - `docs/spec_topics/type-system.md:41` (TYPE-7), `:42` (TYPE-8) — the
    structural arms that decide `named ⊑ array<…>` and `named ⊑ { … }` before
    resolvability, which is why an unresolvable name is refused rather than
    deferred at these sinks and why the withhold gate exists at all; `:48`
    (*Unresolvable operands*) — the deferral disposition; `:52` (TYPE-10),
    `:54` (TYPE-11, why row b7's alias unfolds to the twin).
  - `docs/spec_topics/diagnostics/code-registry-parse.md:34`
    (`non-boolean-condition`), `:36` (`mixed-plus-operands`), `:37`
    (`non-orderable-operands`), `:40` (`array-element-type-mismatch`), `:43`
    (`non-string-array-join`), `:46` (`object-field-type-mismatch`), `:54`
    (`let-rhs-type-mismatch`), `:63` (`unknown-method`), `:64`
    (`non-array-iterand`), `:90` (`unresolved-named-type`, whose *Trigger*
    enumerates five positions and omits the `let` annotation and the `fn`
    parameter type — which is why rows a9/a10 are silent for both spellings),
    `:116` (`fn-arg-type-mismatch`). **All eleven carry `E`.** Mirrors without a
    *Trigger* column: `docs/reference/diagnostics.md:80`, `:82`, `:83`, `:86`,
    `:89`, `:92`, `:100`, `:109`, `:110`, `:139`, `:165`.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — the registry
    is closed; a trigger change is a spec change landing in the same commit);
    `:74` (DIAG-4 — the *Message* column is normative).
  - `docs/spec_topics/governance/source-language-stability.md:9` — GOV-15's
    loads-cleanly predicate. **Rows b1–b7 satisfy it at HEAD** (zero
    diagnostics), so they are inside the equivalence promise's input set and a
    fix that starts refusing them changes observable (b) on in-scope input. This
    is the sharpest difference from bug 0135, every row of which carries an `E`.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. Scratch vitest over `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: prompt\n---`; written, run, deleted. Group (d)'s
  baseline was measured the same way against a read-only `git archive
  67a474f2 src` extraction, deleted after. Rows c1–c5 additionally reproduce as
  0050's committed cell u13r and the four shapes its comment enumerates.

## Summary

Bug 0050's fix gives an unjudgeable binder a sentinel type name,
`WITHHELD_BINDER_TYPE_NAME = "<withheld>"`
(`src/parser/type-layer-checks.ts:387`), and gates six judgement sinks on
`containsWithheldBinderType` (`:409–423`), which tests one string equality.
The sentinel's own doc comment states the claim that makes this sound: the name
is unspellable **as a `TypeEnv` key**, because a key is exactly one token's text
and no token text begins with `<`. That claim holds — measured,
`Object.hasOwn(env, "<withheld>")` is false after `schema X = <withheld>`, and
`resolveNamed` answers `undefined` for the name on every input, so no author
declaration ever decides a check off it.

**The key claim does not extend to the name.** An alias right-hand side, a
schema field type, a `params:` right-hand side, a `let` annotation and a `fn`
parameter or return type are all source-text *slices*: `parseType`
(`src/parser/theta-document.ts:2970`) joins token texts with `parts.join("")`
(`:3080`) and `annotationToCompatType` (`type-layer-checks.ts:810`) mints
`{ kind: "named", name: text }` from the trimmed result (`:831`) with no
identifier test. `CompatType`'s `named` arm carries a bare `string` and no
provenance (`type-compat.ts:58`). So `let v: <withheld> = [1]` produces a value
byte-equal to the engine's mint, and the predicate cannot tell them apart.

**Six sinks then go silent on author text.** Measured against a `<foo>` control
that differs from the twin in nothing but the annotation's spelling: the typed
`let` RHS, the `for` iterand, the `par for` iterand, the object-field value, the
`array.join` element and the array-element/common-type reduction all report with
`<foo>` and report nothing with `<withheld>`. The alias route reaches the same
outcome (`schema X = <withheld>` + `let v: X = [1]`), and so does the
whitespace variant `< withheld >`, which the capture normalises to the sentinel.
The escape from `theta/parse/unresolved-named-type` that delivers the slice is
not this report's claim — `<foo>` escapes identically, and that leniency belongs
to [0124](./0124-parsetype-trailing-punctuation-leniency.md) and
[0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md). What is
this report's claim is the verdict difference downstream of it.

**One of those silences drops a diagnostic that is owed.** `let v: <withheld> =
1` + `let s: array<integer> = [v, "hi"]` reports nothing. The identical program
with `<foo>` reports `array element type mismatch at index 1: expected integer,
got string`, and so does the same `let` with no twin at all
(`[1, "hi"]`). Index 1's verdict does not depend on index 0's type; the gate at
`type-layer-checks.ts:1437` withholds the whole reduction when any branch
carries the sentinel. The document emits zero diagnostics, so
`hasLoadParseError` admits it and the theta registers.

**The second face is the rendering.** `displayType`'s `case "named"` returns
`type.name` unchanged (`type-compat.ts:324–325`), so the sentinel reaches a
category-1 placeholder in six measured *Message* strings — five fed by a
withheld binder read (`condition must be boolean; got array<<withheld>>` and its
four siblings, pinned by cell u13r) and a sixth through the author-twin
annotation at the fn-arg row (`got <withheld>`), which u13r's
withheld-binder-fed sweep does not cover. Category 1 admits a `named` rendering
only by "theta-side identifier" whose shape `lexical.md:13` fixes as
`[A-Za-z_][A-Za-z0-9_]*` (`placeholder-rendering-a.md:19`); `<withheld>` matches
no clause. Measured at the pre-0050 baseline `67a474f2`, the same five positions
rendered `array<x>` and `Result<x, QueryError>` — equally outside category 1,
differently spelled, with byte-identical codes, severities and ranges. The
render face is a spelling change on a rule the tree already violated; the
collision face is new.

## Reproduction

Offline, deterministic, at `3efdb4ac`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---`, a trailing value supplying the final
expression. Each cell is the whole diagnostic list in emission order,
unfiltered. `[]` means zero diagnostics.

### (a) The twin is spellable, and only the sentinel's exact ten characters collide

| # | source | diagnostics |
|---|---|---|
| a1 | `schema X = <withheld>` | `[]` |
| a2 | `schema X = Qq` | `theta/parse/unresolved-named-type`: `unresolved named type 'Qq'` — control |
| a3 | `schema X = <foo>` | `[]` — control: the escape is not the sentinel's |
| a4 | `schema S { f: <withheld> }` | `[]`; with `Qq`, `unresolved-named-type` |
| a5 | `schema X = <withheld> \| integer` | `[]`; with `Qq`, `unresolved-named-type` |
| a6 | `schema X = array<<withheld>>` | `[]`; with `Qq`, `unresolved-named-type` |
| a7 | `params:` / `a: <withheld>` | `[]`; with `Qq`, `unresolved-named-type` |
| a8 | `let v: <withheld> = [1]` | `[]`; with `Qq`, `[]` — control: this position is not in the row's *Trigger* |
| a9 | `fn h(p: <withheld>): number { 1 }` | `[]`; with `Qq`, `[]` — same |

`collectTypeEnv` over a1 returns
`{"X":{"kind":"alias","rhs":{"kind":"named","name":"<withheld>"}}}` and
`Object.hasOwn(env, "<withheld>")` is `false`: the sentinel is the alias's
value, never a key. a3 is the control that assigns the parse escape to
`params.ts:428`'s `IDENTIFIER` gate rather than to the sentinel — every
non-identifier slice escapes, which is
[0124](./0124-parsetype-trailing-punctuation-leniency.md)'s and
[0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md)'s class.
a8 and a9 establish that the two positions this report's group (b) uses draw
nothing for *any* unresolvable spelling, so group (b)'s difference cannot be
attributed to the annotation itself.

`schema X = < withheld >` also enters the env as `named "<withheld>"`:
`parseType` joins token texts with no separator (`theta-document.ts:3080`), so
inter-token whitespace is dropped. `<Withheld>` does not collide (row b8).

### (b) The collision: byte-identical programs, differing only in the annotation's spelling

Each row is one source with the annotation written `<withheld>` and again
written `<foo>`. Both are unresolvable; both escape `unresolved-named-type`;
both reach the same sink as `{ kind: "named", name: … }`.

| # | source (`T` = the annotation under test) | `T` = `<withheld>` | `T` = `<foo>` |
|---|---|---|---|
| b1 | `let v: T = [1]` + `let s: array<integer> = v` | `[]` | `let-rhs-type-mismatch`: `… expected array<integer>, got <foo>` |
| b2 | `let v: T = [1]` + `for y in v { y }` | `[]` | `non-array-iterand`: `… got <foo>` |
| b3 | `let v: T = [1]` + `let z = par for y in v { y }` | `[]` | `non-array-iterand`: `… got <foo>` |
| b4 | `schema S { f: array<integer> }` + `let v: T = 1` + `S { f: v }` | `[]` | `object-field-type-mismatch`: `field 'f' on schema 'S' … got <foo>` |
| b5 | `let v: array<T> = [1]` + `v.join(",")` | `[]` | `non-string-array-join`: `… got array<<foo>>` |
| b6 | `let v: T = 1` + `let s: array<integer> = [v, "hi"]` | `[]` | `array-element-type-mismatch`: `array element type mismatch at index 1: expected integer, got string` |
| b7 | `schema X = T` + `let v: X = [1]` + `let s: array<integer> = v` | `[]` | `let-rhs-type-mismatch`: `… got <foo>` |
| b8 | `let v: <Withheld> = [1]` + `let s: array<integer> = v` | — | `let-rhs-type-mismatch`: `… got <Withheld>` — case control |
| b9 | `let v: < withheld > = 1` + `let s: array<integer> = [v, "hi"]` | `[]` | — whitespace variant, collides |

**b6 is the sharp row.** Its third control is the same `let` with no twin
anywhere — `let s: array<integer> = [1, "hi"]` — which reports the identical
`array-element-type-mismatch at index 1`. Index 1 is a string literal against
`integer`: both operands are resolvable and the mismatch is decidable without
consulting index 0 at all. The twin at index 0 removes the diagnostic.

Every row of (b) in the `<withheld>` column emits **zero** diagnostics, so
`hasLoadParseError` (`production-composition.ts:1329`) admits the document and
the theta registers. b7 runs the collision through TYPE-11 alias transparency:
`unfoldAlias` replaces `X` with its right-hand side, which is the twin.

### (c) The render: six shapes

| # | source | rendered *Message* |
|---|---|---|
| c1 | `for x in [3] { if [x] { let r = 1 } }` | `non-boolean-condition`: `condition must be boolean; got array<<withheld>>` |
| c2 | `for x in [3] { let r = [x] + 1 }` | `mixed-plus-operands`: `'+' has mixed operand types: array<<withheld>> and integer` |
| c3 | `for x in [3] { let r = [x] < 1 }` | `non-orderable-operands`: `'<' requires two numeric or two string operands; got array<<withheld>> and integer` |
| c4 | `for x in [3] { let r = [x].frobnicate() }` | `unknown-method`: `unknown method 'frobnicate' on type array<<withheld>>` |
| c5 | `for x in [3] { let ys: array<array<integer>> = par for i in [1] { x } }` | `let-rhs-type-mismatch`: `… expected array<array<integer>>, got array<Result<<withheld>, QueryError>>` |
| c6 | `fn g(xs: array<integer>): number { 1 }` + `let v: <withheld> = [1]` + `g(v)` | `fn-arg-type-mismatch`: `fn 'g' argument 0 ('xs') type mismatch: expected array<integer>, got <withheld>` |

c1–c5 are the five shapes u13r's comment enumerates, all fed by a withheld
binder read at a row whose verdict its composite's outer kind decides. c1 is
cell u13r itself. c5's sentinel sits inside a synthesised *name*
(`Result<<withheld>, QueryError>`, `src/parser/static-type-inference.ts:290`)
rather than inside a composite, which is why `containsWithheldBinderType` does
not match it.

**c6 is the sixth shape and is outside u13r's sweep**, which is over
withheld-binder-fed sinks. It arrives through the author-twin annotation and
the fn-arg row's annotation-is-a-proof channel
(`src/parser/type-layer-checks.ts:902`, read at `:1608`), which consults no
gate — `checkFnCallArgs` (`:1595–1620`) calls `containsWithheldBinderType`
nowhere. Its control with `<foo>` renders `got <foo>` — so c6's
*emission* is uniform across unresolvable annotations and belongs to
[0144](./0144-annotated-unresolvable-arg-structural-param-emits.md);
only the rendered token is claimed here.

### (d) The pre-0050 baseline, measured

Measured against a read-only `git archive 67a474f2 src` extraction driven by the
same `parseThetaDocument` entry point, deleted after.

| # | source | at `67a474f2` | at `3efdb4ac` |
|---|---|---|---|
| d1 | c1's | `condition must be boolean; got array<x>` | `… got array<<withheld>>` |
| d2 | c2's | `… array<x> and integer` | `… array<<withheld>> and integer` |
| d3 | c3's | `… array<x> and integer` | `… array<<withheld>> and integer` |
| d4 | c4's | `… on type array<x>` | `… on type array<<withheld>>` |
| d5 | c5's | `… got array<Result<x, QueryError>>` | `… got array<Result<<withheld>, QueryError>>` |
| d6 | b1's twin source | `let-rhs-type-mismatch`: `… got <withheld>` | `[]` |
| d7 | b2's twin source | `non-array-iterand`: `… got <withheld>` | `[]` |
| d8 | a1 (`schema X = <withheld>`) | `[]` | `[]` |
| d9 | c6's source | `[]` | `fn-arg-type-mismatch`: `… got <withheld>` |

d1–d5: same code, same severity, same range, different spelling. Both spellings
are outside category 1, so this face is a change of one non-conformant token for
another. d6/d7: the twin's *spellability* predates the fix (d8), and so does the
sentinel string reaching a message — at the baseline it arrived from author text
rather than from the engine. What the fix added is that the two are now the same
value, so the gates withhold. d9: the fn-arg row had no emitter at the baseline
(bug 0050's subject), so c6's shape is new with the row.

## Expected behaviour

**A predicate that distinguishes engine-minted values must not do it by string
equality on a field an author controls.** `containsWithheldBinderType`
(`type-layer-checks.ts:409–423`) answers "was this type read out of a binder
this layer cannot type". The only evidence it has is `type.name`, because
`CompatType`'s `named` arm carries nothing else (`type-compat.ts:58`). The
sentinel's own doc comment (`:359–386`) scopes the unspellability claim
correctly — "UNSPELLABLE AS A KEY by the grammar" — and then states the
residue: "an alias's right-hand side or a direct annotation is a source-text
slice, not a token, so it CAN carry this text — harmlessly, since that name
still fails every `resolveNamed` lookup and only ever defers." The first half is
verified (group (a)). The second half's "harmlessly" is what group (b)
measures: deferral is not free at a sink whose job is to report.

**`type-system.md:48` licenses a skip for an operand past the static view, not
for one spelling among many.** The paragraph reads: when either side of a
compatibility check is past the parser's static view "the parse-time check is
skipped and the runtime AJV check is the safety net". `<withheld>` and `<foo>`
are equally past that view — neither resolves, `resolveNamed` answers
`undefined` for both. The engine reports on one and not the other. Whichever
disposition is correct for an unresolvable annotation (that question is
[0144](./0144-annotated-unresolvable-arg-structural-param-emits.md)'s, and `type-system.md:41`'s TYPE-7 answering structurally before
resolvability is why it is contested), **it must be the same disposition for
both**, because the two inputs differ in nothing the type system can see.

**b6's diagnostic is owed under the row's own *Trigger*.**
`code-registry-parse.md:40` triggers `array-element-type-mismatch` on "Array
literal element does not type-check against the surrounding expected element
type". The element at index 1 is the string literal `"hi"`, the expected element
type is `integer`, both are resolvable, and the engine reports it in the two
control programs. Nothing about index 0's type bears on index 1's verdict. The
withhold at `type-layer-checks.ts:1437` is over the whole branch list, so one
unjudgeable element suppresses the judgement of every other.

**Category 1's rendering rule is closed, and `<withheld>` is not in it.**
`placeholder-rendering-a.md:11` lists the six placeholders category 1 governs
and `:13` binds them to one rule — "re-serialising it in the source-grammar form
defined in [Type System]". Clause `:19` admits a `named` rendering only as
"Named schemas, enums, and type aliases by their theta-side identifier … the
identifier shape is fixed by [Lexical — Identifiers]", and `lexical.md:13` fixes
that shape as `[A-Za-z_][A-Za-z0-9_]*`. `<withheld>` is not an identifier and
names no declaration. `:5` states the purpose — the categories exist "so two
conformant implementations produce byte-identical strings … for the same source
defect" — and `:7` makes the admitted set exhaustive and build-time enforced.
The pre-0050 spelling `array<x>` failed the same clause (`x` is an identifier
but names no schema, enum or alias), so this face is a rule the tree was already
violating at these positions; group (d) is the evidence, and it is the reason
this face is not a regression.

**GOV-15 ranges over group (b) and did not range over its baseline.** The
loads-cleanly predicate (`source-language-stability.md:9`) selects inputs
emitting no `E`. At `67a474f2` rows b1 and b2 emitted an `E` (d6, d7) and were
outside the promise's input set. At `3efdb4ac` they emit nothing and are inside
it. A fix that restores a diagnostic to them changes observable (b) on an
in-scope input and needs the same permissive-direction argument bug 0050's fix
made in the other direction — which is what makes the ordering matter.

## Actual behaviour / root cause

**One string, three producers, no provenance.** The sentinel is a module-level
`const` (`type-layer-checks.ts:387`) and the predicate compares against it:

```ts
function containsWithheldBinderType(type: CompatType): boolean {
  switch (type.kind) {
    case "named":
      return type.name === WITHHELD_BINDER_TYPE_NAME;
```

The engine's producer is `recordWithheldBinders` (`:1181–1187`), which also adds
the constructed object to `unprovableBindings` (`:1185`) — an **identity**
channel keyed on the object, which an author cannot forge. The value channel is
keyed on the **string**, which an author can. The two channels were introduced
together and only one of them is forgery-proof.

**The author's producer applies no shape test.**

```ts
export function annotationToCompatType(src: string): CompatType | undefined {
  const text = src.trim();
  …
  return { kind: "named", name: text };
}
```

(`type-layer-checks.ts:810`, `:811`, `:831`.) `text` is whatever `parseType`
captured. `parseType` (`theta-document.ts:2970`) accumulates token texts and
returns `parts.join("")` (`:3080`); its depth counter increments on `<` and
decrements on `>` (`:3061–3068`), so a balanced `<withheld>` is consumed as one
atom and the statement terminates normally — no residue, no stray-`<` recovery,
no diagnostic. The whitespace-dropping join is why `< withheld >` reaches the
same string.

**The diagnostic that would name the slice is gated behind an identifier test
that `annotationToCompatType` does not share.** `lowerTypeExpr`
(`src/parser/params.ts`) reaches the `unresolved-named-type` sink only through
`IDENTIFIER.test(s)` (`:428`, `:567`), pushing to `lowerCtx.unresolved` at
`:572`; a slice failing that test falls through to `return {}` (`:604`), the
permissive lowering, with nothing recorded. So the same bytes are "not a name"
to the diagnostic path and "a name" to the compatibility path. That asymmetry is
what lets an unspellable-by-grammar string become a first-class
`CompatType` name.

**The six sinks then withhold on author text.** Each gate call site tests the
type it is about to judge:

```ts
if (annotation !== undefined && !containsWithheldBinderType(rhsType)) {   // :966
const diag = containsWithheldBinderType(iterandType)                     // :1078
if (branches.some((branch) => containsWithheldBinderType(branch))) {     // :1437
if (!containsWithheldBinderType(valueType)) {                            // :1546
const iterDiag = containsWithheldBinderType(rawIterandType)              // :2012
const diag = containsWithheldBinderType(joinElement)                     // :2318
```

`:1437` is the one that reaches beyond the operand under judgement: `branches`
is the array literal's element type list, so a single withheld branch suppresses
the reduction for all of them. That is row b6.

**The key-level claim is intact and is what bounds the damage.**
`resolveNamed` (`type-compat.ts:104–106`) is `Object.hasOwn`-guarded and the env
is keyed by `stmt.name` (`type-layer-checks.ts:345`, `:350`), which
`parseSchema` takes with a single `advance().text`
(`theta-document.ts:2336`); `isIdentStart` (`lexer.ts:212–214`) excludes `<`.
Measured, `Object.hasOwn(env, "<withheld>")` is false even when an alias's RHS
carries the name. So the twin can never resolve to a declaration, every `⊑`
question about it reaches an unresolvable-name arm, and no twin input produces a
false `E`. Every movement in group (b) is in the deferral direction. Bug 0135's
second face — an author's declaration deciding a real check off the parser's
fabrication — has no analogue here.

**The render is the same unconditional arm four other reports cite.**
`displayType` (`type-compat.ts:318–332`) returns `type.name` for a `named`
(`:324–325`) and wraps recursively for an `array` (`:326–327`). It takes no
`TypeEnv`, so it could not test resolvability even if it tested shape. Five of
the six shapes reach it from a withheld binder record; the sixth (c6) reaches it
from the author's own annotation through the fn-arg row's annotation proof
(`type-layer-checks.ts:902`), which is why u13r's binder-fed sweep does not
cover it.

## Why it matters

- **A registered `E` row stops firing on an operand it is owed on, and the
  document loads.** b6's control pair shows the `array-element-type-mismatch`
  at index 1 firing with any other spelling at index 0 and with no index 0 at
  all. With the twin it does not fire, `hasLoadParseError` admits the document,
  and the theta registers. `code-registry-parse.md:40`'s *Trigger* is satisfied
  and unreported.
- **Two inputs the type system cannot distinguish get different verdicts.**
  `<withheld>` and `<foo>` both fail `resolveNamed`, both fail
  `lexical.md:13`, both escape `unresolved-named-type`, both arrive at the sink
  as `{ kind: "named", name: … }`. Six sinks report on one and not the other.
  Whatever the correct disposition for an unresolvable annotation is, the
  engine currently holds both.
- **The suppression is not confined to the annotated binding.** The gate at
  `type-layer-checks.ts:1437` is over the whole branch list, so a twin in one
  array element withholds the judgement of every sibling element, including
  ones whose mismatch is fully decidable.
- **The channel that is forgery-proof was built beside one that is not.**
  `recordWithheldBinders` carries the same withhold on two channels: object
  identity (`unprovableBindings`) and string value (the sentinel name). The
  identity channel is closed by construction; the value channel is open to any
  author who types ten characters. Both were introduced in the same fix.
- **A DIAG-4 *Message* names a type no `Type` production spells.**
  `grammar.md:90–102` gives the closed `Type` set and `:105` states it is
  identical in every position; `got <withheld>` names nothing derivable from it.
  An author who wrote no `<withheld>` (c1–c5) sees a token that is not their
  code and not any type; an author who did write one (c6) sees it echoed back
  with no indication that it is also the engine's own reserved spelling.
- **The rendering rule is build-time closed and both spellings violate it.**
  `placeholder-rendering-a.md:7` states the closure is "enforced at build time"
  and exists so two conformant implementations agree byte for byte. Group (d)
  shows the tree emitted `array<x>` at these positions before and
  `array<<withheld>>` after — a violation replaced by a different violation, so
  the conformance claim is untestable for these inputs either way.
- **Nothing in the suite measures the twin.** Cell u13r pins the five
  binder-fed renderings byte-exact and its comment names the sixth shape and
  the author-twin route in prose. No cell in the tree parses a source
  containing `<withheld>`, in either direction, so every row of groups (a), (b)
  and (c6) is unwitnessed and a change to the sentinel's spelling or to the
  capture would move them silently.

## Non-goals

- **The capture leniency that delivers the slice.** That a non-identifier
  source slice escapes `theta/parse/unresolved-named-type` and becomes an
  opaque `named` is measured here only as the delivery route (rows a3, a5).
  It is [0124](./0124-parsetype-trailing-punctuation-leniency.md)'s subject at
  the `let` / `fn`-parameter / `fn`-return positions and
  [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md)'s at the
  alias-arm and schema-field positions. A fix to either closes group (a) and
  most of group (b) as a side effect — see §Fix (d).
- **Whether the fn-arg row should emit on an annotated-but-unresolvable
  argument at all.** c6's *emission* is uniform across unresolvable spellings
  (the `<foo>` control emits identically) and is
  [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md)'s subject. This
  report claims the rendered token only.
- **Whether a plain `for` variable should be a withheld binder.** Group (c)'s
  five shapes exist because the loop variable carries no element type;
  [0126](./0126-plain-for-binds-no-loop-variable.md) owns that, and a fix there
  removes c1–c4 by removing the withheld record rather than by changing the
  sentinel.
- **The sibling internal names at the same render arm.** `index`, `object`,
  `query` and `unknown` (`static-type-inference.ts:249`, `:256`, `:258`, `:279`,
  `:343`)
  reach `displayType` with the same unconditional arm and are
  [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md)'s subject.
  A render route here that does not state whether it covers them leaves the
  class half-closed.
- **The `subagent fn` return-payload and object-index-key gates**
  (`type-layer-checks.ts:1303`, `:2277`). Both consult the same predicate and
  are presumed to carry the same collision; neither is measured here. A fix
  states them in or out.

## Fix

**Not settled. This report exists to pin the sentinel's spellability contract
first**, on the model bug 0135 §Fix set for its own sentinel. Five questions
have to be answered, and (e) orders the work.

**(a) Which face is being closed?** They are separable and the routes do not
overlap:

1. **The collision** (group (b)) — reachable from author text at six sinks,
   not closed by any render change.
2. **The render** (group (c)) — reachable with no `<withheld>` in the source at
   all (c1–c5), not closed by any spellability change.

c6 is the one row where the two meet: an author-spelled twin rendered back into
a *Message*.

**(b) Four routes for face 1, with their consequences.**

1. **Give the `named` arm provenance.** Add a discriminator to
   `CompatType`'s `named` variant (`type-compat.ts:58`, inside the union at
   `:55–64`) that `recordWithheldBinders` (`type-layer-checks.ts:1183`) sets
   and `annotationToCompatType` (`:831`) never does, and test it in
   `containsWithheldBinderType` (`:412`) instead of the string. This closes
   face 1 by construction — no author-reachable path constructs the marker —
   and it is the only route that also gives `displayType` something to test for
   face 2. Cost: the field is optional-by-default or every `named` construction
   site in the tree is touched; `rg -n 'kind: "named"' src/` is the census a fix
   runs first.
2. **Refuse the spelling at capture.** Reject or neutralise a captured type
   slice that is not `Type`-derivable, at `annotationToCompatType` (`:810`) or
   at `parseType` (`theta-document.ts:2970`). This closes face 1 for every
   spelling at once and is the same edit
   [0124](./0124-parsetype-trailing-punctuation-leniency.md) §Fix and
   [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) are
   adjudicating, so it belongs with them and not here — but a fix taking it
   must say so, because it moves rows b1–b7 from `[]` to an `E`, which is an
   observable (b) change on GOV-15-in-scope inputs (see (c)).
3. **Rename the sentinel to something no capture can produce.** The capture
   joins token texts (`:3080`), so any string containing a character the lexer
   cannot emit as a token text is unreachable. This closes face 1 without
   touching the `CompatType` union, and it makes face 2 **worse**: the rendered
   token moves further from category 1. It also has to be re-derived against the
   lexer's token-text inventory rather than asserted, and the assertion must be
   witnessed, because the current claim was correct for keys and wrong for
   names.
4. **Keep the collision and document it.** Requires a corpus sentence saying
   that one type spelling is reserved to the implementation, which contradicts
   `grammar.md:105`'s "identical in every position" and needs a registry row
   for an author who writes it. The highest bar of the four and the only one
   that leaves b6 standing.

**(c) What DIAG-2 / DIAG-4 / GOV-15 bite on.**

- **Face 2's template is already correct.** Every affected row is emitted
  template-exact today (`code-registry-parse.md:34`, `:36`, `:37`, `:54`,
  `:63`, `:116`); what fills `<type>` / `<actual>` / `<left>` / `<element>` is
  category 1's obligation (`placeholder-rendering-a.md:13–21`), which the
  implementation violates. Bringing the render into conformance edits no byte
  of the *Message* column, so DIAG-4 (`diagnostic-shape.md:74`) does not
  foreclose it.
- **Emitting a token no category-1 clause admits mints
  placeholder-rendering vocabulary**, governed by
  `placeholder-rendering-a.md:7` under GOV-7 / GOV-8. `<unresolvable>`, `?` and
  the empty string are all in that class. A route rendering an *existing*
  admitted form clears the bar; a new form does not. For c1–c5 no author-written
  type exists to render, which is the same wall bug 0135 §Fix (b) route 2 hit.
- **Restoring a diagnostic to rows b1–b7 is an observable (b) change on
  GOV-15-in-scope inputs.** They emit nothing at HEAD
  (`source-language-stability.md:9`). Bug 0050's fix moved them out of the
  emitting set in the permissive direction; moving them back is the restrictive
  direction and needs the diagnostic-registry carve-out argued explicitly, not
  assumed. b6 is the row where the argument is easiest — the restored
  diagnostic is one the two controls already produce.
- **Suppressing rather than restoring** — closing face 1 by making `<foo>`
  defer too, i.e. taking
  [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md)'s deferral reading — changes which inputs
  seven rows fire on. That is a *Trigger* edit under DIAG-2
  (`diagnostic-shape.md:72`), landing in the same commit with the
  `docs/reference/` mirrors (`diagnostics.md:80`, `:82`, `:83`, `:86`, `:89`,
  `:92`, `:100`, `:109`, `:110`, `:165`), which carry no *Trigger* column and so
  are unaffected by a widening.

**(d) Constraints any route preserves**, each with a witness row above:

- **The key-level claim stays true and stays witnessed.** `resolveNamed(env,
  "<withheld>")` is `undefined` on every input; group (a)'s env probe is the
  pin. A route that makes the sentinel resolvable — to anything — breaks the
  soundness argument bug 0050 rests on.
- **The five binder-fed shapes keep their verdicts.** Group (d) establishes
  that c1–c5's codes, severities and ranges are byte-identical to
  `67a474f2`'s. A render route may change the spelling; it may not drop or add
  an emission, or cell u13r's neighbours red for the wrong reason.
- **Cell u13r is updated deliberately, not incidentally.**
  `tests/fn-arg-type-mismatch-wired.test.ts:2759` pins `array<<withheld>>`
  byte-exact and its comment (`:2734–2749`) states the pin's purpose. A render
  fix reds it by design and must restate the expectation with its reason. Its
  message helpers source every expected string from the registry, so a template
  edit reds by naming `code-registry-parse.md` — the intended failure mode.
- **b8 keeps reporting.** `<Withheld>` is not the sentinel and must stay
  judged exactly as `<foo>` is, or a route has fenced on a name family rather
  than on the collision.
- **The whitespace variant is covered.** b9 shows `< withheld >` reaching the
  same string through `parts.join("")` (`theta-document.ts:3080`). A route
  fencing on the source text rather than on the captured text misses it.
- **The `subagent fn` return and object-index-key gates are stated in or out**
  (`type-layer-checks.ts:1303`, `:2277`).
- **The committed corpus is re-measured, not assumed.**
  `rg -lF '<withheld>' --glob '*.theta' --glob '*.thetalib'` returns nothing at
  HEAD; a fix re-runs it, and see
  [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — the
  committed-fixture gate does not walk `.thetalib`.

**(e) Ordering and coordination.**

- **[0124](./0124-parsetype-trailing-punctuation-leniency.md) and
  [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) are the
  natural first landing.** Either closing the capture removes the twin from
  most or all of group (b) without touching the sentinel. A fix here that lands
  first must not presuppose the twin stays reachable, and one that lands second
  re-derives group (b) against whatever the capture then admits.
- **[0126](./0126-plain-for-binds-no-loop-variable.md) bounds group (c).** If
  the plain `for` variable gains the iterand's element type, c1–c4 stop being
  withheld-binder rows.
- **Four open reports share the render arm.**
  [0124](./0124-parsetype-trailing-punctuation-leniency.md),
  [0126](./0126-plain-for-binds-no-loop-variable.md),
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md) and
  [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) each carry a
  distinct non-conformant `named` into `type-compat.ts:324–325` and none
  proposes changing that arm. A route taking face 2 there lands on all four;
  whichever fix lands second rebases.
- **[0144](./0144-annotated-unresolvable-arg-structural-param-emits.md) decides c6's emission.** If the deferral reading wins there, c6
  disappears and face 2 reduces to the five binder-fed shapes.

**Witness — offline, provider-free.** Every row settles inside one `parseDoc`
call, so the harness is `tests/fn-arg-type-mismatch-wired.test.ts` extended or
mirrored: same frontmatter, same whole-list assertion on codes, same
registry-sourced message oracle, same loud range preconditions. Required rows:
(a) all nine, a3/a5/a8/a9 being the controls that assign the parse escape
elsewhere; (b) all nine in **both** spellings, b6 additionally with its
no-twin third control, plus one assertion per row that the document registers;
(c) all six, c6 with its `<foo>` control; and one **conformance assertion** over
the rendered `<type>` — that it parses as a category-1 form — so a seventh
shape added later reds without anyone remembering to add a row. Group (d) is
not witnessable in-tree (it measures a prior commit) and is recorded as
provenance. No live tier applies: nothing on this path crosses a provider and
every observable is determined inside one parse.

## Provenance

- **Origin:** the bug 0050 fix (0.77.0, commit `3efdb4ac`), which disclosed
  both faces and filed them here. Its round-8 review residual R1
  (`.pi/tmp/fixes/0050-review-round8.md`) states the alias-RHS and annotation
  twin, the escape from `unresolved-named-type`, the deferral-direction gate
  flip and the sixth render shape, and closes: "Follow-up: weaken the two
  comments and the u13r/u9-header completeness phrasing from 'cannot spell' to
  the key-level claim that actually holds, and pin the twin's deferral
  disposition in a cell." The comment weakening shipped
  (`src/parser/type-layer-checks.ts:376–380`); **the cell did not**. Its §Fix
  (0.77.0) lists "the `<withheld>` author-twin pinhole and render shapes" among
  the residuals filed as 0137–0145. This report adds what those records do not
  state: the `<foo>` differentiator that separates the collision from the
  capture leniency, row b6's suppression of a diagnostic on an untouched
  operand, the whitespace-variant collision, the five-position spellability
  census, the measured pre-0050 baseline, the GOV-15 in-scope reversal, and the
  four routes with their consequences.
- **Evidence:** scratch vitest over `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
  driving the shipped `parseThetaDocument`, at `3efdb4ac`; every cell of groups
  (a), (b) and (c) measured and quoted verbatim above; written, run, deleted.
  Group (d) measured the same way against a read-only `git archive 67a474f2
  src` extraction outside the source tree, deleted after. Rows c1–c5 also
  reproduce as bug 0050's committed cell u13r and the four sibling shapes its
  comment enumerates; that file passes 84/84 at HEAD.
- **Implementation, at `3efdb4ac`:**
  `src/parser/type-layer-checks.ts:359–386` (the sentinel's doc comment,
  including the key-vs-name qualification at `:376–380`), `:387` (the
  sentinel), `:389–408` (the predicate's doc comment), `:409–423`
  (`containsWithheldBinderType`; the `named` arm `:411–412`), `:810–832`
  (`annotationToCompatType`; the trim `:811`, the fallthrough mint `:831`),
  `:328–353` (`collectTypeEnv`; the alias write `:345`, the object-schema write
  `:350`), `:333` (the alias-RHS conversion), `:794` (the schema-field
  conversion), `:955` (the `let`-annotation conversion), `:1181–1187`
  (`recordWithheldBinders`; the mint `:1183`, the identity channel `:1185`),
  `:1220`, `:1286`, `:1601` (the `fn` parameter and return conversions),
  `:902` (the annotation-is-a-proof statement), `:1595–1620`
  (`checkFnCallArgs`' argument loop; the read `:1608`, the push `:1615–1616`),
  and the eight gate call sites `:966`,
  `:1078`, `:1303`, `:1437`, `:1546`, `:2012`, `:2277`, `:2318`;
  `src/parser/type-compat.ts:55–64` (the `CompatType` union; the `named` arm
  `:58`), `:104–106` (`resolveNamed`), `:318–332` (`displayType`; the `named`
  arm `:324–325`, the `array` arm `:326–327`);
  `src/parser/theta-document.ts:2336` (the `TypeEnv` key capture),
  `:2970–3081` (`parseType`; the token push `:3070`, the depth counter
  `:3061–3068`, the join `:3080`);
  `src/parser/params.ts:428` (`IDENTIFIER`), `:567–573` (the
  `unresolved-named-type` sink behind it), `:604` (the permissive fallthrough);
  `src/parser/static-type-inference.ts:290` (the CTRL-3 name that embeds the
  rendering); `src/lexer/lexer.ts:212–214` (`isIdentStart`);
  `src/extension/production-composition.ts:1329`, `:1749`, `:1933`
  (`hasLoadParseError`). Baseline: `git archive 67a474f2 src` carries no
  occurrence of `WITHHELD_BINDER_TYPE_NAME` and no `checkFnCallArgs`, which is
  why d6/d7 emit and d9 is silent there.
- **Spec measured against:**
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:5`, `:7`, `:9–21`
  (`:11` the placeholder list, `:13` the rule, `:19` the `named` clause, `:20`
  the `Result<T, E>` clause);
  `docs/spec_topics/lexical.md:13` (the identifier grammar), `:15`
  (PascalCase for type-like bindings), `:18` (the casing rules' diagnostics);
  `docs/spec_topics/grammar.md:90–102` (the `Type` production set; `:98`
  `NamedType ::= Ident`), `:105` (identical in every position);
  `docs/spec_topics/type-system.md:15` (one grammar in every annotation
  position), `:41` (TYPE-7), `:42` (TYPE-8), `:48` (*Unresolvable operands*),
  `:52` (TYPE-10), `:54` (TYPE-11);
  `docs/spec_topics/diagnostics/code-registry-parse.md:34`, `:36`, `:37`,
  `:40`, `:43`, `:46`, `:54`, `:63`, `:64`, `:90`, `:116` — the eleven rows
  this report touches, all `E`. Mirrors without a *Trigger* column:
  `docs/reference/diagnostics.md:80`, `:82`, `:83`, `:86`, `:89`, `:92`,
  `:100`, `:109`, `:110`, `:139`, `:165`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4);
  `docs/spec_topics/governance/source-language-stability.md:9` (GOV-15's
  loads-cleanly predicate).
- **Tests:** `tests/fn-arg-type-mismatch-wired.test.ts` (84 cells, green at
  HEAD) — u13r `:2726–2760`, its byte-exact pin `:2759`, its enumerating
  comment `:2734–2749`, the group header's sentinel paragraph `:2319–2334`;
  `tests/helpers/e2e-s1.ts:39` (`parseDoc`). No test in the tree parses a
  source containing `<withheld>`, and none asserts that a rendered type name is
  category-1 conformant.
