#!/usr/bin/env python3
"""Make the published dsh-client-connection's route registration survive.

The published `@deepseek-ai/dsh-client-connection` (0.2.1-rc.2, 0.2.1-rc.1,
0.2.1-alpha.5 — every published 0.2.1 line) registers an RPC route with:

    return owner.effect(() => owner.webServer.register(route), ...)

`owner` is the connection plugin's own context (`this.ctx`, from `get rpc()`),
and that context declares `inject: ["credentials"]` only. Reaching
`owner.webServer` as a property therefore throws:

    cannot get property "webServer" without inject

which takes down every plugin that calls `connection.rpc.handle(...)`. The
newer build declares `inject: ["webServer"]` and is unaffected.

`owner.get("webServer")` resolves through a path that does not go through the
property guard, and the file already uses that form in four other places
(`this.owner.get("webServer")?.protocol`), so this patch makes the one outlier
match its own file.

Usage:
    python3 patch-dsh-connection-webserver.py <path-to>/dsh-client-connection/lib/index.js
"""
import io
import sys

OLD = 'return owner.effect(() => owner.webServer.register(route), `client-connection: ${channel} rpc channel`);'
NEW = 'return owner.effect(() => owner.get("webServer")?.register(route), `client-connection: ${channel} rpc channel`);'


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    source = io.open(path, encoding='utf-8').read()
    if OLD not in source:
        # Either already patched, or a build where the line reads differently.
        print('already patched (or the line is not present)')
        return 0
    io.open(path, 'w', encoding='utf-8').write(source.replace(OLD, NEW))
    print(f'patched {path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
