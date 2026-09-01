import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import { buildBinderSystemPrompt } from "../src/binder/binder-system-prompt";
import { renderSystemPrompt } from "../src/parser/system-interpolation";

// Bug 0299 — a value-less `description:` or `system:` (YAML null scalar: bare
// key, `null`, or `~`) is stringified by `String(item.value.value)` into the
// four characters "null" and threaded verbatim to three surfaces (autocomplete
// blurb, binder grounding line, subagent child system prompt) with zero
// diagnostics. The sibling `argument-hint:` arm's `typeof === "string"` guard
// is the correct in-file control: it maps the same shape to absent.
//
// This suite witnesses the POST-FIX target — the null scalar maps to ABSENT at
// both arms (mirroring the `argument-hint:` guard), while numeric/boolean
// coercion of a value the author DID write stays, and `system: null` collapses
// to the byte-identical zero-part template that `system: ""` already produces.
//
// Spec anchors (verified against the tree at authoring time):
//   - frontmatter-fields-a.md:37 — `description` default is `null`: "the
//     slash-command entry registers without description text; the binder prompt
//     omits the `Description:` line. No warning". The null VALUE is the spec's
//     own name for the absent case, so a null-scalar `description:` must record
//     no text, not the string "null".
//   - frontmatter-fields-a.md:44 — no `system:` content → the spawned
//     conversation runs under the model's training defaults, not under the
//     instruction "null".
//   - binder/binder-bypass-and-envelope.md:115 (item 2) — the `Description:`
//     line appears iff the description is non-empty; a rendered
//     `Description: null` falsely asserts a description exists.
//
// Parent adjudication encoded here: null → absent at BOTH arms; numeric/boolean
// coercion of an author-written value stays; `system: null` maps byte-identical
// to `system: ""` (a zero-part template rendering to "").
//
// WHY these assert the post-fix target and red today: the current arms
// (frontmatter.ts:1093 description, :1172 system) call `String(null)` → "null",
// which is non-empty and crosses every downstream non-emptiness guard. The
// control rows (F/G/H/I) already pass today and must stay green after the fix —
// they lock non-regression of the `argument-hint:` warning, the `""` drop, and
// the surviving numeric coercion.

/** One frontmatter row: `---` fenced frontmatter over the inert body. */
function row(...frontmatterLines: string[]): ReturnType<typeof parseDoc> {
  const src = `---\n${frontmatterLines.join("\n")}\n---\nlet x = 1\n`;
  return parseDoc(src);
}

describe("bug 0299 — null-scalar description/system map to absent, coercion stays", () => {
  // --- RED rows: description null scalar → absent (three spellings) ---------
  // Today each records description "null"; the target is `undefined` with no
  // diagnostic (the absent case is warning-free by frontmatter-fields-a.md:37).

  it("A: `description:` (bare key) records no description text and no diagnostic", () => {
    const d = row("mode: prompt", "description:");
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.description).toBeUndefined();
    expect(d.diagnostics.length).toBe(0);
  });

  it("B: `description: null` (explicit null) records no description text and no diagnostic", () => {
    const d = row("mode: prompt", "description: null");
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.description).toBeUndefined();
    expect(d.diagnostics.length).toBe(0);
  });

  it("C: `description: ~` (tilde null) records no description text and no diagnostic", () => {
    const d = row("mode: prompt", "description: ~");
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.description).toBeUndefined();
    expect(d.diagnostics.length).toBe(0);
  });

  // --- RED rows: system null scalar → zero-part template (two spellings) ----
  // Today each records parts:[{kind:"text",value:"null"}]; the target is the
  // byte-identical zero-part template `system: ""` produces (renders to "").

  it("D: `system:` (bare key) yields the zero-part template and no diagnostic", () => {
    const d = row("mode: subagent", "system:");
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.system).toEqual({ parts: [] });
    expect(d.diagnostics.length).toBe(0);
  });

  it("E: `system: null` (explicit null) yields the zero-part template and no diagnostic", () => {
    const d = row("mode: subagent", "system: null");
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.system).toEqual({ parts: [] });
    expect(d.diagnostics.length).toBe(0);
  });

  // --- RED rows: the two downstream render seams the fabricated bytes reach --

  it("J-binder: a null-scalar `description:` omits the binder `Description:` line", () => {
    // binder-bypass-and-envelope.md:115 item 2: the Description line appears
    // iff the description is non-empty. Today the arm hands "null" through and
    // the builder renders `Description: null`; the target omits the token.
    const fm = row("mode: prompt", "description:").frontmatter ?? undefined;
    // `exactOptionalPropertyTypes` forbids an explicit `undefined` on the
    // optional `description`/`argumentHint` fields, so both are conditionally
    // spread rather than assigned straight from the (possibly-absent) `fm`.
    const prompt = buildBinderSystemPrompt({
      name: "t",
      ...(fm?.description !== undefined ? { description: fm.description } : {}),
      ...(fm?.argumentHint !== undefined ? { argumentHint: fm.argumentHint } : {}),
      params: [],
      rawArguments: "",
    });
    expect(prompt).not.toContain("Description:");
  });

  it("J-system: a null-scalar `system:` renders the empty child system prompt", () => {
    // frontmatter-fields-a.md:44: no `system:` content → training defaults, not
    // the instruction "null". The zero-part template renders to "".
    const fm = row("mode: subagent", "system:").frontmatter;
    expect(fm).not.toBeNull();
    const rendered = renderSystemPrompt({ template: fm!.system!, params: {} });
    expect(rendered.ok).toBe(true);
    expect(rendered.ok && rendered.text).toBe("");
  });

  // --- CONTROL rows: green today AND after the fix (lock non-regression) -----

  it("F control: `argument-hint:` keeps its byte-identical single warning", () => {
    // The in-file control arm already maps the null scalar to absent AND draws
    // exactly one advisory about the missing `description:` — not about the
    // null value. The fix must not disturb this warning's count/code/severity.
    const d = row("mode: prompt", "argument-hint:");
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.argumentHint).toBeUndefined();
    expect(d.diagnostics.length).toBe(1);
    expect(d.diagnostics[0]?.severity).toBe("warning");
    expect(d.diagnostics[0]?.code).toBe("theta/load/argument-hint-not-displayed");
  });

  it("G control: `description: \"\"` drops at the non-empty spread, no diagnostic", () => {
    const d = row("mode: prompt", 'description: ""');
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.description).toBeUndefined();
    expect(d.diagnostics.length).toBe(0);
  });

  it("H control: `description: real text` is retained verbatim", () => {
    const d = row("mode: prompt", "description: real text");
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.description).toBe("real text");
  });

  it('control: `system: ""` yields the zero-part template that rows D/E are defined to match', () => {
    // WHY this control exists: rows D/E assert byte-identical equality against
    // this `""` path's output, not against a literal `{ parts: [] }` written
    // independently in two places. If this path drifted, D/E would stay green
    // while the anchor they target moved out from under them.
    const d = row("mode: subagent", 'system: ""');
    expect(d.frontmatter).not.toBeNull();
    expect(d.frontmatter?.system).toEqual({ parts: [] });
    expect(d.diagnostics.length).toBe(0);
  });

  it("I control: numeric coercion of an author-written value stays (both arms)", () => {
    // A value the author DID write (a YAML integer scalar) is coerced, not
    // dropped — the non-goal boundary of this report. Only the null case stops
    // fabricating.
    const desc = row("mode: prompt", "description: 42");
    expect(desc.frontmatter?.description).toBe("42");
    expect(desc.diagnostics.length).toBe(0);

    const sys = row("mode: subagent", "system: 42");
    expect(sys.frontmatter?.system).toEqual({
      parts: [{ kind: "text", value: "42" }],
    });
  });
});
