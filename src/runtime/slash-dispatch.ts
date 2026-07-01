// V12a / V12a-T — slash dispatch: no-params overflow (SLSH-1) and prompt-mode
// user-visible streaming ordering (SLSH-2).
//
// Spec: slash-invocation.md SLSH-1 (no-params overflow note) and SLSH-2
// (user-visible streaming: streamed tokens observable before the interpreter
// resumes; the forced-respond turn runs off-session with no transcript card; on
// an `Err` propagated by `?` after partial assistant text, and on mid-stream
// cancellation, the streamed prefix is retained and the `loom-system-note` is
// appended AFTER the prefix, never interleaved).
//
// V12a-T (tests-task) declares the seam shapes and stubs every behaviour-bearing
// function inertly / non-compliantly, so the failing V12a-T tests red on their
// own primary assertions:
//   - `renderNoParamsOverflowNote` returns a sentinel, not the SLSH-1 template;
//   - `dispatchNoParamsLoom` emits the overflow note UNCONDITIONALLY (ignoring
//     the trim-to-empty rule and the slash-path-only rule);
//   - `rendersTranscriptCard` reports EVERY turn kind as card-rendering,
//     including the off-session forced-respond turn (SLSH-2);
//   - `driveSlashPromptTurn` appends the failure/cancellation note WITHOUT
//     streaming the turn or awaiting `ctx.waitForIdle()` — the
//     buffer-then-append / note-before-prefix anti-pattern SLSH-2 forbids.
// The paired V12a implementation fills these in. No test reds on a compile
// error, a missing fixture, or a harness throw.

import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteDetails,
} from "../extension/system-note-channel";

// ===========================================================================
// SLSH-1 — no-params slash-argument overflow.
// ===========================================================================

/**
 * SLSH-1 no-params overflow note (slash-invocation.md#slsh-1): the exact
 * template `loom /<name>: ignoring extra arguments — this loom takes no
 * parameters`, with `<name>` interpolated. The V12a-T stub returns a sentinel
 * so the exact-string assertion reds.
 */
export function renderNoParamsOverflowNote(name: string): string {
  // NON-COMPLIANT stub: not the SLSH-1 template. The paired V12a returns
  // `loom /${name}: ignoring extra arguments — this loom takes no parameters`.
  void name;
  return "<no-params-overflow-note not implemented>";
}

/**
 * How the loom was reached. SLSH-1 fires the overflow note only on the
 * slash-invocation path; `invoke(...)` and registered-tool callers skip the
 * slash parser entirely and have no notion of "extra text".
 */
export type SlashCallerKind = "slash" | "invoke" | "tool";

/** Inputs to a no-params dispatch. */
export interface NoParamsDispatchInput {
  /** The loom's slash name (its filename stem), e.g. `greet`. */
  readonly name: string;
  /** The raw slash-argument text after the command name (untrimmed). */
  readonly rawArgs: string;
  /** Which invocation path reached the loom. */
  readonly caller: SlashCallerKind;
}

/** Collaborators for a no-params dispatch. */
export interface NoParamsDispatchDeps {
  /** Emit the overflow `loom-system-note` (before the loom runs). */
  readonly emitOverflowNote: (note: string) => void;
  /** Run the loom body (always invoked — the note never blocks execution). */
  readonly run: () => Promise<void>;
}

/**
 * Dispatch a no-params loom (SLSH-1). On the slash path the runtime trims
 * leading/trailing slash-argument whitespace from `rawArgs`; if the trimmed
 * remainder is non-empty it emits exactly one overflow note BEFORE running,
 * then runs. A whitespace-only remainder trims to empty and emits no note. The
 * note is slash-path-only — `invoke`/`tool` callers never emit it. The loom
 * always runs (the note is informational and never blocks execution).
 */
export async function dispatchNoParamsLoom(
  input: NoParamsDispatchInput,
  deps: NoParamsDispatchDeps,
): Promise<void> {
  // NON-COMPLIANT stub: emit the overflow note UNCONDITIONALLY — ignoring both
  // the trim-to-empty rule (whitespace-only must stay silent) and the
  // slash-path-only rule (`invoke`/`tool` callers must not emit) — then run.
  // The paired V12a trims `rawArgs`, gates on `caller === "slash"` and a
  // non-empty trimmed remainder, and emits `renderNoParamsOverflowNote(name)`.
  deps.emitOverflowNote(renderNoParamsOverflowNote(input.name));
  await deps.run();
}

// ===========================================================================
// SLSH-2 — user-visible streaming ordering.
// ===========================================================================

/**
 * A prompt-mode turn kind. A `user_visible` turn (untyped/typed free-phase
 * query) streams into the user session and renders an ordinary transcript card;
 * the `forced_respond` turn that obtains the schema-conformant response via the
 * synthesised one-shot tool is dispatched off-session through pi-ai's
 * `complete()` free function and attaches no turn to the user session, so it
 * renders NO transcript card (SLSH-2).
 */
export type PromptTurnKind = "user_visible" | "forced_respond";

/**
 * Whether a prompt-mode turn attaches a rendered transcript card to the user
 * session (SLSH-2). `user_visible` turns do; the off-session `forced_respond`
 * turn does not.
 */
export function rendersTranscriptCard(kind: PromptTurnKind): boolean {
  // NON-COMPLIANT stub: reports EVERY turn kind as card-rendering, including the
  // off-session forced-respond turn. The paired V12a returns `false` for
  // `forced_respond`.
  void kind;
  return true;
}

/**
 * The terminal outcome of the driven prompt-mode turn, from the loom's
 * perspective. `ok` appends no note; `err` (an `Err` propagated by `?`) and
 * `cancelled` (mid-stream cancellation) each append a single `loom-system-note`
 * AFTER the streamed prefix.
 */
export type SlashTurnOutcome =
  | { readonly kind: "ok" }
  | { readonly kind: "err"; readonly note: string }
  | { readonly kind: "cancelled"; readonly note: string };

/** The narrow session surface the prompt-mode driver drives. */
export interface SlashPromptPi {
  /** Issue the rendered query text as one streamed user-visible prompt turn. */
  sendUserMessage(content: string): void;
  /** Append a `loom-system-note` (the failure / cancellation surface). */
  sendMessage(message: {
    readonly customType: string;
    readonly content: string;
    readonly display: boolean;
    readonly details: SystemNoteDetails;
  }): void;
}

/** The dispatch context surface the driver awaits. */
export interface SlashPromptCtx {
  /** Resolves only after the driven turn goes idle (its `agent_end`). */
  waitForIdle(): Promise<void>;
}

/** Collaborators for the prompt-mode streaming driver. */
export interface SlashPromptDriveDeps {
  readonly pi: SlashPromptPi;
  readonly ctx: SlashPromptCtx;
  /** The terminal outcome to surface after the streamed turn settles. */
  readonly outcome: SlashTurnOutcome;
}

/**
 * Drive one user-visible prompt-mode turn (SLSH-2): issue `queryText` as a
 * streamed user turn (tokens observable in the transcript before the
 * interpreter resumes), await `ctx.waitForIdle()` so the streamed prefix is
 * committed, and — on `err`/`cancelled` — append the failure/cancellation
 * `loom-system-note` AFTER the committed prefix (never interleaved with it).
 */
export async function driveSlashPromptTurn(
  queryText: string,
  deps: SlashPromptDriveDeps,
): Promise<void> {
  // NON-COMPLIANT stub: append the note FIRST (before any streamed prefix) and
  // never issue the streamed turn nor await `ctx.waitForIdle()` — the
  // buffer-then-append / note-before-prefix anti-pattern SLSH-2 forbids. The
  // paired V12a issues the turn, awaits idle, then appends the note last.
  if (deps.outcome.kind !== "ok") {
    deps.pi.sendMessage({
      customType: SYSTEM_NOTE_CHANNEL,
      content: deps.outcome.note,
      display: true,
      details: { event: {} },
    });
  }
  deps.pi.sendUserMessage(queryText);
  void queryText;
}
