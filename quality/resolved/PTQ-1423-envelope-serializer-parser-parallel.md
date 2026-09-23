---
id: PTQ-1423
title: Subagent return-envelope serializer and parser are parallel schema implementations
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/runtime/subagent-envelope.ts:150-167
  - src/runtime/subagent-envelope.ts:253-268
  - src/runtime/subagent-envelope.ts:398-445
sites: 3
fix_scope: module
d4_class: parallel
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# Subagent return-envelope serializer and parser are parallel schema implementations

## Observation
`src/runtime/subagent-envelope.ts` owns both sides of the RFC-0006 PIC-59 `theta_result` JSONL wire contract: child-side serialization and parent-side parsing. The schema has two arms (`ok` and `err`) plus three optional sidecars (`enum_tags`, `err_provenance`, `fn_tail`). The serializer emits each field conditionally, and the parser validates the same fields conditionally. The two halves are implemented independently and must stay in lockstep: a sidecar the serializer emits but the parser does not recognise, or a shape the parser rejects but the serializer produces, breaks the envelope contract across the subagent boundary.

## Evidence

Location 1 — `serializeOkEnvelope` (child-side Ok arm writer), src/runtime/subagent-envelope.ts:150-167:

```typescript
export function serializeOkEnvelope(
  value: unknown,
  enumTags?: readonly EnumTagEntry[],
  fnTail?: FnTail,
): string {
  const payload: EnvelopeOk = {
    v: THETA_ENVELOPE_VERSION,
    ok: value,
    // Emitted only when non-empty, so an enum-free return's envelope bytes are
    // unchanged (bug 0342 §Fix: additive sidecar, not a widened envelope
    // shape).
    ...(enumTags !== undefined && enumTags.length > 0 ? { enum_tags: enumTags } : {}),
    // RFC 0012 §10: a `subagent fn` child's `Ok(x)` tail; absent otherwise.
    ...(fnTail !== undefined ? { fn_tail: fnTail } : {}),
  };
  return `${stringifyPreservingNegativeZero({ [THETA_RESULT_KEY]: payload })}
`;
}
```

Location 2 — `serializeErrEnvelope` (child-side Err arm writer), src/runtime/subagent-envelope.ts:253-268:

```typescript
export function serializeErrEnvelope(
  error: QueryError,
  provenance?: ErrProvenance,
  fnTail?: FnTail,
): string {
  const payload: EnvelopeErr = {
    v: THETA_ENVELOPE_VERSION,
    err: error,
    // Emitted only when the caller knows the provenance, so an unstamped call
    // (an old call site, or one that has not yet been taught the provenance)
    // stays byte-identical on the wire (bug 0347 §Fix, additive sidecar).
    ...(provenance !== undefined ? { err_provenance: provenance } : {}),
    // RFC 0012 §10: a `subagent fn` child's `Err(e)` tail; absent otherwise.
    ...(fnTail !== undefined ? { fn_tail: fnTail } : {}),
  };
  return `${JSON.stringify({ [THETA_RESULT_KEY]: payload })}
`;
}
```

Location 3 — `parseEnvelopeLine` with its sidecar validators `parseEnumTagsSidecar`, `parseErrProvenance`, and `parseFnTail`, src/runtime/subagent-envelope.ts:398-445 (and helpers at 342-391):

```typescript
export function parseEnvelopeLine(line: string): EnvelopeParse {
  // ... JSON parse and version-skew checks ...
  const fnTail = parseFnTail(record.fn_tail);
  if (Object.prototype.hasOwnProperty.call(record, "ok")) {
    const validTags = parseEnumTagsSidecar(record.enum_tags);
    return {
      kind: "ok",
      value: record.ok,
      ...(validTags !== undefined ? { enumTags: validTags } : {}),
      ...(fnTail !== undefined ? { fnTail } : {}),
    };
  }
  if (Object.prototype.hasOwnProperty.call(record, "err")) {
    const provenance = parseErrProvenance(record.err_provenance);
    return {
      kind: "err",
      error: record.err as QueryError,
      ...(provenance !== undefined ? { provenance } : {}),
      ...(fnTail !== undefined ? { fnTail } : {}),
    };
  }
  // A reserved-key line carrying neither arm fails the pinned schema.
  return { kind: "parse-failed", line };
}
```

Diff verdict: the writer and reader are not token clones; the writer builds a typed payload and stringifies, while the reader parses untrusted JSON and validates. They are structurally parallel over the same schema fields. No clone-map group id applies.

## Why this is a problem
This is load-bearing parallel truth, not incidental similarity. The parent and child are separate processes; the only contract that survives the boundary is the byte sequence the serializer writes and the parser reads. The schema discriminant set has four dimensions:

1. `v` — pinned envelope version (both sides use `THETA_ENVELOPE_VERSION` and reject skew).
2. `ok` vs `err` arm presence (both sides branch on the same top-level keys).
3. `enum_tags` on the Ok arm and `err_provenance` on the Err arm (both sides emit/validate conditionally).
4. `fn_tail` on either arm (both sides emit/validate conditionally).

If the serializer were extended with a new sidecar — for example a future D3/D4 carriage beside `enum_tags` — and the parser were not updated in the same change, the child would emit envelopes the parent silently downgrades (the sidecar would be dropped, or the whole line would fail the pinned schema). Conversely, if the parser were hardened against a malformed field the serializer does not produce, the change is harmless but proves the two halves are maintained independently. The sidecar precedent in the file itself demonstrates the risk: `enum_tags` (bug 0342), `err_provenance` (bug 0347), and `fn_tail` (RFC 0012 §10) were each added to the same schema and each required coordinated changes to both writer and reader.

## Suggested direction (non-binding, optional)
The natural shared home is a single envelope-schema value type paired with a codec: one source of truth for the `ok`/`err` arms and their sidecars, with the serializer and parser derived from it. This is a hypothesis; the fix stage owns the design.

## False-positive check
- Clone map re-verified: `src/runtime/subagent-envelope.ts` has no clone groups, so this parallel was not detected by token clone scanning.
- Both copies live: `serializeOkEnvelope` and `serializeErrEnvelope` are called from `production-theta-producer.ts` and `production-composition.ts`; `parseEnvelopeLine` is called from `subagent-json-driver.ts` and `subagent-envelope.ts`.
- Deliberate-mirror check: the module header explicitly states this file owns "serialisation and parsing" of the same envelope; the mirror is intentional. The rationale is not demonstrably false; the finding is filed as parallel truth, not as a copy to eliminate.
- Not tests/: all locations are under `src/runtime` production code.
- Not dead code: every cited function has production callers.
- Not spec-normative vector table: the similarity is the imperative wire codec, not a repeated spec enumeration.
- Not generated: all code is hand-authored TypeScript.

## Triage
verdict: questionable — accounting verified: excerpts match at 150-167, 253-268, 398-445 (helpers at 352-391, minor drift from the cited 342); the four-dimension inventory is accurate in current code — `v` pinned both sides, `ok`/`err` arm keys branched both sides, `enum_tags` emitted in `serializeOkEnvelope` and validated by `parseEnumTagsSidecar` under the `ok` arm, `err_provenance` emitted in `serializeErrEnvelope` and validated by `parseErrProvenance` under the `err` arm, `fn_tail` emitted on both arms and validated by `parseFnTail` on both; every cited function is live in src (`serializeOkEnvelope` ×2 and `serializeErrEnvelope` ×1 in production-theta-producer.ts, `serializeErrEnvelope` ×1 in production-composition.ts, `parseEnvelopeLine` in subagent-json-driver.ts:205); clone-scan lists no group for this file so the pair is structural not token; not a duplicate — PTQ-0292 (progress-tool/child-tap) and PTQ-1134 (subagent-result-channel control frames) are the same encoder/decoder-parallel class in different modules and PTQ-1203 is a D9 breakdown of this host, none tracks this serializer/parser pair; the shared source of truth (schema type + codec, or a PTQ-0292-style `satisfies Record<keyof EnvelopeOk|EnvelopeErr, true>` handled-fields ledger anchoring the parser to the existing `EnvelopeOk`/`EnvelopeErr` types) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: all three excerpts byte-match at 150-167, 253-268, 398-445 (sidecar validators at 352-391, small drift from cited 342); coverage count accurate — writer emits 5 schema fields (`v`, `ok`|`err`, `enum_tags`, `err_provenance`, `fn_tail`) and the reader reads exactly those 5 off an untyped `Record<string, unknown>` (`record.v`/`record.fn_tail`/`record.enum_tags`/`record.err_provenance`, `hasOwnProperty` on `ok`/`err`), so a new optional field added to `EnvelopeOk`/`EnvelopeErr` compiles without touching `parseEnvelopeLine` (no exhaustiveness tether); all sides live in src (serializeErrEnvelope: production-theta-producer.ts:3035, production-composition.ts:1693; serializeOkEnvelope: producer :3138/:3398; parseEnvelopeLine: subagent-json-driver.ts:205); `clone-scan map --files src/runtime/subagent-envelope.ts` → no clone groups, so parallel not clone; dedupe clean — PTQ-1203 (D9 breakdown of this host, fixed) and PTQ-1134/PTQ-0292 (same class, other modules) do not track this pair, and grep of quality/issues+resolved for `parseEnvelopeLine`/`serializeOkEnvelope` hits only PTQ-0003/PTQ-1203; the shared source of truth is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified against current code: all three excerpts match at 150-167, 253-268, 398-445 (validators `parseEnumTagsSidecar`/`parseErrProvenance`/`parseFnTail` at 352-391, drift from cited 342 only); coverage count accurate — `EnvelopeOk` (88-92) and `EnvelopeErr` (123-128) declare exactly `v`, `ok`|`err`, `enum_tags`|`err_provenance`, `fn_tail`, the writers emit those five conditionally, and `parseEnvelopeLine` reads exactly those five off an untyped `Record<string, unknown>` with no type-level tether to the interfaces; all sides live in src (serializeErrEnvelope: production-composition.ts:1694, production-theta-producer.ts:3162; serializeOkEnvelope: producer :3265/:3525; parseEnvelopeLine: subagent-json-driver.ts:205); `clone-scan map --files src/runtime/subagent-envelope.ts` → no clone groups, so parallel not clone; dedupe clean — PTQ-1203 (D9 breakdown of this host, fixed), PTQ-1134/PTQ-1206/PTQ-0292 (encoder/decoder parallels in result-channel and progress-wire, other modules) and PTQ-1330 (D7, a test of this module) do not track this writer/reader pair; per the D4 parallel rule the shared source of truth is a design decision for a human ruling (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted. TARGET SHAPE: compile-time exhaustiveness tether between the envelope schema's serializer and parser sides (the PTQ-0292/0415/1139 ratified shape) - kind-keyed satisfies-record or never-backstop so schema growth is a tsc error on BOTH sides; do not merge the two directions into one function.
