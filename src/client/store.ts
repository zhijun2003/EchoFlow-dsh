/**
 * One account view shared by the sign-in step and the sidebar row.
 *
 * Both surfaces read the same facts and each can change them — signing in from
 * the step has to light up the sidebar, signing out from the sidebar has to
 * bring the step back — so the state lives outside React and both bind to it
 * through the kernel's `bindSnapshotSelector`, the way ui-settings-models
 * binds its page store.
 */

import type { AccountHostCaller } from './types.ts'

/** A balance ready to render, as the host formatted it. */
export interface Balance {
  readonly quota: number
  readonly display: string
  /** Below one currency unit; the row warns rather than just printing it. */
  readonly low: boolean
  readonly usedDisplay: string
  readonly group: string
  readonly username: string
  readonly userId: number
  readonly requestCount: number
  readonly fetchedAt: number
}

/**
 * How much to trust the number, straight from the host.
 *
 * Distinct arms rather than a value-or-nothing pair because a failed read and
 * a spent account render identically once collapsed, and of those two readings
 * the one the user acts on is the wrong one. `signedOut` (no session at all)
 * and `expired` (the console refused a session we held) are likewise separate:
 * painting an expiry warning over a merely signed-out account was the exact
 * bug this split removed (2026-09-01).
 */
export type BalanceStatus = 'ok' | 'stale' | 'signedOut' | 'expired' | 'unavailable'

interface BalanceSnapshot {
  readonly status: BalanceStatus
  readonly balance?: Balance
  readonly message?: string
}

interface HostAccountStatus {
  readonly signedIn: boolean
  readonly userId?: number
  readonly apiKeyConfigured: boolean
  /** Console origin this machine talks to — the session's, else the configured one. */
  readonly baseUrl: string
}

/** The free tier's allowance, as the host read it (`account/free-tier.ts`). */
export interface FreeTierUsage {
  readonly enabled: boolean
  readonly models: readonly string[]
  readonly perMinute: number
  readonly perDay: number
  readonly usedToday: number
  readonly remainingToday: number
  readonly resetAt: number
  readonly fetchedAt: number
}

interface FreeTierSnapshot {
  readonly status: 'ok' | 'stale' | 'absent' | 'unavailable'
  readonly usage?: FreeTierUsage
  readonly message?: string
}

/** Everything both surfaces need, in one immutable snapshot. */
export interface AccountView {
  /** False until the first read lands; the row draws nothing before that. */
  readonly read: boolean
  readonly signedIn: boolean
  readonly apiKeyConfigured: boolean
  readonly balanceStatus: BalanceStatus | undefined
  readonly balance: Balance | undefined
  readonly message: string | undefined
  /**
   * The console refused a session this app was holding. Sticky rather than
   * derived from `balanceStatus`: a 401 drops the dead session on the host, so
   * the very next refresh already reports plain `signedOut`, while the user
   * still deserves to be told why they were signed out. Cleared when a
   * sign-in or sign-out settles the account, or a read comes back `ok` — the
   * lifecycle of WorkBuddy's `isAuthExpired` / `clearAuthExpired`
   * (asar `auth-expired-detector.ts`, 解包核对 2026-09-01).
   */
  readonly authExpired: boolean
  /** A read is in flight; any previous value keeps showing under it. */
  readonly fetching: boolean
  /**
   * Where the account lives on the web, so a surface can offer the console
   * itself: topping up, invoices, and the request log are all there and none of
   * them belong in this app. Undefined only before the first read.
   */
  readonly baseUrl: string | undefined
  /**
   * The free tier's allowance for this account, when the station has one and
   * this device holds the desktop credential. Undefined otherwise — the page
   * then shows no free-tier line at all, rather than a zero.
   */
  readonly freeTier: FreeTierUsage | undefined
}

const EMPTY: AccountView = {
  read: false,
  signedIn: false,
  apiKeyConfigured: false,
  balanceStatus: undefined,
  balance: undefined,
  message: undefined,
  authExpired: false,
  fetching: false,
  baseUrl: undefined,
  freeTier: undefined,
}

/** Observable account state; one instance per plugin activation. */
export class AccountStore {
  private view: AccountView = EMPTY
  private readonly listeners = new Set<() => void>()
  private generation = 0

  constructor(private readonly callHost: AccountHostCaller) {}

  /** Current snapshot; stable identity between changes, as uSES requires. */
  getSnapshot = (): AccountView => this.view

  /**
   * Subscribe to changes.
   * @param listener - called after every committed change.
   * @returns the unsubscriber.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Re-read sign-in state and balance.
   * @param force - bypass the host's refresh throttle (an explicit refresh).
   */
  refresh = async (force = false): Promise<void> => {
    const generation = ++this.generation
    this.commit({ fetching: true })
    const [status, balance, freeTier] = await Promise.all([
      this.callHost<HostAccountStatus>('status', {}),
      this.callHost<BalanceSnapshot>('balance', { force }),
      this.callHost<FreeTierSnapshot>('free-tier', { force }),
    ])
    if (generation !== this.generation) return
    this.commit({
      read: true,
      fetching: false,
      ...status.ok
        ? {
            signedIn: status.value.signedIn,
            apiKeyConfigured: status.value.apiKeyConfigured,
            baseUrl: status.value.baseUrl,
          }
        : {},
      // `absent` is a definite "nothing here" and clears the line; a failed
      // read keeps whatever was showing, the same rule the balance follows.
      freeTier: freeTier.ok
        ? freeTier.value.status === 'absent'
          ? undefined
          : freeTier.value.usage ?? this.view.freeTier
        : this.view.freeTier,
      ...balance.ok
        ? {
            balanceStatus: balance.value.status,
            // A stale read keeps the previous number, which is the whole
            // point of that arm — only overwrite when one arrived.
            balance: balance.value.balance ?? this.view.balance,
            message: balance.value.message,
            // Set on the refusal, cleared by a working session; every other
            // arm keeps it, because `signedOut` right after a 401 is the same
            // episode (the host dropped the dead session in between).
            authExpired: balance.value.status === 'expired'
              ? true
              : balance.value.status === 'ok' ? false : this.view.authExpired,
          }
        : { balanceStatus: 'unavailable' as const, message: balance.error.message },
    })
  }

  /**
   * Drop the session, the key, and the cached balance, then re-read.
   *
   * The re-read is not ceremony: an API key can also come from the
   * environment, and after signing out that is exactly the case worth showing
   * honestly rather than assuming the app is now keyless.
   */
  signOut = async (): Promise<void> => {
    this.generation += 1
    await this.callHost('sign-out', {})
    this.view = { ...EMPTY, read: true }
    this.emit()
    await this.refresh(true)
  }

  /** A sign-in just succeeded somewhere; pull the new facts. */
  signedIn = async (): Promise<void> => {
    this.generation += 1
    this.view = {
      ...this.view,
      balance: undefined,
      balanceStatus: undefined,
      message: undefined,
      authExpired: false,
      fetching: false,
      freeTier: undefined,
    }
    await this.refresh(true)
  }

  private commit(patch: Partial<AccountView>): void {
    this.view = { ...this.view, ...patch }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
