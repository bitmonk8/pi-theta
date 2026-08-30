import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";

// ===========================================================================
// Bug 0324 (static half) — witness suite (Phase 1, RED). Fixed in 0.312.0.
// ===========================================================================
//
// Rule under witness: control-flow.md CTRL-2 admits only an `integer`-typed
// expression as a `par for` `max` operand. The type-layer sink
// (src/parser/type-layer-checks.ts, `case "par-for"` `max` arm) computes
// `checkCompatible(typeOf(max), integer)` but surfaces only the
// `integer-narrowing` verdict; the `incompatible` verdict falls through with no
// diagnostic, so a `string` / `boolean` / `null` operand loads clean and the
// author's stated width bound is dropped at load time.
//
// Expected behaviour (bug 0324 §Expected behaviour + the pinned design): the
// `incompatible` verdict draws the dedicated parse code
// `theta/parse/non-integer-max`, exactly as the sibling narrowing verdict draws
// its code. This suite asserts CODE PRESENCE — the unambiguous right-reason
// red, since the code does not exist in the tree yet (each incompatible operand
// aggregates `[]` today).
//
// The DIAG-4 message-from-registry assertion below sources the registered
// Message column (now that the Phase-2 registry row exists) rather than
// hardcoding the emitter's own string, so a drift between the emitter and the
// registry fails this suite, not the closed-set corpus gate alone.
//
// All cells drive the production whole-file parser `parseThetaDocument` through
// the stable public surface — no src/ module is touched.

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
/**
 * The live registry, read from the spec corpus — the DIAG-4 message oracle for
 * this suite (modelled on tests/par-for.test.ts's `registryMessageFor`; the
 * same source and reader the production emitter's message is transcribed
 * from).
 */
const NON_INTEGER_MAX_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf-8",
  ),
);

/**
 * The registered Message for `theta/parse/non-integer-max` (DIAG-4), with the
 * `<type>` placeholder filled by `type`. A missing row fails LOUDLY — the
 * Message column is this suite's only message oracle, so its absence is a
 * harness failure, never a silently-skipped assertion.
 */
function registryMessageFor(type: string): string {
  const template = registryMessage(NON_INTEGER_MAX_REGISTRY, NON_INTEGER_MAX) as
    | string
    | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no registry row for ${NON_INTEGER_MAX} in code-registry-parse.md — the DIAG-4 Message column is this suite's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template.replace("<type>", type);
}

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}

/** Every message carried by a diagnostic of `code`, in emission order. */
function messagesFor(src: string, code: string): string[] {
  return parse(src)
    .diagnostics.filter((d: Diagnostic) => d.code === code)
    .map((d: Diagnostic) => d.message);
}

const NON_INTEGER_MAX = "theta/parse/non-integer-max";
const INTEGER_NARROWING = "theta/parse/integer-narrowing";

describe("bug 0324 static — an incompatible `par for` max operand draws non-integer-max", () => {
  // A string / boolean / null literal is not an `integer`-typed expression, so
  // CTRL-2's operand contract excludes it; the sink must surface its
  // `incompatible` verdict as a load refusal.
  it("a string-literal `max` operand is refused", () => {
    const src = 'let r = par for f in [1, 2, 3] max "abc" { f }\nr';
    expect(codesOf(src)).toEqual([NON_INTEGER_MAX]);
    expect(messagesFor(src, NON_INTEGER_MAX)).toEqual([registryMessageFor("string")]);
  });

  it("a boolean-literal `max` operand is refused", () => {
    const src = "let r = par for f in [1, 2, 3] max true { f }\nr";
    expect(codesOf(src)).toEqual([NON_INTEGER_MAX]);
    expect(messagesFor(src, NON_INTEGER_MAX)).toEqual([registryMessageFor("boolean")]);
  });

  it("a null-literal `max` operand is refused", () => {
    const src = "let r = par for f in [1, 2, 3] max null { f }\nr";
    expect(codesOf(src)).toEqual([NON_INTEGER_MAX]);
    expect(messagesFor(src, NON_INTEGER_MAX)).toEqual([registryMessageFor("null")]);
  });

  // A binding-read operand carries the incompatible type of its declaration —
  // the broad one-token-mistake class (`max name` where a width variable was
  // meant), so the resolved-identifier path must refuse it too.
  it("a `string`-typed binding read as the `max` operand is refused", () => {
    const src = 'let w = "abc"\nlet r = par for f in [1, 2, 3] max w { f }\nr';
    expect(codesOf(src)).toEqual([NON_INTEGER_MAX]);
    expect(messagesFor(src, NON_INTEGER_MAX)).toEqual([registryMessageFor("string")]);
  });

  it("a `boolean`-typed binding read as the `max` operand is refused", () => {
    const src = "let flag = true\nlet r = par for f in [1, 2, 3] max flag { f }\nr";
    expect(codesOf(src)).toEqual([NON_INTEGER_MAX]);
    expect(messagesFor(src, NON_INTEGER_MAX)).toEqual([registryMessageFor("boolean")]);
  });
});

describe("bug 0324 static — controls and the deferral non-goal are unaffected", () => {
  // The narrowing verdict's code stays byte-identical: the fix adds the
  // incompatible arm beside it, it does not alter the arm the sink already
  // handles.
  it("CONTROL: a fractional `max` operand keeps drawing only integer-narrowing", () => {
    expect(
      codesOf("let r = par for f in [1, 2, 3] max 2.5 { f }\nr"),
    ).toEqual([INTEGER_NARROWING]);
  });

  // A compatible integer operand loads clean — the false-positive gate.
  it("CONTROL: an integer `max` operand loads with no diagnostics", () => {
    expect(codesOf("let r = par for f in [1, 2, 3] max 2 { f }\nr")).toEqual([]);
  });

  // DEFERRAL control (bug 0324 §Non-goals): an object-index against a union
  // schema types as `number|string`, whose compatibility-with-`integer` verdict
  // is `unknown` at this fork, so the sink DEFERS. The new incompatible arm must
  // not over-fire on that deferred class — the unknown-verdict deferral is the
  // documented type-layer posture and is not challenged by this fix.
  it("DEFERRAL: a union-typed object-index `max` operand stays deferred (no code)", () => {
    expect(
      codesOf(
        [
          "schema S { a: number, b: string }",
          'let s = S { a: 1, b: "x" }',
          'let r = par for f in [1, 2, 3] max s["a"] { f }',
          "r",
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});
