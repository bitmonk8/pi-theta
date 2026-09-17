---
id: PTQ-0389
title: discovery-walk.ts's header claims FailureModes, CONVENTIONAL_MODES, and CLI_MODES are imported back from discovery-model.ts, though the import statement omits all three
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:33-40
  - src/discovery/discovery-walk.ts:66-75
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# discovery-walk.ts's header claims FailureModes, CONVENTIONAL_MODES, and CLI_MODES are imported back from discovery-model.ts, though the import statement omits all three

## Observation
`discovery-walk.ts`'s top-of-file header names `FailureModes`, `CONVENTIONAL_MODES`, `SETTINGS_MODES`, `CLI_MODES`, and `SourcedCandidate` as the "failure-mode tables... and the per-source `SourcedCandidate` shape" that "live in `discovery-model.ts`... and are imported back in below." The file's actual import statement from `discovery-model.ts` names only `SETTINGS_MODES` and `SourcedCandidate` from that list; `FailureModes`, `CONVENTIONAL_MODES`, and `CLI_MODES` are absent from it and from every other line in the file except one unrelated prose comment.

## Evidence
`src/discovery/discovery-walk.ts:33-40` — the header's claim, naming all five identifiers as living in `discovery-model.ts` and "imported back in below":
```ts
// The discovery-wide types (`DiscoverySource`, `PiOwnedCommand`,
// `DiscoveryInput`, `DiscoveredTheta`, `DiscoveryResult`), the `theta/load/*`
// diagnostic codes, the failure-mode tables, and the per-source
// `SourcedCandidate` shape this walk implements against — `FailureModes`,
// `CONVENTIONAL_MODES`, `SETTINGS_MODES`, `CLI_MODES`, `SourcedCandidate` —
// live in `discovery-model.ts` (PTQ-0305's Seam 0, the leaf every concern
// here depends on) and are imported back in below; every name this file
// exported before that split is still exported from here.
```

`src/discovery/discovery-walk.ts:66-75` — the actual import statement the header points to; `FailureModes`, `CONVENTIONAL_MODES`, and `CLI_MODES` are absent, while `SETTINGS_MODES` and `SourcedCandidate` are present:
```ts
import {
  INVALID_EXTENSION,
  MISSING_SOURCE,
  SETTINGS_MODES,
  UNREADABLE_SOURCE,
  type DiscoveryInput,
  type DiscoveryResult,
  type DiscoverySource,
  type SourcedCandidate,
} from "./discovery-model";
```

Exact searches confirming no other reference exists: `grep -n "\bFailureModes\b" src/discovery/discovery-walk.ts` returns exactly one line (36, inside the header quoted above). `grep -n "\bCLI_MODES\b\|\bCONVENTIONAL_MODES\b" src/discovery/discovery-walk.ts` returns exactly two lines: 37 (the header) and 504, a prose comment ("A conventional root is OPTIONAL: `CONVENTIONAL_MODES.missing === null`") that explains a design rationale in words, not a code reference to the identifier.

## Why this is a problem
The header tells a reader that `FailureModes`, `CONVENTIONAL_MODES`, and `CLI_MODES` are consumed by this file and can be found in the import block "below," but following that pointer finds nothing: the three names are neither imported nor read anywhere in the file. Commit `717e97c5` (PTQ-0305's Seam 0 split) wrote this header paragraph at the same time it added `CLI_MODES`, `CONVENTIONAL_MODES`, and `type FailureModes` to the import block, so the claim was accurate then — `discoverThetas`'s helper functions (`enumerateDirectory`/`resolveEntry`/`collectFromEntries`, still resident in this file at the time) took a `modes: FailureModes` parameter built from these constants. Commit `dc761274` (PTQ-0366's fix) deleted `CLI_MODES`, `CONVENTIONAL_MODES`, and `type FailureModes` from the import block — replacing the threaded `modes` parameter with an internal `MODES_BY_SOURCE[source]` lookup performed inside `discovery-source-enumerate.ts` — but left this header paragraph unedited, so it still lists three names the file no longer needs.

## Suggested direction (non-binding, optional)
Drop `FailureModes`, `CLI_MODES`, and `CONVENTIONAL_MODES` from the header's roster at lines 33-40, keeping `SETTINGS_MODES` and `SourcedCandidate`, the two names this file still imports from `discovery-model.ts`.

## False-positive check
- Ran `grep -n "\bFailureModes\b" src/discovery/discovery-walk.ts` → one hit, the header line itself (36).
- Ran `grep -n "\bCLI_MODES\b\|\bCONVENTIONAL_MODES\b" src/discovery/discovery-walk.ts` → two hits: the header (37) and an unrelated prose comment (504) that is not a code reference.
- Confirmed the import block at lines 66-75 is the only `from "./discovery-model"` value/type import statement in the file, and it names neither of the three identifiers.
- Ran `git log -S"  CLI_MODES," --oneline -- src/discovery/discovery-walk.ts` → three hits: `070a1ef3` (the original V10a commit, predating the split), `717e97c5` (the commit that authored this header paragraph and simultaneously added `CLI_MODES`/`CONVENTIONAL_MODES`/`type FailureModes` to the import block — confirmed via `git show 717e97c5`, whose diff shows the same commit deleting the local `interface FailureModes`/`const CONVENTIONAL_MODES`/`const CLI_MODES` declarations and replacing them with this import), and `dc761274` (whose diff shows `-  CLI_MODES,` / `-  CONVENTIONAL_MODES,` / `-  type FailureModes,` deleted from the same import block, with no corresponding edit to the header).
- Ran `git show dc761274 --stat -- src/discovery/discovery-walk.ts` → confirms this is the only file the commit touches, and its whole diff is exactly the parameter/import removal described above (the `MODES_BY_SOURCE` redirection), never touching lines 33-40.
- Checked the do-not-refile list and `quality/resolved/`: PTQ-0356 covers this same header's earlier drift on `PRIORITY`/`SLASH_NAME` (fixed by an unrelated, earlier commit); it does not name `FailureModes`, `CLI_MODES`, or `CONVENTIONAL_MODES`, and the text quoted above is the current, post-PTQ-0356-fix wording.
- This is a header-accuracy claim, not a deadness claim: `FailureModes`, `CONVENTIONAL_MODES`, and `CLI_MODES` remain live, exported, and used inside `discovery-model.ts` itself; nothing here proposes removing any declaration, only correcting which file's header claims to import them.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — reproduced verbatim: header (33-40) lists FailureModes/CONVENTIONAL_MODES/CLI_MODES as imported "below" from discovery-model.ts, but the import block (66-75) has only SETTINGS_MODES/SourcedCandidate, and greps confirm zero other references (FailureModes: header line 36 only; CLI_MODES|CONVENTIONAL_MODES: header line 37 plus one unrelated prose comment at 504); git history confirms genuine drift (717e97c5 authored this paragraph and the import simultaneously, when enumerateDirectory/resolveEntry/collectFromEntries still took a modes:FailureModes param; dc761274, PTQ-0366's ratified fix, deleted that param/import via collectFromEntries per its diff hunks at 64/71/324/460/488/546/591/604, none touching lines 1-45) — same pattern as the confirmed PTQ-0356 precedent on this file, and not a duplicate of it (PTQ-0356 covered a different, already-fixed identifier, PRIORITY). (triage: claude-opus-5)
