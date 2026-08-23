// H9a live acceptance — bug 0239: a `params:` field whose DEFAULT half carries
// a string literal that never closes (`p: 'string = "abc'`) is refused end to
// end through the real `pi -p` binary (`theta/parse/unterminated-string`, E)
// once §Fix (a) route 2 adds the default-side guard in `parseParams`'s
// per-field default loop (`src/parser/params.ts`) over bug 0232's existing
// predicate `hasUnterminatedStringLiteral`, while the closed byte-neighbour
// (§Reproduction row a3) still registers and a well-formed `p: string` sibling
// still drives a real turn
// (docs/bugs/0239-params-default-unterminated-literal-admitted.md).
//
// THE DEFAULT HALF IS WHAT THIS FILE ADDS. Bug 0232's own H9a file
// (`tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts`)
// drives the class through the field's TYPE half. Here `splitParamValue`
// (src/parser/frontmatter.ts) cuts at the top-level `=` before the quote
// opens, so the type half is the clean `string` and the malformation lands in
// the default half — a different guard and a different registered code, on the
// same shipped discovery / print-mode plumbing. Default-half twin — .
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/params-default-unterminated-literal-refusal.test.ts` pins the
// diagnostic bytes, the lowering and the recorded `defaultSource` at the
// `parseThetaDocument` boundary; the H8a cell
// (`tests/live/params-default-unterminated-literal--live-cell.test.ts`)
// drives the same input through the shipped `createAgentSession` composition
// but never through the real `pi` BINARY in non-interactive print mode. This
// file spawns the real `pi -p` binary, so it is the one witness covering real
// extension auto-load, flag/arg parsing and discovery the way an operator
// actually invokes theta.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION — the same two measurements bug 0232's H9a file
// and its 0154/0160/0228/0229 predecessors record, reused here because they
// are properties of the SHIPPED session_start / print-mode plumbing and not of
// this bug: (1) load diagnostics route to the `theta-system-note` channel,
// which is not streamed to `pi -p` print-mode stdout; (2) invoking an
// unregistered slash directly makes `pi -p` hang with zero bytes on both
// streams. The prober therefore converts both dispositions into committed
// stdout sentinels through a `match` over the untyped `invoke`'s
// `Result<null, QueryError>` — never asserting on a promise merely resolving.
// Both `invoke` calls pass NO argument: the offender fails to LOAD at all, so
// no static shape of it is available to the caller, and the closed sibling's
// own default supplies its field.
//
// WHY THE DRIVING SIBLING IS `p: string` AND NOT THE CLOSED DEFAULT.
// `classifyBinderBypass` (src/binder/binder-envelope.ts) declines the
// single-string bypass for a field with a default (`!field.hasDefault`), so
// the closed byte-neighbour `p: 'string = "abc"'` would need a resolvable
// binder model to bind a slash invocation. Its registration is therefore
// observed the same way the offender's non-registration is — through the
// prober's `invoke` — while the theta that DRIVES a real turn is the
// bypass-shaped `p: string` sibling, the same spelling bug 0232's H9a file
// uses for the identical reason.
//
// ZERO-TOKEN REPRODUCTION: the offender and the closed sibling both carry a
// bare literal body, so neither costs a model turn under `invoke`; only the
// CLEAN spawn's own `@`-query and the PROBE's final query spend tokens (one
// pinned line each).
//
// MEASUREMENT (permitted-codes decision by measurement, never by assumption):
// the probe run's stdout+stderr is scanned with the SAME `parseSystemNoteCodes`
// regex the nine-area H9a manifest scores its areas against, for the literal
// string `theta/parse/unterminated-string`. The assertion below records the
// expected disposition — the sibling load-time refusals each measured `[]`,
// the diagnostic reaching only the theta-system-note channel — and
// `tests/fixtures/h7a/permitted-codes.json` is left byte-untouched by this
// file. Its final disposition is decided by the REAL H9a run, on this cell's
// recorded evidence.
//
// SCOPE ISOLATION (bug 0030): this file is deliberately OUTSIDE the nine-area
// H9a manifest. It adds no `FeatureArea`, touches none of the nine committed
// fixtures, and uses its own temp discovery roots. The CLEAN spelling's own
// spawn IS scored by the empty-capture rule inline, since that gate is a
// property of the shipped print-mode plumbing this cell exercises the same way
// every H9a area does; the probe spawn is not, because its whole purpose is to
// observe a refusal.
//
// SUBAGENT CHILD PINS: not required — every theta below is `mode: prompt`, and
// `invoke` between two `mode: prompt` thetas suspends the parent and attaches
// the callee to the caller's own session, so no RFC-0006 child process
// launches on this path. The pins are supplied anyway by the shared harness
// (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN` plus the parent-pid
// carriage, and the outer process carries `-ne -e <this tree's extensions>`).
//
// NO SILENT SKIPPING: the live host is required through `resolveAcceptanceHost`
// (which itself fails loudly on an empty registry) and an empty provider or
// model id calls `failLoudly`; there is no early return and no skip.
//
// THE OFFLINE ATTRIBUTION GUARD IS ITS OWN CELL, not the first statements of
// the live cell. Inline, a pre-fix red would stop before the first `pi -p`
// spawn and the two spawns this file exists for would never run at all; split,
// one run shows both reds — the offline one naming the missing diagnostic, the
// live one naming the sentinel the prober actually printed — and the green
// direction (CLEAN drives, GOOD loads) is proven reachable at HEAD.
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  failLoudly,
  parseSystemNoteCodes,
  resolveAcceptanceHost,
  spawnPiPrint,
} from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registered row the default-side guard raises for these bytes. */
const CODE = "theta/parse/unterminated-string";

/**
 * The CLEAN spelling: a bypass-shaped `params:` field with no default, so the
 * invocation text binds `p` directly with no binder-model call, and the
 * theta's own `@`-query is the one live turn this spawn spends.
 *
 * WHY THE OBSERVABLE IS AN ARITHMETIC ANSWER DERIVED FROM `p` RATHER THAN AN
 * ECHOED SENTINEL. This spawn's discovery root also holds the offender, whose
 * load-refusal note enters this session's transcript; a query that asks the
 * model to reproduce a fixed instruction-shaped literal verbatim then reads as
 * a string planted in tool/file output, and a model that declines to parrot it
 * reds the CLEAN precondition without ever reaching the refusal assertions
 * this file exists for. `${p} + 5` is a plain question: the answer is COMPUTED
 * from the bound argument, so it cannot be produced without the field actually
 * binding, it carries no literal for the model to decline, and it stays a
 * single deterministic token.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "params:",
  "  p: string",
  "---",
  "@`What is ${p} plus 5? Reply with the resulting number and nothing else.`",
  "",
].join("\n");

/**
 * The closed byte-neighbour — §Reproduction row a3, one closing quote apart
 * from the offender and admitted before and after the fix. Its Ok arm is what
 * makes the offender's Err arm attributable to the unterminated span rather
 * than to "a params: default cannot load".
 *
 * WHY IT AND THE OFFENDER CARRY A `bind_model:` LINE. `classifyBinderBypass`
 * (`src/binder/binder-envelope.ts`) declines the single-string bypass for a
 * field that declares a default (`!field.hasDefault`), so a one-field `params:`
 * theta WITH a default is non-bypass and does not LOAD without a resolvable
 * binder model — the disposition `./fixtures/acc-params-binder.theta` states
 * for itself. MEASURED at HEAD f5d0d125 without the line: both files failed to
 * load, their load-failure notes entered the CLEAN spawn's own session, and the
 * model answered the polluted transcript instead of the pinned sentinel. The id
 * is re-derived from `resolveAcceptanceHost()` per spawn, the rule
 * `materialiseHostBoundThetaDir` applies to the committed fixture.
 */
function goodSrc(bindModel: string): string {
  return [
    "---",
    "mode: prompt",
    `bind_model: ${bindModel}`,
    "params:",
    `  p: 'string = "abc"'`,
    "---",
    '"ok"',
    "",
  ].join("\n");
}

/**
 * The offending theta — §Reproduction row a1: the same field with the closing
 * quote removed. Pre-fix it registered with zero diagnostics, recording the
 * unterminated bytes `"abc` as the field's `defaultSource`. Bare literal body:
 * the pre-fix direction (where it loads and `invoke` actually runs it) costs no
 * model turn. Carries the same re-derived `bind_model:` line as the closed
 * neighbour, for the reason stated on it.
 */
function offenderSrc(bindModel: string): string {
  return [
    "---",
    "mode: prompt",
    `bind_model: ${bindModel}`,
    "params:",
    `  p: 'string = "abc'`,
    "---",
    '"ok"',
    "",
  ].join("\n");
}

/**
 * The id the OFFLINE attribution cell parses against. A `bind_model:` value is
 * resolved against the model registry at LOAD time, never at parse time, so
 * neither source's parse diagnostics depend on which id sits on the line.
 */
const ATTRIBUTION_BIND_MODEL = "anthropic/claude-sonnet-5";

/**
 * The prober: well-formed, registers either way, and converts BOTH load
 * dispositions into committed sentinels through a `match` over each untyped
 * `invoke`'s `Result<null, QueryError>`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let g = invoke("./pgood.theta")',
  'let o = invoke("./poffender.theta")',
  "let gv = match g {",
  '  Ok(v) => "131",',
  '  Err(e) => "132"',
  "}",
  "let ov = match o {",
  '  Ok(v) => "241",',
  '  Err(e) => "242"',
  "}",
  // Both verdicts ride ONE code and ONE addition: asking for two sums in one
  // turn leaves the model free to add the constant to only one of them, and a
  // second query's answer does not reach the H9a capture. `100100` shifts the
  // leading and trailing halves together, so neither expected value occurs in
  // the prompt and only the two `match` arms can produce them.
  "@`A load probe reported code ${gv}${ov}. What is that code plus 100100? Answer with the number only.`",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
const GOOD_LOADED = "231";
const GOOD_REFUSED = "232";
const OFFENDER_REFUSED = "342";
const OFFENDER_LOADED = "341";

/**
 * The argument the CLEAN spawn binds to `p`, and the only answer a turn that
 * really received it can give. Four digits keep the answer distinctive enough
 * that it cannot be matched incidentally by unrelated print-mode output.
 */
const CLEAN_ARG = "1207";
const CLEAN_ANSWER = "1212";

/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}

describe("H9a live: bug 0239 unterminated-string refusal at the params: default half through the real `pi -p`, with the closed byte-neighbour and a bypass-shaped sibling end to end", () => {
  it("ATTRIBUTION (offline, token-free): the offender carries exactly theta/parse/unterminated-string and the other three sources carry nothing", () => {
    // No live sentinel below is attributable to this bug unless the offender's
    // sole diagnostic is the new code and the other three sources are clean. A
    // neutralised fix reds this cell with zero tokens spent.
    const offender = offenderSrc(ATTRIBUTION_BIND_MODEL);
    const good = goodSrc(ATTRIBUTION_BIND_MODEL);
    expect(
      codesOf(offender, "poffender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, ${CODE}; actual=${JSON.stringify(diagnosticsOf(offender, "poffender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(good, "pgood.theta"),
      "attribution: the closed byte-neighbour of §Reproduction row a3 must carry zero diagnostics -- the refusal is a closure question, not a default-presence one",
    ).toEqual([]);
    // The load precondition itself: without exactly one resolvable
    // `bind_model:` line each, neither defaulted theta LOADS, both dispositions
    // collapse to Err, and the offender's Err arm says nothing about closure
    // (measured at HEAD f5d0d125).
    expect(
      [
        (offender.match(/^bind_model:.*$/gm) ?? []).length,
        (good.match(/^bind_model:.*$/gm) ?? []).length,
      ],
      "attribution: each defaulted-params theta must carry exactly one `bind_model:` line -- a " +
        "non-bypass theta with no resolvable binder model does not load at all",
    ).toEqual([1, 1]);
    expect(
      diagnosticsOf(PROBE, "pprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdicts reflect the two callees' dispositions only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "pclean.theta"),
      "attribution: the bypass-shaped sibling must carry zero diagnostics -- the refusal must not disturb the good path",
    ).toEqual([]);
  });

  it("refuses the theta whose params: default carries `\"abc` with no closing quote, keeps the closed `\"abc\"` neighbour loadable, drives the well-formed `p: string` sibling, and measures whether the code reaches the H9a capture", async () => {
    // Live-host precondition -- fails loudly naming the unmet precondition;
    // never a skip or early return. The provider half is required as well as
    // the model half, because the two defaulted thetas' `bind_model:` line is
    // re-derived from it and a bare id can be ambiguous across providers.
    const host = await resolveAcceptanceHost();
    if (host.model.length === 0 || host.provider.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned " +
          `provider '${host.provider}' / model '${host.model}', which cannot be written as a ` +
          "resolvable `bind_model:` for the two defaulted `params:` thetas below.",
      );
    }
    const bindModel = `${host.provider}/${host.model}`;
    const OFFENDER = offenderSrc(bindModel);
    const GOOD = goodSrc(bindModel);

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0239-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0239-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0239-cwd-"));
    try {
      writeFileSync(join(thetaDir, "poffender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "pgood.theta"), GOOD, "utf8");
      writeFileSync(join(thetaDir, "pprobe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "pclean.theta"), CLEAN, "utf8");

      // ---- (1) the bypass-shaped sibling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: `/pclean ${CLEAN_ARG}`,
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the well-formed sibling must register, BIND ${CLEAN_ARG} and DRIVE a real turn, whose only answer is ${CLEAN_ANSWER} -- without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_ANSWER);
      expect(
        clean.stderr.split(/\r?\n/).filter((l) => l.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the well-formed sibling must carry NO theta/{load,parse,runtime}/* code at all -- the refusal must emit nothing on the good path.",
      ).toEqual([]);

      // ---- (2) the offender is refused and the closed neighbour is not ----
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
        `probe: the offending theta must NOT load, so invoke("./poffender.theta") resolves Err(InvokeInfraError) and the match prints "${OFFENDER_REFUSED}". Printing "${OFFENDER_LOADED}" means bug 0239's unterminated default literal is still being admitted, lowered and recorded. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(OFFENDER_REFUSED);
      expect(
        probe.stdout,
        `probe: the offender's Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(OFFENDER_LOADED);
      expect(
        probe.stdout,
        `probe: the closed byte-neighbour must still load, so invoke("./pgood.theta") resolves Ok and the match prints "${GOOD_LOADED}". Printing "${GOOD_REFUSED}" is an over-reach: the guard tested default PRESENCE, or container balance, rather than string closure. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(GOOD_LOADED);
      expect(
        probe.stdout,
        `probe: the closed neighbour's Err arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(GOOD_REFUSED);

      // ---- MEASUREMENT (permitted-codes disposition) ----
      // Scan the probe's combined stdout+stderr for the code with the SAME
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
