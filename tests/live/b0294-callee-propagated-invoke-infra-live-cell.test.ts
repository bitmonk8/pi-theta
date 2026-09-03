// Bug 0294 (live) — a callee-propagated `invoke_infra` `Err` is wrapped with an
// `invoke_callee` hop at the REAL AgentSession slash-dispatch boundary, so the
// SLSH-5 chain suffix survives for an `invoke_infra` leaf exactly as it does for
// any other callee-returned `Err`.
//
// The offline witnesses (`tests/b0294-callee-propagated-invoke-infra-wrapped.
// test.ts`) drive the shipped composition root in-process; this cell drives the
// same two-hop cascade through the real `createAgentSession` slash-dispatch
// boundary — the end-to-end obligation for the attribution/note observables the
// fix changes (docs/bugs/0294-…md §Reproduction). The leaf is a MISSING callee
// (a real `load_failure` `invoke_infra`), which is the case the pre-fix
// kind-only wrap gate got wrong: an `invoke_infra` kind was surfaced BARE
// regardless of provenance, dropping the hop and mis-attributing the failure to
// a file the parent never invoked.
//
// Topology: `/infratop` → `invoke("./infraleaf.theta")` → `infraleaf` →
// `invoke("./missing.theta")` (never planted → `load_failure`). The leaf hop is
// boundary-minted in `infraleaf` (its own `invoke` failed, surfaced bare there),
// but as `infraleaf` `?`-propagates it the OUTER hop must wrap it
// (`InvokeCalleeError`, source `callee-returned`), so `/infratop`'s note carries
// the SLSH-5 ` from <infraleaf> invoked at <infratop>:<line>` suffix.
//
// CONTROL: `/infradirect` directly invokes the missing callee (one hop, no
// middle) — its failure IS this hop's own, boundary-minted, so its note stays
// suffix-free (0293-corrected bare `load_failure`). This fences the fix against
// wrapping a directly-failing invoke.
//
// Token discipline mirrors the SLSH-5 live cell: neither theta runs an
// `@`-query — a missing-callee `invoke` short-circuits before any provider turn
// — so `userTexts` stays empty across every drive.
//
// NO SILENT SKIPPING. `requireLiveProvider` fails loudly naming the unmet
// precondition when no live provider/model resolves — this file never silently
// skips.

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

/** A prompt-mode theta whose sole body statement `invoke`s `./<stem>.theta` and
 *  `?`-propagates the callee's `Result`. The `invoke(` token sits on line 4. */
function invoker(calleeStem: string): string {
  return ["---", "mode: prompt", "---", `invoke("./${calleeStem}.theta")?`].join("\n") + "\n";
}

/** The 1-indexed line the `invoke(` token occupies in every `invoker(...)` body. */
const INVOKE_TOKEN_LINE = 4;

/** The SNK-i leaf row (`renderLeafKindNote`'s `invoke_infra` arm) for the missing
 *  grandchild callee — the note body the chain suffix is appended to. */
function snkiMissingRow(thetaName: string): string {
  return `theta /${thetaName} returned Err: invoke of ./missing.theta failed (load_failure)`;
}

/** One SLSH-5 hop suffix, verbatim per `slash-invocation.md:54`. */
function hopSuffix(calleePath: string, parentPath: string, line: number): string {
  return ` from ${calleePath} invoked at ${parentPath}:${line}`;
}

describe("bug 0294 (live) — a callee-propagated invoke_infra Err is wrapped with an invoke_callee hop through the real AgentSession slash-dispatch boundary", () => {
  it("a two-hop cascade over an invoke_infra (load_failure) leaf carries the SLSH-5 suffix; the one-hop control stays suffix-free — ", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      // The leaf `./missing.theta` is deliberately NOT planted → real load_failure.
      { source: "project", stem: "infraleaf", text: invoker("missing") },
      { source: "project", stem: "infradirect", text: invoker("missing") },
      { source: "project", stem: "infratop", text: invoker("infraleaf") },
    ]);
    // Post-`realpath` absolute paths, per SLSH-5. The ledger stores the
    // canonicalizePath form (realpath THEN forward-slash, invocation.md:12;
    // bug 0391), so `fwd` drops the join-native separators here — a
    // byte-identical no-op on POSIX.
    const fwd = (p: string): string => p.replace(/\\/g, "/");
    const realCwd = realpathSync(workspace.cwd);
    const thetaDir = join(realCwd, ".pi", "theta");
    const infraleafAbs = fwd(join(thetaDir, "infraleaf.theta"));
    const infratopAbs = fwd(join(thetaDir, "infratop.theta"));

    const handle = await bootShippedExtension({ workspace, provider });
    try {
      for (const stem of ["infraleaf", "infradirect", "infratop"]) {
        if (handle.command(stem) === undefined) {
          failLoudly(
            `live precondition unmet: discovery registered no \`/${stem}\` command ` +
              `(registered: ${JSON.stringify(handle.registeredNames())}). This cell cannot ` +
              "dispatch anything if this precondition is unmet.",
          );
        }
      }

      const directTurn = await driveSlashCaptureTurn(handle, "/infradirect");
      const topTurn = await driveSlashCaptureTurn(handle, "/infratop");

      // Zero model turns: a missing-callee `invoke` short-circuits before any
      // provider turn for every dispatch.
      expect(
        [...directTurn.userTexts, ...topTurn.userTexts],
        "a missing-callee invoke short-circuits before any provider turn — userTexts must " +
          "stay empty across both drives",
      ).toEqual([]);

      // CONTROL (one-hop, boundary-minted): the failure IS this hop's own, so no
      // wrapper and no chain suffix — the 0293-corrected bare load_failure.
      expect(
        directTurn.systemNotes,
        "a directly-failing invoke (no middle hop) is this hop's own boundary failure, " +
          "surfaced bare with no SLSH-5 suffix. observed: " + JSON.stringify(directTurn.systemNotes),
      ).toEqual([snkiMissingRow("infradirect")]);

      // TWO-HOP (the fix): infraleaf's own invoke failed load_failure (bare in
      // infraleaf), but as infraleaf `?`-propagates it the outer hop wraps it
      // (invoke_callee, callee-returned), so /infratop's note carries the SLSH-5
      // suffix for the invoke_infra leaf — the exact attribution the pre-fix
      // kind-only wrap gate dropped.
      expect(
        topTurn.systemNotes,
        "SLSH-5 (slash-invocation.md:54) makes the chain suffix a MUST whenever the failure " +
          "cascaded out of an invoked child — an invoke_infra leaf is a callee-returned Err " +
          "like any other when a callee `?`-propagates it, so the suffix must survive. " +
          "observed: " + JSON.stringify(topTurn.systemNotes),
      ).toEqual([snkiMissingRow("infratop") + hopSuffix(infraleafAbs, infratopAbs, INVOKE_TOKEN_LINE)]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
