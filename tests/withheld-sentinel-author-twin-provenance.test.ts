import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";
import {
  annotationToCompatType,
  letAnnotationToCompatType,
} from "../src/parser/type-layer-checks";
import {
  withheldBinderType,
  WITHHELD_BINDER_TYPE_NAME,
  type CompatType,
} from "../src/parser/type-compat";

// Bug 0143 face 1, THE ROOT — the witness proper.
// (docs/bugs/0143-withheld-sentinel-author-twin-and-render-leakage.md
// §Expected behaviour, first paragraph; §Fix (b) route 1, as settled in-run.)
//
// THE CLAIM THIS FILE WITNESSES, in the report's own words: "A predicate that
// distinguishes engine-minted values must not do it by string equality on a
// field an author controls." `containsWithheldBinderType`
// (src/parser/type-layer-checks.ts `containsWithheldBinderType`) answers "was
// this type read out of a binder this layer cannot type", and its `case
// "named"` arm is `type.name === WITHHELD_BINDER_TYPE_NAME` — a string equality
// over a value whose ONLY field is that string, because `CompatType`'s `named`
// arm carries a bare `string` and no provenance (src/parser/type-compat.ts
// `CompatType`'s `named` arm). The engine mints the sentinel at two sites —
// `recordWithheldBinders` (src/parser/type-layer-checks.ts
// `recordWithheldBinders`) and `#matchArmScope`
// (src/parser/static-type-inference.ts `#matchArmScope`)
// — and the author's own producer, `annotationToCompatType`
// (src/parser/type-layer-checks.ts `annotationToCompatType`, through
// `convertAnnotation`'s fallthrough) mints `{ kind: "named", name: text }` from a trimmed source
// slice with no identifier test. The two values are BYTE-EQUAL, so the
// predicate cannot tell them apart. That is the forgery channel, and it is the
// root the settled §Fix closes.
//
// WHAT THE SETTLED FIX IS (0143 §Fix (b) route 1, "give the `named` arm
// PROVENANCE"): `CompatType`'s `named` arm gains `readonly withheld?: true`; a
// new exported factory `withheldBinderType()` returns
// `{ kind: "named", name: WITHHELD_BINDER_TYPE_NAME, withheld: true }`;
// `containsWithheldBinderType`'s `case "named"` becomes
// `return type.withheld === true`; the two mint sites mint through the factory.
// Nothing else — `displayType` (src/parser/type-compat.ts `displayType`) is
// byte-untouched, so face 2's rendering does not move.
//
// WHAT IS *NOT* CLAIMED HERE. Face 2 (the sentinel rendering verbatim into a
// *Message*) is CLAUSE-ADMITTED by bug 0247's eighth clause under
// docs/spec_topics/diagnostics/placeholder-rendering-a.md §1 and is pinned in
// tests/withheld-sentinel-mooting-and-render-pins.test.ts, together with the
// group M mooting locks: the report's §Reproduction (b) differential between
// `<withheld>` and `<foo>` no longer exists, because the 0124 / 0061 capture
// closure now refuses every non-`Type`-derivable author slice at `E` in both
// spellings alike. This file therefore does NOT re-measure the differential; it
// measures the seam the differential ran through, which is still open at the
// module level even though no source path currently delivers a forgery.
//
// WHY A MODULE-SEAM CELL AND NOT A DOCUMENT CELL. w1 asserts over the shipped
// exported values rather than over a parsed document ON PURPOSE: the settled
// fix is deliberately ZERO-OBSERVABLE at the document level (that is the whole
// argument for it clearing GOV-15 and DIAG-2 — no diagnostic list moves, no
// *Message* moves). A document-level cell for w1 could not exist. w2 then
// carries the other half: the marker must be carried through composition, so
// every genuine engine mint that the predicate answers for TODAY must keep
// being answered for after the seam change.
//
// RED / GREEN LEDGER at the pre-fix tree:
//   w1 RED — the engine's mint and the author's twin are `toEqual`-identical
//            and neither carries the marker.
//   w2 GREEN and required to stay green — it is the no-regression half.
//   w3 GREEN and required to stay green — no author-reachable path may ever
//            construct the marker; it is the anti-overreach pin on the fix.
// At CLEAN HEAD (no factory exported at all) this whole file fails to collect,
// which is why the M / F2 locks live in their own file and stay runnable.
//
// TIER: unit, offline, deterministic, provider-free. w1 and w3 settle inside
// direct calls to shipped exported functions; w2 settles inside one
// `parseThetaDocument` call per fixture (`parseDoc`, tests/helpers/e2e-s1.ts:39).
// An integration tier would add a session round-trip to a parse-time observable
// and buy no reach; nothing on this path crosses a provider, so no live tier
// applies.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. Every expected *Message* is READ from the registry
// (DIAG-4, docs/spec_topics/diagnostics/diagnostic-shape.md:74) and every
// precondition is an assertion, so a missing export or a reworded row reds by
// naming what is missing.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/** The registry row's normative *Message* template with its placeholders filled. */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
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

// ===========================================================================
// The provenance marker, read structurally.
// ===========================================================================

/**
 * The provenance marker on a `named` `CompatType`, read WITHOUT assuming the
 * union arm declares it. The settled fix adds `readonly withheld?: true` to
 * src/parser/type-compat.ts `CompatType`'s `named` arm; reading it through this
 * accessor keeps the cells
 * below type-checkable against a tree that has not yet added the field, so the
 * red they produce is about the VALUE and never about the type declaration.
 */
function marker(type: CompatType): unknown {
  return (type as { readonly withheld?: unknown }).withheld;
}

/** Every `named` node inside `type`, recursing through `array` / `union` / `object`. */
function namedNodes(type: CompatType): CompatType[] {
  switch (type.kind) {
    case "named":
      return [type];
    case "array":
      return namedNodes(type.element);
    case "union":
      return type.arms.flatMap(namedNodes);
    case "object":
      return type.fields.flatMap((field) => namedNodes(field.type));
    case "prim":
    case "literal":
      return [];
  }
}

// ===========================================================================
// w1 — the witness proper.
// ===========================================================================

describe("0143 w1 — the engine's withheld mint must be DISTINGUISHABLE from the author's ten characters", () => {
  it("w1: `withheldBinderType()` carries a provenance marker that no author-spelled annotation carries", () => {
    // Loud preconditions first: this cell is worthless if the factory is
    // missing or if the two producers stopped producing a `named` at all.
    expect(
      typeof withheldBinderType,
      "0143 §Fix (b) route 1 — src/parser/type-compat.ts must export the engine's minting factory `withheldBinderType()`; the predicate can only stop testing an author-controlled field if there is a marked value to test instead",
    ).toBe("function");

    const engineMint = withheldBinderType();
    const authorTwin = annotationToCompatType(WITHHELD_BINDER_TYPE_NAME);
    const authorTwinAtLet = letAnnotationToCompatType(WITHHELD_BINDER_TYPE_NAME);

    expect(
      authorTwin,
      "precondition: `annotationToCompatType` (src/parser/type-layer-checks.ts `annotationToCompatType`) must still mint SOMETHING for the sentinel's ten characters, or the collision this cell is about would be closed elsewhere and this cell would pass vacuously",
    ).toBeDefined();
    expect(
      authorTwinAtLet,
      "precondition: `letAnnotationToCompatType` (src/parser/type-layer-checks.ts `letAnnotationToCompatType`) is the second author-reachable producer (the `let`-annotation site) and must also still mint",
    ).toBeDefined();

    // The premise of the report, asserted rather than assumed: all three values
    // are `named` and carry the SAME name. The fix does not change that — the
    // sentinel is not being renamed (§Fix (b) route 3 was not taken) — so this
    // stays true on both sides of the fix, and it is what makes the inequality
    // below a statement about PROVENANCE and not about spelling.
    for (const [label, value] of [
      ["the engine mint", engineMint],
      ["the author's `annotationToCompatType` twin", authorTwin as CompatType],
      ["the author's `letAnnotationToCompatType` twin", authorTwinAtLet as CompatType],
    ] as const) {
      expect(value.kind, `${label} must be a \`named\` CompatType`).toBe("named");
      expect(
        (value as { readonly name: string }).name,
        `${label} must carry the sentinel's ten characters — the fix gives the arm provenance, it does not rename the sentinel`,
      ).toBe(WITHHELD_BINDER_TYPE_NAME);
    }

    // THE CLAIM. Two values the engine must be able to tell apart must not be
    // structurally identical. `containsWithheldBinderType`
    // (src/parser/type-layer-checks.ts `containsWithheldBinderType`) has nothing to consult but the
    // value it is handed, so structural equality here IS indistinguishability.
    expect(
      engineMint,
      "0143 §Expected behaviour ¶1 — a predicate that distinguishes engine-minted values must not do it by string equality on a field an author controls: the engine's mint is byte-equal to the value an author's `<withheld>` annotation produces, so the withhold decision is FORGEABLE at the module seam",
    ).not.toEqual(authorTwin);
    expect(
      engineMint,
      "0143 §Expected behaviour ¶1 — the same forgery channel at the `let`-annotation producer (src/parser/type-layer-checks.ts `letAnnotationToCompatType`)",
    ).not.toEqual(authorTwinAtLet);

    // And the marker explicitly, in both directions, so the inequality above
    // cannot be satisfied by some incidental difference.
    expect(
      marker(engineMint),
      "0143 §Fix (b) route 1 — the engine's mint must carry the provenance marker `withheld: true` (src/parser/type-compat.ts `CompatType`'s `named` arm), which is what `containsWithheldBinderType`'s `named` arm tests instead of the name",
    ).toBe(true);
    expect(
      marker(authorTwin as CompatType),
      "0143 §Fix (b) route 1 — no author-reachable producer may set the marker: `annotationToCompatType`'s fallthrough (src/parser/type-layer-checks.ts `convertAnnotation`'s trailing `named` mint) mints from a trimmed source slice and must never claim engine provenance",
    ).toBeUndefined();
    expect(
      marker(authorTwinAtLet as CompatType),
      "0143 §Fix (b) route 1 — the `let`-annotation producer must not set the marker either",
    ).toBeUndefined();
  });
});

// ===========================================================================
// w2 — the marker is carried through composition.
// ===========================================================================

/** The frontmatter every w2 body is parsed under. */
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** `(code, message)` pairs in emission order — the whole list, unfiltered. */
function rowsOf(body: readonly string[]): Array<readonly [string, string]> {
  return diagsOf(body).map((d) => [d.code, d.message] as const);
}

/** An UNANNOTATED `fn` parameter read inside an `array<…>`, plus a call. */
function fnParamCarrier(body: readonly string[]): readonly string[] {
  return ["fn f(p) {", ...body, "}", "let z = f(1)", "1"];
}

describe("0143 w2 — the marker is carried through composition: every genuine engine mint keeps its withhold", () => {
  // WHY THIS EXISTS BESIDE w1. Route 1 moves the predicate off the name and
  // onto a field the MINT SITES must set. If either mint site were missed, the
  // predicate would silently stop firing and the deferral disposition
  // (docs/spec_topics/type-system.md:48) would collapse into a wave of new
  // emissions on untypeable binders. The two surviving binder classes at HEAD
  // are the UNANNOTATED `fn` PARAMETER (`recordWithheldBinders`,
  // src/parser/type-layer-checks.ts `recordWithheldBinders`) and the MATCH-ARM
  // binder (`#matchArmScope`, src/parser/static-type-inference.ts
  // `#matchArmScope`); both are
  // exercised below, in both directions — the sinks that still emit, and the
  // sinks that must keep deferring.

  it("w2a: the `fn`-parameter carrier's four surviving emissions are byte-unmoved", () => {
    // These four verdicts are decidable from the composite's OUTER kind, so the
    // withhold gate never suppresses them and the settled fix must not either.
    // Their RENDERED type is 0143 face 2, which bug 0247's clause now admits;
    // the strings are pinned here and in
    // tests/withheld-sentinel-mooting-and-render-pins.test.ts so a render
    // change is deliberate.
    expect(
      rowsOf(fnParamCarrier(["  if [p] { let r = 1 }", "  1"])),
      "code-registry-parse.md:37 — a decidable non-`boolean` condition; the provenance change must not move it",
    ).toEqual([
      [
        "theta/parse/non-boolean-condition",
        msg("theta/parse/non-boolean-condition", [["<type>", "array<<withheld>>"]]),
      ],
    ]);
    expect(
      rowsOf(fnParamCarrier(["  let r = [p] + 1", "  r"])),
      "code-registry-parse.md:39 — a decidable mixed-`+` pair; the provenance change must not move it",
    ).toEqual([
      [
        "theta/parse/mixed-plus-operands",
        msg("theta/parse/mixed-plus-operands", [
          ["<left>", "array<<withheld>>"],
          ["<right>", "integer"],
        ]),
      ],
    ]);
    expect(
      rowsOf(fnParamCarrier(["  let r = [p] < 1", "  r"])),
      "code-registry-parse.md:40 — a decidable non-orderable pair; the provenance change must not move it",
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
    expect(
      rowsOf(fnParamCarrier(["  let r = [p].frobnicate()", "  r"])),
      "code-registry-parse.md:70 — a method on no built-in type at all; the provenance change must not move it",
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

  it("w2b: the `fn`-parameter carrier's withheld sinks still DEFER — the predicate still fires", () => {
    // THE LOAD-BEARING HALF. The join-element gate
    // (src/parser/type-layer-checks.ts `checkMethodCall`'s `join`-element
    // withhold gate) and the `for`-iterand gate
    // (src/parser/type-layer-checks.ts `walkStmt`'s `case "for"` iterand
    // withhold gate) both consult `containsWithheldBinderType`, so if `recordWithheldBinders`
    // stopped minting through the marked factory these two would start
    // emitting. `[]` here is the observable that the predicate still answers
    // for a genuine engine mint after the seam change — including THROUGH the
    // `array` composite, which the predicate recurses into (its `array` arm).
    expect(
      rowsOf(fnParamCarrier(['  let r = [p].join(",")', "  r"])),
      "type-system.md:48 — an untypeable join element defers; a marker the mint site failed to set would turn this into an emission",
    ).toEqual([]);
    expect(
      rowsOf(fnParamCarrier(["  for y in p { y }", "  1"])),
      "type-system.md:48 — an untypeable iterand defers; a marker the mint site failed to set would turn this into a `non-array-iterand` refusal",
    ).toEqual([]);
  });

  it("w2c: the inference pass's OWN `#matchArmScope` mint (static-type-inference.ts `#matchArmScope`) carries the marker too", () => {
    // The second mint site is a SEPARATE literal at HEAD, in a module that
    // never imports the type layer (the bug 0145 layering adjudication
    // recorded in src/parser/type-compat.ts `WITHHELD_BINDER_TYPE_NAME`'s doc
    // comment, §"Home"). A fixture whose outer statement is itself the `match`
    // (e.g. `let q = match 1 { n => … }`) does NOT reach this site: `walkExpr`'s
    // `case "match"` (src/parser/type-layer-checks.ts) substitutes the TYPE
    // LAYER's own `matchArmScope` — not the pass's — before walking the arm
    // body, so a gate consulted from inside that walk never asks the pass to
    // type the arm body under its own `#matchArmScope`.
    //
    // The pass's own `#matchArmScope` is reached only when `typeOf` is asked
    // for the type of the `match` EXPRESSION itself from OUTSIDE any
    // statement-level match walk — `TypeLayerWalk.typeOf` (line ~1350) forwards
    // every call straight to `StaticTypeInferencePass.typeOf`, whose own `case
    // "match"` types each arm body under `this.#matchArmScope(...)` to reduce
    // the arms to the match's own type. Both fixtures below put a `match`
    // expression directly in a gate's operand position — the `for` iterand and
    // the `join` receiver — so the type consulted by each gate is the one the
    // pass minted for the arm's own pattern binder. This is the pre-existing
    // suite protection for this exact mint site: bug 0145's witness
    // tests/match-arm-scope-inference-pass.test.ts, cells c3 (RED — the
    // pre-fix spelling mint) and c4 (the post-fix deferral this cell also
    // requires, without the outer shadowing binding c3 turns on).
    //
    // Measured directly against a reversion of this mint site to the bare
    // `{ kind: "named", name: WITHHELD_BINDER_TYPE_NAME }` literal: both
    // fixtures below start emitting — `theta/parse/non-array-iterand`
    // (`got <withheld>`) and `theta/parse/non-string-array-join`
    // (`got array<<withheld>>`) respectively — which is the discriminating
    // power this cell exists to pin.
    expect(
      rowsOf(["for y in match 1 { n => n } { y }", "1"]),
      "control-flow.md:13 / type-system.md:48 — the `for` iterand is the `match` expression itself; the pass's own arm-scope mint must carry the marker or the iterand gate stops deferring",
    ).toEqual([]);
    expect(
      rowsOf(['match 1 { n => [n] }.join(",")', "1"]),
      "type-system.md:48 — the `join` receiver is the `match` expression itself; same requirement, at the join-element gate",
    ).toEqual([]);
  });
});

// ===========================================================================
// w3 — no author-reachable `named` ever carries the marker.
// ===========================================================================

describe("0143 w3 — the marker is unreachable from author text at every shape the annotation converter mints", () => {
  it("w3: no `named` node produced by `annotationToCompatType` carries the provenance marker", () => {
    // THE ANTI-OVERREACH PIN on route 1. The route's whole soundness claim is
    // "no author-reachable path constructs the marker" (§Fix (b) route 1). A
    // fix that, say, set the marker inside `convertAnnotation`'s fallthrough
    // (src/parser/type-layer-checks.ts `convertAnnotation`'s trailing `named`
    // mint) whenever the captured text equalled
    // the sentinel would satisfy w1's inequality for the FACTORY and reopen the
    // forgery channel here.
    //
    // The sweep covers the sentinel itself, its whitespace variant (which
    // `parseType`'s `parts.join("")` normalises to the sentinel at the document
    // level, though `annotationToCompatType` is handed the raw slice here), the
    // case variant, the report's `<foo>` control, an ordinary unresolvable
    // identifier, and the two COMPOSITE shapes the converter recurses through —
    // so the recursion in `namedNodes` above is scored against a real `array`
    // and a real `union`, not only against bare names.
    const slices: readonly string[] = [
      WITHHELD_BINDER_TYPE_NAME,
      "< withheld >",
      "<Withheld>",
      "<foo>",
      "Qq",
      `array<${WITHHELD_BINDER_TYPE_NAME}>`,
      `${WITHHELD_BINDER_TYPE_NAME} | integer`,
    ];
    const offenders: string[] = [];
    let scoredNamed = 0;
    for (const slice of slices) {
      const converted = annotationToCompatType(slice);
      expect(
        converted,
        `precondition: \`annotationToCompatType\` must still convert ${JSON.stringify(slice)}; an \`undefined\` here would make this sweep vacuous`,
      ).toBeDefined();
      const nodes = namedNodes(converted as CompatType);
      expect(
        nodes.length,
        `precondition: ${JSON.stringify(slice)} must yield at least one \`named\` node for the marker check to score`,
      ).toBeGreaterThan(0);
      for (const node of nodes) {
        scoredNamed += 1;
        if (marker(node) !== undefined) {
          offenders.push(`${JSON.stringify(slice)} → ${JSON.stringify(node)}`);
        }
      }
    }
    expect(
      offenders,
      "0143 §Fix (b) route 1 — the marker must be unforgeable BY CONSTRUCTION: an author-reachable producer that sets it puts the withhold decision back under author control, which is the root this fix closes",
    ).toEqual([]);
    // ANTI-VACUITY: the sweep must actually have scored one `named` node per
    // slice — five bare, one inside the `array` element, one inside the union's
    // first arm (its `integer` arm is a `prim` and contributes none) = 7.
    expect(
      scoredNamed,
      "the sweep must score every `named` node the seven slices produce; a smaller count means the converter stopped minting `named` for one of them and the pin has gone soft",
    ).toBe(7);
  });
});
