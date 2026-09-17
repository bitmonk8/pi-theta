import { REGISTRY } from "./helpers/registry-oracle";
import { describe, expect, it } from "vitest";
import {
  renderType,
  renderRuntimeValue,
  renderConstruct,
  renderInteger,
  renderSourceDerived,
  renderUnderlyingError,
  renderCategory7,
  renderHostIncompatible,
} from "../src/diagnostics/placeholder.js";
// @ts-expect-error — JS code-registry module, no type declarations.
import { registryMessage } from "../tools/code-registry/index.js";

// V7c-T — failing tests for the paired V7c implementation: the eight
// placeholder-rendering categories the registry's *Message* column interpolates
// at the diagnostic site (diagnostics/placeholder-rendering-a.md and …-b.md).
//
// Every assertion below is anchored on DIAG-4 (the *Message* column is the
// normative source of truth): the eight categories' rendering rules carry
// normative test vectors, and conformance tests asserting on a rendered message
// MUST match those vectors byte-identically. The category-8 host-derived row is
// asserted via the §8 anchored prefix/suffix partial-match pattern — never a
// full-*Message*-string equality, which §8 declares non-conformant for
// category-8 rows. The category-8 *Message* template is sourced from the
// registry (`registryMessage`) per the *Diagnostic message anchors* rule.

describe("V7c-T — placeholder rendering, eight categories (DIAG-4)", () => {
  // DIAG-4 — category 1 (static-type placeholders): a Theta static type
  // re-serialises in source-grammar form. Normative vectors: an array of a
  // union renders `array<integer | string>`; a named-or-null union renders
  // `Foo | null`.
  it("DIAG-4: category 1 — static type re-serialises byte-identically", () => {
    expect(
      renderType({
        kind: "array",
        element: {
          kind: "union",
          members: [
            { kind: "primitive", name: "integer" },
            { kind: "primitive", name: "string" },
          ],
        },
      }),
    ).toBe("array<integer | string>");

    expect(
      renderType({
        kind: "union",
        members: [
          { kind: "named", name: "Foo" },
          { kind: "primitive", name: "null" },
        ],
      }),
    ).toBe("Foo | null");
  });

  // DIAG-4 — category 2 (runtime-value placeholders): canonical stringification.
  // A schema-typed object renders as compact `JSON.stringify` (the schema name
  // does not surface); the integer 42 renders `42`.
  it("DIAG-4: category 2 — runtime value stringifies byte-identically", () => {
    expect(
      renderRuntimeValue({ kind: "schema-object", value: { name: "fluffy" } }),
    ).toBe('{"name":"fluffy"}');

    expect(renderRuntimeValue({ kind: "integer", value: 42 })).toBe("42");
  });

  // DIAG-4 — category 3 (syntactic-construct placeholder): `<construct>` uses
  // the closed token-name table (arrow function → `arrow function`); `<expr>`
  // renders the offending source span verbatim (`a + b` → `a + b`).
  it("DIAG-4: category 3 — construct + verbatim span render byte-identically", () => {
    expect(renderConstruct({ kind: "construct", token: "arrow function" })).toBe(
      "arrow function",
    );
    expect(renderConstruct({ kind: "expr", sourceSpan: "a + b" })).toBe("a + b");
  });

  // DIAG-4 — category 4 (numeric placeholders): shortest decimal, leading `-`
  // for negatives, `0` for signed-zero. `-1` → `-1`, `33` → `33`, `-0` → `0`.
  it("DIAG-4: category 4 — integer renders byte-identically", () => {
    expect(renderInteger(-1)).toBe("-1");
    expect(renderInteger(33)).toBe("33");
    expect(renderInteger(-0)).toBe("0");
  });

  // DIAG-4 — category 5 (source-derived placeholders): identifier bare
  // (`wibble`); descriptor as `<kind>:"<value>"` (`settings:"~/work/theta"`);
  // `<key>` quoted only when not identifier-shaped (`my-key` → `"my-key"`,
  // `kind` → `kind`).
  it("DIAG-4: category 5 — source-derived placeholders render byte-identically", () => {
    expect(renderSourceDerived({ kind: "identifier", text: "wibble" })).toBe(
      "wibble",
    );
    expect(
      renderSourceDerived({
        kind: "descriptor",
        descriptorKind: "settings",
        value: "~/work/theta",
      }),
    ).toBe('settings:"~/work/theta"');
    expect(renderSourceDerived({ kind: "key", text: "my-key" })).toBe('"my-key"');
    expect(renderSourceDerived({ kind: "key", text: "kind" })).toBe("kind");
  });

  // DIAG-4 — category 6 (underlying-error placeholders): first-line truncation
  // after coercion. `connection closed\nstack ...` → `connection closed`; a
  // message-less Error → `<no message>`.
  it("DIAG-4: category 6 — underlying error first-line renders byte-identically", () => {
    expect(
      renderUnderlyingError(new Error("connection closed\nstack trace ...\n")),
    ).toBe("connection closed");
    expect(renderUnderlyingError(new Error())).toBe("<no message>");
  });

  // DIAG-4 — category 7 (identifier-/descriptor-/closed-enum placeholders):
  // closed-enum verbatim (`<reason>` → `quit`); `<uuid>` canonical lowercase;
  // `<step>` via the integer rule.
  it("DIAG-4: category 7 — closed-enum / uuid / numeric render byte-identically", () => {
    expect(renderCategory7({ kind: "closed-enum", value: "quit" })).toBe("quit");
    expect(
      renderCategory7({
        kind: "uuid",
        value: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      }),
    ).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(renderCategory7({ kind: "numeric", value: 1 })).toBe("1");
  });
});

describe("V7c-T — category 2 string-truncation boundary (DIAG-4)", () => {
  // DIAG-4 — the category-2 80→81 code-point boundary. An 80-code-point string
  // is observed in full (no truncation); an 81-code-point string is truncated
  // to its first 77 code points followed by the literal `...`.
  it("DIAG-4: an 80-code-point string is rendered in full", () => {
    const s80 = "a".repeat(80);
    expect(renderRuntimeValue({ kind: "string", value: s80 })).toBe(s80);
  });

  it("DIAG-4: an 81-code-point string truncates to 77 chars + literal ellipsis", () => {
    const s81 = "a".repeat(81);
    expect(renderRuntimeValue({ kind: "string", value: s81 })).toBe(
      "a".repeat(77) + "...",
    );
    // The truncated form is exactly 80 characters: 77 prefix + the 3-char "...".
    expect(
      renderRuntimeValue({ kind: "string", value: s81 }).length,
    ).toBe(80);
  });
});

describe("V7c-T — category 8 host-derived freeform tail (DIAG-4, §8 anchored match)", () => {
  // DIAG-4 / §8 — `theta/load/host-incompatible` (`node-floor`). With the host
  // version mocked to `v18.19.0`, the implementation-defined `<observed>`
  // segment is interpolated between a byte-identical prefix and a byte-identical
  // suffix sourced from the registry *Message* template. The test asserts via
  // the §8 anchored partial-match pattern, NEVER a full-*Message* equality
  // (non-conformant for category-8 rows).
  it("DIAG-4: host-incompatible node-floor renders the anchored §8 prefix/suffix surround", () => {
    const registry = REGISTRY;
    // The byte-identical surround is sourced from the registry template
    // `host incompatible (<kind>): observed <observed>, required <required>`.
    const template = registryMessage(registry, "theta/load/host-incompatible") as string;
    expect(template).toBe(
      "host incompatible (<kind>): observed <observed>, required <required>",
    );

    const rendered = renderHostIncompatible({
      kind: "node-floor",
      observed: "v18.19.0", // host version mocked in, never read from process
      required: ">=22.19.0",
    });

    // §8 anchored partial-match: byte-identical prefix and suffix around the
    // implementation-defined `<observed>` tail.
    expect(rendered).toMatch(
      /^host incompatible \(node-floor\): observed (.*), required >=22\.19\.0$/,
    );

    // The host-derived `<observed>` segment is actually interpolated (the
    // mocked host version surfaces in the implementation-defined tail).
    expect(rendered).toContain("v18.19.0");
  });
});
