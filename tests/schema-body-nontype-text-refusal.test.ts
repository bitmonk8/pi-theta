import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type {
  EnumDecl,
  FnDecl,
  LetStmt,
  SchemaDecl,
  ThetaDocument,
} from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0061 — the two `Type` positions INSIDE a theta body capture their type as
// source text and never ask whether that text derives from `Type`. A `schema`
// object-body field type (`schema S { a: string | }`) and a `schema X = …`
// alias/union arm (`schema X = Cat +`) each record the junk verbatim, fall past
// every arm of `lowerTypeExpr` to its trailing catch-all
// (src/parser/params.ts:701–:702 — the `unspellable` sink push at `:701`, the
// permissive `return {}` at `:702`), lower `{}`, and draw NO diagnostic at any
// severity — so `hasLoadParseError`
// (src/extension/production-composition.ts:2047) never fires and the theta
// registers with a declaration that validates nothing
// (docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md).
//
// THE GAP IS BETWEEN THREE CORRECT DECISIONS. `parseType`
// (src/parser/theta-document.ts:3079) is an EXTENT scanner: it joins the current
// token unconditionally and breaks only on a closed stop set, and `+`, `.`, `*`,
// `/`, `%`, `==`, `&&`, `?` and `:` are in no stop set at either position, so an
// operator with no operand behind it is absorbed INTO the arm or field type.
// `parseTypeExpression` (src/parser/type-grammar.ts:136) owns the type grammar
// and IS called per arm (theta-document.ts:5943) and per field (`:6396`), but it
// is a POSITION-RULE pass — `void`, generic arity, `Result` in a schema-feeding
// position — and its parser is deliberately tolerant of text it cannot consume.
// The lowering catch-all is licensed to be silent for a DIFFERENT class: a
// `LiteralType` atom, and a brace-rooted arm nested in a generic argument or a
// union arm. Text outside the grammar inherits that silence without belonging to
// any of the three classes.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:90–:102 — the closed `Type` production set
//     (`PrimitiveType` | `NamedType` | `GenericType` | `ObjectType` | union |
//     `LiteralType`); `:98` is `NamedType ::= Ident`, which is why `Ghost+` is
//     no `NamedType`; `:105` names schema field types among the bare-`Type`
//     positions and adds that "the grammar is otherwise identical in every
//     position"; `:109` admits `ObjectType` in any `Type` position and makes an
//     empty `{}` there `theta/parse/empty-schema-body`.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every
//     type-annotation position, schema fields named.
//   - docs/spec_topics/schemas.md:17 — object-schema "field types are any
//     expression from the Type System grammar"; `:62` — the alias right-hand
//     side "is exactly an `AliasRhs`"; `:64` — the absorbed-operator sentence,
//     which is a statement about which token `theta/parse/malformed-alias-rhs`
//     can point at, NOT a statement that the arm text is well-formed.
//   - docs/spec_topics/schema-subset.md:74–:84 — lowering step 3's per-type-form
//     emission table, which defines no `{}` emission for any admitted form, so
//     the permissive lowering matches no rule; `:81` (SUBS-1) is what one junk
//     arm costs a union; `:73` and `:98`/`:106`/`:107` are the
//     `__inline_<slug>` hoist and the canonical-form hash the group (a0)
//     oracles follow.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the
//     registry is CLOSED, so the refusal needs a row) and `:74` (DIAG-4 — the
//     *Message* column is normative, which is why every expected message in
//     this file is READ from the registry and none is restated).
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:49–:55 —
//     category 7: `<X>` "renders the offending declaration's identifier". The
//     refusal's message carries that slot and no junk-text slot, which is what
//     makes the two-fragment cells below expect two diagnostics with IDENTICAL
//     rendered text.
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate every group (a) fixture satisfies today) and `:25`
//     (the diagnostic-registry carve-out, under which a code ADDITION is
//     in-scope for inputs that did not previously emit it).
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix, nine constraints; groups (a) and
// (d) RED now, GREEN after). The refusal is raised by the CALLER at each of the
// two body positions, never inside `lowerTypeExpr`, because that function is
// shared by all four `Type` positions:
//   1. Text no `Type` production spells, at a `schema` object-body field type or
//      a `schema X = …` arm, draws EXACTLY ONE error-severity
//      `theta/parse/schema-type-not-expression` at the DECLARATION's range
//      (constraint 4, group (a)). THE JUDGED UNIT IS THE BRACE-FREE FRAGMENT
//      `lowerTypeExpr`'s catch-all is handed, not the whole arm or field type:
//      the reach covers the whole arm, the whole field type, a union arm at
//      either position, a generic type argument, and a hoisted inline object's
//      field type at any depth. ONE PER OFFENDING FRAGMENT, NO DEDUP —
//      `schema X = Cat + | Dog +` is two, `schema S { a: string +, b: Cat . }`
//      is two, and both members of each pair render the SAME message and carry
//      the SAME range because the only placeholder is the declaration's name.
//   2. An arm or field that ALREADY drew an error-severity diagnostic in its own
//      pass keeps it ALONE — the same-scope last-resort guard (constraint 1,
//      group (b)) — and a declaration whose right-hand side was already refused
//      at PARSE time keeps that refusal alone, which the checker pass cannot see
//      and so needs a node-level flag (constraint 1/5, group (c)).
//   3. `schema X = Ghost +` and `schema S { a: Ghost + }` draw the refusal ALONE
//      and NOT `theta/parse/unresolved-named-type`: `Ghost+` is no `NamedType`
//      (`NamedType ::= Ident`, grammar.md:98), so that row's trigger does not
//      reach it, and restoring it would move the mis-attribution bug 0044 owns
//      (constraint 6, group (d)).
//   4. Grammar-admitted traffic that legitimately reaches the same catch-all
//      keeps its BYTES and its SILENCE at both positions — a brace-rooted arm
//      nested in a generic argument, a mixed literal union, a hoisted inline
//      object, a literal atom, a literal union, a primitive union — and the
//      empty inline object `{}` keeps its single `empty-schema-body`
//      (constraint 3, group (e)). A recogniser that reaches any of these is
//      over-refusing. ONE ROW'S BYTES LATER MOVED UNDER ANOTHER REPORT: bug
//      0184 §Fix routes the union-ARM recursion through the literal
//      sublanguage, so the mixed literal union `"x" | integer` lowers
//      `{"anyOf":[{"const":"x"},{"type":"integer"}]}` rather than
//      `{"anyOf":[{},{"type":"integer"}]}`. Constraint 4's own claim — that this
//      traffic keeps its SILENCE at both positions — is untouched and is what
//      row `e2` below still asserts; only the pinned fragment was re-derived.
//   5. The controls do not move (constraint 5, group (f)), and the three OTHER
//      `Type` positions show byte-identical lowered documents AND byte-identical
//      diagnostic sequences (constraint 2, group (g)): the `@<T>` annotation,
//      the `value` position (`let` annotations at theta-document.ts:6231, `fn`
//      parameter types at `:6306`) and the `return` position (`:6312`).
//
// THE BASELINE THIS FILE PINS IS HEAD, NOT THE BUG DOCUMENT. §Reproduction was
// measured at 0.52.0; two of its rows do not re-derive at HEAD and the cells
// below carry the HEAD reading:
//   - `schema S { a: {} }` and `schema X = {}` each draw ONE
//     `theta/parse/empty-schema-body` (grammar.md:109's rule for an empty inline
//     object type), where the doc records `diags []`. The lowered bytes are
//     unchanged, so constraint 3's byte requirement stands: the fix DECLINES
//     `{}` and leaves that single diagnostic alone (group (e)).
//   - `schema S { a: match }` draws `theta/parse/reserved-keyword-as-identifier`,
//     where the doc cites bug 0044's `unresolved named type 'match'`. The
//     control in group (d) pins the code HEAD actually emits.
//
// WHAT IS RED HERE, AND WHY: group (a) — every refusal cell, because each
// fixture loads with ZERO diagnostics and lowers permissively — group (d)'s
// three constraint-6 cells for the same reason, and group (r), because the
// registry carries no row for the code yet (DIAG-2 makes adding it part of the
// fix, not of this witness). EVERYTHING ELSE IS GREEN AT HEAD AND MUST STAY
// GREEN: groups (a0), (b), (c), (e), (f) and (g) are the over-refusal fences and
// the guard baselines. Group (e)'s `{}` rows and group (g)'s four adjacent
// positions are the sharpest of them.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts — the shipped front end wrapped in the standard inert
// deps double), one `lowerQueryResponseSchema` call for the annotation position,
// and one read of the committed registry pages. An integration or live tier
// could not observe the subject: the subject is which diagnostics a load emits
// and which exact bytes a declaration lowers to, both fully determined before
// any turn runs, and the refusal un-registers the theta — so a live drive would
// observe an absent slash command and could not distinguish this refusal from
// any other load-time error, while adding stochastic surface over a contract
// that has none. The registration consequence is reached the way the sibling
// unit locks reach it: by asserting the two properties the shipped drop gate
// reads — error severity and the `theta/parse/` namespace (`hasLoadParseError`,
// src/extension/production-composition.ts:2047) — rather than by re-driving
// discovery, which witnesses nothing more.
//
// NO SILENT SKIPPING: every reader THROWS, naming the absent intermediate, when
// the lowered `params:` document, the wrapper's `$defs` entry or the declaration
// node is missing, and the DIAG-4 lookup reds by naming the registry page rather
// than comparing against `undefined`. A refused parse or an absent lowering can
// never be mistaken for a pass.

// ===========================================================================
// The code this refusal needs, and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

/**
 * The row bug 0061 §Fix *Registry* mints. DIAG-2 closes the registry, so the
 * code string is asserted here and the row is the fix's to add: the three
 * existing rows assessed against this input class do not fit as written —
 * `theta/parse/malformed-alias-rhs`
 * (docs/spec_topics/diagnostics/code-registry-parse.md:88) excludes the
 * absorbed-operator class in its own *Trigger* text and its *Message* names
 * "the declaration's line", which no field type has;
 * `theta/parse/empty-schema-body` (`:86`) triggers on a shape yielding no
 * content, and these yield arms and fields; `theta/parse/unsupported-feature`
 * (`:27`) renders `<construct>` from a closed token-name table.
 */
const CODE = "theta/parse/schema-type-not-expression";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/**
 * A registry row's normative *Message* (DIAG-4), read rather than restated.
 * Definedness is asserted first so a missing row reds by naming the registry
 * page it belongs on, never by a bare `undefined` comparison. Called only from
 * inside a test body: at module scope a failing `expect` would abort collection
 * and take the green over-refusal fences down with it.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: the diagnostics code registry must carry the Message row for ${code} ` +
      `(docs/spec_topics/diagnostics/code-registry-parse.md, the shard this namespace lives on)`,
  ).toBeDefined();
  return template as string;
}

/** One structured registry row, or a loud failure naming the code. */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `the parsed registry holds no structured row for ${code}; DIAG-2 requires the code and its ` +
        `row to land together, so this refusal has no registry authority yet`,
    );
  }
  return row;
}

/** The refusal's rendered message for one declaration (`<X>` is category-7, unquoted). */
function refusalMessage(declName: string): string {
  return registryMessageOf(CODE).replace("<X>", declName);
}

/** One `<code>: <message>` line, with a registry row's template rendered by one substitution. */
function line(code: string, slot: string, value: string): string {
  return `error ${code}: ${registryMessageOf(code).replace(slot, value)}`;
}

/** One `<code>: <message>` line for a placeholder-free registry row. */
function plainLine(code: string): string {
  return `error ${code}: ${registryMessageOf(code)}`;
}

// ===========================================================================
// Fixture sources and the loud readers.
// ===========================================================================

/** `Cat` and `Dog` are declared in every body fixture; `Ghost` is declared nowhere. */
const DECLS = "schema Cat { a: string }\nschema Dog { b: string }\n";

/** The two body positions this report owns. */
type BodyPosition = "field" | "alias";

/** The `$defs` wrapper name each position's declaration lowers under. */
const WRAPPER: Record<BodyPosition, string> = { field: "S", alias: "X" };

/**
 * A `mode: prompt` theta carrying `declText` in its body, with a `params:` field
 * referencing `wrapper` so the declaration's lowered fragment is reachable at
 * `$defs.<wrapper>`. The wrapper is a bare `NamedType`, so it never carries the
 * junk under test and never draws a `params:`-position diagnostic of its own.
 */
function declSrc(wrapper: string, declText: string): string {
  return `---\nmode: prompt\nparams:\n  p: ${wrapper}\n---\n${DECLS}${declText}\nlet inert = 1\ninert\n`;
}

/** `schema S { a: <T> }` or `schema X = <T>` — the two positions, one type text. */
function declText(position: BodyPosition, typeSource: string): string {
  return position === "field" ? `schema S { a: ${typeSource} }` : `schema X = ${typeSource}`;
}

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** The lowered `params:` document, absent when the load withheld it. */
function loweredParams(doc: ThetaDocument): Record<string, unknown> | undefined {
  return doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
}

/** The `schema` declaration named `name`, loud when the body carries none. */
function schemaDeclOf(label: string, doc: ThetaDocument, name: string): SchemaDecl {
  const decl = doc.body.statements.find(
    (s): s is SchemaDecl => s.kind === "schema" && s.name === name,
  );
  if (decl === undefined) {
    throw new Error(
      `${label}: the body declares no \`schema ${name}\`, so there is no declaration for a ` +
        `refusal to be attributed to; statement kinds ` +
        `${JSON.stringify(doc.body.statements.map((s) => s.kind))}, diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  return decl;
}

/** What one body-position fixture yields. */
interface DeclRead {
  /** The emitted diagnostics themselves — what the shipped drop gate reads. */
  readonly diagnostics: readonly Diagnostic[];
  /** Every diagnostic rendered `<severity> <code>`, in emission order. */
  readonly codes: readonly string[];
  /** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
  readonly lines: readonly string[];
  /** Every diagnostic's range, in emission order. */
  readonly ranges: ReadonlyArray<SourceRange | undefined>;
  /** The declaration's own lowered fragment, read at `$defs.<wrapper>`. */
  readonly lowered: unknown;
  /** The whole `$defs` map of the lowered `params:` document. */
  readonly defs: Record<string, unknown>;
  /** The declaration's identifier — what `<X>` renders. */
  readonly declName: string;
  /** The declaration's range — what every type diagnostic at these positions carries. */
  readonly declRange: SourceRange;
}

/**
 * Read one declaration through the shipped load path, loud on every way a
 * fixture can fail to reach the lowering. A missing lowered document or a
 * missing `$defs` entry means the cell's byte assertion would compare
 * `undefined` against a fragment and pass or fail for the wrong reason.
 */
function readDecl(label: string, wrapper: string, text: string): DeclRead {
  const doc = parseDoc(declSrc(wrapper, text), "bug0061.theta");
  const document = loweredParams(doc);
  if (document === undefined) {
    throw new Error(
      `${label}: the theta declares a \`params:\` block, so its lowered schema must be present ` +
        `for the declaration's fragment to be reachable; diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  const defs = (document["$defs"] ?? {}) as Record<string, unknown>;
  if (!(wrapper in defs)) {
    throw new Error(
      `${label}: the wrapper \`${wrapper}\` is absent from \`$defs\`, so the declaration never ` +
        `lowered; \`$defs\` keys ${JSON.stringify(Object.keys(defs))}, diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  const decl = schemaDeclOf(label, doc, wrapper);
  return {
    diagnostics: doc.diagnostics,
    codes: diagCodes(doc),
    lines: diagLines(doc),
    ranges: doc.diagnostics.map((d) => d.range),
    lowered: defs[wrapper],
    defs,
    declName: decl.name,
    declRange: decl.range,
  };
}

/** One type text at one body position. */
function readAt(label: string, position: BodyPosition, typeSource: string): DeclRead {
  return readDecl(label, WRAPPER[position], declText(position, typeSource));
}

/** `schema S { a: <fragment> }` lowered — the field position's enclosure. */
function sField(fragment: unknown): Record<string, unknown> {
  return {
    type: "object",
    properties: { a: fragment },
    required: ["a"],
    additionalProperties: false,
  };
}

/** The permissive fragment every junk text lowers to today. */
const PERMISSIVE = {};

/**
 * The whole refusal contract for one declaration: EXACTLY `fragments`
 * diagnostics, all of them the registered code at error severity in the
 * `theta/parse/` namespace, all rendering the DECLARATION's identifier, all
 * carrying the DECLARATION's range, and the lowered bytes unmoved.
 *
 * The count/code/severity assertion runs FIRST so the red at HEAD names the
 * symptom the bug reports — a declaration that silently loses all validation —
 * rather than a downstream message or registry mismatch.
 */
function expectRefused(label: string, read: DeclRead, fragments: number, lowered: unknown): void {
  const expected = Array.from({ length: fragments }, () => `error ${CODE}`);
  expect(
    read.codes,
    `${label}: the text is outside the closed \`Type\` grammar (grammar.md:90–:102) and no ` +
      `emission rule admits it (schema-subset.md:74–:84), so the honest disposition is refusal ` +
      `with exactly ${fragments} error-severity ${CODE} — one per offending fragment, no dedup. ` +
      `Rendered diagnostics: ${JSON.stringify(read.lines)}`,
  ).toEqual(expected);
  expect(
    read.lowered,
    `${label}: the refusal is raised by the position's caller, not inside \`lowerTypeExpr\`, so ` +
      `the lowered bytes are the same permissive fragment HEAD emits — a fix that also moves ` +
      `these bytes is changing the lowering as well as the judgement`,
  ).toEqual(lowered);
  expect(
    read.lines,
    `${label}: DIAG-4 — every emission renders the registry row's template with the category-7 ` +
      `\`<X>\` placeholder as the offending declaration's identifier, unquoted ` +
      `(placeholder-rendering-b.md:55). Two fragments in one declaration therefore render ` +
      `IDENTICAL text; that is the count rule, not a duplicate`,
  ).toEqual(Array.from({ length: fragments }, () => `error ${CODE}: ${refusalMessage(read.declName)}`));
  expect(
    read.ranges,
    `${label}: \`SchemaFieldSource\` and an arm string carry no range of their own, so every ` +
      `emission is located at the declaration's range — the range both positions' existing type ` +
      `diagnostics already carry`,
  ).toEqual(Array.from({ length: fragments }, () => read.declRange));
}

/**
 * The predicate `hasLoadParseError`
 * (src/extension/production-composition.ts:2047) computes, evaluated over the
 * diagnostics this fixture actually emitted. This is the reachability link
 * between the refusal and a theta that does not register: without an
 * error-severity `theta/load/` or `theta/parse/` diagnostic the drop arm is not
 * taken and the declaration ships validating every JSON value.
 */
function expectBlocksRegistration(label: string, read: DeclRead): void {
  expect(
    read.diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
    ).length,
    `${label}: the drop gate reads error severity AND the \`theta/load/\` / \`theta/parse/\` ` +
      `namespaces; a warning-severity or differently-namespaced refusal would leave the ` +
      `accept-anything declaration registered. Observed diagnostics: ` +
      `${JSON.stringify(read.lines)}`,
  ).toBeGreaterThan(0);
}

// ===========================================================================
// (r) The registry row every message in this file is derived from.
// RED at HEAD — DIAG-2 makes minting the row part of the fix.
// ===========================================================================

describe("bug 0061 (r) — the registry row this refusal needs", () => {
  it(`RED (r1): the registry carries a row for ${CODE}`, () => {
    // DIAG-2 (diagnostic-shape.md:72) closes the registry: a diagnostic with no
    // row has no authority to exist, and a row with no asserting test fails the
    // same gate from the other side (tests/code-registry.test.ts:86). This file
    // is the asserting test; the row is the fix's to land in the same commit as
    // the site it is raised from.
    const row = registryRowOf(CODE);
    expect(
      row.namespace,
      "the refusal is raised while parsing the body, so it lives in the `parse` namespace — " +
        "which is also what `hasLoadParseError` reads to withhold registration",
    ).toBe("parse");
    expect(
      row.severity,
      "source-language-stability.md:9 reads effective severity off the *Severity* column; a `W` " +
        "row would leave the accept-anything declaration registered with a note attached",
    ).toBe("E");
    expect(row.phase, "the judgement is made during the body parse, not at runtime").toBe("parse");
  });

  it("RED (r2): the *Message* carries the declaration slot and no junk-text slot", () => {
    // The single-placeholder shape is load-bearing for the count rule in group
    // (a): two offending fragments in one declaration render IDENTICAL text.
    // A junk-text placeholder would make those two messages differ, so pinning
    // the placeholder SET here is what keeps the two-fragment cells honest
    // without restating the row's prose (DIAG-4, diagnostic-shape.md:74).
    const template = registryMessageOf(CODE);
    expect(
      template.match(/<[a-zA-Z][a-zA-Z0-9-]*>/g) ?? [],
      "category 7 (placeholder-rendering-b.md:55) renders `<X>` as the offending declaration's " +
        "identifier; no other placeholder is rendered by this row",
    ).toEqual(["<X>"]);
  });

  it("RED (r3): the rendered message differs per declaration name", () => {
    // Anti-vacuity for `refusalMessage`: a template that ignored its slot would
    // make every message assertion in group (a) trivially satisfiable.
    expect(refusalMessage("S")).not.toBe(refusalMessage("X"));
  });
});

// ===========================================================================
// (a0) The independent `__inline_<slug>` oracle group (a) and group (e) mint
// against. GREEN at HEAD.
// ===========================================================================

/**
 * SHA-256 of a hand-written canonical form, first 16 lowercase hex characters
 * (schema-subset.md:98 hashes the LOWERED fragment; `:106`/`:107` give the
 * digest and its truncation). `schemaSlug` is deliberately NOT imported — an
 * oracle taken from the implementation under test proves nothing.
 */
function inlineDefName(canonical: string): string {
  return `__inline_${createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16)}`;
}

/** `{b: string +}` hoisted — the junk field's type is the refused fragment, the brace is the hoist's. */
const B_PERMISSIVE = {
  type: "object",
  properties: { b: {} },
  required: ["b"],
  additionalProperties: false,
};
const B_PERMISSIVE_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{}},"required":["b"],"type":"object"}';
const B_PERMISSIVE_INLINE = inlineDefName(B_PERMISSIVE_CANONICAL);

/** `{b: string}` hoisted — constraint 3's grammar-admitted inline object. */
const B_STRING = {
  type: "object",
  properties: { b: { type: "string" } },
  required: ["b"],
  additionalProperties: false,
};
const B_STRING_CANONICAL =
  '{"additionalProperties":false,"properties":{"b":{"type":"string"}},"required":["b"],' +
  '"type":"object"}';
const B_STRING_INLINE = inlineDefName(B_STRING_CANONICAL);

/** `{c: ???}` hoisted — the inner half of the depth-2 reach. */
const C_PERMISSIVE = {
  type: "object",
  properties: { c: {} },
  required: ["c"],
  additionalProperties: false,
};
const C_PERMISSIVE_CANONICAL =
  '{"additionalProperties":false,"properties":{"c":{}},"required":["c"],"type":"object"}';
const C_PERMISSIVE_INLINE = inlineDefName(C_PERMISSIVE_CANONICAL);

/** `{b: {c: ???}}` hoisted — the outer half, whose `$ref` names the inner slug. */
const B_REF_C = {
  type: "object",
  properties: { b: { $ref: `#/$defs/${C_PERMISSIVE_INLINE}` } },
  required: ["b"],
  additionalProperties: false,
};
const B_REF_C_CANONICAL =
  `{"additionalProperties":false,"properties":{"b":{"$ref":"#/$defs/${C_PERMISSIVE_INLINE}"}},` +
  '"required":["b"],"type":"object"}';
const B_REF_C_INLINE = inlineDefName(B_REF_C_CANONICAL);

const CANONICAL_PAIRS: ReadonlyArray<readonly [string, string, unknown]> = [
  ["{b: string +}", B_PERMISSIVE_CANONICAL, B_PERMISSIVE],
  ["{b: string}", B_STRING_CANONICAL, B_STRING],
  ["{c: ???}", C_PERMISSIVE_CANONICAL, C_PERMISSIVE],
  ["{b: {c: ???}}", B_REF_C_CANONICAL, B_REF_C],
];

describe("bug 0061 (a0) — the independent `__inline_<slug>` oracle's own honesty", () => {
  for (const [label, canonical, fragment] of CANONICAL_PAIRS) {
    it(`GREEN (a0, ${label}): the hand-written canonical form is the fragment it names, canonicalised`, () => {
      expect(
        JSON.parse(canonical),
        `schema-subset.md:98 hashes the LOWERED fragment, so the oracle's canonical string must ` +
          `carry exactly that value; observed ${canonical}`,
      ).toEqual(fragment);
      const sorted = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          return value.map(sorted);
        }
        if (value !== null && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
              .map(([k, v]) => [k, sorted(v)]),
          );
        }
        return value;
      };
      expect(
        canonical,
        `schema-subset.md:100 — object keys sorted by Unicode code point at every level; :101 — ` +
          `no insignificant whitespace; observed ${canonical}`,
      ).toBe(JSON.stringify(sorted(fragment)));
    });
  }
});

// ===========================================================================
// (a) THE DEFECT — constraint 4's refused set at the two body positions, and
// the four reaches past the top level. RED at HEAD: every cell loads with ZERO
// diagnostics and lowers permissively.
// ===========================================================================

/**
 * §Fix constraint 4's absorbed-operator and punctuation set, spelled at BOTH
 * positions. Each is text `parseType`'s stop set does not end and no `Type`
 * production derives, so it reaches `lowerTypeExpr`'s catch-all whole.
 */
const BOTH_POSITION_TEXTS: ReadonlyArray<readonly [string, string]> = [
  ["a1", "Cat +"],
  ["a2", "Cat ."],
  ["a3", "string +"],
  ["a4", "Cat *"],
  ["a5", "Cat /"],
  ["a6", "Cat %"],
  ["a7", "Cat =="],
  ["a8", "Cat &&"],
  ["a9", "Cat ?"],
  ["a10", "Cat :"],
  ["a11", "Cat +++"],
  ["a12", "string ++"],
  ["a13", "+"],
  ["a14", "???"],
];

/**
 * The dangling / leading / lone `|` is a FIELD-position row only. At the alias
 * position the arm filter drops the empty segment before lowering, so the same
 * author error is already `theta/parse/malformed-alias-rhs` there and keeps its
 * correct lowering — the asymmetry this report opens with, fenced in group (c).
 */
const FIELD_ONLY_TEXTS: ReadonlyArray<readonly [string, string]> = [
  ["a15", "string |"],
  ["a16", "Cat |"],
  ["a17", "| string"],
  ["a18", "|"],
];

describe("bug 0061 (a) — text no `Type` production spells is refused at both body positions", () => {
  for (const [id, typeSource] of BOTH_POSITION_TEXTS) {
    for (const position of ["field", "alias"] as const) {
      it(`RED (${id}, ${position}): \`${typeSource}\` draws exactly one ${CODE}`, () => {
        const label = `${id} (${position}, ${typeSource})`;
        const read = readAt(label, position, typeSource);
        expectRefused(label, read, 1, position === "field" ? sField(PERMISSIVE) : PERMISSIVE);
        expectBlocksRegistration(label, read);
      });
    }
  }

  for (const [id, typeSource] of FIELD_ONLY_TEXTS) {
    it(`RED (${id}, field): \`${typeSource}\` draws exactly one ${CODE}`, () => {
      const label = `${id} (field, ${typeSource})`;
      const read = readAt(label, "field", typeSource);
      expectRefused(label, read, 1, sField(PERMISSIVE));
      expectBlocksRegistration(label, read);
    });
  }

  /**
   * THE JUDGED UNIT IS THE FRAGMENT, and these are the reaches past the type's
   * own top level. Each row's junk sits somewhere the lowering hands the
   * judgement a brace-free fragment even though the ENCLOSING form is
   * grammar-admitted and its own emission is defined:
   *
   *   - a19/a20 — a union arm: `lowerTypeExpr` splits the union and lowers each
   *     arm through itself, so the junk arm's fragment reaches the catch-all
   *     while the well-formed arm keeps its bytes. This is where one junk arm
   *     costs the whole union SUBS-1's multi-type-array form
   *     (schema-subset.md:81) and leaves an `anyOf` member that constrains
   *     nothing.
   *   - a21/a22 — a generic type argument: the `array` arm lowers its one
   *     argument through `lowerTypeExpr`, so the argument's fragment reaches the
   *     catch-all while `{"type":"array"}` stays.
   *   - a23/a24/a25 — a hoisted inline object's field type, at one and two
   *     levels: the hoist re-enters the field lowering per field, so the braces
   *     belong to the enclosure and the nested field's fragment arrives
   *     brace-free. The enclosure's own `$ref` and hoisted body are unmoved.
   */
  const REACH_ROWS: ReadonlyArray<
    readonly [string, BodyPosition, string, unknown, ReadonlyArray<readonly [string, unknown]>]
  > = [
    ["a19", "field", "string | integer +", sField({ anyOf: [{ type: "string" }, {}] }), []],
    ["a20", "alias", "string | integer +", { anyOf: [{ type: "string" }, {}] }, []],
    ["a21", "field", "array<Cat +>", sField({ type: "array", items: {} }), []],
    ["a22", "alias", "array<Cat +>", { type: "array", items: {} }, []],
    [
      "a23",
      "field",
      "{b: string +}",
      sField({ $ref: `#/$defs/${B_PERMISSIVE_INLINE}` }),
      [[B_PERMISSIVE_INLINE, B_PERMISSIVE]],
    ],
    [
      "a24",
      "alias",
      "{b: string +}",
      { $ref: `#/$defs/${B_PERMISSIVE_INLINE}` },
      [[B_PERMISSIVE_INLINE, B_PERMISSIVE]],
    ],
    [
      "a25",
      "field",
      "{b: {c: ???}}",
      sField({ $ref: `#/$defs/${B_REF_C_INLINE}` }),
      [
        [B_REF_C_INLINE, B_REF_C],
        [C_PERMISSIVE_INLINE, C_PERMISSIVE],
      ],
    ],
  ];

  for (const [id, position, typeSource, lowered, hoisted] of REACH_ROWS) {
    it(`RED (${id}, ${position}): \`${typeSource}\` refuses the nested fragment alone`, () => {
      const label = `${id} (${position}, ${typeSource})`;
      const read = readAt(label, position, typeSource);
      expectRefused(label, read, 1, lowered);
      for (const [slug, body] of hoisted) {
        expect(
          read.defs[slug],
          `${label}: the enclosure is grammar-admitted, so its hoisted body and the slug that ` +
            `names it keep their bytes (schema-subset.md:73); only the nested fragment is refused`,
        ).toEqual(body);
      }
    });
  }

  it("RED (a26, by spelling): `schema X by a = Cat | Dog +` refuses the junk arm alone", () => {
    // The discriminated-union spelling reaches the same arm list, so the
    // judgement must not turn on which of the two alias spellings the author
    // wrote (grammar.md:105 — the grammar is identical in every position).
    const label = "a26 (by spelling)";
    const read = readDecl(label, "X", "schema X by a = Cat | Dog +");
    expectRefused(label, read, 1, { anyOf: [{ $ref: "#/$defs/Cat" }, {}] });
    expect(
      read.defs["Cat"],
      `${label}: the well-formed arm keeps its resolved reference and its hoisted body`,
    ).toEqual(sField({ type: "string" }));
  });

  it("RED (a27, .thetalib): `schema X = Cat +` in a library is refused the same way", () => {
    // A `.thetalib` has no frontmatter and no `params:` block, so the lowered
    // fragment is unreachable here; the diagnostic sequence is the whole
    // observable, and it is the one GOV-15 observable (b) ranges over.
    const label = "a27 (.thetalib)";
    const doc = parseDoc(`${DECLS}fn f(): integer { 1 }\nschema X = Cat +\n`, "bug0061.thetalib");
    const decl = schemaDeclOf(label, doc, "X");
    expect(
      decl.arms,
      `${label}: precondition — the capture kept the absorbed operator inside the arm, which is ` +
        `what leaves bug 0042's boundary rule nothing to point at`,
    ).toEqual(["Cat+"]);
    expect(
      diagCodes(doc),
      `${label}: the library spelling is the same declaration at the same position ` +
        `(schemas.md:62), so it draws the same single refusal. Rendered diagnostics: ` +
        `${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`]);
    expect(
      diagLines(doc),
      `${label}: DIAG-4 — the declaration's identifier renders into \`<X>\``,
    ).toEqual([`error ${CODE}: ${refusalMessage("X")}`]);
  });

  /**
   * THE COUNT RULE: one diagnostic per offending FRAGMENT, no dedup. Both
   * members of each pair render identical text and carry identical ranges,
   * because the row's only placeholder is the declaration's identifier — so the
   * COUNT is the whole of what distinguishes them, and a fix that dedups by
   * message or by range silently reports one of the two mistakes.
   */
  const COUNT_ROWS: ReadonlyArray<readonly [string, string, string, unknown]> = [
    ["a28 (two junk arms, one declaration)", "X", "schema X = Cat + | Dog +", { anyOf: [{}, {}] }],
    [
      "a29 (two junk fields, one declaration)",
      "S",
      "schema S { a: string +, b: Cat . }",
      {
        type: "object",
        properties: { a: {}, b: {} },
        required: ["a", "b"],
        additionalProperties: false,
      },
    ],
  ];

  for (const [label, wrapper, text, lowered] of COUNT_ROWS) {
    it(`RED (${label}): \`${text}\` draws two ${CODE}`, () => {
      expectRefused(label, readDecl(label, wrapper, text), 2, lowered);
    });
  }
});

// ===========================================================================
// (b) CONSTRAINT 1, GUARD 1 — the same-scope last resort. An arm or field that
// already drew an error-severity diagnostic in its own pass keeps it ALONE.
// GREEN at HEAD and required to stay green.
// ===========================================================================

// Every row below is a count-of-one cell: adding the text refusal on top turns
// one author mistake into two reports. The absorbed operator changes nothing
// about which rule fires, because `parseTypeExpression` walks the node its
// tolerant parser DID build and no arm inspects the remainder — which is why the
// guard has to be a decision rather than an accident.

describe("bug 0061 (b) — a scope already refused keeps exactly its own diagnostic", () => {
  it("GREEN (b1, field): `void +` keeps `void-in-non-return-position` alone", () => {
    const label = "b1 (field, void +)";
    const read = readAt(label, "field", "void +");
    expect(read.lines, `${label}: one mistake, one report`).toEqual([
      plainLine("theta/parse/void-in-non-return-position"),
    ]);
    expect(read.lowered, `${label}: the lowered bytes do not move either`).toEqual(
      sField(PERMISSIVE),
    );
  });

  it("GREEN (b2, field): `array<integer, integer> +` keeps `generic-arity-mismatch` alone", () => {
    const label = "b2 (field, array<integer, integer> +)";
    const read = readAt(label, "field", "array<integer, integer> +");
    expect(read.lines, `${label}: one mistake, one report`).toEqual([
      `error theta/parse/generic-arity-mismatch: ${registryMessageOf(
        "theta/parse/generic-arity-mismatch",
      )
        .replace("<ctor>", "array")
        .replace("<expected>", "1")
        .replace("<actual>", "2")}`,
    ]);
    expect(read.lowered, `${label}: the lowered bytes do not move either`).toEqual(
      sField(PERMISSIVE),
    );
  });

  it("GREEN (b3, alias): `Result<string, integer> +` keeps `result-in-schema-position` alone", () => {
    const label = "b3 (alias, Result<string, integer> +)";
    const read = readAt(label, "alias", "Result<string, integer> +");
    expect(read.lines, `${label}: one mistake, one report`).toEqual([
      plainLine("theta/parse/result-in-schema-position"),
    ]);
    expect(read.lowered, `${label}: the lowered bytes do not move either`).toEqual(PERMISSIVE);
  });

  it('GREEN (b4, field): `enum["x"] +` keeps `inline-enum` alone', () => {
    const label = 'b4 (field, enum["x"] +)';
    const read = readAt(label, "field", 'enum["x"] +');
    expect(read.lines, `${label}: one mistake, one report`).toEqual([
      plainLine("theta/parse/inline-enum"),
    ]);
    expect(read.lowered, `${label}: the lowered bytes do not move either`).toEqual(
      sField(PERMISSIVE),
    );
  });

  it("GREEN (b5, alias): `Ghost | Cat +` keeps `unresolved-named-type` alone", () => {
    // The guard is per-SCOPE, not per-fragment: the unresolved arm and the junk
    // arm are two fragments of one declaration, and the declaration already has
    // its report. Constraint 6 decides the OTHER direction — a junk fragment
    // that hides a name (group (d)) — and the two must not contradict.
    const label = "b5 (alias, Ghost | Cat +)";
    const read = readAt(label, "alias", "Ghost | Cat +");
    expect(read.lines, `${label}: one declaration, one report`).toEqual([
      line("theta/parse/unresolved-named-type", "<name>", "Ghost"),
    ]);
    expect(read.lowered, `${label}: the lowered bytes do not move either`).toEqual({
      anyOf: [{}, {}],
    });
  });
});

// ===========================================================================
// (c) CONSTRAINT 1 / 5, GUARD 2 — the node-refusal flag. `emitMalformedAliasRhs`
// (src/parser/theta-document.ts:2545) runs at PARSE time, in a different
// diagnostic array from the checker pass, so the same-scope guard cannot see it
// and the declaration must carry the refusal as a node fact.
// GREEN at HEAD and required to stay green.
// ===========================================================================

/**
 * Bug 0042's two shapes, both at the alias position. The *same-line residue*
 * rows are the boundary this report is disjoint from by mechanism: one severed
 * token is enough for that rule, zero severed tokens is this report's class
 * (`schema X = Cat + 1` fires there, `schema X = Cat +` fires here). The *empty
 * arm position* rows are structurally out of reach of the refusal as well —
 * the arm filter leaves a well-formed arm list, so nothing junk is handed to the
 * catch-all — and they keep the correct lowering the field position loses.
 */
const NODE_REFUSED_ROWS: ReadonlyArray<readonly [string, string, unknown, readonly string[]]> = [
  ["c1 (same-line residue, severed number)", "Cat + 1", PERMISSIVE, []],
  ["c2 (same-line residue, severed identifier)", "Cat . Dog", PERMISSIVE, []],
  ["c3 (same-line residue, no spaces)", "string+integer", PERMISSIVE, []],
  ["c4 (same-line residue, member access)", "Cat.a", PERMISSIVE, ["a"]],
  ["c5 (same-line residue, doubled operator)", "string ++ integer", PERMISSIVE, []],
  ["c6 (empty arm position, dangling)", "Cat |", { $ref: "#/$defs/Cat" }, []],
  ["c7 (empty arm position, dangling primitive)", "string |", { type: "string" }, []],
  ["c8 (empty arm position, leading)", "| string", { type: "string" }, []],
];

describe("bug 0061 (c) — a declaration already refused at parse time keeps that refusal alone", () => {
  for (const [label, typeSource, lowered, unknownIdents] of NODE_REFUSED_ROWS) {
    it(`GREEN (${label}): \`schema X = ${typeSource}\` keeps exactly its parse-time sequence`, () => {
      const read = readAt(label, "alias", typeSource);
      expect(
        read.lines,
        `${label}: constraint 5 keeps bug 0042's own fixtures at exactly one ` +
          `\`theta/parse/malformed-alias-rhs\` each; the parse-time emission is in a different ` +
          `diagnostic array from the checker pass, so the refusal needs a node-level flag to ` +
          `stay out of this sequence`,
      ).toEqual([
        line("theta/parse/malformed-alias-rhs", "<X>", "X"),
        ...unknownIdents.map((name) => line("theta/parse/unknown-identifier", "<name>", name)),
      ]);
      expect(
        read.lowered,
        `${label}: the position that reports keeps its lowering — which is what makes the ` +
          `silent field position the more costly of the two`,
      ).toEqual(lowered);
    });
  }
});

// ===========================================================================
// (d) CONSTRAINT 6 — the suppressed sibling: the refusal ALONE. RED at HEAD for
// the three refusal cells; the two controls are GREEN and stay green.
// ===========================================================================

describe("bug 0061 (d) — a junk fragment hiding a name draws the refusal alone", () => {
  const SUPPRESSED: ReadonlyArray<readonly [string, BodyPosition, string]> = [
    ["d1", "alias", "Ghost +"],
    ["d2", "field", "Ghost +"],
    ["d3", "field", "match +"],
  ];

  for (const [id, position, typeSource] of SUPPRESSED) {
    it(`RED (${id}, ${position}): \`${typeSource}\` draws the refusal and NOT the name diagnostic`, () => {
      // `Ghost+` and `match+` are no `NamedType` (`NamedType ::= Ident`,
      // grammar.md:98), so `theta/parse/unresolved-named-type`'s trigger
      // (code-registry-parse.md:92) does not reach them and restoring it here
      // would be the mis-attribution bug 0044 owns — which constraint 6 forbids
      // moving. The count-of-one assertion is therefore the whole decision.
      const label = `${id} (${position}, ${typeSource})`;
      const read = readAt(label, position, typeSource);
      expectRefused(label, read, 1, position === "field" ? sField(PERMISSIVE) : PERMISSIVE);
    });
  }

  it("GREEN (d4, field): `match` keeps `reserved-keyword-as-identifier` untouched", () => {
    // The keyword-shaped control, pinned at the code HEAD emits. Whether a
    // reserved keyword in a type position should draw a name diagnostic at all
    // is bug 0044's question; this cell only holds it still.
    const label = "d4 (field, match)";
    const read = readAt(label, "field", "match");
    expect(read.lines, `${label}: bug 0044 owns this row's identity; it does not move here`).toEqual(
      [line("theta/parse/reserved-keyword-as-identifier", "<keyword>", "match")],
    );
    expect(read.lowered, `${label}: the lowered bytes do not move either`).toEqual(
      sField(PERMISSIVE),
    );
  });

  it("GREEN (d5, alias): the bare `Ghost` keeps `unresolved-named-type`", () => {
    // The other side of constraint 6: the name diagnostic must keep firing for
    // the spelling that IS a `NamedType`. Without this cell, a fix that removed
    // the name walk entirely would green d1–d3.
    const label = "d5 (alias, Ghost)";
    const read = readAt(label, "alias", "Ghost");
    expect(
      read.lines,
      `${label}: the identifier-shaped spelling resolves through the name walk and is refused ` +
        `there; only the operator-suffixed spelling is this report's`,
    ).toEqual([line("theta/parse/unresolved-named-type", "<name>", "Ghost")]);
    expect(read.lowered, `${label}: the lowered bytes do not move either`).toEqual(PERMISSIVE);
  });
});

// ===========================================================================
// (e) CONSTRAINT 3 — grammar-admitted traffic keeps its BYTES and its SILENCE at
// both positions. GREEN at HEAD, byte-for-byte, and the sharpest over-refusal
// fence in the file: every row below reaches the same catch-all the refusal is
// raised from.
// ===========================================================================

/**
 * Each row: the type text, the fragment it lowers to AT THE ALIAS POSITION, the
 * `$defs` bodies it mints, and the whole diagnostic sequence. The field
 * position's fragment is the same value inside the object enclosure, which is
 * itself a property worth asserting — grammar.md:105's "the grammar is
 * otherwise identical in every position" is what makes the two readable from
 * one expected value.
 */
const ADMITTED_ROWS: ReadonlyArray<
  readonly [
    string,
    string,
    unknown,
    ReadonlyArray<readonly [string, unknown]>,
    ReadonlyArray<readonly [string, string]>,
  ]
> = [
  ["e1 (brace-rooted arm in a generic argument)", "array<{b: string}>", { type: "array", items: {} }, [], []],
  // The literal ARM lowers schema-subset.md:79's `{ "const": "x" }` and the
  // primitive arm keeps `{"type":"integer"}` (bug 0184 §Fix, the authority that
  // moved this row's bytes; before it the arm was the permissive `{}`). Bug 0061
  // §Fix constraint 4's claim over this row — that it keeps its SILENCE at both
  // positions — is unchanged and is the row's subject.
  [
    "e2 (mixed literal union)",
    '"x" | integer',
    { anyOf: [{ const: "x" }, { type: "integer" }] },
    [],
    [],
  ],
  [
    "e3 (inline object type, hoisted)",
    "{b: string}",
    { $ref: `#/$defs/${B_STRING_INLINE}` },
    [[B_STRING_INLINE, B_STRING]],
    [],
  ],
  ["e4 (literal union)", '"low" | "high"', { type: "string", enum: ["low", "high"] }, [], []],
  ["e5 (primitive union)", "string | integer", { type: ["string", "integer"] }, [], []],
  ["e6 (literal atom)", '"x"', { const: "x" }, [], []],
  // The empty inline object is grammar-admitted (grammar.md:109) and its
  // `theta/parse/empty-schema-body` is that rule's, rendered with `<X>` as the
  // literal two-character `{}` (placeholder-rendering-b.md:55's stated
  // exception). A recogniser here DECLINES it; refusing it would double the
  // report and refusing it INSTEAD would take the row away.
  ["e7 (empty inline object)", "{}", PERMISSIVE, [], [["theta/parse/empty-schema-body", "{}"]]],
];

describe("bug 0061 (e) — grammar-admitted catch-all traffic keeps its bytes (except e2, bug 0184 §Fix) and its silence", () => {
  for (const [label, typeSource, fragment, hoisted, expectedCodes] of ADMITTED_ROWS) {
    for (const position of ["field", "alias"] as const) {
      it(`GREEN (${label}, ${position}): \`${typeSource}\` is unchanged`, () => {
        const cell = `${label} (${position})`;
        const read = readAt(cell, position, typeSource);
        expect(
          read.lines,
          `${cell}: schema-subset.md:74–:84 gives this form an emission rule, so the recogniser ` +
            `declines it; a refusal reaching this row refuses input the grammar admits at all ` +
            `four positions`,
        ).toEqual(expectedCodes.map(([code, value]) => line(code, "<X>", value)));
        expect(
          read.lowered,
          `${cell}: the emission the table prescribes, byte-for-byte. The table is the source of ` +
            `truth for these bytes; row \`e2\`'s were re-derived under bug 0184 §Fix (a literal ` +
            `ARM of a MIXED union lowers schema-subset.md:79's \`const\`, not the permissive ` +
            `\`{}\`), and every other row's are bug 0061 §Fix constraint 4's own`,
        ).toEqual(position === "field" ? sField(fragment) : fragment);
        for (const [slug, body] of hoisted) {
          expect(
            read.defs[slug],
            `${cell}: the hoisted body and the slug that names it (schema-subset.md:73)`,
          ).toEqual(body);
        }
      });
    }
  }
});

// ===========================================================================
// (f) CONSTRAINT 5 — the controls do not move. GREEN at HEAD.
// ===========================================================================

/**
 * The well-formed spellings, plus the two loud field-position neighbours whose
 * disposition the fix explicitly leaves alone. `schema S { a: -1 }` is the
 * reason the two `-1` pins in bug 0042's and bug 0033's witness files stay put:
 * the field list is dropped whole, so no field-type walk runs and there is no
 * fragment for the judgement to hold.
 */
const CONTROL_ROWS: ReadonlyArray<readonly [string, BodyPosition, string, unknown]> = [
  ["f1 (primitive field)", "field", "string", sField({ type: "string" })],
  ["f2 (literal field)", "field", '"x"', sField({ const: "x" })],
  [
    "f3 (primitive union field)",
    "field",
    "string | integer",
    sField({ type: ["string", "integer"] }),
  ],
  ["f4 (named-type field)", "field", "Cat", sField({ $ref: "#/$defs/Cat" })],
  ["f5 (named-type alias)", "alias", "Cat", { $ref: "#/$defs/Cat" }],
  ["f6 (primitive union alias)", "alias", "string | integer", { type: ["string", "integer"] }],
];

describe("bug 0061 (f) — the controls do not move", () => {
  for (const [label, position, typeSource, lowered] of CONTROL_ROWS) {
    it(`GREEN (${label}): \`${typeSource}\` loads silently and keeps its emission`, () => {
      const read = readAt(label, position, typeSource);
      expect(read.lines, `${label}: a control that reds here is over-refusal`).toEqual([]);
      expect(read.lowered, `${label}: schema-subset.md:74–:84's emission`).toEqual(lowered);
    });
  }

  it("GREEN (f7, field): `schema S { a: -1 }` keeps `empty-schema-body` alone", () => {
    // No field-type walk runs, so the judgement is never handed a fragment. Whether
    // `-1` should be a `Type` at all is held open by bug 0042 §Non-goals.
    const label = "f7 (field, -1)";
    const read = readAt(label, "field", "-1");
    expect(
      read.lines,
      `${label}: the field list is dropped whole, so this row is out of the refusal's reach by ` +
        `construction rather than by a guard`,
    ).toEqual([line("theta/parse/empty-schema-body", "<X>", "S")]);
    expect(read.lowered, `${label}: the dropped body lowers to the permissive fragment`).toEqual(
      PERMISSIVE,
    );
  });

  it("GREEN (f8, field): `schema S { f: Cat Cat }` keeps `empty-schema-body` + `unsupported-feature`", () => {
    const label = "f8 (field, Cat Cat)";
    const read = readDecl(label, "S", "schema S { f: Cat Cat }");
    expect(
      read.lines,
      `${label}: the comma rule and the empty-body rule are the whole disposition here; a third ` +
        `code is over-refusal`,
    ).toEqual([
      line("theta/parse/empty-schema-body", "<X>", "S"),
      line("theta/parse/unsupported-feature", "<construct>", "schema fields must be comma-separated"),
    ]);
    expect(read.lowered, `${label}: the dropped body lowers to the permissive fragment`).toEqual(
      PERMISSIVE,
    );
  });
});

// ===========================================================================
// (g) CONSTRAINT 2 — the three OTHER `Type` positions are over-refusal
// tripwires: byte-identical lowered documents AND byte-identical diagnostic
// sequences across the change. GREEN at HEAD and required to stay green.
// ===========================================================================

/** A `mode: prompt` theta carrying `body` after the shared declarations. */
function bodyOnlySrc(body: string): string {
  return `---\nmode: prompt\n---\n${DECLS}${body}`;
}

describe("bug 0061 (g) — the adjacent `Type` positions keep their bytes and their silence", () => {
  it("GREEN (g1, `@<T>` annotation): `@<Cat +>` stays silent", () => {
    // The annotation position reaches the same lowering through
    // `lowerQueryResponseSchema` (src/runtime/query-schema-lowering.ts:113), so
    // it is one optional argument away from inheriting the refusal. §Fix
    // constraint 2 pins it as measured silent at HEAD and not claimed.
    const label = "g1 (@<Cat +>)";
    const doc = parseDoc(bodyOnlySrc("let r = @<Cat +>`hi`\nr\n"), "bug0061.theta");
    expect(
      doc.body.statements.some((s) => s.kind === "let"),
      `${label}: precondition — the annotated query parsed, so the annotation position was ` +
        `actually reached`,
    ).toBe(true);
    expect(
      diagLines(doc),
      `${label}: a code appearing here is the cross-position blast constraint 2 forbids`,
    ).toEqual([]);
  });

  it("GREEN (g2, `@<T>` annotation): the lowered annotation document is unchanged", () => {
    const label = "g2 (lowerQueryResponseSchema)";
    const doc = parseDoc(bodyOnlySrc("let inert = 1\ninert\n"), "bug0061.theta");
    const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
    const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
    if (schemas.length === 0) {
      throw new Error(`${label}: the fixture declares no schemas, so the seam has nothing to resolve`);
    }
    expect(
      lowerQueryResponseSchema("Cat +", schemas, enums),
      `${label}: the annotation seam threads no refusal sink, so its permissive answer is ` +
        `unchanged by this fix — a fix that moves it has claimed a position this report does not own`,
    ).toEqual(PERMISSIVE);
  });

  it("GREEN (g3, `value` position): `let x: Cat + = 1` stays silent", () => {
    // The `value` position reaches `parseTypeExpression`
    // (src/parser/theta-document.ts:6231) but never `lowerTypeSource`, so a
    // recogniser placed at the type-grammar seam would move it and a
    // lowering-side one cannot.
    const label = "g3 (let annotation)";
    const doc = parseDoc(bodyOnlySrc("let x: Cat + = 1\nx\n"), "bug0061.theta");
    const lets = doc.body.statements.filter((s): s is LetStmt => s.kind === "let");
    expect(
      lets.map((s) => s.annotation),
      `${label}: precondition — the junk was captured into the annotation, so this position was ` +
        `actually handed the text`,
    ).toEqual(["Cat+"]);
    expect(diagLines(doc), `${label}: outside this fix's reach (§Fix constraint 2)`).toEqual([]);
  });

  it("GREEN (g4, `value` position): `fn f(p: Cat +): integer { 1 }` stays silent", () => {
    const label = "g4 (fn parameter type)";
    const doc = parseDoc(
      bodyOnlySrc("fn f(p: Cat +): integer { 1 }\nlet inert = 1\ninert\n"),
      "bug0061.theta",
    );
    const fns = doc.body.statements.filter((s): s is FnDecl => s.kind === "fn");
    expect(
      fns.flatMap((f) => f.params.map((p) => `${p.name}: ${p.type}`)),
      `${label}: precondition — the junk was captured into the parameter type`,
    ).toEqual(["p: Cat+"]);
    expect(diagLines(doc), `${label}: outside this fix's reach (§Fix constraint 2)`).toEqual([]);
  });

  it("GREEN (g5, `return` position): `fn f(): Cat + { 1 }` keeps its measured disposition", () => {
    // MEASURED AT HEAD, not assumed: the return position is silent here, with
    // the junk captured whole as the return type. The property constraint 2
    // pins is that this is UNCHANGED by the fix, so the cell asserts the
    // measurement rather than a desired posture — `ReturnType` is a different
    // production from `Type` (grammar.md:89), and refusing it is nobody's
    // claim in this report.
    const label = "g5 (fn return type)";
    const doc = parseDoc(
      bodyOnlySrc("fn f(): Cat + { 1 }\nlet inert = 1\ninert\n"),
      "bug0061.theta",
    );
    const fns = doc.body.statements.filter((s): s is FnDecl => s.kind === "fn");
    expect(
      fns.map((f) => f.returnType),
      `${label}: precondition — the junk was captured into the return type, so the position was ` +
        `actually handed the text`,
    ).toEqual(["Cat+"]);
    expect(
      diagLines(doc),
      `${label}: the \`return\` position reaches \`parseTypeExpression\` ` +
        `(src/parser/theta-document.ts:6312) and never \`lowerTypeSource\`; a code appearing here ` +
        `is the cross-position blast constraint 2 forbids`,
    ).toEqual([]);
  });

  it("GREEN (g6, control): `@<Ghost>` still draws `unresolved-named-type`", () => {
    // The tripwires above assert absence, so one of them must be able to red.
    // This cell is that proof: the same position DOES report for a name it
    // cannot resolve, so g1's empty sequence is a measurement and not a dead
    // channel.
    const label = "g6 (@<Ghost> control)";
    const doc = parseDoc(bodyOnlySrc("let r = @<Ghost>`hi`\nr\n"), "bug0061.theta");
    expect(
      diagLines(doc),
      `${label}: the annotation position has a live diagnostic channel, which is what makes the ` +
        `silence asserted in g1 an observation`,
    ).toEqual([line("theta/parse/unresolved-named-type", "<name>", "Ghost")]);
  });
});
