---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: CachingThetaLibProbe.readableCache is a Map<string, boolean> whose only write stores the literal true — the boolean payload never varies
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:510
  - src/extension/import-static-checks.ts:553-560
  - src/extension/import-static-checks.ts:571-573
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# CachingThetaLibProbe.readableCache is a Map<string, boolean> whose only write stores the literal true — the boolean payload never varies

## Observation
The module-private `CachingThetaLibProbe` (sole instantiation:
`checkThetaImports`, :699) keeps a `readableCache: Map<string, boolean>`. Its
single write site stores the literal `true` for every entry `readdir` listed;
the single read defaults to `false` for keys never written. The stored boolean
therefore never varies: the map answers only "was this name in the listing",
i.e. membership, and the `boolean` value dimension carries no information. The
write site's own comment records that the readability refinement the value was
shaped for is not exercised.

## Evidence
src/extension/import-static-checks.ts:510 — the declaration:
```ts
  private readonly readableCache = new Map<string, boolean>();
```

src/extension/import-static-checks.ts:553-560 — the only write, constant
`true`, with the comment conceding the refinement is unexercised:
```ts
    this.entriesCache.set(parent, names);
    if (names !== null) {
      for (const name of names) {
        // A byte-exact entry `readdir` listed is readable; the EACCES / broken-
        // symlink refinement is not exercised by the shipped host seam here.
        this.readableCache.set(`${parent}\u0000${name}`, true);
      }
    }
```

src/extension/import-static-checks.ts:571-573 — the only read:
```ts
  entryReadable(dir: string, name: string): boolean {
    return this.readableCache.get(`${dir}\u0000${name}`) ?? false;
  }
```

Reference search: `readableCache` across src/, tests/, tools/, extensions/,
docs/ — exactly the three lines above. The class is not exported (declared
`class CachingThetaLibProbe`, :506) and is instantiated once (:699), so no
other writer can exist.

## Why this is a problem
Vestigial value dimension: the single write site always passes the same value
(the lens's mechanical criterion for a vestigial flag/field), so the
`Map<string, boolean>` is a `Set<string>` in disguise — its type advertises a
per-entry readability verdict that the implementation never computes. The
actually-shipped unreadable-file handling lives elsewhere: an unreadable
parent directory is a `null` `entriesCache` entry (:548-552), and an
unreadable resolved file is caught at the `readBytes` seam (bug 0428,
`unreadablePaths`, :718-737) — both bypass this boolean entirely, which is why
it has had no varying writer since the class's introducing commit.

## Suggested direction (non-binding, optional)
The membership fact could be carried as a set (or answered off the already
cached `entriesCache` listing), letting `entryReadable`'s fail-closed
`false`-for-unlisted behaviour stand unchanged; the interface method itself
stays as `ThetaLibDirectoryProbe` requires.

## False-positive check
- Identifier search: `readableCache` across src/, tests/, tools/, extensions/,
  docs/ (all text file types) — 3 hits: declaration :510, write :558, read
  :572. No other write site exists anywhere.
- Escape check: `CachingThetaLibProbe` grep — class definition :506,
  instantiation :699, plus one test comment naming it
  (tests/b0361-case-variant-import-dir-identity.test.ts:396, prose only). The
  field is `private readonly`; no subclass or external mutation path exists.
- Interface-liveness check (not claimed dead): `entryReadable` is consulted by
  the resolver (src/parser/imports.ts:256,
  `if (!this.probe.entryReadable(parent, finalSegment))`), and test doubles
  implement their own probes returning `false`
  (tests/imports.test.ts:77) — the METHOD and its fail-closed `?? false`
  default are alive; this finding targets only the stored value's constant
  dimension inside this one implementation.
- Spec/fail-closed check: IMP-1's "exists but is not readable … likewise
  unresolvable" clause is served in the shipped pipeline by the
  `readBytes`-rejection route (bug 0428, `unreadableThetaLibDiagnostic`,
  same file :131-149 and :718-737), not by this boolean — confirmed by the
  write site's own comment and by
  tests/b0428-unreadable-thetalib-refused.test.ts:103, which notes the
  resolver's `entryReadable` refinement is not the route the shipped seam
  exercises.
- Git history intent: `git log -S "readableCache"` → one commit (a13ef7fc,
  the original IMP-1..7 wiring); the value has been the literal `true` since
  birth, never varied by any later commit.

## Triage
