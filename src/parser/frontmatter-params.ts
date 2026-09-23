// Frontmatter params extraction, field-shape diagnostics, and schema lowering.

import { normaliseLiteralValueLineBreaks, type Diagnostic } from "../diagnostics/diagnostic";
import { isMap, isScalar, type LineCounter, type Node } from "yaml";
import { parseParams, type ParamFieldInput, type BodyTypeDeclaration } from "./params";
import type { BypassParamsField } from "../binder/binder-envelope";
import type { ParsedParams } from "./frontmatter";
import {
  rangeOf,
  paramValueSource,
  paramValueCanCarryType,
  RESERVED_KEYWORDS,
  isIdentifierShaped,
} from "./frontmatter-yaml";
import { skipQuotedRegion } from "./type-text-split";
import { isTypeLikeName } from "../lexer/name-case";

/**
 * Split a `params:` field value scalar (`<type-expr>` optionally followed by
 * `= <literal>`) into its type expression and default RHS at the first top-level
 * `=` — one not nested inside `<...>` angle brackets, `{...}` braces, `[...]`
 * brackets, or a `"`/`'` string literal (so `array<string> = []` and
 * `Author = { name: "x" }` split correctly, and an `==`/`>=` inside a default is
 * not mistaken for the separator).
 */
function splitParamValue(raw: string): { typeSource: string; defaultSource?: string } {
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c === '"' || c === "'") {
      i = skipQuotedRegion(raw, i);
      continue;
    }
    if (c === "<" || c === "{" || c === "[") {
      depth += 1;
      continue;
    }
    if (c === ">" || c === "}" || c === "]") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && c === "=" && raw[i + 1] !== "=" && raw[i - 1] !== "=") {
      const typeSource = raw.slice(0, i).trim();
      const defaultSource = raw.slice(i + 1).trim();
      return { typeSource, defaultSource };
    }
  }
  return { typeSource: raw.trim() };
}

/** Whether a lowered type expression is a nullable union (a top-level `| null` arm). */
function typeSourceIsNullable(typeSource: string): boolean {
  return typeSource
    .split("|")
    .map((arm) => arm.trim())
    .some((arm) => arm === "null");
}

/**
 * Extract the theta's lowered `params:` schema plus the load-time bypass inputs
 * from the `params:` YAML node. Returns `undefined` when the block is absent,
 * `null`, or not a mapping. The lowered schema is derived through the `V6b`
 * `parseParams` seam, supplied with the whole-file body-level named types
 * (`bodyTypeDecls`) so a `NamedType` param (a body `enum` / `schema`) lowers to
 * a present `loweredSchema` with the resolved `$def` — BIND-1: an empty body-type
 * list here previously left `loweredSchema` absent for a `NamedType` param, which
 * the runtime binder guard then mis-classified as a no-params theta. The raw
 * per-field inputs are returned alongside so `parseFrontmatter` can run the
 * whole-file `params:` diagnostics pass and build the `system:` interpolation
 * param types.
 *
 * Each field's declared type is recovered as the author's own bytes: a scalar
 * RHS reads its parsed value; a non-scalar RHS — an inline object type, a YAML
 * flow mapping — reads the value node's own source range via
 * `paramValueSource` (bug 0035), so that shape reaches `parseParams` instead of
 * being discarded as an empty type. A value node that cannot carry a type
 * expression (`paramValueCanCarryType`) draws the per-field
 * `theta/load/params-type-not-expression` in the returned `diagnostics`; the
 * field is still recorded so the `system:` interpolation seam and `parseParams`
 * see the same field set and the refusal stays one diagnostic (bug 0041). The
 * `parseParams` lowering runs once here; its diagnostics travel out separately
 * (`loweringDiagnostics`) so the caller can order them behind the shape
 * refusals.
 */
function extractParsedParams(
  paramsNode: Node | null | undefined,
  file: string,
  lineCounter: LineCounter,
  lineOffset: number,
  bodyTypeDecls: readonly BodyTypeDeclaration[],
  yamlSource: string,
): {
  params: ParsedParams | undefined;
  fieldInputs: readonly ParamFieldInput[];
  diagnostics: readonly Diagnostic[];
  loweringDiagnostics: readonly Diagnostic[];
} {
  if (!isMap(paramsNode)) {
    return { params: undefined, fieldInputs: [], diagnostics: [], loweringDiagnostics: [] };
  }
  const fieldInputs: ParamFieldInput[] = [];
  const bypassFields: BypassParamsField[] = [];
  const defaultedFields: string[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const item of paramsNode.items) {
    if (!isScalar(item.key)) {
      continue;
    }
    const name = String(item.key.value);
    const rawValue = isScalar(item.value)
      ? String(item.value.value)
      : paramValueSource(item.value, yamlSource);
    const { typeSource, defaultSource } = splitParamValue(rawValue);
    const range =
      rangeOf((item.value ?? item.key) as Node, lineCounter, lineOffset) ??
      { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } };
    // lexical.md §Identifiers requires lowercase-first for a schema field
    // name, and code-registry-parse.md's binding-case-mismatch row already
    // names the field-name position in its Trigger. A `params:` key is that
    // position twice over: it lowers to an object schema's property
    // (schemas.md), and frontmatter-fields-a.md's "exposed as typed variables
    // in the theta body" makes it a body binding as well, so the rule applies
    // on either reading. `range` above is the VALUE node's, not the key's, so
    // a diagnostic naming the key needs a range of its own; on an unranged key
    // node it falls back to `range`, the same `??` fallback `range` itself
    // already uses. Three arms split the field-name position between three
    // rules, in the order every other enforcement site uses (`checkName`,
    // lexer.ts; `parseFn`'s parameter check, theta-document.ts):
    // reserved-keyword refusal first, under lexical.md §Reserved words /
    // code-registry-parse.md:21; non-identifier-shape refusal second, under
    // lexical.md §Identifiers / code-registry-parse.md:19; and the case gate
    // last, over what remains — an identifier-shaped, non-reserved key. The
    // three subjects are disjoint: a reserved spelling is never
    // identifier-shaped-but-wrong-shaped, and the case gate only ever sees an
    // identifier-shaped key, so no arm can reach another arm's input.
    if (RESERVED_KEYWORDS.has(name)) {
      // lexical.md:20 reserves 32 spellings from identifier position with no
      // scope list, and code-registry-parse.md:21's Trigger names no
      // position either: a `params:` key is an identifier position twice
      // over (schemas.md's field-identifier reading, and
      // frontmatter-fields-a.md:57's "exposed as typed variables in the
      // theta body"), and it is the face that reaches furthest — the
      // spelling becomes a JSON Schema property key and a `wireName` the
      // binder and the provider receive (row L1). This key is a YAML scalar,
      // not a token, so the predicate is membership in the shipped
      // `RESERVED_KEYWORDS` set rather than a `kind` test, and the range
      // comes from the key node itself, the same fallback-to-`range` shape
      // the case arm below uses for the same key. Emitted under the
      // registered `theta/parse/*` code and not a `theta/load/` twin: DIAG-2
      // closes the registry, the `load` namespace carries no
      // reserved-keyword row, and the code names the RULE rather than the
      // module. The keyword arm runs first — mirroring `parseFn`'s
      // parameter-name check (`theta-document.ts`, `keyword` ahead of
      // `ident`) — though the case arm's own `!RESERVED_KEYWORDS.has` guard
      // already keeps the two subjects disjoint.
      diagnostics.push({
        severity: "error",
        code: "theta/parse/reserved-keyword-as-identifier",
        file,
        range: rangeOf(item.key as Node, lineCounter, lineOffset) ?? range,
        message: `reserved keyword '${name}' cannot be used as an identifier`,
      });
    } else if (!isIdentifierShaped(name)) {
      // A `params:` key is a field-name position twice over (schema property
      // + body binding), and every sibling field-name position already
      // refuses a non-`Ident` spelling (inline-object field names,
      // 0154; `schema` bodies refuse it grammatically). Refusing here at LOAD
      // closes the one position that did not, and lets the two line-oriented
      // renderers that interpolate the name bare (renderBinderParamLine,
      // renderArgumentEcho) stay untouched — a refused key never reaches
      // them. The message names no key: the cooked value can carry a real
      // U+000A (an explicit-key block scalar, `? |-`, cooks a line break into
      // the key), and a single-line diagnostic message must never reproduce
      // one (diagnostic-shape.md); `range` — not the message — locates the
      // offender, the same discipline `binding-case-mismatch` above already
      // uses for its own key.
      diagnostics.push({
        severity: "error",
        code: "theta/parse/params-key-not-identifier",
        file,
        range: rangeOf(item.key as Node, lineCounter, lineOffset) ?? range,
        message: "params key must be an identifier",
      });
    } else {
      if (isTypeLikeName(name)) {
        diagnostics.push({
          severity: "error",
          code: "theta/parse/binding-case-mismatch",
          file,
          range: rangeOf(item.key as Node, lineCounter, lineOffset) ?? range,
          message: "binding name must start with a lowercase letter or _",
        });
      }
    }
    // A value node outside `paramValueCanCarryType`'s set declares no type
    // expression: the only non-scalar YAML shape that spells a `Type` is the
    // flow mapping an inline object type parses as, and every other node
    // shape recovers bytes no `Type` production spells. One registered error
    // per offending field; the field is still recorded below so no second
    // diagnostic cascades at the `system:` interpolation seam (bug 0041).
    // `shapeRefused` rides along with the retained field so `parseParams`
    // (bug 0059 §Fix constraint 1) can tell a node already refused HERE from
    // one whose recovered TEXT it must judge itself, and skip its own
    // refusal — the ordering comment on the `paramsShapeDiags` push in
    // `parseFrontmatter`, below, states why: a field whose RHS spells no type
    // expression is reported as such, not by whatever the lowering makes of
    // its recovered bytes.
    const shapeRefused = !paramValueCanCarryType(item.value);
    if (shapeRefused) {
      diagnostics.push({
        severity: "error",
        code: "theta/load/params-type-not-expression",
        file,
        range,
        message: `'params:' field '${normaliseLiteralValueLineBreaks(name)}' right-hand side is not a theta type expression`,
      });
    }
    fieldInputs.push({
      name,
      typeSource,
      ...(defaultSource !== undefined ? { defaultSource } : {}),
      range,
      ...(shapeRefused ? { shapeRefused: true } : {}),
    });
    bypassFields.push({
      wireName: name,
      type: typeSource,
      hasDefault: defaultSource !== undefined,
      // Retained for the binder system prompt's `default=<literal>` requirement
      // token (V11d Parameters block) — the bypass classification ignores it.
      ...(defaultSource !== undefined ? { defaultSource } : {}),
      nullable: typeSourceIsNullable(typeSource),
    });
    if (defaultSource !== undefined) {
      defaultedFields.push(name);
    }
  }
  const lowered = parseParams(fieldInputs, bodyTypeDecls, { file });
  return {
    params: {
      ...(lowered.loweredSchema !== undefined ? { loweredSchema: lowered.loweredSchema } : {}),
      defaultedFields,
      fields: bypassFields,
    },
    fieldInputs,
    diagnostics,
    loweringDiagnostics: lowered.diagnostics,
  };
}

export { extractParsedParams };
