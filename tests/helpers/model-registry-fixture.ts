// A shared `AvailableModel`/`ModelRegistrySurface` fixture pair for tests
// driving `createModelReferenceMatcher` / `resolveBinderModel` /
// `matchAvailableModel` (PTQ-0272).
//
// WHY THIS FILE EXISTS. tests/binder-model-resolution.test.ts,
// tests/b0418-binder-model-reference-first-slash-ordering.test.ts,
// tests/registration-reload-wiring.test.ts, and
// tests/execution-status-entry-migration-witnesses.test.ts each independently
// declared the same `model(id, provider, api)` fixture builder and
// `registryOf(models)` `ModelRegistrySurface` wrapper. This module centralises
// that shared pair; each file's own fixtures (the specific ids/providers/apis
// it drives with) stay local.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import type { AvailableModel, ModelRegistrySurface } from "../../src/extension/reload-wiring";

/** One `AvailableModel` fixture row. */
export function model(id: string, provider: string, api: string): AvailableModel {
  return { id, provider, api };
}

/** A `ModelRegistrySurface` over a fixed `AvailableModel` array. */
export function registryOf(models: readonly AvailableModel[]): ModelRegistrySurface {
  return { getAvailable: () => models };
}
