/**
 * The desktop attestation key (`dsk-`) that unlocks the relay's free tier.
 *
 * The free rows call `/desktop/v1` on the relay like every other row of the
 * `openlux` route, but the relay's free branch refuses to rest on the `sk-`:
 * a token can be pasted into any client, so "only the desktop pays nothing"
 * needs a second credential. That is a key the console signs for a
 * *signed-in account on this device*
 * (`new-yunwu-api/middleware/desktop_attest_auth.go`), issued against the
 * session cookie — which is why this module lives beside `session.ts` and
 * not beside the `sk-` handling in `tokens.ts`. Switching tokens does not
 * touch it; signing out revokes it.
 *
 * Two facts about the key shape this module relies on:
 *
 *  - it is `dsk-<base64url(payload)>.<base64url(hmac)>`, and the payload is
 *    readable JSON with an `exp` (unix seconds). So renewal needs no second
 *    record: the key says when it dies, and {@link renewAttest} reads that.
 *  - it is a secret, so it lives in the kernel's credential store
 *    (`OPENLUX_FREE_API_KEY`, 0600) — but the kernel sends a provider only
 *    its `apiKey` and its static `headers` (`dsh-llm-pi-ai/lib/index.js:1744`),
 *    and the `apiKey` slot holds the `sk-`. So the sync round mirrors the
 *    stored key into the route's `X-OpenLux-Desktop` header
 *    (`models/sync.ts` `credentialOps`); the store is written here, the
 *    header follows on the next round, which the store's change event starts
 *    (`index.ts` listens on `credentials/reference-updated`).
 *
 * Renewal is silent and early: the console issues 7-day keys, this module
 * asks for a fresh one whenever less than a day is left (startup, sign-in,
 * a periodic check while the app stays open). A renewal that fails is not an
 * outage — the paid rows are untouched — so every failure here is a warning
 * in the log, never an error the user has to dismiss.
 */

import type { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { hostname, platform, userInfo } from 'node:os'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { ACCOUNT_TIMEOUT_MS, asEnvelope, requestJson } from './http.ts'
import { clearSession, readSession, type StoredSession } from './session.ts'

/**
 * Credential slot the `dsk-` is stored under. Ours alone: no provider names it
 * as `apiKeyEnv` (the route's slot carries the `sk-`), so the kernel's models
 * page neither shows nor clears it — sign-out and the signed-out branch of
 * {@link renewAttest} are what empty it.
 */
export const FREE_API_KEY_REF = credentialRef('ECHOFLOW_FREE_API_KEY')

/** Key prefix the relay signs with (`middleware/desktop_attest_auth.go`). */
const KEY_PREFIX = 'dsk-'

/** Renew when less than this is left; the console's TTL is a week by default. */
const RENEW_BEFORE_MS = 24 * 60 * 60_000

/** How often a long-running app re-checks the expiry (renewal itself is rarer). */
export const ATTEST_CHECK_INTERVAL_MS = 6 * 60 * 60_000

/** What one renewal round did, for the log and for the caller's next move. */
export type AttestOutcome =
  /** A key with more than a day left is already stored; nothing sent. */
  | { readonly kind: 'fresh'; readonly expiresAt: number }
  /** The console issued a new key and it is stored. */
  | { readonly kind: 'renewed'; readonly expiresAt: number }
  /** No session here; any leftover key was dropped. */
  | { readonly kind: 'signed-out' }
  /** The console refused the session; it has been dropped like `balance.ts` does. */
  | { readonly kind: 'expired'; readonly message: string }
  /** The station has no free tier (secret unset) or the request failed; the old key, if any, stays. */
  | { readonly kind: 'unavailable'; readonly message: string }

/**
 * A stable id for this install, without storing anything.
 *
 * The console keys its revocation list by `(user, device)`, so the id only has
 * to be stable for one machine and one OS user — which is exactly what these
 * three facts are. Deriving it beats persisting it: a persisted id would be
 * one more slot to reconcile on sign-out and re-install, for no extra
 * precision the console could use. Two installs by the same OS user share an
 * id and therefore a revocation, which is the right answer for the same person.
 * Shape matches the console's `^[A-Za-z0-9._:-]{8,128}$`.
 */
export function deviceId(): string {
  const user = (() => {
    try { return userInfo().username } catch { return '' }
  })()
  return createHash('sha256')
    .update(`${platform()}|${hostname()}|${user}`)
    .digest('hex')
    .slice(0, 40)
}

/**
 * This package's own version, recorded on the key for the console's log.
 *
 * The product version lives in `dsh-plugin-desktop` and is not handed to
 * plugins; this package ships inside the same installer, so its version
 * identifies the build well enough for a log line. Looked up relative to the
 * module — one level up from `lib/index.js` in the bundle, two from
 * `src/account/` in tests — and accepted only when it is this package's
 * manifest, so a wrong guess yields nothing rather than a neighbour's number.
 */
export function pluginVersion(): string | undefined {
  for (const relative of ['../package.json', '../../package.json']) {
    try {
      const parsed = JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8')) as {
        name?: unknown
        version?: unknown
      }
      if (parsed.name === 'echoflowai-tools' && typeof parsed.version === 'string') return parsed.version
    } catch {
      // Not there, or not ours: try the next candidate.
    }
  }
  return undefined
}

/**
 * Read the expiry the key carries, in milliseconds since the epoch.
 * @param key - a `dsk-` key as stored.
 * @returns the expiry, or undefined when the key is not one this module minted.
 */
export function attestExpiry(key: string): number | undefined {
  if (!key.startsWith(KEY_PREFIX)) return undefined
  const payload = key.slice(KEY_PREFIX.length).split('.')[0]
  if (payload === undefined || payload === '') return undefined
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }
    return typeof parsed.exp === 'number' && Number.isFinite(parsed.exp) ? parsed.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

/** The stored key, or undefined when the slot is empty or unreadable. */
export async function readAttest(ctx: Context): Promise<string | undefined> {
  return await ctx.credentials.resolve(FREE_API_KEY_REF)
    .then(hit => hit?.value)
    .then(value => value === undefined || value.trim() === '' ? undefined : value)
    .catch(() => undefined)
}

interface IssueData {
  readonly key?: unknown
  readonly expires_at?: unknown
  readonly enabled?: unknown
}

/**
 * Make sure this device holds a live `dsk-` for the signed-in account.
 *
 * Idempotent and cheap when nothing needs doing: a key with more than
 * {@link RENEW_BEFORE_MS} left costs one credential read. `force` skips that
 * check — used right after sign-in, where the stored key (if any) belongs to
 * whoever was signed in before.
 * @param ctx - host context.
 * @param appVersion - what to record on the key, for the console's log.
 * @param force - renew even when the stored key is still fresh.
 * @param signal - caller cancellation.
 * @returns what happened; never throws.
 */
export async function renewAttest(
  ctx: Context,
  appVersion: string | undefined,
  force = false,
  signal?: AbortSignal,
): Promise<AttestOutcome> {
  let session: StoredSession | undefined
  try {
    session = await readSession(ctx)
  } catch {
    return { kind: 'unavailable', message: '读取登录状态失败' }
  }
  if (session === undefined) {
    // A key for a signed-out account must not linger: it would keep the free
    // route working for nobody the UI can name.
    await ctx.credentials.unset(FREE_API_KEY_REF).catch(() => {})
    return { kind: 'signed-out' }
  }

  if (!force) {
    const current = await readAttest(ctx)
    const expiresAt = current === undefined ? undefined : attestExpiry(current)
    if (expiresAt !== undefined && expiresAt - Date.now() > RENEW_BEFORE_MS) {
      return { kind: 'fresh', expiresAt }
    }
  }

  let response: Response
  let body: unknown
  try {
    ({ response, body } = await requestJson(
      ctx,
      `${session.baseUrl}/api/desktop/attest`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: session.cookie,
          'New-Api-User': String(session.userId),
        },
        body: JSON.stringify({
          device_id: deviceId(),
          ...appVersion === undefined ? {} : { app_version: appVersion.slice(0, 32) },
        }),
      },
      ACCOUNT_TIMEOUT_MS,
      signal,
    ))
  } catch (error: unknown) {
    return { kind: 'unavailable', message: error instanceof Error ? error.message : String(error) }
  }

  // The same rule `balance.ts` applies: a 401 is the console refusing the
  // session, and replaying a refused cookie on every later round helps nobody.
  if (response.status === 401) {
    await clearSession(ctx).catch(() => {})
    await ctx.credentials.unset(FREE_API_KEY_REF).catch(() => {})
    return { kind: 'expired', message: '登录已过期' }
  }

  const envelope = asEnvelope<IssueData>(body)
  if (!response.ok || envelope.success !== true || envelope.data === undefined) {
    // 503 is the station saying it has no free tier at all (no signing
    // secret). Worth a distinct sentence in the log, but the same outcome.
    const message = envelope.message?.trim()
      || (response.status === 503 ? '该站点未开放桌面端免费模型' : `签发桌面凭据失败（HTTP ${response.status}）`)
    return { kind: 'unavailable', message }
  }
  const key = envelope.data.key
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) {
    return { kind: 'unavailable', message: '桌面凭据格式异常' }
  }

  try {
    await ctx.credentials.set(FREE_API_KEY_REF, key)
  } catch (error: unknown) {
    const text = error instanceof Error ? error.message : String(error)
    return {
      kind: 'unavailable',
      message: text.includes(FREE_API_KEY_REF)
        ? `环境变量 ${FREE_API_KEY_REF} 正在占用免费凭据位置`
        : `保存桌面凭据失败：${text}`,
    }
  }
  const expiresAt = attestExpiry(key)
    ?? (typeof envelope.data.expires_at === 'number' ? envelope.data.expires_at * 1000 : Date.now())
  return { kind: 'renewed', expiresAt }
}

/**
 * Revoke this device's key on the console and drop it here.
 *
 * Called on sign-out *before* the session is cleared, because the revocation
 * rides the session. The console half is best-effort — a device that cannot
 * reach the console still loses the key locally, and the key expires on its
 * own within the week either way — so this never throws.
 * @param ctx - host context.
 * @param signal - caller cancellation.
 */
export async function revokeAttest(ctx: Context, signal?: AbortSignal): Promise<void> {
  let session: StoredSession | undefined
  try {
    session = await readSession(ctx)
  } catch {
    session = undefined
  }
  const stored = await readAttest(ctx)
  if (session !== undefined && stored !== undefined) {
    try {
      await requestJson(
        ctx,
        `${session.baseUrl}/api/desktop/attest?device_id=${encodeURIComponent(deviceId())}`,
        {
          method: 'DELETE',
          headers: { Cookie: session.cookie, 'New-Api-User': String(session.userId) },
        },
        ACCOUNT_TIMEOUT_MS,
        signal,
      )
    } catch (error: unknown) {
      ctx.logger.warn(`openlux: could not revoke the desktop credential on the console (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  await ctx.credentials.unset(FREE_API_KEY_REF).catch(() => {})
}
