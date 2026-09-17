---
id: PTQ-0634
title: two in-scope files re-read and re-parse code-registry-parse.md instead of calling tests/helpers/registry-oracle.ts's readRegistry(["parse"])
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/match-pattern-increment-decrement.test.ts:94-110
  - tests/member-access-declared-field-type.test.ts:154-167
  - tests/helpers/registry-oracle.ts:1-39
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# two in-scope files re-read and re-parse code-registry-parse.md instead of calling tests/helpers/registry-oracle.ts's readRegistry(["parse"])

## Observation
tests/match-pattern-increment-decrement.test.ts and
tests/member-access-declared-field-type.test.ts each import `parseRegistry`
directly from `../tools/code-registry/index.js`, declare their own local
`RegistryRow` interface, and read `docs/spec_topics/diagnostics/code-registry-parse.md`
off disk via `readFileSync`/`fileURLToPath`/`import.meta.url` to build their
own `REGISTRY` constant. `tests/helpers/registry-oracle.ts` already performs
and exports exactly this read — a `RegistryRow` interface, a
`readRegistry(shards)` function, and a `REGISTRY` constant — parameterised so
that `readRegistry(["parse"])` reads the identical single page
(`code-registry-parse.md`) through the same `parseRegistry` call. Neither file
imports from that helper module.

## Evidence

tests/match-pattern-increment-decrement.test.ts:94-110:
```ts
const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY_TEXT = readRepoFile(REGISTRY_PARSE_PAGE);

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];
```

tests/member-access-declared-field-type.test.ts:154-167:
```ts
// ===========================================================================
// The DIAG-4 oracle.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The parse-phase registry table, read from the spec corpus (DIAG-4). */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];
```

tests/helpers/registry-oracle.ts:1-39 — the already-exported equivalent,
parameterised to read exactly this one page:
```ts
// The shared four-page diagnostics-registry read (PTQ-0215).
//
// WHY THIS FILE EXISTS. `RegistryRow` and the `REGISTRY` load it backs — read
// the four sharded registry pages (code-registry-{parse,load,runtime,host}.md),
// parse each through the real `parseRegistry`, and join the rows into one
// array — were redeclared byte-for-byte (confirmed via `diff`) in several test
// files. This module centralises that read only: each file's own
// `registryMessageOf` / `registryRowOf`-shaped reader...stays local,
// parameterised by the `REGISTRY` this module exports rather than by a
// locally re-parsed copy.
...
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
```

Both in-scope files use a strict subset of the helper's six-field
`RegistryRow` (`code`/`severity`/`phase`/`trigger`/`message` in the first
file; `code`/`message` in the second) — every field either file reads is
present on the helper's export under the identical name, and
`readRegistry(["parse"])` reads the identical single page in the identical
way (`parseRegistry` over the raw text read via `readFileSync` +
`fileURLToPath` + `import.meta.url`).

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: the registry-page read is a
fixture (a parsed view of a spec-normative diagnostics table) that
`tests/helpers/registry-oracle.ts` already centralises under that name, for
this exact reason — its own header states it exists because the read "were
redeclared byte-for-byte...in several test files." Both in-scope files
redeclare the same `readFileSync`/`fileURLToPath`/`parseRegistry` sequence
against the same page rather than calling the exported, shard-parameterised
`readRegistry`.

## Suggested direction (non-binding, optional)
Each file's own message/hint interpolation helper (`opMessage`/`registryHint`
in the first file, `msg` in the second) is already file-specific by the
helper module's own stated design and could sit on top of
`readRegistry(["parse"])` rather than a locally re-parsed copy.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named gate kin;
  neither asserts a pinned corpus count or inventory as its subject, so the
  census/pin carve-out does not apply.
- Recording-double: the cited code is a registry-page parse and lookup, not a
  fake/double recording calls to witness a MUST-NOT; not applicable.
- docs/bugs/ signature search: both files are pinned to open bugs (0123 and
  0136 respectively) whose documents are cited throughout each file; neither
  bug document's signature concerns the registry-read mechanism itself, and
  this finding does not propose these files are red for a documented reason —
  it addresses only the duplicated read.
- coverage-matrix/bug-doc citation search: `grep -rl
  "match-pattern-increment-decrement.test.ts\|member-access-declared-field-type.test.ts"
  docs/reference/coverage-matrix.md docs/bugs/` → only each file's own bug
  document names it as its own witness (0123 and 0136 respectively); no
  cross-citation from another bug's witness list. This finding proposes no
  merge, rename, or deletion of either file or any `describe`/`it` block —
  only that the already-existing helper's parameterised read could be reused
  in place of the locally re-parsed copy.
- Coverage check: the claim concerns a repeated fixture DEFINITION inside two
  files already in scope, not a missing test path or an opinion on test
  count.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: both local RegistryRow/REGISTRY parse-page reads reproduce verbatim at the cited lines (match-pattern-increment-decrement:94-110 five-field row, member-access-declared-field-type:154-168 two-field row), 0 `helpers/registry-oracle` imports in either file vs 30 elsewhere in tests/, every code either file looks up (11 distinct theta/parse/* codes) is present on code-registry-parse.md so readRegistry(["parse"]) yields the identical rows, no gate/recording-double carve-out applies and no merge/rename/delete is proposed, not a duplicate (no PTQ among 0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412 cites these files; sibling intake d7-110-02 claims the DiagShape/readRepoFile scaffold in other files, a different root cause) — same confirmed D7 copy-paste-fixture class as PTQ-0313/0327/0404 which already include single-page narrow reads; fixer note: in match-pattern-increment-decrement the raw REGISTRY_TEXT/readRepoFile/REGISTRY_PARSE_PAGE must STAY because registryHint (:147-166) parses the Hint column from raw text, which parseRegistry drops and readRegistry does not expose — only the RegistryRow interface and `REGISTRY = parseRegistry(...)` dedupe there, so the filing's direction is partly wrong for registryHint; minor: the filing's docs/bugs grep claim is inaccurate (bugs 0158/0221/0234 also cite the first file, 0190-0194 the second), non-blocking since the carve-out concerns merge/rename/delete only (triage: claude-fable-5-1)
