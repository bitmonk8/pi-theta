import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import {
  renderSystemPrompt,
  SYSTEM_INTERP_BAD_FIELD_CODE,
} from "../src/parser/system-interpolation";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0408
// (docs/bugs/0408-scalar-union-params-render-json-row.md).
//
// `toSystemParamType` treats every top-level `|` union as a discriminated
// union, and `toInterpolationType` maps that to `{ kind: "object" }`, so a
// scalar-union param (`string | null`, `number | null`) renders a `system:`
// `${param}` through the JSON-object row: strings gain quotes, `NaN` becomes
// the four bytes `null`, `1e21` becomes scientific notation. The query surface
// (value-driven `interpolationTypeOf`) renders the scalar rows. The fix routes
// a scalar-valued discriminated-union part through the matching scalar row.
//
// Harness: `parseDoc` + `renderSystemPrompt` (the spawn-site call pair).

/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

describe("bug 0408 — scalar-union params render through the JSON row", () => {
  // W1 — `string | null` carrying a string must render the string row (no
  // quoting). Fork renders `Focus: "hello"`.
  it("W1: `string | null` renders a string value unquoted", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Focus: \${p}'
params:
  p: 'string | null'
---
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({ template: tmpl!, params: { p: "hello" as ThetaValue } });
    expect(r.ok && r.text).toBe("Focus: hello");
  });

  // W2 — `number | null` carrying `NaN` must render the number row's `NaN`,
  // not a fabricated `null` of the other arm. Fork renders `N: null`.
  it("W2: `number | null` renders `NaN` as the literal text NaN", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'N: \${p}'
params:
  p: 'number | null'
---
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({ template: tmpl!, params: { p: NaN as ThetaValue } });
    expect(r.ok && r.text).toBe("N: NaN");
  });

  // W3 — the number row is shortest round-trip decimal, never scientific
  // (BNDR-5). Fork renders `M: 1e+21`.
  it("W3: `number | null` renders 1e21 as plain decimal, never scientific", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'M: \${q}'
params:
  q: 'number | null'
---
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({ template: tmpl!, params: { q: 1e21 as ThetaValue } });
    expect(r.ok && r.text).toBe("M: 1000000000000000000000");
  });

  // W4 — the fix must keep `null` rendering as `null`. This holds at the fork
  // too (JSON.stringify(null) === "null"), so it guards the fix's null path
  // rather than witnessing the defect; recorded green.
  it("W4: `string | null` renders a null value as the literal text null", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'F: \${p}'
params:
  p: 'string | null'
---
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({ template: tmpl!, params: { p: null as ThetaValue } });
    expect(r.ok && r.text).toBe("F: null");
  });

  // --- Constraint guards: behaviour the fix must PRESERVE (green at fork) ----

  // G1 (guard) — a plain `number` param already renders `NaN` correctly; the
  // fix must not regress it.
  it("G1 (guard): a plain `number` param renders NaN correctly", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'N: \${p}'
params:
  p: number
---
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({ template: tmpl!, params: { p: NaN as ThetaValue } });
    expect(r.ok && r.text).toBe("N: NaN");
  });

  // G2 (guard) — a union of OBJECT schemas must stay on the JSON-object row
  // (§Non-goals: "the object row is arguably right for those"). Green at the
  // fork and must remain green post-fix.
  it("G2 (guard): an object-schema union stays on the JSON row", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Pet: \${pet}'
params:
  pet: 'Cat | Dog'
---
schema Cat { kind: string }
schema Dog { kind: string }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { pet: { kind: "cat" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Pet: {"kind":"cat"}');
  });

  // G3 (guard) — a `.Ident` step into a scalar union is refused (un-narrowed
  // union); the fix must keep the parse-time refusal.
  it("G3 (guard): a `.Ident` step into a scalar union is still refused", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Q: \${p.field}'
params:
  p: 'string | null'
---
let x = 1`);
    expect(errorCodes(doc).includes(SYSTEM_INTERP_BAD_FIELD_CODE)).toBe(true);
    expect(doc.frontmatter?.system, "a refused path yields no template").toBeUndefined();
  });
});
