#!/usr/bin/env bats
# Tier 2: Structural and lint checks
# Validates the generated skills/ and .claude/skills/ output: script path
# references, frontmatter fields, and shell script conventions.

load 'test_helper/bats-support/load'
load 'test_helper/bats-assert/load'

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
}

# The generated copies are kept in sync with templates/ by npm run check:generated
# (DL-033); these tests check what the generated output references and declares.

# --- Script path references ---

@test "all script paths referenced in skills/ SKILL.md files exist" {
  for skill_md in "$REPO_ROOT"/skills/dld-*/SKILL.md; do
    skill_dir="$(dirname "$skill_md")"
    # mapfile rather than a piped while loop: a return inside a pipeline's subshell
    # cannot fail the test.
    mapfile -t paths < <(grep -oE '(\.\./dld-[a-z-]+/)?scripts/[a-z_-]+\.sh' "$skill_md")
    for path in "${paths[@]}"; do
      [[ -f "$skill_dir/$path" ]] || {
        echo "Missing script: $path (referenced in $skill_md)"
        return 1
      }
    done
  done
}

@test "all script paths referenced in .claude/skills/ SKILL.md files exist" {
  for skill_md in "$REPO_ROOT"/.claude/skills/dld-*/SKILL.md; do
    mapfile -t paths < <(grep -oE '\.claude/skills/dld-[a-z-]+/scripts/[a-z_-]+\.sh' "$skill_md")
    for path in "${paths[@]}"; do
      [[ -f "$REPO_ROOT/$path" ]] || {
        echo "Missing script: $path (referenced in $skill_md)"
        return 1
      }
    done
  done
}

# --- Frontmatter validation ---

@test "all skills/ SKILL.md files have valid frontmatter" {
  for skill_md in "$REPO_ROOT"/skills/dld-*/SKILL.md; do
    skill_name="$(basename "$(dirname "$skill_md")")"

    # Check frontmatter delimiters
    first_line="$(head -1 "$skill_md")"
    assert_equal "$first_line" "---" "Missing opening --- in $skill_name"

    # Check name field matches directory
    name_field="$(awk '/^---$/{n++; next} n==1 && /^name:/{print; exit}' "$skill_md" | sed 's/^name:[[:space:]]*//')"
    assert_equal "$name_field" "$skill_name" "name mismatch in $skill_name"

    # Check description field exists
    run grep "^description:" "$skill_md"
    assert_success "Missing description in $skill_name"

    # Check compatibility field exists (agent-skills output)
    run grep "^compatibility:" "$skill_md"
    assert_success "Missing compatibility in $skill_name"
  done
}

@test "all .claude/skills/ SKILL.md files have user_invocable field" {
  for skill_md in "$REPO_ROOT"/.claude/skills/dld-*/SKILL.md; do
    skill_name="$(basename "$(dirname "$skill_md")")"

    # dld-common is not user-invocable
    if [[ "$skill_name" == "dld-common" ]]; then
      continue
    fi

    run grep "^user_invocable:" "$skill_md"
    assert_success "Missing user_invocable in .claude/skills/$skill_name"
  done
}

# --- Shell script conventions ---

@test "all shell scripts use strict mode (set -euo pipefail)" {
  find "$REPO_ROOT/skills" -name '*.sh' -type f | while IFS= read -r script; do
    if ! grep -q 'set -euo pipefail' "$script"; then
      echo "Missing strict mode: $script"
      return 1
    fi
  done
}

@test "all shell scripts have shebang line" {
  find "$REPO_ROOT/skills" -name '*.sh' -type f | while IFS= read -r script; do
    first_line="$(head -1 "$script")"
    if [[ "$first_line" != "#!/usr/bin/env bash" ]]; then
      echo "Bad shebang in: $script (got: $first_line)"
      return 1
    fi
  done
}
