# Bug 0350 — the `theta/parse/mixed-plus-operands` registry row's *Hint* column ("Convert explicitly or interpolate inside a string") and a QRY-18-page cross-reference quoting it both teach the inert `${…}`-in-regular-string idiom, contradicting lexical.md:26 ("No interpolation — the sequence `${` inside a regular string is plain text") — the same misleading phrasing bug 0309 reworded at expressions.md:232, left standing at two sites 0309's `${`-in-regular-string census could not see because neither is a `${` occurrence

- **Status:** open.
- **Sev/Diff estimate:** S4/D1 — S4 because no runtime behaviour is wrong
  (the runtime follows lexical.md:26: `${` in a regular string is plain text,
  live-verified under bug 0309), and the defect is spec-prose only: an author
  who follows the `+`-diagnostic's rendered *Hint* to "interpolate inside a
  string" writes an inert `${…}` into a regular quoted string that emits the
  literal bytes with no diagnostic. D1 because the fix is two prose rewords in
  two files, each mirroring the reword 0309 already landed at expressions.md:232.
- **Kind:** spec defect — an advisory-surface remedy and a spec cross-reference
  both contradict the normative rule at
  `docs/spec_topics/lexical.md:26` (`#string-literals`).
- **Related:**
  - `./0309-expressions-example-interpolates-inside-regular-string.md` — fixed
    (0.341.0); reworded the same "interpolate inside a string" phrasing at
    `expressions.md:232` and enumerated `code-registry-parse.md:40` as its
    residual R1 (out of 0309's parent-scoped three-site enumeration). This
    filing owns that residual and the second same-phrase site 0309's census did
    not reach. Cite, do not re-edit 0309 (era-pinned).
  - `docs/spec_topics/lexical.md#string-literals` (line 26) — the normative
    rule the two sites contradict ("**No interpolation** — the sequence `${`
    inside a regular string is plain text. Multi-line text and interpolation
    belong inside `@`...`` query templates").
  - QRY-18 — `docs/spec_topics/query/query-escapes-stringification.md#qry-18`
    — the blessed interpolation surface (`${…}` inside a `@`...`` query
    template) the two sites should name instead of "a string".
- **Affected** (verified at HEAD, 9b25faa3, v0.341.0):
  - `docs/spec_topics/diagnostics/code-registry-parse.md:40` — the
    `theta/parse/mixed-plus-operands` row. *Hint* column reads
    `Convert explicitly or interpolate inside a string.` The *Message* column
    is `'+' has mixed operand types: <left> and <right>` and is clean.
  - `docs/spec_topics/query/query-escapes-stringification.md:37` — a Notes
    bullet quoting the `+`-operator advice as `"interpolate inside a string"`
    in a parenthetical attributed to
    `docs/spec_topics/expressions.md`; that attribution is stale (expressions.md
    no longer carries the phrase) and reproduces the misleading idiom.
- **Observed at:** 0.341.0 (9b25faa3). Textual, deterministic: `rg` over the
  spec corpus; no runtime.

## Summary

Bug 0309 established the contract: regular (quoted) strings do not interpolate
`${…}` (lexical.md:26; live-verified), and prose that reads as if they do must
name the `@`...`` query template instead. 0309 fixed three enumerated sites and
reworded the `+`-operator note at `expressions.md:232` from "interpolate inside
a string" to "interpolate inside a `@`...`` query template (regular strings do
not interpolate…)".

Two sites carrying the same phrasing survive, because neither is a `${`
occurrence and so neither fell inside 0309's `${`-in-regular-string census:

1. The `theta/parse/mixed-plus-operands` registry *Hint* — the rendered remedy
   an author sees when the `+` type-mismatch diagnostic fires — still says
   "interpolate inside a string".
2. The QRY-18 page's Notes bullet still quotes the pre-0309 `+`-advice phrasing
   as `"interpolate inside a string"`, attributing it to expressions.md, which
   no longer says it.

Both teach the broken idiom; the registry *Hint* is the more consequential
because it is the diagnostic's own rendered remedy.

## Reproduction

Textual census at HEAD (9b25faa3), verbatim:

```
$ rg -n "interpolate inside a string" docs/spec_topics
docs/spec_topics/diagnostics/code-registry-parse.md:40:| `theta/parse/mixed-plus-operands` | E | type | … | [Expressions — `+` operator](../expressions.md) | Convert explicitly or interpolate inside a string. | `'+' has mixed operand types: <left> and <right>` |
docs/spec_topics/query/query-escapes-stringification.md:37:- Interpolation is the spec's blessed escape hatch for value-to-text conversion: the `+`-operator advice in [Expressions](../expressions.md) ("interpolate inside a string" in place of mixed-type `+`) relies on this rule existing.
```

The already-reworded home-page prose for the same diagnostic, for contrast:

```
$ rg -n "Mixed-type operands are" docs/spec_topics/expressions.md
232:… Mixed-type operands are `theta/parse/mixed-plus-operands` — write an explicit conversion or interpolate inside a `@`...`` query template (regular strings do not interpolate; see [Lexical Structure](./lexical.md#string-literals)). …
```

The normative rule the two sites contradict:

```
$ rg -n "No interpolation" docs/spec_topics/lexical.md
26:… **No interpolation** — the sequence `${` inside a regular string is plain text. Multi-line text and interpolation belong inside `@`...`` query templates …
```

Registry-page sweep (in-scope enumeration is complete): the only
`code-registry-parse.md` / sibling `code-registry-*.md` hit of the phrase is
line 40. Other `interpolat…` occurrences on `code-registry-parse.md`
(lines 53, 85, 128–131: `default-not-literal`, `interpolated-result`, the four
`system-interp-*` rows) name `${…}` interpolation in its legal positions
(`params:` residue, query-template stringification, `system:` bare-path
interpolation) and do not teach regular-string interpolation.

## Expected behaviour

Advisory diagnostic *Hint* text and spec cross-references name the interpolation
surface lexical.md:26 blesses — the `@`...`` query template — and do not phrase
the remedy as "interpolate inside a string", which reads as regular-string
interpolation. An author following the `+`-diagnostic's remedy reaches a
spec-legal-AND-working idiom.

## Actual behaviour / root cause

`theta/parse/mixed-plus-operands` fires when `+` mixes a numeric operand and a
`string` (e.g. `"n=" + 3`). Its *Hint* offers two remedies: "Convert
explicitly" (legal) or "interpolate inside a string". An author who takes the
second and writes the number into a regular quoted string — `"n=${3}"` — gets
the eight literal bytes `n=${3}`, not `n=3`, and no diagnostic fires (the bytes
are legal string content per lexical.md:26). The remedy the diagnostic renders
therefore produces exactly the silent wrong-bytes failure lexical.md:26 exists
to prevent.

The phrasing is confined to the *Hint* column. Under DIAG-4
(`docs/spec_topics/diagnostics/diagnostic-shape.md:74`) only the *Message*
column is normative and version-pinned; this row's *Message*
(`'+' has mixed operand types: <left> and <right>`) is clean and unaffected.
The *Hint* column is "the normative author-facing hint when the spec mandates
one" (column legend,
`docs/spec_topics/diagnostics/diagnostic-shape.md#column-legend`) and is
rendered to the author verbatim as `\n  hint: <hint>` (serialised content
format). So this is a rendered-remedy defect — stronger than free prose because
authors see it as the fix at the point of failure — but it is **not** a DIAG-4
*Message*-surface defect, and rewording it is not a theta-2.0 breaking wording
change. It is an advisory-column reword, the same class as 0309's
`expressions.md:232` fix.

The QRY-18-page bullet (`query-escapes-stringification.md:37`) is a stale
cross-reference: it quotes `"interpolate inside a string"` as the `+`-advice in
Expressions, but Expressions was reworded by 0309 and no longer carries that
phrase, so the quotation is both inaccurate and a second reproduction of the
misleading idiom.

## Why it matters

The registry *Hint* is the guidance an author reads at the moment they hit the
`+` type error — the single most likely point to follow the "interpolate inside
a string" advice into an inert `${…}`. The home-page prose that would have
corrected them (`expressions.md:232`) is now right, so the corpus contradicts
itself: the diagnostic's rendered remedy and its Spec-rule home page disagree on
where interpolation is legal. The QRY-18-page quote compounds the drift by
attributing the superseded phrasing to a page that no longer says it.

## Non-goals

- No language change. Interpolation in regular strings stays RFC territory and
  is not proposed here (0309's pinned disposition; lexical.md:26 is the
  contract).
- No new diagnostic for `${` in a regular string (0309 records none exists;
  that stays true).
- `lexical.md:26` is correct and is not edited.
- The DIAG-4 *Message* column of the `mixed-plus-operands` row is correct and is
  not edited.
- No re-edit of bug 0309 (era-pinned, fixed at 0.341.0) and no corpus sweep
  beyond the two same-phrase sites enumerated in §Affected.

## Fix

Reword both surviving sites to the surface lexical.md:26 blesses, mirroring the
landed `expressions.md:232` reword:

1. `docs/spec_topics/diagnostics/code-registry-parse.md:40` — the
   `mixed-plus-operands` *Hint*: replace "Convert explicitly or interpolate
   inside a string." with a form that names the query template, e.g. "Convert
   explicitly, or interpolate inside a `@`...`` query template (regular strings
   do not interpolate)." Leave the *Trigger*, *Spec rule*, *Sev*, *Phase* and
   *Message* columns unchanged.
2. `docs/spec_topics/query/query-escapes-stringification.md:37` — update the
   parenthetical quotation to the current `expressions.md:232` wording so the
   attribution is accurate and no longer reproduces "interpolate inside a
   string" (e.g. quote "interpolate inside a `@`...`` query template" in place
   of mixed-type `+`).

After the reword, `rg -n "interpolate inside a string" docs/spec_topics` returns
nothing (the two 0309-doc matches are that dated record and stay as-filed). No
runtime red exists — the idiom is spec-conformant plain text — so the witness
posture is docs-only, discharged by the standing spec-prose review, consistent
with 0309's fix.
