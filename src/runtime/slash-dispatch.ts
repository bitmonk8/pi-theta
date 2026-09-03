// V12a / V12a-T — slash dispatch: no-params overflow (SLSH-1) and prompt-mode
// user-visible streaming ordering (SLSH-2).
//
// Spec: slash-invocation.md SLSH-1 (no-params overflow note) and SLSH-2
// (user-visible streaming: streamed tokens observable before the interpreter
// resumes; the forced-respond turn runs off-session with no transcript card; on
// an `Err` propagated by `?` after partial assistant text, and on mid-stream
// cancellation, the streamed prefix is retained and the `theta-system-note` is
// appended AFTER the prefix, never interleaved).
//
// V12a-T (tests-task) declares the seam shapes and stubs every behaviour-bearing
// function inertly / non-compliantly, so the failing V12a-T tests red on their
// own primary assertions:
//   - `renderNoParamsOverflowNote` returns a sentinel, not the SLSH-1 template;
//   - `dispatchNoParamsTheta` emits the overflow note UNCONDITIONALLY (ignoring
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
import { trimSlashArgumentWhitespace } from "../binder/binder-envelope";

// ===========================================================================
// SLSH-1 — no-params slash-argument overflow.
// ===========================================================================

/**
 * SLSH-1 no-params overflow note (slash-invocation.md#slsh-1): the exact
 * template `theta /<name>: ignoring extra arguments — this theta takes no
 * parameters`, with `<name>` interpolated. The V12a-T stub returns a sentinel
 * so the exact-string assertion reds.
 */
export function renderNoParamsOverflowNote(name: string): string {
  // SLSH-1 normative template (slash-invocation.md#slsh-1), em-dash (U+2014)
  // separator, `<name>` interpolated.
  return `theta /${name}: ignoring extra arguments \u2014 this theta takes no parameters`;
}

/**
 * How the theta was reached. SLSH-1 fires the overflow note only on the
 * slash-invocation path; `invoke(...)` and registered-tool callers skip the
 * slash parser entirely and have no notion of "extra text".
 */
export type SlashCallerKind = "slash" | "invoke" | "tool";

/** Inputs to a no-params dispatch. */
export interface NoParamsDispatchInput {
  /** The theta's slash name (its filename stem), e.g. `greet`. */
  readonly name: string;
  /** The raw slash-argument text after the command name (untrimmed). */
  readonly rawArgs: string;
  /** Which invocation path reached the theta. */
  readonly caller: SlashCallerKind;
}

/** Collaborators for a no-params dispatch. */
export interface NoParamsDispatchDeps {
  /** Emit the overflow `theta-system-note` (before the theta runs). */
  readonly emitOverflowNote: (note: string) => void;
  /** Run the theta body (always invoked — the note never blocks execution). */
  readonly run: () => Promise<void>;
}

/**
 * Dispatch a no-params theta (SLSH-1). On the slash path the runtime trims
 * leading/trailing slash-argument whitespace from `rawArgs`; if the trimmed
 * remainder is non-empty it emits exactly one overflow note BEFORE running,
 * then runs. A whitespace-only remainder trims to empty and emits no note. The
 * note is slash-path-only — `invoke`/`tool` callers never emit it. The theta
 * always runs (the note is informational and never blocks execution).
 */
export async function dispatchNoParamsTheta(
  input: NoParamsDispatchInput,
  deps: NoParamsDispatchDeps,
): Promise<void> {
  // SLSH-1: the overflow note is slash-path-only — `invoke`/`tool` callers skip
  // the slash parser and have no notion of "extra text". On the slash path,
  // trim leading/trailing slash-argument whitespace; emit exactly one note only
  // when the trimmed remainder is non-empty. The note never blocks execution —
  // the theta always runs, and after the note.
  if (input.caller === "slash") {
    const trimmed = trimSlashArgumentWhitespace(input.rawArgs);
    if (trimmed.length > 0) {
      deps.emitOverflowNote(renderNoParamsOverflowNote(input.name));
    }
  }
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
  // SLSH-2: the off-session forced-respond turn (dispatched through pi-ai's
  // `complete()` free function) attaches no turn to the user session, so it
  // renders no transcript card; user-visible turns render an ordinary card.
  return kind === "user_visible";
}

/**
 * The terminal outcome of the driven prompt-mode turn, from the theta's
 * perspective. `ok` appends no note; `err` (an `Err` propagated by `?`) and
 * `cancelled` (mid-stream cancellation) each append a single `theta-system-note`
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
  /** Append a `theta-system-note` (the failure / cancellation surface). */
  sendMessage(message: {
    readonly customType: string;
    readonly content: string;
    readonly display: boolean;
    readonly details?: SystemNoteDetails; // optional: this test-only surface omits it (bug 0401 adjudication — no `RuntimeEvent` exists here to attach), on the same footing as the informational notes runtime-event-channel.md pins detail-less.
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
 * `theta-system-note` AFTER the committed prefix (never interleaved with it).
 */
export async function driveSlashPromptTurn(
  queryText: string,
  deps: SlashPromptDriveDeps,
): Promise<void> {
  // SLSH-2: issue the rendered query as one streamed user-visible turn so its
  // tokens are observable in the transcript before the interpreter resumes,
  // then await `ctx.waitForIdle()` so the streamed prefix is fully committed.
  // Only after the prefix has committed — never interleaved with it — is the
  // failure / cancellation `theta-system-note` appended (SLSH-2 edge cases). On
  // `ok` no note is appended. The retained partial prefix is Pi's committed
  // conversation surface and is not rolled back.
  deps.pi.sendUserMessage(queryText);
  await deps.ctx.waitForIdle();
  if (deps.outcome.kind !== "ok") {
    // Test-only surface with no `src/` caller: omit `details` rather than fabricate
    // the runtime-event key (bug 0401 adjudication — no `RuntimeEvent` to attach).
    deps.pi.sendMessage({
      customType: SYSTEM_NOTE_CHANNEL,
      content: deps.outcome.note,
      display: true,
    });
  }
}
