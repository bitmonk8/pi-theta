// H3a — `SchemaValidator` seam (PIC-11). Declares the seam interface's full
// member signatures, sourced from host-interfaces-services.md#schemavalidator-interface.
// The behavioural contract (single-pass error reporting, no conversion / no
// default-fill, `$ref` resolution scope, cache-collision handling) is added by
// the V8* leaves implementing against this shape.
//
// Spec: host-interfaces-services.md PIC-11.

/**
 * The lowered per-query JSON-Schema document (Schema Subset — Lowering
 * Algorithm step 4). Its concrete shape is owned by the schema-subset leaves;
 * H3a declares it as the opaque document the validator compiles.
 */
export type LoweredSchema = Readonly<Record<string, unknown>>;

export interface ValidationError {
  /** RFC 6901 JSON Pointer to the failing value. */
  instancePath: string;
  /** Pointer into the schema that triggered the failure. */
  schemaPath: string;
  /** The JSON-Schema keyword that failed ("type", "required", "enum", …). */
  keyword: string;
  /** Human-readable failure description. */
  message: string;
  /** Keyword-specific failure context (AJV's `params`). */
  params: Record<string, unknown>;
}

export interface CompiledValidator {
  validate(value: unknown):
    | { ok: true }
    | { ok: false; errors: readonly ValidationError[] };
}

export interface SchemaValidator {
  compile(schema: LoweredSchema): CompiledValidator;
  /** File-watcher entry point per the cache-invalidation rule. */
  invalidate(schemaSlug: string): void;
}

// --------------------------------------------------------------------------
// V8c / V8c-T — the production `SchemaValidator` implementation (PIC-11).
//
// V8c-T (tests-task) declares the production class shape and an inert stub so
// the failing tests compile and red on their own primary assertions; the paired
// V8c leaf fills the AJV-backed behaviour in (one-pass multi-error, no
// coercion / no default-fill, in-document `$ref`, silent unknown `format`,
// deterministic, per-runtime, slug-cache byte-verify).
// --------------------------------------------------------------------------

import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import type { Diagnostic } from "../diagnostics/diagnostic";
import { defineRecordField } from "../runtime/value";

// --------------------------------------------------------------------------
// Bug 0212 — the schema-build indirection (§Fix route 1) confined to
// documents that actually declare the one schema-property name AJV's codegen
// filters out. See the class doc comment on `AjvSchemaValidator` for why a
// second, per-instance `Ajv` is needed alongside the translation.
// --------------------------------------------------------------------------

/**
 * The one schema-property name AJV's codegen filters out of every
 * schema-map enumeration: `allSchemaProperties`
 * (`node_modules/ajv/dist/vocabularies/code.js:48`, `ajv@8.20.0`) is
 * `Object.keys(schemaMap).filter((p) => p !== "__proto__")`. A `properties`
 * table entry under this name draws neither a `type` check nor an
 * `additionalProperties` allow-list slot from AJV's generated code.
 */
const AJV_FILTERED_SCHEMA_PROPERTY = "__proto__";

/**
 * Keywords whose value is a name → schema map, so every value in the map is
 * itself a schema to walk. `properties` is the one map this fix rewrites;
 * `$defs` / `patternProperties` / `definitions` are walked purely to reach
 * nested `properties` tables at the right depth.
 */
const SCHEMA_MAP_KEYWORDS: readonly string[] = [
  "properties",
  "$defs",
  "patternProperties",
  "definitions",
] as const;

/**
 * Keywords whose value is a single schema — except `items`, which also
 * accepts an array of schemas (tuple form) and is handled specially. A
 * boolean `additionalProperties` (or any other non-object value under one of
 * these keywords) is not a schema node and is left untouched by the generic
 * recursion below (`isSchemaNode` gates every recursive call).
 */
const SCHEMA_VALUED_KEYWORDS: readonly string[] = [
  "items",
  "additionalProperties",
  "not",
  "contains",
  "propertyNames",
  "if",
  "then",
  "else",
] as const;

/** Keywords whose value is an array of schemas. */
const SCHEMA_LIST_KEYWORDS: readonly string[] = ["anyOf", "allOf", "oneOf"] as const;

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/** Whether `value` is a schema node worth walking (a non-null, non-array object). */
function isSchemaNode(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Schema-aware walk: does any `properties` table anywhere in `schema` carry
 * `__proto__` as an own enumerable key? Recurses only through the positions
 * JSON-Schema composition actually uses for sub-schemas — the three keyword
 * classes above — so a document declaring an ORDINARY field literally named
 * `properties` does not misfire: that field's value is a schema node walked
 * one level down from where the keyword `properties` sits, never confused
 * with the keyword itself. Every other key (`enum`, `const`, `required`,
 * `type`, `format`, `description`, …) is a leaf and is never recursed into.
 * Reads own enumerable keys only (`Object.keys`) and tests membership with
 * `Object.prototype.hasOwnProperty.call`; read-only, and never mutates its
 * input.
 */
function declaresFilteredProperty(schema: unknown): boolean {
  if (!isSchemaNode(schema)) {
    return false;
  }
  for (const key of Object.keys(schema)) {
    const value = schema[key];
    if (SCHEMA_MAP_KEYWORDS.includes(key)) {
      if (!isSchemaNode(value)) {
        continue;
      }
      if (key === "properties" && hasOwn(value, AJV_FILTERED_SCHEMA_PROPERTY)) {
        return true;
      }
      for (const mapKey of Object.keys(value)) {
        if (declaresFilteredProperty(value[mapKey])) {
          return true;
        }
      }
      continue;
    }
    if (SCHEMA_VALUED_KEYWORDS.includes(key)) {
      if (key === "items" && Array.isArray(value)) {
        if (value.some((item) => declaresFilteredProperty(item))) {
          return true;
        }
        continue;
      }
      if (declaresFilteredProperty(value)) {
        return true;
      }
      continue;
    }
    if (SCHEMA_LIST_KEYWORDS.includes(key)) {
      if (Array.isArray(value) && value.some((item) => declaresFilteredProperty(item))) {
        return true;
      }
      continue;
    }
    // Every other key is a leaf: never recursed into.
  }
  return false;
}

/**
 * A name → schema map, translated entry-by-entry through
 * `translateFilteredProperties`. `excludeKey`, when given, names the one entry
 * omitted from the copy — the `properties` entry being relocated to
 * `patternProperties`.
 */
function translateSchemaMap(
  map: Record<string, unknown>,
  excludeKey?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(map)) {
    if (key === excludeKey) {
      continue;
    }
    defineRecordField(result, key, translateFilteredProperties(map[key]));
  }
  return result;
}

/**
 * Write the relocated `properties.__proto__` entry into `target` — a node's
 * already-translated `patternProperties` table — under the fixed pattern
 * `^__proto__$`. The ONE relocation site, shared by both callers below so the
 * with-`patternProperties` and without-`patternProperties` paths cannot drift.
 *
 * A pattern key distinct from `^__proto__$` coexists with the relocated entry
 * untouched. An EXACT `^__proto__$` collision intersects through `allOf`
 * (pre-existing entry first, relocated second): JSON Schema applies every
 * matching `patternProperties` subschema to a matching key, so overwriting
 * would drop the pre-existing constraint and the translated document would
 * answer differently from its input, which this route's verdict-equivalence
 * requirement forbids. The collision is handled rather than refused because
 * the translation has no diagnostic channel (bug 0212 §Fix constraint 2 keeps
 * DIAG-2 unengaged); it is reachable only through a hand-built or
 * upstream-composed `LoweredSchema`, since our own lowering emits no
 * `patternProperties` at all (schema-subset.md:8).
 */
function relocateFilteredProperty(
  target: Record<string, unknown>,
  properties: Record<string, unknown>,
): void {
  const pattern = `^${AJV_FILTERED_SCHEMA_PROPERTY}$`;
  const relocated = translateFilteredProperties(properties[AJV_FILTERED_SCHEMA_PROPERTY]);
  const value = hasOwn(target, pattern) ? { allOf: [target[pattern], relocated] } : relocated;
  defineRecordField(target, pattern, value);
}

/**
 * `declaresFilteredProperty`'s companion: returns an EQUIVALENT document
 * AJV's codegen does honour. For every schema node whose `properties` table
 * carries an own `__proto__` key, the returned copy drops that entry from
 * `properties` and adds it to `patternProperties` under the fixed pattern
 * `^__proto__$`. A pre-existing `patternProperties` entry under a DIFFERENT
 * pattern coexists with the relocated one; an entry under exactly
 * `^__proto__$` is INTERSECTED with it through `allOf`
 * (`relocateFilteredProperty` above owns both cases and states why).
 * `patternProperties`' codegen matches the DATA's own keys against the
 * pattern and is not routed through `allSchemaProperties`, so the relocated
 * entry keeps its declared `type` and participates in `additionalProperties`'
 * allow-list the way a matched pattern always does.
 *
 * `required` is UNTOUCHED at every level (§Fix constraint 1,
 * schema-subset.md:8): moving an entry out of `properties` does not remove
 * its name from `required`, and AJV's `required` check never reads
 * `properties` at all — it is a leaf here, copied verbatim.
 *
 * Recurses only through the positions `declaresFilteredProperty` classifies.
 * Copies every table with `defineRecordField` (`src/runtime/value.ts`, the
 * idiom bugs 0119/0210/0214 already landed) so a copied key literally named
 * `__proto__` cannot reach the prototype slot, and never mutates or
 * aliases-and-mutates its input.
 */
function translateFilteredProperties(schema: unknown): unknown {
  if (!isSchemaNode(schema)) {
    return schema;
  }
  const propertiesValue = isSchemaNode(schema.properties) ? schema.properties : undefined;
  const hasFilteredEntry =
    propertiesValue !== undefined && hasOwn(propertiesValue, AJV_FILTERED_SCHEMA_PROPERTY);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    const value = schema[key];
    if (key === "properties") {
      const translatedMap =
        propertiesValue === undefined
          ? (value as Record<string, unknown>)
          : translateSchemaMap(
              propertiesValue,
              hasFilteredEntry ? AJV_FILTERED_SCHEMA_PROPERTY : undefined,
            );
      defineRecordField(result, "properties", translatedMap);
      continue;
    }
    if (key === "patternProperties") {
      const base = isSchemaNode(value) ? translateSchemaMap(value) : {};
      if (hasFilteredEntry) {
        relocateFilteredProperty(base, propertiesValue as Record<string, unknown>);
      }
      defineRecordField(result, key, base);
      continue;
    }
    if (SCHEMA_MAP_KEYWORDS.includes(key)) {
      defineRecordField(result, key, isSchemaNode(value) ? translateSchemaMap(value) : value);
      continue;
    }
    if (SCHEMA_VALUED_KEYWORDS.includes(key)) {
      if (key === "items" && Array.isArray(value)) {
        defineRecordField(result, key, value.map((item) => translateFilteredProperties(item)));
        continue;
      }
      defineRecordField(result, key, translateFilteredProperties(value));
      continue;
    }
    if (SCHEMA_LIST_KEYWORDS.includes(key)) {
      defineRecordField(
        result,
        key,
        Array.isArray(value) ? value.map((item) => translateFilteredProperties(item)) : value,
      );
      continue;
    }
    // Leaf keyword: copied verbatim, never recursed into.
    defineRecordField(result, key, value);
  }
  // `hasFilteredEntry` but the node declared no own `patternProperties` key at
  // all: the loop above never visited that keyword, so add it here.
  if (hasFilteredEntry && !hasOwn(schema, "patternProperties")) {
    const base: Record<string, unknown> = {};
    relocateFilteredProperty(base, propertiesValue as Record<string, unknown>);
    defineRecordField(result, "patternProperties", base);
  }
  return result;
}

/**
 * The content-address of a lowered per-query schema document: its schema slug
 * (per schema-subset.md §Canonical schema hash) and the canonical-form bytes
 * the cache stores alongside the compiled validator so the slug-collision
 * byte-equality check (schema-subset.md §Schema-slug collision posture) is a
 * byte comparison, not a re-serialisation.
 */
export interface SchemaSlug {
  readonly slug: string;
  readonly canonicalBytes: string;
}

/**
 * The injected content-addressing function: maps a lowered schema document to
 * its schema slug and canonical-form bytes. Production wiring supplies the
 * canonical schema-hash recipe; tests inject a fixed-slug function to drive the
 * slug-collision path deterministically (a genuine 64-bit slug collision is not
 * otherwise constructible).
 */
export type SchemaSlugFn = (schema: LoweredSchema) => SchemaSlug;

/** Constructor dependencies for the production `SchemaValidator`. */
export interface AjvSchemaValidatorDeps {
  /** Sink for the per-query cache's `theta/runtime/validator-cache-collision`. */
  readonly emit: (diagnostic: Diagnostic) => void;
  /** Content-addressing function keying the compiled-validator cache. */
  readonly slugOf: SchemaSlugFn;
}

/** A cached compiled validator alongside the canonical bytes that minted it. */
interface CacheEntry {
  readonly validator: CompiledValidator;
  readonly canonicalBytes: string;
}

/**
 * The production `SchemaValidator` (PIC-11). One instance is constructed per
 * runtime instance (never a module-level global); its `Ajv` instance and
 * compiled-validator cache are owned per-instance, so parallel runtimes share
 * no state.
 *
 * AJV flag rationale (implementation-notes.md §"Schema validation" hint):
 * `allErrors: true` gives one-pass multi-error reporting; the absence of
 * `coerceTypes` / `useDefaults` gives no-type-conversion / no-default-fill;
 * AJV's default in-document `$ref` resolver gives the ref-scope rule; and
 * `strict: false` + `ajv-formats` makes unknown `format` keywords silently
 * accepted rather than raised, and `logger: false` suppresses AJV's
 * console warning for an ignored unknown format so acceptance is truly silent.
 */
export class AjvSchemaValidator implements SchemaValidator {
  readonly #deps: AjvSchemaValidatorDeps;
  readonly #ajv: Ajv;
  /**
   * A second, per-instance `Ajv` (no globals/statics/singletons — the same
   * discipline as `#ajv`), used ONLY for documents `declaresFilteredProperty`
   * finds a `__proto__`-named `properties` entry in (bug 0212 §Fix route 1 +
   * the route-3 `ownProperties` component). `ownProperties: true` switches
   * AJV's data-side presence reads from the prototype-chain
   * `data.__proto__ === undefined` to a `hasOwnProperty` test
   * (`noPropertyInData`, `node_modules/ajv/dist/vocabularies/code.js:43–47`),
   * which is the only thing that repairs the `required` direction for an
   * ordinary field too (`data.someField === undefined` would otherwise treat
   * an inherited, non-own `someField` as present). It is kept SEPARATE from
   * `#ajv` rather than applied unconditionally so a document declaring no
   * `__proto__`-named property keeps compiling on byte-identical,
   * allocation-equivalent codegen (§Fix constraint 1 and this route's own
   * measurement requirement) — `ownProperties: true` changes the generated
   * code for every `required` check in the document, not only the filtered
   * one, so it cannot be the default configuration without moving every other
   * document's compiled output.
   */
  readonly #hardenedAjv: Ajv;
  /** Per-query compiled-validator cache, keyed by schema slug. */
  readonly #cache = new Map<string, CacheEntry>();

  constructor(deps: AjvSchemaValidatorDeps) {
    this.#deps = deps;
    this.#ajv = new Ajv({ strict: false, allErrors: true, logger: false });
    addFormats(this.#ajv);
    this.#hardenedAjv = new Ajv({ strict: false, allErrors: true, logger: false, ownProperties: true });
    addFormats(this.#hardenedAjv);
  }

  compile(schema: LoweredSchema): CompiledValidator {
    const { slug, canonicalBytes } = this.#deps.slugOf(schema);
    const cached = this.#cache.get(slug);
    if (cached !== undefined) {
      // Cache hit: verify byte-equality of the candidate document's canonical
      // form against the cached document's bytes before serving the cached
      // validator (PIC-11 byte-comparison, not a re-serialisation).
      if (cached.canonicalBytes === canonicalBytes) {
        return cached.validator;
      }
      // Byte mismatch == schema-slug collision: refuse to serve the wrong
      // cached validator. Emit `validator-cache-collision` and recompile the
      // new document; validation proceeds against the fresh validator so the
      // diagnostic does not abort the query.
      this.#deps.emit({
        severity: "error",
        code: "theta/runtime/validator-cache-collision",
        message: `validator-cache collision on slug ${slug}: two distinct schema documents hash alike`,
        hint: `cached document canonical bytes: ${cached.canonicalBytes}; new document canonical bytes: ${canonicalBytes}`,
      });
      return this.#build(schema);
    }
    const validator = this.#build(schema);
    this.#cache.set(slug, { validator, canonicalBytes });
    return validator;
  }

  invalidate(schemaSlug: string): void {
    this.#cache.delete(schemaSlug);
  }

  /**
   * Compile a lowered schema into a `CompiledValidator` (no caching). Runs
   * strictly AFTER `compile` has computed the slug and canonical bytes off
   * the EMITTED document, so the translation below never moves the cache key
   * space (bug 0212 §Fix constraint 1).
   *
   * A document declaring no `__proto__`-named `properties` entry takes the
   * unmediated path: the `#ajv` instance, the `schema` object as handed in,
   * one `Ajv.compile` call. Only a document `declaresFilteredProperty` flags is
   * compiled on `#hardenedAjv` from the translated document — the
   * `schemaPath` AJV reports for the RELOCATED property's own errors
   * legitimately changes (it now points through `#/patternProperties/...`
   * rather than `#/properties/...`), which is why this file's own witness
   * (`tests/proto-named-schema-validator-enforcement.test.ts`) deliberately
   * does not pin that pointer for those entries. Nothing else in `src/` reads
   * `schemaPath` (grep confirms `src/seams/schema-validator.ts` is the only
   * hit; `orderValidationIssues`, `src/runtime/query-error.ts:197`, keys on
   * `(instancePath, keyword, message)` only), so ERR-14's downstream
   * determinism is unaffected.
   */
  #build(schema: LoweredSchema): CompiledValidator {
    const compileOnHardened = declaresFilteredProperty(schema);
    const validateFn: ValidateFunction = compileOnHardened
      ? this.#hardenedAjv.compile(translateFilteredProperties(schema) as LoweredSchema)
      : this.#ajv.compile(schema);
    return {
      validate(value: unknown) {
        if (validateFn(value)) {
          return { ok: true as const };
        }
        const errors: ValidationError[] = (validateFn.errors ?? []).map(
          (e: ErrorObject) => ({
            instancePath: e.instancePath,
            schemaPath: e.schemaPath,
            keyword: e.keyword,
            message: e.message ?? "",
            params: e.params,
          }),
        );
        return { ok: false as const, errors };
      },
    };
  }
}
