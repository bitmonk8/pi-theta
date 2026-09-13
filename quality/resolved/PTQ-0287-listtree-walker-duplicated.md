---
id: PTQ-0287
title: The recursive glob-universe tree walker (`TreeEntry`/`TreeWalk`/`listTree`) is reimplemented near-identically in both discovery-walk.ts and package-discovery.ts
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/discovery/discovery-walk.ts:798-860
  - src/discovery/package-discovery.ts:309-377
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260912204251
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-12
---

# The recursive glob-universe tree walker (`TreeEntry`/`TreeWalk`/`listTree`) is reimplemented near-identically in both discovery-walk.ts and package-discovery.ts

## Observation
Both `discovery-walk.ts` (for settings-source `thetaPaths` globs) and `package-discovery.ts` (for `pi.theta` manifest globs) declare their own same-named `TreeEntry` interface, same-named `TreeWalk` interface, and same-named, ~35-line `async function listTree(fs, root)` that recursively `readdir`s a directory tree (symlinks not followed), classifies each rejection via the shared `nodeErrorCode`, and collects `{abs, base, isDir, isFile}` entries plus an `unreadable` list of traversal failures. The two functions differ only in (a) package-discovery.ts's version threads an extra root-relative `rel` path through the recursion and (b) package-discovery.ts's version skips the `ancestorsClean` re-check on a root-level `ENOENT` that discovery-walk.ts's version performs — a difference each file's own comment justifies by its call site's pre-conditions, not an accident.

## Evidence
Not in the clone map: the two functions' contiguous byte/token runs are broken up by the `rel`-threading and the differing `ENOENT` branch at several scattered points, so no single span clears the scanner's per-group token floor even though the two functions are ~90% identical read as wholes. Found by reading.

Copy 1 — `src/discovery/discovery-walk.ts:798-860` (types + full walker; core loop shown, elided at `//…`):
```ts
interface TreeEntry {
  readonly abs: string;
  readonly base: string;
  readonly isDir: boolean;
  readonly isFile: boolean;
}
// … TreeWalk { entries: TreeEntry[]; unreadable: string[] } …
async function listTree(fs: FileSystem, root: string): Promise<TreeWalk> {
  const out: TreeEntry[] = [];
  const unreadable: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const outcome = await fs.readdir(dir).then(
      (n) => ({ ok: true as const, names: n }),
      (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
    );
    if (!outcome.ok) {
      if (!(outcome.code === "ENOENT" && (await ancestorsClean(fs, dir)))) {
        unreadable.push(dir);
      }
      return;
    }
    for (const name of outcome.names) {
      const abs = joinPosix(dir, name);
      const stat = await lstatOutcome(fs, abs);
      if (!stat.ok) {
        if (stat.code !== "ENOENT") unreadable.push(abs);
        continue;
      }
      out.push({ abs, base: name, isDir: stat.isDir, isFile: stat.isFile });
      if (stat.isDir) { await walk(abs); }
    }
  };
  await walk(root);
  return { entries: out, unreadable };
}
```

Copy 2 — `src/discovery/package-discovery.ts:309-377` (types + full walker; core loop shown, elided at `//…`):
```ts
interface TreeEntry {
  readonly abs: string;
  readonly rel: string;
  readonly base: string;
  readonly isDir: boolean;
  readonly isFile: boolean;
}
// … TreeWalk { entries: TreeEntry[]; unreadable: string[] } …
async function listTree(fs: FileSystem, root: string): Promise<TreeWalk> {
  const out: TreeEntry[] = [];
  const unreadable: string[] = [];
  const walk = async (dir: string, relBase: string): Promise<void> => {
    const outcome = await fs.readdir(dir).then(
      (names) => ({ ok: true as const, names }),
      (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
    );
    if (!outcome.ok) {
      if (outcome.code !== "ENOENT") { unreadable.push(dir); }
      return;
    }
    for (const name of outcome.names) {
      const abs = joinPosix(dir, name);
      const rel = relBase === "" ? name : `${relBase}/${name}`;
      const stat = await fs.lstat(abs).then(
        (s) => ({ ok: true as const, isDir: s.isDirectory(), isFile: s.isFile() }),
        (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
      );
      if (!stat.ok) {
        if (stat.code !== "ENOENT") unreadable.push(abs);
        continue;
      }
      out.push({ abs, rel, base: name, isDir: stat.isDir, isFile: stat.isFile });
      if (stat.isDir) { await walk(abs, rel); }
    }
  };
  await walk(root, "");
  return { entries: out, unreadable };
}
```
Diff verdict: renamed/restructured-but-not-diverged. The `TreeWalk` interface is byte-identical in both files. `TreeEntry` differs by exactly one added field (`rel`). The walker body is line-for-line the same algorithm (readdir → classify rejection → per-entry lstat → classify rejection → push entry → recurse into directories), differing only in the extra `rel` threading and the root-`ENOENT` branch — both differences are independently, explicitly justified in each file's own doc comment by that call site's own pre-conditions (package-discovery.ts's root is always pre-proven to exist; discovery-walk.ts's settings-glob root is not), so this is not filed as drift — the two copies have not diverged in the sense of one being an unnoticed regression of the other.

## Why this is a problem
This is the same "universe glob patterns are matched against" mechanism serving two DISC-5-shaped glob-resolution features (settings `thetaPaths`, package `pi.theta`) that both cite the same spec anchors (`discovery-sources.md:69`, `package-and-settings.md:29`) for how a traversal failure is classified. A change to that shared traversal-failure rule — which rejection codes count as "clean" vs. "unreadable," or the symlink-not-followed policy both doc comments state — has to be reproduced by hand in two ~35-line recursive functions instead of one; today the only branch point genuinely tied to call-site trust (the `ancestorsClean` check) is correctly duplicated with matching intent, but the surrounding readdir/lstat/push/recurse skeleton has no reason to be two independent copies and is exactly the kind of near-miss the mechanical clone scanner cannot see once a difference splits its token run.

## Suggested direction (non-binding, optional)
A single parameterised tree-walker (root, and a small policy value for "is a root-level ENOENT already known-clean" plus an optional root-relative-path accumulator) in a shared discovery-helpers module is the natural shared home to point at, as a hypothesis only — not a design for the two callers' differing needs.

## False-positive check
Re-read both full functions (discovery-walk.ts:798-860, package-discovery.ts:309-377) immediately before filing and diffed them line-by-line; confirmed the quoted excerpts are verbatim. Confirmed both copies are live: `listTree` is called from `resolveSettingsSource`'s `treeFor` helper (discovery-walk.ts) and from `resolvePiThetas` (package-discovery.ts), both reachable from each file's exported entry point (`discoverThetas`.settings path; `discoverPackageThetas`). Confirmed the `ancestorsClean`-vs-not difference is a stated, self-consistent design choice in both files' own comments (quoted above), not an unexplained divergence, so it is reported here as a justified variation rather than as drift.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both listTree/TreeEntry/TreeWalk copies verified verbatim at the cited exact line ranges (798-860, 309-377), clone-scan map confirms neither is in the token-window map (the rel-insertion and inline-lstat/ancestorsClean branches fragment every run below the 60-token floor, reproducing the filing's own explanation), both are live (discoverThetas→resolveSettingsSource→treeFor and discoverPackageThetas→resolvePackage→resolvePiThetas), and the ENOENT-handling difference is independently justified in each file's own doc comment rather than accidental drift — an accurate D4 clone whose fix is a mechanical parameterised dedupe (triage: claude-opus-5)
