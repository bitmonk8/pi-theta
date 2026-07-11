# Real-CLI hardening campaign — summary

A second hardening pass that drives the **actual `pi` CLI binary** end-to-end
(`pi -ne -e ./extensions --loom <dir> --model claude-haiku-4-5 -p "/<stem> …"`),
the way a real user runs it. The prior campaign (`tests/hardening/SUMMARY.md`,
25 fixes) used the **in-process** `bootShippedExtension` harness; this pass
targets the gap that harness structurally cannot see — CLI flag parsing, the real
discovery walk, slash dispatch, the stdout/stderr/exit contract, and headless
`-p` diagnostic surfacing. Six parallel lens workers authored adversarial
`.loom`/`.warp` files and compared observed CLI behaviour to the spec/docs; see
`HARNESS.md` and the per-lens files (`discovery.md`, `binder.md`,
`frontmatter-diagnostics.md`, `imports.md`, `expressions.md`,
`invoke-ceilings.md`).

## Dominant fresh defect class

The prior campaign's class was "implemented but not wired into the shipped
composition." This pass surfaced two CLI-only classes on top of that:

1. **Wrong routing at the composition root.** A spec check existed and was even
   emitted, but landed in a channel the real CLI user never sees (`ctx.ui.notify`
   is the runner no-op in headless mode), or a per-loom error was allowed to
   abort the whole discovery walk.
2. **Contract drift only observable end-to-end** — untyped `invoke` returning the
   child value, a callee panic escaping `match`/`?`, object interpolation shipping
   loom-side names, a defaulted param arriving as `null`.

## Fixed and pushed (this pass)

| id | area | one-line | commit |
|---|---|---|---|
| EXPR-CLI-1 | render | object/array `${}` interpolation shipped loom-side field names, not the QRY-18 wire names | `5dc32396` |
| INVCEIL-3 | invoke | untyped `invoke(...)` returned the child's value instead of the documented `null` | `7a16865d` |
| INVCEIL-2 | invoke | a callee runtime panic escaped as a raw host throw, uncatchable by the parent's `match`/`?` | `7a16865d` |
| IMPORTS-1 | imports | a backslash path separator in `import` was silently accepted and resolved | `62af517e` |
| IMPORTS-2 | imports | two imports of the same name silently last-import-wins shadowed (no `import-name-collision`) | `62af517e` |
| INVCEIL-1 | invoke/discovery | a literal `invoke(...)` of a missing callee aborted the whole `--loom` source (all siblings un-registered) | `a9821d65` |
| DISCLI-1 | discovery | `readLoomFlagPaths` discarded an array-valued `--loom` flag wholesale (defensive hardening) | `59d557ed` |
| BND-2 | binder | a declared `params:` default (`count: integer = 3`) reached the body as `null` when omitted | `d0270a35` |
| FMC-1 / DISCLI-2 / IMPORTS-3 | diagnostics | in headless `-p`/RPC mode every dropped-loom error diagnostic vanished (silent chat, exit 0); now mirrored to stderr | `393d1abc` |
| QTL-2 | tools (security) | the `tools:` callable set was never enforced at runtime — a loom with `tools:` absent could `bash`/`read`/`write` from code (ambient-tool inheritance / sandbox-bounding bypass); now dispatched only through the frozen per-loom snapshot | `29c72d76` |
| QTL-2 (residual) | tools (security) | `invoke(...)` callees were parsed without a snapshot, re-opening the same bypass one invoke level down; callees now carry their own callable set | `a1939d40` |
| QTL-4 | tools | in prompt mode the query driver hardcoded `setActiveTools([])`, so the model got no tools and a declared `tools:` entry was unusable; now installs the callable set's Pi-tool names | `29c72d76` |

Each fix was verified against its spec anchor, re-run through the real CLI to
confirm before/after, and gated on `npm test` (1595) + `npm run test:conformance`
(26) + `npm run typecheck` + `npm run lint`, all green.

The 7th lens (typed-query schema-validation / `respond_repair` / `tool_loop` /
code-driven tool calls) is in `queries-toolloop.md`; QTL-2/QTL-4 fixed above, the
rest documented below.

## Open / deferred (NOT fixed — documented for a decision)

- **BND-1 / BND-3 — binder envelope leak (spec-vs-impl conflict).** On a binding
  failure the raw internal envelope (`{"kind":"needs_info","message":"…"}`) is
  printed to the user on stdout, and the spec-mandated formatted notes
  (`Running /<name>: …` on success; `loom /<name>: argument binding needs more
  info — …` on failure) are never emitted. Root: the shipped binder runs as a
  **user-visible streamed turn** and prints the envelope by design
  (`production-loom-producer.ts` `runBinder`: "drive ONE user-visible streamed
  turn … emitting ONLY the minified envelope JSON … the acceptance runner
  observes"), and the tutorial documents that envelope as the feature. This
  contradicts the spec (`binder.md`: the envelope is runtime-internal; the
  loom/user never sees it). The leak happens *during* live streaming, before
  `runBinder` can intercept, so suppressing it requires running the binder
  off-session (the `ctx.model` + pi-ai `complete()` path already used for chained
  queries) and re-emitting the formatted notes — a re-architecture that would
  break the current acceptance contract and shipped tutorial. **Needs a design
  decision** on whether the binder turn is visible; not safe to change
  unsupervised.

- **Exit-code contract (FMC-2, EXPR-CLI-3, INVCEIL panic surfaces).** A loom that
  fails to load, or that hits a runtime panic (`index out of bounds`,
  non-exhaustive `match`), still exits `0` under `pi -p`; a scripted/CI caller
  cannot distinguish it from a clean run. Partially mitigated now (load errors are
  visible on stderr via the FMC-1 fix), but the process exit code is a Pi-harness
  property the extension may not be able to set from a load diagnostic or an
  interpreter panic. Borderline; document.

- **QTL-1 — prompt-mode chained queries run off-session (invisible).** Only the
  first query in a prompt-mode dispatch drives a user-visible turn; every
  subsequent query runs off-session (`complete()`) and executes but is invisible
  in the caller's conversation, defeating the guide's "every prompt-mode turn is
  user-visible" promise and the "final query shows the result" pattern. Same
  self-documented `SLSH-2` DIVERGENCE as the binder turn; borderline, needs the
  same design decision as BND-1/3.

- **QTL-3 — depth-violation typed-query failures skip respond-repair.** A response
  rejected by the schema depth ceiling (#4 row #1) reports `attempts: 0` and
  issues no repair follow-up, even under the default budget of 3, whereas ordinary
  AJV misses do repair. Plausibly an intentional "structural failure is
  unrepairable" short-circuit but undocumented; borderline.

- **QTL-5 — bare `array` in schema position accepted silently.** `schema Bad {
  items: array }` (out of the documented subset — `array<T>` required) loads, runs,
  and lowers `items` to an array with no load diagnostic on any channel. Adjacent
  to the README's known type-layer diagnostic gap; borderline.

- **EXPR-CLI-2 — `match` on enum-variant patterns.** `match c { Color.Red => … }`
  fails to parse (enum-variant is not a listed pattern form in `grammar.md`), and
  before the FMC-1 fix the load failure was fully silent in `-p`. Rejecting an
  out-of-grammar pattern is defensible, but there is no documented way to `match`
  on an enum (workaround: `if c == Color.Red`). Borderline — a spec/doc gap, not a
  runtime defect.

## Verified-correct (no defect, recorded to bound the search)

Broad end-to-end confirmation that prior fixes hold through the real CLI: number
rendering incl. large-magnitude/`-0`/scientific edges, arithmetic/precedence/
modulo, enum wire values, control flow, recursion/mutual-recursion, `match` on
literals/arrays, index OOB/negative panics, string/array stdlib; stem-validity and
non-recursive discovery; `.warp` never registers as a slash command; cross-source
precedence (CLI > project); the supported `;`-joined `--loom` multi-path form;
invoke depth ceiling #1 (cap 32) firing cleanly without a host hang; typed
`invoke<Schema>` return validation; the single-string and no-params binder
bypasses and the SLSH-1 overflow note.
</content>
