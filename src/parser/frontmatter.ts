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
// above. Recognised-field collection (the per-key collect arms, the
// `timeout:` rejection, and the deferred/unknown-key warnings) lives in
// frontmatter-collect.ts; this module runs the cross-field rule battery, the
// system-template build, and the pipeline assembly over its result.

import {
  normaliseLiteralValueLineBreaks, type Diagnostic,
  type SourceRange,
} from "../diagnostics/diagnostic";
import {
  LineCounter,
  parseDocument,
  isMap,
  isScalar,
  type Node,
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
  malformedFrontmatterYamlDiagnostic,
  renderScalarValue,
  TOOL_LOOP_SUBKEYS,
  RESPOND_REPAIR_SUBKEYS,
  checkBlockShape,
  unknownSubKeyDiagnostics,
  resolveNonNegIntBlock,
  checkMethodology,
} from "./frontmatter-yaml";
import {
  type RecognisedFields,
  collectRecognisedFields,
} from "./frontmatter-collect";
import {
  type ThetaMode,
  THINKING_LEVELS,
  isThinkingLevel,
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
    thinkingValue,
    thinkingRange,
    thinkingPresent,
    thinkingValueKind,
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

  // Bug 0491: a present `thinking:` value outside the host's thinking-level set
  // (incl. non-string scalars and non-scalars) is the unknown-thinking-value
  // load error; the theta is not registered.
  pushUnknownValueDiagnostic(
    thinkingPresent && !isThinkingLevel(thinkingValue),
    thinkingValue, thinkingValueKind, thinkingRange,
    "theta/load/unknown-thinking-value", "thinking", `${THINKING_LEVELS.slice(0, -1).map((l) => `'${l}'`).join(", ")}, or '${THINKING_LEVELS[THINKING_LEVELS.length - 1]}'`,
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
    thinkingValue,
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
    // Bug 0491: only a recognised level reaches here (any other present value
    // refused the load above).
    ...(isThinkingLevel(thinkingValue) ? { thinking: thinkingValue } : {}),
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
