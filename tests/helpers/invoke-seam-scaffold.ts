// A shared no-op `ExecuteBodyDeps` scaffold for driving the real `executeBody`
// over an injected `InvokeChild` boundary double (PTQ-0244).
//
// WHY THIS FILE EXISTS. The `SEAM_NOOP_CHECKPOINT` / `SEAM_NOOP_SINK` /
// `SEAM_NOOP_MUTATOR` no-op triple, `span()`, and the `RecordedHop` SLSH-5
// hop-recording shape are byte-for-byte identical across several
// `executeBody`-driving invoke/code-call bug-witness files (bug 0294, bug
// 0295, bug 0347, bug 0349). This module centralises the pieces that are
// pure scaffolding — inert stand-ins for seams the driven cell does not itself
// exercise — so a file that needs them can import rather than retype them;
// the `seamDeps`-shaped driver each file builds ON TOP of this scaffold stays
// local, since its call-routing differs per bug.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. Nothing here is stubbed beyond the no-op
// seam stand-ins themselves; the real `executeBody` /
// `createEffectfulStatementHost` drive the actual production code under test.

import type { Checkpoint } from "../../src/seams/checkpoint";
import type { ToolLoweringSink } from "../../src/runtime/tool-call-execute";
import type {
  CommittedConversationMutator,
  CommittedSurface,
} from "../../src/runtime/terminal-outcomes";
import type { SourceRange } from "../../src/diagnostics/diagnostic";
import type { InvokeCalleeError } from "../../src/runtime/query-error";
import type { InvokeCallSite } from "../../src/runtime/invoke-provenance";

/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A `ToolLoweringSink` that discards every diagnostic/system-note. */
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

/** A `CommittedConversationMutator` whose every method is a no-op. */
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

/** A throwaway 1:1–1:2 `SourceRange`, for a scaffold expr/site that carries no
 *  real source position. */
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** One recorded SLSH-5 hop (`deps.recordInvokeHop` fires only when a wrap
 *  decision constructs an `invoke_callee` wrapper). */
export interface RecordedHop {
  readonly wrapper: InvokeCalleeError;
  readonly calleePath: string;
  readonly callSite: InvokeCallSite;
}
