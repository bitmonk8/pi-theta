---
id: PTQ-0499
title: params-default-unresolvable-enum-variant and params-default-unterminated-literal-refusal each redeclare the RegistryRow interface and four-page REGISTRY parse instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-default-unresolvable-enum-variant.test.ts:321-345
  - tests/params-default-unterminated-literal-refusal.test.ts:170-193
  - tests/helpers/registry-oracle.ts:1-40
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# params-default-unresolvable-enum-variant and params-default-unterminated-literal-refusal each redeclare the RegistryRow interface and four-page REGISTRY parse instead of importing tests/helpers/registry-oracle.ts

## Observation
Both in-scope files independently declare a `RegistryRow` interface with the
same six fields and a module-scope `REGISTRY` constant that reads the same
four sharded diagnostics-registry pages
(`code-registry-{parse,load,runtime,host}.md`) through
`fileURLToPath(new URL(..., import.meta.url))` + `readFileSync` +
`parseRegistry`, joined and cast to `RegistryRow[]`. `tests/helpers/registry-
oracle.ts` already exports an identical `RegistryRow` interface and a
`REGISTRY` constant built from the same four shards, for the stated purpose
("PTQ-0215") of ending exactly this byte-for-byte redeclaration. Neither
in-scope file imports it; both import `parseRegistry` directly from
`../tools/code-registry/index.js` and re-derive the read.

## Evidence
`tests/params-default-unresolvable-enum-variant.test.ts:321-345`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
```
(the block continues to line 345 with the identical `.map(readFileSync...).join("\n")) as RegistryRow[];` tail.)

`tests/params-default-unterminated-literal-refusal.test.ts:170-193`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
```
(the block continues to line 193 with the identical `.map(readFileSync...).join("\n")) as RegistryRow[];` tail — `diff` of the two files' lines 321-345 vs 170-193 shows only the one doc-comment line differs.)

`tests/helpers/registry-oracle.ts:17-40` (the module neither file imports):
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

export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Exact search: `grep -n "^interface RegistryRow" tests/params-default-unresolvable-enum-variant.test.ts tests/params-default-unterminated-literal-refusal.test.ts` → one hit per file (line 321 and line 170 respectively); each is immediately followed by its own `const REGISTRY = parseRegistry(...)` reading the identical four page names.

## Why this is a problem
The same fourteen-line `RegistryRow` shape plus the same fifteen-line
four-page disk-read-and-parse sequence is written out independently in both
in-scope files, each reading all four registry shards even though each file's
own diagnostics of interest (`theta/parse/unknown-variant`,
`theta/parse/unknown-identifier`, `theta/parse/default-not-literal` in one
file; `theta/parse/unterminated-string`, `theta/parse/literal-newline-in-
string`, `theta/parse/params-default-type-mismatch`, `theta/load/params-type-
not-expression` in the other) sit in `code-registry-parse.md` alone.
`tests/helpers/registry-oracle.ts` exists for exactly this purpose — its own
header states it centralises the read because it "were redeclared byte-for-
byte (confirmed via `diff`) in several test files" — and exports both the
`RegistryRow` type and the parsed `REGISTRY` array either file could import
unchanged.

## Suggested direction (non-binding, optional)
Each file's local `REGISTRY` constant and `RegistryRow` interface could be
replaced with an import of `REGISTRY` / `RegistryRow` from
`tests/helpers/registry-oracle.ts`; the header's own guidance is that each
file's `registryMessageOf`/`registryRowOf`/`msg`-shaped reader function stays
local since its assertion style varies per file, only the underlying page
read is meant to be shared.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); this is not
  a census/pin gate.
- Recording-double check: `parseRegistry`/`registryMessage` parse a static doc
  page into rows and read a message template; neither is a recording double
  and no assertion here is a "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "registry-oracle" docs/bugs/*.md` →
  0 hits; no open bug documents a rationale for either file re-parsing the
  registry locally instead of importing the shared helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-default-unresolvable-enum-variant\|params-default-unterminated-
  literal-refusal" docs/reference/coverage-matrix.md` → 0 hits. Both bug docs
  (0185/0197 and 0239) cite these test files as their witness, but neither
  names or pins the `RegistryRow` interface or the `REGISTRY` constant
  declaration, and this finding proposes no change to any `it()`/`describe()`
  name, count, or assertion — only that the constant's own read could draw
  from the already-existing shared parse — so the citation carve-out does not
  bind.
- Intake self-check: `grep -rl "params-default-unresolvable-enum-variant\|
  params-default-unterminated-literal-refusal\|params-defaults.test" quality/
  intake/*.md quality/resolved/*.md` → only PTQ-0058 (unrelated: a dead
  export) and PTQ-0226 (unrelated: corpus discovery harness) reference either
  file, neither about the registry read.
- Coverage check: the claim is about a read-and-parse sequence reimplemented
  in two files rather than a missing test path; both files' existing tests
  are unaffected.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both RegistryRow/REGISTRY blocks reproduce at the cited lines (321-345 and 170-193) and my own diff shows only the one doc-comment line differs; neither file imports tests/helpers/registry-oracle (each imports parseRegistry/registryMessage straight from ../tools/code-registry/index.js) while the helper exports an identical RegistryRow and the same four-shard REGISTRY and is live with 30 test importers; both sites are in tests/, are not gate/pin files, have no coverage-matrix or bug-doc rationale for a local re-parse (the lone docs/bugs grep hit, 0123:1000 'four registry-oracle guards', is an unrelated phrase, not the helper module), and neither file is cited by any prior registry-oracle PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0404/0411/0412), so this is genuine D7 boilerplate/copy-paste-fixture duplication with a mechanical dedupe (triage: claude-fable-5-1)
