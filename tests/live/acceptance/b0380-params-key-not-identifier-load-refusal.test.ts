//
// H9a live acceptance — bug 0380: a `params:` mapping key whose COOKED YAML
// value is not an identifier (`[A-Za-z_][A-Za-z0-9_]*`, lexical.md) is refused
// end to end through the real `pi -p` binary
// (`theta/parse/params-key-not-identifier`, E, parse) once the settled Option-A
// fix adds the identifier-shape refusal arm to the params-key walk
// (`src/parser/frontmatter.ts` `extractParsedParams`). The identifier-key
// sibling still registers and drives
// (docs/bugs/0380-nonidentifier-params-key-registers-and-forges-binder-prompt-and-echo.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0380-params-key-not-identifier.test.ts` pins the diagnostic codes,
// the render seams and the registration proxy at the `parseThetaDocument`
// boundary. This file spawns the real `pi -p` binary, so it is the one witness
// that covers real extension auto-load, flag/arg parsing, and discovery the way
// an operator actually invokes theta -- mirroring the structure bug 0228 shipped
// at the sibling parser leaf
// (`tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts`):
// offender / probe / clean, the same two measurements below.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION -- the same two properties of the SHIPPED
// session_start / print-mode plumbing the 0154 / 0228 H9a files record: (1)
// load diagnostics route to the `theta-system-note` channel, which is not
// streamed to `pi -p` print-mode stdout; (2) invoking an unregistered slash
// directly makes `pi -p` hang with zero bytes on both streams. This file
// therefore drives the offender indirectly via `invoke("./b0380offender.theta")`
// from a well-formed prober, converting the refusal into one of two committed
// stdout sentinels through a `match` over the untyped `invoke`'s
// `Result<null, QueryError>` -- never asserting on a promise merely resolving.
//
// ZERO-TOKEN OFFENDER: the offender registers-and-loads only (its `invoke` runs
// no query pre-fix and never loads post-fix), so only the CLEAN spawn's final
// compute-from-inline query and the PROBE's own final query spend tokens (one
// line each, sentinel-pinned).
//
// MEASUREMENT (permitted-codes decision by measurement, never by assumption):
// the probe run's stdout+stderr is scanned with the SAME `parseSystemNoteCodes`
// regex the nine-area H9a manifest scores against, for the literal string
// `theta/parse/params-key-not-identifier`. The load-time refusal reaches only
// the theta-system-note channel (as bugs 0154 / 0228 measured for their sibling
// parse codes), so `tests/fixtures/h7a/permitted-codes.json` is left
// byte-untouched by this file; its final disposition is decided by the REAL H9a
// run, on this cell's recorded evidence.
//
// SCOPE ISOLATION (bug 0030): this file is deliberately OUTSIDE the nine-area
// H9a manifest. It adds no `FeatureArea`, touches none of the nine committed
// fixtures, and uses its own temp discovery roots.
//
// SUBAGENT CHILD PINS: NOT required. Every theta below is `mode: prompt`, and
// `invoke` between two `mode: prompt` thetas suspends the parent and attaches
// the callee to the caller's own session -- no RFC-0006 child process launches.
// The pins are supplied anyway by the shared harness.
//
// Token-bounded: two `pi -p` spawns, one pinned single-line turn each.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, parseSystemNoteCodes, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The row the settled Option-A fix mints (src/parser/frontmatter.ts `extractParsedParams`). */
const CODE = "theta/parse/params-key-not-identifier";

/**
 * The CLEAN sibling: an IDENTIFIER `params:` key `p: string`. `string` is the
 * `classifyBinderBypass` single-string-bypass shape (the same spelling the
 * params-unterminated sibling cell uses for the identical reason), so this
 * needs no `bind_model:` -- the invocation text binds `p` directly with NO
 * binder-model call, and the theta's own `@`-query is the one live turn this
 * spawn spends. Registers and drives, so "identifier params key still loads AND
 * still binds AND its value reaches the turn" is proven end to end through the
 * real binary (the arithmetic 612 + 134 = 746 is fixed; `${p}` proves the
 * identifier key bound).
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "params:",
  "  p: string",
  "---",
  "@`p is bound to ${p}. What is 612 plus 134? Answer with the number only.`",
  "",
].join("\n");

/**
 * The offending theta: a `params:` key whose cooked value `a b` is not an
 * identifier. The default (`= "x"`) makes its `invoke` arity min-zero, so the
 * pre-fix direction is unambiguous: pre-fix it registers with zero diagnostics
 * (VERIFIED offline at this fork: `"a b": string` cooks a non-identifier key
 * that loads clean) and the no-arg `invoke` resolves `Ok`; post-fix it draws
 * CODE and does not register, so the `invoke` resolves `Err`. No query in the
 * body: neither direction costs a model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "params:",
  '  "a b": string = "x"',
  "---",
  '"OFFENDER BODY RAN"',
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
  'let r = invoke("./b0380offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "418",',
  '  Err(e) => "619"',
  "}",
  "@`A load probe reported code ${verdict}. What is that code plus 1000? Answer with the number only.`",
  "",
].join("\n");

const REFUSED = "1619";
const LOADED = "1418";
// The clean drive discriminator is the ANSWER to the theta's own arithmetic
// over its bound default (compute-from-inline-value, AGENTS.md): deterministic
// content a degraded plain-prompt fall-through cannot produce, and NOT a
// verbatim-echo demand (0243-refusal-prone).
const CLEAN_SENTINEL = "746";

/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}

describe("-- H9a live: bug 0380 non-identifier `params:` key refusal at load through the real `pi -p`, and the identifier-key sibling end to end", () => {
  it(": refuses the theta whose `params:` key cooks to `a b`, still registers and drives the identifier-key sibling, and measures whether the code reaches the H9a capture", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the new code and the other two
    // sources are clean, so neither live sentinel can be produced by an
    // unrelated load failure. A neutralised fix reds here with zero tokens.
    expect(
      codesOf(OFFENDER, "b0380offender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, ${CODE}; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "b0380offender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(PROBE, "b0380probe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "b0380clean.theta"),
      "attribution: the identifier-key sibling must carry zero diagnostics -- the refusal must not disturb the good path",
    ).toEqual([]);

    // Live-host precondition -- fails loudly naming the unmet precondition;
    // never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0380-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0380-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0380-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b0380offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b0380probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b0380clean.theta"), CLEAN, "utf8");

      // ---- (1) the identifier-key sibling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0380clean hello",
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the identifier-key sibling must register and DRIVE a real turn over its bound default -- without this the refusal assertion below could pass vacuously (wrong root, no registration). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_SENTINEL);
      expect(
        clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the identifier-key sibling must carry NO theta/{load,parse,runtime}/* code at all -- the refusal must emit nothing on the good path.",
      ).toEqual([]);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b0380probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's invoke("./b0380offender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means the non-identifier params key still registers -- the Option-A refusal arm is missing. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);

      // ---- MEASUREMENT (permitted-codes disposition) ----
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
