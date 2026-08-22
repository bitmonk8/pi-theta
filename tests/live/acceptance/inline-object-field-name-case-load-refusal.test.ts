// Lane-wave marker for the parallel merge of this wave's live additions:
//
// H9a live acceptance — bug 0154: an inline object type's field name is a
// schema field name, so lexical.md's lowercase-first rule now reaches it end
// to end through the real `pi -p` binary
// (`theta/parse/binding-case-mismatch`, E, parse), and the lowercase-first
// sibling of the same annotation still registers and drives
// (docs/bugs/0154-inline-object-type-field-name-rules-unenforced.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/inline-object-field-name-case.test.ts` pins the diagnostic bytes at
// the `parseThetaDocument` boundary; the H8a cell
// (`tests/live/inline-object-field-name-case-live-cell.test.ts`) drives the
// same input through the shipped `createAgentSession` composition but never
// through the real `pi` BINARY in non-interactive print mode. This file
// spawns the real `pi -p` binary, so it is the one witness that covers real
// extension auto-load, flag/arg parsing, and discovery the way an operator
// actually invokes theta -- mirroring bug 0176's own H9a acceptance file
// (`tests/live/acceptance/quoted-inline-field-name-load-refusal.test.ts`)
// structure exactly (offender / probe / clean, same two measurements below).
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION -- the same two measurements
// `ctor-unresolved-load-refusal.test.ts` and bug 0176's H9a file record,
// reused here because they are properties of the SHIPPED session_start /
// print-mode plumbing, not of this bug: (1) load diagnostics route to the
// `theta-system-note` channel, which is not streamed to `pi -p` print-mode
// stdout; (2) invoking an unregistered slash directly makes `pi -p` hang with
// zero bytes on both streams. This file therefore drives the offender
// indirectly via `invoke("./cellbcmoffender.theta")` from a well-formed
// prober, converting the refusal into one of two committed stdout sentinels
// through a `match` over the untyped `invoke`'s `Result<null, QueryError>` --
// never asserting on a promise merely resolving.
//
// ZERO-TOKEN REPRODUCTION: both the offender and the clean sibling reproduce
// bug 0154 row i1's shape at a `let` annotation bound to a literal -- no
// query anywhere in either body -- so the offender/clean spawns compile-and-
// load only; only the CLEAN spawn's final untyped query and the PROBE's own
// final untyped query spend tokens (one line each, sentinel-pinned).
//
// MEASUREMENT (obligation 3(c) -- permitted-codes decision by measurement,
// never by assumption): the probe run's stdout+stderr is scanned with the
// SAME `parseSystemNoteCodes` regex the nine-area H9a manifest scores area
// (a)-(i) against, for the literal string
// `theta/parse/binding-case-mismatch`. See the cell body for the recorded
// result and the resulting permitted-codes.json disposition.
//
// SCOPE ISOLATION (bug 0030), same rule bug 0176's H9a file states for
// itself: this file is deliberately OUTSIDE the nine-area H9a manifest. It
// adds no `FeatureArea`, touches none of the nine committed fixtures under
// `./fixtures`, and uses its own temp discovery roots. The CLEAN spelling's
// own spawn IS scored by `assertStderrClean`'s empty-capture rule (bug 0030
// §Fix) directly, inline, since that gate is a property of the shipped
// print-mode plumbing this cell exercises the same way every H9a area does --
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
// the callee to the caller's own session -- no RFC-0006 child process
// launches on this path. The pins are supplied anyway by the shared harness
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

/** The registered code bug 0154's fix draws (src/parser/type-grammar.ts). */
const CODE = "theta/parse/binding-case-mismatch";

/**
 * The CLEAN spelling: the lowercase-first sibling of the same annotation --
 * `{ys: string}` in place of `{Ys: string}` -- bound to a literal, zero-token
 * load, then one pinned live turn. Registers and drives a real turn, so
 * "still loads AND still drives" is proven end to end through the real
 * binary, not merely offline.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  // A `| null` arm with a `null` initialiser conforms without a query,
  // mirroring bug 0176's H9a `CLEAN` fixture's own repair for the identical
  // let-rhs-type-mismatch hazard (bug 0130, TYPE-5) -- the cell's subject is
  // the field-name spelling, not the initialiser shape.
  "let x: {ys: string} | null = null",
  "@`What is 220 plus 503? Answer with the number only.`",
  "",
].join("\n");

/**
 * The offending theta (bug 0154 row i1's shape at a `let` annotation): an
 * ill-cased inline field name -- `{Ys: string}` -- registers with zero
 * diagnostics pre-fix. No query in the body: the pre-fix direction (where it
 * loads and `invoke` actually runs it) costs no extra model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let x: {Ys: string} | null = null",
  'let a = "OFFENDER BODY RAN"',
  "a",
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>` -- mirrors bug 0176's H9a
 * `PROBE`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./cellbcmoffender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "OFFENDER LOADED",',
  '  Err(e) => "OFFENDER REFUSED"',
  "}",
  "@`Reply with exactly this text and nothing else, no punctuation: ${verdict}`",
  "",
].join("\n");

const REFUSED = "OFFENDER REFUSED";
const LOADED = "OFFENDER LOADED";
// The drive discriminator is the ANSWER to the theta's own arithmetic
// prompt: deterministic content a degraded plain-prompt run (the slash
// falling through as a user prompt) cannot produce. A verbatim-echo demand
// ("reply with exactly this") reads as prompt injection to current models
// and draws refusals -- the documented sentinel-refusal class.
const CLEAN_SENTINEL = "723";

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

describe("-- H9a live: bug 0154 binding-case-mismatch refusal at the inline object field-name slot through the real `pi -p`, and the lowercase-first sibling end to end", () => {
  it(": refuses the theta whose annotation carries `{Ys: string}`, still registers and drives the lowercase-first `{ys: string}` sibling, and measures whether the code reaches the H9a capture", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the fixed code and the other
    // two sources are clean, so neither live sentinel can be produced by an
    // unrelated load failure.
    expect(
      codesOf(OFFENDER, "cellbcmoffender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, ${CODE}; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "cellbcmoffender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(PROBE, "cellbcmprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "cellbcmclean.theta"),
      "attribution: the lowercase-first sibling must carry zero diagnostics -- the fix must not disturb the good path",
    ).toEqual([]);

    // Live-host precondition -- fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-cellbcm-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-cellbcm-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-cellbcm-cwd-"));
    try {
      writeFileSync(join(thetaDir, "cellbcmoffender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "cellbcmprobe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "cellbcmclean.theta"), CLEAN, "utf8");

      // ---- (1) the lowercase-first sibling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/cellbcmclean",
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the lowercase-first sibling must register and DRIVE a real turn -- without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_SENTINEL);
      // bug 0030's empty-capture gate, applied inline: a diagnostic-free run
      // must show 0 bytes of stderr, the same property every H9a area
      // asserts.
      expect(
        clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the lowercase-first sibling must carry NO theta/{load,parse,runtime}/* code at all -- the fix must not emit anything on the good path.",
      ).toEqual([]);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/cellbcmprobe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's invoke("./cellbcmoffender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means bug 0154 is unfixed. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);

      // ---- MEASUREMENT (obligation 3(c)) ----
      // Scan the probe's combined stdout+stderr for the fixed code with the
      // SAME regex the nine-area H9a manifest's `permittedCodesSubset`
      // invariant uses. This is the actual measurement the
      // permitted-codes.json disposition is based on -- never an assumption.
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
