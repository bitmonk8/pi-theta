# Reference — doc-set coverage matrix

Tracks which Reference page covers which normative surface, and what is deferred.
"Done" is observable: a surface is covered when a Reference page owns it with a
Provenance pointer to its spec source. Per `docs/documentation-plan.md` §6.

## Doc-set status (all five Diátaxis artifacts)

Draft status across the full set per `docs/documentation-plan.md` §3/§6. All
artifacts are first-pass drafts for editor review; none published.

| Artifact | Path(s) | Mode | Status | Runtime-validation posture |
|---|---|---|---|---|
| README | `README.md` | landing | drafted | thin; overwrote prior progress tracker (editor-authorised); no examples |
| Guide | `docs/guide.md` | explanation | drafted | no runnable examples (spec-sourced illustrative fragments only) |
| Tutorial | `docs/tutorial.md` | tutorial | drafted | 5/5 steps runtime-validated (live); subagent final values not observable on `pi -p` stdout by design (private transcript) |
| How-to (7) | `docs/how-to/*.md` | how-to | drafted | backed by 9 `docs/examples/`; parse all-pass; all 8 invocable examples run to success live |
| Reference (8+matrix) | `docs/reference/*.md` | reference | drafted | mechanical tables verbatim; no divergences found |

All 8 invocable `docs/examples/*.loom` run to a success terminal outcome live
(provider `unity-messages`/`claude-haiku-4-5`); parse gate 22/22 green. During
drafting, live validation exposed four production defects, since fixed:

- **H8a** — the shipped subagent driver fired an unconditional mid-stream cancel,
  so every subagent `@`-query returned `Err(cancelled)`. Fixed: V9i completion
  driver wired; cancellation is now a genuine signal.
- **V13e** — typed `@<Schema>` queries returned `Ok(null)` instead of validating.
  Fixed: schema validation wired into all three typed paths (QRY-22).
- **H8b** — code-side tool calls and `.loom`-callable `invoke` were inert stubs.
  Fixed: live resolvers built and composed.
- **core-exec-eval** — the body executor did not evaluate `?`/`match`/member
  access/index/object literals. Fixed: parser productions + executor dispatch;
  binder-bound `params:` now reach body scope; tool-arg object literals lower.

Validation hygiene: ambient `pi --loom` discovery may load a STALE global git
extension (`~/.pi/agent/git/.../pi-loom`) behind the working tree. Validate the
working-tree build explicitly (`pi -ne -e ./extensions --loom docs/examples ...`).
Subagent-mode final values are not observable on `pi -p` stdout (private
transcript discarded on return) — this is by design, not a defect.

## Reference coverage

| Reference page | Surface covered | Spec sources | Status |
|---|---|---|---|
| [grammar.md](./grammar.md) | Lexical structure; grammar productions (literal sublanguage, `let`, blocks, `fn`, `match` arm body, `schema X by <field>`, `///`, type grammar, newline continuation, `array<T>` type-sink); expression forms; operator precedence; built-in methods; control flow; `return`; bindings & mutability | `grammar.md`, `lexical.md`, `expressions.md`, `control-flow.md`, `functions.md`, `return.md`, `bindings.md` | complete |
| [type-system.md](./type-system.md) | Type expressions; compatibility relation `⊑` (TYPE-1…TYPE-11); array/ternary common-type; runtime value model; equality; wire-name translation; engine assumptions; effects | `type-system.md`, `runtime-value-model.md`, `expressions.md` | complete |
| [frontmatter.md](./frontmatter.md) | Frontmatter field contract table (verbatim); naming convention; `params:` types/defaults; `tools:` (callable set, FRNT-2/3, resolution snapshot); `system:` interpolation; `respond_repair:`; `tool_loop:` (FRNT-1); template interpolation | `frontmatter.md`, `frontmatter/frontmatter-fields-a.md`, `frontmatter/frontmatter-fields-b-and-templates.md` | complete |
| [schema-subset.md](./schema-subset.md) | JSON-Schema subset; schema/enum/union declarations; wire-name renaming; discriminated unions; recursion; depth enforcement; lowering algorithm (SUBS-1); canonical schema hash (SUBS-2, synthesised names, slug-collision posture) | `schema-subset.md`, `schemas.md` | complete |
| [diagnostics.md](./diagnostics.md) | Full closed code registry (`loom/parse/*`, `loom/load/*`, `loom/runtime/*`, `loom/host/*`) — Code/Sev/Phase/Message verbatim; diagnostic shape; DIAG-1…DIAG-4; `masked` field | `diagnostics.md`, `diagnostics/diagnostic-shape.md`, `diagnostics/code-registry-{parse,load,runtime,host}.md` | complete |
| [errors-and-results.md](./errors-and-results.md) | Terminal outcomes; pre-evaluation failure surface (ERR-1…ERR-7, ERR-16); no-rollback (ERR-8…ERR-13); runtime panics + message templates; `QueryError` variant schemas (ERR-14, ERR-15, ERR-17, ERR-19); final value (FN-5) | `errors-and-results.md`, `errors-and-results/error-model.md`, `errors-and-results/queryerror-variants.md`, `functions.md`, `query/*` | complete |
| [hard-ceilings.md](./hard-ceilings.md) | Four ceilings; routing classes; INV-4; HC3-a…HC3-e; ceiling #4 per-boundary table; CIO-1…CIO-6; ceiling-set invariants; `masked`; NOCEIL-1…NOCEIL-4 | `hard-ceilings.md`, `hard-ceilings/ceilings-3-and-4.md`, `hard-ceilings/ceiling-invariants-and-audit.md`, `invocation.md`, `schema-subset.md` | complete |
| [discovery-cli.md](./discovery-cli.md) | Five discovery sources; priority; failure modes (DISC-2); filename validity; collisions (DISC-1, DISC-3, DISC-4); discovery roots; package discovery (DISC-5, DISC-6); settings (DISC-7, keys, `loomPaths` schema); slash invocation (SLSH-1…SLSH-5, SNK-a…SNK-k); `invoke` (resolution, typed return, arity, cross-mode, cycle detection, static resolution, INV-1) | `discovery.md`, `discovery/discovery-sources.md`, `discovery/package-and-settings.md`, `invocation.md`, `slash-invocation.md` | complete |

## Deferred / not yet covered by the Reference cluster

Surfaces present in the spec but **not** owned by any Reference page above.
Candidates for future Reference pages or explicitly out of scope:

- **Slash-command argument binding (binder internals)** — bind model resolution,
  binder bypass conditions, `bind_context`, echo policy, envelope
  (`ok`/`needs_info`/`ambiguous`), retry taxonomy, failure-mode templates,
  system-note rendering, determinism/cancellation. Spec: `binder.md`,
  `binder/*`. Referenced in passing from frontmatter.md / discovery-cli.md; not
  owned. **Deferred** (candidate: `reference/binder.md`).
- **Tool calls** — code-side `<name>(args)` argument shape, Pi-tool vs `.loom`
  callable dispatch, concurrency, return-envelope contract, relationship with
  `invoke`. Spec: `tool-calls.md`. Referenced from frontmatter.md / errors; not
  owned. **Deferred** (candidate: `reference/tool-calls.md`).
- **Query mechanics** — schema-inference algorithm (QRY-1…QRY-7), dedent/newline-trim
  normative vectors, typed-query two-phase loop, forced respond turn template,
  respond-repair follow-up templates, stringification table. Spec: `query.md`,
  `query/*`. Partially reflected in errors/schema pages; not owned. **Deferred**
  (candidate: `reference/query.md`).
- **Imports (`.warp`)** — `import`/`export … from` grammar, resolver failure
  contract (IMP-1), cycle detection, re-export semantics, `.warp` top-level rules.
  Spec: `imports.md`. **Deferred** (candidate: `reference/imports.md`).
- **Cancellation** — `AbortSignal` propagation, granularity/checkpoints, surfacing
  (`CancelledError`), the two-arm `invoke`-parent rule. Spec: `cancellation.md`.
  **Deferred**.
- **Descriptions** — `///` doc-comment joining and field-separator rules, lowering
  to JSON Schema `description:`. Spec: `descriptions.md`. Grammar page covers `///`
  placement only. **Deferred**.
- **Pi Integration Contract (PIC)** — host-integrator cluster (capability probe,
  runtime-event channel, tool-registration lifetime, session-shutdown semantics,
  conversation drive, SDK inventory audit). Spec: `pi-integration-contract.md`,
  `pi-integration-contract/*`. **Out of scope** for the author-facing Reference
  cluster per `documentation-plan.md` §2 (host-integrator material kept separate).
- **Governance / future considerations** — spec-corpus conventions and deferred
  features. **Out of scope** for user Reference.

## Provenance

- Diátaxis boundaries and coverage-matrix requirement:
  `docs/documentation-plan.md` §3, §6.
- Style / provenance obligation: `docs/STYLE.md`.
