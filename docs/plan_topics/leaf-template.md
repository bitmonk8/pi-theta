# Leaf template

Copy this file when authoring a new leaf. Replace the `<…>` placeholders, delete the inline notes, and save under `plan_topics/<id>-<short-name>.md`.

The leaf ID convention is `<group><letter>` where `<group>` is one of `H1`–`Hn` (horizontal), `M` (MVP), or `V1`–`Vn` (vertical slice) and `<letter>` is `a`, `b`, `c`, … for the leaves within that group. Group IDs are editorial; leaves are the unit of work. See [`conventions.md`](./conventions.md) for the phase categories, the TDD ritual, and the cross-cutting rules every leaf inherits.

MVP and vertical features are authored as **two paired leaves** (TDD as two separate tasks per [`conventions.md`](./conventions.md)): a **tests task** with ID `<id>-T` and an **implementation task** with ID `<id>`. Copy this template once per leaf in the pair. The tests task's **Ships when** is the red-state condition ("the tests below exist, compile, and fail for the intended reason"); the implementation task's **Ships when** is the externally observable change, and it lists `<id>-T` in **Deps.** Horizontal leaves are single (no `-T` pair).

---

# `<id>` — `<short title>`

**Spec.** `<page-1.md>`, `<page-2.md>` — the `spec_topics/*.md` files this leaf implements. An implementer MAY restrict their reading to these pages. The field MUST be closed under normative cross-link: if a listed page cites a normative rule on another page, that other page is also listed — unless the cross-link is *narrative*, i.e. its target page's row in the prefix table carries the byte-exact `(no IDs — narrative)` cell per [`governance.md` GOV-3](../spec_topics/governance.md); a narrative target does not trigger the closure obligation. _(Use **Convention.** instead of **Spec.** for infrastructure leaves that operationalise [`conventions.md`](./conventions.md) rather than a spec page; cite the section by anchor.)_

**Adds.** _One sentence describing what the leaf introduces — the new module, the new parser surface, the new diagnostic, etc. `Adds.` is descriptive by default; a named mechanism binds only if it carries a cited REQ-ID or is a cross-leaf seam that some other leaf binds against (a leaf listing this leaf in its **Deps.** names the seam in its own **Adds.** or **Tests.**) — see [`conventions.md`](./conventions.md) *Leaf format*._

**Tests.**
- `<REQ-ID>`: _what the test asserts, in one line._
- `<REQ-ID>`: _…_

_(One bullet per REQ-ID this leaf claims to close. A leaf MAY close part of a REQ-ID; the coverage matrix is many-to-many. Where a leaf adds infrastructure with no spec REQ-ID, replace the REQ-ID prefix with `Convention:` and cite the [`conventions.md`](./conventions.md) section.)_

**Deps.** `<leaf-id>`, `<leaf-id>`, … _or_ `-` if none.

_(Cite specific leaf IDs (`V4b`, `V9a–V9e`); never a bare group token (`V4`). Use ranges where contiguous, comma-separated lists where not.)_

**Ships when.** _For an implementation task or a horizontal leaf: a concrete, externally observable change — e.g. "`npm test` includes a passing assertion that …", "running `pi /<name> …` in a real Pi session produces …", "`<file>` exists with `<header>` and the architectural test for it passes". For a tests task (`<id>-T`): "the tests above exist, compile, and fail red for the intended reason" — *fail red for the intended reason* is defined in [`conventions.md`](./conventions.md) §Per-phase TDD ritual._
