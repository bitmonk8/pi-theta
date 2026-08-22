// H9a live acceptance — bug 0025: an object constructor naming an undeclared
// schema refuses the theta END-TO-END through the real `pi -p` binary
// (docs/bugs/0025-ctor-unresolved-schema-name-passthrough.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/ctor-unresolved-schema-name.test.ts` pins the diagnostic at the
// `parseThetaDocument` boundary and the drop at the `discoverAndComposeFixtures`
// helper boundary (an in-process `ExtensionContext` double). Neither runs the
// SHIPPED extension inside a real host. This file spawns the real `pi` binary in
// print mode over its own throwaway discovery root and observes the refusal
// through real extension auto-load, `--theta` discovery, the shipped composition
// root, and the interpreter.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, AND NOT AS A PRINTED
// DIAGNOSTIC — MEASURED, NOT ASSUMED.
// Three observation channels were probed against a live host before this file
// was written:
//   1. The drop's own `theta/parse/unresolved-named-type` diagnostic. On the
//      shipped `session_start` path load diagnostics route to the
//      `theta-system-note` channel, and custom system-note renderer output is
//      NOT streamed to `pi -p` print-mode text stdout (DOC-73 / FIND-S7-4 / D2 —
//      the same constraint that stops H9a area (d) asserting its `bind_echo`
//      note on stdout). MEASURED: a `pi -p` run over a root containing the
//      offending theta captured the control's reply on stdout and ZERO bytes on
//      stderr. The `makeLoadEmit` stderr mirror
//      (`src/extension/production-composition.ts:207`) is the HELPER path's
//      router, not this one. So the diagnostic text is not an available
//      black-box observable.
//   2. Invoking the refused slash directly (`pi -p "/b25offender"`). MEASURED:
//      an unregistered slash makes `pi -p` hang with zero bytes on both streams,
//      and a control probe with a name no extension has ever registered
//      (`/zzz-no-such-command-zzz`) hangs identically — a host-level behaviour
//      of unknown slashes in print mode, unrelated to this bug. Asserting a hang
//      would be asserting that behaviour, not this fix, and yields no capture.
//   3. `invoke("./<offender>.theta")` from a well-formed prober theta — the
//      channel this file uses. invocation.md §Static resolution: a literal
//      `invoke(...)` whose callee "fails to parse, or fails its own structural
//      checks" is warning-severity at the PARENT (the parent registers, static
//      checks against the callee are skipped, "the runtime AJV check is the
//      safety net"), and the failure surfaces at runtime as
//      `Err(InvokeInfraError)` (invocation.md §QueryError variants). A `match`
//      over that Result turns the refusal into a POSITIVE, deterministic
//      sentinel on stdout — the assertion reds by printing the opposite
//      sentinel, not by printing nothing.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables"): the two committed
// sentinels on `pi -p` stdout, plus each run's exit code. Neither assertion can
// pass on a promise merely resolving: the offending theta's disposition decides
// WHICH of two sentinels the prober's single turn prints.
//
// ATTRIBUTION. The offline guard below parses all three sources through
// `parseThetaDocument` and pins the offender's diagnostic list to EXACTLY
// `[theta/parse/unresolved-named-type]` and the prober's and control's to `[]`,
// so `B25 OFFENDER REFUSED` can only be caused by this fix — never by an
// unrelated drop (a `mode:` typo, an unreadable file, a stray parse error).
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins"):
// NOT required here, and confirmed so. All three thetas are `mode: prompt`, and
// a prompt → prompt `invoke` suspends the parent and attaches the callee to the
// caller's existing session (invocation.md §Cross-mode semantics) — no RFC-0006
// child process is launched on this path. The pins are supplied anyway by the
// shared harness (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN`, and the
// outer process carries `-ne -e <this tree's extensions>`), so the file is
// correct either way.
//
// SCOPE ISOLATION (bug 0030). This file is deliberately OUTSIDE the nine-area
// H9a manifest: it adds no `FeatureArea`, touches none of the nine committed
// fixtures under `./fixtures`, and uses its own temp discovery root. It does
// not call `assertStderrClean` (bug 0030's empty-capture gate is scoped to the
// ten committed nine-area spawns and their recorded baseline `dd4f3d3b`;
// extending that gate to an unbaselined surface here would change its scope
// with no recorded measurement) and it does not call
// `assertCodesSubsetOfPermitted`, so it needs NO entry in
// `tests/fixtures/h7a/permitted-codes.json` — the captures carry no
// `theta/{load,parse,runtime}/*` code at all.
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each
// (~6 s wall total measured). The offender's own body carries no query, so the
// pre-fix direction spends no extra turn either.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
// The shipped whole-document parse, driven through the shared offline helper's
// inert seams (`tests/helpers/e2e-s1.ts`) — the same entry point the offline
// witness `tests/ctor-unresolved-schema-name.test.ts` uses.
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code the fix widens to the object-constructor position. */
const CODE = "theta/parse/unresolved-named-type";

/**
 * The offending theta: a constructor naming `Mystery`, which resolves to no
 * top-level declaration in this file (bug 0025 fixture u1's shape). Its body
 * carries NO query, so the pre-fix direction — where it loads and `invoke`
 * actually runs it — costs no model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'let m = Mystery { note: "x" }',
  '"B25 OFFENDER BODY RAN"',
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
  'let r = invoke("./b25offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "B25 OFFENDER LOADED",',
  '  Err(e) => "B25 OFFENDER REFUSED"',
  "}",
  "@`A load probe finished with verdict: ${verdict}. Extract the last word of the verdict and answer with that single uppercase word only.`",
  "",
].join("\n");

/**
 * The matched-pair control: the SAME construct as the offender with the only
 * variable flipped — the constructor name resolves to a top-level `schema`. It
 * must still register and drive, so the fix is proved to reject the unresolvable
 * name specifically and not object construction generally, and its sentinel is
 * the guard that the temp discovery root was found at all (without it the
 * prober's assertion could pass for an unrelated reason).
 */
const CONTROL = [
  "---",
  "mode: prompt",
  "---",
  "schema Note { text: string }",
  'let n = Note { text: "941" }',
  "@`This note carries a number: ${n.text}. What is that number plus 100? Answer with the number only.`",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text (extract-the-last-word / name-the-fruit): deterministic
// content a degraded plain-prompt run cannot produce. A verbatim-echo demand
// ("reply with exactly this") reads as prompt injection to current models
// and draws refusals -- the documented sentinel-refusal class.
const REFUSED = "REFUSED";
const LOADED = "LOADED";
const CONTROL_OK = "1041";

/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}

describe("H9a live — bug 0025 object-constructor load refusal through the real `pi -p`", () => {
  it("refuses the theta whose constructor names an undeclared schema, and still registers and drives the well-formed control", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender is dropped by exactly this fix's code and the
    // other two files are clean, so neither live sentinel can be produced by an
    // unrelated load failure.
    expect(
      codesOf(OFFENDER, "b25offender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, the ` +
        `widened ${CODE}; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "b25offender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(PROBE, "b25probe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict " +
        "reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CONTROL, "b25control.theta"),
      "attribution: the control must be clean — a well-formed constructor over a " +
        "declared top-level schema is unaffected by the fix",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b25-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b25-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b25-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b25offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b25probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b25control.theta"), CONTROL, "utf8");

      // ---- (1) the well-formed control registers and drives a real turn ----
      const control = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b25control",
        cwd: controlCwd,
      });
      expect(
        control.exitCode,
        `control: expected a no-error exit (0), got ${String(control.exitCode)}. ` +
          `stderr: ${control.stderr}`,
      ).toBe(0);
      expect(
        control.stdout,
        `control: the temp discovery root must register and DRIVE the well-formed ` +
          `constructor theta — without this the refusal assertion below could pass ` +
          `vacuously (wrong root, no registration at all). stdout: ${control.stdout} ` +
          `stderr: ${control.stderr}`,
      ).toContain(CONTROL_OK);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b25probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. ` +
          `stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's ` +
          `invoke("./b25offender.theta") resolves Err(InvokeInfraError) and the ` +
          `match prints "${REFUSED}". Printing "${LOADED}" means the constructor ` +
          `naming an undeclared schema loaded clean — bug 0025 unfixed. stdout: ` +
          `${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
