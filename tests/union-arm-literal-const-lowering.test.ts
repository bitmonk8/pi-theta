import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBinderEnvelopeSchema } from "../src/binder/binder-envelope";
import { renderBinderParamLine } from "../src/binder/binder-system-prompt";
import {
  buildInboundTranslationPlan,
  type InboundTranslationPlan,
} from "../src/parser/schema-lowering";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { bindParamsInbound } from "../src/runtime/inbound-boundary";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import { makeEnumValue, valuesEqual, type ThetaValue } from "../src/runtime/value";
import { translateInbound } from "../src/runtime/wire-translation";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0184 — a literal ARM of a MIXED union lowers to the EMPTY schema at all
// four `Type` positions instead of `docs/spec_topics/schema-subset.md:79`'s
// `{ "const": <value> }`
// (docs/bugs/0184-union-arm-literal-lowers-empty-schema.md).
//
// THE MECHANISM, one absence replicated to four positions. Two functions own
// every union arm and neither consults the literal sublanguage:
//
//   - `lowerTypeExpr` (src/parser/params.ts:665) splits a union at `:676` and
//     recurses each arm through ITSELF at `:679-681`. A `LiteralType` arm matches no
//     branch there and falls to the trailing catch-all (`:778-787`), which
//     pushes the text on `lowerCtx.unspellable` (`:786`) and returns `{}`
//     (`:787`). The inlined classification at `:683-690` reads `{}` as
//     `non-primitive` (its key count is 0, not a sole `type` naming a
//     primitive), so `lowerUnion` (src/parser/schema-lowering.ts:175) emits the
//     `anyOf` form with `{}` as one variant.
//   - `lowerBraceGroupUnionArms` (`:1188`) hoists each brace-group arm and sends
//     every OTHER arm — a literal one included — to `lowerTypeExpr` at
//     `:1208-1209`,
//     not to the literal-aware `lowerFieldType` it was handed. So
//     `{ a: string } | "lit"` loses the same emission on a path that never
//     touches `lowerTypeExpr`'s own union split.
//
// The sublanguage is one function away and exported: `lowerLiteralSublanguage`
// (`:1310`) returns `{"const": <value>}` for a single accepted atom
// (`:1322-1323`) and `parseLiteralArm` (`:1228`) is its recogniser. Its two
// callers — `lowerParamsFieldType` (`:1382`, the call at `:1387`) and
// `lowerTypeSource` (src/parser/body-type-lowering.ts:254, the call at `:284`) —
// call it at the TOP of a type source only. A mixed union declines whole
// (`:1320` — one non-literal arm declines the union) and goes whole to
// `lowerTypeExpr`, whose per-arm recursion never returns to either caller.
//
// WHAT THE EMPTY ARM COSTS. An empty schema matches every JSON value, so a
// union enforces nothing beyond its non-empty arms: real AJV over the lowered
// `params:` document for `sev: 'Sev | "high"'` accepts `"zzz"`, `7`, `true`,
// `null`, `[]`, `{}` and `{"sev":"high"}`, where the same declaration written as
// the bare `Sev` refuses all seven. Three sites compile that document — the
// binder envelope (src/extension/production-theta-producer.ts:790 →
// src/binder/binder-envelope.ts:86, `relaxParamsSchema` at `:89`), the
// post-default-merge compile (`:1287`, feeding `fillDefaultsAndRevalidate` at
// `:1288`) and the subagent child's params intake (the schema read at `:2140`,
// the compile at `:2147`) — and `relaxParamsSchema` copies the arm verbatim into the
// model-facing envelope, so grammar-constrained decoding has nothing to
// constrain there either. At the `@<T>` position the same fragment names a
// registered tool (`respondSchemaSlug`, src/runtime/typed-query-validation.ts:347)
// and is interpolated into the QRY-15 instruction
// (production-theta-producer.ts:5380).
//
// AND SINCE 0.102.0 THE ENUM TAG DEPENDS ON ARM ORDER. Bug 0172's face-2 fix
// landed first-admitting-arm dispatch: a validated value is re-tested against
// each arm in SUBS-1 source order and translated under the FIRST arm that
// admits it (docs/spec_topics/runtime-value-model.md:34;
// src/runtime/wire-translation.ts:419 `rebuildUnderFirstAdmittingArm`, `:464`
// `firstAdmittingArm`). An empty arm admits everything, so it governs whenever
// it is written first: `"high" | Sev` binds `"high"` AND `"low"` as bare
// untagged strings where `Sev | "high"` binds both as tagged `Sev` variants. The
// dispatch rule is deterministic and correct over what the lowering hands it;
// the defect is the lowering.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/schema-subset.md:79 — 'Literal `"foo"` / `42` / `true` /
//     `null`: `{ "const": <value> }`'. Nothing scopes the rule away from a union
//     arm.
//   - :80 — the enum / string-literal-union emission
//     `{ "type": "string", "enum": [...] }`, which an ALL-literal union keeps at
//     the whole-source check and which a per-arm `anyOf` must not shadow
//     (§Fix constraint 2).
//   - :81 (SUBS-1) — "a union with any non-primitive arm MUST lower to
//     `{ "anyOf": [...] }`", with the reference vector `string | Author` →
//     `{ "anyOf": [{ "type": "string" }, { "$ref": "#/$defs/Author" }] }`. The
//     `anyOf` carries what step 3 emits per arm, and the literal row is that
//     list's neighbour. The same clause counts `null` as a primitive BY NAME,
//     which is what keeps `Sev | null` and `string | null` where they are
//     (§Fix constraint 5).
//   - :85 (*Array element order*) — `anyOf` lists variants in source order. It
//     governs the ORDER of whatever an arm emits and states no emission.
//   - :87 (step 5, the sidecar) — item (5) *Union arms*: each arm carries "the
//     self-contained lowered document it is re-tested against — the arm's own
//     fragment plus the document's `$defs`", which is the per-arm document group
//     (b) compiles.
//   - :7 admits `const` as a validation keyword with no positional restriction,
//     so the expected fragments are inside the subset.
//   - :73 and :98 make `__inline_<slug>` a function of the LOWERED fragment;
//     :99-107 is the canonical form, the SHA-256 digest and the 16-hex
//     truncation the oracle below follows.
//   - docs/spec_topics/grammar.md:94 makes `Type "|" Type` a `Type`; :95 and
//     :102 put `LiteralType` in `Type`; :97 also lists `null` under
//     `PrimitiveType`; :105 names "union arms" among the bare-`Type` positions
//     and adds "The grammar is otherwise identical in every position".
//   - docs/spec_topics/type-system.md:8 — `|` "is the lowest-precedence type
//     operator and is legal anywhere a type is"; :9 — literal types are valid
//     type expressions; :15 — one grammar in every annotation position.
//   - docs/spec_topics/runtime-value-model.md:34 — the inbound bullet: the
//     enum-tag reattachment obligation, and the first-admitting-arm dispatch
//     whose two-arms-admit clause is settled by arm order.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:57 — "`params` are
//     validated with AJV at invocation time"; :58 — a `params:` RHS is "a type
//     expression parsed by the theta type grammar — the same grammar used in
//     every other type-annotation position".
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md:129 (*Type display*)
//     — the `Parameters:` line renders the SURFACE type, never the lowering,
//     which group (f) holds unmoved.
//
// PROBED SIGNATURES AT THIS HEAD (83f6dac0, v0.114.0 — re-derived here, NOT
// copied from the bug doc's 0.102.0 values; the two agree). Declarations in
// scope: `enum Sev { High = "high", Low = "low" }` and
// `schema Triage { urgent: boolean }`. Every row below is byte-identical at all
// four positions and loads with ZERO diagnostics at every one of them.
//
//   source                   HEAD                                          AFTER (§Fix)
//   Sev | "high"             {"anyOf":[{"$ref":…Sev},{}]}                  arm 1 -> {"const":"high"}
//   "high" | Sev             {"anyOf":[{},{"$ref":…Sev}]}                  arm 0 -> {"const":"high"}
//   Sev | "high" | "low"     {"anyOf":[{"$ref":…Sev},{},{}]}               arms 1,2 -> const
//   Sev | 1                  {"anyOf":[{"$ref":…Sev},{}]}                  arm 1 -> {"const":1}
//   Sev | true               {"anyOf":[{"$ref":…Sev},{"const":true}]}      UNCHANGED (bug 0044's atom arm)
//   "x" | string             {"anyOf":[{},{"type":"string"}]}              arm 0 -> {"const":"x"}
//   "x" | integer            {"anyOf":[{},{"type":"integer"}]}             arm 0 -> {"const":"x"}
//   "x" | Triage             {"anyOf":[{},{"$ref":…Triage}]}               arm 0 -> {"const":"x"}
//   { a: string } | "lit"    {"anyOf":[{"$ref":…__inline_968e40317188aebd},{}]}  arm 1 -> {"const":"lit"}
//   Sev | null               {"anyOf":[{"$ref":…Sev},{"type":"null"}]}     UNCHANGED
//   string | null            {"type":["string","null"]}                    UNCHANGED
//   Triage | null            {"anyOf":[{"$ref":…Triage},{"type":"null"}]}  UNCHANGED
//   "x" | "y"                {"type":"string","enum":["x","y"]}            UNCHANGED
//   {a: integer} | Triage    {"anyOf":[{"$ref":…__inline_df817b794ef788ce},{"$ref":…Triage}]}  UNCHANGED
//   array<Sev> | null        {"anyOf":[{"type":"array","items":{"$ref":…Sev}},{"type":"null"}]} UNCHANGED
//   array<"x" | "y">         {"type":"array","items":{"anyOf":[{},{}]}}    UNCHANGED BY THIS FIX
//   array<"x">               {"type":"array","items":{}}                   UNCHANGED BY THIS FIX
//     — both later moved by bug 0164 §Fix (v0.123.0), which re-routes the
//       GENERIC-ARGUMENT recursion these two reach: `items` becomes
//       {"type":"string","enum":["x","y"]} and {"const":"x"} respectively.
//       Cells `d7` / `d8` carry the re-derived bytes; this file's per-ARM gate
//       is still what keeps the arm-level consult off an all-literal arm set.
//
//   AJV over the lowered `params:` document for `sev: 'Sev | "high"'` at HEAD:
//   all nine probed payloads ACCEPTED, `"zzz"` / `7` / `true` / `null` / `[]` /
//   `{}` / `{"sev":"high"}` among them. The bare `Sev` refuses all seven.
//   Per arm at HEAD: arm 0 (`$ref` Sev) admits `"high"` and `"low"` only; arm 1
//   (`{}`) admits every payload.
//
//   translateInbound / bindParamsInbound at HEAD, `taggedX` = `valuesEqual`
//   against a locally constructed `Sev.X`:
//     Sev | "high"   "high" -> tagged High     "low" -> tagged Low
//     "high" | Sev   "high" -> BARE untagged   "low" -> BARE untagged   <- the defect
//   AFTER §Fix (measured over the hand-built post-fix documents through the
//   shipped plan + walk + one real AjvSchemaValidator):
//     Sev | "high"   "high" -> tagged High     "low" -> tagged Low
//     "high" | Sev   "high" -> BARE untagged   "low" -> tagged Low
//   The tag follows the VALUE, not the arm ORDER: `"high"` is the literal arm's
//   own value and is the ONE value whose reading arm order still settles.
//
//   Minted names — HEAD -> AFTER:
//     p: '{m: Sev | "high"}'  __inline_d120f11c7193b40b -> __inline_1197ce20e189483d
//     @<Sev | "high">   __theta_respond_cfd165c062368209 -> __theta_respond_ecfad44b0c4ba51b
//     @<"high" | Sev>   __theta_respond_4d8ebd87b276a6f3 -> __theta_respond_6d204979b1ba5867
//     @<Sev | null>     __theta_respond_4d64eb5d58b6cca8 -> UNCHANGED
//
// THE SETTLED PLACEMENT (§Fix's option (ii), gated to MIXED sets). The per-arm
// consult sits AT THE ARM — in `lowerTypeExpr`'s union split and in
// `lowerBraceGroupUnionArms`' non-brace-arm call, which move together (§Fix
// constraint 6) — and fires only when the arm set carries at least one arm
// `parseLiteralArm` declines. The `PRIMITIVE_TYPES` test comes FIRST, so a bare
// `null` arm keeps `{"type":"null"}` and `string | null` keeps the collapsed
// `{"type":["string","null"]}` (§Fix constraint 5). An ALL-literal arm set is
// already owned as a WHOLE SOURCE by `lowerLiteralSublanguage` (:80's enum
// form), so gating to the mixed set is what keeps `array<"x" | "y">` — bug
// 0164's exact subject, reached through `lowerTypeExpr`'s generic-argument
// recursion rather than through either whole-source caller — OUT OF THE PER-ARM
// CONSULT'S REACH, instead of shadowed by
// `{"anyOf":[{"const":"x"},{"const":"y"}]}`, a third value no step-3 row states
// (§Fix constraint 2). Group (d) pins that gate. What those two rows' `items`
// now CARRY is bug 0164 §Fix's (v0.123.0), reached through the whole-source
// `lowerLiteralSublanguage` once that report re-routed the argument recursion.
//
// WHAT IS RED HERE — 30 cells, all in groups (a), (b), (c), (f) and (g), each
// one a cell whose subject is the moved arm: (a)'s eight moving rows and their
// eight key-order twins; (b)'s `b1` / `b3` / `b4`; (c)'s `c1-arms`,
// `c1-arm-verdicts`, `c2-arms`, `c2-arm-verdicts` and the two `c2-…-low`
// dispatch rows; (f)'s `f1`; and (g)'s `g1` / `g2` and two of the three `g3`
// rows.
//
// WHAT IS GREEN AT HEAD AND MUST STAY GREEN: group (0) (the oracle's own
// honesty), `a5` and `a5-keys` (§Fix constraint 1's UNCHANGED boolean row),
// `a10` (the four-position parity, which holds today over the WRONG answer and
// is §Fix constraint 7's tripwire), `b2` (the enforcing contrast), (c)'s four
// `…-high` / `c1-…-low` rows (whose readings the fix does not change), the whole
// of (d) — the no-op control set that keeps THIS fix from over-reaching, bug
// 0164's `array<"x" | "y">` and `array<"x">` among them, whose bytes were later
// re-derived under bug 0164 §Fix while their subject (the per-ARM gate declining
// an all-literal arm set) stayed exactly what it was — the whole of (e), `f2`
// (the surface-type `Parameters:` line) and `g3`'s `Sev | null` row. NO new
// diagnostic is asserted anywhere in this file, because
// `isUnspellableTextRefusable` (src/parser/params.ts:1274) and all three of its
// readers stay byte-unchanged (§Fix constraint 4); what the fix does is make
// that predicate's stated premise TRUE at an arm.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` or `lowerQueryResponseSchema` call over a string,
// plus one real AJV compile through the shipped `AjvSchemaValidator` seam and
// the shipped `buildInboundTranslationPlan` / `translateInbound` /
// `bindParamsInbound` over a hand-supplied payload. An integration or live tier
// could observe none of it more sharply: the claim is about the exact bytes at a
// lowering boundary, the 16-hex slug hashed from them, and the arm a
// deterministic re-test selects — all fully determined before any turn runs, and
// a provider round-trip would add stochastic surface over a contract that has
// none.
//
// NO SILENT SKIPPING: every reader asserts the fixture's diagnostic list is
// empty and then THROWS, naming the absent intermediate, when the lowered
// document, the `$defs` entry, the root `anyOf` or the lowered annotation is
// missing. A refused parse can never be mistaken for a pass.

// ===========================================================================
// Substrate — the four `Type` positions and the loud readers over them.
// ===========================================================================

/** The two declarations every row below resolves a named arm against. */
const DECLS = 'enum Sev { High = "high", Low = "low" }\nschema Triage { urgent: boolean }\n';

/** `enum Sev`'s own closed lowering — the `$defs` entry a `Sev` arm references. */
const SEV_DEF = { type: "string", enum: ["high", "low"] };

const POSITIONS = ["params", "field", "alias", "annotation"] as const;
type Position = (typeof POSITIONS)[number];

/** The three positions that hoist an inline object under a minted `$defs` name. */
const HOISTING_POSITIONS = ["params", "field", "alias"] as const;

/**
 * A theta-side literal carries theta-side quotes, so a `params:` entry wraps the
 * whole type expression in a YAML single-quoted scalar. The unquoted spelling is
 * not valid YAML and collapses the load to `theta/load/missing-mode`, which is a
 * different frame (the spelling discipline
 * `tests/params-literal-sublanguage-lowering.test.ts` established).
 */
function yamlQuoted(typeSource: string): string {
  return `'${typeSource.replace(/'/g, "''")}'`;
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function loweredParamsDocument(doc: ThetaDocument): Record<string, unknown> | undefined {
  return doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
}

/** What one `Type` position yields for one type source. */
interface PositionRead {
  /** Every diagnostic the whole-document load raised, rendered. */
  readonly diags: readonly string[];
  /** The fragment AT the type position, absent when the load produced none. */
  readonly fragment?: unknown;
  /** The whole lowered document, for the `$ref`-closure and AJV checks. */
  readonly document?: LoweredSchema;
  /** The document's `$defs`, with the position's own wrapper name removed. */
  readonly defs: Record<string, unknown>;
}

/**
 * Read one type source at one of the four positions. Never throws on a refused
 * load — the caller decides whether an absent fragment is the subject or a
 * broken fixture, and `fragmentOf` below is the loud reader.
 *
 * The `@<T>` annotation returns its lowered document AS the fragment, so its
 * root `$defs` closure is split off to keep the four positions comparable: at
 * the other three the closure lives on the enclosing `params:` document, never
 * on the fragment.
 */
function readAt(position: Position, typeSource: string): PositionRead {
  if (position === "annotation") {
    const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0184.theta");
    const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
    const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
    const lowered = lowerQueryResponseSchema(typeSource, schemas, enums);
    if (lowered === undefined) {
      return { diags: diagLines(doc), defs: {} };
    }
    const { $defs, ...root } = lowered as Record<string, unknown>;
    return {
      diags: diagLines(doc),
      fragment: root,
      document: lowered,
      defs: ($defs ?? {}) as Record<string, unknown>,
    };
  }
  const source =
    position === "params"
      ? `---\nmode: prompt\nparams:\n  p: ${yamlQuoted(typeSource)}\n---\n${DECLS}let inert = 1\ninert\n`
      : position === "field"
        ? `---\nmode: prompt\nparams:\n  p: S\n---\n${DECLS}schema S { a: ${typeSource} }\nlet inert = 1\ninert\n`
        : `---\nmode: prompt\nparams:\n  a: M\n---\n${DECLS}schema M = ${typeSource}\nlet inert = 1\ninert\n`;
  const doc = parseDoc(source, "bug0184.theta");
  const document = loweredParamsDocument(doc);
  const defs = { ...((document?.["$defs"] ?? {}) as Record<string, unknown>) };
  const wrapper = position === "field" ? "S" : position === "alias" ? "M" : undefined;
  let fragment: unknown;
  if (document !== undefined) {
    if (position === "params") {
      fragment = (document["properties"] as Record<string, unknown>)["p"];
    } else if (position === "field") {
      const s = defs["S"] as Record<string, unknown> | undefined;
      fragment = (s?.["properties"] as Record<string, unknown> | undefined)?.["a"];
    } else {
      fragment = defs["M"];
    }
  }
  if (wrapper !== undefined) {
    // The wrapper `$defs` entry is the position's own scaffolding, not a name
    // the type source reached, so it is dropped to keep the minted-name
    // comparisons across positions like-for-like.
    delete defs[wrapper];
  }
  return {
    diags: diagLines(doc),
    ...(document !== undefined ? { fragment, document: document as LoweredSchema } : {}),
    defs,
  };
}

/**
 * The fragment at one position, loud on every way a fixture can fail to reach
 * the lowering: a diagnostic (which withholds the whole lowered document at the
 * `params:` position) or an absent document.
 */
function fragmentOf(label: string, position: Position, typeSource: string): unknown {
  const read = readAt(position, typeSource);
  expect(
    read.diags,
    `${label} [${position}]: \`${typeSource}\` is grammar-admitted at every type-annotation ` +
      `position (grammar.md:94/:102/:105, type-system.md:8/:15), so this fixture must load with ` +
      `NO diagnostics or the lowering under assertion never runs; observed ` +
      `${JSON.stringify(read.diags)}`,
  ).toEqual([]);
  if (read.document === undefined) {
    throw new Error(
      `${label} [${position}]: \`${typeSource}\` produced NO lowered document, so there is ` +
        `nothing for AJV to enforce at that position; diagnostics ${JSON.stringify(read.diags)}`,
    );
  }
  return read.fragment;
}

/** The `$defs` entry a hoisting position minted, never absent. */
function defOf(
  label: string,
  position: Position,
  typeSource: string,
  name: string,
): Record<string, unknown> {
  const read = readAt(position, typeSource);
  const entry = read.defs[name];
  if (entry === undefined) {
    throw new Error(
      `${label} [${position}]: \`${typeSource}\` must hoist under \`${name}\` — the name ` +
        `schema-subset.md:73 mints from the LOWERED fragment — or the \`$ref\` at the type ` +
        `position dangles; observed \`$defs\` keys ${JSON.stringify(Object.keys(read.defs))}`,
    );
  }
  return entry as Record<string, unknown>;
}

/** The def name a hoisting position's `$ref` points at, loud on a non-`$ref`. */
function refNameOf(label: string, position: Position, typeSource: string): string {
  const fragment = fragmentOf(label, position, typeSource) as Record<string, unknown>;
  const ref = fragment["$ref"];
  if (typeof ref !== "string") {
    throw new Error(
      `${label} [${position}]: a brace-rooted \`${typeSource}\` hoists (schema-subset.md:73), ` +
        `so the fragment at the position is a \`$ref\`; observed ${JSON.stringify(fragment)}`,
    );
  }
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (match?.[1] === undefined) {
    throw new Error(`${label} [${position}]: unreadable \`$ref\` pointer ${JSON.stringify(ref)}`);
  }
  return match[1];
}

/**
 * Every object's OWN key order inside `value`, keyed by JSON Pointer. `toEqual`
 * cannot see key order and order is contractual here: `respondSchemaSlug`
 * (src/runtime/typed-query-validation.ts:347) hashes `JSON.stringify(lowered)`
 * and the `__inline_<slug>` mint hashes the canonical form of the same
 * fragment, so two positions agreeing on the key SET and disagreeing on the
 * order would mint two names for one declared value set (bug 0056 §Fix
 * *Ordering*).
 */
function keyOrderOf(
  value: unknown,
  pointer = "",
): ReadonlyArray<readonly [string, readonly string[]]> {
  const out: Array<readonly [string, readonly string[]]> = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...keyOrderOf(item, `${pointer}/${index}`)));
    return out;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    out.push([pointer === "" ? "/" : pointer, keys]);
    for (const key of keys) {
      out.push(...keyOrderOf((value as Record<string, unknown>)[key], `${pointer}/${key}`));
    }
    return out;
  }
  return out;
}

/** The whole lowered `params:` document of a theta that MUST load. */
function paramsDocumentOf(label: string, fields: string): LoweredSchema {
  const doc = parseDoc(
    `---\nmode: prompt\nparams:\n${fields}---\n${DECLS}let inert = 1\ninert\n`,
    "bug0184.theta",
  );
  expect(
    diagLines(doc),
    `${label}: the fixture's \`params:\` types are legal theta ` +
      `(frontmatter-fields-a.md:58), so it must load with NO diagnostics; observed ` +
      `${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  const document = loweredParamsDocument(doc);
  if (document === undefined) {
    throw new Error(
      `${label}: the theta declares a \`params:\` block, so its lowered schema must be present ` +
        `(BIND-1); diagnostics ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return document as LoweredSchema;
}

/**
 * The real AJV seam — `strict: false`, `allErrors: true`, the shipped validator,
 * content-addressed exactly as `src/extension/production-composition.ts` does.
 */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => {
    const canonicalBytes = JSON.stringify(schema);
    return { slug: canonicalBytes, canonicalBytes };
  };
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * The root `anyOf` arms of a lowered fragment, in source order (:85). Loud on a
 * fragment that carries none, so a cell claiming to read a union's arms cannot
 * silently read a plain position.
 */
function armsOf(label: string, fragment: unknown): readonly Record<string, unknown>[] {
  const anyOf = (fragment as Record<string, unknown> | undefined)?.["anyOf"];
  if (!Array.isArray(anyOf)) {
    throw new Error(
      `${label}: the fragment carries no root \`anyOf\`, so SUBS-1 (schema-subset.md:81) did ` +
        `not read it as a union with a non-primitive arm and there are no arms to test: ` +
        `${JSON.stringify(fragment)}`,
    );
  }
  return anyOf as Record<string, unknown>[];
}

/**
 * One arm's self-contained lowered document, as `schema-subset.md:87` item (5)
 * specifies and `describeArm` (src/parser/schema-lowering.ts:549) builds it: the
 * arm's own fragment plus the enclosing document's `$defs`.
 */
function armDocument(arm: Record<string, unknown>, document: LoweredSchema): LoweredSchema {
  const defs = (document as Record<string, unknown>)["$defs"];
  return { ...arm, ...(defs !== undefined ? { $defs: defs } : {}) } as unknown as LoweredSchema;
}

// ===========================================================================
// The 16-hex slug oracle, independent of the implementation that mints.
//
// `schemaSlug` (src/parser/schema-lowering.ts) is deliberately NOT imported: an
// oracle taken from the implementation under test proves nothing. Every expected
// name below is derived from a HAND-WRITTEN byte string following
// schema-subset.md §Canonical schema hash, hashed with `node:crypto`, and group
// (0) keeps those strings honest by parse-back equality against the fragment
// each claims to serialise plus a whitespace and key-sort check.
// ===========================================================================

/** SHA-256 of the given bytes, first 16 lowercase hex characters (:106, :107). */
function slugOfBytes(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex").slice(0, 16);
}

/** The synthesised `$defs` key for a fragment given its canonical form (:73, :108). */
function inlineDefName(canonical: string): string {
  return `__inline_${slugOfBytes(canonical)}`;
}

/**
 * `{m: Sev | "high"}` AFTER §Fix — the inline object whose field carries the
 * moved arm, so its mint is a function of the arm's bytes (§Fix constraint 7).
 */
const M_SEV_HIGH_FRAGMENT = {
  type: "object",
  properties: { m: { anyOf: [{ $ref: "#/$defs/Sev" }, { const: "high" }] } },
  required: ["m"],
  additionalProperties: false,
};
const M_SEV_HIGH_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"anyOf":[{"$ref":"#/$defs/Sev"},' +
  '{"const":"high"}]}},"required":["m"],"type":"object"}';
const M_SEV_HIGH_INLINE = inlineDefName(M_SEV_HIGH_CANONICAL);

/**
 * `{m: Sev | null}` — the constraint-5 control one level down. Its mint is
 * pinned so a change that widened a `null` arm would move a name this report
 * promises not to move.
 */
const M_SEV_NULL_FRAGMENT = {
  type: "object",
  properties: { m: { anyOf: [{ $ref: "#/$defs/Sev" }, { type: "null" }] } },
  required: ["m"],
  additionalProperties: false,
};
const M_SEV_NULL_CANONICAL =
  '{"additionalProperties":false,"properties":{"m":{"anyOf":[{"$ref":"#/$defs/Sev"},' +
  '{"type":"null"}]}},"required":["m"],"type":"object"}';
const M_SEV_NULL_INLINE = inlineDefName(M_SEV_NULL_CANONICAL);

/**
 * `{a: string}` — the brace arm of `{ a: string } | "lit"`. Its own bytes do
 * NOT move (only its sibling literal arm does), so this name is a control on
 * the `lowerBraceGroupUnionArms` route.
 */
const A_STRING_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"string"}},"required":["a"],' +
  '"type":"object"}';
const A_STRING_INLINE = inlineDefName(A_STRING_CANONICAL);

/**
 * `{a: integer}` — the brace arm of `{a: integer} | Triage`, whose sibling is a
 * NAMED arm the recogniser declines, so neither arm moves.
 */
const A_INTEGER_CANONICAL =
  '{"additionalProperties":false,"properties":{"a":{"type":"integer"}},"required":["a"],' +
  '"type":"object"}';
const A_INTEGER_INLINE = inlineDefName(A_INTEGER_CANONICAL);

/**
 * The `@<T>` respond-tool names. Under bug 0099 route A, `respondSchemaSlug`
 * (src/runtime/typed-query-validation.ts) hashes the CANONICAL form
 * (schema-subset.md §Canonical schema hash step 2), not the emitted
 * serialisation — so each row below carries both the EMITTED bytes (still
 * `JSON.stringify(lowered)`, asserted against the real lowering in group (g))
 * and the CANONICAL bytes the slug is now digested over.
 */
const RESPOND_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  [
    'Sev | "high"',
    '{"anyOf":[{"$ref":"#/$defs/Sev"},{"const":"high"}],"$defs":{"Sev":{"type":"string",' +
      '"enum":["high","low"]}}}',
    '{"$defs":{"Sev":{"enum":["high","low"],"type":"string"}},"anyOf":[{"$ref":"#/$defs/Sev"},' +
      '{"const":"high"}]}',
    "MOVES — the arm's bytes are the hash's input, so the registered tool renames",
  ],
  [
    '"high" | Sev',
    '{"anyOf":[{"const":"high"},{"$ref":"#/$defs/Sev"}],"$defs":{"Sev":{"type":"string",' +
      '"enum":["high","low"]}}}',
    '{"$defs":{"Sev":{"enum":["high","low"],"type":"string"}},"anyOf":[{"const":"high"},' +
      '{"$ref":"#/$defs/Sev"}]}',
    "MOVES — the reversed arm order is a different byte sequence and a different name",
  ],
  [
    "Sev | null",
    '{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}],"$defs":{"Sev":{"type":"string",' +
      '"enum":["high","low"]}}}',
    '{"$defs":{"Sev":{"enum":["high","low"],"type":"string"}},"anyOf":[{"$ref":"#/$defs/Sev"},' +
      '{"type":"null"}]}',
    "UNCHANGED EMISSION — §Fix constraint 5 keeps a `null` arm on `{\"type\":\"null\"}`, so the " +
      "bytes do not move; the SLUG still re-derives under bug 0099, because the root's emitted " +
      "`anyOf`, `$defs` order is not its sorted order",
  ],
];

// ===========================================================================
// (0) The slug oracle's own honesty — each hand-written byte string must be the
// fragment it claims to serialise, in the form the recipe it stands for spells.
// GREEN at HEAD and after: this group tests the oracle, not the lowering.
// ===========================================================================

const CANONICAL_PAIRS: ReadonlyArray<readonly [string, string, unknown]> = [
  ['{m: Sev | "high"} (post-fix)', M_SEV_HIGH_CANONICAL, M_SEV_HIGH_FRAGMENT],
  ["{m: Sev | null}", M_SEV_NULL_CANONICAL, M_SEV_NULL_FRAGMENT],
  [
    "{a: string}",
    A_STRING_CANONICAL,
    { type: "object", properties: { a: { type: "string" } }, required: ["a"], additionalProperties: false },
  ],
  [
    "{a: integer}",
    A_INTEGER_CANONICAL,
    { type: "object", properties: { a: { type: "integer" } }, required: ["a"], additionalProperties: false },
  ],
];

describe("bug 0184 (0) — the independent slug oracle", () => {
  for (const [label, canonical, fragment] of CANONICAL_PAIRS) {
    it(`CONTROL (o1, ${label}): the hand-written canonical form parses back to the fragment it names`, () => {
      expect(
        JSON.parse(canonical),
        `schema-subset.md:98 hashes the LOWERED fragment, so the oracle's canonical string must ` +
          `carry exactly that value and no other; observed ${canonical}`,
      ).toEqual(fragment);
    });

    it(`CONTROL (o2, ${label}): the canonical form sorts every object's keys and carries no insignificant whitespace`, () => {
      expect(
        canonical,
        `schema-subset.md:101 — no space or newline between tokens; observed ${canonical}`,
      ).toBe(JSON.stringify(JSON.parse(canonical)));
      const sorted = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          return value.map(sorted);
        }
        if (value !== null && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, sorted(v)]),
          );
        }
        return value;
      };
      expect(
        canonical,
        `schema-subset.md:100 — object keys sorted by Unicode code point at every level; :104 — ` +
          `array elements left in lowering order; observed ${canonical}`,
      ).toBe(JSON.stringify(sorted(fragment)));
    });
  }

  it("CONTROL (o3): each respond-tool document string parses back and is the emission's OWN key order, not the sorted one", () => {
    // `respondSchemaSlug` hashes `JSON.stringify(lowered)` (typed-query-validation.ts:347),
    // so these strings stand for the EMITTED bytes — `anyOf` before `$defs`,
    // `type` before `enum` inside `Sev` — which is the opposite of the
    // canonical form's sort. Pinning both properties keeps the two oracles
    // from being confused for one another.
    for (const [annotation, bytes] of RESPOND_ROWS) {
      expect(
        bytes,
        `o3 [${annotation}]: the string must be minimal JSON of the value it denotes; observed ${bytes}`,
      ).toBe(JSON.stringify(JSON.parse(bytes)));
      expect(
        Object.keys(JSON.parse(bytes) as Record<string, unknown>),
        `o3 [${annotation}]: the lowered document emits its root fragment first and its \`$defs\` ` +
          `closure last (query-schema-lowering.ts:171-173), which is the order the slug hashes`,
      ).toEqual(["anyOf", "$defs"]);
    }
  });
});

// ===========================================================================
// (a) FOUR-POSITION BYTE AND KEY-ORDER PARITY over §Fix constraint 1's whole
// table. One grammar (type-system.md:15, grammar.md:105) and one emission table
// (schema-subset.md step 3) give one answer per type expression, at `params`,
// the `schema`-body field, the alias RHS and the `@<T>` annotation root.
// RED at HEAD: every row whose literal arm is `{}`.
// ===========================================================================

/**
 * Each moving row: disposition, cell id, source text, the one fragment all four
 * positions owe it, and the rule that owes it. `CONTROL` marks the row §Fix
 * constraint 1's table lists as already-agreeing.
 */
const PARITY_ROWS: ReadonlyArray<readonly [string, string, string, unknown, string]> = [
  [
    "RED",
    "a1",
    'Sev | "high"',
    { anyOf: [{ $ref: "#/$defs/Sev" }, { const: "high" }] },
    "schema-subset.md:79 gives the literal arm `{ \"const\": \"high\" }` and :81 (SUBS-1) makes " +
      "the `anyOf` carry what step 3 emits PER ARM — the reference vector `string | Author` " +
      "shows a primitive arm carrying its own `{\"type\":…}`, and the literal row is that " +
      "list's neighbour. At HEAD the arm is the EMPTY schema, which AJV satisfies with every " +
      "JSON value, so the union enforces nothing beyond arm 0",
  ],
  [
    "RED",
    "a2",
    '"high" | Sev',
    { anyOf: [{ const: "high" }, { $ref: "#/$defs/Sev" }] },
    "the same two arms in the other order: :85 (*Array element order*) fixes `anyOf` variant " +
      "order as SOURCE order, so the emission mirrors and nothing else about it changes. This " +
      "is the spelling whose empty FIRST arm strips the enum tag from every value under the " +
      "0.102.0 dispatch (group (c))",
  ],
  [
    "RED",
    "a3",
    'Sev | "high" | "low"',
    { anyOf: [{ $ref: "#/$defs/Sev" }, { const: "high" }, { const: "low" }] },
    "the MULTI-literal arm set: each arm lands on :79's `const` independently, so this never " +
      "reaches bug 0098's bare-`enum` branch (which owns a source `lowerLiteralSublanguage` " +
      "accepts ENTIRE, not an arm of a mixed union)",
  ],
  [
    "RED",
    "a4",
    "Sev | 1",
    { anyOf: [{ $ref: "#/$defs/Sev" }, { const: 1 }] },
    "§Fix constraint 1's NUMBER-literal row: :79 names `42` among the literal row's own members, " +
      "so a single non-string literal ARM lands on `const` rather than on the bare-`enum` " +
      "branch bug 0098 owns",
  ],
  [
    "CONTROL",
    "a5",
    "Sev | true",
    { anyOf: [{ $ref: "#/$defs/Sev" }, { const: true }] },
    "§Fix constraint 1's BOOLEAN row, which is UNCHANGED bytes: bug 0044's fix (0.54.0) gave " +
      "`lowerTypeExpr`'s atom section its own `true` / `false` arm (params.ts:723-727, the " +
        "emission at `:727`) ahead of " +
      "the `IDENTIFIER` test, so this arm already emits :79's `const`. It is a no-op control " +
      "here and the pin that a per-arm consult must not change an emission that already agrees",
  ],
  [
    "RED",
    "a6",
    '"x" | string',
    { anyOf: [{ const: "x" }, { type: "string" }] },
    "bug 0055 §Non-goals handed this shape to bug 0043 §Non-goals, a CLOSED document: " +
      "`parseLiteralArm` declines `string`, so the whole-source check declines the union and " +
      "the literal arm reaches `lowerTypeExpr`'s catch-all. :81's own reference vector is this " +
      "shape with a named arm instead of a literal one",
  ],
  [
    "RED",
    "a7",
    '"x" | integer',
    { anyOf: [{ const: "x" }, { type: "integer" }] },
    "bug 0056 §Non-goals' `d4` row, at all four positions: the same mixed-union rule with a " +
      "numeric primitive arm",
  ],
  [
    "RED",
    "a8",
    '"x" | Triage',
    { anyOf: [{ const: "x" }, { $ref: "#/$defs/Triage" }] },
    "bug 0056 §Non-goals' `d5` row: the same mixed-union rule with a NAMED arm, which resolves " +
      "to its own `$defs` entry and is untouched",
  ],
  [
    "RED",
    "a9",
    '{ a: string } | "lit"',
    { anyOf: [{ $ref: `#/$defs/${A_STRING_INLINE}` }, { const: "lit" }] },
    "the SECOND recursion site (§Fix constraint 6): `lowerBraceGroupUnionArms` " +
      "(params.ts:1188) hoists the brace arm and sends every other arm to `lowerTypeExpr` at " +
      "`:1208-1209`, a path that never touches `lowerTypeExpr`'s own union split — so a fix at one " +
      "site alone would split one type expression's answer by whether a SIBLING arm happens " +
      "to be brace-rooted",
  ],
];

describe("bug 0184 (a) — a literal arm of a mixed union lowers `:79`'s `const` at all four positions", () => {
  for (const [disposition, cell, source, expected, why] of PARITY_ROWS) {
    it(`${disposition} (${cell}): \`${source}\` lowers ${JSON.stringify(expected)} at every position`, () => {
      for (const position of POSITIONS) {
        const fragment = fragmentOf(cell, position, source);
        expect(
          fragment,
          `${cell} [${position}]: ${why}; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expected);
      }
    });

    it(`${disposition} (${cell}-keys): \`${source}\`'s KEY ORDER agrees with the emission at every position`, () => {
      const expectedOrder = keyOrderOf(expected);
      for (const position of POSITIONS) {
        const fragment = fragmentOf(`${cell}-keys`, position, source);
        expect(
          keyOrderOf(fragment),
          `${cell}-keys [${position}]: the fragment is slug-bearing — \`respondSchemaSlug\` ` +
            `hashes \`JSON.stringify(lowered)\` and the \`__inline_<slug>\` mint hashes the ` +
            `canonical form of the same fragment — so key order is contractual, not cosmetic ` +
            `(bug 0056 §Fix *Ordering*); expected ${JSON.stringify(expectedOrder)}, observed ` +
            `${JSON.stringify(keyOrderOf(fragment))} over ${JSON.stringify(fragment)}`,
        ).toEqual(expectedOrder);
      }
    });
  }

  it("CONTROL (a10): the four positions agree BYTE for byte, not merely value for value", () => {
    // GREEN AT HEAD AND AFTER, and that is the point: the four positions agree
    // today — they agree on the WRONG answer, because the absence sits below all
    // of them (§Summary: "One absence, four positions, two recursion sites").
    // §Fix constraint 7 makes the agreement a property to PRESERVE rather than
    // one to establish, so this cell is the tripwire for a fix that moved one
    // position's bytes without the others and split a minted name that is
    // currently single.
    for (const [, cell, source] of PARITY_ROWS) {
      const rendered = POSITIONS.map(
        (position) => [position, JSON.stringify(fragmentOf(cell, position, source))] as const,
      );
      const reference = rendered[0]?.[1];
      for (const [position, bytes] of rendered) {
        expect(
          bytes,
          `${cell} [${position}]: type-system.md:15 gives one grammar per position and ` +
            `schema-subset.md step 3 one emission per type form, so \`${source}\` has ONE byte ` +
            `sequence; a fix that moved one position without the others would split a minted ` +
            `name that is currently single (§Fix constraint 7); rendered ` +
            `${JSON.stringify(rendered)}`,
        ).toBe(reference);
      }
    }
  });
});

// ===========================================================================
// (b) REAL AJV over the lowered `params:` document — the lowered fragment is the
// only enforcement the argument gets (frontmatter-fields-a.md:57), at all three
// consumers of that document.
// RED at HEAD: every refused payload below is accepted, and arm 1 admits
// everything.
// ===========================================================================

/**
 * The bug doc's §Reproduction (b) payload table: the two values the declaration
 * admits, and the seven it must refuse. Every one of the seven is ACCEPTED at
 * HEAD through the empty arm.
 */
const AJV_PAYLOADS: ReadonlyArray<readonly [string, unknown, boolean]> = [
  ['"high"', "high", true],
  ['"low"', "low", true],
  ['"zzz"', "zzz", false],
  ["7", 7, false],
  ["true", true, false],
  ["null", null, false],
  ["[]", [], false],
  ["{}", {}, false],
  ['{"sev":"high"}', { sev: "high" }, false],
];

describe("bug 0184 (b) — the production validator over the lowered `params:` document", () => {
  it("RED (b1): `sev: 'Sev | \"high\"'` admits the two values the declared arms name and refuses everything else", () => {
    const document = paramsDocumentOf("b1", `  sev: ${yamlQuoted('Sev | "high"')}\n  note: string\n`);
    const compiled = ajv().compile(document);
    for (const [label, value, admitted] of AJV_PAYLOADS) {
      const result = compiled.validate({ sev: value, note: "n" });
      expect(
        result.ok,
        `b1: the declared arms are the enum \`Sev\` (\`"high"\` | \`"low"\`) and the literal ` +
          `\`"high"\`, so the union's value set is exactly \`"high"\` and \`"low"\`; ` +
          `frontmatter-fields-a.md:57 makes AJV the enforcement and three sites compile this ` +
          `document (production-theta-producer.ts:790, :1287, :2147). ` +
          `\`{"sev":${label},"note":"n"}\` must be ${admitted ? "ACCEPTED" : "REFUSED"} against ` +
          `${JSON.stringify(document)}; observed ${JSON.stringify(result)}`,
      ).toBe(admitted);
    }
  });

  it("CONTROL (b2): the enforcing contrast `sev: 'Sev'` already refuses all seven, and does not move", () => {
    // The two spellings of one declaration must agree on everything the added
    // arm does not widen. `Sev` alone refuses `"zzz"`, `7`, `true`, `null`,
    // `[]`, `{}` and `{"sev":"high"}` at HEAD, which is the observable the
    // mixed spelling is missing — pinned so the fix is measured against a route
    // that already works rather than against itself.
    const document = paramsDocumentOf("b2", "  sev: Sev\n  note: string\n");
    const compiled = ajv().compile(document);
    for (const [label, value, admitted] of AJV_PAYLOADS) {
      expect(
        compiled.validate({ sev: value, note: "n" }).ok,
        `b2: the bare named route lowers \`{"$ref":"#/$defs/Sev"}\` against an ENFORCING ` +
          `\`$defs\` entry, so \`{"sev":${label}}\` must be ` +
          `${admitted ? "ACCEPTED" : "REFUSED"} against ${JSON.stringify(document)}`,
      ).toBe(admitted);
    }
  });

  it("RED (b3): the PER-ARM verdicts — no arm may admit a value no declared arm names", () => {
    // A whole-document verdict table cannot tell an arm that stopped admitting
    // from an arm that never admitted: `{"anyOf":[A,{}]}` and
    // `{"anyOf":[A,{"const":"high"}]}` differ on seven payloads at the DOCUMENT
    // level only because the empty arm is the one admitting them. Compiling
    // each arm as the self-contained document schema-subset.md:87 item (5)
    // specifies is what makes an arm that admits everything impossible to
    // return unnoticed.
    const document = paramsDocumentOf("b3", `  sev: ${yamlQuoted('Sev | "high"')}\n  note: string\n`);
    const sev = (document as unknown as Record<string, Record<string, unknown>>)["properties"]?.[
      "sev"
    ];
    const arms = armsOf("b3", sev);
    expect(
      arms,
      `b3: SUBS-1 (:81) gives this mixed union two arms in source order (:85); observed ` +
        `${JSON.stringify(sev)}`,
    ).toHaveLength(2);
    /** Per arm: the arm's expected verdict over each of the nine payloads. */
    const PER_ARM: ReadonlyArray<readonly [number, string, ReadonlyArray<readonly [string, boolean]>]> =
      [
        [
          0,
          "the `$ref` to the declared enum `Sev`",
          AJV_PAYLOADS.map(([label, , ]) => [label, label === '"high"' || label === '"low"'] as const),
        ],
        [
          1,
          'the literal arm, which after §Fix is `{"const":"high"}` and admits ONE value',
          AJV_PAYLOADS.map(([label]) => [label, label === '"high"'] as const),
        ],
      ];
    for (const [index, description, expectedRows] of PER_ARM) {
      const arm = arms[index];
      if (arm === undefined) {
        throw new Error(`b3: arm ${index} is absent from ${JSON.stringify(arms)}`);
      }
      const compiled = ajv().compile(armDocument(arm, document));
      for (const [label, admitted] of expectedRows) {
        const value = AJV_PAYLOADS.find(([l]) => l === label)?.[1];
        expect(
          compiled.validate(value).ok,
          `b3 [arm ${index}]: ${description}. schema-subset.md:79 gives a literal arm ` +
            `\`{ "const": <value> }\`, and the EMPTY schema this arm carries at HEAD admits ` +
            `every JSON value — which is the whole of the difference between the document's ` +
            `verdict table and the declaration's own value set. \`${label}\` must be ` +
            `${admitted ? "ACCEPTED" : "REFUSED"} against ` +
            `${JSON.stringify(armDocument(arm, document))}`,
        ).toBe(admitted);
      }
    }
  });

  it("RED (b4): the arm-order twin enforces identically — a verdict table may not depend on arm order", () => {
    // §Reproduction (c) measured that the spec-conformant document gives the
    // identical verdict table under either arm order. That is the property the
    // empty arm destroys at the DISPATCH level (group (c)) and never destroyed
    // at the verdict level, so pinning it here fixes what must stay true of
    // both spellings once the arms are real.
    const forward = paramsDocumentOf("b4", `  sev: ${yamlQuoted('Sev | "high"')}\n  note: string\n`);
    const reversed = paramsDocumentOf("b4", `  sev: ${yamlQuoted('"high" | Sev')}\n  note: string\n`);
    const compiledForward = ajv().compile(forward);
    const compiledReversed = ajv().compile(reversed);
    for (const [label, value, admitted] of AJV_PAYLOADS) {
      expect(
        compiledForward.validate({ sev: value, note: "n" }).ok,
        `b4 [Sev | "high"]: \`${label}\` must be ${admitted ? "ACCEPTED" : "REFUSED"}`,
      ).toBe(admitted);
      expect(
        compiledReversed.validate({ sev: value, note: "n" }).ok,
        `b4 ["high" | Sev]: the declared value set is a property of the ARMS, not of their ` +
          `order (:85 fixes order and states no emission), so \`${label}\` must be ` +
          `${admitted ? "ACCEPTED" : "REFUSED"} here too; observed against ` +
          `${JSON.stringify(reversed)}`,
      ).toBe(admitted);
    }
  });
});

// ===========================================================================
// (c) THE ARM-ORDER PAIR THROUGH BOTH INBOUND BOUNDARIES — the 0.102.0
// consequence. runtime-value-model.md:34 re-tests a validated value against each
// arm in source order and translates under the FIRST that admits it, so the tag
// a body sees is a function of the ARMS. With a real literal arm it follows the
// VALUE; with an empty first arm it follows the ORDER.
// RED at HEAD: the arm bytes, and `"low"` under `"high" | Sev`.
// ===========================================================================

/** One annotation boundary: the real lowering, one real validator, the shipped plan. */
interface AnnotationBoundary {
  readonly annotation: string;
  readonly validator: AjvSchemaValidator;
  readonly lowered: Record<string, unknown>;
  readonly plan: InboundTranslationPlan;
}

/**
 * Lower `annotation` through the shipped `lowerQueryResponseSchema` and derive
 * the shipped inbound plan over it. ONE validator per boundary serves both the
 * boundary's own verdict and the arm re-test, which is the seam-reuse half of
 * the rule (`firstAdmittingArm`, wire-translation.ts:464, compiles through the
 * caller's own cache) and how
 * `src/extension/production-theta-producer.ts:2260` threads it.
 */
function annotationBoundary(annotation: string): AnnotationBoundary {
  const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0184.theta");
  expect(
    diagLines(doc),
    `boundary [${annotation}]: the declaration fixture must load clean or nothing resolves; ` +
      `observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
  const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
  const lowered = lowerQueryResponseSchema(annotation, schemas, enums);
  if (lowered === undefined) {
    throw new Error(
      `boundary [${annotation}]: the annotation produced no lowered document, so there is ` +
        `nothing for AJV to admit and no plan for the inbound walk to read`,
    );
  }
  const document = lowered as Record<string, unknown>;
  return {
    annotation,
    validator: ajv(),
    lowered: document,
    plan: buildInboundTranslationPlan({
      lowered: document,
      annotation,
      schemaNames: new Set(schemas.map((decl) => decl.name)),
      enumNames: new Set(enums.map((decl) => decl.name)),
    }),
  };
}

/**
 * The boundary's own AJV verdict over `payload`, as a PRECONDITION.
 * runtime-value-model.md:34 orders the inbound pass "after AJV validation
 * against the lowered schema", so a payload the boundary refuses reaches no walk
 * at all and a red beneath it would say nothing about arm dispatch.
 */
function requireAdmitted(boundary: AnnotationBoundary, payload: unknown): void {
  const verdict = boundary.validator.compile(boundary.lowered as LoweredSchema).validate(payload);
  if (!verdict.ok) {
    throw new Error(
      `harness: the real AjvSchemaValidator refused ${JSON.stringify(payload)} against ` +
        `\`${boundary.annotation}\`, so this cell drives no inbound walk: ` +
        JSON.stringify(verdict.errors),
    );
  }
}

/** Run the shipped inbound walk, threading the boundary's own validator as the arm-re-test seam. */
function walkInbound(boundary: AnnotationBoundary, value: unknown): ThetaValue {
  return translateInbound({
    validated: value,
    sidecars: boundary.plan.sidecars,
    rootDef: boundary.plan.rootDef,
    schemaNames: boundary.plan.schemaNames,
    schemaValidator: boundary.validator,
  });
}

/**
 * Each spelling of the one declaration, the arms §Fix owes it, and — per value —
 * whether the value is TAGGED with the declaring enum or crosses as a BARE
 * string. `"high"` is the literal's own value and the ONE value arm order still
 * settles; every other value the enum declares is tagged under BOTH spellings.
 */
const DISPATCH_ROWS: ReadonlyArray<
  readonly [string, string, readonly unknown[], ReadonlyArray<readonly [string, string, string]>]
> = [
  [
    "c1",
    'Sev | "high"',
    [{ $ref: "#/$defs/Sev" }, { const: "high" }],
    [
      [
        "high",
        "tagged",
        "arm 0 (the `Sev` `$ref`) admits and governs by :85's source order — unchanged from " +
          "HEAD, where arm 0 admits too",
      ],
      [
        "low",
        "tagged",
        "arm 0 admits `\"low\"`; the literal arm does NOT (after §Fix it admits exactly " +
          '`"high"`), so no ambiguity arises at all',
      ],
    ],
  ],
  [
    "c2",
    '"high" | Sev',
    [{ const: "high" }, { $ref: "#/$defs/Sev" }],
    [
      [
        "high",
        "bare",
        "the literal arm is FIRST and admits its own value, and it names no declaration, so " +
          "`rebuildUnderFirstAdmittingArm` (wire-translation.ts:419) returns the value as it " +
          "arrived — runtime-value-model.md:34's two-arms-admit clause applied to REAL arms, " +
          "narrowed to exactly the literal's own value",
      ],
      [
        "low",
        "tagged",
        "THE DISCRIMINATING ROW. At HEAD arm 0 is the EMPTY schema, which admits `\"low\"` and " +
          "strips the tag; after §Fix arm 0 is `{\"const\":\"high\"}`, which REFUSES `\"low\"`, so " +
          "arm 1 (`Sev`) is the first that admits and the tag follows the VALUE rather than the " +
          "arm ORDER",
      ],
    ],
  ],
];

describe("bug 0184 (c) — the enum tag follows the value, not the arm order", () => {
  for (const [cell, annotation, expectedArms, valueRows] of DISPATCH_ROWS) {
    it(`RED (${cell}-arms): \`@<${annotation}>\` lowers ${JSON.stringify(expectedArms)}`, () => {
      const boundary = annotationBoundary(annotation);
      expect(
        armsOf(`${cell}-arms`, boundary.lowered),
        `${cell}-arms: the PREMISE the dispatch rows below rest on. schema-subset.md:79 gives ` +
          `the literal arm \`{ "const": <value> }\`; at HEAD it is the EMPTY schema, which ` +
          `admits every JSON value and therefore governs whenever it is written first; observed ` +
          `${JSON.stringify(boundary.lowered)}`,
      ).toEqual(expectedArms);
    });

    it(`RED (${cell}-arm-verdicts): each arm of \`@<${annotation}>\` admits exactly what it declares`, () => {
      const boundary = annotationBoundary(annotation);
      const arms = armsOf(`${cell}-arm-verdicts`, boundary.lowered);
      // The arm documents the plan itself built (schema-subset.md:87 item (5)),
      // read off the sidecar rather than reconstructed, so the cell tests the
      // documents the shipped re-test actually compiles.
      const positions = boundary.plan.sidecars.get(boundary.plan.rootDef)?.unionArms ?? [];
      const rootPosition = positions.find((position) => position.pointer === "");
      if (rootPosition === undefined) {
        throw new Error(
          `${cell}-arm-verdicts: the plan records no union position at the fragment root, so ` +
            `the walk reads no arms there; sidecar keys ` +
            `${JSON.stringify([...boundary.plan.sidecars.keys()])}`,
        );
      }
      expect(
        rootPosition.arms,
        `${cell}-arm-verdicts: item (5) records one arm per \`anyOf\` variant in source order`,
      ).toHaveLength(arms.length);
      for (const [index, arm] of rootPosition.arms.entries()) {
        const compiled = boundary.validator.compile(arm.document as LoweredSchema);
        for (const value of ["high", "low", "zzz"]) {
          const declaredByArm =
            index === expectedArms.findIndex((a) => "$ref" in (a as Record<string, unknown>))
              ? value === "high" || value === "low"
              : value === "high";
          expect(
            compiled.validate(value).ok,
            `${cell}-arm-verdicts [arm ${index}]: an arm whose lowered form is the EMPTY schema ` +
              `admits EVERY value, which is what makes the dispatch's first-match-wins rule ` +
              `(runtime-value-model.md:34) read arm order instead of the value; ` +
              `\`${JSON.stringify(value)}\` must be ` +
              `${declaredByArm ? "ADMITTED" : "REFUSED"} by ${JSON.stringify(arm.document)}`,
          ).toBe(declaredByArm);
        }
      }
    });

    for (const [value, expectation, why] of valueRows) {
      const disposition = cell === "c2" && value === "low" ? "RED" : "GREEN-AT-HEAD";
      it(`${disposition} (${cell}-translate-${value}): \`@<${annotation}>\` over ${JSON.stringify(value)} binds a ${expectation} value`, () => {
        const boundary = annotationBoundary(annotation);
        requireAdmitted(boundary, value);
        const rebuilt = walkInbound(boundary, value);
        const tagged = valuesEqual(rebuilt, makeEnumValue("Sev", value));
        const bare = valuesEqual(rebuilt, value as unknown as ThetaValue);
        expect(
          tagged,
          `${cell}-translate-${value} [translateInbound]: ${why}. runtime-value-model.md:34 ` +
            `reattaches the declaring enum's tag at every position the sidecar maps, and ` +
            `\`Severity.Low == "low"\` is FALSE by the equality rule (:13), so which value this ` +
            `is decides whether a downstream \`==\` against a constructed variant holds. The ` +
            `wire projection is identical either way (${JSON.stringify(rebuilt)}), which is why ` +
            `only \`valuesEqual\` against a locally constructed variant can witness it`,
        ).toBe(expectation === "tagged");
        expect(
          bare,
          `${cell}-translate-${value} [translateInbound]: the complementary reading — an ` +
            `untagged bare string compares equal to the plain string and unequal to every ` +
            `constructed variant`,
        ).toBe(expectation === "bare");
        // The wire projection is byte-identical on both sides of the dispatch,
        // which is exactly why a JSON-shaped check cannot witness this bug
        // (runtime-value-model.md:13 — the enum carrier serialises to the bare
        // wire string).
        expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(value));
      });

      it(`${disposition} (${cell}-bind-${value}): \`sev: '${annotation}'\` at \`params:\` binds a ${expectation} value`, () => {
        // The SECOND boundary, over the theta's OWN lowered `params:` document
        // rather than a hand-written one, through `bindParamsInbound`
        // (inbound-boundary.ts:134) — boundary 3 of runtime-value-model.md:34.
        // ONE real `AjvSchemaValidator` serves both the merge verdict and the
        // arm re-test, mirroring how production threads it
        // (production-theta-producer.ts:2260).
        const src =
          `---\ndescription: bind a mixed-union param\nmode: prompt\nmodel: m\nparams:\n` +
          `  sev: ${yamlQuoted(annotation)}\n  note: string\n---\n${DECLS}let inert = 1\ninert\n`;
        const doc = parseDoc(src, "bug0184-params.theta");
        expect(
          diagLines(doc),
          `${cell}-bind-${value}: the \`params:\` fixture must load clean; observed ` +
            `${JSON.stringify(diagLines(doc))}`,
        ).toEqual([]);
        const lowered = loweredParamsDocument(doc);
        if (lowered === undefined) {
          throw new Error(
            `${cell}-bind-${value}: the theta declares a \`params:\` block, so BIND-1 requires a ` +
              `lowered schema for the binder to compile`,
          );
        }
        armsOf(`${cell}-bind-${value}`, (lowered["properties"] as Record<string, unknown>)["sev"]);
        const validator = ajv();
        const params = { sev: value, note: "n" };
        const verdict = validator.compile(lowered as LoweredSchema).validate(params);
        if (!verdict.ok) {
          throw new Error(
            `${cell}-bind-${value}: the real AjvSchemaValidator refused the merged args against ` +
              `the fixture's own \`params:\` document, so no binder projection runs: ` +
              JSON.stringify(verdict.errors),
          );
        }
        const bindings = bindParamsInbound({
          params,
          lowered,
          body: doc.body,
          schemaValidator: validator,
        });
        const bound = bindings.get("sev") as ThetaValue;
        expect(
          valuesEqual(bound, makeEnumValue("Sev", value)),
          `${cell}-bind-${value} [bindParamsInbound]: ${why}. runtime-value-model.md:34 names ` +
            `binder \`args\` among the four inbound boundaries and is "not restated per call ` +
            `site", so the \`params:\` position must reach the same verdict the \`@<T>\` ` +
            `position does for the same arms`,
        ).toBe(expectation === "tagged");
        expect(
          valuesEqual(bound, value as unknown as ThetaValue),
          `${cell}-bind-${value} [bindParamsInbound]: the complementary reading`,
        ).toBe(expectation === "bare");
        // The sibling non-union param is unaffected: the dispatch adds a tag
        // where an arm names a declaration and changes nothing elsewhere.
        expect(
          bindings.get("note"),
          `${cell}-bind-${value}: the sibling \`note: string\` binds its plain string`,
        ).toBe("n");
      });
    }
  }
});

// ===========================================================================
// (d) THE NO-OP CONTROLS (§Fix constraint 1 "Nothing else moves", constraint 5,
// constraint 9, §Non-goals) — every arm the recogniser declines, and every
// ALL-literal arm set, keeps its exact bytes. GREEN at HEAD and required to stay
// green: these are what keeps the fix from over-reaching.
// ===========================================================================

describe("bug 0184 (d) — every arm the consult declines keeps its bytes", () => {
  const CONTROLS: ReadonlyArray<readonly [string, string, unknown, string]> = [
    [
      "d1",
      "Sev | null",
      { anyOf: [{ $ref: "#/$defs/Sev" }, { type: "null" }] },
      "§Fix constraint 5: `null` is BOTH a `PrimitiveType` (grammar.md:97) and a `LiteralType` " +
        "(:102), and SUBS-1 (schema-subset.md:81) counts it as a primitive BY NAME — the " +
        "nullability idiom is that rule's own reference vector. The `PRIMITIVE_TYPES` test comes " +
        "FIRST at the arm, so a bare `null` arm never reaches the literal recogniser and keeps " +
        "`{\"type\":\"null\"}` instead of being converted to `{\"const\":null}`",
    ],
    [
      "d2",
      "string | null",
      { type: ["string", "null"] },
      "the same constraint at its sharpest: converting the `null` arm to `{\"const\":null}` would " +
        "make this union non-primitive and COLLAPSE SUBS-1's multi-type-array form into an " +
        "`anyOf`, moving a shape :81 states outright",
    ],
    [
      "d3",
      "Triage | null",
      { anyOf: [{ $ref: "#/$defs/Triage" }, { type: "null" }] },
      "the idiom with a named arm: both arms are declined by the recogniser, so neither moves",
    ],
    [
      "d4",
      '"x" | "y"',
      { type: "string", enum: ["x", "y"] },
      "an ALL-LITERAL arm set. §Fix constraint 2 gates the per-arm consult to the MIXED set, so " +
        "this source keeps the emission `lowerLiteralSublanguage` already gives it as a WHOLE " +
        "SOURCE at schema-subset.md:80 (`type` first) rather than being shadowed by " +
        "`{\"anyOf\":[{\"const\":\"x\"},{\"const\":\"y\"}]}` — a third value no step-3 row states",
    ],
    [
      "d5",
      "{a: integer} | Triage",
      {
        anyOf: [{ $ref: `#/$defs/${A_INTEGER_INLINE}` }, { $ref: "#/$defs/Triage" }],
      },
      "the `lowerBraceGroupUnionArms` route with NO literal arm: the brace arm hoists and the " +
        "named arm resolves, exactly as at HEAD",
    ],
    [
      "d6",
      "array<Sev> | null",
      {
        anyOf: [{ type: "array", items: { $ref: "#/$defs/Sev" } }, { type: "null" }],
      },
      "a generic arm beside a `null` one: `parseLiteralArm` declines `array<Sev>` and the " +
        "primitive test claims `null`, so nothing moves",
    ],
    [
      "d7",
      'array<"x" | "y">',
      { type: "array", items: { type: "string", enum: ["x", "y"] } },
      "BUG 0164's SUBJECT, and the placement adjudication's own control. This ALL-literal union " +
        "is reached through `lowerTypeExpr`'s GENERIC-ARGUMENT recursion (params.ts:702), not " +
        "through either whole-source caller. BUG 0164 §Fix (v0.123.0) HAS NOW DONE EXACTLY WHAT " +
        "THIS CELL SAID ITS REMEDY WOULD: it re-routes that argument recursion through " +
        "`lowerLiteralSublanguage`, so these bytes are the WHOLE-SOURCE `:80` emission reached " +
        "through the re-routed generic-argument recursion — not a per-arm product. THIS FILE's " +
        "gate is still what keeps the per-ARM consult off an all-literal arm set (§Fix " +
        "constraint 2): without it the argument's union split would lower " +
        "`{\"anyOf\":[{\"const\":\"x\"},{\"const\":\"y\"}]}`, a third value no step-3 row states and " +
        "neither report specifies. Bug 0164 §Fix is the authority that moved these bytes; the " +
        "cell keeps its subject, the four-position disposition of an all-literal arm set reached " +
        "through the argument",
    ],
    [
      "d8",
      'array<"x">',
      { type: "array", items: { const: "x" } },
      "bug 0164's subject at ONE atom: a single literal generic argument is not a union at all, " +
        "so `lowerTypeExpr`'s union split never runs and THIS file's per-arm consult is never " +
        "reached — unchanged, and still why the row is here. What moved is bug 0164 §Fix's own " +
        "half: the re-routed argument recursion reaches `lowerLiteralSublanguage`'s single-atom " +
        "branch, so `items` carries schema-subset.md:79's `{\"const\":\"x\"}` where it carried the " +
        "trailing catch-all's `{}`. Bug 0164 §Fix is the authority that moved these bytes",
    ],
  ];

  for (const [cell, source, expected, why] of CONTROLS) {
    it(`CONTROL (${cell}): \`${source}\` keeps ${JSON.stringify(expected)} at every position`, () => {
      const expectedOrder = keyOrderOf(expected);
      for (const position of POSITIONS) {
        const fragment = fragmentOf(cell, position, source);
        expect(
          fragment,
          `${cell} [${position}]: ${why}; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expected);
        expect(
          keyOrderOf(fragment),
          `${cell} [${position}]: the bytes are pinned, key order included, because the fragment ` +
            `is slug-bearing; observed ${JSON.stringify(fragment)}`,
        ).toEqual(expectedOrder);
      }
    });
  }

  it("CONTROL (d9): an UNRESOLVED-name arm and a `Result<…>` arm keep their `{}` variants AND their diagnostics", () => {
    // §Fix constraint 9 and §Non-goals: these `{}` variants come from
    // `lowerTypeExpr`'s RESOLUTION arm (params.ts:748-750) and its non-`array`
    // generic arm (`:706-709`), not from the trailing catch-all the literal
    // recogniser sits in front of — so `parseLiteralArm` declines both texts
    // and neither disposition moves. Bug 0028's inventory owns whether they
    // should exist at all.
    //
    // Both raise at the three `params:`-document positions, so this cell reads
    // the diagnostic as part of the pinned disposition rather than asserting
    // silence. It is the ONE cell in this file that expects a diagnostic, and it
    // expects a PRE-EXISTING one: §Fix constraint 9 registers no new code
    // (DIAG-2 — the registry is closed).
    const ROWS: ReadonlyArray<readonly [string, string, unknown, string]> = [
      [
        "an UNRESOLVED name arm",
        "Sev | Tirage",
        { anyOf: [{ $ref: "#/$defs/Sev" }, {}] },
        "theta/parse/unresolved-named-type",
      ],
      [
        "a `Result<…>` arm",
        "Sev | Result<Triage, Triage>",
        { anyOf: [{ $ref: "#/$defs/Sev" }, {}] },
        "theta/parse/result-in-schema-position",
      ],
    ];
    for (const [label, source, expected, code] of ROWS) {
      // The `field` and `alias` positions still lower past their diagnostic, so
      // the fragment is readable there; the `params:` position withholds its
      // whole lowered document, and the `@<T>` annotation lowers through a
      // direct `lowerQueryResponseSchema` call that raises nothing of its own.
      for (const position of ["field", "alias"] as const) {
        const read = readAt(position, source);
        expect(
          read.diags.map((line) => line.split(":")[0]),
          `d9 [${label}/${position}]: the pre-existing diagnostic is part of this row's pinned ` +
            `disposition (§Fix constraint 9 adds none); observed ${JSON.stringify(read.diags)}`,
        ).toEqual([`error ${code}`]);
        expect(
          read.fragment,
          `d9 [${label}/${position}]: this \`{}\` is not the catch-all's, so the per-arm literal ` +
            `consult never sees the text and the variant is unchanged; observed ` +
            `${JSON.stringify(read.fragment)}`,
        ).toEqual(expected);
      }
      const annotation = readAt("annotation", source);
      expect(
        annotation.fragment,
        `d9 [${label}/annotation]: the annotation root lowers the same variant; observed ` +
          `${JSON.stringify(annotation.fragment)}`,
      ).toEqual(expected);
    }
  });

  it("CONTROL (d10): `{m: Sev | null}` keeps its fragment AND its minted name at all three hoisting positions", () => {
    // The constraint-5 control one level down. `schema-subset.md:73` mints from
    // the LOWERED fragment, so a `null` arm that moved would rename this entry
    // at every hoisting position at once — which is how a slug pin catches a
    // change a fragment-shaped assertion one level up would miss.
    for (const position of HOISTING_POSITIONS) {
      expect(
        refNameOf("d10", position, "{m: Sev | null}"),
        `d10 [${position}]: §Fix constraint 1 — "Nothing else moves", and constraint 7 makes the ` +
          `agreement across positions a property to PRESERVE`,
      ).toBe(M_SEV_NULL_INLINE);
      expect(
        defOf("d10", position, "{m: Sev | null}", M_SEV_NULL_INLINE),
        `d10 [${position}]: the hoisted fragment is unchanged`,
      ).toEqual(M_SEV_NULL_FRAGMENT);
    }
    expect(
      fragmentOf("d10", "annotation", "{m: Sev | null}"),
      "d10 [annotation]: the annotation root inlines what the other three positions hoist, so " +
        "its bytes are the mint's input",
    ).toEqual(M_SEV_NULL_FRAGMENT);
  });

  it("CONTROL (d11): the two declarations every row resolves against are themselves unmoved", () => {
    const read = readAt("params", "Sev | null");
    expect(
      read.defs,
      "d11: `enum Sev` lowers through the enum arm and `schema Triage` through the object and " +
        "primitive arms; this fix touches neither. `Triage` is absent here because step 4 prunes " +
        "`$defs` to what the document reaches",
    ).toEqual({ Sev: SEV_DEF });
    const triage = readAt("params", "Triage | null");
    expect(
      triage.defs,
      "d11: `schema Triage { urgent: boolean }` lowers to its closed object form",
    ).toEqual({
      Triage: {
        type: "object",
        properties: { urgent: { type: "boolean" } },
        required: ["urgent"],
        additionalProperties: false,
      },
    });
  });
});

// ===========================================================================
// (e) THE SILENCE, PRESERVED (§Fix constraints 4 and 9) — every moving row and
// every no-op control loads with ZERO diagnostics at all four positions, before
// AND after. `isUnspellableTextRefusable` (params.ts:1274) declines any text
// `parseLiteralArm` recognises on the stated ground that it "lowers under its
// own emission" (`:1256-1257`); the fix makes that premise TRUE at a union arm
// rather than changing the predicate, so it and all three of its readers stay
// byte-unchanged and NO new diagnostic appears anywhere.
// GREEN at HEAD and required to stay green.
// ===========================================================================

describe("bug 0184 (e) — zero diagnostics at every position, before and after", () => {
  const SILENT_SOURCES: readonly string[] = [
    ...PARITY_ROWS.map(([, , source]) => source),
    "Sev | null",
    "string | null",
    "Triage | null",
    '"x" | "y"',
    "{a: integer} | Triage",
    "array<Sev> | null",
    'array<"x" | "y">',
    'array<"x">',
    '{m: Sev | "high"}',
    "{m: Sev | null}",
  ];

  for (const source of SILENT_SOURCES) {
    it(`CONTROL (e1, \`${source}\`): loads clean at all four positions`, () => {
      for (const position of POSITIONS) {
        const read = readAt(position, source);
        expect(
          read.diags,
          `e1 [${position}]: \`${source}\` is grammar-admitted (grammar.md:94/:102/:105) and ` +
            `§Fix constraint 9 registers no new diagnostic code (DIAG-2 — the registry is ` +
            `closed), so the silence at HEAD is the silence after; observed ` +
            `${JSON.stringify(read.diags)}`,
        ).toEqual([]);
      }
    });
  }
});

// ===========================================================================
// (f) THE BINDER ENVELOPE AND THE `Parameters:` LINE — the two model-facing
// surfaces, one of which must move and one of which must not.
// RED at HEAD: the envelope's `ok.args.properties.sev` carries the empty arm.
// ===========================================================================

describe("bug 0184 (f) — the enforcing fragment reaches the model-facing schema", () => {
  it("RED (f1): `relaxParamsSchema` copies the moved arm into the envelope's `ok.args`", () => {
    // `buildBinderEnvelopeSchema` (src/binder/binder-envelope.ts:86) is the
    // whole route: `relaxParamsSchema` (`:89`, defined at `:137`) copies the
    // lowered document's `properties` VERBATIM into the `ok` arm's `args`,
    // removing only defaulted names from `required`. So whatever the `params:`
    // position lowered is exactly what constrains the binder model's forced-tool
    // input — an empty variant gives grammar-constrained decoding nothing to
    // constrain at that position.
    const paramsSchema = paramsDocumentOf("f1", `  sev: ${yamlQuoted('Sev | "high"')}\n`);
    const envelope = buildBinderEnvelopeSchema({ paramsSchema, defaultedFields: [] });
    const arms = envelope["anyOf"] as ReadonlyArray<Record<string, unknown>>;
    const okArm = arms[0];
    if (okArm === undefined) {
      throw new Error(
        `f1: BNDR-1 gives the envelope three arms with \`ok\` first; observed ` +
          `${JSON.stringify(envelope)}`,
      );
    }
    const args = (okArm["properties"] as Record<string, unknown>)["args"] as Record<string, unknown>;
    expect(
      args,
      `f1: the relaxed copy carries the lowered fragment unchanged, so an ENFORCING arm is what ` +
        `the binder is constrained by; observed ${JSON.stringify(args)}`,
    ).toEqual({
      type: "object",
      properties: { sev: { anyOf: [{ $ref: "#/$defs/Sev" }, { const: "high" }] } },
      required: ["sev"],
      additionalProperties: false,
    });
    const property = (args["properties"] as Record<string, unknown>)["sev"];
    expect(
      keyOrderOf(property),
      `f1: the copy is verbatim, so the arm's key order survives into the provider-facing ` +
        `document; observed ${JSON.stringify(property)}`,
    ).toEqual(keyOrderOf({ anyOf: [{ $ref: "#/$defs/Sev" }, { const: "high" }] }));
    expect(
      envelope["$defs"],
      "f1: the params document's `$defs` closure is hoisted to the envelope document root, so " +
        "the arm's `$ref` resolves there",
    ).toEqual({ Sev: SEV_DEF });
  });

  it("CONTROL (f2): the `Parameters:` line still renders the declared type verbatim", () => {
    // binder-bypass-and-envelope.md:129 (*Type display*) makes the SURFACE type
    // normative on this line, never the lowering, so closing the schema side
    // must leave the prompt side byte-identical. The bug's whole shape is that
    // the prompt says `sev (Sev | "high") required` while the envelope asserts
    // nothing at that position.
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n  sev: ${yamlQuoted('Sev | "high"')}\n---\n${DECLS}let inert = 1\ninert\n`,
      "bug0184.theta",
    );
    expect(diagLines(doc), "f2: the binder fixture must load clean").toEqual([]);
    const field = doc.frontmatter?.params?.fields[0];
    if (field === undefined) {
      throw new Error(
        `f2: the theta declares one \`params:\` field, so the recorded field list must carry it; ` +
          `observed ${JSON.stringify(doc.frontmatter?.params)}`,
      );
    }
    expect(
      field.type,
      "f2: frontmatter-fields-a.md:58 — the author's type text is recorded verbatim, which is " +
        "what the lowering must now agree with rather than drop",
    ).toBe('Sev | "high"');
    expect(
      renderBinderParamLine({
        wireName: field.wireName,
        type: field.type,
        requirement:
          field.hasDefault && field.defaultSource !== undefined
            ? { kind: "default", literal: field.defaultSource }
            : { kind: "required" },
      }),
      "f2: binder-bypass-and-envelope.md:117's `<wire-name> (<type>) <requirement>` template " +
        "over the surface type, unmoved by the lowering change",
    ).toBe('  sev (Sev | "high") required');
  });
});

// ===========================================================================
// (g) THE RE-MINTED NAMES (§Fix constraints 7 and 8) — both slug families are a
// function of the arm's bytes, so both move with it, and they move at every
// hoisting position TOGETHER.
// RED at HEAD: both minted names.
// ===========================================================================

describe("bug 0184 (g) — the content-addressed names move with the arm", () => {
  it("RED (g1): `{m: Sev | \"high\"}` mints ONE name at all three hoisting positions", () => {
    // schema-subset.md:73 makes `__inline_<slug>` a function of the LOWERED
    // fragment and :98 confirms it, so the moved arm re-mints
    // `__inline_d120f11c7193b40b` (HEAD) as the name below. §Fix constraint 7
    // makes the AGREEMENT across positions a property to preserve, not one to
    // establish: a change that moved one position's bytes without the others
    // would split a name that is currently single.
    const minted = HOISTING_POSITIONS.map(
      (position) => [position, refNameOf("g1", position, '{m: Sev | "high"}')] as const,
    );
    for (const [position, name] of minted) {
      expect(
        name,
        `g1 [${position}]: the mint hashes the canonical form of a fragment whose \`m\` carries ` +
          `the moved arm, so one source text has one name at every hoisting position; minted ` +
          `${JSON.stringify(minted)}`,
      ).toBe(M_SEV_HIGH_INLINE);
      expect(
        defOf("g1", position, '{m: Sev | "high"}', M_SEV_HIGH_INLINE),
        `g1 [${position}]: the hoisted entry's own \`m\` carries schema-subset.md:79's \`const\` ` +
          `at the arm`,
      ).toEqual(M_SEV_HIGH_FRAGMENT);
    }
    // The `@<T>` annotation root is brace-rooted, so it lowers the object in
    // place rather than hoisting it; its bytes are the mint's input, which is
    // what makes the name above derivable from them.
    expect(
      fragmentOf("g1", "annotation", '{m: Sev | "high"}'),
      "g1 [annotation]: the annotation root inlines what the other three positions hoist",
    ).toEqual(M_SEV_HIGH_FRAGMENT);
  });

  it("RED (g2): the `{ a: string } | \"lit\"` union keeps its brace arm's name while its literal arm moves", () => {
    // The `lowerBraceGroupUnionArms` route, read as a mint: the hoisted arm's
    // OWN bytes are untouched, so `__inline_968e40317188aebd` — the name
    // `{a: string}` mints — does not move; what moves is the sibling variant
    // beside the `$ref`. Reading both in one cell is what keeps a fix from
    // trading one for the other.
    for (const position of POSITIONS) {
      const fragment = fragmentOf("g2", position, '{ a: string } | "lit"') as Record<string, unknown>;
      expect(
        fragment,
        `g2 [${position}]: the brace arm's \`$ref\` and the literal arm's \`const\`; observed ` +
          `${JSON.stringify(fragment)}`,
      ).toEqual({ anyOf: [{ $ref: `#/$defs/${A_STRING_INLINE}` }, { const: "lit" }] });
      expect(
        defOf("g2", position, '{ a: string } | "lit"', A_STRING_INLINE),
        `g2 [${position}]: the hoisted brace arm's own fragment is unchanged, so its name is too`,
      ).toEqual({
        type: "object",
        properties: { a: { type: "string" } },
        required: ["a"],
        additionalProperties: false,
      });
    }
  });

  for (const [annotation, expectedBytes, canonicalBytes, disposition] of RESPOND_ROWS) {
    const label = disposition.startsWith("UNCHANGED") ? "CONTROL" : "RED";
    it(`${label} (g3, @<${annotation}>): the respond tool is named __theta_respond_${slugOfBytes(canonicalBytes)}`, () => {
      // `respondSchemaSlug` (typed-query-validation.ts) names the registered
      // `__theta_respond_<slug>` tool AND the QRY-12 / QRY-15 template
      // references, and `renderTypedAwareQueryText`
      // (production-theta-producer.ts:5495) interpolates the fragment
      // itself into the instruction at `:5380`. So the arm's bytes are both what
      // the model is grammar-constrained by and part of a registered tool's
      // name (§Fix constraint 8).
      const boundary = annotationBoundary(annotation);
      expect(
        JSON.stringify(boundary.lowered),
        `g3 [${annotation}]: ${disposition}. schema-subset.md:76–:85 fixes this emission ` +
          `independent of bug 0099, so the document is pinned before the name is; observed ` +
          `${JSON.stringify(boundary.lowered)}`,
      ).toBe(expectedBytes);
      expect(
        `__theta_respond_${respondSchemaSlug(boundary.lowered as LoweredSchema)}`,
        `g3 [${annotation}]: bug 0099 route A — the 16-hex slug of the SHA-256 of the CANONICAL ` +
          `form ${canonicalBytes} (schema-subset.md:99–:107), not of the emitted bytes ` +
          `${expectedBytes}`,
      ).toBe(`__theta_respond_${slugOfBytes(canonicalBytes)}`);
    });
  }
});
