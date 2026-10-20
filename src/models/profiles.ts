/**
 * The console's say over what a model can do — since 2026-09-11 v4 the *only*
 * say (`docs/desktop-model-console-only-plan.md`).
 *
 * Earlier revisions layered these statements over the kernel's installed
 * pi-ai catalog. That layer is gone: the catalog was keyed to each vendor's
 * own service, while every id in this route reaches whichever channel the
 * relay put behind that name, and the disagreements were real — the catalog
 * filed `deepseek-v4-flash` as text-only while the same id, on our key, reads
 * images fine (2026-08-22 probe). The catalog's one honest gift, context and
 * output capacities, now arrives the same console road, seeded into the
 * operations table instead of merged client-side.
 *
 * Three properties are borrowed from the older implementation rather than
 * reinvented, because each answers a failure this layer can cause:
 *
 * - **Unreachable console changes nothing.** The caller keeps what the last
 *   reachable round wrote; an override that cannot be read is unknown, not empty.
 * - **`rollout.enabled === false` voids the whole layer**, not row by row. That
 *   is the answer to "operations filled a row wrong" that does not need a
 *   release. The server withholds the rows too, so an old client cannot defeat
 *   the rollback.
 * - **An absent field does not state anything.** Only a value present in the
 *   payload overrides; an absent one leaves the entry (and, for capacities,
 *   the kernel's defaults) alone. Thinking is the exception the sync round
 *   owns: a reachable console that names no levels means "does not think".
 *
 * @module echoflowai-tools/models/profiles
 */

import type { ConsoleAccess } from '../market/console.ts'

/** Request modalities a `models[]` entry may declare, in the kernel's spelling. */
type Modality = 'text' | 'image'

/**
 * Thinking levels the settings schema accepts, in the kernel's own order
 * (`@earendil-works/pi-ai/dist/models.js:391`, `EXTENDED_THINKING_LEVELS` —
 * a kernel fact, cited from the kernel's copy; this plugin no longer depends
 * on the pi-ai package itself).
 */
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

type ThinkingLevel = typeof THINKING_LEVELS[number]

/**
 * Dialects the installed kernel actually dispatches on — the nine explicit
 * branches of `openai-completions.js:560-623` plus the default `openai`. A
 * format outside this list would fall into the kernel's default branch and
 * speak the wrong dialect, so a row carrying one is dropped per-field rather
 * than written; admin-server whitelists the same set on the way in
 * (`desktopThinkingFormats`), so hitting this here means server and client
 * kernels disagree — an old client is the safe party to abstain.
 */
const THINKING_FORMATS: ReadonlySet<string> = new Set([
  'openai', 'zai', 'qwen', 'qwen-chat-template', 'chat-template',
  'deepseek', 'openrouter', 'ant-ling', 'together', 'string-thinking',
])

/**
 * The console's thinking statement: levels, dialect and the
 * `reasoning_effort` compatibility switch, one atomic group. Empty `efforts`
 * is the explicit "does not think" — the caller deletes the entry's
 * `reasoningEfforts` and `compat`. The group is never split because every
 * dialect branch in the kernel is gated on the model reasoning at all: a
 * dialect without levels never fires, and levels without the dialect speak
 * the wrong protocol.
 */
export interface ThinkingOverride {
  readonly efforts: Readonly<Partial<Record<ThinkingLevel, string | null>>>
  readonly format?: string
  readonly supportsReasoningEffort?: boolean
}

/** What the console states about one model; absent keys state nothing. */
export interface ModelOverride {
  readonly input?: readonly Modality[]
  readonly thinking?: ThinkingOverride
  readonly name?: string
  readonly contextWindow?: number
  readonly maxTokens?: number
}

/** Model id to the console's statement about it. */
export type ModelOverrides = ReadonlyMap<string, ModelOverride>

/** Rollout state is distinct from an empty override table. */
export interface ModelOverrideSnapshot {
  readonly enabled: boolean
  readonly overrides: ModelOverrides
}

/**
 * The scope naming "the platform's own provider" in the profile table.
 *
 * The column holds a desktop provider id, and the older shell called this route
 * `yunwu` while this one calls it `openlux` (`sync.ts`'s `ROUTE`, fixed because
 * the credential name derives from it). One row therefore describes the model
 * for whichever shell is reading, and the server's own validator only accepts
 * `yunwu` or a user-defined `cm-*` — so matching on this constant is what keeps
 * a single row from having to be duplicated per shell. Rows in a `cm-*` scope
 * describe a model behind somebody else's base URL and are not ours to apply.
 */
const BUILTIN_SCOPE = 'yunwu'

/** Budget for the override read; the same one the delivery snapshot takes. */
const PROFILES_TIMEOUT_MS = 8_000

/**
 * One row of `data.modelCapabilities.items` as the relay sends it
 * (`new-yunwu-api/controller/desktop_model_profile_client.go`
 * `clientDesktopModelCapability`). Five override fields, each present only
 * when the console has a fact about it: `input`, `thinking` (the declaration
 * JSON passed through verbatim), `name`, `context_window`,
 * `max_output_tokens`. `updated_at` is listed so the wire shape is documented
 * in one place; nothing here acts on it.
 */
interface WireCapability {
  readonly model_name?: unknown
  readonly provider_scope?: unknown
  readonly category?: unknown
  readonly input?: unknown
  readonly thinking?: unknown
  readonly name?: unknown
  readonly context_window?: unknown
  readonly max_output_tokens?: unknown
  readonly updated_at?: unknown
}

interface ApiEnvelope {
  readonly success?: boolean
  readonly message?: string
  readonly data?: {
    readonly modelCapabilities?: {
      readonly rollout?: { readonly enabled?: unknown }
      readonly items?: unknown
    }
  }
}

/**
 * Read the console's capability overrides for this route.
 *
 * All five fields are consumed (2026-09-11 declaration plan): the console can
 * override modalities, the whole thinking declaration, the display name and
 * the two capacity numbers. Each field is validated on its own and an invalid
 * one is dropped *per-field* — a row whose thinking JSON is unreadable still
 * delivers its modality statement, because the fields fall back to the
 * catalog independently on the applying side too.
 * @param access - console origin and token reader.
 * @param signal - caller cancellation.
 * @returns the overrides, empty when the rollout switch is off.
 * @throws when the console cannot be reached or answers something unreadable.
 */
export async function fetchModelOverrides(
  access: ConsoleAccess,
  signal?: AbortSignal,
): Promise<ModelOverrideSnapshot> {
  const token = await access.apiKey()
  if (token === undefined || token.trim() === '') throw new Error('no desktop token')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROFILES_TIMEOUT_MS)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(`${access.baseUrl.replace(/\/+$/, '')}/api/desktop-config`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`desktop config returned HTTP ${String(response.status)}`)
    }
    const envelope = await response.json() as ApiEnvelope
    if (envelope.success !== true) {
      throw new Error(envelope.message?.trim() || 'desktop config returned an invalid envelope')
    }
    const section = envelope.data?.modelCapabilities
    if (section?.rollout?.enabled !== true) return { enabled: false, overrides: new Map() }
    return { enabled: true, overrides: parseItems(section.items) }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

/**
 * Turn the delivered rows into per-model statements.
 *
 * A row that names no model, sits in another provider's scope, or describes a
 * category this route does not write is dropped rather than guessed at. So is
 * one that states nothing this module acts on: an override that says nothing
 * must not shadow the catalog with an empty answer.
 * @param items - the payload's rows.
 * @returns model id to statement.
 */
function parseItems(items: unknown): ModelOverrides {
  const out = new Map<string, ModelOverride>()
  if (!Array.isArray(items)) return out
  for (const item of items as readonly WireCapability[]) {
    const id = typeof item.model_name === 'string' ? item.model_name.trim() : ''
    if (id === '') continue
    const scope = typeof item.provider_scope === 'string' ? item.provider_scope.trim() : BUILTIN_SCOPE
    if (scope !== BUILTIN_SCOPE) continue
    // The category column decides which of the client's model lists a row
    // belongs to; only chat entries land in the route this module writes.
    const category = typeof item.category === 'string' ? item.category.trim() : 'chat'
    if (category !== 'chat') continue
    // Each field stands alone: an unreadable one is dropped without taking the
    // row's other statements with it.
    const input = parseModalities(item.input)
    const thinking = parseThinking(item.thinking)
    const name = typeof item.name === 'string' && item.name.trim() !== '' ? item.name.trim() : undefined
    const contextWindow = parseTokens(item.context_window)
    const maxTokens = parseTokens(item.max_output_tokens)
    const override: ModelOverride = {
      ...input === undefined ? {} : { input },
      ...thinking === undefined ? {} : { thinking },
      ...name === undefined ? {} : { name },
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
    }
    if (Object.keys(override).length === 0) continue
    out.set(id, override)
  }
  return out
}

/**
 * A token capacity, or `undefined` when the row makes no usable claim. The
 * server refuses zero and sub-1024 values on the way in (they are almost
 * always someone typing "128" for 128k), so anything non-positive arriving
 * here is a statement this shell cannot write.
 * @param raw - the row's `context_window` or `max_output_tokens` as received.
 * @returns the positive integer, or `undefined`.
 */
function parseTokens(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : undefined
}

/**
 * The console's thinking declaration, or `undefined` when the field is absent
 * or unreadable.
 *
 * Validation mirrors admin-server's `NormalizeDesktopThinkingDeclaration`
 * rather than trusting it: the relay passes the column through verbatim, and a
 * malformed dict written past the server's guard must degrade to "no
 * statement" here — never into a `reasoningEfforts` the settings schema
 * refuses, which would strand the whole entry. Rules: `efforts` keys within
 * the kernel's levels, non-`off` values non-empty wire strings, `off` either
 * `null` or a wire string, a non-empty dict needs at least one non-`off`
 * level, and the dialect must be one the kernel dispatches on. An empty
 * `efforts` is the explicit "does not think"; `format` and the effort switch
 * are meaningless beside it and are ignored.
 * @param raw - the row's `thinking` as received.
 * @returns the atomic thinking group, or `undefined`.
 */
function parseThinking(raw: unknown): ThinkingOverride | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const value = raw as { efforts?: unknown; format?: unknown; supports_reasoning_effort?: unknown }
  if (typeof value.efforts !== 'object' || value.efforts === null || Array.isArray(value.efforts)) {
    return undefined
  }
  const efforts: Partial<Record<ThinkingLevel, string | null>> = {}
  let offered = 0
  for (const [level, wire] of Object.entries(value.efforts as Record<string, unknown>)) {
    if (!(THINKING_LEVELS as readonly string[]).includes(level)) return undefined
    if (level === 'off') {
      if (wire !== null && (typeof wire !== 'string' || wire === '')) return undefined
      efforts[level as ThinkingLevel] = wire as string | null
      continue
    }
    if (typeof wire !== 'string' || wire === '') return undefined
    efforts[level as ThinkingLevel] = wire
    offered += 1
  }
  const levels = Object.keys(efforts)
  if (levels.length > 0 && offered === 0) return undefined
  if (levels.length === 0) return { efforts: {} }

  const format = value.format
  if (format !== undefined && (typeof format !== 'string' || !THINKING_FORMATS.has(format))) {
    return undefined
  }
  const supports = value.supports_reasoning_effort
  if (supports !== undefined && typeof supports !== 'boolean') return undefined
  return {
    efforts,
    ...format === undefined ? {} : { format },
    ...supports === undefined ? {} : { supportsReasoningEffort: supports },
  }
}

/**
 * The console's modality list in the kernel's spelling, or `undefined` when
 * the row states nothing about input.
 *
 * The kernel reads an empty list the same as an absent one — "no answer, ask
 * the next level" (`dsh-llm-pi-ai/lib/index.js:286-288`, `declaredInput`) — and
 * accepts exactly `text` and `image` (`:273-276`, `MODALITIES`). So an array
 * that is missing, empty, or carries a value the kernel does not know is not a
 * statement this shell can write; it is dropped rather than narrowed, because a
 * narrowed list could turn "text and something we do not know" into "text
 * only" and refuse an attachment the model would have taken.
 * @param raw - the row's `input` as received.
 * @returns the modalities, or `undefined` when the row makes no usable claim.
 */
function parseModalities(raw: unknown): readonly Modality[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: Modality[] = []
  for (const value of raw as readonly unknown[]) {
    if (value !== 'text' && value !== 'image') return undefined
    if (!out.includes(value)) out.push(value)
  }
  return out
}
