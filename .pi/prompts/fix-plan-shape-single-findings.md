---
description: Fix every `**Shape:** single` finding in docs/plan-review.md, one at a time (last → first), committing and pushing after each fix
---

Fix every `**Shape:** single` finding in `docs/plan-review.md`,
one at a time, working from the END of the document toward the
beginning (so removals do not perturb earlier findings' line
numbers). For each finding, run the `plan-review-fixer` agent,
then commit and push the result.

## Loop

Maintain a running counter `fixed = 0` and a list `failed = []`.

1. **Pick the next finding.** Run the
   `plan-review-shape-single-picker` agent in single mode with no
   task body other than what its definition specifies:

   ```
   subagent({
     agent: "plan-review-shape-single-picker",
     task: "Pick the last unresolved `**Shape:** single` finding.",
     targetPaths: ["docs/plan-review.md"]
   })
   ```

   `targetPaths` is required so the project-local agent
   definition under `.pi/agents/` resolves.

   The agent's entire output is either the literal token `NONE`
   or the heading text of the selected finding on a single line.
   Trim whitespace before parsing.

2. **Termination check.** If the picker returned `NONE`, exit the
   loop and go to step 6.

3. **Fix the finding.** Pass the heading text verbatim as the
   fixer's task:

   ```
   subagent({
     agent: "plan-review-fixer",
     task: "<heading text from step 1, verbatim, no quoting>",
     targetPaths: [
       "docs/plan-review.md",
       "docs/plan.md",
       "docs/spec.md"
     ]
   })
   ```

   Read the fixer's report. If its "Notes" section indicates it
   could not locate the heading, found a Shape mismatch, or
   otherwise refused to edit, append the heading to `failed` and
   skip steps 3b and 4 — go to step 5 and continue the loop. Do
   NOT commit a no-op.

3b. **Plan review/fix loop on the diff.** A single fix can
    introduce new plan problems (broken leaf-ID references,
    coverage-matrix drift, ordering violations, naming drift,
    contradictions with sibling leaves). Run a bounded
    review/fix loop over the plan-only portion of the
    uncommitted diff before committing.

    Hardcoded policy (same shape as `/implement`; plan findings
    are NEVER documented in this loop — they are either fixed or
    ignored):
    - **Trust issues are always fixed** — a resolved plan finding
      ships with a self-consistent plan.
    - **High fix Risk or Effort with low impact:** ignore.
    - **High fix Risk or Effort with marginal impact:** ignore.
    - **Same-issue restatement** — if a triaged finding is
      essentially the original `docs/plan-review.md` finding
      re-reported by a lens, ignore.
    - **Spec-only follow-ups:** ignore in this loop. The
      `plan-review-fixer` may have edited `docs/spec.md` /
      `docs/spec_topics/` when the original recommendation
      required it. Spec-lens review of those edits is owned by
      `/fix-spec-shape-single-findings`, not this loop.
    - **Everything else:** fix.

    Iteration cap: at most **3** review→fix passes per top-level
    finding. If the loop has not converged after 3 passes, stop
    looping, append the heading to `failed`, skip step 4, and
    continue to step 5. Do NOT commit a partially-resolved plan.

    ### Inner loop

    **A. Review.** Compute the plan-only diff and pass it to the
    plan lenses by file (defeats tool-result truncation):

    1. Determine the worktree root (`git rev-parse --show-toplevel`).
    2. Mint an `innerRunId` = `<UTC-ISO-timestamp>_<6-char-random>`,
       e.g. `2026-05-08T07-18-06_a1b2c3`.
    3. `reviewDir` = `<worktreeRoot>/.pi/tmp/plan-fix-loop/<innerRunId>`
       (forward slashes; this path is passed to subagents).
    4. `mkdir -p <reviewDir>`.
    5. Build the diff payload, scoped to plan files only —
       exclude `docs/plan-review.md` so the fixer's own removal of
       the top-level finding is not re-litigated, and exclude
       `docs/spec.md` / `docs/spec_topics/` because spec-side
       review is not this loop's job:

       ```bash
       {
         git diff -- docs/plan.md docs/plan_topics/
         git diff --cached -- docs/plan.md docs/plan_topics/
         # Untracked plan leaf files (new files the fixer just added):
         git ls-files --others --exclude-standard -- docs/plan_topics/ \
           | while read f; do
               printf '\n--- NEW FILE: %s ---\n' "$f"
               cat "$f"
             done
       } > "<reviewDir>/_diff.txt"
       ```

       If `_diff.txt` is empty (the fixer reported success but
       only edited spec files, or did not actually edit any plan
       file), there is nothing to review — exit the inner loop
       and go to step 4.
    6. Extract the list of plan files actually changed:

       ```bash
       changedPaths=$(
         git diff --name-only -- docs/plan.md docs/plan_topics/
         git diff --cached --name-only -- docs/plan.md docs/plan_topics/
         git ls-files --others --exclude-standard -- docs/plan_topics/
       | sort -u)
       ```

    Use the subagent tool in **parallel** mode with
    `targetPaths: changedPaths` and the entries below as `tasks`.
    **Each task string must end with this Output Protocol block**
    (substituting the agent's own name and the absolute
    `reviewDir`):

    > **Output protocol (mandatory):**
    > - Read the plan diff payload from `<reviewDir>/_diff.txt`.
    >   You may also read full files under `docs/plan.md`,
    >   `docs/plan_topics/`, `docs/spec.md`, and
    >   `docs/spec_topics/` for context. Do NOT read
    >   `docs/plan-review.md` — it is out of scope for this loop.
    > - Focus on plan issues introduced or made worse by the
    >   diff. Pre-existing problems in unchanged sections are
    >   out of scope. Spec-side problems are also out of scope
    >   here — surface only how the diff affects the plan.
    > - Write your findings as Markdown to
    >   `<reviewDir>/<your-agent-name>.md`. Use absolute path.
    >   Create no other files.
    > - Your final assistant message MUST contain ONLY the
    >   absolute path to that file — no prose, no preamble, no
    >   fences.
    > - If you find no issues, still write the file with a single
    >   line: `No <lens-topic> issues found.` and return its path.

    The `<your-agent-name>` placeholder is the agent's own
    front-matter name (e.g. `plan-lens-ordering`,
    `pi-loom-plan-lens-leaf-coverage`).

    Tasks (each receives the diff payload reference + the Output
    Protocol block) — narrow `plan-lens-*` only, mirroring
    `/implement`'s no-broad-lenses discipline:

    - plan-lens-ordering
    - plan-lens-risk
    - plan-lens-spec-coverage
    - plan-lens-spec-fidelity
    - plan-lens-step-atomicity
    - plan-lens-validation
    - `*-plan-lens-*` — pattern; expands to every project-local
      narrow plan-lens agent on the ancestries of `changedPaths`.
      The leading dash excludes user-level `plan-lens-*` (already
      named above) and any `plan-lens-*-broad` variants.

    **Do not** pre-check whether agents exist — the subagent tool
    handles discovery from `.pi/agents/` on the ancestry of
    `targetPaths` automatically.

    **Do not** parse return values from the parallel tool result.
    The truth is the files in `reviewDir`. After the parallel
    call returns, do `ls <reviewDir>` and treat every `.md` file
    (excluding `_diff.txt`, `_triage.md`) as one lens's findings.

    **Failed agents:** If `ls` shows a missing expected lens file
    (or one of size 0), **re-run that specific agent once** in
    single mode with the same Output Protocol. If it fails again,
    write `<reviewDir>/<agent-name>.md` containing the line
    `Agent unavailable: <agent-name>` and continue. Do NOT skip
    the lens silently.

    **B. Triage.** Use the subagent tool to run the
    `triage-assessor` agent. Pass it the directory: include in
    the task string the line `Findings directory: <reviewDir>`
    and tell it to read every `.md` file there (excluding
    `_diff.txt`) as one lens's findings. The triage-assessor
    will write its assessment to `<reviewDir>/_triage.md` and
    return that path.

    **C. Apply policy & fix.** Read `<reviewDir>/_triage.md`.
    Classify each assessed finding per the policy at the top of
    this step.
    - Fix: use the subagent tool to run `plan-diff-fixer`
      sequentially (one at a time) with the **full assessed
      finding text inline** as the task body, and
      `targetPaths: ["docs/plan.md", ...changedPaths...]` so
      project-local agents on the plan ancestry resolve. If the
      `plan-diff-fixer` reports in its "Notes" that it could not
      apply a safe fix, treat that finding as ignored for this
      iteration (do not retry within the same pass).
    - Ignore: skip.

    Do **not** write findings to any issue tracker in this loop.
    Do **not** edit `docs/plan-review.md` from inside this inner
    loop. Do **not** edit the spec from inside this inner loop.

    **D. Re-review or terminate.** If any fixes were applied in
    this pass, increment the inner-pass counter and go back to A
    with a fresh `innerRunId` (each pass gets its own
    `reviewDir`). If **zero** findings were classified as "fix"
    in this pass, the inner loop is done — proceed to step 4.
    You MUST re-review after every round of fixes — fixes can
    introduce new issues. If the inner-pass counter would exceed
    3, follow the iteration-cap rule above (append heading to
    `failed`, skip step 4, continue to step 5).

4. **Commit and push.** Use the suggested commit message from the
   step-3 fixer's "Notes" section if present; otherwise synthesise
   one in the form `pi-loom plan: resolve "<short slug of heading>"`.
   Run, from the worktree root:

   ```bash
   git add -A docs/ && \
     git -c core.editor=true commit -m "<message>" && \
     git push
   ```

   If `git commit` reports nothing to commit, treat it as a
   failure for this finding: append the heading to `failed`,
   continue the loop. Do NOT loop forever on a finding the fixer
   silently no-ops.

   If `git push` fails (network, non-fast-forward, etc.), stop
   the loop, report what was fixed so far, and surface the push
   error to the user. Do not attempt to recover automatically.

5. **Increment counters.** `fixed += 1`. Loop back to step 1.

6. **Summary.** Print a concise summary to the conversation:

   - Total findings fixed: `fixed`
   - Failed / skipped findings: list `failed` verbatim, or `none`
   - Final review-doc finding count (from the `_<N> findings
     retained, ..._` line in `docs/plan-review.md`)

## Guardrails

- Run picker, top-level fixer, and inner review/fix loop
  **sequentially**. Do not parallelise across findings — each
  outer iteration mutates the same review document and the
  plan, and the picker's "last finding" answer depends on the
  doc state after the previous fix has landed. Within the inner
  loop, lens reviewers run in parallel but `plan-diff-fixer`
  calls run sequentially.
- The outer loop has no upper iteration cap by design. The
  picker returning `NONE` is the only normal termination
  condition. The hard failure modes are: (a) `git push` failing,
  (b) the same heading being selected twice in a row (interpret
  as the top-level fixer failing to remove it — append to
  `failed` and break the loop to avoid infinite churn),
  (c) the inner review/fix loop hitting its 3-pass cap (handled
  in step 3b: heading goes to `failed`, no commit).
- The inner review/fix loop is capped at 3 passes per top-level
  finding. This trades a small amount of un-converged risk for
  guaranteed forward progress on the outer loop.
- The inner loop covers ONLY the plan diff (`docs/plan.md` and
  `docs/plan_topics/`). It deliberately excludes
  `docs/plan-review.md` (so the fixer's own removal is not
  reviewed), and excludes `docs/spec.md` / `docs/spec_topics/`
  even when the top-level fixer touched them — spec-side review
  is owned by `/fix-spec-shape-single-findings`. Any spec edits
  the `plan-review-fixer` made still ride along inside the
  commit; they just are not re-reviewed by plan lenses here.
- The inner loop uses only narrow `plan-lens-*` reviewers, never
  any broad variants — same scope discipline as `/implement`.
  Broad lenses are correct for a from-scratch `/plan-review`,
  not for a per-finding fix loop.
- Do NOT batch commits across findings. One top-level finding =
  one commit = one push, even when the inner loop applied
  multiple fixes. This keeps the review trail and any subsequent
  revert granular while still ensuring each commit ships a
  self-consistent plan.
