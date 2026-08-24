# Bug 0266 — the *Category 6 line-separator scope* edge case on `placeholder-rendering-b.md:139` justifies its byte-stability posture with the parenthetical "authors cannot introduce them through a regular string literal", which is false at HEAD: both the `\u{2028}` escape form admitted by `lexical.md:26` and a raw U+2028 / U+2029 pasted between the quotes lex and parse with zero diagnostics, so the page's stated rationale rests on an impossibility the language does not enforce

- **Status:** fixed (0.260.0).
- **Sev/Diff estimate:** S4/D1 — S4 because the false clause is a parenthetical
  rationale on a spec page: the rule it decorates is correct and no
  implementation, test, or registry row reads the clause. D1 because the remedy
  is one clause on one line, with no source, registry, or witness-behaviour
  change.
- **Kind:** defect — false statement in normative-page prose. The bullet's rule
  (U+2028 / U+2029 are ordinary characters; MUST NOT split, strip, or promote)
  is correct and is now restated normatively for rule 1 at
  `docs/spec_topics/binder/defaulting-system-note-echo.md:18` (landed by bug
  [0091](./0091-rule1-set-excludes-u2028-u2029-line-breaks.md), 0.257.0). Only
  the concessive clause attached to it is wrong.
- **Affected** (every citation re-derived at HEAD `a6816b96`, 0.258.0):
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:139` — the
    *Category 6 line-separator scope* edge-case bullet; the trailing clause
    "even though authors cannot introduce them through a regular string
    literal (see [Lexical — String literals](../lexical.md))" is the false
    statement.
  - `docs/spec_topics/lexical.md:26` — **String literals**. Lists `\u{XXXX}`
    (Unicode scalar value, 1–6 hex digits) among the escape sequences, with
    well-formedness bounded only by `v ≤ 0x10FFFF` and the surrogate range; and
    scopes the single-line rule to "a literal newline", which the lexer reads
    as U+000A. `\u{2028}` is neither out of range nor a surrogate, and U+2028 is
    not U+000A, so neither clause excludes these two code points.
  - `src/lexer/lexer.ts` — the shipped lexer both probes call through
    `lexTheta`; `src/parser/theta-document.ts` — `parseThetaDocument`.
  - `tests/b0091-rule1-ascii-terminator-closure-gate.test.ts:169–317` — bug
    0091's six-cell oracle. Cell 3 (`:222`) matches the MUST NOT split / strip /
    promote posture against this bullet's wording, and cells 5 (`:266`) and 6
    (`:297`) pin the unwidened ASCII set and the verbatim-preservation
    behaviour. All six are green at HEAD and are a lock on this fix.
- **Observed at:** HEAD `a6816b96`, 0.258.0, `main`, by one offline vitest sweep
  over `lexSrc` / `parseDoc` (`tests/helpers/e2e-s1.ts`) plus quotation of the
  two spec lines.

## Summary

`placeholder-rendering-b.md:139` states the correct rule and then explains it
with a false premise. The clause asserts that a regular theta string literal
cannot carry U+2028 or U+2029; two forms do. `"x\u{2028}y\u{2029}z"` lexes to a
five-scalar string token whose code points are `78,2028,79,2029,7a` with zero
diagnostics, and the same literal with the two characters pasted raw between
the quotes yields the identical token, also with zero diagnostics — in
particular not `theta/parse/literal-newline-in-string`, whose single-line rule
reads U+000A only.

The rule the clause decorates is unaffected: the two code points are ordinary
everywhere, which is the operator's settled disposition for bug 0091 and is now
stated normatively where rule 1 is defined. What is wrong is the reason the page
gives for the posture being safe.

## Reproduction

At HEAD `a6816b96`, 0.258.0. Two quotes and one offline probe; no model.

1. The sentence at HEAD (`placeholder-rendering-b.md:139`, re-locate by the
   marker `**Category 6 line-separator scope.**` if the line drifts):

   > Restating for emphasis: `\u2028` and `\u2029` are ordinary characters for
   > this rule. Implementations MUST NOT split on them, MUST NOT strip them, and
   > MUST NOT promote them into `\n` — the runtime is byte-stable in their
   > presence even though authors cannot introduce them through a regular string
   > literal (see [Lexical — String literals](../lexical.md)).

2. The grammar it cites (`lexical.md:26`) admits both forms: `\u{XXXX}` is a
   listed escape whose only well-formedness bounds are `v ≤ 0x10FFFF` and the
   surrogate exclusion, and the **Single-line only** rule rejects "a literal
   newline", not any Unicode line separator.

3. The lexer probe. One throwaway vitest file (`tests/b0266scratch.test.ts`,
   deleted after the run) calling the shipped front end through
   `tests/helpers/e2e-s1.ts`:

   | Probe | Diagnostics (lex) | Diagnostics (parse) | String-token code points |
   | --- | --- | --- | --- |
   | `let a = "x\u{2028}y\u{2029}z"` (escape form) | none | none | `78,2028,79,2029,7a` |
   | `let a = "x…y…z"` with raw U+2028 / U+2029 | none | none | `78,2028,79,2029,7a` |

   Both admit the code points into a program value. This reproduces bug 0091's
   §Reproduction rows (c) 1 and (c) 2 (`:161–169`) at a later HEAD and extends
   them to U+2029.

4. What the surfaces then do with such a value is what the bullet's rule says
   and what 0091 landed: the two row (d) outcomes hold —
   `classifyModelContent({ message: "\u2028" })` stays `present` and
   `renderEmptyShortCircuit("\u2028")` stays `undefined` (0091 §Fix, `:528–531`)
   — and cell 6 of `tests/b0091-rule1-ascii-terminator-closure-gate.test.ts`
   (`:297`) pins `renderEchoValue` preserving both code points verbatim. So the
   author-authored value reaches the render surfaces intact, which is the case
   the parenthetical says cannot arise.

## Expected behaviour

The bullet's rationale states the truth: authors can introduce U+2028 and
U+2029 through a regular string literal (via the `\u{XXXX}` escape or verbatim),
and the surfaces render them as ordinary characters — the posture bug 0091
ratified and stated normatively at
`docs/spec_topics/binder/defaulting-system-note-echo.md:18`. The rule sentence
preceding the parenthetical is unchanged.

## Actual behaviour / root cause

The clause asserts a lexical impossibility that the grammar does not impose. Two
independent gates would have to reject these code points for it to hold: the
escape-value well-formedness test (bounded by range and surrogates only) and the
single-line-body test (defined against U+000A only). Neither mentions U+2028 or
U+2029, and the probe confirms neither fires.

The clause predates the corpus-wide adjudication. It was written as local
reassurance for one edge case, when category 6's placeholders bind
host- and model-supplied error strings rather than author-authored literals — so
the author-literal path was never the load-bearing intake for this rule, and the
claim about it was never measured. Bug 0091 measured it, found it false, and
left it standing because its ruling authorised one sentence on a different page
(0091 §Fix *Residuals* item 2, `:490–501`), naming the correction as a separate
filing.

## Why it matters

The next editor of this page reads the parenthetical as a fact about the
language and reasons from it. Two failure modes follow. An editor extending the
bullet, or writing a conformance test over it, may treat author-supplied inputs
as out of scope and pin only host-derived intake, leaving the reachable path
untested. An editor asked to reconsider the posture may conclude the rule costs
nothing because the inputs are unreachable — the opposite of the position bug
0091 settled, where the code points are reachable and ordinary by design and the
byte-stability requirement is load-bearing for real values. A rationale that
contradicts the grammar it cites also weakens the page's own citation: a reader
who follows the link to `lexical.md:26` finds the escape listed there.

## Non-goals

- Re-opening bug 0091's disposition 2. U+2028 and U+2029 stay ordinary
  characters everywhere; rule 1's six-ASCII set stays unwidened. This filing
  corrects a sentence's justification, not its posture.
- Changing any behaviour. No source, registry row, diagnostic code, or rendered
  byte moves.
- Restating the corrected fact on any other page. DIAG-2 mirroring is not
  reached: no registry row carries this clause.

## Fix

Correct the clause on `placeholder-rendering-b.md:139` so that it states what
the grammar admits — authors can introduce these code points through a regular
string literal, by `\u{2028}` / `\u{2029}` escape or verbatim, and the surfaces
render them as ordinary characters — keeping the `lexical.md` link, which now
supports the sentence instead of contradicting it. The rule sentence before the
clause is byte-unchanged.

`tests/b0091-rule1-ascii-terminator-closure-gate.test.ts` is a **lock**: all six
cells stay green, cell 3 in particular, which matches this bullet's MUST NOT
split / strip / promote wording. The witness shape for this filing is a small
prose-conformance cell in that file's pattern — read the committed page, locate
the bullet by its `**Category 6 line-separator scope.**` marker, assert the
corrected clause's load-bearing tokens with a proximity window (so the wording
stays the editor's), and assert the negative: the string `cannot introduce` no
longer appears in the bullet. It reds at the pre-fix bytes.

No ordering dependency. Bug 0091 is fixed (0.257.0) and this correction does not
touch its edited page or its witness.

## Provenance

- Spec: `docs/spec_topics/diagnostics/placeholder-rendering-b.md:139` (the false
  clause), `:22–24` (category 6's placeholders — host- and model-supplied
  strings), `:91` (the first-line truncation rule category 8 reuses);
  `docs/spec_topics/lexical.md:26` (String literals — the `\u{XXXX}` escape and
  the single-line rule); `docs/spec_topics/binder/defaulting-system-note-echo.md:18`
  (rule 1, carrying 0091's landed normative sentence).
- Implementation: `src/lexer/lexer.ts` (`lexTheta`),
  `src/parser/theta-document.ts` (`parseThetaDocument`) — both reached through
  `tests/helpers/e2e-s1.ts` `lexSrc` / `parseDoc`.
- Tests: `tests/b0091-rule1-ascii-terminator-closure-gate.test.ts:169–317` (the
  lock; cells 3, 5, 6 at `:222`, `:266`, `:297`).
- Prior reports: bug
  [0091](./0091-rule1-set-excludes-u2028-u2029-line-breaks.md) — §Fix
  constraint 6 (`:373–381`) required a resolution citing this precedent to
  re-check the parenthetical; §Fix (0.257.0) *Residuals* item 2 (`:490–501`)
  records that it was re-checked, found false, deliberately left standing, and
  owed as a separate filing. Working notes for that pass:
  `.pi/tmp/fixes/0091-report-resumed.md`. This filing is that separate filing —
  a new report, not a re-opening of 0091.
- Observations: one offline vitest sweep at HEAD `a6816b96`
  (`tests/b0266scratch.test.ts`, deleted after the run) — `lexSrc` and
  `parseDoc` over both literal forms, reporting diagnostic codes and the
  string-token code point sequence. Every `path:line` above re-derived at this
  HEAD.

## Fix (0.260.0)

- **Re-derivation at the fix HEAD `204ea0c2` (0.259.0).** Every citation above
  was re-checked; all still resolve. `placeholder-rendering-b.md` line 139 still
  carries the *Category 6 line-separator scope* bullet with the false clause,
  `lexical.md` line 26 still carries the **String literals** paragraph with the
  `\u{XXXX}` escape and the "a literal newline" single-line rule, and
  `defaulting-system-note-echo.md` line 18 still carries bug 0091's landed
  disposition-2 sentence. Bug 0265's merge (0.259.0) grew
  `docs/reference/errors-and-results.md` only — disjoint from both pages and
  from the lock.
- **What shipped**
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — line 139's
    trailing clause corrected: "even though authors cannot introduce them
    through a regular string literal" is replaced by the admitted reality —
    the byte stability is load-bearing rather than vacuous, authors *can*
    introduce these code points through a regular string literal (as a
    `\u{2028}` / `\u{2029}` escape or pasted verbatim between the quotes), and
    the surfaces render them as ordinary characters, mirroring bug 0091's
    landed wording at `defaulting-system-note-echo.md` line 18. The
    `../lexical.md` link is kept and now supports the sentence. The rule
    sentence preceding the clause (ordinary characters; MUST NOT split / strip
    / promote) is byte-unchanged. Page line count 142 → 142; the bullet is
    still line 139, so no line-cite drift.
- **Witness** — new sibling file
  `tests/b0266-category6-string-literal-rationale-gate.test.ts`, two cells in
  the pattern of the 0091 oracle (doc-oracle cell with semantic regexes and
  proximity windows plus a named-precondition throw; one behavioural cell
  through real `src/` imports):
  1. locates the bullet by the content marker `**Category 6 line-separator
     scope.**` with an exactly-one-match precondition, asserts the positive
     ("can introduce" within 300 characters of "string literal", plus the
     render-as-ordinary claim and the retained `../lexical.md` link), asserts
     the negative (`cannot introduce` absent), and re-pins the unchanged rule
     sentence's three MUST NOTs.
  2. lexes and parses `let a = "x\u{2028}y\u{2029}z"` and the raw-codepoint
     form through `lexSrc` / `parseDoc` (`tests/helpers/e2e-s1.ts`, wrapping
     the shipped `lexTheta` / `parseThetaDocument`): zero diagnostics on both
     passes for both forms, and the decoded string token's code points are
     `78,2028,79,2029,7a`. This keeps cell 1's prose claim non-vacuous.

  Both directions proven: with the page restored to its HEAD bytes (blob
  `382368555094b57100781a8bff90caa2205e0cbc`, written back byte-exact and
  re-verified as `a9ead61b9d017e260a4096c0ce90c031f5c98256`) cell 1 reds on the
  `cannot introduce` guard; cell 2 stays green either way, as it measures the
  lexer and no source moved.
- **LOCK discharged** — `tests/b0091-rule1-ascii-terminator-closure-gate.test.ts`
  is byte-unchanged: blob `d6e495bb1c3cd2e713422d8d3af0af106c543df5`, identical
  to `HEAD:tests/b0091-rule1-ascii-terminator-closure-gate.test.ts`. All six
  cells green, cell 3 (the MUST NOT split / strip / promote match against this
  bullet's wording) and cell 5 (the unwidened six-ASCII enumeration) included.
  The new witness is a strictly-additive sibling file, so no lock byte was at
  risk.
- **Non-goals honoured** — bug 0091's disposition 2 is not re-opened: U+2028 and
  U+2029 stay ordinary characters everywhere and rule 1's six-ASCII set is
  unwidened. No source, registry row, diagnostic code, or rendered byte moved,
  and the corrected fact is restated on no other page (DIAG-2 mirroring is not
  reached: no registry row carries this clause).
- **Verification** — full offline gate `npm test`: 437 files, 9169 tests, all
  green, including the 0091 oracle, the new witness, and
  `tests/citation-symbol-form-gate.test.ts` (residual pin 415 not raised). **No
  live run is owed**: nothing under `src/` was touched, so no live-exercised
  surface changed. The nearest covering cells are the 0091 oracle's cell 6
  (`renderEchoValue` preserving U+2028 verbatim, a real `src/render/argument-echo`
  import) and this filing's cell 2 (real `src/lexer/lexer.ts` /
  `src/parser/theta-document.ts` imports through `tests/helpers/e2e-s1.ts`).
- **Files** — `docs/spec_topics/diagnostics/placeholder-rendering-b.md` (1 line
  changed), `tests/b0266-category6-string-literal-rationale-gate.test.ts` (new),
  this report.
