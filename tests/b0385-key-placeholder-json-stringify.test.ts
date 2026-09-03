import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody } from "../src/runtime/statement-executor";
import {
  evaluateIndexAccess,
  evaluateMemberAccess,
  isThetaPanic,
  MissingObjectKeyPanic,
  MISSING_OBJECT_KEY_CODE,
} from "../src/runtime/runtime-panics";
import { renderSourceDerived } from "../src/diagnostics/placeholder";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0385 — the shipped category-5 `<key>` renderer JSON-escapes non-identifier
// keys, but the fork spec text pins PLAIN double-quoting. This file is the
// codifying witness the bug's §Fix calls for ("add the vector as a unit cell
// over `renderSourceDerived` and the panic site"): it is GREEN at fork because
// the implementation already emits the JSON.stringify bytes, and its comments
// carry the two contradictory fork spec lines as the contradiction witness.
//
// WHY THIS FILE IS GREEN, NOT RED, AT FORK — this is a SPEC DEFECT with a
// CONFORMANT implementation (the 0300 fix shape). `renderSourceDerived`'s `key`
// arm (src/diagnostics/placeholder.ts:191-197,
// `isIdentifierShaped(text) ? text : JSON.stringify(text)`) has JSON-escaped
// since introduction. The FORK spec text contradicts those bytes in two places,
// re-derived by content against this tree:
//
//   1. docs/spec_topics/diagnostics/placeholder-rendering-b.md:11 — the §5
//      `<key>` rule: "quoted with double quotes only when the key string is
//      *not* identifier-shaped per Lexical — Identifiers (i.e. would not match
//      `[A-Za-z_][A-Za-z0-9_]*`); otherwise rendered bare." — NO escape step.
//   2. docs/spec_topics/diagnostics/placeholder-rendering-b.md:98 — the §8
//      `<observed>` carve-out glosses §5: "otherwise — **unlike `<key>`'s plain
//      double-quoting** — rendered via `JSON.stringify` …" — asserting `<key>`
//      is PLAIN double-quoting, i.e. no `"`/`\`/break escaping.
//
// Under those two lines, a `"`-carrying key `a"b` renders `"a"b"` and a
// break-carrying key `a<LF>b` renders `"a<LF>b"` — two physical lines. The
// second reading is UNSATISFIABLE against diagnostic-shape.md:34 ("`message`:
// single-line summary"), which is the crux the newline controls below pin: the
// shipped JSON.stringify bytes keep the message one line; the fork §5/§8
// plain-wrap reading would emit a raw U+000A. The §Fix amends the spec to
// JSON.stringify (the 0300 precedent); the implementation is already conformant,
// so this file locks the amended-spec bytes as literals and shows they PASS.
//
// The expected byte strings below are written as LITERALS (the spec-AMENDED
// bytes), never computed by `renderSourceDerived` or by `JSON.stringify` — an
// oracle computed by the code under test could not witness anything. `kind` and
// `my-key` are CONTROLS: escape-free, byte-identical under BOTH readings, so
// they stay green either way and red an over-correction (quote-always /
// bare-always).

// ===========================================================================
// The registered template this file interpolates (DIAG-4 source of truth).
// ===========================================================================

/** The registered *Message* template for `theta/runtime/missing-object-key`. */
const REGISTERED_TEMPLATE = "missing object key: <key>";

/** The live registry, read from the spec corpus — the DIAG-4 source of truth. */
const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as readonly { readonly code: string; readonly message: string }[];

// ===========================================================================
// Shared parse + production-executor harness (mirrors
// tests/missing-object-key-rendering.test.ts — offline, provider-free, no child
// process, no model).
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

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every probe
 * here is parse-clean by construction — a non-identifier-shaped (or escapable)
 * index string reaches the runtime unrejected — so a parse rejection is a
 * harness defect and must never let a probe pass or fail for the wrong reason
 * (CLAUDE.md: no silent test skipping).
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
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

/** The bug's §Reproduction frontmatter and fixture prologue. */
const FM = "---\nmode: prompt\n---\n";
const OBJECT_FIXTURE = "schema F { x: integer }\nlet o = F { x: 1 }\n";

/** One probe's disposition: the read produced a value, or the runtime threw. */
type Probe =
  | { readonly kind: "value"; readonly rendered: string }
  | { readonly kind: "threw"; readonly thrown: unknown };

/** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta("b0385.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "b0385",
    // Path deliberately carries no `theta/<name>` segment: the DIAG-2 corpus
    // gate (tests/registry-closed-set-corpus-gate.test.ts) extracts any
    // `theta/…`-shaped span in test text as an asserted code, and a fixture
    // path is a false-positive artefact that would otherwise need pinning in a
    // shared baseline fixture.
    sourcePath: "/probe/b0385.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    return { kind: "value", rendered: render(execution.result.value) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}

/** Call the emission site directly, capturing its throw (group (b)). */
function probeCall(call: () => ThetaValue): Probe {
  try {
    return { kind: "value", rendered: render(call()) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * Assert the panic fired from the right site with the right identity, then
 * assert its rendered message byte-exactly. Identity first (panic class,
 * `isThetaPanic`, registered code) so a red on the message line is unambiguous:
 * the panic fired, from the right site, with the right code, and only its
 * rendering is under scrutiny.
 */
function assertMissingObjectKeyPanic(probe: Probe, expectedMessage: string, what: string): void {
  if (probe.kind === "value") {
    throw new Error(
      `HARNESS/CONTROL BROKEN — ${what} must raise MissingObjectKeyPanic (code-registry-runtime.md:17: \`obj[k]\` where \`k\` is not a present theta-side name on \`obj\`); it instead produced value ${probe.rendered}`,
    );
  }
  const { thrown } = probe;
  expect(
    thrown,
    `${what} raises the missing-object-key panic class. Thrown: ${String(thrown)}`,
  ).toBeInstanceOf(MissingObjectKeyPanic);
  expect(
    isThetaPanic(thrown),
    "missing-object-key is one of the six closed panic sources (error-model.md:71)",
  ).toBe(true);
  expect(
    (thrown as { readonly code: string }).code,
    `the registered code stays ${MISSING_OBJECT_KEY_CODE} — bug 0385 §Fix makes no registry edit`,
  ).toBe(MISSING_OBJECT_KEY_CODE);
  expect(
    (thrown as Error).message,
    `bug 0385: ${what} must emit '${REGISTERED_TEMPLATE}' with <key> interpolated per the spec-AMENDED §5 rule (JSON.stringify for the non-identifier arm — the shipped bytes). The fork §5 (placeholder-rendering-b.md:11 "otherwise rendered bare") and §8 gloss (:98 "unlike \`<key>\`'s plain double-quoting") prescribe the plain wrap this assertion contradicts`,
  ).toBe(expectedMessage);
}

// ===========================================================================
// (1) renderSourceDerived's `key` arm directly (src/diagnostics/placeholder.ts).
// The doc's §Reproduction, escapable inputs. GREEN at fork: the arm already
// JSON.stringify-escapes; these literals are the spec-AMENDED bytes.
// ===========================================================================

describe("bug 0385 (1) — renderSourceDerived key arm emits the JSON.stringify (escaped) bytes", () => {
  it('escapable `"`: renderSourceDerived({kind:"key", text:\'a"b\'}) === \'"a\\"b"\'', () => {
    // §Reproduction: → "a\"b". The fork §5 `<key>` bullet's plain-wrap reading
    // ("otherwise rendered bare") would emit `"a"b"`; the shipped bytes escape
    // the interior quote, which this literal locks.
    expect(renderSourceDerived({ kind: "key", text: 'a"b' })).toBe('"a\\"b"');
  });

  it('escapable `\\`: renderSourceDerived({kind:"key", text:"a\\\\b"}) === \'"a\\\\b"\'', () => {
    // §Reproduction: → "a\\b". Interior backslash escaped.
    expect(renderSourceDerived({ kind: "key", text: "a\\b" })).toBe('"a\\\\b"');
  });

  it('escapable break: renderSourceDerived({kind:"key", text:"a\\nb"}) === \'"a\\nb"\' on ONE physical line', () => {
    // §Reproduction: → "a\nb" (escaped, single line). This is the crux of the
    // bug: diagnostic-shape.md:34 requires `message` to be single-line, but the
    // fork §5/§8 plain-wrap reading would emit a RAW U+000A here (two lines) —
    // unsatisfiable. The shipped bytes escape the break to `\n`.
    const rendered = renderSourceDerived({ kind: "key", text: "a\nb" });
    expect(rendered).toBe('"a\\nb"');
    expect(
      rendered.includes("\u000A"),
      "the break-carrying key must render on a SINGLE physical line (diagnostic-shape.md:34); a raw U+000A is the fork §5 plain-wrap bytes the shipped JSON.stringify arm rejects",
    ).toBe(false);
  });

  it('CONTROL — non-identifier escape-free key `my-key` renders quoted (byte-identical under both readings)', () => {
    expect(renderSourceDerived({ kind: "key", text: "my-key" })).toBe('"my-key"');
  });

  it('CONTROL — identifier-shaped key `kind` renders bare (byte-identical under both readings)', () => {
    expect(renderSourceDerived({ kind: "key", text: "kind" })).toBe("kind");
  });
});

// ===========================================================================
// (2a) The production EXECUTOR route — the wire-facing observable. Index access
// is the only spelling that can NAME an escapable key from theta source
// (member access cannot), so the executor cells drive `o["…"]`. The index
// string's escapes cook, the receiver lacks the key, the panic fires.
// ===========================================================================

describe("bug 0385 (2a) — executor: a missing escapable key renders JSON.stringify-escaped at the emission site", () => {
  it('`o["a\\"b"]` → missing object key: "a\\"b" (interior quote escaped)', async () => {
    assertMissingObjectKeyPanic(
      await probeSource(OBJECT_FIXTURE + 'o["a\\"b"]'),
      'missing object key: "a\\"b"',
      'the executor evaluating `o["a\\"b"]` on an object lacking that key',
    );
  });

  it('`o["a\\\\b"]` → missing object key: "a\\\\b" (interior backslash escaped)', async () => {
    assertMissingObjectKeyPanic(
      await probeSource(OBJECT_FIXTURE + 'o["a\\\\b"]'),
      'missing object key: "a\\\\b"',
      'the executor evaluating `o["a\\\\b"]` on an object lacking that key',
    );
  });

  it('`o["a\\nb"]` → missing object key: "a\\nb" on ONE physical line', async () => {
    const probe = await probeSource(OBJECT_FIXTURE + 'o["a\\nb"]');
    assertMissingObjectKeyPanic(
      probe,
      'missing object key: "a\\nb"',
      'the executor evaluating `o["a\\nb"]` on an object lacking that key',
    );
    // The crux: the message stays single-line (diagnostic-shape.md:34). The
    // fork §5/§8 plain-wrap reading would put the cooked U+000A straight into
    // `message`, breaking it across two lines.
    expect(probe.kind).toBe("threw");
    if (probe.kind === "threw") {
      expect(
        (probe.thrown as Error).message.includes("\u000A"),
        "the break-carrying-key panic message must be one physical line; a raw U+000A is the unsatisfiable fork plain-wrap byte",
      ).toBe(false);
    }
  });

  it('CONTROL — `o["kind"]` → bare `missing object key: kind`', async () => {
    assertMissingObjectKeyPanic(
      await probeSource(OBJECT_FIXTURE + 'o["kind"]'),
      "missing object key: kind",
      'the executor evaluating `o["kind"]` on an object lacking that key',
    );
  });

  it('CONTROL — `o["my-key"]` → quoted `missing object key: "my-key"`', async () => {
    assertMissingObjectKeyPanic(
      await probeSource(OBJECT_FIXTURE + 'o["my-key"]'),
      'missing object key: "my-key"',
      'the executor evaluating `o["my-key"]` on an object lacking that key',
    );
  });
});

// ===========================================================================
// (2b) The emission site called DIRECTLY. Both `evaluateIndexAccess` and
// `evaluateMemberAccess` route through the ONE presence gate `assertKeyPresent`
// (src/runtime/runtime-panics.ts:221-226) → renderSourceDerived key arm, so
// both spellings of an escapable name render byte-identically. Member access
// cannot NAME an escapable key from source, so it is pinned only via the direct
// call here.
// ===========================================================================

describe("bug 0385 (2b) — evaluateIndexAccess / evaluateMemberAccess directly: the throw site's rendering", () => {
  /** The receiver: a present theta-side key `x`, so every probed key is absent. */
  const receiver = { x: 1 } as ThetaValue;

  it('evaluateIndexAccess({x:1}, \'a"b\') throws missing object key: "a\\"b"', () => {
    assertMissingObjectKeyPanic(
      probeCall(() => evaluateIndexAccess(receiver, 'a"b')),
      'missing object key: "a\\"b"',
      'evaluateIndexAccess({ x: 1 }, \'a"b\') at the throw site (assertKeyPresent)',
    );
  });

  it('evaluateIndexAccess({x:1}, "a\\\\b") throws missing object key: "a\\\\b"', () => {
    assertMissingObjectKeyPanic(
      probeCall(() => evaluateIndexAccess(receiver, "a\\b")),
      'missing object key: "a\\\\b"',
      'evaluateIndexAccess({ x: 1 }, "a\\\\b") at the throw site',
    );
  });

  it('evaluateMemberAccess({x:1}, "a\\nb") throws missing object key: "a\\nb" on ONE physical line', () => {
    const probe = probeCall(() => evaluateMemberAccess(receiver, "a\nb"));
    assertMissingObjectKeyPanic(
      probe,
      'missing object key: "a\\nb"',
      'evaluateMemberAccess({ x: 1 }, "a\\nb") at the throw site (shared assertKeyPresent gate)',
    );
    expect(probe.kind).toBe("threw");
    if (probe.kind === "threw") {
      expect(
        (probe.thrown as Error).message.includes("\u000A"),
        "the break-carrying-key panic message must be one physical line (diagnostic-shape.md:34)",
      ).toBe(false);
    }
  });

  it('CONTROL — evaluateMemberAccess({x:1}, "kind") throws bare `missing object key: kind`', () => {
    assertMissingObjectKeyPanic(
      probeCall(() => evaluateMemberAccess(receiver, "kind")),
      "missing object key: kind",
      'evaluateMemberAccess({ x: 1 }, "kind") at the throw site',
    );
  });

  it('CONTROL — evaluateIndexAccess({x:1}, "my-key") throws quoted `missing object key: "my-key"`', () => {
    assertMissingObjectKeyPanic(
      probeCall(() => evaluateIndexAccess(receiver, "my-key")),
      'missing object key: "my-key"',
      'evaluateIndexAccess({ x: 1 }, "my-key") at the throw site',
    );
  });
});

// ===========================================================================
// (3) DIAG-4 drift guard. This file's oracle is the registry's *Message* column
// with `<key>` filled per the spec-AMENDED §5 rule. Pin the template so a silent
// registry change cannot turn the literal expectations above stale.
// ===========================================================================

describe("bug 0385 (3) — the registered template this file interpolates (DIAG-4)", () => {
  it("the registry row for theta/runtime/missing-object-key still carries `missing object key: <key>`", () => {
    expect(
      registryMessage(REGISTRY, MISSING_OBJECT_KEY_CODE),
      "code-registry-runtime.md is the DIAG-4 source of truth for this file's expected strings; a change here invalidates the vectors above",
    ).toBe(REGISTERED_TEMPLATE);
  });
});
