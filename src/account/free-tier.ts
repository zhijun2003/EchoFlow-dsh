/**
 * The free tier's remaining allowance, for the account page.
 *
 * `GET /desktop/v1/free-tier/status` is the one route that reports it, and it
 * sits behind the same `dsk-` gate as the free chat route itself
 * (`new-yunwu-api/controller/desktop_free_status.go`) — deliberately not
 * behind the limiter, so asking does not spend a call. The limit is per
 * account, not per token (`docs/desktop-free-models-plan.md` §5.2), which is
 * why this reads the attestation key and not the `sk-`.
 *
 * Same shape of caution as `balance.ts`: a failed read must not print `0`
 * remaining, because "used up" is the one reading a user acts on.
 */

import type { Context } from '@deepseek-ai/cordis'
import { readAttest } from './attest.ts'
import { asEnvelope, BALANCE_TIMEOUT_MS, requestJson } from './http.ts'
import { readSession } from './session.ts'

/** Refresh throttle, shared with the balance line's rhythm. */
const FRESH_TTL_MS = 30_000

/** The allowance as the console reports it. */
export interface FreeTierUsage {
  readonly enabled: boolean
  /** Real model names this account may call for free (already reachability-filtered). */
  readonly models: readonly string[]
  readonly perMinute: number
  readonly perDay: number
  readonly usedToday: number
  readonly remainingToday: number
  /** Unix milliseconds when the daily counter resets. */
  readonly resetAt: number
  readonly fetchedAt: number
}

/** A read of the allowance, and how much to trust it. */
export type FreeTierSnapshot =
  | { readonly status: 'ok'; readonly usage: FreeTierUsage }
  | { readonly status: 'stale'; readonly usage: FreeTierUsage; readonly message: string }
  /** No session, or no `dsk-` yet (the station may have no free tier). */
  | { readonly status: 'absent' }
  | { readonly status: 'unavailable'; readonly message: string }

interface StatusData {
  readonly enabled?: unknown
  readonly free_models?: unknown
  readonly per_user_rpm?: unknown
  readonly per_user_daily_requests?: unknown
  readonly used_today?: unknown
  readonly remaining_today?: unknown
  readonly daily_reset_at?: unknown
}

function int(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

/** Per-process allowance cache; the account page is the only consumer. */
export class FreeTierReader {
  private last: FreeTierUsage | undefined
  private inFlight: { generation: number; promise: Promise<FreeTierSnapshot> } | undefined
  private generation = 0

  constructor(private readonly ctx: Context) {}

  /**
   * Read the allowance, coalescing concurrent asks and honouring the throttle.
   * @param force - user pressed refresh; skip the throttle but still coalesce.
   * @param signal - caller cancellation.
   */
  async read(force = false, signal?: AbortSignal): Promise<FreeTierSnapshot> {
    if (!force && this.last !== undefined && Date.now() - this.last.fetchedAt < FRESH_TTL_MS) {
      return { status: 'ok', usage: this.last }
    }
    const generation = this.generation
    if (this.inFlight?.generation === generation) return this.inFlight.promise
    const promise = this.fetch(generation, signal).finally(() => {
      if (this.inFlight?.promise === promise) this.inFlight = undefined
    })
    this.inFlight = { generation, promise }
    return promise
  }

  /** Drop the cached value so the next account does not see the previous one's. */
  forget(): void {
    this.generation += 1
    this.last = undefined
    this.inFlight = undefined
  }

  private async fetch(generation: number, signal?: AbortSignal): Promise<FreeTierSnapshot> {
    const [session, key] = await Promise.all([
      readSession(this.ctx).catch(() => undefined),
      readAttest(this.ctx),
    ])
    if (session === undefined || key === undefined) return { status: 'absent' }

    let response: Response
    let body: unknown
    try {
      ({ response, body } = await requestJson(
        this.ctx,
        `${session.baseUrl}/desktop/v1/free-tier/status`,
        { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
        BALANCE_TIMEOUT_MS,
        signal,
      ))
    } catch (error: unknown) {
      return this.staleOr(error instanceof Error ? error.message : String(error))
    }
    if (generation !== this.generation) {
      return { status: 'unavailable', message: '账户已切换，旧结果已丢弃' }
    }
    // A refused key is not this module's to repair — the attestation round
    // renews it — so it reads as "nothing to show" rather than as an outage.
    if (response.status === 401) return { status: 'absent' }

    const envelope = asEnvelope<StatusData>(body)
    if (!response.ok || envelope.success !== true || envelope.data === undefined) {
      return this.staleOr(envelope.message?.trim() || `读取免费额度失败（HTTP ${response.status}）`)
    }
    const data = envelope.data
    const models = Array.isArray(data.free_models)
      ? data.free_models.filter((item): item is string => typeof item === 'string' && item !== '')
      : []
    const usage: FreeTierUsage = {
      enabled: data.enabled === true,
      models,
      perMinute: int(data.per_user_rpm),
      perDay: int(data.per_user_daily_requests),
      usedToday: int(data.used_today),
      remainingToday: Math.max(0, int(data.remaining_today)),
      resetAt: int(data.daily_reset_at) * 1000,
      fetchedAt: Date.now(),
    }
    this.last = usage
    return { status: 'ok', usage }
  }

  private staleOr(message: string): FreeTierSnapshot {
    if (this.last !== undefined) return { status: 'stale', usage: this.last, message }
    return { status: 'unavailable', message }
  }
}
