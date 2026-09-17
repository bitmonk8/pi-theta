---
id: PTQ-0451
title: b0465 redeclares the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0465-imported-annotation-vacuous-validation.test.ts:293-329
  - tests/helpers/thetalib-load-harness.ts:79-116
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0465 redeclares the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports

## Observation
`tests/helpers/thetalib-load-harness.ts` exports `fakeThetaLibFs(files)`: an
in-memory `FileSystem` double for `.thetalib` import tests whose `readdir`/
`readBytes` answer from a flat path→content map (directory listings derived
from the map's own keys) and every other member rejects with the fixed
message `"filesystem member not exercised by this test"`.
`tests/b0465-imported-annotation-vacuous-validation.test.ts` declares a local,
module-scope `fakeThetaLibFs` with the identical parameter shape, the
identical directory-derivation loop, the identical member set, and the
identical reject message, and does not import the helper — even though the
same file already imports `parseDeps` from the harness module's own sibling
`tests/helpers/e2e-s1.ts`, and a second file in this same review scope
(`tests/b0476-panic-site-and-frames.test.ts`) imports the canonical
`fakeThetaLibFs` directly from `tests/helpers/thetalib-load-harness.ts`.

## Evidence
tests/b0465-imported-annotation-vacuous-validation.test.ts:293-329 (re-read
immediately before filing):
```ts
/** The in-memory `.thetalib` FS double (only `readdir`/`readBytes` are read). */
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}
```

tests/helpers/thetalib-load-harness.ts:79-116 — the canonical export, same
directory-derivation loop, same member set, same reject message, differing
only in `readBytes`'s existence check (`files[path]` vs. the local copy's
`Object.prototype.hasOwnProperty.call(files, path) ? files[path] : undefined`,
an observationally identical check for the `Record<string, string>` inputs
both files pass):
```ts
export function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
```

Cross-check in this same review scope: tests/b0476-panic-site-and-frames.test.ts:100
imports the canonical export directly (`import { fakeThetaLibFs } from
"./helpers/thetalib-load-harness";`), proving the helper is import-ready for
exactly this file family and this bug-witness style.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a fake filesystem double is
re-implemented, field-for-field and message-for-message, where a canonical
helper already exists under `tests/helpers/` for precisely this purpose. Two
prior findings in this repository's history (PTQ-0310, PTQ-0393, both
resolved) already established that this exact double recurs across other
`.thetalib`-import bug-witness files and centralised it into
`tests/helpers/thetalib-load-harness.ts` for that reason; b0465 is a further,
unremediated instance of the same re-implementation, written after that
centralisation existed (it imports a sibling helper, `parseDeps`, from the
same `tests/helpers/` directory in the same import block).

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts` already exports `fakeThetaLibFs`
for this exact shape; importing it removes the local redeclaration.

## False-positive check
- Gate-pin check: `tests/b0465-imported-annotation-vacuous-validation.test.ts`
  does not match `*gate*.test.ts` or the named gate kin.
- Recording-double check: `fakeThetaLibFs` answers reads from a static map; it
  records no calls and backs no "never called" witness in this file, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0465-imported-annotation-vacuous-typed-query-validation.md`
  — Status fixed (0.462.0); this file is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search:
  `grep -rn "b0465-imported-annotation-vacuous-validation" docs/reference/coverage-matrix.md docs/bugs/*.md`
  → 0 hits in coverage-matrix.md; `docs/bugs/0465-...md` self-cites (its own
  witness) and `docs/bugs/0466-imported-alias-shadows-sibling-defs-collision.md`
  cites `tests/b0465-imported-annotation-vacuous-validation.test.ts:812-835`
  by name and line range — outside the 293-329 range this finding touches, and
  this finding proposes no merge, rename, or deletion of any `it()`/
  `describe()`, only that the local `fakeThetaLibFs` helper function could be
  imported rather than redeclared, so that citation is unaffected.
- Coverage check: the claim is about a repeated helper DEFINITION, not a
  missing test path; the double is exercised by this file's own tests.
- Prior-finding overlap check: PTQ-0310 and PTQ-0393 (both resolved) name
  four other files (b0303, b0304, b0305, b0306, b0448, b0450); none names
  b0465. `grep -rl "b0465" quality/resolved/*.md quality/intake/*.md` before
  filing returned only PTQ-0092 (unrelated topic) and
  `qw20260917154546-d7-01-b0292-typed-query-substrate-mirrored.md` (a
  different root cause), confirming this is a new, unfiled instance of the
  established pattern.

## Triage
verdict: confirmed — independently re-verified: b0465:293-329 and thetalib-load-harness.ts:85-116 match the excerpts verbatim, the only divergence (hasOwnProperty guard in readBytes) is inert for the plain `/proj/*.thetalib`-keyed literals every b0465 call site (230, 516, 542) passes; b0476:100 imports the canonical export; not a gate file, not a recording double, bug 0465 is fixed (0.462.0), coverage-matrix has 0 hits and bug 0466's citation (b0465:812-835) is a different `it()` with no merge/rename/delete proposed; PTQ-0310 (b0303-b0306) and PTQ-0393 (b0448/b0450) are resolved and name other files, so this is a new instance, not a duplicate (triage: claude-fable-5-1)
