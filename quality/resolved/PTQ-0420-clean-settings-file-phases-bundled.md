---
id: PTQ-0420
title: cleanSettingsFile bundles root-shape, thetaPaths, theta-scalar, and exec-template validation phases in one 117-LOC function
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/discovery/settings.ts:270-386
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/discovery/settings.ts#cleanSettingsFile
d9_band: justify
wave: qw20260917095931
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-17
---

# cleanSettingsFile bundles root-shape, thetaPaths, theta-scalar, and exec-template validation phases in one 117-LOC function

## Observation
`cleanSettingsFile` (src/discovery/settings.ts:270-386, 117 LOC per the structural map, justify band) is the per-file settings validator in the V10c settings module ("Settings-source reads, validation, and merge", header lines 1-20). It validates the top-level shape, the `thetaPaths` array, the `theta.*` scalar keys, and the RFC 0012 §4 exec template in sequential inline phases. It is module-private (map: exported `no`, importers 0/0); its only caller is `loadOneFile` in the same file.

## Evidence
Step inventory (raw line counts from the current file):

| phase | lines | LOC | locals read | locals written |
|---|---|---|---|---|
| setup (signature, `diagnostics`/`cleaned` init) | 270-281 | 12 | root, path, scope | diagnostics, cleaned |
| root-shape guard (non-object root, early return) | 283-291 | 9 | root, path | diagnostics |
| `thetaPaths` array cleaning (per-entry string filter) | 295-322 | 28 | root, path | cleaned["thetaPaths"], diagnostics |
| `theta` scalar-key cleaning (`THETAS_SCALAR_KEYS` loop) | 324-347 | 24 | root, path | cleanedThetas, diagnostics |
| exec-template validation (project/global scope dispatch) | 349-373 | 25 | value, scope, path | cleanedThetas, diagnostics |
| `theta` commit + non-object else | 374-384 | 11 | value, path | cleaned["theta"], diagnostics |
| return | 385-386 | 2 | — | — |

The exec-template phase is scope-gated and calls the runtime template parser (settings.ts:349-360):

```ts
      if (Object.prototype.hasOwnProperty.call(value, THETAS_EXEC_TEMPLATE_KEY)) {
        const raw = value[THETAS_EXEC_TEMPLATE_KEY];
        if (scope === "project") {
          diagnostics.push({
            severity: "error",
            code: SETTINGS_INVALID_ENTRY,
            file: path,
            message: `settings 'theta.${THETAS_EXEC_TEMPLATE_KEY}' is honoured from the global settings file only; ignored in project settings`,
          });
        } else {
          const parsed = parseExecPlacementTemplate(raw);
```

Seam cost: the phases share only 4 locals (`diagnostics`, `cleaned`, `path`, `scope`); each phase reads the key's own `value` and writes `diagnostics` plus one `cleaned` slot, so any extracted helper needs at most 4 parameters.

## Why this is a problem
Justify-band presumption of breakdown (117 LOC, threshold 100). Reasons considered and defeated:
- Closed-enumeration dispatch: the if-chain does mirror the settings validation surface (header lines 17-19 cite discovery/package-and-settings.md, DISC-7, and the `thetaPaths` entry schema), but the arms are not each short — the `theta` arm spans 324-384 (61 raw lines, itself over the 60-line function-zone threshold) and nests two sub-validations with different spec anchors (DISC-7 scalar keys at 328-347 vs RFC 0012 §4 exec template at 349-373 with its own per-scope dispatch).
- Single algorithm with shared local state: only 4 shared locals (`diagnostics`, `cleaned`, `path`, `scope`) — below the 6-local bar; no state object would need inventing.
- Data-only module or type family: not applicable — the body is imperative validation, no literal tables.
- One grammar production family: not a parser production.
- Generated code: hand-written; no generator marker.
- Exemptions check: the structural map carries no EXEMPT annotation for `src/discovery/settings.ts#cleanSettingsFile` and quality/exemptions.json is not cited by the map for this host.

## Suggested direction (non-binding, optional)
All hypotheses, unproven — the human ratifies one. Seam A: theta-object cleaning (324-384) -> `cleanThetaObject(value, path, scope)` (hypothesis) — ~61 LOC, no exported symbols moved (host is module-private), 0 external importers (0/0), cross-references back into the host: `isScalarKeyValid`, `renderObserved`, the SETTINGS_* code constants. Seam B: exec-template validation (349-373) -> `cleanExecTemplateKey(raw, scope, path)` (hypothesis) — ~25 LOC, no exports moved, 0 external importers, back-refs: `renderObserved` plus the module's imported `parseExecPlacementTemplate`. Seam C: thetaPaths cleaning (295-322) -> `cleanThetaPathsKey(value, path)` (hypothesis) — ~28 LOC, no exports moved, 0 external importers, back-refs: `jsonKind`, `renderObserved`.

## False-positive check
Band: justify (117 LOC per the authoritative map; never recounted by hand). Reasons-considered list: all five concrete reason classes checked and defeated above (closed-enumeration fails on the 61-line `theta` arm; shared-state fails at 4 locals; data-only, grammar, generated inapplicable). Exemptions check: no EXEMPT annotation on this host in the map (the shard's only ruling covers src/discovery/package-discovery.ts). Generated-code check: no codegen header or generator citation in settings.ts:1-31. Spec-mirror check: the arms track the package-and-settings.md validation surface, but the mirror argument fails the arms-each-short requirement (longest arm 61 raw lines, nesting two differently-anchored sub-validations). Duplicate check: no pending intake or PTQ issue files against `cleanSettingsFile` (PTQ-0154 is a dead settings export; qw...-d2-02 is a stale header count; qw...-d4-01-disc5 is the override-order parallel in resolveSettingsSource/resolvePiThetas — different hosts).

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives src/discovery/settings.ts#cleanSettingsFile 270-386, 117 LOC, band justify (file band exempt but the cited host is the function); excerpt matches at 349-360; inventory rows are real distinct concerns (thetaPaths via jsonKind at 295-320 — 2-line drift from the cited 322 —, DISC-7 scalar loop via isScalarKeyValid at 328-343, RFC 0012 §4 exec template via parseExecPlacementTemplate at 349-373; theta arm 324-384 = 61 lines as claimed); shared locals diagnostics/cleaned/path/scope(+root) < 6; no exemptions.json row (exemptions --lens D9 lists nothing for settings), no generator marker, no prior split in git history (-S cleanThetaObject/cleanThetaPaths empty); sole caller loadOneFile:425; target shape (seam A/B/C) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run → settings.ts#cleanSettingsFile 270-386, 117 LOC, band justify (function key; file band exempt is irrelevant to a #function host); excerpt verbatim at 349-360; inventory phases real and distinct (root guard 283-291, thetaPaths/jsonKind 295-320 [2-line drift from cited 322], DISC-7 scalar loop 328-343, RFC 0012 §4 exec template with its own project/global dispatch 349-373; theta arm 324-384 = 61 lines); shared locals root/path/scope/diagnostics/cleaned = 5 (candidate said 4) < 6; no exemptions.json row, no generator marker, git -S for cleanThetaObject/cleanThetaPaths/cleanExecTemplateKey empty (no reverted split); sole caller loadOneFile:425; no PTQ on this host (d2-02 is a header-count filing). Note for the ruling: D9 waves 2026-09-13 and 2026-09-16 kept this host whole as closed-enumeration over the 9 spec keys (REVIEW_LOG lines 20/70) — reviewer dispositions, not human rulings; the candidate's counter (2 top-level arms, theta arm 61 lines nesting two spec anchors) is defensible, so the closed-enumeration question and the seam shape both need the human (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-17): Seams A+B+C, leaf-first order B (cleanExecTemplateKey, :349-373) then A (cleanThetaObject, :324-384, which calls B) then C (cleanThetaPathsKey, :295-322) - B must land inside A's extraction or A alone re-creates a 61-LOC helper over the zone threshold. All module-private, zero exports move.
