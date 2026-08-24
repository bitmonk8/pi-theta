# Bug 0269 — the `params:` *Type side* prose on `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (and its `docs/reference/frontmatter.md:73` mirror) never states that a type text BEGINNING with a quote character must itself be spelled as a quoted YAML scalar (`p: '"a" | "b"'`), so the authoring surface is silent on the exact mistake bug 0263 made diagnosable in 0.262.0; the remedy exists only in the `theta/load/malformed-frontmatter-yaml` row's *Hint* on `docs/spec_topics/diagnostics/code-registry-load.md:17`

- **Status:** open.
- **Sev/Diff estimate:** S4/D1 — S4 because no implementation, test, or registry
  row reads the missing sentence: the diagnostic already fires and already
  carries the remedy, so the gap costs an author one round-trip through a
  diagnostic rather than any wrong behaviour. D1 because the remedy is one or
  two sentences appended to one existing bullet on two pages, with no source,
  registry, witness, or diagnostic-text change.
- **Kind:** defect — omission in normative authoring-surface prose. Everything
  the Type side states is correct; the YAML-level spelling constraint on a
  type text that opens with `"` or `'` is absent.
- **Affected:** `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (line 58,
  `params:` → **Type side**); `docs/reference/frontmatter.md` (lines 73–109,
  `## params:` → **Type side**).
- **Observed at:** HEAD `b2491a8d`, v0.262.0.

## Summary

`p: "a" | "b"` is not valid YAML: the value opens with a double quote, so the
YAML parser reads a quoted scalar `a` and rejects the trailing ` | "b"`. Bug
0263 (fixed 0.262.0) made that failure diagnosable — the load now draws
`theta/load/malformed-frontmatter-yaml` naming line, column, offending text and
the `params:` field. The authored remedy is one pair of enclosing single
quotes, `p: '"a" | "b"'`. That remedy appears in exactly one place at HEAD: the
*Hint* cell of the `theta/load/malformed-frontmatter-yaml` row in the load
registry. The two pages an author writing `params:` reads — the spec topic and
its reference mirror — describe the right-hand side as "inline text, not a YAML
structure" and never state the constraint YAML imposes on how that text is
spelled.

## Reproduction

At HEAD `b2491a8d`:

```
rg -n "quoted YAML scalar|starts with a quote|'\"a\" \| \"b\"'" \
  docs/spec_topics/frontmatter/frontmatter-fields-a.md docs/reference/frontmatter.md
# exit 1 — no match in either file
```

The governing sentences on the spec topic (`frontmatter-fields-a.md:58`) are:

> Each `params:` field's right-hand side is a type expression parsed by the
> theta type grammar — the same grammar used in every other type-annotation
> position […] The type expression is inline text, not a YAML structure: a
> field whose YAML value is neither a scalar nor a flow mapping […] declares no
> type expression and is the load-time diagnostic
> `theta/load/params-type-not-expression` […] A scalar's recovered text must
> itself spell a `Type` […]

The mirror (`docs/reference/frontmatter.md:73–90`) carries the same content
compressed:

> The RHS is inline text, not a YAML structure: a value that is neither a
> scalar nor a flow mapping […] A scalar's recovered text must itself spell a
> `Type`, fragment by fragment — YAML-shaped text, prose, punctuation, or an
> empty string is the same `theta/load/params-type-not-expression`, however it
> is quoted or block-scalar-spelled […]

Both passages name quoting only as a spelling that does not change the
judgement of recovered text. Neither states that a text opening with a quote
must be wrapped for the block to parse at all.

The authoring mistake the pages leave unguarded:

```yaml
---
mode: prompt
params:
  p: "a" | "b"
---
```

The only guidance at HEAD is `docs/spec_topics/diagnostics/code-registry-load.md:17`,
*Hint* column:

> A type text that itself starts with a quote character is not valid YAML
> unless the whole scalar is quoted: write `p: '"a" \| "b"'`, not
> `p: "a" \| "b"`.

The reference diagnostics mirror does not carry it: `docs/reference/diagnostics.md:204`
has no *Hint* column, so the row there is message text only.

## Expected behaviour

The Type side on both pages states the rule in one or two sentences, mirroring
the *Hint*: a type text whose first character is `"` or `'` must be written as
a quoted YAML scalar (`p: '"a" | "b"'`), because the unwrapped form is not
valid YAML and refuses the whole frontmatter block with
`theta/load/malformed-frontmatter-yaml`.

## Actual behaviour / root cause

The Type-side prose predates the `theta/load/malformed-frontmatter-yaml` row's
`params:`-scoped form. Bug 0263 added the row, the `<scope>` clause and the
*Hint*, and its §Fix constraints named the registry, the emission path and the
witness cells; no constraint required the authoring pages to change. The 0263
fix record records the omission as residual 1:

> The `params:` *Type side* prose (`frontmatter-fields-a.md`) still does not
> state that a type text starting with a quote must itself be a quoted YAML
> scalar. §Why it matters observes this; no §Fix constraint requires it, so it
> was left out of scope. The new row's *Hint* now carries the remedy.

So the pages are silent by scope decision, not by oversight in the emission
path: the diagnostic is correct and complete.

**Observation (not covered by this filing's fix).** The adjacent spelling
`p: "a"` is well-formed YAML — the parser strips the quotes and hands the load
the text `a` — so it registers no YAML error and draws
`theta/parse/unresolved-named-type 'a'` instead (bug 0263 §Non-goals, and its
witness row for `p: "a"`). The pages are silent on that face too: an author who
learns "wrap the type text in quotes" from the added sentence and applies it to
a single-arm type gets a name-resolution diagnostic naming a type they did not
intend to declare. That face is fenced here; see §Non-goals.

## Why it matters

Authors reaching for `params:` read `frontmatter-fields-a.md` and its reference
mirror; the load-diagnostic registry is read after a diagnostic fires, not
before writing frontmatter. With the rule only in the *Hint*, the shortest path
from the intended type text `"a" | "b"` to the correct spelling runs through a
failed load. The Type side already carries the neighbouring YAML-shape rules
(scalar vs flow mapping vs block mapping, value-less keys, inline object
types), so the constraint belongs beside them.

## Non-goals

- Reopening bug 0263. Its fix is landed in 0.262.0; this is a prose addition
  on pages that fix did not touch.
- Changing the diagnostic: no message text, no `<scope>` grammar, no severity,
  no phase, no *Hint* wording.
- Admitting the unwrapped spelling `p: "a" | "b"`. The authored form stays
  `p: '"a" | "b"'`.
- The `p: "a"` quote-stripping face beyond the observation note in
  §Actual behaviour / root cause. Whether the pages should also warn that a
  quoted single-arm type text is stripped to a `NamedType` is a separate
  filing; this one adds the leading-quote scalar rule only.

## Fix

Append one or two sentences to the **Type side** bullet on
`docs/spec_topics/frontmatter/frontmatter-fields-a.md:58`, beside the existing
"inline text, not a YAML structure" sentence, stating that a type text whose
first character is a quote must itself be spelled as a quoted YAML scalar
(`p: '"a" | "b"'`), and that the unwrapped form fails YAML parsing and refuses
the block with `theta/load/malformed-frontmatter-yaml`. Make the equivalent
addition to the mirror's Type-side bullet in `docs/reference/frontmatter.md`
(lines 73–109) in the same commit, in the mirror's compressed register.

Line-count discipline: both Type-side bullets are single-paragraph bullets
written as one long line each (`frontmatter-fields-a.md` is 92 lines total, one
line per bullet; the reference mirror wraps at ~78 columns). The addition
extends the existing bullet in place — no new section, no new bullet, and no
change to either file's bullet count.

LOCK, byte-unchanged: bug 0263's witness cells (including the `p: "a"` row's
`theta/parse/unresolved-named-type 'a'`), and the *Hint* cell of the
`theta/load/malformed-frontmatter-yaml` row on
`docs/spec_topics/diagnostics/code-registry-load.md:17`. The added prose
mirrors that Hint's rule; it does not restate it verbatim into the registry or
edit the registry at all.

No source, test, or fixture change. `docs/bugs/README.md` is updated by the
orchestrator.

## Provenance

Bug 0263's fix record (`.pi/tmp/fixes/0263-report.md` §Residuals, item 1),
sixteenth residual set; the 0263 report itself is
[./0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md](./0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md)
(§Why it matters records the same observation, §Non-goals fences the `p: "a"`
face). All citations re-derived at HEAD `b2491a8d`, v0.262.0.
