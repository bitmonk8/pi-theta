# Triaged Spec Review - spec

_Generated: 2026-06-02T06:11:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T14) is addressed first; the first finding (T11) is addressed last._

_Triage tally: 4 high retained (T11-T14). Medium and lower findings (T01-T10) removed by request._

---

# T11 - README repository-layout table cites stale npm scope `@mariozechner/pi-*`

**Kind:** doc-alignment-broad
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

`README.md`'s repository-layout table describes the `package.json` row as declaring "peer-deps on `@mariozechner/pi-*`". The actual peer-dep scope, used consistently by `package.json` and throughout the spec corpus, is `@earendil-works/pi-*`. The scope prefix is load-bearing: it is the npm organisation under which the four Pi packages resolve, so a reader who consults the README before `package.json` would reference packages under the wrong organisation and fail. This is the lone surviving `@mariozechner/` reference in the repository.

## Solution approach

In `README.md`'s repository-layout table, rename the `package.json` row's `@mariozechner/pi-*` to `@earendil-works/pi-*`.

## Solution constraints

- None.

## Relationships

None
# T12 - Glossary `bypass-eligible` predicate conflicts with the diagnostics registry

**Kind:** naming
**Importance:** high
**Score:** 100
**Must-fix:** true
**Shape:** single
**State:** reduced

## Problem

The closing sentence of the "no-params bypass vs. single-string bypass" entry in `docs/spec_topics/glossary.md` attributes the parse warning `loom/parse/bind-echo-on-bypass` to any "bypass-eligible" loom, but that unqualified predicate covers both bypass conditions defined in the same entry. The diagnostics registry partitions the two cases: `loom/parse/bind-echo-on-bypass` (W, parse) applies only to the single-string bypass, while the no-params case fires `loom/load/bind-echo-without-params` (W, load). The other corpus sites in `binder.md` and `frontmatter.md` already scope the codes correctly; the glossary sentence is the lone outlier, and it gives an implementer two viable codes for `bind_echo: true` on a no-params loom. The two codes differ in phase (parse vs. load) and message text, so the contradiction is wire-visible, not cosmetic.

## Solution approach

Rewrite the closing sentence of the "no-params bypass vs. single-string bypass" entry in `docs/spec_topics/glossary.md` to scope `loom/parse/bind-echo-on-bypass` to the single-string bypass case only. The no-params case is already covered earlier in the same entry by `loom/load/bind-echo-without-params`.

## Solution constraints

- Out of scope: the bypass-code citations in `binder.md` and `frontmatter.md` — already correctly scoped.
- Out of scope: the two diagnostics registry rows in `diagnostics.md` — they are the source of truth this fix aligns to.

## Relationships

None
# T13 - `byte-identical` lacks an encoding / code-unit basis at its owning sites

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

GOV-15's observable-(c) equivalence promise and diagnostics.md's *Placeholder rendering (normative)* subsection both define their guarantee in terms of "byte-identical" rendered content, but loom content strings are JavaScript (UTF-16) values and no owning site names which comparison basis "byte-identical" means — UTF-8-byte equality after serialisation, UTF-16 code-unit equality, or Unicode-code-point equality. The three bases agree for valid Unicode but diverge on lone surrogates and intermediate-encoding round-trips, so the gap bites at the two seams the spec already pins: §6's `\u2028` / `\u2029` survival guarantee and §8's prefix/suffix byte-anchoring rule. A conformance test asserting on a "byte-identical" surround cannot be written reproducibly until the basis is named. GOV-15 owns the equivalence promise; diagnostics.md's *Placeholder rendering* subsection owns the rendering rules — the basis must be pinned at one site and inherited by the other.

## Solution approach

Pin a single named comparison basis at GOV-15 (`#gov-15`), rewriting its "byte-identical after normalising …" definition sentence to name the basis explicitly, and cross-reference [Lexical — Encoding](./spec_topics/lexical.md) where it grounds the Unicode substrate. Have diagnostics.md's *Placeholder rendering (normative)* subsection (`#placeholder-rendering-normative`) inherit the basis by forward-link rather than restating it, and replace each "byte-identical" occurrence in GOV-15, in that subsection, and in the spec.md `#source-language-stability` Scope bullet that forward-links GOV-15 with a single consistent term naming the chosen basis.

## Solution constraints

- Naming the basis changes GOV-15's observable-equivalence definition and is a substantive GOV-15 edit governed by GOV-15's own edit conventions, not GOV-8's *Pure rewording* arm.

## Relationships

- T14 "`SchemaValidator` `errors` array ordering is unspecified" — decision-overlap (both bear on the cross-implementation byte-identical / reproducibility contract for rendered content; a basis chosen here and the ordering chosen there must produce a jointly reproducible `<ajv-summary>` and observable-(c) comparison).
# T14 - `SchemaValidator` `errors` array ordering is unspecified

**Kind:** testability
**Importance:** high
**Score:** 100
**Must-fix:** true
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `SchemaValidator` contract in `implementation-notes.md` (the `validate()` seam returning `errors: readonly ValidationError[]`) pins determinism for a given `(schema, value)` pair but does not constrain the ordering of the `errors` array, leaving cross-implementation ordering undefined. The `<ajv-summary>` placeholder defined in `binder.md`'s Failure-mode templates and consumed by `query.md`'s respond-repair follow-up template renders the failed validation's issues "in `validation_errors` array order", so two conforming validators emit different user-visible follow-up bytes — diverting model responses and making any byte-identical conformance check unwritable. Loom-side handlers reading `errors[0]` and conformance tests asserting sequence equality are likewise undefined without an ordering rule.

## Solution approach

In `implementation-notes.md`'s SchemaValidator contract, clarify that `errors` ordering is implementation-defined and must not be relied on by positional index, and that conformance tests match on issue content rather than sequence. Redefine the `<ajv-summary>` placeholder at `binder.md#failure-mode-templates-normative` and its consumer in `query.md` so the rendered order is deterministic regardless of which conforming validator produced the errors. Specify in `errors-and-results.md`'s `ValidationError` schema that the loom-observable `validation_errors` field carries the same deterministic order before it reaches loom code.

## Solution constraints

- Out of scope: the `byte-identical` encoding / code-unit comparison basis owned by T13.

## Relationships

- T13 "`byte-identical` lacks an encoding / code-unit basis at its owning sites" — decision-overlap (both bear on the cross-implementation reproducibility of rendered content; the comparison basis pinned at T13 and the deterministic `<ajv-summary>` order pinned here must jointly yield a reproducible rendered template).
