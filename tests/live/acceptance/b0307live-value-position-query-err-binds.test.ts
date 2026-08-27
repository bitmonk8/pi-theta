// H9a live acceptance — bug 0307: a value-position query failure
// (`let r = @`…``, no `?`) BINDS `Err(QueryError)` so the author's in-body
// `match r { Err(…) => recover }` handler runs and the theta CONTINUES, END-TO-END
// through the real `pi -p` binary
// (docs/bugs/0307-value-position-query-err-aborts-body-instead-of-binding.md).
//
// PARENT-RATIFIED ADJUDICATION. Handledness is judged AT CONSUMPTION per QRY-8:
// a query effect in ANY value position evaluates to a `Result` VALUE and never
// aborts at the effect site; the fail arm fires only for UNHANDLED errors
// (error-model.md:10). This file drives that adjudication through the real host.
//
// THE SHAPE. An INNER theta pins `tool_loop.max_rounds: 0` so its value-position
// query `let r = @`…`` fails deterministically with `tool_loop_exhausted` at
// ZERO provider turns (the bug's own confirmed probe fixture). Its body then
// recovers in-body via `match r { Err(_) => 42, Ok(_) => 0 }` and returns the
// recovered code. A PROBE theta (default `tool_loop`, so its OWN query drives a
// real turn) `invoke`s the inner theta, matches the invoke `Result`, and asks a
// task-framed arithmetic question over the recovered code:
//   - FIXED   — inner binds `Err`, recovers 42, returns Ok(42); the probe reads
//               42 and drives `42 + 100 = 142`.
//   - UNFIXED — inner's `let r = @…` aborts the whole body at the bind site; the
//               invoke resolves `Err`; the probe reads 0 and drives `0 + 100 = 100`.
// `142` on stdout is decidable ONLY if the value-position query Err was bound and
// the recovery arm ran — a plain-prompt degrade cannot fabricate it.
//
// WHY TWO THETAS. `tool_loop.max_rounds` is per-theta frontmatter: the failing
// query needs `max_rounds: 0` (deterministic zero-token exhaustion) while the
// observable driving query needs the default (≥ 1) to answer at all. `invoke`
// composes the two frontmatters; a prompt → prompt `invoke` suspends the parent
// and attaches the callee to the caller's session (invocation.md §Cross-mode
// semantics), so no RFC-0006 child process launches and no child pins are needed.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the probe's task-framed
// arithmetic answer on `pi -p` stdout, plus each run's exit code. The
// discriminator is an ANSWER to a question over the theta's own computed number,
// NEVER a verbatim-echo demand (bug 0243 / AGENTS.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT.
// `tests/b0307-value-position-query-err-binds.test.ts` /
// `tests/b0307-empty-template-parity.test.ts` pin the executor / effect-host
// disposition over the in-process production executor. This file spawns the real
// `pi` binary in print mode over its own throwaway discovery root and observes
// the outcome through real extension auto-load, `--theta` discovery, the shipped
// composition root, the real invoke trampoline, and a real driven turn — so the
// fix is proved through the same registration and drive channels an operator sees.
//
// SCOPE ISOLATION (bug 0030). Deliberately OUTSIDE the nine-area H9a manifest:
// adds no `FeatureArea`, touches no committed fixture, uses its own temp
// discovery root, and does NOT call `assertStderrClean` /
// `assertCodesSubsetOfPermitted`, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json`. Fix version placeholder: 0.298.0.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/**
 * The inner theta: its value-position query `let r = @`…`` fails with
 * `tool_loop_exhausted` at zero provider turns (`tool_loop.max_rounds: 0`,
 * `tools: read` — the bug's confirmed fixture). The in-body `match` recovers the
 * failure to the code `42` and returns it. The `Ok(_) => 77` arm is a fixture
 * tripwire: if the query ever stopped failing it would return 77, not 42, and
 * the probe's `142` assertion would red — so `142` proves the query FAILED and
 * its Err was BOUND (not that the query happened to succeed). FIXED ⇒ Ok(42);
 * UNFIXED ⇒ the `let` aborts the body and the theta terminates
 * Err(tool_loop_exhausted).
 */
const INNER = [
  "---",
  "mode: prompt",
  "tools: read",
  "tool_loop:",
  "  max_rounds: 0",
  "---",
  "let r = @`B0307 what is 2 plus 2?`",
  "let d = match r {",
  "  Err(_) => 42,",
  "  Ok(_) => 77",
  "}",
  "d",
  "",
].join("\n");

/**
 * The probe theta: default `tool_loop` (so its own query drives a real turn).
 * It `invoke<integer>`s the inner theta (the TYPED form — untyped `invoke(...)`
 * returns `Result<null, QueryError>` and discards the child's value per
 * invocation.md §Typed return, so the recovered integer must be carried through
 * a typed annotation), reads the recovered code from the invoke `Result`, and
 * asks a task-framed arithmetic question over it. FIXED ⇒ d = 42 ⇒ `142`;
 * UNFIXED ⇒ the inner aborts, invoke resolves Err ⇒ d = 55 ⇒ `155`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let res = invoke<integer>("./b0307inner.theta")',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 55",
  "}",
  "@`A recovery probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

/**
 * FIXED: the value-position query fails, its Err is bound, the in-body match
 * recovers 42, `invoke<integer>` carries it → `42 + 100 = 142`. UNFIXED: the
 * `let` aborts the inner body, invoke resolves Err, the probe's Err arm yields
 * 55 → `55 + 100 = 155`. (A fixture-drift query success would yield `77 + 100 =
 * 177`.) `142` is producible ONLY by the bound-and-recovered path.
 */
const FIXED_ANSWER = "142";
const UNFIXED_ANSWER = "155";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0307 value-position query Err binds & recovers through the real `pi -p`", () => {
  it("a let-bound query failure recovers in-body and the theta continues to a decidable arithmetic answer", async () => {
    // ATTRIBUTION GUARD (offline, token-free, BEFORE the live host is required):
    // both thetas parse clean, so `142` cannot be a parse-refusal artifact and
    // `100` cannot be a spurious registration failure — the only path to `142`
    // is the value-position query Err being bound and the recovery arm running.
    expect(
      parseErrorCodes(INNER, "/proj/b0307inner.theta"),
      "attribution: the inner theta (value-position query + in-body match) parses clean",
    ).toEqual([]);
    expect(
      parseErrorCodes(PROBE, "/proj/b0307probe.theta"),
      "attribution: the probe theta (invoke + task-framed query) parses clean",
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

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0307-root-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0307-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0307inner.theta"), INNER, "utf8");
      writeFileSync(join(thetaDir, "b0307probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0307probe",
        cwd: probeCwd,
      });

      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the inner theta's value-position query fails with ` +
          `tool_loop_exhausted; FIXED it BINDS the Err, the in-body match recovers ` +
          `code 42, the theta returns Ok(42), invoke<integer> carries 42, and the ` +
          `probe drives 42 + 100 = ${FIXED_ANSWER}. UNFIXED the let-init aborts the ` +
          `inner body, invoke resolves Err, d = 55 and the answer is ` +
          `${UNFIXED_ANSWER}. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(FIXED_ANSWER);
      // NOTE: no `.not.toContain(UNFIXED_ANSWER)` — the answer digits could recur
      // in a verbose model reply, so a prompt-echo could false-red
      // it. `142` is producible ONLY by the fix (it is absent from the prompt),
      // so the positive assertion is the sound, sufficient discriminator.
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
