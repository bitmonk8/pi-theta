# Bug 0389 — `docs/spec_topics/grammar.md`'s `FnDecl` production cites the undefined nonterminal `SubagentMod` and omits `WithClause?`, so the file `functions.md` names as the normative owner of the `with { … }` surface form cannot derive it

- **Status:** open.
- **Sev/Diff estimate:** S5/D1 — doc-layer only, no runtime bytes involved;
  but the inconsistency is normative-on-normative: FN-5x/FN-7 semantics are
  specced against a surface form whose designated normative grammar cannot
  produce it. D1: two lines in one file (add the `WithClause?` slot and the
  `SubagentMod` / `WithClause` / `WithField` productions, mirroring
  `docs/reference/grammar.md:311-313`).
- **Kind:** spec defect (spec-internal contradiction; doc/registry
  inconsistency class — reported because it is crisp and delegation-backed).
- **Related:**
  - [0357](./0357-doc-comment-field-variant-anchors-refused.md)
    — fixed (0.356.0). Its fix added exactly `SubagentMod?` to the spec-topics
    `FnDecl` under a parent bound of "the one authorized line", and its §Fix
    Residual 1 names the remainder verbatim: "the reference production
    `docs/reference/grammar.md:311` also carries `WithClause?`, and
    `SubagentMod` has no in-file definition… the `WithClause?` / `SubagentMod`
    definition drift is named follow-up, not this fix's subject." No follow-up
    was filed; this report is it.
- **Affected** (verified at d63c5148, v0.382.0):
  - `docs/spec_topics/grammar.md:138` — `FnDecl ::= SubagentMod? "fn" Ident
    "(" FnParams? ")" (":" ReturnType)? FnBody`. `SubagentMod` is defined
    nowhere in `docs/spec_topics/` (`rg SubagentMod docs/spec_topics/` → this
    line only); no `WithClause` appears anywhere in the file.
  - `docs/spec_topics/functions.md:50` — "The surface form (the `subagent`
    modifier and the optional `with { … }` clause) is given normatively by
    [Grammar Appendix — `fn` declarations](./grammar.md#fn-declarations); the
    example below is illustrative only."
  - `docs/reference/grammar.md:311-313` — the reference grammar carries
    `WithClause?` in `FnDecl` plus the `SubagentMod` / `WithClause` /
    `WithField` definitions the spec-topics file lacks.
  - `src/parser/theta-document.ts:3106-3109` — the implementation parses the
    `with` clause ("`WithClause?` — `with` is a contextual keyword").
  - `src/parser/theta-document.ts:3097-3099` — the parser comment cites
    grammar.md §"`fn` declarations" for the rule that `(":" ReturnType)?` and
    `WithClause?` are "consecutive optional slots"; that statement exists only
    in `docs/reference/grammar.md:335` — the spec-topics file's sole
    "consecutive" hit is the unrelated `DocComment` prose (its `:187`).
  - `src/parser/theta-document.ts:3109` — the comment cites grammar.md
    §"Contextual keywords"; that section exists only in
    `docs/reference/grammar.md:128` (`rg "Contextual keyword"
    docs/spec_topics/grammar.md` → zero hits). Both comments name the section
    spelling of the file that lacks them — two further divergence sites the
    mirror fix must cover so the source comments resolve against spec-topics
    prose.
- **Observed at:** v0.382.0 (d63c5148), by reading; no probe needed (the
  divergence is between two committed normative texts and the shipped parser).

## Summary

`subagent fn f() with { model: "…" } { … }` is legal, implemented source
(theta 1.2; parsed at theta-document.ts:3106, semantics normative at
functions.md FN-7). functions.md:50 delegates the surface form "normatively"
to the spec-topics Grammar Appendix `fn`-declarations production — which has
no `WithClause?` slot, so the delegated-to grammar derives no `with`-carrying
declaration. The same production consumes `SubagentMod?`, a nonterminal the
file never defines, so the production is not even self-contained for the
modifier half it does carry. The reference grammar and the implementation
agree with each other; the spec-topics grammar disagrees with both.

## Reproduction

- `rg -n "SubagentMod|WithClause" docs/spec_topics/grammar.md` → one hit,
  line 138 (the use); no definition, no `WithClause`.
- `rg -n "SubagentMod|WithClause" docs/reference/grammar.md` → `:311` (both
  slots in `FnDecl`), `:312` (`SubagentMod ::= "subagent"`), `:313`
  (`WithClause ::= "with" "{" WithField … "}"`).
- functions.md:50 quoted above names grammar.md#fn-declarations the normative
  owner of both the modifier and the `with` clause.

## Expected behaviour

A production designated the normative surface-form owner derives every legal
spelling of the form it owns, and every nonterminal a normative grammar cites
is defined. The reference grammar (`docs/reference/grammar.md:311-313`) is the
shape the spec-topics production must mirror (0357's fix record already
reconciled the `SubagentMod?` half against it).

## Actual behaviour / root cause

Bug 0357's parent authorized a one-line reconciliation (`SubagentMod?` only);
the residual halves — the `WithClause?` slot and the three definitions — were
deferred and never filed. The drift predates 0357 (the theta 1.2 `subagent
fn` grammar landed in the reference appendix and the parser without the
spec-topics mirror).

## Why it matters

The spec-topics pages are the normative layer (`docs/reference/` mirrors
them). Anyone implementing or checking FN-7 from the normative chain
(functions.md → grammar.md#fn-declarations) concludes the `with` clause has no
defined surface form — while the shipped parser accepts it and FN-7 specifies
its semantics in detail. A grammar citing an undefined nonterminal also breaks
any mechanical derivation over the spec-topics grammar alone.

## Non-goals

- The `with`-clause SEMANTICS (FN-7) — complete and unaffected.
- The reference grammar and the parser — both already agree.
- Any other spec-topics/reference grammar delta (none found in the
  `fn`-declarations section beyond these two).

## Fix

Mirror `docs/reference/grammar.md:311-313` into
`docs/spec_topics/grammar.md#fn-declarations`: add `WithClause?` between
`(":" ReturnType)?` and `FnBody`, and add the `SubagentMod` / `WithClause` /
`WithField` productions, plus the `ReturnType`-termination note
(`docs/reference/grammar.md:335`) and the §Contextual keywords statement
(`:128`) that two parser comments (`theta-document.ts:3097-3099`, `:3109`)
cite against this file. Docs-only; the b0357 doc-consistency
gates and the citation-symbol-form gate are the regression net.

## Provenance

Fix-residuals sweep over bugs 0351-0385: 0357 §Fix Residual 1 named this
drift unprospected. Verified at d63c5148 by rg over both grammar files, the
functions.md delegation sentence, and theta-document.ts:3106-3109. Dup check:
README index carries no grammar-appendix drift report for `fn` declarations;
0357 is fixed and bounded itself away from this remainder.
