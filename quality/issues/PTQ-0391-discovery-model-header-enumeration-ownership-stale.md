---
id: PTQ-0391
title: discovery-model.ts's header lists per-source enumeration as one of discovery-walk.ts's own concerns, though that code now lives in discovery-source-enumerate.ts
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-model.ts:1-4
  - src/discovery/discovery-source-enumerate.ts:1-6
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# discovery-model.ts's header lists per-source enumeration as one of discovery-walk.ts's own concerns, though that code now lives in discovery-source-enumerate.ts

## Observation
`discovery-model.ts`'s header states its contents are "shared by discovery-walk.ts's own concerns (per-source enumeration, the settings `thetaPaths` sub-walk, the five-source driver)". Per-source enumeration — `enumerateDirectory`/`resolveEntry`/`onDiskFileCandidate` — is not one of `discovery-walk.ts`'s own concerns any more: it was extracted into a dedicated sibling module, `discovery-source-enumerate.ts`, two days after this header sentence was written. The other two named concerns (the settings sub-walk, the five-source driver) do still live in `discovery-walk.ts`.

## Evidence
`src/discovery/discovery-model.ts:1-4` — the header's claim, grouping "per-source enumeration" with two concerns that do still live in `discovery-walk.ts`:
```ts
// Discovery-wide types, diagnostic codes, and the priority / failure-mode /
// slash-name tables shared by discovery-walk.ts's own concerns (per-source
// enumeration, the settings `thetaPaths` sub-walk, the five-source driver)
// and by discovery-collision-resolve.ts's cross-source/format collision
```

`src/discovery/discovery-source-enumerate.ts:1-6` — the dedicated module "per-source enumeration" now names, distinct from `discovery-walk.ts`:
```ts
// Per-source candidate enumeration and classification for the discovery
// walk: collecting a directory's byte-exact `*.theta` candidates
// (`enumerateDirectory`), resolving one source entry — a directory root or
// an explicit `.theta` file — into raw candidates (`resolveEntry`), and the
// bug 0363 on-disk-entry lookup an explicit file reference needs
// (`onDiskFileCandidate`), plus the shared per-source failure-diagnostic
```

## Why this is a problem
The sentence draws a contrast between concerns that belong to `discovery-walk.ts` ("its own") and the cross-source/format resolution that belongs to `discovery-collision-resolve.ts` — the author is being precise about current-file ownership elsewhere in the very same sentence — but one of the three items placed on the `discovery-walk.ts` side, "per-source enumeration," has since moved to a third file. A reader who goes looking inside `discovery-walk.ts` for the per-source enumeration logic this header promises finds only a re-import of already-built functions; the logic itself is in `discovery-source-enumerate.ts`. Commit `717e97c5` (2026-09-14, PTQ-0305's Seam 0 split) wrote this header sentence when per-source enumeration genuinely was implemented inside `discovery-walk.ts`; commit `46a063e0` (2026-09-16, PTQ-0367's split) moved that code out to a new file without revisiting this earlier sentence.

## Suggested direction (non-binding, optional)
Update the parenthetical at line 2 to attribute "per-source enumeration" to `discovery-source-enumerate.ts` rather than grouping it with the two concerns that remain `discovery-walk.ts`'s own.

## False-positive check
- Ran `grep -n "^export async function resolveEntry\|^export async function enumerateDirectory\|^export async function onDiskFileCandidate" src/discovery/discovery-walk.ts` → no matches; ran the same pattern against `src/discovery/discovery-source-enumerate.ts` → all three found there.
- Ran `git log -S"discovery-walk.ts's own concerns" --oneline -- src/discovery/discovery-model.ts` → one hit, `717e97c5` (2026-09-14), which introduced the still-current wording (its diff is the commit that created `discovery-model.ts` in the PTQ-0305 Seam 0 split, two days before per-source enumeration moved out of `discovery-walk.ts`).
- Ran `git show 46a063e0 --stat` (2026-09-16) → confirms this later commit's diff is `discovery-source-enumerate.ts` (+288 new lines) and `discovery-walk.ts` (net -277), the PTQ-0367 relocation of per-source enumeration; it does not touch `discovery-model.ts`.
- Confirmed the other two named concerns are still accurate: `resolveSettingsSource` and `discoverThetas` (the five-source driver) both remain declared in `discovery-walk.ts` today.
- Checked the do-not-refile list and `quality/resolved/`: no existing filing names this exact sentence in `discovery-model.ts`; the closest topic, PTQ-0356, covers a different sentence later in the same header (a `PRIORITY`/`SLASH_NAME` import-roster claim about `discovery-walk.ts` itself, not this file's own concern-attribution sentence at lines 1-4).
- This is a header-accuracy claim, not a deadness claim: `enumerateDirectory`/`resolveEntry`/`onDiskFileCandidate` remain live, exported, and called from `discovery-walk.ts`; nothing here proposes removing any declaration, only correcting which file's header claims ownership of this concern.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — reproduced: enumerateDirectory/resolveEntry/onDiskFileCandidate are absent from discovery-walk.ts and live in discovery-source-enumerate.ts, resolveSettingsSource/discoverThetas remain in discovery-walk.ts, and discovery-model.ts's header (finalized at ae8b6e05 2026-09-14, untouched by the 46a063e0 split on 2026-09-16) still misattributes per-source enumeration to discovery-walk.ts's own concerns; matches confirmed PTQ-0356/PTQ-0352 header-drift precedent in this same file, no duplicate found (triage: claude-opus-5)
