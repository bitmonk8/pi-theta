---
id: PTQ-0518
title: topKinds (top-level statement-kind projection) is redeclared byte-identical in fn-param-list-unclosed.test.ts and four sibling files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-param-list-unclosed.test.ts:280-283
  - tests/enum-body-unclosed-at-eof.test.ts:319-322
  - tests/fn-param-annotation-optional.test.ts:460-463
  - tests/fn-param-not-identifier.test.ts:349-352
  - tests/schema-body-unclosed-at-eof.test.ts:292-295
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# topKinds (top-level statement-kind projection) is redeclared byte-identical in fn-param-list-unclosed.test.ts and four sibling files

## Observation
tests/fn-param-list-unclosed.test.ts declares a module-private helper
`topKinds(doc)` that projects a parsed `ThetaDocument`'s top-level statement
kinds (`doc.body.statements.map((s) => s.kind)`) into a `string[]` for
ordered-list assertions such as a5/a6/c8's "does the following statement
survive resynchronisation" checks. The identical one-line function body,
under the identical name, recurs verbatim in four other test files.
tests/helpers/e2e-s1.ts — the shared parse-driver module this same file
already imports `parseDoc` from — hosts the analogous `findLetStmt` /
`findFnDecl` pair, both of which already read `doc.body.statements`, but no
`topKinds`-shaped projection.

## Evidence
tests/fn-param-list-unclosed.test.ts:280-283:
```ts
/** The top-level statement kinds, in source order. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}
```

tests/enum-body-unclosed-at-eof.test.ts:319-322 (byte-identical):
```ts
/** The top-level statement kinds, in source order. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}
```

tests/fn-param-annotation-optional.test.ts:460-463 (identical body, doc
comment extended with a citation):
```ts
/** The top-level statement kinds, in source order — `doc.body.statements`. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}
```

tests/fn-param-not-identifier.test.ts:349-352 (byte-identical to the above):
```ts
/** The top-level statement kinds, in source order — `doc.body.statements`. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}
```

tests/schema-body-unclosed-at-eof.test.ts:292-295 (byte-identical to the
first two):
```ts
/** The top-level statement kinds, in source order. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}
```

Exact search: `grep -rn "^function topKinds" tests --include="*.test.ts"` →
exactly these 5 hits, no others.

## Why this is a problem
The function body — `doc.body.statements.map((s) => s.kind)` — is
byte-for-byte identical across all 5 files; only the doc comment's trailing
citation clause varies (2 of the 5 add "— `doc.body.statements`."). This is
harness code — how a test projects a parsed document's top-level shape for
comparison — not domain logic specific to any one bug's subject. The project
already centralises the sibling `ThetaDocument`-shaped lookups `findLetStmt`
and `findFnDecl` in tests/helpers/e2e-s1.ts (resolved PTQ-0257/PTQ-0394 moved
their FIND-logic there), and the reviewed file already imports `parseDoc`
from that same module, so a `topKinds`/`stmtKinds`-shaped export sits beside
an established precedent for exactly this size and purpose of helper. Read
alone, any one of the 5 definitions looks like ordinary local plumbing; only
the cross-file count exposes that it is one piece of harness authored 5 times
instead of shared once — the same shape prior wave qw20260916045442 noted
(unfiled, tooling failure) as analogous to the resolved PTQ-0205
(`diagLines`/`diagCodes`) duplication, which was fixed by adding the
duplicated helpers to tests/helpers/e2e-s1.ts as exports.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts `findLetStmt` and `findFnDecl`, the
established precedent for small `ThetaDocument`-shaped read-only projections,
and every one of the 5 files already imports `parseDoc` from that module.

## False-positive check
- Gate-pin: none of the 5 cited files match `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double: `topKinds` maps an already-produced, already-parsed
  document's statement array; it records no calls and backs no "never
  called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "topKinds" docs/bugs/*.md` → 0
  files; no open bug document names this duplication or gives a
  documented-correct-reason rationale for keeping the definition local to
  each file.
- coverage-matrix/bug-doc citation search: `grep -n "topKinds"
  docs/reference/coverage-matrix.md` → 0 hits. Several bug docs (0139, 0148,
  0150, 0151, 0245 among others) cite these 5 test files BY FILENAME for
  their pinned `it()` counts and cell ids, never by this internal helper's
  name; this finding proposes no change to any `it()`/`describe()` name,
  count, or assertion — only to where the helper's one-line body is defined
  — so no pinned witness is affected.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION, not a missing test path; each copy is exercised by its own
  file's existing tests.
- Prior-note overlap check: `quality/tmp/qw20260916045442/D7/shard-01.notes.txt`
  names this exact 5-file `topKinds` duplication as an unfiled candidate from
  a shard whose tooling failed before it could write a finding file; no PTQ
  file or intake candidate exists for it under any name (`grep -ril
  "topKinds" quality/intake quality/resolved` → the two hits found are
  PTQ-0257 and PTQ-0394, both about a different helper, `fnDecl`/`letStmtOf`
  lookups, not `topKinds`), so this is the first actual filing of the
  candidate, not a re-filing.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep -rn "^function topKinds" tests --include="*.test.ts"` → exactly the 5 cited hits at the cited lines, and extracting each 3-line body to $TEMP and diffing against the first shows all 5 byte-identical (`doc.body.statements.map((s) => s.kind)`; only 2 doc comments append a citation clause); every copy is live in its own file (9/4/4/24/4 call refs) and every one of the 5 files already imports `parseDoc` from tests/helpers/e2e-s1.ts, which exports the same-shaped ThetaDocument projections `diagLines`/`diagCodes`/`findLetStmt`/`findFnDecl` (the PTQ-0205/0257/0394 dedupe homes) but no `topKinds` — D7 boilerplate-duplication class in tests/ only; carve-outs re-checked: no gate file, a pure map over an already-parsed doc is not a recording double, coverage-matrix 0 hits, no it()/describe() name/count/assertion touched; two corrections to the filing's self-checks that do not refute it: docs/bugs/0225:836 DOES name `topKinds` (candidate said 0 hits) but only as a prose label for a pin in a FIXED bug with no keep-local rationale, and a sixth renamed-only copy `stmtKinds` exists at tests/annotation-nontype-text-refusal.test.ts:376-378 (same body, file already imports e2e-s1) which the fixer should fold in; dedupe: PTQ-0205/0257/0394 are different helpers, the sibling intake qw20260917154546-d7-01-schema-body-unclosed-registry-oracle-reimplemented.md is RegistryRow/REGISTRY not topKinds, and the qw20260916045442 D7 shard-01 note was an unfiled tooling failure, so this is the first filing (triage: claude-fable-5-1)
