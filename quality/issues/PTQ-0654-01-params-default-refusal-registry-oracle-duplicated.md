---
id: PTQ-0654
title: params-default-empty-literal-refusal.test.ts re-reads and re-parses the four-page diagnostics registry instead of importing tests/helpers/registry-oracle.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-default-empty-literal-refusal.test.ts:133-157
  - tests/helpers/registry-oracle.ts:20-42
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# params-default-empty-literal-refusal.test.ts re-reads and re-parses the four-page diagnostics registry instead of importing tests/helpers/registry-oracle.ts

## Observation
tests/params-default-empty-literal-refusal.test.ts declares its own
module-scope `RegistryRow` interface (six fields: `code`, `namespace`,
`severity`, `phase`, `trigger`, `message`) and a `REGISTRY` constant that
reads the four sharded diagnostics-registry pages
(`code-registry-parse.md`, `code-registry-load.md`,
`code-registry-runtime.md`, `code-registry-host.md`), joins their raw text,
and passes the joined text through `parseRegistry`. `tests/helpers/registry-oracle.ts`
already exports the identical `RegistryRow` interface and a
`readRegistry(shards)` function whose `readRegistry(["parse", "load", "runtime", "host"])`
call — exported pre-computed as `REGISTRY` — performs the same read, join,
and parse over the same four pages.

## Evidence
tests/params-default-empty-literal-refusal.test.ts:133-157
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

The canonical read already exported for reuse, tests/helpers/registry-oracle.ts:20-42:
```ts
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
```

The `RegistryRow` field list (`code`/`namespace`/`severity`/`phase`/`trigger`/`message`)
is identical, field-for-field and order-for-order, between the two excerpts.
The read itself is the same operation over the same four page names, joined
with `"\n"` and parsed with the same `parseRegistry`; the only difference is
that the reviewed file writes the four-page shard list and join inline while
the helper takes the shard list as a parameter and is already invoked at
module scope elsewhere with `readRegistry(["parse", "load", "runtime", "host"])`
to produce an equivalent `REGISTRY` export.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states it was created because
this exact four-page read "were redeclared byte-for-byte … in several test
files" and centralises it "so each file's own `registryMessageOf` /
`registryRowOf`-shaped reader … stays local, parameterised by the `REGISTRY`
this module exports rather than by a locally re-parsed copy." The reviewed
file's `registryMessageOf` reader is exactly that per-file part the helper's
header anticipates staying local; the `RegistryRow` interface and the
`REGISTRY` read above it are the part the helper already centralises, and the
reviewed file re-executes that read locally instead of importing the export.

## Suggested direction (non-binding, optional)
tests/helpers/registry-oracle.ts's exported `REGISTRY` (built from
`readRegistry(["parse", "load", "runtime", "host"])`) already computes the
identical four-page array this file's local `REGISTRY` constant re-derives;
the file's own `registryMessageOf` reader is the part that legitimately
varies and would sit on top of the imported value.

## False-positive check
- Gate-pin: `tests/params-default-empty-literal-refusal.test.ts` does not
  match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate) — not a pinned-count gate.
- Recording-double: the `REGISTRY` value is a static markdown-derived array
  read once at module scope; nothing here records calls or backs a
  "never called" assertion, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "RegistryRow\|readRegistry" docs/bugs/0165-empty-params-default-literal-admitted-and-never-bound.md`
  → 0 hits. The bug document discusses the refusal contract's cells, never
  the registry-read plumbing, so there is no documented correct-reason for
  keeping the four-page read local to this file.
- coverage-matrix/bug-doc citation search: `grep -n "params-default-empty-literal-refusal" docs/reference/coverage-matrix.md`
  → 0 hits. `docs/bugs/0165-empty-params-default-literal-admitted-and-never-bound.md:998,1130`
  does cite this file by name in its witness list, but this finding proposes
  no merge, rename, or deletion of the file or any `it()`/`describe()` name —
  only that the local `RegistryRow`/`REGISTRY` block could import the
  existing helper's already-computed `REGISTRY` — so that citation is
  undisturbed.
- Coverage check: the claim is about a repeated harness DEFINITION (interface
  + a four-page read), not a missing test path; the file's own 39 cells are
  already exercised regardless of which module computes `REGISTRY`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match at the cited lines (test file :133-157, helper :20-42); the local RegistryRow interface diffs IDENTICAL to the helper's export and the local REGISTRY is the same parse/load/runtime/host read joined with "\n" through the same parseRegistry that tests/helpers/registry-oracle.ts:45 already exports as REGISTRY; the local copy's only consumer is registryMessageOf(:168) — the per-file reader the helper's header (PTQ-0215) deliberately leaves local; not a gate test, no recording double, the file is cited by bug 0165's witness list but no rename/merge/delete is proposed, coverage-matrix grep → 0 hits confirmed; no existing registry-oracle PTQ (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) cites this file and 30 test files already import the helper, so this is the same mechanical import-the-helper dedupe those precedents ratified (extraneous d4_class field on a D7 filing noted, not blocking) (triage: claude-fable-5-1)
