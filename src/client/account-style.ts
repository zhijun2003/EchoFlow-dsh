/**
 * Motion and interaction states for the account page's two inline icon
 * buttons (refresh-balance, copy-username).
 *
 * Inline styles cannot express `:hover` or a keyframe animation, and the spin
 * is the whole point of the refresh affordance: while `store.refresh(true)` is
 * in flight the icon turns, so a click that lands on a cached number still
 * visibly did something. Selected through our stable test ids, same as
 * `automation-chip-style.ts`.
 *
 * @module echoflowai-tools/client/account-style
 */

/** Marker on the injected tag; also the double-injection guard. */
const TAG_ID = 'echoflowai-tools/account'

const BUTTONS = [
  '[data-testid="openlux-balance-refresh"]',
  '[data-testid="openlux-copy-username"]',
]

const CSS = `
${BUTTONS.map(sel => `${sel}:hover:not(:disabled)`).join(',\n')} {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
@keyframes openlux-account-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
[data-testid="openlux-balance-refresh"][data-spinning="true"] svg {
  animation: openlux-account-spin 0.9s linear infinite;
}
`

/**
 * Mount the stylesheet.
 * @returns the disposer; wrap the call in `ctx.effect`.
 */
export function installAccountStyle(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) !== null) return () => {}
  const tag = document.createElement('style')
  tag.setAttribute('data-plugin-css', TAG_ID)
  tag.textContent = CSS
  document.head.append(tag)
  return () => { tag.remove() }
}
