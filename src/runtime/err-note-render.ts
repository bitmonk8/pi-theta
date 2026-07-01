// V12b / V12b-T — top-level `Err` formatting and chain attribution at the
// slash-dispatch boundary.
//
// This module owns the renderer that turns a top-level `QueryError` — returned
// to the slash-dispatch boundary by a directly-slash-invoked loom (prompt OR
// subagent mode) — into the single-line `loom-system-note` string Pi appends to
// the user's session:
//
//   - SLSH-3 — a top-level `Err` at the slash-dispatch boundary renders ONE
//     line; for a directly-slash-invoked subagent-mode loom it is the sole
//     user-facing surface for the failure (the transcript stays private).
//   - SLSH-4 — the per-kind note templates (SNK-a … SNK-k) render verbatim; the
//     renderer is total over any unlisted `kind` in the `QueryError` union via
//     the SNK-k catch-all row.
//   - SLSH-5 — chain attribution: when the leaf failure cascaded out of an
//     `invoke`d child via `?` (the rendered error is `invoke_callee`, possibly
//     nested), the renderer appends ` from <callee_path> invoked at
//     <parent_path>:<line>` per `invoke_callee` hop, leaf-first (innermost hop
//     first). The leaf `kind` (the innermost non-`invoke_callee` variant) drives
//     the per-kind row; `<callee_path>` is the wrapper's `callee_path`, and the
//     `<parent_path>:<line>` provenance is consumed from V15g's per-frame
//     invocation record — this leaf renders from that record, it does not
//     derive source positions here.
//
// V12b-T (tests-task) declares this seam and stubs the two render entries
// inertly / non-compliantly (they return a fixed sentinel, ignoring the SLSH-4
// templates and the SLSH-5 chain suffix), so the failing V12b-T tests red on
// their own primary string-equality assertions rather than on a compile error,
// a missing fixture, or a harness throw. The paired V12b implementation fills
// in the per-kind templates and the leaf-first chain walk.
//
// Spec: slash-invocation.md (SLSH-3, SLSH-4, SNK-a…SNK-k, SLSH-5),
// errors-and-results/queryerror-variants.md (the nine-variant union).

import type { InvokeCalleeError, QueryError } from "./query-error";
import type { InvocationRecord } from "./invoke-provenance";

/**
 * The non-compliant stub sentinel. Deliberately NOT any SLSH-4 template and NOT
 * a chain suffix, so every V12b-T assertion that compares against a normative
 * rendered string reds. It is a single line so the SLSH-3 "one line" structural
 * check is not what reds — the per-kind string-equality assertion is.
 */
const UNIMPLEMENTED_ERR_NOTE = "<err-note-render unimplemented>";

/**
 * One `invoke_callee` hop's rendering inputs. Each hop pairs the wrapper's
 * `callee_path` (the invoked child, SLSH-5 `<callee_path>`) with the V15g
 * per-frame invocation record that carries the call-site provenance
 * (`<parent_path>:<line>`). The provenance is consumed from the record, never
 * re-derived here (V12b-T asserts rendering from the record; V15g is its
 * producer).
 */
export interface ChainHop {
  /**
   * The wrapper `InvokeCalleeError.callee_path` — the post-`realpath` absolute
   * path of the invoked child at this hop (SLSH-5 `<callee_path>`).
   */
  readonly calleePath: string;
  /**
   * V15g's per-frame invocation record for this hop: the parent loom's
   * post-`realpath` path and the 1-indexed call-site line (SLSH-5
   * `<parent_path>` and `<line>`).
   */
  readonly record: InvocationRecord;
}

/**
 * Inputs to the top-level `Err`-note renderer (SLSH-3/SLSH-4/SLSH-5).
 */
export interface ErrNoteInput {
  /** The loom's slash name (its filename stem), e.g. `entry`. SLSH `<name>`. */
  readonly loomName: string;
  /**
   * The top-level `QueryError` returned to the slash-dispatch boundary. May be
   * an `invoke_callee` wrapper (possibly nested); the renderer recurses through
   * `inner` to the leaf variant, which drives the per-kind row.
   */
  readonly error: QueryError;
  /**
   * One `ChainHop` per `invoke_callee` hop, in the order the hops are
   * encountered walking `inner` from the top-level error inward (OUTERMOST hop
   * first). Empty for a non-cascaded (non-`invoke_callee`) top-level error. The
   * renderer emits the hop suffixes leaf-first (reversing this order) per
   * SLSH-5.
   */
  readonly chain: readonly ChainHop[];
}

/**
 * SLSH-4 per-kind leaf rendering: render the single-line per-`kind` note for a
 * leaf (non-`invoke_callee`) `QueryError`, verbatim per the SNK-a … SNK-k rows,
 * total over any unlisted `kind` via the SNK-k catch-all. No chain suffix.
 *
 * The V12b-T stub returns the sentinel so the per-kind string assertions red.
 */
export function renderLeafKindNote(loomName: string, leaf: QueryError): string {
  void loomName;
  void leaf;
  return UNIMPLEMENTED_ERR_NOTE;
}

/**
 * SLSH-3/SLSH-4/SLSH-5 top-level renderer: render the one-line `loom-system-note`
 * string for a top-level `Err` at the slash-dispatch boundary. Recurses through
 * any `invoke_callee` wrapper to the leaf variant (which drives the per-kind
 * row), then appends the SLSH-5 chain suffix leaf-first.
 *
 * The V12b-T stub returns the sentinel so the SLSH-3/SLSH-4/SLSH-5 string
 * assertions red on their own primary comparison.
 */
export function renderTopLevelErrNote(input: ErrNoteInput): string {
  void input;
  return UNIMPLEMENTED_ERR_NOTE;
}

/**
 * Narrowing helper the renderer (and its tests) use to recognise the
 * `invoke_callee` wrapper variant. Exported so the paired V12b implementation
 * and the V12b-T tests share one recogniser rather than re-checking the tag
 * inline. Non-behavioural (pure discriminator check), so it is compliant as-is.
 */
export function isInvokeCalleeError(error: QueryError): error is InvokeCalleeError {
  return error.kind === "invoke_callee";
}
