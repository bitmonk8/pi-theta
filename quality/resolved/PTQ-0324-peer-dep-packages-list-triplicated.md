---
id: PTQ-0324
title: The four-package peer-dependency lock-step list is hardcoded independently in three src/extension modules instead of importing capability-probe.ts's exported copy
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/capability-probe.ts:152-157
  - src/extension/inventory-closure-audit.ts:46-51
  - src/extension/version-bump-gates.ts:193-198
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260914091051
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-14
---

# The four-package peer-dependency lock-step list is hardcoded independently in three src/extension modules instead of importing capability-probe.ts's exported copy

## Observation
`capability-probe.ts` declares and exports `PEER_DEP_PACKAGES`, the closed,
ordered, four-element array of `@earendil-works/*` peer packages that Step 0
(d) of the runtime capability probe iterates in lock-step. `inventory-closure-audit.ts`
and `version-bump-gates.ts` each independently declare their own array literal
holding the identical four strings in the identical order, rather than
importing `capability-probe.ts`'s export. All three files live under
`src/extension/`.

## Evidence
src/extension/capability-probe.ts:152-157 — the exported, canonical copy:
```ts
export const PEER_DEP_PACKAGES: readonly string[] = Object.freeze([
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
]);
```

src/extension/inventory-closure-audit.ts:46-51 — an independent, unexported copy:
```ts
const PEER_PACKAGES = [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
] as const;
```
Live, not dead: read at `inventory-closure-audit.ts:133`
(`return PEER_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`));`).

src/extension/version-bump-gates.ts:193-198 — a third independent copy, inline
inside the exported `peerDependencyPinFailures`:
```ts
  const pinnedPackages: readonly string[] = [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
  ];
```
Live: the very next line iterates it (`for (const pkg of pinnedPackages)`) to
build the step-4 `peerDependencies` literal-read gate's failure list.

Diff verdict: **identical** — all three arrays hold the same four strings in
the same order; only the declaration syntax (`Object.freeze([...])` vs.
`[...] as const` vs. a plain `[...]`) and the export/visibility differ. Not
present in the clone-map (the four short string-literal lines fall below the
scanner's token-window floor); found by reading, per the brief's "hunt the
parallel class by reading" instruction, since it is exact-literal clone
territory rather than mirrored-mechanism territory.

Neither non-canonical copy imports from `capability-probe.ts`:
`grep -n "^import" src/extension/inventory-closure-audit.ts` shows only
`typescript` and a type import from `./sdk-inventory`;
`src/extension/version-bump-gates.ts` imports only `SDK_SURFACE_INVENTORY`
from `./sdk-inventory`. Neither module names `capability-probe` anywhere.

The codebase already has, and uses, the fix for this exact drift class on a
sibling list in the same declaring file: `capability-probe.ts`'s
`FACTORY_PROBED_SDK_MEMBERS` doc comment states it is "The single declaration
site … `sdk-inventory.ts`'s `SDK_SURFACE_INVENTORY` builds its matching
`namespace-function` rows from — so the runtime probe and the build-time
inventory cannot drift apart", and `sdk-inventory.ts:34` does
`import { FACTORY_PROBABLE_CAPABILITIES, FACTORY_PROBED_SDK_MEMBERS } from "./capability-probe";`.
The same shared-import treatment was not applied to `PEER_DEP_PACKAGES`.

## Why this is a problem
`docs/spec_topics/pi-integration-contract/host-prerequisites.md#pi-sdk-pin`
states this list has exactly **one** normative source ("This anchor
(`#pi-sdk-pin`) is the single source of truth for both literals in the spec
corpus") and names exactly **one** "legitimate restatement site" for it
outside that anchor — the `package.json` manifest, which "npm consumes …
mechanically" and is not TypeScript source. PIC-33 ("Four-package lock-step
co-move") requires the four packages to co-move together on any change. The
three TypeScript arrays here are not spec-sanctioned independent restatements
(the spec's own text rules that reading out for the `package.json` case only);
they are three unconnected code copies of one fact. Nothing enforces their
agreement: unlike a `Record<DiscoverySource, …>` or an exhaustive `switch`
over a closed union, a bare `string[]` gives the compiler no way to notice a
name added, dropped, or mistyped in one copy but not the others — a future
peer-package change could update the runtime probe (`capability-probe.ts`)
and silently leave the build-time audit allow-list
(`inventory-closure-audit.ts`) and/or the version-bump gate
(`version-bump-gates.ts`) reconciling against a stale set, or vice versa, with
no test or type error surfacing the gap. This is exactly the coordination risk
the author already recognised and closed for the sibling
`FACTORY_PROBABLE_CAPABILITIES` / `FACTORY_PROBED_SDK_MEMBERS` lists in the
same file, one paragraph away from `PEER_DEP_PACKAGES`.

## Suggested direction (non-binding, optional)
`capability-probe.ts`'s existing exported `PEER_DEP_PACKAGES` is the natural
shared home (hypothesis): the other two modules already import sibling
constants from `./capability-probe` and `./sdk-inventory` respectively, so an
import of `PEER_DEP_PACKAGES` would follow an established pattern rather than
introduce a new dependency direction.

## False-positive check
- Reference search: `grep -rn "@earendil-works/pi-agent-core" src --include=*.ts`
  and the companion greps for the other three package names, restricted to
  four-element array literals, return exactly these three declaration sites
  (plus unrelated single-package type imports elsewhere, which are not
  copies of this list).
- Both non-canonical copies are live (cited call sites above), not dead code —
  a D2 concern would not apply here.
- Spec-carve-out check: read `host-prerequisites.md#pi-sdk-pin`,
  `#pi-sdk-pin-manifest-lock-step`, and PIC-33 in full; the spec itself states
  there is one canonical site plus exactly one legitimate restatement
  (`package.json`, non-TypeScript), which rules out "the spec itself repeats
  this vector on purpose" for these three TypeScript-side copies.
- Import-graph check: neither `inventory-closure-audit.ts` nor
  `version-bump-gates.ts` imports anything from `capability-probe.ts` (full
  import lists inspected), so this is not a re-export already collapsing the
  three into one binding.
- Not generated, not tests/: all three files are hand-authored production
  `src/extension/*.ts`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all three excerpts verified byte-identical at the cited lines; both non-canonical copies are live (isPeerPackage called at inventory-closure-audit.ts:706, pinnedPackages feeds the tested/exported peerDependencyPinFailures); clone-scan.mjs shows no group (arrays fall below the 60-token floor, as claimed) and manual diff confirms identical 4-string content across all three; neither non-canonical file imports capability-probe.ts (import lists confirmed); the cited sibling fix (FACTORY_PROBED_SDK_MEMBERS export + sdk-inventory.ts:34 import, PTQ-0302) is real; d4_class: clone with a ready-made canonical export is a mechanical dedupe (triage: claude-opus-5)
