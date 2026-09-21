// Hoist fragment-local JSON Schema $defs into a shared document-level table.

/**
 * Lift every nested `$defs` entry a registered fragment carries up to the
 * document's OWN top level, stripping the nested copy on the way.
 *
 * WHY: `lowerTypeExpr` mints ROOT-ABSOLUTE `{ "$ref": "#/$defs/<name>" }`
 * pointers, which JSON Schema resolves against the document root and nowhere
 * else, but it registers only the names a `params:` field references DIRECTLY.
 * A name reached only THROUGH another name — `params: { p: Person }` where
 * `Person.pets: array<Animal>` — arrives inside `Person`'s own fragment-local
 * `$defs`, at `#/$defs/Person/$defs/Animal`, which no pointer can name: AJV
 * refuses the whole document with `can't resolve reference #/$defs/Animal`
 * when the binder compiles the envelope it is hoisted into
 * (binder-envelope.ts lifts this `$defs` verbatim to the envelope root). The
 * annotation path shares this lift (`pruneDocumentDefs`,
 * query-schema-lowering.ts) before its reachability prune. The `params:`
 * path needs no prune: a fragment is registered only when a ref to it is
 * minted, so every hoisted name is reachable by construction.
 *
 * The queue walk is keyed by def NAME with first-wins dedup, and that name set
 * doubles as the cycle/termination guard: a self- or mutually-recursive schema
 * closure names itself, so re-queuing the same name must terminate rather than
 * recurse forever. Fragments are never mutated — a hoisted-from body sheds its
 * `$defs` through a shallow clone, because the same fragment object is aliased
 * at several positions in one document (the body-type map's own entry and
 * every closure carrying it).
 */
export function hoistNestedDefs(
  defs: Readonly<Record<string, Record<string, unknown>>>,
): Record<string, Record<string, unknown>> {
  const hoisted: Record<string, Record<string, unknown>> = {};
  const queue: [string, Record<string, unknown>][] = Object.entries(defs);
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
  return hoisted;
}
