# Bug 0204 — `lowerTypeExpr`'s generic-argument split tracks angle depth alone, so the derivable annotation `array<{a: string, b: integer, c: boolean}>` shreds into `{a: string` / `b: integer` / `c: boolean}` and the brace-free middle shard — text no author wrote — draws `theta/parse/schema-type-not-expression` at a `schema` field type and at an alias arm and `theta/load/params-type-not-expression` at a `params:` field, one refusal per interior field past the second, with the theta unregistered, while the grammar's own argument parser counts ONE argument (no `generic-arity-mismatch`) and the byte-identical text at bug 0124's three positions is admitted by that fix's SHRED decline

- **Status:** open. §Fix is constraint-pinned, not settled: three routes are
  enumerated below with their measured costs, and the choice is left to the run
  because the shredding split sits in the one lowering function every `Type`
  position reaches, and because each route pays in a different currency — route
  (b)(1) moves lowered bytes a landed cell pins
  (`tests/params-scalar-nontype-text-refusal.test.ts:982`) and falsifies a
  second cell's stated rationale
  (`tests/inline-object-nested-lowering.test.ts:945–:948`), route (b)(2) drops
  three measured TRUE refusals (§Reproduction (f)), and route (b)(3) edits a
  sink contract five readers share. Ordering: nothing blocks
  this report from starting and it blocks nothing.
  [0164](./0164-generic-argument-literal-lowers-permissive.md) is **open** and
  owns the same recursion from the emission side — its §Fix constraint 1 forbids
  widening the argument split, which is route (b)(1) here — so whichever lands
  second re-derives the other's rows rather than assuming them.
- **Sev/Diff estimate:** S2/D3 — S2 because input the grammar derives is refused
  loudly and the theta does not register: `array<{a: string, b: integer, c:
  boolean}>` is an `ObjectType` inside a `GenericType` argument, which
  `grammar.md:99–:101` derives and `:109` admits "in any `Type` position", and
  the same annotation's argument count is ONE to the parser that computes
  `theta/parse/generic-arity-mismatch` (measured: no arity diagnostic fires,
  §Reproduction (d)). Nothing is silently mis-valued and no comparison flips,
  which keeps it out of S1; the same class also mints the wrong code for an
  inline `enum[…]` in a generic argument (§Reproduction (e)), which is the
  "wrong diagnostic code/text" half of the same band. D3 because the remedy
  reaches a split three other readers of the same argument list already spell
  differently, at a function every `Type` position shares
  (`lowerTypeExpr`, `src/parser/params.ts:665`), under a shipped
  nesting-mode rule (`TypeSplitNesting`, `:1463–:1485`) whose two bullets
  contradict each other on the reason (§Reproduction (d)); the route also
  decides whether to share bug 0124's position-level decline, which would drop
  three measured TRUE refusals (§Reproduction (f)), and carries same-commit
  Trigger edits for two registered rows plus their `docs/reference/` mirrors.
- **Kind:** defect, four elements, each measured at HEAD `9eb1290d` (v0.121.0)
  through the real `parseThetaDocument` and the shipped seams directly.
  1. *The split that feeds the refusal disagrees with the grammar about how many
     arguments the author wrote.* `lowerTypeExpr`'s generic-argument split is
     `splitTopLevel(s.slice(lt + 1, s.length - 1), ",")`
     (`src/parser/params.ts:699`) — the `"angle"` default, whose brace tracking
     is off (`tracksBraces`, `:1509`). Measured:
     `splitTopLevel("{a: string, b: integer, c: boolean}", ",")` is
     `["{a: string", "b: integer", "c: boolean}"]`, where the same call in
     `"angle-and-brace"` is the one segment
     `["{a: string, b: integer, c: boolean}"]`. The token-level type parser that
     computes the arity diagnostic parses each argument with `parseUnion`
     (`src/parser/type-grammar.ts:514–:530`), so it counts one argument and
     `theta/parse/generic-arity-mismatch` (`:753–:760`) does not fire — measured
     at the schema field position, where `array<integer, integer>` DOES draw it.
  2. *The middle shard is refusable, so the whole annotation draws the refusal.*
     Each shard recurses into `lowerTypeExpr`, misses every arm, and lands on
     the trailing catch-all's sink (`params.ts:786`). The shared decline
     (`isUnspellableTextRefusable`, `:1274`) declines a `LiteralType` atom and
     any text carrying `{` or `}`. Measured per shard:
     `{a: string` → declined, `b: integer` → **refusable**, `c: boolean}` →
     declined. The two-field spelling shreds too, but both of its shards carry a
     brace, so it is admitted — the refusal begins at the third interior field
     and scales: `array<{a: string, b: integer, c: boolean, d: string}>` draws
     TWO refusals at the schema positions, the five-field spelling THREE (one
     per brace-free shard, the row's stated per-fragment count), and ONE at
     `params:`, whose row counts per field.
  3. *Three landed positions refuse; bug 0124's three do not.* Measured through
     `parseThetaDocument`: a `schema` object-body field type and a
     `schema X = …` alias arm each draw
     `error theta/parse/schema-type-not-expression`, a `params:` field draws
     `error theta/load/params-type-not-expression` and the whole frontmatter is
     withheld (`frontmatter === null`), while a `let` annotation, an `fn`
     parameter type and an `fn` return type carrying the byte-identical text
     draw no refusal — bug 0124's recogniser declines any source carrying both a
     brace and an angle bracket before consulting the same sink
     (`src/parser/type-layer-checks.ts:957–:963`), and its registry row states
     the asymmetry in terms. The `@<T>` query-annotation position is silent for
     a fourth reason: its `collectUnresolvedNamedTypes` call threads no
     `unspellable` sink (`params.ts:578–:582`; measured `[]`).
  4. *A shipped comment gives a reason that is measurably false, and an open
     report quotes it as a constraint.* `src/parser/theta-document.ts:5183–:5186`
     states "the argument split stays angle-only because widening it would
     disagree with `theta/parse/generic-arity-mismatch`". Angle-only is what
     disagrees: the arity parser counts one argument for this text and the
     angle-only split hands the lowering three. `params.ts:1475–:1479` states the
     same relation in the opposite direction ("an angle-only split yields three
     parts and disagrees with the parser that computes
     `theta/parse/generic-arity-mismatch`"), and `theta-document.ts:5349`
     (`queryResponseAnnotation`) widens to `"angle-and-brace"` for exactly that
     agreement. [0164](./0164-generic-argument-literal-lowers-permissive.md)
     §Fix constraint 1 quotes the false clause as the governing constraint. The
     comment's SECOND reason — `:5202–:5213`, that under angle-only
     `array<{a: string, b: integer}>` lowers `{}` (asserting nothing) instead of
     `{"type":"array","items":{}}` (asserting arrayness while dropping the
     element shape) — survives measurement and is a cost every widening route
     carries.
- **Related:**
  - [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) —
    **fixed (0.87.0)**. Owns the two refusing schema positions: the sink
    threading (`collectUnresolvedNamedTypes`'s fourth out-parameter,
    `src/parser/body-type-lowering.ts:601–:620`) and both emitters
    (`theta-document.ts:6263–:6270` alias, `:6733–:6737` field), including the
    one-diagnostic-per-fragment count this report's element 2 scales with. **It
    did not cause this.** Its §Fix threads a sink through a split that was
    already angle-only; the false refusal is the composition of that threading
    with the split. Its landed TRUE refusals are locks — `array<Cat +>`
    (cells a21/a22, `tests/schema-body-nontype-text-refusal.test.ts:682–:683`),
    `{b: string +}` (a23/a24), `{b: {c: ???}}` (a25) — and all three still
    refuse under every route in §Fix.
  - [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) —
    **fixed (0.86.0)**. Owns the `params:` position's refusal
    (`params.ts:263–:276`) and the SHARED decline every position asks
    (`isUnspellableTextRefusable`, `:1274`), whose doc comment already records
    the shred for the TWO-field case: "`splitTopLevel`'s angle-only nesting can
    hand this arm an UNBALANCED half of a shredded brace group
    (`array<{x: integer, y: string}>`'s two fragments, `{x: integer` and
    `y: string}`), and neither half is brace-ROOTED, so a narrower
    'brace-rooted' test would refuse both" (`:1262–:1265`). The decline is
    correct for two fields and does not reach three. Its cell d9
    (`tests/params-scalar-nontype-text-refusal.test.ts:982`) pins the two-field
    spelling's admission AND its lowered `{}`.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **fixed
    (0.121.0)**, commit `9eb1290d`. The filing origin (§Provenance) and the
    record of the asymmetry. Its SHRED decline
    (`type-layer-checks.ts:938–:963`) makes its own three positions immune, and
    its registry row states it as this position's alone:
    "The SHRED decline, asked FIRST, is this position's alone and neither
    sibling row carries it: text carrying a `[` or `]`, or carrying BOTH a brace
    and an angle bracket, is admitted rather than refused, because the shared
    traversal's generic-argument and union splits track angle-bracket depth
    (and, inside an inline object, brace depth) but never bracket depth, so such
    text can otherwise be split into a SHARD of a group the author wrote as one
    unit (`Result<{a: string, b: integer, c: boolean}, QueryError>` is one
    well-formed annotation, not three junk fragments)"
    (`docs/spec_topics/diagnostics/code-registry-parse.md:92`). Its cells s4
    (`tests/annotation-nontype-text-refusal.test.ts:678`) and p1/p2 (`:2003`,
    `:2022`) pin the same text as legal at its positions; p2's own message calls
    the annotation "well-formed". A route here does not narrow that decline.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) —
    **fixed (0.38.0)**. Its witness states the argument-count relation from the
    `let` side and pins it: "an angle-depth-only split reports THREE arguments
    where the grammar reports two"
    (`tests/unresolved-annotation-lowering.test.ts:1367–:1377`), with a
    `RESULT-LET-BRACE` row per interior-field count including "three fields"
    (`:1379`, cells at `:1385`). Those cells are `let`-position and stay green
    under every route here.
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    **fixed (0.57.0)**;
    [0035](./0035-params-rhs-inline-object-under-emission.md) — **fixed
    (0.44.0)**; [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md)
    — **fixed (0.84.0)**. The brace frame: the empty-`ObjectType` rule at every
    depth, the `params:` inline-object hoist, and the duplicate-field-key rule
    whose own split is `"angle-and-brace"`
    (`inlineObjectFieldKeys`, `type-grammar.ts:647–:649`). The frame owns
    balanced-brace text and is what the shared decline defers to; this report
    does not move it (§Non-goals).
  - [0164](./0164-generic-argument-literal-lowers-permissive.md) — **open**,
    §Fix constraint-pinned. Owns `lowerTypeExpr`'s generic-argument recursion
    from the emission side and records the two-field shred's lowered bytes
    (`array<{m: "x", n: "y"}>` → `{}`). Its constraint 1 rests on the clause
    element 4 measures false. Coordination, not blocking: a route here that
    widens the split changes what that recursion is handed, and a route that
    leaves the split alone changes nothing 0164 reads.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for positional drift. Bug 0124's own fix
    moved `theta-document.ts` by +54 lines and `type-layer-checks.ts` by +93;
    every citation below is re-verified at HEAD `9eb1290d` and named by symbol
    beside its line number under that adjudication.
- **Affected** (every citation re-verified against the tree at HEAD `9eb1290d`,
  v0.121.0 — `package.json:3` — and, for `src/parser/theta-document.ts`, against
  `git show HEAD:<path>` because a sibling run holds an uncommitted edit to that
  file; see §Observed at):
  - **The split.** `src/parser/params.ts`: `splitTopLevelSegments` (`:1503`),
    whose brace arm is gated on `tracksBraces` (`:1509`); `splitTopLevel`
    (`:1561`), the non-empty filter every caller here uses; `TypeSplitNesting`
    (`:1486`) and its doc (`:1463–:1485`) — the `"angle"` bullet (`:1465–:1470`)
    and the `"angle-and-brace"` bullet (`:1471–:1484`), which state opposite
    reasons about the arity parser.
  - **The shredding call sites.** `src/parser/params.ts`: `lowerTypeExpr`
    (`:665`), its union split (`:676`, `"angle"`), the generic-application test
    and argument split (`:696–:699`), the `array`-arity-1 arm (`:700–:702`) and
    the any-other-generic arm that lowers `{}` after recursing every shard
    (`:704–:709`), and the trailing catch-all's sink push (`:786`).
  - **The decline and the two refusal sites the sink feeds.**
    `src/parser/params.ts`: `isUnspellableTextRefusable` (`:1274`) and its doc's
    two-field shred paragraph (`:1251–:1272`); the `refusable` filter (`:251`)
    and the `params:` refusal with its two guards (`:263–:276`, the code at
    `:271`). `src/parser/theta-document.ts`: the alias arm walk
    (`:6216–:6219`), the alias sink call (`:6239–:6244`, the arms rejoined with
    `" | "`), the alias refusal and its two guards (`:6263–:6270`); the field
    walk (`:6691–:6703`), the field sink call (`:6712–:6717`), the field refusal
    and its one guard (`:6733–:6737`); `schemaTypeNotExpressionDiagnostic`
    (`:5267`).
  - **The threading that reaches both.**
    `src/parser/body-type-lowering.ts`: `collectUnresolvedNamedTypes`
    (`:601–:621`), whose brace-rooted / non-brace-rooted dispatch is
    `:614–:617` and whose `unspellable` push is deliberately un-deduped
    (`:620`); `lowerTypeSource`'s tail call into `lowerTypeExpr` (`:320`);
    `lowerInlineObject` (`:166`), whose own field split IS `"angle-and-brace"`
    (`:175`).
  - **The grammar's own argument reader.** `src/parser/type-grammar.ts`:
    `GENERIC_ARITY` (`:333`), `parseGeneric` (`:514–:530`, each argument parsed
    by `parseUnion` so an `ObjectType` argument is one node), the arity rule
    (`:753–:760`), and `inlineObjectFieldKeys` (`:647–:649`, `"angle-and-brace"`).
  - **The immune position's decline.** `src/parser/type-layer-checks.ts`:
    `annotationSourceIsNotTypeExpression` (`:952–:968`), the bracket arm
    (`:957–:959`), the brace-and-angle arm (`:960–:963`), and the doc paragraph
    that states the shred (`:938–:951`).
  - **The other reader that widened.** `src/parser/theta-document.ts`:
    `queryResponseAnnotation` (`:5349`, `"angle-and-brace"`) and its doc's
    agreement rationale (`:5335–:5344`); the false clause (`:5183–:5186`) and
    the honesty paragraph (`:5202–:5213`).
  - **The bracket family's own row.** `src/parser/schema-declarations.ts`:
    `checkInlineEnumForm` (`:282–:291`), whose match is anchored
    (`/^\s*enum\s*\[/`), so a nested `array<enum[…]>` never reaches
    `theta/parse/inline-enum`; called per arm at `theta-document.ts:6218` and
    per field at `:6696`.
  - **The registration gate.** `src/extension/production-composition.ts`:
    `hasLoadParseError` (`:2214`, any error-severity `theta/load/` or
    `theta/parse/` code) and the three guards that read it beside
    `document.frontmatter === null` (`:1496`, `:2102`, `:2261`).
  - **The registered rows this report says are misapplied.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:91`
    (`theta/parse/schema-type-not-expression`, whose *Trigger* fixes "The unit
    judged is a single brace-free FRAGMENT — the same unit `lowerTypeExpr`'s
    trailing catch-all is handed" and "the exemption is the fragment's own, not
    its enclosure's"), `:92` (bug 0124's row and its SHRED sentence), `:99`
    (`theta/parse/inline-enum`); `code-registry-load.md:19`
    (`theta/load/params-type-not-expression`, same fragment rule, same
    exemption sentence). Mirrors: `docs/reference/grammar.md:212`,
    `docs/reference/type-system.md:26–:27`,
    `docs/reference/diagnostics.md:140` (Trigger-less),
    `docs/reference/schema-subset.md:62`, `:72`.
  - **The spec the refusal contradicts.** `docs/spec_topics/grammar.md:90–:103`
    (the closed `Type` production set; `:99–:100` `GenericType` with a recursive
    `Type` inside `<…>`; `:101` `ObjectType`), `:105` ("The grammar is otherwise
    identical in every position", and the sentence naming all three refusal
    rows), `:107` (the closed constructor set and the arity rule), `:109`
    ("`ObjectType` admits an anonymous object type `{ field: T, ... }` in any
    `Type` position" and "The `Type` reference inside each field is recursive,
    so nested inline objects and `array<{ ... }>` parse").
    `docs/spec_topics/type-system.md:15` (one grammar in every
    type-annotation position). `docs/spec_topics/schemas.md:17` ("field types
    are any expression from the Type System grammar").
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (the `params:`
    right-hand side "is a type expression parsed by the theta type grammar";
    "The inline object type (`{a: Triage}`) is a YAML flow mapping and is
    admitted").
  - **The pins.** `tests/params-scalar-nontype-text-refusal.test.ts:982` (d9 —
    `array<{x: integer, y: string}>` admitted, lowered `{}`), `:986–:993` (d13 —
    `array<{a: ???}>` admitted, an authorized under-refusal).
    `tests/schema-body-nontype-text-refusal.test.ts:680–:707` (a19–a25, the
    landed reach rows), `:815` (b2 — `array<integer, integer> +` keeps
    `generic-arity-mismatch` alone), `:996` (e1 — `array<{b: string}>` admitted,
    lowered `{"type":"array","items":{}}`).
    `tests/inline-object-nested-lowering.test.ts:944–:958` (CONTROL a8, which
    pins `array<{p: integer}>`'s `items: {}` and states in its own comment that
    the split "stays angle-only … Widening it would break
    `theta/parse/generic-arity-mismatch` agreement" — the claim element 4
    measures false).
    `tests/annotation-nontype-text-refusal.test.ts:678–:701` (s4),
    `:2003–:2046` (p1/p2). `tests/unresolved-annotation-lowering.test.ts:1378–
    :1404` (`RESULT-LET-BRACE`, all six rows).
  - **The corpus.** No committed `.theta` or `.thetalib` reaches this class: of
    the 34 files `git ls-files '*.theta' '*.thetalib'` lists, 0 contain
    `array<{` and 0 contain `enum[`. The class is reachable from clean source
    and unreached by the corpus, so no shipped fixture reds today and none pins
    the behaviour either.
- **Observed at:** v0.121.0 (`9eb1290d`, `package.json:3`), the fix commit for
  bug 0124. Offline, deterministic, provider-free, zero model turns: four
  scratch vitest probes (written, run, deleted; `git status --porcelain` and a
  case-insensitive `scratch` sweep verified afterwards) driving the REAL
  `parseThetaDocument` through `tests/helpers/e2e-s1.ts`'s `parseDoc`, plus the
  shipped seams directly (`splitTopLevel`, `isUnspellableTextRefusable`,
  `lowerTypeExpr`, `annotationSourceIsNotTypeExpression`,
  `lowerQueryResponseSchema`). Every value in §Reproduction is that run's output
  verbatim.

  One caveat on the tree state: a sibling run holds an uncommitted edit to
  `src/parser/theta-document.ts` across this measurement window (it grew during
  it). Its hunks are `parseThetaDocument`'s ident-root computation and the
  identifier-resolution walk (`checkUnknownIdentifiers` and the `walkIdent*`
  family), adding a `theta/parse/type-as-value` emission for a body
  `schema`/`enum` name used in expression position. None of them is a
  type-source path: the two refusal emitters, the sink threading, the split and
  the decline sit in regions the edit does not touch, and
  `src/parser/params.ts`, `src/parser/body-type-lowering.ts`,
  `src/parser/type-grammar.ts`, `src/parser/type-layer-checks.ts` and
  `src/parser/schema-declarations.ts` are clean at HEAD. Every
  `theta-document.ts` line number in this report is read from
  `git show HEAD:src/parser/theta-document.ts`, not from the working file, whose
  line numbers the edit shifts. Every §Reproduction value was re-measured with
  the edit present and is unchanged, and no measurement produced
  `theta/parse/type-as-value` or `theta/parse/unknown-identifier`; no fixture
  here writes a declaration name in expression position.

## Summary

`grammar.md:99–:101` derives `array<{a: string, b: integer, c: boolean}>`:
`GenericType ::= "array" "<" Type ">"`, and the `Type` inside the angle brackets
may be `ObjectType ::= "{" Field ("," Field)* ","? "}"`. `:109` states it again
("`ObjectType` admits an anonymous object type … in any `Type` position" and
"nested inline objects and `array<{ ... }>` parse"), and `:105` adds that the
grammar "is otherwise identical in every position". The theta's own type parser
agrees: `parseGeneric` (`type-grammar.ts:514`) parses that argument as one node,
so `theta/parse/generic-arity-mismatch` does not fire, where
`array<integer, integer>` — two arguments the author really wrote — does draw it.

The lowering reads the same argument list with a different splitter.
`lowerTypeExpr` splits it with `splitTopLevel`'s `"angle"` default
(`params.ts:699`), which counts `<` and `>` and, at this mode, not `{` and `}`
(`:1509`). Measured, that hands the lowering three fragments where the grammar
has one argument:

```
splitTopLevel("{a: string, b: integer, c: boolean}", ",")
  → ["{a: string", "b: integer", "c: boolean}"]
splitTopLevel("{a: string, b: integer, c: boolean}", ",", "angle-and-brace")
  → ["{a: string, b: integer, c: boolean}"]
```

Each fragment recurses into `lowerTypeExpr`, misses every arm, and lands on the
catch-all's `unspellable` sink (`:786`) — the sink bugs 0059 and 0061 refuse
from. The shared decline (`:1274`) exempts any text carrying `{` or `}`, so the
first and last fragments are declined and the brace-free middle one,
`b: integer`, is refused. Measured end to end through `parseThetaDocument`:

```
schema S { f: array<{a: string, b: integer, c: boolean}> }
  → error theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression
schema X = array<{a: string, b: integer, c: boolean}>
  → error theta/parse/schema-type-not-expression: 'X' declares a type that is not a theta type expression
params: f: 'array<{a: string, b: integer, c: boolean}>'
  → error theta/load/params-type-not-expression: 'params:' field 'f' right-hand side is not a theta type expression
```

All three are error-severity `theta/parse/` or `theta/load/` codes, so
`hasLoadParseError` (`production-composition.ts:2214`) is true and the theta does
not register; at the `params:` spelling the whole frontmatter is withheld
(`frontmatter === null`) as well.

The refusal begins at the third interior field. Two fields shred as well, but
both shards carry a brace and both are declined, so the two-field spelling is
admitted — a landed cell pins it
(`tests/params-scalar-nontype-text-refusal.test.ts:982`). Four interior fields
draw two refusals at the schema positions, five draw three.

Bug 0124 met this hazard at its own three positions and declined it: its
recogniser admits any source carrying a bracket, or both a brace and an angle
bracket, before it consults the same sink
(`type-layer-checks.ts:957–:963`), and its registry row records the decline as
"this position's alone and neither sibling row carries it"
(`code-registry-parse.md:92`). So the byte-identical text is admitted at a `let`
annotation, an `fn` parameter type and an `fn` return type, and refused at the
three positions that carry no decline.

## Reproduction

Zero model turns, no provider contacted. Every fixture below is the whole source
of its `.theta`; the schema fixtures carry no frontmatter and the `params:`
fixtures carry `mode: prompt` and one field.

### (a) The seams — the split, the sink, and the decline

```
splitTopLevel(text, ",")                          — the "angle" default lowerTypeExpr uses
splitTopLevel(text, ",", "angle-and-brace")       — what the brace-aware readers use
```

| text | `"angle"` | `"angle-and-brace"` |
| --- | --- | --- |
| `{a: string, b: integer, c: boolean}` | `["{a: string", "b: integer", "c: boolean}"]` | `["{a: string, b: integer, c: boolean}"]` |
| `{a: string, b: integer}` | `["{a: string", "b: integer}"]` | one segment |
| `{a: string}` | `["{a: string}"]` | one segment |
| `{x: integer, y: integer, z: integer}` | `["{x: integer", "y: integer", "z: integer}"]` | one segment |
| `{a: string, b: integer, c: boolean}, QueryError` | four parts | `["{a: string, b: integer, c: boolean}", "QueryError"]` |

`isUnspellableTextRefusable` per shard (`params.ts:1274`):

| shard | refusable |
| --- | --- |
| `{a: string` | no (carries `{`) |
| `b: integer` | **yes** |
| `c: boolean}` | no (carries `}`) |
| `b: integer}` (the two-field spelling's second shard) | no (carries `}`) |

`lowerTypeExpr` with an `unspellable` sink threaded, over a `bodyTypeMap` with no
declarations:

| source | lowered | sink contents | refusable |
| --- | --- | --- | --- |
| `array<{a: string, b: integer, c: boolean}>` | `{}` | `["{a: string","b: integer","c: boolean}"]` | `["b: integer"]` |
| `array<{a: string, b: integer}>` | `{}` | `["{a: string","b: integer}"]` | `[]` |
| `array<{a: string}>` | `{"type":"array","items":{}}` | `["{a: string}"]` | `[]` |
| `{a: string, b: integer, c: boolean}` | `{}` | the whole text | `[]` |
| `array<array<{a: string, b: integer, c: boolean}>>` | `{"type":"array","items":{}}` | three shards | `["b: integer"]` |
| `Result<{a: string, b: integer, c: boolean}, QueryError>` | `{}` | three shards | `["b: integer"]` |
| `array<{a: array<{x: integer, y: integer, z: integer}>}>` | `{"type":"array","items":{}}` | `["{a: array<{x: integer, y: integer, z: integer}>}"]` | `[]` |
| `array<enum['a', 'b', 'c']>` | `{}` | `["enum['a'","'b'","'c']"]` | `["enum['a'","'c']"]` |

The last-but-one row is the shape that escapes: an argument that is itself
brace-ROOTED reaches the catch-all whole, carries a brace, and is declined — the
descent stops there, which is why the enclosure decides the verdict (§(c)).

### (b) The three refusing positions, end to end

Fixtures, with `T` substituted:

```
field   schema S {\n  f: T\n}\nlet x = 1\n
alias   schema X = T\nlet x = 1\n
params  ---\nmode: prompt\nparams:\n  f: 'T'\n---\nlet x = 1\n
```

Rows whose `T` names `Cat` are measured on the same three fixtures prefixed with
`schema Cat { a: string }`, so the name resolves and no
`theta/parse/unresolved-named-type` enters the sequence.

| `T` | field | alias | `params:` |
| --- | --- | --- | --- |
| `array<{a: string, b: integer, c: boolean}>` | 1 × refusal | 1 × refusal | 1 × refusal |
| `array<{a:string,b:integer,c:boolean}>` (no spaces) | 1 | 1 | 1 |
| `array<{a: string, b: integer, c: boolean, d: string}>` | **2** | **2** | 1 |
| `array<{a: string, b: integer, c: boolean, d: string, e: number}>` | **3** | **3** | 1 |
| `array<{a: string, b: integer, c: boolean}> \| null` | 1 | 1 | 1 |
| `array<array<{a: string, b: integer, c: boolean}>>` | 1 | 1 | 1 |
| `{a: array<{x: integer, y: integer, z: integer}>}` | 1 | 1 | 1 |
| `array<{a: string, b: integer}>` CONTROL | `[]` | `[]` | `[]` |
| `array<{a: string}>` CONTROL | `[]` | `[]` | `[]` |
| `{a: string, b: integer, c: boolean}` CONTROL (bare) | `[]` | `[]` | `[]` |
| `array<{a: array<{x: integer, y: integer, z: integer}>}>` CONTROL | `[]` | `[]` | `[]` |
| `array<Cat>` CONTROL | `[]` | `[]` | `[]` |
| `{a: Cat, b: string, c: integer}` CONTROL (bare) | `[]` | `[]` | `[]` |

Rendered verbatim, one refusal each:

```
error theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression
error theta/parse/schema-type-not-expression: 'X' declares a type that is not a theta type expression
error theta/load/params-type-not-expression: 'params:' field 'f' right-hand side is not a theta type expression
```

The `.thetalib` spelling refuses identically:
`schema S { f: array<{a: string, b: integer, c: boolean}> }` plus
`fn g(): integer { 1 }` in a `p.thetalib` draws the one `'S'` refusal.

Registration, measured per fixture:

| fixture | error `theta/parse/`+`theta/load/` codes | `frontmatter` |
| --- | --- | --- |
| field, three-field `T` | 1 (`schema-type-not-expression`) | null (no frontmatter in the fixture) |
| alias, three-field `T` | 1 (`schema-type-not-expression`) | null (no frontmatter in the fixture) |
| `params:`, three-field `T` | 1 (`params-type-not-expression`) | **null — withheld** |
| `params:`, two-field `T` CONTROL | 0 | present, `properties.f` = `{}` |

`hasLoadParseError` is true in the first three rows, so all three take the
dropped arm at each of the composition root's three guards (`:1496`, `:2102`,
`:2261`).

### (c) The positions that admit the same text

| position | source | diagnostics |
| --- | --- | --- |
| `let` annotation (bug 0124's) | `let x: array<{a: string, b: integer, c: boolean}> = 1` | `error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected array<{a:string,b:integer,c:boolean}>, got integer` — the RHS gate's own row, no refusal |
| `fn` parameter type | `fn f(p: array<{a: string, b: integer, c: boolean}>): integer { 1 }` | `[]` |
| `fn` return type | `fn f(): array<{a: string, b: integer, c: boolean}> { 1 }` | `[]` |
| `@<T>` query annotation | `let r = @<array<{a: string, b: integer, c: boolean}>>` + backtick body | `[]`; `lowerQueryResponseSchema(T, [], [])` is `{}` |

`annotationSourceIsNotTypeExpression` (bug 0124's recogniser) answers `false`
for `array<{a: string, b: integer, c: boolean}>`, for the two-field spelling,
for `Result<{a: string, b: integer, c: boolean}, QueryError>`, and for
`array<integer, integer>`. The `let` row is bug 0124's own cell p2
(`tests/annotation-nontype-text-refusal.test.ts:2022`), whose assertion message
states the premise this report turns on: "the annotation is well-formed, so the
RHS gate's own row is the WHOLE disposition".

### (d) The argument-count disagreement

| source at a `schema` field type | diagnostics |
| --- | --- |
| `array<integer, integer>` | `error theta/parse/generic-arity-mismatch: generic type 'array' expects 1 type argument(s); got 2` |
| `array<{a: string, b: integer, c: boolean}>` | `error theta/parse/schema-type-not-expression` (no arity diagnostic) |
| `array<{a: string, b: integer}>` | `[]` |
| `array<{a: string, b: integer, c: boolean, d: string}>` | two refusals (no arity diagnostic) |

So the arity rule and the lowering read the same text as one argument and as
three respectively. The readers, by splitter:

| reader | split | site |
| --- | --- | --- |
| the arity / position-rule parser | token-level recursive descent (`parseUnion` per argument) | `type-grammar.ts:514–:530`, rule at `:753–:760` |
| the `Result` ok-side peel | `"angle-and-brace"` | `theta-document.ts:5349` |
| the duplicate-inline-field-key rule | `"angle-and-brace"` | `type-grammar.ts:647–:649` |
| the inline-object field lowering | `"angle-and-brace"` | `body-type-lowering.ts:175` |
| the inline-object hoist's field list | `"angle-and-brace"` | `params.ts:912` |
| **the generic-argument lowering (feeds the refusal)** | **`"angle"`** | **`params.ts:699`** |
| the union-arm lowering | `"angle"` | `params.ts:676` |

### (e) The bracket half of the same gap — an inline `enum[…]` in a generic argument

`enum` is top-level only (`grammar.md`'s `Type` set contains no bracket form;
`theta/parse/inline-enum` is `code-registry-parse.md:99`), so this input is
illegal at every position. The measured code and count are still not that row's:

| source | field | alias | `params:` |
| --- | --- | --- | --- |
| `enum["a", "b"]` | 1 × `theta/parse/inline-enum` | 1 × `inline-enum` | 1 × `params-type-not-expression` |
| `enum["a", "b", "c"]` | 1 × `inline-enum` | 1 × `inline-enum` | 1 × `params-type-not-expression` |
| `array<enum["a", "b"]>` | **2 × `schema-type-not-expression`** | **2** | 1 × `params-type-not-expression` |
| `array<enum["a", "b", "c"]>` | **2 × `schema-type-not-expression`** | **2** | 1 |

`checkInlineEnumForm`'s match is anchored (`/^\s*enum\s*\[/`,
`schema-declarations.ts:289`), so a nested inline enum never reaches its row; the
shred then splits `enum["a", "b"]` into `enum["a"` and `"b"]`, neither of which
carries a brace or parses as a literal, so both are refused.

### (f) The TRUE refusals a whole-source shred decline would drop

Applying bug 0124's decline predicate to the whole captured source at these
positions — `[`/`]`, or brace AND angle ⇒ admit — against what HEAD refuses.
Every row is measured on the three §(b) fixtures prefixed with
`schema Cat { a: string }`:

| source | declined by that rule | field / alias / `params:` at HEAD |
| --- | --- | --- |
| `array<Cat +>` | no | 1 / 1 / 1 — 0061 cells a21/a22 |
| `{b: string +}` | no | 1 / 1 / 1 — a23/a24 |
| `{b: {c: ???}}` | no | 1 / 1 / 1 — a25 |
| `{a: array<Cat +>}` | **yes** | 1 / 1 / 1 — **lost** |
| `{a: array<Cat +>, b: string}` | **yes** | 1 / 1 / 1 — **lost** |
| `string \| {a: array<Cat +>}` | **yes** | 1 / 1 / 1 — **lost** |
| `array<{a: Cat +}>` | yes | `[]` / `[]` / `[]` — already admitted (0059 d13's class) |
| `array<{a: string, b: integer, c: boolean}>` | yes | 1 / 1 / 1 — this report's subject |

No committed cell pins any of the three lost rows: 0061's landed reach rows are
`array<Cat +>` (angle only) and `{b: string +}` / `{b: {c: ???}}` (brace only),
all three of which the rule keeps.

## Expected behaviour

- **A `GenericType` argument that is an `ObjectType` is derivable, so it draws
  no refusal at any position.** `grammar.md:99–:100` makes the argument inside
  `array<…>` a recursive `Type`; `:93` and `:101` list `ObjectType` among
  `Type`'s six alternatives and give its production; `:109` admits it "in any
  `Type` position" and names
  `array<{ ... }>` as parsing. `:105` adds that the grammar "is otherwise
  identical in every position", and `type-system.md:15` states the same rule
  with the three refusal rows listed as the disposition for text that derives
  from NONE of the forms. `array<{a: string, b: integer, c: boolean}>` derives,
  so `schema S { f: … }`, `schema X = …` and `params: f: '…'` each load with no
  diagnostic, exactly as the one- and two-field spellings do today and as the
  same text does at bug 0124's three positions.
- **The judged unit is text the author wrote.** Both refusing rows fix the unit
  as a fragment the lowering hands the judgement
  (`code-registry-parse.md:91`, `code-registry-load.md:19`) and both close the
  set to fragments "every arm of the `Type` grammar's own recognisers … has
  declined". `b: integer` is not a fragment of the source in any sense the
  grammar recognises: it is half of one `ObjectType` the author wrote as a
  unit, produced by a splitter that disagrees with the parser deciding the same
  text's argument count. Bug 0124's row already states this principle for its
  own position (`:92`, quoted in §Related).
- **One argument list, one argument count.** `grammar.md:107` fixes `array` at
  arity 1 and makes an argument-count mismatch
  `theta/parse/generic-arity-mismatch`. The lowering that recurses those
  arguments and the parser that counts them agree about where an argument ends
  — which is the reason `queryResponseAnnotation` (`theta-document.ts:5349`) and
  the duplicate-key rule (`type-grammar.ts:649`) already split
  `"angle-and-brace"`.
- **An inline `enum[…]` in a generic argument draws `theta/parse/inline-enum`,
  once.** `code-registry-parse.md:99` owns that spelling at every depth
  ("`enum["a", "b"]` or other inline-enum form"), and the schema field / alias
  positions already emit it for the bare spelling. Two
  `schema-type-not-expression` diagnostics naming the enclosing declaration are
  neither that row nor the count either row states.
- **The refusals that stand, stand.** Text carrying junk the grammar declines —
  `array<Cat +>`, `{b: string +}`, `{b: {c: ???}}`, `{a: array<Cat +>}`,
  `string | {a: array<Cat +>}` — keeps exactly the refusal it draws today, at
  the same position, with the same code and count.

## Actual behaviour / root cause

### 1. One argument list, two splitters

`lowerTypeExpr`'s generic arm tests positionally — a `<` past index 0 and a
source ending in `>` (`params.ts:696–:697`) — then splits the interior with
`splitTopLevel(…, ",")`, whose default nesting is `"angle"`
(`:699`, `:1561`, `:1509`). For `array<{a: string, b: integer, c: boolean}>`
that yields three parts, so `ctor === "array" && args.length === 1`
(`:700`) is false and the any-other-generic arm runs instead: it recurses each
part for its side effects and returns `{}` (`:704–:709`).

The parser that computes `theta/parse/generic-arity-mismatch` does not use that
splitter. `parseGeneric` (`type-grammar.ts:514`) parses argument one with
`parseUnion`, which consumes the whole `ObjectType`, so `node.args.length` is 1
and the arity rule (`:753–:760`) is satisfied. Measured, the two disagree
exactly on this class: `array<integer, integer>` draws the arity diagnostic and
`array<{a: string, b: integer, c: boolean}>` does not.

### 2. The shard reaches the refusal sink, and the shared decline cannot see it

Each shard recurses into `lowerTypeExpr` and misses every arm: it is not a
union (no top-level `|`), not a generic application, not a primitive, not a
reserved keyword, and not `IDENTIFIER`-shaped. So it lands on the catch-all,
which pushes the text onto `lowerCtx.unspellable` and lowers `{}`
(`params.ts:786`).

That sink is what bugs 0059 and 0061 refuse from. Its decline
(`isUnspellableTextRefusable`, `:1274`) is `parseLiteralArm(text) === undefined
&& !text.includes("{") && !text.includes("}")`. The decline is correct for the
shred it was written against — its own doc names
`array<{x: integer, y: string}>`'s two fragments `{x: integer` and `y: string}`
and explains that a narrower brace-ROOTED test would refuse both
(`:1262–:1265`) — but a brace group with three or more fields produces an
INTERIOR shard carrying no brace at all, and the decline has no way to tell that
shard from text the author wrote. Measured: `b: integer` is refusable;
`{a: string` and `c: boolean}` are not.

### 3. Both emitters raise, and guard 1 does not intervene

At the schema field position, `collectUnresolvedNamedTypes` threads the sink
(`theta-document.ts:6712–:6717`, `body-type-lowering.ts:614–:617`, `:620` —
un-deduped by design, one entry per fragment), and the emitter raises one
diagnostic per refusable entry (`:6733–:6737`). The alias position does the same
over the arms rejoined with `" | "` (`:6239–:6244`, `:6263–:6270`). Guard 1 —
"this field/declaration already drew an error-severity diagnostic in its own
walk" — is the only thing that could suppress it, and nothing else fires for
this source: the arity rule sees one argument, `checkInlineEnumForm`'s match is
anchored, `result-in-schema-position` does not apply, and every name in the
source is a primitive. At `params:` the same sink is filtered at `:251` and
raised once per field (`:263–:276`), which is why a four-field interior draws two
diagnostics at the schema positions and one at `params:`.

### 4. Depth and enclosure decide reach, not the author's intent

The refusal reaches wherever the descent reaches a comma-carrying brace group
through an ANGLE-tracking split, and stops wherever an enclosing brace group
absorbs it first:

- `array<array<{a,b,c}>>` — refused. The outer split sees the inner `<…>`, so
  the argument arrives whole and the inner generic shreds it.
- `{a: array<{x,y,z}>}` — refused. The bare brace root dispatches to
  `lowerInlineObject`, which splits `"angle-and-brace"` (`:175`) and hands field
  `a`'s type to the generic path, which shreds it.
- `array<{a: array<{x,y,z}>}>` — admitted. The argument is brace-ROOTED, so
  `lowerTypeExpr` has no inline-object arm for it: the whole text reaches the
  catch-all, carries a brace, and is declined. The nested three-field group is
  never split.

So the same three-field object is refused as a field type and admitted one
enclosure out, with no diagnostic distinguishing the two.

### 5. The shipped rationale for the narrow split is false in one clause

`theta-document.ts:5183–:5186` gives the reason as agreement with
`theta/parse/generic-arity-mismatch`. Measured, angle-only is the mode that
disagrees, and the corpus says so in three other places: `params.ts:1475–:1479`
("an angle-only split yields three parts and disagrees with the parser that
computes `theta/parse/generic-arity-mismatch`"), `theta-document.ts:5335–:5344`
(`queryResponseAnnotation` widened for that agreement), and bug 0028's witness
("an angle-depth-only split reports THREE arguments where the grammar reports
two", `tests/unresolved-annotation-lowering.test.ts:1367–:1377`). The clause is
also quoted as the governing constraint by an open report
([0164](./0164-generic-argument-literal-lowers-permissive.md) §Fix constraint 1)
and by a landed cell's comment
(`tests/inline-object-nested-lowering.test.ts:945–:948`).

The comment's other reason holds and is not a wording defect: under angle-only,
`array<{a: string, b: integer}>` lowers `{}` — asserting nothing — where a
widened split makes it take the `array` arm and lower
`{"type":"array","items":{}}`, asserting arrayness while dropping the element
shape (`:5202–:5213`). Measured for the one-field spelling, which already
presents as one argument: `array<{a: string}>` lowers
`{"type":"array","items":{}}` today.

### 6. Nothing witnesses the false refusal

No committed cell drives a three-or-more-field inline object through a generic
argument at any of the three refusing positions. The nearest cells stop one
field short or sit at another position: 0059's d9 (`array<{x: integer, y:
string}>`, admitted), 0061's e1 (`array<{b: string}>`, admitted), 0039's
CONTROL a8 (`{a: array<{p: integer}>}` at the annotation root), and bug 0124's
s4 / p1 / p2 plus bug 0028's `RESULT-LET-BRACE` rows, which pin the three-field
spelling as legal at the `let` position. The uncovered cell is the intersection:
three interior fields, inside a generic argument, at a position that threads the
refusal sink.

## Why it matters

- **Input the grammar derives does not load, at three of the `Type` positions
  the grammar makes identical.** The author writes an array of an inline object with three fields
  — each part named as admitted by `grammar.md:99–:101` and `:109` — and the
  load answers "declares a type that is not a theta type expression". The
  refusal names the declaration, not the text, and the text it is actually about
  (`b: integer`) appears in no message and in no source the author wrote.
  Registration is denied (`hasLoadParseError`,
  `production-composition.ts:2214`), and at `params:` the whole frontmatter is
  withheld, so the theta is absent from the registry rather than degraded.
- **The failure is invisible in the direction that matters.** The discriminator
  is the number of interior fields: two load, three refuse, four refuse twice.
  Nothing in the message says so. The workaround an author can find by
  bisection — delete a field — reaches a load that succeeds and a `params:`
  field lowered to `{}` (measured), so the declared element type then enforces
  nothing at the argument boundary. That permissive lowering is
  [0164](./0164-generic-argument-literal-lowers-permissive.md)'s and
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)'s
  subject, not this report's, but it is what the escape route lands on.
- **One text, two verdicts, decided by position.** The byte-identical
  annotation is admitted at a `let` annotation, an `fn` parameter type, an `fn`
  return type and an `@<T>` schema, and refused at a `schema` field type, an
  alias arm and a `params:` field. `grammar.md:105` and `type-system.md:15` both
  state that the grammar is identical in every position; the divergence is
  between which positions thread the refusal sink and which carry bug 0124's
  decline, neither of which is a grammar distinction.
- **A registered row fires where another row's spelling is the fault.** An
  inline `enum[…]` inside a generic argument draws two
  `schema-type-not-expression` diagnostics naming the declaration instead of one
  `theta/parse/inline-enum` naming the construct (§Reproduction (e)). The author
  is told the type expression is unspellable, when the fault is that `enum` is
  top-level only.
- **Reachable from clean source, unreached by the corpus.** 0 of the 34
  committed `.theta` / `.thetalib` files contain `array<{` or `enum[`, so
  nothing reds today and nothing pins the behaviour — the same shape bug 0124
  carried for its own class until it was measured.

## Fix

**Not settled.** Constraint-pinned: the verdict is decided — the annotation is
derivable and draws no refusal at any position — and the mechanism is not.

### (a) What is not in question

The judged text must be text the source spells. Bug 0124 settled this principle
at its own three positions and its row states it; the two sibling rows'
*Trigger* text (`code-registry-parse.md:91`, `code-registry-load.md:19`) fixes
the unit as "a single brace-free FRAGMENT — the same unit `lowerTypeExpr`'s
trailing catch-all is handed", which is exactly the clause a split that
manufactures fragments turns against the author. No route changes a code, a
severity, a message, a placeholder set, or a position's range.

### (b) Three routes, each with a different blast radius

1. **Widen the generic-argument split to `"angle-and-brace"`**
   (`params.ts:699`), and decide the union split (`:676`) explicitly in the same
   breath. Removes the shred at its source, brings the lowering into agreement
   with the arity parser, and needs no new predicate. Costs, all measured:
   (i) `array<{a: string, b: integer}>` and the three-field spelling then
   present as ONE argument and take the `array` arm, lowering
   `{"type":"array","items":{}}` where they lower `{}` today — the honesty
   objection at `theta-document.ts:5202–:5213`, a byte change at cell 0059 d9
   (`tests/params-scalar-nontype-text-refusal.test.ts:982`, whose asserted
   fragment is `{}`), and a falsified rationale at 0039's CONTROL a8
   (`tests/inline-object-nested-lowering.test.ts:945–:948`), whose asserted
   bytes do not move because its vehicle carries one field; (ii) it re-opens
   [0164](./0164-generic-argument-literal-lowers-permissive.md) §Fix constraint
   1 by name, whose ground is the clause element 4 measures false, so the route
   re-derives that constraint rather than assuming it; (iii) `{a: 1 | 2}`-shaped
   union arms stop splitting if the union split is widened too
   (`params.ts:1465–:1470`), so the route states which of the two splits it
   moves and why.
2. **Share bug 0124's position-level decline with the three refusing sites.**
   Cheapest: each site already holds the whole captured source
   (`f.typeSource`, `s.arms.join(" | ")`, `field.typeSource`), so the decline can
   be asked before the sink is filtered, leaving every lowered byte identical.
   Costs: it declines MORE than the defect needs — measured, it drops three
   TRUE refusals (`{a: array<Cat +>}`,
   `{a: array<Cat +>, b: string}`, `string | {a: array<Cat +>}`;
   §Reproduction (f)), none of which a committed cell pins, and it leaves the
   bracket family (§(e)) admitted at the two schema positions where the bare
   spelling draws `inline-enum`. A route taking this states the lost set as a
   deliberate under-refusal in both rows' *Trigger* text, the way bug 0124's row
   states its own, and records the residual.
3. **Mark the shards instead of judging them.** Keep the split and the lowered
   bytes; make the sink carry (or the traversal suppress) the fact that an entry
   came from a group the split cut, so the refusal judges only fragments that
   are whole in the source. Costs: it touches the sink's contract, which the
   three refusing positions and bug 0124's recogniser read
   (`body-type-lowering.ts:620`, `params.ts:251`,
   `theta-document.ts:6268`, `:6735`, `type-layer-checks.ts:965–:967`), so the
   shape of the change is a shared-type edit rather than a local one; it needs a
   stated rule for what "whole in the source" means at the union split as well;
   and it leaves the arity/lowering disagreement of element 1 standing, so the
   two-field spelling keeps lowering `{}` for a shape the grammar derives.

### (c) Constraints every route carries

1. **The landed TRUE refusals are locks.** `array<Cat +>` (0061 a21/a22),
   `{b: string +}` (a23/a24), `{b: {c: ???}}` (a25), `string | integer +`
   (a19/a20), `Cat +` at both positions, and every `params:` row in 0059's
   refused set keep their code, their count and their range. Route (b)(2)
   additionally answers for the three rows §Reproduction (f) measures as lost.
2. **The pinned bytes are enumerated before the change, not discovered after.**
   Checked at HEAD: 0059 d9 (`array<{x: integer, y: string}>` → `{}`, `[]`),
   0059 d13 (`array<{a: ???}>` → `{"type":"array","items":{}}`, `[]`), 0061 e1
   (`array<{b: string}>` → `{"type":"array","items":{}}`, `[]`), 0039 CONTROL a8
   (`{a: array<{p: integer}>}` → `properties.a` =
   `{"type":"array","items":{}}`). Routes (b)(2) and (b)(3) leave all four
   byte-identical; route (b)(1) moves d9's fragment and must re-derive it under
   this report's authority, and corrects a8's stated rationale in the same
   commit.
3. **No cell pins the false refusal.** Checked: no committed test drives a
   three-or-more-field inline object through a generic argument at the three
   refusing positions. A grep over `tests/` for the three-field spelling
   (`b: integer, c: boolean`) hits exactly two files — bug 0124's witness, at
   its own three positions, and bug 0028's witness, at the `let` position — and
   every other `array<{` hit in `tests/` carries one or two fields. So no route
   needs to move a cell that asserts today's refusal; the witness is additive.
4. **The two sibling rows' *Trigger* text is corrected in the same commit.**
   Both rows state the unit as a brace-free fragment and add "the exemption is
   the fragment's own, not its enclosure's"
   (`code-registry-parse.md:91`, `code-registry-load.md:19`). Whichever route
   lands, that sentence over-reaches: it licenses refusing a shard. The route
   restates the unit so it ranges over fragments the source spells, and mirrors
   the edit to `docs/reference/grammar.md:212`,
   `docs/reference/type-system.md:26–:27`,
   `docs/reference/schema-subset.md:62`, `:72`, and
   `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58`, whose prose
   carries the same clause. `docs/reference/diagnostics.md:140` is Trigger-less
   and is re-verified as such rather than edited.
5. **The false clause is corrected wherever it is repeated.**
   `theta-document.ts:5183–:5186` (the reason), and the comment at
   `tests/inline-object-nested-lowering.test.ts:945–:948` that restates it.
   `params.ts:1471–:1479` already states the relation correctly and is the
   wording to converge on. A route that does NOT widen the split still corrects
   the clause, because the clause is false independently of the remedy.
6. **`0134`'s adjudication is respected.** Bug 0124's commit shifted lines in
   both refusal-site files; a route re-anchors the citations it touches by
   symbol rather than running a corpus-wide renumber
   ([0134](./0134-params-shift-induced-stale-citations.md) §Fix).
7. **Witness — unit tier, offline, provider-free.** The observable is a
   diagnostic sequence out of `parseThetaDocument`, so the witness drives the
   §Reproduction (b) fixture matrix plus the (a) seam rows. Reds: the
   three-field, four-field, five-field, union-arm, nested-generic and
   bare-brace-root rows at all three positions. Green-now-green-after fences:
   every CONTROL row of (b), the (c) admissions at bug 0124's three positions
   and at `@<T>`, the (d) arity rows, and the (f) TRUE refusals. Each new
   assertion is proved in both directions once. DIAG-4: every expected message
   is read from the registry at runtime.

### (d) GOV-15 — the removal direction

Every route makes at least one input that FAILS to load today load cleanly. The
inputs are outside GOV-15's promise as its own predicate defines the set
(`docs/spec_topics/governance/source-language-stability.md:9` — "A file that does
not load cleanly under theta 1.0.0 is outside the GOV-15 equivalence promise's
input set"), and the *Diagnostic-registry carve-out* (`:25`) disposes of the
edit directly: "a DIAG-2 *trigger* change is dispositioned by the same
principle, in-scope as an addition for inputs newly brought into the code's
emission set and as a removal for inputs taken out of it". Narrowing the two
rows' Triggers so a shard is no longer refused is a removal for exactly the
inputs §Reproduction (b) enumerates. The route states this on the record and
enumerates every spelling that flips:

| spelling | today | after |
| --- | --- | --- |
| `array<{…}>` over an inline object with ≥3 fields, at a `schema` field type / alias arm | 1–3 × `theta/parse/schema-type-not-expression`, unregistered | loads, no diagnostic |
| the same at a `params:` field | 1 × `theta/load/params-type-not-expression`, frontmatter withheld | loads, `params:` lowered |
| the same nested (`array<array<{…}>>`, `{a: array<{…}>}`, union arm) | 1 × refusal | loads |
| an inline `enum[…]` inside a generic argument | 2 × `schema-type-not-expression` (schema positions) | route-dependent: `theta/parse/inline-enum`, or nothing — stated either way |
| `{a: array<Cat +>}` and its two siblings | 1 × refusal | route (b)(2): loads (a lost refusal); routes (b)(1)/(b)(3): 1 × refusal, unchanged |
| `array<{a: string, b: integer}>`'s lowered fragment | `{}` | route (b)(1): `{"type":"array","items":{}}`; routes (b)(2)/(b)(3): `{}` |
| every 0061 / 0059 refused row | its refusal | unchanged |

Observable (b) is the only one that moves for the schema positions; at
`params:` observable (a) moves as well, since a withheld frontmatter becomes a
present one. Observable (c) is not measured here beyond the two rows' *Message*
columns, which are the text they render; a route confirms it by inspection
rather than assuming it.

### (e) Ordering

Nothing blocks this report and it blocks nothing.
[0164](./0164-generic-argument-literal-lowers-permissive.md) is **open** and
shares one function (`lowerTypeExpr`'s generic arm): whichever lands second
rebases onto the other's hunks there, and if 0164 lands first its §Fix
constraint 1 is re-derived here rather than inherited, since its ground is the
clause element 4 measures false.
[0124](./0124-parsetype-trailing-punctuation-leniency.md) is **fixed (0.121.0)**
and owns the decline a route may share plus the 251-cell witness that pins its
positions' admission; a route re-runs
`tests/annotation-nontype-text-refusal.test.ts` unchanged.
[0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md) (**fixed,
0.87.0**) and
[0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) (**fixed,
0.86.0**) own the three refusal sites and the shared decline; a route re-runs
`tests/schema-body-nontype-text-refusal.test.ts` (96 cells) and
`tests/params-scalar-nontype-text-refusal.test.ts` green, and re-runs
`tests/inline-object-nested-lowering.test.ts`,
`tests/params-inline-object-lowering.test.ts` and
`tests/unresolved-annotation-lowering.test.ts` for the brace frame.

## Non-goals

- **Bug 0124's immune positions.** The SHRED decline
  (`type-layer-checks.ts:957–:963`) is that report's settled mechanism and its
  registry row states it (`code-registry-parse.md:92`). A route here may share
  it, but does not narrow it: its cells s4 and p1/p2
  (`tests/annotation-nontype-text-refusal.test.ts:678`, `:2003`, `:2022`) and
  bug 0028's `RESULT-LET-BRACE` rows stay green under every route.
- **The brace frame's ownership of balanced-brace text.** The fragment-level
  `{`/`}` exemption in `isUnspellableTextRefusable` stays: a brace-carrying
  fragment belongs to the frame bugs
  [0035](./0035-params-rhs-inline-object-under-emission.md),
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) and
  [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) own —
  the hoist, the empty-`ObjectType` rule and the duplicate-key rule. This report
  is about a fragment the split MANUFACTURES, not about widening or narrowing
  that exemption's domain.
- **What an admitted generic argument lowers to.** `array<{…}>`'s permissive
  `items: {}`, an all-literal argument's `anyOf`, and the two-field spelling's
  `{}` are [0164](./0164-generic-argument-literal-lowers-permissive.md)'s (open),
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)'s
  and [0184](./0184-union-arm-literal-lowers-empty-schema.md)'s subjects. A
  route here that widens the split moves those bytes and must re-derive the
  cells that pin them (§Fix (c)(2)); a route that does not, leaves them
  untouched. Neither direction adjudicates what the fragment SHOULD assert.
- **The arity rule and the closed constructor set.** `array` stays arity 1,
  `Result` arity 2 (`grammar.md:107`, `GENERIC_ARITY`,
  `type-grammar.ts:333`), and `theta/parse/generic-arity-mismatch` keeps its
  trigger; cell b2 (`tests/schema-body-nontype-text-refusal.test.ts:815`) stays
  green.
- **The `@<T>` position's absent sink.** That position threads no `unspellable`
  array (`params.ts:578–:582`), which is bug 0061 §Fix constraint 2's
  byte-freeze. A route here does not thread one; the position's admission of
  this text is already correct.
- **The `theta/parse/inline-enum` row's own wording and its anchored match.**
  §Reproduction (e) records that a nested inline enum draws the wrong code; the
  remedy for it is inside this report's fix only insofar as removing the shred
  removes the wrong code. Whether the anchored match
  (`schema-declarations.ts:289`) should also fire at depth is that row's
  question, and a route that leaves the nested spelling drawing nothing at all
  says so on the record rather than silently.

## Provenance

Filed from the bug 0124 fix run (v0.121.0, commit `9eb1290d`), which measured
this defect, declined it for its own three positions, and changed nothing at the
three that refuse. Two records, both in the tree or in that run's report:

- **The shipped bug document**, `0124` §Fix (0.121.0) residual 5, verbatim: "**A
  pre-existing FALSE refusal at bug 0061's and 0059's landed positions, which
  this fix does not inherit and does not repair.** The legal annotation
  `array<{a: string, b: integer, c: boolean}>` draws
  `theta/parse/schema-type-not-expression` at a `schema` object-body field type
  AND at a `schema X = …` alias arm, and `theta/load/params-type-not-expression`
  at a `params:` field — measured at the fix baseline with this fix absent from
  those paths — because the angle-only generic-argument split shreds the
  three-field brace group and the brace-free middle shard `b: integer` is
  refusable under the shared decline. The same hazard reaches any depth
  (`{a: array<{x: string, y: integer, z: boolean}>}`) and through an `enum[…]`
  list of two or more items, since no split tracks bracket depth. This fix's own
  three positions are immune by the SHRED decline above. Repairing the sibling
  positions would move two landed rows and is not this report's to decide."
- **That run's report** (`.pi/tmp/fixes/0124-report.md`, *Residuals / notes*
  item 5), which states the same finding and marks it **Filing candidate**.

**Re-measured at HEAD `9eb1290d` for this filing, not copied.** The residual
gives the mechanism and one spelling; it does not establish the following, each
measured here:

- **The threshold, bracketed from both sides.** The refusal begins at the THIRD
  interior field and scales with the count: 1 field `[]`, 2 fields `[]`,
  3 fields one refusal, 4 fields two, 5 fields three at the schema positions —
  and always exactly one at `params:`, whose row counts per field, not per
  fragment.
- **The argument-count disagreement, with its discriminator.**
  `array<integer, integer>` draws `theta/parse/generic-arity-mismatch`;
  `array<{a: string, b: integer, c: boolean}>` draws none, so the grammar's own
  parser counts one argument where the lowering's split counts three. The
  residual does not name the arity parser.
- **Which enclosure blocks the descent.** `array<{a: array<{x,y,z}>}>` is
  ADMITTED while `{a: array<{x,y,z}>}` is refused, because a brace-ROOTED
  generic argument reaches the catch-all whole and is declined. The residual's
  "reaches any depth" is true of the second spelling and false of the first.
- **The bracket family's measured shape.** The residual says "an `enum[…]` list
  of two or more items". Measured: `array<enum["a", "b"]>` draws TWO
  `schema-type-not-expression` diagnostics at each schema position and one at
  `params:`, and the bare `enum["a", "b"]` draws `theta/parse/inline-enum`
  instead — so the observable is a wrong code and a wrong count for input that
  is illegal either way, not a false refusal.
- **The registration observable.** All three refusals are error-severity
  `theta/parse/` or `theta/load/` codes, so `hasLoadParseError` is true; at
  `params:` the whole frontmatter is additionally withheld (`frontmatter ===
  null`), while the two-field control keeps its frontmatter and lowers
  `properties.f` = `{}`.
- **What a shared decline would cost.** Three TRUE refusals that HEAD raises
  (`{a: array<Cat +>}`, `{a: array<Cat +>, b: string}`,
  `string | {a: array<Cat +>}`) carry both a brace and an angle bracket, so bug
  0124's decline would admit them. No committed cell pins any of the three.
- **The false clause and its two repetitions.** `theta-document.ts:5183–:5186`
  names arity agreement as the reason for the narrow split;
  `params.ts:1475–:1479`, `theta-document.ts:5335–:5344` and bug 0028's witness
  state the opposite relation, and the measurement settles it. The residual does
  not mention the clause, and an open report
  ([0164](./0164-generic-argument-literal-lowers-permissive.md) §Fix constraint
  1) quotes it as governing.
