---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: globMatches recompiles a fresh minimatch pattern per candidate file instead of once per settings thetaPaths glob entry
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:438-450
  - src/discovery/discovery-walk.ts:369-380
  - src/discovery/discovery-walk.ts:617-627
  - src/discovery/discovery-walk.ts:637-645
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/discovery/discovery-walk.ts#globMatches # D8 only: the exemption key, <path> or <path>#<function>
wave: qw20260916045442
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-16
---

# globMatches recompiles a fresh minimatch pattern per candidate file instead of once per settings thetaPaths glob entry

## Observation
`globMatches` (discovery-walk.ts:438-450) tests one enumerated filesystem
entry against a settings `thetaPaths` glob entry by calling the `minimatch`
package's functional shortcut up to three times, on the same two pattern
strings (`absPattern`, `rawPattern`) every time. It is invoked once per entry
of a recursively-enumerated candidate tree in `addGlob` (617-627, one call
per `universeEntry` of `tree`) and again once per currently-selected
candidate when a `!`-prefixed entry retracts matches (637-645, one call per
`key` of `[...selected.keys()]`). In both loops the settings entry
(`entry.abs` / `entry.operand`) is the loop-invariant operand and the
candidate is the loop-variant one. The candidate universe itself is
documented, in this same file, as unbounded: `listTree` (369-380)
"[r]ecursively enumerate[s] every file/dir under `root`" with no size cap
(contrast `discovery/settings.ts`'s own `scanPackagesMaxFiles` /
`scanPackagesTimeoutMs` caps on a sibling recursive scan in this shard).

## Evidence
**`globMatches`, discovery-walk.ts:438-450 — up to 3 `minimatch()` calls per
candidate, same two pattern strings every time:**
```ts
function globMatches(
  entry: TreeEntry,
  absPattern: string,
  rawPattern: string,
  baseDir: string | undefined,
): boolean {
  const rel = relativeToBase(baseDir, entry.abs);
  return (
    minimatch(entry.abs, absPattern, { nocase: false }) ||
    minimatch(entry.base, absPattern, { nocase: false }) ||
    (rel !== undefined && minimatch(rel, rawPattern, { nocase: false }))
  );
}
```

**Site 1 — `addGlob`, discovery-walk.ts:617-627 — `globMatches` called once
per `universeEntry` of `tree`; `entry.abs` / `entry.operand` are the outer,
loop-invariant closure variable's fields, unchanged for the whole loop:**
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

**Site 2 — the `!`-prefix drop loop, discovery-walk.ts:637-645 — the same
shape, `entry.abs` / `entry.operand` invariant while `key` ranges over the
currently-selected candidate set:**
```ts
  for (const entry of parsed) {
    if (entry.prefix !== "!") continue;
    for (const key of [...selected.keys()]) {
      const drop = entry.glob
        ? globMatches(fileEntryOf(key), entry.abs, entry.operand, baseDir)
        : key === entry.abs || dirnameOf(key) === entry.abs;
      if (drop) selected.delete(key);
    }
  }
```

**The enumerated universe's own documented size bound — discovery-walk.ts:369-380
(`listTree`'s doc comment, quoted in full to the signature):**
```ts
/** Recursively enumerate every file/dir under `root` (symlinks not followed);
 *  the universe glob patterns are matched against. A failure to enumerate any
 *  directory in that walk — the static-prefix root itself or a subtree below
 *  it — or to `lstat` an entry that walk enumerated, is a traversal failure
 *  inside a root that exists, an unreadable source and not silence
 *  (discovery-sources.md:73), so the rejection is classified by the :72
 *  clean-leaf rule and carried out rather than dropped. Delegates to the
 *  shared `walkTree` helper (PTQ-0287) with the `"ancestor-walk"` ENOENT
 *  policy: this walk's root is a settings glob's static-prefix directory, not
 *  pre-proven to exist, so a directory-level `ENOENT` needs the clean-leaf
 *  check rather than being assumed clean. */
async function listTree(fs: FileSystem, root: string): Promise<TreeWalk> {
```
No filter narrows this to `.theta` candidates, and no cap mirrors the sibling
`scanPackagesMaxFiles` / `scanPackagesTimeoutMs` bound this same shard's
`discovery/settings.ts` places on its own recursive package scan
(settings.ts:42-45) — a `thetaPaths` glob whose static prefix
(`staticPrefixRoot`, 416-425) is broad (a plain `"**/*.theta"` entry roots at
the settings-file directory itself, since the very first path segment is
already a glob) walks everything under it.

**The cost shape: `minimatch`'s own functional wrapper constructs a fresh
`Minimatch` instance — which parses/brace-expands the pattern into `this.set`
in its constructor — on every single call, discarding it after one match.
`node_modules/minimatch/dist/commonjs/index.js:9-16` (installed version
10.2.5, `package.json`'s `"minimatch": "^10.0.1"` dependency):**
```js
const minimatch = (p, pattern, options = {}) => {
    (0, assert_valid_pattern_js_1.assertValidPattern)(pattern);
    // shortcut: comments match nothing.
    if (!options.nocomment && pattern.charAt(0) === '#') {
        return false;
    }
    return new Minimatch(pattern, options).match(p);
};
exports.minimatch = minimatch;
```
The constructor calls `this.make()` unconditionally (`index.js:236-238`,
inside `constructor(pattern, options = {})`), and the package's own README
(lines 125-128) documents constructing a `Minimatch` instance directly
(`new Minimatch(pattern, options)`) as the alternative to the one-shot
function for exactly the repeated-match shape these two loops exhibit: one
pattern, matched against many candidate paths in sequence.

**Measured cost, this repository's own installed `minimatch@10.2.5` against
real file lists drawn from this repository (a stand-in for a `thetaPaths`
glob's static-prefix-root tree), comparing the current recompile-per-call
shape to a compile-once-then-`.match()` shape, hit counts verified identical
at every N (behaviour-preserving):**
```
N=200:   recompile=2.197ms   compile-once=0.236ms  ratio=9.31
N=1000:  recompile=5.455ms   compile-once=0.538ms  ratio=10.14
N=5000:  recompile=30.543ms  compile-once=2.781ms  ratio=10.98
N=14770: recompile=64.560ms  compile-once=7.063ms  ratio=9.14  (hits=33 both ways)
```
(`node -e` script constructed `pattern = "/repo/**/*.theta"` and both a
`minimatch(f, pattern, opts)`-per-file loop and a
`new Minimatch(pattern, opts)` instance whose `.match(f)` is called per file,
over file lists of the stated sizes taken from `find . -type f` under this
repository, excluding `node_modules`/`.git`.)

## Why this is a problem
The measured overhead (~9-11x at every tested N) is paid by `globMatches`
being called once per candidate rather than the settings pattern being
compiled once per entry and reused: `entry.abs` / `entry.operand` do not
change across either the `addGlob` tree loop or the `!`-drop selected-keys
loop, so the glob AST `minimatch`'s own constructor builds (`this.set`) is
identical work redone once per candidate instead of once per entry. The
candidate count this cost multiplies against is, by this file's own
documentation, the full recursive listing of "every file/dir under `root`"
(369), not a `.theta`-filtered subset and not size-capped the way this
shard's sibling recursive scan (`discovery/settings.ts`'s package walk) is —
so a `thetaPaths` glob entry whose static prefix resolves broadly (any
pattern beginning with a glob segment, e.g. `"**/*.theta"`, roots at the
settings-file directory itself per `staticPrefixRoot`) pays this multiplied
cost across whatever that directory contains. The file already shows
cost-awareness for the sibling expensive step of the same walk —
`treeCache` / `treeFor` (541, 550-558) memoizes the disk enumeration per static-prefix root
specifically so two settings entries sharing a root are not re-walked on
disk — but extends no equivalent reuse to the adjacent, equally
per-entry-invariant glob-pattern compile `globMatches` pays for on every one
of that same cached tree's entries.

## Suggested direction (non-binding, optional)
Unproven hypothesis: precompile `new Minimatch(entry.abs, { nocase: false })`
and (when needed) `new Minimatch(entry.operand, { nocase: false })` once per
`ParsedSettingsEntry` — or once per `addGlob` / `!`-loop invocation, ahead of
its per-candidate loop — and have `globMatches` call `.match(candidatePath)`
against the precompiled instances instead of the functional `minimatch(...)`
shortcut. The exact caching boundary (per-entry vs. per-loop-invocation) is
left to whoever picks this up.

## False-positive check
Re-read all four `discovery-walk.ts` ranges immediately before filing;
content matches verbatim. Confirmed `minimatch@10.2.5` is the version
actually installed (`node -e 'console.log(require("minimatch/package.json").version)'`
→ `10.2.5`), matching `package.json`'s `"minimatch": "^10.0.1"` dependency
(a package this repository already depends on, not a hypothetical
addition). Re-ran the benchmark script immediately before filing at four
sizes (200/1000/5000/14770 files), confirming both behaviour-preserving hit
counts (identical at every N) and the ~9-11x cost ratio quoted above.
Confirmed from the installed package's own source
(`node_modules/minimatch/dist/commonjs/index.js:9-16`, `:236-238`) that the
functional `minimatch()` entry point constructs a fresh `Minimatch` — whose
constructor unconditionally parses the pattern — on every call, and that the
package's own README documents direct `Minimatch` construction as the
reusable alternative. Searched `quality/` for `minimatch`, `globMatches`,
`staticPrefixRoot`, and `listTree`: the only prior mention of this exact
mechanism is a dropped note in an earlier D8 shard's own working file
(`quality/tmp/qw20260914060226/D8/shard-01.notes.txt`, wave qw20260914060226:
"UNFILED: minimatch un-cached pattern recompiles in resolveSettingsSource
(dropped: no empirical proof N is large enough to violate scale bound)") —
never filed as a candidate and never triaged, so it is not on the do-not-refile
list; its stated reason for withholding (no empirical proof of scale) is what
the measured benchmark above now supplies. Checked the D8 durable-exemption
list: the one entry on this file (`discovery-walk.ts#enumerateDirectory`,
`heavier-than-scale`, ratified 2026-09-14) concerns a different function and
a different mechanism (one extra `fs.readdir` per directory candidate, not
repeated glob-pattern compilation), so this filing's host key
(`#globMatches`) is not the exempted one and the same-class restriction does
not apply. Checked `discovery/package-and-settings.md`'s `thetaPaths` entry
schema (quoted in this file's own header, 333-345): it specifies which three
strings a glob compares against and the override grammar, not how many times
a pattern is compiled — reusing one compiled pattern across candidates
changes no match outcome (the benchmark's hit counts are identical both
ways), so no spec clause is challenged. Not dead code: `globMatches`,
`addGlob`, and the `!`-loop are reached from `resolveSettingsSource`, called
from the sole exported `discoverThetas` (1 src / 16 test importers per the
structural map) whenever `ThetaSettings.thetaPaths` carries any glob entry.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting independently verified (excerpts, minimatch@10.2.5 source, ~10x re-benchmark, unexempted host, uncapped live candidate set) but the precompile fix is a design decision for human ruling, per D8 heavier-than-scale never reaching confirmed (triage: claude-opus-5)
