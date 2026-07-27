#!/usr/bin/env bats
# Tier 2: Structural and lint checks
# Validates consistency between skills/ and .claude/skills/, script path
# references, frontmatter fields, and plugin.json integrity.

load 'test_helper/bats-support/load'
load 'test_helper/bats-assert/load'

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
}

# --- Dual directory sync ---

@test "all skill directories exist in both skills/ and .claude/skills/" {
  for dir in "$REPO_ROOT"/skills/dld-*/; do
    skill_name="$(basename "$dir")"
    [[ -d "$REPO_ROOT/.claude/skills/$skill_name" ]]
  done
}

@test "SKILL.md content matches between skills/ and .claude/skills/ (normalized)" {
  for dir in "$REPO_ROOT"/skills/dld-*/; do
    skill_name="$(basename "$dir")"
    tessl_file="$dir/SKILL.md"
    claude_file="$REPO_ROOT/.claude/skills/$skill_name/SKILL.md"

    [[ -f "$tessl_file" ]] || continue
    [[ -f "$claude_file" ]] || continue

    # Normalize: replace .claude/skills/ paths with relative, strip frontmatter differences
    # The Claude Code version uses absolute .claude/skills/dld-X/ paths while the
    # tessl version uses relative ../dld-X/ paths. We normalize the Claude version
    # by replacing all .claude/skills/dld-*/ references with ../dld-*/ (cross-skill)
    # and scripts/ (same-skill).
    # Also strip Tessl-specific notes (allowed per CLAUDE.md — the tessl version
    # may have notes about steering rules replacing CLAUDE.md instructions)
    tessl_normalized="$(sed \
      -e 's/^compatibility:.*$/__COMPAT_LINE__/' \
      -e '/^> \*\*Note:\*\* If DLD was installed via Tessl/d' \
      "$tessl_file")"

    claude_normalized="$(sed \
      -e 's/^user_invocable:.*$/__COMPAT_LINE__/' \
      -e "s|\.claude/skills/$skill_name/scripts/|scripts/|g" \
      -e "s|\.claude/skills/$skill_name/|./|g" \
      -e 's|\.claude/skills/\(dld-[a-z-]*\)/|../\1/|g' \
      "$claude_file")"

    # Compare ignoring trailing blank lines
    if ! diff -B <(echo "$tessl_normalized") <(echo "$claude_normalized") > /dev/null 2>&1; then
      echo "SKILL.md mismatch for $skill_name"
      diff <(echo "$tessl_normalized") <(echo "$claude_normalized") || true
      return 1
    fi
  done
}

@test "shell scripts are identical between skills/ and .claude/skills/" {
  for dir in "$REPO_ROOT"/skills/dld-*/scripts/; do
    [[ -d "$dir" ]] || continue
    skill_name="$(basename "$(dirname "$dir")")"
    claude_scripts="$REPO_ROOT/.claude/skills/$skill_name/scripts"

    for script in "$dir"/*.sh; do
      [[ -f "$script" ]] || continue
      script_name="$(basename "$script")"
      claude_script="$claude_scripts/$script_name"

      if [[ ! -f "$claude_script" ]]; then
        echo "Missing: .claude/skills/$skill_name/scripts/$script_name"
        return 1
      fi

      if ! diff -q "$script" "$claude_script" > /dev/null 2>&1; then
        echo "Script mismatch: $skill_name/scripts/$script_name"
        diff "$script" "$claude_script" || true
        return 1
      fi
    done
  done
}

# --- Script path references ---

@test "all script paths referenced in skills/ SKILL.md files exist" {
  for skill_md in "$REPO_ROOT"/skills/dld-*/SKILL.md; do
    skill_dir="$(dirname "$skill_md")"
    # Extract paths from code blocks that look like script references
    grep -E '^\.\./dld-|^scripts/' "$skill_md" 2>/dev/null | while IFS= read -r path; do
      resolved="$skill_dir/$path"
      if [[ ! -f "$resolved" ]]; then
        echo "Missing script: $path (referenced in $skill_md)"
        return 1
      fi
    done
  done
}

@test "all script paths referenced in .claude/skills/ SKILL.md files exist" {
  for skill_md in "$REPO_ROOT"/.claude/skills/dld-*/SKILL.md; do
    # Extract .claude/skills/ paths from code blocks
    grep -oE '\.claude/skills/dld-[a-z-]+/scripts/[a-z_-]+\.sh' "$skill_md" 2>/dev/null | while IFS= read -r path; do
      resolved="$REPO_ROOT/$path"
      if [[ ! -f "$resolved" ]]; then
        echo "Missing script: $path (referenced in $skill_md)"
        return 1
      fi
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

    # Check compatibility field exists (tessl version)
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

# --- plugin.json integrity ---

@test "plugin.json exists and tile.json is gone" {
  [[ -f "$REPO_ROOT/.tessl-plugin/plugin.json" ]] || {
    echo "missing .tessl-plugin/plugin.json"
    return 1
  }
  [[ ! -f "$REPO_ROOT/tile.json" ]] || {
    echo "tile.json still present — plugin.json is authoritative, tile.json must be removed"
    return 1
  }
}

@test "plugin.json references all skill directories" {
  for dir in "$REPO_ROOT"/skills/dld-*/; do
    skill_name="$(basename "$dir")"
    run grep "\"skills/$skill_name\"" "$REPO_ROOT/.tessl-plugin/plugin.json"
    assert_success "plugin.json missing skill: $skill_name"
  done
}

@test "plugin.json skill entries point to directories containing SKILL.md" {
  # Read entries into an array first — a `while` loop on the right-hand side of a
  # pipe runs in a subshell, where a failing return cannot fail the test.
  mapfile -t paths < <(sed -n '/"skills"/,/]/p' "$REPO_ROOT/.tessl-plugin/plugin.json" \
    | grep -o '"skills/[^"]*"' | tr -d '"')
  [[ ${#paths[@]} -gt 0 ]] || {
    echo "no skill entries parsed from plugin.json"
    return 1
  }
  for path in "${paths[@]}"; do
    [[ -f "$REPO_ROOT/$path/SKILL.md" ]] || {
      echo "plugin.json references skill without SKILL.md: $path"
      return 1
    }
  done
}

@test "plugin.json steering rule paths exist" {
  mapfile -t rules < <(sed -n '/"rules"/,/]/p' "$REPO_ROOT/.tessl-plugin/plugin.json" \
    | grep -o '"rules/[^"]*"' | tr -d '"')
  [[ ${#rules[@]} -gt 0 ]] || {
    echo "no rule entries parsed from plugin.json"
    return 1
  }
  for path in "${rules[@]}"; do
    [[ -f "$REPO_ROOT/$path" ]] || {
      echo "plugin.json steering rule missing: $path"
      return 1
    }
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
