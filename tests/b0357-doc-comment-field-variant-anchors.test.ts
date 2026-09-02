import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { parseDoc, errors } from "./helpers/e2e-s1";

// Bug 0357 — `scanDocComments` (src/parser/theta-document.ts:1607) classifies a
// `///` doc-comment's anchor by the leading WORD of the next non-blank,
// non-comment line and admits only the three keywords `schema` / `enum` / `fn`
// (the `production === "schema" || production === "enum" || production === "fn"`
// test at theta-document.ts:1653). A `///` above (a) a schema FIELD, (b) an enum
// VARIANT, (c) a `subagent fn` therefore classifies `"other"` and draws
// `theta/parse/doc-comment-misplaced`, which un-registers the theta via
// `hasLoadParseError` (production-composition.ts). The delegated checker
// `checkDocCommentPlacement` (src/parser/descriptions.ts:136) already admits the
// correct FIVE anchors (`schema`/`enum`/`field`/`variant`/`fn`, the eligible set
// at descriptions.ts:143-149) but its `"field"`/`"variant"` arms are unreachable
// because the scan never mints those strings.
// (docs/bugs/0357-doc-comment-field-variant-anchors-refused.md)
//
// These tests encode the doc's §Expected behaviour, seam-agnostic: the anchor
// verdict must be STRUCTURAL (a field/variant is an anchor because it sits inside
// a schema/enum body, not because of its leading word), so a field's or variant's
// NAME must not change the verdict (constraint 2). They assert the OBSERVABLE
// contract only — parse diagnostics via `parseDoc`, registration outcome via
// `discoverAndComposeFixtures` — never a specific fix seam.
//
// Registration rows use NO-params thetas. A `params:`-bearing prompt theta
// additionally requires a resolvable binder model or it fails composition with
// `theta/load/binder-model-unresolved` — an OrthogonalToThisBug gate that would
// keep the registration rows red for the wrong reason after the fix lands. The
// doc's own §Reproduction fixture D is likewise no-params (SLSH-1 binder bypass),
// so the no-params twin is the faithful end-to-end registration witness.

/** The registry code un-registering the theta on a misplaced-anchor verdict. */
const DOC_COMMENT_MISPLACED = "theta/parse/doc-comment-misplaced";

/** The name spuriously read as `fn` by the leading-word sniff (name-sensitivity probe). */
const RESERVED_KEYWORD_AS_IDENTIFIER = "theta/parse/reserved-keyword-as-identifier";

/** Error-severity diagnostic codes from a parse-only run over a `.theta` source. */
function parseErrorCodes(name: string, src: string): string[] {
  return errors(parseDoc(src, `${name}.theta`).diagnostics).map((d) => d.code);
}

/**
 * Plant one `.theta` under a fresh temp `.pi/theta/` workspace and return the
 * count of runnables `discoverAndComposeFixtures` composes (the registration
 * outcome). The inert `pi`/`ctx` doubles mirror
 * tests/e2e-s6-description-registration.test.ts; the settings plant pins the
 * settings read to a known-empty value so an absent file is not mistaken for
 * noise. `finally` (never `catch`) guarantees workspace teardown.
 */
async function composedRunnableCount(fileName: string, src: string): Promise<number> {
  const workspace = mkdtempSync(join(tmpdir(), "b0357-reg-"));
  try {
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(join(workspace, ".pi", "theta", `${fileName}.theta`), src, "utf8");
    writeFileSync(join(workspace, ".pi", "settings.json"), "{}", "utf8");
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): unknown[] => [],
      sendMessage: (): void => {},
      registerCommand: (): void => {},
      registerMessageRenderer: (): void => {},
      registerFlag: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;
    return (await discoverAndComposeFixtures(pi, ctx)).length;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

// ===========================================================================
// Row A (end-to-end) — the spec's canonical example. TWO directions: parse-only
// draws zero errors, and the theta registers.
// ===========================================================================

// (i) The verbatim canonical example (descriptions.md §Descriptions, reproduced
// as bug 0357 §Reproduction fixture A): two field `///` anchors, two variant
// `///` anchors. The `params: { req: ReviewRequest }` frontmatter is a parse-time
// no-op for `parseDoc` (binder-model resolution is a load-time concern), so the
// ONLY errors here are the four misplaced verdicts.
const CANONICAL_EXAMPLE = `---
mode: prompt
params:
  req: ReviewRequest
---
/// A user submitting a code review request
schema ReviewRequest {
  /// The programming language the code is written in
  language: string,

  /// Areas of concern to focus the review on
  focus_areas: array<string>,
}

/// Severity classification for a single review finding
enum Severity {
  /// Trivial issues; no immediate action needed
  Low,
  /// Requires attention soon
  Medium,
}

let x = 1
x
`;

describe("bug 0357 A — the canonical field+variant example parses clean", () => {
  it("RED (A.i): the two field `///` and two variant `///` draw ZERO errors", () => {
    // RED at HEAD: four `doc-comment-misplaced` (fields above `language:`/
    // `focus_areas:`, variants above `Low`/`Medium`); the schema-level and
    // enum-level `///` pass because the sniff sees `schema`/`enum` there.
    // GREEN after: all four anchors classify structurally (field-in-body,
    // variant-in-body) and draw nothing. The fixture is otherwise parse-clean
    // (verified), so exact-empty-set is the honest assertion.
    expect(
      parseErrorCodes("A-canonical", CANONICAL_EXAMPLE),
      "A.i: legal `///` above schema fields and enum variants must draw no diagnostic; at HEAD each draws doc-comment-misplaced",
    ).toEqual([]);
  });
});

// (ii) End-to-end registration. A no-params prompt theta carrying the same
// field+variant `///` anchors plus a query; twinned with a `///`-stripped
// control. WITH the `///` the theta must register (post-fix); the stripped twin
// registers in both eras, proving the doc-comment verdict is the SOLE blocker.
const REGISTER_WITH = `---
mode: prompt
---
schema ReviewRequest {
  /// The programming language the code is written in
  language: string,
}

enum Severity {
  /// Trivial issues; no immediate action needed
  Low,
  Medium,
}

@\`hi\`
`;

const REGISTER_STRIPPED = `---
mode: prompt
---
schema ReviewRequest {
  language: string,
}

enum Severity {
  Low,
  Medium,
}

@\`hi\`
`;

describe("bug 0357 A — the field+variant theta registers end-to-end", () => {
  it("RED (A.ii): a theta with field+variant `///` composes one runnable", async () => {
    // RED at HEAD: the misplaced errors are error-severity, `hasLoadParseError`
    // refuses composition → 0 runnables. GREEN after: 1.
    expect(
      await composedRunnableCount("a-with", REGISTER_WITH),
      "A.ii: the field/variant `///` verdict must not refuse registration; at HEAD it composes 0 runnables",
    ).toBe(1);
  });

  it("CONTROL (A.ii): the `///`-stripped twin registers in both eras", async () => {
    // Isolates the doc-comment verdict as the sole registration blocker: this
    // twin has no `///`, so it composes 1 runnable at HEAD and after the fix.
    expect(
      await composedRunnableCount("a-stripped", REGISTER_STRIPPED),
      "A.ii control: the same theta without `///` must register (proves the `///` verdict is the only blocker)",
    ).toBe(1);
  });
});

// ===========================================================================
// Row B (variant-only) — a `///` above an enum variant, no fields involved.
// ===========================================================================

const VARIANT_ONLY = `---
mode: prompt
---
enum Sev {
  /// trivial issues
  Low,
  High,
}

let x = 1
x
`;

describe("bug 0357 B — a `///` above an enum variant parses clean", () => {
  it("RED (B): `///` above a variant inside an enum body draws ZERO errors", () => {
    // RED at HEAD: one `doc-comment-misplaced` (the sniff reads `Low`, maps
    // `other`). GREEN after: the variant-in-enum-body anchor is eligible.
    // Verified otherwise parse-clean → exact-empty-set.
    expect(
      parseErrorCodes("B-variant", VARIANT_ONLY),
      "B: `///` above an enum variant is grammar.md:192 legal; at HEAD it draws doc-comment-misplaced",
    ).toEqual([]);
  });
});

// ===========================================================================
// Row C (subagent fn) — `subagent fn` is an FnDecl (reference/grammar.md:311,
// `FnDecl ::= SubagentMod? "fn" …`), i.e. the fifth eligible anchor. The sniff
// reads the leading word `subagent` and maps `other`. A `subagent fn` body may
// draw other, unrelated semantic diagnostics, so this row asserts specifically
// that `doc-comment-misplaced` is ABSENT, not a fully empty error set.
// ===========================================================================

const SUBAGENT_FN = `---
mode: prompt
---
/// doc for step
subagent fn step(objective: string) {
  "done"
}

let x = 1
x
`;

const PLAIN_FN = `---
mode: prompt
---
/// doc
fn rate(a: integer): integer { a }

let x = 1
x
`;

describe("bug 0357 C — `///` above a `subagent fn` is legal", () => {
  it("RED (C): `///` above a `subagent fn` draws NO doc-comment-misplaced", () => {
    // RED at HEAD: the `subagent`-led line maps `other` → one misplaced.
    // GREEN after: `subagent fn` classifies as the `fn` anchor.
    expect(
      parseErrorCodes("C-subagent-fn", SUBAGENT_FN),
      "C: `subagent fn` is an FnDecl (reference/grammar.md:311), an eligible anchor; at HEAD `///` above it draws doc-comment-misplaced",
    ).not.toContain(DOC_COMMENT_MISPLACED);
  });

  it("CONTROL (C): `///` above a plain top-level `fn` stays clean", () => {
    // GREEN both eras: the leading word `fn` already passes the sniff. Guards
    // the fn path against regression when `subagent fn` is admitted structurally.
    expect(
      parseErrorCodes("C-plain-fn", PLAIN_FN),
      "C control: `///` above a plain `fn` must never draw doc-comment-misplaced",
    ).not.toContain(DOC_COMMENT_MISPLACED);
  });
});

// ===========================================================================
// Row D (registration flip) — the doc's §Reproduction fixture D: a no-params
// prompt theta whose body is a schema with a `///`-documented field plus a
// query. WITH the field `///` registers (post-fix); the WITHOUT twin registers
// in both eras (control).
// ===========================================================================

const D_WITH = `---
mode: prompt
---
schema ReviewRequest {
  /// documented field
  language: string,
}

@\`hi\`
`;

const D_WITHOUT = `---
mode: prompt
---
schema ReviewRequest {
  language: string,
}

@\`hi\`
`;

describe("bug 0357 D — a field `///` does not un-register the theta", () => {
  it("RED (D): the field-`///` theta composes one runnable", async () => {
    // RED at HEAD: 0 (misplaced error refuses composition). GREEN after: 1.
    expect(
      await composedRunnableCount("d-with", D_WITH),
      "D: a schema field `///` must not refuse registration; at HEAD it composes 0 runnables",
    ).toBe(1);
  });

  it("CONTROL (D): the field-`///`-stripped twin registers in both eras", async () => {
    expect(
      await composedRunnableCount("d-without", D_WITHOUT),
      "D control: the same theta without the field `///` must register in both eras",
    ).toBe(1);
  });
});

// ===========================================================================
// Name-sensitivity probe (constraint 2) — the anchor verdict must be STRUCTURAL,
// not name-keyed. Two fields sitting under a `///` inside the SAME schema body
// shape differ only in their NAME; the verdict must not change between them.
// ===========================================================================

const FIELD_NAMED_FN = `---
mode: prompt
---
schema X {
  /// a documented field
  fn: string,
}

let x = 1
x
`;

const FIELD_NAMED_LANGUAGE = `---
mode: prompt
---
schema X {
  /// a documented field
  language: string,
}

let x = 1
x
`;

describe("bug 0357 name-sensitivity — a field's NAME must not change the verdict", () => {
  it("CONTROL (name): a field spelled `fn: string` draws NO doc-comment-misplaced", () => {
    // GREEN both eras — but at HEAD for the WRONG reason: the sniff reads the
    // leading word `fn` and accepts the anchor (it ALSO draws
    // reserved-keyword-as-identifier for the illegal field name). Post-fix the
    // field is admitted structurally, name irrelevant. Asserting misplaced is
    // ABSENT (not the full error set) tolerates the reserved-keyword diagnostic.
    const codes = parseErrorCodes("name-fn", FIELD_NAMED_FN);
    expect(
      codes,
      "name: a field named `fn` must classify as a FIELD anchor (structural), never misplaced",
    ).not.toContain(DOC_COMMENT_MISPLACED);
    // Sanity: at HEAD the reserved-keyword diagnostic is what the sniff draws
    // instead; asserting its presence documents WHY this control is green-at-HEAD
    // for the wrong reason (the name, not the structure, is being read).
    expect(
      codes,
      "name: the illegal identifier `fn` is a reserved keyword (this is the diagnostic the name draws, not misplaced)",
    ).toContain(RESERVED_KEYWORD_AS_IDENTIFIER);
  });

  it("RED (name): the twin field spelled `language: string` also draws NO misplaced", () => {
    // The name-insensitivity RED witness: same structural position, a legal
    // field name, and the current name-keyed sniff draws misplaced.
    // RED at HEAD: present. GREEN after: absent. The NAME must not flip the
    // verdict that the `fn:` twin already passes.
    expect(
      parseErrorCodes("name-language", FIELD_NAMED_LANGUAGE),
      "name: a field named `language` sits in the same body position as `fn:` and must classify as a FIELD anchor; at HEAD the name-keyed sniff draws misplaced",
    ).not.toContain(DOC_COMMENT_MISPLACED);
  });
});

// ===========================================================================
// Misplaced controls — `///` above genuinely ineligible productions must KEEP
// drawing `doc-comment-misplaced`, byte-identical, in BOTH eras (constraint 1).
// ===========================================================================

const CTRL_TOP_LEVEL_LET = `---
mode: prompt
---
/// doc above let
let x = 1
x
`;

const CTRL_IMPORT = `---
mode: prompt
---
/// doc above import
import { helper } from "./lib.thetalib"
let x = 1
x
`;

const CTRL_EXPORT_REEXPORT = `---
mode: prompt
---
/// doc above export re-export
export { helper } from "./lib.thetalib"
let x = 1
x
`;

const CTRL_BLOCK_INTERIOR_LET = `---
mode: prompt
---
if true {
  /// doc above a block-interior let
  let y = 1
}
let x = 1
x
`;

const CTRL_EOF = `---
mode: prompt
---
let x = 1
x
/// doc at EOF, no following production
`;

describe("bug 0357 controls — ineligible anchors keep drawing misplaced (both eras)", () => {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["above top-level `let`", CTRL_TOP_LEVEL_LET],
    ["above `import … from`", CTRL_IMPORT],
    ["above `export … from` re-export", CTRL_EXPORT_REEXPORT],
    ["above a block-interior `let`", CTRL_BLOCK_INTERIOR_LET],
    ["at EOF (doc non-goal preserved)", CTRL_EOF],
  ];
  for (const [what, src] of rows) {
    it(`CONTROL: \`///\` ${what} keeps drawing misplaced`, () => {
      expect(
        parseErrorCodes(`ctrl-${what}`, src),
        `control: \`///\` ${what} is ineligible and must keep drawing doc-comment-misplaced`,
      ).toContain(DOC_COMMENT_MISPLACED);
    });
  }
});

// ===========================================================================
// `////` (four slashes) is a REGULAR comment, not a doc-comment — no misplaced.
// ===========================================================================

const CTRL_FOUR_SLASH = `---
mode: prompt
---
//// four slashes is a regular comment, not a doc-comment
let x = 1
x
`;

describe("bug 0357 control — `////` is a regular comment", () => {
  it("CONTROL: `////` above a `let` draws NO doc-comment-misplaced", () => {
    expect(
      parseErrorCodes("ctrl-four-slash", CTRL_FOUR_SLASH),
      "control: `////` is a regular comment; it must never draw doc-comment-misplaced",
    ).not.toContain(DOC_COMMENT_MISPLACED);
  });
});

// ===========================================================================
// Declaration-form controls — every `schema` declaration form (object / alias /
// by) is an eligible anchor and must stay clean in both eras.
// ===========================================================================

const CTRL_SCHEMA_OBJECT = `---
mode: prompt
---
/// doc
schema X { a: string }

let x = 1
x
`;

const CTRL_SCHEMA_ALIAS = `---
mode: prompt
---
/// doc
schema X = "a" | "b"

let x = 1
x
`;

const CTRL_SCHEMA_BY = `---
mode: prompt
---
schema A { k: "a" }
schema B { k: "b" }
/// doc
schema X by k = A | B

let x = 1
x
`;

describe("bug 0357 controls — schema declaration forms stay clean (both eras)", () => {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["object-form `schema X { a: string }`", CTRL_SCHEMA_OBJECT],
    ['alias-form `schema X = "a" | "b"`', CTRL_SCHEMA_ALIAS],
    ["by-form `schema X by k = A | B`", CTRL_SCHEMA_BY],
  ];
  for (const [what, src] of rows) {
    it(`CONTROL: \`///\` above ${what} draws NO misplaced`, () => {
      expect(
        parseErrorCodes(`ctrl-decl-${what}`, src),
        `control: \`///\` above ${what} is an eligible anchor and must stay clean`,
      ).not.toContain(DOC_COMMENT_MISPLACED);
    });
  }
});

// ===========================================================================
// Additional constraint-1 misplaced controls — a `///` above an EXPRESSION
// statement and above a top-level control-flow `if` keeps drawing misplaced
// (constraint 1 names "expression / control-flow" explicitly).
// ===========================================================================

const CTRL_EXPR_STMT = `---
mode: prompt
---
/// doc above an expression statement
1 + 1
let x = 1
x
`;

const CTRL_TOP_LEVEL_IF = `---
mode: prompt
---
/// doc above a top-level if
if true { 1 }
let x = 1
x
`;

describe("bug 0357 controls — expression / control-flow anchors stay misplaced", () => {
  it("CONTROL: `///` above an expression statement keeps drawing misplaced", () => {
    expect(
      parseErrorCodes("ctrl-expr", CTRL_EXPR_STMT),
      "control: `///` above an expression statement is ineligible (constraint 1)",
    ).toContain(DOC_COMMENT_MISPLACED);
  });

  it("CONTROL: `///` above a top-level `if` keeps drawing misplaced", () => {
    expect(
      parseErrorCodes("ctrl-top-if", CTRL_TOP_LEVEL_IF),
      "control: `///` above a top-level control-flow `if` is ineligible (constraint 1)",
    ).toContain(DOC_COMMENT_MISPLACED);
  });
});

// ===========================================================================
// Range-precision corners (characterization — deliberate, GREEN post-fix). The
// structural verdict is a decl-RANGE containment test, and fields/variants
// carry no per-row range (SchemaFieldSource / EnumVariantDecl in
// src/parser/schema-declarations.ts), so the body-interior bound must be
// `start.line < anchorLine <= end.line`. The inclusive upper bound is REQUIRED
// so a last field/variant sharing the closing-`}` line still classifies as an
// anchor (row `LAST_ON_BRACE`); its deliberate consequence is that a `///`
// directly above a bare closing `}` — documenting nothing — classifies as a
// body row and draws nothing (rows `DANGLING_*`). That is a lost error on an
// empty-target doc comment, never a wrong refusal, and is the same tolerated
// interposition looseness the bug doc records under §Non-goals; it is pinned
// here so the tradeoff is deliberate rather than incidental. A `///` above a
// NESTED `fn` classifies misplaced (the FnDecl is inside the outer fn's body
// range, not a top-level decl start), which is spec-aligned — a nested `fn` is
// forbidden and also draws `theta/parse/nested-fn`, so the verdict carries no
// registration consequence either way.
// ===========================================================================

const LAST_ON_BRACE = `---
mode: prompt
---
schema Y {
  /// doc for the last field
  b: integer }

let x = 1
x
`;

const DANGLING_SCHEMA = `---
mode: prompt
---
schema X {
  a: string,
  /// dangling above the closing brace
}

let x = 1
x
`;

const DANGLING_ENUM = `---
mode: prompt
---
enum E {
  Low,
  /// dangling above the closing brace
}

let x = 1
x
`;

const NESTED_FN = `---
mode: prompt
---
fn outer() {
  /// doc for a nested fn
  fn inner() { 1 }
  2
}

let x = 1
x
`;

describe("bug 0357 range-precision corners (characterization)", () => {
  it("a `///` above a last field sharing the closing-`}` line is a FIELD anchor (clean)", () => {
    expect(
      parseErrorCodes("corner-last-on-brace", LAST_ON_BRACE),
      "the inclusive upper bound admits a last field on the closing-`}` line",
    ).not.toContain(DOC_COMMENT_MISPLACED);
  });

  it("a `///` directly above a bare closing `}` classifies as a body row (deliberate: no misplaced)", () => {
    expect(
      parseErrorCodes("corner-dangling-schema", DANGLING_SCHEMA),
      "deliberate range-precision tradeoff: a dangling `///` above `}` draws nothing",
    ).not.toContain(DOC_COMMENT_MISPLACED);
    expect(
      parseErrorCodes("corner-dangling-enum", DANGLING_ENUM),
      "deliberate range-precision tradeoff: a dangling `///` above enum `}` draws nothing",
    ).not.toContain(DOC_COMMENT_MISPLACED);
  });

  it("a `///` above a nested `fn` stays misplaced (spec-aligned; nested-fn also fires)", () => {
    const codes = parseErrorCodes("corner-nested-fn", NESTED_FN);
    expect(
      codes,
      "a nested fn is inside the outer fn's body range, not a top-level decl start",
    ).toContain(DOC_COMMENT_MISPLACED);
    expect(
      codes,
      "a nested fn is forbidden regardless of the `///`",
    ).toContain("theta/parse/nested-fn");
  });
});
