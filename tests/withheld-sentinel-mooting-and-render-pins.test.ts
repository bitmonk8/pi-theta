import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";
import {
  CATEGORY1_PLACEHOLDERS,
  fillsOf,
  nonConformantTypeNames,
  readAdmittedStandInTokens,
} from "./helpers/category1-clause-oracle";
import { collectTypeEnv } from "../src/parser/type-layer-checks";
import { resolveNamed, WITHHELD_BINDER_TYPE_NAME } from "../src/parser/type-compat";

// Bug 0143 — the MOOTING locks (group M) and the render face bug 0247 later
// clause-admitted (group F2). This file carries no claim that reds at HEAD:
// every cell here is GREEN by design and exists so that a later relaxation of
// the capture, or a later unannounced render change, reds deliberately rather
// than passing.
// (docs/bugs/0143-withheld-sentinel-author-twin-and-render-leakage.md
// §Reproduction (a)/(b)/(c), §Fix (a) as settled in-run;
// docs/bugs/0247-untypeable-static-type-has-no-category-1-rendering-clause.md
// §Fix for the clause that admits group F2's rendering.)
//
// The witness proper — that the engine's `<withheld>` mint must be
// DISTINGUISHABLE from the same ten characters written by an author — lives in
// tests/withheld-sentinel-author-twin-provenance.test.ts. It is split off
// because it imports a factory the pre-fix tree does not export, so its file
// fails collection until the fix lands; keeping the locks below in their own
// file keeps them independently runnable and green throughout.
//
// ───────────────────────────────────────────────────────────────────────────
// GROUP M — WHY THE REPORT'S FACE 1 IS MOOTED AT HEAD, AND WHAT PINS IT.
//
// The report's central measurement is a DIFFERENTIAL: an author writing the
// engine's sentinel `<withheld>` in a type-slice position was measured to
// silence six judgement sinks that the byte-identical program spelled `<foo>`
// still reported on (§Reproduction (b)). That differential no longer exists.
// The capture closure landed from bugs 0124 / 0061: every author-reachable type
// slice that derives from no `Type` production is now REFUSED at `E`, with one
// diagnostic, identically for `<withheld>`, `<foo>` and `<Withheld>`:
//   - the two schema positions (alias RHS, object-body field type, and both one
//     level down inside `array<…>` or a union arm) →
//     `theta/parse/schema-type-not-expression`
//     (docs/spec_topics/diagnostics/code-registry-parse.md:105)
//   - the three annotation positions (`let`, `fn` parameter, `fn` return) →
//     `theta/parse/annotation-type-not-expression` (code-registry-parse.md:106)
//   - the `params:` right-hand side →
//     `theta/load/params-type-not-expression`
//     (docs/spec_topics/diagnostics/code-registry-load.md:19)
// Each of those rows carries "The theta is not registered", so the report's
// GOV-15 argument (§Expected behaviour, last paragraph — rows b1–b7 emit
// nothing and are therefore inside the loads-cleanly predicate of
// docs/spec_topics/governance/source-language-stability.md:9) no longer selects
// these documents either. m1–m8 assert the shared list AND its equality ACROSS
// the three spellings, so the report's "six sinks report on one and not the
// other" claim is locked as FALSIFIED at HEAD: a capture relaxation that let any
// one spelling back through reds here.
//
// m9 is the report's own b6 no-twin control, and m10 is the KEY-level claim the
// sentinel's own doc comment (src/parser/type-compat.ts
// `WITHHELD_BINDER_TYPE_NAME`'s doc comment) makes and that
// bug 0050's soundness argument rests on — still true, now witnessed.
//
// ───────────────────────────────────────────────────────────────────────────
// GROUP F2 — THE CLAUSE-ADMITTED FACE, PINNED.
//
// The report's face 2 (the sentinel rendering verbatim into a *Message*) is
// now CLAUSE-ADMITTED: bug 0247 added an eighth clause to
// docs/spec_topics/diagnostics/placeholder-rendering-a.md §1 ("Static-type
// placeholders") plus a closed table of undetermined-static-type stand-in
// tokens, and `<withheld>` is one of them. f2a–f2d pin the four surviving
// renderings as strings the clause now admits, byte-exact and unmoved — the
// clause records the bytes the renderer already emitted rather than changing
// them. Suppressing those four emissions would still drop decidable verdicts
// and is still a *Trigger* removal under DIAG-2
// (docs/spec_topics/diagnostics/diagnostic-shape.md:72); that ground is
// unaffected by the new clause and stands unchanged. f2e/f2f pin the
// deferral the clause's own condition names: where the verdict depends on the
// undetermined type, nothing renders.
//
// The carriers moved since the report was written. Bug 0126 (0.107.0) gave the
// plain-`for` variable the iterand's element type, so §Reproduction c1–c4's
// `for x in [3]` fixtures now render `array<integer>`. The binder classes that
// still take the withheld mint are the UNANNOTATED `fn` PARAMETER
// (`walkFn`'s parameter loop → `recordWithheldBinders`,
// src/parser/type-layer-checks.ts `recordWithheldBinders`) and the MATCH-ARM
// binder (`#matchArmScope`, src/parser/static-type-inference.ts
// `#matchArmScope`). f2a–f2d use the `fn`-parameter carrier.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39) or inside one call to a shipped exported function
// (`collectTypeEnv`, src/parser/type-layer-checks.ts `collectTypeEnv`;
// `resolveNamed`, src/parser/type-compat.ts `resolveNamed`). An integration
// tier would add a session
// round-trip to a parse-time observable and buy no reach; nothing on this path
// crosses a provider, so no live tier applies.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. Every expected *Message* is READ from the registry
// through `parseRegistry` / `registryMessage` (DIAG-4,
// docs/spec_topics/diagnostics/diagnostic-shape.md:74), and the helper asserts
// the row's presence and each named placeholder before filling, so a missing or
// reworded row reds by naming the registry rather than by a silently-wrong
// literal.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/**
 * Both sharded tables this file's codes live in: the `theta/parse/*` rows and
 * the one `theta/load/*` row (`params-type-not-expression`,
 * code-registry-load.md:19). `parseRegistry` is documented against the
 * concatenated tables (tools/code-registry/index.js:24–30).
 */
const REGISTRY = parseRegistry(
  [
    "docs/spec_topics/diagnostics/code-registry-parse.md",
    "docs/spec_topics/diagnostics/code-registry-load.md",
  ]
    .map((rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8"))
    .join("\n"),
) as RegistryRow[];

/** The registry row's normative *Message* template with its placeholders filled. */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the sharded registry must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

// --- production parse harness ----------------------------------------------

/** The frontmatter every body below is parsed under. */
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** `(code, message)` pairs in emission order — the whole list, unfiltered. */
function rowsOf(body: readonly string[]): Array<readonly [string, string]> {
  return diagsOf(body).map((d) => [d.code, d.message] as const);
}

const SCHEMA_NOT_EXPR = "theta/parse/schema-type-not-expression";
const ANNOTATION_NOT_EXPR = "theta/parse/annotation-type-not-expression";
const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const ARRAY_ELEMENT_MISMATCH = "theta/parse/array-element-type-mismatch";

/** The three spellings every group M position is measured at. */
const SPELLINGS: readonly string[] = [WITHHELD_BINDER_TYPE_NAME, "<foo>", "<Withheld>"];

/**
 * One group M position: `build` renders the source for a spelling, `expected` is
 * the whole diagnostic list every spelling must produce. The cell asserts the
 * list for each spelling AND the equality across spellings, so neither a shared
 * regression (which would move all three together) nor a re-opened differential
 * (which would move one) can pass.
 */
function lockPosition(
  label: string,
  build: (spelling: string) => readonly string[],
  expected: ReadonlyArray<readonly [string, string]>,
): void {
  const measured = SPELLINGS.map((spelling) => rowsOf(build(spelling)));
  SPELLINGS.forEach((spelling, index) => {
    expect(
      measured[index],
      `${label}: the ${spelling} spelling must draw exactly the capture refusal — bug 0143 §Reproduction (b)'s differential is MOOTED by the 0124/0061 capture closure, so a re-opened silence or a second diagnostic reds here`,
    ).toEqual(expected);
  });
  expect(
    measured[0],
    `${label}: bug 0143's central claim — "six sinks report on one [spelling] and not the other" — is FALSIFIED at HEAD and locked so; the engine's own sentinel must be judged exactly as ${SPELLINGS[1]} is`,
  ).toEqual(measured[1]);
  expect(
    measured[2],
    `${label}: §Fix (d) "b8 keeps reporting" — the case variant <Withheld> is not the sentinel and must stay judged identically, or a route has fenced on a name family rather than on the collision`,
  ).toEqual(measured[1]);
}

/** The shared expectation at the two schema positions, naming the declaration. */
function schemaRefusal(declaration: string): ReadonlyArray<readonly [string, string]> {
  return [[SCHEMA_NOT_EXPR, msg(SCHEMA_NOT_EXPR, [["<X>", declaration]])]];
}

/** The shared expectation at the three annotation positions, naming the binder. */
function annotationRefusal(binder: string): ReadonlyArray<readonly [string, string]> {
  return [[ANNOTATION_NOT_EXPR, msg(ANNOTATION_NOT_EXPR, [["<name>", binder]])]];
}

// ===========================================================================
// GROUP M — the mooting locks. Green at HEAD, by design.
// ===========================================================================

describe("0143 group M — every author type-slice position refuses `<withheld>` exactly as it refuses `<foo>`", () => {
  it("m1: alias RHS (`schema X = T`) — the report's b7 / a1 delivery route", () => {
    // §Reproduction a1 measured `[]` here and a3 measured `[]` for the `<foo>`
    // control; both now draw code-registry-parse.md:105's refusal, whose
    // placeholder `<X>` names the DECLARATION and not the fragment.
    lockPosition("m1 alias RHS", (t) => [`schema X = ${t}`, "1"], schemaRefusal("X"));
  });

  it("m2: schema object-body field type (`schema S { f: T }`) — the report's a4", () => {
    lockPosition(
      "m2 schema field",
      (t) => ["schema S {", `  f: ${t}`, "}", "1"],
      schemaRefusal("S"),
    );
  });

  it("m3: one level down inside `array<…>` (`schema X = array<T>`) — the report's a6", () => {
    // The nested position matters on its own: the capture's depth counter
    // (`parseType`, src/parser/theta-document.ts) admits a balanced `<…>` group
    // as one atom, so this is the row that would show a refusal that only
    // reached the type's own top level.
    lockPosition("m3 nested array element", (t) => [`schema X = array<${t}>`, "1"], schemaRefusal("X"));
  });

  it("m4: a union arm (`schema X = T | integer`) — the report's a5", () => {
    lockPosition("m4 union arm", (t) => [`schema X = ${t} | integer`, "1"], schemaRefusal("X"));
  });

  it("m5: a `let` annotation (`let v: T = [1]`) — the report's a8 / b1 delivery route", () => {
    // The position the report's group (b) used for five of its six sinks. It
    // measured `[]` for BOTH spellings at a8 and then a verdict differential
    // downstream; the annotation is now refused outright, so nothing reaches
    // those sinks from here in either spelling.
    lockPosition("m5 let annotation", (t) => [`let v: ${t} = [1]`, "1"], annotationRefusal("v"));
  });

  it("m6: an `fn` parameter type (`fn h(p: T)`) — the report's a9", () => {
    lockPosition(
      "m6 fn parameter type",
      (t) => [`fn h(p: ${t}): number { 1 }`, "1"],
      annotationRefusal("p"),
    );
  });

  it("m7: an `fn` return type (`fn h(): T`)", () => {
    // code-registry-parse.md:106 names the `fn` NAME at the return slot, not a
    // parameter — asserted rather than assumed, so a route that changed which
    // binder the row names reds here.
    lockPosition(
      "m7 fn return type",
      (t) => [`fn h(p: number): ${t} { 1 }`, "1"],
      annotationRefusal("h"),
    );
  });

  it("m8: the `params:` frontmatter right-hand side — the report's a7", () => {
    // The one position whose refusal is a `theta/load/*` row
    // (code-registry-load.md:19). Its own frontmatter carries the `params:`
    // block, so it cannot use the shared body harness.
    const expected: ReadonlyArray<readonly [string, string]> = [
      [PARAMS_NOT_EXPR, msg(PARAMS_NOT_EXPR, [["<param>", "a"]])],
    ];
    const measured = SPELLINGS.map((spelling) =>
      parseDoc(["---", "mode: prompt", "params:", `  a: ${spelling}`, "---", "1"].join("\n")).diagnostics.map(
        (d) => [d.code, d.message] as const,
      ),
    );
    SPELLINGS.forEach((spelling, index) => {
      expect(
        measured[index],
        `m8 params: the ${spelling} spelling must draw exactly code-registry-load.md:19's refusal`,
      ).toEqual(expected);
    });
    expect(
      measured[0],
      "m8 params: the sentinel spelling must be judged identically to the <foo> control",
    ).toEqual(measured[1]);
    expect(measured[2], "m8 params: the case variant must be judged identically too").toEqual(
      measured[1],
    );
  });

  it("m9: the report's b6 no-twin control still reports its decidable element mismatch", () => {
    // §Reproduction (b), "b6 is the sharp row": the whole claim rested on this
    // control reporting where the twinned program did not. The control is
    // untouched by the capture closure — it contains no junk annotation — so it
    // stays the anti-vacuity anchor for the whole group: if the type layer
    // stopped reaching the array-element reduction at all, m1–m8's `[]`-free
    // expectations would still pass and this cell would not.
    expect(
      rowsOf(['let s: array<integer> = [1, "hi"]', "1"]),
      "code-registry-parse.md:43 *Trigger* — index 1 is a string literal against an `integer` element sink, decidable without consulting index 0, and code-registry-parse.md:59's typed-`let` row reports the widened literal type beside it",
    ).toEqual([
      [
        LET_RHS_MISMATCH,
        msg(LET_RHS_MISMATCH, [
          ["<name>", "s"],
          ["<expected>", "array<integer>"],
          ["<actual>", "array<integer | string>"],
        ]),
      ],
      [
        ARRAY_ELEMENT_MISMATCH,
        msg(ARRAY_ELEMENT_MISMATCH, [
          ["<i>", "1"],
          ["<expected>", "integer"],
          ["<actual>", "string"],
        ]),
      ],
    ]);
  });

  it("m10: the KEY-level claim — the sentinel can be an alias's VALUE but never a `TypeEnv` KEY", () => {
    // §Summary's load-bearing distinction, and §Fix (d)'s first constraint:
    // "the key-level claim stays true and stays witnessed". A `TypeEnv` key is
    // exactly one token's text (`parseSchema`'s single `advance().text`,
    // src/parser/theta-document.ts; `collectTypeEnv` keys by `stmt.name`,
    // src/parser/type-layer-checks.ts `collectTypeEnv`) and no token text
    // begins with `<`,
    // so the ten characters reach the env only as an alias's right-hand side.
    // The env is built from the parsed document's own statement list —
    // `ThetaDocument` exposes `body: ThetaBody = Block`
    // (src/parser/theta-document.ts `ThetaDocument`'s `body` field, typed by
    // the `Block` interface), whose `statements` is the `Stmt[]`
    // `collectTypeEnv` consumes.
    const document = parseDoc(
      [...FRONTMATTER, `schema X = ${WITHHELD_BINDER_TYPE_NAME}`, "1"].join("\n"),
    );
    const env = collectTypeEnv(document.body.statements);
    // Loud precondition: the alias must actually be in the env, or the two
    // negative assertions below would hold vacuously over an empty record.
    expect(
      Object.hasOwn(env, "X"),
      "m10 precondition: `collectTypeEnv` must still record the alias declaration, or the KEY claim below is asserted over an empty environment",
    ).toBe(true);
    expect(
      env["X"],
      "the sentinel reaches the environment as the alias's VALUE — this is the residue the sentinel's own doc comment (src/parser/type-compat.ts `WITHHELD_BINDER_TYPE_NAME`'s doc comment, the paragraph bounding the KEY claim) admits",
    ).toEqual({ kind: "alias", rhs: { kind: "named", name: WITHHELD_BINDER_TYPE_NAME } });
    expect(
      Object.hasOwn(env, WITHHELD_BINDER_TYPE_NAME),
      "src/parser/type-compat.ts `WITHHELD_BINDER_TYPE_NAME`'s doc comment, §\"UNSPELLABLE AS A KEY\" — UNSPELLABLE AS A KEY by the grammar: no token text is a ten-character run beginning with `<`",
    ).toBe(false);
    expect(
      resolveNamed(env, WITHHELD_BINDER_TYPE_NAME),
      "src/parser/type-compat.ts `resolveNamed` — every `⊑` question about the sentinel must reach an unresolvable-name arm, which is what bounds bug 0050's soundness argument",
    ).toBeUndefined();
  });
});

// ===========================================================================
// GROUP F2 — the CLAUSE-ADMITTED render face, pinned byte-exact.
// ===========================================================================

/** An unannotated `fn` parameter read inside an `array<…>`, plus a call. */
function fnParamCarrier(body: readonly string[]): readonly string[] {
  return ["fn f(p) {", ...body, "}", "let z = f(1)", "1"];
}

describe("0143 face 2 — the sentinel's rendering is CLAUSE-ADMITTED and pinned unmoved", () => {
  // SCOPE. Every cell below asserts the CURRENT rendering, deliberately. Bug
  // 0143 §Fix (a) as settled in-run closed face 1's ROOT only; bug 0247 then
  // supplied the render rule face 2 needed — an eighth clause under
  // placeholder-rendering-a.md §1 plus its closed undetermined-static-type
  // table, admitting `<withheld>` byte-exact where a registered *Trigger*
  // already decided to emit. Suppressing these four emissions would still
  // drop decidable verdicts — a DIAG-2 *Trigger* removal
  // (diagnostic-shape.md:72); that ground is untouched by the new clause.
  // These strings are pinned so that a future render change reds them ON
  // PURPOSE, with its reason restated, rather than moving them silently.
  // `displayType`'s `case "named"`
  // (src/parser/type-compat.ts `displayType`'s `named` arm) is BYTE-UNTOUCHED by
  // either fix, which is what keeps these green across both.

  it("f2a: `non-boolean-condition` renders the sentinel through an `array<…>` composite", () => {
    expect(
      rowsOf(fnParamCarrier(["  if [p] { let r = 1 }", "  1"])),
      "code-registry-parse.md:37 — the condition's type is decidable as non-`boolean` from the composite's OUTER kind, so the verdict is owed; its rendered `<type>` is admitted by category 1's eighth clause and its closed undetermined-static-type table (placeholder-rendering-a.md)",
    ).toEqual([
      [
        "theta/parse/non-boolean-condition",
        msg("theta/parse/non-boolean-condition", [["<type>", "array<<withheld>>"]]),
      ],
    ]);
  });

  it("f2b: `mixed-plus-operands` renders it at `<left>`", () => {
    expect(
      rowsOf(fnParamCarrier(["  let r = [p] + 1", "  r"])),
      "code-registry-parse.md:39 — an `array` operand against an `integer` is a decidable mismatch whatever the element type is; the rendering is admitted by category 1's eighth clause and its closed undetermined-static-type table (placeholder-rendering-a.md)",
    ).toEqual([
      [
        "theta/parse/mixed-plus-operands",
        msg("theta/parse/mixed-plus-operands", [
          ["<left>", "array<<withheld>>"],
          ["<right>", "integer"],
        ]),
      ],
    ]);
  });

  it("f2c: `non-orderable-operands` renders it at `<left>`", () => {
    expect(
      rowsOf(fnParamCarrier(["  let r = [p] < 1", "  r"])),
      "code-registry-parse.md:40 — `array<T>` is named in the row's own *Trigger* as non-orderable, so the verdict is owed; the rendering is admitted by category 1's eighth clause and its closed undetermined-static-type table (placeholder-rendering-a.md)",
    ).toEqual([
      [
        "theta/parse/non-orderable-operands",
        msg("theta/parse/non-orderable-operands", [
          ["<op>", "<"],
          ["<left>", "array<<withheld>>"],
          ["<right>", "integer"],
        ]),
      ],
    ]);
  });

  it("f2d: `unknown-method` renders it at `<type>`", () => {
    expect(
      rowsOf(fnParamCarrier(['  let r = [p].frobnicate()', "  r"])),
      "code-registry-parse.md:70 — `frobnicate` is on no built-in type at all, so the verdict does not depend on the element type; the rendering is admitted by category 1's eighth clause and its closed undetermined-static-type table (placeholder-rendering-a.md)",
    ).toEqual([
      [
        "theta/parse/unknown-method",
        msg("theta/parse/unknown-method", [
          ["<method>", "frobnicate"],
          ["<type>", "array<<withheld>>"],
        ]),
      ],
    ]);
  });

  it("f2e: the `join` element gate DEFERS on the same carrier — no diagnostic, no rendering", () => {
    // The other side of the same seam, and the reason f2a–f2d are not a claim
    // that the withhold gate is broken: where the verdict DOES depend on the
    // withheld element type, `containsWithheldBinderType`
    // (src/parser/type-layer-checks.ts `containsWithheldBinderType`, its
    // `named` arm, recursing through its `array` arm) suppresses the judgement and
    // docs/spec_topics/type-system.md:48's deferral disposition holds. This is
    // the observable the settled fix must preserve: it is what reds if the
    // engine's mint stops satisfying the predicate.
    expect(
      rowsOf(fnParamCarrier(['  let r = [p].join(",")', "  r"])),
      "type-system.md:48 — the join element is the withheld binder itself, past the parser's static view, so `checkMethodCall`'s `join`-element withhold gate (src/parser/type-layer-checks.ts) defers",
    ).toEqual([]);
  });

  it("f2f: the `for` iterand gate DEFERS on a bare withheld binder — no diagnostic, no rendering", () => {
    expect(
      rowsOf(fnParamCarrier(["  for y in p { y }", "  1"])),
      "type-system.md:48 — the iterand type IS the withheld mint, so `walkStmt`'s `case \"for\"` iterand withhold gate (src/parser/type-layer-checks.ts) defers rather than refusing a non-`array` iterand",
    ).toEqual([]);
  });
});

// ===========================================================================
// 0247 — the conformance oracle over the four surviving withheld renderings.
// ===========================================================================

describe("0247 — the withheld renderings scored against category 1's closed stand-in table", () => {
  it("scores the f2a–f2d carriers' category-1 fills against the clause list read from placeholder-rendering-a.md", () => {
    // WHAT THIS ADDS BESIDE f2a–f2d. Those cells pin the rendered strings
    // byte-exact; they say nothing about whether any clause admits them. Bug
    // 0247 is that question: category 1's Rule states seven clauses
    // (placeholder-rendering-a.md:21–27), every one presupposing a determined
    // static type, and the withheld-binder sentinel renders where the layer
    // determined none. Its §Fix adds an eighth clause plus a CLOSED table of
    // admitted stand-in tokens. This cell reads that table off the spec page and
    // scores the four surviving renderings against the enlarged list, so the
    // clause — rather than a pinned literal in this file — is what admits the
    // bytes.
    //
    // WHY IT REDS AT THIS HEAD, AND FOR WHICH REASON.
    // `readAdmittedStandInTokens` (tests/helpers/category1-clause-oracle.ts)
    // fails loudly naming the missing anchor: the category-1 subsection carries
    // no such table. That failure IS bug 0247's witness. It never falls back to
    // an empty set, so the offenders list below cannot pass vacuously.
    const admitted = readAdmittedStandInTokens();
    const carriers: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["f2a", fnParamCarrier(["  if [p] { let r = 1 }", "  1"])],
      ["f2b", fnParamCarrier(["  let r = [p] + 1", "  r"])],
      ["f2c", fnParamCarrier(["  let r = [p] < 1", "  r"])],
      ["f2d", fnParamCarrier(['  let r = [p].frobnicate()', "  r"])],
    ];
    const offenders: string[] = [];
    let scored = 0;
    for (const [label, source] of carriers) {
      for (const diagnostic of diagsOf(source)) {
        for (const [name, value] of fillsOf(REGISTRY, diagnostic.code, diagnostic.message)) {
          if (!CATEGORY1_PLACEHOLDERS.has(name)) continue;
          scored += 1;
          for (const bad of nonConformantTypeNames(value, admitted)) {
            offenders.push(`${label} ${diagnostic.code} ${name}=${JSON.stringify(bad)}`);
          }
        }
      }
    }
    expect(
      offenders,
      "bug 0247 §Fix — every byte a category-1 placeholder can carry must be fixed by a clause (placeholder-rendering-a.md:5). A carrier here rendered a token that neither the seven original clauses nor the closed stand-in table admit, so the sentinel (`WITHHELD_BINDER_TYPE_NAME`, src/parser/type-compat.ts) reaches a user-visible Message through no rule",
    ).toEqual([]);
    // ANTI-VACUITY. Measured, not assumed: six category-1 fills across the four
    // carriers — one `<type>` at f2a, `<left>` and `<right>` at f2b and again at
    // f2c, one `<type>` at f2d. The `<op>` and `<method>` fills belong to
    // category 7 and are filtered out. A lower count means the carriers stopped
    // reaching the render arm and the empty offenders list above proves nothing.
    expect(
      scored,
      "bug 0247 §Reproduction (a) — the four surviving withheld renderings must still supply six category-1 fills; a lower count means the oracle scored nothing",
    ).toBe(6);
  });
});
