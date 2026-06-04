# Future Considerations

Features deliberately deferred from loom 1.0, organised by the kind of decision loom 1.0 must make about each. The buckets answer two questions: which loom 1.0 surfaces must leave a forward-compatible seam, and which items are post-loom 1.0 work that loom 1.0 is *not* expected to anticipate.

The categories are:

1. **Tooling deferrals (no loom 1.0 impact).** Items that ship as new tools or commands and require no loom 1.0 runtime decision.
2. **Surface extensions (loom 1.0 leaves a seam).** Items that extend a loom 1.0 type, struct, or call shape in a backward-compatible way. Each item names the loom 1.0 seam it needs.
3. **Model-level changes (no loom 1.0 seam expected).** Items that change the runtime value model, evaluation model, or tool-result contract enough that loom 1.0 is not expected to anticipate them; adding them post-loom 1.0 will require a migration.
4. **loom 1.0 non-goals.** Cross-cutting loom 1.0 scope decisions where loom 1.0 deliberately leaves no seam because the disposition is "ship without one" rather than "defer the seam". Each item names the [normative owner](./governance/req-id-prefix-table-active-b.md#gov-12) — always a topic page per GOV-12 — that records the loom 1.0 disposition, alongside any `spec.md` orientation cross-link. (loom 1.0 dispositions that *do* reserve a forward-compatibility seam are deferred loom 1.0 surface extensions, not non-goals — see category 2 above. The contrast with category 3 is along a different axis: category 3 covers model-level changes that would alter what loom 1.0 means by its runtime value, evaluation, or tool-result contracts, whereas category 4 items are cross-cutting "we chose not to deliver this" scope dispositions that do not change those value-model contracts.)

Items occasionally carry a `Depends on:` annotation where they presuppose another item in the list.

loom 1.0 design choices that ship with a known behavioural or diagnostic gap — i.e. constraints on the loom 1.0 runtime itself rather than features deferred from it — are recorded on the topic page that owns the surrounding contract, not here. See for example [Pi Integration Contract — Provider compatibility for typed queries](./pi-integration-contract.md) for the typed-query diagnostic limitation on supported providers.

---

<a id="tooling-deferrals-no-loom-1-0-impact"></a><a id="tooling-deferrals-no-v1-impact"></a>

## Contents

- [Surface extensions](./future-considerations/surface-extensions.md)
- [Model changes and non goals](./future-considerations/model-changes-and-non-goals.md)
