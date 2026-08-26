// H8a live witness — bug 0306: an imported `.thetalib` enum now carries its
// explicit `= "..."` wire values through the materialisation seam
// (`materializeSymbol` copies `stmt.variantValues` into `MaterializedImport`,
// src/extension/import-static-checks.ts; `buildEnvironment` threads
// `imp.values` into `buildVariantWireMap`, src/runtime/lexical-environment.ts),
// so an imported `Enum.Variant` interpolates its declared wire string rather
// than the variant name fallback.
//
// The offline unit witness (tests/b0306-imported-enum-wire-values.test.ts)
// pins the wire and the equality contract at the `executeBody` boundary; it
// does not observe the real discovery→registration→drive path rendering an
// imported enum's wire into a live prompt. This cell drives that path through
// the shipped production composition root (`bootShippedExtension`), mirroring
// tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts's
// lib-importing shape, and asserts on a real observable — a value the live
// model can only produce from the DECLARED wire strings reaching the prompt.
//
// COMPUTED-FROM-WIRE DISCRIMINATOR: the imported enum's explicit values are the
// numeric strings "263" and "514", interpolated into a task-framed arithmetic
// prompt (`What is ${Code.Alpha} plus ${Code.Beta}? Answer with the number
// only.`). With the wire values threaded, the prompt reads "What is 263 plus
// 514?" and the reply carries their sum, 777. Without the fix the imported
// variants render as their NAMES ("Alpha", "Beta"), the prompt reads "What is
// Alpha plus Beta?", and no arithmetic sum is computable — so the sentinel is
// reachable only through the fixed seam. A task-framed question (not a
// verbatim-echo demand) is used because current models read
// `Reply with exactly …` as prompt injection and refuse it, turning the reply
// into a coin-flip rather than an observable (bug 0243, AGENTS.md §"Assert on
// real observables").
//
// ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
// required): the importing document must load with zero diagnostics through the
// SAME `checkThetaImports` seam the live host reaches, over an in-memory
// `FakeFileSystem` — so the live observable below is attributable to the wire
// fix and not to an unrelated load failure, before any token is spent.
//
// WORKSPACE CONTROL: a plain, bug-0306-unrelated `mode: prompt` theta with no
// import. Present only to prove the workspace/discovery/registration path is
// sound, so an absent app registration cannot be misattributed to a broken
// harness rather than to a regression of the fix.
//
// SUBAGENT CHILD PINS: not required for this observable — every planted theta
// is `mode: prompt` with no `tools:` and no `invoke`, so no RFC-0006
// subagent-child spawn occurs. `./harness` sets both #subagent-child-pins at
// module scope regardless (inherited by importing it).
//
// Token cost: ONE live turn (the app's task-framed arithmetic discriminator).
// The workspace control is registration-only — no drive, no tokens.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// This fix adds no new diagnostic code and no new reachable code path from an
// ordinary `pi -p` run — it threads an existing value record through an
// existing seam — so `tests/fixtures/h7a/permitted-codes.json` is expected to
// need no change; this file's own capture assertion below is the evidence for
// that expectation in this run.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
import { parseDeps, parseDoc } from "../helpers/e2e-s1";
import { FakeFileSystem } from "../helpers/fake-file-system";
import { checkThetaImports } from "../../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";

/**
 * The imported `.thetalib`: one enum whose explicit wire values are numeric
 * strings, so the sum reaching the live reply is computable ONLY from the
 * declared wire ("263" + "514" = 777), never from the variant-name fallback.
 */
const LIB_STEM = "b0306lib-wire";
const LIB_TEXT = 'enum Code { Alpha = "263", Beta = "514" }\n';

/** The oracle: 263 + 514, reachable only when the imported wire values reach the prompt. */
const WIRE_SUM_SENTINEL = "777";

/**
 * The importing app — interpolates two imported enum variants into a
 * task-framed arithmetic prompt. Pre-fix the variants render as their names and
 * the sum is not computable; post-fix they render as "263"/"514" and the reply
 * carries their sum.
 */
const APP = [
  "---",
  "mode: prompt",
  "---",
  `import { Code } from "./${LIB_STEM}.thetalib"`,
  "@`What is ${Code.Alpha} plus ${Code.Beta}? Answer with the number only.`",
  "",
].join("\n");

/** A plain theta in the same workspace: a broken workspace must not read as a regression. */
const WORKSPACE_CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 483 plus 466? Answer with the number only.`",
  "",
].join("\n");

/** The fail-closed markers a top-level theta drive lands on the `theta-system-note` channel. */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

/**
 * ATTRIBUTION GUARD driver: the same `checkThetaImports` production seam the
 * live host reaches, over an in-memory `FakeFileSystem`, mirroring
 * b0138's own driver.
 */
async function composeCodesOf(body: string): Promise<readonly string[]> {
  const doc = parseDoc(body, "/proj/attribution.theta");
  expect(
    doc.frontmatter,
    "attribution precondition: the importing theta's frontmatter must parse",
  ).not.toBeNull();
  const fs = new FakeFileSystem({
    homedir: "/home",
    cwd: "/proj",
    files: { [`/proj/${LIB_STEM}.thetalib`]: LIB_TEXT },
    dirs: { "/proj": [`${LIB_STEM}.thetalib`] },
  });
  const input: ThetaCompositionInput = {
    slashName: "attribution",
    sourcePath: "/proj/attribution.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const result = await checkThetaImports(input, { fs, parseDeps: parseDeps() });
  return result.diagnostics.map((d) => d.code);
}

let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    const offenders = thetaOwnedStderrLines(lines);
    expect(
      offenders,
      "bug 0018's live verification observable for this suite is a 0-byte " +
        "stderr capture; this spy caught theta-owned stderr line(s) instead: " +
        JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("bug 0306 live: an imported enum's explicit wire values reach a live prompt", () => {
  it("registers the importing app and drives it to the sum of the imported enum's declared wire values", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the importing document must carry zero compose-tier
    // diagnostics through the SAME seam the live host reaches, so the live
    // sentinel below cannot be produced by an unrelated load failure.
    await expect(composeCodesOf(APP)).resolves.toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b0306livectl", text: WORKSPACE_CONTROL },
      { source: "project", stem: "b0306liveapp", text: APP },
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
        handle.command("b0306livectl"),
        "the precondition control did not register — a broken workspace, not the wire " +
          "fix, would explain the app's behaviour too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      expect(
        handle.command("b0306liveapp"),
        "the importing app did not register — the enum import failed to materialise. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0306liveapp");
      expect(
        driven.text,
        "bug-0306: the live reply did not contain " +
          WIRE_SUM_SENTINEL +
          " — the imported enum's declared wire values ('263'/'514') did not reach the " +
          "prompt, so no arithmetic sum was computable (the variant NAMES rendered instead). " +
          "Reply: " + JSON.stringify(driven.text),
      ).toContain(WIRE_SUM_SENTINEL);
      expect(
        driven.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0306: the app's drive must end clean — a fail-closed theta-system-note here " +
          "means something broke despite a clean load. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
