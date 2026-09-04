# Bug 0420 — A column-1 `///` line inside a multi-line `${…}` interpolation loads cleanly and the line silently vanishes from the expression, where `lexical.md:24` pins that comments inside an interpolation "behave exactly as in any other expression position" — the byte-identical line in a multi-line parenthesised expression draws `theta/parse/doc-comment-misplaced` and refuses the load

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3: silent permissive acceptance of a
  spec-refused input on a narrow but legal input class, with an
  author-intent hazard (one brace deeper than template prose — where the
  same `///` line IS rendered into the prompt — the line is silently
  swallowed as a comment instead of drawing the prescribed error; zero
  diagnostics either way); never wrong wire bytes (the interpolated value
  itself is computed correctly). D2: the 0411 exclusion predicate must
  learn interpolation sub-regions inside template spans (a second toggle
  over the already-walked token stream, with `${`/`}` pairing), plus
  both-directions witnesses; the shipped predicate is deliberately
  line-granular so the change is a refinement, not a revert.
- **Kind:** defect — implementation diverges from a stated rule
  (`docs/spec_topics/lexical.md:24`, second sentence). Coordinator-ratified:
  the classification rests on the position asymmetry against lexical.md:24's
  normative rule — the byte-identical `///` line refuses the load in a
  parenthesised expression (probe P2) while loading cleanly one `${` deeper
  (probe P1). The divergence was INTRODUCED by bug 0411's fix (0.411.0):
  pre-fix the input was refused (via the template-blind scan), post-fix it
  loads cleanly. The Kind ruling classifies the divergence; the remedy
  choice stays open in §Fix.
- **Related:**
  - 0411 (fixed 0.411.0) — the parent fix; its §Fix Residuals item 1 names
    this exact remainder and, honestly quoted, calls the behaviour
    prescribed: "A column-1 `///` line inside a MULTI-LINE `${…}`
    interpolation no longer draws `theta/parse/doc-comment-misplaced`
    (option 1 excludes at line granularity across the whole backtick span,
    per the settled §Fix). This is the §Fix-prescribed mechanism, never
    wrong wire bytes … Follow-up material for the operator (a lexical.md:24
    scope clarification or a narrow successor report), NOT a blocker." The
    residual leaves the adjudication open and names both remedies; this
    report is the successor. The Kind = defect ruling (coordinator-ratified,
    header) settles the classification; §Fix keeps both named remedies as
    options.
  - 0357 (fixed 0.356.0) — anchor classification for legitimate runs;
    untouched by this report.
  - GOV-15 relevance: the 0411 fix record's registry note justified the
    behaviour flip as "`theta/parse/doc-comment-misplaced` simply stops
    firing on non-comment input" — for THIS sub-class the line IS a comment
    (expression position, lexical.md:24 sentence 2), so the flip's own
    stated justification does not cover it.
- **Affected** (verified at `04579e12`, v0.415.0):
  - `src/parser/theta-document.ts:1073–1092` — the 0411 template-span walk
    and `isTemplateLine` (`:1086–1092`): a line is excluded iff its
    column-1 position lies strictly inside a backtick pair span, with no
    `${…}` sub-region awareness; the call-site comment (`:1057–1071`)
    reasons only about prose and partial lines, never interpolations.
  - `src/parser/theta-document.ts:1841–1842` — `matchDocLine` returns null
    for every excluded line (run formation), and `:1878` — the anchor-line
    forward scan skips excluded lines.
  - `docs/spec_topics/lexical.md:24` — §Comments: "Comments inside the
    *text* of a `@`...`` query template are not comments — they are part of
    the rendered prompt. **Comments inside a `${...}` interpolation behave
    exactly as in any other expression position.**"
  - `docs/spec_topics/grammar.md:204` — "`///` above any other production —
    `let`, `import`, `export`, expression statements, control-flow
    statements — is `theta/parse/doc-comment-misplaced`."
- **Observed at:** v0.415.0 (`04579e12`), offline — `parseDoc` over the
  shipped `parseThetaDocument` (`tests/helpers/e2e-s1.ts`); scratch probe
  `tests/scratch-fr5-probes.test.ts` (deleted), cells P1/P1b/P2/P2b.

## Summary

Bug 0411 fixed the doc-comment scan's template blindness by excluding every
body line whose column-1 position sits strictly inside a backtick span. The
exclusion is deliberately line-granular — correct for template PROSE (the
spec's first sentence) but over-broad for `${…}` interpolation interiors,
which the SAME spec bullet's second sentence pins to expression-position
comment semantics. In expression position a whole-line `///` run above a
non-anchor line is `doc-comment-misplaced` (grammar.md:204; probe P2
confirms the shipped behaviour for a parenthesised multi-line expression).
Inside a multi-line interpolation the identical line is excluded from the
scan, forms no run, draws nothing, and — because the lexer skips comments
in code mode — contributes nothing to the interpolation: the document loads
cleanly and the line vanishes. The two halves of lexical.md:24 have swapped
which one the implementation violates: pre-0411 the prose sentence was
violated (template text scanned as comments); post-0411 the interpolation
sentence is.

## Reproduction

Offline, `parseDoc` (shipped `parseThetaDocument`). Observed verbatim:

P1 — interpolation position (the divergence):

```
---
mode: prompt
---
let q = @`before ${
/// weird
1 + 2
} after`
q
```

Observed: diagnostics `[]` — clean load; the `///` line is lexed away as a
comment (interpolation evaluates `1 + 2`). Expected per lexical.md:24 +
grammar.md:204: `theta/parse/doc-comment-misplaced`, load refused.

P2 — the "any other expression position" baseline, byte-identical comment
line inside a multi-line parenthesised expression:

```
---
mode: prompt
---
let x = (1 +
/// weird
2)
let q = @`v ${x}`
q
```

Observed: `theta/parse/doc-comment-misplaced` (error) at 5:1, "'///' doc
comment is not legal above this production" — load refused.

Controls: P1b (same interpolation with the `///` line removed) loads
cleanly — the multi-line interpolation shape itself is legal, so the input
class is reachable; P2b (`//` regular comment in P1's position) loads
cleanly — conformant in both readings, the divergence is `///`-specific.

## Expected behaviour

- `lexical.md:24` sentence 2: "Comments inside a `${...}` interpolation
  behave exactly as in any other expression position." P2 exhibits the
  expression-position behaviour: a column-1 `///` run above a
  mid-statement line draws `doc-comment-misplaced` and refuses the load.
- `grammar.md:204`: `///` above any production outside the five-anchor set
  is `doc-comment-misplaced`. The `///` in P1 sits above an expression
  continuation line inside a `let` statement — no anchor.
- Therefore P1 must draw exactly what P2 draws.

## Actual behaviour / root cause

`isTemplateLine` (`theta-document.ts:1086–1092`) tests only "column-1
strictly inside a backtick pair"; interpolation sub-regions are inside the
pair, so their lines are excluded wholesale from both run formation
(`:1841–1842`) and the anchor scan (`:1878`). The 0411 §Fix's option-1
wording justified line granularity for the prose case ("a `///` at physical
line start inside prose") and never adjudicated interpolation interiors;
the shipped call-site comment (`:1057–1071`) likewise reasons about
prose/partial lines only. Which artefact is wrong: the spec sentence
pre-dates 0411, is unconditional, and is what makes `//`/`/*`/`\`
handling coherent across the template boundary; amending it to carve out
"except `///` at column 1 inside a multi-line interpolation" would ratify
an implementation accident with a bizarre seam. That position asymmetry —
the byte-identical line refusing in a parenthesised expression — is the
basis of the ratified Kind = defect classification; the remedy (predicate
refinement vs spec clarification) is weighed in §Fix.

## Why it matters

- A spec-refused program loads and runs with zero diagnostics — the
  silent-permissive-acceptance class, introduced by a fix whose own registry
  note claims the code "stops firing on non-comment input" (this input IS a
  comment).
- The author hazard is real and asymmetric: in template prose a `///` line
  is RENDERED into the prompt (0411's headline fix); one `${` deeper the
  visually identical line silently disappears. An author writing prompt
  text who strays a line into a multi-line interpolation loses content with
  no signal — pre-0411 they at least got a loud (if mis-worded) refusal.
- A conformance oracle reading lexical.md:24 sentence 2 and testing the
  interpolation position against the expression-position baseline goes red
  against shipped behaviour.

## Non-goals

- Template-prose `///` rendering (0411's fixed axis — correct, and the
  refinement must keep P1-prose-shape rendering byte-identical; the
  committed b0411 witness and live cell pin it).
- `//` and `/*` inside interpolations (conformant — P2b) and single-line
  interpolations (a `///` there has code before it on the line, so the
  column-anchored `docLine` regex never matches; no divergence exists).
- Anchor classification (0357) and the `////` four-slash rule.

## Fix

Both remedies named by 0411 §Fix Residuals item 1 remain options.

Option 1 — predicate refinement (implementation). Refine the exclusion
predicate to "column-1 inside template PROSE", not
"inside the backtick span": during the existing token walk
(`theta-document.ts:1073–1083`), additionally track `${` / `}` interpolation
puncts between an open backtick and its close (the lexer emits the
interpolation delimiters as tokens; nested templates inside interpolations
already refuse upstream per the call-site comment, so a depth counter over
`${`/`}` pairs suffices), recording interpolation sub-spans; `isTemplateLine`
then excludes a line iff its column-1 position is inside a template span
AND NOT inside an interpolation sub-span. Constraints: (a) P1 must draw
`doc-comment-misplaced` exactly as P2 does (same code, no new registry row —
the code's registered trigger already covers it, and pre-0411 behaviour for
this input class is restored, so no GOV-15 loads-cleanly input is touched);
(b) the b0411 witness (prose arms a/b/c) and its live acceptance cell stay
green byte-identically; (c) a `///` line inside template PROSE that merely
CONTAINS `${…}` later on the line stays excluded (prose governs column 1).
Variant: anchor the sub-span walk on the parsed `QueryExpr`
interpolation ranges instead of tokens — equivalent, more shape-coupling
(0411 §Fix option 2's tradeoff, one level down).

Option 2 — lexical.md:24 scope clarification (spec). Amend the second
sentence to carve out a column-1 `///` line inside a multi-line `${…}`
interpolation, ratifying the shipped line-granular exclusion — the remedy
0411's residual names first. Cost: ratifies an implementation accident and
introduces a seam in comment semantics across the interpolation boundary
(`//`/`/*` keep expression semantics, `///` does not), and the author
hazard in §Why it matters stays unsignalled.

Recommendation: option 1's token walk extension — it follows the ratified
Kind = defect reading (the implementation is the divergent artefact).

## Provenance

fix-residuals-5 sweep over the 0402–0418 fix round: developed from 0411
§Fix Residuals item 1 (named follow-up with the adjudication left open).
Probes P1/P1b/P2/P2b run at `04579e12` in throwaway
`tests/scratch-fr5-probes.test.ts` (deleted); outputs quoted verbatim
above. Spec read: lexical.md §Comments, grammar.md §`///` placement,
descriptions.md §Rules. Implementation read: the 0411 span walk /
`isTemplateLine` / `matchDocLine` / anchor scan (theta-document.ts). Dup
check: README index — 0357/0358/0411 are the doc-comment family, none
covers the interpolation position; no other report touches it.
