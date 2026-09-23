---
id: pending
title: deriveCallableName hand-rolls the default-name derivation that callable-set.ts's thetaDefaultName declares itself the single implementation of
lens: D8
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1869-1878
  - src/parser/callable-set.ts:555-566
  - src/extension/production-discovered-theta.ts:43-45
sites: 1
fix_scope: module
d8_class: reimplemented
d8_host: src/extension/production-composition.ts#deriveCallableName
wave: qw20260922211400
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-23
---

# deriveCallableName hand-rolls the default-name derivation that callable-set.ts's thetaDefaultName declares itself the single implementation of

## Observation
`production-composition.ts#deriveCallableName` (1876-1878) derives a discovered
`.theta`'s presented callable name as `thetaBasename(sourcePath).replace(/-/g, "_")`,
and its own doc comment says it is "the same derivation `resolveCallableSet`
applies to a bare `.theta` path". That derivation already has an exported
single implementation: `callable-set.ts#thetaDefaultName`, whose doc comment
pins the no-divergence intent (bug 0253) and which `production-composition.ts`'s
sibling module `production-theta-producer.ts` imports for exactly this reason.
`production-composition.ts` already imports from `../parser/callable-set`
(map: imports list), so no cycle blocks delegation. The two bodies differ in
one detail: `thetaDefaultName` uses `posix.basename`, `deriveCallableName`'s
`thetaBasename` uses `pathWin32.basename`.

## Evidence
The reimplementation, src/extension/production-composition.ts:1869-1878 (verbatim):
```ts
/**
 * The presented callable name a discovered `.theta` maps to (the same
 * derivation `resolveCallableSet` applies to a bare `.theta` path: basename
 * without the `.theta` extension, hyphens replaced by underscores). Used to
 * align the parent-marshalled callable hashes (keyed by presented name) with
 * the child's discovered thetas.
 */
function deriveCallableName(sourcePath: string): string {
  return thetaBasename(sourcePath).replace(/-/g, "_");
}
```
The facility, src/parser/callable-set.ts:555-566 (verbatim):
```ts
 * The default name for a `.theta` path entry: the file's basename without the
 * `.theta` extension, with hyphens replaced by underscores
 * (`./code-review.theta` → `code_review`). The SINGLE implementation of
 * `frontmatter-fields-a.md` §default name — exported for the same reason
 * `parseToolsEntry` above is: the producer's snapshot-absent fallback
 * (`src/extension/production-theta-producer.ts`) derives a `.theta` entry's
 * default name from this function rather than re-implementing the rule, so
 * the two readers cannot diverge on a hyphenated stem (bug 0253).
 */
export function thetaDefaultName(thetaPath: string): string {
  return posix.basename(thetaPath, ".theta").replace(/-/g, "_");
}
```
Feature-for-feature at the call sites: `deriveCallableName` is called twice
(1984 in `refuseDivergedChildCallables`'s file-derivation fallback, 3034 in
`captureRootClosureHash`), both times over a discovered theta's `sourcePath`,
to mint the key that must byte-agree with the parent-marshalled hash map keyed
by the presented name (`subagent-callable-hash.ts:24-25`: "a JSON map
`{ callable name: \"sha256:...\" }`"). The parent side keys `.theta` entries via
`resolveCallableSet`/`thetaDefaultName` (posix). The one delta — win32 vs
posix basename — matters only for a `sourcePath` carrying backslashes; no
rationale for that delta is stated at either the function or `thetaBasename`
(production-discovered-theta.ts:43-45: "The `.theta` basename (minus extension)
of a path, for the callee slash name.").

## Why this is a problem
`thetaDefaultName`'s header names itself the SINGLE implementation of the
frontmatter-fields-a.md §default-name rule, exported precisely so readers
"cannot diverge on a hyphenated stem (bug 0253)". `deriveCallableName` is a
second implementation of that rule feeding the RFC-0005 hash-alignment path,
where a divergence (e.g. a backslash-spelled source path making posix and
win32 basenames disagree) silently mis-keys a marshalled hash — the exact
failure class the export was minted to prevent. PTQ-1236 (confirmed, fixed)
already established this class for `theta-document.ts#toolCallableName`; this
is the remaining copy in `production-composition.ts`.

## Suggested direction (non-binding, optional)
Unproven hypothesis: delegate to `thetaDefaultName` (the module already imports
from `../parser/callable-set`); if the win32-basename tolerance is load-bearing
for backslash source paths, normalising the path first (the shared
`normalizePath`) preserves it while keeping one implementation of the naming
rule. The fix stage owns the choice.

## False-positive check
- Facility citation re-read before filing (callable-set.ts:555-566); importer
  check: production-composition.ts already imports `../parser/callable-set`
  (brief's map) so delegation introduces no new edge or cycle.
- Live-use check: `deriveCallableName` has two callers (1984, 3034), both
  production paths; not dead code.
- Duplicate check: PTQ-1236 covered `theta-document.ts#toolCallableName` only
  (status fixed); no intake or issue names `deriveCallableName`.
- D2 precedent check: no stated rationale for a second implementation — the
  doc comment asserts sameness with `resolveCallableSet`'s derivation, which is
  the delegation argument, not a divergence rationale.
- Spec check: frontmatter-fields-a.md §default name is the pinned rule; the
  filing proposes no behaviour outside it.
- Exemption check: no D8 exemption keyed to this host or function.

## Triage
verdict: questionable — accounting verified: excerpts byte-match at production-composition.ts:1869-1878, callable-set.ts:555-566 and production-discovered-theta.ts:43-45; deriveCallableName has exactly the two live callers claimed (1984 refuseDivergedChildCallables file-derivation fallback, 3034 captureRootClosureHash), both over a discovered theta's sourcePath (= discovery `theta.path`, production-discovered-theta.ts:127) minting the presented-name key that must agree with the parent side's thetaDefaultName-derived map; thetaDefaultName's src callers are callable-set.ts:483, theta-document.ts:1864 (post-PTQ-1236 delegation) and production-theta-producer.ts:5870/5943, so deriveCallableName is the last un-delegated reader of the bug-0253 "SINGLE implementation" rule; production-composition.ts already imports from ../parser/callable-set (line 167) so no new edge/cycle; the sole delta (pathWin32 vs posix basename, i.e. backslash tolerance) is stated and accounted for by the filing (normalizePath-first, src/normalize-path.ts:24 replaces `\\`→`/`), and discovery already forward-slashes roots/paths (discovery-walk.ts:166/259-264/325/533), so the facility covers the need; spec frontmatter-fields-a.md §default name is the same rule (nothing dropped); `grep production-composition|deriveCallableName quality/exemptions.json` → 0 hits; not a duplicate: PTQ-1236 (fixed) covered theta-document.ts#toolCallableName, PTQ-1229 (fixed) covered thetaBasename's own body, PTQ-1269 is a D9 breakdown of refuseDivergedChildCallables and PTQ-0322 Seam C a file-level placement — none targets this reimplementation; D8 reimplemented never confirms: the delegation shape (delegate vs normalise-then-delegate) is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently at HEAD: excerpts byte-exact at production-composition.ts:1869-1878, callable-set.ts:555-566, production-discovered-theta.ts:43-45; `grep -rn deriveCallableName src extensions tools tests` → decl 1876 + exactly two live callers (1984 refuseDivergedChildCallables fallback, 3034 captureRootClosureHash) plus comment-only hits, both fed discovery `theta.path` (production-discovered-theta.ts:127) which discovery-walk.ts already routes through normalizePath (:166/:259-264), so the sole pathWin32-vs-posix basename delta is unreachable on real input and the facility covers the need; thetaDefaultName's src callers are callable-set.ts:483, theta-document.ts:1864 (PTQ-1236 delegation) and production-theta-producer.ts:5870/5943, leaving this as the last un-delegated reader of the bug-0253 "SINGLE implementation" rule; production-composition.ts:167 already imports ../parser/callable-set (no new edge); spec docs/spec_topics/frontmatter/frontmatter-fields-a.md:85 §default name is the identical rule (nothing dropped); `grep production-composition|deriveCallableName quality/exemptions.json` → 0; not a duplicate — PTQ-1236 (theta-document#toolCallableName), PTQ-1229 (thetaBasename body), PTQ-1269 (D9 breakdown of refuseDivergedChildCallables), PTQ-0322/0348 (placement / hash recompute) each have a different root; D8 reimplemented never confirms — delegate vs normalise-then-delegate is a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified a third time at HEAD: excerpts byte-exact at production-composition.ts:1870-1879, callable-set.ts:555-566 and production-discovered-theta.ts:43-45; `grep -rn deriveCallableName src extensions tools tests` → decl 1877 + exactly two live callers (now 1975 refuseDivergedChildCallables fallback and 3078 captureRootClosureHash, small drift from the filed 1984/3034) plus comment-only hits, both over discovery `theta.path` (production-discovered-theta.ts:127) which discovery-walk.ts already forward-slashes via normalizePath (:166/:259-264/:325/:533), so the pathWin32-vs-posix basename delta is unreachable on real input and thetaDefaultName covers the need; thetaDefaultName src callers are callable-set.ts:483, theta-document.ts:1864 (PTQ-1236 delegation) and callable-lowering.ts:387/460 (the producer fallback, since moved), leaving deriveCallableName the last un-delegated reader of the bug-0253 "SINGLE implementation" rule; production-composition.ts:168 already imports ../parser/callable-set (no new edge); spec frontmatter-fields-a.md:85 §default name is the identical rule (nothing dropped); `grep production-composition|deriveCallableName quality/exemptions.json` → 0; not a duplicate — PTQ-1236 (theta-document#toolCallableName, fixed), PTQ-1229 (thetaBasename body, fixed), PTQ-1269 (D9 breakdown), PTQ-0322/0348 (placement / hash recompute), PTQ-1291 (producer inline normalize) each have a different root; D8 reimplemented never confirms — delegate vs normalise-then-delegate is a human ruling (triage: claude-fable-5-1)
