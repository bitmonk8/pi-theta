import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
  isThetaPanic,
  MissingObjectKeyPanic,
  MISSING_OBJECT_KEY_CODE,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0036 — `MissingObjectKeyPanic`'s one emission site interpolates the raw
// key (`src/runtime/runtime-panics.ts:270`,
// `` `missing object key: ${key}` ``), so a key that is NOT identifier-shaped
// renders bare where the registered template's `<key>` slot demands the
// category-5 rendering: `o["my-key"]` emits `missing object key: my-key` where
// the spec's own vector pins `missing object key: "my-key"`
// (docs/bugs/0036-missing-object-key-bare-key-rendering.md).
//
// WHY THIS FILE EXISTS AT ALL — the divergence class is "emission site bypasses
// the rendering layer", which unit coverage of the renderer cannot see. The
// conformant renderer (`renderSourceDerived`'s `key` arm,
// src/diagnostics/placeholder.ts:191–197) is already pinned green against these
// exact two vectors by tests/placeholder-rendering.test.ts:123–124; before the
// 0036 fix it had NO production caller, so the suite affirmed the rule at the
// unit level while the wire behaviour diverged from it. This file drives the
// vectors through the EMISSION site — the only place the rule is live.
//
// Spec anchors (DIAG-4: the registry's *Message* column is the source of truth,
// its `<…>` placeholders interpolated by the per-category rendering rules):
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:11 — the §5
//     `<key>` rule: "quoted with double quotes only when the key string is
//     *not* identifier-shaped per Lexical — Identifiers (i.e. would not match
//     `[A-Za-z_][A-Za-z0-9_]*`); otherwise rendered bare. The identifier-shape
//     predicate is a runtime check on the key string, not a parse-time grammar
//     production."
//   - :19–20 — the two normative test vectors, which name THIS template: a
//     missing `obj["my-key"]` renders `missing object key: "my-key"` (not
//     identifier-shaped, so quoted); a missing `obj["kind"]` renders
//     `missing object key: kind` (identifier-shaped, so bare).
//   - :129 — the same predicate restated as a normative edge case ("a key like
//     `kind` renders bare, `my-key` renders quoted"), plus the reserved-keyword
//     carve-out: a key whose string value matches a reserved keyword is still
//     identifier-shaped. `kind` itself is NOT reserved (lexical.md:20) — it is
//     :20's own bare vector, chosen here for vector fidelity.
//   - docs/spec_topics/errors-and-results/error-model.md:76 — the templates are
//     normative: "a conformant runtime MUST emit the registered string (with
//     template placeholders filled from the offending value) for every panic of
//     that source, and conformance tests MAY assert on the exact string. The
//     `<…>` placeholders inside each template are interpolated by the
//     per-category rules in Diagnostics — Placeholder rendering."
//   - docs/spec_topics/diagnostics/code-registry-runtime.md:17 — the
//     `theta/runtime/missing-object-key` row, Message `missing object key: <key>`,
//     Trigger `obj[k]` where `k` is not a present theta-side name on `obj`.
//
// THE ONE RED AXIS is the message's byte shape for a non-identifier-shaped key.
// Everything else about the panic is asserted here as a CONTROL that is green
// both before and after the fix — the panic class (`MissingObjectKeyPanic`),
// `isThetaPanic(thrown) === true` (missing-object-key is one of the six closed
// panic sources, error-model.md:71, and the fix does not move it off that list),
// and the registered code `theta/runtime/missing-object-key`. Asserting those
// FIRST in every probe means a red on the message line is unambiguous: the
// panic fired, from the right site, with the right code, and only its rendering
// diverged.
//
// Groups:
//   (a) the production EXECUTOR route (both hosts route indexed access through
//       the one `evaluateIndexAccess` definition, so one executor route
//       suffices for the wire-facing observable);
//   (b) the emission site called DIRECTLY, so the site stays pinned even if the
//       executor route later gains layers (bug 0036 §Fix, test witness (2));
//   (c) the registry-template drift guard (DIAG-4).
//
// SCOPE — three things this file deliberately does NOT do:
//   - it does not touch tests/placeholder-rendering.test.ts, which stays the
//     renderer-side pin (bug 0036 §Fix: "Keep …:123–124 as the renderer-side
//     pin");
//   - it does not import `renderSourceDerived`. The oracle here is the spec's
//     published byte string, not the function the fix happens to call — an
//     oracle computed by the implementation under test could not red;
//   - it asserts nothing about member access (`o.absent`), which is bug 0032's
//     surface. When 0032 lands, its shared presence gate becomes the single
//     interpolation point these assertions ride on; the byte strings are
//     unchanged by that rebase.
//
// HARNESS — group (a) reuses tests/non-object-receiver-gate.test.ts's
// production-executor pattern verbatim: parseThetaDocument →
// createProductionProducerDeps → bindPromptConversation → executeBody. Offline,
// provider-free, no child process, no model. `parseTheta` fails LOUDLY on any
// error-severity diagnostic, and a probe that produces a VALUE instead of
// panicking throws with the value rendered — a probe can never silently skip or
// pass for the wrong reason (CLAUDE.md: no silent test skipping).

// ===========================================================================
// The contract under test — the registered template and its two §5 renderings.
// ===========================================================================

/**
 * The registered *Message* template for `theta/runtime/missing-object-key`
 * (code-registry-runtime.md:17). Restated here so group (c) can red on a drift
 * between this file and the registry rather than silently asserting a stale
 * string.
 */
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

/**
 * The registered template with `<key>` filled by its ALREADY-RENDERED category-5
 * form. `rendered` is written out literally at each call site (`"my-key"` with
 * its quotes, `kind` without) so the expected byte string comes from the spec
 * vectors at placeholder-rendering-b.md:19–20 and not from any renderer in the
 * tree.
 */
function missingKeyMessage(rendered: string): string {
  const template = registryMessage(REGISTRY, MISSING_OBJECT_KEY_CODE) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no registry row for ${MISSING_OBJECT_KEY_CODE} — the DIAG-4 Message column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template.replace("<key>", rendered);
}

/** §5 vector 1 (`:19`) — a key that is not identifier-shaped renders QUOTED. */
const QUOTED_MY_KEY = missingKeyMessage('"my-key"');
/** §5 vector 2 (`:20`) — an identifier-shaped key renders BARE. */
const BARE_KIND = missingKeyMessage("kind");
/** The identifier-shaped key the existing suite already asserts bare. */
const BARE_DEFINITELY_ABSENT = missingKeyMessage("definitely_absent");

// ===========================================================================
// Shared parse + production-executor harness (the tests/non-object-receiver-gate.test.ts
// pattern).
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
 * here is parse-clean by construction — the static object-index check
 * (`checkObjectIndex`, src/runtime/stdlib-object.ts) requires only that the
 * index be a `string`, so a non-identifier-shaped key reaches the runtime
 * (bug 0036 §Reproduction). A parse rejection is therefore a harness defect,
 * and must never let a probe pass or fail for the wrong reason.
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

/** The bug's §Reproduction frontmatter and fixture prologue, verbatim. */
const FM = "---\nmode: prompt\n---\n";
const OBJECT_FIXTURE = "schema F { x: integer }\nlet o = F { x: 1 }\n";

/**
 * One probe's disposition: the read produced a value (rendered for the failure
 * message), or the runtime threw. Both the executor route (a) and the direct
 * call (b) reduce to this shape, so one assertion helper covers both.
 */
type Probe =
  | { readonly kind: "value"; readonly rendered: string }
  | { readonly kind: "threw"; readonly thrown: unknown };

/** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta("bug0036.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "bug0036",
    sourcePath: "/theta/bug0036.theta",
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
 * assert its rendered message byte-exactly.
 *
 * Assertion ORDER is deliberate. The identity assertions (panic class,
 * `isThetaPanic`, registered code) are green both before and after the bug-0036
 * fix; the message equality is the single red axis. Asserting identity first
 * means a red on the last line reports exactly the divergence the bug describes
 * — a rendering difference — rather than leaving open whether the panic fired
 * at all.
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
    `CONTROL (green before and after bug 0036): ${what} raises the missing-object-key panic class. Thrown: ${String(thrown)}`,
  ).toBeInstanceOf(MissingObjectKeyPanic);
  expect(
    isThetaPanic(thrown),
    "CONTROL (green before and after): missing-object-key is one of the six closed panic sources (error-model.md:71); bug 0036 changes only the message's byte shape, never the panic's class or its `?` / `match` bypass",
  ).toBe(true);
  expect(
    (thrown as { readonly code: string }).code,
    `CONTROL (green before and after): the registered code stays ${MISSING_OBJECT_KEY_CODE} — bug 0036 §Fix makes no registry edit`,
  ).toBe(MISSING_OBJECT_KEY_CODE);
  expect(
    (thrown as Error).message,
    `PRIMARY (bug 0036): ${what} must emit the registered template '${REGISTERED_TEMPLATE}' with <key> interpolated per placeholder-rendering-b.md:11 (§5) — quoted when the key is not identifier-shaped, bare otherwise. error-model.md:76 makes the template normative and licenses this exact-string assertion. bug 0036 was the site interpolating the RAW key (runtime-panics.ts:270), which rendered a non-identifier-shaped key bare`,
  ).toBe(expectedMessage);
}

// ===========================================================================
// (a) The production EXECUTOR route — the wire-facing observable. Both hosts
// (src/runtime/statement-executor.ts:704 and
// src/extension/production-theta-producer.ts:5749) call the same
// `evaluateIndexAccess`, so the rendering has one definition point and one
// executor route pins it.
// ===========================================================================

describe("bug 0036 (a) — executor: a missing key renders per §5 at the emission site", () => {
  it('RED (a1): `o["my-key"]` panics with the QUOTED `missing object key: "my-key"`', async () => {
    // placeholder-rendering-b.md:19, verbatim: 'A `match` on `obj["my-key"]`
    // against a missing key renders `missing object key: "my-key"` (key is not
    // identifier-shaped, so quoted).' The index spelling is the ONLY spelling
    // that can name such a key — member access cannot — which is why the spec's
    // own vector uses one.
    assertMissingObjectKeyPanic(
      await probeSource(OBJECT_FIXTURE + 'o["my-key"]'),
      QUOTED_MY_KEY,
      'the executor evaluating `o["my-key"]` on an object lacking that key',
    );
  });

  it('CONTROL (a2): `o["kind"]` panics with the BARE `missing object key: kind`', async () => {
    // placeholder-rendering-b.md:20's vector: `kind` matches
    // `^[A-Za-z_][A-Za-z0-9_]*$`, so it renders bare. (`kind` is not in
    // Lexical — Reserved keywords, lexical.md:20; the :129 carve-out — a key
    // that DOES match a reserved keyword stays identifier-shaped — holds for
    // the same reason: the predicate is a runtime string check on the key
    // value, not a parse-time check on a source position.) Green now, green
    // after: the two rules already agree here, and this control reds if a fix
    // over-corrects into quote-always.
    assertMissingObjectKeyPanic(
      await probeSource(OBJECT_FIXTURE + 'o["kind"]'),
      BARE_KIND,
      'the executor evaluating `o["kind"]` on an object lacking that key',
    );
  });

  it('CONTROL (a3): `o["definitely_absent"]` panics bare — the rendering already asserted elsewhere in the suite', async () => {
    // tests/non-object-receiver-gate.test.ts:928 (its control i6) asserts this
    // exact byte string today. Repeating it here means an over-broad
    // quote-always fix reds in the file that owns the rule, next to the vector
    // it violates, instead of only in an unrelated file's control.
    assertMissingObjectKeyPanic(
      await probeSource(OBJECT_FIXTURE + 'o["definitely_absent"]'),
      BARE_DEFINITELY_ABSENT,
      'the executor evaluating `o["definitely_absent"]`',
    );
  });
});

// ===========================================================================
// (b) The emission site called DIRECTLY (`evaluateIndexAccess`,
// src/runtime/runtime-panics.ts:223; presence test :269, throw :270). Bug 0036
// §Fix test witness (2): "a direct `evaluateIndexAccess` unit for the same
// pair, so the emission site is pinned even if the executor route later gains
// layers." The receiver is a plain object literal, the way
// tests/runtime-panics.test.ts:140 already calls this function.
// ===========================================================================

describe("bug 0036 (b) — evaluateIndexAccess directly: the throw site's own rendering", () => {
  /** The receiver: a present theta-side key `x`, so every probed key is absent. */
  const receiver = { x: 1 } as ThetaValue;

  it('RED (b1): `evaluateIndexAccess({ x: 1 }, "my-key")` throws the QUOTED message', () => {
    assertMissingObjectKeyPanic(
      probeCall(() => evaluateIndexAccess(receiver, "my-key")),
      QUOTED_MY_KEY,
      'evaluateIndexAccess({ x: 1 }, "my-key") at the throw site (runtime-panics.ts:270)',
    );
  });

  it('CONTROL (b2): `evaluateIndexAccess({ x: 1 }, "kind")` throws the BARE message', () => {
    assertMissingObjectKeyPanic(
      probeCall(() => evaluateIndexAccess(receiver, "kind")),
      BARE_KIND,
      'evaluateIndexAccess({ x: 1 }, "kind") at the throw site',
    );
  });

  it('CONTROL (b3): `evaluateIndexAccess({ x: 1 }, "definitely_absent")` throws the BARE message', () => {
    assertMissingObjectKeyPanic(
      probeCall(() => evaluateIndexAccess(receiver, "definitely_absent")),
      BARE_DEFINITELY_ABSENT,
      'evaluateIndexAccess({ x: 1 }, "definitely_absent") at the throw site',
    );
  });
});

// ===========================================================================
// (c) DIAG-4 drift guard. This file's oracle is the registry's *Message* column
// with `<key>` filled per §5. If the registry row's template ever changes, the
// expectations above stop meaning what their comments claim, so pin the
// template itself rather than letting a silent drift turn a red into a green.
// ===========================================================================

describe("bug 0036 (c) — the registered template this file interpolates (DIAG-4)", () => {
  it("the registry row for theta/runtime/missing-object-key still carries `missing object key: <key>`", () => {
    expect(
      registryMessage(REGISTRY, MISSING_OBJECT_KEY_CODE),
      "code-registry-runtime.md:17 is the DIAG-4 source of truth for this file's expected strings; bug 0036 §Fix makes NO registry edit (the template always carried §5 semantics), so a change here invalidates the vectors above",
    ).toBe(REGISTERED_TEMPLATE);
    // The two §5 renderings the vectors publish, spelled out so a reader can
    // check them against placeholder-rendering-b.md:19–20 without running the
    // interpolation in their head.
    expect(QUOTED_MY_KEY).toBe('missing object key: "my-key"');
    expect(BARE_KIND).toBe("missing object key: kind");
  });
});
