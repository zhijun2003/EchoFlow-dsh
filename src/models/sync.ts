/**
 * Writing the two-layer model list into the adapter's settings section.
 *
 * Which entries belong to which layer is {@link ./delivery.ts}'s subject; this
 * module is the round that applies it — read the console, merge, and fill in
 * the fields only the installed catalog knows.
 *
 * The delivered half has two possible sources and this module owns the order:
 * the console's own list ({@link ./delivered.ts}) first, and the square-tag
 * rule ({@link ./delivery.ts}) only when that says nothing. Operations own the
 * first; the second is what a station that has configured nothing still has.
 *
 * The one thing this module owns outright
 * is the thinking declaration (`reasoningEfforts` / `compat`): nothing else in
 * the shell can write those, and without them a hand-declared model simply
 * does not reason, so they are refreshed for the user's own entries too.
 *
 * Every capability fact comes from the console ({@link ./profiles.ts}) and
 * nowhere else — 2026-09-11 v4 removed the pi-ai catalog fallback
 * (`docs/desktop-model-console-only-plan.md`). The catalog described each
 * vendor's own service rather than the channel our relay put behind that name
 * (it filed `deepseek-v4-flash` as text-only while our channel reads images
 * fine), and its one honest gift — context/output capacities — now arrives by
 * the same road, seeded into the console's table on the operations side.
 *
 * The same list carries the free rows ({@link ./free-rows.ts}): each delivered
 * model the console lists free is shown once under its real id with a name
 * tag, while this device holds the `dsk-` the relay demands; the paid twin
 * is not listed (2026-09-20). The billing alias `<id>-free` stays on the
 * relay. That credential travels on the route as a header, written here
 * next to the list so both change in one revision ({@link credentialOps}).
 *
 * One neighbouring section is written from the same snapshot: the install
 * default ({@link applyDefaultModel} — narrowly, because that one belongs to the
 * user).
 *
 * The search chain used to be written here too, into `web-search-deepseek`'s
 * `models`. That was a dead write: the section's schema carries a singular
 * `model` and nothing in that package ever reads a list
 * (`dsh-web-search-deepseek/lib/index.js:239-247`), so the console's priority
 * list sat in the settings file and every search ran on the composition's pinned
 * model. The list now reaches its consumer directly — the delivered snapshot is
 * handed to our own search provider (`web/search/provider.ts`), which is what
 * finally honours the ordering and the degradation the console page promises. An
 * inert `models` key left in a settings file by an older build is harmless and
 * is not migrated away: the schema ignores unknown keys, and rewriting another
 * plugin's section to tidy up would be a worse trade than the litter.
 *
 * **A round that cannot read the console changes nothing about membership.** An
 * unreachable console means the delivered list is *unknown*, not empty, and
 * acting on the empty case would delete every delivered entry the first time
 * the network blinks. The current token does not shrink that list: whether a
 * row is callable is the key's grouping, settled at request time.
 *
 * @module echoflowai-tools/models/sync
 */

import type { Context } from '@deepseek-ai/cordis'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import { settingsNamespace } from '../dsh-compat/settings-namespace.ts'
import { readAttest } from '../account/attest.ts'
import type { ConsoleAccess } from '../market/console.ts'
import { fetchDeliveredModelConfig, type DeliveredModelConfig } from './delivered.ts'
import { deliveredIds, FALLBACK_MODELS, isManaged, MANAGED_FLAG, merge, type ModelEntry } from './delivery.ts'
import { ATTEST_HEADER, FREE_SUFFIX, freeRow, freeTag, isFreeRow, realIdOf, seatFreeRows, withdrawFreeToPaid } from './free-rows.ts'
import { fetchChatPool } from './pool.ts'
import { fetchModelOverrides, type ModelOverrideSnapshot, type ModelOverrides } from './profiles.ts'

/**
 * The settings namespace that owns provider routes. Not ours — we write into
 * the adapter's section, which is what the kernel's own models page does
 * ("which adapters exist is composition; which providers run is the user's
 * settings document", `bundle/base/cordis.patch.yml`).
 *
 * Exported for the save-time trigger: `settings/updated` on this namespace is
 * how the shell learns the models page just wrote rows (`index.ts`).
 */
export const PI_AI_NS = settingsNamespace('llm-pi-ai')
/**
 * The section deciding which model a new session starts on.
 *
 * Not ours either, and unlike the two above it is *the user's own choice*: the
 * client's model picker writes it through the host's
 * `saveDefaultModelSelection` seam (`dsh-host-apiproxy`, which calls
 * `agentDefaultModel.saveSelection`). That is why {@link applyDefaultModel}
 * touches it in two narrow cases rather than mirroring the delivered list onto
 * it every round.
 */
const DEFAULT_NS = settingsNamespace('agent-default-model')

/**
 * Our route key. Fixed rather than configurable: the kernel's models page
 * derives the credential reference `<ROUTE>_API_KEY` from it, so renaming the
 * route renames the credential.
 */
export const ROUTE = 'openlux'

/**
 * The provider id an earlier build (2026-09-17/18) wrote the free rows under,
 * before they moved into `openlux`. Removed from the user layer whenever seen;
 * nothing writes it any more.
 */
const LEGACY_FREE_ROUTE = 'openlux-free'

/** One provider as stored; `models` and `headers` are read field-wise, the rest is passed through. */
interface PiAiProvider {
  readonly models?: readonly ModelEntry[]
  readonly headers?: Readonly<Record<string, unknown>>
  readonly [key: string]: unknown
}

/** The slice of the adapter's section this module reads. */
interface PiAiSection {
  readonly providers?: Record<string, PiAiProvider | undefined>
}

/** What one sync did, for the log and for tests. */
export interface SyncOutcome {
  readonly changed: boolean
  /**
   * Why nothing happened, when nothing did. `no-pool` covers "neither source
   * answered": no console list *and* no square, which is the offline case.
   */
  readonly skipped?: 'no-settings' | 'no-key' | 'no-pool' | 'empty-result' | 'unchanged' | 'prepared' | 'stale'
  /**
   * Where the delivered ids came from. Worth logging on its own: the two
   * sources fail in different ways, and "which one answered" is the first
   * thing anybody asks when the picker holds the wrong rows.
   */
  readonly source?: 'console' | 'square'
  readonly models?: number
  /** Of those, the ones the console delivered. */
  readonly managed?: number
  /** Of those, the ones the user added themselves and this round left alone. */
  readonly kept?: number
  /** Models whose thinking declaration the installed catalog supplied. */
  readonly described?: number
  /**
   * Of those, the ones the console overrode. Reported on its own because "did
   * the capability layer reach this machine at all" is the first question when
   * a model still refuses images after operations ticked the box — and an
   * unreachable console and an empty table look identical from the settings
   * file alone.
   */
  readonly overridden?: number
  /**
   * Free rows as this round leaves them (`./free-rows.ts`). `0` means none
   * were seated: the console lists no free model, or this device holds no
   * `dsk-` yet.
   */
  readonly free?: number
  /** The full server snapshot, also used by the media tools' runtime defaults. */
  readonly delivery?: DeliveredModelConfig
}

/** One path edit, in the service's own vocabulary (`{op:'set'|'unset', path}`). */
type SettingsOp =
  | { readonly op: 'set'; readonly path: readonly string[]; readonly value: unknown }
  | { readonly op: 'unset'; readonly path: readonly string[] }

/** The settings service surface this module uses. */
interface SettingsLike {
  get(ns: typeof PI_AI_NS): unknown
  describe(options?: { redactSecrets?: boolean }): readonly {
    ns: string
    user?: unknown
    revision: number
  }[]
  mutate(ns: typeof PI_AI_NS, ops: readonly SettingsOp[], expectedRevision?: number): Promise<void>
}

/** Hooks used by the runtime coordinator without coupling this module to accounts. */
export interface SyncControl {
  readonly commit?: boolean
  readonly canCommit?: () => boolean | Promise<boolean>
  readonly serializeWrite?: <T>(task: () => Promise<T>) => Promise<T>
}

/** The two fields of the default-model section this module reads. */
interface DefaultSelection {
  readonly provider?: string
  readonly model?: string
}

function selectionOf(value: unknown): DefaultSelection {
  const section = value as { provider?: unknown; model?: unknown } | undefined
  return {
    ...typeof section?.provider === 'string' ? { provider: section.provider } : {},
    ...typeof section?.model === 'string' && section.model !== '' ? { model: section.model } : {},
  }
}

/**
 * Point the install default at the delivered list — in two cases and no more.
 *
 * The server states the contract (`admin-server/model/desktop_delivered_model.go`:
 * "ChatModels：客户端模型清单，第一项是新装机默认"), and until now nothing on this
 * side implemented it: the default stayed at whatever the composition shipped,
 * so reordering the delivered list changed nothing and a list that dropped the
 * packaged name left every new session starting on a model the picker no longer
 * offers.
 *
 * Why not simply mirror `chatModels[0]` every round: this section is the user's
 * own choice. Picking a model in the client writes it through the host's
 * `saveDefaultModelSelection`, so a round that rewrote it would take the choice
 * away again on the next sync. Hence:
 *
 *  - **nothing written here yet** → seed with the first delivered name. Nobody
 *    has chosen, so operations' order is the only opinion in the room.
 *  - **what is written names one of our models that the list no longer holds**
 *    → move it. That name is gone from the picker, and leaving it would start
 *    every new session on a route entry that does not exist.
 *
 * A default naming another provider, or an entry the user added themselves, is
 * left alone in both cases.
 * @param settings - the settings service.
 * @param delivery - the server snapshot; only a configured one speaks here.
 * @param models - the route's entries as this round leaves them.
 * @returns whether the section was written.
 */
async function applyDefaultModel(
  settings: SettingsLike,
  delivery: DeliveredModelConfig | undefined,
  models: readonly ModelEntry[],
): Promise<boolean> {
  if (delivery?.configured !== true) return false
  // Delivered order, but only names that survived this round's merge: seeding a
  // default the picker does not list would recreate the very problem below.
  const first = models.find(isManaged)?.id
  if (first === undefined) return false

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const descriptor = settings.describe().find(entry => entry.ns === DEFAULT_NS)
    const written = selectionOf(descriptor?.user)
    let target = first
    if (written.model !== undefined) {
      if (written.provider === LEGACY_FREE_ROUTE) {
        // A default left by the build that kept free rows in their own
        // provider: the same free model now lives in `openlux` under the
        // real id (09-20 afternoon); follow a leftover alias if that is
        // what this round still wrote.
        if (models.some(entry => entry.id === written.model)) target = written.model
        else {
          const moved = written.model + FREE_SUFFIX
          target = models.some(entry => entry.id === moved) ? moved : first
        }
      } else {
        if (written.provider !== ROUTE) return false
        if (models.some(entry => entry.id === written.model)) return false
        // The paid twin is hidden while its free row is up (and the reverse
        // on sign-out). Follow the same model across the 09-20 alias id and
        // today's real id rather than jumping to whatever is now first.
        const paid = realIdOf(written.model)
        if (models.some(entry => entry.id === paid)) target = paid
        else {
          const moved = written.model + FREE_SUFFIX
          if (models.some(entry => entry.id === moved)) target = moved
        }
      }
    }
    const resolved = selectionOf(settings.get(DEFAULT_NS))
    if (resolved.provider === ROUTE && resolved.model === target) return false

    try {
      await settings.mutate(DEFAULT_NS, [
        { op: 'set', path: ['provider'], value: ROUTE },
        { op: 'set', path: ['model'], value: target },
        // The effort was chosen for the model being left behind. Levels are
        // declared per model (`reasoningEfforts`), so carrying one across is at
        // best meaningless and at worst a level the next model does not have.
        { op: 'unset', path: ['reasoningEffort'] },
      ], descriptor?.revision)
      return true
    } catch (error: unknown) {
      if (!(error instanceof SettingsConflictError) || attempt > 0) throw error
    }
  }
  return false
}

function modelsOf(section: unknown): readonly ModelEntry[] | undefined {
  const models = (section as PiAiSection | undefined)?.providers?.[ROUTE]?.models
  if (!Array.isArray(models)) return undefined
  return models.filter(entry => typeof entry?.id === 'string' && entry.id !== '')
}

function currentModels(settings: SettingsLike): readonly ModelEntry[] {
  return modelsOf(settings.get(PI_AI_NS)) ?? []
}

/**
 * The entries this machine's settings document actually holds, as opposed to
 * the resolved value.
 *
 * The difference is who owns what. Factory entries arrive from the composition
 * `base` layer and belong to nobody; reading the resolved value would make
 * them look like the user's own picks and preserve them forever, next to a
 * delivered list that already covers the same ground. The descriptor's `user`
 * layer is the kernel's own answer to "was this written here", and both the
 * models page and this module write into it — so it is exactly the set of
 * entries somebody chose on purpose.
 * @param settings - the settings service.
 * @returns the user layer's entries; empty when nothing was ever written.
 */
function writtenModels(settings: SettingsLike): readonly ModelEntry[] {
  const descriptor = settings.describe().find(entry => entry.ns === PI_AI_NS)
  return modelsOf(descriptor?.user) ?? []
}

/**
 * The entry fields the console can override and that are therefore re-derived
 * every round on managed entries. Thinking (`reasoningEfforts` / `compat`) is
 * not listed because the console owns it outright — every round that read a
 * snapshot rewrites or strips it, so there is no stale value to strip first.
 */
const OVERRIDDEN_FIELDS: ReadonlySet<string> = new Set(['input', 'name', 'contextWindow', 'maxTokens'])

/**
 * Overlay the console's word onto one entry — field by field, five fields
 * (2026-09-11 v4, `docs/desktop-model-console-only-plan.md`: the pi-ai catalog
 * layer is gone, the chain is 手填 > 探针 > 内核默认, and both manual and
 * probed cells arrive merged as the console's statement).
 *
 * A present field replaces, an absent field states nothing — except thinking,
 * which the console owns outright: a *reachable* console that names no levels
 * for a model is stating "does not think", so the declaration is stripped
 * rather than frozen at its last value. An unreachable console states nothing,
 * and the entry keeps whatever the last reachable round wrote — the same
 * "unknown is not empty" discipline membership follows. A thinking override
 * with empty `efforts` is the explicit spelling of the same "does not think";
 * one with levels replaces `reasoningEfforts` wholesale and rebuilds `compat`
 * from its own dialect and effort switch — never merged, because the group
 * only means anything whole.
 * @param entry - the entry as stored.
 * @param overrides - the console's statements, empty when it said nothing.
 * @param snapshotPresent - whether this round read the console at all; only a
 *   reachable console may strip a thinking declaration.
 * @param resetOverridden - strip the override-covered fields first; passed for
 *   managed entries under a fresh console snapshot, so a row deleted on the
 *   console falls back to bare instead of freezing its last value.
 * @returns the entry with console-derived fields applied.
 */
function described(
  entry: ModelEntry,
  overrides: ModelOverrides,
  snapshotPresent: boolean,
  resetOverridden = false,
): ModelEntry {
  const override = overrides.get(entry.id)
  const next: Record<string, unknown> = resetOverridden
    ? Object.fromEntries(Object.entries(entry).filter(([key]) => !OVERRIDDEN_FIELDS.has(key)))
    : { ...entry }

  if (override !== undefined) {
    if (override.input !== undefined) next['input'] = [...override.input]
    if (override.name !== undefined) next['name'] = override.name
    if (override.contextWindow !== undefined) next['contextWindow'] = override.contextWindow
    if (override.maxTokens !== undefined) next['maxTokens'] = override.maxTokens
  }

  const thinking = override?.thinking
  if (thinking !== undefined && Object.keys(thinking.efforts).length > 0) {
    next['reasoningEfforts'] = { ...thinking.efforts }
    const compat: Record<string, unknown> = {
      // pi-ai spells a *reasoning* model's system prompt as role `developer`
      // unless told otherwise (`dsh-llm-pi-ai/lib/types/catalog.d.ts`,
      // `supportsDeveloperRole`; applied in pi-ai's `openai-completions.js` as
      // `useDeveloperRole = model.reasoning && compat.…`). Every id on this
      // route reaches whichever channel the relay's roulette picks, and some
      // upstreams reject that role outright: 2026-09-24, two live channels
      // answered HTTP 400 「developer is not one of ['system', 'assistant',
      // 'user', 'tool', 'function'] - 'messages.[0].role'」 and killed the
      // whole turn (deepseek-v4-flash on dataeyes-deepseek #6083, relay detail
      // log 20368696670; deepseek-v3.2 on 千问 #6170, log 20368627109) while
      // other channels for the same ids tolerated it — a per-request coin
      // flip. `system` is the spelling every OpenAI-compatible upstream
      // accepts (OpenAI itself promotes system to developer on o-series), so
      // managed thinking entries pin the safe one.
      supportsDeveloperRole: false,
    }
    if (thinking.format !== undefined) compat['thinkingFormat'] = thinking.format
    if (thinking.supportsReasoningEffort !== undefined) {
      compat['supportsReasoningEffort'] = thinking.supportsReasoningEffort
    }
    next['compat'] = compat
  } else if (thinking !== undefined || snapshotPresent) {
    // Explicit empty `efforts`, or a reachable console with no levels for this
    // id: both spell "does not think".
    delete next['reasoningEfforts']
    delete next['compat']
  }
  return next as ModelEntry
}

/** Stable comparison of two lists, so an unchanged sync writes nothing. */
function same(a: readonly ModelEntry[], b: readonly ModelEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The route's provider object as this machine's settings document holds it (user layer). */
function writtenRoute(settings: SettingsLike): PiAiProvider | undefined {
  const descriptor = settings.describe().find(entry => entry.ns === PI_AI_NS)
  const provider = (descriptor?.user as PiAiSection | undefined)?.providers?.[ROUTE]
  return provider === undefined || provider === null || typeof provider !== 'object' ? undefined : provider
}

/** The `dsk-` the route's header currently carries in the user layer, if any. */
function writtenAttestHeader(settings: SettingsLike): string | undefined {
  const value = writtenRoute(settings)?.headers?.[ATTEST_HEADER]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Whether the user layer still carries the provider an earlier build wrote free rows under. */
function hasLegacyFreeRoute(settings: SettingsLike): boolean {
  const descriptor = settings.describe().find(entry => entry.ns === PI_AI_NS)
  const provider = (descriptor?.user as PiAiSection | undefined)?.providers?.[LEGACY_FREE_ROUTE]
  return provider !== undefined && provider !== null
}

/**
 * The edits that bring the route's credential header and the legacy provider
 * in line with `attest`. Empty when nothing needs writing, so the caller can
 * fold them into the list write and skip the round when both are settled.
 *
 * The header rides on the provider rather than in the credential store because
 * the kernel sends a provider's `headers` dictionary with every request
 * (`dsh-llm-pi-ai/lib/index.js:1744` → pi-ai `createClient` `defaultHeaders`),
 * which is the only way a second credential reaches the relay next to the
 * `sk-` in the `apiKey` slot. The store stays the source of truth
 * (`../account/attest.ts` writes it, 0600); this mirrors it.
 * @param settings - the settings service.
 * @param attest - the `dsk-` this device holds, or undefined for none.
 */
function credentialOps(settings: SettingsLike, attest: string | undefined): SettingsOp[] {
  const ops: SettingsOp[] = []
  const written = writtenAttestHeader(settings)
  if (attest === undefined) {
    if (written !== undefined) ops.push({ op: 'unset', path: ['providers', ROUTE, 'headers', ATTEST_HEADER] })
  } else if (written !== attest) {
    ops.push({ op: 'set', path: ['providers', ROUTE, 'headers', ATTEST_HEADER], value: attest })
  }
  if (hasLegacyFreeRoute(settings)) ops.push({ op: 'unset', path: ['providers', LEGACY_FREE_ROUTE] })
  return ops
}

/**
 * Take the free rows and the credential header out of the settings document.
 *
 * For sign-out, which the sync round cannot do itself: with the `sk-` gone
 * the round ends at `no-key` before it reaches the list. Free rows are
 * turned back into their paid twins ({@link withdrawFreeToPaid}) so the
 * picker still lists those models (they merely fail until the next sign-in);
 * dropping them would hide a delivered model the user had not removed. The
 * `dsk-` header goes with them, otherwise every paid request would keep
 * naming the old account. Never throws; a failed withdrawal is logged and
 * the next signed-in round reconciles it.
 * @param ctx - host context.
 * @returns whether the section was written.
 */
export async function withdrawFreeRows(ctx: Context): Promise<boolean> {
  const settings = ctx.get('settings') as SettingsLike | undefined
  if (settings === undefined) return false
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const descriptor = settings.describe().find(entry => entry.ns === PI_AI_NS)
    const written = writtenModels(settings)
    const kept = withdrawFreeToPaid(written)
    const ops: SettingsOp[] = credentialOps(settings, undefined)
    if (!same(kept, written)) ops.push({ op: 'set', path: ['providers', ROUTE, 'models'], value: kept })
    if (ops.length === 0) return false
    try {
      await settings.mutate(PI_AI_NS, ops, descriptor?.revision)
      return true
    } catch (error: unknown) {
      if (!(error instanceof SettingsConflictError) || attempt > 0) {
        ctx.logger.warn(`openlux: free rows could not be withdrawn (${errorText(error)})`)
        return false
      }
    }
  }
  return false
}

/**
 * The free rows this round seats (`./free-rows.ts`).
 *
 * A model is seated free exactly when the console lists it free *and* this
 * device holds the `dsk-` the relay will demand; either fact missing leaves
 * no row, because a row that can only fail is worse than no row. A round
 * without a console snapshot judges nothing — the same "unknown is not empty"
 * rule membership follows — so a network blink cannot take the rows away: the
 * ones already written are carried forward as they are.
 *
 * Each row is its twin's entry with the tagged name (id stays the real
 * name), so the console's capability fields come along by construction.
 * @param ctx - host context.
 * @param delivery - the server snapshot, or undefined when the console did not answer.
 * @param attest - the `dsk-` this device holds, or undefined for none.
 * @param twins - this round's paid entries (delivered and the user's), fields applied.
 * @param written - the user layer's entries as they were before this round.
 * @param describe - how this round fills a bare managed entry, for a free model the paid list lacks.
 */
function freeRowsFor(
  ctx: Context,
  delivery: DeliveredModelConfig | undefined,
  attest: string | undefined,
  twins: readonly ModelEntry[],
  written: readonly ModelEntry[],
  describe: (entry: ModelEntry) => ModelEntry,
): readonly ModelEntry[] {
  if (delivery === undefined) return written.filter(entry => isManaged(entry) && isFreeRow(entry))
  if (attest === undefined || delivery.freeModels.length === 0) return []
  const tag = freeTag(ctx)
  return delivery.freeModels.map(id => {
    const twin = twins.find(entry => entry.id === id) ?? describe({ id, [MANAGED_FLAG]: true })
    return freeRow(twin, tag)
  })
}

/**
 * Reconcile the route's model list: deliver what the console lists, keep what
 * the user added, refresh every capability field the console declares, and
 * seat a free row in place of every model the console lists free.
 *
 * Every round wants the network now — both membership and capabilities are the
 * console's to state, and nothing local mirrors them beyond the fallback ids.
 * A round that cannot reach it changes nothing: entries keep the declarations
 * the last reachable round wrote (unknown is not empty), and a machine with
 * nothing written yet comes away untouched, which is the one case where
 * guessing would put rows in the picker nobody asked for.
 * @param ctx - host context.
 * @param options - independent model-directory and product-config access.
 * @param signal - caller cancellation.
 * @returns what the sync did.
 */
export async function syncModels(
  ctx: Context,
  options: {
    /** Account-scoped model directory and billing route. */
    readonly model: ConsoleAccess
    /** Product configuration route; local integration uses its own station token. */
    readonly config: ConsoleAccess
  },
  signal?: AbortSignal,
  control: SyncControl = {},
): Promise<SyncOutcome> {
  const settings = ctx.get('settings') as SettingsLike | undefined
  if (settings === undefined) return { changed: false, skipped: 'no-settings' }

  const apiKey = await options.model.apiKey()
  const hasKey = apiKey !== undefined && apiKey !== ''
  if (!hasKey) return { changed: false, skipped: 'no-key' }

  // Delivery and profiles are product facts from the configuration plane.
  // `/v1/models` is this token's callable set — used only when the station
  // has no delivery route yet. A grouped key must not shrink the console list;
  // call-time errors belong to that key.
  const [deliveryResult, overrideResult, poolResult] = await Promise.allSettled([
    fetchDeliveredModelConfig(options.config, signal),
    fetchModelOverrides(options.config, signal),
    fetchChatPool(ctx, options.model.baseUrl, apiKey, signal),
  ])
  signal?.throwIfAborted()

  const delivery = deliveryResult.status === 'fulfilled' ? deliveryResult.value : undefined
  const overrideSnapshot: ModelOverrideSnapshot | undefined = overrideResult.status === 'fulfilled'
    ? overrideResult.value
    : undefined
  const pool = poolResult.status === 'fulfilled' ? poolResult.value : undefined

  if (deliveryResult.status === 'rejected') {
    ctx.logger.warn(`openlux: model delivery unavailable; preserving local defaults (${errorText(deliveryResult.reason)})`)
  }
  if (overrideResult.status === 'rejected') {
    ctx.logger.warn(`openlux: model capability overrides unavailable; preserving the last confirmed answer (${errorText(overrideResult.reason)})`)
  }
  if (poolResult.status === 'rejected') {
    ctx.logger.warn(`openlux: token model directory unavailable; preserving the last usable list (${errorText(poolResult.reason)})`)
  }

  const reportedDelivery = delivery === undefined ? {} : { delivery }
  let ids: readonly string[]
  let source: NonNullable<SyncOutcome['source']>
  if (delivery !== undefined) {
    ids = delivery.chatModels.length > 0 ? delivery.chatModels : FALLBACK_MODELS
    source = delivery.chatModels.length > 0 ? 'console' : 'square'
  } else if (pool === undefined) {
    return { changed: false, skipped: 'no-pool', ...reportedDelivery }
  } else {
    // Old deployments without the delivery route keep the existing square-tag
    // fallback until they are upgraded.
    ids = deliveredIds(pool)
    source = 'square'
  }

  if (ids.length === 0) {
    return { changed: false, skipped: 'empty-result', source, ...reportedDelivery }
  }

  const overrides = overrideSnapshot?.overrides ?? new Map()
  // The `dsk-` decides whether free rows are seated at all; read once per
  // round, before the retry loop, so both attempts judge the same fact.
  const attest = await readAttest(ctx)
  const buildNext = (): readonly ModelEntry[] => {
    const current = currentModels(settings)
    const written = writtenModels(settings)
    const merged = merge(ids, written.filter(entry => !isManaged(entry)))
    // A failed profile read is unknown, not "remove every override". Carry
    // existing managed entries forward field-for-field where their ids remain.
    const previous = overrideSnapshot === undefined
      ? new Map(current.filter(isManaged).map(entry => [entry.id, entry]))
      : new Map<string, ModelEntry>()
    const membership = merged.map(entry => isManaged(entry) ? previous.get(entry.id) ?? entry : entry)
    const describe = (entry: ModelEntry): ModelEntry => described(
      entry,
      overrides,
      overrideSnapshot !== undefined,
      overrideSnapshot !== undefined && isManaged(entry),
    )
    const twins = membership.map(describe)
    // Free rows keep the real id; drop the unpaid twin (and any leftover
    // `<id>-free` alias from 09-18/09-20) so the adapter does not see two
    // rows for one model (`dsh-llm-pi-ai/lib/index.js:632`).
    const free = freeRowsFor(ctx, delivery, attest, twins, written, describe)
    const taken = new Set(free.flatMap(entry => {
      const real = realIdOf(entry.id)
      return real === entry.id ? [real, real + FREE_SUFFIX] : [entry.id, real]
    }))
    const rows = twins.filter(entry => !taken.has(entry.id))
    return seatFreeRows(rows, free, rows.filter(isManaged).length)
  }

  const prepared = buildNext()
  if (control.commit === false) {
    return {
      changed: false,
      skipped: 'prepared',
      source,
      models: prepared.length,
      managed: prepared.filter(isManaged).length,
      kept: prepared.filter(entry => !isManaged(entry)).length,
      ...reportedDelivery,
    }
  }

  const serializeWrite = control.serializeWrite ?? (async <T>(task: () => Promise<T>): Promise<T> => task())
  return serializeWrite(async () => {
    signal?.throwIfAborted()
    if (await control.canCommit?.() === false) {
      return { changed: false, skipped: 'stale', source, ...reportedDelivery }
    }

    let next = prepared
    let listChanged = false
    let routeChanged = false
    for (let attempt = 0; attempt < 2; attempt += 1) {
      signal?.throwIfAborted()
      if (await control.canCommit?.() === false) {
        return { changed: false, skipped: 'stale', source, ...reportedDelivery }
      }
      const descriptor = settings.describe().find(entry => entry.ns === PI_AI_NS)
      const current = currentModels(settings)
      next = buildNext()
      listChanged = !same(current, next)
      // The credential header and the legacy provider ride in the same write:
      // one revision check, one file write, and a header that never lands
      // without the rows that need it (or lingers after they are gone).
      const ops: SettingsOp[] = credentialOps(settings, next.some(isFreeRow) ? attest : undefined)
      routeChanged = ops.length > 0
      if (listChanged) ops.push({ op: 'set', path: ['providers', ROUTE, 'models'], value: next })
      if (ops.length === 0) break
      try {
        await settings.mutate(PI_AI_NS, ops, descriptor?.revision)
        break
      } catch (error: unknown) {
        if (!(error instanceof SettingsConflictError) || attempt > 0) throw error
      }
    }

    // The independent default namespace follows only after the model list
    // commits. A failure there never rolls the list back.
    let defaultChanged = false
    try {
      defaultChanged = await applyDefaultModel(settings, delivery, next)
    } catch (error: unknown) {
      ctx.logger.warn(`openlux: default model could not be aligned with the delivered list (${errorText(error)})`)
    }

    const free = next.filter(isFreeRow).length
    if (!listChanged) {
      return {
        changed: defaultChanged || routeChanged,
        skipped: 'unchanged',
        models: next.length,
        source,
        free,
        ...reportedDelivery,
      }
    }
    return {
      changed: true,
      source,
      models: next.length,
      managed: next.filter(isManaged).length,
      kept: next.filter(entry => !isManaged(entry)).length,
      described: next.filter(entry => entry['reasoningEfforts'] !== undefined).length,
      overridden: next.filter(entry => overrides.has(isFreeRow(entry) ? realIdOf(entry.id) : entry.id)).length,
      free,
      ...reportedDelivery,
    }
  })
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
