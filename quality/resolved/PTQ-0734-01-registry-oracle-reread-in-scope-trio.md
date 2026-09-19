---
id: PTQ-0734
title: All three in-scope files redeclare the RegistryRow/REGISTRY diagnostics-registry read that tests/helpers/registry-oracle.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/unresolved-annotation-lowering.test.ts:172-201
  - tests/unterminated-literal-params-type-refusal.test.ts:132-153
  - tests/unterminated-template-lexer-emission.test.ts:72-87
sites: 3
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# All three in-scope files redeclare the RegistryRow/REGISTRY diagnostics-registry read that tests/helpers/registry-oracle.ts already exports

## Observation
`tests/helpers/registry-oracle.ts` exports a `RegistryRow` interface, a
`readRegistry(shards)` function and a pre-built four-shard `REGISTRY` constant,
built by reading `docs/spec_topics/diagnostics/code-registry-{parse,load,
runtime,host}.md`, concatenating them, and parsing the joined text through the
real `parseRegistry`. Each of the three files in this review's scope
independently re-declares its own `RegistryRow` interface and its own
`readFileSync` + `parseRegistry` read of the same pages (all four shards in
two files, the `parse` shard alone in the third) rather than importing the
shared module.

## Evidence

tests/unresolved-annotation-lowering.test.ts:172-201:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles and the
// same composition tests/ctor-unresolved-schema-name.test.ts reads for this
// exact row.
const REGISTRY_TEXT = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
]
  .map((page) =>
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  )
  .join("\n");

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

tests/unterminated-literal-params-type-refusal.test.ts:132-153:
```ts
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

tests/unterminated-template-lexer-emission.test.ts:72-87:
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
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];
```

Compare `tests/helpers/registry-oracle.ts:16-49`:
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
The shard set, the per-page `readFileSync` + URL-join construction, and the
`parseRegistry` call over the joined text are the same operation the helper
already performs; `readRegistry(["parse"])` would satisfy the third file's
single-shard need exactly as its bespoke `REGISTRY` build does.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states it exists because
`RegistryRow`/`REGISTRY` "were redeclared byte-for-byte … in several test
files," and centralises exactly that read so each caller's own
message-reading logic can stay local. All three files in this review's scope
re-derive the identical read independently instead of importing the shared
module, so a change to the shard list, the join separator, or the `.md`
filename convention needs the identical edit made three more times inside
this file set alone.

## Suggested direction (non-binding, optional)
Each file could import `REGISTRY` (or call `readRegistry([...])` for the
single-shard case) from `tests/helpers/registry-oracle.ts` and drop its local
`RegistryRow` interface and read, keeping each file's own `unresolvedMessage`
/ `msg` / `normativeMessage` reader function exactly as it is today.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: none of the three reads is a recording double or a
  MUST-NOT witness; each is a plain read-and-parse of static registry text.
- docs/bugs/ signature search: `grep -rl "RegistryRow" docs/bugs/0028*
  docs/bugs/0232* docs/bugs/0246*` finds no hits — no bug document states a
  rationale for re-deriving this read locally rather than importing the
  shared helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "unresolved-annotation-lowering\|unterminated-literal-params-type-refusal\|unterminated-template-lexer-emission"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only to where
  the registry-read construction is defined — so no cited test identity
  moves.
- Coverage check: the claim is entirely about a repeated construction that
  already has a canonical home (`tests/helpers/registry-oracle.ts`), not
  about a missing test path.
- Confirmed prior-filing non-overlap: none of the three files in scope
  appears in any already-filed or resolved finding about
  `tests/helpers/registry-oracle.ts` or a `RegistryRow`/`REGISTRY`
  redeclaration (`grep -rl` over `quality/intake/` and `quality/resolved/`
  for each of the three file names returns only one unrelated hit, about a
  different `expectGroup` harness, for the third file).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: all three RegistryRow/parseRegistry blocks reproduce verbatim at the cited lines (unresolved-annotation-lowering:172-201 and unterminated-literal-params-type-refusal:132-153 are the same four-shard readFileSync+join the helper's REGISTRY performs at registry-oracle.ts:31-49 bar `../` depth; unterminated-template-lexer-emission:72-87 is the parse-shard-only read readRegistry(["parse"]) covers), 0 `helpers/registry-oracle` imports in the three files vs 30 elsewhere in tests/, every code each file looks up (13 total, all on code-registry-parse.md, one also on load) is on a page the shared rows join and each local RegistryRow is a subset of the helper's, the helper header's "redeclared byte-for-byte … in several test files" rationale is real, docs/bugs 0028/0232/0246 and coverage-matrix greps return 0 as stated, no gate/recording-double carve-out applies (constants back registryMessage/.find lookups), and no existing PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cite other file sets) or sibling intake (d7-161-02 cites the scripted complete() mock at :106-133; d7-03 an expectGroup harness) tracks these three files — same confirmed D7 copy-paste-fixture class as PTQ-0404/PTQ-0412 (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
