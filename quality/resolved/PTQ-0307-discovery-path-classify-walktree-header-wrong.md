---
id: PTQ-0307
title: discovery-path-classify.ts's header says settings.ts imports `walkTree` directly, but settings.ts imports only `joinPosix`
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-path-classify.ts:8-13
  - src/discovery/settings.ts:22-26
  - src/discovery/package-discovery.ts:30-35
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# discovery-path-classify.ts's header says settings.ts imports `walkTree` directly, but settings.ts imports only `joinPosix`

## Observation
discovery-path-classify.ts's module header names the two sibling discovery
modules that, after the PTQ-0286/PTQ-0287 sharing fixes, stopped keeping
their own copies of this module's helpers. It states that "package-discovery.ts
and settings.ts import the shared POSIX path helpers and `walkTree` directly."
settings.ts's own import from this module names exactly one symbol,
`joinPosix`; the identifier `walkTree` does not occur anywhere in
settings.ts. package-discovery.ts's import from the same module does include
`walkTree`.

## Evidence
src/discovery/discovery-path-classify.ts:8-13 (the header claim):
```ts
// discovery-walk.ts imports back what its own per-source enumeration
// (`resolveEntry`/`enumerateDirectory`) and settings `thetaPaths` resolution
// (`resolveSettingsSource`) call, and package-discovery.ts and settings.ts
// import the shared POSIX path helpers and `walkTree` directly (PTQ-0286,
// PTQ-0287) — package-discovery.ts also imports the descriptor renderer
// `renderSourceDescriptor` (PTQ-0284) — instead of keeping their own copies.
```

src/discovery/settings.ts:22-26 (this file's only import from
discovery-path-classify.ts):
```ts
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import { renderCanonicalNumber } from "../render/canonical-number";
import { joinPosix } from "./discovery-path-classify";
import { nodeErrorCode } from "./node-error-code";
```

src/discovery/package-discovery.ts:30-35 (shown for contrast — this file's
import does include `walkTree`):
```ts
import type { Diagnostic, Severity } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import type { Clock, TimerHandle } from "../seams/clock";
import type { ThetaSettings } from "./settings";
import { joinPosix, normalizePath, renderSourceDescriptor, splitExtension, walkTree } from "./discovery-path-classify";
import { nodeErrorCode } from "./node-error-code";
```

Exact searches: `grep -n "walkTree" src/discovery/settings.ts` — no match.
`grep -n "from \"\./discovery-path-classify\"" src/discovery/*.ts` — three
importers (discovery-walk.ts, package-discovery.ts, settings.ts), and
settings.ts's own import clause (line 25, quoted above) names only
`joinPosix`.

## Why this is a problem
The header sentence pairs "package-discovery.ts and settings.ts" as a unit
that both "import the shared POSIX path helpers and `walkTree` directly." The
POSIX-helper half holds for both files (settings.ts imports `joinPosix`); the
`walkTree` half holds for only one of the two named files. settings.ts has no
tree-walking need to begin with — it reads, validates, and merges the two
settings JSON files, and leaves glob/directory expansion of `thetaPaths`
entries to discovery-walk.ts's own `resolveSettingsSource`/`listTree` — so a
reader trusting this header for "who consumes `walkTree`" is told settings.ts
does when it does not.

## Suggested direction (non-binding, optional)
Split the sentence so the POSIX-helper collaborators (package-discovery.ts,
settings.ts) and the `walkTree` collaborator (package-discovery.ts alone) are
named separately.

## False-positive check
`grep -n "walkTree" src/discovery/settings.ts` returns no match. Enumerated
every importer of discovery-path-classify.ts (`grep -n "from
\"\./discovery-path-classify\"" src/discovery/*.ts`): discovery-walk.ts,
package-discovery.ts, and settings.ts — settings.ts's own clause (line 25)
names only `joinPosix`, and package-discovery.ts's clause (line 34) does name
`walkTree`, confirming the header is accurate for that file alone. Checked
settings.ts end to end for a second import statement or a re-export under
another name — none exists. This finding is about the header's collaborator
list, not about `walkTree`'s liveness: `walkTree` is live, called from
package-discovery.ts's own `listTree` (package-discovery.ts:318-319) and from
discovery-walk.ts's own `listTree` (discovery-walk.ts), both confirmed by
direct call-site grep.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — header at discovery-path-classify.ts:8-13 verbatim as quoted, settings.ts's sole import (line 25) names only `joinPosix`, a repo-wide grep shows zero `walkTree` references in settings.ts while package-discovery.ts's clause (line 34) and both live call sites (package-discovery.ts:319, discovery-walk.ts:517) confirm `walkTree` is real but package-discovery-only, and settings.ts's own body has no readdir/walk/glob logic to need it — an unhedged, unambiguous collaborator-list inaccuracy, not a defensible scoped reading (triage: claude-opus-5)
