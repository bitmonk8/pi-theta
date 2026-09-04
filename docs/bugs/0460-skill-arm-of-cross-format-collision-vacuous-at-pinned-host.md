# Bug 0460 — The `.md`-skill arm of the cross-format collision rule is vacuous at the pinned host: skills enumerate as `skill:<name>`, the byte-exact comparison can never match a theta stem, so the spec's thrice-stated "`.md` skills preempt a same-named theta" never happens and a same-stem theta and skill silently coexist

- **Status:** open.
- **Sev/Diff estimate:** S5/D2 — S5: doc/spec drift with a benign shipped
  disposition (the coexistence is harmless at the pin — `/foo` and
  `/skill:foo` are disjoint invocation names, so no dispatch is ambiguous
  and nothing is silently lost); D2: the fix is an adjudication, not a
  mechanical edit — either the spec's skill arm is rewritten to match the
  host's disjoint skill namespace (recommended, touches three normative
  passages plus the seam-set note) or the implementation derives a
  stem-slug for `source: "skill"` entries and starts dropping thetas the
  current host never needed dropped (a behaviour change that costs authors
  a working theta).
- **Kind:** spec gap — spec and implementation together fail to deliver
  documented behaviour: DISC-4 rule 2 and its prose paragraph normatively
  include `.md` skills among the formats that "preempt a same-named theta",
  but no input can produce that preemption at the theta 1.0 Pi-SDK pin, and
  the spec's own slug-conformance clause ("`.md` files whose stems do not
  conform are skipped for collision purposes") contradicts the preemption
  claim for every skill the host reports (every reported skill name carries
  a `:`).
- **Related:**
  - [bug 0458](./0458-package-theta-bypasses-pi-owned-collision-guard.md) — the package arm never reaches the
    Pi-owned comparison at all; this report is about an arm that is reached
    and can never match.
  - 0024 (fixed 0.36.0) / PIC-69 — defines the three-arm collision source
    set (`"prompt"`, `"skill"`, `"extension"`) this report shows has an
    unreachable arm at the pin. Its own §Fix (`:355`) restates the same
    unreachable claim ("A newly-appeared prompt template or skill of the
    same name then still drops the theta"), so a fixer must not treat that
    sentence as corroboration of the skill arm's reachability.
- **Affected** (verified at 401a425b, v0.437.0):
  - `docs/spec_topics/discovery/discovery-sources.md:85` (DISC-4 rule 2:
    "collides with a Pi-owned `.md` prompt, `.md` skill, or…") and `:91`
    (three statements: the refusal spans skills; "the rule is symmetric in
    which formats it spans (`.md` prompts, `.md` skills, and other
    extensions' commands all preempt a same-named theta)"; "The candidate
    slug for a `.md` prompt or skill is derived under the same
    `^[a-z0-9][a-z0-9_-]*$` rule used for `.theta` stems").
  - `docs/spec_topics/pi-integration-contract/registration-steps.md:10,20` —
    step 3 drops on an existing entry whose `source` is in the three-arm
    set; the seam note keeps `"skill"` as a live arm.
  - `docs/spec_topics/pi-integration-contract/host-prerequisites.md:66` —
    the completeness presupposition asserts `pi.getCommands()` "already
    enumerates every command Pi registers from prompt templates and skills",
    implying skill entries are comparable collision candidates.
  - `src/extension/production-composition.ts:3745-3765` —
    `readPiOwnedCommands` admits `source === "skill"` entries into the
    collision set with their host-reported names.
  - `src/discovery/discovery-walk.ts:1442,1458` — `piNames.has(name)` is a
    byte-exact membership test against theta stems matching
    `^[a-z0-9][a-z0-9_-]*$` (`discovery-walk.ts:98`; spec pin
    `discovery-sources.md:80`, the Filename-validity paragraph), which can
    never contain `:`. The arm itself is LIVE code, not dead: a bare-named
    `{ name: "foo", source: "skill" }` entry — a shape the pinned host
    never emits — DOES drop the theta (probed, §Reproduction arm 3); only
    the host's `skill:` prefixing makes it unreachable.
  - Host evidence (pinned SDK): `dist/core/agent-session.js:1841` — skills
    enumerate as `` name: `skill:${skill.name}` ``; `:957` — dispatch reaches
    a skill only via the `/skill:` prefix (`_expandSkillCommand`'s
    `startsWith("/skill:")` gate). There is no bare-name skill command
    surface at the pin. The prefixing is verifiable in-repo from the
    vendored dist of `@earendil-works/pi-coding-agent@0.80.10` (manifest
    pin `~0.80.10`), not from the `.d.ts` surface, which only types
    `source` as a union.
- **Observed at:** v0.437.0 (401a425b), offline — factory +
  `composeExtensionInstance` over a real temp workspace; scratch probe
  deleted, reconstruction in §Reproduction.

## Summary

DISC-4 rule 2 lists three Pi-owned formats that preempt a same-named theta;
for two of them the rule is live (prompt templates and foreign extension
commands enumerate under their bare names). Skills do not: the pinned host
enumerates every skill as `skill:<name>` and dispatches it only as
`/skill:<name>`. The extension's collision test is byte-exact membership of
the theta stem in the reported-name set, and a conforming stem can never
equal a `skill:`-prefixed string, so no skill ever drops any theta. The
spec's own slug clause even mandates skipping non-conforming names, making
the skill arm doubly vacuous under the name-comparison reading — while its
preemption claim ("`.md` skills … all preempt a same-named theta") asserts
the opposite outcome under a stem-derivation reading. One of the two spec
readings is dead text; the other is unimplemented; the implementation ships
a third, sensible disposition (coexistence) that no spec sentence states.

## Reproduction

Offline, at 401a425b. Scratch vitest (deleted): factory wired to
`composeExtensionInstance`; workspace `.pi/theta/foo.theta` (minimal prompt
theta); harness `pi.getCommands()` returning
`[{ name: "skill:foo", source: "skill" }]` — the exact shape the pinned host
reports for a skill named `foo` (`agent-session.js:1841`); fire
`session_start`; capture registrations and `pi.sendMessage` notes.

Observed: `registrations: ["foo"]`, notes `[]` — the theta registers with
zero diagnostics beside the same-stem skill. Expected under DISC-4 rule 2's
preemption claim: the theta drops with `theta/load/cross-format-collision`
naming both. (Both directions: substituting
`{ name: "foo", source: "prompt" }` in the same harness drops the theta and
emits the collision note, so the collision machinery itself is live — the
skill arm alone cannot fire.)

Arm 3 (counterfactual — proves the implementation arm is live, not dead
code): `{ name: "foo", source: "skill" }`, a bare-named shape the pinned
host never emits → 1 collision diagnostic; `foo` drops. The `"skill"`
branch fires on any bare-named entry; only the host's `skill:` prefixing
makes it unreachable — which converts the future-Pi hazard in §Why it
matters from assertion to demonstration.

## Expected behaviour

Per `discovery-sources.md:91` a theta `foo.theta` beside a skill `foo` is
refused and the skill "remains registered and continues to function". Per
the same paragraph's slug clause, a `.md` whose derived slug does not
conform is "skipped for collision purposes" — and every host-reported skill
name (`skill:foo`) is non-conforming, so the same paragraph also prescribes
the skip. The corpus asserts both outcomes for one input.

## Actual behaviour / root cause

`readPiOwnedCommands` forwards skill entries verbatim;
`resolveSlashNames`'s `piNames.has(name)` compares theta stems against
`skill:`-prefixed names; no match is possible. The theta registers; `/foo`
(theta) and `/skill:foo` (skill) coexist. The implementation's comparison
matches registration-steps.md step 3's letter ("slash name collides with an
existing entry") — an entry's slash name IS its `skill:`-prefixed invocation
name — but falsifies discovery-sources.md's preemption claims and leaves
the `"skill"` arm of the PIC-69 source set unreachable at the pin (live
code with no reachable input, per §Reproduction arm 3).

## Why it matters

- Three normative sentences promise a behaviour no input can produce —
  exactly the class the version-bump re-validation apparatus is supposed to
  keep honest (a future Pi that enumerates skills bare would silently
  activate the arm and start dropping thetas that today coexist, an
  unreviewed behaviour flip).
- The slug-derivation sentence ("derived under the same … rule used for
  `.theta` stems") reads as if implementations must derive slugs from `.md`
  stems; the implementation derives nothing and compares reported names.
  A conformance reviewer or a re-implementation following that sentence
  would drop thetas the shipped extension registers — divergent
  implementations both "conforming".
- A spec-sourced test for the skill arm cannot be written truthfully today;
  the arm's presence in the seam set (`registration-steps.md:20`) suggests
  coverage that cannot exist.

## Non-goals

- The prompt-template and foreign-extension arms — live and correct (probe
  control; [bug 0459](./0459-cross-format-collision-message-suffix-sibling-order-and-spelling.md) covers the message form).
- Pi's `skill:` namespace design — host behaviour, cited as evidence.
- Any change to which side wins when a genuine collision is possible — the
  asymmetric loser-drops rule is not contested.

## Fix

Not yet decided between:

1. **Spec-side (recommended): retire the skill arm as vacuous at the pin.**
   Rewrite `discovery-sources.md:85/:91` to state that skills occupy a
   disjoint `skill:` invocation namespace at the theta 1.0 pin and therefore
   never collide with theta stems; keep `"skill"` in the PIC-69 source set
   only as future-proofing with a note that it is unreachable at the pin
   (mirroring the `"subagent"` widening note at `registration-steps.md:20`),
   and add the re-validation trigger: a Pi minor that enumerates skills
   under bare names re-opens the arm. Cost: three passages + the
   host-prerequisites completeness sentence; no behaviour change.
2. **Impl-side: implement the stem-derivation reading.** Strip the `skill:`
   prefix (or read `sourceInfo`) and drop same-stem thetas. Cost: authors
   lose a working, unambiguous `/foo` because a `foo` skill exists whose
   invocation is `/skill:foo` — a needless drop the current host design
   avoids; also requires adjudicating the slug clause (the derived slug of
   `skill:foo` vs the stem `foo`).

Any fix must keep the two live arms byte-identical in behaviour and message.

## Provenance

prompt-templates bug-hunt sweep (wave 6) at 401a425b (v0.437.0). Found by
reading the pinned host's `getCommands` skill mapping
(`agent-session.js:1841`) against DISC-4 rule 2 while tracing
`readPiOwnedCommands`; confirmed by scratch probe
`tests/scratch-pt-skill-arm.test.ts` (deleted; run recorded in the hunt
log): theta registers, zero diagnostics.
