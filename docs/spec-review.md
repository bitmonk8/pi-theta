# Triaged Spec Review - spec

_Generated: 2026-06-03T19:20:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T36) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 1 high, 4 medium retained; 13 low discarded; 4 low findings merged into 2 medium findings; 0 nit dropped; 0 false dropped._

---

# T01 - Echo policy illustrative example contradicts the quoting predicate

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The illustrative example under the "Echo policy" section of `docs/spec_topics/binder.md` renders `focus_areas=[error handling, async]` and `author={Ada Lovelace, …}` with the space-containing strings `error handling` and `Ada Lovelace` left unquoted. The format rules that immediately follow require any string with a code point outside `[A-Za-z0-9_.-]` to be quoted, and the reference-rendering table makes this explicit with its `"has space"` → `"has space"` row. The example therefore contradicts the predicate it is meant to illustrate. A reader who pattern-matches on this first example and skips the predicate will emit non-conforming, unquoted output.

## Solution approach

Rewrite the illustrative example line under "Echo policy" so every interpolated value conforms to the format rules below it, quoting the two space-containing strings while leaving the unquoted-branch values intact — e.g. `Running \`/code-review\`: language=TypeScript, focus_areas=["error handling", async], author={"Ada Lovelace", …}`. Keeping `TypeScript` and `async` unquoted exercises both branches of the predicate in one example.

## Solution constraints

- None.

## Relationships

- T24 "Echo policy — 'first field' rule undefined for anonymous inline-object-typed values" — same-cluster (both touch the Echo policy section's example/format rules; resolve independently — the anonymous-inline-object rule is about a missing ordering source, not about quoting).
- T25 "System-note rendering rule 1 — 'whitespace' undefined for collapse and trim" — same-cluster (same Echo policy / System-note rendering surface; resolves independently).
# T02 - Failure-mode templates use an undefined `<provider>` placeholder

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Failure-mode templates (normative)" section in `binder.md` opens with a MUST-emit-verbatim contract and enumerates exactly three interpolated placeholders — `<message>`, `<candidates>`, and `<ajv-summary>`. The transport-failure row of the six-row table renders `loom /<name>: argument binder unavailable (<provider>: <message>)`, but `<provider>` is never defined among the enumerated placeholders. Because the surrounding text is byte-exact normative, two conformant renderers can disagree on what string belongs inside the parenthetical.

## Solution approach

Add a fourth placeholder definition for `<provider>` to the paragraph in binder.md's "Failure-mode templates (normative)" section that currently introduces `<message>`, `<candidates>`, and `<ajv-summary>`, identifying it as the `provider` field of the classifier-produced `TransportError` rendered verbatim — the raw wire provider id, not a normalised form. Forward-link the definition to the `TransportError` schema at errors-and-results.md `#queryerror-variants` and to the Provider error mapping table at pi-integration-contract.md `#provider-error-mapping`.

## Solution constraints

- Out of scope: assigning a BNDR-N REQ-ID anchor to this paragraph (owned by T12).

## Relationships

- T25 "System-note rendering rule 1 — 'whitespace' undefined for collapse and trim" — same-cluster (both are under-defined-token gaps in the same set of normative renderings; resolved independently).
- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — decision-overlap (the placeholder definition edited here will sit under whichever BNDR-N anchor the traceability fix assigns to this paragraph; resolve traceability first if both land together, otherwise independent).
