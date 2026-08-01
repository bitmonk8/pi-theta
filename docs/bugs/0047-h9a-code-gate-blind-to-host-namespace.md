# Bug 0047 — H9a's permitted-code gate cannot see the `theta/host/*` namespace: `parseSystemNoteCodes` enumerates `load|parse|runtime` only, so the `theta/host/session-start-supersession-detach-failed` entry bug 0029 wrote into `tests/fixtures/h7a/permitted-codes.json` grants a permission the gate never consults, and no host-namespace code is scored on either captured stream

- **Status:** open.
- **Kind:** defect — test infrastructure. A gate gap against H9a's documented
  gating role, not a divergence in runtime behaviour; the same class as
  [bug 0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md). The
  permitted-code gate scores a capture by extracting code slugs from it
  (`tests/live/acceptance/harness.ts:463–466`) and filtering the extraction
  against the committed list. The extraction's alternation names three of the
  four registered diagnostic namespaces
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:54–59`), so a
  `theta/host/*` code never enters the filtered set — permitted or not. The
  filter therefore has no reachable input from that namespace, and the
  namespace's entry in the committed list (`permitted-codes.json:12`) changes
  no outcome of the gate.
- **Related:**
  - [0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md) —
    minted `theta/host/session-start-supersession-detach-failed` and wrote the
    slug into the permitted list, recording the act as coordination with the
    H9a gate: "The slug is appended to H9a's permitted-code list
    (`tests/fixtures/h7a/permitted-codes.json`, now 11 entries), coordinating
    with bug 0030" (§Fix (0.40.0), :148–150; CHANGELOG 0.40.0 :221–222). The
    entry landed; the permission it names is unreachable. The blindness is
    older than the entry: the three-namespace alternation is quoted verbatim in
    0030 §Summary :232–237 at `0.32.0`, six minors earlier.
  - [0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md) — the
    sibling H9a gate gap, and the source of the current two-gate structure:
    `assertStderrClean` scores stderr-line *presence* at all ten spawns
    (`harness.ts:534–546`), `assertCodesSubsetOfPermitted` scores note *content*
    (`noninteractive-acceptance.test.ts:115–127`). 0030 closed the mechanism
    axis; this report is a gap on the content axis 0030 left in place and
    quoted.
  - [0034](./0034-supersession-does-not-await-whenidle.md) — the filing origin.
    Its §Fix (0.46.0) records "H9a's permitted-code list is untouched: no code
    is minted and the slug has been listed since bug 0029" (:187–188). That
    sentence is accurate about the list and silent about the gate; the fix
    verification found the listed slug unreachable, and this report is that
    residual.
- **Affected** (every citation verified at HEAD `979e3fce`, 0.46.0):
  - `tests/live/acceptance/harness.ts:463–466` — `parseSystemNoteCodes`, the
    extraction both stdout-and-stderr gates rest on. `:464` is the whole defect:

    ```ts
    const codes = output.match(/theta\/(?:load|parse|runtime)\/[a-z0-9-]+/g) ?? [];
    ```

    `rg -n "load\|parse\|runtime" -g '*.ts' -g '*.js' src tests tools` returns
    this line and nothing else, so there is no second copy to reconcile. The
    doc comment at :458–461 states the same three namespaces ("Extract the
    `theta/{load,parse,runtime}/*` codes present in a captured `pi -p`
    stream"), so the omission is consistent between code and comment and reads
    as intended.
  - `tests/live/acceptance/noninteractive-acceptance.test.ts:115–127` —
    `assertCodesSubsetOfPermitted`: `:119` loads the committed list, `:120`
    extracts from `result.stdout + "\n" + result.stderr`, `:121` filters,
    `:122–126` asserts the filtered list empty. Called at ten spawn sites —
    :149, :178, :221, :276, :343, :381, :406, :435, :463, :476 (area (i) spawns
    twice).
    Area (e) reads the same extraction once more for its
    `theta/runtime/internal-error` absence check (:352–357), so that check is
    blind to the host namespace on the same mechanism.
  - `tests/fixtures/h7a/permitted-codes.json` — 11 entries; `:12` is
    `theta/host/session-start-supersession-detach-failed`, the only
    host-namespace entry and the only entry no gate can consult. The other ten are
    `theta/load/*` (:2–7) and `theta/runtime/*` (:8–11).
  - `docs/spec_topics/diagnostics/code-registry-host.md:11–15` — the five
    registered `theta/host/*` rows: `session-shutdown-reason-unknown`,
    `session-shutdown-pinned-constant-unreadable`,
    `session-swap-instance-survived`, `session-shutdown-teardown-step-failed`,
    `session-start-supersession-detach-failed`. Four are `console.error`-routed;
    the fifth is routed through the persistent-diagnostic channel's system-note
    fallback chain (`sendSystemNote` → `ctx.ui.notify` → `console.error`),
    stated in the row's *Trigger* and mirrored at
    `docs/reference/diagnostics.md:266–270` and `:278`.
  - `src/extension/factory.ts:196–197`, `:219–230` — the constant and the
    diagnostic builder for the listed code; emitted at `:823–825` (the quiesce
    act) and `:883–885` (the detach act) through `deps.emitDiagnostic`, which
    the shipped composition root binds to the bootstrap sink (`:1134`). With a
    `ctx` latched — the case at both sites, both inside the `session_start`
    handler body — the sink's tier 2 delivers via `emitDiagnosticBatch`
    (`src/extension/production-composition.ts:2325`), which renders the
    location-less diagnostic as `<code>: <message>`
    (`src/diagnostics/diagnostic.ts:60`, `:64–91`, `:97–99`) into one
    `theta-system-note` (`src/extension/system-note-channel.ts:336–352`). The
    code text is verbatim in the note content the gate exists to score.
  - Contrast surface — `tests/live/acceptance/harness.ts:534–546`
    (`assertStderrClean`) reads `result.stderr` only and rejects any non-blank
    line, so a `console.error`-routed host diagnostic reds it. Its class labeller
    `knownStderrClassOf` (:497–508) recognises three prefixes
    (`STALE_QUIESCE_STDERR_PREFIX`, `SYSTEM_NOTE_DELIVERY_FAILED_PREFIX`,
    `RELOAD_REBUILD_REJECTED_PREFIX`), so the line is reported verbatim as
    unrecognised content — the comment at :496 calls that case "(host) content".
  - `tests/acceptance-stderr-gate.test.ts:110–148` — the default-suite offline
    lock 0030 shipped. Its five rows are the three theta-owned stderr prefixes
    plus two `theta/runtime/*` cascades; none carries a host code, and
    `codesOutsidePermitted` (:189–193) is exercised only over those rows. No
    test in the default suite scores the host namespace against the gate.
  - `tests/live/acceptance/ctor-unresolved-load-refusal.test.ts:66–75` — the
    eleventh acceptance test, deliberately outside both gates (its own scope
    note), so it neither hides nor closes this gap.
- **Observed at:** `0.46.0` (`979e3fce`), reading-level — offline,
  deterministic, token-free. Reproducible from the checked-in regex and the
  checked-in list with no live host.

## Summary

H9a's per-spawn invariant set is stated in the suite header: "no-error exit, an
empty per-spawn stderr capture (`assertStderrClean`) … and emitted
`theta-system-note` codes ⊆ the committed permitted-code list"
(`noninteractive-acceptance.test.ts:7–14`). The last clause is the
permitted-code gate, run at all ten spawns. Its predicate is:

```ts
const permitted = new Set(loadPermittedCodes());
const emitted = parseSystemNoteCodes(result.stdout + "\n" + result.stderr);
const outside = emitted.filter((code) => !permitted.has(code));
expect(outside, …).toEqual([]);
```

`emitted` comes from one regex, `/theta\/(?:load|parse|runtime)\/[a-z0-9-]+/g`
(`harness.ts:464`). The registry defines four runtime diagnostic namespaces —
`theta/parse/*`, `theta/load/*`, `theta/runtime/*`, `theta/host/*`
(`diagnostic-shape.md:56–59`); `theta/typecheck/*` is a build-time brand surface
with no registry row and an explicit audit-gate carve-out (`:61`). The
alternation names three of the four. `theta/host/*` matches nothing, so a
capture containing a host code yields `emitted = []`, `outside = []`, and the
assertion passes.

`tests/fixtures/h7a/permitted-codes.json:12` has carried
`theta/host/session-start-supersession-detach-failed` since bug 0029's fix
(0.40.0), which recorded the append as coordination with H9a. The row is scored
by the offline H7a checks — it must resolve to a registry Message, must not
duplicate another entry, and counts toward the list being a superset of the
golden set (`tests/integration-acceptance.test.ts:274–288`) — and by nothing
else. As a *permission* it grants nothing, because the gate it permits against
cannot produce the string it permits.

The consequence covers the namespace, not one row. Of the five registered host
rows, four route via `console.error` and one via the system-note channel. A
`console.error`-routed one reds the separate empty-capture stderr gate as an
unclassified line (`assertStderrClean`, `knownStderrClassOf` returning
`undefined`), so it is caught, but not as a code and not by the gate whose job
is codes. The system-note-routed one — the one row someone deliberately
permitted — lands in note content, which only the code gate scores, and that
gate cannot see it. No assertion in the acceptance suite scores it.

## Reproduction

Reading-level, offline, deterministic, no live host. The predicate is
transcribed verbatim from `harness.ts:464`; the list is read from disk:

```
node -e '
const fs = require("node:fs");
const permitted = new Set(JSON.parse(fs.readFileSync("tests/fixtures/h7a/permitted-codes.json", "utf8")));
const codesOf = (s) => Array.from(new Set(s.match(/theta\/(?:load|parse|runtime)\/[a-z0-9-]+/g) ?? []));
for (const n of [
  "theta/host/session-start-supersession-detach-failed: session_start supersession detach failed at hotReloadHandle.detach: boom",
  "theta/host/session-shutdown-teardown-step-failed: session_shutdown teardown step 4 failed at discoveryWatcher.close: boom",
  "theta/runtime/registry-swap-failed: boom",
]) {
  const code = n.slice(0, n.indexOf(":"));
  const codes = codesOf(n);
  console.log(JSON.stringify({ code, permitted: permitted.has(code), extracted: codes, outside: codes.filter((c) => !permitted.has(c)) }));
}'
```

Verbatim output at `979e3fce`:

```
{"code":"theta/host/session-start-supersession-detach-failed","permitted":true,"extracted":[],"outside":[]}
{"code":"theta/host/session-shutdown-teardown-step-failed","permitted":false,"extracted":[],"outside":[]}
{"code":"theta/runtime/registry-swap-failed","permitted":false,"extracted":["theta/runtime/registry-swap-failed"],"outside":["theta/runtime/registry-swap-failed"]}
```

| captured note content | in permitted list | extracted codes | `assertCodesSubsetOfPermitted` |
| --- | --- | --- | --- |
| `theta/host/session-start-supersession-detach-failed: …` | yes (`:12`) | `[]` | passes |
| `theta/host/session-shutdown-teardown-step-failed: …` | no | `[]` | passes |
| `theta/runtime/registry-swap-failed: …` | no | `[theta/runtime/registry-swap-failed]` | reds |

Rows 1 and 2 are indistinguishable to the gate: the permitted host code and the
unpermitted host code produce identical outcomes, which is what "the entry
grants nothing" means operationally. Row 3 is the control — the same shape in a
namespace the alternation names reds, so the filter and the list are otherwise
working.

Widening the alternation to `(?:load|parse|runtime|host)` and re-running the
same input set separates them:

```
{"extracted":["theta/host/session-start-supersession-detach-failed"],"outside":[]}
{"extracted":["theta/host/session-shutdown-teardown-step-failed"],"outside":["theta/host/session-shutdown-teardown-step-failed"]}
```

The permitted row passes because it is permitted; the unpermitted row reds. The
committed list's host entry acquires an effect at the same moment.

Inventory checks behind the claims above, all token-free:

```
# the extraction: one site, no second copy
rg -n "load\|parse\|runtime" -g '*.ts' -g '*.js' src tests tools
#   tests/live/acceptance/harness.ts:464

# the registered host rows: five
rg -c "^\| \`theta/host/" docs/spec_topics/diagnostics/code-registry-host.md

# the committed list's host entries: one, at line 12
rg -n "theta/host" tests/fixtures/h7a/permitted-codes.json
```

## Expected behaviour

- **The suite's own contract.** `noninteractive-acceptance.test.ts:14` states
  the per-spawn invariant as "emitted `theta-system-note` codes ⊆ the committed
  permitted-code list", unqualified by namespace. `harness.ts:328` names the
  committed list "the committed permitted-code list criterion (e) scores
  against", and the manifest self-check asserts the list is present and
  non-empty (`:491–510`, the assertion at `:508`). A code outside the list,
  emitted on either captured stream, reds the area where it appears.
- **The registry's namespace set is closed and has four members.**
  `diagnostic-shape.md:54–59` enumerates `theta/parse/*`, `theta/load/*`,
  `theta/runtime/*`, `theta/host/*`; `:61` carves `theta/typecheck/*` out as
  build-time brands that "carry no registry row, do not flow through any of the
  delivery channels above". DIAG-2 (`:72`) makes the registry closed: a new
  code lands in the table in the same commit as its site. A gate that scores
  "emitted codes" against a committed permission list is expected to range over
  the namespaces the registry defines, so that adding a row cannot silently
  produce a code no gate can observe.
- **The permitted list is a permission surface, not a manifest.**
  `tests/integration-acceptance.test.ts:274–288` requires every entry to resolve
  to a registry Message and forbids duplicates; `:295–316` requires
  `golden ⊆ permitted`. Adding an entry is expected to change what H9a admits,
  which is the act bug 0029's §Fix (:148–150) and CHANGELOG 0.40.0 (:221–222)
  both record.
- **AGENTS.md §"Verify both directions when adding or strengthening an
  assertion":** "A live assertion that cannot red is worthless." For the host
  namespace the permitted-code gate cannot red on any input, permitted or not.

## Actual behaviour / root cause

The gate is two steps, and the gap is in the first. `parseSystemNoteCodes`
(`harness.ts:463–466`) is an extraction, not a classification: it matches
literal namespace segments and returns the deduplicated hits. The alternation
`(?:load|parse|runtime)` omits `host`, so no host code is ever produced, and
the second step — `emitted.filter((code) => !permitted.has(code))` at
`noninteractive-acceptance.test.ts:121` — runs over a set that structurally
cannot contain one. The slug charset is not the constraint:
`session-start-supersession-detach-failed` matches `[a-z0-9-]+` in full, as the
widened-alternation run in §Reproduction shows. The namespace segment is the
whole cut.

The omission is not visible from the list side. `loadPermittedCodes`
(`harness.ts:328–338`) validates only that the file parses as a string array; it
does not reconcile the entries with the extraction's namespaces, and nothing
else does. `tests/integration-acceptance.test.ts:274–288` reconciles entries
with the *registry*, which the host entry satisfies. So an entry in a namespace
the regex omits passes every check in the tree while doing nothing.

Why it survived: every registered `theta/host/*` row fires on a host-lifecycle
anomaly — an `event.reason` outside the closed five-arm set, a corrupted
pinned-constant snapshot, a throwing `session_shutdown` teardown sub-step, an
extension instance surviving a session-only swap, a throw out of a supersession
act (`code-registry-host.md:11–15`, *Trigger* column). None occurs in an
ordinary acceptance spawn, so the gate has never been handed a host code to
mis-score, and its blindness produces no visible symptom on a green run. Bug
0029 wrote the list entry as the coordination step its fix required and did not
inspect the extraction; bug 0034 re-checked the list, found the slug present,
and recorded the list as untouched (§Fix (0.46.0) :187–188) — correctly, and
without reaching the predicate underneath.

Delivery routing decides what happens today per row:

| row | routing | what scores it in an H9a capture |
| --- | --- | --- |
| `session-shutdown-reason-unknown` | `console.error` | `assertStderrClean` reds on the line; class reported as unrecognised content |
| `session-shutdown-pinned-constant-unreadable` | `console.error` | as above |
| `session-shutdown-teardown-step-failed` | `console.error` | as above |
| `session-swap-instance-survived` | `console.error`, then fail-fast termination | as above |
| `session-start-supersession-detach-failed` | system-note channel (`code-registry-host.md:15`, `docs/reference/diagnostics.md:268–270`) | nothing |

The four `console.error` rows are caught by 0030's gate as *lines*, with their
code text carried into the failure message verbatim but unlabelled. The fifth —
the one the committed list permits — is note content, and note content is
scored by the code gate alone.

## Why it matters

- The record in bug 0029's §Fix and in CHANGELOG 0.40.0 states a coordination
  with H9a that does not hold. A reader adding a `theta/host/*` row later
  follows that precedent, appends a slug, and gets a permission with no gate
  behind it.
- The one host row with a live-session emission path is the one nothing scores.
  It fires inside the `session_start` handler on a live session
  (`factory.ts:823–825`, `:883–885`) and delivers through the same system-note
  channel every other scored code uses, so it arrives on the surface the code
  gate was built to score and the gate extracts nothing from it.
- The failure text a `console.error`-routed host diagnostic produces today
  misattributes it. `knownStderrClassOf` (`harness.ts:497–508`) matches three
  prefixes and returns `undefined` otherwise, and the comment at `:496` calls
  that branch "(host) content" in the sense of *host noise*. A theta-owned
  `theta/host/*` diagnostic is reported in exactly the shape reserved for
  content theta does not own.
- The gap widens with the registry. DIAG-2 (`diagnostic-shape.md:72`) requires
  a new code to land its registry row in the same commit as its site; no rule
  connects that row to the acceptance extraction. Every future `theta/host/*`
  row inherits the blindness with no signal.
- The default suite does not witness it. `tests/acceptance-stderr-gate.test.ts`
  locks the 0030 gate over five rows (:110–148), all `theta/runtime/*` or
  slug-less, so `npm test` is green on a predicate that ignores a whole
  namespace.

## Fix

Widen the alternation at `tests/live/acceptance/harness.ts:464` to
`/theta\/(?:load|parse|runtime|host)\/[a-z0-9-]+/g`, and update the function's
doc comment (`:458–461`) to name the four registered namespaces and to record
why `theta/typecheck/*` stays out — `diagnostic-shape.md:61` makes it a
build-time brand surface with no registry row and an explicit audit-gate
carve-out, so matching it would produce codes with no permission semantics.

Observable consequences, all of them intended:

1. **`permitted-codes.json:12` becomes live.** A captured
   `theta/host/session-start-supersession-detach-failed` is extracted, found in
   the list, and passes — the outcome bug 0029's §Fix describes. The entry stops
   being a row nothing reads.
2. **The other four host rows become non-permitted inputs.** Any of them
   appearing in a capture reds `assertCodesSubsetOfPermitted` in the area where
   it appears, naming the code. That is the correct signal: each is a
   host-lifecycle anomaly, and none is expected in an acceptance run. They are
   not added to the committed list — permitting them would restore the current
   blindness through a different mechanism.
   `tests/integration-acceptance.test.ts:274–288` keeps any future addition
   honest by requiring a registry Message.
3. **Area (e)'s `theta/runtime/internal-error` absence check
   (`noninteractive-acceptance.test.ts:352–357`) is unchanged in effect.** It
   filters the extraction for one `theta/runtime/*` code; a widened extraction
   adds host codes to the list it searches and cannot change that membership
   test.
4. **`assertStderrClean` is untouched.** It reads `result.stderr` and scores
   line presence, not codes (`harness.ts:534–546`). The orthogonality bug 0030
   §Fix pins — mechanism versus content — holds unchanged, and a
   `console.error`-routed host diagnostic now reds both gates, each for its own
   reason.
5. **The 0030 offline lock keeps its expectations byte-identical.** Its five
   rows (`tests/acceptance-stderr-gate.test.ts:110–148`) carry no host code, so
   every `extractedCodes` expectation and every `redsNineAreaSubsetGate` flag
   survives the widening unchanged.

Constraints on the change:

- **Offline lock, both directions, in the default suite.** Extend
  `tests/acceptance-stderr-gate.test.ts` — which already imports
  `parseSystemNoteCodes` and `loadPermittedCodes` (:80–81, with
  `codesOutsidePermitted` at :189–193) — with two rows: a note quoting the
  permitted host code (extraction non-empty, subset gate passes) and one quoting
  an unpermitted host code (subset gate reds). Add the premise assertion the
  file's own convention requires (:217–234): the committed list contains
  `theta/host/session-start-supersession-detach-failed`, so the first row keeps
  witnessing a permission rather than an absence. Both directions run offline
  and token-free — the red-proof AGENTS.md §"Verify both directions" requires,
  which the live axis cannot supply without provoking a lifecycle anomaly.
- **One live H9a run after the change** (AGENTS.md §"Run it liberally"). The
  widening can newly red only if a `theta/host/*` code is already present in a
  capture — a state nothing currently detects, since neither gate scores note
  content in that namespace. A red on that run is the defect surfacing and is
  investigated as such, not absorbed by adding the code to the committed list.
- **No spec change.** The namespace set is already closed at
  `diagnostic-shape.md:54–59`; this aligns a test predicate with it. No code is
  minted, no registry row moves, and `docs/reference/diagnostics.md` is
  unaffected.
- **Ordering.** Independent of the other open bugs. It touches one regex, one
  doc comment, and one offline test file; it neither blocks nor is blocked by
  any open report.

## Provenance

- Origin: the bug-0034 fix verification (§Fix (0.46.0),
  `docs/bugs/0034-supersession-does-not-await-whenidle.md:187–188` — "H9a's
  permitted-code list is untouched: no code is minted and the slug has been
  listed since bug 0029"), residual R1: the listed slug is unreachable by the
  gate the list serves. This report is that residual's durable record.
- Gate evidence at `979e3fce`: `tests/live/acceptance/harness.ts:12–18`
  (header), `:115` (`PERMITTED_CODES_PATH`), `:328–338` (`loadPermittedCodes`),
  `:458–466` (`parseSystemNoteCodes`, the regex at `:464`), `:479`
  (`ACCEPTANCE_STDERR_ALLOWLIST`), `:489–494` (`acceptanceStderrOffenders`),
  `:496–508` (`knownStderrClassOf`), `:534–546` (`assertStderrClean`);
  `tests/live/acceptance/noninteractive-acceptance.test.ts:7–14` (the invariant
  set), `:114–127` (`assertCodesSubsetOfPermitted`), the ten call sites `:149`,
  `:178`, `:221`, `:276`, `:343`, `:381`, `:406`, `:435`, `:463`, `:476`,
  `:352–357` (area (e)'s second read of the extraction), `:491–510` (the
  manifest self-check);
  `tests/live/acceptance/ctor-unresolved-load-refusal.test.ts:66–75` (the
  eleventh acceptance test's scope isolation);
  `tests/fixtures/h7a/permitted-codes.json` (11 entries, the host entry at
  `:12`); `tests/integration-acceptance.test.ts:274–288` (the registry-Message
  and no-duplicate checks), `:295–316` (`golden ⊆ permitted`);
  `tests/acceptance-stderr-gate.test.ts:110–148` (the five 0030 rows), `:189–193`
  (`codesOutsidePermitted`), `:217–234` (the premise assertions).
- Spec evidence: `docs/spec_topics/diagnostics/diagnostic-shape.md:54–59` (the
  four code namespaces), `:61` (`theta/typecheck/*` out of scope and its
  audit-gate carve-out), `:72` (DIAG-2, the closed registry);
  `docs/spec_topics/diagnostics/code-registry-host.md` — the namespace lead
  paragraph (routing, and the supersession row's exception) and the five rows at
  `:11–15`; `docs/reference/diagnostics.md:264` (§`theta/host/*`), `:266–270`
  (the routing paragraph and its stated exception), `:274–278` (the mirrored
  rows).
- Implementation evidence: `src/extension/factory.ts:196–197`
  (`SUPERSESSION_DETACH_FAILED_CODE`), `:219–230`
  (`supersessionDetachFailedDiagnostic`), `:823–825` and `:883–885` (the two
  emission sites), `:1109` and `:1134` (the shipped bootstrap sink bound to
  `deps.emitDiagnostic`); `src/extension/production-composition.ts:2255–2278`
  (`createBootstrapDiagnosticSink`), `:2320–2332` (tier 2, the
  `emitDiagnosticBatch` call at `:2325`);
  `src/extension/system-note-channel.ts:336–352`
  (`emitDiagnosticBatch` → one `theta-system-note`);
  `src/diagnostics/diagnostic.ts:60` (the location-less `<code>: <message>`
  form), `:64–91` (`renderDiagnosticLine`), `:97–99` (`renderDiagnosticBatch`);
  `src/extension/session-swap-tripwire.ts:137–146`,
  `src/extension/session-shutdown.ts`, `src/extension/unknown-reason-rule.ts`
  (the four `console.error`-routed host rows).
- Prior-record evidence:
  `docs/bugs/0029-throwing-supersession-detach-swallowed-watcher-rearmed.md:148–152`
  (§Fix (0.40.0), the append and its stated coordination), `:483` (the same act
  in the settled §Fix); `CHANGELOG.md:197` (0.40.0), `:221–222` ("the slug
  appended to H9a's permitted-code list");
  `docs/bugs/0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md:232–237`
  (the regex quoted verbatim at `0.32.0`, establishing that the blindness
  predates the entry), `:161–165` (0030's own permitted-list edit),
  `:104–214` (§Fix (0.35.0), the two-gate structure).
- Reproduction: the two `node -e` runs quoted in §Reproduction, executed at
  `979e3fce` against the checked-in `permitted-codes.json` with the predicate
  transcribed from `harness.ts:464`; plus the three `rg` inventory commands.
  Nothing was written to the tree.
