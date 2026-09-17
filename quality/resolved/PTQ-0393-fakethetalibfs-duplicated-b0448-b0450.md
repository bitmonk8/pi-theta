---
id: PTQ-0393
title: b0448 and b0450 each redeclare the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0448-imported-non-object-ctor.test.ts:140-176
  - tests/b0450-imported-enum-system-param.test.ts:158-192
  - tests/helpers/thetalib-load-harness.ts:77-111
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0448 and b0450 each redeclare the fakeThetaLibFs double that tests/helpers/thetalib-load-harness.ts already exports

## Observation
tests/b0448-imported-non-object-ctor.test.ts and
tests/b0450-imported-enum-system-param.test.ts each declare, module scope,
their own `fakeThetaLibFs(files)`: an in-memory `FileSystem` double that
derives a directory listing from a flat path→content map and serves only
`readdir`/`readBytes`, every other member rejecting with the fixed message
"filesystem member not exercised by this test". tests/helpers/thetalib-load-harness.ts
already exports a `fakeThetaLibFs` solving the identical problem. Neither file
imports it, although both already import other helpers (`parseDeps` from
`./helpers/e2e-s1`, `REGISTRY` from `./helpers/registry-oracle`) in the same
import block.

## Evidence
tests/b0448-imported-non-object-ctor.test.ts:140-152 (of the full declaration,
140-176):
```ts
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
```

tests/b0448-imported-non-object-ctor.test.ts:167-174 (the one line this copy
diverges on):
```ts
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = Object.prototype.hasOwnProperty.call(files, path)
        ? files[path]
        : undefined;
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
```

tests/b0450-imported-enum-system-param.test.ts:158-170 (of the full
declaration, 158-192), byte-identical to b0448's opening above apart from
line-number shift:
```ts
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
```

tests/b0450-imported-enum-system-param.test.ts:185-190 (its `readBytes`,
shorter than b0448's):
```ts
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
```

tests/helpers/thetalib-load-harness.ts:77-89 and :104-109 — the canonical
export, byte-identical to b0450's copy (apart from the `export` keyword) at
both the opening and the `readBytes` body:
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
```
```ts
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
```

Full-span diff (export keyword normalised, re-run immediately before filing):
`tests/b0450-imported-enum-system-param.test.ts:158-192` against
`tests/helpers/thetalib-load-harness.ts:77-111` produces zero differences —
byte-identical. `tests/b0448-imported-non-object-ctor.test.ts:140-176` against
the same canonical range differs only in the three `readBytes` lines quoted
above (a `hasOwnProperty` guard versus a bare index) — every other line,
including the exact ten-member `FileSystem` object shape and the fixed
rejection message, is identical.

Exact search: `grep -n "^function fakeThetaLibFs" tests/b0448-imported-non-object-ctor.test.ts tests/b0450-imported-enum-system-param.test.ts` → exactly 2 hits (140, 158); `grep -n "from \"\./helpers" tests/b0448-imported-non-object-ctor.test.ts tests/b0450-imported-enum-system-param.test.ts` → each file imports only `./helpers/e2e-s1` and `./helpers/registry-oracle`, never `./helpers/thetalib-load-harness`.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class. tests/helpers/thetalib-load-harness.ts's
own header states it centralises exactly this double because it recurred
across sibling bug-witness test files (PTQ-0232, resolved, for
b0333/b0334/b0335); a further sweep (PTQ-0310, resolved) subsequently migrated
four more files (b0303/b0304/b0305/b0306) that were independently carrying
byte-identical copies at the time of that filing. b0448 and b0450 are a
further, disjoint pair — neither is named in PTQ-0232's or PTQ-0310's cited
locations — carrying the same double independently redeclared rather than
imported, the same "counted but not migrated" residual shape this store has
already confirmed twice for this exact helper.

## Suggested direction (non-binding, optional)
tests/helpers/thetalib-load-harness.ts already exports a `fakeThetaLibFs`
matching both files' need (b0450's byte-for-byte, b0448's apart from one
defensive guard in `readBytes`); it is the existing home each file's own copy
could import instead of redeclaring.

## False-positive check
- Gate-pin check: neither tests/b0448-imported-non-object-ctor.test.ts nor
  tests/b0450-imported-enum-system-param.test.ts matches `*gate*.test.ts` or
  the named kin; not applicable.
- Recording-double check: `fakeThetaLibFs` is a stateless, read-only double
  (it answers `readdir`/`readBytes` from a fixed map); it records no calls
  and backs no "never called" witness in either file, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0448-imported-non-object-ctor-mints-silently.md
  — Status fixed (0.453.0); docs/bugs/0450-imported-enum-system-param-unjudged.md
  — Status fixed (0.455.0). `npx vitest run tests/b0448-imported-non-object-ctor.test.ts
  tests/b0450-imported-enum-system-param.test.ts` → 2 files, 20 tests passing
  at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0448-imported-non-object-ctor\|b0450-imported-enum-system-param"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl` for either filename
  across docs/bugs/*.md (excluding each file's own bug document) → 0 hits.
  This finding proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` inside them — only that the double's definition could
  import an existing export instead of redeclaring it.
- Prior-finding overlap check: PTQ-0250 (resolved) already covers a
  DIFFERENT duplicated helper (the diagnostics-registry `REGISTRY` read) in
  these same two files, a distinct root cause; PTQ-0310 (resolved) covers
  this identical `fakeThetaLibFs` double but in a disjoint file set
  (b0303/b0304/b0305/b0306); PTQ-0232 (resolved) is the original 3-file
  family that created the canonical helper. None of the three names b0448 or
  b0450 as a location for the `fakeThetaLibFs` duplication, so this is a
  distinct, unremediated occurrence of the same already-recognised gap
  rather than a re-filing.
- Coverage check: the claim is about a repeated double DEFINITION, not a
  missing test path; every member of each local double is exercised by that
  file's own tests (20/20 passing, confirmed above).

## Triage
verdict: confirmed — every cited range/excerpt reproduces exactly (b0448:140-176, b0450:158-192, harness:77-111); independent re-diff confirms b0450 is byte-identical to the harness export apart from the `export` keyword, and b0448 diverges only in readBytes' `hasOwnProperty` guard; the `^function fakeThetaLibFs` grep (2 hits, 140/158) and the import-block greps (neither file imports ./helpers/thetalib-load-harness) both reproduce; both bug docs read fixed (0.453.0/0.455.0) with 20/20 vitest passing at HEAD, and coverage-matrix/cross-bug-doc citation searches return 0 hits as claimed; dedupe verified directly — PTQ-0250 covers these same two files but a disjoint helper (REGISTRY), and PTQ-0310 covers this identical fakeThetaLibFs double but a disjoint file set (b0303/b0304/b0305/b0306) — so this is a distinct, non-duplicate residual of the same already-twice-confirmed D7 copy-paste-fixture/double class (PTQ-0232, PTQ-0310), confined to tests/ (triage: claude-opus-5)
