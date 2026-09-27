# Upgrading from 0.x

Before 1.0, the skills were copied by hand or installed with Tessl, each skill carried `scripts/*.sh`, and `/dld-init` appended a `## DLD (Decision-Linked Development)` section to `CLAUDE.md`.

- **Your data carries over unchanged:** `dld.config.yaml`, `decisions/records/`, `decisions/INDEX.md` and `decisions/.dld-state.yaml`. 1.0 reads them as 0.x wrote them.
- **Skills copied into `.claude/skills/` or `.agents/skills/`:** in the project, run `npx dld-kit@latest update --agent <names>` (e.g. `--agent claude,codex`). It rewrites the `dld-*` skills, deletes their old `scripts/*.sh`, and installs the always-on rule. Commit the result.
- **Skills copied anywhere else** (e.g. `.cursor/skills/`, `.codex/skills/`): delete those `dld-*` directories, then run the same `update`.
- **Tessl installs:** remove the `dld-kit/dld` tile with Tessl, and delete any DLD rule text Tessl added. Then run `update`. The Tessl tile gets no new versions.
- **The old `CLAUDE.md` section:** once the rule is installed, delete the `## DLD (Decision-Linked Development)` section yourself. Until then Claude Code and Cursor read the rule twice. `update` warns while the section is there, and never edits it.
- **To use the plugin or `npx skills` instead:** delete the copied `dld-*` directories and the old `CLAUDE.md` section first, then install through that channel.
