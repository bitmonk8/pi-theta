// H9a live acceptance — bug 0351: a value-position query SUCCESS
// (`let r = @<T>`…``, no `?`) BINDS `Ok(payload)` so the author's in-body
// `match r { Ok(v) => …, Err(_) => … }` handler takes the `Ok` arm and the
// theta CONTINUES, END-TO-END through the real `pi -p` binary
// (docs/bugs/0351-value-position-query-success-binds-raw-payload.md).
//
// PARENT-RATIFIED ADJUDICATION (bug 0307, carried to the success half). A query
// effect in ANY value position evaluates to a `Result` VALUE (QRY-8 /
// query-forms.md); handledness is judged AT CONSUMPTION. 0307 fixed the FAILURE
// half of this arm; 0351 makes the SUCCESS half symmetric: a succeeding
// value-position query binds `Ok(payload)`, not the raw payload. This file
// drives the success half through the real host — the mirror of
// b0307live-value-position-query-err-binds.
//
// THE SHAPE. An INNER theta runs a TYPED value-position query
// `let r = @<{ code: integer }>`…`` that SUCCEEDS (the model sets the field to a
// literal). Its body then consumes the binding in-body via
// `match r { Ok(v) => v.code, Err(_) => 55 }` and returns the recovered code:
//   - FIXED   — the query binds `Ok({code: 42})`, the `Ok(v)` arm reads 42, the
//               theta returns Ok(42).
//   - UNFIXED — the query binds the RAW `{code: 42}`, which matches neither ctor
//               → `MatchError` panic → the whole inner body aborts (the bug's
//               fixture-1 symptom).
// A PROBE theta `invoke<integer>`s the inner theta, matches the invoke `Result`,
// and asks a task-framed arithmetic question over the recovered code (a
// compute-from-inline-value discriminator over the theta-carried value):
//   - FIXED   — inner returns Ok(42); the probe reads 42 and drives
//               `42 + 100 = 142`.
//   - UNFIXED — inner aborts; the invoke resolves Err; the probe reads 55 and
//               drives `55 + 100 = 155`.
// `142` on stdout is decidable ONLY if the value-position query SUCCESS was
// bound as `Ok(payload)` and the `Ok` arm ran — a plain-prompt degrade or a
// MatchError abort cannot fabricate it.
//
// WHY INVOKE COMPOSES TWO THETAS. A prompt → prompt `invoke` suspends the
// parent and attaches the callee to the caller's session (invocation.md
// §Cross-mode semantics), so no RFC-0006 child process launches and no child
// pins are needed. `invoke<integer>` is the TYPED form — untyped `invoke(...)`
// returns `Result<null, QueryError>` and discards the child's value
// (invocation.md §Typed return), so the recovered integer is carried through a
// typed annotation.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the probe's task-framed
// arithmetic answer on `pi -p` stdout, plus each run's exit code. The
// discriminator is an ANSWER to a question over the theta's own computed number,
// NEVER a verbatim-echo demand (bug 0243 / AGENTS.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT.
// `tests/b0351-value-position-query-success-binds-ok.test.ts` pins the executor
// disposition over the in-process production executor. This file spawns the real
// `pi` binary in print mode over its own throwaway discovery root and observes
// the outcome through real extension auto-load, `--theta` discovery, the shipped
// composition root, the real invoke trampoline, and real driven turns — so the
// fix is proved through the same registration and drive channels an operator
// sees.
//
// SCOPE ISOLATION (bug 0030). Deliberately OUTSIDE the nine-area H9a manifest:
// adds no `FeatureArea`, touches no committed fixture, uses its own temp
// discovery root, and does NOT call `assertStderrClean` /
// `assertCodesSubsetOfPermitted`, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json`. Fix version placeholder: 0.351.0.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/**
 * The inner theta: its value-position query
 * `let r = @<{ code: integer }>`…`` SUCCEEDS (the model sets the field to the
 * literal 42). The in-body `match` reads the code from the `Ok` arm and returns
 * it. FIXED ⇒ the query binds `Ok({code: 42})`, the `Ok(v)` arm yields 42, the
 * theta returns Ok(42). UNFIXED ⇒ the query binds the RAW `{code: 42}`, the
 * `match` matches no ctor → `MatchError` panic → the inner body aborts and the
 * theta terminates Err.
 */
const INNER = [
  "---",
  "mode: prompt",
  "---",
  'let r = @<{ code: integer }>`Set the field "code" to the number 42.`',
  "let d = match r {",
  "  Ok(v) => v.code,",
  "  Err(_) => 55",
  "}",
  "d",
  "",
].join("\n");

/**
 * The probe theta: default `tool_loop` (so its own query drives a real turn).
 * It `invoke<integer>`s the inner theta, reads the recovered code from the
 * invoke `Result`, and asks a task-framed arithmetic question over it. FIXED ⇒
 * d = 42 ⇒ `142`; UNFIXED ⇒ the inner aborts, invoke resolves Err ⇒ d = 55 ⇒
 * `155`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let res = invoke<integer>("./b0351inner.theta")',
  "let d = match res {",
  "  Ok(v) => v,",
  "  Err(e) => 55",
  "}",
  "@`A binding probe finished with code ${d}. What is ${d} plus 100? Answer with the number only.`",
  "",
].join("\n");

/**
 * FIXED: the value-position query succeeds, its payload is bound `Ok({code:42})`,
 * the in-body `Ok(v)` arm reads 42, `invoke<integer>` carries it → `42 + 100 =
 * 142`. UNFIXED: the raw payload matches no ctor, the inner body aborts
 * `MatchError`, invoke resolves Err, the probe's Err arm yields 55 → `55 + 100 =
 * 155`. `142` is producible ONLY by the bound-Ok-and-consumed path.
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

describe("H9a live — bug 0351 value-position query success binds Ok & the Ok arm runs through the real `pi -p`", () => {
  it("a let-bound query success is consumed by an in-body Ok/Err match and the theta drives a decidable arithmetic answer", async () => {
    // ATTRIBUTION GUARD (offline, token-free, BEFORE the live host is required):
    // both thetas parse clean, so `142` cannot be a parse-refusal artifact and
    // `100` cannot be a spurious registration failure — the only path to `142`
    // is the value-position query success being bound `Ok(payload)` and the `Ok`
    // arm running.
    expect(
      parseErrorCodes(INNER, "/proj/b0351inner.theta"),
      "attribution: the inner theta (value-position typed query + in-body match) parses clean",
    ).toEqual([]);
    expect(
      parseErrorCodes(PROBE, "/proj/b0351probe.theta"),
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

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0351-root-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0351-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0351inner.theta"), INNER, "utf8");
      writeFileSync(join(thetaDir, "b0351probe.theta"), PROBE, "utf8");

      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0351probe",
        cwd: probeCwd,
      });

      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the inner theta's value-position query succeeds; FIXED it BINDS ` +
          `Ok({code:42}), the in-body Ok(v) arm reads 42, the theta returns ` +
          `Ok(42), invoke<integer> carries 42, and the probe drives ` +
          `42 + 100 = ${FIXED_ANSWER}. UNFIXED the raw payload matches no ctor, ` +
          `the inner body aborts MatchError, invoke resolves Err, d = 55 and the ` +
          `answer is ${UNFIXED_ANSWER}. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(FIXED_ANSWER);
      // NOTE: no `.not.toContain(UNFIXED_ANSWER)` — the answer digits could recur
      // in a verbose model reply, so a prompt-echo could false-red it. `142` is
      // producible ONLY by the fix (it is absent from the prompt), so the
      // positive assertion is the sound, sufficient discriminator.
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
