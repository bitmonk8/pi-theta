import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  resolveBinderModel,
  BINDER_MODEL_UNRESOLVED_CODE,
  BINDER_MODEL_UNRESOLVED_MESSAGE,
  type BinderModelResolutionInput,
} from "../src/binder/binder-model";
import { codes, findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0297 — a `bind_context:` (and its sibling `bind_model:`) whose value is a
// YAML sequence or mapping registers the theta SILENTLY with the field's
// absent-default, where the registry row refuses registration for a present
// value that "is neither `none` nor `session`"
// (docs/bugs/0297-bind-context-nonscalar-silently-registers.md).
//
// THE SEAM — the same node-kind narrowing bug 0296 exposed at the `mode:` arm,
// here at the two sibling arms, BEFORE the fix below closed it. The
// `bind_context` arm (`src/parser/frontmatter.ts:1195-1209` post-fix) used to
// recover the value only for scalar nodes
// (`bindContextValue = isScalar(item.value) ? String(item.value.value) :
// undefined`), leaving a non-scalar value indistinguishable from an absent key,
// so the unknown-value arm (`src/parser/frontmatter.ts:1414-1432` post-fix), was
// gated on `bindContextValue !== undefined` and never ran — the theta
// registered with zero diagnostics, and the binder ran with the default `none`
// against an author who declared a `bind_context`. The `bind_model` arm
// (`src/parser/frontmatter.ts:1142-1156` post-fix) had the same shape: a
// non-scalar `bind_model:` recorded `undefined` and downstream binder-model
// resolution silently fell back to the `theta.binderModel` setting (the
// fallback the spec reserves for the ABSENT field, frontmatter-fields-a.md:40).
//
// THE SETTLED FRAME THIS FILE ENCODES (bug 0297 §Expected behaviour / §Fix,
// parent-adjudicated). A present-but-non-scalar `bind_context:` is
// present-but-bad, not absent, so it draws `theta/load/unknown-bind-context-value`
// and the theta is NOT registered. `<value>` renders as the bounded kind token
// per bug 0296's `mode:` precedent — a YAML sequence → `array`, a YAML mapping
// or alias → `object`, a null node → `null` — into the unchanged single-line
// template `unknown 'bind_context:' value '<value>'; expected 'none' or
// 'session'`. A present non-scalar `bind_model:` is routed through the EXISTING
// binder-model-unresolved machinery as an unresolvable declared string: a new
// marker `bindModelUnresolvable` is threaded onto the parsed frontmatter and
// into `BinderModelResolutionInput`, so a NON-bypass theta fails load with
// `theta/load/binder-model-unresolved`, while a bypass-eligible theta silently
// ignores it (registers) — the existing present-but-unresolvable disposition.
// The scalar controls (`bind_context: banana` → `'banana'`; bare
// `bind_context:` → `'null'`; `bind_context: session` → registers) are correct
// today and are pinned so the fix cannot regress them.
//
// REGISTRATION OBSERVABLE. `parseDoc` (tests/helpers/e2e-s1.ts) returns the
// shipped `ThetaDocument`; a theta REGISTERS iff `doc.frontmatter !== null`. A
// refused theta has `doc.frontmatter === null` and carries the error-severity
// row on `doc.diagnostics`. For the `bind_model:` cells the disposition is
// downstream of the parser (the production composition refuses a non-bypass
// theta whose binder model does not resolve), so those cells drive
// `resolveBinderModel` DIRECTLY over the input the composition builds — the
// `resolved`/`diagnostics` outcome is the observable there.
//
// WHAT IS RED HERE AND WHY. Cells A–D come back with NO `unknown-bind-context-value`
// row and a registered (non-null) frontmatter — the node-kind collapse — so
// their refusal assertion reds. Cell H builds the composition's
// `BinderModelResolutionInput` from a non-scalar `bind_model:` frontmatter:
// pre-fix `bindModelUnresolvable` is undefined and `bindModel` is undefined, so
// the settings fallback resolves and `resolved` is `true` against the asserted
// `false`. The green controls (E, F, G, I, J) and the DIAG-4 anchor pass now
// and are pinned so the fix cannot regress the scalar / bypass / genuinely-absent
// paths or the registered code's Message.
//
// TIER. Unit — the `bind_context:` face lives entirely in the offline parse
// front-end reached by `parseThetaDocument` via `parseDoc`, and the `bind_model:`
// face is witnessable by driving the pure `resolveBinderModel` resolver over the
// composition's own input shape; no session, model, or child spawn is needed.
// An integration/live tier would only add nondeterminism over a seam already
// fully observable here (the H9a cell in the companion file proves the same
// disposition end-to-end, which the offline witness cannot reach).
//
// Offline, provider-free, deterministic. A missing precondition (an unreadable
// registry page, a moved *Message* row) fails loudly rather than skipping
// (CLAUDE.md / AGENTS.md: no silent test skipping).

// --- Registry Message anchoring (DIAG-4) -----------------------------------

interface RegistryRow {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
  readonly phase: string;
}

const REGISTRY_LOAD_PATH = "docs/spec_topics/diagnostics/code-registry-load.md";

const REGISTRY_LOAD = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_LOAD_PATH}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];

const UNKNOWN_BIND_CONTEXT_VALUE = "theta/load/unknown-bind-context-value";

// The registered `unknown-bind-context-value` Message carries a `<value>`
// placeholder; the settled frame reuses this code UNCHANGED for the non-scalar
// case, so the registry row's template is byte-identical to this literal
// (DIAG-4 anchor).
const UNKNOWN_BIND_CONTEXT_VALUE_TEMPLATE =
  "unknown 'bind_context:' value '<value>'; expected 'none' or 'session'";

// The message the runtime renders for each fixture — the template with `<value>`
// substituted. The non-scalar bounded kind token (`array` / `object` / `null`)
// is the §Fix rendering (bug 0296's `mode:` precedent); the scalar controls
// carry their scalar bytes.
function unknownBindContextMessage(value: string): string {
  return `unknown 'bind_context:' value '${value}'; expected 'none' or 'session'`;
}

// --- Fixtures --------------------------------------------------------------

/** One theta file: `---` fences over `<frontmatter>`, body `let x = 1`. */
function doc(frontmatter: string): ThetaDocument {
  return parseDoc(`---\n${frontmatter}\n---\nlet x = 1\n`);
}

/** Assert a refusal row is present at error severity with the given Message. */
function expectRow(
  diags: readonly Diagnostic[],
  code: string,
  message: string,
): void {
  const row = findCode(diags, code);
  expect(
    row,
    `expected a ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeDefined();
  expect((row as Diagnostic).severity).toBe("error");
  expect((row as Diagnostic).message).toBe(message);
}

/** Assert NO row carries the given code (the recognised value must stay clean). */
function expectNoRow(diags: readonly Diagnostic[], code: string): void {
  expect(
    findCode(diags, code),
    `expected NO ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeUndefined();
}

// --- bind_model resolution harness -----------------------------------------
//
// Mirror the composition's `resolveBinderModel` call
// (src/extension/production-composition.ts:1111-1123): the input is built FROM
// the parsed frontmatter — `bindModel` when declared, and the fix's new
// `bindModelUnresolvable` marker when a present `bind_model:` did not resolve to
// a scalar reference. `bindModelUnresolvable` is a field the fix ADDS to
// `ParsedFrontmatter`; `npm test` (vitest) does not typecheck, and this cast
// keeps the file compiling against the pre-fix tree, where the read is
// `undefined`.
function frontmatterBindModelUnresolvable(fm: ParsedFrontmatter): boolean {
  return (fm as { bindModelUnresolvable?: boolean }).bindModelUnresolvable === true;
}

/** A settings binder-model the stub matcher resolves — the chain-step-2 fallback. */
const SETTINGS_BINDER_MODEL = "openai/gpt-x";

/**
 * Build the composition's `BinderModelResolutionInput` from a parsed
 * frontmatter, spreading `bindModel` / `bindModelUnresolvable` exactly as
 * production-composition.ts:1111-1123 does (the fix adds the
 * `bindModelUnresolvable` spread beside the `bindModel` one). The stub matcher
 * resolves only the settings fallback; the probe reports strict-capable so a
 * resolved reference admits with no diagnostic.
 */
function binderInput(
  fm: ParsedFrontmatter,
  bypassEligible: boolean,
): BinderModelResolutionInput {
  const unresolvable = frontmatterBindModelUnresolvable(fm);
  return {
    file: "test.theta",
    ...(fm.bindModel !== undefined ? { bindModel: fm.bindModel } : {}),
    ...(unresolvable ? { bindModelUnresolvable: true } : {}),
    settingsBinderModel: SETTINGS_BINDER_MODEL,
    bypassEligible,
    matcher: {
      resolve: (reference: unknown): "resolved" | "no-match" =>
        reference === SETTINGS_BINDER_MODEL ? "resolved" : "no-match",
    },
    probeStrictCapable: () => ({ strictCapable: true }),
  } as BinderModelResolutionInput;
}

/** Parse a non-null frontmatter or fail loudly (the parser must not refuse it). */
function frontmatterOf(d: ThetaDocument): ParsedFrontmatter {
  expect(
    d.frontmatter,
    `expected the bind_model theta to parse a non-null frontmatter; got codes ${JSON.stringify(
      codes(d.diagnostics),
    )}`,
  ).not.toBeNull();
  return d.frontmatter as ParsedFrontmatter;
}

// ===========================================================================

describe("bug 0297 — non-scalar bind_context: / bind_model: silently registers", () => {
  // Cell A — RED. A `bind_context:` over a flow SEQUENCE is a present value that
  // is neither `none` nor `session`, so it draws unknown-bind-context-value with
  // the `array` kind token and the theta is not registered. Today the node-kind
  // collapse records `undefined`, skips the unknown-value arm, and the theta
  // registers with the default `none`.
  it("bind_context: flow sequence → unknown-bind-context-value 'array', not registered", () => {
    const d = doc("mode: prompt\nbind_context: [session]");
    expectRow(
      d.diagnostics,
      UNKNOWN_BIND_CONTEXT_VALUE,
      unknownBindContextMessage("array"),
    );
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell B — RED. The block-sequence spelling (`bind_context:` over `  - session`)
  // is the one-keystroke slip from the documented list-form syntax; it is the
  // same node kind as cell A and draws the same `array` token.
  it("bind_context: block sequence → unknown-bind-context-value 'array', not registered", () => {
    const d = doc("mode: prompt\nbind_context:\n  - session");
    expectRow(
      d.diagnostics,
      UNKNOWN_BIND_CONTEXT_VALUE,
      unknownBindContextMessage("array"),
    );
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell C — RED. The second non-scalar node kind (a flow MAPPING) draws the
  // same present-but-bad code with the `object` kind token — the kind-renderer's
  // `object` branch.
  it("bind_context: flow mapping → unknown-bind-context-value 'object', not registered", () => {
    const d = doc("mode: prompt\nbind_context: {a: 1}");
    expectRow(
      d.diagnostics,
      UNKNOWN_BIND_CONTEXT_VALUE,
      unknownBindContextMessage("object"),
    );
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell D — RED. An ALIAS value (`bind_context: *a`) is the third named member
  // of the collapse class — a non-scalar node — so it draws present-but-bad with
  // the `object` fallback token (mirrors bug 0296 cell G). The `description:`
  // anchor exists only to carry the alias target; it is unrelated to the
  // disposition under test.
  it("bind_context: alias → unknown-bind-context-value 'object', not registered", () => {
    const d = doc("mode: prompt\ndescription: &a session\nbind_context: *a");
    expectRow(
      d.diagnostics,
      UNKNOWN_BIND_CONTEXT_VALUE,
      unknownBindContextMessage("object"),
    );
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell E — GREEN control (passes now; pinned). An unrecognised scalar keeps its
  // scalar bytes verbatim in `<value>` — the scalar path already enforced, which
  // the fix must not disturb.
  it("bind_context: banana → unknown-bind-context-value 'banana' (control)", () => {
    const d = doc("mode: prompt\nbind_context: banana");
    expectRow(
      d.diagnostics,
      UNKNOWN_BIND_CONTEXT_VALUE,
      unknownBindContextMessage("banana"),
    );
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell F — GREEN control (passes now; pinned). A bare `bind_context:` is a null
  // SCALAR — present-but-bad, already correct — and must keep
  // `unknown-bind-context-value 'null'` after the fix, not slide into the
  // non-scalar rendering.
  it("bind_context: bare null scalar → unknown-bind-context-value 'null' (control)", () => {
    const d = doc("mode: prompt\nbind_context:");
    expectRow(
      d.diagnostics,
      UNKNOWN_BIND_CONTEXT_VALUE,
      unknownBindContextMessage("null"),
    );
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell F2 — no value node (`? bind_context`). An explicit key with no value
  // node carries a JS-null value (NOT a Scalar(null), which is bare
  // `bind_context:`, control F) — the NON-scalar path, so it flows through
  // `renderNonScalarBindContextKind`'s null branch rather than the scalar
  // `String(item.value.value)` read. It is present-but-bad, not absent, and the
  // no-value-node member of the collapse class must render `'null'` via that
  // null branch (not fall through to `object`), staying on the same token as
  // bare `bind_context:` (control F). Mirrors bug 0296's `? mode` cell H.
  it("bind_context: no value node `? bind_context` → unknown-bind-context-value 'null', not registered", () => {
    const d = doc("mode: prompt\n? bind_context");
    expectRow(
      d.diagnostics,
      UNKNOWN_BIND_CONTEXT_VALUE,
      unknownBindContextMessage("null"),
    );
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell G — GREEN control (passes now; pinned). The recognised value
  // `bind_context: session` draws NO unknown-value row and the theta registers:
  // the fix narrows the collapse without disturbing the one recognised spelling.
  it("bind_context: session → no unknown row, registers (control)", () => {
    const d = doc("mode: prompt\nbind_context: session");
    expectNoRow(d.diagnostics, UNKNOWN_BIND_CONTEXT_VALUE);
    expect(
      d.frontmatter,
      "the recognised value registers (frontmatter non-null)",
    ).not.toBeNull();
  });

  // Cell H — RED. A non-scalar `bind_model:` on a NON-bypass theta (a
  // two-string `params:` block forces a real binder pass) is present-but-
  // unresolvable, so composition-driven resolution must fail with
  // binder-model-unresolved. Pre-fix the arm records `undefined` and no
  // `bindModelUnresolvable` marker, so the input carries neither `bindModel` nor
  // the marker and the `theta.binderModel` settings fallback resolves →
  // `resolved === true` (the silent absent-field fallback). Post-fix
  // `fm.bindModelUnresolvable` is `true`, threaded into the input, and
  // resolution refuses.
  it("bind_model: non-scalar on non-bypass theta → binder-model-unresolved", () => {
    const d = doc(
      "mode: prompt\nbind_model: [x]\nparams:\n  a: string\n  b: string",
    );
    const fm = frontmatterOf(d);
    const resolution = resolveBinderModel(binderInput(fm, false));
    expect(
      resolution.resolved,
      "a present non-scalar bind_model: is present-but-unresolvable, so a " +
        "non-bypass theta's binder model must NOT resolve via the settings " +
        "fallback (which is the ABSENT-field behaviour)",
    ).toBe(false);
    const row = findCode(resolution.diagnostics, BINDER_MODEL_UNRESOLVED_CODE);
    expect(
      row,
      `expected a ${BINDER_MODEL_UNRESOLVED_CODE} row; got codes ${JSON.stringify(
        codes(resolution.diagnostics),
      )}`,
    ).toBeDefined();
    expect((row as Diagnostic).message).toBe(BINDER_MODEL_UNRESOLVED_MESSAGE);
  });

  // Cell I — GREEN control (passes now; pinned). The same non-scalar
  // `bind_model: [x]` on a BYPASS-eligible theta (no `params:`) never calls the
  // binder, so resolution short-circuits to resolved with no diagnostic — the
  // existing present-but-unresolvable disposition on the bypass path. Byte-
  // identical pre/post fix (the bypass early-return precedes any marker read).
  it("bind_model: non-scalar on bypass theta → resolves, no diagnostic (control)", () => {
    const d = doc("mode: prompt\nbind_model: [x]");
    const fm = frontmatterOf(d);
    const resolution = resolveBinderModel(binderInput(fm, true));
    expect(
      resolution.resolved,
      "a bypass-eligible theta never calls the binder, so a non-scalar " +
        "bind_model: is silently ignored (registers)",
    ).toBe(true);
    expect(
      resolution.diagnostics,
      "the bypass path raises no binder-model diagnostic",
    ).toEqual([]);
  });

  // Cell J — GREEN control (passes now; pinned). A SCALAR `bind_model:` on a
  // non-bypass theta records the reference verbatim and resolves through the
  // matcher — the scalar resolution path the fix must not disturb.
  it("bind_model: scalar on non-bypass theta → recorded and resolves (control)", () => {
    const d = doc(
      "mode: prompt\nbind_model: openai/gpt-x\nparams:\n  a: string\n  b: string",
    );
    const fm = frontmatterOf(d);
    expect(
      fm.bindModel,
      "a scalar bind_model: is recorded verbatim on the frontmatter",
    ).toBe("openai/gpt-x");
    const resolution = resolveBinderModel(binderInput(fm, false));
    expect(
      resolution.resolved,
      "a scalar bind_model: resolving through the matcher admits the theta",
    ).toBe(true);
  });

  // DIAG-4 anchor. The fix reuses `theta/load/unknown-bind-context-value`
  // UNCHANGED, so its registry row on code-registry-load.md must carry the
  // normative Message template byte-for-byte, at severity E, phase load. A moved
  // or absent row reds by naming the registry page — it does not skip.
  it(`DIAG-4: code-registry-load.md carries ${UNKNOWN_BIND_CONTEXT_VALUE} with the normative Message, severity E, phase load`, () => {
    const message = registryMessage(REGISTRY_LOAD, UNKNOWN_BIND_CONTEXT_VALUE) as
      | string
      | undefined;
    expect(
      message,
      `DIAG-4 anchor: ${REGISTRY_LOAD_PATH} must carry the Message row for ${UNKNOWN_BIND_CONTEXT_VALUE}`,
    ).toBeDefined();
    expect(
      message,
      "DIAG-4 — the Message column is normative character-for-character; the fix " +
        "reuses this code unchanged, so its template stays the interpolated form",
    ).toBe(UNKNOWN_BIND_CONTEXT_VALUE_TEMPLATE);
    const row = REGISTRY_LOAD.find((r) => r.code === UNKNOWN_BIND_CONTEXT_VALUE);
    expect(
      row,
      `the parsed registry must hold a structured row for ${UNKNOWN_BIND_CONTEXT_VALUE}`,
    ).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      "severity E — a present-but-bad bind_context: denies registration",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase load — the check runs at the frontmatter read, where the value's " +
        "YAML node kind is still in hand",
    ).toBe("load");
  });
});
