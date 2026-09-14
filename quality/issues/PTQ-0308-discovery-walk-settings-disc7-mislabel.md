---
id: PTQ-0308
title: discovery-walk.ts labels its settings-thetaPaths entry-schema section "DISC-7", the spec rule for Merge semantics implemented in settings.ts, not here
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:470
  - src/discovery/discovery-walk.ts:640-645
  - src/discovery/discovery-walk.ts:842-844
  - docs/spec_topics/discovery/package-and-settings.md:58-61
  - docs/spec_topics/discovery/package-and-settings.md:87-93
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# discovery-walk.ts labels its settings-thetaPaths entry-schema section "DISC-7", the spec rule for Merge semantics implemented in settings.ts, not here

## Observation
discovery-walk.ts labels the section and the function that turn settings
`thetaPaths` entries into `.theta` candidates as "DISC-7 `thetaPaths` entry
schema" / "the DISC-7 `thetaPaths` schema" (three sites). In the cited spec
document, `discovery/package-and-settings.md`, the identifier DISC-7 is
anchored to a single, differently-named rule — "Merge semantics," the
project-over-global JSON deep-merge/array-replace rule — which is applied to
`thetaPaths` in settings.ts's `mergeSettings`, not in discovery-walk.ts. The
`thetaPaths` entry-schema subsection this code implements (type, resolution
base, directory/file handling, override grammar) carries no DISC identifier
of its own in the spec, and its own override-grammar bullet cites DISC-5, not
DISC-7, as its authority — the same DISC-5 discovery-walk.ts's own comments
already cite correctly, immediately beside each wrong "DISC-7" label.

## Evidence
src/discovery/discovery-walk.ts:470 (section header):
```ts
// --------------------------------------------------------------------------
// Settings `thetaPaths` resolution (DISC-7 `thetaPaths` entry schema).
//
// Unlike the CLI / conventional sources (whose entries are single directory
// roots or explicit `.theta` files), settings entries resolve relative to the
// settings-file directory, support globs, and carry the `!`/`+`/`-` override
// grammar of DISC-5 (the same fixed order the package `pi.theta` path uses:
```

src/discovery/discovery-walk.ts:640-645 (function doc):
```ts
/**
 * Resolve the Settings source's `thetaPaths` into raw `.theta` candidates,
 * applying the DISC-5 override order and the DISC-7 `thetaPaths` schema. Returns
 * candidates deduplicated by resolved absolute path; per-entry failures are
 * non-fatal.
 */
```

src/discovery/discovery-walk.ts:842-844 (inline comment at the settings-tier
call site):
```ts
  // Settings (priority 2) — explicit references resolved per the DISC-7
  // `thetaPaths` entry schema: relative to the settings-file dir, with globs and
  // the `!`/`+`/`-` override grammar; missing/wrong-type are errors.
```

docs/spec_topics/discovery/package-and-settings.md:58-61 — DISC-7's actual
definition (a merge rule, unrelated to entry parsing):
```md
<a id="disc-7"></a> **DISC-7.** **Merge semantics.** Project values override global values with **deep merge for nested objects, replace for arrays and scalars** — the same rule documented for Pi's own settings in `@earendil-works/pi-coding-agent/docs/settings.md`. Specifically:

- Object values are merged key-by-key; keys present in both are merged recursively, keys present only in one are kept as-is.
- Array values are replaced wholesale (the project array, if present, fully replaces the global array; entries are not concatenated or deduplicated).
```

docs/spec_topics/discovery/package-and-settings.md:87-93 — the un-numbered
`thetaPaths` entry-schema subsection, whose own override-grammar bullet
names DISC-5, not DISC-7:
```md
### `thetaPaths` entry schema

The `thetaPaths` array follows the same conventions Pi uses for its sibling resource arrays (`extensions`, `skills`, `prompts`, `themes`) — see the *Resources* section of `@earendil-works/pi-coding-agent/docs/settings.md`. Specifically:

- **Type.** `string[]`. Each entry is a file path or a directory path. Object-form entries are not accepted in theta 1.0; a non-string entry is rejected with `theta/load/settings-invalid-entry` (severity `error`) and the offending entry does not contribute thetas — other entries in the array still process.
- **Resolution.** Paths in `~/.pi/agent/settings.json` resolve relative to `~/.pi/agent/`; paths in `.pi/settings.json` resolve relative to `.pi/`. `~` expands per [Home-directory expansion](./discovery-sources.md#home-directory-expansion). Absolute paths are accepted as-is.
- **Glob patterns and exclusions.** Glob patterns are supported. A leading `!` excludes paths matching the pattern; a leading `+` force-includes an exact path; a leading `-` force-excludes an exact path. The glob matcher, the `!`/`+`/`-` override ordering, and the exact-path treatment of `+`/`-` operands follow the contract pinned at [DISC-5](#disc-5) (the resolution base differs — `thetaPaths` entries resolve relative to the settings file's directory per *Resolution* above, not a package root).
```

For contrast, settings.ts — the file that actually implements the DISC-7
merge rule — cites DISC-7 narrowly, for the merge-derived consequence, not
for entry parsing (src/discovery/settings.ts:58-61):
```ts
  * The settings-file directory the `thetaPaths` entries resolve relative to
  * (DISC-7 `thetaPaths` resolution): the origin dir of whichever file supplied
  * the surviving array — project `<cwd>/<config-dir>` or the global
  * `FileSystem.globalAgentDir()`.
```

## Why this is a problem
DISC-7 is a specific, anchored spec rule ("Merge semantics": project values
replace global values for arrays/scalars, deep-merge for objects) that
discovery-walk.ts's `resolveSettingsSource` does not implement — it consumes
`settings.thetaPaths` as a single, already-merged array (the merge itself
happens in settings.ts's `mergeSettings`, which is the module that correctly
cites DISC-7). The mechanism discovery-walk.ts's three cited comments are
actually describing — per-entry type/resolution/glob/override-grammar
handling of that already-merged array — is the spec's un-numbered `thetaPaths`
entry schema subsection, whose own override-grammar clause attributes itself
to DISC-5, the same identifier these three comments already cite correctly a
few words away. A reader following "DISC-7" from any of the three
discovery-walk.ts sites to find the rule governing entry parsing lands on the
Merge-semantics paragraph instead, which says nothing about directories,
`.theta` extensions, or the `!`/`+`/`-` grammar.

## Suggested direction (non-binding, optional)
Drop the "DISC-7" label from the three discovery-walk.ts sites (or replace it
with a reference to the un-numbered `thetaPaths` entry schema subsection by
name), leaving the existing, correct DISC-5 citations in place.

## False-positive check
Confirmed DISC-7's anchor and text in
docs/spec_topics/discovery/package-and-settings.md:58-61 (quoted above) name
only the merge rule. Confirmed the `thetaPaths` entry schema subsection
(package-and-settings.md:87-99) carries no `<a id="disc-*">` anchor of its
own and its own override-grammar bullet (line 93) cites `[DISC-5](#disc-5)`.
Searched `docs/spec_topics` for any other anchor or heading naming
`thetaPaths` entry schema as DISC-7 — none exists. Searched
`src/discovery/discovery-walk.ts` for every "DISC-7" occurrence
(`grep -n "DISC-7"`) — exactly the three sites cited. Checked settings.ts's
own three "DISC-7" occurrences (settings.ts:7, :17, :60, :80, :89, :386) and
confirmed each is about the merge rule itself or a direct consequence of it
(which settings file's `thetaPaths` array survived the merge), not about
entry parsing — the contrast excerpt above is the clearest of these. This is
a header/comment-accuracy claim, not a deadness claim, so no reference or
reachability search applies; the code the mislabelled comments describe
(`resolveSettingsSource` and its section) is live and unchanged by this
finding.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified all 5 cited excerpts verbatim; DISC-7's sole anchor (package-and-settings.md:58, corroborated independently by discovery-cli.md's provenance list and tests/settings-merge.test.ts's own "DISC-7 settings merge semantics" describe block) is Merge semantics, the un-numbered thetaPaths entry-schema subsection cites DISC-5 not DISC-7 for its override grammar, and discovery-walk.ts's own module header cites DISC-1…DISC-4 while documenting it only consumes V10c's already-merged thetaPaths — the three DISC-7 labels are a real mislabel (triage: claude-opus-5)
