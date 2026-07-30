// The respond tool's WIRE CONTRACT — the schema the synthesised
// `__theta_respond_<slug>` tool is registered with, and the reverse mapping
// from a model-produced tool-call argument object back to the candidate
// response payload (bug 0028 §Fix).
//
// A tool call's `arguments` are a JSON OBJECT at the wire, and the host
// validates them against the registered `parameters` document before the theta
// side ever sees them (pi-agent-core's agent loop calls `prepareArguments`,
// then pi-ai's `validateToolArguments`, then `execute`). Two consequences the
// lowered response schema alone cannot satisfy:
//
//  1. NON-OBJECT ROOTS ARE UNCONVEYABLE. A declared `enum` (schema-subset.md
//     §Lowering Algorithm step 3) lowers to `{"type":"string","enum":[…]}`, and
//     `@<string>` to `{"type":"string"}`. Registered verbatim, no argument
//     object can satisfy such a root: the host rejects every call with
//     `root: must be string` and the model repair-spins until the invocation is
//     torn down. The root is therefore WRAPPED in a single-property envelope —
//     `{"type":"object","properties":{"value":<lowered>},"required":["value"]}`
//     — validated as the envelope and unwrapped to `.value` as the payload.
//     Object roots are registered UNCHANGED: the envelope exists to make an
//     unconveyable root conveyable, so applying it where the wire is already
//     satisfiable would rename every existing typed query's argument shape for
//     nothing.
//  2. NESTED OBJECT/ARRAY PARAMS ARRIVE AS JSON STRINGS. Models routinely send
//     a nested object parameter as a single JSON-encoded string
//     (`"pet": "{\"species\":\"dog\"}"`), which the host's own coercion does
//     not parse — it rejects with `pet: must be object` and the model
//     repair-spins. `coerceRespondWireArguments` parses those strings back into
//     values at the boundary, schema-directed, BEFORE validation. This is the
//     same compatibility shim pi's own `edit` tool applies through
//     `prepareArguments` for the identical model behaviour.
//
// Spec: query/query-tool-loop.md (QRY-14 respond tool, QRY-15 conveyance),
// query/query-failure-and-repair.md (QRY-22 validate-then-bind),
// schema-subset.md (SUBS-1 lowering — the emission table this module wraps but
// never rewrites).

import type { LoweredSchema } from "../seams/schema-validator";

/** The envelope's single property name — the payload's wire position. */
export const RESPOND_ENVELOPE_KEY = "value";

/** A JSON-Schema document as this module walks it. */
type SchemaNode = Readonly<Record<string, unknown>>;

/**
 * Whether a lowered response schema's ROOT can be satisfied by a tool call's
 * argument object. `true` for an object root (registered verbatim) and for a
 * root that constrains nothing (`{}` — the total-function residual of
 * `lowerQueryResponseSchema`, which accepts an argument object as readily as
 * anything else); `false` for every root the subset's emission table pins to a
 * non-object form (a primitive/array `type`, an `enum` or `const` literal set,
 * a union's `anyOf`).
 */
function rootIsArgumentObjectSatisfiable(lowered: LoweredSchema): boolean {
  const type = lowered["type"];
  if (typeof type === "string") {
    return type === "object";
  }
  if (Array.isArray(type)) {
    return type.includes("object");
  }
  return (
    lowered["enum"] === undefined &&
    lowered["const"] === undefined &&
    lowered["anyOf"] === undefined &&
    lowered["oneOf"] === undefined &&
    lowered["$ref"] === undefined
  );
}

/** Whether `lowered` is registered under the single-property envelope. */
export function respondSchemaIsEnveloped(lowered: LoweredSchema): boolean {
  return !rootIsArgumentObjectSatisfiable(lowered);
}

/**
 * The schema the respond tool is REGISTERED with and the QRY-15/QRY-12
 * conveyance templates carry — the lowered schema itself for an object root,
 * else the single-property envelope around it.
 *
 * `$defs` is lifted to the ENVELOPE root, because `{"$ref": "#/$defs/<Name>"}`
 * pointers resolve against the document root and nowhere else: left under
 * `properties.value.$defs` a lowered `array<Item>` root's own refs would
 * dangle and the registration would fail to compile.
 *
 * ONE recipe serves the registration, the presented tool entry, the QRY-15
 * initial template and the QRY-12 follow-up templates, so the instruction text
 * cannot describe a shape the tool does not accept.
 */
export function respondToolWireSchema(lowered: LoweredSchema): LoweredSchema {
  if (rootIsArgumentObjectSatisfiable(lowered)) {
    return lowered;
  }
  const root: Record<string, unknown> = { ...lowered };
  const defs = root["$defs"];
  delete root["$defs"];
  const envelope: Record<string, unknown> = {
    type: "object",
    properties: { [RESPOND_ENVELOPE_KEY]: root },
    required: [RESPOND_ENVELOPE_KEY],
  };
  if (defs !== undefined) {
    envelope["$defs"] = defs;
  }
  return envelope;
}

/**
 * The candidate response payload carried by one respond-tool call's WIRE
 * arguments: the arguments verbatim for an object root, else the envelope's
 * `.value`. An enveloped call whose arguments are not an object carrying the
 * key passes through verbatim, so a malformed call reaches the QRY-22
 * validation (and its repair loop) as the non-conforming payload it is rather
 * than being silently rewritten to `undefined`.
 */
export function unwrapRespondPayload(lowered: LoweredSchema, wireArguments: unknown): unknown {
  if (!respondSchemaIsEnveloped(lowered)) {
    return wireArguments;
  }
  if (
    typeof wireArguments === "object" &&
    wireArguments !== null &&
    !Array.isArray(wireArguments) &&
    RESPOND_ENVELOPE_KEY in (wireArguments as Record<string, unknown>)
  ) {
    return (wireArguments as Record<string, unknown>)[RESPOND_ENVELOPE_KEY];
  }
  return wireArguments;
}

/**
 * Coerce one respond-tool call's WIRE arguments against the registered wire
 * schema: every position the schema expects an object or an array at, and the
 * model delivered a JSON-encoded string for, is parsed back to its value.
 * Everything else — including a string that is not JSON, and a parsed value
 * whose JSON type still does not match — passes through untouched, so this
 * only ever repairs the encoding, never the shape: a genuinely wrong payload
 * still fails validation and drives repair.
 *
 * Schema-directed (never a blind deep JSON.parse) so a declared `string` field
 * whose value happens to look like JSON keeps its string value.
 */
export function coerceRespondWireArguments(
  wireSchema: LoweredSchema,
  wireArguments: unknown,
): unknown {
  return coerceNode(wireSchema, wireArguments, defsTableOf(wireSchema), 0);
}

/**
 * The payload one respond-tool call delivers, from its raw wire arguments:
 * coerce against the registered wire schema, then unwrap the envelope. The
 * single boundary the three arrival sites share — the live on-session
 * `execute`, the off-session free-phase call servicing, and the forced
 * respond dispatch's extraction — so all three bind the same value for the
 * same wire bytes.
 */
export function respondPayloadFromWire(lowered: LoweredSchema, wireArguments: unknown): unknown {
  const coerced = coerceRespondWireArguments(respondToolWireSchema(lowered), wireArguments);
  return unwrapRespondPayload(lowered, coerced);
}

/** The document-root `$defs` table `#/$defs/<name>` pointers resolve against. */
function defsTableOf(document: LoweredSchema): Readonly<Record<string, SchemaNode>> {
  const defs = document["$defs"];
  if (defs === null || typeof defs !== "object" || Array.isArray(defs)) {
    return {};
  }
  return defs as Readonly<Record<string, SchemaNode>>;
}

/**
 * The `$defs` name a `{"$ref": "#/$defs/<name>"}` node points at, or
 * `undefined` for any other ref form (an external or non-`$defs` pointer is
 * not this module's to resolve).
 */
function defRefName(node: SchemaNode): string | undefined {
  const ref = node["$ref"];
  if (typeof ref !== "string") {
    return undefined;
  }
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  return match?.[1];
}

/**
 * A schema position's JSON types, following `$ref` into the document's `$defs`.
 * `depth` bounds the ref chase: a recursive named schema's fragment refs back
 * into its own closure, and resolving a ref consumes no VALUE, so only a
 * bound guarantees termination on a pathological chain.
 */
const REF_CHASE_LIMIT = 16;

function resolveNode(
  node: SchemaNode,
  defs: Readonly<Record<string, SchemaNode>>,
  depth: number,
): SchemaNode {
  const name = defRefName(node);
  if (name === undefined || depth >= REF_CHASE_LIMIT) {
    return node;
  }
  const target = defs[name];
  return target === undefined ? node : resolveNode(target, defs, depth + 1);
}

/** The JSON types a resolved schema node admits (empty when it constrains none). */
function admittedTypes(node: SchemaNode): readonly string[] {
  const type = node["type"];
  if (typeof type === "string") {
    return [type];
  }
  if (Array.isArray(type)) {
    return type.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

/** The JSON type of a runtime value, in JSON-Schema vocabulary. */
function jsonTypeOf(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  const t = typeof value;
  return t === "object" ? "object" : t === "number" ? "number" : t;
}

/**
 * Parse a JSON-encoded string into the structured value a schema position
 * expects, or `undefined` when it is not JSON of an admitted type. A string
 * that does not parse is tolerated (it is the model's payload, not a defect
 * here) and reaches validation unchanged.
 */
function parseStructuredString(text: string, admitted: readonly string[]): unknown | undefined {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (parseError: unknown) { // allow-broad-catch: JSON-encoded tool-arg tolerance — query/query-tool-loop.md QRY-14
    void parseError;
    return undefined;
  }
  return admitted.includes(jsonTypeOf(parsed)) ? parsed : undefined;
}

/** Coerce one value against one schema position, recursing into its members. */
function coerceNode(
  schema: SchemaNode,
  value: unknown,
  defs: Readonly<Record<string, SchemaNode>>,
  depth: number,
): unknown {
  if (depth >= REF_CHASE_LIMIT) {
    return value;
  }
  const node = resolveNode(schema, defs, 0);
  const admitted = admittedTypes(node);

  // A union of arms (`anyOf`/`oneOf`) carries the type constraint on its arms,
  // not on itself: coerce against the FIRST arm whose admitted types cover the
  // value, so a `Pet | Owner` position still parses a JSON-encoded object.
  const arms = unionArms(node);
  if (arms !== undefined) {
    for (const arm of arms) {
      const armNode = resolveNode(arm, defs, 0);
      const armTypes = admittedTypes(armNode);
      const candidate =
        typeof value === "string" && !armTypes.includes("string")
          ? parseStructuredString(value, armTypes)
          : undefined;
      const probe = candidate ?? value;
      if (armTypes.length === 0 || armTypes.includes(jsonTypeOf(probe))) {
        return coerceNode(armNode, probe, defs, depth + 1);
      }
    }
    return value;
  }

  const structural = admitted.includes("object") || admitted.includes("array");
  const decoded =
    structural && typeof value === "string" && !admitted.includes("string")
      ? parseStructuredString(value, admitted)
      : undefined;
  const current = decoded ?? value;

  if (Array.isArray(current)) {
    const items = node["items"];
    if (items === null || typeof items !== "object" || Array.isArray(items)) {
      return current;
    }
    return current.map((item) => coerceNode(items as SchemaNode, item, defs, depth + 1));
  }

  if (typeof current === "object" && current !== null) {
    const properties = node["properties"];
    if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
      return current;
    }
    const table = properties as Readonly<Record<string, unknown>>;
    const result: Record<string, unknown> = { ...(current as Record<string, unknown>) };
    for (const [key, member] of Object.entries(table)) {
      if (!(key in result) || member === null || typeof member !== "object" || Array.isArray(member)) {
        continue;
      }
      result[key] = coerceNode(member as SchemaNode, result[key], defs, depth + 1);
    }
    return result;
  }

  return current;
}

/** The `anyOf`/`oneOf` arms of a schema node, or `undefined` when it is not a union. */
function unionArms(node: SchemaNode): readonly SchemaNode[] | undefined {
  for (const key of ["anyOf", "oneOf"] as const) {
    const arms = node[key];
    if (Array.isArray(arms)) {
      const nodes = arms.filter(
        (arm): arm is SchemaNode => arm !== null && typeof arm === "object" && !Array.isArray(arm),
      );
      if (nodes.length > 0) {
        return nodes;
      }
    }
  }
  return undefined;
}
