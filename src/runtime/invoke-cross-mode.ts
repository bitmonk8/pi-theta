// V15l / V15l-T — the invoke fresh-vs-attach cross-mode matrix seam.
//
// This module owns the cross-mode matrix selection split out of `V15a`
// (invocation-core) per conventions.md §smallest-shippable-leaf, mirroring the
// V15f/V15g/V15h/V15k carve-out pattern. The matrix (invocation.md §Cross-mode
// semantics; the canonical enumeration is subagent.md "Subagent state-isolation
// matrix") selects whether an `invoke`d callee attaches to its caller's current
// conversation or spawns a fresh isolated one, and fixes that every callee's
// inference call uses the child's own configured model/tools/system rather than
// the parent's (invocation.md §Tools and model — the caller's settings are not
// inherited).
//
// Scope of this leaf — the three in-scope cross-mode cells:
//   - prompt   → subagent : fresh isolated conversation, only the return value
//     reaches the caller.
//   - subagent → subagent : fresh isolated conversation, sibling to the caller's.
//   - subagent → prompt   : attaches to the caller subagent's own private
//     conversation (nothing leaks to the grandparent).
// The prompt → prompt parent-suspend + `setActiveTools` snapshot/restore cell is
// owned by `V15d` and is out of scope here (invocation.md §Cross-mode semantics
// prompt→prompt paragraph; coverage-matrix cka-15 → V15d).
//
// The selection is by the CALLEE mode alone; the caller mode is irrelevant to
// the decision (invocation.md §Cross-mode semantics: "The caller's mode is
// irrelevant to that decision").
//
// V15l-T (tests-task) declares the seam shapes and stubs the behaviour-bearing
// functions inertly so the failing tests compile and red on their own primary
// assertions:
//   - `selectCalleeContext` returns the INVERTED mapping (subagent → "attach",
//     prompt → "fresh"), so every cell's context assertion reds.
//   - `composeCalleeSession` returns a composition wrong on every observable:
//     the inverted context, the caller's prior messages regardless of context
//     (a fresh callee must start empty), and the PARENT's inference config
//     (every callee must use the child's).
// No test reds on a compile error, a missing fixture, or a harness throw.
//
// V15l (implementation) fills in the behaviour V15l-T's tests pin:
//   - `selectCalleeContext(calleeMode)` → "fresh" for subagent, "attach" for prompt.
//   - `composeCalleeSession(input)` → a fresh-context callee starts with no prior
//     conversation messages; an attach-context callee carries the caller's
//     current conversation messages; and the inference config is always the
//     child's.
//
// Spec: invocation.md (§Cross-mode semantics, §Tools and model, §Final-value
// propagation across callees), pi-integration-contract/subagent.md (Subagent
// state-isolation matrix).

/** A loom file's conversation mode. */
export type LoomMode = "prompt" | "subagent";

/**
 * The callee's context selection: a **fresh** isolated conversation, or
 * **attach** to the caller's current conversation. Selected by the callee mode
 * alone (invocation.md §Cross-mode semantics).
 */
export type CalleeContext = "fresh" | "attach";

/**
 * The inference configuration (model / tools / system) an inference call uses.
 * Per invocation.md §Tools and model, a callee's inference call uses the
 * child's own configuration; the caller's settings are not inherited.
 */
export interface InferenceConfig {
  readonly model: string;
  readonly tools: readonly string[];
  readonly system: string;
}

/** One prior message on a conversation. */
export interface ConversationMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** One cell of the cross-mode matrix: the caller's and callee's modes. */
export interface CrossModeCell {
  readonly callerMode: LoomMode;
  readonly calleeMode: LoomMode;
}

/** The caller's current conversation state at the `invoke(...)` call site. */
export interface CallerConversation {
  /** The caller's current conversation's prior messages. */
  readonly messages: readonly ConversationMessage[];
  /** The caller's own inference configuration (must NOT be inherited by the callee). */
  readonly config: InferenceConfig;
}

/** The `invoke`d callee's own resolved frontmatter configuration. */
export interface CalleeDefinition {
  /** The callee's own inference configuration (its frontmatter model/tools/system). */
  readonly config: InferenceConfig;
}

/** Inputs to the cross-mode composition for one `invoke` hop. */
export interface CrossModeInput {
  readonly cell: CrossModeCell;
  readonly caller: CallerConversation;
  readonly callee: CalleeDefinition;
}

/** The composed session state for an `invoke`d callee, per the cross-mode matrix. */
export interface CalleeSessionComposition {
  /** Whether the callee attaches to the caller's conversation or spawns a fresh one. */
  readonly context: CalleeContext;
  /**
   * The callee's starting conversation messages: for a **fresh** context this is
   * empty (the callee starts with no prior conversation messages); for an
   * **attach** context it is the caller's current conversation messages
   * (invocation.md §Cross-mode semantics).
   */
  readonly priorMessages: readonly ConversationMessage[];
  /**
   * The configuration every callee's inference call uses — always the child's,
   * never the parent's (invocation.md §Tools and model).
   */
  readonly inferenceConfig: InferenceConfig;
}

/**
 * Select the callee's context (fresh vs attach) from the callee mode
 * (invocation.md §Cross-mode semantics). The caller mode is irrelevant to the
 * decision.
 *
 * A subagent-mode callee spawns a **fresh** isolated conversation (prompt→
 * subagent, subagent→subagent); a prompt-mode callee **attaches** to the
 * caller's current conversation (subagent→prompt). Selection is by the callee
 * mode alone — the caller mode does not change the decision.
 */
export function selectCalleeContext(calleeMode: LoomMode): CalleeContext {
  return calleeMode === "subagent" ? "fresh" : "attach";
}

/**
 * Compose the `invoke`d callee's session state from the cross-mode cell, the
 * caller's conversation, and the callee's own configuration (invocation.md
 * §Cross-mode semantics, §Tools and model).
 *
 * A **fresh**-context callee starts with no prior conversation messages; an
 * **attach**-context callee carries the caller's current conversation messages
 * (invocation.md §Cross-mode semantics). Every callee's inference call uses the
 * child's own configured model/tools/system, never the parent's (invocation.md
 * §Tools and model).
 */
export function composeCalleeSession(
  input: CrossModeInput,
): CalleeSessionComposition {
  const context = selectCalleeContext(input.cell.calleeMode);
  return {
    context,
    priorMessages: context === "fresh" ? [] : input.caller.messages,
    inferenceConfig: input.callee.config,
  };
}
