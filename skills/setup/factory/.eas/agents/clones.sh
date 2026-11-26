#!/usr/bin/env bash
# Shared by the job scripts. The clone functions need PUSH_URL, GITHUB_REPOSITORY, REPO_DIR and
# APP_PATH; trusted_copy needs nothing.
#
# Two clones, on purpose. An agent works in the first one, and it can run code there (the
# tests that it writes). So after an agent has run, everything in that folder is untrusted,
# .git included: a hook, a config line or an index flag could make a later git command run the
# agent's code with the tokens in the environment, or hide a changed file from a check.
# The commit and the push, which need the token, therefore happen in a second clone that no
# agent has touched. Only the files of the work tree are copied across.
#
# Not covered: an agent's code runs as the same user as this script, so it can still change
# files outside the clones. Closing that needs the agent in its own job or sandbox.

# Git ignores the user and system config files from here on. An agent could have written them.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

# trusted_copy <file>: copies a script that this job runs later with a token to a read-only
# folder, and prints the new path. Every agent can write files, so a script left in the checkout
# could be rewritten by an agent (a prompt injection is enough) and then run with the token.
# Call it before the first agent runs.
trusted_copy() {
  local dir
  dir=$(mktemp -d)
  cp "$1" "$dir/"
  chmod -R a-w "$dir"
  printf '%s/%s\n' "$dir" "$(basename "$1")"
}

# agent_file <path>: reads a report that an agent left (a summary, a verdict) once, into a new
# file that no agent knows, and prints the path of that copy. The copy is empty when the report
# is missing, is a link, is reached through a linked folder, or is too large to be a report.
# A job publishes these reports, and a link would make it publish some other file, such as one
# that holds the tokens. Use only the copy afterwards, so the report cannot change under you.
agent_file() {
  local dir out
  dir=$(dirname "$1")
  out=$(mktemp)
  if [ ! -L "$dir" ] && [ ! -L "$(dirname "$dir")" ]; then
    node -e '
      const fs = require("fs");
      const [from, to] = process.argv.slice(1);
      try {
        const fd = fs.openSync(from, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(fd);
        if (stat.isFile() && stat.size <= 200000) fs.writeFileSync(to, fs.readFileSync(fd));
      } catch {}
    ' "$1" "$out"
  fi
  printf '%s\n' "$out"
}

# clone_repo <dir> [branch]: a fresh, shallow clone. Replaces <dir> if it exists.
clone_repo() {
  rm -rf "$1"
  git clone --quiet --depth 1 ${2:+--branch "$2"} "$PUSH_URL" "$1"
  git -C "$1" remote set-url origin "https://github.com/${GITHUB_REPOSITORY}.git"
}

# agent_clone <dir> [branch]: a clone for an agent to work in. Sets BASE_SHA to its commit.
agent_clone() {
  clone_repo "$@"
  BASE_SHA=$(git -C "$1" rev-parse HEAD)
  ln -s "$REPO_DIR/node_modules" "$1/node_modules"
  printf 'node_modules\nagent-output/\n' >> "$1/.git/info/exclude"
  mkdir -p "$1/${APP_PATH}agent-output"
}

# copy_work_tree <agent clone> <clean clone>: makes the files of the clean clone the same as
# the files of the agent clone. Nothing from .git, node_modules or agent-output is copied.
copy_work_tree() {
  (cd "$2" && git ls-files -z | xargs -0 rm -f)
  find "$2" -mindepth 1 -type d -empty -not -path "$2/.git/*" -delete
  tar -C "$1" --exclude=.git --exclude=node_modules --exclude=agent-output -cf - . | tar -C "$2" -xf -
}
