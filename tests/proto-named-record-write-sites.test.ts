import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyBinderBypass,
  classifyBinderBypass,
  type BinderBypassDecision,
} from "../src/binder/binder-envelope";
import { bindParamsInbound } from "../src/runtime/inbound-boundary";
import { renderSystemPrompt } from "../src/parser/system-interpolation";
import { marshalParams, type ParamsMarshalDeps } from "../src/runtime/subagent-params";
import { respondPayloadFromWire } from "../src/runtime/respond-tool-wire";
import {
  buildBodyTypeSchemas,
  lowerObjectFields,
  lowerTypeSource,
  type LowerableSchema,
} from "../src/parser/body-type-lowering";
import { hoistInlineObjectType, parseParams, type LowerCtx } from "../src/parser/params";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlugFn,
} from "../src/seams/schema-validator";
import type { SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import { defineRecordField, type ThetaValue } from "../src/runtime/value";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0210 — the five record-write sites bug 0119's six-site fix left outside its
// scope. Every one is the same idiom: a plain `{}` record and an ASSIGNMENT keyed
// by an author-controlled string. `__proto__` is not an ordinary string key on a
// plain object — it is an accessor inherited from `Object.prototype` — so the
// assignment invokes that setter: a no-op for a primitive value, a prototype
// replacement for an object one, never an own property. The respond wire adds a
// second half of the same shape: its `key in result` guard is a PROTOTYPE-CHAIN
// test, so a declared field named after an `Object.prototype` member passes it
// even when the model sent no such field, and the assignment materialises the
// inherited function as an own data property
// (docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md).
//
// THE FIVE SITES, cited BY SYMBOL (0210 §Provenance re-located every one by
// symbol because 0119's line anchors had drifted; this file follows that rule so
// its citations survive the fix's own edits):
//   (a1) `spawnSubagentConversation`'s `system:`-render params record
//        (`src/extension/production-theta-producer.ts`), handed to
//        `renderSystemPrompt` (`src/parser/system-interpolation.ts`).
//   (a2) the same method's `paramValues` marshalling record, handed to
//        `marshalParams` (`src/runtime/subagent-params.ts`).
//   (b)  `coerceNode`'s object arm (`src/runtime/respond-tool-wire.ts`), reached
//        in production through `coerceRespondWireArguments` /
//        `respondPayloadFromWire`.
//   (c1) `lowerObjectFields` (`src/parser/body-type-lowering.ts`).
//   (c2) `parseParams` (`src/parser/params.ts`).
//   (c3) `hoistInlineObjectType` (`src/parser/params.ts`).
//
// SPEC ANCHORS (each re-derived against the corpus in this tree).
//   - docs/spec_topics/schema-subset.md:8 — the lowered object form's `required`
//     "must list *every* declared property"; :78 fixes the emission as
//     `{"type":"object","properties":{…wire names…},"required":[…every wire
//     name…],"additionalProperties":false}`. The three (c) sites emit a document
//     whose `required` names a property `properties` omits, so groups (C) assert
//     the two agree AND assert the emitted bytes.
//   - docs/spec_topics/pi-integration-contract/subagent.md:34 — the child's
//     system prompt is "the resolved-and-interpolated frontmatter `system:`";
//     :79 repeats that the value is that text "after `${param}` interpolation".
//     Cell (A1) is that clause over a param named `__proto__`.
//   - docs/spec_topics/pi-integration-contract/subagent.md:93 (PIC-60) — the
//     runtime "MUST marshal them structurally as canonical JSON per the theta's
//     `params:` schema". Cells (A2*) are that clause: a param the parent bound is
//     in the marshalled JSON.
//   - docs/spec_topics/query/query-failure-and-repair.md:78 (QRY-22) — no value
//     is bound that has not been validated against its declared schema, and the
//     respond wire's own header states the shim "only ever repairs the encoding,
//     never the shape". A fabricated own key whose value is a host JS function is
//     a shape change; group (B) is that clause.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:19 —
//     `theta/parse/binding-case-mismatch`, the only case rule on the field-name
//     and param-name positions, admits any name starting with a lowercase letter
//     or `_`. `__proto__` is therefore an ADMITTED name that needs a behaviour;
//     no cell here expects a refusal (0210 §Non-goals: no field-name refusal is
//     proposed, 0119 settled that the name survives).
//
// WHY GROUP (A) COPIES TWO LOOPS. Both (a1) and (a2) sit inside
// `spawnSubagentConversation`, which LAUNCHES A CHILD PROCESS; there is no
// offline reach to either loop through an exported seam. 0210 §Provenance
// measured them the only way an offline witness can: the production UPSTREAM
// (`classifyBinderBypass` → `applyBinderBypass` → `bindParamsInbound`) and the
// production DOWNSTREAM (`renderSystemPrompt`, `marshalParams`) around a copy of
// the two two-line loops, reproduced statement-for-statement (not byte-for-byte —
// the quoted blocks below omit each loop's `defineRecordField` WHY comment).
// This file does the same, and the copies are what let cells (A1)/(A2) run
// offline and drive the real `renderSystemPrompt` / `marshalParams` downstream.
// The copies do NOT, by themselves, red on a production-loop regression: 0210
// round-1 review measured that reverting EITHER production loop to a plain
// assignment leaves every OTHER cell in this file green, because the copies
// re-implement the fix rather than reading it (0210 round-2 review proved cell
// (A-SRC) itself reds on either direction, hash-exact restores). Cell (A-SRC) below is what puts
// a regression at (a1)/(a2) red in the default (offline) gate, by reading
// `production-theta-producer.ts` as text; the Phase-4 live H8a cell remains the
// end-to-end behavioural witness that the real (unsynced) loops behave.
//
// OUT OF SCOPE, per 0210 §Non-goals, and asserted about NOWHERE here:
//   - The single-string bypass runs no AJV validation
//     (binder-bypass-and-envelope.md:11's "safety net" sentence is unsatisfied at
//     HEAD). That gap is what makes group (A) reachable; it is not this fix's
//     subject.
//   - AJV's own `required` / `properties` checks read the DATA's prototype chain,
//     so a declared field named after an `Object.prototype` member is
//     mis-verdicted independently of site (b) — an `ownProperties` question of
//     the validator seam. Where a cell here asserts a validator verdict at all it
//     asserts exactly the MEASURED verdict and says so on the spot.
//   - `tests/ctor-proto-named-field.test.ts` (0119's 26-cell witness) states
//     these five sites out of its scope and asserts nothing about them; nothing
//     here restates any of its cells.
//
// PRE-FIX BASELINE, at 0.132.0. Every row's failure message names its own
// observation, so a red reads as the symptom 0210 describes:
//   A0   the reach                                  → CONTROL, green (the key binds)
//   A1   renderSystemPrompt over the (a1) record     → "intro [object Object] outro\n"
//   A2   marshalParams over the (a2) record          → PI_THETA_PARAMS `{}`
//   A2b  the same, `__proto__` beside two ordinary fields → `{"a":"1","b":"2"}`
//   A2c  ordinary fields only                        → CONTROL, green (key order unmoved)
//   B1   respondPayloadFromWire, declared `constructor` → own keys ["a","constructor"]
//   B2   the seven-name sweep                        → the own key is forged in every row
//   B3   declared `b` (control)                      → green (own keys ["a"], repair intact)
//   B4   an own `__proto__` in the properties table   → the payload's prototype is replaced
//   C1   lowerObjectFields                           → properties own keys ["a"], prototype is the node
//   C2   parseParams                                 → the same, from a `params:` block
//   C3   hoistInlineObjectType                       → the same, in the retained `$defs` fragment
//   C4   parseThetaDocument + buildBodyTypeSchemas + compile → THREW `schema is invalid: …`
//   C2-AJV  parseParams + compile (nested in describe "(C2)", cell "C2, AJV") → THREW `schema is invalid: …`
//   C6   the sibling-name control (`b`)              → CONTROL, green (compile OK, two verdicts)
//   A-SRC the two production loops                   → spell the assignment form

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

/** The `properties` table of a lowered object document, or a loud failure. */
function propertiesOf(document: Record<string, unknown>, what: string): object {
  const properties = Object.getOwnPropertyDescriptor(document, "properties")?.value;
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error(
      `harness: ${what} must emit an object \`properties\` table (schema-subset.md:78); observed ${JSON.stringify(document)}`,
    );
  }
  return properties as object;
}

/**
 * `required` as a string list, or a loud failure. Groups (C) compare it against
 * the table's own keys, so a missing or mis-shaped `required` is a harness
 * failure rather than a silently-passing empty comparison.
 */
function requiredOf(document: Record<string, unknown>, what: string): readonly string[] {
  const required = Object.getOwnPropertyDescriptor(document, "required")?.value;
  if (!Array.isArray(required) || required.some((name) => typeof name !== "string")) {
    throw new Error(
      `harness: ${what} must emit a string-list \`required\` (schema-subset.md:78); observed ${JSON.stringify(document)}`,
    );
  }
  return required as readonly string[];
}

/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * How a properties table's prototype reads back: the sentinel string for
 * `Object.prototype`, else the prototype's own JSON. The sentinel keeps the
 * failure diff legible — at HEAD these cells print the FIELD'S OWN LOWERED
 * SCHEMA NODE, which is the whole symptom.
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

// ===========================================================================
// (A) Sites (a1) / (a2) — the two `params:` records, through the REAL bypass →
// `bindParamsInbound` chain and into the REAL `renderSystemPrompt` /
// `marshalParams`.
// ===========================================================================

/** 0210 §Reproduction's site-(a) fixture, verbatim. */
const FIXTURE_A =
  "---\n" +
  "mode: subagent\n" +
  "system: |\n" +
  "  intro ${__proto__} outro\n" +
  "params:\n" +
  "  __proto__: string\n" +
  "---\n" +
  "@`hi`\n";

/** The slash arguments the reproduction invokes with (untrimmed). */
const SLASH_ARGUMENTS = "  hello  ";

/** The parse-clean document group (A) drives, or a loud failure. */
function fixtureADocument(): ThetaDocument {
  const doc = parseDoc(FIXTURE_A, "/theta/bug0210.theta");
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: 0210 §Reproduction's site-(a) fixture must load CLEAN — its parse-cleanliness is half of what makes the drop a defect. Observed ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`,
    );
  }
  return doc;
}

/**
 * The production reach: classify the `params:` block, apply the bypass to the
 * slash text, and project the resulting args through the inbound boundary — the
 * three shipped functions `production-theta-producer.ts` and
 * `theta-composition-producer.ts` run in that order before either record loop.
 * Fails LOUDLY when the bypass is not taken: a `binder` decision would route
 * through the AJV compile site (c) makes throw, so the whole group would be
 * measuring something else.
 */
function reachA(): {
  readonly decision: BinderBypassDecision;
  readonly args: Readonly<Record<string, unknown>>;
  readonly bindings: ReadonlyMap<string, ThetaValue>;
} {
  const doc = fixtureADocument();
  const decision = classifyBinderBypass(doc.frontmatter?.params?.fields);
  if (decision.kind !== "single-string-bypass") {
    throw new Error(
      `harness: 0210's site-(a) reach requires the SINGLE-STRING BYPASS (binder-bypass-and-envelope.md:11) — the binder arm compiles the lowered document, which site (c) makes throw. Observed decision ${JSON.stringify(decision)}`,
    );
  }
  const applied = applyBinderBypass({ decision, slashArguments: SLASH_ARGUMENTS });
  const bindings = bindParamsInbound({
    params: applied.args,
    lowered: doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined,
    body: doc.body,
  });
  return { decision, args: applied.args, bindings };
}

/**
 * Site (a1)'s record loop, copied statement-for-statement from
 * `spawnSubagentConversation`'s `system:`-render block in
 * `src/extension/production-theta-producer.ts` (bug 0210 §Fix) — the block
 * below omits the production loop's own `defineRecordField` WHY comment, so
 * the two are not byte-identical:
 *
 *     const params: Record<string, ThetaValue> = {};
 *     if (bindInput.paramBindings !== undefined) {
 *       for (const [name, value] of bindInput.paramBindings) {
 *         defineRecordField(params, name, value);
 *       }
 *     }
 *
 * Copied because the loop sits inside the method that launches the child
 * process (see this file's header). The `undefined` guard is the caller's and is
 * expressed by this function's parameter being non-optional. A regression in
 * the real loop above does not turn this copy red — cell (A-SRC), below,
 * checks the real loop by reading its source text.
 */
function systemRenderParamsRecord(
  paramBindings: ReadonlyMap<string, ThetaValue>,
): Record<string, ThetaValue> {
  const params: Record<string, ThetaValue> = {};
  for (const [name, value] of paramBindings) {
    defineRecordField(params, name, value);
  }
  return params;
}

/**
 * Site (a2)'s record loop, copied statement-for-statement from the
 * `paramValues` block of the same method (bug 0210 §Fix) — again omitting that
 * loop's own `defineRecordField` WHY comment:
 *
 *     const paramValues: Record<string, unknown> = {};
 *     if (bindInput.paramBindings !== undefined) {
 *       for (const [name, value] of bindInput.paramBindings) {
 *         defineRecordField(paramValues, name, value);
 *       }
 *     }
 *
 * A SECOND copy rather than a shared helper: the two production loops are
 * separately written. Neither copy reds on its own production loop
 * regressing — cell (A-SRC), below, is what does.
 */
function marshalParamsRecord(
  paramBindings: ReadonlyMap<string, ThetaValue>,
): Record<string, unknown> {
  const paramValues: Record<string, unknown> = {};
  for (const [name, value] of paramBindings) {
    defineRecordField(paramValues, name, value);
  }
  return paramValues;
}

/** Marshal deps whose temp-file channel raises: every payload here is tiny. */
const MARSHAL_DEPS: ParamsMarshalDeps = {
  writeTempFile: (contents: string): string => {
    throw new Error(
      `harness: these params are far below SUBAGENT_PARAMS_THRESHOLD_BYTES, so PIC-60's ENV channel must be chosen; the file channel was taken for ${JSON.stringify(contents)}`,
    );
  },
  unlink: (): void => {},
};

/** The `PI_THETA_PARAMS` value `marshalParams` puts on the child env patch. */
function marshalledInlineParams(record: Record<string, unknown>): unknown {
  return marshalParams(record, MARSHAL_DEPS).env["PI_THETA_PARAMS"];
}

// ===========================================================================
// (A-SRC) The source-sync cell. WHY this cell exists: (a1) and (a2) sit inside
// `spawnSubagentConversation`, a method that launches a child process, so there
// is no offline seam to the real loops — cells (A1)/(A2) above drive local
// copies instead (`systemRenderParamsRecord` / `marshalParamsRecord`). 0210
// round-1 review measured the consequence: reverting EITHER real production
// loop to a plain assignment (`params[name] = value` / `paramValues[name] =
// value`) leaves every OTHER cell in this file GREEN, because the copies
// re-implement the fix rather than reading it (0210 round-2 review proved this
// cell itself reds on either direction, hash-exact restores). This cell reads
// `production-theta-producer.ts` AS TEXT and asserts each loop still spells
// `defineRecordField`, which is what makes a production-loop regression at
// (a1)/(a2) red in the default (offline) gate; the Phase-4 live H8a cell
// remains the end-to-end behavioural witness that the real loops behave.
// ===========================================================================

/** `src/extension/production-theta-producer.ts`, read as text (cell A-SRC only). */
const PRODUCTION_PRODUCER_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/extension/production-theta-producer.ts", import.meta.url)),
  "utf8",
);

/**
 * The text of one `bindInput.paramBindings` loop in
 * `production-theta-producer.ts`, located by an ENCLOSING anchor string —
 * never a line number, per this file's citation rule — and confirmed by the
 * call it feeds shortly afterward, so a coincidentally similar loop elsewhere
 * cannot be mistaken for the one under test. Fails LOUDLY, naming the exact
 * anchor and file, when either is not found: a silent skip here would be
 * exactly the failure mode this cell exists to close.
 */
function productionLoopText(anchor: string, what: string, feedsCall: string): string {
  const start = PRODUCTION_PRODUCER_SOURCE.indexOf(anchor);
  if (start === -1) {
    throw new Error(
      `harness: production-theta-producer.ts no longer contains the anchor ${JSON.stringify(anchor)} for ${what} — cell (A-SRC) cannot locate the loop it must check without it. Re-anchor the cell against the current source; do not skip it`,
    );
  }
  const window = PRODUCTION_PRODUCER_SOURCE.slice(start, start + 600);
  const feedIndex = window.indexOf(feedsCall);
  if (feedIndex === -1) {
    throw new Error(
      `harness: the loop at anchor ${JSON.stringify(anchor)} in production-theta-producer.ts no longer feeds ${JSON.stringify(feedsCall)} within the expected span — ${what} may have moved or been restructured; re-anchor rather than skip`,
    );
  }
  return window.slice(0, feedIndex);
}

describe("bug 0210 (A-SRC) — the two production loops still `defineRecordField`, not an assignment", () => {
  it("RED (A-SRC): sites (a1) and (a2) spell `defineRecordField(…)`, never `x[name] = …`", () => {
    const site1 = productionLoopText(
      "const params: Record<string, ThetaValue> = {};",
      "site (a1)'s `system:`-render loop",
      "renderSystemPrompt({ template: systemTemplate, params })",
    );
    expect(
      site1.includes("defineRecordField(params, name, value)"),
      "PRIMARY (bug 0210, cell A-SRC — site (a1) source): `spawnSubagentConversation`'s `system:`-render loop, the one feeding `renderSystemPrompt`, must call `defineRecordField(params, name, value)`. Cells (A1)/(A2) above drive only a LOCAL COPY of this loop (this file's header, WHY GROUP (A) and §A-SRC), so this real-source check is what a production regression here reds against",
    ).toBe(true);
    expect(
      site1.includes("params[name] ="),
      "PRIMARY (bug 0210, cell A-SRC — site (a1) source): the loop must not have reverted to the plain-assignment form `params[name] = value` — that assignment reaching `Object.prototype`'s inherited `__proto__` setter is exactly the write bug 0210 reports",
    ).toBe(false);

    const site2 = productionLoopText(
      "const paramValues: Record<string, unknown> = {};",
      "site (a2)'s `paramValues` marshalling loop",
      "marshalParams(paramValues,",
    );
    expect(
      site2.includes("defineRecordField(paramValues, name, value)"),
      "PRIMARY (bug 0210, cell A-SRC — site (a2) source): the same method's `paramValues` loop, the one feeding `marshalParams`, must call `defineRecordField(paramValues, name, value)`, for the identical reason",
    ).toBe(true);
    expect(
      site2.includes("paramValues[name] ="),
      "PRIMARY (bug 0210, cell A-SRC — site (a2) source): the loop must not have reverted to `paramValues[name] = value`",
    ).toBe(false);
  });
});

describe("bug 0210 (A0) — the reach: a `__proto__` param loads, bypasses the binder, and binds", () => {
  it("CONTROL (A0): the fixture loads clean, takes the bypass, and binds the key", () => {
    // 0210 §Reproduction A0, verbatim. Green at HEAD and after the fix: the
    // computed-key object literal in `applyBinderBypass` DEFINES the key rather
    // than assigning it, and bug 0173 null-prototyped the inbound rebuild, so the
    // key survives all the way into `paramBindings`. This cell is the precondition
    // every other (A) cell rests on — without it a red below could mean "the key
    // never got that far" instead of "the record write dropped it".
    const { decision, args, bindings } = reachA();
    expect(
      decision,
      "CONTROL (bug 0210, cell A0): a one-field non-defaulted `string` `params:` block is `single-string-bypass` (binder-bypass-and-envelope.md:11), which is what keeps site (c)'s compile throw out of this group's way",
    ).toEqual({ kind: "single-string-bypass", wireName: "__proto__" });
    expect(
      hasOwn(args as object, "__proto__"),
      "CONTROL (bug 0210, cell A0): `applyBinderBypass` builds its args with a computed-key object literal, which DEFINES an own property — so the name is still own here and the loss happens later",
    ).toBe(true);
    expect(
      [...bindings.keys()],
      "CONTROL (bug 0210, cell A0): `bindParamsInbound`'s `Object.entries` walk carries the key into the `Map` the two record loops iterate",
    ).toEqual(["__proto__"]);
    expect(
      bindings.get("__proto__"),
      "CONTROL (bug 0210, cell A0): the bound value is the trimmed slash-argument string — the value the child's `system:` render and its marshalled params must both carry",
    ).toBe("hello");
  });
});

describe("bug 0210 (A1) — the `system:`-render record delivers the param to the child prompt", () => {
  it("RED (A1): `renderSystemPrompt` resolves `${__proto__}` to the bound param", () => {
    // subagent.md:34 / :79 — the child's system prompt is the frontmatter
    // `system:` text after `${param}` interpolation. The template is the parsed
    // frontmatter's and the renderer is the production one; only the record
    // between them is the copy.
    const { bindings } = reachA();
    const template = fixtureADocument().frontmatter?.system;
    if (template === undefined) {
      throw new Error(
        "harness: cell (A1) needs the fixture's parsed `system:` template — without it nothing is rendered and the cell asserts nothing",
      );
    }
    const record = systemRenderParamsRecord(bindings);
    expect(
      renderSystemPrompt({ template, params: record }),
      'PRIMARY (bug 0210, cell A1 — site (a1)): subagent.md:34 installs "the resolved-and-interpolated frontmatter `system:`" as the child\'s system prompt and :79 fixes the value as that text after `${param}` interpolation, so a bound param named `__proto__` renders "intro hello outro\\n". HEAD reports `ok: true` with "intro [object Object] outro\\n": `params[name] = value` reached `Object.prototype`\'s inherited `__proto__` setter, the record came out empty, and the interpolation resolved `Object.prototype` itself and stringified it',
    ).toEqual({ ok: true, text: "intro hello outro\n" });
  });

  it("RED (A1, the record): the record carries the param as an own key", () => {
    // The proximate observable of the same write, independent of the renderer:
    // §Fix's remedy for this site is `defineRecordField` (`src/runtime/value.ts`),
    // whose descriptor is byte-identical to an assignment's.
    const record = systemRenderParamsRecord(reachA().bindings);
    expect(
      Object.keys(record),
      'PRIMARY (bug 0210, cell A1 — site (a1)\'s record): the `system:`-render record must carry every bound param as an own key. HEAD observes []',
    ).toEqual(["__proto__"]);
    expect(
      Object.getOwnPropertyDescriptor(record, "__proto__"),
      "bug 0210 §Fix (site a1): `defineRecordField` writes `{ value, enumerable: true, writable: true, configurable: true }`, byte-identical to the assignment it replaces",
    ).toEqual({ value: "hello", writable: true, enumerable: true, configurable: true });
  });
});

describe("bug 0210 (A2) — the marshalling record reaches the child as canonical JSON", () => {
  it("RED (A2): `marshalParams` carries the bound param on `PI_THETA_PARAMS`", () => {
    // PIC-60 (subagent.md:93): the runtime "MUST marshal them structurally as
    // canonical JSON per the theta's `params:` schema". A param the parent bound
    // is in that JSON.
    const record = marshalParamsRecord(reachA().bindings);
    expect(
      marshalledInlineParams(record),
      'PRIMARY (bug 0210, cell A2 — site (a2)): PIC-60 (subagent.md:93) requires the parent to marshal the bound params as canonical JSON, so this is `{"__proto__":"hello"}`. HEAD carries `{}`: `paramValues[name] = value` hit the inherited accessor, the record came out empty, and `canonicalizeParamsJson` canonicalised nothing. The child then binds no param at all',
    ).toBe('{"__proto__":"hello"}');
  });

  it("RED (A2b, key order): a `__proto__` param joins two ordinary ones in canonical key order", () => {
    // 0210 §Fix's constraint on this site: the canonical JSON must GAIN the field
    // under its own name AND leave key order unchanged for every other field.
    // `canonicalizeParamsJson` sorts own keys ascending, and `_` (0x5F) sorts
    // before `a` (0x61), so the field leads.
    //
    // The map is built directly rather than through `reachA`: a THREE-field
    // `params:` block is not bypass-eligible (`classifyBinderBypass` admits one
    // non-defaulted `string` field only), and the binder arm compiles the lowered
    // document, which site (c) makes throw at HEAD. The map's contents are still
    // exactly what `bindParamsInbound` produces — a `Map` of name → `ThetaValue`.
    const bindings = new Map<string, ThetaValue>([
      ["__proto__", "hello"],
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(
      marshalledInlineParams(marshalParamsRecord(bindings)),
      'PRIMARY (bug 0210, cell A2b — site (a2)): the marshalled JSON gains the `__proto__` field under its own name and the two ordinary fields keep their canonical (ascending) positions, so this is `{"__proto__":"hello","a":"1","b":"2"}`. HEAD drops the field and carries `{"a":"1","b":"2"}`',
    ).toBe('{"__proto__":"hello","a":"1","b":"2"}');
  });

  it("CONTROL (A2c): a record with no `__proto__` field marshals byte-identically", () => {
    // The non-extent of the (a2) remedy: `defineRecordField` leaves an ordinary
    // key's descriptor and its insertion position exactly where an assignment
    // put them, so the canonical bytes of every other params record are unmoved.
    // Green on both sides.
    const bindings = new Map<string, ThetaValue>([
      ["a", "1"],
      ["b", "2"],
    ]);
    expect(
      marshalledInlineParams(marshalParamsRecord(bindings)),
      "CONTROL (bug 0210, cell A2c): PIC-60's canonical bytes for a record declaring no `__proto__` field are unchanged by the fix",
    ).toBe('{"a":"1","b":"2"}');
  });
});

// ===========================================================================
// (B) Site (b) — the respond wire's `in` guard and its assigning write.
// ===========================================================================

/** A closed object-root response document declaring `<name>` and `a`, both required. */
function respondSchema(name: string, node: Record<string, unknown>): LoweredSchema {
  return {
    type: "object",
    properties: { [name]: node, a: { type: "string" } },
    required: [name, "a"],
    additionalProperties: false,
  } as LoweredSchema;
}

/**
 * The model's wire payload, built with `JSON.parse` exactly as the host builds
 * it from the tool call's `arguments` bytes — the only construction that can
 * mint an own `__proto__` key, and the one 0210 §Reproduction used.
 */
function modelPayload(json: string): unknown {
  return JSON.parse(json);
}

/** The coerced payload as an object, or a loud failure. */
function payloadObject(payload: unknown, what: string): object {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(
      `harness: ${what} must coerce to an OBJECT payload (the root is an object root, registered verbatim by \`respondToolWireSchema\`); observed ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

/** The seven `Object.prototype` member names 0210 §Reproduction sweeps. */
const PROTOTYPE_MEMBER_NAMES = [
  "constructor",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
] as const;

describe("bug 0210 (B) — the respond wire returns the properties the model sent, and no others", () => {
  it("RED (B1): a declared `constructor` the model omitted is NOT fabricated", () => {
    // 0210 §Reproduction B5, through the shipped entry point. QRY-22
    // (query-failure-and-repair.md:78) binds only what was validated against the
    // declared schema, and the module's own header states the shim "only ever
    // repairs the encoding, never the shape" — so the object handed to validation
    // carries exactly the properties the model sent.
    const payload = payloadObject(
      respondPayloadFromWire(
        respondSchema("constructor", { type: "string" }),
        modelPayload('{"a":"x"}'),
      ),
      "cell B1",
    );
    expect(
      Object.keys(payload),
      'PRIMARY (bug 0210, cell B1 — site (b)): the payload\'s own keys are exactly what the model sent, ["a"]. HEAD observes ["a","constructor"]: `coerceNode` guards each declared property with `!(key in result)` — a PROTOTYPE-CHAIN test — so an omitted field named after an `Object.prototype` member passes the guard, the read answers the inherited function, and `result[key] = …` makes it an own property',
    ).toEqual(["a"]);
    expect(
      hasOwn(payload, "constructor"),
      "PRIMARY (bug 0210, cell B1 — site (b)): the fabricated key is a SHAPE change, which the module's stated contract (it \"only ever repairs the encoding, never the shape\") forbids; at HEAD its value is the host `Object` constructor function",
    ).toBe(false);
  });

  it("RED (B2, sweep): no `Object.prototype` member name is fabricated", () => {
    // The name is not special: every member of `Object.prototype` passes the same
    // `in` guard. The sweep runs the seven names 0210 §Reproduction measured, so
    // a fix that special-cased one name reds here.
    const observed = PROTOTYPE_MEMBER_NAMES.map((name) => {
      const payload = payloadObject(
        respondPayloadFromWire(respondSchema(name, { type: "string" }), modelPayload('{"a":"x"}')),
        `cell B2 (${name})`,
      );
      return `${name} :: ${JSON.stringify(Object.keys(payload))} own? ${String(hasOwn(payload, name))}`;
    });
    expect(
      observed,
      'PRIMARY (bug 0210, cell B2 — site (b)): the guard is a general prototype-chain read, so EVERY `Object.prototype` member name is forged when the model omits the field. HEAD observes `["a","<name>"] own? true` in every row; the own-key guard makes every row `["a"] own? false`',
    ).toEqual(PROTOTYPE_MEMBER_NAMES.map((name) => `${name} :: ["a"] own? false`));
  });

  it("CONTROL (B3): an ordinarily-named declared field is unmoved — omission and repair both", () => {
    // 0210 §Reproduction B6's control, plus the encoding repair the guard change
    // must leave byte-identical: a declared OBJECT position the model delivered
    // as a JSON-encoded string is still parsed back (the whole reason `coerceNode`
    // exists, QRY-14). Green on both sides — the fix narrows the guard from a
    // prototype-chain test to an own-key test, which changes nothing for a key
    // the model actually sent.
    const omitted = payloadObject(
      respondPayloadFromWire(respondSchema("b", { type: "string" }), modelPayload('{"a":"x"}')),
      "cell B3 (omitted)",
    );
    expect(
      Object.keys(omitted),
      "CONTROL (bug 0210, cell B3): a declared field named `b` that the model omitted stays omitted — no key is fabricated for a name that is not an `Object.prototype` member",
    ).toEqual(["a"]);
    const repaired = payloadObject(
      respondPayloadFromWire(
        respondSchema("b", {
          type: "object",
          properties: { i: { type: "integer" } },
          required: ["i"],
          additionalProperties: false,
        }),
        modelPayload('{"a":"x","b":"{\\"i\\":1}"}'),
      ),
      "cell B3 (repaired)",
    );
    expect(
      repaired,
      "CONTROL (bug 0210, cell B3): the ENCODING repair is the shim's whole purpose (QRY-14) — a declared object position delivered as a JSON-encoded string is parsed back, unchanged by the own-key guard",
    ).toEqual({ a: "x", b: { i: 1 } });
  });

  it("RED (B4): an own `__proto__` in the properties table does not replace the payload's prototype", () => {
    // 0210 §Reproduction B1. The properties table is hand-built with
    // `Object.defineProperty` because no lowered document carries that own key at
    // HEAD — site (c) strips it — which is exactly why this half of site (b)
    // becomes REACHABLE the moment (c) is fixed, and why 0210 §Fix lands the two
    // together.
    const properties: Record<string, unknown> = {};
    Object.defineProperty(properties, "__proto__", {
      value: {
        type: "object",
        properties: { i: { type: "integer" } },
        required: ["i"],
        additionalProperties: false,
      },
      enumerable: true,
      writable: true,
      configurable: true,
    });
    properties["a"] = { type: "string" };
    if (!hasOwn(properties, "__proto__")) {
      throw new Error(
        "harness: cell (B4)'s properties table must carry `__proto__` as an OWN key — without it `coerceNode` never reaches the write under test and the cell asserts nothing",
      );
    }
    const schema = {
      type: "object",
      properties,
      required: ["__proto__", "a"],
      additionalProperties: false,
    } as LoweredSchema;
    const payload = payloadObject(
      respondPayloadFromWire(schema, modelPayload('{"a":"x"}')),
      "cell B4",
    );
    expect(
      prototypeReport(payload),
      "PRIMARY (bug 0210, cell B4 — site (b)): the coerced payload is the model's payload with encodings repaired, so its prototype is still `Object.prototype`. HEAD replaces it: the `in` guard passes for `__proto__`, the read answers `Object.prototype`, and `result[\"__proto__\"] = …` writes the coerced result of that read INTO THE PROTOTYPE SLOT",
    ).toBe("Object.prototype");
    expect(
      Object.keys(payload),
      "bug 0210 (cell B4): the model sent only `a`, so the payload's own keys are `[\"a\"]` — the declared `__proto__` property is absent data, not a fabricated key",
    ).toEqual(["a"]);
  });
});

// ===========================================================================
// (C) Sites (c1) / (c2) / (c3) — the three schema-lowering `properties` writes.
//
// ROUTE NOTE. 0210 §Fix leaves the (c) route open between null-prototyping the
// table outright and interposing a null-prototype carrier for the write only.
// The assertions below are chosen to hold under EITHER: they pin the emitted
// DOCUMENT (own key, `required`/`properties` agreement, `JSON.stringify` bytes,
// and that the field's own lowered node is no longer the table's prototype),
// never a specific prototype identity for the table itself.
// ===========================================================================

/** A throwaway located range for the `params:` field inputs. */
function range(line: number): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: 10 } };
}

/** The emission every (c) cell must produce for `{ __proto__: integer, a: string }`. */
const EXPECTED_C_BYTES =
  '{"type":"object","properties":{"__proto__":{"type":"integer"},"a":{"type":"string"}},' +
  '"required":["__proto__","a"],"additionalProperties":false}';

/**
 * The four document-shape claims schema-subset.md:8 / :78 make about a lowered
 * object form declaring `__proto__` first, as one comparable record. Asserting
 * them together keeps one failure diff carrying the whole symptom: at HEAD the
 * own key is absent, the prototype IS the field's lowered node, and `required`
 * names a property `properties` does not have.
 */
function documentShape(
  document: Record<string, unknown>,
  what: string,
): Record<string, unknown> {
  const properties = propertiesOf(document, what);
  return {
    ownProtoKey: hasOwn(properties, "__proto__"),
    propertiesOwnKeys: Object.keys(properties),
    tablePrototypeIsTheFieldNode: prototypeReport(properties) === JSON.stringify({
      type: "integer",
    }),
    requiredMatchesProperties: requiredOf(document, what).join(",") === Object.keys(properties).join(","),
  };
}

/** The shape every (c) cell demands of its emitted document. */
const EXPECTED_C_SHAPE = {
  ownProtoKey: true,
  propertiesOwnKeys: ["__proto__", "a"],
  tablePrototypeIsTheFieldNode: false,
  requiredMatchesProperties: true,
};

describe("bug 0210 (C1) — `lowerObjectFields` keeps a `__proto__` field in `properties`", () => {
  it("RED (C1): the emitted document carries the field under its own name", () => {
    // 0210 §Reproduction C1. `properties[field.name] = lowerTypeSource(…)` is
    // always handed an OBJECT (a lowered schema node), so the assignment always
    // takes the prototype-replacing branch of the inherited setter.
    const document = lowerObjectFields(
      [
        { name: "__proto__", typeSource: "integer" },
        { name: "a", typeSource: "string" },
      ],
      new Map<string, Record<string, unknown>>(),
    );
    expect(
      documentShape(document, "cell C1"),
      'PRIMARY (bug 0210, cell C1 — site (c1)): schema-subset.md:8 requires `required` to list every declared property and :78 fixes the emission form, so `properties` carries `__proto__` as an own key and the two agree. HEAD observes `{ownProtoKey:false, propertiesOwnKeys:["a"], tablePrototypeIsTheFieldNode:true, requiredMatchesProperties:false}`: the field\'s own lowered node `{"type":"integer"}` became the table\'s PROTOTYPE, while `required.push(field.name)` kept the name',
    ).toEqual(EXPECTED_C_SHAPE);
    expect(
      JSON.stringify(document),
      "PRIMARY (bug 0210, cell C1 — site (c1)): the emitted BYTES are schema-subset.md:78's form with the declared field present under its own name",
    ).toBe(EXPECTED_C_BYTES);
  });
});

describe("bug 0210 (C2) — `parseParams` keeps a `__proto__` field in `properties`", () => {
  /** The lowered `params:` document for `{ __proto__: integer, a: string }`. */
  function loweredParams(): Record<string, unknown> {
    const result = parseParams(
      [
        { name: "__proto__", typeSource: "integer", range: range(1) },
        { name: "a", typeSource: "string", range: range(2) },
      ],
      [],
      { file: "test.theta" },
    );
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `harness: this \`params:\` block must lower CLEAN (code-registry-parse.md:19 admits a \`_\`-leading name), so a diagnostic here is a harness failure. Observed ${errors
          .map((d) => `${d.code}: ${d.message}`)
          .join("; ")}`,
      );
    }
    if (result.loweredSchema === undefined) {
      throw new Error(
        "harness: `parseParams` withheld the lowered schema with no error-severity diagnostic — cell (C2) has nothing to assert on",
      );
    }
    return result.loweredSchema as Record<string, unknown>;
  }

  it("RED (C2): the lowered `params:` document carries the field under its own name", () => {
    // 0210 §Reproduction E1, at the `parseParams` seam. Same two lines as (c1),
    // keyed by a frontmatter `params:` field name.
    const document = loweredParams();
    expect(
      documentShape(document, "cell C2"),
      'PRIMARY (bug 0210, cell C2 — site (c2)): the lowered `params:` document must carry the declared field under its own name with `required` agreeing (schema-subset.md:8 / :78). HEAD observes `{ownProtoKey:false, propertiesOwnKeys:["a"], tablePrototypeIsTheFieldNode:true, requiredMatchesProperties:false}`',
    ).toEqual(EXPECTED_C_SHAPE);
    expect(
      JSON.stringify(document),
      "PRIMARY (bug 0210, cell C2 — site (c2)): the emitted bytes are schema-subset.md:78's form",
    ).toBe(EXPECTED_C_BYTES);
  });

  it("RED (C2, AJV): the lowered `params:` document COMPILES", () => {
    // 0210 §Reproduction E1's compile row. At HEAD the table's prototype is the
    // field's schema node, and AJV's meta-schema validation is a
    // prototype-chain-reading walk: it reads `properties.type` as `"integer"` and
    // refuses the document outright, so `AjvSchemaValidator.compile` THROWS
    // `Error: schema is invalid: data/properties/type must be object,boolean`
    // rather than returning a validator. At slash dispatch that throw is framed
    // as a runtime-defect system note and no registered diagnostic fires.
    const document = loweredParams() as LoweredSchema;
    const ajv = validator();
    expect(
      () => ajv.compile(document),
      "PRIMARY (bug 0210, cell C2 — site (c2), the AJV consequence): a parse-clean `params:` block must produce a COMPILABLE document. HEAD throws `schema is invalid: data/properties/type must be object,boolean` from `AjvSchemaValidator.compile`",
    ).not.toThrow();
  });
});

describe("bug 0210 (C3) — `hoistInlineObjectType` keeps a `__proto__` field in `properties`", () => {
  it("RED (C3): the retained `$defs` fragment carries the field under its own name", () => {
    // 0210 §Reproduction C3. The hoist's `properties[fieldName] =
    // lowerFieldType(…)` is the same two lines again, keyed by an inline object
    // type's field name. The scope is hand-built exactly as
    // tests/inline-object-nested-lowering.test.ts builds it for this same seam.
    const defs: Record<string, Record<string, unknown>> = {};
    const inlineCanonical = new Map<string, string>();
    const inlineFragments = new Map<string, Record<string, unknown>>();
    const slugCollisions: string[] = [];
    const ctx: LowerCtx = {
      bodyTypeMap: new Map<string, Record<string, unknown>>(),
      defs,
      unresolved: [],
      inlineCanonical,
      inlineFragments,
      slugCollisions,
    };
    const emitted = hoistInlineObjectType(
      "{__proto__: integer, a: string}",
      ctx,
      (fieldSource, fieldCtx) =>
        lowerTypeSource(fieldSource, fieldCtx.bodyTypeMap, fieldCtx.defs, fieldCtx.unresolved, {
          inlineCanonical,
          inlineFragments,
          slugCollisions,
        }),
    );
    if (typeof Object.getOwnPropertyDescriptor(emitted, "$ref")?.value !== "string") {
      throw new Error(
        `harness: the hoist must emit an in-document \`$ref\` (schema-subset.md:76) whose fragment cell (C3) then reads; observed ${JSON.stringify(emitted)}`,
      );
    }
    const fragments = Object.values(defs);
    if (fragments.length !== 1) {
      throw new Error(
        `harness: cell (C3) reads the ONE retained \`$defs\` fragment the hoist minted; observed ${JSON.stringify(defs)}`,
      );
    }
    const fragment = fragments[0] as Record<string, unknown>;
    expect(
      documentShape(fragment, "cell C3"),
      'PRIMARY (bug 0210, cell C3 — site (c3)): the hoisted `$defs` fragment is a lowered object form too, so schema-subset.md:8 / :78 bind it identically. HEAD observes `{ownProtoKey:false, propertiesOwnKeys:["a"], tablePrototypeIsTheFieldNode:true, requiredMatchesProperties:false}` — a retained fragment whose `required` names a property it does not describe',
    ).toEqual(EXPECTED_C_SHAPE);
    expect(
      JSON.stringify(fragment),
      "PRIMARY (bug 0210, cell C3 — site (c3)): the retained fragment's bytes are schema-subset.md:78's form. The bytes are also the slug's preimage, so this is what the §Schema-slug collision posture compares",
    ).toBe(EXPECTED_C_BYTES);
  });
});

describe("bug 0210 (C4) — a parse-clean body `schema` lowers to a compilable document", () => {
  /** 0210 §Reproduction E2's fixture: a body schema declaring `__proto__` first. */
  const FIXTURE_C4 =
    "---\nmode: prompt\n---\n" +
    "schema Q { __proto__: integer, a: string }\n" +
    "let r: Q = @`give me a Q`\nr\n";

  /** `Q`'s lowered document, through the projection `parseThetaDocument` performs. */
  function loweredQ(): Record<string, unknown> {
    const doc = parseDoc(FIXTURE_C4, "/theta/bug0210-c4.theta");
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(
        `harness: 0210 §Reproduction E2's fixture must load CLEAN — its parse-cleanliness is what makes the AJV throw a defect rather than a refusal. Observed ${errors
          .map((d) => `${d.code}: ${d.message}`)
          .join("; ")}`,
      );
    }
    const decls = doc.body.statements.filter(
      (stmt): stmt is SchemaDecl => stmt.kind === "schema",
    );
    if (decls.length !== 1) {
      throw new Error(
        `harness: cell (C4) drives the ONE body \`schema\` declaration this fixture spells; observed ${decls.length}`,
      );
    }
    const lowered = buildBodyTypeSchemas(decls as readonly LowerableSchema[], []);
    const document = lowered.get("Q");
    if (document === undefined) {
      throw new Error(
        "harness: `buildBodyTypeSchemas` must lower the declared `schema Q` — cell (C4) has nothing to assert on otherwise",
      );
    }
    return document;
  }

  it("RED (C4): the document carries the field, and `AjvSchemaValidator.compile` accepts it", () => {
    // The end-to-end reach of site (c1): real parse, the projection
    // `parseThetaDocument` performs onto `buildBodyTypeSchemas`, and the
    // production AJV seam. This is the row that shows the author-visible harm —
    // at HEAD the invocation dies with `data/properties/type must be
    // object,boolean` in a framed runtime-defect note that names nothing an
    // author can act on and that no registry row covers.
    const document = loweredQ();
    expect(
      documentShape(document, "cell C4"),
      'PRIMARY (bug 0210, cell C4 — site (c1) end to end): a parse-clean `schema Q { __proto__: integer, a: string }` lowers to schema-subset.md:78\'s form with both declared properties present. HEAD observes `{ownProtoKey:false, propertiesOwnKeys:["a"], tablePrototypeIsTheFieldNode:true, requiredMatchesProperties:false}`',
    ).toEqual(EXPECTED_C_SHAPE);
    const ajv = validator();
    expect(
      () => ajv.compile(document as LoweredSchema),
      "PRIMARY (bug 0210, cell C4 — the author-visible harm): the lowered document must COMPILE. HEAD throws `schema is invalid: data/properties/type must be object,boolean`, because AJV's meta-schema validation reads the properties table through its prototype — the field's own lowered node",
    ).not.toThrow();
  });
});

describe("bug 0210 (C6) — the sibling-name control: an ordinary field name is unmoved", () => {
  it("CONTROL (C6): a field named `b` compiles and both validation verdicts are unchanged", () => {
    // 0210 §Reproduction C-AJV/4, verbatim. Green on both sides: whichever (c)
    // route lands, a document declaring no `__proto__` field keeps today's bytes
    // (which the schema-slug cache's byte comparison makes a hard requirement)
    // and today's two verdicts.
    const result = parseParams(
      [
        { name: "b", typeSource: "integer", range: range(1) },
        { name: "a", typeSource: "string", range: range(2) },
      ],
      [],
      { file: "test.theta" },
    );
    if (result.loweredSchema === undefined) {
      throw new Error(
        `harness: the control block must lower; observed diagnostics ${JSON.stringify(result.diagnostics)}`,
      );
    }
    const document = result.loweredSchema;
    expect(
      JSON.stringify(document),
      "CONTROL (bug 0210, cell C6): an ordinary field name lowers to exactly today's bytes — the schema-slug cache compares these bytes, so they must not move",
    ).toBe(
      '{"type":"object","properties":{"b":{"type":"integer"},"a":{"type":"string"}},' +
        '"required":["b","a"],"additionalProperties":false}',
    );
    const compiled = validator().compile(document);
    expect(
      compiled.validate({ b: 1, a: "x" }),
      "CONTROL (bug 0210, cell C6): the both-fields payload validates ok, exactly as 0210 §Reproduction C-AJV/4 measured",
    ).toEqual({ ok: true });
    expect(
      compiled.validate(JSON.parse('{"a":"x"}')),
      "CONTROL (bug 0210, cell C6): the omitted-field payload draws the `required` error, byte-identical to 0210 §Reproduction C-AJV/4",
    ).toEqual({
      ok: false,
      errors: [
        {
          instancePath: "",
          schemaPath: "#/required",
          keyword: "required",
          message: "must have required property 'b'",
          params: { missingProperty: "b" },
        },
      ],
    });
  });
});
