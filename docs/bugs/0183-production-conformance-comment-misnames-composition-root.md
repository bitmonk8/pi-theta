# Bug 0183 — `tests/conformance/production-conformance.test.ts:47–48` calls `discoverAndComposeFixtures` "the shipped `session_start` composition root … re-exported by `extensions/index.ts`" and both halves are false at HEAD: `extensions/index.ts:13` re-exports `src/extension/factory`'s default, whose `session_start` handler composes through `composeExtensionInstance` (`production-composition.ts:1214`), and `discoverAndComposeFixtures` (`:366`) has no caller in `src/**` or `extensions/**` at all — the helper's own docstring states the correct rule nine lines above the function the comment misnames, and the wiring half has been false since the comment was written

- **Status:** fixed (0.129.0). §Fix items 1–3 shipped in full: the false clause
  in `tests/conformance/production-conformance.test.ts` is rewritten, the same
  file's four downstream repetitions are corrected, §Fix item 2's eight further
  files take the same substitution, and §Fix item 3's three false call chains
  in `tests/live/live-production-acceptance.test.ts` drop the
  `→ discoverAndComposeFixtures` hop. No executable line moves except the one
  `describe` title §Fix item 1 explicitly authorizes, no assertion changes, no
  fixture changes, no runtime observable moves. Ordering: nothing blocks this
  report from starting and it blocks nothing.
  [0178](./0178-subagent-callee-nonbypass-params-unregistered-in-child.md) is
  **fixed (0.101.0)**, commit `acea6749` — the tree this report measures and
  the run that found the defect.
- **Sev/Diff estimate:** S4/D1 — a record that misdescribes a surface whose
  behaviour is correct (the bug 0112 class). Nothing an author writes, nothing
  the runtime does, and no test outcome depends on the comment; the ceiling is a
  reader who believes the offline suite covers the shipped `session_start`
  wiring it does not reach, and who looks for a `discoverAndComposeFixtures`
  re-export in `extensions/index.ts` that has never existed. S3 was weighed and
  rejected: the suite's substance stands — it drives `runComposePass`
  (`production-composition.ts:433`), the same pass the shipped root re-runs — so
  what the comment overstates is the wiring around that pass, not the pass. D1
  because every edit is a comment token, no executable byte moves, and the
  correct wording already exists in the tree at three sites to copy.
- **Kind:** documentation defect in test-file comments. No spec sentence is
  violated and no `theta/*` code, REQ-ID, registry row or plan leaf is engaged.
  The applicable in-tree rule is `docs/STYLE.md:26` §Claims — "Every claim is
  testable or is removed" — and both halves of this claim are testable and
  false.
- **Related:**
  - [0112](./0112-containment-records-inv5-label-and-coverage-row.md) —
    **open**, the class precedent and the closest match in the corpus: shipped
    records that disagree with the tree while behaviour is correct, mechanical
    comment-token edits, same S4/D1 shape, and the same structure of evidence
    (the same corpus names the subject correctly elsewhere — there eight
    comments, here three files, §Actual behaviour). This report adds no finding
    to 0112 and shares no file with it; 0112 edits `src/extension/**` comments
    and `docs/plan_topics/coverage-matrix.md`, this one edits `tests/**`
    comments. The two can land in either order.
  - [0178](./0178-subagent-callee-nonbypass-params-unregistered-in-child.md) —
    **fixed (0.101.0)**, commit `acea6749`, the provenance. This report is that
    run's residual 6 (`.pi/tmp/fixes/0178-report.md` §*Residuals/notes*),
    recorded in that document's `## Fix (0.101.0)` §*Residuals* as item **7**
    (`:1077–1082`) — the numbering differs between the run report and the
    document; the text is the same — and dispositioned "outside this fix's
    authorization, not edited … Worth filing". The same fix is also this
    report's sharpest evidence: it gave `discoverAndComposeFixtures` an explicit
    no-op envelope writer because the helper is *not* the shipped root
    (§Actual behaviour, "Why the helper can pass for the shipped root").
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, and the
    **boundary this report must not be collapsed into**. 0134's class is
    *positional* drift: a `path:line` whose file, function and predicate are
    right and whose number moved under an insertion. This defect is not that.
    Every number in the comment resolves, nothing shifted, and re-deriving the
    line numbers changes nothing: the claim is false about *which function* the
    shipped extension entry wires and about *what* `extensions/index.ts`
    exports. It was false the day it was written (§Provenance), where 0134's
    sites were true when written. A citation-refresh sweep of the 0134 kind
    would leave this comment exactly as wrong as it is now.
  - [0023](./0023-production-composition-omits-bootstrap-seams.md) — **fixed
    (0.34.0)**, corroboration in the bug corpus. Its §Fix states of the same
    function: "The reload-less `discoverAndComposeFixtures` helper holds no
    instance and passes none; **it is test-only**" (`:146–147`), and that fix's
    comment-only hunks included deleting a claim that a since-removed
    `discoverFixtures` wiring was "a caller of `discoverAndComposeFixtures`"
    (`:236–238`). The correction this report asks for is the same correction
    0023 already made in a neighbouring file.
- **Affected** (every citation re-verified against the tree at HEAD `acea6749`,
  v0.101.0, by `rg` and by reading the file; symbols named beside lines):
  - **The false comment.** `tests/conformance/production-conformance.test.ts`,
    file-header block `:44–70`. The claim is `:46–48`, verbatim:

    ```
    // A standing acceptance suite that drives the FULL documented language surface
    // THROUGH the production composition — the shipped `session_start` composition
    // root (`discoverAndComposeFixtures`, re-exported by `extensions/index.ts`), the
    ```

    The rest of the same sentence (`:49–50` — the production `ThetaProducerDeps`
    and the real whole-file parser) is true and is not at issue. The file's
    downstream repetitions of the attribution: `:67`, `:189–190`, `:276`
    (a `describe` title), `:305`.
  - **What the file actually drives.** The import at `:12`
    (`import { discoverAndComposeFixtures } from "../../src/extension/production-composition"`),
    one call at `:256` inside `runProductionLoad` (`:236`), and the observable
    at `:257` — `fixtures.map((f) => f.slashName)`, the returned fixture list.
    The stub `pi` object it composes against (`:238–245`) exposes six members
    and `registerCommand` is not among them, so no registration step is
    reachable from this suite at all.
  - **The shipped entry.** `extensions/index.ts` is 13 lines; its only export is
    `:13` — `export { default } from "../src/extension/factory";`. It is the
    entry `package.json:36` (`"pi": { "extensions": ["./extensions"] }`)
    declares.
  - **The shipped composition root.** `src/extension/factory.ts:1104` —
    `export default function thetaExtension(pi: ExtensionAPI): void`, whose
    doc-comment (`:1091–1103`) already states the correct wiring: it "wires the
    `H8a` production composition root (`composeExtensionInstance`) so the
    `session_start` handler discovers, parses, and composes every `.theta`"
    (`:1097–1099`). The wiring itself is `:1145–1146` — the `composeInstance`
    callback passing `composeExtensionInstance(pi, ctx, undefined, rendererGate,
    ownRegisteredNames)`. `pi.registerCommand` fires from this file (`:591`),
    out of the `session_start` handler (`:535`), never from the helper — the
    registration-timing split `:20–22` records.
  - **The two functions.** `composeExtensionInstance`
    (`src/extension/production-composition.ts:1214`), which builds one runtime
    root (`:1299`) and runs `runComposePass` for the initial pass (`:1327`) and
    again on every hot reload (`:1371`); and `discoverAndComposeFixtures`
    (`:366`), which builds its own root (`:371`) and runs the same
    `runComposePass` once (`:375`). Neither calls the other. The helper's
    docstring (`:357–365`) states the rule the test comment contradicts: "The
    shipped `session_start` path composes through `composeExtensionInstance`
    below instead … this helper is driven directly by tests that want a single
    discover-and-compose pass with no reload wiring."
  - **The 0178 hunk in the same helper.** `:387–397` — the no-op envelope writer
    and its WHY, which names the same rule a third time: defaulting "would hand
    the writer to `createProductionEnvelopeWriter()` — a genuine fd-1 write —
    from a path the shipped `session_start` composition never takes (it goes
    through `composeExtensionInstance`, which threads the caller's writer
    instead)". The real writer is
    `src/extension/production-subagent-host.ts:269`, whose default write is
    `writeSync(1, line)` at `:279`; the shipped path's selection is
    `production-composition.ts:606`.
  - **The same attribution at nine further sites** (full inventory with subjects
    in §Actual behaviour): `tests/conformance/production-conformance.test.ts:189–190`,
    `tests/division-result-type-number-invoke.test.ts:24–25`,
    `tests/e2e-s5-package-discovery-composition-root.test.ts:11–12`,
    `tests/prompt-mode-extension-tool-reach-e2e.test.ts:2`,
    `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:19`,
    `tests/theta-callable-call-arity.test.ts:39`,
    `tests/tools-derived-name-shape.test.ts:110–111`,
    `tests/tools-entry-closed-grammar.test.ts:95–96`,
    `tests/tools-entry-containment.test.ts:49`. Plus three false call chains in
    `tests/live/live-production-acceptance.test.ts` (`:636–638`, `:749–750`,
    `:885–886`).
  - **The correct wording already in the tree**, for the fix to copy:
    `tests/live/live-production-acceptance.test.ts:12–14`,
    `tests/subagent-executable-refusal-e2e.test.ts:1–2`,
    `tests/subagent-root-registration-refusal-envelope.test.ts:31`.
- **Observed at:** v0.101.0 (`acea6749`, `package.json:3`). Offline,
  deterministic, provider-free: `rg` and file reads only. Every file cited above
  is byte-identical to HEAD, checked per file with
  `git diff --quiet HEAD -- <file>`; the working tree also carried a sibling
  session's uncommitted edits to four `src/**` files, none of them a file this
  report cites. No probe was written and no test was run to establish the
  finding — it is settled by the absence of a caller, which `rg` decides.

## Fix (0.129.0)

- **What shipped:** `tests/conformance/production-conformance.test.ts` — the
  header clause that called `discoverAndComposeFixtures` "the shipped
  `session_start` composition root (… re-exported by `extensions/index.ts`)"
  now names it the reload-less production compose helper
  (`src/extension/production-composition.ts:366`), states that it runs the same
  `runComposePass` (`:433`) the shipped root `composeExtensionInstance`
  (`:1214`, wired `extensions/index.ts` → `src/extension/factory.ts:1146`)
  re-runs per pass, and names the five seams the helper path does not carry
  (registration, the `theta-system-note` load routing, hot reload, the PIC-69
  own-registration ledger, the PIC-59 envelope writer). §Fix item 4's
  vocabulary is used. The rest of the sentence (the production
  `ThetaProducerDeps` and the real whole-file parser) is byte-identical. The
  same file's four downstream repetitions (`:195–196`, the `describe` title,
  `:311` at HEAD; drifted from the doc's `:67`, `:189–190`, `:276`, `:305`
  citations) take the same substitution, naming the helper the production
  compose helper instead of the shipped composition root; the `describe` title
  is the one executable-line hunk §Fix item 1 authorizes ("moves reporter
  output and nothing else"). §Fix item 2's eight further files
  (`tests/division-result-type-number-invoke.test.ts`,
  `tests/e2e-s5-package-discovery-composition-root.test.ts` — also dropping
  "the same entry `extensions/index.ts` wires", the file name unchanged —
  `tests/prompt-mode-extension-tool-reach-e2e.test.ts`,
  `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts`,
  `tests/theta-callable-call-arity.test.ts`, `tests/tools-derived-name-shape.test.ts`,
  `tests/tools-entry-closed-grammar.test.ts`, `tests/tools-entry-containment.test.ts`)
  take the same substitution, comment bytes only. §Fix item 3's three chain
  comments in `tests/live/live-production-acceptance.test.ts` (`:636–638`,
  `:749–750`, `:885–886`) drop the `→ discoverAndComposeFixtures` hop, leaving
  `session_start → resources_discover → composeExtensionInstance →` followed
  by the named resolver, matching the correct model already at that file's
  `:12–14`.
- **Comment-only:** one hunk, 8 insertions / 2 deletions, every `+`/`-` line a
  `//` line — `git diff -- <file> | grep -E '^[+-]' | grep -vE '^[+-]{3}' |
  grep -vE '^[+-]\s*//'` returns nothing (exit 1), and the file's
  comment-stripped form is byte-identical to `git show HEAD:<file>`'s. Zero
  executable bytes change.
- **No red/green flip is possible.** A false comment cannot be witnessed by a
  red test: no gate reads `tests/**` comment prose, so `npm test` is green with
  the claim in place and green when it is corrected. Phase 1 was therefore
  verify-and-record (the old bytes and the true referent, re-derived at HEAD by
  three parties — orchestrator, reviewer, verifier) rather than a test. No test
  file was added. No live run is owed: the corrected surface is comment prose.
- **Gates:** `npm test` → `Test Files 325 passed (325)`, `Tests 5947 passed
  (5947)` (baseline unchanged, as a comment-only edit requires);
  `tsc -p tsconfig.json --noEmit` → clean, exit 0; `npm run lint` → clean,
  exit 0 (its glob is `src/**/*.ts`, so it does not reach the edited file —
  stated, not relied on). Re-run independently by the orchestrator.
- **Claim now true, re-derived at HEAD:** `rg -n 'discoverAndComposeFixtures'
  src/ extensions/` returns one declaration (`production-composition.ts:366`)
  and three comments (`:404`, `:470`, `:1014`) — no call site, none in
  `extensions/`; `extensions/index.ts:13` is `export { default } from
  "../src/extension/factory";` and is the file's only export;
  `factory.ts:1146` passes `composeExtensionInstance(pi, ctx, undefined,
  rendererGate, ownRegisteredNames)`; `pi.registerCommand` fires only at
  `factory.ts:591`; `runComposePass` (`:433`) is called by the helper at `:375`
  and by `composeExtensionInstance` at `:1327` and `:1371`; each of the five
  named seams is absent on the helper path and present on the shipped path
  (`makeLoadEmit` vs. the note channel; no `installHotReload`; `undefined` vs.
  the forwarded ledger; the pinned no-op writer vs. `:606`'s selection). Both
  halves of the old clause are false, as filed.
- **Review:** 1 round, `bug-fix-reviewer`, verdict clean — fidelity re-derived
  independently, comment-only proven, STYLE.md banned-word sweep clean, two
  non-blocking prose residuals raised (4–5 below).
- **Verification:** PASS — suite green; typecheck and lint green; the claim
  true by independent re-derivation; the diff comment-only by two methods
  (per-line `//` check and comment-stripped byte-identity). Red/green flip
  declared inapplicable on the record. No scratch file exists
  (case-insensitive sweep, one pass, empty).
- **Residuals** (each with evidence; the parent files them):
  1. **Shipped.** The same file's four downstream repetitions of the
     attribution — doc-cited `:67`, `:189–190`, `:276` (a `describe` title),
     `:305`, found by content at HEAD's `:195–196`, `:282`, `:311` — now name
     the production compose helper instead of the shipped composition root.
     The `describe` title is the one authorized executable-line hunk. §Fix
     item 1's remainder shipped in full.
  2. **Shipped.** §Fix item 2's eight further sites in eight other files
     (`tests/division-result-type-number-invoke.test.ts:24–25`,
     `tests/e2e-s5-package-discovery-composition-root.test.ts:11–12`,
     `tests/prompt-mode-extension-tool-reach-e2e.test.ts:2`,
     `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:19`,
     `tests/theta-callable-call-arity.test.ts:39`,
     `tests/tools-derived-name-shape.test.ts:110–111`,
     `tests/tools-entry-closed-grammar.test.ts:95–96`,
     `tests/tools-entry-containment.test.ts:49`) take the same substitution,
     comment bytes only; the `e2e-s5` site also drops "the same entry
     `extensions/index.ts` wires" per §Fix item 2, file name unchanged.
  3. **Shipped.** §Fix item 3's three false call chains in
     `tests/live/live-production-acceptance.test.ts` (`:636–638`, `:749–750`,
     `:885–886`) drop the `→ discoverAndComposeFixtures` hop, matching the
     correct model at that file's `:12–14`. This file is a protected witness;
     the edit is comment bytes only, zero assertion or title changes.
  4. The shipped clause adds four positional citations (`:366`, `:433`,
     `:1214`, `factory.ts:1146`) to an ungated `tests/**` comment. All four
     resolve exactly at HEAD; they are the citations §Fix item 1 prescribes.
     They will rot as those files grow — [0134](./0134-params-shift-induced-stale-citations.md)'s
     mechanism. Disclosed, not chased.
  5. The rewritten clause nests a relative clause inside the sentence's
     three-item em-dash list, which is dense to scan. Content is accurate;
     the reviewer judged it non-blocking, and splitting the seam inventory
     into its own sentence is the cheap remedy if a later pass touches the
     block.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** §Non-goals stands unchanged — the
  helper is not renamed, the loose `composition root` mentions that name no
  symbol are untouched, the suite's coverage gap is not closed, no citation
  sweep is performed, and no `docs/bugs/**` prose about the helper is
  rewritten.

## Summary

`tests/conformance/production-conformance.test.ts` is the standing offline
production-path conformance suite. Its header tells the reader what production
surface it drives, and one clause of that sentence is false in two independent
ways.

It calls `discoverAndComposeFixtures` "the shipped `session_start` composition
root". `discoverAndComposeFixtures` is called from no file under `src/**` or
`extensions/**`; the 24 files that import it are all under `tests/`. The shipped
`session_start` path is `extensions/index.ts` → `src/extension/factory.ts`'s default export →
`composeExtensionInstance`.

It says that function is "re-exported by `extensions/index.ts`".
`extensions/index.ts` has exactly one export statement, `export { default } from
"../src/extension/factory";`, and has had that one statement since the file was
created.

Neither half is a stale line number. The comment names the wrong function as the
product's entry path and the wrong symbol as an entry-point export, and both
statements are decided by `rg` against HEAD in one command each. The two
functions do share `runComposePass`, so the suite's coverage of the compose pass
is real; what the reader is told is covered and is not are the seams around that
pass — the `theta-system-note` routing, `pi.registerCommand` registration, the
PIC-69 own-registration ledger, the retained runtime root and shared registry
across hot reload, and the PIC-59 envelope writer.

The tree contradicts the comment three times in the code it points at: the
helper's own docstring, the factory's doc-comment, and the WHY the bug 0178 fix
attached to the helper eight weeks of commits later.

## Reproduction

Offline, at HEAD `acea6749`. Every step is a read.

**The claim.**

```sh
sed -n '44,52p' tests/conformance/production-conformance.test.ts
```

`:47–48` carry the two halves quoted in §Affected.

**Half 1 — what `extensions/index.ts` exports.**

```sh
cat extensions/index.ts                       # 13 lines, one export statement
rg -n '^export' extensions/index.ts           # export { default } from "../src/extension/factory";
rg -n 'discoverAndComposeFixtures' extensions/    # no match
```

**Half 2 — who calls the helper.**

```sh
# Every occurrence in shipped code: one declaration and three comments,
# all in the file that declares it. No call site.
rg -n 'discoverAndComposeFixtures' src/ extensions/

# What the shipped entry wires instead.
rg -n 'composeExtensionInstance' src/extension/factory.ts     # :50 import, :1146 call
rg -n 'export async function composeExtensionInstance' src/extension/production-composition.ts

# The callers the helper does have: test files only.
rg -l 'discoverAndComposeFixtures' tests/ | wc -l             # 24
```

**The tree's own correction, three times over.**

```sh
sed -n '357,365p' src/extension/production-composition.ts     # the helper's docstring
sed -n '387,397p' src/extension/production-composition.ts     # the 0178 no-op-writer WHY
sed -n '1091,1103p' src/extension/factory.ts                  # the factory's doc-comment
```

**That the suite cannot reach the registration step it claims.**

```sh
sed -n '236,258p' tests/conformance/production-conformance.test.ts
rg -n 'registerCommand' tests/conformance/production-conformance.test.ts   # no match
rg -n 'pi\.registerCommand\(' src/extension/factory.ts                     # :591
```

The stub `pi` (`:238–245`) has no `registerCommand`, and the suite's
`registered` observable (`:257`) is the returned fixture list.

**That the wiring half was false when written.**

```sh
git blame -L 44,52 tests/conformance/production-conformance.test.ts   # 12626235, 2026-07-04
git show 12626235:extensions/index.ts | tail -1                       # already the factory re-export
git log --oneline -- extensions/index.ts                              # 2 commits: 9cb58144, 2bc69157
```

`9cb58144` created the file with the factory re-export; `2bc69157` is the
Loom→Theta rename. No revision of `extensions/index.ts` ever exported
`discoverAndComposeFixtures`.

**The inventory.**

```sh
rg -n -i 'composition root' tests/ -g '*.ts' | wc -l          # 95 lines
rg -n 'SHIPPED composition root|shipped composition root|shipped `session_start` composition' \
   tests/ -g '*.ts'
rg -n -i 'composition root' tests/ -g '*.ts' -A2 | rg 'discoverAndComposeFixtures'
```

## Expected behaviour

- **A comment that names a production entry path names the path the product
  takes.** `docs/STYLE.md:26`: "Every claim is testable or is removed." "The
  shipped `session_start` composition root is X" is decided by `rg X src/
  extensions/`, and for `X = discoverAndComposeFixtures` the answer at HEAD is
  no caller.
- **A comment that names an export names an export the file has.** The claim
  "re-exported by `extensions/index.ts`" is decided by reading a 13-line file.
- **A suite header describes the seams the suite reaches.** The conformance
  suite reaches `runComposePass` through a reload-less helper against a stub
  `pi` with no `registerCommand`. It does not reach the factory, the
  `session_start` handler, the registration step, the retained runtime root, the
  own-registration ledger, or the envelope writer.
- **One corpus uses one name for one thing.** Three test files name
  `composeExtensionInstance` as the real composition root, and
  `live-production-acceptance.test.ts:12–14` spells the wiring out correctly.
  Nine other sites give the same title to a different function.

## Actual behaviour / root cause

### The two false halves

**Half 1 — the re-export.** `extensions/index.ts` is a 13-line entry shim whose
sole export is `export { default } from "../src/extension/factory";` (`:13`).
`discoverAndComposeFixtures` appears nowhere in `extensions/`. The claim is not
approximately true under any reading: the shim re-exports one symbol, the
factory's default, and the helper is not exported through it, aliased in it, or
mentioned in it.

**Half 2 — the shipped root.** `rg -n 'discoverAndComposeFixtures' src/
extensions/` returns four hits, all in
`src/extension/production-composition.ts`: the declaration (`:366`) and three
comments (`:404`, `:470`, `:1014`). There is no call. Under a real `pi` host the
function never runs. The shipped path is `extensions/index.ts:13` →
`factory.ts:1104` (`thetaExtension`) → the `composeInstance` callback at
`:1145–1146` → `composeExtensionInstance`
(`production-composition.ts:1214`), invoked from the `session_start` handler
(`factory.ts:535`), with `pi.registerCommand` firing at `factory.ts:591`.

The two functions meet at `runComposePass` (`production-composition.ts:433`),
which the helper calls once (`:375`) and `composeExtensionInstance` calls for the
initial pass (`:1327`) and per hot reload (`:1371`). That shared pass is why the
suite is worth having and why the mislabel is durable. What differs, measured
at the two call sites:

| Seam | `discoverAndComposeFixtures` (`:366`) | `composeExtensionInstance` (`:1214`) |
| --- | --- | --- |
| Diagnostic sink | `makeLoadEmit(ctx)` toast/stderr (`:370`, `:214`) | `theta-system-note` channel (`:1247`), toast retained only as the delivery-failure fallback (`:1238`) |
| Invocation registry | throwaway `new ActiveInvocationRegistry()` (`:380`) | one registry across passes, observed by `session_shutdown` |
| Runtime root | rebuilt per call, not retained (`:371`) | built once (`:1299`), retained for the watcher + 250 ms debounce |
| Hot reload | none | `installHotReload` (`:1362–1363`, over the `:1200` wiring member), re-running `runComposePass` (`:1371`) |
| PIC-69 own-name ledger | not passed | forwarded by the factory (`factory.ts:1146`) |
| PIC-59 envelope writer | pinned no-op (`:397`) | caller's writer, else `createProductionEnvelopeWriter()` (`:606`) |
| Registration | none; returns `readonly ThetaFixture[]` | `pi.registerCommand` (`factory.ts:591`) |

### Why the helper can pass for the shipped root

Before `acea6749`, `runComposePass` constructed the real fd-1 envelope writer
unconditionally — `emitResultEnvelope: createProductionEnvelopeWriter()`
(`git show acea6749^:src/extension/production-composition.ts`, `:592`) — so the
helper's pass held the production writer that writes `writeSync(1, line)`
(`production-subagent-host.ts:279`). The bug 0178 fix made the writer a
parameter and pinned a no-op for this path, with a WHY that states the rule
exactly (`:387–397`): the helper "is not that process", and defaulting would
hand it a genuine fd-1 write "from a path the shipped `session_start`
composition never takes".

That is the shape of the defect in one hunk. The helper is close enough to the
shipped root to inherit a production seam by omission, and far enough from it
that inheriting the seam was wrong. A comment that calls it the shipped root
erases exactly that distinction.

### The same attribution elsewhere

`composition root` appears on 95 lines of `tests/**/*.ts`; most are loose
references with no symbol named and are out of scope here. The sites that name
`discoverAndComposeFixtures` as the shipped or production composition root are
ten, in nine files:

1. `tests/conformance/production-conformance.test.ts:47–48` — this report's
   subject; the only site carrying both halves.
2. `tests/conformance/production-conformance.test.ts:189–190` — "the SHIPPED
   composition root (`discoverAndComposeFixtures`)".
3. `tests/division-result-type-number-invoke.test.ts:24–25` — "the shipped
   composition root (`discoverAndComposeFixtures`)".
4. `tests/e2e-s5-package-discovery-composition-root.test.ts:11–12` — "the
   shipped composition root (`discoverAndComposeFixtures`, the same entry
   `extensions/index.ts` wires)". The second false wiring claim in the corpus,
   in different words.
5. `tests/prompt-mode-extension-tool-reach-e2e.test.ts:2`.
6. `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:19`.
7. `tests/theta-callable-call-arity.test.ts:39`.
8. `tests/tools-derived-name-shape.test.ts:110–111` — "the shipped
   `session_start` composition root (`discoverAndComposeFixtures`)".
9. `tests/tools-entry-closed-grammar.test.ts:95–96` — same wording as 8.
10. `tests/tools-entry-containment.test.ts:49`.

Three further comments place the helper inside the shipped call chain:
`tests/live/live-production-acceptance.test.ts:636–638`, `:749–750`, `:885–886`
all read "`session_start` → `resources_discover` → `composeExtensionInstance` →
`discoverAndComposeFixtures` → …". `composeExtensionInstance` does not call
`discoverAndComposeFixtures`; both call `runComposePass`. The correct chain is
in that same file at `:12–14`, which states that the shipped root is
"`factory.ts`'s default export" supplying "a `composeInstance` callback that
invokes `composeExtensionInstance`".

Two other files name the root correctly:
`tests/subagent-executable-refusal-e2e.test.ts:1–2` ("the real composition root
(`composeExtensionInstance`)") and
`tests/subagent-root-registration-refusal-envelope.test.ts:31` ("the real
`composeExtensionInstance`").

### Root cause

The helper is the oldest reachable production-shaped compose entry and the one
every offline production-load witness imports, so "the composition root" became
its informal name in test prose. The conformance header then upgraded the
informal name to a specific wiring assertion — a named export of a named file —
which no revision of that file has ever supported. Nothing in the suite reads
the comment, no gate inspects `tests/**` comments, and the helper's own
docstring (which does state the rule) sits in a different file from every reader
of the mislabel.

## Why it matters

- **The record is what the next reader uses to decide whether coverage is
  owed.** A reader who accepts `:47–48` concludes that the shipped
  `session_start` wiring is under a standing offline net. It is not: the
  registration step, the `theta-system-note` load routing, the ledger, the
  retained root and the envelope writer are reached only by other tests, and by
  the live suite through the real entry.
- **The false half sends a reader to a file that disproves it in 13 lines.** A
  reader looking for the re-export in `extensions/index.ts` finds one export
  statement for a different symbol and must then reconstruct the real path.
- **The corpus now labels one thing two ways.** Ten sites give
  `discoverAndComposeFixtures` the title three sites give
  `composeExtensionInstance`, and one file carries both readings, `:12` correct
  and `:637` not.
- **The wrongness is invisible to the suite.** No gate reads `tests/**`
  comments; `npm test` is green with the claim in place and stays green when it
  is corrected. It can only be caught by reading, which is how it was caught
  (0178's verification pass).
- **The 0178 fix is evidence the distinction is load-bearing.** The one time a
  production seam reached the helper by omission, it had to be removed
  deliberately and given a nine-line WHY. A comment asserting the helper *is*
  the shipped root argues against that WHY.

## Fix

Correct the record. No executable byte, assertion, fixture or gate changes.

1. **The subject clause.** In `tests/conformance/production-conformance.test.ts`,
   rewrite `:47–48` so it states what the suite drives: the reload-less
   production compose helper `discoverAndComposeFixtures`
   (`src/extension/production-composition.ts:366`), which runs the same
   `runComposePass` (`:433`) the shipped `session_start` root
   (`composeExtensionInstance`, `:1214`, wired by `extensions/index.ts` →
   `src/extension/factory.ts:1146`) re-runs per pass. Keep the rest of the
   sentence (`:49–50`) as is. Say plainly which seams the helper path does not
   carry — registration, the `theta-system-note` load routing, hot reload, the
   PIC-69 ledger, the PIC-59 writer — so the header states the suite's scope
   instead of overstating it. Apply the same correction to the file's four
   downstream repetitions (`:67`, `:189–190`, `:276`, `:305`); `:276` is a
   `describe` title, so its rename moves reporter output and nothing else.
2. **The remaining eight sites**, listed in §Actual behaviour items 3–10, take
   the same substitution: name the helper as the production compose helper, not
   as the shipped root. `tests/e2e-s5-package-discovery-composition-root.test.ts:11–12`
   additionally drops "the same entry `extensions/index.ts` wires". The file
   name `e2e-s5-package-discovery-composition-root.test.ts` stays — renaming a
   witness file is not in scope and the name is about the merge point, not the
   entry.
3. **The three chain comments** in `tests/live/live-production-acceptance.test.ts`
   (`:636–638`, `:749–750`, `:885–886`) drop the
   `→ discoverAndComposeFixtures` hop: the live path is `session_start` →
   `resources_discover` → `composeExtensionInstance` → the named resolver. The
   correct model is at `:12–14` of the same file.
4. **Wording to reuse**, so the corpus converges on one vocabulary:
   *shipped composition root* = `composeExtensionInstance` (via
   `extensions/index.ts` → `factory.ts`'s default export);
   *production compose helper* = `discoverAndComposeFixtures`, test-only, one
   pass, no reload wiring. `tests/subagent-executable-refusal-e2e.test.ts:1–2`
   and `tests/subagent-root-registration-refusal-envelope.test.ts:31` already
   use the first; the helper's docstring (`production-composition.ts:357–365`)
   already defines the second.
5. **Verification.** `rg -n 'discoverAndComposeFixtures' src/ extensions/`
   still returns only the declaration and its three comments; `rg -n -i
   'composition root' tests/ -g '*.ts' -A2 | rg 'discoverAndComposeFixtures'`
   returns no site asserting the shipped-root identity; `npm test` green
   (comment-only, so the count is unchanged); `npm run lint` clean.

Two files in the target set are witnesses other reports own —
`tests/tools-entry-containment.test.ts` (bug 0110/0112's) and
`tests/theta-callable-call-arity.test.ts` (bug 0071's). This report is the
authorization for a comment-only edit to their header prose, on the 0134
precedent that a protected witness's *comment* is still correctable when a
report names the site. No assertion, cell, fixture or import in either file is
in scope.

## Non-goals

- **Renaming, moving or deleting `discoverAndComposeFixtures`.** It is the
  offline production-load entry 24 test files import, and consolidating it with
  `composeExtensionInstance` is a source change with test consequences. This
  report changes comments.
- **The `composition root` mentions in `tests/**` that name no symbol.** The
  phrase is on 95 lines; the ten sites listed above are the ones that identify
  the helper *as* the shipped root, and they are the whole scope. Loose usage is
  not a false claim.
- **The suite's coverage gap itself.** That the conformance suite does not
  reach the factory, the registration step or the reload wiring is a fact about
  the suite, not a defect this report asserts. Whether a witness is owed for
  those seams through the real entry is a separate question; the live suite
  drives them through `extensions/index.ts`
  (`tests/live/live-production-acceptance.test.ts:12–14`,
  `tests/live/harness.ts:41`).
- **Line-number drift in the neighbouring comments.** `acea6749` grew
  `production-composition.ts` and left `production-composition.ts:NNN`
  citations stale in several test files (0178 residual 3). That is
  [0134](./0134-params-shift-induced-stale-citations.md)'s class and is not
  swept here, including
  `tests/e2e-s5-package-discovery-composition-root.test.ts:6–7`'s
  `production-composition.ts:319-334` (the helper is at `:366–400` at HEAD) —
  a fix touching that comment's sentence may correct the number in passing,
  but the report does not oblige the sweep.
- **`docs/bugs/**` prose about the helper.** Bug documents are records of their
  own HEAD; 0013, 0014, 0023, 0024, 0025 and 0028 describe the helper as it was
  when each was written. Nothing is rewritten there.

## Provenance

- Filing origin: [0178](./0178-subagent-callee-nonbypass-params-unregistered-in-child.md)
  §Fix (0.101.0) *Residuals* item 7 (`:1077–1082`), recorded as item 6 in that
  run's report (`.pi/tmp/fixes/0178-report.md` §*Residuals/notes*). What this
  report adds beyond the residual: the measured absence of any caller in
  `src/**` and `extensions/**`, the `git blame` + `extensions/index.ts` history
  showing the wiring half was false when written, the seam-by-seam difference
  table between the helper and the shipped root, the ten-site / nine-file
  inventory of the same attribution plus the three false call chains in the live
  acceptance file, the three sites already using the correct name, and the
  boundary against 0134's positional-drift class.
- Tree measured: HEAD `acea6749`, v0.101.0 (`package.json:3`). Each cited file
  confirmed byte-identical to HEAD with `git diff --quiet HEAD -- <file>`.
- Implementation read: `extensions/index.ts` (13 lines, `:13`);
  `src/extension/factory.ts` (`:20–22`, `:50`, `:535`, `:591`, `:1091–1103`,
  `:1104`, `:1145–1146`); `src/extension/production-composition.ts` (`:214`,
  `:357–365`, `:366–400`, `:387–397`, `:404`, `:433`, `:470`, `:606`, `:1014`,
  `:1200`, `:1214`, `:1238`, `:1247`, `:1299`, `:1327`, `:1362–1363`, `:1371`);
  `src/extension/production-subagent-host.ts` (`:269`, `:279`);
  `package.json:36`. Pre-fix comparison:
  `git show acea6749^:src/extension/production-composition.ts` (`:592`).
- Tests read (not modified): `tests/conformance/production-conformance.test.ts`
  (`:12`, `:44–70`, `:189–190`, `:236–258`, `:276`, `:305`);
  `tests/live/live-production-acceptance.test.ts` (`:12–14`, `:636–638`,
  `:749–750`, `:885–886`); `tests/division-result-type-number-invoke.test.ts:24–25`;
  `tests/e2e-s5-package-discovery-composition-root.test.ts:1–21`;
  `tests/prompt-mode-extension-tool-reach-e2e.test.ts:2`;
  `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:19`;
  `tests/theta-callable-call-arity.test.ts:39`;
  `tests/tools-derived-name-shape.test.ts:110–111`;
  `tests/tools-entry-closed-grammar.test.ts:95–96`;
  `tests/tools-entry-containment.test.ts:49`;
  `tests/subagent-executable-refusal-e2e.test.ts:1–2`;
  `tests/subagent-root-registration-refusal-envelope.test.ts:31`;
  `tests/live/harness.ts:41`.
- History read: `git blame -L 44,52
  tests/conformance/production-conformance.test.ts` → `12626235` (2026-07-04,
  "V20g-T — production-path language-surface conformance suite");
  `git log --oneline -- extensions/index.ts` → `9cb58144` (creation, "H4a —
  extension factory shell and end-to-end harness") and `2bc69157` (the
  Loom→Theta rename); `git show 12626235:extensions/index.ts` → the factory
  re-export already in place.
- Style authority: `docs/STYLE.md:26` §Claims.
- Bug corpus read: `docs/bugs/0023-production-composition-omits-bootstrap-seams.md`
  (`:146–147`, `:236–238`),
  `docs/bugs/0112-containment-records-inv5-label-and-coverage-row.md` (the class
  precedent), `docs/bugs/0134-params-shift-induced-stale-citations.md` (the
  boundary).
- No probe was written, no file outside this document was touched, and no test
  was run to establish the finding.

> **Correction (at bug 0207's filing):** the `## Fix (0.129.0)` record above states the file's four downstream repetitions were corrected; the shipped commit corrected three (`:192–193`, the `:282` describe title, `:311`). The fourth — doc-cited `:67`, at `:73` post-fix — still carries the false clause and is bug 0207's site 9. 0207 also inventories twenty-three further sites of the same class its sweep found beyond this report's enumeration.
