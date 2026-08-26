// H9a live acceptance — bug 0304: a theta importing a lib with a BROKEN
// TRANSITIVE import refuses END-TO-END through the real `pi -p` binary
// (docs/bugs/0304-transitive-lib-diagnostics-discarded.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0304-transitive-lib-diagnostics.test.ts` pins the discarded batch at
// the `checkThetaImports` boundary over an in-memory `FileSystem` double.
// Neither runs the SHIPPED extension inside a real host. This file spawns the
// real `pi` binary in print mode over its own throwaway discovery root and
// observes the refusal through real extension auto-load, `--theta` discovery,
// the shipped composition root, and the interpreter — so the fix is proved to
// un-register the theta through the same registration channel the operator sees.
//
// WHY THE FAULT IS CROSS-FILE, AND WHY THE ATTRIBUTION GUARD USES
// `checkThetaImports` (NOT `parseThetaDocument`).
// The offender's OWN file parses clean — its single `import` names a lib that
// exists and declares the symbol. The fault lives one hop down, in that lib's
// unresolvable transitive `import`, and is computed only by the load pass
// (`checkThetaImports` → `walkThetaLib`), never by `parseThetaDocument`. So the
// guard parses each source and runs the real `checkThetaImports` over an
// in-memory `fakeThetaLibFs` (the double from
// tests/reexport-chain-resolution.test.ts), pinning the offender's load-pass
// codes to EXACTLY `[theta/load/unresolvable-thetalib-path]` and the control's
// to `[]`. RED at HEAD: the pass discards the transitive IMP-1 and the offender
// guard reads `[]` — the same drop the offline witness's C1 cell measures.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout (the same constraint the ctor cell
// `ctor-unresolved-load-refusal.test.ts` documents). So the diagnostic text is
// not an available black-box observable. invocation.md §Static resolution: a
// literal `invoke(...)` whose callee fails its own structural checks surfaces at
// runtime as `Err(InvokeInfraError)`; a `match` over that Result turns the
// refusal into a POSITIVE, deterministic sentinel on stdout — the assertion reds
// by printing the opposite sentinel, not by printing nothing.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, plus each run's exit code. Neither assertion can
// pass on a promise merely resolving: the offending theta's disposition decides
// WHICH of two sentinels the prober's single turn prints.
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
// ten committed nine-area spawns and their recorded baseline `dd4f3d3b`;
// extending it to an unbaselined surface would change its scope with no recorded
// measurement) and it does not call `assertCodesSubsetOfPermitted`, so it needs
// NO entry in `tests/fixtures/h7a/permitted-codes.json` — the captures carry no
// `theta/{load,parse,runtime}/*` code at all.
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each. The
// offender's own body carries no query, so the pre-fix direction — where it
// loads and `invoke` runs it — spends no extra model turn.

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

/** The registry code the fix pushes for a transitive unresolvable import path. */
const CODE = "theta/load/unresolvable-thetalib-path";

/**
 * The offending theta: its own file parses clean (it imports a lib that exists
 * and declares `af`), but that lib's transitive `import` names a file that does
 * not exist. Its body carries NO query, so the pre-fix direction — where it
 * loads and `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'import { af } from "./b0304a.thetalib"',
  '"B0304 OFFENDER BODY RAN"',
  "",
].join("\n");

/** The offender's lib: well-formed except for one unresolvable transitive `import`. */
const OFFENDER_LIB = [
  'import { bf } from "./b0304missing.thetalib"',
  "fn af(x: integer): integer { x }",
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0304offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0304 OFFENDER LOADED",',
  '  Err(e) => "B0304 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The matched-pair control: the SAME two-hop import shape as the offender with
 * the only variable flipped — every transitive edge resolves and the deepest
 * lib declares the imported symbol. It must still register and drive, so the fix
 * is proved to reject the BROKEN transitive edge specifically and not a
 * two-hop import chain generally, and its sentinel is the guard that the temp
 * discovery root was found at all (without it the prober's assertion could pass
 * for an unrelated reason). The query is over a theta-computed number so a
 * degraded plain-prompt run cannot fabricate it.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  'import { af } from "./b0304ok.thetalib"',
  "let n = af(941)",
  "@`A probe computed a number: ${n}. What is that number plus 100? Answer with the number only.`",
  "",
].join("\n");

/** The control's lib: a well-formed transitive import of a lib that declares `bf`. */
const CONTROL_LIB = [
  'import { bf } from "./b0304base.thetalib"',
  "fn af(x: integer): integer { x }",
  "",
].join("\n");

/** The deepest control lib: declares the transitively-imported symbol. */
const CONTROL_BASE = "fn bf(x: integer): integer { x }\n";

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text (extract-the-last-word / number-plus-100): deterministic
// content a degraded plain-prompt run cannot produce. A verbatim-echo demand
// ("reply with exactly this") reads as prompt injection to current models
// and draws refusals -- the documented sentinel-refusal class (AGENTS.md).
const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "1041";

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

describe("H9a live — bug 0304 transitive-lib load refusal through the real `pi -p`", () => {
  it("refuses the theta whose transitive lib import is unresolvable, and still registers and drives the well-formed control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // transitive IMP-1 and the control is clean, so neither live sentinel can be
    // produced by an unrelated load failure. RED at HEAD — the pass discards the
    // transitive fault and the offender reads `[]` (offline witness cell C1).
    expect(
      await importCheckCodes(OFFENDER, "/proj/b0304offender.theta", {
        "/proj/b0304a.thetalib": OFFENDER_LIB,
      }),
      `attribution: the offender's transitive lib import is unresolvable, so the ` +
        `load pass must carry exactly the widened ${CODE}`,
    ).toEqual([CODE]);
    expect(
      await importCheckCodes(CONTROL, "/proj/b0304control.theta", {
        "/proj/b0304ok.thetalib": CONTROL_LIB,
        "/proj/b0304base.thetalib": CONTROL_BASE,
      }),
      "attribution: the control's every transitive edge resolves and the deepest " +
        "lib declares the imported symbol, so its load pass is clean",
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

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0304-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0304-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0304-cwd-"));
    try {
      // All fixture files land in the temp discovery root together: the offender
      // and its lib; the control and its two libs. `b0304missing.thetalib` is
      // deliberately ABSENT — that absence is the offender's fault.
      writeFileSync(join(thetaDir, "b0304offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0304a.thetalib"), OFFENDER_LIB, "utf8");
      writeFileSync(join(thetaDir, "b0304probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0304control.theta"), CONTROL, "utf8");
      writeFileSync(join(thetaDir, "b0304ok.thetalib"), CONTROL_LIB, "utf8");
      writeFileSync(join(thetaDir, "b0304base.thetalib"), CONTROL_BASE, "utf8");

      // ---- (1) the well-formed control registers and drives a real turn ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0304control",
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
          `two-hop import theta — without this the refusal assertion below could pass ` +
          `vacuously (wrong root, no registration at all). stdout: ${control.stdout} ` +
          `stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0304probe",
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
          `invoke("./b0304offender.theta") resolves Err(InvokeInfraError) and the ` +
          `match prints "${REFUSED}". Printing "${LOADED}" means a broken transitive ` +
          `lib import loaded clean — bug 0304 unfixed. stdout: ${probe.stdout} ` +
          `stderr: ${probe.stderr}`,
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
