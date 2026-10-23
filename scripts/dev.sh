#!/usr/bin/env bash
# Copyright (c) 2021-2025 Datalayer, Inc.
#
# MIT License

# Runs the extension in development: a webpack watch of the bundles worked on,
# then an Extension Development Host window once the extension is built.
# Changes are rebuilt by the watch; Ctrl+R in that window loads them.
#
#   make dev                                   # every bundle but the notebook's and the document's
#   DEV_BUNDLES="extension webview" make dev   # other webpack configs by name
#   DEV_FOLDER=~/my-project make dev           # the folder the window opens

set -euo pipefail

cd "$(dirname "$0")/.."

BUNDLES=${DEV_BUNDLES:-"extension agentChat home snapshot showcase datasource datasource-edit"}
FOLDER=${DEV_FOLDER:-}

if ! command -v code >/dev/null 2>&1; then
  echo "make dev: the 'code' command is not on the PATH (VS Code: Shell Command: Install 'code' command in PATH)." >&2
  exit 1
fi

NAMES=()
for bundle in $BUNDLES; do
  NAMES+=(--config-name "$bundle")
done

# webpack's output goes to the terminal and to a log this script reads: the
# extension is built when webpack says so. (A file's time says nothing: webpack
# does not rewrite an output whose content did not change.)
LOG=$(mktemp)
npx webpack --watch "${NAMES[@]}" > >(tee "$LOG") 2>&1 &
WATCH=$!
trap 'kill "$WATCH" 2>/dev/null || true; rm -f "$LOG"' EXIT INT TERM

echo "make dev: watching ${BUNDLES} (DEV_BUNDLES=\"… webview lexical\" adds the notebook's and the document's) — waiting for the extension's first build…"
until grep -q "Compiler 'extension' finished" "$LOG"; do
  if ! kill -0 "$WATCH" 2>/dev/null; then
    echo "make dev: the webpack watch stopped before the extension was built." >&2
    exit 1
  fi
  sleep 1
done

# The window is a VS Code instance of its own (its own profile directory,
# the person's extensions and settings): a window of the running VS Code
# closed at once (extension host exit 55) once VS Code was updated under it,
# and the instance can be stopped without touching the person's own. One
# left by a previous run is stopped first; signed in once, it stays signed in.
PROFILE=${DEV_PROFILE:-"${XDG_CACHE_HOME:-$HOME/.cache}/datalayer-vscode-dev"}
mkdir -p "$PROFILE/User"
for settings in "$HOME/.config/Code/User/settings.json" "$HOME/Library/Application Support/Code/User/settings.json"; do
  if [ -f "$settings" ] && [ ! -f "$PROFILE/User/settings.json" ]; then
    cp "$settings" "$PROFILE/User/settings.json"
  fi
done
if pkill -f -- "--user-data-dir=$PROFILE( |$)" 2>/dev/null; then
  echo "make dev: stopped the development window of a previous run."
  sleep 2
fi
code --user-data-dir="$PROFILE" --extensions-dir="$HOME/.vscode/extensions" \
  --new-window --extensionDevelopmentPath="$PWD" ${FOLDER:+"$FOLDER"}

cat <<'EOF'

  ┌──────────────────────────────────────────────────────────────────────┐
  │ The Extension Development Host window is opening.                    │
  │                                                                      │
  │ After each change, wait for webpack's "compiled" line here, then     │
  │ press Ctrl+R (Cmd+R on macOS) in that window to see it.              │
  │                                                                      │
  │ The webviews (agentChat, home) finish after the extension: reload    │
  │ once more if a panel still shows the old version. Ctrl+C stops.      │
  └──────────────────────────────────────────────────────────────────────┘

EOF

wait "$WATCH"
