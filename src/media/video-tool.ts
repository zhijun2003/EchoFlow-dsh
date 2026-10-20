/**
 * The model-facing video tool.
 *
 * ## Why this call waits for the clip instead of returning a job id
 *
 * A clip takes 45 seconds to six minutes (100s and 118s measured on the default
 * model, 318s on the slowest vendor this product has shipped). The first version
 * of this tool handed that wait to the kernel's job registry (`ctx.jobs`, the way
 * `tool-bash` backgrounds a command) and returned a job id at once. A live run on
 * 2026-09-15 showed what that shape costs the user, and neither cost is cosmetic:
 *
 * - **A produced-file chip that opened nothing.** The deliverables row publishes
 *   a call's `locations` the moment its `tool/result` succeeds
 *   (`dsh-client-ui-deliverables/lib/client.js`, `deliverablesDefinition.update`:
 *   a non-error `tool/result` appends the stored call view's paths). A tool
 *   that succeeds by returning a job id therefore publishes the path minutes
 *   before the file exists.
 * - **Two answers to one request.** A completion reaches an idle owner only as a
 *   `followup`, which opens a turn of its own (`dsh-tool-jobs` README,
 *   「完成通知」: 空闲的所有者则被 follow-up 唤醒); the model then reads
 *   `job_output` and narrates the result a second time under a second row of
 *   feedback controls. A busy owner would take the notice as an injected step,
 *   but the tool's own text told the model to answer at once, so the owner was
 *   always idle by the time the clip landed.
 *
 * Waiting inside the call removes both: the result — and with it the chip —
 * lands only after the file is written, and the model closes the turn once.
 * The kernel permits the wait. The agent loop has no step or turn timer
 * (`dsh-agent-loop/lib/index.js` reacts only to `signal.aborted`), and the one
 * tool-call deadline is opt-in per tool (`dsh-tool-call-timeout-policy` README:
 * 未声明预算的工具会原样委托), which this tool does not declare. The
 * conversation's stop control aborts `exec.signal`, and every request below
 * forwards it. This is also the shape WorkBuddy shows its user: one tool block
 * whose status updates in place, no background-job notion in its transcript.
 *
 * What is given up, knowingly: the jobs panel's `running 60%` line — a call
 * view is computed from arguments and a result view exists only after
 * `execute`, so there is no in-flight progress channel — and `job_kill` from
 * the model's side; the user stops the turn instead. Most upstream routes
 * cannot cancel a submitted task either way, so a stopped run may still be
 * billed, and the refusal says so.
 *
 * ## Why the artifact is a file rather than an attachment
 *
 * The attachment store is images only — its `ImageMediaType` has no video
 * member and its reader decodes what it stores — so video bytes have nowhere to
 * go inside it. The kernel's answer for a produced file is the deliverables row:
 * a successful call whose view declares `kind:'edit'` with a location publishes
 * that path for the turn, and clicking it hands the path to the host's own
 * opener (`host.openPath` → the OS default player). No plugin of ours draws it.
 *
 * That row reads the **call** view, not the result view, and a call view is
 * computed from the arguments alone because replay calls it again
 * (`dsh-tools`, `presentCall`). So the destination path must be derivable from
 * the arguments: {@link videoArtifactPath} is that derivation, and the call
 * writes exactly where the card already said it would.
 *
 * @module echoflowai-tools/media/video-tool
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { AccountRequestError } from '../account/http.ts'
import type { ConsoleAccess } from '../market/console.ts'
import { size, sniffImageType } from './images.ts'
import { VIDEO_TOOL_NAME } from './name.ts'
import type { SessionEventSource, SessionImage } from './session-images.ts'
import { findLatestImage } from './session-images.ts'
import type { GeneratedVideo, VideoRequest } from './video.ts'
import { generateVideo, VideoGenerationError } from './video.ts'
import type { VideoProvider } from './video/provider.ts'
import {
  defaultVideoModel,
  readVideoCatalog,
  resolveVideoModel,
  videoDefaultRefusal,
  videoModelRefusal,
} from './video/registry.ts'

/**
 * Frame shapes offered in the schema.
 *
 * The union of what the vendors here accept, not the intersection: a vendor
 * with no aspect field of its own (MiniMax) refuses the shape it cannot honour
 * by name at call time, which tells the user their portrait clip is not
 * happening instead of quietly handing them a landscape one.
 */
const OFFERED_ASPECTS = ['16:9', '9:16']

function describe(firstFrame: boolean): string {
  return 'Generate a short video from a text prompt. '
    + 'This call waits for the clip and returns only once the file is saved locally; one to six minutes is normal. '
    + 'Do not start any other job for it, do not poll, and do not answer the user before it returns. '
    + 'Write the prompt as one self-contained shot description: subject, action, camera, setting, light, mood. '
    + 'The video model sees only this text, not the conversation, and Chinese prompts work as they are. '
    + (firstFrame
      ? 'To animate a picture, describe the motion in the prompt and point at the picture one of two ways: '
        + 'when the user\'s message carries a local image file path, pass that path verbatim as first_frame_path; '
        + 'when the picture was generated or shown in this conversation, or the user attached it as a picture you can see, '
        + 'set animate_last_image and the newest one becomes the first frame. '
      : '')
    + 'The saved file is shown to the user as a produced file they can open; '
    + 'you never see the video itself, so do not describe or judge what is in it.'
}

/** What the tool reads out of its own composition. */
export interface VideoToolOptions {
  /** Route origin and token reader, shared with the account face. */
  readonly access: ConsoleAccess
  /** Capture one token for catalogue selection, submit, and polling. */
  readonly captureAccess?: () => Promise<ConsoleAccess>
  /** Model to film with, or a runtime reader updated by server delivery. */
  readonly model?: string | (() => string | undefined)
}

/** The arguments this tool's path derivation depends on. */
export interface VideoArgs {
  readonly prompt: string
  readonly aspect_ratio?: string
  readonly duration?: number
  readonly animate_last_image?: boolean
  readonly first_frame_path?: string
  readonly model?: string
}

/**
 * One refusal's "use this instead", when there is one to give.
 * @param alternative - a model this key can film with, or undefined.
 * @param lead - the sentence to put in front of the name.
 * @param none - what to say when nothing here fits.
 * @returns the clause to append to the refusal.
 */
function suggestion(alternative: string | undefined, lead: string, none: string): string {
  return alternative === undefined ? none : `${lead}${alternative}。`
}

/**
 * Where one request's clip will be written.
 *
 * Pure in its inputs, because the produced-files row is drawn from the call view
 * and the call view is recomputed on replay. The digest covers everything that
 * changes the output, so asking for the same clip twice reuses one slot (the
 * second run overwrites the first) while any changed argument gets its own file.
 *
 * One consequence to know rather than to debug: an `animate_last_image`
 * reference is *not* an argument (nothing shows the model an attachment id, see
 * `media/session-images.ts`), so two such calls that share a prompt but animate
 * different pictures share one slot. `first_frame_path` is the handle that
 * closes that gap where one exists — a path *is* quotable, so it joins the
 * digest — and it joins conditionally rather than as a sixth column, because
 * old sessions replay this derivation: widening the identity array for every
 * call would move the produced-file rows of already-written clips to paths no
 * job ever wrote.
 *
 * The identity carries the model **the call named**, not the one it films with.
 * They differ only when nobody named one, and then the answer comes from the
 * live catalogue — which the call view cannot read, because it is recomputed
 * synchronously on every render including replays. Keying on the resolved model
 * would therefore point the produced-file row at a path the job never wrote.
 * The cost is that two unnamed calls with identical arguments share one slot
 * even if delivery changed the default between them, which is right: nobody
 * expressed a preference either time.
 * @param args - the call's arguments.
 * @returns an absolute path under the harness home.
 */
export function videoArtifactPath(args: VideoArgs): string {
  const framePath = args.first_frame_path?.trim() ?? ''
  const identity = JSON.stringify([
    args.model?.trim() ?? '',
    args.prompt,
    args.aspect_ratio ?? '',
    args.duration ?? '',
    args.animate_last_image === true ? 'i2v' : '',
    ...framePath === '' ? [] : [framePath],
  ])
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 12)
  return join(dshHomePath('media', 'video'), `${stem(args.prompt)}-${digest}.mp4`)
}

/**
 * Register the video tool, when this composition has what it needs.
 *
 * The tool runtime is read opportunistically, like the image tool's: the account
 * face must mount in a composition that carries no tools at all, and a missing
 * one should cost this tool rather than sign-in and balance.
 * @param ctx - host context; the registration follows this fiber's lifetime.
 * @param options - route access and the model to film with.
 */
export function registerVideoTool(ctx: Context, options: VideoToolOptions): void {
  const tools = ctx.get('tools')
  if (tools === undefined) {
    ctx.logger.debug('openlux: no tool runtime in this composition; the video tool stays unregistered')
    return
  }
  // What the server delivered, if anything. Which model an unnamed call ends up
  // filming with is settled at call time against the live catalogue, because
  // delivery can name a model this key has no channel for and because there may
  // be no delivered default at all.
  const deliveredModel = (): string | undefined => {
    const configured = typeof options.model === 'function' ? options.model() : options.model
    const trimmed = configured?.trim()
    return trimmed === undefined || trimmed === '' ? undefined : trimmed
  }

  ctx.effect(() => tools.register(defineTool({
    name: VIDEO_TOOL_NAME,
    // The schema is fixed at registration and the model is not, so it describes
    // what this tool can do rather than what one model does. It used to be
    // derived from the default's own shape, which reads careful and is not: the
    // default was a compiled-in name, so a machine whose delivery named a
    // text-only model lost the `animate_last_image` argument entirely — for
    // every model, including the ones that film from pictures. Advertising the
    // capability and refusing per call is the honest half of that trade, and
    // the refusal names a model that would have worked.
    description: describe(true),
    // Each call starts its own vendor task and writes its own path, so two
    // different clips may be asked for at once.
    isConcurrencySafe: () => true,
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'The shot to film, as one self-contained description. The video model sees only this text.',
      },
      aspect_ratio: {
        type: 'string',
        enum: OFFERED_ASPECTS,
        description: 'Frame shape. Defaults to 16:9; use 9:16 for a portrait clip. '
          + 'Some models only film landscape and will say so rather than reinterpret this.',
      },
      duration: {
        type: 'integer',
        // No enum: the accepted lengths differ per vendor (4/6/8 on the veo
        // family, 6/10 on MiniMax, an open range elsewhere), and a schema built
        // at registration cannot know which model the call will name. A model
        // with a verified set has it enforced at call time; the rest let the
        // route answer, which is the only party that actually knows.
        description: 'Clip length in seconds. Leave it out unless the user asked for a specific length; '
          + 'longer clips cost more, and a length the chosen model does not accept is refused here with the ones it does.',
      },
      model: {
        type: 'string',
        // Free text, like the image tool's, and for the reason that one learned
        // on a live run: an enum fixed at registration cannot list what this key
        // can film with today, so it turns "the user named a model" into "the
        // argument was dropped and something else was filmed". A name this
        // account cannot serve is refused by name here, with the servable ones
        // listed — never substituted.
        description: 'Set this whenever the user named a specific video model, passing their name through verbatim — '
          + 'passing a name is always safe, because one this account cannot film with is refused by name with the '
          + 'list of usable ones, never substituted. Leave it out only when the user named none, in which case the '
          + 'server-configured default is used.',
      },
      animate_last_image: {
        type: 'boolean',
        description: 'Use the newest image in this conversation as the clip\'s first frame — one that was generated '
          + 'or shown here, or that the user attached as a picture. The prompt should then describe the motion, not the scene. '
          + 'When the user\'s message carries an image file path instead, use first_frame_path. '
          + 'Fails if the conversation has no image yet, or if the named model only films from words.',
      },
      first_frame_path: {
        type: 'string',
        // The other half of animate_last_image, and the only half a text-only
        // session can use: an image attached under a model that takes no images
        // reaches the conversation as a file path in the user's message, which
        // the session log never records as an image (`media/session-images.ts`).
        // The model is holding that path, so it can quote it here.
        description: 'Local image file to use as the clip\'s first frame — when the user\'s message contains an image '
          + 'file path, pass it verbatim here. Relative paths resolve against this session\'s working directory. '
          + 'PNG, JPEG, WebP, and GIF. Takes precedence over animate_last_image; the prompt should describe the motion, not the scene.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          model: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          size: { type: 'string' },
          seconds: { type: 'number' },
          firstFrame: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const { path, model: used, bytes, size: frame, seconds, firstFrame } = value as {
          path: string
          model: string
          bytes: number
          size?: string
          seconds?: number
          firstFrame?: string
        }
        const facts = [size(bytes), frame, seconds === undefined ? undefined : `${String(seconds)}s`]
          .filter(fact => fact !== undefined)
          .join(' · ')
        return [{
          type: 'text',
          text: `视频已生成并保存到 ${path}（模型 ${used}；${facts}）。\n`
            + (firstFrame === undefined ? '' : `${firstFrame}\n`)
            + '用户可以在这一轮的产出文件里直接点开它。收尾只报这个文件、时长和分辨率，不要重述这轮之前已经说过的产出；\n'
            + '你看不到画面内容，不要描述或评价它。',
        }]
      },
    },
    async execute(args, exec) {
      // Which vendor films this name, and whether this key can film with it at
      // all, is one question answered here against the live catalogue. Getting
      // it wrong in the other direction is what this replaced: a name outside a
      // three-entry enum used to be dropped, and the user paid for a clip from
      // a model they did not choose.
      const access = await options.captureAccess?.() ?? options.access
      const catalog = await readVideoCatalog(ctx, access, exec.signal)
      const framePath = args.first_frame_path?.trim() ?? ''
      const animating = framePath !== '' || args.animate_last_image === true
      const named = args.model?.trim() ?? ''
      const model = named === '' ? defaultVideoModel(catalog, deliveredModel(), animating) : named
      if (model === undefined) throw new VideoGenerationError(videoDefaultRefusal(catalog, animating))
      const resolved = resolveVideoModel(catalog, model)
      if (resolved === undefined) throw new VideoGenerationError(videoModelRefusal(catalog, model))
      const provider = resolved.provider
      const spec = provider.spec(model, resolved.types)
      // A length outside a vendor's verified set is refused here rather than
      // minutes later by `duration_validate.go` — and only where such a set
      // exists, because inventing one refuses lengths the route does serve.
      if (args.duration !== undefined && spec.durations !== undefined && !spec.durations.includes(args.duration)) {
        throw new VideoGenerationError(`${model} 只接受 ${spec.durations.join(' / ')} 秒，不接受 ${String(args.duration)} 秒。`)
      }
      if (args.duration !== undefined && spec.durationRange !== undefined
        && (args.duration < spec.durationRange[0] || args.duration > spec.durationRange[1])) {
        throw new VideoGenerationError(`${model} 只拍 ${String(spec.durationRange[0])}~${String(spec.durationRange[1])} 秒，`
          + `拍不了 ${String(args.duration)} 秒。`)
      }
      if (args.aspect_ratio !== undefined && !spec.aspects.includes(args.aspect_ratio)) {
        throw new VideoGenerationError(`${model} 只出 ${spec.aspects.join(' / ')} 画面，不出 ${args.aspect_ratio}。`)
      }
      // The alternative named in these two refusals is read out of the same
      // catalogue rather than compiled in, so it is a model this key can film
      // with right now. A build-time name here was worse than no suggestion:
      // the model would pass it through on the next call and get refused again,
      // this time by name.
      if (animating && !spec.firstFrame) {
        throw new VideoGenerationError(`${model} 不支持用图片当首帧；`
          + suggestion(defaultVideoModel(catalog, undefined, true), '要图生视频请改用 ', '要图生视频请换一个能接首帧的模型。'))
      }
      // The mirror of the line above, and the commoner mistake: vendors ship one
      // name per direction, so a picture-only name asked for a clip from words
      // alone would otherwise be refused from inside the background job.
      if (!animating && spec.requiresFirstFrame === true) {
        throw new VideoGenerationError(`${model} 只做图生视频，得先有一张图当首帧。`
          + suggestion(defaultVideoModel(catalog, undefined, false), '纯文字出片请改用 ', '纯文字出片请换一个模型。')
          + '也可以先生成一张图再让它动起来。')
      }
      // Resolved before the job starts: "there is no picture yet" and "that
      // path is not an image" are answers the model needs in this turn, not a
      // background failure six minutes later. An explicit path wins over the
      // newest-image walk because it is the more specific reference.
      const firstFrame = framePath !== ''
        ? await readFirstFrameFile(ctx, framePath, exec.agent?.session.header.cwd, exec.signal)
        : args.animate_last_image === true
          ? await readLastImage(ctx, exec.agent?.session)
          : undefined
      // Vendors whose image route has no aspect field at all: the picture is
      // filmed as it is. An explicit request is refused rather than dropped,
      // because dropping it would answer a portrait request with whatever shape
      // the picture happened to be.
      const referenceShaped = firstFrame !== undefined && spec.referenceDecidesShape === true
      if (referenceShaped && args.aspect_ratio !== undefined) {
        throw new VideoGenerationError(`${model} 的图生视频画面比例跟着首帧走，指定不了 ${args.aspect_ratio}。`
          + `想要 ${args.aspect_ratio} 就别用这张图当首帧（纯文字出片可以指定比例），或者先把图改成这个比例再动画。`)
      }
      // The model never sees the picture's shape (generated images stay out of
      // model-visible content), so left to itself it guesses — one live run
      // guessed portrait for a square source and then told the user it had used
      // landscape. The reference itself knows, so it decides when the call did
      // not, and the shape it produced is reported back rather than assumed.
      const aspect = args.aspect_ratio
        ?? (firstFrame === undefined || referenceShaped ? undefined : orientationOf(firstFrame.ref, spec.aspects))
      const path = videoArtifactPath(args as VideoArgs)
      const video = await film(ctx, access, provider, {
        model,
        prompt: args.prompt,
        ...resolved.types.length === 0 ? {} : { endpointTypes: resolved.types },
        ...aspect === undefined ? {} : { aspectRatio: aspect },
        ...args.duration === undefined ? {} : { durationSeconds: args.duration },
        ...firstFrame === undefined ? {} : { images: [firstFrame.dataUri] },
      }, exec.signal)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, video.data)
      return {
        path,
        model,
        bytes: video.data.byteLength,
        ...video.size === undefined ? {} : { size: video.size },
        ...video.seconds === undefined ? {} : { seconds: video.seconds },
        ...firstFrame === undefined ? {} : { firstFrame: describeFirstFrame(firstFrame, aspect, referenceShaped) },
      }
    },
    presentCall: (args) => {
      const call = args as VideoArgs
      return {
        card: 'generic',
        // `edit` is what publishes the location to the turn's produced-file row
        // (`dsh-client-ui-deliverables`: a mutation is recognized by render
        // intent, not by tool name). A clip is a file this call brings into
        // existence, which is exactly what that row is for.
        kind: 'edit',
        title: '生成视频',
        rawInput: call.prompt,
        locations: [{ path: videoArtifactPath(call) }],
      }
    },
  })), 'openlux: video tool')
}

/**
 * The newest conversation image, as a data URI the route accepts.
 *
 * The bytes are fetched here rather than in the job because the two failures
 * this can hit — no picture in the conversation, no attachment service — are
 * both answers to the call the model just made. Sending them back as tool errors
 * lets it recover in the same turn (draw something first, or say why it cannot),
 * while a job failure would surface minutes later with the turn long gone.
 *
 * Size needs no separate rule: the attachment store refuses anything past its
 * own image cap (5 MB by default), so what it hands back is already bounded.
 * @param ctx - host context; the attachment service is read opportunistically.
 * @param session - the calling agent's session, whose log holds the images.
 * @returns the image, as both its reference and the URI the route takes.
 */
async function readLastImage(ctx: Context, session: SessionEventSource | undefined): Promise<FirstFrame> {
  if (session === undefined) {
    throw new VideoGenerationError('这次调用不属于任何会话，取不到会话里的图片，无法做图生视频。')
  }
  const attachments = ctx.get('attachments')
  if (attachments === undefined) {
    throw new VideoGenerationError('这个会话没有附件能力，取不到图片字节，无法做图生视频。')
  }
  const found = findLatestImage(session)
  if (found === undefined) {
    // Deliberately does not suggest "ask the user to send one": a drop is
    // refused unless the session's model declares image input, and this
    // product's profile ships text-only models today. The path clause comes
    // first because it is the commoner rescue: on a text-only model an attached
    // picture reaches the conversation as a file path, which this walk cannot
    // see but the model can quote (measured 2026-09-24: an attached first frame
    // died here as「对话里还没有图片」while its path sat in the user's message).
    throw new VideoGenerationError('这个对话里还没有图片。用户消息里如果带着图片文件的路径，'
      + '把它原样填进 first_frame_path 再调一次；否则先用 image_generate 画一张，再来做图生视频。')
  }
  const stored = await attachments.readImage(found.ref)
  return {
    ref: found.ref,
    source: found.source,
    dataUri: `data:${found.ref.mediaType};base64,${Buffer.from(stored.data).toString('base64')}`,
  }
}

/**
 * A user-named image file, committed and in the form the route takes.
 *
 * The bytes go through `attachments.saveImage` the way `image_show`'s do, and
 * for the same reason (`media/show-tool.ts`): the store's decode *is* the
 * validation — size cap, pixel cap, and a media type verified against the bytes
 * — so an unreadable or oversized file is refused here by the same code that
 * refuses one at generation time, not re-implemented. Every refusal names the
 * path, because the model chose it and can choose again.
 * @param ctx - host context; the attachment service is read opportunistically.
 * @param given - the path as the call named it.
 * @param cwd - the session's working directory, for a relative path.
 * @param signal - the call's cancellation.
 * @returns the image, as both its reference and the URI the route takes.
 */
async function readFirstFrameFile(
  ctx: Context,
  given: string,
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<FirstFrame> {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) {
    throw new VideoGenerationError('这个会话没有附件能力，取不到图片字节，无法做图生视频。')
  }
  if (!isAbsolute(given) && cwd === undefined) {
    throw new VideoGenerationError(`${given} 是相对路径，而这次调用不属于任何工作目录，请给绝对路径。`)
  }
  const path = isAbsolute(given) ? given : resolve(cwd ?? '', given)
  let data: Buffer
  try {
    data = await readFile(path, { signal })
  } catch (error: unknown) {
    throw new VideoGenerationError(`读不到 ${path}：${error instanceof Error ? error.message : String(error)}`)
  }
  const limit = attachments.imageLimits.maxImageBytes
  if (data.byteLength > limit) {
    throw new VideoGenerationError(`${path} 有 ${size(data.byteLength)}，超过本机上限 ${size(limit)}，请先把图缩小。`)
  }
  const mediaType = sniffImageType(data)
  if (mediaType === undefined) {
    throw new VideoGenerationError(`${path} 不是 PNG / JPEG / WebP / GIF 图片文件，当不了首帧。`)
  }
  let ref: ImageAttachmentRef
  try {
    ref = await attachments.saveImage({ data, mediaType, name: path.split(/[/\\]/u).pop() ?? 'image' })
  } catch (error: unknown) {
    throw new VideoGenerationError(`${path} 没能通过图片校验：${error instanceof Error ? error.message : String(error)}`)
  }
  return {
    ref,
    source: 'file',
    dataUri: `data:${ref.mediaType};base64,${data.toString('base64')}`,
  }
}

/** The resolved reference image, with the bytes in the form the route takes. */
interface FirstFrame {
  /** The durable reference; its dimensions decide unstated orientation. */
  readonly ref: ImageAttachmentRef
  /** Where it came from, for the sentence the model reads back. */
  readonly source: SessionImage['source'] | 'file'
  readonly dataUri: string
}

/**
 * The frame shape closest to a reference image's own.
 *
 * Only orientation is decided here, because that is all this route offers: a
 * square source has no matching shape and gets bars either way, so it takes the
 * landscape default rather than a coin flip.
 * @param ref - the reference image.
 * @param offered - the shapes this model accepts.
 * @returns the shape to film in, or undefined when neither is offered.
 */
function orientationOf(ref: { width: number; height: number }, offered: readonly string[]): string | undefined {
  const wanted = ref.height > ref.width ? '9:16' : '16:9'
  return offered.includes(wanted) ? wanted : offered[0]
}

/**
 * What to tell the model about the picture it is animating.
 *
 * It cannot see the reference — neither the picture nor its size — so without
 * this line it explains the result by guessing. The bars are called out because
 * a user who asked to animate their square photo will see them and ask why.
 * @param frame - the resolved reference image.
 * @param aspect - the shape the clip is being filmed in.
 * @param follows - whether the picture's own shape is the clip's, in which case
 *   there is no shape to announce and no bars to warn about.
 * @returns one line of model-facing text.
 */
function describeFirstFrame(frame: FirstFrame, aspect: string | undefined, follows: boolean): string {
  const origins: Record<FirstFrame['source'], string> = {
    attached: '用户发的图',
    generated: '你刚生成的图',
    shown: '之前展示过的图',
    file: '你给的图片文件',
  }
  const origin = origins[frame.source]
  const shape = `${String(frame.ref.width)}x${String(frame.ref.height)}`
  if (follows) return `首帧用的是${origin}（${shape}），出片就按这张图的比例，不会留黑边。`
  const square = frame.ref.width === frame.ref.height
  const filmed = aspect ?? '16:9'
  const bars = square || (frame.ref.height > frame.ref.width) !== (filmed === '9:16')
    ? `；源图与 ${filmed} 不同形，出片会留黑边`
    : ''
  return `首帧用的是${origin}（${shape}），出片 ${filmed}${bars}。`
}

/**
 * Run one generation to its bytes, inside the calling turn.
 *
 * Progress has nowhere to go but the log: the pending card is drawn from the
 * arguments and the completed card from the result, so a status change mid-call
 * cannot reach the UI. It is still logged, because "what was the vendor saying
 * when this hung" is the first question a slow run raises.
 *
 * A stop is the one failure reworded here. The registry turns an aborted call
 * into an interrupted result on its own, but the text the model reads should say
 * what a stop means on this route: the local wait ended, the upstream task and
 * its bill most likely did not.
 * @param ctx - host context.
 * @param access - route origin and token reader.
 * @param provider - the vendor adapter resolved for this model.
 * @param request - what to generate.
 * @param signal - the call's cancellation, aborted by the conversation's stop control.
 * @returns the finished clip.
 */
async function film(
  ctx: Context,
  access: ConsoleAccess,
  provider: VideoProvider,
  request: VideoRequest,
  signal: AbortSignal,
): Promise<GeneratedVideo> {
  const startedAt = Date.now()
  try {
    return await generateVideo(ctx, access, provider, request, (status, percent) => {
      const elapsed = String(Math.round((Date.now() - startedAt) / 1000))
      ctx.logger.debug(`openlux: video [${elapsed}s] ${percent === undefined ? status : `${status} ${String(percent)}%`}`)
    }, signal)
  } catch (error: unknown) {
    if (signal.aborted || (error instanceof AccountRequestError && error.kind === 'cancelled')) {
      throw new VideoGenerationError('已停止等待这段视频；上游任务可能仍在继续并计费，稍后可到中转站任务记录确认。')
    }
    throw error
  }
}

/**
 * A readable leading part of the file name.
 *
 * The digest already makes the name unique, so this only has to help a human
 * recognise the file in a player's recent list — hence the length cap and the
 * conservative character set (a path is what this becomes).
 * @param prompt - the request's prompt.
 * @returns a file-name-safe stem, never empty.
 */
function stem(prompt: string): string {
  const cleaned = prompt.replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 24)
  return cleaned === '' ? 'video' : cleaned
}
