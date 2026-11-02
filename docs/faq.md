# FAQ

Questions teams ask before adopting DLD. For the reasoning behind the approach, see the README's [How it works](../README.md#how-it-works); the [concept papers](concept/dld-concept.md) are the original early thinking.

### How is this different from ADRs?

A decision record is close to an ADR, and the format follows ADR conventions. DLD differs in three ways: it records any choice that explains why code looks the way it does, not only architectural ones; each record is linked from the code with an `@decision` annotation, which the agent's always-on rule acts on; and the overview documents are generated from the records instead of maintained by hand. If your team already writes ADRs, think of DLD as ADRs the agent finds by itself.

### We use a spec-driven tool. Do we have to stop?

No. If a spec tool such as Spec Kit, OpenSpec or Kiro works for your team, switching isn't necessarily worth it. The differences that matter:

- **The spec is generated.** A spec tool keeps a spec that has to be updated as the code changes. DLD records each decision once and generates the overview from the decisions, so there's no spec to keep in sync by hand.
- **The history stays.** Changing course is a new decision that supersedes or amends the old one, so the record of why the code looks the way it does is never rewritten.
- **The code points to its reasoning.** An `@decision` annotation sits on the code it explains, so an agent about to change that code is sent to the decision, instead of having to work out which part of a spec applies.

You can also record decisions next to a spec tool, or use `/dld-plan` for the planning step instead of one.

### What does it cost to run?

dld-kit calls no models itself. Each skill is an ordinary session in your agent, on your own subscription or API key. `/dld-decide` and `/dld-lookup` are short. `/dld-plan` and `/dld-implement` are as long as the work they cover, and `/dld-implement` adds one review by a subagent, which you can turn off with `implement_review: false` or move to a cheaper model with `review_model` (see [reviews](framework/project-configuration.md#reviews)). `/dld-retrofit` on a large codebase is the most expensive run: start it on one area.

### What does it add to my repository?

`dld.config.yaml`, a `decisions/` folder, the skills for each agent you chose, the always-on rule (a file, or a block between `<!-- dld-kit:start -->` and `<!-- dld-kit:end -->` markers in `AGENTS.md` or `CLAUDE.md`), and one line each in `.gitattributes` and `.gitignore`. [Install details](install.md#npx-dld-kit-init) lists every path. Commit all of it, including `decisions/.dld-state.yaml` once a skill writes it: it records where `/dld-audit` and `/dld-snapshot` last ran, so the next run only looks at what changed. The one file you don't commit is `dld.local.yaml`, your personal review settings.

### What runs on my machine?

The skills call a bundled copy of the `dld` CLI (`dld-common/scripts/dld.mjs`): one JavaScript file run with Node, with no dependencies to install. It reads and writes files in the repository and runs `git`, and `gh` when `/dld-reindex` checks open PRs. It makes no network requests of its own. The skills also ask your agent to run ordinary commands, such as `git status` or your tests, which your agent's permission settings govern as usual.

### Which languages does it work with?

Any. An annotation is plain text in a comment, `@decision(DL-012)`, so it works in any file that has comments: TypeScript, Python, Go, SQL, YAML, Terraform. The tools find annotations by scanning the repository's text files, not by parsing code.

### How do we know the agent actually reads the decisions?

Try it: annotate a function, ask the agent to change it, and watch it look the decision up first (the [Quickstart](../README.md#quickstart) walks through this). The rule is an instruction in the agent's always-loaded context, so the agent follows it the way it follows your other project instructions: usually, but not always. DLD gives agents context, not guarantees, so keep your tests. `/dld-audit` catches what slips through: changes to annotated code that no decision covers.

### Do we need an LLM in CI?

Only for the agent skills. `dld check-decision-edits` is a plain command that fails a build when someone edits the prose of a decision already on the base branch ([details](framework/project-configuration.md#decision-edits)). `/dld-audit-auto` and `/dld-snapshot` are agent runs: to schedule them, run your agent headless in CI or with its own scheduler.

### What happens when two branches add decisions at the same time?

Both pick the next free ID, so they can collide. When the other branch merges first, run `/dld-reindex` on yours: it renames your drafts to free IDs and updates every annotation and reference to them. `INDEX.md` merges with git's union driver, so adding decisions on two branches doesn't conflict there.

### How many annotations should we add?

Only where the reason isn't obvious from the code: the retry tuned to one API, the check for a production-only bug. If you'd write a comment explaining why, link a decision instead. Ordinary code needs none.

### What if we stop using it?

Nothing breaks. The records are markdown files and the annotations are comments, so both stay readable without dld-kit. To remove it, delete what `init` wrote ([install details](install.md#npx-dld-kit-init) lists it): the `dld-*` skill folders, the rule file or the marked block, and `dld.config.yaml`. Keep `decisions/` and the annotations as documentation, or delete them too.

### Is it worth it for a small project?

For a short-lived project with one developer, probably not. DLD pays off when code lives for years, several people or agents work on it, and it holds choices driven by things outside the code: customers, vendors, incidents.
