---
id: PTQ-0034
title: parseThetaDocument's doc comment states its whole contract twice — the second paragraph is a verbatim-in-substance restatement of the first
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/theta-document.ts:974-984
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# parseThetaDocument's doc comment states its whole contract twice — the second paragraph is a verbatim-in-substance restatement of the first

## Observation
The doc comment on `parseThetaDocument` — the module's main entry point — is
two paragraphs. The second paragraph repeats the first's two clauses ("the
whole file — not a single expression — is walked into the executable
`ThetaBody` statement-list AST" and "the delegated V-slice parse-checkers'
diagnostics are aggregated in one pass, sorted `(file, line, col)`") with only
punctuation and citation differences, adding no information. This is an
editing artifact: a rewrite of the summary sentence was added without removing
the sentence it restates.

## Evidence
src/parser/theta-document.ts:974-984:

```ts
/**
 * Parse an entire `.theta` / `.thetalib` source into `{ frontmatter, body,
 * diagnostics }`: the whole file — not a single expression — is walked into the
 * executable `ThetaBody` statement-list AST, and the delegated V-slice
 * parse-checkers' diagnostics are aggregated in one pass, sorted `(file, line,
 * col)`, per implementation-notes.md §Parser *Contract* (`cka-49`).
 *
 * The whole file — not a single expression — is walked into the executable
 * `ThetaBody` statement-list AST; the delegated V-slice parse-checkers'
 * diagnostics are aggregated in one pass and sorted `(file, line, col)`.
 */
```

Clause-by-clause: "the whole file — not a single expression — is walked into
the executable `ThetaBody` statement-list AST" appears at :976-977 and again
at :981-982; "diagnostics are aggregated in one pass, sorted `(file, line,
col)`" appears at :977-979 and again at :982-983. The second paragraph
contains no clause absent from the first.

## Why this is a problem
Leftover editing residue: duplicated prose inside one doc comment. Every
future edit to this function's contract now has two places to keep in sync
inside a single comment, and a reader is invited to hunt for a difference
between the paragraphs that does not exist. (This is intra-comment
duplication left by an edit, not duplication between two live code copies.)

## Suggested direction (non-binding, optional)
Delete the second paragraph; the first carries every clause plus the spec
citation.

## False-positive check
- Read both paragraphs clause-by-clause (quoted above): the second introduces
  no fact, citation, or qualifier missing from the first — it is not a
  summary-then-detail structure.
- Checked the rest of the comment and the function signature for anything the
  second paragraph could be anchoring (e.g. `@param`/`@returns` tags that
  might rely on it): the comment has no tags; nothing references the
  paragraph.
- Git intent: `git log -S "The whole file — not a single expression — is
  walked into the executable"` resolves only to the corpus-wide Loom→Theta
  rename commit (history squashed), so no later commit deliberately added the
  restatement as a distinct contract statement; current-state reading stands.
- Confirmed no filed wave candidate cites src/parser/theta-document.ts.

## Triage
verdict: confirmed — excerpt reproduces at :975-985 (1-line drift), para 2 contains zero content words absent from para 1, and git f8d77b7e shows it was written to replace the obsolete "V19a-T stubs this inert" note = proven editing residue, not house style; two FP-check side-claims are false (the -S hit is the V19a impl commit, not a rename; other candidates do cite this file) but neither refutes the finding nor creates a dupe (triage: claude-opus-5)
