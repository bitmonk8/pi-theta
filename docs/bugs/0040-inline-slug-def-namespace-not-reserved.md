# Bug 0040 — Nothing reserves the synthesised `__inline_<slug>` `$defs` name against author names: an imported binding named `__inline_<16hex>` that equals a minted inline-object slug replaces or aliases the hoisted fragment in both field orders, so the declared `params:` shape stops constraining the argument and no diagnostic fires

- **Status:** fixed (0.50.0)
- **Kind:** spec gap with a reachable implementation consequence. Two
  elements on one namespace.
  1. *No spec rule reserves the synthesised-name forms against author
     names.* schema-subset.md §Synthesised names (`:108`) is "the source of
     truth for the full set" of slug-bearing names, including
     `__inline_<slug>` for hoisted inline object schemas, and step 2 of the
     Lowering Algorithm (`:73`) hoists into `$defs` under that name. The
     `$defs` namespace also holds author-declared names — step 3 (`:76`)
     emits `{"$ref": "#/$defs/<Name>"}` for a "named or inline schema
     reference" alike — and no text in schema-subset.md, lexical.md,
     grammar.md, or schemas.md says an author name may not be one of the
     synthesised forms, or what happens when it is. The casing rule
     (lexical.md `:15`, enforced) closes the `schema` and `enum` name
     positions as a side effect: `__inline_…` starts with `_`, so
     `schema __inline_<16hex> { … }` is `theta/parse/schema-case-mismatch`
     and the file does not register. It closes nothing at the one remaining
     name-introducing position the `params:` type universe reads — an
     `import` specifier's local binding, whose name is checked for
     collisions only.
  2. *The two arms that meet an occupied `__inline_` key alias silently.*
     `lowerParamsFieldType`'s retention arm (`src/parser/params.ts:513–522`)
     retains an occupied entry that carries no retained canonical bytes and
     returns the `$ref` regardless — `inlineCanonical` records bytes only for
     entries this function minted, so the byte-equality check
     schema-subset.md §Schema-slug collision posture (`:112`) mandates has
     nothing to compare and does not fire. `lowerTypeExpr`'s `IDENTIFIER`
     arm (`:399–407`) writes `lowerCtx.defs[s] = resolved` with no occupancy
     or byte check, so it overwrites a minted fragment an earlier field's
     `$ref` already names. Neither arm is the trigger of
     `theta/load/schema-slug-collision`, whose registry row
     (`docs/spec_topics/diagnostics/code-registry-load.md:58`) reads: "Two
     anonymous inline object schemas in one theta file's lowering pass
     produced the same schema slug … but lower to non-byte-identical JSON
     Schema fragments". Both schemas in that row are anonymous; here one is
     an author name.
- **Related:**
  [0035](./0035-params-rhs-inline-object-under-emission.md) — filed from its
  §Fix (0.44.0) Residuals (ii), which is the fix that made
  `__inline_<slug>` reachable from `params:` at all and installed both arms.
  That residual states the input class as "an author-declared schema
  literally named `__inline_<16hex>`", and the retention-arm comment states
  the same. Both are wrong at HEAD: the `schema`-declaration spelling is
  refused by the casing rule (fixture E below). The reachable spelling is an
  imported binding. Bug
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  — the filed report for 0035 §Fix (0.44.0) Residuals (i), the sibling
  positions' interior split. Disjoint mechanism: the `@<T>` annotation root
  lowers its inline object as the document root and mints no `__inline_`
  name (`src/runtime/query-schema-lowering.ts:109–114`), so 0039 is about a
  fragment's contents and this report is about key ownership in `$defs` at
  the `params:` position. 0035 §Fix (0.44.0) Residuals (iii) (a
  block-mapping `params:` RHS) is unfiled and unaffected.
- **Affected** (citations verified at HEAD `f959f8de`, 0.45.0):
  - `src/parser/params.ts:501–522` — the mint path's occupied-key branch.
    `:501` tests `lowerCtx.defs[defName] !== undefined`; `:502` reads the
    retained bytes; `:503–511` raise only when bytes are present **and**
    differ; `:513–521` is the retention comment, which names this input
    class and its disposition: "An entry carrying no retained bytes has
    nothing to compare and is retained too — the reachable input class there
    is an author-declared schema whose name is literally `__inline_<16hex>`
    and matches a minted slug: a namespace clash outside the registry row's
    anonymous-inline trigger, retained silently pending a spec decision on
    reserving the prefix." `:522` returns the `$ref` into the author's
    fragment.
  - `src/parser/params.ts:399–407` — `lowerTypeExpr`'s `IDENTIFIER` arm:
    `:406` is the unconditional `lowerCtx.defs[s] = resolved`. The
    identifier shape it admits is `/^[A-Za-z_][A-Za-z0-9_]*$/` (`:329`), so
    a leading-underscore name is an ordinary `NamedType` atom here.
  - `src/parser/params.ts:135–151` — `parseParams` shares one `defs` object,
    one `inlineCanonical` map, and one `slugCollisions` sink across every
    field of the block (`:135–141`), and calls `lowerParamsFieldType` per
    field in declaration order (`:151`). Sharing `defs` is what puts an
    author-resolved name and a minted slug in one table; declaration order
    is what selects which of the two arms above runs.
  - `src/parser/theta-document.ts:1130–1174` — `collectBodyTypes` builds the
    `params:` type universe. `schema` and `enum` declaration names come from
    the body (`:1138–1144`), and **every** imported symbol is added as a
    resolved named type lowering to `{}` (`:1169–1173`); `:1151–1162`
    records that permissive mapping. The map is keyed by the local binding,
    which `ImportDecl.symbols` carries — the `as` alias where present, else
    the source name (`:623–627`).
  - `src/lexer/lexer.ts:802–840`, `:873` — the first-letter case pass.
    `checkName(k + 1, "type")` runs for `schema` and `enum` heads only
    (`:873`); `fn` and `let` heads take the `"binding"` arm, which accepts a
    leading `_`. No arm covers an `import` specifier.
  - `src/parser/imports.ts:297–304`, `:326–385` — the import static checks.
    `ImportSpecifier` carries `source` and `local` (`:302`);
    `checkImportUnknownSymbols` (`:326`) validates the **source** symbol
    against the resolved `.thetalib`'s exports, and
    `checkImportNameCollisions` (`:359`) tests the **local** name for
    duplication against other imports and same-file top-level declarations.
    Nothing constrains the local name's shape.
  - `src/extension/production-composition.ts:1894–1901` (`hasLoadParseError`)
    and `:1941` — a theta whose parse produces any error-severity
    `theta/parse/*` or `theta/load/*` diagnostic takes the dropped arm
    (`:1969`) and does not register. This is what confines the
    `schema`-declaration spelling to a refused file, and what makes the
    import spelling — which produces no diagnostic at all — register.
  - `src/runtime/query-schema-lowering.ts:51–55`, `:109–114` — the scope
    bound. The typed-query annotation arm lowers an inline object type to
    the fragment as the document **root**, minting no `__inline_` name, and
    the comment records that the `params:` field root is the one hoisting
    position. `src/parser/params.ts:306–308` states the same from the other
    side ("only the `params:` field position mints `__inline_` entries"), so
    the collision surface is exactly the `params:` block.
- **Observed at:** `0.45.0` (`f959f8de`). Offline, deterministic, no live
  model: scratch vitest driving `parseThetaDocument` (the real load path via
  `tests/helpers/e2e-s1.ts`), the real `AjvSchemaValidator` over the lowered
  document, `lowerParamsFieldType` at the unit seam, and
  `discoverAndComposeFixtures` (the shipped composition root) over a planted
  temp workspace; written, run, deleted.

## Summary

A `params:` field whose right-hand side is an inline object type hoists into
`$defs` under `__inline_<slug>` (0035's fix). Author names live in the same
`$defs` table. When an author name equals a minted `__inline_<slug>`, the
lowering pass produces one `$defs` entry for two distinct declarations and no
diagnostic, in both field orders:

- **Inline field first** — the inline object mints its fragment, then
  `lowerTypeExpr`'s `IDENTIFIER` arm overwrites `defs[name]` with the
  author-resolved fragment. The `$ref` the inline field already returned now
  points at the author's fragment.
- **Named field first** — the author-resolved fragment occupies the key with
  no retained canonical bytes, so the mint's byte-equality check has nothing
  to compare, the entry is retained, and the inline field's `$ref` resolves
  to the author's fragment.

For an imported name — the reachable spelling — the author-resolved fragment
is the permissive `{}` that `collectBodyTypes` assigns every imported symbol.
The declared inline shape is therefore absent from the document AJV compiles,
and the param accepts any JSON value, while the field's recorded declared
type (`BypassParamsField.type`) still carries the author's bytes
`{q: boolean}`. That is the accept-anything hole 0035 closed, re-opened for
this input class.

The name must match exactly: 16 lowercase hex characters after `__inline_`.
The slug is computable from the declared fragment by the published recipe
(schema-subset.md §Canonical schema hash), so the input is constructible
without search; agreement by accident requires an author to type one specific
16-hex string.

## Reproduction

Offline at HEAD `f959f8de`. The lowered fragment of `{q: boolean}` is

```
{"type":"object","properties":{"q":{"type":"boolean"}},"required":["q"],"additionalProperties":false}
```

whose canonical form (§Canonical schema hash step 2) and slug (step 4) are

```
{"additionalProperties":false,"properties":{"q":{"type":"boolean"}},"required":["q"],"type":"object"}
e39f064476c952aa
```

— derived independently with `node:crypto` (SHA-256, first 16 hex, lowercase)
and byte-identical to what `schemaSlug` mints for the field. Write
`D = __inline_e39f064476c952aa`. Every fixture is `mode: prompt` plus the
`params:` entries shown; fixtures A–D import from a sibling
`lib.thetalib` holding `fn __inline_e39f064476c952aa() { return 1 }` and
`schema Zed { zzz: string }`.

```
@@ A  CONTROL — no colliding name.   params  p: {q: boolean}
   diags   :: []
   lowered :: {"type":"object","properties":{"p":{"$ref":"#/$defs/D"}},
               "required":["p"],"additionalProperties":false,
               "$defs":{"D":{"type":"object","properties":{"q":{"type":"boolean"}},
                             "required":["q"],"additionalProperties":false}}}
   AJV     :: {p: 7} REJECTED   {p:{q:true}} accepted   {p:{q:"yes"}} REJECTED
@@ B  inline field first.  params  p: {q: boolean}   n: D
      body    import { D } from "./lib.thetalib"
   diags   :: []
   lowered :: properties.p = properties.n = {"$ref":"#/$defs/D"}
               $defs :: {"D":{}}
   fields  :: p type "{q: boolean}" | n type "__inline_e39f064476c952aa"
   AJV     :: {p: 7, n: 1} ACCEPTED   {p:{q:"yes"}, n:1} ACCEPTED
@@ C  named field first.   params  n: D   p: {q: boolean}
      body    import { D } from "./lib.thetalib"
   diags   :: []
   lowered :: byte-identical to B up to property order; $defs :: {"D":{}}
   AJV     :: {p: 7, n: 1} ACCEPTED
@@ D  `as`-aliased spelling.  params  n: D   p: {q: boolean}
      body    import { Zed as D } from "./lib.thetalib"
   diags   :: []
   lowered :: $defs :: {"D":{}}   (same end state as B and C)
@@ E  schema-declaration spelling.  params  n: D   p: {q: boolean}
      body    schema D { zzz: string }
   diags   :: ["error theta/parse/schema-case-mismatch:
                schema name must start with an uppercase letter"]
   → not registered (hasLoadParseError). The alias still forms in the
     refused document: $defs.D is the author's `{zzz: string}` fragment and
     both properties point at it.
@@ F  registration, shipped composition root over a planted workspace
      (.pi/theta/{collidefn,collidealias,control}.theta + lib.thetalib,
       bind_model pinned to a stub registry entry)
   registered    :: ["collidealias","collidefn","control"]
   notifications :: []
@@ G  unit seam, `lowerParamsFieldType` with `defs[D]` pre-occupied by
      {zzz: string} and no `inlineCanonical` entry
   returns {"$ref":"#/$defs/D"}; defs[D] unchanged; slugCollisions []
@@ H  unit seam, mint then `lowerParamsFieldType("D", ctx)` with D in
      bodyTypeMap as {zzz: string}
   defs[D] = {zzz: string} (the mint overwritten); slugCollisions []
```

Reading the table:

- **A bounds the defect.** The identical inline declaration constrains the
  argument when no name collides: `{p: 7}` is rejected.
- **B and C are the defect, one per field order.** Both load clean, both
  collapse two declarations into one `$defs` entry, and in both the entry is
  the imported `{}`. `p` accepts a number, an object of the wrong field type,
  and any other JSON value.
- **D shows the collision does not depend on the imported symbol's kind.**
  The direct spelling (B, C) imports a `fn` name, legal per lexical.md `:16`
  in the binding class; the aliased spelling renames a `schema`, and the
  alias is what lexical.md `:15` would forbid if the casing rule were
  enforced at the import local-binding position. Whichever reading of the
  casing rule applies, one of the two spellings is legal input, and both
  produce the same lowered document.
- **E is the spelling the 0035 residual and the retention-arm comment name,
  and it is refused** — the casing rule fires before the namespace question
  arises, so the file does not register.
- **F is reachability.** Both colliding thetas register through the shipped
  load path with no error notification.
- **G and H isolate the two arms** at the unit seam: neither appends to
  `slugCollisions`, so no `theta/load/schema-slug-collision` is available to
  the caller in either order.

## Expected behaviour

Undefined by the spec. The two candidate outcomes are:

- The declaration is refused. Nothing in the corpus authorises an author name
  in a synthesised-name form, and schema-subset.md `:112` states the posture
  for the table this key belongs to — a site "surfaces a diagnostic and
  disambiguates … rather than silently aliasing two distinct fragments" —
  which is the behaviour a reservation rule would deliver at the declaring
  position.
- The namespace is shared and the aliasing is specified. Then step 2's
  `__inline_<slug>` key is not exclusively synthesised, and the corpus must
  say which fragment survives, what the surviving `$ref`s mean, and why a
  slug-keyed table may hold an entry without the retained canonical bytes
  `:112` requires "alongside the keyed artefact".

What is not open: the current behaviour matches neither. It aliases two
distinct fragments silently, which `:112` names as the outcome its byte-check
exists to prevent, and it drops the shape of a declaration the author wrote,
which no lowering rule permits — schema-subset.md `:73`/`:76` define one
`$defs` entry per distinct lowered fragment and a `$ref` per reference.

## Actual behaviour / root cause

`$defs` is one flat table with two writers and no key ownership.

1. **The author-name writer has no occupancy check.**
   `lowerTypeExpr`'s `IDENTIFIER` arm (`params.ts:399–407`) resolves a
   `NamedType` against `bodyTypeMap` and assigns `defs[s] = resolved`
   unconditionally. It cannot detect that the key is a minted slug, because
   the minting bookkeeping (`inlineCanonical`) is keyed by bare slug and
   written only on the mint path.
2. **The mint writer's byte check is conditional on its own bookkeeping.**
   `lowerParamsFieldType` (`:497–526`) compares canonical bytes only when
   `inlineCanonical` holds an entry for the slug (`:502–503`). An entry
   written by the author-name writer has no such record, so the comparison is
   skipped and the retention arm returns the `$ref` (`:513–522`). The
   registered collision code is unreachable for this input class in either
   order — as its registry row (`code-registry-load.md:58`) says, its trigger
   is two anonymous inline schemas.
3. **The name is reachable because the `params:` type universe admits every
   imported symbol, keyed by local binding.** `collectBodyTypes`
   (`theta-document.ts:1169–1173`) maps every imported symbol to `{}`, and
   the map key is the local binding (`:623–627`). The lexer's case pass
   (`lexer.ts:873`) covers `schema` / `enum` / `fn` / `let` heads only, and
   the import static checks (`imports.ts:326–385`) test the source symbol's
   existence and the local name's uniqueness — not its shape. The casing rule
   therefore refuses the `schema` / `enum` spelling only;
   `import { … as __inline_<16hex> }` and a lib-side `fn __inline_<16hex>`
   both pass.

The imported mapping is what makes the outcome a loss of validation rather
than a swap of shapes: the author-resolved fragment is `{}`, so the surviving
entry constrains nothing. A future collision against a name that lowers to a
concrete fragment would validate the argument against the wrong shape
instead.

## Why it matters

- The `params:` position is where untrusted input arrives (slash-argument
  binding, `invoke(...)`, tool-call arguments), and the surviving `{}` means
  the AJV envelope check accepts anything for that field — the hole 0035
  closed at this boundary, re-opened whenever the name agrees.
- It is silent for source that is correct by the grammar. Fixtures B, C, and
  D produce no diagnostic at any severity and register, so the author's only
  evidence is a param that accepts junk.
- The recorded declared type and the compiled schema disagree:
  `BypassParamsField.type` still carries `{q: boolean}` while the lowered
  fragment for that field is `{}`. 0035 §Affected records the chain by which
  that value reaches the binder system prompt's per-field Parameters line
  (`binderPromptParamField` → `renderBinderParamLine`), so the shape the
  binder is given for the field is the one the envelope stops enforcing.
- It is a spec silence the implementation already defers to: the retention
  arm's comment says the entry is "retained silently pending a spec decision
  on reserving the prefix", so the code is waiting on text that does not
  exist. The silence covers the three sibling synthesised forms at `:108`
  too; they are out of this report's scope for the reason recorded under
  §Non-goals.

## Non-goals

- The other three synthesised-name forms (`__theta_respond_<slug>`,
  `__theta_callee_<slug>__<post-rename-name>`, `__theta_bind_<slug>`,
  schema-subset.md `:108`) name tools, not `$defs` keys. They share the
  namespace question; they are not reachable through this mechanism and are
  not covered by the fixtures here.
- The other two slug-keyed sites of `:112` — the AJV validator cache
  (`theta/runtime/validator-cache-collision`) and the tool-registration cache
  (`theta/runtime/registration-cache-collision`) — are runtime sites with
  their own codes and are untouched.
- The genuine 64-bit collision this report is not about — two anonymous
  inline schemas whose fragments differ — is the registered
  `theta/load/schema-slug-collision` path, wired and pinned by
  `tests/params-inline-object-lowering.test.ts`.
- 0035 §Fix (0.44.0) Residuals (i) is filed as
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md);
  Residual (iii) is unfiled. Neither is in scope here.

## Fix (0.50.0)

**Half A**, on the evidence the report itself supplies. The §Fix left the route
to a spec decision and stated both halves' obligations; Half B is not available
without weakening the very posture this report cites as violated —
schema-subset.md `:112` requires a slug-keyed table to store canonical bytes
"alongside the keyed artefact", an author entry has none, so declaring the
namespace shared would mean amending `:112` rather than satisfying it. Half A
delivers `:112`'s stated outcome ("surfaces a diagnostic and disambiguates …
rather than silently aliasing two distinct fragments") at the declaring
position, which §Expected behaviour names as the first candidate. Three review
rounds and two fixer rounds hardened the guard's position, the prose's input
class and the spelling of the callee form. Line anchors are at the fix commit.

**The reservation rule.** schema-subset.md §Synthesised names (`:108`) now
states that the full set is reserved against author-introduced names, and
lexical.md §Identifiers carries the enforceable rule: an `import` /
`export … from` specifier's local binding — the `as` alias where present, else
the source name — MUST NOT match one of the four forms exactly, `<slug>` being
exactly 16 lowercase hex characters (§Canonical schema hash step 4). The
amended lexical.md sentence no longer claims the casing rule is the *only*
enforced naming constraint; `docs/reference/grammar.md` §Identifiers mirrors
the amendment, `docs/reference/schema-subset.md` the reservation.

**The set is the EXACT forms, not the bare prefix** (the §Fix's second forced
obligation). `__inline_zzz`, uppercase hex, 15- and 17-character hex runs,
`__theta_callee_<slug>` with no `__`-and-tail, and `__theta_callee_<slug>__`
with an empty tail all stay legal: none can equal a slug the recipe mints, so
refusing them would refuse more than the namespace the mint occupies, and the
GOV-15 post-hoc input set would have to name inputs the defect cannot reach.
`src/parser/synthesised-names.ts` is the one construction point for the shape
test, imported by both consumers so they cannot drift; its `[0-9a-f]{16}`
provably matches `schemaSlug`'s `digest("hex").slice(0, 16)`.

**The enforcement point is the parse site, not the load pass** (the §Fix's
first forced obligation — fixture E shows the `schema` / `enum` positions are
already closed by the casing rule, so a rule scoped to them closes nothing).
`BodyParser.parseImportExport` (`src/parser/theta-document.ts`) pushes the
diagnostic onto its own sink beside the existing path-literal check, so
`parseThetaDocument` alone witnesses it, the refusal is total (it fires whether
or not the `.thetalib` resolves), and `export { … }` specifiers are covered by
the same walk. `checkThetaImports` was deliberately NOT the seam: the load pass
sees only specifiers whose lib resolved *and* parsed, which would leave the
refusal partial.

**Key ownership at the second `$defs` writer** (the §Fix's shared
implementation obligation). `lowerTypeExpr`'s `IDENTIFIER` arm no longer
registers a resolved fragment under a reserved-form key: it lowers permissively
and returns no `$ref`, so a mint's fragment cannot be displaced by an
author-resolved one and no `$ref` dangles. The test sits AFTER the
`bodyTypeMap` lookup, deliberately — the reservation exempts no name from
`theta/parse/unresolved-named-type`, so an unbound reserved-form reference
stays refused byte-identically to 0.49.0 at all six `NamedType` positions
(review round 1 caught the reverse ordering, which silently registered six
accept-anything shapes). The arm raises nothing of its own, which is what keeps
fixture E at exactly one diagnostic.

**Registry.** `theta/parse/import-reserved-synthesised-name` (E, parse) is
registered in `code-registry-parse.md` at the end of the Imports cluster and
mirrored in `docs/reference/diagnostics.md` — a DIAG-2 same-commit landing,
covered within a 1.x minor by the GOV-15 diagnostic-registry carve-out. The
*Message* uses only the established category-5 `<name>` placeholder
(placeholder-rendering-b.md), so the closed placeholder surface is untouched;
the *Trigger* records that `<name>` renders the LOCAL binding, the inverse of
the `import-unknown-symbol` row. No governance page changed: a code addition is
already the recognised carve-out and no count-bearing aggregator enumerates
registry rows. The code is unreachable from every committed H9a fixture, so
`tests/fixtures/h7a/permitted-codes.json` was correctly left alone — it is a
load-refusing parse error, not sanctioned note content.

**Reproduction re-derived at the fix baseline** (`4361d42a`, 0.49.0, after bug
0039 rebuilt inline-object hoisting in three mint scopes): fixtures A, B, C, D,
E, G, H all byte-identical to the recorded 0.45.0 table — zero drift; the slug
`e39f064476c952aa` re-confirmed by an independent `node:crypto` derivation. Two
corrections to the report's own citations: `params.ts:306–308` ("only the
`params:` field position mints `__inline_` entries") and
`query-schema-lowering.ts:109–114` ("the annotation arm mints no `__inline_`
name") are both GONE at the fix baseline and their claims false — 0039 made
every type position hoist. That widening also composed a NEW instance of this
report's mechanism which the 0.45.0 table could not contain: an imported
reserved-form binding referenced in `params:` silenced a `schema S { f: {q:
boolean} }` field's own enforcement in both field orders, because
`hoistNestedDefs`' name-keyed first-wins lift handed the slug key to the
imported `{}` before the nested mint reached it. That instance closes here too,
through key ownership alone — the merge itself is untouched (bug 0054's
surface).

**Post-fix acceptance set.** A byte-identical. E keeps its single
`theta/parse/schema-case-mismatch` (its `$defs` entry under the reserved key is
now the mint rather than the author's fragment — an observable only inside a
file that never registers). B, C and D converge on one disposition a rule
names: exactly one error-severity `theta/parse/import-reserved-synthesised-name`
at the offending specifier, the `params:` field's own minted fragment intact and
enforcing, and the theta refused by the same drop gate that refuses E.

**Newly-refused inputs** (GOV-15 post-hoc in-scope set; the only code is
`theta/parse/import-reserved-synthesised-name` at error severity): (1) any
parsed `import` / `export` specifier in a `.theta` whose local binding matches
one of the four exact forms — from-bearing or from-less, aliased or direct;
(2) any `.thetalib` carrying such a specifier, whose importers un-register
through the pre-existing IMP-4 registration-error propagation, including
importers that never mention the name. NOT refused, unchanged: a `.thetalib`
`fn __inline_<16hex>` DECLARATION (auto-exported, legal per lexical.md `:16`)
— the reachable spelling is closed at the binding, which is the report's own
scoping; `fn` / `let` declarations in any reserved form; an unbound
reserved-form `NamedType` reference at any position. **Lowered bytes that move
for thetas that still load unchanged: none** — a reserved name resolves only
through a `bodyTypeMap`, and every key source of every builder is refused at
its introducing position or never admits the shape.

**Offline lock.** `tests/inline-slug-name-reservation.test.ts` (45 tests):
(a) the DIAG-4 registry anchor, every expected message in the file derived from
it; (b) control A's exact lowered bytes plus AJV accept/reject; (c) fixtures
B / C / D in all three spellings, plus the use-independence fence (an unused
reserved binding is refused too — the rule is on the binding, not its use);
(d) fixture E's single diagnostic and its post-fix `$defs` disposition; (e) the
composed `schema`-body hazard in both orders with its d0 control; (f) the
reserved-set boundary, four refused forms against nine legal near-misses;
(g) the two `$defs` writers at the unit seam, with an ordinary-name control;
(h) the no-drift matrix — an unbound reserved-form name still draws
`theta/parse/unresolved-named-type` at all six `NamedType` positions, against a
`Tirage` control. Neutralisation evidence, each a targeted byte edit restored
byte-exactly (blob-hash equal before and after; `git stash` never used):
removing the specifier emission gives 10 red with the report's `diags :: []`
signature; removing the `$defs` guard gives 13 red including `$defs :: {"D":{}}`
and the accepted `{p: 7, n: 1}`; widening `[0-9a-f]{16}` to a bare prefix reds
exactly the five legal-name fences; reversing the guard's position reds the six
(h) rows. Full gate 240 files / 3157 tests; typecheck and lint clean; the
bug-0035, bug-0039 and bug-0033 locks SHA-identical and unedited.

**Live.** H8a `tests/live/live-production-acceptance.test.ts` 7/7 and H9a
`tests/live/acceptance/` 11/11 green against the real provider. No committed
live fixture binds a reserved-form name, so the obligation was discharged by a
scratch live probe over the real load path: a colliding theta and its
ordinary-name control, asserting on registration and the settled
`SessionManager`'s system-note channel — GREEN with the fix (only the control
registers), RED with the fix neutralised (both register, no reservation note —
the report's own fixture F), GREEN again on restore. Probe deleted.

**Residuals.** (i) The refused-file closure path still aliases:
`buildBodyTypeSchemas` pass 3 resolves a closure name against `bodies` before
`inlineBodies`, so inside a document that never registers an author decl can
still shadow a minted fragment in a map VALUE's `$defs`. Byte-identical to
0.49.0 and reachable only in refused files; adjacent to bug 0054's surface,
unfiled. (ii) `docs/spec_topics/glossary.md:57` spells the callee form's tail
`__<name>` where schema-subset.md `:108` spells it `__<post-rename-name>` —
pre-existing drift, untouched, unfiled. (iii) The reservation is enforced at
the binding, not at the `.thetalib` declaration: a lib may declare
`fn __inline_<16hex>` and parse clean, and the refusal fires only when a client
binds it un-aliased. Deliberate (the report's own scoping), recorded so the
asymmetry is not mistaken for a gap. (iv) The from-less `export { … }` form the
check also covers is not a spec-defined production — imports.md spells the
re-export with `from` and grammar.md carries no `ExportDecl` production — so
the registry *Trigger* names the parser's tolerance explicitly rather than
resting on a production that does not exist. Unfiled.

## Fix

The decision is a spec decision, and the implementation follows it. Both
halves' obligations are below; the evidence does not select between them.

**Half A — reserve the synthesised-name forms.** A rule rejecting an author
declaration whose name matches any form of schema-subset.md §Synthesised
names (`:108`), stated where the identifier rules live (lexical.md
§Identifiers, whose casing rule already closes the `schema` / `enum`
positions) or beside the declaration rules (schemas.md), and cross-referenced
from `:108` so the "source of truth for the full set" also states the set is
reserved. It needs a registered code: a registry addition is a DIAG-2
operation (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`), covered
within a 1.x minor by the GOV-15 diagnostic-registry carve-out
(`docs/spec_topics/governance/source-language-stability.md:25`) for the
inputs whose only change is the appearance of the code. Two obligations the
evidence forces:

- The check must run at the **import specifier's local binding**, not only at
  `schema` / `enum` name positions. Fixture E shows those positions are
  already closed by the casing rule, so a reservation rule scoped to them
  closes nothing that is open.
- The rule must state which names it matches: the bare prefix `__inline_`
  followed by anything, or the exact form `__inline_` + 16 lowercase hex
  characters. The exact form leaves `__inline_zzz` legal, and such a name can
  never equal a minted slug; the prefix form refuses more input, so the
  GOV-15 carve-out's post-hoc input set has to name that input too.

**Half B — declare the namespace shared and define the semantics.** Then
`:73`'s hoist key is not exclusively synthesised, and the corpus states which
fragment survives an occupied key, what every `$ref` naming that key means
afterwards, and how that squares with `:112`'s requirement that a slug-keyed
table store canonical bytes alongside the keyed artefact — an author entry
has none. The implementation would then need the retention arm's silent
outcome to be the *specified* one, with the two writers agreeing on it:
`lowerTypeExpr`'s `IDENTIFIER` arm currently overwrites (fixture H) while the
mint path retains first (fixture G), so the surviving fragment depends on
declaration order and a shared-namespace rule has to fix which one wins.

**Either way, one implementation obligation is shared:** the two writers of
`lowerCtx.defs` must agree on key ownership. Today the mint path's bookkeeping
(`inlineCanonical`) is invisible to the `IDENTIFIER` arm and the arm's writes
are invisible to the mint path's byte check, which is why the outcome is
order-dependent and unreported in both directions.

The reproduction fixtures above (A–H) are the acceptance set for either
half: A must stay byte-identical, E must keep its single diagnostic, and B /
C / D must converge on one disposition that a rule names.

## Provenance

- Origin: the review of bug 0035's 0.44.0 fix, finding F3 — landed as
  [0035](./0035-params-rhs-inline-object-under-emission.md) §Fix (0.44.0)
  Residuals (ii) and as the retention-arm comment. The uncommitted local run
  artefact `.pi/tmp/fixes/0035-report.md` records both the finding
  (*Review*: "R1: F1 nested-comma mis-lowering …, F2 missing collision check
  …, F3 comments") and the residual (*Residuals*: "(ii) `__inline_` prefix
  not spec-reserved — author-named `__inline_<16hex>` schema aliases silently
  against minted slugs"). Filed at 0.45.0 with the input class corrected: the
  `schema`-declaration spelling both records is refused by the casing rule;
  the reachable spelling is an imported binding.
- Spec: `docs/spec_topics/schema-subset.md:73` (Lowering step 2, the
  `__inline_<slug>` hoist and the byte-equality condition on a slug match),
  `:76` (step 3, the `$ref` emission for a named or inline reference),
  `:92`–`:108` (§Canonical schema hash; `:108` §Synthesised names, "the
  source of truth for the full set"), `:112` (§Schema-slug collision posture,
  the byte-equality-before-identity requirement, the retained-bytes
  requirement, and "rather than silently aliasing two distinct fragments"),
  `:114` (the `$defs` dedup as one of the three slug-keyed sites);
  `docs/spec_topics/lexical.md:13` (identifier form),
  `:15` (PascalCase required for `schema` / `enum` names and type-like
  bindings), `:16` (lowercase-first, "a lowercase letter, or `_`", for `fn`
  names and `let` bindings), `:18` (the two case diagnostics; "The casing
  rule is the *only* enforced naming constraint"), `:20` (§Reserved
  keywords — a closed keyword list, no name-shape reservations);
  `docs/spec_topics/grammar.md:109` (§Inline object types; the hoist
  cross-reference); `docs/spec_topics/imports.md:13` (`.thetalib` permitted
  top-level forms, `fn` included), `:27` (implicit export of every top-level
  `schema` / `enum` / `fn`), `:38` (unknown-symbol check names the source
  symbol, not the alias), `:40`/`:47` (name collisions; `as`-aliasing);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (the `params:`
  type side — a `NamedType` "resolves against the file's body-level `schema` /
  `enum` declarations and any symbols imported from `.thetalib` files");
  `docs/spec_topics/diagnostics/code-registry-load.md:58`
  (`theta/load/schema-slug-collision`, whose trigger is two **anonymous**
  inline schemas); `docs/spec_topics/diagnostics/diagnostic-shape.md:72`
  (DIAG-2, the registry is closed);
  `docs/spec_topics/governance/source-language-stability.md:25` (the
  diagnostic-registry carve-out).
- Implementation evidence at HEAD `f959f8de`: `src/parser/params.ts:135–151`
  (the block-shared `defs` / `inlineCanonical` / `slugCollisions` and the
  per-field call), `:173–186` (the collision emission loop the sink feeds),
  `:306–308` (`params:` is the only minting position), `:329` and `:399–407`
  (the `IDENTIFIER` arm's unconditional `defs[s] = resolved`), `:497–526`
  (the mint path, the conditional byte check, and the retention comment);
  `src/parser/theta-document.ts:623–627` (`ImportDecl.symbols` carries the
  local binding), `:1130–1174` (`collectBodyTypes`, imported symbols mapped
  to `{}`); `src/lexer/lexer.ts:802–840` (`checkName`), `:873` (the `schema` /
  `enum` dispatch); `src/parser/imports.ts:297–304` (`ImportSpecifier`),
  `:326–385` (the two static-check arms);
  `src/extension/production-composition.ts:1894–1901`, `:1941`, `:1969` (the
  error-severity drop gate); `src/runtime/query-schema-lowering.ts:51–55`,
  `:109–114` (the query annotation arm mints no `__inline_` name).
- Reproduction: scratch vitest at HEAD — the eight fixtures quoted above
  (the no-collision control, both field orders of the direct import, the
  `as`-aliased spelling, the refused `schema`-declaration spelling, the
  shipped-composition-root registration probe over a planted temp workspace,
  and the two unit-seam arms), plus an independent `node:crypto` derivation
  of the slug from the canonical form; run on those signatures, then deleted
  per scratch policy.
