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
  npx --yes @deepseek-ai/dsh --profile "$PROFILE" --from-default-profile web --dump-config >/dev/null
fi

# Install the plugin into that profile if it is not there yet.
PLUGIN_DIR="$DSH_HOME/profiles/$PROFILE/node_modules/echoflowai-tools"
if [ ! -f "$PLUGIN_DIR/lib/index.js" ]; then
  echo "==> building the tarball"
  (cd "$REPO" && ./build-tarball.sh)
  echo "==> installing into profile '$PROFILE'"
  npx --yes @deepseek-ai/dsh plugin --profile "$PROFILE" add "$REPO/dist/echoflowai-tools-0.1.0.tgz"
fi

echo "==> booting"
exec npx --yes @deepseek-ai/dsh --profile "$PROFILE" "$@"
