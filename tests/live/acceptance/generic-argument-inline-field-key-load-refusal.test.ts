//
// H9a live acceptance — bug 0233: an inline object type reached through a
// generic type argument carries no raw-key judgement, because `walkType`'s
// `object` arm gates its whole raw-key loop on `!insideGenericArgument`
// (`src/parser/type-grammar.ts:1122`) while the `generic` arm sets that flag
// unconditionally for every argument subtree (`:1051`). So
// `array<{a b: string}>` loads with zero diagnostics and REGISTERS, where the
// byte-identical bare interior `{a b: string}` draws
// `theta/parse/inline-field-name-not-identifier` (E, parse). §Fix (a) route 1
// drops `!insideGenericArgument` from that gate, leaving the closing-brace gate
// alone, so the refusal reaches this position too — and the conformant generic
// sibling `array<{ab: string}>` still registers and drives
// (docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/generic-argument-inline-field-key-rules.test.ts` pins the diagnostic
// bytes, the lowerings and the `params:` frontmatter withhold at the
// `parseThetaDocument` boundary; the H8a cell
// (`tests/live/generic-argument-inline-field-key-live-cell.test.ts`)
// drives the same input through the shipped `createAgentSession` composition
// but never through the real `pi` BINARY in non-interactive print mode. This
// file spawns the real `pi -p` binary, so it is the one witness that covers
// real extension auto-load, flag/arg parsing, and discovery the way an operator
// actually invokes theta -- mirroring the structure bug 0228 shipped at this
// same parser leaf
// (`tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts`):
// offender / probe / clean, same two measurements below.
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION -- the same two measurements bugs 0154 / 0160 /
// 0228's H9a files record, reused here because they are properties of the
// SHIPPED session_start / print-mode plumbing, not of this bug: (1) load
// diagnostics route to the `theta-system-note` channel, which is not streamed
// to `pi -p` print-mode stdout; (2) invoking an unregistered slash directly
// makes `pi -p` hang with zero bytes on both streams. This file therefore
// drives the offender indirectly via `invoke("./gaoffender.theta")` from a
// well-formed prober, converting the refusal into one of two committed stdout
// sentinels through a `match` over the untyped `invoke`'s
// `Result<null, QueryError>` -- never asserting on a promise merely resolving.
//
// ZERO-TOKEN REPRODUCTION: both the offender and the clean sibling carry the
// inline object type at a `let` annotation bound to `null` through a `| null`
// arm -- no query in either annotation, and no `theta/parse/let-rhs-type-mismatch`
// able to mask the subject (bug 0130, TYPE-5) -- so the offender spawn
// compiles-and-loads only; only the CLEAN spawn's final untyped query and the
// PROBE's own final untyped query spend tokens (one line each, sentinel-pinned).
//
// MEASUREMENT (permitted-codes decision by measurement, never by assumption):
// the probe run's stdout+stderr is scanned with the SAME `parseSystemNoteCodes`
// regex the nine-area H9a manifest scores area (a)-(i) against, for the literal
// string `theta/parse/inline-field-name-not-identifier`. The assertion below
// records the expected disposition -- bugs 0176, 0154, 0160 and 0228 each
// measured `[]` for this class, the load-time refusal reaching only the
// theta-system-note channel -- and `tests/fixtures/h7a/permitted-codes.json` is
// therefore left byte-untouched by this file. Its final disposition is decided
// by the REAL H9a run, on this cell's recorded evidence; nothing here adds a
// code to that fixture.
//
// SCOPE ISOLATION (bug 0030), the same rule bugs 0154 / 0160 / 0228's H9a files
// state for themselves: this file is deliberately OUTSIDE the nine-area H9a
// manifest. It adds no `FeatureArea`, touches none of the nine committed
// fixtures under `./fixtures`, and uses its own temp discovery roots. The CLEAN
// spelling's own spawn IS scored by the empty-capture rule (bug 0030 §Fix)
// directly, inline, since that gate is a property of the shipped print-mode
// plumbing this cell exercises the same way every H9a area does. The
// offender/probe spawn is NOT scored by that gate: its whole purpose is to
// observe a refusal, and the two measurements above already establish that this
// class of diagnostic does not reach stdout/stderr at all.
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

/** Bug 0228's raw-key row, which §Fix (a) route 1 widens into generic arguments. */
const CODE = "theta/parse/inline-field-name-not-identifier";

/**
 * The CLEAN spelling: the CONFORMANT generic sibling of the same annotation --
 * `array<{ab: string}>` in place of `array<{a b: string}>` -- bound to `null`,
 * zero-token load, then one pinned live turn. This is §Reproduction (f) row
 * f1's no-move bound at the real-binary face: route 1 must refuse the KEY, not
 * the position.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  "let x: array<{ab: string}> | null = null",
  "@`Reply with exactly this text and nothing else, no punctuation: H9A CLEAN SENTINEL 0233`",
  "",
].join("\n");

/**
 * The offending theta: an inline object whose field name spells two identifiers
 * separated by a space, reached through ONE generic argument. Registers with
 * zero diagnostics pre-fix -- that silence is bug 0233 -- so the pre-fix
 * direction (where it loads and `invoke` actually runs it) costs no extra model
 * turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let x: array<{a b: string}> | null = null",
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
  'let r = invoke("./gaoffender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "OFFENDER LOADED",',
  '  Err(e) => "OFFENDER REFUSED"',
  "}",
  "@`Reply with exactly this text and nothing else, no punctuation: ${verdict}`",
  "",
].join("\n");

const REFUSED = "OFFENDER REFUSED";
const LOADED = "OFFENDER LOADED";
const CLEAN_SENTINEL = "H9A CLEAN SENTINEL 0233";

/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}

describe("-- H9a live: bug 0233 raw-key refusal inside a generic type argument through the real `pi -p`, and the conformant generic sibling end to end", () => {
  it(": refuses the theta whose annotation carries `array<{a b: string}>`, still registers and drives the conformant `array<{ab: string}>` sibling, and measures whether the code reaches the H9a capture", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the raw-key code and the other
    // two sources are clean, so neither live sentinel can be produced by an
    // unrelated load failure. At HEAD this guard reds first with the offender's
    // list EMPTY, which IS bug 0233's symptom -- zero tokens spent.
    expect(
      codesOf(OFFENDER, "gaoffender.theta"),
      `attribution: the offending theta must carry exactly one diagnostic, ${CODE}; an EMPTY list is bug 0233's own symptom (the raw-key gate withheld the row inside the generic argument); actual=${JSON.stringify(diagnosticsOf(OFFENDER, "gaoffender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      diagnosticsOf(PROBE, "gaprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "gaclean.theta"),
      "attribution: the conformant generic sibling must carry zero diagnostics -- widening the gate must refuse the KEY, not the position (§Reproduction (f) row f1)",
    ).toEqual([]);

    // Live-host precondition -- fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0233-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b0233-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b0233-cwd-"));
    try {
      writeFileSync(join(thetaDir, "gaoffender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "gaprobe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "gaclean.theta"), CLEAN, "utf8");

      // ---- (1) the conformant generic sibling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/gaclean",
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the conformant generic sibling must register and DRIVE a real turn -- without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_SENTINEL);
      expect(
        clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the conformant generic sibling must carry NO theta/{load,parse,runtime}/* code at all -- the widened gate must emit nothing on the good path.",
      ).toEqual([]);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/gaprobe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load, so the prober's invoke("./gaoffender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means bug 0233's generic-argument carve-out is still withholding the raw-key rows, so an interior deriving from no \`ObjectType\` still registers. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);

      // ---- MEASUREMENT (permitted-codes disposition) ----
      // Scan the probe's combined stdout+stderr for the code with the SAME
      // regex the nine-area H9a manifest's `permittedCodesSubset` invariant
      // uses. This is the actual measurement the permitted-codes.json
      // disposition rests on -- never an assumption, and this file adds no code
      // to that fixture.
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
