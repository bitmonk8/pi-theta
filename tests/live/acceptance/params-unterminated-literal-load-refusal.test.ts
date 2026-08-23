// H9a live acceptance — bug 0232: a `params:` field whose inline object
// type's wire-name string literal never closes (`{a as "w: integer, b:
// integer}`) is refused end to end through the real `pi -p` binary
// (`theta/load/params-type-not-expression`, E, load) once §Fix (b) raises the
// position's own registered row directly off the new
// `hasUnterminatedStringLiteral` predicate, and the well-formed sibling
// the well-formed sibling `p: string` still registers and drives
// (docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/unterminated-literal-params-type-refusal.test.ts` pins the
// diagnostic bytes and the lowered artefact at the `parseThetaDocument`
// boundary; the H8a cell
// (`tests/live/params-unterminated-literal-live-cell.test.ts`) drives the
// same input through the shipped `createAgentSession` composition but never
// through the real `pi` BINARY in non-interactive print mode. This file
// spawns the real `pi -p` binary, so it is the one witness that covers real
// extension auto-load, flag/arg parsing, and discovery the way an operator
// actually invokes theta -- mirroring the structure bugs 0228/0229 shipped at
// the neighbouring inline-object parser leaf
// (`tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts`,
// `tests/live/acceptance/escaped-quote-inline-rename-load-refusal.test.ts`):
// offender / probe / clean, same two measurements below.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION -- the same two measurements
// `ctor-unresolved-load-refusal.test.ts` and bugs 0154/0160/0228/0229's H9a
// files record, reused here because they are properties of the SHIPPED
// session_start / print-mode plumbing, not of this bug: (1) load diagnostics
// route to the `theta-system-note` channel, which is not streamed to `pi -p`
// print-mode stdout; (2) invoking an unregistered slash directly makes
// `pi -p` hang with zero bytes on both streams. This file therefore drives
// the offender indirectly via `invoke("./poffender.theta")` from a
// well-formed prober, converting the refusal into one of two committed
// stdout sentinels through a `match` over the untyped `invoke`'s
// `Result<null, QueryError>` -- never asserting on a promise merely
// resolving. The prober calls `invoke` with NO argument: the offender fails
// to LOAD at all (a `params:`-level refusal), so no static arity/shape
// information about it is ever available to the caller -- the same
// zero-argument shape the sibling bugs' H9a files use for their own
// annotation-position offenders.
//
// ZERO-TOKEN REPRODUCTION: the offender carries its `params:` field type at
// load time with no query in the body, so the offender spawn compiles (or
// rather fails to compile) with no token spent; only the CLEAN spawn's final
// typed query and the PROBE's own final untyped query spend tokens (one line
// each, sentinel-pinned).
//
// MEASUREMENT (permitted-codes decision by measurement, never by assumption):
// the probe run's stdout+stderr is scanned with the SAME `parseSystemNoteCodes`
// regex the nine-area H9a manifest scores area (a)-(i) against, for the literal
// string `theta/load/params-type-not-expression`. The assertion below records
// the expected disposition -- the sibling annotation-position codes (bugs
// 0154/0160/0228/0229) each measured `[]` for their own classes, the
// load-time refusal reaching only the theta-system-note channel -- and
// `tests/fixtures/h7a/permitted-codes.json` is therefore left byte-untouched
// by this file. Its final disposition is decided by the REAL H9a run, on this
// cell's recorded evidence.
//
// SCOPE ISOLATION (bug 0030), the same rule the sibling H9a files state for
// themselves: this file is deliberately OUTSIDE the nine-area H9a manifest.
// It adds no `FeatureArea`, touches none of the nine committed fixtures under
// `./fixtures`, and uses its own temp discovery roots. The CLEAN spelling's
// own spawn IS scored by the empty-capture rule (bug 0030 §Fix) directly,
// inline, since that gate is a property of the shipped print-mode plumbing
// this cell exercises the same way every H9a area does. The offender/probe
// spawn is NOT scored by that gate: its whole purpose is to observe a
// refusal, and the two measurements above already establish that this class
// of diagnostic does not reach stdout/stderr at all.
//
// SUBAGENT CHILD PINS: NOT required. Every theta below is `mode: prompt`, and
// `invoke` between two `mode: prompt` thetas suspends the parent and attaches
// the callee to the caller's own session -- no RFC-0006 child process launches
// on this path. The pins are supplied anyway by the shared harness
// (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN` plus the parent-pid
// carriage, and the outer process carries `-ne -e <this tree's extensions>`).
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, parseSystemNoteCodes, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The `params:` position's own registered refusal -- the code this fix raises. */
const CODE = "theta/load/params-type-not-expression";

/**
 * The CLEAN spelling: a well-formed `params:` field in place of the
 * unterminated inline-object spelling. `string` is the
 * `classifyBinderBypass` single-string-bypass shape (the same spelling bug
 * 0059's H8a-T `conformantParamsTypeTheta` uses for the identical reason), so
 * this sibling needs no `bind_model:` -- the invocation text itself binds `p`
 * directly with no binder-model call, and the theta's own `@`-query is the
 * one live turn this spawn spends.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "params:",
  "  p: string",
  "---",
  "@`p is bound to ${p}. What is 508 plus 219? Answer with the number only.`",
  "",
].join("\n");

/**
 * The offending theta: `params:` field `p` whose wire-name literal never
 * closes beside a well-formed sibling field `b` -- §Reproduction B row B2.
 * Pre-fix this registered with zero diagnostics, lowering `p` to the
 * permissive `{}` and dropping `b` entirely. No query in the body: the
 * pre-fix direction (where it loads and `invoke` actually runs it) costs no
 * extra model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "params:",
  '  p: \'{a as "w: integer, b: integer}\'',
  "---",
  '"OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>`. Called with no argument:
 * the offender fails to LOAD, so no static shape of it is ever available to
 * the caller.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./poffender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "296",',
  '  Err(e) => "597"',
  "}",
  "@`A load probe reported code ${verdict}. What is that code plus 1000? Answer with the number only.`",
  "",
].join("\n");

const REFUSED = "1597";
const LOADED = "1296";
// The drive discriminator is the ANSWER to the theta's own arithmetic
// prompt: deterministic content a degraded plain-prompt run (the slash
// falling through as a user prompt) cannot produce. A verbatim-echo demand
// ("reply with exactly this") reads as prompt injection to current models
// and draws refusals -- the documented sentinel-refusal class.
const CLEAN_SENTINEL = "727";

/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}

describe("H9a live: bug 0232 params-type-not-expression refusal for an unterminated wire-name literal through the real `pi -p`, and the well-formed sibling end to end", () => {
  it('refuses the theta whose params: field carries `{a as "w: integer, b: integer}`, still registers and drives the well-formed `p: string` sibling, and measures whether the code reaches the H9a capture', async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the new code and the other two
    // sources are clean, so neither live sentinel can be produced by an
    // unrelated load failure. A neutralised fix reds here with zero tokens.
    expect(
      codesOf(OFFENDER, "poffender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, ${CODE}; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "poffender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(PROBE, "pprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "pclean.theta"),
      "attribution: the well-formed sibling must carry zero diagnostics -- the refusal must not disturb the good path",
    ).toEqual([]);

    // Live-host precondition -- fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0232-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0232-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0232-cwd-"));
    try {
      writeFileSync(join(thetaDir, "poffender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "pprobe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "pclean.theta"), CLEAN, "utf8");

      // ---- (1) the well-formed sibling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/pclean hello",
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the well-formed sibling must register and DRIVE a real turn -- without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_SENTINEL);
      expect(
        clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the well-formed sibling must carry NO theta/{load,parse,runtime}/* code at all -- the refusal must emit nothing on the good path.",
      ).toEqual([]);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/pprobe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's invoke("./poffender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means bug 0232's unterminated wire-name literal is still being admitted and lowered to the permissive \`{}\`. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);

      // ---- MEASUREMENT (permitted-codes disposition) ----
      // Scan the probe's combined stdout+stderr for the new code with the SAME
      // regex the nine-area H9a manifest's `permittedCodesSubset` invariant
      // uses. This is the actual measurement the permitted-codes.json
      // disposition rests on -- never an assumption.
      const observedCodes = parseSystemNoteCodes(probe.stdout + probe.stderr);
      expect(
        observedCodes,
        `MEASUREMENT: ${CODE} ${observedCodes.includes(CODE) ? "DOES" : "does NOT"} reach the H9a stdout+stderr capture for this refusal path (probe stdout: ${probe.stdout} stderr: ${probe.stderr}). This is the recorded evidence for the permitted-codes.json disposition.`,
      ).toEqual([]);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(cleanCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
