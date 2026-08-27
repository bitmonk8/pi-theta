import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody } from "../src/runtime/statement-executor";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0318 — a `match` identifier pattern named `__proto__` binds nothing.
// `matchPattern`'s identifier arm accumulates the binding by plain assignment
// into a `{}`-initialised record — `bindings[pattern.name] = value`
// (src/runtime/match-result.ts:177-178). For `pattern.name === "__proto__"`
// that write lands on `Object.prototype`'s inherited accessor: a primitive
// scrutinee no-ops the setter, an object scrutinee swaps the record's
// prototype; neither creates an own key. `evalMatch` then installs arm
// bindings by walking own enumerable keys —
// `Object.entries(chosen.bindings)` (src/runtime/statement-executor.ts:1277) —
// so the lost key never reaches `defineLocal` and the arm body's `__proto__`
// reference resolves to `null`. The arm still selects (identifier patterns
// match anything), so the failure is silent: `outcome=success`, parse `[]`.
// This is the one runtime record-building site the 0119/0210 prototype-slot
// fixes did not convert — bug 0210 §Fix residual 4 named this exact write and
// left it unclaimed. (docs/bugs/0318-match-identifier-pattern-proto-binding-lost.md)
//
// SETTLED FIX (release 0.297.0): route the identifier-pattern write through the
// landed idiom — `defineRecordField(bindings, pattern.name, value)`
// (src/runtime/value.ts:596), exactly as bug 0119's fix creates a `__proto__`
// string key as an own property instead of assigning through the inherited
// accessor. `Object.entries`/own-key consumers then see the byte-identical
// descriptor and the arm body binds the scrutinee value.
//
// WITNESS TABLE (Observed = current fork/RED; Expected = the settled contract):
//   P3a       WITNESS  match "hello" { __proto__ => __proto__ }            null -> "hello"
//   P3b       WITNESS  match d { __proto__ => __proto__ } over P{a:1}      null -> {"a":1}
//   Shorthand WITNESS  match d { P2 { __proto__ } => __proto__ } over P2   null -> 5
//   P3c       CONTROL  match "hello" { other => other }                    "hello" = "hello"
//
// The shorthand row covers the object-field-shorthand spelling of the same
// identifier write: the own `__proto__` field read (own-key-guarded, so it
// reads 5 correctly) recurses into an identifier pattern named `__proto__`,
// which drops the value at the same accessor.
//
// RED-FOR-RIGHT-REASON: each `it` states its Observed (RED) value and its
// Expected (GREEN) value in the assertion message. P3a/P3b/shorthand are RED
// against this fork; P3c is GREEN against this fork and must stay green after
// the fix.

// ===========================================================================
// Shared parse + production-executor harness (the b0317 pattern, verbatim in
// shape): parseThetaDocument -> createProductionProducerDeps ->
// bindPromptConversation -> executeBody. Offline, provider-free, deterministic.
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
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

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every row
 * is parse-clean per the bug's §Reproduction (diagnostics `[]`; `__proto__` is
 * an ordinary identifier under the lexical grammar and admits a `_` lead at
 * binding positions), so a rejection here is a harness precondition breach,
 * never a silent skip.
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const doc = parseOnly(path, src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

const FM = "---\nmode: prompt\n---\n";

/** Parse + run a self-contained query-free prompt-mode body and return its final value. */
async function runValue(src: string): Promise<ThetaValue | undefined> {
  const doc = parseTheta("b0318.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "b0318",
    sourcePath: "/proj/b0318.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  expect(execution.outcome, "the body must succeed").toBe("success");
  return execution.result.value;
}

// ===========================================================================
// P3a — WITNESS. A bare identifier pattern named `__proto__` over a primitive
// scrutinee. RED at this fork: the identifier write hits the inherited setter
// and no-ops, so the arm body reads `null`. GREEN: the pattern binds the
// scrutinee, so the body evaluates to "hello".
// ===========================================================================

describe("bug 0318 P3a — identifier pattern named __proto__ must bind the primitive scrutinee", () => {
  it('RED (P3a): `match "hello" { __proto__ => __proto__ }` yields null, not "hello"', async () => {
    expect(
      await runValue('let v = match "hello" { __proto__ => __proto__ }\nv'),
      'P3a: RED shows null (bindings["__proto__"] = "hello" no-ops the inherited setter, the arm reads no local); GREEN shows "hello"',
    ).toBe("hello");
  });
});

// ===========================================================================
// P3b — WITNESS. A bare identifier pattern named `__proto__` over an object
// scrutinee. RED at this fork: the identifier write swaps the bindings record's
// prototype and creates no own key, so the arm body reads `null`. GREEN: the
// pattern binds the record, so the body evaluates to it.
// ===========================================================================

describe("bug 0318 P3b — identifier pattern named __proto__ must bind the object scrutinee", () => {
  it('RED (P3b): `match d { __proto__ => __proto__ }` over `P { a: 1 }` yields null, not {"a":1}', async () => {
    expect(
      await runValue(
        "schema P { a: integer }\nlet d = P { a: 1 }\nlet v = match d { __proto__ => __proto__ }\nv",
      ),
      'P3b: RED shows null (the object value becomes the bindings record\'s prototype, no own key created); GREEN shows {"a":1}',
    ).toEqual({ a: 1 });
  });
});

// ===========================================================================
// Shorthand — WITNESS (per §Fix). An object-field-shorthand spelling of the
// same identifier write. The own `__proto__` field read is own-key-guarded and
// reads 5 correctly, then recurses into an identifier pattern named
// `__proto__` which drops the value at the inherited accessor. RED at this
// fork: the arm body reads `null`. GREEN: the shorthand binds 5.
// ===========================================================================

describe("bug 0318 shorthand — object-field-shorthand __proto__ must bind the read field", () => {
  it('RED (shorthand): `match d { P2 { __proto__ } => __proto__ }` over `P2 { __proto__: 5 }` yields null, not 5', async () => {
    expect(
      await runValue(
        "schema P2 { __proto__: integer }\nlet d = P2 { __proto__: 5 }\nlet v = match d { P2 { __proto__ } => __proto__ }\nv",
      ),
      "shorthand: RED shows null (field read is own-key-guarded so it reads 5, but the shorthand's identifier write drops it at the inherited setter); GREEN shows 5",
    ).toBe(5);
  });
});

// ===========================================================================
// P3c — CONTROL. Any other identifier spelling binds correctly. GREEN now and
// after the fix: `other` is an ordinary string key on the bindings record, so
// the assignment creates an own key and the arm body reads the scrutinee. This
// pins the fix's boundary — the identifier arm's behaviour for non-exotic
// names is untouched.
// ===========================================================================

describe("bug 0318 P3c — identifier pattern with an ordinary name still binds (control)", () => {
  it('CONTROL (P3c): `match "hello" { other => other }` yields "hello"', async () => {
    expect(
      await runValue('let v = match "hello" { other => other }\nv'),
      'P3c: GREEN now and after — "other" is an ordinary own key, so the identifier arm binds the scrutinee',
    ).toBe("hello");
  });
});
