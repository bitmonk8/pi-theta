---
id: PTQ-0298
title: discovery-walk.ts rebuilds the same Map bucket-grouping loop four times
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1039-1048
  - src/discovery/discovery-walk.ts:1143-1152
  - src/discovery/discovery-walk.ts:1152-1162
  - src/discovery/discovery-walk.ts:428-442
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260913183958
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-13
---

# discovery-walk.ts rebuilds the same Map bucket-grouping loop four times

## Observation
`discovery-walk.ts` builds a `Map<K, V[]>` "bucket" grouping four separate
times: in `resolveCaseCollisions`, `resolveBySource`, and twice inside
`resolveSlashNames` (once over `piOwned`, once over `candidates`). Each site
follows the identical four-step idiom — declare the map, iterate a source
array, `get` the bucket for the current item's key, and either `set` a new
one-element array or `push` onto the existing bucket. Three of the four are
byte-for-byte the same shape (the clone map's G083, 61 tokens,
renamed-only(11)); the fourth (`resolveCaseCollisions`) inserts one extra
key-derivation statement ahead of the `.get`, which is why the mechanical
scanner's position-for-position window does not fold it into G083, but the
loop body on both sides of that insertion is the same idiom.

## Evidence

Site 1 — `resolveBySource`, src/discovery/discovery-walk.ts:1039-1048 (G083 occurrence):
```ts
  const bySource = new Map<DiscoverySource, SourcedCandidate[]>();
  for (const candidate of candidates) {
    const bucket = bySource.get(candidate.source);
    if (bucket === undefined) {
      bySource.set(candidate.source, [candidate]);
    } else {
      bucket.push(candidate);
    }
  }
  const out: SourcedCandidate[] = [];
```

Site 2 — `resolveSlashNames`'s Pi-owned index, src/discovery/discovery-walk.ts:1143-1152 (G083 occurrence):
```ts
  const piOwnedByName = new Map<string, PiOwnedCommand[]>();
  for (const command of piOwned) {
    const bucket = piOwnedByName.get(command.name);
    if (bucket === undefined) {
      piOwnedByName.set(command.name, [command]);
    } else {
      bucket.push(command);
    }
  }
  const byName = new Map<string, SourcedCandidate[]>();
```

Site 3 — `resolveSlashNames`'s name index, src/discovery/discovery-walk.ts:1152-1162 (G083 occurrence):
```ts
  const byName = new Map<string, SourcedCandidate[]>();
  for (const candidate of candidates) {
    const bucket = byName.get(candidate.stem);
    if (bucket === undefined) {
      byName.set(candidate.stem, [candidate]);
    } else {
      bucket.push(candidate);
    }
  }

  const thetas: DiscoveredTheta[] = [];
```

Site 4 — `resolveCaseCollisions`, src/discovery/discovery-walk.ts:428-442 (same idiom, one inserted statement — not a G083 occurrence, found by reading rather than by the scanner):
```ts
function resolveCaseCollisions(
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): SourcedCandidate[] {
  const groups = new Map<string, SourcedCandidate[]>();
  for (const candidate of candidates) {
    const key = normalizePath(candidate.path).toLowerCase();
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [candidate]);
    } else {
      bucket.push(candidate);
    }
  }
  const survivors: SourcedCandidate[] = [];
```

Diff verdict: sites 1-3 are **renamed-only** (clone-map group G083 — 61 tokens,
"renamed-only (11)" — the only cross-occurrence differences are the map/bucket
identifier names and the key-accessor expression: `candidate.source` /
`command.name` / `candidate.stem`); site 4 carries the identical
declare-map/iterate/get-or-set-else-push skeleton with one statement
(`const key = normalizePath(candidate.path).toLowerCase();`) inserted before
the `.get`, which is exactly the kind of edit that defeats the scanner's
positional-equality window without changing the underlying idiom.

## Why this is a problem
All four sites exist to feed this file's own collision/dedup machinery
(DISC-3 case-collision, the cross-source-shadow / cross-format-collision
resolution, and the Pi-owned-name guard), an area this file has already had to
patch more than once for exactly this kind of bug: bug 0331
(`dedupeByIdentity`, discovery-walk.ts:1106-1116, further down the same file) had to add a second grouping
pass because a single candidate could reach the walk through more than one
source path, and bug 0459/0461 (`collisionPathOrder`, `renderDescriptor`)
had to fix ordering and descriptor-rendering inconsistencies across these same
grouping sites. That history is direct evidence that the grouping mechanic in
this file is not "obviously correct, never touched again" boilerplate — it is
exactly the kind of code that has needed a coordinated fix across sites
before. If the bucket-building rule needs another such fix (for example, a
key-normalisation change, or replacing the hand-rolled get-or-push with
`Map.groupBy`/an upsert helper that changes iteration-order guarantees), a
maintainer has to find and repeat the edit in four places by hand; nothing in
the file cross-references the sibling occurrences the way, for instance,
`globMatches` in `discovery-walk.ts` explicitly notes it "Mirrors `matchesGlob`
(package-discovery.ts)". This is load-bearing duplication, not incidental
boilerplate: the four call sites are the mechanism the file's own collision
diagnostics depend on being consistent with each other.

## Suggested direction (non-binding, optional)
A single local `groupBy<T, K>(items, keyOf)` helper — local to
discovery-walk.ts, or lifted beside the other shared DISC-2/DISC-5 helpers in
`discovery-path-classify.ts` this file already imports from — would let each
call site read as one line ("group by source" / "group by name" / "group by
lower-cased path") instead of an eight-to-ten-line loop, and would confine a
future change to the bucket-building rule to one place instead of four.

## False-positive check
- Clone-map re-verification: re-ran `clone-scan.mjs map --files
  <shard-manifest>` against this shard; G083 reproduces exactly as given —
  `61 tokens — renamed-only (11) —
  src/discovery/discovery-walk.ts:1039-1048, :1143-1152, :1152-1162` — and the
  three cited spans were re-read immediately before filing and match the
  current file byte-for-byte.
- Fourth-site verification: `resolveCaseCollisions` (src/discovery/discovery-walk.ts:428-442)
  was located by reading (not by the scanner) and re-read immediately before
  filing; it is not listed under G083 because of the inserted `const key = …`
  line, confirmed by direct comparison against sites 1-3's token shape.
- Both-live check: all four functions are called from
  `discoverThetas`/`resolveSlashNames`'s own production body in this file
  (`resolveBySource` at the `caseResolved = resolveBySource(...)` call,
  `resolveCaseCollisions` from inside `resolveBySource`'s loop, and both
  `resolveSlashNames` indices inline in its own body) — none is a dead copy.
- Carve-out check: this is ordinary application logic (a JS/TS `Map`
  bucket-build), not a spec-normative reference-vector table the spec itself
  repeats, so the normative-vectors carve-out does not apply; it is a single
  function's loop body repeated by copy-paste, not two AST passes switching
  over `Expr`/`Stmt` kinds, so this is filed as `clone`, not `parallel`.

## Triage
verdict: confirmed — sites 1-3 verified verbatim at cited lines and `clone-scan.mjs map` reproduces G083 (61 tokens, renamed-only(11)) at exactly discovery-walk.ts:1039-1048/:1143-1152/:1152-1162; site 4 (resolveCaseCollisions:428-442) manually diffed and confirmed the identical declare-map/iterate/get-or-set-else-push idiom with one inserted key-derivation line, explaining the scanner's miss; all four sites are live (resolveBySource called at :955, resolveCaseCollisions inside it at :1050, both resolveSlashNames indices inline at :1143/:1152), none is a spec-normative vector table, and bugs 0331/0459/0461 corroborate this grouping/collision area's history of needing coordinated multi-site fixes (triage: claude-opus-5)
