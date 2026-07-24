// RFC-0005 — `.theta` callable content-hash marshalling + child-side verification.
//
// A `.theta` callable name in `--tools` resolves against the CHILD's own
// registry (the theta extension loads in the child and re-discovers the same
// files from disk). A file edit between parent load and child spawn would make
// the child silently run a callee the parent never validated. The parent
// therefore records, at load time, a content hash of each `.theta` callable's
// TRANSITIVE CLOSURE (the file plus its `.thetalib` imports) and marshals the
// hashes to the child; the child verifies after its own parse and refuses the
// invocation on mismatch (fail-closed) with
// `theta/runtime/subagent-callable-hash-mismatch`.
//
// Spec: pi-integration-contract/subagent.md #subagent-theta-callable-hash,
// §Resolution snapshot (subagent leg); diagnostics/code-registry-runtime.md
// (`theta/runtime/subagent-callable-hash-mismatch`).

import { createHash } from "node:crypto";
import type { Diagnostic } from "../diagnostics/diagnostic";

/** `theta/runtime/subagent-callable-hash-mismatch` — child refuses on mismatch. */
export const SUBAGENT_CALLABLE_HASH_MISMATCH_CODE = "theta/runtime/subagent-callable-hash-mismatch";

/**
 * The env-var carrier the parent marshals the `.theta` callable content hashes
 * to the child through (a JSON map `{ callable name: "sha256:..." }`), not argv.
 * The child (env-marked theta extension) reads it and verifies each hash after
 * its own parse (`verifyCallableHash`), refusing the invocation on mismatch
 * (fail-closed). Env rather than argv keeps the hashes off the visible command
 * line and out of `--tools` (subagent.md #subagent-theta-callable-hash).
 */
export const SUBAGENT_CALLABLE_HASHES_ENV = "PI_THETA_SUBAGENT_CALLABLE_HASHES";

/** Registry Message column renderer for the hash-mismatch refusal. */
export function renderCallableHashMismatchMessage(callableName: string): string {
  return `subagent callable '${callableName}' content hash mismatch; refusing invocation`;
}

/** One source file in a callable's transitive closure (root `.theta` or a `.thetalib` import). */
export interface ClosureSource {
  /** The file path (used only for deterministic ordering; not hashed into content). */
  readonly path: string;
  /** The file's exact on-disk content. */
  readonly content: string;
}

/**
 * Hash a `.theta` callable's transitive closure: the root file plus every
 * `.thetalib` it transitively imports. The hash MUST change when any closure
 * member's content changes (an import edit changes behaviour as much as a
 * root-file edit) and MUST be independent of the input array's order (the
 * closure is a set). The parent records this at load; the child recomputes it
 * from its own parse and compares.
 */
export function hashCallableClosure(sources: readonly ClosureSource[]): string {
  // Order-independent: sort by path so the closure is treated as a set. The path
  // itself is NOT hashed into content (per `ClosureSource`); only each member's
  // exact content contributes, length-prefixed so no concatenation ambiguity
  // ("ab"+"c" vs "a"+"bc") can collide two distinct closures.
  const sorted = [...sources].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const hash = createHash("sha256");
  for (const source of sorted) {
    hash.update(String(source.content.length));
    hash.update("\n");
    hash.update(source.content);
  }
  return `sha256:${hash.digest("hex")}`;
}

/** The child-side verification outcome. */
export type CallableHashVerification =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * Child-side verification: compare the hash the parent marshalled (`expected`)
 * against the hash the child recomputed from its own parse (`observed`). On
 * mismatch, refuse the invocation fail-closed with
 * `theta/runtime/subagent-callable-hash-mismatch` (message names the callable;
 * `hint` carries expected vs. observed).
 */
export function verifyCallableHash(
  callableName: string,
  expected: string,
  observed: string,
): CallableHashVerification {
  if (expected === observed) {
    return { ok: true };
  }
  // Fail-closed: the callee's source was edited between parent load and child
  // spawn; the child refuses the invocation. `hint` carries expected vs. observed.
  return {
    ok: false,
    diagnostic: {
      severity: "error",
      code: SUBAGENT_CALLABLE_HASH_MISMATCH_CODE,
      message: renderCallableHashMismatchMessage(callableName),
      hint: `expected ${expected}, observed ${observed}`,
    },
  };
}
