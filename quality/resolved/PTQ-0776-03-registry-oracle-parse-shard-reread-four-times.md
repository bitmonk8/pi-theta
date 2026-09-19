---
id: PTQ-0776
title: Four in-scope live cells re-read and re-parse the code-registry-parse.md shard directly instead of importing tests/helpers/registry-oracle.ts's shared readRegistry/REGISTRY
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts:95-110
  - tests/live/inline-field-name-not-identifier-live-cell.test.ts:72-84
  - tests/live/inline-object-empty-field-type-truncation-live-cell.test.ts:88-109
  - tests/live/inline-object-field-name-case-live-cell.test.ts:66-78
  - tests/helpers/registry-oracle.ts:1-40
sites: 4
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Four in-scope live cells re-read and re-parse the code-registry-parse.md shard directly instead of importing tests/helpers/registry-oracle.ts's shared readRegistry/REGISTRY

## Observation
Four of the five in-scope files that read a registered diagnostic's *Message*
column each import `parseRegistry`/`registryMessage` directly from
`../../tools/code-registry/index.js` and independently `readFileSync` +
`parseRegistry` the single `docs/spec_topics/diagnostics/code-registry-parse.md`
shard into a module-scope `REGISTRY` constant. `tests/helpers/registry-oracle.ts`
already exists to do exactly this read (its own header states it centralises
the registry-page read "because `RegistryRow` and the `REGISTRY` load it
backs ... were redeclared byte-for-byte ... in several test files") and
exports both a parametrised `readRegistry(shards)` and a ready-built
`REGISTRY` covering all four shards (`parse`, `load`, `runtime`, `host`),
which a caller needing only `parse`-shard codes can still query by code
without any behavioural difference (`registryMessage` looks up by `code`
across whatever rows it is given).

## Evidence
`tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts:95-110`:
```ts
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
...
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

Re-read immediately before filing, the `REGISTRY` declaration (lines
103-110 there) is byte-identical at the other three sites:
`tests/live/inline-field-name-not-identifier-live-cell.test.ts:77-84`,
`tests/live/inline-object-empty-field-type-truncation-live-cell.test.ts:102-109`,
and `tests/live/inline-object-field-name-case-live-cell.test.ts:71-78` — each
confirmed via `diff` reporting zero differences against the first site's
block.

`tests/helpers/registry-oracle.ts:1-40` — the canonical helper, already
built for this exact read:
```ts
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
...
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

## Why this is a problem
The helper's own header comment names the exact defect these four files
reproduce: an independently re-parsed `REGISTRY` read, byte-for-byte
identical across files, of the diagnostics-registry pages. Each of the four
in-scope files performs that same independent read rather than importing
`readRegistry`/`REGISTRY` from the module that already exists specifically
to prevent it — while keeping the file-local *fragment*-formatting function
(`registryFragment`/`notIdentFragment`/`caseNoteFragment`/`bindingCaseFragment`)
local, exactly as the helper's own design intends ("each file's own ...
reader ... stays local, parameterised by the `REGISTRY` this module
exports").

## Suggested direction (non-binding, optional)
Each of the four files' `REGISTRY` declaration could be replaced by importing
`REGISTRY` (or `readRegistry(["parse"])`) from `tests/helpers/registry-oracle.ts`,
leaving each file's own fragment-formatting function untouched, exactly as
the helper's header already anticipates for other callers.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `REGISTRY`/`registryMessage` read a static
  documentation table into rows; no call recording or "never called"
  witness is involved, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "registry-oracle\|readRegistry"
  docs/bugs/0135*.md docs/bugs/0228*.md docs/bugs/0237*.md docs/bugs/0154*.md`
  → 0 files; none of the bug documents these four files witness states a
  rationale for re-parsing the registry shard locally instead of importing
  the helper.
- coverage-matrix/bug-doc citation search: `grep -n
  "index-sentinel-typeenv-case-fence-live-cell\|inline-field-name-not-identifier-live-cell\|inline-object-empty-field-type-truncation-live-cell\|inline-object-field-name-case-live-cell"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that the
  registry READ could be shared while each file's own fragment-formatter
  stays local.
- Coverage check: the claim is entirely about a repeated read of a static
  documentation table, not a missing test path; all four copies are
  exercised by the tests in their own files.
- Pre-existing filings check: `grep -rl "registry-oracle.ts\|readRegistry"
  quality/intake/*.md` before filing turned up prior findings on this exact
  canonical-helper-vs-reimplementation shape
  (`qw20260917154546-d7-73-registry-descriptor-fragment-helper-duplicated.md`,
  `qw20260917154546-d7-02-live-cells-bypass-registry-oracle-helper.md`, and
  others) but none of them cites any of the four files in this review's
  scope, so this finding is not a duplicate.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the 8-line `REGISTRY = parseRegistry(readFileSync(...code-registry-parse.md...))` block is byte-identical (diff: zero differences) at index-sentinel-typeenv-case-fence-live-cell.test.ts:103-110, inline-field-name-not-identifier-live-cell.test.ts:77-84, inline-object-empty-field-type-truncation-live-cell.test.ts:102-109 and inline-object-field-name-case-live-cell.test.ts:71-78; tests/helpers/registry-oracle.ts exports `readRegistry(["parse"])` (already consumed that way by tests/alias-sink-array-element-check.test.ts:129) and `registryMessage` is a plain `find(row.code === code)` so the swap is behaviour-neutral; all four locations are under tests/, none is a gate test, coverage-matrix and bugs 0135/0154/0228/0237 name neither the files nor a local-reparse rationale (0 hits re-run); no resolved/open PTQ row or sibling intake filing (incl. d7-99-01, d7-02-live-cells-bypass) cites any of these four files, so this is a new site set of the PTQ-0215 shape, not a duplicate — D7 copy-paste-fixture class, mechanical dedupe (triage: claude-fable-5-1)
