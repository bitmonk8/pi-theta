import { describe, expect, it } from "vitest";
import {
  parseLoomDocument,
  type Block,
  type Expr,
  type LoomDocument,
  type ParseLoomDocumentDeps,
  type QueryExpr,
  type SchemaDecl,
  type Stmt,
} from "../src/parser/loom-document";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import type { LoomSource } from "../src/lexer/lexer";

// V13b integration — parser-level tests for the whole-body query-schema resolve
// pass (`resolveQuerySchemas`, wired into `parseLoomDocument`): the QRY-2
// INDIRECT response-schema inference at the four spec-backed sink positions, the
// QRY-3 explicit override, the QRY-4 `loom/parse/explicit-schema-mismatch`
// warning, and the schema-subset.md step-4 per-query `$defs` pruning wired into
// `lowerQueryResponseSchema`.
//
// These are deterministic PARSE-time transform tests: a query's response schema
// is resolved from surrounding type context by a pure AST pass, so no live model
// probe is involved (a model probe would test the runtime respond loop, not this
// parse-time inference). Each test parses real `.loom`/`.fn` source, locates the
// `QueryExpr`, and asserts its resolved `.schema`.
//
// Spec: query/query-forms.md (QRY-2/3/4), schema-subset.md §"Lowering Algorithm"
// step 4.

// --- harness ---------------------------------------------------------------

function makeDeps(): ParseLoomDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parse(src: string, path = "resolve.loom"): LoomDocument {
  const source: LoomSource = { path, bytes: new TextEncoder().encode(src) };
  return parseLoomDocument(source, makeDeps());
}

/** The `schema` declarations of a parsed body (for the lowering helper). */
function schemaDeclsOf(doc: LoomDocument): readonly SchemaDecl[] {
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** Every `QueryExpr` in a parsed body, in source order (depth-first). */
function queriesOf(doc: LoomDocument): QueryExpr[] {
  const found: QueryExpr[] = [];
  const visitExpr = (e: Expr): void => {
    if (e.kind === "query") {
      found.push(e);
    }
    for (const child of childExprs(e)) {
      visitExpr(child);
    }
  };
  const visitBlock = (b: Block): void => {
    for (const s of b.statements) {
      visitStmt(s);
    }
    if (b.tail !== null) {
      visitExpr(b.tail);
    }
  };
  const visitStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        if (s.init !== null) visitExpr(s.init);
        return;
      case "reassign":
        visitExpr(s.value);
        return;
      case "if":
        visitExpr(s.condition);
        visitBlock(s.then);
        if (s.otherwise !== null) {
          if ("statements" in s.otherwise) visitBlock(s.otherwise);
          else visitStmt(s.otherwise);
        }
        return;
      case "while":
        visitExpr(s.condition);
        visitBlock(s.body);
        return;
      case "for":
        visitExpr(s.iterand);
        visitBlock(s.body);
        return;
      case "return":
        if (s.operand !== null) visitExpr(s.operand);
        return;
      case "fn":
        visitBlock(s.body);
        return;
      case "query":
        visitExpr(s.query);
        return;
      case "tool-call":
        visitExpr(s.call);
        return;
      case "invoke":
        visitExpr(s.invoke);
        return;
      case "expr":
        visitExpr(s.expr);
        return;
      default:
        return;
    }
  };
  visitBlock(doc.body);
  return found;
}

function childExprs(e: Expr): readonly Expr[] {
  switch (e.kind) {
    case "binary":
      return [e.left, e.right];
    case "ternary":
      return [e.condition, e.consequent, e.alternate];
    case "try":
      return [e.operand];
    case "index":
      return [e.target, e.index];
    case "member":
      return [e.target];
    case "array":
      return e.elements;
    case "call":
    case "invoke":
      return e.args;
    case "object":
      return e.fields.map((f) => f.value);
    case "match":
      return [e.scrutinee, ...e.arms.map((arm) => arm.body)];
    case "result-ctor":
      return [e.arg];
    case "method-call":
      return [e.target, ...e.args];
    default:
      return [];
  }
}

/** The single query in `src`; fails loudly if the count is not exactly one. */
function onlyQuery(src: string): QueryExpr {
  const queries = queriesOf(parse(src));
  expect(queries.length, `expected exactly one query in:\n${src}`).toBe(1);
  return queries[0] as QueryExpr;
}

const MISMATCH_CODE = "loom/parse/explicit-schema-mismatch";

// ===========================================================================
// QRY-2 — call-argument sink
// ===========================================================================

describe("V13b — call-arg sink (indirect position 1)", () => {
  it("infers a typed fn parameter as the sink", () => {
    const q = onlyQuery("fn f(x: Score): Out {\n  x\n}\nlet y = f(@`hi`)\n");
    expect(q.schema).toBe("Score");
  });

  it("stays null for an UNtyped call boundary (unknown tool callee)", () => {
    const q = onlyQuery("let t = someTool(@`hi`)\n");
    expect(q.schema).toBeNull();
  });

  it("crosses the postfix `?` into the call-arg sink", () => {
    const q = onlyQuery("fn f(x: Score): Out {\n  x\n}\nlet y = f(@`hi`?)\n");
    expect(q.schema).toBe("Score");
  });
});

// ===========================================================================
// QRY-2 — enclosing fn return sink
// ===========================================================================

describe("V13b — fn-return sink (indirect position 2)", () => {
  it("infers a declared return type from the fn tail expression", () => {
    const q = onlyQuery("fn g(x: integer): Score {\n  @`hi`\n}\n");
    expect(q.schema).toBe("Score");
  });

  it("infers a declared return type from a `return` operand", () => {
    const q = onlyQuery("fn h(x: integer): Score {\n  return @`hi`\n}\n");
    expect(q.schema).toBe("Score");
  });

  it("infers a declared return type from a `return` nested in an `if`", () => {
    const queries = queriesOf(
      parse("fn h(x: integer): Score {\n  if x > 0 {\n    return @`hi`\n  }\n  return @`lo`\n}\n"),
    );
    expect(queries.map((q) => q.schema)).toEqual(["Score", "Score"]);
  });

  it("a .loom top-level tail is NOT a return sink (stays null)", () => {
    const q = onlyQuery("@`hi`\n");
    expect(q.schema).toBeNull();
  });

  it("infers the declared return type for a `return` inside a `while` body", () => {
    // Bug 1 regression: a `return @`…`` nested in a loop body still targets the
    // fn's implicit return, so it must carry the declared-return sink (both the
    // loop-nested return and the fn's tail return).
    const queries = queriesOf(
      parse("fn f(cond: bool): Score {\n  while cond {\n    return @`hi`\n  }\n  return @`lo`\n}\n"),
    );
    expect(queries.map((q) => q.schema)).toEqual(["Score", "Score"]);
  });

  it("infers the declared return type for a `return` inside a `for` body", () => {
    const queries = queriesOf(
      parse("fn f(xs: array<integer>): Score {\n  for x in xs {\n    return @`hi`\n  }\n  return @`lo`\n}\n"),
    );
    expect(queries.map((q) => q.schema)).toEqual(["Score", "Score"]);
  });

  it("a loop-body TAIL is NOT the fn's implicit return (stays null)", () => {
    // Bug 1 negative: the query in the `while` body's tail position is a loop
    // tail, not the fn's implicit return, so it stays untyped; only the fn's
    // own tail `return`/tail carries the sink.
    const queries = queriesOf(
      parse("fn f(cond: bool): Score {\n  while cond {\n    @`tail`\n  }\n  return @`ret`\n}\n"),
    );
    expect(queries.map((q) => q.schema)).toEqual([null, "Score"]);
  });
});

// ===========================================================================
// QRY-2 — array-literal element sink
// ===========================================================================

describe("V13b — array-literal element sink (indirect position 3)", () => {
  it("peels one array level: array<Score> element → Score", () => {
    const queries = queriesOf(parse("let xs: array<Score> = [@`a`, @`b`]\n"));
    expect(queries.map((q) => q.schema)).toEqual(["Score", "Score"]);
  });

  it("peels nested arrays: array<array<Score>> element-of-element → Score", () => {
    const q = onlyQuery("let xs: array<array<Score>> = [[@`a`]]\n");
    expect(q.schema).toBe("Score");
  });

  it("stays null for an array literal with no enclosing sink", () => {
    const q = onlyQuery("let xs = [@`a`]\n");
    expect(q.schema).toBeNull();
  });
});

// ===========================================================================
// QRY-2 — ternary branch sink
// ===========================================================================

describe("V13b — ternary branch sink (indirect position 4)", () => {
  it("infers the enclosing sink into both ternary branches", () => {
    const queries = queriesOf(parse("let z: Score = true ? @`a` : @`b`\n"));
    expect(queries.map((q) => q.schema)).toEqual(["Score", "Score"]);
  });

  it("stays null when the ternary itself has no sink", () => {
    const queries = queriesOf(parse("let z = true ? @`a` : @`b`\n"));
    expect(queries.map((q) => q.schema)).toEqual([null, null]);
  });
});

// ===========================================================================
// QRY — opaque positions stop the walk
// ===========================================================================

describe("V13b — opaque positions stop the walk (schema stays null)", () => {
  it("match scrutinee is opaque", () => {
    const q = onlyQuery("let m = match @`hi` {\n  _ => 1\n}\n");
    expect(q.schema).toBeNull();
  });

  it("a match ARM body is not a transparent position (stays null under a let sink)", () => {
    const q = onlyQuery("let m: Score = match 1 {\n  _ => @`hi`\n}\n");
    expect(q.schema).toBeNull();
  });

  it("binary operand is opaque", () => {
    const q = onlyQuery("fn f(x: Score): Score {\n  @`hi` + x\n}\n");
    expect(q.schema).toBeNull();
  });

  it("member access receiver is opaque", () => {
    const q = onlyQuery("fn f(x: Score): Score {\n  @`hi`.field\n}\n");
    expect(q.schema).toBeNull();
  });

  it("index receiver is opaque", () => {
    const q = onlyQuery("fn f(x: Score): Score {\n  @`hi`[0]\n}\n");
    expect(q.schema).toBeNull();
  });

  it("if condition is opaque", () => {
    const q = onlyQuery("fn f(x: Score): Score {\n  if @`hi` {\n    x\n  }\n  x\n}\n");
    expect(q.schema).toBeNull();
  });

  it("while condition is opaque", () => {
    const q = onlyQuery("while @`hi` {\n  1\n}\n");
    expect(q.schema).toBeNull();
  });
});

// ===========================================================================
// QRY-3 — explicit override
// ===========================================================================

describe("V13b — QRY-3 explicit @<Schema> always overrides", () => {
  it("keeps an explicit ascription even in an opaque (binary) position", () => {
    const q = onlyQuery("fn f(x: Score): Score {\n  @<Verdict>`hi` + x\n}\n");
    expect(q.schema).toBe("Verdict");
  });

  it("keeps an explicit ascription over a would-be call-arg sink", () => {
    const q = onlyQuery("fn f(x: Score): Out {\n  x\n}\nlet y = f(@<Verdict>`hi`)\n");
    expect(q.schema).toBe("Verdict");
  });
});

// ===========================================================================
// QRY-2 — innermost sink wins
// ===========================================================================

describe("V13b — innermost sink wins", () => {
  it("the call-site parameter, not the outer binding annotation, is the sink", () => {
    // `let y: Out = process(@`...`?)` where `process(p: In)` — the innermost
    // sink is the parameter `In`, not the outer `Out`.
    const q = onlyQuery(
      "fn process(p: In): Out {\n  p\n}\nlet y: Out = process(@`hi`?)\n",
    );
    expect(q.schema).toBe("In");
  });
});

// ===========================================================================
// Documented limit — object / union sinks at an indirect position stay null
// ===========================================================================

describe("V13b — object/union sinks are not inferable at an indirect position", () => {
  it("an object sink parameter leaves the call-arg query null", () => {
    const q = onlyQuery(
      "fn f(x: { a: string }): Out {\n  x\n}\nlet y = f(@`hi`)\n",
    );
    expect(q.schema).toBeNull();
  });

  it("a union sink return type leaves the fn-tail query null", () => {
    const q = onlyQuery("fn g(x: integer): A | B {\n  @`hi`\n}\n");
    expect(q.schema).toBeNull();
  });

  it("an inline-object element in `array<{a: string}>` stays null", () => {
    // Bug 2 regression: the array element type `{a: string}` is not a plain
    // schema identifier, so the element query must stay untyped rather than
    // resolve to a bogus `named` schema.
    const q = onlyQuery("let xs: array<{a: string}> = [@`hi`]\n");
    expect(q.schema).toBeNull();
  });

  it("a nested-union element in `array<A|B>` stays null", () => {
    const q = onlyQuery("let xs: array<A|B> = [@`hi`]\n");
    expect(q.schema).toBeNull();
  });

  it("a named element in `array<array<Score>>` still resolves (round-trip intact)", () => {
    const q = onlyQuery("let xs: array<array<Score>> = [[@`hi`]]\n");
    expect(q.schema).toBe("Score");
  });
});

// ===========================================================================
// QRY-4 — explicit-schema-mismatch warning
// ===========================================================================

describe("V13b — QRY-4 explicit-schema-mismatch", () => {
  it("fires one warning for `let x: integer = @<number>`", () => {
    const doc = parse("let x: integer = @<number>`hi`\n");
    const diags = doc.diagnostics.filter((d) => d.code === MISMATCH_CODE);
    expect(diags.length).toBe(1);
    expect(diags[0]?.severity).toBe("warning");
  });

  it("fires NO warning for `let x: number = @<integer>` (wider binding allowed)", () => {
    const doc = parse("let x: number = @<integer>`hi`\n");
    const diags = doc.diagnostics.filter((d) => d.code === MISMATCH_CODE);
    expect(diags.length).toBe(0);
  });

  it("fires NO warning for a direct-let propagation (`let x: Score = @`)", () => {
    const doc = parse("let x: Score = @`hi`\n");
    const diags = doc.diagnostics.filter((d) => d.code === MISMATCH_CODE);
    expect(diags.length).toBe(0);
  });
});

// ===========================================================================
// schema-subset.md step 4 — per-query $defs pruning
// ===========================================================================

describe("V13b — per-query $defs pruning (schema-subset.md step 4)", () => {
  it("keeps only the $defs reachable from the response-schema root", () => {
    // Body declares two independent named schemas. A query whose response
    // schema references only `Referenced` must not carry `Unrelated` (or its
    // nested refs) in the lowered per-query document's `$defs`.
    const src = [
      "schema Leaf { v: string }",
      "schema Referenced { leaf: Leaf }",
      "schema OtherLeaf { w: string }",
      "schema Unrelated { other: OtherLeaf }",
      "let r: array<Referenced> = [@`hi`]",
      "",
    ].join("\n");
    const doc = parse(src);
    const lowered = lowerQueryResponseSchema(
      "array<Referenced>",
      schemaDeclsOf(doc),
    );
    expect(lowered, "the query response schema lowers").toBeDefined();
    const defs = (lowered as { readonly $defs?: Record<string, unknown> }).$defs ?? {};
    const names = Object.keys(defs).sort();
    // `Referenced` is reachable from the `array<Referenced>` root; `Unrelated`
    // and `OtherLeaf` are unreachable and pruned.
    expect(names).toContain("Referenced");
    expect(names).not.toContain("Unrelated");
    expect(names).not.toContain("OtherLeaf");
  });
});
