---
id: pending
title: The `configDirName()` doc names "exactly the PROJECT-relative set" in four items while a fifth production consumer, the project arm of `thetaPathsBaseDir`, reads it
lens: D2
status: intake
verdict: pending
locations:
  - src/seams/file-system.ts:28-37
  - src/seams/file-system.ts:53-60
  - src/discovery/settings.ts:390-395
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The `configDirName()` doc names "exactly the PROJECT-relative set" in four items while a fifth production consumer, the project arm of `thetaPathsBaseDir`, reads it

## Observation
`FileSystem.configDirName()` carries a doc comment that closes its enumeration
with the word "exactly": the project-relative locations it is sound for are the
`<cwd>/<configDirName>/theta/` discovery root and its descriptor,
`<cwd>/<configDirName>/settings.json`, and the project installed-package roots
`<cwd>/<configDirName>/npm` and `.../git`. `settings.ts` has a fifth call site:
the project arm of `thetaPathsBaseDir` composes `posixJoin(fs.cwd(),
fs.configDirName())`, which the enumeration does not name. The sibling member's
doc, `globalAgentDir()`, does list its counterpart ("and the global arm of
`thetaPathsBaseDir`"), so the two rosters describing the same pair of arms
disagree on whether that arm is in the set.

## Evidence
src/seams/file-system.ts:28-37 — the closed enumeration:

```ts
  /**
   * The host's config-directory NAME (`".pi"` on Pi, `".omp"` on Oh-My-Pi) — a
   * bare name, not a path, and so only sound where the host itself composes the
   * path from that same static constant. That is exactly the PROJECT-relative
   * set: the `<cwd>/<configDirName>/theta/` discovery root and the descriptor
   * naming it, `<cwd>/<configDirName>/settings.json`, and the project
   * installed-package roots `<cwd>/<configDirName>/npm` and `.../git`. Both
   * hosts do build the project directory from the static constant (Pi's
   * `CONFIG_DIR_NAME`; Oh-My-Pi's `getProjectAgentDir`), so reconstructing
   * those from the name is exact rather than a guess.
```

src/seams/file-system.ts:53-60 — the sibling roster that does list the arm:

```ts
  /**
   * The host's OWN resolved global agent directory: the absolute path the host
   * itself reads its global state out of, taken from the host SDK's
   * `getAgentDir()` — never synthesised by this extension. Every GLOBAL
   * conventional location hangs off it: the `<globalAgentDir>/theta/` discovery
   * root, `<globalAgentDir>/settings.json`, the global installed-package roots
   * `<globalAgentDir>/npm` and `.../git`, and the global arm of
   * `thetaPathsBaseDir`.
```

src/discovery/settings.ts:390-395 — the unlisted consumer:

```ts
    settings.thetaPathsBaseDir = Object.prototype.hasOwnProperty.call(
      project.cleaned,
      "thetaPaths",
    )
      ? posixJoin(fs.cwd(), fs.configDirName())
      : globalAgentDir;
```

The complete production consumer set. Search: `configDirName` over `**/*.ts`
under `src/`, excluding the declaring file — the calls through the seam are:

- src/discovery/discovery-walk.ts:1211 (`const configDir = fs.configDirName();`
  — the `<cwd>/<configDirName>/theta/` discovery root and its descriptor label,
  roster item 1);
- src/discovery/package-discovery.ts:243 (`const configDir =
  fs.configDirName();` — the project `npm` / `git` package roots, roster items
  3 and 4);
- src/discovery/settings.ts:370 (`posixJoin(fs.cwd(),
  `${fs.configDirName()}/settings.json`)` — roster item 2);
- src/extension/production-composition.ts:1856 (`resolvePath(ctx.cwd,
  fileSystem.configDirName(), "settings.json")` — roster item 2);
- src/discovery/settings.ts:394 — the project arm of `thetaPathsBaseDir`,
  matching no roster item.

## Why this is a problem
Stale roster: the enumeration is written closed ("That is exactly the
PROJECT-relative set"), so a reader uses it to decide whether a new
project-relative path belongs on this member, and it currently undercounts its
own consumers by one. The mismatch is internal to the same doc block pair — the
`globalAgentDir()` roster eight lines below names the sibling arm of the very
same `thetaPathsBaseDir` conditional, which shows the omission is decay rather
than a deliberate exclusion.

## Suggested direction (non-binding, optional)
The two rosters describe one conditional with two arms; naming that conditional
once on both members keeps them from drifting apart again.

## False-positive check
- Reference search: `grep -rn "configDirName" --include=*.ts src/` — 16 hits.
  Excluding the declaration (`src/seams/file-system.ts`), the adapter
  (`src/seams/pi-file-system.ts:44`), the unrelated
  `ExecutableHost.configDirName` field
  (`src/runtime/subagent-launcher.ts:118`, `:306`, `:314`, `:611`,
  `src/extension/production-subagent-host.ts:109`, `:111`) and the local
  parameter `projectSourceLabel(configDirName: string)`
  (`src/discovery/discovery-walk.ts:1151-1152`, fed from `:1211`), the five
  seam call sites above are exhaustive.
- Verified `settings.ts:394` is not one of the four named items: it composes a
  BASE DIRECTORY (`<cwd>/<configDirName>`) assigned to
  `settings.thetaPathsBaseDir`, not a `theta/`, `settings.json`, `npm`, or
  `git` path. `thetaPathsBaseDir` is consumed at
  `src/discovery/discovery-walk.ts:989` and declared at
  `src/discovery/settings.ts:61`.
- Checked the `globalAgentDir()` roster for the same class of error: its five
  claims match its five call sites (`discovery-walk.ts:1224`,
  `package-discovery.ts:244`, `settings.ts:371` + `:372`, `:395`,
  `production-composition.ts:1857`) — it is accurate, which isolates this
  finding to the `configDirName()` roster.
- Tests are not the only consumer: `src/discovery/settings.ts` is production
  code reached from the production composition root.

## Triage
