// H9a live acceptance — bug 0315: a stdlib method call with a wrong argument
// COUNT is refused / a correct-arity call runs END-TO-END through the real
// `pi -p` binary
// (docs/bugs/0315-stdlib-method-argument-surface-unchecked.md).
//
// SETTLED REMEDY (`.pi/tmp/fixes/0315-design-brief.md`). This file drives two
// rows through the real host:
//   (a) P2a class — `"a-b".replace("-")` reds at PARSE with
//       `theta/parse/stdlib-arity-mismatch`, so the offending theta fails to
//       register and an `invoke` of it resolves `Err`.
//   (b) a well-formed control that uses a CORRECT-arity stdlib call
//       (`["a","b"].join("-")`) registers and drives a real turn whose
//       task-framed arithmetic answer (`263 + 514 = 777`) proves a genuine
//       turn ran — the fix rejects the offender WITHOUT breaking correct calls.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// tests/b0315-stdlib-arg-surface.test.ts pins the parse disposition over the
// in-process production parser. This file spawns the real `pi` binary in print
// mode over its own throwaway discovery root and observes the outcomes through
// real extension auto-load, `--theta` discovery, the shipped composition root,
// and the interpreter — so the fix is proved through the same registration and
// drive channels an operator sees.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path parse diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout. invocation.md §Static resolution: a literal
// `invoke(...)` whose callee fails its own structural checks surfaces at runtime
// as `Err(InvokeInfraError)`; a `match` over that Result turns the refusal into
// a POSITIVE, deterministic sentinel on stdout — the assertion reds by printing
// the opposite sentinel, not by printing nothing (the b0304 / b0314 pattern).
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, plus the control's task-framed arithmetic answer,
// plus each run's exit code. Drive discriminators are ANSWERS to task questions
// (extract-the-last-word / fixed-pair arithmetic), NEVER verbatim-echo demands —
// current models read an echo demand as prompt injection and refuse it (bug
// 0243 / AGENTS.md).
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
// H9a manifest: it adds no `FeatureArea`, touches none of the committed fixtures
// under `./fixtures`, and uses its own temp discovery root. It does NOT call
// `assertStderrClean` and does NOT call `assertCodesSubsetOfPermitted`, so it
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — the new parse
// codes are parse-time on a crafted fixture only and never reach H9a stderr from
// committed fixtures.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code the too-few `replace("-")` reds with (design brief). */
const STDLIB_ARITY_MISMATCH_CODE = "theta/parse/stdlib-arity-mismatch";

/**
 * The offending theta (P2a class): `"a-b".replace("-")` is a too-few call on a
 * statically-resolvable `string` receiver, which the fix reds at parse with
 * `theta/parse/stdlib-arity-mismatch`, so the theta fails to register. Its body
 * carries NO query, so the pre-fix direction — where it registers and `invoke`
 * runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'let x = "a-b".replace("-")',
  '"B0315 OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * registration disposition into one of two committed sentinels through a `match`
 * over the untyped `invoke`'s `Result`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0315offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0315 OFFENDER LOADED",',
  '  Err(e) => "B0315 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The well-formed control: a CORRECT-arity stdlib call (`["a","b"].join("-")`)
 * must register and drive. Its query is a task-framed fixed-pair arithmetic
 * question (`263 + 514`), so the answer `777` is decidable only by a real turn.
 * It must register AND drive, so the fix is proved to admit correct-arity
 * stdlib calls and not merely to reject the offender.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  'let joined = ["a", "b"].join("-")',
  "@`A probe produced the string ${joined}. What is 263 plus 514? Answer with the number only.`",
  "",
].join("\n");

// Task-framed answers, never verbatim-echo demands (AGENTS.md §"Assert on real
// observables").
const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "777";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0315 stdlib-argument refusal/correct-call through the real `pi -p`", () => {
  it("refuses the wrong-arity stdlib theta, and still registers and drives the well-formed correct-arity control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // stdlib-arity-mismatch, and the control parses clean, so neither live
    // sentinel can be produced by an unrelated failure. RED at HEAD — the parse
    // layer reads no argument list today, so the offender parses clean (offline
    // witness row P2a).
    expect(
      parseErrorCodes(OFFENDER, "/proj/b0315offender.theta"),
      "attribution: the offender's `\"a-b\".replace(\"-\")` is a too-few stdlib call, so " +
        `the parse layer must carry exactly ${STDLIB_ARITY_MISMATCH_CODE}`,
    ).toEqual([STDLIB_ARITY_MISMATCH_CODE]);
    expect(
      parseErrorCodes(CONTROL, "/proj/b0315control.theta"),
      "attribution: `[\"a\",\"b\"].join(\"-\")` is a correct-arity call, so the control parses clean",
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

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0315-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0315-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0315-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0315offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0315probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0315control.theta"), CONTROL, "utf8");

      // ---- (b) the well-formed correct-arity control registers and drives ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0315control",
        cwd: controlCwd,
      });
      expect(
        control.exitCode,
        `control: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
          `stderr: ${control.stderr}`,
      ).toBe(0);
      expect(
        control.stdout,
        `control: a correct-arity stdlib call must register and drive, so the query's ` +
          `answer is 263 + 514 = ${CONTROL_OK}. If the fix broke correct-arity calls the ` +
          `theta would not register and this cannot answer ${CONTROL_OK}. ` +
          `stdout: ${control.stdout} stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (a) the wrong-arity stdlib theta is refused, observed via invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0315probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        "probe: the offending theta must NOT register (its wrong-arity replace reds " +
          "at parse), so the prober's invoke resolves Err and the match prints " +
          `"${REFUSED}". Printing "${LOADED}" means a wrong-arity stdlib call loaded ` +
          `clean — bug 0315 unfixed. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
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
