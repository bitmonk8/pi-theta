---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: enumerateDirectory always re-reads a directory's names via a second fs.readdir after classifyPath or walkTree already read them
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-path-classify.ts:256-271
  - src/discovery/discovery-walk.ts:103-113
  - src/discovery/discovery-walk.ts:236-252
  - src/discovery/discovery-walk.ts:614-618
  - src/discovery/discovery-walk.ts:644-652
  - src/discovery/discovery-walk.ts:670-680
  - src/discovery/discovery-path-classify.ts:390-394
  - src/discovery/discovery-path-classify.ts:403-412
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/discovery/discovery-walk.ts#enumerateDirectory # D8 only: the exemption key
wave: qw20260914091051
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# enumerateDirectory always re-reads a directory's names via a second fs.readdir after classifyPath or walkTree already read them

## Observation
`discovery-path-classify.ts`'s `classifyPath` decides a candidate path is a
directory by calling `fs.readdir(path)` and testing only whether the promise
resolves, discarding the resolved names array entirely. Every call chain that
receives classifyPath's `{ kind: "dir" }` outcome and needs the directory's
contents then calls `discovery-walk.ts`'s `enumerateDirectory`, which performs
its own, separate `fs.readdir(dir)` on the identical path. Three such call
chains exist in `discoverThetas`'s reachable code: `resolveEntry` (CLI
`--theta` entries and the two conventional roots), `addLiteral` (a settings
`thetaPaths` literal entry that resolves to a directory), and `addGlob` (a
settings glob match that lands on a directory). In the `addGlob` case the
redundancy compounds: the match universe it iterates was built by
`treeFor`/`listTree`/`walkTree`, whose own recursion already called
`fs.readdir` on every directory under the glob's static-prefix root —
including the exact directory `addGlob` is about to hand to
`enumerateDirectory` for a second read.

## Evidence

**classifyPath's directory test discards the names it just read —
discovery-path-classify.ts:256-271:**
```ts
export async function classifyPath(
  fs: FileSystem,
  path: string,
  enoentPolicy: EnoentPolicy,
): Promise<PathClass> {
  // DISC-2's implementation note assigns the candidate probe to `readdir` or
  // `stat` — both of which follow links — and reserves `lstat` for the
  // ancestor chain (`ancestorsClean` above). A successful `readdir` both
  // resolves any link in the path and proves the target a directory
  // ("successful enumeration short-circuits", discovery-sources.md DISC-2).
  const enumerable = await fs.readdir(path).then(
    () => true,
    () => false,
  );
  if (enumerable) {
    return { kind: "dir" };
  }
```

**enumerateDirectory's own, separate read — discovery-walk.ts:103-113:**
```ts
async function enumerateDirectory(
  fs: FileSystem,
  dir: string,
  source: DiscoverySource,
  descriptorValue: string,
  modes: FailureModes,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
  const entries = await fs.readdir(dir).then(
    (names) => ({ ok: true as const, names }),
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
  );
```

**Site 1 — resolveEntry (CLI + conventional roots), discovery-walk.ts:248-252:**
```ts
  const resolved = classifyForSource(await classifyPath(fs, path, enoentPolicy), path, explicitFile);
  switch (resolved.kind) {
    case "dir":
      roots.add(normalizePath(path));
      return enumerateDirectory(fs, path, source, descriptorValue, modes, diagnostics);
```

**Site 2 — addLiteral (settings literal dir entry), discovery-walk.ts:644-652,
forwarding into addDir at 614-618:**
```ts
    const cls = await classifyPath(fs, entry.abs, "ancestor-walk");
    switch (cls.kind) {
      case "dir":
        await addDir(entry.abs, entry.raw);
        return;
```
```ts
  const addDir = async (dir: string, descriptorValue: string): Promise<void> => {
    roots.add(normalizePath(dir));
    for (const cand of await enumerateDirectory(fs, dir, "settings", descriptorValue, SETTINGS_MODES, diagnostics)) {
      selected.set(cand.path, { ...cand, descriptorValue });
    }
  };
```

**Site 3 — addGlob (settings glob matching a directory already inside the
walked tree), discovery-walk.ts:670-680:**
```ts
  const addGlob = async (entry: ParsedSettingsEntry): Promise<void> => {
    const tree = await treeFor(staticPrefixRoot(entry.abs), entry.raw);
    for (const universeEntry of tree) {
      if (!globMatches(universeEntry, entry.abs, entry.operand, baseDir)) continue;
      if (universeEntry.isDir) {
        await addDir(universeEntry.abs, entry.raw);
      } else if (universeEntry.isFile) {
        await addFile(universeEntry.abs, entry.index, entry.raw);
      }
    }
  };
```

**Proof the tree `addGlob` iterates already read that same directory —
discovery-path-classify.ts's `walkTree`, the recursive descent
(discovery-path-classify.ts:390-394, then 403-412):**
```ts
  const walk = async (dir: string, rel: string): Promise<void> => {
    const outcome = await fs.readdir(dir).then(
      (names) => ({ ok: true as const, names }),
      (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
    );
```
```ts
      const abs = joinPosix(dir, name);
      const childRel = rel === "" ? name : `${rel}/${name}`;
      const stat = await lstatOutcome(fs, abs);
      if (!stat.ok) {
        if (stat.code !== "ENOENT") unreadable.push(abs);
        continue;
      }
      out.push(makeEntry(abs, name, stat.isDir, stat.isFile, childRel));
      if (stat.isDir) {
        await walk(abs, childRel);
```
For a matched `universeEntry` whose `isDir` is `true`, `walk` has already
recursed into that exact `abs` (line 411's `await walk(abs, childRel)`),
which means the recursive call already ran `fs.readdir(abs)` on it — the same
directory `addDir`/`enumerateDirectory` reads again moments later.

## Why this is a problem
The job at each of the three call chains is: decide whether `path` is a
directory, and if so, obtain its entry names. A single `fs.readdir` already
answers both — a resolved promise carrying names is the only evidence
`classifyPath` uses to conclude `{ kind: "dir" }` in the first place — yet the
code spends a second, independent directory read to re-derive names it
already had (site 3) or already held and discarded (sites 1 and 2).
`enumerateDirectory` (57 LOC) takes only `dir` (a path string) and has no
parameter through which a caller already holding a names array — `classifyPath`
never returns one, and `addGlob` already has one via `tree` — can hand it
over; the function's own contract forces the second read every time,
regardless of what the caller already knows. For the settings-glob path
specifically, `walkTree`'s static-prefix root can be the whole project tree
(any glob whose leading segments carry no metacharacter, e.g.
`thetaPaths: ["**/theta/*"]` resolves the prefix to the settings-file
directory itself), so a directory the recursive walk has just fully read is
handed straight back to a function that reads it again from the filesystem
before this pass's output is assembled.

## Suggested direction (non-binding, optional)
Unproven hypothesis: let a `PathClass` `"dir"` outcome (or a dedicated
overload) carry the names `classifyPath`'s own `fs.readdir` already obtained,
and let `enumerateDirectory` accept an optional pre-fetched names array — used
whenever the caller already has one (all three sites here) and falling back
to its own `fs.readdir` only when it does not. A human would need to confirm
this does not disturb the two functions' distinct failure-classification
duties (a directory `classifyPath` accepted whose own enumeration later fails
is treated as `unreadable`, not silence).

## False-positive check
Read all seven cited excerpts directly from the current working tree
immediately before filing; each matches verbatim at the stated line numbers.
Searched `discovery-walk.ts` and `discovery-path-classify.ts` for any
memoization keyed on directory path (a `Map` or cache that could make the
second `fs.readdir` a cache hit rather than a live syscall) — `treeCache` in
`resolveSettingsSource` caches `listTree`'s own whole-tree RESULT keyed by its
root, not by every directory inside it, so a directory-level `enumerateDirectory`
call is not served from it; no other cache exists between `classifyPath`/
`walkTree` and `enumerateDirectory`. Checked for a stated rationale defending
two reads: `enumerateDirectory`'s own doc comment explains only why a failure
at the SECOND read is classified as an unreadable source rather than silence
("A root `classifyPath` already accepted as a directory whose enumeration then
fails is an unreadable ... source, not silence") — it says nothing about why
the read itself must repeat, so this is not a documented design decision (the
D2/D8 rationale-stated-knob carve-out does not apply). No `docs/spec_topics/`
clause pins a two-call classify-then-enumerate sequence: discovery-sources.md
DISC-2's cited language ("successful enumeration short-circuits") is about
recognizing a successful `readdir` as proof of directory-ness during
classification, not about a required second enumeration afterward — no
`challenges_spec` applies. Not a D9 size claim: `enumerateDirectory` (57 LOC)
and `classifyPath` (43 LOC) are both far under any function-size threshold;
this finding is about redundant I/O shape, not function length. Not a D4
duplication claim: the two functions implement different jobs (classify a
single path's shape vs. build validated `.theta` candidates from a directory)
that happen to both need `fs.readdir` — neither is a copy of the other.
Checked the do-not-refile list and the recent triage rejections: none concern
this call chain (the rejected `qw20260913174959` D8 filing was about
`joinPosix`/POSIX path-string helpers diverging from `node:path`'s `posix.join`
on dot-segment tails, a different code object and a different claim).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting independently verified: classifyPath (discovery-path-classify.ts:256-271, 43 LOC) discards fs.readdir's resolved names, PiFileSystem.readdir (src/seams/pi-file-system.ts) is a direct uncached fsp.readdir passthrough, and all 3 call chains genuinely re-read the identical directory (resolveEntry :248→enumerateDirectory :252; addLiteral :648→addDir :614-618→enumerateDirectory :616; addGlob :670-680, whose tree was built by walkTree's recursive readdir at :390-412 already reading the matched dir) with treeCache confirmed keyed only by static-prefix root, not per-directory, and no docs/spec_topics clause or in-code rationale defending a second read (only the failure-handling of one is documented, per discovery-root-enumeration-failure.test.ts's bug-0076 history) — but per the D8 protocol an accurate accounting caps at questionable, never confirmed, since threading pre-fetched names through touches classifyPath/enumerateDirectory's distinct failure-classification duties (the finding's own caveat) and is a design decision for a human ruling (triage: claude-opus-5)
