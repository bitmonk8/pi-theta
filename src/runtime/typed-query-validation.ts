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
import {
  synthesizeForcedRespondIssue,
  type ForcedRespondBranch,
  type QueryError,
  type ValidationIssue,
} from "./query-error";
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

/**
 * A respond-repair follow-up drive that failed at the provider layer instead of
 * producing reply text (query-failure-and-repair.md §"Non-validation failures
 * during a respond-repair follow-up"): the off-session `complete()` reply
 * classified as `transport` / `context_overflow` at the seam (bug 0007). The
 * carried `QueryError` propagates as the query's `Err` and terminates repair
 * with no `attempts` debit — the plain-string reply stays the success shape so
 * existing string-returning drives keep compiling unchanged.
 */
export interface FollowUpDriveFailure {
  readonly kind: "provider_failure";
  readonly error: QueryError;
}

/**
 * A respond-repair follow-up drive that RESTARTED the whole two-phase loop
 * (QRY-14 ¶3; bug 0010 increment C) and terminated through a fresh forced
 * respond turn: either the extracted/captured structured `payload` (validated
 * caller-side by `nextFollowUp`, never text-parsed), or an ERR-17
 * `noncompliance` report (the fresh respond turn resolved normally without
 * calling the forced respond tool). The plain-string arm of `driveFollowUp`
 * remains the LEGACY text-drive success shape so scripted drives and the
 * fused off-session/degraded arms keep compiling and behaving identically.
 */
export interface FollowUpRespondOutcome {
  readonly kind: "respond_outcome";
  readonly turn:
    | { readonly kind: "payload"; readonly payload: unknown }
    | {
        readonly kind: "noncompliance";
        readonly branch: ForcedRespondBranch;
        readonly raw_response: string | null;
      };
}

/** Construction inputs for the production typed-query schema-validation seam. */
export interface TypedQueryValidationInput {
  /** The lowered declared response schema (QRY-22 / SUBS-1). */
  readonly lowered: LoweredSchema;
  /** The declared schema's resolved shape, for the `resolveDeclaredSchema` step. */
  readonly resolveShape: () => unknown;
  /** The runtime root's AJV `SchemaValidator` seam. */
  readonly schemaValidator: SchemaValidator;
  /** The theta's `respond_repair.attempts` budget (default 3). */
  readonly attempts: number;
  /**
   * The REGISTERED respond-tool name (bug 0010 fix review, F6): the PIC-44
   * registration may mint a collision-disambiguated `__theta_respond_<slug>_<n>`,
   * and the QRY-12 follow-up templates must name THAT tool byte-equal to the
   * one the provider is forced to. Absent (harness/legacy callers) ⇒ the
   * recipe-derived `__theta_respond_<slug>` — byte-identical whenever no
   * collision occurred.
   */
  readonly respondToolName?: string;
  /** The `tool_loop.max_rounds` each follow-up is serviced with. */
  readonly maxRounds: number;
  /**
   * Drive ONE respond-repair follow-up attempt with the rendered follow-up
   * prompt. Three result shapes (bug 0010 increment C, additive widening):
   *
   *  - `string` — the LEGACY text drive's reply text, parsed + AJV-validated by
   *    `nextFollowUp` exactly as before (scripted drives and the fused
   *    off-session/degraded arms depend on this path staying byte-identical);
   *  - `FollowUpDriveFailure` — the drive's provider call failed (bug 0007);
   *    the proximate `QueryError` propagates (QRY-10 §respond-repair) and
   *    terminates repair with no attempts debit;
   *  - `FollowUpRespondOutcome` — the TWO-PHASE RESTART drive (QRY-14 ¶3): the
   *    attempt re-ran the free phase and terminated through a fresh forced
   *    respond turn, yielding a structured payload (AJV-validated here, never
   *    text-parsed) or an ERR-17 noncompliance report.
   *
   * Injected so each conversation mode (prompt / off-session / subagent)
   * supplies its own turn drive.
   */
  readonly driveFollowUp: (
    prompt: string,
  ) => Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome>;
}

/**
 * Build the production `TypedQuerySchemaValidation` (QRY-22). The four steps wrap
 * the real collaborators: `resolveDeclaredSchema` resolves the declared schema
 * (a named decl via the injected `resolveShape`, previously uncalled), `lower`
 * returns the pre-lowered schema, `convey` is a no-op (the lowered shape
 * reaches the model through per-driver channels — see `convey` below),
 * `validate` compiles + validates via the root's `SchemaValidator`, and
 * `runRespondRepair` drives the `V13d` respond-repair loop over real follow-up
 * turns.
 */
export function buildTypedQueryValidation(
  input: TypedQueryValidationInput,
): TypedQuerySchemaValidation {
  return new ProductionTypedQueryValidation(input);
}

/** The default respond-repair methodology when the theta declares none. */
const DEFAULT_METHODOLOGY: FollowUpMethodology = "validator_error";

class ProductionTypedQueryValidation implements TypedQuerySchemaValidation {
  readonly #input: TypedQueryValidationInput;
  readonly #slug: string;
  /** The registered respond-tool name the QRY-12 templates reference (F6). */
  readonly #toolName: string;

  constructor(input: TypedQueryValidationInput) {
    this.#input = input;
    this.#slug = respondSchemaSlug(input.lowered);
    this.#toolName = input.respondToolName ?? "__theta_respond_" + this.#slug;
  }

  resolveDeclaredSchema(): unknown {
    return this.#input.resolveShape();
  }

  lower(): LoweredSchema {
    return this.#input.lowered;
  }

  convey(): void {
    // Bug 0010: on the two-phase paths — live AND off-session (increment D) —
    // conveyance rides the synthesised respond tool's `parameters` (the
    // lowered schema, PIC-44) and the QRY-15 trailing message of the
    // off-session forced respond dispatch — the query text itself is the BARE
    // render (QRY-14 step 1). The pre-built-query-text conveyance (the fused
    // typed-aware text) remains only for the degraded unlowerable-schema arm;
    // in every case the model has seen the shape by the time validation runs,
    // so no further conveyance is required here.
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
    // failure and replaced on each re-validated follow-up. A NONCOMPLIANCE
    // opener seeds the single synthesised ERR-17 issue (bug 0010 fix round 1):
    // "the validator_error template's <ajv-summary> placeholder is rendered
    // from this synthesised issue exactly as if AJV had produced it" — an empty
    // seed would render a blank <ajv-summary> on the first follow-up.
    let latestIssues: readonly ValidationIssue[] =
      initial.kind === "schema_validation"
        ? initial.issues
        : [synthesizeForcedRespondIssue(initial.branch)];
    const driver: RespondRepairDriver = {
      nextFollowUp: async (): Promise<FollowUpResult> => {
        const prompt = renderFollowUpTurn({
          methodology: DEFAULT_METHODOLOGY,
          loweredSchema: this.#input.lowered,
          slug: this.#slug,
          // QRY-12 byte-equality with the REGISTERED name (bug 0010 fix
          // review, F6): a PIC-44 collision-disambiguated registration is
          // referenced under its minted name, never the bare recipe slug.
          toolName: this.#toolName,
          issues: latestIssues,
        });
        const reply = await this.#input.driveFollowUp(prompt);
        if (typeof reply !== "string" && reply.kind === "provider_failure") {
          // QRY-10 §respond-repair: a follow-up that fails for a non-validation
          // reason (here: the drive's provider failure, bug 0007) propagates as
          // its proximate `QueryError` variant and terminates respond-repair
          // immediately — `runRespondRepairLoop`'s `non_validation` arm debits
          // NO `attempts` slot, so a dead provider is never re-driven.
          return { kind: "non_validation", error: reply.error };
        }
        if (typeof reply !== "string") {
          // Bug 0010 increment C (QRY-14 ¶3): the two-phase-restart drive
          // terminated through a FRESH forced respond turn. A structured
          // payload is AJV-validated directly (no text parse — the payload
          // arrived as the respond tool's `arguments`, already structured); an
          // ERR-17 noncompliance debits one slot through the loop's existing
          // noncompliance arm, and its synthesised issue drives the NEXT
          // follow-up's <ajv-summary> exactly as a noncompliance opener does.
          const turn = reply.turn;
          if (turn.kind === "payload") {
            const result = validateAgainst(
              this.#input.schemaValidator,
              this.#input.lowered,
              turn.payload,
            );
            if (result.ok) {
              return { kind: "validated", value: turn.payload };
            }
            latestIssues = result.issues;
            return {
              kind: "schema_validation",
              issues: result.issues,
              raw_response: result.raw_response,
            };
          }
          latestIssues = [synthesizeForcedRespondIssue(turn.branch)];
          return {
            kind: "noncompliance",
            branch: turn.branch,
            raw_response: turn.raw_response,
          };
        }
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
 * The lowered response schema's slug — the first 16 hex chars of the SHA-256
 * of the schema's JSON form (the same canonical-hash spirit as the schema-subset
 * slug; `createHash` is the schema-hash primitive, not a banned ambient).
 *
 * WHY exported (bug 0010): this ONE recipe names the registered
 * `__theta_respond_<slug>` respond tool (the PIC-44 registration-cache entry)
 * AND the QRY-12 / QRY-15 templates' backticked tool references, so the tool
 * name the provider is forced to and the name the templates instruct the model
 * to call stay byte-equal by construction — three consumers, one function.
 */
export function respondSchemaSlug(lowered: LoweredSchema): string {
  return createHash("sha256").update(JSON.stringify(lowered)).digest("hex").slice(0, 16);
}
