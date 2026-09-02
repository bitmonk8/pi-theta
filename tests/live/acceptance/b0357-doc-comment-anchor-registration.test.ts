// H9a live acceptance — bug 0357: a `///` doc comment above a schema FIELD, an
// enum VARIANT, or a `subagent fn` is one of the five eligible anchors
// (descriptions.md §Placement; grammar.md §`///` placement), yet the pre-fix
// `scanDocComments` classified the anchor by the next line's leading WORD
// against only `schema`/`enum`/`fn`, so a field/variant `///` drew
// `theta/parse/doc-comment-misplaced` (E) and the theta failed to register.
// (docs/bugs/0357-doc-comment-field-variant-anchors-refused.md)
//
// This file proves the registration OUTCOME flip END-TO-END through the real
// `pi -p` binary: a theta whose schema carries a field `///` and whose enum
// carries a variant `///` must REGISTER and drive a real turn.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0357-doc-comment-field-variant-anchors.test.ts` pins the parse
// diagnostics (`parseDoc`) and the registration count
// (`discoverAndComposeFixtures`) over the in-process front end. This file spawns
// the real `pi` binary in print mode over its own throwaway discovery root and
// observes registration through real extension auto-load, `--theta` discovery,
// the shipped composition root, and the interpreter — so the fix is proved
// through the same registration and drive channels an operator sees.
//
// TWO INVOCATIONS, mirroring the b0332 control+probe shape:
//   (a) the SUBJECT driven DIRECTLY (`/b0357subject`) — post-fix it registers
//       and its body's compute-from-inline query is the FINAL turn, so its
//       arithmetic answer (263 + 514 = 777) lands on `pi -p` stdout. `pi -p`
//       prints only the final turn, so a directly-driven subject is how the
//       register+drive is observed with an arithmetic discriminator.
//   (b) the SUBJECT invoked by a PROBER (`/b0357prober`) — the registration
//       disposition as a decidable sentinel. invocation.md §Static resolution:
//       a literal `invoke(...)` whose callee fails its structural checks surfaces
//       at runtime as `Err(InvokeInfraError)`; a `match` over that Result turns
//       the refusal into a POSITIVE sentinel (REFUSED) and a success into LOADED,
//       so the assertion reds by printing the opposite sentinel, not by printing
//       nothing (the b0304 / b0314 / b0332 pattern). Parse diagnostics route to
//       the `theta-system-note` channel, which is NOT streamed to `pi -p` text
//       stdout, so the sentinel — not a printed diagnostic — is the observable.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the subject's
// task-framed arithmetic answer on stdout (direct drive), the committed
// registration sentinel (prober), and each run's exit code. Discriminators are
// ANSWERS to task questions (fixed-pair arithmetic / extract-the-last-word),
// NEVER verbatim-echo demands — current models read an echo demand as prompt
// injection and refuse it (bug 0243 / AGENTS.md).
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// NOT required here. All thetas are `mode: prompt`, and a prompt→prompt `invoke`
// suspends the parent and attaches the callee to the caller's existing session
// (no RFC-0006 child process is launched); a direct drive spawns no child. The
// pins are supplied anyway by the
// shared harness (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN` and the
// outer process carries `-ne -e <this tree's extensions>`), so the file is
// correct either way.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the committed fixtures
// under `./fixtures`, and uses its own temp discovery root. It does NOT call
// `assertStderrClean` and does NOT call `assertCodesSubsetOfPermitted`, so it
// needs NO entry in `tests/fixtures/h7a/permitted-codes.json` — the doc-comment
// verdict fires on these crafted fixtures only, never on a committed fixture.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc, errors } from "../../helpers/e2e-s1";

/** The registry code the pre-fix leading-word sniff drew on a field/variant `///`. */
const DOC_COMMENT_MISPLACED = "theta/parse/doc-comment-misplaced";

/**
 * The SUBJECT: a `mode: prompt` theta whose schema carries a field `///` and
 * whose enum carries a variant `///` — the two body-interior anchors the pre-fix
 * sniff refused. Post-fix it registers; its body query computes a fixed-pair
 * arithmetic answer (263 + 514 = 777) so a real turn is decidable when the
 * subject loads and drives. No `params:` — a `params:`-bearing prompt theta would
 * additionally require a resolvable binder model (an orthogonal gate), so the
 * registration flip stays attributable to the doc-comment verdict alone.
 */
const SUBJECT = [
  "---",
  "mode: prompt",
  "---",
  "schema ReviewRequest {",
  "  /// The programming language the code is written in",
  "  language: string,",
  "}",
  "",
  "enum Severity {",
  "  /// Trivial issues; no immediate action needed",
  "  Low,",
  "  Medium,",
  "}",
  "",
  "@`What is 263 plus 514? Answer with the number only.`",
  "",
].join("\n");

/**
 * The PROBER: well-formed, registers either way, and converts the subject's
 * registration disposition into one of two committed sentinels through a `match`
 * over the untyped `invoke`'s `Result`. When the subject is registered the
 * `invoke` resolves `Ok` and drives the subject's own arithmetic turn in this
 * session before the prober asks its own question.
 */
const PROBER = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0357subject.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0357 SUBJECT LOADED",',
  '  Err(e) => "B0357 SUBJECT REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

// Task-framed answers, never verbatim-echo demands (AGENTS.md §"Assert on real
// observables").
const LOADED = "LOADED";
const REFUSED = "REFUSED";
const SUBJECT_ARITHMETIC = "777";

/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return errors(parseDoc(thetaText, thetaPath).diagnostics)
    .map((d) => d.code)
    .sort();
}

describe("H9a live — bug 0357 field/variant doc-comment registration through the real `pi -p`", () => {
  it("registers the field+variant `///` theta and drives its turn end-to-end", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): with the fix, the subject's field `///` and variant `///` draw
    // NO `doc-comment-misplaced`, so its registration is enabled by exactly this
    // fix — the live sentinel cannot be produced by an unrelated success. The
    // paired offline witness (b0357-doc-comment-field-variant-anchors) proved the
    // fork RED: the same anchors drew four `doc-comment-misplaced` and composed
    // zero runnables. If this fix is reverted, the subject reds here again, the
    // `invoke` resolves `Err`, and the prober prints REFUSED — so the live
    // assertion is non-vacuous in both directions.
    expect(
      parseErrorCodes(SUBJECT, "/proj/b0357subject.theta"),
      "attribution: with the fix the subject's field/variant `///` must draw no " +
        `${DOC_COMMENT_MISPLACED}`,
    ).not.toContain(DOC_COMMENT_MISPLACED);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0357-root-"));
    const subjectCwd = mkdtempSync(join(tmpdir(), "theta-b0357-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0357-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0357subject.theta"), SUBJECT, "utf8");
      writeFileSync(join(thetaDir, "b0357prober.theta"), PROBER, "utf8");

      // ---- (a) the field+variant `///` subject registers AND drives ----
      const subject = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0357subject",
        cwd: subjectCwd,
      });
      expect(
        subject.exitCode,
        `subject: expected a no-error exit (0), got ${String(subject.exitCode)}. ` +
          `stderr: ${subject.stderr}`,
      ).toBe(0);
      expect(
        subject.stdout,
        `subject: the field+variant \`///\` theta must REGISTER (its anchors are ` +
          `legal) and drive its body, whose final turn computes 263 + 514 = ` +
          `${SUBJECT_ARITHMETIC}. A refused (un-registered) subject cannot drive, so ` +
          `${SUBJECT_ARITHMETIC} would be absent — bug 0357 unfixed. stdout: ` +
          `${subject.stdout} stderr: ${subject.stderr}`,
      ).toContain(SUBJECT_ARITHMETIC);

      // ---- (b) the registration disposition as a decidable sentinel ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0357prober",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the field+variant \`///\` subject must REGISTER (its anchors are ` +
          `legal), so the prober's invoke("./b0357subject.theta") resolves Ok and the ` +
          `match prints "${LOADED}". Printing "${REFUSED}" means the doc-comment ` +
          `verdict un-registered the subject — bug 0357 unfixed. stdout: ${probe.stdout} ` +
          `stderr: ${probe.stderr}`,
      ).toContain(LOADED);
      expect(
        probe.stdout,
        `probe: the Err arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(REFUSED);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(subjectCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
