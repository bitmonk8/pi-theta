import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { codes, findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0298 — a `system:` whose value is a YAML sequence or mapping is treated
// as absent: a subagent-mode theta registers with zero diagnostics and would
// spawn its child with NO system prompt, and on a `mode: prompt` theta the same
// shape suppresses `theta/parse/system-on-prompt-mode`
// (docs/bugs/0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.md).
//
// THE SEAM. The `system` arm narrows to scalars — `systemPresent = true` is
// recorded unconditionally but `systemValue` becomes `undefined` on a
// non-scalar value node (src/parser/frontmatter.ts:1171-1172). The whole
// `system:` checking block, which owns BOTH the subagent-mode template
// construction AND the prompt-mode refusal
// (`checkSystemInterpolation` at src/parser/system-interpolation.ts:199, emitting
// `theta/parse/system-on-prompt-mode`), sat behind the gate
// `if (systemPresent && systemValue !== undefined)` (pre-fix
// src/parser/frontmatter.ts:1467; the fix replaces it with the
// `systemPresent`-keyed gate at src/parser/frontmatter.ts:1477). A non-scalar
// `system:` failed the `systemValue !== undefined` half and exited the parser
// as if the key were never written: no shape refusal, no prompt-mode refusal,
// `systemPresent` (recorded precisely to distinguish presence) was dead on
// this path.
//
// THE SETTLED FRAME THIS FILE ENCODES (bug 0298 §Expected behaviour / §Fix,
// with the parent adjudication). The `system:` checking block keys on
// `systemPresent` (any present `system:` key, whatever value shape), not on
// `systemValue !== undefined`:
//   - `mode: prompt` + any present `system:` → `theta/parse/system-on-prompt-mode`
//     (E). The registered trigger at
//     docs/spec_topics/diagnostics/code-registry-parse.md:126 already reads
//     "`system:` frontmatter field declared on a `mode: prompt` theta"; a
//     block-sequence `system:` is declared, so no new code is needed.
//   - `mode: subagent` + present non-scalar `system:` → a shape refusal under a
//     new code `theta/load/malformed-system-field` (E, load), the bug 0104
//     `tools:`-row shape (frontmatter-fields-a.md:43: "'absent' and
//     'present-but-the-wrong-shape' do not collapse"). The system row itself
//     (frontmatter-fields-a.md:44) gives the no-system-prompt behaviour only to
//     the ABSENT field.
// A theta refused either way does NOT register: an error-severity diagnostic
// denies registration, so `doc.frontmatter` is `null`. Scalar `system:`
// behaviour stays byte-identical.
//
// REGISTRATION OBSERVABLE. `parseDoc` (tests/helpers/e2e-s1.ts) returns the
// shipped `ThetaDocument`; a theta REGISTERS iff `doc.frontmatter !== null`
// (src/parser/theta-document.ts:874-875). A refused theta has
// `doc.frontmatter === null` and carries the error-severity row on
// `doc.diagnostics`.
//
// WHAT IS RED HERE AND WHY. At the current tree cells 1-3 fail for the
// witnessed defect: cells 1-2 come back with `codes(...) === []` and
// `doc.frontmatter !== null` (the malformed field is silently dropped and the
// theta registers), and cell 3 likewise registers with no
// `system-on-prompt-mode` row. The green controls (cells 4-6) pass now and are
// pinned so the fix cannot regress the scalar / block-scalar path.
//
// TIER. Unit — the defect lives entirely in the offline parse front-end reached
// by `parseThetaDocument` via `parseDoc`; no session, model, or child spawn is
// needed to witness either half. An integration/live tier would only add
// nondeterminism over a seam already fully observable here.
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

const REGISTRY_PARSE_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY_PARSE = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_PARSE_PATH}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];

const REGISTRY_LOAD_PATH = "docs/spec_topics/diagnostics/code-registry-load.md";

const REGISTRY_LOAD = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_LOAD_PATH}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];

const SYSTEM_ON_PROMPT_MODE = "theta/parse/system-on-prompt-mode";

// The new load-side code the §Fix mints. Its registry row (code-registry-load.md)
// and mirror land in THIS commit alongside the parser change, so the DIAG-4
// anchor cell below sources the Message from the load registry and byte-compares
// it against this literal; the settled frame fixes the Message verbatim
// (single-line) and the registry row is byte-identical to it.
const MALFORMED_SYSTEM_FIELD = "theta/load/malformed-system-field";
const MALFORMED_SYSTEM_FIELD_MESSAGE =
  "malformed 'system:' field; expected a scalar system prompt";

/**
 * The registry row's normative *Message* for a code already in the registry
 * (DIAG-4). Definedness is asserted first, so a moved *Message* row reds by
 * naming the registry page rather than by a bare comparison downstream. No
 * message prose for an already-registered code is written out in this file.
 */
function registryMsg(code: string): string {
  const template = registryMessage(REGISTRY_PARSE, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PARSE_PATH} must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}

// --- Fixtures --------------------------------------------------------------

/** One theta file: `---` fences over `<frontmatter>`, body `let x = 1`. */
function doc(frontmatter: string): ThetaDocument {
  return parseDoc(`---\n${frontmatter}\n---\nlet x = 1\n`);
}

/** A `system:` over a block SEQUENCE — the ordinary YAML reflex for multi-line text. */
const SYSTEM_BLOCK_SEQUENCE = "system:\n  - You are a reviewer";
/** A `system:` over a block MAPPING — the second non-scalar node kind. */
const SYSTEM_BLOCK_MAPPING = "system:\n  text: You are a reviewer";

/** Assert the refusal row is present at error severity with the settled Message. */
function expectRow(diags: readonly Diagnostic[], code: string, message: string): void {
  const row = findCode(diags, code);
  expect(row, `expected a ${code} row; got codes ${JSON.stringify(codes(diags))}`).toBeDefined();
  expect((row as Diagnostic).severity).toBe("error");
  expect((row as Diagnostic).message).toBe(message);
}

// ===========================================================================

describe("bug 0298 — non-scalar system: refusal + prompt-mode suppression", () => {
  // Cell 1 — RED. A subagent-mode `system:` over a block sequence must draw the
  // shape refusal and NOT register; today it is silently dropped and the theta
  // registers with an absent `system` slot.
  it("subagent + system: block sequence → malformed-system-field, not registered", () => {
    const d = doc(`mode: subagent\n${SYSTEM_BLOCK_SEQUENCE}`);
    expectRow(d.diagnostics, MALFORMED_SYSTEM_FIELD, MALFORMED_SYSTEM_FIELD_MESSAGE);
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell 2 — RED. The second non-scalar node kind (block mapping) draws the same
  // refusal; the rule is keyed on presence-and-shape, not on one YAML style.
  it("subagent + system: block mapping → malformed-system-field, not registered", () => {
    const d = doc(`mode: subagent\n${SYSTEM_BLOCK_MAPPING}`);
    expectRow(d.diagnostics, MALFORMED_SYSTEM_FIELD, MALFORMED_SYSTEM_FIELD_MESSAGE);
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell 3 — RED. On a `mode: prompt` theta the same block-sequence `system:` is
  // DECLARED, so the registered trigger fires; today the node kind alone flips a
  // registered E-refusal into a clean load.
  it("prompt + system: block sequence → system-on-prompt-mode, not registered", () => {
    const d = doc(`mode: prompt\n${SYSTEM_BLOCK_SEQUENCE}`);
    expectRow(d.diagnostics, SYSTEM_ON_PROMPT_MODE, registryMsg(SYSTEM_ON_PROMPT_MODE));
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell 4 — GREEN control (passes now; pinned). A scalar `system:` on a
  // prompt-mode theta is the byte-identical baseline the fix must not disturb.
  it("prompt + scalar system: → system-on-prompt-mode, not registered (control)", () => {
    const d = doc(`mode: prompt\nsystem: hello`);
    expectRow(d.diagnostics, SYSTEM_ON_PROMPT_MODE, registryMsg(SYSTEM_ON_PROMPT_MODE));
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });

  // Cell 5 — GREEN control (passes now; pinned). A scalar subagent `system:`
  // registers, and its template's single text part carries the scalar bytes
  // verbatim — the scalar-behaviour-byte-identical constraint of §Fix.
  it("subagent + scalar system: → registers with a single-text-part template (control)", () => {
    const d = doc(`mode: subagent\nsystem: hello`);
    expect(codes(d.diagnostics), "the scalar path draws no diagnostics").toEqual([]);
    expect(d.frontmatter, "a valid scalar system: registers").not.toBeNull();
    const template = (d.frontmatter as NonNullable<ThetaDocument["frontmatter"]>).system;
    expect(template, "a valid scalar system: yields a template").toBeDefined();
    expect(template?.parts).toHaveLength(1);
    const part = template?.parts[0];
    expect(part?.kind).toBe("text");
    expect(part?.kind === "text" ? part.value : undefined).toBe("hello");
  });

  // Cell 6 — GREEN control (passes now; pinned). A `system: |` block SCALAR over
  // two lines is a scalar node, distinct from the block SEQUENCE refusal of
  // cells 1-3; it registers with a template, proving the block-scalar path is
  // untouched by the refusal.
  it("subagent + block-scalar system: → registers with a template (control)", () => {
    const d = doc(`mode: subagent\nsystem: |\n  line one\n  line two`);
    expect(codes(d.diagnostics), "the block-scalar path draws no diagnostics").toEqual([]);
    expect(d.frontmatter, "a block-scalar system: registers").not.toBeNull();
    const template = (d.frontmatter as NonNullable<ThetaDocument["frontmatter"]>).system;
    expect(template, "a block-scalar system: yields a template").toBeDefined();
    expect(template?.parts).toHaveLength(1);
    expect(template?.parts[0]?.kind).toBe("text");
  });

  // Cell 7 — the DIAG-4 registry anchor (the bug 0104 (D1) shape). The refusal is
  // a registered code: its Message is sourced from the load registry and
  // byte-compared against the pinned literal, and the row carries severity E /
  // phase load. A moved or absent row reds by naming the registry page.
  it(`DIAG-4: code-registry-load.md carries ${MALFORMED_SYSTEM_FIELD} with the normative Message, severity E, phase load`, () => {
    const message = registryMessage(REGISTRY_LOAD, MALFORMED_SYSTEM_FIELD) as
      | string
      | undefined;
    expect(
      message,
      `DIAG-4 anchor: ${REGISTRY_LOAD_PATH} must carry the Message row for ${MALFORMED_SYSTEM_FIELD}`,
    ).toBeDefined();
    expect(
      message,
      "DIAG-4 — the Message column is normative character-for-character; the " +
        "refusal names the field's shape, so it carries no placeholder",
    ).toBe(MALFORMED_SYSTEM_FIELD_MESSAGE);
    const row = REGISTRY_LOAD.find((r) => r.code === MALFORMED_SYSTEM_FIELD);
    expect(
      row,
      `the parsed registry must hold a structured row for ${MALFORMED_SYSTEM_FIELD}`,
    ).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      "severity E — registration is gated on error severity, and a refused theta " +
        "does not register",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase load — the check runs at the frontmatter read, where the field's YAML " +
        "node is still in hand",
    ).toBe("load");
  });

  // Cell 8 — the round-2 residual R1 witness. Round-1 F2 widened the registry
  // row's range promise to cover a `system:` key with NO value node at all (an
  // explicit-key `? system` form), not only the non-scalar-value shapes cells
  // 1-2 pin. That promise — the diagnostic still carries a `range`, falling
  // back to the KEY node when there is no value node to point at — was
  // otherwise ungated: nothing in this file exercised the no-value-node case.
  // The range on this path arrives from the field loop's own key fallback
  // (`rangeOf(item.value ?? item.key, …)`, src/parser/frontmatter.ts:1063),
  // which already substitutes the key node before the `system` arm ever runs;
  // the arm's own `valueRange ?? keyRange` (src/parser/frontmatter.ts:1173) is
  // the convention-matching second net shared with the sibling `tools:` /
  // `params:` arms and the bug 0104 shape, not the line this cell depends on.
  // This cell reds if the no-value-node path ever drops its range or starts
  // registering — not specifically on removing the `system` arm's own
  // `?? keyRange`.
  it("subagent + explicit-key `? system` (no value node) → malformed-system-field with a defined range, not registered", () => {
    const d = parseDoc("---\nmode: subagent\n? system\n---\nlet x = 1\n");
    const row = findCode(d.diagnostics, MALFORMED_SYSTEM_FIELD);
    expect(
      row,
      `expected a ${MALFORMED_SYSTEM_FIELD} row; got codes ${JSON.stringify(codes(d.diagnostics))}`,
    ).toBeDefined();
    expect((row as Diagnostic).severity).toBe("error");
    expect(
      (row as Diagnostic).range,
      "no value node exists to point at, so the range must fall back to the key node",
    ).toBeDefined();
    expect(d.frontmatter, "a refused theta does not register").toBeNull();
  });
});
