---
id: pending
title: The fileSystem/activeRoots doc block names the runtime containment re-check as their only consumer and their only absence consequence, while each field has a second production consumer
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:538-549
  - src/extension/production-theta-producer.ts:854-860
  - src/extension/production-theta-producer.ts:2586-2596
  - src/extension/production-theta-producer.ts:4382-4390
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The fileSystem/activeRoots doc block names the runtime containment re-check as their only consumer and their only absence consequence, while each field has a second production consumer

## Observation
One doc block on `ProductionProducerInput` covers two adjacent fields,
`fileSystem` and `activeRoots`. It says they are "used by the runtime open-time
containment re-check" and that absence means "the runtime re-check is skipped
(the load-time check remains the primary guard)". Each field has a second
production reader: `fileSystem` also constructs the invoke-hop provenance ledger
in the constructor, and `activeRoots` also supplies the subagent child's
`--theta-dirs` argv. Absence therefore also empties the SLSH-5 provenance chain
and launches the child with no theta directories.

## Evidence
src/extension/production-theta-producer.ts:538-549 — the doc block and the two
fields it covers:

```ts
  /**
   * INV-1 (invocation.md §Resolution): the `FileSystem.realpath` seam and the
   * union of currently-active discovery roots, used by the runtime
   * open-time containment re-check. Absent on non-production harnesses, in which
   * case the runtime re-check is skipped (the load-time check remains the
   * primary guard). Bug 0293: `lstat` is used to distinguish a truly-absent
   * callee (both `realpath` and `lstat` reject ENOENT) from a broken symlink
   * inside a root (`realpath` rejects ENOENT, `lstat` succeeds) — only the
   * former is not-an-escape (invocation.md §Resolution / INV-1).
   */
  readonly fileSystem?: Pick<FileSystem, "realpath" | "lstat">;
  readonly activeRoots?: readonly string[];
```

src/extension/production-theta-producer.ts:854-860 — `fileSystem`'s second
reader, in the constructor:

```ts
  constructor(input: ProductionProducerInput) {
    this.#input = input;
    this.#ledger =
      input.fileSystem !== undefined
        ? createInvocationProvenanceLedger({ fs: input.fileSystem })
        : undefined;
  }
```

src/extension/production-theta-producer.ts:2586-2596 — `activeRoots`' second
reader, in the child-launch argv:

```ts
    const launch = launchSubagentChild(
      {
        argv: {
          slug: theta.slashName,
          thetaDirs: this.#input.activeRoots ?? [],
          systemPrompt: systemPrompt ?? "",
          hostTools: piToolNames,
          noHostTools,
          provider: String(model.provider),
          model: model.id,
          projectTrust,
        },
```

src/extension/production-theta-producer.ts:4382-4390 — the consumer the doc
does name:

```ts
  async #recheckCalleeContainment(
    theta: ConversationBindInput["theta"],
    calleePath: string,
  ): Promise<InvokeInfraError | undefined> {
    const fileSystem = this.#input.fileSystem;
    const activeRoots = this.#input.activeRoots;
    if (fileSystem === undefined || activeRoots === undefined) {
      return undefined;
    }
```

Exhaustive reader search: `grep -n "input\.activeRoots\|input\.fileSystem"
src/extension/production-theta-producer.ts` → 846 (comment), 857, 858
(constructor), 2589 (argv), 4386, 4387 (`#recheckCalleeContainment`). Two code
readers per field, one of which the doc block names.

## Why this is a problem
An incomplete consumer roster on a field doc whose stated purpose is to tell a
reader what the field is for and what its absence costs. The block's
"Absent … in which case the runtime re-check is skipped" is the only stated
consequence, and it is not the whole consequence: an absent `fileSystem` also
leaves `#ledger` `undefined`, which makes `emitTopLevelErrNote` render the
SLSH-5 invoke-hop chain empty and `#recordInvokeHop` record nothing (the
`#ledger` doc at 843-851 states that separately, but the field doc a reader
starts from does not), and an absent `activeRoots` also spawns the subagent
child with `thetaDirs: []`. `git blame` dates the absence sentence (lines 541-542) and the `activeRoots`
declaration to `2626d39d` (2026-07-04, INV-1 wiring); the child-argv read is
`4866d4d2` (2026-07-24, RFC 0006) and the ledger read is `670875c8`
(2026-08-22, bug 0088) — both later. The block was edited twice since
(`537c274c`, 2026-08-23, a citation fix on lines 539-540; `16fe3875`,
2026-09-01, the bug-0293 `lstat` sentence) without the roster being widened.

## Suggested direction (non-binding, optional)
State both consumers per field (or split the shared block), so the absence
consequence a harness author reads is the full one.

## False-positive check
- Exhaustive reader search as quoted above: `grep -n
  "input\.activeRoots\|input\.fileSystem"` returns six lines; one is inside the
  `#ledger` doc comment, the other five are the code readers cited.
- Verified the second readers are production paths, not harness shims: the
  constructor runs for every `createProductionProducerDeps` call
  (`production-composition.ts:859`), and the argv site is inside
  `spawnSubagentConversation`'s unconditional `launchSubagentChild` call.
- Verified `#ledger`'s dependence is real: `readonly #ledger:
  InvocationProvenanceLedger | undefined` (852) is assigned only in the
  constructor, and its readers are `#recordInvokeHop` (884) and
  `emitTopLevelErrNote` (1710, `this.#ledger?.chainFor(error) ?? []`).
- Verified the doc block governs both fields: `activeRoots` (549) carries no
  doc of its own; the next `/**` opens at 550 for `activeInvocations`.
- Not dead code: both fields and all four readers are live; only the doc's
  consumer/absence statement is claimed incomplete.
- Checked already-filed intake: the standing producer findings cover
  line-citation drift, detached doc comments, "test thetas" narration, the
  RFC-0005 adapter satellites, `ConversationBinding.effectHostDeps` and
  `enumDeclaringPath`'s boundary count; none cites lines 538-549.
- Git intent: `git blame -L 538,549` → `2626d39d` (2026-07-04) for the
  absence sentence and the `activeRoots` declaration, `537c274c` (2026-08-23)
  and `16fe3875` (2026-09-01) for later edits; `git blame -L 856,859` →
  `670875c8` (2026-08-22) and `-L 2589,2589` → `4866d4d2` (2026-07-24). Both
  second readers post-date the sentence they contradict, so this is drift
  rather than a deliberate narrowing of scope.

## Triage
