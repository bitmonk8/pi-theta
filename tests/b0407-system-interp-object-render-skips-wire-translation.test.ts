import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";
import { renderSystemPrompt } from "../src/parser/system-interpolation";
import type { ThetaValue } from "../src/runtime/value";

// Witness tests for bug 0407
// (docs/bugs/0407-system-interp-object-render-skips-wire-translation.md).
//
// `toSystemParamType` builds `{ kind: "object" }` / `{ kind: "array" }` for a
// body-schema-typed param but never populates the wire-name-translation
// sidecars, so the shared renderer's outbound translation pass is silently
// skipped. A `system:` `${author}` therefore renders the theta-side field
// names into the child's system prompt, while the same value in a query
// template renders the wire names — violating the single-rendering guarantee
// (query-escapes-stringification.md :34 "the theta-side names an author writes
// never appear in the rendered prompt").
//
// Harness: `parseDoc` + `renderSystemPrompt` (the spawn-site call pair). The
// render input carries theta-side keys (`first_name`); the expected output is
// the wire name (`FirstName`).

describe("bug 0407 — `system:` object render skips wire-name translation", () => {
  // W1 — a body schema with `first_name as "FirstName"`; a bare `${author}`
  // must render the wire name recursively. Fork renders `first_name`.
  it("W1: body-schema wire rename is applied to a bare `${author}`", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Reviewer: \${author}'
params:
  author: Author
---
schema Author {
  first_name as "FirstName": string,
  role: string
}
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl, "the schema-typed `system:` template registers").toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { author: { first_name: "Ada", role: "dev" } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Reviewer: {"FirstName":"Ada","role":"dev"}');
  });

  // W2 — an `array<Author>` param applies the same rename recursively inside
  // the array elements. Fork renders `first_name`.
  it("W2: array<Author> applies the wire rename inside each element", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'Team: \${team}'
params:
  team: 'array<Author>'
---
schema Author {
  first_name as "FirstName": string,
  role: string
}
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { team: [{ first_name: "Ada", role: "dev" }] as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('Team: [{"FirstName":"Ada","role":"dev"}]');
  });

  // G1 (guard) — a schema with NO renames must render byte-identical: the fix
  // must keep sidecar-less/rename-less rendering unchanged. Green at the fork.
  it("G1 (guard): a rename-free schema renders byte-identical compact JSON", () => {
    const doc = parseDoc(`---
mode: subagent
system: 'X: \${p}'
params:
  p: Plain
---
schema Plain { a: string, b: integer }
let x = 1`);
    const tmpl = doc.frontmatter?.system;
    expect(tmpl).toBeDefined();
    const r = renderSystemPrompt({
      template: tmpl!,
      params: { p: { a: "hi", b: 7 } as unknown as ThetaValue },
    });
    expect(r.ok && r.text).toBe('X: {"a":"hi","b":7}');
  });
});
