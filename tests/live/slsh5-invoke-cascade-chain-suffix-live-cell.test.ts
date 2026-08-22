// H8a (live) — bug 0088: the SLSH-5 chain-attribution suffix is never
// emitted at the real slash-dispatch boundary for a failure cascaded out of a
// real, on-disk `invoke`d child.
//
// Spec: docs/bugs/0088-slsh5-chain-suffix-never-emitted.md §Reproduction (the
// exact `chainchild.theta` / `chainparent.theta` / `chaintop.theta` /
// `chaindirect.theta` fixtures below are byte-identical to the report's), and
// `docs/spec_topics/slash-invocation.md:54` (SLSH-5).
//
// WHY LIVE, AND WHY THIS SHAPE. The two offline witnesses
// (`tests/slsh5-invoke-cascade-chain-suffix.test.ts`,
// `tests/slsh5-invoke-ledger-realpath-rejection.test.ts`) drive, respectively,
// the shipped composition root directly (`discoverAndComposeFixtures`, no
// `AgentSession`) and the ledger seam alone. Neither drives a REAL
// `AgentSession` through the REAL `bootShippedExtension`/`driveSlashCaptureTurn`
// harness this repo's other live cells use, and bug 0088 itself was reported
// "Live-confirmed against a real provider, zero provider turns" — the report's
// own §Observed at line names `tests/live/harness.ts`. This cell is the live
// witness the bug report asked for and the H8a suite lacked (bug 0088 §Why it
// matters item 4: "no live test drives a cascaded `invoke_callee` to the slash
// boundary").
//
// PROVIDER-FREE. `chainchild.theta`'s `@`-query renders empty
// (`let s = ""` / `` @`${s}`? ``), which QRY-6/QRY-8 short-circuits to
// `Err(ValidationError{cause:"empty_template"})` with `attempts: 0` before any
// provider turn — the same zero-token shape the bug report's own live
// reproduction used. `chainparent`/`chaintop` reach that short-circuit only
// after a real `invoke` hop runs through `#driveCallee`'s prompt→prompt attach
// cell, so this cell is a real, on-disk, multi-file cascade, not a synthetic
// wrapper.
//
// THE OBSERVABLE. `theta-system-note` entries read off the settled in-memory
// `SessionManager` via `driveSlashCaptureTurn`'s `systemNotes` (AGENTS.md
// "Assert on real observables, not on `prompt()` resolving") — never on
// `prompt()` merely resolving. Pre-fix, every note below is the bare SNK-b row
// with no ` from `/`invoked at` suffix, byte-identical across all three
// theta names modulo the name itself (the report's own headline symptom).
//
// PATHS ARE POST-`realpath` ABSOLUTE (SLSH-5). `plantThetaWorkspace`'s
// `mkdtempSync` root is realpath'd once, up front, so the expected suffix
// strings this file asserts already agree with whatever the production
// `FileSystem.realpath` seam returns for the same on-disk paths — exactly the
// precaution the offline cascade-suffix witness takes for the same reason (a
// symlinked OS temp root would otherwise disagree with a fix routing through
// that seam for an unrelated reason).
//
// NO SILENT SKIPPING. `requireLiveProvider` fails loudly naming the unmet
// precondition when no live provider/model resolves — this file never
// silently skips.

import { realpathSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
} from "./harness";

/** The em-dash U+2014 the SLSH-4 templates carry verbatim. */
const DASH = "\u2014";

/** The SNK-b leaf row (the `empty_template` arm of `renderLeafKindNote`). */
function snkbRow(thetaName: string): string {
  return `theta /${thetaName} returned Err: rendered query template was empty ${DASH} no provider turn was issued`;
}

/** One SLSH-5 hop suffix, verbatim per `slash-invocation.md:54`. */
function hopSuffix(calleePath: string, parentPath: string, line: number): string {
  return ` from ${calleePath} invoked at ${parentPath}:${line}`;
}

/**
 * The leaf theta whose `@`-query renders empty — byte-identical to the bug
 * report's `chainchild.theta` §Reproduction fixture.
 */
const LEAF_BODY = ["---", "mode: prompt", "---", 'let s = ""', "@`${s}`?"].join("\n") + "\n";

/**
 * A one-hop invoker — byte-identical shape to the report's `chainparent.theta`
 * / `chaintop.theta`. The `invoke(` token sits on line 4, the `<line>` SLSH-5
 * records.
 */
function invoker(calleeStem: string): string {
  return ["---", "mode: prompt", "---", `invoke("./${calleeStem}.theta")?`].join("\n") + "\n";
}

/** The 1-indexed line the `invoke(` token occupies in every `invoker(...)` body. */
const INVOKE_TOKEN_LINE = 4;

describe("bug 0088 (live) — the SLSH-5 chain suffix on a real invoke cascade through the real AgentSession slash-dispatch boundary", () => {
  it("a one-hop, a two-hop, and a no-hop control drive: the cascades carry the SLSH-5 suffix, the control stays suffix-free — ", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "chainchild", text: LEAF_BODY },
      { source: "project", stem: "chaindirect", text: LEAF_BODY },
      { source: "project", stem: "chainparent", text: invoker("chainchild") },
      { source: "project", stem: "chaintop", text: invoker("chainparent") },
    ]);
    // Post-`realpath` absolute, per SLSH-5 and the offline witness's own
    // precaution: canonicalise the workspace root once, up front, so these
    // expectations agree with the production `FileSystem.realpath` seam.
    const realCwd = realpathSync(workspace.cwd);
    const thetaDir = join(realCwd, ".pi", "theta");
    const child = join(thetaDir, "chainchild.theta");
    const parent = join(thetaDir, "chainparent.theta");
    const top = join(thetaDir, "chaintop.theta");

    const handle = await bootShippedExtension({ workspace, provider });
    try {
      for (const stem of ["chainchild", "chaindirect", "chainparent", "chaintop"]) {
        if (handle.command(stem) === undefined) {
          failLoudly(
            `live precondition unmet: discovery registered no \`/${stem}\` command ` +
              `(registered: ${JSON.stringify(handle.registeredNames())}). This cell cannot ` +
              "dispatch anything if this precondition is unmet.",
          );
        }
      }

      const directTurn = await driveSlashCaptureTurn(handle, "/chaindirect");
      const parentTurn = await driveSlashCaptureTurn(handle, "/chainparent");
      const topTurn = await driveSlashCaptureTurn(handle, "/chaintop");

      // Zero model turns: every leaf `@`-query short-circuits on its empty
      // rendered template before a provider turn is issued.
      expect(
        [...directTurn.userTexts, ...parentTurn.userTexts, ...topTurn.userTexts],
        "the empty-template short-circuit must fire before any provider turn for every " +
          "dispatch — userTexts must stay empty across all three drives",
      ).toEqual([]);

      // CONTROL: a non-cascaded error keeps an EMPTY chain, so its note carries
      // no suffix. This is the fence bug 0088's fix must satisfy (§Fix: "chain
      // must stay empty for a non-cascaded error").
      expect(
        directTurn.systemNotes,
        "an error raised in the entry theta (no `invoke` anywhere in its body) cascaded " +
          "out of no child, so SLSH-5 emits no hop suffix. observed: " +
          JSON.stringify(directTurn.systemNotes),
      ).toEqual([snkbRow("chaindirect")]);

      // One-hop cascade: /chainparent -> chainchild.
      expect(
        parentTurn.systemNotes,
        "SLSH-5 (slash-invocation.md:54) makes the chain suffix a MUST on the per-kind row " +
          "whenever the failure cascaded out of an invoked child; without it the operator is " +
          "told the failure belongs to the entry theta, with nothing saying another file ran. " +
          "observed: " + JSON.stringify(parentTurn.systemNotes),
      ).toEqual([snkbRow("chainparent") + hopSuffix(child, parent, INVOKE_TOKEN_LINE)]);

      // Two-hop cascade: /chaintop -> chainparent -> chainchild, leaf-first,
      // outermost hop last.
      expect(
        topTurn.systemNotes,
        "SLSH-5 orders the hops leaf-first; a failure two files deep must name the file it " +
          "was raised in and the call site of every hop that carried it. observed: " +
          JSON.stringify(topTurn.systemNotes),
      ).toEqual([
        snkbRow("chaintop") +
          hopSuffix(child, parent, INVOKE_TOKEN_LINE) +
          hopSuffix(parent, top, INVOKE_TOKEN_LINE),
      ]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
