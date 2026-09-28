---
id: PTQ-1586
title: "Bug 0234's 0.204.0 fix record says its live witness `tests/live/pattern-field-integer-narrowing-live-cell-.test.ts` was run green and red-proven, but 687305c5 landed the cell as `pattern-field-integer-narrowing-live-cell.test.ts` and the cited path has never existed"
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0234-pattern-field-literal-integer-narrowing-deferred.md:611-618
  - tests/live/pattern-field-integer-narrowing-live-cell.test.ts:1-7
  - tests/live/pattern-field-integer-narrowing-live-cell.test.ts:121-122
  - tests/live/pattern-field-integer-narrowing-live-cell.test.ts:155-188
  - CHANGELOG.md:3195-3207
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0234's 0.204.0 fix record says its live witness `tests/live/pattern-field-integer-narrowing-live-cell-.test.ts` was run green and red-proven, but 687305c5 landed the cell as `pattern-field-integer-narrowing-live-cell.test.ts` and the cited path has never existed

## Observation
Verification item (3) of bug 0234's `## Fix (0.204.0)` names the only live witness for the fix as `tests/live/pattern-field-integer-narrowing-live-cell-.test.ts`. The trailing hyphen before `.test.ts` is where a placeholder token appears to have been stripped. The record says this file was run "GREEN with the fix" and "RED with … reverted". That path does not exist, and `git log --all` records no commit that ever touched it. Fix commit 687305c5 added the cell as `tests/live/pattern-field-integer-narrowing-live-cell.test.ts`, which still exists and names bug 0234. As written, the pointer resolves to nothing. The equivalent witness is the landed file.

## Evidence
Claim side (re-read just before filing), `docs/bugs/0234-pattern-field-literal-integer-narrowing-deferred.md:611-618`:
```
  `git hash-object`. (2) Full default suite green (388 files). (3) Live:
  `tests/live/pattern-field-integer-narrowing-live-cell-.test.ts` run
  for real under the shared lock — GREEN with the fix (`Tests 1 passed (1)`,
  3145ms, one real model turn on the `integer`-spelled sibling), and RED with
  `src/parser/{type-layer-checks,theta-document}.ts` reverted byte-exact to the
  fork point, with the bug's own signature (`Registered:
  ["cellslashintegernarrowingpattern","cellslashintegerspelledpattern"]`);
  src restored, hashes verified.
```

Evidence side (equivalent witness, opened), `tests/live/pattern-field-integer-narrowing-live-cell.test.ts`:
- `:1-4`: `// Bug 0234 — a \`number\`-spelled numeric literal in a \`match\` object-pattern` / `// field under an \`integer\`-declared field of a same-file object-form schema` / `// (\`match d { Q { a: 1.0 } => … }\` where \`schema Q { a: integer }\`) must now` / `// draw \`theta/parse/integer-narrowing\` and DENY registration, on bug 0226's`
- `:121`: `describe("bug 0234 — a \`number\`-spelled pattern field literal under an \`integer\`-declared field is refused at live production load and un-registers the theta — ", …`
- `:122`: `it("un-registers the \`1.0\`-spelled theta while the \`1\`-spelled sibling over the SAME match shape registers and drives — ", …`, a single `it`, which matches the record's `Tests 1 passed (1)`.
- `:155`/`:168` build the `"Registered: "` failure payload that the record quotes. `:175` `.not.toContain(NARROWING_STEM)` and `:188` `.toContain(CONTROL_LABEL)` are the refusal and sibling observables.
- `CHANGELOG.md:3195-3207` (corroboration only) ends the entry with "Witness: `tests/pattern-field-literal-integer-narrowing-refusal.test.ts` (25 cells) + an H8a live cell red-proven against reverted src". It gives no path.

Searches (all run in this session):
- Filenames: `find tests -name '*pattern-field*'` → 2 files, `tests/live/pattern-field-integer-narrowing-live-cell.test.ts` and `tests/pattern-field-literal-integer-narrowing-refusal.test.ts`. The cited spelling is not among them.
- History of the cited spelling: `git log --all --oneline -- 'tests/live/pattern-field-integer-narrowing-live-cell-.test.ts' | wc -l` → **0**.
- Add commit of the landed file: `git log --oneline --diff-filter=A -- tests/live/pattern-field-integer-narrowing-live-cell.test.ts` → `687305c5 fix(bug-0234): …`. `git show --name-only --format= 687305c5` lists the landed name and the bug doc together.
- Origin of the malformed spelling: `git log --oneline -S 'narrowing-live-cell-.test' -- docs/bugs/0234-pattern-field-literal-integer-narrowing-deferred.md` → 687305c5 only.
- Test titles and bodies: `grep -rln 'Bug 0234\|bug 0234' tests/live` → 1 file, the landed cell. `grep -rn 'narrowing-live-cell-\.test' tests docs` → 2 hits: the claim line (:613) and a comment at `tests/pattern-field-literal-integer-narrowing-refusal.test.ts:109` that repeats the same malformed spelling.
- Bug-doc witness lines: `grep -n 'live' docs/bugs/0234-*.md` → 3 hits (:52 "lives", :511 "a live cell is owed", :613). The live cell's path appears only at :613.
- Coverage matrix / AGENTS.md: `grep -c '0234' docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md AGENTS.md` → 0 / 0 / 0.
- CHANGELOG (corroboration): `grep -n 'Bug 0234' CHANGELOG.md` → :3195, and the entry gives no path.

## Why this is a problem
The record's only live evidence is a green/red-proof pair run against a file named by this path. Re-running it verbatim finds no file, so the claim cannot be reproduced from the record's own pointer. The witness exists under the landed name and asserts the described observables: the `1.0` theta absent from the registered set, and the `1` sibling registering and driving. That makes this a pointer that never resolved, not a missing witness. The cell is under `tests/live/**` and so is not gate-proven. The record words it as a recorded run at fix time.

## Suggested direction (non-binding, optional)
Re-point :613 to `tests/live/pattern-field-integer-narrowing-live-cell.test.ts`.

## False-positive check
- Representations covered: bug-doc witness lines, test filenames (`find`), test titles and bodies (grep over `tests/live` for the bug number, and over `tests docs` for the malformed spelling), coverage-matrix rows (both files), AGENTS.md gate names, and CHANGELOG (corroboration only). Each is stated above with its hit count.
- The landed file was opened. Its header, describe title and it title name bug 0234 and the pattern-position narrowing refusal.
- Cluster key: the malformed spelling was written in fix commit 687305c5 itself, and no file was deleted. No other record in this shard traces to that commit. Bug 0239's similar pointers come from 162ec5c0 and are filed separately.
- Not already filed: `grep -l '687305c5' quality/intake/* quality/issues/*` → 0 files.
- Not citation form: a whole file path, not a `path:line`/symbol anchor. No citation gate reads `docs/bugs/**`.
- Routing note, not filed here: the test comment at `tests/pattern-field-literal-integer-narrowing-refusal.test.ts:109` that repeats the malformed spelling is D7/comment territory.

## Triage
verdict: confirmed — reproduced: bug 0234 :613 cites `tests/live/pattern-field-integer-narrowing-live-cell-.test.ts`. That path does not exist, `git log --all` on it → 0 and `--diff-filter=D` → 0, so nothing was deleted. The malformed spelling was written in 687305c5 itself (`-S 'narrowing-live-cell-.test'` → 687305c5 only). The same commit added the one unambiguous equivalent, which still exists: `tests/live/pattern-field-integer-narrowing-live-cell.test.ts`, with describe "bug 0234 — a `number`-spelled pattern field literal under an `integer`-declared field is refused at live production load and un-registers the theta — " at :121 and a single it "un-registers the `1.0`-spelled theta while the `1`-spelled sibling over the SAME match shape registers and drives — " at :122, which matches `Tests 1 passed (1)`; the "Registered: " payloads are at :155/:168. All stated searches reproduce (2 pattern-field files, 2 malformed-spelling hits, 0 coverage-matrix/AGENTS hits). No other filing tracks 687305c5/0234: the 0239 and b0092 candidates only mention it in passing. The fix is a mechanical re-point with no rewording (triage: claude-opus-5-5)
