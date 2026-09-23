---
id: PTQ-1321
title: escaped-quote-inline-field-name-refusal.test.ts re-declares the four-page registry read and message renderer that tests/helpers/registry-oracle.ts already exports
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/escaped-quote-inline-field-name-refusal.test.ts:153-208
  - tests/helpers/registry-oracle.ts:1-40
  - tests/helpers/registry-oracle.ts:88-124
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# escaped-quote-inline-field-name-refusal.test.ts re-declares the four-page registry read and message renderer that tests/helpers/registry-oracle.ts already exports

## Observation
`tests/escaped-quote-inline-field-name-refusal.test.ts` reads the four sharded
diagnostics-registry pages, parses them with `parseRegistry`, and defines its
own `msg()` / `render()` / `renderAll()` trio to compose `severity code:
message` strings with placeholder substitution. `tests/helpers/registry-oracle.ts`
already exports exactly this: a `readRegistry`/`REGISTRY` four-page read, an
`Exp` interface, and `render`/`renderAll` functions with the identical
`` `${exp.severity} ${exp.code}: ${...}` `` composition, built on
`registryMessageOf`. The test file imports neither `REGISTRY`, `Exp`, `render`,
nor `renderAll` from the helper module and instead reimplements the same
four-page read and rendering logic locally.

## Evidence
`tests/escaped-quote-inline-field-name-refusal.test.ts:153-208`:
```ts
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map(readDiagnosticsPage)
    .join("\n"),
) as RegistryRow[];
...
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  ...
}
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}
function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}
```

`tests/helpers/registry-oracle.ts:29-40` (the same four-page read, exported):
```ts
export function readRegistry(
  shards: readonly ("parse" | "load" | "runtime" | "host")[],
): readonly RegistryRow[] {
  return parseRegistry(
    shards
      .map((shard) =>
        readFileSync(
          repoFile(`docs/spec_topics/diagnostics/code-registry-${shard}.md`),
          "utf8",
        ),
      )
      .join("\n"),
  ) as RegistryRow[];
}
```

`tests/helpers/registry-oracle.ts:80-124` (the same `Exp` shape and
`render`/`renderAll` composition, already exported):
```ts
export interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}
...
export function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/", exp.code, exp.fills)}`;
}
export function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}
```

The three raw-key code constants the test file declares locally
(`RENAMED_INLINE`, `QUOTED_INLINE`, `DUPLICATE_INLINE`, at lines 165-167) are
the exact same three diagnostic codes the helper's `RENAMED`/`QUOTED`/`DUP`
builders (`tests/helpers/registry-oracle.ts:88,92,96`) already wrap.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states it exists because this
exact four-page read, "placeholder interpolation, pointer-message composition
… were redeclared byte-for-byte … in several test files" and centralises it so
new files can reuse the shared read instead of adding another copy. The
`escaped-quote-inline-field-name-refusal.test.ts` `REGISTRY`/`Exp`/`msg`/
`render`/`renderAll` block (lines 153-208) is that same read and composition,
declared locally in a file that does not import the helper at all — the
canonical helper this file's own boilerplate class was built to retire exists,
and this file was not migrated to it.

## Suggested direction (non-binding, optional)
The natural home for this file's `REGISTRY`/`Exp`/`render`/`renderAll` block is
`tests/helpers/registry-oracle.ts`'s existing exports of the same shapes; this
is an observation about where the duplication already lives, not a design for
the migration.

## False-positive check
- Gate-pin check: this file is not named `*gate*.test.ts` and carries no
  pinned-count census; not applicable.
- Recording-double check: `render`/`renderAll`/`msg` are pure formatting
  helpers, not negative-witness doubles; not applicable.
- docs/bugs/ signature search: `grep -rn "escaped-quote-inline-field-name-refusal" docs/bugs/` returns citations in bugs 0229, 0231, 0232, 0233, 0235, 0238 — all name this test file as a witness/lock for its diagnostic-inventory assertions, not for the `REGISTRY`/`render`/`renderAll` scaffolding this finding targets. This finding does not propose merging, renaming, or deleting the test, only observes that its registry-read/composition scaffolding duplicates an existing helper, so the citations are unaffected.
- coverage-matrix citation search: `grep -rn "escaped-quote-inline-field-name-refusal" docs/reference/coverage-matrix.md` returns no hits.
- This claim does not propose "a test should exist" or judge coverage — it cites code that exists in both files and the duplication between them.

## Triage
verdict: confirmed — independently re-verified: the local block reproduces at tests/escaped-quote-inline-field-name-refusal.test.ts:145-208 (RegistryRow/DIAGNOSTICS_DIR/readDiagnosticsPage, four-shard REGISTRY at :153-162, RENAMED_INLINE/QUOTED_INLINE/DUPLICATE_INLINE at :165-167, Exp at :171-175, msg/render/renderAll at :184-208) and is live (renderAll passed to expectGroupShared at :324); tests/helpers/registry-oracle.ts exports the same four-shard REGISTRY (:29-42, :78), the byte-identical Exp (:80-84), the same three code constants wrapped by DUP/QUOTED/RENAMED (:86-98) and the same `${severity} ${code}: …` render/renderAll (:111-118); the test file's imports (:1-9) name only vitest, node:fs/url, code-registry/index.js, src/parser/* and ./helpers/e2e-s1 — registry-oracle is never imported; both locations under tests/, D7 boilerplate-duplication class; not a gate file, no recording double, docs/bugs 0229/0231/0232/0233/0235/0238 cite the file as a witness only and no merge/rename/delete is proposed, coverage-matrix grep = 0; dedupe: no PTQ lists this file as a filed location — PTQ-1055/1058 (resolved) name it only in their out-of-scope sizing lists, PTQ-0864 (resolved) explicitly confined itself to two other files, PTQ-0777/1091 cite disjoint hosts — so this is the untracked residue of that cohort; fixer note: the only per-file variance is msg()'s assertion wording, which the helper's header expressly allows to stay local, so the REGISTRY read, Exp, the three builders and render/renderAll are the mechanical dedupe target (triage: claude-fable-5-1)
