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

// Bug 0317 — the runtime object/schema pattern classifies its scrutinee by JS
// `typeof`, so it structurally matches the interpreter-private enum and
// `Result` carriers. The `case "object"` arm of `matchPattern`
// (`src/runtime/match-result.ts`) tests only `typeof value !== "object" ||
// value === null || Array.isArray(value)` at its receiver check; a
// boxed-`String` enum carrier and a branded `Result` literal both pass it. The
// arm's `hasOwnProperty` field-presence test then reads carrier-internal keys —
// the `Result`'s enumerable `ok`/`value`/`error` and the boxed `String`'s own
// `length` — and binds them into pattern fields. So
// `match Ok(true) { R { ok } => … }` selects the object arm ahead of a
// legitimate `Ok(inner)` arm and binds the internal discriminator, `Err("boom")`
// leaks `error`, and an enum scrutinee matches `{ length }` binding the boxed
// carrier's code-unit count. This is the pattern-position sibling of bug 0027's
// fixed read-dispatch defect: the same `typeof`-based classification admits the
// two carriers, but the pattern-match entry point was not among the four READ
// sites 0027 gated with `isObjectValue` (`src/runtime/value.ts`) — the landed
// single classification point whose consumer list does not include the pattern
// path. The runtime pattern also carries no head name (`toRuntimePattern` in
// `src/runtime/statement-executor.ts` drops it, its object arm carrying fields
// only), so the parse-resolved head cannot re-constrain the scrutinee kind at
// runtime. (docs/bugs/0317-object-pattern-matches-enum-result-carriers.md)
//
// SETTLED FIX (release 0.296.0): add the carrier gate to `matchPattern`'s object
// arm — `if (!isObjectValue(value)) return false;` beside the existing `typeof`
// test. Disposition is FAIL-TO-MATCH (fall through to later arms / MatchError),
// NOT a thrown rejection — matching the pattern table's "matches / doesn't
// match" semantics. Only the non-object carriers (enum, `Result`) stop taking
// the object arm; a plain-object or schema-branded scrutinee still matches any
// declared head's field list exactly as at HEAD.
//
// WITNESS TABLE (Observed = current HEAD/RED; Expected = the settled contract):
//   P4a  WITNESS  match Ok(1) via Rec{ok} => "leaked"          "leaked" -> "clean"
//   P4b  WITNESS  match Ok(1) via Rec{ok} => ok                true     -> false
//   P4c  WITNESS  match Err("boom") via Rec2{error} => error   "boom"   -> "clean"
//   P4d  WITNESS  match Severity.High via Rec3{length}=>length 4        -> -1
//   X5   WITNESS  match Ok(true) { R4{ok}=>.., Ok(inner)=>.. } "obj-arm"-> "ok-arm"
//   P4e  CONTROL  match Rec{ok:true} via Rec{ok} => "matched"  "matched" = "matched"
//
// X5 is the arm-ordering witness: on a genuine `Result` scrutinee an object arm
// listed first silently intercepts every value the author's `Ok(inner)` arm
// below was written to receive.
//
// RED-FOR-RIGHT-REASON: each `it` states its Observed (RED) value and its
// Expected (GREEN) value in the assertion message. P4a–P4d and X5 are RED
// against HEAD; P4e is GREEN against HEAD and must stay green after the fix.

// ===========================================================================
// Shared parse + production-executor harness (the b0314/b0316 pattern, verbatim
// in shape): parseThetaDocument -> createProductionProducerDeps ->
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
 * is parse-clean at HEAD by the bug's §Reproduction (diagnostics `[]`; heads
 * resolve per bug 0221, listed fields are declared per bug 0226), so a
 * rejection here is a harness precondition breach, never a silent skip.
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
  const doc = parseTheta("b0317.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "b0317",
    sourcePath: "/proj/b0317.theta",
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
// P4a — WITNESS. An object pattern over a genuine `Ok(1)` scrutinee takes the
// object arm and leaks. RED at HEAD: `Rec { ok }` structurally matches the
// Result carrier's enumerable `ok`, so the first arm fires; GREEN: the carrier
// fails the object arm and the `_` arm wins.
// ===========================================================================

describe("bug 0317 P4a — object pattern over Ok(1) must not take the object arm", () => {
  it('RED (P4a): `match Ok(1) { Rec { ok } => "leaked", _ => "clean" }` yields "leaked", not "clean"', async () => {
    expect(
      await runValue(
        'schema Rec { ok: boolean }\nlet r = Ok(1)\nlet v = match r { Rec { ok } => "leaked", _ => "clean" }\nv',
      ),
      'P4a: RED shows "leaked" (Result carrier passes the typeof-only object arm, hasOwnProperty("ok") is true); GREEN shows "clean"',
    ).toBe("clean");
  });
});

// ===========================================================================
// P4b — WITNESS. The same leak binding the internal discriminator. RED at HEAD:
// `ok` binds the Result carrier's private `ok` flag (true); GREEN: the object
// arm fails and the `_` arm returns false.
// ===========================================================================

describe("bug 0317 P4b — object pattern over Ok(1) must not bind the carrier's ok flag", () => {
  it("RED (P4b): `match Ok(1) { Rec { ok } => ok, _ => false }` yields true, not false", async () => {
    expect(
      await runValue(
        "schema Rec { ok: boolean }\nlet r = Ok(1)\nlet v = match r { Rec { ok } => ok, _ => false }\nv",
      ),
      "P4b: RED shows true (ok binds the Result carrier's internal discriminator); GREEN shows false (the _ arm)",
    ).toBe(false);
  });
});

// ===========================================================================
// P4c — WITNESS. An `Err("boom")` scrutinee leaks its payload through a pattern
// field. RED at HEAD: `Rec2 { error }` binds the carrier's `error` key; GREEN:
// the carrier fails the object arm and the `_` arm wins.
// ===========================================================================

describe("bug 0317 P4c — object pattern over Err(\"boom\") must not leak the error payload", () => {
  it('RED (P4c): `match Err("boom") { Rec2 { error } => error, _ => "clean" }` yields "boom", not "clean"', async () => {
    expect(
      await runValue(
        'schema Rec2 { error: string }\nlet r = Err("boom")\nlet v = match r { Rec2 { error } => error, _ => "clean" }\nv',
      ),
      'P4c: RED shows "boom" (payload read via the Err carrier\'s enumerable error key); GREEN shows "clean"',
    ).toBe("clean");
  });
});

// ===========================================================================
// P4d — WITNESS. An enum scrutinee matches `{ length }`, binding the boxed
// `String`'s own code-unit count. RED at HEAD: `Rec3 { length }` binds
// "High".length (4); GREEN: the enum carrier fails the object arm, `_` gives -1.
// ===========================================================================

describe("bug 0317 P4d — object pattern over an enum value must not bind the boxed String's length", () => {
  it("RED (P4d): `match Severity.High { Rec3 { length } => length, _ => -1 }` yields 4, not -1", async () => {
    expect(
      await runValue(
        "enum Severity { Low, High }\nschema Rec3 { length: integer }\nlet s = Severity.High\nlet v = match s { Rec3 { length } => length, _ => -1 }\nv",
      ),
      "P4d: RED shows 4 (boxed \"High\"'s own non-enumerable length passes hasOwnProperty); GREEN shows -1 (the _ arm)",
    ).toBe(-1);
  });
});

// ===========================================================================
// X5 — WITNESS (arm ordering). On a genuine `Result` scrutinee an object arm
// listed first silently intercepts a value the `Ok(inner)` arm below was written
// to receive. RED at HEAD: `R4 { ok }` matches Ok(true) first ("obj-arm");
// GREEN: the object arm fails, the `Ok(inner)` arm fires ("ok-arm").
// ===========================================================================

describe("bug 0317 X5 — object arm above Ok(inner) must not intercept a Result scrutinee", () => {
  it('RED (X5): `match Ok(true) { R4 { ok } => "obj-arm", Ok(inner) => "ok-arm", _ => "wild" }` yields "obj-arm", not "ok-arm"', async () => {
    expect(
      await runValue(
        'schema R4 { ok: boolean }\nlet v = match Ok(true) { R4 { ok } => "obj-arm", Ok(inner) => "ok-arm", _ => "wild" }\nv',
      ),
      'X5: RED shows "obj-arm" (the object arm intercepts the Result ahead of Ok(inner)); GREEN shows "ok-arm"',
    ).toBe("ok-arm");
  });
});

// ===========================================================================
// P4e — CONTROL. A real object value (schema-branded plain object) matches its
// object pattern. GREEN now and after the fix: `isObjectValue` is true for a
// plain object, so the gate leaves it taking the object arm. This pins the
// fix's boundary — object semantics for genuine objects are untouched.
// ===========================================================================

describe("bug 0317 P4e — object pattern over a real object value still matches (control)", () => {
  it('CONTROL (P4e): `match Rec { ok: true } { Rec { ok } => "matched", _ => "no" }` yields "matched"', async () => {
    expect(
      await runValue(
        'schema Rec { ok: boolean }\nlet o = Rec { ok: true }\nlet v = match o { Rec { ok } => "matched", _ => "no" }\nv',
      ),
      "P4e: GREEN now and after — a genuine object value is isObjectValue-true, so the object arm still matches",
    ).toBe("matched");
  });
});
