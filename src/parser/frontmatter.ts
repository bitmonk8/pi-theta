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

import {
  type Diagnostic,
  type SourceRange,
} from "../diagnostics/diagnostic";
import { LineCounter, parseDocument, isMap, isScalar, type Node } from "yaml";

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
 * The recognised loom 1.0 frontmatter field vocabulary (`frontmatter-fields-a.md`
 * §Field contract). A top-level key outside this set is tolerated and surfaces
 * as the `loom/load/unknown-frontmatter-field` forward-compat warning. `timeout`
 * is deliberately absent: it has a dedicated rejection code (the NOCEIL-1 seam),
 * not the generic unknown-key warning.
 */
const LOOM_1_0_FIELDS: ReadonlySet<string> = new Set([
  "description",
  "argument-hint",
  "mode",
  "model",
  "bind_model",
  "bind_context",
  "bind_echo",
  "tools",
  "system",
  "respond_repair",
  "tool_loop",
  "params",
]);

/** The opening / closing frontmatter fence line. */
const FENCE = "---";

/** The extracted frontmatter YAML block and its file-line offset. */
interface FrontmatterBlock {
  /** The YAML text between the fences (fences excluded). */
  readonly yaml: string;
  /**
   * The number to add to a 1-based line within `yaml` to reach the file line:
   * the opening fence occupies file line 1, so YAML line 1 is file line 2.
   */
  readonly lineOffset: number;
}

/**
 * Extract the leading `---`-fenced frontmatter block. Returns `undefined` when
 * the source has no opening fence or the opening fence is never closed — both
 * cases mean "no recognised frontmatter mapping", which downstream resolves to
 * the missing-`mode:` load error.
 */
function extractFrontmatterBlock(source: string): FrontmatterBlock | undefined {
  const lines = source.split("\n");
  if ((lines[0] ?? "").trim() !== FENCE) {
    return undefined;
  }
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").trim() === FENCE) {
      return { yaml: lines.slice(1, i).join("\n"), lineOffset: 1 };
    }
  }
  return undefined;
}

/**
 * Map a YAML node's byte range onto a located `SourceRange` in file
 * coordinates. Returns `undefined` when the node carries no range.
 */
function rangeOf(
  node: Node | null | undefined,
  lineCounter: LineCounter,
  lineOffset: number,
): SourceRange | undefined {
  if (node === null || node === undefined || !node.range) {
    return undefined;
  }
  const [startOffset, endOffset] = node.range;
  const start = lineCounter.linePos(startOffset);
  const end = lineCounter.linePos(endOffset);
  return {
    start: { line: start.line + lineOffset, column: start.col },
    end: { line: end.line + lineOffset, column: end.col },
  };
}

/**
 * Render a YAML scalar as the unquoted source text the `<value>` placeholder
 * substitutes (`placeholder-rendering-b.md` category 5): a YAML scalar with no
 * enclosing source quoting renders unquoted regardless of identifier shape.
 */
function renderScalarValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return "null";
  }
  return String(value);
}

/**
 * Parse a loom file's YAML frontmatter against the loom 1.0 field contract
 * (`frontmatter.md`, `frontmatter/frontmatter-fields-a.md`):
 *
 *   - the required `mode:` field — `loom/load/missing-mode` (E) when absent, and
 *     the loom is not registered;
 *   - unknown top-level keys — `loom/load/unknown-frontmatter-field` (W), one per
 *     key, tolerated (the loom still registers);
 *   - the per-call `timeout:` field — `loom/parse/timeout-field-rejected` (E),
 *     the NOCEIL-1 seam;
 *   - a present `model:` value resolved at load time through the injected
 *     model-reference matcher — `loom/load/model-unresolved` (E) on no-match /
 *     ambiguity, and the loom is not registered.
 *
 * The loom registers iff no error-severity diagnostic was raised.
 */
export function parseFrontmatter(
  source: string,
  options: ParseFrontmatterOptions,
): FrontmatterParseResult {
  const { file, modelMatcher } = options;
  const diagnostics: Diagnostic[] = [];

  const block = extractFrontmatterBlock(source);
  const lineCounter = new LineCounter();
  const doc =
    block === undefined
      ? undefined
      : parseDocument(block.yaml, { lineCounter });
  const map = doc !== undefined && isMap(doc.contents) ? doc.contents : undefined;
  const lineOffset = block?.lineOffset ?? 0;

  // The recognised fields the contract pins behaviour for.
  let modeValue: string | undefined;
  let modelPresent = false;
  let modelRaw: unknown;
  let modelRange: SourceRange | undefined;

  if (map !== undefined) {
    for (const item of map.items) {
      if (!isScalar(item.key)) {
        // Non-scalar keys are outside the loom 1.0 contract; skip — there is no
        // field-contract behaviour pinned for them.
        continue;
      }
      const key = String(item.key.value);
      const keyRange = rangeOf(item.key, lineCounter, lineOffset);
      const rawValue = isScalar(item.value) ? item.value.value : item.value;
      const valueRange = rangeOf(
        (item.value ?? item.key) as Node,
        lineCounter,
        lineOffset,
      );

      if (key === "mode") {
        modeValue = isScalar(item.value)
          ? String(item.value.value)
          : undefined;
        continue;
      }
      if (key === "model") {
        modelPresent = true;
        modelRaw = rawValue;
        modelRange = valueRange;
        continue;
      }
      if (key === "timeout") {
        // NOCEIL-1 seam: per-call timeouts are rejected in loom 1.0.
        diagnostics.push({
          severity: "error",
          code: "loom/parse/timeout-field-rejected",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: "'timeout:' field is not supported in loom 1.0",
        });
        continue;
      }
      if (!LOOM_1_0_FIELDS.has(key)) {
        // Forward-compat seam: an unrecognised key warns once and is tolerated.
        diagnostics.push({
          severity: "warning",
          code: "loom/load/unknown-frontmatter-field",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: `unknown frontmatter field '${key}'`,
        });
      }
    }
  }

  // Required `mode:`.
  if (modeValue === undefined) {
    diagnostics.push({
      severity: "error",
      code: "loom/load/missing-mode",
      file,
      message: "frontmatter is missing required field 'mode:'",
    });
  }

  // Present `model:` — resolved through the injected matcher seam.
  let resolvedModel: string | undefined;
  if (modelPresent) {
    const outcome = modelMatcher.resolve(modelRaw);
    if (outcome === "resolved") {
      resolvedModel = renderScalarValue(modelRaw);
    } else {
      diagnostics.push({
        severity: "error",
        code: "loom/load/model-unresolved",
        file,
        ...(modelRange !== undefined ? { range: modelRange } : {}),
        message: `loom 'model:' value '${renderScalarValue(
          modelRaw,
        )}' resolves to no available model, or is ambiguous across providers`,
      });
    }
  }

  const registered = !diagnostics.some((d) => d.severity === "error");
  if (!registered) {
    return { registered: false, diagnostics };
  }

  // `modeValue` is defined here: a missing `mode:` is an error, which would have
  // set `registered` to `false` above.
  const frontmatter: ParsedFrontmatter = {
    mode: modeValue as LoomMode,
    ...(resolvedModel !== undefined ? { model: resolvedModel } : {}),
  };
  return { registered: true, frontmatter, diagnostics };
}
