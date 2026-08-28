// H9a live acceptance — bug 0335: a `.thetalib` whose OWN `import { X }`
// collides with its OWN top-level `fn X` refuses END-TO-END through the real
// `pi -p` binary
// (docs/bugs/0335-thetalib-own-import-shadows-own-declaration-undiagnosed.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0335-own-import-shadows-own-declaration.test.ts` pins the fix at the
// `checkThetaImports` boundary over an in-memory `FileSystem` double (R1–R4 +
// controls). Neither runs the SHIPPED extension inside a real host. This file
// spawns the real `pi` binary in print mode over its own throwaway discovery
// root and observes the refusal through real extension auto-load, `--theta`
// discovery, the shipped composition root, and the interpreter — so the fix is
// proved to un-register the IMPORTING theta through the same registration
// channel the operator sees.
//
// WHY THE FAULT IS THE LIBRARY'S OWN SPECIFIERS, NOT THE OFFENDER'S OWN FILE.
// The offender theta's own file parses clean — its single `import` names a
// dependency library that exists and exports the imported name. The fault
// lives inside that library's own file: `b0335liba.thetalib` both
// `import { helper } from "./b0335libb.thetalib"` AND declares its own
// `fn helper`. Before this fix `checkThetaImports` ran the collision arm
// (`checkImportNameCollisions`, src/parser/imports.ts) only over the COMPOSING
// theta's own specifiers, never over a resolved dependency `.thetalib`'s own
// specifiers against its own top-level names — so the collision loaded clean.
// The fault is computed only by the load pass, never by `parseThetaDocument`.
// So the guard parses the offender and runs the real `checkThetaImports` over
// an in-memory `fakeThetaLibFs` (the double from
// tests/b0335-own-import-shadows-own-declaration.test.ts / b0334live's own
// guard), pinning the offender's load-pass codes to EXACTLY
// `[theta/parse/import-name-collision]`, sited on `b0335liba.thetalib`, and
// the control's to `[]`.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout (the same constraint b0333live's / b0334live's sibling
// cells document). So the diagnostic text is not an available black-box
// observable. invocation.md §Static resolution: a literal `invoke(...)` whose
// callee fails its own structural checks surfaces at runtime as
// `Err(InvokeInfraError)`; a `match` over that Result turns the refusal into a
// POSITIVE, deterministic sentinel on stdout — the assertion reds by printing
// the opposite sentinel, not by printing nothing.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, plus each run's exit code. Neither assertion can
// pass on a promise merely resolving: the offending theta's disposition
// decides WHICH of two sentinels the prober's single turn prints. The drive
// discriminators are ANSWERS to task questions over theta-computed text
// (extract-the-last-word / number-plus-100), never a verbatim-echo demand
// (which current models read as prompt injection — AGENTS.md).
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// NOT required here. All thetas are `mode: prompt`, and a prompt → prompt
// `invoke` suspends the parent and attaches the callee to the caller's existing
// session (invocation.md §Cross-mode semantics) — no RFC-0006 child process is
// launched. The pins are supplied anyway by the shared harness (`spawnPiPrint`
// sets `PI_THETA_SUBAGENT_EXTENSION_PIN` and the outer process carries
// `-ne -e <this tree's extensions>`), so the file is correct either way.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the nine committed
// fixtures under `./fixtures`, and uses its own temp discovery root. It does
// not call `assertStderrClean` (bug 0030's empty-capture gate is scoped to the
// ten committed nine-area spawns and their recorded baseline; extending it to
// an unbaselined surface would change its scope with no recorded measurement)
// and it does not call `assertCodesSubsetOfPermitted`, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json` — the captures carry no
// `theta/{load,parse,runtime}/*` code at all.
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each. The
// offender's own body carries no query, so the pre-fix direction — where it
// loads and `invoke` runs it — spends no extra model turn.
//
// FIX: bug 0335 (reuses `theta/parse/import-name-collision`, no new registry row).

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { checkThetaImports } from "../../../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../../src/parser/frontmatter";
import type { FileSystem } from "../../../src/seams/file-system";
import { parseDeps, parseDoc } from "../../helpers/e2e-s1";

/** The reused code the widened dependency-`.thetalib` collision arm draws. */
const CODE = "theta/parse/import-name-collision";

/**
 * The offending theta: its own file parses clean (it imports `probe` from
 * libA, which exists and exports the name), but libA's OWN specifiers collide
 * with libA's OWN top-level declaration — the fault lives one file down. Its
 * body carries NO query, so the pre-fix direction — where it loads and
 * `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'import { probe } from "./b0335liba.thetalib"',
  '"B0335 OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * THE COLLISION: libA both imports `helper` from libB AND declares its own
 * `fn helper` — bug 0335 R1 (colliding fn), byte-identical shape to the fix's
 * own offline witness (tests/b0335-own-import-shadows-own-declaration.test.ts).
 */
const OFFENDER_LIB_A = [
  'import { helper } from "./b0335libb.thetalib"',
  "fn helper(x: integer): integer { x + 222 }",
  "fn probe(x: integer): integer { helper(x) }",
  "",
].join("\n");

/** libA's own import target: a distinct, uncollided `helper`. */
const OFFENDER_LIB_B = "fn helper(x: integer): integer { x + 111 }\n";

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0335offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0335 OFFENDER LOADED",',
  '  Err(e) => "B0335 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The control: a CLEAN import (no collision) that registers and drives
 * arithmetic, proving the fix rejects the own-import-vs-own-declaration
 * collision specifically and not the mere presence of a dependency library.
 * The query is over a theta-computed number so a degraded plain-prompt run
 * cannot fabricate it.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  'import { greet } from "./b0335ok.thetalib"',
  "let n = greet(941)",
  "@`A probe computed a number: ${n}. What is that number plus 100? Answer with the number only.`",
  "",
].join("\n");

/** The control's lib: no import, no collision — the ONE `greet` the control calls. */
const CONTROL_LIB_OK = "fn greet(x: integer): integer { x + 1 }\n";

const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "1042";

/** The in-memory `.thetalib` filesystem double from tests/reexport-chain-resolution.test.ts. */
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
    homedir: (): string => "/home",
    cwd: (): string => "/proj",
    configDirName: (): string => ".pi",
    globalAgentDir: (): string => "/home/.pi/agent",
    lstat: reject,
    realpath: reject,
    readdir: (path: string): Promise<readonly string[]> => {
      const entries = dirs.get(path);
      return entries === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(entries);
    },
    readBytes: (path: string): Promise<Uint8Array> => {
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

/**
 * The load-pass diagnostic codes for one theta over an in-memory lib set — the
 * cross-file attribution channel `parseThetaDocument` alone cannot reach.
 */
async function importCheckCodes(
  thetaText: string,
  thetaPath: string,
  libs: Record<string, string>,
): Promise<readonly string[]> {
  const app = parseDoc(thetaText, thetaPath);
  expect(
    app.frontmatter,
    `attribution: ${thetaPath} frontmatter must parse or the load pass reads nothing`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: thetaPath,
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return check.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0335 dependency-.thetalib own-import-vs-own-declaration collision load refusal through the real `pi -p`", () => {
  it("refuses the theta whose dependency library carries its own import-vs-declaration collision, and still registers and drives the well-formed control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender's un-registration is attributable to EXACTLY
    // this fix's widened dependency-`.thetalib` collision arm — sited on
    // libA's own specifiers, not on the offender's own file — and the control
    // is clean, so neither live sentinel below can be produced by an
    // unrelated load failure.
    expect(
      await importCheckCodes(OFFENDER, "/proj/b0335offender.theta", {
        "/proj/b0335liba.thetalib": OFFENDER_LIB_A,
        "/proj/b0335libb.thetalib": OFFENDER_LIB_B,
      }),
      `attribution: libA's own specifiers carry an import { helper } colliding with libA's own ` +
        `fn helper (imports.md:124, "no implicit shadowing" — not restricted to .theta files), ` +
        `so the load pass must carry exactly ${CODE}`,
    ).toEqual([CODE]);
    expect(
      await importCheckCodes(CONTROL, "/proj/b0335control.theta", {
        "/proj/b0335ok.thetalib": CONTROL_LIB_OK,
      }),
      "attribution: the control's lib carries no import at all, so there is no own-import-vs-own-declaration collision and its load pass is clean",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0335-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0335-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0335-cwd-"));
    try {
      // All fixture files land in the temp discovery root together: the
      // offender and its two-library chain; the control and its clean lib.
      writeFileSync(join(thetaDir, "b0335offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0335liba.thetalib"), OFFENDER_LIB_A, "utf8");
      writeFileSync(join(thetaDir, "b0335libb.thetalib"), OFFENDER_LIB_B, "utf8");
      writeFileSync(join(thetaDir, "b0335probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0335control.theta"), CONTROL, "utf8");
      writeFileSync(join(thetaDir, "b0335ok.thetalib"), CONTROL_LIB_OK, "utf8");

      // ---- (1) the well-formed control registers and drives a real turn ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0335control",
        cwd: controlCwd,
      });
      expect(
        control.exitCode,
        `control: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
          `stderr: ${control.stderr}`,
      ).toBe(0);
      expect(
        control.stdout,
        `control: the temp discovery root must register and DRIVE the well-formed ` +
          `clean-import theta — without this the refusal assertion below could pass ` +
          `vacuously (wrong root, no registration at all). stdout: ${control.stdout} ` +
          `stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0335probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's ` +
          `invoke("./b0335offender.theta") resolves Err(InvokeInfraError) and the ` +
          `match prints "${REFUSED}". Printing "${LOADED}" means a dependency library's ` +
          `own import-vs-own-declaration collision loaded clean — bug 0335 unfixed. ` +
          `stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
