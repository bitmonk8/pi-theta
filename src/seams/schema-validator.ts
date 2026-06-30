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

import type { Diagnostic } from "../diagnostics/diagnostic";

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
  /** Sink for the per-query cache's `loom/runtime/validator-cache-collision`. */
  readonly emit: (diagnostic: Diagnostic) => void;
  /** Content-addressing function keying the compiled-validator cache. */
  readonly slugOf: SchemaSlugFn;
}

/**
 * The inert V8c-T stub: every `compile(...)` hands back a validator that reports
 * a single sentinel "not implemented" error and rejects every value, performs
 * no caching, and never emits the slug-collision diagnostic. Each V8c-T test
 * therefore reds on its own primary assertion because the V8c behaviour is
 * absent — not on a harness throw. The paired V8c leaf replaces this body.
 */
export class AjvSchemaValidator implements SchemaValidator {
  readonly #deps: AjvSchemaValidatorDeps;

  constructor(deps: AjvSchemaValidatorDeps) {
    this.#deps = deps;
  }

  compile(_schema: LoweredSchema): CompiledValidator {
    void this.#deps;
    return {
      validate(_value: unknown) {
        return {
          ok: false as const,
          errors: [
            {
              instancePath: "",
              schemaPath: "",
              keyword: "loom-test-stub",
              message: "SchemaValidator not implemented (V8c-T stub)",
              params: {},
            },
          ],
        };
      },
    };
  }

  invalidate(_schemaSlug: string): void {
    // V8c-T stub: no cache to invalidate.
  }
}
