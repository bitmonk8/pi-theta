---
id: PTQ-0140
title: HostCliDialect's doc roster of the flags Pi accepts omits --no-skills, the one spelling PI_CLI_DIALECT and OMP_CLI_DIALECT both emit
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-launcher.ts:210-219
  - src/runtime/subagent-launcher.ts:254-265
  - src/runtime/subagent-launcher.ts:275-280
  - src/runtime/subagent-launcher.ts:224-227
sites: 4
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# HostCliDialect's doc roster of the flags Pi accepts omits --no-skills, the one spelling PI_CLI_DIALECT and OMP_CLI_DIALECT both emit

## Observation
The `HostCliDialect` doc justifies the intent-level dialect design by
enumerating the flag vocabularies of the two hosts: it lists five Pi spellings
(`-ne`, `--no-prompt-templates`, `--no-themes`, `--no-context-files`,
`--approve` / `--no-approve`) and then states that "Oh-My-Pi has NONE of those
spellings". `PI_CLI_DIALECT`, declared immediately below, emits a sixth
spelling the roster does not name: `--no-skills`. `OMP_CLI_DIALECT` emits
`--no-skills` as well, so it is the one spelling the two dialects share, and
the doc's contrast never accounts for it.

## Evidence
src/runtime/subagent-launcher.ts:210-219 — the roster and the
none-of-those-spellings contrast:

```ts
 * host spells it with. Two hosts run a theta today and they do not share a flag
 * vocabulary, so the contract cannot be one hardcoded flag list:
 *
 *   - Pi accepts `-ne`, `--no-prompt-templates`, `--no-themes`,
 *     `--no-context-files`, `--approve` / `--no-approve`.
 *   - Oh-My-Pi has NONE of those spellings, and it REJECTS unknown flags
 *     outright (`Error: unknown flags: …`, exit code 2 before any session
 *     starts) rather than absorbing them into an extension-flag map the way Pi
 *     does. A Pi-spelled argv therefore does not degrade on Oh-My-Pi — it kills
 *     the child, which the parent observes only as an exit-without-envelope.
```

src/runtime/subagent-launcher.ts:254-265 — `PI_CLI_DIALECT` emits
`--no-skills`, absent from the roster above:

```ts
/** The authored host dialect — Pi (`@earendil-works/pi-coding-agent`). */
export const PI_CLI_DIALECT: HostCliDialect = Object.freeze({
  noExtensionDiscovery: Object.freeze(["-ne"]),
  ambientIsolation: Object.freeze([
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
  ]),
  projectTrust: Object.freeze(["--approve"]),
  noProjectTrust: Object.freeze(["--no-approve"]),
});
```

src/runtime/subagent-launcher.ts:275-280 — `OMP_CLI_DIALECT` emits the same
`--no-skills`:

```ts
export const OMP_CLI_DIALECT: HostCliDialect = Object.freeze({
  noExtensionDiscovery: Object.freeze(["--no-extensions"]),
  ambientIsolation: Object.freeze(["--no-skills", "--no-rules"]),
  projectTrust: Object.freeze([]),
  noProjectTrust: Object.freeze([]),
});
```

The doc's later sentence about what the two hosts share (:224-227) names only
`--no-rules` as a host-specific ambient-instruction source and does not
mention the shared `--no-skills`:

```ts
 * inherits those ambient sources and that default trust posture. The isolation
 * that IS expressible is expressed — Oh-My-Pi's `--no-rules` is an
 * ambient-instruction source Pi has no counterpart for, and belongs to the same
 * intent as `--no-context-files`.
```

## Why this is a problem
The roster is a stated enumeration whose counted members are contradicted by
the constants declared 40 lines below it: `PI_CLI_DIALECT.ambientIsolation`
carries four flags of which the doc names three, and the missing one
(`--no-skills`) is the single flag both dialects emit — precisely the case the
"Oh-My-Pi has NONE of those spellings" contrast is used to rule out. The
enumeration is load-bearing rather than illustrative: it is the evidence the
comment offers for the claim that the two hosts "do not share a flag
vocabulary", and it is the list a reader checks a dialect against when adding
a flag.

## Suggested direction (non-binding, optional)
The two rosters and the shared/unshared contrast can be brought into agreement
with the two frozen constants they annotate, so that the vocabulary comparison
covers every flag the dialects actually emit.

## False-positive check
- `grep -rn '"--no-skills"' --include=*.ts src extensions tools tests` — the
  only `src/` declarations are the two dialect constants cited above
  (subagent-launcher.ts:258 and :277); tests assert both dialects' arrays
  verbatim, so both emissions are live.
- Read the full `HostCliDialect` doc block (subagent-launcher.ts:206-242): the
  Pi roster appears once, at :213-214, and `--no-skills` appears nowhere in the
  block.
- `git log -S'"--no-skills"' --oneline -- src/runtime/subagent-launcher.ts` —
  `--no-skills` has been in `PI_CLI_DIALECT` since the RFC-0005 commit
  (`fda23a4b`), predating the commit that authored the roster sentence and the
  Oh-My-Pi dialect (`7f360d20`), so the omission is not a value added after the
  roster was written.
- Verified the roster's other claims hold: Oh-My-Pi indeed carries none of the
  five spellings it names, and `OMP_CLI_DIALECT`'s empty project-trust arms
  match the "no project-trust flag" statement. The single mismatch is the
  omitted `--no-skills`.
- No dynamic/string-keyed access to the dialect constants
  (`grep -rn "CLI_DIALECT" --include=*.ts src extensions tools` returns only
  direct references).

## Triage
verdict: confirmed — all four excerpts verified verbatim at the cited lines; the roster (:213-214) omits --no-skills, which PI_CLI_DIALECT (:258) and OMP_CLI_DIALECT (:277) both emit, so the "NONE of those spellings" non-overlap contrast drops the one shared flag that the spec's own dialect table (subagent.md:67) names for both hosts (triage: claude-opus-5)
