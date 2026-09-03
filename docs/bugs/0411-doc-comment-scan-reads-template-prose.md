# Bug 0411 — `scanDocComments` line-scans the body with no `@`...`` template awareness, so a prose line starting `///` inside a query template refuses the theta with `theta/parse/doc-comment-misplaced`, and a template ending in a `///`-led closing line silently injects its prose into the following schema's lowered `description:` — merging with (and prepending to) the schema's real `///` run

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — template prose silently lowers into wire-visible schema `description:` bytes (post-0358) with zero diagnostics, plus a valid-input refusal; fix is a template-region exclusion in one scan with the token stream already in scope.
- **Kind:** defect — `docs/spec_topics/lexical.md:24` pins "Comments inside
  the *text* of a `@`...`` query template are not comments — they are part of
  the rendered prompt"; the doc-comment recovery scan treats them as comments
  anyway.
- **Related:**
  - 0357 (fixed 0.356.0) — same function, different axis: its fix rebuilt
    anchor CLASSIFICATION (structural `classifyDocAnchor` over AST ranges),
    while run FORMATION remains the raw line scan at
    `theta-document.ts:1761-1783` with no template guard. This report is
    about run formation reading lines that are not comments at all.
  - 0358 (fixed 0.364.0) — made `///` descriptions lower into `$defs`
    fragments; that fix is what gives the injection arm (b) a wire-visible
    consequence.
- **Affected** (verified at c2c25d81, v0.398.0):
  - `src/parser/theta-document.ts:1751-1812` — `scanDocComments` runs
    `docLine = /^[ \t]*\/\/\/(?!\/)(.*)$/` (`:1764`) over EVERY line of
    `split.bodyText` (`lines = bodyText.split("\n")`), with no exclusion of
    lines inside a `@`...`` template body. The anchor-line scan (`:1793-1800`)
    likewise skips `//`-leading lines wherever they occur, template prose
    included.
  - `src/parser/theta-document.ts:1033` — the call site; `body.statements`
    (whose `QueryExpr` ranges delimit every template) and the lexer's token
    stream (whose backtick puncts pair, see `lexer.ts` template-prose state
    machine) are both in scope, so the region information exists and is
    unconsulted.
  - `src/parser/theta-document.ts:1855-1858` — `attachDocDescriptions` keys
    `byLine.set(anchorLine, description)`, so a prose-formed run whose
    anchor-line scan lands on a `schema` head line lowers prose into that
    schema's `description`.
  - Contrast seams that DO exempt template prose: the lexer's scan
    (`src/lexer/lexer.ts` `inTemplateProse` — `//`, `/*`, `\` are ordinary
    prose characters) and `contextualDiagnostics`' `inTemplateBody` toggle.
    The doc-comment scan is the one line-oriented pass without the guard.
- **Observed at:** 0.398.0 (c2c25d81), offline — `parseDoc` over the shipped
  `parseThetaDocument` (`tests/helpers/e2e-s1.ts`).

## Summary

The lexer emits no comment tokens, so `///` runs are recovered by a raw line
scan over the body text. That scan does not know where query templates are.
Two consequences, one root cause:

(a) **Refusal of valid prose.** Any template whose rendered text contains a
line beginning with optional space/tab then `///` — a Markdown-ish divider, a
quoted code snippet, instructions about doc comments — is read as a doc
comment run, its anchor resolves to "other" (a line inside a `let` statement),
and `checkDocCommentPlacement` refuses the theta with
`theta/parse/doc-comment-misplaced`. Per lexical.md the line is not a comment;
the theta is valid and should render the line into the prompt.

(b) **Silent description injection.** When the closing backtick sits at the
end of a `///`-led prose line, the very next source line can be a `schema`
head. The prose-formed run's anchor then classifies `schema` — placement
passes — and `attachDocDescriptions` lowers the template prose into the
schema's `description:`. If the schema also has its own legitimate `///` run,
the forward scan merges both into ONE run (nothing separates them), so the
lowered description becomes template prose + `\n` + real description. Zero
diagnostics in both shapes.

## Reproduction

Offline, `parseDoc` (shipped `parseThetaDocument`, inert channel).

(a) Refusal:

```
---
mode: prompt
---
let q = @`
Guidelines:
/// keep it short
Done.
`
q
```

Observed: `theta/parse/doc-comment-misplaced` (error), range line 6 col 1-18,
message "'///' doc comment is not legal above this production" → error-severity
load diagnostic → `parseDiscoveredTheta` refuses registration. Expected: clean
load; line 6 is rendered prompt text.

(b) Injection:

```
---
mode: prompt
---
let q = @`
/// injected description`
schema S {
  a: integer,
}
q
```

Observed: diagnostics `[]`; `S.description === "injected description\`"`
(backtick included — the capture is the raw rest-of-line). Expected: `S` has
no description; the template renders `/// injected description` as prose.

(c) Merge with a real run — insert `/// real description` between the closing
backtick line and `schema S {`:

Observed: diagnostics `[]`;
`S.description === "injected description\`\nreal description"`. Expected:
`"real description"` alone.

## Expected behaviour

- `docs/spec_topics/lexical.md:24`: "Comments inside the *text* of a
  `@`...`` query template are not comments — they are part of the rendered
  prompt."
- `docs/spec_topics/descriptions.md` §Rules: a description is formed from
  "Consecutive `///` lines" — doc-comment lines, a lexical category that per
  the sentence above cannot occur inside template text.
- `query-forms.md` (worked example / QRY-7): the rendered text is the
  template body verbatim through newline-trim + dedent; no line of it is
  subject to comment extraction.

## Actual behaviour / root cause

`scanDocComments` is a pure line-regex pass over `split.bodyText`
(`theta-document.ts:1761-1783`): any line matching `^[ \t]*///(?!/)` anywhere
in the file joins a run. 0357's 0.356.0 fix rebuilt anchor classification
(`classifyDocAnchor` over AST ranges) but left run formation as this raw
line scan — the template-blindness sits strictly upstream of the fixed axis. The template-region knowledge that every other scan
consults (lexer prose state machine; `contextualDiagnostics`' backtick
toggle; the parser's own template slicing between backtick tokens) is absent
here. Run formation, placement checking (`descriptions.ts:153`), and
description attachment (`theta-document.ts:1855-1858`) all then operate on
lines that are prompt prose.

Note the asymmetry that proves the seam: the same `///` line IS correctly
rendered into the prompt by the template pipeline (the parser slices the raw
body between backtick tokens), so in shape (b) the bytes are BOTH rendered to
the model as prose AND lowered into the schema description.

## Why it matters

- (a) is a valid-input load refusal with a lying diagnostic: the message
  asserts an illegal doc comment on a line that is not a comment; authors
  writing prompts about doc comments (a theta that explains theta) cannot
  load. In a `.thetalib`-adjacent shape the refusal kills every importer.
- (b)/(c) are silent wrong wire bytes (impact class 1 post-0358): template
  prose reaches the lowered `$defs` `description:` consumed by the model on
  params schemas, binder envelopes, and typed-query respond schemas — and can
  displace/prepend the author's real description with zero diagnostics.

## Non-goals

- Rendering of `//` / `/*` inside template prose (already correct — the lexer
  treats prose verbatim).
- Anchor classification for legitimate runs (0357's fixed axis).
- The `////` four-slash rule and `//`-terminates-run formation (conformant).
- Note-render line discipline (0382/0384/0400 family — different surface).

## Fix

Options:

1. Build a template-line exclusion set from the lexer's token stream at the
   `scanDocComments` call site (`:1033`): walk `lex.tokens` toggling on
   backtick puncts (they always pair; `${…}` interpolations sit between), and
   mark every line whose content is inside a template body; skip those lines
   in both the `docLine` run scan and the anchor-line scan. Cheapest; the
   token stream is already in scope. Caveat: lines PARTIALLY inside a
   template (code before the opening backtick, or after the closing backtick)
   must only be excluded for the in-template span — but `docLine` anchors at
   `^`, so it suffices to exclude a line iff its column-1 position lies
   inside a template region (a `///` at physical line start inside prose).
2. Derive exclusion ranges from the parsed AST (`QueryExpr` ranges in
   `body.statements`). Equivalent result; slightly more shape-coupling
   (nested/multi-template statements) but no token walk.

Either way the fix must keep: (a-line) `/// …` prose rendering into the
prompt unchanged; run formation across a template boundary must NOT merge
(a legit run immediately after a closing backtick line still forms alone —
reproduction (c) expected value); and 0357's field/variant anchors intact.
Recommendation: option 1.

## Provenance

- Hunt area: lexer-input-edges.
- Probes: throwaway `tests/scratch-lexinput.test.ts` (deleted), cases D1-D3;
  observed outputs quoted verbatim above.
- Spec read: lexical.md §Comments, descriptions.md §Rules,
  query/query-forms.md §Dedent and newline-trim; implementation read:
  `scanDocComments` / `attachDocDescriptions` / `classifyDocAnchor`
  (theta-document.ts), `joinDocComment` / `checkDocCommentPlacement`
  (descriptions.ts), lexer template-prose state machine (lexer.ts).
