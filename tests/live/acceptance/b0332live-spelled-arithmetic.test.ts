// H9a live acceptance — bug 0332: a spelled binary `-`/`*`/`/`/`%` over
// non-numeric operands is refused at parse, while well-formed numeric
// arithmetic still registers and computes, END-TO-END through the real `pi -p`
// binary (docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md).
//
// This file drives two dispositions through the real host:
//   (a) OFFENDER class — `let x = "a" - "b"` reds at PARSE with
//       `theta/parse/non-numeric-arithmetic-operands`, so the offending theta
//       fails to register and an `invoke` of it resolves `Err`.
//   (b) numeric control — `let n = 7 - 2` computes `5` and drives a real turn
//       whose answer (`5 + 100 = 105`) is decidable only if the subtraction of
//       two integers still evaluates, proving the numeric arithmetic path is
//       byte-identical behind the new gate and belt.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts` pins the
// parse/runtime dispositions over the in-process production executor. This file
// spawns the real `pi` binary in print mode over its own throwaway discovery
// root and observes the outcomes through real extension auto-load, `--theta`
// discovery, the shipped composition root, and the interpreter — so the fix is
// proved through the same registration and drive channels an operator sees.
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
// over the theta's own computed text (extract-the-last-word / number-plus-100),
// NEVER verbatim-echo demands — current models read an echo demand as prompt
// injection and refuse it (bug 0243 / AGENTS.md).
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
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — the new code
// fires on these crafted fixtures only, never on a committed fixture.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code the spelled non-numeric arithmetic reds with (expressions.md §"Other arithmetic"). */
const NON_NUMERIC_ARITHMETIC_OPERANDS_CODE = "theta/parse/non-numeric-arithmetic-operands";

/**
 * The offending theta: `let x = "a" - "b"` is a spelled binary `-` over two
 * `string` operands, which bug 0332's gate reds at parse with
 * `theta/parse/non-numeric-arithmetic-operands`, so the theta fails to register.
 * Its body carries NO query, so the pre-fix direction — where it registers and
 * `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'let x = "a" - "b"',
  '"B0332 OFFENDER BODY RAN"',
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
  'let r = invoke("./b0332offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0332 OFFENDER LOADED",',
  '  Err(e) => "B0332 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The well-formed numeric control: `7 - 2` must still compute `5` behind the new
 * gate and runtime belt, so the query's answer is `5 + 100 = 105`. A degraded
 * plain-prompt run cannot fabricate 105 — the number is decidable only if the
 * integer subtraction evaluated. It must register AND drive, so the fix is
 * proved to leave numeric arithmetic byte-identical and not merely to reject the
 * offender.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "let n = 7 - 2",
  "@`A probe computed a number ${n}. What is ${n} plus 100? Answer with the number only.`",
  "",
].join("\n");

// Task-framed answers, never verbatim-echo demands (AGENTS.md §"Assert on real
// observables").
const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "105";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0332 spelled-arithmetic refusal/compute through the real `pi -p`", () => {
  it("refuses the non-numeric spelled-arithmetic theta, and still registers and drives the well-formed numeric control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // non-numeric-arithmetic-operands code, and the control parses clean, so
    // neither live sentinel can be produced by an unrelated failure. RED at HEAD
    // — the spelled `-` over two strings drew no operand check, so the offender
    // read `[]` (offline witness rows G1–G8).
    expect(
      parseErrorCodes(OFFENDER, "/proj/b0332offender.theta"),
      "attribution: the offender's `\"a\" - \"b\"` is a spelled non-numeric binary, so " +
        `the parse layer must carry exactly ${NON_NUMERIC_ARITHMETIC_OPERANDS_CODE}`,
    ).toEqual([NON_NUMERIC_ARITHMETIC_OPERANDS_CODE]);
    expect(
      parseErrorCodes(CONTROL, "/proj/b0332control.theta"),
      "attribution: `7 - 2` is a legal numeric subtraction, so the control parses clean",
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

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0332-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0332-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0332-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0332offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0332probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0332control.theta"), CONTROL, "utf8");

      // ---- (b) the well-formed numeric control registers and drives ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0332control",
        cwd: controlCwd,
      });
      expect(
        control.exitCode,
        `control: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
          `stderr: ${control.stderr}`,
      ).toBe(0);
      expect(
        control.stdout,
        `control: 7 - 2 must compute 5, so the query's answer is 5 + 100 = ${CONTROL_OK}. ` +
          `A broken numeric arithmetic path (gate/belt over-reach) would fail to compute 5, ` +
          `so this cannot answer ${CONTROL_OK}. stdout: ${control.stdout} stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (a) the non-numeric spelled-arithmetic theta is refused, via invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0332probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT register (its spelled \`"a" - "b"\` reds at ` +
          `parse), so the prober's invoke("./b0332offender.theta") resolves Err and ` +
          `the match prints "${REFUSED}". Printing "${LOADED}" means a non-numeric ` +
          `spelled arithmetic loaded clean — bug 0332 unfixed. stdout: ${probe.stdout} ` +
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
