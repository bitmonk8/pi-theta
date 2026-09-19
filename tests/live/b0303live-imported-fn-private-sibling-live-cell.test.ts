// H8a live witness — bug 0303: an imported `.thetalib` `fn` body resolves its
// FREE names in its DECLARING module's scope, not the calling theta's. A public
// lib `fn compute(x)` factored over a PRIVATE sibling `fn helper(x)` (the first
// thing a library author does) must run correctly when the app imports only
// `compute` — the sibling `helper` resolves in the declaring module (the fix
// threads a per-declaring-module environment through `evalUserFnCall`,
// src/runtime/statement-executor.ts; the lib's own scope is materialised via
// `MaterializedImport`'s module scope, src/extension/import-static-checks.ts).
//
// The offline unit witness (tests/b0303-imported-fn-body-declaring-scope.test.ts,
// cell B1) pins this at the `executeBody` boundary; it does not observe the real
// discovery→registration→drive path carrying a declaring-scope-resolved value
// into a live prompt. This cell drives that path through the shipped production
// composition root (`bootShippedExtension`), mirroring
// tests/live/b0305live-imported-enum-alias-identity-live-cell.test.ts's
// lib-importing shape, and asserts on a real observable — a value the live model
// can only produce when the imported body resolves its private sibling.
//
// DECLARING-SCOPE DISCRIMINATOR (computed theta-side): the app imports ONLY
// `compute` and calls `let answer = compute(263)`. `compute(x)` is `helper(x)`
// and `helper(x)` is `x + 514`, both declared in the lib. With declaring-module
// scope the sibling resolves, `answer` is 777, and the reply carries 777.
// Without the fix the sibling `helper` is unbound in the caller's env, the call
// aborts in bug 0003's belt, the drive ends fail-closed, and 777 never reaches
// the prompt. So the sentinel 777 is reachable ONLY through the declaring-scope
// seam. The model performs only the trivial `777 plus 0`; the theta computes the
// discriminator, so the observable is deterministic given the fix. A task-framed
// question (not a verbatim-echo demand) is used because current models read
// `Reply with exactly …` as prompt injection and refuse it, turning the reply
// into a coin-flip rather than an observable (bug 0243, AGENTS.md §"Assert on
// real observables").
//
// ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
// required): the importing document must load with zero diagnostics through the
// SAME `checkThetaImports` seam the live host reaches, over an in-memory
// `FakeFileSystem` — so the live observable below is attributable to the
// declaring-scope fix and not to an unrelated load failure, before any token is
// spent.
//
// WORKSPACE CONTROL: a plain, bug-0303-unrelated `mode: prompt` theta with no
// import. Present only to prove the workspace/discovery/registration path is
// sound, so an absent app registration cannot be misattributed to a broken
// harness rather than to a regression of the fix.
//
// SUBAGENT CHILD PINS: not required for this observable — every planted theta is
// `mode: prompt` with no `tools:` and no `invoke`, and the imported `fn` is a
// plain (non-subagent) `fn`, so no RFC-0006 subagent-child spawn occurs.
// `./harness` sets both #subagent-child-pins at module scope regardless
// (inherited by importing it).
//
// Token cost: ONE live turn (the app's task-framed arithmetic discriminator).
// The workspace control is registration-only — no drive, no tokens.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty. `0.291.0` is a literal version
// placeholder — the lane parent fills the real version.

import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { FAIL_CLOSED_MARKERS } from "../helpers/live-transcript";
import { assertThetaStderrCleanForEach } from "../helpers/theta-stderr-gate";
import { composeCodesOf } from "../helpers/thetalib-load-harness";

/**
 * The imported `.thetalib`: a public `compute` factored over a PRIVATE sibling
 * `helper`. The app imports only `compute`; declaring-module scope makes the
 * sibling resolve.
 */
const LIB_STEM = "b0303lib-sibling";
const LIB_TEXT = [
  "fn helper(x: integer): integer {",
  "  x + 514",
  "}",
  "fn compute(x: integer): integer {",
  "  helper(x)",
  "}",
  "",
].join("\n");

/** The oracle: reachable only when the imported body resolves its private sibling. */
const WIRE_SIBLING_SENTINEL = "777";

/**
 * The importing app — imports ONLY `compute` and computes over it. Post-fix
 * `compute(263)` is `helper(263)` = 263 + 514 = 777, so `answer` is 777; pre-fix
 * the sibling `helper` is unbound in the caller's env, the call aborts, and the
 * sentinel never reaches the prompt.
 */
const APP = [
  "---",
  "mode: prompt",
  "---",
  `import { compute } from "./${LIB_STEM}.thetalib"`,
  "let answer = compute(263)",
  "@`What is ${answer} plus 0? Answer with the number only.`",
  "",
].join("\n");

/** A plain theta in the same workspace: a broken workspace must not read as a regression. */
const WORKSPACE_CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 321 plus 123? Answer with the number only.`",
  "",
].join("\n");

assertThetaStderrCleanForEach();

describe("bug 0303 live: an imported fn body resolves its private sibling into a live prompt", () => {
  it("registers the importing app and drives it to the private-sibling sentinel", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the importing document must carry zero compose-tier
    // diagnostics through the SAME seam the live host reaches, so the live
    // sentinel below cannot be produced by an unrelated load failure.
    await expect(composeCodesOf(APP, LIB_STEM, LIB_TEXT)).resolves.toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b0303livectl", text: WORKSPACE_CONTROL },
      { source: "project", stem: "b0303liveapp", text: APP },
    ];
    const workspace = plantThetaWorkspace(thetas);
    // The imported `.thetalib`, planted BESIDE the discovered `.theta` files so
    // the relative spec resolves; a `.thetalib` is never slash-discovered, so
    // this adds no command of its own (imports.md §Visibility).
    writeFileSync(
      join(workspace.cwd, ".pi", "theta", `${LIB_STEM}.thetalib`),
      LIB_TEXT,
      "utf8",
    );
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0303livectl"),
        "the precondition control did not register — a broken workspace, not the " +
          "declaring-scope fix, would explain the app's behaviour too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      expect(
        handle.command("b0303liveapp"),
        "the importing app did not register — the `fn` import failed to materialise. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0303liveapp");
      expect(
        driven.text,
        "bug-0303: the live reply did not contain " +
          WIRE_SIBLING_SENTINEL +
          " — the imported body did not resolve its private sibling `helper` in the " +
          "declaring module, so `compute(263)` aborted and the sentinel never reached " +
          "the prompt. Reply: " + JSON.stringify(driven.text),
      ).toContain(WIRE_SIBLING_SENTINEL);
      expect(
        driven.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0303: the app's drive must end clean — a fail-closed theta-system-note here " +
          "means the imported body aborted despite a clean load (the sibling did not " +
          "resolve). Notes: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
