---
"dld-kit": major
---

dld-kit now needs Node.js 22 or newer; Node 20 reached end-of-life in April 2026, so upgrade Node before updating. From 1.0.0, dld-kit supports every Node.js line in active or maintenance LTS (now 22, 24 and 26) and may drop one in a minor release once it reaches end-of-life. The semver contract is now stated in full in `docs/releasing.md`: decision records, annotations, `dld.config.yaml`, the setup and CI commands, the installed layout, the skill names and arguments, the install channels and the file names in the decisions directory. Frontmatter fields dld-kit doesn't know are kept, and dld-kit never uses the `x-` prefix for fields or config keys, so it is yours.
