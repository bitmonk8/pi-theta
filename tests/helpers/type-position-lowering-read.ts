// A shared four-position lowering reader: reads one type source at the
// `params` / `field` / `alias` / `annotation` `Type` positions and returns the
// lowered fragment, the whole lowered document and its `$defs`, with loud
// readers that refuse a fixture which fails to reach the lowering.
//
// WHY THIS FILE EXISTS. The literal-lowering bug witnesses
// (tests/generic-argument-literal-lowering.test.ts,
// tests/union-arm-literal-const-lowering.test.ts,
// tests/params-literal-sublanguage-lowering.test.ts) each declared the same
// `readAt` / `fragmentOf` / `defOf` / `refNameOf` harness, differing only in
// the declarations prepended to every fixture, the fixture path, and the
// grammar anchors one assertion message cites (PTQ-1485). Those three facts
// are threaded through `makeTypePositionLoweringReader` explicitly.
//
// TIER: unit, offline, deterministic, provider-free. Nothing is stubbed: every
// read parses through the real `parseDoc` (./e2e-s1) or calls the shipped
// `lowerQueryResponseSchema`.

import { expect } from "vitest";
import type { EnumDecl, SchemaDecl, ThetaDocument } from "../../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../../src/parser/query-schema-lowering";
import type { LoweredSchema } from "../../src/seams/schema-validator";
import { yamlQuoted, parseDoc, diagLines } from "./e2e-s1";

/** The four `Type` positions a type source is read at. */
export type LoweringPosition = "params" | "field" | "alias" | "annotation";

/** The lowered `params:` document of a loaded theta, absent when none was produced. */
export function loweredParamsDocument(doc: ThetaDocument): Record<string, unknown> | undefined {
  return doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
}

/** What one `Type` position yields for one type source. */
export interface PositionRead {
  /** Every diagnostic the whole-document load raised, rendered. */
  readonly diags: readonly string[];
  /** The fragment AT the type position, absent when the load produced none. */
  readonly fragment?: unknown;
  /** The whole lowered document, for the `$ref`-closure and AJV checks. */
  readonly document?: LoweredSchema;
  /** The document's `$defs`, with the position's own wrapper name removed. */
  readonly defs: Record<string, unknown>;
}

/** The per-file facts the four-position reader is bound to. */
export interface TypePositionLoweringFixture {
  /** The declarations prepended to every fixture body. */
  readonly decls: string;
  /** The fixture path every `parseDoc` call is handed. */
  readonly path: string;
  /** The grammar anchors `fragmentOf`'s clean-load message cites. */
  readonly admittedAt: string;
}

/** Bind the four-position readers to one file's declarations, fixture path and anchors. */
export function makeTypePositionLoweringReader({ decls, path, admittedAt }: TypePositionLoweringFixture) {
  /**
   * Read one type source at one of the four positions. Never throws on a refused
   * load — the caller decides whether an absent fragment is the subject or a
   * broken fixture, and `fragmentOf` below is the loud reader.
   *
   * The `@<T>` annotation returns its lowered document AS the fragment, so its
   * root `$defs` closure is split off to keep the four positions comparable: at
   * the other three the closure lives on the enclosing `params:` document, never
   * on the fragment.
   */
  function readAt(position: LoweringPosition, typeSource: string): PositionRead {
    if (position === "annotation") {
      const doc = parseDoc(`---\nmode: prompt\n---\n${decls}let inert = 1\ninert\n`, path);
      const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
      const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
      const lowered = lowerQueryResponseSchema(typeSource, schemas, enums);
      if (lowered === undefined) {
        return { diags: diagLines(doc), defs: {} };
      }
      const { $defs, ...root } = lowered as Record<string, unknown>;
      return {
        diags: diagLines(doc),
        fragment: root,
        document: lowered,
        defs: ($defs ?? {}) as Record<string, unknown>,
      };
    }
    const source =
      position === "params"
        ? `---\nmode: prompt\nparams:\n  p: ${yamlQuoted(typeSource)}\n---\n${decls}let inert = 1\ninert\n`
        : position === "field"
          ? `---\nmode: prompt\nparams:\n  p: S\n---\n${decls}schema S { a: ${typeSource} }\nlet inert = 1\ninert\n`
          : `---\nmode: prompt\nparams:\n  a: M\n---\n${decls}schema M = ${typeSource}\nlet inert = 1\ninert\n`;
    const doc = parseDoc(source, path);
    const document = loweredParamsDocument(doc);
    const defs = { ...((document?.["$defs"] ?? {}) as Record<string, unknown>) };
    const wrapper = position === "field" ? "S" : position === "alias" ? "M" : undefined;
    let fragment: unknown;
    if (document !== undefined) {
      if (position === "params") {
        fragment = (document["properties"] as Record<string, unknown>)["p"];
      } else if (position === "field") {
        const s = defs["S"] as Record<string, unknown> | undefined;
        fragment = (s?.["properties"] as Record<string, unknown> | undefined)?.["a"];
      } else {
        fragment = defs["M"];
      }
    }
    if (wrapper !== undefined) {
      // The wrapper `$defs` entry is the position's own scaffolding, not a name
      // the type source reached, so it is dropped to keep the minted-name
      // comparisons across positions like-for-like.
      delete defs[wrapper];
    }
    return {
      diags: diagLines(doc),
      ...(document !== undefined ? { fragment, document: document as LoweredSchema } : {}),
      defs,
    };
  }

  /**
   * The fragment at one position, loud on every way a fixture can fail to reach
   * the lowering: a diagnostic (which withholds the whole lowered document at the
   * `params:` position) or an absent document.
   */
  function fragmentOf(label: string, position: LoweringPosition, typeSource: string): unknown {
    const read = readAt(position, typeSource);
    expect(
      read.diags,
      `${label} [${position}]: \`${typeSource}\` is grammar-admitted at every type-annotation ` +
        `position (${admittedAt}), so this fixture must load with NO diagnostics or the ` +
        `lowering under assertion never runs; observed ` +
        `${JSON.stringify(read.diags)}`,
    ).toEqual([]);
    if (read.document === undefined) {
      throw new Error(
        `${label} [${position}]: \`${typeSource}\` produced NO lowered document, so there is ` +
          `nothing for AJV to enforce at that position; diagnostics ${JSON.stringify(read.diags)}`,
      );
    }
    return read.fragment;
  }

  /** The `$defs` entry a hoisting position minted, never absent. */
  function defOf(
    label: string,
    position: LoweringPosition,
    typeSource: string,
    name: string,
  ): Record<string, unknown> {
    const read = readAt(position, typeSource);
    const entry = read.defs[name];
    if (entry === undefined) {
      throw new Error(
        `${label} [${position}]: \`${typeSource}\` must hoist under \`${name}\` — the name ` +
          `schema-subset.md:73 mints from the LOWERED fragment — or the \`$ref\` at the type ` +
          `position dangles; observed \`$defs\` keys ${JSON.stringify(Object.keys(read.defs))}`,
      );
    }
    return entry as Record<string, unknown>;
  }

  /** The def name a hoisting position's `$ref` points at, loud on a non-`$ref`. */
  function refNameOf(label: string, position: LoweringPosition, typeSource: string): string {
    const fragment = fragmentOf(label, position, typeSource) as Record<string, unknown>;
    const ref = fragment["$ref"];
    if (typeof ref !== "string") {
      throw new Error(
        `${label} [${position}]: a brace-rooted \`${typeSource}\` hoists (schema-subset.md:73), ` +
          `so the fragment at the position is a \`$ref\`; observed ${JSON.stringify(fragment)}`,
      );
    }
    const match = /^#\/\$defs\/(.+)$/.exec(ref);
    if (match?.[1] === undefined) {
      throw new Error(`${label} [${position}]: unreadable \`$ref\` pointer ${JSON.stringify(ref)}`);
    }
    return match[1];
  }

  /** The whole lowered `params:` document of a theta that MUST load. */
  function paramsDocumentOf(label: string, fields: string): LoweredSchema {
    const doc = parseDoc(
      `---\nmode: prompt\nparams:\n${fields}---\n${decls}let inert = 1\ninert\n`,
      path,
    );
    expect(
      diagLines(doc),
      `${label}: the fixture's \`params:\` types are legal theta ` +
        `(frontmatter-fields-a.md:58), so it must load with NO diagnostics; observed ` +
        `${JSON.stringify(diagLines(doc))}`,
    ).toEqual([]);
    const document = loweredParamsDocument(doc);
    if (document === undefined) {
      throw new Error(
        `${label}: the theta declares a \`params:\` block, so its lowered schema must be present ` +
          `(BIND-1); diagnostics ${JSON.stringify(diagLines(doc))}`,
      );
    }
    return document as LoweredSchema;
  }

  return { readAt, fragmentOf, defOf, refNameOf, paramsDocumentOf };
}
