# Changelog

All notable changes to `@bitmonk8/pi-theta` will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.181.0] - 2026-08-27

### Fixed

- **Bug 0158 — the match-arm and fn-return LUB pages are corrected onto the
  registered *Triggers*** (route B + B7 option (i), citing 0155's stated law
  verbatim — both *Triggers* read dominating-member, both implementations
  match, the three over-claiming rule pages corrected; route A's rewiring
  premeasured 9 unauthorized reds and was refused). Witness
  `tests/match-fn-return-lub-dominating-discipline.test.ts` (26 cells, 8 red
  before) + H8a cell 86.

>>>>>>> 2f5ec57b (fix(bug-0158): match-arm and fn-return LUB pages corrected onto the registered Triggers — v0.181.0)

## [0.180.0] - 2026-08-27

### Fixed

- **Bug 0157 — an alias-spelled array sink now draws the same element
  diagnostics as its concrete spelling** (unfold-before-classify at all
  three dispatches; `sinkedArrayOf` is the single verdict returning
  `{node,element}`, outer checks keep the raw type so `expected U` renders
  the author's spelling). CITES 0129's stated count-consequence law
  verbatim — no new law; f3–f6 re-verified OUTSIDE it (agreement recorded);
  0129's class grows 2→4 instances. Witness
  `tests/alias-sink-array-element-check.test.ts` (28 cells) + a standalone
  live cell; `index-element-alias-unfolded` group (f) re-pinned under §Fix
  (d) with o1/o3/x1 added.

>>>>>>> 608b1090 (fix(bug-0157): alias-spelled array sinks draw the concrete spelling's element diagnostics — v0.180.0)

## [0.179.0] - 2026-08-27

### Fixed

- **Bug 0228 — an inline object's interior is captured as the author's raw
  source, and a field key that is not an identifier refuses** (route 1
  subject-scoped + the mandatory §Fix (b) refusal, parent-adjudicated after
  the first run's premeasure tripped the route valve): the balanced brace
  group is sliced from `bodyText` at all three capture sites (`parseType`,
  `@<T>`, `invoke<T>`), so `{a b: integer}` no longer fabricates the wire key
  `ab` at ten positions — the NEW row `theta/parse/inline-field-name-not-identifier`
  refuses it at all eleven, `params:` included. The `@<Ghost{>` runaway is
  bounded. 47 witness cells re-derived under the recorded grant (13 files);
  `params:` lowered bytes for well-formed interiors held by hash. Witness
  `tests/inline-object-type-source-capture.test.ts` (102 cells) + a
  standalone live cell + a NEW H9a acceptance file.

>>>>>>> 15ec4992 (fix(bug-0228): inline-object interiors capture raw author source; non-identifier field keys refuse — v0.179.0)

## [0.178.0] - 2026-08-27

### Fixed

- **Bug 0078 — an override-prefixed (`!`/`+`/`-`) `--theta` entry whose path
  is absent now draws `theta/load/missing-source`** (route B, disposition
  (i)): the literal-path `ENOENT` skips DISC-2's clean-leaf walk instead of
  mis-classifying as `theta/load/unreadable-source`; non-`ENOENT` stays
  `unreadable`. No new code, no severity move, no *Message* edit — no DIAG-2
  widening. First in-line edits to the `discovery-cli.md` mirror and
  `code-registry-load.md` since 0113 declined them (zero line movement).
  Witness `tests/discovery-cli-entry-override-prefix.test.ts` (13 cells) + a
  standalone live cell with no fault injection.

>>>>>>> 24d3d34c (fix(bug-0078): an absent override-prefixed --theta entry draws missing-source, not unreadable-source — v0.178.0)

## [0.177.0] - 2026-08-27

### Fixed

- **Bug 0150 — the fn-parameter annotation's optionality is adjudicated INTO
  the grammar** (route 2, settled in-run: route 1's mandatory-annotation
  refusal premeasured 63 reds across 13 files including 31 cells of 0151's
  and 0225's landed witnesses — the parameter-list family deliberately built
  on optional annotations): `FnParam ::= Ident (":" Type)?` lands in both
  grammar pages with the absent-only clause, and type-system.md (+ reference
  mirror) gains the Absent-operands typing rule. Zero `src/` bytes, zero
  registry rows, zero cell flips. Witness
  `tests/fn-param-annotation-optional.test.ts` (26 cells) + a standalone live
  cell (`fn-param-annotation-optional-live-cell`).

>>>>>>> 10b1b6e9 (fix(bug-0150): fn-parameter annotation optionality adjudicated into the grammar — v0.177.0)

## [0.176.0] - 2026-08-27

### Fixed

- **Bug 0226 — a resolved object-pattern head's field list is now checked**
  (the declared-head half 0221 left): a listed field the resolved schema does
  not declare, and a listed field whose literal is incompatible with the
  declared field type (both directions), now REFUSE at parse instead of
  loading `[]`, registering, and firing the wrong arm; subset field lists
  stay legal (B2), and 0221 §Fix (c)(5)'s field-compatible interchangeability
  boundary did not move. Registry row + expressions.md same commit. Witness
  `tests/object-pattern-head-field-set-refusal.test.ts` (32 cells) + a
  standalone live registration cell.

>>>>>>> 2558493b (fix(bug-0226): a resolved object-pattern head's field list is checked at parse — v0.176.0)

## [0.175.0] - 2026-08-27

### Fixed

- **Bug 0075 (partial) — the `listTree` per-entry `lstat` swallow now
  classifies by error code** in BOTH discovery copies (`discovery-walk.ts` +
  `package-discovery.ts`): a non-`ENOENT` `lstat` rejection joins
  `TreeWalk.unreadable` and draws the `theta/load/unreadable-source` warning
  (0113's row — its Trigger already admits the class); `ENOENT` stays silent
  (clean-leaf precedent). The doc's headline `classifyPath`
  link-classification subject stays OPEN — status narrowed, not flipped.
  Witness `tests/discovery-tree-walk-lstat-failure.test.ts` (11 cells) + a
  standalone live cell (`discovery-entry-lstat-failure-live-cell`).

## [0.174.0] - 2026-08-27

### Fixed

- **Bug 0155 — the ternary common-type corpus self-disagreement is
  adjudicated by the registered Trigger** (route (b)): the ternary is OUT of
  common-type rules 1–2's emission set — `array-ternary-common-type-union`'s
  registered *Trigger* governs, the exceeding rule-page scope corrected in
  the same commit (expressions.md + type-system.md + reference mirror). THE
  STATED LAW (for 0158 to cite): a registered *Trigger* is the normative
  statement of a code's emission set; where a rule page's scope exceeds it,
  the *Trigger* governs and the page is corrected same-commit; narrowing an
  emission set ONTO its registered *Trigger* needs no registry edit, but
  *Trigger* text presupposing the wider reading is corrected in the same
  commit as the narrowing. Zero test flips; witness
  `tests/ternary-common-type-trigger-adjudication.test.ts` (23 cells) + H8a
  cell 85.

## [0.173.0] - 2026-08-27

### Fixed

- **Bug 0200 — the three legacy CTRL-4 `par-*` codes now have sharded
  registry rows** (`par-query-in-body`, `par-shared-mutation`,
  `par-break-continue` — emitting since RFC 0003 but tabulated only on the
  reference transcription page). Rows land between `break-with-value` and
  0223's `par-return-in-body`; `src/**` byte-untouched. Witness:
  `tests/par-body-restriction-registry-rows.test.ts` (6 cells). The 0194
  witness's transcription fallback ladder retired under this doc's
  authority (routes through the sharded oracle).

## [0.172.0] - 2026-08-27

### Fixed

- **Bug 0160 — an inline-object wire-name rename (`a as "w": T`) now
  refuses at parse** with the NEW registered row
  `theta/parse/renamed-inline-field-name` (previously the spelling
  delivered no wire-name semantics silently; measurement showed the
  rename parse fires at `params:` only and semantics are unrecoverable
  downstream). Registry + reference mirror + grammar both sides +
  `lexical.md` amended same commit; the raw-key adjudication untouched.
  Witness: `tests/inline-object-wire-name-rename-refusal.test.ts` (25
  tests/67 cells) + a standalone live cell + a NEW H9a acceptance file.
  Eight re-pins across four protected witnesses ratified at merge.

## [0.171.0] - 2026-08-27

### Fixed

- **Bug 0129 — an empty-object schema field type now draws ONE
  diagnostic**: `{}` as a field type is already refused by
  `theta/parse/empty-schema-body`, so the explicit-`by` discriminator rows
  withhold and the refusal fires alone (previously two E-severity lines
  for one written mistake). The count-consequence law is stated row-local
  ("already drew … keeps that diagnostic ALONE") for open bug 0157 to
  cite. Trigger narrowing on `nested-discriminator` +
  `non-literal-discriminator`, `schemas.md` + reference mirror lock-step.
  Witness: `tests/empty-object-discriminator-field-withhold.test.ts` (4
  cells) + a standalone live cell.

## [0.170.0] - 2026-08-27

### Fixed

- **Bug 0223 — a `return` in a `par for` body now refuses at load**
  (previously it loaded silently and the runtime FOLDED the body return
  into that iteration's `Ok(value)` instead of exiting the enclosing
  scope). NEW registered row `theta/parse/par-return-in-body` from
  `scanParForStmt`'s `return` arm at every body depth (not descending a
  nested `fn`); the runtime fold retained as a defensive arm. CTRL-4 +
  RET-1 + sharded registry row + both reference mirrors + how-to amended
  same commit. Witness: `tests/par-for-body-return-refusal.test.ts` (22
  cells) + a standalone live cell. Entailed flips (r24)–(r28) of
  `tests/par-for.test.ts` ratified at merge. Bug 0118's residual 1
  discharged.

## [0.169.0] - 2026-08-27

### Fixed

- **Bug 0220 — a root `void` `fn`-return annotation supplies no QRY-2
  sink**: `SchemaSinkRewriter`'s `fn` arm leaves `QueryExpr.schema` null
  for a root `void` return annotation (the untyped fallback), so
  `fn f(): void { @\`hi\` }` registers and drives — previously refused
  with a false void-in-non-return-position diagnostic. Witness:
  `tests/fn-return-void-query-sink.test.ts` (7 cells) + H8a cell 84.
  Flips f1/f2 of `tests/let-annotation-query-double-emission.test.ts`
  ratified at merge (doc-authorized flip-day pins). Bug 0093 coordination
  note appended (its residual (i)).

## [0.168.0] - 2026-08-27

### Fixed

- **Bug 0225 — a foreign token in `fn` parameter position now refuses at
  parse** (previously `fn h(a: string,` / `x = 1` / `) { 1 }` registered
  silently with a phantom parameter). NEW registered row
  `theta/parse/fn-param-not-identifier` (registry + reference mirror + one
  grammar clause each side, same commit), deferred emission at `parseFn`'s
  epilogue `)`-arm; bug 0150's wire-name subject untouched;
  `fn-param-list-unclosed`'s Trigger not widened. Witness:
  `tests/fn-param-not-identifier.test.ts` (24 cells) + a standalone live
  cell. Bug 0151's residual discharged.

## [0.167.0] - 2026-08-27

### Fixed

- **Bug 0221 — an unresolved object-pattern head now refuses instead of
  firing a wrong arm**: `parsePattern`'s object arm consults a memoised
  declared-schema + builtin universe (incl. `QueryError`), so an
  undeclared or lowercase head draws `theta/parse/unresolved-named-type`
  (sixth Trigger position, same-commit) instead of silently binding the
  wrong `match` arm. Witness:
  `tests/object-pattern-head-unresolved-refusal.test.ts` (43 cells) + a
  standalone live cell. Flips n1/n2 of the 0219 witness ratified at merge
  (doc-authorized). 0219 discharge note appended.

## [0.166.0] - 2026-08-27

### Fixed

- **Bug 0222 — `checkLetMismatch` now consults the annotation withhold**:
  the QRY-4 explicit-schema check joins
  `theta/parse/annotation-type-not-expression`'s withhold consumers, so a
  refused `let` annotation draws the refusal ALONE — previously the same
  mistake also drew `theta/parse/explicit-schema-mismatch` (two diagnostics
  for one error). The registry row's consumer enumeration gains the QRY-4
  check same-commit. Witness:
  `tests/qry4-refused-annotation-withhold.test.ts` (14 cells) + H8a cell
  83. Flips o1/o2 of `tests/annotation-nontype-text-refusal.test.ts`
  ratified at merge (doc-named). Bugs 0093/0130 discharge notes appended
  (0130 residual 1 discharged).

## [0.165.0] - 2026-08-27

### Fixed

- **Bug 0154 — inline object type field names now enforce the naming
  rules**: `walkType`'s object arm runs the identifier pass over the
  retained `fieldNames` (declaration-ranged), so case and reserved-keyword
  rules fire on inline object fields as on schema declarations —
  previously unenforced. Gated on the spelled closing brace; no new
  registry row (existing rows reused). Witness:
  `tests/inline-object-field-name-case.test.ts` (30 cells) + a standalone
  H8a live cell + a NEW H9a acceptance file. Row f7 of
  `tests/schema-field-name-case.test.ts` re-pinned under bug 0149's
  authorisation.

## [0.164.0] - 2026-08-27

### Fixed

- **Bug 0224 — the identifier walk now descends `par for` bodies**:
  `walkIdentExpr` gains a `par-for` arm (iterand → max → body with scope
  tracking), so `theta/parse/unknown-identifier` and
  `theta/parse/type-as-value` fire inside `par for` as everywhere else
  (both were silent there). The `type-as-value` registry Trigger's par-for
  subtraction is removed same-commit. Witness: 26 additive cells in
  `tests/par-for.test.ts` (95 total) + H8a cell 82; g9 of
  `tests/type-name-as-value-refusal.test.ts` restated under bug 0224's own
  authority; entailed flips (r2)/(r3)/(h1) ratified at merge. Bug 0118's
  residual 2 (arrangement-2 standing charge) discharged.

## [0.163.0] - 2026-08-26

### Fixed

- **Bug 0151 — an unclosed `fn` parameter list now refuses at parse** (the
  grammar's parenthesised `FnDecl` list was accepted unclosed). One
  diagnostic ranged on the opening `(`, resync at the body `{`; NEW
  registered `theta/parse/fn-param-list-unclosed` (registry + mirror + one
  grammar clause each side, same commit); withheld when a type capture
  consumed an unmatched `)`. Witness:
  `tests/fn-param-list-unclosed.test.ts` (35 cells) + a standalone live
  cell. `fn h(p: array<string { 1 }` (0124's declined e4 row) now refuses.

## [0.162.0] - 2026-08-26

### Fixed

- **Bug 0118 — a nested `fn` under `par for` now refuses at load** instead
  of deferring to a runtime panic. `walkExpr` threads a `scope: WalkCtx`
  (31 sites) and gains a `par-for` arm (iterand → max → body,
  `inLoop: true`). Witness: ~40 new cells in `tests/par-for.test.ts` (69
  total) + `interpolated-result-gate` h1 (83 total) + H8a cell 81 + a NEW
  standalone H9a file. 0140's g9 reach fact holds verbatim (§Fix (c)
  arrangement 2). 0079 residual (iv) discharged.

## [0.161.0] - 2026-08-26

### Fixed

- **Bug 0176 — a quoted inline field key now refuses at parse** instead of
  being admitted and lowered verbatim (the 0161 re-filing). NEW registered
  `theta/parse/quoted-inline-field-name` (E, parse) at
  `inlineObjectFieldKeys`; the landed raw-key adjudication reused ('a' vs
  "a" stay distinct keys); 0160's wire-name subject untouched. Witness:
  `tests/inline-object-quoted-field-name-refusal.test.ts` (16 cells) + a
  standalone H8a live cell + a NEW H9a acceptance file. Six re-pins
  (subjects preserved), f2's control flip ratified.

## [0.160.0] - 2026-08-26

### Fixed

- **Bug 0130 — a `let`-RHS type mismatch now fires at an inline-object
  annotation** (the ⊑ relation refused the program silently). New exported
  `letAnnotationToCompatType` mints TYPE-8's `object` arm at the `let`
  site only (strict interior parser; `{}`/malformed/`void`/junk-tail
  decline); TYPE-8 gains TYPE-7's sub-side unresolvable-`named` deferral.
  Closes the QRY-4 pair (with 0093) — group (o) of the annotation witness
  stayed byte-identical, 251/251. Witness:
  `tests/let-annotation-inline-object-compat.test.ts` (51 cells) + H8a
  cell 80. Ratified flips: 0095's 2b/4i (+2a comment), g4, p2/d1 bytes.
  0095 residual (i) discharged.

## [0.159.0] - 2026-08-26

### Fixed

- **Bug 0206 — a zero-entry `tools:` scalar now refuses under
  `theta/load/malformed-tools-field`** instead of registering silently
  with an empty callable set (0104's admitted-spelling edge). Scalar-arm
  refusal in `frontmatter.ts`; the row's Trigger widened (registry +
  frontmatter pages + reference mirror same commit). Witness:
  `tests/tools-field-zero-entry-scalar-refusal.test.ts` (51 cells, 20 red
  pre-fix) + a standalone live cell. Tagged plain scalars (`!!str`)
  measured in-class — the doc's contrary claim corrected. 0104 residual 2
  discharged.

## [0.158.0] - 2026-08-26

### Fixed

- **Bug 0145 — the inference pass now types match-arm bodies in arm scope**
  (group (b); group (a) was discharged by 0199). `#typeExpr`'s `match` arm
  types each arm body in a new private `#matchArmScope` (withheld binders,
  VALUE channel only); `checkMatchArmTypes`' `armTypes` mapping is
  arm-scoped. Closes the six E-severity false refusals and three
  wrong-placeholder rows. `WITHHELD_BINDER_TYPE_NAME` moved to
  `type-compat.ts`, `collectPatternBinderNames` to `match-result.ts`.
  Witness: `tests/match-arm-scope-inference-pass.test.ts` (48 cells, 20 red
  at HEAD) + H8a cell 79, red-proven both directions.

## [0.157.0] - 2026-08-26

### Fixed

- **Bug 0128 — a non-literal `by`-field discriminator now refuses at
  parse** (`schema Animal by kind = Cat | Dog` with a non-literal `kind`
  loaded silently). NEW registered `theta/parse/non-literal-discriminator`
  (E, parse) gated on `presentInAll && !allLiteral`; registry row +
  `schemas.md` sentence + both reference mirrors same commit. Witness:
  `tests/non-literal-by-field-refusal.test.ts` (12 cells) + H8a cell 78 +
  a NEW H9a acceptance file, all red-proven both directions. Four
  authorized pin rewrites under §Fix (d)/(e). 0095 discharged; 0046
  carries the candidate-4 scoping note.

## [0.156.0] - 2026-08-26

### Fixed

- **Bug 0219 — a reserved-keyword object-pattern head now refuses at
  parse** instead of parsing clean and firing the WRONG match arm
  (`Err {}` matched `Ok(1)`). Reserved-word guard in `parsePattern`'s
  `{`-gated object-pattern arm; no registry edit. Witness:
  `tests/reserved-keyword-object-pattern-head-refusal.test.ts` (54 cells)
  + a standalone live cell. Element 2 narrowed (only a non-reserved
  undeclared `R { a: 1 }` head survives — residual filed), element 3
  (nested positions) recorded.

## [0.155.0] - 2026-08-26

### Fixed

- **Bug 0093 — a `let`-propagated annotation now emits once at the query
  position** instead of twice (the QRY-4 double). Route 2:
  `QueryExpr.schemaFromLetAnnotation` provenance marker set at both
  `parseLet` propagation sites; the query arm withholds only its own
  value-position re-walk. Witness:
  `tests/let-annotation-query-double-emission.test.ts` (10 cells) + a
  standalone live cell. Group (o) of the annotation witness never fired
  (explicit `@<Schema>` subjects never propagate) — 0130's direction is
  fully intact. Ratified pin flips: g3 (inline-empty-object-type), h1/i1
  (inline-object-duplicate-field-name — h1 named 0093 as its flip day).

## [0.154.0] - 2026-08-26

### Fixed

- **Bug 0205 — the three unpinned `containsWithheldBinderType` gates are now
  pinned** (tests-only, the 0193 shape): additive absence cells
  u13mj/u13mk/u13ml/u13mm in `tests/fn-arg-type-mismatch-wired.test.ts` pin
  `checkSubagentReturnAnnotation`, `checkArrayLiteral`, `checkObjectField`,
  and `checkMethodCall`'s `join` branch over a `match` binder — pre-fix the
  first three gates were deletable with the whole suite green. Source
  byte-untouched. 0193's residuals 2 and 3 discharged.

## [0.153.0] - 2026-08-26

### Fixed

- **Bug 0216 — `classifyShutdownReason` is now wired at the shutdown
  handler** (disposition A): called at handler entry, emitting before
  sub-step 1, with `capturedEventReason` feeding the stamp and the
  tripwire; the factory supplies `inventory: SDK_SURFACE_INVENTORY` and
  stops pre-reading `event.reason` (the throwing-getter case lands on the
  extension-bootstrap-failed arm as measured). Both `theta/host/*`
  code-registry rows are now reachable. Witness cells in
  `tests/session-shutdown.test.ts` + `tests/session-shutdown-wiring.test.ts`
  + H8a cell 77 (red-proven). `unknown-reason-rule` 24 cells byte-untouched.

## [0.152.0] - 2026-08-26

### Fixed

- **Bug 0212 — a declared `__proto__` property is now enforced by the AJV
  validator** instead of being silently dropped by codegen.
  `properties.__proto__` is relocated to `patternProperties["^__proto__$"]`
  at every depth (schema-aware walk; `allOf` intersection on a colliding
  pattern) plus `ownProperties: true`, both confined to affected documents
  via a per-instance hardened AJV. Witness:
  `tests/proto-named-schema-validator-enforcement.test.ts` (18 cells, 12
  red pre-fix). H8a cell 69 flipped under 0212's own §Fix constraint 4
  (ratified); 0210's AJV-reads-data-prototype question settled on the
  record. Closes the `__proto__` pipeline opened by 0210/0214.

## [0.151.0] - 2026-08-26

### Fixed

- **Bug 0123 — `--y`/`++y` in a match pattern now draws its own registered
  row** (`theta/parse/increment-decrement`) instead of a two-code
  neighbouring cascade. `parsePattern` emits before the fall-through,
  consumes the operator, and recurses for the operand when it can begin a
  pattern (else wildcard). Zero spec/reference edits — implementation
  conformance. Witness: `tests/match-pattern-increment-decrement.test.ts`
  (28 cells, 13 red pre-fix) + a standalone live cell. 0141's witness and
  its five re-pinned siblings (375 lock cells) byte-unchanged.

## [0.150.0] - 2026-08-26

### Fixed

- **Bug 0211 — separator-degenerate import/export specifier lists now
  refuse** instead of parsing clean with phantom `(c→c)` specifiers, comma
  runs, missing-comma runs, and a discarded second `as`.
  `checkImportSeparatorDegenerateSpecifierList` wired region-local in
  `parseImportExport`; the existing `import-malformed-specifier-list`
  Trigger widened in place (no new row — Message/severity/phase
  byte-identical). Witness:
  `tests/import-specifier-separator-production-required.test.ts` (68 cells,
  39 red pre-fix) + H8a cell 76 (red-proven). 0100's 36-cell and 0101's
  22-cell locks byte-identical.

## [0.149.0] - 2026-08-26

### Fixed

- **Bug 0122 — parse diagnostics inside a `@`-template `${…}` interpolation
  are no longer discarded.** `parseInterpolationSource` +
  `BodyParser.parseSingleExpressionWithResidue` emit at the parse-layer
  walk, draining residue through the shipped `parseForms` loop (let-RHS
  parity by construction). No registry edit — the DIAG-2 Triggers admit as
  written. Witness: `tests/interpolation-parse-diagnostics.test.ts`
  (41 cells, 12 red pre-fix) + H8a cell 75 (red-proven both directions).
  Type-phase and scope-aware codes inside `${…}` remain route 3 (pinned
  a7–a16, recorded).

## [0.148.0] - 2026-08-26

### Fixed

- **Bug 0217 — a nested inline `enum[…]` with a top-level comma inside a
  generic argument now refuses at all three sink positions** instead of
  registering with an empty lowered field. `findCutBracketGroupText` +
  `pushCutBracketGroupAsLastResort` at the non-`array` generic-arm return
  point; the comma is the discriminator (`array<enum["a"]>` control
  unchanged); both registry Triggers mirrored. Witness:
  `tests/nested-inline-enum-generic-argument-refusal.test.ts` (190 cells,
  41 red pre-fix) + H8a cell 74 (red-proven). Six g3/g4 flips in 0204's
  witness ratified under 0217 §Fix (c)(4); 0204's zero-lowered-bytes-moved
  property held.

## [0.147.0] - 2026-08-26

### Fixed

- **Bug 0213 — the session-only degraded-state page is no longer truncated
  mid-word.** The cut acceptance bullet is completed and the two dropped
  bullets restored (route A hybrid: history under the loom→theta rename +
  one bullet re-derived against 0208's widened never-both clause); the
  `code-registry-runtime.md:39` EXCEPT-clause citation stays true.
- **Bug 0215 — the two remaining load-witness comments naming a
  "composition root" corrected** to 0183's item-4 vocabulary via 0207's
  comment-only mechanism (transpile-emit digests equal HEAD per file);
  0207's residual 2(a)/(b) discharged in full.

## [0.146.0] - 2026-08-26

### Fixed

- **Bug 0141 — a capitalised bare head in a `match` pattern now refuses
  instead of binding an identifier.** `parsePattern`'s tail arm refuses
  reserved-before-case with the NEW registry row
  `theta/parse/capitalised-pattern-head` (E, parse); the AST node is
  preserved so no `unknown-identifier` cascade follows. Witness:
  `tests/capitalised-bare-match-pattern-refusal.test.ts` (45 cells, 27 red
  pre-fix) + a standalone live cell
  (`tests/live/capitalised-pattern-head-live-cell.test.ts`). Nine
  list-expansion flips in five sibling witnesses ratified on the record
  (fixtures byte-identical, subjects preserved).

## [0.145.0] - 2026-08-26

### Fixed

- **Bug 0214 — a `__proto__`-named key now survives defaulting, inference
  and the echo.** The defaulting fill write and `inlineDefsRefs` land on
  `defineRecordField`; a new `restoreDroppedOwnKeys` repairs typebox
  `Type.Unsafe`'s own silent drop of `__proto__`/`constructor`/`prototype`
  own keys (measured: the doc's one-line conversion was insufficient); the
  echo's prototype-chain read is own-key guarded (`RangeError` gone).
  `defaultedWireNames` no longer reports a fill that did not land. Witness:
  `tests/proto-named-binder-write-sites.test.ts` (9 cells, 7 red pre-fix).
  The AJV validation seam remains bug 0212.

## [0.144.0] - 2026-08-26

### Fixed

- **Bug 0175 — trailing tokens after a parsed default literal now refuse.**
  The literal-sublanguage expression parser stopped at the first complete
  expression and silently discarded the residue, so spellings like
  `integer = 1 2` bound `1` with zero diagnostics. One shared `residueOf`
  helper makes both default-position readers require end of input
  (`ExprParser.parse()` itself untouched); the existing
  `theta/parse/default-not-literal` row's Trigger widened (Message unmoved)
  same commit. Witness:
  `tests/params-default-trailing-residue-refusal.test.ts` (100 cells, 87 red
  pre-fix) + H8a cell 73 (red-proven both directions). Bug 0166's residual 2
  discharged.

## [0.143.0] - 2026-08-26

### Fixed

- **Bug 0209 — an all-line-break `description:`/`argument-hint:` no longer
  emits a bare labelled line into the binder system prompt.** The item-2/
  item-3 emission sites now compute the collapsed value once and emit the
  labelled line only when it is non-empty, so an all-break value renders as
  an absent field (matching the absent/`""`/empty-block controls). Spec
  items 2/3 gained the post-collapse clause; `reference/frontmatter.md`
  mirrored. Witness:
  `tests/binder-prompt-all-break-description-hint-empty-line.test.ts`
  (13 cells — the report's measured table); bug 0103's 15-cell witness
  untouched.

## [0.142.0] - 2026-08-26

### Fixed

- **Bug 0218 — the child `--tools` allowlist now carries HOST-tool names
  only** (external contribution, PR #2 — Harald Nielsen). The launch contract
  forwarded `.theta` callable presented names on `--tools`, a HOST
  tool-registry allowlist — inert on Pi's tolerant argv, fatal on a host that
  validates it (Oh-My-Pi: child exits 2 before any session starts, so every
  theta registering a `.theta` callee in `tools:` was unrunnable there,
  load-clean and silent under `-p`). The argv input is now
  `hostTools`/`noHostTools` (a theta-only callable set takes `--no-tools`);
  `inferChildTrust` reads the host half, closing a trust-inflation vector via
  presented-name collision with a project-local tool. Carrier table split by
  side in `subagent.md` (+ the new `#subagent-tools-host-names-only` rule)
  with five restatement pages; session fix-ups re-derived four further corpus
  sentences to the host-half wording. Witness: retargeted + new cells in
  `tests/subagent-model-theta-tool.test.ts` + H8a cell 72 (real spawned
  children, both fixed shapes).

## [0.141.0] - 2026-08-26

### Fixed

- **Bug 0101 — a `from`-bearing re-export now delivers a real binding.** The
  one defined re-export form resolved at the static gate but materialised
  nothing at compose — a consumer importing the re-exported name got no
  binding with zero diagnostics. Route A: `closeOverReExports` +
  `fixReExportedNames` (monotone least fixpoint) + `diagnoseReExports` +
  `materializeChain` in `import-static-checks.ts`, with the cycle edge set
  widened (`import-cycle` Trigger re-derived same commit) and
  `imports.md`/`grammar.md` amended. Witness:
  `tests/reexport-chain-resolution.test.ts` (22 cells) + H8a cell 71
  (red-proven both directions).

## [0.140.0] - 2026-08-26

### Fixed

- **Bug 0099 — schema slugs now mint from the canonical keys-sorted form.**
  `respondSchemaSlug` hashed the emitted-bytes serialization, so two
  documents lowering to the same schema could mint different slugs (and the
  same schema different slugs across emission-order changes) against the
  spec's canonical-form sentence. Route A: the shared `toLoweredJsonValue`
  bridge canonicalizes the slug input; `params.ts`'s type-first key order
  becomes an emitted-bytes-only contract (byte-identical output —
  `params-literal-sublanguage-lowering` untouched). Witness:
  `tests/schema-slug-canonical-form-mints.test.ts` (30 cells) + a
  canonical-slug live cell in `typed-query-wire-shapes` (red-proven live —
  the model called the neutralised mint vs the fixed mint). 30 oracle
  constants across 8 witness files re-derived under 0099's authority.

## [0.139.0] - 2026-08-26

### Fixed

- **Bug 0204 — the bracket-blind generic-argument shred no longer falsely
  refuses inline objects.** `splitTopLevel` never tracked bracket depth, so
  `array<{a: integer, b: string, c: boolean}>` (and kin) shredded into
  segments that drew refusals on input the grammar derives.
  `lowerTypeExpr`'s generic arm now classifies its argument list per segment
  (`classifyGenericArgumentSegments`) and recurses non-whole segments with
  the `unspellable` sink dropped — no split widened, no decline narrowed,
  zero lowered bytes moved; 0164's d6/d7 and every landed TRUE refusal
  byte-intact. Three registry Trigger cells re-derived same commit. Witness:
  `tests/generic-argument-shredded-group-refusal.test.ts` (135 cells) + H8a
  cell 70 (red-proven both directions).

## [0.138.0] - 2026-08-26

### Fixed

- **Bug 0115 — the declared binding type is now enforced at reassignment.**
  A `let mut` reassignment whose RHS is incompatible with the binding's
  declared/inferred type was accepted silently; bug 0090's adjudicated rule
  (`#reassignment-binding-type`) had no enforcement. NEW registered code
  `theta/parse/reassign-rhs-type-mismatch` (E, type); the integer-narrowing
  sub-case routes to the existing `theta/parse/integer-narrowing` at the
  reassignment site. Registry row, reference mirrors, `type-system.md`, and
  `bindings.md` amended same commit. Witness:
  `tests/reassign-rhs-type-compat.test.ts` (42 cells) + a standalone live
  registration cell. Flips parent-ratified under 0090's and 0140's named
  authority (b1/c5 location-discriminating; a8 ordered-pair).

## [0.137.0] - 2026-08-26

### Fixed

- **Bugs 0207 + 0208 — docs batch.** 0207: twenty-four witness-comment sites
  (plus two describe titles) misattributed load behaviour to the shipped
  composition root where the production compose helper is the actor — swept
  to bug 0183's settled vocabulary verbatim, comment-only proven per file.
  0208: the clean-cancel / teardown-timeout "never both" clause now carries
  the measured post-deadline carve-out (both surfaces, one event, fully
  stamped reason), and the `"<unreadable>"` sentinel — not the dual
  appearance — is re-pinned as the stamp-throw discriminator across the four
  governing pages. NEW offline conformance lock
  `tests/post-deadline-dual-surface.test.ts`. Bug 0073's residual 1
  discharged.

## [0.136.0] - 2026-08-26

### Fixed

- **Bug 0210 — the remaining prototype-slot record writes now route through
  `defineRecordField`.** Five measured sites: both producer `params:` records
  (system-render + marshal) silently dropped `__proto__`-keyed fields; the
  respond wire's prototype-chain `in` guard fabricated inherited names
  (`constructor` = `Object` in all 98 sweep rows) — closed with an own-key
  guard + defining write; and the three schema-node-as-prototype tables
  (body-type-lowering + params.ts ×2) dropped the field from `properties`
  while requiring it, with the real AJV compile THROWING on the inherited
  `type` key. Witness: `tests/proto-named-record-write-sites.test.ts`
  (17 cells) + H8a cell 69 (real child, `__proto__`-keyed params intake,
  red-proven both directions). Bug 0119's residuals 1+2 discharged.

## [0.135.0] - 2026-08-26

### Fixed

- **Bug 0203 — junk `@<T>` query-ascription text now refuses instead of
  silently suppressing `unresolved-named-type`.** The `@<T>` capture was the
  last junk-lenient annotation position: non-type text there suppressed the
  registered refusal at one of its own Trigger positions. The capture now
  consults bug 0124's landed recogniser and draws the NEW registered code
  `theta/parse/query-annotation-type-not-expression` (E, parse); registry row,
  reference mirror, and the type-system/grammar pages amended same commit.
  Witness: `tests/query-annotation-nontype-text-refusal.test.ts` (67 cells) +
  H8a cell 68. Fence flips under named authority: 0124's f5/f6 and 0061's g1
  (parent-ratified; fixture bytes identical, lowering pins untouched).

## [0.134.0] - 2026-08-26

### Fixed

- **Bug 0100 — production-excluded import/export specifier-list spellings now
  refuse at parse.** Absent lists, zero-specifier lists, and dangling-`as`
  specifiers loaded silently against the spec's closed `ImportSpec`/
  `ExportSpec` productions. ONE new registered code
  `theta/parse/import-malformed-specifier-list` (E, parse): a statement arm
  gated on a well-formed `from` clause (never co-emits with
  `import-missing-from-clause`) + an unconditional per-specifier arm.
  Registry row, reference mirror, `imports.md`, and `grammar.md` amended same
  commit. Witness: `tests/import-specifier-list-production-required.test.ts`
  (36 cells) + H8a cell 67 (registration denial, red-proven both directions).

## [0.133.0] - 2026-08-26

### Fixed

- **Bug 0090 — the type a `let mut` binding carries after reassignment is now
  specified.** Adjudicated disposition 1: a reassignment does not change the
  binding's type — every later reference resolves the type the binding was
  declared or inferred with, for the whole of the binding's scope
  (`docs/spec_topics/bindings.md` §Reassignment, anchor
  `#reassignment-binding-type`; mirrored in `docs/reference/grammar.md`).
  Read-side adjudication only — zero code changed; bug 0115's enforcement
  premise survives untouched. Witness:
  `tests/reassignment-binding-type-governs.test.ts` (7 cells).

## [0.132.0] - 2026-08-26

### Fixed

- **Bug 0119 — a schema field named `__proto__` now survives construction.**
  The record writes used plain assignment, so a declared `__proto__` field's
  evaluated value was silently discarded (the assignment wrote the prototype
  slot) while the parse layer forced the field to be written and type-checked
  its value. All six record write sites now go through the new exported
  `defineRecordField` (per-field `Object.defineProperty`); the null-prototype
  route was rejected (it contradicts `runtime-value-model.md:12` and perturbs
  coercion). Witness: `tests/ctor-proto-named-field.test.ts` (26 cells) +
  cell F of `ctor-declaration-order` re-pinned under its own named authority
  + H8a cell 66 (red-proven both directions).

## [0.131.0] - 2026-08-26

### Fixed

- **Bug 0103 — binder `description:` / `argument-hint:` lines are no longer
  forgeable by embedded newlines.** The binder system prompt renders author
  text line-positionally, so a value carrying `\n` could impersonate a
  different line of the prompt (injection-adjacent). The item-2/item-3 render
  sites now collapse embedded line breaks and trim (module-local
  `normalisePromptTextLineBreaks`); break-free values stay byte-identical.
  Normative collapse-and-trim sentences landed in
  `binder-bypass-and-envelope.md` + the `reference/frontmatter.md` rows the
  same commit; no diagnostics touched. Witness:
  `tests/binder-prompt-description-hint-line-forgery.test.ts` (15 cells) +
  H8a cell 65 (fixed-path coverage — the doc's own constraint records that
  live cannot witness an off-session `complete()`).

## [0.130.0] - 2026-08-26

### Fixed

- **Bug 0073 — the per-invocation cancelled-by-session-shutdown note is now
  emitted.** Teardown sub-step 2 stamped `shutdownReason` on every in-flight
  registry entry, but nothing ever read the stamp: a theta cancelled by
  `session_shutdown` ended silently. Both per-invocation `finally` bodies now
  consult the stamp through the 0074 ticket seam and emit the
  clean-cancel note once per invocation (path-by-path once-only proof over
  all three finish sites), through the extension's real system-note channel
  (renderer-gate respected). Witness:
  `tests/cancelled-by-session-shutdown-note.test.ts` (5 cells, both delivery
  channels) + H8a cell 64 (a real in-flight drive raced by
  `session_shutdown`, red-proven both directions).

## [0.129.0] - 2026-08-26

### Fixed

- **Bugs 0183, 0186, 0189 — spec-prose corrections (docs batch).** 0183: the
  conformance suite's comments (and eight further files + three H8a chain
  comments) called the test-only production compose helper
  (`discoverAndComposeFixtures`) "the shipped `session_start` composition
  root" — the shipped root is `composeExtensionInstance` via
  `extensions/index.ts` → `factory.ts`; all enumerated sites corrected. 0186:
  `runtime-value-model.md:37` claimed `params:` defaults "bypass the inbound
  translation pass" — false since 0172 face 1 / 0181; sentence rewritten to
  the shipped mechanism, mirror + worked-example page + five comment sites
  brought into line. 0189: the placeholder closure-vs-registry inconsistency
  adjudicated — the registry row governs; seven placeholders across nine
  rows dispositioned into the closed categories (one new clause (g)); the
  false build-time-enforcement claim struck; zero registered `Message` bytes
  moved.

## [0.128.0] - 2026-08-26

### Fixed

- **Bug 0116 — `${r?}` in a query template renders the unwrapped payload; an
  `Err` operand aborts.** `evaluatePureExpression` had no `try` arm, so a
  `?`-unwrap behind a query-string interpolation fell into the expressions.md
  safety net and rendered `null` into the prompt text — silently, reporting
  success — for both `Ok` and `Err` operands. The pure host now discriminates
  through the shared `evaluateQuestion` primitive: payload on `value`,
  `InterpolatedResultPanic` on `propagate` (the one raise STATEMENT factored
  into a module-local helper shared with `stringifyInterpolation` — bug 0079's
  grep-provable one-raise property preserved). Witness:
  `tests/interpolated-result-gate.test.ts` 49→82 (33 additive cells) + H8a
  cell 63 (Ok and Err halves through a real dispatched turn, red-proven both
  directions).

## [0.127.0] - 2026-08-26

### Fixed

- **Bug 0104 — a mapping-valued `tools:` field now refuses at load.**
  `extractToolsList` treated a YAML mapping under `tools:` (both spellings —
  `tools: {read: bash}` inline, and `tools:` over an indented mapping) as an
  ABSENT field: the theta registered with the empty callable set and the
  failure surfaced later as `theta/parse/unknown-identifier` on a name the
  author had declared. New registered code `theta/load/malformed-tools-field`
  (`E`, load), emitted at the frontmatter read, ranged on the value node,
  un-registering — refusing mappings (incl. `tools: {}`), aliases, and
  valueless keys while keeping both admitted spellings, the null-scalar
  spellings, and the entry-level granularity untouched. Registry row +
  reference mirror + three frontmatter-page sites amended the same commit.
  Witness: `tests/tools-field-shape-refusal.test.ts` (37 cells) + a standalone
  live registration cell (red-proven both directions).

## [0.126.0] - 2026-08-26

### Fixed

- **Bug 0113 — glob-universe enumeration failures now warn instead of
  silently shrinking discovery.** Both `listTree` copies swallowed every
  `readdir` rejection, so a denied subtree (or denied static-prefix root)
  under a settings `thetaPaths` glob or a package `pi.theta` universe
  silently dropped every `.theta` beneath it. The walk now returns its
  failures and the caller emits `theta/load/unreadable-source` (warning)
  naming the lowest-index settings entry or the package descriptor — no new
  registry code, no Trigger widening (bug 0076's precedent). Spec silence
  closed in `discovery-sources.md` the same commit. Witness:
  `tests/discovery-glob-universe-enumeration-failure.test.ts` (19 cells) +
  H8a cell 62 (real discovery→registration path, red-proven both directions).

## [0.125.0] - 2026-08-26

### Fixed

- **Bug 0074 — the slash-dispatch registry entry now spans the binder window.**
  The `ActiveInvocationRegistry` insertion happened after the awaited binder
  step, so a `session_shutdown` delivered while a non-bypass `params:` theta
  was inside its binder LLM call found no entry: teardown's sub-step 2 had
  nothing to abort and the theta body ran to completion after a completed
  five-sub-step teardown. The entry is now minted at handler entry
  (`beginInvocation` / `ActiveInvocationTicket`, one mint site), ahead of the
  binder await; both binds reuse the ticket and the binder-short-circuit path
  finishes it. Witness: `tests/active-invocation-binder-window.test.ts` (parked
  binder, 3 cells) + H8a cell 61 (live `session_shutdown` racing a real binder
  call, red-proven both directions).

## [0.124.0] - 2026-08-26

### Fixed

- **Bug 0193 — the two withheld-binder gates are pinned again.** Bug 0126's
  u-group re-derivation (0.107.0) left the typed-`let` RHS sink and the
  `array.join` element sink with no cell that reds when their
  `containsWithheldBinderType` gate is removed. Two additive absence cells
  (`u13mh`, `u13mi`) in `tests/fn-arg-type-mismatch-wired.test.ts` restore the
  pins: neutering either gate now reds exactly its own cell with the
  `got array<<withheld>>` signature. Tests-only; no `src/**` byte moves
  (hash-verified). Discharges bug 0126's §Residuals item 1.

## [0.123.0] - 2026-08-20

### Fixed

- **Bug 0164 — a literal or literal-union generic argument now lowers its
  step-3 emission instead of a permissive fragment.** `lowerTypeExpr`'s
  generic-application arm recursed the argument through ITSELF and never
  through the literal sublanguage, so `array<"x" | "y">` lowered
  `{"type":"array","items":{"anyOf":[{},{}]}}` and `array<"x">` lowered
  `items: {}` at all four `Type` positions — the `params:` field, a `schema`-body
  field, an alias right-hand side and the `@<T>` annotation root — with zero
  diagnostics. `items` of `{"anyOf":[{},{}]}` is two variants AJV satisfies with
  any JSON value, so the declared element type enforced nothing: real AJV over
  the lowered `params:` document accepted `["zzz"]`, `[7]`, `[null]`, `[{}]` and
  `[7, null, {}]` for a param the author had closed to two strings, and the
  byte-identical declaration spelled `schema Sev = "x" | "y"` plus
  `p: array<Sev>` refused all of them. Nothing at load, in the recorded
  `BypassParamsField.type` or in the rendered `Parameters:` line distinguished
  the two spellings. The fix routes both the arity-1 `array` argument and the
  best-effort loop's arguments through the exported `lowerLiteralSublanguage`
  before recursing, so `array<"x" | "y">` lowers
  `items: {"type":"string","enum":["x","y"]}` (`schema-subset.md:80`),
  `array<"x">` and `array<7>` lower `items: {"const":<value>}` (`:79`),
  `array<null>` lowers `items: {"const":null}` and `array<1 | 2>` /
  `array<true | false>` lower the bare `items: {"enum":[…]}` — every one of them
  byte-identical to what the same argument text has lowered to at depth 0 since
  0.85.0, at every nesting depth and at all four positions. The argument split's
  angle-only nesting is unchanged, so a brace-rooted or comma-carrying argument
  keeps its exact current disposition, and a literal arm of a MIXED union stays
  where bug 0184's mixed-gated per-arm consult put it. No new diagnostic and no
  registry change.

  Validation outcomes change for thetas that load unchanged: mistyped generic-
  argument element values are newly refused at all three AJV consumers of the
  lowered `params:` document (the binder envelope, the post-default-merge
  compile and the subagent child's params intake), the model-facing binder
  envelope now carries the enforcing `items`, and the minted content-addressed
  names move with the bytes — `{m: array<"x" | "y">}` remints
  `__inline_bf7d6fbea15638b6` → `__inline_9dd1f359f0ef05f8` at all three
  hoisting positions together, and an `@<T>` annotation carrying a literal
  argument renames its `__theta_respond_<slug>` tool. No committed `.theta` or
  `.thetalib` in the repository declares a literal or literal-union generic
  argument, so no shipped source moves.

## [0.122.0] - 2026-08-20

### Fixed

- **Bug 0140 — a bare `schema` / `enum` declaration name at a value position is
  refused.** `collectIdentRoots` folded every declared `schema` and `enum` name
  into the whole-file identifier root scope through one fall-through `switch`
  arm, so `checkUnknownIdentifiers` resolved a bare declaration name at a value
  position exactly as it resolves a `let` binding: `schema P { a: number }` plus
  `fn g(s: string): number { 1 }` plus `let out = g(P)` emitted no diagnostic at
  any severity, the theta registered, and the runtime resolver — which
  implements only the four resolution arms `expressions.md` §Identifier
  resolution states — answered `unresolved` and let the pure host substitute
  `null` at the position. Measured consequences: `1` returned out of a
  `string`-annotated parameter, `"nullx"` out of a `string`-annotated return,
  `null` bound by a `let mut` reassignment, and `theta/runtime/null-member-access`
  aborting the theta on the first field read. Such a reference now draws
  `theta/parse/type-as-value` and the theta does not register.

  The judgement lands in the identifier-resolution walk itself, which already
  tracks exact lexical scope: `collectIdentRoots` is byte-unchanged and is
  called a second time over the declaration-free statement list, so a name a
  `let`, a parameter, a `for` / `par for` variable, a `match` binding, a
  `params:` field, an imported symbol or a callable-set entry also introduces is
  read as that binding and draws nothing. `Enum.Variant` keeps resolving, the
  constructor head and every `Type` position are untouched, a bare declared name
  as a discarded expression statement stays the silent no-op class, and the call
  position (`Schema()`) keeps `theta/parse/unknown-identifier`, the code
  `expressions.md:44`/`:51` assign there.

  New registry row (DIAG-2, same commit): `theta/parse/type-as-value`, `E`,
  phase `parse`, message `type '<name>' used as a value; a schema or enum
  declaration names a type, not a value`. Reusing
  `theta/parse/unknown-identifier` at the value position was rejected — it
  misdescribes a name the author declared three lines up, the ground on which
  `theta/parse/function-as-value` was minted and bug 0197's landed adjudication
  refused the same reuse. `expressions.md` §Identifier resolution now states the
  disposition, closing a spec silence: no page had assigned a bare schema or
  enum reference a static type or a runtime value.

## [0.121.0] - 2026-08-19

### Fixed

- **Bug 0124 — a type annotation carrying text that spells no type is refused at
  the three `Type` positions outside a schema.** A `let` annotation, an `fn`
  parameter type and an `fn` return type each captured any trailing punctuation
  into the annotation string, `annotationToCompatType` mapped the result to an
  opaque nominal reference, and eight registered error-severity rows stopped
  firing while `theta/parse/non-array-iterand` fired falsely with the captured
  junk rendered into its message. One trailing character removed the rejection
  the annotation existed to produce, and the theta registered and ran with its
  declared constraints unenforced. Each such annotation now draws one
  error-severity `theta/parse/annotation-type-not-expression` at the
  declaration's range and the theta does not register.

  The judgement reuses the sink and the single shared decline bugs 0059 and 0061
  landed, so the `params:` field, the `schema` field, the alias arm and these
  three positions agree on a fragment's disposition by construction rather than
  by coincidence; `annotationToCompatType` itself is byte-unchanged. A refused
  annotation is then absent to the six consumers of the declared type it stood
  in for, so the refusal fires alone rather than cascading: the `?`-scope check,
  the Result-certainty channel, the callee's parameter table, the binding record,
  the `fn` parameter scope and the `subagent fn` return boundary. An independent
  fault in the same declaration keeps its own diagnostic.

  New registry row (DIAG-2, same commit): `theta/parse/annotation-type-not-expression`,
  `E`, phase `parse`, message `'<name>' declares a type that is not a theta type
  expression`. Widening `theta/parse/schema-type-not-expression` was rejected on
  the bug 0044 honest-identity precedent — its slug and trigger name schema
  positions, and a `let` annotation is neither.

## [0.120.0] - 2026-08-19

### Fixed

- **bug 0199 — `walkStmt`'s unannotated `let` arm marked `unprovableBindings`
  with an object it did not own, so one `let` off an erased receiver silenced a
  later true `fn-arg-type-mismatch` over the same declared field.**
  `unprovableBindings` is keyed by JavaScript object identity, and the object
  `typeOf(stmt.init)` returns for a member read is BORROWED: `collectSchemaFields`
  builds exactly one `CompatType` per declared field per parse and `#memberType`'s
  declared branch hands it back by reference, alias-unfolded. Marking it withheld
  every later binding that recorded the same field — so with
  `schema L = array<integer>`, `schema P { xs: L }` and `fn hs(a: array<string>)`,
  a `let zs = m.xs` off an erased ternary receiver followed by `let ws = q.xs`
  over a proven `q: P` made `hs(ws)` load clean, where deleting the first `let`
  reported `expected array<string>, got array<integer>`. The suppression was
  order-dependent, crossed `fn` boundaries and block scopes, reached top-level
  statements, and was silent on every channel; because an error-severity
  `theta/parse/*` is what denies registration, the theta registered and the
  mistyped call was bound unchecked at runtime. `walkStmt`'s `case "let"` now
  resolves one `recorded` `CompatType` — a private `{ ...rhsType }` twin iff the
  initialiser is not a proof, the borrowed object itself otherwise, the unfolded
  annotation when the `let` is annotated — and records, marks, MINTS into
  `resultBindings` and CARRIES an inherited `resultBindings` membership off that
  single object, so a withhold recorded for one binding applies to that binding
  only while bug 0079's provenance survives the copy transitively. The withhold
  is re-keyed, not removed: a binding taken off an unprovable read is still
  deferred on its own account. This completes the object-identity marking class
  at its last writer, after bug 0194 (0.113.0) closed the two loop arms; the two
  loop arms, the withholding posture and the by-reference return of
  `#memberType` / `commonType` are untouched. GOV-15 addition arm under the
  *Diagnostic-registry carve-out*: a registered *Trigger* becomes reachable at a
  wider input class with the registry byte-unchanged, no code added or renamed and
  no *Message* reworded. New witness
  `tests/let-arm-withhold-binding-scoped.test.ts` (32 rows: the suppression and
  its three controls, the alias / inline / primitive shared-object shapes, the
  seven reach rows, the seven fences, and the seven `resultBindings` provenance
  rows); cell `d6` of `tests/loop-element-withhold-binding-scoped.test.ts` and
  cell `u13e` of `tests/fn-arg-type-mismatch-wired.test.ts` restated as the
  emissions they bounded; additive registration cell 57 in
  `tests/live/live-production-acceptance.test.ts`.

## [0.119.0] - 2026-08-19

### Fixed

- **bug 0202 — ceiling #4's three theta-value enforcement points measured the
  interpreter's carrier graph instead of the JSON document, so a conformant
  payload was refused with a message false of it.** `depthWalk` descends by
  `Object.keys`, and a named-enum variant's carrier is a boxed `String` whose own
  enumerable keys are its character indices, so a typed
  `invoke<array<array<array<array<Colour>>>>>` of a prompt-mode callee returning
  `[[[[Colour.Red]]]]` — whose JSON document is depth 5, which the cap admits —
  bound `Err(InvokeInfraError { cause: "return_validation", message: "JSON
  document depth exceeds 5" })`, while the byte-identical payload crossed the
  child-side gate and the same annotation over a plain `string` bound `Ok`. The
  callee's `mode:` frontmatter therefore selected the outcome, which
  `invocation.md:36` gives it no authority to do. A new bounded walk,
  `wireFormDepthWalk` (`src/runtime/wire-form-depth-walk.ts`), measures the
  payload's WIRE FORM under `schema-subset.md:24–30`'s counting algorithm,
  classifying every node through the shared `classifyWireNode` bug 0201 exported
  so the carrier decision stays single-sourced; it fast-fails at the cap before
  classifying, so CIO-3's prohibition on unbounded recursion holds, and it
  accumulates the same RFC-6901 pointer `InvokeDepthBreach.issue.path` is typed
  for. All three theta-value enforcement points consult it — `invoke<T>` return,
  `invoke(...)` `params`, and code-driven `<name>(args)` — so the metric is
  uniform and no divergence remains. The two parsed-JSON points
  (typed-query response, model-driven tool args) and the slash-load `params` arm
  keep `depthWalk`, which stays byte-frozen and carrier-free: no carrier is
  reachable at any of them. `MAX_JSON_DEPTH` stays 5, the five enforcement points
  stay five and unreordered, and every message, `schema_keyword`, `cause` and
  destination surface is unchanged — only the metric a ceiling applies is
  corrected toward the spec's own counting algorithm. Locked by
  `tests/invoke-depth-wire-form-metric.test.ts` (22 cells over the real
  prompt→prompt attach cell and the three seams, with wire-depth-6 fences
  pinning the pointer at every moved gate) and by H8a live cell 56, whose two
  prompt→prompt legs assert the absence of a fail-closed note for the depth-5
  payload against its depth-6 sibling's presence.

## [0.118.0] - 2026-08-19

### Fixed

- **bug 0201 — neither of the subagent envelope writer's two bounded walks
  descended a `Result`, so a payload whose non-finite `number` or whose depth
  was contributed only from inside a nested carrier crossed unrefused.** A
  `mode: subagent` callee whose terminal value was `[Ok(1 / 0), 1]` wrote an
  `ok` envelope carrying `null` where the callee produced `Infinity`, with an
  empty diagnostic drain — bug 0180's fabrication class alive through the one
  carrier its walk declined to enter — and `[Ok([[[[[1]]]]]), 1]` crossed as a
  document of depth 8 where `[[[[[[1]]]]]]` at depth 7 refused
  `JSON document depth exceeds 5`. The cause was shared: `firstNonFiniteNumber`
  (bug 0180's search) and `wireFormExceedsDepthCap` (bug 0187's depth walk) each
  carried an `isResultValue` arm that returned without descending, while
  `serializeOkEnvelope` reached `JSON.stringify`, which descends the carrier —
  the brand is a non-enumerable symbol but `ok` and `value` / `error` are own
  enumerable string keys. Both walks now classify every node through one shared
  exported wire-form classifier, `classifyWireNode`, and carry no carrier arm of
  their own: a boxed `String` enum carrier classifies as the scalar its wire
  form is (the deliberate divergence from `depthWalk`, preserved), and a
  `Result` classifies as the record its own enumerable keys spell, counted as
  one level exactly as `JSON.stringify` counts it. A carrier-contributed
  non-finite `number` now refuses by name with
  `theta/runtime/subagent-return-value-not-representable` and a wire-form
  RFC-6901 pointer (`/0/value`, `/0/error`, `/0/0/value`), derived from the
  encoding by the descent rather than spelled by hand; a carrier-contributed
  over-cap depth now refuses with ceiling #4's canonical message and no code.
  Both walks keep their `level > MAX_JSON_DEPTH` fast-fail as the first
  statement, so CIO-3 holds with no cap-raising change and no materialised copy
  of the payload. `[Ok(1), 1]` (wire depth 3) still crosses — the walks gained
  reach, not strictness — and a `Result` at a position already past the cap
  still refuses on its position. Bug 0188's sign class is unaffected: a
  `Result`-carried `-0` still round-trips sign-intact, because
  `stringifyPreservingNegativeZero` owns rendering while these walks decide only
  refusal. Same-commit: PIC-59's *Result-carriage bound* rewritten in place
  (anchor kept) and its three qualification sites moved; the registry *Trigger*
  widened citing the GOV-15 diagnostic-registry carve-out, with no new code and
  a byte-identical reference mirror; and `runtime-value-model.md`'s "a `Result`
  value never crosses the wire", with its `type-system.md` mirror, scoped to the
  wires where it holds. Locked by a new 24-cell witness spanning the seam, the
  real child-side writer and real spawned children, plus H8a live cell 55.

## [0.117.0] - 2026-08-19

### Fixed

- **bug 0188 — `-0` crossed the subagent return envelope as `+0` while the
  prompt→prompt attach leg bound it unchanged, so the callee's `mode:`
  frontmatter selected the sign of the value the caller bound.** `0 * -1`,
  `-1 * 0`, `0 / -1` and the literal `-0` each parse with `[]` diagnostics and
  evaluate to `-0`, and theta code observes the sign through division —
  `1 / (0 * -1)` is `-Infinity` where `1 / 0` is `Infinity`, and
  `expressions.md:232` names `-Infinity` among division's specified results.
  `serializeOkEnvelope(-0)` was `{"theta_result":{"v":1,"ok":0}}`, the parent
  re-read `+0`, both legs validated `{"ok":true}` under `number`, `integer` and
  `number | null`, and nothing emitted a diagnostic, a runtime event or a
  `theta-system-note`. JSON was not the reason: `JSON.parse("-0")` recovers `-0`
  at the root, at a field and in an array — the hole was the WRITER, and no
  `replacer` or `toJSON` hook can make `JSON.stringify` emit the sign.
  `serializeOkEnvelope` now serialises through `stringifyPreservingNegativeZero`
  (`src/runtime/subagent-envelope.ts`), which emits the `-0` form the JSON
  grammar already admits, so both legs bind the callee's own sign and
  `invocation.md:36`'s mode-invariance holds. Pass 1 is `JSON.stringify` with an
  identity replacer that only records whether a `-0` leaf was seen, and its bytes
  are the emitted bytes whenever none was — so every payload not carrying `-0`
  emits byte-identical bytes to 0.116.0. Pass 2 substitutes a collision-free
  per-document sentinel for each `-0` leaf and replaces the quoted token with the
  bare `-0`. Detection rides `JSON.stringify`'s own traversal, so the writer adds
  no payload walk to bound (CIO-3) and the reach includes a `-0` leaf inside a
  nested `Result` carrier. The parent, the driver, `parseEnvelopeLine`, the
  envelope shape, the key set, the arm discrimination and the pinned version `v`
  are unchanged: a number leaf's rendering within the same JSON grammar is not an
  envelope-schema change, stated normatively in PIC-59's `Ok`-values bullet
  alongside the completed account of what crosses the envelope. 0180's
  finiteness-only refusal predicate is NOT widened — `-0` is admitted
  deliberately and the writer preserves it — and 0187's depth refusal still runs
  first. GOV-15 observable (a) moves on the subagent leg only, toward the prompt
  leg; the prompt legs, the untyped `invoke(...)` discard, the five rendering
  boundaries (`${z}` still renders `0`), equality (`+0 == -0` stays `true`) and
  every operator are untouched. Locked by
  `tests/subagent-envelope-negative-zero-fidelity.test.ts` (28 cells: both legs
  over the shipped seams at the root, at a schema field, at an array element, at
  depth and inside a `Result`; the caller-side reciprocal as the harm cell; a
  22-row byte-identity corpus; sentinel-collision, depth-order, detection and
  rendering-boundary fences), by additive `-0` round-trip rows in
  `tests/subagent-envelope.test.ts`, by 0180's two re-pinned fence cells and its
  `negVal` row over real spawned children, and by H8a live cell 54, whose
  outbound query text names `-Infinity` where it named `Infinity` before.

## [0.116.0] - 2026-08-19

### Fixed

- **bug 0187 — PIC-59's fail-closed MUST said a terminal `Ok` payload carrying a
  non-finite `number` "anywhere within it" refuses, and the shipped search
  stopped at `MAX_JSON_DEPTH`, so past the cap a caller bound a value its callee
  never produced.** `firstNonFiniteNumber` is bounded by the ceiling-#4 cap —
  deliberately, because unbounded recursion in the envelope writer is forbidden
  — and the safety argument for that bound leaned on the typed `invoke<T>`
  return boundary refusing a deeper payload anyway. One boundary has no such
  gate: a `tools:`-declared `.theta`-callable call whose callee's return type
  inference names none, where `#validateInvokeReturn` returns before the
  ceiling-#4 walk. Measured over real spawned children, a `mode: subagent`
  callee whose tail is `[[[[[[1 / 0]]]]]]` settled
  `{"ok":true,"value":[[[[[[null]]]]]]}` with `diagnostics: []` at its caller,
  where the byte-identical value one level shallower refuses by name; and a
  FINITE payload past the cap crossed the same boundary unchecked. The child now
  refuses an over-deep terminal `Ok` payload at the envelope writer
  (`mapTooDeepReturnValue`, `src/runtime/subagent-envelope.ts`), BEFORE the
  non-representability search and before `serializeOkEnvelope`, carrying ceiling
  #4's own canonical `JSON document depth exceeds 5` message on the existing
  `cause: "return_validation"`. Depth is measured over the payload's WIRE FORM by
  a bounded fast-failing walk that mirrors the non-finite search's carrier arms,
  so a boxed-`String` enum carrier — whose character indices `JSON.stringify`
  never writes — does not inflate the count and `[[[[Colour.Red]]]]` still
  crosses. The refusal happens before the value leaves the child, so it reaches
  every parent: typed, uninferred, untyped, and a slash-dispatch boundary
  (one SLSH-3 `theta-system-note` where there was silent success). **No
  registered diagnostic code is added** — a ceiling-#4 breach carries none at any
  of its five enforcement points, and PIC-59 already ships a child-side
  fail-closed class that mints none. The envelope writer validates nothing and
  compiles no schema, so ceiling #4's five-site AJV table, CIO-3's enumeration
  and PIC-1's mask-domain table are unchanged. Same-commit corrections: PIC-59's
  two false bullets, a new *Fail-closed over-deep `Ok` payload* requirement with
  its anchored *Result-carriage bound*, the
  `theta/runtime/subagent-return-value-not-representable` registry *Trigger*
  (whose "crosses it unrefused" clause is now false), the walk's doc-comment
  (whose scoped-gap paragraph is deleted), and the `return_validation` gloss.
  `#validateInvokeReturn`, `#resolveReturnSite`, `inferCalleeReturnAnnotation`,
  `src/runtime/depth-walk.ts`, `src/runtime/invoke-ceiling-depth.ts` and
  `src/runtime/wire-translation.ts` are byte-untouched, and bug 0180's two
  witnesses stay green (the 27-cell file changes by comment only, re-pinning its
  `CONTROL (FENCE-DEPTH)` cell under this report's authority).

## [0.115.0] - 2026-08-19

### Fixed

- **bug 0184 — a literal ARM of a MIXED union lowered to the EMPTY schema at all
  four `Type` positions instead of `docs/spec_topics/schema-subset.md:79`'s
  `{ "const": <value> }`.** `Sev | "high"` lowered
  `{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}`, and an empty arm is a schema AJV
  admits every JSON value against — so a real `AjvSchemaValidator` over the
  lowered `params:` document accepted `"zzz"`, `7`, `true`, `null`, `[]` and
  `{}` for a param the author had closed to one enum plus one string, at all
  three consumers (the binder envelope, the post-default-merge revalidation and
  the subagent child's params intake), while `relaxParamsSchema` copied the same
  empty arm into the model-facing envelope. Since the bug 0172 face-2 dispatch
  (0.102.0) the empty arm had a second consequence: the enum tag a body binds
  depended on arm ORDER, because an empty arm admits everything and therefore
  wins whenever it is written first — `"high" | Sev` bound `"high"` AND `"low"`
  as bare untagged strings where `Sev | "high"` tagged both. The lowering pass
  reached the literal rows only from the TOP of a type source: both union-arm
  recursions (`lowerTypeExpr`'s per-arm call and `lowerBraceGroupUnionArms`'s
  non-brace-arm call) re-entered `lowerTypeExpr`, which owns no literal
  sublanguage and returns `{}` from its trailing catch-all, and
  `isUnspellableTextRefusable` declined literal-shaped sink entries, so the loss
  was silent at every position. Both recursions now consult the literal
  sublanguage per arm, gated to a MIXED arm set (one carrying at least one
  non-literal arm), so a literal arm lowers `{ "const": <value> }` and the union
  enforces exactly the value set its arms declare; the tag now follows the value
  rather than the arm order. A bare `null` arm keeps the primitive reading
  (`Sev | null` stays `{"type":"null"}` at its arm, `string | null` keeps the
  collapsed `{"type":["string","null"]}`), a `true`/`false` arm is byte-unchanged,
  and an ALL-literal union — including one reached through a generic argument
  (`array<"x" | "y">`) — is byte-unchanged everywhere.
  `isUnspellableTextRefusable` and its three readers are byte-unchanged: the
  premise they rest on became true. No diagnostic was added and no lowering
  became more permissive.

  **Behaviour change to note.** A theta that loaded cleanly still loads cleanly
  with the same (zero) diagnostics, but a mixed-literal-union param now REFUSES
  values no declared arm admits at invocation time, an `@<T>` annotation over
  such a union now constrains the model to the declared set, and the
  content-addressed names both hash the lowered fragment — so
  `__theta_respond_<slug>` and any `__inline_<slug>` carrying such a field
  re-mint. No committed `.theta`/`.thetalib` is in that class (all four
  `|`-declaring fixtures are all-string-literal unions), so no shipped fixture's
  slug moves.

## [0.114.0] - 2026-08-19

### Fixed

- **bug 0197 — a `params:` default whose member-access head resolves but names
  no enum (`sev: 'Sev = Box.sev'` against a declared `schema Box`) loaded with
  zero diagnostics and every invocation omitting the field bound WITHOUT it —
  the declared default silently evaporated, and the success echo claimed the
  fill (`sev=null (default)`).** Two composed remedies. (1) The load gate's
  `member` arm gained its third arm: a head that RESOLVES in the whole-file
  identifier root scope and names no declared `enum` now draws
  `theta/parse/default-not-literal` at the field's own range, the offending
  sub-expression rendered as its byte-exact source span — the RHS derives no
  `NamedValueLit` (the head fails the production's own side condition), so the
  row's registered Trigger already covers the form; the enum arm keeps running
  first (a same-file `schema X` shadowing `enum X` still resolves the head
  against the enum — bug 0191's open question is recorded, not decided), and
  the unresolved-head arm keeps `theta/parse/unknown-identifier` (bug 0140's
  body-position code question stays unassumed — no evaluator arm, no root set
  touched). `frontmatter-fields-a.md` §Defaults re-derived in the same commit:
  the head condition's two failure modes split — resolves-to-nothing is a NAME
  question, resolves-to-non-enum is a SHAPE question. (2) Echo honesty: the
  `(default)` tag is now read from `fillDefaultsAndRevalidate`'s own
  `defaultedWireNames` report instead of being recomputed from the theta's
  declared defaults, so a field the recovery could not produce a value for
  renders untagged instead of claiming a fill that did not happen. Witness
  grown 14 → 28 cells (cell C — the fence bug 0185 installed for exactly this
  flip — rewritten as the load-refusal row under this report's authority);
  additive live H8a cell. Defaulted fields stay out of the lowered schema's
  `required` set; the recovery's never-throws contract and its best-effort
  arms keep their end state.

## [0.113.0] - 2026-08-18

### Fixed

- **bug 0194 — a withhold recorded for one loop variable suppressed a later,
  provable loop's true `theta/parse/fn-arg-type-mismatch`, because the two loop
  arms marked an element object they had BORROWED rather than minted.**
  `unprovableBindings` is keyed by object identity, and the object each loop arm
  marked was shared for the whole parse: `collectTypeEnv` builds one
  `CompatType` per alias declaration and `unfoldAlias` returns it by reference,
  `collectSchemaFields` builds one per declared field, and
  `paramsFieldBindings` seeds one per `params:` field. So one unprovable loop
  marked the shared element and every later loop over the same alias, declared
  field or `params:` field read that mark back and had its judgement withheld —
  order-dependent, across `fn` boundaries, and silent on every channel, since
  the set's only read makes `checkFnCallArgs` skip the row. Both arms wrote to
  the one set and suppressed across each other in both directions. A new shared
  `TypeLayerWalk.bindLoopElement` now serves both arms and records and marks a
  fresh twin of the element when, and only when, the iterand is not a proof, so
  the mark is reachable from exactly one scope entry — the invariant the set's
  own doc comment already asserted. The twin inherits the `Result`-provenance
  membership of the object it copies, so bug 0079's static
  `theta/parse/interpolated-result` gate is unmoved. A provable loop is
  unchanged. The withhold itself survives for genuinely unproven iterands, and
  the typed-`let` sink, which reads the bindings map by value, is unmoved.
  Programs with a suppressed mismatch now draw the registered `E` and are denied
  registration — GOV-15's addition arm under the diagnostic-registry carve-out,
  with a byte-unchanged registry. Locked by 30 new offline cells
  (`tests/loop-element-withhold-binding-scoped.test.ts`) covering all three
  shared-object families, the four-way arm matrix and the non-reaching fences,
  plus one additive H8a live cell for the registration consequence.

## [0.112.0] - 2026-08-18

### Fixed

- **bug 0192 — a `params:`-declared binding carried no declared type into the
  type-layer walk, so twelve registered `E`-severity checks were unreachable on
  every read of a frontmatter parameter and `theta/parse/non-array-iterand`
  refused a spec-legal `for y in xs` over a declared `array<string>`.**
  `checkTypeLayer` received the `params:` field wire names, passed them to
  `collectLocalBinderNames` — bug 0050's shadowing `Set<string>`, which cannot
  carry a type — and then started the top-level walk with an empty bindings map,
  so a `params:` identifier typed through the nominal identifier fallback as
  `named "<its own spelling>"` and every judgement sink deferred on it. The
  byte-identical `fn`-parameter spelling of the same body reported all twelve.
  The one sink that refuses rather than defers on an unresolvable name,
  `checkForIterand`, drew an `E` on `for y in xs` over a declared `array<string>`
  — rendering the binding's own identifier in the message's `<type>` slot — and
  an `E`-severity `theta/parse/*` denies registration, so a program
  `control-flow.md:13` admits did not load.

  The parameter now carries both halves in one record array
  (`ParamsFieldSource`, the field's body-visible name beside its declared type
  source). The name half feeds `collectLocalBinderNames` unchanged; the type half
  seeds the root `bindings` map through the same `annotationToCompatType` that
  `walkFn` uses for an annotated `fn` parameter, so the `params:` and
  `fn`-parameter positions decide identically by construction —
  `type-system.md:15` puts them in one annotation-position list. Twelve registry
  rows become reachable (`non-boolean-condition`, `let-rhs-type-mismatch`,
  `fn-arg-type-mismatch`, `unknown-method`, `integer-narrowing`,
  `question-on-non-result`, `non-orderable-operands`, `non-string-array-join`,
  `non-string-object-index`, `non-indexable-receiver`,
  `object-field-type-mismatch`, `array-element-type-mismatch`) and the false
  `non-array-iterand` stops firing at both loop arms. Bug 0190's fn-argument
  member-read sink composes with it: a params-rooted `g(p.s)` now reports.
  Inline-object-typed and `enum`-typed `params:` fields keep deferring exactly as
  their `fn`-parameter controls do, and the lexical layer's
  `theta/parse/unknown-identifier` is unmoved. No registry row, severity or
  message changed; no shipped `.theta` / `.thetalib` fixture changes registration
  in either direction.

## [0.111.0] - 2026-08-18

### Fixed

- **bug 0190 — the wired `theta/parse/fn-arg-type-mismatch` sink withheld on
  every member-read argument, because `provableArgType`'s `case "member"` shared
  one unconditional `return undefined` with `case "method-call"`.** Bug 0136
  (0.106.0) made a member read's static type the receiver's *declared field
  type*, but the argument sink's own proof gate still refused the operand: `fn
  g(n: integer)` called as `g(p.s)` with `p.s` declared `string` reported `[]`,
  while the identical mismatch spelled as an annotated parameter or an annotated
  `let` reported the `E` code, and the sibling typed-`let` and constructor-field
  sinks reported it on that same member read. Nothing downstream recovered the
  check — the registry row states no runtime net applies, and `evalUserFnCall`
  validates arity only — so a theta whose mistyped member-read argument went
  unreported carried no `E` and registered.

  The shared arm now **splits**. `case "method-call"` keeps `undefined` and the
  half of its premise that is still true (a `named` minted from the METHOD name
  is no proof); `case "member"` admits exactly bug 0136's resolved branch — a
  proof exists when, and only when, the receiver is itself a proven read and the
  read resolves to a declared field type on a resolved object schema. Both of
  that arm's fallbacks stay unproven: the receiver's own `named` for an
  unresolvable receiver, and the field-name mint for an absent field, a
  fields-less declaration or a declined `typeSource` — that mint can resolve
  against an unrelated declaration sharing its spelling, and `expressions.md`
  assigns an absent theta-side name a runtime `theta/runtime/missing-object-key`
  panic rather than a parse `E`. The provenance the sink needs comes from the
  substrate, not from a second copy of the rule: `StaticTypeInferencePass` gains
  a private `#memberType` returning the type together with whether it is
  declared, which `#typeExpr`'s `case "member"` and a new public
  `declaredFieldType` both delegate to — one resolution site, and the `fields`
  record still has exactly two readers. The receiver-proof half of the predicate
  is load-bearing: without it an erased receiver launders its erasure through
  the field lookup, and `let m = flag ? A { s: "x" } : B { s: 1 }` then `g(m.s)`
  draws a false `E` on a program whose runtime value the declared parameter type
  accepts.

  An object-schema-typed field is admitted as a proof (TYPE-10 makes the
  declared `named` the value's type, and the typed-`let` sink already judged it),
  so the three sinks now agree on one operand. The widening travels to all three
  consumers of the predicate: a proven member-read initialiser is no longer
  marked unprovable at the unannotated-`let` guard, and a proven member iterand's
  element is a proof at both the plain-`for` and `par for` arms. `case "call"` /
  `case "invoke"` keeps its rule, `static-type-inference.ts`'s
  `case "method-call"` is byte-untouched, `checkFnArgCompat` is unchanged, and no
  registry row moved — the row's *Trigger* already covered the argument class
  with no operand-kind restriction, so this is the GOV-15 diagnostic-registry
  carve-out's addition direction, discharged by measurement.

## [0.110.0] - 2026-08-18

### Fixed

- **bug 0182 — an off-session `@`-query overflow reached the theta author as
  `Err(TransportError)` with both token counts dropped, because the off-session
  fold fabricated the one classifier input the overflow gate reads.**
  `classifyOffSessionReply` wrote a literal `httpStatus: 200` into its
  `classifyProviderResponse` input, so bug 0065's widened anthropic / mistral
  gate (`httpStatus === 400 || httpStatus === null`) was unreachable at every
  off-session seam: the fold delivered no `null` for the widened arm to admit,
  and its own fabricated 200 was a captured non-400 status, which vetoes a match
  under a row whose gate names HTTP 400. A real
  `prompt is too long: 220044 tokens > 200000 maximum` therefore bound
  `Err(TransportError)` where the identical bytes at `httpStatus: null` classify
  `Err(ContextOverflowError { tokens_used: 220044, tokens_limit: 200000 })`.
  The fold now presents the status the seam actually captured
  (`captured?.status ?? null`), and each of the three off-session `complete()`
  call sites — `offSessionComplete`, the free-phase dispatch and the forced
  respond dispatch — registers its own per-invocation `onResponse`, which is the
  correction bug 0011 already made to the binder at 0.26.0. Author-visible
  change: an off-session overflow against `anthropic-messages` / `mistral` now
  takes the `ContextOverflowError` `match` arm with both counts populated
  (QRY-10). `provider-error-mapping.md`'s "the runtime registers `onResponse` on
  every `complete()` call" is true for the first time — all four call sites now
  do — and its cross-reference names the off-session sites alongside the
  binder's. Measured live, not derived: the `openai-completions` adapter
  withholds `onResponse` on an HTTP 400 (`ONRESPONSE FIRINGS: []`, against
  `[200]` on a success), so an openai HTTP-400 overflow off-session now
  classifies `transport` — the outcome that page already specifies for a
  no-status openai response, previously masked by the fabrication.

## [0.109.0] - 2026-08-18

### Fixed

- **bug 0185 — a `params:` default naming a variant its enum does not declare
  loaded with zero diagnostics and then aborted every invocation.**
  `sev: 'Sev = Sev.Missing'` against `enum Sev { High = "high", Low = "low" }`
  parsed clean, lowered, and registered, because `checkVariantAccess` had
  exactly one call site — inside the body's own structural walk — so the
  `params:` default position never reached it. Every invocation then spent its
  binder model call, entered `#mergeDeclaredDefaults`, and threw:
  `resolveEnumVariant` answered `undefined`, the pure evaluator's `member` arm
  fell through to `evaluateMemberAccess(null, "Missing")`, and the run ended
  `theta /<name> aborted: null member access: .Missing` at the zero body range —
  under a runtime code whose registered trigger is `expr.field` on a `null` the
  author never wrote, naming neither the enum, the variant nor the `params:`
  line, and against `#mergeDeclaredDefaults`'s own doc-comment contract that the
  recovery "never throws". Supplying the argument explicitly panicked
  identically, because recovery iterates `defaultedFields` before
  fill-if-absent. Two changes, composed. The `params:` default RHS is now
  re-parsed at the one position that holds the parsed fields, the body's hoisted
  enum-variant sets and the whole-file identifier roots at once, and an
  `Enum.Variant` failing either of `NamedValueLit`'s grammar side conditions
  draws the body expression grammar's own code there — `theta/parse/unknown-variant`
  for an undeclared variant of a declared enum, `theta/parse/unknown-identifier`
  for a head that resolves to nothing — at the field's own range, before
  registration and before any binder call. And `#recoverDeclaredDefaults` now
  absorbs a `ThetaPanic` from a default's evaluation (re-raising every other
  throw, so `HostFatal` and the runtime-defect surface are unaffected), leaving
  that field unfilled: the fourth best-effort case reaches the same end state as
  the three the doc-comment already enumerated, which is what makes the sentence
  true. A resolvable variant keeps its current bytes at every position — the
  annotated field, both object spellings, the array element, the union arm, the
  load-time compatibility deferral row, and the live binder cell — and a wire
  string outside the variant set stays a value question, still refused at the
  post-default-merge AJV hook. Locked by
  `tests/params-default-unresolvable-enum-variant.test.ts` (14 cells: the four
  unresolvable positions plus the bare-object spelling, the case-mismatched
  variant, the unregistered-enum head, the supplied-argument row, the
  non-aborting invocation row for the one spelling the parse gate does not
  pre-empt, the one-diagnostic-per-field precedence row, a range oracle, and
  three fences) and by a new zero-model-turn H8a live cell driving the real
  discovery-to-registration path with a precondition control and a
  resolvable-variant sibling.

## [0.108.0] - 2026-08-18

### Fixed

- **bug 0114 — a `Result` nested inside an interpolated array or object was
  serialised as its interpreter-private `{"ok":…,"value":…}` carrier and sent
  to the model.** QRY-18's discriminator was derived once, from the whole
  interpolated value, so `stringifyInterpolation` returned
  `JSON.stringify(translateInterpolationOutbound(…))` for the `array` and
  `object` arms before bug 0079's runtime raise was reachable, and the lowering
  itself classified nothing: a `Result` carries `RESULT_TAG` rather than
  `SCHEMA_TAG`, so no schema resolved and the carrier's own `ok` / `value` /
  `error` keys were copied through. Twelve sources — `${[Ok(1)]}`, a `par for`
  value interpolated whole (the one composite CTRL-3 defines as an array of
  `Result`s), a schema value whose `array<integer>` field holds an `Ok`, and
  the depth variants — loaded with zero diagnostics, raised no panic, and put
  the brand's carrier keys in the prompt text. `translateInterpolationOutbound`
  now records a reach when it meets a branded `Result` at any depth —
  classified by `isResultValue`, the non-enumerable brand, never by the
  `{ ok, … }` shape (bugs 0017/0020) — and `stringifyInterpolation` discards
  the lowered tree and routes the value through the `Result` arm bug 0079
  already wired, so the sole runtime raise stays sole and the sole static
  emission is untouched. The reach rides the recursion the lowering already
  performs, so no new depth walk exists to bound under CIO-3. The QRY-18 spec
  silence is closed in the same commit: a new note under the stringification
  table states that containment does not change the disposition and that a
  container's own static type is never `Result<T, E>`, so this is the runtime
  arm of the existing static/runtime split; the
  `theta/parse/interpolated-result` Trigger takes a DIAG-2 widening naming the
  nested sub-case (Message byte-unchanged per DIAG-4, GOV-15 engaged in the
  addition direction under the diagnostic-registry carve-out), and
  `docs/reference/frontmatter.md` names the runtime arm. No load flips and no
  shipped fixture changes bytes. Locked by 27 additive cells on bug 0079's
  witness (`tests/interpolated-result-gate.test.ts`, 49 total) and an additive
  H8a live cell.

## [0.107.0] - 2026-08-17

### Fixed

- **bug 0126 — a plain `for` body never bound its loop variable, so nine
  registered `E`-severity type-layer checks could not fire on it.**
  `TypeLayerWalk.walkStmt`'s `case "for"` walked the body with a copy of the
  enclosing scope and recorded the iteration variable only as bug 0050's
  withheld twin, so every judgement sink deferred on a read of it — while the
  `par for` arm, one keyword away, derived the element type from the same AST
  node and reported all nine on the identical body. The arm now records the
  TYPE-11-unfolded iterand's element type whenever the iterand unfolds to an
  `array`, marking the record unprovable when the iterand is not itself a
  proof, and keeps the withheld twin for a non-`array` iterand so the binder
  classes this change does not own keep deferring.
  `theta/parse/unknown-method`, `mixed-plus-operands`,
  `non-indexable-receiver`, `integer-narrowing`, `non-string-array-join`,
  `non-boolean-condition`, `non-orderable-operands`, `let-rhs-type-mismatch`
  and `object-field-type-mismatch` now reach a plain-`for` loop variable, as
  does `fn-arg-type-mismatch` by composition with bug 0050's wiring. The
  companion spec silence is closed in the same commit: `control-flow.md`'s
  `for` paragraph states that the loop variable's static type is the iterand's
  element type `T` under TYPE-11, with a non-`array` iterand leaving it
  unresolvable so body checks defer, and the `par for` reuse enumeration and
  both `grammar.md` loop-variable bullets mirror it. GOV-15 is engaged in the
  addition direction under the diagnostic-registry carve-out, following the
  0031 → 0084 precedent chain; the registry and both its mirrors are
  byte-unchanged. Locked by a new 53-cell offline witness
  (`tests/plain-for-loop-variable-element-type.test.ts`), an additive H8a
  live cell, and the deliberate inversion of bug 0089's `n1` tripwire.

## [0.106.0] - 2026-08-17

### Fixed

- **bug 0136 — a member read was typed by the field's *name*, not the field's
  declared type, so eight registered `E`-severity checks stopped firing on
  `p.field` while a ninth refused a spec-legal `for y in p.xs` outright.**
  `#typeExpr`'s `case "member"` returned `{ kind: "named", name: node.field }` —
  a nominal type spelled with the field identifier. That name resolves to no
  declaration, so every consumer classifying it through the `TypeEnv` answered
  `"unknown"` and deferred: `p.s.frobnicate()` loaded and aborted with
  `theta/runtime/internal-error`, `p.xs.join(",")` on an `array<integer>` field
  returned `"1,2"` by JS coercion, and a `number` field flowed out of an
  `integer`-annotated binding. `checkForIterand` does not defer, so it refused
  `for y in p.xs` over a field declared `array<string>` at `E` severity — five
  receiver spellings, registration denied, with the field identifier rendered in
  a `<type>` placeholder (`got xs`). Because a fabricated name is lookupable, an
  unrelated declaration sharing the spelling was adopted as the expression's
  type: `enum Color { Red }` beside `schema Red = array<integer>` is two
  well-formed declarations, and `Color.Red.join(",")` drew
  `theta/parse/non-string-array-join` where the same file without the schema drew
  nothing — against `schemas.md:97`'s written "`Enum.Variant` … is statically
  typed as `Enum`".

  The arm now resolves the receiver, unfolds it (TYPE-11), and returns the
  declared field's type when the receiver resolves to an object schema carrying
  that field — reusing the existing own-key guard and named-declaration reader,
  not a third one. When the receiver resolves to no declaration the arm returns
  the receiver's own nominal type, which yields `schemas.md:97`'s answer for
  `Enum.Variant` structurally, with no enum-name source and no new read, and is
  the inert answer for every other unresolvable receiver. An absent field, a
  schema carrying no field record, and a field whose annotation did not convert
  all keep deferring, so `expressions.md:9`'s `theta/runtime/missing-object-key`
  panic for an absent theta-side name is untouched. The object-index result type
  (`expressions.md:10`) stays unimplemented and the sibling `call` /
  `method-call` / `ident` arms are byte-unchanged.

### Changed

- `docs/spec_topics/expressions.md` — the *Member access* bullet now states the
  static result type of `obj.field` (the receiver's declared type for that
  field, with TYPE-11 applying to it as elsewhere), closing a spec silence and
  discharging the *Indexed access* bullet's closing clause. Mirrored in
  `docs/reference/grammar.md` in the same commit. Thirteen existing registry
  rows change reachability under the
  `source-language-stability.md:25` diagnostic-registry carve-out; no row is
  added, removed or re-triggered, and the committed-corpus sweep over both
  `.theta` and `.thetalib` shows zero flips.

## [0.105.0] - 2026-08-17

### Fixed

- **bug 0180 — a typed `invoke<T>` whose `Ok` payload carried a non-finite
  `number` got opposite verdicts by the callee's `mode:`, and at a null-admitting
  position the two legs bound different values in silence.** `1 / 0` is a
  specified theta value (`expressions.md:232`, `runtime-value-model.md:8`), JSON
  has no form for one, and `JSON.stringify` answers `null` — so the subagent
  leg's return envelope carried `{"theta_result":{"v":1,"ok":null}}` and the
  caller either bound a `null` the callee never produced (`invoke<number | null>`,
  a nullable schema field) or was refused with a message blaming the annotation
  it had satisfied (`invoke<number>`). Per bug 0180 §Fix route **(b)** the child
  now establishes representability before it serialises: `mapNonRepresentableReturnValue`
  (`src/runtime/subagent-envelope.ts`) searches the terminal `Ok` payload in
  document order for the first non-finite `number`, depth-bounded by the
  ceiling-#4 JSON-document cap per CIO-3, and `driveSubagentRootRegime`
  (`src/extension/production-theta-producer.ts`) emits an **err** envelope
  carrying `Err(InvokeInfraError { cause: "return_validation" })` — naming the
  value and its RFC-6901 position — plus the new registered diagnostic, instead
  of an `ok` arm holding a substituted `null`. The prompt→prompt attach leg is
  byte-untouched and still admits the callee's own value; PIC-59 now states that
  residual mode-variance normatively.

### Added

- **`theta/runtime/subagent-return-value-not-representable`** — the registered
  diagnostic for the child-side refusal above
  (`docs/spec_topics/diagnostics/code-registry-runtime.md`, mirrored in
  `docs/reference/diagnostics.md`). Message:
  `subagent return value is not JSON-representable: <value>`, the sole
  placeholder being the existing category-2 runtime-value `<value>` rendered per
  the canonical interpolation-stringification table. PIC-59's fail-closed
  inventory gains the matching requirement bullet.

### Changed

- **PIC-59's `Ok`-values premise, corrected in spec and in code.**
  "(JSON-representable by construction)"
  (`docs/spec_topics/pi-integration-contract/subagent.md`) was false for a
  non-finite `number`; representability is now stated as established rather than
  assumed, and the same claim is corrected at `serializeOkEnvelope` and
  `EnvelopeOk`. `queryerror-variants.md`'s `"return_validation"` gloss is
  broadened to cover the child-side refusal (no enum member added or moved), and
  `#validateInvokeReturn`'s copy-on-change doc-comment is narrowed so it is true
  of a container holding a `NaN`.

## [0.104.0] - 2026-08-17

### Fixed

- **bug 0179 — an `array<T>`-declared sink refused every value whose static
  type the parser leaves nominal.** `decide`'s TYPE-7 array arm
  (`src/parser/type-compat.ts`) answered `incompatible` for any sub whose kind
  was not `array`, and it runs 53 lines ahead of the arm that answers
  `unknown` for a `named` sub the type environment cannot resolve. Every
  expression the inference pass records no type for — a method call, a member
  read, a `fn` call, an `invoke`, an index into a non-array-typed target — is
  such a sub, so `R { ks: p.keys() }`, `let ks: array<string> = p.keys()`,
  `R { ks: q.xs }` where `q.xs` is declared `array<string>`, and `R { ks: f() }`
  where `fn f(): array<string>` were all refused at load with
  `theta/parse/object-field-type-mismatch: … expected array<string>, got keys`
  — a message naming a method where a type belongs. The same expression at a
  `string`, `boolean` or `fn`-parameter sink was admitted, and when the refused
  theta was a spawned subagent child's root the refusal cost the child its
  registration.

  The array arm now answers `unknown` for exactly that sub, as
  `type-system.md` §"Unresolvable operands" requires — the parse-time check is
  skipped and the runtime AJV check is the safety net — and the element-wise
  recursion inherits the deferral, so an unresolvable element type defers too.
  A resolvable named schema, a primitive, a literal and a mismatched `array`
  keep refusing with byte-identical messages. No diagnostic code, registry row
  or spec sentence changed.

## [0.103.0] - 2026-08-16

### Fixed

- **bug 0181 — a `params:` default authored as `Enum.Variant` was refused by the
  post-default-merge AJV check**, so the spelling
  `frontmatter-fields-a.md:67` supplies as its own worked example
  (`severity: Severity = Severity.Medium`) could not be invoked.
  `#recoverDeclaredDefaults` evaluated the default's literal through the theta's
  own body environment, so `Sev.High` resolved to `makeEnumValue`'s boxed
  `String` (`typeof` `"object"`), and `fillDefaultsAndRevalidate` handed that
  carrier to the compiled validator unchanged. AJV's `type: "string"` check is a
  `typeof` test, so `{"type":"string","enum":[…]}` refused the runtime's own
  filled default: the slash invocation ended `bound: false` behind
  `theta /<name>: argument binding produced invalid args — /sev must be equal to
  one of the allowed values; /sev must be string`, the theta never started, and
  the binder model call that produced a correct `ok` envelope was already spent.
  The refusal was representational, not semantic — the same field defaulted to
  the bare wire string bound and reached body scope tagged.

  The recovered default is now projected to wire form at recovery, so the merged
  `args` are homogeneous wire form throughout — what the AJV step assumes and
  what `DefaultedField.defaultValue` already contracted for. The declaring-enum
  tag and the schema brand are re-established downstream by the binder-`args`
  inbound boundary `runtime-value-model.md:34` already mandates, which bug 0172
  face 2 (0.102.0) taught to dispatch a lowered `anyOf` position under its
  first-admitting arm — so a union-typed enum default binds tagged too.

  Fixed at every named-enum position the merged document reaches: the annotated
  field, a named-enum field of a schema-typed default under both admitted object
  spellings, an array element, and a union arm. Nothing that bound before binds
  differently: the bare-wire-string default's echo text, the fill-if-absent
  control and the schema-brand control are byte-identical, and a default whose
  VALUE is outside the variant set still refuses — the gate became
  representation-blind, not value-blind. The load-time deferral
  (`type-system.md:48`, `tests/params-default-type-compat.test.ts` row c6) is
  untouched and still loads silently; its own fixture now binds at invocation.

## [0.102.0] - 2026-08-16

### Fixed

- **bug 0172 face 2 — a value inside a lowered `{"anyOf":[…]}` arm received no
  enum tag, no schema brand and no descent**, so adding `| null` to an
  annotation silently disabled the inbound wire-name-translation rule for that
  whole subtree: `invoke<Sev>` handed the parent a tagged variant while
  `invoke<Sev | null>` handed it a bare string, and `Box | null` arrived
  unbranded with its nested named-enum field untagged. The sidecar the walk
  reads is keyed by JSON Pointer and `anyOf` has no image in the data space the
  way `properties` and `items` do, so nothing in the lowered fragment named
  which arm governed a materialised value — which made the dispatch a
  specification question rather than a coding one. The rule is now written into
  `runtime-value-model.md` §"Wire-name translation" and `schema-subset.md`
  §"Lowering Algorithm" step 5: at a union position the walk re-tests the
  validated value against each arm in the SUBS-1 source order the lowered
  `anyOf` already carries, through the same content-addressed compiled-validator
  cache the boundary's own verdict came from, and translates under the first arm
  that admits it — two arms both admitting is settled by arm order, and no arm
  admitting leaves the value exactly as it arrived. The step-5 sidecar gains a
  fifth *Union arms* map carrying each arm's self-contained lowered document
  alongside the declaring `enum` name or `$defs` entry the pass translates
  under, and the runtime threads its validator to all four inbound boundaries
  the rule names. The dispatch never subtracts: a value that arrives branded
  never comes out unbranded. Anonymous string-literal-union arms still receive
  no tag (`Severity.Low == "low"` stays `false`), the outbound direction is
  unchanged, and the `params:`-defaults bypass and `Result` identity
  pass-through are untouched. Face 1 shipped in 0.97.0; this closes the report.

## [0.101.0] - 2026-08-16

### Fixed

- **bug 0178 — a `mode: subagent` callee with a non-bypass `params:` block could
  not run inside its own spawned child.** The load-time binder-model gate
  refused any theta whose `params:` block is not binder-bypass-eligible (a named
  `enum` or `schema` type, any non-`string` type, more than one field, any
  default) when neither `bind_model:` nor the `theta.binderModel` setting
  resolved. Inside a spawned subagent child that refused the one theta the child
  was launched to run: PIC-60 marshals such a callee's params structurally and
  skips the binder entirely, so the gate enforced a precondition for a call the
  process cannot make. The child's `-p "/<slug>"` then stopped being a command,
  the host sent it to the model as prompt text, one unbudgeted assistant turn
  ran, and the process exited 0 with no `theta_result` envelope — leaving the
  parent to report `subagent child exited without a return envelope: exited code
  0`, an exit detail rather than the cause. Whether a callee worked therefore
  depended on an unrelated setting read from the operator's own files.

  The load pass now skips binder-model resolution for exactly the marked root
  theta of a spawned subagent child — the same predicate
  (`isSubagentRootFor`) by which the slash dispatch already short-circuits into
  `driveSubagentRootRegime` ahead of the binder, so the exempt set and the
  binder-skipping set are one set. The strict-capability probe is skipped with
  it. The ordinary slash surface is unchanged: a non-bypass theta with no
  resolvable binder model still fails to load with
  `theta/load/binder-model-unresolved`, with the same message, in an ordinary
  session.

  Independently, a child that fails to register its marked root slug — for any
  load- or parse-time reason — now writes the PIC-59 envelope itself, carrying
  `Err(InvokeInfraError { cause: "load_failure" })` whose message names the
  refused slug and the refusing diagnostic's code and message. **Operators and
  tooling matching on the old text should note the change:** that path
  previously surfaced `cause: "internal_error"` with `subagent child exited
  without a return envelope: exited code 0` and minted
  `theta/runtime/subagent-exit-without-envelope`; it now surfaces the named load
  failure and mints no parent-side diagnostic, because the envelope arrived.
  Emitting the envelope does not stop the host from processing the argv prompt —
  that handling is the host's — but the parent settles on the envelope as soon
  as it is written.

  Spec amended in the same commit, since the behaviour is conditioned on the
  regime: `binder-model-and-context.md` §*Binder model* (new anchor
  `#binder-model-subagent-root-exemption`), `subagent.md` PIC-60 and a new
  PIC-59 *Marked-root registration refusal* requirement, plus the pages that
  restate the refusal rule (`frontmatter-fields-a.md`, `code-registry-load.md`
  Trigger, `package-and-settings.md`, `capability-inventory-items.md`,
  `host-prerequisites.md`, `implementation-notes.md`) and the
  `docs/reference/` mirrors. No diagnostic code was added and the `QueryError`
  enum is unchanged.

  Locked by `tests/subagent-root-binder-model-exempt.test.ts` (real spawned
  children, offline and provider-free: every non-bypass `params:` shape returns
  its marshalled value with two stdout lines and no model turn, including
  through a `tools:`-named grandchild) and
  `tests/subagent-root-registration-refusal-envelope.test.ts` (the refusal
  envelope at the composition seam, with the slash-surface lock beside it). The
  first also discharges bug 0172's child-side `bindParamsInbound` witness, which
  this defect had blocked.

## [0.100.0] - 2026-08-16

### Fixed

- **bug 0065 — `ContextOverflowError` was unreachable for
  `anthropic-messages`.** The `anthropic-messages` pi-ai adapter does not fire
  `StreamOptions.onResponse` on an HTTP-400 error response — the SDK call
  throws before the callback runs — so every anthropic 400, a real
  `prompt is too long` included, reached the classifier with `httpStatus:
  null`. The overflow signature matched and `overflowStatusGateSatisfied`'s
  `httpStatus === 400` arm then refused it, so a definite refusal surfaced to
  theta code as `TransportError { retryable: true, http_status: null }` — an
  author's `Err(ContextOverflow(e))` arm never fired against the default
  provider, and the one machine-readable retry hint invited a retry of a
  request that cannot succeed. Two elements, both shipped:
  - The status gate now admits the no-HTTP-response class: the shared
    `anthropic-messages` / `mistral` / `mistral-conversations` arm reads
    `httpStatus === 400 || httpStatus === null`, the posture the `amazon-bedrock`
    arm already had, restricted to that class rather than to any status. A
    CAPTURED non-400 status still vetoes, so an HTTP-200 response carrying
    overflow wording stays the `openai-completions` body-envelope case and does
    not leak.
  - Token extraction scans the provider's own message, not the formatted
    envelope. `extractOverflowTokens` first narrows `errorMessage` to its
    *provider-message window* — the last `"message": "…"` member, or the whole
    string when there is none — and applies the unchanged exactly-two-runs rule
    to that window. The pi-ai-formatted string prefixes the HTTP status and
    appends the whole JSON body including `request_id`, so the previous
    whole-string scan produced seven numeric runs on a live overflow and fell
    back to `null` for both counts; worse, on a two-run envelope it could read
    the HTTP status itself as `tokens_limit`. A real overflow now yields
    `tokens_used` / `tokens_limit` populated from the provider's own numbers.

  The anthropic adapter's non-firing is now MEASURED rather than assumed, and
  `docs/spec_topics/pi-integration-contract/provider-error-mapping.md` records
  it: the *Classifier input surface* carve-out names the CONDITION (no captured
  HTTP status) instead of a single provider, the `anthropic-messages` overflow
  row reads "HTTP 400, or no captured HTTP status", and *Overflow token-count
  extraction* states the provider-message-window step bytes-in/values-out. A
  new live cell (`tests/live/provider-error-revalidation-gate.test.ts`) is the
  mechanical form of that page's *Re-validation gate*: it measures zero
  `onResponse` firings on a cheap deliberate 400, one `status: 200` firing on a
  success, and a real over-length prompt classifying `context_overflow` with
  both counts populated. `mistral` shares the widened gate by construction; no
  mistral credential exists in this environment, so its live behaviour remains
  unmeasured and nothing claims otherwise.


## [0.99.0] - 2026-08-16

### Fixed

- **bug 0097 — a `params:` right-hand side read a top-level union of object
  arms as ONE inline field list.** `lowerParamsFieldType` asked the positional
  question — first character `{`, last character `}` — where the `@<T>`
  annotation root, the `schema X = …` alias right-hand side and a `schema` body
  field all ask the structural one, so `p: "{a: integer} | {b: integer}"` was
  handed whole to the inline-object hoist and minted
  `{"a":{"anyOf":[{},{}]}}` — a required property `a` constrained by nothing,
  under `additionalProperties: false`. AJV then refused `{"p":{"b":1}}`, the
  author's own second arm, at all three consumers of the lowered document
  (binder envelope, post-default-merge validation, subagent child params
  intake), and bound `{"p":{"a":null}}`, which matches neither arm. The same
  dispatch swallowed the diagnostic: a `NamedType` inside a brace-group arm
  reached no resolution, so `p: "{a: Ghost} | {b: integer}"` loaded with zero
  diagnostics where the identical text at two other positions refused the
  theta. `lowerParamsFieldType` now asks `isSingleEnclosingBraceGroup` and,
  behind it, takes the per-arm union dispatch: each brace-group arm of a
  brace-balanced segment set hoists on its own terms and the rest lower
  through `lowerTypeExpr`, combined per SUBS-1. The four `Type` positions now
  share one predicate pair and one arm dispatch, so one source text mints one
  `__inline_<slug>` wherever it is written, and a name inside an arm refuses
  the theta at `params:` as it already did elsewhere. A source that is one
  enclosing brace group keeps its route and its bytes; a shredded segment set
  and a malformed brace-suffixed source move from wrong to permissive, never
  the reverse.

### Fixed

- **bug 0174 — a typed `invoke<T>` of a `mode: prompt` callee failed
  return-validation for every named-enum position.** `makeEnumValue` builds an
  enum value as a boxed `String` so that `JSON.stringify` yields the bare wire
  string, which makes its `typeof` `"object"`. On the in-process prompt→prompt
  attach cell no process boundary intervenes, so that value reached the
  `invoke<T>` return-value AJV gate still boxed and
  `{"type":"string","enum":[…]}` refused it — the caller got
  `Err(InvokeInfraError { cause: "return_validation" })` with no diagnostic,
  where the byte-identical callee body as `mode: subagent` crossed the PIC-59
  `JSON.stringify` envelope, arrived as a JSON primitive and returned `Ok`. The
  gate now AJV-validates a wire-form projection of the payload and hands the
  callee's OWN value — boxed carriers and schema brands intact — to the
  post-AJV inbound translation pass and on to the caller, so the two cells
  present AJV the same shape while the caller still receives the callee's own
  object. The projection collapses the boxed enum carrier and nothing else, it
  renames nothing, and it is copy-on-change: a payload carrying no enum value
  anywhere reaches the seam as the same reference it always did. Root,
  object-field, array-element and `anyOf`-arm positions all validate now, and an
  already-tagged value passes through a union arm with its tag intact rather
  than being re-derived — the arm-dispatch question bug 0172 face 2 owns is not
  touched. The subagent leg's verdicts are unchanged. `invocation.md`'s
  mode-invariant return surface and `runtime-value-model.md`'s enum row are
  unchanged: this was a runtime defect, not a specification one, and the fix
  also corrects the gate's own doc-comment, which asserted an invariant the
  measurement falsified.

## [0.97.0] - 2026-08-15

### Fixed

- **bug 0172 (face 1) — `runtime-value-model.md` §"Wire-name translation" states
  the inbound rule once and closes its boundary set at four, but the runtime
  performed it at one: typed query results, typed `.theta`-callable tool-call
  returns and binder `args` each bound the AJV-validated payload directly.** A
  named-enum position therefore arrived as a bare string and a schema-typed
  object unbranded, so `v == Sev.High` read `false` where the same value reaching
  theta code through the one wired boundary read `true`, with nothing emitted on
  any diagnostic channel. All three now perform the pass after their own AJV
  verdict and before the value binds. The typed-query loop's terminal
  forced-respond return and its respond-repair arm converge on one outcome, so a
  single call covers both. The `.theta`-callable boundary had no runtime schema
  at all — `tool-calls.md` §"Return type" types it by inference over the
  statically resolved callee — so the invoke trampoline now carries a
  three-arm return typing and resolves a `.theta`-callable call's type against
  the CALLEE's declarations, while `invoke<Schema>` keeps resolving against the
  caller's and a bare `invoke(...)` still derives nothing. Binder `args` are
  translated at both projections: the parent-side bind and the child-side
  marshalled-params intake. Face 2 of that report — a value inside a
  `{"anyOf":[…]}` arm — is untouched and the report stays open for it: no
  sentence supplies an arm-dispatch rule, so there is nothing to implement yet.
- **bug 0120 (order half) — the inbound rebuild walked the validated payload's
  own key order, so a named-schema value rebuilt from MODEL output reported
  `keys()` in the model's order where `expressions.md` fixes it to declaration
  order.** The lowering pass's per-schema sidecar now carries a field-order list
  — that `$defs` entry's own object-body field names, theta-side, in declaration
  order — and the rebuild emits every field the list names first, in that order,
  then every remaining payload key in the relative order the payload carried:
  the same discipline `buildObjectSchemaValue` already applies at construction,
  so the two provenances of one schema's value agree. The order is established at
  the rebuild and nowhere else; no read path sorts. A sidecar carrying no list —
  a permissive root, a `$defs` entry with no object body — preserves payload
  order unchanged. `docs/spec_topics/schema-subset.md`'s Lowering Algorithm step
  5 and its `docs/reference/` mirror record the list and the rule. The brand
  half is unchanged: `brandSchemaValue` remains the only installer and the tag
  remains a non-enumerable symbol.

## [0.96.0] - 2026-08-15

### Fixed

- **bug 0173 — `rebuildInbound` and `lowerOutbound` built their records as plain
  object literals and filled them by `result[key] = …` over key strings the
  payload supplies or the schema author declares, so a key spelled `__proto__`
  reached `Object.prototype`'s inherited setter instead of minting an own
  field.** An object-valued entry became the rebuilt record's prototype and a
  primitive-valued one was discarded outright; either way the field was absent
  from the value the runtime handed to theta code, with nothing emitted on any
  diagnostic channel. Both records are now built with `Object.create(null)`, the
  construction rule this corpus already applies at five sites
  (`src/parser/type-layer-checks.ts`, `src/parser/params.ts`,
  `src/extension/invoke-static-checks.ts`), so such a key is an ordinary own
  enumerable key: `Object.keys` reports it, `JSON.stringify` emits it, and the
  record's prototype stays `null`. The reads needed no new guard and the code now
  says why — this module's three per-position lookups are `Map`s and its payload
  walk is `Object.entries`, so nothing in it answers through a prototype chain.
  No observable change for any payload whose keys do not collide: same own keys,
  same insertion order, same `JSON.stringify`, same `valuesEqual` verdicts and
  same `keys()` / `values()` / `has()` answers, each asserted by a control cell
  rather than assumed. Locked by nine additive cells in
  `tests/wire-translation-inbound-retag.test.ts`, six of which red without the
  change; bug 0067's three landed witnesses stay green byte-for-byte.
  `docs/spec_topics/runtime-value-model.md` §12, §34;
  `docs/bugs/0173-inbound-rebuild-record-not-null-prototyped.md`.

## [0.95.0] - 2026-08-15

### Fixed

- **bug 0132 — the committed-fixture parse gate's walk filtered
  `entry.name.endsWith(".theta")`, so neither committed `.thetalib` was lexed or
  parsed by any offline test, and it took its corpus from the working tree
  rather than the index, so its own vacuity guard required the gitignored
  `.pi/theta/smoke.theta` to be present.**
  `tests/committed-fixture-parse-gate.test.ts` is the repository's only offline
  gate over committed theta sources, and two shipped fixes (0095, 0079) had each
  delegated a corpus-wide "no shipped source moves" claim to it and then paid
  for the `.thetalib` half with a scratch probe they deleted — the gate scored 32
  of 34 tracked sources, and the one registered code reachable only from a
  library (`theta/parse/thetalib-top-level-statement`) sat outside the corpus
  entirely. The gate now takes its corpus from the git index —
  `git ls-files -z -- '*.theta' '*.thetalib'`, less the seeded-invalid
  directory — so the same commit gates identically on a fresh clone and on a
  developer machine carrying local `.pi/` state, and an untracked scratch
  `.theta` can no longer join the corpus or red the gate. The vacuity guard names
  a committed precondition instead of an untracked file: exact per-extension
  counts whose failure message tells a fixture-adder which constant to bump in
  the same commit, membership of the H7a fixture and of both committed
  libraries, and an assertion that no corpus member lies under `.pi/`. `git`
  being unavailable, a cwd that is not a repository, a non-zero status or a
  signal all fail loudly naming the unmet precondition — never a skip, never a
  fallback to a working-tree walk. A second red-proof cell materialises a
  malformed `.thetalib` and pins `theta/parse/thetalib-top-level-statement`,
  giving the added extension the red-proof `AGENTS.md` requires. `AGENTS.md`
  gained the obligation in text: the gate covers every committed theta source of
  both extensions, and a corpus-wide claim in a fix record is discharged by it
  rather than by a scratch probe. Gate 34 → 36 cells (1 guard + 33 shipped, 31
  `.theta` + 2 `.thetalib`, + 2 red-proofs); no `src/**` change, no new
  registered code, no spec edit.

## [0.94.0] - 2026-08-15

### Fixed

- **bug 0064 — the binder's `options.temperature = 0` was a hard HTTP 400 on the
  Anthropic models that deprecated the field, so every non-bypass `params:`
  theta bound to one of them spent both budgeted binder calls and terminated on
  `argument binder unavailable` without running its body.**
  `buildBinderCompleteCall` wrote `temperature: 0` into every binder
  `complete()` call with no placement gate beside the ones the forced tool
  choice and the seed field already carried. `claude-sonnet-5` — the model this
  repo's own live-suite preference rule resolves first — answers that field with
  `400 invalid_request_error` ("`temperature` is deprecated for this model.");
  the classifier routes the 400 to the transport class, the single transport
  budget re-issues the identical request, and the second failure surfaces as the
  *Binder model transport failure* note. `src/binder/binder-temperature.ts` now
  holds a static per-(api, model-id) placement table with a build-time
  `Api`-coverage gate — the same `apiCoverageFailures` assertion that guards the
  provider seed-field table — and the binder writes `temperature: 0` only for
  pairs the table does not list as refusing it, omitting the key entirely
  otherwise. The refusal set is measured, not derived: a live census at HEAD
  found `claude-sonnet-5` and `claude-fable-5` refusing while `claude-opus-5`,
  newer than both, accepts, so no family or newest-model rule holds. The table
  is a spec artefact — §Binder temperature placement mapping on
  `pi-integration-contract/provider-error-mapping.md`, beside the seed-field
  table — and every page that pinned `temperature: 0` unconditionally
  (`binder/determinism-cancellation-failure.md` §Determinism,
  `pi-integration-contract/binder-inference.md`, `implementation-notes.md`,
  `binder/binder-model-and-context.md`, `version-bump-triggers.md` step 6) was
  conditionalised in the same commit, with §Determinism now stating what
  determinism means when the field is omitted: theta pins byte-identical input,
  and byte-identical output stays a provider property. Locked by five additive
  `cka-34` cells in `tests/binder-inference-provider-mapping.test.ts` (two
  omission cells plus three controls that forbid the table degrading to an
  api-scoped or id-only rule), one additive `Api`-coverage cell in
  `tests/version-bump-gates.test.ts`, and the doc-prescribed live witness — H8a
  cell 36 in `tests/live/live-production-acceptance.test.ts`, which derives its
  `bind_model:` from the shared live-model preference rule instead of hardcoding
  one and asserts the `bind_echo` success note with no `argument binder
  unavailable`. The H9a acceptance area (d) binder reach now re-derives its
  `bind_model:` from the same rule at spawn time rather than pinning an older
  model.

## [0.93.0] - 2026-08-15

### Fixed

- **bug 0159 — a malformed entry inside an inline object type masked every
  repeated field name written behind it, and a nested interior that never closed
  masked them in every enclosing body.** `theta/parse/duplicate-inline-field-name`
  compared the field-name positions the type grammar itself parsed as
  `Ident ":"`, and that retention stopped at the interior's first malformed
  position — so `{a: integer, : x, a: boolean}`, `{a: 1 a: 2, a: 3}` and
  `{p: {c: 1, : y, c: 2}, p: 3}` loaded with zero diagnostics at all eight `Type`
  positions while both lowerers, which split the same interior as text, went on
  minting the last-wins property and the duplicate `required` entry the rule
  exists to refuse. At the `@<T>` annotation root that fragment IS the compiled
  document, so a real `AjvSchemaValidator.compile` still threw
  `schema is invalid: data/required must NOT have duplicate items` after the
  model turn had been spent. The comparison is now re-keyed onto the lowerers'
  own tokenisation — `splitTopLevel(interior, ",", "angle-and-brace")` plus
  `topLevelColon`, the very functions `hoistInlineObjectType` and
  `lowerInlineObject` call — keyed on each entry's raw pre-colon text after
  `trim()`, so a repeated key at parse is by construction a repeated `required`
  entry at lowering. No lowerer changed, no parser recovery changed, and the
  generic-argument carve-out and the closing-brace requirement are unmoved.
- **bug 0161 — a quoted inline field name is admitted where the declaration
  spelling refuses it, and the duplicate spelling minted a quote-bearing
  property key beside a duplicate `required`.** Closed on that report's own §Fix
  route B by the same re-key: the key is raw text, so `{"a": string, "a":
  integer}` is one key written twice and is refused, while `{'a': string, "a":
  integer}` stays admitted as two distinct spellings. A single quoted field is
  route B's explicitly-open half and is recorded as a residual rather than left
  implicit.

### Changed

- **Diagnostics registry (DIAG-2, same commit as the code).**
  `theta/parse/duplicate-inline-field-name`'s *Trigger* is rewritten onto the
  new key: the three stop shapes and the enclosing-body cascade are gone, and
  the shapes sitting outside the row drop from three to two — a quoted name and
  an `as "WireName"` rename are now keys like any other, while a name reused in a
  nested inline object and a generic type argument's interior stay outside it.
  The *Message* is unchanged (DIAG-4). `<field>` gains a row-scoped carve-out in
  the placeholder table so this row's subject renders verbatim, on the precedent
  of `<X>`'s `{}` carve-out for `theta/parse/empty-schema-body`.
  `docs/spec_topics/grammar.md` §"Inline object types" and
  `docs/reference/grammar.md`'s `ObjectType` bullet move in lock-step.

## [0.92.0] - 2026-08-13

### Fixed

- **bug 0165 — a `params:` field whose `=` was followed by nothing loaded
  silently and then bound `null`.** `splitParamValue` cuts at the first
  top-level `=` and trims both halves, so `p: 'string = '` recorded a DEFINED
  but empty `defaultSource`; `hasDefault` is keyed on definedness alone, the
  field was dropped from `required` on the same test, and the block lowered.
  The one checker at that position returns no diagnostic when its parse yields
  no node — which is exactly what empty or whitespace-only text produces — so
  nothing refused the declaration. The shipped binder prompt then advertised
  `  p (string) default=` with no literal after it, invocation-time recovery
  could not parse an empty literal and filled nothing, and the body read the
  declared param as `null` for a field whose own lowered fragment answers
  `false` on `{"p":null}` — after a binder model call had already been spent.
  A `params:` default that is empty or whitespace-only now draws the new
  `theta/parse/default-without-literal` at load and the theta does not
  register. All four `=` spellings (`T = `, `T =`, `T =   `, `T=`) and all six
  YAML deliveries reach it, at every declared type. The refusal sits behind bug
  0059's type-half guard, so a field whose type half was already refused still
  draws exactly one diagnostic. Conformant defaults are untouched:
  `string = ""` still records `""` and renders `default=""`,
  `array<string> = []` still renders `default=[]`, `number = 3` still binds
  `3`, and `string` is still `required`.

## [0.91.0] - 2026-08-13

### Fixed

- **bug 0166 — a `params:` default could negate a non-numeric literal, and the
  theta then bound a number its source never spelled.** The Theta literal
  sublanguage derives `PrimitiveLit ::= … | "-" NUMBER` and no other unary
  form, but the is-literal check admitted unary `-` over any primitive literal,
  so `-true`, `-false`, `-null`, `-"x"`, `-'x'` and `- true` passed — at the top
  level, as array elements and as object field values. Because the compat
  reader mirrored that admission while the invocation-time recovery evaluates
  unary `-` as numeric negation, `p: 'integer | boolean = -true'` loaded with
  zero diagnostics and bound `p = -1`, `p: 'Count = -"x"'` bound `NaN` and
  `p: 'number | null = -null'` bound `-0` — behind a `default=-true` prompt
  token and a `p=-1 (default)` success echo. Both readers of the position now
  narrow through one shared numeric-operand predicate, so such a default draws
  `theta/parse/default-not-literal` at load and the theta does not register.
  The numeric carve-out is untouched: `integer = -1` still loads, records `-1`
  and binds `-1`; `integer = -1.5` still draws exactly one
  `theta/parse/integer-narrowing`.

### Changed

- `theta/parse/default-not-literal`'s registry *Trigger* now names the
  carve-out inline — "an operator other than the unary `-` carve-out for
  numeric literals" — matching the bound `grammar.md` §"Theta literal
  sublanguage" has always stated. A DIAG-2 clarification that moves no input
  into or out of the code's emission set; no *Message* column changed.

## [0.90.0] - 2026-08-13

### Fixed

- **bug 0067 — a `mode: subagent` callee's enum variant lost its declaring-enum
  tag crossing the PIC-59 envelope, so `v == Sev.High` read `false` in the
  parent where the identical value compared `true` in the child.** The inbound
  translation pass of `runtime-value-model.md` §"Wire-name translation" — which
  that section names for `invoke` returns and states once for every inbound
  boundary — is now applied in `#validateInvokeReturn`, after AJV, for the typed
  `invoke<Schema>` form. A named-enum value regains its tag at the annotated
  root, at a schema field, and at an array element; an object of a declared
  schema regains its `SCHEMA_TAG` brand. The untyped `invoke(...)` form is out
  of domain: it returns `Result<null, QueryError>` and discards the callee's
  value by specification, so it carries nothing to translate. The pass re-tags
  and re-brands but never renames — the envelope is `JSON.stringify` of the
  callee's theta-side value, which is keyed by theta-side names regardless of
  any `as` renames the schema declares.

### Changed

- **`schema-subset.md` §"Lowering Algorithm" step 5: the per-schema sidecar
  carries three maps, not two.** The new one records, per position and on the
  same JSON-Pointer keying as the named-enum map, the `$defs` name that
  position's lowered form references. A `$ref` names the fragment it points to
  rather than the field carrying it — a field `manager: Person` references
  `$defs` `Person`, not `$defs` `manager` — so an inbound consumer cannot
  recurse faithfully by matching a position's name against a `$defs` key.
  Mirrored in `docs/reference/schema-subset.md`.

## [0.89.0] - 2026-08-13

### Added

- Oh-My-Pi host support (external PR #1, hknielsen): theta runs on the `omp`
  binary as a second host with the Pi path byte-identical — `HostCliDialect`
  makes the subagent child-argv launch contract intent-level (per-host flag
  spellings, an inexpressible intent stays an empty flag group, project trust
  deliberately unmapped on Oh-My-Pi); `FileSystem` gains `configDirName()` /
  `globalAgentDir()` so every conventional discovery/settings/package path
  resolves against the running host (relocated global agent directories
  included); `normalizeToolSnapshot` decodes `pi.getAllTools()` in either host
  shape (`ToolInfo[]` or bare names — unpublished information stays absent, no
  trust from an absent scope); `readPeerVersion` becomes a filesystem-only
  three-rung ladder (authored scope → `@oh-my-pi/` alias → in-process host-SDK
  `VERSION` for the four pinned peers only — compiled host binaries now load).
- The inherited `PI_THETA_*` control plane is authenticated against the real
  parent pid before any reader honours it
  (subagent.md `#subagent-control-plane-authentication`): env-planted control
  values (a repository `.env` a host loads) can no longer select the process
  regime, feed the hash verifier, or name an extension to load. Harnesses
  topping a chain write the parent-pid carriage beside the extension pin
  (AGENTS.md `#subagent-child-pins`).

### Fixed

- Bug 0167: an absent conventional discovery root is silent — DISC-2's
  clean-leaf-`ENOENT` walk no longer converts "the host config directory does
  not exist" into a spurious `theta/load/unreadable-source` warning per root
  per pass (the conventional-root exemption; explicit `--theta` / settings
  references keep the clean-leaf distinction, and a root that exists but
  cannot be read still warns).
- Bug 0168: the executable-resolution ladder's rung-1 existence check answers
  `false` for a `process.argv[1]` inside a compiled host binary's own embedded
  filesystem (`isEmbeddedFsPath`), so a compiled-binary install spawns the
  host binary directly (rung 2) instead of handing the child an unopenable
  embedded path as a stray positional argument.
- Bug 0169: the child-side subagent model pre-flight (PIC-62 obligation 2)
  matches the fully-qualified `provider/id` reference — a registry serving one
  model id through several providers no longer reads as ambiguous-therefore-
  unresolved and no longer refuses every child.
- Bug 0170: `--system-prompt` is emitted newline-prefixed so neither host can
  path-coerce the interpolated `system:` text into reading a named file's
  bytes as the child's system prompt; an empty prompt stays empty so the host
  default still applies.
- Bug 0171: the marshalled-params env patch names BOTH carriers on every
  launch (the unused one explicitly cleared), so a nested callee can no longer
  silently run on its caller's inherited `PI_THETA_PARAMS`; the callable-hash
  carrier follows the same rule (cleared when a launch marshals none).
- The missing-file half of bug 0013's recorded settings contradiction is
  resolved the registry row's way: an ABSENT settings file is silent
  (`theta/load/settings-unreadable` fires only for a file that exists and
  cannot be read), matching the row's registered trigger and the files'
  documented optionality.

## [0.88.0] - 2026-08-08

### Fixed

- Bug 0066 (also discharging bug 0163): the post-default-merge AJV verdict is
  now consumed — `runBinder` routes a failing merged-`args` validation through
  the AJV-on-`args` failure note (`theta /<name>: argument binding produced
  invalid args — <ajv-summary>`) and refuses to start the body, instead of
  discarding the verdict behind the `Running /…` success echo; hard-ceiling
  #4's depth walk runs at the same hook before AJV (CIO-3), the hook runs
  whenever a lowered `params:` schema is presented (no-defaults and
  recovery-failure paths included), `<ajv-summary>` is canonically ordered
  (ERR-14), and the unreachable, wire-shape-violating
  `crossRouteSlashLoadParams` seam is deleted in favour of the wired
  `classifyBinderArgs`. At load, a `params:` default literal is now checked
  against its declared type over an empty type environment —
  `theta/parse/integer-narrowing` for number-under-integer, the new registered
  `theta/parse/params-default-type-mismatch` for every other decidable
  mismatch; named/alias/literal-typed declared halves and non-flat or
  heterogeneous array defaults defer to the now-real runtime net (the
  partition is normative in the registry row's Trigger). Witnesses:
  `tests/binder-post-merge-ajv-enforcement.test.ts`,
  `tests/defaulting-post-merge-classification.test.ts`,
  `tests/params-default-type-compat.test.ts`, one additive real-binder-turn
  H8a live cell, and the rewritten ERR-16 masked-absence cell.

## [0.87.0] - 2026-08-08

### Fixed

- Bug 0061: type text that no `Type` production spells is no longer kept
  verbatim and lowered to the permissive `{}` in silence at the two `Type`
  positions inside a theta body. A `schema` object-body field type and a
  `schema X = …` / `schema X by f = …` alias/union arm now draw one
  error-severity `theta/parse/schema-type-not-expression` per offending
  brace-free fragment, at the declaration's range, and the theta does not
  register — so `schema X = Cat +` (the operator absorbed into the arm) and
  `schema S { a: string | }` (the field-position dangling `|`) are refused where
  they previously loaded clean and validated nothing. The judgement is per
  FRAGMENT at every reach: the whole arm or field type, a union arm, a
  `GenericType` argument, and an inline `ObjectType`'s field type at any depth,
  at the `by`, `.theta` and `.thetalib` spellings alike; one diagnostic per
  fragment, no dedup.
- The judgement reuses bug 0059's `LowerCtx.unspellable` sink rather than making
  the type-grammar seam a recogniser, threaded at the two body positions through
  `collectUnresolvedNamedTypes`'s optional out-parameter, so the `@<T>`
  annotation, the `value` position (`let` annotations, `fn` parameter types) and
  the `return` position keep byte-identical lowered documents and byte-identical
  diagnostic sequences. Bug 0059's decline is now literally shared as one
  exported predicate, so a `LiteralType` atom or union arm and every
  brace-carrying fragment stay admitted at every position from one place; `{}`
  keeps bug 0045's `theta/parse/empty-schema-body` alone, and
  `schema S { a: -1 }` keeps it alone too because the malformed field list is
  dropped whole before any fragment reaches the judgement.
- Two guards keep the refusal to one diagnostic per scope and stop it
  cascading: a field or declaration that already drew an error-severity
  diagnostic in its own walk keeps that diagnostic alone (`void +`,
  `array<integer, integer> +`, `Result<…> +`, `enum["x"] +`, `Ghost | Cat +`),
  and a declaration `theta/parse/malformed-alias-rhs` already refused at parse
  time is skipped through a node-level flag (`Cat + 1`, `Cat . Dog`,
  `string+integer`, `Cat.a`, `string ++ integer` each keep exactly one). A junk
  fragment hiding an unresolvable name or a reserved keyword (`Ghost +`,
  `match +`) draws the refusal alone — bug 0044's mis-attribution is not moved.
- New registry row `theta/parse/schema-type-not-expression` (E, parse, DIAG-2,
  landed in the same commit as the sites it is raised from), with its *Trigger*
  written as the GOV-15 post-hoc in-scope set and its *Message*
  `'<X>' declares a type that is not a theta type expression` keyed to the
  existing category-7 `<X>` declaration placeholder, so the closed
  placeholder-rendering surface is untouched. Owning spec sentences in
  `schemas.md` (the field position, the alias position, and the
  absorbed-operator exclusion) and the `docs/reference/schema-subset.md` /
  `docs/reference/diagnostics.md` mirrors re-derived in the same commit.

## [0.86.0] - 2026-08-08

### Fixed

- Bug 0059: a `params:` field right-hand side that is a YAML scalar carrying
  text no `Type` production spells now refuses the theta at load with one
  `theta/load/params-type-not-expression` per offending field, instead of
  lowering the permissive `{}` with zero diagnostics while the binder prompt
  rendered the junk text as the declared type. The judgement is per brace-free
  fragment (top level, union arms, generic type arguments, hoisted
  inline-object field types at any depth); literal-shaped fragments (the 0056
  sublanguage) and brace-carrying fragments keep their own lowering, and a
  field draws at most one diagnostic (node-shape refusal > same-iteration
  error > text refusal > that field's default-side literal checks). Registry
  row *Trigger* widened in lock-step (DIAG-2); `frontmatter-fields-a.md` and
  the reference mirror re-derived. Under an operator grant recorded in the
  fix record, four fixture vehicles in bug 0060's lock were substituted with
  loading equivalents (render subject preserved, forged-byte reach now
  asserted) and four rows of bug 0102's lock moved to a labelled
  `TYPE_TEXT_REFUSED` table (its default-side rule untouched). Witness:
  `tests/params-scalar-nontype-text-refusal.test.ts` (93 cells) plus one
  additive H8a live registration-denial cell.

## [0.85.0] - 2026-08-06

### Fixed

- **The `params:` position now runs the literal sublanguage the other three
  type-annotation positions run, at every depth** (bug 0056). A `params:`
  field whose type is a literal or an all-literal union lowered the permissive
  `{}` / `{"anyOf":[{},{}]}`, so AJV accepted every JSON value for a field the
  author had constrained to a fixed set, while the same type text in a
  `schema` body, an alias right-hand side or an `@<T>` annotation lowered the
  enforcing `{"const": ...}` / `{"type":"string","enum":[...]}`.
  `parseLiteralArm` moves from `body-type-lowering.ts` to `params.ts` and is
  shared, and `lowerParamsFieldType` checks one emission ahead of its brace
  test, so all four positions agree by construction rather than by convention
  — including on the minted `__inline_<slug>` name, which one source text had
  been splitting into two. `null` is adjudicated a `LiteralType` for lowering
  at all four positions, so a `params:` `null` emits `{"const":null}`.
  Unchanged by design: a mixed union (`"x" | integer`), a literal union inside
  a generic argument (`array<"x" | "y">`), `T | null` for non-literal `T`, and
  every primitive, named type, `array<T>` and non-literal inline object.

## [0.84.0] - 2026-08-06

### Fixed

- **A repeated field name inside an inline object type was admitted at every
  `Type` position, dropping the author's first declaration and minting a
  duplicate `required` entry** (bug 0052). `grammar.md` §"Inline object types"
  gives an `ObjectType`'s fields "the same `Field` form as an object-schema
  body" and "the same field semantics", and `schemas.md` makes two fields
  sharing a wire name a refusal, so `schema S { a: integer, a: string }` was
  refused while the inline spelling of the same two fields was not:
  `{a: integer, a: string}` loaded with zero diagnostics at all eight `Type`
  positions and lowered a last-wins `properties.a` beside `required: ["a","a"]`.
  At the three hoisting positions AJV compiled and enforced that fragment; at
  the `@<T>` annotation root the fragment IS the compiled document, so
  `ajv.compile` threw `data/required must NOT have duplicate items` after the
  query turn had been spent, surfacing as an internal error rather than a
  diagnostic, and the respond tool advertised the invalid `required` to the
  provider verbatim.
  A repeated field name is now refused at parse, before any body is lowered,
  with the new `theta/parse/duplicate-inline-field-name`
  (`duplicate field name '<field>' within one inline object type`) — one line
  per repeated name, at that name's second position, in source order. The rule
  lives in the type-grammar walk's inline-object arm and joins the existing
  inline-object-shape rule set, so it reaches the `let` annotation, `fn`
  parameter and return types, schema body fields, alias/union arms, `params:`
  fields, the `@<T>` root and the `invoke<T>` return annotation — plus every
  nesting depth and both file kinds — with no new call site. A name reused
  between an outer inline object and one nested inside it stays two field lists,
  and a generic type argument's interior stays outside the rule. No lowering
  changed: the hoisted and annotation-root bytes are byte-identical for every
  input, the named-declaration spelling keeps `theta/parse/wire-name-collision`
  unchanged, and no `catch` was added at the validator seam — the throw is
  removed by refusing the input, not by framing the failure.

## [0.83.0] - 2026-08-06

### Fixed

- **The array/ternary common-type rule computed no least upper bound, so both of
  `expressions.md`'s own worked vectors were refused at load and a heterogeneous
  ternary silently typed as its first branch** (bug 0081, facets (a) and (c)).
  `expressions.md` §"Array construction" states the rule in three numbered cases
  and supplies two worked vectors; rule 2's third clause reads "otherwise the
  element types are unioned via TYPE-5 and TYPE-6 (`["a", null]` →
  `array<string | null>`; `[1, "a"]` → `array<number | string>`)", and
  `docs/reference/type-system.md` mirrors it. The implementation searched only
  for a branch that already dominated the others — exactly TYPE-1 and TYPE-2 —
  which structurally cannot express a result type that is not one of its inputs.
  The checker (`hasCommonType`) therefore collapsed rule 2's union case into
  rule 3's rejection and refused every heterogeneous sink-less literal, while
  the inference pass (`StaticTypeInferencePass.#commonType`) fell back to
  `candidates[0]` and typed the expression as whichever branch was written
  first. Measured: `let x = [1, "a"]` and `let x = ["a", null]` each drew
  `theta/parse/array-no-common-type`; `true ? 1 : "a"` then `x.length` drew
  `theta/parse/unknown-method` naming a member the receiver's real type has; and
  reversing the branch order changed which diagnostic fired.

  `hasCommonType` is replaced by one exported `commonType`
  (`src/parser/type-compat.ts`) parameterised over the `⊑` relation, which
  `checkCommonType` and `StaticTypeInferencePass.#commonType` now both call — so
  the checker and the inference pass cannot disagree about a candidate set by
  construction, which is the bug's §Fix constraint 3. It computes the LUB in the
  spec's own clause order: a dominating branch (TYPE-1 collapse, TYPE-2
  widening, an unresolvable branch non-blocking), else the union with arms
  verbatim in receiver-first order, except that a set holding an object branch
  with no dominating member has no common type — rule 3, which still draws
  `theta/parse/array-no-common-type` and is gated on branch KINDS by a new
  `isObjectBranch` (an alias-unfolded inline object, or a `named` resolving to
  an object-schema declaration). The union shape and arm order are mirrored on,
  not shared with, `concatElementType` (`src/runtime/stdlib-string.ts`), which
  treats an unresolvable operand as disjoint where the common-type rule treats
  it as non-blocking. No diagnostics-registry edit: the change narrows an
  emission set onto its registered *Trigger*.

  The computed spelling is `array<integer | string>` where the spec's worked
  vector prints `array<number | string>` — arms verbatim, strictly tighter, `⊑`
  the spec's spelling, and TYPE-2 is conditioned on mixing with `number`. Pinned
  as a disposition by the witness. The bug's facet (b) (a ternary caller for
  `checkCommonType`) and facet (d) (the `fn`-parameter sink at call sites) are
  deferred and recorded as residuals; facet (b) is blocked on a corpus
  self-disagreement about the registered *Trigger* that needs a DIAG-2
  adjudication.

  Locked by `tests/array-ternary-common-type-union.test.ts` (new, 21 cells,
  offline, registry-sourced messages, a loud precondition per absence cell) and
  by one additive H8a live cell in
  `tests/live/live-production-acceptance.test.ts` — an ADMISSION cell, the first
  in that file: a theta whose body holds `let x = [1, "a"]` must now register
  through the real production composition root, with a rule-3 theta that must
  still be refused as the control. Eighteen existing cells across five files
  were re-pinned to the widened behaviour.

## [0.82.0] - 2026-08-06

### Fixed

- **An uppercase-first schema field name and an uppercase-first `params:`
  frontmatter key each drew no diagnostic, so a spelling the spec refuses
  loaded, registered and ran** (bug 0149). `lexical.md` §Identifiers requires
  lowercase-first — a lowercase letter, or `_` — for four positions: "`let` and
  `let mut` bindings, function parameters, function names, and schema field
  names", and states the consequence without qualification: "Violating either
  rule is a parse error: … `theta/parse/binding-case-mismatch`". `schemas.md`
  repeats it on the page that owns the position ("the lowercase-first rule still
  applies to it") and names the `as "WireName"` rename clause as "the only
  mechanism" for a property name that is not theta-identifier-compatible,
  PascalCase among them. The registered *Trigger* names the position outright:
  "Identifier in a binding / parameter / fn-name / **field-name** position does
  not start with a lowercase letter or `_`." Three of the four positions were
  enforced — `let` / `let mut` and the `fn` name by the lexer's keyword scan,
  the `fn` parameter at the parser leaf since bug 0139 — and the field name was
  the fourth. It was silent for the reason the lexer's shape predicts: the scan
  inspects the identifier following a keyword token, and a field name follows
  `{`, `,` or a YAML `params:` indent, so no adjacency reached it, and neither
  parser leaf that held the token carried a case test. Measured:
  `schema S { Xs: string }` reported `[]` and registered, as did a two-field
  body, a second-field-only violation, an `as "WireName"` rename on an
  uppercase field, and the `.thetalib` route; a `params:` key `Topic: string`
  reported `[]` and registered while `let Topic = 1` in the same file drew the
  code, and it lowered to a JSON Schema property literally named `Topic`.

  `parseSchemaObjectBody`'s field loop and `extractParsedParams`' YAML key walk
  now each emit `theta/parse/binding-case-mismatch`, severity `error`, the
  registry *Message* byte-exact, ranged on the field name itself rather than on
  the declaration — the token's own range for a `schema` body field, the YAML
  key node's range for a `params:` key, which is not the value-node range that
  face's existing per-field diagnostic carries. Both reuse the lexer's own
  two-comparison case predicate rather than minting a second spelling, and the
  lexer is untouched. Each field of a body is checked, so a two-field violation
  draws two diagnostics at their own ranges. Both faces exclude a reserved
  keyword and a key that is not identifier-shaped, because the registered
  *Trigger* covers an **Identifier** in a field-name position and a reserved
  spelling is owned by `theta/parse/reserved-keyword-as-identifier` under a
  different spec sentence — the same precedence the rule's other four positions
  already apply. The field-name emission is confined to a field the parser
  actually accepts, so the object body's recovery arms and every code they emit
  are unchanged.

  Nothing else moves, and each is pinned by a witness row: the conformant
  spellings stay clean (`xs`, an `_` prefix, and the sanctioned
  `xs as "Xs"` rename, whose wire half the rule leaves free); the `enum`
  variant name, the `for` / `par for` variable and the `match` pattern binder
  stay silent, being governed by the other bullet or by no bullet; the wire-name
  rules keep their behaviour; the type layer's and the runtime's verdicts are
  untouched, with the new code appended in source order where a declaration is
  ill-cased. The inline object type's field name — the same `Field` production
  in any `Type` position — remains unenforced: its type-grammar tokens carry no
  range, so a field-name-precise diagnostic there needs a structural change.

  **Input classes newly refused (GOV-15 addition under the diagnostic-registry
  carve-out; no registry row, *Trigger*, *Message* or mirror is edited):** a
  `.theta` or `.thetalib` file declaring a `schema X { … }` field name whose
  first character is an uppercase letter `A`–`Z`, and a `.theta` file declaring
  a `params:` frontmatter field name whose first character is an uppercase
  letter `A`–`Z`. In both cases a reserved spelling (`Ok`, `Err`, `Result`) is
  excluded and stays clean. Measured against the committed corpus: all 34
  tracked `.theta` and `.thetalib` files, both `.thetalib` files walked
  explicitly, contain zero instances at either position — so the addition
  refuses no committed program.

## [0.81.0] - 2026-08-06

### Fixed

- **A reserved keyword used as a `fn` parameter name drew no diagnostic, so a
  spelling the spec refuses loaded, registered and ran** (bug 0148).
  `lexical.md` §"Reserved keywords" lists 32 spellings and states the
  consequence without a scope list — "Using one of these in identifier position
  is `theta/parse/reserved-keyword-as-identifier`" — and the registered
  *Trigger* is the same shape, "Reserved keyword used in an identifier
  position", naming no position at all. A `fn` parameter name is an identifier
  position by the grammar (`FnParam ::= Ident ":" Type`). The code's lexer
  implementation is `checkName`'s keyword arm, reached through a keyword scan
  with three branches — the identifier after `let` (past the `mut` skip), after
  `fn`, and after `schema` / `enum` — and a parameter name follows `(` or `,`,
  so the shape of the scan excluded it. Bug 0139's parser-leaf fix opened an
  emission at that exact slot for the lowercase-first *case* rule and guarded it
  on `pTok.kind === "ident"`, which is correct for that code, whose *Trigger*
  says "**Identifier** in a … parameter … position" — and is also why the one
  token kind the reserved-keyword code exists for was the one kind the guard
  removed. Measured: `fn h(let: string): number { 1 }` reported `[]`, as did 31
  of the 32 spellings at the same slot, across the unannotated, multi-parameter,
  trailing-comma, `subagent fn`, `.thetalib` and call-site forms. The token
  bound as the parameter name verbatim, the theta registered and ran, and the
  reserved spelling was rendered back to the author inside another registered
  code's message.

  `parseFn`'s parameter loop now classifies the name token in `checkName`'s own
  keyword-first order: a `keyword`-kind token draws
  `theta/parse/reserved-keyword-as-identifier` with the registry *Message*
  interpolated and ranged on that token, and the existing `ident` arm carrying
  bug 0139's case emission follows unchanged in an `else if`. A token is never
  both kinds, so the two arms are mutually exclusive by construction and bug
  0139's emission keeps its code, message, range and ordering. The check reads
  the lexer's own classification rather than minting a second reserved-word
  list, which keeps the contextual keywords `subagent`, `with` and `par` silent
  by construction. A loop-local guard keeps the new code off the `mut`
  modifier's recovery artefact, so `fn h(mut: string)` still reports
  `theta/parse/mut-on-immutable-context` alone. Nothing else moves: the three
  lexer adjacencies, bug 0044's type-position emissions, the type layer's own
  verdicts, and the six other identifier positions that remain silent by
  decision — the `for` / `par for` variable, the schema field name, the
  `params:` field name, the `enum` variant name and both `import` specifier
  forms — are untouched and pinned as such.

  **Input class newly refused (GOV-15 addition under the diagnostic-registry
  carve-out):** a `.theta` or `.thetalib` file declaring a `fn` — or
  `subagent fn` — parameter whose name is one of the 32 reserved spellings
  `let`, `mut`, `fn`, `if`, `else`, `for`, `in`, `while`, `break`, `continue`,
  `return`, `match`, `schema`, `enum`, `import`, `export`, `from`, `as`, `by`,
  `invoke`, `true`, `false`, `null`, `Ok`, `Err`, `Result`, `string`, `number`,
  `integer`, `boolean`, `array`, `void`. Measured against the committed corpus:
  34 tracked `.theta` / `.thetalib` files walked including `.thetalib`, four
  `fn` declarations carrying a parameter list, **zero** reserved-spelling
  parameter names — so no shipped example, fixture or library changes
  disposition. No registry row is added, removed or re-triggered: the code
  exists, its *Trigger* already covers this position, and its *Message* is
  rendered from the registry template, so DIAG-2 is not engaged and DIAG-4 is
  satisfied; the registry page and both `docs/reference/` mirrors are confirmed
  byte-identical by blob hash. Locked by a 44-cell offline witness
  (`tests/fn-param-name-reserved-keyword.test.ts`), whose twelve over-reach
  tripwire rows red if enforcement widens past the parameter name, and by an
  additive live H8a registration-denial cell, both proven red with the arm
  neutralised and green with it restored.

## [0.80.0] - 2026-08-06

### Fixed

- **`/` typed as its operands' common type instead of `number`, so `3 / 2` read
  `integer` and every `integer`-annotated sink accepted a fractional value in
  silence** (bug 0142). `expressions.md` §"Other arithmetic" fixes the result
  type of `/` without qualification — "`/` always produces `number` (no
  integer-division operator in theta 1.0)" — and states it twice in the same
  paragraph, once positively and once by taking `/` out of the operand-common
  widening it gives `-`, `*` and `%`. `#typeBinary` implemented the widening and
  not the exception: after two operator tests it fell to one line that reduced
  both operands to their common type, so `3 / 2`, `3 - 2`, `3 * 2` and `3 % 2`
  all read `integer` and the static type of a quotient was the static type of
  its left literal. The answer was concrete and resolvable rather than an inert
  fallback, so nothing deferred and every consumer decided on it: a typed `let`,
  a `fn` argument slot, a schema-constructor field, an `array<integer>` element
  and a `par for … max` operand all fell silent where the same body with a `1.5`
  literal fired, all five missed codes are `error` severity, and the affected
  theta registered and ran while the runtime bound `1.5` — or `Infinity` for
  `1 / 0` and `NaN` for `0 / 0`, both into `integer` bindings. The type layer
  reported this as a PROOF rather than a deferral: `provableArgType`'s exactness
  test is taken against the same inference rule that contradicted the spec, so
  it certified the contradiction.

  `#typeBinary` now carries a per-operator arm for `/` ahead of the common-type
  reduction, returning `number` unconditionally — the rule is on the operator,
  consults no operand, and has no exception for an exactly-divisible pair. The
  extension-layer sibling `collectProvableArgTypes` mirrors it, keeping that
  function's stated shape-for-shape invariant with the pass true rather than
  adding `/` as an exception to it. Nothing else moves: `+` (whose result type
  IS its operands' common type), the operand-common widening for `-`, `*` and
  `%`, `%`-by-a-literal-zero, `fn`-return-annotation checking, the common-type
  reduction itself and all three runtime `/` implementations are untouched and
  pinned as such.

  **Input class newly refused (GOV-15 addition under the diagnostic-registry
  carve-out):** a `/` expression reaching a position whose declared type is not
  `number` — an `integer`-annotated `let`, `fn` parameter, schema field,
  `array<integer>` element or `par for … max` operand, and a `string`- or
  `boolean`-annotated position reached by a non-numeric operand pair such as
  `"a" / "b"`, whose runtime value is `NaN`. Measured against the committed
  corpus: 34 tracked `.theta` / `.thetalib` files, **zero** containing a `/`
  binary operator, so no shipped example, fixture or library changes disposition.
  No registry row is added, removed or edited and no *Trigger* changes — every
  code the fix emits is already registered, already `error`, and already emitted
  from the same call site on the `1.5`-literal control — so DIAG-2 is not engaged
  and the DIAG-4 *Message* strings are byte-identical, confirmed by blob hash on
  the registry page and both `docs/reference/` mirrors. Locked by a 43-cell
  offline witness (`tests/division-result-type-number.test.ts`), a 4-cell invoke
  companion (`tests/division-result-type-number-invoke.test.ts`) and an additive
  live H8a registration-denial cell, each proven red with the arm neutralised and
  green after a hash-verified restore.

## [0.79.0] - 2026-08-06

### Fixed

- **A `fn` parameter name's first-letter case was unenforced — the spec
  requires lowercase-first at that position and nothing checked it** (bug
  0139). `lexical.md` §Identifiers requires lowercase-first (a lowercase letter
  or `_`) for "`let` and `let mut` bindings, function parameters, function
  names, and schema field names", makes a violation a parse error, and
  `theta/parse/binding-case-mismatch`'s registered *Trigger* names the
  parameter position in so many words. The rule's only implementation was the
  lexer's `contextualDiagnostics`, which works by keyword adjacency — it
  inspects the identifier following `let` (past the `mut` skip), following
  `fn`, and following `schema` / `enum`. A parameter name follows `(` or `,`,
  so no call reached it: `fn h(P: string): number { 1 }` loaded with zero
  diagnostics and registered, while `let P = 1` beside it drew the code. The
  discriminator between a reported spelling and an accepted one was which
  keyword preceded the identifier, which has no counterpart in the spec, and
  `lexical.md` grounds `match`'s case-based pattern disambiguation on the same
  first letter being enforced.

  `parseFn`'s parameter loop now captures the parameter-name token rather than
  its bare text and tests its first character against the same predicate the
  lexer's `checkName` already applies, emitting the registered code ranged on
  the parameter name itself — the position the lexer's own scope note assigns
  to the parser leaf, and the same loop that already reports a `mut` modifier
  at that modifier's range. The emission is guarded to identifier tokens, which
  is exactly the registered *Trigger*'s input class. `subagent fn` and
  `.thetalib` are covered by the same route; every parameter in a list is
  checked, trailing comma included; `mut` on an uppercase parameter reports
  both registered codes in column order. The scope is the `fn` parameter
  position alone: a `for` / `par for` variable and a `match` pattern binder stay
  outside the rule as the spec sentence's list requires, the reserved-keyword
  arm and the schema-field-name / `params:`-field-name positions stay unclosed,
  and no type-layer verdict moves. Locked by a 19-row offline witness
  (`tests/fn-param-name-case.test.ts`) and an additive live H8a
  registration-denial cell, both proven red with the emission neutralised; the
  registry row and its `docs/reference/diagnostics.md` mirror are byte-unchanged
  (the implementation moves onto the registered *Trigger*, so DIAG-2 is not
  engaged and the DIAG-4 *Message* is unchanged).

  **Source-language stability (GOV-15).** This is a carve-out-covered
  ADDITION: it brings a new input class into an existing code's emission set
  and changes no code any input already emits. The input class is **`.theta` /
  `.thetalib` files declaring a `fn` parameter whose name begins with an
  uppercase letter**; such a file now emits an `error`-severity diagnostic and
  no longer registers. Measured blast radius against the committed corpus:
  **zero** — all 34 tracked `.theta` and `.thetalib` files were walked
  explicitly (the shipped parse gate is blind to `.thetalib`) and every
  parameter in the corpus is lowercase-first.

## [0.78.0] - 2026-08-05

### Fixed

- **`theta/parse/invoke-arg-type-mismatch` had no emission path — a literal
  `invoke(...)` call's argument was never checked against the callee's declared
  `params:` type** (bug 0137), the invoke-row twin of bug 0050. The registered
  `E`-severity row's sole emitter `checkInvokeArgTypes` was reached only from
  `checkInvokeCall`, which had no caller in `src/`: the invoke-literal loop of
  `checkInvokeStaticResolution` resolved the callee, called `checkInvokeArity`
  directly and moved on. So `invoke("./callee.theta", 1)` against a
  `params: x: string` callee loaded clean and registered, while the identical
  mistype through a `.theta`-callable call or a same-file `fn` call was refused
  at load — enforcement of a declared parameter type depended on which of three
  call spellings the author chose. `invocation.md` §"Argument binding" assigns
  the resolvable case to parse time and TYPE-10 refuses the deferral by name.

  That loop now calls `checkInvokeCall` in place of `checkInvokeArity`, so
  arity still runs exactly once per site and the emitter's own early return IS
  the mandated arity-before-type order (a double-defect site still reports
  arity alone). The per-slot input reuses the adjacent `.theta`-callable arm's
  soundness mechanisms unchanged: the expected side is the callee's verbatim
  `params:` type source through `annotationToCompatType`, judged under an EMPTY
  null-prototype callee-annotation `TypeEnv` so a caller-local homonym cannot
  decide a verdict about the callee's contract; the actual side is
  `collectProvableArgTypes`' whole value-type set; and a diagnostic fires only
  where EVERY value the argument can take is provably incompatible, so an
  `integer`-narrowing slot, a mixed composite, and any expression past the
  parser's static view all defer to the callee's runtime AJV load.
  `CalleeArityField` gained the param name the row's `<param>` placeholder
  needs (no second callee read), and `InvokeArgSlot` now admits an absent
  verdict rather than a fabricated type. An unresolvable callee still registers
  with a `theta/load/callee-has-errors` warning and no parse error. Locked by a
  40-cell offline witness (`tests/invoke-arg-type-mismatch-wired.test.ts`) and
  an additive live H8a registration-denial cell, both proven red with the
  wiring neutralised; the registry row and its mirror are byte-unchanged (the
  wiring lands at the Trigger's full letter, so DIAG-2 is not engaged).

## [0.77.0] - 2026-08-05

### Fixed

- **`theta/parse/fn-arg-type-mismatch` had no emission path — a plain `fn`
  call's argument was never checked against the declared parameter type, at
  parse or at runtime** (bug 0050). The registered `E`-severity row's sole
  emitter `checkFnArgCompat` had no caller in `src/`, so
  `fn f(x: P): number { 1 }` + `let r = f(3)` loaded with zero diagnostics and
  the runtime bound the argument unchecked — the row itself states no AJV net
  applies at that position. TYPE-9 names the site; TYPE-10 routes the
  cross-schema case to it.

  The type-layer walk's `call` arm (split from `invoke`, whose own row stays
  unwired — bug 0137) now resolves the callee the way the runtime's
  `resolveUserFn` does and calls the emitter with a PROVEN argument type:
  `provableArgType` / `isProvenReduction` re-apply bug 0072's soundness
  discipline in-layer, withholding wherever the static read is not a proof of
  the runtime value's type — erased common-type reductions, laundered `let`s
  (provability judged PRE-set, in the scope the runtime evaluates the
  initialiser in), spelling-minted names, and every `for` / `match`-pattern /
  unannotated-parameter binder, which the walk now records in its body scope
  as a key-level-unspellable `"<withheld>"` twin whose reads defer at every
  judgement sink (`containsWithheldBinderType` gates the six sinks that judge
  structurally or refuse unresolvables). `subagent fn` calls are in scope
  (FN-6); the imported-`.thetalib` route defers by a named arm (bug 0138).
  Locked by an 84-cell offline witness
  (`tests/fn-arg-type-mismatch-wired.test.ts`) and an additive live H8a
  registration-denial cell; `src/parser/type-compat.ts`, the registry row and
  both mirrors are byte-unchanged (the wiring lands at the Trigger's full
  letter, so DIAG-2 is not engaged). Follow-ups filed as bugs 0137–0145.

## [0.76.0] - 2026-08-05

### Fixed

- **An index read on an alias-typed array lost its element type, so six
  error-severity codes stopped firing and an illegal theta registered and
  reached the runtime** (bug 0125). `#typeExpr`'s `case "index"` arm narrowed an
  element read to the target's element type only when the target's raw
  `CompatType` had `kind === "array"`. Under TYPE-11
  (`type-system.md:54`) a type-alias schema `schema L = array<string>` **is**
  `array<string>`, but a `fn` parameter records it as the raw `named L`, so the
  test failed and the read typed as the sentinel `{ kind: "named", name:
  "index"}` — a name no `TypeEnv` resolves, which every downstream check defers
  on by design (`type-system.md:48`). The receiver check did not make the same
  mistake: `classifyIndexReceiver` already resolved the alias, so the expression
  passed admissibility and then lost its type.

  Measured, `theta/parse/unknown-method`, `integer-narrowing`,
  `let-rhs-type-mismatch`, `non-string-array-join`, `mixed-plus-operands` and
  `non-boolean-condition` all stopped firing on the element, each against a
  concrete-parameter control that emits it. All six are error severity, so the
  theta registered: `xs[0].frobnicate()` on an alias-typed `array<string>`
  parsed clean and aborted at runtime with `theta/runtime/internal-error`, the
  outcome `expressions.md:122` says this input does not get;
  `array<integer>.join(",")` returned `"1,2"` by JS coercion, which
  `expressions.md:108` says theta 1.0 does not perform; and a `number` emerged
  from an `integer`-annotated binding as `1.5`. In the other direction a legal
  `par for` over an alias-typed array's element was refused, because the iterand
  gate admits only `array<T>` and the sentinel is not one.

  The arm now unfolds its target through the exported `unfoldAlias` before the
  `kind` test — bug 0089's route, applied at a fourth site it did not name, with
  the same helper reused and no registry row moving. This completes the
  alias-unfolding narrowing family: all six `CompatType` narrowing tests on
  `kind === "array"` now read an unfolded operand.

  Bounds preserved and asserted: TYPE-10 holds, so an object schema and an alias
  of one keep their present dispositions; an unresolvable name and a
  type-alias-cycle participant keep deferring; nested alias chains unfold; and
  the element is not unfolded here, so `unknown method '…' on type E` still names
  the declared element. The `named "index"` sentinel is kept, and its arm stays
  reachable for an unresolvable or object receiver — so `got index` remains
  reachable there, with no alias involved.

### Changed

- **The expression sublanguage now states the static result type of an array
  index.** `docs/spec_topics/expressions.md` stated it for the object receiver
  (`obj[k]`) and was silent for `arr[i]`; the *Indexed access* bullet now states
  that the result type is `T` for a receiver `array<T>`, read through a
  type-alias receiver's right-hand side per TYPE-11.
  `docs/reference/grammar.md` mirrors the clause in the same commit. No
  diagnostic code, severity or trigger moves, so DIAG-2 is not engaged.

## [0.75.0] - 2026-08-05

### Fixed

- **A raw line terminator inside a string literal was refused in theta body code
  and admitted on a `params:` default right-hand side, so
  `p: string = "a<LF>b"` loaded with zero diagnostics and registered** (bug
  0102). `lexical.md:26` makes a regular string literal single-line only and
  `grammar.md:9` / `:20` route the default RHS through that same `STRING`
  production, but the lexer that enforces the rule is handed the body text
  alone, and the is-literal check the position does run tokenises with a scanner
  whose quoted-string loop closes on the matching quote and on nothing else. The
  three readers of the recorded `defaultSource` then disagreed about what it
  denotes: the is-literal check read the break as string content, the binder
  rendered it as the `
` escape that *Default-literal rendering* says
  preserves the value the source denotes, and the invocation-time default
  recovery re-lexed the same bytes and bound `a`. Nested inside an
  `ArrayLit` or an object literal, the recovery also fabricated an element and
  a field the author never wrote.

  The position now refuses the input under the code the registry already
  carries, `theta/parse/literal-newline-in-string`, emitted from the
  `parseParams` per-field default loop and ranged on the field, one diagnostic
  per offending field; the theta does not register. The predicate is a line
  terminator inside a *string span*, not one anywhere in the text — the
  distinction bug 0041's round-1 adjudication settled — so a multi-line
  `ArrayLit`, the two-character `
` escape, a break inside a query or
  template form, and every break-carrying *type* spelling stay admitted.

  The shared expression tokeniser is called, never edited: it also answers
  `isBareObjectLiteral` for the Pi-tool argument guard, whose verdict on a
  legal multi-line argument is unchanged and pinned.

  Registry reconciled in the same commit:
  `theta/parse/literal-newline-in-string`'s *Phase* becomes `lex, parse` and
  its *Trigger* names the `params:` default RHS as a second emission site, with
  a position-scoped *Hint* remedy; the *Message* is unchanged (DIAG-4). The
  frontmatter §Defaults enumeration gains the refusal and the second code, each
  mirrored into `docs/reference/`. A DIAG-2 trigger change, in scope as an
  addition under the GOV-15 diagnostic-registry carve-out: 34 committed
  `.theta` / `.thetalib` files, 17 declaring `params:`, 19 fields, one
  default (`count: number = 3`), **zero** in the refused set.

## [0.74.0] - 2026-08-05

### Fixed

- **A brace-rooted union arm was captured as the whole type at every non-alias
  `Type` position, so `schema S { f: {} | null }` lost its entire field list and
  blamed the declaration, `let x: {} | null = 1` split into four diagnostics
  naming an initialiser the source spells, and `fn f(p: {} | null)` minted two
  phantom parameters named `|` and `null`** (bug 0095). `ThetaDocument.parseType`
  had two ways of capturing a type: the `schema X = …` right-hand side consumed
  an arm-start `{` as a balanced group and kept scanning for the `|` and the arms
  after it, while every other position took an early return at a leading `{` and
  left the `("|" Type)*` tail in the token stream for the caller to mis-read.
  Since `schemas.md:17` makes `T | null` the only spelling for an optional field,
  an optional inline-object field was unwritable.

  The early return is deleted and the arm-start branch is reused at every
  position, so all of them consume the same `Type ("|" Type)*` extent the alias
  right-hand side already consumed (`grammar.md:94`, `:105`, `:109`;
  `type-system.md:15`). The three alias-only boundary stops stay alias-only —
  they exist for the newline a declaration's trailing `=` swallows, which no
  other caller has. A `{` after a completed arm still ends the capture at the
  depth-0 stop, so an `fn` return type followed by its body block is unaffected.

  Observable movement: the misattributed declaration-subject
  `theta/parse/empty-schema-body` is replaced by the field-scoped inline
  `'{}'` line bug 0045 already registered; `schema S { f: {a: integer} | null }`
  and `fn f(): {a: integer} | null { 1 }` newly load clean; a `let` annotation
  records its initialiser; a `fn` parameter list holds the one parameter the
  author wrote. No registry edit, no new diagnostic code, no spec edit.

  Blast radius demonstrated rather than asserted: all 35 committed and present
  `.theta` / `.thetalib` files re-parsed with the change in place and with it
  neutralised, 0 rows differing in either direction.

## [0.73.0] - 2026-08-04

### Fixed

- **`classifyDiscriminatorFieldType` carried a third copy of the naive
  prefix/suffix brace test ahead of its own top-level `|` split, so a schema
  field typed `{a: X} | {b: Y}` classified as ONE nested object instead of a
  union of two arms** (bug 0096). The test was positional, not structural: every
  top-level union whose first and last arms are brace groups satisfies it,
  because the first arm's opening brace and the last arm's closing brace are the
  source's endpoints. The classifier's nested-object arm is now guarded by the
  exported structural predicate `isSingleEnclosingBraceGroup` — one import, one
  call, at the one site. The guard still runs ahead of the `|` split, so a single
  enclosing group whose interior carries a union (`{ type: "x" | "y" }`) still
  reports nested; every other single-group control (`{a: integer}`,
  `{a: {b: integer}}`, `{a: "}"}`, `{}`) is byte-unchanged.

  **This change is observably neutral at this release.** No input reachable
  through the shipped load path hands the classifier a source on which the two
  predicates disagree — the schema-field capture ends at the first balanced brace
  group, so a `{`-prefixed capture is either exactly one enclosing group or does
  not end with `}` at all (measured over 199 captured type sources across 18
  field-type spellings, 6 schema shells and 4 file tails). The wrong answer was
  latent, and the whole default gate is byte-identical. What the fix removes is a
  false `theta/parse/nested-discriminator` that would otherwise become live the
  moment bug 0095 widens that capture: `schema Animal by kind = Cat | Dog` over
  `Cat { kind: {a: integer} | {b: string} }` would have been refused, naming a
  nesting the source does not contain. A union of object types has no single
  value to sit at any level, so it is outside that code's registry trigger; the
  corrected classification loads clean, matching the disposition the equivalent
  literal-union spelling (`kind: "a" | "b"`) already receives. No diagnostic
  code, row or trigger changed.

  Two in-tree records are re-derived in the same change:
  `classifyDiscriminatorFieldType`'s doc comment now states why its brace test
  must be structural as well as why it must run first, and
  `isSingleEnclosingBraceGroup`'s closing paragraph no longer scopes the naive
  form's remaining reach to the type-lowering dispatches — the classifier is a
  caller that is not such a dispatch, and `src/parser/params.ts`'s frozen copy is
  now the only remaining one. Discharges bug 0053's §Fix (0.58.0) residual (i).
  Locked by `tests/discriminator-field-classifier-brace-group.test.ts` (9 tests:
  the predicate table over 13 sources with both classifications as bytes, the
  `checkDiscriminatedUnion` seam in both directions including the
  implicit-path mask, and 25 rows of load-path byte-invariance).

## [0.72.0] - 2026-08-04

### Fixed

- **An alias-typed `fn` parameter stayed opaque to the two structural gates
  that never unfolded it, so `schema L = array<string>` +
  `fn f(xs: L) { for x in xs { … } }` drew a false
  `theta/parse/non-array-iterand` and `schema L = array<integer>` +
  `xs.join(",")` lost its `theta/parse/non-string-array-join`** (bug 0089).
  A `fn` parameter's declared type is recorded raw, so a type-alias schema
  arrives at the body's checkers as an opaque `named L`. Four of the six
  classifiers that read it resolve the name through the `TypeEnv` and continue
  on the alias right-hand side; the `for` / `par for` iterand gate and the
  `array.join` element gate tested `type.kind` directly and took `named L` as
  final. TYPE-11 (`docs/spec_topics/type-system.md`) makes `L` and
  `array<string>` the same type, so both gates reached the wrong answer, in
  opposite directions: a gate that admits only `kind === "array"` **rejects**
  an unrecognised shape, so a legal iterand was refused; a gate that checks
  only for `kind === "array"` **defers** on one, so an illegal join was
  admitted. The rejection was a load failure, not a warning —
  `theta/parse/non-array-iterand` is `E` severity and `parseDiscoveredTheta`
  drops any theta carrying an error-severity `theta/parse/*` diagnostic, so the
  slash command never registered and the author's only repair was to stop using
  the alias the language defines. The lost rejection removed the only check on
  the input: `docs/spec_topics/expressions.md`'s `array<T>` `join` row forbids a
  non-`string` element type because theta 1.0 performs no implicit conversion,
  and the runtime joins unconditionally on the stated assumption that the
  parse-time precondition already held.

  The fix unfolds the type at the gates rather than at the record, through the
  `unfoldAlias` the `⊑` engine already applies, so every route that reaches
  them is covered at once — `checkForIterand` (`src/parser/control-flow.ts`)
  takes the `TypeEnv` and unfolds before its `kind` test, using the unfolded
  value for the rendered message too; `checkMethodCall`
  (`src/parser/type-layer-checks.ts`) unfolds the `join` receiver once and
  reuses it for the receiver classifier; and the `par for` loop-variable element
  derivation unfolds in both `src/parser/type-layer-checks.ts` and
  `src/parser/static-type-inference.ts`, so a legal alias iterand binds the
  variable to the element type instead of an unresolvable name. Unfolding the
  receiver exposed the same raw `kind` test one level down in the element
  predicate, so the element is unfolded at that call site as well; that also
  removes a false `theta/parse/non-string-array-join` on `array<E>` where
  `schema E = string`, at every spelling of the receiver.

  Two rendered messages change deliberately, both toward the registry's own
  `got <type>` template: a correctly-rejected alias of a `string` now reads
  `got string` rather than the alias name, and an alias of an object schema
  names the nominal it unfolds to. Bounds are unmoved: an object-schema `named`
  and an alias of one stay non-iterable (TYPE-10), an unresolvable `named` keeps
  its asymmetric disposition — reject at the iterand gate, defer at the join
  gate — and a type-alias-cycle participant, which the `TypeEnv` omits, still
  behaves as an unresolvable name. No spec, registry or `docs/reference/` edit
  follows: both changes narrow an emission back inside a trigger the registry
  already carries.

## [0.71.0] - 2026-08-04

### Fixed

- **`theta/parse/increment-decrement` was registered, implemented and never
  called, so `--` was silently re-read as a different program and `++` drew the
  wrong code** (bug 0084). The lexer had no `++` / `--` token, so both operators
  reached the parser as two separate `punct` tokens. A trailing `-` is a
  newline-continuation trigger (`docs/spec_topics/expressions.md`
  §"Grammar disambiguation"), so `c--` glued to whatever followed:
  `while c > 0 { c-- }` loaded with **zero diagnostics** and a loop body
  containing no statements at all — a non-terminating loop written by an author
  whose source reads as a bounded countdown — and `c--` before a tail expression
  evaluated to `2 * c`. `++` fell into the statement loop's stray-punctuation
  recovery and drew `theta/parse/unsupported-feature`
  (`stray '+' in statement position`), naming a token the author did not think
  they wrote and never showing the registered repair hint. Meanwhile
  `docs/spec_topics/diagnostics/code-registry-parse.md`,
  `docs/spec_topics/bindings.md` §"Increment / decrement",
  `docs/spec_topics/expressions.md` and `docs/reference/grammar.md` all promised
  that theta reports the operator.

  The byte-adjacent pair is now lexed as a single two-character operator token
  (`twoCharOperators` in `src/lexer/lexer.ts`), which by construction happens
  during scanning — ahead of the trailing-trigger continuation test in
  `collapseContinuations`, the ordering the decrement rows depend on. The
  continuation-trigger sets are byte-unchanged: leaving the pair out of both is
  what stops `c--` swallowing the following newline. `checkIncrementDecrement`
  (`src/parser/bindings.ts`), previously exported and unit-tested with no
  production caller, is now called from a prefix arm in `parseUnary` and from
  `parsePostfix`'s suffix loop (`src/parser/theta-document.ts`); each hook emits
  the registered code with the source token rendered verbatim into `<op>`,
  consumes the operator, and yields the operand unlowered. Because every
  expression-accepting position funnels through those two hooks, statement
  position, expression position (`let d = c++`), loop bodies and `fn` bodies all
  draw the diagnostic; consuming the token is what keeps the pair out of the
  stray-punctuation recovery, so no second code cascades.

  Only the byte-adjacent pair is the operator: `c - - c` and `c - -c` remain
  legal and remain the way to subtract a negation, while `c-- c` and `c --c` are
  rejected, matching how every C-family lexer reads those bytes. `--` and `++`
  inside `//` comments, string literals and `@`-template prose are data, not
  code, and stay silent. No registry, spec-topic or `docs/reference/` edit was
  needed — the *Trigger*, *Message* and *Hint* were already accurate; the
  implementation moved to match them. GOV-15 is discharged under the
  diagnostic-registry carve-out
  (`docs/spec_topics/governance/source-language-stability.md`), whose covered
  effect is exactly that previously clean-loading inputs gain an emission; no
  committed `.theta` or `.thetalib` contains the operator.
  Locked by `tests/increment-decrement-wiring.test.ts` (25 cells: ten emission
  positions with the message and hint read from the live registry, byte-unchanged
  controls, the whitespace and lexical-context spellings that must stay accepted,
  the adjacency emissions, the loop-body severity pins, and a registry drift
  guard) plus an additive live cell in
  `tests/live/live-production-acceptance.test.ts` that drives the real
  discovery-to-registration path and asserts the `theta-system-note` channel
  carries the rejection.

## [0.70.0] - 2026-08-04

### Fixed

- **`keys()` / `values()` on a named-schema value returned the constructor's
  field order, not the schema's declaration order, and the same key order
  reached the model through the QRY-18 outbound JSON** (bug 0080).
  `docs/spec_topics/expressions.md`'s stdlib `object` table fixes `keys()` as
  the theta-side field names "in schema declaration order for named schemas"
  and `values()` as "in the same order as `keys()`" — mirrored at
  `docs/reference/grammar.md` — while the same page's §"Object construction"
  tells the author that "field order is irrelevant" at the call site. Both
  constructor evaluation sites built the runtime record by walking the
  constructor's own field list, so the order an author wrote at the call site
  silently determined every downstream order: `schema P { b: integer, a: string }`
  constructed as `P { a: "x", b: 1 }` answered `keys() == ["a","b"]`,
  `values() == ["x",1]`, and rendered `{"a":"x","b":1}` through a `@`-query
  interpolation. Both sites now delegate to one shared construction point,
  `buildObjectSchemaValue` (`src/runtime/value.ts`), which reorders the
  already-evaluated field record into the declaring schema's field order before
  installing the declaring-schema brand; `keys()`, `values()`, the QRY-18
  outbound walk and `JSON.stringify` then all report declaration order, nested
  constructors included. A constructor naming no schema or an unresolvable one
  still passes through unbranded in insertion order, equality stays
  order-insensitive, and the brand still targets a record whose string keys are
  exactly the declared theta-side names. No new diagnostic code and no spec
  change — the implementation now conforms to prose already shipped.

## [0.69.0] - 2026-08-04

### Fixed

- **A `Result`-valued `${…}` interpolation rendered the interpreter-private
  `{"ok":…,"value":…}` encoding into the prompt text sent to the model** (bug
  0079). QRY-18
  (`docs/spec_topics/query/query-escapes-stringification.md`) gives
  `Result<T, E>` one disposition in the interpolation table — the parse error
  `theta/parse/interpolated-result`, with the runtime renderer raising the same
  code as a panic when the type is statically unresolvable. Neither fired at any
  input: the code was registered, its renderer arm existed, and no production
  caller could select it, so the value took the `object` arm and
  `JSON.stringify` emitted the brand's carrier shape onto the wire — the encoding
  `docs/spec_topics/runtime-value-model.md` declares unreachable and free to
  change without a spec revision. Both halves now fire. The render classifies a
  `Result` by its interpreter-private brand (never by an `ok` key, so an ordinary
  object carrying a boolean `ok` field still renders as compact JSON) and aborts
  the theta with a runtime panic carrying the registered code, on the same closed
  routing as the other runtime panics, so QRY-21 continues to hold and a discard
  cannot swallow it. Ahead of that, a type-layer check over each interpolation
  refuses the load for the forms the parser can prove `Result`-valued — an
  `Ok`/`Err` constructor, a call to a `fn` whose written return annotation names a
  `Result`, a binding of either, a written `Result<…>` annotation, an annotated
  `fn` parameter, and a `par for` element — classifying by provenance rather than
  by type name, so an enum variant named `Ok`, a field sharing a name with a
  `Result`-returning `fn`, and a `?`-unwrapped operand are all left alone. No
  registry row was added and no Trigger widened: the closed-registry row already
  described both dispositions and is now satisfiable.

## [0.68.0] - 2026-08-04

### Fixed

- **A settings `thetaPaths` glob matched an entry's basename against the
  *pattern's* basename instead of against the pattern** (bug 0077).
  DISC-5 (`docs/spec_topics/discovery/package-and-settings.md`, anchor
  `#disc-5`) states which three strings a glob is attempted against — "the
  candidate's package-root-relative path, its basename, and its POSIX-normalised
  absolute path" — and the `thetaPaths` entry schema's *Glob patterns and
  exclusions* bullet binds the settings array to that same contract. The
  settings matcher offered a fourth comparison the sentence does not license: it
  reduced the pattern to its last path segment before matching, so
  `thetas/*.theta` became `*.theta` and matched every `.theta` basename in the
  recursively-enumerated universe under `thetas/`. Files in subdirectories
  registered as slash commands, contradicting the non-recursion rule three pages
  state, and each additionally entered collision detection where it could drop
  an intended same-named theta. The `!` step repeated the reduction inline and
  iterated the whole accumulated selection, so one `!thetas/*.theta` dropped
  every theta the array had selected — including those contributed by unrelated
  entries pointing at unrelated directories. Both directions were silent: zero
  diagnostics in every measured case, and `thetaPaths` has no other surface
  reporting what it resolved to. The package walker's `matchesGlob`, implementing
  the same DISC-5 sentence for `package.json` `pi.theta`, was already conformant,
  so one pattern text meant two different things depending on which file it was
  written in — the one place the spec says the two follow one contract. The
  settings matcher now attempts the three DISC-5 strings with the whole pattern
  each time, taking the candidate's path relative to the settings-file directory
  against the operand as written, and the `!` step calls that one predicate
  instead of re-inlining a reduction. No new diagnostic code and no spec change:
  the implementation now conforms to prose that was already there.

## [0.67.0] - 2026-08-04

### Fixed

- **A discovery root that existed but could not be enumerated contributed zero
  thetas and zero diagnostics** (bug 0076).
  `docs/spec_topics/discovery/discovery-sources.md` gives that state a column and
  a severity per source in the DISC-2 failure-modes table, and its implementation
  note forbids silence in terms — "a symlink loop or other traversal failure
  *inside* a discovery root that does exist is an unreadable-source warning, not
  silence". The walk decided "is this root a directory" and "can this root be
  enumerated" with two different calls, and only the first reported its failures:
  `enumerateDirectory` mapped every `readdir` rejection to a bare empty list
  without capturing the rejection's `.code`, so a root whose ACL or mode denied
  enumeration while still permitting `lstat` — the Windows parent-ACL case the
  spec cites, a link cycle inside a settings root, an `ENOTDIR` from a racing
  replacement — lost every theta under it and told the operator nothing. The
  `--theta` cell was the sharpest: the operator named the path on the command
  line, DISC-2 makes every failure mode of that source an error, and the walk
  answered with nothing at all. The package walker repeated the swallow for a
  package's conventional `theta/` directory and for each directory a `pi.theta`
  entry contributed.

  Both enumeration sites now capture the rejection code and emit at the calling
  source's severity. `enumerateDirectory` receives the descriptor and
  failure-mode severities its caller already holds and reports through the same
  helper the entry-classification path uses, so the diagnostic's `file` is the
  enumerated root and its message carries the source descriptor: a warning for
  the global, project, package and settings rows, an error for `--theta`. An
  `ENOENT` whose ancestor chain `lstat`s clean stays the *missing* case the table
  prescribes — silent for the conventional roots, an error for the explicit
  references — so a genuinely empty directory and an absent conventional root are
  both still silent, and one bad root still does not abort the pass. The package
  walker's directory scan carries its caller's *Missing* severity too, silent for
  the `theta/` fallback a package need not ship and an error for a directory the
  manifest named.

  Deferred by adjudication, not by omission: the glob-universe walk's own
  swallow, where a denied subtree under a glob's static prefix shrinks the set of
  paths a pattern is matched against. No spec sentence prescribes a disposition
  for that sub-case and it carries no source descriptor of its own, so it is a
  spec gap to be pinned before it is coded.

## [0.66.0] - 2026-08-04

### Fixed

- **A `tools:` `.theta` entry whose path escaped every active discovery root
  minted its callable anyway** (bug 0110). `docs/spec_topics/tool-calls.md`
  §"Argument shape" states that such a path "is rejected with
  `theta/load/invoke-path-escape` and the callable is not created", and the
  registry row's *Trigger* names this surface alongside `invoke(...)`, but
  nothing on the load path applied the rule to it: the entry's path met one bare
  `resolvePath` and one read, with no `realpath` and no comparison against the
  active roots. Three spellings of an escaping entry — absolute plain scalar,
  absolute double-quoted scalar, and `..`-relative — all registered their caller
  with no containment diagnostic, and the only enforcement was the runtime
  open-time re-check, which fails one call closed at dispatch instead of
  refusing the callable at load. A second, dependent defect followed from the
  ordering: the `.theta`-callable arity check emitted against an out-of-root
  callee, un-registering the caller on the wrong rule and pointing the author at
  their argument list rather than at the entry's path.

  A `tools:` `.theta` entry's containment is now judged at `tools:` resolution
  time, before the callable is created, through the same
  `checkInvokePathAtLoad` checker the `invoke(...)` surface uses — so a
  symlinked callee classifies identically on both surfaces, and an escape
  un-registers the caller with no frozen callable-set snapshot built at all.
  Because an error-severity `tools:` diagnostic stops the compose pass before
  the invoke static-check pass runs, the arity and tool-argument type checks are
  structurally unreachable for an escaping entry, and an escaping entry's bytes
  are never parsed, so no rule derived from the callee's contents can name it
  either. The runtime open-time re-check is unchanged and remains the defence
  for a callee that is not statically resolvable at load.

### Changed

- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — §5's `<path>` rule
  gained the `tools:`-entry arm (the entry spec as written, an unquoted YAML
  scalar), and §Edge cases gained a bullet reconciling the two arms of
  `theta/load/invoke-path-escape`. No diagnostic code, *Trigger* or *Message*
  changed, so the code registry and `docs/reference/diagnostics.md` are
  untouched.

## [0.65.0] - 2026-08-04

### Fixed

- **Three registered tool-argument diagnostics had no caller, and no runtime
  check stood behind them** (bug 0072). `checkToolCallArguments` implemented
  `theta/parse/tool-arg-arity`, `theta/parse/tool-arg-type-mismatch` and
  `theta/parse/tool-arg-schema-conflict`, but nothing in `src/` called it, so
  none of the three could fire against any input. Two consequences were
  observable. A multi-argument Pi-tool call was judged by the bare-object
  carve-out instead: `read({ path: "a" }, { path: "b" })` drew two
  `theta/parse/bare-object-literal` diagnostics telling the author to name a
  schema, when the fix is to merge the arguments. And argument type checking was
  absent at both phases: `read({ path: 123 })`, `read({ nosuchfield: "a" })` and
  a `.theta`-callable call passing an integer to a `params: x: string` slot all
  loaded with zero diagnostics and were handed to the tool. The parse-time
  checks are now wired at both call surfaces, and the runtime AJV step the spec
  designates as the safety net exists: a code-side Pi-tool call whose
  constructed argument object fails the tool's registered `parameters` schema
  surfaces `Err(CodeToolError { cause: "validation" })` **without dispatching**,
  after the depth walk and before `execute()` (CIO-3). `CodeToolError`'s
  `validation` cause was previously reachable only from a depth-6 argument;
  every other input-schema failure arrived misattributed as `execution`.

### Changed

- **A multi-argument Pi-tool call now draws `theta/parse/tool-arg-arity` alone**
  (bug 0072), where it previously drew one `theta/parse/bare-object-literal` per
  bare-object argument. `tool-calls.md` §"Argument shape" specifies the arity
  code "regardless of the argument shapes". The `bare-object-literal` carve-out
  is correspondingly re-scoped from the sole argument to every direct argument
  of a Pi-tool call, reconciled in the same commit across
  `code-registry-parse.md`, `expressions.md` §"Object construction" and
  `docs/reference/grammar.md`. A bare object nested *inside* an argument is not
  a direct argument and keeps its own rejection. One mistake now draws one
  diagnostic, with the Hint that describes the repair that applies.
- **A host built-in's registered `parameters` schema now reaches the frozen
  `tools:` callable-set entry** (bug 0072). Extension tools already carried it;
  the built-in resolver narrowed the tool definition to its `execute` and
  dropped the schema, so neither the RFC-0002 disjointness check nor the runtime
  check had a schema to consult.
- **Multi-argument bare-object rejections now reach `par for` bodies** (bug
  0072, a side effect of the callee-aware lexical walk owning every direct
  argument position). A multi-argument non-Pi-tool call there previously drew
  nothing; it now behaves as it does at top level.

## [0.64.0] - 2026-08-03

### Fixed

- **Argument arity was never checked on the `.theta`-callable call form, only on
  `invoke(...)`** (bug 0071). `tool-calls.md` §"Argument shape" binds the two call
  surfaces onto a `.theta` callee together and names the codes explicitly:
  `theta/parse/invoke-arity-too-few` / `theta/parse/invoke-arity-too-many` "apply
  equally to a `.theta` callable call". The checker was live and correct, but its
  only caller walked `invoke(...)` expressions, so listing `./twoparam.theta` in
  `tools:` and then calling `twoparam("a")`, `twoparam()` or `twoparam("a","b","c")`
  loaded with zero diagnostics while the same mistakes written as
  `invoke("./twoparam.theta", …)` were rejected at the same callee. An author
  migrating an `invoke(...)` call to a `tools:` entry plus a bare call — the
  migration the spec calls operationally equivalent — silently lost a static check:
  a too-few call was deferred to the callee-side runtime validation and surfaced as
  an infra-side `Err` attributed to the callee rather than as the caller's parse
  error, possibly after a child process had already been spawned, and a too-many
  call discarded the author's surplus argument with no diagnostic at either phase,
  because positional binding has no destination for it. Both forms are now rejected
  at load, at the call site, and un-register the caller. At a `.theta`-callable call
  site the message renders the presented callable name the author wrote there
  (`invoke 'twoparam' passes too many arguments: expected at most 2, got 3`), while
  an `invoke(...)` site keeps rendering its path literal — the callee path appears
  nowhere on the line the diagnostic points at. The callee is resolved through the
  caller's frozen resolution snapshot, so an `as` rename and the
  hyphen→underscore rewrite are both honoured (`./two-param-hyph.theta as renamed`
  is checked, and the diagnostic names `renamed`). A `tools:` entry that failed to
  resolve raises only its own rejection and never a second, derived arity error. No
  new diagnostic code: both codes were already registered against both surfaces.
- **Call sites inside a `par for` body, iterand or `max` operand were invisible to
  the load-time invoke static checks** (found while fixing bug 0071). The parallel
  fan-out expression was walked as a leaf, so `control-flow.md` CTRL-4's explicit
  admission of `invoke(...)`, `.theta` callable calls, `subagent fn` calls and
  Pi-tool calls in that body was unenforced: a wrong-arity call there loaded clean
  even in the `invoke(...)` form. Arity on both surfaces, the discovery-root
  path-escape check, the callee-has-errors check and the invocation-cycle graph now
  all reach `par for`.

## [0.63.0] - 2026-08-03

### Fixed

- **A `.theta` `tools:` entry's derived default callable name was never checked
  against the lowercase-first identifier rule** (bug 0070). A `tools:` entry is
  exposed under one name drawn from one of two places — the `as` override, or the
  default derived from the file's basename with hyphens rewritten to underscores
  — and the frontmatter spec gives the same justification for both: theta
  identifiers must be lowercase-first identifier-shaped. Only the `as` target was
  enforced. Because the discovery stem regex admits a leading digit,
  `2fast.theta` is a fully valid, registrable theta file, and listing it as
  `- ./2fast.theta` minted a callable named `2fast`: bound into the frozen
  callable set, offered to the model, counted for collision detection — and
  uncallable from theta code, because no bare identifier can spell it. The theta
  registered with zero load diagnostics, so a declared capability was silently
  half-present. The only signal the author got was a parse error at their own
  call site (`unsupported syntactic feature: 2fast`) that named no `tools:` entry
  and from which neither remedy — rename the callee file, or add an `as` clause —
  was derivable. The same final name was refused through one source and admitted
  through the other: `./2fast.theta as 2fast` failed load while `./2fast.theta`
  passed. Version- or step-numbered file names (`2-classify.theta` →
  `2_classify`) are a natural naming style, and dotted or uppercase stems reach
  the same gap through a `tools:` path even though they cannot register a slash
  name.

  The resolver now applies that one predicate to the merged presented name rather
  than to one of its sources, judged after the entry resolves and **before** the
  name-collision test so a derived-name rejection is never reported as a
  collision. A derived name outside the rule is the new error-severity
  `theta/load/invalid-derived-tool-name`, whose message names the entry path, the
  derived name, and the `as` escape hatch; the theta does not register. The
  rejection is scoped to `.theta` entries: a Pi tool's name is the host registry
  name verbatim, with no file to rename and no basename derivation to describe,
  so that arm keeps its previous behaviour. An `as` override still keeps its own
  `theta/load/invalid-tool-rename`, and `./code-review.theta` → `code_review`
  keeps resolving as before.

## [0.62.0] - 2026-08-03

### Fixed

- **A `tools:` entry's trailing residue was discarded with no diagnostic**
  (bug 0069). The per-entry grammar is `<spec>` plus an optional `as <name>`
  clause, and the resolver implemented it by splitting the entry on whitespace
  and reading the first and third tokens — every other token was consumed
  unexamined. A dropped comma in the documented comma-separated short form
  (`tools: read grep`) therefore narrowed the callable set to `{read}`, a
  two-name list entry (`- read bash`) kept only the first name, a dangling
  `as` (`- read as`) resolved as a rename-less entry, and residue after a
  complete rename (`- read as file_read junk_here`) bound `file_read` as though
  the author had finished writing it. A `tools:` sequence item that was not a
  YAML scalar (`- {a: b}`) was dropped one layer earlier still, before the
  resolver saw it. In every case the theta registered and ran with a callable
  set its author never wrote — and because the callable set is the only door to
  both the model-facing and the code-side call paths, a dropped name was
  unreachable for the whole invocation. When the dropped tool was model-facing
  only, nothing failed: the theta ran and the model was simply never offered
  the tool, so the observable was a worse answer attributed to the model.

  The per-entry grammar is now closed. An entry is exactly a Pi tool name or a
  `.theta` path, optionally followed by an `as <name>` clause — one token, or
  three tokens with `as` in the middle. Every other token count, including the
  two-token dangling `as` and three tokens whose middle token is not `as`,
  raises the new error-severity `theta/load/malformed-tool-entry` naming the
  entry text verbatim, and the theta does not register, on the same
  all-or-nothing footing as `theta/load/unknown-tool`. A non-scalar sequence
  item now recovers its own verbatim YAML source and is judged by that same
  grammar instead of being dropped. The grammar check runs before the
  `as`-target validation, so `read as MyTool` still fails under
  `theta/load/invalid-tool-rename` while `read as MyTool junk` fails as a
  malformed entry. The snapshot-absent fallback that derives presented callable
  names for in-memory harness fixtures now consumes the same exported grammar
  rather than re-implementing it, so the tree holds one answer to which entries
  exist. The new code is registered in `code-registry-load.md` and mirrored in
  `docs/reference/diagnostics.md`; `frontmatter-fields-a.md` §`tools` and its
  reference mirror now state that the entry grammar is closed. Locked by
  `tests/tools-entry-closed-grammar.test.ts` and
  `tests/tools-entry-closed-grammar-lockstep.test.ts` (31 cells: the registry
  row, the production-load matrix over a real on-disk discovery workspace, the
  resolver-direct token-count boundary, and the fallback lock-step).

## [0.61.0] - 2026-08-03

### Fixed

- **The binder `Parameters:` per-field line shape was violable by an embedded
  newline** (bug 0060). The block is a line-oriented contract — one physical
  line per declared field, two leading U+0020 and nothing else — but two of the
  three values interpolated into that line are author-controlled text recorded
  verbatim from the `params:` block, and nothing between the YAML read and the
  prompt checked either for a line break. A declared type written as a
  multi-line block scalar, an inline object type wrapped across lines for
  readability, a union or generic split across lines, or a default RHS carrying
  a break all loaded with zero diagnostics, registered, lowered correctly, and
  then emitted one declared field across two physical lines — the continuation
  carrying no indent, or the author's own. The consequence reached past
  indentation: because the prompt's other structural lines are unescaped tokens
  on their own physical lines, a break placed by the author reproduced them, so
  a declared type or default containing `Theta: /evil` rendered a prompt with
  two `Theta: ` lines where the specification states exactly one per prompt, and
  the same through `User arguments:` put a forged line ahead of the real one.

  Refusal could not close the family — the multi-line inline object type, the
  split union, the split generic and the multi-line array default are all
  grammar-admitted and all lower correctly — so the two author-controlled
  tokens are now normalised at the render seam instead. A line break inside a
  string literal renders as the two-character escape `\n`, which is the literal
  sublanguage's own spelling for a newline and preserves the value the literal
  denotes; every other line break, with any horizontal whitespace adjoining it,
  renders as one U+0020 SPACE, which is the space-normalised spelling of the
  same type. Text carrying no line break is returned unchanged, so no shipped
  prompt's bytes move. `binder-bypass-and-envelope.md` states the rule under
  *Type display* and *Default-literal rendering*, the two obligations it answers
  to.

  No diagnostic code was added or removed and no recorded byte, lowered
  document or `$defs` name moves: every input that loaded before still loads,
  with the same diagnostics and the same lowered schema. Locked by
  `tests/binder-param-line-newline-normalisation.test.ts` (48 tests), whose
  central assertion is that the `Parameters:` block has exactly
  `1 + fields.length` physical lines — the one a renderer that merely indents
  the continuation cannot satisfy — alongside per-pair proofs that the rendered
  type lowers to the recorded type's fragment under the recorded type's
  `__inline_<slug>` name, and that the rendered default parses as a literal and
  denotes the recorded value.

## [0.60.0] - 2026-08-03

### Fixed

- **A specifier list with no `from` clause parsed as a re-export of nothing**
  (bug 0058). `parseImportExport` handles `import` and `export` in one function
  and made the `from` clause optional for both, so `export { Ghost }` parsed to
  an `ExportDecl` with an empty path. No page defined that form: `imports.md`
  owns the surface and spelled the re-export only as `export { … } from "…"`,
  and `grammar.md` defines no declaration production for either keyword. The
  accepted node was not inert — its specifier entered the resolved-export set
  that `theta/parse/import-unknown-symbol` admits an importing specifier
  against, while materialisation, a separate walk over the resolved file's
  declarations, bound nothing. Adding `export { greet }` beside a plain
  `import { greet } from "./mid.thetalib"` therefore removed the diagnostic that
  enforces `imports.md`'s one negative rule — a plain import is not re-exported
  downstream — and still materialised nothing. In a `.theta`, a file no `import`
  can name, the same statement's symbols reached the whole-file identifier root
  scope and took an undeclared name out of `theta/parse/unknown-identifier`'s
  emission set at expression position.

  The form is now refused where it is parsed. `parseImportExport` raises the new
  error-severity `theta/parse/import-missing-from-clause` when a specifier list
  is followed by no `from` clause, or by a `from` clause with no path literal —
  once per statement, ranged over the statement, on both keywords, covering the
  degenerate `import` / `export` / `import {}` / `export {}` /
  `export { x } from` spellings. `imports.md` §Re-exports gains the `ImportDecl`
  and `ExportDecl` productions the refusal rests on, mirrored for readers by a
  new *Imports and re-exports* section in the grammar reference that the guide
  now links to. `export` symbols no longer seed a `.theta`'s identifier root
  scope, matching `expressions.md`'s identifier-resolution arm (3) and the rule
  that a re-export creates no local binding. `theta/parse/import-reserved-`
  `synthesised-name` keeps its per-specifier emission and co-emits on the same
  input.

  Zero of the 34 committed `.theta` / `.thetalib` files carry an `export`
  statement of either form and every committed `import` is from-bearing, so no
  file that loaded cleanly before loads differently now.

## [0.59.0] - 2026-08-03

### Fixed

- **One declared value set written two ways lowered to two schemas, minted two
  slugs, and registered two respond tools** (bug 0055). `schema-subset.md` gives
  a single step-3 emission rule covering two source forms — "Enum (or
  string-literal union): `{ "type": "string", "enum": [...wire values...] }`" —
  and the implementation split it across two functions that were never
  reconciled. The named `enum` declaration emitted the spelled bytes; the
  anonymous string-literal union emitted the same `enum` array with the `type`
  keyword absent. Both fragments admit and refuse exactly the same JSON values,
  so no theta accepted or rejected differently, but the bytes are load-bearing in
  four places: the canonical schema hash that names a hoisted `__inline_<slug>`
  entry, the slug that names the registered respond tool and keys its
  registration cache, the QRY-15 instruction text the model is shown, and the
  AJV issue list that drives QRY-11 respond-repair. `enum Sev { Low = "low",
  High = "high" }` and `schema Sev = "low" | "high"` therefore produced different
  slugs and two permanent respond-tool registrations where the single emission
  rule implies one — and tool registration cannot be undone. An author moving a
  declaration between the two spellings changed the schema conveyed to the model
  and the repair instruction rendered back to it, without changing the declared
  type. The literal-union arm now emits the spelled form when every arm is a
  string literal, with `type` written first so the two spellings produce
  byte-identical fragments and collapse onto one slug and one registration; the
  respond-slug recipe hashes the serialised fragment and is key-order sensitive,
  so that order is part of the contract. A union of non-string literals keeps the
  bare `enum`, because the emission table spells the added `type` keyword for an
  enum or a string-literal union only and the typed form would refuse every value
  such a union declares; a single literal keeps its `const`. Respond-tool names
  and `__inline_<slug>` names move for affected declarations — both are
  synthesised, never author-written, and the collision with the equivalent named
  `enum` is byte-equal, so the registration cache reuses one entry. The wire
  envelope decision, argument coercion, and the sidecar's named-enum positions
  are unchanged, the last because it keys off the source type kind rather than
  the lowered bytes. No source-language change, no new diagnostic, and no
  registry edit: the emission table already spelled the bytes the code now emits.
  The `params:` position, a literal arm of a mixed union, and a generic
  argument's element type reach a different lowerer and keep their permissive
  fragments.

## [0.58.0] - 2026-08-02

### Fixed

- **A top-level union of object types at a `@<T>` annotation was read as ONE
  inline field list, so the query enforced a shape nobody wrote** (bug 0053).
  `grammar.md` admits `Type "|" Type` over `ObjectType` arms, and
  `schema-subset.md` (SUBS-1) lowers such a union to `{"anyOf": […]}` with each
  inline object arm hoisted under `__inline_<slug>`. The annotation lowering
  instead asked whether its source began `{` and ended `}` — a positional test a
  union satisfies, because its first arm opens the source and its last arm
  closes it — and handed the interior to the inline-object path as a field list.
  `@<{a: integer} | {b: integer}>` therefore lowered an object requiring a
  single property `a` whose type asserted nothing and refusing every other
  property: QRY-22 rejected `{"b":1}`, the author's own second arm, while
  `{"a":null}` and `{"a":"not an integer"}` — matching neither arm — bound as
  the typed value. The same fragment was registered as the respond tool's wire
  schema and interpolated into the QRY-15 instruction and the QRY-12 repair
  follow-ups, so repair drove the model towards a payload the theta could not
  use, and the same lowering governed `invoke<T>` return values. The identical
  predicate in the name walk swallowed the `theta/parse/unresolved-named-type`
  a name inside either arm owes, at the `@<T>` annotation and the alias RHS
  both, so a typo in a union arm refused the theta or not depending on whether
  a primitive arm happened to be written last. Both dispatches now ask the
  structural predicate the shared lowering already owned — whether the `{` at
  index 0 is closed by the `}` at the final index — so a genuine single
  enclosing brace group keeps its object-rooted fragment byte-for-byte
  (`@<{}>` included) and everything else falls through to the per-arm union
  path, producing the document the named spelling `schema X = …` plus `@<X>`
  already produced for the same text. Affected annotations move from an
  object root to an `anyOf` root, so the respond tool now registers under the
  single-property `value` envelope and its `__theta_respond_<slug>` name
  changes with the bytes. No new diagnostic code and no registry edit: the
  `unresolved-named-type` row already named both positions, and GOV-15's
  diagnostic-registry carve-out covers the newly-refused typo inputs. The
  `params:` position keeps its own naive test and its bytes under bug 0039's
  freeze.

## [0.57.0] - 2026-08-02

### Fixed

- **An empty inline object type `{}` drew no diagnostic at any `Type` position,
  and the same two bytes meant two contradictory things** (bug 0045).
  `grammar.md` §"Inline object types" gives the empty inline object one
  disposition — `theta/parse/empty-schema-body`, the diagnostic an empty named
  schema body raises — unqualified by position and by nesting depth, and nothing
  implemented it. The type-grammar parser read `{}` into an object node with
  zero field types and the walk's object arm iterated that empty list, so every
  position the walk serves accepted it; the `invoke<T>` return annotation ran no
  type-grammar pass at all. Three lowerings then disagreed about what the author
  had asked for: `@<{}>` and `invoke<{}>` minted a closed object fragment that
  AJV accepts `{}` against and rejects every non-empty object, array, scalar and
  `null` against — the respond tool was registered with it verbatim, offering
  the model a reply schema no informative reply satisfies — while `{}` at the
  schema-field, alias-RHS and `params:` positions lowered the permissive `{}`,
  which accepts every JSON value at the argument and response boundaries. The
  walk now raises the registered code for a brace interior that carries no token
  and closes, reaching the `let` annotation, `fn` parameter and return types, the
  schema body field type, the alias/union arm, the `params:` field type and the
  `@<T>` annotation root in one edit; `invoke<T>` gains one call selecting that
  rule alone, so the three checks that position never ran stay unrun there. One
  diagnostic per occurrence, in source order, at every nesting depth
  (`array<{}>`, `{ a: {} }`, a union arm). Malformed-but-non-empty interiors
  (`{ a }`, `{ "a": string }`, `{ a: }`) and an unterminated `{` keep their
  silence, the first because the grammar assigns them no diagnostic and the
  second because `ObjectType` requires the closing brace. The declaration
  renderings are byte-unchanged and the message interpolates the author's own two
  bytes at the inline positions: `'{}' has no fields; an empty schema cannot be
  validated.` The registry row's *Trigger* gains the inline case and the
  placeholder-rendering surface gains the matching `<X>` carve-out; the *Message*
  is untouched. No committed example or fixture carries the shape.

## [0.56.0] - 2026-08-02

### Fixed

- **The `bind_echo` success echo was composed without the shared system-note
  rule-1 pass, so a bound `params:` value carrying a line break broke the note's
  own one-line contract** (bug 0087). `binder/defaulting-system-note-echo.md`
  names "the echo's interpolated values" as one of the three substring classes
  whose `\r`, `\n` and `\r\n` must collapse to a single space before the note is
  composed, and the quote rule's own justification for escaping only `"` and `\`
  is that newlines cannot reach the formatter. Nothing performed the collapse:
  the production emitter applied the 120-code-point cap and no other rule, so a
  raw U+000A reached the renderer, failed the unquoted predicate, and was
  emitted verbatim inside the quotes. A declared default of `"a\nb"` —
  author-controlled, evaluated by the runtime with no model in the loop — put
  the user-facing `Running /<name>: …` note on two physical lines, and a crafted
  break forged a complete second `Running /<other>: …` line inside one note's
  content, so a consumer splitting the channel on newlines read an echo for a
  theta that never ran. The renderer now applies rule 1 per interpolated value,
  before the quote predicate and the escape pass, covering the `string` and
  `enum` arms and, through their leaves, the array and object arms. The
  whitespace set stays the six ASCII characters the rule enumerates, so U+00A0
  and the other non-ASCII whitespace survive verbatim; the cap still runs last
  over the collapsed line; and the `Running /<name>: ` prefix, the `, `
  separator and the `(default)` tag are theta-controlled text that is not
  sanitised. Because the trim runs before the predicate, a value whose only
  out-of-set characters are at its edges now renders unquoted — `"\nplain\n"`
  renders `plain` — and a value that sanitises away renders `""`. No BNDR-6
  reference rendering moves.

## [0.55.0] - 2026-08-02

### Fixed

- **A `let` binding's declared type annotation was discarded after the
  initialiser check** (bug 0083). The annotation was resolved, used to check the
  initialiser, and then dropped: the binding was recorded with the
  *initialiser's* inferred type, so every later reference resolved that instead
  of the declared type. The divergence ran both ways. Where the annotation was
  wider, the declared widening was lost and the guard it exists to arm never
  fired — `let n: number = 1` followed by `let m: integer = n` reported
  nothing, because the check saw `integer → integer` rather than the
  `theta/parse/integer-narrowing` that `lexical.md` §"Number literals" reserves
  for that direction. Where the annotation supplied what the initialiser could
  not, the information was lost and a check fired that should not —
  `let e: array<string> = []` followed by `e.join(",")` drew a false
  `theta/parse/non-string-array-join`, because an empty literal types as
  `array<unknown>`. That second shape is the accumulate-then-join idiom
  `control-flow.md` prescribes, so the recommended program did not load.
  The binding is now recorded with the declared type when the annotation
  resolves, in its TYPE-11-transparent form so an alias of an array remains a
  legal `for` iterand and still answers the `array.join` element-type
  precondition; an unresolvable annotation continues to fall back to the
  initialiser's type. No diagnostic code, registry row or trigger changed, and
  no shipped example or fixture changes disposition.

## [0.54.0] - 2026-08-02

### Fixed

- **`theta/parse/unresolved-named-type` fired for reserved-keyword-shaped text,
  which is not a `NamedType`** (bug 0044). `NamedType ::= Ident`, and reserved
  status is precisely what stops a keyword being an `Ident`, but the resolution
  walk behind four of the row's five positions tested a bare
  `^[A-Za-z_][A-Za-z0-9_]*$` shape regex and looked the result up in a map built
  from declaration names — which no keyword can ever be in. Every keyword
  spelling therefore missed and was reported as a name the file fails to
  declare, advice `lexical.md` forbids taking. `schema X = void` and
  `schema X { f: void }` emitted the correct `void-in-non-return-position` and
  then a false `unresolved named type 'void'`; at the `params:` right-hand side
  and the `@<T>` annotation, where `void`'s own row was not wired, the false one
  was the only diagnostic; and 25 of the 32 keywords drew the row alone or
  beside residue at the schema-body field and `@<T>` positions, 27 at
  `params:`. `lowerTypeExpr` now classifies a reserved spelling before the
  `NamedType` resolution can reach it: the other 24 spellings draw the
  registered `theta/parse/reserved-keyword-as-identifier`, and `void` draws its
  own row — now wired at all four positions — alone. No registry edit: every
  code was already registered with a trigger covering the position it fires at.
- **`true` and `false` were refused as `Type` atoms in a mixed union and
  anywhere on the `params:` right-hand side** (bug 0044, second element). Both
  are reserved keywords *and* `LiteralType` atoms, and only the boolean
  spellings match the identifier regex, so `schema X { f: true | string }` and
  `params: p: true` carried an `E` and did not load while `f: true` alone and
  every string, number and `null` sibling loaded. The arm also vanished from the
  lowered fragment — `true | string` lowered `{"anyOf":[{},{"type":"string"}]}`,
  which accepts every instance on one arm. Both now lower `{"const": true}` /
  `{"const": false}` and report nothing, matching what the top-level literal
  check already returned for the same atom. The lowered bytes feed the QRY-15
  instruction and hash into the `__theta_respond_<slug>` tool name, so affected
  annotations change respond-tool name — for inputs that did not load at all
  before.
- **`void`, `Result` and a generic-arity mismatch went unreported at the
  `params:` right-hand side, and `void` and arity at `@<T>`** (bug 0044, third
  element). The position-sensitive type-grammar checks were wired at the
  schema-body field type and each alias arm only, so the registry rows that
  already name "a `params:` field type" and "type ascription" among their
  trigger positions had no implementation there. Both positions now run the
  check — the `params:` field at the schema-feeding position, the `@<T>`
  annotation at the ascription position, where `Result` stays admitted as
  `grammar.md` §Type grammar specifies.

## [0.53.0] - 2026-08-02

### Fixed

- **A union whose last arm is a generic application was captured whole as one
  generic and never split** (bug 0043). `lowerTypeExpr`, the single recursive
  lowerer behind four of the five registered `Type` positions, tested for a
  generic application before it split a union, and it asked that question of the
  whole source: a `<` anywhere past the first character plus a trailing `>`.
  Every union whose last arm ended in `>` answered yes on that arm's own closing
  bracket. `integer | array<integer>` lowered `{}` at the alias, `schema`-body
  field, `params:` and `@<T>` positions — an AJV envelope built from it accepted
  `"not an integer"`, `{"nope":true}` and `null` and rejected nothing — while an
  `array`-headed spelling lowered the wrong concrete type
  `{"type":"array","items":{}}`, so `params: p: array<string> | integer |
  array<boolean>` refused the `3` its own `integer` arm admits and accepted
  `[{"junk":1}]`, which no arm admits. The union split now runs ahead of the
  generic test, so each arm lowers on its own terms and is combined per SUBS-1
  (`{"anyOf":[…]}`, arms in source order). The lowered bytes are conveyed to the
  model in the QRY-15 instruction and hash into the `__theta_respond_<slug>`
  tool name, so affected annotations stop sharing one slug and, having an
  `anyOf` root, move from the pass-through respond-tool wire form to the `value`
  envelope — both forms already specified.
- **`theta/parse/unresolved-named-type` under-emitted for a name inside an
  `array`-headed union** (bug 0043, second element). `schema M = array<Ghost> |
  array<integer>` raised nothing, where the same undeclared name one arm later
  (`schema M = integer | array<Ghost>`) raised: the mis-sliced generic argument
  was never identifier-shaped, so it never reached the resolution arm. Each arm
  now lowers through that arm, and `Ghost` raises the same one diagnostic in
  every spelling at all four positions. No registry edit — the row's trigger is
  stated by position and already covered them; the code merely stopped
  under-emitting against it.

## [0.52.0] - 2026-08-02

### Fixed

- **Same-line residue after a complete `schema X = …` right-hand side was
  consumed with no diagnostic** (bug 0042). The alias/union capture ends where
  the declaration grammatically ends, and nothing owned what the boundary left:
  `schema X = Cat Cat` registered a one-arm alias and severed the author's
  second name into a no-op expression statement; `schema X = Cat |` dropped the
  dangling arm inside the declaration, so no token reached the statement loop at
  all; and `schema X = -1` kept a junk `"-"` arm that lowered to the permissive
  `{}`, leaving a `params:` field or `@<T>` annotation naming `X` validating
  nothing. All three loaded with zero diagnostics, while the same missing
  separator inside an object body (`schema S { f: Cat Cat }`) was rejected.

### Added

- **`theta/parse/malformed-alias-rhs`** — a `schema X = …` (or
  `schema X by f = …`) right-hand side that is not `Type ("|" Type)*` is now
  refused at parse and the theta does not register. Two shapes: an empty arm
  position (`= Cat |`, `= | Cat`, `= Cat || Cat`), reported at the declaration;
  and same-line residue — a boundary token the right-hand side cannot hold,
  sitting on the declaration's own line (`= Cat Cat`, `= -1`, `= string
  "junk"`, `= array<integer> 42`) — reported at that token. Unchanged: a
  right-hand side that yields no arm at all keeps `theta/parse/empty-schema-body`;
  a token on the next source line still opens the next statement, whether or not
  a trailing continuation trigger swallowed the newline; a stray `,` / `)` / `=`
  / `}` keeps `theta/parse/unsupported-feature` and a `{` keeps
  `theta/parse/bare-object-literal`; and the declaration's arms, range, lowering
  and the statement a severed residue parses as are all byte-identical — the
  code's only effect is its own emission.

## [0.51.0] - 2026-08-02

### Fixed

- **A `params:` right-hand side written as a YAML block mapping loaded with no
  diagnostic and accepted any JSON value** (bug 0041). The type side of a
  `params:` field is a type expression in the theta type grammar, which is
  inline text; a field written as nested YAML instead —
  `p:` over an indented `a: Triage` — spells no type expression, but the
  frontmatter read recovered the block's bytes for any non-scalar node and the
  lowering's catch-all absorbed them, so the field lowered to the permissive
  `{}`, AJV validated nothing for it at the argument boundary, a name declared
  nowhere was never resolved, and nothing at any severity said so. The same
  bytes were recorded as the field's declared type, and a two-key block broke
  the binder's `Parameters:` block across two physical lines, against the
  one-line-per-field and declared-type-display rules. The block sequence and
  the flow sequence reached the same silence.

### Added

- **`theta/load/params-type-not-expression`** — a `params:` field whose YAML
  value node is neither a scalar nor a flow mapping, and a field carrying no
  value node at all, are now refused at load and the theta does not register.
  Refused: a block mapping or block sequence written under the field name, a
  flow sequence, an alias, any other node kind, and the value-less forms `? p`
  and `params: {p}`. Unchanged: the inline object type `{a: Triage}` is a YAML
  flow mapping and is admitted; a scalar is admitted whatever text it carries
  (the check judges the node's shape, not its text); the ordinary value-less
  key `p:` (and `params: {p: }`) parses as a null scalar and keeps its
  disposition.

## [0.50.0] - 2026-08-02

### Fixed

- **Nothing reserved the synthesised `__inline_<slug>` `$defs` name against
  author names** (bug 0040). `$defs` is one flat table holding both
  author-declared names and the names the lowering pass mints for hoisted
  inline object schemas, and no rule said an author name may not be one of the
  minted forms. An imported binding named `__inline_<16hex>` that equalled a
  minted slug therefore collapsed two distinct declarations into one entry, in
  both field orders and with no diagnostic: the inline field's `$ref` resolved
  to the imported symbol's permissive `{}`, so a `params:` field declared
  `{q: boolean}` accepted any JSON value while its recorded declared type still
  read `{q: boolean}` — the accept-anything hole at the untrusted-input
  boundary that bug 0035 had closed, re-opened whenever the name agreed. The
  casing rule already refused the `schema` / `enum` spelling, leaving the
  import specifier's local binding as the one open name-introducing position;
  after bug 0039 the same collision also silenced a `schema` body field's own
  hoisted fragment, in a file that mentioned no import in its own text.

### Added

- **`theta/parse/import-reserved-synthesised-name`** — the schema subset's four
  synthesised-name forms (`__inline_<slug>`, `__theta_respond_<slug>`,
  `__theta_bind_<slug>`, `__theta_callee_<slug>__<post-rename-name>`, with
  `<slug>` exactly 16 lowercase hex characters) are now reserved against
  author-introduced names, and an `import` / `export` specifier whose local
  binding matches one of them exactly is refused at parse time. The bare
  prefix is not reserved: `__inline_zzz`, uppercase hex, and 15- or
  17-character hex runs stay legal, since none can equal a minted slug. A
  `.thetalib` may still declare `fn __inline_<16hex>`; the refusal fires where
  the name is bound.

## [0.49.0] - 2026-08-01

### Fixed

- **An inline object type nested inside another one was neither split nor
  lowered as a type** (bug 0039). Two mechanisms, three symptoms.
  `lowerInlineObject` split its field list on top-level commas without
  tracking brace depth, so `@<{a: integer, b: {x: integer, y: string}}>` read
  as the three entries `a: integer`, `b: {x: integer`, `y: string}` and minted
  a response schema carrying a phantom top-level `y` and a three-name
  `required` — QRY-22 then refused the author's own conformant reply
  (`{"a":1,"b":{"x":1,"y":"s"}}` failed on "must have required property 'y'")
  and accepted a shape they never declared, while QRY-15 showed the model the
  same phantom schema on every repair turn. Separately, no lowerer below a
  root had an inline-object arm at all, so a nested object's shape and names
  were dropped even without a comma: `theta/parse/unresolved-named-type` was
  silent on a one-level-down typo at the `@<T>` annotation, a `schema` body
  field type and the `schema X = …` alias right-hand side — the three
  positions the registry row's five-position list names beside the `params:`
  right-hand side, which already raised — and those two positions lowered
  `properties.<field> = {}` for a nested and a flat inline object alike.
  `lowerInlineObject`'s interior split now nests brace depth, and the shared
  recursive lowerer gained the hoisting inline-object arm the `params:`
  position has had since bug 0035, factored out so both call sites run one
  implementation: an inline object type in any type position hoists into
  `$defs` under `__inline_<slug>` and its enclosing field emits a `$ref`
  (schema-subset.md §Lowering Algorithm steps 2–3), each field's type recurses
  back through the literal sublanguage so a nested `"x" | "y"` still lowers
  SUBS-1's enum form, and the whole-file `$defs` closure absorbs the minted
  entries so no `$ref` dangles. A shape the lowering cannot derive stays
  permissive `{}`: `array<{…}>` keeps `items: {}`, an empty inline `{}` keeps
  its disposition at every position, and a brace group the union split has cut
  in half keeps its per-segment lowering. Newly refused — under GOV-15's
  diagnostic-registry carve-out — is a `NamedType` resolving to nothing that
  the widened descent now reaches: inside inline-object fields at depth 1 or
  deeper, and inside a brace-group union arm, at those three positions. No
  registry edit: the row already named all five positions.
  `tests/inline-object-nested-lowering.test.ts` (58 tests) locks it, over the
  real load path, the production AJV validator and the respond-tool wire
  shape, with the minted slugs derived from an independent `node:crypto`
  oracle rather than from `schemaSlug`.

## [0.48.0] - 2026-08-01

### Fixed

- **The `TypeEnv` was a plain `{}`, so a `NamedType` naming one of the twelve
  `Object.prototype` own property names resolved as a declared type** (bug
  0038). Two symptoms, one mechanism. `let c: constructor = 3` reported
  `theta/parse/let-rhs-type-mismatch` against a type no declaration declares,
  in a parse where `theta/parse/unresolved-named-type` called the same name
  unresolved; and `let r = 1 + constructor` — a two-line body, no `schema`, no
  `fn` — threw `TypeError: Cannot read properties of undefined (reading
  'kind')` out of `parseThetaDocument`, taking down the whole compose pass so
  that every clean theta in the same discovery root went unregistered with no
  author-visible per-file diagnostic. The throwing surface needed no
  annotation: `s.toString + 1`, `toString() + 1` and `"x".toString() + 1`
  reached it through the static-type inference arms that mint a `named` type
  from an author-chosen name. `collectTypeEnv` now builds its record with
  `Object.create(null)`, matching the sibling declared-field record bug 0031
  null-prototyped one level down, and all eight read sites resolve through one
  exported `resolveNamed(env, name)` that answers own keys only — so the fix
  holds for a `TypeEnv` constructed anywhere, not only at `collectTypeEnv`.
  Each half is independently load-bearing and independently witnessed. An
  unresolvable name now answers `"unknown"` and defers to the runtime AJV net,
  which is what `type-system.md` §Unresolvable operands requires and what the
  registered `let-rhs-type-mismatch` trigger's "statically resolvable"
  qualifier already presupposed: the implementation moved to match the
  registry, so no row, trigger or code changed (DIAG-2 holds, H9a's
  permitted-code list untouched). No runtime change — both edited files are
  parse-phase. Locked by `tests/typeenv-prototype-names.test.ts` (78 tests):
  the wrong-diagnostic and throwing rows, the prototype-name family as a table
  over `Object.getOwnPropertyNames(Object.prototype)`, the load consequence
  through the shipped composition root over a temp discovery root, the engine
  pins on both env constructions, and the author-reachable `__proto__` write.
  Default gate 238 files / 3054 tests green, lint and typecheck clean; H8a 7/7
  and the full live suite 35/35 green.

## [0.47.0] - 2026-08-01

### Fixed

- **Placeholder-rendering §5's second `<key>` test vector labelled the bracket
  spelling `obj["kind"]` "A member access", the name `expressions.md:9`
  reserves for `a.b`** (bug 0037). The vector's substance was correct and
  locked — the `<key>` rule is a runtime predicate on the key string, and the
  rendered `missing object key: kind` is pinned at the renderer and at the
  emission site by bug 0036's tests — but a normative page named a grammar
  production its own quoted example does not use, contradicting the
  `expressions.md §Supported forms` naming authority a reader would reconcile
  it against. The sentence now reads "An indexed access `obj["kind"]` …",
  matching `expressions.md:10`; every other byte, including the rendered
  string and the identifier-shape parenthetical, is unchanged. Prose only: no
  behavioural surface, no registry edit (DIAG-2 holds — the
  `theta/runtime/missing-object-key` row already covered both spellings since
  bug 0032), no `docs/reference/` mirror repeats the vector sentence, no test
  file changed, and the sibling `:19` vector is left as found so the verbatim
  quotation of it in the 0036 lock does not stale. No test witness exists and
  none was manufactured: the only mechanism that reads the page is the
  closing gate, whose full output is byte-identical across the substitution
  (2217 findings, gated arms empty both sides), and the sole constructible
  witness — a prose-matching assertion — would invert DIAG-4. Default gate 237
  files / 2976 tests green, lint and typecheck clean, H8a 7/7 green as
  no-regression cover.

## [0.46.0] - 2026-08-01

### Fixed

- **The repeat-`session_start` supersession pass never awaited
  `handle.whenIdle()`, so a superseded-generation rebuild already in flight
  published into the drained registry and re-registered its slash names after
  the superseding generation had registered** (bug 0034). Pi's registration is
  last-writer within one extension instance and exposes no unregister, so every
  name the leaked rebuild carried dispatched `theta /<name>: extension shutting
  down` on a live session until `/reload`. The trigger was overlap, not an error
  path: any watcher rebuild whose debounce window closed during the superseding
  compose was in flight at the supersession instant. Now the pass, before any
  mutating step, reads the outgoing hot-reload handle, marks its debouncer
  torn-down, and bounded-awaits the in-flight rebuild against a cap the
  supersession path owns (`SUPERSESSION_QUIESCE_CAP_MS`, captured at the
  quiesce rather than at `session_shutdown` handler entry), then re-evaluates
  the staleness predicate before the fold, drain, detach, publish and
  registration — which still run in one synchronous run-to-completion. The
  settling rebuild therefore re-registers against a still-undrained
  generation-1 registry and generation 2's registration lands last. A repeat
  `session_start` delivery is now bounded-blocking on the superseded
  generation's rebuild; a rebuild still running at the cap is abandoned under
  the torn-down mark with no diagnostic. Spec: `#repeat-start-supersession`
  gains the normative two-act sentence (bound's existence contracted, not its
  value), PIC-57 records its second prescribed await site, and
  `theta/host/session-start-supersession-detach-failed`'s closed `details.call`
  set widens to two members. No new diagnostic code. Locked by
  `tests/supersession-inflight-rebuild-quiesce.test.ts` (6 offline tests over
  the real factory, hot-reload handle and debouncer; five neutralisation
  directions verified, including that the await rather than the mark closes the
  defect), with H8a, H9a 11/11 and the live double-`bindExtensions` witness
  green, and a scratch live probe proving the fixed path red-before/green-after
  on a real session.

## [0.45.0] - 2026-07-31

### Fixed

- **The `schema X = A | B` type-alias / union declaration did not parse: the
  head registered as a field-less schema, the shape was re-lexed as
  statements (`stray '='` / `stray '|'`), and the whole discriminated-union
  checker seam had no caller** (bug 0033). A normative theta 1.0 declaration
  form was absent (the parser implemented only the object form), the
  rejection was misattributed (`unsupported-feature` on punctuation;
  `immutable-rebinding` against an unrelated `let` for the `by` form), seven
  registered codes were unreachable from source, and `schema X by f { … }`
  loaded silently where rejection is prescribed. Now: `SchemaDecl` carries
  the alias/union arms and the optional `by` field; `parseSchema` dispatches
  four ways with bounded RHS capture (the swallowed continuation newline
  after `>` / `=` can no longer absorb the next statement —
  keyword/punct arm-boundary stops, inline-object arms consumed whole);
  `checkByClause`, `checkDiscriminatedUnion` (theta-side `by` resolution,
  literal-unions excluded as candidates) and `detectTypeAliasCycles`
  (participant-anchored diagnostics) run end-to-end, and each arm gets the
  same schema-feeding type-source checks as an object field; the RHS lowers
  per SUBS-1 (`anyOf` in source arm order for object unions) so alias names
  resolve concretely at `@<T>` and `params:`; `collectTypeEnv` registers
  transparent alias entries (TYPE-11/TYPE-4 gain reachable subjects) and
  omits cycle participants — a cycle-typed use previously crashed the
  worker process or threw `RangeError` out of the parse. Headless and
  mis-bodied heads draw `empty-schema-body`; `by` on an object body or a
  <2-arm RHS draws `by-on-object-schema`. Three Trigger-only registry
  widenings, no new code. Discharges 0025's and 0028's alias-form
  coordination clauses. Locked by `tests/schema-alias-union-decl.test.ts`
  (77 offline tests incl. real-AJV round-trips, cycle-crash regressions,
  and pinned residuals; three neutralisation directions verified; H8a 7/7
  twice and H9a acceptance 11/11 green).

## [0.44.0] - 2026-07-31

### Fixed

- **An inline object type on the `params:` right-hand side was discarded
  before it was lowered: `p: {a: Tirage, b: integer}` loaded clean, lowered
  `properties.p = {}`, recorded the field's declared type as the empty
  string, and raised none of the `theta/parse/unresolved-named-type` its
  sibling positions raise for the identical text** (bug 0035). Two frames
  dropped the same declaration: the frontmatter read substituted `""` for a
  non-scalar RHS (an unquoted flow mapping never reached the lowering at
  all), and the `params:` lowering had no inline-object arm (a quoted RHS
  fell to the permissive catch-all). Both closed: `extractParsedParams`
  recovers the author's own bytes by slicing the value node's range out of
  the frontmatter YAML text, and the new `params:`-scoped
  `lowerParamsFieldType` lowers a brace-rooted field — hoisting the
  anonymous object under `__inline_<slug>` (canonical schema hash) and
  emitting `{"$ref": "#/$defs/__inline_<slug>"}` per schema-subset.md
  §Lowering steps 2–3, with unresolved names sunk through the threaded
  resolution set so the typo raises byte-identically to the `@<T>` and
  schema-body positions. The interior comma split nests brace depth (a
  nested multi-field object is one field's type, not three), and the
  §Schema-slug collision posture's byte-equality check is wired
  (first-wins retention; differing bytes raise the registered
  `theta/load/schema-slug-collision`). `lowerTypeExpr` is untouched — no
  other position's lowered bytes move; `p: {}` and brace-under-generic
  shapes keep their dispositions; no spec or registry edit. The binder
  Parameters line now renders the declared inline type instead of `()`,
  and the AJV argument envelope validates the declared shape instead of
  accepting anything. Locked by
  `tests/params-inline-object-lowering.test.ts` (37 offline tests with an
  independent canonical-hash oracle and a real-AJV boundary group; three
  neutralisation directions verified; H8a 7/7 and H9a acceptance 11/11
  green).

## [0.43.0] - 2026-07-31

### Fixed

- **Schema-constructor field values were never checked against the declared
  field types: `Point { x: "hello" }` loaded clean and minted a
  `Point`-branded value** (bug 0031). The type-phase `object` arm recursed
  into field values and passed nothing down — no `checkCompatible` call, no
  `array<T>` element sink (an unimplemented member of grammar.md's
  exhaustive sink set) — while the identical value/type pairs one position
  over at a typed `let` all reported. Branded-but-malformed values falsified
  the compatibility engine's premise, and `Holder { r: Ok(1) }` smuggled a
  `Result` into the state `theta/parse/result-in-schema-position` exists to
  make unrepresentable. Declared field types are now carried into the
  `TypeEnv` (null-prototyped, own-key-guarded — theta field names may
  collide with `Object.prototype` members) and each constructor field in
  the literal∩declaration intersection is checked with the same engine the
  typed-`let` arm uses: incompatible → the new
  `theta/parse/object-field-type-mismatch` (DIAG-2 row + reference mirror +
  the type-system.md check-site enumeration entry, same commit); a
  `number`→`integer` narrowing → the registered `integer-narrowing`; an
  array literal under `array<T>` additionally rides the declared element
  sink through the registered `array-element-type-mismatch`; a
  `result-ctor` field value is rejected outright. Coverage matches the
  `let` position's (statically-resolvable operands only; residues r1–r5
  pinned silent). No runtime change — brand sites untouched. Locked by
  `tests/ctor-field-type-check.test.ts` (30 offline tests: w1–w5 red-first,
  intersection rule, c1–c7 controls, ten residue negatives,
  production-executor brand observables, prototype-collision pins, DIAG-4
  drift guard; both directions verified; H8a + H9a acceptance green).

## [0.42.0] - 2026-07-31

### Fixed

- **Member access on an absent name bound raw JS `undefined`, an out-of-model
  value: `o.absent == null` was `false`, `o["absent"]` panicked on the same
  name, and expressions.md prescribed no absent-member disposition**
  (bug 0032). `evaluateMemberAccess` guarded only `null` and read the
  property unfiltered, so a typo'd or missing field yielded a value outside
  `ThetaValue` that the in-language absence test reported as present
  (`== null` → `false`), stringified as `"undefined"`, survived constructor
  and array storage, and aborted the theta as `internal-error` one read
  later — while the index spelling of the same name panicked and `has(k)`
  answered correctly. The spec is amended first (expressions.md member
  bullet, error-model.md panic bullet, the `missing-object-key` registry
  row's Trigger — a DIAG-2 same-commit widening — and the reference
  mirror): member OR indexed access on an absent theta-side name panics
  with the existing `theta/runtime/missing-object-key`; the panic list
  stays closed at six. One shared presence gate (`assertKeyPresent`) is now
  the single construction site for the panic — both spellings render one
  absent name byte-identically through bug 0036's category-5 interpolation
  point — ordered after the `null` guard and bug 0027's receiver gate.
  `Enum.Variant`, `length` on `string`/`array`, `has`/`keys`, and the
  parse layer are untouched. Discharges bug 0027 §Fix (0.39.0) residual
  (i); control i7 re-anchored to the unit seam (its in-language probe was
  this bug's own bind). Locked by
  `tests/absent-member-presence-gate.test.ts` (34 offline tests through the
  production executor, every red naming its pre-fix leak; both directions
  and the one-construction-site property verified; H8a live acceptance
  green).

## [0.41.0] - 2026-07-31

### Fixed

- **`MissingObjectKeyPanic` interpolated `<key>` bare-always, so `o["my-key"]`
  rendered `missing object key: my-key` where placeholder-rendering §5's own
  normative vector pins `missing object key: "my-key"`** (bug 0036). The one
  emission site (`evaluateIndexAccess`, `runtime-panics.ts`) built the message
  with raw template-literal interpolation, bypassing the conformant category-5
  renderer that sat in-tree with zero production callers — the suite affirmed
  the §5 rule at the unit level while the wire behaviour diverged from it.
  The site now routes through
  `renderSourceDerived({ kind: "key", text: key })`: a non-identifier-shaped
  key renders double-quoted (preserving the stringly-`"25"`/numeric-`25`
  distinction), an identifier-shaped key stays byte-unchanged bare, per the
  §5 predicate and its reserved-keyword carve-out. No spec amendment, no
  registry edit, no new code; H9a's permitted-code list unchanged. Discharges
  bug 0027 §Fix (0.39.0) residual (iii). Locked by
  `tests/missing-object-key-rendering.test.ts` (7 offline tests — executor
  route and direct throw site, both directions verified; renderer-side §5
  vector pins untouched; H8a live acceptance green).

## [0.40.0] - 2026-07-31

### Fixed

- **A throwing supersession detach was swallowed with zero evidence, and
  `detach()`'s fallible-first step order skipped every containment mark, so
  a debounce window pending at supersession still drove one
  superseded-generation reload pass that published and re-registered against
  a drained registry** (bug 0029). `HotReloadHandle.detach()` ran its one
  fallible step (`unsub()` — in production a chokidar `close()`) first, so a
  synchronous throw skipped `debouncer.cancel()` and both torn-down marks —
  the two guards the spec's no-rebuild-after-supersession MUST rests on —
  and the factory's catch was `void e`: no diagnostic, no note, no stderr.
  `detach()` is now containment-first (`tornDown = true;
  debouncer.markTornDown(); unsub();` — the `quiesceOnStaleCtx` order, for
  both callers), so a throwing unsub strands only OS-level watcher handles
  and no superseded-generation reload can start; and the swallow now emits
  exactly one `theta/host/session-start-supersession-detach-failed` (W)
  through the bootstrap diagnostic sink — `session_start supersession detach
  failed at <call>: <error>`, `details.call = "hotReloadHandle.detach"` —
  defended by its own catch so a throwing sink cannot abort the superseding
  pass. Spec: new DIAG-2 row in `code-registry-host.md` (live-session
  routing exception noted), a normative catch-and-emit sentence in
  `registration-steps.md#repeat-start-supersession`, `diagnostic-shape.md` /
  `docs/reference/diagnostics.md` channel corrections, and the slug appended
  to H9a's permitted-code list. In-flight-rebuild gap remains bug 0034.
  Locked by `tests/supersession-detach-throw-containment.test.ts` (4 offline
  tests, both directions verified; live double-session-start and H9a
  acceptance green).

## [0.39.0] - 2026-07-30

### Fixed

- **Runtime receiver dispatch classified by JS `typeof`, so enum and `Result`
  values took the object read surfaces and exposed their reference encoding
  to ordinary theta code** (bug 0027). `s.keys()` on an enum value answered
  the boxed-`String` carrier's index properties (`["0","1","2","3"]`),
  `s["0"]` read one character of the wire string, `s.length` read the
  wrapper's own `length`, and `r.ok` / `r.keys()` read the `Result`
  discriminator and payload outside the closed `Ok`/`Err`/`match`/`?`
  observation surface — while any *other* member (`s.toUpperCase()`,
  `r.bogus()`) aborted the theta as `theta/runtime/internal-error` where
  expressions.md pins a diagnosis "rather than a runtime failure". One shared
  classifier (`isObjectValue`, false for enum and `Result` values) now gates
  all four read entry points — both stdlib-method hosts in lockstep, the
  widened indexed-access guard (whose whole input class, primitives included,
  now carries a registered code), and member access — rejecting the read
  with the new registered runtime-defect-surface code
  `theta/runtime/non-object-receiver` (`non-object receiver: cannot read
  <read> on <receiver kind>`), routed like `internal-error` and deliberately
  not a panic: the closed six-source panic list is untouched, `match` and
  `?` are unaffected, and an out-of-model receiver (bug 0032's `undefined`
  bind) keeps its internal-error disposition. Spec: new DIAG-2 registry row,
  the error-model runtime-defect surface admits registered non-panic
  rejections, and the two new placeholders join the placeholder-closure
  carve-outs (`<read>` bespoke, `<receiver kind>` closed-enum). Locked by
  `tests/non-object-receiver-gate.test.ts` (37 offline tests through the
  production executor, byte-exact template pins, both directions verified).

## [0.38.0] - 2026-07-30

### Fixed

- **A typed-query annotation naming no lowerable declaration lowered to the
  accept-anything `{}` with no diagnostic, so the QRY-22 gate validated nothing
  and any payload bound as the typed value.** `lowerTypeExpr` had one
  unresolved arm — push the name onto a list, return `{}` — and whether that
  became a diagnostic was decided entirely by which caller built the context.
  `parseParams` read the list back and errored; `lowerTypeSource` built a fresh
  list and discarded it, and every non-`params:` lowering site sat above
  `lowerTypeSource`. Three resolution gaps fed the arm. `buildBodyTypeMap` and
  `buildBodyTypeSchemas` lowered schema bodies single-pass in declaration
  order, so `Tree.children: array<Tree>` lowered `items: {}` always and
  `Person.pets: array<Animal>` lowered `items: {}` exactly when `Animal` was
  declared after `Person` — the declaration order of `schemas.md` §Recursion's
  own normative example, whose specified emission is `$ref`. `schemaDeclsOf`
  filtered `kind === "schema"`, so a declared `enum` at the annotation root
  never resolved and lowered `{}` where `schema-subset.md` §Lowering Algorithm
  step 3 pins `{"type":"string","enum":[…]}`. And a name declared nowhere — one
  typo'd letter in `@<Tirage>` — parsed diagnostic-identically to the correct
  spelling, marked the query typed, and validated the response against `{}`,
  while the sibling `params: { a: Tirage }` position failed the load with
  `theta/parse/unresolved-named-type`. `invoke<T>` and the FN-6 `subagent fn`
  return boundary shared every position through the same lowering call.
  Fix, in one commit. `buildBodyTypeSchemas` now runs three passes: pass 1
  seeds a placeholder for every top-level `schema`/`enum` name before any body
  lowers, pass 2 lowers each body against the fully seeded map while mutating
  the pass-1 placeholder identity in place, and pass 3 attaches a flat
  transitive `$defs` closure. Forward, mutual and self references resolve by
  construction, and `pruneDocumentDefs`'s missing-fragment guard is satisfied
  because every minted `$ref` carries a registered body before the hoist walk.
  `parseParams` gains the matching `hoistNestedDefs` step, without which a name
  reachable only through another name's nested `$defs` dangled from the params
  document root and the raw AJV `MissingRefError` escaped the binder dispatch
  after the binder call had spent tokens; this also heals the pre-existing
  backward-chain break, so `params: p: Item` with `Item.loc: Loc` now compiles
  and rejects a bad nested payload. `schemaDeclsOf` gains the sibling
  `enumDeclsOf`, passed at both `lowerQueryResponseSchema` call sites.
  An error-severity `theta/parse/unresolved-named-type` now fires at every
  position `lowerTypeSource` serves — the `@<T>` annotation root (which covers
  the inline-object annotation's fields and the direct-`let` form whose
  ascription propagates into `QueryExpr.schema`) and the `schema` body field
  type — emitted from a threaded resolution set rather than from the lowering
  result, because `collectBodyTypes` maps alias-form and imported names to `{}`
  deliberately, *as resolved*. No registry edit: bug 0025 wrote the widened
  four-position row, and this change implements the two positions it
  over-stated. `lowerQueryResponseSchema` stays a total function returning `{}`
  — with the parse gate in place the seam is unreachable for this input from
  source, so it remains defence in depth. A `Result<T, E>` annotation is peeled
  to `T` with a brace-aware argument split, so
  `let r: Result<string, QueryError> = @`…`` and
  `let r: Result<{a: string, b: integer}, QueryError> = @`…`` keep loading while
  a typo on the `T` side is still refused.
- **The respond tool is registered with a wire envelope, and nested `$ref`
  parameters are coerced at the argument boundary.** Live verification of the
  above found two shapes that could not be conveyed to a real model at all. A
  tool call's `arguments` are a JSON object at the wire and the host validates
  them against the registered `parameters` before `execute` runs, so the enum's
  non-object root rejected every call the model could emit (`root: must be
  string`, `Received arguments: {}`) and the drive repair-spun into
  `theta/runtime/reload-teardown-timeout` with the invocation still in flight;
  the pre-existing `@<string>` path did the same. And models deliver a nested
  object parameter as a single JSON-encoded string, which the host's own
  coercion does not parse, so every schema with a nested named-schema reference
  came back as `pet: must be object` and spun — including the *backward*
  reference that already minted a `$ref` before this change.
  `src/runtime/respond-tool-wire.ts` (new) is one recipe feeding the on-session
  registration, the off-session entry and the QRY-15/QRY-12 template input. An
  object-admitting root — and the `{}` total-function residual — is its own wire
  schema byte for byte; every other root (a `type` excluding `object`, an
  `enum`/`const` literal set, an `anyOf`/`oneOf` union, a root `$ref`) is
  carried under `{"type":"object","properties":{"value":<lowered>},"required":["value"]}`
  with the root `$defs` table lifted to the envelope root, because a
  `#/$defs/<Name>` pointer resolves against the document root alone. The
  payload is recovered through one boundary function at the three arrival sites
  (the live `execute`, the off-session free-phase servicing, the forced
  dispatch's extraction), so the CIO-3 depth walk, the QRY-14 `execute` verdict
  and the QRY-22 loop validation all still run over the bare payload against
  the bare lowered schema; `<slug>` and the PIC-44 canonical bytes stay keyed
  to the lowered schema. A call carrying no `value` member is taken verbatim so
  it fails validation and enters respond-repair rather than being rewritten to
  an absent value. `coerceRespondWireArguments`, wired through
  `ToolDefinition.prepareArguments` (pi's own pre-validation shim, and the only
  hook that runs before the host validates), parses JSON-string-valued
  object/array positions back before validation: schema-directed, so a declared
  `string` field keeps a JSON-looking value; encoding-only, so a parse yielding
  the wrong type still reports the real mismatch; and `$ref`-following with a
  chase bound. `query/query-tool-loop.md` gains normative §Respond-tool wire
  schema; QRY-12, QRY-14, QRY-22 and `implementation-notes.md` are amended to
  denote the wire schema where they described the lowered one. No new REQ-ID,
  no new diagnostic code, and an object-rooted typed query registers and
  conveys the same bytes it did before.
  Locked by `tests/unresolved-annotation-lowering.test.ts` (40 cells),
  `tests/respond-tool-wire.test.ts` (24 cells), strengthened depth-enforcement
  assertions in `tests/query-schema-transitive-defs.test.ts`, and the live twin
  `tests/live/typed-query-wire-shapes.test.ts` — a declared `enum` root and a
  forward-declared nested `$ref`, each driven end to end against a real model
  and raced against a wall bound, because the pre-fix behaviour of both is
  non-termination. Bug
  [0028](docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md);
  the `params:` right-hand side's remaining inline-object gap is filed as
  [0035](docs/bugs/0035-params-rhs-inline-object-under-emission.md).

## [0.37.0] - 2026-07-30

### Fixed

- **A constructor naming a schema that does not exist — or naming an `enum` —
  loaded with zero diagnostics and evaluated to an unbranded plain object, the
  exact value the bare-object-literal ban exists to prevent.** `checkObjectExpr`
  was the whole static story for `Schema { field: expr, … }` and checked only
  field-set presence, both of which need the declared shape; a constructor name
  missing from the same-file object-schema map therefore took a silent defer
  arm. Three classes collapsed into one — a name resolving to no declaration, a
  name resolving to a declaration that is not brace-constructible, and an
  imported `.thetalib` symbol whose field bodies are genuinely unavailable — and
  the first two inherited the third's silence. `Mystery { r: Ok(1) }` evaluated
  through the same executor arm a declared constructor uses, failed
  `resolveSchema`, and returned the field object with its name discarded and no
  brand. Because the inferred type was the nominal placeholder `named
  "Mystery"` and the compatibility engine maps an unresolvable name to
  `"unknown"`, the value also passed every annotated sink: `let p: Point =
  Mystery { … }` and `let n: number = Mystery { a: 1 }` both loaded clean. A
  misspelling of a declared schema produced no signal at any phase, while the
  same name one brace apart (`let a = Mystery`) was
  `theta/parse/unknown-identifier`.
  Fix, spec first.
  `docs/spec_topics/diagnostics/code-registry-parse.md` widens
  `theta/parse/unresolved-named-type` (DIAG-2) from the `params:` right-hand
  side to a closed four-position list — `params:` RHS, `@<T>` query annotation,
  `schema` body field type, object-constructor name — with resolution stated as
  whole-file over the body's top-level declarations, and with the constructor
  position carrying the added requirement that the resolved declaration be
  brace-constructible. One row, one message (`unresolved named type '<name>'`),
  severity `E`; the row is shared with bug 0028, which lands code only.
  `docs/spec_topics/expressions.md` §Object construction gains the matching
  normative paragraph. In `src/parser/theta-document.ts`, `checkStructural`
  takes the whole-file type-declaring universe already built by
  `collectBodyTypes` — not `collectIdentRoots`, which folds in `params:` field
  names, `tools:` callable names and the stdlib builtins — and `checkObjectExpr`
  classifies a name its object-schema map misses: an imported symbol defers
  whatever its kind, because the importer's parse holds neither its field
  bodies nor its kind; an `enum`, a `schema` declared without an object body,
  and a name resolving to no top-level declaration each fire the widened code.
  No runtime change — the input never loads, so both brand sites and
  `resolveSchema` are untouched. `theta/parse/unknown-identifier` is not
  widened. Constructor field-*value* typing remains bug 0031.
  Previously clean-loading programs are newly rejected; the
  [GOV-15 diagnostic-registry
  carve-out](docs/spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  admits a trigger widening within a 1.x minor.
  Locked by `tests/ctor-unresolved-schema-name.test.ts` (24 offline cells: the
  DIAG-2 row contract, the reject fixtures including a nested constructor, a
  block-nested declaration, a variant-less `enum` and an alias/union head, the
  two imported-symbol defer cells, eleven controls holding the existing gates,
  and the shipped composition root refusing to register the theta) and by
  `tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` (a real `pi -p`
  run whose prober turns the refusal into a positive stdout sentinel while a
  matched-pair control still registers and drives). No new diagnostic code, so
  `tests/fixtures/h7a/permitted-codes.json` is unchanged.
  ([bug 0025](docs/bugs/0025-ctor-unresolved-schema-name-passthrough.md))

## [0.36.0] - 2026-07-30

### Fixed

- **After any re-bind of one extension instance — a shutdown-less repeat
  `session_start` (the bug-0021 supersession pass) or a start-after-shutdown
  rebind — every slash name whose `.theta` was still on disk went dead until
  `/reload`. The new pass's compose read `pi.getCommands()` for its
  cross-format collision check with no own-name exclusion, and Pi reports an
  extension's own registered commands with `source: "extension"`,
  indistinguishable from a sibling extension's, so generation 1's own
  `/greet` read as a foreign collision: the re-discovered `greet.theta` was
  dropped, no second `pi.registerCommand` issued, an error-severity
  `theta/load/cross-format-collision` note misdescribed the cause ("Pi-owned
  command 'greet' survives"), and the live `/greet` stayed bound to the
  superseded generation's registry — which the supersession drains — so every
  dispatch on the running session answered `theta /greet: extension shutting
  down`. The exclusion mechanism existed but was wired only to the hot-reload
  path, where it rested on a code comment and no spec text; step 3's own
  normative rule, keyed on `source` membership, literally mandated the
  self-drop.** Fix, spec first.
  `docs/spec_topics/pi-integration-contract/registration-steps.md` gains
  **PIC-69**: on every pass that consults `pi.getCommands()` for the collision
  check — first `session_start`, hot-reload, supersession, and
  start-after-shutdown rebind alike — the instance MUST exclude every entry
  that both carries `source: "extension"` and bears a name it itself passed to
  `pi.registerCommand`; the excluded set is pinned as the instance's own
  registration LEDGER rather than its current `ThetaRegistry` keys, and the
  exclusion is pinned source-conditioned, never name-only. Its companion
  clause `#surviving-name-re-ownership` pins that a surviving name
  re-registers against the new generation's registry and emits no collision
  diagnostic, while a name whose `.theta` is gone keeps the arm-(b)
  shutting-down note. Sibling indistinguishability is recorded in the pin as a
  known limitation. DISC-4 arm 2, `#superseded-entry-dispatch`, the
  `pi.getCommands()` completeness presupposition and the discovery reference
  carry the parallel qualification; `coverage-matrix.md` gains the PIC-69 row.
  In code, `src/extension/factory.ts` keeps a factory-closure ledger of every
  name passed to `pi.registerCommand` (stamped even when the call throws) and
  threads it through `composeInstance` into
  `src/extension/production-composition.ts`, which forwards it to the initial
  compose pass — where `undefined` was hard-coded — and prefers it over the
  registry-snapshot carve-out on hot-reload; `readPiOwnedCommands` now applies
  the exclusion after the source filter and gated on `source === "extension"`,
  closing the pre-existing hole where a name-keyed skip also hid a genuine
  `"prompt"` / `"skill"` collision. The registry drain is untouched: a removed
  name still fails safe with the spec-pinned note. Offline lock:
  `tests/rebind-self-collision-reownership.test.ts` (new, six tests — both
  triggers, the source-conditioning control, the ledger-vs-registry-keys
  discriminator, the removed-name control and the foreign-`extension`-entry
  control), plus `tests/double-session-start-supersession.test.ts`'s length-1
  witness flipped to 2. Live lock:
  `tests/live/double-session-start-live.test.ts` now witnesses re-ownership
  across a real `bindExtensions()` re-bind — no collision note, no
  shutting-down note at dispatch, the rendered outbound query text as the
  non-vacuity guard — alongside bug 0021's watcher-leak assertion; H9a 10/10
  green with no new stderr line and no new permitted code (bug 0024).

## [0.35.0] - 2026-07-30

### Fixed

- **Neither live suite tested whether a theta-owned stderr *line* was present,
  although three shipped fixes cite exactly that as their regression witness.
  H9a (`tests/live/acceptance/noninteractive-acceptance.test.ts`) is the only
  always-run black-box capture of the real `pi -p` process tree's stderr, and
  all three of its stderr-reading assertions score note *content*: the
  nine-area `assertCodesSubsetOfPermitted` extracts
  `theta/{load,parse,runtime}/<slug>` substrings and checks them against the
  permitted list, and area (e)'s two extra checks match `/cancel|aborted/i`
  and `theta/runtime/internal-error`. A `theta hot-reload quiesced:` line
  (bug 0021's live observable) carries no slug and no cancel token, so it
  passed all nine areas green; a `system-note delivery failed:` cascade was
  caught only when the quoted note happened to embed a non-permitted slug, or
  — in area (e) alone — `theta/runtime/internal-error`. H8a
  (`tests/live/live-production-acceptance.test.ts`) read stderr nowhere and
  had no capture mechanism at all, although bug 0018's fix record cites its
  "0-byte stderr capture" as the live verification observable. Separately,
  three live test file headers still opened with an `INTENDED-REASON RED
  (current state)` banner: the two H9a ones declared the suite's nine feature
  fixtures unauthored — resolved 1 h 48 min after the banner was written, when
  the paired commit authored all nine — and the H8a one declared the shipped
  composition root registers no `.theta`-derived slash command, false since
  `composeInstance` was wired (bug 0030).** Per AGENTS.md §"Verify both
  directions", a live assertion that cannot red is worthless; for stderr-line
  presence neither suite had one. Fix, three parts. (1) `assertStderrClean`
  (`tests/live/acceptance/harness.ts`) runs beside
  `assertCodesSubsetOfPermitted` at all ten H9a spawn sites, so a regression
  manifesting under one spawn shape reds where it happens; no tenth area is
  added and the `(a)–(i)` manifest contract is unchanged. The gate's form was
  fixed by measurement before it was written — one instrumented nine-area run
  recorded 0 bytes of stderr on all ten spawns, selecting the strictest branch
  of the bug document's own rule — so the gate asserts an EMPTY capture with a
  committed allowlist that ships empty; populating that allowlist reactively
  from a first red is forbidden, and weakening the form requires a re-recorded
  baseline. It is orthogonal to the permitted-code list: it rejects the
  delivery mechanism regardless of which code a line quotes, while the
  permitted list keeps governing note content on stdout — so
  `theta/runtime/internal-error` stays sanctioned as note content and is a
  defect when it arrives inside a `system-note delivery failed:` cascade on
  stderr. (2) H8a gains a file-scope `vi.spyOn(console, "error")` whose
  teardown asserts zero theta-owned lines before restoring the spy in a
  `finally`, putting a coded gate where bug 0018's cited observable lives; the
  spy writes through, so real diagnostics stay visible. Both gates read one
  shared prefix module, `tests/live/theta-stderr-prefixes.ts`, which imports
  `STALE_QUIESCE_STDERR_PREFIX` from `src/extension/stale-ctx.ts` rather than
  re-literalising it. (3) All three stale banners and their seven in-file
  echoes are replaced by current-state text — fixtures committed, suites
  green, correct-reason reds tracked through `docs/bugs/` — and the H9a
  invariant list drops the cancellation-propagation claim its area (e) rewrite
  had already relocated. `theta/load/extension-compose-failed`, minted by bug
  0023, is written into `tests/fixtures/h7a/permitted-codes.json`. Locked by
  32 offline tests in the default suite (`tests/acceptance-stderr-gate.test.ts`),
  which feed both predicates the five synthetic stderr lines and prove the new
  gate reds on the three the old ones missed; and red-proven at the live axis
  in both directions — one temporary `console.error` probe in the
  `session_start` handler made H9a area (a) fail from `assertStderrClean`
  naming the line and its class, and H8a fail from the spy's zero assertion,
  with both green again after the probe was removed. This gate witnesses a
  0021-class regression; it does not witness bugs 0023 or 0029, which are
  silence defects a stderr gate cannot red on.

## [0.34.0] - 2026-07-29

### Fixed

- **The shipped production composition omitted three of the seven seams
  `ThetaExtensionDeps` declares, so three implemented-and-unit-tested V-leaves
  were inert in the extension that actually ships: every bootstrap diagnostic
  the factory constructed was dropped by a `deps.emitDiagnostic?.()` optional
  chain (V9k/V9p) — a `pi.registerFlag` abort, a `pi.on` subscription failure,
  a per-theta `pi.registerCommand` failure, a `pi.getCommands` collision-pass
  read failure and any compose-pass throw all yielded no transcript note, no
  toast and no stderr line, although the registry's remedy column names
  `/reload` and so presupposes the operator learns a recovery is needed; the
  `RendererGate` was unwired at both ends, so the renderer-degrade route to
  `ctx.ui.notify` never engaged on the one surface the fallback chain exists
  for; and the step-0 capability probe had no caller in `src/**` at all, so an
  incompatible host — below the Node floor, missing an `AbortSignal` member,
  missing a factory-probable SDK member, carrying an out-of-range lock-step
  peer, or lacking a callable `Type.Unsafe` — was never refused at load and
  failed later as an uncaught `TypeError`, the outcome PIC-5's enumeration
  exists to prevent. The one catch that saw every compose-pass throw also
  labelled it `capability: "pi.registerCommand"`, so a `ctx.cwd` read failure
  in the discovery walk reported as a slash-registration failure (bug 0023).**
  One root cause: the default export constructed the factory with those seams
  absent, and every existing witness drove `createThetaExtension` with an
  injected recorder, so the offline suite was structurally blind to the
  production wiring. Fix, all four settled elements. (1) A two-tier bootstrap
  sink, `createBootstrapDiagnosticSink` — tier 1 (no `ctx` latched) delivers
  through the partial `pi.sendMessage` → `console.error` chain, the
  `ctx.ui.notify` rung being unreachable before any `ExtensionContext` exists;
  tier 2 (a `ctx` latched by the new `latchSessionContext` seam, called as the
  first statement of the `session_start` handler) delivers through the full
  `sendSystemNote` → `ctx.ui.notify` → `console.error` chain over channel deps
  built once per latched `ctx`, so the channel's stale-dead and
  fail-loud-once latches persist across emissions. Both tiers absorb an
  `isStaleCtxError` throw without delivering (PIC-67 clause (c)) and share one
  wrapped terminal `console.error` (PIC-54). Ten emission sites, all wired —
  the eleventh was the dead `runProductionRegistration` / `discoverFixtures`
  seam, deleted. (2) One `RendererGate` per extension instance, degraded on
  the renderer-registration catch and threaded to all three live
  `buildSystemNoteDeps` sites plus the hot-reload rebuild pass, so
  `system-note-channel.ts`'s degrade branch reads live state. (3)
  `runCapabilityProbe(createProductionProbeHost(pi))` runs in the default
  export before the first `pi.registerFlag` call; on failure it emits exactly
  one `theta/load/host-incompatible` through tier 1 and returns, issuing no
  `pi.register*` or `pi.on` call. The production `ProbeHost` snapshots the
  running process, the same `pi` object reference the factory was handed, the
  imported `typebox` `Type`, and a parent-walk `readPeerVersion` that keeps
  walking past a name mismatch and `ENOENT` and propagates every other read or
  parse failure to `probe-failed`. Sub-step (f) stays in the compose pass, and
  that ordering discrepancy is now recorded in the spec rather than left
  implicit. (4) `theta/load/extension-compose-failed` minted for a throw
  escaping the whole `composeInstance` pass, with its own registry row and
  `/reload` remedy; `BootstrapCapability` stays closed and unchanged, because a
  compose throw is a distinct phase, not a sixth host call. Spec (DIAG-2): new
  row in `code-registry-load.md`, mirror row in `docs/reference/diagnostics.md`,
  the code added to placeholder-rendering §8's caught-thrown-value list, and
  the factory-time partial-chain rule pinned at all three prescription sites
  (`extension-bootstrap-and-per-theta.md`, the `host-incompatible` registry
  row, `capability-probe.md` clause (ii)). Verification: full default suite
  225 files / 2650 tests green; typecheck and lint clean. Offline locks:
  `tests/extension-bootstrap-production-wiring.test.ts` (7 tests, one group per
  element, all driving the shipped default export) and
  `tests/extension-bootstrap-sink-liveness.test.ts` (17 tests — tier
  selection, the PIC-67 obligation for the two guard-uncovered sites proven
  both directions, the production `ProbeHost` snapshot, and `readPeerVersion`
  at its exported seam), plus a production-export arm added to each pre-existing
  V9k/V9p witness asserting a delivery *arrives*. Red direction proven by six
  independent temporary neutralisations, one per element or new seam, every
  restore confirmed byte-identical: unwiring the sink reds 5 tests with the
  report's verbatim `got 0` signature, unwiring the gate reds 2 at the factory
  end and 1 at the parse-time channel, removing the probe call reds 1,
  restoring the `pi.registerCommand` label reds 1, and disabling tier 2's stale
  absorption reds the two invalidated-runtime tests while their live-runtime
  pair stays green. Live: `tests/live/double-session-start-live.test.ts` 1/1 —
  it boots the shipped default export twice in one instance, so step 0 runs
  against the real `pi` namespace, the real `process.versions.node` and the
  real installed peers, and the ctx latch fires on both `session_start`
  deliveries — and `tests/live/live-production-acceptance.test.ts` 7/7,
  including a real subagent child spawn that runs step 0 in a separate real
  process. The live axis was proven both directions too: making
  `readPeerVersion` answer `undefined` reds the double-session test with
  `Registered: []`, step 0 having refused the host before any registration.

## [0.33.0] - 2026-07-30

### Fixed

- **A schema ctor whose *declared* field was literally named `__thetaSchema`
  had that field silently destroyed: both ctor hosts assign every declared
  field as an ordinary enumerable property and then brand the object, and
  `brandSchemaValue`'s unconditional `Object.defineProperty` redefined the
  same key — legal, because the assigned property was still configurable —
  replacing both halves of it, the value (`"user-data"` → the schema name)
  and the descriptor (enumerable → frozen non-enumerable).
  `F { __thetaSchema: "user-data", x: 1 }` bound as `{"x":1}` with a healthy
  schema tag `F`, with no diagnostic at parse or runtime (bug 0026).** Every
  declared field is mandatory in a ctor, so a schema declaring the field
  forced *every* in-language construction through the destruction; the field
  was absent from `JSON.stringify`, `keys()`, the `valuesEqual` walk and the
  QRY-18 outbound render, while QRY-22 lowered it required and the schema
  closed — so a typed query showed the model `{"x":1}` and demanded
  `__thetaSchema` back, and a ctor-built value never compared equal to its
  wire-provenance twin. Honest reachability, as filed: the trigger requires
  an author to declare a field named after an interpreter internal, so
  accidental collision is improbable; when it fires it is deterministic and
  diagnostic-free. Root cause: the brand lived in the same string-key
  namespace as user field names. Fix: `ENUM_TAG`, `SCHEMA_TAG` and
  `RESULT_TAG` in `src/runtime/value.ts` are module `Symbol`s and
  `privateBrandOf` takes a `symbol` key — one migration of all three tags, so
  the collision class disappears wholesale rather than per-name. A symbol key
  is unreachable from `JSON.parse` and from theta-side object construction,
  which mint string keys only, so a declared `__thetaSchema` field and the
  brand occupy disjoint key spaces. Neither ctor host changed:
  `statement-executor.ts` and `production-theta-producer.ts` call
  `brandSchemaValue` exactly as before. The constructors keep their
  non-enumerable / non-writable / non-configurable install and
  `privateBrandOf` keeps the non-enumerable predicate — the descriptor
  posture bounds propagation through spread / `Object.assign`, which copy own
  enumerable symbol-keyed properties — so the enumerable-key forgery class
  closed by bugs 0017 and 0020 cannot re-open through the new encoding. Four
  code lines changed; JSON and wire output are byte-unchanged. The
  non-normative reference-encoding paragraphs of `runtime-value-model.md` and
  `type-system.md` re-anchor on the symbol encoding, and the bug-0020
  guarantee strengthens to hold unconditionally: a string key can never equal
  the symbol, so its enumerability no longer enters it. This also closes the
  brand-key half of bug 0027 — `obj.has("__thetaSchema")` answers `false`,
  indexed access raises the documented `MissingObjectKeyPanic`, and member
  access stops reading the brand (its probe rows E1–E3 and R1–R3); 0027's
  receiver-dispatch defect is re-scoped against this baseline and ships
  separately. Verification: full default suite 225 files / 2645 tests green;
  typecheck and lint clean. Offline lock:
  `tests/schema-brand-symbol-migration.test.ts` (12 tests — the unit
  destruction mechanics with the descriptor pinned before and after, the
  end-to-end ctor through the production executor with its zero-diagnostic
  parse admission, provenance-twin equality in both argument orders, the
  QRY-18 render at the `pi.sendUserMessage` seam through both ctor hosts, and
  the sibling-tag controls with a partial-migration guard). Red direction
  proven twice by temporary revert with byte-identical restore: reverting all
  three tags to strings reds exactly the 8 witnesses with the report's
  verbatim signatures, and migrating `SCHEMA_TAG` alone reds the
  partial-migration guard and only it. Live:
  `tests/live/live-production-acceptance.test.ts` 7/7 and
  `tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3 — all three
  migrated brands driven end-to-end through a real provider.

## [0.32.0] - 2026-07-29

### Fixed

- **The enum and schema brands (`__thetaEnum` / `__thetaSchema`) classified
  by presence-only `hasOwnProperty`: any enumerable same-named own key —
  producible by `JSON.parse` of wire data and by ordinary theta object
  construction, parse-clean — forged the brand, corrupting `==` in both
  directions (structurally different tag-carrying objects compared equal
  through the enum arm's `String(value)`; a tag-carrying object never
  received the documented object comparison) and destroying the QRY-18
  interpolation render (`interpolationTypeOf` routed the forged object to
  the enum arm — `"[object Object]"` in place of the compact JSON, whole
  subtrees collapsing inside `translateInterpolationOutbound`); a forged
  `__thetaSchema` name let wire data select, by name, which declared
  schema's theta→wire renames were applied to its sibling fields (bug
  0020).** Honest reachability, as filed: the corruption is deterministic
  and offline-reproducible — including fully in-language, no wire — but the
  trigger key names are interpreter internals, so accidental collision is
  improbable, unlike bug 0017's ubiquitous `ok` field; wire-side, a forged
  payload passes the QRY-22 gate only through permissive `{}` lowering
  positions or a typed-invoke schema that declares the tag-named field.
  Root cause: the constructors install the tags non-enumerable, but
  `enumTagOf` / `schemaTagOf` tested bare key presence, discarding the
  descriptor distinction between a constructor-installed brand and arriving
  data exactly where it mattered — `isResultValue` (bug 0017, 0.27.0)
  already demonstrated the correct check three declarations away. Fix (bug
  doc Option 1): one module-private `privateBrandOf(value, tag)` in
  `src/runtime/value.ts` — the own-property descriptor must exist AND be
  non-enumerable (non-null-object and array guards unified) — with
  `enumTagOf`, `schemaTagOf`, and `isResultValue` all routed through it:
  one privacy posture, three tags; the enum/schema classifiers narrow the
  brand to `typeof "string"`, replacing the blind casts. Constructors are
  untouched (every construction site already installs non-enumerable
  through them), JSON/wire output is byte-unchanged, and every consumer
  (`valuesEqual`, `isEnumValue`, `interpolationTypeOf`, both
  `translateInterpolationOutbound` sites, the query render) inherits the
  fix. Review found an adjacent membership hole in the same forged-key
  class, closed here too: `valuesEqual`'s object arm tested membership with
  `hasOwnProperty`, which matches non-enumerable brands — a forged
  enumerable `__thetaSchema` key satisfied membership against a genuinely
  branded object (an asymmetric false-equal); membership is now
  enumerable-only (`propertyIsEnumerable`), mirroring the `Object.keys`
  walk. The non-normative reference-encoding paragraph of
  `runtime-value-model.md` now states the enum tag is recognised by the
  non-enumerable descriptor, never by key presence. Verification: full
  default suite 221 files / 2580 tests green; typecheck and lint clean.
  Offline lock: `tests/enum-schema-tag-privacy.test.ts` (20 tests —
  classifier units, genuine-construction controls, `valuesEqual` both
  directions, the QRY-18 render through the real private routing, the
  report's in-language `a == b` end-to-end, and the QRY-22
  permissive-`{}` admission with closed-schema rejection control as
  ingress documentation); 10 red at 655e4d39 with the report's signatures
  (forged classification `true` / `"Person"`; `valuesEqual` `true` on
  structurally different pairs; renders collapsing to `[object Object]`;
  in-language `a == b` `true`), green post-fix, red direction re-proven by
  base revert plus byte-identical restore. Live:
  `tests/live/live-production-acceptance.test.ts` 7/7 with two new
  witnesses — a QRY-18 enum-interpolation control (a genuine enum
  interpolated into a real typed query renders its bare wire string in the
  outbound text; red-proven by classifier mutation) and a
  forged-`__thetaEnum` wire-ingress witness (a spawned subagent child's
  PIC-59 envelope carries the forged tag through `invoke<Forged>` typed
  return-validation and the parent binds it as a plain object,
  interpolating byte-exact compact JSON; red-proven at the base revert,
  where the rendered segment collapses to `[object Object]`) — plus
  `tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3.

## [0.31.0] - 2026-07-29

### Fixed

- **`?` applied to a member, index, or identifier operand bypassed both the
  ERR-18 static gate and `asResultValue` normalisation; the blind unwrap
  read `.ok` off a non-`Result`, silently corrupting in both directions — a
  valid value became a body failure whose `undefined` error payload the
  terminal surface laundered through `?? makeCancelledError()` into a
  fabricated `theta /<name> cancelled` (the STL-6 violation), and
  failure-shaped user data (`ok: true` / `ok: false` fields) became a
  success carrying `null` or a forged propagation — bug 0017's corruption
  signature surviving its fix (bug 0019).** Three layers: the static
  classifier is partial — `questionOperandKind` classified only `prim` /
  `literal` / `array` CompatTypes, and the inference pass types a member
  access as a nominal reference to its own field name, an index read as
  `named "index"`, and a call as `named <callee>`, so those operands never
  reached the ERR-18 check; no runtime net existed — `evalAsResult` returns
  member / index / binary / ternary / method-call operands raw (the raw
  path exists for `match` scrutinees, which need the true value for
  by-value arm matching) and `evalTry` blind-cast the raw value to
  `ResultValue`; and the fail-outcome surface mappers fabricate a
  `CancelledError` for an `undefined` error payload. Fix (bug doc Option 1,
  both halves): (a) a brand-based guard in `evalTry`
  (`src/runtime/statement-executor.ts`), after `evalAsResult` and before
  `evaluateQuestion` — a non-`Result` operand value throws the new
  `QuestionOperandDefectError` (`src/runtime/runtime-panics.ts`, beside
  `evaluateQuestion`), a plain Error routed to the
  `theta/runtime/internal-error` surface exactly like
  `PiToolArgShapeDefectError` (bug 0003) and
  `ShadowedCalleeDispatchDefectError` (bug 0016), its message naming
  ERR-18, the `theta/parse/question-on-non-result` gate, and a defensive
  value summary (`summariseNonResultOperand`: typeof / array length /
  schema-enum tag / capped key names — never values, never
  `JSON.stringify`); the blind cast is removed, and the placement after
  `evalAsResult` keeps `match` scrutinees, the bullet-1 implicit-`Ok` wrap
  (the pinned b-series `f()?`), and genuine stored-`Result` unwraps
  untouched. (b) `questionOperandKind` (`src/parser/type-layer-checks.ts`)
  widened: `union` and `object` CompatTypes now classify as non-result
  (display via `displayType`), so a union-annotated fn parameter under `?`
  is rejected at load; the `named` arm is deliberately untouched — the
  genuine-`Result` placeholders (`Ok` / `Err` / query results) live there.
  No new diagnostic code; the closed panic-source list and both code
  registries are unchanged. Verification: full default suite 220 files /
  2560 tests green; typecheck and lint clean. Offline lock:
  `tests/question-operand-defect.test.ts` — the bug doc's m1–m6 matrix plus
  the surface chain (s1), the genuine-`Err` note control (s2), and the
  identifier / index stored-`Result` pass-through controls; 7 red at
  7fa76517 with the pre-fix signatures (outcome `fail` with
  `error === undefined`; m4 outcome `success` carrying `null`), green
  post-fix, red direction re-proven by guard revert plus byte-identical
  restore. Static-gate cases red-then-green in
  `tests/match-result.test.ts`,
  `tests/type-layer-diagnostics-production.test.ts` (the exact message
  `'?' requires a Result operand; got number | string` pinned through the
  production route), and `tests/conformance/production-conformance.test.ts`.
  Live: `tests/live/live-production-acceptance.test.ts` 5/5 and
  `tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3 (its drives run
  `?` over genuine live `Result`s on the guarded path — the false-positive
  witness); new live hardening witness
  `tests/live/hardening/question-operand-defect-abort.test.ts` pins the m1
  fixture end-to-end on per-turn `systemNotes`: exactly one
  `theta /bug0019m1 aborted with internal error: …` note naming ERR-18 and
  the gate code, zero `theta /bug0019m1 cancelled` notes — red-proven under
  guard revert (the fabricated cancellation reappears verbatim), restored
  green.

## [0.30.0] - 2026-07-29

### Fixed

- **A shutdown-less repeat `session_start` at one extension instance now
  supersedes the prior hot-reload generation instead of stranding it —
  supersede-before-publish detach + drain, a compose-generation zero-touch
  guard for overlapping starts, one repeat-start system note, and a
  `session_shutdown` whose teardown reaches every published generation
  (bug 0021).** The factory's live-resource slots — the step-5 teardown
  handle plus the four lazily-read teardown inputs (`liveRegistry` /
  `liveClock` / `liveActiveInvocations` / `liveForwardingSignals`) — are
  single-occupancy, and each completing `session_start` compose pass
  assigned all five unconditionally. A repeat `session_start` with no
  intervening `session_shutdown` — not reachable through the shipped CLI
  hosts, which always interpose `session_shutdown`, but reachable
  in-product through the public host SDK: `AgentSession.bindExtensions()`
  carries no once-guard and re-emits the stored `session_start` to the same
  factory closure — therefore overwrote the slots without superseding the
  prior generation: the superseded generation's armed watcher + debouncer
  leaked with no reachable teardown; its reloads kept publishing and
  re-registering live slash commands against the superseded registry; one
  `session_shutdown` tore down only the latest generation — superseded
  in-flight invocations never reason-stamped or aborted, forwarding
  listeners never detached, and the undrained superseded registry let a
  post-shutdown dispatch bypass the drain fail-safe; and in the overlap
  variant the LAST completer owned the slots, stranding the NEWER
  generation. Fix (bug doc Option 1 plus Option 3's diagnostic), all in
  `src/extension/factory.ts`: supersede-before-publish at the
  compose-completion publish site — fold the outgoing generation's
  in-flight invocation registry and forwarding-signal list into a
  factory-scoped supersession list, drain the outgoing registry so a
  stale-bound name fails safe at dispatch on the drain-state arm (b), and
  detach the outgoing watcher with the handle slot cleared first so no
  double-detach path exists; a compose-generation counter joins the
  bug-0022 compose-settle predicate as a second zero-touch disjunct
  (`composeTailSuperseded`), closing the overlap inversion — only the
  newest-started compose publishes, registers, and arms; the
  `session_shutdown` handler builds merged teardown inputs (the superseded
  generations in supersession order, then the latest) so one shutdown's
  sub-steps 2/3/5 reach every published generation, then consumes the
  supersession state synchronously — sub-steps 1/4 stay latest-only
  because superseded generations were already drained/detached at
  supersession time; and each shutdown-less repeat delivery emits exactly
  one system note (content byte-exact `theta: repeat session_start without
  session_shutdown; superseding prior hot-reload generation`), keyed on the
  shutdown count at the last compose start so a start-after-shutdown
  rebind emits none. Spec: `registration-steps.md` step 5 gains the
  `#repeat-start-supersession` pin (a repeat delivery is a supersession
  pass; at most ONE armed watcher across repeat deliveries; detach + drain
  before publish; the pinned note); `session-shutdown-semantics.md` gains
  PIC-68 (compose-generation evidence joining PIC-67's compose-settle
  suppression, the supersession fold, one-shutdown teardown reach);
  `coverage-matrix.md` gains the PIC-68 row. Offline lock: four tests in
  `tests/double-session-start-supersession.test.ts` (single-start control;
  sequential double start; overlap; start-after-shutdown rebind control) —
  tests 2 and 3 red at ea5de328 with 14 signature failures, green
  post-fix, red direction re-proven by base revert. Live witness (H8a):
  `tests/live/double-session-start-live.test.ts` — double
  `bindExtensions`, real chokidar churn across the 250 ms debounce, a
  shutdown-emitting dispose, a second churn, asserting ZERO
  `theta hot-reload quiesced:` stderr lines; green post-fix and red-proven
  at ea5de328, where exactly one quiesced line is captured (misattributed
  to bug 0018's bare-dispose path). Live regression witness:
  `tests/live/live-production-acceptance.test.ts` 5/5. Residual, filed as
  bug 0024: after any re-bind of the same extension instance, a slash name
  that survives into the new generation's discovery is collision-dropped
  against the instance's own prior `pi.registerCommand` registration (the
  `session_start` compose pass reads `pi.getCommands()` with no own-name
  exclusion, unlike the hot-reload pass), so the name's handler stays
  bound to the superseded drained registry and dispatch yields the arm-(b)
  shutting-down note until `/reload` — fail-safe, but the supersession
  pass does not re-own surviving names.

## [0.29.0] - 2026-07-28

### Fixed

- **The late-completing `session_start` compose tail now does nothing when a
  `session_shutdown` was consumed while the compose was in flight — no
  live-resource publication, no registration pass, no diagnostic
  construction, no watcher arming — closing the arm the bug-0018 fix left
  open (bug 0022).** The 0018 fix placed the PIC-67 generation check at the
  LAST step of `runComposeInstanceRegistration`, immediately before
  `installHotReload`, so after a shutdown was consumed mid-compose the tail
  still published the dead generation's `liveRegistry` / `liveClock` /
  `liveActiveInvocations` / `liveForwardingSignals` (a populated
  dead-generation registry no teardown would ever visit, drain state never
  set), ran `registerFixtures` — whose collision-pass `pi.getCommands` read
  is a guarded touch on the invalidated runtime — and on the catch arm
  emitted a diagnostic and ran the static-fixture fallback, all silent: the
  production default export wires no `emitDiagnostic`, and the delivery
  channel rides the invalidated runtime, through which PIC-67 clause (c)
  forbids any delivery attempt. Fix (bug doc Option 1): a single
  factory-closure-local predicate `composeOutlivedSession`
  (`shutdownEventsObserved !== shutdownsAtComposeStart`), evaluated
  immediately after `deps.composeInstance` settles, on BOTH arms — catch arm
  before the diagnostic and the static-fixture fallback, success arm before
  the `live*` publishes and `registerFixtures` — returns zero-touch on
  mismatch: no publish, no registration, no diagnostic construction, no
  stderr. The now-dead late check before `installHotReload` was folded into
  it (the tail is await-free after the check, so one check per arm
  suffices), and the predicate's comment marks it as the single decision
  site where future touch-free staleness evidence for the late tail joins
  as a disjunct. The shutdown-LESS mid-compose invalidation stays on the
  existing reactive paths — no new probe touch, preserving the PIC-67
  zero-touch pin for the shutdown-observed race. PIC-67's final requirement
  sentence (`session-shutdown-semantics.md#pic-67`) is extended: the MUST
  now names the whole suppressed continuation (live-resource publication;
  the registration pass on the success arm and the compose-throw catch
  arm's static-fixture fallback; diagnostic construction; step-5 watcher
  arming), states the joint PIC-57 attribution (not arming is
  PIC-57-correct; the rest is pinned by the sentence itself), and pins the
  compose-settle boundary: an in-flight compose is not cancelled — once the
  invalidation has landed its next guarded read dies reactively, and that
  swallowed in-flight read is not a violation of the sentence. Offline
  lock: six new tests in `tests/hot-reload-stale-ctx-replacement.test.ts`
  (5 red at the pre-fix HEAD + 1 green arming-suppression control) on the
  bug-0018 Case C harness with an `emitDiagnostic` recorder and a
  `gateBeforeCompose` seam — variant 1 (compose settled before the gate)
  locks zero `staleTouches` (HEAD: `["pi.getCommands"]`), zero constructed
  diagnostics (HEAD: one `extension-bootstrap-failed`, capability
  `pi.getCommands`), and the no-publish witness (a second
  `session_shutdown` finds nothing to tear down; `readDrainState()` stays
  `{ drained: false }`, where HEAD flips it to drained); variant 2
  (shutdown at the compose's first await) locks `staleTouches` to exactly
  `["ctx.cwd"]` — the compose's own in-flight death-read, nothing after the
  compose settles (HEAD: `["ctx.cwd", "pi.getCommands"]`) — and zero
  diagnostics (HEAD: two, the first mislabelled capability
  `pi.registerCommand`); the old Case C post-arm baseline was deleted, so
  Case C now locks the whole tail zero-touch from the consumed shutdown on.
  Live regression witness (the bug has no positive live observable):
  `tests/live/live-production-acceptance.test.ts` 5/5,
  `tests/live/acceptance/noninteractive-acceptance.test.ts` 10/10 (its
  permitted-codes assertion over stdout+stderr would fail on a
  `system-note delivery failed:` cascade quoting a non-permitted code),
  `tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3. The two
  separable diagnostic-surface defects the report recorded — the production
  default export drops every bootstrap diagnostic (`emitDiagnostic`
  unwired), and the compose-supplier catch labels every compose throw
  `capability: "pi.registerCommand"` — are deliberately not folded in;
  filed as bug 0023.

## [0.28.0] - 2026-07-28

### Fixed

- **The hot-reload watcher now quiesces once on a shutdown-less runtime
  invalidation — one `ctx.cwd` stale probe at reload-pass entry, permanent
  teardown, a single designed `theta hot-reload quiesced:` stderr line — and
  the system-note channel marks itself permanently dead on a stale send
  instead of cascading `system-note delivery failed:` onto stderr
  (bug 0018).** A bare `AgentSession.dispose()` — a public host SDK API —
  invalidates the extension runtime without emitting `session_shutdown` first
  (every host replacement path — `newSession` / `switchSession` / `fork` /
  `reload` / quit — emits it), so the step-4 teardown never ran, nothing
  marked the debouncer torn-down, and the armed watcher outlived the runtime
  over stale captures: the debounced reload drove `runComposePass` into
  guarded `pi.*` / `ctx.*` surfaces that all throw the host's stale-ctx
  error, and both the load-diagnostic and the ERR-7
  `theta/runtime/registry-swap-failed` delivery attempts died on the same
  dead channel — two `system-note delivery failed:` stderr cascades, hot
  reload permanently dead for the session, no operator-facing note. The host
  exposes no non-throwing staleness probe and fires no event on the
  bare-dispose path, so the fix pins the reactive posture as the new PIC-67
  clause (`session-shutdown-semantics.md#pic-67`): each reload pass performs
  exactly one deliberate side-effect-free guarded touch at entry (`ctx.cwd`)
  and, on the recognised stale-ctx error (stable message prefix `This
  extension ctx is stale after session replacement or reload`; detection
  centralised in `src/extension/stale-ctx.ts`), quiesces permanently —
  debouncer marked torn-down per PIC-57, watcher detached, exactly one
  latched `theta hot-reload quiesced:` line per extension instance (one latch
  shared with the PIC-55 terminal-signal arm), no ERR-7 attempt through the
  invalidated channel; a stale error escaping a pass already in flight
  quiesces on the same arm, and an unrecognised error rethrows. The
  system-note channel (`SystemNoteChannelHealth`) marks itself permanently
  dead on a stale `pi.sendMessage` throw and rethrows — never re-entering the
  equally stale `ctx.ui.notify` fallback — and a dead channel rethrows the
  recorded error touch-free; the non-stale terminal
  `system-note delivery failed:` line is once-bounded per channel instance.
  The arm-after-teardown race — a `session_shutdown` consumed while the async
  `session_start` compose is in flight, which would arm a watcher nothing
  detaches — is closed zero-touch by suppressing the arm when a shutdown was
  observed mid-flight. The debouncer's rejection arm logs
  `theta hot-reload rebuild rejected:` and releases the PIC-49 guard in a
  `finally`. The H8a live harness's `dispose` now emits `session_shutdown`
  (reason `"quit"`) before `session.dispose()`, mirroring the host's own
  graceful `AgentSessionRuntime.dispose()` ordering. Offline lock:
  `tests/hot-reload-stale-ctx-replacement.test.ts` (host-faithful
  stale-switch fakes; 5 red / 1 green at the pre-fix HEAD with the exact
  cascade signatures); live: the H8a acceptance file runs 5/5 with a 0-byte
  stderr capture.

## [0.27.0] - 2026-07-28

### Fixed

- **`Result` runtime values now carry an interpreter-private non-enumerable
  brand (`__thetaResult`); user/model data carrying a boolean `ok` field no
  longer forges a `Result` (bug 0017).** `makeOk` / `makeErr` built bare
  `{ ok: true, value }` / `{ ok: false, error }` objects and `isResultValue`
  duck-typed any non-array, non-enum object with a boolean `ok` property as a
  `Result` — so an `ok`-carrying object forged a `Result` at every
  classification boundary: the CONV-6 `asResultValue` wrap passed it through
  unwrapped and `?` / `match Ok(v)` then read its nonexistent `.value`
  (typed-query payloads with an `ok: boolean` schema field bound
  `null`/`undefined`, aborting on the next member access);
  `surfaceCalleeFinalValue` surfaced `{ ok: false, … }` callee **data** to
  the `invoke` parent as an `Err`; `valuesEqual` and `isWireLowerable`
  misrouted the same objects. Fix (bug doc Option 1, the enum-tag precedent):
  the constructors route through a private `brandResult` helper installing a
  non-enumerable / non-writable / non-configurable `__thetaResult` own
  property, and `isResultValue` classifies by that brand — requiring the
  descriptor to be non-enumerable, so a wire payload naming the tag cannot
  forge it either (JSON produces only enumerable keys). A type-level
  unique-symbol brand makes bare `{ ok, value }` literals fail typecheck.
  Two residual duck-typing sites in `match-result.ts` (`summariseScrutinee`,
  `matchPattern`'s constructor case) converted to `isResultValue`; the
  PIC-59 child envelope already re-tags at decode via `makeOk` / `makeErr`.
  Typed-query payloads with `ok: boolean` fields now bind intact, and the two
  documented correct-reason live reds (H8a typed-query, H9a area (c)) went
  green unchanged.

## [0.26.0] - 2026-07-28

### Fixed

- **The production binder call now issues the spec-pinned forced-tool
  structured-output `complete()` — rendered system prompt, fixed user
  literal, exactly one forced `__theta_bind_<slug>` tool, deterministic
  seed, provider-response capture — instead of a prose prompt parsed as free
  text (bug 0011).** Since the first live binder pass (H9a, 2026-07-03) the
  implementation had sent one user message carrying a rendered prose prompt
  with a JSON-only instruction and text-parsed the reply into the envelope:
  no `context.systemPrompt`, no `tools`, no `toolChoice`, no seed, no
  `onResponse`, structural-only envelope routing, and a classifier fed a
  fabricated `httpStatus: 200` — while the conforming call constructor
  (`buildBinderCompleteCall`) sat test-only. The divergence was deliberately
  recorded (`d848f1b2`): the pinned tool `parameters` — a top-level three-arm
  `anyOf` — is not a valid provider `input_schema`, so the forced call
  returned empty arguments. That finding falsified only the *attachment
  shape*, not the forcing mechanism, so the fix aligns production to the
  pinned call and amends only the attachment clause: the tool `parameters`
  root the envelope schema in an object wrapper
  (`{type:"object", properties:{envelope:<anyOf>}, required:["envelope"],
  additionalProperties:false}`, BNDR-1/BNDR-2 preserved verbatim one level
  down) with every `#/$defs/<name>` reference transitively inlined into the
  attachment copy (live testing showed the provider also degrades
  `$ref`-carrying tool schemas — NamedType/enum params bound malformed until
  dereferenced), while AJV keeps validating the unwrapped envelope document
  itself. Facet by facet: `context.systemPrompt` is the rendered V11d binder
  system prompt (the parser now retains each default's literal source and
  the `argument-hint` value to feed it; the BNDR-10 session-context block
  rides item 6); `context.messages` is the fixed literal `Bind the
  slash-command arguments now.`; `options.toolChoice` is forced with the
  per-api spelling shared with the typed respond dispatch (the constructor's
  hardcoded normalized spelling was wrong on `openai-completions` /
  `mistral`-family apis; the table moved to `src/binder/forced-tool-choice.ts`);
  the FNV-1a seed rides the provider's seed field per the seed-field table;
  `options.onResponse` is registered per attempt so the provider-error
  classifier reads the real captured HTTP status (`null` when it never
  fired — the fabricated 200 is gone, and the HTTP-status arm of the mapping
  table is reachable for the binder); the envelope is extracted from the
  first matching `ToolCall`'s `arguments.envelope` and AJV-validated against
  the true `anyOf` at the routing step (the `maxLength: 500` model budget is
  enforced, extra keys are rejected, a non-object `ok.args` is malformed
  rather than a silent `{}` bind), with plain text or a wrong-name `ToolCall`
  routed to the malformed-envelope class. The free-text machinery
  (`renderBinderTurnPrompt` / `parseBinderEnvelope` / `parseOkEnvelopeArgs`)
  is retired. The retry taxonomy, per-class budgets, cancellation discipline,
  bypass arms, defaults-merge, and echo/failure notes are unchanged
  (mechanism-agnostic seams). Live-confirmed against the real provider
  (`tests/hardening/session-binder.test.ts`, 10/10 — the `d848f1b2`
  falsification retest): an intermediate run falsified the `$defs`-hoisted
  attachment for NamedType params (3/10 malformed) before the inline landed;
  the final run binds enum, schema-typed, and mixed params through the
  forced call. Operator-visible changes: the binder's provider traffic
  changes shape (structured tool call instead of prose; envelope compliance
  is provider-enforced rather than prose-hope); binder determinism gains the
  seed; needs_info/ambiguous messages over the 500-char budget now fail
  malformed instead of passing unvalidated. Residuals (the upstream
  nested-`$defs` lowering gap for two-level NamedType chains; the
  canonical-hash citation for the synthesized tool-name slugs; the
  off-session query path's own fabricated 200) are recorded in the bug
  report's Fix section.

## [0.25.0] - 2026-07-28

### Fixed

- **Untyped `@`-queries now surface a mid-flight abort as the `cancelled`
  outcome on both drivers, instead of `Err(TransportError)` off-session and
  `Ok(<partial text>)` live (bug 0012).** The bug-0010 fix added
  signal-aware cancellation guards to every typed-query surface; the untyped
  loop (`runUntypedQueryLoop`) kept the pre-0010 shape — once a free-phase
  turn resolved, its transport and text arms returned unconditionally, with
  no `signal.aborted` re-check. An abort landing while an untyped query's
  provider call was in flight therefore surfaced as the wrong terminal
  outcome on both untyped drivers. Off-session (`subagent fn` body
  `@`-queries): pi-ai resolves an in-flight abort as a `stopReason:
  "aborted"` reply that `classifyOffSessionReply` folds into the transport
  arm, so Esc read as a provider fault (`Err(TransportError { message:
  "provider transport failure", … })`) — an author `match` arm on `kind:
  "cancelled"` never fired and retry-on-transport logic would retry a user
  cancellation. Live prompt-mode: the post-idle probe correctly synthesised
  `Err(cancelled)` per PIC-51, but the driver forwards only `kind:
  "transport"` verdicts, so the mid-abort turn fell through to text
  extraction and the query terminated `Ok(<partial text>)` — fabricated
  success carrying a torn stream's truncated data, bypassing the PIC-53
  ordering and FN-5's "on cancellation, NO final value flows". Fix (bug doc
  Option 1): two signal-keyed guards in `runUntypedQueryLoop`, mirroring the
  typed loop's bug-0010 F1 guards — before the transport arm and before the
  text arm return, an aborted theta signal maps the turn to the loop's
  existing `cancelled` outcome, which `runQueryEffect` already surfaces as
  `Err(QueryError { kind: "cancelled" })` and the CANCEL terminal outcome.
  Both guards key on the theta signal, never the stop reason: a reply-side
  `"aborted"` stop under a live (non-aborted) signal keeps its transport
  classification (the cell-(l) distinction, now pinned untyped too), and the
  text-arm guard fires before the query's `Ok` materialises to theta code,
  inside CNCL-5 — a completed `Ok` bound before the abort is untouched.
  Neither driver changes; the typed loops and the checkpoint/round-boundary
  guards are untouched.

## [0.24.0] - 2026-07-28

### Fixed

- **Warning-severity load diagnostics are now delivered instead of silently
  dropped by both production sinks (bug 0013).** The diagnostics contract
  delivers all `theta/load/*` diagnostics through the persistent
  `theta-system-note` channel (diagnostic-shape.md's persistent-diagnostics
  default has five carved-out exceptions, none a load code and none
  severity-based), yet both functions production ever installed as the
  load-pass emit stream early-returned on `severity !== "error"` — so every
  warning-emittable load row in the closed registry (15 pure-W codes plus
  the warning arms of three E/W codes) was unobservable by an operator: no
  transcript note, no toast (the surface is error-typed), no headless stderr
  line, nothing. That included the bug-0010 typed-query provider gate's
  spec-pinned load warning (`theta/load/typed-query-unsupported-provider` —
  emitted and dropped, so a typed theta pinned to an unsupported provider
  registered with zero signal), every silent-mistake detector row
  (`case-collision`, `cross-source-shadow`, `non-canonical-extension`,
  `settings-invalid-json`, `unreadable` — each condition's only documented
  observable), and the registry-documented universal branch
  (`binder-model-strict-capability-unknown`). A third, upstream drop site
  compounded the sinks: `parseDiscoveredTheta` discarded
  `document.diagnostics` entirely for a theta that registers, so
  frontmatter/parse warnings never reached a sink at all. Fix (bug doc
  Option 1): the shipped sink (`composeExtensionInstance`) splits each
  diagnostic group by severity — errors route per-diagnostic through the V4e
  pre-eval router byte-identically to before; warnings deliver directly onto
  the `theta-system-note` channel as one `emitDiagnosticBatch` per group with
  the pinned envelope (`display: true`, `details: { diagnostics }`,
  `triggerTurn: false`), never through the pre-eval router (warnings are not
  pre-evaluation failures). The helper sink (`makeLoadEmit`) mirrors warnings
  to stderr in headless `-p`/CI mode exactly as it does errors — stderr only,
  never a toast, never the channel (it stays the off-channel PIC-54
  fallback). The registering parse path forwards its warning-severity
  `document.diagnostics` as one per-file group. Batching is per emitted
  group at the call sites (one note per `.theta` parse batch, one per scan
  subsystem) with no buffering, so nothing can strand: both arms deliver
  synchronously, the watcher re-compose path reuses the same sink, and the
  post-pass `AjvSchemaValidator` handle delivers a batch of one immediately.
  Warning notes recur per reload in warning-bearing workspaces — the
  documented no-dedup contract; if a row's volume is judged wrong now that it
  is visible, the remedy is a DIAG-2 spec change to that row, not renewed
  dropping.

## [0.23.0] - 2026-07-28

### Fixed

- **An empty typed-query annotation is now rejected at parse
  (`theta/parse/empty-query-annotation`) instead of silently minting
  `schema: ""` and binding the response unvalidated through the retired
  fused mechanism (bug 0014).** The type grammar derives no empty `Type`
  (grammar.md §Type grammar; type-system.md applies the same grammar to the
  `@<T>` annotation position), yet `parseQuery`'s angle-bracket capture
  assigned `schema = parts.join("").trim()` unconditionally — so `@<>`,
  `@<  >`, a tab- or newline-only interior, and an unterminated `@<` at end
  of input all parsed with ZERO diagnostics and minted `""`, the sole input
  for which `lowerQueryResponseSchema` returns `undefined`. On that arm both
  query drivers kept the entire retired pre-0010 fused mechanism
  (user-visible JSON-in-text turn on the live path / one fused `complete()`
  off-session, `maxRounds: 0` collapse, ungoverned native loop, no respond
  tool, no provider gate) and — because no lowered schema exists — the
  text-parsed payload bound with NO AJV: QRY-22's "MUST NOT bind, as a typed
  query's value, a response that has not been validated against its declared
  schema" was silently void for a query the runtime itself marked typed. The
  shadowing case was worse than absence: `let x: Triage = @<>`…`?` kept the
  minted `""`, which blocked BOTH the direct-let propagation and the QRY-2
  inference (each fires only on `schema === null`) with no QRY-4 mismatch
  warning — the real declared `Triage` was silently ignored. Fix (bug doc
  Option 1, the route bug 0010's F5 residual named): `parseQuery`'s
  angle-bracket arm — the single place the empty capture is manufactured —
  emits the new registered code (error severity, range on the `@<…>`
  annotation span, registry-byte-equal message) whenever the trimmed capture
  is empty; the node still carries the minted `""` so the AST reflects the
  source, and load refuses error thetas. The emission fires ONLY in that
  arm: an empty `let` annotation stays guarded-untyped and `invoke<>` keeps
  its normalise-to-untyped contract. Registry row added to
  `docs/spec_topics/diagnostics/code-registry-parse.md` (query cluster,
  sibling of `explicit-schema-mismatch`; trigger names all four spellings
  and the no-empty-derivation grammar) with the transcription row in
  `docs/reference/diagnostics.md`. The degraded arm itself is KEPT as
  seam-level totality per bug 0010's residual record — unreachable from
  parsed source now — and `lowerQueryResponseSchema`'s `undefined` contract
  is unchanged as defence in depth (both RESIDUAL DIVERGENCE comments
  updated; the (deg-live)/(deg-off) residual pins re-pin the parse rejection
  and keep the arm's fused single-shot coverage through a
  direct-construction seam). BEHAVIOUR-TIGHTENING: a theta carrying `@<>`
  (or any empty-trimming spelling) previously loaded and ran — it now fails
  at parse. Committed-fixture sweep: zero offending thetas outside the two
  residual pins (both re-pinned). Remedy: name a schema (`@<Schema>`) or
  drop the annotation for an untyped query. Present since `04dbb013` (the
  unguarded angle-bracket capture); recorded from bug 0010's Fix §Residuals.

## [0.22.0] - 2026-07-27

### Fixed

- **A call to a lexically shadowed callable name is now rejected at parse
  (`theta/parse/shadowed-callable-call`) instead of dispatching the Pi tool
  at runtime (bug 0016).** expressions.md §Identifier resolution ranks a
  local `let` binding / `fn` parameter first and the callable set last, and
  the parse walks honoured that — but runtime call classification was
  callable-set-membership only (`resolveUserFn` consulted only the
  `fn`/`import` arms; `checkpointFor` / `#classifyCall` / `#resolveToolCall`
  keyed on the callee name against the frozen snapshot; the environment's
  spec-conformant four-arm `resolve` was never asked), so a parse-clean
  `read(...)` under an in-scope local named `read` executed the host tool
  anyway at both executor dispatch sites (the `evalExpr` call routing and
  the `?`/`match`-operand `evalAsResult` path): **silently with real
  arguments** for the object-literal and zero-argument forms, or as a
  misattributed `theta/runtime/internal-error`
  (`PiToolArgShapeDefectError`, blaming the bug-0003 gate) for every other
  argument form. A call of a non-callable local is provably erroneous
  (functions are not first-class), so the fix closes the recorded spec gap
  at parse: the bug-0003 lexical shape walk is generalised into a single
  call-site walk (`checkLexicalCallSites`) that resolves every callee once
  per §Identifier resolution and emits the new registered code for any call
  whose callee is shadowed by a local (`let`, `fn` parameter, `for` /
  `par for` variable, `match` binding, `params:` field) while colliding
  with a callable-set entry (Pi tool or `.theta` callable, both
  post-rename), naming the shadowing binder and its line; binding the name
  without calling it stays legal. The §Object construction bare-object
  carve-out is now lexical to match the spec: a sole bare-object argument
  whose callee is not an unshadowed Pi tool fires
  `theta/parse/bare-object-literal` (previously suppressed for ANY call —
  user `fn`s and shadowed callees included), and `schema` / `enum` names no
  longer suppress the bug-0003 shape check (they are not resolution arms).
  Belt-and-braces mirroring bug 0003: both runtime lowerings
  (`preEvaluateToolArgs`, `lowerToolCallParams`) throw a new
  `ShadowedCalleeDispatchDefectError` ahead of dispatch when the callee
  resolves to a local — the guard sits at the shared seam in front of BOTH
  dispatch sites, with fn-activation-bounded resolution so the no-closures
  model holds (`params:`-field shadows are visible inside plain `fn`
  bodies; the sole gate-only residual — `subagent fn` bodies, whose
  isolated scope genuinely carries no `params:` locals — is recorded at the
  guard). Registry row added to
  `docs/spec_topics/diagnostics/code-registry-parse.md`; rule recorded in
  expressions.md §Identifier resolution. BEHAVIOUR-TIGHTENING:
  previously-executing shadowed forms now fail at parse (and defect-throw
  at runtime instead of dispatching); remedy — rename the local binding, or
  give the `tools:` entry a distinct name with `as`. Present since the
  first Pi-tool dispatch wiring; recorded from bug 0003's residual, whose
  "fail-loud" claim held only for non-object argument forms.

## [0.21.0] - 2026-07-27

### Fixed

- **A statement ending in postfix `?` now keeps its boundary before a
  keyword-free next statement — depth-0 `?`s and `:`s pair innermost-first
  in the ternary-head scan (bug 0015).** The lexer swallows the newline
  after any trailing `?` (would-be ternary continuation; irreducible at the
  lexer per bug 0005 (b)), and `isTernaryHead`'s bounded scan proved
  boundary-crossing only via depth-0 statement-only keywords — so a
  keyword-free next statement (a reassignment or an expression statement)
  carrying a depth-0 ternary offered no stop token, the scan met that
  ternary's own `:`, and the preceding postfix `?` classified as a ternary
  head over the swallowed statement. A reassignment RHS ternary
  (`x = c ? a : b`) failed loudly at the wrong construct (stray `=`, the
  `reassign` statement gone); an expression-statement ternary (`c ? 1 : 2`
  as a bare statement or the `ThetaBody` tail) misparsed **silently** —
  zero diagnostics, the statement swallowed as consequent, the missing
  alternate fabricated as `null`, the postfix `?`'s `Err` propagation
  deleted, and the theta's final value degraded to `null`. Inside braced
  bodies (no `stmt-sep` at bracket depth > 0) any keyword-free run after a
  postfix-`?` line was exposed. The scan now pairs depth-0 `?`s (those
  followed by an expression-starting token) with depth-0 `:`s
  innermost-first and answers "ternary head" only when a `:` pairs with the
  `?` under test, so a following statement's own ternary `:` can no longer
  re-classify a preceding postfix `?`; and `parseTernary`'s missing-`:`
  recovery now emits `theta/parse/unsupported-feature` ("ternary '?'
  without ':' after its consequent") instead of fabricating silently. Both
  documented multi-line ternary continuations and the nested-consequent
  form keep their readings; the irreducible head/postfix ambiguity narrows
  to an inner postfix `?` directly followed by an expression-lead token
  inside a real ternary arm (now read as postfix). Rule recorded in
  `docs/reference/grammar.md` §"Statement termination & newline
  continuation". Present since 0.14.0.

## [0.20.0] - 2026-07-27

### Fixed

- **The typed-query forced respond turn now runs off-session through pi-ai's
  `complete()` with the tool choice forced to the synthesised respond tool
  (bug 0010).** Since the first live typed drive (0.9.0-era H8a wiring) the
  implementation had fused both query phases into one user-visible
  `pi.sendUserMessage` turn whose text inlined the lowered schema behind a
  prose JSON-only instruction, obtained the payload by `JSON.parse` of the
  streamed assistant text, registered no respond tool, forced no tool choice,
  left the typed turn governor-exempt, and never wired the documented
  provider gate — against four mutually-consistent spec pages and a resolved
  blocker-level design decision (T34). The documented mechanism is restored
  end to end: the respond tool `__theta_respond_<slug>` registers through the
  PIC-44 cache and joins the session active set for the free phase (an early
  valid respond call resolves the query); the free phase runs governed under
  `tool_loop.max_rounds` (CIO-4); the forced respond turn rebuilds the
  conversation from the session read surface, appends the QRY-15 template,
  passes the respond tool as the single `context.tools` entry with the
  per-api `toolChoice` spelling, dispatches on the theta-resolved `model:`
  with signal + auth threaded, extracts the forced `ToolCall`'s arguments per
  the binder extraction rule, and AJV-validates them — attaching nothing to
  the driven session; respond-repair restarts the whole two-phase loop per
  attempt with a fresh budget; `subagent fn` body queries run the same
  two-phase shape off-session over a held conversation, including a real
  free-phase tool loop over the inherited callable set; an abort at any point
  surfaces the CANCEL outcome with no post-abort provider dispatch.
  Operator-visible changes, stated plainly: the raw-JSON schema/instruction
  turns no longer appear in the user session transcript (SLSH-2); simple
  typed queries cost one extra provider round-trip (free phase + off-session
  respond); typed free phases are now bounded where they ran unbounded; typed
  queries on providers outside the pinned six-member api set now refuse with
  a `TransportError` instead of dispatching unforced. Spec clarifications
  landed with the fix (per-api `toolChoice` spelling and the six-member
  KnownApi-shaped provider set at the theta-1.0 pin); overflow-signature
  tables gained the two KnownApi alias keys. Residuals (empty-annotation
  degraded arm; dropped load-phase warnings; untyped off-session mid-abort
  classification) are recorded in the bug report's Fix section.
  Token-gated acceptance/live typed fixtures now echo the validated value
  behind committed sentinels — the streamed-raw-JSON observation channel is
  dead by design.

## [0.19.0] - 2026-07-26

### Fixed

- **Prompt-mode transport errors now carry the api-shaped `.api` provider
  value (`"anthropic-messages"`), not the short provider id (`"anthropic"`)
  (bug 0009).** Every normative statement of the
  `TransportError.provider` derivation pins an api-shaped `Model<Api>.api`
  value — the same `Api` union the provider-error-mapping table is keyed on —
  but the `LivePromptQueryModel` construction in `#resolvePromptQuery` read
  `ctx.model?.provider`, pi-ai's short `ProviderId`: the right model (PIC-50's
  user-session `ctx.model`) and the right `"unknown"` sentinel, but the wrong
  field, flowing out through all three prompt-mode `TransportError`
  synthesis points (the PIC-51 error-stop probes on the untyped and
  forced-respond driven turns and the PIC-50 sync-throw mapping). The
  construction now reads
  `String(deps.ctx.model?.api ?? "unknown")`, so the same provider failure
  carries the SAME api-shaped provider string on both in-process query seams —
  prompt-mode and off-session (the latter fixed in 0.18.0, bug 0007) — and the
  subagent child envelope inherits the alignment (the child runs the identical
  construction line; the parent reconstructs its `err` arm verbatim). The
  never-read `SubagentDriveDeps.provider` member and its write-only feeds were
  deleted. Fixture: `tests/prompt-provider-field-derivation.test.ts`. Observed
  at 0.18.0.

## [0.18.0] - 2026-07-26

### Fixed

- **Off-session `@`-queries no longer swallow a provider failure as a
  fabricated success (bug 0007).** pi-ai's `complete()` free function never
  rejects on a provider failure — the per-API adapter resolves every caught
  throw as an `AssistantMessage` carrying `stopReason: "error"` (+ optional
  `errorMessage`) — and `offSessionComplete`, the driver behind every
  `@`-query in a `subagent fn` body and the off-session respond-repair
  follow-up drive, extracted the reply's text without probing `stopReason`.
  An untyped query therefore resolved `Ok("")` (or `Ok(<partial text>)` after
  a mid-stream failure) — the provider's error text destroyed, the theta
  continuing on data that was never produced — while a typed query laundered
  the transport failure into the schema-validation channel, re-driving the
  dead provider once per `respond_repair` attempt (1 + 3 = 4 `complete()`
  calls at the default budget) before misreporting `Err(ValidationError)`.
  The off-session seam now classifies the resolved reply before text
  extraction through the existing provider-error-mapping table, mirroring the
  binder's classifier input: a non-normal `stopReason` maps to the pinned
  `Err(QueryError { kind: "transport", message: <errorMessage, or "provider
  transport failure">, http_status: null, provider: <resolved model's .api>,
  retryable: false })`, with `"length"` and overflow-signature envelopes
  surfacing as `context_overflow` (token counts extracted where available);
  the query loop's transport arms widened to carry both. A respond-repair
  follow-up's provider failure now terminates repair immediately with the
  proximate error and consumes no `attempts` slot. Fixture:
  `tests/off-session-transport-classification.test.ts`. Observed at 0.16.0.

## [0.17.0] - 2026-07-26

### Fixed

- **A subagent child now receives every parent theta discovery root, not
  just the last one (bug 0008).** `assembleSubagentArgv` forwarded the
  parent's discovery roots as repeated `--theta <dir>` flags, but host pi's
  argv parser stores extension flags in a per-name `unknownFlags` Map
  (`dist/cli/args.js`) — a repeated string flag resolves to its last
  occurrence, and `pi.getFlag` is `boolean | string | undefined` — so with
  ≥ 2 parent roots every earlier root silently vanished in the child. A
  callee living in a dropped root never registered; the child ran the
  `-p "/<slug>"` prompt as prose instead of the theta and exited without a
  `theta_result` envelope, which the parent misattributed as
  `Err(InvokeInfraError { cause: "internal_error" })` via the
  exit-without-envelope mapping — two layers from the cause. The launcher
  now emits ONE `--theta` flag joining all roots with `path.delimiter` (the
  documented discovery CLI-source convention, the form the child-side
  `readThetaFlagPaths` already splits) and omits the flag entirely for an
  empty root set. The `#subagent-launch-contract` carrier table gained its
  missing discovery-roots row, and `readThetaFlagPaths`' dangling
  "DISCLI-1" citation was corrected to the host's actual last-wins parsing,
  its array branch deliberately retained as fail-safe hardening. Observed
  at 0.16.0.

## [0.16.0] - 2026-07-26

### Fixed

- **The Pi-tool argument shape rule is now enforced (bug 0003).**
  `theta/parse/tool-arg-not-object-literal` was registered and implemented
  (`checkToolCallArguments`) but had no production caller, so a whole
  `let`-bound value passed positionally (`read(args)`) parsed clean and both
  runtime lowerings silently degraded it to empty params — the dispatch
  carried `{}`, the author's argument object was dropped, and the failure
  surfaced late as the *tool's* error (or, for a tool accepting `{}`, as a
  wrong effectful call). `parseThetaDocument` now walks the body (nested
  blocks, `fn` bodies, `match` arms, `par for` bodies included) and emits the
  registered diagnostic — error severity, exact registry message, range on
  the offending argument node — for every call whose callee resolves to a
  frontmatter-`tools:` Pi tool and whose first argument is not an inline bare
  object literal. `.theta`-callable calls (whole-value arguments are their
  legal convention) and zero-argument calls are unaffected; local
  declarations and bindings shadow the tool name rather than misfire.
  **Behaviour-tightening:** previously-accepted forms — `read(args)`,
  `read("x")`, `read(mk())`, `read(a.b)`, `read(Args { … })` — now fail at
  parse with `theta/parse/tool-arg-not-object-literal`; inline the fields at
  the call site (`read({ path: expr, ... })`, RFC 0002 field values are full
  expressions). Belt-and-braces behind the gate: `preEvaluateToolArgs` and
  `lowerToolCallParams` now throw a `PiToolArgShapeDefectError` internal
  defect (the `theta/runtime/internal-error` surface) instead of lowering a
  non-object first argument to `{}` / `args: undefined`, so any future
  parse-gate gap fails loudly instead of arg-dropping. Zero-argument calls
  keep lowering to `{}`. Observed at 0.12.0.

## [0.15.0] - 2026-07-26

### Fixed

- **`invoke<array<T>>` / `@<array<T>>` boundary validation no longer drops
  the transitive `$defs` of named schemas (bug 0004).** A named-schema
  fragment referencing another named schema (`Item` containing `array<Loc>`)
  carries a fragment-local `$defs`, so attaching it under the assembled
  document's `$defs.Item` nested the dependency at the unreachable position
  `#/$defs/Item/$defs/Loc` while the emitted `$ref: "#/$defs/Loc"` is
  root-absolute — AJV compile threw `MissingRefError`, surfacing at run time
  as `Err(invoke_infra, "can't resolve reference #/$defs/Loc from id #")`
  far from the declaration site, and forcing boundary shapes to be declared
  twice (inline-anonymous for the annotation, named for construction). All
  three annotation arms assembled the same broken document — the bare-named
  arm too at nesting depth ≥ 2 (`Item2 → Loc2 → Pos`), wider than the bug
  report's matrix. `pruneDocumentDefs` is now a hoist-and-close step shared
  by every arm: fragment-local `$defs` entries are recursively lifted to the
  document's top level (first-wins by def name; the shared body-type map
  keys fragments by name, so a name always resolves to one body),
  hoisted-from bodies shed their nested `$defs` via shallow clone (the
  shared fragments are never mutated), and the existing reachability walk
  keeps exactly the transitively-reachable defs (unused ones still pruned).
  A reachable `$ref` with no collected def body — unreachable from source —
  now fails at lowering time with a precise error naming the annotation and
  the missing def instead of leaking AJV's resolver message at validation
  time. Assembly clause recorded in `docs/reference/schema-subset.md`
  §"Lowering algorithm" step 4. Observed at 0.12.0.

## [0.14.0] - 2026-07-26

### Fixed

- **A `subagent fn` return annotation no longer swallows the `with` clause
  (bug 0005 (a)).** The return-type parser did not stop at the contextual
  keyword `with`, so `subagent fn s(a: string): string with { system: "…" }`
  landed the concatenated annotation `stringwith` on the AST, took the
  with-braces as the fn *body*, and shredded the real body into stray
  top-level statements (`theta/parse/unknown-identifier: unknown identifier
  'system'` plus a stray-`:` / bare-object-literal cascade). `ReturnType`
  parsing now terminates at a depth-0 `with` — `(":" ReturnType)?` and
  `WithClause?` are consecutive slots — and the clause parses as the
  `WithClause` the grammar admits. Rule recorded in
  `docs/reference/grammar.md` §"`fn` declarations". Observed at 0.12.0.
- **An annotated `subagent fn` after a statement ending in postfix `?` is
  recognised as a declaration again (bug 0005 (b)).** A trailing ternary-head
  `?` and a trailing postfix `?` are lexically identical up to the newline,
  so the lexer swallows the newline after both and the parser's ternary-head
  scan disambiguates — but the scan read across the swallowed boundary into
  the *next* declaration, where a return annotation's depth-0 `:` (the param
  parens having closed) classified the postfix `?` as a ternary head:
  `subagent` was consumed as the consequent (`theta/parse/unknown-identifier:
  unknown identifier 'subagent'`) and the modifier silently dropped. The scan
  now answers *postfix* on meeting a depth-0 statement-only keyword (`fn`,
  `let`, `if`, `else`, `while`, `return`, `schema`, `enum`, `import`,
  `export`, `break`, `continue` — keywords that can never sit at depth 0
  inside a ternary consequent; `for`/`in` stay allowed because `par for` is
  an expression), restoring the documented "the `?` trigger is the ternary
  head only" boundary. Real multi-line ternaries — trailing- and leading-`?`
  forms — are unaffected. Observed at 0.12.0.
- **A return-annotated `subagent fn` body accepts `?` (bug 0005 (c)).** The
  question-scope check treated the annotation as a plain-`fn` return type, so
  a query-`?` line inside `subagent fn helper(a: string): string { … }` fired
  `theta/parse/question-outside-result-fn` — annotating a function with
  exactly its inferred type changed body legality. Under FN-6 the body is a
  subagent session whose failure channel is the boundary `Err`, so the body
  is a `Result` scope for `?` regardless of annotation, and `): T` declares
  the **Ok payload** `T` (the `invoke<T>` analogue): the annotation is now
  validated against the FN-3-inferred Ok payload, firing the existing
  `theta/parse/invoke-return-type-mismatch` on a statically-resolvable
  incompatible payload and deferring to the runtime boundary validation
  otherwise. Semantics recorded in `docs/spec_topics/functions.md` FN-6
  (Return). Present since 0.7.1.

## [0.13.0] - 2026-07-26

### Fixed

- **Postfix index access now terminates at a line break — a `[` that begins
  a line begins a new statement (bug 0006).** `parsePostfix` consumed any
  `[` after a complete expression as index access with no same-line check,
  and inside any block (`fn` / control-flow body — bracket depth > 0) the
  lexer's open-bracket continuation had already swallowed the newline, so a
  leading-`[` tail array glued onto the previous statement: `let a = "x"`
  followed by `["a", a]` mis-parsed as `"x"["a"`, firing
  `theta/parse/non-indexable-receiver` plus a stray-token cascade two lines
  from the real construct — or, with an indexable receiver, silently binding
  the wrong value and dropping the fn's tail. The same gluing shredded
  comma-less `match` arms with array patterns (`[] => "E"` then `["a"] =>
  "A"` parsed `"E"["a"]`). The `[` must now open on the same line as its
  receiver's end; a `[` beginning a line starts a new statement/arm. An
  index whose `[` opens on the receiver's line may still spill its index
  expression across lines (open-bracket continuation unchanged), and the
  top level — which never glued — is unaffected. Rule recorded in
  `docs/reference/grammar.md` §"Statement termination & newline
  continuation". Present since 0.7.1.

## [0.12.0] - 2026-07-25

### Fixed

- **A real spawned subagent child no longer deadlocks at startup under
  `pi -p` (bug 0002).** The production spawn gave the child `pi --mode json
  -p "/<slug>"` an open parent-held stdin pipe that nothing wrote to or
  closed on the normal path — but pi's json/`-p` startup reads any non-TTY
  stdin **to EOF before the argv prompt is processed**, so the child never
  started: the parent awaited the `theta_result` envelope while the child
  awaited stdin EOF, and every real subagent-mode invocation (and every
  `invoke` of a subagent-mode callee) on the `-p` surface hung until
  externally killed, then resolved fail-closed. The child is now spawned
  with stdin already closed (`stdio: ["ignore","pipe","pipe"]` in
  `createProductionSpawnFn`) — the same treatment the acceptance harness
  already gave the outer `pi -p` process — so it starts immediately, emits
  its envelope on fd 1, and exits 0 in about a second. Present since the
  RFC-0006 switch from `--mode rpc` (exempt from pi's stdin gate) to
  `--mode json -p` (gated) in 0.9.0; confirmed and mechanised by
  `docs/bugs/0002-investigation.md`.
- **Acceptance-harness subagent children now bind the extension build under
  test (bug 0002, defect 2).** The child argv carried no `-e`/`-ne`, so
  while the harness pinned the OUTER `pi -p` process to the working tree,
  the INNER spawned child bound whatever ambient theta build the machine
  carried — on a machine with a stale global install, a pre-envelope build
  that made cases (e)/(g) fail closed even with the stdin fix. The launcher
  now honours an opt-in knob: when `PI_THETA_SUBAGENT_EXTENSION_PIN` names
  an extension entry directory, the child argv is prefixed with
  `-ne -e <dir>` (spec `#subagent-extension-pin`); the acceptance harness
  sets it to `<repo>/extensions`, and full env inheritance pins nested
  children too. Production default — knob absent, ambient discovery — is
  unchanged.

### Changed

- **Subagent cancellation is now abort → child kill (PIC-63 retired,
  re-coined PIC-66).** The retired contract's stdin-close
  "grace signal" was empirically a **start** signal, not a stop: closing
  stdin unblocks a startup-gated `-p` child, which then runs the whole
  callee — real model turns included — until the kill lands; and with stdin
  now spawned closed there is nothing to close at cancel time. The one-shot
  `thetaAbort` listener now initiates the kill directly — a process-tree kill
  on Windows, a direct `SIGKILL` to the child elsewhere (nested-descendant
  reaping on POSIX is not promised; PIC-65 layer 2 bounds the orphan window) —
  synchronously when already aborted at attach; the drive settles
  `Err(cancelled)` via the existing short-circuit, and teardown's bounded
  await → kill remains the backstop. No grace step is preserved — nothing
  ever listened to it.
- **Orphan-prevention class 2 is recorded honestly (PIC-9 retired,
  re-coined PIC-65).** The spec claimed the child exits when its
  parent-held stdin pipe reaches EOF on parent death; in reality EOF
  *starts* a `-p` child (it would run its whole invocation after parent
  death, then exit), and with stdin closed at spawn no parent-death pipe
  signal exists at all. PIC-65 records that no implemented tether exists at
  theta 1.0: controlled paths still hard-kill per teardown; the child-side
  parent-PID watchdog stays the recorded fallback, explicitly unimplemented
  (`PI_THETA_SUBAGENT_PARENT_PID` is carried by the launcher and read by
  nothing), with the orphan window bounded by one invocation. Teardown is
  re-based as bounded-await → kill (process-tree on Windows, `SIGKILL`
  elsewhere); its residual stdin release is a structural no-op kept only for
  non-production child handles. The
  `#subagent-cli-wire-pins` and version-bump audit items (o)/(y) now pin
  the true stdin-EOF input-complete/start behaviour.

### Added

- **Provider-free real-spawn regression test in the default suite**
  (`tests/subagent-child-real-spawn.test.ts`): spawns a REAL
  `pi --mode json -p` child through `createProductionSpawnFn` and the real
  launcher/driver against a scratch `mode: subagent` theta whose body is a
  pure tail expression (zero tokens), pinned to the working tree via the
  extension-pin knob, and asserts the `theta_result` envelope arrives and
  the child exits 0 within a bounded time. Closes the detection gap that
  let bug 0002 ship: the default suite's child coverage was fakes-only,
  and the only real-spawn suite was opt-in and credentialed.

## [0.11.0] - 2026-07-25

### Fixed

- **Extension-registered Pi tools are now reachable from PROMPT-mode
  thetas, model-facing and from theta CODE (bug 0001).** Naming an
  extension-supplied tool in a prompt-mode `tools:` list previously
  raised `theta/load/unknown-tool` and un-registered the whole theta, so
  a prompt-mode orchestration theta could reach such a tool by no path.
  `tools:` resolution is now **mode-independent**: any name in the
  `pi.getAllTools()` registry snapshot is admitted in both modes,
  carrying its `parameters` schema for the RFC-0002 disjointness check
  and the model tool spec. Model-facing reach follows from PIC-17 — the
  frozen callable set is the query-window active set, so an admitted
  extension tool is installed via `setActiveTools` and executed by the
  user's host session (the ambient session snapshot is still not unioned
  in). Code-side reach uses the PIC-64 host-loop dispatch rung, which is
  now establishable in the **parent** against the user's live host
  session and not only inside the subagent-root child: per call a
  uniquely-named theta-controlled bridge provider authors the `tool_use`
  with the code-supplied arguments verbatim, the host agent loop (which
  holds every registered tool's `execute`) runs it, the runtime reads the
  result back, and the model and active-set snapshot are restored in a
  `finally` on every path including throw and abort. Dispatches are
  serialised; zero model tokens are spent; theta code never obtains an
  executable `ToolDefinition`. A name that resolves at neither rung still
  refuses registration fail-closed with
  `theta/load/extension-tool-unreachable`.
- **A failed extension tool no longer lowers to `Ok` in theta code.** A
  host-loop result carrying `isError: true` was spread into an
  `AgentToolResultEnvelope`, which `routeToolReturnShape` treats as
  conforming — fabricating success from a failed tool. It now lowers to
  `Err(CodeToolError { cause: "execution" })` with the host's result text
  in the message, on both the prompt and subagent legs.

### Changed

- **Accepted cost of parent-side code-side dispatch.** In prompt mode the
  dispatch lands in the user's live session: each code-side call injects
  a fabricated user message plus tool-call and tool-result cards (SLSH-2
  forbids suppressing them) and switches the session model twice
  (`model_select` fires on the way in and out). This is accepted as the
  cost of the zero-token code channel and is not suppressed. Latency is
  negligible next to a real model turn. No new permission gate: the
  capability stays bounded by the two existing gates (the theta must name
  each tool in `tools:`; the project must be trusted), and `bash` — the
  maximal capability behind those same gates — already dispatches with no
  per-call model-turn checkpoint.
- **`subagent fn` inline bodies join code-side dispatch.** An inline
  `subagent fn` body's code-side extension-tool call dispatches through
  the process's backing host session — the child's private, discarded
  session inside a subagent-root child; the user's live session in the
  parent, with the prompt-mode accepted cost above applying — superseding
  the 0.10.0 release note's "inline bodies remain model-facing only".
  FN-6's isolation is scoped to the body's conversation (its queries, its
  transcript, its return value), not to the dispatch channel; the
  load-time reachability walk already covered `fn` bodies, so an inline
  body is not a no-rung context and registration keeps tracking rung
  availability alone. Spec: PIC-64 (inline-body dispatch context), FN-6
  (conversation-scoped isolation carve-out), CTRL-4 (`par for`
  interaction with the dispatch channel).
- **Step 0 (c) capability probe now asserts eight function members.**
  `pi.getAllTools` joins capability 4, so a host missing it refuses
  fail-closed at load with `theta/load/host-incompatible` /
  `sdk-capability-missing` instead of throwing a `TypeError` during
  admission. The seven capability *obligations* are unchanged. The SDK
  surface inventory re-kinds `pi.getAllTools` to a factory-probable
  `namespace-function`.
- **Dispatch-ladder rung-1 availability is now derived, not assumed.**
  Rung 1 (`pi.getToolDefinition`) is recorded available only when the SDK
  surface is present **and** a rung-1 dispatcher is wired, keeping
  registration and dispatchability in agreement — recording it from the
  bare SDK surface would register thetas whose every code-side call then
  failed for want of a dispatcher. The normative rung-1-preferred
  ordering is unchanged, so the rung slots in automatically when it lands
  upstream.

  Spec: PIC-61 retired per GOV-8 *Deletion*+*Add* (its child-only rung
  availability invariant is inverted) and re-coined as
  [PIC-64](docs/spec_topics/pi-integration-contract/subagent.md#pic-64);
  `tools:` admission, the resolution snapshot, PIC-17, the Step-0 probe,
  the capability inventory, and the `theta/load/unknown-tool` /
  `theta/load/extension-tool-unreachable` registry rows updated in
  lock-step.

## [0.10.0] - 2026-07-24

### Added

- **Extension-registered Pi tools are now callable from theta CODE in
  subagent mode (host-loop dispatch, PIC-61 rung 2).** The RFC 0006
  code-side dispatch ladder's host-loop rung is wired: inside the
  subagent-root child, a code-side `<name>(args)` call to an
  extension-registered Pi tool registers a per-dispatch theta-controlled
  provider whose stream function authors the `tool_use` with the
  code-supplied arguments verbatim; the child's host agent loop (which
  holds every registered tool's `execute`) runs the call, and the runtime
  reads the tool result back — deterministic arguments, zero model tokens,
  no executable definition ever obtained by theta code. The fabricated
  turn and temporary session-model switch are confined to the child's
  private, discarded `--no-session` session. The mechanism was
  prototype-verified end-to-end against the pinned Pi v0.80.10 (the
  RFC-designated acceptance criterion) before wiring. A theta whose code
  calls an extension tool now loads and dispatches in the child; contexts
  with no dispatch rung (parent/prompt mode) keep the fail-closed
  `theta/load/extension-tool-unreachable` refusal. `subagent fn` inline
  bodies (in-process, off-session) remain model-facing only.

### Fixed

- **Result envelope reached stderr instead of stdout in a real child
  (latent 0.9.0 defect).** Pi's non-interactive output guard reassigns
  `process.stdout.write` to stderr in `--mode json`, so the PIC-59
  `theta_result` envelope written through the extension's stdout would
  never have reached the parent's stdout scan in a real spawned child.
  The envelope writer now writes file descriptor 1 directly
  (`fs.writeSync(1, line)`, one atomic newline-terminated line),
  bypassing the reroute.

## [0.9.0] - 2026-07-24

### Changed

- **Subagent mode now runs the whole callee theta in the child process
  (RFC 0006).** The RFC 0005 remote-session design (parent-side interpreter
  driving a child `pi --mode rpc` session) is superseded: each subagent-mode
  invocation spawns `pi --theta <dirs> --mode json -p "/<slug>" --no-session`
  and the callee's interpreter, typed-query mechanics, and resolution
  snapshot all execute inside the child under a new *subagent-root* regime
  (selected by the `PI_THETA_SUBAGENT_ROOT=<slug>` env marker, never
  authorable from a `.theta` file; a nested subagent callee still spawns its
  own child). Observable theta language semantics are unchanged. The RPC
  drive contract is retired — deleted, not kept as a fallback; the RFC 0005
  launcher, executable-resolution ladder, trust inference, teardown/kill,
  and orphan-handling machinery are reused under the new driver.
  Spec: `pi-integration-contract/subagent.md` rewritten again (new
  PIC-58…PIC-63; PIC-40/41 retired with successors PIC-62/63; PIC-42/43
  retired), plus `invocation.md` (INV-5), §Resolution snapshot, SLSH-2,
  and satellite pages.
- **Cancellation without RPC.** `thetaAbort` now closes the parent-held
  child stdin pipe as the grace signal, then process-tree kills after the
  bounded budget; the drive's terminal signal keys off stdio close so a
  final envelope flushed at exit is never lost.

### Added

- **Typed return values cross the process boundary via a result envelope.**
  The child emits one JSONL line `{"theta_result":{"v":1,"ok":…}}` /
  `{"theta_result":{"v":1,"err":…}}` on stdout alongside the `--mode json`
  event stream; the parent scans stray-line-tolerantly, verifies the
  envelope version (skew detected, not tolerated), and maps to `Ok`/`Err`
  with full `Result` fidelity (every `QueryError` variant, `CodeToolError`,
  `InvokeInfraError` causes, panics as internal-error). A child that exits
  without an envelope maps fail-closed to
  `Err(InvokeInfraError { cause: "internal_error", … })` — never a
  fabricated value.
- **Marshalled params channel (binder bypass).** Already-typed param values
  travel to the child as canonical JSON — `PI_THETA_PARAMS` env var below
  the pinned 8 KB threshold, a 0600 temp file via `PI_THETA_PARAMS_FILE` at
  or above it (child reads and deletes; parent-`finally` backstop). The
  child validates against the theta's `params:` schema and skips the binder
  entirely; binder inference remains exclusive to human slash invocation.
- **Code-side extension-tool dispatch ladder (fail-closed).** A theta whose
  code calls an extension-registered Pi tool now loads only when a dispatch
  rung is available (upstream `getToolDefinition` when exposed, host-loop
  dispatch otherwise); with no rung the theta refuses to register at load
  with `theta/load/extension-tool-unreachable`. The host-loop dispatch
  module ships behind DI seams; its live wiring is the RFC's designated
  follow-up, so this release keeps the rung fail-closed (model-facing
  extension-tool reach is unaffected). No new permission gate: the existing
  `tools:` declaration, operator trust decisions, and fail-closed
  registration remain the gates.
- **Whole-callee content-hash verification.** The parent's load-time hash
  now covers the root `.theta` plus transitive `.thetalib` imports; the
  child verifies after its own parse and refuses diverged callees.
- New diagnostics: `subagent-envelope-parse-failed`,
  `subagent-envelope-schema-skew`, `subagent-exit-without-envelope`,
  `subagent-params-validation-failed` (runtime) and
  `extension-tool-unreachable` (load); `subagent-child-crashed`,
  `subagent-wire-parse-failed`, `subagent-model-preflight-mismatch`
  rescoped to the envelope/json child.

### Removed

- The RFC 0005 RPC session driver (`subagent-rpc-driver`), the per-query
  `agent_end` extraction, the RPC `abort` command mapping, the parent-side
  subagent query model, and the `PI_THETA_SUBAGENT_CHILD` boolean marker
  (subsumed by `PI_THETA_SUBAGENT_ROOT`).

## [0.8.0] - 2026-07-24

### Changed

- **Subagent mode now runs each invocation in a spawned child `pi` process
  (RFC 0005).** The in-process `createAgentSession` subagent session is
  replaced by a per-invocation child `pi --mode rpc --no-session` process
  driven over Pi's documented RPC JSONL protocol. The observable theta
  language semantics are unchanged (isolated conversation, private transcript
  discarded on return, only the return value propagates, no ambient tool
  inheritance), with one stated adjustment: installed extensions'
  contributions (system-prompt appends, handlers, providers) are present in
  the child, as in any Pi session — no user/project context (files, skills,
  templates) is inherited. Executable resolution re-launches the running
  parent binary (entry-script or compiled-binary rung; no `PATH` fallback;
  fail-closed at load with `theta/load/subagent-executable-unresolved`).
  Spec: `pi-integration-contract/subagent.md` rewritten (PIC-9/22/40/41/42/43
  successors; PIC-23 retired) plus satellite pages.

### Added

- **Extension-registered Pi tools are reachable by a subagent theta's model.**
  A subagent-mode `tools:` list now resolves against `pi.getAllTools()` —
  extension-supplied tools included — and is passed to the child as a
  `--tools` allowlist (empty callable set maps to `--no-tools`). Child trust
  follows necessity-inference: `--approve` iff the callable set contains a
  project-local extension tool, `--no-approve` otherwise. Code-side dispatch
  of extension tools from theta code remains out of scope (RFC 0006) and
  fails, surfacing as `Err(CodeToolError)` to theta code — never a silent
  fallthrough.
- **`.theta` callable content-hash verification across the process boundary.**
  The parent records a transitive-closure content hash of each `.theta`
  callable at load and marshals it to the child; the child verifies after its
  own parse and refuses diverged callees fail-closed
  (`theta/runtime/subagent-callable-hash-mismatch`).
- **Model pre-flight for inherited session models.** When a subagent theta
  inherits the caller's live session model, the runtime confirms via the
  child's RPC state surface that the marshalled `--provider`/`--model`
  reference resolved to the intended model before the first query
  (`theta/runtime/subagent-model-preflight-mismatch` on divergence).
- **Invoke-depth carriage across processes.** The `invoke`-chain depth
  counter is marshalled to subagent children on
  `PI_THETA_SUBAGENT_INVOKE_DEPTH`, so the depth-32 hard ceiling continues
  across process hops instead of resetting.
- New diagnostics: `subagent-spawn-failed`, `subagent-child-crashed`,
  `subagent-wire-parse-failed`, `subagent-teardown-timeout`,
  `subagent-callable-hash-mismatch`, `subagent-model-preflight-mismatch`
  (runtime) and `subagent-executable-unresolved` (load);
  `subagent-dispose-failure` re-scoped to child teardown.

### Removed

- The in-process subagent machinery: `createAgentSession` spawn block, the
  closed seven-name `customTools` materialisation, the `ResourceLoader`
  adapter (PIC-23), and `SessionManager.inMemory` transcript privacy (now
  `--no-session` ephemeral per the pinned CLI contract). The capability
  probe's factory-probable member set shrinks nine → seven and gains a
  Step 0 (f) executable-resolution probe.

## [0.7.1] - 2026-07-21

### Fixed

- **Teardown-quiesce the hot-reload watcher (PIC-57).** A debounced
  file-watcher registry rebuild could resume *after* the session's extension
  runtime was invalidated on teardown (`/new`, `/resume`, `/fork`, `/reload`,
  or quit), driving re-registration or diagnostic emission through a stale
  `pi.*` surface and throwing against Pi's `assertActive()` (surfacing as
  `registry swap failed: theta watcher` + `system-note delivery failed` on
  teardown). Root cause: the reload debouncer's cancel cleared only the pending
  timer, not an in-flight rebuild or the deferred re-arm, and `session_shutdown`
  did not await the in-flight rebuild before returning. `ReloadDebouncer` is now
  teardown-aware (`markTornDown()` clears the pending timer and the deferred
  re-arm and short-circuits any new rebuild; `whenIdle()` resolves once no
  rebuild is in flight), and `session_shutdown` sub-step 4 marks the debouncer
  torn-down and awaits `whenIdle()` — bounded by the same absolute
  `SHUTDOWN_AWAIT_CAP_MS` deadline sub-step 3 already uses, with degrade-to-skip
  if it has elapsed — so an in-flight rebuild completes (or no-ops) while the
  ctx is still active, and no watcher rebuild ever runs against an invalidated
  runtime. No new diagnostic code. Spec: new **PIC-57** in
  `session-shutdown-semantics.md`.

## [0.7.0] - 2026-07-21

### Added

- **`subagent fn` — in-file subagent callables (RFC 0001).** A `subagent`
  modifier on the top-level `fn` form whose body evaluates in a fresh, isolated
  subagent session — the same boundary an `invoke("./child.theta", ...)` crosses,
  without a second file. Identical to an ordinary `fn` in its parameter list,
  positional call form, and inferred-and-validated return type; the sole
  difference is the per-call session boundary. `@` queries in the body target the
  spawned session, not the caller's conversation (the caller's conversation stays
  unpolluted). Arguments cross by value with no closure capture; the return value
  crosses the boundary as the `Ok` payload, a callee `Err` surfaces as
  `InvokeCalleeError`, and a body panic as `InvokeInfraError`. The spawned
  session inherits the enclosing theta's configuration by default; an optional
  `with { ... }` clause overrides any subset of `{ system, model, tools,
  tool_loop, respond_repair }` (an unresolvable `with { model }` is rejected at
  load with `theta/load/model-unresolved`). A `subagent fn` call is a countable
  frame under the depth-32 `invoke` ceiling, and a self-referencing `subagent fn`
  is rejected at load as a length-1 `theta/load/invocation-cycle`; a body that
  fails to parse or type-check surfaces `theta/load/callee-has-errors` (inline,
  naming the function). Callable from a `mode: prompt` theta (the prompt→subagent
  cross-mode cell) and admissible on a `.thetalib` fn (a shared, isolated library
  helper whose session inherits the calling theta's configuration and whose
  `with { tools }` narrows against the calling theta's callable set). `subagent`
  and `with` are contextual keywords, so existing identifiers are unaffected. No
  new runtime or parse diagnostic codes are introduced (all reuse existing
  codes). Bumps the theta language surface to **theta 1.2**.

## [0.6.0] - 2026-07-20

### Added

- **`par for` — structured parallel fan-out (RFC 0003).** A parallel loop form
  that evaluates its body concurrently for each element of an `array<T>` iterand
  and collects per-iteration results in input-index order as a value-producing
  expression of type `array<Result<T, QueryError>>`. Iterations run against
  isolated work only (child sessions, `invoke`, `subagent fn`, Pi-tool calls, and
  pure computation) — never the enclosing conversation. The optional `max <expr>`
  clause (any `integer`-typed expression) lowers the in-flight width; without it
  a per-loop throttle of 64 in-flight iterations applies (excess queues; the
  throttle is not a routing-class hard ceiling). Each iteration reports
  independently: an `Err` (or a downgraded per-iteration panic, ERR-20) becomes
  that element's value and does not cancel siblings; whole-theta cancellation is
  terminal (no final value). `par` is a contextual keyword recognised only before
  `for`, so existing identifiers named `par` are unaffected. Legal in both
  prompt- and subagent-mode thetas. New parse diagnostics:
  `theta/parse/par-query-in-body`, `theta/parse/par-shared-mutation`,
  `theta/parse/par-break-continue`. Bumps the theta language surface to
  **theta 1.1**.

## [0.5.0] - 2026-07-20

### Added

- **Computed field values in Pi-tool arguments (RFC 0002).** The single
  positional bare-object argument of a Pi-tool call now admits **full Theta
  expressions** for its field values — identifier references, operators, function
  and tool calls, `?`, `${...}` interpolation, and nested arrays/objects whose
  leaves are expressions — instead of restricting them to the Theta literal
  sublanguage. The bare-object *shape* rule is unchanged (a single object literal
  written inline, typed by the tool's registered input schema); `params:`
  defaults remain literal-only and are out of scope. Field-value expressions
  evaluate left-to-right in source order at call time, before dispatch; a panic
  or early-returning `?` aborts dispatch. This is an additive source-language
  change under the GOV-15 diagnostic-registry carve-out and lands within theta
  1.x. Spec: `docs/spec_topics/tool-calls.md`, `docs/spec_topics/grammar.md`,
  `docs/reference/grammar.md`, `docs/spec_topics/expressions.md`.
- **`theta/parse/tool-arg-schema-conflict`** — new error-severity parse
  diagnostic (DIAG-2 code addition). Fires only when a Pi-tool field-value
  expression's static type is *provably disjoint* from the tool's input-schema
  field type mapped through the schema subset (a sound front-run of a certain
  runtime AJV rejection); formats, patterns, numeric refinements, and satisfiable
  unions fall through to the runtime AJV check and are never rejected at parse
  time.
- **`theta/parse/tool-arg-not-object-literal`** — new error-severity parse
  diagnostic (DIAG-2 code addition) for the surviving bare-object *shape* rule:
  a Pi-tool argument that is not written inline as a bare object literal (e.g. a
  `let`-bound object passed as `read(args)`). Its message directs the author to
  inline the fields, replacing the mis-scoped reuse of
  `theta/parse/bare-object-literal`.

### Removed

- **`theta/parse/tool-arg-not-literal`** retired for Pi-tool call sites (DIAG-2
  code removal), superseded by the computed-argument grammar above.
  `theta/parse/tool-arg-arity` and `theta/parse/default-not-literal` are
  unchanged.

## [0.3.0] - 2026-07-19

### Changed

- **Ported to the Pi SDK 0.80.x API.** Bumped `@earendil-works/pi-coding-agent`,
  `pi-agent-core`, `pi-ai`, and `pi-tui` to `0.80.10` and adapted the runtime and
  test harnesses to the reshaped SDK surface:
  - `complete` is now imported from the `@earendil-works/pi-ai/compat` subpath
    (it moved off the package root in 0.80.x).
  - `createAgentSession` model/auth wiring migrated from the removed
    `modelRegistry` / `authStorage` options to `modelRuntime`
    (`ModelRuntime.create()`); `ModelRegistry` is now built via
    `new ModelRegistry(runtime)` (the static `.create()` factory was removed).
- **Split the SDK dependency-range convention.** `devDependencies` are pinned to
  the build/test target `~0.80.10`; `peerDependencies` now declare an open floor
  (see Breaking) instead of a single shared tilde range. Updated the `#pi-sdk-pin`
  contract (PIC-33/PIC-34, the manifest lock-step, and the "Deliberate deviation"
  rationale) to describe the peer-floor / dev-pin split.

### Breaking

- **Raised the minimum supported Pi version to `>=0.80.8`.** `peerDependencies`
  moved from `~0.75.5` to `>=0.80.8` — the earliest release in which every SDK
  API shape the runtime requires exists. Hosts on Pi `< 0.80.8` are no longer
  supported and are rejected by the runtime peer-dependency probe.

## [0.2.0] - 2026-07-19

### Changed

- **Renamed the project Loom → Theta** (named after Turing's fixed-point
  combinator, Θ), to resolve a package-name collision with an unrelated
  `pi-loom`. This is a breaking rename across every surface:
  - Package `@bitmonk8/pi-loom` → `@bitmonk8/pi-theta` (published as `0.2.0`).
  - File extensions `.loom` → `.theta` (programs), `.warp` → `.thetalib`
    (library modules).
  - CLI flag `--loom` → `--theta` (hard rename, no alias).
  - Discovery/settings/manifest surfaces `~/.pi/agent/looms/` →
    `~/.pi/agent/theta/`, `.pi/looms/` → `.pi/theta/`, `loomPaths` →
    `thetaPaths`, `pi.looms` → `pi.theta`, `looms.*` settings → `theta.*`.
    Old names are not honoured; an old-named dir/key surfaces a one-shot
    deprecation diagnostic.
  - Diagnostic-code prefix `loom/*` → `theta/*` (suffixes unchanged, except
    those naming the old extension, e.g. `import-non-warp-extension` →
    `import-non-thetalib-extension`).
  - Runtime identifiers `Loom*` → `Theta*`, `Warp*` → `ThetaLib*`.
  - Release-version literal `loom X.Y` → `theta X.Y`; governance anchors
    `loom-1-0-*` → `theta-1-0-*`.
  - Retired the legacy `v1-*` HTML-anchor dual-anchor governance machinery
    (GOV-25–GOV-29) wholesale, repointing all inbound `#v1-*` cross-references
    to their `theta-1-0-*` canonical arms.
  - See [`docs/rename-to-theta.md`](docs/rename-to-theta.md) for the full plan.
