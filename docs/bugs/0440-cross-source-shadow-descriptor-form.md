# Bug 0440 — `theta/load/cross-source-shadow` interpolates `<higher>`/`<lower>` as bare resolved file paths instead of the normative descriptor form `<kind>:"<value>"`, so the live note names neither the winning source kind nor either source's own configuration text — and on Windows the interpolated winner path carries the mixed Win32-root-plus-POSIX-tail spelling the 0268 convention removed from every other rendered surface

- **Status:** open.
  `bindExtensions` boot of the shipped extension through the H8a live harness
  (real settings source + real `--theta` CLI source, real model host resolved).
- **Sev/Diff estimate:** S4/D2 — S4: wrong-diagnostics class; no registration,
  priority, or dedup outcome moves (the winner registers correctly, the
  warning-only severity is right), but a spec-pinned rendered message diverges
  from its normative placeholder form, the row's *Hint* ("Remove the
  lower-priority entry") is undermined because the rendered message never says
  which source is the lower-priority one, and the interpolated paths reintroduce
  the mixed-separator spelling on a note-content surface (the 0268/0391
  operability class: one grep spelling cannot match the pass's other notes).
  D2: the mint site is one template literal, but the fix must thread each
  candidate's source-descriptor *value* (the settings entry text, the CLI flag
  string, the package name) through the walk's candidate records — today only
  the `source` kind and a category `sourceLabel` travel — and must adjudicate a
  real spec tension: the closed descriptor-kind set is three arms
  (`settings`, `cli-flag`, `package`) while `DiscoverySource` has five
  (`cli | settings | project | package | global`), so a project-vs-global
  shadow has no pinned descriptor kind at all (GOV-7 governs widening the
  closed set; "The descriptor format is normative").
- **Kind:** defect — implementation diverges from a DIAG-4-normative *Message*
  rendering: the registry template is rendered with the wrong placeholder
  interpolation. `docs/spec_topics/diagnostics/diagnostic-shape.md:74` (DIAG-4:
  "renderers MUST emit it character-for-character with placeholders
  interpolated"); the interpolation rule for these two placeholders is pinned
  at `docs/spec_topics/diagnostics/placeholder-rendering-b.md` §7
  ("**Descriptor-shaped** (`<higher>`, `<lower>`) — rendered via category 5's
  `<descriptor>` rule (`<kind>:"<value>"`)") and §5 ("The descriptor format is
  normative."), with a byte-exact test vector at
  `placeholder-rendering-b.md:84`.
- **Related:**
  - 0268 (fixed 0.265.0) — pinned the one-convention (POSIX forward-slash)
    spelling for `Diagnostic.file` and `details.diagnostics[].file`; its fix
    seams (render head-line + details funnel) deliberately do not reach paths
    embedded in *message* text. This report's observed winner path
    (`C:\…\rootdir/seed0378.theta`) is exactly 0268's "Win32 root + POSIX
    tail" discovery-walk mint resurfacing on a message-content surface.
  - 0391 (fixed 0.394.0) — the SLSH-5 chain-suffix placeholders rendered raw
    native paths where the spec pinned the containment form; the precedent
    that a note-CONTENT path form divergence is a defect against the
    placeholder pin, distinct from 0268's `file`-field seams.
  - 0403 (fixed 0.413.0) — the DIAG-4 divergence class (a rendered message
    diverging from the registry-pinned template with no sanction recorded).
  - 0378 (fixed 0.376.0) — the configuration that produced the live witness
    (case-variant settings+CLI spellings of one physical dir) is 0378's legal
    warning-only pair; its §Non-goals pins the shadow FIRING for a case-variant
    same-file pair as conformant (separator-only candidate identity per
    `docs/spec_topics/discovery/discovery-sources.md:41`). This report does not
    contest that; it is about the note's rendered FORM only.
- **Affected** (verified at 04579e12, v0.415.0):
  - `src/discovery/discovery-walk.ts:1456` — the single mint site:
    `` message: `slash name '${name}' shadowed across discovery sources: '${winner.path}' wins over '${shadowed.path}'` `` —
    interpolates the resolved candidate FILE paths, not descriptors. `rg -n
    CROSS_SOURCE_SHADOW src/` finds no other emitter.
  - `src/discovery/discovery-walk.ts:1443-1445` — the same function's
    same-priority arm renders `theta/load/cross-format-collision` as
    `` `'${candidate.path}'` `` joined with `", "`: the placeholder pin for
    `<paths>` (`placeholder-rendering-b.md` §7 path-shaped list rule) joins
    bare paths with `, ` and pins "Any quoting in the rendered message comes
    from the surrounding registry template" — the registry template
    (`code-registry-load.md:50`) is `slash name '<name>' collides at the same
    priority: <paths>` with no per-path quotes, so the placeholder-supplied
    single quotes are a sibling micro-divergence in the same mint function.
    Explicitly separable: it shares only the mint function, not the
    threading fix — see §Fix.
  - `src/discovery/discovery-walk.ts:28` — `DiscoverySource` five-arm union vs
    the three-arm closed descriptor-kind set of `placeholder-rendering-b.md`
    §5 (the spec-tension the fix must adjudicate).
  - `src/discovery/discovery-walk.ts:690`, `:1142-1144`, `:1269` — the
    candidate records carry `source` and a category `sourceLabel`
    (`sourceLabelOf`), but not the per-source descriptor VALUE ("the settings
    entry, the CLI flag string, the npm package name") the descriptor rule
    interpolates, so the fix is a threading change, not a one-line reword.

## Summary

The registry row (`docs/spec_topics/diagnostics/code-registry-load.md:49`)
pins the *Message* `slash name '<name>' shadowed across discovery sources:
'<higher>' wins over '<lower>'`, and the placeholder pages pin how
`<higher>`/`<lower>` interpolate: they are descriptor-shaped, rendered via the
category-5 `<descriptor>` rule — `<kind>:"<value>"`, kind unquoted from the
closed set (`settings`, `cli-flag`, `package`), value the descriptor's source
text verbatim, format normative. The worked example is byte-exact
(`placeholder-rendering-b.md:84`):

> renders `slash name 'plan' shadowed across discovery sources:
> 'cli-flag:"--theta /proj/a/plan.theta"' wins over 'settings:"~/work/plan.theta"'`

The shipped mint site interpolates `winner.path` / `shadowed.path` — the
resolved per-candidate FILE paths — so the delivered note carries no source
kind, no source configuration text, and (on Windows) the discovery walk's
un-normalised join spelling.

## Reproduction

Live, at 04579e12, H8a harness (`tests/live/harness.ts`), real host
(`claude-sonnet-5` resolved by the shared rule). Scratch probe (deleted;
reconstruction below):

1. Workspace: `<ws>/rootdir/seed0378.theta` (minimal prompt theta);
   `<ws>/.pi/settings.json` = `{"thetaPaths":["<ws-forward-slashed>/ROOTDIR"]}`
   (case-variant spelling); boot `bootShippedExtension` with
   `cliThetaDirs = [<ws>\rootdir]` (native spelling, as a real shell passes).
2. After `session_start`, read the `theta-system-note` channel off the settled
   in-memory `SessionManager`.

Observed (exact bytes, one note):

```
theta/load/cross-source-shadow: slash name 'seed0378' shadowed across discovery sources: 'C:\Users\thomasa\AppData\Local\Temp\theta-live-0378-oC95DE\rootdir/seed0378.theta' wins over 'C:/Users/thomasa/AppData/Local/Temp/theta-live-0378-oC95DE/ROOTDIR/seed0378.theta'
```

- `<higher>` rendered as a bare file path in mixed Win32-root-plus-POSIX-tail
  spelling (the CLI root's verbatim backslash spelling + the walk's `/`-joined
  tail) — no `cli-flag:` kind, no double-quoted flag text.
- `<lower>` rendered as a bare forward-slashed file path — no `settings:`
  kind, no settings-entry text.

The case-variant same-file pair is incidental to the divergence (it maximises
the operator harm: two visually near-identical paths and no way to tell which
configuration entry is the lower-priority one to remove). Any legal two-source
shadow — e.g. a settings dir and a `--theta` dir each holding a same-stem
theta — renders the same bare-path form; the divergence is decidable offline
by inspection of the mint site against the pinned vector.

## Expected behaviour

Per `placeholder-rendering-b.md` §5/§7 and the byte-exact vector at `:84`, the
note for this configuration renders the two sources as descriptors, e.g.:

```
slash name 'seed0378' shadowed across discovery sources: 'cli-flag:"--theta C:\Users\…\Temp\theta-live-0378-oC95DE\rootdir"' wins over 'settings:"C:/Users/…/Temp/theta-live-0378-oC95DE/ROOTDIR"'
```

(kind unquoted; value the source text verbatim — the CLI flag string and the
settings entry as written by the operator.)

## Actual behaviour / root cause

`groupCandidates`' lower-tier loop (`discovery-walk.ts:1451-1457`) builds the
message from `winner.path` and `shadowed.path`. The candidate records in hand
at that point carry `source` (the five-arm kind) and the category
`sourceLabel`, but the descriptor VALUE (the operand text each source was
configured with) is not threaded to the grouping step, so the mint site cannot
render the pinned form today. `discovery-sources.md:41`'s prose ("Both paths
are carried in the diagnostic's rendered `message`") loosely reads as the
current behaviour, but the placeholder page owns the interpolation
(`placeholder-rendering-a.md:9`: the registry row + placeholder category
assignment govern), the descriptor format is expressly "normative", and the
worked vector is unambiguous.

## Why it matters

- The row's *Hint* is "Remove the lower-priority entry." The rendered message
  is the only carrier ("no structured `details` payload is emitted for this
  code", `discovery-sources.md:41`), and without the descriptor kinds the
  operator cannot tell which entry (settings? flag? package?) is the
  lower-priority one — in the live capture the two bare paths differ only in
  directory casing.
- A conformance test written per DIAG-4 ("Tests asserting a diagnostic's
  rendered message MUST source the string from this column") reds against the
  shipped renderer; the one committed assertion touching this message
  (`tests/b0331-root-winner-preempt.test.ts:60`) matches only the fragment
  `"shadowed across discovery sources"`, so the divergence is invisible to the
  suite.
- The interpolated winner path reintroduces the mixed-separator spelling
  (0268's operability regression) on a message surface: the same physical file
  renders forward-slashed in the pass's other load notes and mixed-spelled
  here, so one grep spelling cannot match both.

## Non-goals

- The shadow firing for a case-variant same-file pair: pinned conformant
  (candidate identity is deliberately separator-normalised only,
  `discovery-sources.md:41`; bug 0378 §Non-goals). Not contested here.
- Registration outcomes, priority order, and the winner selection — all
  correct as shipped.
- The `theta/load/cross-format-collision` E-arm's list ORDER pin
  (registered candidates first, then `.md` siblings, priority-then-path) — not
  measured by this report; only its placeholder-supplied per-path quoting is
  cited as the sibling micro-divergence.

## Fix

Options:

1. **Render the pinned descriptor form at the mint site (recommended).**
   Thread each candidate's descriptor value through the walk — the settings
   entry text (`:1144` already has the settings context), the CLI flag string
   (the `--theta` operand as passed), the package name — alongside the
   existing `source`, and render `<kind>:"<value>"` per the closed rule.
   Requires adjudicating the descriptor-kind closed set for `project`/`global`
   shadows (widen the §5 closed set under GOV-7, or pin those two sources'
   descriptor spellings — the corpus already has "global thetas directory" /
   "project .pi/theta/" category descriptors at `discovery-sources.md:63` to
   harmonise with). Constraint, same commit: `discovery-sources.md:41` —
   its prose says the row "nam[es] both paths" ("Both paths are carried in
   the diagnostic's rendered `message`") and so reads as sanctioning the
   shipped bare-path form; that sentence must move in the same commit
   ("names both sources"/descriptors) or the fix contradicts it and the
   corpus stays self-contradictory. Secondary face, separable: the sibling
   `cross-format-collision` quoting (placeholder-supplied `'…'` per path vs
   the pinned bare `, ` join) — take it as a same-commit rider, or split it
   out; nothing in the primary threading fix depends on it.
2. **Re-pin the spec to the shipped path form** (DIAG-4 defers *Message*
   wording changes to theta 2.0, so this arm would have to record the
   divergence as a sanctioned position-specific rendering and rewrite the §7
   descriptor-shaped mapping + the `:84` vector — a spec surgery with GOV-7
   implications, and it abandons the source-attribution the *Hint* needs).

Witness both directions: the pinned vector's configuration (cli-flag vs
settings) renders the descriptor form byte-exactly; a project-vs-global shadow
renders whatever kind spelling the adjudication pins; the collision E-arm's
`<paths>` join matches the registry template with no placeholder-supplied
quotes.

## Provenance

h9a-watcher-live bug-hunt sweep at 04579e12 (v0.415.0). Found while
live-witnessing the 0378 fix (first live witness — real chokidar, case-variant
settings+CLI pair, structural note correctly `1 file(s)`): the boot-phase
shadow note's bytes diverged from the placeholder pin on inspection. Live
probe `tests/live/scratch-h9a-watcher-live.test.ts` (deleted; run recorded in
the hunt log): `npx vitest run --config config/vitest/vitest.live.config.ts
tests/live/scratch-h9a-watcher-live.test.ts` — 2/2 green with the note bytes
quoted in §Reproduction captured via `console.log` from the settled
`SessionManager`.
