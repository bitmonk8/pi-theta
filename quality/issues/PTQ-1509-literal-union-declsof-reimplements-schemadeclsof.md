---
id: PTQ-1509
title: literal-union-string-enum-emission.test.ts's local declsOf reimplements e2e-s1.ts's exported schemaDeclsOf/enumDeclsOf
lens: D7
status: open
verdict: confirmed
locations:
  - tests/literal-union-string-enum-emission.test.ts:217-232
  - tests/helpers/e2e-s1.ts:728-731
  - tests/helpers/e2e-s1.ts:763-765
sites: 1
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# literal-union-string-enum-emission.test.ts's local declsOf reimplements e2e-s1.ts's exported schemaDeclsOf/enumDeclsOf

## Observation
`tests/helpers/e2e-s1.ts` exports `schemaDeclsOf(doc)` and `enumDeclsOf(doc)`, each a one-line `doc.body.statements.filter(...)` type-narrowing accessor over a parsed `ThetaDocument`. `tests/literal-union-string-enum-emission.test.ts` imports `parseDoc` from that same module but declares its own local `declsOf(label, body)` helper, whose return value's two fields are built with the identical filter expressions rather than by calling the exported accessors.

## Evidence
tests/helpers/e2e-s1.ts:728-731 (canonical `schemaDeclsOf`, re-read immediately before filing):
```ts
/** Top-level declarations of this kind, preserving source order. */
export function schemaDeclsOf(doc: ThetaDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```

tests/helpers/e2e-s1.ts:762-765 (canonical `enumDeclsOf`, re-read immediately before filing):
```ts
/** Top-level declarations of this kind, preserving source order. */
export function enumDeclsOf(doc: ThetaDocument): readonly EnumDecl[] {
  return doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
}
```

tests/literal-union-string-enum-emission.test.ts:216-232 (local reimplementation, re-read immediately before filing):
```ts
/** The `schema` / `enum` declarations of a body that MUST parse cleanly. */
function declsOf(
  label: string,
  body: string,
): { readonly schemas: SchemaDecl[]; readonly enums: EnumDecl[] } {
  const doc = parseDoc(`---\nmode: prompt\n---\n${body}\n`, "bug0055.theta");
  const lines = doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
  expect(
    lines,
    `${label}: the fixture body must load with NO diagnostics or the lowering under ` +
      `assertion never runs; observed ${JSON.stringify(lines)}`,
  ).toEqual([]);
  return {
    schemas: doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema"),
    enums: doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum"),
  };
}
```

Import check: `tests/literal-union-string-enum-emission.test.ts:16` is `import { parseDoc } from "./helpers/e2e-s1";` — the module's only import from `./helpers/e2e-s1` — so `schemaDeclsOf` and `enumDeclsOf`, exported from the very same module at lines 729 and 763, are not among the drawn names.

## Why this is a problem
The two filter expressions inside `declsOf`'s `return` — `doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema")` and the `enum`-kind equivalent — are byte-identical to the bodies of the exported `schemaDeclsOf`/`enumDeclsOf` accessors from a module this file already imports from. The clean-load guard (the `lines`/`expect(...).toEqual([])` precondition) is this file's own genuinely local content; the declaration-filtering half of the function is typed a second time under a different local name, changeable independently of the exported accessors with nothing to signal that a copy was left behind.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` is already the home this file draws `parseDoc` from and already exports the two filters `declsOf` reimplements (observation, not design).

## False-positive check
- Gate-pin carve-out: `tests/literal-union-string-enum-emission.test.ts` does not match `*gate*.test.ts` or its named kin; not applicable.
- Recording-double carve-out: `declsOf` is a fixture-decoding accessor, not a recording double witnessing a MUST-NOT call; not applicable.
- docs/bugs/ signature search: `grep -rln "declsOf" docs/bugs/*.md` → 0 hits; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "literal-union-string-enum-emission" docs/reference/coverage-matrix.md` → 0 hits; the file is not cited by name, so no merge/rename/delete-of-a-cited-test concern applies.
- Confirmed this stays inside D7 duplication territory: the claim is about the repeated filter-expression bodies between one in-scope file and an already-imported helper module, not about missing coverage or suite composition.

## Triage
verdict: confirmed — re-checked against the current code: `declsOf` at tests/literal-union-string-enum-emission.test.ts:217-232 builds `schemas`/`enums` with filter expressions that are byte-identical to the exported `schemaDeclsOf` (e2e-s1.ts:729-731) and `enumDeclsOf` (:763-765). The file's only import from that module is `parseDoc` (:17). The swap is type-safe: both consumers, `lowerQueryResponseSchema` (:166-167) and `buildBodyTypeSchemas` (:460-461), take `readonly` arrays. The stated searches reproduce: docs/bugs `declsOf` gives 0 hits and coverage-matrix gives 0 hits. The file is under tests/ and is not a gate or tests/live file, `declsOf` is not a recording double, and no merge, rename or delete is proposed, so this is D7 boilerplate duplication. It is not a duplicate: PTQ-1495 (open) is the same pattern in a different file (union-generic-arm-lowering.test.ts), and PTQ-0604/0870/0574 cover other files and none names this one. The repo tracks unmigrated sites in separate files as their own rows (PTQ-0870 precedent) (triage: claude-opus-5-5)
