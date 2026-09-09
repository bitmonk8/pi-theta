# V21a-T — call-site `with { cwd }` clause: red tests

Paired tests-task leaf for [`V21a`](./V21a-call-with-clause.md), minted by
[RFC 0009](../rfcs/0009-per-call-subagent-cwd.md) (per-call subagent cwd,
theta 1.3). The obligation set is the RFC's spec surface —
[`invocation.md`](../spec_topics/invocation.md) `#options-surface` /
INV-6 / INV-7 / INV-8, [`tool-calls.md`](../spec_topics/tool-calls.md) TOOL-1,
[`grammar.md`](../spec_topics/grammar.md) `#call-site-with-clause`, and the
four `theta/parse/with-clause-*` registry rows.

Test files: `tests/call-with-clause-parse.test.ts`,
`tests/call-with-clause-static-checks.test.ts`,
`tests/call-with-clause-threading.test.ts`,
`tests/call-with-clause-failure-arms.test.ts`,
`tests/call-with-clause-hash-stability.test.ts` (shared harness:
`tests/helpers/call-with-clause-harness.ts`).

The retained REQ-ID → closing-leaf mapping lives in
[`coverage-matrix.md`](./coverage-matrix.md); this file is also what makes the
leaf ID resolvable in the release-gate leaf-ID universe, which
`tools/closing-gate/live-corpus.js` derives from `docs/plan_topics/`
filenames.
