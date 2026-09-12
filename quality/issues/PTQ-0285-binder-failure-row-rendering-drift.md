---
id: PTQ-0285
title: renderBinderFailureRow renders the needs_info/ambiguous failure rows without the rule-1/rule-2 discipline its sibling renderer applies
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/binder/binder-envelope.ts:283-297
  - src/binder/retry-taxonomy.ts:81-97
  - src/binder/system-note.ts:68-126
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: drift               # D4 only: clone | drift | parallel
wave: qw20260912204251
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-12
---

# renderBinderFailureRow renders the needs_info/ambiguous failure rows without the rule-1/rule-2 discipline its sibling renderer applies

## Observation

Two functions in `src/binder/` render the same two failure-mode-template rows
— `needs_info` and `ambiguous` — both citing the same spec anchor
(`determinism-cancellation-failure.md#failure-mode-templates-normative`):
`binder-envelope.ts`'s `renderBinderFailureRow`/`binderFailureRowPrefix`, and
`retry-taxonomy.ts`'s `renderBinderSystemNote` (which composes through
`system-note.ts`'s `renderFailureNote`). Only the second applies the
System-note rendering discipline (`defaulting-system-note-echo.md
#system-note-rendering`, rules 1 and 2: collapse embedded line breaks/
whitespace runs to one space, and cap the rendered note at 120 code points).
`renderBinderFailureRow` interpolates its `message` argument directly with no
transform.

## Evidence

src/binder/binder-envelope.ts:283-297 — the copy with no rule-1/rule-2 pass:

```ts
export function binderFailureRowPrefix(kind: "needs_info" | "ambiguous"): string {
  return kind === "needs_info" ? "argument binding needs more info" : "ambiguous arguments";
}

/**
 * Render the full failure-mode template row for a terminating binder failure arm
 * (BNDR-3): `theta /<name>: <prefix> — <message>`.
 */
export function renderBinderFailureRow(
  name: string,
  kind: "needs_info" | "ambiguous",
  message: string,
): string {
  return `theta /${name}: ${binderFailureRowPrefix(kind)} \u2014 ${message}`;
}
```

src/binder/retry-taxonomy.ts:81-97 — the copy that composes through the
discipline:

```ts
export function renderBinderSystemNote(
  thetaName: string,
  surface: BinderFailureSurface,
): string {
  switch (surface.kind) {
    case "needs_info":
      return renderFailureNote({
        thetaName,
        fixedPhrase: "argument binding needs more info",
        suffix: surface.message,
      });
    case "ambiguous":
      return renderFailureNote({
        thetaName,
        fixedPhrase: "ambiguous arguments",
        suffix: surface.message,
      });
```

src/binder/system-note.ts:68-126 — the discipline `renderFailureNote` applies
that `renderBinderFailureRow` skips (rule 1's collapse, rule 2's cap):

```ts
export function sanitizeSystemNoteSubstring(raw: string): string {
  const collapsed = raw.replace(ASCII_WHITESPACE_RUN, " ");
  let start = 0;
  let end = collapsed.length;
  while (start < end && collapsed.charCodeAt(start) === 0x20) {
    start += 1;
  }
  while (end > start && collapsed.charCodeAt(end - 1) === 0x20) {
    end -= 1;
  }
  return collapsed.slice(start, end);
}
...
export function renderFailureNote(input: FailureNoteInput): string {
  const suffix = sanitizeSystemNoteSubstring(input.suffix);
  const note = `theta /${input.thetaName}: ${input.fixedPhrase} ${EM_DASH} ${suffix}`;
  return capSystemNote(note);
}
```

Diff verdict: **diverged**. Both sides share the identical fixed-phrase
literals (`"argument binding needs more info"`, `"ambiguous arguments"`) and
the identical `theta /<name>: <prefix> — <message>` grammar, but
`renderBinderFailureRow` composes the row directly (no
`sanitizeSystemNoteSubstring`, no `capSystemNote`) while
`renderBinderSystemNote`/`renderFailureNote` routes the suffix through both.

Concrete divergence on a normative reference input. `defaulting-system-note-echo.md
#system-note-rendering` gives the MUST-reproduce-exactly reference: a
`needs_info` `message` of `` binding\tfailed   here `` (one tab, then three
U+0020) "renders, after rule 1, as the system note `theta /<name>: argument
binding needs more info — binding failed here`" — and the same page states
"[t]he echo channel is also used for the binder's `needs_info` and
`ambiguous` outputs ... both shaped by [System-note rendering]." Evaluating
both renderers on that message:

- `renderBinderFailureRow("x", "needs_info", "binding\tfailed   here")` →
  `` theta /x: argument binding needs more info — binding\tfailed   here `` —
  the tab and the three-space run survive verbatim; this is NOT the spec's
  reference string.
- `renderBinderSystemNote("x", { kind: "needs_info", message: "binding\tfailed   here" })`
  → `sanitizeSystemNoteSubstring` collapses the tab run and the three-space
  run to one U+0020 each → `theta /x: argument binding needs more info —
  binding failed here` — byte-identical to the spec's mandated reference
  rendering.

## Why this is a problem

Both functions purport to render the identical two rows of the identical
normative table (both header comments cite BNDR-3 /
`#failure-mode-templates-normative`; `renderBinderFailureRow`'s own doc
comment claims to render "the full failure-mode template row"), so this is
load-bearing, not incidental: if a caller or a future reader treats
`renderBinderFailureRow` as an equivalent or reference implementation of the
row (its doc comment invites exactly that reading), the row it produces can
span more than one physical line and exceed the 120-code-point cap for
inputs the spec's own reference vector already exercises — the two invariants
`system-note.ts`'s module header calls "the five rules every binder-emitted
system note ... shares." The **right** copy is `renderBinderSystemNote` +
`renderFailureNote`: it is the one wired to production
(`extension/production-theta-producer.ts:1507`), it reproduces the spec's
normative reference rendering exactly (shown above), and `compact-transcript.ts`'s
own `renderCustomTypeUnsafeNote` (a third, unrelated failure-row renderer in
the same directory) independently confirms the pattern by routing through
`sanitizeSystemNoteSubstring`/`capSystemNote` itself. `renderBinderFailureRow`
is the stale copy: chronologically it is not older (bug/commit history was
not needed to establish this — the divergence is demonstrable on the
reference vector alone), but it never received the rule-1/rule-2 wiring its
own doc comment implies it already has.

## Suggested direction (non-binding, optional)

`system-note.ts`'s `renderFailureNote` is the natural shared home
(hypothesis): `renderBinderFailureRow` sits in the same `src/binder/`
directory and could compose through it (as `retry-taxonomy.ts` and
`compact-transcript.ts` already do) instead of assembling the row inline.

## False-positive check

- Reference-vector check: computed both renderers' output against
  `defaulting-system-note-echo.md`'s own MUST-reproduce-exactly `needs_info`
  example (`binding\tfailed   here`) — `renderBinderFailureRow` preserves the
  tab/triple-space; `renderBinderSystemNote` collapses them to the spec's
  exact string. Re-read at the cited line ranges immediately before filing.
- Both-copies-live check: `renderBinderFailureRow`/`binderFailureRowPrefix`
  are exported and exercised by `tests/binder-bypass-envelope.test.ts:279-289`
  (not a dead copy — a witness test calls and asserts on them, even though no
  production import exists: `grep -rn "renderBinderFailureRow\|binderFailureRowPrefix"
  src extensions tools` returns only the declaration site in
  `binder-envelope.ts`). `renderBinderSystemNote` is imported and called at
  `extension/production-theta-producer.ts:328,1507`.
- Spec-anchor check: both functions' header/doc comments cite the same
  `determinism-cancellation-failure.md#failure-mode-templates-normative`
  anchor for the same two rows — this is not a case of two different spec
  clauses each being satisfied independently (the carve-out for normative
  vectors that a spec itself repeats does not apply: the *rendering
  discipline* governing those rows lives in one place,
  `defaulting-system-note-echo.md#system-note-rendering`, and one copy skips
  it).
- Overlap/history check: `docs/bugs/` has no file mentioning
  `renderBinderFailureRow` or `binderFailureRowPrefix` (searched by name;
  zero hits) — this gap has not been previously raised or accepted anywhere,
  unlike this wave's other two candidates. `quality/` (intake + resolved +
  issues) was searched for both names; the only hit,
  `PTQ-0089-binder-envelope-header-two-vs-three.md`, is a header
  bullet-count mismatch in the same file region, not this rendering gap.

## Triage
verdict: confirmed — all three excerpts match the file at the cited lines; independently computed both renderers against the spec's own MUST-reproduce-exactly `needs_info` reference vector (`binding\tfailed   here`): `renderBinderSystemNote`/`renderFailureNote` reproduces `theta /x: argument binding needs more info — binding failed here` byte-for-byte while `renderBinderFailureRow` leaves the tab/triple-space run untouched — a real rule-1/rule-2 violation on a row both doc comments tie to the same BNDR-3/`#failure-mode-templates-normative` anchor; `renderBinderSystemNote` is wired to production (`production-theta-producer.ts:328,1507`) while `renderBinderFailureRow`/`binderFailureRowPrefix`, though otherwise unimported (confirmed via repo-wide grep), are witness-called at `tests/binder-bypass-envelope.test.ts:279-289` so count as live by this repo's convention, making this live-vs-live drift rather than D2 deadness; `compact-transcript.ts`'s `renderCustomTypeUnsafeNote` independently corroborates the shared-discipline pattern; clone-scan finds no group (function too short for the 60-token window) but the manual diff plus the spec vector settle which copy is right; not a dupe of PTQ-0089 (header bullet-count) or PTQ-0046 (unrelated `system-note-channel.ts` arm-count comment) (triage: claude-opus-5)
