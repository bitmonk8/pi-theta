---
id: PTQ-0498
title: Three in-scope files hand-roll the diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/pattern-field-literal-integer-narrowing-refusal.test.ts:143-158
  - tests/plain-for-loop-variable-element-type.test.ts:150-160
  - tests/placeholder-rendering.test.ts:30-46
  - tests/helpers/registry-oracle.ts:1-42
sites: 3
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Three in-scope files hand-roll the diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises

## Observation
All three files in scope read one or more `docs/spec_topics/diagnostics/code-registry-*.md` pages, run them through `parseRegistry` from `tools/code-registry/index.js`, and build a local `RegistryRow[]` — each with its own `readFileSync` + `fileURLToPath` + `new URL(...)` boilerplate and its own local `RegistryRow` interface. `tests/helpers/registry-oracle.ts` already exists to do exactly this: it exports `readRegistry(shards)` and a pre-built `REGISTRY` constant, and its own header comment states the read "were redeclared byte-for-byte (confirmed via `diff`) in several test files" before that helper was cut. None of the three in-scope files import it.

## Evidence

`tests/helpers/registry-oracle.ts:17-42` — the canonical helper:
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

`tests/pattern-field-literal-integer-narrowing-refusal.test.ts:143-158` — single-shard reimplementation (equivalent to `readRegistry(["parse"])`):
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY_TEXT = readRepoFile(REGISTRY_PARSE_PAGE);
const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

`tests/plain-for-loop-variable-element-type.test.ts:150-160` — the same single-shard read, second reimplementation:
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — this file's only message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

`tests/placeholder-rendering.test.ts:30-46` — the four-shard read, matching `readRegistry(["parse","load","runtime","host"])` field-for-field except for the dropped `namespace`/`severity`/`phase`/`trigger` fields the caller never reads:
```ts
interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY_TEXT = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
].map((page) =>
  readFileSync(
    fileURLToPath(
      new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
    ),
    "utf8",
  ),
).join("\n");
```
and `tests/placeholder-rendering.test.ts:181` re-parses this same text inside a single `it` block: `const registry = parseRegistry(REGISTRY_TEXT) as RegistryRow[];`.

Search performed: `grep -n "REGISTRY_TEXT\|REGISTRY_PAGE\|REGISTRY_PARSE_PAGE\|parseRegistry\|readFileSync\|RegistryRow"` against each of the three in-scope files — 3 distinct read-and-parse sites, one per file, all functionally equivalent to a `readRegistry([...])` call.

## Why this is a problem
`tests/helpers/registry-oracle.ts` was cut specifically because this exact read (`readFileSync` + `fileURLToPath` + `parseRegistry` over one or more `code-registry-*.md` shards, joined with `"\n"`) had been redeclared byte-for-byte across test files; its own header names that as the reason for its existence. The three in-scope files each carry their own copy of that same read — two single-shard (`parse`-only) copies and one four-shard copy that reproduces the helper's own default `REGISTRY` shard list — none importing the shared module. Each copy also re-declares its own narrower local `RegistryRow` interface (dropping fields the canonical one carries), so the three files diverge slightly in shape while doing the identical file-read-and-parse work.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `readRegistry` (or its default `REGISTRY` export, for the four-shard case) is already shaped to serve all three read sites; each file's own downstream oracle function (`row`, `registered`, the inline `it`-scoped parse) is file-specific and would stay local, parameterised by the shared array instead of a private re-parse of the same page text.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts` or the named gate-kin patterns; the registry read is setup, not a pinned census.
- Recording-double check: not applicable — this is a file-read helper, not a call-recording double.
- docs/bugs/ signature search: `grep -rn "pattern-field-literal-integer-narrowing-refusal\|placeholder-rendering\|plain-for-loop-variable-element-type" docs/bugs/` finds `tests/placeholder-rendering.test.ts:123-124` and `:110` cited in docs/bugs/0036 and 0037 as the pinned category-5 rendering vectors — those lines are untouched by this finding, which targets only the registry-text construction at lines 30-46 and 181; no proposal here to merge, rename, or delete the cited lines.
- coverage-matrix citation search: no in-scope file name appears in docs/reference/coverage-matrix.md.
- Confirmed this stays inside tests/: all three cited files and the canonical helper are under tests/; no production code is targeted.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all four excerpts match verbatim at the cited lines; none of the three files imports tests/helpers/registry-oracle (grep exit 1; helper has 30 importers, landed 2026-09-11 under PTQ-0215 after all three files were authored), each local read resolves the same code-registry-*.md paths with the same "\n" join and a field-subset RegistryRow, so each is a drop-in for readRegistry([...])/REGISTRY; no gate file, coverage-matrix has 0 hits, and the one docs/bugs citation the filing missed (0189:389,777 → placeholder-rendering.test.ts:35–47/:181–186) is a read-only sources inventory in a fixed bug, not a witness list; no tracked PTQ (0404/0411/0412/0327/0260/0313/0311/0275/0250/0237/0222/0215) names these three files (triage: claude-fable-5-1)
