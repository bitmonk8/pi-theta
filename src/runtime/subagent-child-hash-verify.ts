// RFC-0005 — child-side `.theta` callable content-hash verification.
//
// The parent records, at load time, a content hash of each `.theta` callable's
// transitive closure (root file + `.thetalib` imports) and marshals the hashes
// to the child through the `PI_THETA_SUBAGENT_CALLABLE_HASHES` env carrier
// (subagent.md #subagent-theta-callable-hash). Because the child re-discovers
// the same `.theta` / `.thetalib` files from disk, a file edit between parent
// load and child spawn would make the child silently run a callee the parent
// never validated — a silent-divergence failure mode, racy under parallel
// siblings. The child therefore recomputes each callable's closure hash from
// ITS OWN discovery and verifies it against the marshalled hash; on mismatch it
// refuses the invocation FAIL-CLOSED with
// `theta/runtime/subagent-callable-hash-mismatch` and the registry-pinned
// message.
//
// WHERE the refusal surfaces: the diagnostics registry pins this as a
// `theta/runtime/*` (runtime) code, and the spec says the child "refuses the
// invocation on mismatch". One child process serves exactly one subagent-mode
// invocation (subagent.md — Conversation drive), so the child's own run IS that
// invocation; a fail-closed refusal recorded during the child's discovery pass
// is a refusal of the invocation from the parent's vantage. This module is the
// pure verification mechanism; the production wiring in
// `production-composition.ts` calls it over `process.env` + a discovery view
// derived from the child-discovered thetas and refuses each mismatched callable.
//
// Design: pure and injectable — the caller supplies the env map and a discovery
// view (callable name → child-discovered closure sources), so mismatch refusal
// and match acceptance are unit-testable offline without spawning a real child.
//
// Spec: pi-integration-contract/subagent.md #subagent-theta-callable-hash,
// #subagent-launch-contract; diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-callable-hash-mismatch`).

import type { Diagnostic } from "../diagnostics/diagnostic";
import { SUBAGENT_CHILD_ENV_MARKER } from "./subagent-launcher";
import {
  hashCallableClosure,
  verifyCallableHash,
  renderCallableHashMismatchMessage,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_CALLABLE_HASH_MISMATCH_CODE,
  type ClosureSource,
  type CallableHashVerification,
} from "./subagent-callable-hash";

/**
 * The child-discovered closure-source view: the transitive-closure sources
 * (root `.theta` + every `.thetalib` it imports) for a marshalled callable
 * name, or `undefined` when the child discovered no such callable (a deleted /
 * moved / `as`-renamed callee the child cannot re-resolve). `undefined` is a
 * fail-closed refusal — the child cannot recompute the hash the parent
 * validated, so it MUST NOT admit the invocation.
 */
export type ChildClosureDiscovery = (
  callableName: string,
) => readonly ClosureSource[] | undefined;

/**
 * Read the marshalled `.theta` callable hashes the parent placed on the child
 * env. Returns `undefined` when this process is NOT a subagent child
 * (`PI_THETA_SUBAGENT_CHILD !== "1"`) or when no hashes were marshalled (the
 * theta declared no `.theta` callables, or none had a readable closure). The
 * map is `{ presented callable name → "sha256:..." }`. A malformed carrier is a
 * `SyntaxError` from `JSON.parse` and is intentionally NOT caught here — a
 * corrupt hash carrier fails the child loudly (fail-closed at the boundary)
 * rather than silently skipping verification.
 */
export function readMarshalledCallableHashes(
  env: Readonly<Record<string, string | undefined>>,
): ReadonlyMap<string, string> | undefined {
  if (env[SUBAGENT_CHILD_ENV_MARKER] !== "1") {
    return undefined;
  }
  const raw = env[SUBAGENT_CALLABLE_HASHES_ENV];
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${SUBAGENT_CALLABLE_HASHES_ENV} is not a JSON object of { callable: hash }`,
    );
  }
  const map = new Map<string, string>();
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error(
        `${SUBAGENT_CALLABLE_HASHES_ENV} entry '${name}' is not a string hash`,
      );
    }
    map.set(name, value);
  }
  return map;
}

/** One callable's verification outcome. */
export interface ChildCallableVerification {
  readonly callableName: string;
  readonly verification: CallableHashVerification;
}

/** The child-side verification result over every marshalled callable. */
export interface ChildHashVerifyResult {
  /** `true` iff this process is a subagent child carrying marshalled hashes. */
  readonly active: boolean;
  /** Per-callable outcomes (empty when inactive). */
  readonly outcomes: readonly ChildCallableVerification[];
  /**
   * The fail-closed refusal diagnostics (mismatch or child-source-unavailable),
   * in marshalled-name order — the subset of `outcomes` whose verification
   * failed. Each carries `theta/runtime/subagent-callable-hash-mismatch` and the
   * registry-pinned message.
   */
  readonly refusals: readonly Diagnostic[];
}

/**
 * Verify each marshalled callable's parent-recorded closure hash against the
 * hash the child recomputes from its own discovery (`hashCallableClosure` over
 * the child-discovered sources). A callable whose child-side closure the
 * discovery view cannot supply is refused fail-closed (the child cannot
 * reproduce the parent's validated bytes). A matching hash admits the callable.
 *
 * Pure over its inputs: pass a fake `env` and a fake `discovery` to exercise
 * mismatch refusal and match acceptance offline.
 */
export function verifyChildCallableHashes(input: {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly discovery: ChildClosureDiscovery;
}): ChildHashVerifyResult {
  const marshalled = readMarshalledCallableHashes(input.env);
  if (marshalled === undefined) {
    return { active: false, outcomes: [], refusals: [] };
  }
  const outcomes: ChildCallableVerification[] = [];
  const refusals: Diagnostic[] = [];
  for (const [callableName, expected] of marshalled) {
    const verification = verifyOne(callableName, expected, input.discovery);
    outcomes.push({ callableName, verification });
    if (!verification.ok) {
      refusals.push(verification.diagnostic);
    }
  }
  return { active: true, outcomes, refusals };
}

/** Verify one callable: recompute the child-side closure hash and compare. */
function verifyOne(
  callableName: string,
  expected: string,
  discovery: ChildClosureDiscovery,
): CallableHashVerification {
  const sources = discovery(callableName);
  if (sources === undefined || sources.length === 0) {
    // Fail-closed: the child cannot recompute the closure hash the parent
    // validated (the callee source is missing / unresolvable child-side).
    return {
      ok: false,
      diagnostic: {
        severity: "error",
        code: SUBAGENT_CALLABLE_HASH_MISMATCH_CODE,
        message: renderCallableHashMismatchMessage(callableName),
        hint: `expected ${expected}, observed <child source unavailable>`,
      },
    };
  }
  return verifyCallableHash(callableName, expected, hashCallableClosure(sources));
}
