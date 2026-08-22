import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { Expr, ThetaDocument } from "../src/parser/theta-document";
import { StaticTypeInferencePass } from "../src/parser/static-type-inference";
import { checkCompatible, displayType, type TypeEnv } from "../src/parser/type-compat";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0195 — four corpus sentences state that an unsunk empty array literal
// (`for x in []`, `let xs = []`) is `theta/parse/array-no-common-type`, and the
// shipped parser emits nothing for either
// (docs/bugs/0195-control-flow-empty-array-iterand-claim-false.md).
//
// THE ADJUDICATION THIS FILE WITNESSES — route (a) of that report's §Fix: the
// empty literal is NOT owed a refusal, so the four sentences move and no
// implementation, registry row or committed source does. Two grounds, cited and
// not re-derived here:
//
//   1. THE STATED LAW, bug 0155 `## Fix (0.174.0)`
//      (docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md:742):
//      "A registered *Trigger* is the normative statement of a code's emission
//      set (DIAG-2). Where a rule page's scope exceeds the registered *Trigger*
//      of the code it names, the *Trigger* governs and the rule page is
//      corrected in the same commit; no implementation may be wired to emit a
//      code outside its registered *Trigger*." The row's *Trigger*
//      (docs/spec_topics/diagnostics/code-registry-parse.md:44) reads "Array
//      literal whose elements have no common type and no sink to narrow
//      against." — a positive verdict over elements that exist, which an empty
//      literal never reaches. DIAG-2 itself is
//      docs/spec_topics/diagnostics/diagnostic-shape.md:72.
//   2. Route (b)'s named prerequisite, bug 0156, is OPEN, so wiring the refusal
//      today would refuse `f([])`, which the same sentence declares legal.
//
// THE ADJUDICATED OBSERVABLE: an unsunk `[]` draws NO diagnostic, types as
// `array<unknown>`, and its consumers defer under
// docs/spec_topics/type-system.md:48 §"Type compatibility" (*Unresolvable
// operands*).
//
// WHICH SECTIONS RED AND WHICH DO NOT, stated up front so a reader is never
// guessing what this file is measuring:
//
//   - §(A) CORPUS CONFORMANCE — RED at HEAD. Each cell reads a real corpus file
//     off disk and asserts the un-corrected sentence is gone AND the
//     replacement observable is stated. These are the only cells this
//     adjudication moves.
//   - §(B) BEHAVIOUR PINS — GREEN before and after, by construction: route (a)
//     changes no behaviour, so every one of these rows pins the CURRENT
//     emission sequence. They are the report's §Fix "Constraints binding on
//     both routes" 1 and 2 — the rows that must not move — plus the four
//     subject rows whose silence IS the adjudicated observable. A future wiring
//     of the refusal reds them, which is the point.
//   - §(C) THE STRUCTURAL PIN — GREEN before and after: the V2a-era
//     `checkArrayCommonType` seam was DELETED under §Fix route (a) (0.197.0);
//     this cell reds if any `src/` file reintroduces a reference.
//   - §(D) THE CORPUS CENSUS — GREEN before and after: GOV-15's addition
//     direction over an input set with no committed member.
//
// Harness: `parseDoc` (tests/helpers/e2e-s1.ts:39) over the shipped
// `parseThetaDocument`, frontmatter `---\nmode: prompt\n---`, so every fixture's
// source starts on line 4. `codes` is the whole unfiltered `doc.diagnostics` in
// emission order. Offline, provider-free, deterministic.

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

/**
 * The body of a `##`-headed section, by heading text.
 *
 * Region-scoped so a cell cannot be satisfied by the required phrase appearing
 * in some unrelated part of the page.
 */
function section(text: string, heading: string, rel: string): string {
  const start = text.indexOf(heading);
  if (start < 0) {
    throw new Error(
      `harness: ${rel} contains no heading ${JSON.stringify(heading)}, so the region this cell scopes to does not exist`,
    );
  }
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  return heading + (end < 0 ? rest : rest.slice(0, end));
}

// ===========================================================================
// (A) CORPUS CONFORMANCE — RED at HEAD. Both directions per cell: the false
// claim is ABSENT and the replacement observable is PRESENT. Deleting the
// sentence without stating what an unsunk `[]` does instead leaves the corpus
// silent on a question three of its pages currently answer, so neither
// direction alone discharges the adjudication.
// ===========================================================================

describe("bug 0195 (A) — the four corpus sentences state the adjudicated observable", () => {
  it("A1: control-flow.md's `for ... in` paragraph drops the refusal and states `array<unknown>`", () => {
    const rel = "docs/spec_topics/control-flow.md";
    const text = corpus(rel);
    const claim = "with no surrounding sink is `theta/parse/array-no-common-type`";
    expect(
      text.includes(claim),
      `A1: ${rel}:13 still carries the claim ${JSON.stringify(claim)}. Route (a) rules the empty literal outside the registered *Trigger*, so the sentence naming \`for x in []\` as \`theta/parse/array-no-common-type\` is false at every HEAD and must be rewritten, not merely softened.`,
    ).toBe(false);
    expect(
      text.includes("array<unknown>"),
      `A1: ${rel} must state the replacement observable — an unsunk \`[]\` types as \`array<unknown>\` — since deleting the false claim alone leaves the loop's iterand case unanswered.`,
    ).toBe(true);
    expect(
      text.includes("draws no diagnostic"),
      `A1: ${rel} must say in terms that the unsunk empty iterand draws no diagnostic; a reader arriving from the removed remedy ("annotate via a \`let xs: array<T> = []\`") needs the negative stated.`,
    ).toBe(true);
  });

  it("A2: spec_topics/grammar.md answers the carve-out warning instead of deleting it", () => {
    const rel = "docs/spec_topics/grammar.md";
    const text = corpus(rel);
    const claim = "with no other sink is `theta/parse/array-no-common-type`";
    expect(
      text.includes(claim),
      `A2: ${rel}:223 still carries the claim ${JSON.stringify(claim)} in §"array<T> literal type-sink rule".`,
    ).toBe(false);
    expect(
      text.includes("array<unknown>"),
      `A2: ${rel} must state that an unsunk \`[]\` types as \`array<unknown>\`.`,
    ).toBe(true);
    expect(
      text.includes("resist any `for`-specific carve-out"),
      `A2: ${rel} must KEEP "resist any \`for\`-specific carve-out". The warning exists to stop a later reader special-casing \`for\`, and route (a) does not weaken it: the iterand is still not a sink and still supplies no \`T\`; only the consequence of its absence changes. Answering the warning is required; deleting it is not admissible.`,
    ).toBe(true);
  });

  it("A3: reference/grammar.md's mirror states the same observable", () => {
    const rel = "docs/reference/grammar.md";
    const text = corpus(rel);
    const claim = "with no other sink is `theta/parse/array-no-common-type`";
    expect(
      text.includes(claim),
      `A3: ${rel} still carries the claim ${JSON.stringify(claim)}. A route that corrects the spec topic and leaves the reference mirror stale leaves the corpus disagreeing with itself instead of with the parser.`,
    ).toBe(false);
    expect(
      text.includes("array<unknown>"),
      `A3: ${rel} must state that an unsunk \`[]\` types as \`array<unknown>\`.`,
    ).toBe(true);
  });

  it("A4: expressions.md §Array construction states the fallback and keeps rule 3", () => {
    const rel = "docs/spec_topics/expressions.md";
    const region = section(corpus(rel), "## Array construction", rel);
    expect(
      region.includes("array<unknown>"),
      `A4: ${rel}:222 names three contexts an empty literal may take its element type from and no fallback for their absence; §"Array construction" must state that fallback (\`array<unknown>\`), since it is this page's rule the other three cite.`,
    ).toBe(true);
    const rule3 =
      "An array whose elements have no common type and no context to narrow against is `theta/parse/array-no-common-type`";
    expect(
      region.includes(rule3),
      `A4: ${rel} §"Array construction" must still contain ${JSON.stringify(rule3)}. Rule 3's population — two or more branches with no LUB — is the registered *Trigger*'s uncontested reading and is untouched by this adjudication; a correction that removes it deletes a rule that is enforced.`,
    ).toBe(true);
  });

  it("A5: reference/type-system.md's common-type mirror states the same fallback", () => {
    const rel = "docs/reference/type-system.md";
    const text = corpus(rel);
    expect(
      text.includes("array<unknown>"),
      `A5: ${rel} mirrors expressions.md's three common-type rules (the rule block around :121–131) and must carry the same empty-literal fallback, because the replacement observable is a statement about the type system and this is the type-system page.`,
    ).toBe(true);
  });

  it("A6: the registered row is UNCHANGED — no registry edit under this route", () => {
    // The no-registry-edit pin. GREEN before and after: route (a) settles the
    // ambiguity by READING the existing *Trigger* (an empty literal has no
    // elements, so it reaches no "no common type" verdict), which is why it
    // needs no DIAG-2 change. This cell reds if a fixer reaches for the
    // registry instead of the prose.
    const rel = "docs/spec_topics/diagnostics/code-registry-parse.md";
    const text = corpus(rel);
    const trigger =
      "Array literal whose elements have no common type and no sink to narrow against.";
    expect(
      text.includes(trigger),
      `A6: ${rel}:44's *Trigger* must read ${JSON.stringify(trigger)} verbatim. Under DIAG-2 (diagnostic-shape.md:72) a trigger change is a spec change; this adjudication makes none.`,
    ).toBe(true);
    const message =
      "array elements have no common type; annotate the binding with array<A \\| B> or use a single schema";
    expect(
      text.includes(message),
      `A6: ${rel}:44's *Message* must survive byte-identical. DIAG-4 (diagnostic-shape.md:74) makes the *Message* column normative and defers any reword to theta 2.0, and the array wording reads oddly for an empty literal only under route (b), which is not the route taken.`,
    ).toBe(true);
  });
});

// ===========================================================================
// (B) BEHAVIOUR PINS — GREEN before and after. Route (a) changes no behaviour;
// these rows are the report's §Fix constraints 1–3 and the four subject rows.
// ===========================================================================

/** Frontmatter every fixture parses under. */
const FM = "---\nmode: prompt\n---\n";

/** The two distinct named object schemas rule 3's live arm is written about. */
const A_B = "schema A {\n  a: integer\n}\nschema B {\n  b: string\n}\n";

const NO_COMMON = "theta/parse/array-no-common-type";

function parse(src: string): ThetaDocument {
  return parseDoc(FM + src, "bug0195.theta");
}

/** Every diagnostic rendered `severity code: message` — the failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
  );
}

/** The whole unfiltered diagnostic code list, in emission order. */
function codes(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}

interface Row {
  readonly id: string;
  readonly src: string;
  readonly codes: readonly string[];
  readonly why: string;
}

const ROWS: readonly Row[] = [
  // The four subject rows. Their silence IS the adjudicated observable: the
  // empty literal reaches no "elements have no common type" verdict, so the
  // registered code has nothing to fire on.
  {
    id: "a1",
    src: "for x in [] {\n  @`hi`?\n}\n1\n",
    codes: [],
    why: "control-flow.md:13's named input",
  },
  { id: "a2", src: "for x in [] {\n}\n1\n", codes: [], why: "the empty-bodied twin of a1" },
  { id: "a3", src: "let xs = []\n1\n", codes: [], why: "the `let` half of the same sentence" },
  { id: "a4", src: "let xs = []\nxs\n", codes: [], why: "a3 with the binding consumed" },

  // Constraint 2 — the *Trigger*'s uncontested reading. These MUST survive: a
  // correction that silences the two-object-schema refusal at the `for` and
  // `par for` iterands would delete rule 3's population along with the claim.
  {
    id: "f1",
    src: `${A_B}for x in [A { a: 1 }, B { b: "x" }] {\n  @\`hi\`?\n}\n1\n`,
    codes: [NO_COMMON],
    why: "the `for` iterand refusal — proof the walk reaches the node",
  },
  {
    id: "h3",
    src: `${A_B}let r = par for x in [A { a: 1 }, B { b: "x" }] {\n  x\n}\nr\n`,
    codes: [NO_COMMON],
    why: "the `par for` iterand refusal, a different walk arm from f1",
  },
  {
    id: "c1",
    src: `${A_B}let x = [A { a: 1 }, B { b: "x" }]\nx\n`,
    codes: [NO_COMMON],
    why: "the reachable emitter's live arm",
  },

  // Constraint 1 — rows outside this report that must stay byte-identical.
  { id: "f2", src: 'for x in [1, "a"] {\n  @`hi`?\n}\n1\n', codes: [], why: "bug 0081's union clause at the iterand" },
  { id: "c2", src: 'let x = [1, "a"]\nx\n', codes: [], why: "bug 0081's union clause" },
  { id: "i1", src: "let xs = [1]\nxs\n", codes: [], why: "the one-element case the same guard exempts" },
  { id: "b1", src: "let xs: array<integer> = []\nxs\n", codes: [], why: "the binding-annotation sink, supplied" },
  {
    id: "b3",
    src: "schema S {\n  xs: array<integer>\n}\nlet s = S { xs: [] }\ns\n",
    codes: [],
    why: "the constructor-field sink, supplied",
  },
  {
    id: "k1",
    src: "let xs: array<integer> = []\nlet ys = xs.concat([])\nys\n",
    codes: [],
    why: "an annotated array's method taking a further `[]`",
  },
  {
    id: "m2",
    src: 'let xs: array<array<integer>> = [["a"]]\nxs\n',
    codes: ["theta/parse/let-rhs-type-mismatch", "theta/parse/array-element-type-mismatch"],
    why: "the element sink working one level down — two codes, in this order",
  },

  // The deferral behind the adjudicated type. g1/g2 defer on the loop variable
  // because an empty iterand's element is unresolvable
  // (type-system.md:48, *Unresolvable operands*); g3 is the control that proves
  // the body checks run at all. The body of a `for x in []` never executes
  // (control-flow.md:15, CTRL-1), so the deferral costs no runtime soundness.
  { id: "g1", src: "for x in [] {\n  let n = x + 1\n  @`hi`?\n}\n1\n", codes: [], why: "arithmetic defers on the unresolvable element" },
  { id: "g2", src: 'for x in [] {\n  let n = x.join(",")\n  @`hi`?\n}\n1\n', codes: [], why: "the method gate defers on the same element" },
  {
    id: "g3",
    src: 'for x in [1] {\n  let n = x.join(",")\n  @`hi`?\n}\n1\n',
    codes: ["theta/parse/unknown-method"],
    why: "the control — the identical body over a resolvable element refuses",
  },
];

describe("bug 0195 (B) — the behaviour route (a) does not move", () => {
  for (const row of ROWS) {
    it(`B/${row.id}: ${row.why}`, () => {
      const doc = parse(row.src);
      expect(
        doc.diagnostics.map((d: Diagnostic) => d.code),
        `B/${row.id} — ${row.why}. Route (a) is a prose correction: this row's unfiltered code sequence must be byte-identical before and after. Rendered diagnostics: ${render(doc)}`,
      ).toEqual([...row.codes]);
    });
  }

  it("B/d2: an unsunk `[]` types as `array<unknown>` — the mechanism the corpus must now state", () => {
    // The inference pass answers an empty candidate set with `named "unknown"`,
    // which is where the replacement observable §(A) pins into the corpus comes
    // from. Read off the shipped pass over the shipped `⊑` engine, deliberately
    // ungated on diagnostics: the pass answers regardless of what the checker
    // said.
    const doc = parse("[]\n");
    const tail = doc.body.tail;
    expect(
      tail,
      `B/d2 PRECONDITION: the fixture must end in a trailing expression, which is the node the type is read on. Diagnostics: ${render(doc)}`,
    ).not.toBeNull();
    expect(
      (tail as Expr).kind,
      `B/d2 PRECONDITION: the trailing expression must parse as an \`array\` node. Diagnostics: ${render(doc)}`,
    ).toBe("array");
    const spelling = displayType(
      new StaticTypeInferencePass({ checkCompatible }).typeOf(tail as Expr, {} as TypeEnv),
    );
    expect(
      spelling,
      "B/d2: the unsunk empty literal's type is what the corrected sentences must name; if it stops being `array<unknown>` the prose §(A) pins is wrong even once it is written",
    ).toBe("array<unknown>");
  });
});

// ===========================================================================
// (C) THE STRUCTURAL PIN — GREEN before and after. Route (a)'s deletion limb landed at
// 0.197.0: the V2a-era `checkArrayCommonType` seam is gone; this cell reds if
// any `src/` file reintroduces a reference, which would emit outside the
// registered *Trigger* and so violate THE STATED LAW this adjudication cites.
// ===========================================================================

/** Every `.ts` file under `src/`, relative to the repository root. */
function srcFiles(): string[] {
  const root = path.join(REPO_ROOT, "src");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.name.endsWith(".ts")) {
        out.push(path.relative(REPO_ROOT, abs).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}

describe("bug 0195 (C) — the V2a array-sink seam stays unwired", () => {
  it("C1: no `src/` file calls or imports `checkArrayCommonType`", () => {
    const files = srcFiles();
    if (files.length === 0) {
      throw new Error(
        "harness: no `.ts` file found under `src/`, so this structural pin ranges over nothing — a loud failure, never a vacuous pass",
      );
    }
    // The declaration itself is admissible; a USE is not. `checkArrayCommonType`
    // takes an `ArraySinkContext` whose `for-iterand` and `none` members exist
    // only to make an empty literal fire, so any production reference to it is
    // a wiring of the refusal this adjudication rules is not owed.
    const uses: string[] = [];
    for (const rel of files) {
      const lines = readFileSync(path.join(REPO_ROOT, rel), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("checkArrayCommonType")) {
          return;
        }
        if (line.includes("export function checkArrayCommonType(")) {
          return;
        }
        uses.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(
      uses,
      "C1: `checkArrayCommonType` (src/parser/type-grammar.ts:1224) has no production caller and must keep none under route (a). Emitting `theta/parse/array-no-common-type` for a `for-iterand` `[]` would emit outside the row's registered *Trigger* (code-registry-parse.md:44), which DIAG-2 and bug 0155's THE STATED LAW forbid",
    ).toEqual([]);
  });
});

// ===========================================================================
// (D) THE COMMITTED-CORPUS CENSUS — GREEN before and after. §Fix constraint 4:
// state the GOV-15 disposition from a census re-measured at THIS head, not
// copied from the report.
// ===========================================================================

describe("bug 0195 (D) — no committed theta carries an empty array literal", () => {
  it("D1: the census re-derives to 34 files and zero `[]`", () => {
    const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    });
    if (probe.status !== 0) {
      throw new Error(
        `harness: \`git rev-parse\` failed in ${REPO_ROOT} (${probe.stderr ?? ""}), so the committed-corpus census cannot be taken — a loud failure, never a vacuous pass`,
      );
    }
    const files = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (files.length === 0) {
      throw new Error(
        "harness: `git ls-files -- '*.theta' '*.thetalib'` listed nothing, so the census has no corpus to range over — a loud failure, never a vacuous pass",
      );
    }
    expect(
      files.length,
      `D1: the census is over ${files.length} committed files; sibling fixes land \`.theta\` files, so a changed count means the disposition below must be re-derived rather than trusted. Files: ${JSON.stringify(files)}`,
    ).toBe(34);
    const offenders = files.filter((f) =>
      readFileSync(path.join(REPO_ROOT, f), "utf8").includes("[]"),
    );
    expect(
      offenders,
      "D1: zero committed sources contain an `[]` literal, so route (a) moves no committed theta's diagnostic sequence and the GOV-15 disposition is over an input set with no committed member",
    ).toEqual([]);
  });
});
