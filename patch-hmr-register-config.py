#!/usr/bin/env python3
"""Add `registerConfig` to the published cordis-plugin-hmr.

The published `@deepseek-ai/cordis-plugin-hmr` (1.0.20) has no
`registerConfig`, but `dsh-app-boot` needs it to watch the user patch layer:

    const register = hmr.registerConfig(filename, async () => { ... })
    await register

Without it the boot fails with

    TypeError: hmr.registerConfig is not a function

This adds the method to the plugin's Hmr class, using the chokidar `watch`
the class already imports. It is idempotent: a second run finds the method
and does nothing.

Usage:
    python3 patch-hmr-register-config.py <path-to>/cordis-plugin-hmr/lib/index.js
"""
import io
import sys

ANCHOR = "\t\tgetOuterStack = () => [];\n\t\tasync getLinked(url) {"

ADDITION = '''\t\tgetOuterStack = () => [];
\t\t/**
\t\t* Register a configuration file to watch. The callback runs when the file
\t\t* changes; the returned promise resolves to a disposer.
\t\t*
\t\t* Added for compatibility with dsh-app-boot, which watches the user
\t\t* patch layer through this method. The published plugin reports module
\t\t* reloads under its `root` config instead, which does not cover a data
\t\t* file such as a patch list.
\t\t*
\t\t* Uses the chokidar watch this class already imports.
\t\t*/
\t\tasync registerConfig(filename, onChange) {
\t\t\tconst watchers = this.__configWatchers ??= new Map();
\t\t\twatchers.get(filename)?.close();
\t\t\tconst watcher = watch(filename, { ignoreInitial: true }, () => {
\t\t\t\tvoid onChange();
\t\t\t});
\t\t\twatchers.set(filename, watcher);
\t\t\treturn async () => {
\t\t\t\tawait watcher.close();
\t\t\t\twatchers.delete(filename);
\t\t\t};
\t\t}
\t\tasync getLinked(url) {'''


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    source = io.open(path, encoding='utf-8').read()
    if 'registerConfig' in source:
        print('already patched')
        return 0
    if source.count(ANCHOR) != 1:
        print(f'anchor not found in {path}')
        return 1
    io.open(path, 'w', encoding='utf-8').write(source.replace(ANCHOR, ADDITION))
    print(f'patched {path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
