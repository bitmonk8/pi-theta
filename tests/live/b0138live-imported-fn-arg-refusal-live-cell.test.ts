// H8a live witness — bug 0138: an imported-`.thetalib` `fn` call's ARGUMENT is
// now judged at the COMPOSE layer (`checkImportedFnCallArgs`,
// src/extension/invoke-static-checks.ts, wired once per importing theta from
// `checkThetaImports`, src/extension/import-static-checks.ts). At parse alone,
// `checkFnCallArgs`'s `importedSymbols` arm (src/parser/type-layer-checks.ts)
// still returns — a byte-identical same-file call is refused while the
// imported spelling is silent — and route 2 is what closes that gap ONE FRAME
// LATER, once the resolved library already exists as a parsed `ThetaDocument`.
// This is observable only through the REAL discovery→registration path, not
// through the offline `checkThetaImports` unit witness
// (`tests/imported-thetalib-fn-call-args-checked.test.ts`): the fixed
// observable is REGISTRATION — an `E`-severity compose diagnostic denies it
// (`hasLoadParseError`, src/extension/production-composition.ts) — plus the
// `theta-system-note` channel a real, settled `SessionManager` carries.
//
// TWO HALVES:
//   (a) REFUSED — a caller importing `fn rate(a: number): number { a }` and
//       calling `rate("s")` must NOT register, and its refusal must name
//       `theta/parse/fn-arg-type-mismatch` with the registry-sourced *Message*
//       on the note channel.
//   (b) ADMITTED (control) — the byte-identical caller with `rate(3)`
//       registers and DRIVES a real turn to a task-question answer, proving
//       the refusal above is a real gate and not a broken workspace.
//
// ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
// required): both documents' compose-tier diagnostic code lists are asserted
// through the SAME production seam the live host reaches
// (`checkThetaImports`) but over an in-memory `FakeFileSystem`, mirroring
// `tests/imported-thetalib-fn-call-args-checked.test.ts`'s own driver. This is
// what proves the live observable below is attributable to THIS route and not
// to an unrelated load failure, before any token is spent.
//
// DIAG-4: the asserted message is READ from
// docs/spec_topics/diagnostics/code-registry-parse.md through `parseRegistry` /
// `registryMessage` (tools/code-registry/index.js), never written out here.
//
// SUBAGENT CHILD PINS: not required for this observable — every planted theta
// is `mode: prompt` and drives no `invoke` / subagent — but `./harness` sets
// both #subagent-child-pins at module scope regardless, the same posture
// `fn-call-arity-live-cell.test.ts` documents.
//
// Token cost: ONE live turn (the admitted control's task-question answer). The
// refused half is registration-only, so no drive is attempted and no tokens
// are spent on it.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.

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
import { collectSystemNotes } from "../helpers/live-transcript";
import { assertThetaStderrCleanForEach } from "../helpers/theta-stderr-gate";
import { parseDeps, parseDoc } from "../helpers/e2e-s1";
import { FakeFileSystem } from "../helpers/fake-file-system";
import { checkThetaImports } from "../../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../src/parser/frontmatter";
import { fnArgMessage } from "../helpers/registry-oracle";

/** The row under test: E severity, phase `type`, so a fired slot denies registration. */
const CODE = "theta/parse/fn-arg-type-mismatch";

/**
 * `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>,
 * got <actual>` — DIAG-4: the message half is READ from the registry row, not
 * copied.
 */
function fnArgFragment(
  name: string,
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return `${CODE}: ${fnArgMessage(name, index, paramName, expected, actual)}`;
}

/**
 * The `.thetalib` every caller below imports: one structural-parameter `fn`,
 * needing only the signature (no declaring-file `TypeEnv` lookup), the
 * PRIM_LIB shape `tests/imported-thetalib-fn-call-args-checked.test.ts` uses.
 */
const LIB_STEM = "b0138lib-arg-refusal";
const LIB_TEXT = "fn rate(a: number): number { a }\n";

/** REFUSED — half (a): `rate("s")` against `a: number`. */
const REFUSED = [
  "---",
  "mode: prompt",
  "---",
  `import { rate } from "./${LIB_STEM}.thetalib"`,
  'let r = rate("s")',
  "r",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over inline arithmetic,
// never a verbatim-echo demand ("reply with exactly …") — current models read
// that shape as prompt injection and refuse it, making the reply a coin flip
// rather than an observable (bug 0243).
const ADMITTED_SENTINEL = "525";

/**
 * ADMITTED (control) — the byte-identical caller with a well-typed argument.
 * Registers and drives, before and after the fix alike.
 */
const ADMITTED = [
  "---",
  "mode: prompt",
  "---",
  `import { rate } from "./${LIB_STEM}.thetalib"`,
  "let r = rate(3)",
  "@`What is 407 plus 118? Answer with the number only.`",
  "",
].join("\n");

/** A plain theta in the same workspace: a broken workspace must not read as a refusal. */
const WORKSPACE_CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 483 plus 466? Answer with the number only.`",
  "",
].join("\n");

/**
 * ATTRIBUTION GUARD driver: the same `checkThetaImports` production seam the
 * live host reaches, over an in-memory `FakeFileSystem`, mirroring
 * `tests/imported-thetalib-fn-call-args-checked.test.ts`'s own driver.
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

assertThetaStderrCleanForEach();

describe("bug 0138 live: an imported-`.thetalib` `fn` call's mistyped argument denies registration, while its well-typed twin registers and drives", () => {
  it("registers the well-typed control and drives it to the live sentinel, while the mistyped imported call does not register and carries its refusal on the theta-system-note channel", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the refused document must carry exactly the one-code
    // disposition through the SAME `checkThetaImports` seam the live host
    // reaches, and the admitted document must carry zero.
    await expect(composeCodesOf(REFUSED)).resolves.toEqual([CODE]);
    await expect(composeCodesOf(ADMITTED)).resolves.toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent refused-document registration cannot be misattributed to a
      // broken workspace.
      { source: "project", stem: "b0138livectl", text: WORKSPACE_CONTROL },
      { source: "project", stem: "b0138liveref", text: REFUSED },
      { source: "project", stem: "b0138liveadm", text: ADMITTED },
    ];
    const workspace = plantThetaWorkspace(thetas);
    // The imported `.thetalib`, planted BESIDE the discovered `.theta` files so
    // the relative spec resolves; a `.thetalib` is never slash-discovered, so
    // this adds no command of its own (imports.md:15/19).
    writeFileSync(
      join(workspace.cwd, ".pi", "theta", `${LIB_STEM}.thetalib`),
      LIB_TEXT,
      "utf8",
    );
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0138livectl"),
        "the precondition control did not register — a broken workspace, not the load " +
          "refusal, would explain the refused document's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (a) REFUSED — the mistyped imported call must not register.
      expect(
        handle.command("b0138liveref"),
        '`rate("s")` against an imported `fn rate(a: number)` registered — the compose-layer ' +
          "argument-type check stopped denying the load gate. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The theta-system-note channel, read off the settled SessionManager. The
      // load-time diagnostics fire before any drive is attempted, so the full
      // entry list already carries them.
      const notes = collectSystemNotes(handle.sessionManager.getEntries());
      const refusalFragment = fnArgFragment("rate", 0, "a", "number", "string");
      expect(
        notes.some((note) => note.includes(refusalFragment)),
        "no theta-system-note entry named " +
          CODE +
          " for the mistyped imported-call document — the refusal did not reach the note " +
          "channel, so this harness cannot witness a refusal at all and the admitted half's " +
          "registration proves nothing. Notes: " + JSON.stringify(notes),
      ).toBe(true);

      // (b) ADMITTED (control) — the well-typed imported call must register
      // and drive a real turn to the deterministic sentinel.
      expect(
        handle.command("b0138liveadm"),
        '`rate(3)` against an imported `fn rate(a: number)` failed to register — the ' +
          "well-typed control must not be refused. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0138liveadm");
      expect(
        driven.text,
        "the live model reply for the well-typed control did not contain the deterministic " +
          "sentinel. Reply: " + JSON.stringify(driven.text),
      ).toContain(ADMITTED_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the well-typed control appended a theta-system-note (a " +
          "fail-closed ending) — the well-typed path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
