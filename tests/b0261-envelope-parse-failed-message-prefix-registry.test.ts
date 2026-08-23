// Bug b0261 witness — the `subagent-envelope-parse-failed` builder renders a
// hand-written prefix that diverges from its registry *Message* template, so
// the registry-derived prefix oracle bug 0086 established cannot witness the
// row.
//
// WHY this is a defect rather than a wording preference: DIAG-4 makes the
// *Message* column normative and requires renderers to emit it
// character-for-character with placeholders interpolated
// (`docs/spec_topics/diagnostics/diagnostic-shape.md:74`), and it requires
// tests to SOURCE the string from that column rather than copy-paste it. For a
// row whose template ends in a host-derived tail that rule is narrowed, not
// relaxed: `<line summary>` is a category-8 placeholder
// (`docs/spec_topics/diagnostics/placeholder-rendering-b.md:89`), whose rule
// (`:91`) states that "every byte of the *Message* template before the §8
// placeholder, and every byte after, is byte-identical across
// implementations", prohibits strict equality against such a template, and
// mandates partial matches anchored on that byte-identical surround. `:93`
// names this row and its sibling `subagent-wire-parse-failed` among the five
// subagent rows whose surround is a PREFIX only — there is no suffix to
// anchor. The prefix is therefore the entire conformance surface of this row's
// message, and it is exactly where the two artifacts disagree.
//
// WHY both message copies are asserted: `mapEnvelopeParseFailure`
// (`src/runtime/subagent-envelope.ts:392`) builds one string at `:394` and
// places it twice — on `error.message` (`:398`, which rides
// `InvokeInfraError` into an `invoke` parent's `Err`) and on
// `diagnostic.message` (`:405`, what the operator triages by). A fix that
// moved only one copy would leave the other non-conformant, so each is
// anchored independently.
//
// WHY the sibling control lives in this same file: the two builders sit
// forty-four lines apart in one module — `mapWireParseFailure`
// (`src/runtime/subagent-envelope.ts:421`) quotes its row's *Message* cell
// byte for byte at `:438`, `mapEnvelopeParseFailure` paraphrases its row's
// trigger prose instead. Pinning both against ONE shared oracle is what stops
// them drifting apart again; a control in a separate file would not.
//
// WHY prefix-anchored and never whole-message equality: `<line summary>` binds
// a child-supplied string, so its interpolation is implementation-defined at
// the byte level (`placeholder-rendering-b.md:91`). Each cell therefore pairs
// the prefix anchor with a `toContain` over the offending line's own bytes, so
// a future fix cannot satisfy the prefix by dropping the tail.
//
// REGISTRY-GATE HAZARD, treated deliberately: `extractAssertedCodes`
// (`tools/closing-gate/index.js`) treats ANY full code-shaped literal in a
// `tests/**` source as that code's asserting witness — code, comment or test
// name alike. Both rows read here are pinned under the carve-out arm of
// `tests/registry-closed-set-corpus-gate.test.ts` (`:131` for the wire row,
// `:138` for the envelope row), which is asserted set-equal to the live arm in
// both directions, so a stray literal span in this file would close a
// carve-out arm and red that gate on a comment. Two mitigations, both mirrored
// from `tests/subagent-wire-parse-failed-emitter.test.ts` and
// `tests/b0258-envelope-parse-failed-line-summary-cr.test.ts`: prose here names
// both rows WITHOUT their `theta/` namespace prefix, and the two registry
// lookup keys are COMPOSED from parts rather than written as one span. Every
// code assertion goes through the exported constants, which is the form the
// carve-out already records.
//
// Spec: diagnostics/diagnostic-shape.md (DIAG-4),
// diagnostics/code-registry-runtime.md (`:27` wire row, `:28` envelope row),
// diagnostics/placeholder-rendering-b.md (§8).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  mapEnvelopeParseFailure,
  mapWireParseFailure,
  SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,
  SUBAGENT_WIRE_PARSE_FAILED_CODE,
} from "../src/runtime/subagent-envelope";

const CALLEE = "/theta/child.theta";

// ---------------------------------------------------------------------------
// Registry-sourced oracle (DIAG-4): the Message template, never a copy of it.
// Shape mirrored from tests/subagent-wire-parse-failed-emitter.test.ts:88-149.
// ---------------------------------------------------------------------------

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

// Composed rather than written as one span, so this file does not register as
// either code's asserting test in the closing gate's textual extraction.
const CODE_PREFIX = "theta" + "/";
const ENVELOPE_ROW_CODE = `${CODE_PREFIX}runtime/subagent-envelope-parse-failed`;
const WIRE_ROW_CODE = `${CODE_PREFIX}runtime/subagent-wire-parse-failed`;

/** The category-8 placeholder both rows' tails carry. */
const LINE_SUMMARY_PLACEHOLDER = "<line summary>";

/**
 * The byte-identical prefix of a row's *Message* template, up to but excluding
 * its category-8 tail. Sourced from the live registry per DIAG-4. A missing
 * row or a missing placeholder is a loud harness failure naming the unmet
 * precondition — never a skip, never an early return, never a hard-coded
 * fallback, because the template IS this file's only oracle and a degraded
 * comparison against `undefined` would report success while verifying nothing.
 */
function messagePrefixOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message template for ${code} — the ` +
        `DIAG-4 Message column is this file's only oracle for the byte-identical prefix, so its ` +
        `absence fails the run loudly`,
    );
  }
  const cut = template.indexOf(LINE_SUMMARY_PLACEHOLDER);
  if (cut < 0) {
    throw new Error(
      `harness: the Message template for ${code} carries no ${LINE_SUMMARY_PLACEHOLDER} ` +
        `placeholder (${template}), so the category-8 prefix anchor this file asserts on cannot ` +
        `be derived from it`,
    );
  }
  return template.slice(0, cut);
}

/** Anchored partial match per placeholder-rendering-b.md:91 — prefix only. */
function startsWithPrefix(prefix: string): RegExp {
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
}

describe("bug b0261 — both subagent line-summary builders render their registry Message prefix", () => {
  it("the oracle's two lookup keys are the shipped exported code constants", () => {
    // Binds the registry rows read below to the codes the runtime actually
    // emits, so a row rename could not silently point the oracle at a
    // different template. Asserted through the exported constants, the form
    // the corpus gate's carve-out already records.
    expect(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE).toBe(ENVELOPE_ROW_CODE);
    expect(SUBAGENT_WIRE_PARSE_FAILED_CODE).toBe(WIRE_ROW_CODE);
  });

  // A reserved-key line that parses as JSON and fails the pinned return-envelope
  // schema (no `ok`/`err` arm), i.e. the class that reaches this builder.
  const OFFENDING_LINE = '{"theta_result":{"v":1}}';

  it("(a) envelope row — diagnostic.message starts with the registry Message prefix", () => {
    const prefix = messagePrefixOf(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
    const mapping = mapEnvelopeParseFailure(OFFENDING_LINE, CALLEE);

    expect(mapping.diagnostic.message).toMatch(startsWithPrefix(prefix));
    // The tail still names the offending line, so the prefix cannot be
    // satisfied by dropping what the operator triages by.
    expect(mapping.diagnostic.message).toContain(OFFENDING_LINE);
    expect(mapping.diagnostic.code).toBe(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
  });

  it("(b) envelope row — error.message, the copy that crosses into the parent's Err, starts with the same prefix", () => {
    const prefix = messagePrefixOf(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
    const mapping = mapEnvelopeParseFailure(OFFENDING_LINE, CALLEE);

    expect(mapping.error.message).toMatch(startsWithPrefix(prefix));
    expect(mapping.error.message).toContain(OFFENDING_LINE);
    // One string, placed twice by the builder — asserted so the two copies
    // cannot be brought into conformance one at a time.
    expect(mapping.error.message).toBe(mapping.diagnostic.message);
  });

  it("(c) sibling control — the wire builder starts with ITS registry Message prefix", () => {
    // GREEN pre-fix: the adjacent builder already quotes its row's cell byte
    // for byte. Same oracle, same anchor shape — this is what makes the pair
    // pinned rather than each independently reworded.
    const prefix = messagePrefixOf(SUBAGENT_WIRE_PARSE_FAILED_CODE);
    const line = "not json at all";
    const diagnostic = mapWireParseFailure(line);

    expect(diagnostic.message).toMatch(startsWithPrefix(prefix));
    expect(diagnostic.message).toContain(line);
    expect(diagnostic.code).toBe(SUBAGENT_WIRE_PARSE_FAILED_CODE);
  });

  it("(d) the two prefixes are distinct and each ends at its own row's tail boundary", () => {
    // Holds the oracle honest in both directions: if the fix were applied by
    // making one builder call the other, or by collapsing the two rows onto a
    // single template, the cells above would pass for the wrong reason.
    const envelopePrefix = messagePrefixOf(SUBAGENT_ENVELOPE_PARSE_FAILED_CODE);
    const wirePrefix = messagePrefixOf(SUBAGENT_WIRE_PARSE_FAILED_CODE);

    expect(envelopePrefix).not.toBe(wirePrefix);
    expect(envelopePrefix.length).toBeGreaterThan(0);
    expect(wirePrefix.length).toBeGreaterThan(0);
  });
});
