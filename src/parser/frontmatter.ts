// V6a / V6a-T — the frontmatter field-contract parser seam.
//
// This module owns the loom-file YAML frontmatter parse described by
// frontmatter.md, frontmatter/frontmatter-fields-a.md, and
// frontmatter/frontmatter-fields-b-and-templates.md: the recognised loom 1.0
// field vocabulary, the field-contract defaults, the required `mode:` field
// (`loom/load/missing-mode` when absent), unknown-key tolerance emitted as the
// `loom/load/unknown-frontmatter-field` warning (the forward-compat seam), the
// per-call `timeout:` rejection (`loom/parse/timeout-field-rejected`, the
// NOCEIL-1 seam), and the present-`model:` load-time resolution that fires
// `loom/load/model-unresolved` through the model-reference-matcher injection
// seam this leaf defines.
//
// V6a-T (tests-task) declares the seam shapes — `parseFrontmatter`, the
// `ModelReferenceMatcher` injection interface, and the result/option records —
// and stubs `parseFrontmatter` as an inert seam so the failing tests compile and
// red on their own primary assertions. The paired V6a implementation leaf fills
// it in.

import { type Diagnostic } from "../diagnostics/diagnostic";

/** A loom 1.0 invocation mode (`frontmatter-fields-a.md` field contract). */
export type LoomMode = "prompt" | "subagent";

/**
 * The outcome of resolving a present `model:` reference against the available
 * model set, per the [binder-model parse rule]:
 *   - `resolved`  — exactly one available model matches.
 *   - `no-match`  — the reference (including a non-string scalar or a malformed
 *                   / `provider/modelId` reference) matches no available model.
 *   - `ambiguous` — a bare `modelId` matching models under more than one
 *                   provider (resolves to no model — not pick-first).
 */
export type ModelMatchOutcome = "resolved" | "no-match" | "ambiguous";

/**
 * The **model-reference-matcher injection seam** V6a defines: the interface the
 * parser's `model:` resolution hook calls. The concrete matcher (constructed and
 * injected by V9b's production wiring point) binds V11a's shared exact-match
 * resolution contract — loom's own exact-match resolver over
 * `ctx.modelRegistry.getAvailable()` matching a bare `modelId` against each
 * model's `Model<Api>.id` and a `provider/modelId` reference against
 * `Model<Api>.provider` (the short provider-id form, not the api-shaped
 * `Model<Api>.api`) plus `Model<Api>.id` — so this `model:` resolution and
 * V11a's binder-model resolution cannot decide "reference matches no available
 * model" differently. Declared in-leaf so V6a carries no forward `Deps.` edge
 * onto the downstream binder-model machinery.
 */
export interface ModelReferenceMatcher {
  /** Resolve a present, raw `model:` value against the available model set. */
  resolve(reference: unknown): ModelMatchOutcome;
}

/** The recognised, defaulted frontmatter a successfully-loaded loom exposes. */
export interface ParsedFrontmatter {
  /** The required `mode:` field. */
  readonly mode: LoomMode;
  /** The present `model:` reference, when one was declared and resolved. */
  readonly model?: string;
}

/** The outcome of a frontmatter parse: registration decision + diagnostics. */
export interface FrontmatterParseResult {
  /**
   * Whether the loom is registered. `false` for a load-time error (missing
   * `mode:`, unresolvable `model:`); `true` when the loom loads (including the
   * tolerated unknown-key warning case).
   */
  readonly registered: boolean;
  /** The defaulted frontmatter, present iff `registered` is `true`. */
  readonly frontmatter?: ParsedFrontmatter;
  /** Every diagnostic raised during the parse, in source order. */
  readonly diagnostics: readonly Diagnostic[];
}

/** Inputs to a frontmatter parse. */
export interface ParseFrontmatterOptions {
  /** The source file path, for located diagnostics. */
  readonly file: string;
  /** The injected model-reference matcher the `model:` hook consults. */
  readonly modelMatcher: ModelReferenceMatcher;
}

/**
 * Parse a loom file's YAML frontmatter against the loom 1.0 field contract.
 *
 * V6a-T stub: an inert seam returning no diagnostics and a non-registered
 * result so every behavioural assertion reds for the intended reason
 * (implementation absent), never on a thrown harness error. V6a fills this in.
 */
export function parseFrontmatter(
  source: string,
  options: ParseFrontmatterOptions,
): FrontmatterParseResult {
  void source;
  void options;
  return { registered: false, diagnostics: [] };
}
