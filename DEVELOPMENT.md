# Development environment rules for echoflowai-tools

## Hard rule: WSL only

Everything about building and testing this plugin happens **inside WSL**,
under `/home/zhijun/WorkSpace/dsh/`. The Windows installation of DeepSeek
Harness is not a development target.

Two reasons, both learned the hard way on 2026-10-22:

1. **`DSH_HOME` points at the Windows profile.** The environment variable
   resolves to `/mnt/c/Users/zhiju/.dsh`, so a `dsh` command run from WSL
   boots and *writes* the Windows profile. The WSL-local home
   `/home/zhijun/.dsh` exists and is the one to use.
2. **Windows Node cannot read WSL paths.** `fs.statSync` on
   `/.../file` fails with `UNKNOWN`, and passing a
   `/mnt/c/...` path to `node.exe` makes it resolve the string relative to
   the UNC cwd and fail with `MODULE_NOT_FOUND`. A tarball has to be copied
   to a local Windows path before Windows tooling can touch it.

Nothing gets installed globally on Windows: no `npm install -g`, no
`pnpm` into the Windows PATH, no new packages under
`%APPDATA%\npm`. A stray `npm install -g pnpm` in the course of this work
was reverted.

## Layout

```
/home/zhijun/WorkSpace/dsh/
├── openlux-plugin-account/     this repo (git)
└── ~/.dsh/                     WSL-local DSH home (isolated)
```

## Build

```bash
cd /home/zhijun/WorkSpace/dsh/openlux-plugin-account
./build-tarball.sh
```

Runs typecheck, build, the capability-check test, then `npm pack`. Output:
`dist/echoflowai-tools-0.1.0.tgz`.

## Test in an isolated DSH

Use the WSL-local DSH with an explicit `DSH_HOME`, and a profile name that
is not `desktop` — the CLI refuses that one:

```bash
export DSH_HOME=/home/zhijun/.dsh
~/.local/share/dsh-cli-secret/node_modules/.bin/dsh --profile echoflow
```

Use the CLI at that fixed path, not `npx @deepseek-ai/dsh`: the profile's
bundle dependencies (`@deepseek-ai/dsh-base`, `dsh-web-app`) resolve from
the CLI package's own `node_modules`, and npx runs from a temp cache whose
path changes between invocations.

`run-dsh-wsl.sh` does all of it: pins `DSH_HOME`, installs the matching CLI
if needed, patches the HMR gap, creates the profile from the shipped `web`
template, builds and installs the tarball, and boots.

`desktop` is rejected by `rejectElectronProfile` in the CLI
(`profile "desktop" is managed exclusively by the Electron application`).
Do not work around that by editing the Windows profile: the version
exemption it would need is exactly the thing DSH warns can corrupt data.

## The runtime this plugin is built against

The published `@deepseek-ai/dsh` (0.2.1-rc.2) **cannot load this plugin**:
its `dsh-settings` has no `settingsNamespace` export, which the plugin
imports, so the entry fails to load with a `SyntaxError`.

The peer versions upstream declares, `0.1.1-rc.2`, are not
placeholders — they are a real version published on npm, and the version the
plugin's source was written against. `npm view @deepseek-ai/dsh-settings
versions` lists it right after `0.1.1-rc.1`.

So the runtime is installed as:

```bash
npm install @deepseek-ai/dsh@0.1.1-rc.2
```

`run-dsh-wsl.sh` does that into `~/.local/share/dsh-cli-secret` and uses it
from then on.

Two further gaps in the published tree, worked around in the profile and in
the CLI install:

- `dsh-base` ships its `hmr` row **disabled**, and the boot path's
  on-demand creation of that service is not awaited before the watcher asks
  for it, so the boot fails with *"user patch-layer watching requires the
  Cordis HMR service"*. The profile's `cordis.patch.yml` enables the row
  dsh-base already defines.
- The published `cordis-plugin-hmr` (1.0.20) has **no `registerConfig`**,
  which the newer app-boot needs to watch the user patch layer; without it
  the boot fails with *"hmr.registerConfig is not a function"*.
  `patch-hmr-register-config.py` adds the method to the plugin's Hmr class
  using the chokidar watch the class already imports. It is idempotent, and
  `run-dsh-wsl.sh` applies it on every start.

A shim plugin was tried for the second gap and removed — it could not win
the race against the boot path, which creates the service after the tree
settles and reads the method immediately.

## Version compatibility

DSH refuses to load a plugin whose dsh requirements do not match the
running runtime:

```
Plugin echoflowai-tools@0.1.0 is incompatible with dsh 0.2.1-rc.2
```

`dsh-app-boot`'s `unmetRequirements` decides this:

- if `engines.dsh` is present, **it alone decides** and every
  `peerDependencies` entry is ignored;
- otherwise every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer must
  satisfy the runtime version. `workspace:^`, `workspace:~` and
  `workspace:*` are the three ranges that resolve to the current runtime.

This package declares `engines.dsh: ">=0.2.1-rc.2 <0.3.0"`, which is the
correct mechanism and the reason `dsh plugin add` now accepts it.

The peers are left as upstream shipped them on purpose: their version
strings are an unreplaced build-time placeholder (`0.1.1-rc.2`),
which no semver range can satisfy — `semver.satisfies` returns false for it
against every runtime, including the one upstream itself ships against.
Rewriting the peers to a concrete version would silently pin the plugin to
one release; `engines.dsh` expresses the same thing without that.

Do **not** reach for `dsh plugin allow-version ... --accept-risk` to get
past this. It writes `<profile>/compatibility.json` and DSH's own warning
for it says it "may break the application or corrupt data".

## Gotchas found while setting this up

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm install <tarball>` exits 1, no message | npm 11 peer-conflict output is empty; 41 peers | `--legacy-peer-deps` |
| `MODULE_NOT_FOUND` for `@deepseek-ai/*` in WSL | the flat fallback's symlinks are WSL-native with `/mnt/c` targets, unreadable from WSL | not a broken install; test from a profile that has the packages |
| `Cannot find package config \\?\UNC\...` | Windows node resolving a WSL path | copy the script to a Windows-local path, or use WSL node |
| `dsh: skipping profile bundle "..."` | version incompatibility | see above |
| `duplicate loader entry id` | the package's own `cordis.patch.yml` inserts it, and a manual insert added it again | pick one route; see MOUNTING.md |
| `npm pack` fails on `private: true` | npm refuses to pack a private package | the build script removes that one line and restores it after |
