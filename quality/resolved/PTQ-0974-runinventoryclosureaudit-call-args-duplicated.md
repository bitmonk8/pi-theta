---
id: PTQ-0974
title: inventory-closure-audit.test.ts and inventory-closure-audit-gate.test.ts repeat the same four-key runInventoryClosureAudit() call-argument object at three call sites
lens: D7
wave: qw20260918131151
status: fixed
verdict: confirmed
locations:
  - tests/inventory-closure-audit-gate.test.ts:82-87
  - tests/inventory-closure-audit-gate.test.ts:151-156
  - tests/inventory-closure-audit.test.ts:37-42
sites: 3
fix_scope: localized
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inventory-closure-audit.test.ts and inventory-closure-audit-gate.test.ts repeat the same four-key runInventoryClosureAudit() call-argument object at three call sites

## Observation
Both files call the production `runInventoryClosureAudit(...)` with the same four-key argument object — `files`, `inventory: SDK_SURFACE_INVENTORY`, `typeboxNamedImportAllowList: TYPEBOX_NAMED_IMPORT_ALLOW_LIST`, `typeboxMemberAccessAllowList: TYPEBOX_MEMBER_ACCESS_ALLOW_LIST` — at three separate call sites (two inside `inventory-closure-audit-gate.test.ts`, one inside `inventory-closure-audit.test.ts`). Only the `files:` value differs between the three call sites; the other three keys are typed out identically each time.

## Evidence
`tests/inventory-closure-audit-gate.test.ts:82-87` (`runAuditGate`, re-read immediately before filing):
```ts
    result = runInventoryClosureAudit({
      files,
      inventory: SDK_SURFACE_INVENTORY,
      typeboxNamedImportAllowList: TYPEBOX_NAMED_IMPORT_ALLOW_LIST,
      typeboxMemberAccessAllowList: TYPEBOX_MEMBER_ACCESS_ALLOW_LIST,
    });
```

`tests/inventory-closure-audit-gate.test.ts:151-156` (`auditOneFile`):
```ts
  const result = runInventoryClosureAudit({
    files: new Map([["src/x.ts", src]]),
    inventory: SDK_SURFACE_INVENTORY,
    typeboxNamedImportAllowList: TYPEBOX_NAMED_IMPORT_ALLOW_LIST,
    typeboxMemberAccessAllowList: TYPEBOX_MEMBER_ACCESS_ALLOW_LIST,
  });
```

`tests/inventory-closure-audit.test.ts:37-42` (`audit`):
```ts
function audit(files: Record<string, string>): AuditResult {
  return runInventoryClosureAudit({
    files: new Map(Object.entries(files)),
    inventory: SDK_SURFACE_INVENTORY,
    typeboxNamedImportAllowList: TYPEBOX_NAMED_IMPORT_ALLOW_LIST,
    typeboxMemberAccessAllowList: TYPEBOX_MEMBER_ACCESS_ALLOW_LIST,
  });
}
```

Exact search: `grep -n "runInventoryClosureAudit({" tests/inventory-closure-audit-gate.test.ts tests/inventory-closure-audit.test.ts` returns exactly these three call sites; each carries the same three fixed keys (`inventory`, `typeboxNamedImportAllowList`, `typeboxMemberAccessAllowList`) verbatim, varying only the `files:` value.

## Why this is a problem
`SDK_SURFACE_INVENTORY`/`TYPEBOX_NAMED_IMPORT_ALLOW_LIST`/`TYPEBOX_MEMBER_ACCESS_ALLOW_LIST` are the fixed configuration both files always pass — no call site in either file ever varies them — yet the three-key object literal binding them to `runInventoryClosureAudit`'s parameter names is retyped at each of the three call sites rather than captured once. A change to `runInventoryClosureAudit`'s parameter names, or to which allow-lists this pair of files always supplies, requires the same three-line edit repeated three times across two files to stay in sync.

## Suggested direction (non-binding, optional)
A single `auditWith(files)` wrapper binding the three fixed keys and taking only `files` is the shape all three call sites already reduce to; whether that wrapper lives in one of the two files or in the sibling `tests/helpers/inventory-closure-audit.ts` module (which already centralises the three constants themselves) is a decision for the fix stage.

## False-positive check
- Gate-pin check: `tests/inventory-closure-audit-gate.test.ts` matches `*gate*.test.ts`. The carve-out protects pinned counts/inventories (e.g. this same file's `FAMILY_4_FIXTURES`/`FAMILY_5_FIXTURES` arrays and its `expect(canaryRecords).toHaveLength(1)` assertion) from being read as "an assert on a value the test fixed itself" — it does not shield a repeated function-call-argument object from a duplication claim; the three cited call sites are plain invocation boilerplate, not a pinned count.
- Recording-double check: `runInventoryClosureAudit` is the real production audit function, not a recording double; not applicable.
- docs/bugs/ signature search: `grep -n "runInventoryClosureAudit" docs/bugs/*.md` returns no hit — this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "inventory-closure-audit" docs/reference/coverage-matrix.md` returns no hit for either file by name; no merge, rename, or deletion of any `it()`/`describe()` is proposed — only that the three identical call-argument objects be captured once.
- Prior-filing search: `grep -rl "runInventoryClosureAudit({" quality/issues quality/intake quality/resolved` (excluding this file) returns no hit; the previously resolved `PTQ-0752` (fixed) covered the `TYPEBOX_*`/`DISCRIMINATOR_SHAPE` CONSTANT declarations being duplicated across the two files, which is now fixed (both files import them from `tests/helpers/inventory-closure-audit.ts`, confirmed by re-reading each file's import block) — this finding is about the separate, still-live duplication of the CALL-SITE object that consumes those constants, not a re-file of PTQ-0752.
- Coverage-drift check: this claim is about a repeated call-argument literal in code that exists and passes; no assertion is made about a missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all three excerpts match byte-for-byte at gate:82-87 / gate:151-156 / core:37-42; repo-wide grep (src/, extensions/, tools/, tests/) finds exactly these three `runInventoryClosureAudit({` call sites, each binding the same three fixed keys (`inventory: SDK_SURFACE_INVENTORY`, both `TYPEBOX_*` allow-lists) and varying only `files`; all three are live (every `it()` in both files routes through `audit`/`auditOneFile`/`runAuditGate`); D7 boilerplate duplication inside tests/ — the *gate*.test.ts carve-out protects pinned counts, not an invocation-argument literal; PTQ-0752 (fixed, 1a90292e) covered the constant DECLARATIONS and moved them to tests/helpers/inventory-closure-audit.ts but left this call-site binding retyped thrice, so this is a distinct root cause not a re-file; coverage-matrix grep → 0 reproduces; one stated search does NOT reproduce — `grep runInventoryClosureAudit docs/bugs/*.md` hits 0373:61 and 0374:74, but both bugs are `Status: fixed` and the mentions are deleted-scratch-probe narrative, not a witness list or open red signature, so no carve-out is triggered; mechanical dedupe (one `files`-only wrapper in the existing shared helper) (triage: claude-fable-5-1)
