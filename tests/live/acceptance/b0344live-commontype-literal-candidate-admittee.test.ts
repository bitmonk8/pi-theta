// H9a live acceptance — bug 0344: an array literal mixing an `integer`-typed
// binding with a `number` literal — `[n, 1.5]` — now widens the literal
// candidate before `commonType`'s domination test, so the element LUB is the
// primitive `array<number>` rather than the union `array<integer | number>`,
// and an element read fed to `+` that used to refuse `mixed-plus-operands`
// now registers and DRIVES a real turn, while a genuinely disjoint object-
// branch array still refuses — END-TO-END through the real `pi -p` binary
// (docs/bugs/0344-commontype-literal-candidate-asymmetry-yields-union-not-primitive.md).
//
// TWIN LINEAGE. This file mirrors
// `tests/live/acceptance/b0341live-inferred-binding-accumulator-registers.test.ts`
// clause for clause. Bug 0341 widened the RECORDING side (an unannotated
// literal-initialised binding now records the primitive it types as); bug
// 0344 widens the REDUCTION side (`commonType`'s candidate-side literal, not
// the branch-side) — the same TYPE-3 asymmetry, seen from the other
// direction, per the bug doc's §Related note on 0341's residual 1.
//
// POLARITY (inverted from the usual offender/control pair, same inversion as
// 0341's twin). The fix's observable is a REGISTRATION-that-used-to-be-a-
// refusal that now also DRIVES a real turn, so the cells are:
//   (1) ADMITTEE — `let n = 1` / `let xs = [n, 1.5]` / `let v = xs[0] + 1`
//       (bug doc row Q3). Pre-fix `xs[0]` read the union `integer | number`
//       and `xs[0] + 1` drew `theta/parse/mixed-plus-operands`, so the theta
//       did NOT register; the fix widens the `1.5` candidate to `prim
//       number` before the domination test, `prim number` dominates `prim
//       integer` (TYPE-2), the element types `number`, and `v` computes
//       `2` — the theta registers and drives, answering the fixed-pair sum
//       `2 + 263 = 265`.
//   (2) OFFENDER that must survive — two distinct object schemas in one
//       array literal (§Fix constraint 2, the object-branch gate). Widening
//       a literal candidate to its primitive never turns a branch into or
//       out of an object branch, so a set holding two object branches still
//       refuses `theta/parse/array-no-common-type` and the theta does NOT
//       register. This is the control that the widening did not manufacture
//       a dominator where the gate must still block one — over-fixing would
//       swallow this refusal exactly as 0341's OFFENDER cell guarded against
//       a swallowed `reassign-rhs-type-mismatch`.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0344-commontype-literal-candidate-asymmetry.test.ts` pins the LUB
// and diagnostic-code dispositions (cells A–G) over the in-process front end
// via `parseDoc`. This file spawns the real `pi` binary in print mode over
// its own throwaway discovery root and observes the registration delta
// through real extension auto-load, `--theta` discovery, the shipped
// composition root, and the interpreter — the same channel an operator sees.
//
// WHY THE ADMITTEE IS OBSERVED BY DRIVING IT DIRECTLY.
// The fix's observable is that the previously-refused theta EXISTS as a
// slash command. A theta that fails to register is not invokable at all, so
// spawning `/<admittee>` directly and reading a real driven answer off
// stdout is the registration-and-drive observable in one: a degraded /
// unregistered run cannot produce the fixed-pair sum.
//
// WHY THE OFFENDER's REFUSAL IS OBSERVED THROUGH `invoke`, NOT A PRINTED
// DIAGNOSTIC.
// On the shipped `session_start` path parse diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to
// `pi -p` print-mode text stdout. invocation.md §Static resolution: a
// literal `invoke(...)` whose callee fails its own structural checks
// surfaces at runtime as `Err(InvokeInfraError)`; a `match` over that
// Result turns the refusal into a POSITIVE, deterministic sentinel on
// stdout — the assertion reds by printing the opposite sentinel, not by
// printing nothing (the b0304 / b0314 / b0341 pattern).
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the admittee's
// task-framed arithmetic answer, the two committed refusal sentinels on
// `pi -p` stdout, and each run's exit code. Drive discriminators are ANSWERS
// to task questions (fixed-pair arithmetic / extract-the-last-word), NEVER
// verbatim-echo demands — current models read an echo demand as prompt
// injection and refuse it (bug 0243 / AGENTS.md).
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child
// pins"): NOT required here. All thetas are `mode: prompt`, and a prompt →
// prompt `invoke` suspends the parent and attaches the callee to the
// caller's existing session (invocation.md §Cross-mode semantics) — no
// RFC-0006 child process is launched. The pins are supplied anyway by the
// shared harness (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN` and
// the outer process carries `-ne -e <this tree's extensions>`), so the file
// is correct either way.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the
// nine-area H9a manifest: it adds no `FeatureArea`, touches none of the
// committed fixtures under `./fixtures`, and uses its own temp discovery
// root. It does NOT call `assertStderrClean` and does NOT call
// `assertCodesSubsetOfPermitted`, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json` — the admittee and offender
// register/refuse on this crafted fixture only, never on a committed
// fixture.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code the surviving object-branch refusal reds with (bug doc §Fix constraint 2 / type-compat.ts's object-branch gate). */
const NO_COMMON_TYPE_CODE = "theta/parse/array-no-common-type";

/**
 * Cell 1 — the ADMITTEE that used to be refused. `let xs = [n, 1.5]` over
 * `let n = 1` now widens the `1.5` literal candidate to `prim number` before
 * `commonType`'s domination test, so the element types `number` (not the
 * union), `xs[0] + 1` admits, and `v` computes `2`. It carries the fixed-pair
 * query so a real driven turn proves the registered command actually runs.
 */
const ADMITTEE = [
  "---",
  "mode: prompt",
  "---",
  "let n = 1",
  "let xs = [n, 1.5]",
  "let v = xs[0] + 1",
  "@`A counter probe computed ${v}. What is ${v} plus 263? Answer with the number only.`",
  "",
].join("\n");

/**
 * Cell 2 — the genuinely disjoint array (bug doc §Fix constraint 2). Two
 * distinct object schemas in one array literal have no common type
 * regardless of literal widening — the object-branch gate keys on branch
 * KIND, not on whether a candidate was widened — so this still reds at parse
 * and the theta fails to register. Its body carries NO query, so the
 * pre-fix-equivalent direction — where an over-fix might register it and
 * `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "schema A { a: integer }",
  "schema B { b: string }",
  'let x = [A { a: 1 }, B { b: "x" }]',
  '"B0344 OFFENDER BODY RAN"',
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
  'let r = invoke("./b0344offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0344 OFFENDER LOADED",',
  '  Err(e) => "B0344 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

// Task-framed answers, never verbatim-echo demands (AGENTS.md §"Assert on
// real observables"). `v` is `xs[0] + 1` = `1 + 1` = `2`, so the admittee's
// fixed-pair sum is decidable only if a real turn ran through a registered
// command computing the widened element type.
const ADMITTEE_OK = "265";
const REFUSED = "REFUSED";
const LOADED = "LOADED";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0344 commonType literal-candidate admittee registers/drives through the real `pi -p`", () => {
  it("registers and drives the previously-refused admittee, and still refuses the genuinely disjoint object array", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): on this fix branch the admittee parses clean — its widened
    // `[n, 1.5]` element types `number`, so `xs[0] + 1` admits — so no
    // unrelated failure can suppress its registration, while the offender
    // carries exactly the surviving object-branch-gate code, so neither live
    // sentinel can come from elsewhere. Pre-fix the admittee's `xs[0] + 1`
    // read `theta/parse/mixed-plus-operands` (bug doc row Q3) and would not
    // register; the offender's `[NO_COMMON_TYPE_CODE]` is unchanged by the
    // fix (bug doc §Fix constraint 2 — the object-branch gate must survive).
    expect(
      parseErrorCodes(ADMITTEE, "/proj/b0344admittee.theta"),
      "attribution: the widened `[n, 1.5]` element must type `number`, so " +
        "`xs[0] + 1` admits and the admittee parses clean",
    ).toEqual([]);
    expect(
      parseErrorCodes(OFFENDER, "/proj/b0344offender.theta"),
      "attribution: two distinct object schemas in one array literal have " +
        `no common type regardless of literal widening, so the parse layer ` +
        `must still carry exactly ${NO_COMMON_TYPE_CODE}`,
    ).toEqual([NO_COMMON_TYPE_CODE]);

    // Live-host precondition — fails loudly naming the unmet precondition;
    // never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0344-root-"));
    const admitteeCwd = mkdtempSync(join(tmpdir(), "theta-b0344-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0344-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0344admittee.theta"), ADMITTEE, "utf8");
      writeFileSync(join(thetaDir, "b0344offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0344probe.theta"), PROBE, "utf8");

      // ---- (1) the previously-refused admittee registers AND drives ----
      const admittee = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0344admittee",
        cwd: admitteeCwd,
      });
      expect(
        admittee.exitCode,
        `admittee: expected a no-error exit (0), got ${String(admittee.exitCode)}. ` +
          `stderr: ${admittee.stderr}`,
      ).toBe(0);
      expect(
        admittee.stdout,
        `admittee: the widened element read must no longer refuse, so ` +
          `/b0344admittee registers and a real turn answers 2 + 263 = ${ADMITTEE_OK}. ` +
          `A refused theta (bug 0344 unfixed) does not exist as a slash command and cannot ` +
          `drive, so this could not answer ${ADMITTEE_OK}. stdout: ${admittee.stdout} ` +
          `stderr: ${admittee.stderr}`,
      ).toContain(ADMITTEE_OK);

      // ---- (2) the genuinely disjoint object array is still refused, observed via invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0344probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT register (its two-object-schema ` +
          `array reds at parse with the object-branch gate), so the prober's ` +
          `invoke("./b0344offender.theta") resolves Err and the match prints "${REFUSED}". ` +
          `Printing "${LOADED}" means the literal widening swallowed the object-branch ` +
          `gate — bug 0344 over-fixed. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
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
