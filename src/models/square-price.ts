/**
 * Square-primary display prices for the official-card model picker.
 *
 * The renderer only paints a preformatted string. The arithmetic lives here so
 * the kernel patch never copies `calculateModelPrice`
 * (`new-yunwu-api/web/src/helpers/utils.js:1334`). Formulas match that helper's
 * **primary line** at logged-out group ratio 1 (or the cheapest `enable_groups`
 * entry when `/api/pricing` sends `group_ratio`):
 *
 * - per-token (`quota_type === 0`): `输入 $x / 输出 $y` for `/ 1M tokens`
 * - Gemini Omni Flash: `输入 $x / 文本 $y` (video output omitted on this one line)
 * - per-call: `$x / 次`
 * - per-second (name heuristic + hailuo): `$x / 秒`
 *
 * `/api/pricing` (compat) flattens non-ratio types to `quota_type === 1`, so
 * this cannot recover pixel / video-size units. AIGC "最低档" extra multipliers
 * in the square helper are also not copied — those models are not what this
 * picker is for. Missing or unusable rows yield an empty string; the picker
 * leaves the right column blank and still lets the user add.
 *
 * @module echoflowai-tools/models/square-price
 */

/** Untrusted `/api/pricing` fields this formatter reads. */
export interface SquarePriceRow {
  readonly model_name?: unknown
  readonly quota_type?: unknown
  readonly model_ratio?: unknown
  readonly model_price?: unknown
  readonly completion_ratio?: unknown
  readonly enable_groups?: unknown
  readonly omni_input_ratio?: unknown
  readonly omni_text_output_ratio?: unknown
}

const GEMINI_OMNI_INPUT_RATIO = 150
const GEMINI_OMNI_TEXT_RATIO = 900

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown): number | undefined {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(raw) ? raw : undefined
}

/**
 * Square `displayPrice` for USD with recharge off
 * (`useModelPricingData.js:244` `smartFixed`).
 */
function smartFixed(value: number, minDecimals = 3): string {
  if (!Number.isFinite(value)) return (0).toFixed(minDecimals)
  const abs = Math.abs(value)
  if (abs === 0 || abs >= 1) return value.toFixed(minDecimals)
  const magnitude = Math.floor(Math.log10(abs))
  const precision = Math.min(8, Math.max(4, -magnitude + 2))
  return value.toFixed(precision)
}

function displayUsd(usd: number): string {
  return `$${smartFixed(usd)}`
}

/**
 * Per-token primary line uses displayPrice then `toFixed(4)`
 * (`utils.js:1425-1491`). Omni / per-call keep displayPrice as-is.
 */
function tokenUsd(usd: number): string {
  const displayed = displayUsd(usd)
  const num = Number.parseFloat(displayed.replace(/[^0-9.]/g, ''))
  return Number.isFinite(num) ? `$${num.toFixed(4)}` : ''
}

/**
 * Logged-out square with group "all": cheapest enable_groups ratio, else 1
 * (`utils.js:1348-1368`). Compat `/api/pricing` has no `group_model_ratio`.
 */
export function cheapestGroupRatio(row: SquarePriceRow, groupRatio: Record<string, number>): number {
  const groups = row.enable_groups
  if (!Array.isArray(groups) || groups.length === 0) return 1
  let min = Number.POSITIVE_INFINITY
  for (const group of groups) {
    if (typeof group !== 'string' || group === '') continue
    const ratio = groupRatio[group]
    if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio < min) min = ratio
  }
  return min === Number.POSITIVE_INFINITY ? 1 : min
}

function isGeminiOmni(id: string): boolean {
  return id.startsWith('gemini-omni-flash')
}

function omniTierRatio(value: unknown, fallback: number): number {
  const raw = finiteNumber(value)
  return raw !== undefined && raw > 0 ? raw : fallback
}

function formatOmni(row: SquarePriceRow, group: number): string {
  const base = finiteNumber(row.model_price)
  if (base === undefined || base <= 0 || base >= 1) return ''
  const input = displayUsd(base * omniTierRatio(row.omni_input_ratio, GEMINI_OMNI_INPUT_RATIO) * group)
  const text = displayUsd(base * omniTierRatio(row.omni_text_output_ratio, GEMINI_OMNI_TEXT_RATIO) * group)
  return `输入 ${input} / 文本 ${text}`
}

function formatPerToken(row: SquarePriceRow, group: number): string {
  const modelRatio = finiteNumber(row.model_ratio)
  if (modelRatio === undefined) return ''
  const completion = finiteNumber(row.completion_ratio) ?? 0
  const input = tokenUsd(modelRatio * 2 * group)
  const output = tokenUsd(modelRatio * completion * 2 * group)
  if (input === '' || output === '') return ''
  return `输入 ${input} / 输出 ${output}`
}

/**
 * Compat `/api/pricing` maps every non-ratio type to `quota_type === 1`.
 * Per-second names match `isPerSecondBillingDisplayModel` plus hailuo
 * (`utils.js:1033`, `:1692`).
 */
function isPerSecondDisplay(id: string): boolean {
  const lower = id.toLowerCase()
  if (lower.includes('vidu') && !lower.includes('tts')) return true
  switch (id) {
    case 'aigc-video-kling':
    case 'kling-motion-control':
    case 'kling-avatar-image2video':
    case 'kling-3.0-turbo':
    case 'audio1.0':
    case 'grok-imagine-video':
    case 'grok-imagine-video-1.5-preview':
    case 'aigc-video-hailuo':
    case 'aigc-video-hailuo-h3':
      return true
    default:
      return false
  }
}

function formatFixed(row: SquarePriceRow, group: number, id: string): string {
  const price = finiteNumber(row.model_price)
  if (price === undefined) return ''
  const shown = displayUsd(price * group)
  return isPerSecondDisplay(id) ? `${shown} / 秒` : `${shown} / 次`
}

/** One-line square-primary label, or empty when this row has nothing to show. */
export function formatSquarePriceLabel(row: SquarePriceRow, groupRatio: Record<string, number>): string {
  const id = textOf(row.model_name)
  if (id === '') return ''
  const group = cheapestGroupRatio(row, groupRatio)
  if (isGeminiOmni(id)) return formatOmni(row, group)
  const quotaType = finiteNumber(row.quota_type)
  if (quotaType === 0) return formatPerToken(row, group)
  if (quotaType === 1) return formatFixed(row, group, id)
  return ''
}

export function formatSquarePrices(
  rows: readonly SquarePriceRow[],
  groupRatio: Record<string, number>,
): Record<string, string> {
  const prices: Record<string, string> = {}
  for (const row of rows) {
    const id = textOf(row.model_name)
    if (id === '') continue
    const label = formatSquarePriceLabel(row, groupRatio)
    if (label !== '') prices[id] = label
  }
  return prices
}
