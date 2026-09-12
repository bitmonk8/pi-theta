---
id: PTQ-0260
title: ctor-declaration-order.test.ts and ctor-field-type-check.test.ts each rebuild the diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ctor-declaration-order.test.ts:181-195
  - tests/ctor-field-type-check.test.ts:190-197
  - tests/ctor-field-type-check.test.ts:200-214
  - tests/helpers/registry-oracle.ts:21-28
  - tests/helpers/registry-oracle.ts:31-45
sites: 5
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# ctor-declaration-order.test.ts and ctor-field-type-check.test.ts each rebuild the diagnostics-registry read that tests/helpers/registry-oracle.ts already centralises

## Observation
tests/ctor-declaration-order.test.ts declares a module-scope `REGISTRY`
constant built by calling the real `parseRegistry` over the four sharded
`docs/spec_topics/diagnostics/code-registry-*.md` pages, each read with
`readFileSync`/`fileURLToPath` and joined into one string before parsing.
tests/ctor-field-type-check.test.ts declares the same four-page read, plus its
own local 6-field `RegistryRow` interface (`code`, `namespace`, `severity`,
`phase`, `trigger`, `message`). `tests/helpers/registry-oracle.ts` already
exports a `REGISTRY: readonly RegistryRow[]` built by the identical
four-page `parseRegistry` call over the identical page list, with an identical
6-field `RegistryRow` interface — the module's own header states it exists
because this exact read "were redeclared byte-for-byte (confirmed via `diff`)
in several test files. This module centralises that read only." Neither of the
two reviewed files imports anything from `tests/helpers/registry-oracle.ts`.

## Evidence
tests/ctor-declaration-order.test.ts:181-195 — the local `REGISTRY`, cast to a
narrower two-field view inline (no local `RegistryRow` interface):
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
) as readonly { readonly code: string; readonly message: string }[];
```

tests/ctor-field-type-check.test.ts:190-197 — the local `RegistryRow`
interface, 6 fields, same names and order as the canonical one below:
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

tests/ctor-field-type-check.test.ts:200-214 — the local `REGISTRY`, same
four-page list, same `readFileSync`/`fileURLToPath`/`parseRegistry`/`.join`
chain as the excerpt above, differing only in relative path depth (`../` vs
the helper's `../../`):
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

tests/helpers/registry-oracle.ts:21-28 — the canonical, already-exported
`RegistryRow`, byte-identical in field set to ctor-field-type-check.test.ts's
local copy above:
```ts
export interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}
```

tests/helpers/registry-oracle.ts:31-45 — the canonical, already-exported
`REGISTRY`, the same four-page read both reviewed files re-derive locally:
```ts
export const REGISTRY: readonly RegistryRow[] = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];
```

Pattern-wide search: `grep -rl "const REGISTRY = parseRegistry(" tests
--include="*.test.ts" | wc -l` → 203 files (of which the two reviewed files are
two); `grep -rl 'from ".*helpers/registry-oracle"' tests --include="*.test.ts"`
→ 6 files (annotation-nontype-text-refusal, b0333-transitive-lib-reexport-edge,
b0334-reexport-multisource-collision, b0335-own-import-shadows-own-declaration,
b0449-reexport-chain-enum-unknown-variant, schema-body-nontype-text-refusal),
neither of the two files in this review among them.

## Why this is a problem
`tests/helpers/registry-oracle.ts` was created (PTQ-0215) specifically to
replace this exact per-file read — its header states the `RegistryRow`
interface and the `REGISTRY` it backs "were redeclared byte-for-byte … in
several test files. This module centralises that read only." Both reviewed
files perform the identical read (same four pages, same
`readFileSync`/`fileURLToPath`/`parseRegistry`/`.join("\n")` chain, same cast
shape) rather than importing the existing export; ctor-field-type-check.test.ts
additionally re-declares the exact 6-field `RegistryRow` interface the helper
already exports under the same name. Neither file's own comments state a
reason the read must stay local (the surrounding prose explains why the
registry is read live rather than hand-copied — DIAG-4 — not why the read
harness itself is redeclared), and this repository's own store already treats
this precise pattern as a confirmed, recurring, per-instance-filable gap
(PTQ-0215, the fix that created the helper; PTQ-0237, a later file found still
rebuilding it) rather than a deliberate per-file convention.

## Suggested direction (non-binding, optional)
`tests/helpers/registry-oracle.ts` already exports the `REGISTRY`/`RegistryRow`
pair both reviewed files re-derive; it is the existing, purpose-built home for
this read, and ctor-field-type-check.test.ts's own `RegistryRow` fields are
already a byte-for-byte match for the export's shape.

## False-positive check
- Gate-pin check: neither tests/ctor-declaration-order.test.ts nor
  tests/ctor-field-type-check.test.ts matches `*gate*.test.ts` or the named
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited
  `REGISTRY` constants are a static parsed data read, not a pinned-count or
  inventory assertion.
- Recording-double check: `REGISTRY` is a read-once, markdown-parsed array; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0080-keys-values-construction-order-not-declaration-order.md
  Status "fixed (0.70.0)"; docs/bugs/0121-integer-like-wire-rename-escapes-order-guarantee.md
  Status "fixed (0.245.0)"; docs/bugs/0031-ctor-field-value-typing-unchecked.md
  Status "fixed (0.43.0)". `npx vitest run tests/ctor-declaration-order.test.ts
  tests/ctor-field-type-check.test.ts` → 2 files, 57 tests, all passing at
  HEAD, so neither file is a documented correct-reason red, and no docs/bugs/
  document states a rationale for keeping this particular read local to either
  file.
- coverage-matrix/bug-doc citation search: `grep -n
  "ctor-declaration-order\|ctor-field-type-check"
  docs/reference/coverage-matrix.md` → 0 hits. Both files ARE cited by name,
  with specific line ranges, in numerous other bug documents (0026, 0038,
  0114, 0115, 0119, 0120, 0121, 0134, 0136, 0149, 0163, 0172, 0173, 0179, 0191,
  0389, 0405, 0412) — none of those citations target the line ranges this
  finding cites (181-195 in ctor-declaration-order.test.ts; 190-214 in
  ctor-field-type-check.test.ts), all instead citing specific `it()` bodies
  elsewhere in each file (e.g. bug 0119's `:679–718`, bug 0121's `:540–553`,
  bug 0163's `:304–305`/`:742–745`). This finding proposes no merge, rename or
  deletion of either file or any `it()`/`describe()` inside them — only that
  the local `RegistryRow`/`REGISTRY` read could import the existing
  `tests/helpers/registry-oracle.ts` export instead — the same class of change
  PTQ-0215's own fix already applied to three other files this heavily-cited
  pair does not overlap with.
- Coverage check: the claim is about a repeated read/parse DEFINITION, not a
  missing test path; the registry read in both files is exercised by every
  test in its own file (57/57 passing, confirmed above).

## Triage
verdict: confirmed — every excerpt and line range (ctor-declaration-order.test.ts:181-195; ctor-field-type-check.test.ts:190-197/200-214; registry-oracle.ts:21-28/31-45) reproduces exactly, neither file imports the helper, the stated grep counts (203 local declarations, 6 importers) and 57/57 vitest pass reproduce exactly, docs/bugs status and citation searches (0080 fixed 0.70.0, 0121 fixed 0.245.0, 0031 fixed 0.43.0; coverage-matrix 0 hits; spot-checked bug-doc line citations 0119:679-718, 0121:540-553, 0163:304-305/742-745) all check out, neither file's comments state a local-read rationale or a "mirrors an older sibling" convention, no gate-pin/negative-witness/documented-red/citation-conflict carve-out applies, and it cites files no existing PTQ (0215 fixed, 0222 fixed, 0237 open, 0232) already covers — genuine D7 boilerplate/copy-paste-fixture duplication of the already-centralised tests/helpers/registry-oracle.ts (triage: claude-opus-5)
