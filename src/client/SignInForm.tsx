/**
 * The sign-in page itself, independent of who put it on screen.
 *
 * Two mount points need it: the first-run queue (`SignInStep`) and the sidebar
 * account row after a sign-out. Re-entry has to be a full-screen page rather
 * than a password box in the workspace — an application that suddenly asks for
 * a password in place reads like a phishing prompt, and "signed out sends you
 * back to the login page" is what every user already expects. That was the
 * previous shell's rule too, and it survives the port.
 *
 * The console checks the human challenge *before* it looks at the password, so
 * pressing sign-in opens the challenge first and the token it yields rides
 * along with the credentials.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Button, Input, OnboardingSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import { BRAND_MARK_URI } from './brand-mark.ts'
import { Captcha, type CaptchaType } from './Captcha.tsx'
import type { AccountKey } from './locales.ts'
import { CHANNEL_MARK_ROUTE, DEFAULT_BRAND_NAME, useChannelBrandName } from './runtime-brand.ts'
import type { AccountHostCaller } from './types.ts'

/** DOM marker the live checks look for. */
export const SIGN_IN_ID = 'openlux-sign-in'

/**
 * Last account that signed in on this machine, prefilled on the next visit.
 * localStorage because it is per Electron profile and survives restarts — the
 * same store and reasoning as the automation editor's recent-experts list
 * (`client/index.ts` RECENT_EXPERTS_KEY). The password is never stored.
 */
const LAST_USERNAME_KEY = 'openlux.account.last-username'

function readLastUsername(): string {
  try {
    return window.localStorage.getItem(LAST_USERNAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeLastUsername(username: string): void {
  try {
    window.localStorage.setItem(LAST_USERNAME_KEY, username)
  } catch {
    // Losing the prefill is the whole cost.
  }
}

interface CaptchaConfig {
  readonly enabled: boolean
  readonly type: CaptchaType
}

type SignInReply =
  | { readonly kind: 'ok'; readonly userId: number; readonly username: string }
  | { readonly kind: 'rejected'; readonly message: string; readonly needCaptcha: boolean }
  | { readonly kind: 'failed'; readonly message: string }

/** What the page needs from whoever mounted it. */
export interface SignInFormProps {
  readonly callHost: AccountHostCaller
  readonly t: (key: AccountKey, params?: Record<string, unknown>) => string
  /**
   * 'expired' retitles the page for a dead session — the user did nothing
   * wrong, so the page says what happened (登录已失效) instead of greeting
   * them like a stranger. Wording follows WorkBuddy's `auth.expired.*` family.
   */
  readonly variant?: 'default' | 'expired' | undefined
  /**
   * The console's register page. When present the footer's "no account" line
   * carries a real link (opened in the system browser, the same
   * `window.open` → `shell.openExternal` path the console row uses).
   */
  readonly registerUrl?: string | undefined
  /** Signed in successfully. */
  readonly onSignedIn: () => void
  /** Left without signing in. */
  readonly onDismiss: () => void
}

const styles = {
  // The stage stretches its child and leaves the vertical rhythm to whoever
  // fills it (`ui-primitives/src/OnboardingSurface.module.css`), so the card
  // centers itself in the height it was handed.
  card: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px',
    width: '340px', padding: '32px', textAlign: 'center',
  },
  brand: {
    display: 'block', width: '48px', height: '48px', margin: '0 auto -4px',
    borderRadius: '12px',
  },
  title: { margin: 0, color: 'var(--dsw-alias-label-primary)', fontSize: '20px', fontWeight: 600 },
  description: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' },
  label: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' },
  error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: '12px', minHeight: '16px', textAlign: 'left' },
  footer: { color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', lineHeight: 1.5, margin: 0 },
  registerLink: {
    padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
    color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: 1.5,
    textDecoration: 'underline', textUnderlineOffset: '2px',
  },
} satisfies Record<string, CSSProperties>

/**
 * Render the sign-in page.
 * @param props - see {@link SignInFormProps}.
 * @returns the full-viewport takeover.
 */
export function SignInForm(
  { callHost, t, variant = 'default', registerUrl, onSignedIn, onDismiss }: SignInFormProps,
): ReactNode {
  const [captcha, setCaptcha] = useState<CaptchaConfig>({ enabled: false, type: 'slide-basic' })
  const [showChallenge, setShowChallenge] = useState(false)
  const [username, setUsername] = useState(readLastUsername)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const channelName = useChannelBrandName()
  const live = useRef(true)
  useEffect(() => () => { live.current = false }, [])

  useEffect(() => {
    void (async () => {
      const config = await callHost<CaptchaConfig>('captcha.config', {})
      // An unreadable console must not lock the user out of their own app: the
      // form still works, and sign-in reports whatever goes wrong then.
      if (live.current && config.ok) setCaptcha(config.value)
    })()
  }, [callHost])

  const attempt = useCallback(async (captchaToken?: string): Promise<void> => {
    setBusy(true)
    setError('')
    const result = await callHost<SignInReply>('sign-in', {
      username,
      password,
      ...captchaToken === undefined ? {} : { captchaToken },
    })
    if (!live.current) return
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    if (result.value.kind === 'ok') {
      writeLastUsername(username.trim())
      onSignedIn()
      return
    }
    setError(result.value.message)
  }, [callHost, username, password, onSignedIn])

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault()
    if (busy) return
    if (username.trim() === '' || password === '') {
      setError(t('emptyFields'))
      return
    }
    // The token is one-shot and the console consumes it on the attempt, so
    // each try opens its own challenge rather than reusing the last one.
    if (captcha.enabled) {
      setError('')
      setShowChallenge(true)
      return
    }
    void attempt()
  }

  return (
    <OnboardingSurface>
      <div style={styles.card} data-testid={SIGN_IN_ID}>
        {showChallenge ? (
          <Captcha
            callHost={callHost}
            type={captcha.type}
            t={t}
            onPassed={token => {
              setShowChallenge(false)
              void attempt(token)
            }}
            onCancel={() => setShowChallenge(false)}
          />
        ) : (
          <>
            <img
              src={channelName === undefined ? BRAND_MARK_URI : CHANNEL_MARK_ROUTE}
              style={styles.brand}
              alt=""
              aria-hidden="true"
            />
            <h2 style={styles.title}>
              {variant === 'expired' ? t('expiredTitle') : t('title', { brand: channelName ?? DEFAULT_BRAND_NAME })}
            </h2>
            <p style={styles.description}>
              {t(variant === 'expired' ? 'expiredSignInDesc' : 'description')}
            </p>
            <form style={styles.form} onSubmit={onSubmit}>
              <label style={styles.label} htmlFor="openlux-account">{t('account')}</label>
              <Input
                id="openlux-account"
                name="username"
                autoComplete="username"
                autoFocus
                disabled={busy}
                placeholder={t('accountPlaceholder')}
                value={username}
                onChange={event => setUsername(event.target.value)}
              />
              <label style={styles.label} htmlFor="openlux-password">{t('password')}</label>
              <Input
                id="openlux-password"
                name="password"
                type="password"
                autoComplete="current-password"
                disabled={busy}
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
              <div style={styles.error} role="alert" data-testid="openlux-sign-in-error">{error}</div>
              <Button variant="primary" type="submit" disabled={busy}>
                {t(busy ? 'submitting' : 'submit')}
              </Button>
            </form>
            <p style={styles.footer}>
              {registerUrl === undefined
                ? t('needAccount')
                : (
                    <>
                      {t('noAccount')}
                      {' '}
                      <button
                        type="button"
                        style={styles.registerLink}
                        data-testid="openlux-register-link"
                        onClick={() => { window.open(registerUrl, '_blank', 'noopener') }}
                      >
                        {t('register')}
                      </button>
                    </>
                  )}
            </p>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onDismiss}>{t('later')}</Button>
          </>
        )}
      </div>
    </OnboardingSurface>
  )
}
