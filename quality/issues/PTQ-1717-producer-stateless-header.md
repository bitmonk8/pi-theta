---
id: PTQ-1717
title: ProductionThetaProducer's header denies the producer-scoped mutable state its implementation retains.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:209-215
  - src/extension/production-theta-producer.ts:231-245
  - src/extension/production-theta-producer.ts:1346-1359
  - src/runtime/tool-registration.ts:502-505
  - src/runtime/tool-registration.ts:523-536
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# ProductionThetaProducer's header denies the producer-scoped mutable state its implementation retains.

## Observation
The class header says the shared producer holds only injected collaborators and has no cross-invocation mutable state. The class constructs its own registration cache as an instance field and passes that same cache to respond-tool registration. The cache is a mutable map whose first registration stores a record for later reuse. The class also declares its own capture slot rather than receiving that slot as an injected collaborator.

## Evidence
The header claim, `src/extension/production-theta-producer.ts:209-215`:
```ts
/**
 * The production per-theta producer. Constructed once per `session_start`
 * discovery pass and shared across every discovered theta's `composeThetaFixture`
 * call; it holds only its injected collaborators (no cross-invocation mutable
 * state), constructing a fresh conversation binding per dispatch.
 */
class ProductionThetaProducer implements ThetaProducerDeps {
```

Supporting evidence — the instance-created cache and capture slot, `src/extension/production-theta-producer.ts:231-245`:
```ts
  /**
   * Bug 0010 (PIC-44): the producer-scoped registration cache for the
   * synthesised `__theta_respond_<slug>` tools. A byte-equal lowered schema
   * re-uses the existing registration; a slug collision disambiguates.
   */
  readonly #respondRegistrationCache = createRegistrationCache();
  /**
   * Bug 0010 (QRY-14 early respond): the one-shot capture slot the PERMANENT
   * respond-tool registrations dispatch through. Armed by the live driver
   * around each driven free-phase turn and cleared in its `finally`, so a
   * registration that outlives its query can never capture outside a live
   * typed turn. A SINGLE slot suffices because prompt-mode bodies execute
   * strictly sequentially (PIC-2): at most one driven turn is in flight.
   */
  #activeRespondCapture: ActiveRespondCapture | null = null;
```

Supporting evidence — registration uses the retained instance field, `src/extension/production-theta-producer.ts:1346-1359`:
```ts
  #registerRespondTool(lowered: LoweredSchema): {
    readonly slug: string;
    readonly toolName: string;
  } {
    const slug = respondSchemaSlug(lowered);
    const toolName = registerToolInCache(
      this.#respondRegistrationCache,
      { kind: "respond", slug, canonicalFormBytes: canonicalForm(toLoweredJsonValue(lowered)) },
      {
        registerTool: (name) =>
          this.#input.pi.registerTool(this.#buildRespondToolDefinition(name, lowered)),
        emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
      },
    );
```

Supporting definition of that collaborator, `src/runtime/tool-registration.ts:502-505`:
```ts
/** Construct an empty registration cache. */
export function createRegistrationCache(): RegistrationCache {
  return new Map();
}
```

Supporting mutation and retained-record behavior, `src/runtime/tool-registration.ts:523-536`:
```ts
  const baseName = contentAddressedName(entry);
  const existing = cache.get(entry.slug);

  // First encounter of a unique slug: register once under the content-addressed
  // name and store the canonical-form bytes alongside it for the PIC-44
  // byte-equality check on later hits.
  if (existing === undefined) {
    cache.set(entry.slug, {
      registeredName: baseName,
      canonicalFormBytes: entry.canonicalFormBytes,
      nextCounter: 2,
    });
    deps.registerTool(baseName);
    return baseName;
```

## Why this is a problem
The class-level ownership description is stale: it denies retained mutable state while the instance-created map records registrations for subsequent calls on the shared producer. `readonly` fixes the field reference, not the map contents, as the called registration function's `cache.set` demonstrates. This finding targets the header's factual claim, not the documented registration-cache or capture-slot design.

## Suggested direction (non-binding, optional)
Bring the class header's state-lifetime description into agreement with the instance-scoped cache and per-turn capture slot.

## False-positive check
- State/reference check: `rg -n 'topLevelCascade|origin-site|activeRespondCapture|respondRegistrationCache|off-session' src/extension/production-theta-producer.ts` identifies the cache declaration, its registration use, the capture-slot declaration, its writes, and its read. The map's construction and mutation were then inspected at the supporting locations above. No deadness or unused-export claim is made.
- Lifetime check: the header itself states that the instance is shared across discovered thetas. The cache is initialized on the class instance, not inside the per-dispatch binding or query method; the registration call receives that field rather than a fresh map. A fresh conversation binding therefore does not make the producer stateless.
- Intent/history check: `git log --oneline -S 'no cross-invocation mutable' -- src/extension/production-theta-producer.ts` traces the wording to `2bc69157`. `git log -1 --oneline -S '#respondRegistrationCache' -- src/extension/production-theta-producer.ts` identifies `30492948`; inspecting that commit shows the cache and capture slot added while the quoted stateless header remained. The field comments explain the intended cache reuse and capture isolation; those mechanisms are not challenged.
- Existing-report check: before either report in this shard was written, `rg -l 'no cross-invocation mutable|holds only its injected|off-session sibling that served|Shared by BOTH drivers|Built for BOTH drivers' quality/intake quality/issues quality/resolved --glob '*.md'` returned zero files. The existing producer decomposition reports address module concerns, not this header's state claim.
- Supporting inspection of `src/runtime/tool-registration.ts` establishes what the in-scope class's collaborator does; no finding is made against that file, tests, or docs.

## Triage
verdict: confirmed — All five excerpts reproduce: the header denies cross-invocation mutable state, but the instance creates and retains #respondRegistrationCache, passes it to registerToolInCache, and that function stores and reuses map entries; #activeRespondCapture is also assigned per turn. Commit 30492948 added both fields while retaining the header. This is mechanically contradicted D2 production-source narration, not a design objection; PTQ-1608 tracks decomposition and PTQ-1674 tracks name minting, not this claim, and no duplicate was found. (triage: claude-opus-5-5)
