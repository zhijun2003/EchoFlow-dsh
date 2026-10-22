#!/usr/bin/env bash
# Start a DSH instance for developing echoflowai-tools, isolated in WSL.
#
# The inherited DSH_HOME points at the Windows profile
# (/mnt/c/Users/zhiju/.dsh), so a dsh command run from WSL boots and writes
# the Windows profile. This script pins DSH_HOME to the WSL-local home and
# refuses the reserved "desktop" profile name, which the CLI rejects
# anyway.
#
# Usage:
#   ./run-dsh-wsl.sh              # boot the web profile
#   ./run-dsh-wsl.sh --dump-config   # print the composed plugin tree
#   ./run-dsh-wsl.sh --headless "run the tests"   # one-shot
set -euo pipefail

export DSH_HOME="${DSH_HOME_WSL:-/home/zhijun/.dsh}"
PROFILE="${DSH_PROFILE_WSL:-echoflow}"
REPO="$(cd "$(dirname "$0")" && pwd)"

# A fixed CLI install, not `npx @deepseek-ai/dsh`: the profile's bundle
# dependencies (@deepseek-ai/dsh-base, dsh-web-app) resolve from the CLI
# package's own node_modules, and npx runs from a temp cache whose path
# changes between invocations. Keeping the CLI at a stable path makes that
# anchor predictable.
CLI_HOME="${DSH_CLI_HOME:-/home/zhijun/.local/share/dsh-cli-secret}"
CLI="$CLI_HOME/node_modules/.bin/dsh"
CLI_SPEC="${DSH_CLI_SPEC:-@deepseek-ai/dsh@0.1.1-rc.2}"
if [ ! -x "$CLI" ]; then
  echo "==> installing the dsh CLI into $CLI_HOME"
  mkdir -p "$CLI_HOME"
  (cd "$CLI_HOME" && npm install --silent --no-audit --no-fund "$CLI_SPEC")
fi

# The published cordis-plugin-hmr has no `registerConfig`, which the newer
# app-boot needs to watch the user patch layer. Patch it in place; the
# script is idempotent.
HMR_LIB="$CLI_HOME/node_modules/@deepseek-ai/cordis-plugin-hmr/lib/index.js"
if [ -f "$HMR_LIB" ]; then
  python3 "$REPO/patch-hmr-register-config.py" "$HMR_LIB" | sed 's/^/    /'
fi

echo "DSH_HOME : $DSH_HOME"
echo "profile  : $PROFILE"
echo "repo     : $REPO"
echo

case "$PROFILE" in
  desktop)
    echo "error: the desktop profile is reserved by the Electron application." >&2
    echo "       use another name, e.g. DSH_PROFILE_WSL=echoflow" >&2
    exit 1
    ;;
esac

mkdir -p "$DSH_HOME"

# First run: lay down the profile from the shipped web template.
if [ ! -f "$DSH_HOME/profiles/$PROFILE/package.json" ]; then
  echo "==> creating profile '$PROFILE' from the shipped web template"
  "$CLI" --profile "$PROFILE" --from-default-profile web --dump-config >/dev/null
fi

# Install the plugin into that profile if it is not there yet.
PLUGIN_DIR="$DSH_HOME/profiles/$PROFILE/node_modules/echoflowai-tools"
if [ ! -f "$PLUGIN_DIR/lib/index.js" ]; then
  echo "==> building the tarball"
  (cd "$REPO" && ./build-tarball.sh)
  echo "==> installing into profile '$PROFILE'"
  "$CLI" plugin --profile "$PROFILE" add "$REPO/dist/echoflowai-tools-0.1.0.tgz"
fi

# The app comes from the profile's own bundle list (@deepseek-ai/dsh-web-app
# for a web profile), not from an argument: the first positional argument of
# `dsh` is a profile name, so `dsh web` boots the profile named "web".
# Extra arguments are passed through to the app.
echo "==> booting (profile $PROFILE)"
exec "$CLI" --profile "$PROFILE" "$@"
