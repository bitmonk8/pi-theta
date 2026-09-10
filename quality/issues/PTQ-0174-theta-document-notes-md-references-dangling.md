---
id: PTQ-0174
title: Two comments in parseThetaDocument refer the reader to `notes.md`, a file deleted from the repository
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/theta-document.ts:1086-1091
  - src/parser/theta-document.ts:1257-1266
sites: 2
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# Two comments in parseThetaDocument refer the reader to `notes.md`, a file deleted from the repository

## Observation
Two comments inside `parseThetaDocument` close with "See notes.md" — one on
the fence-less-source rule for `splitFrontmatter`, one on the fence re-wrap
before `parseFrontmatter`. No file named `notes.md` exists in the working tree
or in `git ls-files`. A 2648-line root `notes.md` was deleted by commit
`a49a595b` (2026-07-13); both comment sentences were written on 2026-07-02
(commits f8d77b7e and 3a8732da) and were not updated. The separate
`docs/spec_topics/implementation-notes.md`, which this file cites elsewhere by
its full name (:10, :27, :1047), contains neither passage.

## Evidence
src/parser/theta-document.ts:1086-1091:

```ts
  // Separate the optional `---` frontmatter fence from the executable body.
  // A fence-less source is body-only: the load-time "frontmatter is required"
  // obligation is the loader's (V6*), not the whole-file body parser's, and
  // every V19a-T fixture supplies a bare body — so parsing frontmatter only
  // when a fence is present keeps a spurious `missing mode:` diagnostic out of
  // the aggregated set. See notes.md.
```

src/parser/theta-document.ts:1257-1266:

```ts
    // `splitFrontmatter` returns the frontmatter text with the `---` fences
    // stripped, but `parseFrontmatter` re-requires them (its
    // `extractFrontmatterBlock` matches a leading/closing `---` fence). Re-wrap
    // the block in fences so the frontmatter fields (`mode:` / `model:` / …)
    // actually parse; without this every fenced `.theta` yields `frontmatter:
    // null` and a spurious `theta/load/missing-mode`. See notes.md (the
    // frontmatter line numbers are block-relative for a fence at file line 0 —
    // the common case; a fence preceded by blank lines shifts them by the
    // blank-line count, which no current obligation asserts).
```

Target absent: `find . -name "notes.md" -not -path "./node_modules/*" -not
-path "./.git/*"` → 0 hits; `git ls-files | grep -i "notes.md$"` → 0 hits;
`ls docs` → `STYLE.md bugs cleanup-inventory.md examples guide.md how-to
plan_topics reference rename-to-theta.md rfcs spec.md spec_topics tutorial.md`.

Deletion: `git log --diff-filter=D --format="%h %ad %s" --date=short --
notes.md` → `a49a595b 2026-07-13 Remove build-to-release process cruft;
declutter repo`.

Provenance of the two sentences: `git log -S"See notes.md" --
src/parser/theta-document.ts src/parser/loom-document.ts` → `f8d77b7e
2026-07-02` (V19a, adds :1091) and `3a8732da 2026-07-02` (H8a, adds :1263).
`git blame -L 1263,1263` reports the 2026-07-19 rename commit `2bc691576`
("Rename Loom -> Theta across the corpus") only because that same line's
`loom/load/missing-mode` token was renamed; the "See notes.md" text predates
the deletion by eleven days.

Content not migrated: `grep -rn -i "fence-less\|re-wrap\|block-relative\|
missing-mode" docs/spec_topics/implementation-notes.md` → 0 hits; `grep -rln
"fence-less\|fenceless" docs` → 0 hits.

## Why this is a problem
Leftover scaffolding: a pointer to an artefact whose removal is shown. Both
sentences defer part of their rationale ("See notes.md") to a file the
repository no longer contains, and the surviving `implementation-notes.md` —
the one plausible renamed target — carries neither passage, so following the
reference terminates with nothing. The same defect was confirmed and fixed for
the two sites in src/discovery/package-discovery.ts (PTQ-0119), whose
false-positive check explicitly listed further sites outside that review's
scope; these are the two in this file.

## Suggested direction (non-binding, optional)
Drop the two pointers, or inline whatever sentence of rationale they were
deferring to; the surrounding prose already states the rule and the behaviour
at both sites.

## False-positive check
- Target-exists search: `find` over the tree minus `node_modules/` and `.git/`,
  and `git ls-files`, both zero hits for `notes.md`.
- Renamed-target check: the file itself cites `implementation-notes.md` by full
  name at :10, :27, :1047, so the bare `notes.md` spelling is not shorthand
  for it; grep of that file for the two passages' key phrases returned zero.
- Content-migration check: `grep -rln "fence-less\|fenceless" docs` → zero, so
  the fence-less rationale was not moved into the docs tree.
- Git-history intent: `git log --diff-filter=D -- notes.md` names a
  decluttering commit that deleted the file; `git log -S"See notes.md"` shows
  both sentences added 2026-07-02, before that deletion, so they are residue
  of it rather than forward references.
- Tooling-read check: `grep -rn "notes.md" tools eslint.config.js
  package.json` → no build, lint, or docs gate reads the string.
- Not previously filed for this file: PTQ-0119 (resolved) cites only
  src/discovery/package-discovery.ts:254-265; `grep -rln
  "theta-document.ts:1091\|theta-document.ts:1263" quality/` → 0 hits.

## Triage
verdict: confirmed — reproduced every claim: both excerpts byte-match at 1086-1091/1263 ("See notes.md" at :1091 and :1263), no bare `notes.md` anywhere in tree (find zero; the only `git ls-files` suffix matches are `implementation-notes.md` and bug 0454's `...-structured-notes.md`, neither the cited file), deleted 2026-07-13 by a49a595b (2648 lines) eleven days after both sentences landed (`-S"See notes.md"` → f8d77b7e + 3a8732da, 2026-07-02; :1263's 2bc691576 blame is only the Loom→Theta token rename), and the deleted file did carry both deferred passages (notes.md@a49a595b^ :1465-1468 fence-less/body-only rule, :1634-1640 V19a re-wrap fix with the block-relative caveat) so these are residue of once-live pointers, not migrated (key phrases zero hits in implementation-notes.md and docs/), read by no tooling; in-scope leftover narration in production src/, and not a duplicate — PTQ-0119 (fixed by 13a3f7a0, which did not touch theta-document.ts) cited only package-discovery.ts:254-265 and explicitly disclosed these sites as outside its scope, and no other issue cites this file's lines (triage: claude-opus-5)
