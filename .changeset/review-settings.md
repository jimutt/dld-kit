---
"dld-kit": minor
---

You can now choose the model review subagents run on, and review plans as well as code. `review_model` sets the reviewers' model, `implement_review_model` and `plan_review_model` override it per step, and `plan_review: true` makes `/dld-plan` have a subagent review the decisions it wrote (off by default). Set them for the team in `dld.config.yaml`, or for yourself in `dld.local.yaml`, a per-checkout file that `dld init` and `dld update` add to `.gitignore`; your own settings win, and asking in the request for one run wins over both.
