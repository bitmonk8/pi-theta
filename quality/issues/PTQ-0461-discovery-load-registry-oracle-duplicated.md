---
id: PTQ-0461
title: The code-registry-load.md Message-template reader (RegistryRow/REGISTRY/loadRowMessage/interpolate/hitsFor) is redeclared byte-identically across six discovery test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discovery-cli-entry-override-prefix.test.ts:97-130
  - tests/discovery-glob-universe-enumeration-failure.test.ts:180-211
  - tests/discovery-root-enumeration-failure.test.ts:160-191
  - tests/discovery-symlinked-root-classification.test.ts:73-105
  - tests/discovery-tree-walk-lstat-failure.test.ts:95-127
  - tests/load-warning-delivery.test.ts:114-145
  - tests/helpers/registry-oracle.ts:1-45
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The code-registry-load.md Message-template reader (RegistryRow/REGISTRY/loadRowMessage/interpolate/hitsFor) is redeclared byte-identically across six discovery test files

## Observation
Six test files each declare, at module scope, the same five-piece block: a
`RegistryRow` interface (six string fields), a `REGISTRY` constant built by
`readFileSync` + `parseRegistry` over
`docs/spec_topics/diagnostics/code-registry-load.md`, a `loadRowMessage(code)`
function that looks up the row's Message template and asserts it is defined,
an `interpolate(template, subs)` function that fills `<placeholder>` slots by
regex replace, and (in four of the six) a `hitsFor(diagnostics, code, file)`
filter helper. Two of the six files are in this review's scope
(`discovery-cli-entry-override-prefix.test.ts`,
`discovery-glob-universe-enumeration-failure.test.ts`); the block in both is
byte-identical to each other and near-byte-identical (comment wording only)
to the same block in the other four files. `tests/helpers/registry-oracle.ts`
already exports the identical `RegistryRow` shape and a `readRegistry(shards)`
function whose `readRegistry(["load"])` call performs the identical
single-page `readFileSync` + `parseRegistry` read these six files each
re-derive by hand; no helper yet generalises the `loadRowMessage`/
`interpolate`/`hitsFor` half of the block, which is the sibling
`tests/helpers/load-row-harness.ts`'s role for the `code-registry-parse.md`
page.

## Evidence

tests/discovery-cli-entry-override-prefix.test.ts:97-130:
```ts
interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/** The row's normative Message template (DIAG-4), asserted present loudly so a
 *  registry rename fails naming the unmet precondition instead of skipping. */
function loadRowMessage(code: string): string {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    message,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry ` +
      `the Message row for ${code}`,
  ).toBeDefined();
  return message!;
}

/** Interpolate a registry Message template's `<placeholder>` slots. */
function interpolate(template: string, subs: Record<string, string>): string {
  return template.replace(/<([a-z-]+)>/g, (whole, name: string) => subs[name] ?? whole);
}
```

tests/discovery-glob-universe-enumeration-failure.test.ts:180-211 — the same
five pieces, verified byte-identical except one comment's wording
("asserted present loudly." vs "...loudly so a registry rename fails naming
the unmet precondition instead of skipping."):
```ts
interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/** The row's normative Message template (DIAG-4), asserted present loudly. */
function loadRowMessage(code: string): string {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    message,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry ` +
      `the Message row for ${code}`,
  ).toBeDefined();
  return message!;
}
```

tests/helpers/registry-oracle.ts:17-45 — the canonical `RegistryRow` shape
and single/multi-page reader the six files' `REGISTRY` constants re-derive by
hand (`readRegistry(["load"])` produces the same array as each file's own
`parseRegistry(readFileSync(...code-registry-load.md...))` call):
```ts
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          fileURLToPath(
            new URL(`../../docs/spec_topics/diagnostics/code-registry-${shard}.md`, import.meta.url),
          ),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
```

Exact search and hash check (re-run immediately before filing):
`grep -n "^interface RegistryRow\|^const REGISTRY = parseRegistry\|^function loadRowMessage\|^function interpolate\|^function hitsFor" tests/discovery-cli-entry-override-prefix.test.ts tests/discovery-glob-universe-enumeration-failure.test.ts tests/discovery-root-enumeration-failure.test.ts tests/discovery-symlinked-root-classification.test.ts tests/discovery-tree-walk-lstat-failure.test.ts tests/load-warning-delivery.test.ts`
finds the same four/five declarations in all six files, at the line ranges
listed above. `md5sum` over each file's `interpolate` function body
(`awk '/^function interpolate/,/^}/'` per file) returns the identical hash
`68398c88c3dad04cf3bb7a100b9244aa` in all six files. `md5sum` over
`loadRowMessage` returns the identical hash
`20ae4faf00b058402fc06e33d40f7500` in five of the six files; the sixth
(`discovery-symlinked-root-classification.test.ts`) differs only in where a
long string literal is line-wrapped (`diff` shows a two-line string split at
a different point, same characters). `hitsFor` (present in
`discovery-cli-entry-override-prefix.test.ts:201`,
`discovery-glob-universe-enumeration-failure.test.ts:422`,
`discovery-root-enumeration-failure.test.ts:376`,
`discovery-tree-walk-lstat-failure.test.ts:315`) is byte-identical across
all four occurrences (`awk '/^function hitsFor/,/^}/'` per file, diffed
pairwise, shows no difference):
```ts
function hitsFor(
  diagnostics: readonly Diagnostic[],
  code: string,
  file: string,
): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code && d.file === file);
}
```

## Why this is a problem
This is the "Boilerplate duplication" class: the same registry-page read,
the same `RegistryRow` shape, the same Message-template lookup-and-assert
function, and the same placeholder-interpolation function are declared six
separate times rather than imported once, and a fourth small filter helper
(`hitsFor`) is declared four separate times on top of that. Two existing
helpers already generalise pieces of this block: `tests/helpers/load-row-harness.ts`
exports the analogous `registryMessageOf`/`PARSE_REGISTRY`/`PARSE_REGISTRY_PATH`
for the sibling `code-registry-parse.md` page (per PTQ-0206/PTQ-0207, cited
in its own header comment), and `tests/helpers/registry-oracle.ts` exports a
`RegistryRow` type and a `readRegistry(shards)` function whose
`readRegistry(["load"])` call performs exactly the `readFileSync` +
`parseRegistry` read over `code-registry-load.md` alone that all six files'
`REGISTRY` constants re-derive by hand. Neither existing helper's
lookup-and-assert-and-interpolate pair (`loadRowMessage`/`interpolate`) has a
load-registry counterpart yet, so the six files also re-derive that half of
the block identically to each other.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `readRegistry(["load"])` already
produces the same `RegistryRow[]` these six files' `REGISTRY` constants build
by hand; a `loadRowMessage`/`interpolate`-equivalent built on top of it,
mirroring `tests/helpers/load-row-harness.ts`'s `registryMessageOf` for the
sibling page, is the natural home the six identical blocks already point
at — naming that existing pair of sibling-module shapes is observation, not
a design for the change.

## False-positive check
- Gate-pin check: none of the six files matches `*gate*.test.ts` or the
  named gate kin — not applicable.
- Recording-double check: `hitsFor` is a plain array filter over diagnostics
  already produced by the seam under test, not a recording double backing a
  "never called" witness — the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "loadRowMessage\|code-registry-load" docs/bugs/*.md`
  finds bug documents that describe the discovery/load defects each file
  tests, but none states a reason the six files' registry readers must
  diverge or stay file-local; none documents this duplication as a
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn "discovery-cli-entry-override-prefix\|discovery-glob-universe-enumeration-failure" docs/reference/coverage-matrix.md docs/bugs/*.md` returns no hit outside each file's own self-reference; this finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the shared registry-reading code is duplicated.
- Coverage check: the claim is about repeated helper DEFINITIONS reading an
  already-read registry page, not a missing test path; each copy is
  exercised by its own file's tests.
- Prior-finding overlap check: `grep -rl "loadRowMessage" quality/intake quality/resolved` returns only `PTQ-0262-root-enumeration-red-titles-stale.md`, an unrelated stale-title finding about the same file, not about this duplication. The pending `qw20260917154546-d7-03-b0461-ancestors-mergedirs-quintupled.md` finding covers a *different* duplicated block (`ancestors`/`mergeDirs`/`ReaddirDenied`) in an overlapping but non-identical file set. The pending `qw20260917154546-d7-01-registry-oracle-bundle-redeclared-twice.md` and `qw20260917154546-d7-01-registry-oracle-read-duplicated-three-files.md` findings cover the *four-page-joined* `registry-oracle.ts` `REGISTRY` re-derivation in five other, non-overlapping files — none of the six files cited here appears in either of those findings' locations, and neither of those findings' evidence cites `loadRowMessage`/`interpolate`/`hitsFor`; this finding is about the single-page `code-registry-load.md` reader-plus-Message-template block specifically.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all five declarations sit at the cited lines in all six files (own grep), own md5 over the awk-extracted bodies gives one hash per piece across all six for RegistryRow (a8f224db), REGISTRY (bd0b9f69), interpolate (68398c88) and across 5/6 for loadRowMessage (20ae4faf; discovery-symlinked-root-classification differs only in where the DIAG-4 string literal wraps — own diff) and one hash for hitsFor across the four files that declare it (4ce2d7d1); none of the six imports tests/helpers/registry-oracle, whose readRegistry(["load"]) is a drop-in (already used single-shard by acceptance-stderr-gate/alias-sink-array-element-check) and every code the six look up (5 theta/load/* codes) is on code-registry-load.md; all sites in tests/, no gate file, bug docs 0013/0075/0076/0078/0113 cite these files only as witnesses by cell count and pin no registry-read mechanics, coverage-matrix 0 hits, no it()/describe() change proposed; not a duplicate — none of the six files appears in any resolved registry-oracle PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) or in the two pending d7-01 registry-oracle intakes (disjoint file sets), and the pending d7-103-01 and d7-03-b0461 intakes cite different blocks in load-warning-delivery/the discovery files — same D7 copy-paste-fixture class as PTQ-0313/0404 (single-page narrow reads included); minor: title's "six discovery test files" miscounts (load-warning-delivery is not a discovery file) and "byte-identically" is overstated for comment/wrap variance the body itself discloses, non-blocking (triage: claude-fable-5-1)
