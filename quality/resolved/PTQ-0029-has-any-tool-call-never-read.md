---
id: PTQ-0029
title: BinderEnvelopeExtraction's no-match arm carries a hasAnyToolCall field that is computed but never read
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/binder/binder-inference.ts:504-512
  - src/binder/binder-inference.ts:529-533
  - src/extension/production-theta-producer.ts:1267-1300
sites: 1
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# BinderEnvelopeExtraction's no-match arm carries a hasAnyToolCall field that is computed but never read

## Observation

`extractBinderEnvelope` (src/binder/binder-inference.ts) returns a
three-arm union; the `no-match` arm carries `hasAnyToolCall: boolean`, computed
as `calls.length > 0`, documented as distinguishing a wrong-name ToolCall from a
plain-text reply. The function has exactly one caller in the repository
(production-theta-producer.ts:1267), which routes on `extraction.kind` and reads
`extraction.envelope`, and whose `no-match` handling treats both sub-cases
identically. No code in src/, extensions/, tools/, or tests/ reads
`hasAnyToolCall` — the value is computed and discarded on every invocation.

## Evidence

src/binder/binder-inference.ts:504-512 — the field's declaration and its
documented purpose (the doc itself concedes the caller routes on other inputs):

```ts
 *   - `no-match` — no ToolCall names the binder tool. `hasAnyToolCall`
 *     distinguishes a wrong-name ToolCall from a plain-text reply (both are the
 *     malformed-envelope condition on a clean stop; the caller consults
 *     stopReason / errorMessage / HTTP status for the failure routing).
 */
export type BinderEnvelopeExtraction =
  | { readonly kind: "match"; readonly envelope: unknown }
  | { readonly kind: "match-malformed" }
  | { readonly kind: "no-match"; readonly hasAnyToolCall: boolean };
```

src/binder/binder-inference.ts:529-533 — the only site that populates it:

```ts
  const calls = reply.content.filter(
    (part): part is ToolCall => part.type === "toolCall",
  );
  const match = calls.find((call) => call.name === toolName);
  if (match === undefined) {
    return { kind: "no-match", hasAnyToolCall: calls.length > 0 };
  }
```

src/extension/production-theta-producer.ts:1267-1300 — the sole caller; the
`no-match` fall-through never touches the field (`extraction.` member reads in
this file are :1268 `.kind`, :1274 `.envelope`, :1278 `.envelope`, :1295
`.kind` — nothing else):

```ts
    const extraction = extractBinderEnvelope(reply, dispatch.toolName);
    if (extraction.kind === "match") {
```
```ts
    if (extraction.kind === "match-malformed") {
      // The binder tool WAS called but its arguments are unusable (not an
      // object, or no envelope key): malformed-envelope, never transport.
      return { outcome: { kind: "malformed" } };
    }
    // No matching ToolCall: failure routing. A non-normal stopReason, a
```

The `no-match` branch's terminal disposition
(production-theta-producer.ts:1335-1338) folds both sub-cases into one outcome:

```ts
    // A clean normal-stop reply with no matching ToolCall — plain text only,
    // or a ToolCall with a different name — is the malformed-envelope
    // condition (binder-inference.md extraction rule).
    return { outcome: { kind: "malformed" } };
```

Reference search: grep `hasAnyToolCall` over the whole repository (src/,
extensions/, tools/, tests/, docs/, excluding node_modules/dist) — exactly 3
hits, all in src/binder/binder-inference.ts (:504 doc comment, :512 declaration,
:533 construction). Zero reads anywhere.

## Why this is a problem

Vestigial field: "the value is never read" — proven across every consumer. The
sole call site is cited above and reads only `kind`/`envelope`; there is no
second caller (grep `extractBinderEnvelope` over src/, extensions/, tools/,
tests/ — 4 hits: the definition, an intra-module doc reference at :119, the
import at production-theta-producer.ts:309, and the one call at :1267). Unlike
most binder seam surfaces in this repository, the field is not even
test-witnessed: no test imports `extractBinderEnvelope` and no test file
mentions `hasAnyToolCall`, so the witness-test carve-out does not apply. The
distinction it encodes is also unclaimed by the spec: grep `hasAnyToolCall`
over docs/ — 0 hits, and the extraction rule in
pi-integration-contract/binder-inference.md pins no wrong-name-vs-plain-text
distinction (the field's own doc comment states both sub-cases are the same
malformed-envelope condition). Git shows it was introduced with the bug-0011
production binder call (`b027a524`) and never gained a reader in any later
commit.

## Suggested direction (non-binding, optional)

Drop the field from the `no-match` arm (making it a bare
`{ kind: "no-match" }`), or have the fix stage decide the distinction should be
surfaced somewhere (e.g. in the malformed-note wording) — either resolution ends
the current compute-and-discard state.

## False-positive check

- Identifier search: grep `hasAnyToolCall` over src/, extensions/, tools/,
  tests/, docs/ — 3 hits, all in binder-inference.ts (doc, declaration,
  construction); 0 reads.
- String-keyed / dynamic access: the identifier grep covers `"hasAnyToolCall"`
  and `['hasAnyToolCall']` spellings (substring match) — 0 additional hits; no
  `JSON.stringify`/`toEqual` deep-comparison of a `no-match` extraction exists
  because no test constructs or receives one (next check).
- Test-caller check: grep `extractBinderEnvelope` over tests/ — 0 hits; grep
  `BinderEnvelopeExtraction` over tests/ — 0 hits. The field is not
  test-only-reachable; it is unread everywhere.
- Re-export check: no barrel files (`export *`) exist under src/, extensions/,
  or tools/; `extractBinderEnvelope` is imported only at
  production-theta-producer.ts:309.
- Spec-mandate check: grep `hasAnyToolCall` over docs/ — 0 hits; the
  binder-inference.md extraction rule and the failure-mode templates
  (determinism-cancellation-failure.md) route wrong-name and plain-text replies
  to the same malformed-envelope row, which is exactly what the sole caller
  does without the field.
- Git-history intent: `git log -S "hasAnyToolCall" -- src/binder/binder-inference.ts`
  — one commit (`b027a524`, bug-0011); no later commit added a reader, and no
  bug doc in docs/ references the field.

## Triage
verdict: confirmed — reproduced independently: `hasAnyToolCall` has exactly 3 repo-wide hits (binder-inference.ts:504 doc, :512 decl, :533 construction) and zero reads; sole caller (production-theta-producer.ts:1274, cited :1267 — minor drift) reads only `.kind`/`.envelope` and folds both no-match sub-cases into `{kind:"malformed"}`; no barrel `export *`, no dynamic/destructured/spread access, 0 test hits for `extractBinderEnvelope`/`BinderEnvelopeExtraction` (so no witness-test carve-out), dist/ hits are build output, and spec binder-inference.md:20 explicitly folds wrong-name and plain-text into one malformed-envelope condition — dead data in production src/, introduced by b027a524 with no later reader (triage: claude-opus-5)
