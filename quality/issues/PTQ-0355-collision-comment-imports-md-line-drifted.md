---
id: PTQ-0355
title: import-static-checks.ts's bug-0335 comment cites imports.md:124 for its name-collision quote, which now lives at line 137
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:1644-1652
  - docs/spec_topics/imports.md:117-124
  - docs/spec_topics/imports.md:137
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# import-static-checks.ts's bug-0335 comment cites imports.md:124 for its name-collision quote, which now lives at line 137

## Observation
A comment above the per-lib own-import-collision check quotes
`docs/spec_topics/imports.md` and cites line 124 as its source. Line 124 of
the current document is the end of an unrelated sentence about
`theta/parse/import-non-thetalib-extension` co-emission on a separator-shape
specifier list. The sentence the comment actually quotes — "An imported
symbol whose name collides with a top-level declaration in the same file is
also `theta/parse/import-name-collision`" — is 13 lines further down, at line
137.

## Evidence
src/extension/import-static-checks.ts:1644-1652 — the comment and its
citation:
```ts
    // Bug 0335: `imports.md:124` refuses "an imported symbol whose name
    // collides with a top-level declaration in the same file" without
    // exempting `.thetalib` files, but until now the collision arm only ever
    // ran over the COMPOSING theta's own specifiers (below) — never over a
    // resolved dependency `.thetalib`'s own `import … from` specifiers against
    // its own top-level `fn`/`enum`/`schema` names. That let a library import
    // `X` and declare its own `X` load clean, then resolve inconsistently at
    // runtime depending on declaration kind and read site. This reuses the
    // existing `theta/parse/import-name-collision` code (no new registry row)
```

docs/spec_topics/imports.md:117-124 — the actually-cited line (124, last line
below), part of an unrelated co-emission rule about a wrong file extension,
not name collisions:
```md
codes — the missing-from-clause diagnostic ranged over the statement, this one
over the malformed specifier. A dangling `as` also co-emits with
`theta/parse/import-reserved-synthesised-name` when the malformed specifier's
local binding is a reserved synthesised name, and a separator shape whose
missing separator invents a specifier the author did not write co-emits with
that same code when the invented specifier's local binding is reserved. The
separator shape also co-emits with `theta/parse/import-non-thetalib-extension`
when the statement's path literal does not name a `.thetalib`.
```

docs/spec_topics/imports.md:137 — the passage the comment actually quotes,
matching it near-verbatim:
```md
The same `as` form is also available for self-clarity (`import { ReviewScore as Score } from "./scoring.thetalib"`). An imported symbol whose name collides with a top-level declaration in the same file is also `theta/parse/import-name-collision` — no implicit shadowing. This rule is not restricted to `.theta` files: a `.thetalib` whose own `import … from` specifier binds a name its own top-level `schema`, `enum`, or `fn` declaration also binds is the same collision, checked against the same file — the declaring-scope rule above licenses a library body to reference both sources, but never lets them silently bind the same name.
```

`grep -n "collides with a top-level declaration" docs/spec_topics/imports.md`
returns exactly one hit, line 137 — the sentence the comment quotes exists at
exactly one place in the document, and it is not line 124.

## Why this is a problem
The comment cites a specific document line as the authority for a quoted
spec sentence. The cited line (124) neither contains that sentence nor
concerns name collisions at all — it is the tail of a different rule about
extension-mismatch co-emission. A reader who opens `imports.md:124` to verify
the "an imported symbol whose name collides..." rule finds an unrelated
sentence and has to search the document to find the real one at line 137.

`git blame` on the comment (`src/extension/import-static-checks.ts:1644`)
shows it was introduced by commit `089b27df` (bug 0335, 2026-08-28); at that
commit the quoted sentence WAS at line 124 (`git show 089b27df -- docs/spec_topics/imports.md`
shows a single-line in-place edit to old/new line 124, "@@ -121,7 +121,7 @@").
Two later, unrelated documentation commits — `f8eb6286` (bug 0431,
2026-09-04, +7 lines inserted above the old line 124) and `74dffd64`
(bug 0446/0447, 2026-09-05, +8 more lines inserted above it) — each added
prose earlier in the file without touching this comment, pushing the target
sentence down to its current line 137 while the citation stayed at 124.

## Suggested direction (non-binding, optional)
Update the citation from `imports.md:124` to `imports.md:137`.

## False-positive check
- Read `docs/spec_topics/imports.md` lines 117-124 directly (via `grep -n ""
  docs/spec_topics/imports.md | sed -n '117,126p'`) and confirmed line 124 is
  the tail of the extension-mismatch co-emission rule, unrelated to name
  collisions.
- `grep -n "collides with a top-level declaration" docs/spec_topics/imports.md`:
  exactly one hit, line 137, ruling out ambiguity about which passage the
  comment means.
- `git blame -L 1644,1645 -- src/extension/import-static-checks.ts`: the
  comment was introduced by `089b27df` (bug 0335).
- `git show 089b27df -- docs/spec_topics/imports.md`: confirmed the diff hunk
  at that commit is `@@ -121,7 +121,7 @@`, a single-line in-place edit at
  line 124 (old and new), so the citation was accurate when written.
- `git log --oneline -- docs/spec_topics/imports.md` plus `git show` on the
  two later commits touching the file (`f8eb6286`, `74dffd64`): both insert
  new paragraphs above the target sentence's position (7 and 8 lines
  respectively) without touching `import-static-checks.ts`, accounting for
  the 124 → 137 drift.
- Searched the intake/issues/resolved topic list for this citation: the only
  related filing is `PTQ-0339` ("resolvedlibs-imports-md-line-19-blank"),
  which is a different citation (`imports.md:19`, on the `resolvedLibs` doc
  comment at a different line of this same file) — a distinct root cause
  from this `imports.md:124` citation on the bug-0335 collision comment, so
  this is not a duplicate.
- Not a deadness claim: the code this comment documents (the per-lib
  own-import-collision check, `checkImportNameCollisions` called over
  `libOwnSpecifiers`) is live, exercised by
  `tests/b0335-own-import-shadows-own-declaration.test.ts`; this finding is
  about the citation's accuracy only.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified: import-static-checks.ts:1644 cites imports.md:124, which is verified unrelated extension-mismatch prose, while the quoted collision sentence is the sole grep hit at line 137; git blame/show confirms it read correctly at line 124 when authored (089b27df) and drifted via two later unrelated doc commits (f8eb6286, 74dffd64) — the candidate's own +7/+8 per-commit delta is arithmetically off (actual +7/+6) but the core citation-vs-content mismatch and its cause both reproduce; distinct from PTQ-0109/PTQ-0339's citations, not a duplicate. (triage: claude-opus-5)
