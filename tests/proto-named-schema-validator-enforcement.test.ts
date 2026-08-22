import { describe, expect, it } from "vitest";
import { fillDefaultsAndRevalidate } from "../src/binder/defaulting";
import { parseParams } from "../src/parser/params";
import {
  AjvSchemaValidator,
  type CompiledValidator,
  type LoweredSchema,
  type SchemaSlugFn,
  type ValidationError,
} from "../src/seams/schema-validator";
import { defineRecordField } from "../src/runtime/value";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// Bug 0212 — the `V8c` validator seam does not enforce a lowered document that
// declares a property literally named `__proto__`. Bug 0210's fix (0.136.0) made
// the document carry that name as an OWN key in its `properties` table, so
// `AjvSchemaValidator.compile` now succeeds where it threw; the validator it
// produces mishandles the entry three separate ways
// (docs/bugs/0212-ajv-drops-declared-proto-named-property.md).
//
// THE MECHANISM, cited BY SYMBOL (0210's witness established this citation rule
// because line anchors drift under the fixes themselves; every `path:line` below
// was re-derived against this tree):
//   - `allSchemaProperties` (`node_modules/ajv/dist/vocabularies/code.js:48`,
//     `ajv@8.20.0` per `node_modules/ajv/package.json`) is
//     `Object.keys(schemaMap).filter((p) => p !== "__proto__")`. Every keyword
//     whose codegen enumerates the schema's `properties` table reads through it,
//     so the declared name contributes NEITHER a `properties` type check NOR an
//     `additionalProperties` allow-list entry.
//   - the `required` keyword reads its names from the document's `required`
//     array, so the entry survives — but the generated test is the
//     PROTOTYPE-CHAIN read `data.__proto__ === undefined`, which `{}` satisfies.
//
// THE THREE DIRECTIONS (0212 §Summary), each of which some cell here reds on
// ALONE — no cell is carried by another cell's failure:
//   1. `required` is satisfied by any payload (a silent false pass: `{}` is `ok`).
//   2. `additionalProperties` refuses the declared name (a CONFORMING payload
//      carrying the key as an own property is refused).
//   3. the declared `type` is never checked (visible only with
//      `additionalProperties` absent, where direction 2 cannot mask it).
//
// SPEC ANCHORS (each re-derived against the corpus in this tree).
//   - docs/spec_topics/pi-integration-contract/host-interfaces-services.md:38
//     (PIC-11) — schema validation "is provided by a `SchemaValidator` service
//     injected at construction time", whose behavioural contract follows at
//     :40–:46. `AjvSchemaValidator` (`src/seams/schema-validator.ts`) is the one
//     production implementation and the only `new Ajv(…)` site in `src/`
//     (`:112`); PIC-11 makes it THE enforcement mechanism for the lowered
//     document. A validator that answers `ok` for a payload the document refuses
//     is a defect against this clause.
//   - docs/spec_topics/query/query-failure-and-repair.md:78 (QRY-22) — the
//     runtime "MUST NOT bind … a response that has not been validated against
//     its declared schema". Cell (E) is that clause one boundary over, at the
//     binder's post-default-merge `params` check.
//   - docs/spec_topics/schema-subset.md:8 — `required` "must list *every*
//     declared property"; :78 fixes the emission as
//     `{"type":"object","properties":{…wire names…},"required":[…every wire
//     name…],"additionalProperties":false}`. The emission is CORRECT at HEAD
//     (0212 §"Actual behaviour": "Nothing in `src/` is wrong at the emission");
//     every document below is either that emission, produced by the shipped
//     `parseParams` (`src/parser/params.ts`), or a hand-built variant the
//     report measures.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:19 —
//     `theta/parse/binding-case-mismatch`, the only case rule on the param-name
//     position, admits any name starting with a lowercase letter or `_`. So
//     `__proto__` is an ADMITTED name that needs a behaviour; no cell here
//     expects a refusal (0119 settled that such a field survives, and 0212 §Fix
//     constraint 2 keeps that route).
//   - docs/spec_topics/pi-integration-contract/subagent.md:96 (PIC-60) — the
//     marshalled-params channel, where "the child MUST validate the received
//     JSON against **the same schema** before running the callee". Direction 2
//     is what makes that intake refuse the CORRECT payload; the live half of
//     that reach is H8a cell 69
//     (`tests/live/live-production-acceptance.test.ts:11352`), which is NOT
//     restated here and must be updated by the same change that greens this file
//     (0212 §Fix constraint 4).
//
// WHY EVERY PAYLOAD IS BUILT WITH `JSON.parse` OR `defineRecordField`. A plain
// `payload["__proto__"] = "x"` assignment produces NO own key — it hits
// `Object.prototype`'s inherited setter — and then validates `ok: true`, which
// the report measures at `@@ P1d`. So an assignment-built payload would make
// direction 2's cells pass for the wrong reason. `JSON.parse` is the wire path
// (the subagent intake's own construction) and `defineRecordField`
// (`src/runtime/value.ts:596`) is the shipped own-key write; both are used, and
// the `properties` tables of the hand-built documents are written through
// `defineRecordField` for the same reason.
//
// SCHEMAPATH POSTURE. 0212 §Fix names two live routes — a schema-build
// translation that expresses the affected property through `$defs`/`$ref` or
// `propertyNames`, and a wrapper-side own-key pre-check that INJECTS errors —
// and does not choose. §Expected behaviour pins `keyword`, `instancePath` and
// `params` only. So for an error reported against the `__proto__`-NAMED property
// itself this file asserts `instancePath` / `keyword` / `message` / `params` and
// deliberately does NOT pin `schemaPath`: either route may legitimately move
// that pointer. Every OTHER `schemaPath` — the sibling-name controls, and the
// `additionalProperties` entry for an undeclared name — is asserted exactly as
// measured today, because 0212 §Fix constraint 1 forbids moving them.
//
// HEAD BASELINE, at 0.145.0 (re-measured in this tree; the report filed at
// 0.137.0). Every assertion message below names its own HEAD observation, so a
// red reads as the symptom 0212 describes:
//   A1  validate({})                              → {"ok":true}                (direction 1)
//   A2  validate(JSON.parse '{"__proto__":"hello"}') → refused additionalProperties (direction 2)
//   A3  validate(JSON.parse '{"__proto__":123}')  → refused additionalProperties, never `type`
//   A4  validate(JSON.parse '{"z":1}')            → the `z` entry only, no `required` entry
//   B1  {a:"1"}                                   → {"ok":true}                (direction 1)
//   B2  {a:"1",__proto__:"h"}                     → refused additionalProperties (direction 2)
//   B3  {a:"1",__proto__:123}                     → refused additionalProperties, never `type`
//   C   {a:"1",__proto__:123}, no additionalProperties → {"ok":true}           (direction 3)
//   D   the sibling-name controls                 → CONTROL, green before AND after
//   E   fillDefaultsAndRevalidate over `{}`       → {ok:true} / classification `ok`
//   F   the same three directions inside a `$defs` fragment (the DEPTH LOCK)
//   G   the exact-`^__proto__$`-pattern collision (F1's lock, see its header)

// ===========================================================================
// Shared harness. Built to mirror `tests/proto-named-record-write-sites.test.ts`
// (bug 0210's witness) so the two files' verdicts are comparable line for line.
// ===========================================================================

/**
 * A content-addressing function deriving a distinct slug per distinct schema —
 * production's canonical-bytes discipline (`schema-validator.ts:397`, the
 * byte-equality check inside `compile` at `:390`) reduced to
 * `JSON.stringify`. Identical to 0210's witness `jsonSlug`.
 */
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};

/**
 * A real AJV validator (the `V8c` seam), configured exactly as production is
 * (`schema-validator.ts:384`: `{ strict: false, allErrors: true, logger: false }`).
 * The `emit` sink fails LOUDLY: the only diagnostic this seam emits is
 * `theta/runtime/validator-cache-collision`, and no cell here compiles two
 * documents through one instance, so a diagnostic arriving means the cell is
 * measuring something other than what it claims.
 */
function validator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (diagnostic) => {
      throw new Error(
        `harness: the ${"V8c"} seam emitted ${diagnostic.code} (${diagnostic.message}) — no cell in this file drives the slug-collision path, so this means the cell under test is not compiling the document it thinks it is`,
      );
    },
    slugOf: jsonSlug,
  });
}

/** A throwaway located range for the `params:` field inputs. */
function range(line: number): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: 10 } };
}

/**
 * The lowered `params:` document for `fields`, through the shipped `parseParams`
 * (`src/parser/params.ts`) — never a hand-built table where the production
 * producer can be driven instead. Fails LOUDLY on any error-severity diagnostic
 * or a withheld schema: `code-registry-parse.md:19` admits a `_`-leading name,
 * so a diagnostic here is a harness failure, and a withheld document would leave
 * the cell asserting nothing.
 */
function loweredParams(
  fields: readonly { readonly name: string; readonly typeSource: string }[],
  what: string,
): LoweredSchema {
  const result = parseParams(
    fields.map((field, index) => ({ ...field, range: range(index + 1) })),
    [],
    { file: "test.theta" },
  );
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `harness: ${what}'s \`params:\` block must lower CLEAN (code-registry-parse.md:19 admits a \`_\`-leading name), so a diagnostic here is a harness failure. Observed ${errors
        .map((d) => `${d.code}: ${d.message}`)
        .join("; ")}`,
    );
  }
  if (result.loweredSchema === undefined) {
    throw new Error(
      `harness: \`parseParams\` withheld the lowered schema for ${what} with no error-severity diagnostic — the cell has nothing to compile`,
    );
  }
  return result.loweredSchema;
}

/** The compiled validator for `fields`' lowered `params:` document. */
function compiledParams(
  fields: readonly { readonly name: string; readonly typeSource: string }[],
  what: string,
): CompiledValidator {
  return validator().compile(loweredParams(fields, what));
}

/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * A `properties` table carrying `__proto__` as an OWN key, written through the
 * shipped `defineRecordField` (`src/runtime/value.ts:596`) exactly as the
 * lowering sites do post-0210 — a plain assignment would produce no own key
 * (`@@ P1d`) and the hand-built document would then not be the document the
 * report measures. Fails LOUDLY if the own key did not materialise.
 */
function propertiesTable(entries: readonly (readonly [string, unknown])[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, node] of entries) {
    defineRecordField(properties, name, node);
  }
  for (const [name] of entries) {
    if (!hasOwn(properties, name)) {
      throw new Error(
        `harness: the hand-built \`properties\` table must carry ${JSON.stringify(name)} as an OWN key (0210's fix, via \`defineRecordField\`); without it the document under test is not the one 0212 measures`,
      );
    }
  }
  return properties;
}

type Verdict = ReturnType<CompiledValidator["validate"]>;

/**
 * The refusal's errors, or a red naming HEAD's own answer. `message` must state
 * the HEAD-observed verdict so the failure is self-diagnosing; the `throw` after
 * the `expect` is unreachable (the `expect` already threw) and exists only to
 * narrow the union for TypeScript.
 */
function refusalOf(verdict: Verdict, message: string): readonly ValidationError[] {
  expect(verdict.ok, message).toBe(false);
  if (verdict.ok) {
    throw new Error("unreachable: the assertion above already failed");
  }
  return verdict.errors;
}

/**
 * The ONE error entry matching `keyword` at `instancePath`, or a red listing
 * every entry observed.
 *
 * WHY find-by-keyword rather than a deep equality on the whole `errors` array:
 * 0212 §Expected behaviour pins `keyword` / `instancePath` / `params` for the
 * entry it names and says nothing about the rest of the array, and the
 * production configuration is `allErrors: true`, so a payload violating two
 * keywords at once may legitimately report more than one entry (cell A4's
 * `{"z":1}` both carries an undeclared key AND omits the required one, so a
 * conforming validator reports two). Pinning the array would make those cells
 * red on a detail the report does not specify.
 */
function pickError(
  errors: readonly ValidationError[],
  keyword: string,
  instancePath: string,
  message: string,
): ValidationError {
  const matches = errors.filter(
    (error) => error.keyword === keyword && error.instancePath === instancePath,
  );
  expect(
    matches.length,
    `${message} — observed the full error list ${JSON.stringify(errors)}`,
  ).toBe(1);
  const found = matches[0];
  if (found === undefined) {
    throw new Error("unreachable: the assertion above already failed");
  }
  return found;
}

/**
 * An error entry without its `schemaPath`. Used ONLY for entries reported
 * against the `__proto__`-named property itself — see this file's header,
 * §SCHEMAPATH POSTURE: 0212 §Fix leaves the route open between a schema-build
 * translation and a wrapper-side injection, either of which may move that
 * pointer while keeping keyword / instancePath / message / params.
 */
function withoutSchemaPath(error: ValidationError): Omit<ValidationError, "schemaPath"> {
  const { instancePath, keyword, message, params } = error;
  return { instancePath, keyword, message, params };
}

// ===========================================================================
// (A) The single-property document, through the shipped `parseParams` — 0212
// §Reproduction `@@ P1`/`@@ P1a`/`@@ P1b` and all four §Expected behaviour
// verdicts, one cell each so no cell is carried by another's failure.
// ===========================================================================

/** 0212 §Expected behaviour's document, and `@@ P1 lowered bytes` verbatim. */
const EXPECTED_A_BYTES =
  '{"type":"object","properties":{"__proto__":{"type":"string"}},' +
  '"required":["__proto__"],"additionalProperties":false}';

describe("bug 0212 (A) — a single declared `__proto__: string` property is enforced", () => {
  it("CONTROL (A0): the shipped `parseParams` emits 0212 §Expected behaviour's document", () => {
    // The precondition every (A) cell rests on. Green at HEAD (0210's fix) and
    // after the fix (0212 §Fix constraint 1: the EMISSION does not change) — so
    // a red below can only mean the validator mishandled this document, never
    // that the document was never produced.
    const document = loweredParams([{ name: "__proto__", typeSource: "string" }], "cell A0");
    expect(
      JSON.stringify(document),
      "CONTROL (bug 0212, cell A0): schema-subset.md:78's emission for one declared `__proto__: string` field. 0212 §Fix constraint 1 pins these bytes — the schema-slug cache compares them (`schema-validator.ts:397`) — so they must not move",
    ).toBe(EXPECTED_A_BYTES);
    const properties = Object.getOwnPropertyDescriptor(document, "properties")?.value as object;
    expect(
      hasOwn(properties, "__proto__"),
      "CONTROL (bug 0212, cell A0): bug 0210's fix made the properties table carry the declared name as an OWN key (`@@ P1 properties own __proto__ :: true`); without it this file would be re-measuring 0210, not 0212",
    ).toBe(true);
  });

  it("RED (A1, direction 1): `validate({})` reds `required` for `__proto__`", () => {
    // 0212 §Expected behaviour, verdict 1. The generated check is the
    // prototype-chain read `data.__proto__ === undefined`
    // (0212 §"The generated validator, verbatim"), which `{}` satisfies via
    // `Object.prototype`, so the required property is reported present.
    const verdict = compiledParams([{ name: "__proto__", typeSource: "string" }], "cell A1").validate(
      {},
    );
    const errors = refusalOf(
      verdict,
      'PRIMARY (bug 0212, cell A1 — direction 1): PIC-11 (host-interfaces-services.md:38) makes this seam the enforcement mechanism for the lowered document, whose `required` lists `__proto__` (schema-subset.md:8), so the EMPTY payload must be refused. HEAD answers `{"ok":true}`: AJV generated `if(data.__proto__ === undefined)`, a prototype-chain read that answers `Object.prototype` for `{}`, so the absent required property is reported present — a silent false pass on a validation boundary',
    );
    expect(
      withoutSchemaPath(
        pickError(
          errors,
          "required",
          "",
          "PRIMARY (bug 0212, cell A1 — direction 1): the refusal carries exactly one root-level `required` entry",
        ),
      ),
      // `schemaPath` deliberately unpinned: this entry is reported against the
      // `__proto__`-named property, and 0212 §Fix's two live routes may move
      // that pointer (this file's header, §SCHEMAPATH POSTURE).
      "PRIMARY (bug 0212, cell A1 — direction 1): the `required` entry names the missing property, in the shape the sibling-name control measures at `@@ P1e`. HEAD emits no error at all",
    ).toEqual({
      instancePath: "",
      keyword: "required",
      message: "must have required property '__proto__'",
      params: { missingProperty: "__proto__" },
    });
  });

  it("RED (A2, direction 2): a conforming `{\"__proto__\":\"hello\"}` payload validates ok", () => {
    // 0212 §Expected behaviour, verdict 2, and §Reproduction `@@ P1b`. Built with
    // `JSON.parse` — the wire path, and the one construction the subagent intake
    // (PIC-60, subagent.md:96) actually performs.
    const payload: unknown = JSON.parse('{"__proto__":"hello"}');
    if (!hasOwn(payload as object, "__proto__")) {
      throw new Error(
        "harness: `JSON.parse` must mint `__proto__` as an OWN key (`@@ P1b JSON.parse own key? :: true`) — a payload without it would make this cell pass for the wrong reason (`@@ P1d`)",
      );
    }
    expect(
      compiledParams([{ name: "__proto__", typeSource: "string" }], "cell A2").validate(payload),
      'PRIMARY (bug 0212, cell A2 — direction 2): the payload carries the ONE declared property, as an own key, with the declared type, so it CONFORMS and the verdict is `{"ok":true}`. HEAD refuses it with `keyword:"additionalProperties"`, `params.additionalProperty:"__proto__"`: `allSchemaProperties` (ajv/dist/vocabularies/code.js:48) filters the declared name out of the allow-list disjunction, which for a single-property document leaves the generated `for(const key0 in data)` loop with NO guard at all, so EVERY own key is refused. This is the refusal H8a cell 69 observes live (tests/live/live-production-acceptance.test.ts:11352)',
    ).toEqual({ ok: true });
  });

  it("RED (A3, direction 3): a wrong-typed `{\"__proto__\":123}` payload reds `type`", () => {
    // 0212 §Expected behaviour, verdict 3. Distinct from (A2): the payload is
    // NON-conforming, and the entry a conforming validator reports is the
    // `properties` type check AJV never emits for the filtered name. At HEAD this
    // cell reds on the `additionalProperties` refusal masking the missing `type`
    // entry; cell (C) removes the mask so direction 3 is witnessed alone.
    const errors = refusalOf(
      compiledParams([{ name: "__proto__", typeSource: "string" }], "cell A3").validate(
        JSON.parse('{"__proto__":123}'),
      ),
      "PRIMARY (bug 0212, cell A3 — direction 3): an integer bound to a `string`-declared property must be refused",
    );
    expect(
      withoutSchemaPath(
        pickError(
          errors,
          "type",
          "/__proto__",
          'PRIMARY (bug 0212, cell A3 — direction 3): the refusal must carry a `type` entry at `instancePath:"/__proto__"`. HEAD carries ONLY `{"keyword":"additionalProperties","params":{"additionalProperty":"__proto__"}}` at the root — the `properties` keyword emits NO per-key check for the filtered name (0212 §"The generated validator, verbatim": "There is no `properties` type check for the declared property")',
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE.
      "PRIMARY (bug 0212, cell A3 — direction 3): the `type` entry's shape is the one an ordinarily-named field's `type` failure carries (cell D2's control measures that shape at HEAD)",
    ).toEqual({
      instancePath: "/__proto__",
      keyword: "type",
      message: "must be string",
      params: { type: "string" },
    });
  });

  it("RED (A4): the `required` entry co-reported with an undeclared key's `additionalProperties` refusal is missing", () => {
    // 0212 §Expected behaviour, verdict 4. The `additionalProperties` keyword
    // must still work for undeclared names — this is the half of direction 2 a
    // fix must NOT break, and it already holds at HEAD, so what this cell reds
    // on is the OTHER entry: `allErrors: true` means a conforming validator
    // reports TWO entries here (`{"z":1}` also omits the required `__proto__`),
    // which is why this cell picks its entry by keyword rather than pinning the
    // array.
    const errors = refusalOf(
      compiledParams([{ name: "__proto__", typeSource: "string" }], "cell A4").validate(
        JSON.parse('{"z":1}'),
      ),
      "PRIMARY (bug 0212, cell A4): an undeclared key must be refused under `additionalProperties: false`",
    );
    expect(
      pickError(
        errors,
        "additionalProperties",
        "",
        "PRIMARY (bug 0212, cell A4): exactly one `additionalProperties` entry",
      ),
      // `schemaPath` IS pinned here: the entry is reported against the
      // document's own `additionalProperties` keyword for an ORDINARY name, and
      // 0212 §Fix constraint 1 forbids moving that.
      'PRIMARY (bug 0212, cell A4): the undeclared key `z` draws `additionalProperty:"z"`. HEAD reports this entry too — but it is HEAD\'s ONLY entry, because the `required` check for `__proto__` falsely passes; a conforming validator reports this entry ALONGSIDE the `required` one asserted next',
    ).toEqual({
      instancePath: "",
      schemaPath: "#/additionalProperties",
      keyword: "additionalProperties",
      message: "must NOT have additional properties",
      params: { additionalProperty: "z" },
    });
    expect(
      withoutSchemaPath(
        pickError(
          errors,
          "required",
          "",
          'PRIMARY (bug 0212, cell A4): `allErrors: true` (schema-validator.ts:384) reports every failing keyword in one pass, so a payload that ALSO omits the required `__proto__` draws the `required` entry beside the `additionalProperties` one. HEAD reports no `required` entry',
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE.
      "PRIMARY (bug 0212, cell A4): the `required` entry names `__proto__`",
    ).toEqual({
      instancePath: "",
      keyword: "required",
      message: "must have required property '__proto__'",
      params: { missingProperty: "__proto__" },
    });
  });
});

// ===========================================================================
// (B) `__proto__` BESIDE an ordinary field — 0212 §Reach `R1`'s shape, which is
// what a real `params:` block looks like, and the shape whose generated
// allow-list guard exists but names `a` only.
// ===========================================================================

/** The (B) document's fields, in 0212 §Reach `R1`'s order. */
const B_FIELDS = [
  { name: "a", typeSource: "string" },
  { name: "__proto__", typeSource: "string" },
] as const;

describe("bug 0212 (B) — `__proto__` beside an ordinary field is enforced too", () => {
  it("CONTROL (B0): the two-field document is 0212 §Reproduction `@@ P1f`'s bytes", () => {
    // Green before and after (0212 §Fix constraint 1). Also the one place this
    // file records a documentation discrepancy: §Reproduction `@@ P1f` shows
    // `"required":["a","__proto__"]` for this shape, which is what the shipped
    // `parseParams` emits and what is asserted here; §Reach `@@ R1` quotes the
    // same shape with `"required":["a"]`, which no `parseParams` call produces
    // for two non-defaulted fields (schema-subset.md:8 requires every declared
    // property to be listed). `@@ P1f` is the accurate row.
    expect(
      JSON.stringify(loweredParams(B_FIELDS, "cell B0")),
      "CONTROL (bug 0212, cell B0): `@@ P1f two-field bytes`, verbatim",
    ).toBe(
      '{"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"string"}},' +
        '"required":["a","__proto__"],"additionalProperties":false}',
    );
  });

  it("RED (B1, direction 1): omitting `__proto__` while sending `a` reds `required`", () => {
    // 0212 §Reproduction `@@ P1f validate({a:'1'}) :: {"ok":true}`. The generated
    // allow-list guard exists for this shape (`if(!(key0 === "a"))`) and a
    // `properties` type check is emitted for `a` — the ONLY missing entries are
    // the declared `__proto__` ones.
    const errors = refusalOf(
      compiledParams(B_FIELDS, "cell B1").validate(JSON.parse('{"a":"1"}')),
      'PRIMARY (bug 0212, cell B1 — direction 1): `required` lists BOTH declared properties (schema-subset.md:8), so a payload carrying only `a` must be refused. HEAD answers `{"ok":true}` — `data.__proto__ === undefined` reads the payload\'s prototype and reports the absent property present. This is the exact shape §Why it matters calls the binder `params` boundary\'s silent false pass',
    );
    expect(
      withoutSchemaPath(
        pickError(
          errors,
          "required",
          "",
          "PRIMARY (bug 0212, cell B1 — direction 1): exactly one root-level `required` entry",
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE.
      "PRIMARY (bug 0212, cell B1 — direction 1): the entry names `__proto__`, not `a` (which the payload supplied)",
    ).toEqual({
      instancePath: "",
      keyword: "required",
      message: "must have required property '__proto__'",
      params: { missingProperty: "__proto__" },
    });
  });

  it("RED (B2, direction 2): the fully-conforming two-field payload validates ok", () => {
    // 0212 §Reproduction `@@ P1f validate({a,__proto__ own})`. Both declared
    // properties present, both correctly typed, no undeclared key: nothing in the
    // document is violated.
    expect(
      compiledParams(B_FIELDS, "cell B2").validate(JSON.parse('{"a":"1","__proto__":"h"}')),
      'PRIMARY (bug 0212, cell B2 — direction 2): every declared property is present with its declared type and no undeclared key is carried, so the verdict is `{"ok":true}`. HEAD refuses with `keyword:"additionalProperties"`, `params.additionalProperty:"__proto__"`: the allow-list disjunction `allSchemaProperties` built names `a` ONLY, so the declared name reads as "additional"',
    ).toEqual({ ok: true });
  });

  it("RED (B3, direction 3): a wrong-typed `__proto__` beside a good `a` reds `type`", () => {
    const errors = refusalOf(
      compiledParams(B_FIELDS, "cell B3").validate(JSON.parse('{"a":"1","__proto__":123}')),
      "PRIMARY (bug 0212, cell B3 — direction 3): an integer bound to the `string`-declared `__proto__` must be refused",
    );
    expect(
      withoutSchemaPath(
        pickError(
          errors,
          "type",
          "/__proto__",
          'PRIMARY (bug 0212, cell B3 — direction 3): the refusal must carry a `type` entry at `instancePath:"/__proto__"`. HEAD carries only the root `additionalProperties` entry for `__proto__` — the generated code type-checks `a` (`if(data.a !== undefined){if(typeof data.a !== "string")…}`) and nothing at all for the declared `__proto__`',
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE.
      "PRIMARY (bug 0212, cell B3 — direction 3): the entry's shape matches the `a`-position type failure cell D2 measures at HEAD",
    ).toEqual({
      instancePath: "/__proto__",
      keyword: "type",
      message: "must be string",
      params: { type: "string" },
    });
  });
});

// ===========================================================================
// (C) Direction 3 ALONE — 0212 §"The declared type is not enforced" (`@@ R3`):
// the same declaration with `additionalProperties` ABSENT from the document, so
// direction 2's spurious refusal cannot mask the never-emitted type check.
// ===========================================================================

describe("bug 0212 (C) — the declared type is enforced with `additionalProperties` absent", () => {
  it("RED (C, direction 3 unmasked): `{\"a\":\"1\",\"__proto__\":123}` reds `type`", () => {
    // `@@ R3 validate({a:'1',__proto__:123}) :: true null` — the verdict is `ok`
    // and `errors` is `null`. The document is hand-built because no `params:`
    // lowering omits `additionalProperties` (schema-subset.md:78 always emits
    // it); the properties table is written through the shipped
    // `defineRecordField` so the own key is real (`@@ P1d`).
    const document = {
      type: "object",
      properties: propertiesTable([
        ["__proto__", { type: "string" }],
        ["a", { type: "string" }],
      ]),
      required: ["a", "__proto__"],
    } as LoweredSchema;
    expect(
      JSON.stringify(document),
      "harness (bug 0212, cell C): the document under test is `@@ R3 no-additionalProperties doc`, verbatim",
    ).toBe(
      '{"type":"object","properties":{"__proto__":{"type":"string"},"a":{"type":"string"}},' +
        '"required":["a","__proto__"]}',
    );
    const errors = refusalOf(
      validator().compile(document).validate(JSON.parse('{"a":"1","__proto__":123}')),
      'PRIMARY (bug 0212, cell C — direction 3, unmasked): with `additionalProperties` absent nothing else can refuse this payload, so the declared `type` is the ONLY thing that can — and it must. HEAD answers `{"ok":true}` with `errors === null`: AJV\'s `properties` codegen reads the table through `allSchemaProperties` (ajv/dist/vocabularies/code.js:48) and emits NO check for the filtered name, so an integer satisfies a `string` declaration. This is direction 3 witnessed on its own, with neither direction 1 nor direction 2 in play',
    );
    expect(
      withoutSchemaPath(
        pickError(
          errors,
          "type",
          "/__proto__",
          "PRIMARY (bug 0212, cell C — direction 3): exactly one `type` entry at the declared property",
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE.
      "PRIMARY (bug 0212, cell C — direction 3): the `type` entry names the declared type",
    ).toEqual({
      instancePath: "/__proto__",
      keyword: "type",
      message: "must be string",
      params: { type: "string" },
    });
  });
});

// ===========================================================================
// (D) CONTROLS — 0212 §Fix constraint 1's guard, and §Expected behaviour's
// "The sibling-name control's verdicts (`@@ P1e`) are the shape every one of
// these must take". GREEN BEFORE AND AFTER THE FIX. Both cells assert emitted
// BYTES as well as verdicts, because the schema-slug cache compares those bytes
// (`schema-validator.ts:397`), and both pin `schemaPath` in full.
// ===========================================================================

describe("bug 0212 (D) — a document declaring no `__proto__` field is unmoved", () => {
  it("CONTROL (D1): the sibling-name document keeps today's bytes and both verdicts", () => {
    // Byte-identical to bug 0210's cell C6
    // (`tests/proto-named-record-write-sites.test.ts`, describe "bug 0210 (C6)"),
    // deliberately: that cell is the same guard for 0210's route, and 0212 §Fix
    // constraint 1 forbids any route that moves these bytes or these verdicts.
    // Restated here rather than shared so this file reds/greens standalone.
    const document = loweredParams(
      [
        { name: "b", typeSource: "integer" },
        { name: "a", typeSource: "string" },
      ],
      "cell D1",
    );
    expect(
      JSON.stringify(document),
      "CONTROL (bug 0212, cell D1): an ordinary field name lowers to exactly today's bytes — 0212 §Fix constraint 1: \"any route that alters the bytes of a document declaring no `__proto__` field is refused\"",
    ).toBe(
      '{"type":"object","properties":{"b":{"type":"integer"},"a":{"type":"string"}},' +
        '"required":["b","a"],"additionalProperties":false}',
    );
    const compiled = validator().compile(document);
    expect(
      compiled.validate({ b: 1, a: "x" }),
      "CONTROL (bug 0212, cell D1): the both-fields payload validates ok",
    ).toEqual({ ok: true });
    expect(
      compiled.validate(JSON.parse('{"a":"x"}')),
      "CONTROL (bug 0212, cell D1): the omitted-field payload draws the single `required` error, deep-equal and byte-identical to bug 0210's cell C6 assertion and to 0212 `@@ P1e`'s control shape — including `schemaPath`, which no route may move for an ordinarily-named property",
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

  it("CONTROL (D2): a `$defs`/`$ref` document with an object-typed field is unmoved", () => {
    // The nested control for cell (F)'s depth lock: an inline object type, which
    // `hoistInlineObjectType` (`src/parser/params.ts`) hoists into a `$defs`
    // fragment reached by `$ref` (schema-subset.md:76). Declaring no `__proto__`
    // anywhere, it must keep today's bytes — INCLUDING the content-derived
    // `__inline_<slug>` fragment name, which is a slug preimage — and today's
    // three verdicts, `schemaPath`s and all.
    const document = loweredParams(
      [
        { name: "a", typeSource: "{i: integer}" },
        { name: "b", typeSource: "string" },
      ],
      "cell D2",
    );
    expect(
      JSON.stringify(document),
      "CONTROL (bug 0212, cell D2): the hoisted-fragment document's bytes, including the content-derived `$defs` key, are unmoved by any 0212 route",
    ).toBe(
      '{"type":"object","properties":{"a":{"$ref":"#/$defs/__inline_4cc9b813434a088c"},' +
        '"b":{"type":"string"}},"required":["a","b"],"additionalProperties":false,' +
        '"$defs":{"__inline_4cc9b813434a088c":{"type":"object","properties":{"i":{"type":"integer"}},' +
        '"required":["i"],"additionalProperties":false}}}',
    );
    const compiled = validator().compile(document);
    expect(
      compiled.validate(JSON.parse('{"a":{"i":1},"b":"x"}')),
      "CONTROL (bug 0212, cell D2): the conforming nested payload validates ok",
    ).toEqual({ ok: true });
    expect(
      compiled.validate(JSON.parse('{"a":{"i":"no"},"b":"x"}')),
      "CONTROL (bug 0212, cell D2): a wrong-typed property INSIDE the `$defs` fragment draws a `type` error whose `instancePath` and `schemaPath` both point through the `$ref` — this is the shape cell (F)'s depth lock demands for a `__proto__`-named property at the same depth, and it must not move here",
    ).toEqual({
      ok: false,
      errors: [
        {
          instancePath: "/a/i",
          schemaPath: "#/$defs/__inline_4cc9b813434a088c/properties/i/type",
          keyword: "type",
          message: "must be integer",
          params: { type: "integer" },
        },
      ],
    });
    expect(
      compiled.validate(JSON.parse('{"b":"x"}')),
      "CONTROL (bug 0212, cell D2): the omitted object-typed field draws the single `required` error, unmoved",
    ).toEqual({
      ok: false,
      errors: [
        {
          instancePath: "",
          schemaPath: "#/required",
          keyword: "required",
          message: "must have required property 'a'",
          params: { missingProperty: "a" },
        },
      ],
    });
  });
});

// ===========================================================================
// (E) The binder-arm reach — 0212 §Why it matters' first bullet, at the shipped
// `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:125`), the post-merge
// AJV check whose validator `production-theta-producer.ts` compiles from the
// theta's own lowered `params:` document (`:1328`, feeding `:1329`).
// ===========================================================================

describe("bug 0212 (E) — the binder's post-merge `params` check refuses unbound args", () => {
  it("RED (E): a non-defaulted `__proto__` param absent from the binder args cannot validate ok", () => {
    // Driven through the SHIPPED post-merge boundary rather than the compiled
    // validator alone, so the cell witnesses the production consequence: with
    // `defaults: []` (a non-defaulted param supplies no default) the merge is a
    // no-op and the boundary's own verdict is what routes the dispatch. QRY-22
    // (query-failure-and-repair.md:78) forbids binding what was not validated;
    // at HEAD the verdict is `ok` and `classification` is `{"kind":"ok"}`, so
    // the body runs with a required param UNBOUND and no diagnostic on any
    // channel.
    //
    // `binderArgs` is `{}` — literally the empty record, which is what a binder
    // turn that emitted no value for the param produces. `fillDefaultsAndRevalidate`
    // spreads it into `merged` and hands `merged` to `validate`, so the payload
    // reaching AJV is prototype-ordinary and carries no own `__proto__` key.
    const result = fillDefaultsAndRevalidate({
      binderArgs: {},
      defaults: [],
      validator: compiledParams([{ name: "__proto__", typeSource: "string" }], "cell E"),
    });
    expect(
      result.args,
      "harness (bug 0212, cell E): fill-if-absent has nothing to fill for a NON-defaulted param, so the merged args are still empty — the cell measures the post-merge AJV verdict, not the merge",
    ).toEqual({});
    expect(
      result.validation.ok,
      'PRIMARY (bug 0212, cell E — the binder `params` boundary): `fillDefaultsAndRevalidate` (binder/defaulting.ts:125) re-validates the merged args against the lowered `params:` document, whose `required` lists `__proto__`, so the verdict for empty args must be NOT ok. HEAD answers `{"ok":true}` — 0212 §Why it matters: "the post-merge validation answers `ok: true` for args that do not carry it, so the body runs with a required param unbound and no diagnostic on any channel", against QRY-22 (query-failure-and-repair.md:78)',
    ).toBe(false);
    expect(
      result.classification.kind,
      'PRIMARY (bug 0212, cell E — the binder `params` boundary): a non-empty AJV issue set classifies the args as `ajv_args` (CIO-1/CIO-3, `classifyBinderArgs` in binder/retry-taxonomy.ts), which is the verdict the binder path routes on. HEAD classifies `"ok"`, so nothing routes and the dispatch proceeds',
    ).toBe("ajv_args");
  });
});

// ===========================================================================
// (F) THE DEPTH LOCK — the same three directions for a `__proto__`-named
// property sitting inside a `$defs` fragment reached by `$ref`, which is the
// shape `hoistInlineObjectType` (`src/parser/params.ts`) produces for an inline
// object type (schema-subset.md:76; bug 0210 cell C3 pins the emission). The
// mechanism is depth-independent — `allSchemaProperties` is consulted per
// subschema — so a route that repairs only the ROOT document leaves this red.
// Cell (D2) is this cell's ordinary-name control at the same depth.
// ===========================================================================

/** The (F) document: `{ outer: { __proto__: string } }` as `$defs` + `$ref`. */
function nestedDocument(): LoweredSchema {
  return {
    type: "object",
    properties: { outer: { $ref: "#/$defs/__inline_frag" } },
    required: ["outer"],
    additionalProperties: false,
    $defs: {
      __inline_frag: {
        type: "object",
        properties: propertiesTable([["__proto__", { type: "string" }]]),
        required: ["__proto__"],
        additionalProperties: false,
      },
    },
  } as LoweredSchema;
}

describe("bug 0212 (F) — the depth lock: a `__proto__` property inside a `$defs` fragment", () => {
  it("CONTROL (F0): the nested document's bytes carry the declared name in the fragment", () => {
    expect(
      JSON.stringify(nestedDocument()),
      "CONTROL (bug 0212, cell F0): the fragment is schema-subset.md:78's lowered object form (bug 0210 cell C3's emission), one `$ref` down",
    ).toBe(
      '{"type":"object","properties":{"outer":{"$ref":"#/$defs/__inline_frag"}},' +
        '"required":["outer"],"additionalProperties":false,' +
        '"$defs":{"__inline_frag":{"type":"object","properties":{"__proto__":{"type":"string"}},' +
        '"required":["__proto__"],"additionalProperties":false}}}',
    );
  });

  it("RED (F1, direction 1 at depth): an empty nested object reds `required` at `/outer`", () => {
    const errors = refusalOf(
      validator().compile(nestedDocument()).validate(JSON.parse('{"outer":{}}')),
      'PRIMARY (bug 0212, cell F1 — direction 1, DEPTH LOCK): the fragment\'s `required` lists `__proto__`, so an empty `outer` must be refused at `instancePath:"/outer"`. HEAD answers `{"ok":true}` — the generated fragment check is the same prototype-chain read one level down, so the mechanism is depth-independent and a root-only repair leaves this cell red',
    );
    expect(
      withoutSchemaPath(
        pickError(
          errors,
          "required",
          "/outer",
          "PRIMARY (bug 0212, cell F1 — DEPTH LOCK): exactly one `required` entry at `/outer`",
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE. Cell (D2)
      // pins the `$ref`-threaded `schemaPath` shape for an ORDINARY name at this
      // same depth, so the pointer discipline is still locked somewhere.
      "PRIMARY (bug 0212, cell F1 — DEPTH LOCK): the entry names the fragment's declared property",
    ).toEqual({
      instancePath: "/outer",
      keyword: "required",
      message: "must have required property '__proto__'",
      params: { missingProperty: "__proto__" },
    });
  });

  it("RED (F2, direction 2 at depth): the conforming nested payload validates ok", () => {
    expect(
      validator().compile(nestedDocument()).validate(JSON.parse('{"outer":{"__proto__":"h"}}')),
      'PRIMARY (bug 0212, cell F2 — direction 2, DEPTH LOCK): the nested payload carries exactly the fragment\'s one declared property with its declared type, so the verdict is `{"ok":true}`. HEAD refuses with `keyword:"additionalProperties"`, `instancePath:"/outer"`, `params.additionalProperty:"__proto__"` — the fragment\'s allow-list disjunction is empty for the same upstream reason',
    ).toEqual({ ok: true });
  });

  it("RED (F3, direction 3 at depth): a wrong-typed nested `__proto__` reds `type`", () => {
    const errors = refusalOf(
      validator().compile(nestedDocument()).validate(JSON.parse('{"outer":{"__proto__":123}}')),
      "PRIMARY (bug 0212, cell F3 — direction 3, DEPTH LOCK): an integer bound to the fragment's `string`-declared property must be refused",
    );
    expect(
      withoutSchemaPath(
        pickError(
          errors,
          "type",
          "/outer/__proto__",
          'PRIMARY (bug 0212, cell F3 — direction 3, DEPTH LOCK): the refusal must carry a `type` entry at `instancePath:"/outer/__proto__"`. HEAD carries only the `additionalProperties` entry at `/outer`; the fragment emits no per-key type check for the filtered name, exactly as the root document does not (cell A3). Cell (D2) proves an ordinarily-named property at this depth DOES draw its `type` error today',
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE.
      "PRIMARY (bug 0212, cell F3 — DEPTH LOCK): the entry names the fragment's declared type",
    ).toEqual({
      instancePath: "/outer/__proto__",
      keyword: "type",
      message: "must be string",
      params: { type: "string" },
    });
  });
});

// ===========================================================================
// (G) F1'S LOCK — the exact-`^__proto__$`-pattern collision. The schema-build
// translation relocates `properties.__proto__` to
// `patternProperties["^__proto__$"]`, so a document ALREADY carrying an own
// `^__proto__$` pattern entry has two constraints landing on the same pattern
// key. JSON Schema applies BOTH matching subschemas to a matching data key, and
// the pattern half already fires at HEAD (pattern keys are not routed through
// `allSchemaProperties`), so a relocation that OVERWROTE the pre-existing entry
// would silently drop its constraint and the translated document would answer
// differently from its input. The translation intersects the two through
// `allOf` instead (`relocateFilteredProperty`, `src/seams/schema-validator.ts`),
// and this cell is the lock on that.
//
// THE DOCUMENT IS HAND-BUILT DELIBERATELY: our own lowering emits no
// `patternProperties` at all (schema-subset.md:8, and :78 fixes the emission as
// `type` / `properties` / `required` / `additionalProperties`), so no
// `parseParams` call can produce this shape — a hand-built `LoweredSchema` is
// the only way to reach the collision, exactly as an upstream-composed document
// would. The `properties` table is written through the shipped
// `defineRecordField` so the `__proto__` key is an OWN key (`@@ P1d`), and every
// payload is `JSON.parse`d for the same reason.
// ===========================================================================

/**
 * `properties.__proto__: string` colliding with `patternProperties`'
 * `^__proto__$: integer`. The two constraints are mutually unsatisfiable by
 * design, so each payload below reds on exactly the half it violates and no
 * payload can satisfy both — which is what makes a dropped constraint visible.
 */
function collidingPatternDocument(): LoweredSchema {
  return {
    type: "object",
    properties: propertiesTable([["__proto__", { type: "string" }]]),
    patternProperties: { "^__proto__$": { type: "integer" } },
    additionalProperties: false,
  } as LoweredSchema;
}

describe("bug 0212 (G) — a colliding `^__proto__$` pattern entry keeps its constraint", () => {
  it("LOCK (G, F1): both the pre-existing pattern constraint and the relocated `properties` constraint are enforced", () => {
    const compiled = validator().compile(collidingPatternDocument());
    // Half one: the pattern entry's `integer`, which fires at HEAD already. A
    // relocation that OVERWROTE the pattern entry with the relocated
    // `properties` entry drops this constraint and this payload moves
    // refuse→ok.
    const stringErrors = refusalOf(
      compiled.validate(JSON.parse('{"__proto__":"h"}')),
      'PRIMARY (bug 0212, cell G — F1\'s lock): the document\'s `patternProperties["^__proto__$"]` declares `integer`, so a string-valued `__proto__` must be refused',
    );
    expect(
      withoutSchemaPath(
        pickError(
          stringErrors,
          "type",
          "/__proto__",
          "PRIMARY (bug 0212, cell G — F1's lock): exactly one `type` entry for the string payload",
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE: this entry
      // is reported against the `__proto__`-named property, whose pointer the
      // translation legitimately moves.
      "PRIMARY (bug 0212, cell G — F1's lock): the entry names the PATTERN half's declared type",
    ).toEqual({
      instancePath: "/__proto__",
      keyword: "type",
      message: "must be integer",
      params: { type: "integer" },
    });
    // Half two: the relocated `properties` entry's `string`, which is what the
    // whole route exists to make enforceable.
    const integerErrors = refusalOf(
      compiled.validate(JSON.parse('{"__proto__":123}')),
      "PRIMARY (bug 0212, cell G — F1's lock): the document's `properties.__proto__` declares `string`, which the translation relocates onto the same pattern key, so an integer-valued `__proto__` must be refused too",
    );
    expect(
      withoutSchemaPath(
        pickError(
          integerErrors,
          "type",
          "/__proto__",
          "PRIMARY (bug 0212, cell G — F1's lock): exactly one `type` entry for the integer payload",
        ),
      ),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE.
      "PRIMARY (bug 0212, cell G — F1's lock): the entry names the RELOCATED half's declared type",
    ).toEqual({
      instancePath: "/__proto__",
      keyword: "type",
      message: "must be string",
      params: { type: "string" },
    });
    // Neither half can be satisfied by a boolean, and `allErrors: true`
    // (schema-validator.ts:384) reports every failing keyword in one pass, so
    // BOTH entries arrive together — the direct witness that the constraints
    // coexist rather than one having replaced the other, and that no payload
    // passes the intersection.
    const bothErrors = refusalOf(
      compiled.validate(JSON.parse('{"__proto__":true}')),
      "PRIMARY (bug 0212, cell G — F1's lock): a boolean satisfies neither the pattern half's `integer` nor the relocated half's `string`, so the payload must be refused",
    );
    expect(
      bothErrors.map((error) => withoutSchemaPath(error)),
      // `schemaPath` deliberately unpinned — see §SCHEMAPATH POSTURE.
      "PRIMARY (bug 0212, cell G — F1's lock): BOTH declared constraints report, in the intersection's order (the pre-existing pattern entry first, the relocated `properties` entry second)",
    ).toEqual([
      {
        instancePath: "/__proto__",
        keyword: "type",
        message: "must be integer",
        params: { type: "integer" },
      },
      {
        instancePath: "/__proto__",
        keyword: "type",
        message: "must be string",
        params: { type: "string" },
      },
    ]);
  });
});
