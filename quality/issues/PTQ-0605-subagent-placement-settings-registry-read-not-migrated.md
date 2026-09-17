---
id: PTQ-0605
title: subagent-placement-settings.test.ts hand-rolls a single-shard code-registry-load.md read instead of importing tests/helpers/registry-oracle.ts's readRegistry(["load"])
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-placement-settings.test.ts:27-29
  - tests/helpers/registry-oracle.ts:1-39
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-placement-settings.test.ts hand-rolls a single-shard code-registry-load.md read instead of importing tests/helpers/registry-oracle.ts's readRegistry(["load"])

## Observation
tests/subagent-placement-settings.test.ts imports `parseRegistry` (and
`registryMessage`) directly from `../tools/code-registry/index.js` and, at
module scope, reads `docs/spec_topics/diagnostics/code-registry-load.md`
through `readFileSync`/`fileURLToPath`, passing the result through
`parseRegistry` into a locally-typed `REGISTRY` constant.
`tests/helpers/registry-oracle.ts` already exports a parameterised
`readRegistry(shards)` function that performs the identical
`readFileSync`+`fileURLToPath`+`parseRegistry` read over any subset of the
four sharded registry pages — including `readRegistry(["load"])`, the exact
single-page read this file needs — but this file does not import from that
helper module.

## Evidence

tests/subagent-placement-settings.test.ts:27-29 (re-read immediately before filing):
```ts
const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url)), "utf8"),
) as { code: string; message: string; trigger: string }[];
```

tests/helpers/registry-oracle.ts:1-39 — the already-exported equivalent
(re-read immediately before filing):
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

`readRegistry(["load"])` reads the identical single page
(`code-registry-load.md`) this file reads inline. This file's local
anonymous type (`code`/`message`/`trigger`) is a 3-field subset of the
helper's 6-field `RegistryRow`, and every field this file reads
(`registryMessage(REGISTRY, code)` plus a direct `.find(row => row.code ===
INVALID_ENTRY)` on `trigger`) is present on the helper's export under the
identical name.

Exact search: `grep -l 'readFileSync(fileURLToPath(new
URL("../docs/spec_topics/diagnostics/code-registry-load.md"'
tests/*.test.ts` → 1 file: tests/subagent-placement-settings.test.ts (the
only file that inlines a single-page `code-registry-load.md` read in this
exact literal-URL form).

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: the four-page-parameterised
registry read `tests/helpers/registry-oracle.ts` centralises specifically so
call sites do not each hand-roll `readFileSync`+`fileURLToPath`+
`parseRegistry` is re-implemented here for a subset (one page) the helper's
own `readRegistry(shards)` signature already accepts. The helper module's own
header states its reason for existing: "`RegistryRow` and the `REGISTRY` load
it backs ... were redeclared byte-for-byte (confirmed via `diff`) in several
test files. This module centralises that read only."

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `readRegistry(["load"])` already
performs the identical single-page read this file inlines; this file's own
`registryMessage`/row lookups (the part that varies per file) could sit on
top of that call rather than a locally re-parsed copy.

## False-positive check
- Gate-pin: `tests/subagent-placement-settings.test.ts` does not match
  `*gate*.test.ts` or any named kin; nothing here asserts a pinned count or
  inventory, so the census/pin carve-out does not apply.
- Recording-double: the cited code is a registry-page parse and lookup, not a
  fake/double that records calls to witness a MUST-NOT; not applicable.
- docs/bugs/ signature search: `grep -rl "subagent-placement-settings"
  docs/bugs/*.md` → 0 hits. Not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-placement-settings" docs/reference/coverage-matrix.md` → 0 hits.
  This finding proposes no merge, rename, or deletion of the file or any of
  its `describe`/`it` blocks — only that the already-existing helper
  module's parameterised registry read could be reused in place of the
  locally retyped single-page equivalent.
- Coverage check: the claim is entirely about a repeated fixture DEFINITION
  inside one file, not a missing test path.
- Overlap check: `grep -rl "subagent-placement-settings" quality/intake/*.md
  quality/resolved/*.md` → one hit before this filing,
  qw20260917154546-d7-140-04-settings-merge-filespec-harness-mirrored.md,
  which cites this same file's `HOME`/`CWD`/`PROJECT_PATH`/`GLOBAL_PATH`/
  `build`/`byCode` settings-loading harness (lines 18-38) as mirrored from
  tests/settings-merge.test.ts — a distinct fixture (the FakeFileSystem
  settings-file builder) from the `REGISTRY` diagnostics-page read this
  finding cites (lines 27-29); that finding's evidence does not mention
  `parseRegistry`, `readFileSync`, or `code-registry-load.md`, so no
  already-filed candidate names this root cause.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/subagent-placement-settings.test.ts:27-29 reproduces verbatim (inline readFileSync+fileURLToPath+parseRegistry of code-registry-load.md into a local {code,message,trigger}[] type) and its only consumers are registryMessage(REGISTRY, …) at :72,:140 and REGISTRY.find(r => r.code…).trigger at :117 — all three fields present by name on tests/helpers/registry-oracle.ts's RegistryRow (:22,:26,:27), whose readRegistry(shards) (:31-45, drifted from the cited 1-39) resolves the identical page for ["load"]; the exact literal grep reproduces at 1 file; single-shard readRegistry(["host"])/(["parse"]) migrations already ratified in PTQ-0404 (acceptance-stderr-gate:494, alias-sink:129) and PTQ-0411 (sites: 1) are the same class; not a *gate* test, 0 hits in docs/bugs and coverage-matrix (re-run), and no resolved/open PTQ or intake filing names this file's registry read — sibling intake d7-140-04's 18-38 range encloses these lines numerically but its evidence is the HOME/CWD/build/byCode settings harness and never mentions REGISTRY/parseRegistry, a distinct root cause (triage: claude-fable-5-1)
