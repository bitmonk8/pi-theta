// V13e — lower a typed `@<Schema>` query's declared response schema to the
// validating JSON Schema (QRY-22 / SUBS-1), reusing the `params:` type-lowering
// machinery (`lowerTypeExpr` / `splitTopLevel`).
//
// A typed query's declared schema annotation is one of:
//   - a named `schema` decl (`@<Triage>`), resolved whole-file against the
//     theta body's `schema` declarations to its retained object-body field
//     sources;
//   - an inline object type (`@<{ status: "ok" | "degraded", summary: string }>`);
//   - an inline primitive / union / `array<T>` type (`@<string>`, `@<A | B>`).
//
// Each lowers to an AJV-validatable `LoweredSchema` so the runtime execution
// path validates the response against the declared schema rather than binding an
// unvalidated payload (the QRY-22 obligation V13e integrates). String / number /
// boolean / null literal unions lower to `enum`, so a declared literal set is
// validated; a nested cross-schema `NamedType` inside another schema's body
// lowers to a `$ref` whose fragment is hoisted into the document's top-level
// `$defs` (bug 0004 — `pruneDocumentDefs` is a hoist-and-close step, so
// transitively-reachable defs are enforced, not dropped). Every top-level
// `schema` / `enum` name — including a forward, self, or mutual reference —
// resolves to a `$ref` under the two-pass whole-file `buildBodyTypeSchemas`
// performs (bug 0028 §Fix; body-type-lowering.ts), so declaration order never
// costs a `$ref`.
//
// A permissive `{}` fragment — one AJV accepts every payload against, so the
// QRY-22 gate constrains nothing at that position — has exactly four origins
// below this seam: the three `{}` returns of `lowerTypeExpr` (params.ts) and
// the ZERO-FIELD return of `hoistInlineObjectType` (params.ts) for an empty
// inline object `{}` in a field's type position, which `lowerTypeSource`
// still routes to a brace group there (`@<{a: {}}>` → `properties.a = {}`).
// grammar.md:109's `empty-schema-body` rule refuses that shape at parse time
// (bug 0045 §Fix), so this fourth origin is unreachable from a loading
// theta — it answers only a caller that bypasses the parse gate (a direct
// call to this seam). Arms 1 and 2 always build a typed object or enum
// fragment, so the residual reduces to those four; the other three remain
// reachable from a LOADABLE theta:
//
//   - THE UNRESOLVED-NAME ARM, for a name in scope that carries no lowerable
//     body here: a symbol a body `import` pulls in (both call sites hand this
//     seam the importing file's OWN `schema` / `enum` decls, and the imported
//     symbol's fields live in the other file), or a `schema` decl the parser
//     retained no field list for (it retains one only for a plain
//     `ident: Type` object body). Both names are in scope, so
//     `theta/parse/unresolved-named-type` admits them by design. A name
//     resolving to NO declaration lands on the same arm but is refused from
//     source (theta-document.ts), making the `{}` for THAT input defence in
//     depth behind the parse gate rather than reachable behaviour.
//   - THE NON-`array` GENERIC ARM: a `Result<T, E>` value type `parseLet`
//     propagates verbatim off a `let r: Result<…> = @`…`` binding (`Result` is
//     "never lowered to a JSON Schema fragment" — grammar.md
//     §"Generic-application constructors" — so there is no shape here to
//     validate against and the parse gate deliberately does not refuse it); any
//     other constructor application (`Foo<string>`), whose constructor name is
//     resolved nowhere; and an `array<…>` whose argument text carries a
//     top-level comma (`array<{a: string, b: integer}>`), which the angle-depth
//     argument split reports as two arguments, so the single-argument `array`
//     arm does not match and the generic arm takes it.
//   - THE TRAILING CATCH-ALL, which a brace-rooted source still reaches
//     through recursions that never re-enter `lowerTypeSource` and so never
//     meet its inline-object arm. A GENERIC ARGUMENT: `array<{a: string}>`
//     recurses its element type through `lowerTypeExpr` directly —
//     `items: {}`. A UNION ARM reached through `lowerTypeExpr`'s OWN per-arm
//     recursion: a `params:` field's `{a: integer} | integer` lands here,
//     where the same text at a `lowerTypeSource` position does not — that
//     function splits a union carrying a brace arm itself and hoists the arm
//     (bug 0039 §Fix part B). And a brace group the angle-only `|` split has
//     already cut in half: `{ a: string | null } | Cat` presents as the three
//     arms `{ a: string`, `null }`, `Cat`, none of them a brace group. Every
//     OTHER brace-rooted type position, at any depth of inline-object FIELDS
//     or union arms, hoists through the arm `lowerTypeSource` shares with the
//     `params:` position (`isSingleEnclosingBraceGroup`,
//     body-type-lowering.ts). The annotation root takes that identical arm
//     for a union of object arms too (bug 0053 §Fix). It lowers through
//     `lowerInlineObject`'s brace-aware interior split (bug 0039 §Fix) only
//     where the annotation itself IS one enclosing brace group, a
//     restriction bug 0053 §Fix places on the one position where the
//     fragment is the document root rather than a field or an arm.
//     Separately, a literal
//     atom is recognised only by `lowerTypeSource`'s own top-level check, so a
//     literal arm of a union that is not all-literal still lowers `{}`
//     (`"a" | Triage` → `anyOf: [{}, {"$ref": …}]`).
//
// Spec: schema-subset.md (SUBS-1 lowering), query/query-failure-and-repair.md
// (QRY-22).

import type { LoweredSchema } from "../seams/schema-validator";
import type { EnumDecl, SchemaDecl } from "../parser/theta-document";
import {
  buildBodyTypeSchemas,
  isSingleEnclosingBraceGroup,
  lowerInlineObject,
  lowerTypeSource,
  type InlineHoistSinks,
} from "../parser/body-type-lowering";
import {
  prunePerQueryDefs,
  type QueryDefsDocument,
} from "../parser/query-schema-inference";

/** An identifier-shaped atom (a bare `NamedType` reference). */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Lower a typed query's declared response-schema annotation to its
 * AJV-validatable JSON Schema (QRY-22 / SUBS-1), or `undefined` when the
 * annotation carries no lowerable shape. `annotation` is the verbatim
 * `@<Schema>` text; `schemas` and `enums` are the theta body's `schema` /
 * `enum` declarations, used to resolve a named reference whole-file to its
 * retained object body or its wire-value enum (bug 0028 §Fix: `enums`
 * defaults to `[]` so the two shipped seam-contract pins that call this with
 * two arguments keep compiling).
 */
export function lowerQueryResponseSchema(
  annotation: string,
  schemas: readonly SchemaDecl[],
  enums: readonly EnumDecl[] = [],
): LoweredSchema | undefined {
  const bodyTypeMap = buildBodyTypeSchemas(schemas, enums);
  const s = annotation.trim();
  if (s.length === 0) {
    return undefined;
  }

  // A named `schema` decl: its retained object body is the response schema
  // (returned directly so the root is the object shape, not a `$ref` wrapper).
  if (IDENTIFIER.test(s)) {
    const named = bodyTypeMap.get(s);
    if (named !== undefined) {
      return pruneDocumentDefs(named, s) as LoweredSchema;
    }
  }

  // The annotation's OWN inline-object hoist (bug 0039 §Fix) is a RUNTIME mint
  // with no load-time diagnostic channel to report a collision through — the
  // annotation position's lowering runs after load, so there is no registered
  // code's site to attach one at this seam. The sinks are threaded anyway so
  // the byte-equality check still runs and first-wins retention stays
  // deliberate rather than accidental; a collision is silently retained here,
  // same as at any position no sink is threaded at all.
  const sinks: InlineHoistSinks = {
    inlineCanonical: new Map(),
    inlineFragments: new Map(),
    slugCollisions: [],
  };

  // A source that IS a single enclosing brace group: the annotation root is
  // the one position where the fragment must BE the object, not a $ref to
  // one, so this keeps returning it directly. A top-level union of object
  // arms is not this shape (bug 0053 §Fix) and falls through below, where
  // `lowerTypeSource` hoists each arm on its own terms.
  if (isSingleEnclosingBraceGroup(s)) {
    return pruneDocumentDefs(
      lowerInlineObject(s.slice(1, -1), bodyTypeMap, undefined, sinks),
      s,
    ) as LoweredSchema;
  }

  // An inline primitive / union / `array<T>` type.
  const defs: Record<string, Record<string, unknown>> = {};
  const root = lowerTypeSource(s, bodyTypeMap, defs, undefined, sinks);
  const result: Record<string, unknown> = { ...root };
  if (Object.keys(defs).length > 0) {
    result["$defs"] = defs;
  }
  return pruneDocumentDefs(result, s) as LoweredSchema;
}

/**
 * schema-subset.md §"Lowering Algorithm" step 4 — assemble the per-query schema
 * document's top-level `$defs`, grown (bug 0004) from a reachability filter into
 * the hoist-and-close step every annotation arm shares:
 *
 * HOIST — a named-schema fragment built by `lowerObjectFields` carries a
 * FRAGMENT-LOCAL `$defs` holding the fragments of the named schemas it
 * references; left in place under this document's `$defs.<Name>` those
 * dependencies sit at `#/$defs/<Name>/$defs/<Dep>`, unreachable from the
 * root-absolute `$ref: "#/$defs/<Dep>"` the fragment emits (AJV
 * `MissingRefError` at compile). Every nested `$defs` entry is therefore lifted
 * to the document's top level, walking newly-hoisted fragments too (a fragment
 * hoisted from `$defs.Item2.$defs.Loc2` may itself nest `$defs.Pos`). The walk
 * is keyed by def NAME with first-wins dedup, and the name set doubles as the
 * cycle/termination guard: fragments come from the shared body-type map keyed
 * by name, so two fragments nesting the same def name carry the SAME map
 * fragment — the first hoist already placed the one body every `$ref` resolves
 * to (absent duplicate `schema` decl names, which the parser admits and
 * lowering tolerates deterministically — the annotation-resolved body wins at
 * top level). No body-type map is consulted here: `lowerTypeExpr` registers
 * the target fragment in the SAME defs record whenever it mints a `$ref` (an
 * unresolved name lowers permissively to `{}`, never to a ref), and every
 * registered fragment recursively carries its own `$defs` for ITS refs — so
 * the nested-`$defs` walk alone closes the document.
 *
 * STRIP — a hoisted-from body sheds its `$defs` key via shallow clone: the
 * same fragment object is ALIASED at multiple positions within one document
 * (a fragment's nested `$defs.<Dep>` and the defs record's own `<Dep>` entry
 * are the same object; arm 1 passes the map fragment itself as the document
 * root), so a mutation at one position would be visible at every other —
 * and, secondarily, cloning keeps the `bodyTypeMap` fragments intact even if
 * a caller memoised the map. Rather than leave the nested copy as residue,
 * it is deduplicated to the top level — residue is dead weight AJV never
 * resolves a root-absolute ref against, and a duplicated nested body could
 * silently drift from the hoisted copy it shadows.
 *
 * CLOSE + PRUNE — the existing reachability walk (`collectDefRefs` /
 * `prunePerQueryDefs`) then keeps exactly the defs transitively reachable from
 * the response-schema root; unreachable ones — including hoisted-but-unused —
 * are pruned. A document with no `$defs` passes through with nothing to hoist.
 *
 * DEFECT GUARD — a reachable `$ref` name with no hoisted body cannot arise
 * from source: the named-annotation arm (arm 1) passes the map fragment
 * itself (`bodyTypeMap.get(s)`) as the document root, and
 * `buildBodyTypeSchemas`'s pass 3 (body-type-lowering.ts, bug 0028 §Fix)
 * already attached that fragment's FLAT TRANSITIVE `$defs` closure — a
 * hoisted body for every name reachable from it, SELF INCLUDED when a self
 * or mutual reference leads back to it — so the HOIST walk below has a body
 * for everything the root (or any `$defs` entry) can reference. That walk's
 * name-keyed cycle guard (`hoisted[name] !== undefined`) is what lets a
 * RECURSIVE document — a `$ref` chain that, followed far enough, names a
 * `$defs` entry already being hoisted — terminate instead of re-queuing the
 * same name forever; arms 2/3 (the inline-object and primitive/union arms)
 * reach the same guaranteed-complete closure one level down, through each
 * directly-referenced name's own map fragment. If a reachable ref ever has
 * no hoisted body regardless, throw a plain `Error` naming the annotation
 * and the missing def AT LOWERING TIME, so the boundary wrap
 * (`invoke-cancellation.ts` puts a thrown message on
 * `InvokeInfraError.message`; the runtime-defect surface reclassifies a
 * typed query's throw) carries a precise message instead of AJV's raw
 * `MissingRefError` resolver leak at validation time.
 */
function pruneDocumentDefs(
  document: Record<string, unknown>,
  annotation: string,
): Record<string, unknown> {
  const rootBody: Record<string, unknown> = { ...document };
  delete rootBody["$defs"];
  const defs = document["$defs"];
  const defsMap =
    defs !== undefined && defs !== null && typeof defs === "object"
      ? (defs as Record<string, Record<string, unknown>>)
      : {};

  // HOIST (first-wins name dedup; the `hoisted` key set is the cycle guard).
  const hoisted: Record<string, Record<string, unknown>> = {};
  const queue: [string, Record<string, unknown>][] = Object.entries(defsMap);
  while (queue.length > 0) {
    const [name, body] = queue.shift() as [string, Record<string, unknown>];
    if (hoisted[name] !== undefined) {
      continue;
    }
    const nested = body["$defs"];
    if (nested === undefined || nested === null || typeof nested !== "object") {
      hoisted[name] = body;
      continue;
    }
    queue.push(...Object.entries(nested as Record<string, Record<string, unknown>>));
    // STRIP by shallow clone — the shared fragment itself is never mutated.
    const stripped: Record<string, unknown> = { ...body };
    delete stripped["$defs"];
    hoisted[name] = stripped;
  }

  // CLOSE + PRUNE: reachability from the response-schema root over the hoisted
  // (stripped) bodies. Stripping first keeps the walk exact: a ref inside a
  // nested `$defs` subtree contributes through its own hoisted entry rather
  // than being over-counted against the fragment that carried it.
  const graph: Record<string, string[]> = {};
  for (const [name, body] of Object.entries(hoisted)) {
    graph[name] = collectDefRefs(body);
  }
  const rootRefs = collectDefRefs(rootBody);
  const doc: QueryDefsDocument = { rootRefs, defs: graph };
  const retained = prunePerQueryDefs(doc);

  // DEFECT GUARD: every name the root or a retained def references must have a
  // hoisted body. A missing def has no outgoing edges, so any reachable-but-
  // missing name is referenced DIRECTLY by the root or by a retained def —
  // checking those reference lists covers the whole reachable set.
  const referenced = new Set<string>(rootRefs);
  for (const refs of Object.values(retained)) {
    for (const name of refs) {
      referenced.add(name);
    }
  }
  for (const name of referenced) {
    if (hoisted[name] === undefined) {
      throw new Error(
        `schema lowering for annotation \`${annotation}\` references $defs entry '${name}' but no fragment for it was collected`,
      );
    }
  }

  const prunedDefs: Record<string, Record<string, unknown>> = {};
  for (const name of Object.keys(retained)) {
    const body = hoisted[name];
    if (body !== undefined) {
      prunedDefs[name] = body;
    }
  }

  const result: Record<string, unknown> = { ...rootBody };
  if (Object.keys(prunedDefs).length > 0) {
    result["$defs"] = prunedDefs;
  }
  return result;
}

/**
 * Collect the `$def` names a JSON-Schema fragment references, from every
 * `{ "$ref": "#/$defs/<Name>" }` occurrence anywhere within it (a recursive
 * scan over nested objects and arrays).
 */
function collectDefRefs(value: unknown): string[] {
  const names: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$ref" && typeof child === "string") {
        const match = /^#\/\$defs\/(.+)$/.exec(child);
        if (match !== null && match[1] !== undefined) {
          names.push(match[1]);
        }
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return names;
}
