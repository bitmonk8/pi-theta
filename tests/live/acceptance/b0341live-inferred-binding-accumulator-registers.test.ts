// H9a live acceptance — bug 0341: an unannotated literal-initialised binding
// now infers the PRIMITIVE, so the accumulator idiom registers and computes,
// while a genuinely wrong write into the same shape still refuses — END-TO-END
// through the real `pi -p` binary
// (docs/bugs/0341-inferred-literal-binding-refuses-primitive-rhs.md).
//
// POLARITY (inverted from the usual offender/control pair). The fix's observable
// is a REGISTRATION that used to be a refusal, so the cells are:
//   (1) ACCUMULATOR class — `let s: string = "x7"` / `let mut a = ""` /
//       `a = a + s` (bug doc rows P2 / A2). Pre-fix this drew
//       `theta/parse/reassign-rhs-type-mismatch: expected string, got string`
//       and the theta did NOT register; the fix records the inferred binding as
//       the primitive `string` (TYPE-3, expression position), so the write is
//       compatible, the theta registers, and it drives a real turn.
//   (2) REFUSAL that must survive — `let mut a = ""` / `a = 5` (bug doc row B1).
//       An `integer` RHS under an inferred `string` binding is a REAL mismatch,
//       so it still reds at parse with `reassign-rhs-type-mismatch`, the theta
//       fails to register, and an `invoke` of it resolves `Err`. The widening
//       must relax the target without swallowing this genuine error.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0341-inferred-literal-binding-refuses-primitive-rhs.test.ts` pins the
// parse/registration dispositions (groups A/B/E) over the in-process front end
// and the mirrored `hasLoadParseError` gate. This file spawns the real `pi`
// binary in print mode over its own throwaway discovery root and observes the
// outcomes through real extension auto-load, `--theta` discovery, the shipped
// composition root, and the interpreter — so the registration delta the fix
// moves is proved through the same channels an operator sees, which §Fix's
// "Live cell" note records was owed but could not be run where the fix landed.
//
// WHY CELL 1 IS OBSERVED BY DRIVING THE ACCUMULATOR DIRECTLY.
// The fix's observable is that the previously-refused theta EXISTS as a slash
// command. A theta that fails to register is not invokable at all, so spawning
// `/<accumulator>` directly and reading a real driven answer off stdout is the
// registration-and-drive observable in one: a degraded / unregistered run
// cannot produce the fixed-pair sum.
//
// WHY CELL 2's REFUSAL IS OBSERVED THROUGH `invoke`, NOT A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path parse diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout. invocation.md §Static resolution: a literal
// `invoke(...)` whose callee fails its own structural checks surfaces at runtime
// as `Err(InvokeInfraError)`; a `match` over that Result turns the refusal into
// a POSITIVE, deterministic sentinel on stdout — the assertion reds by printing
// the opposite sentinel, not by printing nothing (the b0304 / b0314 pattern).
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the accumulator's
// task-framed arithmetic answer, the two committed refusal sentinels on `pi -p`
// stdout, and each run's exit code. Drive discriminators are ANSWERS to task
// questions (fixed-pair arithmetic / extract-the-last-word), NEVER verbatim-echo
// demands — current models read an echo demand as prompt injection and refuse it
// (bug 0243 / AGENTS.md).
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
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — the accumulator
// registers on this crafted fixture only, never on a committed fixture.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code the genuinely-wrong reassignment reds with (bindings.md §"reassignment"). */
const MISMATCH_CODE = "theta/parse/reassign-rhs-type-mismatch";

/**
 * Cell 1 — the ACCUMULATOR that used to be refused. `let mut a = ""` now infers
 * `string` (not the literal type), so `a = a + s` over a `string`-typed `s` is a
 * compatible write and the theta registers. It carries the fixed-pair query so a
 * real driven turn proves the registered command actually runs.
 */
const ACCUMULATOR = [
  "---",
  "mode: prompt",
  "---",
  'let s: string = "x7"',
  'let mut a = ""',
  "a = a + s",
  "@`What is 263 plus 514? Answer with the number only.`",
  "",
].join("\n");

/**
 * Cell 2 — the genuinely-wrong write (bug doc row B1). An `integer` literal RHS
 * under an inferred `string` binding is a REAL type mismatch, so it still reds
 * at parse and the theta fails to register. Its body carries NO query, so the
 * pre-fix direction — where it might register and `invoke` runs it — costs no
 * model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'let mut a = ""',
  "a = 5",
  '"B0341 OFFENDER BODY RAN"',
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
  'let r = invoke("./b0341offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0341 OFFENDER LOADED",',
  '  Err(e) => "B0341 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

// Task-framed answers, never verbatim-echo demands (AGENTS.md §"Assert on real
// observables"). The accumulator's fixed-pair sum is decidable only if a real
// turn ran through a registered command.
const ACCUMULATOR_OK = "777";
const REFUSED = "REFUSED";
const LOADED = "LOADED";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0341 inferred-binding accumulator registers/drives through the real `pi -p`", () => {
  it("registers and drives the previously-refused accumulator, and still refuses the genuinely wrong write", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): on this fix branch the accumulator parses clean — its inferred
    // `string` binding accepts the `string`-typed RHS — so no unrelated failure
    // can suppress its registration, while the offender carries exactly the
    // genuine-mismatch code, so neither live sentinel can come from elsewhere.
    // Pre-fix the accumulator read `[MISMATCH_CODE]` (bug doc row P2) and would
    // not register; the offender's `[MISMATCH_CODE]` is unchanged by the fix
    // (bug doc row B1 — a real mismatch that must survive).
    expect(
      parseErrorCodes(ACCUMULATOR, "/proj/b0341accumulator.theta"),
      "attribution: the accumulator's inferred `string` binding must accept a " +
        `\`string\`-typed RHS, so it parses clean (no ${MISMATCH_CODE})`,
    ).toEqual([]);
    expect(
      parseErrorCodes(OFFENDER, "/proj/b0341offender.theta"),
      "attribution: `let mut a = \"\"` / `a = 5` is a real `string`←`integer` " +
        `mismatch, so the parse layer must still carry exactly ${MISMATCH_CODE}`,
    ).toEqual([MISMATCH_CODE]);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0341-root-"));
    const accumulatorCwd = mkdtempSync(join(tmpdir(), "theta-b0341-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0341-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0341accumulator.theta"), ACCUMULATOR, "utf8");
      writeFileSync(join(thetaDir, "b0341offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0341probe.theta"), PROBE, "utf8");

      // ---- (1) the previously-refused accumulator registers AND drives ----
      const accumulator = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0341accumulator",
        cwd: accumulatorCwd,
      });
      expect(
        accumulator.exitCode,
        `accumulator: expected a no-error exit (0), got ${String(accumulator.exitCode)}. ` +
          `stderr: ${accumulator.stderr}`,
      ).toBe(0);
      expect(
        accumulator.stdout,
        `accumulator: the inferred-binding write must no longer refuse, so ` +
          `/b0341accumulator registers and a real turn answers 263 + 514 = ${ACCUMULATOR_OK}. ` +
          `A refused theta (bug 0341 unfixed) does not exist as a slash command and cannot ` +
          `drive, so this could not answer ${ACCUMULATOR_OK}. stdout: ${accumulator.stdout} ` +
          `stderr: ${accumulator.stderr}`,
      ).toContain(ACCUMULATOR_OK);

      // ---- (2) the genuinely wrong write is still refused, observed via invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0341probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT register (its \`a = 5\` on an inferred ` +
          `\`string\` binding reds at parse), so the prober's ` +
          `invoke("./b0341offender.theta") resolves Err and the match prints "${REFUSED}". ` +
          `Printing "${LOADED}" means the widening swallowed a real mismatch — bug 0341 ` +
          `over-fixed. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(accumulatorCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
