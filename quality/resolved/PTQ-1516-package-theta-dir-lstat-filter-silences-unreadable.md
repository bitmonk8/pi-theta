---
id: PTQ-1516
title: package-discovery.ts thetasInDirectory drops a `.theta` child whose lstat rejects or is not a regular file with no diagnostic, while the project/global/settings/CLI directory scan reports the same file as theta/load/unreadable
lens: D6
status: fixed
verdict: confirmed
locations:
  - src/discovery/package-discovery.ts:506-513
  - src/discovery/package-discovery.ts:136-141
  - src/discovery/discovery-source-enumerate.ts:92-98
  - src/discovery/discovery-collision-resolve.ts:148-160
  - src/discovery/discovery-path-classify.ts:404-411
sites: 5
fix_scope: module
d6_class: posture-divergence
d6_anchor: "docs/spec_topics/discovery/discovery-sources.md:66 DISC-2 rule 1 — \"Discoverable `.theta` files that are themselves unreadable (broken symlink, transient I/O error, EACCES on the file itself) are reported as `theta/load/unreadable` *warnings* regardless of source\""
wave: qw20260927174614
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-27
---

# package-discovery.ts thetasInDirectory drops a `.theta` child whose lstat rejects or is not a regular file with no diagnostic, while the project/global/settings/CLI directory scan reports the same file as theta/load/unreadable

## Observation
Two functions do the same job: take a directory that `readdir` has already listed and collect its byte-exact `*.theta` children. `thetasInDirectory` in package-discovery.ts does this for a package's conventional `theta/` fallback and for each directory a `pi.theta` entry matched. `enumerateDirectory` in discovery-source-enumerate.ts does it for the project, global, settings and CLI directory roots. `enumerateDirectory` keeps every `*.theta` name as a candidate. `validateAndRead` later probes each candidate with `readBytes` and reports a failed read as a `theta/load/unreadable` warning. `thetasInDirectory` first sends every `*.theta` name through `isFileHelper`, an `lstat` probe that returns `false` when the rejection handler fires or when the entry is not a regular file. Such a name is never added to `out`, so it never reaches `validateAndRead`, and nothing reports it. So a broken-symlink `.theta`, or one whose `lstat` rejects with EACCES, gets a warning in `.pi/theta/` and no diagnostic at all in `node_modules/<pkg>/theta/`.

## Evidence
**Divergent side (silent)**: src/discovery/package-discovery.ts:506-513, the `.theta` child loop in `thetasInDirectory`:
```ts
  for (const name of entries.names) {
    const { stem, ext } = splitExtension(name);
    if (ext !== "theta") continue;
    const abs = joinPosix(dir, name);
    if (await isFileHelper(fs, abs)) {
      out.set(abs, stem);
    }
  }
```
src/discovery/package-discovery.ts:136-141, the probe it uses, which folds every rejection into `false`:
```ts
async function isFileHelper(fs: FileSystem, path: string): Promise<boolean> {
  return fs.lstat(path).then(
    (stat) => stat.isFile(),
    () => false,
  );
}
```
There is no `else` arm. A name that fails the probe adds no diagnostic and no candidate.

**Sibling side (warns)**: src/discovery/discovery-source-enumerate.ts:92-98, the same `readdir`-listed `*.theta` child loop in `enumerateDirectory`. It keeps every name without an `lstat` filter:
```ts
  for (const name of entries.names) {
    const { stem, ext } = splitExtension(name);
    const lower = ext.toLowerCase();
    const full = joinPosix(dir, name);
    if (ext === "theta") {
      candidates.push({ path: full, stem });
      continue;
    }
```
src/discovery/discovery-collision-resolve.ts:148-160, where `validateAndRead` reports that candidate when it cannot be read:
```ts
    const readable = await fs.readBytes(candidate.path).then(
      () => true,
      () => false,
    );
    if (!readable) {
      diagnostics.push({
        severity: "warning",
        code: UNREADABLE_FILE,
        file: candidate.path,
        message: `.theta file is unreadable: '${candidate.path}'`,
      });
      continue;
    }
```
Supporting sibling: src/discovery/discovery-path-classify.ts:404-411 (`walkTree`, which the package's own `pi.theta` universe walk uses). It carries an entry-level `lstat` rejection out as unreadable instead of dropping it:
```ts
    for (const name of outcome.names) {
      const abs = joinPosix(dir, name);
      const childRel = rel === "" ? name : `${rel}/${name}`;
      const stat = await lstatOutcome(fs, abs);
      if (!stat.ok) {
        if (stat.code !== "ENOENT") unreadable.push(abs);
        continue;
      }
```

**Why these are the same failure class, step by step:** Both loops iterate the names returned by a `readdir` that succeeded on a directory being scanned "non-recursively for `*.theta`". The spec uses that phrase for the package `theta/` fallback and for `pi.theta` directory matches (package-and-settings.md:21-22). It uses the same non-recursion rule for `.pi/theta/` and `~/.pi/agent/theta/` (package-and-settings.md:31). Both loops select by the same byte-exact `ext === "theta"` test. The failure in question is a selected `.theta` child that cannot be read as a regular file. Since bug 0463's fix, package candidates go through the same `validateAndRead` stage as every other source (`docs/bugs/0463-package-source-bypasses-disc3-validation.md:207`: "DISC-2 rule-1 readability (`unreadable`) now run for source `package` identically to the other four sources"). The pre-filter at :510 removes exactly the files that stage exists to report, before they reach it.

**Anchor**, quoted from docs/spec_topics/discovery/discovery-sources.md:66:
> 1. **Discoverable `.theta` files that are themselves unreadable** (broken symlink, transient I/O error, EACCES on the file itself) are reported as `theta/load/unreadable` *warnings* regardless of source, and the theta is not registered. The scan continues; one bad file does not poison the rest.

The anchor names a "broken symlink" and "EACCES on the file itself". `lstat` on a broken symlink returns a symbolic-link stat, so `isFile()` is false. An EACCES that `lstat` itself raises reaches the `() => false` handler. Either way the name is dropped at :510.

Searches run this session:
- `grep -c "isFileHelper" src/discovery/package-discovery.ts` → 2 (the definition at :136 and the single call at :510).
- `grep -n "lstat" src/discovery/discovery-source-enumerate.ts` → 0 hits. The sibling enumeration does not pre-filter by `lstat`.
- `grep -rn "UNREADABLE_FILE" src` → 3 hits: the constant at discovery-model.ts:127, plus the import (:26) and the single mint (:155) in discovery-collision-resolve.ts. No other `theta/load/unreadable` mint exists that the package path could reach.

Witness-shape note: the bug 0463 face-3 witness (tests/b0463-package-source-disc3-validation.test.ts:165-186) plants `errors: { [unreadablePath]: "EACCES" }` in `FakeFileSystem`, whose `lstat` throws for any path in `errors` (tests/helpers/fake-file-system.ts:180-183). It then feeds the candidate straight into `discoverThetas` through `packageCandidates`, bypassing `discoverPackageThetas`. If that same EACCES file sat in a package `theta/` directory reached by `discoverPackageThetas`, it would be dropped at :510 and never reach the stage the witness asserts on.

## Why this is a problem
The repository states that the fail-closed posture for a discoverable file is to report it (DISC-2 rule 1, "regardless of source"). Bug 0463 recorded the package source's absence from that stage as a defect and fixed it by routing package candidates through `validateAndRead`. The `lstat` filter in `thetasInDirectory` still stands in front of that stage. It removes the unreadable package `.theta` files without a diagnostic, while the project, global, settings and CLI scans report the same files. An author whose package ships a dangling or permission-denied `.theta` gets no signal. The same file under `.pi/theta/` produces a warning.

## Suggested direction (non-binding, optional)
Let the package directory scan hand every byte-exact `*.theta` child to the shared per-candidate stage, as `enumerateDirectory` does. The existing `validateAndRead` readability probe then decides reportability for package candidates just as it does for the other four sources.

## False-positive check
- **EXST-9 / PIC-73 class check:** not applicable. This is a load-time discovery walk, not an execution-status sink or producer hook, and not a degrade-silent optional capability. Neither pinned-silence class covers it.
- **allow-broad-catch token check:** no `catch` clause is cited. Both sides discriminate in Promise rejection handlers (`() => false`), which the node-error-code.ts header (:11-14) describes as the discovery modules' sanctioned idiom. No token applies at either site.
- **Stated-rationale check:** the comments around `thetasInDirectory` (package-discovery.ts:462-480) justify the ENOENT-vs-other split of the directory `readdir` only. They say nothing about the per-child `isFileHelper` filter. The npm-root comment at :243-246 ("a non-directory / symlink child simply fails its `package.json` read and contributes nothing") covers candidate-package directories, not `.theta` children. `git log -L` on the :510 line shows one commit, 1d9be00e ("V10b — Package discovery (bounded walk)"), which predates bug 0463's fix. Bug 0463 (§Fix, :207) says package readability "now run[s] ... identically to the other four sources", which is the posture the filter contradicts. Bug 0076 §Non-goals (:476) calls the `validateAndRead` per-file warning correct and leaves it untouched. It does not ratify a package-side pre-filter. The DISC-5 phrase "a match that is any other file type is filtered out silently per match" (package-and-settings.md:21) governs direct glob matches (the `entry.isFile` arm at package-discovery.ts:428), not children of a scanned directory. This filing does not cite that arm.
- **Sibling-reality check:** both loops were read in full this session (package-discovery.ts:481-515, discovery-source-enumerate.ts:64-120). Both run over `readdir` output of a directory already proven enumerable, and both select with `splitExtension(name).ext === "theta"`. Their candidates meet in the same `validateAndRead` (discovery-walk.ts:571, which receives `input.packageCandidates` at :558-566).
- **Already-filed check:** none of the listed PTQ / pending intake titles covers package `.theta` child filtering or DISC-2 rule 1. PTQ-0900 and PTQ-1316 are test-fixture duplication. Bug 0463 is fixed, and its witness bypasses the cited filter.

## Triage
verdict: confirmed — both sides re-verified at the cited lines. In `thetasInDirectory` (package-discovery.ts:506-513), each `.theta` child goes through `isFileHelper`, an lstat probe with a `() => false` handler (:136-141). The loop has no else arm, so a broken symlink or a child whose lstat rejects is dropped with no diagnostic. `enumerateDirectory` (discovery-source-enumerate.ts:92-98, 0 lstat hits) keeps every byte-exact `.theta` child, and `validateAndRead` (discovery-collision-resolve.ts:148-160, the only `UNREADABLE_FILE` mint of 3 grep hits) then warns `theta/load/unreadable`. The conventional `theta/` fallback (:561) has no universe walk to catch the dropped file. The stated searches reproduce (2/0/3). The anchor is verified: discovery-sources.md:66 DISC-2 rule 1 says "broken symlink … EACCES on the file itself … `theta/load/unreadable` warnings regardless of source", and bug 0463 §Fix :207 says package readability runs identically to the other four sources. No comment gives a reason for the filter (DISC-5's silent filtering covers direct matches and the :11 symlink rule covers package dirs, not `.theta` children), and no existing PTQ covers it (triage: claude-opus-5-5)
