/**
 * Account page: who you are, what is left, and the two ways out — the web
 * console, and signing out.
 *
 * ## Why the detail moved out of a popover
 *
 * The sidebar foot now carries one row (`AccountTrigger`), and that row is the
 * kernel's Settings button — the click is the kernel's and opens the panel. So
 * the four balance states, the refresh, and sign-out live here instead, and
 * this section registers first in the nav so the panel opens on it: the shell
 * falls back to `rows[0]` while nothing is selected (`ui-settings-general`
 * SettingsPanel: `rows.find(...) ?? rows[0]?.id`). Pressing the account row
 * therefore still shows the balance in one click, the way the popover did.
 *
 * ## Why this is an identity row, a money summary, and one service row
 *
 * WorkBuddy settles the product shape — identity is the entrance to account
 * preferences — but it has no account page worth copying here. The visual
 * language therefore comes from this shell: the settings column's 720px
 * measure, the models page's radius-12 bordered cards, and quiet ghost rows.
 *
 * The first two cuts each failed in the opposite direction. Four General-style
 * rows stranded short numbers at the far edge of a wide page. A narrow
 * 480px vertical card then became an island in the top-left and made a black
 * button louder than the balance. This version uses the real content width:
 * identity anchors the page, available balance gets the broad side of one
 * horizontal summary, and cumulative spend plus request count share the
 * quieter side. The web console is a descriptive service row, not a black CTA;
 * sign-out remains the least prominent action.
 *
 * ## The third pass: density, ownership, and a way out of a low balance
 *
 * - The identity row owns sign-out (trailing, outline-sm): the thing being
 *   signed out of is that row, not the page corner it used to float in. Its
 *   second line shows the account's HOST (from the status `baseUrl`) instead
 *   of a tautological 「已登录」 — a channel build then names its own domain.
 * - The avatar takes the kernel's deepseek blue scale as a gradient
 *   (`--dsw-static-deepseek-400 → 600`, white initial). Kernel accent, not
 *   OpenLux brand colors, on purpose: channel builds re-brand the logo and
 *   wordmark but ship the same kernel theme, so this stays right everywhere,
 *   in both light and dark.
 * - The refresh control moved from the card head to a meta line under the
 *   number — `更新于 HH:mm` (the snapshot's own `fetchedAt`) plus the spinning
 *   icon — so the number's freshness and the way to change it sit together.
 * - A low balance now has an exit, not just a color: the warn chip by the
 *   number, and a dedicated 充值 service row deep-linking `/console/topup`
 *   (a real route — new-yunwu-api `web/src/App.js` route table). When low,
 *   that row's icon and description turn warn to carry the suggestion.
 *
 * The console button is the point of the page as much as the number is —
 * topping up, invoices, and the request log all live on the web and none of
 * them are worth rebuilding here. `window.open` is enough to get there: the
 * desktop host answers a renderer's window request by handing http(s) targets
 * to `shell.openExternal` and denying the in-app window
 * (`dsh-plugin-desktop` electron-runtime: setWindowOpenHandler).
 *
 * The balance states themselves come from the previous shell, which took
 * them from WorkBuddy's credits area: a failed read and a spent account
 * otherwise render the same, and of those two readings the one the user acts on
 * ("my money is gone") is the wrong one.
 *
 * ## Why signed-out and expired are a state block, not red text
 *
 * Both used to render as a red 「登录已过期，重新登录」 sentence sitting where
 * the number goes — an error costume on a normal state, with the actual way
 * out hiding as a small outline button at the far corner. WorkBuddy never
 * paints an inline red sentence for this: its expired surfaces are a warm
 * lock-icon card whose primary button IS the sign-in (`wb-login-expired`,
 * asar 解包核对 2026-09-01). So the broad side of the summary card becomes the
 * state itself: badge, one line of fact, one line of consequence, and the
 * primary action right there. Red stays reserved for a real read failure.
 *
 * @module echoflowai-tools/client/AccountSection
 */

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Button, IconCheckOutline14, IconChevronRightOutline14, IconCopyOutline16,
  IconListPenOutline16, IconPlusOutline16, IconRefreshOutline14, IconRightUpOutline14,
  IconUserOutline16, IconWarningOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the settings shell's slot rows, including
// 'settings.section', into the SlotMap this file is typed against.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { FeedbackModal } from './FeedbackModal.tsx'
import { LockGlyph } from './LockGlyph.tsx'
import { SignInForm } from './SignInForm.tsx'
import type { AccountKey } from './locales.ts'
import type { AccountStore } from './store.ts'
import type { AccountHostCaller } from './types.ts'

/** Slot id; also the DOM marker the live checks look for. */
export const ACCOUNT_SECTION_ID = 'openlux-account-section'

/**
 * Before the kernel's General page (order 0), which makes this the row the
 * panel opens on — the account row's one click has to land on the balance.
 */
export const ACCOUNT_SECTION_ORDER = -10

/** The console page this app sends people to: their own request log. */
const CONSOLE_PATH = '/console/log'

/** The wallet page (top-ups, balance detail); route table: new-yunwu-api web/src/App.js. */
const TOPUP_PATH = '/console/topup'

/** What the section needs from the plugin body. */
export interface AccountSectionInjected {
  readonly callHost: AccountHostCaller
  readonly t: (key: AccountKey) => string
  readonly store: AccountStore
  readonly hooks: {
    /** Account snapshot source; the renderer binds it as useAccount. */
    readonly account: AccountStore
  }
}

const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', maxWidth: '720px' },
  identity: { display: 'flex', alignItems: 'center', gap: '14px', padding: '2px 0 4px' },
  avatar: {
    flex: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '48px', height: '48px', borderRadius: '14px',
    background: 'var(--dsw-alias-interactive-bg-hover)',
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: '18px', fontWeight: 600, lineHeight: 1, textTransform: 'uppercase',
  },
  // Kernel accent gradient, not brand colors: see the header's third-pass note.
  avatarSigned: {
    background: 'linear-gradient(135deg, var(--dsw-static-deepseek-400), var(--dsw-static-deepseek-600))',
    color: '#fff',
  },
  identityText: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  nameRow: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 },
  name: {
    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: 'var(--dsw-alias-label-primary)', fontSize: '16px', fontWeight: 600, lineHeight: '22px',
  },
  identityState: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' },
  balanceCard: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.45fr) minmax(170px, .75fr)',
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', overflow: 'hidden',
  },
  balanceMain: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px',
    minHeight: '112px', padding: '18px 20px',
  },
  balanceHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
  },
  caption: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' },
  amount: {
    display: 'flex', alignItems: 'center', gap: '8px',
    color: 'var(--dsw-alias-label-primary)', fontSize: '28px', fontWeight: 600, lineHeight: '36px',
    fontVariantNumeric: 'tabular-nums',
  },
  tag: {
    flex: 'none', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', lineHeight: '16px',
    border: '1px solid var(--dsw-alias-border-l3)', color: 'var(--dsw-alias-label-secondary)',
  },
  lowChip: {
    flex: 'none', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', lineHeight: '16px',
    background: 'var(--dsw-alias-state-warn-tertiary)', color: 'var(--dsw-alias-state-warn-primary)',
  },
  // Freshness and the way to change it, on one quiet line under the number.
  metaRow: { display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '-4px' },
  balanceStats: {
    display: 'grid', gridTemplateRows: '1fr 1fr',
    borderLeft: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-module-platform)',
  },
  balanceStatsThree: { gridTemplateRows: '1fr 1fr 1fr' },
  stat: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px',
    padding: '12px 16px',
  },
  statDivided: { borderBottom: '1px solid var(--dsw-alias-border-l2)' },
  statValue: {
    color: 'var(--dsw-alias-label-primary)', fontSize: '14px', lineHeight: '20px',
    fontVariantNumeric: 'tabular-nums',
  },
  low: { color: 'var(--dsw-alias-state-warn-primary)' },
  waiting: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '15px', lineHeight: '36px' },
  failed: {
    display: 'flex', alignItems: 'center', gap: '6px',
    color: 'var(--dsw-alias-state-error-primary)', fontSize: '14px', lineHeight: '36px',
  },
  // The signed-out / expired state block that takes the summary card's broad
  // side: warm badge for an expired session (WorkBuddy's lock-in-a-warm-circle
  // header), the row's own quiet hover fill for a plain signed-out account.
  authState: { display: 'flex', alignItems: 'center', gap: '14px' },
  authBadge: {
    flex: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'var(--dsw-alias-state-warn-tertiary)',
    color: 'var(--dsw-alias-state-warn-primary)',
  },
  authBadgeNeutral: {
    background: 'var(--dsw-alias-interactive-bg-hover)',
    color: 'var(--dsw-alias-label-secondary)',
  },
  authText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' },
  authTitle: {
    color: 'var(--dsw-alias-label-primary)', fontSize: '14px', fontWeight: 600, lineHeight: '20px',
  },
  authDescription: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px' },
  iconButton: {
    flex: 'none',
    display: 'flex', alignItems: 'center', padding: '4px', border: 'none', borderRadius: '6px',
    background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', cursor: 'pointer',
  },
  serviceCard: {
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '12px', overflow: 'hidden',
  },
  serviceRow: {
    boxSizing: 'border-box', width: '100%', height: 'auto', padding: '12px 14px',
    borderRadius: 0, justifyContent: 'flex-start', gap: '12px', textAlign: 'left',
  },
  serviceRowDivided: { borderTop: '1px solid var(--dsw-alias-border-l2)' },
  serviceIcon: {
    flex: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '32px', height: '32px', borderRadius: '9px',
    background: 'var(--dsw-alias-interactive-bg-hover)',
    color: 'var(--dsw-alias-label-secondary)',
  },
  serviceIconWarn: {
    background: 'var(--dsw-alias-state-warn-tertiary)',
    color: 'var(--dsw-alias-state-warn-primary)',
  },
  serviceText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' },
  serviceTitle: {
    color: 'var(--dsw-alias-label-primary)', fontSize: '14px', fontWeight: 500, lineHeight: '20px',
  },
  serviceDescription: {
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: '18px',
  },
  serviceDescriptionWarn: { color: 'var(--dsw-alias-state-warn-primary)' },
  chevron: { flex: 'none', display: 'flex', color: 'var(--dsw-alias-label-tertiary)' },
} satisfies Record<string, CSSProperties>

/** Clock-face form of the snapshot's own `fetchedAt`, for the meta line. */
function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Render the account page.
 * @param props - the settings shell's owner share plus this package's face.
 * @returns the page content.
 */
export function AccountSection(
  props: PropsRuntime<'settings.section'> & InjectFace<AccountSectionInjected>,
): ReactNode {
  const { callHost, close, t, store, useAccount } = props
  const view = useAccount(snapshot => snapshot)
  const [signingIn, setSigningIn] = useState(false)
  const [copied, setCopied] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  // Opening the panel is the user asking for the current number, not the one
  // the row happened to read at startup.
  useEffect(() => { void store.refresh() }, [store])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(id)
  }, [copied])

  const expired = view.authExpired
  const signedIn = view.signedIn && !expired
  // The card's broad side turns into the sign-in block whenever there is no
  // working session to summarize — expired or plain signed out.
  const needsSignIn = view.read && (expired || !view.signedIn)
  const name = view.balance?.username
  const consoleOrigin = view.baseUrl?.replace(/\/+$/, '')
  const consoleUrl = consoleOrigin === undefined ? undefined : `${consoleOrigin}${CONSOLE_PATH}`
  const topupUrl = consoleOrigin === undefined ? undefined : `${consoleOrigin}${TOPUP_PATH}`
  const registerUrl = consoleOrigin === undefined ? undefined : `${consoleOrigin}/register`
  const mark = name !== undefined && name.trim() !== ''
    ? name.trim().slice(0, 1)
    : undefined
  // The account's home, for the identity line: a channel build names its own
  // domain here, which 「已登录」 never could.
  const host = (() => {
    if (consoleOrigin === undefined) return undefined
    try { return new URL(consoleOrigin).host } catch { return undefined }
  })()
  const group = view.balance?.group.trim()
  const low = view.balance?.low === true
  // Only a signed-in account has an allowance to show; the host already
  // answers `absent` without one, this just keeps the column honest while a
  // sign-out is settling.
  const freeTier = signedIn && view.freeTier?.enabled === true ? view.freeTier : undefined

  return (
    <div style={styles.root} data-testid={ACCOUNT_SECTION_ID}>
      <div style={styles.identity}>
        <span style={{ ...styles.avatar, ...mark !== undefined ? styles.avatarSigned : {} }} aria-hidden="true">
          {mark ?? <IconUserOutline16 size={20} />}
        </span>
        <span style={styles.identityText}>
          <span style={styles.nameRow}>
            <span style={styles.name}>
              {name !== undefined && name !== ''
                ? name
                : view.read ? t('signedOut') : t('balanceLoading')}
            </span>
            {group !== undefined && group !== '' && (
              <span style={styles.tag} title={t('group')}>{group}</span>
            )}
            {name !== undefined && name !== '' && (
              <button
                type="button"
                style={styles.iconButton}
                data-testid="openlux-copy-username"
                aria-label={t('copyUsername')}
                title={copied ? t('copied') : t('copyUsername')}
                onClick={() => { void navigator.clipboard.writeText(name).then(() => setCopied(true)) }}
              >
                {copied ? <IconCheckOutline14 size={13} /> : <IconCopyOutline16 size={13} />}
              </button>
            )}
          </span>
          <span style={styles.identityState}>
            {expired ? t('expiredTitle') : signedIn ? (host ?? t('signedIn')) : t('signedOut')}
          </span>
        </span>
        {/* Sign-out trails the identity it signs out of; when signed out, the
            state block below owns the only sign-in action instead. */}
        {signedIn && (
          <Button
            variant="outline"
            size="sm"
            data-testid="openlux-sign-out"
            onClick={() => { void store.signOut() }}
          >
            {t('signOut')}
          </Button>
        )}
      </div>

      <div style={styles.balanceCard}>
        <div style={styles.balanceMain}>
          {needsSignIn
            ? (
                <div style={styles.authState} data-testid="openlux-auth-state">
                  <span
                    style={{ ...styles.authBadge, ...expired ? {} : styles.authBadgeNeutral }}
                    aria-hidden="true"
                  >
                    {expired ? <LockGlyph size={20} /> : <IconUserOutline16 size={18} />}
                  </span>
                  <span style={styles.authText}>
                    <span style={styles.authTitle}>
                      {expired ? t('expiredTitle') : t('signedOut')}
                    </span>
                    <span style={styles.authDescription}>
                      {expired ? t('expiredStateDesc') : t('signedOutStateDesc')}
                    </span>
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    data-testid="openlux-auth-cta"
                    onClick={() => setSigningIn(true)}
                  >
                    {expired ? t('signInAgain') : t('signIn')}
                  </Button>
                </div>
              )
            : (
                <>
                  <span style={styles.balanceHead}>
                    <span style={styles.caption}>{t('availableBalance')}</span>
                  </span>

                  {view.balance !== undefined && (
                    <span style={{ ...styles.amount, ...low ? styles.low : {} }}>
                      {view.balance.display}
                      {low && <span style={styles.lowChip}>{t('lowBalance')}</span>}
                      {view.balanceStatus === 'stale' && (
                        <span style={styles.tag} title={view.message ?? t('balanceStaleTitle')}>
                          {t('balanceStale')}
                        </span>
                      )}
                    </span>
                  )}

                  {view.balance === undefined && (
                    view.read && view.balanceStatus === 'unavailable'
                      ? (
                          <span style={styles.failed} title={view.message ?? t('balanceFailed')}>
                            <IconWarningOutline16 size={14} />
                            {t('balanceFailed')}
                          </span>
                        )
                      : <span style={styles.waiting}>{t('balanceLoading')}</span>
                  )}

                  {/* One refresh affordance for every state of the number,
                      next to the fact it refreshes. */}
                  <span style={styles.metaRow}>
                    <button
                      type="button"
                      style={styles.iconButton}
                      data-testid="openlux-balance-refresh"
                      data-spinning={view.fetching ? 'true' : 'false'}
                      aria-label={t('refresh')}
                      title={t('refresh')}
                      disabled={view.fetching}
                      onClick={() => { void store.refresh(true) }}
                    >
                      <IconRefreshOutline14 size={13} />
                    </button>
                    {view.balance !== undefined && (
                      <span style={styles.caption}>
                        {t('updatedAt')} {clockTime(view.balance.fetchedAt)}
                      </span>
                    )}
                  </span>
                </>
              )}
        </div>

        <div style={{ ...styles.balanceStats, ...freeTier !== undefined ? styles.balanceStatsThree : {} }}>
          <span style={{ ...styles.stat, ...styles.statDivided }}>
            <span style={styles.caption}>{t('used')}</span>
            <span style={styles.statValue}>{view.balance?.usedDisplay ?? '—'}</span>
          </span>
          <span style={{ ...styles.stat, ...freeTier !== undefined ? styles.statDivided : {} }}>
            <span style={styles.caption}>{t('requestCount')}</span>
            <span style={styles.statValue}>
              {view.balance === undefined ? '—' : view.balance.requestCount.toLocaleString()}
            </span>
          </span>
          {/* The free tier's remaining calls — per account, so it belongs with
              the account facts rather than with any token. Shown only when
              the station has a free tier and this device holds the desktop
              credential; a station without one shows the two-cell column
              exactly as before. */}
          {freeTier !== undefined && (
            <span style={styles.stat} title={t('freeTodayTitle')} data-testid="openlux-free-today">
              <span style={styles.caption}>{t('freeToday')}</span>
              <span style={{ ...styles.statValue, ...freeTier.remainingToday === 0 ? styles.low : {} }}>
                {freeTier.remainingToday === 0
                  ? t('freeExhausted')
                  : `${freeTier.remainingToday.toLocaleString()} / ${freeTier.perDay.toLocaleString()}`}
              </span>
            </span>
          )}
        </div>
      </div>

      {consoleUrl !== undefined && (
        <div style={styles.serviceCard}>
          {/* The host turns a renderer window request into
              `shell.openExternal`, so both rows land in the user's own
              browser where they are already signed in. */}
          <Button
            variant="ghost"
            style={styles.serviceRow}
            data-testid="openlux-topup"
            title={low ? t('topupLowTitle') : t('topupTitle')}
            onClick={() => { window.open(topupUrl, '_blank', 'noopener') }}
          >
            <span style={{ ...styles.serviceIcon, ...low ? styles.serviceIconWarn : {} }} aria-hidden="true">
              <IconPlusOutline16 size={15} />
            </span>
            <span style={styles.serviceText}>
              <span style={styles.serviceTitle}>{t('topup')}</span>
              <span style={{ ...styles.serviceDescription, ...low ? styles.serviceDescriptionWarn : {} }}>
                {low ? t('topupLowTitle') : t('topupTitle')}
              </span>
            </span>
            <span style={styles.chevron} aria-hidden="true">
              <IconChevronRightOutline14 size={14} />
            </span>
          </Button>
          <Button
            variant="ghost"
            style={{ ...styles.serviceRow, ...styles.serviceRowDivided }}
            data-testid="openlux-console"
            title={t('consoleTitle')}
            onClick={() => { window.open(consoleUrl, '_blank', 'noopener') }}
          >
            <span style={styles.serviceIcon} aria-hidden="true">
              <IconRightUpOutline14 size={14} />
            </span>
            <span style={styles.serviceText}>
              <span style={styles.serviceTitle}>{t('console')}</span>
              <span style={styles.serviceDescription}>{t('consoleTitle')}</span>
            </span>
            <span style={styles.chevron} aria-hidden="true">
              <IconChevronRightOutline14 size={14} />
            </span>
          </Button>
          {/* Feedback needs the signed-in sk- identity (the submit rides it),
              so the row appears only alongside a working session — same
              condition as the balance summary above. */}
          {signedIn && (
            <Button
              variant="ghost"
              style={{ ...styles.serviceRow, ...styles.serviceRowDivided }}
              data-testid="openlux-feedback"
              title={t('feedbackTitle')}
              onClick={() => setFeedbackOpen(true)}
            >
              <span style={styles.serviceIcon} aria-hidden="true">
                <IconListPenOutline16 size={15} />
              </span>
              <span style={styles.serviceText}>
                <span style={styles.serviceTitle}>{t('feedback')}</span>
                <span style={styles.serviceDescription}>{t('feedbackTitle')}</span>
              </span>
              <span style={styles.chevron} aria-hidden="true">
                <IconChevronRightOutline14 size={14} />
              </span>
            </Button>
          )}
        </div>
      )}

      {feedbackOpen && (
        <FeedbackModal
          callHost={callHost}
          t={t}
          onClose={() => setFeedbackOpen(false)}
        />
      )}

      {/*
        Re-entry is the whole login page again, not an inline password box: the
        coordinator only re-arms its queue when the current session stops being
        blank, so a user who signs out while sitting on the empty Hero would
        otherwise have no way back in. The page's own overlay sits above this
        panel (z-index 1100 against the settings overlay's 1000), and a
        successful sign-in leaves settings altogether — which is the one shell
        affordance a section is handed.
      */}
      {signingIn && (
        <SignInForm
          callHost={callHost}
          t={t}
          variant={expired ? 'expired' : 'default'}
          registerUrl={registerUrl}
          onSignedIn={() => { setSigningIn(false); void store.signedIn(); close() }}
          onDismiss={() => setSigningIn(false)}
        />
      )}
    </div>
  )
}
