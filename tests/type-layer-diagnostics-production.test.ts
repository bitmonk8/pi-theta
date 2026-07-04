import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { LoomSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseLoomDocument,
  type LoomDocument,
  type ParseLoomDocumentDeps,
} from "../src/parser/loom-document";
import { evaluateIndexAccess } from "../src/runtime/runtime-panics";

// V20c-T — failing tests for the paired `V20c` type-layer diagnostics wiring
// and runtime string-index correction.
//
// Convention: conventions.md (phase categories — production-wiring). Narrative
// spec references: expressions.md (Truthiness, indexing, stdlib),
// control-flow.md (`for`/`in`), functions.md (return LUB), type-system.md,
// runtime-value-model.md. Closes no new spec REQ-ID.
//
// Bucket A (checkers now feedable) + Bucket C (implemented wrongly): the
// type-phase checkers exist but never run in production because no per-
// expression static type was supplied (now furnished by `V20b`), and
// `evaluateIndexAccess` returns a character for `s[0]` instead of surfacing the
// not-indexable error. These tests drive the production dispatch through the
// real whole-file parser (`parseLoomDocument`) and the runtime accessor.
//
// Every test reds today for the intended reason:
//   * the parse-phase tests red because the type-layer checkers are unfed a
//     per-expression static type in production, so `parseLoomDocument` emits no
//     type diagnostic for a well-formed-but-ill-typed body (`if 1` silently
//     takes else, `for x in 5` silently no-ops, `?` misuse is not flagged, an
//     array/return/match with no common type is not rejected, a narrowing
//     integer coercion is not rejected, string / non-string indexing is
//     wrongly accepted, `array.join` on a non-string element type is accepted);
//   * the runtime string-index test reds because `evaluateIndexAccess("hi", 0)`
//     returns the character `"h"` today rather than surfacing the not-indexable
//     error.
// None reds on a compile error, a missing fixture, or a harness throw.

// --- production parse harness ---------------------------------------------

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function makeDeps(): ParseLoomDocumentDeps {
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

/** Parse a UTF-8 `.loom` source string through the production whole-file parser. */
function parse(src: string, path = "test.loom"): LoomDocument {
  const source: LoomSource = { path, bytes: new TextEncoder().encode(src) };
  return parseLoomDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}

// ===========================================================================
// loom/parse/non-boolean-condition — `cka-4` (owned V3a), integration witness.
// ===========================================================================

describe("V20c-T — non-boolean-condition fires in production", () => {
  it("rejects an integer `if` condition (reds today — `if 1` silently takes else)", () => {
    // loom/parse/non-boolean-condition — a non-`boolean` `if` condition.
    const codes = codesOf(["if 1 {", "  let a = 1", "}"].join("\n"));
    expect(codes).toContain("loom/parse/non-boolean-condition");
  });

  it("rejects an integer `while` condition", () => {
    // loom/parse/non-boolean-condition — a non-`boolean` `while` condition.
    const codes = codesOf(["while 1 {", "  let a = 1", "}"].join("\n"));
    expect(codes).toContain("loom/parse/non-boolean-condition");
  });

  it("rejects a non-`boolean` ternary condition", () => {
    // loom/parse/non-boolean-condition — a non-`boolean` ternary condition.
    const codes = codesOf("let x = 1 ? 2 : 3");
    expect(codes).toContain("loom/parse/non-boolean-condition");
  });

  it("rejects a non-`boolean` `&&` operand", () => {
    // loom/parse/non-boolean-condition — a non-`boolean` `&&` operand.
    const codes = codesOf("let x = 1 && true");
    expect(codes).toContain("loom/parse/non-boolean-condition");
  });
});

// ===========================================================================
// loom/parse/non-array-iterand — `cka-5` (owned V3c), integration witness.
// ===========================================================================

describe("V20c-T — non-array-iterand fires in production", () => {
  it("rejects `for x in <non-array>` (reds today — the iterand is unchecked)", () => {
    // loom/parse/non-array-iterand — the `for … in` iterand is not `array<T>`.
    const codes = codesOf(["for x in 5 {", "  let a = x", "}"].join("\n"));
    expect(codes).toContain("loom/parse/non-array-iterand");
  });
});

// ===========================================================================
// loom/parse/question-on-non-result — ERR-18 (owned V4a), integration witness.
// ===========================================================================

describe("V20c-T — question-on-non-result fires in production", () => {
  it("rejects `?` applied to a non-`Result` static type", () => {
    // loom/parse/question-on-non-result — `?` on an `integer` operand.
    const codes = codesOf("let x = 5?");
    expect(codes).toContain("loom/parse/question-on-non-result");
  });
});

// ===========================================================================
// loom/parse/question-outside-result-fn — (owned V4a), integration witness.
// ===========================================================================

describe("V20c-T — question-outside-result-fn fires in production", () => {
  it("rejects `?` in a function whose return type is not Result<T, QueryError>", () => {
    // loom/parse/question-outside-result-fn — `?` in an `integer`-returning fn.
    const codes = codesOf(
      ["fn f(): integer {", "  let x = @`hi`?", "  1", "}"].join("\n"),
    );
    expect(codes).toContain("loom/parse/question-outside-result-fn");
  });
});

// ===========================================================================
// loom/parse/array-no-common-type — (owned V3a), integration witness.
// ===========================================================================

describe("V20c-T — array-no-common-type fires in production", () => {
  it("rejects an array literal whose elements share no common type", () => {
    // loom/parse/array-no-common-type — `[integer, string]` with no sink.
    const codes = codesOf('let xs = [1, "a"]');
    expect(codes).toContain("loom/parse/array-no-common-type");
  });
});

// ===========================================================================
// loom/parse/return-no-common-type — (owned V3d), integration witness.
// ===========================================================================

describe("V20c-T — return-no-common-type fires in production", () => {
  it("rejects a function whose return sites share no common type", () => {
    // loom/parse/return-no-common-type — `return 1` vs `return "a"`.
    const codes = codesOf(
      ["fn f() {", '  if true { return 1 }', '  return "a"', "}"].join("\n"),
    );
    expect(codes).toContain("loom/parse/return-no-common-type");
  });
});

// ===========================================================================
// loom/parse/integer-narrowing — (owned V2b), integration witness.
// ===========================================================================

describe("V20c-T — integer-narrowing fires in production", () => {
  it("rejects a narrowing `number → integer` coercion", () => {
    // loom/parse/integer-narrowing — `1.5` (number) assigned to `integer`.
    const codes = codesOf("let x: integer = 1.5");
    expect(codes).toContain("loom/parse/integer-narrowing");
  });
});

// ===========================================================================
// loom/parse/match-arm-type-mismatch — (owned V4a), integration witness.
// ===========================================================================

describe("V20c-T — match-arm-type-mismatch fires in production", () => {
  it("rejects `match` arms whose bodies share no common type", () => {
    // loom/parse/match-arm-type-mismatch — an `integer` arm vs a `string` arm.
    const codes = codesOf(
      ["let y = 1", "let z = match y {", "  0 => 1,", '  _ => "hi",', "}"].join(
        "\n",
      ),
    );
    expect(codes).toContain("loom/parse/match-arm-type-mismatch");
  });
});

// ===========================================================================
// loom/parse/non-indexable-receiver — (owned V3a), integration witness.
// A `string` receiver is non-indexable; string indexing is wrongly accepted
// today.
// ===========================================================================

describe("V20c-T — non-indexable-receiver fires in production", () => {
  it("rejects indexing a `string` receiver (reds today — string indexing accepted)", () => {
    // loom/parse/non-indexable-receiver — `s[0]` on a `string`.
    const codes = codesOf(['let s = "hi"', "let c = s[0]"].join("\n"));
    expect(codes).toContain("loom/parse/non-indexable-receiver");
  });
});

// ===========================================================================
// loom/parse/non-string-object-index — (owned V3h), integration witness.
// ===========================================================================

describe("V20c-T — non-string-object-index fires in production", () => {
  it("rejects a non-`string` object index", () => {
    // loom/parse/non-string-object-index — `obj[0]` on an object receiver.
    const codes = codesOf(
      [
        "schema Point { x: integer, y: integer }",
        "let p = Point { x: 1, y: 2 }",
        "let v = p[0]",
      ].join("\n"),
    );
    expect(codes).toContain("loom/parse/non-string-object-index");
  });
});

// ===========================================================================
// loom/parse/non-string-array-join — (owned V3g), integration witness.
// ===========================================================================

describe("V20c-T — non-string-array-join fires in production", () => {
  it("rejects `array.join(<non-string element type>)`", () => {
    // loom/parse/non-string-array-join — `.join` on an `array<integer>`.
    const codes = codesOf(["let xs = [1, 2, 3]", 'let s = xs.join(",")'].join("\n"));
    expect(codes).toContain("loom/parse/non-string-array-join");
  });
});

// ===========================================================================
// Convention: runtime string-index correction (Bucket C, owned V4b).
// At runtime `s[0]` surfaces the not-indexable error rather than a character.
// ===========================================================================

describe("V20c-T — runtime string-index correction", () => {
  it("surfaces the not-indexable error for `s[0]` rather than returning a char", () => {
    // A `string` is not an indexable receiver (expressions.md
    // §"Supported forms"; `loom/parse/non-indexable-receiver`). At runtime the
    // accessor must not silently return the character `"h"`. Reds today: it
    // returns `"h"`.
    expect(() => evaluateIndexAccess("hello", 0)).toThrow();
  });
});
