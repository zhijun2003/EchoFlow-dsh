/**
 * Station name for reseller channel installs, as the sign-in page shows it.
 *
 * The desktop Host serves the cached channel branding at `/openlux/brand.json`
 * and the station logo at `/openlux/brand-mark.png`
 * (`dsh-plugin-desktop/src/web-brand.ts`); an empty document means a
 * main-station install, which keeps the bundled copy and BRAND_MARK_URI. Same
 * fetch-once shape as the sidebar wordmark (`dsh-plugin-desktop/src/client/Brand.tsx`).
 */

import { useEffect, useState } from 'react'

const BRAND_JSON_ROUTE = '/openlux/brand.json'

/** Host route for the effective brand mark; the station logo on channel installs. */
export const CHANNEL_MARK_ROUTE = '/openlux/brand-mark.png'

/** Main-station name, matching `WINDOW_TITLE` in `dsh-plugin-desktop/src/brand.ts`. */
export const DEFAULT_BRAND_NAME = 'EchoFlowSiHub'

let channelName: string | undefined
let channelNameFetch: Promise<string | undefined> | undefined

async function fetchChannelName(): Promise<string | undefined> {
  try {
    const response = await fetch(BRAND_JSON_ROUTE)
    if (!response.ok) return undefined
    const parsed: unknown = await response.json()
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const name = (parsed as { name?: unknown }).name
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : undefined
  } catch {
    return undefined
  }
}

/** Channel station name, or undefined on main-station installs and until the fetch settles. */
export function useChannelBrandName(): string | undefined {
  const [name, setName] = useState(channelName)
  useEffect(() => {
    if (channelName !== undefined) return
    channelNameFetch ??= fetchChannelName().then((resolved) => {
      channelName = resolved
      return resolved
    })
    let mounted = true
    void channelNameFetch.then((resolved) => {
      if (mounted && resolved !== undefined) setName(resolved)
    })
    return () => { mounted = false }
  }, [])
  return name
}
