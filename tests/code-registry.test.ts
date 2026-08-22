import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage, reconcileClosedSet, reconcileStableIds } from "../tools/code-registry/index.js";

// V7b-T — failing tests for the paired V7b implementation: the machine-checkable
// diagnostic registry (namespace/severity/phase/trigger/message for every code
// across the parse/load/runtime/host families) and the closed-set + stable-id
// enforcement the H5a gate consumes.
//
// These pin three obligations from the diagnostics Code-registry-rules page:
//   * DIAG-2 (diagnostics/diagnostic-shape.md#diag-2): the registry is CLOSED —
//     a code asserted by a test with no registry row fails the gate, and a
//     registry code with no asserting test fails the gate.
//   * DIAG-3 (diagnostics/diagnostic-shape.md#diag-3): codes are STABLE
//     identifiers — a renamed code fails the gate (renames deferred to 2.0).
//   * DIAG-4 (diagnostics/diagnostic-shape.md#diag-4): the Message column is
//     NORMATIVE — every asserting test sources its expected string from the
//     registry, not prose.
//
// Per the *Diagnostic message anchors* rule, every asserted message string below
// is sourced from the registry's *Message* column (via registryMessage), and
// every diagnostic code is cited inline.

interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

interface Finding {
  kind: string;
  subject: string;
  detail: string;
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input the H5a gate reconciles against.
const REGISTRY_PAGES = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
].map((page) =>
  readFileSync(
    fileURLToPath(
      new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
    ),
    "utf8",
  ),
);
const REGISTRY_TEXT = REGISTRY_PAGES.join("\n");

describe("V7b-T — machine-checkable diagnostic registry (closed-set, DIAG-2)", () => {
  // DIAG-2 — the machine-checkable registry is the closed authority: parseRegistry
  // produces one structured row per code across all four families, carrying its
  // namespace / severity / phase / trigger / message.
  it("DIAG-2: parseRegistry yields a structured row per code spanning the parse/load/runtime/host families", () => {
    const registry = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

    const row = registry.find(
      (r) => r.code === "theta/parse/unterminated-string",
    );
    expect(row).toBeDefined();
    expect(row?.namespace).toBe("parse");
    expect(row?.severity).toBe("E");
    // Bug 0239 (DIAG-2): this row now also fires from the `params:` default
    // read (a position with no lexer of its own), so *Phase* gained `parse`
    // beside `lex` in the same commit as that Trigger widening.
    expect(row?.phase).toBe("lex, parse");
    // The Message column is the normative string (DIAG-4 owns it; here we pin
    // that parseRegistry carries it).
    expect(row?.message).toBe("unterminated string literal");

    // Every one of the four sharded families contributes at least one code.
    const namespaces = new Set(registry.map((r) => r.namespace));
    expect(namespaces.has("parse")).toBe(true);
    expect(namespaces.has("load")).toBe(true);
    expect(namespaces.has("runtime")).toBe(true);
    expect(namespaces.has("host")).toBe(true);
  });

  // DIAG-2 — the registry is closed in BOTH directions: an asserted code with no
  // registry row fails, and a registry code with no asserting test fails.
  it("DIAG-2: the registry is closed — an asserted code with no row and a registry code with no asserting test both fail", () => {
    const registry: RegistryRow[] = [
      {
        code: "theta/parse/unterminated-string",
        namespace: "parse",
        severity: "E",
        phase: "lex",
        trigger: "EOF while scanning a string literal.",
        message: "unterminated string literal",
      },
      {
        code: "theta/runtime/match-error",
        namespace: "runtime",
        severity: "E",
        phase: "runtime",
        trigger: "A match whose arms fail to cover the scrutinee.",
        message: "MatchError: no arm matched <scrutinee summary>",
      },
    ];

    // `theta/parse/unterminated-string` is asserted (present in the registry);
    // `theta/runtime/ghost` is asserted but absent from the registry; and
    // `theta/runtime/match-error` is a registry code that no test asserts.
    const findings = reconcileClosedSet({
      registry,
      assertedCodes: ["theta/parse/unterminated-string", "theta/runtime/ghost"],
    }) as Finding[];

    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain("asserted-code-not-in-registry");
    expect(
      findings.find((f) => f.kind === "asserted-code-not-in-registry")?.subject,
    ).toBe("theta/runtime/ghost");

    expect(kinds).toContain("registry-code-no-asserting-test");
    expect(
      findings.find((f) => f.kind === "registry-code-no-asserting-test")
        ?.subject,
    ).toBe("theta/runtime/match-error");
  });
});

describe("V7b-T — codes are stable identifiers (DIAG-3)", () => {
  // DIAG-3 — a renamed code fails the gate. A rename is mechanically a baseline
  // (pinned, stable) code that is absent from the current registry; renames are
  // deferred to theta 2.0 migration.
  it("DIAG-3: a renamed code fails the gate — the baseline code absent from the current registry is reported", () => {
    const baselineCodes = [
      "theta/parse/old-name",
      "theta/parse/binding-case-mismatch",
    ];
    // `theta/parse/old-name` has been renamed to `theta/parse/new-name`.
    const currentCodes = [
      "theta/parse/new-name",
      "theta/parse/binding-case-mismatch",
    ];

    const findings = reconcileStableIds({
      currentCodes,
      baselineCodes,
    }) as Finding[];

    expect(findings.map((f) => f.kind)).toContain("code-renamed");
    expect(findings.find((f) => f.kind === "code-renamed")?.subject).toBe(
      "theta/parse/old-name",
    );
  });

  // DIAG-3 — a stable (unchanged) registry produces no rename finding.
  it("DIAG-3: an unchanged code set produces no rename finding", () => {
    const codes = ["theta/parse/binding-case-mismatch", "theta/runtime/match-error"];
    const findings = reconcileStableIds({
      currentCodes: codes,
      baselineCodes: codes,
    }) as Finding[];
    expect(findings.filter((f) => f.kind === "code-renamed")).toEqual([]);
  });
});

describe("V7b-T — the Message column is normative (DIAG-4)", () => {
  // DIAG-4 — every asserting test sources its expected string from the registry's
  // Message column, not from prose. registryMessage IS that single source of
  // truth; a test asserting a diagnostic's rendered message reads it from here.
  it("DIAG-4: registryMessage returns the registry's normative Message string, and an asserting test sources its expected message from it", () => {
    const registry = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

    // theta/parse/binding-case-mismatch — Message column (placeholder-free).
    expect(
      registryMessage(registry, "theta/parse/binding-case-mismatch"),
    ).toBe("binding name must start with a lowercase letter or _");

    // The normative discipline: an asserting test's expected message string is
    // the registry's, sourced via registryMessage rather than copy-pasted prose.
    const emitted = {
      code: "theta/parse/binding-case-mismatch",
      message: "binding name must start with a lowercase letter or _",
    };
    expect(emitted.message).toBe(registryMessage(registry, emitted.code));

    // A code absent from the registry has no normative message.
    expect(registryMessage(registry, "theta/runtime/ghost")).toBeUndefined();
  });
});
