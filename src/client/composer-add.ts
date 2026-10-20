/**
 * Which composer's `+` menu a press on the kernel's `+` should open.
 *
 * The `+` itself is the kernel's (`InputBar`, hardcoded, no slot); the
 * `dsh-client-ui-conversation` patch only asks `window.__openluxComposerAdd`
 * to take the press, and falls back to the command menu when the answer is
 * `false`. The menu is drawn by the file button's seat (`AttachFileButton.tsx`),
 * one per mounted composer, so the press is routed by the session id the
 * kernel hands over.
 *
 * @module echoflowai-tools/client/composer-add
 */

/** Opens (or closes, on a second press) one composer's menu at the given trigger. */
export type ComposerAddOpener = (anchor: HTMLElement) => void

const openers = new Map<string, ComposerAddOpener>()

/**
 * Register a composer's menu for its session.
 * @param sessionId - the composer's session.
 * @param open - the menu's opener.
 * @returns the unregister, which leaves a later registration for the same session alone.
 */
export function bindComposerAdd(sessionId: string, open: ComposerAddOpener): () => void {
  openers.set(sessionId, open)
  return () => {
    if (openers.get(sessionId) === open) openers.delete(sessionId)
  }
}

/**
 * Hand a `+` press to that session's menu.
 * @param sessionId - what the kernel's composer knows itself as; undefined before a session exists.
 * @param anchor - the pressed `+`.
 * @returns whether a menu took it; `false` sends the kernel back to its command menu.
 */
export function openComposerAdd(sessionId: string | undefined, anchor: HTMLElement): boolean {
  const open = sessionId === undefined ? undefined : openers.get(sessionId)
  if (open === undefined) return false
  open(anchor)
  return true
}
