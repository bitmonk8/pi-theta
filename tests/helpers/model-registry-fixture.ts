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

/** Pinned live Anthropic overflow bytes: numeric runs include the request id. */
export const LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE =
  `400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}`;
