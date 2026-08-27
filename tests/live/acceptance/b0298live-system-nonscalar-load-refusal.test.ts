// H9a live acceptance — bug 0298: a subagent-mode theta whose `system:` value
// is a YAML NON-SCALAR (a block sequence) REFUSES at load with
// theta/load/malformed-system-field, while a well-formed SCALAR-`system:`
// subagent theta still REGISTERS and DRIVES a real turn — both proved
// END-TO-END through the real `pi -p` binary
// (docs/bugs/0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// tests/b0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.test.ts
// pins the load disposition over the in-process production parser (`parseDoc`).
// This file spawns the real `pi` binary in print mode over its own throwaway
// discovery root and observes the outcomes through real extension auto-load,
// `--theta` discovery, the shipped composition root, and the interpreter — so
// the fix is proved through the same registration and drive channels an
// operator sees.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to
// `pi -p` print-mode text stdout (the constraint the b0304 / b0315 cells
// document). invocation.md §Static resolution: a literal `invoke(...)` whose
// callee fails its own structural checks surfaces at runtime as
// `Err(InvokeInfraError)`; a `match` over that Result turns the refusal into a
// POSITIVE, deterministic sentinel on stdout — the assertion reds by printing
// the opposite sentinel, not by printing nothing.
//
// WHY THE CONTROL IS A SUBAGENT INVOKED FROM A PROMPT PROBER.
// `system:` is subagent-mode only, so the scalar-`system:` control must be
// `mode: subagent`. A subagent transcript is private, so its arithmetic answer
// is not on the outer `pi -p` stdout; a prompt prober invokes it and computes
// over the RETURNED number (compute-from-inline-value, AGENTS.md §"Assert on
// real observables"). A registered control returns 777, so the prober answers
// 877; a control the fix wrongly refused resolves `Err` → helper `"0"` → the
// prober answers 100 and the assertion reds. This proves the fix rejects the
// broken non-scalar shape WITHOUT breaking a correct scalar `system:`.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, the control's compute-from-inline-value answer,
// and each run's exit code. Drive discriminators are ANSWERS to task questions
// (extract-the-last-word / compute-from-inline-value), NEVER verbatim-echo
// demands — current models read an echo demand as prompt injection and refuse
// it (bug 0243 / AGENTS.md).
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// the control prober's prompt → subagent `invoke` launches an RFC-0006 child.
// The shared harness supplies both pins at every spawn: `spawnPiPrint` sets
// `PI_THETA_SUBAGENT_EXTENSION_PIN` to this tree's `extensions/` and carries
// the parent-pid so the control plane authenticates, and the outer process
// runs `-ne -e <this tree's extensions>` — so the child binds exactly the
// build under test.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the committed
// fixtures under `./fixtures`, and uses its own temp discovery root. It does
// NOT call `assertStderrClean` (bug 0030's empty-capture gate is scoped to the
// ten committed nine-area spawns and their recorded baseline) and it does NOT
// call `assertCodesSubsetOfPermitted`, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json` — the refusal routes to the
// system-note channel, not to stdout, so the captures carry no
// `theta/{load,parse,runtime}/*` code at all.
//
// Token-bounded: two `pi -p` spawns, one pinned single-turn each.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";
import type { Diagnostic } from "../../../src/diagnostics/diagnostic";

/** The registry code the fix pushes for a present non-scalar `system:` field. */
const CODE = "theta/load/malformed-system-field";

/**
 * The offender: subagent-mode, `system:` over a block SEQUENCE — a present
 * non-scalar value. It refuses at load with CODE and does not register. Its
 * body carries NO query, so the pre-fix direction — where it silently loads and
 * `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: subagent",
  "system:",
  "  - You are a reviewer",
  "---",
  '"B0298 OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * The offender prober: prompt-mode, invokes the offender; a refused callee
 * resolves `Err(InvokeInfraError)` and the `match` prints the REFUSED sentinel.
 */
const OFFENDER_PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0298offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0298 OFFENDER LOADED",',
  '  Err(e) => "B0298 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The matched-pair control: subagent-mode with a well-formed SCALAR `system:`
 * — the only variable flipped from the offender. It must register and drive, so
 * the fix is proved to reject the NON-SCALAR shape specifically and not a
 * `system:` field generally. It drives a task-framed TYPED arithmetic query
 * (returning an integer) so the prober can carry the value back — untyped
 * `invoke(...)` returns `Result<null, …>` and discards the child value
 * (invocation.md §Typed return), so the control's final value crosses the
 * subagent boundary only under a typed `invoke<integer>`.
 */
const CONTROL = [
  "---",
  "mode: subagent",
  "system: You are a precise calculator. Reply with integers only.",
  "---",
  "let n: integer = @`What is 263 plus 514? Reply with the integer.`?",
  "n",
  "",
].join("\n");

/**
 * The control prober: prompt-mode; `invoke<integer>`s the subagent control
 * (the TYPED form, so the child's integer crosses the boundary) and computes
 * over the returned number (compute-from-inline-value, the b0307 pattern). A
 * registered control returns 777 so the prober answers 877; a control the fix
 * wrongly refused resolves `Err` → `d = 0` → the prober answers 100 and the
 * assertion reds.
 */
const CONTROL_PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let res = invoke<integer>("./b0298control.theta")',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 0",
  "}",
  "@`A calculator probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions, never verbatim-echo
// demands (bug 0243 / AGENTS.md).
const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "877";

/** The error-severity load/parse codes `parseDoc` attributes to one source. */
function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  const doc = parseDoc(thetaText, thetaPath);
  return doc.diagnostics
    .filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code)
    .sort();
}

describe("H9a live — bug 0298 non-scalar `system:` load refusal through the real `pi -p`", () => {
  it("refuses the non-scalar-`system:` subagent theta, and still registers and drives the scalar-`system:` control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // CODE and the control is clean and registers, so neither live sentinel can
    // be produced by an unrelated failure. RED at the pre-fix tree — the parser
    // silently dropped the non-scalar `system:` and the offender read `[]`.
    expect(
      errorCodes(OFFENDER, "/proj/b0298offender.theta"),
      `attribution: the offender's non-scalar \`system:\` must carry exactly ${CODE}`,
    ).toEqual([CODE]);
    expect(
      parseDoc(OFFENDER, "/proj/b0298offender.theta").frontmatter,
      "attribution: a refused theta does not register (frontmatter is null)",
    ).toBeNull();
    expect(
      errorCodes(CONTROL, "/proj/b0298control.theta"),
      "attribution: the scalar-`system:` control carries no error and registers",
    ).toEqual([]);
    expect(
      parseDoc(CONTROL, "/proj/b0298control.theta").frontmatter,
      "attribution: the scalar-`system:` control registers (frontmatter non-null)",
    ).not.toBeNull();

    // Live-host precondition — fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    // Two separate discovery roots: the offender's load-time system note (the
    // very diagnostic under test) reaches every theta discovered beside it, so
    // isolating the control keeps its drive run free of that note.
    const offenderDir = mkdtempSync(join(tmpdir(), "theta-b0298-off-"));
    const controlDir = mkdtempSync(join(tmpdir(), "theta-b0298-ctl-"));
    const offenderCwd = mkdtempSync(join(tmpdir(), "theta-b0298-cwd-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0298-cwd-"));
    try {
      writeFileSync(join(offenderDir, "b0298offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(offenderDir, "b0298offenderprobe.theta"), OFFENDER_PROBE, "utf8");
      writeFileSync(join(controlDir, "b0298control.theta"), CONTROL, "utf8");
      writeFileSync(join(controlDir, "b0298controlprobe.theta"), CONTROL_PROBE, "utf8");

      // ---- (1) the non-scalar-`system:` offender is refused, via invoke ----
      const probe = await spawnPiPrint({
        thetaDir: offenderDir,
        slashInvocation: "/b0298offenderprobe",
        cwd: offenderCwd,
      });
      expect(
        probe.exitCode,
        `offender probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `offender probe: the non-scalar \`system:\` theta must NOT load, so ` +
          `invoke("./b0298offender.theta") resolves Err(InvokeInfraError) and the ` +
          `match prints "${REFUSED}". Printing "${LOADED}" means a non-scalar ` +
          `\`system:\` loaded clean — bug 0298 unfixed. stdout: ${probe.stdout} ` +
          `stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `offender probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);

      // ---- (2) the scalar-`system:` control registers and drives ----
      const control = await spawnPiPrint({
        thetaDir: controlDir,
        slashInvocation: "/b0298controlprobe",
        cwd: controlCwd,
      });
      expect(
        control.exitCode,
        `control probe: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
          `stderr: ${control.stderr}`,
      ).toBe(0);
      expect(
        control.stdout,
        `control probe: the scalar-\`system:\` subagent must register and DRIVE — ` +
          `it returns 777 and the prober computes 777 + 100 = ${CONTROL_OK}. A ` +
          `control the fix wrongly refused resolves Err → d = 0 → answer 100. ` +
          `stdout: ${control.stdout} stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);
    } finally {
      rmSync(offenderDir, { recursive: true, force: true });
      rmSync(controlDir, { recursive: true, force: true });
      rmSync(offenderCwd, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
    }
  });
});
