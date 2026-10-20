/**
 * The one-time «登录已失效» dialog: the app tells the user the session died,
 * instead of leaving them to discover it from a broken balance line.
 *
 * ## Why a proactive dialog, and why exactly once per expiry
 *
 * WorkBuddy settles the product shape (asar 解包核对 2026-09-01,
 * `auth-expired-detector.ts` + the `wb-login-expired` modal, both shipped with
 * their own Chinese comments): any request that hits an auth failure sets one
 * global expired flag and shows one dialog — «已显示时不会重复挂载» — and the
 * flag is cleared when a re-login succeeds or the user signs out on purpose.
 * The card itself is a warm round lock icon beside a title and one sentence,
 * with 「稍后」(grey, one share) and 「立即重新登录」(primary, two shares)
 * below, and a close × in the corner.
 *
 * Here the expired fact is the store's sticky `authExpired` (the client half
 * of that detector), and this overlay draws the card in this shell's own
 * dialog language — the confirm-card shape `SessionDeleteConfirm` already
 * uses (z-1100 fixed layer, `--dsw-alias-bg-mask-1` mask, layer-2 card),
 * because the settings overlay sits at z-1000 and this must read above it.
 *
 * 「立即重新登录」 swaps this card for the full sign-in page rather than an
 * inline password box — re-entry is the whole login page, the rule
 * `SignInForm` documents. Dismissing (稍后 / mask / Escape / ×) parks the
 * dialog for the rest of this expiry episode; the sidebar row and the account
 * page keep saying 「点击登录」 until the session is whole again.
 *
 * @module echoflowai-tools/client/LoginExpiredDialog
 */

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Button, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { LockGlyph } from './LockGlyph.tsx'
import { SignInForm } from './SignInForm.tsx'
import type { AccountKey } from './locales.ts'
import type { AccountStore } from './store.ts'
import type { AccountHostCaller } from './types.ts'

/** DOM marker the live checks look for. */
export const LOGIN_EXPIRED_ID = 'openlux-login-expired'

/** After the plugin's other shell overlays (5 / 8 / 10), never fighting them. */
export const LOGIN_EXPIRED_ORDER = 12

/** What the dialog needs from the plugin body. */
export interface LoginExpiredInjected {
  readonly callHost: AccountHostCaller
  readonly t: (key: AccountKey) => string
  readonly store: AccountStore
  readonly hooks: {
    /** Account snapshot source; the renderer binds it as useAccount. */
    readonly account: AccountStore
  }
}

/**
 * One expiry episode walks idle → offer → (signin | dismissed) → idle. The
 * non-idle states all mean "this episode has had its one dialog", which is
 * the dedup: only the idle → expired edge opens the card.
 */
type Phase = 'idle' | 'offer' | 'signin' | 'dismissed'

const styles = {
  root: {
    position: 'fixed', inset: 0, zIndex: 1100, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '24px',
    pointerEvents: 'auto',
  },
  mask: {
    position: 'absolute', inset: 0, border: 0,
    background: 'var(--dsw-alias-bg-mask-1)',
    backdropFilter: 'var(--dsw-mask-blur)', cursor: 'pointer',
  },
  card: {
    position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column',
    gap: '20px', width: 'min(420px, 100%)', boxSizing: 'border-box',
    padding: '24px',
    border: '1px solid var(--dsw-alias-border-inverted)', borderRadius: '16px',
    background: 'var(--dsw-alias-bg-layer-2)', boxShadow: 'var(--dsw-shadow-lv3)',
  },
  close: {
    position: 'absolute', top: '12px', right: '12px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '28px', height: '28px', border: 'none', borderRadius: '8px',
    background: 'transparent', cursor: 'pointer',
    color: 'var(--dsw-alias-label-secondary)',
  },
  // Icon and text left-aligned in one row, clear of the close button —
  // WorkBuddy's `wb-login-expired__body` (flex, gap 12, padding-right 24).
  body: { display: 'flex', alignItems: 'flex-start', gap: '12px', paddingRight: '24px' },
  badge: {
    flex: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'var(--dsw-alias-state-warn-tertiary)',
    color: 'var(--dsw-alias-state-warn-primary)',
  },
  text: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  title: {
    margin: 0, color: 'var(--dsw-alias-label-primary)',
    fontSize: '16px', fontWeight: 600, lineHeight: '24px',
  },
  description: {
    margin: 0, color: 'var(--dsw-alias-label-secondary)',
    fontSize: '13px', lineHeight: 1.6,
  },
  // 稍后 one share, 立即重新登录 two — the primary action reads as the wide
  // default, the postponement stays available without competing.
  actions: { display: 'flex', gap: '8px' },
  later: { flex: 1 },
  confirm: { flex: 2 },
} satisfies Record<string, CSSProperties>

/**
 * Render the expired-session dialog (or the sign-in page it hands over to).
 * @param props - the shell overlay's owner share plus this package's face.
 * @returns the overlay tree, or null while the session is fine.
 */
export function LoginExpiredDialog(
  props: PropsRuntime<'shell.overlay'> & InjectFace<LoginExpiredInjected>,
): ReactNode {
  const { callHost, t, store, useAccount } = props
  const authExpired = useAccount(snapshot => snapshot.authExpired)
  const baseUrl = useAccount(snapshot => snapshot.baseUrl)
  const [phase, setPhase] = useState<Phase>('idle')

  // Only the rising edge opens the card; leaving the expired state (re-login
  // or sign-out) resets the episode, which also closes a stale dialog — the
  // `clearAuthExpired` half of the reference behaviour.
  useEffect(() => {
    setPhase(previous => {
      if (!authExpired) return 'idle'
      return previous === 'idle' ? 'offer' : previous
    })
  }, [authExpired])

  useEffect(() => {
    if (phase !== 'offer') return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setPhase('dismissed')
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [phase])

  if (phase === 'signin') {
    return (
      <SignInForm
        callHost={callHost}
        t={t}
        variant="expired"
        registerUrl={baseUrl === undefined
          ? undefined
          : `${baseUrl.replace(/\/+$/, '')}/register`}
        onSignedIn={() => { setPhase('idle'); void store.signedIn() }}
        onDismiss={() => setPhase('dismissed')}
      />
    )
  }

  if (phase !== 'offer') return null

  return (
    <div
      style={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label={t('expiredTitle')}
      data-testid={LOGIN_EXPIRED_ID}
    >
      <button type="button" style={styles.mask} aria-label={t('later')} onClick={() => setPhase('dismissed')} />
      <section style={styles.card}>
        <button
          type="button"
          style={styles.close}
          aria-label={t('later')}
          onClick={() => setPhase('dismissed')}
        >
          <IconCloseOutline16 size={16} />
        </button>
        <div style={styles.body}>
          <span style={styles.badge} aria-hidden="true">
            <LockGlyph size={20} />
          </span>
          <div style={styles.text}>
            <h2 style={styles.title}>{t('expiredTitle')}</h2>
            <p style={styles.description}>{t('expiredBody')}</p>
          </div>
        </div>
        <div style={styles.actions}>
          <Button
            variant="outline"
            style={styles.later}
            data-testid="openlux-expired-later"
            onClick={() => setPhase('dismissed')}
          >
            {t('later')}
          </Button>
          <Button
            variant="primary"
            style={styles.confirm}
            data-testid="openlux-expired-confirm"
            onClick={() => setPhase('signin')}
          >
            {t('expiredConfirm')}
          </Button>
        </div>
      </section>
    </div>
  )
}
