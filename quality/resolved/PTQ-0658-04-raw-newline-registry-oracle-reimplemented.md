---
id: PTQ-0658
title: params-default-string-literal-raw-newline.test.ts re-parses the four-page diagnostics registry instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-default-string-literal-raw-newline.test.ts:196-220
  - tests/helpers/registry-oracle.ts:19-40
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# params-default-string-literal-raw-newline.test.ts re-parses the four-page diagnostics registry instead of importing tests/helpers/registry-oracle.ts

## Observation
tests/params-default-string-literal-raw-newline.test.ts declares its own
`interface RegistryRow` (six fields: `code`, `namespace`, `severity`,
`phase`, `trigger`, `message`) and its own module-scope `REGISTRY` constant,
built by reading the same four sharded pages
(`code-registry-{parse,load,runtime,host}.md`) off disk with `readFileSync`
and joining them through the real `parseRegistry`. tests/helpers/registry-oracle.ts
already exports an identically-shaped `RegistryRow` interface and an
identically-built `REGISTRY` constant over the same four shards, with its own
header stating this exact read "were redeclared byte-for-byte (confirmed via
`diff`) in several test files" and that the module exists to centralise it.
The in-scope file does not import from tests/helpers/registry-oracle.ts.

## Evidence

tests/params-default-string-literal-raw-newline.test.ts:196-220 (re-read immediately before filing):
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
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:19-40 (the canonical shape and read):
```ts
/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
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

The in-scope file's own doc comment above its `REGISTRY` constant — "The live
four-page sharded registry — the input tests/code-registry.test.ts
reconciles." — is copied character-for-character from the canonical helper's
own doc comment on its `REGISTRY` export, over the identical four shard
names, joined the identical way.

## Why this is a problem
The `RegistryRow` interface (same six fields, same order) and the `REGISTRY`
load (same four shards, same `readFileSync` + `parseRegistry` + `join("\n")`
pipeline, the same doc comment word for word) are reimplemented locally
rather than imported from tests/helpers/registry-oracle.ts, whose own header
states it exists precisely because this read "were redeclared byte-for-byte
... in several test files" — a rationale that names this file's own shape,
not a rationale this file's own comments state for keeping its copy
independent. The file's local `registryMessageOf`/`registryRowOf` readers
(the assertion-style layer the helper's header explicitly leaves local) are
untouched by this observation.

## Suggested direction (non-binding, optional)
Importing `REGISTRY` and `RegistryRow` from tests/helpers/registry-oracle.ts
in place of the local interface and the local `parseRegistry`/`readFileSync`
read is the path the helper's own header already points every affected file
toward.

## False-positive check
- Gate-pin: tests/params-default-string-literal-raw-newline.test.ts does not
  match `*gate*.test.ts` or a listed gate kin; the cited lines are a registry
  read/type declaration, not a pinned count or inventory (the file's own
  registry-row assertions elsewhere pin specific rows, not this shape).
- Recording-double: `REGISTRY` is a parsed static table read once at module
  load; it records no calls and backs no MUST-NOT-called witness, so the
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "interface RegistryRow"
  docs/bugs/*.md` → no hits; no documented correct-reason red discusses this
  registry-read duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-default-string-literal-raw-newline" docs/reference/coverage-matrix.md`
  → 0 hits; the bug 0102 doc cites the file for its reproduction role, never
  for the `RegistryRow`/`REGISTRY` definition site. This finding proposes no
  merge, rename or deletion of any `it()`/`describe()` — only that a locally
  re-parsed registry table could be imported instead — so no citation is
  disturbed.
- Overlap check: `grep -rl "params-default-string-literal-raw-newline"
  quality/intake/*.md quality/resolved/*.md` (run before writing this file)
  found only `qw20260917154546-d7-113-02-fieldof-params-accessor-quintuplicated.md`
  (a different root cause — a `fieldOf` accessor, not the registry read) and
  the already-resolved `PTQ-0212-loadcleanly-harness-duplication.md` (the
  `loadCleanly`/`diagLines`/`diagCodes` duplication, a distinct helper family
  from `RegistryRow`/`REGISTRY`); no prior finding names this file's registry
  re-parse.

## Triage
verdict: confirmed — re-verified independently: both excerpts reproduce verbatim at the cited lines (test:196-220 six-field RegistryRow + four-page parseRegistry/readFileSync/join("\n") read with the helper's doc comment word-for-word; registry-oracle.ts:19-40 canonical superset, differing only in export/readonly type and `../` depth), the file imports nothing from tests/helpers/registry-oracle (30 other test files do), its only REGISTRY consumers (registryMessage(REGISTRY, code) at :228, REGISTRY.find at :238) accept the helper's readonly RegistryRow[] unchanged, both looked-up codes (literal-newline-in-string, default-not-literal) sit on code-registry-parse.md which the shared four-page REGISTRY joins, stated searches reproduce (docs/bugs "interface RegistryRow" 0 hits; coverage-matrix 0 citations), no gate-pin/recording-double/documented-red carve-out applies and the file's header states no rationale for a local copy; none of the eleven resolved registry-oracle PTQs (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) nor any open issue cites this file, and the only other quality mentions (PTQ-0212 loadCleanly, PTQ-0303 recover-declared-defaults, sibling d7-113-02 fieldOf) are distinct root causes — same confirmed D7 copy-paste-fixture class (triage: claude-fable-5-1)
