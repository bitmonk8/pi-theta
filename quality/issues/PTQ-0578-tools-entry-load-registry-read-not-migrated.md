---
id: PTQ-0578
title: tools-derived-name-shape.test.ts and tools-entry-closed-grammar.test.ts re-read/re-parse code-registry-load.md instead of calling tests/helpers/registry-oracle.ts's readRegistry
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tools-derived-name-shape.test.ts:129-140
  - tests/tools-entry-closed-grammar.test.ts:112-123
  - tests/helpers/registry-oracle.ts:20-46
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# tools-derived-name-shape.test.ts and tools-entry-closed-grammar.test.ts re-read/re-parse code-registry-load.md instead of calling tests/helpers/registry-oracle.ts's readRegistry

## Observation
Both files declare a local `REGISTRY` constant that reads
`docs/spec_topics/diagnostics/code-registry-load.md` through
`readFileSync`/`fileURLToPath(new URL(...))`, parses it through the real
`parseRegistry`, and casts the result to an inline `{ code: string; message:
string }[]` shape. `tests/helpers/registry-oracle.ts` already exports a
parameterised `readRegistry(shards)` that performs the identical
`readFileSync`/`fileURLToPath`/`parseRegistry` sequence over any subset of
the four sharded pages — `readRegistry(["load"])` reads the identical single
page these two files need — plus a wider six-field `RegistryRow` that is a
structural superset of the two-field local cast (the only two fields either
file's own `registryMessage`/`expectedMessage` reads). Neither file imports
the helper.

## Evidence
`tests/tools-derived-name-shape.test.ts:129-140`:
```ts
// --- Registry Message strings (diagnostics/code-registry-load.md) -----------

/** The live sharded load registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/tools-entry-closed-grammar.test.ts:112-123` — byte-identical to the
above (`diff <(sed -n '129,140p' tests/tools-derived-name-shape.test.ts)
<(sed -n '112,123p' tests/tools-entry-closed-grammar.test.ts)` produces no
output):
```ts
// --- Registry Message strings (diagnostics/code-registry-load.md) -----------

/** The live sharded load registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];
```

`tests/helpers/registry-oracle.ts:20-46` — the canonical, already-exported
equivalent, parameterised exactly for the "only one shard" case:
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
```
`readRegistry(["load"])` reads the identical single page via the identical
`readFileSync`/`fileURLToPath(new URL(...))`/`parseRegistry` chain (differing
only in the `../` vs `../../` relative depth each file's own location
requires), producing the same rows either file's `registryMessage` calls
already consume.

Exact search: `grep -n '"\.\./docs/spec_topics/diagnostics/code-registry-load\.md"' tests/*.test.ts` finds this exact single-page inline-read spelling in 16 files across the suite; of those, `tests/tools-derived-name-shape.test.ts` and
`tests/tools-entry-closed-grammar.test.ts` are the two files in this review's
scope, and both use the byte-identical block cited above.

## Why this is a problem
`tests/helpers/registry-oracle.ts`'s own header states its `readRegistry`
export exists because "`RegistryRow` and the `REGISTRY` load it backs...were
redeclared byte-for-byte (confirmed via `diff`) in several test files," and
its `shards` parameter is built precisely so a file needing fewer than all
four pages can still share the read. Both in-scope files reproduce the
single-page case as their own inline re-derivation rather than the one-line
`readRegistry(["load"])` call, so a future change to the shard-file naming,
the `parseRegistry` call, or the relative-path construction must be mirrored
in both places by hand in addition to the helper.

## Suggested direction (non-binding, optional)
`readRegistry(["load"])` from `tests/helpers/registry-oracle.ts` is the
one-line substitution the helper's own `shards` parameter was built for.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or its named kin; the
  cited lines are a registry read/parse setup, not a pinned count or
  inventory assertion.
- Recording-double check: `REGISTRY` here backs a message-template lookup
  (`expectedMessage`/`derivedNameTemplate`), not a recording double backing a
  "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "tools-derived-name-shape\|tools-entry-closed-grammar\.test" docs/bugs/*.md` → each file's own bug doc (0070, 0069)
  names it as that bug's witness, as expected; neither pins the `REGISTRY`
  read block itself as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "tools-derived-name-shape\|tools-entry-closed-grammar" docs/reference/coverage-matrix.md` → 0 hits. This
  finding proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` cell — only that the local `REGISTRY` read block could
  call the existing helper.
- Prior-finding overlap check: `grep -l "tools-derived-name-shape\|tools-entry-closed-grammar" quality/intake/*.md quality/resolved/*.md` before filing found
  no ticket naming either file for a registry-read duplication (the one hit,
  `qw20260917154546-d7-108-02-nested-tools-registry-oracle-reimplemented.md`,
  covers a disjoint two-page `REGISTRY_TEXT` variant in
  `tools-entry-containment.test.ts`, `nested-tools-entry-containment.test.ts`,
  and `theta-callable-call-arity.test.ts` — none of which is either file cited
  here). The resolved `PTQ-0215-registry-oracle-harness-duplication.md` class
  of tickets that produced `registry-oracle.ts` itself predates this wave and
  does not name either in-scope file.
- Coverage-drift check: the claim is about a repeated read/parse DEFINITION,
  not a missing test path; the registry read is exercised by every cell in
  each file.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: both 12-line REGISTRY blocks reproduce at tools-derived-name-shape.test.ts:129-140 and tools-entry-closed-grammar.test.ts:112-123 and diff byte-identical; neither file imports tests/helpers/registry-oracle; executing both reads shows the inline code-registry-load.md parse and readRegistry(["load"]) return 64 identical rows with identical registryMessage results for all four codes the files consult (invalid-derived-tool-name, malformed-tool-entry, invalid-tool-rename, tool-name-collision); the single-page inline spelling greps to 15 files (candidate said 16, minor drift); both sites in tests/, neither a gate test, 0 coverage-matrix hits, no merge/rename/delete proposed; no resolved registry-oracle ticket (0215/0222/0237/0250/0260/0275/0311/0313/0327/0404/0411/0412) nor any wave sibling (d7-01 runProductionLoad harness, d7-163-02 resolveCallableSet harness at :479-525) covers this block in these files — same class as confirmed PTQ-0404/0411/0412 residuals (triage: claude-fable-5-1)
