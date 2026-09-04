// H9a live acceptance — bug 0428: a theta importing a `.thetalib` that RESOLVES
// (its byte-exact name is listed by `readdir`) but whose bytes cannot be read —
// here a DIRECTORY named `*.thetalib`, the cross-platform real-FS shape of
// IMP-1's "exists but is not readable" clause — refuses END-TO-END through the
// real `pi -p` binary
// (docs/bugs/0428-listed-but-unreadable-thetalib-silently-accepted.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0428-unreadable-thetalib-refused.test.ts` pins the once-silent
// read-failure refusal at the `checkThetaImports` boundary over an in-memory
// `FileSystem` double (C1 EACCES, C3 transitive, C5 re-export). None runs the
// SHIPPED extension inside a real host over a real filesystem. This file spawns
// the real `pi` binary in print mode over its own throwaway discovery root, with
// a genuine on-disk DIRECTORY named `b0428unreadable.thetalib`, and observes the
// refusal through real extension auto-load, `--theta` discovery, the shipped
// composition root, the production `PiFileSystem` (whose `readBytes` on a
// directory rejects `EISDIR`), and the interpreter — so the read-failure arm is
// proved to un-register the theta through the same registration channel the
// operator sees, on a real host seam the in-memory double only simulates.
//
// WHY THE FAULT IS A RESOLVED-BUT-UNREADABLE ENTRY, AND WHY THE ATTRIBUTION
// GUARD USES `checkThetaImports` (NOT `parseThetaDocument`).
// The offender's OWN file parses clean — its single `import` names a `.thetalib`
// whose byte-exact name IS present in the parent directory listing, so the
// resolver resolves it. The fault is that the resolved path cannot be READ as a
// file (it is a directory). Before this fix the read rejection settled to
// `undefined` and every consumer skipped it silently: no diagnostic, nothing
// materialised, the theta registered with an empty import list. The fault is
// computed only by the load pass (`checkThetaImports` → the read-failure arm),
// never by `parseThetaDocument`. So the guard parses the source and runs the real
// `checkThetaImports` over an in-memory `fakeThetaLibFs` whose parent lists the
// lib name while its `readBytes` rejects (the "listed-but-unreadable" double from
// the offline witness), pinning the offender's load-pass codes to EXACTLY
// `[theta/load/unresolvable-thetalib-path]` and the control's to `[]`. RED at the
// fork b2cb3b15 / v0.415.0: the pre-fix pass discards the read failure and the
// offender guard reads `[]` — the same drop the offline witness's C1 cell
// measures. The fix ships at 0.421.0.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout (the same constraint the sibling cells
// `ctor-unresolved-load-refusal.test.ts` and
// `b0333live-transitive-reexport-load-refusal.test.ts` document). So the
// diagnostic text is not an available black-box observable. invocation.md
// §Static resolution: a literal `invoke(...)` whose callee fails its own
// structural checks surfaces at runtime as `Err(InvokeInfraError)`; a `match`
// over that Result turns the refusal into a POSITIVE, deterministic sentinel on
// stdout — the assertion reds by printing the opposite sentinel, not nothing.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, plus each run's exit code. Neither assertion can
// pass on a promise merely resolving: the offending theta's disposition decides
// WHICH of two sentinels the prober's single turn prints. The drive
// discriminators are ANSWERS to task questions over theta-computed text
// (extract-the-last-word / number-plus-100), never a verbatim-echo demand
// (which current models read as prompt injection — AGENTS.md §"Assert on real
// observables", bug 0243).
//
// SUBAGENT CHILD PINS: NOT required here (all thetas `mode: prompt`; a
// prompt → prompt `invoke` suspends the parent and attaches the callee to the
// caller's session — no RFC-0006 child process). Supplied anyway by the shared
// harness, so the file is correct either way.
//
// SCOPE ISOLATION (bug 0030). Deliberately OUTSIDE the nine-area H9a manifest:
// adds no `FeatureArea`, touches none of the committed fixtures, uses its own
// temp discovery root, and calls neither `assertStderrClean` nor
// `assertCodesSubsetOfPermitted` — the captures carry no `theta/{load,parse,
// runtime}/*` code on stdout at all, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json`.
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each. The
// offender's own body carries no query, so no direction spends an extra turn on
// it.

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { checkThetaImports } from "../../../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../../src/parser/frontmatter";
import type { FileSystem } from "../../../src/seams/file-system";
import { parseDeps, parseDoc } from "../../helpers/e2e-s1";

/** The registry code the read-failure arm pushes for a resolved-but-unreadable lib. */
const CODE = "theta/load/unresolvable-thetalib-path";

/**
 * The offending theta: its own file parses clean (it imports
 * `b0428unreadable.thetalib`, whose byte-exact name IS present in the discovery
 * root), but that name is a DIRECTORY — the resolved path cannot be read as a
 * file. Its body carries NO query, so the pre-fix direction (where it loads and
 * `invoke` runs it) costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'import { af } from "./b0428unreadable.thetalib"',
  '"B0428 OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s Result.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0428offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0428 OFFENDER LOADED",',
  '  Err(e) => "B0428 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The matched-pair control: the SAME import shape as the offender, with the only
 * variable flipped — the imported `.thetalib` is a readable FILE declaring the
 * symbol. It must register and drive, so the fix is proved to reject the
 * UNREADABLE entry specifically and not a well-formed import, and its sentinel
 * guards that the temp discovery root was found at all. The query is over a
 * theta-computed number so a degraded plain-prompt run cannot fabricate it.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  'import { af } from "./b0428ok.thetalib"',
  "let n = af(941)",
  "@`A probe computed a number: ${n}. What is that number plus 100? Answer with the number only.`",
  "",
].join("\n");

/** The control's lib: a readable file declaring the imported `fn`. */
const CONTROL_LIB_OK = "fn af(x: integer): integer { x }\n";

const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "1041";

/**
 * The in-memory `.thetalib` filesystem double from the offline witness: a path in
 * `unreadable` is LISTED by `readdir` on its parent (so IMP-1 resolution
 * succeeds — the byte-exact entry is present) while `readBytes` on it REJECTS
 * with an EACCES-shaped error — the exact "listed-but-unreadable" state, the
 * in-memory analogue of the on-disk directory the live spawn uses.
 */
function fakeThetaLibFs(
  files: Record<string, string>,
  unreadable: readonly string[] = [],
): FileSystem {
  const dirs = new Map<string, string[]>();
  const list = (path: string): void => {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  };
  for (const path of Object.keys(files)) list(path);
  for (const path of unreadable) list(path);
  const unreadableSet = new Set(unreadable);
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
      if (unreadableSet.has(path)) {
        return Promise.reject(
          Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
            code: "EACCES",
          }),
        );
      }
      const content = files[path];
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(new TextEncoder().encode(content));
    },
  } as FileSystem;
}

/**
 * The load-pass error codes for one theta over an in-memory lib set — the
 * cross-file attribution channel `parseThetaDocument` alone cannot reach.
 */
async function importCheckCodes(
  thetaText: string,
  thetaPath: string,
  files: Record<string, string>,
  unreadable: readonly string[] = [],
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
    fs: fakeThetaLibFs(files, unreadable),
    parseDeps: parseDeps(),
  });
  return check.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0428 resolved-but-unreadable .thetalib load refusal through the real `pi -p`", () => {
  it("refuses the theta importing a directory-named .thetalib, and still registers and drives the well-formed control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's read-failure
    // IMP-1 and the control is clean, so neither live sentinel can be produced by
    // an unrelated load failure. RED at the fork — the pre-fix pass discards the
    // read failure and the offender reads `[]` (offline witness cell C1).
    expect(
      await importCheckCodes(
        OFFENDER,
        "/proj/b0428offender.theta",
        {},
        ["/proj/b0428unreadable.thetalib"],
      ),
      `attribution: the offender imports a resolved-but-unreadable lib, so the ` +
        `load pass must carry exactly the read-failure ${CODE}`,
    ).toEqual([CODE]);
    expect(
      await importCheckCodes(CONTROL, "/proj/b0428control.theta", {
        "/proj/b0428ok.thetalib": CONTROL_LIB_OK,
      }),
      "attribution: the control imports a readable lib declaring the symbol, so " +
        "its load pass is clean",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0428-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0428-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0428-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0428offender.theta"), OFFENDER, "utf8");
      // The fault: a DIRECTORY whose byte-exact name is the imported `.thetalib`.
      // `readdir` lists it (so the resolver resolves it), but the production
      // `PiFileSystem.readBytes` rejects with `EISDIR` — the real-host shape of
      // IMP-1's "exists but is not readable" clause.
      mkdirSync(join(thetaDir, "b0428unreadable.thetalib"));
      writeFileSync(join(thetaDir, "b0428probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0428control.theta"), CONTROL, "utf8");
      writeFileSync(join(thetaDir, "b0428ok.thetalib"), CONTROL_LIB_OK, "utf8");

      // ---- (1) the well-formed control registers and drives a real turn ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0428control",
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
          `import theta — without this the refusal assertion below could pass ` +
          `vacuously (wrong root, no registration at all). stdout: ${control.stdout} ` +
          `stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0428probe",
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
          `invoke("./b0428offender.theta") resolves Err(InvokeInfraError) and the ` +
          `match prints "${REFUSED}". Printing "${LOADED}" means a resolved-but-` +
          `unreadable .thetalib loaded clean — bug 0428 unfixed. stdout: ${probe.stdout} ` +
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
