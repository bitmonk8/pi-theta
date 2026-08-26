// H8a live witness — bug 0305: one imported `.thetalib` enum bound under TWO
// aliases compares `==` equal across the aliases, because enum value identity
// keys on the DECLARING declaration (`enumDeclaringKey(resolvedPath, source)`
// threaded through `MaterializedImport.declaringKey`,
// src/extension/import-static-checks.ts; `makeEnumValue` minted from that key,
// src/runtime/value.ts) rather than the resolution-site local name — so two
// aliases of one declaration mint one tag and their variants are
// interchangeable.
//
// The offline unit witness (tests/b0305-enum-alias-identity.test.ts) pins the
// alias-identity equality contract at the `executeBody` boundary; it does not
// observe the real discovery→registration→drive path carrying an alias-equal
// verdict into a live prompt. This cell drives that path through the shipped
// production composition root (`bootShippedExtension`), mirroring
// tests/live/b0306live-imported-enum-wire-live-cell.test.ts's lib-importing
// shape, and asserts on a real observable — a value the live model can only
// produce when the two aliases compare equal theta-side.
//
// ALIAS-IDENTITY DISCRIMINATOR (computed theta-side): the imported enum is
// bound under two aliases (`import { Sev as A, Sev as B }`). The theta computes
// `same = A.Low == B.Low` — two aliases of ONE declaration — and selects
// `answer = same ? 777 : 111`. With declaration identity the two aliases mint
// one tag, `same` is `true`, `answer` is 777, and the reply carries 777.
// Without it the two aliases mint different tags, `same` is `false`, `answer`
// is 111 — so the sentinel 777 is reachable ONLY through the alias-identity
// seam. The model performs only the trivial `777 plus 0`; the theta computes
// the identity discriminator, so the observable is deterministic given the
// fix. A task-framed question (not a verbatim-echo demand) is used because
// current models read `Reply with exactly …` as prompt injection and refuse
// it, turning the reply into a coin-flip rather than an observable (bug 0243,
// AGENTS.md §"Assert on real observables").
//
// ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
// required): the importing document must load with zero diagnostics through the
// SAME `checkThetaImports` seam the live host reaches, over an in-memory
// `FakeFileSystem` — so the live observable below is attributable to the
// alias-identity fix and not to an unrelated load failure, before any token is
// spent.
//
// WORKSPACE CONTROL: a plain, bug-0305-unrelated `mode: prompt` theta with no
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
 * The imported `.thetalib`: one enum declaration. The app binds it under two
 * aliases; declaration identity makes their variants compare equal.
 */
const LIB_STEM = "b0305lib-alias";
const LIB_TEXT = 'enum Sev { Low = "263", High = "514" }\n';

/** The oracle: reachable only when the two aliases of one declaration compare `==` equal. */
const WIRE_ALIAS_SENTINEL = "777";

/**
 * The importing app — binds one enum under two aliases and branches on their
 * cross-alias equality. Post-fix `A.Low == B.Low` is `true` (one declaration,
 * one tag), so `answer` is 777; pre-fix the aliases mint different tags, so
 * `answer` is 111 and the sentinel never reaches the prompt.
 */
const APP = [
  "---",
  "mode: prompt",
  "---",
  `import { Sev as A, Sev as B } from "./${LIB_STEM}.thetalib"`,
  "let same = A.Low == B.Low",
  "let answer = same ? 777 : 111",
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

/** The fail-closed markers a top-level theta drive lands on the `theta-system-note` channel. */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

/**
 * ATTRIBUTION GUARD driver: the same `checkThetaImports` production seam the
 * live host reaches, over an in-memory `FakeFileSystem`, mirroring
 * b0306's own driver.
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

describe("bug 0305 live: two aliases of one imported enum compare equal into a live prompt", () => {
  it("registers the importing app and drives it to the alias-equality sentinel", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the importing document must carry zero compose-tier
    // diagnostics through the SAME seam the live host reaches, so the live
    // sentinel below cannot be produced by an unrelated load failure.
    await expect(composeCodesOf(APP)).resolves.toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b0305livectl", text: WORKSPACE_CONTROL },
      { source: "project", stem: "b0305liveapp", text: APP },
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
        handle.command("b0305livectl"),
        "the precondition control did not register — a broken workspace, not the alias " +
          "fix, would explain the app's behaviour too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      expect(
        handle.command("b0305liveapp"),
        "the importing app did not register — the enum import failed to materialise. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0305liveapp");
      expect(
        driven.text,
        "bug-0305: the live reply did not contain " +
          WIRE_ALIAS_SENTINEL +
          " — the two aliases of one declaration compared `==` false (their tags diverged), " +
          "so `answer` was 111 and the sentinel never reached the prompt. " +
          "Reply: " + JSON.stringify(driven.text),
      ).toContain(WIRE_ALIAS_SENTINEL);
      expect(
        driven.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0305: the app's drive must end clean — a fail-closed theta-system-note here " +
          "means something broke despite a clean load. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
