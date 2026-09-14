---
id: PTQ-0338
title: discovery-walk.ts cites discovery-sources.md line numbers that name a blank line or an unrelated rule at four sites
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:95-101
  - src/discovery/discovery-walk.ts:408-412
  - src/discovery/discovery-walk.ts:422-432
  - src/discovery/discovery-walk.ts:443-447
  - docs/spec_topics/discovery/discovery-sources.md:62-69
  - docs/spec_topics/discovery/discovery-sources.md:71-73
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# discovery-walk.ts cites discovery-sources.md line numbers that name a blank line or an unrelated rule at four sites

## Observation
Four doc comments in `discovery-walk.ts` cite specific line numbers in
`docs/spec_topics/discovery/discovery-sources.md` to support a claim about
"not silence" / an offending path's descriptor / the clean-leaf rule. In the
current document, lines 63 and 69 are both blank, and lines 66-68 are the
three numbered rules following the failure-modes table (about unreadable
`.theta` files, the diagnostics channel, and per-entry-only fatality) — none
of which state the "not silence" / "descriptor" / "clean-leaf" content the
four comments attribute to them. The content that does match each comment's
claim, close to verbatim, lives at document lines 72-73 instead.

## Evidence
src/discovery/discovery-walk.ts:95-101 — cites "66-67" for a claim about
"not silence" and "the calling source's descriptor":
```ts
/** Enumerate one directory: collect byte-exact `*.theta` candidates and emit
 *  per-directory `non-canonical-extension` warnings (DISC-3). A root
 *  `classifyPath` already accepted as a directory whose enumeration then
 *  fails is an unreadable (or, on a clean `ENOENT` ancestor chain, missing)
 *  source, not silence (discovery-sources.md:66-67) — the calling source's
 *  descriptor and severities are threaded through so the failure emits from
 *  the one place the rejection is observed. */
```

src/discovery/discovery-walk.ts:408-412 — cites "63" (a blank line) for a
claim about "that entry's descriptor":
```ts
/** One glob-universe enumeration: the entries found, plus the paths whose own
 *  enumeration failed reportably. A shrunken universe is a well-formed value,
 *  so the failures travel out with it — the walk observes the rejection but
 *  only the caller knows which `thetaPaths` entry's universe it shrank
 *  (discovery-sources.md:63 wants that entry's descriptor). */
```

src/discovery/discovery-walk.ts:422-432 — cites "69" (blank) for "not
silence" and "68" (rule 3, per-entry fatality) for "the clean-leaf rule":
```ts
/** Recursively enumerate every file/dir under `root` (symlinks not followed);
 *  the universe glob patterns are matched against. A failure to enumerate any
 *  directory in that walk — the static-prefix root itself or a subtree below
 *  it — or to `lstat` an entry that walk enumerated, is a traversal failure
 *  inside a root that exists, an unreadable source and not silence
 *  (discovery-sources.md:69), so the rejection is classified by the :68
 *  clean-leaf rule and carried out rather than dropped. Delegates to the
 *  shared `walkTree` helper (PTQ-0287) with the `"ancestor-walk"` ENOENT
 *  policy: this walk's root is a settings glob's static-prefix directory, not
 *  pre-proven to exist, so a directory-level `ENOENT` needs the clean-leaf
 *  check rather than being assumed clean. */
```

src/discovery/discovery-walk.ts:443-447 — cites "rule 2 ... :63" (rule 2 is
at document line 67, and line 63 is blank):
```ts
/** Report each glob-universe traversal failure at the source's *Unreadable
 *  path* severity, once the pass's per-match reports are in. A path a
 *  per-match enumeration already reported is left to that report: rule 2
 *  (discovery-sources.md:63) pairs one offending path with one descriptor, and
 *  the universe walk is the coarser observer of the same rejection — with
```

docs/spec_topics/discovery/discovery-sources.md:62-69 — the actually-cited
range: a blank line (63), the three numbered rules (66/67/68), and a second
blank line (69):
```md
| CLI `--theta <path>` | error (explicit user intent) | error | error |

Three rules apply on top of the table:

1. **Discoverable `.theta` files that are themselves unreadable** (broken symlink, transient I/O error, EACCES on the file itself) are reported as `theta/load/unreadable` *warnings* regardless of source, and the theta is not registered. The scan continues; one bad file does not poison the rest.
2. **All warnings and errors above are emitted via the standard diagnostics channel** ([Diagnostics](../diagnostics.md)) using codes `theta/load/missing-source`, `theta/load/unreadable-source`, `theta/load/wrong-type-source`, and `theta/load/unreadable`. Each diagnostic carries the source descriptor in its `message` so the author can locate the offending configuration. [...]
3. **Errors are fatal for the offending entry only**, not for the whole discovery pass: a bad `--theta` flag prevents *that* theta from registering and surfaces a `theta/load/missing-source` error, but other `--theta` flags and the other four sources still process to completion.

```

docs/spec_topics/discovery/discovery-sources.md:71-73 — the passage that
actually matches every one of the four comments' claims ("clean leaf-ENOENT"
at line 72; "not silence" and "carrying that source's descriptor," matching
"thetaPaths entry" verbatim, at line 73):
```md

- A *clean leaf-`ENOENT`* is an `ENOENT` from `readdir` or `stat` on the candidate path whose ancestors all `lstat` successfully as directories the process can enter. [...]
- A symlink loop or other traversal failure *inside* a discovery root that does exist is an unreadable-source warning, not silence — the silent-on-missing rule applies to the *root* itself not existing, not to failures encountered while walking a root that does. A glob pattern's recursive enumeration of its static-prefix root is a walk of that root in this same sense: a `readdir` failure at the prefix root itself, or at any directory below it, or a failure to `lstat` an entry that same walk enumerated, is an unreadable-source diagnostic at the offending source's own severity, carrying that source's descriptor (the matching `thetaPaths` entry index, or the package's `pi.theta` descriptor). [...]
```

## Why this is a problem
Each of the four code comments cites a line number as the authority for its
claim; in three of the four sites the cited line is blank, and in the fourth
("rule 2 ... :63") the comment names both a numbered rule and a line number
that disagree with each other (rule 2 is at line 67). In every case the
content that actually supports the claim — "not silence," "clean-leaf,"
"carrying that source's descriptor," "the matching `thetaPaths` entry" — is
concentrated four to ten lines further down, at document lines 72-73, and
none of the wrong line numbers ever names that passage. A reader who opens
the cited line to check the rule finds either nothing or a different rule
than the one being invoked.

## Suggested direction (non-binding, optional)
Update the four citations to point at discovery-sources.md:72 (the
clean-leaf-`ENOENT` definition) and :73 (the "not silence" / offending-path-
descriptor passage) in place of the current 63/66-67/68/69 range.

## False-positive check
- Read `docs/spec_topics/discovery/discovery-sources.md` lines 55-73 in full
  (via `awk '{print NR": "$0}' ... | sed -n '55,73p'`) and confirmed lines 63
  and 69 are blank, lines 66/67/68 are the three numbered rules (none
  mentioning "silence" or "clean-leaf"), and lines 72-73 carry the "clean
  leaf-`ENOENT`" definition and the "not silence … carrying that source's
  descriptor" sentence quoted above.
- Confirmed via `grep -n "discovery-sources.md:" src/discovery/discovery-walk.ts`
  that these are the only four line-numbered citations to this document in
  the file (a fifth citation, to `package-and-settings.md:29` at line 418,
  was independently checked and matches its target exactly — "A glob pattern
  that resolves to zero files is silent (not an error)" — so this is not a
  claim that every citation in the file is wrong, only these four).
- Searched the intake/issues/resolved topic list for a prior filing citing
  `discovery-sources.md` line drift in `discovery-walk.ts` — no match (the
  existing "line citations drifted" filings, e.g. PTQ-0026/PTQ-0069/PTQ-0080,
  target different files' citations to different documents).
- This is a citation-accuracy claim, not a deadness claim: the code these
  comments document (`enumerateDirectory`, `TreeWalk`, `listTree`,
  `emitUniverseFailures`) is live and unaffected by this finding.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim: discovery-sources.md:63/69 are blank and 66-68 are the three unrelated numbered rules, while all four comments' cited content (clean-leaf-ENOENT, "not silence," thetaPaths descriptor) lives at 72-73; git blame shows the comments predate the Sep 5 doc edit that shifted the lines, matching established precedent (PTQ-0026/0069/0189). (triage: claude-opus-5)
