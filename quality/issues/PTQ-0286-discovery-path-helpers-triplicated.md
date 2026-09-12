---
id: PTQ-0286
title: The POSIX path-join, slash-normalise, and stem/extension-split helpers are copy-pasted across all three discovery modules
lens: D4
status: open
verdict: confirmed
locations:
  - src/discovery/discovery-walk.ts:152-159
  - src/discovery/discovery-walk.ts:167-175
  - src/discovery/package-discovery.ts:92-99
  - src/discovery/package-discovery.ts:101-109
  - src/discovery/settings.ts:175-179
sites: 5
fix_scope: module
d4_class: clone
wave: qw20260912204251
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-12
---

# The POSIX path-join, slash-normalise, and stem/extension-split helpers are copy-pasted across all three discovery modules

## Observation
`discovery-walk.ts`, `package-discovery.ts`, and `settings.ts` — the three files `node-error-code.ts`'s own header calls "the three discovery modules" — each independently declare their own copy of the same trivial POSIX path helpers (`joinPosix`, a `\`-to-`/` normaliser, and a `{stem, ext}` splitter) rather than importing one shared implementation. `package-discovery.ts`'s own doc comments twice admit the duplication is deliberate ("see discovery-walk.ts for the shared conventions"; "mirroring discovery-walk.ts") without exporting or importing anything.

## Evidence
Clone-map group G044 (renamed-only, 78 tokens) anchors the `normalizePath`/`joinPosix` pair; `splitExtension` and `settings.ts`'s `posixJoin` are additional copies of the same cluster found by reading, below the map's per-group token floor.

Copy 1 — `src/discovery/discovery-walk.ts:152-159`:
```ts
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function joinPosix(base: string, tail: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${tail}`;
}
```

Copy 1b — `src/discovery/discovery-walk.ts:167-175` (`splitExtension`):
```ts
/** Split a filename into `{ stem, ext }`; a leading-dot or extension-less name
 *  yields an empty `ext`. The split is on the final `.`. */
function splitExtension(name: string): { readonly stem: string; readonly ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) {
    return { stem: name, ext: "" };
  }
  return { stem: name.slice(0, idx), ext: name.slice(idx + 1) };
}
```

Copy 2 — `src/discovery/package-discovery.ts:92-99` (`normalizeSlashes`/`joinPosix`):
```ts
function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

function joinPosix(base: string, tail: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${tail}`;
}
```

Copy 2b — `src/discovery/package-discovery.ts:101-109` (`splitExtension`, its own comment says "mirroring discovery-walk.ts"):
```ts
/** Split a filename into `{ stem, ext }` on the final `.` (leading-dot names
 *  yield an empty `ext`), mirroring discovery-walk.ts. */
function splitExtension(name: string): { readonly stem: string; readonly ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) {
    return { stem: name, ext: "" };
  }
  return { stem: name.slice(0, idx), ext: name.slice(idx + 1) };
}
```

Copy 3 — `src/discovery/settings.ts:175-179` (`posixJoin`, a third, differently-named copy of the same `joinPosix` body):
```ts
/** POSIX-join a base directory with a relative tail (no trailing-slash dupes). */
function posixJoin(base: string, tail: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${tail}`;
}
```

Diff verdict: `joinPosix`'s body is byte-identical across all three files (two of the three even keep the exact same function name); `normalizePath`/`normalizeSlashes` are renamed-only (identical body); `splitExtension` is byte-identical (same name, same body) in the two files that have it, with package-discovery.ts's own doc literally naming discovery-walk.ts as what it mirrors. No divergence yet in any of the three.

## Why this is a problem
The project has already established the correct pattern for this exact situation: `node-error-code.ts` (this shard, no clone groups of its own) exists specifically because, per its header, all three discovery modules needed to classify a filesystem rejection's `.code` identically, so that one reader was extracted into its own module. The POSIX path conventions these three files also share (forward-slash normalisation, trailing-slash-safe join, final-dot stem/extension split) are exactly the same kind of cross-module invariant — discovery-walk.ts's own header even says the normalised form is "per Lexical §'Path literals'," a single rule all three files must honour identically — yet these were never given the same treatment. `joinPosix` and `splitExtension` are called from every path-classification and glob-matching routine in both larger files, so a future edit to the POSIX convention (e.g. a UNC-path or trailing-slash edge case) applied to one copy and missed in the other silently produces different classification/matching results for the same input on the two walks.

## Suggested direction (non-binding, optional)
`node-error-code.ts` is the existing, in-directory precedent for exactly this kind of promotion — a small module the three discovery files already import for one shared classifier — and is the natural shared home to extend with these path helpers, as a hypothesis only.

## False-positive check
Re-read all five cited ranges immediately before filing; confirmed `joinPosix`/`normalizePath`/`normalizeSlashes`/`splitExtension`/`posixJoin` bodies verbatim as quoted. Confirmed liveness: `joinPosix` and `normalizePath`/`normalizeSlashes` are each called at more than a dozen sites within their own file (e.g. `expandHome`, `enumerateDirectory`, `packageRoots`, `enumerateRoot`), `splitExtension` is called from `enumerateDirectory`/`onDiskFileCandidate` (discovery-walk.ts) and `resolvePackage`/`thetasInDirectory`/`resolvePiThetas` (package-discovery.ts), and `posixJoin` is called three times inside `settings.ts`'s `loadSettings` — none is a dead copy (D2's territory). Confirmed neither `discovery-walk.ts` nor `package-discovery.ts` exports any of these four names, so today's copies cannot currently import one another's version without a signature change.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all five excerpts verified verbatim at their cited lines; clone-scan.mjs's G044 (78 tokens, renamed-only) reproduces exactly for the discovery-walk.ts/package-discovery.ts normalizePath+joinPosix pair, and manual diffing confirms splitExtension (byte-identical in both files) and settings.ts's posixJoin (identical body, under the 60-token floor) belong to the same clone family; every copy is live (grep-confirmed call sites in enumerateDirectory/onDiskFileCandidate/resolvePiThetas/thetasInDirectory/loadSettings etc.) and none of the four names is exported from any of the three files, and a repo-wide grep shows no outside importer, so no copy can reuse another today; node-error-code.ts's header and its confirmed use by all three files independently corroborate the cited precedent (triage: claude-opus-5)
