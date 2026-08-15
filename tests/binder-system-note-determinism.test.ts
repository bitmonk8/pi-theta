import { describe, expect, it } from "vitest";
import type { Api, Model, ProviderResponse } from "@earendil-works/pi-ai";
import {
  SYSTEM_NOTE_CODEPOINT_CAP,
  capSystemNote,
  classifyModelContent,
  renderAmbiguousSuffix,
  renderFailureNote,
  sanitizeSystemNoteSubstring,
} from "../src/binder/system-note";
import { deriveBinderSeed } from "../src/binder/binder-seed";
import {
  buildBinderCompleteCall,
  type BinderCompleteCallInput,
} from "../src/binder/binder-inference";
import type { BinderEnvelopeSchema } from "../src/binder/binder-envelope";
import { renderArgumentEcho } from "../src/render/argument-echo";

// V11e-T — failing tests for the paired `V11e` "Binder system-note rendering
// and determinism" implementation. Closes the code-keyed obligation areas
// `cka-41` (defaulting-system-note-echo.md §"System-note rendering" — the five
// line-discipline rules) and `cka-42` (determinism-cancellation-failure.md
// §Determinism — the `temperature: 0` MUST as conditioned by the §Binder
// temperature placement mapping (a refusing (api, model id) pair omits the
// field instead) + FNV-1a seed derivation).
//
// Each test reds on its own primary assertion because the V11e discipline is
// absent: the string renderers (`sanitizeSystemNoteSubstring`, `capSystemNote`,
// `renderFailureNote`, `renderAmbiguousSuffix`) return an `UNIMPLEMENTED`
// sentinel that equals none of the pinned outputs; `classifyModelContent`
// always returns `"present"`; and `deriveBinderSeed` returns the `-1` sentinel
// (no reference vector). No test reds on a compile error, a missing fixture, or
// a harness throw.
//
// Spec: binder/defaulting-system-note-echo.md §"System-note rendering" (anchor
// #system-note-rendering, incl. the normative reference rendering) and
// binder/determinism-cancellation-failure.md §Determinism (FNV-1a reference
// vectors; `temperature: 0` per the §Binder temperature placement mapping).

const EM_DASH = "\u2014";

// ============================================================================
// cka-41 — System-note rendering (the five line-discipline rules)
// ============================================================================

describe("V11e-T — System-note rendering (defaulting-system-note-echo.md #system-note-rendering)", () => {
  it("rule 1 (cka-41): collapses/trims the ASCII-whitespace run but preserves U+00A0, against the normative reference rendering", () => {
    // Reference rendering: a `needs_info` `message` of `binding\tfailed   here`
    // (a literal U+0009 tab, then three U+0020 spaces) renders after rule 1 as
    // `binding failed here` — the tab-plus-spaces run collapses to one U+0020.
    expect(sanitizeSystemNoteSubstring("binding\tfailed   here")).toBe(
      "binding failed here",
    );
    // U+00A0 lies outside the rule-1 ASCII-whitespace set, so `a\u00A0b` is
    // preserved verbatim (neither collapsed nor trimmed).
    expect(sanitizeSystemNoteSubstring("a\u00A0b")).toBe("a\u00A0b");
    // Leading/trailing ASCII whitespace is trimmed; interior newlines collapse.
    expect(sanitizeSystemNoteSubstring("  x\r\ny  ")).toBe("x y");
    // The full reference note composed through the failure-arm grammar.
    expect(
      renderFailureNote({
        thetaName: "code-review",
        fixedPhrase: "argument binding needs more info",
        suffix: "binding\tfailed   here",
      }),
    ).toBe(
      `theta /code-review: argument binding needs more info ${EM_DASH} binding failed here`,
    );
  });

  it("rule 2 (cka-41): caps a >120-code-point note at exactly 120 scalars with a trailing `…`; a ≤120 note is unchanged", () => {
    // A rendered note exceeding 120 code points truncates at a Unicode scalar
    // boundary with a trailing `…` (U+2026) to exactly 120 code points; the `…`
    // counts toward the cap.
    const long = "x".repeat(200);
    const cappedLong = capSystemNote(long);
    expect(Array.from(cappedLong)).toHaveLength(SYSTEM_NOTE_CODEPOINT_CAP);
    expect(cappedLong.endsWith("\u2026")).toBe(true);

    // Truncation operates at scalar boundaries, never at UTF-16 code-unit
    // boundaries: an astral (surrogate-pair) run truncates to exactly 120
    // scalars, never splitting a surrogate pair.
    const astral = "\u{1D54F}".repeat(200); // U+1D54F, one scalar each
    const cappedAstral = capSystemNote(astral);
    expect(Array.from(cappedAstral)).toHaveLength(SYSTEM_NOTE_CODEPOINT_CAP);
    expect(cappedAstral.endsWith("\u2026")).toBe(true);

    // A note ≤120 code points gets no `…` and is returned unchanged.
    const short = "theta /a: argument binding cancelled";
    expect(capSystemNote(short)).toBe(short);
  });

  it("rule 3 (cka-41): the failure grammar `theta /<name>: <fixed-phrase> — <suffix>` and the success echo `Running /<name>: <args>` mark the prefix↔suffix boundary", () => {
    // Failure-arm note: `theta /<name>: <fixed-phrase> — <sanitised-suffix>`; the
    // em-dash marks the theta-controlled-prefix ↔ model/runtime-suffix boundary.
    const failure = renderFailureNote({
      thetaName: "code-review",
      fixedPhrase: "ambiguous arguments",
      suffix: "be more explicit",
    });
    expect(failure).toBe(
      `theta /code-review: ambiguous arguments ${EM_DASH} be more explicit`,
    );
    expect(failure.startsWith("theta /code-review: ")).toBe(true);
    expect(failure.includes(` ${EM_DASH} `)).toBe(true);

    // Success echo: `Running /<name>: <formatted-args>`; the `:` marks the
    // prefix↔suffix boundary (the echo formatter is owned by V11h).
    const echo = renderArgumentEcho({
      thetaName: "code-review",
      params: [
        {
          name: "language",
          value: "TypeScript",
          type: { kind: "string" },
          tookDefault: false,
        },
      ],
    });
    expect(echo.startsWith("Running /code-review: ")).toBe(true);
  });

  it("rule 4 (cka-41): a message (or an all-empty candidates array) empty after rule-1 stripping is classified as a malformed envelope", () => {
    // A `message` empty after rule-1 stripping (whitespace-only) → malformed
    // envelope, not an empty note.
    expect(classifyModelContent({ message: "   \t\r\n " })).toBe(
      "empty-malformed",
    );
    // A `candidates` array whose every entry is empty after stripping →
    // malformed envelope.
    expect(
      classifyModelContent({ message: "", candidates: ["  ", "\t", "\r\n"] }),
    ).toBe("empty-malformed");
    // Non-empty model content stays `present` (routed to its own arm).
    expect(classifyModelContent({ message: "missing field" })).toBe("present");
  });

  it("rule 5 (cka-41): the `ambiguous` arm renders only the model's `message` and never surfaces `candidates`", () => {
    const suffix = renderAmbiguousSuffix({
      message: "  focusing on Ada is unclear  ",
      candidates: ["focus_areas", "author"],
    });
    // The suffix is the rule-1-sanitised `message` only.
    expect(suffix).toBe("focusing on Ada is unclear");
    // `candidates` are never surfaced on the theta 1.0 user-facing note.
    expect(suffix.includes("focus_areas")).toBe(false);
    expect(suffix.includes("author")).toBe(false);
  });
});

// ============================================================================
// cka-42 — Determinism (FNV-1a seed derivation; per-(api, model-id) `temperature: 0` placement)
// ============================================================================

describe("V11e-T — Binder determinism (determinism-cancellation-failure.md §Determinism)", () => {
  const envelope: BinderEnvelopeSchema = {
    anyOf: [
      {
        type: "object",
        properties: { kind: { const: "ok" } },
        required: ["kind"],
      },
    ],
  };

  function callInput(seed: number): BinderCompleteCallInput {
    return {
      // `openai-completions` carries a `seed` field, so the FNV-derived seed
      // surfaces on `options.seed` (the provider seed-field mapping is V9j's).
      model: { api: "openai-completions" } as unknown as Model<Api>,
      systemPrompt: "You are the binder.",
      envelopeSchema: envelope,
      slug: "triage",
      seed,
      signal: new AbortController().signal,
      onResponse: (_response: ProviderResponse, _model: Model<Api>) => {},
    };
  }

  it("cka-42: the binder seed is FNV-1a-derived (deterministic) and `temperature: 0` is sent on a pair the placement mapping sends it for", () => {
    // FNV-1a 32-bit reference vectors (offset basis 0x811c9dc5, prime
    // 0x01000193, UTF-8 input bytes, masked to 32-bit unsigned). Conforming
    // implementations MUST reproduce these exactly.
    expect(deriveBinderSeed("code-review")).toBe(0x7ba86b63);
    expect(deriveBinderSeed("hello")).toBe(0x4f9f2cab);
    expect(deriveBinderSeed("a")).toBe(0xe40c292c);

    // Determinism: the same theta name derives the same seed on every call.
    expect(deriveBinderSeed("code-review")).toBe(deriveBinderSeed("code-review"));

    // `temperature: 0` is sent per the placement mapping, and this fixture's
    // `openai-completions` api carries no refusing model id, so the pair is a
    // sending one; the FNV-derived seed flows through the constructed provider
    // call unchanged.
    const seed = deriveBinderSeed("code-review");
    const call = buildBinderCompleteCall(callInput(seed));
    expect(call.options.temperature).toBe(0);
    expect((call.options as Record<string, unknown>).seed).toBe(seed);
  });
});
