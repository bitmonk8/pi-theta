// H9a live acceptance — bug 0346: a `match` whose arm set mixes an
// `integer`-typed binding with a fractional literal — `match 1 { 1 => n, _ =>
// 1.5 }` over `let n: integer = 1` — now widens the literal arm candidate
// before the checker-side LUB's domination test (`leastUpperBound`,
// src/parser/match-result.ts), so the arms reduce to the member `number`
// rather than finding no dominating member, and a match that used to refuse
// `theta/parse/match-arm-type-mismatch` (and so never registered) now
// registers and DRIVES a real turn, while a genuinely memberless match
// (`{integer, string}`) still refuses — END-TO-END through the real `pi -p`
// binary (docs/bugs/0346-checker-side-lubs-literal-candidate-asymmetry.md).
//
// TWIN LINEAGE. This file mirrors
// `tests/live/acceptance/b0344live-commontype-literal-candidate-admittee.test.ts`
// clause for clause. Bug 0344 widened `commonType`, the array/ternary LUB;
// bug 0346 widens the two 0158-reconciled checker siblings — `leastUpperBound`
// (the match-arm LUB) and `computeLub` (the inferred-return LUB) — carrying the
// same TYPE-3 candidate asymmetry. This cell drives the match-arm surface: a
// literal arm candidate compared as the primitive it types as (`{literal
// number}` as `{prim number}`) covers the set, so `{prim integer, literal
// number}` reduces to `number`.
//
// POLARITY (inverted from the usual offender/control pair, same inversion as
// 0344's twin). The fix's observable is a REGISTRATION-that-used-to-be-a-
// refusal that now also DRIVES a real turn, so the cells are:
//   (1) ADMITTEE — `let n: integer = 1` / `let r = match 1 { 1 => n, _ =>
//       1.5 }`. Pre-fix `leastUpperBound` found no dominating member for the
//       `{prim integer, literal number}` arm set and `checkMatchArmTypes`
//       emitted `theta/parse/match-arm-type-mismatch`, so the theta did NOT
//       register; the two-site checker fix widens the `1.5` arm candidate to
//       `prim number` before the domination test, `prim number` dominates
//       `prim integer` (TYPE-2), the arms reduce to `number`, and the theta
//       registers and drives. The `match 1` selector takes arm `1`, so `r`
//       evaluates to `n` = `1`, and the task-framed query answers
//       `1 + 263 = 264`.
//   (2) OFFENDER that must survive — a genuinely memberless match set,
//       `{integer, string}` (§Fix constraint: the member-restricted discipline
//       is unchanged). `{integer, string}` has no dominating member under any
//       literal widening — widening a literal candidate to its primitive never
//       manufactures a dominator across disjoint primitives — so this still
//       refuses `theta/parse/match-arm-type-mismatch` and the theta does NOT
//       register. This is the control that the widening did not over-reach and
//       swallow the member-restricted refusal 0158 established.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0346-checker-side-lubs-literal-candidate-asymmetry.test.ts` pins the
// LUB and diagnostic-code dispositions (cells M1–M5/R1–R4/O/S/Fm/Fr) over the
// in-process front end via `parseDoc`. This file spawns the real `pi` binary in
// print mode over its own throwaway discovery root and observes the
// registration delta through real extension auto-load, `--theta` discovery, the
// shipped composition root, and the interpreter — the same channel an operator
// sees.
//
// WHY THE ADMITTEE IS OBSERVED BY DRIVING IT DIRECTLY.
// The fix's observable is that the previously-refused theta EXISTS as a slash
// command. A theta that fails to register is not invokable at all, so spawning
// `/<admittee>` directly and reading a real driven answer off stdout is the
// registration-and-drive observable in one: a degraded / unregistered run
// cannot produce the fixed-pair sum.
//
// WHY THE OFFENDER's REFUSAL IS OBSERVED THROUGH `invoke`, NOT A PRINTED
// DIAGNOSTIC.
// On the shipped `session_start` path parse diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout. invocation.md §Static resolution: a literal
// `invoke(...)` whose callee fails its own structural checks surfaces at
// runtime as `Err(InvokeInfraError)`; a `match` over that Result turns the
// refusal into a POSITIVE, deterministic sentinel on stdout — the assertion
// reds by printing the opposite sentinel, not by printing nothing (the b0304 /
// b0314 / b0341 / b0344 pattern).
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the admittee's
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
// sets `PI_THETA_SUBAGENT_EXTENSION_PIN` and the outer process carries `-ne -e
// <this tree's extensions>`), so the file is correct either way.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the committed
// fixtures under `./fixtures`, and uses its own temp discovery root. It does
// NOT call `assertStderrClean` and does NOT call `assertCodesSubsetOfPermitted`,
// so it needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — the
// admittee and offender register/refuse on this crafted fixture only, never on
// a committed fixture.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code the surviving memberless-match refusal reds with (bug doc §Fix: the member-restricted discipline is unchanged / `checkMatchArmTypes`). */
const MATCH_MISMATCH_CODE = "theta/parse/match-arm-type-mismatch";

/**
 * Cell 1 — the ADMITTEE that used to be refused. The arm set `{prim integer,
 * literal number}` now widens the `1.5` arm candidate to `prim number` before
 * `leastUpperBound`'s domination test, so the arms reduce to the member
 * `number` (not a memberless refusal). The `match 1` selector takes arm `1`, so
 * `r` evaluates to `n` = `1`; it carries the fixed-pair query so a real driven
 * turn proves the registered command actually runs.
 */
const ADMITTEE = [
  "---",
  "mode: prompt",
  "---",
  "let n: integer = 1",
  "let r = match 1 { 1 => n, _ => 1.5 }",
  "@`A match probe reduced to ${r}. What is ${r} plus 263? Answer with the number only.`",
  "",
].join("\n");

/**
 * Cell 2 — the genuinely memberless match (bug doc §Fix constraint: the
 * member-restricted discipline is unchanged). `{integer, string}` has no
 * dominating member regardless of literal widening — widening a literal
 * candidate to its primitive never manufactures a dominator across disjoint
 * primitives — so this still reds at parse and the theta fails to register. Its
 * body carries NO query, so the pre-fix-equivalent direction — where an
 * over-fix might register it and `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let n: integer = 1",
  'let s: string = "a"',
  "let r = match 1 { 1 => n, _ => s }",
  '"B0346 OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * registration disposition into one of two committed sentinels through a
 * `match` over the untyped `invoke`'s `Result`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0346offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0346 OFFENDER LOADED",',
  '  Err(e) => "B0346 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

// Task-framed answers, never verbatim-echo demands (AGENTS.md §"Assert on real
// observables"). `match 1` takes arm `1`, so `r` evaluates to `n` = `1`, and
// the admittee's fixed-pair sum `1 + 263 = 264` is decidable only if a real
// turn ran through a registered command over the admitted match binding.
const ADMITTEE_OK = "264";
const REFUSED = "REFUSED";
const LOADED = "LOADED";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0346 checker-side match-arm LUB admittee registers/drives through the real `pi -p`", () => {
  it("registers and drives the previously-refused match admittee, and still refuses the genuinely memberless match", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): on this fix branch the admittee parses clean — its `{prim
    // integer, literal number}` arm set widens to the member `number`, so the
    // match admits — so no unrelated failure can suppress its registration,
    // while the offender carries exactly the surviving member-restricted code,
    // so neither live sentinel can come from elsewhere. Pre-fix the admittee's
    // match drew `theta/parse/match-arm-type-mismatch` (bug doc rows M1/M5) and
    // would not register; the offender's `[MATCH_MISMATCH_CODE]` is unchanged by
    // the fix (bug doc §Fix — the memberless discipline must survive).
    expect(
      parseErrorCodes(ADMITTEE, "/proj/b0346admittee.theta"),
      "attribution: the widened `{integer n, 1.5}` arm set must reduce to the " +
        "member `number`, so the match admits and the admittee parses clean",
    ).toEqual([]);
    expect(
      parseErrorCodes(OFFENDER, "/proj/b0346offender.theta"),
      "attribution: a `{integer, string}` match arm set has no dominating " +
        "member regardless of literal widening, so the parse layer must still " +
        `carry exactly ${MATCH_MISMATCH_CODE}`,
    ).toEqual([MATCH_MISMATCH_CODE]);

    // Live-host precondition — fails loudly naming the unmet precondition;
    // never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0346-root-"));
    const admitteeCwd = mkdtempSync(join(tmpdir(), "theta-b0346-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0346-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0346admittee.theta"), ADMITTEE, "utf8");
      writeFileSync(join(thetaDir, "b0346offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0346probe.theta"), PROBE, "utf8");

      // ---- (1) the previously-refused match admittee registers AND drives ----
      const admittee = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0346admittee",
        cwd: admitteeCwd,
      });
      expect(
        admittee.exitCode,
        `admittee: expected a no-error exit (0), got ${String(admittee.exitCode)}. ` +
          `stderr: ${admittee.stderr}`,
      ).toBe(0);
      expect(
        admittee.stdout,
        `admittee: the widened match arm set must no longer refuse, so ` +
          `/b0346admittee registers and a real turn answers 1 + 263 = ${ADMITTEE_OK}. ` +
          `A refused theta (bug 0346 unfixed) does not exist as a slash command and cannot ` +
          `drive, so this could not answer ${ADMITTEE_OK}. stdout: ${admittee.stdout} ` +
          `stderr: ${admittee.stderr}`,
      ).toContain(ADMITTEE_OK);

      // ---- (2) the genuinely memberless match is still refused, observed via invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0346probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT register (its {integer, string} ` +
          `match arm set reds at parse under the member-restricted discipline), so ` +
          `the prober's invoke("./b0346offender.theta") resolves Err and the match ` +
          `prints "${REFUSED}". Printing "${LOADED}" means the literal widening ` +
          `over-reached and swallowed the memberless refusal — bug 0346 over-fixed. ` +
          `stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(admitteeCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
