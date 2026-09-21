// Bug 0488 — launch-time enumeration of a driven body's typed queries into their
// synthesised respond-tool names (docs/bugs/0488-…​.md §Fix step 1-2;
// .pi/tmp/fixes/0488-design.md §"Seams" 1-2 and §"Cases").
//
// SEAMS UNDER TEST (both NEW — absent pre-fix, which IS the correct-reason red):
//   - src/parser/theta-document.ts: `collectSessionTypedQueries(body): QueryExpr[]`
//     — an exhaustive walk mirroring `detectTypedQueryExpression`
//     (theta-document.ts:10156) that COLLECTS every typed `QueryExpr`
//     (`expr.schema !== null`, QueryExpr.schema at :274) but STOPS at
//     `subagent fn` boundaries (does NOT descend a FnDecl with `subagent===true`,
//     FnDecl.subagent at :722) while STILL descending ordinary `fn` bodies (FN-7).
//     Contrast: `detectTypedQueryExpression` DOES descend subagent-fn bodies —
//     the twin below locks the deliberate divergence.
//   - src/runtime/typed-query-validation.ts: `respondToolName(slug): string`
//     → `"__theta_respond_" + slug`, single-sourcing the inline mint at :205;
//     slug via `respondSchemaSlug(lowered)` (:381, canonical form — bug 0099).
//
// The name-mint PARITY oracle is INDEPENDENT: it SHA-256s a HAND-WRITTEN
// canonical byte string (schema-subset.md canonical form) — it never calls the
// functions under test for its expectation, so the cell cannot become a
// tautology (the pattern from tests/live/typed-query-wire-shapes.test.ts:296-304).

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { parseDoc } from "./helpers/e2e-s1";
import * as thetaDoc from "../src/parser/theta-document";
import type { FnDecl, QueryExpr, ThetaBody, ThetaDocument } from "../src/parser/theta-document";
import * as tqv from "../src/runtime/typed-query-validation";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  collectLaunchRespondNames,
  mergedEnumDeclsOf,
  mergedSchemaDeclsOf,
} from "../src/extension/production-theta-producer";
import { THETA_LAUNCH_ENTRY } from "../src/runtime/subagent-placement";

// --- NEW-seam accessors (typed casts; guarded by typeof pins in each cell) ----

const COLLECT_PIN =
  "src/parser/theta-document.ts must export collectSessionTypedQueries(body): QueryExpr[] " +
  "(bug 0488 — the launch enumeration seam is absent pre-fix)";
const RESPOND_NAME_PIN =
  "src/runtime/typed-query-validation.ts must export respondToolName(slug): string " +
  "(bug 0488 design §Seams 2)";

function collectSessionTypedQueries(body: ThetaBody): readonly QueryExpr[] {
  return (thetaDoc as unknown as {
    collectSessionTypedQueries: (b: ThetaBody) => QueryExpr[];
  }).collectSessionTypedQueries(body);
}

function respondToolName(slug: string): string {
  return (tqv as unknown as { respondToolName: (s: string) => string }).respondToolName(slug);
}

/** Mint the respond-tool name a driven query lowers to, exactly as the fix's spawn site does. */
function respondNameOf(expr: QueryExpr, body: ThetaBody): string {
  expect(expr.schema, "the collected query must carry a schema").not.toBeNull();
  const lowered = lowerQueryResponseSchema(
    expr.schema!,
    mergedSchemaDeclsOf({ body }),
    mergedEnumDeclsOf({ body }),
  );
  if (lowered === undefined) {
    throw new Error(`fixture defect: schema ${JSON.stringify(expr.schema)} must lower`);
  }
  return respondToolName(tqv.respondSchemaSlug(lowered));
}

/** The subagent `fn` decls in a body's top-level statements. */
function fnDecls(body: ThetaBody): readonly FnDecl[] {
  return body.statements.filter((s): s is FnDecl => s.kind === "fn");
}

describe("bug 0488 — collectSessionTypedQueries collects the driven body's typed queries", () => {
  it("a mode:prompt theta with one typed query → exactly that one QueryExpr, schema non-null", () => {
    expect(typeof (thetaDoc as Record<string, unknown>)["collectSessionTypedQueries"], COLLECT_PIN).toBe(
      "function",
    );
    const doc = parseDoc(['---', 'mode: prompt', '---', 'let bound: "low" | "high" = @`Classify`?', 'bound', ''].join("\n"));
    expect(doc.diagnostics.filter((d) => d.severity === "error"), "fixture must parse cleanly").toEqual([]);
    const collected = collectSessionTypedQueries(doc.body);
    expect(collected).toHaveLength(1);
    expect(collected[0]!.kind).toBe("query");
    expect(collected[0]!.schema).not.toBeNull();
  });

  it("name-mint PARITY: the collected query mints the CANONICAL-form respond name (independent node:crypto oracle)", () => {
    expect(typeof (tqv as Record<string, unknown>)["respondToolName"], RESPOND_NAME_PIN).toBe("function");
    // Hand-written canonical form of `{"type":"string","enum":["low","high"]}`
    // — keys code-point sorted (schema-subset.md): `enum` (U+0065) before
    // `type` (U+0074). NOT computed by any shipped function.
    const CANONICAL_BYTES = '{"enum":["low","high"],"type":"string"}';
    const expectedSlug = createHash("sha256").update(CANONICAL_BYTES, "utf8").digest("hex").slice(0, 16);
    expect(expectedSlug, "the canonical slug for @<\"low\" | \"high\"> (bug 0099 / 0488 cell 4)").toBe(
      "1aae0990d53b3485",
    );
    const expectedName = `__theta_respond_${expectedSlug}`;

    const doc = parseDoc(['---', 'mode: prompt', '---', '@<"low" | "high">`Classify`?', ''].join("\n"));
    expect(doc.diagnostics.filter((d) => d.severity === "error"), "fixture must parse cleanly").toEqual([]);
    const collected = collectSessionTypedQueries(doc.body);
    expect(collected).toHaveLength(1);
    expect(respondNameOf(collected[0]!, doc.body)).toBe(expectedName);
  });

  it("subagent-fn TWIN (FN-7): the enclosing walk EXCLUDES a subagent-fn body's query but the fn-body walk INCLUDES it; ordinary fn bodies ARE collected", () => {
    expect(typeof (thetaDoc as Record<string, unknown>)["collectSessionTypedQueries"], COLLECT_PIN).toBe(
      "function",
    );
    const doc = parseDoc(
      [
        "---",
        "mode: prompt",
        "---",
        'let a: "low" | "high" = @`classify`?',
        "",
        'subagent fn childjob(): "yes" | "no" {',
        '  @<"yes" | "no">`decide`?',
        "}",
        "",
        // Ordinary `fn`: no `?` try-operator (that is legal only at top level
        // or inside a `subagent fn` — theta/parse/question-outside-result-fn);
        // a bare typed-query tail is still a typed query (schema present).
        'fn helper(): "on" | "off" {',
        '  @<"on" | "off">`toggle`',
        "}",
        "",
        "a",
        "",
      ].join("\n"),
    );
    expect(doc.diagnostics.filter((d) => d.severity === "error"), "fixture must parse cleanly").toEqual([]);

    // Independent respond-name oracles (canonical slugs verified against the
    // node:crypto SHA-256 of the hand-written canonical forms — space-insensitive
    // identity keys, unlike the raw `expr.schema` text the parser normalises and
    // the `?` try-wrapper hides behind a node).
    const NAME_LOW_HIGH = "__theta_respond_1aae0990d53b3485"; // {"enum":["low","high"],"type":"string"}
    const NAME_ON_OFF = "__theta_respond_12c820c784d40d11"; //   {"enum":["on","off"],"type":"string"}
    const NAME_YES_NO = "__theta_respond_8d15b2ea6cc1102f"; //   {"enum":["yes","no"],"type":"string"}

    // The enclosing session drives its own body + inline `fn` bodies, but NOT a
    // `subagent fn` body (that spawns its own child session — FN-7 symmetry).
    const enclosing = collectSessionTypedQueries(doc.body).map((q) => respondNameOf(q, doc.body));
    expect(enclosing, "let a (body) and helper() (ordinary fn) are collected").toEqual(
      expect.arrayContaining([NAME_LOW_HIGH, NAME_ON_OFF]),
    );
    expect(
      enclosing,
      "the subagent-fn body's `\"yes\" | \"no\"` query must NOT be collected by the enclosing walk",
    ).not.toContain(NAME_YES_NO);

    // The subagent-fn body, walked as ITS OWN driven session, collects its query.
    const childjob = fnDecls(doc.body).find((f) => f.name === "childjob");
    expect(childjob?.subagent, "childjob is the `subagent fn`").toBe(true);
    const childQueries = collectSessionTypedQueries(childjob!.body).map((q) =>
      respondNameOf(q, childjob!.body),
    );
    expect(childQueries, "the subagent-fn body walk collects its own typed query").toContain(
      NAME_YES_NO,
    );
  });
});

// --- The producer half: collectLaunchRespondNames(theta, entry) --------------
//
// The pure module-level enumerator the spawn site calls (design §Seams 4). Each
// cell drives it directly and asserts against INDEPENDENT node:crypto canonical
// oracles (never computed from the function under test), so a cell cannot decay
// into a tautology.

/** The canonical-form slug (bug 0099) for `@<a | b>`, hand-hashed independently. */
function canonicalEnumSlug(...members: string[]): string {
  const canonical = `{"enum":${JSON.stringify(members)},"type":"string"}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

/**
 * The minimal `ConversationBindInput["theta"]`-shaped object
 * `collectLaunchRespondNames` reads: `body` (the walked AST), `sourcePath` and
 * `frontmatter` (the fn-resolution environment `buildBoundEnvironment` /
 * `presentedCallableNames` consult), with `imports` / `importedTypeDecls`
 * absent (these fixtures declare no `import`). No session or model state.
 */
function callerTheta(doc: ThetaDocument): Parameters<typeof collectLaunchRespondNames>[0] {
  return {
    body: doc.body,
    sourcePath: "probe.theta",
    frontmatter: {},
  } as unknown as Parameters<typeof collectLaunchRespondNames>[0];
}

describe("bug 0488 — collectLaunchRespondNames enumerates the driven session's respond names", () => {
  it("theta entry: a mode:prompt theta's one typed query → its single canonical respond name", () => {
    const nameLowHigh = `__theta_respond_${canonicalEnumSlug("low", "high")}`;
    expect(nameLowHigh, "independent oracle pins bug 0099 / cell 4 slug").toBe(
      "__theta_respond_1aae0990d53b3485",
    );
    const doc = parseDoc(
      ["---", "mode: prompt", "---", 'let x: "low" | "high" = @`Classify`?', "x", ""].join("\n"),
    );
    expect(doc.diagnostics.filter((d) => d.severity === "error"), "fixture must parse cleanly").toEqual([]);
    expect(collectLaunchRespondNames(callerTheta(doc), THETA_LAUNCH_ENTRY)).toEqual([nameLowHigh]);
  });

  it("fn entry (FN-7): the fn body's respond name is INCLUDED, the enclosing top-level query is EXCLUDED", () => {
    const nameLowHigh = `__theta_respond_${canonicalEnumSlug("low", "high")}`;
    const nameYesNo = `__theta_respond_${canonicalEnumSlug("yes", "no")}`;
    expect(nameYesNo, "independent oracle pins the yes/no slug").toBe(
      "__theta_respond_8d15b2ea6cc1102f",
    );
    const doc = parseDoc(
      [
        "---",
        "mode: prompt",
        "---",
        'let x: "low" | "high" = @`Classify`?',
        "",
        'subagent fn childjob(): "yes" | "no" {',
        '  @<"yes" | "no">`decide`?',
        "}",
        "",
        "x",
        "",
      ].join("\n"),
    );
    expect(doc.diagnostics.filter((d) => d.severity === "error"), "fixture must parse cleanly").toEqual([]);
    const names = collectLaunchRespondNames(callerTheta(doc), { kind: "fn", name: "childjob" });
    expect(names, "the fn session drives its own body's query").toContain(nameYesNo);
    expect(names, "the enclosing top-level `let x` query is NOT driven by the fn session (FN-7)").not.toContain(
      nameLowHigh,
    );
  });

  it("fn entry + sibling ordinary fn (F1a): both fn respond names INCLUDED, enclosing top-level query EXCLUDED", () => {
    const nameLowHigh = `__theta_respond_${canonicalEnumSlug("low", "high")}`;
    const nameYesNo = `__theta_respond_${canonicalEnumSlug("yes", "no")}`;
    const nameOnOff = `__theta_respond_${canonicalEnumSlug("on", "off")}`;
    expect(nameOnOff, "independent oracle pins the on/off slug").toBe(
      "__theta_respond_12c820c784d40d11",
    );
    const doc = parseDoc(
      [
        "---",
        "mode: prompt",
        "---",
        'let x: "low" | "high" = @`Classify`?',
        "",
        'subagent fn childjob(): "yes" | "no" {',
        '  @<"yes" | "no">`decide`?',
        "}",
        "",
        // Ordinary `fn`: no `?` try-operator (illegal outside a result-fn);
        // a bare typed-query tail is still a typed query (schema present).
        'fn helper(): "on" | "off" {',
        '  @<"on" | "off">`toggle`',
        "}",
        "",
        "x",
        "",
      ].join("\n"),
    );
    expect(doc.diagnostics.filter((d) => d.severity === "error"), "fixture must parse cleanly").toEqual([]);
    const names = collectLaunchRespondNames(callerTheta(doc), { kind: "fn", name: "childjob" });
    expect(names, "the fn body AND the inline-callable sibling ordinary fn body are driven").toEqual(
      expect.arrayContaining([nameYesNo, nameOnOff]),
    );
    expect(names, "the enclosing top-level `let x` query is still NOT driven by the fn session").not.toContain(
      nameLowHigh,
    );
  });
});
