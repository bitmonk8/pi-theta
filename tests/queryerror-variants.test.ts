import { describe, expect, it } from "vitest";
import {
  isLoom10QueryErrorKind,
  loom10QueryErrorKinds,
  makeToolLoopExhaustedError,
  orderValidationIssues,
  synthesizeForcedRespondIssue,
  type QueryError,
  type ValidationIssue,
} from "../src/runtime/query-error";

// V4d-T — failing tests for the paired `V4d` "`QueryError` variant schema".
//
// Spec: errors-and-results/queryerror-variants.md, errors-and-results/error-model.md.
//
// Each test cites its REQ-ID inline and reds on its own primary assertion
// because the V4d behaviour is absent: `orderValidationIssues` is an identity
// copy (so it does not impose the canonical order), the ERR-15 conformance set
// is empty and the membership predicate reports every kind out-of-set, the
// ERR-17 synthesised issue is an inert sentinel, and `makeToolLoopExhaustedError`
// returns the wrong `kind` and a sentinel `rounds`. No test reds on a compile
// error, a missing fixture, or a harness throw.

function issue(
  path: string,
  schema_keyword: string,
  message: string,
): ValidationIssue {
  return { path, message, schema_keyword };
}

// --- ERR-14 — canonical ValidationIssue ordering ---------------------------

describe("ERR-14 — ValidationIssue ordering (queryerror-variants.md ERR-14)", () => {
  it("ERR-14: sorts ascending on the tuple (path, schema_keyword, message)", () => {
    // Primary key path, then schema_keyword, then message; deliberately shuffled.
    const input: ValidationIssue[] = [
      issue("/b", "type", "z"),
      issue("/a", "required", "m"),
      issue("/a", "enum", "n"),
      issue("/a", "enum", "a"),
      issue("/b", "const", "b"),
    ];
    const ordered = orderValidationIssues(input);
    expect(ordered.map((i) => [i.path, i.schema_keyword, i.message])).toEqual([
      ["/a", "enum", "a"],
      ["/a", "enum", "n"],
      ["/a", "required", "m"],
      ["/b", "const", "b"],
      ["/b", "type", "z"],
    ]);
  });

  it("ERR-14: validation_errors[0] is the canonically-first issue", () => {
    const ordered = orderValidationIssues([
      issue("/z", "type", "x"),
      issue("/a", "type", "x"),
    ]);
    expect(ordered[0]).toEqual(issue("/a", "type", "x"));
  });

  it("ERR-14: a stable sort preserves input order for equal-key entries", () => {
    // Two entries with an identical (path, schema_keyword, message) tuple but
    // distinguishable by identity, separated by a higher-keyed entry that the
    // canonical sort must move *after* them. A stable canonical sort yields
    // [first, second, later]; the identity stub leaves [first, later, second].
    const first = issue("/a", "type", "dup");
    const later = issue("/z", "type", "dup");
    const second = issue("/a", "type", "dup");
    const ordered = orderValidationIssues([first, later, second]);
    expect(ordered[0]).toBe(first);
    expect(ordered[1]).toBe(second);
    expect(ordered[2]).toBe(later);
  });

  it("ERR-14: compares by Unicode code point, not UTF-16 code unit", () => {
    // U+FFFF (65535) precedes U+1F600 (128512) by code point, but the first
    // UTF-16 code unit of U+1F600 (0xD83D = 55357) precedes U+FFFF by code unit.
    // A code-point comparison sorts "\uFFFF" first; a naive `<` (code-unit)
    // comparison sorts the astral character first.
    const astral = issue("\u{1F600}", "type", "m");
    const bmp = issue("\uFFFF", "type", "m");
    const ordered = orderValidationIssues([astral, bmp]);
    expect(ordered[0]).toBe(bmp);
    expect(ordered[1]).toBe(astral);
  });
});

// --- ERR-15 — discriminator type-openness seam -----------------------------

describe("ERR-15 — discriminator type-openness (queryerror-variants.md ERR-15)", () => {
  it("ERR-15: the runtime conformance set is exactly the nine loom 1.0.0 wire tags", () => {
    expect([...loom10QueryErrorKinds()]).toEqual([
      "validation",
      "transport",
      "model_tool",
      "context_overflow",
      "cancelled",
      "tool_loop_exhausted",
      "code_tool",
      "invoke_infra",
      "invoke_callee",
    ]);
  });

  it("ERR-15: the closed set recognises every loom 1.0.0 tag and rejects a future tag", () => {
    for (const kind of [
      "validation",
      "transport",
      "model_tool",
      "context_overflow",
      "cancelled",
      "tool_loop_exhausted",
      "code_tool",
      "invoke_infra",
      "invoke_callee",
    ]) {
      expect(isLoom10QueryErrorKind(kind)).toBe(true);
    }
    // A deferred user-defined / `BinderError`-as-variant tag is NOT in the
    // closed runtime set, even though the *type* admits it (see below).
    expect(isLoom10QueryErrorKind("binder")).toBe(false);
  });

  it("ERR-15: `kind` is typed `string` at the type level, so a future tag is assignable", () => {
    // Type-system witness: a hypothetical tenth variant's `kind` string is a
    // valid `QueryError["kind"]`. If `kind` were a closed enum of the nine
    // tags, this assignment would not type-check — its compilation is the open
    // seam. The runtime value is irrelevant; the assertion is that this builds.
    const futureKind: QueryError["kind"] = "binder";
    expect(typeof futureKind).toBe("string");
  });
});

// --- ERR-17 — forced-respond non-compliance synthesised issue --------------

describe("ERR-17 — forced-respond non-compliance synthesised shapes (queryerror-variants.md ERR-17)", () => {
  it("ERR-17: plain-text branch synthesises the fixed root-level required issue", () => {
    const synthesised = synthesizeForcedRespondIssue({ kind: "plain_text" });
    expect(synthesised).toEqual({
      path: "",
      message:
        "model returned plain text instead of calling the forced respond tool",
      schema_keyword: "required",
    });
  });

  it("ERR-17: wrong-tool branch names the provider tool and the synthesised respond tool", () => {
    const synthesised = synthesizeForcedRespondIssue({
      kind: "wrong_tool",
      providerToolName: "search",
      respondToolName: "__loom_respond_triage",
    });
    expect(synthesised).toEqual({
      path: "",
      message:
        "model invoked tool 'search' instead of the forced respond tool '__loom_respond_triage'",
      schema_keyword: "required",
    });
  });

  it("ERR-17: both branches emit path \"\" and schema_keyword \"required\"", () => {
    const plain = synthesizeForcedRespondIssue({ kind: "plain_text" });
    const wrong = synthesizeForcedRespondIssue({
      kind: "wrong_tool",
      providerToolName: "x",
      respondToolName: "__loom_respond_x",
    });
    for (const s of [plain, wrong]) {
      expect(s.path).toBe("");
      expect(s.schema_keyword).toBe("required");
    }
  });
});

// --- ERR-19 — ToolLoopExhaustedError shape ---------------------------------

describe("ERR-19 — ToolLoopExhaustedError shape (queryerror-variants.md ERR-19)", () => {
  it("ERR-19: carries kind \"tool_loop_exhausted\" with rounds == tool_loop.max_rounds", () => {
    const err = makeToolLoopExhaustedError({
      message: "tool-call loop exhausted",
      maxRounds: 8,
      last_tool_name: "search",
      raw_response: "thinking…",
    });
    expect(err.kind).toBe("tool_loop_exhausted");
    expect(err.rounds).toBe(8);
    expect(err.last_tool_name).toBe("search");
    expect(err.raw_response).toBe("thinking…");
  });

  it("ERR-19: raw_response is null on a pure tool-use terminal turn", () => {
    const err = makeToolLoopExhaustedError({
      message: "tool-call loop exhausted",
      maxRounds: 3,
      last_tool_name: "search",
      raw_response: null,
    });
    expect(err.rounds).toBe(3);
    expect(err.raw_response).toBeNull();
  });

  it("ERR-19: last_tool_name may be null (forward-compatibility branch)", () => {
    const err = makeToolLoopExhaustedError({
      message: "tool-call loop exhausted",
      maxRounds: 5,
      last_tool_name: null,
      raw_response: null,
    });
    expect(err.kind).toBe("tool_loop_exhausted");
    expect(err.rounds).toBe(5);
    expect(err.last_tool_name).toBeNull();
  });
});
