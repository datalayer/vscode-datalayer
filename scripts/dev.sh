#!/usr/bin/env bash
# Copyright (c) 2021-2025 Datalayer, Inc.
#
# MIT License

# Runs the extension in development: a webpack watch of the bundles worked on,
# then an Extension Development Host window once the extension is built.
# Changes are rebuilt by the watch; Ctrl+R in that window loads them.
#
#   make dev                                   # extension, agentChat, home
#   DEV_BUNDLES="extension webview" make dev   # other webpack configs by name
#   DEV_FOLDER=~/my-project make dev           # the folder the window opens

set -euo pipefail

cd "$(dirname "$0")/.."

BUNDLES=${DEV_BUNDLES:-"extension agentChat home"}
FOLDER=${DEV_FOLDER:-}

if ! command -v code >/dev/null 2>&1; then
  echo "make dev: the 'code' command is not on the PATH (VS Code: Shell Command: Install 'code' command in PATH)." >&2
  exit 1
fi

NAMES=()
for bundle in $BUNDLES; do
  NAMES+=(--config-name "$bundle")
done

started=$(date +%s)
npx webpack --watch "${NAMES[@]}" &
WATCH=$!
trap 'kill "$WATCH" 2>/dev/null || true' EXIT INT TERM

echo "make dev: watching ${BUNDLES} — waiting for the extension's first build…"
until [ -f dist/extension.js ] && [ "$(stat -c %Y dist/extension.js)" -ge "$started" ]; do
  if ! kill -0 "$WATCH" 2>/dev/null; then
    echo "make dev: the webpack watch stopped before the extension was built." >&2
    exit 1
  fi
  sleep 2
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
