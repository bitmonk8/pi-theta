// Lane-wave marker for the parallel merge of this wave's live additions:
//
// H9a live acceptance — bug 0160: an inline object type's `as "WireName"`
// rename is refused end to end through the real `pi -p` binary
// (`theta/parse/renamed-inline-field-name`, E, parse), and the rename-free
// sibling of the same annotation still registers and drives
// (docs/bugs/0160-inline-object-wire-name-rename-unparsed.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/inline-object-wire-name-rename-refusal.test.ts` pins the diagnostic
// bytes at the `parseThetaDocument` boundary; the H8a cell
// (`tests/live/inline-object-wire-name-rename-live-cell.test.ts`) drives the
// same input through the shipped `createAgentSession` composition but never
// through the real `pi` BINARY in non-interactive print mode. This file spawns
// the real `pi -p` binary, so it is the one witness that covers real extension
// auto-load, flag/arg parsing, and discovery the way an operator actually
// invokes theta -- mirroring the structure bug 0154 shipped one commit ago
// (`tests/live/acceptance/inline-object-field-name-case-load-refusal.test.ts`):
// offender / probe / clean, same two measurements below.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION -- the same two measurements
// `ctor-unresolved-load-refusal.test.ts` and bug 0154's H9a file record, reused
// here because they are properties of the SHIPPED session_start / print-mode
// plumbing, not of this bug: (1) load diagnostics route to the
// `theta-system-note` channel, which is not streamed to `pi -p` print-mode
// stdout; (2) invoking an unregistered slash directly makes `pi -p` hang with
// zero bytes on both streams. This file therefore drives the offender
// indirectly via `invoke("./renoffender.theta")` from a well-formed prober,
// converting the refusal into one of two committed stdout sentinels through a
// `match` over the untyped `invoke`'s `Result<null, QueryError>` -- never
// asserting on a promise merely resolving.
//
// ZERO-TOKEN REPRODUCTION: both the offender and the clean sibling carry the
// inline object type at a `let` annotation bound to a literal -- no query in
// either body's annotation -- so the offender spawn compiles-and-loads only;
// only the CLEAN spawn's final untyped query and the PROBE's own final untyped
// query spend tokens (one line each, sentinel-pinned).
//
// MEASUREMENT (permitted-codes decision by measurement, never by assumption):
// the probe run's stdout+stderr is scanned with the SAME `parseSystemNoteCodes`
// regex the nine-area H9a manifest scores area (a)-(i) against, for the literal
// string `theta/parse/renamed-inline-field-name`. The assertion below records
// the expected disposition -- bugs 0176 and 0154 each measured `[]` for this
// class, the load-time refusal reaching only the theta-system-note channel --
// and `tests/fixtures/h7a/permitted-codes.json` is therefore left byte-
// untouched by this file.
//
// SCOPE ISOLATION (bug 0030), the same rule bug 0154's H9a file states for
// itself: this file is deliberately OUTSIDE the nine-area H9a manifest. It adds
// no `FeatureArea`, touches none of the nine committed fixtures under
// `./fixtures`, and uses its own temp discovery roots. The CLEAN spelling's own
// spawn IS scored by the empty-capture rule (bug 0030 §Fix) directly, inline,
// since that gate is a property of the shipped print-mode plumbing this cell
// exercises the same way every H9a area does. The offender/probe spawn is NOT
// scored by that gate: its whole purpose is to observe a refusal, and the two
// measurements above already establish that this class of diagnostic does not
// reach stdout/stderr at all.
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

/** The code bug 0160 §Fix (c) mints (src/parser/type-grammar.ts, `walkType`'s object arm). */
const CODE = "theta/parse/renamed-inline-field-name";

/**
 * The CLEAN spelling: the rename-free sibling of the same annotation --
 * `{wire: string}` in place of `{a as "w": string}` -- bound to a literal,
 * zero-token load, then one pinned live turn. Registers and drives, so "still
 * loads AND still drives" is proven end to end through the real binary.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  // A `| null` arm with a `null` initialiser conforms without a query,
  // mirroring bug 0154's H9a `CLEAN` fixture's own repair for the identical
  // let-rhs-type-mismatch hazard (bug 0130, TYPE-5) -- the cell's subject is
  // the field spelling, not the initialiser shape.
  "let x: {wire: string} | null = null",
  "@`Reply with exactly this text and nothing else, no punctuation: H9A CLEAN SENTINEL 0160`",
  "",
].join("\n");

/**
 * The offending theta: the inline rename spelling `schemas.md`
 * §"Wire-name renaming" defines, which registers with zero diagnostics pre-fix.
 * No query in the body: the pre-fix direction (where it loads and `invoke`
 * actually runs it) costs no extra model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  'let x: {a as "w": string} | null = null',
  'let a = "OFFENDER BODY RAN"',
  "a",
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
  'let r = invoke("./renoffender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "OFFENDER LOADED",',
  '  Err(e) => "OFFENDER REFUSED"',
  "}",
  "@`Reply with exactly this text and nothing else, no punctuation: ${verdict}`",
  "",
].join("\n");

const REFUSED = "OFFENDER REFUSED";
const LOADED = "OFFENDER LOADED";
const CLEAN_SENTINEL = "H9A CLEAN SENTINEL 0160";

/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}

describe("-- H9a live: bug 0160 renamed-inline-field-name refusal at the inline object field slot through the real `pi -p`, and the rename-free sibling end to end", () => {
  it(': refuses the theta whose annotation carries `{a as "w": string}`, still registers and drives the rename-free `{wire: string}` sibling, and measures whether the code reaches the H9a capture', async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the new code and the other two
    // sources are clean, so neither live sentinel can be produced by an
    // unrelated load failure. A neutralised fix reds here with zero tokens.
    expect(
      codesOf(OFFENDER, "renoffender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, ${CODE}; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "renoffender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(PROBE, "renprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "renclean.theta"),
      "attribution: the rename-free sibling must carry zero diagnostics -- the refusal must not disturb the good path",
    ).toEqual([]);

    // Live-host precondition -- fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0160-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0160-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0160-cwd-"));
    try {
      writeFileSync(join(thetaDir, "renoffender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "renprobe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "renclean.theta"), CLEAN, "utf8");

      // ---- (1) the rename-free sibling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/renclean",
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the rename-free sibling must register and DRIVE a real turn -- without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_SENTINEL);
      expect(
        clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the rename-free sibling must carry NO theta/{load,parse,runtime}/* code at all -- the refusal must emit nothing on the good path.",
      ).toEqual([]);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/renprobe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's invoke("./renoffender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means bug 0160's inline rename is still admitted. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
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
