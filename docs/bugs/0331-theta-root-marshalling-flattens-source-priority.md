# Bug 0331 — marshalling every discovery root into one child `--theta` flag flattens the parent's source-priority structure to a single CLI tier: a slug legally shadowed in the parent (settings copy wins over project copy, warning only) re-collides in the child at the same priority, both copies drop, and the marked root never registers — the subagent invocation of a parent-runnable theta refuses on every attempt

- **Status:** open.
- **Sev/Diff estimate:** S2/D3 — S2 because a documented-legal
  configuration (cross-source shadowing is a warning; "the higher-priority
  source wins", discovery-sources.md §Source priority) makes the shadowed
  slug's subagent form permanently uninvocable: every launch dies in the
  child's load pass with a `cross-format-collision` the parent's
  configuration does not have, surfaced to the parent only as the generic
  `load_failure` envelope (or, pre-0178-style, nothing actionable naming
  the cause). Loud but wrong-cause, and configuration-dependent in the
  worst way: adding an unrelated sibling theta to the shadowed directory
  is what arms it (that is what keeps the shadowed dir in `activeRoots`).
  Not S1: the failure is a refusal, not silent wrong bytes — though only
  because the collision rule drops BOTH copies; bug 0328's missing
  root-callee hash removes
  the safety net that would catch a variant where the wrong copy won.
  D3 because the clean fixes all restructure the launch contract: the
  contract itself pins ONE `--theta` flag carrying the root union, so the
  implementation is conformant to the letter and the defect is jointly
  spec-side (subagent.md's own premise — the child "discovers the same
  `.theta` / `.thetalib` files from disk" — is falsified by its own launch
  table).
- **Kind:** spec gap plus implementation consequence — no spec sentence
  prescribes how the parent's five-tier source structure survives the
  process hop; the launch table's chosen carrier (`--theta`, a single
  priority-1 source) cannot represent it, and the child's collision rules
  then adjudicate a configuration the parent never had.
- **Related:**
  - 0310 (open) — the same `activeRoots = dirnames of discovered thetas`
    derivation feeding the watcher; here it feeds the child argv
    (`production-theta-producer.ts:2200`). Disjoint symptom, shared
    derivation; a 0310 fix (union instead of dirnames) does not change
    this report's outcome — the union flattens identically.
  - 0008 (fixed) — established the one-joined-flag `--theta` carriage this
    report shows to be lossy in a second dimension (priority, not
    membership).
  - [0328](./0328-root-callee-closure-hash-never-marshalled.md) — the missing root hash that would
    otherwise backstop any variant where the child resolves the NAME to
    different bytes than the parent validated.
- **Affected** (at ee681f7b, v0.287.0):
  - `docs/spec_topics/pi-integration-contract/subagent.md` launch-contract
    table — "the parent's discovery-root union … `--theta <dirs>` — one
    flag, all roots joined".
  - `src/extension/production-theta-producer.ts:2200` —
    `thetaDirs: this.#input.activeRoots ?? []`.
  - `src/extension/production-composition.ts:634–636` — `activeRoots` =
    dirnames of discovered (post-shadow WINNER) thetas; the shadowed
    copy's dir enters via any sibling theta it hosts.
  - `resolveSlashNames` (`src/discovery/discovery-walk.ts`) —
    same-priority theta-vs-theta: "every colliding theta drops"; all
    `--theta` components are one priority tier.
  - `src/extension/production-composition.ts:1119`
    (`markedRootRegistrationRefusal`) — converts the child-side drop into
    the terminal refusal envelope.
- **Observed at:** v0.287.0 (ee681f7b), offline — deterministic vitest
  probe (deleted after confirmation; recipe below): parent pass and
  simulated child pass through `discoverAndComposeFixtures`, the child
  with the authenticated regime env and `pi.getFlag('theta')` returning
  the exact two dirs the parent-side derivation produces.

## Summary

The parent's discovery structure is five prioritised sources; conflicts
resolve by tier (shadow warning across tiers, collision drop within one).
The launch contract compresses whatever that structure discovered into one
`--theta` flag — the CLI source, tier 1 — so every parent root re-enters
the child at the SAME tier. Any slug present in two marshalled roots
therefore collides in the child. The parent-side shadow case produces
exactly that shape: the winner's dir is always in `activeRoots` (the
winner was discovered), and the loser's dir is in `activeRoots` whenever
any other theta lives beside it — the ordinary layout for a project
`.pi/theta/` with several thetas, one of them shadowed by a settings root.
The child's own conventional sources cannot rescue the slug: the project
copy also arrives via the project source at tier 3, but its tier-1 CLI
duplicate has already collided the name out (and the observed pass drops
the name entirely, registering neither copy).

## Reproduction

Offline, deterministic. Workspace:

```
.pi/theta/zqx-review.theta   description: PROJ COPY   (project source)
.pi/theta/zqx-other.theta    description: OTHER       (the arming sibling)
alt/zqx-review.theta         description: ALT COPY    (settings source)
.pi/settings.json            {"thetaPaths": ["../alt"]}   (entries resolve against .pi/)
```

1. **Parent pass** (`discoverAndComposeFixtures`, no regime env):
   registers `zqx-review` (description ALT COPY — settings tier 2 beats
   project tier 3) + `zqx-other`; one `theta/load/cross-source-shadow`
   warning. Legal, working configuration; `/zqx-review` invocable.
   `activeRoots` per `production-composition.ts:634` =
   `{.pi/theta, alt}` (dirnames of the two discovered thetas).
2. **Child pass** (regime env authenticated, `PI_THETA_SUBAGENT_ROOT=
   zqx-review`, `pi.getFlag('theta')` = `.pi/theta<delim>alt` — the exact
   marshalled argv value): emits

   ```
   theta/load/cross-format-collision: slash name 'zqx-review' collides at
   the same priority: '….pi\theta/zqx-review.theta', '…alt/zqx-review.theta'
   ```

   and registers only `zqx-other`. The marked root is absent →
   `markedRootRegistrationRefusal` → the load pass's `load_failure`
   envelope is the invocation's outcome. Every launch of `/zqx-review`
   fails this way while the configuration stands.

Incidental observation from the same probe, recorded for the fixer: the
child also emitted a self-shadow warning for the UNSHADOWED sibling —
`slash name 'zqx-other' shadowed across discovery sources:
'….pi\theta/zqx-other.theta' wins over '….pi/theta/zqx-other.theta'` —
the SAME file reached via the CLI root and the project source under two
separator spellings, surviving only by tier rather than by identity
dedup. Every project theta in every real subagent child draws one such
spurious warning per launch (the marshalled dir and the child's own
project source always overlap); same root cause, same fix surface.

## Expected behaviour

Two spec statements jointly: subagent.md `#subagent-theta-callable-hash`
premises the whole child-side resolution model on "the theta extension
loads in the child and discovers the same `.theta` / `.thetalib` files
from disk"; discovery-sources.md §Source priority makes the parent's
file set a function of tier structure, not just of root membership. A
child that cannot represent the tiers does not discover "the same files"
for any configuration where tiers did work. No third statement prescribes
a disposition for the clash — that adjudication is the ask.

## Actual behaviour / root cause

`assembleSubagentArgv` has one expressive slot (`--theta`, tier 1) for
five parent tiers; `resolveSlashNames` then applies the within-tier rule
("every colliding theta drops", `resolveSlashNames` in
`src/discovery/discovery-walk.ts`) to a collision
the parent's structure had already resolved. The implementation follows
the launch table; the launch table cannot carry the structure.

## Why it matters

- Shadowing is the documented mechanism for overriding a project theta
  from settings (or a package theta from a project); using it on any
  subagent-mode theta whose original sits beside one other theta makes
  that theta's subagent form dead, with a collision message naming a
  configuration the user never wrote.
- The failure is remote from its cause: it appears only inside spawned
  children, so `/zqx-review` works interactively (prompt-mode dispatch,
  parent registry) while every `invoke`/`tools:` use of it dies — a
  mode-dependent split nothing documents.
- The per-launch spurious self-shadow warning (observation above) is
  standing noise on every subagent child with any project theta.

## Non-goals

- The dirnames-vs-union derivation itself (0310) — either derivation
  flattens.
- Settings file-entry widening (a `thetaPaths` FILE entry contributes its
  parent dir, so the child discovers siblings the parent's entry excluded)
  — same root cause, unprobed here, one sentence for the fixer.
- Delimiter-in-path carriage — accepted limitation (0008).

## Fix

Not yet decided — needs a spec adjudication first. Options:

1. **Marshal the winner FILES' provenance, not just roots** — e.g. keep
   `--theta` for roots but have the child's load pass, under the regime
   marker, resolve marshalled-root collisions by the parent's outcome
   (a small env carrier naming the winning path per shadowed slug, or
   only for the marked root). Smallest surface: the marked root is the
   only slug the child must get right; its winning source path could ride
   the existing control plane and pre-empt collision for that slug alone.
2. **Spec-side acceptance** — document that shadowed slugs are
   subagent-unrunnable and emit a parent-side load warning when a
   `mode: subagent` theta is registered over a shadowed sibling; zero
   child changes, documents the trap.
3. **Fold with bug 0328's root hash** — a marshalled root-callee hash
   plus option 1's winner path gives the child both identity and bytes;
   the two reports' fixes share a carrier.
   Any fix must keep bug 0008's single-flag carriage and add a
   regression cell: parent-shadowed slug + arming sibling → child
   registers the parent's winner.

## Provenance

Bug-hunt area `subagent-integrity`, seed hypothesis 6 (root-regime
marshalling fidelity: globs/exclusions/priority across the process hop).
Probed offline at ee681f7b; probe deleted after confirmation.
