---
id: PTQ-0800
title: generic-argument-inline-field-key-rules.test.ts redeclares e2e-s1's exported diagLines(doc) under a local declaration instead of importing it
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/generic-argument-inline-field-key-rules.test.ts:8
  - tests/generic-argument-inline-field-key-rules.test.ts:296-303
  - tests/helpers/e2e-s1.ts:123-126
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# generic-argument-inline-field-key-rules.test.ts redeclares e2e-s1's exported diagLines(doc) under a local declaration instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` ``.
`tests/generic-argument-inline-field-key-rules.test.ts` already imports
`parseDoc` from that exact module (`./helpers/e2e-s1`) but does not import
`diagLines`; it instead declares its own module-local function of the same
name with a functionally identical one-line body over the same
`doc.diagnostics` projection, then composes its own `lines(src, path)`
wrapper on top of the local copy.

## Evidence
`tests/helpers/e2e-s1.ts:123-126` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/generic-argument-inline-field-key-rules.test.ts:8` (the import that
omits `diagLines`) and `:296-303` (the local reimplementation plus its
wrapper):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "test.theta"): string[] {
  return diagLines(parseDoc(src, path));
}
```

Exact search: `grep -n "^function diagLines" tests/generic-argument-inline-field-key-rules.test.ts` returns exactly one declaration, and the file's only `./helpers/e2e-s1` import names `parseDoc` alone.

## Why this is a problem
The file already reaches into `tests/helpers/e2e-s1` for `parseDoc` in the
same import statement the canonical `diagLines` is exported from, so the
reimplementation is not a case of the helper being hard to find. The map
expression `doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`
is typed out a second time, identically (bar an explicit `Diagnostic`
parameter annotation the export omits), under a second, file-private
declaration of the identical name and doc comment as the exported one,
rather than calling the already-visible import.

## Suggested direction (non-binding, optional)
The file could add `diagLines` to its existing `./helpers/e2e-s1` import and
have its local `lines(src, path)` wrapper call the imported function
directly, dropping the local declaration.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: not applicable — `diagLines`/`lines` render an
  already-produced diagnostics array for a positive assertion; they record no
  calls and back no "never called" witness.
- docs/bugs/ signature search: `grep -n "diagLines" docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md` → 0 hits; no documented correct-reason red cites the local reimplementation. (The file itself is a §Fix (d) fresh witness for bug 0233, already fixed per `docs/bugs/README.md:255`, confirmed green by running `npx vitest run tests/generic-argument-inline-field-key-rules.test.ts` — 9/9 pass — so nothing here is a documented correct-reason red.)
- coverage-matrix/bug-doc citation search: `grep -n "generic-argument-inline-field-key-rules" docs/reference/coverage-matrix.md` → 0 hits. The file IS named by path in several other bug docs' witness lists (0233, 0235, 0236, 0237, 0238, 0244, 0245); this finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` block — only that the existing `./helpers/e2e-s1` import could additionally name `diagLines` — so no pinned citation is disturbed.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; the file's own tests exercise the local copy fully, and no
  behaviour path is claimed untested.
- Overlap check: `grep -rl "generic-argument-inline-field-key-rules" quality/intake quality/issues quality/resolved` finds no prior filing of this pair; the sibling same-wave finding `qw20260918050411-d7-01-diaglines-reimplemented-both-in-scope-files.md` and `qw20260918050411-d7-01-diaglines-reimplemented-inline-object-empty-pair.md` cite disjoint file pairs (`brace-and-angle-annotation-junk-refusal.test.ts`/`brace-rooted-union-arm-capture.test.ts` and `inline-object-empty-entry-slot-refusal.test.ts`/`inline-object-empty-field-type-truncation.test.ts`), neither of which is this file.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the local `diagLines` at tests/generic-argument-inline-field-key-rules.test.ts:297-299 is identical to the export at tests/helpers/e2e-s1.ts:124-126 once `export ` and the `: Diagnostic` annotation are stripped (mktemp diff → zero), the file's sole e2e-s1 import (:8) names only `parseDoc`, the decl grep returns exactly one declaration, the copy is live via `lines()` through expectGroup (:329), docs/bugs/0233 and coverage-matrix searches return 0 hits, not a gate file, no exemption row, 9/9 green; D7 boilerplate-duplication class under tests/ with a mechanical import-swap fix; the candidate's overlap check is wrong in one respect — resolved PTQ-0205's 68-site pattern roster names this file by path at `:320` — but PTQ-0205 is closed (status fixed) and its fix commit 2594cd44 touched none of this file, so the site is an untracked residual, matching the accepted residual-site convention (PTQ-0591/0732/0733 ruled confirmed on the same "roster was pattern evidence, not cited sites" reasoning); same-wave sibling d7-03 cites disjoint files (triage: claude-fable-5-1)
