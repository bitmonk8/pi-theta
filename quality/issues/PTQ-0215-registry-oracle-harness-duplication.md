---
id: PTQ-0215
title: The registry-oracle bundle (RegistryRow, REGISTRY, registryMessageOf, registryRowOf) is redefined byte-for-byte across hundreds of test files
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/annotation-nontype-text-refusal.test.ts:223-230
  - tests/annotation-nontype-text-refusal.test.ts:233-247
  - tests/annotation-nontype-text-refusal.test.ts:257-271
  - tests/schema-body-nontype-text-refusal.test.ts:184-191
  - tests/schema-body-nontype-text-refusal.test.ts:194-208
  - tests/b0449-reexport-chain-enum-unknown-variant.test.ts:118-121
  - tests/b0449-reexport-chain-enum-unknown-variant.test.ts:124-138
sites: 7
fix_scope: cross-module       # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# The registry-oracle bundle (RegistryRow, REGISTRY, registryMessageOf, registryRowOf) is redefined byte-for-byte across hundreds of test files

## Observation
tests/annotation-nontype-text-refusal.test.ts declares a local `RegistryRow`
interface, a module-scope `REGISTRY` constant that reads and concatenates the
four diagnostics spec pages (`code-registry-{parse,load,runtime,host}.md`) via
`parseRegistry`, and two throw-on-miss readers (`registryMessageOf`,
`registryRowOf`) over that constant — the "diagnostics oracle" every expected
message in the file is read from at runtime rather than hand-copied (DIAG-4).
The same interface shape, the identical `REGISTRY` construction (confirmed
byte-for-byte via `diff`, not merely visually similar), and functionally
identical reader functions are independently redeclared, module-scope, in
hundreds of other test files, each paying the same four-page read and JS-side
reparse rather than importing one shared definition. No `tests/helpers/`
module currently exports any part of this bundle.

## Evidence
tests/annotation-nontype-text-refusal.test.ts:223-230
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}
```

tests/annotation-nontype-text-refusal.test.ts:233-247 — the `REGISTRY`
construction (this exact 15-line block is confirmed byte-for-byte identical,
via `diff`, to the corresponding block in both sibling files cited below):
```ts
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

tests/annotation-nontype-text-refusal.test.ts:257-271 — `registryMessageOf`,
one of two throw-on-miss readers built over `REGISTRY`:
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes that column this file's ` +
        `only oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. DIAG-2 (:72) makes minting the row part of bug 0124's fix, in the ` +
        `same commit as the sites it is raised from ` +
        `(docs/spec_topics/diagnostics/code-registry-parse.md, beside ` +
        `theta/parse/schema-type-not-expression)`,
    );
  }
  return template;
}
```

tests/schema-body-nontype-text-refusal.test.ts:184-191 — the identical
6-field `RegistryRow` interface, same field names and order:
```ts
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}
```

tests/schema-body-nontype-text-refusal.test.ts:194-208 — the `REGISTRY`
construction, byte-for-byte identical to the excerpt above:
```ts
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

tests/b0449-reexport-chain-enum-unknown-variant.test.ts:118-121 — a narrower,
2-field variant of the same interface (only the fields this file happens to
read):
```ts
interface RegistryRow {
  readonly code: string;
  readonly message: string;
}
```

tests/b0449-reexport-chain-enum-unknown-variant.test.ts:124-138 — the same
`REGISTRY` construction, again byte-for-byte identical to the first excerpt:
```ts
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

Pattern-wide search (of 810 total `tests/**/*.test.ts` files): `grep -rl "const
REGISTRY = parseRegistry(" tests --include="*.test.ts" | wc -l` → 212 files;
`grep -rl "interface RegistryRow {" tests --include="*.test.ts" | wc -l` → 189
files; `grep -rl "function registryMessageOf" tests --include="*.test.ts" | wc
-l` → 19 files literally reusing that name for the same throw/`expect`-on-miss
reader; `grep -rl "function registryRowOf" tests --include="*.test.ts" | wc -l`
→ 11 files. A companion reader, `placeholdersOf` (extracts `<slot>` names from a
template), recurs the same way in 4 files including this one
(tests/annotation-nontype-text-refusal.test.ts:285-288).

## Why this is a problem
The `REGISTRY` block is not merely similar across files — three independently
authored files (this one, schema-body-nontype-text-refusal.test.ts,
b0449-reexport-chain-enum-unknown-variant.test.ts, witnessing three different
bugs at three different landing dates) contain the identical 15-line
`parseRegistry([...four pages...].map(readFileSync...).join("\n"))` block,
confirmed with `diff`. `registryMessageOf`/`registryRowOf` vary only in
cosmetic ways (a thrown `Error` versus an `expect(...).toBeDefined()`) while
solving the identical problem: read the four-page diagnostics registry once and
fail loudly, naming the code, when a row or its Message is absent. This project
already has an established home for exactly this kind of repeated harness —
tests/helpers/e2e-s1.ts centralises the parse driver (`parseDoc`) that this same
file, and hundreds of others, import rather than reimplement — but no
equivalent module exists for the registry-oracle bundle, so 212 files each pay
their own four-page `readFileSync` + `parseRegistry` call and (189 of them) their
own copy of the `RegistryRow` shape.

## Suggested direction (non-binding, optional)
The project's own tests/helpers/e2e-s1.ts precedent — one shared module for a
harness piece hundreds of files need identically — names the natural home for
the `REGISTRY` read and its `registryMessageOf`/`registryRowOf`/`placeholdersOf`
readers.

## False-positive check
- Gate-pin: none of the three cited files (annotation-nontype-text-refusal,
  schema-body-nontype-text-refusal, b0449-reexport-chain-enum-unknown-variant)
  match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate). tests/code-registry.test.ts itself IS the
  closed-set reconciliation gate for this registry and is not one of the cited
  duplication sites; this finding is about the READER bundle hundreds of other
  files each redeclare to consume that registry, not about the gate that
  reconciles it.
- Recording-double: `registryMessageOf`/`registryRowOf` read an already-parsed,
  static markdown-derived array; they record no calls and back no "never
  called" assertion, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "registryMessageOf"
  docs/bugs/` → 0 files. No open bug document names this duplication, or states
  a rationale for keeping the registry-read bundle local to each file, as a
  documented correct-reason design; the reviewed file's own extensive
  commentary explains WHY the registry is read live rather than hand-copied
  (DIAG-4) but says nothing about why the read/parse harness itself must be
  redeclared per file.
- coverage-matrix/bug-doc citation search: `grep -n "registryMessageOf"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0124 cites this file BY
  NAME as its "Test witness" (251 cells, `Tests 251 passed (251)` reproduced and
  reverified during this review), but that citation pins the test file and its
  test count/behaviour, not the internal implementation of its registry-reading
  helpers; this finding proposes no change to any `it()`/`describe()` name,
  count, or assertion, only to where the four helper pieces are defined.
- Coverage check: the claim is entirely about a repeated harness DEFINITION
  (interface + constant + two reader functions), not a missing test path; every
  copy is exercised by the tests in its own file.

## Triage
verdict: confirmed — every excerpt, line range, and pattern-search count (212/189/19/11 of 810 files) independently reproduces byte-for-byte, all three cited files sit outside tests/ gate-pin patterns and carry no documented (bug-doc/coverage-matrix) rationale for per-file redeclaration, this is genuine D7 boilerplate/copy-paste-fixture duplication confined to tests/, and it matches no existing PTQ or rejected finding (triage: claude-opus-5)
