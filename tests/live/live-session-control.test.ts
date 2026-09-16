// H8a (live) — RFC 0011 session-control runtime tools (`compact`,
// `context_usage`, `session_name`) against a REAL AgentSession and a REAL
// provider (`requireLiveProvider`, `./harness`). Offline coverage
// (`tests/session-control-*.test.ts`) already pins every adapter/dispatch
// value over fake `SessionControlCtx`/`SessionControlPi` handles; this file
// adds the one thing a fake cannot: the REAL Pi host's `compact` /
// `getContextUsage` / `setSessionName` / `getSessionName` members, driven
// through the shipped composition root, over a REAL compaction summarisation
// turn.
//
// Spec: docs/rfcs/0011-session-control-tools.md; `docs/spec_topics/
// tool-calls.md#session-control-runtime-tools` + `#Failures` (message
// strings); `.localpi/tmp/rfc-0011-seam-sheet.md` §9 (S8, amended 2A′).
//
// DETERMINISM DISCIPLINE (AGENTS.md "Assert on real observables, not on
// `prompt()` resolving"): nothing here asserts on `assistantText`. Every
// pass/fail observable is one of:
//   - `handle.sessionManager.getEntries()` — the settled `type ===
//     "compaction"` entry (L1a) and `getSessionName()` (L3);
//   - `userTexts` (`driveSlashCaptureTurn`) — exact strings the theta CODE
//     computed via `${...}` interpolation of theta-owned `let` bindings, never
//     the model's stochastic reply content (L1b/L1c, L2);
//   - `systemNotes` / `systemNoteContents(handle.sessionManager.getEntries())`
//     — absence of an err/cancel/abort `theta-system-note` (or its
//     `theta-progress-entry` migration twin, PIC-72) framing on the settled
//     manager (L1d, L2's subagent-transcript-is-private success signal).
// No discriminator is a verbatim-echo demand (bug 0243): every arithmetic
// query is task-framed (`What is <a> plus <b>? Answer with the number
// only.`), and every marker is a theta-computed value crossing into the
// query text, not a request to repeat fixed text back.
//
// C2(g) / SETTINGS. L1 boots with `SettingsManager.inMemory({ compaction: {
// keepRecentTokens: 1 } })` (the harness's new `settingsManager` option,
// this cycle's addition to `./harness`) so the first `compact(...)` call has
// something to summarise — lowering `keepRecentTokens` does not enable
// threshold auto-compaction (that keys on `reserveTokens` vs
// `contextWindow`), so the drive stays otherwise deterministic.
//
// C2 PIN (Pi 0.80.10). `Already compacted` fires only when the compaction
// branch's LAST entry is itself a compaction
// (`dist/core/compaction/compaction.js` `prepareCompaction`), so L1's second
// `compact("")` call follows the first IMMEDIATELY — no intervening query.
//
// SUBAGENT CHILD PINS (L2 only): the invoked callee is `mode: subagent`,
// reaching the RFC-0006 child-process launch. `./harness` sets both
// #subagent-child-pins (the real `pi` CLI entry at `process.argv[1]` and
// `PI_THETA_SUBAGENT_EXTENSION_PIN` at this tree's `extensions/`, with the
// authenticated parent-pid carriage) at module scope, so the child resolves
// the build under test — see `AGENTS.md#subagent-child-pins`.
//
// F-6 CAVEAT (seam sheet §9, §11). L2's child reads ON-DISK settings (it is a
// real spawned `pi` process, not a settings-injected in-process harness): an
// operator config carrying a nonstandard `keepRecentTokens` could make the
// child's own `compact()` call succeed instead of refusing with `Nothing to
// compact (session too small)`. This cell does NOT silently tolerate that
// divergence — it reds loudly on the message-equality assertion, naming both
// the expected and the actual text, rather than skipping.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// L4 — RED-DIRECTION PROOF (one-time, procedure only; NOT committed as code,
// per AGENTS.md "verify both directions"). Run once by the author before
// handoff, then discard the local edits — no `src/**` change ships:
//   (i)  In `src/runtime/session-control-tools.ts`, make
//        `executeCompactTool`'s host call a no-op (e.g. replace the
//        `host.compact({ ... })` call with an immediate
//        `resolve(makeOk({ summary: "x", tokens_before: 1, tokens_after: 1 }))`
//        so no REAL `compact` entry is ever appended to the session). Re-run
//        this file: L1 reds on assertion (a) — "no entry with `type ===
//        'compaction'` on the settled session" — because the fake success
//        never touches the host session at all.
//   (ii) Restore the file (`git diff --stat` shows zero changes) and re-run:
//        L1 is green again.
// This proves assertion (a) is load-bearing (it can red on a real defect)
// rather than vacuously true for any adapter behaviour.
//
// WITNESS VALUE OF THE NON-EMPTY POSITIONAL SPELLING. L1 and L3 call a
// runtime tool with a non-empty positional argument
// (`compact("Keep the arithmetic results.")`, `session_name("theta-live-fixed-name")`)
// — the calling convention tool-calls.md #session-control-runtime-tools
// pins (fixed positional arguments, not the Pi-tool bare-object-literal
// shape). The first run of these cells surfaced a runtime gap that no
// offline cell had reached: `preEvaluateToolArgs`
// (`src/runtime/statement-executor.ts`) skipped the Pi-tool object-literal
// shape gate only for a `"theta-callable"` verdict, so a `"runtime-tool"`
// call with an argument threw `PiToolArgShapeDefectError`
// (`src/runtime/tool-call.ts`) — the bug-0003 belt-and-braces path meant for
// genuine Pi tools — and the theta aborted with an internal-error panic
// note. A zero-argument call (`compact()`, L2's child body) never reached
// the gate, which is why L2 alone was green. The fix widened the skip to the
// `"runtime-tool"` verdict in the same change; these two cells keep the
// contractual spelling so the gap cannot reopen unnoticed.
//
// Token cost: L1 issues four short arithmetic turns plus the host's own
// compaction summarisation call; L2 one child turn; L3 zero on-session model
// turns (the theta body is a single tool call with no `@` query) — comparable
// to existing H8a files.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveExtensionHandle,
  type LiveWorkspace,
  type PlantedTheta,
} from "./harness";

/**
 * The `theta-system-note` (and its PIC-72 `theta-progress-entry` migration
 * twin) channel contents from the settled in-memory `SessionManager`, read
 * directly off `getEntries()` — mirrors
 * `tests/live/alias-sink-array-element-check-live-cell.test.ts`'s
 * `systemNoteContents`.
 */
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      if (typeof e.content === "string") notes.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") notes.push(t);
        }
      }
    } else if (e.customType === "theta-progress-entry") {
      const data = e.data as { content?: unknown } | undefined;
      if (typeof data?.content === "string") notes.push(data.content);
    }
  }
  return notes;
}

/** A framing that any fail-closed ending of a top-level drive lands as (SLSH-3 err note, cancel, panic). */
function isFailFramedNote(note: string): boolean {
  return (
    note.includes("returned Err:") ||
    note.includes("cancelled") ||
    note.includes("aborted")
  );
}

// ===========================================================================
// L1 — prompt-mode compact loop
// ===========================================================================

const L1_STEM = "sesscontrol-l1-live";
const L1_THETA = [
  "---",
  "mode: prompt",
  "tools:",
  "  - compact",
  "  - context_usage",
  "---",
  "@`What is 263 plus 514? Answer with the number only.`?",
  "@`What is 91 plus 12? Answer with the number only.`?",
  'let c = compact("Keep the arithmetic results.")?',
  'let again = match compact("") { Ok(_) => "compacted-twice", Err(e) => e.message }',
  "let stale = match context_usage() { Ok(_) => \"gauge-ok\", Err(e) => e.message }",
  "let ints = c.tokens_before > 0 && c.tokens_after > 0",
  "@`Marker ${ints} ${again} ${stale}. What is 100 plus 1? Answer with the number only.`?",
  "let fresh = context_usage()?",
  "@`Marker2 ${fresh.percent >= 0}. What is 2 plus 2? Answer with the number only.`",
  "",
].join("\n");

const L1_EXPECTED_MARKER =
  "Marker true Already compacted context usage unknown until the next assistant response. " +
  "What is 100 plus 1? Answer with the number only.";
const L1_EXPECTED_MARKER2 = "Marker2 true. What is 2 plus 2? Answer with the number only.";

// ===========================================================================
// L2 — subagent-mode round-trip (real child spawn via `invoke(...)`)
// ===========================================================================

const L2_CHILD_STEM = "sesscontrol-l2-live-child";
const L2_CHILD = [
  "---",
  "mode: subagent",
  "tools:",
  "  - compact",
  "---",
  'match compact() { Ok(_) => "compacted", Err(e) => e.message }',
  "",
].join("\n");

const L2_CALLER_STEM = "sesscontrol-l2-live-caller";
const L2_CALLER = [
  "---",
  "mode: prompt",
  "---",
  // Untyped `invoke(...)` returns `Result<null, QueryError>` (the runtime
  // discards the child's return value entirely) — `invoke<Schema>` is required
  // to get the child's typed return value back (invocation.md "Typed return").
  `let r = invoke<string>("./${L2_CHILD_STEM}.theta")?`,
  "@`Marker3 ${r}. What is 7 plus 8? Answer with the number only.`",
  "",
].join("\n");

const L2_EXPECTED_TEXT = "Nothing to compact (session too small)";
const L2_EXPECTED_MARKER = `Marker3 ${L2_EXPECTED_TEXT}. What is 7 plus 8? Answer with the number only.`;

// ===========================================================================
// L3 — session_name
// ===========================================================================

const L3_STEM = "sesscontrol-l3-live";
const L3_THETA = [
  "---",
  "mode: prompt",
  "tools:",
  "  - session_name",
  "---",
  'session_name("theta-live-fixed-name")?',
  "",
].join("\n");

let workspace: LiveWorkspace;
let handle: LiveExtensionHandle;

beforeAll(async () => {
  const provider = await requireLiveProvider();
  const thetas: PlantedTheta[] = [
    { source: "project", stem: L1_STEM, text: L1_THETA },
    { source: "project", stem: L2_CHILD_STEM, text: L2_CHILD },
    { source: "project", stem: L2_CALLER_STEM, text: L2_CALLER },
    { source: "project", stem: L3_STEM, text: L3_THETA },
  ];
  workspace = plantThetaWorkspace(thetas);
  handle = await bootShippedExtension({
    workspace,
    provider,
    settingsManager: SettingsManager.inMemory({ compaction: { keepRecentTokens: 1 } }),
  });
}, 60000);

afterAll(async () => {
  await handle.dispose();
  workspace.dispose();
});

describe("RFC 0011 (H8a, live) — session-control runtime tools over a real host", () => {
  it("registration preconditions — all four planted thetas register, so nothing below measures a broken workspace", () => {
    for (const stem of [L1_STEM, L2_CALLER_STEM, L3_STEM]) {
      if (handle.command(stem) === undefined) {
        failLoudly(
          `live precondition unmet: discovery registered no \`/${stem}\` command ` +
            `(registered: ${JSON.stringify(handle.registeredNames())}). This cell cannot ` +
            "witness the session-control tools if this precondition is unmet.",
        );
      }
    }
    // `L2_CHILD_STEM` is invoked, not slash-dispatched (mirrors
    // `tests/live/b0409live-omitted-defaulted-invoke-child-intake-live-cell.test.ts`):
    // it need not register a standalone slash command for this cell.
  });

  it(
    "L1: a real compaction summarisation lands on the session, the immediate second compact() refuses `Already compacted`, and the post-compaction gauge is stale until the next assistant response",
    { timeout: 300000 },
    async () => {
      const driven = await driveSlashCaptureTurn(handle, `/${L1_STEM}`);

      // (d) — checked first: a fail-closed note explains every other assertion
      // failing rather than leaving them to guess at an unrelated cause.
      // DRIVE-SCOPED ONLY (`driven.systemNotes`, not the full accumulated
      // session): the handle is shared across this file's `it()`s (one boot
      // per file, per H8a cost discipline), so the full `getEntries()` channel
      // would also carry an EARLIER test's notes.
      const failFramed = driven.systemNotes.filter(isFailFramedNote);
      expect(
        failFramed,
        "L1 drive carries a fail-closed theta-system-note (err/cancel/abort framing); " +
          `full drive-scoped notes: ${JSON.stringify(driven.systemNotes)}; ` +
          "full-session notes so far (supplementary; may include earlier tests' notes since " +
          `the handle is shared): ${JSON.stringify(
            systemNoteContents(handle.sessionManager.getEntries()),
          )}`,
      ).toEqual([]);

      // (a) — a real `compaction` entry landed on the settled session: the
      // host's `compact("Keep the arithmetic results.")?` call actually ran
      // against the real `AgentSession`, not a fake.
      const entries = handle.sessionManager.getEntries() as readonly { type?: string }[];
      expect(
        entries.some((entry) => entry.type === "compaction"),
        "no `type === \"compaction\"` entry landed on the settled session — the real " +
          `compact() call did not reach the host. Entry types: ${JSON.stringify(
            entries.map((entry) => entry.type),
          )}`,
      ).toBe(true);

      // (b) — the theta-computed marker: `ints` (positive token counts from
      // the real compaction result), `again` (the immediate second
      // compact("") refusing `Already compacted` per C2 §Pi 0.80.10 pin —
      // the branch's LAST entry is itself a compaction), and `stale` (the
      // gauge unpopulated until the next assistant response) all crossed
      // into the query text verbatim.
      expect(
        driven.userTexts,
        `userTexts did not carry the expected L1 marker. Full userTexts: ${JSON.stringify(
          driven.userTexts,
        )}`,
      ).toContain(L1_EXPECTED_MARKER);

      // (c) — after the marker query's assistant reply, the gauge is fresh
      // and non-negative.
      expect(
        driven.userTexts,
        `userTexts did not carry the expected L1 fresh-gauge marker. Full userTexts: ${JSON.stringify(
          driven.userTexts,
        )}`,
      ).toContain(L1_EXPECTED_MARKER2);
    },
  );

  it(
    "L2: a real spawned subagent child's own compact() refuses `Nothing to compact (session too small)`, and the parent's private-transcript success is the absence of a fail-closed note",
    { timeout: 300000 },
    async () => {
      const driven = await driveSlashCaptureTurn(handle, `/${L2_CALLER_STEM}`);

      // DRIVE-SCOPED ONLY — see L1's identical rationale above.
      const failFramed = driven.systemNotes.filter(isFailFramedNote);
      // F-6: the child reads ON-DISK settings. If an operator's config
      // carries a nonstandard `keepRecentTokens` that lets the too-small
      // child session compact successfully, `r` will not equal the expected
      // refusal text and the assertion below reds loudly, naming the
      // divergence — never a silent pass on a different code path.
      expect(
        failFramed,
        "L2 drive carries a fail-closed theta-system-note (err/cancel/abort framing) — a " +
          "subagent transcript is private, so this note channel would be the ONLY " +
          `visible symptom of a child-spawn failure. Full drive-scoped notes: ${JSON.stringify(
            driven.systemNotes,
          )}`,
      ).toEqual([]);

      expect(
        driven.userTexts,
        "F-6: the child's compact() did not refuse with the expected too-small message — " +
          `either a genuine defect, or (per seam sheet §9/§11 F-6) this operator's on-disk ` +
          `settings carry a nonstandard keepRecentTokens that lets the child compact ` +
          `successfully instead. Expected marker: ${JSON.stringify(
            L2_EXPECTED_MARKER,
          )}; full userTexts: ${JSON.stringify(driven.userTexts)}`,
      ).toContain(L2_EXPECTED_MARKER);
    },
  );

  it("L3: session_name(\"theta-live-fixed-name\") sets the real session's name, read back off the settled SessionManager", async () => {
    // `session_name` issues no `@` query and no on-session model turn, so
    // `driveSlashCaptureTurn`'s multi-turn settle-wait is unneeded machinery
    // here, but it still gives a DRIVE-SCOPED `systemNotes` read (the shared
    // handle otherwise leaks an earlier test's notes into a full-session read).
    const driven = await driveSlashCaptureTurn(handle, `/${L3_STEM}`);
    const failFramed = driven.systemNotes.filter(isFailFramedNote);
    expect(
      failFramed,
      "L3 drive carries a fail-closed theta-system-note (err/cancel/abort framing); " +
        `full drive-scoped notes: ${JSON.stringify(driven.systemNotes)}`,
    ).toEqual([]);
    expect(
      handle.sessionManager.getSessionName(),
      "the real session's name was not set to the theta-computed literal via " +
        "pi.setSessionName — session_name(...) did not reach the host, or the " +
        "read-back diverged.",
    ).toBe("theta-live-fixed-name");
  });
});
