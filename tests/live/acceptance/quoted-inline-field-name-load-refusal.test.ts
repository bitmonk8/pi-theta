// H9a live acceptance — bug 0176: a non-repeating inline field-name key whose
// first character is `"` or `'` is refused (`theta/parse/quoted-inline-field-
// name`, E, parse), end to end through the real `pi -p` binary, and the
// IDENTIFIER-spelled sibling of the same annotation still registers and
// drives (docs/bugs/0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/inline-object-quoted-field-name-refusal.test.ts` pins the diagnostic
// bytes at the `parseThetaDocument` boundary; the H8a cell
// (`tests/live/quoted-inline-field-name-live-cell.test.ts`) drives the same
// input through the shipped `createAgentSession` composition but never
// through the real `pi` BINARY in non-interactive print mode. This file
// spawns the real `pi -p` binary, so it is the one witness that covers real
// extension auto-load, flag/arg parsing, and discovery the way an operator
// actually invokes theta — mirroring
// `tests/live/acceptance/non-literal-discriminator-live.test.ts`'s structure
// exactly (offender / probe / clean, same two measurements below).
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION — the same two measurements
// `ctor-unresolved-load-refusal.test.ts` and
// `non-literal-discriminator-live.test.ts` record, reused here because they
// are properties of the SHIPPED session_start / print-mode plumbing, not of
// this bug: (1) load diagnostics route to the `theta-system-note` channel,
// which is not streamed to `pi -p` print-mode stdout; (2) invoking an
// unregistered slash directly makes `pi -p` hang with zero bytes on both
// streams. This file therefore drives the offender indirectly via
// `invoke("./cellqfnoffender.theta")` from a well-formed prober, converting
// the refusal into one of two committed stdout sentinels through a `match`
// over the untyped `invoke`'s `Result<null, QueryError>` — never asserting on
// a promise merely resolving.
//
// ZERO-TOKEN REPRODUCTION: both the offender and the clean sibling reproduce
// 0176 §Reproduction row q2 (`let x: Q = 1`) — a `let` annotation bound to a
// literal, no query anywhere in either body — so the offender/clean spawns
// compile-and-load only; only the CLEAN spawn's final untyped query and the
// PROBE's own final untyped query spend tokens (one line each, sentinel-
// pinned).
//
// MEASUREMENT (obligation 3(c) — permitted-codes decision by
// measurement, never by assumption): the probe run's stdout+stderr is scanned
// with the SAME `parseSystemNoteCodes` regex the nine-area H9a manifest scores
// area (a)-(i) against, for the literal string
// `theta/parse/quoted-inline-field-name`. See the cell body for the recorded
// result and the resulting permitted-codes.json disposition.
//
// SCOPE ISOLATION (bug 0030), same rule `ctor-unresolved-load-refusal.test.ts`
// and `non-literal-discriminator-live.test.ts` state for themselves: this
// file is deliberately OUTSIDE the nine-area H9a manifest. It adds no
// `FeatureArea`, touches none of the nine committed fixtures under
// `./fixtures`, and uses its own temp discovery roots. The CLEAN spelling's
// own spawn IS scored by `assertStderrClean`'s empty-capture rule (bug 0030
// §Fix) directly, inline, since that gate is a property of the shipped
// print-mode plumbing this cell exercises the same way every H9a area does —
// a real diagnostic-free `pi -p` run must still show 0 bytes of stderr. The
// offender/probe spawn is NOT scored by that gate: its whole purpose is to
// observe a refusal, and the two measurements above already establish that
// this class of diagnostic does not reach stdout/stderr at all, so subjecting
// the probe run to the same empty-capture assertion would be redundant with
// the CLEAN cell's own coverage of that plumbing, not a widening of the
// measured baseline.
//
// SUBAGENT CHILD PINS: NOT required. Every theta below is `mode: prompt`, and
// `invoke` between two `mode: prompt` thetas suspends the parent and attaches
// the callee to the caller's own session — no RFC-0006 child process launches
// on this path. The pins are supplied anyway by the shared harness
// (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN`, and the outer
// process carries `-ne -e <this tree's extensions>`).
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
import { parseDoc } from "../../helpers/e2e-s1";

/** The registry code bug 0176 §Fix route A mints (src/parser/type-grammar.ts). */
const CODE = "theta/parse/quoted-inline-field-name";

/**
 * The CLEAN spelling: the identifier-spelled sibling of the same annotation —
 * `{a: string}` in place of `{"a": string}` — 0176 §Reproduction row q2's
 * `let` annotation, zero-token load, then one pinned live turn. Registers and
 * drives a real turn, so "still loads AND still drives" is proven end to end
 * through the real binary, not merely offline.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  // The initialiser conforms to the annotation: bug 0130 (v0.160.0) made a
  // `let`-site inline-object annotation EMIT `let-rhs-type-mismatch` on a
  // non-conforming RHS, so the pre-0130 `= 1` spelling would dirty the good
  // path this cell exists to prove clean. A bare `{ a: "x" }` literal is
  // itself refused (`theta/parse/bare-object-literal`), so the fixture takes
  // 0130's own pinned-silent conforming shape (its witness cell d1, TYPE-5):
  // a `| null` arm with a `null` initialiser. The cell's subject — the KEY
  // spelling, identifier vs quoted — is untouched (fixture repaired at the
  // 0176 merge).
  "let x: {a: string} | null = null",
  "@`What is 249 plus 432? Answer with the number only.`",
  "",
].join("\n");

/**
 * The offending theta (bug 0176 §Reproduction row q2): a non-repeating
 * quoted key at a `let` annotation — `{"a": string}` — resolves with zero
 * diagnostics pre-fix. No query in the body: the pre-fix direction (where it
 * loads and `invoke` actually runs it) costs no extra model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'let x: {"a": string} = 1',
  'let a = "OFFENDER BODY RAN"',
  "a",
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>` — mirrors
 * `ctor-unresolved-load-refusal.test.ts` and
 * `non-literal-discriminator-live.test.ts`'s `PROBE`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./cellqfnoffender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "308",',
  '  Err(e) => "709"',
  "}",
  "@`A load probe reported code ${verdict}. What is that code plus 1000? Answer with the number only.`",
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
const REFUSED = "1709";
const LOADED = "1308";
const CLEAN_SENTINEL = "681";

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

describe("— H9a live: bug 0176 quoted-inline-field-name refusal through the real `pi -p`, and the identifier-spelled sibling end to end", () => {
  it(": refuses the theta whose annotation carries `{\"a\": string}`, still registers and drives the identifier-spelled `{a: string}` sibling, and measures whether the code reaches the H9a capture", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the widened code and the other
    // two sources are clean, so neither live sentinel can be produced by an
    // unrelated load failure.
    expect(
      codesOf(OFFENDER, "cellqfnoffender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, ${CODE}; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "cellqfnoffender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(PROBE, "cellqfnprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "cellqfnclean.theta"),
      "attribution: the identifier-spelled sibling must carry zero diagnostics — the fix must not disturb the good path",
    ).toEqual([]);

    // Live-host precondition — fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-cellqfn-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-cellqfn-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-cellqfn-cwd-"));
    try {
      writeFileSync(join(thetaDir, "cellqfnoffender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "cellqfnprobe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "cellqfnclean.theta"), CLEAN, "utf8");

      // ---- (1) the identifier-spelled sibling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/cellqfnclean",
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the identifier-spelled sibling must register and DRIVE a real turn — without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_SENTINEL);
      // bug 0030's empty-capture gate, applied inline: a diagnostic-free run
      // must show 0 bytes of stderr, the same property every H9a area asserts.
      expect(
        clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the identifier-spelled sibling must carry NO theta/{load,parse,runtime}/* code at all — the fix must not emit anything on the good path.",
      ).toEqual([]);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/cellqfnprobe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's invoke("./cellqfnoffender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means bug 0176 is unfixed. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
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
        `MEASUREMENT: ${CODE} ${observedCodes.includes(CODE) ? "DOES" : "does NOT"} reach the H9a stdout+stderr capture for this refusal path (probe stdout: ${probe.stdout} stderr: ${probe.stderr}). This is the recorded evidence for the permitted-codes.json disposition (obligation 3(c)).`,
      ).toEqual([]);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(cleanCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
