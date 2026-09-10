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
verdict: questionable — all three cites reproduce (:510 decl, :558 sole write of literal `true`, :572 sole read, single commit a13ef7fc, no other writer), but nothing is dead: the write is load-bearing for all resolution and the boolean backs the live `ThetaLibDirectoryProbe.entryReadable` contract (src/parser/imports.ts:200/:256, value varies in the double at tests/imports.test.ts:77), and bug 0428 (fixed 0.421.0) pins probe-side `readable=false` as un-implemented §Fix Option 2 while calling the combined route "the coherent end state", so Map→Set is a type-shape call a human should rule (triage: claude-opus-5)
verdict: questionable — re-verified independently: every cite reproduces (:510 decl, :558 sole write of literal `true`, :572 sole read; 3 src hits, class unexported at :506, one `new` at :699, no dynamic access, single commit a13ef7fc) and the observation is if anything understated — each `resolve` is paired with a `precache` of the same `(spec, fromFile)` (:783/:870/:1106/:1188/:1297/:1908) and the resolver checks `entries`+`includes` before `entryReadable` (src/parser/imports.ts:253-256), so for this probe the `?? false` arm is unreachable and `readableCache` is a pure projection of `entriesCache`; but the anchor is not settled cruft: the boolean is the storage mirror of a seam contract built for readability to vary (imports.ts:199-200, varied by the double at tests/imports.test.ts:77), and bug 0428 §Fix names the probe-side `readable=false` route (Option 2) part of "the coherent end state" while its 0.421.0 disposition pins it not-implemented, so the D2 brief's constant-value criterion and its own "no second one in sight" qualifier pull opposite ways on a behaviour-neutral Map→Set — owner intent for Option 2 decides it (triage: claude-opus-5)
verdict: questionable — independently re-verified against current source: decl/write/read reproduce content-identical at :504/:552/:566 (drift only), grep confirms exactly 3 src hits and no other writer, class is unexported with one `new` at :693, and `git log -S readableCache` shows only a13ef7fc; the resolver's entries-then-entryReadable order (src/parser/imports.ts:230-237) confirms the `?? false` arm is unreachable for this probe, so the value truly never varies — but docs/bugs/0428's own "Fix" section calls per-entry probe-side unreadability "Option 2", pins it "not implemented" (0.421.0 shipped Option 1 alone), and names the combined 1+2 route "the coherent end state", while the live interface already varies in a test double (tests/imports.test.ts:77) — so collapsing to a Set forecloses a named, still-open architectural option rather than removing settled dead cruft, which is an owner call, not a mechanical defect (triage: claude-opus-5)
verdict: questionable — independently reconfirmed: decl/write/read reproduce at :504/:552/:566, exactly 3 repo-wide hits, single unexported class with one `new` (:693), and `git log -S readableCache` returns only a13ef7fc, and I traced the call order myself (imports.ts:230-237) to confirm the `?? false` arm is genuinely unreachable in production, so the constant-true claim holds; but the anchor is not proven-settled cruft — bug 0428's shipped disposition explicitly labels the probe-side per-entry check "Option 2" of "the coherent end state" and pins it "not implemented" rather than rejected, and the `ThetaLibDirectoryProbe` contract already varies in a test double (tests/imports.test.ts:77) — so whether to collapse the Map now or preserve the shape for that named, still-open option is a product/architecture call, not a mechanical one (triage: claude-opus-5)
