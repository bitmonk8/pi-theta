---
id: PTQ-0750
title: Both inline-object test files re-declare the four-page registry read instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-empty-object-type.test.ts:121-140
  - tests/inline-object-duplicate-field-name.test.ts:151-170
  - tests/helpers/registry-oracle.ts:1-46
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# Both inline-object test files re-declare the four-page registry read instead of importing tests/helpers/registry-oracle.ts

## Observation
Both files in scope open with a byte-for-byte identical `interface RegistryRow { readonly code: string; readonly message: string; }` plus a `const REGISTRY = parseRegistry([...four page names...].map(readFileSync...).join("\n"))` block that reads the same four diagnostics-registry pages (`code-registry-parse.md`, `-load.md`, `-runtime.md`, `-host.md`) through the same `parseRegistry` import. `tests/helpers/registry-oracle.ts` already exports exactly this read as `RegistryRow` / `readRegistry` / `REGISTRY`, with a header comment stating it exists because this exact block "were redeclared byte-for-byte (confirmed via `diff`) in several test files" and that the fix was to centralise the read while leaving each file's own message-rendering helper local. 30 other test files under `tests/` already import `REGISTRY` (or `readRegistry`) from that helper; the two files in this review's scope do not.

## Evidence

`tests/inline-empty-object-type.test.ts:121-140`:
```typescript
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

`tests/inline-object-duplicate-field-name.test.ts:151-170` (identical shape, same four page names, same `readFileSync`/`fileURLToPath`/`.join("\n")` chain, same `as RegistryRow[]` cast):
```typescript
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:1-46` (the canonical helper, whose own header names this exact redeclaration pattern as its reason for existing):
```typescript
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only: each file's own
// `registryMessageOf` / `registryRowOf`-shaped reader — whose assertion style
// and wording vary per file — stays local, parameterised by the `REGISTRY` this
// module exports rather than by a locally re-parsed copy.
```

Import-site count: `grep -l "from \"./helpers/registry-oracle\"" tests/*.test.ts` returns 30 files (e.g. `tests/absent-member-presence-gate.test.ts`, `tests/acceptance-stderr-gate.test.ts`, `tests/alias-sink-array-element-check.test.ts`, `tests/annotation-nontype-text-refusal.test.ts`, `tests/annotation-root-brace-union-lowering.test.ts`, …); neither `tests/inline-empty-object-type.test.ts` nor `tests/inline-object-duplicate-field-name.test.ts` appears in that list — both still carry a local `RegistryRow`/`REGISTRY` declaration instead.

## Why this is a problem
The two files in scope duplicate, verbatim, a 20-line block that a canonical helper under `tests/helpers/` already exists to replace, and that helper's own doc comment describes exactly this shape (`interface RegistryRow` + a four-page `parseRegistry(...).join("\n")` read) as the redeclaration it was created to end. The local `RegistryRow` interface in each scope file is a narrower shape (`code`/`message` only) than the helper's exported `RegistryRow` (which also carries `namespace`/`severity`/`phase`/`trigger`), so the two files are not merely unmigrated — they independently re-typed a fixture the helper already types more completely.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY` (`readRegistry(["parse","load","runtime","host"])`) is the same four-page union both files read locally; importing it in place of the local declaration is the shape the helper's own header already describes as its purpose.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: `REGISTRY`/`RegistryRow` is a static read of documentation, not a recording double; not applicable.
- docs/bugs/ signature search: `grep -rn "inline-empty-object-type.test.ts\|inline-object-duplicate-field-name.test.ts" docs/bugs/` returns dozens of citations, all naming specific test cells/line-ranges as witnesses of already-fixed bugs (0045, 0052, 0093, 0159, 0160, 0161, 0176, 0228, 0233, 0245, 0262, 0263, 0421); none of those citations concern the `RegistryRow`/`REGISTRY` block itself (all cite cell bodies further down each file), and this finding does not propose merging, renaming, or deleting either test file — only its local registry-read declaration.
- coverage-matrix/bug-doc citation search: both files are cited by name and by absolute line range in many docs/bugs/*.md entries (e.g. `docs/bugs/0093-...:78`, `docs/bugs/0176-...:1036`); those citations target specific `it(...)` cells, not the lines under evidence here (121-140 / 151-170), and no citation is to the registry-declaration block itself.
- Coverage drift: this finding does not claim any behaviour is untested; it is confined to a duplicated fixture declaration inside tests that already exist.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce byte-for-byte at tests/inline-empty-object-type.test.ts:121-140 and tests/inline-object-duplicate-field-name.test.ts:151-170 (identical `interface RegistryRow {code,message}` + four-page `parseRegistry(...readFileSync...).join("\n")` read); tests/helpers/registry-oracle.ts:20-46 exports the same read as `REGISTRY`/`readRegistry` with a header naming this exact redeclaration as its reason for existing; `grep -l 'from "./helpers/registry-oracle"' tests/*.test.ts` = 30 and neither in-scope file imports it (grep -n registry-oracle on both = 0 hits); D7 copy-paste-fixture class, both locations under tests/, no gate file, no docs/bugs or coverage-matrix citation of lines 121-140/151-170; not a duplicate — no open/resolved PTQ names either file for this root cause (PTQ-0205 cites :249/:332, the local message-rendering helper the oracle header deliberately leaves local; PTQ-0404/0411/0412 cover other file sets and were accepted as distinct per-file-set rows), and sibling candidate d7-66 covers the fixture builder at :221-266/:301-353 only (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
