// V6a / V6a-T — the frontmatter field-contract parser seam.
//
// This module orchestrates the theta-file YAML frontmatter parse described by
// frontmatter.md, frontmatter/frontmatter-fields-a.md, and
// frontmatter/frontmatter-fields-b-and-templates.md: the recognised theta 1.0
// field vocabulary, the field-contract defaults, the required `mode:` field
// (`theta/load/missing-mode` when absent), unknown-key tolerance emitted as the
// `theta/load/unknown-frontmatter-field` warning (the forward-compat seam), the
// per-call `timeout:` rejection (`theta/parse/timeout-field-rejected`, the
// NOCEIL-1 seam), and the present-`model:` load-time resolution that fires
// `theta/load/model-unresolved` through the model-reference-matcher injection
// seam this leaf defines.
//
// V6a-T (tests-task) declared the seam shapes — `parseFrontmatter`, the
// `ModelReferenceMatcher` injection interface, and the result/option records
// (now hosted in frontmatter-contract.ts and re-exported here) — and stubbed
// `parseFrontmatter`; V6a (this leaf) implements the whole field contract
// above.

import {
  normaliseLiteralValueLineBreaks, type Diagnostic,
  type SourceRange,
} from "../diagnostics/diagnostic";
import {
  LineCounter,
  parseDocument,
  isMap,
  isScalar,
  isSeq,
  type Node,
  type YAMLMap,
} from "yaml";
import {
  type ParamFieldInput,
  type BodyTypeDeclaration,
} from "./params";
import {
  checkSystemInterpolation,
  type SystemParamType,
  type SystemTemplate,
} from "./system-interpolation";
import { classifyBinderBypass } from "../binder/binder-envelope";
import { toSystemParamType } from "./system-param-types";
import { extractParsedParams } from "./frontmatter-params";
import {
  type FrontmatterBlock,
  extractFrontmatterBlock,
  rangeOf,
  malformedFrontmatterYamlDiagnostic,
  renderScalarValue,
  renderNonScalarModeKind,
  renderNonScalarBindContextKind,
  extractToolsList,
  TOOL_LOOP_SUBKEYS,
  RESPOND_REPAIR_SUBKEYS,
  checkBlockShape,
  unknownSubKeyDiagnostics,
  resolveNonNegIntBlock,
  checkMethodology,
} from "./frontmatter-yaml";
import {
  type ThetaMode,
  type ModelReferenceMatcher,
  type ParsedToolLoop,
  type ParsedRespondRepair,
  type ParsedFrontmatter,
  type FrontmatterParseResult,
  type ParseFrontmatterOptions,
} from "./frontmatter-contract";

export { toSystemParamType } from "./system-param-types";
export * from "./frontmatter-yaml";
export * from "./frontmatter-contract";

/**
 * Frontmatter field names reserved for deferred theta 1.0 features named in
 * Future Considerations (`frontmatter-fields-a.md` §Field contract; Deferred
 * appendix Cluster 2). A reserved key is not part of the theta 1.0 vocabulary but
 * is distinguished from a genuinely-unknown key: it surfaces as the
 * `theta/load/deferred-frontmatter-field` warning rather than the generic
 * `theta/load/unknown-frontmatter-field`, so an author who set a knob from a
 * newer minor gets a reserved-feature signal. Both spellings of the deferred
 * binder-temperature knob are recognised (the authoritative frontmatter page
 * names it `binder_temperature`; Future Considerations spells it
 * `bind_temperature`). Membership is disjoint from the recognised theta 1.0
 * field vocabulary (`frontmatter-fields-a.md` §Field contract), each member
 * of which `parseFrontmatter`'s field loop claims with its own per-key arm.
 */
const DEFERRED_FRONTMATTER_FIELDS: ReadonlySet<string> = new Set([
  "binder_temperature",
  "bind_temperature",
]);

/** Values, presence flags, and source ranges collected from recognised YAML fields. */
interface RecognisedFields {
  readonly modeValue: string | undefined;
  readonly modeRange: SourceRange | undefined;
  readonly modePresent: boolean;
  readonly modeValueKind: string | undefined;
  readonly modelPresent: boolean;
  readonly modelRaw: unknown;
  readonly modelRange: SourceRange | undefined;
  readonly bindContextValue: string | undefined;
  readonly bindContextRange: SourceRange | undefined;
  readonly bindContextPresent: boolean;
  readonly bindContextValueKind: string | undefined;
  readonly descriptionValue: string | undefined;
  readonly bindModelValue: string | undefined;
  readonly bindModelUnresolvable: boolean;
  readonly bindEchoValue: boolean | undefined;
  readonly bindEchoRange: SourceRange | undefined;
  readonly bindEchoPresent: boolean;
  readonly bindEchoScalar: string | undefined;
  readonly bindEchoValueKind: string | undefined;
  readonly bindEchoValueRange: SourceRange | undefined;
  readonly argumentHintPresent: boolean;
  readonly argumentHintRange: SourceRange | undefined;
  readonly argumentHintValue: string | undefined;
  readonly toolLoopNode: Node | null | undefined;
  readonly respondRepairNode: Node | null | undefined;
  readonly paramsNode: Node | null | undefined;
  readonly paramsPresent: boolean;
  readonly paramsRange: SourceRange | undefined;
  readonly systemPresent: boolean;
  readonly systemValue: string | undefined;
  readonly systemRange: SourceRange | undefined;
  readonly toolsValue: readonly string[] | undefined;
  readonly toolsMalformedRange: SourceRange | undefined;
}

/** The writable accumulator shape the field-loop handlers assign into. */
type MutableRecognisedFields = {
  -readonly [K in keyof RecognisedFields]: RecognisedFields[K];
};

/**
 * The `mode:` arm. A present non-scalar `mode:` value is present-but-bad, not
 * absent: record presence so the required-mode arm keys on genuine absence,
 * and the value's bounded kind token so the unknown-mode-value arm can name
 * the shape. `modeValueKind` is set for exactly the non-scalar present case
 * (where `modeValue` stays undefined).
 */
function collectModeField(
  value: Node | null | undefined,
  valueRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.modePresent = true;
  if (isScalar(value)) {
    fields.modeValue = String(value.value);
  } else {
    fields.modeValueKind = renderNonScalarModeKind(value);
  }
  fields.modeRange = valueRange;
}

/** The `model:` arm: record presence, the raw value, and its range. */
function collectModelField(
  rawValue: unknown,
  valueRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.modelPresent = true;
  fields.modelRaw = rawValue;
  fields.modelRange = valueRange;
}

/**
 * The `bind_model:` arm. A present non-scalar `bind_model:` is
 * present-but-unresolvable, not absent: it must NOT fall back to the
 * `theta.binderModel` settings the spec reserves for an ABSENT field
 * (frontmatter-fields-a.md). Record an unresolvable marker (no fabricated
 * string) so binder-model resolution routes it through the existing
 * `theta/load/binder-model-unresolved` machinery exactly as an unresolvable
 * declared string (bug 0297).
 */
function collectBindModelField(
  value: Node | null | undefined,
  fields: MutableRecognisedFields,
): void {
  if (isScalar(value)) {
    fields.bindModelValue = String(value.value);
  } else {
    fields.bindModelUnresolvable = true;
  }
}

/**
 * The `description:` arm. frontmatter-fields-a.md: `description` mirrors Pi's
 * prompt-template spelling and populates the slash-command autocomplete entry
 * (passed to `pi.registerCommand(name, { description, handler })`). Retained
 * here so the composition can thread it onto the `ThetaFixture`.
 *
 * A null scalar (bare key / `null` / `~`) is the spec's own name for
 * "no description" (frontmatter-fields-a.md:37) — excluded here so it
 * maps to absent instead of the fabricated text "null" (bug 0299).
 */
function collectDescriptionField(
  value: Node | null | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.descriptionValue =
    isScalar(value) && value.value !== null ? String(value.value) : undefined;
}

/**
 * The `argument-hint:` arm. frontmatter-fields-a.md: `argument-hint` is
 * binder-grounding-only in theta 1.0 (Pi has no `argumentHint` slot for
 * extension commands) — that grounding is the binder system prompt's
 * `Argument hint:` line (binder-bypass-and-envelope.md §System-prompt
 * structure item 3), so the scalar VALUE is retained alongside the presence +
 * range the advisory `theta/load/argument-hint-not-displayed` reads (fired
 * when no `description:` accompanies it — an empty autocomplete entry).
 */
function collectArgumentHintField(
  value: Node | null | undefined,
  keyRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.argumentHintPresent = true;
  fields.argumentHintRange = keyRange;
  fields.argumentHintValue =
    isScalar(value) && typeof value.value === "string" ? value.value : undefined;
}

/**
 * The `bind_echo:` arm. §"Echo policy": `bind_echo:` (`true` | `false`;
 * default `true`) is a closed-set field. A present value outside the two
 * booleans is present-but-bad, not absent, and draws
 * theta/load/unknown-bind-echo-value (0.332.0) — mirroring the bind_context:
 * recognised-key/unrecognised-value split. No truth-coercion: a string
 * "false" refuses rather than reading as the boolean false. The key range
 * feeds the bypass advisories; the value range ranges the refusal.
 */
function collectBindEchoField(
  value: Node | null | undefined,
  rawValue: unknown,
  keyRange: SourceRange | undefined,
  valueRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.bindEchoPresent = true;
  if (typeof rawValue === "boolean") {
    fields.bindEchoValue = rawValue;
  } else if (isScalar(value)) {
    fields.bindEchoScalar = String(value.value);
  } else {
    fields.bindEchoValueKind = renderNonScalarBindContextKind(value);
  }
  fields.bindEchoRange = keyRange;
  fields.bindEchoValueRange = valueRange;
}

/** The `params:` arm: record the value node, presence, and range. */
function collectParamsField(
  value: Node | null | undefined,
  keyRange: SourceRange | undefined,
  valueRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.paramsNode = value;
  fields.paramsPresent = true;
  fields.paramsRange = valueRange ?? keyRange;
}

/**
 * The `bind_context:` arm. A present non-scalar `bind_context:` value is
 * present-but-bad, not absent: record presence so the unknown-value arm keys
 * on presence, and the value's bounded kind token so it can name the shape
 * (bug 0297, mirroring the `mode:` arm). `bindContextValueKind` is set for
 * exactly the non-scalar present case (where `bindContextValue` stays
 * undefined).
 */
function collectBindContextField(
  value: Node | null | undefined,
  valueRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.bindContextPresent = true;
  if (isScalar(value)) {
    fields.bindContextValue = String(value.value);
  } else {
    fields.bindContextValueKind = renderNonScalarBindContextKind(value);
  }
  fields.bindContextRange = valueRange;
}

/**
 * The `tools:` arm. FRNT-2/FRNT-3 callable set: a scalar (`tools: grep`) or a
 * sequence (`tools:\n  - ./sentiment.theta`) of Pi-tool names /
 * `.theta`-callable paths. Surfaced verbatim; the H8b resolvers classify each
 * entry. A value that is neither spelling (a mapping, an alias, or no value
 * node at all) is refused at this layer, where the YAML node and its range
 * are still in hand (bug 0104) — the same reachability argument that put
 * `params: null` here rather than in the resolver.
 *
 * The scalar arm is checked separately from the sequence arm (rather than
 * testing `extractToolsList`'s return value once) because a zero-entry SCALAR
 * (a quoted or block spelling whose comma split yields no entry, e.g.
 * `tools: ""`) is present-but-bad and must be refused under this same code
 * (bug 0206), while a zero-entry SEQUENCE (`tools: []`) collapses to the
 * identical `undefined` return and MUST stay silent — it is the one spelling
 * the spec declares equivalent to an absent field. Keying on the return value
 * alone cannot tell the two apart; keying on the arm can, because the arm
 * already knows which spelling produced it. The refusal is ranged on the
 * value node, falling back to the key for a pair that carries no value node
 * at all, which is the range convention every other frontmatter-shape
 * refusal here follows.
 */
function collectToolsField(
  value: Node | null | undefined,
  keyRange: SourceRange | undefined,
  valueRange: SourceRange | undefined,
  block: FrontmatterBlock | undefined,
  fields: MutableRecognisedFields,
): void {
  if (isScalar(value)) {
    fields.toolsValue = extractToolsList(value, block?.yaml ?? "");
    if (fields.toolsValue === undefined) {
      fields.toolsMalformedRange = valueRange ?? keyRange;
    }
  } else if (isSeq(value)) {
    fields.toolsValue = extractToolsList(value, block?.yaml ?? "");
  } else {
    fields.toolsMalformedRange = valueRange ?? keyRange;
  }
}

/**
 * The `system:` arm. Captured for the subagent-mode-only rule + the `${…}`
 * interpolation checks, run once the whole-file named-type set is known.
 */
function collectSystemField(
  value: Node | null | undefined,
  keyRange: SourceRange | undefined,
  valueRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.systemPresent = true;
  if (!isScalar(value)) {
    fields.systemValue = undefined;
  } else if (value.value === null) {
    // A value-less `system:` (bare key / `null` / `~`) carries no prompt: map
    // it to the empty template so it renders byte-identically to `system: ""`
    // (a zero-part template) instead of the fabricated text "null" — the null
    // VALUE is the spec's own name for the absent case (bug 0299). It maps to
    // `""`, not `undefined`: `undefined` is the sentinel the malformed-field
    // check below keys on to raise `theta/load/malformed-system-field`, a code
    // reserved for a present NON-scalar `system:` — a null scalar IS a scalar,
    // so refusing it here would misclassify an absent value as malformed.
    fields.systemValue = "";
  } else {
    fields.systemValue = String(value.value);
  }
  fields.systemRange = valueRange ?? keyRange;
}

/**
 * The deferred-field / unknown-key fallback: a key no recognised arm claimed.
 * A key reserved for a deferred theta 1.0 feature warns with the dedicated
 * code (not the generic unknown-key code); any other key draws the
 * forward-compat `theta/load/unknown-frontmatter-field` warning (the theta
 * 1.0 vocabulary, `frontmatter-fields-a.md` §Field contract). Both are
 * tolerated; the theta still registers.
 */
function reportUnrecognisedKey(
  key: string,
  keyRange: SourceRange | undefined,
  file: string,
  diagnostics: Diagnostic[],
): void {
  if (DEFERRED_FRONTMATTER_FIELDS.has(key)) {
    diagnostics.push({
      severity: "warning",
      code: "theta/load/deferred-frontmatter-field",
      file,
      ...(keyRange !== undefined ? { range: keyRange } : {}),
      message: `frontmatter field '${key}' is reserved for a deferred theta 1.0 feature`,
    });
  } else {
    diagnostics.push({
      severity: "warning",
      code: "theta/load/unknown-frontmatter-field",
      file,
      ...(keyRange !== undefined ? { range: keyRange } : {}),
      message: `unknown frontmatter field '${normaliseLiteralValueLineBreaks(key)}'`,
    });
  }
}

/** Collect recognised fields and emit per-key diagnostics in YAML source order. */
function collectRecognisedFields(
  map: YAMLMap<unknown, Node | null> | undefined,
  lineCounter: LineCounter,
  lineOffset: number,
  file: string,
  diagnostics: Diagnostic[],
  block: FrontmatterBlock | undefined,
): RecognisedFields {
  // The recognised fields the contract pins behaviour for, accumulated in one
  // mutable record the field loop assigns into and the function returns as-is.
  const fields: MutableRecognisedFields =
    {
      modeValue: undefined,
      modeRange: undefined,
      modePresent: false,
      modeValueKind: undefined,
      modelPresent: false,
      modelRaw: undefined,
      modelRange: undefined,
      bindContextValue: undefined,
      bindContextRange: undefined,
      bindContextPresent: false,
      bindContextValueKind: undefined,
      descriptionValue: undefined,
      bindModelValue: undefined,
      bindModelUnresolvable: false,
      bindEchoValue: undefined,
      bindEchoRange: undefined,
      bindEchoPresent: false,
      bindEchoScalar: undefined,
      bindEchoValueKind: undefined,
      bindEchoValueRange: undefined,
      argumentHintPresent: false,
      argumentHintRange: undefined,
      argumentHintValue: undefined,
      toolLoopNode: undefined,
      respondRepairNode: undefined,
      paramsNode: undefined,
      paramsPresent: false,
      paramsRange: undefined,
      systemPresent: false,
      systemValue: undefined,
      systemRange: undefined,
      toolsValue: undefined,
      toolsMalformedRange: undefined,
    };

  if (map !== undefined) {
    for (const item of map.items) {
      if (!isScalar(item.key)) {
        // Non-scalar keys are outside the theta 1.0 contract; skip — there is no
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
        collectModeField(item.value, valueRange, fields);
        continue;
      }
      if (key === "model") {
        collectModelField(rawValue, valueRange, fields);
        continue;
      }
      if (key === "bind_model") {
        collectBindModelField(item.value, fields);
        continue;
      }
      if (key === "description") {
        collectDescriptionField(item.value, fields);
        continue;
      }
      if (key === "argument-hint") {
        collectArgumentHintField(item.value, keyRange, fields);
        continue;
      }
      if (key === "bind_echo") {
        collectBindEchoField(item.value, rawValue, keyRange, valueRange, fields);
        continue;
      }
      if (key === "params") {
        collectParamsField(item.value, keyRange, valueRange, fields);
        continue;
      }
      if (key === "bind_context") {
        collectBindContextField(item.value, valueRange, fields);
        continue;
      }
      if (key === "tools") {
        collectToolsField(item.value, keyRange, valueRange, block, fields);
        continue;
      }
      if (key === "system") {
        collectSystemField(item.value, keyRange, valueRange, fields);
        continue;
      }
      if (key === "tool_loop") {
        fields.toolLoopNode = item.value;
        continue;
      }
      if (key === "respond_repair") {
        fields.respondRepairNode = item.value;
        continue;
      }
      if (key === "timeout") {
        // NOCEIL-1 seam: per-call timeouts are rejected in theta 1.0.
        diagnostics.push({
          severity: "error",
          code: "theta/parse/timeout-field-rejected",
          file,
          ...(keyRange !== undefined ? { range: keyRange } : {}),
          message: "'timeout:' field is not supported in theta 1.0",
        });
        continue;
      }
      reportUnrecognisedKey(key, keyRange, file, diagnostics);
    }
  }
  return fields;
}

/**
 * Push the closed-set present-but-unrecognised value refusal the `mode:` /
 * `bind_context:` / `bind_echo:` rules share, gated on the caller-evaluated
 * `refused` predicate (present-but-outside-the-closed-set): a scalar renders
 * its recovered bytes verbatim (line-break-normalised); a non-scalar renders
 * the bounded kind token the field's collect arm recorded. `kindToken` is
 * defined whenever `scalarValue` is undefined at a refusing call site (each
 * arm's invariant), so the cast names that invariant rather than widening the
 * type (bug 0297).
 */
function pushUnknownValueDiagnostic(
  refused: boolean,
  scalarValue: string | undefined,
  kindToken: string | undefined,
  range: SourceRange | undefined,
  code: string,
  fieldName: string,
  expected: string,
  file: string,
  diagnostics: Diagnostic[],
): void {
  if (!refused) {
    return;
  }
  const renderedValue =
    scalarValue !== undefined
      ? normaliseLiteralValueLineBreaks(scalarValue)
      : (kindToken as string);
  diagnostics.push({
    severity: "error",
    code,
    file,
    ...(range !== undefined ? { range } : {}),
    message: `unknown '${fieldName}:' value '${renderedValue}'; expected ${expected}`,
  });
}

/**
 * Resolve a present `model:` reference through the injected matcher seam,
 * returning the resolved reference, or pushing `theta/load/model-unresolved`
 * and returning undefined on no-match / ambiguity. An absent `model:` stays
 * silently undefined.
 */
function resolveModelReference(
  modelPresent: boolean,
  modelRaw: unknown,
  modelRange: SourceRange | undefined,
  modelMatcher: ModelReferenceMatcher,
  file: string,
  diagnostics: Diagnostic[],
): string | undefined {
  if (!modelPresent) {
    return undefined;
  }
  const outcome = modelMatcher.resolve(modelRaw);
  if (outcome === "resolved") {
    return renderScalarValue(modelRaw);
  }
  diagnostics.push({
    severity: "error",
    code: "theta/load/model-unresolved",
    file,
    ...(modelRange !== undefined ? { range: modelRange } : {}),
    message: `theta 'model:' value '${normaliseLiteralValueLineBreaks(
      renderScalarValue(modelRaw),
    )}' resolves to no available model, or is ambiguous across providers`,
  });
  return undefined;
}

/**
 * FRNT-1: parse + range-validate the `tool_loop` / `respond_repair` blocks,
 * defaulting to `{ maxRounds: 25 }` / `{ attempts: 3 }` when absent or empty,
 * and emit the out-of-range / malformed-shape / unknown-sub-key diagnostics
 * for both blocks in that order.
 */
function resolveFrontmatterBlocks(
  toolLoopNode: Node | null | undefined,
  respondRepairNode: Node | null | undefined,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
  diagnostics: Diagnostic[],
): {
  toolLoopResult: ReturnType<typeof resolveNonNegIntBlock>;
  respondRepairResult: ReturnType<typeof resolveNonNegIntBlock>;
} {
  const toolLoopResult = resolveNonNegIntBlock(
    toolLoopNode,
    "max_rounds",
    "tool_loop.max_rounds",
    25,
    file,
    lineCounter,
    lineOffset,
  );
  const respondRepairResult = resolveNonNegIntBlock(
    respondRepairNode,
    "attempts",
    "respond_repair.attempts",
    3,
    file,
    lineCounter,
    lineOffset,
  );
  if ("diagnostic" in toolLoopResult) {
    diagnostics.push(toolLoopResult.diagnostic);
  }
  if ("diagnostic" in respondRepairResult) {
    diagnostics.push(respondRepairResult.diagnostic);
  }
  const toolLoopMalformed = checkBlockShape(toolLoopNode, "tool_loop", "theta/load/malformed-tool-loop-field", file, lineCounter, lineOffset);
  if (toolLoopMalformed !== undefined) diagnostics.push(toolLoopMalformed);
  diagnostics.push(...unknownSubKeyDiagnostics(toolLoopNode, "tool_loop", TOOL_LOOP_SUBKEYS, file, lineCounter, lineOffset));
  const respondRepairMalformed = checkBlockShape(respondRepairNode, "respond_repair", "theta/load/malformed-respond-repair-field", file, lineCounter, lineOffset);
  if (respondRepairMalformed !== undefined) diagnostics.push(respondRepairMalformed);
  diagnostics.push(...unknownSubKeyDiagnostics(respondRepairNode, "respond_repair", RESPOND_REPAIR_SUBKEYS, file, lineCounter, lineOffset));
  return { toolLoopResult, respondRepairResult };
}

/** Check cross-field contracts and resolve model and block defaults in diagnostic order. */
function checkRecognisedFields(
  fields: RecognisedFields,
  yamlErrored: boolean,
  file: string,
  modelMatcher: ModelReferenceMatcher,
  lineCounter: LineCounter,
  lineOffset: number,
  diagnostics: Diagnostic[],
): {
  resolvedModel: string | undefined;
  toolLoopResult: ReturnType<typeof resolveNonNegIntBlock>;
  respondRepairResult: ReturnType<typeof resolveNonNegIntBlock>;
} {
  const {
    modeValue,
    modeRange,
    modePresent,
    modeValueKind,
    modelPresent,
    modelRaw,
    modelRange,
    bindContextValue,
    bindContextRange,
    bindContextPresent,
    bindContextValueKind,
    descriptionValue,
    bindEchoValue,
    bindEchoPresent,
    bindEchoScalar,
    bindEchoValueKind,
    bindEchoValueRange,
    argumentHintPresent,
    argumentHintRange,
    toolLoopNode,
    respondRepairNode,
    paramsNode,
    paramsPresent,
    paramsRange,
    toolsMalformedRange,
  } = fields;
  // Required `mode:`. A block the YAML parser rejected already drew
  // `theta/load/malformed-frontmatter-yaml` above and never reached the field
  // loop, so a key never seen there is a statement about the discard, not the
  // source (bug 0263 §Fix constraint 1) — gate this arm to a block that parsed
  // and genuinely omits `mode:`. `modePresent` (set at the mode arm for both
  // scalar and non-scalar values) is the presence signal, not `modeValue`: a
  // present non-scalar value leaves `modeValue` undefined too, and that case is
  // present-but-bad, routed to `unknown-mode-value` below, not missing (bug 0296).
  if (!modePresent && !yamlErrored) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/missing-mode",
      file,
      message: "frontmatter is missing required field 'mode:'",
    });
  }

  // `bind_context: session` on a `mode: subagent` theta is inert: subagent-mode
  // thetas invoked from a slash command have no caller-session context to
  // attach, so declaring it warns (not errors) and the theta still registers.
  if (bindContextValue === "session" && modeValue === "subagent") {
    diagnostics.push({
      severity: "warning",
      code: "theta/parse/bind-context-session-on-subagent",
      file,
      ...(bindContextRange !== undefined ? { range: bindContextRange } : {}),
      message: "'bind_context: session' has no effect on a mode: subagent theta",
    });
  }

  // `argument-hint:` declared without a (non-empty) `description:` renders an
  // empty autocomplete entry, since Pi's extension-registered commands have no
  // `argumentHint` slot and only `description` reaches the dropdown. Advisory
  // only; the theta still registers.
  if (
    argumentHintPresent &&
    (descriptionValue === undefined || descriptionValue === "")
  ) {
    diagnostics.push({
      severity: "warning",
      code: "theta/load/argument-hint-not-displayed",
      file,
      ...(argumentHintRange !== undefined ? { range: argumentHintRange } : {}),
      message:
        "'argument-hint:' declared without 'description:'; Pi's autocomplete entry will be empty",
    });
  }

  // Present `model:` — resolved through the injected matcher seam.
  const resolvedModel = resolveModelReference(
    modelPresent, modelRaw, modelRange, modelMatcher, file, diagnostics,
  );

  // FRNT-1: parse + range-validate the `tool_loop` / `respond_repair` blocks,
  // defaulting to `{ maxRounds: 25 }` / `{ attempts: 3 }` when absent or empty.
  const { toolLoopResult, respondRepairResult } = resolveFrontmatterBlocks(
    toolLoopNode,
    respondRepairNode,
    file,
    lineCounter,
    lineOffset,
    diagnostics,
  );

  // A present-but-unrecognised `mode:` is the separate unknown-mode-value error
  // (distinct from missing-mode, which fired above only when `mode:` is absent);
  // "missing" and "present-but-bad" do not collapse into one code.
  pushUnknownValueDiagnostic(
    modePresent && modeValue !== "prompt" && modeValue !== "subagent",
    modeValue, modeValueKind, modeRange,
    "theta/load/unknown-mode-value", "mode", "'prompt' or 'subagent'",
    file, diagnostics,
  );

  // A present `bind_context:` value other than `none` / `session` (incl.
  // non-string scalars) is the unknown-bind-context-value load error.
  pushUnknownValueDiagnostic(
    bindContextPresent && bindContextValue !== "none" && bindContextValue !== "session",
    bindContextValue, bindContextValueKind, bindContextRange,
    "theta/load/unknown-bind-context-value", "bind_context", "'none' or 'session'",
    file, diagnostics,
  );

  // A present `bind_echo:` value that is neither boolean is the unknown-bind-echo-value
  // load error (0.332.0) — a scalar renders String(value) line-break-normalised, a
  // non-scalar renders the kind token recorded at the bind_echo arm.
  pushUnknownValueDiagnostic(
    bindEchoPresent && bindEchoValue === undefined,
    bindEchoScalar, bindEchoValueKind, bindEchoValueRange,
    "theta/load/unknown-bind-echo-value", "bind_echo", "true or false",
    file, diagnostics,
  );

  // The redundant `params: null` is rejected — omit `params:` or use `params: {}`
  // (both of which are equivalent no-params forms).
  const paramsIsNull =
    paramsPresent &&
    (paramsNode === null ||
      paramsNode === undefined ||
      (isScalar(paramsNode) && paramsNode.value === null));
  if (paramsIsNull) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/params-null",
      file,
      ...(paramsRange !== undefined ? { range: paramsRange } : {}),
      message:
        "'params: null' is not permitted; omit 'params:' or use 'params: {}'",
    });
  }

  // A `tools:` value that is neither of the two admitted spellings (a plain
  // scalar or a sequence) is refused outright rather than treated as absent
  // (bug 0104), and so is an admitted SCALAR whose comma split yields zero
  // entries (bug 0206, e.g. `tools: ""`): both would otherwise collapse onto
  // the same silent empty callable set as the genuinely absent field, and the
  // theta's declared callable set is the only door for both the model-driven
  // and code-driven call paths, so an author who mis-shapes or empties the
  // field gets no signal at all. `tools: []` is excluded by construction — its
  // zero-entry outcome comes from the sequence arm, which never sets this
  // range — so the one spelling the spec declares equivalent to absent stays
  // silent.
  if (toolsMalformedRange !== undefined) {
    diagnostics.push({
      severity: "error",
      code: "theta/load/malformed-tools-field",
      file,
      range: toolsMalformedRange,
      message:
        "malformed 'tools:' field; expected a comma-separated list of entries or a YAML sequence",
    });
  }

  // `respond_repair.methodology:` outside the recognised set.
  const methodologyDiag = checkMethodology(
    respondRepairNode,
    file,
    lineCounter,
    lineOffset,
  );
  if (methodologyDiag !== undefined) {
    diagnostics.push(methodologyDiag);
  }
  return { resolvedModel, toolLoopResult, respondRepairResult };
}

/** Validate the system field and build its template against the lowered params field set. */
function buildSystemTemplate(
  fields: RecognisedFields,
  fieldInputs: readonly ParamFieldInput[],
  options: ParseFrontmatterOptions,
  file: string,
  diagnostics: Diagnostic[],
): SystemTemplate | undefined {
  const { systemPresent, systemValue, systemRange, modeValue } = fields;
  // `system:` subagent-mode-only rule + `${…}` interpolation checks, run against
  // the theta's typed `params` (`system:` on a `mode: prompt` theta is rejected).
  //
  // Keyed on `systemPresent`, not on `systemValue !== undefined` (bug 0298):
  // a present non-scalar `system:` (block sequence/mapping) still needs to
  // draw a diagnostic, either the shape refusal below or, on a `mode: prompt`
  // theta, `theta/parse/system-on-prompt-mode` — that code's registered
  // trigger is presence of the key, not readability of its value, so a
  // non-scalar value must still reach `checkSystemInterpolation`. Only a
  // present-AND-non-scalar `system:` on a non-prompt theta has no rule left to
  // apply it to: it is refused directly under the bug 0104 `tools:`-row shape
  // rather than being fed a fabricated value.
  let systemTemplate: SystemTemplate | undefined;
  if (systemPresent) {
    if (modeValue !== "prompt" && systemValue === undefined) {
      diagnostics.push({
        severity: "error",
        code: "theta/load/malformed-system-field",
        file,
        ...(systemRange !== undefined ? { range: systemRange } : {}),
        message:
          "malformed 'system:' field; expected a scalar system prompt",
      });
    } else {
      const systemParams = new Map<string, SystemParamType>();
      for (const fieldInput of fieldInputs) {
        systemParams.set(
          fieldInput.name,
          toSystemParamType(fieldInput.typeSource, options.bodyTypes, new Map()),
        );
      }
      // `systemValue ?? ""`: on the `mode: prompt` branch
      // `checkSystemInterpolation` returns the prompt-mode refusal before it
      // reads `systemValue`'s content, so the `""` fill is never inspected; on
      // the subagent-scalar branch `systemValue` is always defined here, so
      // the fallback is a no-op and this arm stays byte-identical to before.
      const systemResult = checkSystemInterpolation({
        systemValue: systemValue ?? "",
        mode: modeValue === "prompt" ? "prompt" : "subagent",
        params: systemParams,
        file,
        ...(systemRange !== undefined ? { range: systemRange } : {}),
      });
      diagnostics.push(...systemResult.diagnostics);
      // The template is present only on a valid subagent `system:` (no
      // error-severity interpolation diagnostic); retain it so the runtime spawn
      // can render and install it (SUBAG-1).
      systemTemplate = systemResult.template;
    }
  }
  return systemTemplate;
}

/**
 * Keys-only read of the frontmatter `params:` field names — the pipeline's
 * first phase (YAML document parse + enumeration of the `params:` mapping's
 * scalar keys) without the recognised-field battery, `params:` schema
 * lowering, or `system:` template parse. `parseThetaDocument`'s early pass
 * consumes only these names (they seed `BodyParser`'s immutability map before
 * the body parse), so it reads them here instead of running the whole
 * `parseFrontmatter` pipeline twice per document; the authoritative call after
 * the body parse owns every diagnostic. Mirrors the full pipeline's own
 * gating: a partially-recovered YAML parse (`doc.errors` non-empty) yields no
 * fields (FM-5), and only a scalar-keyed `params:` item names a field — the
 * same set `extractParsedParams` records (refused fields are retained there;
 * only non-scalar keys are skipped), so the name sets agree.
 */
export function readParamFieldNames(block: FrontmatterBlock): Set<string> {
  const names = new Set<string>();
  const doc = parseDocument(block.yaml);
  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    return names;
  }
  for (const item of doc.contents.items) {
    if (isScalar(item.key) && String(item.key.value) === "params" && isMap(item.value)) {
      for (const field of item.value.items) {
        if (isScalar(field.key)) {
          names.add(String(field.key.value));
        }
      }
    }
  }
  return names;
}

/**
 * Parse a theta file's YAML frontmatter against the theta 1.0 field contract
 * (`frontmatter.md`, `frontmatter/frontmatter-fields-a.md`):
 *
 *   - the required `mode:` field — `theta/load/missing-mode` (E) when absent, and
 *     the theta is not registered;
 *   - unknown top-level keys, and unrecognised sub-keys inside a `tool_loop:` /
 *     `respond_repair:` block (rendered with the dotted `<block>.<sub-key>` form) —
 *     `theta/load/unknown-frontmatter-field` (W), one per key, tolerated (the theta
 *     still registers);
 *   - the per-call `timeout:` field — `theta/parse/timeout-field-rejected` (E),
 *     the NOCEIL-1 seam;
 *   - a present `model:` value resolved at load time through the injected
 *     model-reference matcher — `theta/load/model-unresolved` (E) on no-match /
 *     ambiguity, and the theta is not registered.
 *
 * The theta registers iff no error-severity diagnostic was raised.
 *
 * `source` is either a whole fenced document (the fences are stripped here via
 * `extractFrontmatterBlock`) or an already-extracted `FrontmatterBlock` — the
 * shape `splitFrontmatter` produces — so a caller that has already separated
 * the fences feeds the block (with its real file-line offset) directly instead
 * of re-synthesising fences for a second strip.
 */
export function parseFrontmatter(
  source: string | FrontmatterBlock,
  options: ParseFrontmatterOptions,
): FrontmatterParseResult {
  const { file, modelMatcher } = options;
  const diagnostics: Diagnostic[] = [];

  const block = typeof source === "string" ? extractFrontmatterBlock(source) : source;
  const lineCounter = new LineCounter();
  const doc =
    block === undefined
      ? undefined
      : parseDocument(block.yaml, { lineCounter });
  // FM-5: refuse a partially-recovered YAML parse. The `yaml` lib recovers from
  // malformed input (e.g. `x: : :`) and exposes the damage in `doc.errors`;
  // consuming its partial `contents` as if well-formed would register a theta
  // built from frontmatter the parser itself rejected. Discard the recovered
  // `contents` so `map` stays undefined and no recognised field is read off a
  // partial parse; `doc.errors[0]` carries the position and offending text
  // the diagnostic below is built from (bug 0263), so the report names the
  // parser's own verdict rather than falling through to the "no recognised
  // frontmatter mapping" surface `theta/load/missing-mode` covers.
  const yamlErrored = doc !== undefined && doc.errors.length > 0;
  const map =
    doc !== undefined && !yamlErrored && isMap(doc.contents)
      ? doc.contents
      : undefined;
  const lineOffset = block?.lineOffset ?? 0;
  if (yamlErrored) {
    // `yamlErrored` is true only for a non-empty error list, so the first
    // element is present; the report is total, which is what lets the
    // required-`mode:` arm below key on the rejection alone.
    const firstError = doc?.errors[0];
    if (firstError !== undefined) {
      diagnostics.push(
        malformedFrontmatterYamlDiagnostic(
          block?.yaml ?? "",
          firstError,
          lineOffset,
          file,
        ),
      );
    }
  }

  const fields = collectRecognisedFields(map, lineCounter, lineOffset, file, diagnostics, block);
  const {
    modeValue,
    bindContextValue,
    descriptionValue,
    bindModelValue,
    bindModelUnresolvable,
    bindEchoValue,
    bindEchoRange,
    argumentHintValue,
    paramsNode,
    systemRange,
    toolsValue,
  } = fields;
  const { resolvedModel, toolLoopResult, respondRepairResult } = checkRecognisedFields(
    fields, yamlErrored, file, modelMatcher, lineCounter, lineOffset, diagnostics,
  );

  // The whole-file body-level named types the `params:` RHS resolves against.
  // Each carries its lowered JSON-Schema fragment (a body `enum` / `schema`
  // lowers concretely; an import lowers permissively) so a `NamedType` param
  // produces a present `loweredSchema` (BIND-1). The SAME decl list feeds the
  // runtime lowering (`extractParsedParams`) and the diagnostics pass below, so
  // the two agree on resolution.
  const bodyTypeDecls: BodyTypeDeclaration[] = [];
  if (options.bodyTypes !== undefined) {
    for (const [name, lowered] of options.bodyTypes.lowered) {
      bodyTypeDecls.push({ name, lowered });
    }
  }

  // `params:` lowering + bypass classification (the binder's runtime schema).
  const {
    params,
    fieldInputs,
    diagnostics: paramsShapeDiags,
    loweringDiagnostics: paramsLoweringDiags,
  } = extractParsedParams(
    paramsNode,
    file,
    lineCounter,
    lineOffset,
    bodyTypeDecls,
    block?.yaml ?? "",
  );
  // The per-field shape refusals land before the `parseParams` diagnostics:
  // a field whose RHS spells no type expression is reported as such, not by
  // whatever the lowering makes of its recovered bytes.
  diagnostics.push(...paramsShapeDiags);

  // Whole-file `params:` named-type / ordering / default-literal diagnostics.
  // The named-type resolution is whole-file, so the body `schema`/`enum` decls
  // and imported symbols supplied via `options.bodyTypes` resolve a forward
  // `NamedType` reference; only a genuinely-undeclared type fires
  // `theta/parse/unresolved-named-type`.
  diagnostics.push(...paramsLoweringDiags);

  // An explicit `bind_echo: true` has no effect on either binder-bypass shape:
  // the bypass skips the binder call entirely, so no success echo is produced.
  // The two shapes own distinct codes: the single-string bypass is the
  // parse-phase `theta/parse/bind-echo-on-bypass`; the no-params bypass is the
  // load-phase `theta/load/bind-echo-without-params`. A defaulted (absent)
  // `bind_echo` never fires either; only an explicit `true` does.
  if (bindEchoValue === true) {
    const bypass = classifyBinderBypass(params?.fields);
    if (bypass.kind === "single-string-bypass") {
      diagnostics.push({
        severity: "warning",
        code: "theta/parse/bind-echo-on-bypass",
        file,
        ...(bindEchoRange !== undefined ? { range: bindEchoRange } : {}),
        message:
          "'bind_echo: true' has no effect on a single-string-bypass theta",
      });
    } else if (bypass.kind === "no-params-bypass") {
      diagnostics.push({
        severity: "warning",
        code: "theta/load/bind-echo-without-params",
        file,
        ...(bindEchoRange !== undefined ? { range: bindEchoRange } : {}),
        message: "'bind_echo: true' has no effect on a no-params theta",
      });
    }
  }

  const systemTemplate = buildSystemTemplate(fields, fieldInputs, options, file, diagnostics);

  const registered = !diagnostics.some((d) => d.severity === "error");
  if (!registered) {
    return { registered: false, paramFields: fieldInputs, diagnostics };
  }

  // `modeValue` is defined here: a missing `mode:` is an error, which would have
  // set `registered` to `false` above. An out-of-range `tool_loop` /
  // `respond_repair` value also unsets `registered`, so both results carry a
  // `value` here.
  const toolLoop: ParsedToolLoop = {
    maxRounds: (toolLoopResult as { value: number }).value,
  };
  const respondRepair: ParsedRespondRepair = {
    attempts: (respondRepairResult as { value: number }).value,
  };
  const frontmatter: ParsedFrontmatter = {
    mode: modeValue as ThetaMode,
    ...(resolvedModel !== undefined ? { model: resolvedModel } : {}),
    ...(bindModelValue !== undefined ? { bindModel: bindModelValue } : {}),
    ...(bindModelUnresolvable ? { bindModelUnresolvable: true as const } : {}),
    ...(bindEchoValue !== undefined ? { bindEcho: bindEchoValue } : {}),
    ...(params !== undefined ? { params } : {}),
    toolLoop,
    respondRepair,
    ...(toolsValue !== undefined ? { tools: toolsValue } : {}),
    ...(systemTemplate !== undefined ? { system: systemTemplate } : {}),
    ...(systemTemplate !== undefined && systemRange !== undefined ? { systemRange } : {}),
    // BNDR-10: retain `bind_context: session` so the binder can source the
    // Recent session context block. A subagent-mode `session` is inert (a
    // warning was emitted above) and is normalised to `none`.
    ...(bindContextValue === "session" && modeValue === "prompt"
      ? { bindContext: "session" as const }
      : {}),
    // frontmatter-fields-a.md: a non-empty `description` populates the
    // slash-command autocomplete entry.
    ...(descriptionValue !== undefined && descriptionValue !== ""
      ? { description: descriptionValue }
      : {}),
    // A non-empty `argument-hint:` grounds the binder system prompt's
    // `Argument hint:` line (its only theta 1.0 consumer).
    ...(argumentHintValue !== undefined && argumentHintValue !== ""
      ? { argumentHint: argumentHintValue }
      : {}),
  };
  return { registered: true, frontmatter, paramFields: fieldInputs, diagnostics };
}
