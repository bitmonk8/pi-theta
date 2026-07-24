// RFC-0006 — marshalled-params channel (PIC-60) seam.
//
// The parent already holds the callee's ALREADY-TYPED param values. Routing
// them through the slash string `-p "/<slug> …"` would re-enter the binder (a
// model turn) and lose typing, so the runtime marshals them structurally as
// canonical JSON per the theta's `params:` schema and the child validates the
// received JSON against the SAME schema, skipping the binder entirely. This
// module owns:
//
//   - canonical-JSON marshalling (`canonicalizeParamsJson`);
//   - the pinned size threshold + dual env / temp-file channel cutover
//     (`SUBAGENT_PARAMS_THRESHOLD_BYTES`, `chooseParamsChannel`): below the
//     threshold the JSON travels on `PI_THETA_PARAMS`; at or above it, a 0600
//     temp file whose path travels on `PI_THETA_PARAMS_FILE`, read and deleted
//     by the child, with a parent-`finally` delete as backstop;
//   - parent-side marshalling (`marshalParams`) with the temp-file write +
//     cleanup closure;
//   - child-side intake (`readMarshalledParams`, `intakeChildParams`): read env
//     or file, delete the file, validate against the callee's `params:` schema,
//     and — on the marshalled path — bypass the binder entirely.
//
// The seam is dependency-injected: the temp-file write / unlink and the child
// read / unlink are passed in, so the threshold cutover, the file lifecycle,
// and the schema-validation refusal are unit-testable offline (no real fs).
//
// Spec: pi-integration-contract/subagent.md (PIC-60, #subagent-return-envelope
// escalation-sharing), binder.md (binder inference remains exclusive to human
// slash invocation), diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-params-validation-failed`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { InvokeInfraError } from "./query-error";

// ---------------------------------------------------------------------------
// Channel constants.
// ---------------------------------------------------------------------------

/** Below-threshold carrier: the canonical params JSON travels as this env var (PIC-60). */
export const SUBAGENT_PARAMS_ENV = "PI_THETA_PARAMS";

/** At/above-threshold carrier: the 0600 temp-file path travels as this env var (PIC-60). */
export const SUBAGENT_PARAMS_FILE_ENV = "PI_THETA_PARAMS_FILE";

/**
 * The pinned size threshold (bytes) that keys the dual channel, chosen
 * conservatively under the tightest platform environment-block cap with
 * headroom for the inherited environment (order of 8 KB payload; Windows caps
 * the entire environment block at ~32 KB). Below → env var; at or above → temp
 * file (PIC-60).
 */
export const SUBAGENT_PARAMS_THRESHOLD_BYTES = 8 * 1024;

/** The temp-file mode for the at/above-threshold channel (0600 — owner-only). */
export const SUBAGENT_PARAMS_TEMP_FILE_MODE = 0o600;

/** `theta/runtime/subagent-params-validation-failed` — received params failed parse / schema validation. */
export const SUBAGENT_PARAMS_VALIDATION_FAILED_CODE = "theta/runtime/subagent-params-validation-failed";

// ---------------------------------------------------------------------------
// Canonicalisation + channel selection.
// ---------------------------------------------------------------------------

/**
 * Serialise the already-typed param values to CANONICAL JSON (stable key order),
 * so the same params always produce the same bytes (PIC-60). The child parses
 * this back and validates it against the callee's `params:` schema.
 */
export function canonicalizeParamsJson(params: Record<string, unknown>): string {
  // Stable key order so the same params always produce the same bytes (PIC-60).
  return canonicalize(params);
}

/** Recursively serialise `value` to canonical JSON with object keys in stable ascending order. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((element) => canonicalize(element)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const members = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The chosen channel for a canonical payload: env var below the threshold, temp file at/above. */
export type ParamsChannelPlan =
  | { readonly kind: "env"; readonly value: string }
  | { readonly kind: "file"; readonly contents: string };

/**
 * Choose the channel by the pinned byte threshold (PIC-60): a canonical payload
 * strictly below `SUBAGENT_PARAMS_THRESHOLD_BYTES` rides the env var; a payload
 * at or above rides a 0600 temp file. Byte length is measured as UTF-8, not
 * UTF-16 code units.
 */
export function chooseParamsChannel(canonicalJson: string): ParamsChannelPlan {
  // Byte length measured as UTF-8, not UTF-16 code units (PIC-60). Strictly below
  // the threshold rides the env var; at or above rides the 0600 temp file.
  const byteLength = Buffer.byteLength(canonicalJson, "utf8");
  if (byteLength < SUBAGENT_PARAMS_THRESHOLD_BYTES) {
    return { kind: "env", value: canonicalJson };
  }
  return { kind: "file", contents: canonicalJson };
}

// ---------------------------------------------------------------------------
// Parent-side marshalling.
// ---------------------------------------------------------------------------

/** Injected fs seam the parent-side marshalling drives (fake in tests; real fs at the composition root). */
export interface ParamsMarshalDeps {
  /** Write `contents` to a fresh temp file at `mode` and return its path (0600 channel). */
  readonly writeTempFile: (contents: string, mode: number) => string;
  /** Delete the temp file (the parent-`finally` backstop). */
  readonly unlink: (path: string) => void;
}

/** The marshalled params outcome: the child env patch + the parent-`finally` cleanup backstop. */
export interface MarshalledParams {
  /** The env patch to fold into the child env — exactly one of the two carriers. */
  readonly env: Record<string, string>;
  /** The temp-file path on the file channel (absent on the env channel). */
  readonly tempFilePath?: string;
  /** The parent-`finally` backstop: delete the temp file (a no-op on the env channel). */
  readonly cleanup: () => void;
}

/**
 * Marshal the already-typed params for the child: canonicalise, choose the
 * channel, and (on the file channel) write the 0600 temp file. Returns the env
 * patch and a `cleanup` closure the parent's per-invocation `finally` runs as
 * the backstop delete (PIC-60 / PIC-9 teardown).
 */
export function marshalParams(
  params: Record<string, unknown>,
  deps: ParamsMarshalDeps,
): MarshalledParams {
  const canonicalJson = canonicalizeParamsJson(params);
  const plan = chooseParamsChannel(canonicalJson);
  if (plan.kind === "env") {
    // Below-threshold: the canonical JSON rides the env var; the cleanup backstop
    // is a no-op (nothing to delete).
    return {
      env: { [SUBAGENT_PARAMS_ENV]: plan.value },
      cleanup: (): void => {},
    };
  }
  // At/above-threshold: write the 0600 temp file and carry its path on the file
  // env var; the large payload does NOT also ride the env var (that would defeat
  // the cutover). The parent-`finally` backstop deletes the temp file.
  const tempFilePath = deps.writeTempFile(plan.contents, SUBAGENT_PARAMS_TEMP_FILE_MODE);
  return {
    env: { [SUBAGENT_PARAMS_FILE_ENV]: tempFilePath },
    tempFilePath,
    cleanup: (): void => {
      deps.unlink(tempFilePath);
    },
  };
}

// ---------------------------------------------------------------------------
// Child-side intake + validation.
// ---------------------------------------------------------------------------

/** Injected fs seam the child-side intake drives (fake in tests). */
export interface ParamsIntakeDeps {
  /** Read the temp file's contents (file channel). */
  readonly readFile: (path: string) => string;
  /** Delete the temp file after reading it (the child deletes on read, PIC-60). */
  readonly unlink: (path: string) => void;
}

/**
 * Read the marshalled params from the child env: the `PI_THETA_PARAMS` value, or
 * the `PI_THETA_PARAMS_FILE` file's contents (which the child then DELETES).
 * Returns the parsed (not-yet-validated) JSON value, or `undefined` when neither
 * carrier is present. A payload that fails to parse as JSON is a fail-closed
 * boundary throw (it never silently proceeds).
 */
export function readMarshalledParams(
  env: Readonly<Record<string, string | undefined>>,
  deps: ParamsIntakeDeps,
): unknown {
  // Below-threshold: read the canonical JSON from the env var (no file touched).
  const inlineJson = env[SUBAGENT_PARAMS_ENV];
  if (inlineJson !== undefined) {
    return parseParamsJson(inlineJson);
  }
  // At/above-threshold: read the temp file's contents, then DELETE it (the child
  // deletes on read, PIC-60).
  const filePath = env[SUBAGENT_PARAMS_FILE_ENV];
  if (filePath !== undefined) {
    const contents = deps.readFile(filePath);
    deps.unlink(filePath);
    return parseParamsJson(contents);
  }
  // Neither carrier present.
  return undefined;
}

/** Parse marshalled params JSON; a parse failure is a fail-closed boundary throw (PIC-60). */
function parseParamsJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (parseError: unknown) { // allow-broad-catch: theta/runtime/subagent-params-validation-failed — pi-integration-contract/subagent.md PIC-60
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`marshalled params failed to parse as JSON: ${message}`);
  }
}

/** The callee's `params:` schema validator the child validates the received JSON against. */
export interface ParamsSchemaValidator {
  validate(
    params: unknown,
  ): { readonly ok: true } | { readonly ok: false; readonly errorPath: string; readonly detail: string };
}

/** The child-side intake outcome: bound params (binder bypassed) or a fail-closed refusal. */
export type ChildParamsIntake =
  | { readonly ok: true; readonly params: Record<string, unknown>; readonly binderBypassed: true }
  | { readonly ok: false; readonly error: InvokeInfraError; readonly diagnostic: Diagnostic };

/**
 * Child-side intake: read the marshalled params, validate them against the
 * callee's `params:` schema, and — on success — return them bound with the
 * binder BYPASSED entirely (the marshalled path never re-enters the binder,
 * PIC-60). On a parse or schema-validation failure, refuse the invocation
 * fail-closed with `theta/runtime/subagent-params-validation-failed` and
 * `Err(InvokeInfraError { cause: "validation" })` to an `invoke` parent.
 */
export function intakeChildParams(
  env: Readonly<Record<string, string | undefined>>,
  validator: ParamsSchemaValidator,
  deps: ParamsIntakeDeps,
): ChildParamsIntake {
  let parsed: unknown;
  try {
    parsed = readMarshalledParams(env, deps);
  } catch (readError: unknown) { // allow-broad-catch: theta/runtime/subagent-params-validation-failed — pi-integration-contract/subagent.md PIC-60
    return refuseParams("", readError instanceof Error ? readError.message : String(readError));
  }
  const result = validator.validate(parsed);
  if (!result.ok) {
    return refuseParams(result.errorPath, result.detail);
  }
  // PIC-60: the marshalled path never re-enters the binder — the validated params
  // are bound directly with the binder BYPASSED entirely.
  return { ok: true, params: parsed as Record<string, unknown>, binderBypassed: true };
}

/** Build the fail-closed params refusal: pinned diagnostic + Err(invoke_infra validation). */
function refuseParams(errorPath: string, detail: string): ChildParamsIntake {
  const location = errorPath.length > 0 ? ` at ${errorPath}` : "";
  const message = `subagent marshalled params failed schema validation${location}: ${detail}`;
  return {
    ok: false,
    error: {
      kind: "invoke_infra",
      message,
      callee_path: "",
      cause: "validation",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_PARAMS_VALIDATION_FAILED_CODE,
      message,
    },
  };
}
