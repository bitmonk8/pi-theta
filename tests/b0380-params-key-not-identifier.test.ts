// Bug 0380 — offline RED witness: a non-identifier-shaped `params:` YAML key
// registers with ZERO diagnostics and then forges the two line-oriented
// renderers that interpolate the field name bare
// (docs/bugs/0380-nonidentifier-params-key-registers-and-forges-binder-prompt-and-echo.md).
//
// PARENT ADJUDICATION (settled, Option A — refusal at load, NOT normalisation
// at the render seams): a non-identifier-shaped `params:` key is REFUSED at
// load under ONE new registered parse code
// `theta/parse/params-key-not-identifier`. The gate keys on the COOKED YAML
// key's shape via the existing `isIdentifierShaped` predicate
// (src/parser/frontmatter.ts:1030 `} else if (!isIdentifierShaped(name)) {`),
// so a quoted-but-identifier-shaped key (`"topic": string`) STAYS LEGAL —
// YAML quoting is surface spelling; the cooked value `topic` is the name.
// Acceptance change for `"a b":`-class keys is DELIBERATE.
//
// These tests encode the SPECIFIED post-fix behaviour, so cells A/B/C/J/K are
// RED at this fork (0380 is open): the offending keys currently load with an
// empty diagnostic array / zero error-severity diagnostics — the doc's exact
// symptom. Controls D/E/F/G/H and the break-free render seams (I) are GREEN and
// pin the surfaces the fix must leave byte-untouched.
//
// TIER: unit / offline. The defect lives at the `parseThetaDocument` boundary
// (the cooked YAML key's shape) and at two pure render functions — no provider,
// session, or child process is on the path, so the parse harness reaches every
// seam deterministically. A live test would add a real model turn that
// witnesses nothing this offline harness does not.
//
// Assertions map diagnostics to `.code` (not message strings) for the new
// code: at this fork the registry row does not exist yet, so asserting the code
// literal directly is correct — mirroring the offline `.toEqual([CODE])` style
// of tests/live/acceptance/inline-field-name-not-identifier-load-refusal.test.ts.

import { describe, expect, it } from "vitest";
import { parseDoc, codes, errors } from "./helpers/e2e-s1";
import { renderBinderParamLine } from "../src/binder/binder-system-prompt";
import { renderArgumentEcho } from "../src/render/argument-echo";

/** The one new parse code the settled Option-A fix mints (DIAG-2, Phase-2 edit). */
const CODE = "theta/parse/params-key-not-identifier";

/** Wrap a `params:` block body (already indented) in a minimal well-formed doc. */
function doc(paramsBody: string): string {
  return [
    "---",
    "mode: prompt",
    "model: sonnet",
    "params:",
    paramsBody,
    "---",
    "let x = 1",
    "",
  ].join("\n");
}

/** The distinct diagnostic codes a source produces, sorted. */
function codesOf(src: string): readonly string[] {
  return codes(parseDoc(src).diagnostics);
}

/**
 * The wireName of the first lowered `params:` field, or fail loudly. Fields are
 * only recorded when the block lowered, so a missing field on a "loads" cell is
 * a real regression — never a silent skip.
 */
function firstWireName(src: string): string {
  const fields = parseDoc(src).frontmatter?.params?.fields;
  if (fields === undefined || fields.length === 0) {
    throw new Error(
      `expected at least one recorded params field; got ${JSON.stringify(fields)}`,
    );
  }
  return fields[0]!.wireName;
}

// The break-carrying carrier: an EXPLICIT-KEY block scalar (`? |-`) whose
// cooked YAML key carries a REAL U+000A (`a\nTheta: /evil`). The implicit
// double-quoted spelling `"a\nb": string` never reaches the params walk — the
// yaml lib refuses it (cell G) — so the block-scalar carrier is the only
// spelling that cooks a physical break into the key.
const carrierBreak = doc(
  ["  ? |-", "    a", "    Theta: /evil", "  : string"].join("\n"),
);

// The echo carrier: cooks to `a\nRunning /forged: x=1`, plus a legitimate
// second field so a passing cell proves the refusal fires on the offending
// key without disturbing the sibling.
const echoCarrier = doc(
  ["  ? |-", "    a", "    Running /forged: x=1", "  : string", "  ok_field: string"].join(
    "\n",
  ),
);

describe("bug 0380 — a non-identifier `params:` key is refused at load (Option A), and the render seams stay byte-untouched", () => {
  it("(A) carrierBreak: a block-scalar key cooking a real LF is refused with the new code — RED at fork (loads with `[]`)", () => {
    // At this fork the LF-carrying key registers clean: `codesOf === []`. The
    // settled fix draws exactly `[CODE]`.
    expect(codesOf(carrierBreak)).toEqual([CODE]);
  });

  it("(B) `\"a b\": string`: a break-free non-identifier key is refused — RED at fork (loads with `[]`), acceptance change is deliberate", () => {
    expect(codesOf(doc('  "a b": string'))).toEqual([CODE]);
  });

  it("(C) echoCarrier: the offending key is refused while the legitimate `ok_field` sibling is present — RED at fork", () => {
    // CONTAIN, not equal: the cell's subject is that the non-identifier key
    // draws CODE; the good sibling must not itself emit a diagnostic.
    expect(codesOf(echoCarrier)).toContain(CODE);
  });

  it("(D) CONTROL identKey `topic: string`: loads clean AND binds `wireName === \"topic\"`", () => {
    const src = doc("  topic: string");
    expect(codesOf(src)).toEqual([]);
    expect(firstWireName(src)).toBe("topic");
  });

  it("(E) CONTROL quotedIdent `\"topic\": string`: stays legal — loads clean AND cooks `wireName === \"topic\"` (quotes are surface spelling)", () => {
    // Deliberate divergence from cell B: a quoted key whose COOKED value is
    // identifier-shaped is legal; the gate keys on the cooked shape, not the
    // quoting.
    const src = doc('  "topic": string');
    expect(codesOf(src)).toEqual([]);
    expect(firstWireName(src)).toBe("topic");
  });

  it("(F) CONTROL caseKey `Topic: string`: byte-identical case-mismatch refusal (0149) — must stay untouched", () => {
    expect(codesOf(doc("  Topic: string"))).toEqual([
      "theta/parse/binding-case-mismatch",
    ]);
  });

  it("(G) CONTROL dqRealBreak (real physical break inside double quotes): the yaml-lib refusal is untouched — my fix produces no field here", () => {
    // A REAL newline inside double quotes across two source lines. The doc's
    // Reproduction imprecisely attributed this code to the double-quoted
    // ESCAPE `"a\\nb"` (backslash-n) — VERIFIED FALSE at this fork (that
    // escape loads clean, cell K). Only a physical break yields the yaml-lib
    // malformed refusal, and the params walk is never reached.
    const dqRealBreak = [
      "---",
      "mode: prompt",
      "model: sonnet",
      "params:",
      '  "a',
      'b": string',
      "---",
      "let x = 1",
      "",
    ].join("\n");
    expect(codesOf(dqRealBreak)).toEqual(["theta/load/malformed-frontmatter-yaml"]);
  });

  it("(H) CONTROL reservedKey `let: string`: reserved-keyword refusal is untouched", () => {
    expect(codesOf(doc("  let: string"))).toEqual([
      "theta/parse/reserved-keyword-as-identifier",
    ]);
  });

  it("(I-break-free) RENDER SEAMS byte-identical for an identifier field — GREEN; the load-time fix must leave these pure renderers untouched", () => {
    // Break-free identifier field → both seams render byte-identically. The fix
    // is a load-time refusal, so it must leave these two pure renderers alone;
    // any drift here (e.g. a spurious wireName normalisation) reds.
    expect(
      renderBinderParamLine({
        wireName: "topic",
        type: "string",
        requirement: { kind: "required" },
      }),
    ).toBe("  topic (string) required");

    const echo = renderArgumentEcho({
      thetaName: "probe",
      params: [
        {
          name: "topic",
          value: "v",
          type: { kind: "string" },
          tookDefault: false,
        },
      ],
    });
    expect(echo.startsWith("Running /probe: topic=")).toBe(true);
    expect(echo).not.toContain("\n");
  });

  it("(I-break-carrying) the break-carrying key is unreachable-at-render because the refusal is the covering — RED at fork", () => {
    // The refusal IS the covering. Because parseDoc(carrierBreak) raises an
    // error-severity CODE, the theta does not register (the parseFrontmatter
    // contract, src/parser/frontmatter.ts:1109 "The theta registers iff no
    // error-severity diagnostic was raised"), so the break-carrying wireName
    // never reaches renderBinderParamLine or renderArgumentEcho at all — the
    // seams are unreachable-at-render, not normalised. RED at fork: no
    // error-severity CODE is raised yet, so the theta DOES register and the
    // break-carrying wireName reaches both seams (the 0380 defect).
    const carrierErrors = errors(parseDoc(carrierBreak).diagnostics);
    expect(carrierErrors.map((d) => d.code)).toContain(CODE);
  });

  it("(J) REGISTRATION OUTCOME: carrierBreak has ≥1 error-severity diagnostic (registers nothing); identKey has zero (registers)", () => {
    // parseFrontmatter doc (src/parser/frontmatter.ts:1109): "The theta
    // registers iff no error-severity diagnostic was raised." Error-severity
    // count is therefore the offline registration proxy.
    const carrierErr = errors(parseDoc(carrierBreak).diagnostics);
    // RED at fork: currently zero error-severity diagnostics — registers.
    expect(carrierErr.length).toBeGreaterThanOrEqual(1);
    expect(carrierErr.map((d) => d.code)).toContain(CODE);

    const identErr = errors(parseDoc(doc("  topic: string")).diagnostics);
    expect(identErr.length).toBe(0);
  });

  it("(K) CONTROL escape-form `\"a\\nb\"` (backslash-n escape): a non-identifier key the fix refuses — RED at fork (loads with `[]`)", () => {
    // WHY: documents the doc-Reproduction imprecision. The doc claims this
    // double-quoted ESCAPE yields `theta/load/malformed-frontmatter-yaml`;
    // VERIFIED FALSE — at this fork it loads clean with the non-identifier
    // wireName `a\nb`. Under Option A the cooked key is non-identifier-shaped,
    // so the fix refuses it with CODE. The physical-break spelling that
    // actually yields the yaml-lib refusal is cell G.
    expect(codesOf(doc('  "a\\nb": string'))).toEqual([CODE]);
  });
});
