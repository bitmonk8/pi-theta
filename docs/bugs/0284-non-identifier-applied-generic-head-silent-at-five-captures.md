# Bug 0284 — A generic head that is not identifier-shaped (`a b<integer>`, `Nope.Sub<integer>`, `a-b<integer>`, `f()<integer>`) is admitted with no diagnostic and the theta registers with the field lowered permissively: bug 0282's landed closed-set gate tests `IDENTIFIER.test(ctor)` before it judges the head, and the not-expression family's own sink is filled only by `lowerTypeExpr`'s ATOM catch-all, which an applied spelling never reaches — so the generic-application arm falls through to the permissive `return {}` with both sinks empty

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3 on the same reading bug 0282 settled for
  the identifier-headed half of this class: no legal source moves (the sweep
  over all 34 committed `.theta` / `.thetalib` files finds zero non-identifier
  applied heads, §Fix), and the fault is author-written junk silently replaced
  by a type that constrains nothing (`p: 'a b<integer>'` lowers
  `{"p":{}}` and registers, while `p: 'a b'` draws
  `theta/load/params-type-not-expression` and does not). Not S2: nothing
  correct is refused. Not S4: behaviour, not prose — the governing sentence
  already refuses this text (`frontmatter-fields-a.md:58`). D2 because the
  route is one push at one seam already carrying two sibling gates
  (`src/parser/params.ts:809`–`:835`), borrows a registered code rather than
  minting one, and owes a DIAG-2 *Trigger* widening across the four
  not-expression rows; the flip sweep found zero pinned cells to re-found, so
  none of 0282's cross-witness coordination cost recurs.
- **Kind:** defect — text deriving from no `Type` production is admitted at
  five type-reference captures and lowers to a type that constrains nothing.
  `Type` has six alternatives (`docs/spec_topics/grammar.md:90`–`:95`);
  `GenericType` has two, each spelling its own head (`:99`–`:100`), and
  `:107` closes the set: "No other identifier is parameterisable". `a b`,
  `Nope.Sub`, `a-b` and `f()` are not identifiers, so they are not `NamedType`
  either (`NamedType ::= Ident`, `:98`) — no production derives any of them,
  applied or bare. `grammar.md:105` assigns such text to the not-expression
  family by position, and `frontmatter-fields-a.md:58` states the `params:`
  member of it: "A fragment that every admitted form — a primitive, a
  `NamedType`, a `GenericType`, an inline object type, or a literal — has been
  tried on and declined is the same load-time diagnostic,
  `theta/load/params-type-not-expression`".
- **Affected** (every citation re-derived at HEAD `766e4c8d`, v0.280.0;
  `src/parser/params.ts` is 2262 lines and
  `src/parser/type-layer-checks.ts` 3667 lines at that HEAD):
  - `src/parser/params.ts:770`–`:772` — the positional generic-application
    test (`const lt = s.indexOf("<")`, `lt > 0 && s.endsWith(">")`) and the
    head slice (`const ctor = s.slice(0, lt).trim()`). The test asks where the
    `<` sits, never what stands before it, so `a b`, `Nope.Sub`, `a-b` and
    `f()` all reach `ctor`.
  - `src/parser/params.ts:791` — the `array` arity-1 branch, which declines.
  - `src/parser/params.ts:795` — bug 0281's reserved-head gate
    (`RESERVED_KEYWORDS.has(ctor) && !(ctor in GENERIC_ARITY)`), which declines:
    none of these heads is a reserved spelling.
  - `src/parser/params.ts:809` — bug 0282's landed closed-set gate,
    `if (!(ctor in GENERIC_ARITY) && IDENTIFIER.test(ctor))`. The second
    conjunct is the precondition this report is about; its stated reason
    (`:818`–`:821`) is that the borrowed row's *Message* fills `<name>` with a
    name. Every head here fails `IDENTIFIER`.
  - `src/parser/params.ts:666` — `IDENTIFIER`,
    `/^[A-Za-z_][A-Za-z0-9_]*$/`.
  - `src/parser/params.ts:836`–`:853` — the permissive catch-all of the
    generic-application arm: it walks the arguments for their resolution side
    effects, calls `pushCutBracketGroupAsLastResort` and returns `{}`. It
    pushes the HEAD onto no sink.
  - `src/parser/params.ts:937` — `lowerCtx.unspellable?.push(s)`, the ONLY
    write to the not-expression sink in this function. It sits in the ATOM
    catch-all below `// Atom.` (`:856`), which an applied spelling never
    reaches, because the generic-application arm returns first.
  - `src/parser/params.ts:263`, `:300`–`:318` — the `params:` reader of that
    sink: `unspellable.filter(isUnspellableTextRefusable)` and the
    `theta/load/params-type-not-expression` emission. An empty sink emits
    nothing.
  - `src/parser/type-layer-checks.ts:1266`–`:1287` (body `:1267`–`:1286`) —
    `annotationSourceIsNotTypeExpression`, the `let` annotation / `fn`
    parameter / `fn` return / `@<T>` recogniser. It reaches its verdict from
    the same sink (`collectUnresolvedNamedTypes(text, NO_DECLARED_TYPE_NAMES,
    undefined, unspellable)` at `:1285`, then
    `unspellable.some(isUnspellableTextRefusable)` at `:1286`), so the empty
    sink makes it answer `false` for exactly the same texts.
  - `src/parser/params.ts:1800`–`:1801` — `isUnspellableTextRefusable`, the
    one shared decline: `parseLiteralArm(text) === undefined &&
    !text.includes("{") && !text.includes("}")`.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` — the governing
    `params:` prose quoted under **Kind**.
  - `docs/spec_topics/grammar.md:105` — the same rule for the body captures.
  - `docs/spec_topics/diagnostics/code-registry-load.md:20` —
    `theta/load/params-type-not-expression`.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:106`, `:107`, `:108` —
    the three parse-phase not-expression rows.
- **Observed at:** HEAD `766e4c8d`, v0.280.0, `main`, by one offline
  provider-free scratch probe over `parseDoc` (`tests/helpers/e2e-s1.ts`),
  `lowerTypeExpr` and `isUnspellableTextRefusable` (`src/parser/params.ts`),
  token `b0284scratch`, removed after measurement; sweep clean.

## Summary

Bug 0282's fix (0.280.0) refuses an applied generic head the closed set does
not hold — when the head is identifier-shaped. A head that is not identifier-
shaped fails the gate's `IDENTIFIER.test(ctor)` conjunct and falls to the
permissive catch-all of the same arm, which records the head nowhere. The
not-expression family, which the grammar assigns to text deriving from none of
`Type`'s six alternatives, cannot see it either: its sink is filled only by
`lowerTypeExpr`'s ATOM catch-all, and an applied spelling returns from the
generic-application arm above it.

Measured at HEAD, `p: 'a b<integer>'`, `p: 'Nope.Sub<integer>'`,
`p: 'a-b<integer>'` and `p: 'f()<integer>'` draw NOTHING and register, with the
field lowered `{}`. The bare spellings `a b`, `Nope.Sub`, `a-b` and `f()` each
draw `theta/load/params-type-not-expression` at the same position and deny
registration. The asymmetry is the same one bug 0282 removed for `Nope` vs
`Nope<integer>`, at the other side of the identifier test.

The class is not confined to `params:`. `Nope.Sub<integer>` and `a-b<integer>`
are silent at the `let` annotation, the `fn` parameter type, the `fn` return
type and the `@<T>` query ascription too, where their bare spellings draw
`theta/parse/annotation-type-not-expression` and
`theta/parse/query-annotation-type-not-expression`. `f()<integer>` is silent at
those four and at the `schema` object-body field type.

Two spellings from the handover behave differently at the body captures, and
neither is this class there. `a b<integer>` at a `let` annotation is captured
token-joined as `ab<integer>`, an identifier head, so bug 0282's landed gate
fires and it draws `unresolved named type 'ab'`. `1x<integer>` is refused by
the lexer at every body capture (`theta/parse/unsupported-feature:
unsupported syntactic feature: 1x`). Both are silent at `params:`, whose
recovered text is the frontmatter scalar verbatim and reaches no lexer.

## Reproduction

Offline, provider-free, at HEAD `766e4c8d`. One scratch vitest file over
`parseDoc` (the real `parseThetaDocument` with production-shaped deps,
`tests/helpers/e2e-s1.ts`), token `b0284scratch`, deleted after the sweep. The
`params:` carrier is
`---\ndescription: d\nmode: prompt\nparams:\n  p: '<type>'\n---\n\nlet z = 1\n"ok"\n`;
`lowered` is `frontmatter.params.loweredSchema`. Registration is decided by
`hasLoadParseError` (`src/extension/production-composition.ts`): a document
carrying an error-severity `theta/load/…` or `theta/parse/…` diagnostic is not
registered, so an EMPTY diagnostic list is a registered theta.

### `params:` right-hand side — the subject

```
"a b<integer>":       codes []   lowered {"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}
"Nope.Sub<integer>":  codes []   lowered {"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}
"1x<integer>":        codes []   lowered {"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}
"a-b<integer>":       codes []   lowered {"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}
"f()<integer>":       codes []   lowered {"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}
```

All five register. The author's text is recorded as the declared type and the
lowered fragment for `p` is `{}` — every value validates.

### `params:` right-hand side — the bare-spelling controls

```
"a b":       theta/load/params-type-not-expression: 'params:' field 'p' right-hand side is not a theta type expression   lowered null
"Nope.Sub":  theta/load/params-type-not-expression: 'params:' field 'p' right-hand side is not a theta type expression   lowered null
"1x":        theta/load/params-type-not-expression: 'params:' field 'p' right-hand side is not a theta type expression   lowered null
" <integer>": theta/load/params-type-not-expression: 'params:' field 'p' right-hand side is not a theta type expression  lowered null
"Nope<integer>": theta/parse/unresolved-named-type: unresolved named type 'Nope'                                        lowered null
```

None registers. `' <integer>'` is the empty-head control: `s.indexOf("<")` is
`0`, the `lt > 0` test declines, and the text reaches the ATOM catch-all, which
does push it. `'Nope<integer>'` is bug 0282's landed gate, unmoved.

### Nesting — one level down, at `params:`

```
"array<a b<integer>>":     codes []   lowered p = {"type":"array","items":{}}
"string | a b<integer>":   codes []   lowered p = {"anyOf":[{"type":"string"},{}]}
"{q: a b<integer>}":       codes []   lowered q = {}
```

Silent at the generic argument, the union arm and the inline-object field type
alike — the three depths `frontmatter-fields-a.md:58` names as judged.

### The four body captures

`let x: <type> = 1`, `fn g(a: <type>) { return 1 }`, `fn g(): <type> { return 1 }`,
and `let q = @<<type>>` `` `hi` ``:

```
Nope.Sub<integer>   let []   fn-param []   fn-ret []   query-T []
a-b<integer>        let []   fn-param []   fn-ret []   query-T []
f()<integer>        let []   fn-param []   fn-ret []   schema-field []
```

Controls at the same captures:

```
let x: Nope.Sub = 1        theta/parse/annotation-type-not-expression: 'x' declares a type that is not a theta type expression
let x: a-b = 1             theta/parse/annotation-type-not-expression: 'x' declares a type that is not a theta type expression
let x: f() = 1             theta/parse/annotation-type-not-expression: 'x' declares a type that is not a theta type expression
let q = @<Nope.Sub>`hi`    theta/parse/query-annotation-type-not-expression: `@<...>` query annotation declares a type that is not a theta type expression
schema S { a: Nope.Sub }   theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression
```

### The two spellings that are NOT this class at body captures

```
let x: a b<integer> = 1    theta/parse/unresolved-named-type: unresolved named type 'ab'
let x: a b = 1             theta/parse/unresolved-named-type: unresolved named type 'ab'
let x: 1x<integer> = 1     theta/parse/unsupported-feature: unsupported syntactic feature: 1x
```

The `let` capture joins tokens, so `a b<integer>` arrives as `ab<integer>` with
an identifier head and bug 0282's gate fires; `1x` is a lexer refusal.

### The shared decline, asked directly

```
isUnspellableTextRefusable("a b")              true
isUnspellableTextRefusable("a b<integer>")     true
isUnspellableTextRefusable("a b<{x: integer}>") false
```

The third row is the sub-choice §Fix leaves adjudicable: the head text `a b`
is refusable whatever argument list follows it, the WHOLE application text is
not when the arguments carry a brace.

## Expected behaviour

`a b<integer>`, `Nope.Sub<integer>`, `a-b<integer>` and `f()<integer>` derive
from no `Type` production. `GenericType`'s two productions each spell their own
head (`grammar.md:99`–`:100`) and the set is closed (`:107`); `NamedType ::=
Ident` (`:98`) does not admit any of these spellings even bare. Every admitted
form has been tried on the fragment and declined, which is exactly the
condition `frontmatter-fields-a.md:58` names for
`theta/load/params-type-not-expression` and `grammar.md:105` names for the
three parse-phase siblings.

Each of the five captures refuses the text and denies registration, at that
capture's existing range and under that capture's existing row — the same
one-reading-every-capture conclusion bugs 0277, 0281 and 0282 landed for the
identifier-shaped heads. A refusal for the bare spelling and silence for the
applied spelling of the same non-derivable text is the asymmetry the fix
removes.

## Actual behaviour / root cause

One seam, two sinks, and the text reaches neither.

**The head is judged only behind an identifier-shape precondition.**
`lowerTypeExpr`'s generic-application arm (`src/parser/params.ts:769`–`:854`)
tests where the `<` sits (`:770`) and slices whatever precedes it as the head
(`:772`). Three gates then judge that head: `array` at arity 1 (`:791`), bug
0281's reserved spellings (`:795`), and bug 0282's closed-set gate (`:809`),
written `!(ctor in GENERIC_ARITY) && IDENTIFIER.test(ctor)`. The second
conjunct is deliberate and its reason is stated at `:818`–`:821` — the borrowed
row `theta/parse/unresolved-named-type` fills `<name>` with a name, and bug
0282's class is identifiers written as heads. A head failing `IDENTIFIER`
(`:666`) passes all three gates and reaches the permissive catch-all
(`:836`–`:853`), which walks the arguments and returns `{}` having recorded the
head on no sink.

**The not-expression sink is written from the ATOM arm only.** The single
`lowerCtx.unspellable?.push(s)` in this function is at `:937`, below `// Atom.`
(`:856`). An applied spelling returns at `:853` and never arrives. The sink is
therefore empty for this text, and both readers of it answer accordingly: the
`params:` reader filters an empty list and emits nothing (`:263`, `:300`–`:318`),
and `annotationSourceIsNotTypeExpression` returns `false`
(`type-layer-checks.ts:1285`–`:1286`), which is why the `let` annotation, the
`fn` parameter type, the `fn` return type and the `@<T>` ascription are silent
on the same texts their bare spellings refuse.

Zero sink entries means zero diagnostics, `hasLoadParseError` sees no error,
and the theta registers with `{}` standing in for the annotation the author
wrote.

## Why it matters

The correction for junk in a type position is to write a type. A silent
admission tells the author the text was a type. The lowered `{}` then validates
every value at the `params:` position — the binder's own schema — and at the
`let` annotation it disables the position's own check, the same consequence bug
0282 measured for `Foo<integer>`.

The class is reachable by ordinary spelling mistakes: a space left inside a
name (`a b<integer>`), a dotted or namespaced name copied from another language
(`Nope.Sub<integer>`), a hyphen where an underscore belongs (`a-b<integer>`).
Each is refused when written bare and admitted when an argument list follows.

## Non-goals

- **Bug 0282's identifier-headed class is not reopened.**
  `./0282-unknown-applied-generic-head-silent-at-every-position.md` is fixed
  (0.280.0); `Nope<integer>`, `Ghost<string>` and `Foo<integer>` keep drawing
  `theta/parse/unresolved-named-type` at every position, and the gate's
  ordering after bug 0281's is untouched.
- **Bug 0281's reserved applied heads are not reopened.**
  `./0281-applied-ok-err-generic-application-silent-at-every-capture.md` is
  fixed (0.277.0); `Ok<integer>` and `Err<string>` keep drawing
  `theta/parse/reserved-keyword-as-identifier`.
- **`a b<integer>` and `1x<integer>` at the BODY captures are outside the
  subject.** Both already refuse there, for reasons that are not this seam's:
  the capture's token join makes the first an identifier head, and the lexer
  refuses the second. Their `params:` spellings ARE in the subject, where no
  lexer and no join intervene.
- **The closed set stays legal.** `array<T>` and `Result<T, E>` are the
  grammar's own (`grammar.md:99`–`:100`, `:107`) and are covered by
  `tests/committed-fixture-parse-gate.test.ts`.
- **The brace exemption is not narrowed.** `isUnspellableTextRefusable`'s
  decline of brace-carrying fragments (`params.ts:1801`) is shared by four
  positions; §Fix's sub-choice decides what TEXT this seam pushes, not what
  the predicate declines.
- **Introducing user-defined parameterised types is not in scope.**

## Fix

One reading for one spelling at every capture: an applied generic head that
derives from no `Type` production refuses and denies registration, whether or
not the head is identifier-shaped.

**Route — extend the not-expression judgement to the applied-head fragment, at
the seam that already holds the three sibling gates.** In `lowerTypeExpr`'s
generic-application arm (`src/parser/params.ts:809`–`:835`), after bug 0281's
reserved-head gate and bug 0282's closed-set gate and before the permissive
catch-all at `:836`, a head that is in no `GENERIC_ARITY` entry, is no reserved
spelling and is NOT identifier-shaped routes onto `lowerCtx.unspellable` and
returns, exactly as the identifier-shaped head routes onto `lowerCtx.unresolved`
one line above. The two gates then partition the non-derivable applied heads
between the two registered families by the same identifier test that today
decides between refusal and silence.

The code follows from the sink and needs no minting: `lowerCtx.unspellable` is
the not-expression family's own sink, so the refusal renders as
`theta/load/params-type-not-expression` at `params:`
(`code-registry-load.md:20`), `theta/parse/schema-type-not-expression` at a
`schema` field type and an alias arm (`code-registry-parse.md:106`),
`theta/parse/annotation-type-not-expression` at a `let` annotation, an `fn`
parameter type and an `fn` return type (`:107`), and
`theta/parse/query-annotation-type-not-expression` at the `@<T>` ascription
(`:108`). Each of the five captures is already a wired emitter of its member of
that family (§Reproduction's control block fires all four codes), so no
emission-set widening is owed — the wiring gap bug 0281 §Fix recorded at
`invoke-ascr` and `query-E-arg` bounds the family's reach at seven of nine
captures, and none of the five captures this report measures is one of the two
unwired ones.

The governing prose already admits the refusal and needs no amendment. The
sentence that settles it is `frontmatter-fields-a.md:58`: "A fragment that
every admitted form — a primitive, a `NamedType`, a `GenericType`, an inline
object type, or a literal — has been tried on and declined is the same
load-time diagnostic, `theta/load/params-type-not-expression`". `a b<integer>`
is no `GenericType` (`grammar.md:107` closes the set), no `NamedType`
(`:98`), no primitive, no inline object type and no literal; the enumeration of
examples that follows that sentence ("two space-separated identifiers", among
others) is illustrative of the same condition, not a closed list. `grammar.md:105`
carries the identical rule for the three parse-phase captures.

**Owed with the fix, DIAG-2:** the four rows' *Trigger* prose states the
refused set fragment-by-fragment and none of them names the constructor-head
position, so each owes the same one-sentence widening bug 0282 landed on
`theta/parse/unresolved-named-type` — a non-identifier-shaped generic head is a
fragment of this family at every depth the row already judges.

**Adjudicable in lane — what text the gate pushes.** The choice is observable
and both candidates are defensible; the implementer decides and records the
measurement.

- *(i) Push the HEAD text* (`a b` from `a b<integer>`). The head is what
  derives from nothing, and it is brace-free by construction, so
  `isUnspellableTextRefusable` never declines it — `p: 'a b<{x: integer}>'`
  refuses. Cost: the sink then holds text the source spells as a prefix rather
  than as a whole fragment, which the `schema`-position row's fragment prose
  describes less exactly.
- *(ii) Push the WHOLE application text* (`a b<integer>`). It is the fragment
  the source spells, matching the rows' "fragment the source itself spells"
  unit. Cost, measured: `isUnspellableTextRefusable("a b<{x: integer}>")` is
  `false`, so an argument list carrying a brace keeps the silence — the brace
  exemption swallows the refusal. §Reproduction's decline block is the
  measurement.

Neither candidate changes the rendered message at any of the five captures:
all four rows name the field, the binding or the declaration, and none renders
the sink's text.

**Flip-authority sweep — zero candidates.** Bug 0282's widening re-founded
eleven pinned cells across six witness files that used `pair<…>`, `map<…>` and
`result<…>` as inert scaffolding; that precedent makes the sweep mandatory
here. Two sweeps were run at HEAD `766e4c8d`, scripted over `git ls-files`:

1. Every committed `.theta` / `.thetalib` file (34 files, the corpus
   `tests/committed-fixture-parse-gate.test.ts` covers): two `<` occurrences
   have a non-identifier prefix, `docs/examples/handle-error.theta:12` and
   `docs/examples/personas.thetalib:8`, and both are the query sigil `@` in
   `@<Triage>` / `@<integer>`, not a constructor head. The ascription text
   inside the angle brackets is an identifier in both. **Zero.**
2. Every file under `tests/` (`.ts` and `.json`), scanning each `<` whose
   interior is type-shaped and whose preceding head token is not
   identifier-shaped: 16 hits, every one of them TypeScript or prose — `cka-<n>`
   and `pi.<member>` in gate-test titles, `Type.Unsafe<string>` and
   `vi.fn<UiNotifier["notify"]>()` in TypeScript source, `.<field>` in a
   quoted diagnostic template. No theta source text among them. **Zero.**

No pinned cell spells a non-identifier applied head, so this route re-founds
no sibling witness and owes no coordination note. The implementer re-runs the
sweep before landing and records the count.

**Ordering.** This report does not block on and is not blocked by any open
report. It builds on bug 0282's landed gate and must be implemented beside it,
not by widening it: dropping `IDENTIFIER.test(ctor)` from that gate instead
would route this text onto `theta/parse/unresolved-named-type`, whose *Message*
fills `<name>` with a name and would render `unresolved named type 'a b'`.

**What must not move:** every cell of §Reproduction's control blocks; bug
0282's `Nope<integer>` refusals and bug 0281's `Ok<integer>` refusals at all
nine positions; `array<T>` and `Result<T, E>` clean at every position they are
legal in; the shared decline `isUnspellableTextRefusable` byte-unchanged; the
empty-head control `' <integer>'` keeping the row it already draws.

## Related

- `./0282-unknown-applied-generic-head-silent-at-every-position.md` — fixed
  (0.280.0). Its gate is the direct parent: this class is what its
  `IDENTIFIER.test(ctor)` conjunct leaves out, and its fix record's residual 1
  names this filing as owed. Sibling, not owner.
- `./0281-applied-ok-err-generic-application-silent-at-every-capture.md` —
  fixed (0.277.0). Its dated correction note (2026-08-25) measures the
  not-expression family as wired at seven of nine captures, only `query-E-arg`
  and `invoke-ascr` unwired; that measurement is what makes this route owe no
  emission widening at the five captures measured here.
- `./0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md` —
  another `params:`-side member of the not-expression family; different intake
  stage (YAML), no overlap in the refused set.
- `./0232-unterminated-literal-params-type-drops-inline-fields.md` — owns the
  brace exemption's one narrowing (`hasUnterminatedStringLiteral`,
  `params.ts:1827`). The sub-choice above is adjacent to that exemption and
  must not narrow it.
- `./0262-unresolved-named-type-silent-at-nine-reference-positions.md` — fixed
  (0.266.0), the bare-name rule at ten reference positions. A non-identifier
  head is no `NamedType`, so that row is not this class's home.

## Provenance

Filed in the nineteenth fix-open-bugs session at HEAD `766e4c8d`, v0.280.0,
from residual 1 of bug 0282's fix record, which measured three of these
spellings in its review round 1 and recorded the class as unowned. Every
citation above re-derived at that HEAD. All measurements are this report's own,
taken by one offline provider-free scratch probe over `parseDoc`,
`lowerTypeExpr` and `isUnspellableTextRefusable` (token `b0284scratch`, deleted
after the sweep) plus two scripted `git ls-files` sweeps: the five-spelling
`params:` subject table with lowered fragments and registration, the
bare-spelling and empty-head controls, the three nesting depths, the four body
captures with their controls, the two handover spellings that behave
differently at the body captures, the shared decline asked directly, and the
flip-authority sweep over the committed corpus and `tests/`.

Two corrections to the handover this filing carries. The residual states that
"at the `let` annotation the same text already refuses"; measured, that holds
for `a b<integer>` (token-joined to an identifier head) and `1x<integer>` (a
lexer refusal) and NOT for `Nope.Sub<integer>`, which is silent at the `let`
annotation, the `fn` parameter type, the `fn` return type and the `@<T>`
ascription. The residual also places the class at `params:`; measured, it
reaches five captures, and two further spellings belong to it (`a-b<integer>`,
`f()<integer>`) that the residual does not name.
