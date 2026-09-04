# Bug 0421 — Bug 0405's re-pin sweep enumerated only the three files 0389 §Residuals named as examples, and the same 0389-shift stale class survives at pin in ELEVEN other test files: 36 bare-form `grammar.md:N` cites (12 inside assertion messages/labels) still name pre-shift lines — five `:221` cites in the nested-sink LIVE cell for the sink bullet now at `:230`, `:175` for `AliasRhs` (now `:184`) in four files including the line-pinned LPA, and the falsified `fn-param-list-unclosed` contrast comment 0389's own §Residuals item 2 recorded — plus three same-class comment cites in two `src/` parser files

- **Status:** fixed (0.427.0).
- **Sev/Diff estimate:** S5/D1 — S5: doc/records drift, but the exact class
  0405 was filed and fixed for, at the same crispness (each instance is a
  mechanical cited-line-vs-actual-content mismatch with the 0389 +5/+9
  signature), with the same hazard 0405's §Why-it-matters claimed (stale
  cites inside assertion messages misdirect the debugging session that
  reads them on a red). D1: a bounded mechanical re-pin over the enumerated
  set below (comment/message-string only), with two special-handling files:
  the LPA (line-count pin — the 0336 precedent proves the one-line refresh
  is routine) and `fn-param-list-unclosed` (one SEMANTIC sentence, 0389
  §Residuals 2's falsified contrast comment, needs a one-clause rewrite,
  not a number).
- **Kind:** test-infrastructure / doc drift — non-load-bearing for verdicts
  (all assertions are on codes/messages/behaviour; spot-checked), but the
  stale numbers inside assertion messages are diagnostics that lie (wrong
  site) exactly when read.
- **Related:**
  - 0405 (fixed 0.415.0) — the parent sweep. Its §Affected claims "16 stale
    numbers across the three files 0389 named"; its §Summary states "This
    report enumerates and verifies the concrete stale set" (file-scoped by
    its own clause, corpus-suggestive), and its §Fix verification line
    states "no stale cite remains" — unqualified, and false corpus-wide.
    Its own §Fix had already found one more in the same files (review F1,
    `grammar.md:140→145`). The enumeration method — grep the three example
    files — never swept the rest of `tests/` (or `src/`), so the
    sweep-completeness claim fails corpus-wide. Its witness
    `tests/b0405-grammar-cite-sweep-gate.test.ts` locks only the three
    swept files' targets.
  - 0389 (fixed 0.395.0) — the +9 shift's origin (its prefix-form sweep
    re-pinned 11 files); §Residuals item 1 named the bare/continuation-form
    remainder "e.g." the three files (examples, not an enumeration), and
    §Residuals item 2 separately recorded the `fn-param-list-unclosed:13-16`
    contrast comment its own fix falsified ("the reference mirror adds
    `SubagentMod?` and `WithClause?`" — the spec mirror now carries both).
    Item 2 was in NEITHER 0405's scope nor any other filing.
  - [0134](./0134-params-shift-induced-stale-citations.md)
    (fixed 0.198.0) — boundary: this set is shift-induced by one identified
    commit (0389's insertion), outside the pre-existing position-only
    do-not-file class; spec pages are legitimately line-cited under
    §Citations, so the remedy is a re-pin, not symbol conversion.
  - [0336](./0336-stale-lexical-environment-cite-in-lpa-comment.md)
    (fixed 0.308.0) — the LPA-refresh precedent: a one-line comment fix in
    the line-pinned live-production-acceptance file, holding the 14864-line
    pin.
  - [bug 0419](./0419-b0366-header-asserts-reversed-belt-design.md) — sibling semantic-drift filing (b0366
    header); different mechanism (reversed quote vs shifted number), same
    follow-on lane.
- **Affected** (every instance re-verified at `04579e12`, v0.415.0, by
  comparing the citing sentence's content claim against the current
  `docs/spec_topics/grammar.md` line; spec truth beside each group. `[A]`
  marks assertion-message/label strings):
  - Truth table (current grammar.md): `FnParams ::=` `:144`; `FnParam ::=`
    `:145`; "parameter list is parenthesised" prose `:148`; ArmBody
    `::= Expr | BlockExpr` `:158–159`; match worked example fence
    `:164–173` (`:162` is the prose sentence, the fence opens at `:164`;
    `"fallback"` `:170`); by-form grammar block `:179–186` (`SchemaDecl`
    `:180`, `AliasRhs` `:184`); by-on-object prose `:188`; enum-variant
    doc-comment anchor bullet `:201`; fn/alias lowering sentences `:204`;
    newline-separator prose `:208`; sink-exhaustive `:225`;
    recursive-descent sink bullet `:230`.
  - `tests/live/nested-array-element-sink-descent-live-cell.test.ts:11, 95,
    189, 311 [A], 322 [A]` — five bare `grammar.md:221` cites of the
    recursive-descent sink bullet; truth `:230`; `:221` is the
    newline-closes-statement sentence. The file's OWN line 1 (prefix form)
    was re-pinned to `:230` by 0389 — the offline twin's identical `:221`s
    were 0405's headline instances; the live twin was missed.
  - `tests/live/live-production-acceptance.test.ts:2342` — bare
    `grammar.md:175` for the alias-RHS `Type ("|" Type)*` extent; truth
    `:184`. Line-pinned file (0336-precedent handling).
  - `tests/fn-param-list-unclosed.test.ts:14–15` — SEMANTIC: quotes the
    pre-0389 `FnDecl` production and claims "the reference mirror adds
    `SubagentMod?` and `WithClause?`" — falsified by 0389 itself (spec
    `FnDecl` at `:138` now carries both; 0389 §Residuals 2 recorded this);
    `:17` bare `:139` for `FnParams` (truth `:144`); `:18` bare `:140` for
    `FnParam` (truth `:145`); `:20` bare `:143` for the parenthesised-list
    prose (truth `:148`); `:344 [A]` "grammar.md:138 makes the closing `)` a
    required terminal and grammar.md:139 derives no `{` at a FnParam
    position" (`:138` correct, `:139` stale → `:144`); `:532` bare `:139`
    trailing-comma claim (truth `:144`).
  - `tests/b0357-doc-comment-field-variant-anchors.test.ts:217 [A]` —
    "`///` above an enum variant is grammar.md:192 legal"; truth `:201`;
    `:192` is a code-fence line.
  - `tests/b0358-doc-comment-descriptions-lower.test.ts:31, 183, 214, 436,
    486` — five bare `:195` cites of the fn-lowers-nowhere / alias-lowers
    sentences; truth `:204`; `:195` is blank.
  - `tests/blockexpr-production.test.ts:211, 289 [A]` — `:150` for
    `ArmBody ::= Expr | BlockExpr` (truth `:158–159`); `:218 [A]` —
    "grammar.md:153–164's worked example" (truth `:164–173`); `:157` —
    "`:161`'s `\"fallback\"`" (truth `:170`). Line `:153` already cites
    `:164–173` (0389-re-pinned, current) — leave it alone.
  - `tests/b0387-block-expr-tail-query-consumption.test.ts:327` — `:150`
    for "the block-expr's second admitted position" (truth `:159`).
  - `tests/schema-alias-union-decl.test.ts:511 [A], 525 [A]` —
    "grammar.md:170–177" for the schema-decl grammar block / statement set
    (truth `:179–186`); `:820` — comment `:177` for the by-head parse rule
    (truth: block `:179–186`, `:177` is now the section heading); `:889`
    and `:905 [A]` — `:179` for the by-on-object rejection prose (truth
    `:188`; `:179` is the opening fence). File total: 5. Line `:29` cites
    `grammar.md:179–186` and is CURRENT — protect it.
  - `tests/brace-rooted-union-arm-capture.test.ts:653` — `:143` "makes each
    `FnParam` an `Ident \":\" Type` pair" (truth `:145`; `:143` is
    `WithValue`); `:658 [A]` — "grammar.md:138/:143: the type slot is one
    `Type`" (`:138` current, `:143` stale → `:145`; continuation form);
    `:1088 [A], 1101` — `:175` for `AliasRhs` (truth `:184`).
  - `tests/schema-alias-rhs-malformed.test.ts:26` — continuation-form
    comment "grammar.md:120 …, :199 and :212 — statements are separated by
    newlines": two stale numbers (`:199` and `:212`, truth `:208`; `:212`
    is now a trigger-table row; `:120` is current); `:518 [A]` — `:175` for
    `AliasRhs` (truth `:184`); `:1387` — `:199` for the statement-separator
    prose (truth `:208`; `:199` is the `EnumDecl` anchor bullet).
  - Same class in `src/` (unswept by 0389/0405, same +5/+9 signature):
    `src/parser/theta-document.ts:818` — doc comment cites `grammar.md:195`
    for the alias-form lowering sentence (truth `:204`; `:195` is blank);
    `src/parser/type-layer-checks.ts:2298` and `:2343` — comments cite
    `grammar.md:221` for the recursive-descent sink bullet (truth `:230`;
    `:221` is the newline-closes-statement sentence).
  - `tests/inline-empty-object-type.test.ts:84` — `:175` for the alias RHS
    position (truth `:184`).
  - NOT in scope (verified non-instances): every `docs/reference/grammar.md`
    cite half (pre-existing reference-side drift, 0405 §Non-goals, separate
    audit — includes all `:215/:238/:254/:272/:289+/:332/:461/:599` hits);
    cites of `N < 139` (below the shift); `fn-param-annotation-optional`
    and the three 0405-swept files (verified current);
    era-pinned `docs/bugs/**`.
- **Observed at:** v0.415.0 (`04579e12`), offline — `grep -rnoE
  "grammar\.md:[0-9]+" tests/ src/` filtered to spec-target shift-zone hits, each
  adjudicated by `sed` against the current grammar.md content named in the
  citing sentence.

## Summary

0389 inserted 9 lines into `docs/spec_topics/grammar.md` (+5 through the
`fn`-declarations block, +9 from the `SubagentMod`/`WithClause` prose
onward) and re-pinned the prefix-form cites; 0405 was filed to sweep the
bare/continuation forms, but scoped its enumeration to the three files
0389's residual had offered as examples ("e.g."). A corpus grep at pin finds
the identical class — bare/continuation-form spec-grammar cites whose
content claim now sits +5/+9 lines away — in eleven more test files: 36
instances, twelve of them inside assertion messages or `why` labels (the
exact lying-diagnostic hazard 0405 filed on), including five in a live cell
whose own header 0389 re-pinned and one in the line-pinned LPA — plus
three same-class comment instances in two `src/` parser files
(`theta-document.ts:818`, `type-layer-checks.ts:2298/:2343`). The set also
carries the one SEMANTIC instance 0389's own §Residuals item 2 recorded and
no one filed: `fn-param-list-unclosed`'s contrast comment still tells the
reader the spec production LACKS the `SubagentMod?`/`WithClause?` slots
that 0389 added.

## Reproduction

```
# the class (spec-target, shift zone), e.g.:
sed -n '221p;230p' docs/spec_topics/grammar.md
# 221: "When no trigger holds, the newline closes the statement…"
# 230: "- The element type of an array-typed sink … (recursive descent)."
grep -n "grammar.md:221" tests/live/nested-array-element-sink-descent-live-cell.test.ts
# :11 :95 :189 :311 :322 — all cite the recursive-descent bullet
sed -n '184p' docs/spec_topics/grammar.md   # AliasRhs ::= Type ("|" Type)*
grep -n "grammar.md:175" tests/brace-rooted-union-arm-capture.test.ts \
  tests/schema-alias-rhs-malformed.test.ts tests/inline-empty-object-type.test.ts \
  tests/live/live-production-acceptance.test.ts
sed -n '13,21p' tests/fn-param-list-unclosed.test.ts
# quotes the slot-less FnDecl + "the reference mirror adds SubagentMod? and
# WithClause?" — vs sed -n '138p' docs/spec_topics/grammar.md (both slots present)
```

Every instance in §Affected reproduces the same way: the citing sentence
names content; the cited line holds different content; the named content
sits at the +5/+9 position.

## Expected behaviour

0405's own §Expected (the repo treats live test files' spec cites as
maintained pointers; 0389's assertion message pins "a resolution is an
in-place, line-count-preserving rewrite unless it re-pins those citations in
the same commit") — applied to the whole corpus rather than three files. A
cite of `grammar.md:N` in a maintained test names line N's current content.

## Actual behaviour / root cause

0389's sweep keyed on the prefix spelling; 0405's sweep keyed on the three
example files. Neither pass ran the corpus-wide grep either report's method
implies, and 0405's §Provenance dup-check confirmed only that its three
files' spellings were outside 0389's re-pin list. The b0405 content-anchored
gate then locked exactly the swept targets, so the surviving instances have
no failure signal (the citation-symbol-form gate legitimately exempts spec
pages from the line-form refusal).

## Why it matters

Same class and rationale as 0405, at ~2× its instance count: a future red in
the nested-sink LIVE cell tells its reader the normative anchor is the
newline-continuation sentence; a red in `schema-alias-union-decl` points at
a heading/fence; `fn-param-list-unclosed`'s header affirmatively misstates
the current spec grammar. Left unswept, each future grammar-appendix edit
compounds the drift, and the "concrete stale set" record 0405 shipped is
incomplete as a matter of fact.

## Non-goals

- Reference-side (`docs/reference/grammar.md`) cite halves — pre-existing
  drift, 0405 §Non-goals, separate audit.
- Era-pinned `docs/bugs/**` citations (frozen at filing).
- The `FnParam ::= Ident ":" Type` QUOTE-shape drift in
  `fn-param-name-reserved-keyword.test.ts:26` / `fn-param-list-unclosed`
  (the annotation-optionality change post-0150 made the annotation tail
  `(":" Type)?`) — different originating commit, different class (quote
  text vs line number); noted for a quote-drift sweep, not claimed here.
- Any assertion weakening: every edit is comment/message-string only; suite
  verdicts byte-identical.
- The three 0405-swept files and its gate (correct at pin).

## Fix

Mechanical re-pin of the enumerated instances (`139→144`, `140→145`,
`143→148` (prose) / `143→145` (FnParam), `150→158/159`,
`153–164→164–173`, `161→170`, `170–177→179–186`, `175→184`,
`177→179–186` (or reword to name the block), `179→188`, `192→201`,
`195→204`, `199→208`, `212→208` (or drop — `:212` is now a trigger-table
row), `221→230`), covering the three `src/` comment instances in the same
pass (comment-only, no code change), plus a one-clause rewrite of
`fn-param-list-unclosed.test.ts:14–15` to state that the spec production now
carries `SubagentMod?`/`WithClause?` (0389 §Residuals 2's remedy). Special
handling: the LPA edit must hold the file's line-count pin (0336 precedent:
same-line replacement); the live-cell file is edited comment/message-only
(its assertions are on codes/notes); already-current cites sharing a line
or file with stale ones (`schema-alias-union-decl.test.ts:29`,
`blockexpr-production.test.ts:153`, the `:138` half of
`brace-rooted-union-arm-capture.test.ts:658`) stay untouched. Extend
`tests/b0405-grammar-cite-sweep-gate.test.ts` (or add a sibling cell) to
content-lock the newly re-pinned targets so the next shift reds there first.
Alternative — convert these spec cites to anchor/heading form — declined:
§Citations keeps line numbers legitimate for spec sentences, and the
re-pin+gate pattern is the settled 0405 shape. Each protected witness file
listed in §Affected is authorized for the citation text alone, per the 0134
constraint-1 pattern.

## Provenance

fix-residuals-5 scope-claim spot-check of 0405 ("recount at pin; any
bare-form grammar.md:N cites left anywhere in tests/?"): corpus grep
`grammar\.md:[0-9]+` over `tests/`, spec/reference disambiguation by citing
line context, shift-zone filter `N ≥ 139`, per-instance content
adjudication with `sed` against `docs/spec_topics/grammar.md` at
`04579e12`. All truth lines quoted in §Affected re-read at pin. Dup check:
README index — 0405 is fixed and enumerates disjoint instances; 0389
§Residuals 1–2 read in full; no other citation-sweep report exists.

## Fix (0.427.0)

- What shipped: mechanical content-sensitive re-pin of the enumerated stale
  `grammar.md:N` cites (comment/message-string only) across eleven test files
  plus two `src/` parser comments, and the one settled SEMANTIC clause rewrite:
  - `tests/live/nested-array-element-sink-descent-live-cell.test.ts` — 5×
    `:221`→`:230` (recursive-descent sink bullet).
  - `tests/fn-param-list-unclosed.test.ts` — `:139`→`:144`, `:140`→`:145`,
    `:143`→`:148` (prose), plus lines :14-15 rewritten to state the SPEC
    `FnDecl` (grammar.md:138) now carries `SubagentMod?`/`WithClause?` (0389
    §Residuals 2's remedy); the reduced `FnDecl`/`FnParam` QUOTE-shapes at
    :13/:18 left per §Non-goals (quote-drift sweep).
  - `tests/b0357-…:217` `:192`→`:201`; `tests/b0358-…` 5× `:195`→`:204`;
    `tests/blockexpr-production.test.ts` `:150`→`:158–159`, `:153–164`→`:164–173`,
    `:161`→`:170`; `tests/b0387-…:327` `:150`→`:159`;
    `tests/schema-alias-union-decl.test.ts` `:170–177`→`:179–186`, `:177`→`:179–186`,
    `:179`→`:188`; `tests/brace-rooted-union-arm-capture.test.ts` `:143`→`:145`,
    `:175`→`:184`; `tests/schema-alias-rhs-malformed.test.ts` `:199`/`:212`→`:208`,
    `:175`→`:184`; `tests/inline-empty-object-type.test.ts:84` `:175`→`:184`;
    `src/parser/theta-document.ts:818` `:195`→`:204`;
    `src/parser/type-layer-checks.ts:2298/:2343` `:221`→`:230`.
  - `tests/b0421-grammar-cite-sweep-remainder-gate.test.ts` (new) — a
    content-derived sweep gate (SPEC-TRUTH cells lock the re-pin targets by
    content search; RE-PIN cells assert current-line + pre-shift-absent);
    extended with continuation-aware cells for the self-authorized F2 twins.
- Gates: witness `b0421` gate RED at fork (11 RE-PIN cells; 3 SPEC-TRUTH green),
  GREEN after (14/14); targeted suite over the witness + all edited offline
  files + `citation-symbol-form-gate` (b0134) + `b0405` gate green;
  `npm run typecheck` clean; `npm run lint` clean; chain-level live cell
  `tests/live/nested-array-element-sink-descent-live-cell.test.ts` green under
  the global lock (real drive, 1/1). Full `npm test` green modulo documented
  16-lane load noise (real-spawn/e2e/timing files flake, pass isolated).
- Review: 2 rounds. R1 (bug-fix-reviewer, deep) — F1 [fidelity]: the LPA:2342
  cite the doc enumerates is carved out (see Residuals); F2 [correctness]: five
  CONTINUATION-FORM (bare `:N`) stale twins in edited files, outside the doc's
  prefix-form enumeration — fixed under a recorded bounded self-authorization
  (comment-only, exact lines, twin of enumerated instances, +9 signature; blockexpr:44
  `:148–150`→`:158–159`, blockexpr:45/211 `:153–164`→`:164–173`, brace-rooted:42
  `:143`→`:145`, schema-union:32 `:179`→`:188`) with the witness extended to lock
  them. R2 (bug-fix-reviewer-fast, confirmation) — clean; F2 verified, no new twin.
- Verification: SOLID. Witness genuinely reds — reverting three representative
  files to fork bytes turns their RE-PIN cells RED (SPEC-TRUTH stay green),
  restore byte-identical (incl. the 950-CRLF/11-LF mixed-EOL profile of
  fn-param-list-unclosed). Targeted suite green. Typecheck + lint clean. LPA
  untouched (14864 lines). Live: chain-level cell green under the lock.
- Residuals:
  1. `tests/live/live-production-acceptance.test.ts:2342` (`grammar.md:175`→:184)
     — enumerated in §Affected/§Fix but CARVED OUT: this lane's binding rules
     forbid editing the line-pinned LPA (14864 lines). The doc's §Fix 0336-precedent
     same-line refresh is overridden by the lane policy; the cite stays stale.
     Follow-on: a lane permitted to touch the LPA under its pin applies the one-line
     `:175`→`:184` refresh.
  2. Quote-shape drift (`FnParam ::= Ident ":" Type` vs current `Ident (":" Type)?`;
     the reduced `FnDecl` quote at fn-param-list-unclosed:13) — different commit/class,
     deferred to a quote-drift sweep per §Non-goals.
  3. Reference-side (`docs/reference/grammar.md`) cite halves — §Non-goals, separate audit.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: no assertion/verdict change (comment/message-string
  only, suite verdicts byte-identical); the three 0405-swept files and the b0405 gate
  untouched; already-current cites protected (schema-alias-union-decl:29,
  blockexpr:153, brace-rooted:658's :138 half).
