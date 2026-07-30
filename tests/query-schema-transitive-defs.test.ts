// Bug 0004 — `invoke<array<T>>` / `@<array<T>>` return validation drops the
// transitive `$defs` of named schemas (docs/bugs/0004-generic-annotation-drops-
// transitive-defs.md).
//
// These tests drive `lowerQueryResponseSchema` (the single lowering entry both
// producer boundaries call — `#buildTypedValidation` (QRY-22, typed `@<…>`
// query) and `#validateInvokeReturn` (INV-6, `invoke<…>` return; FN-6 reuses
// the invoke machinery) in `src/extension/production-theta-producer.ts`) plus
// the real `AjvSchemaValidator` compile+validate round-trip. No live model.
//
// The BUG CELLS assert the FIXED contract per schema-subset.md §Reuse and
// §"Lowering algorithm" (reachable `$defs` are copied into the assembled
// document at the TOP level; unreachable ones pruned) and are RED today:
// a named schema fragment referencing another named schema carries a
// FRAGMENT-LOCAL `$defs` (`lowerObjectFields` in
// `src/parser/body-type-lowering.ts`), so copying the fragment under the
// document's `$defs.<Name>` nests the dependency at the unreachable position
// `#/$defs/<Name>/$defs/<Dep>` while the `$ref: "#/$defs/<Dep>"` is
// root-absolute; `pruneDocumentDefs` computes `<Dep>` reachable but only
// filters, never hoists. AJV compile then throws, e.g. (captured 0.14.0):
//
//   MissingRefError: can't resolve reference #/$defs/Loc from id #
//
// Current (0.14.0) behaviour per cell, recorded via probe:
//   - `array<Item>` (arm 3)                 RED  — MissingRefError #/$defs/Loc
//   - `{ items: array<Item> }` (arm 2)      RED  — MissingRefError #/$defs/Loc
//   - bare `Item` (arm 1, 1-level nesting)  GREEN (control)
//   - `{ path: string }` (no named refs)    GREEN (control)
//   - 3-level chain `array<Item2>`          RED  — MissingRefError #/$defs/Loc2
//   - bare `Item2` (arm 1, 2-level nesting) RED  — MissingRefError #/$defs/Pos
//     (the bug doc's "arm 1 works" holds only for ONE level of nesting)
//   - recursive `array<Node>`               GREEN (control) at 0.14.0; its
//     depth-enforcement assertion is RED until bug 0028 lands (see the cell)
//   - mutual `array<A>` (A declared first)  GREEN (control) at 0.14.0; its
//     depth-enforcement assertion is RED until bug 0028 lands (see the cell)
//   - mutual `array<B>`                     RED  — MissingRefError #/$defs/A
//   - dedup `array<Pair>`                   RED  — MissingRefError #/$defs/Item
//   - unused-schema pruning `array<Item>`   RED  (compile leg; `Unused` is
//     already absent from `$defs` today — the cell guards a ship-everything fix)
//
// Spec: docs/reference/schema-subset.md (§Reuse, §Lowering algorithm),
// docs/spec_topics/schemas.md, docs/spec_topics/invocation.md §Typed return
// (INV-6), docs/spec_topics/functions.md (FN-6),
// query/query-failure-and-repair.md (QRY-22).

import { describe, expect, it } from "vitest";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { buildTypedQueryValidation } from "../src/runtime/typed-query-validation";
import {
  runTypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
} from "../src/runtime/query-tool-loop";
import {
  AjvSchemaValidator,
  type CompiledValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Checkpoint } from "../src/seams/checkpoint";

// --- Harness (pattern: tests/production-typed-query-validation.test.ts) -----

/** Parse a `.theta` source and return its body's `schema` declarations. */
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = {
    path: "transitive.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** A fresh real `AjvSchemaValidator` (content-addressed so no cache collisions). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** Lower `annotation` against `src`'s schema decls; fails loudly if it doesn't lower. */
function lower(annotation: string, src: string): LoweredSchema {
  const lowered = lowerQueryResponseSchema(annotation, schemaDeclsOf(src));
  expect(lowered, `annotation \`${annotation}\` lowers to a schema document`).toBeDefined();
  return lowered as LoweredSchema;
}

/** The assembled document's top-level `$defs` map (empty when absent). */
function defsOf(lowered: LoweredSchema): Record<string, Record<string, unknown>> {
  const defs = (lowered as { readonly $defs?: Record<string, Record<string, unknown>> })
    .$defs;
  return defs ?? {};
}

/**
 * Compile through the real AJV seam. On the RED cells this is the line that
 * throws today: `MissingRefError: can't resolve reference #/$defs/<Dep> from id #`.
 */
function compile(lowered: LoweredSchema): CompiledValidator {
  return ajv().compile(lowered);
}

/** Assert no def carries fragment-local `$defs` residue (part of the fix contract). */
function expectNoNestedDefsResidue(lowered: LoweredSchema): void {
  for (const [name, body] of Object.entries(defsOf(lowered))) {
    expect(
      body,
      `bug 0004 fix contract: $defs.${name} carries no fragment-local $defs residue`,
    ).not.toHaveProperty("$defs");
  }
}

// --- Fixtures ----------------------------------------------------------------
//
// Declaration order is leaf-first (as in the bug doc's repro). It mattered when
// this suite was written: the body-type map was built SINGLE-PASS in source
// order, so a NamedType naming a not-yet-lowered decl lowered permissively to
// `{}` and sidestepped the `$defs` nesting this bug is about — leaf-first order
// made every nested reference a real `$ref`. Bug 0028 replaced that with
// whole-file two-pass lowering (docs/bugs/0028-unresolved-annotation-silent-
// permissive-lowering.md §Fix), so declaration order is now irrelevant: every
// reference to a top-level `schema`/`enum` mints a `$ref` whatever the order,
// including a forward or self reference. The leaf-first order is retained here
// as the bug-0004 repro's shape, not as a precondition.

const CORE = [
  "schema Loc { path: string, anchor: string }",
  "schema Item { id: string, location: array<Loc> }",
].join("\n");

const CHAIN = [
  "schema Pos { line: number }",
  "schema Loc2 { pos: array<Pos> }",
  "schema Item2 { id: string, loc: Loc2 }",
].join("\n");

const RECURSIVE = "schema Node { name: string, children: array<Node> }";

// Mutual recursion. `A` is declared first; before bug 0028 that made `A.b` lower
// permissively (`B` not yet in the single-pass body-type map) while `B.a` was a
// real `$ref` to `A`. Under two-pass lowering BOTH directions are `$ref`s and
// both fragments are hoisted, so the pair is symmetric.
const MUTUAL = ["schema A { b: array<B> }", "schema B { a: array<A> }"].join("\n");

const PAIR = [CORE, "schema Pair { first: Item, second: Item }"].join("\n");

const WITH_UNUSED = [CORE, "schema Unused { x: string }"].join("\n");

const VALID_ITEM = { id: "I-1", location: [{ path: "a.ts", anchor: "fn a" }] };
/** `Loc` missing its required `anchor`. */
const ITEM_MISSING_ANCHOR = { id: "I-1", location: [{ path: "a.ts" }] };
/** `location` is not an array at all. */
const ITEM_WRONG_TYPE = { id: "I-1", location: "not-an-array" };

// ===========================================================================
// Bug cell (i) — arm 3: `array<Item>` (the `invoke<array<Item>>` shape).
// RED today: MissingRefError "can't resolve reference #/$defs/Loc from id #".
// ===========================================================================

describe("bug-0004 (i) — arm 3 `array<Item>`: transitive $defs hoisted to the top level", () => {
  it("STRUCTURE: the assembled document carries top-level $defs.Loc (and $defs.Item), with no fragment-local $defs residue", () => {
    const lowered = lower("array<Item>", CORE);
    expect(lowered).toMatchObject({
      type: "array",
      items: { $ref: "#/$defs/Item" },
    });
    const names = Object.keys(defsOf(lowered)).sort();
    // schema-subset.md §Lowering algorithm: every transitively-reachable def is
    // present at the TOP level — `Loc` is reachable via `Item.location`.
    expect(names, "bug 0004: reachable defs are hoisted, exactly Item + Loc").toEqual([
      "Item",
      "Loc",
    ]);
    expectNoNestedDefsResidue(lowered);
  });

  it("BEHAVIOUR: AJV compiles, a valid instance validates ok, invalid instances reject", () => {
    const lowered = lower("array<Item>", CORE);
    // RED today: this compile throws MissingRefError (#/$defs/Loc).
    const validator = compile(lowered);
    expect(validator.validate([VALID_ITEM]).ok, "a conforming array<Item> validates").toBe(
      true,
    );
    expect(
      validator.validate([ITEM_MISSING_ANCHOR]).ok,
      "a Loc missing `anchor` is rejected (the transitive def is ENFORCED, not dropped)",
    ).toBe(false);
    expect(
      validator.validate([ITEM_WRONG_TYPE]).ok,
      "a non-array `location` is rejected",
    ).toBe(false);
  });
});

// ===========================================================================
// Bug cell (ii) — arm 2: inline object `{ items: array<Item> }`.
// RED today: identical MissingRefError (#/$defs/Loc) — the inline-object arm
// assembles the same broken document when a field references a named schema
// whose fragment carries nested named refs.
// ===========================================================================

describe("bug-0004 (ii) — arm 2 inline object `{ items: array<Item> }`", () => {
  it("STRUCTURE: top-level $defs carries Item AND Loc, no fragment-local residue", () => {
    const lowered = lower("{ items: array<Item> }", CORE);
    expect(lowered).toMatchObject({
      type: "object",
      required: ["items"],
      additionalProperties: false,
    });
    expect(Object.keys(defsOf(lowered)).sort()).toEqual(["Item", "Loc"]);
    expectNoNestedDefsResidue(lowered);
  });

  it("BEHAVIOUR: AJV compiles; valid accepts; missing `anchor` deep inside rejects", () => {
    const lowered = lower("{ items: array<Item> }", CORE);
    // RED today: MissingRefError (#/$defs/Loc).
    const validator = compile(lowered);
    expect(validator.validate({ items: [VALID_ITEM] }).ok).toBe(true);
    expect(validator.validate({ items: [ITEM_MISSING_ANCHOR] }).ok).toBe(false);
    expect(validator.validate({ items: 42 }).ok).toBe(false);
  });
});

// ===========================================================================
// Bug cell (iii) — typed-query path. `#buildTypedValidation` (QRY-22) lowers
// `@<array<Item>>` through the SAME `lowerQueryResponseSchema` entry the unit
// cells above drive, then validates through the root `SchemaValidator`; this
// cell composes exactly those production collaborators (the
// production-typed-query-validation.test.ts harness) and drives the real
// `runTypedQueryLoop` — no live model. RED today: the validate step's AJV
// compile throws MissingRefError (#/$defs/Loc) out of the loop.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function config(): QueryToolLoopConfig {
  // A typed query dispatches only the forced-respond terminator (max_rounds: 0).
  return {
    maxRounds: 0,
    querySite: { file: "transitive.theta", line: 1, column: 1 },
    thetaSlashName: "/transitive",
    invocationId: "inv-0004",
    occurredAt: 0,
  };
}

/** A scripted model whose forced-respond turn carries `payload`. */
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}

describe("bug-0004 (iii) — typed-query `@<array<Item>>` through the production validation composition", () => {
  it("a conforming array<Item> reply validates against the lowered annotation and binds as the typed value", async () => {
    const schemas = schemaDeclsOf(CORE);
    const lowered = lower("array<Item>", CORE);
    const validation = buildTypedQueryValidation({
      lowered,
      resolveShape: () => schemas.find((s) => s.name === "Item"),
      schemaValidator: ajv(),
      attempts: 0,
      maxRounds: 0,
      driveFollowUp: () => Promise.resolve("{}"),
    });

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel([VALID_ITEM]),
      config(),
      validation,
    );

    // RED today: the validate step's AJV compile throws MissingRefError
    // (#/$defs/Loc) before any outcome is produced. Fixed contract: the
    // conforming reply binds as the typed query's value (QRY-22).
    expect(outcome.kind, "bug 0004: a conforming @<array<Item>> reply binds").toBe("value");
    if (outcome.kind === "value") {
      expect(outcome.value).toEqual([VALID_ITEM]);
    }
  });
});

// ===========================================================================
// Controls (iv) — GREEN today AND after the fix.
// ===========================================================================

describe("bug-0004 (iv) — controls green before and after the fix", () => {
  it("arm 1 bare `Item` (one nesting level): fragment root carries its own top-level $defs.Loc and round-trips", () => {
    const lowered = lower("Item", CORE);
    expect(lowered).toMatchObject({ type: "object", required: ["id", "location"] });
    expect(Object.keys(defsOf(lowered))).toContain("Loc");
    const validator = compile(lowered);
    expect(validator.validate(VALID_ITEM).ok).toBe(true);
    expect(validator.validate(ITEM_MISSING_ANCHOR).ok).toBe(false);
  });

  it("arm 2 inline object with NO named refs `{ path: string }` round-trips (no $defs at all)", () => {
    const lowered = lower("{ path: string }", CORE);
    expect(lowered).not.toHaveProperty("$defs");
    const validator = compile(lowered);
    expect(validator.validate({ path: "a.ts" }).ok).toBe(true);
    expect(validator.validate({ path: 42 }).ok).toBe(false);
    expect(validator.validate({}).ok).toBe(false);
  });

  it("recursive `Node` under `array<Node>` compiles and validates, enforcing depth", () => {
    // This cell was GREEN at 0.14.0 for a reason bug 0028 removed: `Node.children`
    // lowered PERMISSIVELY (`items: {}`) because the self-reference was not yet in
    // the body-type map while `Node`'s own body lowered (`buildBodyTypeMap` was
    // single-pass in declaration order), so no `$ref` was minted and no nesting
    // defect could arise. The consequence was that an invalid CHILD validated OK —
    // depth was not enforced at all. The original assertions were chosen to hold
    // "even if a later fix lowers the self-reference to a real recursive $ref";
    // that fix is bug 0028 (docs/bugs/0028-unresolved-annotation-silent-permissive-
    // lowering.md §Fix, whole-file two-pass lowering), so they still hold and the
    // depth-enforcement assertion the bug doc names is added below.
    const lowered = lower("array<Node>", RECURSIVE);
    expect(Object.keys(defsOf(lowered))).toContain("Node");
    const validator = compile(lowered);
    expect(
      validator.validate([{ name: "root", children: [{ name: "kid", children: [] }] }]).ok,
    ).toBe(true);
    expect(
      validator.validate([{ children: [] }]).ok,
      "a Node missing `name` at the top level rejects",
    ).toBe(false);
    // Bug 0028: the recursive `$ref` applies the SAME closed `Node` body at every
    // depth, so a non-conforming CHILD rejects. Before that fix `children.items`
    // was `{}` and this payload validated OK.
    expect(
      validator.validate([{ name: "root", children: [{ nope: 1 }] }]).ok,
      "bug 0028 depth enforcement: a nested child that is not a `Node` rejects — the " +
        "self-reference lowers to a recursive $ref, not to the accept-anything {}",
    ).toBe(false);
  });

  it("mutual pair under `array<A>` compiles and validates, enforcing depth", () => {
    // This cell was GREEN at 0.14.0 only because `A` was declared FIRST, so `A.b`
    // lowered permissively (`items: {}` — `B` was not yet in the single-pass
    // body-type map) and `A`'s fragment carried no refs at all; `array<B>` (below)
    // was the red direction. Bug 0028's two-pass lowering makes the pair symmetric
    // — both directions are `$ref`s and both fragments are hoisted — so the
    // original assertions stand and depth under `b` is now enforced.
    const lowered = lower("array<A>", MUTUAL);
    expect(Object.keys(defsOf(lowered))).toContain("A");
    const validator = compile(lowered);
    expect(validator.validate([{ b: [] }]).ok).toBe(true);
    expect(validator.validate([{}]).ok, "an A missing `b` rejects").toBe(false);
    // Bug 0028: `A.b` items resolve to the closed `B` body, so an element that is
    // not a `B` rejects. Before that fix `A.b.items` was `{}` and it validated OK.
    expect(
      validator.validate([{ b: [{ nope: 1 }] }]).ok,
      "bug 0028 depth enforcement: a nested `A.b` element that is not a `B` rejects",
    ).toBe(false);
  });

  it("an UNDECLARED name under a generic stays permissive and compilable (cell-v note: the precise-error path is unreachable from source)", () => {
    // Bug-0004 cell (v) is UNREACHABLE from source: `lowerTypeExpr`
    // (src/parser/params.ts) lowers an unresolved NamedType permissively to `{}`
    // (recording it in `ctx.unresolved`) — it never mints a `$ref` whose target
    // is absent. The ONLY source-constructible dangling ref is the nesting
    // defect itself, so no "genuinely missing def" unit test exists; instead
    // this control pins that the permissive contract survives the fix (the fix
    // must not turn unresolved names into dangling refs or a compile failure).
    const lowered = lower("array<Ghost>", CORE);
    expect(lowered).toEqual({ type: "array", items: {} });
    const validator = compile(lowered);
    expect(validator.validate([{ anything: true }]).ok).toBe(true);
  });
});

// ===========================================================================
// Bug cell (iv-chain) — 3-level chain `Item2 → Loc2 → Pos` under `array<Item2>`.
// RED today: MissingRefError "can't resolve reference #/$defs/Loc2 from id #"
// (`Loc2` nests at #/$defs/Item2/$defs/Loc2, `Pos` one level deeper still).
// ===========================================================================

describe("bug-0004 (iv-chain) — 3-level chain under `array<Item2>`", () => {
  it("STRUCTURE: top-level $defs carries ALL reachable names (Item2, Loc2, Pos), no residue", () => {
    const lowered = lower("array<Item2>", CHAIN);
    expect(Object.keys(defsOf(lowered)).sort()).toEqual(["Item2", "Loc2", "Pos"]);
    expectNoNestedDefsResidue(lowered);
  });

  it("BEHAVIOUR: compiles and enforces the chain to full depth", () => {
    const lowered = lower("array<Item2>", CHAIN);
    // RED today: MissingRefError (#/$defs/Loc2).
    const validator = compile(lowered);
    expect(validator.validate([{ id: "I", loc: { pos: [{ line: 1 }] } }]).ok).toBe(true);
    expect(
      validator.validate([{ id: "I", loc: { pos: [{ line: "one" }] } }]).ok,
      "a wrong-typed `Pos.line` two named levels down rejects",
    ).toBe(false);
    expect(validator.validate([{ id: "I", loc: {} }]).ok).toBe(false);
  });

  it("arm 1 bare `Item2` (TWO nesting levels) — ALSO red today, beyond the bug doc's 'arm 1 works' summary", () => {
    // Recorded current behaviour (0.14.0): bare `Item2` throws
    // `MissingRefError: can't resolve reference #/$defs/Pos from id #` — arm 1
    // returns the fragment whose OWN top-level $defs covers one level (`Loc2`),
    // but `Pos` rides fragment-locally inside `Loc2`. The bug doc's "arm 1
    // works" holds only for one level of nesting; the shared fix
    // (`pruneDocumentDefs` grown into hoist-and-close is called by ALL three
    // arms) must close arm 1's document too.
    const lowered = lower("Item2", CHAIN);
    expect(Object.keys(defsOf(lowered)).sort(), "Loc2 AND Pos hoisted to the top").toEqual([
      "Loc2",
      "Pos",
    ]);
    expectNoNestedDefsResidue(lowered);
    // RED today: MissingRefError (#/$defs/Pos).
    const validator = compile(lowered);
    expect(validator.validate({ id: "I", loc: { pos: [{ line: 1 }] } }).ok).toBe(true);
    expect(validator.validate({ id: "I", loc: { pos: [{ line: "one" }] } }).ok).toBe(false);
  });
});

// ===========================================================================
// Bug cell (iv-mutual) — mutual recursion under `array<B>` (the direction whose
// fragment carries a real `$ref`). RED today: MissingRefError
// "can't resolve reference #/$defs/A from id #".
// ===========================================================================

describe("bug-0004 (iv-mutual) — mutual pair under `array<B>`", () => {
  it("STRUCTURE + BEHAVIOUR: `A` is hoisted to the top level and enforced", () => {
    const lowered = lower("array<B>", MUTUAL);
    const names = Object.keys(defsOf(lowered)).sort();
    expect(names, "both mutual defs present at the top level").toEqual(["A", "B"]);
    expectNoNestedDefsResidue(lowered);
    // RED today: MissingRefError (#/$defs/A).
    const validator = compile(lowered);
    expect(validator.validate([{ a: [{ b: [] }] }]).ok).toBe(true);
    expect(validator.validate([{}]).ok, "a B missing `a` rejects").toBe(false);
    expect(
      validator.validate([{ a: [{}] }]).ok,
      "a nested A missing `b` rejects (the hoisted def is enforced through B's $ref)",
    ).toBe(false);
  });
});

// ===========================================================================
// Bug cell (iv-dedup) — `Pair { first: Item, second: Item }` under `array<Pair>`.
// RED today: MissingRefError "can't resolve reference #/$defs/Item from id #".
// ===========================================================================

describe("bug-0004 (iv-dedup) — `array<Pair>` referencing `Item` twice", () => {
  it("STRUCTURE: exactly ONE top-level $defs.Item and ONE $defs.Loc — no duplicate/mangled def names", () => {
    const lowered = lower("array<Pair>", PAIR);
    // Exact-set equality is the dedup assertion: hoisting `Item` reached along
    // two paths must collapse into the single `$defs.Item` entry (no `Item_2`
    // or similar), plus the transitively-shared `Loc` exactly once.
    expect(Object.keys(defsOf(lowered)).sort()).toEqual(["Item", "Loc", "Pair"]);
    expectNoNestedDefsResidue(lowered);
  });

  it("BEHAVIOUR: compiles; both `Item` occurrences enforced to depth", () => {
    const lowered = lower("array<Pair>", PAIR);
    // RED today: MissingRefError (#/$defs/Item).
    const validator = compile(lowered);
    const second = { id: "2", location: [{ path: "c.ts", anchor: "fn c" }] };
    expect(validator.validate([{ first: VALID_ITEM, second }]).ok).toBe(true);
    expect(
      validator.validate([{ first: VALID_ITEM, second: ITEM_MISSING_ANCHOR }]).ok,
      "a missing `anchor` inside the SECOND Item occurrence rejects",
    ).toBe(false);
  });
});

// ===========================================================================
// Bug cell (iv-pruning) — an unused named schema stays pruned. Guards the fix
// against regressing to ship-every-declared-schema: the fixed document under
// `array<Item>` carries exactly the reachable defs and NOT `Unused`.
// (The `Unused`-absent half already holds today; the cell is red via the
// missing `Loc` / compile leg.)
// ===========================================================================

describe("bug-0004 (iv-pruning) — unused named schema is pruned from the assembled $defs", () => {
  it("`array<Item>` with `Unused` declared alongside: $defs is exactly { Item, Loc }", () => {
    const lowered = lower("array<Item>", WITH_UNUSED);
    const names = Object.keys(defsOf(lowered)).sort();
    expect(names, "reachable defs hoisted; Unused pruned").toEqual(["Item", "Loc"]);
    expect(names).not.toContain("Unused");
    // RED today: MissingRefError (#/$defs/Loc).
    const validator = compile(lowered);
    expect(validator.validate([VALID_ITEM]).ok).toBe(true);
    expect(validator.validate([ITEM_MISSING_ANCHOR]).ok).toBe(false);
  });
});
