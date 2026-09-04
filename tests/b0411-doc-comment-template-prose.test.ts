import { describe, expect, it } from "vitest";
import { parseDoc, errors, hasCode } from "./helpers/e2e-s1";
import type { ThetaDocument } from "../src/parser/theta-document";

// Bug 0411 — `scanDocComments` (src/parser/theta-document.ts:1821) was a raw
// line-regex pass (`docLine = /^[ \t]*\/\/\/(?!\/)(.*)$/`, :1835) over every
// line of `split.bodyText`, called at :1097, with no `@`...`` template-region
// guard (now fixed by an exclusion predicate built at the call site from
// `lex.tokens` and threaded into the two line-oriented scans — §Fix option 1).
// A `///`-leading line INSIDE a query template was therefore misread as
// a doc-comment run. lexical.md:24 pins the opposite: "Comments inside the
// *text* of a `@`...`` query template are not comments — they are part of the
// rendered prompt." Two arms, one root cause:
//   (a) a `///` prose line inside a template refuses the theta with
//       `theta/parse/doc-comment-misplaced`;
//   (b)/(c) a template ending on a `///`-led closing line silently injects its
//       prose into the following schema's lowered `description:` — and MERGES
//       with the schema's own real `///` run (nothing separates the two runs
//       to the forward `docLine` scan), via `attachDocDescriptions`'
//       `byLine.set` at :1935.
//
// These encode §Expected behaviour, not current behaviour. At the current fork
// (a)/(b)/(c) are RED; the CONTROL — a legitimate `///` run above a schema
// OUTSIDE any template — is GREEN both directions, proving the fix does not
// break ordinary doc-comment lowering (the 0357/0358 axis).
//
// The schema-DECL description accessor is the AST field
// `body.statements[i].description` on the `kind === "schema"` decl (the
// `SchemaDecl.description?: string` slot, theta-document.ts:823), attached by
// `attachDocDescriptions` before `mergeByLine`. Confirmed by a probe over
// arm (b): `S.description === "injected description\`"`, diagnostics `[]`.

const DOC_MISPLACED = "theta/parse/doc-comment-misplaced";

/**
 * The lowered/attached schema-DECL description off the parsed body, or
 * `undefined` when the decl carries none. A parsed body with no `schema`
 * decl of the given name is an unmet precondition and FAILS LOUDLY naming it
 * — never a silent pass over nothing verified (CLAUDE.md §Testing).
 */
function schemaDescription(doc: ThetaDocument, name: string): string | undefined {
  const decl = doc.body.statements.find(
    (s) => (s as { kind?: string; name?: string }).kind === "schema" &&
      (s as { name?: string }).name === name,
  );
  if (decl === undefined) {
    throw new Error(
      `unmet precondition: parsed body carries no schema decl named \`${name}\`; ` +
        `the description slot under test is unreachable`,
    );
  }
  return (decl as { description?: string }).description;
}

// (a) Refusal of valid prose. The `///` line is rendered prompt text per
// lexical.md:24; the theta is valid and must load clean.
const REFUSAL = `---
mode: prompt
---
let q = @\`
Guidelines:
/// keep it short
Done.
\`
q
`;

// (b) Silent description injection. The closing backtick sits at the end of a
// `///`-led prose line; the very next line is a `schema` head. The template
// prose must NOT lower into S's description; S carries none.
const INJECTION = `---
mode: prompt
---
let q = @\`
/// injected description\`
schema S {
  a: integer,
}
q
`;

// (c) Merge with a real run. A legitimate `/// real description` sits between
// the closing-backtick line and `schema S`. Run formation must NOT merge
// across the template boundary: S's description is "real description" ALONE,
// not template-prose + `\n` + real.
const MERGE = `---
mode: prompt
---
let q = @\`
/// injected description\`
/// real description
schema S {
  a: integer,
}
q
`;

// CONTROL — a legitimate `///` run directly above a schema OUTSIDE any
// template still lowers into the description (0357/0358 axis intact). GREEN
// both directions.
const CONTROL = `---
mode: prompt
---
/// a real schema
schema T {
  a: integer,
}
`;

// ===========================================================================
// (a) Refusal — a `///` prose line inside a template must not refuse the load.
// RED at fork: the line is misread as a doc comment, its anchor resolves to
// "other" (a line inside the `let`), and `checkDocCommentPlacement` emits
// `theta/parse/doc-comment-misplaced`. GREEN once the scan excludes template
// lines.
// ===========================================================================
describe("bug 0411 (a) — a `///` prose line inside a template does not refuse the theta", () => {
  it("emits no doc-comment-misplaced and loads clean", () => {
    const doc = parseDoc(REFUSAL, "b0411-refusal.theta");
    expect(
      hasCode(doc.diagnostics, DOC_MISPLACED),
      "a `///`-led prose line inside a `@`...`` template is rendered prompt " +
        "text (lexical.md:24), not a doc comment; it must not draw " +
        "theta/parse/doc-comment-misplaced",
    ).toBe(false);
    expect(
      errors(doc.diagnostics).map((d) => d.code),
      "the theta is valid — the template prose is rendered, not extracted — so " +
        "it must load with zero error-severity diagnostics",
    ).toEqual([]);
  });
});

// ===========================================================================
// (b) Injection — template prose must not lower into the following schema's
// description. RED at fork: S.description === "injected description`". GREEN
// once the scan excludes the in-template `///` line.
// ===========================================================================
describe("bug 0411 (b) — template prose does not inject into the schema description", () => {
  it("schema S carries no description and loads clean", () => {
    const doc = parseDoc(INJECTION, "b0411-injection.theta");
    expect(
      schemaDescription(doc, "S"),
      "a template-body `///` line is prompt prose, not a doc comment; it must " +
        "not lower into S's description",
    ).toBeUndefined();
    expect(
      doc.diagnostics.map((d) => d.code),
      "the injection shape is silent at the fork; the load must stay clean once " +
        "the prose no longer forms a run",
    ).toEqual([]);
  });
});

// ===========================================================================
// (c) Merge — a real `///` run after the template boundary must lower ALONE.
// RED at fork: S.description === "injected description`\nreal description"
// (the two runs merge — nothing separates them to the forward `docLine`
// scan). GREEN once the in-template line is excluded, leaving the real run to
// form by itself.
// ===========================================================================
describe("bug 0411 (c) — a real `///` run after the template does not merge with template prose", () => {
  it("schema S carries the real description alone and loads clean", () => {
    const doc = parseDoc(MERGE, "b0411-merge.theta");
    expect(
      schemaDescription(doc, "S"),
      "run formation must not cross the template boundary: the legitimate " +
        "`/// real description` run forms alone, so S's description is exactly it",
    ).toBe("real description");
    expect(
      doc.diagnostics.map((d) => d.code),
      "the merge shape is silent at the fork; the load must stay clean",
    ).toEqual([]);
  });
});

// ===========================================================================
// CONTROL — a legitimate `///` run above a schema OUTSIDE any template still
// lowers. GREEN both directions; guards the fix against over-exclusion of
// ordinary doc-comment lowering.
// ===========================================================================
describe("bug 0411 CONTROL — an ordinary `///` above a schema still lowers", () => {
  it("schema T carries the description and draws no doc-comment-misplaced", () => {
    const doc = parseDoc(CONTROL, "b0411-control.theta");
    expect(
      schemaDescription(doc, "T"),
      "a `///` run directly above a schema OUTSIDE any template must still lower " +
        "into the schema-DECL description (0357/0358 axis)",
    ).toBe("a real schema");
    expect(
      hasCode(doc.diagnostics, DOC_MISPLACED),
      "an ordinary well-placed doc-comment run must not be refused",
    ).toBe(false);
  });
});
