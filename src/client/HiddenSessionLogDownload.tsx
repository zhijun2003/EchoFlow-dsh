/**
 * The kernel Session-log download button, taken and left blank.
 *
 * WorkBuddy has no header export of the raw Session log — the product result
 * this shell is matching. The kernel ships one as a list cell on
 * `conversation.session.header.utilities` (`id: session-log-download`). Reusing
 * that id at a lower priority occupies the cell; painting `null` leaves it
 * empty. The header's `.headerUtilities:empty` rule then collapses the
 * right-edge wrapper.
 *
 * `/export` stays on the command plane: this only hides the header button.
 *
 * @module echoflowai-tools/client/HiddenSessionLogDownload
 */

import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** The kernel's own id for the Session log header button — reusing it takes the cell. */
export const SESSION_LOG_DOWNLOAD_ID = 'session-log-download'
export const SESSION_LOG_DOWNLOAD_PRIORITY = -1

export function HiddenSessionLogDownload(): ReactNode {
  return null
}
