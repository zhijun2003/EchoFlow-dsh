/**
 * A 16-grid padlock, hand-authored the way the primitives set hand-authors
 * its own gaps (`IconSparkle16`): the kernel icon set has no lock, and the
 * expired-session surfaces need the auth/security semantics WorkBuddy's
 * expired dialog carries (its `wb-login-expired__icon` is a 20px Lock in a
 * warm circle — asar 解包核对 2026-09-01). Renders in `currentColor`, so the
 * warm tone comes from the badge that wraps it.
 *
 * @module echoflowai-tools/client/LockGlyph
 */

import type { ReactNode } from 'react'

/**
 * Render the padlock glyph.
 * @param props.size - rendered square size in px; defaults to 16.
 * @returns the inline SVG.
 */
export function LockGlyph({ size = 16 }: { readonly size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3.1" y="6.9" width="9.8" height="6.4" rx="1.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.3 6.9V5.1a2.7 2.7 0 0 1 5.4 0v1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="10.1" r="1.05" fill="currentColor" />
    </svg>
  )
}
