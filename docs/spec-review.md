# Triaged Spec Review - spec

_Generated: 2026-06-02T06:11:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T12) is addressed first; the first finding (T11) is addressed last._

_Triage tally: 2 high retained (T11-T12). Medium and lower findings (T01-T10) removed by request._

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
