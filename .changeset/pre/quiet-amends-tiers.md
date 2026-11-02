---
"dld-kit": minor
---

`/dld-audit` no longer asks the agent to weigh every decision ID a record mentions. It reports a decision whose prose says it amends or supersedes another one that its frontmatter doesn't list as an issue, and lists likely relationships (change words such as "replaces" near an ID) as advisory; `find-missing-amends --all --mentions` still lists every mention. `create-decision` warns when the body states a relationship its flags leave out, and `/dld-decide` and `/dld-plan` check new decisions right after creating them.
