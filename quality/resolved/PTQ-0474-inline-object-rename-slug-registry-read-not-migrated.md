---
id: PTQ-0474
title: Both files re-declare the four-page registry read instead of importing tests/helpers/registry-oracle.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-wire-name-rename-refusal.test.ts:185-208
  - tests/inline-slug-name-reservation.test.ts:138-163
  - tests/helpers/registry-oracle.ts:1-46
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both files re-declare the four-page registry read instead of importing tests/helpers/registry-oracle.ts

## Observation
Both files in scope declare their own `interface RegistryRow` plus a
`const REGISTRY = parseRegistry([...four page names...].map(...).join("\n")) as RegistryRow[]`
block that reads the same four diagnostics-registry pages
(`code-registry-parse.md`, `-load.md`, `-runtime.md`, `-host.md`) through the
same `parseRegistry` import. `tests/helpers/registry-oracle.ts` already
exports exactly this read as `RegistryRow` / `readRegistry` / `REGISTRY`, and
its own header comment states it exists because this exact block "were
redeclared byte-for-byte (confirmed via `diff`) in several test files."
Neither file in this review's scope imports from that helper.

## Evidence

`tests/inline-object-wire-name-rename-refusal.test.ts:185-208`:
```typescript
interface RegistryRow {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
  readonly namespace: string;
  readonly phase: string;
}

const DIAGNOSTICS_DIR = "../docs/spec_topics/diagnostics/";

function readDiagnosticsPage(page: string): string {
  return readFileSync(fileURLToPath(new URL(`${DIAGNOSTICS_DIR}${page}`, import.meta.url)), "utf8");
}

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
```

`tests/inline-slug-name-reservation.test.ts:138-163` (same four page names,
same `parseRegistry(...).join("\n")` chain, same `as RegistryRow[]` cast; here
`RegistryRow`'s six fields — `code`, `namespace`, `severity`, `phase`,
`trigger`, `message` — match the canonical helper's exported interface
field-for-field and in the same order):
```typescript
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
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

`tests/helpers/registry-oracle.ts:1-46` (the canonical helper; its exported
`RegistryRow` is verbatim identical, field-for-field and in the same order, to
the interface `inline-slug-name-reservation.test.ts` redeclares above):
```typescript
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only...

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
): readonly RegistryRow[] { /* ... */ }

export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Import-site count: `grep -l "from \"./helpers/registry-oracle\"" tests/*.test.ts` returns 30 files repository-wide; neither `tests/inline-object-wire-name-rename-refusal.test.ts` nor `tests/inline-slug-name-reservation.test.ts` appears in that list — both still carry a local `RegistryRow`/`REGISTRY` declaration instead.

## Why this is a problem
Both files independently re-implement, rather than import, a twenty-plus-line
four-page registry read that a canonical helper under `tests/helpers/`
already exists to replace and whose own doc comment names exactly this
redeclaration shape as the reason it was created. The two in-scope files are
not even consistent with each other in what they redeclare: one file's local
`RegistryRow` is a narrower five-field shape lacking `trigger`, while the
other file's local `RegistryRow` independently arrives at all six fields of
the canonical helper's exported interface, field order included — evidence
that both are reconstructing the same upstream shape from the same `.md`
source rather than sharing one type.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s exported `REGISTRY`
(`readRegistry(["parse","load","runtime","host"])`) is the same four-page
union both files read locally; importing it in place of each local
declaration is the shape the helper's own header already describes as its
purpose.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: `REGISTRY`/`RegistryRow` is a static read of documentation pages, not a recording double; not applicable.
- docs/bugs/ signature search: `grep -rn "inline-object-wire-name-rename-refusal.test.ts\|inline-slug-name-reservation.test.ts" docs/bugs/` returns citations naming specific test cells (e.g. bug 0160's own coordination note, bug 0040's fixture table) by section/cell label, not by the line ranges under evidence here (185-208 / 138-163); this finding does not propose merging, renaming, or deleting either test file, only its local registry-read declaration.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-wire-name-rename-refusal\|inline-slug-name-reservation" docs/reference/coverage-matrix.md` returns no hits; no pinning citation is affected.
- Coverage check: this finding does not claim any behaviour is untested; it is confined to a duplicated fixture-read declaration inside tests that already exist and already exercise the registry rows they read.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts match verbatim at tests/inline-object-wire-name-rename-refusal.test.ts:185-208 and tests/inline-slug-name-reservation.test.ts:138-163; tests/helpers/registry-oracle.ts:20-46 exports the same four-shard read (file 2's local RegistryRow is byte-identical to the helper's; file 1's five-field variant only ever reads .code/.severity/.namespace + registryMessage, all covered by the helper's type); grep confirms 30 importers of ./helpers/registry-oracle and neither file among them; coverage-matrix has no hits and docs/bugs cite no line ranges in the affected blocks; no tracked PTQ names either file for this root cause (PTQ-0205 is the diagLine helper; same-wave sibling d7-01-ajv-emitted is the ajv builder) — the same copy-paste-fixture class already ratified in PTQ-0215/0404/0411/0412; note file 1's readDiagnosticsPage is still needed for placeholder-rendering-b.md at :853, so only the RegistryRow/REGISTRY block is the dedupe target (triage: claude-fable-5-1)
