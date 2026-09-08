---
id: PTQ-0090
title: The discoverThetas doc block is stranded above projectSourceLabel and still says the walk covers four sources with the package source pending
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1134-1138
  - src/discovery/discovery-walk.ts:1151-1155
  - src/discovery/discovery-walk.ts:1283-1287
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The discoverThetas doc block is stranded above projectSourceLabel and still says the walk covers four sources with the package source pending

## Observation
A doc block describing `discoverThetas` sits at discovery-walk.ts:1134-1138,
immediately followed by a second doc block that documents
`projectSourceLabel` (1139-1150) and then `projectSourceLabel` itself
(1151-1153). `discoverThetas` (1155) therefore has no attached doc comment;
its intended one is stranded two declarations up. The stranded block also
states the walk covers "currently four" sources with the package source
belonging to a pending increment, while the module header calls this "the
five-source discovery walk" and the function body consumes
`input.packageCandidates` as the priority-4 package source.

## Evidence
src/discovery/discovery-walk.ts:1134-1141 — the stranded block, followed
directly by another `/**` block (doc tooling and readers attach a doc comment
to the next declaration, which is `projectSourceLabel`, not `discoverThetas`):
```ts
/**
 * Walk the (currently four — package source is V10b's) discovery sources,
 * resolve priority and collisions, and return the registrable thetas plus the
 * load-phase diagnostics.
 */
/**
 * The category label for the conventional project discovery root, threaded
 * only into `resolveEntry`'s `descriptor` parameter — whose sole read is the
```

src/discovery/discovery-walk.ts:1151-1155 — the declaration the stranded
block now precedes-at-a-distance, and the undocumented `discoverThetas`:
```ts
function projectSourceLabel(configDirName: string): string {
  return `project ${configDirName}/theta/`;
}

export async function discoverThetas(input: DiscoveryInput): Promise<DiscoveryResult> {
```

src/discovery/discovery-walk.ts:1283-1287 — the package source is wired into
this same function today (and `PRIORITY` at :119-126 carries `package: 4`;
the module header at :1 reads "the five-source discovery walk"):
```ts
  // Package (priority 4) — the candidates the composition's own bounded scan
  // already resolved, pushed in as ordinary SourcedCandidates so the same
  // adjudication chain below covers them (V10b: Option 1, route through walk).
  const packageSourceLabel = sourceLabelOf("package");
  for (const pc of input.packageCandidates ?? []) {
```

## Why this is a problem
Leftover narration detached from its subject, and stale on its facts. The
block was `discoverThetas`'s doc comment; `git log -S projectSourceLabel`
shows `projectSourceLabel` arriving with commit 7f360d20 ("run on Oh-My-Pi as
a second host"), which inserted the helper between the comment and its
function and left the comment dangling. Its content predates the package
source landing: commit 1d9be00e ("V10b — Package discovery (bounded walk)")
and 6bfe2532 ("package tier routes through the walk") delivered the very
wiring the comment says is still pending, and the module's own first line
contradicts the "currently four" count. In its current position a reader or
doc tool pairs a four-source description with a label helper, and the actual
five-source entry point renders undocumented.

## Suggested direction (non-binding, optional)
Reattach a truthful doc comment to `discoverThetas` (five sources, package
routed via `packageCandidates`) and delete the stranded block, or fold its
still-true sentence into the function's real doc.

## False-positive check
Verified the block is not `projectSourceLabel`'s doc: a second, complete
`/** … */` block (1139-1150) sits between it and that function, so the
stranded block documents nothing in attachment order. Verified staleness
against current code: `PRIORITY` (:119-126) includes `package: 4`;
`input.packageCandidates` is consumed at :1287-1295; the module header (:1)
says "five-source". Git intent check: 7f360d20 inserted
`projectSourceLabel`; 1d9be00e / 6bfe2532 landed and routed the package
source. Duplicate check against the filed corpus: grep for "currently four"
across `quality/` — no match;
`qw20260907130901-d2-06-detached-doc-comments.md` covers three sites in
`src/extension/production-theta-producer.ts` only;
`qw20260907130901-d2-05-conventional-root-descriptor-dead.md` is about the
`descriptor` parameter's unreachable read, not this comment block;
`qw20260907130901-d2-09-stale-tests-task-stub-narration.md` cites
discovery-walk.ts:11-16 (the module-header stub narration), not this block.

## Triage
verdict: confirmed — re-verified at :1134-1138/:1151-1155/:1283-1295: the block is followed by a second complete `/**` block, so it documents nothing and `discoverThetas` (:1155) is undocumented; `git show 070a1ef3` proves the block sat directly above the function and blame shows 7f360d20 inserted `projectSourceLabel` between them; its "package source is V10b's" is stale against 1d9be00e/6bfe2532, the :1 "five-source" header, `PRIORITY.package: 4` (:123) and the `input.packageCandidates` consumption (:1287); no filed candidate covers this block (d2-05 targets the adjacent `projectSourceLabel` doc/descriptor deadness, d2-06 is production-theta-producer.ts, d2-09 is the :11-16 module header, 202646-d2-02 is production-composition.ts) (triage: claude-opus-5)
