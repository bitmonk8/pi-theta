# V24a — session-control tools (`compact`, `context_usage`, `session_name`): implementation

Implementation leaf for [RFC 0011](../rfcs/0011-session-control-tools.md)
(session-control runtime tools, theta 1.5), paired with
[`V24a-T`](./V24a-T-session-control-tests.md).

Closes the RFC's spec surface: the third `ResolvedCallable` kind and its
resolution order ahead of `resolvePiTool`
([`frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md)
§`tools`); the fixed-signature arity/type checks and the `try`-arm /
bare-call structural return-type flow
([`tool-calls.md`](../spec_topics/tool-calls.md)
`#session-control-runtime-tools` + the runtime-tool return-type row); the
`par for`-body rejection at the shadowing-aware lexical call-site walk and
its runtime backstop at the `par for` iteration host wrapper; the
`#classifyCall` third verdict and the direct-`execute` dispatch against the
retained composition-scope host handles
([`host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md)
consumed `ctx.compact` / `ctx.getContextUsage` / `pi.setSessionName` /
`pi.getSessionName`); the load-time host-member probe
(`theta/load/session-tool-unavailable`); the model-facing exclusions from
`thetaCallableSetNames` / `callableSetPiToolNames` / `inferChildTrust`; and
the admission inside a `subagent fn` body against its own child session
([`functions.md`](../spec_topics/functions.md) FN-6).

Modules: `src/parser/runtime-tools.ts`, `src/parser/callable-set.ts`,
`src/parser/theta-document.ts`, `src/parser/static-type-inference.ts`,
`src/parser/type-layer-checks.ts`, `src/extension/invoke-static-checks.ts`,
`src/runtime/tool-call.ts`, `src/runtime/session-control-tools.ts`,
`src/extension/production-theta-producer.ts`,
`src/extension/production-composition.ts`, `src/runtime/statement-executor.ts`,
`src/extension/sdk-inventory.ts`.

The retained REQ-ID → closing-leaf mapping lives in
[`coverage-matrix.md`](./coverage-matrix.md); this file is also what makes the
leaf ID resolvable in the release-gate leaf-ID universe, which
`tools/closing-gate/live-corpus.js` derives from `docs/plan_topics/`
filenames.
