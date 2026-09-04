// H9a live acceptance — bug 0411: `scanDocComments` line-scanned the body with
// no `@`...`` template awareness, so a prose line beginning `///` INSIDE a query
// template was misread as a doc-comment run. Two arms, one root cause:
//   (a) a `///`-led line inside a template refused the theta with
//       `theta/parse/doc-comment-misplaced` — a valid-input LOAD REFUSAL of prose
//       that lexical.md:24 says is rendered prompt, not a comment;
//   (b) a template ending in a `///`-led closing line silently injected its prose
//       into the following schema's lowered `description:` (wire-visible post-0358).
// (docs/bugs/0411-doc-comment-scan-reads-template-prose.md)
//
// The settled §Fix (option 1) builds a template-line exclusion set from the
// lexer's backtick puncts at the `scanDocComments` call site and skips those
// lines in both the run-formation scan and the anchor-line scan.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0411-doc-comment-template-prose.test.ts` pins the refusal-absence and
// the schema `description` off `parseDoc` over the in-process front end. This
// file spawns the real `pi` binary in print mode over its own throwaway
// discovery root and proves that arm (a)'s registration OUTCOME genuinely
// flipped — a template-prose theta that PRE-FIX refused registration now
// REGISTERS and DRIVES a real turn end-to-end, through real extension auto-load,
// `--theta` discovery, the shipped composition root, and the interpreter. This
// is owed because arm (a) changes a committable valid input's load outcome from
// refuse→register (LANE-BRIEF live obligation).
//
// TWO PARTS:
//   (1) OFFLINE ATTRIBUTION GUARDS (token-free, BEFORE the live host is required)
//       over the identical parse the composition root runs:
//         A — the SUBJECT's template-prose `///` line draws NO
//             `theta/parse/doc-comment-misplaced` and the theta loads clean.
//             RED at the fork (the refusal fires — arm (a)), GREEN under the fix.
//         B — an injection twin (a template closing on a `///`-led line, then a
//             `schema S`) leaves `S` with NO description. RED at the fork
//             (`S.description === "injected description\`"` — arm (b)), GREEN under
//             the fix. Reverting the fix reds these before any token is spent, so
//             the live drive below is non-vacuous in both directions.
//   (2) LIVE DRIVE: the SUBJECT — a `mode: prompt` theta whose query template body
//       contains a `///`-led prose line — REGISTERS and drives its body, whose
//       final turn is a fixed-pair arithmetic query (263 + 514 = 777). `pi -p`
//       prints only the final turn, so a directly-driven subject is how
//       register+drive is observed with a task-framed arithmetic discriminator
//       (AGENTS.md §"Assert on real observables"; never a verbatim-echo demand —
//       bug 0243). A no-`params:` subject avoids the orthogonal binder-model gate.
//
// SUBAGENT CHILD PINS: NOT required (the subject is `mode: prompt`, directly
// driven, spawning no RFC-0006 child); the shared harness supplies them anyway.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area H9a
// manifest: it adds no `FeatureArea`, touches none of the committed fixtures under
// `./fixtures`, and uses its own temp discovery root. It does NOT call
// `assertStderrClean` or `assertCodesSubsetOfPermitted`, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json` — no registered code changes and no
// committed fixture is exercised.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc, errors, hasCode } from "../../helpers/e2e-s1";

/**
 * The LIVE SUBJECT: a `mode: prompt` theta whose query template body contains a
 * `///`-led prose line (`/// keep the answer short`). Per lexical.md:24 that line
 * is rendered prompt text, not a doc comment; pre-fix it drew
 * `theta/parse/doc-comment-misplaced` and refused registration. Post-fix it
 * registers and drives; the final turn computes a fixed-pair arithmetic answer
 * (263 + 514 = 777), decidable when it loads and drives.
 */
const SUBJECT = [
  "---",
  "mode: prompt",
  "---",
  "@`Guidelines:",
  "/// keep the answer short",
  "What is 263 plus 514? Answer with the number only.`",
  "",
].join("\n");

/**
 * The OFFLINE INJECTION TWIN (arm b): a template that closes on a `///`-led line,
 * immediately followed by a `schema S`. Pre-fix the closing prose line lowered
 * into `S.description`; post-fix `S` carries none. Never driven — parsed only,
 * token-free.
 */
const INJECTION_TWIN = [
  "---",
  "mode: prompt",
  "---",
  "let q = @`",
  "/// injected description`",
  "schema S {",
  "  a: integer,",
  "}",
  "q",
  "",
].join("\n");

const SUBJECT_ARITHMETIC = "777";

/** The `S` schema decl of the injection twin, failing loudly when absent. */
function injectionTwinSchemaDescription(): string | undefined {
  const doc = parseDoc(INJECTION_TWIN, "/proj/b0411twin.theta");
  if (hasCode(doc.diagnostics, "theta/parse/doc-comment-misplaced")) {
    failLoudly(
      "attribution precondition unmet: the injection twin must not draw " +
        "theta/parse/doc-comment-misplaced (arm b loads clean under the fix).",
    );
  }
  const schema = doc.body.statements.find(
    (s) => s.kind === "schema" && s.name === "S",
  );
  if (schema === undefined) {
    failLoudly(
      "attribution precondition unmet: the injection twin must parse a `schema S` " +
        "decl for its description slot to be observable.",
    );
  }
  return (schema as { description?: string }).description;
}

describe("H9a live — bug 0411 template-prose `///` registers through the real `pi -p`", () => {
  it("registers and drives a theta whose template contains a `///` prose line, injecting no schema description", async () => {
    // ---- (1) OFFLINE ATTRIBUTION GUARDS (token-free, before the live host) ----
    // Guard A (arm a): the SUBJECT's in-template `///` draws no misplaced refusal
    // and the theta loads clean. RED at the fork (the refusal fires); GREEN under
    // the fix — so a failed registration below cannot be an unrelated red.
    const subjectDoc = parseDoc(SUBJECT, "/proj/b0411subject.theta");
    expect(
      hasCode(subjectDoc.diagnostics, "theta/parse/doc-comment-misplaced"),
      "attribution (arm a): a `///` line inside a query template is rendered " +
        "prompt (lexical.md:24), not a doc comment — it must NOT draw " +
        "theta/parse/doc-comment-misplaced; the refusal fires at the fork (bug 0411 unfixed).",
    ).toBe(false);
    expect(
      errors(subjectDoc.diagnostics).map((d) => d.code),
      "attribution (arm a): the template-prose subject must load with zero " +
        "error-severity diagnostics.",
    ).toEqual([]);

    // Guard B (arm b): the injection twin's trailing template `///` must not lower
    // into the following schema's description. RED at the fork (the injected prose
    // is the value); GREEN under the fix (undefined).
    expect(
      injectionTwinSchemaDescription(),
      "attribution (arm b): a template closing on a `///`-led line must NOT inject " +
        "its prose into the next schema's lowered description; the injected value " +
        "is present at the fork (bug 0411 unfixed).",
    ).toBeUndefined();

    // Live-host precondition — fails loudly naming the unmet precondition; never a
    // skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0411-root-"));
    const subjectCwd = mkdtempSync(join(tmpdir(), "theta-b0411-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0411subject.theta"), SUBJECT, "utf8");

      // ---- (2) the template-prose subject registers AND drives ----
      const subject = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0411subject",
        cwd: subjectCwd,
      });
      expect(
        subject.exitCode,
        `subject: expected a no-error exit (0), got ${String(subject.exitCode)}. ` +
          `stderr: ${subject.stderr}`,
      ).toBe(0);
      expect(
        subject.stdout,
        `subject: the template-prose \`///\` theta must REGISTER (the in-template ` +
          `line is rendered prompt, not a load blocker) and drive its body, whose ` +
          `final turn computes 263 + 514 = ${SUBJECT_ARITHMETIC}. A theta that failed ` +
          `to register or drive would omit ${SUBJECT_ARITHMETIC}. stdout: ` +
          `${subject.stdout} stderr: ${subject.stderr}`,
      ).toContain(SUBJECT_ARITHMETIC);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(subjectCwd, { recursive: true, force: true });
    }
  });
});
