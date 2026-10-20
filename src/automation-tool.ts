/**
 * The model-facing door onto the automation runtime the sidebar already uses.
 *
 * WorkBuddy's product result is: the user says "每天早上帮我…" in chat and the
 * same row appears on the automations page. Their stack is a native
 * `automation_update` with RRULE plus a confirm card. Ours is already the
 * durable store (`installAutomationRuntime` → `openlux_automations`); this file
 * only registers a `defineTool` that calls `automations.create` / `update` /
 * `delete` / `toggle` / `run` / `list`. The calendar stays once / daily /
 * weekly — there is no second scheduler.
 *
 * ## Why this name
 *
 * Imported expert packages already instruct the model to call
 * `automation_update`. A different name would leave those documents pointing at
 * a phantom while a working tool sat unused. Aliases below (`mode`, `name`,
 * `rrule`, `scheduleType`) exist so a WorkBuddy-shaped call still lands; they
 * are translated here, not executed as RRULE.
 *
 * ## Why a kernel confirm card rather than a card of our own
 *
 * `ctx.userQuestions.ask()` already pauses the loop and resumes
 * (`dsh-user-questions/README.zh.md`). The generic question flow is a numbered
 * quiz with a free-text field, «跳过本题» and «提交» — that is the wrong
 * chrome for "write this row into Automations". The same seam already has a
 * binary decision card: `intent: { kind: 'plan-review', approve }` is what
 * plan-mode uses, and the web provider routes it to `PlanReviewPanel`
 * (`dsh-client-ui-user-questions` README.zh: 条带 + markdown 主体 + 确认执行 /
 * 拒绝). Teaching a new intent would be a kernel patch for chrome. The strip
 * still says «计划待审»; the markdown body is where this tool names the task.
 * List does not ask.
 *
 * ## Why it is not on MEMBER_ALLOW
 *
 * The confirm panel is tied to the conversation the user is looking at. A
 * delegated member has no user there — the same cut `image_show` made. Global
 * registration plus the teammate whitelist keeps the tool off children.
 *
 * @module echoflowai-tools/automation-tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { AskUserQuestionAnswer, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { AUTOMATION_TOOL_NAME } from './automation-name.ts'
import { automationScheduleOf } from './automation-schedule.ts'
import type {
  AutomationContextOptions,
  AutomationContextSnapshot,
  AutomationExecutionSelection,
  AutomationSchedule,
  AutomationSnapshot,
  AutomationTask,
} from './automation-wire.ts'

export { AUTOMATION_TOOL_NAME } from './automation-name.ts'

/** How long the confirm panel waits before it counts as skipped. */
const ASK_DEADLINE_MS = 120_000

/** Above the deadline, so the deadline is what reports rather than the runtime. */
const TOOL_TIMEOUT_MS = 150_000

const QUESTION_ID = 'automation'
const CONFIRM_LABEL = '确认'
const CANCEL_LABEL = '取消'

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const

const description = 'Create, list, update, pause, resume, run, or delete a scheduled automation that '
  + 'runs in a new background session. This is the same list the sidebar Automations page shows — there is '
  + 'no crontab, no RRULE scheduler, and no second task table. '
  + 'Actions: list (no confirmation), create / update / delete / pause / resume / run (the user must confirm '
  + 'a panel before anything is written). '
  + 'Schedules are local time and only three kinds: once (a future datetime), daily (hour+minute every day), '
  + 'weekly (hour+minute on selected weekdays, 0=Sunday … 6=Saturday). '
  + 'Do not invent a shell/cron/sqlite task; if the user cancels, say so and stop. '
  + 'Imported instructions may still send mode/name/rrule/scheduleType — those aliases are accepted and folded '
  + 'into the three kinds; an RRULE this tool cannot express is refused rather than approximated.'

/** The host methods this tool is allowed to call — the same ones the sidebar uses. */
export interface AutomationHostRuntime {
  call(endpoint: string, payload: unknown): Promise<unknown>
}

/** What the tool reads out of its own composition. */
export interface AutomationToolOptions {
  /** Resolver for the runtime `installAutomationRuntime` already mounted. */
  readonly runtime: { get(): Promise<AutomationHostRuntime> }
}

/** What one call returns to the model. */
interface ToolValue {
  outcome: string
  tasks: TaskSummary[]
}

interface TaskSummary {
  id: string
  title: string
  enabled: boolean
  schedule: string
  nextRun?: string
}

export type AutomationToolAction =
  | 'list'
  | 'create'
  | 'update'
  | 'delete'
  | 'pause'
  | 'resume'
  | 'run'

/** Parsed intent; schedule/title validation happens here so the confirm panel is never about a bad call. */
export type AutomationToolIntent =
  | { readonly action: 'list'; readonly id?: string }
  | {
    readonly action: 'create'
    readonly title: string
    readonly prompt: string
    readonly schedule: AutomationSchedule
    readonly enabled: boolean
  }
  | {
    readonly action: 'update'
    readonly id: string
    readonly title?: string
    readonly prompt?: string
    readonly schedule?: AutomationSchedule
    readonly enabled?: boolean
  }
  | { readonly action: 'delete' | 'pause' | 'resume' | 'run'; readonly id: string }

const ACTION_ALIASES: Record<string, AutomationToolAction> = {
  list: 'list',
  view: 'list',
  create: 'create',
  'suggested create': 'create',
  suggested_create: 'create',
  update: 'update',
  delete: 'delete',
  remove: 'delete',
  pause: 'pause',
  resume: 'resume',
  run: 'run',
  run_now: 'run',
  runnow: 'run',
}

const WEEKDAY_ALIASES: Record<string, number> = {
  '0': 0, su: 0, sun: 0, sunday: 0, 日: 0, 周日: 0, 星期日: 0, 星期天: 0,
  '1': 1, mo: 1, mon: 1, monday: 1, 一: 1, 周一: 1, 星期一: 1,
  '2': 2, tu: 2, tue: 2, tues: 2, tuesday: 2, 二: 2, 周二: 2, 星期二: 2,
  '3': 3, we: 3, wed: 3, wednesday: 3, 三: 3, 周三: 3, 星期三: 3,
  '4': 4, th: 4, thu: 4, thur: 4, thurs: 4, thursday: 4, 四: 4, 周四: 4, 星期四: 4,
  '5': 5, fr: 5, fri: 5, friday: 5, 五: 5, 周五: 5, 星期五: 5,
  '6': 6, sa: 6, sat: 6, saturday: 6, 六: 6, 周六: 6, 星期六: 6,
}

/**
 * Register the conversation tool, when this composition has both seams.
 *
 * Same opportunistic read as the media tools and the connector offer: an
 * account face still mounts in compositions with no tool runtime and in ones
 * with no question provider, and a missing seam costs this tool rather than
 * sign-in. Mutating without a confirm panel is not offered as a degrade.
 * @param ctx - host context; the registration follows this fiber's lifetime.
 * @param options - the mounted automation runtime.
 */
export function registerAutomationTool(ctx: Context, options: AutomationToolOptions): void {
  const tools = ctx.get('tools')
  if (tools === undefined) {
    ctx.logger.debug('openlux: no tool runtime in this composition; the automation tool stays unregistered')
    return
  }
  if (ctx.get('userQuestions') === undefined) {
    ctx.logger.debug('openlux: no user-questions seam in this composition; the automation tool stays unregistered')
    return
  }

  ctx.effect(() => tools.register(defineTool({
    name: AUTOMATION_TOOL_NAME,
    description,
    timeoutMs: TOOL_TIMEOUT_MS,
    // Two mutating calls racing for the same panel would leave the user
    // answering one question with another underneath it, and both would write.
    isConcurrencySafe: () => false,
    parameters: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'update', 'delete', 'pause', 'resume', 'run'],
        description: 'What to do. list does not ask the user; every other action shows a confirm panel first. '
          + 'Prefer this over `mode`.',
      },
      mode: {
        type: 'string',
        description: 'Alias of action, kept so imported expert packages that still say mode=create / mode=list work. '
          + 'Also accepts view, remove, suggested create, run_now.',
      },
      id: {
        type: 'string',
        description: 'Existing automation id. Required for update / delete / pause / resume / run. '
          + 'For list, pass it to show only that row.',
      },
      title: {
        type: 'string',
        description: 'Short name shown in the sidebar list, ≤120 characters. Required for create.',
      },
      name: {
        type: 'string',
        description: 'Alias of title, kept for imported packages.',
      },
      prompt: {
        type: 'string',
        description: 'What the background session should do, as one self-contained instruction. '
          + 'Required for create. The scheduled run does not see this conversation, so put everything it needs here.',
      },
      schedule_kind: {
        type: 'string',
        enum: ['once', 'daily', 'weekly'],
        description: 'Which of the three local calendars. Required for create unless a recognised rrule/scheduleType is supplied.',
      },
      scheduleType: {
        type: 'string',
        description: 'Alias of schedule_kind. once stays once; recurring becomes daily unless weekdays or BYDAY say weekly.',
      },
      at: {
        oneOf: [
          { type: 'string' },
          { type: 'integer' },
        ],
        description: 'When schedule_kind is once: a future local datetime (`2026-09-15T08:00`) or epoch milliseconds.',
      },
      scheduledAt: {
        oneOf: [
          { type: 'string' },
          { type: 'integer' },
        ],
        description: 'Alias of at.',
      },
      hour: {
        type: 'integer',
        description: 'Local hour 0–23. Required for daily/weekly unless `time` or a BYHOUR rrule supplies it.',
      },
      minute: {
        type: 'integer',
        description: 'Local minute 0–59. Defaults to 0 when hour or time is present.',
      },
      time: {
        type: 'string',
        description: 'Local `HH:mm` (or `H:mm`) as an alternative to hour+minute.',
      },
      weekdays: {
        type: 'array',
        items: { type: 'integer' },
        description: 'JavaScript weekday numbers 0–6 (Sunday–Saturday). Required for weekly. '
          + 'A string list such as ["MO","WE"] is also accepted.',
      },
      rrule: {
        type: 'string',
        description: 'Optional WorkBuddy leftover. Only FREQ=DAILY or FREQ=WEEKLY with BYHOUR/BYMINUTE/BYDAY and INTERVAL=1 '
          + 'are folded into daily/weekly; anything else is refused.',
      },
      enabled: {
        type: 'boolean',
        description: 'Whether the task is armed. Defaults to true on create. Prefer pause/resume for an existing row.',
      },
      status: {
        type: 'string',
        description: 'Alias of enabled: ACTIVE/active → true, PAUSED/INACTIVE/paused → false.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          outcome: { type: 'string', required: true },
          tasks: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                enabled: { type: 'boolean', required: true },
                schedule: { type: 'string', required: true },
                nextRun: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: (value as ToolValue).outcome }],
    },
    async execute(args, exec) {
      const intent = interpretAutomationArgs(args)
      if (intent.action !== 'list' && exec.agent?.session.header.origin === 'subagent') {
        throw new Error('定时任务只能在当前对话里创建或改，不能由派出去的成员代劳。请让主理人调用 automation_update。')
      }

      const runtime = await options.runtime.get()
      if (intent.action === 'list') {
        const snapshot = snapshotOf(await runtime.call('automations.list', {}))
        const tasks = intent.id === undefined
          ? snapshot.tasks
          : snapshot.tasks.filter(task => task.id === intent.id)
        if (intent.id !== undefined && tasks.length === 0) {
          throw new Error(`没有这条自动化：${intent.id}`)
        }
        return { outcome: renderList(tasks, snapshot.localTimeZone), tasks: tasks.map(summarize) } satisfies ToolValue
      }

      const sessionId = sourceSessionIdOf(exec.agent)
      const snapshot = snapshotOf(await runtime.call('automations.list', {}))

      if (intent.action === 'create') {
        const defaults = defaultsOf(await runtime.call('automations.options', { sourceSessionId: sessionId }))
        const confirmed = await askConfirm(ctx, {
          header: '创建自动化',
          question: `确认创建定时任务「${intent.title}」？`,
          detail: createDetail(intent, snapshot.localTimeZone, defaults.permissionPreset),
          exec,
        })
        if (!confirmed) return cancelled()
        const created = taskOf(await runtime.call('automations.create', {
          sourceSessionId: sessionId,
          title: intent.title,
          prompt: intent.prompt,
          schedule: intent.schedule,
          enabled: intent.enabled,
          execution: executionFromDefaults(defaults),
        }))
        return {
          outcome: `已创建「${created.title}」（${describeAutomationSchedule(created.schedule)}）。`
            + `会出现在侧栏「自动化」里。${nextRunLine(created)}`,
          tasks: [summarize(created)],
        } satisfies ToolValue
      }

      const current = snapshot.tasks.find(task => task.id === intent.id)
      if (current === undefined) throw new Error(`没有这条自动化：${intent.id}`)

      if (intent.action === 'delete') {
        const confirmed = await askConfirm(ctx, {
          header: '删除自动化',
          question: `确认删除「${current.title}」？`,
          detail: reviewMarkdown(
            `删除「${current.title}」`,
            '任务定义会从侧栏列表里拿掉。已经跑完的结果会话还在。',
          ),
          exec,
        })
        if (!confirmed) return cancelled()
        await runtime.call('automations.delete', { id: current.id })
        return { outcome: `已删除「${current.title}」。`, tasks: [] } satisfies ToolValue
      }

      if (intent.action === 'pause' || intent.action === 'resume') {
        const enabled = intent.action === 'resume'
        const verb = enabled ? '恢复' : '暂停'
        const confirmed = await askConfirm(ctx, {
          header: `${verb}自动化`,
          question: `确认${verb}「${current.title}」？`,
          detail: reviewMarkdown(
            `${verb}「${current.title}」`,
            enabled
              ? `恢复后按 ${describeAutomationSchedule(current.schedule)} 继续执行。`
              : '暂停后不会再按点执行，任务还留在列表里。',
          ),
          exec,
        })
        if (!confirmed) return cancelled()
        const updated = taskOf(await runtime.call('automations.toggle', { id: current.id, enabled }))
        return {
          outcome: `已${verb}「${updated.title}」。${nextRunLine(updated)}`,
          tasks: [summarize(updated)],
        } satisfies ToolValue
      }

      if (intent.action === 'run') {
        const confirmed = await askConfirm(ctx, {
          header: '立即运行',
          question: `确认马上跑一次「${current.title}」？`,
          detail: reviewMarkdown(
            `马上跑一次「${current.title}」`,
            '会新开一个后台会话执行这段内容，不等到下次定时。',
          ),
          exec,
        })
        if (!confirmed) return cancelled()
        const updated = taskOf(await runtime.call('automations.run', { id: current.id }))
        return {
          outcome: `已开始跑「${updated.title}」。结果会出现在侧栏「自动化」里。`,
          tasks: [summarize(updated)],
        } satisfies ToolValue
      }

      if (intent.action === 'update') {
        const title = intent.title ?? current.title
        const prompt = intent.prompt ?? current.prompt
        const schedule = intent.schedule ?? current.schedule
        const enabled = intent.enabled ?? current.enabled
        const confirmed = await askConfirm(ctx, {
          header: '更新自动化',
          question: `确认更新「${current.title}」？`,
          detail: [
            `# ${title}`,
            '',
            `- **时间** ${describeAutomationSchedule(schedule)}`,
            `- **状态** ${enabled ? '启用' : '暂停'}`,
            '',
            '**执行内容**',
            '',
            clip(prompt, 240),
          ].join('\n'),
          exec,
        })
        if (!confirmed) return cancelled()
        const updated = taskOf(await runtime.call('automations.update', {
          id: current.id,
          title,
          prompt,
          schedule,
          enabled,
          execution: executionOf(current.context),
        }))
        return {
          outcome: `已更新「${updated.title}」（${describeAutomationSchedule(updated.schedule)}）。${nextRunLine(updated)}`,
          tasks: [summarize(updated)],
        } satisfies ToolValue
      }

      throw new Error(`未处理的 action：${intent.action}`)
    },
    presentCall: (raw) => {
      const args = raw as Record<string, unknown>
      let action: AutomationToolAction = 'list'
      try {
        action = interpretAutomationArgs(args).action
      } catch {
        const named = actionNameOf(args)
        if (named !== undefined) action = named
      }
      return { card: 'generic', title: presentTitle(action), rawInput: presentInput(args) }
    },
  })), 'openlux: automation tool')
}

/**
 * Turn model arguments — including WorkBuddy aliases — into a typed intent.
 *
 * Exported so the mapping can be tested without spinning the question panel.
 * @param args - tool arguments after schema validation (root is open).
 */
export function interpretAutomationArgs(args: unknown): AutomationToolIntent {
  const raw = objectOf(args)
  const action = actionNameOf(raw)
  if (action === undefined) {
    throw new Error('请指定 action：list / create / update / delete / pause / resume / run')
  }
  if (action === 'list') {
    const id = optionalId(raw)
    return id === undefined ? { action } : { action, id }
  }
  if (action === 'create') {
    const title = requiredTitle(raw)
    const prompt = requiredPrompt(raw)
    const schedule = scheduleFromToolArgs(raw, { required: true })
    if (schedule === undefined) throw new Error('创建定时任务需要 schedule_kind（once / daily / weekly）或一条可折叠的 rrule')
    return {
      action,
      title,
      prompt,
      schedule,
      enabled: enabledOf(raw) ?? true,
    }
  }
  if (action === 'update') {
    const id = requiredId(raw)
    const title = optionalTitle(raw)
    const prompt = optionalPrompt(raw)
    const schedule = scheduleFromToolArgs(raw, { required: false })
    const enabled = enabledOf(raw)
    if (title === undefined && prompt === undefined && schedule === undefined && enabled === undefined) {
      throw new Error('更新请至少改名称、执行内容、时间或启用状态里的一项')
    }
    return {
      action,
      id,
      ...title === undefined ? {} : { title },
      ...prompt === undefined ? {} : { prompt },
      ...schedule === undefined ? {} : { schedule },
      ...enabled === undefined ? {} : { enabled },
    }
  }
  return { action, id: requiredId(raw) }
}

/**
 * Build a local once/daily/weekly schedule from the tool's own fields, or from
 * a small RRULE subset imported packages still emit.
 * @param raw - tool arguments.
 * @param options - whether a schedule is mandatory.
 */
export function scheduleFromToolArgs(
  raw: Record<string, unknown>,
  options: { readonly required: boolean },
): AutomationSchedule | undefined {
  const kind = scheduleKindOf(raw)
  const rrule = textOf(raw.rrule)
  if (kind === undefined && rrule === undefined) {
    if (options.required) return undefined
    return undefined
  }
  if (kind === 'once' || (kind === undefined && scheduleTypeOf(raw) === 'once')) {
    return automationScheduleOf({ kind: 'once', at: epochOf(raw.at ?? raw.scheduledAt) })
  }
  if (rrule !== undefined && (kind === undefined || kind === 'daily' || kind === 'weekly')) {
    const fromRrule = scheduleFromRrule(rrule)
    if (kind === undefined) return fromRrule
    if (kind !== fromRrule.kind) {
      throw new Error(`schedule_kind=${kind} 和 rrule（${fromRrule.kind}）说的不是同一种日程，只填一边`)
    }
    return fromRrule
  }
  if (kind === 'daily') {
    const clock = clockOf(raw)
    return automationScheduleOf({ kind: 'daily', hour: clock.hour, minute: clock.minute })
  }
  if (kind === 'weekly') {
    const clock = clockOf(raw)
    return automationScheduleOf({
      kind: 'weekly',
      weekdays: weekdaysOf(raw.weekdays),
      hour: clock.hour,
      minute: clock.minute,
    })
  }
  if (rrule !== undefined) return scheduleFromRrule(rrule)
  if (options.required) throw new Error('请选择单次、每天或每周执行')
  return undefined
}

/**
 * Fold a WorkBuddy leftover RRULE into our three calendars, or refuse it.
 *
 * INTERVAL≠1, BYMONTH / BYMONTHDAY / COUNT>1 and friends are not "close
 * enough" — approximating them would be a second scheduler.
 * @param rrule - the raw RRULE body (with or without an `RRULE:` prefix).
 */
export function scheduleFromRrule(rrule: string): AutomationSchedule {
  const body = rrule.trim().replace(/^RRULE:/iu, '')
  if (body === '') throw new Error('rrule 是空的')
  const parts: Record<string, string> = {}
  for (const piece of body.split(';')) {
    const trimmed = piece.trim()
    if (trimmed === '') continue
    const split = trimmed.indexOf('=')
    if (split <= 0) throw new Error(`rrule 里有读不懂的片段：${trimmed}`)
    parts[trimmed.slice(0, split).trim().toUpperCase()] = trimmed.slice(split + 1).trim()
  }
  const unsupported = ['BYMONTH', 'BYMONTHDAY', 'BYYEARDAY', 'BYWEEKNO', 'BYSETPOS', 'UNTIL']
    .filter(key => parts[key] !== undefined)
  if (unsupported.length > 0) {
    throw new Error(`本机不支持这条 rrule（${unsupported.join('、')}）。请改用 schedule_kind：once / daily / weekly。`)
  }
  if (parts.INTERVAL !== undefined && parts.INTERVAL !== '1') {
    throw new Error('本机日程没有间隔天数，rrule 的 INTERVAL 只能是 1。请改用每天或每周某几天。')
  }
  if (parts.COUNT !== undefined && parts.COUNT !== '1') {
    throw new Error('本机没有“执行 N 次后停”的日程。单次请用 schedule_kind=once 加一个未来时间。')
  }
  const freq = (parts.FREQ ?? '').toUpperCase()
  const hour = singleClock(parts.BYHOUR, 23, '小时')
  const minute = parts.BYMINUTE === undefined ? 0 : singleClock(parts.BYMINUTE, 59, '分钟')
  if (freq === 'DAILY') {
    if (hour === undefined) throw new Error('每天执行请在 rrule 里带 BYHOUR，或改用 hour / time')
    return automationScheduleOf({ kind: 'daily', hour, minute: minute ?? 0 })
  }
  if (freq === 'WEEKLY') {
    if (hour === undefined) throw new Error('每周执行请在 rrule 里带 BYHOUR，或改用 hour / time')
    const weekdays = parts.BYDAY === undefined ? weekdaysOf(['1', '2', '3', '4', '5']) : weekdaysOf(parts.BYDAY)
    return automationScheduleOf({ kind: 'weekly', weekdays, hour, minute: minute ?? 0 })
  }
  throw new Error('本机只把 FREQ=DAILY 或 FREQ=WEEKLY 收成每天/每周。单次请用 schedule_kind=once，不要靠 rrule。')
}

/** Human-readable local schedule, used on the confirm panel and in the tool result. */
export function describeAutomationSchedule(schedule: AutomationSchedule): string {
  if (schedule.kind === 'once') return `单次 ${formatLocal(schedule.at)}`
  const time = `${two(schedule.hour)}:${two(schedule.minute)}`
  if (schedule.kind === 'daily') return `每天 ${time}`
  const days = schedule.weekdays.map(day => WEEKDAY_ZH[day] ?? String(day)).join('、')
  return `每周${days} ${time}`
}

function actionNameOf(raw: Record<string, unknown>): AutomationToolAction | undefined {
  const named = textOf(raw.action) ?? textOf(raw.mode)
  if (named === undefined) return undefined
  const key = named.toLowerCase().replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim()
  return ACTION_ALIASES[key]
}

function scheduleKindOf(raw: Record<string, unknown>): 'once' | 'daily' | 'weekly' | undefined {
  const named = textOf(raw.schedule_kind) ?? scheduleTypeOf(raw)
  if (named === undefined) return undefined
  if (named === 'once' || named === 'daily' || named === 'weekly') return named
  if (named === 'recurring') {
    const days = raw.weekdays
    if (days !== undefined) return 'weekly'
    const rrule = textOf(raw.rrule)?.toUpperCase() ?? ''
    if (rrule.includes('FREQ=WEEKLY')) return 'weekly'
    return 'daily'
  }
  throw new Error('schedule_kind 只能是 once / daily / weekly')
}

function scheduleTypeOf(raw: Record<string, unknown>): string | undefined {
  const named = textOf(raw.scheduleType) ?? textOf(raw.schedule_type)
  return named === undefined ? undefined : named.toLowerCase()
}

function enabledOf(raw: Record<string, unknown>): boolean | undefined {
  if (typeof raw.enabled === 'boolean') return raw.enabled
  const status = textOf(raw.status)
  if (status === undefined) return undefined
  const key = status.toLowerCase()
  if (key === 'active' || key === 'enabled' || key === 'on') return true
  if (key === 'paused' || key === 'inactive' || key === 'disabled' || key === 'off') return false
  throw new Error('status 只能是 ACTIVE 或 PAUSED')
}

function optionalTitle(raw: Record<string, unknown>): string | undefined {
  return clipText(textOf(raw.title) ?? textOf(raw.name), '名称', 120)
}

function requiredTitle(raw: Record<string, unknown>): string {
  const title = optionalTitle(raw)
  if (title === undefined) throw new Error('创建定时任务需要一个名称（title）')
  return title
}

function optionalPrompt(raw: Record<string, unknown>): string | undefined {
  return clipText(textOf(raw.prompt), '执行内容', 40_000)
}

function requiredPrompt(raw: Record<string, unknown>): string {
  const prompt = optionalPrompt(raw)
  if (prompt === undefined) throw new Error('创建定时任务需要执行内容（prompt）——后台会话看不到当前对话')
  return prompt
}

function optionalId(raw: Record<string, unknown>): string | undefined {
  return textOf(raw.id) ?? textOf(raw.taskId) ?? textOf(raw.task_id)
}

function requiredId(raw: Record<string, unknown>): string {
  const id = optionalId(raw)
  if (id === undefined) throw new Error('请提供这条自动化的 id（先 action=list 看列表）')
  return id
}

function clipText(value: string | undefined, label: string, max: number): string | undefined {
  if (value === undefined) return undefined
  if (value.length > max) throw new Error(`${label}不能超过 ${String(max)} 个字符`)
  return value
}

function clockOf(raw: Record<string, unknown>): { hour: number; minute: number } {
  const time = textOf(raw.time)
  if (time !== undefined) {
    const parsed = parseTime(time)
    return {
      hour: typeof raw.hour === 'number' ? clockPart(raw.hour, 23, '小时') : parsed.hour,
      minute: typeof raw.minute === 'number' ? clockPart(raw.minute, 59, '分钟') : parsed.minute,
    }
  }
  if (raw.hour === undefined) throw new Error('每天/每周执行需要 hour（0–23）或 time（HH:mm）')
  return {
    hour: clockPart(raw.hour, 23, '小时'),
    minute: raw.minute === undefined ? 0 : clockPart(raw.minute, 59, '分钟'),
  }
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim())
  if (match === null) throw new Error('time 请写成 HH:mm，例如 09:00')
  return { hour: clockPart(Number(match[1]), 23, '小时'), minute: clockPart(Number(match[2]), 59, '分钟') }
}

function clockPart(value: unknown, max: number, label: string): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${label}不正确`)
  return n
}

function singleClock(value: string | undefined, max: number, label: string): number | undefined {
  if (value === undefined || value === '') return undefined
  if (value.includes(',')) throw new Error(`rrule 的 BYHOUR/BYMINUTE 只能是一个数，不支持列表`)
  return clockPart(value, max, label)
}

function weekdaysOf(value: unknown): number[] {
  const items = typeof value === 'string'
    ? value.split(/[\s,，]+/u).filter(part => part !== '')
    : Array.isArray(value) ? value : undefined
  if (items === undefined) throw new Error('每周执行请提供 weekdays（0=周日 … 6=周六，或 MO,WE）')
  const days: number[] = []
  for (const item of items) {
    const key = String(item).trim().toLowerCase()
    const day = WEEKDAY_ALIASES[key]
    if (day === undefined) throw new Error(`每周执行日不正确：${String(item)}`)
    days.push(day)
  }
  if (days.length === 0) throw new Error('请至少选择一个每周执行日')
  return days
}

function epochOf(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) throw new Error('单次执行时间不正确')
    return Math.trunc(value)
  }
  const text = textOf(value)
  if (text === undefined) throw new Error('单次执行需要 at（本地时间，例如 2026-09-15T08:00）')
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/u.exec(text)
  if (local !== null) {
    const hour = local[4] === undefined ? 0 : Number(local[4])
    const minute = local[5] === undefined ? 0 : Number(local[5])
    const second = local[6] === undefined ? 0 : Number(local[6])
    return new Date(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      hour,
      minute,
      second,
    ).getTime()
  }
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) throw new Error('单次执行时间不正确')
  return ms
}

function objectOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('参数格式不正确')
  }
  return value as Record<string, unknown>
}

function textOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function sourceSessionIdOf(agent: { readonly id?: unknown } | undefined): string {
  const id = typeof agent?.id === 'string' ? agent.id.trim() : ''
  if (id === '') throw new Error('请先打开一个会话，再创建或改自动化')
  return id
}

function snapshotOf(value: unknown): AutomationSnapshot {
  if (typeof value !== 'object' || value === null || !('tasks' in value)) {
    throw new Error('自动化列表读取失败')
  }
  const snapshot = value as AutomationSnapshot
  if (!Array.isArray(snapshot.tasks)) throw new Error('自动化列表读取失败')
  return snapshot
}

function taskOf(value: unknown): AutomationTask {
  if (typeof value !== 'object' || value === null || !('id' in value) || !('title' in value)) {
    throw new Error('自动化写入没有返回任务')
  }
  return value as AutomationTask
}

function defaultsOf(value: unknown): AutomationContextOptions['defaults'] {
  if (typeof value !== 'object' || value === null || !('defaults' in value)) {
    throw new Error('无法读取当前会话的执行环境')
  }
  return (value as AutomationContextOptions).defaults
}

function executionFromDefaults(defaults: AutomationContextOptions['defaults']): AutomationExecutionSelection {
  return {
    ...defaults.workspaceId === undefined ? {} : { workspaceId: defaults.workspaceId },
    ...defaults.agentPreset === undefined ? {} : { agentPreset: defaults.agentPreset },
    model: defaults.model,
    skills: [...defaults.skills],
    permissionPreset: defaults.permissionPreset,
  }
}

function executionOf(context: AutomationContextSnapshot): AutomationExecutionSelection {
  return {
    ...context.workspaceId === undefined ? {} : { workspaceId: context.workspaceId },
    ...context.agentPreset === undefined ? {} : { agentPreset: context.agentPreset },
    model: {
      provider: context.provider,
      model: context.model,
      ...context.reasoningEffort === undefined ? {} : { reasoningEffort: context.reasoningEffort },
    },
    skills: [...context.skills],
    permissionPreset: context.permissionPreset,
  }
}

function summarize(task: AutomationTask): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    enabled: task.enabled,
    schedule: describeAutomationSchedule(task.schedule),
    ...task.nextRunAt === null ? {} : { nextRun: formatLocal(task.nextRunAt) },
  }
}

function renderList(tasks: readonly AutomationTask[], timeZone: string): string {
  if (tasks.length === 0) {
    return '还没有定时任务。用户可以说「每天早上帮我…」来创建，会先弹出确认。'
  }
  const lines = tasks.map((task, index) => {
    const state = task.running ? '执行中' : task.enabled ? '已启用' : '已暂停'
    const next = task.nextRunAt === null ? '无下次执行' : `下次 ${formatLocal(task.nextRunAt)}`
    return `${String(index + 1)}. ${task.title} — ${describeAutomationSchedule(task.schedule)} — ${state} — ${next} — id ${task.id}`
  })
  return `共 ${String(tasks.length)} 条（${timeZone}）：\n${lines.join('\n')}`
}

function reviewMarkdown(heading: string, body: string): string {
  return `# ${heading}\n\n${body}`
}

function createDetail(
  intent: Extract<AutomationToolIntent, { action: 'create' }>,
  timeZone: string,
  permissionPreset: string,
): string {
  const permission = permissionPreset === 'danger-full-access'
    ? '完全访问（与侧栏新建的默认相同）'
    : permissionPreset
  return [
    `# ${intent.title}`,
    '',
    `- **时间** ${describeAutomationSchedule(intent.schedule)}（${timeZone}）`,
    `- **状态** ${intent.enabled ? '启用' : '创建后暂停'}`,
    `- **权限** ${permission}`,
    '',
    '**执行内容**',
    '',
    clip(intent.prompt, 240),
    '',
    '确认后会出现在侧栏「自动化」里，和在那边新建是同一份列表。',
  ].join('\n')
}

function nextRunLine(task: AutomationTask): string {
  if (!task.enabled) return '当前是暂停状态。'
  if (task.nextRunAt === null) return ''
  return `下次执行 ${formatLocal(task.nextRunAt)}。`
}

function cancelled(): ToolValue {
  return { outcome: '用户取消了，没有改动任何定时任务。', tasks: [] }
}

function clip(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

function formatLocal(at: number): string {
  const date = new Date(at)
  return `${String(date.getFullYear()).padStart(4, '0')}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
    + ` ${two(date.getHours())}:${two(date.getMinutes())}`
}

function two(value: number): string {
  return String(value).padStart(2, '0')
}

function presentTitle(action: AutomationToolAction): string {
  switch (action) {
    case 'list': return '查看自动化'
    case 'create': return '创建自动化'
    case 'update': return '更新自动化'
    case 'delete': return '删除自动化'
    case 'pause': return '暂停自动化'
    case 'resume': return '恢复自动化'
    case 'run': return '立即运行自动化'
  }
}

function presentInput(args: Record<string, unknown>): string {
  const title = textOf(args.title) ?? textOf(args.name) ?? textOf(args.id)
  return title ?? ''
}

async function askConfirm(
  ctx: Context,
  input: {
    readonly header: string
    readonly question: string
    readonly detail: string
    readonly exec: { readonly agent?: AskUserQuestionRequest['agent']; readonly signal: AbortSignal }
  },
): Promise<boolean> {
  const questions = ctx.get('userQuestions')
  if (questions === undefined) return false

  const deadline = AbortSignal.timeout(ASK_DEADLINE_MS)
  let answer: AskUserQuestionAnswer
  try {
    answer = await questions.ask({
      questions: [{
        id: QUESTION_ID,
        header: input.header,
        question: input.question,
        detail: input.detail,
        options: [
          { label: CONFIRM_LABEL, description: '写入侧栏那份自动化列表' },
          { label: CANCEL_LABEL, description: '这一次什么都不改' },
        ],
        multiSelect: false,
        // Binary decision card (确认执行 / 拒绝), not the numbered quiz.
        intent: { kind: 'plan-review', approve: CONFIRM_LABEL },
      }],
      ...input.exec.agent === undefined ? {} : { agent: input.exec.agent },
      signal: AbortSignal.any([input.exec.signal, deadline]),
    })
  } catch (error: unknown) {
    if (input.exec.signal.aborted) throw error
    if (deadline.aborted) return false
    // Plan-review's «去聊天里说» cancels the wait; that is a skip, not a fault.
    if (isAskCancelled(error)) return false
    ctx.logger.warn(
      'openlux: automation tool could not ask: %s',
      error instanceof Error ? error.message : String(error),
    )
    return false
  }

  const picked = answer.answers.find(row => row.id === QUESTION_ID)
  if (picked === undefined) return false
  const labels = [...picked.selected, ...picked.custom === undefined ? [] : [picked.custom]]
    .map(label => label.trim())
    .filter(label => label !== '')
  if (labels.includes(CANCEL_LABEL) && !labels.includes(CONFIRM_LABEL)) return false
  return labels.includes(CONFIRM_LABEL)
}

function isAskCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = (error as { code?: unknown }).code
  return code === 'ASK_ABORTED' || code === 'ASK_CANCELLED'
}
