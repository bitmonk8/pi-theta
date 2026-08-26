// H9a live acceptance — bug 0314: compound assignment on a non-numeric
// `let mut` binding is refused / correct END-TO-END through the real `pi -p`
// binary (docs/bugs/0314-compound-assign-non-numeric-silent-zero.md).
//
// PARENT-RATIFIED REMEDY (Option A). This file drives two of the ratified
// witness rows through the real host:
//   (a) P1c class — `+=` on a non-numeric operand pair reds at PARSE with
//       `theta/parse/mixed-plus-operands`, so the offending theta fails to
//       register and an `invoke` of it resolves `Err`.
//   (b) `+=` on two strings concatenates (the `+` rule) — a well-formed control
//       computes `"ab" += "cd"` → `"abcd"`, whose `.length` is 4, and drives a
//       real turn whose answer is decidable only if the concat succeeded.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0314-compound-assign-non-numeric.test.ts` pins the parse/runtime
// dispositions over the in-process production executor. This file spawns the
// real `pi` binary in print mode over its own throwaway discovery root and
// observes the outcomes through real extension auto-load, `--theta` discovery,
// the shipped composition root, and the interpreter — so the fix is proved
// through the same registration and drive channels an operator sees.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path parse diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout. invocation.md §Static resolution: a literal
// `invoke(...)` whose callee fails its own structural checks surfaces at runtime
// as `Err(InvokeInfraError)`; a `match` over that Result turns the refusal into
// a POSITIVE, deterministic sentinel on stdout — the assertion reds by printing
// the opposite sentinel, not by printing nothing (the b0304 pattern).
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
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — extending
// either gate to an unbaselined surface would change its scope with no recorded
// measurement (the constraint b0304's live cell documents).

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code the desugared non-numeric `+` reds with (expressions.md §"`+` operator"). */
const MIXED_PLUS_OPERANDS_CODE = "theta/parse/mixed-plus-operands";

/**
 * The offending theta (P1c class): its `+=` on two arrays is the compound
 * spelling of `xs + [2]`, which the fix reds at parse with
 * `theta/parse/mixed-plus-operands`, so the theta fails to register. Its body
 * carries NO query, so the pre-fix direction — where it registers and `invoke`
 * runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let mut xs = [1]",
  "xs += [2]",
  '"B0314 OFFENDER BODY RAN"',
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
  'let r = invoke("./b0314offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0314 OFFENDER LOADED",',
  '  Err(e) => "B0314 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The well-formed `+=` concat control: `"ab" += "cd"` must yield `"abcd"` under
 * the `+` rule, so `.length` is 4 and the query's answer is `4 + 100 = 104`. A
 * degraded plain-prompt run cannot fabricate 104 — the number is decidable only
 * if the concat produced a four-character string. It must register AND drive, so
 * the fix is proved to concatenate strings and not merely to reject the offender.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  'let mut s = "ab"',
  's += "cd"',
  "let n = s.length",
  "@`A probe built a string of length ${n}. What is ${n} plus 100? Answer with the number only.`",
  "",
].join("\n");

// Task-framed answers, never verbatim-echo demands (AGENTS.md §"Assert on real
// observables").
const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "104";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0314 compound-assign refusal/concat through the real `pi -p`", () => {
  it("refuses the non-numeric compound theta, and still registers and drives the well-formed += concat control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // mixed-plus-operands, and the control parses clean, so neither live
    // sentinel can be produced by an unrelated failure. RED at HEAD — the parse
    // position judges only RHS `⊑` target (which passes for array/array), never
    // forms the implied `xs + [2]`, so the offender reads `[]` (offline witness
    // rows P1c / P1a).
    expect(
      parseErrorCodes(OFFENDER, "/proj/b0314offender.theta"),
      "attribution: the offender's `xs += [2]` desugars to a non-numeric `+`, so " +
        `the parse layer must carry exactly ${MIXED_PLUS_OPERANDS_CODE}`,
    ).toEqual([MIXED_PLUS_OPERANDS_CODE]);
    expect(
      parseErrorCodes(CONTROL, "/proj/b0314control.theta"),
      "attribution: `+=` on two strings is a legal concat, so the control parses clean",
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

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0314-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0314-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0314-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0314offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0314probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0314control.theta"), CONTROL, "utf8");

      // ---- (b) the well-formed += concat control registers and drives ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0314control",
        cwd: controlCwd,
      });
      expect(
        control.exitCode,
        `control: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
          `stderr: ${control.stderr}`,
      ).toBe(0);
      expect(
        control.stdout,
        `control: "ab" += "cd" must concatenate to "abcd" (length 4), so the query's ` +
          `answer is 4 + 100 = ${CONTROL_OK}. A silent-zero compound (bug 0314 unfixed) ` +
          `makes s the number 0 and s.length aborts the theta, so this cannot answer ` +
          `${CONTROL_OK}. stdout: ${control.stdout} stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (a) the non-numeric compound theta is refused, observed via invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0314probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT register (its compound += on arrays ` +
          `reds at parse), so the prober's invoke("./b0314offender.theta") resolves Err ` +
          `and ` +
          `the match prints "${REFUSED}". Printing "${LOADED}" means a non-numeric ` +
          `compound loaded clean — bug 0314 unfixed. stdout: ${probe.stdout} ` +
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
