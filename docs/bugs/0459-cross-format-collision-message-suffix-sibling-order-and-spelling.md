# Bug 0459 — Both arms of `theta/load/cross-format-collision` diverge from the pinned `<paths>` rendering: the Pi-owned arm appends an off-template ` (Pi-owned command '<name>' survives)` suffix and omits the colliding `.md` sibling from `<paths>` (the extension discards `SlashCommandInfo.sourceInfo`, so the operator is told to rename files it never names), the same-format arm renders candidates in insertion order where §7 pins priority-then-absolute-path, and candidate paths interpolate in the mixed Win32-root-plus-POSIX-tail spelling

- **Status:** open.
- **Sev/Diff estimate:** S4/D2 — S4: wrong-diagnostics class per the 0440
  calibration (registration outcomes are correct on both arms — the theta
  drops, the Pi-owned entry survives, both same-tier copies drop; only the
  rendered message diverges from its DIAG-4-normative template), aggravated
  because the row's Hint ("Rename one of the colliding files…") is
  undischargeable from the Pi-owned note: the one file the operator must
  weigh renaming — the `.md` template — is the one file the note never
  names; D2: the order face alone is D1 (one comparator shared by both
  mints), but the `.md`-sibling half needs `readPiOwnedCommands` to stop
  discarding `sourceInfo` plus a one-sentence adjudication for path-less
  `extension`-source entries.
- **Kind:** defect — implementation diverges from DIAG-4
  (`diagnostic-shape.md:74`: "renderers MUST emit it character-for-character
  with placeholders interpolated"; the registry template
  `code-registry-load.md:50` is `slash name '<name>' collides at the same
  priority: <paths>` with no suffix) and from the `<paths>` interpolation pin
  (`placeholder-rendering-b.md:57`: "for `theta/load/cross-format-collision`
  the order is: registered candidates first, then the slash-name-deriving
  `.md` siblings, both internally ordered by discovery-source priority then
  by absolute path"). The mixed-spelling face is a never-fixed emission site
  (`joinPosix`, `discovery-walk.ts:141-144`, base never normalised), NOT a
  0268/0440 regression — those fixes' seams deliberately do not reach paths
  embedded in message text.
- **Related:**
  - 0440 (fixed 0.420.0) — same mint function, sibling placeholders: its fix
    rendered `cross-source-shadow`'s descriptors and dropped this code's
    per-path quotes on both arms. The order face is its §Fix **Residual 2
    verbatim** — "`theta/load/cross-format-collision` `<paths>` ORDER (§7
    priority-then-path pin vs candidate insertion order) is untouched — 0440
    §Non-goals excludes it (round-1 review R2)" — fixer-named,
    file-separately family; this report is that filing. The suffix and the
    absent `.md` sibling appear in no 0440 record — unrecorded ground.
  - 0268 (fixed 0.265.0) / 0391 (fixed 0.394.0) — the mixed
    Win32-root-plus-POSIX-tail spelling class on rendered surfaces; their
    fix seams (`renderDiagnosticLine` / `sendSystemNote`, the `file` fields)
    do not reach message-embedded paths, so this face is pre-existing at a
    distinct site, not a rebreak.
  - 0403 (fixed 0.413.0) — the DIAG-4 divergence class precedent.
  - [bug 0458](./0458-package-theta-bypasses-pi-owned-collision-guard.md) — the package arm that emits nothing at
    all; this report covers the arms that emit wrongly.
  - [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md) / [bug 0463](./0463-package-source-bypasses-disc3-validation.md) —
    the package-tier outcomes/validation faces; package candidates never
    reach these mint sites today, and a fix routing them through
    `resolveSlashNames` makes these messages their rendering too.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/discovery/discovery-walk.ts:1457-1465` — the Pi-owned arm's mint:
    `` `slash name '${name}' collides at the same priority: ${group.map((candidate) => candidate.path).join(", ")} (Pi-owned command '${name}' survives)` ``
    (literal `:1462-1464`) — theta candidate paths only, insertion-ordered,
    plus the suffix. `rg -n "survives\)" src/` finds no other emitter, and
    `rg -n "survives" docs/spec_topics/` matches only prose about the ENTRY
    surviving — no spec sentence licenses the suffix as message text.
  - `src/discovery/discovery-walk.ts:1495-1505` — the same-priority
    theta-vs-theta arm (tier selection `:1491-1493`, message literal
    `:1500-1502`): `topTier.map((candidate) => candidate.path).join(", ")` —
    `topTier` preserves `candidates` collection order (CLI entries in flag
    order, then settings, then project, then global), i.e. insertion order;
    no path sort.
  - `src/discovery/discovery-walk.ts:1455` — `group` is
    `dedupeByIdentity(rawGroup)` in bucket-insertion order; no
    priority-then-absolute-path sort on either arm (the §7 order pin).
  - `src/extension/production-composition.ts:3740-3766` —
    `readPiOwnedCommands` keeps `{ name, source }` and discards
    `SlashCommandInfo.sourceInfo`; `PiOwnedCommand`
    (`discovery-walk.ts:36-39`) carries `name` + `source` only. The pinned
    host supplies the template's absolute path there:
    `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js:1834-1839`
    maps prompt templates to `{ …, source: "prompt", sourceInfo:
    template.sourceInfo }`;
    `node_modules/@earendil-works/pi-coding-agent/dist/core/prompt-templates.js:169-189`
    builds that `sourceInfo` via `createSyntheticSourceInfo(resolvedPath, …)`
    from the template's resolved file path.
  - `src/discovery/discovery-walk.ts:141-144` — `joinPosix` appends a POSIX
    tail to a never-normalised base, producing the mixed spelling in every
    candidate path a native-spelled root feeds either mint.
  - `docs/spec_topics/diagnostics/code-registry-load.md:50` — the Message
    template (no suffix; `<paths>` = every colliding path: "The diagnostic
    lists every colliding path").
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:57` — the
    `<paths>` order pin naming the `.md` siblings as list members.
  - `docs/spec_topics/discovery/discovery-sources.md:91` — "emits the same
    diagnostic naming both the `.theta` path and the colliding entry"; `:82`
    "naming **every** colliding path"; `:87` "Every colliding path is
    carried … via the `<paths>` placeholder".
- **Observed at:** v0.437.0 (401a425b), offline — factory +
  `composeExtensionInstance` over a real temp workspace (Windows-path cell)
  and the real `discoverThetas` over `FakeFileSystem` (order + Pi-owned
  cells); note bytes captured off `pi.sendMessage`; scratch probes deleted,
  reconstruction in §Reproduction.

## Summary

Both mint arms of `theta/load/cross-format-collision` render `<paths>` as
the group's collection-order paths, and the Pi-owned arm diverges further.
The registry template is `slash name '<name>' collides at the same priority:
<paths>`; DIAG-4 makes it character-for-character normative; the placeholder
page pins `<paths>` as "registered candidates first, then the
slash-name-deriving `.md` siblings", priority-then-path ordered. Divergences:

1. **Off-template suffix (Pi-owned arm).** ` (Pi-owned command '<name>'
   survives)` is not in the Message cell. DIAG-4 allows position-specific
   templates only via the row's Trigger column; the row documents none.
2. **`.md` sibling absent (Pi-owned arm).** `<paths>` carries only the theta
   candidate(s). The colliding template's path is never rendered anywhere —
   the suffix names the slash name (which the operator already has) and not
   the file. The row's Hint is "Rename one of the colliding files so the
   slash names diverge", and DISC-4 prose says authors "must rename one of
   the two files": with a populated `.pi/prompts/`, the operator cannot tell
   from the note which `.md` file owns the name (a template's registered
   name need not be discoverable by filename search alone — pi also loads
   templates from settings `promptPaths`).
3. **Insertion order (both arms).** Multi-candidate groups render in
   collection order rather than the pinned priority-then-absolute-path
   order — 0440 §Fix Residual 2. Within a single-tier group the pin reduces
   to absolute-path order, so the rendered bytes for one physical collision
   flip with the operator's flag/entry order.
4. **Mixed path spelling.** Candidate paths render as the walk's raw
   `joinPosix` output (Win32 root + POSIX tail) — the 0268/0391 spelling
   class at a never-fixed message-text site.

Captured bytes (Windows, Pi-owned arm):

```
theta/load/cross-format-collision: slash name 'promptdup2' collides at the same priority: C:\Users\thomasa\AppData\Local\Temp\theta-scratch-ptpkg-VkXkNV/.pi/theta/promptdup2.theta (Pi-owned command 'promptdup2' survives)
```

## Reproduction

Offline, deterministic, at 401a425b.

1. Order face (same-format arm) — real `discoverThetas` over
   `FakeFileSystem`, `cliPaths: ["/opt/zz", "/opt/aa"]`, both dirs holding
   `plan.theta`:

   ```
   error theta/load/cross-format-collision: slash name 'plan' collides at the same priority: /opt/zz/plan.theta, /opt/aa/plan.theta
   ```

   Insertion order (`zz` before `aa`); the pin's priority-then-path order
   for this single-tier group is `/opt/aa/plan.theta, /opt/zz/plan.theta`.
   Swapping the flag component order flips the rendered bytes for the
   identical physical collision.

2. Pi-owned face — same harness, `cliPaths: ["/opt/zz"]` (holding
   `plan.theta`), `piOwnedNames: [{ name: "plan", source: "prompt" }]`:

   ```
   error theta/load/cross-format-collision: slash name 'plan' collides at the same priority: /opt/zz/plan.theta (Pi-owned command 'plan' survives)
   ```

   One path in the list (the colliding Pi-owned entry appears only inside
   the unpinned suffix, name-only); the suffix bytes follow the template's
   final placeholder. Drop outcomes correct in both cells (`thetas: []`).

3. Mixed-spelling face — factory + `composeExtensionInstance` over a real
   temp workspace with `.pi/theta/promptdup2.theta` and harness
   `pi.getCommands()` returning `[{ name: "promptdup2", source: "prompt" }]`;
   fire `session_start`; the captured note is the §Summary byte quote.

## Expected behaviour

For a project theta `<cwd>/.pi/theta/promptdup2.theta` colliding with a
project template `<cwd>/.pi/prompts/promptdup2.md`, per
`code-registry-load.md:50` + `placeholder-rendering-b.md:57`:

```
slash name 'promptdup2' collides at the same priority: <cwd>/.pi/theta/promptdup2.theta, <cwd>/.pi/prompts/promptdup2.md
```

— registered candidate first, `.md` sibling second, forward-slash spelling,
no suffix. Same-format arm: `slash name 'plan' collides at the same
priority: /opt/aa/plan.theta, /opt/zz/plan.theta` — priority-then-path.
(Whether the survivor is better carried in `details` or a second sentence is
a spec change under DIAG-4's theta-2.0 deferral, not a rendering choice the
mint site may make unilaterally; the survives-information is already
normative prose — DISC-4: the Pi-owned entry always survives — so dropping
the suffix loses nothing.)

## Actual behaviour / root cause

`resolveSlashNames` builds `byName` groups in candidate collection order and
both mint sites join the group's paths unsorted (`discovery-walk.ts:1462`,
`:1500`). The Pi-owned mint formats only the theta candidates it holds and
appends the survives-suffix as compensation for the missing sibling. It
cannot do better today because `readPiOwnedCommands`
(`production-composition.ts:3740-3766`) reduces each `SlashCommandInfo` to
`{ name, source }`, discarding the `sourceInfo` whose `path` the pinned host
populates for every prompt template (`agent-session.js:1834-1839`;
`prompt-templates.js:169-189` builds it from the template's resolved file
path) — the datum is available at the seam and dropped, not missing from the
host. The suffix predates 0440; that fix's scope covered the shadow
descriptors and this code's per-path quotes only, and its Residual 2 records
the order pin as untouched. `joinPosix` never normalises its base, so a
native-spelled root renders mixed at both mints.

## Why it matters

- The note is the only carrier ("no structured `details` payload is emitted
  for this code", `discovery-sources.md:87`), and it withholds exactly the
  datum the Hint needs — which `.md` file collided. On a project with many
  templates/skills the operator greps for a file the note never named.
- DIAG-4 makes tests source rendered messages from the Message column; a
  conformance test written that way reds against the shipped suffix on every
  input, and against the same-format arm for any non-path-ordered
  configuration; the committed assertions match fragments only (`collides at
  the same priority`), so all faces are invisible to the suite.
- The rendered bytes for one physical collision depend on flag/entry order,
  and the documented consumer dedup key includes `message` — a message-keyed
  dedup or log pipeline treats one collision as two.
- The mixed spelling re-breaks one-grep operability on this surface (the
  0268/0440 operability argument verbatim).

## Non-goals

- The drop/survive outcomes and severities on both arms — correct as shipped
  (witnessed: both CLI copies drop; the theta drops and the Pi-owned name
  survives).
- The per-path quoting — fixed ground (0440).
- The package arm that emits nothing — [bug 0458](./0458-package-theta-bypasses-pi-owned-collision-guard.md) /
  [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md).
- `emitSourceFailure`'s category-text descriptors — 0440 §Fix Residual 1,
  a different code family (failure modes, not collisions); candidate
  discovery-precedence/01.
- The `<higher>`/`<lower>` descriptor rendering — fixed ground (0440).

## Fix

Options:

1. **Render the pinned form (recommended).** Sort each `<paths>` segment by
   `PRIORITY[source]` then byte-wise absolute path before joining (one
   comparator shared by both arms); keep `sourceInfo.path` (when present) on
   `PiOwnedCommand`; at the Pi-owned mint, append the Pi-owned entry's
   path(s) as the `.md`-sibling tail; drop the suffix; render forward-slash.
   Adjudication rider (one sentence, GOV-governed, same commit): only the
   path-less `extension`-source entry's sibling rendering is unpinned today —
   the §7 pin speaks of `.md` siblings, and `prompt`/`skill` entries carry a
   host-populated `sourceInfo.path`; pin a fallback (e.g. the command name)
   for foreign extension commands.
   Constraint: PIC-69's "theta 1.0 does not read `SlashCommandInfo.sourceInfo`
   to try" (registration-steps.md:16) is scoped to self-vs-sibling
   disambiguation and must stay true for that purpose; reading `sourceInfo`
   for message rendering only is compatible but the sentence should be
   tightened in the same commit.
2. **Re-pin the spec to the shipped form.** Rewrite the §7 `<paths>` pin and
   sanction the suffix in the row's Trigger column. Rejected-shaped: abandons
   the Hint's dischargeability, contradicts DISC-4's "naming both the
   `.theta` path and the colliding entry", leaves order-unstable bytes, and
   DIAG-4 defers Message wording changes to theta 2.0 — the suffix cannot be
   sanctioned in the Message cell at all.

Witness all faces both directions: template-collision note byte-equals the
pinned form (path-ordered, sibling-tailed, forward-slashed, suffix-free); a
non-path-ordered CLI pair renders sorted; a three-candidate multi-source
group renders priority-then-path; outcomes byte-unchanged.

## Provenance

Merged report: prompt-templates bug-hunt sweep (wave 6) + discovery-precedence
sweep seed lead 2 (0440 §Fix Residual 2, fixer-named, "file separately" —
quoted verbatim under §Related), both at 401a425b (v0.437.0). Found by
byte-comparing the walk-arm control capture from the package-merge probe
(`tests/scratch-pt-package-merge.test.ts`, deleted) against
`code-registry-load.md:50` and `placeholder-rendering-b.md:57`, then tracing
the `sourceInfo` discard in `readPiOwnedCommands`; order/Pi-owned cells P2a/
P2b from probe `tests/scratch-disc-precedence.test.ts` (deleted; outputs
quoted verbatim in §Reproduction). `rg` sweeps for other emitters and the §7
sibling phrase recorded in §Affected.
