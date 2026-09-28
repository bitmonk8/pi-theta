// Bug 0483 — live (H8a) witness: a host-recovery abort (pi-retry's stall
// watchdog `ctx.abort()` + the retryable `message_end` rewrite) cancels the
// whole theta invocation instead of riding through the host's retry of the
// driven turn.
//
// docs/bugs/0483-host-recovery-abort-cancels-theta-instead-of-riding-the-retry.md
// (§Fix, §"Witnesses (red before → green after)", the Live paragraph). The
// offline twin is tests/b0483-host-recovery-ride.test.ts; this file drives the
// FULL host mechanics — a real run abort, a real `message_end` rewrite, a real
// settle, and (cell B) pi 0.80.10's real in-run core retry — which a scripted
// session double can only model.
//
// MECHANISM. `bootShippedExtension` (tests/live/harness.ts) loads, beside the
// shipped theta entry, the watchdog-mimic fixture
// tests/live/fixtures/b0483-watchdog-mimic-extension.ts through the harness's
// `extraExtensionPaths` option. On the first `message_update` of the session
// (the first streamed delta of the theta's first `@`-query turn) the mimic
// calls `ctx.abort()`; on that aborted turn's assistant `message_end` it
// returns the pi-retry rewrite — `stopReason: "error"` plus the
// `[stall-watchdog-retry] provider returned error; …` suffix, which pi-ai's
// `isRetryableAssistantError` accepts. It fires once, so every later turn runs
// normally.
//
// The driven theta computes from the first query's value: its second `@`-query
// renders `${sum}` inline. The rendered second query therefore reaches the
// session ONLY if the first query returned `Ok` — the deterministic
// `userTexts` observable (AGENTS.md: compute-from-inline-value, not a
// verbatim-echo demand; fixed-pair arithmetic, 263 + 514 = 777).
//
// CELLS
//   A. `retry.enabled: false` (injected `SettingsManager.inMemory`): pi's core
//      retry declines the rewritten error-stop, so the run settles idle with
//      it: the idle-recovery arm (the pi >= 0.87 shape, where core retry bails
//      after any extension abort). Fixed behaviour: theta rides with its own
//      continuation re-drive (exactly one `PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT`
//      user turn, exactly one `ride 1/3` note); the first query resolves Ok.
//   B. `retry.enabled: true, baseDelayMs: 1`: on the pinned 0.80.10 dev host
//      core retry re-runs the turn inside the same run (`_handlePostAgentRun`
//      -> `_prepareRetry` -> `agent.continue()`), the session never reading
//      idle: the in-run arm (the pi <= 0.86 shape). Fixed behaviour: theta
//      waits the retry out (zero continuation turns, zero ride notes); the
//      first query resolves Ok on the retried text. The in-run arm exists only
//      below pi 0.87 (0.87 bails its post-run retry after an extension abort),
//      so the cell fails loudly naming the host pin on a pi >= 0.87 host rather
//      than accepting cell A's path in its place.
//
// At HEAD both cells are RED for the bug's reason: the per-turn
// `forwardSlashCommandCancel` in `LivePromptQueryModel.#driveUserVisibleTurn`
// (src/extension/live-prompt-query-driver.ts) forwards the mimic's abort into
// `thetaAbort` at signal time, the drive settles `cancel`, and the settled
// `SessionManager` carries the SLSH-4 note `theta /<stem> cancelled`.
//
// OBSERVABLES (AGENTS.md "Assert on real observables"), read off the settled
// in-memory `SessionManager` after `driveSlashCaptureTurn` returns AND the
// session reads idle (`waitForSessionIdle` says why): the persisted assistant
// entries carrying the mimic's tagged errorMessage (precondition: exactly one,
// ahead of any continuation turn; otherwise the cell would pass vacuously),
// the `theta-system-note` channel, and the user-turn texts. Never `prompt()`
// merely resolving; assistant text is not asserted.
//
// Subagent child-process launch: NOT reached (both thetas are `mode: prompt`
// with no `tools:` callee). Importing tests/live/harness.ts still applies its
// module-scope `#subagent-child-pins` setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`).
//
// A missing live provider/model fails loudly (`requireLiveProvider` →
// `failLoudly`); nothing here skips.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SettingsManager, VERSION } from "@earendil-works/pi-coding-agent";
import { isRetryableAssistantError, type AssistantMessage } from "@earendil-works/pi-ai";
import {
  PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT,
  PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND,
} from "../../src/extension/host-recovery";
import {
  bootShippedExtension,
  collectSystemNotes,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveExtensionHandle,
} from "./harness";
import { STALL_WATCHDOG_REWRITE_SUFFIX } from "./fixtures/b0483-watchdog-mimic-extension";

const WATCHDOG_MIMIC_EXTENSION = fileURLToPath(
  new URL("./fixtures/b0483-watchdog-mimic-extension.ts", import.meta.url),
);

/** The first query: fixed-pair arithmetic (AGENTS.md; bug 0243: no verbatim-echo demand). */
const FIRST_QUERY = "What is 263 plus 514? Answer with the number only.";

/** The second query's fixed prefix; `${sum}` follows it inline. */
const SECOND_QUERY_PREFIX = "Here is a number: ";

/** The arithmetic sentinel the first query's value must carry into the second query. */
const SUM_SENTINEL = "777";

function rideTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    `let sum = @\`${FIRST_QUERY}\`?`,
    `@\`${SECOND_QUERY_PREFIX}\${sum}. What is that number plus 1? Answer with the number only.\``,
    "",
  ].join("\n");
}

/** Whether `note` is a fail-closed ending of the top-level drive of `/stem` (SLSH-3, SLSH-4, panic framing). */
function isFailClosedNote(note: string, stem: string): boolean {
  return (
    note.startsWith(`theta /${stem} cancelled`) ||
    note.startsWith(`theta /${stem} returned Err`) ||
    note.startsWith(`theta /${stem} aborted`)
  );
}

/** The PIC-78 ride note for ride `n` of `/stem`, byte-exact. */
function rideNote(stem: string, n: number): string {
  return (
    `theta /${stem}: driven turn aborted by a host stall recovery and marked retryable; ` +
    `continuing the turn (ride ${n}/${PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND})`
  );
}

/** Whether `note` is any PIC-78 ride note of `/stem`. */
function isRideNote(note: string, stem: string): boolean {
  return note.startsWith(`theta /${stem}: driven turn aborted by a host stall recovery`);
}

/** Premise: the mimic's rewrite is one the host's own retry classifier accepts. */
function expectRewriteIsHostRetryable(errorMessage: string): void {
  expect(errorMessage.endsWith(STALL_WATCHDOG_REWRITE_SUFFIX), "the rewrite carries the pi-retry tag").toBe(true);
  const probe = { role: "assistant", stopReason: "error", errorMessage } as unknown as AssistantMessage;
  expect(
    isRetryableAssistantError(probe),
    "fixture premise: pi-ai's isRetryableAssistantError must accept the mimic's rewritten errorMessage",
  ).toBe(true);
}

/** What one ride cell observed on the drive's settled transcript slice. */
interface SettledDrive {
  readonly userTexts: readonly string[];
  readonly systemNotes: readonly string[];
  /** Theta's continuation re-drive turns: user texts equal to `PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT`. */
  readonly continuationTexts: readonly string[];
  /** The drive's PIC-78 ride notes. */
  readonly rideNotes: readonly string[];
}

/** The user-turn texts of one message entry (the `collectUserTexts` walk in tests/live/harness.ts). */
function userTextsOfEntry(entry: unknown): string[] {
  const e = entry as { type?: string; message?: { role?: string; content?: unknown } };
  if (e.type !== "message" || e.message?.role !== "user") return [];
  const content = e.message.content;
  if (typeof content === "string") return [content];
  const texts: string[] = [];
  if (Array.isArray(content)) {
    for (const part of content) {
      const t = (part as { text?: unknown }).text;
      if (typeof t === "string") texts.push(t);
    }
  }
  return texts;
}

/** The persisted assistant entries carrying the mimic's tagged errorMessage, with their slice indices. */
function taggedAssistantEntries(entries: readonly unknown[]): { readonly index: number; readonly errorMessage: string }[] {
  const tagged: { index: number; errorMessage: string }[] = [];
  entries.forEach((entry, index) => {
    const e = entry as { type?: string; message?: { role?: string; errorMessage?: unknown } };
    const errorMessage = e.message?.errorMessage;
    if (
      e.type === "message" &&
      e.message?.role === "assistant" &&
      typeof errorMessage === "string" &&
      errorMessage.endsWith(STALL_WATCHDOG_REWRITE_SUFFIX)
    ) {
      tagged.push({ index, errorMessage });
    }
  });
  return tagged;
}

/** Poll cadence and bound for the post-drive idle wait (60 s: a stuck run fails loudly). */
const IDLE_POLL_MS = 50;
const IDLE_POLL_BOUND = 1200;

/**
 * Wait until the session has no run in flight. `driveSlashCaptureTurn` returns
 * as soon as the last user turn carries assistant text, which at HEAD is the
 * aborted turn's partial, while pi's own in-run retry (cell B) is still
 * streaming. A `theta-system-note` sent while the host streams is STEERED into
 * that run (`AgentSession.sendCustomMessage` -> `agent.steer`) and persists only
 * when the run drains it, so the note channel is read after idle, never before.
 */
async function waitForSessionIdle(handle: LiveExtensionHandle, stem: string): Promise<void> {
  for (let i = 0; i < IDLE_POLL_BOUND; i += 1) {
    if (handle.session.isIdle) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, IDLE_POLL_MS));
  }
  failLoudly(
    `bug 0483 live: the session still had a run in flight ${IDLE_POLL_BOUND * IDLE_POLL_MS} ms after ` +
      `/${stem}'s drive returned; the settled transcript cannot be read`,
  );
}

async function driveRideCell(
  stem: string,
  settingsManager: SettingsManager,
): Promise<SettledDrive> {
  const provider = await requireLiveProvider();
  const workspace = plantThetaWorkspace([{ source: "project", stem, text: rideTheta() }]);
  try {
    const handle = await bootShippedExtension({
      workspace,
      provider,
      extraExtensionPaths: [WATCHDOG_MIMIC_EXTENSION],
      settingsManager,
    });
    try {
      if (handle.command(stem) === undefined) {
        failLoudly(
          `bug 0483 live precondition unmet: /${stem} did not register; registered: ` +
            JSON.stringify(handle.registeredNames()),
        );
      }
      const entriesBefore = handle.sessionManager.getEntries().length;
      await driveSlashCaptureTurn(handle, `/${stem}`);
      await waitForSessionIdle(handle, stem);
      const slice = handle.sessionManager.getEntries().slice(entriesBefore);
      const userTexts = slice.flatMap(userTextsOfEntry);
      const systemNotes = collectSystemNotes(slice);
      const turn: SettledDrive = {
        userTexts,
        systemNotes,
        continuationTexts: userTexts.filter((text) => text === PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT),
        rideNotes: systemNotes.filter((note) => isRideNote(note, stem)),
      };
      // Precondition: the host recovery actually happened, exactly once, and
      // ahead of any continuation turn (the mimic loaded, aborted the first
      // driven turn, and its rewrite persisted).
      const tagged = taggedAssistantEntries(slice);
      expect(
        tagged.length,
        `bug 0483 live precondition: exactly one persisted assistant entry carries the mimic's tagged ` +
          `errorMessage (${WATCHDOG_MIMIC_EXTENSION}); userTexts=${JSON.stringify(userTexts)}`,
      ).toBe(1);
      expectRewriteIsHostRetryable(tagged[0]!.errorMessage);
      const firstContinuation = slice.findIndex((entry) =>
        userTextsOfEntry(entry).includes(PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT),
      );
      if (firstContinuation !== -1) {
        expect(
          tagged[0]!.index,
          "bug 0483 live precondition: the mimic's rewrite precedes theta's continuation turn",
        ).toBeLessThan(firstContinuation);
      }
      expect(
        userTexts[0],
        `the drive's first user turn is the first query; userTexts=${JSON.stringify(userTexts)}`,
      ).toBe(FIRST_QUERY);
      return turn;
    } finally {
      // A cell that failed before the idle wait can leave a run in flight.
      if (!handle.session.isIdle) {
        await handle.session.abort();
      }
      await handle.dispose();
    }
  } finally {
    workspace.dispose();
  }
}

function expectRodeThrough(turn: SettledDrive, stem: string): void {
  // The bug's symptom first, so the red names it: the SLSH-4 cancelled note.
  expect(
    turn.systemNotes.filter((note) => isFailClosedNote(note, stem)),
    `bug 0483: a host-recovery abort (watchdog ctx.abort() + retryable error-stop rewrite) must ` +
      `NOT end the theta; the settled transcript carries a fail-closed note. ` +
      `systemNotes=${JSON.stringify(turn.systemNotes)}, userTexts=${JSON.stringify(turn.userTexts)}`,
  ).toEqual([]);
  const rendered = turn.userTexts.filter((text) => text.startsWith(SECOND_QUERY_PREFIX));
  expect(
    rendered.length,
    `the second query renders exactly once, and only because the first query returned Ok; ` +
      `userTexts=${JSON.stringify(turn.userTexts)}`,
  ).toBe(1);
  expect(
    rendered[0],
    `the first query's value (rendered inline into the second query) carries the arithmetic ` +
      `sentinel ${SUM_SENTINEL} (263 + 514)`,
  ).toMatch(new RegExp(`^${SECOND_QUERY_PREFIX}[\\s\\S]*\\b${SUM_SENTINEL}\\b`));
}

/** The pinned host's `major.minor` is below 0.87, where pi's post-run retry survives an extension abort. */
function hostRunsInRunRetry(): boolean {
  const [major, minor] = VERSION.split(".").map((part) => Number.parseInt(part, 10));
  if (major === undefined || minor === undefined || Number.isNaN(major) || Number.isNaN(minor)) {
    failLoudly(`bug 0483 live: cannot parse the @earendil-works/pi-coding-agent VERSION '${VERSION}'`);
  }
  return major === 0 && minor < 87;
}

describe("bug 0483 live: a host-recovery abort of a driven turn rides the host's retry instead of cancelling the theta", () => {
  it("(A) idle-recovery arm (retry.enabled off): the tagged error-stop settles idle; theta sends exactly one continuation turn with one ride note, and the first query resolves Ok with 777, no `theta /<name> cancelled` note", async () => {
    const stem = "b0483rideidle";
    const turn = await driveRideCell(stem, SettingsManager.inMemory({ retry: { enabled: false } }));
    expectRodeThrough(turn, stem);
    expect(
      turn.continuationTexts,
      `the idle-recovery arm ran: exactly one continuation user turn carrying ` +
        `PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT; userTexts=${JSON.stringify(turn.userTexts)}`,
    ).toEqual([PROMPT_MODE_HOST_RECOVERY_CONTINUE_TEXT]);
    expect(
      turn.rideNotes,
      `exactly one PIC-78 ride note (ride 1/${PROMPT_MODE_HOST_RECOVERY_RIDE_BOUND}); ` +
        `systemNotes=${JSON.stringify(turn.systemNotes)}`,
    ).toEqual([rideNote(stem, 1)]);
  });

  it("(B) in-run arm (retry.enabled on, pi < 0.87 host): core retry re-runs the turn inside the same run; the drive waits it out with zero continuation turns and zero ride notes, and the first query resolves Ok with 777, no `theta /<name> cancelled` note", async () => {
    if (!hostRunsInRunRetry()) {
      failLoudly(
        `bug 0483 live cell B precondition unmet: the in-run core-retry arm exists only below pi 0.87 ` +
          `(0.87 bails its post-run retry after an extension abort), but the host pin ` +
          `@earendil-works/pi-coding-agent is ${VERSION}`,
      );
    }
    const stem = "b0483rideinrun";
    const turn = await driveRideCell(
      stem,
      SettingsManager.inMemory({ retry: { enabled: true, maxRetries: 3, baseDelayMs: 1 } }),
    );
    expectRodeThrough(turn, stem);
    expect(
      turn.continuationTexts,
      `the in-run arm ran: pi's own retry re-ran the turn, so theta sent NO continuation turn; ` +
        `userTexts=${JSON.stringify(turn.userTexts)}`,
    ).toEqual([]);
    expect(
      turn.rideNotes,
      `the in-run arm emits no PIC-78 ride note; systemNotes=${JSON.stringify(turn.systemNotes)}`,
    ).toEqual([]);
  });
});
