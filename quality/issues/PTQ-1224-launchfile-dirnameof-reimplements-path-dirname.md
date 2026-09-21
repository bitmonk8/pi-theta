---
id: PTQ-1224
title: dirnameOf in subagent-launch-file.ts hand-rolls the directory-half split that node:path.win32.dirname already provides
lens: D8
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-launch-file.ts:139-143
  - src/runtime/subagent-launch-file.ts:126-137
  - src/runtime/subagent-launcher.ts:24
sites: 1
fix_scope: module
d8_class: reimplemented
d8_host: src/runtime/subagent-launch-file.ts#dirnameOf
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# dirnameOf in subagent-launch-file.ts hand-rolls the directory-half split that node:path.win32.dirname already provides

## Observation
`subagent-launch-file.ts` declares a private helper `dirnameOf` (map: lines
140-143, importers 0/0) that returns the directory half of a
`<dir>/launch.json` path, handling both separator spellings by taking the max
of `lastIndexOf("/")` and `lastIndexOf("\\")`. Its sole caller is
`deleteLaunchFile`, which passes the result to a best-effort `fs.rmdir`.
`node:path` provides this exact operation — `path.win32.dirname` accepts both
`/` and `\` separators — and the same subsystem already imports `node:path`
(`subagent-launcher.ts:24`).

## Evidence
The hand-rolled helper, src/runtime/subagent-launch-file.ts:139-143 (re-read
before filing):

```ts
/** The directory half of a `<dir>/launch.json` path (both separator spellings). */
function dirnameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx < 0 ? path : path.slice(0, idx);
}
```

The sole call site, src/runtime/subagent-launch-file.ts:132-137:

```ts
  try {
    fs.rmdir(dirnameOf(path));
  } catch (rmdirError: unknown) { // allow-broad-catch: RFC-0012 launch-file backstop delete — pi-integration-contract/subagent.md
    void rmdirError;
  }
```

The facility: `node:path` (`path.win32.dirname`), a Node built-in already
imported one module over in the same subagent subsystem
(src/runtime/subagent-launcher.ts:24: `import { resolve as resolvePath } from
"node:path";`). Verified mechanically (Node v24):
`path.win32.dirname('C:/tmp/pi-theta-launch-abc/launch.json')` →
`C:/tmp/pi-theta-launch-abc`; `path.win32.dirname('C:\tmp\launch.json')` →
`C:\tmp` — both separator spellings, exactly the helper's stated job.

Feature-for-feature against the call site's real need: every path reaching
`deleteLaunchFile` is either produced by `writeLaunchFile`
(`${dir}/launch.json`, line 117) or is the `--theta-launch` argv value the
parent wrote in that same form, so a separator is always present. The only
behavioural divergence is on a separator-less input (`dirnameOf` returns the
input; `path.win32.dirname` returns `"."`), where the caller's `rmdir` is
best-effort and swallowed either way — immaterial at the sole call site.

## Why this is a problem
A Node built-in the package already uses in this same subsystem is re-derived
by hand, including its own cross-separator reasoning (`Math.max` of two
`lastIndexOf` calls) and its own doc comment claiming "both separator
spellings" — a claim `path.win32.dirname` carries as documented, tested
platform behaviour. The hand copy is one more site where separator handling
can drift from the platform's (this repo has a filed family of exactly this
shape: PTQ-0342 normalizepath redeclared, and this wave's sibling filings
qw20260921183818-d8-01-basefilename / -thetabasename reimplementing
path basename variants).

## Suggested direction (non-binding, optional)
Unproven hypothesis: import `dirname` from `node:path` (the `win32` flavour if
the both-separators guarantee must hold on POSIX hosts too) and delete the
helper. The single call site's best-effort `rmdir` is insensitive to the
separator-less edge divergence.

## False-positive check
- Reference search: `dirnameOf` has no importer outside this file (map row:
  importers 0/0; it is unexported); the sole call is `deleteLaunchFile:133`.
  No string-keyed or dynamic access found (`Grep dirnameOf src/` — 2 hits,
  both in this file).
- Facility availability: `node:path` is a built-in; `subagent-launcher.ts:24`
  in the same shard already imports it, so no new dependency direction is
  introduced.
- Spec check: no docs/spec_topics clause pins the launch-file dirname split;
  RFC-0012 §2 pins the file/directory lifecycle, not the string operation.
- Exemption check: no D8 exemption exists for this host (the two durable D8
  exemptions cover discovery-walk.ts#enumerateDirectory and
  production-theta-producer.ts#firstAdmittingArmProperties).
- Not-dead / not-test-only: the helper is live production code reached via
  `deleteLaunchFile` from `readLaunchFileOnce` (child intake) — the proposal
  does not demote any live code.

## Triage
verdict: questionable — accounting verified: excerpts byte-exact at subagent-launch-file.ts:126-137/139-143, sole caller deleteLaunchFile, helper unexported; node:path already imported at subagent-launcher.ts:24 (and subagent-argv.ts:3); path.win32.dirname re-verified via scratch script to return the `<dir>` half for `/`, `\` and the production mixed-separator `tmpdir()\…\pi-theta-launch-X/launch.json` shape, diverging only on separator-less input (`.` vs identity) and root-drive (`C:\` vs `C:`), both immaterial to a swallowed best-effort rmdir of an mkdtemp dir; no D8 exemption for the host, no spec clause pins the split, not tracked in issues/resolved (PTQ-0342 is normalizePath; the sibling filings are basename hosts); one filing inaccuracy noted — `Grep dirnameOf src/` actually yields a third hit, a different POSIX-only exported `dirnameOf` at src/discovery/discovery-path-classify.ts:116, which does not change the no-external-caller conclusion; the simpler shape (import dirname vs keep a 3-line local) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
