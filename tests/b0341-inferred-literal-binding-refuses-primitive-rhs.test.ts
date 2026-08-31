import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0341 — an unannotated binding initialised from a literal records the
// LITERAL type, not the primitive that literal types as. `walkStmt`'s
// `case "let"` adopts the initialiser's inferred type verbatim for an
// unannotated binding (src/parser/type-layer-checks.ts:1641-1647 at HEAD
// 089b27df), and `#typeExpr`'s literal arms mint
// `{ kind: "literal", typesAs: … }` (src/parser/static-type-inference.ts:258-265),
// so `let mut a = ""` is recorded as a literal-typed target. `decide`'s
// literal-target arm (src/parser/type-compat.ts:381-387) relates a literal
// TARGET only to a literal SOURCE — every other consumer in the tree equates
// `literal` with its `typesAs` primitive — so a `string`-typed RHS is refused
// with `theta/parse/reassign-rhs-type-mismatch`, and because `displayType`
// renders a literal as that same primitive (`type-compat.ts:419-420`) the
// message reads `expected string, got string`: a refusal an author cannot
// act on. The same asymmetry swallows TYPE-2's one-way narrowing route: a
// `number` RHS under an inferred-`integer` target draws the mismatch row
// instead of `theta/parse/integer-narrowing`.
// (docs/bugs/0341-inferred-literal-binding-refuses-primitive-rhs.md)
//
// SETTLED FIX (release 0.309.0): record what the initialiser EXPRESSION types
// as. `widenLiteralTypes` (src/parser/type-compat.ts) maps every literal type
// inside the inferred type to its `typesAs` primitive — recursing through
// `array`, `union` and inline-`object` structure, leaving `named` untouched —
// and the unannotated arm of `case "let"` records the widened type. TYPE-3
// ("a literal types as its primitive in expression position") is the rule
// this lands; `⊑` itself is unchanged, and an ANNOTATED binding is untouched
// because an annotation never lowers to a literal type (`convertAnnotation`
// has no literal arm).
//
// WITNESS TABLE (Observed = HEAD/RED, Expected = the settled contract):
//   A1-A7  WITNESS  legal writes into an inferred binding   refused -> clean
//   B1-B4  CONTROL  genuinely wrong writes                  refused = refused
//   C1-C2  WITNESS  the narrowing route the defect masked   wrong code -> right code
//   D1     WITNESS  no message renders `expected X, got X`
//   E1-E2  WITNESS  the registration consequence of A1/B1
//   F1-F3  CONTROL  neighbouring sinks that must not move
//   G1     WITNESS  inferred and annotated bindings agree on the array LUB
//
// RED-FOR-RIGHT-REASON: without the fix, A1-A7 report the false
// `reassign-rhs-type-mismatch`, C1 reports that row instead of
// `integer-narrowing`, C2 reports it instead of nothing, D1 collects three
// `expected <T>, got <T>` messages, E1 finds the offender unregistered and G1's
// inferred and annotated twins diverge instead of both reading `array<number>`
// (the post-0344 collapsed LUB — see the G1 cell below).
// The B and F rows are green in both directions and are what proves the fix
// removes false positives only.

const MISMATCH = "theta/parse/reassign-rhs-type-mismatch";
const NARROWING = "theta/parse/integer-narrowing";

/** Parse a body under the minimal frontmatter every cell here shares. */
function diagnosticsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc(`---\ndescription: b0341\nmode: prompt\n---\n${body.join("\n")}\n`).diagnostics;
}

function codesOf(body: readonly string[]): string[] {
  return diagnosticsOf(body).map((d) => d.code);
}

function messagesOf(body: readonly string[]): string[] {
  return diagnosticsOf(body).map((d) => d.message);
}

/**
 * The composition root's registration gate, mirrored: `hasLoadParseError`
 * (`src/extension/production-composition.ts`) is
 * `diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") ||
 * d.code.startsWith("theta/parse/")))`, and a document carrying one is not
 * registered. The predicate is module-private, so it is mirrored clause for
 * clause rather than imported — it is what turns this parse verdict into a
 * theta that does or does not exist as a slash command.
 */
function registers(body: readonly string[]): boolean {
  return !diagnosticsOf(body).some(
    (d) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

describe("bug 0341 (a) — a legal write into an inferred binding is not refused", () => {
  it("A1: `let mut a = \"\"` accepts a `string`-typed RHS", () => {
    expect(codesOf(['let s: string = "q"', 'let mut a = ""', "a = s", "a"])).toEqual([]);
  });

  it("A2: the same binding accepts a `string`-typed concatenation", () => {
    expect(codesOf(['let s: string = "q"', 'let mut a = ""', "a = a + s", "a"])).toEqual([]);
  });

  it("A3: the compound `+=` spelling of A2 is equally clean", () => {
    expect(codesOf(['let s: string = "q"', 'let mut a = ""', "a += s", "a"])).toEqual([]);
  });

  it("A4: `let mut c = 0` accepts an `integer`-typed RHS", () => {
    expect(codesOf(["let n: integer = 2", "let mut c = 0", "c = c + n", "c"])).toEqual([]);
  });

  it("A5: a schema field read through a `for` loop variable is a legal RHS", () => {
    expect(
      codesOf([
        "schema Item { id: string }",
        "let items: array<Item> = []",
        'let mut c = ""',
        "for it in items {",
        "  c = c + it.id",
        "}",
        "c",
      ]),
    ).toEqual([]);
  });

  it("A6: the widening reaches an array element (`let mut xs = [\"a\"]`)", () => {
    expect(codesOf(['let s: string = "q"', 'let mut xs = ["a"]', "xs = [s]", "xs"])).toEqual([]);
  });

  it("A7: the same holds for `boolean`", () => {
    expect(codesOf(["let b: boolean = true", "let mut f = false", "f = b", "f"])).toEqual([]);
  });
});

describe("bug 0341 (b) — a genuinely wrong write is still refused, with an actionable message", () => {
  it("B1: an `integer` RHS under an inferred `string` binding still draws the row", () => {
    expect(codesOf(['let mut a = ""', "a = 1", "a"])).toEqual([MISMATCH]);
    expect(messagesOf(['let mut a = ""', "a = 1", "a"])).toEqual([
      "reassignment of 'a' type mismatch: expected string, got integer",
    ]);
  });

  it("B2: a `number` literal under an inferred `integer` binding is still the narrowing row", () => {
    expect(codesOf(["let mut n = 1", "n = 1.5", "n"])).toEqual([NARROWING]);
  });

  it("B3: an ANNOTATED binding is byte-identical to before the fix", () => {
    expect(codesOf(['let mut a: string = ""', "a = 1", "a"])).toEqual([MISMATCH]);
  });

  it("B4: a `string`-typed RHS under an inferred `integer` binding is refused", () => {
    expect(codesOf(['let s: string = "q"', "let mut n = 1", "n = s", "n"])).toEqual([MISMATCH]);
    expect(messagesOf(['let s: string = "q"', "let mut n = 1", "n = s", "n"])).toEqual([
      "reassignment of 'n' type mismatch: expected integer, got string",
    ]);
  });
});

describe("bug 0341 (c) — the TYPE-2 narrowing route the literal target masked", () => {
  it("C1: a `number`-typed RHS under an inferred `integer` binding routes to integer-narrowing", () => {
    // Pre-fix this read `[MISMATCH]` with the message `expected integer, got
    // number`: `decidePrimitive` was never reached, because the literal-target
    // arm returned `incompatible` before the narrowing case could be decided.
    expect(codesOf(["let n: number = 1.5", "let mut c = 0", "c = n", "c"])).toEqual([NARROWING]);
    expect(messagesOf(["let n: number = 1.5", "let mut c = 0", "c = n", "c"])).toEqual([
      "cannot narrow number to integer",
    ]);
  });

  it("C2: TYPE-2's admitted direction (`integer` RHS, `number` target) is clean", () => {
    expect(codesOf(["let n: integer = 1", "let mut c = 0.5", "c = n", "c"])).toEqual([]);
  });
});

describe("bug 0341 (d) — no reassignment message renders the same type on both sides", () => {
  it("D1: every mismatch this surface can emit names two different types", () => {
    const bodies: readonly (readonly string[])[] = [
      ['let s: string = "q"', 'let mut a = ""', "a = s", "a"],
      ["let n: integer = 2", "let mut c = 0", "c = c + n", "c"],
      ['let s: string = "q"', 'let mut xs = ["a"]', "xs = [s]", "xs"],
      ['let mut a = ""', "a = 1", "a"],
      ['let s: string = "q"', "let mut n = 1", "n = s", "n"],
      ["let n: number = 1.5", "let mut c = 0", "c = n", "c"],
    ];
    const tautologies = bodies
      .flatMap(messagesOf)
      .map((m) => /expected (.+), got (.+)$/.exec(m))
      .filter((m): m is RegExpExecArray => m !== null)
      .filter((m) => m[1] === m[2]);
    expect(tautologies, "a diagnostic whose expected and actual render identically").toEqual([]);
  });
});

describe("bug 0341 (e) — the registration consequence", () => {
  it("E1: the offender theta registers", () => {
    expect(registers(['let s: string = "q"', 'let mut a = ""', "a = a + s", "a"])).toBe(true);
  });

  it("E2: the genuinely wrong write still denies registration", () => {
    expect(registers(['let mut a = ""', "a = 1", "a"])).toBe(false);
  });
});

describe("bug 0341 (f) — neighbouring sinks do not move", () => {
  it("F1: an inferred binding is still a valid `fn` argument", () => {
    expect(codesOf(["fn g(s: string): string { s }", 'let x = "q"', "g(x)"])).toEqual([]);
  });

  it("F2: an inferred binding still satisfies a typed `let`", () => {
    expect(codesOf(['let x = "q"', "let y: string = x", "y"])).toEqual([]);
  });

  it("F3: `array.join`'s string-element precondition is unaffected", () => {
    expect(codesOf(['let mut xs = ["a"]', 'xs.join(",")'])).toEqual([]);
  });
});

describe("bug 0341 (g) — inferred and annotated bindings now agree", () => {
  it("G1: the array LUB renders the same for an inferred and an annotated integer binding", () => {
    const annotated = messagesOf([
      "let n: integer = 1",
      "let xs = [n, 1.5]",
      "let ys: array<string> = xs",
      "ys",
    ]);
    const inferred = messagesOf([
      "let n = 1",
      "let xs = [n, 1.5]",
      "let ys: array<string> = xs",
      "ys",
    ]);
    // Bug 0341 made the pair agree; bug 0344 fixed what they agree ON: a
    // `commonType` candidate is widened to the primitive it types as before
    // the domination test, so `prim integer` and `literal number` collapse to
    // `number` rather than unioning. Both twins now read `array<number>`.
    expect(inferred).toEqual(annotated);
    expect(annotated).toEqual([
      "let binding 'ys' initialiser type mismatch: expected array<string>, got array<number>",
    ]);
  });
});
