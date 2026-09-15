# V24a-T — session-control tools (`compact`, `context_usage`, `session_name`): red tests

Paired tests-task leaf for [`V24a`](./V24a-session-control-tools.md), minted by
[RFC 0011](../rfcs/0011-session-control-tools.md) (session-control runtime
tools, theta 1.5). The obligation set is the RFC's spec surface —
[`frontmatter-fields-a.md`](../spec_topics/frontmatter/frontmatter-fields-a.md)
§`tools` third entry kind, [`tool-calls.md`](../spec_topics/tool-calls.md)
`#session-control-runtime-tools` + the runtime-tool return-type row,
[`host-interfaces-core.md`](../spec_topics/pi-integration-contract/host-interfaces-core.md)
consumed `ctx.compact` / `ctx.getContextUsage` / `pi.setSessionName` /
`pi.getSessionName`, and [`functions.md`](../spec_topics/functions.md) FN-6 —
and the two new registry rows `theta/load/session-tool-unavailable` and
`theta/parse/session-tool-in-isolated-body`.

Test files: `tests/session-control-callable-set.test.ts`,
`tests/session-control-parse.test.ts`,
`tests/session-control-static-checks.test.ts`,
`tests/session-control-adapters.test.ts`,
`tests/session-control-dispatch.test.ts`,
`tests/session-control-sdk-inventory.test.ts`,
`tests/session-control-transcript-readers.test.ts`, and the live file
`tests/live/live-session-control.test.ts`.

The retained REQ-ID → closing-leaf mapping lives in
[`coverage-matrix.md`](./coverage-matrix.md); this file is also what makes the
leaf ID resolvable in the release-gate leaf-ID universe, which
`tools/closing-gate/live-corpus.js` derives from `docs/plan_topics/`
filenames.
