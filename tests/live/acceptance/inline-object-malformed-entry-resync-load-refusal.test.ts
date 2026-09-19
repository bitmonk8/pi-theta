// Lane-wave marker for the parallel merge of this wave's live additions:
//
// H9a live acceptance -- bug 0231: `TypeParser.parseObject`'s malformed-field
// `break` discarded every entry behind the first one that did not spell
// `Ident ":"`, so a well-formed field's own diagnostic went unchecked --
// and at a generic type argument (`array<...>`, bug 0227's registered
// raw-key carve-out) the field-name case rule was the ONLY check that would
// have fired, so `array<{a b: integer, Zs: string}> = [1]` loaded with an
// EMPTY diagnostic list and REGISTERED
// (docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md
// §Reproduction (d), row d1). §Fix (a) route 1 resynchronises the field loop
// at the malformed entry's next depth-0 `,` instead of ending the loop
// there, so `Zs`'s `theta/parse/binding-case-mismatch` now reaches the
// registration gate through the real `pi -p` binary.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/inline-object-malformed-entry-resync.test.ts` group (D) pins the
// diagnostic bytes and the `registers()` predicate at the
// `parseThetaDocument` boundary; the H8a cell
// (`tests/live/inline-object-malformed-entry-resync-live.test.ts`)
// drives the same input through the shipped `createAgentSession`
// composition but never through the real `pi` BINARY in non-interactive
// print mode. This file spawns the real `pi -p` binary, mirroring
// `tests/live/acceptance/inline-object-field-name-case-load-refusal.test.ts`
// structure exactly (offender / probe / clean, same two measurements
// below).
//
// WHY THE REFUSAL IS OBSERVED THROUGH `invoke`, NOT AS A PRINTED DIAGNOSTIC OR
// A DIRECT SLASH INVOCATION -- the same two measurements
// `ctor-unresolved-load-refusal.test.ts` and bug 0176's H9a file record,
// reused here because they are properties of the SHIPPED session_start /
// print-mode plumbing, not of this bug: (1) load diagnostics route to the
// `theta-system-note` channel, which is not streamed to `pi -p` print-mode
// stdout; (2) invoking an unregistered slash directly makes `pi -p` hang with
// zero bytes on both streams. This file therefore drives the offender
// indirectly via `invoke("./cellmerooffender.theta")` from a well-formed
// prober, converting the refusal into one of two committed stdout sentinels
// through a `match` over the untyped `invoke`'s `Result<null, QueryError>` --
// never asserting on a promise merely resolving.
//
// ZERO-TOKEN REPRODUCTION: the offender and the probe reproduce §Reproduction
// (d) row d1's shape at a generic type argument -- no query anywhere in
// either body -- so the offender/probe spawn compiles-and-loads only; only
// the CLEAN spawn's final untyped query and the PROBE's own final untyped
// query spend tokens (one line each, sentinel-pinned).
//
// MEASUREMENT (obligation 3(c) -- permitted-codes decision by measurement,
// never by assumption): the probe run's stdout+stderr is scanned with the
// SAME `parseSystemNoteCodes` regex the nine-area H9a manifest scores area
// (a)-(i) against, for the literal string
// `theta/parse/binding-case-mismatch`. See the cell body for the recorded
// result.
//
// SCOPE ISOLATION (bug 0030), same rule bug 0176's H9a file states for
// itself: this file is deliberately OUTSIDE the nine-area H9a manifest. It
// adds no `FeatureArea`, touches none of the nine committed fixtures under
// `./fixtures`, and uses its own temp discovery roots. The CLEAN spelling's
// own spawn IS scored by `assertStderrClean`'s empty-capture rule (bug 0030
// §Fix) directly, inline. The offender/probe spawn is NOT scored by that
// gate for the same reason bug 0154's H9a file states: its whole purpose is
// to observe a refusal that does not reach stdout/stderr at all.
//
// SUBAGENT CHILD PINS: NOT required. Every theta below is `mode: prompt`,
// and `invoke` between two `mode: prompt` thetas suspends the parent and
// attaches the callee to the caller's own session -- no RFC-0006 child
// process launches on this path. The pins are supplied anyway by the shared
// harness (`spawnPiPrint` sets `PI_THETA_SUBAGENT_EXTENSION_PIN`, and the
// outer process carries `-ne -e <this tree's extensions>`).
//
// Token-bounded: two `pi -p` spawns, one pinned single-sentence turn each.

import { describe, expect, it } from "vitest";
import { requireLiveHost } from "./harness";
import { codesOf, diagnosticsOf } from "../../helpers/e2e-s1";
import { expectOffenderProbeClean } from "../../helpers/pi-print-fixture-harness";

/** The registered code bug 0231's fix reaches at a generic argument (row d1). */
const CODE = "theta/parse/binding-case-mismatch";

/**
 * The CLEAN spelling: the case-fixed sibling of the same generic-argument
 * annotation -- `{a: integer, zs: string}` in place of
 * `{a b: integer, Zs: string}` -- bound to a literal, zero-token load, then
 * one pinned live turn.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  "let x: array<{a: integer, zs: string}> | null = null",
  "@`What is 341 plus 415? Answer with the number only.`",
  "",
].join("\n");

/**
 * The offending theta (§Reproduction (d) row d1's exact shape): a malformed
 * inline entry (`a b`) followed by a well-formed field (`Zs`) whose case
 * violation is the ONLY check reachable at a generic type argument.
 * Registers with an EMPTY diagnostic list pre-fix. No query in the body: the
 * pre-fix direction (where it loads and `invoke` actually runs it) costs no
 * extra model turn.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "let x: array<{a b: integer, Zs: string}> = [1]",
  'let a = "OFFENDER BODY RAN"',
  "a",
  "",
].join("\n");

/**
 * The prober: well-formed, registers either way, and converts the offender's
 * load disposition into one of two committed sentinels through a `match` over
 * the untyped `invoke`'s `Result<null, QueryError>` -- mirrors bug 0154's H9a
 * `PROBE`.
 */
const PROBE = [
  "---",
  "mode: prompt",
  "---",
  'let r = invoke("./cellmerooffender.theta")',
  "let verdict = match r {",
  '  Ok(v) => "352",',
  '  Err(e) => "953"',
  "}",
  "@`A load probe reported code ${verdict}. What is that code plus 1000? Answer with the number only.`",
  "",
].join("\n");

const REFUSED = "1953";
const LOADED = "1352";
// The drive discriminator is the ANSWER to the theta's own arithmetic
// prompt: deterministic content a degraded plain-prompt run (the slash
// falling through as a user prompt) cannot produce. A verbatim-echo demand
// ("reply with exactly this") reads as prompt injection to current models
// and draws refusals -- the documented sentinel-refusal class.
const CLEAN_SENTINEL = "756";

describe("-- H9a live: bug 0231 field-loop resynchronisation reaches a well-formed field's case violation behind a malformed generic-argument entry through the real `pi -p`", () => {
  it(": refuses `array<{a b: integer, Zs: string}> = [1]`, still registers and drives the case-fixed sibling, and measures whether the code reaches the H9a capture", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the fixed code set and the
    // other two sources are clean, so neither live sentinel can be produced
    // by an unrelated load failure. Since bug 0233's widen (0.196.0) the
    // malformed `a b` entry inside the generic argument ALSO draws
    // `theta/parse/inline-field-name-not-identifier` beside the case
    // refusal this cell witnesses — an entailed second diagnostic, ratified
    // at merge under 0233's origin authority; the cell's subject (0231's
    // resync reaching `Zs`'s case rule) is unchanged.
    expect(
      codesOf(OFFENDER, "cellmerooffender.theta"),
      `attribution: the offending theta must carry exactly the fixed code set [binding-case-mismatch, inline-field-name-not-identifier]; actual=${JSON.stringify(diagnosticsOf(OFFENDER, "cellmerooffender.theta"))}`,
    ).toEqual([CODE, "theta/parse/inline-field-name-not-identifier"]);
    expect(
      diagnosticsOf(PROBE, "cellmeroprobe.theta"),
      "attribution: the prober must be clean, so it registers and its verdict reflects the OFFENDER's disposition only",
    ).toEqual([]);
    expect(
      diagnosticsOf(CLEAN, "cellmeroclean.theta"),
      "attribution: the case-fixed sibling must carry zero diagnostics -- the fix must not disturb the good path",
    ).toEqual([]);

    // Live-host precondition -- fails loudly naming the unmet precondition
    // (`resolveAcceptanceHost`); never a skip or early return.
    await requireLiveHost();

    await expectOffenderProbeClean({
      slug: "cellmero",
      files: {
        "cellmerooffender.theta": OFFENDER,
        "cellmeroprobe.theta": PROBE,
        "cellmeroclean.theta": CLEAN,
      },
      clean: {
        slashInvocation: "/cellmeroclean",
        expected: CLEAN_SENTINEL,
        message: (clean) => `clean: the case-fixed sibling must register and DRIVE a real turn -- without this the refusal assertion below could pass vacuously (wrong root, no registration at all). stdout: ${clean.stdout} stderr: ${clean.stderr}`,
        codesMessage: "clean: the case-fixed sibling must carry NO theta/{load,parse,runtime}/* code at all -- the fix must not emit anything on the good path.",
      },
      probe: {
        slashInvocation: "/cellmeroprobe",
        expected: REFUSED,
        unexpected: LOADED,
        message: (probe) => `probe: the offending theta must NOT load post-fix, so the prober's invoke("./cellmerooffender.theta") resolves Err(InvokeInfraError) and the match prints "${REFUSED}". Printing "${LOADED}" means bug 0231's fix did not reach this generic-argument position. stdout: ${probe.stdout} stderr: ${probe.stderr}`,
      },
      measurementMessage: (probe, observedCodes) => `MEASUREMENT: ${CODE} ${observedCodes.includes(CODE) ? "DOES" : "does NOT"} reach the H9a stdout+stderr capture for this refusal path (probe stdout: ${probe.stdout} stderr: ${probe.stderr}). This is the recorded evidence for the permitted-codes.json disposition (obligation 3(c)).`,
    });
  });
});
