/**
 * Desktop feedback submission, ported from the previous shell.
 *
 * The contract is the old shell's `yunwu-desktop/src/main/feedback-client.ts`
 * verbatim — same categories, the same 6 × 10MB image budget, the same
 * multipart field names — because the receiving end already exists twice with
 * that exact shape: admin-server `controller/desktop_feedback.go` (the old
 * shell's route) and new-yunwu-api `controller/desktop_feedback_client.go`
 * (the client plane this shell talks to). Both write one shared
 * `desktop_feedbacks` table, so feedback from every station — the main site
 * and channel builds alike — lands in the main station's dm_feedback page.
 *
 * It posts to the same console the market reads from (`desktopConfigAccess`):
 * the desktop knows exactly one station baseUrl, and channel domains carry
 * new-yunwu-api but not admin-server, so the client plane is the only address
 * every install can reach (platform-data: 中转站只读镜像、桌面端只认一个站).
 *
 * Diagnostics stay an explicit opt-in and carry only the runtime environment —
 * no logs, sessions, workspaces, tokens or user files — the same privacy rule
 * the old shell wrote down.
 */

import { platform, release, arch } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { ConsoleAccess } from '../market/console.ts'
import { asEnvelope, requestJson } from './http.ts'

/** Mirrors the server's whitelist (`IsValidDesktopFeedbackCategory`). */
export const FEEDBACK_CATEGORIES = ['problem', 'suggestion', 'other'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export const FEEDBACK_MAX_IMAGES = 6
export const FEEDBACK_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const FEEDBACK_MAX_CONTENT_CHARS = 10_000
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
])

/**
 * Images travel as bytes, not paths: the renderer picked them from a file
 * input, and the host must not re-open user files by name — the same rule the
 * composer attachment path follows (`files/stage.ts`).
 */
export interface FeedbackImagePayload {
  readonly name: string
  readonly type: string
  readonly dataBase64: string
}

export interface FeedbackPayload {
  readonly category: FeedbackCategory
  readonly content: string
  readonly page: string
  readonly includeDiagnostics?: boolean
  readonly images?: readonly FeedbackImagePayload[]
}

export interface FeedbackReceipt {
  readonly feedbackId: number
}

/**
 * The launcher's update adapter, when this profile is composed with the
 * desktop shell. Probed rather than required: a headless boot has no
 * launcher, and feedback still works — the row just carries no app version.
 */
interface VersionedDesktopRuntime {
  readonly updates?: { readonly currentVersion?: string }
}

/** One submission has a longer budget than a console read: it may carry 60MB of images. */
const FEEDBACK_TIMEOUT_MS = 60_000

function feedbackPayloadOf(payload: unknown): FeedbackPayload {
  const body = (payload ?? {}) as Partial<FeedbackPayload>
  const category = body.category
  if (typeof category !== 'string' || !FEEDBACK_CATEGORIES.includes(category as FeedbackCategory)) {
    throw new Error('请选择反馈类型')
  }
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (content === '') throw new Error('请填写反馈内容')
  if (content.length > FEEDBACK_MAX_CONTENT_CHARS) throw new Error('反馈内容不能超过10000字')
  const images = Array.isArray(body.images) ? body.images : []
  if (images.length > FEEDBACK_MAX_IMAGES) throw new Error('最多添加6张图片')
  for (const image of images) {
    if (typeof image?.dataBase64 !== 'string' || typeof image.type !== 'string') {
      throw new Error('图片数据不完整')
    }
    if (!IMAGE_TYPES.has(image.type)) throw new Error(`不支持图片格式：${image.name ?? image.type}`)
  }
  return {
    category: category as FeedbackCategory,
    content,
    page: typeof body.page === 'string' && body.page.trim() !== '' ? body.page.trim() : 'unknown',
    includeDiagnostics: body.includeDiagnostics === true,
    images,
  }
}

/**
 * Submit one feedback record to the console's client plane.
 * @param ctx - host context, for the request and the probed launcher runtime.
 * @param access - console origin and token reader (the market's own access).
 * @param payload - renderer-shaped submission, validated here.
 * @param signal - caller cancellation.
 * @returns the stored feedback id.
 */
export async function submitFeedback(
  ctx: Context,
  access: ConsoleAccess,
  payload: unknown,
  signal?: AbortSignal,
): Promise<FeedbackReceipt> {
  const submission = feedbackPayloadOf(payload)
  const token = await access.apiKey()
  if (token === undefined || token === '') {
    throw new Error('未登录云雾账号，无法提交反馈')
  }

  const form = new FormData()
  form.set('category', submission.category)
  form.set('content', submission.content)
  form.set('page', submission.page)
  const version = (ctx.get('desktopRuntime') as VersionedDesktopRuntime | undefined)?.updates?.currentVersion
  if (version !== undefined && version !== '') form.set('app_version', version)
  form.set('platform', `${platform()} ${release()} (${arch()})`)

  if (submission.includeDiagnostics === true) {
    // 只上传运行环境，不读取日志、会话、工作区、令牌或用户文件（老壳同款约束）。
    form.set('diagnostics', JSON.stringify({
      locale: process.env.LANG ?? '',
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node,
    }, null, 2))
  }

  for (const image of submission.images ?? []) {
    const bytes = Buffer.from(image.dataBase64, 'base64')
    if (bytes.byteLength === 0) throw new Error('图片内容为空')
    if (bytes.byteLength > FEEDBACK_MAX_IMAGE_BYTES) {
      throw new Error(`图片“${image.name}”超过10MB`)
    }
    form.append('images', new Blob([bytes], { type: image.type }), image.name)
  }

  const { response, body } = await requestJson(
    ctx,
    `${access.baseUrl}/api/desktop-feedback`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
    FEEDBACK_TIMEOUT_MS,
    signal,
  )
  const envelope = asEnvelope<{ feedback_id?: number }>(body)
  const feedbackId = envelope.data?.feedback_id
  if (!response.ok || envelope.success !== true || typeof feedbackId !== 'number') {
    throw new Error(envelope.message ?? `反馈服务返回 HTTP ${response.status}`)
  }
  return { feedbackId }
}
