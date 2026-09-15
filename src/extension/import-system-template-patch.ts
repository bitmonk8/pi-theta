// Bug 0422/0423/0450 — LOAD-phase `system:` template revalidation and sidecar
// carry, split out of `checkThetaImports` (import-static-checks.ts). The
// PARSE-phase `system:` check (system-interpolation.ts) admits any `.Ident`
// step off an imported schema opaquely, because the sync parser cannot see
// the `.thetalib`'s fields; `patchSystemTemplateForImports` re-walks each
// already-parsed template PATH part whose head names a directly-imported
// schema or enum against the LOAD-phase-resolved field set, refusing a step
// that names no real field and, for a bare param over a schema carrying a
// real wire rename, replacing the part's `InterpolationType` so the render
// applies the wire-name translation. Returns a patched copy of the template's
// parts (or `undefined` when nothing needed patching) and pushes any refusal
// diagnostics into the caller's `diagnostics` array — the same division of
// labour `checkThetaImports` ran inline before this split.

import type { Diagnostic, SourceRange } from "../diagnostics/diagnostic";
import { collectBodyTypes, type Stmt } from "../parser/theta-document";
import { encodePointerSegment } from "../parser/schema-lowering";
import {
  LOAD_SYSTEM_INTERP_BAD_FIELD_CODE,
  systemInterpBadFieldMessage,
  toInterpolationType,
  type SystemParamType,
  type SystemTemplatePart,
} from "../parser/system-interpolation";
import type { ThetaCompositionInput } from "./theta-composition-producer";

/**
 * Whether a directly-imported schema's OWN root object carries at least one
 * wire rename (bug 0445): the load-phase static-container patch fires only
 * then — the SAME root-def-only condition the bug-0423 bare-root patch uses, so
 * the bare, `array<Import>`, and import-typed-body-field positions agree (a
 * rename-free or transitive-only-renamed import stays theta-side at every
 * position — byte-identity by absence, never a bare-vs-container split).
 */
function importedRootHasWireRename(
  shape: SystemParamType,
): shape is Extract<SystemParamType, { kind: "object" }> {
  return (
    shape.kind === "object" &&
    shape.rootDef !== undefined &&
    (shape.sidecars?.get(shape.rootDef)?.wireNames.length ?? 0) > 0
  );
}

/**
 * Build the bug 0422 route (a) load-phase refusal for a walked-off imported
 * field: same message text as the parse-phase sibling
 * (`systemInterpBadFieldMessage`, DIAG-4 — the two codes name the same
 * authoring mistake at two phases, so sharing the message-string producer is
 * an implementation reuse, not a registry violation; each code still carries
 * its own *Message* cell in its own registry row), Located (file + range) when
 * `input.frontmatter.systemRange` was threaded through from the parse pass,
 * file-only otherwise (the range genuinely being unavailable never happens for
 * a theta whose `system:` produced a template, but the fallback keeps this
 * total rather than assuming the invariant).
 */
function loadSystemInterpBadFieldDiagnostic(
  sourceFile: string,
  range: SourceRange | undefined,
  field: string,
  path: string,
): Diagnostic {
  return {
    severity: "error",
    code: LOAD_SYSTEM_INTERP_BAD_FIELD_CODE,
    file: sourceFile,
    ...(range !== undefined ? { range } : {}),
    message: systemInterpBadFieldMessage(field, path),
  };
}

export function patchSystemTemplateForImports(
  input: ThetaCompositionInput,
  importedSchemaShapes: ReadonlyMap<string, SystemParamType>,
  importedEnums: ReadonlyMap<string, readonly string[]>,
  diagnostics: Diagnostic[],
): SystemTemplatePart[] | undefined {
  // Guaranteed by the caller: `checkThetaImports` returns before ever reaching
  // this call when `input.sourcePath` is undefined, so this restates (never
  // trips) that invariant to narrow `input.sourcePath` to `string` for the
  // rest of this function, the same way it narrowed inline before this split.
  if (input.sourcePath === undefined) {
    return undefined;
  }

  // Bug 0422 route (a) — LOAD-phase `system:` template revalidation, joined by
  // bug 0423 route (a) — LOAD-phase sidecar carry (same pass, same walk: 0423
  // needs the identical head resolution 0422 already performs to find a bare
  // param's imported-schema shape). The PARSE-phase `system:` check
  // (system-interpolation.ts) admits any `.Ident` step off an imported schema
  // opaquely, because the sync parser cannot see the `.thetalib`'s fields;
  // `importedSchemaShapes` above now holds the real field set — fields AND
  // wire-rename sidecars/rootDef (`toSystemParamType`'s schema arm already
  // attaches them via `buildOutboundSidecars`) — for every directly-imported
  // schema this theta's `params:` names. Re-walk each already-parsed template
  // PATH part whose head resolves to one of those schemas — not a re-parse, a
  // re-walk of the SAME segments `checkSystemInterpolation` already validated
  // — and refuse a step that names no real field with the newly-minted
  // load-phase sibling code (0422). A BARE `${author}` (no further segments)
  // has nothing to re-walk for 0422's refusal, but IS exactly 0423's scope:
  // its terminal shape's `sidecars`/`rootDef` are converted to a real
  // `InterpolationType` and written into a PATCHED COPY of this part
  // (`patchedParts`, built lazily so a theta with no patchable part returns
  // `patchedSystemTemplate: undefined` — byte-identical to before this fix).
  // A `discriminated-union` terminal is also `valueDriven: true` but its
  // head's `typeSource` never matches an entry in `importedSchemaShapes`
  // (only a schema-kind import populates it), so it is left untouched here —
  // out of this fix's scope (bug 0425's ground).
  // Bug 0450: a theta importing ONLY an enum (no imported schema) has an
  // EMPTY `importedSchemaShapes`, so the guard below must also open on
  // `importedEnums` or the enum-head arm just past the typeSource lookup
  // never runs and the class stays unjudged (the defect this fix closes).
  let patchedParts: SystemTemplatePart[] | undefined;
  if (
    input.frontmatter?.system !== undefined &&
    (importedSchemaShapes.size > 0 || importedEnums.size > 0)
  ) {
    const systemSourceFile = input.sourcePath;
    const systemRange = input.frontmatter.systemRange;
    const paramTypeSourceByName = new Map(
      (input.frontmatter.params?.fields ?? []).map((field) => [field.wireName, field.type]),
    );
    const originalParts = input.frontmatter.system.parts;
    patchedParts = patchValueDrivenParts(
      systemSourceFile,
      systemRange,
      paramTypeSourceByName,
      originalParts,
      importedSchemaShapes,
      importedEnums,
      diagnostics,
      patchedParts,
    );
    patchedParts = patchStaticContainerParts(
      input.body.statements,
      systemSourceFile,
      paramTypeSourceByName,
      originalParts,
      importedSchemaShapes,
      patchedParts,
    );
  }

  return patchedParts;
}

/**
 * Bug 0422 route (a) — LOAD-phase `system:` template revalidation, joined by
 * bug 0423 route (a) — LOAD-phase sidecar carry and bug 0450's enum-only
 * admission (`patchSystemTemplateForImports`'s header comment above the call
 * site carries the full rationale for this walk and the guard that gates it).
 * Re-walks each already-parsed template PATH part whose head resolves to a
 * directly-imported schema or enum — the SAME segments
 * `checkSystemInterpolation` already validated at parse, not a re-parse —
 * refusing a step that names no real field and, for a bare param over a
 * schema carrying a real wire rename, replacing the part's `InterpolationType`
 * in a lazily-built copy of `originalParts`. Returns the patched-parts array
 * threaded in by the caller (built on first use, so a theta with nothing to
 * patch returns it unchanged, possibly still `undefined`).
 */
function patchValueDrivenParts(
  systemSourceFile: string,
  systemRange: SourceRange | undefined,
  paramTypeSourceByName: ReadonlyMap<string, string>,
  originalParts: readonly SystemTemplatePart[],
  importedSchemaShapes: ReadonlyMap<string, SystemParamType>,
  importedEnums: ReadonlyMap<string, readonly string[]>,
  diagnostics: Diagnostic[],
  patchedParts: SystemTemplatePart[] | undefined,
): SystemTemplatePart[] | undefined {
  for (let partIndex = 0; partIndex < originalParts.length; partIndex++) {
    const part = originalParts[partIndex] as SystemTemplatePart;
    if (part.kind !== "path" || part.valueDriven !== true) {
      continue;
    }
    const head = part.segments[0] as string;
    const typeSource = paramTypeSourceByName.get(head);
    if (typeSource === undefined) {
      continue;
    }
    // Bug 0450: a directly-imported ENUM terminates the path the same way
    // its same-file twin does (frontmatter-fields-b-and-templates.md:42 —
    // an enum is not an object schema, so EVERY `.Ident` step refuses, valid
    // variant names included). `importedEnums` never enters
    // `importedSchemaShapes` (that map is schema-kind only), so this arm
    // must run BEFORE the schema-shape lookup below or the enum head is
    // silently skipped exactly as before this fix. Direct declarations
    // only, mirroring the schema class's chain withhold (bug 0422/0430): a
    // re-export-chain enum never reaches `importedEnums`.
    if (importedEnums.has(typeSource.trim())) {
      if (part.segments.length > 1) {
        diagnostics.push(
          loadSystemInterpBadFieldDiagnostic(
            systemSourceFile,
            systemRange,
            part.segments[1] as string,
            part.segments[0] as string,
          ),
        );
      }
      // A bare `${sev}` (no further segments) has no `.Ident` step to
      // refuse — bare `${param}` is always allowed
      // (frontmatter-fields-b-and-templates.md:42, §Non-goal).
      continue;
    }
    const shape = importedSchemaShapes.get(typeSource.trim());
    if (shape === undefined) {
      continue;
    }
    // Bug 0422 F2: a non-object head shape is an imported alias-of-object /
    // head-only schema, whose `.field` steps this load re-walk cannot judge
    // (its true field set is not built here). Leave the head admitted — its
    // pre-fix load behaviour — and defer its classification to bug 0427's
    // arm dispatch in the shared `toSystemParamType`, which propagates here
    // automatically once it lands. Only a genuinely-known object schema
    // whose fields are in hand enters the walk (or 0423's patch, below).
    if (shape.kind !== "object") {
      continue;
    }
    // Bug 0423 route (a): a BARE param (no further segments) is the root
    // object terminal — the only case this fix patches (nested renames are
    // bug 0424's ground). Its rename map is already in `shape` (the direct
    // schema match built above), so converting it to an `InterpolationType`
    // and dropping `valueDriven` is enough to route the render through the
    // canonical object row's wire-name translation instead of the
    // sidecar-less value-driven row.
    if (part.segments.length === 1) {
      // Bug 0423 F3/F4: patch ONLY a schema carrying at least one ACTUAL
      // wire rename — its outbound sidecar records a `wireNames` entry, and
      // `buildSidecar` records one per field whose wire name differs from
      // its theta name (a rename-free schema's sidecar `wireNames` is
      // empty). A rename-free imported schema is left value-driven, so its
      // bare `${param}` renders byte-identically for EVERY value kind:
      // both a conforming object AND an out-of-schema non-object value
      // (a bound `"hello"`, an array element) keep today's bytes, because
      // the wire-name-translating object row would otherwise re-serialise
      // an out-of-schema value through the schema's static shape. So
      // byte-identity for the rename-free class holds by ABSENCE: the part
      // is not patched at all, and `patchedSystemTemplate` stays absent
      // when no renamed-schema bare param exists.
      const rootDef = shape.rootDef;
      const hasWireRename =
        rootDef !== undefined && (shape.sidecars?.get(rootDef)?.wireNames.length ?? 0) > 0;
      if (!hasWireRename) {
        continue;
      }
      patchedParts = patchedParts ?? [...originalParts];
      patchedParts[partIndex] = {
        kind: "path",
        segments: part.segments,
        type: toInterpolationType(shape),
      };
      continue; // nothing further to walk on a bare param (0422's own loop below is a no-op here too).
    }
    let current: SystemParamType = shape;
    for (let s = 1; s < part.segments.length; s++) {
      const field = part.segments[s] as string;
      if (current.kind === "opaque-object") {
        // Bug 0422 F1: the walk reached an intermediate whose fields the
        // shape builder did not resolve (a lib schema field typed by the
        // LIB's own import stays `opaque-object`). Mirror the parse-phase
        // sibling's `opaque-object` arm (system-interpolation.ts, which
        // `continue`s): STOP judging and admit the remainder — the nested
        // lib's fields are not in hand, so a deeper step cannot be refused.
        break;
      }
      if (current.kind !== "object") {
        // A real declared scalar / array / union field followed by a further
        // `.step` is a genuine walked-off path (bug doc Summary consequence
        // 2) — refuse it, matching the parse-phase sibling's non-object arm.
        diagnostics.push(
          loadSystemInterpBadFieldDiagnostic(
            systemSourceFile,
            systemRange,
            field,
            part.segments.slice(0, s).join("."),
          ),
        );
        break;
      }
      const next = current.fields.get(field);
      if (next === undefined) {
        diagnostics.push(
          loadSystemInterpBadFieldDiagnostic(
            systemSourceFile,
            systemRange,
            field,
            part.segments.slice(0, s).join("."),
          ),
        );
        break;
      }
      current = next;
    }
  }
  return patchedParts;
}

/**
 * Bug 0445 route (a): the STATIC container positions the bug-0423 bare-root
 * valueDriven patch above excludes — an `array<Import>` param (static array
 * row, no sidecars at parse because imports are name-only) and a BODY schema
 * whose field is typed by an import (the imported field drops its `refTarget`
 * at parse). The LIB-BUILT sidecar fragment for each direct import already
 * sits in `importedSchemaShapes`, built over the LIB's OWN namespace — so its
 * internal `$ref`s resolve to the lib's schemas and are immune to an app
 * schema of the same name (re-deriving in the app namespace would render a
 * WRONG wire name). Carry that fragment: the array element takes the import's
 * own root sidecar (the bug-0407 `array<Schema>` element shape), and a body
 * schema's import-typed field gains a `refTarget` to the import's def plus the
 * import's fragment merged into the enclosing map under its own def name (the
 * per-`$defs` merge is collision-safe, bug 0424 F2 discipline). A rename-free
 * import contributes no wire name, so its part is left unpatched — byte-
 * identity by absence (the bug-0423 F3/F4 gate, one position over).
 */
function patchStaticContainerParts(
  bodyStatements: readonly Stmt[],
  systemSourceFile: string,
  paramTypeSourceByName: ReadonlyMap<string, string>,
  originalParts: readonly SystemTemplatePart[],
  importedSchemaShapes: ReadonlyMap<string, SystemParamType>,
  patchedParts: SystemTemplatePart[] | undefined,
): SystemTemplatePart[] | undefined {
  const appBodyTypes = collectBodyTypes(bodyStatements, systemSourceFile).bodyTypes;
  for (let partIndex = 0; partIndex < originalParts.length; partIndex++) {
    const part = originalParts[partIndex] as SystemTemplatePart;
    if (part.kind !== "path" || part.valueDriven === true || part.segments.length !== 1) {
      continue;
    }
    const typeSource = paramTypeSourceByName.get(part.segments[0] as string)?.trim();
    if (typeSource === undefined) {
      continue;
    }
    // Array face: `array<Import>` — carry the import's own sidecars/rootDef as
    // the array element shape (bug 0407's `array<Schema>` element carriage).
    if (part.type.kind === "array") {
      const element = /^array<(.+)>$/.exec(typeSource)?.[1]?.trim();
      const imp = element !== undefined ? importedSchemaShapes.get(element) : undefined;
      if (imp !== undefined && importedRootHasWireRename(imp) && imp.rootDef !== undefined) {
        patchedParts = patchedParts ?? [...originalParts];
        patchedParts[partIndex] = {
          kind: "path",
          segments: part.segments,
          type: {
            kind: "array",
            ...(imp.sidecars !== undefined ? { sidecars: imp.sidecars } : {}),
            rootDef: imp.rootDef,
          },
        };
      }
      continue;
    }
    // Nested face: a body schema wrapping an import. Merge each import-typed
    // field's LIB-BUILT fragment into the enclosing sidecar map and add the
    // missing `refTarget`, across every body-schema def the parse-time map
    // already carries (so a body chain reaching the imported field is covered).
    if (
      part.type.kind !== "object" ||
      part.type.sidecars === undefined ||
      part.type.rootDef === undefined
    ) {
      continue;
    }
    const merged = new Map(part.type.sidecars);
    let patchedAnyField = false;
    for (const [defName, sidecar] of part.type.sidecars) {
      const fields = appBodyTypes.schemas.get(defName);
      if (fields === undefined) {
        continue;
      }
      const refTargets = sidecar.refTargets !== undefined ? [...sidecar.refTargets] : [];
      let defPatched = false;
      for (const field of fields) {
        const imp = importedSchemaShapes.get(field.typeSource.trim());
        if (
          imp === undefined ||
          imp.kind !== "object" ||
          imp.rootDef === undefined ||
          imp.sidecars === undefined ||
          !importedRootHasWireRename(imp)
        ) {
          continue;
        }
        const pointer = `/properties/${encodePointerSegment(field.wireName ?? field.name)}`;
        if (refTargets.some((rt) => rt.pointer === pointer)) {
          continue;
        }
        // A flat per-`$defs` map cannot host two namespaces: if any def name in
        // this import's fragment already names a DIFFERENT fragment in the map
        // (an app body schema, or another import's same-named internal helper),
        // merging would make this import's internal `$ref` resolve into the
        // other namespace and render a WRONG wire name. Decline to translate
        // this field then — it renders theta-side (never a wrong wire name; the
        // collision case is a recorded residual). Reference identity holds for
        // the same import's own fragment reused across two fields, so that is
        // not a collision.
        let collides = false;
        for (const [impDef, impSidecar] of imp.sidecars) {
          const existing = merged.get(impDef);
          if (existing !== undefined && existing !== impSidecar) {
            collides = true;
            break;
          }
        }
        if (collides) {
          continue;
        }
        refTargets.push({ pointer, defName: imp.rootDef });
        for (const [impDef, impSidecar] of imp.sidecars) {
          if (!merged.has(impDef)) {
            merged.set(impDef, impSidecar);
          }
        }
        defPatched = true;
        patchedAnyField = true;
      }
      if (defPatched) {
        merged.set(defName, { ...sidecar, refTargets });
      }
    }
    if (patchedAnyField) {
      patchedParts = patchedParts ?? [...originalParts];
      patchedParts[partIndex] = {
        kind: "path",
        segments: part.segments,
        type: { kind: "object", sidecars: merged, rootDef: part.type.rootDef },
      };
    }
  }
  return patchedParts;
}
