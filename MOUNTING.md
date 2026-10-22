# Installing this plugin into a dsh profile

Read DEVELOPMENT.md first: the environment is WSL-only, and `DSH_HOME`
must point at the WSL-local home so a dsh command never writes the Windows
profile.

## The supported way

```bash
cd /home/zhijun/WorkSpace/dsh/openlux-plugin-account
./build-tarball.sh

export DSH_HOME=/home/zhijun/.dsh
npx @deepseek-ai/dsh plugin --profile echoflow add ./dist/echoflowai-tools-0.1.0.tgz
```

`dsh plugin add` forwards to pnpm in the profile directory, installs the
tarball, and adds the package to the profile's `dsh.profile.bundles` — but
only if the package declares itself a bundle. Three manifest fields make
that work:

| Field | Value | Why |
| --- | --- | --- |
| `dsh.bundle.patch` | `"./cordis.patch.yml"` | tells dsh this package is a bundle layer, not a plain dependency |
| `engines.dsh` | `">=0.2.1-rc.2 <0.3.0"` | decides compatibility on its own; the peers are ignored when this is present |
| `files` | includes `"cordis.patch.yml"` | the patch `dsh.bundle` points at has to actually ship |

Without the first, the install succeeds but warns
`declares no dsh.bundle — installed as a plain dependency, not a profile
layer`, and the plugin never enters the plugin tree.

`run-dsh-wsl.sh` does all of this: it pins `DSH_HOME`, creates the profile
from the shipped `web` template, builds the tarball, installs it, and boots.

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

## Do NOT combine a bundle patch with a manual insert

The package ships its own `cordis.patch.yml`, which already `insert:`s the
plugin. Adding the same plugin again by appending a row to the profile's
patch file loads it twice and fails with `duplicate loader entry id` — the
tutorial's pitfall #6. Pick one:

- **Bundle route (recommended):** `dsh plugin add` installs the package and
  composes it from the package's own patch. Do not add a manual row.
- **Manual route:** install the tarball, add the package to
  `dsh.profile.bundles`, and add the row yourself. Do not do both.

## Version compatibility

`dsh-app-boot`'s `unmetRequirements` decides this:

- if `engines.dsh` is present, **it alone decides** and every
  `peerDependencies` entry is ignored;
- otherwise every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer must
  satisfy the runtime version. `workspace:^`, `workspace:~` and
  `workspace:*` are the three ranges that resolve to the current runtime.

This package declares `engines.dsh`, which is why it installs against
`0.2.1-rc.2`.

The peers are left as upstream shipped them on purpose: their version
strings are an unreplaced build-time placeholder (`0.1.1-rc.2`),
which no semver range can satisfy — `semver.satisfies` returns false for it
against every runtime, including the one upstream itself ships against.
Rewriting the peers to a concrete version would silently pin the plugin to
one release; `engines.dsh` expresses the same thing without that.

Do **not** reach for `dsh plugin allow-version ... --accept-risk` to get
past a mismatch. It writes `<profile>/compatibility.json`, and DSH's own
warning for it says it "may break the application or corrupt data".

## Verifying the install before you start dsh

The tutorial's pitfall #5: confirm the plugin actually entered the plugin
tree before launching. Use the dump-config step — search its output for
`echoflow`:

```bash
npx @deepseek-ai/dsh --profile echoflow --dump-config | grep -A3 echoflow
```

Expected:

```
# == echoflowai-tools
- id: echoflow-account
  name: echoflowai-tools
  config:
    baseUrl: https://api.echoflowai.cc
```

If nothing matches, the bundle was not composed — most often because
`dsh.bundle.patch` is missing from package.json (the package then stays a
plain npm dependency) or because the plugin was inserted twice
(`duplicate loader entry id`).

## Peer dependencies

The package declares 41 `peerDependencies`, all satisfiable from public npm.
`dsh plugin add` installs them through pnpm, so nothing extra is needed.

Known upstream warning, harmless: `@deepseek-ai/cordis-plugin-loader@1.0.6`
and `cordis-plugin-include@1.0.10` ask for `@deepseek-ai/cordis@~4.0.5` while
the installed cordis is `4.0.1`. That is upstream's own declaration, not
something this fork introduced.

## Reverting

```bash
npx @deepseek-ai/dsh plugin --profile echoflow remove echoflowai-tools
```

The profile's `package.json` and `cordis.patch.yml` are rewritten by the
remove; if you want the profile back exactly as it was, keep a copy before
installing.

## A note on npm

`npm install <tarball>` against this package exits 1 with an **empty** error
block on npm 11: it resolves the tarball as a `file:` spec, hits the 41
peers, and dies mid-resolution with no `ERESOLVE` line. The same tarball
installs fine from a plain directory, which takes a different code path, so
the package is sound — only the flag is needed:

```bash
npm install echoflowai-tools-0.1.0.tgz --legacy-peer-deps
```

pnpm does not need the flag. `dsh plugin add` uses pnpm, so the supported
path above is unaffected.
