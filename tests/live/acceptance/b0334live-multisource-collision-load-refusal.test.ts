// H9a live acceptance — bug 0334: a `.thetalib` hub whose `export … from`
// closure re-exports ONE name from TWO DIFFERENT declaring sources refuses
// END-TO-END through the real `pi -p` binary
// (docs/bugs/0334-reexport-closure-multi-source-name-collision-silent.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0334-reexport-multisource-collision.test.ts` pins the once-silent
// multi-source re-export collision at the `checkThetaImports` boundary over an
// in-memory `FileSystem` double. Neither runs the SHIPPED extension inside a
// real host. This file spawns the real `pi` binary in print mode over its own
// throwaway discovery root and observes the refusal through real extension
// auto-load, `--theta` discovery, the shipped composition root, and the
// interpreter — so the fix is proved to un-register the theta through the same
// registration channel the operator sees, and (via the DIAMOND CONTROL) that
// the fix rejects the multi-source collision specifically, not a diamond
// re-export shape a routine barrel-file pattern also produces.
//
// WHY THE FAULT IS A HUB'S RE-EXPORT CLOSURE, NOT THE OFFENDER'S OWN FILE.
// The offender's own file parses clean — its single `import` names a hub that
// exists and re-exports the imported name. The fault lives in the hub's own
// closure: two `export … from` edges both name `xf`, resolving to two
// DIFFERENT declaring sites (`b0334a.thetalib`'s `fn xf` vs `b0334b.thetalib`'s
// `fn xf`). Before this fix `fixReExportedNames` keyed the hub's resolved
// export set on name alone (`Map<string, Set<string>>`), so the second
// contributor was a silent no-op and `diagnoseReExports` had no arm for a name
// two sources provide — the fault is computed only by the load pass
// (`checkThetaImports` → the widened `diagnoseReExportCollisions`), never by
// `parseThetaDocument`. So the guard parses each source and runs the real
// `checkThetaImports` over an in-memory `fakeThetaLibFs` (the double from
// tests/reexport-chain-resolution.test.ts / b0333live's own guard), pinning the
// offender's load-pass codes to EXACTLY `[theta/parse/import-name-collision]`
// and both the control's and the diamond control's to `[]`.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout (the same constraint b0333live's sibling cell
// documents). So the diagnostic text is not an available black-box observable.
// invocation.md §Static resolution: a literal `invoke(...)` whose callee fails
// its own structural checks surfaces at runtime as `Err(InvokeInfraError)`; a
// `match` over that Result turns the refusal into a POSITIVE, deterministic
// sentinel on stdout — the assertion reds by printing the opposite sentinel,
// not by printing nothing.
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
// Token-bounded: three `pi -p` spawns, one pinned single-sentence turn each.
// The offender's own body carries no query, so the pre-fix direction — where
// it loads and `invoke` runs it — spends no extra model turn.
//
// FIX: 0.303.0.

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

/** The reused code the widened re-export closure check pushes for a multi-source collision. */
const CODE = "theta/parse/import-name-collision";

/**
 * The offending theta: its own file parses clean (it imports `xf` from the
 * hub, which exists and re-exports the name), but the hub's `export … from`
 * closure names `xf` from TWO different declaring sources — `b0334a.thetalib`
 * (`n + 1`) and `b0334b.thetalib` (`n + 100`). Its body carries NO query, so
 * the pre-fix direction — where it loads and `invoke` runs it — costs no
 * model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'import { xf } from "./b0334hub.thetalib"',
  '"B0334 OFFENDER BODY RAN"',
  "",
].join("\n");

/** The hub: re-exports `xf` from two DIFFERENT declaring sources — the collision. */
const OFFENDER_HUB = [
  'export { xf } from "./b0334a.thetalib"',
  'export { xf } from "./b0334b.thetalib"',
  "",
].join("\n");

/** The hub's first source: declares `xf` as `x + 1`. */
const OFFENDER_LIB_A = "fn xf(x: integer): integer { x + 1 }\n";

/** The hub's second source: declares a DIFFERENT `xf` as `x + 100`. */
const OFFENDER_LIB_B = "fn xf(x: integer): integer { x + 100 }\n";

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0334offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0334 OFFENDER LOADED",',
  '  Err(e) => "B0334 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The matched-pair control: a well-formed single-source hub re-export. It must
 * still register and drive, so the fix is proved to reject the multi-source
 * collision specifically and not a hub re-export shape generally. The query is
 * over a theta-computed number so a degraded plain-prompt run cannot fabricate
 * it.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  'import { xf } from "./b0334ok.thetalib"',
  "let n = xf(941)",
  "@`A probe computed a number: ${n}. What is that number plus 100? Answer with the number only.`",
  "",
].join("\n");

/** The control's lib: declares the ONE `xf` the control imports directly. */
const CONTROL_LIB_OK = "fn xf(x: integer): integer { x + 1 }\n";

/**
 * The DIAMOND CONTROL (REQUIRED): a hub re-exports `xf` from TWO mid libs,
 * each of which re-exports `xf` from the SAME base lib declaring the ONE
 * `fn xf`. Both chains resolve to base's single declaration — one declaration
 * reached by two paths, not two declarations under one name — so this MUST
 * register and drive. Without this cell the fix could be over-broad (rejecting
 * any name reached through more than one re-export edge) and the offline
 * witness's C4 alone would not prove otherwise inside a real host.
 */
const DIAMOND = [
  "---",
  "mode: prompt",
  "---",
  'import { xf } from "./b0334dhub.thetalib"',
  "let n = xf(200)",
  "@`A diamond probe computed a number: ${n}. What is that number plus 5? Answer with the number only.`",
  "",
].join("\n");

/** The diamond hub: re-exports `xf` from two mid libs. */
const DIAMOND_HUB = [
  'export { xf } from "./b0334midA.thetalib"',
  'export { xf } from "./b0334midB.thetalib"',
  "",
].join("\n");

/** Diamond mid A: re-exports `xf` from the shared base. */
const DIAMOND_MID_A = 'export { xf } from "./b0334base.thetalib"\n';

/** Diamond mid B: re-exports `xf` from the SAME shared base — the diamond. */
const DIAMOND_MID_B = 'export { xf } from "./b0334base.thetalib"\n';

/** Diamond base: the ONE declaration both mid libs' chains resolve to. */
const DIAMOND_BASE = "fn xf(x: integer): integer { x + 1 }\n";

const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "1042";
const DIAMOND_OK = "206";

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

describe("H9a live — bug 0334 multi-source re-export collision load refusal through the real `pi -p`", () => {
  it("refuses the theta whose hub re-export closure carries a multi-source collision, still registers and drives the well-formed control, and still registers and drives the diamond control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's
    // `diagnoseReExportCollisions`, the control is clean, and the diamond
    // control is clean, so neither live sentinel can be produced by an
    // unrelated load failure.
    expect(
      await importCheckCodes(OFFENDER, "/proj/b0334offender.theta", {
        "/proj/b0334hub.thetalib": OFFENDER_HUB,
        "/proj/b0334a.thetalib": OFFENDER_LIB_A,
        "/proj/b0334b.thetalib": OFFENDER_LIB_B,
      }),
      `attribution: the hub's re-export closure carries 'xf' from two DIFFERENT ` +
        `declaring sources, so the load pass must carry exactly ${CODE}`,
    ).toEqual([CODE]);
    expect(
      await importCheckCodes(CONTROL, "/proj/b0334control.theta", {
        "/proj/b0334ok.thetalib": CONTROL_LIB_OK,
      }),
      "attribution: the control imports the one 'xf' its lib declares directly, so its load pass is clean",
    ).toEqual([]);
    expect(
      await importCheckCodes(DIAMOND, "/proj/b0334diamond.theta", {
        "/proj/b0334dhub.thetalib": DIAMOND_HUB,
        "/proj/b0334midA.thetalib": DIAMOND_MID_A,
        "/proj/b0334midB.thetalib": DIAMOND_MID_B,
        "/proj/b0334base.thetalib": DIAMOND_BASE,
      }),
      "attribution: both diamond chains resolve to base's ONE `fn xf` — one declaration " +
        "reached by two paths, not a multi-source collision — so its load pass is clean",
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

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0334-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0334-cwd-"));
    const diamondCwd = mkdtempSync(join(tmpdir(), "theta-b0334-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0334-cwd-"));
    try {
      // All fixture files land in the temp discovery root together: the
      // offender, its hub, and its two colliding sources; the control and its
      // lib; the diamond and its hub/mids/base.
      writeFileSync(join(thetaDir, "b0334offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0334hub.thetalib"), OFFENDER_HUB, "utf8");
      writeFileSync(join(thetaDir, "b0334a.thetalib"), OFFENDER_LIB_A, "utf8");
      writeFileSync(join(thetaDir, "b0334b.thetalib"), OFFENDER_LIB_B, "utf8");
      writeFileSync(join(thetaDir, "b0334probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0334control.theta"), CONTROL, "utf8");
      writeFileSync(join(thetaDir, "b0334ok.thetalib"), CONTROL_LIB_OK, "utf8");
      writeFileSync(join(thetaDir, "b0334diamond.theta"), DIAMOND, "utf8");
      writeFileSync(join(thetaDir, "b0334dhub.thetalib"), DIAMOND_HUB, "utf8");
      writeFileSync(join(thetaDir, "b0334midA.thetalib"), DIAMOND_MID_A, "utf8");
      writeFileSync(join(thetaDir, "b0334midB.thetalib"), DIAMOND_MID_B, "utf8");
      writeFileSync(join(thetaDir, "b0334base.thetalib"), DIAMOND_BASE, "utf8");

      // ---- (1) the well-formed single-source control registers and drives a real turn ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0334control",
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
          `single-source hub re-export theta — without this the refusal assertion below ` +
          `could pass vacuously (wrong root, no registration at all). stdout: ${control.stdout} ` +
          `stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (2) the diamond control registers and drives a real turn ----
      const diamond = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0334diamond",
        cwd: diamondCwd,
      });
      expect(
        diamond.exitCode,
        `diamond: expected a no-error exit (0), got ${String(diamond.exitCode)}. ` +
          `stderr: ${diamond.stderr}`,
      ).toBe(0);
      expect(
        diamond.stdout,
        `diamond: one declaration reached by two re-export paths must register and DRIVE — ` +
          `proving the fix rejects the multi-source collision specifically, not any name reached ` +
          `through more than one re-export edge. stdout: ${diamond.stdout} stderr: ${diamond.stderr}`,
      ).toContain(DIAMOND_OK);

      // ---- (3) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0334probe",
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
          `invoke("./b0334offender.theta") resolves Err(InvokeInfraError) and the ` +
          `match prints "${REFUSED}". Printing "${LOADED}" means a hub's multi-source ` +
          `re-export collision loaded clean — bug 0334 unfixed. stdout: ${probe.stdout} ` +
          `stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
      rmSync(diamondCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
