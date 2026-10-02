# Bug 0509 — `invocation.md` and its `discovery-cli.md` mirror state `invoke(...)` path resolution as caller-relative with no `.thetalib` exception and no cross-reference to `imports.md:17`: since the bug-0504 fix the sentence misdescribes shipped behaviour for an `invoke` written in a `.thetalib` `fn` body

- **Status:** open — filed 2026-10-02 as residual 5 of the bug-0504 fix
  ([0504](./0504-thetalib-invoke-resolves-caller-relative.md),
  `## Fix (0.495.0)` → Residuals, item 5)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S4/D1 — S4: spec-prose drift; the shipped runtime
  follows the governing sentence (`imports.md:17`) and no behaviour changes.
  D1: two sentences in two files (one spec page, one reference mirror), no
  registry row, no code, no witness beyond the existing
  `tests/b0504-thetalib-invoke-resolves-lib-relative.test.ts`.
- **Where (pi-theta, main 12f1ccfd, 0.495.0):**
  - `docs/spec_topics/invocation.md:10` — the *Resolution* paragraph opens:
    "**Resolution.** `path` is a string literal, resolved at parse time
    relative to the calling theta's directory." The paragraph mentions `.thetalib` only as a
    rejected callee extension and does not link `imports.md`.
  - `docs/reference/discovery-cli.md:305-306` — the `## \`invoke\`
    invocation` section's *Resolution* bullet: "**Resolution.** The path is a
    string literal resolved at parse time relative to the calling theta's
    directory;". The section (`:300-311`) is a condensed mirror of
    `invocation.md:3-10`: its lead sentence restates `invocation.md:3`'s
    "only way for a `.theta` to spawn/attach … by an inline path literal.
    `import` is reserved for `.thetalib`", and its *Resolution* bullet
    restates `invocation.md:10` clause for clause (extension rule,
    forward-slash rule, no dynamic paths, discovery-root containment, INV-1
    re-check).
- **Spec (governing):** `docs/spec_topics/imports.md:17` — "May call
  `invoke(...)`. The path resolves relative to the `.thetalib` file's
  location; the invocation executes against the *calling* `.theta`'s
  conversation …". No `docs/reference/**` page mirrors this sentence:
  `rg -n "thetalib" docs/reference/*.md | rg -i invoke` returns
  `type-system.md:209` (enum identity across an in-process `invoke`) and
  `discovery-cli.md:344` (callee import resolution in the static walk) only.

## Symptom

A reader of `invocation.md` or `discovery-cli.md` learns that every
`invoke(...)` path resolves against the calling theta's directory. An
`invoke("./worker.theta", …)` inside a `.thetalib` `fn`, with `worker.theta`
beside the library, then reads as resolving beside the importing `.theta` —
the opposite of what 0.495.0 does. Before the bug-0504 fix the sentence
matched the defective implementation by accident; after it, the sentence and
the runtime disagree for the lib-body case.

## Expected

The two invocation surfaces agree with `imports.md:17` and with each other:
the caller-relative rule covers a path literal written in a `.theta` body;
a path literal written in a `.thetalib` `fn` body resolves against that
`.thetalib` file's location, regardless of which theta imported the fn. The
spec page and its reference mirror state the same split.

## Actual

- `invocation.md:10` and `discovery-cli.md:305-306` state the
  caller-relative rule unconditionally, quoted verbatim under **Where**.
- The runtime at 0.495.0 implements the split.
  `InvokeMachinery.resolveInvoke` (`src/extension/invoke-machinery.ts`)
  derives the path base as `env.currentResidence() ?? theta.sourcePath`, and
  `resolveCalleeAgainstBase` (same file) joins the literal against
  `dirname` of that base. `currentResidence()` answers the declaring
  `.thetalib` inside an imported fn body and is `undefined` in a `.theta`
  body.
- `tests/b0504-thetalib-invoke-resolves-lib-relative.test.ts` pins both
  arms: cells (A) / (A-par) / (B) / (D) / (E1) / (E2) pin lib-relative
  resolution for lib-body sites; cell (C2) pins caller-relative resolution
  for a caller's own direct `invoke`.

`relative to` inventory across `docs/spec_topics/**` and
`docs/reference/**` (path-resolution sentences only):

| site | subject | status |
|---|---|---|
| `spec_topics/invocation.md:10` | `invoke(...)` path | defect — no `.thetalib` exception |
| `reference/discovery-cli.md:305-306` | `invoke(...)` path (mirror of the above) | defect — no `.thetalib` exception |
| `spec_topics/imports.md:17` | `invoke(...)` in a `.thetalib` | governing sentence |
| `spec_topics/imports.md:22` | `import` path → importing file's directory | correct |
| `spec_topics/discovery/discovery-sources.md:15` | `import` path → importing file | correct |
| `spec_topics/frontmatter/frontmatter-fields-a.md:82` | `tools:` `.theta` path → calling theta's directory | correct — a `.thetalib` has no frontmatter; 0504 pins the `tools:`-callable route caller-relative |
| `reference/frontmatter.md:173` | `tools:` `.theta` path (mirror of the above) | correct, same reason |

The remaining `relative to` hits (`reference/discovery-cli.md:205-206`
settings `thetaPaths`, `discovery/package-and-settings.md:21` DISC-5
`pi.theta` entries) concern discovery paths, not invoke resolution.

## Root cause

`invocation.md:10` states the `.theta`-body rule as the whole rule, and
`discovery-cli.md:305-306` condenses that unscoped sentence; neither defers
to `imports.md:17` for the `.thetalib`-body case. The bug-0504 fix changed the runtime to
match `imports.md:17` and left both prose surfaces unchanged (0504 review
round 1, R5).

## Fix direction

Prose only; two files, edited in the same commit so the spec page and its
mirror stay in step.

1. `docs/spec_topics/invocation.md:10` — scope the first sentence to a
   `.theta` body and add the `.thetalib` arm with a cross-reference, e.g.:
   "`path` is a string literal. Written in a `.theta` body it resolves at
   parse time relative to the calling theta's directory; written in a
   `.thetalib` `fn` body it resolves relative to that `.thetalib` file's
   location, whichever theta imported the fn (see
   [Imports — `.thetalib` file rules](./imports.md))." The rest of the
   paragraph (extension, separator, dynamic-dispatch rules) is unchanged and
   applies to both arms.
2. `docs/reference/discovery-cli.md:305-306` — the same split in the
   bullet's register: "The path is a string literal; in a `.theta` body it
   resolves at parse time relative to the calling theta's directory, in a
   `.thetalib` `fn` body relative to the `.thetalib` file's location (see
   [Imports](../spec_topics/imports.md)); …". `discovery-cli.md` already
   links into `../spec_topics/` from three sites.

The `.thetalib` arm carries no "at parse time" clause: no load-time walk
visits an invoke site inside an imported `.thetalib` fn body (0504 residual
4), so the base is applied at the runtime boundary only. Restating timing
for lib-body sites belongs to that residual.

## Non-goals

- The `tools:` `.theta` path sentences
  (`frontmatter-fields-a.md:82`, `reference/frontmatter.md:173`) stay as
  written: `tools:` lives in a `.theta`'s frontmatter, which a `.thetalib`
  does not have.
- `imports.md:17` is unchanged; it is the governing sentence. No anchor is
  added there.
- No runtime, test, or diagnostic-registry change.
- Load-time coverage of lib-body invoke sites (cycle detection, INV-1 load
  arm, INV-3 arity, `invoke<Schema>` return check) stays with 0504
  residual 4.

## Repro

At 12f1ccfd:

```
rg -n "relative to the calling theta's directory" docs/spec_topics/invocation.md
rg -n "relative to" docs/reference/discovery-cli.md
rg -n "relative to the \`.thetalib\` file's location" docs/spec_topics/imports.md
```

The first prints `10:`, the second prints `205:`, `206:`, `305:` (the
`invoke` sentence continues on `306`), the third prints `17:`.
`rg -n "imports.md" docs/spec_topics/invocation.md docs/reference/discovery-cli.md`
prints `invocation.md:20` and `invocation.md:97` only — no link from either
*Resolution* text.

## Provenance

- `docs/bugs/0504-thetalib-invoke-resolves-caller-relative.md` —
  `## Fix (0.495.0)`: residual 5 (this report), residual 4 (lib-body static
  walk), pinned dispositions (`tools:` route and caller-written paths stay
  caller-relative).
- `docs/spec_topics/invocation.md:3-10`, `docs/spec_topics/imports.md:17`,
  `:22`, `docs/reference/discovery-cli.md:1-7`, `:300-311` — read at
  12f1ccfd.
- `InvokeMachinery.resolveInvoke`, `resolveCalleeAgainstBase`
  (`src/extension/invoke-machinery.ts`) — the shipped resolution base.
- `tests/b0504-thetalib-invoke-resolves-lib-relative.test.ts` — cells
  (A)–(E2).
- Inventory: `rg -n "relative to" docs/spec_topics docs/reference`, filtered
  to path-resolution sentences.
