---
id: PTQ-0880
title: params-default-empty-literal-refusal.test.ts's expect-based registryMessageOf is one of five structurally identical repo-wide copies with no shared home
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-default-empty-literal-refusal.test.ts:140-147
  - tests/params-default-string-literal-raw-newline.test.ts:200-206
  - tests/params-inline-enum-position-refusal.test.ts:132-140
  - tests/params-scalar-nontype-text-refusal.test.ts:223-230
  - tests/schema-body-nontype-text-refusal.test.ts:190-197
sites: 5
fix_scope: cross-module
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# params-default-empty-literal-refusal.test.ts's expect-based registryMessageOf is one of five structurally identical repo-wide copies with no shared home

## Observation
`tests/params-default-empty-literal-refusal.test.ts` declares a local
`registryMessageOf(code: string): string` that looks up a registry row's
*Message* template via `registryMessage(REGISTRY, code)`, asserts its
definedness with `expect(template, <message>).toBeDefined()`, and returns
`template as string`. The identical two-statement skeleton (same
`registryMessage` read, same `expect(...).toBeDefined()` guard shape, same
`return template as string;` tail) recurs, independently declared with no
shared import, in four further sibling test files; only the `expect`
message's prose text differs between copies.

## Evidence
`tests/params-default-empty-literal-refusal.test.ts:140-147` (re-read
immediately before filing):
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `the registry must carry a ${code} row; DIAG-2 (diagnostic-shape.md:72) lands it in docs/spec_topics/diagnostics/code-registry-parse.md in the same commit as the code, and DIAG-4 (:74) makes that row's Message column the only admissible source for the expected string`,
  ).toBeDefined();
  return template as string;
}
```

`tests/params-default-string-literal-raw-newline.test.ts:200-206` — the same
skeleton, only the message text differs:
```ts
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}
```

`tests/params-inline-enum-position-refusal.test.ts:132-140`,
`tests/params-scalar-nontype-text-refusal.test.ts:223-230` and
`tests/schema-body-nontype-text-refusal.test.ts:190-197` each carry the same
`const template = registryMessage(REGISTRY, code) as string | undefined;` /
`expect(template, <prose>).toBeDefined();` / `return template as string;`
three-line skeleton, each re-read immediately before filing and differing
from the two excerpts above only in the `expect` message's wording.

Exact search: `grep -n "^function registryMessageOf" tests/*.test.ts` returns
19 files that share the outer `function registryMessageOf(code: string): string`
signature, but the bodies split into two disjoint shapes: a THROW-based
variant (`if (template === undefined) { throw new Error(...) }`, 14 files,
already the subject of same-wave sibling intake
`qw20260918050411-d7-02-stranded-registrymessageof-throw-duplicated.md`) and
the EXPECT-based variant filed here
(`sed -n '/^function registryMessageOf/,/^}/p' <file> | sed -n '1,3p;6,7p'`
over all 19 files confirms the split): exactly the five files cited above use
`expect(template, ...).toBeDefined(); return template as string;` rather than
a throw.

## Why this is a problem
The function is pure harness plumbing — how a test converts a registry-row
lookup into a loud, named failure — not domain logic specific to any one
bug's subject. Five files each retype the identical
`registryMessage`-read-then-`expect`-guard-then-cast skeleton under a
private, per-file declaration rather than sharing one; a change to how the
guard reports a missing row (e.g. switching the assertion library call or
adding a registry-page hint) would need the same edit applied by hand in
each of the five copies, with nothing to signal a missed one.

## Suggested direction (non-binding, optional)
An expect-based `registryMessageOf(registry, code, contextMessage)` sibling
beside `tests/helpers/load-row-harness.ts`'s existing exports (or a
comparable `tests/helpers/registry-oracle.ts` addition) would give these five
files one shared expect-based variant to import, parameterised by the
per-file context prose that currently varies.

## False-positive check
- Gate-pin check: none of the five files match `*gate*.test.ts` or the named
  gate-kin patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-
  gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `registryMessageOf` performs a synchronous lookup
  and an `expect` guard; it records no calls and backs no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "registryMessageOf" docs/bugs/0041*.md
  docs/bugs/0053*.md docs/bugs/0066*.md docs/bugs/0165*.md` → 0 hits; none of
  the five files' own cited bug documents states a rationale for the guard
  being retyped at each site rather than shared.
- coverage-matrix/bug-doc citation search: `grep -n "params-default-empty-
  literal-refusal\|params-default-string-literal-raw-newline\|params-inline-
  enum-position-refusal\|params-scalar-nontype-text-refusal\|schema-body-
  nontype-text-refusal" docs/reference/coverage-matrix.md` → 0 hits. Each
  file is cited by name in its own bug document's witness list for the
  diagnostic cells under test, never for the `registryMessageOf` guard's
  internal shape; this finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only that the local guard definition could be
  replaced by a shared expect-based export.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION, not a missing test path; each copy is exercised by every
  `*Message(...)`-shaped caller in its own file today.
- Overlap check: `grep -rl "registryMessageOf" quality/intake quality/issues
  quality/resolved` (run before this filing) found PTQ-0499 (the
  `RegistryRow`/`REGISTRY` four-page-read duplication, a different
  declaration entirely, already fixed and confirmed absent from this file at
  re-read — it now imports `REGISTRY` from `./helpers/registry-oracle`),
  PTQ-0638 (an `expect`-based `registryMessageOf` with a separate `line()`
  splitting helper, a structurally different two-function shape, in a
  disjoint file pair), and same-wave sibling
  `qw20260918050411-d7-02-stranded-registrymessageof-throw-duplicated.md`
  (the THROW-based half of the same 19-file signature match, explicitly
  disjoint from the EXPECT-based five cited here). No prior or pending
  finding names any of these five files together for this shape.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five excerpts reproduce verbatim at the cited lines and the three-line skeleton (`registryMessage(REGISTRY, code) as string | undefined` / `expect(template, …).toBeDefined()` / `return template as string`) sed-extracted from each diffs empty across the five, differing only in the expect prose; every copy is live (4/5/2/9/6 call sites), all locations under tests/, D7 boilerplate-duplication class, no gate-name match, docs/bugs `registryMessageOf` → 0, coverage-matrix → 0, no merge/rename/delete proposed; two sub-claims are refuted but strengthen the finding — (1) "no shared home" is false: tests/helpers/load-row-harness.ts:62-80 already exports the expect-based `registryMessageOf(registry, registryPath, code, fills)` with the identical lookup→`expect(...).toBeDefined()`→cast body (PTQ-0747/PTQ-0786 precedents), so the fix is a migration to that export, not a new sibling; (2) "exactly five expect-based / 14 throw-based" is wrong: the 19-file signature splits 9 expect-based (also b0449-reexport-chain-enum-unknown-variant, b0450-imported-enum-system-param, generic-argument-shredded-group-refusal, nested-inline-enum-generic-argument-refusal) vs 10 throw-based; not a duplicate: resolved PTQ-0654/PTQ-0658 migrated only these files' RegistryRow/REGISTRY and explicitly left the reader local, PTQ-0638 and confirmed same-wave qw20260918050411-d7-02-params-inline-enum-registrymessageof-line-third-copy.md cover the generic-argument pair plus site 3 (params-inline-enum-position-refusal.test.ts:132-153) — fold that one site into d7-02 at fix time — and no open PTQ (0747/0777/0786) cites the other four files; same class as PTQ-0747 on a disjoint file set (extraneous d4_class on a D7 filing noted, not blocking) (triage: claude-fable-5-1)
