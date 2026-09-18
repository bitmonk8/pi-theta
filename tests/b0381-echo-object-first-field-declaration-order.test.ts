// Bug 0381 — the echo's object rule renders the binder MODEL's first-emitted
// key, not the declared first field. `echoTypeFromValue`
// (`src/extension/production-theta-producer.ts:6802`, object arm at `:6832`)
// built `EchoType.fields` from `Object.entries(value)` — the binder model's
// JSON key order — instead of the declaration-ordered lowered `properties`
// record it already held. `renderObject` (`src/render/argument-echo.ts:161`)
// then shows `fields[0]`'s value. So one theta + one bound value used to
// render a DIFFERENT first field depending on the key order the model
// happened to emit — fixed below by ordering `fields` off the lowered
// schema's declaration order instead.
//
// WHY these expectations: the Echo policy pins the DECLARING source order, not
// the value's key order.
//   - docs/spec_topics/binder/defaulting-system-note-echo.md:43 — "'First
//     field' of an object value is the first field listed in the declaring
//     `schema` block's source order"; for a discriminated union "the variant's
//     declared fields are used in the variant's own source order"; for an
//     inline anonymous object "the first field is the leftmost field of the
//     inline type expression as written in the theta source".
//   - BNDR-6g (schema `Cat` declares `name` first → `{Whiskers, …}`),
//     BNDR-6j (inline `{ name, color }` → `{Whiskers, …}`), BNDR-6l (nested)
//     are "Reference renderings (normative; conforming implementations MUST
//     reproduce these exactly)".
// The rendering MUST be declaration-first regardless of the model's key order.
//
// This bug was named and left unfiled by 0092 §Non-goals (field ORDER was that
// fix's explicit non-goal); 0381 is that filing.
//
// TIER: unit, offline, deterministic, provider-free. It drives the production
// `ProductionThetaProducer.runBinder()` through the e2e-s5 rig — the off-session
// `complete()` scripted to a forced ToolCall (bug 0011), a REAL
// `AjvSchemaValidator` in the runtime root (the forced-tool routing validates
// the extracted envelope), and the real `pi.sendMessage` delivery captured on
// the `theta-system-note` channel. The descriptor producer `echoTypeFromValue`
// is module-private, so only the emitter path constructs the descriptor from a
// real lowered schema; a direct-renderer test could not witness the
// order-source defect at its origin. The integration tier buys no reach over a
// scripted envelope (the binder's only contribution is the JSON `args`), and
// the live tier would make a fully determined observable stochastic.
//
// ANTI-VACUITY: every cell asserts the DELIVERED note content by whole-string
// equality AFTER asserting the bind happened (`result.bound === true`) and that
// exactly one note landed on the channel — never on `runBinder` merely
// resolving. A harness that stopped reaching the emitter fails loudly instead
// of passing a zero-note filter.
//
// RED / GREEN at fork 7a513015 (branch lane/nrc): w1, w3, w4 red (the note
// shows the model's first-emitted key's value — `pet={red, …}` / `pet={x, …}`
// — where the spec pins `pet={Whiskers, …}` / `pet={circle, …}`); w2 green (the
// value-key-order-equals-declaration-order control, byte-identical across the
// fix).

import { describe, expect, it } from "vitest";

import { scripted } from "./helpers/scripted-off-session-mock";

import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { parseDoc } from "./helpers/e2e-s1";
import {
  binderProducerWithCapture as producerWithCapture,
  bindAndReadNote as bindAndReadEchoNote,
} from "./helpers/scripted-live-session-harness";
import { ctxDouble } from "./helpers/tool-call-dispatch-harness";

/**
 * Script a ToolCall-bearing binder reply carrying `{ envelope }` in its
 * `arguments`, naming the binder tool production actually attached on the
 * captured call — the bug-0011 forced-tool extraction reads the envelope from
 * the FIRST ToolCall naming the binder tool. The envelope is a JS object
 * literal passed by reference, so the key insertion order written at the call
 * site IS the "model's key order" the bug hinges on.
 */
function scriptEnvelope(envelope: unknown): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}

/** Parse `.theta` source through the production whole-file parser. */
function parse(src: string) {
  const doc = parseDoc(src, "probe.theta");
  const errors = doc.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);
  expect(errors, "the probe theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the probe theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** Compose a single-`pet`-param probe theta from a full `.theta` source. */
function probeTheta(source: string): ThetaCompositionInput {
  const doc = parse(source);
  return {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

/**
 * Drive one scripted `ok` bind over `source` with `args` and return the single
 * delivered `theta-system-note` content. Fails loudly naming the unmet
 * precondition when the bind did not reach the emitter, so a broken harness
 * cannot masquerade as a passing assertion.
 */
async function bindAndReadNote(
  source: string,
  args: Readonly<Record<string, unknown>>,
): Promise<string> {
  scriptEnvelope({ kind: "ok", args });
  const capture = producerWithCapture();
  return bindAndReadEchoNote(capture, {
    theta: probeTheta(source),
    args: "some free-text invocation tail",
    ctx: ctxDouble(),
  });
}

// ===========================================================================
// Fixtures — one `pet` param, four declaration-order sources
// ===========================================================================

/** w1/w2 — an inline anonymous object; the doc's §Reproduction. `name` is the
 * leftmost inline field, so defaulting-system-note-echo.md:43's inline-object
 * clause pins the first field. */
const INLINE_OBJECT_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  pet: {name: string, color: string}",
  "---",
  "@`hi ${pet}`",
  "",
].join("\n");

/** w3 — a schema-typed named object; `Cat` declares `name` first (BNDR-6g). */
const SCHEMA_OBJECT_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  pet: Cat",
  "---",
  "schema Cat { name: string, color: string }",
  "@`hi ${pet}`",
  "",
].join("\n");

/** w4 — a discriminated union; the `Circle` variant declares `kind` first, so
 * defaulting-system-note-echo.md:43's union clause pins `kind` for a value
 * whose shape is `Circle`. */
const UNION_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  pet: Shape",
  "---",
  'schema Circle { kind: "circle", label: string }',
  'schema Square { kind: "square", size: integer }',
  "schema Shape = Circle | Square",
  "@`hi ${pet}`",
  "",
].join("\n");

/** w5 — an ALIAS-named array of objects (`schema Cats = array<Cat>`); the
 * param position lowers to a `{"$ref":"#/$defs/Cats"}` node, so the echo must
 * dereference it before reading `items` to reach `Cat`'s declaration-ordered
 * `properties` for each element. Witnesses the array-arm deref
 * (docs/bugs/0381-echo-object-first-field-model-key-order.md §Fix). The
 * object rule applies recursively into an array element per
 * defaulting-system-note-echo.md:43 ("applies recursively wherever the object
 * rule reaches: … an array element …"). `Cat` declares `name` first. */
const ALIAS_ARRAY_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  pets: Cats",
  "---",
  // The alias declaration precedes the object schema so the statement
  // adjacent to the `@` body is `Cat` (closing `}`), not the array alias
  // closing `>` — a `>`-terminated alias directly above a `@` continuation
  // head is read as one continued statement and discards the query result;
  // ordering the object schema last keeps the fixture a clean parse.
  "schema Cats = array<Cat>",
  "schema Cat { name: string, color: string }",
  "@`hi ${pets}`",
  "",
].join("\n");

/** w6 — a nested object field (BNDR-6l normative row): `Person` declares `pet`
 * first, `Cat` declares `name` first, so the outer object rule picks `pet`
 * (rendered recursively as the nested object `{Whiskers, …}`) and the inner
 * object rule picks `name`. Locks the BNDR-6l reference rendering across the
 * declaration-order derivation. */
const NESTED_OBJECT_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  owner: Person",
  "---",
  "schema Cat { name: string, color: string }",
  "schema Person { pet: Cat, label: string }",
  "@`hi ${owner}`",
  "",
].join("\n");

describe("bug 0381 — the echo's object first field follows declaration order, not the model's key order", () => {
  it("w1: an inline anonymous object rendered color-first by the model still echoes the declared leftmost field (name)", async () => {
    // §Reproduction: the model emits `color` before `name`.
    // defaulting-system-note-echo.md:43 inline-object
    // clause + BNDR-6j pin the leftmost inline field (`name`). RED at fork:
    // renders `pet={red, …}` (the model's first-emitted key).
    const content = await bindAndReadNote(INLINE_OBJECT_THETA, {
      pet: { color: "red", name: "Whiskers" },
    });
    expect(content).toBe("Running /probe: pet={Whiskers, …}");
  });

  it("w2 (control): the same theta with name-first model order echoes name — byte-identical across the fix", async () => {
    // The value-key-order-equals-declaration-order control: the model emits
    // `name` first, so value key order already agrees with declaration order.
    // Green on both trees; it holds the fix honest (a fix that reorders by
    // declaration order must not perturb this).
    const content = await bindAndReadNote(INLINE_OBJECT_THETA, {
      pet: { name: "Whiskers", color: "red" },
    });
    expect(content).toBe("Running /probe: pet={Whiskers, …}");
  });

  it("w3: a schema-typed named object rendered color-first still echoes the schema's first field (name)", async () => {
    // BNDR-6g: `Cat` declares `name` first. The model emits `color` first. The
    // lowered `properties` record is declaration-ordered and in hand at the
    // derivation site. RED at fork: renders `pet={red, …}`.
    const content = await bindAndReadNote(SCHEMA_OBJECT_THETA, {
      pet: { color: "red", name: "Whiskers" },
    });
    expect(content).toBe("Running /probe: pet={Whiskers, …}");
  });

  it("w4: a discriminated-union value echoes the matching variant's declared first field (kind)", async () => {
    // §Fix's discriminated-union clause: the variant is resolved per value, and
    // the variant's own source order governs. The value is a `Circle`, which
    // declares `kind` first; the model emits `label` first. RED at fork:
    // renders `pet={x, …}` (the model's first-emitted key). Post-fix: the
    // lowered `anyOf` branch matching the value supplies `kind` first.
    const content = await bindAndReadNote(UNION_THETA, {
      pet: { label: "x", kind: "circle" },
    });
    expect(content).toBe("Running /probe: pet={circle, …}");
  });

  it("w5: an alias-named array of objects echoes each element's declared first field after dereferencing the array's `$ref`", async () => {
    // The object rule applies recursively into an array element
    // (defaulting-system-note-echo.md:43: "applies recursively wherever the
    // object rule reaches: … an array element …"). The `Cats` alias lowers
    // the param to a `$ref`, so `items` is only reachable behind the deref;
    // `Cat` declares `name` first and the model emits `color` first. RED
    // without the array-arm deref: renders `pets=[{red, …}]` (items read off
    // the raw `$ref` is undefined, so the element falls back to model key
    // order). GREEN with the deref: `pets=[{Whiskers, …}]`.
    const content = await bindAndReadNote(ALIAS_ARRAY_THETA, {
      pets: [{ color: "red", name: "Whiskers" }],
    });
    expect(content).toBe("Running /probe: pets=[{Whiskers, …}]");
  });

  it("w6: a nested object field echoes the outer schema's first field rendered as the inner object's first field (BNDR-6l)", async () => {
    // BNDR-6l normative row: `Person` declares `pet` first (a `Cat`), `Cat`
    // declares `name` first. The model emits `label` first at the outer
    // object and `color` first at the inner one; declaration order governs
    // both, so the outer first field `pet` renders as the nested object
    // `{Whiskers, …}` and the whole value renders `{{Whiskers, …}, …}`.
    const content = await bindAndReadNote(NESTED_OBJECT_THETA, {
      owner: { label: "L", pet: { color: "red", name: "Whiskers" } },
    });
    expect(content).toBe("Running /probe: owner={{Whiskers, …}, …}");
  });
});
