# Coverage matrix (fixture — H5d transitive-completeness, seeded violation)

Identical to the `transitive-no-violation` fixture except FOO-1's closing-leaf
cell names `V7z`, a leaf absent from the seeded `h5b-deps.md` `Deps.` membership.
That single cell reddens the transitive-completeness arm; the FOO-1 row stays
mapped and cited, so no other gate arm fires for this scenario.

## Numbered REQ-IDs (runtime obligations)

| REQ-ID | Closing leaf(s) |
|---|---|
| FOO-1 | `V7z` |
| FOO-2 | `V2c`, `H7a` (co-witness — cross-site integration witness) |
| BAR-1 | `V3b` (collision-detection closure), `V9m` (superseded-entry-dispatch closure) |

## Code-keyed obligation areas (no numbered REQ-IDs)

| Token | Spec area (prefix) | Closing leaf(s) |
|---|---|---|
| `cka-1` | `foo.md` (FOO) | `V8d` |
| `cka-2` | `bar.md` (BAR) — retired as a code-keyed-area row: obligations now numbered above | *(numbered above)* |
| `cka-3` | `baz.md` (BAZ) — obligation currently uncovered | <new> |
