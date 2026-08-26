// H9a live acceptance — bug 0302: the IMP-5 cycle graph keys nodes by
// `.thetalib` basename STEM, not resolved path, so two files named
// `b0302util.thetalib` in different directories collapse to one graph node
// (docs/bugs/0302-stem-keyed-cycle-graph.md). This file proves BOTH directions
// end-to-end through the real `pi -p` binary.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0302-stem-keyed-cycle-graph.test.ts` pins the rendered cycle
// diagnostics at the `checkThetaImports` boundary over an in-memory
// `FileSystem` double. Neither runs the SHIPPED extension inside a real host.
// This file spawns the real `pi` binary in print mode over its own throwaway
// discovery root and observes each verdict through real extension auto-load,
// `--theta` discovery, the shipped composition root, and the interpreter — so
// the fix is proved to register (or un-register) the theta through the same
// registration channel the operator sees.
//
// THE TWO DIRECTIONS (each RED before the fix, GREEN after), OBSERVED BY TWO
// DIFFERENT MECHANISMS — matching the proven-good shape of
// b0304live-transitive-load-refusal.test.ts:
//   (a) ACYCLIC stem twin — `b0302util.thetalib` exists in two directories with
//       one edge between them; no cycle. imports.md §Cycles counts cycles
//       between FILES, so this program is legal and must REGISTER and DRIVE.
//       This direction is proved by a DIRECT slash drive of the acyclic target
//       ITSELF: the target is a self-driving query theta that computes a number
//       through its imported `fn` and asks a task question over it. PRE-FIX the
//       stem-keyed graph draws a false import-cycle self-loop on the twin edge,
//       the target never registers, and the direct drive prints no answer.
//   (b) CYCLIC stem twin — `x → a/b0302util → x` is a genuine cycle, and `x`
//       ALSO imports a stem-twin `b/b0302util`. imports.md §Cycles mandates the
//       `E`-severity refusal regardless of what else `x` imports. This direction
//       is proved through an `invoke`-Err PROBER: the cyclic target is a bare
//       string body that must NEVER register, so its body never runs; a separate
//       prober `invoke`s it and turns the refusal into a positive sentinel.
//       PRE-FIX the twin's edge list OVERWRITES the real back-edge, the cycle is
//       masked, the target loads, and the prober's `match` prints the LOADED arm.
//
// WHY THE LOADED DIRECTION USES A DIRECT DRIVE, NOT AN `invoke`-Ok PROBER.
// The refused direction observes registration through `invoke` because a refused
// callee's load diagnostics route to the `theta-system-note` channel, which is
// NOT streamed to `pi -p` print-mode text stdout, so the refusal is not a direct
// black-box observable. The loaded direction cannot use the mirror trick — an
// `invoke`-Ok prober — because a prompt → prompt `invoke` of a LOADED callee
// does not hand a clean `Ok` back to the caller's `match` the way an Ok-arm
// assertion would assume: invocation.md §Cross-mode semantics — a prompt-mode
// child attaches to the caller's current conversation and `invoke(...)` suspends
// the parent's body at the call site until the child returns, so the callee's
// queries become user-visible turns in the caller's own session rather than a
// clean value the caller's `match` can discriminate on stdout. A LOADED target
// is therefore proved by driving the target directly and reading the answer to
// its own task question; only the REFUSED target — whose body never runs — is
// discriminated through the `invoke`-Err `match`.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): a number on `pi -p`
// stdout that is the answer to a task question over a THETA-COMPUTED value. For
// (a) it is the acyclic target's own `f(941) + 100`; for (b) it is the last word
// of the verdict the prober's `invoke`-disposition `match` selected. Neither
// assertion can pass on a promise merely resolving: the target's registration
// disposition decides whether the answer appears at all (a) or which of two
// verdict words the prober's single turn is asked about (b). The discriminators
// are task-framed (number-plus-100; extract-the-last-word), NEVER a verbatim-echo
// demand — current models read "reply with exactly …" as prompt injection and
// refuse it (the documented sentinel-refusal class, AGENTS.md).
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
// `theta/{load,parse,runtime}/*` code observable at all.
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each. The
// cyclic target's body carries no query, so the direction where it (pre-fix)
// loads spends no extra model turn.

import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { checkThetaImports } from "../../../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../../src/parser/frontmatter";
import type { FileSystem } from "../../../src/seams/file-system";
import { parseDeps, parseDoc } from "../../helpers/e2e-s1";

/** The registry code the fix keeps for a genuine cycle and withholds for the acyclic twin. */
const CYCLE_CODE = "theta/load/import-cycle";

/**
 * The ACYCLIC stem-twin target: it imports `b0302util.thetalib`, which imports a
 * DIFFERENT `b0302util.thetalib` one directory down. Two files, one edge, no
 * cycle. It is self-driving — it computes `f(941)` through the imported `fn` and
 * asks a task question over it — so a direct slash drive of the target proves it
 * REGISTERS and DRIVES. Pre-fix the false import-cycle self-loop un-registers
 * it, so the direct drive prints no answer.
 */
const ACYCLIC_TARGET = [
  "---",
  "mode: prompt",
  "---",
  'import { f } from "./b0302util.thetalib"',
  "let n = f(941)",
  "@`A cycle-graph probe computed a number: ${n}. What is that number plus 100? Answer with the number only.`",
  "",
].join("\n");

/** The acyclic target's first lib: imports the same-stem lib one directory down. */
const ACYCLIC_UTIL = [
  'import { g } from "./sub/b0302util.thetalib"',
  "fn f(x: integer): integer { x }",
  "",
].join("\n");

/** The acyclic target's deepest lib — the stem twin of `ACYCLIC_UTIL`. */
const ACYCLIC_SUB_UTIL = "fn g(x: integer): integer { x }\n";

/**
 * The CYCLIC stem-twin target: `x → a/b0302util → x` is a genuine cycle, and `x`
 * ALSO imports the stem-twin `b/b0302util`, whose edge list overwrites the real
 * back-edge pre-fix and masks the cycle. Its body is a bare string with NO query
 * — post-fix it must never register so the body never runs, and keeping it
 * query-free means the pre-fix direction (where it wrongly loads) spends no model
 * turn.
 */
const CYCLIC_TARGET = [
  "---",
  "mode: prompt",
  "---",
  'import { xf } from "./b0302x.thetalib"',
  '"b0302 cyclic target body"',
  "",
].join("\n");

/** `x` imports two same-stem libs; the `a` one closes a real cycle, the `b` one is the masking twin. */
const CYCLIC_X = [
  'import { af } from "./a/b0302util.thetalib"',
  'import { bf } from "./b/b0302util.thetalib"',
  "fn xf(k: integer): integer { k }",
  "",
].join("\n");

/** `a/b0302util` imports back up to `x` — the real back-edge the twin overwrite deletes pre-fix. */
const CYCLIC_A_UTIL = [
  'import { xf } from "../b0302x.thetalib"',
  "fn af(k: integer): integer { k }",
  "",
].join("\n");

/** `b/b0302util` — the stem twin with no back-edge; its empty edge list masks the cycle pre-fix. */
const CYCLIC_B_UTIL = "fn bf(k: integer): integer { k }\n";

/**
 * The cyclic-direction prober: it invokes the cyclic target and converts the
 * target's registration disposition into one of two committed verdicts through a
 * `match` over the untyped `invoke`'s `Result`. The drive question extracts the
 * last word of the verdict, so a degraded plain-prompt run cannot fabricate the
 * answer and the surviving word proves which arm fired.
 */
const CYCLIC_PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0302cyclic.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0302 CYCLIC LOADED",',
  '  Err(e) => "B0302 CYCLIC REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over theta-computed text
// (number-plus-100 for the loaded target; extract-the-last-word for the refused
// verdict): deterministic content a degraded plain-prompt run cannot produce. A
// verbatim-echo demand ("reply with exactly this") reads as prompt injection to
// current models and draws refusals — the documented sentinel-refusal class
// (AGENTS.md).
const ACYCLIC_OK = "1041"; // f(941) + 100 — the acyclic target LOADED and DROVE.
const REFUSED = "REFUSED"; // Err arm — the cyclic target was REFUSED.
const LOADED = "LOADED"; // Ok arm — the cyclic target wrongly loaded (bug unfixed).

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
 * cross-file cycle verdict `parseThetaDocument` alone cannot reach.
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

describe("H9a live — bug 0302 stem-twin cycle graph through the real `pi -p`", () => {
  it("drives the acyclic same-stem program and refuses the cyclic same-stem program", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the acyclic program is legal and the cyclic one carries a
    // genuine cycle, so neither live observable can be produced by an unrelated
    // load disposition. RED at HEAD — the stem-keyed graph draws a false
    // import-cycle on the acyclic program and masks the real one on the cyclic
    // program (offline witness cells FALSE-POS / FALSE-NEG).
    expect(
      await importCheckCodes(ACYCLIC_TARGET, "/proj/b0302acyclic.theta", {
        "/proj/b0302util.thetalib": ACYCLIC_UTIL,
        "/proj/sub/b0302util.thetalib": ACYCLIC_SUB_UTIL,
      }),
      "attribution: two same-stem files in different directories with one edge " +
        "between them are acyclic, so the load pass must report nothing",
    ).toEqual([]);
    expect(
      await importCheckCodes(CYCLIC_TARGET, "/proj/b0302cyclic.theta", {
        "/proj/b0302x.thetalib": CYCLIC_X,
        "/proj/a/b0302util.thetalib": CYCLIC_A_UTIL,
        "/proj/b/b0302util.thetalib": CYCLIC_B_UTIL,
      }),
      `attribution: \`x → a/b0302util → x\` is a genuine cycle the stem-twin ` +
        `\`b/b0302util\` masks, so the load pass must carry ${CYCLE_CODE}`,
    ).toContain(CYCLE_CODE);

    // Live-host precondition — fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0302-root-"));
    const acyclicCwd = mkdtempSync(join(tmpdir(), "theta-b0302-cwd-"));
    const cyclicCwd = mkdtempSync(join(tmpdir(), "theta-b0302-cwd-"));
    try {
      // The acyclic target and its two same-stem libs (one a directory down).
      mkdirSync(join(thetaDir, "sub"), { recursive: true });
      writeFileSync(join(thetaDir, "b0302acyclic.theta"), ACYCLIC_TARGET, "utf8");
      writeFileSync(join(thetaDir, "b0302util.thetalib"), ACYCLIC_UTIL, "utf8");
      writeFileSync(join(thetaDir, "sub", "b0302util.thetalib"), ACYCLIC_SUB_UTIL, "utf8");

      // The cyclic target, `x`, its two same-stem libs (one closing the cycle,
      // one the masking twin), and the prober that invokes it.
      mkdirSync(join(thetaDir, "a"), { recursive: true });
      mkdirSync(join(thetaDir, "b"), { recursive: true });
      writeFileSync(join(thetaDir, "b0302cyclic.theta"), CYCLIC_TARGET, "utf8");
      writeFileSync(join(thetaDir, "b0302x.thetalib"), CYCLIC_X, "utf8");
      writeFileSync(join(thetaDir, "a", "b0302util.thetalib"), CYCLIC_A_UTIL, "utf8");
      writeFileSync(join(thetaDir, "b", "b0302util.thetalib"), CYCLIC_B_UTIL, "utf8");
      writeFileSync(join(thetaDir, "b0302cyclicprobe.theta"), CYCLIC_PROBE, "utf8");

      // ---- (a) the acyclic same-stem program REGISTERS and DRIVES ----
      // Direct slash drive of the target itself. Also the anti-vacuity guard for
      // the refusal below: it proves the temp discovery root registers and drives
      // a target at all, so a REFUSED reading in (b) cannot be a wrong-root false
      // pass.
      const acyclic = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0302acyclic",
        cwd: acyclicCwd,
      });
      expect(
        acyclic.exitCode,
        `acyclic: expected a no-error exit (0), got ${String(acyclic.exitCode)}. ` +
          `stderr: ${acyclic.stderr}`,
      ).toBe(0);
      expect(
        acyclic.stdout,
        `acyclic: two same-stem \`b0302util.thetalib\` files in different ` +
          `directories are acyclic, so the target must register and DRIVE — ` +
          `computing f(941) + 100 = ${ACYCLIC_OK}. Printing no such number means ` +
          `the stem-keyed graph drew a false import-cycle self-loop and ` +
          `un-registered the target — bug 0302 unfixed. stdout: ${acyclic.stdout} ` +
          `stderr: ${acyclic.stderr}`,
      ).toContain(ACYCLIC_OK);

      // ---- (b) the cyclic same-stem program is REFUSED, observed through invoke ----
      const cyclic = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0302cyclicprobe",
        cwd: cyclicCwd,
      });
      expect(
        cyclic.exitCode,
        `cyclic: expected a no-error exit (0), got ${String(cyclic.exitCode)}. ` +
          `stderr: ${cyclic.stderr}`,
      ).toBe(0);
      expect(
        cyclic.stdout,
        `cyclic: \`x → a/b0302util → x\` is a genuine cycle, so the target must ` +
          `NOT register and the prober's invoke resolves Err — printing ` +
          `"${REFUSED}". Printing "${LOADED}" means the stem-twin \`b/b0302util\` ` +
          `overwrote the back-edge and masked the cycle — bug 0302 unfixed. ` +
          `stdout: ${cyclic.stdout} stderr: ${cyclic.stderr}`,
      ).toContain(REFUSED);
      expect(
        cyclic.stdout,
        `cyclic: the Ok arm must not fire; stdout: ${cyclic.stdout}`,
      ).not.toContain(LOADED);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(acyclicCwd, { recursive: true, force: true });
      rmSync(cyclicCwd, { recursive: true, force: true });
    }
  });
});
