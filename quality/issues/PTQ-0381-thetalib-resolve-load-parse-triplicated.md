---
id: PTQ-0381
title: buildModuleScope, materializeChain, and the parseCache loop each re-implement the same probe.precache→loadThetaLibImport→parseThetaLib ritual
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:1464-1478
  - src/extension/import-static-checks.ts:1546-1560
  - src/extension/import-static-checks.ts:1736-1750
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260916144930
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-16
---

# buildModuleScope, materializeChain, and the parseCache loop each re-implement the same probe.precache→loadThetaLibImport→parseThetaLib ritual

## Observation
`buildModuleScope`'s per-import loop, `materializeChain`'s re-export-chain-follow loop, and
the post-walk `parseCache` loop (all three inside `checkThetaImports`,
`src/extension/import-static-checks.ts`) each resolve a `.thetalib` reference the identical
way: `probe.precache` the reference, `loadThetaLibImport` it, `continue` silently if not
registered or unresolved, `parseThetaLib` the resolved path, then `continue` silently if
parsing yields `undefined`. That five-step body is copy-pasted three times rather than shared.
A repo-wide count of the `probe.precache(` + `loadThetaLibImport(` pairing in this file finds
six occurrences total; the other three (the re-export-closure walker, the main
per-declaration loop, and the transitive graph walker) each continue differently on failure
(recursing, pushing a diagnostic inline, or tracking a graph edge) and are correctly excluded
from this clone — only the three cited here share the byte-identical silent-continue tail.

## Evidence

**Site 1 — `buildModuleScope`'s per-import loop, import-static-checks.ts:1464-1478** (clone-map
groups **G011** and **G023**; G011's own span additionally includes the enclosing loop header
at line 1463, `for (const stmt of body.statements) {`):
```ts
      if (stmt.kind !== "import" || !stmt.path.endsWith(".thetalib")) {
        continue;
      }
      await probe.precache(stmt.path, resolvedPath);
      const load = loadThetaLibImport(resolver, stmt.path, resolvedPath, {
        file: resolvedPath,
        range: stmt.range,
      });
      if (!load.registered || load.resolvedPath === undefined) {
        continue;
      }
      const sourceParsed = await parseThetaLib(load.resolvedPath);
      if (sourceParsed === undefined) {
        continue;
      }
```

**Site 2 — `materializeChain`'s re-export-chain loop, import-static-checks.ts:1546-1560**
(clone-map group **G023** only; the guard's first disjunct is shaped differently — see Diff
verdict):
```ts
      if (reExport.exported !== source || !reExport.fromPath.endsWith(".thetalib")) {
        continue;
      }
      await probe.precache(reExport.fromPath, resolvedPath);
      const load = loadThetaLibImport(resolver, reExport.fromPath, resolvedPath, {
        file: resolvedPath,
        range: reExport.range,
      });
      if (!load.registered || load.resolvedPath === undefined) {
        continue;
      }
      const sourceParsed = await parseThetaLib(load.resolvedPath);
      if (sourceParsed === undefined) {
        continue;
      }
```

**Site 3 — the post-walk `parseCache` loop (bug 0304 fixes 2/3), import-static-checks.ts:1736-1750**
(clone-map groups **G011** and **G023**; G011's own span additionally includes the enclosing
loop header at line 1735, `for (const stmt of parsedLib.document.body.statements) {`):
```ts
      if (stmt.kind !== "import" || !stmt.path.endsWith(".thetalib")) {
        continue;
      }
      await probe.precache(stmt.path, libResolvedPath);
      const load = loadThetaLibImport(resolver, stmt.path, libResolvedPath, {
        file: libResolvedPath,
        range: stmt.range,
      });
      if (!load.registered || load.resolvedPath === undefined) {
        continue;
      }
      const sourceParsed = await parseThetaLib(load.resolvedPath);
      if (sourceParsed === undefined) {
        continue;
      }
```

**Diff verdict: renamed-only for the load-and-parse ritual itself (the part all three clone-map
citations agree on); the preceding filter line differs in what it selects, not in how it
resolves.** Renames across the five-step ritual: `stmt`/`reExport` (the reference being
resolved); `stmt.path`/`reExport.fromPath` (the `.thetalib` path field); `stmt.range`/
`reExport.range` (the diagnostic range field); `resolvedPath`/`libResolvedPath` (the owning
file passed to `probe.precache`/`loadThetaLibImport` and echoed as `file:`). Every other
token — `probe.precache(`, `loadThetaLibImport(resolver, …)`, the `!load.registered ||
load.resolvedPath === undefined` guard, `parseThetaLib(load.resolvedPath)`, the
`sourceParsed === undefined` guard, and the silent `continue` on both guards — is
byte-identical across all three sites. The one line the scanner did not fold into a single
group (`stmt.kind !== "import" || !stmt.path.endsWith(…)` at sites 1/3 vs.
`reExport.exported !== source || !reExport.fromPath.endsWith(…)` at site 2) selects a
different kind of reference (an `import` statement vs. a re-export record matching a source
name) — a real, non-clone difference in what is being iterated, which is exactly why G011
(the version of the pattern that includes this filter line) has only 2 members while G023
(the version starting one line later, past the filter) has 3.

## Why this is a problem
All three sites exist to run the same step of imports.md's `.thetalib` resolution algorithm —
resolve a reference to a real library file and parse it — at three different points in
`checkThetaImports`'s pipeline (module-scope construction, re-export-chain following, and the
post-walk registration/symbol-check pass). This is load-bearing, not incidental: a change to
any part of the ritual — a new failure mode `loadThetaLibImport` can signal, a change to how
`probe.precache` must sequence relative to the load, or a new post-parse check — must land in
all three copies to keep those three pipeline stages resolving a `.thetalib` reference
identically; a copy missed by the fix would silently keep the old behaviour for whichever
stage it serves. This is not a hypothetical risk in this exact file: the `probe.precache`/
`loadThetaLibImport` pairing is a live patch target here — bug 0428 ("resolved but
unreadable") added a new branch after the load-succeeded check at three OTHER call sites in
this same file that pair the same two calls (the re-export-closure walker at :691, the main
per-declaration loop at :1038, and the transitive graph walker at :1407), each getting its own
hand-written copy of that branch. Whether the three sites cited in this finding also need that
specific branch is a design question this lens does not adjudicate, but the pattern is
demonstrated: this ritual is maintained by hand, once per call site, rather than from one
shared place, and the three cited here are the subset that are — today — byte-identical
copies of each other with no independent reason to differ.

## Suggested direction (non-binding, optional)
The natural shared home (hypothesis) is a module-private helper inside this same file — e.g. a
function taking the reference's path/range and the owning file's resolved path and returning
the loaded-and-parsed result (or `undefined` on either failure) — called from
`buildModuleScope`, `materializeChain`, and the post-walk `parseCache` loop in place of each
one's own copy. All three copies already live in `src/extension/import-static-checks.ts`, so
this is a module-scope observation, not a cross-module one.

## False-positive check
- All three spans re-read verbatim immediately before filing (matching the clone-map's own
  G011 span at :1463-1478/:1735-1750 and G023 span at :1464-1478/:1546-1560/:1736-1750
  exactly).
- Repo count: `grep -n "probe\.precache(\|loadThetaLibImport("` on this file returns exactly 6
  occurrences of the pairing; the 3 not cited here (:691/:1038/:1407) were individually read
  and each has a materially different continuation (recursive `closeOverReExports`/
  `walkThetaLib` calls, or an unconditional `diagnostics.push(...load.diagnostics)`), so they
  are correctly excluded rather than overlooked.
- All three copies are live: `checkThetaImports` is called from `production-composition.ts:1456`
  and `:3366`; `materializeChain` is called from three sites — the main per-declaration loop
  inside `checkThetaImports` (:1226), `buildModuleScope`'s own per-import loop (:1480,
  immediately after Site 1's ritual), and recursively from within itself while chasing a
  re-export chain (:1561); `buildModuleScope` is called from `materializeChain`'s own success
  arm (:1542); the post-walk `parseCache` loop is inline in `checkThetaImports`'s own body,
  reached on every call. None is a D2 dead-copy.
- Not tests/, not generated: all three sites are in `src/extension/import-static-checks.ts`,
  hand-authored production code with no `@generated`/`DO NOT EDIT` marker.
- Not a spec-repeated normative vector: imports.md states the `.thetalib` path-resolution step
  once; the three sites are three CODE executions of that one step at three pipeline stages,
  not three independent spec citations.
- Duplicate-finding check: grepped `quality/issues` + `quality/resolved` + `quality/intake` for
  `buildModuleScope`, `materializeChain`, `probe.precache`, `loadThetaLibImport`, `G011`,
  `G023` — hits are `PTQ-0337` (D2, a dangling comment reference naming a nonexistent
  `resolveLibExports`, fixed, unrelated root cause) and `PTQ-0304`/`PTQ-0334`/`PTQ-0368` (D9
  breakdown findings about `checkThetaImports`'s overall LOC/concern count, listing
  `buildModuleScope`+`materializeChain` as one "runtime materialization" row among several — a
  claim about the HOST FUNCTION'S size, not about this specific five-step ritual being
  copy-pasted three times inside it; PTQ-0368 is fixed via a different seam,
  `collectImportedSpecifierFacts`, that never touches these three sites' bodies). `PTQ-0365`
  (D4, open) covers a different repeated assertion in this same file (the three-kind
  `{schema, fn, enum}` declarable-kind universe) at disjoint call sites. None targets this
  ritual's triplication; not a re-file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>

verdict: confirmed — all 3 excerpts reproduce verbatim at 1464-1478/1546-1560/1736-1750; independently re-ran `node tools/quality/clone-scan.mjs map` and it reports G023 (92 tokens, renamed-only(10)) spanning exactly those three ranges and G011 (104 tokens, renamed-only(3)) spanning exactly 1463-1478/1735-1750, matching the filing's group/member-count claims letter-for-letter; the 3 excluded probe.precache/loadThetaLibImport pairs (:691/:1038/:1407) verified to diverge (inline diagnostics.push or recursive walkThetaLib/closeOverReExports) exactly as claimed; all three copies and checkThetaImports/materializeChain/buildModuleScope call counts verified live via grep; bug 0428's hand-copied branch at the 3 other same-pairing sites grounds the anchor in mechanical history, not taste; dedupe against PTQ-0304/0334/0337/0365/0368 confirmed disjoint (host-function-size or dangling-comment or declarable-kind claims, none touching this ritual) — D4 clone, accurate → confirmed (triage: claude-opus-5)
