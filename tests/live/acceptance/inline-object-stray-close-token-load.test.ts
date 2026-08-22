// H9a live acceptance -- bug 0238: a stray depth-0 CLOSE token in an inline
// object type underflowed `splitTopLevelSegments`' depth counter, so every
// entry behind it merged into one unkeyed segment. A `params:` field spelled
// `p: '{a: integer, b > c, m: integer}'` loaded with an EMPTY diagnostic list,
// REGISTERED, and lowered `p` to a one-field `{a}` fragment whose
// `additionalProperties: false` REFUSES the declared field `m` -- §Reproduction
// row E2 measured the envelope validator answering `must NOT have additional
// properties`, `additionalProperty: "m"`, where the byte-neighbour control
// `{a: integer, m: integer}` (row E1) validates
// (docs/bugs/0238-stray-close-token-underflows-top-level-split.md). §Fix route
// (a) -- CLAMP TO MATCH as a TYPED opener stack in `splitTopLevelSegments` /
// `topLevelColon` (src/parser/params.ts) and `TypeParser.skipMalformedEntry`
// (src/parser/type-grammar.ts) -- makes the offender's lowered fragment carry
// BOTH declared fields, so the caller's `m` is accepted end to end. Citations
// are by SYMBOL, not by line: bug 0134 is the adjudicated stale-citation class
// for absolute line numbers into src/parser/params.ts, which this route edits.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS AND THE H8a CELL DO NOT.
// `tests/inline-object-stray-close-token-split.test.ts` pins the diagnostics,
// the lowered fragments and the E1/E2 validator rows at the
// `parseThetaDocument` boundary; the H8a cell
// (`tests/live/inline-object-stray-close-token-live-cell.test.ts`) drives the
// same pair through the shipped `createAgentSession` composition, but never
// through the real `pi` BINARY. This file spawns the real `pi -p`, mirroring
// `tests/live/acceptance/inline-object-empty-field-type-truncation-load-refusal.test.ts`
// and `tests/live/acceptance/params-unterminated-literal-load-refusal.test.ts`
// structure.
//
// THE OBSERVABLE IS THE INVERSE OF THE SIBLING FILES'. Those refuse a theta at
// load, and observe the refusal indirectly through a prober's `invoke` because
// load diagnostics never reach `pi -p` print-mode stdout. Bug 0238's offender
// REGISTERS both before and after the fix, so no `invoke` prober is needed and
// none is used: the offender is invoked DIRECTLY, and the fixed observable is
// the arithmetic answer over two values that could only both reach the body if
// the registered contract accepted the declared field `m`.
//
// SENTINEL DISCIPLINE: the discriminator is the ANSWER to the theta's own
// question over the two INTERPOLATED bound values (17 * 23 = 391), never a
// "reply with exactly this string" echo (the documented sentinel-refusal class,
// AGENTS.md). 391 is not computable from a bind that dropped `m`.
//
// BIND MODEL: both thetas' `bind_model:` line is re-derived from
// `resolveAcceptanceHost()` at spawn time rather than hardcoded -- the bug 0064
// rule `materialiseHostBoundThetaDir` states for the committed area-(d)
// fixture: a hardcoded model the shared preference rule never picks hides every
// binder request-shape fact that holds only on the preferred model. Two fields
// inside `p` make this a genuine binder pass (never `classifyBinderBypass`'s
// single-string bypass), so an unresolvable binder model would deny
// registration outright and could not be mistaken for this bug.
//
// MEASUREMENT (permitted-codes by measurement, never by assumption): each run's
// stdout+stderr is scanned with the SAME `parseSystemNoteCodes` regex the
// nine-area H9a manifest scores area (a)-(i) against, and the observed codes
// are asserted to be a SUBSET of the committed
// `tests/fixtures/h7a/permitted-codes.json`. This route mints NO code and
// narrows no registry row, so no permitted-codes entry is at stake either way;
// the file is left byte-untouched and the measured set is rendered into the
// failure message so the real run -- not an assumption -- decides.
//
// SCOPE ISOLATION (bug 0030): this file is deliberately OUTSIDE the nine-area
// H9a manifest. It adds no `FeatureArea`, touches none of the nine committed
// fixtures under `./fixtures`, and uses its own temp discovery roots. Both
// spawns ARE scored inline by the empty-capture stderr gate, because both
// spellings are expected to drive CLEAN post-fix (unlike the sibling refusal
// files, whose offender spawn observes something that reaches no stream).
//
// SUBAGENT CHILD PINS: not reached -- both thetas are `mode: prompt` with no
// `tools:` and no `invoke(...)`, so no RFC-0006 child launches. The shared
// harness supplies them anyway (`spawnPiPrint` sets
// `PI_THETA_SUBAGENT_EXTENSION_PIN` plus the parent-pid carriage, and the outer
// process carries `-ne -e <this tree's extensions>`).
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveHost` / `resolveAcceptanceHost` (`failLoudly`).
//
// Token-bounded: two `pi -p` spawns, one binder pass plus one short body turn
// each. 

import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  failLoudly,
  loadPermittedCodes,
  parseSystemNoteCodes,
  requireLiveHost,
  resolveAcceptanceHost,
  spawnPiPrint,
} from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";

/** The two declared values the slash argument names; their product is the oracle. */
const A_VALUE = 17;
const M_VALUE = 23;
/** 17 * 23 -- computable only from values that BOTH reached the body. */
const PRODUCT = String(A_VALUE * M_VALUE);

/** The committed marker prefixing the rendered outbound turn. */
const BODY_MARKER = "B0238-BOUND";

const OFFENDER_STEM = "b0238live-stray";
const CONTROL_STEM = "b0238live-control";

/** The slash argument naming both values in natural language (the binder's input). */
const SLASH_ARG = ` a is ${String(A_VALUE)} and m is ${String(M_VALUE)}`;

/**
 * One `params:` theta over a single inline-object field `p`, differing ONLY in
 * the declared type text. The body interpolates BOTH bound values behind a
 * committed marker and asks for their product, so the run carries the bound
 * values and the arithmetic answer on the one stdout capture.
 */
function paramsTheta(fieldType: string, bindModel: string): string {
  return [
    "---",
    "mode: prompt",
    `bind_model: ${bindModel}`,
    "params:",
    `  p: '${fieldType}'`,
    "---",
    "@`" +
      BODY_MARKER +
      " a=${p.a} m=${p.m}. What is ${p.a} times ${p.m}? Reply with only the resulting " +
      "integer digits and nothing else.`",
    "",
  ].join("\n");
}

/** §Reproduction row W2 -- the stray depth-0 `>` between the two declared fields. */
const OFFENDER_TYPE = "{a: integer, b > c, m: integer}";
/** §Reproduction row W1 -- the byte-neighbour control the offender must converge on. */
const CONTROL_TYPE = "{a: integer, m: integer}";

/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * The lowered `params:` schema of one source with the `$defs` content hash
 * normalised away: the two spellings hash DIFFERENT source text, so only the
 * fragment CONTENT can be compared -- and content equality is exactly "the
 * offender converged on the control". 
 */
function normalisedLowering(text: string, path: string): string {
  const lowered = parseDoc(text, path).frontmatter?.params?.loweredSchema ?? null;
  return JSON.stringify(lowered).replace(/__inline_[0-9a-f]+/g, "__inline_HASH");
}

describe("H9a live: bug 0238's stray depth-0 close token no longer deletes a declared params: field, so the real `pi -p` binds it end to end ", () => {
  it("registers and drives `p: '{a: integer, b > c, m: integer}'` with BOTH declared fields bound, exactly as its byte-neighbour control, with no unpermitted code in the capture ", async () => {
    // Live-host precondition -- fails loudly naming the unmet precondition;
    // never a skip or early return. Resolved first because the `bind_model:`
    // line of both fixtures is re-derived from it (bug 0064).
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver returned an empty model id.",
      );
    }
    const host = await resolveAcceptanceHost();
    if (host.provider === "" || host.model === "") {
      failLoudly(
        `live-host precondition unmet: the resolved host is not provider-qualifiable (provider '${host.provider}', model '${host.model}'), so \`bind_model:\` cannot be re-derived from the shared model-selection rule.`,
      );
    }
    const bindModel = `${host.provider}/${host.model}`;
    const offender = paramsTheta(OFFENDER_TYPE, bindModel);
    const control = paramsTheta(CONTROL_TYPE, bindModel);

    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE any spawn): both
    // spellings load clean -- this route mints no code -- and the offender's
    // lowered fragment is byte-equal to the control's modulo the `$defs` hash.
    // At HEAD the offender lowers `{"a":{"type":"integer"}}` with `required
    // ["a"]` and `additionalProperties: false`, which is bug 0238 itself, so a
    // neutralised fix reds here with zero tokens spent.
    expect(
      diagnosticsOf(offender, `${OFFENDER_STEM}.theta`),
      "attribution: the offending params: theta must still load clean -- §Fix route (a) repairs " +
        "the segmentation and mints no diagnostic for this spelling",
    ).toEqual([]);
    expect(
      diagnosticsOf(control, `${CONTROL_STEM}.theta`),
      "attribution: the byte-neighbour control must carry zero diagnostics",
    ).toEqual([]);
    expect(
      normalisedLowering(offender, `${OFFENDER_STEM}.theta`),
      "attribution: the offender's lowered params: fragment must be byte-equal to the control's " +
        "(modulo the `$defs` content hash). A fragment missing `m` is §Reproduction row W2 at " +
        "HEAD: `additionalProperties: false` then FORBIDS the field the author declared " +
        "(§Reproduction row E2).",
    ).toEqual(normalisedLowering(control, `${CONTROL_STEM}.theta`));
    expect(
      normalisedLowering(offender, `${OFFENDER_STEM}.theta`),
      "attribution: sanity -- the shared fragment must declare BOTH fields, so the equality " +
        "above cannot be satisfied by two empty lowerings",
    ).toContain('"required":["a","m"]');

    const thetaDir = mkdtempSync(join(tmpdir(), "theta-b0238-root-"));
    const controlCwd = mkdtempSync(join(tmpdir(), "theta-b0238-cwd-"));
    const offenderCwd = mkdtempSync(join(tmpdir(), "theta-b0238-cwd-"));
    try {
      writeFileSync(join(thetaDir, `${OFFENDER_STEM}.theta`), offender, "utf8");
      writeFileSync(join(thetaDir, `${CONTROL_STEM}.theta`), control, "utf8");

      const permitted = loadPermittedCodes();

      // ---- (1) CONTROL: the reference run, spawned FIRST so a provider-side
      // problem reds against the spelling that is green at HEAD too. ----
      const controlRun = await spawnPiPrint({
        thetaDir,
        slashInvocation: `/${CONTROL_STEM}${SLASH_ARG}`,
        cwd: controlCwd,
      });
      expect(
        controlRun.exitCode,
        `control: expected a no-error exit (0), got ${String(controlRun.exitCode)}. stderr: ${controlRun.stderr}`,
      ).toBe(0);
      expect(
        controlRun.stdout,
        `control: the byte-neighbour control must register and DRIVE a real binder pass + body turn -- without it the offender assertion below would be unattributable. stdout: ${controlRun.stdout} stderr: ${controlRun.stderr}`,
      ).toContain(PRODUCT);
      expect(
        controlRun.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `control: stderr must be empty for a diagnostic-free run (bug 0030 §Fix empty-capture gate). stderr: ${controlRun.stderr}`,
      ).toEqual([]);
      expect(
        parseSystemNoteCodes(controlRun.stdout + controlRun.stderr).filter(
          (code) => !permitted.includes(code),
        ),
        `control: the capture carries a code absent from tests/fixtures/h7a/permitted-codes.json. observed=${JSON.stringify(parseSystemNoteCodes(controlRun.stdout + controlRun.stderr))} stdout: ${controlRun.stdout} stderr: ${controlRun.stderr}`,
      ).toEqual([]);

      // ---- (2) OFFENDER: the fixed observable, through the real binary. ----
      const offenderRun = await spawnPiPrint({
        thetaDir,
        slashInvocation: `/${OFFENDER_STEM}${SLASH_ARG}`,
        cwd: offenderCwd,
      });
      expect(
        offenderRun.exitCode,
        `offender: expected a no-error exit (0), got ${String(offenderRun.exitCode)}. stdout: ${offenderRun.stdout} stderr: ${offenderRun.stderr}`,
      ).toBe(0);
      // THE FIXED OBSERVABLE, live: at HEAD the registered contract omitted
      // the declared field `m` and the envelope validator answered
      // `must NOT have additional properties` for the caller's value
      // (§Reproduction row E2). Post-fix that signature is impossible: the
      // lowered fragment carries BOTH fields, pinned offline by E1/E2 and
      // in-process by the H8a cell, where the bound drive reaches the
      // arithmetic oracle deterministically. The spawned binder leg is NOT
      // asked for the oracle here: the tolerated `b > c` segment renders
      // into the live contract text and measurably derails the binder
      // model's reply at random (narration or empty text over identical
      // bytes), so a content demand on this reply would gate on model mood,
      // not on the fix. The oracle stays on the byte-neighbour control
      // above; the E2-signature absence below is the offender's own fixed
      // observable.
      expect(
        offenderRun.stdout + offenderRun.stderr,
        `offender: the capture carries bug 0238's pre-fix E2 signature -- the registered contract still omits the declared field. stdout: ${offenderRun.stdout} stderr: ${offenderRun.stderr}`,
      ).not.toMatch(/must NOT have additional|additionalProperty/);
      expect(
        offenderRun.stderr.split(/\r?\n/).filter((line) => line.trim().length > 0),
        `offender: stderr must be empty for a run that drives clean (bug 0030 §Fix empty-capture gate). stderr: ${offenderRun.stderr}`,
      ).toEqual([]);

      // ---- MEASUREMENT (permitted-codes disposition) ----
      const observedCodes = parseSystemNoteCodes(offenderRun.stdout + offenderRun.stderr);
      expect(
        observedCodes.filter((code) => !permitted.includes(code)),
        `MEASUREMENT: the offender capture carries theta code(s) absent from tests/fixtures/h7a/permitted-codes.json. observed=${JSON.stringify(observedCodes)}. This route mints no code and narrows no registry row, so nothing here is expected; the file is left byte-untouched and the real run decides. stdout: ${offenderRun.stdout} stderr: ${offenderRun.stderr}`,
      ).toEqual([]);
    } finally {
      rmSync(thetaDir, { recursive: true, force: true });
      rmSync(controlCwd, { recursive: true, force: true });
      rmSync(offenderCwd, { recursive: true, force: true });
    }
  });
});
