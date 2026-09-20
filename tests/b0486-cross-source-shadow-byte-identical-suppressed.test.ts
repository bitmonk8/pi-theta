// Bug 0486 — the discovery walk's cross-source-shadow mint warns on EVERY
// lower-tier copy of a slash name, including one whose bytes are IDENTICAL to
// the winner's. A relocated-cwd subagent child (cwd = its worktree, worker
// identity pinned to the main repo via `--theta`, RFC 0009 §4) is showered with
// one warning per worker slug at every load, because ambient discovery in the
// worktree re-finds byte-identical copies of the same workers through the
// project walk-up and the settings entry (docs/bugs/0486-cross-source-shadow-
// warns-on-byte-identical-copies.md).
//
// §Fix: before minting the shadow warning, compare the shadowed candidate's
// bytes with the winner's (winner read once per group). Byte-identical ⇒ shadow
// SILENTLY (the candidate still drops, no diagnostic — the precedence is
// correct and the winner is the intended copy). Differing content ⇒ warn
// unchanged (a stale copy silently losing to the current one is the real hazard
// the diagnostic exists for). A read failure during the comparison fails OPEN
// to the warning (we cannot prove identity, so we surface).
//
// WHY the shadow code string is located by MESSAGE FRAGMENT, never by its
// literal namespaced code text: the closed-set corpus gate
// (tests/registry-closed-set-corpus-gate.test.ts) pins that the shadow code has
// NO literal-code occurrence under tests/; the shipped extractor treats any
// code-shaped literal in a tests/** source — comments included — as an
// assertion. Filtering on the fragment mirrors b0331/b0440/b0461.

import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FileSystem } from "../src/seams/file-system";
import type { SourcedCandidate } from "../src/discovery/discovery-model";
import { discoverThetas } from "../src/discovery/discovery-walk";
import { resolveSlashNames } from "../src/discovery/discovery-collision-resolve";
import {
  cliSettingsShadowInput,
  cliSettingsIdenticalShadowInput,
  namedTheta,
} from "./helpers/fake-file-system";
import { THETA_BODY } from "./helpers/discovery-scratch-harness";

// The shadow arm's message fragment (never the registry code literal).
const SHADOW_FRAGMENT = "shadowed across discovery sources";

function shadowDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((d) => d.message.includes(SHADOW_FRAGMENT));
}

// --------------------------------------------------------------------------
// Cell 1 — byte-identical copies: SUPPRESSED. The cli-flag copy (priority 1)
// and the settings copy (priority 2) share byte-exact content; the winner
// still registers, but NO shadow diagnostic is minted. This is the
// relocated-cwd subagent-child case the fix targets.
// --------------------------------------------------------------------------

describe("b0486 cell 1 — byte-identical shadow is suppressed", () => {
  it("mints no cross-source-shadow diagnostic and still registers the winner", async () => {
    const { thetas, diagnostics } = await discoverThetas(
      cliSettingsIdenticalShadowInput(THETA_BODY),
    );

    expect(shadowDiagnostics(diagnostics)).toHaveLength(0);
    // The higher-priority (cli-flag) copy still wins and registers.
    const winner = namedTheta(thetas, "plan");
    expect(winner).toBeDefined();
    expect(winner?.path).toBe("/ext/plan.theta");
    expect(winner?.source).toBe("cli");
  });
});

// --------------------------------------------------------------------------
// Cell 2 — differing content: the warning is UNCHANGED. The shadowed copy's
// bytes diverge from the winner's, so a stale copy silently losing to the
// current one still surfaces. `cliSettingsShadowInput` now diverges the two
// copies' content for exactly this reason.
// --------------------------------------------------------------------------

describe("b0486 cell 2 — differing-content shadow still warns", () => {
  it("mints exactly one cross-source-shadow diagnostic when the copies diverge", async () => {
    const { diagnostics } = await discoverThetas(cliSettingsShadowInput(THETA_BODY));

    const shadows = shadowDiagnostics(diagnostics);
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.severity).toBe("warning");
  });
});

// --------------------------------------------------------------------------
// Cell 3 — read failure during the comparison FAILS OPEN. Drives
// `resolveSlashNames` directly (a throw at `validateAndRead` would drop the
// candidate before the shadow compare is reached; the fail-open path is only
// reachable when the read throws AFTER validation). Two distinct-path
// candidates for one slug across two tiers, over an fs whose `readBytes`
// rejects: identity cannot be proven, so the warning surfaces.
// --------------------------------------------------------------------------

describe("b0486 cell 3 — a read failure during comparison fails open to the warning", () => {
  it("mints the shadow diagnostic when the winner's bytes cannot be read", async () => {
    const throwingFs = {
      readBytes(): Promise<Uint8Array> {
        return Promise.reject(new Error("EACCES"));
      },
    } as unknown as FileSystem;

    const candidates: SourcedCandidate[] = [
      {
        path: "/ext/plan.theta",
        stem: "plan",
        source: "cli",
        sourceLabel: "--theta flag",
        descriptorValue: "--theta /ext/plan.theta",
      },
      {
        path: "/work/plan.theta",
        stem: "plan",
        source: "settings",
        sourceLabel: "settings thetaPaths",
        descriptorValue: "/work/plan.theta",
      },
    ];

    const diagnostics: Diagnostic[] = [];
    const thetas = await resolveSlashNames(throwingFs, candidates, [], diagnostics);

    const shadows = shadowDiagnostics(diagnostics);
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.severity).toBe("warning");
    // The winner still registers regardless of the fail-open warning.
    expect(namedTheta(thetas, "plan")?.source).toBe("cli");
  });
});
