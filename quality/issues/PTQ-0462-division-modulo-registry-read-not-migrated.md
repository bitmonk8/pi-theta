---
id: PTQ-0462
title: division-result-type-number.test.ts hand-rolls the code-registry-parse.md RegistryRow/REGISTRY read instead of importing tests/helpers/registry-oracle.ts's readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/division-result-type-number.test.ts:188-200
  - tests/modulo-zero-result-type-number.test.ts:211-223
  - tests/helpers/registry-oracle.ts:20-49
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# division-result-type-number.test.ts hand-rolls the code-registry-parse.md RegistryRow/REGISTRY read instead of importing tests/helpers/registry-oracle.ts's readRegistry

## Observation
`tests/division-result-type-number.test.ts` declares a local `RegistryRow` interface (5 fields: `code`/`severity`/`phase`/`trigger`/`message`) and a module-scope `REGISTRY` constant built by `readFileSync`-ing `docs/spec_topics/diagnostics/code-registry-parse.md` and passing it through `parseRegistry` directly. `tests/helpers/registry-oracle.ts` already exports a `RegistryRow` interface (a superset: the same 5 fields plus `namespace`) and a parameterised `readRegistry(shards)` function that performs the identical `readFileSync`+`parseRegistry` read over any subset of the four sharded registry pages, including `readRegistry(["parse"])` — the exact single-page read this file needs. `tests/division-result-type-number.test.ts` does not import from that helper module. The identical local block recurs byte-for-byte in `tests/modulo-zero-result-type-number.test.ts`.

## Evidence

`tests/division-result-type-number.test.ts:188-200`:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — the DIAG-4 oracle for this file. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

`tests/modulo-zero-result-type-number.test.ts:211-223` — the identical block, confirmed via `diff` to differ only in the preceding comment above the interface declaration:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — the DIAG-4 oracle for this file. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

`tests/helpers/registry-oracle.ts:20-49` — the already-exported equivalent, parameterised by shard, whose header states it exists precisely so this read is not redeclared per file (PTQ-0215):
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

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
export const REGISTRY: readonly RegistryRow[] = readRegistry(["parse", "load", "runtime", "host"]);
```
`readRegistry(["parse"])` would read exactly the one page (`code-registry-parse.md`) both reviewed files need, through the same `parseRegistry` call, into a `RegistryRow[]` whose 5 fields this file reads are all present (as a subset) on the helper's own 6-field `RegistryRow`.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: a fixture — the single-page diagnostics-registry read — is re-implemented in `tests/division-result-type-number.test.ts` even though a canonical helper for exactly that read (`tests/helpers/registry-oracle.ts`'s `readRegistry`) already exists under that name and already accepts a shard subset, and even though the identical local re-implementation is independently repeated in a second file (`tests/modulo-zero-result-type-number.test.ts`). The helper module's own header explains its reason for existing ("were redeclared byte-for-byte ... in several test files. This module centralises that read only"), and this reviewed file's read is that same shape, just narrowed to one shard — the exact usage the helper's `shards` parameter was built to support.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts`'s `readRegistry(["parse"])` already covers the read both reviewed files hand-roll; each file's own `registered`/`fill` readers (the part that varies per file) could sit on top of the imported result rather than a locally re-parsed copy.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); nothing cited here is a pinned count or inventory assertion.
- Recording-double check: `REGISTRY`/`registered` read an already-parsed, static markdown-derived array; they record no calls and back no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "RegistryRow\|readRegistry" docs/bugs/` → 0 hits naming this duplication as a documented correct-reason design; docs/bugs/0142-division-result-type-not-number.md and docs/bugs/0152-modulo-zero-result-type-not-number.md discuss cell dispositions, never the registry-read plumbing.
- coverage-matrix/bug-doc citation search: `grep -n "division-result-type-number.test.ts\|modulo-zero-result-type-number.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` name — only that the local `RegistryRow`/`REGISTRY` block could import the existing helper's `readRegistry(["parse"])` — so no witness-list citation is disturbed.
- Coverage check: the claim is entirely about a repeated fixture DEFINITION, not a missing test path; every code path cited is exercised by both files' own passing tests.
- Prior-finding overlap check: grepped this wave's already-filed d7-01..d7-09 titles and the supplied already-filed/resolved list for "division-result-type-number", "modulo-zero-result-type-number", and "registry-oracle" together — the existing registry-oracle-non-use candidates in this wave (`registry-oracle-reread-two-files`, `b0261-registry-oracle-reimplemented`) cite `brace-and-angle-annotation-junk-refusal.test.ts`/`brace-rooted-union-arm-capture.test.ts` and `b0261-envelope-parse-failed-message-prefix-registry.test.ts` respectively — disjoint file sets from this finding's two files — so this is not a re-file of either.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the 13-line RegistryRow/REGISTRY_PAGE/REGISTRY blocks at division-result-type-number.test.ts:188-200 and modulo-zero-result-type-number.test.ts:211-223 are byte-identical (diff clean), neither file imports tests/helpers/registry-oracle.ts (grep → 0 hits), both consume REGISTRY only via registryMessage(REGISTRY, code) so the helper's readRegistry(["parse"]) (6-field RegistryRow superset, same parseRegistry over the same page — already the ratified shape at tests/alias-sink-array-element-check.test.ts:129 from PTQ-0404) is a drop-in; not a gate test, no recording double, no rename/merge/delete, docs/bugs and coverage-matrix searches re-run → 0 hits; resolved PTQ-0215/0327/0404/0411/0412 cover disjoint file sets per the repo's one-issue-per-file-set precedent, so this pair is untracked — note for acceptance that pending sibling intake qw20260917154546-d7-01-fn-arg-single-page-registry-oracle-duplicated.md lists division-result-type-number.test.ts:188-214 among its locations (its titled subject is fn-arg-member-read-proof.test.ts) (triage: claude-fable-5-1)
