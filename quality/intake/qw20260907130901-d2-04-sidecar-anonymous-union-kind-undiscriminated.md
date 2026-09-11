---
id: pending
title: SidecarFieldType's anonymous-string-literal-union variant is never distinguished from "other" by any reader
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/schema-lowering.ts:210-213
  - src/parser/schema-lowering.ts:587-593
  - src/parser/schema-lowering.ts:616-620
  - src/parser/schema-lowering.ts:375-379
  - src/parser/schema-lowering.ts:551-557
sites: 5
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SidecarFieldType's anonymous-string-literal-union variant is never distinguished from "other" by any reader

## Observation
`SidecarFieldType` is a three-way union: `"named-enum"`,
`"anonymous-string-literal-union"`, `"other"`. The
`"anonymous-string-literal-union"` variant is constructed at two sites inside
`buildInboundTranslationPlan`'s `classify`. Every reader of the `kind` in the
repository tests only `kind === "named-enum"`; no code path anywhere
distinguishes `"anonymous-string-literal-union"` from `"other"`. The `type`
values die inside `buildSidecar`/`describeArm` (the kind is not part of the
emitted `SchemaSidecar`), so the variant carries a distinction nothing reads.

## Evidence
src/parser/schema-lowering.ts:210-213 — the union:

```ts
export type SidecarFieldType =
  | { readonly kind: "named-enum"; readonly enumName: string }
  | { readonly kind: "anonymous-string-literal-union" }
  | { readonly kind: "other" };
```

Construction sites, src/parser/schema-lowering.ts:587-593 and :616-620:

```ts
      if (isEnumFragment(targetFragment)) {
        // A named-enum `$ref` is terminal: an enum position has no fields or
        // elements of its own to recurse into.
        return enumNames.has(target)
          ? { type: { kind: "named-enum", enumName: target } }
          : { type: { kind: "anonymous-string-literal-union" } };
      }
```
```ts
    if (isEnumFragment(position)) {
      // An inline `{ "type": "string", "enum": […] }` position is an anonymous
      // string-literal union — step 5 keeps those out of the sidecar so
      // equality on them stays plain string equality.
      return { type: { kind: "anonymous-string-literal-union" } };
    }
```

The only two `kind` discriminations in the repository, both `=== "named-enum"`
— src/parser/schema-lowering.ts:375-379 (`buildSidecar`'s `record`):

```ts
    // Named-enum positions: included iff the source type was a named `enum`;
    // anonymous string-literal-union positions are deliberately absent.
    if (type.kind === "named-enum") {
      namedEnumPositions.push({ pointer, enumName: type.enumName });
    }
```

and :551-557 (`describeArm`) — an anonymous classification carries no
`refTarget` (:592, :620 return `type` only), so it falls through both guards to
the terminal `{ document }` return exactly as a bare `"other"` would:

```ts
    const classified = classify(owner, armPointer, arm);
    if (classified.type.kind === "named-enum") {
      return { document, enumName: classified.type.enumName };
    }
    if (classified.refTarget !== undefined) {
      return { document, defName: classified.refTarget };
    }
```

Search evidence: grep `anonymous-string-literal-union` over all *.ts — the
type declaration, the two construction sites, and one test input literal
(tests/schema-lowering-hash.test.ts:217); grep
`SidecarFieldType|type\.kind ===|\.type\.kind` over src/ — the only `kind`
reads on this type are schema-lowering.ts:377 and :552, both `"named-enum"`.
The only other producer module, frontmatter.ts, constructs `{ kind: "other" }`
exclusively (:981, :1080, :1144). Tests assert only on sidecar OUTPUT
(`namedEnumPositions` absence: tests/schema-lowering-hash.test.ts:220-231,
tests/inbound-translation-plan.test.ts:168-182), which `"other"` satisfies
identically.

## Why this is a problem
Vestigial discriminant: a variant tag whose value is never read. The behavioral
cut the two construction sites need — exclude the position from
`namedEnumPositions` and do not recurse — is carried entirely by NOT being
`"named-enum"` and by the absence of `refTarget`/`element` on the returned
`PositionClass`, never by the `"anonymous-string-literal-union"` value itself.
Substituting `{ kind: "other" }` at both sites is observationally identical
across every consumer, including every test assertion. The three-way model is
one classification wider than any reader of it.

## Suggested direction (non-binding, optional)
Collapse the variant into `"other"` and keep the "deliberately absent from the
named-enum map" rationale as the comment it already is at both sites — or name
a reader that is meant to distinguish the two. The fix stage owns the choice.

## False-positive check
Reference searches: grep `anonymous-string-literal-union` across src/, tests/,
extensions/, tools/ — 3 src sites (1 decl, 2 constructions) + 1 test input
literal; grep for `kind` discriminations on `SidecarFieldType` values
(`type.kind ===`, `.type.kind`, `kind !== "named-enum"` spellings) across src/
— only schema-lowering.ts:377 and :552, both testing `"named-enum"`; the
sidecar output shape (`SchemaSidecar`) carries no `type` member, so the kind
cannot escape to wire-translation.ts or any other consumer. String-keyed
access check: no `["kind"]` or serialization of `SidecarFieldType` exists.
Witness-test check: the one test constructing the variant
(tests/schema-lowering-hash.test.ts:207-232) asserts absence from
`namedEnumPositions` — an assertion `{ kind: "other" }` would satisfy
byte-identically, so the tests witness the exclusion behavior, not the
variant. Doc-intent check: the type's doc-comment (:204-208) states the
deliberate absence of anonymous positions from the sidecar — that decision is
encoded by the `"named-enum"`-only inclusion test and stays intact without the
extra variant.

## Triage
verdict: questionable — deadness reproduces exactly (only :377/:552 read the kind, both `=== "named-enum"`; `SchemaSidecar` carries no `type`, so it cannot escape), but git blame 68bf05b1 shows the variant was born unread as a deliberate mirror of schema-subset.md step 5(2)'s named category, so "vestigial discriminant" is unsupported and collapsing it is a modeling-taste call a human should rule (triage: claude-opus-5)
verdict: questionable — re-verified independently: every excerpt byte-matches, the literal occurs in src only at :212/:592/:620 plus one test input (schema-lowering-hash.test.ts:217), the only `kind` reads are :377/:552 (`=== "named-enum"`), no string-keyed access or barrel re-export exists, `SchemaSidecar` carries no `type`, and the :616-621 branch would fall through to :634's `"other"` unchanged — so the label is provably unobservable; but `git log -G` shows only 68bf05b1 (declared the variant beside the step-5(2) witness while `buildSidecar` was an inert stub) and e18b30e5 (added both constructions, still no reader) ever touched it, so it is a deliberate type-level mirror of schema-subset.md step 5(2)'s "deliberately absent" category (doc'd at :204-208), not a leftover; whether an inert spec-mirroring label in a closed union is cruft or legibility is a modeling call a human should rule (triage: claude-opus-5)
verdict: questionable — re-verified a third time: current lines are 206-209/583-589/612-617/373-375/547-552 (drift from filed numbers, content byte-exact); repo-wide grep confirms `anonymous-string-literal-union` occurs only at the declaration and the two constructions in src plus one test-input literal; the only `kind` reads on `SidecarFieldType` values are :373/:548 (both `=== "named-enum"`); `SchemaSidecar` (:301-329) has no `type` member and `SidecarFieldType` is imported nowhere outside this file, so the label cannot escape; `git log -G"anonymous-string-literal-union"` still shows only 68bf05b1 (union declared beside the doc comment while `buildSidecar` was the literal stub `return { wireNames: [], namedEnumPositions: [] }`) and e18b30e5 (added `classify`'s two constructions plus `buildSidecar`'s `record`, already `=== "named-enum"`-only) — the variant was born unread, mirroring schema-subset.md:228-231's named-enum/anonymous-union/other trichotomy though the map-inclusion rule needs only a two-way split; concur with both priors that "vestigial" (decay from a prior reader) is unsupported and collapsing a spec-mirroring, doc-anchored label is a modeling-taste call, not a mechanically proven defect — a human should rule (triage: claude-opus-5)
verdict: questionable — independently reproduced every claim (excerpts byte-match at 206-209/583-589/612-617/373-375/547-552; repo-wide grep finds `anonymous-string-literal-union` only at the declaration, the two constructions, and one test literal; the only `.kind` reads on `SidecarFieldType` values anywhere are :373/:548, both `=== "named-enum"`; `SchemaSidecar` carries no `type` and `SidecarFieldType` is imported nowhere outside this file, so the tag cannot escape; frontmatter.ts's three sidecar-building sites construct only `{kind:"other"}`), so the deadness is real; but "vestigial" is the wrong frame, not merely an unsupported one — beyond the two priors' git-blame point, runtime-value-model.md's Wire-name-translation section and docs/bugs/0174:718 ("The anonymous-string-literal-union rule is untouched. Those positions receive no tag by specification") independently name this exact excluded category as a real, spec-recognized domain distinction (the false-friend case a reader would otherwise wonder about), not code decay — so this is a deliberate legibility choice with no current runtime reader, and collapsing it is a modeling-taste call a human should rule, same disposition as both priors (triage: claude-opus-5)
verdict: questionable — independently re-verified from scratch: excerpts byte-match at current 206-209/586-588/612-616/373/548; repo-wide grep confirms `anonymous-string-literal-union` occurs only at the declaration, the two constructions, and one test-input literal; `SidecarFieldType` is referenced nowhere outside schema-lowering.ts (:206/:219/:235/:367/:458) so it cannot be read via another module; `SchemaSidecar` (:302-336) has no `type` field, confirming the tag cannot escape; frontmatter.ts's three sidecar sites (:946/:1042/:1106) construct `{kind:"other"}` only — the unread-discriminant mechanics are real. But `git log -G"anonymous-string-literal-union"` reproduces to exactly 68bf05b1 and e18b30e5, so the variant was born unread rather than decayed, and I independently confirmed schema-subset.md step 5(2) ("anonymous string-literal-union positions … are deliberately absent") and runtime-value-model.md's Wire-name-translation section (naming the same category to explain why `Severity.Low == "low"` stays false) both single out this exact excluded category by name — so the label mirrors a spec-recognized trichotomy for legibility, not cruft, and collapsing it is a modeling-taste call for a human, concurring with all four priors (triage: claude-opus-5)
verdict: questionable — independently redid every check from scratch rather than trusting the five priors: excerpts byte-match at current 206-209/583-589/612-616/373/548; repo-wide grep still finds `anonymous-string-literal-union` only at the declaration, the two `classify` constructions, and one test-input literal; the only `.kind` reads on `SidecarFieldType` values anywhere are :373/:548 (both `=== "named-enum"`, confirmed by reading both call sites and both witness tests, which assert only `namedEnumPositions` absence — an `{kind:"other"}` fixture would pass identically); `SchemaSidecar` carries no `type` field and `SidecarFieldType` is imported nowhere outside schema-lowering.ts, so the tag cannot escape; frontmatter.ts's three sidecar sites construct only `{kind:"other"}` — the unread-discriminant mechanics hold. But `git show` on both `git log -G` hits (68bf05b1, e18b30e5) confirms the variant was declared alongside its own "deliberately absent" doc-comment while `buildSidecar` was still the inert two-field stub, and docs/spec_topics/schema-subset.md:87(2), runtime-value-model.md's Wire-name-translation section, and docs/bugs/0174:718 all independently name this exact excluded category by its own term — so it is a deliberate spec-mirroring label, not a decayed vestige, and "vestigial" overstates a real but taste-adjudicated fact; concur with all five priors that a human should rule (triage: claude-opus-5)
