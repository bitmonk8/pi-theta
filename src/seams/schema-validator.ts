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
}
