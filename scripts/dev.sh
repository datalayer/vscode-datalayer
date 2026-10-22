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

BUNDLES=${DEV_BUNDLES:-"extension agentChat home showcase datasource datasource-edit"}
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

code --new-window --extensionDevelopmentPath="$PWD" ${FOLDER:+"$FOLDER"}

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
