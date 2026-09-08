---
id: PTQ-0043
title: projectSourceLabel and the conventional-root descriptor strings are computed and threaded into resolveEntry, whose only descriptor read is unreachable for conventional roots
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1138-1152
  - src/discovery/discovery-walk.ts:1216-1226
  - src/discovery/discovery-walk.ts:647-656
  - src/discovery/discovery-walk.ts:676-684
  - src/discovery/discovery-walk.ts:1268-1277
sites: 5                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# projectSourceLabel and the conventional-root descriptor strings are computed and threaded into resolveEntry, whose only descriptor read is unreachable for conventional roots

## Observation
`discoverThetas` builds a `descriptor` string for each of the two conventional
roots — `projectSourceLabel(configDir)` for the project root and the literal
`"global thetas directory"` for the global root — and threads it through
`collectFromEntries` into `resolveEntry`. Inside `resolveEntry` the
`descriptor` parameter is read in exactly one arm, `case "invalid-extension"`,
and `classifyForSource` can produce `invalid-extension` only when
`explicitFile === true`. The conventional-root call passes
`explicitFile=false`, so neither conventional descriptor value can ever be
rendered. The helper `projectSourceLabel` exists solely to produce this unread
value, and its own doc comment says so.

## Evidence
src/discovery/discovery-walk.ts:1140-1152 — the helper's doc comment states the
value is unreadable and vestigial:
```ts
 * only into `resolveEntry`'s `descriptor` parameter — whose sole read is the
 * `invalid-extension` arm, unreachable here because a conventional root is
 * always called with `explicitFile=false` and so never routes to that arm.
 * Kept for shape parity with `resolveEntry`'s explicit-entry callers, not
 * because a reader ever sees it: the path-bearing project/global diagnostics
 * render `descriptorValue = normalizePath(root.path)` via the normative
 * `<kind>:"<value>"` descriptor form instead. Still built from the HOST's
 * config-dir name (`.pi/theta/` on Pi, `.omp/theta/` on Oh-My-Pi) so the
 * vestigial value stays host-accurate rather than authored-extension-specific.
 */
function projectSourceLabel(configDirName: string): string {
  return `project ${configDirName}/theta/`;
}
```

src/discovery/discovery-walk.ts:1218-1226 — the two dead descriptor values:
```ts
      source: "project" as const,
      path: joinPosix(fs.cwd(), `${configDir}/theta`),
      descriptor: projectSourceLabel(configDir),
    },
    {
      source: "global" as const,
      path: joinPosix(fs.globalAgentDir(), "theta"),
      descriptor: "global thetas directory",
    },
```

src/discovery/discovery-walk.ts:647-654 — `resolveEntry`'s sole `descriptor`
read:
```ts
    case "invalid-extension":
      // An explicit file reference (CLI `--theta` / settings `thetaPaths`) that
      // resolves to a non-`.theta` regular file is an `invalid-extension` error
      // per Lexical §"Extension matching" — the settings/CLI extension check —
      // not `wrong-type-source`. The file does not register.
      diagnostics.push({
        severity: "error",
        code: INVALID_EXTENSION,
```

src/discovery/discovery-walk.ts:681-682 — `invalid-extension` requires
`explicitFile`:
```ts
  if (cls.kind === "file" && splitExtension(basename(path)).ext !== "theta") {
    return explicitFile ? { kind: "invalid-extension" } : { kind: "wrong-type" };
  }
```

src/discovery/discovery-walk.ts:1274-1276 — the conventional-root call passes
`explicitFile=false`:
```ts
      root.source,
      CONVENTIONAL_MODES,
      false,
```

## Why this is a problem
Dead code, proven by control flow: the only read of `resolveEntry`'s
`descriptor` parameter sits behind a branch that requires `explicitFile ===
true`, and the conventional-root caller pins `explicitFile=false`, so
`projectSourceLabel`'s output and the `"global thetas directory"` literal are
values no execution can observe. `projectSourceLabel` has exactly one caller
(repo-wide search: declaration at :1151, call at :1220, no other hits outside
a docs/bugs mention), and the function's own comment concedes it is "Kept for
shape parity ... not because a reader ever sees it" and names its output "the
vestigial value". A twelve-line doc comment now exists solely to explain why
an unread string is still computed — the explanation outweighs the code it
excuses.

## Suggested direction (non-binding, optional)
Make `descriptor` carry meaning only where it is readable — for example, make
it optional (or drop it) on the conventional-root entry shape and delete
`projectSourceLabel` and the global literal, leaving the explicit-file callers
(CLI) as the only descriptor suppliers.

## False-positive check
Searched `projectSourceLabel` across src/, extensions/, tools/, tests/ — hits
only at discovery-walk.ts:1151 (declaration) and :1220 (sole call), plus one
docs/bugs/0461 narrative line. Searched every read of `resolveEntry`'s
`descriptor` parameter within the function body — one read, in the
`invalid-extension` arm (:652). Verified `classifyForSource` is the only
producer of `{ kind: "invalid-extension" }` (searched the literal) and that it
is gated on `explicitFile`. Verified the settings source does not route
through `resolveEntry` (it uses `resolveSettingsSource`), so no other caller
revives the conventional descriptor values. Not test-reachable either: tests
drive `discoverThetas`, and no input can steer a conventional root into the
`invalid-extension` arm. Git history: the descriptor threading predates bug
0461, which moved the rendered diagnostics onto `descriptorValue` and left
this string behind, matching the comment's account.

## Triage
verdict: confirmed — independently re-verified: resolveEntry's `descriptor` param (:627) is read only in the `invalid-extension` arm (:656), that kind is constructed only at classifyForSource:682 behind `explicitFile` (classifyPath and its target helpers never return it), resolveEntry has one call site (collectFromEntries:1328) and the conventional caller pins `explicitFile=false`, so projectSourceLabel (unexported, sole call :1220) and the :1225 literal are unobservable; the spec's prose labels come from the live sourceLabelOf (:1346-1364), and b0461's witness test states the same gate. (triage: claude-opus-5)
