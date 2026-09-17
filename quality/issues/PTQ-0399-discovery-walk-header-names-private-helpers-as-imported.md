---
id: PTQ-0399
title: discovery-walk.ts's header claims isCanonicalDuplicate and classifyForSource are imported back from discovery-source-enumerate.ts, though both stay module-private there
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:18-25
  - src/discovery/discovery-walk.ts:71-77
  - src/discovery/discovery-source-enumerate.ts:9-14
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917095931
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# discovery-walk.ts's header claims isCanonicalDuplicate and classifyForSource are imported back from discovery-source-enumerate.ts, though both stay module-private there

## Observation
`discovery-walk.ts`'s header paragraph about the per-source-enumeration split names seven identifiers — `RawCandidate`, `enumerateDirectory`, `isCanonicalDuplicate`, `onDiskFileCandidate`, `resolveEntry`, `classifyForSource`, `emitSourceFailure` — as living in `discovery-source-enumerate.ts` and "imported back in below." The file's actual import statement from `discovery-source-enumerate.ts` names only five of those seven (`emitSourceFailure`, `enumerateDirectory`, `onDiskFileCandidate`, `resolveEntry`, `RawCandidate`); `isCanonicalDuplicate` and `classifyForSource` are absent from it. `discovery-source-enumerate.ts`'s own header states the opposite of the claim: those two names "stay module-private, called only from within this file."

## Evidence
`src/discovery/discovery-walk.ts:18-25` — the header's claim, naming all seven identifiers as "imported back in below":
```ts
// The per-source candidate enumeration and classification — collecting a
// directory's `*.theta` candidates, resolving one source entry (a directory
// root or an explicit `.theta` file) into raw candidates, and the bug 0363
// on-disk-entry lookup an explicit file reference needs — `RawCandidate`,
// `enumerateDirectory`, `isCanonicalDuplicate`, `onDiskFileCandidate`,
// `resolveEntry`, `classifyForSource`, `emitSourceFailure` — live in
// `discovery-source-enumerate.ts` (PTQ-0367, pre-announced by PTQ-0333 as
// "concern 1") and are imported back in below.
```

`src/discovery/discovery-walk.ts:71-77` — the actual import statement the header points to; `isCanonicalDuplicate` and `classifyForSource` are absent, while the other five named members are present:
```ts
import {
  emitSourceFailure,
  enumerateDirectory,
  onDiskFileCandidate,
  resolveEntry,
  type RawCandidate,
} from "./discovery-source-enumerate";
```

`src/discovery/discovery-source-enumerate.ts:9-14` — the sibling module's own header, stating the opposite for these two names:
```ts
// file-private, called only from within this file. This module imports
// nothing from discovery-walk.ts — the cycle guard, since discovery-walk.ts
// imports FROM here.
```
(the paragraph's lead-in, at lines 9-10 of that file, reads "`isCanonicalDuplicate` and `classifyForSource` stay module-private, called only from within this file").

Exact searches confirming no other reference exists in `discovery-walk.ts`: `grep -n "isCanonicalDuplicate\|classifyForSource" src/discovery/discovery-walk.ts` returns exactly two lines — the header paragraph itself (line 22 and line 23) — with no import, call, or other use anywhere else in the file.

## Why this is a problem
The header tells a reader that `isCanonicalDuplicate` and `classifyForSource` are consumed by `discovery-walk.ts` and can be found in the import block "below," but following that pointer finds neither name: both are declared `function` (not `export function`) in `discovery-source-enumerate.ts` and called only from within that file (`isCanonicalDuplicate` from `enumerateDirectory`; `classifyForSource` from `resolveEntry`). This is the resolution PTQ-0367's own triage ratified: "Export exactly the members the host still uses … the rest stay module-private in the new file" — the fix intentionally kept these two private, but the pre-existing header paragraph describing the split's member roster was carried over unedited and still lists them as exported/imported-back members.

## Suggested direction (non-binding, optional)
Drop `isCanonicalDuplicate` and `classifyForSource` from the header's roster at lines 18-25, keeping the five names the import statement actually names.

## False-positive check
- Ran `grep -n "isCanonicalDuplicate\|classifyForSource" src/discovery/discovery-walk.ts` → two hits, both inside the header paragraph itself (lines 22-23); no import statement, call site, or other reference anywhere else in the file.
- Confirmed the import block at lines 71-77 is the only `from "./discovery-source-enumerate"` statement in the file, and it names neither identifier.
- Confirmed via `discovery-source-enumerate.ts:9-14` (that module's own header) and its bodies (`isCanonicalDuplicate` at line 124, `classifyForSource` at line 251, both declared as plain `function`, not `export function`) that both names are genuinely module-private there, called only from `enumerateDirectory`/`resolveEntry` within the same file.
- Checked `quality/resolved/PTQ-0367-…` (the split this header paragraph documents): its ratified fix instruction explicitly keeps these two names module-private ("the rest stay module-private in the new file"), confirming the header's "imported back in below" claim was never true after that fix landed, not merely stale from a later edit.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — header roster at discovery-walk.ts:18-25 names isCanonicalDuplicate/classifyForSource as "imported back in below", but the only import from discovery-source-enumerate (now :81-87) omits both, both are non-exported `function` declarations there (:124, :251) matching that module's own header and PTQ-0367's ratified "rest stay module-private"; repo-wide grep finds no other reference; distinct paragraph/names from resolved PTQ-0356/0389 (triage: claude-fable-5-1)
verdict: confirmed — re-verified: discovery-walk.ts:18-25 header lists isCanonicalDuplicate/classifyForSource as "imported back in below" but the sole import from ./discovery-source-enumerate (now :81-87) names neither; both are non-exported `function` declarations (enumerate.ts:124, :251) called only intra-file (:108, :208), matching that module's header (:14) and PTQ-0367's ratified "rest stay module-private"; grep across src/extensions/tools/tests finds no other live reference; not a duplicate of resolved PTQ-0356/0389/0390/0391 (different names/paragraphs/files) (triage: claude-fable-5-1)
