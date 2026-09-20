// H9a live acceptance — bug 0466: aliasing a `.thetalib` import to the SOURCE
// name of one of its own same-lib transitive dependencies
// (`import { ReviewSummary as Detail }` where `ReviewSummary` itself declares
// `detail: Detail` against a same-lib `schema Detail`) refuses END-TO-END
// through the real `pi -p` binary
// (docs/bugs/0466-imported-alias-shadows-sibling-defs-collision.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0466-imported-alias-shadows-sibling.test.ts` and cell F1-a of
// `tests/b0465-imported-annotation-vacuous-validation.test.ts` pin the fix at
// the `collectImportedTypeDecls` / `checkThetaImports` boundary over an
// in-memory `FileSystem` double. Neither runs the SHIPPED extension inside a
// real host. This file spawns the real `pi` binary in print mode over its own
// throwaway discovery root and observes the refusal through real extension
// auto-load, `--theta` discovery, the shipped composition root, and the
// interpreter — proving the fix un-registers the IMPORTING theta through the
// same registration channel the operator sees.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC.
// On the shipped `session_start` path load diagnostics route to the
// `theta-system-note` channel, whose renderer output is NOT streamed to `pi -p`
// print-mode text stdout (the same constraint b0333live's/b0334live's/
// b0335live's sibling cells document). So the diagnostic text is not an
// available black-box observable. invocation.md §Static resolution: a literal
// `invoke(...)` whose callee fails its own structural checks surfaces at
// runtime as `Err(InvokeInfraError)`; a `match` over that Result turns the
// refusal into a POSITIVE, deterministic sentinel on stdout — the assertion
// reds by printing the opposite sentinel, not by printing nothing.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, plus each run's exit code. Neither assertion
// can pass on a promise merely resolving: the offending theta's disposition
// decides WHICH of two sentinels the prober's single turn prints. The drive
// discriminators are ANSWERS to task questions over theta-computed text
// (extract-the-last-word / number-plus-100), never a verbatim-echo demand.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// NOT required here. All thetas are `mode: prompt`, and a prompt → prompt
// `invoke` suspends the parent and attaches the callee to the caller's
// existing session (invocation.md §Cross-mode semantics) — no RFC-0006 child
// process is launched. The pins are supplied anyway by the shared harness
// (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN` and the outer process
// carries `-ne -e <this tree's extensions>`), so the file is correct either
// way.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the nine committed
// fixtures under `./fixtures`, and uses its own temp discovery root. It does
// not call `assertStderrClean` or `assertCodesSubsetOfPermitted`, so it needs
// NO entry in `tests/fixtures/h7a/permitted-codes.json`.
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each. The
// offender's own body carries no query, so the pre-fix direction — where it
// loads and `invoke` runs it — spends no extra model turn.
//
// FIX: bug 0466 §Fix Option 2 — mints the NEW load-time error
// `theta/load/imported-type-name-collision` and un-registers the theta.

import { describe, expect, it } from "vitest";
import { driveAcceptanceSequence } from "../../helpers/acceptance-sequence-harness";
import { importCheckCodes } from "../../helpers/thetalib-load-harness";

/** The bug 0466 §Fix Option 2 diagnostic. */
const CODE = "theta/load/imported-type-name-collision";

/**
 * The offending theta: aliases `ReviewSummary` to `Detail`, which collides
 * with the same-lib sibling `schema Detail` that `ReviewSummary` itself
 * transitively references. Its body carries NO query, so the pre-fix
 * direction — where it loads and `invoke` runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'import { ReviewSummary as Detail } from "./b0466quality.thetalib"',
  '"B0466 OFFENDER BODY RAN"',
  "",
].join("\n");

/** The shared lib (doc §Reproduction fixture verbatim): a same-lib sibling collision closure. */
const OFFENDER_LIB = [
  "schema Detail { count: integer }",
  "schema ReviewSummary { shard: string, detail: Detail }",
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./b0466offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B0466 OFFENDER LOADED",',
  '  Err(e) => "B0466 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The control: the doc §Reproduction control — an alias that does NOT equal
 * any same-lib sibling source name — imports the same lib and registers and
 * drives arithmetic, proving the fix rejects the alias-vs-sibling collision
 * specifically and not the mere presence of a same-lib transitive closure.
 * The query is over a theta-computed number so a degraded plain-prompt run
 * cannot fabricate it.
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  'import { ReviewSummary as Summary } from "./b0466quality.thetalib"',
  "fn extent(x: integer): integer { x + 1 }",
  "let n = extent(941)",
  "@`A probe computed a number: ${n}. What is that number plus 100? Answer with the number only.`",
  "",
].join("\n");

const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "1042";

describe("H9a live — bug 0466 imported-alias-shadows-sibling load refusal through the real `pi -p`", () => {
  it("refuses the theta whose alias collides with a same-lib sibling, and still registers and drives the well-formed control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender's un-registration is attributable to EXACTLY
    // this fix's `theta/load/imported-type-name-collision` refusal, and the
    // control is clean, so neither live sentinel below can be produced by an
    // unrelated load failure.
    expect(
      await importCheckCodes(OFFENDER, "/proj/b0466offender.theta", {
        "/proj/b0466quality.thetalib": OFFENDER_LIB,
      }),
      `attribution: the offender's alias 'Detail' collides with the same-lib sibling ` +
        `'schema Detail' reached through ReviewSummary's own field (bug 0466 §Fix Option 2), ` +
        `so the load pass must carry exactly ${CODE}`,
    ).toEqual([CODE]);
    expect(
      await importCheckCodes(CONTROL, "/proj/b0466control.theta", {
        "/proj/b0466quality.thetalib": OFFENDER_LIB,
      }),
      "attribution: the control's alias 'Summary' collides with nothing, so its load pass is clean",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    await driveAcceptanceSequence({
      slug: "b0466",
      files: {
        // All fixture files land in the temp discovery root together: the
        // offender and its lib; the probe; the control (shares the same lib).
        "b0466offender.theta": OFFENDER,
        "b0466quality.thetalib": OFFENDER_LIB,
        "b0466probe.theta": PROBE,
        "b0466control.theta": CONTROL,
      },
      drives: [
        // ---- (1) the well-formed control registers and drives a real turn ----
        {
          label: "control",
          slashInvocation: "/b0466control",
          expected: CONTROL_OK,
          message: (control) =>
            `control: the temp discovery root must register and DRIVE the well-formed ` +
              `non-collision-alias theta — without this the refusal assertion below could pass ` +
              `vacuously (wrong root, no registration at all). stdout: ${control.stdout} ` +
              `stderr: ${control.stderr}`,
        },

        // ---- (2) the offending theta is refused, observed through invoke ----
        {
          label: "probe",
          slashInvocation: "/b0466probe",
          expected: REFUSED,
          unexpected: LOADED,
          message: (probe) =>
            `probe: the offending theta must NOT load, so the prober's ` +
              `invoke("./b0466offender.theta") resolves Err(InvokeInfraError) and the ` +
              `match prints "${REFUSED}". Printing "${LOADED}" means the alias-vs-sibling ` +
              `collision loaded clean — bug 0466 unfixed. ` +
              `stdout: ${probe.stdout} stderr: ${probe.stderr}`,
        },
      ],
    });
  });
});
