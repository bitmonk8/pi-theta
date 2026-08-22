import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Api, Model, ProviderResponse } from "@earendil-works/pi-ai";
import { fillDefaultsAndRevalidate } from "../src/binder/defaulting";
import { buildBinderEnvelopeSchema } from "../src/binder/binder-envelope";
import { buildBinderCompleteCall } from "../src/binder/binder-inference";
import { parseParams } from "../src/parser/params";
import {
  AjvSchemaValidator,
  type CompiledValidator,
  type LoweredSchema,
  type SchemaSlugFn,
} from "../src/seams/schema-validator";
import { renderArgumentEcho, type EchoType } from "../src/render/argument-echo";
import type { ThetaValue } from "../src/runtime/value";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// Bug 0214 — the three writes/reads keyed by an author-controlled `params:` wire
// name that bug 0210's five-site fix left outside its scope, and that 0210's fix
// made REACHABLE: the lowered `params:` document now carries an own `__proto__`
// key, so the binder arm compiles it and the surviving key reaches these three.
// `__proto__` is an accessor inherited from `Object.prototype`, so `record[name]
// = value` invokes that setter (a no-op for a primitive, a prototype
// replacement for an object) and never creates an own property, and
// `record[name]` answers the prototype rather than reporting an absent own key
// (docs/bugs/0214-defaulting-and-inference-drop-the-proto-named-key.md).
//
// THE THREE SITES THIS FILE WITNESSES, cited by symbol (line anchors drift
// across the fix's own edits; each symbol is re-derived against this tree):
//   (1) `fillDefaultsAndRevalidate`'s fill-if-absent assignment
//       (`src/binder/defaulting.ts:136`, inside the function declared `:124`),
//       reached in production from `#mergeDeclaredDefaults`
//       (`src/extension/production-theta-producer.ts:1295`, its call at
//       `:1319`). `:137` pushes the wire name onto `defaultedWireNames`
//       unconditionally, so the report claims a fill the merged args do not
//       carry.
//   (2) `inlineDefsRefs`'s copy-walk assignment
//       (`src/binder/binder-inference.ts:266`, inside the function declared
//       `:226`), reached from `binderToolParametersSchema` (`:153`) through the
//       exported `buildBinderCompleteCall` (`:374`). The dropped key leaves the
//       model-facing table with `required` naming a property `properties`
//       omits, under `additionalProperties: false` — the malformation 0210
//       removed at the lowering, re-created one seam later.
//   (3) `#emitBinderEchoNote`'s per-field read
//       (`src/extension/production-theta-producer.ts:1003`), a prototype-chain
//       read whose `?? null` arm is written for absence but is never taken for
//       a wire name that names an `Object.prototype` member.
//
// SPEC ANCHORS (each re-derived against the corpus in this tree).
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:9 — fill-if-absent
//     and the `(default)` tagging rule: the merged `args` and the echo's tagging
//     are identical across conforming implementations on identical binder
//     responses. Group (1) is that clause; group (3) is its echo half.
//   - docs/spec_topics/schema-subset.md:8 — the lowered object form's `required`
//     "must list *every* declared property"; :78 fixes the emission form.
//     Group (2) is that clause over the document `buildBinderCompleteCall` puts
//     on the wire.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:19 —
//     `theta/parse/binding-case-mismatch`, the only case rule on the param-name
//     position, admits any name starting with a lowercase letter or `_`. So
//     `__proto__` is an ADMITTED name that needs a behaviour; no cell here
//     expects a refusal (0214 §Fix constraint 3, 0119's settled route).
//
// SITE (2) HAS A SECOND DROP THE `inlineDefsRefs` CONVERSION DOES NOT REACH.
// `Type.Unsafe<unknown>` (`src/binder/binder-inference.ts:382`) rebuilds the
// document it is handed by own-key copy that ASSIGNS, so it drops an own
// `__proto__` key of its own accord — measured directly against `typebox` in
// this tree, with the key defined as an own enumerable property on entry. So
// cell (2a), which asserts the MODEL-FACING table (0214 §Expected behaviour,
// site (2)), stays red until the attachment survives that wrap too, while cell
// (2-SRC) greens on the `binder-inference.ts:266` conversion alone. The two
// together keep site (2) independently witnessable at the write and at the
// observable the spec constrains.
//
// WHAT THIS FILE DOES NOT ASSERT. The post-merge AJV verdict — `validation` and
// `classification` — is NOT asserted for any `__proto__`-named cell (0214 §Fix
// constraint 4). Once site (1) puts the own key into the merged args, AJV
// refuses that payload for bug 0212's reason (`additionalProperties`), a loud
// registered failure that is a disjoint subject; a cell asserting the verdict
// here would red on 0212's fix. The `__proto__` cells of group (1) assert the
// merged `args` and the fill-step report ONLY. The ordinary-name control does
// assert `validation.ok`, because that row is unaffected by 0212.
//
// PRE-FIX BASELINE at 0.144.0 (`fdcb0835`). Every row's failure message names
// its own observation, so a red reads as the symptom 0214 describes:
//   1a     primitive default, own keys / bytes / prototype → args `{"a":"1"}`, own key absent
//   1b     object default                                  → the default became the args' PROTOTYPE
//   1c     ordinary defaulted name                         → CONTROL, green
//   2-SRC  the walk's write shape                         → the plain-assignment form
//   2a     attached model-facing `args` table              → properties `["a"]`, `required` `["a","__proto__"]`
//   2b     ordinary names, attached bytes exactly          → CONTROL, green
//   3-SRC  the production read's shape                     → no own-key guard on the read
//   3a     the echo for an absent `__proto__` field        → RangeError from `renderArgumentEcho`
//   3b     the echo for an absent `toString` field         → the same RangeError

// ===========================================================================
// Shared harness.
// ===========================================================================

/** A content-addressing function deriving a distinct slug per distinct schema. */
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};

/** A real AJV validator (the `V8c` seam), configured exactly as production is. */
function validator(): AjvSchemaValidator {
  return new AjvSchemaValidator({ emit: () => {}, slugOf: jsonSlug });
}

/** A source range for a synthesised `params:` field. */
function range(line: number): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: 2 } };
}

/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * How a record's prototype reads back: the sentinel string for
 * `Object.prototype`, else the prototype's own JSON. The sentinel keeps the
 * failure diff legible — the object-default cell prints the DEFAULT VALUE here
 * at HEAD, which is the whole symptom.
 */
function prototypeReport(target: object): string {
  const proto = Object.getPrototypeOf(target);
  if (proto === Object.prototype) {
    return "Object.prototype";
  }
  if (proto === null) {
    return "null";
  }
  return JSON.stringify(proto);
}

/**
 * One `params:` field as the frontmatter seam hands it to `parseParams`. A
 * `defaultSource` is the default RHS verbatim, so the lowering's own
 * `defaultSource` gate decides `required` exactly as it does in production.
 */
interface Field {
  readonly name: string;
  readonly typeSource: string;
  readonly defaultSource?: string;
}

/**
 * The lowered `params:` document for `fields`, or a loud failure. Every fixture
 * here must lower CLEAN — its parse-cleanliness is half of what makes each drop
 * a defect rather than a refusal (code-registry-parse.md:19 admits a `_`-leading
 * name), so a diagnostic is a harness failure, never a skip.
 */
function loweredParams(fields: readonly Field[], what: string): LoweredSchema {
  const result = parseParams(
    fields.map((field, index) => ({ ...field, range: range(index + 1) })),
    [],
    { file: "bug0214.theta" },
  );
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: ${what}'s \`params:\` block must lower CLEAN; observed ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`,
    );
  }
  if (result.loweredSchema === undefined) {
    throw new Error(
      `harness: \`parseParams\` withheld the lowered schema for ${what} with no error-severity diagnostic — the cell has nothing to drive`,
    );
  }
  return result.loweredSchema;
}

// ===========================================================================
// (1) `fillDefaultsAndRevalidate` — the fill-if-absent write.
// ===========================================================================

/**
 * The compiled validator the production call passes
 * (`production-theta-producer.ts:1318` compiles it, `:1319` passes it). Fails
 * LOUDLY on a compile throw: pre-0210 this document did not compile at all, so a
 * throw here means the group is measuring the compile site rather than the fill
 * write.
 */
function compiledFor(document: LoweredSchema, what: string): CompiledValidator {
  try {
    return validator().compile(document);
  } catch (error) {
    throw new Error(
      `harness: ${what}'s lowered document must COMPILE — group (1) drives the fill step behind that compile (production-theta-producer.ts:1318); observed ${String(error)}`,
    );
  }
}

describe("bug 0214 (1a) — a `__proto__`-named field's primitive default is filled as an own key", () => {
  it("RED (1a): the merged args carry `__proto__` with the declared default, and the report names it", () => {
    // 0214 §Reproduction P2. `params: { a: string, __proto__: string = "x" }`
    // and binder args `{"a":"1"}`: exactly the production call shape
    // (`production-theta-producer.ts:1319`). The AJV `validation` /
    // `classification` verdicts are deliberately NOT asserted here — see this
    // file's header: once the own key lands, AJV refuses the payload for bug
    // 0212's reason, so asserting the verdict would red on 0212's fix (0214
    // §Fix constraint 4).
    const document = loweredParams(
      [
        { name: "a", typeSource: "string" },
        { name: "__proto__", typeSource: "string", defaultSource: '"x"' },
      ],
      "cell 1a",
    );
    const result = fillDefaultsAndRevalidate({
      binderArgs: { a: "1" },
      defaults: [{ wireName: "__proto__", defaultValue: "x" }],
      validator: compiledFor(document, "cell 1a"),
    });

    expect(
      {
        ownKeys: Object.keys(result.args),
        ownProtoKey: hasOwn(result.args, "__proto__"),
        bytes: JSON.stringify(result.args),
        prototype: prototypeReport(result.args),
        defaultedWireNames: [...result.defaultedWireNames],
      },
      'PRIMARY (bug 0214, cell 1a — site (1)): defaulting-system-note-echo.md:9 fixes the merged `args` for a fill-if-absent run, so a declared default on a `__proto__`-named field is an OWN key of the merged args and the record\'s prototype is untouched. HEAD observes `{ownKeys:["a"], ownProtoKey:false, bytes:{"a":"1"}, prototype:"Object.prototype", defaultedWireNames:["__proto__"]}`: `merged[field.wireName] = field.defaultValue` (defaulting.ts:136) hit `Object.prototype`\'s inherited `__proto__` setter, which discards a primitive, while `:137` pushed the name onto the report regardless — the report claims a fill the args do not carry',
    ).toEqual({
      ownKeys: ["a", "__proto__"],
      ownProtoKey: true,
      bytes: '{"a":"1","__proto__":"x"}',
      prototype: "Object.prototype",
      defaultedWireNames: ["__proto__"],
    });
  });
});

describe("bug 0214 (1b) — a `__proto__`-named field's OBJECT default is filled as an own key", () => {
  it("RED (1b): the object default lands under the wire name, not as the merged record's prototype", () => {
    // 0214 §Reproduction P2b. The object arm of the same inherited setter
    // REPLACES the record's prototype, so the default's own fields become
    // `in`-visible under names no schema declares while the wire name stays
    // absent. Verdicts unasserted for the same constraint-4 reason as (1a).
    const document = loweredParams(
      [
        { name: "a", typeSource: "string" },
        { name: "__proto__", typeSource: "{i: integer}", defaultSource: "{i: 1}" },
      ],
      "cell 1b",
    );
    const result = fillDefaultsAndRevalidate({
      binderArgs: { a: "1" },
      defaults: [{ wireName: "__proto__", defaultValue: { i: 1 } }],
      validator: compiledFor(document, "cell 1b"),
    });

    expect(
      {
        ownKeys: Object.keys(result.args),
        ownProtoKey: hasOwn(result.args, "__proto__"),
        ownProtoValue: Object.getOwnPropertyDescriptor(result.args, "__proto__")?.value,
        undeclaredKeyVisible: "i" in result.args,
        prototype: prototypeReport(result.args),
        defaultedWireNames: [...result.defaultedWireNames],
      },
      'PRIMARY (bug 0214, cell 1b — site (1), object default): the filled value is the field\'s own property and the record\'s prototype is `Object.prototype` for an object default exactly as for a primitive one (defaulting-system-note-echo.md:9). HEAD observes `{ownKeys:["a"], ownProtoKey:false, ownProtoValue:undefined, undeclaredKeyVisible:true, prototype:{"i":1}, defaultedWireNames:["__proto__"]}`: the declared default became the merged record\'s PROTOTYPE, so `"i" in args` answers true for a key the author never wrote and the declared field is still absent',
    ).toEqual({
      ownKeys: ["a", "__proto__"],
      ownProtoKey: true,
      ownProtoValue: { i: 1 },
      undeclaredKeyVisible: false,
      prototype: "Object.prototype",
      defaultedWireNames: ["__proto__"],
    });
  });
});

describe("bug 0214 (1c) — the ordinary-name control: an ordinary defaulted field is unmoved", () => {
  it("CONTROL (1c): an ordinary wire name fills, reports, and post-merge-validates exactly as today", () => {
    // 0214 §Reproduction P2c, and the shape the `__proto__` row must take. Green
    // at HEAD and after the fix: `defineRecordField` (`src/runtime/value.ts:596`)
    // over a plain record stringifies identically to an assignment for every
    // ordinary key, which is 0214 §Fix constraint 1 (byte-invariance for every
    // input declaring no such name). This row DOES assert the AJV verdict —
    // bug 0212 does not touch it — so it also pins that the fill step's
    // post-merge validation stays wired.
    const document = loweredParams(
      [
        { name: "a", typeSource: "string" },
        { name: "p", typeSource: "string", defaultSource: '"x"' },
      ],
      "cell 1c",
    );
    const result = fillDefaultsAndRevalidate({
      binderArgs: { a: "1" },
      defaults: [{ wireName: "p", defaultValue: "x" }],
      validator: compiledFor(document, "cell 1c"),
    });

    expect(
      {
        bytes: JSON.stringify(result.args),
        prototype: prototypeReport(result.args),
        defaultedWireNames: [...result.defaultedWireNames],
        validation: result.validation,
        classification: result.classification,
      },
      "CONTROL (bug 0214, cell 1c — site (1)): an ordinary defaulted wire name fills into an own key in declaration order, is reported once, and the merged args pass the post-merge AJV validation (defaulting-system-note-echo.md:9). A red here means the write conversion moved an input that declares no `Object.prototype` member name — 0214 §Fix constraint 1",
    ).toEqual({
      bytes: '{"a":"1","p":"x"}',
      prototype: "Object.prototype",
      defaultedWireNames: ["p"],
      validation: { ok: true },
      classification: { kind: "ok" },
    });
  });
});

// ===========================================================================
// (2) `buildBinderCompleteCall` — the model-facing binder tool parameters.
// ===========================================================================

/**
 * The model-facing `args` table of the binder tool's attached parameters, plus
 * the relaxed table it was derived from, for a `params:` block with no defaults
 * (so `required` names every field).
 *
 * The relaxed table is returned as the CONTROL that localises the drop:
 * `relaxParamsSchema` (`src/binder/binder-envelope.ts:137`) copies by
 * rest-destructuring and spread, both of which DEFINE, so the own key is still
 * present on entry to the walk. A relaxed table that has already lost the key
 * is a harness failure — the cell would then be measuring the envelope builder
 * rather than `inlineDefsRefs`.
 */
function attachedArgsTable(
  fields: readonly Field[],
  what: string,
): { readonly relaxed: Record<string, unknown>; readonly attached: Record<string, unknown> } {
  const envelopeSchema = buildBinderEnvelopeSchema({
    paramsSchema: loweredParams(fields, what),
    defaultedFields: [],
  });
  const relaxed = okArmArgs(envelopeSchema as Record<string, unknown>, `${what}'s envelope`);
  const call = buildBinderCompleteCall({
    model: { api: "anthropic-messages", id: "bug0214" } as unknown as Model<Api>,
    systemPrompt: "You are the binder.",
    envelopeSchema,
    slug: "bug0214",
    seed: 7,
    signal: new AbortController().signal,
    onResponse: (_response: ProviderResponse, _model: Model<Api>) => {},
  });
  const parameters = call.context.tools?.[0]?.parameters as Record<string, unknown> | undefined;
  if (parameters === undefined) {
    throw new Error(
      `harness: ${what} must attach exactly one forced binder tool carrying its parameters (pi-integration-contract/binder-inference.md:5, the one-shot forced structured-output call); observed ${JSON.stringify(call.context.tools)}`,
    );
  }
  const envelope = objectAt(objectAt(parameters, "properties", what), "envelope", what);
  return { relaxed, attached: okArmArgs(envelope, `${what}'s attachment`) };
}

/** An own object-valued member of `node`, or a loud failure. */
function objectAt(node: Record<string, unknown>, key: string, what: string): Record<string, unknown> {
  const value = Object.getOwnPropertyDescriptor(node, key)?.value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `harness: ${what} must carry an object at \`${key}\`; observed ${JSON.stringify(node)}`,
    );
  }
  return value as Record<string, unknown>;
}

/** The `ok` arm's `args` table of an envelope document, or a loud failure. */
function okArmArgs(document: Record<string, unknown>, what: string): Record<string, unknown> {
  const arms = Object.getOwnPropertyDescriptor(document, "anyOf")?.value;
  if (!Array.isArray(arms) || arms.length !== 3) {
    throw new Error(
      `harness: ${what} must be the three-arm \`anyOf\` envelope (binder-bypass-and-envelope.md §"Binder envelope"); observed ${JSON.stringify(document)}`,
    );
  }
  return objectAt(objectAt(arms[0] as Record<string, unknown>, "properties", what), "args", what);
}

/** `src/binder/binder-inference.ts`, read as text (cell (2-SRC) only). */
const BINDER_INFERENCE_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/binder/binder-inference.ts", import.meta.url)),
  "utf8",
);

/**
 * The text of `inlineDefsRefs`'s per-key copy write, located by the `$defs`-skip
 * `continue` that immediately precedes it inside the walk's `Object.entries`
 * loop. Fails LOUDLY when the loop cannot be located: a silent skip would be the
 * failure mode this cell exists to close.
 */
function inlineDefsRefsCopyWrite(): string {
  const loop = /for \(const \[key, value\] of Object\.entries\(source\)\) \{([\s\S]*?)\n  \}/.exec(
    BINDER_INFERENCE_SOURCE,
  );
  if (loop === null) {
    throw new Error(
      "harness: `inlineDefsRefs`'s `for (const [key, value] of Object.entries(source))` copy loop is no longer present in binder-inference.ts — cell (2-SRC) cannot check the write it exists for. Re-anchor the cell against the current source; do not skip it",
    );
  }
  return loop[1] ?? "";
}

describe("bug 0214 (2-SRC) — the inliner's copy walk defines its keys rather than assigning them", () => {
  it("RED (2-SRC): `inlineDefsRefs` writes each copied key through `defineRecordField`", () => {
    // The write half of site (2) stated directly, so the site reds on its own
    // even where the model-facing observable (cell 2a) is also held red by the
    // `Type.Unsafe` wrap named in this file's header. `defineRecordField`
    // (`src/runtime/value.ts:596`) is the landed idiom for a record write keyed
    // by an author-controlled name (0214 §Fix, "The write idiom is settled").
    const write = inlineDefsRefsCopyWrite();
    expect(
      /defineRecordField\(\s*copy,\s*key,/.test(write),
      "PRIMARY (bug 0214, cell 2-SRC — site (2)): `inlineDefsRefs`'s copy walk is keyed by every key of the walked document, including a `properties` table's author-chosen field names, so it must DEFINE each key (`defineRecordField`, src/runtime/value.ts:596) rather than assign it. HEAD spells the assignment, which for `__proto__` invokes the inherited setter and replaces the copy's prototype instead of adding the key",
    ).toBe(true);
    expect(
      /copy\[key\]\s*=/.test(write),
      "PRIMARY (bug 0214, cell 2-SRC — site (2)): the walk must not spell `copy[key] = …` — that assignment is the drop that leaves the model-facing table's `required` naming a property `properties` omits (schema-subset.md:8)",
    ).toBe(false);
  });
});

describe("bug 0214 (2a) — the binder tool's model-facing `args` table keeps a `__proto__` property", () => {
  it("RED (2a): the attached table's `properties` and `required` agree, and its bytes are the relaxed table's", () => {
    // 0214 §Reproduction P3. Two non-defaulted fields, so `required` is
    // `["a","__proto__"]` and the drop leaves `required` naming a property
    // `properties` omits under `additionalProperties: false` — the document is
    // unsatisfiable as written, and it is what the provider is asked to produce
    // a tool call against (schema-subset.md:8).
    const { relaxed, attached } = attachedArgsTable(
      [
        { name: "a", typeSource: "string" },
        { name: "__proto__", typeSource: "string" },
      ],
      "cell 2a",
    );
    const relaxedProperties = objectAt(relaxed, "properties", "cell 2a's relaxed table");
    if (!hasOwn(relaxedProperties, "__proto__")) {
      throw new Error(
        "harness: cell (2a) rests on `relaxParamsSchema` (binder-envelope.ts:137) delivering the own `__proto__` key to the walk — its spread copy DEFINES. Without it the cell would measure the envelope builder, not `inlineDefsRefs`",
      );
    }
    const attachedProperties = objectAt(attached, "properties", "cell 2a's attachment");

    expect(
      {
        propertiesOwnKeys: Object.keys(attachedProperties),
        required: Object.getOwnPropertyDescriptor(attached, "required")?.value,
        propertiesPrototype: prototypeReport(attachedProperties),
      },
      'PRIMARY (bug 0214, cell 2a — site (2)): schema-subset.md:8 requires `required` to list every declared property, so the model-facing table names `__proto__` in BOTH. HEAD observes `{propertiesOwnKeys:["a"], required:["a","__proto__"], propertiesPrototype:"Object.prototype"}`: `copy[key] = inlineDefsRefs(…)` (binder-inference.ts:266) hit the inherited setter, replacing the copy\'s prototype with the field\'s lowered node, and the `Type.Unsafe<unknown>` wrap (`:382`) then walked own keys and discarded even that trace — `required` is the only surviving mention of the field',
    ).toEqual({
      propertiesOwnKeys: ["a", "__proto__"],
      required: ["a", "__proto__"],
      propertiesPrototype: "Object.prototype",
    });

    expect(
      JSON.stringify(attached),
      "PRIMARY (bug 0214, cell 2a — site (2), bytes): the attachment is the relaxed table verbatim except for `$ref` inlining (0214 §Expected behaviour, site (2)); this fixture declares no named type, so the bytes are the relaxed table's own. Converting `inlineDefsRefs` alone does not green this row — `Type.Unsafe<unknown>` (binder-inference.ts:382) drops the own key again, see this file's header",
    ).toBe(
      '{"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"string"}},"required":["a","__proto__"],"additionalProperties":false}',
    );
  });
});

describe("bug 0214 (2b) — the ordinary-name control: the attached bytes are unmoved", () => {
  it("CONTROL (2b): two ordinary field names attach exactly today's bytes", () => {
    // 0214 §Fix constraint 1: byte-invariance for every input that declares no
    // `Object.prototype` member name. The binder tool's parameters are compared
    // byte-exactly by existing witnesses, so this row is the one that reds if
    // the conversion at `inlineDefsRefs` moves an ordinary document — including
    // its key ORDER, which `defineRecordField` preserves because a fresh own
    // key is defined in insertion order exactly as an assignment creates one.
    const { attached } = attachedArgsTable(
      [
        { name: "a", typeSource: "string" },
        { name: "b", typeSource: "string" },
      ],
      "cell 2b",
    );
    expect(
      JSON.stringify(attached),
      "CONTROL (bug 0214, cell 2b — site (2)): the attached model-facing `args` bytes for an ordinary two-field `params:` block are unmoved by site (2)'s conversion (0214 §Fix constraint 1)",
    ).toBe(
      '{"type":"object","properties":{"a":{"type":"string"},"b":{"type":"string"}},"required":["a","b"],"additionalProperties":false}',
    );
  });
});

// ===========================================================================
// (3) `#emitBinderEchoNote`'s per-field read.
//
// WHY THIS GROUP READS PRODUCTION SOURCE AS TEXT. Both production lines are
// private — `#emitBinderEchoNote`
// (`src/extension/production-theta-producer.ts:985`) is a private method and
// `echoTypeFromValue` (`:5973`) is a module-private function — and the enclosing
// method sends a session note through the pi seam, so there is no offline seam
// to either. 0214 §Provenance states the method this file follows (0210's, for
// its two child-spawning loops): reproduce the statements statement-for-statement
// around the SHIPPED `renderArgumentEcho` (`src/render/argument-echo.ts:196`).
//
// A local reproduction alone cannot red on the production line, because the copy
// would re-implement whatever it was written to expect (0210 measured exactly
// that for its own copied loops). So the behavioural cells below run the
// reproduction under the READER SHAPE PRODUCTION CURRENTLY SPELLS, derived from
// the source text: unguarded today (red), own-key-guarded once the fix lands
// (green). Cell (3-SRC) asserts that shape directly, so the group states its
// claim about production both as a shape and as a consequence.
// ===========================================================================

/** `src/extension/production-theta-producer.ts`, read as text (group (3) only). */
const PRODUCTION_PRODUCER_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/extension/production-theta-producer.ts", import.meta.url)),
  "utf8",
);

/**
 * The text of `#emitBinderEchoNote`'s per-field read statement, located by the
 * `const value =` binding inside the `params.fields.map` callback. Fails LOUDLY
 * when the statement cannot be located: a silent skip here would be exactly the
 * failure mode this group exists to close.
 */
function echoReadStatement(): string {
  const match = /const value = [^;]*;/.exec(PRODUCTION_PRODUCER_SOURCE);
  if (match === null) {
    throw new Error(
      "harness: `#emitBinderEchoNote`'s per-field `const value = …;` read statement is no longer present in production-theta-producer.ts — group (3) cannot check the read it exists for. Re-anchor the cell against the current source; do not skip it",
    );
  }
  if (!match[0].includes("mergedArgs")) {
    throw new Error(
      `harness: the first \`const value = …;\` statement in production-theta-producer.ts no longer reads \`mergedArgs\` — group (3)'s anchor has drifted onto another statement (${match[0]}); re-anchor rather than skip`,
    );
  }
  return match[0];
}

/**
 * Whether the production read is own-key guarded. `mergedArgs[name] ?? null`
 * cannot distinguish an absent field from an inherited `Object.prototype`
 * member, so the guarded form is the one the fix installs (the shape bug 0210
 * landed in the respond wire): `Object.prototype.hasOwnProperty.call`.
 */
function productionReadIsOwnKeyGuarded(): boolean {
  return /Object\.prototype\.hasOwnProperty\.call\(\s*mergedArgs/.test(echoReadStatement());
}

/**
 * `#emitBinderEchoNote`'s per-field read, reproduced in both shapes. The
 * unguarded arm is byte-equivalent to `production-theta-producer.ts:1003`; the
 * guarded arm is the corrected read, which answers `null` for an absent field
 * so the echo renders it as `null` (0214 §Expected behaviour, site (3)).
 */
function readMergedField(
  mergedArgs: Readonly<Record<string, unknown>>,
  wireName: string,
  ownKeyGuarded: boolean,
): ThetaValue {
  if (ownKeyGuarded) {
    return (
      Object.prototype.hasOwnProperty.call(mergedArgs, wireName)
        ? mergedArgs[wireName] ?? null
        : null
    ) as ThetaValue;
  }
  return (mergedArgs[wireName] ?? null) as ThetaValue;
}

/**
 * `echoTypeFromValue`'s arms for the two runtime kinds group (3) reaches — the
 * `null` arm (`production-theta-producer.ts:5984`) and the object arm (`:5997`,
 * "render by its own keys in insertion order"), reproduced
 * statement-for-statement. Every other kind fails LOUDLY: this reproduction is
 * a witness for one read, not a second implementation of the derivation.
 */
function echoTypeOfReadValue(value: ThetaValue, what: string): EchoType {
  if (value === null) {
    return { kind: "null" };
  }
  if (typeof value === "object" || typeof value === "function") {
    const fields = Object.entries(value as Record<string, ThetaValue>).map(([name]) => ({
      name,
      type: { kind: "string" } as EchoType,
    }));
    return { kind: "object", fields };
  }
  throw new Error(
    `harness: ${what}'s read produced a ${typeof value}, which no arm of this reproduction covers — the cell would be asserting against a derivation production does not perform`,
  );
}

/**
 * The rendered success echo for one declared field absent from the merged args,
 * driven through the SHIPPED `renderArgumentEcho`. The reader shape is the one
 * production currently spells, so the cell reds while the read is unguarded.
 */
function echoForAbsentField(wireName: string, what: string): string {
  const mergedArgs: Readonly<Record<string, unknown>> = { a: "1" };
  if (hasOwn(mergedArgs, wireName)) {
    throw new Error(
      `harness: ${what} needs \`${wireName}\` ABSENT from the merged args — that absence is the whole input class`,
    );
  }
  const value = readMergedField(mergedArgs, wireName, productionReadIsOwnKeyGuarded());
  return renderArgumentEcho({
    thetaName: "bug0214",
    params: [
      { name: wireName, value, type: echoTypeOfReadValue(value, what), tookDefault: true },
    ],
  });
}

describe("bug 0214 (3-SRC) — the echo's per-field read is own-key guarded", () => {
  it("RED (3-SRC): `#emitBinderEchoNote` reads the merged args by own key, not through the prototype chain", () => {
    // The direct statement of the claim about a private line
    // (`production-theta-producer.ts:1003`), by the method 0214 §Provenance
    // names. The behavioural cells below run a reproduction of this statement,
    // so this cell is what ties them to production.
    expect(
      productionReadIsOwnKeyGuarded(),
      "PRIMARY (bug 0214, cell 3-SRC — site (3)): `#emitBinderEchoNote`'s per-field read must test own-key membership (`Object.prototype.hasOwnProperty.call(mergedArgs, field.wireName)`) before reading, because `mergedArgs[field.wireName] ?? null` never takes its `?? null` absence arm for a wire name that names an `Object.prototype` member — it answers the inherited value instead. HEAD spells the unguarded read, which is what turns an absent field into `Object.prototype` and the success echo into a throw",
    ).toBe(true);
  });
});

describe("bug 0214 (3a) — the success echo renders an absent `__proto__` field as `null`", () => {
  it("RED (3a): `renderArgumentEcho` renders the field rather than raising on a zero-field object", () => {
    // 0214 §Reproduction R2. Site (1) leaves the declared `__proto__` field out
    // of the merged args; the prototype-chain read then answers
    // `Object.prototype`, whose zero own enumerable keys derive an object
    // `EchoType` with no fields, and the shipped renderer raises `RangeError:
    // renderObject: object EchoType carries no fields; the object rule needs a
    // first field` (`src/render/argument-echo.ts:150`) on the success path,
    // after the bind was classified `ok`.
    expect(
      () => echoForAbsentField("__proto__", "cell 3a"),
      "PRIMARY (bug 0214, cell 3a — site (3)): defaulting-system-note-echo.md:9 fixes the success echo for the merged args, and no bind the classifier called `ok` may make the renderer throw. HEAD raises `RangeError: renderObject: object EchoType carries no fields` because the read materialised `Object.prototype`",
    ).not.toThrow();
    expect(
      echoForAbsentField("__proto__", "cell 3a"),
      "PRIMARY (bug 0214, cell 3a — site (3)): an own-key-guarded read takes the `?? null` arm for an absent field, so the echo renders it as `null` with the `(default)` tag the fill-step report carries (defaulting-system-note-echo.md:9)",
    ).toBe("Running /bug0214: __proto__=null (default)");
  });
});

describe("bug 0214 (3b) — the success echo renders an absent `toString` field as `null`", () => {
  it("RED (3b): an `Object.prototype`-member wire name other than `__proto__` renders too", () => {
    // 0214 §Fix "Ordering": site (3)'s observable on `__proto__` depends on site
    // (1) being unfixed, so this row is the one that stays red if (1) lands
    // without (3). The input class is real independently of (1): default
    // recovery is best-effort (`production-theta-producer.ts:1307`–`:1310` —
    // an in-memory theta, an unreadable file, a default that does not re-parse,
    // a default whose evaluation panics), so a declared defaulted field can be
    // absent from the merged args while `required` omits it and the bind
    // classifies `ok`. `toString` is an own enumerable-key-free function on the
    // prototype chain, so the same zero-field object descriptor is derived.
    expect(
      () => echoForAbsentField("toString", "cell 3b"),
      "PRIMARY (bug 0214, cell 3b — site (3)): the read must answer absence for EVERY wire name absent from the merged args, not only for `__proto__`. HEAD answers `Object.prototype.toString` and the renderer raises `RangeError: renderObject: object EchoType carries no fields`",
    ).not.toThrow();
    expect(
      echoForAbsentField("toString", "cell 3b"),
      "PRIMARY (bug 0214, cell 3b — site (3)): the own-key-guarded read renders the absent field as `null`, the same as any other absent field",
    ).toBe("Running /bug0214: toString=null (default)");
  });
});
