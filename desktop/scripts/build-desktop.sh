#!/usr/bin/env bash
# Build EchoFlowSiHub Desktop from the upstream DeepSeek Harness desktop app.
#
# Upstream is the build input, not a fork: clone it at a pinned tag, apply our
# overlay (the plugin as a dependency, the brand files, the profile patch that
# mounts it), then run the upstream packaging entry point. Upgrading upstream
# means changing the tag and re-running.
#
# Everything lands under .desktop-build/ so the working tree stays clean and a
# rebuild never depends on the previous one.
#
# Usage:
#   ./build-desktop.sh [target]
#
# Targets:
#   win:x64        Windows x64 installer          (default, needs a Windows host)
#   mac:arm64      macOS arm64 disk image         (needs a macOS host)
#   mac:x64        macOS x64 disk image           (needs a macOS host)
#
# There is no Linux target: upstream's build paths, LibreOffice engine
# selection and native module layout cover Windows and macOS only
# (SUPPORTED_TARGETS in desktop-build-paths.mjs), so a Linux installer is not a
# configuration change but a port. Run this from GitHub Actions, where
# windows-latest and macos-latest supply the required hosts.
#
# Environment:
#   DSH_UPSTREAM_TAG   upstream tag to build from (default dsh-v0.2.1-rc.2)
#   DSH_UNSIGNED       1 to skip code signing (default 1, we hold no certificate)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"  # desktop/scripts -> repository root
OVERLAY="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${DSH_BUILD_ROOT:-$REPO/.desktop-build}"
UPSTREAM_TAG="${DSH_UPSTREAM_TAG:-dsh-v0.2.1-rc.2}"
UNSIGNED="${DSH_UNSIGNED:-1}"
TARGET="${1:-win:x64}"

UPSTREAM_REPO="https://github.com/deepseek-ai/deepseek-harness.git"
UPSTREAM_DIR="$BUILD_ROOT/upstream"

echo "==> target      : $TARGET"
echo "==> upstream    : $UPSTREAM_REPO @ $UPSTREAM_TAG"
echo "==> build root  : $BUILD_ROOT"
echo "==> unsigned    : $UNSIGNED"
echo

# --- 1. fetch the upstream tree at the pinned tag -------------------------
mkdir -p "$BUILD_ROOT"
if [ -d "$UPSTREAM_DIR/.git" ]; then
  echo "==> refreshing upstream checkout"
  git -C "$UPSTREAM_DIR" fetch --depth 1 origin "refs/tags/$UPSTREAM_TAG:refs/tags/$UPSTREAM_TAG" 2>&1 | tail -2
else
  echo "==> cloning upstream"
  git clone --depth 1 --branch "$UPSTREAM_TAG" "$UPSTREAM_REPO" "$UPSTREAM_DIR" 2>&1 | tail -2
fi
git -C "$UPSTREAM_DIR" checkout --detach "refs/tags/$UPSTREAM_TAG" 2>&1 | tail -1

UPSTREAM_COMMIT="$(git -C "$UPSTREAM_DIR" rev-parse HEAD)"
echo "    upstream commit: ${UPSTREAM_COMMIT:0:12}"

# --- 2. build the plugin, which the overlay ships as a tarball ------------
echo "==> building the plugin tarball"
"$REPO/build-tarball.sh"
PLUGIN_TGZ="$(ls -t "$REPO"/dist/echoflowai-tools-*.tgz | head -1)"
echo "    plugin: $(basename "$PLUGIN_TGZ")"

# --- 3. apply the overlay -------------------------------------------------
echo "==> applying overlay"

# 3a. the plugin becomes a dependency of the desktop app. Upstream's
# prepare-package-set.ts packs whatever the desktop manifest declares, so a
# file: dependency is enough to get it into the package set, and the profile
# patch below mounts it as a bundle.
DESKTOP_MANIFEST="$UPSTREAM_DIR/apps/desktop/package.json"
# Node, not python: the GitHub Windows runner has no python3, and this script
# has to run there. Node is guaranteed by setup-node in the workflow.
node -e '
  const fs = require("node:fs")
  const [manifest, tgz] = process.argv.slice(1)
  const d = JSON.parse(fs.readFileSync(manifest, "utf8"))
  d.dependencies ??= {}
  d.dependencies["echoflowai-tools"] = "file:" + tgz
  fs.writeFileSync(manifest, JSON.stringify(d, null, 2) + "\n")
  console.log("    added echoflowai-tools to apps/desktop/package.json")
' "$DESKTOP_MANIFEST" "$PLUGIN_TGZ"

# 3b. mount it as a bundle, with our station as the base URL.
cat > "$UPSTREAM_DIR/apps/desktop/cordis.patch.yml" <<'YML'
# EchoFlowSiHub overlay: mount the account plugin into the desktop profile.
#
# Upstream's own desktop profile is composed from its bundle list; this patch
# layer is applied on top of every bundle, so the plugin joins the tree
# without editing any upstream file. Only the station base URL is configured
# here — everything else in the plugin (sign-in, tokens, balance, models,
# media, market, search) derives from it at runtime.

- insert:
    - id: echoflow-account
      name: echoflowai-tools
      config:
        baseUrl: https://api.echoflowai.cc
YML
echo "    wrote apps/desktop/cordis.patch.yml"

# 3c. brand files. The welcome window and the product name are what a user
# sees before any plugin draws.
for f in "$OVERLAY"/brand/*; do
  [ -e "$f" ] || continue
  cp "$f" "$UPSTREAM_DIR/apps/desktop/resources/"
  echo "    brand -> $(basename "$f")"
done

# --- 4. install and package ----------------------------------------------
echo "==> installing dependencies (this takes a while)"
cd "$UPSTREAM_DIR"
# --no-frozen-lockfile: the overlay adds a dependency to
# apps/desktop/package.json that upstream's lockfile does not carry, and pnpm
# defaults to --frozen-lockfile when it detects CI. Without this the install
# fails with "specifiers in the lockfile don't match specifiers in
# package.json".
pnpm install --no-frozen-lockfile 2>&1 | tail -8

# Upstream refuses to package without a machine preset; the unsigned path is
# the documented one for local and CI builds without signing credentials.
# Upstream refuses to build a Windows installer off Windows
# ("win-x64 requires a Windows x64 build host"). Check it here so the failure
# is immediate rather than three steps in.
if [[ "$TARGET" == win:* && "$(uname -s)" != MINGW* && "$(uname -s)" != *_NT* ]]; then
  echo "error: Windows installers must be built on a Windows host." >&2
  echo "       Run this from GitHub Actions (windows-latest) or a Windows machine." >&2
  exit 3
fi

case "$TARGET" in
  win:x64)
    if [ "$UNSIGNED" = "1" ]; then
      pnpm -w run package:desktop:win:x64:unsigned 2>&1 | tail -25
    else
      pnpm -w run package:desktop:win:x64 2>&1 | tail -25
    fi
    ;;
  mac:arm64) pnpm -w run package:desktop:mac:arm64 2>&1 | tail -25 ;;
  mac:x64)   pnpm -w run package:desktop:mac:x64 2>&1 | tail -25 ;;
  linux:*)
    pnpm --dir apps/desktop run package:desktop:linux 2>&1 | tail -25
    ;;
  *)
    echo "error: unknown target $TARGET" >&2
    exit 2
    ;;
esac

# --- 5. collect the artifacts --------------------------------------------
OUT="$BUILD_ROOT/artifacts/$TARGET"
mkdir -p "$OUT"
find "$UPSTREAM_DIR/apps/desktop/.desktop-build/targets" -type f \
  \( -name '*.exe' -o -name '*.dmg' -o -name '*.AppImage' -o -name '*.deb' -o -name '*.zip' \) \
  -exec cp {} "$OUT/" \; 2>/dev/null || true

echo
echo "==> artifacts in $OUT"
ls -la "$OUT"
