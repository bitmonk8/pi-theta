---
id: PTQ-0176
title: The invoke-static-checks.ts module header inventories the checks the module wires but stops at bug 0138, omitting the three later imported-.thetalib checks (bugs 0429/0430/0448) exported from the same file and the RFC 0009 with-clause checks
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/invoke-static-checks.ts:1-58
  - src/extension/invoke-static-checks.ts:1786-1790
  - src/extension/invoke-static-checks.ts:1885-1889
  - src/extension/invoke-static-checks.ts:1992-1996
  - src/extension/invoke-static-checks.ts:402-416
  - src/extension/invoke-static-checks.ts:1387-1394
  - src/extension/import-static-checks.ts:1808-1848
sites: 7
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# The invoke-static-checks.ts module header inventories the checks the module wires but stops at bug 0138, omitting the three later imported-.thetalib checks (bugs 0429/0430/0448) exported from the same file and the RFC 0009 with-clause checks

## Observation
The 58-line module header of `invoke-static-checks.ts` is a bulleted inventory
of the checks the module wires ("Each check reuses an existing, unit-tested
checker rather than reimplementing it:"), listing INV-3, bug 0137, two bug 0072
checks, INV-4, INV-1, and bug 0138's `checkImportedFnCallArgs` "wired once per
importing theta from `checkThetaImports`". The module has since gained three
more exported checks wired from the same `checkThetaImports` site in the same
shape — `checkImportedSchemaCtorFields` (bug 0429), `checkImportedEnumVariantAccess`
(bug 0430), `checkImportedNonCtorTypeNames` (bug 0448) — and, inside
`checkInvokeStaticResolution`, the RFC 0009 with-clause checks (`checkClauseCwdType`
for INV-6, the INV-8 prompt-mode gate on both surfaces, and the Erratum A′
default-reject loop). None of these appears in the header. Blame shows no
header line from the commits that added them (fae6d6a4, fd0704e6, 96303cc3).

## Evidence
src/extension/invoke-static-checks.ts:1-4 — the header's framing sentence:

```ts
// Load-time (compose-pass) wiring for the invoke static checks the shipped
// pipeline previously never ran (invocation.md §Argument arity / §Resolution /
// §Cycle detection). Each check reuses an existing, unit-tested checker rather
// than reimplementing it:
```

src/extension/invoke-static-checks.ts:38-43 — the last bullet, bug 0138,
describing exactly the wiring shape the three omitted siblings share:

```ts
//   - bug 0138 — `checkImportedFnCallArgs`, wired once per importing theta from
//     `checkThetaImports` (../extension/import-static-checks.ts): an imported
//     `.thetalib` `fn` call's argument COUNT (`theta/parse/fn-arity-too-few` /
//     `-too-many`, bug 0131's arm (3), deferred to this bug by name) and
//     per-slot TYPE (`theta/parse/fn-arg-type-mismatch`, whose *Trigger*
//     already named the imported half). No new diagnostic code; the three
```

Search `sed -n 1,58p src/extension/invoke-static-checks.ts | grep -i
"0429\|0430\|0448\|RFC 0009\|INV-6\|INV-8\|checkImportedSchemaCtorFields\|checkImportedEnumVariantAccess\|checkImportedNonCtorTypeNames"`
→ 0 hits.

The omitted exports, same file:

src/extension/invoke-static-checks.ts:1786-1790

```ts
export function checkImportedSchemaCtorFields(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedSchemas: ReadonlyMap<string, readonly SchemaFieldSource[]>,
```

src/extension/invoke-static-checks.ts:1885-1889

```ts
export function checkImportedEnumVariantAccess(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedEnums: ReadonlyMap<string, readonly string[]>,
```

src/extension/invoke-static-checks.ts:1992-1996

```ts
export function checkImportedNonCtorTypeNames(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedNonCtorKinds: ReadonlyMap<string, ImportedNonCtorKind>,
```

src/extension/import-static-checks.ts:1808-1848 — all four imported-`.thetalib`
checks wired from the one site the header attributes to bug 0138 alone
(`grep -n "checkImported.*(" src/extension/import-static-checks.ts` → :1808
`checkImportedFnCallArgs(`, :1821 `checkImportedSchemaCtorFields(`, :1834
`checkImportedEnumVariantAccess(`, :1848 `checkImportedNonCtorTypeNames(`).

The omitted RFC 0009 checks, same file:

src/extension/invoke-static-checks.ts:402-403, :416

```ts
 * INV-6 (invocation.md `#options-surface`) — judge a call-site `with` clause's
 * `cwd` value as an ordinary argument slot of expected type `string`: "a type
```
```ts
function checkClauseCwdType(input: {
```

src/extension/invoke-static-checks.ts:1387-1390

```ts
    // RFC 0009 Erratum A′ (invocation.md INV-8) — the call-site clause's
    // DEFAULT-REJECT callee classification: ONE loop, TWO codes, a three-way
    // verdict against the frozen callable set. The clause is legal on exactly
    // two surfaces, so this loop convicts everything else on the bare-ident
```

Blame: `git blame -L 1,58 src/extension/invoke-static-checks.ts` attributes
lines to 2626d39d, 80fef716, 54dd6c1e (bug 0138, 2026-08-23), a314ac83,
f8364db1, 537c274c, 2bc69157 only. The three later commits touching this file
— fae6d6a4 (bugs 0428-0430, 2026-09-04), fd0704e6 (bugs 0448-0450,
2026-09-05), 96303cc3 (RFC 0009, 2026-09-09) — contribute no header line.

## Why this is a problem
Stale roster. The header presents itself as the module's inventory of wired
checks and was maintained through five successive additions (0071, 0072, 0110,
0137, 0138 — each has a bullet), then stopped: the module now exports four
imported-`.thetalib` checks wired identically from `checkThetaImports`, and
the header names one. The with-clause checks add three new registry codes and
one reused route to `checkInvokeStaticResolution`, none of which the header
mentions. A reader using the header to learn what the file owns — its stated
function — is given a snapshot of the file as of 2026-08-23. The gap is
mechanical (three later commits, zero header edits), not interpretive.

## Suggested direction (non-binding, optional)
Either extend the inventory to the checks now exported/wired from this file
(the 0429/0430/0448 siblings and the RFC 0009 routes) or reduce the header to
a scope statement and let each function's own doc comment carry the details,
so the header cannot drift again.

## False-positive check
- Verified the three imported-decl checks are exported from this file and
  wired in production, not test-only: import at
  src/extension/import-static-checks.ts:115-122 and calls at :1821/:1834/:1848,
  reached via `checkThetaImports` ← production-composition.ts (the same route
  the header itself describes for bug 0138).
- Verified the RFC 0009 checks live in this file and run in production:
  `checkClauseCwdType` is called at :1147 and :1259 inside
  `checkInvokeStaticResolution`, which production-composition.ts:1122 invokes.
- Verified the header is an inventory rather than a scoped sample: it was
  updated for each of five prior additions (bullets for 0071/INV-3, 0072 ×2,
  0110/INV-1, 0137, 0138), which is the pattern a maintained roster has.
- Not a duplicate: no filed finding cites invoke-static-checks.ts:1-58.
  PTQ-0061 (collectInvokeExprs export) and PTQ-0050 (ImportedNonCtorKind
  field) are different symptoms in this file. This finding is separate from
  qw20260910054544-d2-01 (the `checkInvokeStaticResolution` doc block at
  :989-1028), a different comment block with a different omitted set.

## Triage
verdict: confirmed — every cited fact reproduces at the exact lines: header :1-58 is a colon-introduced per-check bulleted inventory whose last bullet (:38-50, bug 0138) is its sole imported-`.thetalib` entry, the stated grep over :1-58 returns 0 hits, the three sibling exports sit at :1786/:1885/:1992 and are pushed from `checkThetaImports` at import-static-checks.ts:1821/:1834/:1848 directly after the 0138 push under comments that literally say "the same wiring shape as the `checkImportedFnCallArgs` push immediately above" (production-reachable via production-composition.ts:1181/:2950), the RFC 0009 routes live at :416 `checkClauseCwdType` (called :1147/:1259), the INV-8 mode gate at :1121-1132/:1237-1249 and the Erratum A′ loop at :1387-1439 (three WITH_CLAUSE_*_CODE constants imported at :91-97) inside `checkInvokeStaticResolution` (production-composition.ts:1122), and `git blame -L 1,58` attributes lines only to 2626d39d/80fef716/54dd6c1e/a314ac83/f8364db1/537c274c/2bc69157 while fae6d6a4/fd0704e6/96303cc3 contribute no header line (96303cc3's `@@ -57` hunk edits only the :61 import); the "maintained roster" premise holds on four verified additions (f8364db1 rewrote INV-3, 80fef716 added both 0072 bullets, a314ac83 added 0137, 54dd6c1e added 0138) though the candidate over-counts by one — bug 0110 (6093597c) touched only :612-630 and the INV-1 bullet is 2626d39d's original INV-5 relabelled by 537c274c (bug 0112), which if anything shows the header was still curated on 2026-08-23; stale inventory is the accepted class of PTQ-0113/0116/0127/0153/0160, and same-wave d2-01 (confirmed) is the separate :989-1028 doc block whose triage explicitly carved out this header, d2-03 cites :27-28 only as a counter-witness for its loop-count claim, d2-08 is invoke-diagnostics.ts's header — not a duplicate (triage: claude-opus-5)
