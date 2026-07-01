import { describe, expect, it } from "vitest";
import {
  EXPLICIT_SCHEMA_MISMATCH_CODE,
  EXPLICIT_SCHEMA_MISMATCH_MESSAGE,
  checkExplicitSchemaMismatch,
  inferQuerySchema,
  prunePerQueryDefs,
  type InferredSchema,
  type QueryDefsDocument,
  type SchemaSinkFrame,
} from "../src/parser/query-schema-inference";
import {
  type CompatSite,
  type CompatType,
  type PrimitiveName,
  type TypeEnv,
} from "../src/parser/type-compat";

// V13b-T — failing tests for the paired `V13b` "query schema inference"
// implementation.
//
// Spec: query/query-forms.md (QRY-2 typed form, QRY-3 override rule + the
// §"Schema inference algorithm" shallow outward walk, QRY-4 §"Explicit form"
// with `loom/parse/explicit-schema-mismatch`) and schema-subset.md §"Lowering
// Algorithm" step 4 (per-query `$defs` pruning, a SUBS code-keyed obligation
// area).
//
// These tests red because the V13b behaviour is absent: `inferQuerySchema`
// returns an inert sentinel schema (so both the sink and the untyped
// expectations red on their own primary assertion), `checkExplicitSchemaMismatch`
// returns an inert sentinel diagnostic (so the firing vector reds on the wrong
// code and each no-warning vector reds on the non-empty array), and
// `prunePerQueryDefs` prunes nothing (so a document with an unreachable `$def`
// reds). Each test reds on its own primary assertion, not on a compile error,
// missing fixture, or harness throw.

const reviewScore: InferredSchema = { kind: "named", name: "ReviewScore" };
const scoreElem: InferredSchema = { kind: "named", name: "Score" };
const inType: InferredSchema = { kind: "named", name: "In" };
const outType: InferredSchema = { kind: "named", name: "Out" };

describe("V13b-T — inference walk: innermost sink wins (query-forms.md QRY-2 / §Schema inference algorithm)", () => {
  it("QRY-2: crosses the postfix ? and the let RHS, reaching the binding-annotation sink", () => {
    // `let x: ReviewScore = @`...`?` — the walk crosses the postfix `?`
    // (transparent, ERR-18 unwraps `Result<ReviewScore, QueryError>` to
    // `ReviewScore`) and the `let` RHS, reaching the sink at the binding
    // annotation.
    const frames: readonly SchemaSinkFrame[] = [
      { kind: "propagate" },
      { kind: "let", annotation: reviewScore },
    ];
    expect(inferQuerySchema({ frames })).toEqual(reviewScore);
  });

  it("QRY-2: the nearest call-site parameter is the sink, not the outer binding annotation", () => {
    // `let x: Out = process(@`...`?)` where `process(p: In)` — the walk reaches
    // the call-site parameter type `In` first (the innermost sink) and supplies
    // it; the outer binding annotation `Out` is NOT consulted.
    const frames: readonly SchemaSinkFrame[] = [
      { kind: "propagate" },
      { kind: "call-arg", paramType: inType },
      { kind: "let", annotation: outType },
    ];
    expect(inferQuerySchema({ frames })).toEqual(inType);
  });

  it("QRY-2: an inner call boundary hides the outer call's parameter type", () => {
    // `f(g(@`...`?))` — `g`'s parameter type is the sink; `f`'s parameter type
    // is not visible past `g`'s call boundary.
    const frames: readonly SchemaSinkFrame[] = [
      { kind: "propagate" },
      { kind: "call-arg", paramType: inType },
      { kind: "call-arg", paramType: outType },
    ];
    expect(inferQuerySchema({ frames })).toEqual(inType);
  });

  it("QRY-2: an array-literal element inherits the array sink's element type", () => {
    // `let xs: array<Score> = [@`...`?, @`...`?]` — the array literal has a sink
    // (`array<Score>`), so each element inherits `Score` as its sink.
    const frames: readonly SchemaSinkFrame[] = [
      { kind: "propagate" },
      { kind: "array-literal" },
      { kind: "let", annotation: { kind: "array", element: scoreElem } },
    ];
    expect(inferQuerySchema({ frames })).toEqual(scoreElem);
  });
});

describe("V13b-T — inference walk: crossed/stopped rules (query-forms.md §Schema inference algorithm)", () => {
  it("QRY-2: a binary operator is opaque — the walk stops and the query is untyped even under an outer binding", () => {
    // `let x: T = @`...`? + 1` — the `+` operator is opaque; the query has no
    // sink and is untyped (`undefined`), even though a `let` annotation sits
    // further out (the walk never reaches it).
    const frames: readonly SchemaSinkFrame[] = [
      { kind: "propagate" },
      { kind: "stop", label: "+" },
      { kind: "let", annotation: reviewScore },
    ];
    expect(inferQuerySchema({ frames })).toBeUndefined();
  });

  it("QRY-2: the match scrutinee is opaque — a bare query there is untyped", () => {
    // `match @`...` { … }` — the `match` scrutinee is opaque; the query is
    // untyped unless an explicit `@<Schema>` ascription is added.
    const frames: readonly SchemaSinkFrame[] = [{ kind: "stop", label: "match-scrutinee" }];
    expect(inferQuerySchema({ frames })).toBeUndefined();
  });

  it("QRY-2: a loom tail position supplies no sink (a .loom has no declared return type)", () => {
    // A `.loom` file has no declared return type — its return type is itself
    // inferred from its body — so a loom cannot serve as a sink for a query in
    // its own tail/`return` position: the walk finds no sink and is untyped.
    const frames: readonly SchemaSinkFrame[] = [
      { kind: "propagate" },
      { kind: "fn-return" },
    ];
    expect(inferQuerySchema({ frames })).toBeUndefined();
  });

  it("QRY-2: a query enclosed by no sink is untyped", () => {
    // No sink encloses the query and no explicit ascription is present, so the
    // query is untyped (returns `string`).
    expect(inferQuerySchema({ frames: [{ kind: "propagate" }] })).toBeUndefined();
  });
});

describe("V13b-T — explicit `@<Schema>` override (query-forms.md QRY-3)", () => {
  it("QRY-3: an explicit ascription overrides the inference contexts, regardless of the enclosing sink", () => {
    // An explicit `@<Schema>` ascription always supplies the response schema and
    // overrides the inference contexts below — here overriding a `let` binding
    // annotation of a different schema.
    const explicit: InferredSchema = { kind: "primitive", name: "integer" };
    const frames: readonly SchemaSinkFrame[] = [
      { kind: "propagate" },
      { kind: "let", annotation: reviewScore },
    ];
    expect(inferQuerySchema({ frames, explicit })).toEqual(explicit);
  });

  it("QRY-4: an explicit ascription supplies the schema even in an opaque `match` scrutinee", () => {
    // Required in any expression position with no usable type context, such as
    // the scrutinee of `match`: the explicit `@<Schema>` overrides the walk even
    // though the scrutinee is a stop.
    const explicit: InferredSchema = { kind: "named", name: "ReviewScore" };
    const frames: readonly SchemaSinkFrame[] = [{ kind: "stop", label: "match-scrutinee" }];
    expect(inferQuerySchema({ frames, explicit })).toEqual(explicit);
  });
});

describe("V13b-T — loom/parse/explicit-schema-mismatch: the four normative vectors (query-forms.md QRY-4)", () => {
  const site: CompatSite = {
    file: "review.loom",
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  };
  const prim = (name: PrimitiveName): CompatType => ({ kind: "prim", name });
  const named = (name: string): CompatType => ({ kind: "named", name });

  it("loom/parse/explicit-schema-mismatch: `let x: number = @<integer>...?` — no warning (integer ⊑ number)", () => {
    // Vector 1: `integer ⊑ number` by TYPE-2; the explicit form's value is
    // acceptable to the binding, so no warning fires.
    const diagnostics = checkExplicitSchemaMismatch({
      ascription: prim("integer"),
      annotation: prim("number"),
      env: {},
      site,
    });
    expect(diagnostics).toEqual([]);
  });

  it("loom/parse/explicit-schema-mismatch: `let x: integer = @<number>...?` — fires (number ⋢ integer)", () => {
    // Vector 2: `number ⋢ integer` (the explicit `number` could yield `3.5`,
    // which the `integer` binding cannot accept). Exactly one warning, carrying
    // the registry code and message.
    const diagnostics = checkExplicitSchemaMismatch({
      ascription: prim("number"),
      annotation: prim("integer"),
      env: {},
      site,
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(EXPLICIT_SCHEMA_MISMATCH_CODE);
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(diagnostics[0]?.message).toBe(EXPLICIT_SCHEMA_MISMATCH_MESSAGE);
  });

  it("loom/parse/explicit-schema-mismatch: `let x: ReviewScore = @<ReviewScore>...?` — no warning (reflexivity)", () => {
    // Vector 3: reflexivity (TYPE-1) — the ascription and annotation are the
    // same named schema, so no warning fires.
    const env: TypeEnv = { ReviewScore: { kind: "object-schema" } };
    const diagnostics = checkExplicitSchemaMismatch({
      ascription: named("ReviewScore"),
      annotation: named("ReviewScore"),
      env,
      site,
    });
    expect(diagnostics).toEqual([]);
  });

  it("loom/parse/explicit-schema-mismatch: `let x: Animal = @<Cat>...?` where `schema Animal = Cat | Dog` — no warning (variant-to-union)", () => {
    // Vector 4: variant-to-union (TYPE-4) — `Cat ⊑ Animal`, so no warning fires.
    const env: TypeEnv = {
      Cat: { kind: "object-schema" },
      Dog: { kind: "object-schema" },
      Animal: {
        kind: "alias",
        rhs: { kind: "union", arms: [named("Cat"), named("Dog")] },
      },
    };
    const diagnostics = checkExplicitSchemaMismatch({
      ascription: named("Cat"),
      annotation: named("Animal"),
      env,
      site,
    });
    expect(diagnostics).toEqual([]);
  });

  it("loom/parse/explicit-schema-mismatch: the check is skipped when an operand is past the parser's static view", () => {
    // One-directional and skipped-when-unresolvable: when either side is past the
    // parser's static view, the warning is skipped and the runtime AJV check is
    // the safety net. An unresolvable named ascription yields no warning.
    const diagnostics = checkExplicitSchemaMismatch({
      ascription: named("Unresolvable"),
      annotation: prim("integer"),
      env: {},
      site,
    });
    expect(diagnostics).toEqual([]);
  });
});

describe("V13b-T — per-query `$defs` pruning (schema-subset.md §Lowering Algorithm step 4, SUBS code-keyed area)", () => {
  it("SUBS (Lowering step 4): the request document carries only the $defs transitively reachable from the response-schema root", () => {
    // The response-schema root references `A`; `A` references `B`; `C` and `D`
    // are unreachable from the root. Only `A` and `B` survive the prune.
    const doc: QueryDefsDocument = {
      rootRefs: ["A"],
      defs: {
        A: ["B"],
        B: [],
        C: ["D"],
        D: [],
      },
    };
    const pruned = prunePerQueryDefs(doc);
    expect(Object.keys(pruned).sort()).toEqual(["A", "B"]);
  });

  it("SUBS (Lowering step 4): unreachable $defs are pruned even when the reachable set is recursive", () => {
    // Recursive references (`Tree` → `Tree`) are permitted and terminate; the
    // unreachable `Orphan` is still pruned.
    const doc: QueryDefsDocument = {
      rootRefs: ["Tree"],
      defs: {
        Tree: ["Tree"],
        Orphan: [],
      },
    };
    const pruned = prunePerQueryDefs(doc);
    expect(Object.keys(pruned).sort()).toEqual(["Tree"]);
  });
});
