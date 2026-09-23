---
id: pending
title: enumsOf, materializeSymbol and referencedNamedTypes remain in import-static-checks.ts with zero in-file callers, forcing import-resolution-kit.ts and import-specifier-facts.ts to import back into the module that imports them
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/import-static-checks.ts:157-170
  - src/extension/import-static-checks.ts:288-333
  - src/extension/import-static-checks.ts:210-212
sites: 3
fix_scope: cross-module
d9_class: misplacement
wave: qw20260923010657
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# enumsOf, materializeSymbol and referencedNamedTypes remain in import-static-checks.ts with zero in-file callers, forcing import-resolution-kit.ts and import-specifier-facts.ts to import back into the module that imports them

## Observation

import-static-checks.ts's header (lines 1-4) states its role: "Load-time (compose-pass) orchestration for the `.thetalib` import subsystem, with re-export closure resolution in import-reexport-closure.ts, the probe/parse/graph/materialisation resolution kit in import-resolution-kit.ts, and direct-import per-specifier fact collection in import-specifier-facts.ts". The recent ratified extractions (PTQ-1208 fix, PTQ-1284 Seams B/C) moved the materialisation closures and the per-specifier fact loop out, but three exported helpers those extractions consume stayed behind. The result is a mutual import: import-static-checks.ts imports from ./import-resolution-kit (lines 118, 125) and re-exports it, while import-resolution-kit.ts line 25 imports `enumsOf`, `extractThetaLibForms`, `materializeSymbol` back from ./import-static-checks.

## Evidence

Affinity, counted both ways (call sites verified by grep this session):

- `enumsOf` (import-static-checks.ts:157-170, exported, map importers 1/0): touches 2 sites of import-resolution-kit.ts (`buildModuleScope` at kit:164 and kit:192), 0 of its own module (grep for `enumsOf` in import-static-checks.ts hits only the declaration at 157).
- `materializeSymbol` (import-static-checks.ts:288-333, exported, map importers 1/0): touches 1 site of import-resolution-kit.ts (`materializeChain` at kit:225), 0 of its own module (in-file hits at 263/266 are its own doc comment; its support constant `MATERIALIZE_SYMBOL_DECLARATION_KINDS` at 269-273 exists only for it).
- `referencedNamedTypes` (import-static-checks.ts:210-212, exported, map importers 1/0): touches 1 site of import-specifier-facts.ts (`collectImportedTypeDecls` at facts:235), 0 of its own module (sole in-file hit is the declaration at 210).

The back-import at the foreign consumers:

```ts
// src/extension/import-resolution-kit.ts:25
import { enumsOf, extractThetaLibForms, materializeSymbol } from "./import-static-checks";
```

```ts
// src/extension/import-specifier-facts.ts:41-46
import {
  extractThetaLibForms,
  isRegistrationError,
  referencedNamedTypes,
  ...
} from "./import-static-checks";
```

Sibling pattern: every other member of the materialisation family already lives in import-resolution-kit.ts — its header (kit:1-5) names "the ... module-scope / re-export materialisation closures", and `materializeChain`, `buildModuleScope`, `CachingThetaLibProbe`, `ParsedThetaLib`, `unreadableThetaLibDiagnostic` all reside there (map: kit declarations 35-407). `materializeSymbol` is `materializeChain`'s direct-match arm ("mirrors `materializeSymbol`'s own direct-match arm", import-specifier-facts.ts:397 comment) and `enumsOf` is the enum-registration half of the same module-scope build; both are the family's stranded members. `referencedNamedTypes`'s only consumer family (the bug-0465 type-decl closure) lives wholly in import-specifier-facts.ts.

Not cited as misplaced: `extractThetaLibForms` (222-260) and `isRegistrationError` (336-342) have mixed affinity — each retains a live in-file call site (467 and 450 respectively, inside `checkTransitiveLibDeclarations`) alongside foreign consumers.

## Why this is a problem

Counted affinity: 3 exported declarations each touch 1-2 members of a foreign host and 0 of their own (names and sites above). Leaving them behind after the ratified extractions produced a two-module import cycle (import-static-checks ⇄ import-resolution-kit) whose only cause is these declarations: the kit needs `enumsOf`/`materializeSymbol` for the very closures that were moved out of the host that still imports the kit. The host's own header assigns the "materialisation resolution kit" role to import-resolution-kit.ts, so these members contradict the module's stated placement contract.

## Suggested direction (non-binding, optional)

Hypothesis, unproven: move `enumsOf`, `materializeSymbol` (with `MATERIALIZE_SYMBOL_DECLARATION_KINDS`) into import-resolution-kit.ts and `referencedNamedTypes` into import-specifier-facts.ts (or re-export from the old host for the map's 1/0 external importers), dissolving the kit→static-checks back-import. The human ratifies the homes.

## False-positive check

Affinity counts both ways recorded per declaration with call-site line numbers (grep of `enumsOf|materializeSymbol|referencedNamedTypes` across src/ this session: no other consumers anywhere in src/, extensions/, tools/). Sibling-pattern citation: import-resolution-kit.ts header lines 1-5 and its declaration roster (map) hold the rest of the materialisation family. Barrel check: import-static-checks.ts is an 832-LOC implementation module, not a re-export facade (its `export … from "./import-resolution-kit"` is the facade direction and is not the cited problem). D2-deadness check: all three declarations have live callers (kit:164/192/225, facts:235) — misplaced, not dead. Prior-filing check: grep of quality/{issues,intake,resolved} for the three names hits only resolved breakdown findings (PTQ-1147/1208/1284, PTQ-0076/0081/0365 — none a placement filing on these declarations); no open misplacement finding names them.

## Triage
verdict: questionable — accounting verified: all three excerpts are byte-exact at import-static-checks.ts:157-170 / 210-212 / 288-333 (with MATERIALIZE_SYMBOL_DECLARATION_KINDS at 269-273), and a fresh `grep -rn` across src/, extensions/, tools/, tests/ reproduces the affinity both ways — `enumsOf` has exactly 2 callers, both in import-resolution-kit.ts (:164, :192), `materializeSymbol` exactly 1 (kit:225), `referencedNamedTypes` exactly 1 (import-specifier-facts.ts:235), and none of the three is referenced anywhere in its own module outside its declaration/doc comment (test hits are comments only); the back-imports exist verbatim (kit:25, facts:41-46) while the host imports and re-exports the kit (:118-131), so the import-static-checks ⇄ import-resolution-kit cycle is real; size-scan map on a one-line manifest confirms 832 LOC / band zone with importers 1/0 for each of the three; the contrast rows hold (`extractThetaLibForms` :467 and `isRegistrationError` :450 keep live in-file callers in checkTransitiveLibDeclarations); the sibling pattern is real (kit header :1-5 claims the module-scope / re-export materialisation closures; materializeChain/buildModuleScope live there); not dead (live callers), not a barrel (832-LOC implementation module); not a duplicate — PTQ-1147/1208/1284 are resolved breakdown filings whose Seam B direction merely noted these three as "cross-references back into the host", and no open filing keys their placement; D9 misplacement never confirms — the home (kit vs facts vs re-export from the old host) is the human's ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: excerpts match at import-static-checks.ts:157-170 / 210-212 / 288-333 (MATERIALIZE_SYMBOL_DECLARATION_KINDS 269-273); fresh grep across src/, extensions/, tools/, tests/ gives enumsOf callers = kit:164,192 only, materializeSymbol = kit:225 only, referencedNamedTypes = facts:235 only, zero in-file references beyond declaration/doc comment (all tests/ hits are comments); back-imports verbatim at kit:25 and facts:41-46 while the host imports/re-exports the kit (:115-131), so the ⇄ cycle is real; size-scan map: 832 LOC band zone, importers 1/0 for each of the three; contrast rows hold (extractThetaLibForms :467, isRegistrationError :450 live in checkTransitiveLibDeclarations); not dead, not a barrel; not a duplicate — only open filing touching the host is PTQ-1299 (D4 clone), and PTQ-1147/1208/1284 are resolved breakdowns; D9 misplacement never confirms — the home is a human ruling (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
