---
id: PTQ-0002
title: ceiling-arbitration exports CHECK_SITES which no code, test, tool, or doc references
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/ceiling-arbitration.ts:58-63
sites: 1
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ceiling-arbitration exports CHECK_SITES which no code, test, tool, or doc references

## Observation
`src/runtime/ceiling-arbitration.ts` exports the constant `CHECK_SITES`, an
ordered array of the four `CheckSite` literals. The module's own `arbitrate`
reads the `SITE_CEILING` map, not `CHECK_SITES`. No other file in the
repository — production, extensions, tools, tests, or docs — references the
identifier, and none ever has since the constant was introduced.

## Evidence
src/runtime/ceiling-arbitration.ts:58-63:
```ts
export const CHECK_SITES: readonly CheckSite[] = [
  "invoke-entry",
  "round-boundary",
  "slash-load-binder",
  "ajv-boundary",
] as const;
```

Search: `grep -rn "CHECK_SITES" . --include="*.ts" --include="*.js"
--include="*.mjs" --include="*.cjs" --include="*.md"` (node_modules and dist
excluded) → exactly 1 hit: the definition above.

The only importers of the module are two test files, and both import only
`arbitrate` and `type CeilingCandidate`:
tests/ceiling-arbitration.test.ts:26-30:
```ts
import {
  arbitrate,
  type CeilingCandidate,
} from "../src/runtime/ceiling-arbitration";
```
tests/integration-acceptance.test.ts:33-36 imports the same two names.

Git: `git log --all --oneline -S "CHECK_SITES"` → one commit, `a68b3536`
("V16a-T — Hard-ceiling interaction order and masked co-fire (failing
tests)"), the commit that introduced it; even that commit's tests did not
reference it.

## Why this is a problem
Dead code, proven: an exported constant with zero references anywhere in the
repository across all file types, no barrel or `export *` re-export path
(`grep -rn "export \*" src` → no hits), and no dynamic/string-keyed access to
the literal name. It has been unreferenced since the commit that created it.

## Suggested direction (non-binding, optional)
Removal candidate; nothing anywhere consumes the ordered site list, and the
`CheckSite` union plus `SITE_CEILING` already carry the same information for
the module's one behaviour.

## False-positive check
- Identifier search across src/, extensions/, tools/, tests/ and docs (ts,
  js, mjs, cjs, md): 1 hit — the definition.
- String-keyed/dynamic access: searched the bare literal `CHECK_SITES` in all
  text file types; no hits beyond the definition.
- Re-exports: no `export *` exists anywhere in src (grep), and no module
  re-exports from `./ceiling-arbitration`.
- Test-only-caller rule: not applicable — tests do not reference it either
  (both test importers were read; they import `arbitrate` and
  `CeilingCandidate` only).
- Git history intent: introduced in the V16a-T tests-task commit and never
  referenced by any later commit (`git log --all -S` shows only the
  introduction).

## Triage
verdict: confirmed — reverified: excerpt exact at 58-63, repo-wide grep (all file types) yields the definition only (other hits are generated dist/), no `export *` or importer of the module in src/, both test importers take only `arbitrate`+`CeilingCandidate`, and `git log --all -S` shows only introducing commit a68b3536 whose own tests never used it (triage: claude-opus-5)
