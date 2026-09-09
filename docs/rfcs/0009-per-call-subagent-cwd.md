# RFC 0009 — Per-call working directory for subagent-mode dispatch

- **Status:** accepted
- **Scope:** theta 1.x language surface (governed by
  [`../spec_topics/governance/release-version-naming.md`](../spec_topics/governance/release-version-naming.md))
- **Affects:** grammar, parse diagnostics, invocation and tool-call semantics,
  the subagent launch contract (one field), docs

## Summary

Add an optional postfix `with { cwd: <expr> }` clause to the call surfaces that
dispatch a subagent-mode callee — `.theta`-callable calls, `invoke(...)`, and
`subagent fn` calls — which sets the spawned child `pi` process's working
directory for that one invocation. Everything else about the launch is
unchanged.

```theta
let cluster_list = "src/parser,src/runtime"
let rows = lines(bash({ command: "node tools/worktrees.mjs provision --clusters " + cluster_list })?)
let reports = par for row in rows max parallel {
  // row is "key<TAB>manifest<TAB>worktree"
  fix_cluster(row.split("\t")[1], "") with { cwd: row.split("\t")[2] }
}
```

## Motivation

A theta cannot direct a subagent-mode callee to operate in a different working
directory. The child `pi` process cwd is pinned to the parent session's cwd at
the single production bind site:

- `spawnSubagentConversation` (`src/extension/production-theta-producer.ts`)
  passes `cwd: ctx.cwd` into the launch request;
- `launchSubagentChild` (`src/runtime/subagent-launcher.ts`) spawns the child
  with `deps.spawn(execPath, argv, { cwd: request.cwd, env })`.

Neither the `tools:`-callable call surface, `invoke(...)`, nor RFC-0001's
declaration-site `subagent fn … with { … }` clause exposes a cwd — the
declaration-site `with` key set is
`system / model / tools / tool_loop / respond_repair` (`SubagentSessionConfig`
and `WITH_CLAUSE_KEYS`, `src/parser/theta-document.ts`;
[Grammar — `fn` declarations](../spec_topics/grammar.md#fn-declarations)).

Consequence: fan-out workflows that need workspace isolation (git worktrees,
scratch checkouts, per-shard build dirs) cannot run fixers/builders in
parallel — the current `/quality-loop` serializes its whole fix pipe because
every fixer edits the one shared tree.

The workaround (spawn `pi -p` via `bash({ command: "cd <tree> && pi …" })`) was
evaluated and rejected: it loses the typed `theta_result` envelope (theta has no
JSON parsing), re-derives the launch argv contract by hand (trust flags,
`--theta` roots, `--no-session`), and inherits `pi -p`'s exit-0-on-failure
hazard ([RFC 0007](./0007-print-mode-observability.md), motivation 1).

## Proposal

### 1. Surface and grammar

Postfix clause on a call expression: `Callee(args…) with { cwd: Expr }`.
Applies to `.theta`-callable calls (frontmatter `tools:` entries), to
`invoke(path, args…)` / `invoke<T>(path, args…)`, and to `subagent fn` call
sites. It reuses RFC-0001's `with`-clause parse machinery (`WithClause` /
`WithField`, `src/parser/theta-document.ts`).

[Grammar](../spec_topics/grammar.md) today carries **no call-expression
production to widen**, and its only `WithClause` production
([`#fn-declarations`](../spec_topics/grammar.md#fn-declarations)) is
RFC-0001's declaration-site clause, commented `// subagent fn only (theta
1.2)`. The spec amendment therefore introduces a **new** production rather
than widening an existing one — sketched here in grammar.md's notation:

```
CallWithClause ::= "with" "{" CallWithField ("," CallWithField)* ","? "}"  // call-site options clause (this RFC)
CallWithField  ::= CallWithKey ":" Expr
CallWithKey    ::= "cwd"                                                   // closed set, v1
```

- The clause attaches immediately after a call's closing `)`, before any other
  postfix operator: in `f(a) with { cwd: t }?` the clause binds to the call
  and `?` then applies to the call's `Result`.
- `with` remains a contextual keyword. It gains a second recognition position
  — immediately after a call expression's argument list, and only when
  followed by `{` — mirroring RFC-0001's guard, and stays an ordinary
  identifier everywhere else
  ([Grammar — contextual keywords](../spec_topics/grammar.md#fn-declarations)).
- *Implementation anchors (non-normative):* the clause parses in
  `parsePostfix`'s loop (`src/parser/theta-document.ts`), joining the existing
  postfix `?` / `.` / `[` / method-call / `++`/`--` handling; `invoke(...)`
  parses via `parseInvoke` dispatched from `parsePrimary`. AST carriage is a
  new optional field on `CallExpr` / `InvokeExpr`.

Two deliberate differences from the declaration-site clause:

1. **Closed key set, v1 = `{ cwd }`; unknown keys are a parse error.** This
   clause is the anticipated per-call *options surface* the spec already
   reserves —
   [Future Considerations — Surface extensions](../spec_topics/future-considerations/surface-extensions.md#surface-extensions-v1-leaves-a-seam)
   anchors per-call timeouts and per-query overrides at "Query/Tool
   Calls/Invocation — Options surface". `cwd` is its first consumed key;
   per-call `timeout` later slots in beside it. (The severity divergence from
   the declaration-site clause is deliberate — see Resolved questions, item 6.)
2. **The value is a full runtime expression**, evaluated at call time — unlike
   declaration-site `with` values, which obey the like-named frontmatter
   field's literal shape. Worktree paths are computed per iteration; a
   literal-only clause would be useless.

Evaluation order: argument expressions evaluate left-to-right in source order
(existing rule, [Tool Calls — Argument shape](../spec_topics/tool-calls.md)),
then the `cwd` expression, then dispatch. A panic or early-`?` inside the
`cwd` expression MUST abort the call before spawn — ordinary expression
semantics.

The *declaration*-site `with` does NOT gain a `cwd` key in v1 (Resolved
questions, item 4).

### 2. Mode gating

`cwd` is meaningful only for subagent-mode dispatch: the spawned child process
is what has a working directory. Rules:

- A clause on a **statically resolvable** callee
  ([Invocation — Static resolution](../spec_topics/invocation.md#static-resolution))
  whose `mode:` is `prompt` MUST be rejected at parse time with
  `theta/parse/with-clause-prompt-mode-callee` (§New diagnostics).
- A clause on a callee that is **not statically resolvable** and turns out
  prompt-mode at runtime MUST surface
  `Err(InvokeInfraError { cause: "validation", … })` — the same arm the
  existing input-shape violations use on this surface
  ([Tool Calls — Failures](../spec_topics/tool-calls.md),
  [Invocation — Failures](../spec_topics/invocation.md)). No new runtime code.
- A clause on a **Pi-tool call** (non-`.theta` callee) MUST be rejected at
  parse time with `theta/parse/with-clause-pi-tool`. A Pi tool executes
  in-process against the parent session; there is no child cwd. (Future work
  may define per-call cwd for the bash tool, but that is Pi's surface, not
  theta's.)
- `subagent fn` call sites take the clause under the same rules; a
  `subagent fn` body is always a subagent session, so the prompt-mode arms
  cannot arise there.

### 3. Value semantics

- **Type:** `string`, checked by the existing checker rules; a type mismatch
  is the ordinary type diagnostic (no new code). *Implementation anchors
  (non-normative):* `checkInvokeArgTypes` (`src/parser/invoke-diagnostics.ts`),
  `checkInvokeStaticResolution` (`src/extension/invoke-static-checks.ts`).
- **Empty string:** the runtime MUST surface
  `Err(InvokeInfraError { cause: "validation", … })`. An empty cwd is always
  an authoring bug; the runtime MUST NOT silently inherit the parent cwd.
- **Relative paths** resolve against **the current process's working
  directory** (the parent invocation's effective cwd). This composes across
  nesting: a child that itself dispatches `with { cwd: "sub" }` resolves
  against its own spawn cwd. Absolute paths pass through. The parent MUST
  normalize with `path.resolve` before spawn, and Windows separator spelling
  MUST be normalized parent-side — the
  [bug 0467](../bugs/0467-callable-closure-hash-path-spelling-order-flip.md)
  class of path-spelling divergence.
- **Existence is NOT pre-checked by theta.** A nonexistent or invalid cwd
  surfaces as the spawn failure it causes (ENOENT), which already maps to
  `theta/runtime/subagent-spawn-failed` plus the runtime-defect surface (the
  [PIC-65](../spec_topics/pi-integration-contract/subagent.md#pic-65)
  spawn-failure arm; registry row in
  [`code-registry-runtime.md`](../spec_topics/diagnostics/code-registry-runtime.md)).
  **Zero new runtime diagnostic codes.** Why: the runtime registry is closed
  ([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)); a
  pre-check would race the filesystem between check and spawn while
  re-deriving a verdict the OS renders authoritatively at spawn; and the
  spawn-failed row already carries the underlying OS error in `message` (and
  the attempted executable in `hint`). Acceptance tests pin that a bad cwd
  yields a diagnosable failure naming the offending path; if the raw OS error
  proves not to name the cwd, the launcher enriches the error message
  parent-side before mapping — content of the `<error.message>` slot, not a
  template change, so DIAG-4's pinned message templates hold.

The `InvokeInfraError` `cause` enum is untouched: both new failure arms ride
the existing `"validation"` member
([Errors and Results — Invoke variants](../spec_topics/errors-and-results/queryerror-variants.md#invoke-variants)).
No schema change.

### 4. What `cwd` does NOT change — the identity/location principle

The clause relocates the callee's **side effects**, never its **identity**.
Explicitly unchanged, each with its existing pin:

| Unchanged surface | Pin |
| --- | --- |
| Theta discovery roots passed to the child (`--theta <parent-resolved roots>`) | [Subagent — launch contract](../spec_topics/pi-integration-contract/subagent.md#subagent-launch-contract) (observed launch argv) |
| Callee resolution + callable-closure hash verification | `hashCallableClosure` (`src/runtime/subagent-callable-hash.ts`), `verifyChildCallableHashes` (`src/runtime/subagent-child-hash-verify.ts`), [Subagent — callable content-hash verification](../spec_topics/pi-integration-contract/subagent.md#subagent-theta-callable-hash) — **cwd is not a digest input**: `ClosureSource` is `{ path, content }`, `path` is a sort key contributing zero bytes, and no launch-request field feeds the digest |
| Extension identity pin (`PI_THETA_SUBAGENT_EXTENSION_PIN`) | [`AGENTS.md#subagent-child-pins`](../../AGENTS.md#subagent-child-pins); [Subagent — extension pin](../spec_topics/pi-integration-contract/subagent.md#subagent-extension-pin) |
| Params carriage | [PIC-60](../spec_topics/pi-integration-contract/subagent.md#pic-60) env/temp-file channel |
| `--tools` allowlist and the ambient-isolation / trust flag groups | [Subagent — launch contract](../spec_topics/pi-integration-contract/subagent.md#subagent-launch-contract), [Isolation and trust](../spec_topics/pi-integration-contract/subagent.md#subagent-isolation-and-trust) |
| Cancellation / teardown (tree-kill on Windows) | [PIC-66](../spec_topics/pi-integration-contract/subagent.md#pic-66) / [PIC-65](../spec_topics/pi-integration-contract/subagent.md#pic-65) |
| Return envelope wire | [PIC-59](../spec_topics/pi-integration-contract/subagent.md#pic-59) |
| Env carriage (full parent env + control-plane vars) | [Subagent — launch contract](../spec_topics/pi-integration-contract/subagent.md#subagent-launch-contract), [control-plane authentication](../spec_topics/pi-integration-contract/subagent.md#subagent-control-plane-authentication) |

Two consequences the spec text spells out:

1. **The child runs the parent tree's worker code.** With `--theta` roots
   still parent-resolved, a worktree-cwd'd `/fix-cluster` executes the *main*
   tree's `.pi/theta/workers/fix-cluster.theta` while its file tools and bash
   operate in the worktree. For the worktree pattern this is the desired
   behaviour (single source of orchestration code, even when the worktree
   holds an older commit) — and it means callee identity cannot be swapped by
   pointing `cwd` at a hostile directory.
2. **Trust does not follow cwd.** The child keeps `--no-approve` +
   `--no-context-files`: it does not adopt the target directory's `.pi`
   extensions, skills, or AGENTS.md. Residual host-dependent hazard to
   document: Oh-My-Pi loads `<cwd>/.env` into the child environment before
   any provider lookup
   ([Subagent — control-plane authentication](../spec_topics/pi-integration-contract/subagent.md#subagent-control-plane-authentication)) —
   a cwd override changes which `.env` that is. v1 pins this as a documented
   operator responsibility in the launch contract's env paragraph
   (host-prerequisites presupposition style), not as theta-side mitigation
   (Resolved questions, item 5).

### 5. Runtime plumbing

Single-threaded change: the call-site clause lowers into the launch request
the producer already builds — `cwd: resolvedCwd ?? ctx.cwd` at the
`spawnSubagentConversation` bind site
(`src/extension/production-theta-producer.ts`) — and flows through the
existing `SubagentLaunchRequest.cwd` →
`deps.spawn(execPath, argv, { cwd: request.cwd, env })` path in
`launchSubagentChild` (`src/runtime/subagent-launcher.ts`) untouched. The
launcher API does not change shape (`SubagentLaunchRequest` already carries
`cwd: string`). Prompt-mode dispatch and the binder path never see the field.

## Alternatives considered

- **Route A: bash-spawned `pi -p` in the worktree.** Works today, no extension
  change; rejected as the *primary* mechanism for the reasons in Motivation
  (envelope loss, argv-contract duplication, exit-code blindness, trust-flag
  traps). It remains the documented fallback if 0009 stalls.
- **Reserved param convention** (callee declares `cwd: string`, runtime
  intercepts): magical, breaks "params are the callee's data" and the
  binder-visible schema; rejected.
- **Frontmatter `cwd:` on the callee:** cwd is a property of the *call site*
  (per iteration), not of the theta; rejected.
- **Settings-level default** (`theta.subagentCwd`): not per-call; rejected.
- **Widening declaration-site `with` instead of a call-site clause:** cannot
  express per-iteration values; rejected for v1 (see Proposal §1).

## Resolved questions

1. **Clause keyword.** *Decision:* reuse `with`. RFC-0001 continuity: `with`
   is already the session-config clause keyword, the contextual-keyword
   machinery exists, and the call-site clause is the reserved per-call options
   surface — a second keyword (`at`, `in`) would split one options surface
   across two spellings. Declaration vs call clause is carried by syntactic
   position, exactly how the grammar already disambiguates contextual
   keywords.
2. **Surfaces in v1.** *Decision:* both `.theta`-callable calls and
   `invoke(...)` (plus `subagent fn` call sites). Same lowering into the one
   launch-request bind site, and `invoke` is the dynamic-path escape hatch the
   worktree pattern needs.
3. **`par for` per-element ergonomics.** *Decision:* defer. Row-splitting in
   the loop body is acceptable for v1; an indexed `par for` form is a separate
   proposal if evidence accumulates. Not 0009's surface.
4. **Declaration-site `with { cwd }` for `subagent fn`.** *Decision:* excluded
   in v1. A static cwd on a declaration has no worktree use case — the value
   is per-iteration by construction. Revisit only with evidence. The
   declaration-site key set is unchanged.
5. **`<cwd>/.env` on Oh-My-Pi.** *Decision:* document-only in v1. The launch
   contract's env paragraph gains an operator-responsibility note: a cwd
   override changes which `<cwd>/.env` that host loads into the child
   environment. No theta-side mitigation or host-flag suppression; the
   control-plane authentication rule already bounds what such a file can
   inject into the `PI_THETA_*` plane.
6. **Unknown-key severity — call-site vs declaration-site (surfaced by Phase 1
   scouting).** The shipped declaration-site clause treats an unknown key as a
   **warning**, reusing the forward-compat frontmatter code
   `theta/load/unknown-frontmatter-field` (the `WITH_CLAUSE_KEYS` check in
   `parseWithClause`, `src/parser/theta-document.ts`), while this RFC makes a
   call-site unknown key a **parse error**. *Decision:* keep the error posture
   for the new call-site clause (`theta/parse/with-clause-unknown-key`,
   severity E). The call-site clause is a new fail-closed surface with no
   deployed corpus and therefore no forward-compat debt — an unknown key there
   is an authoring error, and a warning posture would leave silent-drift room
   exactly where a mis-spelled `cwd` key silently inherits the parent cwd.
   The two clauses **deliberately differ**: the declaration-site clause keeps
   its shipped warning posture (its keys mirror frontmatter fields, whose
   unknown-key handling is forward-compat by design); the call-site clause's
   keys are per-call runtime options, closed by this RFC. The registry rows
   and the amended spec text state the divergence explicitly.

## New diagnostics

Three new `theta/parse/*` codes, drafted in the registry's column format
([`code-registry-parse.md`](../spec_topics/diagnostics/code-registry-parse.md);
nearest naming precedent `theta/parse/invoke-non-theta-extension`). Exact
Phase cells and Message templates become normative when the rows land in the
registry (DIAG-4); these are drafts.

| Code | Sev | Phase | Trigger | Spec rule | Hint | Message |
|---|---|---|---|---|---|---|
| `theta/parse/with-clause-unknown-key` | E | parse | A call-site `with` clause field key outside the closed set (`cwd`), on any clause-bearing call surface (`.theta`-callable call, `invoke(...)`, `subagent fn` call). Declaration-site `subagent fn … with { … }` keys are not judged by this row — they keep the `theta/load/unknown-frontmatter-field` warning (Resolved questions, item 6). | [Invocation — Options surface](../spec_topics/invocation.md) | theta 1.x call-site options admit `cwd` only. | `unknown key '<key>' in call-site with clause` |
| `theta/parse/with-clause-prompt-mode-callee` | E | parse | A call-site `with` clause on a statically resolvable callee ([Invocation — Static resolution](../spec_topics/invocation.md#static-resolution)) whose `mode:` is `prompt`. A callee that is not statically resolvable defers to the runtime `Err(InvokeInfraError { cause: "validation", … })` arm; no parse code fires. | [Invocation — Options surface](../spec_topics/invocation.md) | `cwd` addresses the spawned child process; a prompt-mode callee runs in the caller's conversation. Make the callee subagent-mode or remove the clause. | `with clause requires a subagent-mode callee; '<callee>' is prompt-mode` |
| `theta/parse/with-clause-pi-tool` | E | parse | A call-site `with` clause on a Pi-tool call. A Pi tool executes in-process against the parent session; no child working directory exists. | [Tool Calls — Argument shape](../spec_topics/tool-calls.md) | Remove the clause; per-call options apply to `.theta`-callable and `invoke(...)` dispatch only. | `with clause is not applicable to Pi tool '<name>'` |

Not minted: a type mismatch on the `cwd` value reuses the ordinary
type-diagnostic path; the two runtime failure arms (empty string, runtime
prompt-mode callee) reuse `InvokeInfraError { cause: "validation" }`; a bad
cwd at spawn reuses `theta/runtime/subagent-spawn-failed`. Runtime registry:
**zero new codes**
([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)).

## Specification impact

One row per touched normative surface (anchors verified against today's tree
by the Phase 1 inventory):

| Surface | Anchor | Change |
|---|---|---|
| `docs/spec_topics/grammar.md` | [`#fn-declarations`](../spec_topics/grammar.md#fn-declarations) neighbourhood; new call-site clause production | **New** `CallWithClause` production (no call-expression production exists to widen; the existing `WithClause` stays declaration-site-only). Contextual-keywords paragraph gains the second `with` recognition position. |
| `docs/spec_topics/invocation.md` | [`#static-resolution`](../spec_topics/invocation.md#static-resolution); a new Options-surface anchor (none exists today — `surface-extensions.md` forward-links the page bare) | Options surface becomes normative for `cwd`: value semantics (type, empty-string arm, relative-resolution rule, no existence pre-check), mode-gate failure arms, evaluation order. |
| `docs/spec_topics/tool-calls.md` | Argument shape paragraph (evaluation-order rule) | `.theta`-callable call shape gains the clause; Pi-tool rejection rule (`theta/parse/with-clause-pi-tool`). |
| `docs/spec_topics/pi-integration-contract/subagent.md` | [`#subagent-launch-contract`](../spec_topics/pi-integration-contract/subagent.md#subagent-launch-contract) — the launch-contract table row "forwarded `ctx.cwd` → child working directory" and the lede sentence; [`#subagent-control-plane-authentication`](../spec_topics/pi-integration-contract/subagent.md#subagent-control-plane-authentication) | cwd row becomes "per-call resolved cwd, default forwarded `ctx.cwd`"; lede updated to match; env paragraph gains the `<cwd>/.env` operator-responsibility note (Resolved questions, item 5). |
| `docs/spec_topics/future-considerations/surface-extensions.md` | [`#surface-extensions-v1-leaves-a-seam`](../spec_topics/future-considerations/surface-extensions.md#surface-extensions-v1-leaves-a-seam), the per-call-timeouts bullet's "Anchored at" list | Options-surface seam marked partially consumed (`cwd` on the tool-call/invoke surfaces). [GOV-31](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-31) arithmetic: the seam enumeration neither gains nor loses an item, so the seam-count aggregator literal on spec.md (`overview-and-orientation.md`, Scope) is **unchanged**; if the amendment does add or remove an enumerated item, the literal moves in the same edit per GOV-31's lock-step MUST. |
| `docs/spec_topics/diagnostics/code-registry-parse.md` | `theta/parse/*` table | Three new rows (§New diagnostics). |
| `docs/reference/grammar.md` | "fn declarations"; "Expression sublanguage" | Mirror the new production and its postfix attachment. |
| `docs/reference/errors-and-results.md` | "InvokeInfraError" (under "QueryError variants") | Prose for the `cause: "validation"` arm enumerates the empty-string and runtime prompt-mode-callee cases; no schema change. |
| `docs/reference/coverage-matrix.md` | "Reference coverage" table | Update the Spec-sources / Surface cells of the affected reference-page rows. This matrix is **doc-set-keyed** (page-keyed), not code-keyed — the inventory corrected the design here. |
| `docs/plan_topics/coverage-matrix.md` | "Code-keyed obligation areas (no numbered REQ-IDs)" | New `cka-<n>` row (next free token) naming the three parse codes, the mode gate, and the launch threading, with its closing leaf — mirroring cka-38's several-codes-one-row pattern. |
| `docs/rfcs/0001-subagent-fn.md` | — | "Extended by RFC 0009" cross-note: the call-site clause is a distinct surface; declaration-site semantics unchanged. Not a rewrite. |
| `docs/how-to/fan-out-into-git-worktrees.md` | new page | Worked example of the worktree fan-out pattern (§Payoff validation). |

## Testing strategy

Offline (default gate, provider-free):

- **Parser:** accept/reject matrix as inline template-literal sources through
  `parseThetaDocument` (the `tests/subagent-fn.test.ts` convention — parser
  unit tests embed source inline; no fixture directories). Coverage: each new
  code, all clause-bearing call surfaces, expression values including
  interpolations, clause-before-`?` ordering, and `with` staying an ordinary
  identifier outside its two recognition positions.
- **Committed-fixture gate:** any new committed `.theta` fixture joins
  `tests/committed-fixture-parse-gate.test.ts`; its pinned corpus-count
  constants (`EXPECTED_SHIPPED_THETA` / `EXPECTED_SHIPPED_THETALIB`) move in
  the same change, or the gate reds loudly.
- **Checker:** `cwd` value typing (`string`), joining `checkInvokeArgTypes`
  (`src/parser/invoke-diagnostics.ts`) / `checkInvokeStaticResolution`
  (`src/extension/invoke-static-checks.ts`).
- **Launch threading** (spawn-double, the fake-launcher pattern of
  `tests/subagent-child-launch.test.ts`): `request.cwd` for (a) absent clause
  → `ctx.cwd` — the existing "ctx.cwd as the child cwd" test stays green
  unmodified; (b) absolute value passes through; (c) relative value resolves
  against the parent's effective cwd; (d) Windows separator spellings
  normalize parent-side.
- **Failure arms:** empty string → `Err(InvokeInfraError { cause:
  "validation" })`; runtime prompt-mode callee (not statically resolvable) →
  same arm; spawn-ENOENT → existing `theta/runtime/subagent-spawn-failed`
  with the offending path diagnosable in the message.
- **Hash stability:** callable-closure digest identical with and without the
  clause. `hashCallableClosure` (`src/runtime/subagent-callable-hash.ts`)
  digests only `ClosureSource.content` — `path` is a sort key contributing
  zero bytes, and no launch-request field is a digest input — so the clause
  cannot perturb the digest; the test pins that.

Live (`npm run test:live` — this RFC touches a live-exercised surface, so the
run is mandatory per `AGENTS.md`, not optional):

- **H8a:** a subagent-mode callee whose body writes a marker file at a
  relative path; dispatch with `cwd` = fresh temp directory; assert the marker
  lands in the temp directory AND the typed return value round-trips. The
  harness carries the child pins
  ([`AGENTS.md#subagent-child-pins`](../../AGENTS.md#subagent-child-pins):
  `argv[1]` → the real `cli.js`, `PI_THETA_SUBAGENT_EXTENSION_PIN` → this
  tree's `extensions/`, parent-pid carriage) — copy the
  `tests/live/harness.ts` module-scope block. Closest existing template: the
  bug-0067 typed-invoke cell in
  `tests/live/live-production-acceptance.test.ts` (`invoke<Sev>` against a
  subagent callee with deterministic observation); no existing live test
  combines a real filesystem side effect with a typed return round-trip, so
  this is a new cell composed from that template plus the pin block.
- **Negative proof** (verify both directions): once, locally disable the
  clause threading, confirm the marker lands in the parent cwd and the test
  reds with the expected signature; restore and confirm green.
- **H9a acceptance:** optional in v1 — the H8a observable is filesystem-real
  already.

## Compatibility and versioning

- Purely additive language surface: absent clause ⇒ byte-identical behaviour.
- Older extension versions reject the new syntax as a parse error — the
  correct fail-closed posture for a language addition; the CHANGELOG entry
  names the minimum version.
- theta's own bump: `package.json` version + a `CHANGELOG.md` section, per the
  repo's observed middle-digit convention (every release — feature or fix —
  is a `0.N.0` middle-digit bump; no third-digit patch releases appear in the
  shipped CHANGELOG).
- The version-bump gates (`tests/version-bump-gates.test.ts`,
  `tests/version-bump-acceptance.test.ts` and their
  `src/extension/version-bump-*` operands) govern the **Pi-SDK
  peer-dependency pin**, not theta's own package version. This RFC does not
  move the SDK pin, so those gates are unaffected.
- Version literals in amended spec prose follow
  [GOV-19](../spec_topics/governance/release-version-naming.md): the clause
  is a theta 1.x design-scope addition.

## Payoff validation

Summary of the design's target (the full `/quality-loop` rework is plan
Phase 8, not this RFC): provision git worktrees **outside** the repo root
(sibling directory), one per fix cluster, pruning stale trees at wave start;
fan out `fix_cluster(man, guidance) with { cwd: tree }` under
`par for … max parallel`, with retry, in-tree gate, and in-tree review inside
a worktree-resident wrapper worker that commits once per green tree on its own
branch; integrate sequentially in the orchestrator (cherry-pick green
branches, one batch integration gate, revert last-to-first on red); cap
per-tree test workers so trees × workers ≤ cores; store writes stay
orchestrator-only in the main tree. A green run of that loop — parallel
fixers in disjoint worktrees, integrated result — is this RFC's payoff
observable; the worked example ships as
`docs/how-to/fan-out-into-git-worktrees.md`.

## Prior art in this repository

- RFC-0001 — the declaration-site `with` clause and the contextual-keyword
  machinery this clause reuses
  ([Grammar — `fn` declarations](../spec_topics/grammar.md#fn-declarations)).
- RFC-0003 — `par for`, the fan-out consumer of per-call cwd.
- RFC-0005 / RFC-0006 — the child-process session/execution architecture whose
  launch contract carries the `cwd` field.
- RFC-0007 — the `pi -p` exit-0-on-failure hazard that disqualifies the
  bash-spawned workaround.
- The Options-surface seam —
  [Future Considerations — Surface extensions](../spec_topics/future-considerations/surface-extensions.md#surface-extensions-v1-leaves-a-seam);
  this RFC consumes its first key.
- Bug 0467 — the path-spelling discipline behind parent-side normalization
  ([`0467-callable-closure-hash-path-spelling-order-flip.md`](../bugs/0467-callable-closure-hash-path-spelling-order-flip.md)).
