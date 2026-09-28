// Recognised-field collection for the theta-file YAML frontmatter parse
// (frontmatter/frontmatter-fields-a.md §Field contract): walks the frontmatter
// map in YAML source order, dispatches each recognised theta 1.0 key to its
// per-field collect arm, emits the per-key diagnostics (the per-call
// `timeout:` rejection, deferred-field and unknown-key warnings), and returns
// the `RecognisedFields` record that frontmatter.ts's cross-field rule battery
// consumes. Extracted from frontmatter.ts (PTQ-1529).

import {
  normaliseLiteralValueLineBreaks, type Diagnostic,
  type SourceRange,
} from "../diagnostics/diagnostic";
import {
  LineCounter,
  isScalar,
  isSeq,
  type Node,
  type YAMLMap,
} from "yaml";
import {
  type FrontmatterBlock,
  rangeOf,
  renderNonScalarModeKind,
  renderNonScalarBindContextKind,
  presentScalarOrKind,
  extractToolsList,
} from "./frontmatter-yaml";

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
export interface RecognisedFields {
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
  readonly thinkingValue: string | undefined;
  readonly thinkingRange: SourceRange | undefined;
  readonly thinkingPresent: boolean;
  readonly thinkingValueKind: string | undefined;
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
  const v = presentScalarOrKind(value, renderNonScalarModeKind);
  fields.modeValue = v.value;
  fields.modeValueKind = v.kind;
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
  const v = presentScalarOrKind(value, renderNonScalarBindContextKind);
  fields.bindContextValue = v.value;
  fields.bindContextValueKind = v.kind;
  fields.bindContextRange = valueRange;
}

/**
 * The `thinking:` arm (bug 0491). Same present-but-bad shape as `bind_context:`:
 * presence is recorded so the closed-set refusal keys on presence, and a
 * non-scalar value's bounded kind token is kept so the refusal can name it.
 */
function collectThinkingField(
  value: Node | null | undefined,
  valueRange: SourceRange | undefined,
  fields: MutableRecognisedFields,
): void {
  fields.thinkingPresent = true;
  const v = presentScalarOrKind(value, renderNonScalarBindContextKind);
  fields.thinkingValue = v.value;
  fields.thinkingValueKind = v.kind;
  fields.thinkingRange = valueRange;
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
export function collectRecognisedFields(
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
      thinkingValue: undefined,
      thinkingRange: undefined,
      thinkingPresent: false,
      thinkingValueKind: undefined,
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
      if (key === "thinking") {
        collectThinkingField(item.value, valueRange, fields);
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
