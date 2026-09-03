import { describe, expect, it } from "vitest";
import {
  buildBinderSystemPrompt,
  renderBinderParamLine,
  type BuildBinderSystemPromptInput,
  type SystemPromptParamField,
} from "../src/binder/binder-system-prompt";

// V11d-T — failing tests for the paired `V11d` "Binder system-prompt builder".
//
// Closes the code-keyed obligation area `cka-45`
// (binder/binder-bypass-and-envelope.md §"System-prompt structure (normative)"):
// the eight structural items (Theta-identity line, Description line,
// Argument-hint line, Parameters block, User-arguments line, Session-context
// block, Envelope-kinds enumeration, No-invent-defaults instruction), the
// *Type display* reference renderings, the *Default-literal rendering* rule, and
// the *Parameter-line reference renderings* table.
//
// Each test reds on its own primary assertion because the V11d behaviour is
// absent: both `buildBinderSystemPrompt` and `renderBinderParamLine` return the
// empty string in the V11d-T stub, so every structural-item / Type-display /
// Default-literal / byte-exact-reference-rendering assertion fails on absence,
// not on a compile error, a missing fixture, or a harness throw.
//
// Spec: binder/binder-bypass-and-envelope.md (§"System-prompt structure
// (normative)", Type display, Default-literal rendering, Parameter-line
// reference renderings). The compact-transcript body used by item 6 is rendered
// by V11b (BNDR-7/8/9) and supplied to this builder as an input.

// --- helpers ----------------------------------------------------------------

/** U+2014 EM DASH, the description separator's middle byte (item 4). */
const EM_DASH = "\u2014";

const baseInput = (
  overrides: Partial<BuildBinderSystemPromptInput> = {},
): BuildBinderSystemPromptInput => ({
  name: "code-review",
  params: [],
  rawArguments: "",
  ...overrides,
});

/** The prompt's lines, split on the LF byte. */
const linesOf = (prompt: string): readonly string[] => prompt.split("\n");

/** The single line equal to `value`, or the count when asserting uniqueness. */
const countLines = (prompt: string, value: string): number =>
  linesOf(prompt).filter((line) => line === value).length;

const requiredField = (
  wireName: string,
  type: string,
  description?: string,
): SystemPromptParamField => ({
  wireName,
  type,
  requirement: { kind: "required" },
  ...(description === undefined ? {} : { description }),
});

const defaultedField = (
  wireName: string,
  type: string,
  literal: string,
  description?: string,
): SystemPromptParamField => ({
  wireName,
  type,
  requirement: { kind: "default", literal },
  ...(description === undefined ? {} : { description }),
});

// ============================================================================
// Item 1 — Theta identity line
// ============================================================================

describe("V11d-T — Theta identity line (cka-45 item 1)", () => {
  it("cka-45 item 1: emits exactly one `Theta: /<name>` line with the bare name", () => {
    const prompt = buildBinderSystemPrompt(baseInput({ name: "code-review" }));
    expect(countLines(prompt, "Theta: /code-review")).toBe(1);
  });
});

// ============================================================================
// Item 2 — Description line (conditional: present + absent)
// ============================================================================

describe("V11d-T — Description line (cka-45 item 2)", () => {
  it("cka-45 item 2: a non-empty `description:` emits `Description: <description>`", () => {
    const prompt = buildBinderSystemPrompt(
      baseInput({ description: "Review code for issues." }),
    );
    expect(linesOf(prompt)).toContain("Description: Review code for issues.");
  });

  it("cka-45 item 2: an absent `description:` omits the `Description:` token entirely", () => {
    const prompt = buildBinderSystemPrompt(baseInput());
    // The prompt is still built (identity line present) but carries no
    // Description line — the negative half of the conditional rule.
    expect(linesOf(prompt)).toContain("Theta: /code-review");
    expect(prompt).not.toContain("Description:");
  });

  it("cka-45 item 2: an empty `description:` omits the `Description:` token entirely", () => {
    const prompt = buildBinderSystemPrompt(baseInput({ description: "" }));
    expect(linesOf(prompt)).toContain("Theta: /code-review");
    expect(prompt).not.toContain("Description:");
  });
});

// ============================================================================
// Item 3 — Argument-hint line (conditional: present + absent)
// ============================================================================

describe("V11d-T — Argument-hint line (cka-45 item 3)", () => {
  it("cka-45 item 3: a non-empty `argument-hint:` emits `Argument hint: <value>` exactly once", () => {
    const hint = "<language> focusing on <areas>, by <author>";
    const prompt = buildBinderSystemPrompt(baseInput({ argumentHint: hint }));
    expect(countLines(prompt, `Argument hint: ${hint}`)).toBe(1);
  });

  it("cka-45 item 3: an absent `argument-hint:` omits the `Argument hint:` token entirely", () => {
    const prompt = buildBinderSystemPrompt(baseInput());
    expect(linesOf(prompt)).toContain("Theta: /code-review");
    expect(prompt).not.toContain("Argument hint:");
  });

  it("cka-45 item 3: an empty `argument-hint:` omits the `Argument hint:` token entirely", () => {
    const prompt = buildBinderSystemPrompt(baseInput({ argumentHint: "" }));
    expect(linesOf(prompt)).toContain("Theta: /code-review");
    expect(prompt).not.toContain("Argument hint:");
  });
});

// ============================================================================
// Item 4 — Parameters block (conditional: present + absent), structure
// ============================================================================

describe("V11d-T — Parameters block (cka-45 item 4)", () => {
  it("cka-45 item 4: ≥1 field emits the unindented `Parameters:` header and one per-field line in declaration order", () => {
    const prompt = buildBinderSystemPrompt(
      baseInput({
        params: [
          requiredField("language", "string", "the language being reviewed"),
          requiredField("author", "Author", "the author of the code under review"),
        ],
      }),
    );
    const lines = linesOf(prompt);
    expect(lines).toContain("Parameters:");
    const headerIdx = lines.indexOf("Parameters:");
    const langIdx = lines.indexOf("  language (string) required — the language being reviewed");
    const authorIdx = lines.indexOf(
      "  author (Author) required — the author of the code under review",
    );
    // header precedes both per-field lines; declaration order preserved.
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(langIdx).toBeGreaterThan(headerIdx);
    expect(authorIdx).toBeGreaterThan(langIdx);
  });

  it("cka-45 item 4: each per-field line is indented with exactly two U+0020 SPACE (no tab, no third leading space)", () => {
    const prompt = buildBinderSystemPrompt(
      baseInput({ params: [requiredField("language", "string")] }),
    );
    const fieldLine = linesOf(prompt).find((line) => line.includes("language (string)"));
    expect(fieldLine).toBeDefined();
    // exactly two leading U+0020, and the third character is not whitespace.
    expect(fieldLine).toMatch(/^ {2}\S/u);
    expect(fieldLine?.startsWith("  language")).toBe(true);
  });

  it("cka-45 item 4: `params:` absent/empty omits the entire Parameters block (header and all per-field lines)", () => {
    const prompt = buildBinderSystemPrompt(baseInput({ params: [] }));
    expect(linesOf(prompt)).toContain("Theta: /code-review");
    expect(prompt).not.toContain("Parameters:");
  });
});

// ============================================================================
// Item 4 — Type display reference renderings (normative table)
// ============================================================================

describe("V11d-T — Type display reference renderings (cka-45 item 4, Type display)", () => {
  const cases: ReadonlyArray<readonly [declared: string, renders: string]> = [
    ["string", "string"],
    ["integer", "integer"],
    ["boolean", "boolean"],
    ["Severity", "Severity"],
    ["Author", "Author"],
    ["array<integer>", "array<integer>"],
    ["string | null", "string | null"],
    ["Cat | Dog", "Cat | Dog"],
  ];

  for (const [declared, renders] of cases) {
    it(`cka-45 Type display: declared \`${declared}\` renders the surface type \`${renders}\``, () => {
      const line = renderBinderParamLine(requiredField("field", declared));
      expect(line).toBe(`  field (${renders}) required`);
    });
  }
});

// ============================================================================
// Item 4 — Default-literal rendering forms
// ============================================================================

describe("V11d-T — Default-literal rendering (cka-45 item 4, Default-literal rendering)", () => {
  const cases: ReadonlyArray<readonly [type: string, literal: string]> = [
    ["Severity", "Severity.High"],
    ["string", '"hello"'],
    ["array<integer>", "[1, 2, 3]"],
    ["array<integer>", "[]"],
  ];

  for (const [type, literal] of cases) {
    it(`cka-45 Default-literal: default \`${literal}\` renders \`default=${literal}\``, () => {
      const line = renderBinderParamLine(defaultedField("field", type, literal));
      expect(line).toBe(`  field (${type}) default=${literal}`);
    });
  }
});

// ============================================================================
// Item 4 — Parameter-line reference renderings (byte-exact table)
//
// RENDERER-LEVEL ORACLES. The three description-bearing cells hand-build a
// `SystemPromptParamField` with a `description`, which no registrable theta
// produces: the ` — <description>` slot is RESERVED with no theta 1.0 carrier
// (binder-bypass-and-envelope.md §System-prompt structure item 4;
// `binderPromptParamField` sets no `description`). They pin the exact bytes of
// `renderBinderParamLine`'s description branch so a future carrier inherits
// them; they are NOT theta-source obligations and are kept, not deleted, on
// that footing.
// ============================================================================

describe("V11d-T — Parameter-line reference renderings (cka-45 item 4, Parameter-line reference renderings)", () => {
  it("cka-45 Parameter-line: `language: string` with description renders byte-exact", () => {
    const line = renderBinderParamLine(
      requiredField("language", "string", "the language being reviewed"),
    );
    expect(line).toBe(`  language (string) required ${EM_DASH} the language being reviewed`);
  });

  it("cka-45 Parameter-line: `focus_areas: array<string> = []` with description renders byte-exact", () => {
    const line = renderBinderParamLine(
      defaultedField("focus_areas", "array<string>", "[]", "comma-separated focus areas"),
    );
    expect(line).toBe(`  focus_areas (array<string>) default=[] ${EM_DASH} comma-separated focus areas`);
  });

  it("cka-45 Parameter-line: `author: Author` with description renders byte-exact", () => {
    const line = renderBinderParamLine(
      requiredField("author", "Author", "the author of the code under review"),
    );
    expect(line).toBe(`  author (Author) required ${EM_DASH} the author of the code under review`);
  });

  it("cka-45 Parameter-line: description-omitted form ends after `required` (no trailing space, no em-dash)", () => {
    const line = renderBinderParamLine(requiredField("language", "string"));
    expect(line).toBe("  language (string) required");
    expect(line.endsWith("required")).toBe(true);
    expect(line).not.toContain(EM_DASH);
    expect(line.endsWith(" ")).toBe(false);
  });

  it("cka-45 Parameter-line: an empty `description:` omits the ` — <description>` segment (normalises to omitted)", () => {
    const line = renderBinderParamLine(requiredField("language", "string", ""));
    // Byte-exact positive form (reds against the empty stub); the segment,
    // including the em-dash, is absent.
    expect(line).toBe("  language (string) required");
    expect(line).not.toContain(EM_DASH);
  });
});

// ============================================================================
// Item 5 — User-arguments line
// ============================================================================

describe("V11d-T — User-arguments line (cka-45 item 5)", () => {
  it("cka-45 item 5: emits `User arguments: <raw>` with leading/trailing slash-argument whitespace stripped", () => {
    const prompt = buildBinderSystemPrompt(
      baseInput({ rawArguments: "  TypeScript focusing on error handling, by Ada Lovelace  " }),
    );
    expect(linesOf(prompt)).toContain(
      "User arguments: TypeScript focusing on error handling, by Ada Lovelace",
    );
  });

  it("cka-45 item 5: strips only ASCII slash-argument whitespace, preserving non-ASCII (U+00A0)", () => {
    const prompt = buildBinderSystemPrompt(
      baseInput({ rawArguments: " \u00A0foo\u00A0 " }),
    );
    // The ASCII spaces are stripped; the U+00A0 pair is preserved verbatim.
    expect(linesOf(prompt)).toContain("User arguments: \u00A0foo\u00A0");
  });

  it("cka-45 item 5: with no arguments the line still appears as `User arguments: ` (token + single space + nothing)", () => {
    const prompt = buildBinderSystemPrompt(baseInput({ rawArguments: "" }));
    expect(linesOf(prompt)).toContain("User arguments: ");
  });
});

// ============================================================================
// Item 6 — Session-context block (conditional: present + absent)
// ============================================================================

describe("V11d-T — Session-context block (cka-45 item 6)", () => {
  it("cka-45 item 6: `bind_context: session` with ≥1 included turn frames the block (opening line, body, terminating blank line)", () => {
    const transcriptBody = "[user]: hello\n";
    const prompt = buildBinderSystemPrompt(
      baseInput({ sessionContext: { transcriptBody } }),
    );
    // Opening line begins with the literal token and ends with `:`.
    const opening = linesOf(prompt).find((line) => line.startsWith("Recent session context"));
    expect(opening).toBeDefined();
    expect(opening?.endsWith(":")).toBe(true);
    // The transcript body appears in the prompt.
    expect(prompt).toContain(transcriptBody);
    // The block ends with the terminating blank line: the body's trailing `\n`
    // followed by exactly one further `\n` (so `...hello\n\n`).
    expect(prompt).toContain(`${transcriptBody}\n`);
  });

  it("cka-45 item 6: no session context (`bind_context: none` / zero included turns) omits the whole block", () => {
    const prompt = buildBinderSystemPrompt(baseInput());
    expect(linesOf(prompt)).toContain("Theta: /code-review");
    expect(prompt).not.toContain("Recent session context");
  });
});

// ============================================================================
// Item 7 — Envelope-kinds enumeration
// ============================================================================

describe("V11d-T — Envelope-kinds enumeration (cka-45 item 7)", () => {
  it("cka-45 item 7: lists all three envelope `kind` tokens (`ok`, `needs_info`, `ambiguous`)", () => {
    const prompt = buildBinderSystemPrompt(baseInput());
    expect(prompt).toContain("ok");
    expect(prompt).toContain("needs_info");
    expect(prompt).toContain("ambiguous");
  });
});

// ============================================================================
// Item 8 — No-invent-defaults instruction
// ============================================================================

describe("V11d-T — No-invent-defaults instruction (cka-45 item 8)", () => {
  it("cka-45 item 8: a single line contains the literal `defaulted` and at least one directive (`Do not`/`omit`/`skip`)", () => {
    const prompt = buildBinderSystemPrompt(baseInput());
    const line = linesOf(prompt).find((l) => l.includes("defaulted"));
    expect(line).toBeDefined();
    const hasDirective =
      (line?.includes("Do not") ?? false) ||
      (line?.includes("omit") ?? false) ||
      (line?.includes("skip") ?? false);
    expect(hasDirective).toBe(true);
  });
});

// ============================================================================
// BNDR-12 — binder-invocation-path re-entrancy
// (binder/binder-model-and-context.md#bndr-12)
//
// V11d builds the per-call binder invocation input record — the parameter table
// (`params`), the raw slash text (`rawArguments`), and the optional
// session-context block (`sessionContext`) — into the binder system prompt.
// BNDR-12 requires that record be "constructed afresh on every binder call, with
// no cached state that would let a second call serve a stale `bind_context`
// snapshot". `buildBinderSystemPrompt` is a pure per-call constructor holding no
// module-level state, so a second call reflects its own input entirely and never
// carries a first call's session-context block forward.
// ============================================================================

describe("V11d — BNDR-12 binder-input re-entrancy (binder/binder-model-and-context.md#bndr-12)", () => {
  const SESSION_A = "[user]: alpha turn\n";
  const SESSION_B = "[user]: bravo turn\n";

  it("BNDR-12: each binder call constructs the input record afresh — a second call never serves a stale bind_context snapshot from a prior call", () => {
    // Call 1 carries a session-context block sourced from bind_context: session.
    const withA = buildBinderSystemPrompt(
      baseInput({
        rawArguments: "review the diff",
        sessionContext: { transcriptBody: SESSION_A },
      }),
    );
    expect(withA).toContain("Recent session context");
    expect(withA).toContain(SESSION_A.trim());

    // Call 2 (a fresh binder call) carries a DIFFERENT session-context block.
    // BNDR-12: no cached state — the second prompt reflects SESSION_B only and
    // carries none of SESSION_A's snapshot forward.
    const withB = buildBinderSystemPrompt(
      baseInput({
        rawArguments: "review the diff",
        sessionContext: { transcriptBody: SESSION_B },
      }),
    );
    expect(withB).toContain(SESSION_B.trim());
    expect(withB).not.toContain(SESSION_A.trim());

    // Call 3 carries NO session-context block (bind_context: none). A stale
    // snapshot would have leaked call 1/2's block; a re-entrant per-call build
    // omits the block entirely.
    const withNone = buildBinderSystemPrompt(
      baseInput({ rawArguments: "review the diff" }),
    );
    expect(withNone).not.toContain("Recent session context");
    expect(withNone).not.toContain(SESSION_A.trim());
    expect(withNone).not.toContain(SESSION_B.trim());
  });

  it("BNDR-12: the per-call construction is order-independent and deterministic — rebuilding an earlier input reproduces its prompt byte-for-byte with no carried state", () => {
    const inputA = (): BuildBinderSystemPromptInput =>
      baseInput({ rawArguments: "first", sessionContext: { transcriptBody: SESSION_A } });
    const inputB = (): BuildBinderSystemPromptInput =>
      baseInput({ rawArguments: "second", sessionContext: { transcriptBody: SESSION_B } });

    const firstA = buildBinderSystemPrompt(inputA());
    // Interleave a different call, then rebuild A: a cached state would make the
    // second A diverge from the first.
    buildBinderSystemPrompt(inputB());
    const secondA = buildBinderSystemPrompt(inputA());
    expect(secondA).toBe(firstA);
  });
});
