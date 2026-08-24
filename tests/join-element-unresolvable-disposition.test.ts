import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0127 — `join`'s element gate does not defer on an unresolvable element
// type, while `join`'s RECEIVER does. The two levels of one gate disagree, and
// `docs/spec_topics/type-system.md` line 48 (§"Type compatibility",
// *Unresolvable operands*) closes on "The `for` iterand's `array<T>`
// precondition and `join`'s element precondition are not on the check-site list
// above, are not compatibility checks and are outside this paragraph, and take
// their own dispositions." — naming a disposition it never states (bug 0144).
//
// THE OPERATOR RULING THIS FILE WITNESSES — route (c) of that report's §Fix:
// the shipped two-level asymmetry at `join` is INTENDED and becomes normative.
// The element precondition JUDGES AND REFUSES a provably-unresolvable element
// type (the elements are what `join` consumes, so a provably-broken element
// list is a provable author error at that call), while the receiver keeps the
// general *Unresolvable operands* deferring disposition. ZERO behaviour change;
// two normative sentences appended in place to
// `docs/spec_topics/type-system.md` line 48 land it. Route (a) — defer on
// elements, which would weaken bug 0089's pinned rows b12/b13 in
// `tests/fn-param-alias-unfolded-at-gates.test.ts` — and route (b) — judge the
// receiver, which would refuse three currently-clean programs — are REJECTED.
//
// ===========================================================================
// CONTENTS (b0127) — which cells RED at HEAD and which are GREEN before AND
// after, stated up front so a reader is never guessing what is measured:
//
//   §(A) CORPUS CONFORMANCE — the only cells this adjudication moves.
//        A1  RED at HEAD  — `docs/spec_topics/type-system.md` carries SENTENCE 1
//                           (the element judges) verbatim.
//        A2  RED at HEAD  — the same file carries SENTENCE 2 (the receiver
//                           defers) verbatim.
//        A3  GREEN before and after — bug 0144's "take their own dispositions"
//                           clause SURVIVES; the two sentences COMPLETE it,
//                           they do not displace it.
//        A4  GREEN before and after — NO registry edit: the
//                           `theta/parse/non-string-array-join` and
//                           `theta/parse/unknown-method` *Trigger*s are
//                           byte-unchanged. Under DIAG-2
//                           (`docs/spec_topics/diagnostics/diagnostic-shape.md`
//                           line 72) a *Trigger* change is a spec change; route
//                           (c) makes none. Reds if a fixer reaches for the
//                           registry instead of the prose.
//        A5  GREEN before and after — NO `docs/spec_topics/expressions.md`
//                           edit: the `join` member row's Semantics text and the
//                           empty-literal sentence at
//                           `docs/spec_topics/expressions.md` line 222 are
//                           byte-unchanged.
//
//   §(B) BEHAVIOUR PINS — GREEN before and after, by construction: route (c)
//        changes no observable, so every row pins the CURRENT emission
//        sequence. These are the correspondence with bug 0089's pinned cells.
//        A future wiring of an element-level deferral reds them, which is the
//        point.
//
//   §(C) NON-DISPLACEMENT PIN — GREEN before and after: bug 0089's witness file
//        `tests/fn-param-alias-unfolded-at-gates.test.ts` still carries its
//        `b12` and `b13` `toEqual` expectations with their current values, so
//        route (a) is provably not taken.
// ===========================================================================
//
// THE RECONCILIATION §(A5) exists to guard. `docs/spec_topics/expressions.md`
// line 222 says an unsunk `[]` types as `array<unknown>` and that "consumers of
// that element defer under" *Unresolvable operands*. That is not in tension
// with SENTENCE 1: the `join` element precondition is expressly OUTSIDE the
// *Unresolvable operands* paragraph, so it is not one of the deferring
// consumers named there — and the sentinel `array<unknown>` is squarely IN the
// refused class, which §(B) row S5 measures directly.
//
// HARNESS — `parseDoc` (`tests/helpers/e2e-s1.ts` line 39) over the shipped
// whole-file entry point `parseThetaDocument`, frontmatter `---\nmode: prompt\n
// ---`. `codes()` is the WHOLE unfiltered `doc.diagnostics` list in emission
// order, compared with `toEqual` — never a containment matcher, so a spurious
// extra diagnostic cannot hide. Every asserted message text is sourced from the
// registry *Message* column through `registryMessage` per DIAG-4
// (`docs/spec_topics/diagnostics/diagnostic-shape.md` line 74); a missing row
// throws naming the registry page.
//
// TIER — unit, offline, provider-free, deterministic. Every §(A)/§(C) claim is
// a read of a real file off the live tree; every §(B) claim settles inside one
// `parseThetaDocument` call over a source string. An integration tier would add
// a discovery/session round trip to a parse-time observable and buy no reach; a
// live tier would make a static, fully determined observable stochastic.
//
// NO SILENT SKIPPING (CLAUDE.md): nothing here early-returns, branches on the
// environment, or conditionally skips. An unreadable corpus file, a missing
// registry row and an unlocatable `it(` block each FAIL LOUDLY naming the unmet
// precondition.

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** A corpus file's bytes, read off the live tree so no cell asserts a snapshot. */
function corpus(rel: string): string {
  const abs = path.join(REPO_ROOT, rel);
  const text = readFileSync(abs, "utf8");
  if (text.length === 0) {
    throw new Error(
      `harness: ${rel} read empty, so the conformance cell below would range over no prose — a loud failure, never a vacuous pass`,
    );
  }
  return text;
}

// ===========================================================================
// (A) CORPUS CONFORMANCE — A1/A2 RED at HEAD; A3/A4/A5 GREEN before and after.
// ===========================================================================

/** The spec topic the whole adjudication lands in — its line 48 is the paragraph. */
const TYPE_SYSTEM = "docs/spec_topics/type-system.md";

/**
 * SENTENCE 1 — the element judges. Appended in place to the single-line
 * *Unresolvable operands* paragraph at `docs/spec_topics/type-system.md` line
 * 48. Typographic em dashes are load-bearing bytes here.
 */
const SENTENCE_1 =
  "`join`'s element precondition takes the judging disposition: an element type the parser provably cannot resolve — a `named` that no visible declaration defines, as distinct from a read whose type is merely withheld — is a non-`string` element type and is refused as `theta/parse/non-string-array-join`, because the elements are what `join` consumes and a provably-unresolvable element list is a provable author error at that call even where the receiver as a whole would defer.";

/** SENTENCE 2 — the receiver defers, and the asymmetry is by rule. */
const SENTENCE_2 =
  "The `join` receiver is outside that judgement and keeps this paragraph's deferring disposition: a receiver past the parser's static view is not statically an `array<T>`, so it draws no `join` diagnostic and defers, which makes the two levels of the one gate asymmetric by rule — the element judges and refuses, the receiver defers.";

/** The *Unresolvable operands* paragraph's opening — the region both sentences land in. */
const PARAGRAPH_OPENER = "**Unresolvable operands.**";

/**
 * The single line the paragraph occupies, so a cell cannot be satisfied by the
 * sentence appearing somewhere else on the page. Fails loudly if the paragraph
 * is no longer one line.
 */
function unresolvableOperandsLine(): { readonly line: string; readonly lineNumber: number } {
  const lines = corpus(TYPE_SYSTEM).split("\n");
  const index = lines.findIndex((l) => l.startsWith(PARAGRAPH_OPENER));
  if (index < 0) {
    throw new Error(
      `harness: ${TYPE_SYSTEM} carries no line beginning ${JSON.stringify(PARAGRAPH_OPENER)}, so the region every §(A) cell scopes to does not exist — a loud failure, never a vacuous pass`,
    );
  }
  return { line: lines[index] as string, lineNumber: index + 1 };
}

describe("bug 0127 (A) — the ruling's two sentences land on the *Unresolvable operands* paragraph", () => {
  it("A1: type-system.md's *Unresolvable operands* paragraph carries SENTENCE 1 — the element JUDGES", () => {
    const { line, lineNumber } = unresolvableOperandsLine();
    expect(
      line.includes(SENTENCE_1),
      `A1: ${TYPE_SYSTEM} line ${lineNumber} (the *Unresolvable operands* paragraph, at ${TYPE_SYSTEM} line 48 at the head this file was written against) does not carry SENTENCE 1 verbatim. Route (c) makes the shipped element-level refusal NORMATIVE, and until this sentence is written the corpus names \`join\`'s element disposition (bug 0144's "take their own dispositions") without ever stating it. Missing sentence: ${JSON.stringify(SENTENCE_1)}`,
    ).toBe(true);
  });

  it("A2: the same paragraph carries SENTENCE 2 — the receiver DEFERS, and the asymmetry is by rule", () => {
    const { line, lineNumber } = unresolvableOperandsLine();
    expect(
      line.includes(SENTENCE_2),
      `A2: ${TYPE_SYSTEM} line ${lineNumber} (the *Unresolvable operands* paragraph, at ${TYPE_SYSTEM} line 48 at the head this file was written against) does not carry SENTENCE 2 verbatim. SENTENCE 1 alone leaves the RECEIVER level unstated, which is the half bug 0127 reported as an unexplained asymmetry; both sentences are required for the ruling to be readable off the page. Missing sentence: ${JSON.stringify(SENTENCE_2)}`,
    ).toBe(true);
  });

  it("A3: bug 0144's 'take their own dispositions' clause SURVIVES — the sentences complete it", () => {
    // GREEN before and after. The two new sentences NAME the disposition the
    // clause promises; a correction that deletes the clause instead of
    // completing it discharges bug 0144 by erasing its subject and detaches
    // `join`'s element precondition from the paragraph that excludes it.
    const clause =
      "are not on the check-site list above, are not compatibility checks and are outside this paragraph, and take their own dispositions";
    const { line, lineNumber } = unresolvableOperandsLine();
    expect(
      line.includes(clause),
      `A3: ${TYPE_SYSTEM} line ${lineNumber} must KEEP ${JSON.stringify(clause)}. It is the clause bug 0144 filed and the clause SENTENCE 1 and SENTENCE 2 complete by naming the disposition; the ruling is "this completes the clause", not "this replaces it".`,
    ).toBe(true);
  });

  it("A4: NO registry edit — both *Trigger*s are byte-unchanged under DIAG-2", () => {
    // GREEN before and after. Route (c) settles the question in prose, over
    // behaviour the registered *Trigger* already licenses ("an array whose
    // element type is not `string`" — an unresolvable `named` is not `string`).
    // Under DIAG-2 (`docs/spec_topics/diagnostics/diagnostic-shape.md` line 72)
    // a *Trigger* change is a spec change; this route makes none. This cell
    // reds if a fixer reaches for the registry.
    const rel = "docs/spec_topics/diagnostics/code-registry-parse.md";
    const text = corpus(rel);
    const joinTrigger =
      "`arr.join(...)` invoked on an array whose element type is not `string`.";
    expect(
      text.includes(joinTrigger),
      `A4: ${rel} line 46's \`theta/parse/non-string-array-join\` *Trigger* must read ${JSON.stringify(joinTrigger)} verbatim. It is already broad enough for the element disposition SENTENCE 1 states — an unresolvable \`named\` is not \`string\` — so route (c) needs no DIAG-2 change (${rel} sibling rule at docs/spec_topics/diagnostics/diagnostic-shape.md line 72).`,
    ).toBe(true);
    const unknownMethodTrigger =
      "Method or property accessed on a built-in type that the theta 1.0 stdlib does not expose.";
    expect(
      text.includes(unknownMethodTrigger),
      `A4: ${rel} line 70's \`theta/parse/unknown-method\` *Trigger* must read ${JSON.stringify(unknownMethodTrigger)} verbatim. It is the row a receiver-level refusal (route (b)) would have had to be routed through or reworded around; route (b) is REJECTED, so this row does not move either.`,
    ).toBe(true);
  });

  it("A5: NO expressions.md edit — the `join` row and the empty-literal sentence are byte-unchanged", () => {
    // GREEN before and after. THE RECONCILIATION: `docs/spec_topics/
    // expressions.md` line 222 says an unsunk `[]` types as `array<unknown>`
    // and that "consumers of that element defer under" *Unresolvable operands*.
    // SENTENCE 1 does not contradict it, because the `join` element
    // precondition is expressly OUTSIDE that paragraph and so is not one of the
    // deferring consumers; the `array<unknown>` sentinel is IN the refused
    // class, which §(B) row S5 measures.
    const rel = "docs/spec_topics/expressions.md";
    const text = corpus(rel);
    const joinRow =
      "Concatenates elements with `sep`. Element type must be `string`; non-string element types are `theta/parse/non-string-array-join` (no implicit type conversion in theta 1.0)";
    expect(
      text.includes(joinRow),
      `A5: ${rel} line 108's \`join(sep)\` member row Semantics must survive byte-identical: ${JSON.stringify(joinRow)}. Route (c) states the element/receiver split on the type-system page and touches no other corpus file.`,
    ).toBe(true);
    const emptyLiteral =
      "consumers of that element defer under [Type System — Type compatibility](./type-system.md#type-compatibility) (*Unresolvable operands*).";
    expect(
      text.includes(emptyLiteral),
      `A5: ${rel} line 222's empty-literal sentence must survive byte-identical: ${JSON.stringify(emptyLiteral)}. It reads on the deferring consumers named INSIDE the *Unresolvable operands* paragraph; \`join\`'s element precondition is outside that paragraph by that paragraph's own closing clause, so the two coexist and neither needs softening.`,
    ).toBe(true);
  });
});

// ===========================================================================
// (B) BEHAVIOUR PINS — GREEN before and after. Route (c) is a prose ruling over
// shipped behaviour: every row below pins the CURRENT unfiltered emission
// sequence, so route (a) (defer on elements) and route (b) (judge the receiver)
// each red a named subset here.
//
// DIAG-4: every expected message is read from the registry *Message* column.
// ===========================================================================

/** The registry page carrying the two rows §(B) renders — the DIAG-4 oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(corpus(REGISTRY_PAGE)) as RegistryRow[];

const JOIN_CODE = "theta/parse/non-string-array-join";
const CYCLE_CODE = "theta/parse/type-alias-cycle";

/**
 * A registered code's normative *Message* template, or a throw naming the
 * registry page: a missing row is a harness failure, never a skip, because
 * every expected string below is derived from it.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no *Message* row for ${code} in ${REGISTRY_PAGE} — the DIAG-4 column is this file's only source for the expected strings`,
    );
  }
  return template;
}

/**
 * `array.join requires a string element type; got array<<element>>` with
 * `<element>` interpolated in ONE pass, so a substituted value carrying angle
 * brackets is never re-scanned. An unfilled placeholder throws.
 */
function joinMessage(element: string): string {
  const template = registered(JOIN_CODE);
  if (!template.includes("<element>")) {
    throw new Error(
      `harness: the ${JOIN_CODE} *Message* in ${REGISTRY_PAGE} no longer carries the \`<element>\` placeholder this file interpolates — the registry row changed shape`,
    );
  }
  return template.replace("<element>", element);
}

/** The frontmatter every fixture parses under. */
const FM = "---\nmode: prompt\n---\n";

/** The recurring join body: one `fn` whose declared parameter is joined. */
function JOIN(t: string): string {
  return `fn f(xs: ${t}): string {\n  xs.join(",")\n}\n1\n`;
}

function parse(src: string): readonly Diagnostic[] {
  return parseDoc(FM + src, "bug0127.theta").diagnostics;
}

/** Every diagnostic rendered `code: message` — the failure payload. */
function render(diags: readonly Diagnostic[]): string {
  return JSON.stringify(diags.map((d) => `${d.code}: ${d.message}`));
}

interface Row {
  readonly id: string;
  readonly label: string;
  readonly src: string;
  /** The WHOLE unfiltered code list, in emission order. */
  readonly codes: readonly string[];
  /** When set, the rendered `<element>` the join row must name. */
  readonly element?: string;
  readonly why: string;
}

const ROWS: readonly Row[] = [
  // --- THE ELEMENT JUDGES (SENTENCE 1) -------------------------------------
  {
    id: "E1",
    label: "an undeclared element type name is refused, now ALSO refused upstream at the parameter",
    src: JOIN("array<Nope>"),
    // FLIPPED under the sixteenth-set OPERATOR RULING for bug 0262 clause (i).
    // OLD codes: [JOIN_CODE] alone — bug 0089's row b12 (tests/fn-param-alias-
    // unfolded-at-gates.test.ts), restated here as clause-admitted rather than
    // incidental: SENTENCE 1's `a `named` that no visible declaration defines`
    // is exactly this shape, and until 0262 the `fn` parameter position ran no
    // resolution pass of its own, so `checkArrayJoin`'s own element judgement
    // (SENTENCE 1) was the SOLE refusal. NEW: bug 0262's widening now also runs
    // `collectUnresolvedNamedTypes` at the `fn` parameter capture itself, so
    // `Nope` is refused a SECOND time, upstream, at the position it is
    // written — the whole annotation, before `checkArrayJoin` ever inspects
    // the element. THIS FILE'S SUBJECT IS NOT REVERSED, IT IS SUBSUMED: the
    // join element gate's OWN judging disposition (SENTENCE 1) is unmoved —
    // it still runs and still refuses this element on its own terms — bug
    // 0262 adds a diagnostic in front of it rather than replacing it. Bug
    // 0127's subject (the element/receiver split) stays intact; only the
    // input class reaching the split has grown a second, earlier refusal.
    codes: ["theta/parse/unresolved-named-type", JOIN_CODE],
    element: "Nope",
    why: "bug 0089's row b12 (tests/fn-param-alias-unfolded-at-gates.test.ts), restated here as clause-admitted rather than incidental: SENTENCE 1's `a `named` that no visible declaration defines` is exactly this shape; bug 0262's widening now ALSO refuses `Nope` upstream at the `fn` parameter position, so the two refusals coexist",
  },
  {
    id: "E2",
    label: "a cycle-participating element name is refused, after the cycle row",
    src: `schema A = B\nschema B = A\n${JOIN("array<A>")}`,
    codes: [CYCLE_CODE, JOIN_CODE],
    element: "A",
    why: "bug 0089's row b13 — a cycle participant is omitted from the `TypeEnv`, so it is a `named` no VISIBLE declaration defines and SENTENCE 1 refuses it; the cycle row is emitted alongside, not instead",
  },
  {
    id: "E3",
    label: "an imported element type name is refused",
    src: `import { E } from "./p.thetalib"\n${JOIN("array<E>")}`,
    codes: [JOIN_CODE],
    element: "E",
    why: "the import brings no visible declaration into the parser's static view, so the element is provably unresolvable AT THIS CALL and SENTENCE 1 judges it — the receiver-level twin R2 defers",
  },
  {
    id: "E4",
    label: "an enum element type is refused",
    src: `enum Color { red, green }\n${JOIN("array<Color>")}`,
    codes: [JOIN_CODE],
    element: "Color",
    why: "an `enum` name is not a `string` element type, so it is in the registered *Trigger*'s population directly; paired with R3 it shows the split is about the LEVEL, not about how exotic the name is",
  },
  {
    id: "E5",
    label: "the `array<unknown>` sentinel of an unsunk empty literal is refused",
    src: '[].join(",")\n',
    codes: [JOIN_CODE],
    element: "unknown",
    why: "THE RECONCILIATION §(A5) names: `docs/spec_topics/expressions.md` line 222's `array<unknown>` sentinel is IN the refused class, because the `join` element precondition is outside the *Unresolvable operands* paragraph and so is not one of that paragraph's deferring consumers",
  },
  {
    id: "E6",
    label: "an unresolvable element reached through an annotated empty binding is refused, now ALSO refused upstream at the `let`",
    src: 'let e: array<Nope> = []\ne.join(",")\n',
    // FLIPPED under the sixteenth-set OPERATOR RULING for bug 0262 clause (i),
    // for the same reason as E1: the `let` annotation is one of the four
    // captures the ruling's full widening reaches, so `collectUnresolvedNamedTypes`
    // now runs there too and refuses `Nope` upstream, at the `let` statement's
    // own range, IN ADDITION to `checkArrayJoin`'s unmoved element-level
    // refusal. SUBSUMED, not reversed: this row's own subject — that the
    // `let`-annotation route reaches the identical element shape as the
    // `fn`-parameter route (E1) — still holds; both routes now carry the same
    // second, upstream diagnostic together.
    codes: ["theta/parse/unresolved-named-type", JOIN_CODE],
    element: "Nope",
    why: "the `let`-annotation route to the same element shape as E1 — proof the element judgement is a property of the element type, not of the `fn`-parameter surface E1 uses; bug 0262's widening now ALSO refuses `Nope` upstream at the `let` annotation itself, so E1 and E6 carry the identical two-code pattern",
  },

  // --- THE RECEIVER DEFERS (SENTENCE 2) ------------------------------------
  {
    id: "R1",
    label: "an undeclared RECEIVER type name is now refused upstream, at the parameter — the `join` gate itself still never runs",
    src: JOIN("Nope"),
    // FLIPPED under the sixteenth-set OPERATOR RULING for bug 0262 clause (i).
    // OLD codes: [] — bug 0089's row e2: the receiver is not statically an
    // `array<T>`, so `checkArrayJoin` never ran and SENTENCE 2's deferral was
    // the whole observable. NEW: `Nope` is written directly as the `fn`
    // parameter's type (not wrapped in `array<...>`), and bug 0262's widening
    // now runs `collectUnresolvedNamedTypes` at that very capture, so the
    // annotation is refused UPSTREAM, at the position it is written, before
    // any `join`-specific gate is reached at all. THE RECEIVER-LEVEL DEFERRAL
    // ITSELF IS SUBSUMED, NOT REVERSED: `checkArrayJoin` still never runs for
    // this receiver — there is still no `non-string-array-join` in this row's
    // codes — so SENTENCE 2's disposition (the `join` gate defers on a
    // non-`array` receiver) is undisturbed; the input class merely no longer
    // reaches that gate clean, because a DIFFERENT, upstream gate now refuses
    // it first. The asymmetry with E1 that bug 0127 reported (§B/X below)
    // still holds at the `join`-gate level: only the SURROUNDING annotation
    // gate has grown a new refusal that applies uniformly regardless of
    // whether the name is array-wrapped.
    codes: ["theta/parse/unresolved-named-type"],
    why: "bug 0089's row e2 — the receiver is not statically an `array<T>`, so the `join` gate never runs and SENTENCE 2's deferral is still what is observed AT THAT GATE. bug 0262's widening now refuses the bare `Nope` parameter annotation upstream, at the position it is written, before the `join` gate is ever reached; this is the exact asymmetry with E1 that bug 0127 reported and route (c) makes normative, now measured one gate earlier",
  },
  {
    id: "R2",
    label: "an imported RECEIVER type name defers",
    src: `import { E } from "./p.thetalib"\n${JOIN("E")}`,
    codes: [],
    why: "E3's twin one level up: the same unresolvable name defers at the receiver and refuses at the element",
  },
  {
    id: "R3",
    label: "an enum RECEIVER type defers",
    src: `enum Color { red, green }\n${JOIN("Color")}`,
    codes: [],
    why: "E4's twin one level up — a non-`array` receiver draws no `join` diagnostic even though the same name is refused as an element",
  },
  {
    id: "R4",
    label: "a cycle-participating RECEIVER name draws the cycle row ALONE",
    src: `schema A = B\nschema B = A\n${JOIN("A")}`,
    codes: [CYCLE_CODE],
    why: "E2's twin one level up: the cycle is still rejected (TYPE-11, docs/spec_topics/type-system.md line 56's TYPE-11 paragraph) but the `join` gate is SILENT — the whole-list `toEqual` is what proves the join row's absence",
  },

  // --- SILENCE CONTROLS ----------------------------------------------------
  {
    id: "S1",
    label: "control — a `string` element list joins cleanly",
    src: JOIN("array<string>"),
    codes: [],
    why: "the clean program every route must keep clean; without it the refusal rows could be satisfied by a gate that refuses everything",
  },
  {
    id: "S2",
    label: "control — an annotated empty `array<string>` binding joins cleanly",
    src: 'let e: array<string> = []\ne.join(",")\n',
    codes: [],
    why: "bug 0083's row b1 — the annotated sink supplies `string`, so E5's sentinel never arises; this is the discriminator proving E5 measures the SENTINEL and not the empty literal as such",
  },

  // --- REGISTERED-TRIGGER CONTROLS ----------------------------------------
  {
    id: "T1",
    label: "control — an `integer` element list is refused",
    src: JOIN("array<integer>"),
    codes: [JOIN_CODE],
    element: "integer",
    why: "the registered *Trigger*'s uncontested population (docs/spec_topics/diagnostics/code-registry-parse.md line 46): a fully resolvable non-`string` element. A route that softened the element gate would red here first",
  },
  {
    id: "T2",
    label: "control — an object-schema element list is refused (TYPE-10)",
    src: `schema P {\n  a: string\n}\n${JOIN("array<P>")}`,
    codes: [JOIN_CODE],
    element: "P",
    why: "bug 0089's row b11 — TYPE-10 nominal, fully resolvable, and still refused; paired with T1 it bounds the element judgement so it is not read as 'only unresolvable names are refused'",
  },

  // --- THE DECISION LOCATOR ------------------------------------------------
  {
    id: "D1",
    label: "the locator — DECLARING the name flips the element from refused to clean",
    src: `schema Nope = string\n${JOIN("array<Nope>")}`,
    codes: [],
    why: "E1 with one line added. The declaration is the ONLY difference, so this row is what makes SENTENCE 1's 'provably cannot resolve' operational: the refusal tracks visible-declaration absence, not the spelling `Nope`",
  },
];

describe("bug 0127 (B) — route (c) moves no observable: the shipped element/receiver split, pinned", () => {
  for (const row of ROWS) {
    it(`B/${row.id}: ${row.label}`, () => {
      const diags = parse(row.src);
      expect(
        diags.map((d) => d.code),
        `B/${row.id} — ${row.why}. Route (c) is a prose ruling: this row's unfiltered code sequence must be byte-identical before and after. Rendered diagnostics: ${render(diags)}`,
      ).toEqual([...row.codes]);
      if (row.element !== undefined) {
        const hit = diags.find((d) => d.code === JOIN_CODE);
        expect(
          hit,
          `B/${row.id} PRECONDITION: no ${JOIN_CODE} diagnostic to read a rendered element off. Rendered diagnostics: ${render(diags)}`,
        ).toBeDefined();
        expect(
          hit?.message,
          `B/${row.id} — DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md line 74): the rendered element is what makes the refusal attributable to the ELEMENT level rather than to some other gate. Expected the ${REGISTRY_PAGE} line 46 *Message* with \`<element>\` = ${JSON.stringify(row.element)}`,
        ).toBe(joinMessage(row.element));
      }
    });
  }

  it("B/X: the element/receiver split, stated as one table over the same four names", () => {
    // The cross-row statement of the ruling: for each of the four unresolvable
    // or non-`array` names, the ELEMENT position refuses and the RECEIVER
    // position does not. A harmonisation of the two levels in either direction
    // reds here explicitly rather than in eight scattered rows.
    const NAMES: readonly (readonly [string, string])[] = [
      ["Nope", ""],
      ["E", 'import { E } from "./p.thetalib"\n'],
      ["Color", "enum Color { red, green }\n"],
      ["A", "schema A = B\nschema B = A\n"],
    ];
    const measured = NAMES.map(([name, prelude]) => ({
      name,
      element: parse(prelude + JOIN(`array<${name}>`))
        .map((d) => d.code)
        .filter((c) => c === JOIN_CODE).length,
      receiver: parse(prelude + JOIN(name))
        .map((d) => d.code)
        .filter((c) => c === JOIN_CODE).length,
    }));
    expect(
      measured,
      "the two levels of the one `join` gate no longer disagree. Route (c) rules the asymmetry INTENDED and normative — the element judges and refuses (SENTENCE 1), the receiver defers (SENTENCE 2). A measured 0 in the `element` column is route (a) (REJECTED: it weakens bug 0089's b12/b13); a measured 1 in the `receiver` column is route (b) (REJECTED: it refuses three currently-clean programs)",
    ).toEqual([
      { name: "Nope", element: 1, receiver: 0 },
      { name: "E", element: 1, receiver: 0 },
      { name: "Color", element: 1, receiver: 0 },
      { name: "A", element: 1, receiver: 0 },
    ]);
  });
});

// ===========================================================================
// (C) NON-DISPLACEMENT PIN — GREEN before and after. Route (a) would have
// weakened bug 0089's pinned rows b12 and b13 from a refusal to a deferral.
// Route (c) is REJECTED-route-(a)'s opposite: those two rows keep their values,
// and this cell makes that claim testable against the witness file's own bytes
// rather than only against §(B)'s re-measurement of the same programs.
// ===========================================================================

/** The bug-0089 witness whose b12/b13 rows route (a) would have had to rewrite. */
const WITNESS = "tests/fn-param-alias-unfolded-at-gates.test.ts";

/**
 * The body of one `it("<id>: …", …)` block, from its `it(` to the next one (or
 * to end of file). Fails loudly when the block is absent, so a renamed or
 * deleted row is a red rather than a vacuous pass.
 */
function itBlock(text: string, id: string): string {
  const marker = `it("${id}: `;
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new Error(
      `harness: ${WITNESS} contains no block beginning ${JSON.stringify(marker)}. Bug 0089's row '${id}' is the pinned disposition route (c) declines to move; if it has been renamed or deleted, this non-displacement claim must be re-derived, never silently dropped`,
    );
  }
  const rest = text.slice(start + marker.length);
  const end = rest.indexOf('\n  it("');
  return end < 0 ? rest : rest.slice(0, end);
}

// The pinned bytes for b12 were REWRITTEN under the sixteenth-set OPERATOR
// RULING for bug 0262, clause (i), which authorises editing this section and
// requires the two files to tell one story about the one row. Bug 0089's b12
// now asserts the ordered PAIR `["theta/parse/unresolved-named-type",
// "theta/parse/non-string-array-join"]`: the widened `NamedType` position set
// refuses the written head `Nope` at the `fn` parameter capture, ahead of the
// join gate's own element refusal. THIS SECTION'S SUBJECT IS UNCHANGED — it
// asserts that the two files' dispositions do not displace one another, and
// what it pins is that bug 0089's row still carries the join refusal it always
// carried. Route (a) — defer on unresolvable elements — would have DELETED
// `theta/parse/non-string-array-join` from that expectation; the pin below
// therefore still reds on route (a), because the join code is still one of the
// bytes it demands.
describe("bug 0127 (C) — bug 0089's b12/b13 keep their join values; route (a) is not taken", () => {
  const CASES: readonly (readonly [string, string, string])[] = [
    [
      "b12",
      '.toEqual(["theta/parse/unresolved-named-type", "theta/parse/non-string-array-join"]);',
      "an undeclared element type name — the row SENTENCE 1 restates as clause-admitted, now behind bug 0262's upstream refusal of the same written head (re-measured independently as §(B) row B/E1)",
    ],
    [
      "b13",
      '.toEqual(["theta/parse/type-alias-cycle", "theta/parse/non-string-array-join"]);',
      "a cycle-participating element name — the row SENTENCE 1 also covers (re-measured independently as §(B) row B/E2)",
    ],
  ];

  for (const [id, expectation, label] of CASES) {
    it(`C/${id}: ${WITNESS}'s '${id}' still asserts its refusal`, () => {
      const block = itBlock(corpus(WITNESS), id);
      expect(
        block.includes(expectation),
        `C/${id}: ${WITNESS}'s '${id}' row (${label}) no longer carries ${JSON.stringify(expectation)}. Route (a) — defer on unresolvable elements — is REJECTED precisely because it would have had to weaken this expectation; a fix that edits it has taken the rejected route. Block read: ${JSON.stringify(block.slice(0, 400))}`,
      ).toBe(true);
    });
  }
});
