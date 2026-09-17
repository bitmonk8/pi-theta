---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: refuseDivergedChildCallables realpath-canonicalises every discovered theta to serve a lookup bounded by one root's own tools list
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:1792-1799
  - src/extension/production-composition.ts:1802-1828
  - src/extension/production-composition.ts:1663-1671
  - src/extension/production-composition.ts:845-858
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-composition.ts#refuseDivergedChildCallables # D8 only: the exemption key
wave: qw20260917045205
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-17
---

# refuseDivergedChildCallables realpath-canonicalises every discovered theta to serve a lookup bounded by one root's own tools list

## Observation
`refuseDivergedChildCallables` builds a full `path → ParsedTheta` index by calling `fs.realpath` on every single theta this compose pass discovered and composed, before it ever looks anything up in that index. The lookups it then performs are bounded by the marked root's OWN `tools:` entry count (one `.theta` file's own declared callable list), not by the size of the index it just built.

## Evidence
**The unconditional, whole-workspace canonicalisation loop — production-composition.ts:1792-1799:**
```ts
    const thetaByCanonicalPath = new Map<string, ParsedTheta>();
    for (const theta of thetas) {
      if (theta.sourcePath === undefined) {
        continue;
      }
      const canonical = (await fs.realpath(theta.sourcePath)).replace(/\\/g, "/");
      if (!thetaByCanonicalPath.has(canonical)) {
        thetaByCanonicalPath.set(canonical, theta);
      }
    }
```

**The lookup that index serves, bounded by one file's own `tools:` list — production-composition.ts:1802-1810 (of 1802-1828):**
```ts
    for (const [presentedName, resolved] of markedRoot.callableSet.entries) {
      if (
        resolved.kind !== "theta" ||
        !marshalled.has(presentedName) ||
        byName.has(presentedName)
      ) {
        continue;
      }
      const sources = await collectCallableClosureSources(
        fs,
        ctx,
        parseDeps,
```

**The data size at the call site — `thetas` is this pass's WHOLE discovered/composed set, not a per-root subset — production-composition.ts:1663-1671 (the call) and 845-858 (where that set is built, all five discovery sources unioned in one `discoverThetas` call):**
```ts
  const survivors = await refuseDivergedChildCallables(
    thetas,
    fileSystem,
    ctx,
    parseDeps,
    sink.emit,
    subagentRootRegime,
    controlPlaneEnv,
  );
```
```ts
  const walk = await discoverThetas({
    fs: fileSystem,
    settings,
    cliPaths,
    piOwnedNames,
    markedRoot,
    packageCandidates: packageWalk.thetas.map((pkg) => ({
      path: pkg.path,
      stem: pkg.name,
      descriptorValue: pkg.descriptorValue,
    })),
  });
  sink.emitGroup(walk.diagnostics);
  const discovered: DiscoveredTheta[] = [...walk.thetas];
```
`thetas` (passed at 1664) is populated by `thetas.push(...)` (line 1646) inside `for (const input of parsedInputs)` (line 1321), where `parsedInputs` is built by parsing every entry of `discovered` (line 1308/1321) — i.e. every theta the CLI, settings, project, package, and global sources contributed and that survived load. `markedRoot.callableSet.entries`, by contrast, is the ONE marked-root theta's own resolved `tools:` list (frontmatter-fields-a.md `tools:` — an author-written array on a single file).

## Why this is a problem
The cost shape is one `fs.realpath` syscall per member of the WHOLE discovered-theta set (N, workspace-scale — every `.theta` across all five discovery sources) to build an index consulted only for the M entries of ONE file's own `tools:` list (M ≤ N, typically far smaller: an author-written per-file array). The index is built unconditionally and eagerly, before any of its M consumers run, so the cost is paid in full even when M is 0 or 1. This runs once per subagent child spawn (every time `regime.active` with a marked root and marshalled hashes — i.e. every child process's own discovery pass), so a program that spawns many subagent children pays this N-sized cost once per spawn. The codebase's own established idiom for the same class of problem — "does this on-disk name match this reference, allowing for case-folding" — is byte-exact-first-then-bounded-fallback (`onDiskFileCandidate` in `discovery-source-enumerate.ts`, `onDiskCalleeName` in this same file), which pays no `realpath` at all for the common byte-exact case; this function instead pays the expensive canonicalisation for every candidate regardless of whether a cheap byte-exact match would have resolved it.

## Suggested direction (non-binding, optional)
Unproven hypothesis: canonicalise lazily — resolve only the M callee paths actually named by `markedRoot.callableSet.entries` (already done, at the `calleeCanonical` computation immediately below the cited index build) and search for a match against the discovered set's own (non-canonicalised) `sourcePath` strings first, falling back to `realpath`-based comparison only for the entries that do not resolve by byte-exact string match — mirroring this file's own byte-exact-then-fold pattern instead of indexing the whole set up front.

## False-positive check
Traced `thetas`' provenance from its declaration (line 1308) through the discovery call (845-858, all five sources) and the per-input compose loop (1321-1646) to confirm it is genuinely the whole pass's discovered set, not a pre-filtered per-root list — read, not assumed. Confirmed `markedRoot.callableSet.entries` is scoped to the ONE marked root's own frontmatter `tools:` resolution (`resolveThetaToolsAtLoad`/`resolveCallableSet`, read earlier in this same file), i.e. bounded by one file's own author-written array, independently of `thetas`' size. Searched the already-filed list for "diverged", "canonical", "realpath index" — no match; `PTQ-0348-closure-hash-recomputed-per-caller.md` and `PTQ-0349-nested-tools-containment-probed-twice.md` are the nearby closure-hash/containment-probe caching findings on this same file, but neither concerns this canonicalisation loop or its N-vs-M shape. Checked the D8 exemption list (`discovery-walk.ts#enumerateDirectory`, `production-theta-producer.ts#firstAdmittingArmProperties`) — neither is this host. Checked for a stated rationale: the surrounding comment (bug 0329 coordination note) explains WHY canonical comparison is needed (a case-insensitive host must not miss a mis-cased `tools:` spelling) but does not address WHY the whole discovered set is canonicalised up front rather than only the entries actually looked up, so the D2/D8 rationale-stated-knob carve-out does not cover this specific shape. No `docs/spec_topics/` clause was found requiring this eager, whole-set form, so no `challenges_spec` applies.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: thetaByCanonicalPath (1792-1799) realpath-indexes the WHOLE discovered/composed set (confirmed workspace-scale: discoverThetas unions all five sources at 845-858, markedRoot only picks a collision winner and never narrows enumeration) to serve the lookup at 1802-1828 bounded by markedRoot.callableSet.entries (confirmed frozen to ONE theta's own tools: array, no ambient inheritance, src/parser/callable-set.ts); not exempted (exemptions.json has no production-composition.ts row), not a duplicate of PTQ-0348/PTQ-0349 (both independently re-read in full, neither touches this canonicalisation loop), and no docs/spec_topics clause pins the eager whole-set form (only docs/bugs/0329's §Fix, which rationalises canonical comparison itself, not building it over N instead of M) — but per the D8 heavier-than-scale rule the lazy-vs-eager reshape is a design decision for a human ruling (triage: claude-opus-5)
