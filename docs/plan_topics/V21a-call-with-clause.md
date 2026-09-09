# V21a — call-site `with { cwd }` clause: implementation

Implementation leaf for [RFC 0009](../rfcs/0009-per-call-subagent-cwd.md)
(per-call subagent cwd, theta 1.3), paired with
[`V21a-T`](./V21a-T-call-with-clause-tests.md).

Closes the RFC's spec surface: the `CallWithClause` / `CallWithField` grammar
and its postfix attachment ([`grammar.md`](../spec_topics/grammar.md)
`#call-site-with-clause`); the options-surface value semantics, no-existence-
pre-check and mode-gating obligations
([`invocation.md`](../spec_topics/invocation.md) INV-6 / INV-7 / INV-8); the
Pi-tool and in-process-callee rejections
([`tool-calls.md`](../spec_topics/tool-calls.md) TOOL-1 and INV-8's
default-reject classification); and the launch-request threading — the resolved
`cwd` replaces the forwarded `ctx.cwd` at the single
`SubagentLaunchRequest.cwd` bind site, with nothing else in the launch assembly
reading it
([`subagent.md`](../spec_topics/pi-integration-contract/subagent.md)
`#subagent-cwd-identity-location`).

The retained REQ-ID → closing-leaf mapping lives in
[`coverage-matrix.md`](./coverage-matrix.md); this file is also what makes the
leaf ID resolvable in the release-gate leaf-ID universe, which
`tools/closing-gate/live-corpus.js` derives from `docs/plan_topics/`
filenames.
