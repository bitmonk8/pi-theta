# Bug 0054 — The `__inline_<slug>` `$defs` name is now minted in three scopes that share no retention table, and the two places their fragments meet — `hoistNestedDefs` (the `params:` document) and `pruneDocumentDefs` (the `@<T>` document) — dedup by name first-wins with no byte comparison, while the annotation position's own mint runs after load with nothing reading its collision sink

- **Status:** open. §Fix is constraint-pinned: the constraints and the
  per-element dispositions are stated, the choice between them is not made
  here.
- **Kind:** implementation gap against a stated spec posture, two elements on
  one hazard family (the `__inline_<slug>` `$defs` key).
  1. *The byte-equality check does not run where fragments from different mint
     scopes meet.* schema-subset.md §Schema-slug collision posture (`:112`)
     requires every slug-keyed dedup table to verify byte-equality "on a slug
     match *before* treating the two as the same fragment", and step 2 of the
     Lowering Algorithm (`:73`) repeats it for `__inline_<slug>` specifically.
     `hoistInlineObjectType` (`src/parser/params.ts:545–557`) implements that
     check against the retention threaded into its own call, and the three
     callers each build their own retention
     (`src/parser/params.ts:143–145`, `src/parser/body-type-lowering.ts:532–535`,
     `src/runtime/query-schema-lowering.ts:132–137`). Fragments minted in two
     different scopes therefore first meet at a `$defs` merge, and both merges
     — `hoistNestedDefs` (`src/parser/params.ts:274–295`) and
     `pruneDocumentDefs`'s HOIST walk
     (`src/runtime/query-schema-lowering.ts:230–248`) — dedup on the key
     `hoisted[name] !== undefined` alone.
  2. *At the `@<T>` annotation position the check runs and its report has no
     channel.* `lowerQueryResponseSchema` builds the sinks per call
     (`:132–137`), threads them (`:141`, `:148`), and never reads
     `slugCollisions` back; its return type is `LoweredSchema | undefined`
     (`:105–109`). Both production call sites are runtime
     (`src/extension/production-theta-producer.ts:2314`, `:3308`), after the
     load gate. The load-time pass that traverses the same annotation text,
     `collectUnresolvedNamedTypes`
     (`src/parser/body-type-lowering.ts:670–685`), passes no sinks at all
     (`:680`, `:682`). The `params:`, `schema`-body and alias-RHS positions do
     report, through `parseParams` (`src/parser/params.ts:161–163`, `:183–191`)
     and `collectBodyTypes` (`src/parser/theta-document.ts:1202–1203`,
     `:1219–1228`).
- **Related:**
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  — the origin. Its fix (0.49.0) made every type position hoist, which is what
  created a second and third mint scope; its §Fix (0.49.0) *Residuals* (iii)
  (`:269–271`) and (iv) (`:271–275`) record both elements and leave them
  unfiled. This report files them together: they are one family — the posture
  `:112` states is enforced per scope and unenforced between scopes, and
  unreportable at the scope that runs last.
  [0040](./0040-inline-slug-def-namespace-not-reserved.md) — open, and the
  **boundary is explicit**. 0040 owns the *namespace reservation* question:
  whether an author name may be spelled `__inline_<16hex>`, and the two
  `params:`-position writers (`lowerTypeExpr`'s `IDENTIFIER` arm and the
  mint's retention arm) that alias one when it is. This report owns the
  *slug-vs-slug* surfaces 0040's text predates, all created by 0039's fix: the
  two cross-scope merges, and the annotation position's unreportable mint.
  0040's text states that the annotation arm "mints no `__inline_` name",
  which was true at `f959f8de` and is false at HEAD (§Reproduction M2c).
  Fixture M1 below uses 0040's input class because it is the only byte-
  differing input constructible at HEAD; the mechanism it exhibits is the
  merge, not either 0040 writer, and it survives 0040's fix unless that fix
  also reserves the name at the merges. **Coordination: whichever of 0040 and
  0054 lands second re-derives its §Reproduction and §Fix against the first's
  changes**, since both move code in `src/parser/params.ts` and both concern
  who may occupy an `__inline_<slug>` key.
  [0035](./0035-params-rhs-inline-object-under-emission.md) — the fix (0.44.0)
  that introduced `__inline_<slug>` minting at the `params:` position, when it
  was the only minting position and one block-shared retention covered the
  whole surface. Its §Fix (0.44.0) *Residuals* (ii) is 0040; its (i) is 0039.
- **Affected** (every citation verified at HEAD `52e257bc`, 0.49.0):
  - `src/parser/params.ts:274–295` — `hoistNestedDefs`, the `params:`
    document's merge, called once (`:241`). The walk's only guard is
    `hoisted[name] !== undefined` (`:281`); it compares no bytes. The queue is
    seeded with the top-level `defs` entries (`:278`) and nested entries are
    appended (`:289`), so a top-level entry always wins a name clash with one
    nested inside another fragment.
  - `src/runtime/query-schema-lowering.ts:230–248` — `pruneDocumentDefs`'s
    HOIST walk, the annotation document's merge, reached from all three
    annotation arms (`:121`, `:140`, `:153`). Same guard (`:235`), same queue
    order (`:232` seeds, `:243` appends), no byte comparison.
  - `src/parser/params.ts:502–589` — `hoistInlineObjectType`, the one mint
    site all three scopes call. `:545–546` reads `lowerCtx.inlineCanonical` /
    `lowerCtx.inlineFragments`; `:556` is the already-minted disjunct; `:565`
    is the only write to `slugCollisions`; `:572` re-registers a retained
    fragment into a scope whose `defs` lacks it; `:585–587` is the mint. Every
    read is off `lowerCtx`, so the check spans exactly the scope threaded into
    that call and nothing wider.
  - The three retentions, none shared with another:
    `src/parser/params.ts:143–145` (block-scoped, the `params:` position);
    `src/parser/body-type-lowering.ts:532–535` (document-scoped, the
    `schema`-body and alias-RHS positions);
    `src/runtime/query-schema-lowering.ts:132–137` (call-scoped, the `@<T>`
    position). The second and third are built inside one
    `lowerQueryResponseSchema` call — `:110` calls `buildBodyTypeSchemas`,
    which builds its own — so even a single annotation lowering carries two
    retention tables that cannot see each other.
  - `src/parser/params.ts:161–163`, `:183–191` — the `params:` position's
    report path: the per-field append-and-slice attribution and the
    `theta/load/schema-slug-collision` emission whose error severity withholds
    the lowered schema.
  - `src/parser/theta-document.ts:1202–1203`, `:1219–1228` — `collectBodyTypes`
    passes a `collisions` array to `buildBodyTypeSchemas` and turns each entry
    into the same registered diagnostic at the offending decl's range.
  - `src/parser/body-type-lowering.ts:540`, `:552–553`, `:570–571`, `:611` —
    `inlineBodies`, a third name-keyed first-wins table. Its two writers share
    one retention (`:535`), so the mint-level check has already run and
    reported before it dedups; it is not part of this report's gap.
  - `src/runtime/query-schema-lowering.ts:105–109` — the annotation lowerer's
    signature carries no diagnostic channel; `:110` calls
    `buildBodyTypeSchemas(schemas, enums)` with two arguments, so the
    body-scope `collisions` are dropped on this path; `:125–131` is the source
    comment recording the gap; `:132–137` builds the sinks; `:141` and `:148`
    thread them into the two lowering arms. No line reads `slugCollisions`.
  - `src/extension/production-theta-producer.ts:2314` (the per-query-turn host
    dispatch) and `:3308` (`#validateInvokeReturn`, the `invoke<T>` return
    boundary) — the two production callers, both after registration.
  - `src/parser/body-type-lowering.ts:670–685` — `collectUnresolvedNamedTypes`,
    the load-time walk over the same annotation text. `:680` / `:682` omit the
    `sinks` argument, so no check runs at load; `:674–676` builds a
    `bodyTypeMap` in which **every** declared name lowers to `{}`, so the
    fragments minted during that walk are not the fragments minted at runtime
    and their slugs are not the runtime slugs.
  - `src/binder/binder-envelope.ts:78–80`, `:125`, `:144`, `:155` — the
    `params:` document's root `$defs` — the table `hoistNestedDefs` produced —
    is hoisted verbatim to the binder envelope document root;
    `src/binder/binder-inference.ts:188–194`, `:219` — the inliner resolves
    each `#/$defs/<name>` against that same table.
  - `src/extension/production-composition.ts:1894–1900` (`hasLoadParseError`)
    and `:1941` — a theta producing no error-severity `theta/load/*` or
    `theta/parse/*` diagnostic registers. Every fixture below produces none.
  - Spec: `docs/spec_topics/schema-subset.md:73` (step 2 — the hoist and the
    byte-equality condition on a slug match), `:112` (§Schema-slug collision
    posture), `:114` (the `__inline_<slug>` `$defs` dedup listed as **a
    load-time site** whose collision raises `theta/load/schema-slug-collision`);
    `docs/spec_topics/diagnostics/code-registry-load.md:58` (the row, whose
    disposition is "The file is not registered").
- **Observed at:** `0.49.0` (`52e257bc`). Offline, deterministic, no live
  model: scratch vitest driving `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts`, `lowerQueryResponseSchema` at its production
  seam, the production `AjvSchemaValidator`, and `buildBinderEnvelopeSchema`;
  written, run, deleted.

## Summary

Before 0039's fix, one position minted `__inline_<slug>` entries and one
retention table covered it. At HEAD every type position mints (grammar.md
`:109`, 0039 §Fix part B), across three lowering scopes, and each scope has its
own retention:

| Scope | Positions | Retention | Report path |
|---|---|---|---|
| `parseParams` | `params:` field RHS | `params.ts:143–145` | `theta/load/schema-slug-collision` at the field's range |
| `buildBodyTypeSchemas` | `schema` body field type, alias/union RHS | `body-type-lowering.ts:532–535` | same code at the decl's range, via `collectBodyTypes` |
| `lowerQueryResponseSchema` | `@<T>` annotation root and interior | `query-schema-lowering.ts:132–137` | none |

`hoistInlineObjectType` compares canonical bytes only against the retention it
is handed, so two fragments minted in different scopes are never compared at
the mint. They first meet in a `$defs` table, and both tables that assemble one
— `hoistNestedDefs` for the `params:` document, `pruneDocumentDefs` for the
annotation document — dedup by name, first-wins, comparing nothing. Which entry
survives is decided by queue position: top-level entries are queued before the
entries nested inside them, so a top-level `__inline_<slug>` displaces a
same-named fragment carried in another fragment's closure, in every field order
(§Reproduction M1, M1b).

Separately, the annotation scope's own check has no consumer. The sink is a
call-local array, `lowerQueryResponseSchema` returns only a schema, and both of
its callers run after the load gate. A byte-mismatch there is retained silently,
and the same input at the `params:` or `schema`-body position refuses the file.

The spec states the `$defs` dedup as one thing and the implementation now does
it in two places under two timings: `schema-subset.md:114` lists the
`__inline_<slug>` `$defs` dedup among the three slug-keyed sites as "a
load-time site whose collision raises `theta/load/schema-slug-collision`", and
`code-registry-load.md:58`'s disposition is "The file is not registered" — a
disposition that does not exist after registration.

## Reproduction

Offline at HEAD `52e257bc`. The lowered fragment of the inline object
`{a: integer}` is

```
{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],"additionalProperties":false}
```

whose canonical form (§Canonical schema hash step 2) and slug (step 4) are

```
{"additionalProperties":false,"properties":{"a":{"type":"integer"}},"required":["a"],"type":"object"}
df817b794ef788ce
```

— derived independently with `node:crypto` (SHA-256, first 16 hex, lowercase)
and equal to what the lowering mints below. Write
`N = __inline_df817b794ef788ce`. Every fixture is `mode: prompt`; every one
loads with **zero diagnostics**, so none is dropped by `hasLoadParseError`.

```
@@ M0  CONTROL — one scope mints N, nothing else names it.
   params  p: Person          body  schema Person { pet: {a: integer} }
   $defs   :: {"Person":{…"pet":{"$ref":"#/$defs/N"}…},
               "N":{"type":"object","properties":{"a":{"type":"integer"}},
                    "required":["a"],"additionalProperties":false}}
   AJV     :: {p:{pet:7}} REJECTED    {p:{pet:{a:1}}} accepted

@@ M6  TWO SCOPES MINT N; no author name involved.
   params  p: Person   q: {a: integer}
   body    schema Person { pet: {a: integer} }
   $defs   :: one N entry, the full fragment; properties.q and Person.pet
              both $ref it. Same in the reverse field order (M6b).

@@ M1  THE MERGE DECIDES A BYTE-DIFFERING CLASH, silently.
   params  n: N   p: Person
   body    import { N } from "./lib.thetalib"
           schema Person { pet: {a: integer} }
   diags   :: []
   $defs   :: {"N":{}, "Person":{…"pet":{"$ref":"#/$defs/N"}…}}
   AJV     :: {n:1, p:{pet:7}} ACCEPTED   {n:1, p:{pet:{a:"no"}}} ACCEPTED
@@ M1b same with the `p: Person` field FIRST — $defs identical up to key
   order, N still {}, same AJV verdicts.
@@ M1c same as M1 plus a params field `q: {a: integer}` that mints N itself:
   $defs.N is still {}, and all three of n, q and Person.pet $ref it.

@@ M5  BINDER ENVELOPE over the same two params documents
   M0 → envelope $defs.N = the full fragment
   M1 → envelope $defs.N = {}

@@ M2  ANNOTATION DOCUMENT — the annotation scope and the body scope both
   mint N and meet at `pruneDocumentDefs`.
   decls   schema Person { pet: {a: integer} }
   @<{x: {a: integer}, y: Person}>
     :: properties.x = properties(Person).pet = {"$ref":"#/$defs/N"},
        $defs holds ONE N entry (the annotation scope's; byte-equal here)
@@ M2b @<{y: Person}>          :: N present, minted by the body scope alone
@@ M2c @<{x: {a: integer}}>    :: N present, minted by the annotation scope alone

@@ M3  THE AUTHOR-NAME CLASS DOES NOT REACH THE ANNOTATION $defs.
   @<{n: N, y: Person}> :: properties.n = {} (permissive), NOT a $ref;
   $defs.N is the body scope's fragment, unaliased.

@@ M4  CONTROL — two decls minting N byte-identically are the dedup case.
   body    schema Person { pet: {a: integer} }
           schema Other  { paw: {a: integer} }
   diags   :: []
```

Reading the table:

- **M0 and M6 bound the mechanism.** The body scope's mint reaches the
  `params:` document only through `hoistNestedDefs`, and when two scopes mint
  the same name the merge keeps one entry. Both scopes produce byte-identical
  fragments here, so the merge's outcome is correct — and the merge established
  none of that.
- **M1, M1b and M1c are the defect at that merge.** The top-level entry wins in
  both field orders, so `Person.pet` — a shape declared in the `schema` body,
  which the `params:` block never mentions — stops constraining the argument,
  with no diagnostic. M1c adds that the `params:` block minting the same slug
  itself does not change the outcome.
- **M5 carries it to the binder.** The degraded table is hoisted verbatim to
  the envelope document root, so the shape the binder is shown for the nested
  field is `{}` as well.
- **M2 is the second merge, reached from two scopes in one call.** The
  annotation-scope fragment and the body-scope fragment arrive under one name;
  M2b and M2c isolate each scope minting it alone.
- **M3 fixes the boundary with 0040.** At the annotation position an
  `__inline_<16hex>` name lowers permissively and never occupies a `$defs`
  key: `buildBodyTypeSchemas` seeds `bodies` from the file's own `schema` /
  `enum` decls only, which the casing rule closes (0040 fixture E), and
  imported symbols are not in that map. 0040's aliasing class is confined to
  the `params:` position; the annotation position's exposure is element 2.
- **M4 shows the load-time channel does not false-fire.** Two decls whose
  inline shapes lower alike are the silent dedup step 2 mandates.

**A byte-differing clash at the annotation position is not constructible from
source at HEAD.** The slug is content-addressed, so two same-slug fragments
differ in bytes only through a 64-bit SHA-256 truncation collision or through
an entry no mint wrote. The second route needs an author-controlled name in the
`$defs` table, and M3 shows the annotation position admits none. Element 2 is
therefore pinned at code level (the sink has no reader; the callers are
runtime; the load-time walk threads no sinks) plus the mint-level mechanism,
which is already pinned in the default suite:
`tests/inline-object-nested-lowering.test.ts:1592–1617` (g3) asserts that a
slug hit whose retained bytes differ appends the slug and keeps first-wins, and
`:1678–1697` (g5) asserts the registry Message the two positions that **can**
report render.

## Expected behaviour

Fixed by the corpus for element 1, open for element 2.

**Element 1.** schema-subset.md `:112` scopes the obligation to "any slug-keyed
cache or dedup table that uses a slug as a stand-in for fragment identity",
requires the byte comparison "on a slug match *before* treating the two as the
same fragment", and names the outcome it exists to prevent — "rather than
silently aliasing two distinct fragments". Both merges are such tables: the key
is the synthesised name whose payload is the slug, and the walk treats two
entries under that key as the same fragment. `:73` states the same rule for
this specific key: two inline schemas resolve to one `$defs` entry "only when
their lowered JSON Schema fragments are byte-identical", and a slug match whose
fragments are not byte-identical "raises the load-time error
`theta/load/schema-slug-collision` instead of silently merging the two
schemas". M1 merges two fragments that are not byte-identical and raises
nothing.

**Element 2.** Undefined. `:114` classifies the `__inline_<slug>` `$defs` dedup
as a load-time site, and the registered code's disposition
(`code-registry-load.md:58`) is that the file is not registered. Post-0039 the
dedup also runs after registration, on a document the load pass never lowered.
Three dispositions are open, and the evidence does not select between them:
the annotation's fragments are lowered at load and checked there; a runtime
code is registered for the runtime instance, as `:115` and `:116` already do
for the validator and registration caches; or `:114` is amended to state that
the `$defs` dedup has a runtime instance and what it does there.

What is not open for either element: the current behaviour matches none of
these. It aliases two distinct fragments under one key with no report at the
`params:` document, and it runs the mandated check at the annotation document
into an array nothing reads.

## Actual behaviour / root cause

Three mechanisms compose.

1. **The check is scope-local by construction.**
   `hoistInlineObjectType` (`params.ts:502–589`) decides "already minted" from
   `lowerCtx.defs` and `lowerCtx.inlineFragments` (`:556`) and compares bytes
   against `lowerCtx.inlineCanonical` (`:545`, `:557`). Both maps arrive from
   the caller. 0039's fix extended the retention across the decls of one
   `buildBodyTypeSchemas` pass, which is what makes the `schema`-body position
   report; it did not extend anything across the three callers, and there is no
   table that spans them. A slug minted by `parseParams` and again by
   `buildBodyTypeSchemas` is compared nowhere.

2. **The merges dedup on the name alone.** `hoistNestedDefs` (`params.ts:281`)
   and `pruneDocumentDefs` (`query-schema-lowering.ts:235`) both skip an
   already-hoisted name. Neither has the canonical bytes: the retention tables
   are local to the lowering calls that ended before the merge starts, and the
   merges receive fragments only. The surviving entry is the one dequeued
   first, and the queue is seeded with the document's top-level `$defs` before
   any nested entry is appended (`params.ts:278`, `:289`;
   `query-schema-lowering.ts:232`, `:243`) — so the winner is "top-level over
   nested", which no spec text states and no test asserts as a rule.

3. **The scope that mints last has no diagnostic channel.**
   `lowerQueryResponseSchema` is called from the query-turn dispatch
   (`production-theta-producer.ts:2314`) and the `invoke<T>` return boundary
   (`:3308`), both after `hasLoadParseError` has already admitted the file
   (`production-composition.ts:1894–1900`, `:1941`). Its sinks are built per
   call (`query-schema-lowering.ts:132–137`) and discarded with the call frame;
   `:125–131` records this in the source. The load pass does traverse the same
   annotation text — `collectUnresolvedNamedTypes`
   (`body-type-lowering.ts:670–685`) — but passes no sinks (`:680`, `:682`),
   and could not check the runtime fragments if it did: it lowers against a
   `bodyTypeMap` in which every declared name is `{}` (`:674–676`), so its
   fragments and their slugs differ from the runtime ones whenever an
   annotation names a `schema`.

The consequence in M1 is a loss of validation rather than a swap of shapes
because the surviving fragment is the permissive `{}` that `collectBodyTypes`
assigns every imported symbol. A future clash between two concrete fragments
would validate against the wrong shape instead — the merges cannot tell the two
cases apart, since they inspect neither fragment.

## Why it matters

- **The `params:` merge decides a boundary that takes untrusted input.** The
  lowered `params:` document is what AJV compiles for slash-argument binding,
  `invoke(...)` and tool-call arguments. In M1 the argument `p` accepts
  `{pet: 7}` and `{pet: {a: "no"}}`, against a `schema` declaration that is
  itself well-formed and not the fixture's colliding name.
- **The degradation lands on a declaration that did not participate.** 0040's
  fixtures lose the shape of the `params:` field that carries the colliding
  name. Here the entry that loses its shape is `Person.pet`, minted from a
  `schema` body two scopes away from the name that displaced it, so the source
  of the loss is not adjacent to the loss.
- **It reaches the binder's view of the parameter.** `buildBinderEnvelopeSchema`
  hoists the same `$defs` table to the envelope root and
  `inlineDefsRefs` resolves the field's `$ref` against it (M5), so the model is
  shown the same `{}` the envelope stops enforcing.
- **The annotation position is the one that validates model output.** QRY-22
  (`query-failure-and-repair.md:78`) validates a typed query's response against
  the lowered annotation, and the respond tool's wire schema (`:42`) shows the
  model the same fragment. A retained mismatch there
  changes what is enforced and what is shown, and produces no record at any
  severity.
- **Two of the three scopes report and one does not, for one code.** DIAG-4
  holds the message identical across `parseParams` and `collectBodyTypes`; the
  third site cannot raise it at all. The same authored shape therefore refuses
  a file at one position and passes silently at another.

## Non-goals

- **The namespace reservation question.** Whether an author name may be spelled
  `__inline_<16hex>`, and what the two `params:`-position writers must do when
  one is, is [0040](./0040-inline-slug-def-namespace-not-reserved.md). This
  report does not propose a reservation rule and does not depend on one; M1
  borrows 0040's input only because it is the only byte-differing input that
  exists at HEAD.
- **The genuine 64-bit collision.** Two anonymous inline schemas whose
  fragments differ under one slug is the registered
  `theta/load/schema-slug-collision` path, wired at the two reporting positions
  and pinned by `tests/params-inline-object-lowering.test.ts` and
  `tests/inline-object-nested-lowering.test.ts` group (g).
- **The other two slug-keyed sites of `:112`** — the AJV compiled-validator
  cache (`theta/runtime/validator-cache-collision`, `:115`) and the
  `pi.registerTool` registration cache
  (`theta/runtime/registration-cache-collision`, `:116`) — are runtime sites
  with their own codes and their own retention, and are untouched here.
- **`inlineBodies`** (`body-type-lowering.ts:540`) is a third name-keyed
  first-wins table, but its two writers share one retention, so the mint-level
  check runs and reports before it dedups.
- **The remaining 0039 residuals** are out of scope here and filed separately
  where filed at all: (i) the author-written duplicate field name is
  [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md), (ii)
  `lowerQueryResponseSchema`'s root brace dispatch is
  [0053](./0053-annotation-root-brace-union-read-as-one-field-list.md), (vii)
  the literal-union arm's bare `enum` is
  [0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md); (v),
  (vi) and (viii) are unfiled. None of them changes which `$defs` key a
  fragment occupies; 0053 moves the annotation root's dispatch for a
  brace-rooted union, a shape no fixture here uses.

## Fix

Not yet decided. The two elements have different closure conditions and are
stated separately; both must hold for the family to be closed.

**Element 1 — the merges.** Two properties are forced by `:112` and are
independent of which disposition element 2 takes:

- *A slug match at a merge is settled by a byte comparison, not by key
  presence.* `:112` also requires the comparison to be against retained bytes
  "alongside the keyed artefact", not a re-serialisation at the merge, so the
  canonical bytes have to reach the merge. The two shapes available are a
  retention that spans the mint scopes feeding one document, or a per-fragment
  record travelling with the fragment. Neither is reachable without a new
  parameter: at the `params:` document the body-scope retention exists inside
  `collectBodyTypes` (`theta-document.ts:1202–1203`) and is discarded there,
  while `parseParams` is handed the lowered fragments alone
  (`frontmatter.ts:697`); at the annotation document `buildBodyTypeSchemas`
  builds its retention inside the call `lowerQueryResponseSchema` makes
  (`query-schema-lowering.ts:110`) and returns only the map.
- *A mismatch at the `params:` merge is reportable today and must be reported.*
  `hoistNestedDefs` runs inside `parseParams` (`params.ts:241`), which already
  emits the registered code with a field range (`:183–191`), so element 1 at
  that position needs no registry change: same code, same message (DIAG-4),
  same "file is not registered" disposition. At the annotation merge the report
  depends on element 2.

**Element 2 — the annotation position's channel.** Three dispositions, all
requiring a decision this report does not make:

1. *Lower the annotation at load and check there.* The load pass would have to
   lower the annotation against the real body-type map, not the name-set map
   `collectUnresolvedNamedTypes` uses (`body-type-lowering.ts:674–676`) —
   otherwise the fragments it checks are not the fragments the runtime mints.
   That is a new load-time lowering of every annotation, and it must produce
   byte-identical fragments to the runtime call or the two disagree about which
   entry won. No registry change: `theta/load/schema-slug-collision` already
   covers a load-time mismatch and the file is not registered.
2. *Register a runtime code for the runtime instance.* A registry addition is a
   DIAG-2 operation (`diagnostic-shape.md:72`), covered within a 1.x minor by
   the GOV-15 diagnostic-registry carve-out
   (`source-language-stability.md:25`) for inputs whose only change is the
   appearance of the code. `:112`'s existing runtime pair (`:115`, `:116`) is
   the precedent for the shape, and `:114` would state the runtime instance
   alongside the load-time one. The disposition at runtime cannot be "the file
   is not registered"; it has to be stated (the query fails, or first-wins is
   specified and the code is a warning).
3. *Amend `:114` to state that the `$defs` dedup has a runtime instance whose
   mismatch is retained first-wins without a report.* This is the current
   behaviour made normative. It requires stating why the byte check runs at all
   at that position, and it makes the same authored shape refuse a file at the
   `params:` position and load at the annotation position by design.

**Constraints on any resolution.**

1. **The `params:` position's lowered bytes do not move.** They are frozen by
   0035's 37-test lock (`tests/params-inline-object-lowering.test.ts`) and by
   0039's own byte-share obligation; a merge-time check must change which
   fragment survives a *mismatch* only, never the single-entry output of the
   byte-equal dedup (M0's and M6's lowered documents stay byte-identical, M4
   stays diagnostic-free).
2. **First-wins is the retained posture at the mint, and the merges must
   agree with it.** `hoistInlineObjectType` returns the retained fragment and
   never displaces it (`params.ts:574–583`), and `inlineBodies`
   (`body-type-lowering.ts:552–553`) matches. A merge given a disambiguation
   rule states which entry survives; "top-level over nested" is what both
   merges do today (M1, M1b), and neither the spec nor a test states it.
3. **DIAG-4 holds the message literal.** `schema-slug collision on slug
   <slug>: two distinct inline schemas hash alike` is emitted from two sites
   today (`params.ts:189`, `theta-document.ts:1220`) and asserted against the
   registry by `tests/inline-object-nested-lowering.test.ts:1678–1697`. Any new
   emission site renders the same template; any new code carries its own.
4. **Ordering against [0040](./0040-inline-slug-def-namespace-not-reserved.md).**
   Both reports move `src/parser/params.ts` and both concern occupancy of an
   `__inline_<slug>` key. Whichever lands second re-derives its §Reproduction
   and §Fix against the first. If 0040 lands first and reserves the name at
   every introducing position, M1 stops being constructible and element 1's
   remaining input class is the 64-bit collision — the merges still need the
   check, and M0/M6/M2/M4 remain its acceptance set. If 0054 lands first, 0040
   re-derives fixtures B/C/D against a merge that compares bytes.

**Acceptance set.** M0, M6 and M2/M2b/M2c stay byte-identical and M4 stays
diagnostic-free — they are the dedup case, not the collision case. M1, M1b and
M1c converge on one disposition that a rule names, and M5 follows M1. M3 stays
as it is unless 0040's fix moves it.

## Provenance

- Origin: the 0.49.0 fix for
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md),
  residuals 3 and 4 of the uncommitted local run artefact
  `.pi/tmp/fixes/0039-report.md` (*Residuals / notes*: "The annotation
  position's mint has no load-time diagnostic channel" and "Two name-keyed
  first-wins merges with no byte comparison now see `__inline_` names arriving
  from two independent mint scopes"), recorded in the doc as §Fix (0.49.0)
  *Residuals* (iii) (`:269–271`) and (iv) (`:271–275`). Filed together as one
  family at 0.49.0, with the merge outcome and the binder consequence measured
  rather than inferred.
- Spec: `docs/spec_topics/schema-subset.md:73` (Lowering Algorithm step 2 — the
  `__inline_<slug>` hoist, the byte-identity condition, and the load-time error
  on a non-identical slug match), `:76` (step 3, the `$ref` emission), `:92`
  (§Canonical schema hash — the recipe the oracle re-derives), `:108`
  (§Synthesised names), `:112` (§Schema-slug collision posture — the
  byte-equality-before-identity requirement, the retained-bytes requirement,
  and "rather than silently aliasing two distinct fragments"), `:114`–`:116`
  (the three slug-keyed sites and their codes, the `$defs` dedup listed as a
  load-time site); `docs/spec_topics/grammar.md:109` (§Inline object types —
  `ObjectType` in any `Type` position, which is what makes every type position
  a minting position); `docs/spec_topics/diagnostics/code-registry-load.md:58`
  (`theta/load/schema-slug-collision`, its trigger and its "file is not
  registered" disposition);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, the registry
  is closed); `docs/spec_topics/governance/source-language-stability.md:25`
  (the GOV-15 diagnostic-registry carve-out).
- Implementation evidence at HEAD `52e257bc`: `src/parser/params.ts:143–145`
  (the block-scoped retention), `:161–163` and `:183–191` (the `params:`
  report path), `:241` and `:274–295` (`hoistNestedDefs` and its call),
  `:502–589` (`hoistInlineObjectType` — the retention reads, the already-minted
  disjunct, the single `slugCollisions` write, the re-registration, the mint);
  `src/parser/body-type-lowering.ts:532–535` (the document-scoped retention),
  `:540`/`:552–553`/`:570–571`/`:611` (`inlineBodies`), `:595` (the per-decl
  attribution), `:670–685` (`collectUnresolvedNamedTypes`, the sink-free
  load-time walk over the same annotation text);
  `src/parser/theta-document.ts:1202–1203`, `:1219–1228` (`collectBodyTypes`'s
  report path); `src/runtime/query-schema-lowering.ts:105–109` (the signature),
  `:110` (the two-argument `buildBodyTypeSchemas` call), `:125–137` (the
  recorded gap and the per-call sinks), `:141`/`:148` (the threading),
  `:218–248` (`pruneDocumentDefs` and its HOIST walk);
  `src/extension/production-theta-producer.ts:2314`, `:3308` (the two runtime
  callers); `src/extension/production-composition.ts:1894–1900`, `:1941` (the
  registration gate); `src/binder/binder-envelope.ts:78–80`, `:125`, `:144`,
  `:155` and `src/binder/binder-inference.ts:188–194`, `:219` (the envelope
  hoist and the ref inliner).
- Tests already pinning the adjacent behaviour:
  `tests/inline-object-nested-lowering.test.ts:1535–1567` (g1),
  `:1568–1591` (g2), `:1592–1617` (g3 — the cross-scope byte check and its
  report at the mint), `:1618–1677` (g4 — the `buildBodyTypeSchemas` sink and
  the byte-equal dedup case), `:1678–1697` (g5 — the DIAG-4 message),
  `:1698–1738` (g6 — two decls sharing one inline shape). None of them reaches
  either merge or the annotation position's sink.
- Reproduction: scratch vitest at HEAD — the fixtures quoted above (the
  single-scope control, the two-scope mint, the three merge fixtures and their
  AJV verdicts, the binder envelope pair, the three annotation-document
  fixtures, the annotation-position author-name fixture, and the byte-identical
  two-decl control), plus an independent `node:crypto` derivation of the slug
  from the canonical form; run on those signatures, then deleted per scratch
  policy.
