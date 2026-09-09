// RFC 0009 (Phase 6, H8a) — call-site `with { cwd }` relocates a subagent-mode
// callee's side effects to the resolved child working directory, through the
// REAL RFC-0006 child-process launch (`spawnSubagentConversation` ->
// `launchSubagentChild`), driven end to end via the shipped extension entry
// against a live model.
//
// Spec: docs/rfcs/0009-per-call-subagent-cwd.md §Proposal 3 (Value semantics),
// §Proposal 4 (Identity/location — the clause relocates side effects, never
// identity), §Testing strategy "Live (H8a)". Seam sheet:
// .localpi/tmp/rfc-0009-seam-sheet.md. The offline threading witness
// (`tests/call-with-clause-threading.test.ts`) drives the same bind move
// through a fake-child double; this cell is the end-to-end obligation the RFC
// pins explicitly — no existing live cell combines a real filesystem side
// effect with a typed-return round-trip, so this is a new cell composed from
// the bug-0067 typed-invoke live cell's template
// (`tests/live/live-production-acceptance.test.ts`) plus the child pins.
//
// Topology: `cwdcaller.theta` (mode: prompt) makes TWO `invoke<integer>` calls
// against the SAME subagent-mode callee `cwdchild.theta` — one carrying
// `with { cwd: <fresh temp dir> }` (the clause under test), one carrying no
// clause at all (the negative-lite control, folded into the SAME drive so it
// costs no extra query). Each call passes its own marker filename and return
// value as `params:`, so the two invocations cannot be confused by a shared
// side-effect path:
//
//   invoke<integer>("./cwdchild.theta", "with-marker.txt", 101)
//     with { cwd: "<fresh temp dir, forward-slashed>" }?     // clause present
//   invoke<integer>("./cwdchild.theta", "plain-marker.txt", 202)?  // absent
//
// `cwdchild.theta`'s body is a pure `write(...)` code-side tool call (no
// `@`-query) followed by a bare `value` tail — zero model turns, mirroring the
// bug-0067 cell's `b67livesevkid.theta` ("a pure expression, zero model turns,
// zero tokens"). The one query the caller issues afterwards interpolates BOTH
// typed return values between markers (`CWDROUND=${a}/${b}|END`), so the
// round-trip observable is the deterministic outbound-rendered text
// (`turn.userTexts`), independent of the model's reply — the same
// compute-from-value technique the bug-0067 cell uses, not a verbatim-echo
// demand (bug 0243).
//
// Token cost: exactly one dispatched query in the caller (the same profile as
// the bug-0067 cell) plus two zero-token child spawns; the negative-lite
// control does not double the cost because it shares that one query.
//
// NO SILENT SKIPPING. `requireLiveProvider` fails loudly naming the unmet
// precondition when no live provider/model resolves.

import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";

/** Forward-slash a path — theta path literals reject backslashes (Lexical —
 *  Path literals), and the ledger's own canonical form is forward-slashed. */
function fwd(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * The subagent-mode callee: a pure code-side `write(...)` tool call (no
 * `@`-query, so zero model turns/tokens for the callee), then a bare `value`
 * tail — the typed return the caller's `invoke<integer>` binds. `marker` and
 * `value` are `params:`, so each of the caller's two invocations gets its own
 * marker filename and its own return value.
 */
function cwdChildTheta(): string {
  return [
    "---",
    "mode: subagent",
    "description: RFC 0009 H8a fixture callee — writes a relative marker, returns its value",
    "tools: write",
    "params:",
    "  marker: string",
    "  value: integer",
    "---",
    'write({ path: marker, content: "child-wrote-it" })?',
    "value",
    "",
  ].join("\n");
}

/**
 * The caller: `mode: prompt`, two `invoke<integer>` calls against the same
 * callee — the first carries the `with { cwd: <freshDir> }` clause under
 * test, the second carries none (the negative-lite default-path control).
 * Both typed returns are interpolated between markers in the one dispatched
 * query, so the round-trip observable is the deterministic outbound render.
 */
function cwdCallerTheta(freshDirFwd: string): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'let withClauseVal = invoke<integer>("./cwdchild.theta", "with-marker.txt", 101) ' +
      `with { cwd: "${freshDirFwd}" }?`,
    'let plainVal = invoke<integer>("./cwdchild.theta", "plain-marker.txt", 202)?',
    "@`CWDROUND=${withClauseVal}/${plainVal}|END What is 263 plus 514? Answer with the number only.`",
    "",
  ].join("\n");
}

describe("RFC 0009 (H8a, live) — call-site `with { cwd }` relocates a subagent callee's side effects through the real child-process launch", () => {
  it("the clause-bearing invoke writes its marker in the fresh temp dir (not the parent cwd); the clause-free invoke writes its marker in the parent session cwd; both typed returns round-trip", async () => {
    const provider = await requireLiveProvider();

    const rawFreshDir = mkdtempSync(join(tmpdir(), "theta-live-cwd-clause-"));
    if (!existsSync(rawFreshDir)) {
      failLoudly(
        `precondition unmet: mkdtempSync did not produce a readable directory at ` +
          `${JSON.stringify(rawFreshDir)} — cannot exercise the with-clause cwd relocation ` +
          "without a real fresh directory to relocate into.",
      );
    }
    const freshDir = realpathSync(rawFreshDir);
    const freshDirFwd = fwd(freshDir);

    const workspace = plantThetaWorkspace([
      { source: "project", stem: "cwdchild", text: cwdChildTheta() },
      { source: "project", stem: "cwdcaller", text: cwdCallerTheta(freshDirFwd) },
    ]);

    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the caller command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      if (handle.command("cwdcaller") === undefined) {
        failLoudly(
          "no cwdcaller command to invoke — the .theta failed discovery/parse. Registered: " +
            JSON.stringify(handle.registeredNames()),
        );
      }

      const withMarkerInFresh = join(freshDir, "with-marker.txt");
      const withMarkerInParent = join(workspace.cwd, "with-marker.txt");
      const plainMarkerInParent = join(workspace.cwd, "plain-marker.txt");

      const turn = await driveSlashCaptureTurn(handle, "/cwdcaller");

      // No fail-closed ending of the drive (every SLSH-3 err note, cancelled
      // note, or panic framing lands here — absence is the success
      // observable per AGENTS.md's theta-system-note convention).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/cwdcaller (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the cwd-relocation drive surfaced fail-closed system note(s) instead of completing " +
          "both invokes: " + JSON.stringify(failureNotes),
      ).toEqual([]);

      // 1. RELOCATION: the with-clause child's marker landed in the fresh
      //    temp dir the clause named, and did NOT land in the parent session
      //    cwd — proving the clause moved the side effect, not merely copied
      //    it.
      expect(
        existsSync(withMarkerInFresh),
        `the with-clause invoke's marker was not found at ${JSON.stringify(withMarkerInFresh)} — ` +
          "the RFC 0009 cwd clause did not relocate the child's write.",
      ).toBe(true);
      expect(
        existsSync(withMarkerInParent),
        `the with-clause invoke's marker was found in the PARENT session cwd at ` +
          `${JSON.stringify(withMarkerInParent)} — the clause failed to relocate the child ` +
          "away from the default cwd.",
      ).toBe(false);

      // 2. NEGATIVE-LITE CONTROL: the clause-free invoke's marker landed in
      //    the parent session cwd — the default path is unchanged.
      expect(
        existsSync(plainMarkerInParent),
        `the clause-free invoke's marker was not found in the parent session cwd at ` +
          `${JSON.stringify(plainMarkerInParent)} — the default (no-clause) launch path ` +
          "regressed.",
      ).toBe(true);

      // 3. TYPED RETURN ROUND-TRIP: both invokes' `invoke<integer>`-bound
      //    values reached the caller and rendered into the real outbound
      //    query text (deterministic, independent of the model's reply) —
      //    marker-anchored extraction, mirroring the bug-0067 cell.
      const outbound = turn.userTexts.join("\n");
      const anchored = /CWDROUND=([\s\S]*?)\|END/.exec(outbound);
      expect(
        anchored,
        "the caller query's rendered text (CWDROUND=…|END) is absent — at least one invoke " +
          "did not resolve Ok. Outbound user texts: " + JSON.stringify(turn.userTexts) +
          "; system notes: " + JSON.stringify(turn.systemNotes),
      ).not.toBeNull();
      expect(
        anchored![1],
        "the typed invoke<integer> return values did not round-trip to the caller's own " +
          `computed values (101 from the with-clause call, 202 from the clause-free call). ` +
          "Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("101/202");
    } finally {
      await handle.dispose();
      workspace.dispose();
      rmSync(freshDir, { recursive: true, force: true });
    }
  });
});
