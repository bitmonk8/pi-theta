---
id: PTQ-1174
title: factory.ts is 1518 LOC bundling the deps type family, the diagnostic vocabulary, the instance factory closure, and the production default export
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/factory.ts:1-1518
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/factory.ts
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# factory.ts is 1518 LOC bundling the deps type family, the diagnostic vocabulary, the instance factory closure, and the production default export

## Observation
`src/extension/factory.ts` is 1518 LOC (band justify: 1000-1999). Its header
(:1-28) names its role: the H4a theta extension factory the
`extensions/index.ts` entry shim re-exports. Besides the 967-LOC
`createThetaExtension` closure (filed separately this wave under its own host
key, `factory.ts#createThetaExtension`), the file hosts a 154-LOC injected-deps
type family whose importers are almost entirely tests, an ~75-LOC
bootstrap/compose/supersession diagnostic vocabulary, and the 82-LOC
production default export.

## Evidence
Distinct-concern inventory (line ranges/LOC from the structural map; each
range re-read before filing):

| concern | members | line ranges | LOC |
|---|---|---|---|
| bootstrap/compose/supersession diagnostic vocabulary | EXTENSION_BOOTSTRAP_FAILED_CODE, EXTENSION_COMPOSE_FAILED_CODE, THETA_FLAG, FactorySubscription, BootstrapCapability, SupersededGeneration, bootstrapFailedDiagnostic, composeFailedDiagnostic, SUPERSESSION_DETACH_FAILED_CODE, SUPERSESSION_DETACH_CALL_LABEL, SUPERSESSION_QUIESCE_CALL_LABEL, supersessionDetachFailedDiagnostic, quiesceOutgoingRebuild | 109-297 | 75 |
| injected-deps type family | ThetaFixture, ThetaExtensionDeps | 307-450 | 154 |
| extension-instance factory closure | createThetaExtension | 456-1422 | 967 |
| production default export wiring (probe, sinks, composeInstance adapter) | thetaExtension | 1437-1518 | 82 |

Importer counts, quoted from the structural map: `ThetaFixture` 3 src / 19
tests; `ThetaExtensionDeps` 0 src / 17 tests; `createThetaExtension` 0 src /
23 tests; `thetaExtension` 0/0 (reached via the `extensions/index.ts` shim);
`EXTENSION_BOOTSTRAP_FAILED_CODE` 0 src / 4 tests. Deps-family excerpt
(:307-312):
```ts
export interface ThetaFixture {
  /** Slash name (no leading `/`), e.g. `"echo"`. */
  readonly slashName: string;
  /** Autocomplete text (frontmatter `description`), when the theta declares one. */
  readonly description?: string;
```
`ThetaFixture`/`ThetaExtensionDeps` reference only imported types
(`ExtensionAPI`, `ExtensionContext`, `Diagnostic`, `RendererGate`,
`ExtensionInstanceWiring`, …) — nothing declared later in the file.

## Why this is a problem
Justify band (1518 LOC): presumption of breakdown — not filed only when a
concrete reason to keep whole is found and recorded. Reasons considered and
why each fails: data-only module — types plus constants are 229 of 1518 LOC
(15%), far under the 80% bar; single algorithm with shared local state —
that reason belongs to the closure concern alone (its 13 closure mutables);
the deps type family and the diagnostic builders read none of that state and
are referenced from outside the closure (17-23 test files each per the map);
closed-enumeration dispatch — `BootstrapCapability` (:148-154) is a closed
union but 7 LOC of a 1518-LOC file; grammar production / generated code — not
applicable (no grammar; no generator marker). The four concerns above are
separable today: concern 2 has zero dependencies on concerns 1, 3, or 4.

## Suggested direction (non-binding, optional)
Hypotheses, all unproven; the human ratifies. Seam A: move the injected-deps
type family (`ThetaFixture`, `ThetaExtensionDeps`, :307-450) -> a new
`src/extension/factory-deps.ts` (hypothesis) - 154 LOC, 2 exported symbols
moved, external importers 3 src / 19+17 tests per the map, cross-references
back into the host: none (type-only imports flow the other way). Seam B is the
sibling filing against `factory.ts#createThetaExtension` (this wave, d9-02):
its handler extractions remove the bulk of the closure concern. Seam C: none
identified yet for the diagnostic vocabulary (its builders are called only
from the closure and may follow whichever handler seam lands).

## False-positive check
- Band: justify (1518 LOC; FILE_BANDS justify=1000) — from the structural
  map, not recounted.
- Reasons-considered list with defeating evidence: recorded above (data-only
  15%; shared-state confined to concern 3; dispatch 7 LOC; no grammar; no
  generator).
- Exemptions check: quality/exemptions.json read in full — 4 entries, none in
  src/extension/.
- Generated-code check: no `@generated`/`DO NOT EDIT` marker.
- Spec-mirror check: extension-bootstrap-and-per-theta.md /
  registration-steps.md specify the factory's behaviour and ordering, not its
  file layout; the deps interface is a test seam (0 src importers), not a
  spec-named table.
- Overlap check with the sibling d9-02 filing: distinct host keys
  (file vs `#createThetaExtension`) and distinct seams (a type-family
  extraction stands even if the closure is ruled kept-whole; the residual
  file without the closure would be 551 LOC, but with it the file stays
  justify-band and the type family is still 154 LOC of separable surface).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 1518 LOC / band justify with the 17 declarations at the cited lines; the four inventory rows are real distinct member groups (deps types :307-450 reference nothing declared in the other three; diagnostic builders :182-297 are called only inside the closure; default export :1437-1518 is separate wiring; no shared locals across rows); importer counts hold (ThetaFixture 3 src imports, ThetaExtensionDeps 0 src / comment-only mentions, thetaExtension reached via extensions/index.ts); no overlooked keep-whole reason (data/type LOC 166-229 = 11-15%; no switch on BootstrapCapability; no @generated marker; no exemptions.json entry for src/extension/; no reverted prior split in history); sibling d9-02 is under the distinct #createThetaExtension host key, not a duplicate. Excerpt defect noted: the :307-312 doc-comment text is paraphrased, not verbatim (code lines match). Target shape is a design decision for a human ruling. (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map (manifest run) now gives 1512 LOC / band justify (filing's 1518 is a −6 drift from same-wave commit 0fb4497e inside the closure; FILE_BANDS justify=1000) with all 17 declarations at the cited rows ±1/−6; the four inventory rows are distinct member groups sharing no locals — deps types 308-451 reference only symbols imported at lines 5-99, the diagnostic builders 183-298 are pure module-level functions whose only callers are inside the closure (638…1411), the default export 1431-1512 owns its own rendererGate/sink/probe/childControlPlane; importer counts hold (ThetaFixture 3 src type-imports, ThetaExtensionDeps comment-only in src at production-composition.ts:4501/4503, createThetaExtension 0 src, default via extensions/index.ts); no overlooked keep-whole reason — data/type LOC 166/1512 ≈ 11 %, zero `switch` in the file, no @generated marker, exemptions.json has no D9 key for factory.ts (its one src/extension/ entry is a D8 on production-theta-producer.ts, immaterial), no deleted factory-* module in history, header pins sync-arm/never-throw behaviour and docs/spec_topics never names factory.ts so nothing pins layout; not a duplicate (PTQ-0306 and sibling d9-02 are both the #createThetaExtension host key); :307-312 excerpt doc-comments paraphrased, code lines match; target shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified a third time from scratch: size-scan map (manifest under $TEMP) gives src/extension/factory.ts 1512 LOC / band justify (FILE_BANDS justify=1000; filing's 1518 is the same-wave −6 drift) with all 17 declarations at the cited rows (diagnostic vocabulary 110-298, ThetaFixture 308-319, ThetaExtensionDeps 322-451, createThetaExtension 457-1416, thetaExtension 1431-1512); the four inventory rows are distinct member groups sharing no locals — a grep of the 308-451 range for every symbol declared elsewhere in the file returns zero hits, the four diagnostic builders/quiesce helper are module-level functions whose 17 call sites all fall inside the closure (638-1411), and the default export constructs its own RendererGate/sink per call; importer counts hold (ThetaFixture 3 real src type-imports at production-composition.ts:124, theta-composition-producer.ts:34, minimal-theta.ts:18 plus comment-only mentions; ThetaExtensionDeps src mentions are doc-comments only at production-composition.ts:4500/4502; createThetaExtension 0 src; default reached via extensions/index.ts re-export; tests 22/19/30/5 ≥ the map's counts); no overlooked keep-whole reason — data/type LOC 166/1512 ≈ 11 % (< 80 %), zero `switch` statements so BootstrapCapability is a label union not a dispatch table, no @generated/DO NOT EDIT marker, exemptions.json has 4 rows (2 D8 / 2 D9) with no factory.ts key, git shows no deleted factory-* module (no reverted split), docs/spec_topics never names factory.ts; not a duplicate (PTQ-0306 is resolved under the #createThetaExtension key and sibling d9-02 is the same function-level key, both distinct from this file-level root cause; no open issue carries d9_host src/extension/factory.ts); excerpt defect unchanged — :307-312 doc-comments paraphrased, code lines byte-match; target shape (seam A type-family move vs. keep-whole pending d9-02) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
