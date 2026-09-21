// System-interpolation parameter classification and outbound wire-name sidecars.

import type { FrontmatterBodyTypes } from "./frontmatter";
import { splitTopLevel, isSingleEnclosingBraceGroup, topLevelColon } from "./params";
import type { SystemParamType, SystemUnionArm } from "./system-interpolation";
import {
  buildSidecar,
  encodePointerSegment,
  type SchemaSidecar,
  type SidecarFieldInput,
} from "./schema-lowering";

/**
 * The body OBJECT-schema name a `typeSource` resolves to — directly, as the
 * element of `array<...>` (recursively), or through a SINGLE-arm alias chain
 * (`schema A = Cat`, and transitively `schema A2 = A`, `schema L = array<Cat>`)
 * — the root a `system:` outbound sidecar walk needs to start from. An alias is
 * the type it names (schemas.md:60), so the walk must resolve past it; before
 * bug 0442 an alias name was returned verbatim and then refused by
 * `buildOutboundSidecars` (`fields === undefined`), leaving the aliased
 * schema's renames theta-side at the array-element and schema-field positions.
 * `undefined` when the source resolves to no object schema: an inline object, a
 * primitive, a MULTI-arm (union) alias (bug 0443's ground), an unresolved atom,
 * or an imported symbol. `seen` guards a pure-alias cycle (refused at
 * declaration by `type-alias-cycle`; a stack-overflow backstop only).
 */
function namedSchemaOf(
  typeSource: string | undefined,
  bodyTypes: FrontmatterBodyTypes,
  seen: ReadonlySet<string> = new Set(),
): string | undefined {
  if (typeSource === undefined) {
    return undefined;
  }
  const s = typeSource.trim();
  if (bodyTypes.schemas.has(s)) {
    if (bodyTypes.schemas.get(s) !== undefined) {
      return s;
    }
    // An alias/head-only declaration (`fields === undefined`): chase a
    // single-arm alias RHS to the object schema it names. A multi-arm (union)
    // RHS names no single object root (bug 0443), and a re-entered alias is a
    // cycle backstop — both return `undefined`.
    if (seen.has(s)) {
      return undefined;
    }
    const arms = bodyTypes.aliasArms.get(s);
    if (arms === undefined || arms.length !== 1) {
      return undefined;
    }
    return namedSchemaOf(arms[0], bodyTypes, new Set([...seen, s]));
  }
  const arrayMatch = /^array<(.+)>$/.exec(s);
  if (arrayMatch !== null) {
    return namedSchemaOf(arrayMatch[1], bodyTypes, seen);
  }
  return undefined;
}

/**
 * Build the outbound wire-name-translation sidecars for a body-schema
 * `system:` render (bug 0407, extended by bug 0424): the sidecar path
 * (`translateOutbound`) was producer-less/dead before bug 0407 (bug 0120).
 * Builds a REAL per-`$defs` sidecar map by a transitive BFS over every body
 * schema reachable from `rootSchema` through a field's own type (directly, or
 * as an `array<Schema>` element) — each schema-typed field's input carries its
 * `$ref` target (the referenced schema's name), so `translateOutbound`'s
 * `$ref` recursion (`wire-translation.ts`) can descend past depth 0.
 * `rootSchema` names an object body schema: callers resolve an alias /
 * `array<...>` source through `namedSchemaOf`, or test the body's presence
 * inline, before reaching here.
 *
 * Lookup stays per-`$defs` (keyed by schema name), never one flat wire-key
 * namespace, so the round-1 F2 collision (two same-spelled wire names at
 * different depths resolving the wrong schema's rename map) cannot recur: a
 * position recurses through its OWN field's `refTarget`, never through a wire
 * name matched against an unrelated schema. A field whose type names an object
 * schema (directly, through an alias chain, or as an `array<...>` element) is
 * enqueued; a field whose type is an inline object embedding a schema
 * (`x: {y: Inner}`) is descended into a minted intermediate `$defs` so the
 * embedded schema's own renames still translate (bug 0441). `reserved`
 * accumulates every minted inline `$defs` name across the whole construction
 * so sibling/nested inline layers never share a key.
 *
 * `building` is the set of schema names whose sidecar is already being
 * constructed up the call stack. The BFS `seen` set only guards name→name
 * cycles WITHIN one call; an inline layer re-enters this function through
 * `refTargetInto` with a fresh BFS, so a schema that references itself through
 * an inline-object field (`schema Node { next: {n: Node} }`) would recurse
 * unbounded without it. `refTargetInto` skips re-entering a name already in
 * `building`: that schema's sidecar is produced by the in-progress call up the
 * stack and merges into the single top-level map before the render reads it,
 * so recording the `$ref` name alone is sufficient (a stack-overflow backstop
 * for a legal recursive shape, mirroring `namedSchemaOf`'s alias `seen`).
 */
function buildOutboundSidecars(
  rootSchema: string,
  bodyTypes: FrontmatterBodyTypes,
  reserved: Set<string> = new Set(),
  building: Set<string> = new Set(),
): { readonly sidecars: ReadonlyMap<string, SchemaSidecar>; readonly rootDef: string } {
  const sidecars = new Map<string, SchemaSidecar>();
  const seen = new Set<string>([rootSchema]);
  const queue: string[] = [rootSchema];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    building.add(name);
    const fields = bodyTypes.schemas.get(name);
    if (fields === undefined) {
      continue;
    }
    const inputs: SidecarFieldInput[] = fields.map((f) => {
      const wire = f.wireName ?? f.name;
      // A field's type names an object schema (directly, through an alias
      // chain, or as an `array<...>` element): record its `$ref` target and
      // enqueue it. An inline-object type source (`x: {y: Inner}`) names no
      // single schema, so descend it into a minted intermediate `$defs` whose
      // schema-typed fields carry their own `$ref` targets (bug 0441).
      let refTarget = namedSchemaOf(f.typeSource, bodyTypes);
      if (refTarget !== undefined) {
        if (!seen.has(refTarget)) {
          seen.add(refTarget);
          queue.push(refTarget);
        }
      } else if (f.typeSource !== undefined && isSingleEnclosingBraceGroup(f.typeSource.trim())) {
        const inline = buildInlineSidecars(f.typeSource.trim(), bodyTypes, reserved, building);
        for (const [defName, sidecar] of inline.sidecars) {
          sidecars.set(defName, sidecar);
        }
        refTarget = inline.rootDef;
      }
      return {
        thetaName: f.name,
        ...(f.wireName !== undefined ? { wireName: f.wireName } : {}),
        pointer: `/properties/${encodePointerSegment(wire)}`,
        type: { kind: "other" },
        ...(refTarget !== undefined ? { refTarget } : {}),
      };
    });
    sidecars.set(
      name,
      buildSidecar(
        inputs,
        inputs.map((i) => i.thetaName),
      ),
    );
  }
  return { sidecars, rootDef: rootSchema };
}

/**
 * Resolve one field/element type source to its outbound `$ref` target,
 * merging every sidecar the target needs into `sidecars` (bug 0441). A source
 * naming a body object schema (directly, through an alias chain, or as an
 * `array<...>` element) merges that schema's transitive sidecars and returns
 * its name; an inline-object source descends into a minted intermediate
 * `$defs` (`buildInlineSidecars`); anything else returns `undefined` (no hop).
 * `reserved` threads the minted-name accumulator so inline mints stay globally
 * unique across the construction; `building` guards a schema that is reachable
 * from itself through an inline layer — a name already under construction up
 * the stack is recorded as a `$ref` without re-entering `buildOutboundSidecars`
 * (its sidecar merges into the top-level map from the in-progress call).
 */
function refTargetInto(
  typeSource: string,
  bodyTypes: FrontmatterBodyTypes,
  sidecars: Map<string, SchemaSidecar>,
  reserved: Set<string>,
  building: Set<string>,
): string | undefined {
  const named = namedSchemaOf(typeSource, bodyTypes);
  if (named !== undefined) {
    if (building.has(named)) {
      return named;
    }
    const nested = buildOutboundSidecars(named, bodyTypes, reserved, building);
    for (const [defName, sidecar] of nested.sidecars) {
      sidecars.set(defName, sidecar);
    }
    return named;
  }
  if (isSingleEnclosingBraceGroup(typeSource.trim())) {
    const inline = buildInlineSidecars(typeSource.trim(), bodyTypes, reserved, building);
    for (const [defName, sidecar] of inline.sidecars) {
      sidecars.set(defName, sidecar);
    }
    return inline.rootDef;
  }
  return undefined;
}

/**
 * Build the outbound sidecars for an inline-object type source (`{y: Inner}`)
 * used at a container position that carries sidecars (bug 0441): mint a
 * collision-free intermediate `$defs` name for the inline layer and emit a
 * sidecar whose schema-typed fields carry their real `$ref` targets, so the
 * runtime `$ref` recursion descends past the inline wrapper to the embedded
 * schema's own renames. An inline object carries no `as` renames of its own,
 * so its fields contribute only `$ref` hops, never wire-name entries. The
 * minted name cannot collide with an author schema (those are capitalised;
 * `__inline*` is not) but `reserved` keeps sibling/nested inline mints distinct
 * from each other, so no minted sidecar clobbers another in the per-`$defs`
 * map.
 */
function buildInlineSidecars(
  braceSource: string,
  bodyTypes: FrontmatterBodyTypes,
  reserved: Set<string>,
  building: Set<string>,
): { readonly sidecars: ReadonlyMap<string, SchemaSidecar>; readonly rootDef: string } {
  const sidecars = new Map<string, SchemaSidecar>();
  let rootDef = "__inline";
  while (bodyTypes.schemas.has(rootDef) || reserved.has(rootDef)) {
    rootDef = `${rootDef}_`;
  }
  reserved.add(rootDef);
  const inputs: SidecarFieldInput[] = [];
  for (const entry of splitTopLevel(braceSource.slice(1, -1), ",", "angle-and-brace")) {
    const colon = topLevelColon(entry);
    if (colon < 0) {
      continue;
    }
    const fieldName = entry.slice(0, colon).trim();
    const fieldType = entry.slice(colon + 1).trim();
    if (fieldName.length === 0 || fieldType.length === 0) {
      continue;
    }
    const refTarget = refTargetInto(fieldType, bodyTypes, sidecars, reserved, building);
    inputs.push({
      thetaName: fieldName,
      pointer: `/properties/${encodePointerSegment(fieldName)}`,
      type: { kind: "other" },
      ...(refTarget !== undefined ? { refTarget } : {}),
    });
  }
  sidecars.set(
    rootDef,
    buildSidecar(
      inputs,
      inputs.map((i) => i.thetaName),
    ),
  );
  return { sidecars, rootDef };
}

/**
 * Parse an inline object type's own field set into a `SystemParamType`
 * (bug 0406 (i)): `s` is the flow-mapping source (`{name: string, role: string}`)
 * `isSingleEnclosingBraceGroup` already gated. Mirrors `hoistInlineObjectType`'s
 * accept/reject split (params.ts) so the `system:` field set matches the
 * lowering's: a top-level entry with no colon, or an empty name / type either
 * side of it, is skipped rather than refused — the lowering's own diagnostics
 * cover a malformed entry; this seam only needs to know which fields resolve.
 * An inline object type carries no `as` renames of its own, but a FIELD of one
 * can name a body schema (`{inner: Inner}`) or embed a further inline object
 * that names one (`{x: {y: Inner}}`) whose own renames still need to translate
 * on a bare render (bug 0424, bug 0441) — so each such field collects a
 * root-position `$ref` input plus that target's transitive sidecars via
 * `refTargetInto`, merged under minted `$defs` names (no author schema is keyed
 * `__inline*`, and `reserved` keeps the root mint distinct from any nested
 * inline mint). A purely scalar inline object (no schema-hopping field)
 * produces no sidecars, byte-identical to the pre-fix shape.
 */
function inlineObjectType(
  s: string,
  bodyTypes: FrontmatterBodyTypes | undefined,
  resolving: Map<string, SystemParamType>,
): SystemParamType {
  const interior = s.slice(1, -1);
  const map = new Map<string, SystemParamType>();
  const rootInputs: SidecarFieldInput[] = [];
  const merged = new Map<string, SchemaSidecar>();
  const reserved = new Set<string>();
  const building = new Set<string>();
  for (const entry of splitTopLevel(interior, ",", "angle-and-brace")) {
    const colon = topLevelColon(entry);
    if (colon < 0) {
      continue;
    }
    const fieldName = entry.slice(0, colon).trim();
    const fieldType = entry.slice(colon + 1).trim();
    if (fieldName.length === 0 || fieldType.length === 0) {
      continue;
    }
    map.set(fieldName, toSystemParamType(fieldType, bodyTypes, resolving));
    if (bodyTypes === undefined) {
      continue;
    }
    const refTarget = refTargetInto(fieldType, bodyTypes, merged, reserved, building);
    if (refTarget === undefined) {
      continue;
    }
    rootInputs.push({
      thetaName: fieldName,
      pointer: `/properties/${encodePointerSegment(fieldName)}`,
      type: { kind: "other" },
      refTarget,
    });
  }
  if (rootInputs.length === 0 || bodyTypes === undefined) {
    return { kind: "object", fields: map };
  }
  let rootName = "__inline";
  while (bodyTypes.schemas.has(rootName) || reserved.has(rootName)) {
    rootName = `${rootName}_`;
  }
  merged.set(
    rootName,
    buildSidecar(
      rootInputs,
      rootInputs.map((i) => i.thetaName),
    ),
  );
  return { kind: "object", fields: map, sidecars: merged, rootDef: rootName };
}

/**
 * The unquoted text of a single string-literal type source (`"cat"` →
 * `cat`), or `undefined` when `typeSource` is not one. Mirrors
 * `classifyDiscriminatorFieldType` (theta-document.ts) exactly: a top-level
 * `|` split is tested FIRST, so a literal-UNION field type (`"low" | "high"`,
 * the inline-enumeration idiom, schemas.md:93) — which starts and ends with a
 * quote yet is not a single literal — contributes NO literal-table entry
 * rather than the bogus literal (`low" | "high`) its endpoint quotes would
 * otherwise yield. This keeps a `system:` union arm's literal table in
 * agreement with the parser's own discriminator detection.
 */
function stringLiteralOf(typeSource: string): string | undefined {
  const s = typeSource.trim();
  // A top-level `|` marks a literal UNION, not a single literal, so its
  // endpoint quotes belong to two different literals — reject before the
  // endpoint-quote test so `"low" | "high"` yields no literal-table entry.
  if (splitTopLevel(s, "|").length > 1) {
    return undefined;
  }
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return undefined;
}

/**
 * Build the `system:` union's per-arm data (bug 0425 §Fix route (a)): for
 * each `|`-separated arm source that names a body object schema — directly, or
 * through a SINGLE-arm alias chain (`schema A = Cat`, bug 0443) — with a
 * buildable outbound-sidecar map, an arm carrying that schema's rename
 * sidecars, its field-name set (for the render-time structural pick), and its
 * literal-discriminator table (for the render-time literal-match pick). Arm
 * sources are NOT unwrapped through `namedSchemaOf`, because that would unwrap
 * an `array<Cat>` source to a phantom `Cat` object arm (bug 0425 F2); the
 * alias chase here follows only a pure name→name single-arm chain and stops at
 * the first object schema, never entering an `array<...>` or multi-arm
 * (union-in-union) RHS. So an arm source that resolves to no object schema —
 * an `array<...>` element wrapper, an imported name, a scalar, a literal, or a
 * multi-arm alias — is
 * SKIPPED, not pushed as a degraded arm, so the render-time pick never
 * chooses a half-built arm; a value that would have matched a SHAPE-DISJOINT
 * skipped arm source (an `array<...>` element wrapper, a scalar, or a
 * literal — none of which an object value can ever be picked as) falls
 * through to today's untranslated bytes (the §Fix's "never guess" constraint
 * applies to the whole pipeline, not only the render step). A RECORD-shaped
 * skipped arm source (an inline-brace arm, or an imported-schema arm) that
 * shares a field set with a kept schema arm is instead picked as that kept
 * arm — never a wrong wire name, since the value is a valid instance of the
 * kept schema by every observable the parse-time type system has; it is a
 * statically-ambiguous pick the never-guess constraint does not reach, not a
 * guess. Zero
 * resolvable arms (a scalar union, a union of imported-only names, or a union
 * of `array<...>` sources) yields an empty list, and the caller keeps the
 * bare `discriminated-union` shape.
 */
function buildSystemUnionArms(
  armSources: readonly string[],
  bodyTypes: FrontmatterBodyTypes,
): readonly SystemUnionArm[] {
  const arms: SystemUnionArm[] = [];
  for (const rawArm of armSources) {
    // Chase a single-arm alias arm source (`A` over `schema A = Cat`) to the
    // body object schema it names, WITHOUT unwrapping an `array<...>` source
    // (which would mint a phantom object arm — bug 0425 F2) and WITHOUT
    // entering a multi-arm (union-in-union) RHS (kept conservative — bug 0443).
    let s = rawArm.trim();
    const seenArm = new Set<string>();
    while (
      bodyTypes.schemas.has(s) &&
      bodyTypes.schemas.get(s) === undefined &&
      !seenArm.has(s)
    ) {
      seenArm.add(s);
      const chain = bodyTypes.aliasArms.get(s);
      if (chain === undefined || chain.length !== 1) {
        break;
      }
      s = chain[0]!.trim();
    }
    const schemaName = bodyTypes.schemas.has(s) ? s : undefined;
    if (schemaName === undefined) {
      continue;
    }
    const fields = bodyTypes.schemas.get(schemaName);
    if (fields === undefined) {
      continue;
    }
    const sc = buildOutboundSidecars(schemaName, bodyTypes);
    const literals = new Map<string, string>();
    for (const f of fields) {
      const lit = stringLiteralOf(f.typeSource);
      if (lit !== undefined) {
        literals.set(f.name, lit);
      }
    }
    arms.push({
      name: schemaName,
      sidecars: sc.sidecars,
      rootDef: sc.rootDef,
      fieldNames: fields.map((f) => f.name),
      literals,
    });
  }
  return arms;
}

/**
 * Map a `params:` field type-expression source to the `SystemParamType` the
 * `system:` interpolation surface consumes. An inline object type is
 * classified FIRST (matching `lowerTypeSource`'s structural order,
 * body-type-lowering.ts) so a top-level `|` inside its braces (`{a: string |
 * null}`) is not split as a discriminated union before the brace group is
 * recognised. Primitives map to their scalar kinds; `array<T>` terminates as
 * an array (carrying outbound sidecars when its element names a body schema);
 * a top-level union / other generic terminates as a compact-object value; a
 * `NamedType` resolving to a body `enum` is an enum, one
 * resolving to an object `schema` carries its typed fields (so `.Ident` steps
 * validate) plus the outbound wire-name-translation sidecars (bug 0407); one
 * resolving to an imported `.thetalib` symbol is `opaque-object` (bug 0406
 * parent Rec A: fields are invisible at parse, so the type admits any
 * `.Ident` step rather than refusing it); and any other / unresolved atom
 * terminates as a scalar (so `${param}` is admitted but `${param.field}` is a
 * bad-field). `resolving` is a schema-name → partially-built shell map that
 * both guards a self-referential schema against unbounded descent AND gives
 * lazy cyclic reuse: a schema reached a second time while its own field map is
 * still being built reuses the SAME (mutable) shell object, so the cycle
 * closes over itself rather than degrading to a scalar.
 *
 * `aliasChain` is the disjoint guard for PURE-alias cycles (a `schema A = B`
 * chain that never hops through an object body): it carries the alias names on
 * the current descent and RESETS to empty when descent enters an object
 * schema's fields, because from there `resolving`'s parked shell already closes
 * a legal object-hop cycle. Aliases park nothing in `resolving`, so a legal
 * object-hop cycle (`schema A = Node`, `schema Node { next: A }`) classifies
 * `p: A` and `p: Node` identically instead of reading back an alias sentinel.
 *
 * Exported (bug 0422 route (a)): the load-phase template-revalidation
 * consumer (`import-static-checks.ts`) reuses this exact function, called with
 * an imported `.thetalib`'s OWN `FrontmatterBodyTypes`, to build the real
 * object shell the parser could not see at parse time — rather than
 * reimplementing this dispatch a second time against a different field-source
 * shape.
 */
export function toSystemParamType(
  typeSource: string,
  bodyTypes: FrontmatterBodyTypes | undefined,
  resolving: Map<string, SystemParamType>,
  aliasChain: ReadonlySet<string> = new Set(),
): SystemParamType {
  const s = typeSource.trim();
  // A single enclosing brace group is an inline object type — recognised
  // before the union and generic checks so a top-level `|` inside its braces
  // belongs to a field type, not a discriminated-union arm. A genuine union of
  // brace groups (`{a: X} | {b: Y}`) is not a single enclosing group — its
  // first `{` does not close at end — so it still reaches the union split.
  if (isSingleEnclosingBraceGroup(s)) {
    return inlineObjectType(s, bodyTypes, resolving);
  }
  // The top-level union split is tested BEFORE the generic `<>` check, matching
  // the canonical structural order of `lowerTypeExpr` (params.ts: union split
  // then generic) and of `classifyDiscriminatorFieldType` (theta-document.ts).
  // A union whose arms carry generics (`Cat | array<Cat>`) both contains a `<`
  // and ends with `>`, so testing the generic branch first would swallow the
  // whole expression as a malformed generic and discard its arms; splitting the
  // union first routes each arm source to `buildSystemUnionArms`.
  const unionArmSources = splitTopLevel(s, "|");
  if (unionArmSources.length > 1) {
    if (bodyTypes === undefined) {
      return { kind: "discriminated-union" };
    }
    const arms = buildSystemUnionArms(unionArmSources, bodyTypes);
    return arms.length > 0 ? { kind: "discriminated-union", arms } : { kind: "discriminated-union" };
  }
  const lt = s.indexOf("<");
  if (lt > 0 && s.endsWith(">")) {
    const ctor = s.slice(0, lt).trim();
    if (ctor === "array") {
      const element = s.slice(lt + 1, -1).trim();
      // A union ELEMENT source (`Cat | Dog`, or a 2+-arm alias `UU`) needs a
      // per-element arm pick, not a single sidecar map (bug 0444 §Fix route
      // (a)): `namedSchemaOf` returns `undefined` for a union source, so the
      // sidecar path below never covered it. Try this BEFORE the sidecar path
      // so a union element takes `elementArms`; a non-union element falls
      // through unchanged — including the single-arm alias chase and the
      // inline-object descent (bugs 0442/0441), which own the non-union lanes.
      const elementSplit = splitTopLevel(element, "|");
      const elementUnionSources =
        elementSplit.length > 1
          ? elementSplit
          : bodyTypes !== undefined && (bodyTypes.aliasArms.get(element)?.length ?? 0) >= 2
            ? (bodyTypes.aliasArms.get(element) as readonly string[])
            : undefined;
      if (elementUnionSources !== undefined && bodyTypes !== undefined) {
        const elementArms = buildSystemUnionArms(elementUnionSources, bodyTypes);
        if (elementArms.length > 0) {
          return { kind: "array", elementArms };
        }
      }
      if (bodyTypes !== undefined) {
        // An element naming a body object schema (directly, through an alias
        // chain, or as a nested `array<...>`) carries that schema's sidecars
        // (bug 0407/0442); an inline-object element (`array<{y: Inner}>`)
        // descends into a minted intermediate `$defs` (bug 0441).
        const named = namedSchemaOf(element, bodyTypes);
        if (named !== undefined) {
          const sc = buildOutboundSidecars(named, bodyTypes);
          return { kind: "array", sidecars: sc.sidecars, rootDef: sc.rootDef };
        } else if (isSingleEnclosingBraceGroup(element)) {
          const inline = buildInlineSidecars(element, bodyTypes, new Set(), new Set());
          return { kind: "array", sidecars: inline.sidecars, rootDef: inline.rootDef };
        }
      }
      return { kind: "array" };    }
    return { kind: "discriminated-union" };
  }
  switch (s) {
    case "string":
      return { kind: "string" };
    case "integer":
      return { kind: "integer" };
    case "number":
      return { kind: "number" };
    case "boolean":
      return { kind: "boolean" };
    case "null":
      return { kind: "null" };
    default:
      break;
  }
  return namedTypeSystemParam(s, bodyTypes, resolving, aliasChain);
}

/** Resolve named enums, aliases, recursive schema shells, and imported symbols. */
function namedTypeSystemParam(
  s: string,
  bodyTypes: FrontmatterBodyTypes | undefined,
  resolving: Map<string, SystemParamType>,
  aliasChain: ReadonlySet<string>,
): SystemParamType {
  if (bodyTypes !== undefined) {
    if (bodyTypes.enums.has(s)) {
      return { kind: "enum" };
    }
    if (bodyTypes.schemas.has(s)) {
      const existing = resolving.get(s);
      if (existing !== undefined) {
        return existing;
      }
      const fields = bodyTypes.schemas.get(s);
      if (fields === undefined) {
        const arms = bodyTypes.aliasArms.get(s);
        if (arms === undefined || arms.length === 0) {
          // Genuinely head-only: neither an object body nor alias arms — the
          // `empty-schema-body` family refuses this at declaration, so no
          // registering document reaches here. Keep the permissive terminal
          // for that unreachable case rather than inventing a behaviour for
          // it (bug 0427 §Fix).
          return { kind: "string" };
        }
        if (arms.length === 1) {
          // One arm: the alias IS the type it names one step in (an alias-of-
          // object gets the object shell with sidecars, alias-of-array the
          // array kind, alias-of-primitive the scalar kind) — `schemas.md:60`.
          // Pure-alias cycles are guarded by `aliasChain` — the set of alias
          // names on the current descent — NOT by parking a sentinel in the
          // shared `resolving` shell map: a sentinel there is read back by the
          // object-schema arm's early `resolving.get(s)` return and would
          // mis-classify a LEGAL object-hop cycle (`schema A = Node`,
          // `schema Node { next: A }`), rendering `${p.next}` as
          // `[object Object]` and making `p: A` and `p: Node` classify
          // differently in one document. `aliasChain.has(s)` means a pure-alias
          // re-entry, which `type-alias-cycle` already refuses at declaration
          // (so no registering document reaches it) — this is a
          // stack-overflow backstop only. A legal chain
          // (`schema A = B; schema B = Cat`) still resolves because each name
          // is added to a fresh copy that is discarded when descent unwinds.
          if (aliasChain.has(s)) {
            return { kind: "string" };
          }
          return toSystemParamType(arms[0]!, bodyTypes, resolving, new Set([...aliasChain, s]));
        }
        // Two or more arms: the `discriminated-union` terminal the INLINE
        // spelling (`p: 'Cat | Dog'`) renders through — naming the union via an
        // alias must not change its render (bug 0427 §Fix). Thread the SAME
        // per-arm rename machinery the inline split uses (bug 0443): arms
        // naming a body object schema (alias-chased) translate; when none do
        // (a scalar/imported/array union) the conservative bare terminal
        // stands, unchanged from the pre-0443 behaviour.
        const unionArms = buildSystemUnionArms(arms, bodyTypes);
        return unionArms.length > 0
          ? { kind: "discriminated-union", arms: unionArms }
          : { kind: "discriminated-union" };
      }
      const map = new Map<string, SystemParamType>();
      const sc = buildOutboundSidecars(s, bodyTypes);
      const shell: SystemParamType = {
        kind: "object",
        fields: map,
        sidecars: sc.sidecars,
        rootDef: sc.rootDef,
      };
      resolving.set(s, shell);
      for (const f of fields) {
        // RESET the alias chain when descending into an object schema's own
        // fields: the object shell parked in `resolving` above already closes
        // any legal cycle reached from inside it (b0406 W6, the recursive
        // schema), so a pure-alias name seen on the way in must not stay
        // in-flight and short-circuit a legal object-hop back to this schema.
        map.set(f.name, toSystemParamType(f.typeSource, bodyTypes, resolving, new Set()));
      }
      return shell;
    }
    if (bodyTypes.imports.has(s)) {
      // An imported schema resolves (no `unresolved-named-type`) but its
      // fields are invisible at parse — admit any `.Ident` step rather than
      // refusing it (bug 0406 parent Rec A's E1-compatible disposition).
      return { kind: "opaque-object" };
    }
  }
  return { kind: "string" };
}
