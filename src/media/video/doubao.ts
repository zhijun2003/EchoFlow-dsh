/**
 * Doubao Seedance: Volcengine Ark's task protocol, on two paths for two families.
 *
 * The catalogue types these models `Doubao video (Async)` and `Doubao video`,
 * and the paths those two declare are different — `/volc/v1/contents/generations/tasks`
 * for the 1.x family, `/api/v3/contents/generations/tasks` for 2.x — while the
 * body and the polling shape are identical. So this is one adapter that reads
 * the path off the endpoint type the catalogue gave the model, the same way the
 * openclaw-era plugin let Vidu pick between its four.
 *
 * **This vendor is not the unified entry, however much its old list said so.**
 * The openclaw-era plugin filed both Doubao types under `/v1/video/create`;
 * sending a live request there on 2026-08-21 was answered
 * `HTTP 429：未找到该模型的定价配置`, because pricing is per route and a model that
 * arrives at the wrong one is refused before a channel is even picked. The paths
 * above come from `models.endpoints` in the platform's own library and from the
 * relay's routing table and integration fixture
 * (`router/relay-router.go`, `controller/relay_integration_test.go`, whose
 * Seedance case posts exactly `{model, content:[{type:'text',text}]}`).
 *
 * The wire contract agrees across Volcengine's own documentation and three
 * independent gateway docs: submit answers `{id}`, the task walks
 * `queued` → `running` → `succeeded`/`failed`, and the artifact is
 * `content.video_url` — a signed link that expires in 24 hours, which is fine
 * here because this plugin downloads immediately.
 *
 * `resolution` is sent explicitly rather than left to the vendor's default, the
 * same call the openclaw-era plugin made for Bailian after measuring 1080P at
 * 162s / 8.56 MB against 720P at 104s / 4.75 MB. `duration` is a range on this
 * family (4–15 on 2.x), not a discrete set, so it is passed through unchecked —
 * declaring a set would refuse lengths the route serves.
 *
 * @module echoflowai-tools/media/video/doubao
 */

import { AccountRequestError, requestJson } from '../../account/http.ts'
import type {
  VideoModelSpec,
  VideoProvider,
  VideoSubmitInput,
  VideoSubmitted,
  VideoTaskState,
  VideoWire,
} from './provider.ts'
import { object, text, VideoGenerationError } from './provider.ts'

const SUBMIT_TIMEOUT_MS = 60_000
const POLL_TIMEOUT_MS = 30_000

/** The endpoint type that routes through the Ark-v3 mount. */
const V3_TYPE = 'Doubao video'

/** Where each family's tasks live, relative to the site root. */
const PATHS = {
  volc: '/volc/v1/contents/generations/tasks',
  v3: '/api/v3/contents/generations/tasks',
} as const

/**
 * The frame size to ask for.
 *
 * 720p is the one both families accept — the 2.0 *fast* variants refuse
 * `1080p` outright — and it is the cheaper, faster half of a choice the caller
 * has no way to express here.
 */
const RESOLUTION = '720p'

/** Statuses that end the task, from Ark's own documented set. */
const DONE = 'succeeded'
const FAILED = new Set(['failed', 'expired', 'cancelled', 'canceled'])

/**
 * Where a first frame gets hosted so the route's channels can fetch it.
 *
 * Ark's own documentation takes base64 data URIs in `image_url.url`, but the
 * channels actually serving this route do not: on 2026-09-24 the live channel
 * (灵客*sd2.0 #6519) answered `InvalidParameter: 首帧任务缺少 first_frame 图片`
 * to a body whose only difference from an accepted one was an inlined data URI
 * where the accepted body had an https URL (relay detail logs 20367387666 vs
 * 20367275496 — the latter's image was actually fetched and measured, so the
 * URL form is what gets recognized). The relay wraps that 400 as HTTP 503
 * "该模型服务暂时不可用", which is why this looked like an outage first.
 *
 * The URL form the route's own callers use is this host: the relay's Lab and
 * Playground upload first frames here before submitting
 * (`new-yunwu-api/web/src/helpers/utils.js` `IMAGEPROXY_UPLOAD_URL`,
 * `Lab/shared/labShared.js` `uploadToImageHost` — multipart field `file`,
 * answer `{url}`). Round-tripped live 2026-09-24: a 600 KB JPEG came back
 * byte-identical from the returned URL.
 */
const IMAGE_HOST_UPLOAD_URL = 'https://imageproxy.zhongzhuan.chat/api/upload'

/** Upload budget: the frame can be several MB and the host is remote. */
const UPLOAD_TIMEOUT_MS = 60_000

/**
 * Trade an inlined first frame for a URL the channel will actually fetch.
 *
 * Deliberately does **not** send `wire.headers`: the image host is a public,
 * unauthenticated service, and the desktop bearer token must not leave the
 * relay it belongs to.
 */
async function hostedFrameUrl(wire: VideoWire, reference: string): Promise<string> {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(reference)
  if (match === null) return reference
  const mediaType = match[1]!
  const bytes = Buffer.from(match[2]!, 'base64')
  const form = new FormData()
  form.append(
    'file',
    new Blob([bytes], { type: mediaType }),
    `first-frame.${mediaType === 'image/jpeg' ? 'jpg' : mediaType.split('/')[1] ?? 'png'}`,
  )
  let reply
  try {
    reply = await requestJson(wire.ctx, IMAGE_HOST_UPLOAD_URL, { method: 'POST', body: form }, UPLOAD_TIMEOUT_MS, wire.signal)
  } catch (error: unknown) {
    throw new VideoGenerationError(error instanceof AccountRequestError
      ? `首帧图片上传图床失败：${error.message}`
      : `首帧图片上传图床失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const url = text(object(reply.body)?.['url'])
  if (!reply.response.ok || url === undefined) {
    throw new VideoGenerationError(`首帧图片上传图床被拒（HTTP ${String(reply.response.status)}），没拿到可引用的图片地址。`)
  }
  return url
}

/** The vendor's replies, as far as this module reads them. */
interface ArkTask {
  readonly id?: unknown
  readonly task_id?: unknown
  readonly status?: unknown
  readonly content?: unknown
  readonly error?: unknown
  readonly output?: unknown
  readonly message?: unknown
}

/**
 * Which mount serves this model.
 *
 * The catalogue's endpoint type decides. Without one — the catalogue was
 * unreadable and a fallback name got us here — the family is read off the name,
 * because `-2-0-` is what the platform's own two rows differ by.
 */
function pathFor(model: string, types: readonly string[] | undefined): string {
  if (types !== undefined && types.length > 0) {
    return types.includes(V3_TYPE) ? PATHS.v3 : PATHS.volc
  }
  return model.includes('-2-0-') ? PATHS.v3 : PATHS.volc
}

export const doubaoProvider: VideoProvider = {
  id: 'doubao',
  endpointTypes: ['Doubao video (Async)', V3_TYPE],
  // Both spellings, one per family, so an unreadable catalogue still routes to
  // the right mount. Only names with a live channel on this route are listed.
  fallbackModels: ['doubao-seedance-1-0-pro-250528', 'doubao-seedance-2-0-260128'],

  spec(model: string): VideoModelSpec {
    return {
      aspects: ['16:9', '9:16'],
      firstFrame: true,
      // The 2.5 family films i2v only in the frame's own shape: the route
      // answers `Seedance 2.5 首帧 / 首尾帧任务的 ratio 仅支持 adaptive（跟随首帧图）`
      // to any concrete ratio beside a first frame — including the orientation
      // this tool derives from the frame itself, hit live 2026-09-24 twice
      // (with and without an explicit aspect). Declaring it here moves the
      // refusal of an explicit aspect into the same turn; `submit` below sends
      // the one spelling the route accepts.
      ...model.includes('-2-5-') ? { referenceDecidesShape: true } : {},
    }
  },

  async submit(wire: VideoWire, input: VideoSubmitInput): Promise<VideoSubmitted> {
    const path = pathFor(input.model, input.endpointTypes)
    const reference = input.images?.[0]
    // One content array carries prompt and reference alike. `role: 'first_frame'`
    // goes on both mounts: successful 1.x submissions from other callers on this
    // route carry it, so it is not a 2.x-only field. The frame itself must be a
    // URL, not inlined bytes — see IMAGE_HOST_UPLOAD_URL.
    const content: Record<string, unknown>[] = [{ type: 'text', text: input.prompt }]
    if (reference !== undefined) {
      content.push({ type: 'image_url', image_url: { url: await hostedFrameUrl(wire, reference) }, role: 'first_frame' })
    }
    const body: Record<string, unknown> = {
      model: input.model,
      content,
      resolution: RESOLUTION,
      // 2.5 + first frame takes only `adaptive` (the shape follows the frame);
      // a queued submission from another caller on this route spells it
      // explicitly rather than omitting the field (relay detail log
      // 20367844039), so this does too. Text-only 2.5 jobs and the other
      // families keep taking concrete ratios — proven by queued submissions.
      ...reference !== undefined && input.model.includes('-2-5-')
        ? { ratio: 'adaptive' }
        : input.aspectRatio === undefined ? {} : { ratio: input.aspectRatio },
      ...input.durationSeconds === undefined ? {} : { duration: Math.round(input.durationSeconds) },
    }
    let reply
    try {
      reply = await requestJson(wire.ctx, `${wire.root}${path}`, {
        method: 'POST',
        headers: { ...wire.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, SUBMIT_TIMEOUT_MS, wire.signal)
    } catch (error: unknown) {
      throw new VideoGenerationError(error instanceof AccountRequestError
        ? error.message
        : `豆包视频提交失败：${error instanceof Error ? error.message : String(error)}`)
    }
    const answer = (reply.body ?? {}) as ArkTask
    if (!reply.response.ok) {
      const detail = failureOf(answer)
      throw new VideoGenerationError(detail === undefined
        ? `豆包视频接口返回 HTTP ${String(reply.response.status)}。`
        : `豆包视频接口拒绝了请求（HTTP ${String(reply.response.status)}）：${detail}`)
    }
    const taskId = text(answer.id) ?? text(answer.task_id)
    if (taskId === undefined) {
      throw new VideoGenerationError('豆包视频提交没有返回任务号（id），无法跟踪这次生成。')
    }
    return { taskId, handle: path }
  },

  async poll(wire: VideoWire, task: VideoSubmitted): Promise<VideoTaskState> {
    // The mount the submit used, not one derived from the id. Both mounts answer
    // **HTTP 200** for any id: the one that owns the task returns its status,
    // the other returns the stub `{"id":"…"}`. A finished 2.x task read through
    // the 1.x mount therefore looks like a task that is still running, forever —
    // which is exactly what a live run did before this was carried across.
    const path = task.handle ?? PATHS.volc
    const reply = await requestJson(
      wire.ctx,
      `${wire.root}${path}/${encodeURIComponent(task.taskId)}`,
      { headers: wire.headers },
      POLL_TIMEOUT_MS,
      wire.signal,
    )
    const answer = (reply.body ?? {}) as ArkTask
    if (!reply.response.ok) {
      throw new Error(failureOf(answer) ?? `HTTP ${String(reply.response.status)}`)
    }
    const status = text(answer.status)?.toLowerCase() ?? 'running'
    const url = text(object(answer.content)?.['video_url'])
    return {
      status,
      ...url === undefined ? {} : { url },
      done: status === DONE || url !== undefined,
      failed: FAILED.has(status),
      ...failureOf(answer) === undefined ? {} : { failure: failureOf(answer)! },
    }
  },
}

/**
 * The vendor's own wording, out of whichever field carried it.
 *
 * `error` is documented as an object and arrives as a **string** on this route:
 * a real failed task read
 * `{"status":"failed","error":"[OutputAudioSensitiveDetected]…","output":{"message":"…"}}`.
 * Reading only the object form is why the first failure surfaced to the user as
 * "错误信息没有给出具体原因" — for a content-safety refusal, the reason is the
 * whole answer.
 */
function failureOf(answer: ArkTask): string | undefined {
  if (typeof answer.error === 'string') return text(answer.error)
  const error = object(answer.error)
  const output = object(answer.output)
  return text(error?.['message']) ?? text(error?.['code']) ?? text(output?.['message']) ?? text(answer.message)
}
