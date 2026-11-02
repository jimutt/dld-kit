---
"dld-kit": patch
---

Repositories whose main branch is `master` now get a base branch without setting `base_branch`, so the decision-edit checks and `/dld-implement`'s list of proposed decisions work there; when no base branch is found at all, `/dld-implement` still lists every proposed decision. The skills that record decisions now pass the body through a quoted heredoc, so backticks, `$` and `%` in a decision are recorded as written instead of being run or mangled by the shell.
