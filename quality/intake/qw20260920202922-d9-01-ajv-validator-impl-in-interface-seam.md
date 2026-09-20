---
id: pending
title: The V8c production `AjvSchemaValidator` implementation (415 of 452 LOC) lives inside the H3a `SchemaValidator` interface module, unlike every other seam adapter in src/seams/
lens: D9
status: intake
verdict: pending
locations:
  - src/seams/schema-validator.ts:39-452
sites: 15
fix_scope: cross-module
d9_class: misplacement
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# The V8c production `AjvSchemaValidator` implementation (415 of 452 LOC) lives inside the H3a `SchemaValidator` interface module, unlike every other seam adapter in src/seams/

## Observation
`src/seams/schema-validator.ts` (452 LOC) opens as an H3a interface module — its header states "Declares the seam interface's full member signatures … The behavioural contract … is added by the V8* leaves implementing against this shape" — and lines 1-37 hold exactly that: four exported type declarations with zero imports. A divider at lines 39-41 then introduces "V8c / V8c-T — the production `SchemaValidator` implementation (PIC-11)", and lines 43-452 hold the entire production adapter: the Ajv imports, the bug-0212 `__proto__` translation machinery (four constants, six functions), and the `AjvSchemaValidator` class with its deps/cache types. Every other seam in `src/seams/` keeps its H3a interface file and its V8* production adapter in separate modules.

## Evidence
src/seams/schema-validator.ts:1-5 (interface identity):
```
// H3a — `SchemaValidator` seam (PIC-11). Declares the seam interface's full
// member signatures, sourced from host-interfaces-services.md#schemavalidator-interface.
// The behavioural contract (single-pass error reporting, no conversion / no
// default-fill, `$ref` resolution scope, cache-collision handling) is added by
// the V8* leaves implementing against this shape.
```

src/seams/schema-validator.ts:39-46 (the co-located production section begins; all four of the file's imports sit below this divider and serve only the production section):
```
// --------------------------------------------------------------------------
// V8c / V8c-T — the production `SchemaValidator` implementation (PIC-11).
// --------------------------------------------------------------------------

import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { defineRecordField } from "../runtime/value";
```

Misplaced declarations (15, all below the divider, per the structural map): `AJV_FILTERED_SCHEMA_PROPERTY` (63), `SCHEMA_MAP_KEYWORDS` (71-76), `SCHEMA_VALUED_KEYWORDS` (85-94), `SCHEMA_LIST_KEYWORDS` (97), `hasOwn` (99-101), `isSchemaNode` (104-106), `declaresFilteredProperty` (121-162), `translateSchemaMap` (170-182), `relocateFilteredProperty` (202-210), `translateFilteredProperties` (237-297), `SchemaSlug` (306-309), `SchemaSlugFn` (318), `AjvSchemaValidatorDeps` (321-326), `CacheEntry` (329-332), `AjvSchemaValidator` (348-452).

Affinity both ways: the production section touches 4 members of the interface section (`SchemaValidator`, `CompiledValidator`, `ValidationError`, `LoweredSchema`) — exactly the names a separate adapter module would import — while touching 15 declarations of its own; the interface section (lines 1-37) touches 0 members of the production section and has zero imports.

Sibling pattern, per instance — every other seam pairs a zero-implementation H3a interface file with a separate V8* production adapter module:
- `checkpoint.ts` ("H3a — `Checkpoint` seam (PIC-10)") / `production-checkpoint.ts` ("V8a — `ProductionCheckpoint` production wiring")
- `clock.ts` ("H3a — `Clock` seam (PIC-12)") / `wall-clock.ts` ("V8d — `WallClock` production adapter")
- `file-system.ts` (H3a, imports: none per map) / `pi-file-system.ts` ("V8b — `PiFileSystem` production adapter")
- `file-watcher.ts` (H3a, imports: none per map) / `pi-file-watcher.ts` ("V8e — `PiFileWatcher` production adapter")
- `id-source.ts` ("H3a — `IdSource` seam (PIC-20)") / `crypto-id-source.ts` ("V8d — `CryptoIdSource` production adapter")
- `token-estimator.ts` ("H3a — `TokenEstimator` seam (PIC-16)") / `pi-token-estimator.ts` ("V8e — `PiTokenEstimator` production adapter")

Importer counts (structural map, quoted): `AjvSchemaValidator` 1 src / 31 tests (sole src importer: `extension/production-composition.ts:138`); `SchemaSlug` 1/23; `SchemaSlugFn` 0/3; `AjvSchemaValidatorDeps` 0/0. Interface names: `LoweredSchema` 11/56, `SchemaValidator` 6/4, `CompiledValidator` 4/7, `ValidationError` 3/2. The barrel `src/seams/index.ts:8-12` re-exports only the four interface types, none of the production section's names.

## Why this is a problem
The directory's own convention — stated in each H3a header and followed by all six other seams — is that interface modules declare signatures only and V8* adapters live in dedicated modules. The one exception forces the 11 src modules that import only type names (`LoweredSchema` etc.) to name a module that also carries `ajv`/`ajv-formats` imports and ~415 LOC of translation and caching machinery, and it makes `schema-validator.ts` answer to two identities (H3a and V8c/V8c-T) that the file itself labels separately with a section divider. The counted affinity (production section: 4 interface members touched vs 15 own declarations; interface section: 0 production members touched) shows the two halves are joined only along the same seam every sibling pair crosses via an ordinary import.

## Suggested direction (non-binding, optional)
Hypothesis: move lines 39-452 (the 15 production declarations) to a sibling adapter module, e.g. `src/seams/ajv-schema-validator.ts` — ~415 LOC, exported symbols moved: `AjvSchemaValidator` (1 src / 31 test importers), `SchemaSlug` (1/23), `SchemaSlugFn` (0/3), `AjvSchemaValidatorDeps` (0/0); cross-references back into the host: type-only imports of `SchemaValidator`, `CompiledValidator`, `ValidationError`, `LoweredSchema` — the same shape as `pi-file-system.ts` importing from `./file-system`. Unproven; the human ratifies.

## False-positive check
Affinity counts both ways: production section touches 4 interface members (`SchemaValidator`, `CompiledValidator`, `ValidationError`, `LoweredSchema`), 15 own declarations; interface section touches 0 production members (verified by reading lines 1-37 — no reference below line 37 appears there, and the section has zero imports). Sibling-pattern citation: all six other seam pairs listed above with their header lines read (`head -3` on each adapter and interface file). Barrel check: `src/seams/index.ts` re-exports only the four interface type names from `./schema-validator` — the barrel already treats the interface surface as the module's public identity. Deliberate-bundling check: the file header (lines 1-5) claims interface-only identity ("added by the V8* leaves"), and the in-file divider (39-41) labels the rest as a distinct V8c unit — no comment claims the co-location is intentional. Exemptions check: no entry for `schema-validator` in quality/exemptions.json. Pending-findings check: qw20260920183643-d4-01-schema-filtered-property-walks-parallel is a D4 duplication claim about the two walk functions, not placement; no D9 filing covers this module.

## Triage
verdict: questionable — accounting verified: lines 1-37 are four import-free type decls referencing nothing below; lines 39-452 hold the 15 listed production decls (ajv/ajv-formats imports, bug-0212 translation walk, AjvSchemaValidator) touching exactly 4 interface names; all 6 other seams pair an H3a interface file with a separate V8* adapter module; barrel re-exports only the 4 interface types; sole src importer of AjvSchemaValidator is production-composition.ts:138; no exemptions.json entry; only other filing on this module is a D4 walk-duplication claim (different root cause) — target shape (sibling adapter module) needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: 452 LOC; 4 import-free interface decls at 14-35 reference nothing below; first import at 43; the 15 production decls sit at exactly the cited lines (63…348) and touch exactly 4 interface names (SchemaValidator/CompiledValidator/ValidationError/LoweredSchema); all 6 sibling H3a files carry no class/function/const (only a type import in token-estimator.ts) and each pairs with a separate V8* adapter; index.ts re-exports only the 4 interface types; sole src importer of AjvSchemaValidator is production-composition.ts:132 (candidate's :138 is small drift); no exemptions.json entry; only other filing on this module (d4-01) is a different root cause, PTQ-0009 (resolved) was narration not placement — misplacement is real but the move is a design decision for a human ruling (triage: claude-fable-5-1)
