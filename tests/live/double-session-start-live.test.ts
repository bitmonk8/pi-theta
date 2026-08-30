// H8a — live witness for the shutdown-less repeat `session_start` at ONE live
// extension instance. Two bugs share this boot, because they are two halves of
// the same supersession pass and the second bind is the only trigger either
// needs:
//
//   • bug 0021 — the superseding pass must not LEAK the prior generation's
//     armed watcher (the `theta hot-reload quiesced:` stderr witness below).
//   • bug 0024 — the superseding pass must RE-OWN a surviving slash name
//     instead of collision-dropping it against this same instance's own prior
//     registration (the note-channel witnesses below).
//
// Defect (docs/bugs/0021-double-session-start-leaks-armed-watcher.md): the
// public host SDK's `AgentSession.bindExtensions()` carries no once-guard and
// re-emits the stored `session_start` to the SAME factory closure; pre-fix the
// second compose pass overwrote the single-slot teardown handle with no detach
// of the prior generation, so generation 1's REAL chokidar watcher stayed
// armed with no reachable teardown. After the (single) `session_shutdown` +
// dispose, that leaked watcher's next filesystem event trips the PIC-67 entry
// probe against the invalidated runtime and emits exactly one
// `theta hot-reload quiesced:` stderr line (the `StaleQuiesceLog` sink) —
// misattributed evidence of the leak. Post-fix the superseding pass detaches
// generation 1 at supersede-before-publish time and the shutdown detaches
// generation 2, so NO armed watcher survives into the invalidated runtime and
// no quiesce line can ever fire (registration-steps.md
// #watcher-hot-reload-registration, PIC-57/PIC-68).
//
// Defect (docs/bugs/0024-rebind-self-collision-drops-surviving-names.md): the
// second bind's compose pass read `pi.getCommands()` for the cross-format
// collision check with NO own-name exclusion. Pi reports every command an
// extension registered as `source: "extension"` — indistinguishable from a
// sibling extension's — so generation 1's own `/greetlive` read as a FOREIGN
// collision: the re-discovered `greetlive.theta` was dropped, no second
// `pi.registerCommand` was issued, an error-severity
// `theta/load/cross-format-collision` note misdescribed the cause ("Pi-owned
// command 'greetlive' survives"), and the live `/greetlive` stayed bound to
// generation 1's registry — which the bug-0021 supersession DRAINS — so a
// dispatch on this running session answered the drain-state arm-(b) note
// `theta /greetlive: extension shutting down`. Post-fix (registration-steps.md
// PIC-69 + #surviving-name-re-ownership) the pass excludes this instance's own
// registration LEDGER from the collision source set, re-registers the
// surviving name against the NEW generation's registry, and the dispatch runs
// for real. Both bug-0024 observables are read immediately after the second
// bind and BEFORE churn 1, so no later hot-reload pass can re-own the name
// behind the assertion's back.
//
// Token cost: ONE tiny model turn — the bug-0024 re-ownership witness has to
// DISPATCH the surviving `/greetlive` on the live session, because the
// drain-state note is a dispatch-time observable. The planted theta pins a
// one-token reply, so the turn is bounded; everything else here (boot,
// registration, watcher lifecycle) burns nothing beyond session boot. The
// production debounce is 250 ms REAL clock, so each churn is followed by a
// ~1000 ms real-time wait to let any (leaked) reload pass cross its boundary.
//
// The bug-0021 arm below is an ABSENCE assertion over a `console.error`
// capture, so it is only evidence about the leak once this generation's
// watcher is known to deliver: `PiFileWatcher` arms chokidar with
// `ignoreInitial: true` (src/seams/pi-file-watcher.ts:31), which drops a write
// to any path its initial walk has not yet reached, and the seam exposes no
// readiness signal (src/seams/file-watcher.ts:46-50). The warm-up churn below
// establishes delivery as a proven precondition before the supersession, and
// fails loudly when it is unmet
// (docs/bugs/0048-double-session-start-live-vacuous-quiesce-witness.md).
//
// Live-suite conventions (AGENTS.md): fail loudly when the live provider
// precondition is unmet (never skip); assert on real observables (the
// `theta-system-note` channel read off the settled in-memory `SessionManager`
// and the deterministic `userTexts` outbound-render channel) and never on
// `prompt()` merely resolving — a fail-closed theta drive resolves too; the
// harness sets both #subagent-child-pins at module scope (no subagent child is
// spawned here, but the pins are harness-wide).

import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { SUBAGENT_ROOT_ENV_MARKER } from "../../src/runtime/subagent-root-regime";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";

/** The PIC-67 fail-loud-once stderr prefix (stale-ctx.ts `StaleQuiesceLog`). */
const STALE_QUIESCE_PREFIX = "theta hot-reload quiesced:";

/** The slash name planted below — the SURVIVING name bug 0024's re-bind pass must re-own. */
const SURVIVING_SLASH_NAME = "greetlive";

/**
 * Stem of the warm-up theta planted to PROVE generation 1's watcher delivers
 * (bug 0048). Deliberately distinct from `SURVIVING_SLASH_NAME`: both bug-0024
 * filters below cut on that name, so a warm-up registration can neither
 * satisfy nor defeat them.
 */
const WARMUP_SLASH_NAME = "b0048warmup";

/**
 * The structural-change `theta-system-note` a closed debounce window emits when
 * its netted `.theta`/`.thetalib` add/unlink PATHS are non-empty (bug 0311 —
 * the basis is the debounce-window event batch, not the registered theta set).
 * Computed by `structuralChangeNote` and delivered via `sendSystemNote` inside
 * `installHotReload`. Split around the substituted count so the assertion reads
 * the operator-visible template, not an internal.
 */
const STRUCTURAL_NOTE_PREFIX = "theta watcher: ";
const STRUCTURAL_NOTE_SUFFIX =
  "file(s) added or removed; run /reload to refresh the slash command list";

/**
 * The drain-state arm-(b) note for the surviving name (`drain-state.ts`
 * `shuttingDownNote`) — what a dispatch answers when the registered handler is
 * still bound to a superseded, DRAINED registry. Post-fix the re-bind pass
 * re-owns the name, so this note is unreachable on a live session.
 */
const SHUTTING_DOWN_NOTE = `theta /${SURVIVING_SLASH_NAME}: extension shutting down`;

/**
 * The cross-format collision diagnostic code (`discovery-walk.ts`) as it
 * appears in a rendered system note (`<code>: <message>`). A string literal,
 * not a `src/**` import: the constant is module-private, and the assertion is
 * on the OPERATOR observable, not on an internal.
 */
const COLLISION_CODE = "theta/load/cross-format-collision";

/** The one-token sentinel the planted theta's `@`-query pins (the outbound-render witness). */
// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
const OUTBOUND_SENTINEL = "LIVE-0021";

/**
 * Extract the `theta-system-note` channel contents from a slice of in-memory
 * `SessionManager` entries (their `content`, string or text-part array).
 * Mirrors the harness's own reader of the same channel — the harness exports
 * it only folded into a per-DRIVE slice (`driveSlashCaptureTurn`), and the
 * bug-0024 collision note is a LOAD-phase note emitted by the second
 * `bindExtensions` itself, so it needs the same read over a bind-scoped slice
 * (exactly as the hardening probe harness snapshots its load-phase notes).
 */
function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown };
    if (e.customType !== "theta-system-note") continue;
    if (typeof e.content === "string") notes.push(e.content);
    else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") notes.push(t);
      }
    }
  }
  return notes;
}

/**
 * Real-time wait for the production 250 ms real-clock debounce to fire and any
 * resulting reload pass to run its probe/rebuild. Generous 4x margin: the
 * discriminator is a leaked watcher's stderr line, so an over-wait costs only
 * wall time while an under-wait could mask the pre-fix red.
 */
const DEBOUNCE_SETTLE_MS = 1000;

/**
 * Poll granularity for reading the durable structural-change note, and the
 * unit the retry cadence is built from: WARMUP_POLLS_PER_WRITE * this is the
 * gap between retried warm-up writes, sized to let one debounce window close.
 */
const WARMUP_POLL_INTERVAL_MS = 250;

/**
 * Polls between two retried warm-up writes. Keeps the gap between consecutive
 * writes at 2x the production 250 ms debounce, so a retry cannot perpetually
 * re-schedule the drop-and-reschedule debouncer and starve the reload pass
 * whose note is the awaited observable.
 */
const WARMUP_POLLS_PER_WRITE = 2;

/**
 * Cap on the warm-up precondition. Sized an order above the measured
 * first-delivery latency — about 2.5 s of settle before the first `add`
 * reached the handler in this repo's in-process live harness (recorded during
 * the bug 0034 verification), and about 272 ms after two retried writes over
 * the bare production seam. The cap bounds a LOUD failure, not a settle
 * budget: over-sizing costs wall time only when the precondition is genuinely
 * unmet, and the loop exits at first delivery.
 */
const WARMUP_DELIVERY_CAP_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A minimal prompt-mode `.theta`; the body line varies per churn. */
function promptTheta(line: string): string {
  return ["---", "mode: prompt", "---", "@`" + line + "`", ""].join("\n");
}

describe("bugs 0021 + 0024 — live double session_start supersession (H8a, registration-steps.md step 5, PIC-57/PIC-68/PIC-69)", () => {
  let consoleErrorSpy: MockInstance | undefined;

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = undefined;
  });

  it("a second bindExtensions supersedes the prior generation: the surviving command is RE-OWNED (no collision note, no shutting-down note at dispatch) and no leaked watcher quiesces after shutdown", async () => {
    // The watcher arming under test is suppressed entirely inside a subagent
    // child (PIC-58), which would green this test vacuously — fail loudly
    // instead of asserting against a watcher that was never armed.
    if (process.env[SUBAGENT_ROOT_ENV_MARKER] !== undefined) {
      failLoudly(
        `live-host precondition unmet: ${SUBAGENT_ROOT_ENV_MARKER} is set, so ` +
          "the shipped factory suppresses step-5 watcher arming (PIC-58) and " +
          "this watcher-lifecycle witness would be vacuous. Run the live " +
          "suite outside a theta subagent child.",
      );
    }
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      {
        source: "project",
        stem: SURVIVING_SLASH_NAME,
        text: promptTheta(
          `A supersession probe is labelled ${OUTBOUND_SENTINEL}. What is 359 plus 247? Answer with the number only.`,
        ),
      },
    ]);
    const thetaPath = join(
      workspace.cwd,
      ".pi",
      "theta",
      `${SURVIVING_SLASH_NAME}.theta`,
    );
    const handle = await bootShippedExtension({ workspace, provider });
    let handleDisposed = false;
    try {
      // ---- Watcher-delivery precondition (bug 0048): the bug-0021 arm at the
      // end of this test asserts an ABSENCE, and an absence is also what a
      // watcher that delivered NOTHING produces. Prove generation 1's watcher
      // is past its initial scan by churning STRUCTURALLY (a content-only edit
      // adds or removes no file, so its window nets no add/unlink path and
      // `structuralChangeNote` suppresses it) and awaiting the DELIVERED
      // structural-change note off the settled in-memory `SessionManager`.
      // Runs before the second bind because after the supersession that
      // watcher is correctly gone and its delivery is no longer demonstrable;
      // before the `console.error` spy so warm-up reload diagnostics cannot
      // enter the quiesce capture; before `entriesBeforeSecondBind` so warm-up
      // notes cannot enter the bug-0024 rebind slice.
      const entriesBeforeWarmup = handle.sessionManager.getEntries().length;
      const warmupPath = join(
        workspace.cwd,
        ".pi",
        "theta",
        `${WARMUP_SLASH_NAME}.theta`,
      );
      const warmupText = promptTheta(
        "Warm-up churn: never dispatched, planted only to prove watcher delivery.",
      );
      const warmupDeadline = Date.now() + WARMUP_DELIVERY_CAP_MS;
      let warmupDelivered = false;
      // One helper for both churn phases: poll the settled transcript for the
      // structural-change note a closed debounce window emits.
      const pollForStructuralNote = async (): Promise<boolean> => {
        for (let poll = 0; poll < WARMUP_POLLS_PER_WRITE; poll += 1) {
          await sleep(WARMUP_POLL_INTERVAL_MS);
          const warmupNotes = collectSystemNotes(
            handle.sessionManager.getEntries().slice(entriesBeforeWarmup),
          );
          if (
            warmupNotes.some(
              (note) =>
                note.includes(STRUCTURAL_NOTE_PREFIX) &&
                note.includes(STRUCTURAL_NOTE_SUFFIX),
            )
          ) {
            return true;
          }
        }
        return false;
      };
      while (!warmupDelivered && Date.now() < warmupDeadline) {
        // Retry the churn as unlink-then-recreate with a polling gap between
        // the two phases: chokidar attaches a path's `fs` watcher only when
        // its initial walk reaches the path and suppresses the walk's own
        // `add` under `ignoreInitial: true`, so churn landing inside the scan
        // is delivered as nothing at all and must be re-issued rather than
        // waited on. The structural-change note keys on the window's netted
        // add/unlink PATHS (bug 0311; a bare rewrite is a `change` — a content
        // edit, deliberately not structural per registration-steps.md
        // §Structural changes), and Windows watchers coalesce a back-to-back
        // delete+create of one path into a single `change`, so each phase gets
        // its own observation window: the unlink alone (netted `unlink`, note
        // fires), then the recreate alone (netted `add`, note fires). Either
        // window's note proves delivery. Every retry ends with a valid
        // prompt-mode theta on disk so each reload pass can publish.
        if (existsSync(warmupPath)) {
          unlinkSync(warmupPath);
          warmupDelivered = await pollForStructuralNote();
        }
        if (!warmupDelivered) {
          writeFileSync(warmupPath, warmupText, "utf8");
          warmupDelivered = await pollForStructuralNote();
        }
      }
      // The loop may exit right after an unlink-phase delivery; the later
      // steps need the warm-up theta present and registrable on disk.
      if (!existsSync(warmupPath)) {
        writeFileSync(warmupPath, warmupText, "utf8");
      }
      if (!warmupDelivered) {
        failLoudly(
          "live-host precondition unmet: the watcher armed by this generation " +
            `delivered no event within ${WARMUP_DELIVERY_CAP_MS} ms of ` +
            `retried structural churn (no "${STRUCTURAL_NOTE_PREFIX}<N> ` +
            `${STRUCTURAL_NOTE_SUFFIX}" note reached the transcript), so the ` +
            "zero-quiesce-line witness below would be vacuous — an absence " +
            "produced by a delivery chain that never ran, not by the absent " +
            "bug-0021 leak. Notes seen since boot: " +
            JSON.stringify(
              collectSystemNotes(
                handle.sessionManager.getEntries().slice(entriesBeforeWarmup),
              ),
            ),
        );
      }

      // Spy BEFORE the second bind so every stderr line the superseded
      // generation could ever emit — including a leaked watcher's
      // post-invalidation quiesce — is captured. `vi.spyOn` records calls and
      // still writes through, so real teardown diagnostics stay visible.
      consoleErrorSpy = vi.spyOn(console, "error");

      // bug 0024: mark the transcript so the LOAD-phase notes the SECOND bind
      // emits can be sliced out of the settled `SessionManager` — generation
      // 1's own boot notes must not be read as the re-bind pass's.
      const entriesBeforeSecondBind = handle.sessionManager.getEntries().length;

      // The shutdown-less double start: the harness boot already called
      // `bindExtensions` once; this second call re-emits `session_start` to
      // the SAME runner and the SAME factory closure (no once-guard).
      await handle.session.bindExtensions({});

      // Sanity: the second start SUPERSEDED the prior generation rather than
      // breaking registration — the discovered slash command is still
      // registered after the double bind. (This holds PRE-fix too: Pi exposes
      // no `unregisterCommand`, so generation 1's registration survives even
      // when the re-bind pass drops the name — which is exactly why bug 0024
      // needs the two note-channel witnesses below, not a registration read.)
      expect(
        handle.command(SURVIVING_SLASH_NAME),
        "the double bindExtensions must leave the discovered slash command " +
          "registered (the superseding pass re-runs discovery + registration). " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // ---- bug 0024 (b): the re-bind pass emits NO cross-format-collision
      // note for the surviving name. Read off the settled in-memory
      // `SessionManager` (not a racy event subscription), sliced to the
      // entries the second bind appended. Pre-fix the pass folds generation
      // 1's own `source: "extension"` entry into the collision source set and
      // emits an error-severity note claiming "Pi-owned command 'greetlive'
      // survives" — a cause that does not exist.
      const rebindNotes = collectSystemNotes(
        handle.sessionManager.getEntries().slice(entriesBeforeSecondBind),
      );
      const collisionNotes = rebindNotes.filter(
        (note) => note.includes(COLLISION_CODE) && note.includes(SURVIVING_SLASH_NAME),
      );
      // `expect.soft` (as in the offline bug-0024 suite): the three bug-0024
      // arms are independent observables of the SAME pass, so a failure in one
      // must not hide the others' verdict — and the bug-0021 witness further
      // down still has to run. Soft assertions fail the test all the same.
      expect.soft(
        collisionNotes,
        `the re-bind pass emitted ${COLLISION_CODE} for the surviving ` +
          `/${SURVIVING_SLASH_NAME}: it treated this instance's OWN prior ` +
          "registration as a foreign collision (registration-steps.md PIC-69). " +
          "Notes appended by the second bind: " + JSON.stringify(rebindNotes),
      ).toStrictEqual([]);

      // ---- bug 0024 (a): the surviving name is RE-OWNED — dispatch it on
      // this LIVE session and prove the handler runs against the NEW
      // generation's registry. Driven BEFORE churn 1 so no subsequent
      // hot-reload pass can re-own the name behind this assertion's back.
      const turn = await driveSlashCaptureTurn(handle, `/${SURVIVING_SLASH_NAME}`);

      const shuttingDownNotes = turn.systemNotes.filter((note) =>
        note.includes(SHUTTING_DOWN_NOTE),
      );
      expect.soft(
        shuttingDownNotes,
        `dispatching /${SURVIVING_SLASH_NAME} on a LIVE session answered ` +
          `"${SHUTTING_DOWN_NOTE}": the re-bind pass never re-owned the ` +
          "surviving name, so its registered handler is still bound to the " +
          "superseded generation's DRAINED registry " +
          "(registration-steps.md #surviving-name-re-ownership). Notes from " +
          "this drive: " + JSON.stringify(turn.systemNotes),
      ).toStrictEqual([]);

      // Non-vacuity for the assertion above: `prompt()` resolves either way
      // (a fail-closed theta drive surfaces failures as notes, never throws),
      // so an EMPTY note list alone would also be produced by a drive that
      // did nothing. The QRY-18 rendered `@`-query text is the deterministic
      // outbound-render observable — it exists only if the re-owned handler
      // actually reached the new generation's registry entry and ran the
      // prompt-mode query.
      const outbound = turn.userTexts.join("\n");
      expect.soft(
        outbound,
        `the re-owned /${SURVIVING_SLASH_NAME} drive rendered no outbound ` +
          "query text, so the no-shutting-down-note assertion above is " +
          "vacuous: the dispatch never reached a live registry entry. " +
          "Outbound user texts: " + JSON.stringify(turn.userTexts),
      ).toContain(OUTBOUND_SENTINEL);

      // Churn 1 (session live): rewrite the `.theta` body and advance the
      // session past one real 250 ms debounce window before the shutdown, so
      // the shutdown-then-churn-2 sequence below runs on a session that has
      // already crossed a debounce boundary while live. Nothing is asserted on
      // this churn: generation 2's watcher has its own unproven initial scan
      // (bug 0048 §Fix residual (i)), so no delivery is claimed here.
      writeFileSync(
        thetaPath,
        promptTheta(
          `A supersession probe is labelled ${OUTBOUND_SENTINEL}-EDIT. What is 415 plus 283? Answer with the number only.`,
        ),
        "utf8",
      );
      await sleep(DEBOUNCE_SETTLE_MS);

      // Graceful shutdown then dispose: the harness emits `session_shutdown`
      // (reason "quit") — detaching the LATEST generation's watcher — then
      // invalidates the runtime via `session.dispose()`.
      await handle.dispose();
      handleDisposed = true;

      // Churn 2 (runtime invalidated): pre-fix the leaked generation-1
      // watcher is still armed — its debounced reload's PIC-67 entry probe
      // now throws the stale-ctx error and emits exactly one
      // `theta hot-reload quiesced:` stderr line. Post-fix no armed watcher
      // exists (generation 1 detached at supersession, generation 2 at
      // shutdown), so nothing can quiesce.
      writeFileSync(
        thetaPath,
        promptTheta(
          `A supersession probe is labelled ${OUTBOUND_SENTINEL}-POST. What is 528 plus 164? Answer with the number only.`,
        ),
        "utf8",
      );
      await sleep(DEBOUNCE_SETTLE_MS);

      const quiesceLines = consoleErrorSpy.mock.calls
        .map((args) => args.map(String).join(" "))
        .filter((line) => line.includes(STALE_QUIESCE_PREFIX));
      expect(
        quiesceLines,
        "a `theta hot-reload quiesced:` stderr line means a superseded " +
          "generation's watcher survived both the supersession and the " +
          "shutdown — the bug-0021 leak. Captured: " + JSON.stringify(quiesceLines),
      ).toStrictEqual([]);
    } finally {
      if (!handleDisposed) {
        await handle.dispose();
      }
      workspace.dispose();
    }
  });
});
