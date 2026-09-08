---
id: PTQ-0119
title: "`enumerateRoot`'s doc comment refers the reader to `notes.md` twice, a file deleted from the repository"
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/package-discovery.ts:254-265
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# `enumerateRoot`'s doc comment refers the reader to `notes.md` twice, a file deleted from the repository

## Observation

The doc comment on `enumerateRoot` sends the reader to `notes.md` twice: once
for the git-layout descent rule ("descend until a directory that directly
contains a `package.json` is found — see notes.md") and once for the recorded
justification of a behaviour choice ("see the dated notes.md divergence").
No file named `notes.md` exists anywhere in the working tree. A 2648-line
`notes.md` was deleted from the repository root by commit `a49a595b`
("Remove build-to-release process cruft; declutter repo", 2026-07-13); the two
comment lines were written on 2026-07-01 and were not updated. The separate,
still-present `docs/spec_topics/implementation-notes.md` (34 lines) is a
different file, referenced elsewhere in src/ by that full name, and it carries
neither passage.

## Evidence

src/discovery/package-discovery.ts:254-265 — the doc comment, with both
references:

```ts
/**
 * Enumerate one root's candidate packages. npm-style roots treat each immediate
 * child as a package, unwrapping `@scope` directories one level (the on-disk
 * layout for scoped packages). git-style roots (`<host>/<path>` layout, whose
 * `<path>` segment count is not fixed by the spec) descend until a directory
 * that directly contains a `package.json` is found — see notes.md.
 *
 * npm-style children are not `lstat`-pre-filtered: a non-directory / symlink
 * child simply fails its `package.json` read and contributes nothing (see the
 * dated notes.md divergence — this keeps the walk's await budget within the
 * `FakeClock`-driven per-read-deadline test's timing model).
 */
```

Absence of the target: `find . -name "notes.md" -not -path "./node_modules/*"
-not -path "./.git/*"` → zero hits; `ls -a` at the repository root lists no
`notes.md`; `ls docs` lists `STYLE.md`, `bugs`, `cleanup-inventory.md`,
`examples`, `guide.md`, `how-to`, `plan_topics`, `reference`, `spec.md`,
`spec_topics`, `rfcs`, `rename-to-theta.md`, `tutorial.md` — no `notes.md`.

Deletion: `git log --diff-filter=D --name-only --format="%h %s" -- notes.md`
→ `a49a595b Remove build-to-release process cruft; declutter repo`, whose
`--stat` line reads `notes.md | 2648 --------------------`, and whose message
body says `- Delete: notes.md, .pi/** dev-harness state, src/.gitkeep,
docs/plan.md,`.

Provenance of the two lines: `git blame -L 259,259` and `-L 263,263` on
src/discovery/package-discovery.ts both report commit `1d9be00ec`, dated
2026-07-01 — twelve days before the deletion.

Content not migrated: `grep -rn "await budget\|descend\|pre-filter"
docs/spec_topics/implementation-notes.md` → zero hits; `grep -rln "await
budget" docs` → zero hits.

## Why this is a problem

Leftover scaffolding, with the referenced artefact's removal shown: the
comment routes a reader to a file the repository no longer contains, so the
"dated notes.md divergence" — the only recorded justification for the stated
choice not to `lstat`-pre-filter npm-style children — cannot be reached from
the code that cites it. The pointer is not merely renamed: the surviving
`implementation-notes.md` contains neither passage (searches above), and no
file under `docs/` mentions the "await budget" rationale, so following the
reference terminates with nothing. The same dangling spelling occurs at eight
further sites outside this review's scope (`grep -rnE "(^|[^-])\bnotes\.md"
src --include=*.ts | grep -v implementation-notes.md` → 10 hits across 6
files); only the two in-scope sites are cited here.

## Suggested direction (non-binding, optional)

Either inline the two sentences of rationale the comment is deferring to, or
drop the pointer; whichever is chosen, the surrounding prose already states
the rule and the behaviour, so nothing but the unreachable citation is at
stake.

## False-positive check

- Target-exists search: `find . -name "notes.md"` over the whole tree minus
  `node_modules/` and `.git/` — zero hits; root `ls -a` and `ls docs` confirm
  no such file at either location.
- Renamed-target check: `docs/spec_topics/implementation-notes.md` exists and
  is referenced elsewhere in src/ under that full name (e.g.
  src/diagnostics/diagnostic.ts:7, src/parser/theta-document.ts:10), so the
  bare `notes.md` spelling is not shorthand for it; grep of that file for the
  cited passages returned zero hits.
- Content-migration check: `grep -rln "await budget" docs` — zero hits, so the
  divergence note was not moved into the docs tree under different wording.
- Git-history intent: `git log --diff-filter=D -- notes.md` shows the file
  deleted by `a49a595b` as part of a decluttering commit that lists it
  explicitly; `git blame` shows both comment lines predate that commit, so the
  references are residue of that deletion rather than forward references to a
  file yet to be added.
- Tooling-read check: `grep -rn "notes.md" tools eslint.config.js
  package.json` — no build, lint, or docs gate reads the string, so the
  references are read by humans only.

## Triage
verdict: confirmed — reproduced every claim: excerpt verbatim at 254-265 with `notes.md` at lines 259/263, no `notes.md` in tree (find + `git ls-files` zero, never re-added), deleted 2026-07-13 by a49a595b (2648 lines) twelve days after both lines were written (blame 1d9be00ec, 2026-07-01), rationale not migrated ("await budget" zero hits in docs; surviving implementation-notes.md carries neither passage and is cited elsewhere by full name), no tooling reads the string; in-scope leftover narration in a production src/ file, and the wider 10-hit/6-file residue is disclosed rather than hidden (triage: claude-opus-5)
