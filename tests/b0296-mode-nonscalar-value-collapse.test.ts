import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { codes, findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0296 — a `mode:` whose value is a YAML sequence or mapping draws
// `theta/load/missing-mode` ("frontmatter is missing required field 'mode:'")
// on a file whose `mode:` line is present
// (docs/bugs/0296-mode-nonscalar-value-collapses-to-missing-mode.md).
//
// THE SEAM — the node-kind seam at the `mode` arm. The field loop recovers the
// value only for scalar nodes:
// `modeValue = isScalar(item.value) ? String(item.value.value) : undefined`
// (src/parser/frontmatter.ts:1070-1072). A sequence, mapping, or alias value
// leaves `modeValue` undefined, byte-identically to an absent key. The two
// downstream arms key exclusively on `modeValue`: the required-`mode:` arm
// `if (modeValue === undefined && !yamlErrored)` fires `missing-mode`
// (src/parser/frontmatter.ts:1224-1231), and the `unknown-mode-value` arm gated
// on `modeValue !== undefined` (src/parser/frontmatter.ts:1313-1325) is never
// reached. No arm reads the node kind, so a present non-scalar `mode:` is
// indistinguishable from an absent key by the time either arm runs — the same
// "treated as absent" collapse bug 0104 closed at the sibling `tools:` field.
//
// THE SETTLED FRAME THIS FILE ENCODES (bug 0296 §Expected behaviour / §Fix
// route 1, parent-adjudicated). A present-but-non-scalar `mode:` is
// present-but-bad, not missing, so it draws `theta/load/unknown-mode-value` and
// NOT `theta/load/missing-mode`. The registered code is reused unchanged; the
// non-scalar `<value>` renders as the bounded JSON kind token per the
// `settings-value-out-of-range` precedent — a YAML sequence → `array`, a YAML
// mapping → `object` — into the unchanged single-line template
// `unknown 'mode:' value '<value>'; expected 'prompt' or 'subagent'`. The
// missing-mode arm stays true to its registry *Trigger* ("Frontmatter omits the
// required `mode:` field") and fires only when the key is genuinely absent. The
// scalar controls (bare null-scalar `mode:` → `'null'`; `mode: PROMPT` →
// `'PROMPT'`) are correct today and are pinned so the fix cannot regress them.
// Registration is refused either way: an error-severity diagnostic denies
// registration, so `doc.frontmatter` is `null`.
//
// REGISTRATION OBSERVABLE. `parseDoc` (tests/helpers/e2e-s1.ts) returns the
// shipped `ThetaDocument`; a theta REGISTERS iff `doc.frontmatter !== null`. A
// refused theta has `doc.frontmatter === null` and carries the error-severity
// row on `doc.diagnostics`.
//
// WHAT IS RED HERE AND WHY. At the current tree cells A, B, and C come back with
// a `theta/load/missing-mode` row instead of `theta/load/unknown-mode-value` —
// the node-kind collapse — so their unknown-mode-value assertion reds against an
// observed missing-mode. The green controls (D, E, F) and the DIAG-4 anchor pass
// now and are pinned so the fix cannot regress the scalar / genuinely-absent
// paths or the registered code's Message.
//
// TIER. Unit — the defect lives entirely in the offline parse front-end reached
// by `parseThetaDocument` via `parseDoc`; no session, model, or child spawn is
// needed to witness it. An integration/live tier would only add nondeterminism
// over a seam already fully observable here.
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

const UNKNOWN_MODE_VALUE = "theta/load/unknown-mode-value";
const MISSING_MODE = "theta/load/missing-mode";

// The registered `unknown-mode-value` Message carries a `<value>` placeholder;
// the settled frame reuses this code UNCHANGED for the non-scalar case, so the
// registry row's template is byte-identical to this literal (DIAG-4 anchor).
const UNKNOWN_MODE_VALUE_TEMPLATE =
  "unknown 'mode:' value '<value>'; expected 'prompt' or 'subagent'";

// The message the runtime renders for each fixture — the template with `<value>`
// substituted. The non-scalar bounded JSON kind token (`array` / `object`) is
// the §Fix route-1 rendering; the scalar controls carry their scalar bytes.
function unknownModeMessage(value: string): string {
  return `unknown 'mode:' value '${value}'; expected 'prompt' or 'subagent'`;
}

const MISSING_MODE_MESSAGE = "frontmatter is missing required field 'mode:'";

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

/** Assert NO row carries the given code (the collapse must not survive). */
function expectNoRow(diags: readonly Diagnostic[], code: string): void {
  expect(
    findCode(diags, code),
    `expected NO ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeUndefined();
}

// ===========================================================================

describe("bug 0296 — non-scalar mode: value collapses to missing-mode", () => {
  // Cell A — RED. A `mode:` over a flow SEQUENCE is present authoring intent, so
  // it draws present-but-bad, not missing. Today the node-kind collapse fires
  // `missing-mode` on a file whose `mode:` line is present.
  it("mode: flow sequence → unknown-mode-value 'array', not missing-mode", () => {
    const d = doc("mode: [prompt]");
    expectRow(d.diagnostics, UNKNOWN_MODE_VALUE, unknownModeMessage("array"));
    expectNoRow(d.diagnostics, MISSING_MODE);
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell B — RED. The block-sequence spelling (`mode:` over `  - prompt`) is the
  // one-keystroke slip from the documented list-form `tools:` syntax; it is the
  // same node kind as cell A and draws the same `array` token.
  it("mode: block sequence → unknown-mode-value 'array', not missing-mode", () => {
    const d = doc("mode:\n  - prompt");
    expectRow(d.diagnostics, UNKNOWN_MODE_VALUE, unknownModeMessage("array"));
    expectNoRow(d.diagnostics, MISSING_MODE);
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell C — RED. The second non-scalar node kind (a flow MAPPING) draws the
  // same present-but-bad code with the `object` kind token.
  it("mode: flow mapping → unknown-mode-value 'object', not missing-mode", () => {
    const d = doc("mode: {a: 1}");
    expectRow(d.diagnostics, UNKNOWN_MODE_VALUE, unknownModeMessage("object"));
    expectNoRow(d.diagnostics, MISSING_MODE);
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell D — GREEN control (passes now; pinned). A bare `mode:` is a null SCALAR
  // — present-but-bad, already correct — and must keep `unknown-mode-value 'null'`
  // after the fix, not slide into the non-scalar rendering.
  it("mode: bare null scalar → unknown-mode-value 'null' (control)", () => {
    const d = doc("mode:");
    expectRow(d.diagnostics, UNKNOWN_MODE_VALUE, unknownModeMessage("null"));
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell E — GREEN control (passes now; pinned). An unrecognised scalar keeps its
  // scalar bytes verbatim in `<value>` — the scalar path the fix must not disturb.
  it("mode: PROMPT → unknown-mode-value 'PROMPT' (control)", () => {
    const d = doc("mode: PROMPT");
    expectRow(d.diagnostics, UNKNOWN_MODE_VALUE, unknownModeMessage("PROMPT"));
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell F — GREEN control (passes now; pinned). A frontmatter that GENUINELY
  // omits `mode:` keeps `missing-mode`, and draws NO unknown-mode-value: the fix
  // narrows the collapse without widening `missing-mode`'s true trigger.
  it("mode genuinely absent → missing-mode, no unknown-mode-value (control)", () => {
    const d = doc("description: x");
    expectRow(d.diagnostics, MISSING_MODE, MISSING_MODE_MESSAGE);
    expectNoRow(d.diagnostics, UNKNOWN_MODE_VALUE);
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell G — alias. An ALIAS value (`mode: *anchor`) is the third named member of
  // the collapse class (§Affected names "a sequence, mapping, or alias value") — a
  // non-scalar node, so it draws present-but-bad with the bounded fallback token
  // `object`. WHY this cell: it gives the mode-arm else-branch invariant (that
  // `modeValueKind` is set whenever the value is non-scalar) a red path — without
  // it, narrowing that else-branch would leave `modeValueKind === undefined` and
  // render `'undefined'` with every other cell still green.
  it("mode: alias → unknown-mode-value 'object', not missing-mode", () => {
    const d = doc("description: &anchor prompt\nmode: *anchor");
    expectRow(d.diagnostics, UNKNOWN_MODE_VALUE, unknownModeMessage("object"));
    expectNoRow(d.diagnostics, MISSING_MODE);
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell H — no value node (`? mode`). An explicit key with no value node carries
  // a JS-null value (NOT a Scalar(null), which is bare `mode:`). It is
  // present-but-bad, not absent, and renders `'null'` like the bare-`mode:`
  // control. WHY this cell: the two null spellings must not diverge — both are
  // present-but-bad null, so both name `'null'`, per the settings precedent.
  it("mode: no value node `? mode` → unknown-mode-value 'null', not missing-mode", () => {
    const d = doc("? mode");
    expectRow(d.diagnostics, UNKNOWN_MODE_VALUE, unknownModeMessage("null"));
    expectNoRow(d.diagnostics, MISSING_MODE);
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // DIAG-4 anchor. Route 1 reuses `theta/load/unknown-mode-value` UNCHANGED, so
  // its registry row on code-registry-load.md must carry the normative Message
  // template byte-for-byte, at severity E, phase load. A moved or absent row
  // reds by naming the registry page — it does not skip.
  it(`DIAG-4: code-registry-load.md carries ${UNKNOWN_MODE_VALUE} with the normative Message, severity E, phase load`, () => {
    const message = registryMessage(REGISTRY_LOAD, UNKNOWN_MODE_VALUE) as
      | string
      | undefined;
    expect(
      message,
      `DIAG-4 anchor: ${REGISTRY_LOAD_PATH} must carry the Message row for ${UNKNOWN_MODE_VALUE}`,
    ).toBeDefined();
    expect(
      message,
      "DIAG-4 — the Message column is normative character-for-character; route 1 " +
        "reuses this code unchanged, so its template stays the interpolated form",
    ).toBe(UNKNOWN_MODE_VALUE_TEMPLATE);
    const row = REGISTRY_LOAD.find((r) => r.code === UNKNOWN_MODE_VALUE);
    expect(
      row,
      `the parsed registry must hold a structured row for ${UNKNOWN_MODE_VALUE}`,
    ).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      "severity E — a present-but-bad mode: denies registration",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase load — the check runs at the frontmatter read, where the value's " +
        "YAML node kind is still in hand",
    ).toBe("load");
  });
});
