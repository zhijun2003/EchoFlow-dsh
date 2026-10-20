/**
 * Interaction states for the automation editor's context-bar chips.
 *
 * The chips (model / skills / expert / permission) are styled inline to match
 * the kernel composer's permission trigger (`.Sh0Q9G_trigger`), but inline
 * styles cannot express `:hover` / `:focus-visible` / `:disabled`. This sheet
 * carries exactly those three states with the kernel's own tokens, selected
 * through our stable test ids so no hashed kernel class is depended on.
 *
 * Injection follows the same convention as `footer-row-style.ts`: one
 * `<style>` tagged `data-plugin-css`, skipped when already present.
 *
 * @module echoflowai-tools/client/automation-chip-style
 */

/** Marker on the injected tag; also the double-injection guard. */
const TAG_ID = 'echoflowai-tools/automation-chip'

const CHIPS = [
  '[data-testid="automation-model-selector"]',
  '[data-testid="automation-skill-selector"]',
  '[data-testid="automation-expert-selector"]',
  '[data-testid="automation-permission-selector"]',
]

/** The rule set: kernel trigger states (hover bg, focus ring, dimmed disabled). */
const CSS = `
${CHIPS.map(chip => `${chip}:hover:not(:disabled)`).join(',\n')} {
  background: var(--dsw-alias-interactive-bg-hover);
}
${CHIPS.map(chip => `${chip}:focus-visible`).join(',\n')} {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);
}
${CHIPS.map(chip => `${chip}:disabled`).join(',\n')} {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
`

/**
 * Mount the stylesheet.
 * @returns the disposer; wrap the call in `ctx.effect`.
 */
export function installAutomationChipStyle(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) !== null) return () => {}
  const tag = document.createElement('style')
  tag.setAttribute('data-plugin-css', TAG_ID)
  tag.textContent = CSS
  document.head.append(tag)
  return () => { tag.remove() }
}
