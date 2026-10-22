#!/usr/bin/env bash
# Build an installable npm tarball for mounting into a dsh profile.
#
# Why a tarball instead of a symlink: the repo lives in the WSL filesystem,
# and Windows Node's ability to follow a / link target is
# unverified. A tarball is a plain file, so copying it across that boundary
# is reliable. Installed into the profile's own node_modules it also sits
# ahead of the flat fallback, which dsh-app-boot re-points on every boot.
#
# `private: true` blocks `npm pack`, so it is removed for the pack and put
# back afterwards. The committed package.json keeps it private.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> typecheck"
pnpm run typecheck

echo "==> build"
pnpm run build

echo "==> test"
node src/models/_local_capability_check.cjs

echo "==> pack"
mkdir -p dist
# Copy, don't rewrite: python's json.dump would reorder the keys. And do NOT
# restore with `git checkout -- package.json` — that discards any uncommitted
# edit to the manifest, which is how the engines.dsh and dsh.bundle fields
# were silently lost once already.
cp package.json .package.json.pack-backup
sed -i '/^  "private": true,$/d' package.json
restore_private() {
  mv -f .package.json.pack-backup package.json
}
trap restore_private EXIT
npm pack --pack-destination dist

echo
echo "==> built:"
ls -la dist/*.tgz
