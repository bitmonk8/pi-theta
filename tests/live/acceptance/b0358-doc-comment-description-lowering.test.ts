// H9a live acceptance — bug 0358: a `///` doc comment above a `schema` / `enum`
// declaration or a schema FIELD is a placement-accepted anchor whose joined text
// must LOWER byte-for-byte into that anchor's JSON Schema `description:` key
// (descriptions.md §Multi-line / §No transformation), reaching the params schema,
// the binder envelope, and the typed-query respond schema. Pre-fix the
// join/strip/lower seam shipped as dead exports: every `$defs` fragment lowered
// with NO `description` key, silently, with zero diagnostics.
// (docs/bugs/0358-doc-comment-descriptions-never-lower.md)
//
// The settled fix is A1 + B1 + C: schema-DECL / enum-DECL / FIELD `///` lower;
// variant `///` and fn `///` are accepted-but-AST-only (the flat enum wire shape
// `{type:"string",enum:[…]}` has no per-value description slot). Descriptions
// enter the canonical schema hash (B1).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0358-doc-comment-descriptions-lower.test.ts` pins the lowered bytes off
// `parseDoc`'s `frontmatter.params.loweredSchema` over the in-process front end.
// This file spawns the real `pi` binary in print mode over its own throwaway
// discovery root and proves a described theta REGISTERS and DRIVES a real turn
// end-to-end — through real extension auto-load, `--theta` discovery, the shipped
// composition root, and the interpreter — so the metadata addition is proved
// through the same registration and drive channels an operator sees, not to break
// the real path.
//
// TWO PARTS:
//   (1) OFFLINE ATTRIBUTION GUARD (token-free, BEFORE the live host is required)
//       over the identical parse the composition root runs: a params-bearing
//       described twin lowers its schema-DECL description into
//       `$defs.ReviewRequest.description` and its field description into
//       `$defs.ReviewRequest.properties.language.description`. This is the
//       registered/binder-visible surface the model reads; it is RED at the fork
//       (both keys absent — the bug's silent-byte-absence symptom) and GREEN under
//       the fix. Reverting the fix reds this guard before any token is spent, so
//       the live drive below cannot be produced by an unrelated success.
//   (2) LIVE DRIVE: a no-params described prompt theta whose schema + field carry
//       `///` REGISTERS and drives its body, whose final turn is a fixed-pair
//       arithmetic query (263 + 514 = 777). `pi -p` prints only the final turn, so
//       a directly-driven subject is how register+drive is observed with a
//       task-framed arithmetic discriminator (AGENTS.md §"Assert on real
//       observables"; never a verbatim-echo demand — bug 0243). A no-params
//       subject avoids the orthogonal binder-model gate a `params:`-bearing prompt
//       theta additionally requires, so the drive stays attributable.
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
import { parseDoc, errors } from "../../helpers/e2e-s1";

/**
 * The LIVE SUBJECT: a `mode: prompt` theta whose schema carries a schema-DECL
 * `///` and a field `///` (the two lowering anchors this bug fixes). Post-fix it
 * registers and drives; its body query computes a fixed-pair arithmetic answer
 * (263 + 514 = 777) so a real turn is decidable when it loads and drives. No
 * `params:` — a `params:`-bearing prompt theta would additionally require a
 * resolvable binder model (an orthogonal gate).
 */
const SUBJECT = [
  "---",
  "mode: prompt",
  "---",
  "/// A user submitting a code review request",
  "schema ReviewRequest {",
  "  /// The programming language the code is written in",
  "  language: string,",
  "}",
  "",
  "@`What is 263 plus 514? Answer with the number only.`",
  "",
].join("\n");

/**
 * The OFFLINE TWIN: the identical described schema behind a `params:` reference,
 * so the lowered `$defs` surface the registered payload embeds is offline-visible
 * through the identical parse route the composition root runs. Never driven —
 * parsed only, token-free.
 */
const PARAMS_TWIN = [
  "---",
  "mode: prompt",
  "params:",
  "  req: ReviewRequest",
  "---",
  "/// A user submitting a code review request",
  "schema ReviewRequest {",
  "  /// The programming language the code is written in",
  "  language: string,",
  "}",
  "let x = 1",
  "x",
  "",
].join("\n");

const SUBJECT_ARITHMETIC = "777";
const SCHEMA_DECL_DESCRIPTION = "A user submitting a code review request";
const FIELD_DESCRIPTION = "The programming language the code is written in";

/** The lowered `$defs.ReviewRequest` fragment of the twin, failing loudly when absent. */
function reviewRequestFragment(): Record<string, unknown> {
  const doc = parseDoc(PARAMS_TWIN, "/proj/b0358twin.theta");
  const errorCodes = errors(doc.diagnostics).map((d) => d.code);
  if (errorCodes.length > 0) {
    failLoudly(
      `attribution precondition unmet: the described twin must parse clean; ` +
        `errors ${JSON.stringify(errorCodes)}`,
    );
  }
  const schema = doc.frontmatter?.params?.loweredSchema as
    | Record<string, unknown>
    | undefined;
  const defs = schema?.["$defs"] as Record<string, Record<string, unknown>> | undefined;
  const fragment = defs?.["ReviewRequest"];
  if (fragment === undefined) {
    failLoudly(
      "attribution precondition unmet: the twin must lower a $defs.ReviewRequest " +
        "fragment for its description slot to be reachable.",
    );
  }
  return fragment as Record<string, unknown>;
}

describe("H9a live — bug 0358 `///` description lowering through the real `pi -p`", () => {
  it("lowers the schema-DECL + field descriptions and drives the described theta end-to-end", async () => {
    // ---- (1) OFFLINE ATTRIBUTION GUARD (token-free, before the live host) ----
    // The registered/binder-visible surface carries both descriptions. RED at
    // the fork (both keys absent — silent byte absence, the bug's symptom);
    // GREEN under the fix. Reverting the fix reds this before any token is spent,
    // so the live drive below is non-vacuous in both directions.
    const fragment = reviewRequestFragment();
    expect(
      fragment["description"],
      `attribution: the schema-DECL \`///\` must lower into ` +
        `$defs.ReviewRequest.description; absent at the fork (bug 0358 unfixed).`,
    ).toBe(SCHEMA_DECL_DESCRIPTION);
    const properties = fragment["properties"] as
      | Record<string, Record<string, unknown>>
      | undefined;
    expect(
      properties?.["language"]?.["description"],
      `attribution: the field \`///\` must lower into ` +
        `$defs.ReviewRequest.properties.language.description; absent at the fork.`,
    ).toBe(FIELD_DESCRIPTION);

    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0358-root-"));
    const subjectCwd = mkdtempSync(join(tmpdir(), "theta-b0358-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0358subject.theta"), SUBJECT, "utf8");

      // ---- (2) the described subject registers AND drives ----
      const subject = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0358subject",
        cwd: subjectCwd,
      });
      expect(
        subject.exitCode,
        `subject: expected a no-error exit (0), got ${String(subject.exitCode)}. ` +
          `stderr: ${subject.stderr}`,
      ).toBe(0);
      expect(
        subject.stdout,
        `subject: the schema-DECL+field \`///\` theta must REGISTER (its anchors ` +
          `lower descriptions, they are not load blockers) and drive its body, whose ` +
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
