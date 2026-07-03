// V13e — the production typed-query schema-validation collaborator (QRY-22).
//
// This module builds the `TypedQuerySchemaValidation` seam the runtime execution
// path (`runTypedQueryLoop` / `runQueryEffect`) orchestrates for a typed
// `@`-query, wiring the four QRY-22 steps against the REAL collaborators — the
// declared-schema resolution + lowering (`query-schema-lowering`), the root's
// `SchemaValidator` (AJV), and the `V13d` `runRespondRepairLoop` — so a typed
// query's response is validated against its lowered declared schema and a
// non-conforming response routes through respond-repair rather than being bound
// as an unvalidated value. It reimplements neither AJV nor the repair loop.
//
// Spec: query/query-failure-and-repair.md (QRY-22 integration; QRY-11 respond
// repair), schema-subset.md (SUBS-1 lowering), errors-and-results/queryerror-
// variants.md (ValidationError shape).

import { createHash } from "node:crypto";
import type {
  TypedQuerySchemaValidation,
  TypedQueryValidationResult,
} from "./query-tool-loop";
import type { LoweredSchema, SchemaValidator } from "../seams/schema-validator";
import type { ValidationIssue } from "./query-error";
import {
  renderFollowUpTurn,
  type FollowUpMethodology,
} from "./query-followup-render";
import {
  runRespondRepairLoop,
  type FollowUpResult,
  type RespondRepairConfig,
  type RespondRepairDriver,
  type RespondRepairOutcome,
  type ValidationFailure,
} from "./query-respond-repair";

/**
 * Parse a forced-respond turn's assistant text as its candidate structured
 * payload. A reply that does not parse as JSON is surfaced as its raw text
 * (`parsed: false`) so the downstream AJV validation reports the schema mismatch
 * — never a thrown `JSON.parse` (which would escape the query as an uncaught
 * error) and never a silently-bound `null`. The parse runs through a promise
 * rejection handler rather than a broad `catch`, honouring the specific-
 * exception-types rule.
 */
export type StructuredPayloadParse =
  | { readonly parsed: true; readonly value: unknown }
  | { readonly parsed: false; readonly raw: string };

export function parseStructuredPayload(text: string): Promise<StructuredPayloadParse> {
  const trimmed = text.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  const candidate =
    first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
  return Promise.resolve()
    .then(() => JSON.parse(candidate) as unknown)
    .then(
      (value): StructuredPayloadParse => ({ parsed: true, value }),
      (): StructuredPayloadParse => ({ parsed: false, raw: text }),
    );
}

/**
 * Project a forced-respond turn's parsed payload for the query loop: the parsed
 * JSON value on success, else the raw non-JSON reply text (so an object / enum /
 * number schema rejects it as a validation failure and a bare-string schema can
 * still accept prose), rather than binding a fabricated `null`.
 */
export function payloadForRespond(parse: StructuredPayloadParse): unknown {
  return parse.parsed ? parse.value : parse.raw;
}

/** Construction inputs for the production typed-query schema-validation seam. */
export interface TypedQueryValidationInput {
  /** The lowered declared response schema (QRY-22 / SUBS-1). */
  readonly lowered: LoweredSchema;
  /** The declared schema's resolved shape, for the `resolveDeclaredSchema` step. */
  readonly resolveShape: () => unknown;
  /** The runtime root's AJV `SchemaValidator` seam. */
  readonly schemaValidator: SchemaValidator;
  /** The loom's `respond_repair.attempts` budget (default 3). */
  readonly attempts: number;
  /** The `tool_loop.max_rounds` each follow-up is serviced with. */
  readonly maxRounds: number;
  /**
   * Drive ONE respond-repair follow-up user turn against the driven conversation
   * with the rendered follow-up prompt, resolving to its reply text. Injected so
   * each conversation mode (prompt / off-session / subagent) supplies its own
   * turn drive.
   */
  readonly driveFollowUp: (prompt: string) => Promise<string>;
}

/**
 * Build the production `TypedQuerySchemaValidation` (QRY-22). The four steps wrap
 * the real collaborators: `resolveDeclaredSchema` resolves the declared schema
 * (a named decl via the injected `resolveShape`, previously uncalled), `lower`
 * returns the pre-lowered schema, `convey` is a no-op (the lowered shape is
 * conveyed in the query text built upfront, so the model has already seen it),
 * `validate` compiles + validates via the root's `SchemaValidator`, and
 * `runRespondRepair` drives the `V13d` respond-repair loop over real follow-up
 * turns.
 */
export function buildTypedQueryValidation(
  input: TypedQueryValidationInput,
): TypedQuerySchemaValidation {
  return new ProductionTypedQueryValidation(input);
}

/** The default respond-repair methodology when the loom declares none. */
const DEFAULT_METHODOLOGY: FollowUpMethodology = "validator_error";

class ProductionTypedQueryValidation implements TypedQuerySchemaValidation {
  readonly #input: TypedQueryValidationInput;
  readonly #slug: string;

  constructor(input: TypedQueryValidationInput) {
    this.#input = input;
    this.#slug = schemaSlug(input.lowered);
  }

  resolveDeclaredSchema(): unknown {
    return this.#input.resolveShape();
  }

  lower(): LoweredSchema {
    return this.#input.lowered;
  }

  convey(): void {
    // The lowered shape is conveyed in the forced-respond query text the model
    // driver was constructed with (built upfront so the model sees it on the
    // forced-respond turn); no further conveyance is required here.
  }

  validate(lowered: LoweredSchema, payload: unknown): TypedQueryValidationResult {
    return validateAgainst(this.#input.schemaValidator, lowered, payload);
  }

  runRespondRepair(initial: ValidationFailure): Promise<RespondRepairOutcome> {
    const config: RespondRepairConfig = {
      methodology: DEFAULT_METHODOLOGY,
      attempts: this.#input.attempts,
    };
    // The most recent failed attempt's issues drive the `validator_error`
    // follow-up (ERR-14 order handled by the renderer); seeded from the opening
    // failure and replaced on each re-validated follow-up.
    let latestIssues: readonly ValidationIssue[] =
      initial.kind === "schema_validation" ? initial.issues : [];
    const driver: RespondRepairDriver = {
      nextFollowUp: async (): Promise<FollowUpResult> => {
        const prompt = renderFollowUpTurn({
          methodology: DEFAULT_METHODOLOGY,
          loweredSchema: this.#input.lowered,
          slug: this.#slug,
          issues: latestIssues,
        });
        const reply = await this.#input.driveFollowUp(prompt);
        const parse = await parseStructuredPayload(reply);
        const payload = payloadForRespond(parse);
        const result = validateAgainst(
          this.#input.schemaValidator,
          this.#input.lowered,
          payload,
        );
        if (result.ok) {
          return { kind: "validated", value: payload };
        }
        latestIssues = result.issues;
        return {
          kind: "schema_validation",
          issues: result.issues,
          raw_response: parse.parsed ? JSON.stringify(payload) : parse.raw,
        };
      },
    };
    return runRespondRepairLoop(initial, driver, {
      config,
      maxRounds: this.#input.maxRounds,
    });
  }
}

/** Compile + validate a candidate payload against the lowered schema via AJV. */
function validateAgainst(
  validator: SchemaValidator,
  lowered: LoweredSchema,
  payload: unknown,
): TypedQueryValidationResult {
  const compiled = validator.compile(lowered);
  const result = compiled.validate(payload);
  if (result.ok) {
    return { ok: true };
  }
  const issues: ValidationIssue[] = result.errors.map((e) => ({
    path: e.instancePath,
    message: e.message,
    schema_keyword: e.keyword,
  }));
  return { ok: false, issues, raw_response: JSON.stringify(payload) };
}

/**
 * The lowered response schema's slug, naming the `__loom_respond_<slug>` tool in
 * the respond-repair follow-up template — the first 16 hex chars of the SHA-256
 * of the schema's JSON form (the same canonical-hash spirit as the schema-subset
 * slug; `createHash` is the schema-hash primitive, not a banned ambient).
 */
function schemaSlug(lowered: LoweredSchema): string {
  return createHash("sha256").update(JSON.stringify(lowered)).digest("hex").slice(0, 16);
}
