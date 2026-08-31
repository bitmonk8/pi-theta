// H9a live acceptance — bug 0345: an operand-violating `${…}` interpolation is
// refused at parse, while a well-formed numeric interpolation still registers
// and computes, END-TO-END through the real `pi -p` binary
// (docs/bugs/0345-interpolation-expressions-skip-all-operand-checks-at-parse.md).
//
// This file drives two dispositions through the real host:
//   (a) OFFENDER — a prompt theta whose body is `@`v=${1 + "a"}`` reds at PARSE
//       with `theta/parse/mixed-plus-operands` (the descent from `walkExpr`'s
//       `case "query"` into the interpolation expression), so the offending
//       theta fails to register and an `invoke` of it resolves `Err`. Its query
//       never dispatches, so this direction costs ZERO model turns.
//   (b) numeric control — `@`… ${1 + 2} …`` still computes `3` and drives a real
//       turn whose answer (`3 + 100 = 103`) is decidable only if the numeric
//       interpolation evaluated and reached the prompt, proving the descent
//       leaves the QRY-18 numeric baseline byte-identical.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0345-interpolation-operand-checks-at-parse.test.ts` pins the
// parse/render dispositions over the in-process parser and production executor.
// This file spawns the real `pi` binary in print mode over its own throwaway
// discovery root and observes the outcomes through real extension auto-load,
// `--theta` discovery, the shipped composition root, and the interpreter — so
// the fix is proved through the same registration and drive channels an operator
// sees.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path parse diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout. invocation.md §Static resolution: a literal
// `invoke(...)` whose callee fails its own structural checks surfaces at runtime
// as `Err(InvokeInfraError)`; a `match` over that Result turns the refusal into a
// POSITIVE, deterministic sentinel on stdout — the assertion reds by printing the
// opposite sentinel, not by printing nothing (the b0332 pattern).
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, plus the control's compute-from-inline-value
// answer, plus each run's exit code. The control's discriminator is a question
// over the theta's OWN interpolated value (`${1 + 2} plus 100`), NEVER a
// verbatim-echo demand — current models read an echo demand as prompt injection
// and refuse it (bug 0243 / AGENTS.md).
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
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — the operand
// codes fire on these crafted fixtures only, never on a committed fixture.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code the mixed `+` interpolation reds with (expressions.md §"`+` operator"). */
const MIXED_PLUS_OPERANDS_CODE = "theta/parse/mixed-plus-operands";

/**
 * The offending theta: its body is `@`v=${1 + "a"}``, a `${…}` interpolation
 * whose `+` mixes a number and a string, which bug 0345's descent reds at parse
 * with `theta/parse/mixed-plus-operands`, so the theta fails to register. The
 * query is never dispatched (registration is refused before any turn), so the
 * pre-fix direction costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  '@`v=${1 + "a"}`',
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
  'let r = invoke("./b0345offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0345 OFFENDER LOADED",',
  '  Err(e) => "B0345 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The well-formed numeric-interpolation control: `${1 + 2}` must still compute
 * `3` behind the descent, so the query's answer is `3 + 100 = 103`. A degraded
 * plain-prompt run cannot fabricate 103 — the number is decidable only if the
 * numeric interpolation evaluated and reached the prompt. It must register AND
 * drive, so the fix is proved to leave the QRY-18 numeric baseline byte-
 * identical and not merely to reject the offender.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "@`A probe interpolated the number ${1 + 2}. What is ${1 + 2} plus 100? Answer with the number only.`",
  "",
].join("\n");

// Task-framed / compute-from-inline-value answers, never verbatim-echo demands
// (AGENTS.md §"Assert on real observables").
const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "103";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0345 interpolation operand refusal/compute through the real `pi -p`", () => {
  it("refuses the operand-violating interpolation theta, and still registers and drives the numeric-interpolation control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // mixed-plus-operands code, and the control parses clean, so neither live
    // sentinel can be produced by an unrelated failure. RED at HEAD — the query
    // arm returns without descending into `${1 + "a"}`, so the offender reads
    // `[]` (offline witness cells 1a/1b). Because this guard reds first at HEAD,
    // the live host is never reached pre-fix and no tokens are spent.
    expect(
      parseErrorCodes(OFFENDER, "/proj/b0345offender.theta"),
      "attribution: the offender's `${1 + \"a\"}` is a mixed-operand `+` interpolation, so " +
        `the parse layer must carry exactly ${MIXED_PLUS_OPERANDS_CODE}`,
    ).toEqual([MIXED_PLUS_OPERANDS_CODE]);
    expect(
      parseErrorCodes(CONTROL, "/proj/b0345control.theta"),
      "attribution: `${1 + 2}` is a legal numeric interpolation, so the control parses clean",
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

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0345-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0345-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0345-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0345offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0345probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0345control.theta"), CONTROL, "utf8");

      // ---- (b) the numeric-interpolation control registers and drives ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0345control",
        cwd: controlCwd,
      });
      expect(
        control.exitCode,
        `control: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
          `stderr: ${control.stderr}`,
      ).toBe(0);
      expect(
        control.stdout,
        `control: ${"${1 + 2}"} must compute 3, so the query's answer is 3 + 100 = ${CONTROL_OK}. ` +
          `A broken numeric-interpolation path (descent over-reach) would fail to compute 3, ` +
          `so this cannot answer ${CONTROL_OK}. stdout: ${control.stdout} stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (a) the operand-violating interpolation theta is refused, via invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0345probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT register (its ${"${1 + \"a\"}"} reds at parse), ` +
          `so the prober's invoke("./b0345offender.theta") resolves Err and the match prints ` +
          `"${REFUSED}". Printing "${LOADED}" means an operand-violating interpolation loaded ` +
          `clean — bug 0345 unfixed. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
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
