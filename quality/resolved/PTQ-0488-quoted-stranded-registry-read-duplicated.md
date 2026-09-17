---
id: PTQ-0488
title: Both bug-0176/0256 witness files redeclare the four-page RegistryRow/REGISTRY read tests/helpers/registry-oracle.ts already exports
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-quoted-field-name-refusal.test.ts:137-156
  - tests/inline-object-stranded-entry-refusal.test.ts:156-176
  - tests/helpers/registry-oracle.ts:1-46
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both bug-0176/0256 witness files redeclare the four-page RegistryRow/REGISTRY read tests/helpers/registry-oracle.ts already exports

## Observation
Both files in this review's scope independently declare a local `interface RegistryRow` (a two-field `{ code, message }` shape) and a local `const REGISTRY = parseRegistry([...four page names...].map(readFileSync...).join("\n"))` that reads the same four sharded diagnostics-registry pages (`code-registry-parse.md`, `code-registry-load.md`, `code-registry-runtime.md`, `code-registry-host.md`) through the same `parseRegistry` import. `tests/helpers/registry-oracle.ts` already exports an equivalent `RegistryRow`/`REGISTRY` pair built from the identical four-shard read via `readRegistry(["parse","load","runtime","host"])`, and that helper's own header states it exists because this exact read "were redeclared byte-for-byte (confirmed via `diff`) in several test files." Neither in-scope file imports from `tests/helpers/registry-oracle.ts`.

## Evidence

`tests/inline-object-quoted-field-name-refusal.test.ts:137-156` (re-read immediately before filing):
```ts
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

`tests/inline-object-stranded-entry-refusal.test.ts:156-176` (re-read immediately before filing; identical to the excerpt above apart from one added comment line before `const REGISTRY`):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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
```

`tests/helpers/registry-oracle.ts:1-46` — the canonical read, same four shards, same join, a `RegistryRow` shape that is a strict superset of both in-scope files' local interface:
```ts
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
): readonly RegistryRow[] { /* same four-shard readFileSync/join/parseRegistry chain */ }
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```

Exact search: `grep -n "interface RegistryRow\|^const REGISTRY" tests/inline-object-quoted-field-name-refusal.test.ts tests/inline-object-stranded-entry-refusal.test.ts` → both files carry the pattern at the lines cited under `locations`; `grep -n "registry-oracle" tests/inline-object-quoted-field-name-refusal.test.ts tests/inline-object-stranded-entry-refusal.test.ts` → 0 hits in both.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a fixture — the four-page sharded diagnostics-registry read — is re-implemented identically in the two files under review, where a canonical helper already exists under `tests/helpers/` for exactly this read, and that helper's own header names this pattern (byte-for-byte redeclaration across several test files) as its reason for existing. `readRegistry(["parse","load","runtime","host"])` produces the same four-page join both in-scope files build inline; each file's local `RegistryRow` is a narrower subtype (`code`/`message` only) of the helper's own `RegistryRow` (which also carries `namespace`/`severity`/`phase`/`trigger`), so each file is not merely unmigrated — it independently re-typed a fixture the helper already types more completely.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports a `REGISTRY` built from the identical four-shard read; that is the existing home each file's own read could import from instead of re-declaring the read locally. Each file's own `msg`/`registryMessageOf`-shaped renderer, which differs in wording and error framing between the two files, is unaffected by that swap.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited lines are a registry read, not a pinned count or inventory assertion.
- Recording-double check: this finding does not touch any recording double or MUST-NOT witness; the local `REGISTRY` is a static, parsed-once array read at module load, not a call-recording fake.
- docs/bugs/ signature search: `grep -rl "inline-object-quoted-field-name-refusal\|inline-object-stranded-entry-refusal" docs/bugs/*.md` returns 15 documents; both files are named as witness files (e.g. `docs/bugs/0176-...:992,997` and `docs/bugs/0256-...:635,648,800`), but every citation targets the file as a whole (a witness run, a `Tests N failed` line) or a specific test cell further down the file, never the `RegistryRow`/`REGISTRY` declaration lines cited here (137-156 / 156-176). Neither file is left red for a correct-reason documented in docs/bugs/ that this observation disturbs.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-quoted-field-name-refusal\|inline-object-stranded-entry-refusal" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either test file or any `it()`/`describe()` block — only that the module-scope registry-read block could import the existing helper — so no citation is affected.
- Coverage check: the claim is about a duplicated fixture-read DEFINITION, not a missing test path; every cell in both files is exercised by the file's own currently-passing or documented-red assertions, untouched by this observation.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both RegistryRow/REGISTRY blocks reproduce exactly at :137-156 and :156-176 and are byte-identical to each other bar the one doc-comment line (own diff, rc=0), matching tests/helpers/registry-oracle.ts:20-45's four-page readRegistry chain page-for-page; `registry-oracle` greps 0 in both files while 30 other test files import the helper; every REGISTRY consumer (msg/registryMessageOf via registryMessage, and A0's `.find(r => r.code ===)` at :407) reads only code/message, which the helper's superset row covers; both files are in tests/, match no gate pattern, 0 coverage-matrix citations, the 15 docs/bugs hits name them only as witness files, and `npx vitest run` shows 27/27 green so no documented-red is disturbed; none of the ten resolved registry-oracle PTQs (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) cites either file and the only tracked PTQs naming them (0104 caller-roster, 0205 diagLine) are different constructs — same confirmed D7 copy-paste-fixture class (triage: claude-fable-5-1)
