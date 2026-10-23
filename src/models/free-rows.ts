/**
 * The free rows — the billed face of a delivered model, in the same route.
 *
 * A model on the console's free list appears in the picker once, in the
 * `openlux` provider, under its **real id** (`gpt-4o`) with a limited-free
 * tag on the name. The paid twin is the same id, so seating the free face just
 * retags that row — 2026-09-20 hid the twin (two copies looked like a bug);
 * 2026-09-20 afternoon dropped the `<id>-free` row id because the settings
 * page and the composer then disagreed (`gpt-4o-free` vs `gpt-4o · 限时免费`).
 * WorkBuddy keeps the canonical name on the free face (`hy3` / `hy3-x` is
 * the paid twin). We no longer need a second id for a second face.
 *
 * The relay still bills under `<id>-free` (`ModelPrice["<id>-free"] = 0`).
 * `/desktop/v1` now sorts free from paid by (dsk- header + the model being
 * on the free list), and still accepts the alias for leftover settings
 * (`middleware/desktop_relay_branch.go`). What proves the request comes
 * from the desktop is the `dsk-` the provider sends in a header
 * (`../account/attest.ts`, `./sync.ts`).
 *
 * @module echoflowai-tools/models/free-rows
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '../dsh-compat/settings-namespace.ts'
import { LOCALE_SETTINGS_NAMESPACE, type LocaleSettings } from '@deepseek-ai/dsh-client-locale'
import { isManaged, MANAGED_FLAG, type ModelEntry } from './delivery.ts'

/**
 * Suffix the relay bills the free alias under (`model/desktop_free_tier_settings.go`
 * DesktopFreeModelSuffix). Kept for leftover `gpt-4o-free` rows and for
 * remapping `agent-default-model` written by the 09-18/09-20 builds.
 */
export const FREE_SUFFIX = '-free'

/**
 * Marks a seated free face. The id is the real name (`gpt-4o`); this flag
 * is how sync tells it apart from a paid row of the same id after sign-out
 * strips the name tag. Same product prefix as {@link MANAGED_FLAG} so an
 * upstream `free` key cannot start judging it.
 */
export const FREE_FLAG = 'openluxFree'

/**
 * Header the provider carries the desktop credential in. Must match the relay's
 * `middleware.DesktopAttestHeader`; the paid branch ignores it, the free branch
 * refuses a request without it.
 */
export const ATTEST_HEADER = 'X-OpenLux-Desktop'

/** The word appended to a free row's name, per UI language. */
const TAG = { zh: '限时免费', en: 'Limited-time free' } as const
/** Older tags still sitting in settings.yaml until the next sync. */
const LEGACY_TAGS = ['免费', 'Free'] as const

function nameTags(): readonly string[] {
  return [...Object.values(TAG), ...LEGACY_TAGS]
}

/**
 * Which language to tag the rows in.
 *
 * Same source `account/http.ts` reads for `Accept-Language`: the kernel's
 * `locale` namespace. The tag is written into settings at sync time, so a
 * language switch shows on the next round rather than instantly — the models
 * page write that a switch usually accompanies triggers one.
 */
export function freeTag(ctx: Context): string {
  const settings = ctx.get('settings')
  const locale = settings?.get(settingsNamespace(LOCALE_SETTINGS_NAMESPACE)) as LocaleSettings | undefined
  return locale?.preference === 'en' ? TAG.en : TAG.zh
}

/** Whether this id is the leftover billing-alias shape (`gpt-4o-free`). */
export function isAliasId(id: string): boolean {
  return id.length > FREE_SUFFIX.length && id.endsWith(FREE_SUFFIX)
}

/** Whether an entry is a seated free face (flag, or leftover alias id). */
export function isFreeRow(entry: ModelEntry): boolean {
  return entry[FREE_FLAG] === true || isAliasId(entry.id)
}

/** The real id a free row stands for. Alias ids strip the suffix; real ids pass through. */
export function realIdOf(id: string): string {
  return isAliasId(id) ? id.slice(0, -FREE_SUFFIX.length) : id
}

/**
 * Build the free row for one delivered model.
 *
 * Id stays the twin's — the settings page shows `id`, the composer trigger
 * shows `name` (`dsh-client-ui-model-selection/lib/client.js:418`), and both
 * should read as the model people know. Only the name gets the tag.
 * @param twin - the paid entry with the console's fields already applied.
 * @param tag - the language's word for "free".
 */
export function freeRow(twin: ModelEntry, tag: string): ModelEntry {
  const id = realIdOf(twin.id)
  const base = typeof twin['name'] === 'string' && twin['name'] !== '' && !isTaggedName(twin['name'])
    ? twin['name']
    : id
  return { ...twin, id, name: `${base} · ${tag}`, [MANAGED_FLAG]: true, [FREE_FLAG]: true }
}

function isTaggedName(name: string): boolean {
  for (const tag of nameTags()) {
    if (name.endsWith(` · ${tag}`)) return true
  }
  return false
}

/**
 * Undo {@link freeRow} for sign-out: the free face only exists while signed
 * in, and a row labelled "free" that can only 401 is worse than showing the
 * paid id again. Strips the tag from `name` so the restored row does not
 * keep advertising a tier the signed-out session cannot use.
 * @param row - a free row previously seated by {@link seatFreeRows}.
 */
export function paidTwinFromFree(row: ModelEntry): ModelEntry {
  const id = realIdOf(row.id)
  const next: Record<string, unknown> = { ...row, id, [MANAGED_FLAG]: true }
  delete next[FREE_FLAG]
  const name = next['name']
  if (typeof name === 'string') {
    for (const tag of nameTags()) {
      const suffix = ` · ${tag}`
      if (name.endsWith(suffix)) {
        const base = name.slice(0, -suffix.length)
        if (base === '' || base === id) delete next['name']
        else next['name'] = base
        break
      }
    }
  }
  return next as ModelEntry
}

/**
 * Seat the free rows in the list by taking the paid twin's place (2026-09-20:
 * the twin stays hidden while the free row is up). A free model the paid list
 * does not carry goes after the last delivered row, still ahead of the user's
 * own. A leftover alias id from the 09-18/09-20 builds is dropped when the
 * free row of the real id replaces it; {@link withdrawFreeToPaid} puts the
 * paid id back on sign-out.
 * @param rows - the route's entries without free rows, delivered first.
 * @param free - the free rows to seat, in the console's order.
 * @param managedCount - how many leading entries are ours (the insertion floor for orphans).
 */
export function seatFreeRows(
  rows: readonly ModelEntry[],
  free: readonly ModelEntry[],
  managedCount: number,
): readonly ModelEntry[] {
  const out = [...rows]
  let floor = managedCount
  for (const row of free) {
    const twinIndex = out.findIndex(entry => realIdOf(entry.id) === realIdOf(row.id))
    if (twinIndex >= 0) {
      out.splice(twinIndex, 1, row)
      continue
    }
    out.splice(floor, 0, row)
    floor += 1
  }
  return out
}

/**
 * Sign-out shape of the list: every seated free row becomes its paid twin
 * again, unless that paid id is already present (an older build wrote both).
 * @param rows - the user-layer entries, possibly still carrying free rows.
 */
export function withdrawFreeToPaid(rows: readonly ModelEntry[]): readonly ModelEntry[] {
  const occupied = new Set(rows.filter(entry => !isFreeRow(entry)).map(entry => realIdOf(entry.id)))
  const out: ModelEntry[] = []
  for (const entry of rows) {
    if (!(isManaged(entry) && isFreeRow(entry))) {
      out.push(entry)
      continue
    }
    const paid = paidTwinFromFree(entry)
    if (occupied.has(paid.id)) continue
    occupied.add(paid.id)
    out.push(paid)
  }
  return out
}
