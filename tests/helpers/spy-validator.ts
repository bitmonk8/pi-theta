// A spy `CompiledValidator` for the `defaulting-*` test pair (PTQ-0264).
//
// WHY THIS FILE EXISTS. tests/defaulting-revalidation.test.ts and
// tests/defaulting-post-merge-classification.test.ts both drive
// `fillDefaultsAndRevalidate` (src/binder/defaulting.ts) and each
// independently declared the same `spyValidator` closure — a fake
// `CompiledValidator` that records every value handed to `validate()` and
// returns a fixed verdict. This module centralises that one shared
// declaration; each file's own assertions over `calls`/`validator` stay
// local.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import type { PostMergeValidation } from "../../src/binder/defaulting";
import type { CompiledValidator } from "../../src/seams/schema-validator";

/**
 * A spy `CompiledValidator`: records every value handed to `validate()` and
 * returns a fixed verdict. Lets a test witness that a post-default-merge
 * validation ran against the expected (merged, not raw) args and that the
 * fixed verdict is surfaced — an empty `calls` array is itself an observable
 * (e.g. proof AJV never ran because a depth-walk short-circuited ahead of it).
 */
export function spyValidator(result: PostMergeValidation): {
  readonly validator: CompiledValidator;
  readonly calls: unknown[];
} {
  const calls: unknown[] = [];
  const validator: CompiledValidator = {
    validate(value: unknown) {
      calls.push(value);
      return result;
    },
  };
  return { validator, calls };
}
