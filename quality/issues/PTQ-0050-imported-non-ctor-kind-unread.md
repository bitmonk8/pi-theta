---
id: PTQ-0050
title: ImportedNonCtorKind.kind is populated with three distinct discriminants that no consumer ever reads — the map is used for key membership only
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1692-1694
  - src/extension/invoke-static-checks.ts:1744-1750
  - src/extension/invoke-static-checks.ts:1770-1783
  - src/extension/import-static-checks.ts:1097
  - src/extension/import-static-checks.ts:1244
  - src/extension/import-static-checks.ts:1265
  - src/extension/import-static-checks.ts:1289
sites: 7                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ImportedNonCtorKind.kind is populated with three distinct discriminants that no consumer ever reads — the map is used for key membership only

## Observation
Bug 0448's load-route wiring builds `importedNonCtorKinds`, a
`Map<string, ImportedNonCtorKind>` whose values carry a three-way `kind`
discriminant (`"enum" | "fn" | "schema-alias"`). Three producer sites in
`checkThetaImports` construct the three distinct values. The map's only
consumer, `checkImportedNonCtorTypeNames`, reads it exclusively through
`.size` and `.has(typeName)`; it never calls `.get`, never iterates entries,
and emits one fixed-template diagnostic that does not vary by kind. The
`kind` payload — and therefore the object wrapper around it — is written and
never read.

## Evidence
src/extension/invoke-static-checks.ts:1692-1694 — the value type:

```ts
export interface ImportedNonCtorKind {
  readonly kind: "enum" | "fn" | "schema-alias";
}
```

src/extension/import-static-checks.ts:1097, 1244, 1265, 1289 — the map and its
three producer sites (verbatim single lines):

```ts
const importedNonCtorKinds = new Map<string, ImportedNonCtorKind>();
        importedNonCtorKinds.set(specifier.local, { kind: "schema-alias" });
          importedNonCtorKinds.set(specifier.local, { kind: "fn" });
        importedNonCtorKinds.set(specifier.local, { kind: "enum" });
```

src/extension/invoke-static-checks.ts:1744-1750 — the sole consumer's
signature and first map read:

```ts
export function checkImportedNonCtorTypeNames(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedNonCtorKinds: ReadonlyMap<string, ImportedNonCtorKind>,
): Diagnostic[] {
  if (importedNonCtorKinds.size === 0) {
```

src/extension/invoke-static-checks.ts:1770-1783 — the only other map read
(membership) and the kind-independent emission:

```ts
    if (!importedNonCtorKinds.has(typeName)) {
      // Not a non-brace-constructible imported binding this route reaches: a
      // same-file declaration, an imported OBJECT-form schema (0429's class),
      // an unresolved name, or a re-export-chain declaration this map's own
      // doc comment (above) defers on.
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "theta/parse/unresolved-named-type",
      file: importingFile,
      range: ctor.range,
      message: `unresolved named type '${typeName}'`,
    });
```

Exhaustive access search — `grep "importedNonCtorKinds\." src/` hits exactly:
`.set` ×3 (import-static-checks.ts:1244, 1265, 1289), `.size` ×1
(invoke-static-checks.ts:1750), `.has` ×1 (invoke-static-checks.ts:1770). No
`.get`, `.values`, `.entries`, `for…of`, or spread anywhere.

## Why this is a problem
Vestigial field: the value is never read (the brief's mechanical criterion).
The route needs only the SET of imported names that are not
brace-constructible — membership alone decides the one fixed-message
diagnostic, and the module's own doc comment confirms all three kinds draw
"the byte-identical message template". Computing and storing a three-way
classification that nothing consults is speculative generality (a
discriminant with zero discriminating users) and misleads a reader into
expecting per-kind behavior downstream.

## Suggested direction (non-binding, optional)
The value type could collapse to key membership (e.g. a `ReadonlySet<string>`
of non-constructible local names), or the discriminant could stay only if a
consumer that reads it actually lands; either way the current unread payload
should not survive as-is.

## False-positive check
Reference searches: `ImportedNonCtorKind` across src/, extensions/, tools/,
tests/ — hits only src/extension/invoke-static-checks.ts (definition,
signature) and src/extension/import-static-checks.ts (type import, map
construction); no test, tool, or extension references the type or the map.
Dynamic access: the map is a function-local variable flowing only into
`checkImportedNonCtorTypeNames` (import-static-checks.ts:1664-1670); no
string-keyed or reflective access is possible. Tests: b0448 witness tests
(tests/b0448-imported-non-object-ctor.test.ts) drive the behavior through
`checkThetaImports` and assert rendered diagnostics — none read `kind`, and
the diagnostic they pin is kind-independent, so removing the payload cannot
move a witnessed count. Git intent: the field arrived with bug 0448's fix
(fae6d6a4) already unread — no prior consumer was removed. The map itself is
alive (membership gates a production diagnostic); only the `kind` payload is
found dead.

## Triage
verdict: confirmed — re-verified independently: `kind` is written at three `.set` sites and never read (map accessed only via `.size`/`.has`, no `.get`/iteration/spread, function-local with no aliasing, no barrel re-export, no test or tool consumer), and it was unread from birth in fd0704e6; cited import-static-checks.ts lines were exact at filing time and drifted only via later commit d03f7398 (triage: claude-opus-5)
