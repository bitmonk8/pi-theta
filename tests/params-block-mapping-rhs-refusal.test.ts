import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { BypassParamsField } from "../src/binder/binder-envelope";
import {
  buildBinderSystemPrompt,
  type SystemPromptParamField,
} from "../src/binder/binder-system-prompt";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0041 — a `params:` right-hand side written as a YAML block mapping is not
// a theta type expression, yet it loads with no diagnostic: the recovered
// block-YAML text falls past every lowering arm to the permissive `{}`, the
// param accepts any JSON value, and the same text is recorded as the field's
// declared type and rendered — newlines included — into the binder's
// `Parameters:` block
// (docs/bugs/0041-params-block-mapping-rhs-silent-permissive.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:58 (§`params` *Type
//     side*; restated docs/reference/frontmatter.md:75) — the `params:` RHS is
//     "a type expression parsed by the theta type grammar — the same grammar
//     used in every other type-annotation position".
//   - docs/spec_topics/type-system.md:15 — one type grammar in every annotation
//     position, `params:` named.
//   - docs/spec_topics/grammar.md:90–:102 — the closed `Type` production set
//     (`PrimitiveType` | `NamedType` | `GenericType` | `ObjectType` | union |
//     `LiteralType`); no production spells a YAML block collection; :105 names
//     `params:` field types in the position list.
//   - docs/spec_topics/schema-subset.md:74–:81 — Lowering step 3's per-type-form
//     emission table defines no `{}` emission for any admitted form, so the
//     permissive lowering matches no rule; :79 is `LiteralType`'s
//     `{"const": <value>}`, the admitted traffic the catch-all carries
//     (fixture M, group (e)).
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md:117 (item 4 — "one
//     per-field line per declared field", each "indented with exactly two
//     U+0020 SPACE characters" with "no other leading whitespace") and :129
//     (*Type display* — the declared Theta type in the surface syntax of Type
//     System). Both MUSTs; a type carrying a newline can satisfy neither.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2, the registry
//     is closed — the refusal needs a registered row landed in the same commit)
//     and docs/spec_topics/diagnostics/placeholder-rendering-b.md:10 — `<param>`
//     is an established category-5 placeholder (the
//     `theta/parse/invoke-arg-type-mismatch` row already renders it), so the
//     closed placeholder surface is untouched.
//   - docs/spec_topics/governance/source-language-stability.md:25 (GOV-15) —
//     the diagnostic-registry carve-out covers the newly-refused inputs within
//     a 1.x minor; the row's trigger is the post-hoc in-scope input set.
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix, route settled at the frontmatter
// read — `extractParsedParams`, src/parser/frontmatter.ts:652, the one point
// that still holds the YAML value node; RED now, GREEN after):
//   1. ADMIT a `params:` field whose YAML value node is a scalar or a FLOW
//      mapping (`isMap(node) && node.flow === true` — the inline object type);
//      REFUSE any other node shape — and a member that carries no value node
//      at all (`? p`, `params: {p}`), which fails the same positive predicate
//      (group (b2)). The predicate is the node-shape test
//      alone: the only non-scalar YAML shape that spells a `Type` is the flow
//      mapping an inline object type parses as, and every other node shape
//      recovers bytes no `Type` production spells. The route closes fixtures
//      A–D and deliberately does not close fixture E (bug doc §Fix) — a
//      scalar is admitted whatever text it carries, so the multi-line block
//      scalar stays a recorded residual (group (c1)) beside the one-line
//      members (group (e)).
//   2. The refusal is ONE new registered diagnostic,
//      `theta/load/params-type-not-expression` (severity E — registration is
//      gated on error severity alone, so a warning would leave the
//      accept-anything param registered; phase load), raised per offending
//      field with the category-5 `<param>` placeholder.
//   3. The field is RETAINED in `fieldInputs` / `bypassFields`, so the
//      `system:` seam (`toSystemParamType`, frontmatter.ts:534) and
//      `parseParams` behave exactly as at baseline and the input yields exactly
//      ONE new diagnostic — no cascade (group (f)). Registration is withheld by
//      the existing error-severity gates (frontmatter.ts:1153 nulls the
//      frontmatter; `hasLoadParseError`,
//      src/extension/production-composition.ts:1894–1901, drops the theta).
//
// PROBED CURRENT SIGNATURES (HEAD 8ea0c958 / 0.50.0, offline, deterministic —
// re-derived from the bug doc's §Reproduction table (written at 0.45.0) with
// ZERO drift). Body `schema Triage { urgent: boolean }` + `let x = 1`;
// `Tirage` declared nowhere; frontmatter `mode: prompt` plus the `params:`
// entries shown:
//   A  p: + indented `a: Tirage`         diags []  props.p {}  type "a: Tirage"
//                                        AJV accepts {p:7}, {p:"anything"}, {p:null}
//   B  p: + `a: Tirage` + `b: integer`   diags []  props.p {}
//                                        type "a: Tirage\n    b: integer"
//                                        binder emits ["Parameters:", "  p (a: Tirage",
//                                        "    b: integer) required", ""]
//   C  p: + `- a` + `- b`                diags []  props.p {}  type "- a\n    - b"
//   D  p: [a, b]                         diags []  props.p {}  type "[a, b]"
//   E1 p: "a: Tirage"                    diags []  props.p {}  type "a: Tirage"
//   E2 p: | (ONE line)                   same as E1
//   E3 p: > (ONE line)                   same as E1
//   E2-multi p: | (TWO lines)            diags []  type "a: Tirage\nb: integer"
//                                        binder emits ["Parameters:", "  p (a: Tirage",
//                                        "b: integer) required", ""]
//   F  p: {a: Tirage}                    ONE error unresolved-named-type, fm null
//   G  p: {a: Triage}                    diags []  $ref #/$defs/__inline_6a8e2246094f0455
//   H  p: Triage                         diags []  $ref #/$defs/Triage
//   I  p: array<{a: string}>             ONE error theta/load/missing-mode, fm null
//   J  p: (value-less)                   diags []  props.p {"type":"null"}  type "null"
//        the value node IS a Scalar carrying null (probed: isScalar true,
//        .value null, flow undefined), so the shape clause admits it
//   M  p: 42 / p: '"hello"'              diags []  props.p {}  type "42" / "\"hello\""
//      p: true                           ONE error unresolved-named-type 'true', fm null
//   L  mode: subagent, block-mapping p, system "${p}"   diags [] (registers)
//   yaml node shapes at the production `parseDocument(block.yaml, { lineCounter })`
//   call shape: flow mapping isMap flow=true; block mapping isMap flow=undefined;
//   block sequence isSeq flow=undefined; flow sequence isSeq flow=true;
//   literal block scalar isScalar (value carries the interior "\n"); explicit
//   key `? p` and value-less flow member `{p}`: NO value node — the pair's
//   value is JS null; value-less `p:` and `{p: }`: a Scalar carrying null.
//
// WHAT IS RED HERE AND WHY: (a) the registry row does not exist; (b) fixtures
// A / B / C / D load silently instead of refusing; (b2) the value-node-absent
// spellings `? p` and `params: {p}` load silently — a null `item.value` falls
// past the `isScalar` read to `paramValueSource`, recovers "", and lowers
// permissively (the bug doc's fixture-K `"" → {}` row; derived from the HEAD
// blob); (f) fixture L loads silently. GREEN BY DESIGN and required to stay
// green: (b2's fence) the null-scalar spelling `params: {p: }` beside its
// refused look-alikes, (c1) the multi-line block-scalar residual and the
// multi-line flow-mapping admission — the fences that bound the node-shape
// predicate from both sides, (c2) the per-field line shape for registering
// controls G and H, (d) the four working routes and the fail-closed
// neighbour, (e) the single-line scalar spellings and the `LiteralType`
// traffic — the fences that stop the fix from widening the refusal beyond
// the node-shape clause — and (g) the H9a permitted-codes fence.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// `parseThetaDocument` over a string (`parseDoc`, tests/helpers/e2e-s1.ts — the
// shipped front end wrapped in the standard inert deps double) plus one direct
// call of the shipped `buildBinderSystemPrompt` over the fields that parse
// produced. The registration consequence is reached by asserting the two
// properties the shipped drop gate reads — error severity and the
// `theta/load/` namespace (production-composition.ts:1894–1901) — plus the
// frontmatter-null refusal fixture F already exhibits, rather than by
// re-driving discovery, which witnesses no additional behaviour.
//
// NO SILENT SKIPPING: every helper that cannot find what it needs THROWS with
// the document's diagnostics rendered. A refused parse, an absent `params:`
// block, an absent lowered schema, or an absent `Parameters:` block can never
// read as a pass.

// ===========================================================================
// The registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

const CODE = "theta/load/params-type-not-expression";

/**
 * The normative *Message* template the fix must land in the registry
 * (code-registry-load.md, immediately after the `theta/load/params-null` row,
 * mirrored into docs/reference/diagnostics.md). Written literally HERE ONCE —
 * group (a) asserts the registry row equals it — and every other expected
 * message in this file is derived from the REGISTRY READ, never from this
 * constant, so DIAG-4's "the Message column is normative" is enforced rather
 * than restated.
 */
const EXPECTED_TEMPLATE =
  "'params:' field '<param>' right-hand side is not a theta type expression";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/**
 * A registry row's normative *Message* template with one placeholder filled
 * (DIAG-4). Definedness is asserted first so a missing row reds by naming the
 * registry page, never by a bare `undefined` comparison.
 */
function templateMessage(code: string, placeholder: string, value: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the Message row for ${code}`,
  ).toBeDefined();
  return (template as string).replace(placeholder, value);
}

/** The new refusal's message for one field (`<param>` is category-5, unquoted). */
function refusalMessage(param: string): string {
  return templateMessage(CODE, "<param>", param);
}

/** The `theta/parse/unresolved-named-type` message for one name (controls F, M). */
function unresolvedMessage(name: string): string {
  return templateMessage("theta/parse/unresolved-named-type", "<name>", name);
}

/** The `theta/load/missing-mode` message (control I; no placeholder). */
function missingModeMessage(): string {
  const template = registryMessage(REGISTRY, "theta/load/missing-mode") as string | undefined;
  expect(
    template,
    "DIAG-4 anchor: code-registry-load.md must carry the Message row for theta/load/missing-mode",
  ).toBeDefined();
  return template as string;
}

// ===========================================================================
// The independent slug oracles for control G and the (c1) fence (§Canonical
// schema hash steps 2–4). `schemaSlug` is deliberately NOT imported: an
// oracle taken from the implementation under test proves nothing.
// ===========================================================================

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};

/** The lowered fragment of the inline object type `{a: Triage}` (step 3). */
const G_FRAGMENT = {
  type: "object",
  properties: { a: { $ref: "#/$defs/Triage" } },
  required: ["a"],
  additionalProperties: false,
};

/**
 * `G_FRAGMENT`'s hand-written canonical form: keys sorted by Unicode code point
 * — `additionalProperties` < `properties` < `required` < `type` — and no
 * insignificant whitespace (schema-subset.md:99–:101).
 */
const G_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"}},"required":["a"],"type":"object"}';

/** SHA-256 of the canonical-form bytes, first 16 hex characters, lowercased. */
const G_SLUG = createHash("sha256").update(G_CANONICAL, "utf8").digest("hex").slice(0, 16);

/** The synthesised `$defs` key control G's inline object hoists under. */
const G_INLINE = `__inline_${G_SLUG}`;

/**
 * The same oracle for the (c1) over-refusal fence: the two-field inline
 * object type `{a: Triage, b: integer}`, written across two physical lines in
 * the fixture. The slug hangs off the lowered fragment's canonical form, so
 * the line break in the author's bytes does not reach it.
 */
const MF_FRAGMENT = {
  type: "object",
  properties: { a: { $ref: "#/$defs/Triage" }, b: { type: "integer" } },
  required: ["a", "b"],
  additionalProperties: false,
};

/**
 * `MF_FRAGMENT`'s hand-written canonical form: keys sorted by Unicode code
 * point and no insignificant whitespace (schema-subset.md:99–:101).
 */
const MF_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"$ref":"#/$defs/Triage"},"b":{"type":"integer"}},"required":["a","b"],"type":"object"}';

/** SHA-256 of the canonical-form bytes, first 16 hex characters, lowercased. */
const MF_SLUG = createHash("sha256").update(MF_CANONICAL, "utf8").digest("hex").slice(0, 16);

/** The synthesised `$defs` key the fence's inline object hoists under. */
const MF_INLINE = `__inline_${MF_SLUG}`;

// ===========================================================================
// Fixture sources. One body, one frontmatter shape, one `params:` block —
// byte-identical to the bug doc's §Reproduction table.
// ===========================================================================

/** `Triage` is declared in every fixture; `Tirage` is declared nowhere. */
const BODY = "schema Triage { urgent: boolean }\nlet x = 1\n";

/** A `mode: prompt` theta whose `params:` block is `paramsBlock`. */
function src(paramsBlock: string): string {
  return `---\nmode: prompt\nparams:\n${paramsBlock}\n---\n${BODY}`;
}

/**
 * A `mode: prompt` theta whose whole `params:` entry is the single line
 * `paramsLine`. Group (b2)'s flow-form spellings (`params: {p}`,
 * `params: {p: }`) sit on the `params:` line itself, so they cannot be
 * spelled through `src`'s nested block.
 */
function srcInlineParams(paramsLine: string): string {
  return `---\nmode: prompt\n${paramsLine}\n---\n${BODY}`;
}

/** Fixture L: `mode: subagent`, a block-mapping param, and a `system:` template. */
function subagentSrc(paramsBlock: string, system: string): string {
  return `---\nmode: subagent\nparams:\n${paramsBlock}\nsystem: "${system}"\n---\n${BODY}`;
}

// ===========================================================================
// Reading a parsed document. Loud on every unexpected disposition.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** The lowered `params:` document plus its two sub-records. */
interface LoadedParams {
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly defs: Record<string, unknown>;
  readonly fields: readonly BypassParamsField[];
  readonly loweredSchema: Record<string, unknown>;
}

/**
 * Parse a fixture that must LOAD, and read its lowered `params:` schema back.
 *
 * The empty-diagnostic assertion runs first (every fixture read through this
 * helper pins a zero-diagnostic disposition), and every absent intermediate —
 * a `null` frontmatter, an absent `params`, an absent `loweredSchema` — THROWS
 * with the diagnostics rendered, so a refused parse can never read as a pass.
 */
function loadCleanly(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0041.theta");
  expect(
    diagLines(doc),
    `${label}: this fixture's pinned disposition is a clean load — any diagnostic is drift`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document at the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const properties = lowered["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return {
    properties: properties as Record<string, unknown>,
    required: (lowered["required"] ?? []) as readonly string[],
    defs: (lowered["$defs"] ?? {}) as Record<string, unknown>,
    fields: params.fields,
    loweredSchema: lowered,
  };
}

/** The named field of a loaded params block, or a loud failure. */
function fieldOf(loaded: LoadedParams, wireName: string): BypassParamsField {
  const found = loaded.fields.find((f) => f.wireName === wireName);
  if (found === undefined) {
    throw new Error(
      `no params field '${wireName}' in ${JSON.stringify(loaded.fields)} — the declaration was dropped entirely`,
    );
  }
  return found;
}

/**
 * The refusal contract shared by every non-type-expression fixture: EXACTLY ONE
 * diagnostic — the registered code at error severity, its message the
 * registry's with `<param>` rendered as the field name — and the theta refused
 * (`frontmatter === null`, the same collapse the params-owned error of control
 * F already produces, because frontmatter.ts:1153 withholds the frontmatter on
 * any error-severity diagnostic).
 *
 * The count/code/severity assertion runs FIRST so the red at HEAD names the
 * symptom the bug reports — zero diagnostics for a declaration that silently
 * loses validation — rather than a downstream message or registry mismatch.
 */
function expectParamsTypeRefused(label: string, doc: ThetaDocument, param: string): void {
  expect(
    diagCodes(doc),
    `${label}: bug 0041 §Expected — the RHS is outside the closed \`Type\` grammar (grammar.md:90–:102) and no emission rule admits it (schema-subset.md:74–:81), so honest coverage is refusal with EXACTLY ONE error-severity ${CODE}. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([`error ${CODE}`]);
  const diagnostic = doc.diagnostics[0];
  if (diagnostic === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  // WHY these two properties and not registration itself: `hasLoadParseError`
  // (src/extension/production-composition.ts:1894–1901) drops a theta from
  // registration exactly when some diagnostic has `severity === "error"` and a
  // code starting `theta/load/` or `theta/parse/`. Asserting both is the
  // reachability link that turns the new diagnostic into a theta that does not
  // register — the disposition controls F and I already have and fixtures A–D
  // do not.
  expect(
    diagnostic.severity,
    `${label}: the drop gate reads error severity, so a warning would leave the accept-anything param registered (bug doc §Fix: "Severity must be E")`,
  ).toBe("error");
  expect(
    diagnostic.code.startsWith("theta/load/"),
    `${label}: the drop gate reads the \`theta/load/\` / \`theta/parse/\` namespaces only; observed code ${diagnostic.code}`,
  ).toBe(true);
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's template with the category-5 \`<param>\` placeholder rendered as the field name, unquoted (placeholder-rendering-b.md:10)`,
  ).toBe(refusalMessage(param));
  expect(
    doc.frontmatter,
    `${label}: an error-severity params diagnostic must collapse the frontmatter exactly as control F's does — a loaded theta whose param validates nothing is the hole this bug reports`,
  ).toBeNull();
}

// ===========================================================================
// The binder `Parameters:` block, through the SHIPPED builder.
// ===========================================================================

/**
 * Map parsed fields to the system-prompt descriptors exactly as the producer's
 * `binderPromptParamField` (src/extension/production-theta-producer.ts) does:
 * the surface type verbatim, the requirement token from the retained default.
 * That mapper is module-private, so the mapping is mirrored here; it adds
 * nothing to `type`, which is the byte under test — a divergence would show as
 * a byte mismatch in group (c)'s exact-line assertions.
 */
function binderParams(fields: readonly BypassParamsField[]): SystemPromptParamField[] {
  return fields.map((f) => ({
    wireName: f.wireName,
    type: f.type,
    requirement:
      f.hasDefault && f.defaultSource !== undefined
        ? { kind: "default" as const, literal: f.defaultSource }
        : { kind: "required" as const },
  }));
}

/**
 * The physical lines of the `Parameters:` block (between the header and its
 * terminating blank line) that `buildBinderSystemPrompt` emits for a theta's
 * parsed fields. Loud when the block is absent — a fixture reaching this helper
 * declares at least one field, so item 4 requires the block.
 */
function parametersBlockLines(label: string, fields: readonly BypassParamsField[]): string[] {
  const prompt = buildBinderSystemPrompt({
    name: "t",
    params: binderParams(fields),
    rawArguments: "",
  });
  const lines = prompt.split("\n");
  const header = lines.indexOf("Parameters:");
  if (header < 0) {
    throw new Error(
      `${label}: no \`Parameters:\` header in the built system prompt — item 4 requires the block for ≥1 declared field. Prompt: ${JSON.stringify(prompt)}`,
    );
  }
  const end = lines.indexOf("", header);
  if (end < 0) {
    throw new Error(
      `${label}: the \`Parameters:\` block never terminates with a blank line. Prompt: ${JSON.stringify(prompt)}`,
    );
  }
  return lines.slice(header + 1, end);
}

// ===========================================================================
// (a) THE DIAG-4 REGISTRY ANCHOR.
// RED at HEAD: the row does not exist, so the red names the registry page.
// ===========================================================================

describe("bug 0041 (a) — the refusal code has a registry row", () => {
  it(`RED (a1): code-registry-load.md carries ${CODE} with the normative Message, severity E, phase load`, () => {
    // A registry addition is a DIAG-2 operation (diagnostic-shape.md:72),
    // covered within a theta 1.x minor by the GOV-15 diagnostic-registry
    // carve-out (source-language-stability.md:25) for the inputs whose only
    // change is the appearance of the code — exactly fixtures A–D, the
    // multi-line block scalar (c1), and fixture L (f1).
    const template = registryMessage(REGISTRY, CODE) as string | undefined;
    expect(
      template,
      `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry the Message row for ${CODE}`,
    ).toBeDefined();
    expect(
      template,
      "DIAG-4 — the Message column is normative character-for-character; `<param>` is the established category-5 placeholder (placeholder-rendering-b.md:10, already rendered by the `theta/parse/invoke-arg-type-mismatch` row), so no new placeholder is coined",
    ).toBe(EXPECTED_TEMPLATE);
    const row = REGISTRY.find((r) => r.code === CODE) as RegistryRow | undefined;
    expect(row, `the parsed registry must hold a structured row for ${CODE}`).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      "severity E — registration is gated on error severity alone (production-composition.ts:1894–1901); a warning would leave the accept-anything param registered",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase load — the check runs at the frontmatter read (`extractParsedParams`), a frontmatter-shape refusal beside `theta/load/params-null`, not a lowering-side check",
    ).toBe("load");
  });
});

// ===========================================================================
// (b) THE REFUSAL, through the real load path — fixtures A / B / C / D.
// RED at HEAD: every fixture loads with ZERO diagnostics, lowers
// `properties.p = {}` (AJV accepts `{p: 7}`, `{p: "anything"}`, `{p: null}` —
// probed), and registers.
// ===========================================================================

describe("bug 0041 (b) — a params RHS that is no type expression is refused", () => {
  /**
   * The four non-scalar spellings the shape clause refuses: neither a YAML
   * scalar nor a flow mapping (probed node shapes: block mapping isMap with
   * `flow` undefined; block sequence isSeq; flow sequence isSeq with `flow`
   * true — only the flow MAPPING is the inline object type the grammar admits).
   */
  const REFUSED: ReadonlyArray<readonly [string, string]> = [
    ["fixture A (block mapping, one key)", "  p:\n    a: Tirage"],
    ["fixture B (block mapping, two keys)", "  p:\n    a: Tirage\n    b: integer"],
    ["fixture C (block sequence)", "  p:\n    - a\n    - b"],
    ["fixture D (flow sequence)", "  p: [a, b]"],
  ];

  for (const [label, paramsBlock] of REFUSED) {
    it(`RED (b, ${label}): exactly one ${CODE} and the theta is refused`, () => {
      // At HEAD this fixture is silent at every severity: the recovered
      // block-YAML text falls past `lowerTypeExpr`'s arms to the trailing
      // catch-all (src/parser/params.ts:469), `lowerCtx.unresolved` stays
      // empty (`Tirage` inside the block is never read as a name), and the
      // param accepts any JSON value at the argument boundary.
      expectParamsTypeRefused(label, parseDoc(src(paramsBlock), "bug0041.theta"), "p");
    });
  }
});

// ===========================================================================
// (b2) THE VALUE-NODE-ABSENT SPELLINGS — refused — AND THE NULL-SCALAR
// SPELLING THAT READS ALIKE — admitted. An explicit key (`? p`) and a
// value-less member of a flow-mapping `params:` (`params: {p}`) produce NO
// value node at all: the pair's value is JS null at the production
// `parseDocument` call shape (probed), so the positive shape predicate has
// nothing to admit and the field is refused — the fail-closed direction. The
// visually-adjacent `p:` (fixture J, group (d)) and `params: {p: }` DO
// produce a value node — a scalar carrying null — and stay admitted.
// RED at HEAD for the two refusals: a null `item.value` fell past the
// `isScalar` read to `paramValueSource`, recovered the empty string, and
// lowered permissively (the bug doc's fixture-K `"" → {}` row).
// ===========================================================================

describe("bug 0041 (b2) — a field carrying no value node at all is refused; the null-scalar spelling is not", () => {
  it(`RED (b2, explicit key): \`? p\` carries no value node and draws exactly one ${CODE}`, () => {
    // WHY refused: an explicit-key entry gets no value node at all, so there
    // is no YAML shape to judge and no bytes to read a type from — the
    // positive predicate is false by absence, the fail-closed direction. At
    // HEAD this spelling loaded silently permissive (fixture-K class), the
    // same hole fixtures A–D exhibit, in a spelling that reads like fixture
    // J's admitted `p:`.
    expectParamsTypeRefused("explicit key `? p`", parseDoc(src("  ? p"), "bug0041.theta"), "p");
  });

  it(`RED (b2, value-less flow member): \`params: {p}\` carries no value node and draws exactly one ${CODE}`, () => {
    // WHY refused: the same absence in flow form — a member written without
    // `:` gets no value node, unlike `params: {p: }` (the fence below), whose
    // `:` yields a null SCALAR. The two spellings read alike to an author;
    // this witness and the fence pin the boundary from both sides.
    expectParamsTypeRefused(
      "value-less flow member `params: {p}`",
      parseDoc(srcInlineParams("params: {p}"), "bug0041.theta"),
      "p",
    );
  });

  it("GREEN (b2, fence): `params: {p: }` keeps fixture J's null-scalar admission and lowering", () => {
    // WHY pinned: the refusal covers ABSENCE of the value node, not every
    // value-less-looking spelling. `{p: }` parses as a scalar carrying null
    // (probed), so the scalar arm admits it exactly as it admits the
    // block-form `p:` (fixture J, group (d)); the whole lowered document is
    // pinned so the absent-node refusal can never silently widen over the
    // null-scalar family.
    //
    // The bug-0041 claim under assertion is unchanged: the SCALAR ARM ADMITS
    // the value-less key and the recorded declared type is still `"null"`. Only
    // the lowered bytes move, under bug 0056 §Fix constraint 2's adjudication
    // that `null` is a `LiteralType` for lowering purposes at every position
    // (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md);
    // `{"type":"null"}` and `{"const":null}` admit exactly `null`, so what
    // moved is bytes and slugs, never a verdict.
    const loaded = loadCleanly(
      "flow value-less key `params: {p: }`",
      srcInlineParams("params: {p: }"),
    );
    expect(
      loaded.loweredSchema,
      "fixture J's class: the null scalar lowers `{\"const\":null}` under bug 0056 §Fix constraint 2's adjudication (`null` is a `LiteralType` at all four positions, schema-subset.md:79), byte-identical to the block form's",
    ).toEqual({
      type: "object",
      properties: { p: { const: null } },
      required: ["p"],
      additionalProperties: false,
    });
    expect(
      fieldOf(loaded, "p").type,
      "the recorded declared type is the rendered null scalar",
    ).toBe("null");
  });
});

// ===========================================================================
// (c) THE BINDER LINE-SHAPE MUSTs — binder-bypass-and-envelope.md:117/:129 —
// AND THE MULTI-LINE BOUNDS OF THE NODE-SHAPE PREDICATE. All GREEN by design:
// c1 pins the recorded residual (the multi-line block scalar) and the
// over-refusal fence (the multi-line flow mapping); c2 pins the registering
// controls' per-field line shape.
// ===========================================================================

describe("bug 0041 (c) — the `Parameters:` line-shape MUSTs and the predicate's multi-line bounds", () => {
  it("GREEN (c1, residual): the MULTI-line literal block scalar is refused now (bug 0059)", () => {
    // WHY THIS TEST MOVED: a literal block scalar is a YAML *scalar*, and bug
    // 0041's settled route is a node-shape test judged on the value node —
    // "does not close fixture E", this fixture's multi-line member — so this
    // file pinned its silent, permissive disposition as a named residual
    // rather than close it here. Bug 0059 §Fix constraint 7 is the named
    // authority that moves it: the recovered text "a: Tirage\nb: integer"
    // is YAML-mapping-shaped and spells no `Type` production (§Fix
    // constraint 4), so it now draws exactly one
    // `theta/load/params-type-not-expression` at the field — the same
    // disposition group (e) below pins for the one-line spellings of the
    // same bytes.
    expectParamsTypeRefused(
      "multi-line block scalar",
      parseDoc(src("  p: |\n    a: Tirage\n    b: integer"), "bug0041.theta"),
      "p",
    );
  });

  it(`GREEN (c1, fence): the MULTI-line FLOW mapping is admitted and hoists under ${MF_INLINE}`, () => {
    // The over-refusal fence: a flow mapping continued across physical lines
    // is a legal `ObjectType` (grammar.md §Inline object types) with a
    // defined emission (schema-subset.md steps 2–3), so the node-shape
    // predicate must admit it — a predicate that read the recovered text's
    // line breaks instead of the node's shape would refuse grammar-admitted
    // input exactly here.
    const loaded = loadCleanly(
      "multi-line flow mapping",
      src("  p: {a: Triage,\n      b: integer}"),
    );
    expect(
      loaded.loweredSchema,
      "schema-subset.md:73/:76 — the two-field inline object hoists under its slug and the field emits the `$ref`",
    ).toEqual({
      type: "object",
      properties: { p: { $ref: `#/$defs/${MF_INLINE}` } },
      required: ["p"],
      additionalProperties: false,
      $defs: { Triage: TRIAGE_DEF, [MF_INLINE]: MF_FRAGMENT },
    });
  });

  /**
   * The registering controls: G (inline object type — a flow mapping, the shape
   * the predicate admits) and H (plain named RHS). Their per-field lines are
   * the normative template `<wire-name> (<type>) <requirement>` on ONE physical
   * line with a two-U+0020 indent, and they must survive the fix byte-for-byte.
   */
  const RENDERING: ReadonlyArray<readonly [string, string, string]> = [
    ["control G", "  p: {a: Triage}", "  p ({a: Triage}) required"],
    ["control H", "  p: Triage", "  p (Triage) required"],
  ];

  for (const [label, paramsBlock, expectedLine] of RENDERING) {
    it(`GREEN (c2, ${label}): one physical per-field line, two-U+0020 indent, no line break in the rendered type`, () => {
      const loaded = loadCleanly(label, src(paramsBlock));
      expect(
        fieldOf(loaded, "p").type.includes("\n"),
        `${label}: a line break in the recorded declared type is what breaks item 4's one-physical-line shape — these registering controls must never gain one`,
      ).toBe(false);
      const lines = parametersBlockLines(label, loaded.fields);
      expect(
        lines,
        `${label}: item 4 (:117) — "one per-field line per declared field", indented with exactly two U+0020 and no other leading whitespace; byte-exact per the normative template`,
      ).toEqual([expectedLine]);
      for (const line of lines) {
        expect(
          /^ {2}[^ \t]/.test(line),
          `${label}: each per-field line begins with exactly two U+0020 SPACE characters (:117); observed ${JSON.stringify(line)}`,
        ).toBe(true);
      }
    });
  }
});

// ===========================================================================
// (d) CONTROLS that must stay byte-identical — the two 0035-fixed routes, the
// plain named RHS, the value-less key, and the fail-closed YAML-frame
// neighbour. GREEN at HEAD by design: these bound the fix.
// ===========================================================================

describe("bug 0041 (d) — the working routes and the fail-closed neighbour do not move", () => {
  it("GREEN (d1, control F): the flow mapping with an undeclared name keeps its single unresolved-named-type", () => {
    // The refusal boundary from the OTHER side: `p: {a: Tirage}` IS a type
    // expression (an inline object type), so the new code must not touch it —
    // its failure is resolution, owned by the 0035-wired diagnostic.
    const doc = parseDoc(src("  p: {a: Tirage}"), "bug0041.theta");
    expect(
      diagLines(doc),
      "control F: 0035's fixed route — exactly one error naming 'Tirage'",
    ).toEqual([`error theta/parse/unresolved-named-type: ${unresolvedMessage("Tirage")}`]);
    expect(doc.frontmatter, "control F: the params-owned error refuses the theta").toBeNull();
  });

  it(`GREEN (d2, control G): the resolvable flow mapping hoists under ${G_INLINE} — byte-exact`, () => {
    // The flow mapping is the ONE non-scalar shape the predicate admits
    // (`isMap(node) && node.flow === true`, probed `flow: true` at the
    // production `parseDocument` call shape). Its whole lowered document is
    // pinned so a fix that mis-writes the shape test reds here immediately.
    const loaded = loadCleanly("control G", src("  p: {a: Triage}"));
    expect(
      G_SLUG,
      "the independent node:crypto oracle over the hand-written canonical form agrees with the bug doc's recorded slug — re-verified at HEAD, no drift from the 0039/0040 hoisting rework",
    ).toBe("6a8e2246094f0455");
    expect(
      loaded.loweredSchema,
      "schema-subset.md:73/:76 — the inline object hoists under its slug and the field emits the `$ref`; this whole document must survive the fix unchanged",
    ).toEqual({
      type: "object",
      properties: { p: { $ref: `#/$defs/${G_INLINE}` } },
      required: ["p"],
      additionalProperties: false,
      $defs: { Triage: TRIAGE_DEF, [G_INLINE]: G_FRAGMENT },
    });
    expect(
      fieldOf(loaded, "p").type,
      "the recorded declared type is the author's bytes",
    ).toBe("{a: Triage}");
  });

  it("GREEN (d3, control H): the plain named RHS keeps its `$ref` lowering", () => {
    const loaded = loadCleanly("control H", src("  p: Triage"));
    expect(loaded.loweredSchema, "step 3 — a named schema reference, byte-exact").toEqual({
      type: "object",
      properties: { p: { $ref: "#/$defs/Triage" } },
      required: ["p"],
      additionalProperties: false,
      $defs: { Triage: TRIAGE_DEF },
    });
    expect(fieldOf(loaded, "p").type, "the recorded declared type").toBe("Triage");
  });

  it("GREEN (d4, fixture J): the value-less key keeps its null-scalar reading", () => {
    // J bounds the refused class from below. The value node of `p:` is a
    // SCALAR carrying `null` (probed: isScalar true, .value null), so the
    // positive node-shape predicate admits it. Whether a null scalar is the
    // intended reading of an absent RHS is bug 0041 §Non-goals' open question,
    // not this fix's.
    //
    // The claim under assertion is unchanged — the scalar arm ADMITS the
    // value-less key and records the type as `"null"`. Only the lowered bytes
    // move, under bug 0056 §Fix constraint 2's adjudication that `null` is a
    // `LiteralType` for lowering purposes at all four type positions
    // (schema-subset.md:79 names it in the literal row; :81 scopes its
    // null-as-primitive clause to the union rule alone).
    const loaded = loadCleanly("fixture J", src("  p:"));
    expect(
      loaded.loweredSchema,
      "the scalar arm reads a null scalar and lowers the `LiteralType` emission `{\"const\":null}` (schema-subset.md:79), which admits exactly the value `{\"type\":\"null\"}` admitted",
    ).toEqual({
      type: "object",
      properties: { p: { const: null } },
      required: ["p"],
      additionalProperties: false,
    });
    expect(fieldOf(loaded, "p").type, "the recorded declared type is the rendered null scalar").toBe(
      "null",
    );
  });

  it("GREEN (d5, fixture I): the brace-under-generic spelling keeps its single missing-mode collapse", () => {
    // The fail-closed neighbour (0028 §Residuals (iv)): braces inside a
    // generic's angle brackets break the YAML frame outright, FM-5 discards the
    // recovered document, and the load fails before the params read — so no
    // check added at `extractParsedParams` can reach or improve it.
    const doc = parseDoc(src("  p: array<{a: string}>"), "bug0041.theta");
    expect(
      diagLines(doc),
      "fixture I: fail-closed on the YAML frame, exactly one missing-mode with `mode: prompt` literally present",
    ).toEqual([`error theta/load/missing-mode: ${missingModeMessage()}`]);
    expect(doc.frontmatter, "fixture I: FM-5 collapse").toBeNull();
  });
});

// ===========================================================================
// (e) SCOPE BOUNDS that must NOT move — the single-line scalar spellings (this
// fix's recorded residual) and the `LiteralType` traffic (bug 0056's subject).
// GREEN at HEAD by design: these are the fences against widening the refusal
// beyond the node-shape clause.
// ===========================================================================

describe("bug 0041 (e) — the residual spellings keep their measured dispositions", () => {
  /**
   * The three SINGLE-line scalar spellings of the same bytes. All three are
   * YAML scalars whose recovered `typeSource` is the one-line "a: Tirage" —
   * the node-shape predicate admits a scalar whatever text it carries, which
   * is the bug doc §Fix's stated residual for the frontmatter-read route:
   * "the quoted and block-scalar spellings carry byte-identical text through
   * the `isScalar` arm". Closing them was the LOWERING-side question this
   * fix (0041) explicitly left open, naming a separate decision as the
   * authority licensed to move them — bug 0059 §Fix is that decision (§Fix
   * constraint 7): the recovered text "a: Tirage" spells no `Type`
   * production, so all three spellings now draw exactly one
   * `theta/load/params-type-not-expression` at the field. The one-line
   * scalar carrying a `LiteralType` (fixture M, group (e-M1/M2) below) is a
   * DIFFERENT class — bug 0056's, not bug 0059's — and stays silent.
   */
  const SCALAR_SPELLINGS: ReadonlyArray<readonly [string, string]> = [
    ["fixture E1 (quoted scalar)", '  p: "a: Tirage"'],
    ["fixture E2 (literal block scalar, ONE line)", "  p: |\n    a: Tirage"],
    ["fixture E3 (folded block scalar, ONE line)", "  p: >\n    a: Tirage"],
  ];

  for (const [label, paramsBlock] of SCALAR_SPELLINGS) {
    it(`GREEN (e, ${label}): refused now — bug 0059 closes the scalar-spelling residual`, () => {
      // WHY THIS TEST MOVED: pinned silent here because bug 0041's own fix
      // named the closure a separate decision's to make ("an implementer who
      // also closes them must move these rows deliberately, in lock-step
      // with that separate decision"). Bug 0059 is that decision (§Fix
      // constraint 7, constraint 4): "a: Tirage" is YAML-mapping-shaped text
      // no `Type` production spells, reached through a quoted scalar or
      // either block-scalar form, so it now draws exactly one
      // `theta/load/params-type-not-expression` at the field.
      expectParamsTypeRefused(label, parseDoc(src(paramsBlock), "bug0041.theta"), "p");
    });
  }

  it("GREEN (e-M1/M2): `p: 42` and `p: '\"hello\"'` stay silent and carry their `LiteralType` emission", () => {
    // The blast-radius bound the bug doc's fixture M states: `LiteralType` is
    // grammar-admitted (grammar.md:102) with a defined emission
    // (schema-subset.md:79, `{"const": <value>}`). This cell's own authority
    // clause names bug 0056 as the report licensed to move these bytes — "the
    // params literal sublanguage is bug 0056's subject" — and its §Fix
    // constraint 1 lifts bug 0039's freeze for exactly this class
    // (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md).
    // What this cell still bounds is the REFUSAL: a node-shape refusal wide
    // enough to catch these would refuse input the grammar admits, so both
    // fixtures must keep loading silently and keep recording the author's own
    // text.
    const m1 = loadCleanly("fixture M1", src("  p: 42"));
    expect(m1.properties["p"], "M1: schema-subset.md:79's single-literal emission").toEqual({
      const: 42,
    });
    expect(fieldOf(m1, "p").type, "M1: the recorded declared type").toBe("42");
    const m2 = loadCleanly("fixture M2", src("  p: '\"hello\"'"));
    expect(m2.properties["p"], "M2: schema-subset.md:79 over a string literal").toEqual({
      const: "hello",
    });
    expect(fieldOf(m2, "p").type, "M2: the recorded declared type keeps the inner quotes").toBe(
      '"hello"',
    );
  });

  it("GREEN (e-M3): `p: true` loads as its `LiteralType` fragment, not a name miss", () => {
    // `true` is keyword-shaped (lexical.md §Reserved keywords), which is bug
    // 0044's own subject, not 0056's: 0056 owns the NON-keyword literal
    // spellings (`42`, `'"hello"'`, group (e-M1/M2) above), which fail the
    // `IDENTIFIER` regex and are untouched by this fix. Bug 0044 §Fix's "No
    // input goes from loud to silent" table, row 5: "`true` / `false` in a
    // mixed union, or anywhere on the `params:` RHS | today:
    // unresolved-named-type | after: nothing; the arm lowers `{const: …}`" —
    // and §Why it matters: "Two grammar-admitted inputs fail to load.
    // `schema X { f: true | string }` and `params: p: true` carry
    // `E`-severity diagnostics, so neither loads; `docs/spec_topics/grammar.md
    // :102` admits both." The lowered
    // `{"const": true}` fragment is the strongest form of the witness this
    // cell keeps from bug 0041: its node-shape refusal (at frontmatter read,
    // upstream of every lowering arm) never reached this scalar arm — a
    // lowering the refusal had touched could not produce a LiteralType
    // fragment at all.
    const doc = parseDoc(src("  p: true"), "bug0041.theta");
    expect(
      diagLines(doc),
      "fixture M3: `true` is a Type atom (grammar.md:102) — no diagnostic",
    ).toEqual([]);
    expect(doc.frontmatter, "fixture M3: loads").not.toBeNull();
    const loaded = loadCleanly("fixture M3", src("  p: true"));
    expect(
      loaded.properties["p"],
      "fixture M3: the lowered fragment IS the LiteralType const — 0041's refusal predicate never touched this arm",
    ).toEqual({ const: true });
  });
});

// ===========================================================================
// (f) THE `system:` SEAM — fixture L. The field must be RETAINED so the input
// yields exactly ONE new diagnostic and no cascade.
// RED at HEAD: the fixture loads with ZERO diagnostics and registers.
// ===========================================================================

describe("bug 0041 (f) — the refused field is retained at the `system:` seam", () => {
  it(`RED (f1, fixture L): block-mapping param + system \"\${p}\" yields EXACTLY the one ${CODE}`, () => {
    // The retention witness. `toSystemParamType` (frontmatter.ts:534) types the
    // recovered block text as a string, so `${p}` is admitted at baseline with
    // zero diagnostics (probed). If the fix DROPPED the field from
    // `fieldInputs` instead of retaining it, `${p}` would name an unknown
    // param and a second, cascading interpolation diagnostic would join the
    // refusal — so asserting EXACTLY one diagnostic here is what pins "the
    // field is retained in `fieldInputs` / `bypassFields` and the `system:`
    // seam behaves exactly as at baseline".
    const doc = parseDoc(subagentSrc("  p:\n    a: Tirage", "${p}"), "bug0041.theta");
    expectParamsTypeRefused("fixture L", doc, "p");
  });
});

// ===========================================================================
// (g) THE H9a GATE FENCE — the new code is NOT sanctioned stderr content.
// GREEN at HEAD (the row is absent) and required to stay green.
// ===========================================================================

describe("bug 0041 (g) — the new code stays outside the H9a permitted-codes list", () => {
  it(`GREEN (g1): ${CODE} is absent from tests/fixtures/h7a/permitted-codes.json`, () => {
    // The permitted-codes list enumerates the diagnostic codes that MAY appear
    // as theta-note stderr content when the H9a acceptance suite drives the
    // real binary over the committed fixtures. The new code is a load-refusing
    // error: it un-registers the theta that raises it, so no committed H9a
    // fixture can both carry the offending `params:` shape and still exercise
    // a registered slash command — the code is unreachable from that suite and
    // permitting it would sanction stderr no fixture can produce. The same
    // reasoning left the list untouched for bug 0040's load-refusing code.
    const permitted = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("./fixtures/h7a/permitted-codes.json", import.meta.url)),
        "utf8",
      ),
    ) as string[];
    expect(Array.isArray(permitted), "the fixture is a JSON array of code strings").toBe(true);
    expect(
      permitted.includes(CODE),
      `${CODE} is a load-refusing error, not sanctioned note content; adding it to the permitted list would widen the acceptance stderr gate for stderr no committed fixture can reach`,
    ).toBe(false);
  });
});
