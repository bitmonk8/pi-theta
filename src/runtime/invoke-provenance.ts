// V15g / V15g-T — the per-`invoke`-hop invocation-record provenance seam.
//
// This module owns the producer seam that, for an executed `invoke` hop,
// records into the per-frame invocation record:
//
//   - the parent theta's **post-`realpath`** path — the same `realpath`-normalised,
//     forward-slash-normalised parent path V15a captures for discovery-root
//     containment (invocation.md §Resolution), minted through the shared
//     `canonicalizePath` identity so both consumers agree byte-for-byte; and
//   - the **1-indexed source line** of the call-site token that produced the
//     `invoke_callee` hop: the `invoke(` token of a literal `invoke(...)`
//     expression, or the callee-name identifier of a `.theta`-callable
//     bare-identifier call (slash-invocation.md §SLSH-5). The line is the
//     call-site token's, not any receiving binding's, so multi-line calls are
//     unambiguous.
//
// This is the seam V12b consumes to render its SLSH-5 chain-attribution suffix
// `from <callee_path> invoked at <parent_path>:<line>`; this leaf is its
// producer, V12b the consumer.
//
// V15g implements the producer: it canonicalises the parent path through the
// shared `canonicalizePath` identity and records the call-site token's
// 1-indexed source line — the `invoke(` token of a literal call, or the
// callee-name identifier of a `.theta`-callable bare call — never a receiving
// binding's line.
//
// Spec: invocation.md (§Resolution), slash-invocation.md (§SLSH-5).

import type { FileSystem } from "../seams/file-system";
import type { Position } from "../diagnostics/diagnostic";
import { canonicalizePath } from "./invocation";

/**
 * The call-site token descriptor for the two theta 1.0 invocation surfaces that
 * produce an `invoke_callee` hop (slash-invocation.md §SLSH-5). Each arm carries
 * the token whose 1-indexed source line the provenance record captures.
 */
export type InvokeCallSite =
  | {
      /** A literal `invoke(...)` / `invoke<Schema>(...)` expression. */
      readonly style: "literal_invoke";
      /**
       * The `invoke(` token position — specifically the `invoke` keyword
       * beginning the call expression. Its `line` is the recorded call-site
       * line, not that of any receiving binding on an earlier line.
       */
      readonly invokeToken: Position;
    }
  | {
      /**
       * A `.theta`-callable bare-identifier call (e.g. `summarise(doc)` when
       * `./summariser.theta` is registered in `tools:`), operationally
       * equivalent to `invoke(...)` per Tool Calls — Relationship with invoke.
       */
      readonly style: "theta_callable_bare";
      /**
       * The callee-name identifier token position (e.g. the `summarise` token).
       * Its `line` is the recorded call-site line.
       */
      readonly calleeNameToken: Position;
    };

/**
 * The per-frame invocation record this seam produces for one executed `invoke`
 * hop. V12b reads it to render `from <callee_path> invoked at <parent_path>:<line>`.
 */
export interface InvocationRecord {
  /**
   * The parent theta's **post-`realpath`** absolute path — the same
   * `realpath`-normalised value V15a captures for discovery-root containment
   * (invocation.md §Resolution). This is `<parent_path>` in the SLSH-5 suffix.
   */
  readonly parentPath: string;
  /**
   * The **1-indexed** source line of the call-site token in the parent theta
   * (the `invoke(` token, or the `.theta`-callable callee-name identifier) — the
   * `<line>` in the SLSH-5 suffix. Never a receiving binding's line.
   */
  readonly callSiteLine: number;
}

/** Host dependencies the provenance producer needs. */
export interface InvocationProvenanceDeps {
  /** The injected `FileSystem` seam; only `realpath` is consulted (post-`realpath` parent path). */
  readonly fs: Pick<FileSystem, "realpath">;
}

/** Inputs to one `invoke`-hop provenance record. */
export interface InvocationProvenanceInput {
  /**
   * The parent theta's path as resolved at the call site (pre-`realpath`); the
   * producer canonicalises it through `canonicalizePath` so the recorded
   * `parentPath` is byte-identical to the form V15a's containment check uses.
   */
  readonly parentPath: string;
  /** The call-site token descriptor whose 1-indexed line is recorded. */
  readonly callSite: InvokeCallSite;
}

/**
 * Produce the per-frame invocation record for one executed `invoke` hop: the
 * parent theta's post-`realpath` path and the call-site token's 1-indexed line
 * (slash-invocation.md §SLSH-5; invocation.md §Resolution).
 *
 * The parent path is canonicalised through the shared `canonicalizePath`
 * identity so the recorded `parentPath` is byte-identical to the form V15a's
 * discovery-root containment check uses. The recorded `callSiteLine` is
 * the 1-indexed source line of the call-site token — the `invoke(` token for a
 * literal `invoke(...)` call, or the callee-name identifier for a
 * `.theta`-callable bare-identifier call — never a receiving binding's line.
 */
export async function recordInvocationProvenance(
  deps: InvocationProvenanceDeps,
  input: InvocationProvenanceInput,
): Promise<InvocationRecord> {
  const parentPath = await canonicalizePath(deps.fs, input.parentPath);
  const callSiteLine =
    input.callSite.style === "literal_invoke"
      ? input.callSite.invokeToken.line
      : input.callSite.calleeNameToken.line;
  return { parentPath, callSiteLine };
}
