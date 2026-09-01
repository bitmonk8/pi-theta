// H9a live acceptance — bug 0297: a subagent-mode theta whose `bind_context:`
// value is a YAML NON-SCALAR (a block sequence) REFUSES at load with
// theta/load/unknown-bind-context-value, while a well-formed SCALAR
// `bind_context:` subagent theta still REGISTERS and DRIVES a real turn
// — both proved END-TO-END through the real `pi -p` binary
// (docs/bugs/0297-bind-context-nonscalar-silently-registers.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// tests/b0297-bind-context-bind-model-nonscalar.test.ts pins the load
// disposition over the in-process production parser (`parseDoc`) and the
// binder-model resolver. This file spawns the real `pi` binary in print mode
// over its own throwaway discovery root and observes the outcomes through real
// extension auto-load, `--theta` discovery, the shipped composition root, and
// the interpreter — so the fix is proved through the same registration and
// drive channels an operator sees.
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
// WHY BOTH FIXTURES ARE SUBAGENT-MODE.
// The `theta/load/unknown-bind-context-value` refusal arm is MODE-INDEPENDENT:
// it fires for any present non-scalar `bind_context:` value whatever the
// `mode:` (the arm runs before the prompt-only session-context retention). The
// invoke-sentinel observation channel this file reuses (the b0298 precedent)
// requires a SUBAGENT callee — `invoke` refuses a prompt-mode callee with
// `theta/load/prompt-mode-callable`, which would make a prompt-mode offender
// resolve `Err` for the WRONG reason (a vacuous pass, independent of this fix)
// and leave a prompt-mode control non-invocable. So both fixtures are
// `mode: subagent`: the offender exercises the same mode-independent refusal,
// and the control is invocable and drives a real child turn.
//
// WHY THE CONTROL FLIPS ONLY THE NODE KIND.
// Offender and control carry the SAME `bind_context: none` value; the only
// variable flipped is the value's YAML node kind (the offender's block sequence
// vs. the control's scalar). A registered control returns 777 so the prober
// answers 877; a control the fix wrongly refused resolves `Err` → helper `0` →
// the prober answers 100 and the assertion reds. This proves the fix rejects
// the broken non-scalar shape WITHOUT breaking a correct scalar `bind_context:`.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, the control's compute-from-inline-value answer,
// and each run's exit code. Drive discriminators are ANSWERS to task questions
// (extract-the-last-word / compute-from-inline-value), NEVER verbatim-echo
// demands — current models read an echo demand as prompt injection and refuse
// it (bug 0243 / AGENTS.md).
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// each prober's `invoke` launches an RFC-0006 child. The shared harness
// supplies both pins at every spawn: `spawnPiPrint` sets
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

/** The registry code the fix pushes for a present non-scalar `bind_context:`. */
const CODE = "theta/load/unknown-bind-context-value";

/**
 * The offender: subagent-mode, `bind_context:` over a block SEQUENCE — a present
 * value that is neither `none` nor `session`. The refusal arm is
 * mode-independent, so it refuses at load with CODE and does not register. Its
 * body is a literal string carrying NO `@` query, so the pre-fix direction —
 * where it silently loads and `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: subagent",
  "bind_context:",
  "  - none",
  "---",
  '"B0297 OFFENDER BODY RAN"',
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
  'let r = invoke("./b0297offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0297 OFFENDER LOADED",',
  '  Err(e) => "B0297 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The matched-pair control: subagent-mode with a well-formed SCALAR
 * `bind_context: none` — the only variable flipped from the offender is the
 * value's node kind. It must register and drive, so the fix is proved to reject
 * the NON-SCALAR shape specifically and not a `bind_context:` field generally.
 * It drives a task-framed TYPED arithmetic query (returning an integer) so the
 * prober can carry the value back — untyped `invoke(...)` returns
 * `Result<null, …>` and discards the child value (invocation.md §Typed return),
 * so the control's final value crosses the boundary only under `invoke<integer>`.
 */
const CONTROL = [
  "---",
  "mode: subagent",
  "bind_context: none",
  "---",
  "let n: integer = @`What is 263 plus 514? Reply with the integer.`?",
  "n",
  "",
].join("\n");

/**
 * The control prober: prompt-mode; `invoke<integer>`s the scalar control (the
 * TYPED form, so the integer crosses the boundary) and computes over the
 * returned number (compute-from-inline-value, the b0307 pattern). A registered
 * control returns 777 so the prober answers 877; a control the fix wrongly
 * refused resolves `Err` → `d = 0` → the prober answers 100 and the assertion
 * reds.
 */
const CONTROL_PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let res = invoke<integer>("./b0297control.theta")',
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

describe("H9a live — bug 0297 non-scalar `bind_context:` load refusal through the real `pi -p`", () => {
  it("refuses the non-scalar-`bind_context:` theta, and still registers and drives the scalar-`bind_context:` control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is un-registered by exactly this fix's pushed
    // CODE and the control is clean and registers, so neither live sentinel can
    // be produced by an unrelated failure. RED at the pre-fix tree — the parser
    // narrowed the non-scalar `bind_context:` to the absent-default and the
    // offender loaded clean with `none`.
    expect(
      errorCodes(OFFENDER, "/proj/b0297offender.theta"),
      `attribution: the offender's non-scalar \`bind_context:\` must carry exactly ${CODE}`,
    ).toEqual([CODE]);
    expect(
      parseDoc(OFFENDER, "/proj/b0297offender.theta").frontmatter,
      "attribution: a refused theta does not register (frontmatter is null)",
    ).toBeNull();
    expect(
      errorCodes(CONTROL, "/proj/b0297control.theta"),
      "attribution: the scalar-`bind_context:` control carries no error and registers",
    ).toEqual([]);
    expect(
      parseDoc(CONTROL, "/proj/b0297control.theta").frontmatter,
      "attribution: the scalar-`bind_context:` control registers (frontmatter non-null)",
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
    const offenderDir = mkdtempSync(join(tmpdir(), "theta-b0297-off-"));
    const controlDir = mkdtempSync(join(tmpdir(), "theta-b0297-ctl-"));
    const offenderCwd = mkdtempSync(join(tmpdir(), "theta-b0297-cwd-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0297-cwd-"));
    try {
      writeFileSync(join(offenderDir, "b0297offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(offenderDir, "b0297offenderprobe.theta"), OFFENDER_PROBE, "utf8");
      writeFileSync(join(controlDir, "b0297control.theta"), CONTROL, "utf8");
      writeFileSync(join(controlDir, "b0297controlprobe.theta"), CONTROL_PROBE, "utf8");

      // ---- (1) the non-scalar-`bind_context:` offender is refused, via invoke ----
      const probe = await spawnPiPrint({
        thetaDir: offenderDir,
        slashInvocation: "/b0297offenderprobe",
        cwd: offenderCwd,
      });
      expect(
        probe.exitCode,
        `offender probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `offender probe: the non-scalar \`bind_context:\` theta must NOT load, so ` +
          `invoke("./b0297offender.theta") resolves Err(InvokeInfraError) and the ` +
          `match prints "${REFUSED}". Printing "${LOADED}" means a non-scalar ` +
          `\`bind_context:\` registered silently with the default \`none\` — bug 0297 ` +
          `unfixed. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `offender probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);

      // ---- (2) the scalar-`bind_context:` control registers and drives ----
      const control = await spawnPiPrint({
        thetaDir: controlDir,
        slashInvocation: "/b0297controlprobe",
        cwd: controlCwd,
      });
      expect(
        control.exitCode,
        `control probe: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
          `stderr: ${control.stderr}`,
      ).toBe(0);
      expect(
        control.stdout,
        `control probe: the scalar-\`bind_context:\` theta must register and DRIVE — ` +
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
