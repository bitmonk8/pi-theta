import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Expr, ThetaDocument } from "../src/parser/theta-document";
import { lexTheta, type ThetaSource } from "../src/lexer/lexer";
import { parseThetaDocument } from "../src/parser/theta-document";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import {
  checkCompatible,
  commonType,
  displayType,
  type CompatType,
  type TypeEnv,
} from "../src/parser/type-compat";
import { checkMatchArmTypes, type MatchResultSite } from "../src/parser/match-result";
import { resolveReturnType } from "../src/parser/functions";
import { parseDeps, parseDoc } from "./helpers/e2e-s1";

// Bug 0158 — `#typeExpr`'s `case "match"` (src/parser/static-type-inference.ts:271)
// routes the arm-body types through the union LUB `#commonType` (:493, which
// delegates to the exported `commonType`, src/parser/type-compat.ts:682), while
// the two checker-side LUBs for the same two constructs stay
// dominating-member-only: `leastUpperBound` (src/parser/match-result.ts:253)
// behind `checkMatchArmTypes` (:204) and `computeLub` (src/parser/functions.ts:348)
// behind `resolveReturnType` (:267). So `typeOf` on
// `match 1 { 1 => 1, _ => "a" }` answers `integer | string` while the checker
// refuses the same node, and three corpus sentences assert the two disciplines
// are identical
// (docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md).
//
// THE ROUTE UNDER TEST — §Fix "Route B — CORRECT the spec to scope the union
// discipline to array/ternary", with B7 option (i). Settled by the run; not
// re-litigated here. Route A (both checker LUBs delegating to `commonType`) was
// premeasured and reds cells in other open reports' witnesses, which is why the
// cells below encode the CORRECT direction and not the ADOPT direction:
//
//   docs lane — three corrected sentences (group (A));
//   src lane  — B7 option (i): `case "match"` stops routing through the union
//               `#commonType` and reduces the arm types by the same
//               dominating-member discipline `leastUpperBound` uses, falling
//               back to the first candidate when no member dominates (the pass
//               owes the walk a type). Group (B) and cell D2.
//   src lane  — B5: `leastUpperBound`'s doc comment gains the divergence note
//               `computeLub` already carries. Comment-only; cell D3 pins the
//               member restriction that comment describes is still there.
//
// THE LAW THIS FILE ENFORCES — bug 0155's §Fix (0.174.0) "THE STATED LAW",
// which 0158 lands second against and cites verbatim:
//
//   > A registered *Trigger* is the normative statement of a code's emission set
//   > (DIAG-2). Where a rule page's scope exceeds the registered *Trigger* of the
//   > code it names, the *Trigger* governs and the rule page is corrected in the
//   > same commit; no implementation may be wired to emit a code outside its
//   > registered *Trigger*. Narrowing an emission set ONTO its registered
//   > *Trigger* needs no registry edit (the 0084/0139 posture), but where the
//   > *Trigger*'s TEXT presupposes the wider reading, that text is corrected in
//   > the same commit as the narrowing.
//
// Applied here, the two registered *Triggers* ALREADY read to the dominating
// semantics — `theta/parse/match-arm-type-mismatch` ("A `match` arm's body type
// is not assignable to the common type of the other arms.") and
// `theta/parse/return-no-common-type` ("… share no common upper bound and no
// sink narrows them.") — so the *Trigger* governs, the three rule-page sentences
// that claim the array/ternary union discipline are what gets corrected, no
// emission set moves, and no registry row is touched. Cell D1 is that limb's
// control: it fails loudly if either *Trigger* text drifts off the dominating
// reading, because then the whole route's premise is gone.
//
// THE CELLS.
//
//   Group (A) — CORPUS CONFORMANCE, one cell per corrected sentence. Each reads
//   the real page off disk, asserts the false claim is GONE and the corrected
//   claim is PRESENT. RED at this HEAD, green once the route-B prose lands.
//
//   Group (B) — INFERENCE AGREEMENT. The raw `typeOf` read on a `match` node
//   (the group-(t) harness shape tests/division-result-type-number.test.ts:583
//   establishes) plus the two end-to-end sinks the union currently reaches.
//   RED at this HEAD: the pass answers `integer | string` and renders it into
//   `fn-arg-type-mismatch` / `mixed-plus-operands`. The expected hit lists were
//   re-derived against a B7(i) prototype (an inline dominating-member reduction
//   at `case "match"`), not guessed; the prototype was reverted byte-exact and
//   hash-verified.
//
//   Group (C) — BEHAVIOUR PINS, green before AND after. The "unchanged by this
//   route" set: §Reproduction rows n1–n4, v1–v4, o1–o4, d1–d4, t2, t3, s1, s2,
//   w9, w10, e2, the registration gate r1/r2, and the three LUB seams called
//   directly (tC2/tC3, tC4, tC5/tC6). Route B changes no behaviour at any of
//   them — including row o2, which is bug 0155's settled disposition and must
//   not move.
//
//   Group (D) — STRUCTURAL / *Trigger*-fidelity pins over `src/` and the
//   registry. D1 and D3 are green both sides; D2 is RED now (the union call is
//   still wired at `case "match"`).
//
//   Group (E) — GOV-15 corpus census, re-measured AT THIS HEAD (not copied from
//   §Reproduction (g)): the committed `.theta`/`.thetalib` corpus, and that zero
//   committed source draws either code. Green both sides — the route moves no
//   emission set, so no committed source's diagnostic sequence moves.
//
// SCOPE BOUNDARIES, held deliberately.
//
//   - The DEAD SINK ARM is out of scope. `checkMatchArmTypes`'s sink arm
//     (src/parser/match-result.ts:215–224) is unreachable from source because
//     the walk hard-codes `sink: undefined`
//     (src/parser/type-layer-checks.ts:2652), and 0158 §Non-goals leaves the
//     `docs/spec_topics/expressions.md` sink half of the arm-syntax
//     parenthetical OPEN. No cell here asserts that a sink narrows a `match`,
//     and cell A3 asserts nothing about that half of the sentence.
//   - The ternary side is 0155's (rows n2, v2, o2 are pinned unchanged, not
//     adjudicated). Which BINDING an arm body reads is bug 0145's. The
//     diagnostic COUNT at the group-(C)/(B) sinks is bug 0129's — measured,
//     never adjudicated. The plain annotated-`fn` return gap is why row e2
//     loads (nothing checks it), not evidence that an annotation narrows.
//   - Absolute line drift in `type-compat.ts` / `match-result.ts` /
//     `functions.ts` is bug 0134's do-not-chase class, so every structural cell
//     below matches on SYMBOLS and source text, never on a line number.
//
// TIER — unit, offline, provider-free, deterministic. Every group (B)/(C) row
// settles inside one `parseThetaDocument` call or one direct seam call over the
// shipped `checkCompatible`; groups (A) and (D) are `readFileSync` reads of the
// corpus and of `src/`; group (E) reads the git index and runs the shipped
// lexer/parser, the pattern tests/committed-fixture-parse-gate.test.ts
// establishes. Nothing crosses a provider, a model, a child process or the
// network: an integration tier would wrap a parse-time observable in a session
// round-trip, and a live tier would make a fully determined observable
// stochastic.
//
// NO SILENT SKIPPING (CLAUDE.md, AGENTS.md §"No silent skipping"). Nothing here
// early-returns or branches on the environment. Every corpus anchor, `src/`
// anchor, registry row and git invocation throws BY NAME when absent, and every
// group (B)/(C) cell first runs a loud precondition naming the premise it needs
// (the fixture really parsed to a `match`; its diagnostic set is the one the row
// is about), so a restructured page or a mis-parsed fixture fails loudly instead
// of asserting over an empty string.

// ===========================================================================
// Corpus + registry readers.
// ===========================================================================

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function corpus(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";
const TYPE_SYSTEM_MIRROR = "docs/reference/type-system.md";
const FUNCTIONS_PAGE = "docs/spec_topics/functions.md";
const EXPRESSIONS_PAGE = "docs/spec_topics/expressions.md";

const MATCH_MISMATCH_CODE = "theta/parse/match-arm-type-mismatch";
const RETURN_NO_COMMON_CODE = "theta/parse/return-no-common-type";

interface RegistryRow {
  readonly code: string;
  readonly trigger: string;
}

const REGISTRY = parseRegistry(corpus(REGISTRY_PAGE)) as RegistryRow[];

/** The registered *Trigger* of `code` — the DIAG-2 oracle THE STATED LAW makes normative. */
function trigger(code: string): string {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no row for ${code} — the *Trigger* column is this file's normative oracle (DIAG-2, docs/spec_topics/diagnostics/diagnostic-shape.md "The registry is closed"), so a missing row is a harness failure, never a skip`,
    );
  }
  return row.trigger;
}

/**
 * The text from `startAnchor` up to the next `endPattern` (or end of file).
 *
 * A missing anchor throws naming the page and the anchor: the slice is what
 * scopes a conformance assertion to one sentence, so an empty slice would turn
 * a group (A) cell into a vacuous pass.
 */
function sliceFrom(
  page: string,
  text: string,
  startAnchor: string,
  endPattern: RegExp,
): string {
  const start = text.indexOf(startAnchor);
  if (start < 0) {
    throw new Error(
      `harness: ${page} no longer contains the anchor ${JSON.stringify(startAnchor)}, so this cell cannot locate the sentence it governs — re-anchor the cell rather than letting it pass over an empty slice`,
    );
  }
  const rest = text.slice(start);
  const end = rest.slice(startAnchor.length).search(endPattern);
  return end < 0 ? rest : rest.slice(0, startAnchor.length + end);
}

/**
 * The corrected claim's stable marker: the chosen common type must be a MEMBER
 * of the contributing types (one of the arm types / one of the contributions),
 * not a union the contributions are merely contained in. Any of these spellings
 * discharges it; a sentence carrying none of them has not stated the narrower
 * discipline at all.
 */
const MEMBER_RESTRICTION = /\bmembers?\b|\bone of the (arm|contributing|return)/i;

// ===========================================================================
// Parse harness.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";

/** The two distinct named schemas rule 3's refusal is written about. */
const A_B_SCHEMAS = "schema A {\n  a: integer\n}\nschema B {\n  b: string\n}\n";

const ENV = {} as TypeEnv;

function parse(src: string): ThetaDocument {
  return parseDoc(FM + src, "bug0158.theta");
}

/** Every diagnostic rendered `severity code :: message`, in emission order. */
function hitsOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map(
    (d: Diagnostic) => `${d.severity} ${d.code} :: ${d.message}`,
  );
}

const MATCH_ROW = `error ${MATCH_MISMATCH_CODE} :: match arm body type does not match the common type of the other arms`;
const RETURN_ROW = `error ${RETURN_NO_COMMON_CODE} :: return operands have no common type; annotate the function return type or reconcile the operands`;
const ARRAY_ROW = `error theta/parse/array-no-common-type :: array elements have no common type; annotate the binding with array<A | B> or use a single schema`;

/** Count of `match` expressions anywhere in the source text of a fixture. */
function matchCount(src: string): number {
  return (src.match(/\bmatch\s/g) ?? []).length;
}

/**
 * The whole diagnostic list of `src`, with a loud precondition that the fixture
 * really contains the `match`/`return` construct the row is about — an absence
 * cell over a source that failed to parse into the construct is vacuous.
 */
function hits(cell: string, src: string, wantMatches: number): string[] {
  const doc = parse(src);
  expect(
    matchCount(src),
    `PRECONDITION (${cell}): the fixture must contain exactly ${wantMatches} \`match\` expression(s), or the row below measures a source without the construct under test. Source: ${JSON.stringify(src)}`,
  ).toBe(wantMatches);
  return hitsOf(doc);
}

// ===========================================================================
// Raw-type harness — the pass in isolation over the shipped `⊑` engine, the
// group-(t) shape tests/division-result-type-number.test.ts:583 establishes.
//
// The 0142 harness asserts its fixture parses with NO error-severity
// diagnostic. That precondition cannot be reused here: the checker still
// refuses a heterogeneous `match` on both sides of this fix (route B changes no
// behaviour at `leastUpperBound`), so the precondition below asserts the exact
// diagnostic set the row is about instead of its absence.
// ===========================================================================

function typeOfMatchTail(cell: string, src: string, wantHits: string[]): string {
  const doc = parse(src);
  expect(
    hitsOf(doc),
    `PRECONDITION (${cell}): the fixture must draw exactly the diagnostics this row is about, or the type read below is about a different program. Source: ${JSON.stringify(src)}`,
  ).toEqual(wantHits);
  const tail = doc.body.tail;
  expect(
    tail,
    `PRECONDITION (${cell}): the fixture must end in a trailing expression — that is the node the read is taken on. Diagnostics: ${JSON.stringify(hitsOf(doc))}`,
  ).not.toBeNull();
  expect(
    (tail as Expr).kind,
    `PRECONDITION (${cell}): the tail must be a \`match\` expression, or this cell reads a node whose type \`#typeExpr\`'s \`case "match"\` never answers. Diagnostics: ${JSON.stringify(hitsOf(doc))}`,
  ).toBe("match");
  const type = new StaticTypeInferencePass({ checkCompatible, enumNames: new Set() }).typeOf(
    tail as Expr,
    ENV,
  );
  return displayType(type);
}

// ===========================================================================
// Seam harness — the three LUB functions called directly with hand-built types.
// ===========================================================================

const RANGE: SourceRange = {
  start: { line: 4, column: 1 },
  end: { line: 4, column: 2 },
};
const SITE: MatchResultSite = { file: "bug0158.theta", range: RANGE };

const INTEGER: CompatType = { kind: "prim", name: "integer" };
const STRING: CompatType = { kind: "prim", name: "string" };
const NUMBER: CompatType = { kind: "prim", name: "number" };

// ===========================================================================
// Group (A) — corpus conformance. RED at this HEAD.
// ===========================================================================

describe("bug 0158 (A) — the corpus stops claiming the array/ternary discipline", () => {
  it("A1: the reference mirror's `match`/return sentence states the narrower, member-restricted LUB", () => {
    // docs/reference/type-system.md, §"Common-type rules (array literals &
    // ternary branches)". The block's last sentence currently reads "`match`
    // arms and inferred theta/`fn` return types use the same LUB discipline",
    // sitting directly under rule 2, whose union clause is exactly what those
    // two constructs do NOT do: `leastUpperBound` and `computeLub` are both
    // member-restricted (cells D3, tC2, tC4). Under route B the sentence is
    // replaced by one stating the narrower discipline — the chosen common type
    // is a member of the contributing types — and naming the two codes a
    // memberless set draws, where an array literal or ternary would union.
    // Both existing cross-links are kept.
    const text = corpus(TYPE_SYSTEM_MIRROR);
    const block = sliceFrom(
      TYPE_SYSTEM_MIRROR,
      text,
      "## Common-type rules",
      /\n## /,
    );
    expect(
      block,
      `A1 — ${TYPE_SYSTEM_MIRROR}'s common-type block still asserts that \`match\` arms and inferred returns "use the same LUB discipline" as the section it sits under, whose rule 2 unions. The two checker LUBs are member-restricted (${JSON.stringify(trigger(MATCH_MISMATCH_CODE))}), so the sentence reads false. Offending block: ${JSON.stringify(block)}`,
    ).not.toContain("use the same LUB discipline");
    expect(
      block,
      `A1 — the replacement sentence must state the MEMBER restriction (the chosen common type is one of the contributing types), which is what distinguishes it from rule 2's union. Block: ${JSON.stringify(block)}`,
    ).toMatch(MEMBER_RESTRICTION);
    for (const code of [MATCH_MISMATCH_CODE, RETURN_NO_COMMON_CODE]) {
      expect(
        block,
        `A1 — the replacement sentence must name \`${code}\` as what a set with no dominating member draws in these two positions (registered *Trigger*: ${JSON.stringify(trigger(code))}), so the reader learns where the narrower rule refuses. Block: ${JSON.stringify(block)}`,
      ).toContain(code);
    }
    for (const link of ["./grammar.md", "./errors-and-results.md"]) {
      expect(
        block,
        `A1 — both cross-links the replaced sentence carried must survive the correction; dropping ${link} loses a pointer this route was not asked to remove. Block: ${JSON.stringify(block)}`,
      ).toContain(link);
    }
  });

  it("A2: FN-3 borrows the `match`-arm discipline, not the array/ternary rule-2 union", () => {
    // docs/spec_topics/functions.md, FN-3 "Theta return type". Its
    // reconciliation clause currently borrows "the same common-upper-bound
    // discipline … that the spec already applies to `match` arms, ternary
    // branches, and array literals" — three constructs that no longer share one
    // discipline. `resolveReturnType`'s LUB is `computeLub`, a `types.find`
    // member search (cell tC4 measures its refusal), so an inferred return type
    // never unions and FN-3 must say which of the two disciplines it borrows.
    const text = corpus(FUNCTIONS_PAGE);
    const fn3 = sliceFrom(FUNCTIONS_PAGE, text, "**FN-3.**", /\n\n/);
    expect(
      fn3,
      `A2 — FN-3 (${FUNCTIONS_PAGE}) still borrows its discipline from "ternary branches, and array literals", whose rule-2 LUB unions; \`computeLub\` (src/parser/functions.ts) is a member search and refuses a memberless set with \`${RETURN_NO_COMMON_CODE}\` (registered *Trigger*: ${JSON.stringify(trigger(RETURN_NO_COMMON_CODE))}). Offending clause: ${JSON.stringify(fn3)}`,
    ).not.toContain("ternary branches, and array literals");
    expect(
      fn3,
      `A2 — the corrected FN-3 clause must state the MEMBER restriction it borrows from the \`match\`-arm rule (the chosen common type is one of the contributing types). Clause: ${JSON.stringify(fn3)}`,
    ).toMatch(MEMBER_RESTRICTION);
    expect(
      fn3,
      `A2 — the corrected FN-3 clause must say explicitly that an inferred return type does NOT union (the array-literal/ternary rule-2 behaviour it previously claimed), so the exclusion is stated rather than implied. Clause: ${JSON.stringify(fn3)}`,
    ).toMatch(/union/i);
  });

  it("A3: the arm-syntax parenthetical makes the chosen common type one of the arm types", () => {
    // docs/spec_topics/expressions.md, §"Arm syntax". "(every arm `⊑` the
    // chosen common type, …)" admits a union as written — `integer ⊑ integer |
    // string` under TYPE-5/6 — which is exactly the reading `leastUpperBound`
    // refuses (cells tC2/tC3). Under route B the parenthetical must say the
    // chosen common type is one of the ARM types.
    //
    // The sink half of the same parenthetical ("narrowed by any sink in scope on
    // the `match` expression itself") is deliberately NOT asserted on: 0158
    // §Non-goals leaves the dead sink arm open, so this cell neither pins it as
    // fixed nor claims a sink narrows a `match`.
    const text = corpus(EXPRESSIONS_PAGE);
    const arm = sliceFrom(EXPRESSIONS_PAGE, text, "**Arm syntax.**", /\n\n/);
    expect(
      arm,
      `A3 — the arm-syntax rule (${EXPRESSIONS_PAGE}) still says only "every arm \`⊑\` the chosen common type", which a union satisfies; \`leastUpperBound\` (src/parser/match-result.ts) restricts the answer to a member of the arm types and refuses otherwise with \`${MATCH_MISMATCH_CODE}\` (registered *Trigger*: ${JSON.stringify(trigger(MATCH_MISMATCH_CODE))}). Offending sentence: ${JSON.stringify(arm)}`,
    ).not.toContain("every arm `⊑` the chosen common type");
    expect(
      arm,
      `A3 — the corrected parenthetical must state that the chosen common type is one of the ARM types (a member every other arm is \`⊑\`), never a union the arms are merely contained in. Sentence: ${JSON.stringify(arm)}`,
    ).toMatch(MEMBER_RESTRICTION);
  });
});

// ===========================================================================
// Group (B) — inference agreement. RED at this HEAD.
//
// Expected values re-derived against an inline B7(i) prototype at
// `case "match"` (dominating member, else the first candidate), then the
// prototype reverted byte-exact and hash-verified against
// `git rev-parse HEAD:src/parser/static-type-inference.ts`.
// ===========================================================================

describe("bug 0158 (B) — the inference pass reduces `match` arms the way the checker does", () => {
  it("B1: `match 1 { 1 => 1, _ => \"a\" }` types as `integer`, not `integer | string`", () => {
    // The report's headline row (§Reproduction t1). No member of
    // `[integer, string]` dominates the other, so the dominating-member
    // discipline has no candidate — and the inference pass, which owes the walk
    // a type, answers the first arm type. `integer | string` is the union
    // `commonType` computes and `checkMatchArmTypes` refuses on the same node
    // (cells tC2/tC3), which is the divergence this cell closes.
    expect(
      typeOfMatchTail("B1", 'match 1 { 1 => 1, _ => "a" }', [MATCH_ROW]),
      "B1 — `#typeExpr`'s `case \"match\"` must not answer a union no checker LUB admits: `leastUpperBound` returns `undefined` for these arm types, so the pass owes the walk the dominating-member reduction (here the first candidate, `integer`), not `integer | string`.",
    ).toBe("integer");
  });

  it("B2: `match 1 { 1 => \"a\", _ => null }` types as `string`", () => {
    // The spec's own worked vector `["a", null] → string | null` (§Reproduction
    // v3). It unions in an array literal (row v1, group (C)) and must not union
    // at a `match`: no member of `[string, null]` dominates, so the fallback is
    // the first candidate.
    expect(
      typeOfMatchTail("B2", 'match 1 { 1 => "a", _ => null }', [MATCH_ROW]),
      "B2 — the array-literal vector `[\"a\", null] → array<string | null>` is rule 2's union and stays (row v1); at a `match` the same set has no dominating member, so the pass answers the first candidate `string`.",
    ).toBe("string");
  });

  it("B3: the dominating control still reduces to the dominating member", () => {
    // §Reproduction t2/t3. The fix must change nothing where a member DOES
    // dominate: this is the half of `case "match"` that already agrees with
    // `leastUpperBound`, and a route-B(i) reduction that lost it would break
    // every admitted `match` in the corpus (group (E)).
    expect(
      typeOfMatchTail("B3", "match 1 { 1 => 1, _ => 2 }", []),
      "B3 — identical arm types collapse (TYPE-1); the dominating case is unmoved by this route.",
    ).toBe("integer");
    expect(
      typeOfMatchTail("B3", "match 1 { 1 => 1, _ => 2.5 }", []),
      "B3 — `integer` widens to `number` (TYPE-2) and `number` is a MEMBER of the arm types, so the member-restricted reduction answers it exactly as the union LUB did.",
    ).toBe("number");
  });

  it("B4: the call-argument sink stops rendering a union it never had (p9)", () => {
    // §Reproduction p9. `fn h(p: integer)` called with a heterogeneous `match`:
    // the union reaches `theta/parse/fn-arg-type-mismatch`'s `<actual>` as
    // `integer | string` and adds a code the pre-0081 `integer` answer did not
    // draw. Under B7(i) the argument reads `integer`, satisfies the parameter,
    // and the `match` row stands ALONE — the diagnostic-count question at this
    // sink stays bug 0129's, but the count is measured here rather than assumed.
    expect(
      hits(
        "B4",
        'fn h(p: integer) { p }\nlet r = h(match 1 { 1 => 1, _ => "a" })\nr',
        1,
      ),
      "B4 — exactly one diagnostic, the `match` row. `theta/parse/fn-arg-type-mismatch` fires today only because `typeOf` handed the argument a union the checker refuses on the very same node; with the pass agreeing, the argument type is `integer` and the parameter is satisfied.",
    ).toEqual([MATCH_ROW]);
  });

  it("B5: the binary-operand sink stops rendering a union it never had (p14)", () => {
    // §Reproduction p14. `1 + match …`: `theta/parse/mixed-plus-operands`
    // renders `integer and integer | string`. Under B7(i) both operands read
    // `integer`, so `+` is homogeneous and the `match` row stands alone.
    expect(
      hits("B5", 'let n = 1 + match 1 { 1 => 1, _ => "a" }\nn', 1),
      "B5 — exactly one diagnostic, the `match` row. The mixed-operand code exists only because the union reached `#typeBinary`'s operand read; the dominating-member reduction makes both operands `integer`.",
    ).toEqual([MATCH_ROW]);
  });
});

// ===========================================================================
// Group (C) — behaviour pins. GREEN before and after.
// ===========================================================================

describe("bug 0158 (C/a) — the array and ternary routes union, and keep unioning", () => {
  it("n1/n2: `[1, \"a\"]` and `true ? 1 : \"a\"` load clean", () => {
    // Rule 2's union clause (bug 0081's shipped behaviour). Route B corrects the
    // sentence that over-claimed its reach; it does not touch the rule.
    expect(
      hits("n1", 'let x = [1, "a"]\nx', 0),
      "n1 — the array literal unions under rule 2 and draws nothing; this is the discipline the corrected sentences scope to array/ternary.",
    ).toEqual([]);
    expect(
      hits("n2", 'let t = true ? 1 : "a"\nt', 0),
      "n2 — the ternary reduces under rule 2 (bug 0155's settled disposition) and draws nothing. 0158 edits no ternary-facing code, so this row must be byte-unchanged.",
    ).toEqual([]);
  });

  it("v1/v2: the spec's worked vector `[\"a\", null]` loads on both routes", () => {
    expect(
      hits("v1", 'let x = ["a", null]\nx', 0),
      "v1 — `array<string | null>` is the spec's own worked rule-2 vector and stays.",
    ).toEqual([]);
    expect(
      hits("v2", 'let t = true ? "a" : null\nt', 0),
      "v2 — the ternary twin of v1, unchanged by this route.",
    ).toEqual([]);
  });

  it("o1/o2: rule 3 refuses at the array literal and reports nothing at the ternary", () => {
    expect(
      hits("o1", `${A_B_SCHEMAS}let x = [A { a: 1 }, B { b: "s" }]\nx`, 0),
      `o1 — two named schemas with no dominator is rule 3, i.e. exactly ${JSON.stringify(trigger("theta/parse/array-no-common-type"))}; the refusal must survive this route.`,
    ).toEqual([ARRAY_ROW]);
    expect(
      hits("o2", `${A_B_SCHEMAS}let t = true ? A { a: 1 } : B { b: "s" }\nt`, 0),
      "o2 — bug 0155's row, settled in its §Fix (0.174.0) route (b): a ternary reports no code of its own and the branch pair reduces to the first branch. 0158 must not move it.",
    ).toEqual([]);
  });

  it("d1–d4: the dominating candidate set admits on all four routes", () => {
    expect(hits("d1", "let x = [1, 2.5]\nx", 0), "d1 — TYPE-2 widening, array.").toEqual([]);
    expect(hits("d2", "let t = true ? 1 : 2.5\nt", 0), "d2 — TYPE-2 widening, ternary.").toEqual([]);
    expect(
      hits("d3", "let m = match 1 { 1 => 1, _ => 2.5 }\nm", 1),
      "d3 — `number` is a member of the arm types, so the member-restricted LUB admits it; the dominating case is what all three LUBs already agree on.",
    ).toEqual([]);
    expect(
      hits("d4", "fn g() {\n  if true { return 1 }\n  2.5\n}\ng()", 0),
      "d4 — `computeLub` finds `number` among the contributions, so the inferred return type exists and nothing is refused.",
    ).toEqual([]);
  });
});

describe("bug 0158 (C/b) — the `match` and `fn`-return routes keep refusing", () => {
  it("n3/n4: the heterogeneous candidate set is refused at both positions", () => {
    expect(
      hits("n3", 'let m = match 1 { 1 => 1, _ => "a" }\nm', 1),
      "n3 — route B changes no behaviour: `leastUpperBound` stays member-restricted, so the row still fires. This is the pin that separates route B from route A, which would empty this list.",
    ).toEqual([MATCH_ROW]);
    expect(
      hits("n4", 'fn g() {\n  if true { return 1 }\n  "a"\n}\ng()', 0),
      "n4 — the `fn`-return twin: `computeLub` finds no dominating contribution and `resolveReturnType` answers `inference-no-common-type`.",
    ).toEqual([RETURN_ROW]);
  });

  it("v3/v4: the worked vector is refused at both positions", () => {
    expect(
      hits("v3", 'let m = match 1 { 1 => "a", _ => null }\nm', 1),
      "v3 — the divergence 0158 documents is RATIFIED, not removed: the array spelling (v1) unions, the `match` spelling refuses, and the corrected sentences now say so.",
    ).toEqual([MATCH_ROW]);
    expect(
      hits("v4", 'fn g() {\n  if true { return "a" }\n  null\n}\ng()', 0),
      "v4 — the `fn`-return twin of v3.",
    ).toEqual([RETURN_ROW]);
  });

  it("o3/o4: rule 3's set is refused at both positions", () => {
    expect(
      hits("o3", `${A_B_SCHEMAS}let m = match 1 { 1 => A { a: 1 }, _ => B { b: "s" } }\nm`, 1),
      "o3 — the one candidate set on which all three LUBs already agree to refuse; it must keep refusing (§Expected behaviour property 2).",
    ).toEqual([MATCH_ROW]);
    expect(
      hits("o4", `${A_B_SCHEMAS}fn g() {\n  if true { return A { a: 1 } }\n  B { b: "s" }\n}\ng()`, 0),
      "o4 — the `fn`-return twin of o3.",
    ).toEqual([RETURN_ROW]);
  });

  it("s1/s2: no author-side sink suppresses the `match` row", () => {
    // §Reproduction (s). The walk hard-codes `sink: undefined`, so
    // `checkMatchArmTypes`'s sink arm is unreachable from source. These two rows
    // pin that route B does not accidentally open the escape hatch 0158
    // §Non-goals leaves for another report — they assert the row still fires,
    // NOT that a sink narrows anything.
    expect(
      hits("s1", 'let m: integer | string = match 1 { 1 => 1, _ => "a" }\nm', 1),
      "s1 — a union annotation on the `let` does not reach the `match` arm check; the row fires and this route leaves that as it is.",
    ).toEqual([MATCH_ROW]);
    expect(
      hits("s2", 'fn h(p: integer | string) { p }\nlet r = h(match 1 { 1 => 1, _ => "a" })\nr', 1),
      "s2 — the `fn`-parameter union sink likewise does not reach it; exactly one diagnostic, the `match` row.",
    ).toEqual([MATCH_ROW]);
  });

  it("w9/w10: the two positions that could have escaped the walk do not", () => {
    expect(
      hits("w9", 'fn g(): integer { return match 1 { 1 => 1, _ => "a" } }\ng()', 1),
      "w9 — an annotated `fn` bypasses `computeLub`, but the `match` node is still walked, so the arm check runs; this is the no-false-`E` fence route B relies on staying in place.",
    ).toEqual([MATCH_ROW]);
    expect(
      hits("w10", 'fn g() { match 1 { 1 => 1, _ => "a" } }\n1',  1),
      "w10 — an uncalled `fn` is walked too, so no heterogeneous `match` reaches registration unreported.",
    ).toEqual([MATCH_ROW]);
  });

  it("e2: an explicit union return annotation bypasses inference and reports nothing", () => {
    // §Non-goals: e2 loads because the walk discards the annotated-`fn`
    // `operandResults` and no registry row covers the slot — NOT because the
    // annotation narrows. Pinned so the fix does not close that gap as a side
    // effect and does not treat this silence as a working sink.
    expect(
      hits("e2", 'fn g(): integer | string {\n  if true { return 1 }\n  "a"\n}\ng()', 0),
      "e2 — the annotation bypasses `resolveReturnType`'s inference arm and the `\"checked\"` results are discarded for a non-`subagent` annotated `fn`; the silence is an unrelated open gap, not a narrowing.",
    ).toEqual([]);
  });

  it("r1/r2: an error-severity `theta/parse/*` blocks registration", () => {
    // `hasLoadParseError` (src/extension/production-composition.ts) refuses
    // registration for any error-severity `theta/load/` or `theta/parse/` code.
    // That predicate is why no runtime, binder or wire surface ever reads the
    // divergent type, and it is the reason 0158 is a spec defect rather than a
    // wrong-value bug.
    const refused = parse('let m = match 1 { 1 => 1, _ => "a" }\nm');
    const registers = parse("let m = match 1 { 1 => 1, _ => 2 }\nm");
    const errorCodes = (doc: ThetaDocument): string[] =>
      doc.diagnostics
        .filter(
          (d: Diagnostic) =>
            d.severity === "error" &&
            (d.code.startsWith("theta/parse/") || d.code.startsWith("theta/load/")),
        )
        .map((d: Diagnostic) => d.code);
    expect(
      errorCodes(refused),
      "r1 — exactly one error-severity `theta/parse/*` code, so `hasLoadParseError` is true and the heterogeneous `match` never registers.",
    ).toEqual([MATCH_MISMATCH_CODE]);
    expect(
      errorCodes(registers),
      "r2 — the dominating twin carries no error-severity parse code, so it registers; r1/r2 together are the gate this report's S4 severity rests on.",
    ).toEqual([]);
  });
});

describe("bug 0158 (C/c) — the three LUB seams, called directly", () => {
  it("tC2/tC3: `checkMatchArmTypes([integer, string])` has no LUB and fires the row", () => {
    const result = checkMatchArmTypes({
      armTypes: [INTEGER, STRING],
      sink: undefined,
      env: ENV,
      site: SITE,
    });
    expect(
      result.lub,
      `tC2 — \`leastUpperBound\` restricts the answer to a MEMBER of the arm types and neither dominates, so the LUB is absent. Route B ratifies this; route A would have made it the union. Registered *Trigger*: ${JSON.stringify(trigger(MATCH_MISMATCH_CODE))}`,
    ).toBeUndefined();
    expect(
      result.diagnostics.map((d) => `${d.severity} ${d.code} :: ${d.message}`),
      "tC3 — the absent LUB is reported as exactly one `theta/parse/match-arm-type-mismatch`, with the registry's *Message*.",
    ).toEqual([MATCH_ROW]);
  });

  it("tC4: `resolveReturnType` over integer+string contributions has no common type", () => {
    const resolved = resolveReturnType({
      contributions: [
        { kind: "plain", type: INTEGER },
        { kind: "plain", type: STRING },
      ],
      hasQuestion: false,
      env: ENV,
      site: SITE,
    });
    expect(
      resolved.kind,
      `tC4 — \`computeLub\`'s \`types.find\` member search finds no dominating contribution, so the resolver answers the no-common-type outcome that carries \`${RETURN_NO_COMMON_CODE}\`. Registered *Trigger*: ${JSON.stringify(trigger(RETURN_NO_COMMON_CODE))}`,
    ).toBe("inference-no-common-type");
    expect(
      resolved.kind === "inference-no-common-type"
        ? `${resolved.diagnostic.severity} ${resolved.diagnostic.code} :: ${resolved.diagnostic.message}`
        : "<no diagnostic>",
      "tC4 — the diagnostic carries the registry's code and *Message* verbatim.",
    ).toBe(RETURN_ROW);
  });

  it("tC5/tC6: on a dominating set all three LUBs agree", () => {
    // The control that makes the divergence a divergence: hold the input
    // dominating and the union LUB, the `match` LUB and the return LUB answer
    // the same type. This is why no admitted program observes the defect, and
    // it must be unchanged by either route.
    const resolved = resolveReturnType({
      contributions: [
        { kind: "plain", type: INTEGER },
        { kind: "plain", type: NUMBER },
      ],
      hasQuestion: false,
      env: ENV,
      site: SITE,
    });
    expect(
      resolved.kind === "inferred" ? displayType(resolved.inferred.payload) : resolved.kind,
      "tC5 — `computeLub` finds `number` among the contributions, so the return type is inferred, not refused.",
    ).toBe("number");
    const union = commonType([INTEGER, NUMBER], ENV, checkCompatible);
    expect(
      union === undefined ? "<undefined>" : displayType(union),
      "tC6 — the shared array/ternary `commonType` answers the same `number` on the same input: clause 1 (a dominating branch) fires before the union clause.",
    ).toBe("number");
    const armCheck = checkMatchArmTypes({
      armTypes: [INTEGER, NUMBER],
      sink: undefined,
      env: ENV,
      site: SITE,
    });
    expect(
      armCheck.lub === undefined ? "<undefined>" : displayType(armCheck.lub),
      "tC6 — and so does the `match`-arm LUB, with no diagnostic: three LUBs, one answer, whenever a member dominates.",
    ).toBe("number");
    expect(armCheck.diagnostics, "tC6 — a dominating arm set draws nothing.").toEqual([]);
  });
});

// ===========================================================================
// Group (D) — structural / *Trigger*-fidelity pins.
// ===========================================================================

describe("bug 0158 (D) — the *Trigger*s govern, and `src/` matches them", () => {
  it("D1 (control): both registered *Trigger*s still read to the dominating semantics", () => {
    // THE STATED LAW's governing limb. These two texts are the reason route B
    // corrects the rule pages rather than the implementation: the *Trigger* is
    // the normative statement of the emission set, and both already describe a
    // memberless set as having no common type. If either text drifts to the
    // union reading, this route's premise is gone and the correction must be
    // re-adjudicated — hence a cell, not an assumption.
    expect(
      trigger(MATCH_MISMATCH_CODE),
      `D1 — \`${MATCH_MISMATCH_CODE}\`'s registered *Trigger* must keep measuring an arm body against "the common type of the other arms" (a member of the arm types), which is what \`leastUpperBound\` implements. Registered: ${JSON.stringify(trigger(MATCH_MISMATCH_CODE))}`,
    ).toContain("the common type of the other arms");
    expect(
      trigger(RETURN_NO_COMMON_CODE),
      `D1 — \`${RETURN_NO_COMMON_CODE}\`'s registered *Trigger* must keep describing contributions that "share no common upper bound", the condition \`computeLub\` answers \`undefined\` for. Registered: ${JSON.stringify(trigger(RETURN_NO_COMMON_CODE))}`,
    ).toContain("share no common upper bound");
  });

  it("D2: `#typeExpr`'s `case \"match\"` does not route arm types through the union LUB", () => {
    // B7 option (i). `#commonType` delegates to the exported `commonType`
    // (src/parser/type-compat.ts), whose clause 2 unions; routing arm types
    // through it is how the pass came to answer a type no checker LUB admits.
    // The cell asserts the wiring, not a particular replacement: a dominating
    // member reduction inline or in a private helper both satisfy it, so long as
    // the union LUB is not the one consulted at this node kind.
    const text = corpus("src/parser/static-type-inference.ts");
    const start = text.indexOf('case "match":');
    if (start < 0) {
      throw new Error(
        'harness: src/parser/static-type-inference.ts no longer contains `case "match":` in `#typeExpr` — re-anchor this cell rather than letting it pass over an empty slice (bug 0134 covers the line drift, not the disappearance of the anchor)',
      );
    }
    const rest = text.slice(start);
    const end = rest.slice('case "match":'.length).indexOf('\n      case "');
    const block = end < 0 ? rest : rest.slice(0, 'case "match":'.length + end);
    expect(
      block,
      `D2 — the \`case "match"\` block must not consult \`#commonType\` / \`commonType\`: that is the array/ternary union LUB (rule 2), and the checker's \`match\` LUB \`leastUpperBound\` is member-restricted, so routing arm types through it makes \`typeOf\` answer a type \`checkMatchArmTypes\` refuses on the very same node. Offending block: ${JSON.stringify(block)}`,
    ).not.toMatch(/commonType\s*\(/);
    expect(
      block,
      "D2 — non-vacuity: the block must still reduce the ARM BODY types (`node.arms`), or this cell would pass over a `case` that stopped typing the arms at all.",
    ).toContain("node.arms");
  });

  it("D3: the checker's `match` LUB stays member-restricted", () => {
    // `leastUpperBound` (src/parser/match-result.ts) filters the candidate set
    // down to MEMBERS of the arm types and answers `undefined` when none
    // dominates. Route B ratifies that as the discipline the corrected sentences
    // describe (and B5 adds the divergence note `computeLub` already carries),
    // so the restriction itself must still be there — a cell, because it is now
    // load-bearing prose as well as code.
    const text = corpus("src/parser/match-result.ts");
    expect(
      text,
      `D3 — \`leastUpperBound\` must keep restricting the LUB to a member of the arm types (\`armTypes.filter(covers)\`); without it the corrected sentences assert a discipline the code no longer implements. Registered *Trigger*: ${JSON.stringify(trigger(MATCH_MISMATCH_CODE))}`,
    ).toContain("armTypes.filter(covers)");
    expect(
      text,
      "D3 — and it must keep answering `undefined` for a memberless set, which is the value `checkMatchArmTypes` turns into the registered row.",
    ).toMatch(/candidates\.length === 0\)\s*\{\s*return undefined;/);
  });
});

// ===========================================================================
// Group (E) — GOV-15 corpus census, measured at THIS HEAD.
// ===========================================================================

/** Every committed theta source, as repo-relative POSIX paths (the git index). */
function committedThetaSources(): string[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "*.theta", "*.thetalib"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "harness: the census corpus is the git index (`git ls-files '*.theta' '*.thetalib'`), so the unmet precondition is a working `git` executable plus a repository checkout at the test root — never a skip. " +
        `status=${String(result.status)} error=${result.error?.message ?? "none"} stderr=${result.stderr}`,
    );
  }
  return result.stdout
    .split("\0")
    .filter((p) => p.length > 0)
    .sort();
}

/** Load/parse diagnostic codes of one committed source, through the shipped pipeline. */
function committedCodes(relPath: string): string[] {
  const bytes = new Uint8Array(readFileSync(REPO_ROOT + relPath));
  const source: ThetaSource = { path: relPath, bytes };
  const deps = parseDeps();
  const lex = lexTheta(source, deps.systemNote);
  const doc = parseThetaDocument(source, deps);
  return [...lex.diagnostics, ...doc.diagnostics].map((d: Diagnostic) => d.code);
}

describe("bug 0158 (E) — GOV-15: no committed source's diagnostic sequence can move", () => {
  it("E1: the committed corpus draws neither code", () => {
    // Re-measured at this HEAD, not copied from §Reproduction (g) (sibling lanes
    // land `.theta` files). GOV-15's promise ranges over inputs that load with no
    // `E` (docs/spec_topics/governance/source-language-stability.md); with zero
    // committed sources drawing either code, route B's ratification of the
    // refusal cannot move a corpus observable in either direction.
    const files = committedThetaSources();
    expect(
      {
        theta: files.filter((p) => p.endsWith(".theta")).length,
        thetalib: files.filter((p) => p.endsWith(".thetalib")).length,
      },
      "E1 — the census must be the whole committed corpus of both extensions; a shrunken discovery would green the cell below over fewer files. Re-measure and re-pin in the same commit that adds or removes a committed theta source.",
    ).toEqual({ theta: 32, thetalib: 2 });
    const withMatch = files.filter((p) =>
      readFileSync(REPO_ROOT + p, "utf8").includes("match "),
    );
    expect(
      withMatch,
      "E1 — non-vacuity: the corpus must still contain AT LEAST these committed `match` sources, whose arms all share a dominating member, or the census below is silent for want of a `match` rather than for want of a defect. A superset is conformant — a sibling lane landing a further well-formed `match` example strengthens the census; a MISSING path here is the red this cell names.",
    ).toEqual(expect.arrayContaining([
      "docs/examples/configure-tool-loop.theta",
      "docs/examples/fan-out-reviews.theta",
      "docs/examples/handle-error.theta",
      "tests/live/acceptance/fixtures/acc-match-queryerror.theta",
    ]));
    const drawing = files.filter((p) => {
      const codes = committedCodes(p);
      return (
        codes.includes(MATCH_MISMATCH_CODE) || codes.includes(RETURN_NO_COMMON_CODE)
      );
    });
    expect(
      drawing,
      `E1 — zero committed sources may draw \`${MATCH_MISMATCH_CODE}\` or \`${RETURN_NO_COMMON_CODE}\`; every committed \`match\` has arms sharing a dominating member and every committed \`return\` a dominating contribution, so no committed source's diagnostic sequence moves under this route.`,
    ).toEqual([]);
  });
});
