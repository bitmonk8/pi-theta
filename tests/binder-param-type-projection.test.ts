// Bug 0251 — the binder system prompt's per-field `<type>` and the forced-tool
// envelope schema are two derivations of one `params:` field from two different
// inputs, and nothing checks them against each other.
//
// The prompt line is built from the verbatim `params:` source slice recorded as
// `BypassParamsField.type` (src/parser/frontmatter.ts:941) and rendered by
// `renderBinderParamLine` (src/binder/binder-system-prompt.ts:258). The tool
// schema on the other branch of the same dispatch is built from the LOWERED
// params schema (`paramsSchema: params.loweredSchema`,
// src/extension/production-theta-producer.ts:867). A declared type carrying a
// top-level inline-object segment the lowering discards therefore reaches the
// model as a contract its answer schema forbids.
//
// This file pairs the two, per carrier shape: the rendered `(<type>)` interior
// must denote exactly the property set the field's lowered `$defs` fragment
// encodes. Bug 0251 §Expected behaviour is the assertion; §Fix pins the exact
// post-fix rendered lines the divergence cells demand.
//
// Spec: docs/spec_topics/binder/binder-bypass-and-envelope.md:129 (*Type
// display*, and its eight-row normative reference table) and :123 (the
// per-field template `<wire-name> (<type>) <requirement>`).

import { beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session binder reply for cell 7's production dispatch (the
// e2e-s5 pattern). `vi.hoisted` so the `vi.mock` factory — hoisted above the
// imports — can close over a mutable holder the cell sets; `calls` captures the
// whole `complete(model, context, options)` triple so the assertion reads the
// REAL `context.systemPrompt` production built.
const scripted = vi.hoisted(() => ({
  reply: undefined as unknown,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      scripted.calls.push({ model, context, options });
      return scripted.reply;
    }),
  };
});

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderBinderParamLine,
  type SystemPromptParamField,
} from "../src/binder/binder-system-prompt";
import type { BypassParamsField } from "../src/binder/binder-envelope";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";
import { projectRenderedParamType } from "../src/parser/params";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

// The corpus this file sweeps is a function of the commit, not of the process
// cwd, so the root is derived from this module's own location.
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The refusal bug 0244/0252 landed for a colon-less inline-object entry. */
const MALFORMED_SCHEMA_FIELD = "theta/parse/malformed-schema-field";

// --- the seam under assertion ------------------------------------------------

/**
 * Build the system-prompt descriptor for one parsed `params:` field exactly as
 * the production mapper `binderPromptParamField`
 * (src/extension/production-theta-producer.ts:679) does — wire name, `type`
 * copied off the recorded field, requirement chosen from `hasDefault` /
 * `defaultSource`.
 *
 * The construction is mirrored rather than called because that mapper is
 * module-private; the dispatch reaches it only through
 * `params.fields.map(binderPromptParamField)`
 * (src/extension/production-theta-producer.ts:898). Mirroring keeps this file
 * offline and free of a src/ export it does not own, at the cost that the
 * projection bug 0251 §Fix describes must be observable in how this descriptor's
 * `type` is derived — either inside `renderBinderParamLine` or through an
 * exported projection this mirror can call. It calls the latter,
 * `projectRenderedParamType` (src/parser/params.ts), the same function
 * production's own `binderPromptParamField` calls, so this mirror exercises
 * the real projection rather than a second copy of it. Production's own USE of
 * that projection — which a mirror cannot witness — is cell 8's subject: it
 * drives the real dispatch and reads the `Parameters:` line off the captured
 * `context.systemPrompt`.
 */
function promptParamField(field: BypassParamsField): SystemPromptParamField {
  return {
    wireName: field.wireName,
    type: projectRenderedParamType(field.type),
    requirement:
      field.hasDefault && field.defaultSource !== undefined
        ? { kind: "default", literal: field.defaultSource }
        : { kind: "required" },
  };
}

/** A `mode: prompt` theta declaring one `params:` field `p` of `type`. */
function docSource(type: string): string {
  return `---\nmode: prompt\nparams:\n  p: '${type}'\n---\nbind p\n`;
}

/** The single parsed `params:` field of a one-field document. */
function soleField(doc: ThetaDocument, declared: string): BypassParamsField {
  const fields = doc.frontmatter?.params?.fields;
  if (fields === undefined || fields.length !== 1) {
    throw new Error(
      `unmet precondition: declared type \`${declared}\` must register exactly ` +
        `one \`params:\` field for the render seam to be reachable; got ` +
        `${fields === undefined ? "no params block" : `${String(fields.length)} fields`}` +
        `, diagnostics ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`,
    );
  }
  return fields[0] as BypassParamsField;
}

/**
 * Parse a one-field `params:` document and render that field's per-field
 * Parameters line through the production renderer.
 */
function renderFieldLine(declared: string): string {
  const doc = parseDoc(docSource(declared), "b0251.theta");
  return renderBinderParamLine(promptParamField(soleField(doc, declared)));
}

// --- the lowered contract ----------------------------------------------------

type Fragment = Readonly<Record<string, unknown>>;

/** Resolve one `#/$defs/<name>` pointer against the lowered schema's `$defs`. */
function resolveRef(schema: Fragment, node: Fragment): Fragment {
  const ref = node["$ref"];
  if (typeof ref !== "string") {
    return node;
  }
  const name = ref.replace("#/$defs/", "");
  const defs = schema["$defs"] as Record<string, Fragment> | undefined;
  const target = defs?.[name];
  if (target === undefined) {
    throw new Error(`unmet precondition: lowered schema has no $def \`${name}\``);
  }
  return target;
}

/**
 * The lowered fragments the envelope's `args` arm encodes for field `p`, in
 * declaration order: one fragment for a plain inline object, one per arm for a
 * union. This is the second contract of bug 0251 — the one the forced tool
 * schema enforces.
 */
function loweredFragmentsOfP(declared: string): readonly Fragment[] {
  const doc = parseDoc(docSource(declared), "b0251.theta");
  const schema = doc.frontmatter?.params?.loweredSchema;
  if (schema === undefined) {
    throw new Error(
      `unmet precondition: declared type \`${declared}\` must lower for the ` +
        `prompt/schema pairing to have a second contract; loweredSchema absent, ` +
        `diagnostics ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`,
    );
  }
  const properties = schema["properties"] as Record<string, Fragment> | undefined;
  const p = properties?.["p"];
  if (p === undefined) {
    throw new Error("unmet precondition: lowered schema declares no property `p`");
  }
  const anyOf = p["anyOf"];
  if (Array.isArray(anyOf)) {
    return anyOf.map((arm) => resolveRef(schema, arm as Fragment));
  }
  return [resolveRef(schema, p)];
}

// --- the rendered contract ---------------------------------------------------

/** The `(<type>)` interior of a rendered per-field line. */
function renderedTypeInterior(line: string): string {
  const open = line.indexOf("(");
  const close = line.lastIndexOf(")");
  if (open < 0 || close <= open) {
    throw new Error(`unmet precondition: rendered line carries no \`(<type>)\`: ${line}`);
  }
  return line.slice(open + 1, close);
}

/** The four bracket kinds a rendered type text can nest, opener to closer. */
const BRACKETS: Readonly<Record<string, string>> = {
  "{": "}",
  "[": "]",
  "(": ")",
  "<": ">",
};

/**
 * Split `text` on every occurrence of `separator` that sits at bracket depth
 * zero, so a nested inline object or a generic argument stays inside one piece.
 *
 * Depth is tracked per bracket kind and clamped at zero, mirroring bug 0238's
 * landed clamp: a close token matching no open frame of its kind is inert. The
 * carriers this file scores are exactly texts carrying such a token (`b > c`),
 * so an unclamped counter would mis-nest the split and score the wrong spans.
 */
function splitTopLevel(text: string, separator: string): readonly string[] {
  const pieces: string[] = [];
  const depth: Record<string, number> = { "{": 0, "[": 0, "(": 0, "<": 0 };
  const total = (): number => Object.values(depth).reduce((a, b) => a + b, 0);
  const closerOf: Record<string, string> = { "}": "{", "]": "[", ")": "(", ">": "<" };
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (BRACKETS[ch] !== undefined) {
      depth[ch] = (depth[ch] as number) + 1;
    } else if (closerOf[ch] !== undefined) {
      const opener = closerOf[ch] as string;
      depth[opener] = Math.max(0, (depth[opener] as number) - 1);
    } else if (total() === 0 && ch === separator) {
      pieces.push(text.slice(start, i));
      start = i + 1;
    }
  }
  pieces.push(text.slice(start));
  return pieces.map((piece) => piece.trim()).filter((piece) => piece.length > 0);
}

/**
 * A property tree: one key per declared entry, its value the nested tree for an
 * inline object entry and `null` for a leaf. Both the rendered text and the
 * lowered fragment are projected into this shape and compared, so a divergence
 * nested inside an entry is scored, not only a top-level one.
 */
type PropertyTree = { readonly [key: string]: PropertyTree | null };

/** True iff the text is a single brace-delimited inline object. */
function isInlineObject(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

/**
 * The property tree the rendered inline-object text denotes. Each top-level
 * comma segment contributes one key: the text left of its top-level `:`, or the
 * WHOLE segment when it carries none.
 *
 * Taking the whole segment is what makes the pairing discriminating. A segment
 * the lowering discarded (`b > c`) has no top-level colon; dropping it here
 * would make the pairing pass over exactly the text bug 0251 is about.
 */
function renderedTree(objectText: string): PropertyTree {
  const trimmed = objectText.trim();
  if (!isInlineObject(trimmed)) {
    throw new Error(
      `unmet precondition: rendered arm is not an inline object: ${objectText}`,
    );
  }
  const tree: Record<string, PropertyTree | null> = {};
  for (const segment of splitTopLevel(trimmed.slice(1, -1), ",")) {
    const parts = splitTopLevel(segment, ":");
    if (parts.length < 2) {
      tree[segment] = null;
      continue;
    }
    const value = parts.slice(1).join(":").trim();
    tree[parts[0] as string] = isInlineObject(value) ? renderedTree(value) : null;
  }
  return tree;
}

/** The property tree a lowered object fragment encodes, `$ref`s resolved. */
function loweredTree(schema: Fragment, fragment: Fragment): PropertyTree {
  const properties = fragment["properties"] as Record<string, Fragment> | undefined;
  const tree: Record<string, PropertyTree | null> = {};
  for (const [name, raw] of Object.entries(properties ?? {})) {
    const value = resolveRef(schema, raw);
    tree[name] = value["properties"] === undefined ? null : loweredTree(schema, value);
  }
  return tree;
}

/** The lowered schema of a one-field document, for `$ref` resolution. */
function loweredSchemaOf(declared: string): Fragment {
  const doc = parseDoc(docSource(declared), "b0251.theta");
  const schema = doc.frontmatter?.params?.loweredSchema;
  if (schema === undefined) {
    throw new Error(
      `unmet precondition: declared type \`${declared}\` must lower; ` +
        `diagnostics ${JSON.stringify(doc.diagnostics.map((d) => d.code))}`,
    );
  }
  return schema;
}

/** The rendered union arms of a `(<type>)` interior (one arm when no `|`). */
function renderedArms(interior: string): readonly string[] {
  return splitTopLevel(interior, "|");
}

// ============================================================================
// Cell 1 — divergence pairing: the rendered type must denote the lowered set
// ============================================================================

// Each row is a declared type that loads, registers and lowers at HEAD, paired
// with the rendered line bug 0251 §Fix pins for it. The lowered fragment of
// every row is byte-identical to the control's (cell 2), so the rendered line
// must be the control's too.
const CARRIERS: ReadonlyArray<readonly [declared: string, rendersPostFix: string]> = [
  ["{a: integer, b > c, m: integer}", "  p ({a: integer, m: integer}) required"],
  ["{a: integer, b > c > d, m: integer}", "  p ({a: integer, m: integer}) required"],
  ["{a: integer, b >, m: integer}", "  p ({a: integer, m: integer}) required"],
  [
    "{q: {a: integer, b > c, m: integer}, z: string}",
    "  p ({q: {a: integer, m: integer}, z: string}) required",
  ],
  ["{a: integer, b > c} | {m: integer}", "  p ({a: integer} | {m: integer}) required"],
];

describe("bug 0251 — rendered `<type>` denotes what the envelope schema encodes", () => {
  for (const [declared, rendersPostFix] of CARRIERS) {
    it(`declared \`${declared}\` renders the type its lowering encodes`, () => {
      expect(renderFieldLine(declared)).toBe(rendersPostFix);
    });

    it(`declared \`${declared}\` renders no entry the lowering dropped`, () => {
      const arms = renderedArms(renderedTypeInterior(renderFieldLine(declared)));
      const fragments = loweredFragmentsOfP(declared);
      const schema = loweredSchemaOf(declared);
      // The pairing is arm-by-arm and non-vacuous only if both sides have the
      // same arity: a rendered union of two arms cannot be scored against one
      // lowered fragment.
      expect(arms.length).toBe(fragments.length);
      for (const [index, arm] of arms.entries()) {
        const fragment = fragments[index] as Fragment;
        expect(renderedTree(arm)).toStrictEqual(loweredTree(schema, fragment));
        expect(Object.keys(renderedTree(arm))).toStrictEqual(fragment["required"]);
      }
    });
  }
});

// ============================================================================
// Cell 2 — the control, and a negative that proves the pairing discriminates
// ============================================================================

const CONTROL = "{a: integer, m: integer}";

describe("bug 0251 — the byte-neighbour control", () => {
  it("the control renders the line every carrier must render", () => {
    expect(renderFieldLine(CONTROL)).toBe("  p ({a: integer, m: integer}) required");
  });

  it("each carrier lowers to the control's fragment byte-identically", () => {
    const control = loweredFragmentsOfP(CONTROL);
    for (const [declared] of CARRIERS.slice(0, 3)) {
      expect(JSON.stringify(loweredFragmentsOfP(declared))).toBe(
        JSON.stringify(control),
      );
    }
  });

  it("a differently-shaped type renders a line the control's does not", () => {
    // Without this negative the pairing could be satisfied by a renderer that
    // emitted the control's line for every input.
    const line = renderFieldLine("{a: integer}");
    expect(line).toBe("  p ({a: integer}) required");
    expect(line).not.toBe(renderFieldLine(CONTROL));
  });
});

// ============================================================================
// Cell 3 — retired carriers: refused at load, so they reach no binder call
// ============================================================================

// Bug 0251 §Reproduction (a) rows a2–a4 were carriers when the report was
// filed. The colon-less-entry refusal has since landed, so they no longer load
// and no longer reach a prompt; these pins hold that landscape in place, since
// a regression to tolerance would silently re-open the divergence for them.
const RETIRED = [
  "{a: integer, bogus, m: integer}",
  "{a: integer, ) , m: integer}",
  "{a: integer, b ] c, m: integer}",
] as const;

describe("bug 0251 — retired carriers refuse at load", () => {
  for (const declared of RETIRED) {
    it(`declared \`${declared}\` refuses with ${MALFORMED_SCHEMA_FIELD}`, () => {
      const doc = parseDoc(docSource(declared), "b0251.theta");
      expect(doc.diagnostics.map((d) => d.code)).toContain(MALFORMED_SCHEMA_FIELD);
      expect(doc.frontmatter?.params?.fields).toBeUndefined();
      expect(doc.frontmatter?.params?.loweredSchema).toBeUndefined();
    });
  }
});

// ============================================================================
// Cell 4 — permissive lowering renders verbatim
// ============================================================================

// These shapes lower to the permissive `{}` — the schema forbids nothing, so
// there is no contract for the rendered text to contradict and bug 0251 §Fix
// leaves the declared text standing.
//
// `array<{a: b c, d e}>` is RE-VEHICLED here (bug 0256, the operator ruling's
// clause (iii), the bug 0165 re-vehicle precedent): under the ruling's
// OPTION 1 (resync-and-tolerate), `TypeParser.parseObject`'s field loop now
// resyncs past the missing entry separator instead of breaking, reaches the
// keyless entry `d e` bug 0244's landed refusal already judges, and the
// carrier REFUSES — it no longer lowers permissively, so it can no longer
// stand as this cell's subject. The replacement carrier,
// `array<{a: integer, b > c}>`, is measured (not merely argued) to still load
// under the same route: its stray `>` closes nothing (bug 0238's
// typed-opener-stack class), `skipMalformedEntry` stops at that depth-0 `>`
// without crossing a separator, so the loop breaks exactly as it always has
// and the interior still reports `[]` and still lowers `{}` — measured
// directly against the shipped `parseDoc` / `loweredFragmentsOfP` path.
// SUBJECT preserved (a permissive lowering leaves the declared type verbatim)
// and COUNT preserved (two cells); only the vehicle changed.
const PERMISSIVE = ["array<{a: integer, b > c}>", "array<{a: integer, b > c, m: integer}>"] as const;

describe("bug 0251 — a permissive lowering leaves the declared type verbatim", () => {
  for (const declared of PERMISSIVE) {
    it(`declared \`${declared}\` lowers permissively and renders verbatim`, () => {
      expect(loweredFragmentsOfP(declared)).toStrictEqual([{}]);
      expect(renderFieldLine(declared)).toBe(`  p (${declared}) required`);
    });
  }
});

// ============================================================================
// Cell 5 — the *Type display* normative reference table is identity
// ============================================================================

// docs/spec_topics/binder/binder-bypass-and-envelope.md:129 — the eight rows a
// conforming implementation must reproduce exactly. They are identity input for
// a render-seam projection and must not move.
const TYPE_DISPLAY_REFERENCE = [
  "string",
  "integer",
  "boolean",
  "Severity",
  "Author",
  "array<integer>",
  "string | null",
  "Cat | Dog",
] as const;

describe("bug 0251 — *Type display* reference renderings stay byte-exact", () => {
  for (const declared of TYPE_DISPLAY_REFERENCE) {
    it(`declared \`${declared}\` renders byte-identically`, () => {
      const field: BypassParamsField = {
        wireName: "field",
        type: declared,
        hasDefault: false,
      };
      expect(renderBinderParamLine(promptParamField(field))).toBe(
        `  field (${declared}) required`,
      );
    });
  }
});

// ============================================================================
// Cell 6 — the committed corpus renders unchanged
// ============================================================================

/** Every committed theta source, as repo-relative POSIX paths from the index. */
function committedThetaSources(): readonly string[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "*.theta", "*.thetalib"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "unmet precondition: the corpus sweep needs a working `git` executable " +
        `and a checkout at ${REPO_ROOT}; status=${String(result.status)} ` +
        `error=${result.error?.message ?? "none"} stderr=${result.stderr}`,
    );
  }
  return result.stdout.split("\0").filter((p) => p.length > 0).sort();
}

describe("bug 0251 — every committed `params:` type renders unchanged", () => {
  it("no committed field's rendered type differs from its declared text", () => {
    const paths = committedThetaSources();
    expect(paths.length).toBeGreaterThan(0);
    let swept = 0;
    for (const path of paths) {
      const bytes = readFileSync(join(REPO_ROOT, path));
      const doc = parseDoc(bytes.toString("utf8"), path);
      for (const field of doc.frontmatter?.params?.fields ?? []) {
        swept += 1;
        const line = renderBinderParamLine(promptParamField(field));
        expect(renderedTypeInterior(line), `${path} field ${field.wireName}`).toBe(
          field.type,
        );
      }
    }
    // A corpus that yielded no `params:` field at all would pass the loop
    // vacuously, which would report success over nothing verified.
    expect(swept).toBeGreaterThan(0);
  });
});

// ============================================================================
// Cell 7 — nested zero-accepted: the parent keeps the author's bytes
// ============================================================================

// `{q: {b > c}, z: string}` — the inner group's every entry is rejected, so the
// lowering emits `q` as the PERMISSIVE `{}` (measured: `required ["q","z"]`,
// `q: {}`). An empty fragment forbids nothing, so there is no contract for the
// inner text to contradict and the projection must report NO change upward:
// the parent is not rebuilt and the rendered line carries the declared bytes.
const NESTED_ZERO_ACCEPTED = "{q: {b > c}, z: string}";

describe("bug 0251 — a nested zero-accepted group leaves the parent verbatim", () => {
  it("renders the declared text byte-identically", () => {
    expect(renderFieldLine(NESTED_ZERO_ACCEPTED)).toBe(
      `  p (${NESTED_ZERO_ACCEPTED}) required`,
    );
  });

  it("lowers `q` to the permissive `{}` beside a typed `z`", () => {
    // Without this half the cell would pass over a lowering that had dropped
    // `q` entirely, which is a different landscape from the one it pins.
    const [fragment] = loweredFragmentsOfP(NESTED_ZERO_ACCEPTED);
    expect(fragment).toStrictEqual({
      type: "object",
      properties: { q: {}, z: { type: "string" } },
      required: ["q", "z"],
      additionalProperties: false,
    });
  });
});

// ============================================================================
// Cell 8 — the PRODUCTION seam: the real dispatch's own `systemPrompt`
// ============================================================================

// Cells 1–7 witness `projectRenderedParamType` through the mirror above. This
// cell witnesses production's USE of it: it drives the real
// `ProductionThetaProducer.runBinder()` with a mocked pi-ai `complete()` (the
// e2e-s5 pattern of tests/binder-forced-tool-dispatch.test.ts) over a
// carrier-type theta and reads the `Parameters:` line off the captured
// `context.systemPrompt`. Reverting `binderPromptParamField`'s projection call
// (src/extension/production-theta-producer.ts) reds this cell and nothing else
// offline, which is why it exists.

// The extractor of the DIAG-2 corpus gate reads any `theta/<...>` span in a
// test file as an asserted diagnostic code, so the fixture path deliberately
// carries no `theta/` segment.
const DISPATCH_SOURCE_PATH = "/fixtures/b0251-dispatch.theta";
const DISPATCH_ARGS = "a is 17 and m is 23";

/** The carrier-type theta the production dispatch is driven over. */
const DISPATCH_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  p: '{a: integer, b > c, m: integer}'",
  "---",
  "@`bind ${p.a}`",
  "",
].join("\n");

/** A binder-model double: `bind_model:` matches bare references on `Model.id`. */
const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

/**
 * A runtime-root double sufficient for one binder pass: noop checkpoint,
 * deterministic ids, wall-clock zero, the real AJV validator, and an in-memory
 * fs resolving the one fixture source. An unregistered path REJECTS rather than
 * reading empty, so a fixture wiring slip cannot read as a pass.
 */
function dispatchRoot(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => "inv-1",
      newToolCallId: (): string => "tc-1",
    },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> =>
        path === DISPATCH_SOURCE_PATH
          ? Promise.resolve(new TextEncoder().encode(DISPATCH_THETA))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`)),
    },
  } as unknown as RuntimeRoot;
}

/** The composition input for the carrier-type fixture, parsed cleanly. */
function dispatchInput(): ThetaCompositionInput {
  const doc = parseDoc(DISPATCH_THETA, DISPATCH_SOURCE_PATH);
  const errorCodes = doc.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
  if (errorCodes.length > 0 || doc.frontmatter === null) {
    throw new Error(
      `unmet precondition: the carrier-type theta must parse cleanly before the ` +
        `production dispatch is driven; errors ${JSON.stringify(errorCodes)}, ` +
        `frontmatter ${doc.frontmatter === null ? "absent" : "present"}`,
    );
  }
  return {
    slashName: "b0251",
    sourcePath: DISPATCH_SOURCE_PATH,
    frontmatter: doc.frontmatter,
    body: doc.body,
    binderModel: "binder-model",
  };
}

/** The `context.systemPrompt` of the captured binder call at `index`. */
function capturedSystemPrompt(index: number): string {
  const call = scripted.calls[index];
  if (call === undefined) {
    throw new Error(
      `unmet precondition: the production dispatch must issue a binder ` +
        `complete() call at index ${index}; captured ${String(scripted.calls.length)}`,
    );
  }
  const prompt = (call.context as { readonly systemPrompt?: unknown }).systemPrompt;
  if (typeof prompt !== "string") {
    throw new Error(
      "unmet precondition: the captured binder call must carry a string " +
        "context.systemPrompt for the Parameters line to be readable",
    );
  }
  return prompt;
}

beforeEach(() => {
  scripted.reply = undefined;
  scripted.calls = [];
});

describe("bug 0251 — the production dispatch's own Parameters line is projected", () => {
  it("renders the projected line in the real systemPrompt", async () => {
    // A needs_info envelope terminates the pass without the ok-arm merge; the
    // call is still issued and captured, which is all this cell reads.
    scripted.reply = {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tc-1",
          name: "unmatched-tool",
          arguments: { envelope: { kind: "needs_info", message: "which values?" } },
        },
      ],
      stopReason: "toolUse",
      timestamp: 0,
    };
    const pi = { sendMessage: (): void => {} } as unknown as ExtensionAPI;
    const modelRegistry = {
      getAvailable: (): readonly unknown[] => [BINDER_MODEL],
      getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
    } as unknown as ModelRegistry;
    const deps = createProductionProducerDeps({ pi, root: dispatchRoot(), modelRegistry });

    await deps.runBinder({
      theta: dispatchInput(),
      args: DISPATCH_ARGS,
      ctx: {} as unknown as ExtensionCommandContext,
    });

    const lines = capturedSystemPrompt(0).split("\n");
    expect(lines).toContain("Parameters:");
    expect(lines).toContain("  p ({a: integer, m: integer}) required");
    // The tolerated segment must reach the provider nowhere in the prompt.
    expect(capturedSystemPrompt(0)).not.toContain("b > c");
  });
});
