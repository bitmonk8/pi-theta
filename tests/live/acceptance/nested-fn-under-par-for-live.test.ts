// H9a live acceptance — bug 0118: a `fn` declared inside a `par for` body is
// refused end to end through the real `pi -p` binary, and the CLEAN sibling
// with the identical `fn` hoisted to the top level still registers and drives
// (docs/bugs/0118-nested-fn-result-return-defers-to-runtime-panic.md §Fix (a)).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/par-for.test.ts` (cells r1/r4/r5) and
// `tests/interpolated-result-gate.test.ts` (h1) pin the diagnostic bytes at
// the `parseThetaDocument` boundary; the H8a cell
// (`tests/live/live-production-acceptance.test.ts`, the paired H8a cell) drives the same
// input through the shipped `createAgentSession` composition but never
// through the real `pi` BINARY in non-interactive print mode. This file
// spawns the real `pi -p` binary, so it is the one witness that covers real
// extension auto-load, flag/arg parsing, and discovery the way an operator
// actually invokes theta.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION — the same two measurements
// `ctor-unresolved-load-refusal.test.ts` records, reused here because they are
// properties of the SHIPPED session_start / print-mode plumbing, not of this
// bug: (1) load diagnostics route to the `theta-system-note` channel, which is
// not streamed to `pi -p` print-mode stdout; (2) invoking an unregistered
// slash directly makes `pi -p` hang with zero bytes on both streams. This file
// therefore drives the offender indirectly via `invoke("./nfpfoffender.theta")`
// from a well-formed prober, converting the refusal into one of two committed
// stdout sentinels through a `match` over the untyped `invoke`'s
// `Result<null, QueryError>` — never asserting on a promise merely resolving.
//
// MEASUREMENT (obligation 3(c) — permitted-codes decision by measurement,
// never by assumption): the probe run's stdout+stderr is scanned with the
// SAME `parseSystemNoteCodes` regex the nine-area H9a manifest scores area
// (a)-(i) against, for the literal string `theta/parse/nested-fn`. See the
// cell body for the recorded result and the resulting permitted-codes.json
// disposition.
//
// SCOPE ISOLATION (bug 0030), same rule `ctor-unresolved-load-refusal.test.ts`
// and `non-literal-discriminator-live.test.ts` state for themselves: this
// file is deliberately OUTSIDE the nine-area H9a manifest. It adds no
// `FeatureArea`, touches none of the nine committed fixtures under
// `./fixtures`, and uses its own temp discovery roots. The CLEAN
// top-level-hoisted spelling's own spawn IS scored by `assertStderrClean`'s
// empty-capture rule (bug 0030 §Fix) directly, inline, since that gate is a
// property of the shipped print-mode plumbing this cell exercises the same
// way every H9a area does — a real diagnostic-free `pi -p` run must still
// show 0 bytes of stderr. The offender/probe spawn is NOT scored by that
// gate: its whole purpose is to observe a refusal, and
// `ctor-unresolved-load-refusal.test.ts` already established (measurement 1
// above) that this class of diagnostic does not reach stdout/stderr at all,
// so subjecting the probe run to the same empty-capture assertion would be
// redundant with the CLEAN cell's own coverage of that plumbing, not a
// widening of the measured baseline.
//
// SUBAGENT CHILD PINS: NOT required. Every theta below is `mode: prompt`, and
// `invoke` between two `mode: prompt` thetas suspends the parent and attaches
// the callee to the caller's own session — no RFC-0006 child process launches
// on this path (the same finding `non-literal-discriminator-live.test.ts` and
// `ctor-unresolved-load-refusal.test.ts` record). The pins are supplied
// anyway by the shared harness (`spawnPiPrint` sets
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, and the outer process carries
// `-ne -e <this tree's extensions>`).
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  failLoudly,
  parseSystemNoteCodes,
  requireLiveHost,
  spawnPiPrint,
} from "./harness";
// The shipped whole-document parse, driven through the shared offline helper's
// inert seams (`tests/helpers/e2e-s1.ts`) — the same entry point the offline
// witnesses `tests/par-for.test.ts` / `tests/interpolated-result-gate.test.ts`
// use.
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code bug 0118 §Fix (a) reaches (src/parser/functions.ts). */
const CODE = "theta/parse/nested-fn";

/**
 * The offending theta (bug 0118 finding (2)): a `fn` declared directly in a
 * `par for` body — the one placement the pre-fix structural walk never
 * visited. No query in the body: the pre-fix direction (where it loads and
 * `invoke` actually runs it) costs no extra model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let xs = par for i in [1, 2] {",
  "  fn mk(): integer { 1 }",
  "  1",
  "}",
  '"NFPF OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * The CLEAN spelling: the identical `fn` hoisted to the top level — the only
 * placement FN-1 admits — beside the identical `par for`. Registers and
 * drives a real turn, so "still loads AND still drives" is proven end to end
 * through the real binary, not merely offline.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  "fn mk(): integer { 1 }",
  "let xs = par for i in [1, 2] { 1 }",
  "@`What is 463 plus 122? Answer with the number only.`",
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>` — mirrors
 * `ctor-unresolved-load-refusal.test.ts`'s and
 * `non-literal-discriminator-live.test.ts`'s `PROBE`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./nfpfoffender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "573",',
  '  Err(e) => "874"',
  "}",
  "@`A load probe reported code ${verdict}. What is that code plus 1000? Answer with the number only.`",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
const REFUSED = "1874";
const LOADED = "1573";
const CLEAN_SENTINEL = "585";

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

describe("— H9a live: bug 0118 nested-fn-under-par-for refusal through the real `pi -p`, and the top-level-hoisted clean sibling", () => {
  it(": refuses the theta whose `par for` body declares a nested `fn`, still registers and drives the top-level-hoisted sibling, and measures whether the code reaches the H9a capture ()", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the FN-1 refusal and the other
    // two sources are clean, so neither live sentinel can be produced by an
    // unrelated load failure.
    expect(
      codesOf(OFFENDER, "nfpfoffender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, ${CODE}; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "nfpfoffender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(PROBE, "nfpfprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "nfpfclean.theta"),
      "attribution: the top-level-hoisted spelling must carry zero diagnostics — the fix must not disturb a legal top-level `fn` declared beside a `par for`",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-nfpf-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-nfpf-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-nfpf-cwd-"));
    try {
      writeFileSync(join(thetaDir, "nfpfoffender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "nfpfprobe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "nfpfclean.theta"), CLEAN, "utf8");

      // ---- (1) the CLEAN top-level-hoisted spelling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/nfpfclean",
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the top-level-hoisted sibling must register and DRIVE a real turn — without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_SENTINEL);
      // bug 0030's empty-capture gate, applied inline: a diagnostic-free run
      // must show 0 bytes of stderr, the same property every H9a area asserts.
      expect(
        clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the top-level-hoisted sibling must carry NO theta/{load,parse,runtime}/* code at all — the fix must not emit anything on the good path.",
      ).toEqual([]);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/nfpfprobe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's invoke("./nfpfoffender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means bug 0118 finding (2) is unfixed. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);

      // ---- MEASUREMENT (obligation 3(c)) ----
      // Scan the probe's combined stdout+stderr for the new code with the SAME
      // regex the nine-area H9a manifest's `permittedCodesSubset` invariant
      // uses. This is the actual measurement the permitted-codes.json
      // disposition is based on — never an assumption.
      const observedCodes = parseSystemNoteCodes(probe.stdout + probe.stderr);
      expect(
        observedCodes,
        `MEASUREMENT: theta/parse/nested-fn ${observedCodes.includes(CODE) ? "DOES" : "does NOT"} reach the H9a stdout+stderr capture for this refusal path (probe stdout: ${probe.stdout} stderr: ${probe.stderr}). This is the recorded evidence for the permitted-codes.json disposition (obligation 3(c)).`,
      ).toEqual([]);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(cleanCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
