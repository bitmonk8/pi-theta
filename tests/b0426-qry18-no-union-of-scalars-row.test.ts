// Bug 0426 witness — the QRY-18 stringification table has no row for a union
// static type, and the row-selection rule the implementation actually uses
// (resolve the value first, then select the row from the VALUE's runtime kind)
// is stated by no sentence in the doc corpus.
//
// Bug doc: docs/bugs/0426-qry18-no-union-of-scalars-row.md. This is the DEFERRED
// half of bug 0408's settled fix — 0408 §Fix recommended options (a)+(c)
// together, (c) being "add a union row to the QRY-18 table pinning (a)'s
// behaviour"; the parent adjudication forbade the spec-phase amendment, so only
// (a) landed and 0408 §Fix residual 1 designated the missing row a filing
// candidate ("DIAG-2 same-commit spec edit deferred"). Bug 0426 is that filing.
//
// The fix is SPEC-ONLY (a GOV-30 doc amendment, no code): the scalar-union
// render behaviour is already correct and pinned by tests/b0408-*.test.ts W1–W4
// (`number | null` carrying `NaN` renders `NaN`, `string | null` carrying "hi"
// renders unquoted, etc.). So this witness reads the settled end-state normative
// text out of the doc corpus and asserts it is present. It is RED at the fork
// (the normative sentences are absent — a second implementer reading the table
// cannot derive the pinned behaviour) and GREEN once the §Fix doc edits land.
//
// Tier: unit / offline doc gate. The gap is a documentation gap — the fix
// changes no bytes of runtime behaviour — so the only observable is the doc
// text itself. readFileSync over the committed .md files is the exact and
// sufficient seam; no runtime, no provider, no child process is reachable or
// relevant. Sibling pattern: the `readFileSync(fileURLToPath(new URL(...)))`
// spec-md read mirrors tests/b0416-pic18-governor-event-enumeration.test.ts and
// tests/absent-member-presence-gate.test.ts.
//
// Cells A/B/C assert the settled §Fix end state and are RED at the fork for the
// right reason (the settled normative text is ABSENT — a doc-gap symptom, not a
// file-not-found or harness error: every read fails loudly and names the file if
// it is missing, so an absent file surfaces as a distinct precondition failure).
// Cell D is a CONTROL — an existing QRY-18 note sentence that is present now and
// stays present after the fix — proving the harness reads the right file and the
// reds above are genuine text absences, not a mis-pathed read.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/** Read a required doc file as text, failing loudly and naming it if absent. */
function readDoc(relPath: string): string {
  const url = new URL(`../${relPath}`, import.meta.url);
  try {
    return readFileSync(fileURLToPath(url), "utf8");
  } catch (cause) {
    throw new Error(
      `b0426 precondition unmet: required doc file not readable: ${relPath} (${String(cause)})`,
    );
  }
}

// The three doc surfaces bug 0426 §Fix amends: the QRY-18 table + its union-row
// note (the primary spec source), the `system:` NaN clause worded for a plain
// `number` (the frontmatter half), and the docs/reference/ mirror of both.
const QRY_STRINGIFICATION = "docs/spec_topics/query/query-escapes-stringification.md";
const FRONTMATTER_FIELDS_B = "docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md";
const REFERENCE_FRONTMATTER = "docs/reference/frontmatter.md";

describe("b0426 (A) QRY-18 gains a union row + value-driven row-selection note (RED at fork)", () => {
  // The QRY-18 table (query-escapes-stringification.md, anchor `qry-18`) keys its rows on
  // "the Theta static type of the expression" and has NO row for any union
  // (`string | null`, `number | null`, `Cat | Dog`). The §Fix adds a union row
  // whose selection rule resolves the value first and picks the row from the
  // value's runtime kind — text the corpus states nowhere at the fork.
  it("states row selection is driven by the resolved value's runtime kind", () => {
    const text = readDoc(QRY_STRINGIFICATION);
    expect(
      text,
      "bug 0426 §Fix: the union row must state that selection is driven by the resolved value's runtime kind (the rule tests/b0408 W1–W4 pin), not the static type the table headline names",
    ).toContain("resolved value's runtime kind");
  });

  it("names the value-driven row-selection rule", () => {
    const text = readDoc(QRY_STRINGIFICATION);
    expect(
      text,
      "bug 0426 §Fix: the value-driven row-selection rule (resolve value, then select row) must be stated once so a re-implementer derives the pinned behaviour from text, not from the b0408 suite",
    ).toContain("Value-driven row selection");
  });

  it("adds the union row itself to the QRY-18 table", () => {
    const text = readDoc(QRY_STRINGIFICATION);
    // Gates §Fix element (1) — the ROW, not only the note. The row's cell
    // markers are distinct from every note sentence, so deleting the row would
    // otherwise leave the note-only substrings green while re-opening the
    // title defect ("the QRY-18 table has no row for a union static type").
    expect(
      text,
      "bug 0426 §Fix (1): the QRY-18 table must carry a Union type row",
    ).toContain("| Union type (");
    expect(
      text,
      "bug 0426 §Fix (1): the union row selects by the resolved value's runtime kind, not the static union type",
    ).toContain("not the static union type");
  });

  it("pins the brand-first arm pick order", () => {
    const text = readDoc(QRY_STRINGIFICATION);
    // Gates the pick order matching bug 0425-(a): the arm is selected by the
    // value's schema brand first (then, on the `system:` bare-path render, an
    // exact field-set match). Ungated, the brand clause could drift away.
    expect(
      text,
      "bug 0426 §Fix: the union row's translation clause must state the schema-brand arm pick (0425-(a)'s brand-first behaviour)",
    ).toContain("schema brand");
  });

  it("covers a value matching no arm or matching more than one, rendered untranslated", () => {
    const text = readDoc(QRY_STRINGIFICATION);
    expect(
      text,
      "bug 0426 §Fix: the row must name the degenerate cases (a value matching no arm, or matching more than one) so those renderings are not left to implementation defaults — the very failure QRY-18 exists to prevent",
    ).toContain("matching no arm, or matching more than one");
    // Gates the CONSEQUENT (untranslated), not only the antecedent list: the
    // rejected alternative ("…renders through the first arm") must not pass.
    expect(
      text,
      "bug 0426 §Fix: a no-match / ambiguous value must render UNTRANSLATED (never a guessed arm) — the constraint that keeps 0408's fixed defect closed",
    ).toContain("renders with its theta-side names untranslated");
  });
});

describe("b0426 (B) the frontmatter NaN clause widens to a number-carrying union (RED at fork)", () => {
  // frontmatter-fields-b-and-templates.md:46 today reads "a `number`-typed
  // param … can carry a non-finite IEEE-754 double" — worded for a plain
  // `number`, not `number | null`. The §Fix widens it to any number-carrying
  // union and ties it to the value-driven row-selection rule.
  it("widens the NaN clause to a number-carrying union type", () => {
    const text = readDoc(FRONTMATTER_FIELDS_B);
    expect(
      text,
      "bug 0426 §Fix (2): the NaN-reachability clause must cover non-finite doubles reaching a number-carrying union type (`number | null`), not just a plain `number`-typed param",
    ).toContain("number-carrying union type");
  });

  it("ties the widened clause to value-driven row selection", () => {
    const text = readDoc(FRONTMATTER_FIELDS_B);
    expect(
      text,
      "bug 0426 §Fix (3): the widened clause must reference the value-driven row selection so the `system:` slot's non-finite render is derivable from one stated rule",
    ).toContain("value-driven row selection");
  });
});

describe("b0426 (C) the docs/reference/ mirror carries the value-driven rule (RED at fork)", () => {
  // docs/reference/frontmatter.md mirrors the touched normative sentences (§Fix:
  // "plus the docs/reference/ mirror of each touched sentence"). At the fork its
  // stringification prose names only "its Theta static type" and carries neither
  // the value-driven rule nor the union-arm match vocabulary.
  it("mirrors the resolved-value's-runtime-kind selection rule", () => {
    const text = readDoc(REFERENCE_FRONTMATTER);
    expect(
      text,
      "bug 0426 §Fix: the reference mirror must carry the value-driven selection rule (resolved value's runtime kind), not only the static-type headline",
    ).toContain("resolved value's runtime kind");
  });

  it("mirrors the field-set / literal-discriminator match vocabulary", () => {
    const text = readDoc(REFERENCE_FRONTMATTER);
    expect(
      text,
      "bug 0426 §Fix: the reference mirror must state how a union value selects its arm (field-set / literal-discriminator match), so an object value takes the Schema-typed-object row",
    ).toContain("field-set / literal-discriminator match");
  });

  it("mirrors both never-guess degenerate cases (no arm, or more than one)", () => {
    const text = readDoc(REFERENCE_FRONTMATTER);
    // The mirror must carry BOTH cases the settled constraint names; a
    // no-match-only mirror lets a reference-only reader implement a first-arm
    // pick on ambiguity without contradicting the text (review F3).
    expect(
      text,
      "bug 0426 §Fix: the reference mirror must state that a value matching more than one arm also renders untranslated, not only a no-match value",
    ).toContain("or more than one");
  });
});

describe("b0426 (D) control — an existing QRY-18 note sentence is present (GREEN both directions)", () => {
  // Proves the harness reads the right file: this sentence is a shipped part of
  // the QRY-18 wire-name-translation note (cited by name, not line, so it does
  // not go stale as the table gains rows) and is untouched by the §Fix, so it
  // must pass at the fork and after. Its green here is what makes cells A/B/C's
  // reds attributable to genuine text absence rather than a mis-pathed read.
  it("carries the wire-name-translation note's theta-side-names sentence", () => {
    const text = readDoc(QRY_STRINGIFICATION);
    expect(
      text,
      "control: the existing QRY-18 note sentence must be present at the fork — its absence would mean the read is mis-pathed, invalidating the reds above",
    ).toContain("the theta-side names an author writes never appear in the rendered prompt");
  });
});
