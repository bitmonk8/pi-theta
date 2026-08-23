// Lane token for this fix's cells: 
//
// H9a live acceptance -- bug 0237: an inline object entry whose TYPE position
// is empty truncated the interior at that entry, because
// `TypeParser.parsePrimary`'s tolerant punctuation skip ate the
// entry-separating `,` and returned the NEXT entry's name as the empty entry's
// type. A `params:` field spelled `p: '{a: , Zs: string}'` therefore loaded
// with an EMPTY diagnostic list, REGISTERED, and lowered the uppercase key `Zs`
// into the provider-facing `$defs` -- the key bug 0154's lowercase-first pass
// exists to refuse
// (docs/bugs/0237-empty-inline-field-type-truncates-interior.md
// §Reproduction (b) row b8 and §Reproduction (f) row f6). §Fix (a) route
// `resync-aware-skip`, narrowed to the `,`, stops that arm from consuming the
// entry separator an open `parseObject` field loop or `parseGeneric` argument
// list is itself still going to read — a `}` or a `>` is left to the
// pre-existing recovery — so `parseObject`'s field loop reads the whole
// interior, `Zs` reaches `TypeNode.fieldNames`, and
// `theta/parse/binding-case-mismatch` now reaches the registration gate through
// the real `pi -p` binary.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/inline-object-empty-field-type-truncation.test.ts` pins the diagnostic
// bytes and the withheld `params:` lowering at the `parseThetaDocument`
// boundary; the H8a cell
// (`tests/live/inline-object-empty-field-type-truncation-live-cell.test.ts`)
// drives the same input through the shipped `createAgentSession` composition
// but never through the real `pi` BINARY in non-interactive print mode. This
// file spawns the real `pi -p` binary, mirroring
// `tests/live/acceptance/inline-object-malformed-entry-resync-load-refusal.test.ts`
// and `tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts`
// structure exactly (offender / probe / clean, same two measurements below).
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION -- the same two measurements
// `ctor-unresolved-load-refusal.test.ts` and the sibling H9a files record,
// reused here because they are properties of the SHIPPED session_start /
// print-mode plumbing, not of this bug: (1) load diagnostics route to the
// `theta-system-note` channel, which is not streamed to `pi -p` print-mode
// stdout; (2) invoking an unregistered slash directly makes `pi -p` hang with
// zero bytes on both streams. This file therefore drives the offender
// indirectly via `invoke("./b237offender.theta")` from a well-formed prober,
// converting the refusal into one of two committed stdout sentinels through a
// `match` over the untyped `invoke`'s `Result<null, QueryError>` -- never
// asserting on a promise merely resolving. The prober calls `invoke` with NO
// argument: post-fix the offender fails to LOAD at all, so no static
// arity/shape information about it is ever available to the caller -- the same
// zero-argument shape the sibling bugs' H9a files use for their own
// `params:`-position offenders (bug 0232's `poffender`).
//
// ZERO-TOKEN REPRODUCTION: the offender carries its `params:` field type at
// load time with no query in its body, so the offender never spends a token in
// either direction; only the CLEAN spawn's final query and the PROBE's own
// final untyped query spend tokens (one line each, sentinel-pinned).
//
// MEASUREMENT (permitted-codes decision by measurement, never by assumption):
// the probe run's stdout+stderr is scanned with the SAME `parseSystemNoteCodes`
// regex the nine-area H9a manifest scores area (a)-(i) against, for the literal
// string `theta/parse/binding-case-mismatch`. The assertion below records the
// expected disposition -- the sibling annotation/params-position codes (bugs
// 0154/0228/0229/0231/0232) each measured `[]` for their own classes, the
// load-time refusal reaching only the theta-system-note channel -- and
// `tests/fixtures/h7a/permitted-codes.json` is therefore left byte-untouched by
// this file. This route mints NO new code at all (it is taken UNPAIRED), so no
// registry row and no permitted-codes entry is at stake either way; the
// measurement is recorded because the H9a capture is the channel the
// disposition is decided on.
//
// SCOPE ISOLATION (bug 0030), the same rule the sibling H9a files state for
// themselves: this file is deliberately OUTSIDE the nine-area H9a manifest. It
// adds no `FeatureArea`, touches none of the nine committed fixtures under
// `./fixtures`, and uses its own temp discovery roots. The CLEAN spelling's own
// spawn IS scored by the empty-capture rule (bug 0030 §Fix) directly, inline.
// The offender/probe spawn is NOT scored by that gate, for the reason bug
// 0154's H9a file states: its whole purpose is to observe a refusal that does
// not reach stdout/stderr at all.
//
// SUBAGENT CHILD PINS: NOT required. Every theta below is `mode: prompt`, and
// `invoke` between two `mode: prompt` thetas suspends the parent and attaches
// the callee to the caller's own session -- no RFC-0006 child process launches
// on this path. The pins are supplied anyway by the shared harness
// (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN`, and the outer process
// carries `-ne -e <this tree's extensions>`).
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each.

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failLoudly, parseSystemNoteCodes, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The registered code bug 0237's fix lets reach the `params:` position. */
const CODE = "theta/parse/binding-case-mismatch";

/**
 * The offending theta (§Reproduction (b) row b8 / §Reproduction (f) row f6's
 * exact shape): a `params:` field whose inline object type's FIRST entry has an
 * empty type position, followed by an uppercase-named well-formed field.
 * Pre-fix it registers with an EMPTY diagnostic list and mints
 * `"properties":{"Zs":{"type":"string"}}` into the provider-facing `$defs`. No
 * query in the body: the pre-fix direction (where it loads and `invoke`
 * actually runs it) costs no extra model turn. The `bind_model:` is the
 * non-bypass binder-model requirement an inline-object `params:` field carries
 * (`classifyBinderBypass`), so a missing binder model cannot explain the
 * refusal instead of this fix.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "bind_model: anthropic/claude-haiku-4-5",
  "params:",
  "  p: '{a: , Zs: string}'",
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
  'let r = invoke("./b237offender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "537",',
  '  Err(e) => "738"',
  "}",
  "@`A load probe reported code ${verdict}. What is that code plus 1000? Answer with the number only.`",
  "",
].join("\n");

// The drive discriminator is the ANSWER to the theta's own arithmetic
// prompt: deterministic content a degraded plain-prompt run (the slash
// falling through as a user prompt) cannot produce. A verbatim-echo demand
// ("reply with exactly this") reads as prompt injection to current models
// and draws refusals -- the documented sentinel-refusal class.
const CLEAN_SENTINEL = "737";

/**
 * The CLEAN spelling: the case-clean annotation sibling of the same inline
 * object shape -- every entry spells a type and every key is lowercase --
 * bound to a literal (zero-token load), then one pinned live turn. It must
 * still register and still drive, so the refusal above cannot pass vacuously
 * on a broken discovery root.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  "let x: array<{a: integer, zs: string}> | null = null",
  "@`What is 604 plus 133? Answer with the number only.`",
  "",
].join("\n");

const REFUSED = "1738";
const LOADED = "1537";

/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}

describe("-- H9a live: bug 0237's empty inline field type stops truncating the interior, so the params: document is refused through the real `pi -p` ", () => {
  it(": refuses `params:` `p: '{a: , Zs: string}'`, still registers and drives the case-clean sibling, and measures whether the code reaches the H9a capture ", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the fixed code and the other two
    // sources are clean, so neither live sentinel can be produced by an
    // unrelated load failure. The offender's list is the SPECIFIED value; at
    // HEAD it is `[]`, which is bug 0237 itself.
    expect(
      codesOf(OFFENDER, "b237offender.theta"),
      `attribution: the offending params: theta must carry exactly [${CODE}]; a measured [] is bug 0237's truncation still swallowing the entry separator. actual=${JSON.stringify(diagnosticsOf(OFFENDER, "b237offender.theta"))}`,
    ).toEqual([CODE]);
    expect(
      parseDoc(OFFENDER, "b237offender.theta").frontmatter,
      "attribution: a refused `params:` field withholds the WHOLE frontmatter object, so the uppercase key `Zs` reaches no provider-facing `$defs` (§Reproduction (f) row f6)",
    ).toBeNull();
    expect(
      diagnosticsOf(PROBE, "b237probe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "b237clean.theta"),
      "attribution: the case-clean sibling must carry zero diagnostics -- the fix must not disturb the good path",
    ).toEqual([]);

    // Live-host precondition -- fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b237-root-"));
    const cleanCwd = mkdtempSync(join(tmpdir(), "theta-b237-cwd-"));
    const probeCwd = mkdtempSync(join(tmpdir(), "theta-b237-cwd-"));
    try {
      writeFileSync(join(thetaDir, "b237offender.theta"), OFFENDER, "utf8");
      writeFileSync(join(thetaDir, "b237probe.theta"), PROBE, "utf8");
      writeFileSync(join(thetaDir, "b237clean.theta"), CLEAN, "utf8");

      // ---- (1) the case-clean sibling registers and drives ----
      const clean = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b237clean",
        cwd: cleanCwd,
      });
      expect(
        clean.exitCode,
        `clean: expected a no-error exit (0), got ${String(clean.exitCode)}. stderr: ${clean.stderr}`,
      ).toBe(0);
      expect(
        clean.stdout,
        `clean: the case-clean sibling must register and DRIVE a real turn -- without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
      ).toContain(CLEAN_SENTINEL);
      // bug 0030's empty-capture gate, applied inline: a diagnostic-free run
      // must show 0 bytes of stderr, the same property every H9a area asserts.
      expect(
        clean.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `clean: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${clean.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(clean.stdout + clean.stderr),
        "clean: the case-clean sibling must carry NO theta/{load,parse,runtime}/* code at all -- the fix must not emit anything on the good path.",
      ).toEqual([]);

      // ---- (2) the offending theta is refused, observed through invoke ----
      const probe = await spawnPiPrint({
        thetaDir,
        slashInvocation: "/b237probe",
        cwd: probeCwd,
      });
      expect(
        probe.exitCode,
        `probe: expected a no-error exit (0), got ${String(probe.exitCode)}. stderr: ${probe.stderr}`,
      ).toBe(0);
      expect(
        probe.stdout,
        `probe: the offending theta must NOT load post-fix, so the prober's invoke("./b237offender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means bug 0237's truncation still swallows the entry separator, so ${CODE} never fires and the uppercase key 'Zs' is still lowered into the provider-facing $defs. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      ).toContain(REFUSED);
      expect(
        probe.stdout,
        `probe: the Ok arm must not fire; stdout: ${probe.stdout}`,
      ).not.toContain(LOADED);

      // ---- MEASUREMENT (permitted-codes disposition) ----
      // Scan the probe's combined stdout+stderr for the code with the SAME
      // regex the nine-area H9a manifest's `permittedCodesSubset` invariant
      // uses. This is the actual measurement the disposition rests on -- never
      // an assumption.
      const observedCodes = parseSystemNoteCodes(probe.stdout + probe.stderr);
      expect(
        observedCodes,
        `MEASUREMENT: ${CODE} ${observedCodes.includes(CODE) ? "DOES" : "does NOT"} reach the H9a stdout+stderr capture for this refusal path (probe stdout: ${probe.stdout} stderr: ${probe.stderr}). This is the recorded evidence for the permitted-codes.json disposition; this route mints no new code, so no entry is added either way.`,
      ).toEqual([]);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(cleanCwd, { recursive: true, force: true });
      rmSync(probeCwd, { recursive: true, force: true });
    }
  });
});
