---
id: PTQ-0352
title: discovery-model.ts's split-rationale header claims eleven PRIORITY reads and four diagnostic codes in discovery-collision-resolve.ts; actual counts are nine and five
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-model.ts:1-10
  - src/discovery/discovery-collision-resolve.ts:19-31
  - src/discovery/discovery-collision-resolve.ts:168-190
  - src/discovery/discovery-collision-resolve.ts:254-256
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# discovery-model.ts's split-rationale header claims eleven PRIORITY reads and four diagnostic codes in discovery-collision-resolve.ts; actual counts are nine and five

## Observation
`discovery-model.ts`'s header justifies why it had to be extracted from
`discovery-walk.ts` before any other concern, on the grounds that
`discovery-collision-resolve.ts`'s collision resolution "alone reads
`PRIORITY` eleven times plus four of the codes below." Counting the actual
`PRIORITY[...]` index reads and the actual diagnostic-code identifiers used
in `discovery-collision-resolve.ts` today gives nine and five respectively,
not eleven and four.

## Evidence
`src/discovery/discovery-model.ts:1-10` — the claim:
```ts
// Discovery-wide types, diagnostic codes, and the priority / failure-mode /
// slash-name tables shared by discovery-walk.ts's own concerns (per-source
// enumeration, the settings `thetaPaths` sub-walk, the five-source driver)
// and by discovery-collision-resolve.ts's cross-source/format collision
// resolution (PTQ-0333). Split out of discovery-walk.ts as PTQ-0305's Seam 0
// — the leaf every one of those concerns depends on at runtime (collision
// resolution alone reads `PRIORITY` eleven times plus four of the codes
// below), so it had to move first: moving any of the others out first would
// have created a host<->module runtime import cycle. This module imports
// nothing from discovery-walk.ts or discovery-collision-resolve.ts.
```

`src/discovery/discovery-collision-resolve.ts:19-31` — the module's own
import list, confirming which of `discovery-model.ts`'s value exports it
actually pulls in:
```ts
import {
  CASE_COLLISION,
  CROSS_FORMAT_COLLISION,
  CROSS_SOURCE_SHADOW,
  INVALID_SLASH_NAME,
  PRIORITY,
  SLASH_NAME,
  UNREADABLE_FILE,
  type DiscoveredTheta,
  type DiscoverySource,
  type PiOwnedCommand,
  type SourcedCandidate,
} from "./discovery-model";
```

`PRIORITY[` read-site count. Command: `grep -o "PRIORITY\[" src/discovery/discovery-collision-resolve.ts | wc -l` → output `9`. Command: `grep -n "PRIORITY\[" src/discovery/discovery-collision-resolve.ts` → every counted site:
```
173:    if (existing === undefined || PRIORITY[candidate.source] < PRIORITY[existing.source]) {
186:  if (PRIORITY[a.source] !== PRIORITY[b.source]) return PRIORITY[a.source] - PRIORITY[b.source];
254:    const minPriority = Math.min(...group.map((candidate) => PRIORITY[candidate.source]));
255:    const topTier = group.filter((candidate) => PRIORITY[candidate.source] === minPriority);
256:    const lowerTier = group.filter((candidate) => PRIORITY[candidate.source] !== minPriority);
```
(Line 173 contributes 2 reads, line 186 contributes 4, lines 254/255/256 contribute 1 each: 2+4+1+1+1 = 9, matching the `grep -o` count.)

Diagnostic-code usage count. Command run once per one of the ten
`theta/load/*` constants `discovery-model.ts` exports — `for code in
MISSING_SOURCE UNREADABLE_SOURCE WRONG_TYPE_SOURCE UNREADABLE_FILE
CASE_COLLISION NON_CANONICAL_EXTENSION INVALID_SLASH_NAME CROSS_SOURCE_SHADOW
CROSS_FORMAT_COLLISION INVALID_EXTENSION; do grep -c "\b$code\b"
src/discovery/discovery-collision-resolve.ts; done` → output, one count per
name in the listed order:
```
MISSING_SOURCE: 0
UNREADABLE_SOURCE: 0
WRONG_TYPE_SOURCE: 0
UNREADABLE_FILE: 2
CASE_COLLISION: 2
NON_CANONICAL_EXTENSION: 0
INVALID_SLASH_NAME: 2
CROSS_SOURCE_SHADOW: 2
CROSS_FORMAT_COLLISION: 3
INVALID_EXTENSION: 0
```
Five names have zero occurrences (not present at all, so not "used" by any
reading); five have ≥2 occurrences (one import-list mention plus at least one
`code:` use). The five actually used, with their `code:`-value line numbers
via `grep -n`:
```
discovery-collision-resolve.ts:51:       code: CASE_COLLISION,
discovery-collision-resolve.ts:129:         code: INVALID_SLASH_NAME,
discovery-collision-resolve.ts:144:         code: UNREADABLE_FILE,
discovery-collision-resolve.ts:226:         code: CROSS_FORMAT_COLLISION,
discovery-collision-resolve.ts:264:         code: CROSS_FORMAT_COLLISION,
discovery-collision-resolve.ts:278:         code: CROSS_SOURCE_SHADOW,
```
Five distinct codes across six `code:` sites (`CROSS_FORMAT_COLLISION` is used
twice), not four.

## Why this is a problem
The header's parenthetical is the module's own stated justification for why
this leaf "had to move first" in the PTQ-0305 extraction sequence — a
quantitative claim about a sibling file's dependence on it. Both numbers in
that one clause are wrong against the current, split, ratified layout of
`discovery-collision-resolve.ts`: it is nine `PRIORITY` reads, not eleven,
and five distinct diagnostic codes, not four. A reader who opens
`discovery-collision-resolve.ts` to check the module-ordering rationale finds
counts that do not match what the header states.

## Suggested direction (non-binding, optional)
Correct the parenthetical to the counted values (nine and five) or drop the
specific numbers from the justification, since the ordering rationale itself
(this leaf's members are read by both siblings) does not depend on the exact
count.

## False-positive check
- Ran `grep -o "PRIORITY\[" src/discovery/discovery-collision-resolve.ts | wc -l` → `9`, and `grep -n "PRIORITY\["` to confirm the five distinct line sites shown above sum to nine.
- Ran `grep -c "\b$code\b"` for each of the ten exported `theta/load/*` code constants individually against `discovery-collision-resolve.ts` (full output quoted above) — five return `0`, five return `≥2`; ran `grep -n` on the five live ones to confirm each appears as an actual `code:` value (not just prose) at the six sites quoted above.
- Checked `quality/issues/`, `quality/resolved/`, and the wave's do-not-refile list for any existing filing on this exact PRIORITY/code count claim: no match. A prior D2 wave (`qw20260914091051`, logged in `quality/REVIEW_LOG.md`) had independently drafted this identical PRIORITY-count observation ("claims eleven reads, actual nine") but lost it to a tool-budget exhaustion before writing any intake file — no `quality/intake`, `quality/issues`, or `quality/resolved` file for it exists today, so this is not a re-filing.
- This is a header-accuracy claim, not a deadness claim: `PRIORITY` and all five diagnostic codes are live, load-bearing reads inside `discovery-collision-resolve.ts` (confirmed above), so nothing here proposes treating any of them as unreachable.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced (grep -o "PRIORITY\[" = 9, five distinct code: identifiers, not eleven/four) at both the current tip and the introducing commit ae8b6e05, matching confirmed precedent PTQ-0338's stale-count class. (triage: claude-opus-5)
