# Mounting this plugin into a dsh profile

Verified against this machine's live install on 2026-10-20. Every claim below
was checked by reading the installed files, not assumed.

## How dsh resolves plugins

Three planes, in order:

1. **Bundles** — `dsh.profile.bundles` in the profile's `package.json`. The
   only plane that *adds* a plugin to the composition.
2. **Profile patch** — `<profile>/cordis.patch.yml`, applied after every
   bundle layer. Can reconfigure, disable, or `insert:` a row, but a row it
   inserts must name a package that is already resolvable.
3. **`--patch` overlay** — highest priority, passed on the command line.

Modules resolve through Node's normal parent-directory walk:
`<profile>/node_modules` first, then `$DSH_HOME/profiles/node_modules`
(the flat fallback), then upward.

## The flat fallback is self-healing — do not edit it

`dsh-app-boot` runs `healProfilesModuleFallback` on every boot. It BFS-walks
the app manifest's `dependencies` + `peerDependencies` closure and calls
`ensureSymlink(link, target)` for each:

```js
if (readlinkSync(link) === target) return   // correct: keep
unlinkSync(link)                            // wrong: delete
symlinkSync(target, link, "junction")       // recreate, pointing at the install
```

A real directory where it expects a symlink throws. So pointing
`profiles/node_modules/openlux-plugin-account` at your own copy is undone at
the next start — and replacing the link with a directory is a hard error.

`resolveBundleDir` in the same package states the contract in its doc comment:
*"installation-first order ... every in-box bundle always comes from the same
installation as the running dsh, never from a profile-local copy."*

## What the desktop profile actually looks like here

`~/.dsh/profiles/desktop` is a real pnpm workspace (`nodeLinker: hoisted`):

- 9 bundles in `dsh.profile.bundles`
- 10 packages in its own `node_modules` (real directories: `dsh-ops`,
  `dsh-wsl-tool`, `dsh-free-search`, `dshmarket`, ...)
- `hoistedDependencies` is **empty** and `node_modules/.pnpm/node_modules` is
  **empty**

That last pair is the important one: this profile holds **no copy** of the
~198 `@deepseek-ai/*` packages. It resolves them entirely from the flat
fallback, whose symlinks are WSL-native (`st_mode 0o120777`) with `/mnt/c/...`
targets. Windows Node follows them, which is why the running session works at
all. WSL cannot follow them, so nothing in this environment can be verified by
resolving a `@deepseek-ai/*` module from inside WSL — a MODULE_NOT_FOUND there
is an artifact of the boundary, not a broken install.

## Recommended: profile-local bundle

Add the plugin to the profile's own `node_modules` and to
`dsh.profile.bundles`. Node walks `<profile>/node_modules` before the flat
fallback, so the profile copy wins, and `healProfilesModuleFallback` never
touches it because it only manages the flat fallback directory.

Two ways to place the package, with different tradeoffs:

### A. `pnpm add file:<path>` — a copy

Verified working (pnpm 10.20.0, 277 packages resolved, plugin entry loads and
exports its 6 symbols). But pnpm **copies** into `.pnpm/file+...`: confirmed by
inode comparison and by a file added to the source not appearing in the
installed copy. So every source edit needs a re-run of `pnpm install`.

### B. symlink directly into `<profile>/node_modules` — live

Live edits, no reinstall. The symlink target must be in the form Windows Node
reads. A WSL-created link with a `/home/...` target is readable from WSL but
**not verified** to be followable by Windows Node — the flat fallback's links
work because their targets are `/mnt/c/...` paths, which is a different case.

Use B if you are iterating; use A if you want the install to survive a
`pnpm install` run by something else.

## Mounting as a bundle

`cordis.patch.yml` cannot introduce a plugin from nothing — it can only
reconfigure or disable rows, or `insert:` a row naming an already-resolvable
package. So the package must be listed in `dsh.profile.bundles`:

```json
"dsh": {
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "...",
      "echoflowai-tools"
    ]
  }
}
```

The bundle name is what `cordis-plugin-loader` passes to `import()`
(`this.parent.tree.import(this.options.name, ...)`), resolved by Node's normal
rules. It does **not** have to match the package's `name` field — but keeping
them equal avoids confusion, and this package is already renamed to
`echoflowai-tools`.

## Peer dependencies

The package declares 41 `peerDependencies`, all satisfiable from public npm.
This profile sets `autoInstallPeers: false`, so install them explicitly or let
them resolve from the flat fallback.

Known upstream warning, harmless: `@deepseek-ai/cordis-plugin-loader@1.0.6`
and `cordis-plugin-include@1.0.10` ask for `@deepseek-ai/cordis@~4.0.5` while
the installed cordis is `4.0.1`. That is upstream's own declaration, not
something this fork introduced.

## Reverting

- Option A: `pnpm remove echoflowai-tools` in the profile, drop the bundle
  entry.
- Option B: delete `<profile>/node_modules/echoflowai-tools`, drop the bundle
  entry.

The flat fallback is untouched by either, so OpenLux Desktop keeps working.
