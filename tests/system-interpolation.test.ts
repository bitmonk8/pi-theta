import { describe, expect, it } from "vitest";
import {
  checkSystemInterpolation,
  SYSTEM_ON_PROMPT_MODE_CODE,
  SYSTEM_ON_PROMPT_MODE_MESSAGE,
  SYSTEM_INTERP_NOT_PATH_CODE,
  SYSTEM_INTERP_NOT_PATH_MESSAGE,
  SYSTEM_INTERP_UNKNOWN_PARAM_CODE,
  systemInterpUnknownParamMessage,
  SYSTEM_INTERP_BAD_FIELD_CODE,
  systemInterpBadFieldMessage,
  SYSTEM_INTERP_UNTERMINATED_CODE,
  SYSTEM_INTERP_UNTERMINATED_MESSAGE,
  type SystemParamType,
  type SystemTemplate,
} from "../src/parser/system-interpolation";
import { renderSystemPrompt } from "../src/parser/system-prompt-render";
import {
  stringifyInterpolatedValue,
  INTERPOLATED_RESULT_CODE,
  type InterpolationType,
} from "../src/render/query-render";
import { makeEnumValue, type ThetaValue } from "../src/runtime/value";
import { buildSidecar, type SchemaSidecar } from "../src/parser/schema-lowering";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// V6d-T — failing tests for the paired `V6d` "`system:` template interpolation"
// implementation.
//
// Spec: frontmatter/frontmatter-fields-b-and-templates.md §`system`
// Interpolation and query/query-escapes-stringification.md (QRY-18 canonical
// stringification table — the shared renderer this surface feeds).
//
// Diagnostic *Message* strings are sourced from the diagnostics registry
// (diagnostics/code-registry-parse.md) per the *Diagnostic message anchors*
// rule.
//
// These tests red because the V6d seam is absent: `checkSystemInterpolation` is
// an inert stub returning `{ diagnostics: [] }` (no diagnostic, no template) and
// `renderSystemPrompt` returns empty text. Each test reds on its own primary
// assertion (an absent expected diagnostic, an undefined parsed template, or a
// wrong rendered string) — not on a compile error, missing fixture, or harness
// throw.

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** A declared-params map from name → static type. */
function params(...entries: readonly [string, SystemParamType][]): ReadonlyMap<string, SystemParamType> {
  return new Map(entries);
}

/** Check a `system:` value in subagent mode against the given params. */
function check(
  systemValue: string,
  declared: ReadonlyMap<string, SystemParamType> = params(),
): ReturnType<typeof checkSystemInterpolation> {
  return checkSystemInterpolation({
    systemValue,
    mode: "subagent",
    params: declared,
    file: "test.theta",
  });
}

/** A single-path template driving the resolve-then-stringify render path. */
function pathTemplate(segments: readonly string[], type: InterpolationType): SystemTemplate {
  return { parts: [{ kind: "path", segments, type }] };
}

/** Render one path against a validated params object. */
function render(template: SystemTemplate, obj: Readonly<Record<string, ThetaValue>>): ReturnType<typeof renderSystemPrompt> {
  return renderSystemPrompt({ template, params: obj });
}

// --- frontmatter-fields-b-and-templates.md — the four parse-error codes ----

// cka-11 / V6d: the FRNT code-keyed obligation area's `system` template facet
// closes on V6d; the assertions in this file witness that facet against the
// shipped Path-only interpolation surface.
describe("V6d-T — `${…}` grammar restriction (four theta/parse/system-interp-* codes)", () => {
  it("theta/parse/system-interp-not-path: a non-Path `${…}` body is rejected", () => {
    // Indexed access is not a `Path` (grammar: `Ident ('.' Ident)*`).
    const r = check("You are ${arr[0]}.", params(["arr", { kind: "array" }]));
    const d = withCode(r.diagnostics, SYSTEM_INTERP_NOT_PATH_CODE);
    expect(d, "theta/parse/system-interp-not-path for a non-Path body").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message from code-registry-parse.md.
    expect(d?.message).toBe(SYSTEM_INTERP_NOT_PATH_MESSAGE);
    expect(r.template, "a non-Path body yields no parsed template").toBeUndefined();
  });

  it("theta/parse/system-interp-not-path: each non-Path form (arithmetic, call, optional-chain, string literal) fires the code", () => {
    for (const body of ["${a + b}", "${f(x)}", "${a?.b}", '${"x"}']) {
      const r = check(`prefix ${body} suffix`, params(["a", { kind: "string" }], ["b", { kind: "string" }]));
      expect(
        withCode(r.diagnostics, SYSTEM_INTERP_NOT_PATH_CODE),
        `theta/parse/system-interp-not-path for ${body}`,
      ).toBeDefined();
    }
  });

  it("theta/parse/system-interp-unknown-param: a head Ident naming no declared param is rejected", () => {
    const r = check("You are ${missing}.", params(["present", { kind: "string" }]));
    const d = withCode(r.diagnostics, SYSTEM_INTERP_UNKNOWN_PARAM_CODE);
    expect(d, "theta/parse/system-interp-unknown-param for an undeclared head Ident").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message from code-registry-parse.md (`<name>` renders the undeclared head).
    expect(d?.message).toBe(systemInterpUnknownParamMessage("missing"));
    expect(r.template).toBeUndefined();
  });

  it("theta/parse/system-interp-bad-field: a `.Ident` naming no reachable object field is rejected", () => {
    const objType: SystemParamType = {
      kind: "object",
      fields: params(["title", { kind: "string" }]),
    };
    const r = check("You are ${obj.bogus}.", params(["obj", objType]));
    const d = withCode(r.diagnostics, SYSTEM_INTERP_BAD_FIELD_CODE);
    expect(d, "theta/parse/system-interp-bad-field for an unreachable field step").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message from code-registry-parse.md (`.<field>` on `<path>`).
    expect(d?.message).toBe(systemInterpBadFieldMessage("bogus", "obj"));
    expect(r.template).toBeUndefined();
  });

  it("theta/parse/system-interp-bad-field: descending into an array terminates the path and is rejected", () => {
    // An array terminates a path; a `.Ident` step into it is a bad-field error.
    const r = check("You are ${arr.field}.", params(["arr", { kind: "array" }]));
    expect(
      withCode(r.diagnostics, SYSTEM_INTERP_BAD_FIELD_CODE),
      "theta/parse/system-interp-bad-field for a `.field` step into an array",
    ).toBeDefined();
  });

  it("theta/parse/system-interp-bad-field: descending into an un-narrowed discriminated union is rejected", () => {
    const r = check("You are ${u.field}.", params(["u", { kind: "discriminated-union" }]));
    expect(
      withCode(r.diagnostics, SYSTEM_INTERP_BAD_FIELD_CODE),
      "theta/parse/system-interp-bad-field for a `.field` step into an un-narrowed union",
    ).toBeDefined();
  });

  it("theta/parse/system-interp-unterminated: an unclosed `${` is rejected", () => {
    const r = check("You are ${param", params(["param", { kind: "string" }]));
    const d = withCode(r.diagnostics, SYSTEM_INTERP_UNTERMINATED_CODE);
    expect(d, "theta/parse/system-interp-unterminated for an unclosed `${`").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message from code-registry-parse.md.
    expect(d?.message).toBe(SYSTEM_INTERP_UNTERMINATED_MESSAGE);
    expect(r.template).toBeUndefined();
  });
});

// --- The `\${` escape + Path resolution ------------------------------------

describe("V6d-T — `\\${` escape and Path resolution", () => {
  it("`\\${` suppresses interpolation and renders the literal `${…}` text with no unknown-param diagnostic", () => {
    // Even though `param` is NOT declared, the escaped `\${param}` must not fire
    // an unknown-param error — the escape suppresses interpolation entirely.
    const r = check("literal \\${param} here", params());
    expect(
      withCode(r.diagnostics, SYSTEM_INTERP_UNKNOWN_PARAM_CODE),
      "an escaped `\\${…}` fires no unknown-param diagnostic",
    ).toBeUndefined();
    expect(r.diagnostics, "an escaped `\\${…}` raises no diagnostic at all").toEqual([]);
    expect(r.template, "an escaped `\\${…}` yields a parsed template").toBeDefined();
    // The escape resolves to a literal `${…}` — no interpolation path part.
    const hasInterp = (r.template?.parts ?? []).some((p) => p.kind === "path");
    expect(hasInterp, "no interpolation path is produced from an escaped `\\${…}`").toBe(false);
    const text = (r.template?.parts ?? [])
      .map((p) => (p.kind === "text" ? p.value : ""))
      .join("");
    expect(text, "the literal `${param}` survives verbatim").toBe("literal ${param} here");
  });

  it("a Path-only `${param}` parses to an interpolation path that resolves against the validated params object", () => {
    const r = check("You are ${role}.", params(["role", { kind: "string" }]));
    expect(r.diagnostics, "a valid bare-path `${…}` raises no diagnostic").toEqual([]);
    expect(r.template, "a valid bare-path `${…}` yields a parsed template").toBeDefined();
    const pathPart = (r.template?.parts ?? []).find((p) => p.kind === "path");
    expect(pathPart, "the `${role}` interpolation is captured as a path part").toBeDefined();
    if (pathPart?.kind === "path") {
      expect(pathPart.segments, "the path resolves against the theta-side `role` param").toEqual(["role"]);
    }
    // The parsed template resolves against the validated params object.
    const out = render(r.template as SystemTemplate, { role: "reviewer" as ThetaValue });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text, "the resolved `${role}` renders the params value").toBe("You are reviewer.");
    }
  });

  it("a `${param.field}` object path resolves the nested field against the validated params object", () => {
    const objType: SystemParamType = {
      kind: "object",
      fields: params(["name", { kind: "string" }]),
    };
    const r = check("Reviewer: ${author.name}", params(["author", objType]));
    expect(r.diagnostics, "a valid object-field path raises no diagnostic").toEqual([]);
    const pathPart = (r.template?.parts ?? []).find((p) => p.kind === "path");
    if (pathPart?.kind === "path") {
      expect(pathPart.segments).toEqual(["author", "name"]);
    }
    const out = render(r.template as SystemTemplate, {
      author: { name: "Ada" } as unknown as ThetaValue,
    });
    if (out.ok) {
      expect(out.text).toBe("Reviewer: Ada");
    }
  });
});

// --- Subagent-mode-only rule -----------------------------------------------

describe("V6d-T — `system:` subagent-mode-only (theta/parse/system-on-prompt-mode)", () => {
  it("theta/parse/system-on-prompt-mode: `system:` on a `mode: prompt` theta is rejected with the registry message", () => {
    const r = checkSystemInterpolation({
      systemValue: "You are a reviewer.",
      mode: "prompt",
      params: params(),
      file: "test.theta",
    });
    const d = withCode(r.diagnostics, SYSTEM_ON_PROMPT_MODE_CODE);
    expect(d, "theta/parse/system-on-prompt-mode for `system:` on a prompt-mode theta").toBeDefined();
    expect(d?.severity).toBe("error");
    // Message from code-registry-parse.md *Message* column.
    expect(d?.message).toBe(SYSTEM_ON_PROMPT_MODE_MESSAGE);
  });

  it("theta/parse/system-on-prompt-mode: `system:` on a `mode: subagent` theta is not rejected and parses", () => {
    const r = check("You are a reviewer.", params());
    expect(
      withCode(r.diagnostics, SYSTEM_ON_PROMPT_MODE_CODE),
      "a subagent-mode theta raises no system-on-prompt-mode error",
    ).toBeUndefined();
    // Positive baseline (reds against the stub): a subagent `system:` parses.
    expect(r.template, "a subagent-mode `system:` yields a parsed template").toBeDefined();
  });
});

// --- Resolve-then-stringify feeds the shared canonical renderer (QRY-18) ----
//
// Each distinct param-resolvable Theta static type is driven through the
// `system:` resolve-then-stringify path; the vectors witness only that the path
// feeds each type into the shared renderer (row-level correctness is owned by
// `V13a`). Every vector asserts both a concrete canonical string AND parity with
// `stringifyInterpolatedValue` (the shared renderer).

describe("V6d-T — resolve-then-stringify feeds each type into the shared renderer (QRY-18)", () => {
  /** Assert `system:` render parity with the shared renderer, plus a concrete string. */
  function expectVector(
    value: ThetaValue,
    type: InterpolationType,
    expected: string,
  ): void {
    const shared = stringifyInterpolatedValue(value, type);
    expect(shared.ok, "the shared renderer accepts this vector").toBe(true);
    const out = render(pathTemplate(["p"], type), { p: value });
    expect(out.ok, "the system: surface renders this vector").toBe(true);
    if (out.ok && shared.ok) {
      expect(out.text, "system: render matches the shared canonical rendering").toBe(shared.text);
      expect(out.text, "system: render is the expected canonical string").toBe(expected);
    }
  }

  it("string renders verbatim", () => {
    expectVector("plain text" as ThetaValue, { kind: "string" }, "plain text");
  });

  it("integer renders as a canonical decimal", () => {
    expectVector(42 as ThetaValue, { kind: "integer" }, "42");
  });

  it("number (finite) renders as a shortest round-trip decimal", () => {
    expectVector(3.14 as ThetaValue, { kind: "number" }, "3.14");
  });

  it("number NaN renders as the literal text `NaN` (reachable via the non-slash invoke/.theta arms)", () => {
    expectVector(NaN as ThetaValue, { kind: "number" }, "NaN");
  });

  it("number Infinity renders as the literal text `Infinity`", () => {
    expectVector(Infinity as ThetaValue, { kind: "number" }, "Infinity");
  });

  it("number -Infinity renders as the literal text `-Infinity`", () => {
    expectVector(-Infinity as ThetaValue, { kind: "number" }, "-Infinity");
  });

  it("boolean renders as `true` / `false`", () => {
    expectVector(true as ThetaValue, { kind: "boolean" }, "true");
  });

  it("null renders as the literal text `null`, not the empty string", () => {
    expectVector(null as ThetaValue, { kind: "null" }, "null");
  });

  it("an enum variant renders as its bare wire value", () => {
    expectVector(makeEnumValue("Severity", "high") as unknown as ThetaValue, { kind: "enum" }, "high");
  });

  it("an array<T> renders as compact JSON.stringify", () => {
    expectVector([1, 2, 3] as unknown as ThetaValue, { kind: "array" }, "[1,2,3]");
  });

  it("a schema-typed object renders as compact JSON.stringify with wire-name translation", () => {
    // A `title` theta-side field renamed to wire `heading` witnesses outbound
    // wire-name translation through the shared renderer.
    const sidecar: SchemaSidecar = buildSidecar([
      { thetaName: "title", wireName: "heading", pointer: "/properties/heading", type: { kind: "other" } },
    ]);
    const sidecars = new Map<string, SchemaSidecar>([["Root", sidecar]]);
    const objType: InterpolationType = { kind: "object", sidecars, rootDef: "Root" };
    expectVector(
      { title: "Fix the bug" } as unknown as ThetaValue,
      objType,
      '{"heading":"Fix the bug"}',
    );
  });
});

// --- The Result<T, E> row does not arise from this surface -----------------

describe("V6d-T — Result<T, E> does not arise from the `system:` surface", () => {
  it("every param-resolvable type renders without a theta/parse/interpolated-result rejection", () => {
    // `params:` types never include `Result`, so the `system:` resolve path
    // never produces a `result`-typed slot and the canonical table's `Result`
    // row cannot fire here. Drive each non-Result type and assert the surface
    // renders it (never an `ok: false` interpolated-result diagnostic). The
    // positive `null` baseline reds against the stub so the test fails for the
    // intended reason rather than passing vacuously.
    const vectors: readonly (readonly [ThetaValue, InterpolationType])[] = [
      ["s" as ThetaValue, { kind: "string" }],
      [7 as ThetaValue, { kind: "integer" }],
      [1.5 as ThetaValue, { kind: "number" }],
      [false as ThetaValue, { kind: "boolean" }],
      [null as ThetaValue, { kind: "null" }],
      [makeEnumValue("E", "v") as unknown as ThetaValue, { kind: "enum" }],
      [[1] as unknown as ThetaValue, { kind: "array" }],
    ];
    for (const [value, type] of vectors) {
      const out = render(pathTemplate(["p"], type), { p: value });
      expect(out.ok, "no param-resolvable type routes to an ok:false result").toBe(true);
      if (!out.ok) {
        expect(out.diagnostic.code).not.toBe(INTERPOLATED_RESULT_CODE);
      }
    }
    // Positive baseline: `null` renders `null` — reds against the empty-text stub.
    const nullOut = render(pathTemplate(["p"], { kind: "null" }), { p: null as ThetaValue });
    expect(nullOut.ok && nullOut.text).toBe("null");
  });
});
