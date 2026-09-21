---
id: PTQ-1201
title: LexicalEnvironment.constructor bundles six sequential registry-population phases in one 108-LOC body
lens: D9
status: open
verdict: confirmed
locations:
  - src/runtime/lexical-environment.ts:378-485
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/lexical-environment.ts#LexicalEnvironment.constructor
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# LexicalEnvironment.constructor bundles six sequential registry-population phases in one 108-LOC body

## Observation
`LexicalEnvironment`'s constructor (src/runtime/lexical-environment.ts:378-485) is 108 LOC per the structural map — justify band (FN_BANDS.justify = 100). The module header names this class the runtime lexical environment and scope model (V19b). The constructor runs six sequential phases: residence stamping plus the shared-registry aliasing early return, root registry initialisation, top-level `fn`/`schema` hoisting, enum registration, imported-symbol materialisation (including recursive nested-module environment construction), and the callable-set stamp.

## Evidence
Step inventory (line numbers from the current file; LOC counts are code lines excluding comment blocks):

| phase | lines | LOC | state read / written |
|---|---|---|---|
| residence stamp + `shared` aliasing early return | 378-402 | 15 | reads `inputs.moduleResidence`, `shared`; writes `moduleResidencePath`, and (shared arm) `fns`, `schemas`, `enums`, `imports`, `callables`, `moduleEnvs` |
| root registry initialisation | 406-411 | 6 | writes fresh `fns`, `schemas`, `enums`, `imports`, `moduleEnvs`; declares local `callables` |
| top-level `fn`/`schema` hoist (functions.md FN-1) | 413-422 | 7 | reads `inputs.body.statements`; writes `fns`, `schemas` |
| enum registration (bug 0337 tag minting) | 425-435 | 7 | reads `inputs.enums`; writes `enums` |
| import materialisation (imports.md §Visibility) | 439-481 | 28 | reads `inputs.imports`, `inputs.callables`; writes `imports`, `moduleEnvs` (recursive `new LexicalEnvironment(...)` per imported `fn` with a module scope), `schemas`, `enums` |
| callable-set stamp | 482-484 | 3 | writes `callables` |

Excerpt of the import-materialisation phase's three-arm kind dispatch (src/runtime/lexical-environment.ts:439-441, 467-469):

```ts
      for (const imp of inputs.imports ?? []) {
        this.imports.set(imp.name, imp);
        if (imp.kind === "fn" && imp.moduleScope !== undefined) {
...
        if (imp.kind === "schema") {
          this.schemas.set(imp.name, { kind: "schema", name: imp.name, range: syntheticRange() });
        } else if (imp.kind === "enum") {
```

Seam cost: the phases share only ONE local (`callables`, line 411); all other state is the instance-field registries, and each phase writes a disjoint or near-disjoint subset (hoist: `fns`+`schemas`; enums: `enums`; imports: `imports`+`moduleEnvs`+`schemas`+`enums`).

## Why this is a problem
Justify band carries a presumption of breakdown unless a concrete reason to stay whole is found. Reasons considered and defeated:
- Closed-enumeration dispatch: only the import-materialisation phase's `imp.kind` dispatch (439-481) mirrors the spec-named `ImportedSymbolKind` closed set (`fn`/`schema`/`enum`, imports.md §Visibility, declared at line 102); it accounts for 28 of the 108 LOC — the residence, shared-aliasing, hoist, enum, and callable phases are not part of any enumeration.
- Single algorithm with shared local state: only one local (`callables`) crosses phases; the rest is instance-field registries, and a per-phase helper would carry at most 4 registries (the import phase), under the 6-local bar. No state object would need inventing.
- Data-only module / grammar production family / generated code: not applicable (imperative population code, hand-written, no generator citation).
- Exemptions check: `grep lexical-environment quality/exemptions.json` — no entry.
- Spec-mirror check: FN-1 hoisting and imports.md §Visibility are cited per phase, but no clause pins the six phases as one indivisible ordered critical section; the phases populate independent registries.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: the import-materialisation loop (439-481) -> `materializeImports` in-file helper — ~28 LOC, no exported symbols moved, 0 external importers of the moved code, writes back into 4 host registries. Seam B: the enum-registration loop (425-435) -> `registerEnums` in-file helper — ~7 LOC, no exports moved, 0 external importers, writes 1 host registry. Seam C: none identified yet for the shared-aliasing arm (it is the `spawnIsolatedScope` contract and reads all 6 registries).

## False-positive check
Band: function justify (108 LOC ≥ 100, < 200), per the wave's authoritative structural map — not recounted by hand. Reasons-considered list: all five concrete reason classes evaluated above with the defeating counts. Exemptions check: no `lexical-environment` key in quality/exemptions.json (grep returned nothing). Generated-code check: file header names V19b/V19b-T hand-authored leaves; no generator marker. Spec-mirror check: the only spec-named closed set mirrored is `ImportedSymbolKind` (3 arms, 28 LOC of 108) — insufficient to attribute the length to an enumeration. Duplicate check: no existing intake/PTQ finding names this constructor (searched the wave's filed list and the PTQ roster in the brief).

## Triage
verdict: questionable — accounting verified: size-scan map re-run gives LexicalEnvironment.constructor 378-485 = 108 LOC, band justify (FN_BANDS.justify=100); the six phases exist at the cited lines writing distinct registry subsets (shared-alias arm 6 regs, hoist fns+schemas, enums enums, imports imports+moduleEnvs+schemas+enums, callables stamp) with only local `callables` (411/482/484) crossing phases; the `imp.kind` dispatch is the 3-arm `ImportedSymbolKind` (line 102, imports.md §Visibility) covering ~28 LOC so no closed-enumeration reason covers the body; no `lexical-environment` key in quality/exemptions.json, no generator marker, git log shows no reverted prior split, no spec clause pins the phases as one ordered critical section; sibling intake files (d2-12 header narration, d9-09 evaluator placement) are different root causes — target shape (in-file `materializeImports`/`registerEnums` helpers vs stay whole) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: size-scan map reproduces constructor 378-485 = 108 LOC, FN_BANDS.justify=100 → justify (file 839 LOC is zone, host is the function); no `lexical-environment` key in quality/exemptions.json; the six phases are real at the cited lines writing distinct registry subsets (shared-alias arm 391-402 aliases all six and returns; hoist 413-422 fns+schemas; enums 425-435 enums; imports 439-481 imports+moduleEnvs+schemas+enums incl. recursive `new LexicalEnvironment`; stamp 482-484), with only local `callables` (411/482/484) crossing phases — under the ≥ 6 shared-locals bar; registries are `private readonly` but populated via `.set` on maps minted at 406-410 so a private helper has no TS barrier; `ImportedSymbolKind` (line 102, 3 arms, imports.md:30 §Visibility) covers only ~28 LOC; functions.md:20 FN-1 pins resolution semantics not an indivisible ordered section; git log shows no reverted split; d9-09 (evaluator misplacement), PTQ-1111 (D2 header), and the D8 shard-10 child-scope dead-collections filing are distinct root causes — seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently against the current tree: size-scan map gives LexicalEnvironment.constructor 380-487 = 108 LOC, band justify (FN_BANDS.justify=100; file 842 LOC is zone) — a +2 line drift from the filing's 378-485 introduced by commit 1332eb76, content otherwise matching (excerpt at 441-443/469-471 byte-exact); no `lexical-environment` key in quality/exemptions.json; the six inventory rows are real and write distinct registry subsets (shared-alias arm aliases all six and returns; hoist fns+schemas; enums enums; imports imports+moduleEnvs+schemas+enums with the recursive `new LexicalEnvironment(…, null)`; stamp callables), rows 3-6 sit under one `parent === null` guard and share only the local `callables` (413/484/486) — far under the ≥ 6 shared-locals bar; `ImportedSymbolKind` (line 104, 3 arms, imports.md:30 §Visibility) covers only the ~28-LOC import loop so closed-enumeration does not carry the body; functions.md:20 FN-1 pins hoisting and declaring-file resolution semantics, not an indivisible ordered section; git log for the file (V19b → 1332eb76) shows no reverted split; d9-02 and d9-09 are misplacement filings on other files, PTQ-1111 (resolved) is the D2 header claim, and no child-scope dead-collections filing exists in intake/issues — none share this root cause; whether to extract `materializeImports`/`registerEnums` or keep the constructor whole is a design ruling for a human (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
