---
id: PTQ-0649
title: Both reviewed files re-read and re-parse the four sharded code-registry pages into their own REGISTRY constant instead of importing tests/helpers/registry-oracle.ts's REGISTRY
lens: D7
status: open
verdict: confirmed
locations:
  - tests/par-body-restriction-registry-rows.test.ts:114-146
  - tests/par-for-body-return-refusal.test.ts:123-142
  - tests/helpers/registry-oracle.ts:1-40
sites: 2
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both reviewed files re-read and re-parse the four sharded code-registry pages into their own REGISTRY constant instead of importing tests/helpers/registry-oracle.ts's REGISTRY

## Observation
tests/par-body-restriction-registry-rows.test.ts and
tests/par-for-body-return-refusal.test.ts each build their own module-scope
`REGISTRY` by reading `code-registry-parse.md`, `code-registry-load.md`,
`code-registry-runtime.md` and `code-registry-host.md` off disk, joining the
text, and calling the shared `parseRegistry` from `tools/code-registry/index.js`
over the join. tests/helpers/registry-oracle.ts already performs exactly this
read (same four shard names, same join, same `parseRegistry` call) and
exports the result as `REGISTRY`; its own header comment states it exists
because this four-page read "were redeclared byte-for-byte (confirmed via
`diff`) in several test files" — the two reviewed files reproduce that same
redeclaration a further two times.

## Evidence
tests/par-body-restriction-registry-rows.test.ts:114-146 (re-read immediately before filing):
```ts
const REGISTRY_PAGES = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
] as const;

const REGISTRY_PAGE_LIST = REGISTRY_PAGES.map(
  (page) => `docs/spec_topics/diagnostics/${page}`,
).join(", ");

function readCorpus(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  );
}

const REGISTRY_TEXT = REGISTRY_PAGES.map((page) =>
  readCorpus(`docs/spec_topics/diagnostics/${page}`),
).join("\n");

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as readonly RegistryRow[];
```

tests/par-for-body-return-refusal.test.ts:123-142 — the same four shard
names, joined and parsed through the same `parseRegistry`, read directly
rather than through the `readCorpus` indirection:
```ts
/**
 * The live registry, read from the spec corpus — the DIAG-4 message oracle
 * (the same source, and the same reader, the production emitters' messages are
 * transcribed from). Sharded across the four `code-registry-*.md` pages.
 */
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
) as readonly { readonly code: string; readonly message: string }[];
```

tests/helpers/registry-oracle.ts:1-40 — the canonical, already-exported
equivalent (same four shard names, same join, same `parseRegistry` call, same
`RegistryRow` field set):
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
...
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** Read only the requested shards, preserving page-specific registry oracles. */
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

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Search: `grep -rl "helpers/registry-oracle" tests/*.test.ts` → 30 files
already import this module (neither reviewed file among them); both reviewed
files independently declare `const REGISTRY = parseRegistry(...)` over the
identical four shard names.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s `RegistryRow` interface (`code`,
`namespace`, `severity`, `phase`, `trigger`, `message`) is byte-identical, field
for field, to the `RegistryRow` interface
tests/par-body-restriction-registry-rows.test.ts:137-144 declares locally, and
both files' `REGISTRY` values are produced by joining the same four shard
files' text in the same order and calling the same `parseRegistry`. 30 other
files already import the shared module's `REGISTRY` rather than re-deriving
it, which is what the module's own header comment says it was extracted to
stop.

## Suggested direction (non-binding, optional)
tests/helpers/registry-oracle.ts's `REGISTRY` export (or `readRegistry`, for a
narrower shard subset) is the home both files' own local reads already
duplicate in shape; each file's own `shardedRow`/`registryMessageFor`-style
reader can stay local per the module's stated intent, parameterised by the
imported constant rather than a locally re-parsed copy.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or a listed gate kin; the
  cited lines are a registry-read helper definition, not a pinned count or
  inventory assertion.
- Recording-double: `REGISTRY` is a parsed data array, not a call-recording
  double; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "REGISTRY = parseRegistry" docs/bugs/*.md`
  → no hits; no documented correct-reason red discusses this duplication for
  either bug 0200 or bug 0223.
- coverage-matrix/bug-doc citation search: `grep -n
  "par-body-restriction-registry-rows\|par-for-body-return-refusal"
  docs/reference/coverage-matrix.md` → 0 hits for both. This finding proposes
  no merge, rename, or deletion of either file or any `it()`/`describe()` —
  only that the shared registry-read could be imported rather than
  re-derived — so no citation is affected.
- Overlap check: neither file appears in `locations` of any already-filed
  registry-oracle-duplication finding this wave (checked by name against the
  supplied already-filed list; PTQ-0208, the resolved readCorpus-duplication
  finding, names par-body-restriction-registry-rows.test.ts only for its
  separate `readCorpus`/`linesOf` helper trio, not for this `REGISTRY`/
  `RegistryRow`/`parseRegistry` read, which is a distinct declaration this
  finding cites independently).
- Coverage-drift check: the claim is about a repeated data-read definition
  already covered by an existing exported helper, not about a missing test
  path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts match verbatim at the cited lines (A:114-146 with a byte-identical six-field RegistryRow; B:123-142), both REGISTRY constants are live (A: lines 154-167/385/415/469; B: line 161 via registryMessage) and are built from the same four shards, same join order and same parseRegistry as tests/helpers/registry-oracle.ts:20-45's exported REGISTRY, whose header names exactly this redeclaration as its reason to exist; `grep -rl helpers/registry-oracle tests/*.test.ts` → 30 and neither file among them; neither file is a gate kin, is cited by docs/reference/coverage-matrix.md, or appears in any existing PTQ's locations (PTQ-0208 names A only for readCorpus/linesOf; this wave's other registry-oracle candidates cite different files), and PTQ-0404/PTQ-0412 set the confirmed-and-fixed precedent for per-file-set re-declarations of this helper; note A's raw-text `REGISTRY_TEXT` scan (shardedCells, line 217) is a legitimate local need the helper does not export, so only the parsed REGISTRY/RegistryRow pair is the mechanical dedupe (triage: claude-fable-5-1)
