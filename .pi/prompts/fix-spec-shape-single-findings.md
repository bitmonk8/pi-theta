---
description: Fix every `**Shape:** single` finding in docs/spec-review.md, one at a time (last → first), committing and pushing after each fix
---

Fix every `**Shape:** single` finding in `docs/spec-review.md`,
one at a time, working from the END of the document toward the
beginning (so removals do not perturb earlier findings' line
numbers). For each finding, run the `spec-review-fixer` agent,
then commit and push the result.

## Loop

Maintain a running counter `fixed = 0` and a list `failed = []`.

1. **Pick the next finding.** Run the
   `spec-review-shape-single-picker` agent in single mode with no
   task body other than what its definition specifies:

   ```
   subagent({
     agent: "spec-review-shape-single-picker",
     task: "Pick the last unresolved `**Shape:** single` finding.",
     targetPaths: ["docs/spec-review.md"]
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
     agent: "spec-review-fixer",
     task: "<heading text from step 1, verbatim, no quoting>",
     targetPaths: [
       "docs/spec-review.md",
       "docs/spec.md"
     ]
   })
   ```

   Read the fixer's report. If its "Notes" section indicates it
   could not locate the heading, found a Shape mismatch, or
   otherwise refused to edit, append the heading to `failed` and
   skip step 4 — go to step 5 and continue the loop. Do NOT
   commit a no-op.

4. **Commit and push.** Use the suggested commit message from the
   fixer's "Notes" section if present; otherwise synthesise one
   in the form `pi-loom spec: resolve "<short slug of heading>"`.
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
     retained, ..._` line in `docs/spec-review.md`)

## Guardrails

- Run picker and fixer **sequentially**. Do not parallelise — each
  fixer call mutates the same review document and the spec, and
  the picker's "last finding" answer depends on the doc state
  after the previous fix has landed.
- The loop has no upper iteration cap by design. The picker
  returning `NONE` is the only normal termination condition. The
  hard failure modes are: (a) `git push` failing, (b) the same
  heading being selected twice in a row (interpret as the fixer
  failing to remove it — append to `failed` and break the loop
  to avoid infinite churn).
- Do NOT batch commits across findings. One finding = one
  commit = one push. This keeps the review trail and any
  subsequent revert granular.
